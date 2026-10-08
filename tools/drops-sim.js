// Killing a monster by hand:   gjs -m tools/drops-sim.js <MI_ monster> [kills=1000] [level=<player level>] [seed=1]
//   [loops=<rolls per kill>] [world=<world id>] [fortune] [bagfull] [show=<first n kills one by one>] [--fixtures]   (from the repo root)
// Runs src/loaders/drops-sim.js (CMover::DropItem with GetAt, the Maxitem stop, PenyaTable, DropKind) with the
// server's random generator, and prints how often each line dropped next to the chance the editor shows.
// Reads test-data (or test-data/fixtures); never writes any file.
// Example: gjs -m tools/drops-sim.js MI_AIBATT1 kills=10000
//          gjs -m tools/drops-sim.js MI_DU_METEONYKER2 kills=2000 loops=2 show=3
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures'), fortune = flag('fortune'), bagFull = flag('bagfull');
const opt = (k, d) => { const a = argv.find(x => x.startsWith(k + '=')); if (a) argv.splice(argv.indexOf(a), 1); return a ? Number(a.slice(k.length + 1)) : d; };
const kills = opt('kills', 1000), seed = opt('seed', 1), loops = opt('loops', 1), world = opt('world', 1), show = opt('show', 0);
const level = opt('level', null);
const def = argv[0];
if (!def) throw new Error('usage: gjs -m tools/drops-sim.js <MI_ monster> [kills=] [level=] [seed=] [loops=] [world=] [fortune] [bagfull] [show=]');

const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'drops' }).load();
const D = ws.defines.defines, S = FRE.dropsSim, Dr = FRE.drops, fmt = n => FRE.num.group(n);
if (!D.has(def)) throw new Error(`${def} is not defined`);
const id = D.get(def);
const env = S.envFor(ws, id);
const mv = env.mover;
const o = { kills, seed, loops, worldId: world, fortune, bagFull, playerLevel: level === null ? (mv ? mv.level : 1) : level };
const name = e => { const it = ws.itemById(e.itemId != null ? e.itemId : e); return it && it.name ? it.name : (e.define || String(e)); };

const rates = ws.dropContext.rates;
print(`\n${mv ? mv.name : def} (${def})  ·  lv ${mv ? mv.level : '?'} ${mv ? mv.rank : ''}${mv && mv.flying ? ' · flying (bag)' : ''}  ·  max items per kill ${env.maxItems || 'no limit'}`);
print(`Player level ${o.playerLevel}, ${loops} roll(s) per kill, world ${world}${fortune ? ', Fortune Circle' : ''}${bagFull ? ', bag full' : ''}  ·  Event.lua on now: ${rates.events.filter(e => e.on).map(e => e.name).join(', ') || 'none'} (item x${rates.item}, Penya x${rates.gold})`);
const pr = S.penyaRange(env, o);
print(pr ? `Penya per kill: ${fmt(pr.min)} - ${fmt(pr.max)} (from ${pr.from})` : 'No DropGold: no Penya');

if (show) {
  const rnd = FRE.xRandom.rng(seed);
  for (let k = 1; k <= show; k++) {
    const r = S.kill(env, rnd, o);
    print(`\nKill ${k}: ${r.rolls.map(x => x.gate ? (x.stop != null ? `rolled, stopped at line ${x.stop + 1}` : 'rolled') : 'no drop roll').join('; ')}; Penya ${fmt(r.gold)}`);
    for (const d of r.drops) print(`   ${name(d.id)} x${d.n}${d.plus ? ' +' + d.plus : ''}${d.opt ? ' (random option ' + d.opt + ')' : ''} -> ${d.where}  [${typeof d.from === 'number' ? 'line ' + (d.from + 1) : d.from}]`);
    if (r.crash) print(`   SERVER CRASH: ${r.crash.why}`);
  }
}

const t0 = Date.now();
const r = S.run(env, o);
const ex = S.exactChances(env, o);
print(`\n${fmt(r.kills)} kills (${Date.now() - t0} ms, seed ${seed}): a drop roll ${fmt(r.gates)} times, the max items per kill stopped the list ${fmt(r.stops)} times`);
if (r.crash) print(`SERVER CRASH at kill ${r.crash.kill}: ${r.crash.why}`);
print(`Penya: ${fmt(Math.round(r.gold.total / Math.max(1, r.kills)))} per kill on average (${fmt(r.gold.min)} - ${fmt(r.gold.max)})\n`);
print('  line  item                                      file value      editor shows   simulated');
ex.lines.forEach((l, i) => {
  if (l.entry.kind !== 'item') return;
  const s = r.lines.get(i);
  const sim = s ? s.times / r.kills : 0;
  if (!s && l.perKill * r.kills < 0.5) return;           // never expected to show up at this many kills
  print(`  ${String(i + 1).padStart(4)}  ${(name(l.entry) + (l.entry.event ? ' (event)' : '')).slice(0, 40).padEnd(40)}  ${fmt(l.entry.probability).padStart(14)}  ${Dr.pct(l.perKill).padStart(13)}  ${Dr.pct(sim).padStart(10)}`);
});
const kinds = [...r.kinds.values()];
if (kinds.length) {
  print('\nRandom gear:');
  for (const s of kinds.sort((a, b) => b.times - a.times)) print(`   ${name(s.id).slice(0, 40).padEnd(40)}  ${fmt(s.times)} kills`);
}
