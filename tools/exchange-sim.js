// Exchange simulator:   gjs -m tools/exchange-sim.js [MMI_X] [recipe#] [tries] [--free n] [--seed n] [--keep n] [--fixtures]
// (from the repo root). Presses OK in the exchange window `tries` times, using the real
// test-data/Resource/Exchange_Script.txt and the WorldServer code ported in
// src/loaders/exchange-sim.js (CExchange::ResultExchange and what it calls). Never writes any file.
//   no MMI_X        every recipe of every menu players can open (10,000 tries each)
//   --free n        empty bag slots before the exchange (default 10)
//   --keep n        one bag with ingredients for n exchanges; rewards stay in the bag
//                   (default: the same fresh bag for every try)
//   --seed n        random seed (default 1)
//   --fixtures      read test-data/fixtures/Resource instead
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = (name, def) => { const i = argv.indexOf(name); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const free = Number(flag('--free', 10)), seed = Number(flag('--seed', 1)), keep = flag('--keep', null);
const [menuArg, recipeArg, triesArg] = argv;

const files = new Map();
const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'exchange' }).load();
// the map files say which NPCs stand in the game, and where (loaders/world.js, loaders/area.js), as in the editor
const { dyo, worldFiles } = loadWorldFiles(DIR, ws);
ws.setMapObjects(dyo, worldFiles);
const S = FRE.exchangeSim, env = S.envFromWorkspace(ws), table = S.serverTable(ws.models.exchange);
const fmt = n => FRE.num.group(n);
const pct = v => `${v.toFixed(2)}%`;
const D = ws.defines.defines;

let targets;
if (menuArg) {
  const mmi = D.get(menuArg);
  if (mmi === undefined || !table.find(mmi)) { print(`${menuArg}: no such exchange menu on the server`); imports.system.exit(1); }
  const sets = table.find(mmi).sets;
  const idx = recipeArg ? [Number(recipeArg) - 1] : sets.map((_, i) => i);
  targets = idx.map(i => ({ mmi, name: menuArg, i }));
} else {
  const live = ws.models.exchange.menus.filter(m => !m.isJunk && m.sets.length && (ws.npcInfoByMenu().get(m.mmi.value) || []).some(x => x.inGame));
  targets = live.flatMap(m => table.find(m.mmi.value).sets.map((_, i) => ({ mmi: m.mmi.value, name: m.name, i })));
}
const tries = Number(triesArg || (menuArg && recipeArg ? 10000 : 10000));

for (const t of targets) {
  const set = table.find(t.mmi).sets[t.i];
  if (!set) { print(`${t.name} recipe ${t.i + 1}: no such recipe on the server`); continue; }
  print(`\n=== ${t.name} recipe ${t.i + 1}: ${set.cond.map(c => `${fmt(c.num)} ${S.fmtText('%s', [c.penya ? 'Penya' : nameOf(c.id)])}`).join(' + ')}`);
  let r;
  try {
    r = S.run(env, table, t.mmi, t.i, keep ? { tries, seed, mode: 'keep', stock: Number(keep), free } : { tries, seed, mode: 'same', free });
  } catch (e) { print(`   cannot run: ${e.message}`); continue; }
  print(`   ${fmt(tries)} presses of OK, ${keep ? `one bag with ingredients for ${keep} exchanges` : 'the same fresh bag each time'}, ${free} free slots, seed ${seed}`);
  print(`   results: ${Object.entries(r.results).filter(([, n]) => n).map(([k, n]) => `${k} ${fmt(n)}`).join(', ')}`);
  for (const g of r.given) print(`   ${(nameOf(g.line.id) + ` x${g.line.num}`).padEnd(44)} ${String(fmt(g.times)).padStart(7)}  seen ${pct(g.seenPct).padStart(8)}  server ${pct(g.serverPct).padStart(8)}${g.lost ? `  LOST ${g.lost}` : ''}`);
  print(`   taken: ${[...r.taken.values()].map(t => `${fmt(t.num)} ${t.penya ? 'Penya' : nameOf(t.id)}`).join(', ') || 'nothing'}`);
  for (const [k, s] of Object.entries(r.samples)) {
    const v = s.view;
    print(`   player sees on ${k}: ${[...v.chat.map(c => `[chat] ${c}`), v.box ? `[box] ${v.box}` : null].filter(Boolean).join(' / ') || '(nothing)'}`);
  }
}
function nameOf(id) { const p = env.prop(id); return p ? p.name : `#${id}`; }
