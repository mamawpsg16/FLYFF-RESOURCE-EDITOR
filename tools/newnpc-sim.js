// Add New NPC by hand:   gjs -m tools/newnpc-sim.js [form.json] [--fixtures]
// (from the repo root). Builds the new NPC in memory (src/edit/npc-ops.js), runs the rules
// (src/validate/newnpc.js), then loads the changed files the way the game does
// (src/loaders/newnpc-sim.js) and prints what players get. Never writes any file.
//   no argument   the handoff §5 example (Lumi, a Penya shop next to Juria in Flaris)
//   form.json     your own form (same fields as the editor's form; x / z as /position prints them)
//   --fixtures    read test-data/fixtures/Resource instead of test-data/Resource
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles, readText } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');

export const EXAMPLE = {
  key: 'MaFl_Lumi', name: 'Lumi', model: 'MI_MAFL_JURIA', image: 'IDS_CHARACTER_INC_000056', structure: 'SRT_GENERAL',
  map: 'WdMadrigal', x: 6966, y: 100, z: 3220, angle: 180,
  menus: ['MMI_TRADE', 'MMI_BANKING'],
  tabs: [
    { slot: 0, title: 'General Goods', rules: [], items: [{ define: 'II_SYS_SYS_SCR_BLESSEDNESS' }] },
    { slot: 1, title: 'Scrolls', rules: [{ ik3: 'IK3_SCROLL', job: -1, min: 1, max: 150 }], items: [] },
  ],
};

const form = argv.length ? JSON.parse(readText(argv[0])) : EXAMPLE;
const files = new Map();
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'npc' }).load();
const { dyoFiles, worldFiles } = loadWorldFiles(DIR, ws);
ws.setMapFiles(dyoFiles, worldFiles);

print(`Form: ${form.key} "${form.name}" on ${form.map} at /position ${form.x}, ${form.y}, ${form.z}\n`);
const diags = FRE.validateNewNpc(ws, form);
for (const d of diags) print(`${d.severity.padEnd(5)} ${d.code}  ${d.field}: ${d.message}`);
if (diags.some(d => d.severity === 'BLOCK')) { print('\nBlocked: nothing would be written.'); }
else {
  const plan = FRE.npcOps.newNpcPlan(ws, form);
  print(`\ncharacter.inc gets:\n${plan.block.replace(/\r/g, '')}`);
  print('character.txt.txt gets:\n' + plan.strings.map(s => `${s.key}\t${s.text}`).join('\n'));
  print(`\n${form.map}.dyo: 200 bytes at offset ${plan.insertAt} (file ${plan.dyo.bytes.length} -> ${plan.dyo.bytes.length + 200} bytes)`);
  const before = ws.chars.npcs.length;
  ws.applyGroup(plan.parts, 'new NPC');
  print(`\nIn game (NPC blocks ${before} -> ${ws.chars.npcs.length}):`);
  const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : String(id); };
  for (const l of FRE.newNpcSim.describe(FRE.newNpcSim.inGame(ws, form.key), name)) print('  ' + l);
}
