// Dungeons by hand:  gjs -m tools/dungeon-sim.js [list | <WI_ name>] [class=legend] [level=150] [anarchy=0] [--fixtures]
//   list            every party dungeon as the WorldServer keeps it (time limit, cooldown, levels, classes, kill-all, monsters)
//   WI_INSTANCE_X   one dungeon: a player tries to enter (class / level), the clock of one run, a second try during the
//                   cooldown and after it, and its monsters (SetMonster + the map's .rgn) with their drop lines
// Runs src/loaders/dungeon.js + dungeon-sim.js on test-data (or test-data/fixtures); never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/dungeon-sim.js …
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--')) || 'list';
const dir = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource';
const files = new Map();
for (const [k, e] of loadFolder(dir)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'dungeon' }).load();
const { dyo, worldFiles } = loadWorldFiles(dir, ws);
ws.setMapObjects(dyo, worldFiles);
const m = ws.models.dungeon, S = FRE.dungeonSim, Dg = FRE.dungeon;
const min = ms => `${Math.round(ms / 60000)} min`;
const CLS = ['Normal', 'Master', 'Hero', 'Legend'];
const clsText = v => CLS.filter((_, i) => v & (1 << i)).join('/') || 'none';
const name = id => { const mv = ws.movers.movers.get(id); return mv ? `${mv.name} (lv ${mv.level})` : String(id); };

for (const d of ws.diags.filter(x => x.module === 'dungeon')) print(`${d.severity} ${d.code}: ${d.message}`);
if (what === 'list') {
  for (const [id, e] of m.server) {
    const v = e.data;
    print(`${e.first.world} (${id}): lv ${v.nMinLevel}-${v.nMaxLevel}, ${clsText(v.dwClass)}, time ${v.dwDungeonTime ? min(v.dwDungeonTime) : 'none'}, cooldown ${min(v.dwCoolTime)}, kill-all ${v.bKillAll ? 'on' : 'off'}, ${e.monsters.length} SetMonster`);
  }
} else {
  const d = m.dungeons.find(x => x.world === what);
  if (!d) { print(`no dungeon ${what}`); } else {
    const e = m.server.get(d.worldId), v = e.data;
    const p = { cls: opt.class || 'legend', level: Number(opt.level || v.nMinLevel) };
    const r = S.enter(v, p, { now: 0, anarchy: Number(opt.anarchy || 0) });
    print(`${p.cls} level ${p.level}: ${r.ok ? 'enters' : `refused ${r.text} ${(r.args || []).join(' ')}`}`);
    if (r.ok) for (const x of S.clock(v.dwDungeonTime)) print(`  ${Math.round(x.t / 1000)} s: ${x.kind}${x.ms ? ` ${x.ms / 1000} s` : ''}${x.text ? ` "${x.text}"` : ''}`);
    if (r.ok) for (const at of [60000, v.dwCoolTime + 1000]) {
      const r2 = S.enter(v, p, { now: at, cool: r.cool, dungeonId: 2, anarchy: Number(opt.anarchy || 0) });
      print(`  another run ${Math.round(at / 60000)} min later: ${r2.ok ? 'enters' : `refused ${r2.text} ${(r2.args || []).join(' ')}`}`);
    }
    const mons = Dg.monstersOf(d, e, m.rgn.get(d.map));
    print(`monsters (${mons.length}):`);
    for (const x of mons) {
      const b = ws.models.drops.monsters.get(x.id);
      print(`  ${name(x.id)}: ${x.roles.join(', ')}${x.roles.includes('map') ? ` x${x.count}` : ''}, ${b ? b.list.filter(l => l.kind === 'item').length : 0} drop lines`);
    }
  }
}
