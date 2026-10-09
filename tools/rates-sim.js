// Rates & Buffs by hand:   gjs -m tools/rates-sim.js [MI_monster] [options] [--fixtures]   (from the repo root)
// Runs src/loaders/rates-sim.js (the kill path: AddExperienceSolo, AddExperience, GetExpFactor) on test-data (or test-data/fixtures); never writes.
//   level=<player level> job=normal|master|hero scroll=<EXP scroll %> gear=<other EXP %> online=<players online>
//   glv=<guild level> gon=<guild members online> weather rebirth=<tier>
// Example: gjs -m tools/rates-sim.js MI_AIBATT1 level=3 online=40 glv=20 gon=10 weather
//          gjs -m tools/rates-sim.js tiers        (the Server / Guild Buff tiers and the Event.lua rates now)
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures'), weather = flag('weather');
const what = argv[0] && !argv[0].includes('=') ? argv.shift() : 'MI_AIBATT1';
const opt = Object.fromEntries(argv.map(a => a.split('=')));
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'rates' }).load();
const m = ws.models.rates, fmt = n => FRE.num.group(n);

print(`Event.lua now: ${m.events.events.filter(e => e.on).map(e => e.name).join(', ') || 'no event'}${m.events.failed ? ' (FAILS: every rate ×1)' : ''}`);
print(`  EXP ×${m.events.active.exp}, Penya ×${m.events.active.gold}, drop roll gate ×${m.events.active.item}, item chance ×${m.events.active.piece}, weather ×${m.events.active.weather}`);
for (const d of ws.diags.filter(x => x.module === 'rates')) print(`  ${d.severity} ${d.code}: ${d.message}`);
if (what === 'tiers') {
  for (const t of m.server ? m.server.tiers : []) print(`Server Buff tier ${t.tier.value}: ${t.online.value}+ online -> EXP +${t.pct.value}%`);
  for (const t of m.guild ? m.guild.tiers : []) print(`Guild Buff tier ${t.tier.value}: guild level ${t.glv.value}+, ${t.online.value}+ online -> ${t.desc.text}`);
} else {
  const id = ws.defines.defines.get(what);
  const mv = id !== undefined ? ws.movers.movers.get(id) : null;
  if (!mv) { print(`${what}: no such monster`); } else {
    const r = FRE.ratesSim.calc(ws, m, { monsterId: id, playerLevel: Number(opt.level || mv.level), tier: opt.job || 'normal', scrollPct: Number(opt.scroll || 0),
      gearExp: Number(opt.gear || 0), serverTier: null, online: Number(opt.online || 0), guildTier: null, guildLevel: Number(opt.glv || 0), guildOnline: Number(opt.gon || 0),
      weather, rebirth: Number(opt.rebirth || 0) });
    print(`\n${mv.name || mv.define} (lv ${mv.level}), player level ${opt.level || mv.level}`);
    for (const s of r.factor.steps) print(`  ${s.text} -> ${s.after}`);
    print(`EXP factor ×${r.factor.factor}`);
    for (const s of r.kill.steps) print(`  ${s}`);
    print(`EXP per kill: ${fmt(r.kill.exp)}`);
    if (r.penya) print(`Penya per kill: ${fmt(r.penya.min)} - ${fmt(r.penya.max)} (${r.penya.from})`);
    if (r.items) for (const l of r.items.lines) if (l.entry.kind === 'item') print(`  ${l.entry.define}: ${FRE.drops.pct(l.perKill)} of kills`);
  }
}
