// Core test suite (no browser needed):   gjs -m tests/run-tests.js
// - reads fixtures from test-data/Resource (copies, see README)
// - reads the real ../FLYFF-V19-SOURCE/Server/Resource READ-ONLY for the
//   round-trip test; nothing is ever written anywhere.
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, readBytes, listDir, loadFolder, openSource, exists } from './gjs-env.js';
import { bpServer } from './bp-server.js';

const FIXTURES = ROOT + '/test-data/Resource';
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
  const TREE = ROOT + '/test-data/Client/Client/DonationShopTree.inc';
  if (exists(TREE)) {
    const tree = FRE.donationTree.loadTree(openSource({ name: 'DonationShopTree.inc', path: TREE }));
    eq(tree.leaves.length, 20, 'tree: 20 leaf categories');
    eq(tree.pathOf('shields').join(' > '), 'All Items > Weapon Skins > Shields', 'tree: path of Shields (case-insensitive)');
    ok(m.categories.every(c => tree.isLeaf(c)), 'every category in the file is a leaf in the client tree');
    ok(!tree.isLeaf('Fashion') && !tree.isLeaf('All Items'), 'parents are not leaves');
  } else print('   (skipped tree: test-data/Client/Client/DonationShopTree.inc not found)');
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
  const TREE = ROOT + '/test-data/Client/Client/DonationShopTree.inc';
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
