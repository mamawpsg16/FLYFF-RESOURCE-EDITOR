// Equalized PvP by hand:  gjs -m tools/eq-sim.js [CLASS] [MALE|FEMALE] [--fixtures]
// Reads EqualizedPvP.inc + EqualizedPresets.inc (src/loaders/equalized.js) and prints which events are equalized, the class limits, and
// what a player of each preset gets on entry (src/loaders/equalized-sim.js), with the problems. Never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/eq-sim.js …
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const words = argv.filter(a => !a.startsWith('--')).map(a => a.toUpperCase());
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'pvp' }).load();
const eq = ws.models.pvp.eq, E = FRE.equalized, D = ws.defines.defines;

for (const d of ws.diags.filter(x => x.module === 'pvp' && /^EQ_/.test(x.code))) print(`${d.severity} ${d.code}: ${d.message}`);
if (eq.events.failed) print(`EqualizedPvP.inc: ${eq.events.error}`);
for (const e of E.EVENTS) {
  const x = eq.events.events[e];
  print(`${E.EVENT_LABEL[e]}: ${x.on ? 'equalized' : 'normal'}; limits ${E.CLASSES.map((c, i) => `${c.label} ${x.caps[i] >= 99 ? '-' : x.caps[i]}`).join(', ')}`);
}
for (const b of eq.presets.byKey.values()) {
  const c = E.CLASSES[b.cls], sx = E.SEXES[b.sex];
  if (words[0] && words[0] !== c.word) continue;
  if (words[1] && words[1] !== sx) continue;
  const sim = FRE.equalizedSim.enter(b, { defines: D, items: ws.items.items });
  const nm = x => x.rec.name || x.rec.define;
  print(`\n${c.label} ${sx.toLowerCase()} (level ${E.EQ_LEVEL} ${c.hero}):`);
  for (const p of Object.keys(sim.worn).map(Number).sort((a, z) => a - z))
    print(`  ${ws.defines.byValue('PARTS_', p)}: HP ${nm(sim.worn[p])}${sim.attack[p] !== sim.worn[p] ? ` | Attack ${nm(sim.attack[p])}` : ''}`);
  for (const p of Object.keys(sim.attack).map(Number).filter(p => !sim.worn[p])) print(`  ${ws.defines.byValue('PARTS_', p)}: Attack ${nm(sim.attack[p])}`);
  const bag = sim.bag.filter(x => !x.worn);
  print(`  bag: ${bag.length ? bag.map(x => `${nm(x)}${x.count > 1 ? ` x${x.count}` : ''}`).join(', ') : '-'}`);
  for (const p of sim.problems) print(`  problem: ${p.message}`);
}
