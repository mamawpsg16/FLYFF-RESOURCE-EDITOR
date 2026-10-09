// A couple by hand:   gjs -m tools/couple-sim.js [first=male|female] [second=male|female] [points=<n>] [--fixtures]   (from the repo root)
// Runs src/loaders/couple-sim.js (ProcessCouple, CCouple::AddExperience, GetLevel, PostItem, ActiveCoupleBuff) on test-data
// (or test-data/fixtures); never writes. points=<n>: the level after a server restart with n saved points (Restore).
// Example: gjs -m tools/couple-sim.js first=male second=female
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const sexOf = s => (s === 'female' ? 1 : 0);
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'rates' }).load();
const c = ws.models.rates.couple, items = ws.items.items, fmt = n => FRE.num.group(n);
if (!c) { print('couple.inc not found'); } else {
  const words = FRE.itemTooltip.dstWords(ws);
  const name = id => { const it = items.get(id); return it ? `${it.name} (${it.define})` : `item ${id}`; };
  const sex = [sexOf(opt.first || 'male'), sexOf(opt.second || 'female')];
  for (const d of ws.diags.filter(x => x.file === 'couple.inc')) print(`  ${d.severity} ${d.code}: ${d.message}`);
  for (const x of FRE.coupleSim.ladder(c, items, sex)) {
    const hrs = x.ms === null ? null : x.ms / 3600000;
    print(`level ${x.level}: ${x.points === null ? 'never reached' : `${fmt(x.points)} points, ${hrs.toFixed(1)} h online together`}`);
    if (x.buffs.stats.length) print(`  buffs: ${FRE.coupleOps.describe(x.buffs.stats, words)}`);
    for (const p of x.posts) print(`  mail to the ${p.to} partner: ${name(p.id)} ×${p.num}${p.flag === 2 ? ', bound' : ''}${p.minutes > 0 ? `, ${p.minutes} min` : ''}`);
  }
  if (opt.points) print(`after a server restart with ${fmt(Number(opt.points))} saved points: level ${FRE.coupleSim.restore(c, Number(opt.points))}`);
}
