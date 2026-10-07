// Move an existing NPC / change its model by hand:   gjs -m tools/npcmove-sim.js <NPC key> [edit ...] [--fixtures]
// (from the repo root). Applies the change in memory (src/edit/npcedit-ops.js placePlan), then prints what the
// server reads back from the map file (CWorld::LoadObject → ReadObj → CObj::Read / CMover::Read) and where players
// find the NPC (src/loaders/newnpc-sim.js whereAt). Never writes any file.
//   spot=<N>           which of its spots moves (1-based; default 1)
//   x=<n> y=<n> z=<n>  the new /position (world units, as /position prints them)
//   angle=<n>          the new facing (degrees)
//   model=MI_X         the new body; model=MI_X! puts it on every spot
//   --fixtures         read test-data/fixtures/Resource instead of test-data/Resource
// Example: gjs -m tools/npcmove-sim.js MaFl_Postbox spot=7 x=+6 model=MI_MAFL_JURIA!
// A number may start with + or - after the =, e.g. x=+6: added to the current value.
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');
const key = argv.shift() || 'MaFl_Peach';

const files = new Map();
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'npc' }).load();
const { dyoFiles, worldFiles } = loadWorldFiles(DIR, ws);
ws.setMapFiles(dyoFiles, worldFiles);
const E = FRE.npcEditOps;
const list = ws.chars.byKey.get(key.toLowerCase());
const npc = list && list[list.length - 1];
if (!npc) { print(`No NPC ${key}.`); throw new Error('no such NPC'); }

const modelName = id => { const mv = ws.movers && ws.movers.movers.get(id); return `${(mv && mv.name) || '?'} (${ws.defines.byValue('MI_', id) || id})`; };
function show(title) {
  print(`\n${title}`);
  E.placementsOf(ws, npc).forEach((p, i) => {
    const w = FRE.newNpcSim.whereAt(ws, p.map, p.x, p.z);
    print(`  spot ${i + 1}: ${p.map} /position ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}, facing ${p.angle.toFixed(1)}°, model ${modelName(p.model)}` +
      `${w ? ` — players read "${w.label}"${w.te ? ` (${w.te})` : ''}` : ''}`);
  });
}

show(`${npc.name || npc.key} (${npc.key}) before:`);
if (argv.length) {
  const spots = E.placementsOf(ws, npc);
  let spot = 0, all = false;
  const to = {};
  for (const a of argv) {
    const m = /^(spot|x|y|z|angle|model)=(.*)$/.exec(a);
    if (!m) { print(`Unknown edit "${a}"`); continue; }
    if (m[1] === 'spot') spot = Number(m[2]) - 1;
    else if (m[1] === 'model') { all = m[2].endsWith('!'); to.model = m[2].replace(/!$/, ''); }
    else to[m[1]] = /^[+-]/.test(m[2]) && spots[spot] ? spots[spot][m[1]] + Number(m[2]) : Number(m[2]);
  }
  try {
    const plan = E.placePlan(ws, npc, spot, to, all ? spots.map((_, i) => i) : [spot]);
    if (!plan.changes.length) print('\nNo change: the record already holds these values.');
    for (const c of plan.changes) print(`  spot ${c.spot + 1}: ${c.field} ${c.field === 'model' ? modelName(c.from) : c.from} → ${c.field === 'model' ? modelName(c.to) : c.to}`);
    for (const p of plan.parts) print(`  ${ws.files.get(p.file).name}: ${p.splices.length * 4} bytes rewritten at ${p.splices.map(s => s.start).join(', ')} (same size)`);
    if (plan.parts.length) ws.applyGroup(plan.parts, 'move');
    show('After (in memory only):');
  } catch (e) { print(`\nrefused: ${e.message}`); }
}
