// Battle Pass season simulator:   gjs -m tools/bp-sim.js   (from the repo root)
// Replays what the WorldServer does to players across a season change, using the
// real test-data/Resource/BattlePass.inc and a fake clock. Each function below is a
// port of the C++ named in its comment (commit cc73ccdd + fixes); nothing here is
// guessed. Never writes any file.
//
// Not modelled: bag space (the server refuses a pass use without enough free slots
// for the back-pay, and mails rewards that do not fit), saving and the client window.
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';
import { bpServer } from '../tests/bp-server.js';

const files = new Map();
for (const [k, e] of loadFolder(ROOT + '/test-data/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files).load();
const BP = FRE.battlePass;
const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0, 0);
const fmtDay = d => (d ? BP.whenText(d) : 'none');
const { config, player, say, isBP, speedBonus, login, grindTo, usePass } = bpServer(FRE, ws);

function status(p, now) {
  const on = isBP(p, now);
  return `${p.name}: ${on ? `season ${p.type}, level ${p.level} (${p.points} pts), ${p.enable ? 'BOUGHT' : 'free track'}, ends ${fmtDay(new Date(p.end))}`
    : `no running pass${p.end ? ` (last pass ended ${fmtDay(new Date(p.end))})` : ''}`}; speed bonus ${speedBonus(p, now) ? '+20%' : 'none'}; rewards owned ${p.got.length}; unused pass items ${p.passItems}`;
}
function flush(p) { for (const l of p.log) print(`   ${p.name}: ${l}`); p.log = []; }
function chapter(t) { print(`\n=== ${t}`); }

// ===================================================================== scenario
const s1 = config(ws.models.battlepass);
const ana = player('Ana'), ben = player('Ben'), cy = player('Cy');
const all = [ana, ben, cy];

chapter(`Season 1 (BattlePass.inc as it is: season ${s1.first.type.value}, expires ${fmtDay(new Date(s1.end(s1.first)))})`);
let now = day(2026, 9, 6);
for (const p of all) { login(s1, p, now); flush(p); }
ana.passItems = 1; usePass(s1, ana, now); flush(ana);
grindTo(s1, ana, 12, 'MI_KINGSTER01', now); flush(ana);
grindTo(s1, ben, 8, 'MI_KINGSTER01', now); flush(ben);
ben.passItems = 1; say(ben, 'buys a pass in the Donation Shop but keeps it in the bag'); flush(ben);
for (const p of all) print('   ' + status(p, now));

chapter('5 Oct 2026 18:00 - season 1 has ended, no new season set yet');
now = day(2026, 10, 5, 18);
for (const p of all) { login(s1, p, now); flush(p); }
grindTo(s1, ana, 13, 'MI_KINGSTER01', now); flush(ana);
cy.passItems = 1; say(cy, 'buys a pass now and uses it'); usePass(s1, cy, now); flush(cy);
grindTo(s1, cy, 2, 'MI_KINGSTER01', now); flush(cy);
for (const p of all) print('   ' + status(p, now));

chapter('6 Oct 2026 - "Start new season" (6 Oct + 30 days), saved, WorldServer restarted');
const f = ws.files.get('battlepass.inc');
const plan = FRE.battlePassOps.newSeasonPlan(ws.models.battlepass, 20261105);
ws.apply('battlepass.inc', plan.splices, 'season 2');          // in memory only, nothing is written
const s2 = config(ws.models.battlepass);
print(`   BattlePass.inc now: season ${s2.first.type.value}, expires ${fmtDay(new Date(s2.end(s2.first)))} (${plan.rows.length} reward rows moved to season ${plan.to})`);
now = day(2026, 10, 6);
for (const p of all) { login(s2, p, now); flush(p); }
for (const p of all) print('   ' + status(p, now));

chapter('Season 2 play');
grindTo(s2, ana, 5, 'MI_KINGSTER01', now); flush(ana);
ana.passItems = 1; say(ana, 'buys the same pass again and uses it'); usePass(s2, ana, now); flush(ana);
grindTo(s2, ben, 4, 'MI_KINGSTER01', now); flush(ben);
say(ben, 'uses the pass bought in season 1'); usePass(s2, ben, now); flush(ben);
grindTo(s2, cy, 3, 'MI_KINGSTER01', now); flush(cy);
for (const p of all) print('   ' + status(p, now));

chapter('Rewards each player owns at the end');
for (const p of all) print(`   ${p.name} (${p.got.length}): ${p.got.map(g => g.text).join(', ') || 'none'}`);
print(`\n(file in memory only: ${f.dirty ? 'changed, never saved' : 'unchanged'})`);
