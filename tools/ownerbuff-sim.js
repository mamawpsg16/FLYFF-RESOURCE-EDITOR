// Secret Room Winner / Guild Siege Winner by hand:   gjs -m tools/ownerbuff-sim.js [0|1] [story number] [--fixtures]   (from the repo root)
// Runs src/loaders/ownerbuff-sim.js (OwnerBuffMng::IsHolder / Refresh / RefreshAll, V19 feat/secret-room 885aa231) on test-data's
// OwnerBuff.txt (or test-data/fixtures); never writes. Prints each step, the snapshots sent and every player's buff bits + stats.
// Example: gjs -m tools/ownerbuff-sim.js 0 0      (the Secret Room story)
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const [type = '0', story = '0'] = argv.filter(a => a !== '--fixtures');
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'rates' }).load();
const ob = ws.models.rates.owner;
if (!ob) { print('OwnerBuff.txt is not in the folder (it is on V19 branch feat/secret-room): run tools/refresh-fixtures.sh first'); } else {
  const defs = FRE.rates.OWNER_TYPES.map(t => FRE.rates.ownerDef(ob, t.type));
  for (const [i, d] of defs.entries()) print(`${FRE.rates.OWNER_TYPES[i].label}: ${d.on ? 'on' : 'off'}, ${d.bonus.filter(b => b.dst).map(b => `stat ${b.dst} ${b.adj}`).join(', ') || 'no stats'}, "${d.name}", icon ${d.icon}`);
  const st = FRE.ownerBuffSim.STORIES[Number(type)][Number(story)];
  print(`\nStory: ${st.name}`);
  for (const r of FRE.ownerBuffSim.run(defs, st.steps)) {
    print(`- ${FRE.ownerBuffSim.words(r.step)}`);
    for (const s of r.sent) print(`    player ${s.player}: ${s.on ? 'GETS' : 'LOSES'} "${s.name}"`);
    for (const [id, p] of Object.entries(r.players)) if (p.online) print(`    player ${id} (guild ${p.guild}): bits ${p.bits}, stats ${JSON.stringify(p.stats)}`);
  }
}
