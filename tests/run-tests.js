// Core test suite (no browser needed):   gjs -m tests/run-tests.js
// - reads fixtures from test-data/Resource (copies, see README)
// - reads the real ../FLYFF-V19-SOURCE/Server/Resource READ-ONLY for the
//   round-trip test; nothing is ever written anywhere.
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, readBytes, listDir, loadFolder, openSource, exists } from './gjs-env.js';

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
