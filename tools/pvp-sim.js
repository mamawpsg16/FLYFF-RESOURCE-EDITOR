// PvP Events by hand:  gjs -m tools/pvp-sim.js [week | ffa | tdm | gs] [from=YYYY-MM-DD] [days=7] [--fixtures]
//                      gjs -m tools/pvp-sim.js ffa kills=8,5,5,2,0        (a sample FFA ending: kills per player, deaths 0)
//                      gjs -m tools/pvp-sim.js tdm levels=150,140,130,120 kills=3,1,0,0 away=0,1   (away = red, blue lives lost away)
// Runs src/loaders/pvp-sim.js (the FFA / TDM Process clock, the siege's AUTO_OPEN and OPEN block, Cancel / refunds, EndBattle) on
// test-data (or test-data/fixtures); never writes. On Windows: node --import ./tests/node-shim/register.mjs tools/pvp-sim.js …
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--')) || 'week';
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'pvp' }).load();
const m = ws.models.pvp, S = FRE.pvpSim;
const from = opt.from ? Date.UTC(...opt.from.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) / 1000 : S.wallOf(new Date());
const until = from + Number(opt.days || 7) * S.DAY;
const nums = k => (opt[k] ? opt[k].split(',').map(Number) : null);

for (const d of ws.diags.filter(x => x.module === 'pvp')) print(`${d.severity} ${d.code}: ${d.message}`);
if (what === 'week' || what === 'ffa' || what === 'tdm') for (const k of what === 'week' ? ['ffa', 'tdm'] : [what]) {
  const c = m[k].cfg;
  if (!c) { print(`${k.toUpperCase()}: switched off (${m[k].error})`); continue; }
  print(`${k.toUpperCase()}: fee ${FRE.num.group(c.cost)} Penya (cancel: ${FRE.num.group(S.cancel(c, c.cost, 0).back)} back), ${c.reward} token(s) per kill`);
  for (const r of S.runs(c, from, until)) print(`  ${S.dateText(r.start)}  registration ${S.hhmm(r.announce)}, battle ${S.hhmm(r.prepareEnd)}-${S.hhmm(r.battleEnd)}, town ${S.hhmm(r.closed)}${r.skipped.length ? `, skips ${r.skipped.map(S.hhmm).join(' ')}` : ''}`);
  if (k === 'ffa' && nums('kills')) for (const r of S.ffaResult(c, nums('kills').map((x, i) => ({ id: i + 1, kills: x, deaths: 0 }))))
    print(`  place ${r.place}: player ${r.id}, ${r.perKill} per kill + ${r.top} top 3 = ${r.total}`);
  if (k === 'tdm' && nums('kills')) {
    const lv = nums('levels') || [], aw = nums('away') || [0, 0];
    const r = S.tdmResult(c, nums('kills').map((x, i) => ({ id: i + 1, level: lv[i] || 100, kills: x, deaths: 0 })), { away: { red: aw[0], blue: aw[1] } });
    print(`  Red ${r.teams.red} : ${r.teams.blue} Blue, ${r.winner || 'draw'}`);
    for (const x of r.rows) print(`  place ${x.place}: player ${x.id} (${x.team}), ${x.perKill} + team ${x.win} + MVP ${x.mvp} = ${x.total}`);
  }
}
if (what === 'week' || what === 'gs') {
  const g = m.gs, P = m.prizes.prizes;
  if (!g.ok) print(`Guild Siege: GuildCombat.txt does not load (${g.error})`);
  else {
    print(`Guild Siege: bid ${FRE.num.group(g.joinPenya ? g.joinPenya.value : 0)}, ${P.TokensPerKill} tokens per kill, places ${P.SiegePrize.join(' / ')}`);
    for (const s of S.sieges(g, m.timeline, from, until, { guilds: Infinity })) print(`  ${S.dateText(s.start)}  enter ${S.hhmm(s.enter)}, combat ${S.hhmm(s.fight)}-${S.hhmm(s.end)}`);
    const sh = S.shownNext(g, from);
    if (sh !== null) print(`  the siege window shows: ${S.dateText(sh)}`);
  }
}
if (what === 'week') for (const c of S.clashes(m)) print(`overlap: ${c.a.ev} ${S.dayName(c.a.start)} ${S.hhmm(c.a.from)}-${S.hhmm(c.a.to)} and ${c.b.ev} ${S.hhmm(c.b.from)}-${S.hhmm(c.b.to)}`);
