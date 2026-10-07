// Core test suite (no browser needed):   gjs -m tests/run-tests.js
// - reads fixtures from test-data/fixtures (copies made by tools/refresh-fixtures.sh; never
//   test-data/Resource, which you edit by hand in the browser)
// - reads the real ../FLYFF-V19-SOURCE/Server/Resource READ-ONLY for the
//   round-trip test; nothing is ever written anywhere.
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, readBytes, listDir, loadFolder, openSource, exists, loadWorldFiles, readText } from './gjs-env.js';
// the independent Python copy; ORACLE_SIM points at a copy when bugs are planted in it (never mutate tools/ in place)
const ORACLE_SIM = GLib.getenv('ORACLE_SIM') || ROOT + '/tools/oracle_sim.py';
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
    eq([M('defineNeuz.h'), M('etc.inc'), M('etc.txt.txt')].join(), 'eol,identical,identical', 'a new tag\'s files: defineNeuz.h LF in Client, etc.inc + etc.txt.txt identical (b4b9a465)');
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
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} exchange ${FIXTURES}`);
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
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} battlepass ${FIXTURES}`);
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
  ok(np.isEditable('spec_item.txt') && np.isEditable('character.inc') && np.isEditable('exchange_script.txt') && !np.isEditable('battlepass.inc') && !np.isEditable('donationshop.inc'),
    'NPC task: character*.inc, Spec_Item.txt (chip prices) and Exchange_Script.txt (new exchange menus) editable; not the other tasks\' files');
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

// ---------------------------------------------------------------- where NPCs stand (loaders/area.js)
section('where NPCs stand: map window, area names, /te (loaders/area.js)');
const fixtureFiles = () => { const m = new Map(); for (const [k, e] of loadFolder(FIXTURES)) m.set(k, openSource(e)); return m; };
const AR = FRE.area;
const areaWs = (task) => { const w = new FRE.Workspace(fixtureFiles(), { only: task }).load(); const { dyo, worldFiles } = loadWorldFiles(FIXTURES, w); w.setMapObjects(dyo, worldFiles); return w; };
const NW = areaWs('npc');
{
  const A = NW.area, D = NW.defines.defines;
  eq(A.maps.filter(m => (m.loc >= 1 && m.loc <= 4) || (m.loc >= 241 && m.loc <= 245)).map(m => `${m.loc}=${m.title}`).join(', '),
    '241=Darkon 1, 2, 242=Darkon 3, 3=Garden of Rhisis, 2=Saint Morning, 1=Flaris, 243=Shaduwar, 4=Valley of the Risen, 244=Kaillun Grassland, 245=Bahara Desert',
    'map window names by location (propMapComboBoxData.inc + .txt.txt)');
  eq(AR.mapTitle(A, 0), 'Madrigal', 'outside every continent the map window opens "Madrigal" (CONT_NODATA)');
  eq([...A.cont.keys()].sort((a, b) => a - b).join(), '1,2,3,4,241,242,243,244,245', 'WdMadrigal.wld.cnt: 9 continents');
  eq(A.towns.size, 0, 'finding: every town block has C_useRealData 0, so GetTown never finds a town');
  ok(A.cont.get(1).some(([x, z]) => x === 7087 && z === 8157), 'finding: the Flaris polygon has a stray vertex (7087, 8157)');
  // CContinent::GetRevivalPos points
  eq(AR.mapArea(A, 6968, 3328), D.get('CONT_FLARIS'), 'revival point (6968, 3328) is in Flaris');
  eq(AR.mapArea(A, 8470, 3635), D.get('CONT_SAINTMORNING'), 'revival point (8470, 3635) is in Saint Morning');
  eq(AR.mapArea(A, 3808, 4455), D.get('CONT_DARKON12'), 'revival point (3808, 4455) is in Darkon 1, 2');
  // b6abf414 removed these "from Flaris" (verified in game)
  for (const k of ['MaFl_Shain', 'MaFl_COUPONPANG']) eq((NW.whereOf(k)[0] || {}).mapWindow, 'Flaris', `${k} stands in Flaris (b6abf414)`);
  const don = NW.whereOf('MaFl_DONATION');
  eq(don.map(w => `${AR.label(w)} ${w.te}`).join(), 'Flaris — Flarine / Central Flarine /te 1 6961 3231', 'Adrian (MaFl_DONATION): label and /te');
  eq(NW.whereOf('MaFl_COLINSE').map(w => w.place).join(), 'Flaris,Saint Morning,Darkon 1, 2', 'Collins stands in three towns');
  eq(NW.whereOf('MaFl_May').length, 0, 'an NPC on no map: no spot');
  const darken = [...A.placed.get('WdMadrigal')].map(p => NW.whereOf(p.key)).flat().filter(w => w.caption === 'Darkon 2 / Darken');
  ok(darken.length > 20 && darken.every(w => w.place === 'Darkon 1, 2'), `${darken.length} NPC spots read "Darkon 1, 2 — Darkon 2 / Darken"`);
  const out = [...A.placed].flatMap(([w, l]) => l.map(p => AR.standAt(A, w, p.x, p.z)).filter(r => r.caps.some(c => c[0].startsWith('IDS_')))).length;
  ok(out > 0, `finding: ${out} NPC spots on maps whose strings the client never loads (WdArena_1) show raw IDS_ area names`);
  eq(AR.captionLines('A\r\nB').join('|'), 'A|B', 'caption lines split on CRLF');
  eq(AR.captionLines('A\r\n').join('|'), 'A', 'a trailing CRLF ends the caption');
  eq(AR.captionLines('').join('|'), '', 'an empty title is one empty line');
  // the editor's workspaces
  const XW = areaWs('exchange');
  const col = (XW.npcInfoByMenu().get(D.get('MMI_COLLECT01')) || []).find(x => x.key === 'MaFl_COLINSE');
  ok(col && col.where.length === 3, 'Exchanges: each menu NPC carries where it stands');
  const DW = areaWs('donation');
  eq(DW.whereOf('MaFl_DONATION').length, 1, 'Donation Shop task reads the maps too');
  eq(new FRE.Workspace(fixtureFiles(), { only: 'battlepass' }).load().needsMaps(), false, 'Battle Pass (no NPC) reads no maps');
}

// The same spots, walks and small files through the independent Python copy (tools/oracle_sim.py
// area, written from the C++ without reading area.js): every result must match.
section('where NPCs stand: JS and Python copies agree');
{
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} area ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  const A = NW.area, D = NW.defines.defines, J = JSON.stringify;
  const pm = m => { const o = {}; for (const k of [...m.keys()].sort((a, b) => a - b)) o[k] = m.get(k); return o; };
  const src = t => new FRE.SourceFile('x', FRE.bytes.binaryStringToBytes(t));
  const jw = {}; for (const [k, v] of A.worlds) jw[k] = v;
  eq(J(jw), J(py.worlds), `World.inc: ${A.worlds.size} worlds, file names and titles agree`);
  eq(J(A.maps), J(py.maps), 'map window names agree');
  ok(J(pm(A.cont)) === J(py.cont) && J(pm(A.towns)) === J(py.towns), 'continent polygons agree');
  const rc = {}; for (const [n, r] of A.regions) rc[n] = r.length;
  eq(J(rc), J(py.regionCounts), 'regions per map agree');
  let bad = [];
  const js = []; for (const [w, list] of A.placed) for (const p of list) js.push(Object.assign(AR.standAt(A, w, p.x, p.z), { world: w, worldId: A.firstId.get(w), key: p.key, x: p.x, z: p.z }));
  const norm = s => J({ w: s.world, id: s.worldId, k: s.key, x: s.x, z: s.z, e: s.entered, n: s.nav, c: s.caps, m: s.msgs, a: s.mapArea, t: s.mapWindow });
  py.stands.forEach((s, i) => { if (!js[i] || norm(js[i]) !== norm(s)) bad.push(`stand ${norm(s)} | JS ${norm(js[i] || {})}`); });
  ok(js.length === py.stands.length && py.stands.length > 400, `${py.stands.length} NPC spots from the Python copy`);
  eq(bad.length, 0, 'every NPC spot agrees (map window, regions entered, navigator, captions, chat lines)');
  bad.slice(0, 3).forEach(b => print('   ' + b.slice(0, 400)));
  bad = py.walks.filter(w => J(AR.walk(A.regions.get(w.world), w.path, w.step)) !== J(w.expect)).map(w => w.seed);
  eq(bad.join(), '', `${py.walks.length} random walks (${py.walks.reduce((n, w) => n + w.expect.frames, 0)} frames) agree frame by frame`);
  bad = py.grid.filter(([x, z, id]) => AR.mapArea(A, x, z) !== id);
  eq(bad.length, 0, `${py.grid.length} grid points over the Flaris polygon: same map window location`);
  bad = py.polys.filter(c => { let h = ''; for (let x = -13; x < 14; x++) for (let y = -13; y < 14; y++) h += AR.pointInPoly(c.poly, x, y) ? '1' : '0'; return h !== c.hits; });
  eq(bad.length, 0, `${py.polys.length} small polygons (edges, vertices, negative values, self-intersecting): Point_In_Poly agrees`);
  bad = py.cnt.filter(c => { const r = AR.readContinents(src(c.text), D, new Map()); return J(pm(r.cont)) !== J(c.cont) || J(pm(r.towns)) !== J(c.towns) || c.lookup.some(([x, z, id]) => AR.lookup(r.cont, x, z) !== id); });
  eq(bad.length, 0, `${py.cnt.length} small continent files (duplicate id, id over 255, towns, skipped blocks, overlap) agree`);
  const c = py.mapnames, mn = AR.readMapNames(src(c.text), D, new Map(Object.entries(c.strings)));
  ok(J(mn) === J(c.maps) && c.titles.every(([loc, t]) => AR.mapTitle({ maps: mn }, loc) === t), 'a small map-window file (duplicate location, BYTE id, empty titles) agrees');
  for (const r of py.rgn) {
    const regs = AR.readRegions(src(r.text), D, new Map(Object.entries(r.strings)));
    eq(J(regs), J(r.regions), 'a small region file (overlaps, no title, two lines, old format, excluded indexes, unknown key) reads the same');
    eq(r.walks.filter(w => J(AR.walk(r.regions, w.path, w.step)) !== J(w.expect)).length, 0, `${r.walks.length} walks over it agree`);
    const n = o => J([o.entered, o.nav, o.caps, o.msgs]);
    eq(r.stands.filter(s => n(AR.stand(r.regions, s.x, s.z)) !== n(s)).length, 0, `${r.stands.length} spots on it agree`);
  }
}

section('add new NPC: bytes, rules, simulator (JS and Python copies agree)');
{
  const w = new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const { dyoFiles, worldFiles } = loadWorldFiles(FIXTURES, w);
  w.setMapFiles(dyoFiles, worldFiles);
  const fxLines = n => new TextDecoder('latin1').decode(readBytes(ROOT + '/test-data/fixtures/Client/' + n)).split('\n').map(l => l.trim()).filter(Boolean);
  w.setClientModels(fxLines('Model.list'));
  w.setClientTextures(fxLines('ModelTexture.list'), new Map(fxLines('Model.textures').map(l => { const [o, ...t] = l.split('\t'); return [o, t]; })));
  const before = { inc: w.files.get('character.inc').serialize(), txt: w.files.get('character.txt.txt').serialize(), dyo: w.mapFile('WdMadrigal').serialize(), npcs: w.chars.npcs.length };
  ok(w.isEditable('character.txt.txt') && w.isEditable(w.mapFiles.get('WdMadrigal')), 'NPC task may write character.txt.txt and the .dyo files');
  ok(w.clientFileNames().includes('character.txt.txt') && w.clientFileNames().includes('WdMadrigal.dyo'), 'character.txt.txt and the .dyo are client-synced');

  // handoff §6.5.1: the live data loads; 46 maps end at the 0xFFFFFFFF marker, the 2 junk maps do not
  const ends = [...w.mapFiles.keys()].map(m => [m, FRE.npcOps.insertPoint(w.mapFile(m).serialize())]);
  eq(ends.filter(([, a]) => a !== null).length, 46, '46 maps take a new NPC record');
  eq(ends.filter(([, a]) => a === null).map(([m]) => m).sort().join(','), 'WdGuildWar1To1,WdVolcaneYellow', 'only the 2 junk maps cannot');
  const mad = FRE.world.readDyo(before.dyo);
  eq(mad.movers.length, 364, 'WdMadrigal.dyo: 364 NPC records');
  const jur = mad.placements.find(p => p.key === 'MaFl_Juria');
  ok(jur && jur.model === 212 && Math.abs(jur.angle - 182.38) < 0.01 && Math.abs(jur.x - 1739.61 * 4) < 0.1 && jur.y === 100 && Math.abs(jur.z - 802.95 * 4) < 0.1,
    "Juria's record: model 212, angle 182.38, file x 1739.61 = 6958.4 in game (x4, Obj.cpp:525)");
  eq(FRE.npcOps.lastStringId(w), 1188, 'highest IDS_CHARACTER_INC_ is 001188');

  // the §5 example: golden output (handoff §6.5.4) and re-read through the loaders (§6.5.5)
  const form = { key: 'MaFl_Lumi', name: 'Lumi', model: 'MI_MAFL_JURIA', image: 'IDS_CHARACTER_INC_000056', structure: 'SRT_GENERAL',
    map: 'WdMadrigal', x: 6966, y: 100, z: 3220, angle: 180, menus: ['MMI_TRADE', 'MMI_BANKING'],
    tabs: [{ slot: 0, title: 'General Goods', rules: [], items: [{ define: 'II_SYS_SYS_SCR_BLESSEDNESS' }] },
      { slot: 1, title: 'Scrolls', rules: [{ ik3: 'IK3_SCROLL', job: -1, min: 1, max: 150 }], items: [] }] };
  eq(FRE.validateNewNpc(w, form).length, 0, 'the §5 example has no problem');
  const plan = FRE.npcOps.newNpcPlan(w, form);
  w.applyGroup(plan.parts, 'new NPC');
  const inc = w.files.get('character.inc').serialize(), txt = w.files.get('character.txt.txt').serialize(), dyo = w.mapFile('WdMadrigal').serialize();
  const tail = (a, b) => B.bytesEqual(b.subarray(0, a.length), a) ? FRE.bytes.utf16leToString(b.subarray(a.length), 0) : null;
  eq(tail(before.inc, inc), '\r\nMaFl_Lumi\r\n{\r\n\tsetting\r\n\t{\r\n\t\tAddMenu( MMI_TRADE );\r\n\t\tAddMenu( MMI_BANKING );\r\n\t\tAddShopItem( 0, II_SYS_SYS_SCR_BLESSEDNESS );\r\n' +
    '\t\tAddVendorItem( 1, IK3_SCROLL, -1, 1, 150, 100 );\r\n\t\tm_nStructure= SRT_GENERAL;\r\n\t\tSetImage\r\n\t\t(\r\n\t\tIDS_CHARACTER_INC_000056\r\n\t\t);\r\n\t}\r\n' +
    '\tSetName\r\n\t(\r\n\tIDS_CHARACTER_INC_001189\r\n\t);\r\n\tAddVendorSlot( 0, IDS_CHARACTER_INC_001190 );\r\n\tAddVendorSlot( 1, IDS_CHARACTER_INC_001191 );\r\n}\r\n',
    'character.inc: only the §5.2 block is appended (UTF-16LE, CRLF, BOM kept)');
  eq(tail(before.txt, txt), 'IDS_CHARACTER_INC_001189\tLumi\r\nIDS_CHARACTER_INC_001190\tGeneral Goods\r\nIDS_CHARACTER_INC_001191\tScrolls\r\n', 'character.txt.txt: 3 lines appended');
  eq(dyo.length, before.dyo.length + 200, '.dyo is 200 bytes longer');
  ok(B.bytesEqual(dyo.subarray(0, plan.insertAt), before.dyo.subarray(0, plan.insertAt)) && B.bytesEqual(dyo.subarray(plan.insertAt + 200), before.dyo.subarray(plan.insertAt)),
    '.dyo: bytes before and after the new record are unchanged');
  eq(plan.insertAt, before.dyo.length - 4, 'WdMadrigal: inserted before the final 0xFFFFFFFF (after the control record)');
  eq(w.chars.npcs.length, before.npcs + 1, 'NPC count +1');
  const g = FRE.newNpcSim.inGame(w, 'MaFl_Lumi');
  ok(g && g.name === 'Lumi' && g.shown && g.placed.length === 1 && g.placed[0].map === 'WdMadrigal' && g.placed[0].x === 6966 && g.placed[0].z === 3220 && g.placed[0].model === 212,
    'in game: Lumi stands on WdMadrigal at /position 6966, 100, 3220 with model 212');
  eq(g.menus.map(m => m.label).join(','), 'Trade,Deposit', 'right-click: Trade, Deposit');
  eq(g.tabs.map(t => `${t.slot}:${t.title}:${t.items.length}`).join(' '), '0:General Goods:1 1:Scrolls:2', 'tabs: General Goods (1 item), Scrolls (2 items)');
  ok((g.where || []).some(x => /Flaris/.test(x.place) && x.te === '/te 1 6966 3220'), 'where: Flaris, /te 1 6966 3220');
  ok(FRE.validateNewNpc(w, form).some(d => d.code === 'NN_KEY_DUP'), 'the same key again -> NN_KEY_DUP');
  w.undo();
  ok(B.bytesEqual(w.files.get('character.inc').serialize(), before.inc) && B.bytesEqual(w.files.get('character.txt.txt').serialize(), before.txt) && B.bytesEqual(w.mapFile('WdMadrigal').serialize(), before.dyo),
    'one Undo restores all three files');
  eq(w.chars.npcs.length, before.npcs, 'NPC count back after Undo');

  // a new building tag (b4b9a465 way): 3 more files in the same undo step, the NPC reads it back
  {
    const names = ['defineneuz.h', 'etc.inc', 'etc.txt.txt'];
    ok(names.every(n => w.isEditable(n)) && ['defineNeuz.h', 'etc.inc', 'etc.txt.txt'].every(n => w.clientFileNames().includes(n)), 'NPC task may write (and client-sync) defineNeuz.h, etc.inc, etc.txt.txt');
    eq(FRE.newNpcSim.freeStructureIds(w).join(), '18,19', 'free building tag rows: 18, 19 (MAX_STRUCTURE 20; 11 is SRT_DUNGEON)');
    eq(FRE.newNpcSim.structures(w).names.get(17), 'Red Chip Merchant', 'structure row 17 = Red Chip Merchant (b4b9a465)');
    const tagged = Object.assign({}, form, { key: 'MaFl_Lumi2', structure: null, newTag: '[Dungeon Pieces]' });
    eq(FRE.validateNewNpc(w, tagged).map(d => d.code).join(), 'NN_TAG_ICON', 'new tag: only the minimap-icon note');
    const old = names.map(n => w.files.get(n).serialize());
    const p2 = FRE.npcOps.newNpcPlan(w, tagged);
    w.applyGroup(p2.parts, 'new NPC with tag');
    const txtOf = n => w.files.get(n).text;
    ok(txtOf('defineneuz.h').includes('#define SRT_REDCHIPMERCHANT      17\r\n#define SRT_DUNGEON_PIECES       18\r\n#define MAX_STRUCTURE'), 'defineNeuz.h: #define SRT_DUNGEON_PIECES 18 after the last SRT_ line');
    ok(txtOf('etc.inc').includes('\tSRT_REDCHIPMERCHANT\t\tIDS_ETC_INC_000045\r\n\tSRT_DUNGEON_PIECES\t\tIDS_ETC_INC_000046\r\n}'), 'etc.inc: SRT_DUNGEON_PIECES IDS_ETC_INC_000046 before the structure block\'s }');
    ok(txtOf('etc.txt.txt').endsWith('IDS_ETC_INC_000046\tDungeon Pieces\r\n'), 'etc.txt.txt: IDS_ETC_INC_000046 Dungeon Pieces appended');
    eq(w.defines.defines.get('SRT_DUNGEON_PIECES'), 18, 'defines reloaded after the edit');
    const g2 = FRE.newNpcSim.inGame(w, 'MaFl_Lumi2');
    ok(g2 && g2.tag && g2.tag.text === '[Dungeon Pieces]' && !g2.tag.overflow, 'in game: [Dungeon Pieces] above Lumi');
    ok(FRE.validateNewNpc(w, Object.assign({}, tagged, { key: 'MaFl_Lumi3' })).some(d => d.code === 'NN_TAG_DUP'), 'the same tag again -> NN_TAG_DUP (pick it instead)');
    w.undo();
    ok(names.every((n, i) => B.bytesEqual(w.files.get(n).serialize(), old[i])) && !w.defines.defines.has('SRT_DUNGEON_PIECES'), 'one Undo restores defineNeuz.h, etc.inc, etc.txt.txt and the defines');
  }

  // portrait pictures (ui/tga.js decode): Juria's char_Juria.tga, 200x240 RGBA
  {
    globalThis.FRE.dom = globalThis.FRE.dom || { h: () => null };
    if (!FRE.tga) (0, eval)(new TextDecoder().decode(readBytes(ROOT + '/src/ui/tga.js')));
    const img = FRE.tga.decode(readBytes(ROOT + '/test-data/fixtures/Client/Char/char_Juria.tga'));
    ok(img && img.w === 200 && img.h === 240 && img.rgba.length === 200 * 240 * 4 && img.rgba.some((v, i) => i % 4 !== 3 && v), 'TGA portrait decodes (200x240, not blank)');
  }
  // the model files check (Client/Model names): Julia complete; an unused model missing an .ani is caught
  eq((FRE.newNpcSim.missingModelFiles(w, 'MI_MAFL_JURIA') || ['?']).length, 0, 'MI_MAFL_JURIA: .o3d and every .ani in Client/Model');
  // textures: the .o3d reader (the model loader is not in the source tree) agrees with the Python copy on sample files,
  // one with a 47-character name whose length byte (0x30) is printable
  {
    const files = ['Mvr_MaFlJuria.o3d', 'item_Mount051.o3d'].map(n => ROOT + '/test-data/fixtures/o3d/' + n);
    const [, o] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} o3d ${files.join(' ')}`);
    const pyTex = JSON.parse(new TextDecoder().decode(o));
    const jsTex = Object.fromEntries(files.map(f => [f.split('/').pop(), FRE.newNpcSim.o3dTextures(readBytes(f))]));
    eq(JSON.stringify(jsTex), JSON.stringify(pyTex), '.o3d texture names: JS and Python agree on the samples');
    ok(jsTex['item_Mount051.o3d'].includes('pvpridingdirewolfskinfrostwolfalphaspectral.dds'), 'a 47-character texture name is found (its length byte is printable)');
    eq(jsTex['Mvr_MaFlJuria.o3d'].join(), 'mvr_mafljuria-01.dds,mvr_mafljuria-02.dds', "Julia's 2 textures");
    const lines = fxLines('Model.textures'), tex = new Set(fxLines('ModelTexture.list').map(n => n.toLowerCase()));
    eq(lines.filter(l => l.split('\t').slice(1).some(t => !tex.has(t))).length, 0, `every texture of the ${lines.length} Mvr_*.o3d models is in Client/Model/Texture`);
    eq((FRE.newNpcSim.missingModelFiles(w, 'MI_MAFL_JURIA') || ['?']).join(), '', 'Julia: no file missing, textures included');
    w.clientTextures.delete('mvr_mafljuria-01.dds');
    eq(FRE.newNpcSim.missingModelFiles(w, 'MI_MAFL_JURIA').join(), 'Texture/mvr_mafljuria-01.dds', 'a missing texture is named');
    w.clientTextures.add('mvr_mafljuria-01.dds');
  }
  // models of the NPCs b6abf414 hid were seen in game: proven, not offered as "not used yet"
  {
    const sb = FRE.newNpcSim.seenBefore(w);
    eq([...sb.values()].flat().map(b => b.key).sort().join(), 'MaFl_ANGEL2011,MaFl_COUPONPANG,MaFl_Shain', 'seen before b6abf414: Shain, Coupon Pang, Angel 2011');
    ok([...sb.keys()].every(id => FRE.newNpcSim.provenModels(w).has(id) && !FRE.newNpcSim.unusedCompleteModels(w).some(m => m.id === id)), 'their models count as proven');
  }
  ok(FRE.newNpcSim.unusedCompleteModels(w).length > 50, 'unused models with every file: offered behind the toggle', String(FRE.newNpcSim.unusedCompleteModels(w).length));

  // every rule code has help text
  const codes = ['NN_KEY', 'NN_KEY_DUP', 'NN_KEY_NAME', 'NN_TEXT', 'NN_IDS_TAKEN', 'NN_MENU', 'NN_MENU_NEW', 'NN_MENU_TWICE', 'NN_DIALOG', 'NN_MODEL', 'NN_MODEL_FILES', 'NN_MODEL_UNPROVEN', 'NN_NO_MENU', 'NN_IMAGE', 'NN_STRUCTURE',
    'NN_TAG_FILES', 'NN_TAG_FULL', 'NN_TAG_CHARS', 'NN_TAG_LONG', 'NN_TAG_DUP', 'NN_TAG_ICON',
    'NN_SHOP_NO_TRADE', 'NN_SHOP_EMPTY', 'NN_TAB', 'NN_RULE', 'NN_RULE_EMPTY', 'NN_ITEM', 'NN_ITEM_TWICE', 'NN_PRICE', 'NN_PRICE_GLOBAL', 'NN_PRICE_CONFLICT', 'NN_TAB_FULL',
    'NN_MAP', 'NN_POS', 'NN_OVERLAP', 'NN_HEIGHT'];
  ok(codes.every(c => FRE.diagHelp[c]), 'every NN_ code has help text', codes.filter(c => !FRE.diagHelp[c]).join(', '));

  // the independent Python copy: same rules, same bytes, same game state for every case
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} newnpc ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  eq(py.lastId, 1188, 'Python: highest IDS_CHARACTER_INC_ 1188');
  let agree = 0, built = 0, games = 0;
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  for (const c of py.cases) {
    const realDefs = new Map(Object.keys(c.defs || {}).map(k => [k, w.defines.defines.get(k)]));
    for (const [k, v] of Object.entries(c.defs || {})) w.defines.defines.set(k, v);       // made-up #defines of a case (until it is built)
    for (const t of c.hideTex || []) w.clientTextures.delete(t);                          // a texture missing from Client/Model/Texture
    const diags = FRE.validateNewNpc(w, c.form);
    const mine = { codes: [...new Set(diags.map(d => `${d.code}|${d.field}`))].sort(), build: null, inGame: null };
    if (!diags.some(d => d.severity === 'BLOCK')) {
      const p = FRE.npcOps.newNpcPlan(w, c.form);
      const dyoFile = w.mapFile(c.form.map);
      const part = n => p.parts.find(x => x.file === n).splices[0];
      const t = p.tag;
      mine.build = { incTail: part('character.inc').insert, txtTail: part('character.txt.txt').insert, insertAt: p.insertAt, record: hex(p.record), dyoLen: dyoFile.serialize().length + 200,
        tag: t && { id: t.id, define: t.define, defLine: part('defineneuz.h').insert, defAt: part('defineneuz.h').start, incLine: part('etc.inc').insert, incAt: part('etc.inc').start, txtTail: part('etc.txt.txt').insert } };
      built++;
      if (c.game) {
        w.applyGroup(p.parts, 'case');
        const x = FRE.newNpcSim.inGame(w, c.form.key);
        mine.inGame = x && { name: x.name, tag: x.tag, menus: x.menus.map(m => m.id), labels: x.menus.map(m => m.label), when: x.menus.map(m => m.when), tabs: x.tabs,
          placed: x.placed.map(q => ({ map: q.map, x: q.x, y: q.y, z: q.z, angle: q.angle, model: q.model })) };
        w.undo();
        games++;
      }
    }
    for (const [k, v] of realDefs) if (v === undefined) w.defines.defines.delete(k); else w.defines.defines.set(k, v);
    for (const t of c.hideTex || []) w.clientTextures.add(t);
    const same = JSON.stringify(mine.codes) === JSON.stringify(c.codes) && JSON.stringify(mine.build) === JSON.stringify(c.build) && JSON.stringify(mine.inGame) === JSON.stringify(c.inGame);
    if (same) agree++;
    else ok(false, `new NPC case "${c.name}"`, `JS ${JSON.stringify(mine).slice(0, 400)}\n      PY ${JSON.stringify({ codes: c.codes, build: c.build, inGame: c.inGame }).slice(0, 400)}`);
  }
  eq(agree, py.cases.length, `JS and Python agree on all ${py.cases.length} new-NPC cases (${built} built, ${games} loaded in game)`);
  ok(py.cases.some(c => c.codes.length === 0 && c.build) && new Set(py.cases.flatMap(c => c.codes.map(x => x.split('|')[0]))).size >= 24, 'the cases trip (nearly) every rule and include clean ones');
  ok(B.bytesEqual(w.files.get('character.inc').serialize(), before.inc) && B.bytesEqual(w.mapFile('WdMadrigal').serialize(), before.dyo), 'files unchanged after the cases');
  // small etc.inc files through the structure loop (rows outside MAX_STRUCTURE, 31/32 characters, last wins, blocks after it)
  let sbad = 0;
  for (const c of py.structs) {
    const fake = { files: new Map([['etc.inc', { text: c.text }]]), defines: { defines: new Map(Object.entries(Object.assign({ MAX_STRUCTURE: c.max }, c.defines))) }, strings: { map: new Map(Object.entries(c.strings)) } };
    const r = FRE.newNpcSim.structures(fake);
    const mine = { names: Object.fromEntries([...r.names].sort((x, y) => x[0] - y[0]).map(([k, v]) => [String(k), v])), bad: r.bad };
    if (JSON.stringify(mine) !== JSON.stringify({ names: Object.fromEntries(Object.entries(c.names).sort((x, y) => x[0] - y[0])), bad: c.bad })) { sbad++; ok(false, 'structure file', `${JSON.stringify(c.text)}\n      JS ${JSON.stringify(mine)}\n      PY ${JSON.stringify({ names: c.names, bad: c.bad })}`); }
  }
  eq(sbad, 0, `${py.structs.length} small structure files read the same (names, rows outside the table, long names)`);
  ok(py.cases.filter(c => c.build && c.build.tag).length >= 5 && py.cases.some(c => c.inGame && c.inGame.tag && c.inGame.tag.text === '[Dungeon Pieces]'), 'new-tag cases were built and loaded');
}

section('new exchange menus: lines, rules, right-click, exchanges (JS and Python copies agree)');
{
  const w = new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const { dyoFiles, worldFiles } = loadWorldFiles(FIXTURES, w);
  w.setMapFiles(dyoFiles, worldFiles);
  const names = FRE.menuOps.FILES;
  const before = names.map(n => w.files.get(n).serialize());
  ok(names.every(n => w.isEditable(n)) && ['defineText.h', 'textClient.inc', 'textClient.txt.txt', 'Exchange_Script.txt'].every(n => w.clientFileNames().includes(n)),
    'NPC task may write (and client-sync) defineText.h, textClient.inc, textClient.txt.txt, Exchange_Script.txt');
  ok(w.models.exchange && w.models.exchange.menus.length > 70, 'NPC task reads the exchange menus');
  eq(FRE.menuOps.freeMenuIds(w)[0], 282, 'first free menu id: 282 (MMI_COLLECTOR_DETAILS is 281)');
  eq(FRE.menuOps.nextTid(w), 8044, 'next free TID: 8044 (after TID_TOOLTIP_SKILLDMG 8043)');
  eq(FRE.menuOps.nextTextId(w), 3929, 'next textClient key: IDS_TEXTCLIENT_INC_003929');

  // Jeff (tools/jeff-menus.json): golden lines, in game, every exchange pressed
  const jeff = JSON.parse(readText(ROOT + '/tools/jeff-menus.json'));
  eq(FRE.validateNewMenus(w, jeff).length, 0, "Jeff's 6 menus: no problem");
  const plan = FRE.menuOps.newMenusPlan(w, jeff);
  eq(plan.ids.join(), '282,283,284,285,286,287', 'Jeff: menu ids 282-287');
  w.applyGroup(plan.parts, 'Jeff');
  const txt = n => w.files.get(n).text;
  ok(txt('defineneuz.h').includes('#define MMI_COLLECTOR_DETAILS\t281\t// Collins: Collector Details window (collecting drop rates)\r\n#define MMI_WPNPIECE_ENTANESS\t282\t// MaFl_Jeff exchange menu\r\n'), 'defineNeuz.h: MMI_WPNPIECE_ENTANESS 282 right after MMI_COLLECTOR_DETAILS 281');
  ok(/TID_MMI_MUSICFESTIVALGUITAR\t\t\t7279[^\n]*\n#define\tTID_MMI_WPNPIECE_ENTANESS\t\t\t7282\r\n/.test(txt('definetext.h')) && txt('definetext.h').endsWith('#define\tTID_GAME_WPNPIECE_FAIL\t\t\t\t\t8045\r\n'),
    'defineText.h: TID_MMI_ labels 7282.. after TID_MMI_MUSICFESTIVALGUITAR 7279; result TIDs 8044/8045 at the end');
  ok(txt('textclient.txt.txt').endsWith('IDS_TEXTCLIENT_INC_003934\tCrystal Lusaka Weapons\r\nIDS_TEXTCLIENT_INC_003935\tYou received your weapon.\r\nIDS_TEXTCLIENT_INC_003936\tYou need the weapon pieces, the boss item and a free inventory slot.\r\n'),
    'textClient.txt.txt: 8 lines appended (line i still holds key i)');
  ok(txt('textclient.txt.txt').split('\r\n').every((l, i) => !l || l.startsWith('IDS_TEXTCLIENT_INC_' + String(i).padStart(6, '0'))), 'textClient.txt.txt stays positional');
  const g = FRE.newNpcSim.inGame(w, 'MaFl_Jeff');
  eq(g.menus.map(m => `${m.label}${m.opens ? ':' + m.opens.sets : ''}`).join(', '),
    'Dialog, Entaness Weapons:10, Chiton Weapons:10, Duchess Weapons:10, Ancient Weapons (Drakul):10, Ankou Weapons:11, Crystal Lusaka Weapons:10',
    "in game: Jeff's right-click = Dialog + the 6 labels, each opening the exchange window with its weapons");
  eq(w.diags.filter(d => d.module === 'exchange' && d.severity === 'BLOCK').length, 0, 'the exchange loader reads the new menus without a problem');
  const XS = FRE.exchangeSim, env = XS.envFromWorkspace(w), table = XS.serverTable(w.models.exchange);
  const ank = table.find(286);
  const p1 = XS.stockedPlayer(env, ank.sets[0], { free: 1 });
  const r1 = XS.resultExchange(env, table, p1, 286, 0, XS.rng(1));
  ok(r1.result === 'SUCCESS' && r1.given.length === 1 && r1.given[0].id === w.defines.defines.get('II_WEA_SWO_BEHESWORD') && r1.taken.length === 2, 'Ankou #1: 200 pieces + 1 Ankou\'s Scale -> Curtana');
  w.undo();
  ok(names.every((n, i) => B.bytesEqual(w.files.get(n).serialize(), before[i])) && !w.defines.defines.has('MMI_WPNPIECE_ENTANESS'), 'one Undo restores all 6 files and the defines');

  // the C++ case list (which menu ids have their own window): JS list = the one Python reads from WndWorld.cpp
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} newmenu ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  eq([...FRE.newNpcSim.OWN_CASE].sort().join(), py.caseIds.join(), `OnCommand case list: JS = Python (${py.caseIds.length} names read from WndWorld.cpp)`);

  const build = bag => {
    const p = XS.player({ gold: bag.gold, unlocked: bag.unlocked });
    for (const [k, v] of Object.entries(bag.slots || {})) p.slots[+k] = { id: v[0], num: v[1], flag: v[2], charged: v[3], busy: v[4] };
    for (let i = 0, left = bag.fill || 0; i < XS.MAX_INVENTORY && left > 0; i++) if (!p.slots[i]) { p.slots[i] = { id: XS.FILLER, num: 1, flag: 0, charged: 0, busy: false }; left--; }
    return p;
  };
  const dump = p => {
    const all = [...p.slots, ...p.equip];
    return { gold: p.gold, fill: all.filter(x => x && x.id === XS.FILLER).length, items: all.map((x, i) => x && x.id !== XS.FILLER ? [i, x.id, x.num, x.flag] : null).filter(Boolean) };
  };
  const norm = o => JSON.stringify({ counts: Object.keys(o.counts).sort().map(k => [k, o.counts[k]]), lines: o.lines, trace: o.trace, end: o.end });
  let agree = 0, xagree = 0, xall = 0;
  for (const c of py.cases) {
    const realDefs = new Map(Object.keys(c.defs).map(k => [k, w.defines.defines.get(k)]));
    for (const [k, v] of Object.entries(c.defs)) w.defines.defines.set(k, v);
    const diags = FRE.validateNewMenus(w, c.spec);
    const mine = { codes: [...new Set(diags.map(d => `${d.code}|${d.field}`))].sort(), build: null, inGame: null };
    if (!diags.some(d => d.severity === 'BLOCK')) {
      const p = FRE.menuOps.newMenusPlan(w, c.spec);
      const fname = Object.fromEntries(names.map(n => [n, w.files.get(n).name]));
      mine.build = Object.fromEntries(p.parts.map(x => [fname[x.file], x.splices.map(sp => [sp.start, sp.insert])]));
      mine.ids = p.ids;
      if (c.inGame) {
        w.applyGroup(p.parts, 'case');
        mine.inGame = FRE.newNpcSim.inGame(w, c.spec.npcKey).menus.map(m => [m.id, m.label, m.opens ? m.opens.sets : null]);
        const t = XS.serverTable(w.models.exchange), en = XS.envFromWorkspace(w);
        for (const x of py.exchanges.filter(x => x.spec === c.name)) {
          xall++;
          const set = t.find(x.mmi).sets[x.set];
          // x.tries presses (1, or 1,500 for the reward rates of a random exchange), a fresh bag each ('same')
          const rng = XS.rng(x.seed), counts = {}, lines = set.pay.map(() => [0, 0]), trace = [];
          let pl = build(x.bag);
          for (let k = 0; k < (x.tries || 1); k++) {
            if (k) pl = build(x.bag);
            const r = XS.resultExchange(en, t, pl, x.mmi, x.set, rng);
            counts[r.result] = (counts[r.result] || 0) + 1;
            r.given.forEach(y => lines[set.pay.indexOf(y)][0]++); r.lost.forEach(y => lines[set.pay.indexOf(y)][1]++);
            if ((x.tries || 1) <= 20) trace.push([r.result, r.given.map(y => set.pay.indexOf(y)), r.lost.map(y => set.pay.indexOf(y))]);
          }
          const res = { counts, lines, trace, end: dump(pl) };
          if (norm(res) === norm(x.expect)) xagree++;
          else ok(false, `exchange ${c.name} ${x.mmi} #${x.set + 1} ${x.name}`, `JS ${norm(res).slice(0, 300)}\n      PY ${norm(x.expect).slice(0, 300)}`);
        }
        w.undo();
      }
    }
    for (const [k, v] of realDefs) if (v === undefined) w.defines.defines.delete(k); else w.defines.defines.set(k, v);
    const same = JSON.stringify(mine.codes) === JSON.stringify(c.codes) && JSON.stringify(mine.build) === JSON.stringify(c.build) &&
      JSON.stringify(mine.inGame) === JSON.stringify(c.inGame) && (!c.build || JSON.stringify(mine.ids) === JSON.stringify(c.ids));
    if (same) agree++;
    else ok(false, `new menu case "${c.name}"`, `JS ${JSON.stringify({ codes: mine.codes, ids: mine.ids, inGame: mine.inGame }).slice(0, 400)}\n      PY ${JSON.stringify({ codes: c.codes, ids: c.ids, inGame: c.inGame }).slice(0, 400)}` +
      (mine.build && c.build ? '\n      build differs in: ' + Object.keys(c.build).filter(k => JSON.stringify(mine.build[k]) !== JSON.stringify(c.build[k])).join(', ') : ''));
  }
  eq(agree, py.cases.length, `JS and Python agree on all ${py.cases.length} new-menu cases (rules, every inserted line and offset, right-click list)`);
  eq(xagree, xall, `JS and Python agree on all ${xall} OK presses on the new exchanges (exact / one short / full bag)`);
  ok(xall >= 183, 'the presses cover all 61 of Jeff\'s exchanges');
  ok(names.every((n, i) => B.bytesEqual(w.files.get(n).serialize(), before[i])), 'files unchanged after the cases');
  // the name filled from the label (ui/menu-form.js)
  eq(FRE.menuNameFromLabel(w, "Bob's Weapons"), 'MMI_BOBS_WEAPONS', "label \"Bob's Weapons\" -> MMI_BOBS_WEAPONS");
  eq(FRE.menuNameFromLabel(w, 'Trade'), 'MMI_TRADE_2', 'a taken name gets _2 (MMI_TRADE exists)');
  eq(FRE.menuNameFromLabel(w, 'Test', ['MMI_TEST']), 'MMI_TEST_2', 'a name another menu of the form uses gets _2');
  eq(FRE.menuNameFromLabel(w, 'x'.repeat(60)).length, 44, 'at most 40 characters after MMI_');
  eq(FRE.menuNameFromLabel(w, '무기 !'), '', 'a label with no letter or digit gives no name (the field stays empty: required)');
  ok(FRE.menuNameProblem(w, 'MMI_TRADE') && !FRE.menuNameProblem(w, 'MMI_BOBS_WEAPONS'), 'menuNameProblem: taken vs free');
  // a random exchange: PAY n + the chances
  const rnd = { npcKey: 'MaFl_Jeff', results: { tids: ['TID_GAME_COLLECT_COND01_SUCCESS', 'TID_GAME_COLLECT_COND01_FAIL'] },
    menus: [{ name: 'MMI_TEST_RND', label: 'Rnd', sets: [{ cond: [['II_SYS_SYS_SCR_SCRAPTOPAZ', 5]], pay: [['II_SYS_SYS_SCR_HOLY', 1, 700000], ['II_SYS_SYS_SCR_AMPESS', 1, 300000]], payNum: 1 }] }] };
  ok(/\t\tPAY\t1\r\n\t\t\{\r\n\t\t\tII_SYS_SYS_SCR_HOLY\t1\t700000\r\n\t\t\tII_SYS_SYS_SCR_AMPESS\t1\t300000\r\n/.test(FRE.menuOps.newMenusPlan(w, rnd).lines.exchange.replace(/\r?\n/g, '\r\n')),
    'random exchange: one SET, PAY 1, both rewards with their chances');
  rnd.menus[0].sets[0].payNum = 3;
  ok(FRE.validateNewMenus(w, rnd).some(d => d.code === 'NM_PAYNUM' && d.severity === 'BLOCK'), 'gives 3 of 2: NM_PAYNUM blocks');

  // chances in percent: one change moves the others so the total stays 1,000,000 (edit/exchange-ops.js)
  const RB = FRE.exchangeOps.rebalance, sum = a => a.reduce((x, y) => x + y, 0);
  eq(RB([500000, 500000], 0, 700000).join(), '700000,300000', '70% on one of two: the other gets 30%');
  eq(RB([500000, 300000, 200000], 0, 600000).join(), '600000,240000,160000', 'the others keep their proportions (3:2)');
  eq(RB([1000000, 0, 0], 0, 400000).join(), '400000,300000,300000', 'others all at 0: split evenly');
  eq(RB([333334, 333333, 333333], 1, 100000).join(), '450001,100000,449999', 'rounding leftovers go to the first of the others');
  eq(RB([600000, 400000], null, 0).join(), '600000,400000', 'no line set: unchanged when already 100%');
  eq(RB([300000, 100000], null, 0).join(), '750000,250000', 'no line set: scaled back up to 100% (after a reward is removed)');
  ok([[1, 2, 3], [0, 0], [999999, 1, 0], [123, 456, 789, 1011]].every(v => [0, 1].every(j => j >= v.length || sum(RB(v, j, 123457)) === 1000000)), 'the total is always exactly 1,000,000');
  {
    const ex = w.files.get('exchange_script.txt'), t0 = ex.text, col = () => w.models.exchange.menus.find(m => m.name === 'MMI_COLLECT01');
    const s1 = () => col().sets[0];
    w.apply('exchange_script.txt', FRE.exchangeOps.addRewardKeepTotal(ex.text, s1(), 'II_SYS_SYS_SCR_HOLY', 1), 'add');
    eq(s1().pay.map(l => l.prob.value).join(), '500000,500000', 'Collins #1 (one reward at 100%) + a reward: 50% / 50%');
    w.apply('exchange_script.txt', FRE.exchangeOps.addRewardKeepTotal(ex.text, s1(), 'II_SYS_SYS_SCR_AMPESS', 1), 'add');
    eq(s1().pay.map(l => l.prob.value).join(), '333334,333333,333333', 'a third: an equal share (1/3), the others shrink in proportion');
    w.apply('exchange_script.txt', FRE.exchangeOps.setChanceKeepTotal(s1(), s1().pay[2], 600000), 'pct');
    eq(s1().pay.map(l => l.prob.value).join(), '200001,199999,600000', 'set 60% on the new one: the others share 40%');
    w.apply('exchange_script.txt', FRE.exchangeOps.removeRewardKeepTotal(ex.text, s1(), s1().pay[0]), 'rm');
    eq(s1().pay.map(l => l.prob.value).join(), '250000,750000', 'remove one: the rest grow back to 100%');
    ok(!w.diags.some(d => /EX_PROB_(OVER|UNDER)/.test(d.code) && d.start >= col().start && d.start < col().end), 'no EX_PROB_OVER / EX_PROB_UNDER: nothing is cut or topped up by the server');
    const t = XS.serverTable(w.models.exchange);
    eq(t.find(col().mmi.value).sets[0].pay.map(p => p.prob).join(), '250000,750000', 'the server (exchange-sim Load_Script) reads the same chances');
    w.undo(); w.undo(); w.undo(); w.undo();
    ok(ex.text === t0, 'undo x4: Exchange_Script.txt back');
  }
  // typing in one field = one undo step (Workspace.mergeLast)
  {
    const ex = w.files.get('exchange_script.txt'), t0 = ex.text, s1 = () => w.models.exchange.menus.find(m => m.name === 'MMI_COLLECT01').sets[0];
    const n0 = w.history.length;
    w.apply('exchange_script.txt', FRE.exchangeOps.setRewardQty(s1().pay[0], 2), 'qty');
    w.apply('exchange_script.txt', FRE.exchangeOps.setRewardQty(s1().pay[0], 25), 'qty');
    ok(w.mergeLast() && w.history.length === n0 + 1, 'two edits of the same field fold into one step');
    w.undo();
    ok(ex.text === t0, 'one undo goes back to before both');
  }

  const codes = ['NM_FILES', 'NM_NPC', 'NM_NONE', 'NM_ID_FULL', 'NM_NAME', 'NM_TEXT', 'NM_EMPTY', 'NM_SET_CAP', 'NM_RECIPE', 'NM_ITEM', 'NM_QTY', 'NM_CHANCE', 'NM_PAYNUM', 'NM_RESULT'];
  ok(codes.every(c => FRE.diagHelp[c]), 'every NM_ code has help text', codes.filter(c => !FRE.diagHelp[c]).join(', '));
}

section('existing NPC edits: name, tabs, menus, shop window (JS and Python copies agree)');
{
  const fresh = () => new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const w0 = fresh();
  const E = FRE.npcEditOps, SW = FRE.shopWindow;
  const npcOf = (w, key, file = 'character.inc') => w.chars.npcs.filter(n => n.key === key && n.file.toLowerCase() === file).pop();
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} npcedit ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  const winJson = x => JSON.stringify({ tabs: x.tabs, shown: x.shown, clicks: x.clicks });
  const titlesOf = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k), v]));

  // the shop window of every NPC with Trade: same tabs, same item counts, same clicks
  ok(py.windows.length > 80, `Python lists the shop window of ${py.windows.length} Trade NPCs`);
  let wBad = 0;
  for (const c of py.windows) {
    const npc = npcOf(w0, c.key, c.file);
    const sim = w0.simulate(npc);
    const js = SW.ofNpc(npc, sim);
    const same = npc && JSON.stringify(sim.tabs.map(t => t.entries.length)) === JSON.stringify(c.counts) && winJson(js) === winJson(c.window);
    if (!same && wBad++ < 3) ok(false, `shop window of ${c.key}`, `JS ${winJson(js)} vs Python ${winJson(c.window)}`);
  }
  eq(wBad, 0, 'every Trade NPC: JS and Python shop windows agree');
  let sBad = 0;
  for (const c of py.small) {
    const js = SW.open(titlesOf(c.titles), c.counts);
    if (winJson(js) !== winJson(c.window) && sBad++ < 3) ok(false, `small window ${JSON.stringify(c.titles)}`, `JS ${winJson(js)} vs Python ${winJson(c.window)}`);
  }
  eq(sBad, 0, `${py.small.length} small tab sets: JS and Python agree`);
  const crash = SW.open({ 1: 'Goods' }, [0, 3, 0, 0]);
  eq(crash.clicks.join(','), 'nothing,crash,nothing', 'slot 0 without a name, slot 1 named: clicking the tab crashes the client');
  eq(SW.open({ 0: 'A', 2: 'C' }, [1, 0, 2, 0]).clicks.join(','), 'select,nothing,select', 'a gap: the empty position cannot be clicked, the others work');
  eq(SW.open({}, [0, 0, 0, 0]).tabs.length, 3, 'no named tab: 3 blank tabs (WndShop.cpp:829)');

  // the same edits through edit/npcedit-ops.js give byte-identical files and the same game state
  const sha = t => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, t, -1);
  for (const c of py.edits) {
    const w = fresh();
    const hows = [];
    try {
      for (const e of c.steps) {
        const npc = npcOf(w, e.npc);
        if (e.op === 'rename') { const r = E.renameNpc(w, npc, e.text, !!e.all); w.applyGroup(r.parts, 'rename'); hows.push(r.how); }
        if (e.op === 'tab') { const r = E.renameTab(w, npc, e.slot, e.text, !!e.all); w.applyGroup(r.parts, 'tab'); hows.push(r.how); }
        if (e.op === 'addtab') { const r = E.addTab(w, npc, e.text); w.applyGroup(r.parts, 'add tab'); hows.push(r.slot); }
        if (e.op === 'rmtab') { w.applyGroup(E.removeTab(w, npc, e.slot).parts, 'remove tab'); hows.push(e.slot); }
        if (e.op === 'addmenu') { w.apply('character.inc', E.addMenu(w, npc, e.menu), 'add menu'); hows.push(e.menu); }
        if (e.op === 'rmmenu') { w.apply('character.inc', E.removeMenu(w, npc, w.defines.defines.get(e.menu)), 'remove menu'); hows.push(e.menu); }
      }
    } catch (err) { ok(false, `edit "${c.name}"`, err.message); continue; }
    eq(JSON.stringify(hows), JSON.stringify(c.hows), `edit "${c.name}": same kind of change (${c.hows.join(', ')})`);
    ok(sha(w.files.get('character.inc').text) === c.inc && sha(w.files.get('character.txt.txt').text) === c.txt,
      `edit "${c.name}": character.inc and character.txt.txt identical to the Python copy`);
    const npc = npcOf(w, c.steps[c.steps.length - 1].npc);
    const js = { name: npc.name, titles: Object.fromEntries(Object.entries(npc.slotTitles).map(([k, v]) => [String(k), v])), menus: npc.menus, window: SW.ofNpc(npc, w.simulate(npc)) };
    eq(JSON.stringify({ ...js, window: JSON.parse(winJson(js.window)) }), JSON.stringify({ ...c.after, window: JSON.parse(winJson(c.after.window)) }), `edit "${c.name}": in game the same (name, tabs, menus, window)`);
  }

  // rules and limits
  {
    const w = fresh();
    const peach = npcOf(w, 'MaFl_Peach');
    throws(() => E.renameNpc(w, peach, 'Bad "name"'), 'a " in a name is refused');
    throws(() => E.addTab(w, peach, 'Fifth'), 'a 5th tab is refused (MAX_VENDOR_INVENTORY_TAB 4)');
    throws(() => E.removeTab(w, peach, 1), 'only the last tab can be removed');
    throws(() => E.removeTab(w, peach, 0), 'a tab that sells items cannot be removed');
    throws(() => E.addMenu(w, peach, 'MMI_TRADE'), 'a menu the NPC already has is refused');
    const etc = w.chars.npcs.find(n => n.file.toLowerCase() === 'character-etc.inc' && n.statements.some(r => r.cmd === 'SetName'));
    throws(() => E.renameNpc(w, etc, 'Someone'), 'character-etc.inc NPCs are not renamed (the client reads them from data.res)');
    eq(E.nextSlot(npcOf(w, 'MaFl_Waforu')), 3, 'Wafor: + Tab names tab 4');
    eq(E.keyUses(w, 'IDS_CHARACTER_INC_000049').length, 6, 'IDS_CHARACTER_INC_000049 ("n/a") shows on 6 tabs');
    const before = ['character.inc', 'character.txt.txt'].map(n => w.files.get(n).serialize());
    const r = E.renameTab(w, peach, 1, 'Event');
    w.applyGroup(r.parts, 'tab');
    eq(E.keyUses(w, 'IDS_CHARACTER_INC_000049').length, 5, 'own key: the other 5 "n/a" tabs keep their text');
    w.undo();
    ok(['character.inc', 'character.txt.txt'].every((n, i) => B.bytesEqual(w.files.get(n).serialize(), before[i])), 'one Undo restores both files byte for byte');

    // the tab rules
    const codes = (ws, key) => ws.diags.filter(d => d.npcKey === key && /^C_TAB_(FIRST_UNNAMED|UNNAMED_ITEMS|GAP)$/.test(d.code)).map(d => d.code).sort().join(',');
    eq(codes(w, 'MaFl_Peach'), '', 'Peach as shipped: no tab problem');
    const p2 = npcOf(w, 'MaFl_Peach');
    w.apply('character.inc', FRE.textOps.removeRow(w.files.get('character.inc').text, E.slotRec(p2, 2)), 'drop slot 2');
    eq(codes(w, 'MaFl_Peach'), 'C_TAB_GAP', 'Peach without a name for tab 3: C_TAB_GAP (INFO)');
    w.undo();
    w.apply('character.inc', FRE.textOps.removeRow(w.files.get('character.inc').text, E.slotRec(npcOf(w, 'MaFl_Peach'), 0)), 'drop slot 0');
    eq(codes(w, 'MaFl_Peach'), 'C_TAB_FIRST_UNNAMED,C_TAB_UNNAMED_ITEMS', 'Peach without a name for tab 1: client crash (BLOCK) + its 6 items unseen (WARN)');
    ok(w.newBlocking().some(d => d.code === 'C_TAB_FIRST_UNNAMED'), 'C_TAB_FIRST_UNNAMED blocks saving');
    ok(['C_TAB_FIRST_UNNAMED', 'C_TAB_UNNAMED_ITEMS', 'C_TAB_GAP'].every(c => FRE.diagHelp[c]), 'help text for the 3 tab rules');
    w.undo();
    // live data: no shop has these problems today
    eq(w0.diags.filter(d => /^C_TAB_(FIRST_UNNAMED|UNNAMED_ITEMS|GAP)$/.test(d.code)).length, 0, 'real data: no shop with an unnamed or missing tab');
  }
}

section('shop prices and rule rows: what players pay / get back, rules made fixed items (JS and Python copies agree)');
{
  const V = FRE.vendorSim, SO = FRE.shopOps;
  const fresh = () => new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} shop ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  const sha = t => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, t, -1);
  const rates = py.rates.map(([shopCost, buy, sell]) => ({ shopCost, buy, sell }));
  const code = t => (!t ? null : /EVENTMAIN/.test(t) ? 'eventmain' : /quest/.test(t) ? 'quest' : /Sealed/.test(t) ? 'seal' : /^Perin/.test(t) ? 'perin' : /flying/.test(t) ? 'ride' : t);
  const w0 = fresh(), D = w0.defines.defines, costs = w0.costs();
  const row = (p, dw) => [rates.map(r => [V.buyPrice(p, dw, r, D).pay, V.sellPrice(p, dw, r, D).get])];

  // 1. every item of every Penya shop, at 6 shop rates
  const penya = w0.chars.npcs.filter(n => FRE.shopOps.shopType(n.venderType) === 0);
  eq(penya.length, py.shops.length, `${py.shops.length} Penya NPCs in both copies`);
  let bad = 0, items = 0;
  penya.forEach((npc, i) => {
    const c = py.shops[i];
    const js = w0.simulate(npc).tabs.map(t => t.entries.map(en => { const dw = V.costOf(costs, en.prop); items++; return [en.prop.id, dw, ...row(en.prop, dw), code(V.sellRefused(en.prop, D))]; }));
    if ((npc.key !== c.key || JSON.stringify(js) !== JSON.stringify(c.tabs)) && bad++ < 3) ok(false, `prices of ${npc.key}`, `JS ${JSON.stringify(js).slice(0, 300)} vs Python ${JSON.stringify(c.tabs).slice(0, 300)}`);
  });
  eq(bad, 0, `${items} shop items × ${rates.length} rates: JS and Python pay / get back agree`);
  const ov = [...costs].sort((a, b) => a[0] - b[0]).map(([id, o]) => [id, o.base, o.cost, o.by[o.by.length - 1].npc.key]);
  eq(JSON.stringify(ov), JSON.stringify(py.overrides), `${py.overrides.length} AddShopItem prices: same final price and the same NPC wins (load order)`);
  let sBad = 0;
  for (const [id, dw, want] of py.small) {
    const js = row(w0.vendorIndex.byId.get(id), dw)[0];
    if (JSON.stringify(js) !== JSON.stringify(want) && sBad++ < 3) ok(false, `price of ${id} at dwCost ${dw}`, `JS ${JSON.stringify(js)} vs Python ${JSON.stringify(want)}`);
  }
  eq(sBad, 0, `${py.small.length} edge prices ("=", 0, 3, 2^24+1, INT_MAX, Perin): JS and Python agree`);
  eq(JSON.stringify(py.refusals.map(([id]) => [id, code(V.sellRefused(w0.vendorIndex.byId.get(id), D))])), JSON.stringify(py.refusals), 'items NPCs refuse to buy (event, quest, sealed, Perin, vagrant flying): same');
  eq(JSON.stringify(py.refusals.map(r => r[1])), JSON.stringify(['eventmain', 'quest', 'seal', 'perin', 'ride', null, null]), 'each refusal kind is refused (and a non-vagrant flying item and Scroll of Awakening are not)');

  // the C++ by hand
  const awake = w0.vendorIndex.byId.get(D.get('II_SYS_SYS_SCR_AWAKE'));
  eq(V.buyPrice(awake, 100000, null, D).pay, 100000, 'Scroll of Awakening: players pay 100,000');
  eq(V.sellPrice(awake, 100000, null, D).get, 25000, '… and get back 25,000 (a quarter)');
  eq(V.buyPrice(awake, 0xffffffff, null, D).pay, 1, 'dwCost "=": players pay 1 (GetCost -1, minimum 1)');
  eq(V.sellPrice(awake, 3, null, D).get, 1, 'dwCost 3: 3 / 4 = 0 -> sells for 1');
  eq(V.buyPrice(awake, 16777217, null, D).pay, 16777216, 'dwCost 16,777,217: the float rounds it to 16,777,216');
  eq(V.buyPrice(awake, 2147483647, null, D).pay, 1, 'dwCost INT_MAX: the float overflows (INT_MIN), players pay 1');
  eq(V.buyPrice(w0.vendorIndex.byId.get(D.get('II_SYS_SYS_SCR_PERIN')), 5, null, D).pay, 100000000, 'Perin costs PERIN_VALUE');
  ok(w0.diags.some(d => d.code === 'C_PRICE_MIN1' && /II_CHP_RED/.test(d.message)), 'C_PRICE_MIN1: a Secret Room NPC sells Red Chips for 1 Penya (dwCost 0 since 94881aa2)');

  // 2. every Penya tab with rules -> fixed items, one after another: byte-identical files and the same tabs
  const w = fresh();
  let cBad = 0;
  for (const c of py.converts) {
    const npc = w.chars.npcs.filter(n => n.key === c.key && n.file.toLowerCase() === c.file).pop();
    const map = o => new Map(Object.entries(o || {}).map(([k, v]) => [Number(k), v]));
    const edits = { omit: new Set((c.edits.omit || []).map(Number)), price: map(c.edits.price), slot: map(c.edits.slot) };
    const plan = V.ruleToFixedPlan(w.vendorIndex, npc, c.tab, w.simulate(npc), edits);
    if (plan.blocked || c.blocked) { if (!(plan.blocked && c.blocked) && cBad++ < 3) ok(false, `${c.key} tab ${c.tab + 1}`, `JS ${plan.blocked} vs Python ${c.blocked}`); continue; }
    w.apply(c.file, SO.convertRules(w.files.get(c.file).text, npc, plan), 'convert');
    const after = w.chars.npcs.filter(n => n.key === c.key && n.file.toLowerCase() === c.file).pop();
    const tabs = w.simulate(after).tabs.map(t => t.entries.map(en => en.prop.id));
    const won = w.costs().get(D.get('II_SYS_SYS_SCR_AWAKE') >>> 0);
    const awakeJs = won ? [won.cost, won.by[won.by.length - 1].npc.key] : null;
    if (JSON.stringify(awakeJs) !== JSON.stringify(c.awake) && cBad++ < 3) ok(false, `after ${c.key}: Scroll of Awakening's price`, `JS ${JSON.stringify(awakeJs)} vs Python ${JSON.stringify(c.awake)}`);
    if ((sha(w.files.get(c.file).text) !== c.sha || JSON.stringify(tabs) !== JSON.stringify(c.tabs)) && cBad++ < 3)
      ok(false, `${c.key} tab ${c.tab + 1} made fixed`, `tabs JS ${JSON.stringify(tabs).slice(0, 200)} vs Python ${JSON.stringify(c.tabs).slice(0, 200)}`);
  }
  eq(cBad, 0, `${py.converts.length} rule tabs made fixed items, one after another: files byte-identical to the Python copy, same tabs`);
  const peachCase = py.converts.find(c => c.key === 'MaFl_Peach');
  const before0 = w0.simulate(w0.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop()).tabs.map(t => t.entries.map(en => en.prop.id));
  eq(JSON.stringify(peachCase.tabs), JSON.stringify(before0), 'Peach with a price typed: players see the same 6 items in the same order');
  const peachNow = w.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop();
  eq(w.pricedTab(peachNow, 0)[0].pay, 777, 'Peach typed 150,000, but players pay Raia\'s 777: her AddShopItem loads later and is server-wide');
  ok(w.diags.some(d => d.code === 'C_PRICE_CONFLICT' && /II_SYS_SYS_SCR_AWAKE/.test(d.message)), 'two prices for one item: C_PRICE_CONFLICT');
  // a new price is also written on the item's other priced lines, or the line loaded last would win
  const awakeId = D.get('II_SYS_SYS_SCR_AWAKE') >>> 0;
  const op = SO.otherPriceParts(w, awakeId, 5000, null);
  eq(op.lines.map(l => `${l.npc.key}=${l.was}`).join(','), 'MaFl_Peach=150000,MaEw_Raya=777', 'otherPriceParts: both priced lines of Scroll of Awakening (Peach 150,000, Raia 777)');
  w.applyGroup(op.parts, 'same price');
  ok(w.costs().get(awakeId).cost === 5000 && !w.diags.some(d => d.code === 'C_PRICE_CONFLICT' && /II_SYS_SYS_SCR_AWAKE/.test(d.message)), 'after: one price (5,000) everywhere, no C_PRICE_CONFLICT');
  eq(SO.otherPriceParts(w, awakeId, 5000, null).lines.length, 0, 'lines already at that price are left alone');
  w.undo();
  for (let k = 0; k < py.converts.length; k++) w.undo();
  ok(fixtureFiles().get('character.inc').text === w.files.get('character.inc').text, `${py.converts.length} undos give character.inc back byte for byte`);

  // 3. + Rule / a rule changed, and the Spec_Item edits
  for (const c of py.rules) {
    if (c.name === 'fixed line above the rules') {
      const wr = fresh(), t = wr.files.get('character.inc').text;
      const first = wr.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop().statements.find(r => r.cmd === 'AddVendorItem');
      const at = FRE.textOps.lineStart(t, first.start);
      wr.apply('character.inc', [{ start: at, end: at, insert: '\t\tAddShopItem( 0, II_SYS_SYS_SCR_AMPESS );\r\n' }], 'setup');
      const pe = wr.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop();
      const before = wr.simulate(pe).tabs.map(x => x.entries.map(en => en.prop.id));
      wr.apply('character.inc', SO.convertRules(wr.files.get('character.inc').text, pe, V.ruleToFixedPlan(wr.vendorIndex, pe, 0, wr.simulate(pe), {})), c.name);
      const tabs = wr.simulate(wr.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop()).tabs.map(x => x.entries.map(en => en.prop.id));
      ok(sha(wr.files.get('character.inc').text) === c.sha && JSON.stringify(tabs) === JSON.stringify(c.tabs) && JSON.stringify(tabs) === JSON.stringify(c.before) && JSON.stringify(before) === JSON.stringify(c.before),
        'a fixed line above the rules: the new lines go above it, same tab, identical to the Python copy');
      continue;
    }
    const wr = fresh(), peach = wr.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop();
    const t = wr.files.get('character.inc').text;
    const rules = peach.statements.filter(r => r.cmd === 'AddVendorItem');
    const ruleOf = r => ({ slot: r.args.slot.value, ik3: r.args.ik3.define, job: r.args.job.value, rareMin: r.args.rareMin.value, rareMax: r.args.rareMax.value });
    const sp = c.name === 'add a rule' ? SO.addRule(t, peach, { slot: 0, ik3: 'IK3_GENERAL_RANDOMOPTION_GEN', job: -1, rareMin: 0, rareMax: 400 })
      : c.name === 'rarity max 200' ? SO.setRule(t, rules[0], Object.assign(ruleOf(rules[0]), { rareMax: 200 }))
      : SO.setRule(t, rules[1], Object.assign(ruleOf(rules[1]), { rareMin: 0 }));
    wr.apply('character.inc', sp, c.name);
    const tabs = wr.simulate(wr.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop()).tabs.map(x => x.entries.map(en => en.prop.id));
    ok(sha(wr.files.get('character.inc').text) === c.sha && JSON.stringify(tabs) === JSON.stringify(c.tabs), `rule "${c.name}": character.inc and Peach's tabs identical to the Python copy`);
  }
  for (const c of py.spec) {
    const ws2 = fresh(), it = ws2.itemById(D.get(c.define)), t = ws2.files.get('spec_item.txt').text;
    const sp = c.field === 'dwCost' ? FRE.itemOps.setCost(t, it, c.value === '=' ? null : c.value, ws2.defines.defines) : FRE.itemOps.setShopAble(t, it, true, ws2.defines.defines);
    ws2.apply('spec_item.txt', sp, c.name);
    ok(sha(ws2.files.get('spec_item.txt').text) === c.sha, `Spec_Item "${c.name}" (${c.define} ${c.field}): identical to the Python copy`);
    const pe = ws2.chars.npcs.filter(n => n.key === 'MaFl_Peach').pop();
    const pt = ws2.pricedTab(pe, 0);
    if (c.name === 'own price 150000') eq(pt[0].pay, 150000, 'own price 150,000: Peach and Raia charge 150,000 (rule items use dwCost)');
    if (c.name === 'no price') ok(pt[0].pay === 1 && ws2.newBlocking().length === 0 && ws2.diags.some(d => d.code === 'C_PRICE_MIN1' && d.npcKey === 'MaFl_Peach'), 'own price "=": players pay 1, C_PRICE_MIN1 warns (does not block)');
    if (c.name === 'hidden from rules') ok(!pt.some(x => x.prop.item.define === 'II_SYS_SYS_SCR_PETAWAKE'), 'dwShopAble -1: Pet Awakening leaves the rule tab');
  }
  throws(() => SO.addRule('', w0.chars.npcs[0], { slot: 0, ik3: 'IK3_X', job: -1, rareMin: 5, rareMax: 2 }), 'a rule whose highest rarity is below the lowest is refused');
  throws(() => SO.convertRules('', w0.chars.npcs[0], { blocked: 'chip shops ignore AddVendorItem rules' }), 'a blocked plan is refused');
}

section('rules windows: + Menu → Rules text (the npc-board client change; JS and Python copies agree)');
{
  const O = FRE.menuOps;
  const fresh = () => new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} board ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  const sha = t => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1, t, -1);
  let pBad = 0;
  for (const c of py.parsed) {
    const js = FRE.boardText.parse(c.text).map(p => [p.text, p.color, p.bold, p.underline, p.strike]);
    if (JSON.stringify(js) !== JSON.stringify(c.pieces) && pBad++ < 3) ok(false, `text ${JSON.stringify(c.text)}`, `JS ${JSON.stringify(js)} vs Python ${JSON.stringify(c.pieces)}`);
  }
  eq(pBad, 0, `${py.parsed.length} texts read like CEditString::ParsingString (colours, bold, \\n, a lone #, uppercase hex): JS = Python`);
  eq(FRE.boardText.parse('#cff00ff00x')[0].color, 0xff00ff00, '#cff00ff00 is green');
  eq(FRE.boardText.code('#FFCC00'), '#cffffcc00', 'the Colour button writes lowercase hex (uppercase garbles the colour in game)');
  for (const c of py.specs) {
    const w = fresh();
    const name = FRE.menuNameFromLabel(w, c.label);
    eq(name, c.menu, `"${c.label}" -> ${c.menu}`);
    const plan = O.boardPlan(w, { npcKey: c.npcKey, name, label: c.label, text: c.text });
    eq(plan.ids[0], c.id, `${c.name}: menu id ${c.id}`);
    w.applyGroup(plan.parts, 'rules');
    const same = Object.entries(c.files).every(([f, h]) => sha(w.files.get(f.toLowerCase()).text) === h);
    ok(same && !w.files.get('exchange_script.txt').dirty, `${c.name}: defineNeuz.h, defineText.h, textClient.inc/.txt.txt, character.inc identical to the Python copy; Exchange_Script.txt untouched`);
    const b = w.boardFile(c.id);
    ok(b && b.file.clientOnly && sha(b.file.text) === c.boardSha && b.file.text === c.board, `${c.name}: Client/Client/${O.boardFileName(c.id)} holds the text with CRLF line breaks`);
    const npc = w.chars.npcs.filter(n => n.key === c.npcKey).pop();
    const m = FRE.newNpcSim.rightClick(w, npc.menus).find(x => x.id === c.id);
    ok(m && m.label === c.label && (m.opens && m.opens.board ? 'board' : 'exchange') === c.opens, `${c.name}: right-click shows "${c.label}" and opens the rules window`);
    w.boardPatch = false;
    const m2 = FRE.newNpcSim.rightClick(w, npc.menus).find(x => x.id === c.id);
    eq(m2 && m2.opens && m2.opens.exchange ? 'exchange' : 'other', c.opensUnpatched, `${c.name}: a client without the change opens an empty swap window`);
    w.boardPatch = undefined;
    w.applyGroup(O.setBoardText(w, c.id, 'New text'), 'text');
    eq(w.boardTextOf(c.id), 'New text', 'the text changed later');
    w.applyGroup(O.setLabel(w, name, 'Renamed'), 'label');
    eq(w.texts.byId.get(7000 + c.id).text, 'Renamed', 'the right-click name changed later (textClient.txt.txt)');
    w.undo(); w.undo(); w.undo();
    ok(w.dirtyFiles().length === 0 && w.boardTextOf(c.id) === null, `${c.name}: three undos: nothing left to save, no rules file`);
  }
  const w = fresh();
  throws(() => O.boardPlan(w, { npcKey: 'MaFl_Peach', name: 'MMI_X_RULES', label: 'Rules', text: '   ' }), 'an empty text is refused');
  throws(() => O.boardPlan(w, { npcKey: 'MaFl_Peach', name: 'MMI_X_RULES', label: 'Rules', text: 'café' }), 'a character the client can\'t show is refused');
}

section('move an NPC / change its model: same-length .dyo rewrite (JS and Python copies agree)');
{
  const w = new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const { dyoFiles, worldFiles } = loadWorldFiles(FIXTURES, w);
  w.setMapFiles(dyoFiles, worldFiles);
  const E = FRE.npcEditOps;
  const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} npcmove ${FIXTURES}`);
  const py = JSON.parse(new TextDecoder().decode(out));
  ok(py.cases.length > 380, `Python moved / re-modelled ${py.cases.length} cases (every placed NPC once)`);
  const sha = b => GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA1, b);
  const npcOf = key => { const l = w.chars.byKey.get(key.toLowerCase()); return l && l[l.length - 1]; };
  const before = new Map([...w.mapFiles].map(([m, lower]) => [m, w.files.get(lower).serialize()]));
  let bad = 0;
  for (const { case: c, changed, back } of py.cases) {
    const npc = npcOf(c.key);
    const all = npc ? E.placementsOf(w, npc) : [];
    const spot = all.findIndex(p => p.map === c.map && all.filter(q => q.map === c.map).indexOf(p) === c.n);
    let why = null;
    try {
      const to = Object.assign({}, c.move || {}, c.model ? { model: c.model } : {});
      const plan = E.placePlan(w, npc, spot, to, c.all ? all.map((_, i) => i) : [spot]);
      if (plan.parts.length) w.applyGroup(plan.parts, c.name);
      const js = {};
      for (const [m, lower] of w.mapFiles) {
        const b = w.files.get(lower).serialize(), a = before.get(m);
        if (FRE.bytes.bytesEqual(a, b)) continue;
        let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
        js[m] = { sha: sha(b), size: b.length, bytes: n };
      }
      const now = E.placementsOf(w, npc);
      const jsBack = now.map(p => ({ map: p.map, n: now.filter(q => q.map === p.map).indexOf(p), x: p.x, y: p.y, z: p.z, angle: p.angle, model: p.model }));
      if (JSON.stringify(js) !== JSON.stringify(changed)) why = `files JS ${JSON.stringify(js)} vs Python ${JSON.stringify(changed)}`;
      else if (JSON.stringify(jsBack) !== JSON.stringify(back)) why = `read back JS ${JSON.stringify(jsBack)} vs Python ${JSON.stringify(back)}`;
      if (plan.parts.length) w.undo();
    } catch (e) { why = e.message; }
    if (why && bad++ < 3) ok(false, `case "${c.name}"`, why);
  }
  eq(bad, 0, `${py.cases.length} moves / model changes: same bytes and same read-back as the Python copy`);
  ok([...w.mapFiles].every(([m, lower]) => FRE.bytes.bytesEqual(w.files.get(lower).serialize(), before.get(m))), 'after every undo the map files are the originals');

  // the op itself: one spot moves, the model can go on all spots, nothing else changes
  const pb = npcOf('MaFl_Postbox'), spots = E.placementsOf(w, pb);
  eq(spots.length, 11, 'Postbox stands in 11 places');
  const juria = 'MI_MAFL_JURIA';
  const plan = E.placePlan(w, pb, 6, { x: spots[6].x + 6, model: juria }, spots.map((_, i) => i));
  eq(plan.changes.filter(c => c.field === 'x').map(c => c.spot).join(), '6', 'the position changes on the chosen spot only');
  eq(plan.changes.filter(c => c.field === 'model').length, spots.every(p => p.model === w.defines.defines.get(juria)) ? 0 : 11, 'the model goes on all 11 spots');
  ok(plan.parts.every(p => p.splices.every(sp => sp.end - sp.start === 4 && sp.insert.length === 4)), 'every splice rewrites 4 bytes in place (same file size)');
  eq(E.placePlan(w, pb, 0, { x: spots[0].x, y: spots[0].y, z: spots[0].z, angle: spots[0].angle }).changes.length, 0, 'the same spot: no change, nothing written');
  throws(() => E.placePlan(w, pb, 0, { model: 'II_SYS_SYS_SCR_AWAKE' }), 'an II_ name is refused as a model');
  throws(() => E.placePlan(w, pb, 99, { x: 1 }), 'a spot that does not exist is refused');
  // checks: the moved NPC does not overlap itself; a spot next to another NPC warns
  const peach = npcOf('MaFl_Peach'), pp = E.placementsOf(w, peach)[0];
  const diags = [], add = (code, severity, field, message) => diags.push({ code, severity, message });
  FRE.validateNpcSpot(w, w.files.get(pp.file), { x: pp.x + 0.5, y: pp.y, z: pp.z, angle: pp.angle }, add, pp.at);
  ok(!diags.some(d => d.code === 'NN_OVERLAP' && /MaFl_Peach/i.test(d.message || '')), 'its own record is skipped (half a step from where it stands)');
  const other = FRE.world.readDyo(w.files.get(pp.file).serialize()).placements.find(p => p.key.toLowerCase() !== 'mafl_peach');
  diags.length = 0;
  FRE.validateNpcSpot(w, w.files.get(pp.file), { x: other.x + 1, y: other.y, z: other.z, angle: 0 }, add, pp.at);
  ok(diags.some(d => d.code === 'NN_OVERLAP'), `a spot 1 step from another NPC (${other.key}): overlap warning`);
  diags.length = 0;
  FRE.validateNpcSpot(w, w.files.get(pp.file), { x: pp.x, y: pp.y, z: pp.z, angle: 400 }, add, pp.at);
  ok(diags.some(d => d.code === 'NN_POS' && d.severity === 'BLOCK'), 'facing 400 is blocked');
}

section('item list categories (loaders/item-category.js)');
{
  const w = new FRE.Workspace(fixtureFiles(), { only: 'npc' }).load();
  const items = [...w.items.items.values()].map(it => { const i = w.itemInfo(it); i.cat = FRE.itemCategory.of(i, w.defines); return i; });
  ok(items.every(i => FRE.itemCategory.GROUPS.includes(i.cat.group) && i.cat.sub), 'every item gets one category and a part of it');
  const cat = d => { const i = items.find(x => x.define === d); return i ? `${i.cat.group}|${i.cat.sub}` : null; };
  eq(cat('II_PET_BANG1'), 'Pets|Pickup pets', 'Baby Bang: pickup pet (IK3_PET)');
  eq(cat('II_PET_RACCON'), 'Pets|Buff pets', 'Tiny Tanuki: buff pet (IK3_PET + dwReferStat1 PET_VIS, IsVisPet)');
  eq(cat('II_PET_PENGUIN01'), 'Pets|Pickup pets', 'Penguin Buff Pet: dwReferStat1 -1, so the game treats it as a pickup pet');
  ok(items.filter(i => i.ik3Name === 'IK3_EGG').every(i => i.cat.sub === 'Raised pets'), 'every IK3_EGG is a raised pet');
  eq(cat('II_SYS_SYS_SCR_AWAKE'), 'Scrolls|Awakening & blessing', 'Scroll of Awakening');
  ok(items.filter(i => i.cat.group !== 'Weapons' && i.cat.group !== 'Armor' && i.cat.group !== 'System').every(i => i.rarity === 'normal' || i.rarity === 'other'),
    'outside Weapons and Armor every item is Normal: the rarity chips only show for them');
  ok(items.filter(i => i.cat.group === 'Other').length < 150, `few items left in Other (${items.filter(i => i.cat.group === 'Other').length})`);
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
