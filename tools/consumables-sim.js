// A consumable by hand:   gjs -m tools/consumables-sim.js <define | name> [level=N] [again=<ms>] [with=<define>] [--fixtures]
//                         gjs -m tools/consumables-sim.js group=<balloon|couple|stat|premium|buff|keep|food|hard>   (one group's list)
// Runs src/loaders/consumables-sim.js (DoUseItem -> IsDoUseBuff / balloon / Once / Keep -> ApplySkill -> AddBuff / Overwrite ->
// ApplyParam / SetDestParam; Release on expiry) on test-data (or test-data/fixtures); never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/consumables-sim.js …
// Example: gjs -m tools/consumables-sim.js II_CHR_FOO_COO_BULLHAMS again=1800000
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--'));
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'consumables' }).load();
const m = ws.models.consumables, Sim = FRE.consumablesSim, env = Sim.envFor(ws), words = FRE.itemTooltip.dstWords(ws);
const label = d => { const w = words.get(d); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : (ws.defines.byValue('DST_', d) || `stat ${d}`); };
const stats = p => Sim.statList(p).map(([d, a]) => `${label(d)} ${a}`).join(', ') || 'nothing';
const slots = c => c.slots.filter(s => s.on).map(s => `${label(s.dst)} ${s.adj}`).join(', ') || 'no stats';
if (opt.group) {
  for (const c of m.items.filter(x => x.group === opt.group)) print(`${c.name} (${c.define}): ${slots(c)}, ${FRE.consumables.timeText(c.time)}`);
} else if (!what) print('usage: tools/consumables-sim.js <define | name> [level=N] [again=<ms>] [with=<define>]   or   group=<key>');
else {
  const c = m.byDefine.get(what) || m.items.find(x => x.name.toLowerCase().includes(what.toLowerCase()));
  if (!c) print(`no consumable ${what}`);
  else {
    const level = Number(opt.level || Math.max(1, c.minLv));
    print(`${c.name} (${c.define}, ${c.path || 'hard-coded'}, group ${c.group}): ${slots(c)}, time ${FRE.consumables.timeText(c.time)}`);
    if (c.hard) print(`hard-coded: ${c.hard}`);
    else {
      const steps = [];
      if (opt.with) { const o = m.byDefine.get(opt.with); if (o) steps.push(['use', o.id]); else print(`no consumable ${opt.with}`); }
      steps.push(['use', c.id]);
      if (opt.again) steps.push(['tick', Number(opt.again)], ['use', c.id]);
      const r = Sim.run(env, steps, level);
      r.results.forEach((x, i) => print(`use ${i + 1}: ${x.ok ? (x.fresh ? 'new buff' : 'timer restarted') : 'refused: ' + x.why}`));
      print(`stats now: ${stats(r.p)}${r.p.instant.length ? `; at once: ${r.p.instant.map(i => `${label(i.dst)} ${i.adj}`).join(', ')}` : ''}`);
      for (const [id, total, left] of Sim.buffList(r.p)) print(`buff ${m.byId.get(id) ? m.byId.get(id).name : id}: ${FRE.consumables.timeText(left)} left of ${FRE.consumables.timeText(total)}`);
      const t = c.time | 0;
      if (t > 0 && c.time !== 999999999) { Sim.tick(env, r.p, t); print(`after ${FRE.consumables.timeText(t)} more: ${stats(r.p)}`); }
    }
  }
}
