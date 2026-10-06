// Core test suite (no browser needed):   gjs -m tests/run-tests.js
// - reads fixtures from test-data/fixtures (copies made by tools/refresh-fixtures.sh; never
//   test-data/Resource, which you edit by hand in the browser)
// - reads the real ../FLYFF-V19-SOURCE/Server/Resource READ-ONLY for the
//   round-trip test; nothing is ever written anywhere.
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, readBytes, listDir, loadFolder, openSource, exists } from './gjs-env.js';
import { bpServer } from './bp-server.js';

const FIXTURES = ROOT + '/test-data/fixtures/Resource';
const REAL = ROOT + '/../FLYFF-V19-SOURCE/Server/Resource';
let pass = 0, fail = 0;
function ok(cond, name, detail = '') {
  if (cond) { pass++; } else { fail++; print(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); }
}
function eq(a, b, name) { ok(a === b, name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function throws(fn, name) { try { fn(); ok(false, name, 'did not throw'); } catch (e) { ok(true, name); } }
function section(s) { print(`\n== ${s}`); }

function freshWorkspace() {
  const files = new Map();
  for (const [k, e] of loadFolder(FIXTURES)) files.set(k, openSource(e));
  return new FRE.Workspace(files).load();
}
const B = FRE.bytes;

// ---------------------------------------------------------------- lexer
section('lexer');
{
  const { Script, Lexer, atoi } = FRE.lexer;
  const toks = s => { const l = new Lexer(s); const o = []; for (let t = l.next(); t.type !== 'eof'; t = l.next()) o.push(t); return o; };
  eq(toks('"""abc"""').map(t => t.text).join('|'), '|abc|', '"""abc""" is 3 tokens');
  eq(toks('""""""').length, 3, '"""""" is 3 tokens');
  eq(toks('a//c\nb').map(t => t.text).join(','), 'a,b', '// comment ends at LF');
  eq(toks('a/*x*/b').map(t => t.text).join(','), 'a,b', '/* */ comment');
  eq(toks('0.075 1.5').map(t => t.text).join(','), '0.075,1.5', '. is not a delimiter in numbers');
  eq(toks('II_X,5)').map(t => t.text).join(' '), 'II_X , 5 )', 'identifier stops at delimiters');
  eq(toks('#define').length, 1, '#define is one token');
  const s = new Script('= -5 + 7 II_A II_B 0x1F 3000000000', { defines: new Map([['II_A', 12]]) });
  eq(s.getNumber().value, -1, '= is NULL_ID (-1)');
  eq(s.getNumber().value, -5, '-5 via two tokens');
  eq(s.getNumber().value, 7, '+ 7');
  eq(s.getNumber().value, 12, 'define resolves');
  const u = s.getNumber();
  ok(u.unresolved && u.value === 0, 'undefined name -> 0 and flagged');
  ok(s.diags.some(d => d.code === 'E_UNDEF' && d.name === 'II_B'), 'E_UNDEF diagnostic');
  eq(s.getNumber().value, 31, 'hex');
  const big = s.getNumber();
  ok(big.value === 2147483647 && big.overflow, 'atoi clamps to INT_MAX like MSVC');
  const us = new Script('"abc\r\nx');
  us.getToken();
  ok(us.diags.some(d => d.code === 'E_UNTERM_STR'), 'unterminated string flagged');
  eq(atoi('12ab').value, 12, 'atoi prefix');
}

// ---------------------------------------------------------------- numbers (display only)
section('numbers');
{
  const N = FRE.num;
  eq(N.group(1000000), '1,000,000', 'group 1,000,000');
  eq(N.group(-2500), '-2,500', 'group negative');
  eq(N.group(999), '999', 'no comma under 1000');
  eq(N.parseAmount('25,000').value, 25000, 'parse "25,000"');
  eq(N.parseAmount(' 1 000 000 ').value, 1000000, 'parse with spaces');
  eq(N.parseAmount('').value, null, 'empty = no value');
  ok(!N.parseAmount('12.5').ok && !N.parseAmount('abc').ok && !N.parseAmount('-1').ok, 'rejects decimals, text, below min');
  ok(!N.parseAmount('3000000000').ok, 'rejects above INT_MAX');
  eq(N.percent(375000, 3000000000), '0.0125%', 'percent of the drop scale');
  eq(N.percent(1000000, 1000000), '100%', 'percent 100');
}

// ---------------------------------------------------------------- bytes / SourceFile
section('bytes + SourceFile');
{
  const raw = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x00, 0xd8, 0x0d, 0x00, 0x0a, 0x00]);   // "A", lone surrogate, CRLF
  const f = new FRE.SourceFile('x.inc', raw);
  ok(!f.readOnly, 'UTF-16 with a lone surrogate round-trips');
  ok(B.bytesEqual(f.serialize(), raw), 'UTF-16 serialize identical');
  const raw2 = new Uint8Array([0x80, 0x9f, 0xff, 0x0d, 0x0a, 0x41]);
  const g = new FRE.SourceFile('x.txt', raw2);
  ok(!g.readOnly && B.bytesEqual(g.serialize(), raw2), 'bytes 0x80-0x9F survive (no windows-1252 remap)');
  ok(new FRE.SourceFile('o.inc', new Uint8Array([0xff, 0xfe, 0x41])).readOnly, 'odd-length UTF-16 is read-only');
  ok(new FRE.SourceFile('b.txt', new Uint8Array([0xef, 0xbb, 0xbf, 0x41])).readOnly, 'UTF-8 BOM is read-only');
  throws(() => g.applySplices([{ start: 0, end: 0, insert: 'é' }]), 'non-ASCII insert into byte file rejected');
  eq(JSON.stringify(B.scanLines('a\r\nb\nc\rd').map(l => l.eol)), JSON.stringify(['\r\n', '\n', '\r', '']), 'scanLines keeps each EOL');
}

// ---------------------------------------------------------------- round trip, every text file in the real Resource folder
section('round trip: every text file in Server/Resource (read-only)');
if (exists(REAL)) {
  let n = 0, bad = [];
  const walk = (dir, rel) => {
    for (const name of listDir(dir)) {
      const p = dir + '/' + name;
      if (GLib.file_test(p, GLib.FileTest.IS_DIR)) { walk(p, rel + name + '/'); continue; }
      const b = readBytes(p);
      const utf16 = b.length >= 2 && b[0] === 0xff && b[1] === 0xfe;
      if (!utf16 && b.subarray(0, 8192).includes(0)) continue;      // binary asset
      if (/\.(dds|dyo|o3d|ani|lnd|chr|tga|bmp|png|jpg|wav|ogg|mp3|dll|exe|xls|sys|dat)$/i.test(name)) continue;
      n++;
      const f = new FRE.SourceFile(name, b);
      if (f.readOnly || !B.bytesEqual(f.serialize(), b)) bad.push(rel + name + ' ' + f.readOnlyReasons.join(';'));
    }
  };
  walk(REAL, '');
  ok(bad.length === 0, `all ${n} text files round-trip byte-identical`, bad.slice(0, 5).join(' | '));
  print(`   checked ${n} text files`);
} else print('   (skipped: real Resource folder not found)');

// ---------------------------------------------------------------- golden numbers
section('golden numbers (fixtures)');
const W = freshWorkspace();
{
  eq(W.missing.length, 0, 'all required files present');
  eq(FRE.specItem.VALUES_PER_RECORD, 175, 'Spec_Item record = 175 values');
  eq(W.items.rows.length, 8067, 'Spec_Item rows');
  eq(W.items.items.size, 8067, 'Spec_Item items loaded');
  eq(W.items.stopped, null, 'Spec_Item parse did not stop');
  eq(W.items.skippedVer, 0, 'no rows above __VER 19');
  eq(W.chars.npcs.length, 594, 'NPC blocks across 3 files');
  eq(W.diags.filter(d => d.code === 'C_NO_OPEN_BRACE').length, 6, '6 NPCs without "{"');
  eq(W.diags.filter(d => d.severity === 'BLOCK').length, 0, 'no blocking problems in the current data');
  const cnt = {};
  for (const npc of W.chars.npcs) for (const s of npc.statements) cnt[s.cmd] = (cnt[s.cmd] || 0) + 1;
  // differential check against the independent Python oracle
  const [okp, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle.py ${FIXTURES}`);
  const oracle = JSON.parse(new TextDecoder().decode(out));
  eq(oracle.spec_rows, W.items.rows.length, 'oracle agrees: Spec_Item rows');
  for (const k of ['AddShopItem', 'AddVenderItem2', 'AddVendorItem', 'SetVenderType', 'AddVendorSlot', 'SetName', 'AddMenu']) {
    eq(cnt[k] || 0, oracle.character[k], `oracle agrees: ${k} count`);
  }
  // shop simulation: every tab of every NPC must match the independent Python port, item for item
  let mism = [], compared = 0;
  for (const npc of W.chars.npcs) {
    const exp = oracle.vendor[`${npc.file}|${npc.key}`];
    if (!exp) { mism.push('missing in oracle: ' + npc.key); continue; }
    const got = W.simulate(npc).tabs.map(t => t.entries.map(e => e.prop.id));
    compared++;
    if (JSON.stringify(got) !== JSON.stringify(exp)) mism.push(`${npc.key}: ${JSON.stringify(got).slice(0, 80)} vs ${JSON.stringify(exp).slice(0, 80)}`);
  }
  ok(mism.length === 0, `oracle agrees: shop contents of all ${compared} NPCs (order included)`, mism.slice(0, 3).join(' | '));
  eq(W.diags.filter(d => d.code === 'C_RULE_EMPTY').length, oracle.vendor_empty_rules, 'oracle agrees: number of AddVendorItem rules matching nothing');
  eq(W.diags.filter(d => d.code === 'C_RULE_EMPTY' && d.file !== 'character-school.inc').length, 0, 'all empty rules are in character-school.inc');
  eq(W.diags.filter(d => d.code === 'C_TAB_FULL').length, 3, 'KePe_Rocbin: 3 tabs over 100 items');
  const luiTab1 = W.simulate(W.chars.byKey.get('mafl_lui')[0]).tabs[1].entries;
  eq(luiTab1.length, 11, 'Lui tab 1: 10 generated + 1 fixed item');
  eq(luiTab1[luiTab1.length - 1].prop.item.define, 'II_GEN_FOO_COO_DDUKGUKHOT', 'fixed items come after generated ones');
  ok(W.diags.find(d => d.code === 'C_NO_TRADE' && d.severity === 'INFO' && /on purpose/.test(d.message)), 'SecretRoom Trade menu detected as disabled on purpose');
  ok(Object.keys(FRE.diagHelp).length > 20 && W.diags.every(d => FRE.diagHelp[d.code]), 'every diagnostic code has help text');

  const axe = W.itemById(W.defines.defines.get('II_WEA_AXE_RODNEY'));
  eq(axe && axe.name, 'Rodney Axe', 'item name resolved through propItem.txt.txt');
  const lui = W.chars.byKey.get('mafl_lui')[0];
  eq(lui.name, 'Lui', 'NPC name resolved through character.txt.txt');
}

// ---------------------------------------------------------------- edits
section('edits');
function editCase(name, fn) {
  const w = freshWorkspace();
  try { fn(w); } catch (e) { ok(false, name, e.message + '\n' + e.stack); }
}
const lui = w => w.chars.byKey.get('mafl_lui')[0];
const ci = w => w.files.get('character.inc');
const shopItems = (npc) => npc.statements.filter(s => s.cmd === 'AddShopItem');

editCase('add item', w => {
  const f = ci(w), before = f.serialize();
  w.apply('character.inc', FRE.shopOps.addItem(f.text, lui(w), 1, 'II_SYS_SYS_SCR_BLESSEDNESS', 5000), 'add');
  const items = shopItems(lui(w));
  eq(items.length, 2, 'add: Lui now has 2 AddShopItem');
  eq(items[1].args.item.define, 'II_SYS_SYS_SCR_BLESSEDNESS', 'add: new define');
  eq(items[1].args.cost.value, 5000, 'add: new cost');
  const ops = FRE.diff.diffLines(FRE.diff.splitKeepEol(f.originalText), FRE.diff.splitKeepEol(f.text));
  const ch = ops.filter(o => o.type !== 'eq');
  eq(ch.length, 1, 'add: exactly one line changed');
  eq(ch[0].type, 'add', 'add: it is an inserted line');
  eq(FRE.diff.splitKeepEol(f.text)[ch[0].b], '\t\tAddShopItem( 1, II_SYS_SYS_SCR_BLESSEDNESS, 5000 );\r\n', 'add: indent, style and CRLF copied');
  eq(f.serialize().length, before.length + 2 * FRE.diff.splitKeepEol(f.text)[ch[0].b].length, 'add: byte growth = inserted line only (UTF-16: 2 bytes/char)');
  eq(w.newBlocking().length, 0, 'add: no new blocking problems');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'add: undo restores identical bytes');
});

editCase('remove / price / tab', w => {
  const f = ci(w), before = f.serialize();
  let rec = shopItems(lui(w))[0];
  w.apply('character.inc', FRE.shopOps.setCost(f.text, rec, 1234), 'price');
  eq(shopItems(lui(w))[0].args.cost.value, 1234, 'price changed');
  rec = shopItems(lui(w))[0];
  w.apply('character.inc', FRE.shopOps.setCost(f.text, rec, null), 'no price');
  ok(!shopItems(lui(w))[0].args.cost, 'price removed');
  rec = shopItems(lui(w))[0];
  w.apply('character.inc', FRE.shopOps.setSlot(f.text, rec, 3), 'tab');
  eq(shopItems(lui(w))[0].args.slot.value, 3, 'tab changed');
  const changed = FRE.diff.diffLines(FRE.diff.splitKeepEol(f.originalText), FRE.diff.splitKeepEol(f.text)).filter(o => o.type !== 'eq');
  eq(changed.length, 2, 'price+tab edits touch exactly one line (1 del + 1 add)');
  rec = shopItems(lui(w))[0];
  w.apply('character.inc', FRE.shopOps.removeStatement(f.text, rec), 'remove');
  eq(shopItems(lui(w)).length, 0, 'removed');
  const ch2 = FRE.diff.diffLines(FRE.diff.splitKeepEol(f.originalText), FRE.diff.splitKeepEol(f.text)).filter(o => o.type !== 'eq');
  eq(ch2.length, 1, 'remove deletes exactly one line');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  while (w.undo());
  ok(B.bytesEqual(f.serialize(), before), 'undo all restores identical bytes');
  throws(() => FRE.shopOps.setSlot(f.text, shopItems(lui(w))[0], 4), 'tab 4 rejected by the edit op');
  throws(() => FRE.shopOps.setCost(f.text, shopItems(lui(w))[0], -1), 'negative price rejected');
});

editCase('chip shop add uses AddVenderItem2', w => {
  const waforu = w.chars.byKey.get('mafl_waforu')[0];
  const f = w.fileOfNpc(waforu);
  const n0 = waforu.statements.filter(s => s.cmd === 'AddVenderItem2').length;
  w.apply(f.name.toLowerCase(), FRE.shopOps.addItem(f.text, waforu, 0, 'II_SYS_SYS_SCR_BLESSEDNESS'), 'add chip');
  const after = w.chars.byKey.get('mafl_waforu')[0].statements.filter(s => s.cmd === 'AddVenderItem2');
  eq(after.length, n0 + 1, 'chip item added');
  ok(/\tAddVenderItem2\(0, II_SYS_SYS_SCR_BLESSEDNESS\);\r\n/.test(f.text), 'chip style "AddVenderItem2(0, II_X);" copied');
});

const waforu = w => w.chars.byKey.get('mafl_waforu')[0];
const changedLines = f => FRE.diff.diffLines(FRE.diff.splitKeepEol(f.originalText), FRE.diff.splitKeepEol(f.text)).filter(o => o.type !== 'eq');
const setType = (w, npcOf, type) => { const f = ci(w); w.apply('character.inc', FRE.shopOps.setShopType(f.text, npcOf(w), type), 'type'); };

editCase('shop type: Waforu Red Chip -> Penya -> Red Chip round trip', w => {
  const f = ci(w), before = f.serialize();
  const n2 = waforu(w).statements.filter(s => s.cmd === 'AddVenderItem2').length;
  setType(w, waforu, 0);
  eq(waforu(w).venderType, 0, 'Penya: no SetVenderType left');
  eq(waforu(w).statements.filter(s => s.cmd === 'AddVenderItem2').length, 0, 'Penya: no AddVenderItem2 left');
  eq(shopItems(waforu(w)).length, n2, 'Penya: every item became AddShopItem');
  ok(!/SetVenderType/.test(f.text), 'Penya: SetVenderType line removed (the only one in the file)');
  setType(w, waforu, 1);
  ok(B.bytesEqual(f.serialize(), before), 'Red Chip again: identical bytes to the original');
  w.undo();
  eq(waforu(w).venderType, 0, 'each conversion is one undo step');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'undo x2 restores identical bytes');
});

editCase('shop type: Waforu Red Chip -> Donate Chip', w => {
  const f = ci(w);
  setType(w, waforu, 2);
  eq(waforu(w).venderType, 2, 'Donate Chip set');
  const ch = changedLines(f);
  eq(ch.length, 2, 'exactly one line changes (1 del + 1 add)');
  ok(/\t\tSetVenderType\(2\);\r\n/.test(f.text), 'SetVenderType(2); written in place');
  eq(FRE.shopOps.setShopType(f.text, waforu(w), 2).length, 0, 'same type: no splices');
});

editCase('shop type: Lui Penya -> Red Chip', w => {
  const f = ci(w), before = f.serialize();
  const plan = FRE.shopOps.shopTypePlan(lui(w), 1, id => { const it = w.itemById(id); return it ? w.itemInfo(it) : null; });
  eq(plan.converted.length, 1, 'plan: one AddShopItem converted');
  eq(plan.droppedPrices.length, 1, 'plan: its Penya price is dropped');
  eq(plan.droppedPrices[0].cost, 1000000, 'plan: dropped price is 1,000,000');
  ok(plan.rulesIgnored > 0, 'plan: rules become ignored');
  setType(w, lui, 1);
  eq(lui(w).venderType, 1, 'Red Chip set');
  const lines = FRE.diff.splitKeepEol(f.text);
  const ch = changedLines(f);
  eq(ch.filter(o => o.type === 'add').length, 2, 'two lines added (SetVenderType + converted item)');
  eq(ch.filter(o => o.type === 'del').length, 1, 'one line removed (the old AddShopItem)');
  const added = ch.filter(o => o.type === 'add').map(o => lines[o.b]);
  ok(added.includes('\t\tSetVenderType(1);\r\n'), 'SetVenderType(1); with indent and CRLF');
  ok(added.includes('\t\tAddVenderItem2( 1, II_GEN_FOO_COO_DDUKGUKHOT );\r\n'), 'AddShopItem -> AddVenderItem2, inner spacing kept, price dropped');
  const at = lines.indexOf('\t\tSetVenderType(1);\r\n');
  ok(/AddMenu\(\s*MMI_TRADE/.test(lines[at - 1]), 'SetVenderType placed right after the last AddMenu');
  ok(w.diags.some(d => d.code === 'C_RULE_IGNORED' && d.npcKey === 'MaFl_Lui'), 'rules now flagged C_RULE_IGNORED');
  ok(!w.diags.some(d => d.code === 'C_FIXED_IN_CHIP'), 'no AddShopItem left in a chip shop');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  setType(w, lui, 0);
  const back = shopItems(lui(w));
  eq(back.length, 1, 'back to Penya: AddShopItem again');
  ok(!back[0].args.cost, 'back to Penya: the dropped price does not come back');
  while (w.undo());
  ok(B.bytesEqual(f.serialize(), before), 'undo all restores identical bytes');
});

editCase('SourceFile.spliceText', w => {
  const f = ci(w);
  const sp = FRE.shopOps.setShopType(f.text, lui(w), 2);
  const t = f.preview(sp);
  eq(f.dirty, false, 'preview does not change the file');
  w.apply('character.inc', sp, 'type');
  eq(f.text, t, 'preview == applied text');
  throws(() => FRE.SourceFile.spliceText('abcdef', [{ start: 1, end: 3, insert: '' }, { start: 2, end: 4, insert: '' }]), 'overlapping splices rejected');
  const sf = w.files.get('spec_item.txt');
  throws(() => sf.preview([{ start: 0, end: 0, insert: '\u00e9' }]), 'byte file: non-ASCII insert rejected');
  eq(sf.preview([{ start: 0, end: 0, insert: '//x\r\n' }]).slice(0, 5), '//x\r\n', 'byte file: a new line (CR LF) can be inserted');
});

// ---------------------------------------------------------------- chip prices (Spec_Item.txt dwReferValue1)
const spec = w => w.files.get('spec_item.txt');
const itemOfDef = (w, d) => w.itemById(w.defines.defines.get(d));
const chipOf = (w, d) => FRE.specItem.get(itemOfDef(w, d), 'dwReferValue1');

editCase('chip price: one token, round trip', w => {
  const f = spec(w), before = f.serialize();
  eq(w.isEditable('spec_item.txt'), true, 'Spec_Item.txt is editable');
  eq(chipOf(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), 50, 'Blessing of the Goddess costs 50 Red Chips (commit 93a02124)');
  const sp = FRE.itemOps.setChipPrice(f.text, itemOfDef(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), 75, w.defines.defines);
  eq(sp.length, 1, 'one splice');
  eq(f.text.slice(sp[0].start, sp[0].end), '50', 'the splice covers exactly the old price');
  w.apply('spec_item.txt', sp, 'chip');
  eq(chipOf(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), 75, 'new chip price parsed back');
  eq(f.serialize().length, before.length, 'same byte length (2 digits -> 2 digits)');
  eq(changedLines(f).length, 2, 'exactly one line changed');
  ok(FRE.diff.splitKeepEol(f.text).every(l => l.endsWith('\r\n') || !l.endsWith('\n')), 'CRLF kept');
  const wafTab = w.simulate(waforu(w)).tabs[1].entries.some(e => e.prop.item.define === 'II_SYS_SYS_SCR_BLESSEDNESS');
  ok(wafTab, 'shop simulation re-derived after the Spec_Item edit');
  w.apply('spec_item.txt', FRE.itemOps.setChipPrice(f.text, itemOfDef(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), null, w.defines.defines), 'none');
  eq(chipOf(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), -1, 'empty price writes "=" (no chip price)');
  ok(w.diags.some(d => d.code === 'C_CHIP_COST' && /BLESSEDNESS/.test(d.message)), 'no chip price -> C_CHIP_COST warning at Waforu');
  w.apply('spec_item.txt', FRE.itemOps.setChipPrice(f.text, itemOfDef(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), 50, w.defines.defines), 'back');
  ok(B.bytesEqual(f.serialize(), before), 'setting 50 again gives identical bytes');
  throws(() => FRE.itemOps.setChipPrice(f.text, itemOfDef(w, 'II_SYS_SYS_SCR_BLESSEDNESS'), 0), 'chip price 0 rejected');
  eq(w.clientCopiesNeeded().includes('Spec_Item.txt'), false, 'clean again: nothing to copy');
});

editCase('chip price is shared with the Donation Shop', w => {
  const id = itemOfDef(w, 'II_SYS_SYS_SCR_BLESSEDNESS').id;
  eq(FRE.itemOps.chipUses(w, id).length, 1, 'today only Waforu sells it for chips');
  const d = w.files.get('donationshop.inc');
  w.apply('donationshop.inc', FRE.donationOps.addItem(d.text, w.models.donation, w.models.donation.rows.find(r => /^[ -~]+$/.test(r.category)).category, 'II_SYS_SYS_SCR_BLESSEDNESS'), 'ds');
  const uses = FRE.itemOps.chipUses(w, id);
  eq(uses.length, 2, 'Waforu + Donation Shop');
  ok(uses.some(u => u.kind === 'donation') && uses.some(u => u.kind === 'npc' && u.npc.key === 'MaFl_Waforu'), 'both places named');
});

editCase('convert with prices = one undo step over two files', w => {
  const f = ci(w), sf = spec(w), b1 = f.serialize(), b2 = sf.serialize();
  const hot = itemOfDef(w, 'II_GEN_FOO_COO_DDUKGUKHOT');
  w.applyGroup([
    { file: 'character.inc', splices: FRE.shopOps.setShopType(f.text, lui(w), 1) },
    { file: 'spec_item.txt', splices: FRE.itemOps.setChipPrice(sf.text, hot, 30, w.defines.defines) },
  ], 'convert');
  eq(lui(w).venderType, 1, 'Lui is a Red Chip shop');
  eq(chipOf(w, 'II_GEN_FOO_COO_DDUKGUKHOT'), 30, 'Hot Ddukguk costs 30 chips');
  eq(w.simulate(lui(w)).tabs[1].entries.map(e => e.prop.item.define).join(), 'II_GEN_FOO_COO_DDUKGUKHOT', 'tab 1 sells it for chips');
  eq(w.history.length, 1, 'one history entry');
  eq(w.clientCopiesNeeded().sort().join(), 'Spec_Item.txt,character.inc', 'both files need the Client copy');
  w.undo();
  ok(B.bytesEqual(f.serialize(), b1) && B.bytesEqual(sf.serialize(), b2), 'one undo restores both files byte-for-byte');
  w.redo();
  eq(chipOf(w, 'II_GEN_FOO_COO_DDUKGUKHOT'), 30, 'redo re-applies both');
  throws(() => w.applyGroup([
    { file: 'character.inc', splices: [{ start: 0, end: 0, insert: '// x\r\n' }] },
    { file: 'spec_item.txt', splices: [{ start: 5, end: 1, insert: '' }] },
  ], 'bad'), 'a bad splice in any part is rejected');
  eq(w.history.length, 1, '...and nothing was applied');
});

editCase('convert to Penya with a price', w => {
  const f = ci(w);
  const waf = waforu(w);
  const rec = waf.statements.find(r => r.cmd === 'AddVenderItem2' && r.args.item.define === 'II_SYS_SYS_SCR_BLESSEDNESS');
  w.apply('character.inc', FRE.shopOps.setShopType(f.text, waf, 0, new Map([[rec.start, 25000]])), 'penya');
  const back = shopItems(waforu(w)).find(r => r.args.item.define === 'II_SYS_SYS_SCR_BLESSEDNESS');
  eq(back.args.cost && back.args.cost.value, 25000, 'typed Penya price written as AddShopItem(..., 25000)');
  ok(/AddShopItem\(1, II_SYS_SYS_SCR_BLESSEDNESS, 25000\);/.test(f.text), 'inner spacing kept, price appended');
});

// ---------------------------------------------------------------- Client/ sync (reads the real Client folder, never writes)
section('client sync');
{
  const CLIENT = ROOT + '/../FLYFF-V19-SOURCE/Client';
  const REALRES = ROOT + '/../FLYFF-V19-SOURCE/Server/Resource';
  if (exists(CLIENT + '/Spec_Item.txt')) {
    const open = (dir, n) => exists(dir + '/' + n) ? openSource({ name: n, path: dir + '/' + n }) : null;
    const M = n => FRE.clientSync.modeOf(open(REALRES, n), open(CLIENT, n));
    eq(M('character.inc'), 'identical', 'character.inc: Client copy identical');
    eq(M('DonationShop.inc'), 'identical', 'DonationShop.inc: Client copy identical');
    eq(M('Spec_Item.txt'), 'eol', 'Spec_Item.txt: same content, Client is LF');
    eq(M('character-etc.inc'), 'missing', 'character-etc.inc: no loose Client copy (client reads data.res)');
    // an edit made on the server copy, carried to the LF client copy
    const sf = open(REALRES, 'Spec_Item.txt'), cf = open(CLIENT, 'Spec_Item.txt');
    const wsLike = freshWorkspace();
    const it = wsLike.itemById(wsLike.defines.defines.get('II_SYS_SYS_SCR_BLESSEDNESS'));
    sf.applySplices(FRE.itemOps.setChipPrice(sf.text, it, 75, wsLike.defines.defines), 'chip');
    const out = FRE.clientSync.clientBytes('eol', sf, cf);
    const outText = FRE.bytes.bytesToBinaryString(out);
    ok(!outText.includes('\r'), 'Client bytes stay LF');
    eq(outText, sf.text.replace(/\r\n/g, '\n'), 'Client text == new server text with LF');
    const changed = FRE.diff.diffLines(FRE.diff.splitKeepEol(cf.text), FRE.diff.splitKeepEol(outText)).filter(o => o.type !== 'eq');
    eq(changed.length, 2, 'only the edited line differs in the Client copy (like commit 93a02124)');
    eq(FRE.clientSync.clientBytes('different', sf, cf), null, '"different" copies are never written');
  } else print('   (skipped: real Client folder not found)');
}

// ---------------------------------------------------------------- item tooltip (port of MakeToolTipText)
section('item tooltip');
{
  const T = d => { const t = FRE.itemTooltip.build(W, W.itemById(W.defines.defines.get(d))); return { game: t.game.map(l => l.map(s => s.text).join('')), editor: t.editor.map(l => l.map(s => s.text).join('')) }; };
  const str = T('II_SYS_SYS_SCR_STRONG_STR');
  eq(str.game.join(' | '), 'Flask of the Tiger | Required Level : 1 | Description: Increases your Strength (STR) by +20.  Lasts 1 hour.', 'buff scroll: game shows name, level, description only');
  ok(str.editor.includes('STR+20') && str.editor.some(l => /^Buff time: 1 hour/.test(l)), 'editor info: STR+20 and 1 hour buff');
  const sw = T('II_WEA_SWO_PETAL');
  eq(sw.game.slice(0, 4).join(' | '), 'Petal Sword | One-handed weapon. | Attack: 40 ~ 42 | Attack speed: Very fast', 'weapon: hands, attack, speed');
  ok(sw.game.includes('Required Level : 15'), 'weapon: required level');
  ok(T('II_CHR_SYS_SCR_SHOUTFULL15').game.includes('Time Left : 15 Day(s) 0 Hr(s) 0 Min(s) 0 Sec(s)'), 'dwCircleTime shown as Time Left');
  ok(T('II_GEN_REF_REF_FIRST').game.includes('Restore MP: 25'), 'refresher: Restore MP');
  eq(FRE.itemTooltip.cfmt('%s%s%%', 'Attack Speed', '+7'), 'Attack Speed+7%', 'rate format');
  let n = 0; for (const it of W.items.items.values()) { FRE.itemTooltip.build(W, it); n++; }
  eq(n, 8067, 'every item builds a tooltip');
}

// ---------------------------------------------------------------- Donation Shop (DonationShop.inc, commit 7d7df4f9)
section('donation shop');
{
  const m = W.models.donation;
  const [okp, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle.py ${FIXTURES}`);
  const oracle = JSON.parse(new TextDecoder().decode(out)).donation;
  eq(m.rows.length, 338, 'Donation Shop: 338 rows');
  eq(m.categories.length, 20, 'Donation Shop: 20 categories');
  eq(oracle.rows, m.rows.length, 'oracle agrees: rows');
  eq(JSON.stringify(oracle.categories), JSON.stringify(m.categories), 'oracle agrees: categories in order');
  eq(oracle.eol, 'lf', 'DonationShop.inc is LF (its own header comment says CRLF)');
  const dd = W.moduleDiags.donation;
  eq(dd.filter(d => d.code === 'DS_NO_PRICE').length, 9, '9 shields have no donate-chip price');
  eq(dd.filter(d => d.code === 'DS_CRASH').length, 0, 'the two crash shields are not listed (ae345504)');
  const TREE = ROOT + '/test-data/fixtures/Client/Client/DonationShopTree.inc';
  if (exists(TREE)) {
    const tree = FRE.donationTree.loadTree(openSource({ name: 'DonationShopTree.inc', path: TREE }));
    eq(tree.leaves.length, 20, 'tree: 20 leaf categories');
    eq(tree.pathOf('shields').join(' > '), 'All Items > Weapon Skins > Shields', 'tree: path of Shields (case-insensitive)');
    ok(m.categories.every(c => tree.isLeaf(c)), 'every category in the file is a leaf in the client tree');
    ok(!tree.isLeaf('Fashion') && !tree.isLeaf('All Items'), 'parents are not leaves');
  } else print('   (skipped tree: test-data/fixtures/Client/Client/DonationShopTree.inc not found)');
}

const ds = w => w.files.get('donationshop.inc');
const dsRows = (w, def) => w.models.donation.rows.filter(r => r.define === def);
editCase('donation: add / move / remove keep LF and bytes', w => {
  const f = ds(w), before = f.serialize();
  w.apply('donationshop.inc', FRE.donationOps.addItem(f.text, w.models.donation, 'Consumables', 'II_SYS_SYS_SCR_BLESSEDNESS'), 'add');
  eq(dsRows(w, 'II_SYS_SYS_SCR_BLESSEDNESS').length, 1, 'added');
  const ch = changedLines(f);
  eq(ch.length, 1, 'exactly one line added');
  eq(FRE.diff.splitKeepEol(f.text)[ch[0].b], '\tDSItem\t"Consumables"\tII_SYS_SYS_SCR_BLESSEDNESS\n', 'row style, indent and LF copied');
  const lines = FRE.diff.splitKeepEol(f.text);
  ok(/Consumables/.test(lines[ch[0].b - 1]), 'added at the end of its category');
  w.apply('donationshop.inc', FRE.donationOps.setCategory(f.text, dsRows(w, 'II_SYS_SYS_SCR_BLESSEDNESS')[0], 'Functional'), 'move');
  eq(dsRows(w, 'II_SYS_SYS_SCR_BLESSEDNESS')[0].category, 'Functional', 'moved to Functional');
  w.apply('donationshop.inc', FRE.donationOps.removeItem(f.text, dsRows(w, 'II_SYS_SYS_SCR_BLESSEDNESS')[0]), 'remove');
  ok(B.bytesEqual(f.serialize(), before), 'add + move + remove = identical bytes');
  w.apply('donationshop.inc', FRE.donationOps.removeItem(f.text, dsRows(w, 'II_SYS_SYS_SCR_PET_LIFE')[0]), 'remove');
  eq(w.models.donation.rows.length, 337, 'removed a real row');
  eq(changedLines(f).length, 1, 'remove deletes exactly one line');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  while (w.undo());
  ok(B.bytesEqual(f.serialize(), before), 'undo all restores identical bytes');
});
editCase('donation: crash shield is blocked', w => {
  const f = ds(w);
  w.apply('donationshop.inc', FRE.donationOps.addItem(f.text, w.models.donation, 'Shields', 'II_ARM_ARM_SHI_NEXUS'), 'add');
  ok(w.newBlocking().some(d => d.code === 'DS_CRASH'), 'Nexus Shield -> DS_CRASH (blocks saving)');
});
editCase('donation: undefined item', w => {
  const f = ds(w), i = f.text.indexOf('II_SYS_SYS_SCR_PET_LIFE');
  w.apply('donationshop.inc', [{ start: i, end: i + 23, insert: 'II_NOT_DEFINED_X' }], 'raw');
  ok(w.newBlocking().some(d => d.code === 'DS_UNDEF'), 'undefined II_ -> DS_UNDEF');
});
editCase('donation: missing closing brace', w => {
  const f = ds(w), i = f.text.lastIndexOf('}');
  w.apply('donationshop.inc', [{ start: i, end: i + 1, insert: '' }], 'raw');
  ok(w.newBlocking().some(d => d.code === 'DS_BRACES'), 'no closing } -> DS_BRACES');
});
editCase('donation: category not in the client tree', w => {
  const TREE = ROOT + '/test-data/fixtures/Client/Client/DonationShopTree.inc';
  if (!exists(TREE)) return;
  w.setDonationTree(FRE.donationTree.loadTree(openSource({ name: 'DonationShopTree.inc', path: TREE })));
  eq(w.diags.filter(d => d.code === 'DS_NO_LEAF').length, 0, 'no DS_NO_LEAF with the real tree');
  const f = ds(w);
  w.apply('donationshop.inc', FRE.donationOps.setCategory(f.text, dsRows(w, 'II_SYS_SYS_SCR_PET_LIFE')[0], 'Fashion'), 'move');
  const d = w.diags.find(x => x.code === 'DS_NO_LEAF');
  ok(d && d.severity === 'WARN', 'parent "Fashion" is not a leaf -> DS_NO_LEAF warning');
  eq(w.newBlocking().length, 0, 'DS_NO_LEAF does not block');
});

// ---------------------------------------------------------------- Battle Pass (BattlePass.inc, commit cc73ccdd)
section('battle pass');
{
  const m = W.models.battlepass;
  const [okp, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle.py ${FIXTURES}`);
  const o = JSON.parse(new TextDecoder().decode(out)).battlepass;
  eq(m.rows.BP1.length, 1, 'one pass row');
  eq(m.rows.BP4.length, 50, '50 reward levels');
  eq(m.rows.BP5.length, 863, '863 monsters');
  eq(o.monsters, m.rows.BP5.length, 'oracle agrees: monsters');
  eq(o.rewards, m.rows.BP4.length, 'oracle agrees: rewards');
  eq(JSON.stringify(o.passes), JSON.stringify(m.rows.BP1.map(r => [r.type.value, r.define, r.time.value])), 'oracle agrees: pass row');
  eq(JSON.stringify(o.levels), JSON.stringify(m.rows.BP4.map(r => r.level.value).sort((a, b) => a - b)), 'oracle agrees: levels');
  eq(o.eol, 'lf', 'BattlePass.inc is LF (its own header comment says CRLF)');
  const reach = m.rows.BP4.filter(r => r.level.value < 50).reduce((s, r) => s + r.points.value, 0);
  eq(reach, o.reach_top, 'oracle agrees: points to reach the top level (146,000)');
  // propMover port: every BP monster's level and rank match a column-based read of propMover.txt
  const mv = W.movers.movers;
  eq(mv.size, 1114, 'propMover.txt: 1114 movers');
  ok(m.rows.BP5.every(r => { const x = mv.get(r.id), y = o.mover_levels[r.define]; return x && y && x.level === y[0] && x.rankId === y[1]; }), 'oracle agrees: level and rank of every listed monster');
  eq(mv.get(W.defines.defines.get('MI_KINGSTER01')).name, 'Small Kingster', 'mover display name from propMover.txt.txt');
  eq(o.off_band, 0, 'oracle: every monster pays its band price');
  const codes = W.moduleDiags.battlepass.map(d => d.code);
  eq(JSON.stringify(codes), JSON.stringify(['BP_EXPIRED']), 'real file: only BP_EXPIRED (season 1 ended 2026-10-05; clock-dependent)');
  // dates: BattlePassConfigTime
  const se = FRE.battlePass.seasonEnd;
  eq(se(20261005).date.getDate(), 5, 'YYYYMMDD -> that day 00:00');
  eq(se(20260000), null, 'month 00 -> 0 (no season)');
  eq(se(19700101), null, 'year < 1971 -> 0');
  ok(se(20261131).rolled && se(20261131).date.getMonth() === 11, 'Nov 31 rolls over to Dec 1');
  eq(JSON.stringify(FRE.battlePass.band(43, 5)), JSON.stringify({ min: 18, max: 25, label: 'lv41-60' }), 'band: lv43 midboss 18-25 (17.5 rounds up)');
  eq(JSON.stringify(FRE.battlePass.band(145, 4)), JSON.stringify({ min: 120, max: 165, label: 'lv141+' }), 'band: lv145 boss 120-165');
}

const bpf = w => w.files.get('battlepass.inc');
const bpm = w => w.models.battlepass;
const bpNow = (w, y, mo, d) => { w.now = () => new Date(y, mo - 1, d); w.reparse('battlepass.inc'); };
editCase('battle pass: new season = date + nType on pass and all 50 rewards, one undo', w => {
  const f = bpf(w), before = f.serialize();
  const plan = FRE.battlePassOps.newSeasonPlan(bpm(w), 20261104);
  w.apply('battlepass.inc', plan.splices, 'season');
  eq(plan.rows.length, 50, '50 reward rows bumped');
  eq(bpm(w).pass.type.value, 2, 'pass nType 2');
  eq(bpm(w).pass.time.value, 20261104, 'end date written');
  ok(bpm(w).rows.BP4.every(r => r.type.value === 2), 'every reward has nType 2');
  eq(changedLines(f).length, 51 * 2, '51 lines changed (pass + 50 rewards), nothing else');
  bpNow(w, 2026, 10, 6);
  eq(w.moduleDiags.battlepass.length, 0, 'no problems after the new season (on 2026-10-06)');
  bpNow(w, 2026, 11, 4);
  ok(w.moduleDiags.battlepass.some(d => d.code === 'BP_EXPIRED'), 'expired at 2026-11-04 00:00 (start of the day)');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'one undo restores identical bytes');
  throws(() => FRE.battlePassOps.setEndDate(bpm(w).pass, 20261131), 'Nov 31 refused');
});
editCase('battle pass: ladder add / edit / remove', w => {
  const f = bpf(w), before = f.serialize();
  const r = FRE.battlePassOps.addReward(f.text, bpm(w), 'II_CHP_RED', 5, 4000);
  w.apply('battlepass.inc', r.splices, 'add');
  eq(r.level, 51, 'next level is 51');
  const ch = changedLines(f);
  eq(ch.length, 1, 'one line added');
  eq(FRE.diff.splitKeepEol(f.text)[ch[0].b], '\tBPReward\t1\t51\t4000\tII_CHP_RED                      5\t""\t""\t""\n', 'row copies tabs, the padded item column and LF');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  const top = bpm(w).ladder.get(51);
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardValue(top, 'qty', 7), 'qty');
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardTexture(bpm(w).ladder.get(51), 'icon', 'BattlePass_New.tga'), 'icon');
  eq(bpm(w).ladder.get(51).icon.text, 'BattlePass_New.tga', 'icon texture set');
  throws(() => FRE.battlePassOps.removeReward(f.text, bpm(w), bpm(w).ladder.get(20)), 'a middle level cannot be removed');
  throws(() => FRE.battlePassOps.setRewardValue(bpm(w).ladder.get(3), 'points', 10001), 'cost above 10,000 refused');
  w.apply('battlepass.inc', FRE.battlePassOps.removeReward(f.text, bpm(w), bpm(w).ladder.get(51)), 'remove');
  ok(B.bytesEqual(f.serialize(), before), 'add + edit + remove = identical bytes');
});
editCase('battle pass: monsters re-price / add / remove', w => {
  const f = bpf(w), before = f.serialize();
  const D = w.defines.defines, M = w.movers.movers;
  const row = bpm(w).rows.BP5.find(r => r.define === 'MI_KINGSTER01');
  w.apply('battlepass.inc', FRE.battlePassOps.setMonsterPoints(row, 14, 20), 'old price');
  const d = w.diags.find(x => x.code === 'BP_BAND');
  ok(d && d.severity === 'WARN' && /lv123 normal\) pays 14-20; the file's lv121-140 normal band is 60-80/.test(d.message), 'off-band price -> BP_BAND warning');
  const r2 = bpm(w).rows.BP5.find(r => r.define === 'MI_KINGSTER01');
  w.apply('battlepass.inc', FRE.battlePassOps.repriceMonster(r2, M.get(r2.id)), 'reprice');
  ok(B.bytesEqual(f.serialize(), before), 're-price back to the band = identical bytes');
  w.apply('battlepass.inc', FRE.battlePassOps.removeMonster(f.text, bpm(w).rows.BP5.find(r => r.define === 'MI_KINGSTER01')), 'remove');
  eq(changedLines(f).length, 1, 'remove deletes one line');
  const mv = M.get(D.get('MI_KINGSTER01')), b = FRE.battlePass.band(mv.level, mv.rankId);
  w.apply('battlepass.inc', FRE.battlePassOps.addMonster(f.text, bpm(w), mv, b.min, b.max, M), 'add');
  // its old row sat among the lv43 rows (listed before its level changed, c0a828d7); re-added, it goes in level order
  const ch2 = changedLines(f);
  eq(ch2.length, 2, 'remove + add = one line moved');
  const added = FRE.diff.splitKeepEol(f.text)[ch2.find(o => o.type === 'add').b];
  eq(added, '\tBPMonster\tMI_KINGSTER01             60\t80\t// lv123 normal - Small Kingster\n', 'same row text, comment from propMover');
  const lines = FRE.diff.splitKeepEol(f.text), at = lines.indexOf(added);
  ok(/lv123 /.test(lines[at - 1]) || /lv12[0-3] /.test(lines[at - 1]), 'placed after a monster of level <= 123');
  throws(() => FRE.battlePassOps.addMonster(f.text, bpm(w), M.get(D.get('MI_AIBATT1')), 4, 6, M), 'a listed monster cannot be added twice');
  throws(() => FRE.battlePassOps.setMonsterPoints(bpm(w).rows.BP5[0], 9, 3), 'min above max refused');
});
editCase('battle pass: add every unlisted real monster at its band price', w => {
  const f = bpf(w), before = f.serialize(), M = w.movers.movers;
  const list = [...M.values()].filter(x => FRE.battlePass.isMonster(x) && !bpm(w).monsters.has(x.id));
  eq(list.length, 32, '32 real monsters pay no points today (town NPCs, guards and pets excluded)');
  ok(!list.some(x => /^MI_PET_/.test(x.define) || x.rankId > 7), 'no pets, citizens or guards');
  w.apply('battlepass.inc', FRE.battlePassOps.addMonstersAtBand(f.text, bpm(w), list, M), 'all');
  eq(bpm(w).rows.BP5.length, 895, '895 monsters listed');
  eq(changedLines(f).length, 32, '32 lines added, nothing else changed');
  eq(w.diags.filter(d => d.code === 'BP_BAND').length, 0, 'all at their band price');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'one undo restores identical bytes');
});
editCase('battle pass: remove pets and town NPCs (never killed as monsters)', w => {
  const f = bpf(w), before = f.serialize(), M = w.movers.movers;
  const junk = bpm(w).rows.BP5.filter(r => M.get(r.id) && !FRE.battlePass.isMonster(M.get(r.id)));
  eq(junk.length, 106, 'season 1 lists 106 non-monsters');
  eq(junk.filter(r => /^MI_PET_/.test(r.define)).length, 98, '98 of them are pets');
  w.apply('battlepass.inc', FRE.battlePassOps.removeMonsters(f.text, junk), 'clean');
  eq(bpm(w).rows.BP5.length, 757, '757 real monsters left');
  eq(changedLines(f).length, 106, '106 lines removed, nothing else');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'one undo restores identical bytes');
});

// ---------------------------------------------------------------- season change, replayed with a port of the server logic
// tests/bp-server.js copies OnJoin / OnDied / AddBPUpdate / GiveBattlePassReward / OnDoBP / the speed check.
// Ana buys season 1, Ben stays free and keeps an unused pass, Cy uses a pass after season 1 ended.
section('battle pass: season change (server replay)');
{
  const w = freshWorkspace();
  const S = bpServer(FRE, w);
  const day = (y, m, d, hr = 12) => new Date(y, m - 1, d, hr);
  const s1 = S.config(w.models.battlepass);
  const ana = S.player('Ana'), ben = S.player('Ben'), cy = S.player('Cy');
  let now = day(2026, 9, 6);
  [ana, ben, cy].forEach(p => S.login(s1, p, now));
  ok([ana, ben, cy].every(p => p.level === 1 && p.type === 1 && p.enable === 0), 'S1 login: everyone on the free track, level 1');
  ana.passItems = 1; S.usePass(s1, ana, now);
  S.grindTo(s1, ana, 12, 'MI_KINGSTER01', now);
  S.grindTo(s1, ben, 8, 'MI_KINGSTER01', now);
  ben.passItems = 1;
  eq(ana.got.length, 12, 'S1 buyer at level 12 owns 12 rewards');
  ok(S.speedBonus(ana, now), 'S1 buyer has +20% speed');
  eq(ben.got.length, 0, 'S1 free player at level 8 owns no rewards');

  now = day(2026, 10, 5, 18);                       // season 1 over, no new season yet
  [ana, ben, cy].forEach(p => S.login(s1, p, now));
  ok(![ana, ben, cy].some(p => S.isBP(p, now)), 'after 5 Oct 00:00 nobody is on a pass');
  ok(!S.speedBonus(ana, now), 'the buyer\'s speed bonus is gone');
  eq(S.kill(s1, ana, 'MI_KINGSTER01', now), 0, 'kills earn no points');
  cy.passItems = 1; S.usePass(s1, cy, now);
  eq(cy.passItems, 0, 'a pass used while no season runs is used up...');
  eq(cy.got.length, 1, '...for the level 1 reward only');
  ok(!S.isBP(cy, now) && S.kill(s1, cy, 'MI_KINGSTER01', now) === 0, '...and Cy still earns nothing');

  // what-if: the new season is set BEFORE season 1 ends (players stay on season 1 until it does)
  {
    const w2 = freshWorkspace(), S2 = bpServer(FRE, w2);
    const p = S2.player('Dee'); S2.login(S2.config(w2.models.battlepass), p, day(2026, 10, 1));
    w2.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w2.models.battlepass, 20261105).splices, 's2');
    const early = S2.config(w2.models.battlepass);
    S2.login(early, p, day(2026, 10, 2));
    eq(p.type, 1, 'early switch: a player on season 1 stays there until it ends');
    p.passItems = 1; S2.usePass(early, p, day(2026, 10, 2));
    ok(p.passItems === 1 && /different battle pass season/.test(p.log.join('\n')), 'early switch: the pass is refused (not used up) until the player is on season 2');
    S2.login(early, p, day(2026, 10, 6));
    eq(p.type, 2, 'early switch: after season 1 ends the next login moves them to season 2');
  }

  // "Start new season" on 6 Oct, server restarted
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261105).splices, 'season 2');
  const s2 = S.config(w.models.battlepass);
  now = day(2026, 10, 6);
  [ana, ben, cy].forEach(p => S.login(s2, p, now));
  ok([ana, ben, cy].every(p => p.level === 1 && p.points === 0 && p.type === 2 && p.enable === 0), 'S2 login: everyone starts season 2 at level 1 on the free track (S1 purchase does not carry over)');
  eq(ana.got.length, 12, 'S1 rewards already given are kept');
  ok(!S.speedBonus(ana, now), 'no speed bonus until the pass is bought again');
  S.grindTo(s2, ana, 5, 'MI_KINGSTER01', now);
  eq(ana.got.length, 12, 'S2 free-track levels pay nothing yet');
  ana.passItems = 1; S.usePass(s2, ana, now);
  eq(ana.got.length, 17, 'buying again back-pays S2 levels 1-5');
  ok(S.speedBonus(ana, now), 'speed bonus back');
  S.grindTo(s2, ben, 4, 'MI_KINGSTER01', now);
  S.usePass(s2, ben, now);
  ok(ben.passItems === 0 && ben.got.length === 4 && ben.enable === 1, 'an unused pass bought in S1 unlocks S2 (same item, 2f783090)');
  S.grindTo(s2, ana, 6, 'MI_KINGSTER01', now);
  eq(ana.got.length, 18, 'bought track: each new level pays on arrival');

  // alternative: re-run season 1 by changing only the date (nType stays 1) - same effect today
  {
    const w3 = freshWorkspace(), S3 = bpServer(FRE, w3);
    const p = S3.player('Eve'); S3.login(S3.config(w3.models.battlepass), p, day(2026, 9, 6));
    p.passItems = 1; S3.usePass(S3.config(w3.models.battlepass), p, day(2026, 9, 6));
    w3.apply('battlepass.inc', FRE.battlePassOps.setEndDate(w3.models.battlepass.pass, 20261105), 'date');
    S3.login(S3.config(w3.models.battlepass), p, day(2026, 10, 6));
    ok(p.type === 1 && p.level === 1 && p.enable === 0, 'date-only re-run: season 1 starts over, buyers must buy again');
  }
}

const bpRaw = (w, find, repl) => {
  const f = bpf(w), i = f.text.indexOf(find);
  if (i < 0) throw new Error('fixture text not found: ' + find);
  w.apply('battlepass.inc', [{ start: i, end: i + find.length, insert: repl }], 'raw');
};
function bpMutation(name, code, sev, find, repl) {
  editCase('battle pass: ' + name, w => {
    bpRaw(w, find, repl);
    const hit = w.diags.find(d => d.code === code);
    ok(hit && hit.severity === sev, `${name} -> ${code} ${sev}`, JSON.stringify(w.moduleDiags.battlepass.map(d => d.code)));
    if (sev === 'BLOCK') ok(w.newBlocking().some(d => d.code === code), `${code} blocks saving`);
  });
}
bpMutation('duplicate level', 'BP_DUP_LEVEL', 'BLOCK', '\tBPReward\t1\t2\t2000', '\tBPReward\t1\t1\t2000');
bpMutation('missing level', 'BP_LEVEL_GAP', 'BLOCK', '\tBPReward\t1\t2\t2000', '\tBPReward\t1\t99\t2000');
bpMutation('reward of another season', 'BP_TYPE_ROW', 'WARN', '\tBPReward\t1\t7\t2000', '\tBPReward\t2\t7\t2000');
bpMutation('no reward matches the pass', 'BP_TYPE', 'BLOCK', 'BPItem\t\t1\t', 'BPItem\t\t3\t');
bpMutation('invalid date', 'BP_DATE', 'BLOCK', 'BPPASS1\t20261005', 'BPPASS1\t20261305');
bpMutation('cost over 10,000', 'BP_CLAMP', 'WARN', '\tBPReward\t1\t2\t2000', '\tBPReward\t1\t2\t20000');
bpMutation('unknown reward item', 'E_UNDEF', 'BLOCK', 'II_SYS_SYS_SCR_VIP_30', 'II_SYS_SYS_SCR_VIP_99');
bpMutation('duplicate monster', 'BP_DUP_MONSTER', 'BLOCK', 'BPMonster\tMI_AIBATT2 ', 'BPMonster\tMI_AIBATT1 ');
bpMutation('not a monster', 'BP_NO_MONSTER', 'BLOCK', 'BPMonster\tMI_AIBATT2 ', 'BPMonster\t14000 ');
bpMutation('unquoted texture', 'BP_FORMAT', 'BLOCK', '10\t""\t""\t""\n\tBPReward\t1\t2\t', '10\tx\t""\t""\n\tBPReward\t1\t2\t');
bpMutation('banner texture', 'BP_LOGO_UNUSED', 'INFO', '10\t""\t""\t""\n\tBPReward\t1\t2\t', '10\t"x.tga"\t""\t""\n\tBPReward\t1\t2\t');
editCase('battle pass: missing closing brace', w => {
  const f = bpf(w), i = f.text.lastIndexOf('}');
  w.apply('battlepass.inc', [{ start: i, end: i + 1, insert: '' }], 'raw');
  ok(w.newBlocking().some(d => d.code === 'BP_BRACES'), 'no closing } -> BP_BRACES');
});
editCase('battle pass: textures checked against Client/Theme', w => {
  w.setClientTheme(['BattlePass_New.tga']);
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardTexture(bpm(w).ladder.get(4), 'rarity', 'BattlePass_New.tga'), 'ok');
  eq(w.diags.filter(d => d.code === 'BP_TEXTURE').length, 0, 'existing texture: no warning');
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardTexture(bpm(w).ladder.get(4), 'icon', 'Nope.tga'), 'missing');
  eq(w.diags.filter(d => d.code === 'BP_TEXTURE').length, 1, 'missing texture -> BP_TEXTURE');
});

// ---------------------------------------------------------------- mutations: each rule must fire as a NEW block
section('exchange');
{
  const m = W.models.exchange, X = FRE.exchange;
  const [okp, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle.py ${FIXTURES}`);
  const o = JSON.parse(new TextDecoder().decode(out)).exchange;
  eq(o.eol, 'crlf', 'Exchange_Script.txt is CRLF');
  const loaded = m.menus.filter(x => !x.isJunk);
  eq(m.menus.reduce((a, x) => a + x.sets.length, 0), 309, '309 SET blocks read');
  eq(loaded.reduce((a, x) => a + x.sets.length, 0), 285, '285 of them in real menus (24 are read inside junk menus, id -1)');
  eq(o.menus.reduce((a, x) => a + x.sets.length, 0), 309, 'oracle: 309 recipes');
  // menus the server reads in step: same recipes, lines, chances and flags as the brace-tree read
  const byName = new Map(loaded.map(x => [x.name, x]));
  const lost = new Set(loaded.flatMap(x => (x.lost || []).map(y => y.name)));
  let compared = 0; const mism = [];
  for (const om of o.menus) {
    if (om.unknown.length || lost.has(om.name)) continue;
    const jm = byName.get(om.name);
    if (!jm) { mism.push('missing ' + om.name); continue; }
    const js = jm.sets.map(st => ({ cond: st.condition.map(l => [l.item.name, l.num.value]), pay: st.pay.map(l => [l.item.name, l.num.value, l.prob.value, ...(l.flag ? [l.flag.value] : [])]), paynum: st.payNum && st.payNum.value }));
    if (JSON.stringify(js) !== JSON.stringify(om.sets)) mism.push(om.name);
    compared++;
  }
  ok(!mism.length && compared === 72, `oracle agrees: recipes of all ${compared} in-step menus`, mism.slice(0, 3).join(' | '));
  // menus with SET_SMELT / SET_ENCHANT_MOVE: the first of each run starts an out-of-step chain, the rest are lost
  const unknown = o.menus.filter(x => x.unknown.length).map(x => x.name);
  const heads = loaded.filter(x => x.unknownSets.length).map(x => x.name);
  eq(JSON.stringify(heads), JSON.stringify(['MMI_BEHEMOTHSMELTEVENT_TWOSWORD', 'MMI_CHRISTMASENCHANTEVENTMENU', 'MMI_SEAKINGLOOKCHANGEMENU']), 'three out-of-step chains');
  ok(unknown.every(n => heads.includes(n) || lost.has(n)), 'every menu with an unknown SET_ block is a chain head or lost');
  ok(['MMI_MAPLE_TRADE', 'MMI_EVENT_2012HAPPYMONEYMENU', 'MMI_SEAKINGMASKCHANGEMENU'].every(n => lost.has(n) && !byName.has(n)), 'normal menus swallowed by a chain are lost (never loaded)');
  const codes = {}; for (const d of [...W.moduleDiags.exchange].sort((a, b) => a.code < b.code ? 1 : -1)) codes[d.code] = (codes[d.code] || 0) + 1;
  eq(JSON.stringify(codes), JSON.stringify({ EX_OUT_OF_STEP: 3, EX_NO_NPC: 24 }), 'real file: 3 out-of-step chains, 24 menus no NPC opens');
  const col = byName.get('MMI_COLLECT01');
  eq(col.sets.length, 8, "Collins: 8 recipes (15091d5f)");
  ok(W.npcsByMenu().get(col.mmi.value).some(n => /Collins/.test(n)), 'Collins opens MMI_COLLECT01');
  ok(col.sets.every(st => X.sameList(st.condition, st.remove)), 'Collins: REMOVE == CONDITION in every recipe');

  // PAY: running sum out of 1,000,000 (Load_Script)
  const P = (...ps) => X.effectivePay(ps.map((p, i) => ({ item: { name: 'I' + i }, prob: { value: p } })));
  const probs = r => r.lines.map(x => x.prob).join(',');
  eq(probs(P(1000000)), '1000000', 'exact 100%');
  eq(probs(P(600000, 600000, 5)), '600000,400000', 'over: the crossing line is cut, later lines dropped');
  eq(probs(P(500000, 500000, 7)), '500000,500000', 'exactly 100% then more: later lines dropped');
  eq(probs(P(300000, 200000)), '300000,700000', 'under: the last line gets the rest');
  ok(P().crash, 'empty PAY: crash (vecPayItem[-1])');
  eq(X.rewardsGiven({ payNum: { value: 0 }, paid: P(500000, 500000) }), 2, 'PAY 0 gives every line');
  eq(X.rewardsGiven({ payNum: { value: 5 }, paid: P(500000, 500000) }), 2, 'PAY 5 with 2 lines gives 2');

  // small files through the same loader
  const D = W.defines.defines;
  const load = t => { const f = new FRE.SourceFile('Exchange_Script.txt', FRE.bytes.binaryStringToBytes(t)); const mm = X.loadExchange(f, { defines: D }); return { m: mm, d: X.validateExchange(mm, { items: W.items.items, npcsByMenu: null, packMax: it => FRE.specItem.get(it, 'dwPackMax') }) }; };
  const set = (pay = 'II_SYS_SYS_SCR_HOLY 1 1000000', cond = 'II_SYS_SYS_SCR_SCRAPTOPAZ 5') => `SET TID_GAME_COLLECT_COND01 { CONDITION { ${cond} } PAY 1 { ${pay} } }\n`;
  let r = load(`MMI_COLLECT01 {\n${set().repeat(31)}}\n`);
  eq(r.m.menus[0].sets.filter(x => !x.dropped).length, 30, '31 SETs: 30 kept');
  ok(r.d.some(d => d.code === 'EX_SET_CAP'), '31 SETs -> EX_SET_CAP');
  r = load(`MMI_COLLECT01 { ${set()} }\nMMI_COLLECT01 { ${set('II_SYS_SYS_SCR_AMPESS 1 1000000')} }\n`);
  eq(r.m.byId.get(D.get('MMI_COLLECT01')).sets[0].pay[0].item.name, 'II_SYS_SYS_SCR_HOLY', 'duplicate menu: the first wins');
  ok(r.d.some(d => d.code === 'EX_DUP_MENU'), 'duplicate menu -> EX_DUP_MENU');
  r = load(`MMI_COLLECT01 { ${set('II_SYS_SYS_SCR_HOLY 1 1000000 2', 'PENYA 1000')} }`);
  const s0 = r.m.menus[0].sets[0];
  ok(s0.condition[0].item.penya && s0.condition[0].item.value === D.get('II_GOLD_SEED1'), 'PENYA = II_GOLD_SEED1');
  eq(s0.pay[0].flag.value, 2, 'optional 4th PAY value = flag');
  eq(r.d.length, 0, 'clean small file: no problems');
  r = load(`MMI_COLLECT01 { ${set('II_NOPE 1 1000000')} }`);
  ok(r.d.some(d => d.code === 'EX_UNDEF' && d.severity === 'BLOCK'), 'undefined reward -> EX_UNDEF BLOCK');
  eq(r.m.menus[0].sets[0].pay[0].item.value, -1, 'GetDefineNum: unknown name -> -1');
  r = load(`MMI_COLLECT01 { SET TID_GAME_COLLECT_COND01 { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 5 } PAY 1 { } } }`);
  ok(r.d.some(d => d.code === 'EX_PAY_EMPTY'), 'empty PAY -> EX_PAY_EMPTY');
  r = load(`MMI_COLLECT01 { ${set('II_SYS_SYS_SCR_HOLY 1 900000 II_SYS_SYS_SCR_AMPESS 1 300000')} `);
  ok(r.d.some(d => d.code === 'EX_FORMAT' && d.severity === 'BLOCK'), 'missing } -> EX_FORMAT BLOCK (server hangs)');
  ok(r.d.some(d => d.code === 'EX_PROB_OVER'), '120% -> EX_PROB_OVER');
  r = load(`MMI_COLLECT01 { SET_SMELT TID_GAME_COLLECT_COND01 { CONDITION { II_SYS_SYS_SCR_SCRAPTOPAZ 1 } PAY 1 { II_SYS_SYS_SCR_HOLY 1 1000000 } } }\nMMI_EVENT_MAY { ${set()} }`);
  ok(r.d.some(d => d.code === 'EX_OUT_OF_STEP' && /MMI_EVENT_MAY/.test(d.message)), 'SET_SMELT swallows the next menu');
}

const exf = w => w.files.get('exchange_script.txt');
const exm = (w, name) => w.models.exchange.menus.find(x => x.name === name && !x.isJunk);
const XO = FRE.exchangeOps;
editCase('exchange: ingredient qty mirrors REMOVE, one undo', w => {
  const f = exf(w), before = f.serialize();
  const st = exm(w, 'MMI_COLLECT01').sets[0];
  w.apply('exchange_script.txt', XO.setIngredientQty(st, st.condition[0], 450), 'qty');
  const st2 = exm(w, 'MMI_COLLECT01').sets[0];
  eq(st2.condition[0].num.value, 450, 'CONDITION changed');
  eq(st2.remove[0].num.value, 450, 'REMOVE mirrored');
  eq(changedLines(f).length, 4, 'two lines changed');
  eq((f.text.match(/\r\n/g) || []).length, (f.text.match(/\n/g) || []).length, 'CRLF kept');
  w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'undo restores identical bytes');
});
editCase('exchange: add / remove ingredient and reward', w => {
  const f = exf(w), before = f.serialize();
  let st = exm(w, 'MMI_COLLECT01').sets[1];
  w.apply('exchange_script.txt', XO.addIngredient(f.text, st, 'II_SYS_SYS_SCR_SCRAPDIAMOND', 3), 'add ing');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  eq(st.condition.length, 6, 'ingredient added');
  ok(FRE.exchange.sameList(st.condition, st.remove), 'REMOVE still equals CONDITION');
  eq(changedLines(f).length, 2, 'two lines added');
  w.apply('exchange_script.txt', XO.addReward(f.text, st, 'II_SYS_SYS_SCR_AMPESS', 2, 500000), 'add pay');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  ok(w.moduleDiags.exchange.some(d => d.code === 'EX_PROB_OVER'), '150% -> EX_PROB_OVER');
  w.apply('exchange_script.txt', XO.evenChances(st), 'even');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  eq(st.pay.map(l => l.prob.value).join(','), '500000,500000', 'spread evenly');
  ok(!w.moduleDiags.exchange.some(d => d.code.startsWith('EX_PROB')), 'no chance warning after spreading');
  w.apply('exchange_script.txt', XO.removeReward(f.text, st, st.pay[1]), 'rm pay');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  throws(() => XO.removeReward(f.text, st, st.pay[0]), 'last reward cannot be removed');
  w.apply('exchange_script.txt', XO.removeIngredient(f.text, st, st.condition[5]), 'rm ing');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  eq(st.condition.length, 5, 'ingredient removed');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  for (let i = 0; i < 5; i++) w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'five undos restore identical bytes');
});
editCase('exchange: copy, move and remove a recipe', w => {
  const f = exf(w), before = f.serialize();
  let col = exm(w, 'MMI_COLLECT01');
  const c = XO.copySet(f.text, col.sets[7]);
  ok(!c.rebuilt, 'Collins recipe is ASCII: copied as is');
  w.apply('exchange_script.txt', c.splices, 'copy');
  col = exm(w, 'MMI_COLLECT01');
  eq(col.sets.length, 9, 'copied: 9 recipes');
  w.apply('exchange_script.txt', XO.moveSet(f.text, col, col.sets[0], 1).splices, 'move');
  col = exm(w, 'MMI_COLLECT01');
  eq(col.sets[0].pay[0].item.name, 'II_SYS_SYS_SCR_CHATCOLOR_3D', 'moved down: recipe 2 is now first');
  eq(col.sets[1].pay[0].item.name, 'II_SYS_SYS_SCR_NAMECOLOR_3D', 'moved down: recipe 1 is now second');
  w.apply('exchange_script.txt', XO.removeSet(f.text, col.sets[8]), 'remove');
  eq(exm(w, 'MMI_COLLECT01').sets.length, 8, 'removed');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  w.undo(); w.undo(); w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'undo restores identical bytes');
  // a recipe with EUC-KR comments is rebuilt from its values (comments dropped)
  const may = exm(w, 'MMI_EVENT_MAY');
  const cm = XO.copySet(f.text, may.sets[0]);
  ok(cm.rebuilt, 'non-ASCII recipe is rebuilt');
  w.apply('exchange_script.txt', cm.splices, 'copy may');
  const m2 = exm(w, 'MMI_EVENT_MAY');
  const vals = st => JSON.stringify([st.text.name, st.resultMsg.map(x => x.name), st.condition.map(l => [l.item.name, l.num.value]), st.remove.map(l => [l.item.name, l.num.value]), st.pay.map(l => [l.item.name, l.num.value, l.prob.value]), st.payNum.value]);
  eq(vals(m2.sets[1]), vals(m2.sets[0]), 'rebuilt copy has the same values');
});

// ---------------------------------------------------------------- exchange simulator
// src/loaders/exchange-sim.js copies CExchange::ResultExchange and what it calls (CheckCondition,
// GetPayItemList + xRandom, IsFull, RemoveItemA, CreateItem -> CItemContainer::Add) and the
// client's CWndDialogEvent::ReceiveResult (15091d5f).
section('exchange simulator (pressing OK in the exchange window)');
const XS = FRE.exchangeSim;
const xsEnv = w => XS.envFromWorkspace(w);
const xsTable = text => XS.serverTable(FRE.exchange.loadExchange(new FRE.SourceFile('Exchange_Script.txt', FRE.bytes.binaryStringToBytes(text)), { defines: W.defines.defines }));
const xsId = n => W.defines.defines.get(n) >>> 0;
{
  const env = xsEnv(W), D = W.defines.defines;
  const TOPAZ = xsId('II_SYS_SYS_SCR_SCRAPTOPAZ'), HOLY = xsId('II_SYS_SYS_SCR_HOLY'), AMP = xsId('II_SYS_SYS_SCR_AMPESS'), BLESS = xsId('II_SYS_SYS_SCR_BLESSEDNESS');
  const PET = D.get('MMI_PET_RES01');
  // one recipe in a menu that is not Collins (Collins has its own chat-line replies)
  const one = (pay, { cond = 'II_SYS_SYS_SCR_SCRAPTOPAZ 5', n = 1, msg = '' } = {}) =>
    xsTable(`MMI_PET_RES01 { SET TID_GAME_COLLECT_COND01 { ${msg} CONDITION { ${cond} } PAY ${n} { ${pay} } } }`);
  const stub = vals => { let i = 0; return { random: () => vals[i++] }; };
  const fresh = () => XS.rng(1);

  // xRand / xRandom
  const r0 = XS.rng(0);
  eq([r0.rand(), r0.rand(), r0.rand()].join(), '12345,3554416254,2802067423', 'xRand: g_next = g_next * 1103515245 + 12345 (32-bit)');
  eq(XS.rng(0).random(1000000), 12345, 'xRandom(n) = xRand() % n');

  // GetPayItemList
  const two = one('II_SYS_SYS_SCR_HOLY 1 300000 II_SYS_SYS_SCR_AMPESS 1 700000').find(PET).sets[0];
  eq(XS.payList(two, stub([299999]))[0].id, HOLY, 'roll 299,999 < 300,000 -> first line');
  eq(XS.payList(two, stub([300000]))[0].id, AMP, 'roll 300,000 -> second line (nRandom < nSumProb is strict)');
  const two2 = one('II_SYS_SYS_SCR_HOLY 1 300000 II_SYS_SYS_SCR_AMPESS 1 700000', { n: 2 }).find(PET).sets[0];
  eq(XS.payList(two2, stub([0, 5])).map(x => x.id).join(), `${HOLY},${AMP}`, 'PAY 2: the picked line is taken out, then a new roll over the 700,000 left');
  const all = one('II_SYS_SYS_SCR_HOLY 1 333334 II_SYS_SYS_SCR_AMPESS 1 333333 II_SYS_SYS_SCR_BLESSEDNESS 1 333333', { n: 0 }).find(PET).sets[0];
  eq(XS.payList(all, fresh()).length, 3, 'PAY 0 gives every line');
  {
    const t = one('II_SYS_SYS_SCR_HOLY 1 250000 II_SYS_SYS_SCR_AMPESS 1 750000'), r = fresh();
    let holy = 0; const N = 200000;
    for (let i = 0; i < N; i++) if (XS.payList(t.find(PET).sets[0], r)[0].id === HOLY) holy++;
    ok(Math.abs(holy / N - 0.25) < 0.005, 'PAY 1 over 200,000 rolls: 25% / 75% as written', `${holy / N}`);
  }

  // CheckCondition
  const t5 = one('II_SYS_SYS_SCR_HOLY 1 1000000');
  let p = XS.player({ items: [{ id: TOPAZ, num: 4 }] });
  let res = XS.resultExchange(env, t5, p, PET, 0, fresh());
  eq(res.result, 'CONDITION_FAILED', '4 of 5 Topaz -> CONDITION_FAILED');
  eq(XS.countOf(p, TOPAZ), 4, 'nothing is taken on a failed check');
  eq(res.texts[0], 'In order to exchange items, you need Topaz Piece x5.', 'no RESULTMSG: the server sends TID_EXCHANGE_FAIL per missing item');
  eq(XS.clientReply(env, t5, PET, 0, res).box, null, 'no RESULTMSG pair: no message box');
  eq(XS.resultExchange(env, t5, p, PET, 1, fresh()).result, 'FAILED', 'a recipe position the server does not have -> FAILED');
  p = XS.player({ items: [{ id: TOPAZ, num: 5 }, { id: AMP, num: 1, busy: true }] });
  res = XS.resultExchange(env, t5, p, PET, 0, fresh());
  ok(res.result === 'CONDITION_FAILED' && res.missing[0].have === 0, 'any item in a trade / private shop: GetItemNum counts 0 of everything');
  p = XS.player({ items: [{ id: TOPAZ, num: 5 }] }); p.slots[200] = { id: AMP, num: 1, flag: 0, charged: 1 };
  eq(XS.resultExchange(env, t5, p, PET, 0, fresh()).result, 'CONDITION_FAILED', 'an item stranded in a locked bag slot (expired Bag Expansion) blocks every exchange');
  p = XS.player({ equip: [{ id: TOPAZ, num: 5 }] });
  res = XS.resultExchange(env, t5, p, PET, 0, fresh());
  ok(res.result === 'SUCCESS' && !p.equip[0], 'GetItemNum and RemoveItemA include the equipment slots');
  const tp = one('II_SYS_SYS_SCR_HOLY 1 1000000', { cond: 'PENYA 1000' });
  eq(XS.resultExchange(env, tp, XS.player({ gold: 999, items: [{ id: xsId('II_SYS_SYS_SCR_PERIN'), num: 5 }] }), PET, 0, fresh()).result, 'CONDITION_FAILED', 'PENYA: only gold counts, Perin items do not');
  p = XS.player({ gold: 1500 });
  eq(XS.resultExchange(env, tp, p, PET, 0, fresh()).result, 'SUCCESS', 'PENYA 1000 with 1,500 gold -> SUCCESS');
  eq(p.gold, 500, 'PENYA: 1,000 gold taken');
  const tAll = one('II_SYS_SYS_SCR_HOLY 1 1000000', { cond: 'II_SYS_SYS_SCR_SCRAPTOPAZ =' });
  p = XS.player({ items: [{ id: TOPAZ, num: 7 }] });
  res = XS.resultExchange(env, tAll, p, PET, 0, fresh());
  ok(res.result === 'SUCCESS' && XS.countOf(p, TOPAZ) === 0 && res.taken[0].num === 7, 'ingredient quantity -1 (=): the check passes and RemoveAllItem takes ALL of them');

  // IsFull
  p = XS.stockedPlayer(env, t5.find(PET).sets[0], { free: 0 });
  eq(XS.resultExchange(env, t5, p, PET, 0, fresh()).result, 'SUCCESS', '0 free slots, but the Topaz stack is used up: that slot counts as free');
  p = XS.player({ unlocked: 2, items: [{ id: TOPAZ, num: 10 }, { id: XS.FILLER, num: 1 }] });
  res = XS.resultExchange(env, t5, p, PET, 0, fresh());
  eq(res.result, 'INVENTORY_FAILED', '0 free slots and the stack stays -> INVENTORY_FAILED');
  eq(XS.countOf(p, TOPAZ), 10, 'INVENTORY_FAILED takes nothing');
  eq(XS.clientReply(env, t5, PET, 0, res).box, 'Inventory is full. Please make room and try again.', 'full bag: TID_GAME_LACKSPACE box');
  p = XS.stockedPlayer(env, all, { free: 0 });
  res = XS.resultExchange(env, one('II_SYS_SYS_SCR_HOLY 1 333334 II_SYS_SYS_SCR_AMPESS 1 333333 II_SYS_SYS_SCR_BLESSEDNESS 1 333333', { n: 0 }), p, PET, 0, fresh());
  ok(res.result === 'SUCCESS' && res.given.length === 1 && res.lost.length === 2,
    'IsFull counts qty / dwPackMax = 0 slots for a small reward: 3 rewards, 1 free slot -> passes, 2 rewards LOST', JSON.stringify([res.result, res.given.length, res.lost.length]));

  // RemoveItemA / CreateItem
  const tBig = one('II_SYS_SYS_SCR_HOLY 1 1000000', { cond: 'II_SYS_SYS_SCR_SCRAPTOPAZ 40000' });
  p = XS.player({ items: [1, 2, 3, 4, 5].map(() => ({ id: TOPAZ, num: 9999 })) });
  res = XS.resultExchange(env, tBig, p, PET, 0, fresh());
  ok(res.result === 'SUCCESS' && XS.countOf(p, TOPAZ) === 49995 - 40000, '40,000 taken in 0x7fff chunks: 9,995 left', String(XS.countOf(p, TOPAZ)));
  const holyStacks = q => q.slots.filter(x => x && x.id === HOLY).length;
  p = XS.player({ items: [{ id: TOPAZ, num: 5 }, { id: HOLY, num: 5, charged: 1 }] });
  XS.resultExchange(env, t5, p, PET, 0, fresh());
  ok(holyStacks(p) === 1 && XS.countOf(p, HOLY) === 6, 'a reward stacks with the same item (same flag and bCharged)');
  p = XS.player({ items: [{ id: TOPAZ, num: 5 }, { id: HOLY, num: 5, charged: 1 }] });
  XS.resultExchange(env, one('II_SYS_SYS_SCR_HOLY 1 1000000 2'), p, PET, 0, fresh());
  eq(holyStacks(p), 2, 'a bound reward (flag 2) does not stack with unbound ones');

  // client
  const rowP = XS.player({ items: [{ id: TOPAZ, num: 4 }] });
  eq(XS.rowView(env, tp.find(PET).sets[0], rowP).cond[0].dim, true, 'window row: the Penya icon is always dimmed (Penya is never in the bag)');
  eq(XS.rowView(env, t5.find(PET).sets[0], rowP).cond[0].dim, true, 'window row: 4 of 5 Topaz -> dimmed');

  // the real file
  const real = XS.serverTable(W.models.exchange);
  const COL = D.get('MMI_COLLECT01');
  res = XS.resultExchange(env, real, XS.stockedPlayer(env, real.find(COL).sets[0], { free: 1 }), COL, 0, fresh());
  eq(XS.clientReply(env, real, COL, 0, res).chat.join(), 'Exchange complete! You received Name Color Scroll (3 Days) x1.', 'Collins: one green chat line (15091d5f)');
  res = XS.resultExchange(env, real, XS.player(), COL, 0, fresh());
  eq(XS.clientReply(env, real, COL, 0, res).chat.join(), 'You do not have the required Pieces.', 'Collins: missing pieces -> one red chat line, no box');
  res = XS.resultExchange(env, real, XS.stockedPlayer(env, real.find(PET).sets[0], { free: 1 }), PET, 0, fresh());
  eq(XS.clientReply(env, real, PET, 0, res).box, 'You have received a Scroll of Pet Revival(S Class)', 'Pet Tamer: RESULTMSG pair -> message box');
  const card = XS.run(env, real, D.get('MMI_EXCHANGE_WEAPONCARD'), 0, { tries: 20000, seed: 3 });
  const up = card.given.find(g => g.line.prob === 400000);
  ok(up && Math.abs(up.seenPct - 40) < 1, 'Card Master: Fire Card (C) comes out about 40% of the time', up && up.seenPct.toFixed(2));
  const one1 = XS.run(env, real, COL, 7, { tries: 3, mode: 'keep', stock: 10, free: 1 });
  ok(one1.results.SUCCESS === 1 && one1.results.INVENTORY_FAILED === 2,
    'IsFull wants one EMPTY slot every time: with 1 free slot the first Holy stack fills it and the next exchanges are refused, though they would stack', JSON.stringify(one1.results));
  const keep = XS.run(env, real, COL, 7, { tries: 12, mode: 'keep', stock: 10, free: 2 });
  ok(keep.results.SUCCESS === 10 && keep.results.CONDITION_FAILED === 2, 'one bag with ingredients for 10 and 2 free slots: 10 exchanges, then CONDITION_FAILED', JSON.stringify(keep.results));
  ok(XS.countOf(keep.end, xsId('II_SYS_SYS_SCR_HOLY')) === 50 && keep.end.slots.filter(x => x && x.id === xsId('II_SYS_SYS_SCR_HOLY')).length === 1, 'the 10 x 5 Scrolls of Holy pile up in one stack');
  const full = XS.run(env, real, COL, 7, { tries: 3, mode: 'keep', stock: 10, free: 0 });
  eq(full.results.INVENTORY_FAILED, 3, 'no free slot and no stack used up -> INVENTORY_FAILED, even though the Holy scrolls would stack');
}
editCase('exchange simulator: an ingredient edit changes what the server takes', w => {
  const st = exm(w, 'MMI_COLLECT01').sets[0];
  w.apply('exchange_script.txt', XO.setIngredientQty(st, st.condition[0], 450), 'qty');
  const env = xsEnv(w), t = XS.serverTable(w.models.exchange), COL = w.defines.defines.get('MMI_COLLECT01');
  const TOPAZ = xsId('II_SYS_SYS_SCR_SCRAPTOPAZ');
  const p = XS.stockedPlayer(env, t.find(COL).sets[0], { free: 1 });
  XS.removeItemA(p, TOPAZ, 1);
  eq(XS.resultExchange(env, t, p, COL, 0, XS.rng(1)).result, 'CONDITION_FAILED', 'after the edit: 449 Topaz -> CONDITION_FAILED');
  p.slots[p.slots.findIndex(x => x && x.id === TOPAZ)].num += 1;
  const res = XS.resultExchange(env, t, p, COL, 0, XS.rng(1));
  ok(res.result === 'SUCCESS' && res.taken.find(x => x.id === TOPAZ).num === 450, 'after the edit: 450 Topaz -> SUCCESS, 450 taken');
});
editCase('exchange simulator: a chance edit changes how often each reward comes out', w => {
  const f = exf(w);
  let st = exm(w, 'MMI_COLLECT01').sets[1];
  w.apply('exchange_script.txt', XO.addReward(f.text, st, 'II_SYS_SYS_SCR_AMPESS', 2, 500000), 'add pay');
  st = exm(w, 'MMI_COLLECT01').sets[1];
  w.apply('exchange_script.txt', XO.evenChances(st), 'even');
  const env = xsEnv(w), t = XS.serverTable(w.models.exchange), COL = w.defines.defines.get('MMI_COLLECT01');
  const r = XS.run(env, t, COL, 1, { tries: 20000, seed: 5 });
  ok(r.given.length === 2 && r.given.every(g => Math.abs(g.seenPct - 50) < 1.5), 'spread evenly: each reward about 50%', r.given.map(g => g.seenPct.toFixed(1)).join('/'));
  ok(r.given.find(g => g.line.id === xsId('II_SYS_SYS_SCR_AMPESS')).qty === r.given.find(g => g.line.id === xsId('II_SYS_SYS_SCR_AMPESS')).times * 2, 'the new reward gives 2 each time');
});
editCase('exchange simulator: Server and Client copies out of step', w => {
  const client = XS.serverTable(w.models.exchange);       // the Client copy, not saved again
  const f = exf(w), env = xsEnv(w), COL = w.defines.defines.get('MMI_COLLECT01');
  const col = exm(w, 'MMI_COLLECT01');
  w.apply('exchange_script.txt', XO.moveSet(f.text, col, col.sets[0], 1).splices, 'move');   // only the server copy changes
  const server = XS.serverTable(w.models.exchange);
  // the player clicks the first row of THEIR window (Name Color); the client sends position 0
  const p = XS.stockedPlayer(env, server.find(COL).sets[0], { free: 1 });
  const res = XS.resultExchange(env, server, p, COL, 0, XS.rng(1));
  eq(res.given[0].id, xsId('II_SYS_SYS_SCR_CHATCOLOR_3D'), 'the server gives what sits at that position in ITS copy (Chat/Shout Color)');
  eq(XS.clientReply(env, client, COL, 0, res).chat.join(), 'Exchange complete! You received Name Color Scroll (3 Days) x1.', 'while the chat line names the client copy\'s reward');
});
section('exchange simulator: every recipe players can use');
{
  const ex = new FRE.Workspace((() => { const m = new Map(); for (const [k, e] of loadFolder(FIXTURES)) m.set(k, openSource(e)); return m; })(), { only: 'exchange' }).load();
  const dyo = new Map();
  for (const x of ex.worldList()) { const p = `${FIXTURES}/World/${x.name}/${x.name}.dyo`; if (!dyo.has(x.name) && exists(p)) dyo.set(x.name, readBytes(p)); }
  ex.setMapObjects(dyo);
  const env = xsEnv(ex), t = XS.serverTable(ex.models.exchange);
  const live = ex.models.exchange.menus.filter(m => !m.isJunk && m.sets.length && (ex.npcInfoByMenu().get(m.mmi.value) || []).some(x => x.inGame));
  let n = 0, bad = [], lose = [];
  for (const m of live) t.find(m.mmi.value).sets.forEach((s, i) => {
    n++;
    const r = XS.run(env, t, m.mmi.value, i, { tries: 200, free: 1 });
    if (r.results.SUCCESS !== 200) bad.push(`${m.name} ${i + 1}`);
    const r0 = XS.run(env, t, m.mmi.value, i, { tries: 200, free: 0 });
    if (r0.lost) lose.push(`${m.name} ${i + 1}`);
  });
  ok(n > 60, `${n} live recipes simulated`);
  eq(bad.join(), '', 'every live recipe succeeds with exact ingredients and 1 free slot');
  eq(lose.join(), '', 'no live recipe loses rewards, even with 0 free slots');
}

// The same cases through the independent Python copy (tools/oracle_sim.py, written from the
// C++ without reading exchange-sim.js): every result, roll, reward and end bag must match.
section('exchange simulator: JS and Python copies agree');
{
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle_sim.py exchange ${FIXTURES}`);
  const ora = JSON.parse(new TextDecoder().decode(out));
  const env = xsEnv(W), real = XS.serverTable(W.models.exchange);
  eq(ora.gold, xsId('II_GOLD_SEED1'), 'both copies: PENYA = II_GOLD_SEED1');
  const build = bag => {
    const p = XS.player({ gold: bag.gold, unlocked: bag.unlocked });
    for (const [k, v] of Object.entries(bag.slots || {})) p.slots[+k] = { id: v[0], num: v[1], flag: v[2], charged: v[3], busy: v[4] };
    for (const [k, v] of Object.entries(bag.equip || {})) p.equip[+k] = { id: v[0], num: v[1], flag: v[2], charged: v[3], busy: v[4] };
    for (let i = 0, left = bag.fill || 0; i < XS.MAX_INVENTORY && left > 0; i++) if (!p.slots[i]) { p.slots[i] = { id: XS.FILLER, num: 1, flag: 0, charged: 0, busy: false }; left--; }
    return p;
  };
  const dump = p => {
    const all = [...p.slots, ...p.equip];
    return { gold: p.gold, fill: all.filter(x => x && x.id === XS.FILLER).length,
      items: all.map((x, i) => x && x.id !== XS.FILLER ? [i, x.id, x.num, x.flag] : null).filter(Boolean) };
  };
  let agree = 0;
  const bad = [];
  for (const c of ora.cases) {
    const t = c.script ? XS.serverTable(FRE.exchange.loadExchange(new FRE.SourceFile('Exchange_Script.txt', FRE.bytes.binaryStringToBytes(c.script)), { defines: W.defines.defines })) : real;
    const m = t.find(c.mmi), set = m && m.sets[c.set];
    const r = FRE.xRandom.rng(c.seed);
    let p = build(c.bag);
    const counts = {}, lines = set ? set.pay.map(() => [0, 0]) : [], trace = [];
    for (let k = 0; k < c.tries; k++) {
      if (c.mode === 'same') p = build(c.bag);
      const res = XS.resultExchange(env, t, p, c.mmi, c.set, r);
      counts[res.result] = (counts[res.result] || 0) + 1;
      const gi = res.given.map(x => set.pay.indexOf(x)), li = res.lost.map(x => set.pay.indexOf(x));
      gi.forEach(j => lines[j][0]++); li.forEach(j => lines[j][1]++);
      if (c.tries <= 20) trace.push([res.result, gi, li]);
      if (res.result === 'CRASH') break;
    }
    const mine = { counts, lines, trace, end: dump(p) };
    const norm = o => JSON.stringify({ counts: Object.keys(o.counts).sort().map(k => [k, o.counts[k]]), lines: o.lines, trace: o.trace, end: o.end });
    if (norm(mine) === norm(c.expect)) agree++;
    else bad.push(`${c.name} ${m ? m.name : c.mmi} #${c.set + 1}: JS ${norm(mine).slice(0, 300)} | PY ${norm(c.expect).slice(0, 300)}`);
  }
  ok(ora.cases.length > 1400, `${ora.cases.length} cases from the Python copy`);
  eq(agree, ora.cases.length, `JS and Python agree on every case (results, rolls, rewards, lost rewards, end bag)`);
  for (const b of bad.slice(0, 5)) print('   ' + b);
}

// The same season timeline through the independent Python copy (tools/oracle_sim.py, written
// from the C++ without reading bp-server.js): every player's state after every step must match.
// The new season is Python's own text edit there, and the editor's newSeasonPlan here.
section('battle pass simulator: JS and Python copies agree');
{
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ROOT}/tools/oracle_sim.py battlepass ${FIXTURES}`);
  const ora = JSON.parse(new TextDecoder().decode(out));
  const w = freshWorkspace(), S = bpServer(FRE, w, 7), D = w.defines.defines;
  const names = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'];
  const P = Object.fromEntries(names.map(n => [n, S.player(n)]));
  let cfg = S.config(w.models.battlepass), now = null, agree = 0;
  const bad = [];
  const snap = p => ({ level: p.level, points: p.points, type: p.type, enable: p.enable, end: p.end / 1000,
    got: p.got.map(g => [g.level, g.id >>> 0, g.qty, g.where]), pass: p.passItems, free: p.free, refused: p.refused, kills: p.kills === undefined ? null : p.kills, last: p.last === undefined ? null : p.last });
  for (const e of ora.steps) {
    const [, who, what, a, b] = e.step;
    if (e.now) now = new Date(e.now * 1000);
    if (what === 'season') {
      const plan = FRE.battlePassOps.newSeasonPlan(w.models.battlepass, a);
      w.apply('battlepass.inc', plan.splices, 'season');
      cfg = S.config(w.models.battlepass);
      const mine = [...cfg.passes.values()].map(r => [r.type.value, r.time.value]);
      if (JSON.stringify(mine) === JSON.stringify(e.pass)) agree++; else bad.push(`season edit: JS ${JSON.stringify(mine)} PY ${JSON.stringify(e.pass)}`);
      continue;
    }
    const list = who === '*' ? names : [who];
    for (const n of list) {
      const p = P[n];
      if (what === 'login') S.login(cfg, p, now);
      else if (what === 'give') p.passItems += a;
      else if (what === 'free') p.free = a;
      else if (what === 'use') S.usePass(cfg, p, now);
      else if (what === 'grind') p.kills = S.grindTo(cfg, p, a, b, now);
      else if (what === 'points') {          // an exact award at the level-cost boundary
        const r = cfg.ladder.get(p.level);
        const n = typeof a === 'number' ? a : (r ? cfg.cost(r) : 1) - (a === 'cost-1' ? 1 : 0);
        p.last = n;
        S.addPoints(cfg, p, n, now);
      }
    }
    const mine = Object.fromEntries(list.map(n => [n, snap(P[n])]));
    const theirs = Object.fromEntries(list.map(n => { const q = e.players[n]; return [n, { level: q.level, points: q.points, type: q.type, enable: q.enable, end: q.end, got: q.got, pass: q.pass, free: q.free, refused: q.refused, kills: q.kills === undefined ? null : q.kills, last: q.last === undefined ? null : q.last }]; }));
    if (JSON.stringify(mine) === JSON.stringify(theirs)) agree++;
    else bad.push(`${e.step.join(' ')}: JS ${JSON.stringify(mine).slice(0, 400)} | PY ${JSON.stringify(theirs).slice(0, 400)}`);
  }
  eq(agree, ora.steps.length, `JS and Python agree after every one of the ${ora.steps.length} steps (2 seasons, back-pay, full bag, level cap)`);
  for (const x of bad.slice(0, 4)) print('   ' + x);
  const fay = P.Fay;
  ok(fay.level === 50 && fay.got.length === 50, `level cap: Fay stops at level 50 with all 50 rewards (${ora.top})`);
  ok(P.Dee.refused >= 1 && P.Eve.refused === 1, 'refusals: back-pay without enough free slots (Dee), no pass running and a full bag (Eve)');
  ok(P.Hal.refused === 0 && P.Hal.got.length === 4 && P.Hal.got[3].where === 'mail', 'back-pay with exactly enough free slots works; the next reward, with a full bag, is mailed (Hal)');
}

// Past seasons (backup copies) and reusing their rewards; every edit is checked through the
// Battle Pass simulator (tests/bp-server.js): what a buyer receives per level.
section('battle pass: past seasons, swap and restore');
const bpRewards = (w, upTo) => {           // a buyer grinding to `upTo` on the current file: the reward of every level
  const S = bpServer(FRE, w, 3), cfg = S.config(w.models.battlepass), p = S.player('T');
  const now = new Date(BP_NOW);
  S.login(cfg, p, now); p.passItems = 1; S.usePass(cfg, p, now);
  for (let lv = p.level; lv < upTo; lv++) S.addPoints(cfg, p, cfg.cost(cfg.ladder.get(p.level)), now);
  return p.got.map(g => `${g.level}:${g.qty}x${g.id}`);
};
const BP_NOW = new Date(2026, 9, 10).getTime();
editCase('battle pass: past seasons from backup copies', w => {
  const f = bpf(w), D = w.defines.defines, ctx = { defines: D, strings: w.strings.map };
  const season1 = new FRE.SourceFile('2026-10-01_10-00-00_battlepass/BattlePass.inc', f.serialize());
  const s1Ladder = FRE.battlePass.seasonHistory([{ stamp: 'a', file: season1 }], ctx, null)[0].ladder;
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261109).splices, 'season 2');
  const l3 = w.models.battlepass.ladder.get(3);
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardItem(l3, 'II_SYS_SYS_SCR_AMPESS'), 'level 3');
  const season2 = new FRE.SourceFile('2026-10-07_10-00-00_battlepass/BattlePass.inc', f.serialize());
  const list = FRE.battlePass.seasonHistory([{ stamp: '2026-10-01_10-00-00_battlepass', file: season1 }, { stamp: '2026-10-05_09-00-00_battlepass', file: season1 },
    { stamp: '2026-10-07_10-00-00_battlepass', file: season2 }], ctx, w.models.battlepass);
  eq(list.map(s => `${s.type}|${s.time}|${s.copies}|${s.current}`).join(' '), '2|20261109|1|true 1|20261005|2|false', 'two seasons, newest first; season 1 seen in 2 copies; season 2 is current');
  eq(list[1].ladder.length, 50, 'season 1: 50 levels');
  eq(list[1].ladder[2].define, s1Ladder[2].define, 'season 1 level 3 keeps its old reward');
  eq(list[0].ladder[2].define, 'II_SYS_SYS_SCR_AMPESS', 'season 2 level 3: the changed reward');
});
editCase('battle pass: swap rewards (costs stay), checked through the simulator', w => {
  const f = bpf(w), before = f.serialize();
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261109).splices, 'season 2');
  const r0 = bpRewards(w, 5);
  const L = lv => w.models.battlepass.ladder.get(lv);
  const [c2, c3] = [L(2).points.value, L(3).points.value];
  w.apply('battlepass.inc', FRE.battlePassOps.swapRewards(f.text, L(2), L(3)), 'swap');
  eq(`${L(2).points.value},${L(3).points.value}`, `${c2},${c3}`, 'costs stay with their level');
  const r1 = bpRewards(w, 5);
  eq(r1[1].split(':')[1], r0[2].split(':')[1], 'simulator: level 2 now pays level 3\'s old reward');
  eq(r1[2].split(':')[1], r0[1].split(':')[1], 'simulator: level 3 now pays level 2\'s old reward');
  w.undo(); w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'undo restores identical bytes');
});
editCase('battle pass: use a past ladder / add a past reward, checked through the simulator', w => {
  const f = bpf(w), D = w.defines.defines, ctx = { defines: D, strings: w.strings.map };
  const past = FRE.battlePass.seasonHistory([{ stamp: 'a', file: new FRE.SourceFile('BattlePass.inc', f.serialize()) }], ctx, null)[0];
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261109).splices, 'season 2');
  const s1 = bpRewards(w, 50);
  // season 2 drifts: a reward, a cost, a quantity, and an extra level 51
  const L = lv => w.models.battlepass.ladder.get(lv);
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardItem(L(4), 'II_SYS_SYS_SCR_AMPESS'), 'r');
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardValue(L(7), 'points', 1234), 'c');
  w.apply('battlepass.inc', FRE.battlePassOps.setRewardValue(L(9), 'qty', 77), 'q');
  w.apply('battlepass.inc', FRE.battlePassOps.addReward(f.text, w.models.battlepass, 'II_CHP_RED', 5, 900).splices, 'add 51');
  ok(bpRewards(w, 51).join() !== s1.join(), 'season 2 now pays differently');
  const plan = FRE.battlePassOps.restoreLadder(f.text, w.models.battlepass, past.ladder, D);
  eq(plan.changes.length, 4, 'restore: 4 changes (3 values, level 51 removed)');
  w.apply('battlepass.inc', plan.splices, 'restore');
  eq(bpRewards(w, 51).join(), s1.join(), 'simulator: after "Use this whole ladder", a buyer gets exactly season 1\'s rewards at every level');
  eq(FRE.battlePassOps.restoreLadder(f.text, w.models.battlepass, past.ladder, D).changes.length, 0, 'restoring again changes nothing');
  ok(w.models.battlepass.rows.BP4.every(r => r.type.value === 2) && w.models.battlepass.pass.time.value === 20261109, 'season number and end date untouched');
  // + on a past reward: the next level, same item / quantity / cost
  const p5 = past.ladder[4];
  w.apply('battlepass.inc', FRE.battlePassOps.addReward(f.text, w.models.battlepass, p5.define, p5.qty, p5.points).splices, '+');
  const l51 = L(51);
  ok(l51 && l51.define === p5.define && l51.qty.value === p5.qty && l51.points.value === p5.points && l51.type.value === 2, '+ adds level 51 with the past reward, quantity and cost');
  eq(bpRewards(w, 51).pop(), `51:${p5.qty}x${p5.id}`, 'simulator: level 51 pays it');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
});

editCase('battle pass: remove a middle level (levels above move down), checked through the simulator', w => {
  const f = bpf(w), before = f.serialize();
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261109).splices, 'season 2');   // season 1 has ended
  const r0 = bpRewards(w, 50);
  const L = lv => w.models.battlepass.ladder.get(lv);
  const cost6 = L(6).points.value;
  w.apply('battlepass.inc', FRE.battlePassOps.removeLevel(f.text, w.models.battlepass, L(5)), 'rm 5');
  const m = w.models.battlepass, own = [...m.ladder.values()].filter(r => r.type.value === m.pass.type.value);
  eq(own.length, 49, '49 levels left');
  ok(own.every((r, i, a) => a.some(x => x.level.value === i + 1)), 'levels 1-49, no gap');
  ok(!w.diags.some(d => d.code === 'BP_LEVEL_GAP'), 'no BP_LEVEL_GAP');
  eq(L(5).points.value, cost6, 'old level 6 (with its cost) is now level 5');
  const r1 = bpRewards(w, 49);
  eq(r1[4].split(':')[1], r0[5].split(':')[1], 'simulator: level 5 pays the old level 6 reward');
  eq(r1[48].split(':')[1], r0[49].split(':')[1], 'simulator: level 49 pays the old top reward');
  eq(w.newBlocking().length, 0, 'no new blocking problems');
  w.undo(); w.undo();
  ok(B.bytesEqual(f.serialize(), before), 'undo restores identical bytes');
});
editCase('battle pass: put a past reward on a level, checked through the simulator', w => {
  const f = bpf(w);
  w.apply('battlepass.inc', FRE.battlePassOps.newSeasonPlan(w.models.battlepass, 20261109).splices, 'season 2');
  const L = lv => w.models.battlepass.ladder.get(lv);
  w.apply('battlepass.inc', FRE.battlePassOps.placeReward(f.text, w.models.battlepass, { define: 'II_SYS_SYS_SCR_AMPESS', qty: 4, points: 1500, level: 7 }), 'on 7');
  ok(L(7).define === 'II_SYS_SYS_SCR_AMPESS' && L(7).qty.value === 4 && L(7).points.value === 1500, 'level 7: reward, quantity and cost replaced');
  eq(bpRewards(w, 7)[6], `7:4x${xsId('II_SYS_SYS_SCR_AMPESS')}`, 'simulator: level 7 pays 4x the new reward');
  w.apply('battlepass.inc', FRE.battlePassOps.placeReward(f.text, w.models.battlepass, { define: 'II_CHP_RED', qty: 9, points: 800, level: null }), 'new');
  ok(L(51) && L(51).define === 'II_CHP_RED' && L(51).qty.value === 9, 'level null: a new level 51');
  eq(bpRewards(w, 51).pop(), `51:9x${xsId('II_CHP_RED')}`, 'simulator: level 51 pays it');
  throws(() => FRE.battlePassOps.placeReward(f.text, w.models.battlepass, { define: 'II_CHP_RED', qty: 1, points: 1, level: 99 }), 'no level 99: refused');
});

section('one task at a time (Workspace only)');
{
  const files = () => { const m = new Map(); for (const [k, e] of loadFolder(FIXTURES)) m.set(k, openSource(e)); return m; };
  const ex = new FRE.Workspace(files(), { only: 'exchange' }).load();
  ok(ex.available.exchange.ok && !ex.shown.has('npc') && ex.available.battlepass.off && ex.available.donation.off, 'exchange task: only Exchanges (NPC files read as context)');
  ok(ex.chars && ex.npcsByMenu().get(ex.defines.defines.get('MMI_COLLECT01')).some(n => /Collins/.test(n)), 'exchange task still knows which NPC opens each menu');
  ok(ex.diags.every(d => d.module === 'exchange'), 'exchange task: only exchange problems shown');
  ok(!ex.isEditable('spec_item.txt') && !ex.isEditable('character.inc') && ex.isEditable('exchange_script.txt'), 'exchange task: only Exchange_Script.txt editable');
  eq(ex.clientFileNames().join(), 'Exchange_Script.txt', 'exchange task: Client sync only for Exchange_Script.txt');
  const np = new FRE.Workspace(files(), { only: 'npc' }).load();
  ok(np.isEditable('spec_item.txt') && np.isEditable('character.inc') && !np.isEditable('exchange_script.txt'), 'NPC task: character*.inc and Spec_Item.txt (chip prices) editable');
  ok(np.clientFileNames().includes('Spec_Item.txt') && np.clientFileNames().includes('character.inc'), 'NPC task: syncs Spec_Item.txt and character.inc');
  const bp = new FRE.Workspace(files(), { only: 'battlepass' }).load();
  ok(!bp.isEditable('spec_item.txt') && bp.diags.every(d => d.module === 'battlepass'), 'Battle Pass task: no Spec_Item edits or item problems');
  throws(() => new FRE.Workspace(files(), { only: 'nope' }), 'unknown task refused');
}

section('maps: which NPCs stand in the game (World.inc + .dyo + SetOutput/SetLang)');
{
  const w = W.worldList();
  ok(w.length > 40 && w.some(x => x.name === 'WdMadrigal'), 'World.inc: maps read (WdMadrigal included)');
  const dyo = new Map();
  for (const x of w) {
    const p = `${FIXTURES}/World/${x.name}/${x.name}.dyo`;
    if (!dyo.has(x.name) && exists(p)) dyo.set(x.name, readBytes(p));
  }
  const ends = [...dyo].map(([n, b]) => [n, FRE.world.readDyo(b)]);
  const clean = ends.filter(([, r]) => r.end === 'eof').length;
  ok(clean >= ends.length - 2, `every map file reads to its 0xFFFFFFFF end marker (${clean}/${ends.length}; 2 files start with junk and hold nothing)`);
  eq(ends.find(([n]) => n === 'WdMadrigal')[1].movers.length, 364, 'WdMadrigal: 364 NPCs placed');
  const ex = new FRE.Workspace((() => { const m = new Map(); for (const [k, e] of loadFolder(FIXTURES)) m.set(k, openSource(e)); return m; })(), { only: 'exchange' }).load();
  ex.setMapObjects(dyo);
  const npc = key => ex.chars.byKey.get(key.toLowerCase())[0];
  ok(FRE.world.npcStatus(npc('MaFl_COLINSE'), ex.placed).inGame, 'Collins: on WdMadrigal and shown');
  ok(FRE.world.npcStatus(npc('MaFl_OLDCHAMPION'), ex.placed).inGame, 'Rambo: in game (his SetOutput( false ) is commented out)');
  eq(FRE.world.npcStatus(npc('MaFl_HANGAWI'), ex.placed).why, 'hidden: SetOutput( false )', 'Hangawi: SetOutput( false ), SetLang commented out -> hidden');
  ok(!FRE.world.npcShown(npc('NPC_CHRISTMASRUBI')), 'Ruby: only SetLang( LANG_SPA ) -> hidden on a LANG_USA server (IsUsableDYO2 returns !bOutput)');
  eq(FRE.world.npcStatus(npc('MaFl_May'), ex.placed).why, 'not placed on any map', 'Bles (MMI_EVENT_MAY): on no map');
  const live = ex.models.exchange.menus.filter(m => !m.isJunk && m.sets.length && (ex.npcInfoByMenu().get(m.mmi.value) || []).some(x => x.inGame)).map(m => m.name).sort();
  eq(live.join(), 'MMI_COLLECT01,MMI_COLOSSEUM_REWARD_MIX,MMI_COLOSSEUM_REWARD_WEAPON_1,MMI_COLOSSEUM_REWARD_WEAPON_2,MMI_COLOSSEUM_REWARD_WEAPON_3,MMI_EXCHANGE_ARMORCARD,MMI_EXCHANGE_WEAPONCARD,MMI_PET_RES01,MMI_SEAKINGMASKCHANGEMENU_1', '9 exchange menus players can really use');
  const S = FRE.lexer.Script;
  const one = t => { const files = new Map([['character.inc', new FRE.SourceFile('character.inc', FRE.bytes.binaryStringToBytes(t))]]); return FRE.character.loadCharacters(files, { defines: W.defines.defines, strings: new Map() }).npcs[0]; };
  const a = one('X {\n SetOutput( false );\n SetLang( LANG_KOR );\n}\n');
  ok(a.output === false && a.langs.length === 1 && a.langs[0].lang === 0, 'SetOutput / SetLang parsed');
  const b = one('X {\n AddMenuLang( LANG_USA, MMI_COLLECT01 );\n AddMenuLang( LANG_KOR, MMI_EVENT_MAY );\n}\n');
  eq(b.menus.join(), String(W.defines.defines.get('MMI_COLLECT01')), 'AddMenuLang counts only for the server language (LANG_USA)');
}

section('mutations');
function mutation(name, code, mutate) {
  editCase(name, w => {
    mutate(w, ci(w));
    const nb = w.newBlocking();
    ok(nb.some(d => d.code === code), `${name} -> ${code}`, JSON.stringify(nb.map(d => d.code)));
  });
}
const rawEdit = (w, f, find, repl) => {
  const i = f.text.indexOf(find);
  if (i < 0) throw new Error('fixture text not found: ' + find);
  w.apply('character.inc', [{ start: i, end: i + find.length, insert: repl }], 'raw');
};
mutation('tab 4', 'C_SLOT', (w, f) => rawEdit(w, f, 'AddShopItem( 1, II_GEN_FOO_COO_DDUKGUKHOT', 'AddShopItem( 4, II_GEN_FOO_COO_DDUKGUKHOT'));
mutation('undefined item', 'E_UNDEF', (w, f) => rawEdit(w, f, 'II_GEN_FOO_COO_DDUKGUKHOT', 'II_DOES_NOT_EXIST'));
mutation('missing comma', 'C_ARGS', (w, f) => rawEdit(w, f, 'AddShopItem( 1, II_GEN', 'AddShopItem( 1 II_GEN'));
mutation('define that is not an item', 'C_ITEM', (w, f) => rawEdit(w, f, 'II_GEN_FOO_COO_DDUKGUKHOT', 'MI_AIBATT1'));
mutation('duplicate NPC', 'C_DUP_NPC', (w, f) => rawEdit(w, f, 'MaFl_Losha\r\n', 'MaFl_Lui\r\n'));
mutation('unterminated string', 'E_UNTERM_STR', (w, f) => rawEdit(w, f, 'm_szDialog= "MaFl_Lui.txt";', 'm_szDialog= "MaFl_Lui.txt;'));
editCase('missing final brace', w => {
  const f = ci(w);
  const i = f.text.lastIndexOf('}');
  w.apply('character.inc', [{ start: i, end: i + 1, insert: '' }], 'raw');
  ok(w.newBlocking().some(d => d.code === 'C_BRACES'), 'missing final brace -> C_BRACES');
});
editCase('AddShopItem in a chip shop warns', w => {
  const f = ci(w);
  const i = f.text.indexOf('\t\tSetVenderType(1);\r\n');
  w.apply('character.inc', [{ start: i, end: i, insert: '\t\tAddShopItem( 0, II_GEN_FOO_COO_DDUKGUKHOT );\r\n' }], 'raw');
  const d = w.diags.find(x => x.code === 'C_FIXED_IN_CHIP');
  ok(d && d.severity === 'WARN' && d.npcKey === 'MaFl_Waforu', 'AddShopItem in Waforu -> C_FIXED_IN_CHIP warning');
  eq(w.newBlocking().length, 0, 'C_FIXED_IN_CHIP does not block');
});
editCase('price conflict warning', w => {
  const f = ci(w);
  const losha = w.chars.byKey.get('mafl_losha')[0];
  w.apply('character.inc', FRE.shopOps.addItem(f.text, losha, 0, 'II_GEN_FOO_COO_DDUKGUKHOT', 5), 'add');
  const d = w.diags.find(x => x.code === 'C_PRICE_CONFLICT');
  ok(d && d.severity === 'WARN', 'different prices for one item -> C_PRICE_CONFLICT warning');
  eq(w.newBlocking().length, 0, 'price conflict does not block');
});

print(`\n${pass} passed, ${fail} failed`);
if (fail) System.exit(1);
