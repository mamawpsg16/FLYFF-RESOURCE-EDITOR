// A set by hand:   gjs -m tools/sets-sim.js <set id | name> [worn=all|cap,suit,hand,foot,…] [plus=<n>] [expired=<slot,…>] [--fixtures]
//                  gjs -m tools/sets-sim.js plus          (the +N armor bonus table)
// Runs src/loaders/sets-sim.js (SetDestParamSetItem / ResetDestParamSetItem / GetSetItem / SetSetItemAvail / PutSetItemOpt) on
// test-data (or test-data/fixtures); never writes. worn: the pieces put on, in this order (a slot word, or a piece's position
// 1-8); every piece goes into its listed slot. Prints the totals putting them on one by one and after a relog, and the tooltip.
// Example: gjs -m tools/sets-sim.js 1 worn=cap,suit,hand plus=5
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--'));
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'sets' }).load();
const m = ws.models.sets, D = ws.defines.defines, Sim = FRE.setsSim, words = FRE.itemTooltip.dstWords(ws);
const stat = (d, a) => { const w = words.get(d); return `${w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${d}`} ${a >= 0 ? '+' : ''}${a}${w && w.rate ? '%' : ''}`; };
const part = v => (ws.defines.byValue('PARTS_', v) || String(v));
for (const d of ws.diags) print(`  ${d.severity} ${d.code}: ${d.message}`);
if (!what) print('usage: gjs -m tools/sets-sim.js <set id | name> [worn=…] [plus=<n>]   or   gjs -m tools/sets-sim.js plus');
else if (what === 'plus') {
  m.plus.rows.forEach((r, i) => print(`+${i + 1}: Hit ${r.hit}%, Block ${r.block}%, Max HP ${r.hp}%, AddMagic ${r.magic}, STR/DEX/INT/STA ${r.added}${i >= 10 ? '  (never used)' : ''}`));
} else {
  const set = /^\d+$/.test(what) ? m.byId.get(Number(what)) : m.sets.find(s => s.name.toLowerCase().includes(what.toLowerCase()));
  if (!set) print(`no set ${what}`);
  else {
    const env = Sim.envFor(ws);
    print(`${set.name} (set ${set.id}, ${set.elems.length} pieces)`);
    set.elems.forEach((p, i) => print(`  ${i + 1}. ${env.name(p.id) || p.define} in ${part(p.part)}`));
    for (const r of set.avail) print(`  ${r.need} pieces: ${stat(r.dst, r.adj)}`);
    const WORD = { cap: 'PARTS_CAP', helmet: 'PARTS_CAP', suit: 'PARTS_UPPER_BODY', hand: 'PARTS_HAND', gauntlets: 'PARTS_HAND', foot: 'PARTS_FOOT', boots: 'PARTS_FOOT' };
    const pick = !opt.worn || opt.worn === 'all' ? set.elems : opt.worn.split(',').map(w => /^\d+$/.test(w) ? set.elems[Number(w) - 1]
      : set.elems.find(p => p.part === D.get(WORD[w.toLowerCase()] || ('PARTS_' + w.toUpperCase())))).filter(Boolean);
    const expired = new Set((opt.expired || '').split(',').filter(Boolean).map(w => D.get(WORD[w.toLowerCase()] || ('PARTS_' + w.toUpperCase()))));
    const plus = Number(opt.plus || 0);
    const ch = Sim.wear(env, pick.map(p => [p.part, { id: p.id, plus, expired: expired.has(p.part) }]));
    const lg = Sim.login(env, ch.worn);
    print(`\nworn: ${pick.map(p => env.name(p.id)).join(', ') || 'nothing'}${plus ? ` at +${plus}` : ''}`);
    print(`putting them on: ${Sim.statList(ch).map(([d, a]) => stat(d, a)).join(', ') || 'nothing'}`);
    print(`after a relog:   ${Sim.statList(lg).map(([d, a]) => stat(d, a)).join(', ') || 'nothing'}`);
    const n = Sim.getSetItem(env, ch, null);
    print(`+N armor bonus: ${n > 0 ? `+${n}${n > 10 ? ' (nothing above +10)' : ''}` : 'no (needs suit, gauntlets, boots and helmet)'}`);
    print('\nthe tooltip of piece 1:');
    for (const l of Sim.tooltip(env, ch, set.elems[0].id, new Map())) for (const t of l.text.split('\n').slice(1)) if (t) print(`  [${l.color}] ${t}`);
  }
}
