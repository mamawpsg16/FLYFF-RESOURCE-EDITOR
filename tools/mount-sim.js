// A mount by hand:   gjs -m tools/mount-sim.js <id | define | name> [turbo] [flyLv=N] [--fixtures]
//                    gjs -m tools/mount-sim.js list            (every mount: speed, leg speeds, can fly, flying meter top)
// Runs src/loaders/mount-sim.js (the leg-loop picker of Mover.cpp:4087, the ground speed of ActionMover.cpp:240, ProcessFlyMove,
// OnMountFly) on test-data (or test-data/fixtures) with the model files of Client/Model.list; never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/mount-sim.js …
// Example: gjs -m tools/mount-sim.js 225049 turbo
import { FRE, ROOT, loadFolder, openSource, readText, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--') && a !== 'turbo');
const base = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const files = new Map();
for (const [k, e] of loadFolder(base + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'mounts' }).load();
if (exists(base + '/Client/Model.list')) ws.setClientModels(readText(base + '/Client/Model.list').split('\n').map(s => s.trim()).filter(Boolean));
const m = ws.models.mounts, Sim = FRE.mountSim;
const n = v => String(Number(Number(v).toPrecision(7)));

if (!what) print('usage: tools/mount-sim.js <id | define | name> [turbo] [flyLv=N]   or   list');
else if (what === 'list') {
  for (const x of m.mounts) {
    if (!x.anim) { print(`${x.id} ${x.name}: no Add_Mount block`); continue; }
    const d = Sim.describe(x);
    print(`${x.id} ${x.name} (${x.model}): ${n(d.ground.perSec.run)} units/s, run legs x${n(x.anim.fAnimSpeed)}, walk legs x${n(x.anim.fWalkAnimSpeed)}${d.flies ? `, flies: meter ${d.fly.top}` : ''}`);
  }
} else {
  const x = m.byId.get(Number(what)) || m.mounts.find(y => y.define === what) || m.mounts.find(y => y.name.toLowerCase().includes(what.toLowerCase()));
  if (!x) print(`no mount ${what}`);
  else if (!x.anim) print(`${x.name} (${x.id}) has no Add_Mount block: the rider is not seated and keeps their own speed`);
  else {
    const a = x.anim, d = Sim.describe(x), g = d.ground;
    print(`${x.name} (${x.define}, ${x.id}), model ${x.model || '?'}${x.blocks.length > 1 ? `, ${x.blocks.length} blocks (the last is used)` : ''}`);
    print(`ground: ${n(g.perTick.run)} a frame = ${n(g.perSec.run)} units/s; walk mode ${n(g.perSec.walk)}, backing up ${n(g.perSec.back)}, sideways ${n(g.perSec.side)}`);
    print(`mounting plays ${d.mountOn}`);
    for (const s of d.loops) print(`  ${s.state}: ${s.file} at x${n(s.speed)}`);
    if (d.flies) {
      const f = argv.includes('turbo') ? d.turbo : d.fly;
      print(`flying${argv.includes('turbo') ? ' (turbo)' : ''}: push ${n(f.push)} a frame, top ${n(f.max)}; the meter shows ${f.shownPerSec.join(', ')} (each second), top ${f.top} after ${(f.reachTicks / 60).toFixed(2)} s; held: ${f.steadyShown}; letting go glides ${(f.glideTicks / 60).toFixed(2)} s`);
      for (const s of d.air.slice(1)) print(`  ${s.state}: ${s.file}${s.once ? ' (plays once)' : ''} at x${n(s.speed)}`);
      const lv = Number(opt.flyLv || 0);
      const r = Sim.takeOff(a, { dwFlightLimit: x.flightLimit }, { worldFly: true, flyLv: lv });
      print(`take-off at flight level ${lv} (needs ${x.flightLimit}): ${r.ok ? 'OK' : r.text}`);
    } else print('flying: "This mount cannot fly." (nType ' + a.nType + ')');
    if (a.fNameOffset) print(`name: ${n(a.fNameOffset)} higher`);
  }
}
