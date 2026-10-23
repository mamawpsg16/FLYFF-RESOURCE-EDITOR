// Boss Mechanics alone (quick, and for planted bugs):   gjs -m tests/run-bosses.js   (ORACLE_SIM=<copy> for a planted-bug copy)
import GLib from 'gi://GLib';
import { FRE, ROOT, loadFolder, openSource } from './gjs-env.js';
import { checkBosses } from './bosses-check.js';
const ORACLE_SIM = GLib.getenv('ORACLE_SIM') || ROOT + '/tools/oracle_sim.py';
const FIXTURES = ROOT + '/test-data/fixtures/Resource';
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) pass++; else { fail++; print(`FAIL  ${n}${d ? '  -> ' + d : ''}`); } };
const fs = new Map(); for (const [k, e] of loadFolder(FIXTURES)) fs.set(k, openSource(e));
for (const [k, e] of loadFolder(ROOT + '/test-data/fixtures/Boss')) fs.set(k, openSource(e));
const W = new FRE.Workspace(fs, { only: 'bosses' }).load();
const [, out] = GLib.spawn_command_line_sync(`python3 ${ORACLE_SIM} bosses ${FIXTURES}`);
let py = null;
try { py = JSON.parse(new TextDecoder().decode(out)); } catch (e) { ok(false, 'no readable Python result', e.message); }
if (py) checkBosses({ FRE, py, ws: W, ok });
print(`${pass} passed, ${fail} failed`);
