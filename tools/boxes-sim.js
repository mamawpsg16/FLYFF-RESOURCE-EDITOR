// Opening a box by hand:   gjs -m tools/boxes-sim.js <II_ box> [n=1000] [free=10] [seed=1] [keep=<box time limit, minutes>]
//   [bound] [locked] [expired] [trading] [have] [show=<first n opens one by one>] [--fixtures]   (from the repo root)
// Runs src/loaders/boxes-sim.js (CUser::OnDoUseItem -> DoUsePackItem / DoUseGiftbox, CGiftboxMan::Open, CreateItem)
// with the server's random generator, each open on the same starting bag, and prints how often each item came out
// next to the chance the editor shows. `have` = the bag already holds 1 of each item (shows stacking).
// Reads test-data (or test-data/fixtures); never writes any file.
// Example: gjs -m tools/boxes-sim.js II_SYS_SYS_SCR_BXPIG n=10000
//          gjs -m tools/boxes-sim.js II_SYS_SYS_SCR_BXMBLKDRAGON01 free=3 show=2
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures'), bound = flag('bound'), locked = flag('locked'), expired = flag('expired'), trading = flag('trading'), have = flag('have');
const opt = (k, d) => { const a = argv.find(x => x.startsWith(k + '=')); if (a) argv.splice(argv.indexOf(a), 1); return a ? Number(a.slice(k.length + 1)) : d; };
const n = opt('n', 1000), free = opt('free', 10), seed = opt('seed', 1), keep = opt('keep', 0), show = opt('show', 0);
const def = argv[0];
if (!def) throw new Error('usage: gjs -m tools/boxes-sim.js <II_ box> [n=] [free=] [seed=] [keep=] [bound] [locked] [expired] [trading] [have] [show=]');

const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'boxes' }).load();
const D = ws.defines.defines, S = FRE.boxesSim, Bx = FRE.boxes, fmt = v => FRE.num.group(v);
if (!D.has(def)) throw new Error(`${def} is not defined`);
const id = D.get(def) >>> 0, m = ws.models.boxes;
const pack = m.pack.boxes.get(id), gift = m.gift.boxes.get(id), box = pack || gift;
if (!box) throw new Error(`${def} is not a box (not in propGiftbox.inc or propPackItem.inc)`);
const name = i => { const it = ws.itemById(i); return it && it.name ? it.name : String(i); };
const pct = x => `${(x * 100).toFixed(2)}%`;
const env = S.envFor(ws);
const haveList = have ? box.lines.map(l => ({ id: l.item.value >>> 0, num: 1 })).filter(x => ws.itemById(x.id)) : [];

print(`\n${name(id)} (${def})  ·  ${pack ? `set: all ${pack.lines.length} items${pack.span ? `, ${pack.span} minutes each` : ''}` : `random box: 1 of ${gift.lines.length}`}${pack && gift ? '  ·  also in propGiftbox.inc (never used: the set wins)' : ''}`);
print(`Bag: ${free} free slots${have ? ', 1 of each item already in it' : ''}${bound ? ', box bound' : ''}${keep ? `, box time limit ${keep} min` : ''}${locked ? ', box locked' : ''}${expired ? ', box expired' : ''}${trading ? ', trading' : ''}`);

if (show) {
  const rnd = FRE.xRandom.rng(seed);
  const start = S.bag(env, { id, num: 1, bound, keep, locked, expired }, { free, have: haveList });
  for (let k = 1; k <= show; k++) {
    const r = S.open(env, FRE.exchangeSim.clone(start), 0, rnd, { trading });
    print(`\nOpen ${k}: ${r.refused ? `refused (${r.refused})` : r.crash ? `CRASH: ${r.crash}` : `roll ${r.roll === null ? '-' : r.roll}`}`);
    for (const t of r.texts) print(`   reads: ${t}`);
    for (const it of r.got) print(`   got ${name(it.id)} ×${it.num}${it.flag & 2 ? ' (bound)' : ''}${it.keep ? `, ${it.keep} min` : ''}${it.upgrade ? `, +${it.upgrade}` : ''}${it.stacked ? `, ${it.stacked} joined a stack` : ''}`);
    for (const it of r.lost) print(`   LOST ${name(it.id)} ×${it.num} (did not fit)`);
  }
}

const r = S.run(env, id, { n, free, seed, bound, keep, locked, expired, trading, have: haveList });
if (r.crash) print(`\nThe server would crash: ${r.crash}`);
print(`\n${fmt(r.opens)} opens: ${fmt(r.used)} used the box${Object.keys(r.refused).length ? `, refused ${Object.entries(r.refused).map(([k, v]) => `${fmt(v)}× ${k}`).join(', ')}` : ''}; ${fmt(r.lost)} items lost`);
const ch = gift && !pack ? Bx.chances(gift) : null;
box.lines.forEach((l, i) => {
  const s = r.lines.get(i) || { times: 0, qty: 0, lost: 0, stacked: 0 };
  print(`  ${name(l.item.value >>> 0).padEnd(40)} ${fmt(s.times).padStart(7)}  ${pct(s.times / r.opens).padStart(7)}${ch ? `  (shown ${pct(ch[i])})` : ''}  items ${fmt(s.qty)}${s.lost ? `  lost ${fmt(s.lost)}` : ''}${s.stacked ? `  stacked ${fmt(s.stacked)}` : ''}`);
});
