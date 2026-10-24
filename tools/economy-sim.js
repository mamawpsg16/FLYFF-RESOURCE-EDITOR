// The Economy task by hand:   gjs -m tools/economy-sim.js [map=<file name, e.g. WdMadrigal>] [level=150] [speed=15] [loops=1]
//   [kills=1000] [seed=1] [sort=penya|sun|moon|red|loot|kpm] [top=25] [spot=<MI_ monster>] [--fixtures]   (from the repo root)
// Runs src/loaders/spawns.js + economy-sim.js on test-data (or test-data/fixtures): every farming spot (map + monster), its
// respawn cap (CRespawner::Spawn), and what one hour there gives (drops-sim per kill x min( speed, cap ) x 60).
// spot=<MI_>: that monster's spots, plus the respawn timeline at 4 / 15 / 30 kills a minute and with instant kills.
// Reads files only; never writes any.
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures');
const opt = (k, d) => { const a = argv.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const o = { level: Number(opt('level', 150)), speed: Number(opt('speed', 15)), loops: Number(opt('loops', 1)), kills: Number(opt('kills', 1000)), seed: Number(opt('seed', 1)) };
const map = opt('map', null), sort = opt('sort', 'penya'), top = Number(opt('top', 25)), spotDef = opt('spot', null);

const base = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource';
const files = new Map();
for (const [k, e] of loadFolder(base)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'economy' }).load();
const { dyo, worldFiles } = loadWorldFiles(base, ws);
ws.setMapObjects(dyo, worldFiles);
const E = FRE.economySim, m = ws.models.economy, fmt = n => FRE.num.group(Math.round(n));
let list = m.spots;
if (map) list = list.filter(s => s.file.toLowerCase() === map.toLowerCase());
if (spotDef) { const id = ws.defines.defines.get(spotDef); list = list.filter(s => s.mover === id); }
print(`${m.spots.length} spots on ${m.maps.length} maps; player Lv${o.level}, ${o.speed} kills a minute, ${o.loops} roll(s) a kill, ${o.kills} kills per monster (seed ${o.seed})`);
const cache = new Map();
const rows = list.map(s => ({ s, h: E.spotHour(ws, s, o, cache) }));
const keyOf = r => (sort === 'kpm' ? r.h.kpm : r.h[sort]);
rows.sort((a, b) => keyOf(b) - keyOf(a));
for (const { s, h } of rows.slice(0, top))
  print(`${s.title.padEnd(22).slice(0, 22)} ${s.name.padEnd(24).slice(0, 24)} Lv${String(s.level).padStart(3)} x${String(s.count).padStart(3)} in ${s.boxes} box(es)  cap ${s.cap.toFixed(1)}/min${h.capped ? ' ⚠' : '  '}  ${h.kpm.toFixed(1)} kills/min  Penya ${fmt(h.penya)}  Sun ${h.sun.toFixed(1)}  Moon ${h.moon.toFixed(1)}  Red ${h.red.toFixed(1)}  loot ${fmt(h.loot)}`);
if (spotDef) for (const { s } of rows) {
  print(`\n${s.title} - ${s.name}: respawn lines ${s.lines.map(l => `${l.max} every ~${l.seconds}s`).join(', ')}`);
  for (const sp of [4, 15, 30, Infinity]) {
    const r = E.respawnRun(s.lines, { speed: sp, seed: o.seed, madrigal: s.world === ws.defines.defines.get('WI_WORLD_MADRIGAL') });
    print(`  ${sp === Infinity ? 'instant' : sp + ' a minute'}: ${r.perMinute.toFixed(2)} kills a minute over an hour (exact cap ${s.cap.toFixed(2)})`);
  }
}
