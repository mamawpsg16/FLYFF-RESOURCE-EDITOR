// Edit an existing NPC by hand:   gjs -m tools/npcedit-sim.js <NPC key> [edit ...] [--fixtures]
// (from the repo root). Applies the edits in memory (src/edit/npcedit-ops.js), then prints what players get:
// name, right-click menu (src/loaders/newnpc-sim.js) and the shop window tabs with what a click on each does
// (src/loaders/shop-window.js). Never writes any file.
//   name=<text>          rename the NPC          (add ! to change a shared text everywhere: name!=<text>)
//   tab<N>=<text>        rename tab N (1-4)      (tab2!=<text> = everywhere)
//   +tab=<text>          + Tab (the lowest tab without a name)
//   -tab<N>              remove tab N (the last named one, when it sells nothing)
//   +menu=MMI_X / -menu=MMI_X
//   --fixtures           read test-data/fixtures/Resource instead of test-data/Resource
// Example: gjs -m tools/npcedit-sim.js MaFl_Peach tab2=Event +menu=MMI_BANKING
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
const npcOf = () => ws.chars.npcs.filter(n => n.key.toLowerCase() === key.toLowerCase()).pop();
if (!npcOf()) { print(`No NPC ${key}.`); throw new Error('no such NPC'); }

function show(title) {
  const npc = npcOf();
  print(`\n${title}`);
  const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : String(id); };
  for (const l of FRE.newNpcSim.describe(FRE.newNpcSim.inGame(ws, npc.key), name)) print('  ' + l);
  if (npc.menus.includes(ws.defines.defines.get('MMI_TRADE'))) for (const l of FRE.shopWindow.describe(FRE.shopWindow.ofNpc(npc, ws.simulate(npc)))) print('  Shop window: ' + l);
  for (const d of ws.diags.filter(d => d.npcKey === npc.key && /^C_TAB_/.test(d.code))) print(`  ${d.severity} ${d.code}: ${d.message}`);
}

show('Before:');
for (const a of argv) {
  const npc = npcOf();
  let m, r;
  try {
    if ((m = /^name(!?)=(.*)$/.exec(a))) { r = E.renameNpc(ws, npc, m[2], !!m[1]); ws.applyGroup(r.parts, a); }
    else if ((m = /^tab([1-4])(!?)=(.*)$/.exec(a))) { r = E.renameTab(ws, npc, Number(m[1]) - 1, m[3], !!m[2]); ws.applyGroup(r.parts, a); }
    else if ((m = /^\+tab=(.*)$/.exec(a))) { r = E.addTab(ws, npc, m[1]); ws.applyGroup(r.parts, a); }
    else if ((m = /^-tab([1-4])$/.exec(a))) { r = E.removeTab(ws, npc, Number(m[1]) - 1); ws.applyGroup(r.parts, a); }
    else if ((m = /^\+menu=(\w+)$/.exec(a))) ws.apply(npc.file.toLowerCase(), E.addMenu(ws, npc, m[1]), a);
    else if ((m = /^-menu=(\w+)$/.exec(a))) ws.apply(npc.file.toLowerCase(), E.removeMenu(ws, npc, ws.defines.defines.get(m[1])), a);
    else { print(`\nUnknown edit "${a}"`); continue; }
  } catch (e) { print(`\n${a}: refused: ${e.message}`); continue; }
  print(`\n${a}: ${r && r.how ? r.how + (r.key ? ' ' + r.key : '') : r && r.slot !== undefined ? `tab ${r.slot + 1}, new text line ${r.key}` : 'done'}`);
}
if (argv.length) {
  for (const f of ws.dirtyFiles()) print(`  changed: ${f.name}`);
  show('After (in memory only):');
}
