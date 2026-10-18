// The Mini Events part of the core suite alone (quick; ORACLE_SIM=<a copy with a planted bug> checks that a test catches it):
//   gjs -m tests/run-minievent.js     (or under Node: node --import ./tests/node-shim/register.mjs tests/run-minievent.js)
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from './gjs-env.js';
import { checkMiniEvent, checkTurnIn, checkWeek, checkRace } from './minievent-check.js';
const ORACLE_SIM = GLib.getenv('ORACLE_SIM') || ROOT + '/tools/oracle_sim.py';
const FIXTURES = ROOT + '/test-data/fixtures/Resource';
let pass = 0, fail = 0;
const ok = (c, name, detail = '') => { if (c) pass++; else { fail++; print(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const files = new Map();
for (const [k, e] of loadFolder(FIXTURES)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'minievent' }).load();
const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} minievent ${FIXTURES}`);
let py = null;
try { py = JSON.parse(new TextDecoder().decode(out)); } catch (e) { ok(false, 'the Python copy (oracle_sim.py minievent) gave no readable result', e.message); }
if (py) checkMiniEvent({ FRE, py, ws, ok });
{
  const tw = new FRE.Workspace(files, { only: 'minievent' }).load();
  const { dyoFiles, worldFiles } = loadWorldFiles(FIXTURES, tw); tw.setMapFiles(dyoFiles, worldFiles);
  const [, o2] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} turnin ${FIXTURES}`);
  let p2 = null;
  try { p2 = JSON.parse(new TextDecoder().decode(o2)); } catch (e) { ok(false, 'the Python copy (oracle_sim.py turnin) gave no readable result', e.message); }
  if (p2) checkTurnIn({ FRE, py: p2, ws: tw, ok });
  const [, o3] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} week ${FIXTURES}`);
  let p3 = null;
  try { p3 = JSON.parse(new TextDecoder().decode(o3)); } catch (e) { ok(false, 'the Python copy (oracle_sim.py week) gave no readable result', e.message); }
  if (p3) checkWeek({ FRE, py: p3, ws: tw, ok });
  const [, o4] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} race ${FIXTURES}`);
  let p4 = null;
  try { p4 = JSON.parse(new TextDecoder().decode(o4)); } catch (e) { ok(false, 'the Python copy (oracle_sim.py race) gave no readable result', e.message); }
  if (p4) checkRace({ FRE, py: p4, ws: tw, ok });
}
print(`\n${pass} passed, ${fail} failed`);
if (fail) System.exit(1);
