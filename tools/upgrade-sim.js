// Upgrading by hand:   gjs -m tools/upgrade-sim.js [system] [from=0] [to=10] [n=1000] [seed=1] [safe] [protect] [weapon] [smelting]
//                      [scroll=<II_ name>] [to=ultimate] [--fixtures]   (from the repo root)
// Runs src/loaders/upgrade-sim.js (EnchantGeneral, SmeltSafety…, EnchantAttribute, OnPiercingSize, RefineAccessory, RefineCollector,
// EnchantWeapon / TransWeapon) on test-data (or test-data/fixtures); never writes.
//   system: general (default), attr, weapon, suit, acc, coll, ult, transform, rarity, tables
// Examples: gjs -m tools/upgrade-sim.js general from=0 to=10 protect n=2000
//           gjs -m tools/upgrade-sim.js tables
//           gjs -m tools/upgrade-sim.js transform to=ultimate n=10000
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const flag = f => argv.includes(f);
const sys = argv.find(a => !a.includes('=') && !a.startsWith('--') && !['safe', 'protect', 'weapon', 'smelting'].includes(a)) || 'general';
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'upgrade' }).load();
const m = ws.models.upgrade, U = FRE.upgrade, S = FRE.upgradeSim;
const pc = c => `${(Math.round(c * 1e6) / 1e4)}%`, fmt = n => FRE.num.group(Math.round(n));
for (const d of ws.diags.filter(x => x.module === 'upgrade')) print(`  ${d.severity} ${d.code}: ${d.message}`);
if (sys === 'tables') {
  for (const s of ['general', 'attr', 'weapon', 'suit', 'acc', 'coll', 'ult']) {
    print(`${U.SYSTEMS[s].label}:`);
    for (const r of U.ladder(m, s)) print(`  +${r.level} → +${r.level + 1}: file ${r.value}${r.eff !== r.value ? ` (×0.9 = ${r.eff})` : ''} = ${pc(r.chance)}${r.safeChance !== undefined ? `, safe window ${pc(r.safeChance)}` : ''}`);
  }
  for (const [k, v] of Object.entries(m.ult.single)) print(`${k}: ${v.value} = ${pc(U.singleChance(v.value))}`);
} else if (sys === 'rarity') {
  const ch = U.rarityChances(m.rarity);
  for (const t of ch.tiers) { const r = m.rarity.tiers.get(t.level); print(`tier ${t.level} ${r.name}: ${pc(t.chance)}, +${r.pct}% / +${r.flat}`); }
  print(`nothing changes: ${pc(ch.nothing)}`);
  const rng = FRE.xRandom.rng(Number(opt.seed || 1)), n = Number(opt.n || 1000), got = new Map();
  for (let i = 0; i < n; i++) { const r = rng.random(100); let tot = 0, hit = 0; for (const t of ch.tiers) { tot += m.rarity.tiers.get(t.level).luck; if (r < tot) { hit = t.level; break; } } got.set(hit, (got.get(hit) || 0) + 1); }
  print(`${n} scrolls: ${[...got].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k || 'none'} ${pc(v / n)}`).join(', ')}`);
} else {
  const scrolls = opt.scroll ? m.scrolls.filter(s => s.define === opt.scroll) : [];
  const o = { window: flag('safe') ? 'safe' : 'normal', protect: flag('protect'), weapon: flag('weapon'), smelting: flag('smelting'), scrolls, to: opt.to === 'ultimate' ? 'ultimate' : 'unique' };
  const from = sys === 'transform' ? 0 : Number(opt.from || 0), to = sys === 'transform' ? 1 : Number(opt.to || S.maxLevel(m, sys));
  const e = S.expect(m, sys, from, to, o);
  for (const r of e.rows) print(`  +${r.level}: ${pc(r.chance)}, fail = ${r.fail}, reached by ${pc(r.reach)} of items, ${r.tries.toFixed(2)} tries there`);
  print(e.per ? `one item to +${to}: ${e.per.tries.toFixed(2)} tries, ${e.per.items.toFixed(3)} items, ${e.per.protect.toFixed(2)} protect, ${e.per.scrolls.toFixed(2)} scrolls, ${fmt(e.per.penya)} Penya`
    : `never: +${e.never} cannot pass`);
  const r = S.run(m, sys, from, to, o, Number(opt.seed || 1), Number(opt.n || 1000));
  const t = r.totals;
  print(`${r.items.length} items (seed ${opt.seed || 1}): ${t.reached} reached, ${t.broke} broke, ${t.tries} tries, ${t.protect} protect, ${t.scrolls} scrolls, ${fmt(t.penya)} Penya`);
}
