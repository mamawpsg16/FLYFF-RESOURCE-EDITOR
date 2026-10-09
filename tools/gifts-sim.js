// Gifts and Guild Siege prizes by hand:   gjs -m tools/gifts-sim.js <what> [options] [--fixtures]   (from the repo root)
// Runs src/loaders/gifts-sim.js (the port of the code that gives them) on test-data (or test-data/fixtures); never writes.
//   life   [rebirths=2] [account=player] [free=168] [deaths=75,90]   one character from level 1: every level-up and rebirth gift
//   couple [sex=0,1]                                               a couple from level 1 to 21: every mail each partner gets
//   siege  [n=5] [online=10] [free=168]                             a siege of n guilds (points n, n-1, …): the chips per member
//   weekly                                                          the weekly ladders (rank -> Red Chips)
// Example: gjs -m tools/gifts-sim.js life rebirths=1
//          gjs -m tools/gifts-sim.js siege n=8
import { FRE, ROOT, loadFolder, openSource, readBytes, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures');
const what = argv.shift() || 'life';
const opt = Object.fromEntries(argv.map(a => a.split('=')));
const base = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const files = new Map();
for (const [k, e] of loadFolder(base + '/Resource')) files.set(k, openSource(e));
// the C++ with the Guild Siege amounts: test-data/fixtures/src (copied by refresh-fixtures.sh), else the editor's copy
const cpp = new Map();
for (const f of ['eveschool.cpp', 'GuildSiegePrize.cpp']) if (exists(`${ROOT}/test-data/fixtures/src/${f}`)) cpp.set(f.toLowerCase(), new TextDecoder('latin1').decode(readBytes(`${ROOT}/test-data/fixtures/src/${f}`)));
const ws = new FRE.Workspace(files, { only: 'where', cpp: cpp.size ? cpp : null }).load();
const S = FRE.giftsSim, env = S.envFor(ws);
const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : `item ${id}`; };
const fmt = n => FRE.num.group(n);
const extra = x => [x.flag & 2 ? 'bound' : '', x.minutes > 0 ? `${x.minutes} min` : ''].filter(Boolean).join(', ');

if (what === 'life') {
  const r = S.life(env, { rebirths: Number(opt.rebirths || 0), account: opt.account || 'player', free: opt.free === undefined ? undefined : Number(opt.free),
    deaths: opt.deaths ? opt.deaths.split(',').map(Number) : [] });
  for (const g of r.got) print(`${g.what === 'rebirth' ? `rebirth ${g.reb}` : `level ${g.level} (${g.tier}${g.reb ? `, rebirth ${g.reb}` : ''})`}: ${name(g.id)} ×${fmt(g.num)}${extra(g) ? ` (${extra(g)})` : ''} -> ${g.where}`);
  print(`\nsteps: ${r.steps.join(' | ')}`);
  print(`end: ${r.end.tier} level ${r.end.level}, rebirth ${r.end.reb}`);
  for (const [g, v] of S.levelPays(env, opt.account || 'player')) if (v.first !== 1 || v.perRebirth) print(`level ${g.level} ${g.define}: ${v.first} time(s) in the first life, +${v.perRebirth} per rebirth`);
} else if (what === 'couple') {
  const r = S.couple(env, { sex: (opt.sex || '0,1').split(',').map(Number) });
  for (const p of r.posts) print(`couple level ${p.level} -> partner ${p.to + 1}: ${name(p.id)} ×${fmt(p.num)}${extra(p) ? ` (${extra(p)})` : ''} (mail)`);
  print(`levels reached: ${r.levels.join(', ')}; ends at ${r.end}`);
} else if (what === 'siege') {
  const n = Number(opt.n || 5), on = Number(opt.online || 10), free = opt.free === undefined ? undefined : Number(opt.free);
  const guilds = Array.from({ length: n }, (_, i) => ({ points: n - i, lineup: Array.from({ length: 10 }, (_, k) => ({ life: 5, level: 120, online: k < on, free })) }));
  const r = S.siege(env, { guilds });
  print(`ranking: ${r.order.map(i => `guild ${i + 1}`).join(', ')}`);
  for (const p of r.paid) print(`rank ${p.rank} (guild ${p.guild + 1}) member ${p.member + 1}: ${fmt(p.chips)} Red Chips -> ${p.where}`);
} else if (what === 'weekly') {
  const w = env.gifts.siege.comp.weekly;
  print(`(amounts from ${env.gifts.siege.comp.from === 'cpp' ? 'the C++' : "the editor's copy"})`);
  for (const [k, a] of Object.entries(w)) print(`${k}: ${a.map((v, i) => `#${i + 1} ${fmt(v)}`).join(', ')}`);
} else throw new Error('usage: gjs -m tools/gifts-sim.js life|couple|siege|weekly [options] [--fixtures]');
