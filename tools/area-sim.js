// Where NPCs stand:   gjs -m tools/area-sim.js [NPC key | x z [map] | walk x1 z1 x2 z2 … [--step n] [--map name]] [--fixtures]
// (from the repo root). Names every spot the way the game client does, from the real
// test-data/Resource files and the client code ported in src/loaders/area.js (CContinent, the
// map window's GetMapArea, the region loop that shows area names). Never writes any file.
//   no argument     every NPC that stands on a map, grouped by area, with its /te command
//   NPC key         every spot of that NPC: map window, area name on screen, navigator, /te
//   x z [map]       what a player sees arriving at that spot (map file name, default WdMadrigal)
//   walk x z x z …  walk the path (default 20 units per frame) and print every area entered
//   --fixtures      read test-data/fixtures/Resource instead
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = (name, def) => { const i = argv.indexOf(name); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const step = Number(flag('--step', 20)), mapArg = flag('--map', null);

const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');
const files = new Map();
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'npc' }).load();
const { dyo, worldFiles } = loadWorldFiles(DIR, ws);
ws.setMapObjects(dyo, worldFiles);
const A = ws.area, L = FRE.area.label;
const caps = c => c.map(([t, big]) => big ? `[${t}]` : t).join(' ') || '(none)';

if (!argv.length) {
  const by = new Map();
  for (const npc of ws.chars.npcs) {
    const st = FRE.world.npcStatus(npc, ws.placed);
    if (!st.inGame) continue;
    for (const w of ws.whereOf(npc.key)) {
      const k = w.place;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(`  ${(npc.name || npc.key).padEnd(40)} ${(w.caption || '').padEnd(36)} ${w.te || ''}`);
    }
  }
  for (const [k, list] of [...by].sort((a, b) => b[1].length - a[1].length)) { print(`\n${k} (${list.length})`); list.forEach(l => print(l)); }
} else if (argv[0] === 'walk') {
  const n = argv.slice(1).map(Number), path = [];
  for (let i = 0; i + 1 < n.length; i += 2) path.push([n[i], n[i + 1]]);
  const map = mapArg || A.madrigal;
  const r = FRE.area.walk(A.regions.get(map) || [], path, step);
  print(`${map}: ${r.frames} frames, ${r.events.length} areas entered`);
  for (const e of r.events) print(`  frame ${e.f} at ${e.x}, ${e.z}: navigator "${e.nav}", on screen ${caps(e.caps)}${e.msgs.length ? '; chat: ' + e.msgs.join(' | ') : ''}`);
} else if (/^-?\d/.test(argv[0])) {
  const map = argv[2] || mapArg || A.madrigal;
  const r = FRE.area.standAt(A, map, Number(argv[0]), Number(argv[1]));
  print(`${map} ${argv[0]}, ${argv[1]}`);
  if (r.mapWindow !== null) print(`  map window: ${r.mapWindow} (location ${r.mapArea})`);
  print(`  on screen: ${caps(r.caps)}   navigator: "${r.nav ?? ''}"   regions entered: ${r.entered.join(', ') || 'none'}`);
} else {
  const list = ws.whereOf(argv[0]);
  const npc = ws.chars.byKey.get(argv[0].toLowerCase());
  if (npc) print(`${npc[0].name || npc[0].key}: ${FRE.world.npcStatus(npc[0], ws.placed).why}`);
  if (!list.length) print(`${argv[0]}: not placed on any map`);
  for (const w of list) {
    print(`  ${L(w)}    ${w.te || ''}`);
    print(`    ${w.worldTitle} (${w.world}) x ${w.x.toFixed(1)}, z ${w.z.toFixed(1)}; map window: ${w.mapWindow ?? '—'}; on screen: ${caps(w.caps)}; navigator: "${w.nav ?? ''}"`);
  }
}
