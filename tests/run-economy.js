// The Economy part of the core suite alone (quick; ORACLE_SIM=<a copy with a planted bug> checks that a test catches it):
//   gjs -m tests/run-economy.js     (or under Node: node --max-old-space-size=8192 --import ./tests/node-shim/register.mjs tests/run-economy.js)
import GLib from 'gi://GLib';
import System from 'system';
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from './gjs-env.js';
import { checkEconomy } from './economy-check.js';
const ORACLE_SIM = GLib.getenv('ORACLE_SIM') || ROOT + '/tools/oracle_sim.py';
const FIXTURES = ROOT + '/test-data/fixtures/Resource';
let pass = 0, fail = 0;
const ok = (c, name, detail = '') => { if (c) pass++; else { fail++; print(`FAIL  ${name}${detail ? '  -> ' + detail : ''}`); } };
const eq = (a, b, name) => ok(a === b, name, `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
const fs = new Map(); for (const [k, e] of loadFolder(FIXTURES)) fs.set(k, openSource(e));
const ws = new FRE.Workspace(fs, { only: 'economy' });
ws.now = () => new Date(2026, 9, 8, 12, 0);          // oracle_sim.py DR_FIXED_NOW (Event.lua rates)
ws.load();
const { dyo, worldFiles } = loadWorldFiles(FIXTURES, ws);
ws.setMapObjects(dyo, worldFiles);
const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} economy ${FIXTURES}`);
let py = null;
try { py = JSON.parse(new TextDecoder().decode(out)); } catch (e) { ok(false, 'the Python copy (oracle_sim.py economy) gave no readable result', e.message); }
if (py) checkEconomy({ FRE, py, ws, ok, eq, print });
print(`\n${pass} passed, ${fail} failed`);
if (fail) System.exit(1);
