// The Mini Events part of the core suite alone (quick; ORACLE_SIM=<a copy with a planted bug> checks that a test catches it):
//   gjs -m tests/run-minievent.js     (or under Node: node --import ./tests/node-shim/register.mjs tests/run-minievent.js)
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, loadFolder, openSource } from './gjs-env.js';
import { checkMiniEvent } from './minievent-check.js';
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
print(`\n${pass} passed, ${fail} failed`);
if (fail) System.exit(1);
