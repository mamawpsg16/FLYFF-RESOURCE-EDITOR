// GM commands by hand:  gjs -m tools/gmcmd-sim.js "/cn 20 5 1" [auth=GENERAL|GAMEMASTER|GAMEMASTER2|GAMEMASTER3|ADMINISTRATOR] [--test-data]
//                       gjs -m tools/gmcmd-sim.js list [dead|off]     (every working command; or the ones below /open; or the ones not built)
// Runs src/loaders/gmcmd-sim.js (ParsingCommand in the game, then CDPSrvr::OnChat on the server) on the command table of
// ../FLYFF-V19-SOURCE (read-only; --test-data: test-data/src from tools/refresh-fixtures.sh test-data). Never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/gmcmd-sim.js …
import { FRE, ROOT, loadFolder, openSource, readBytes, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const opt = Object.fromEntries(argv.filter(a => /^\w+=/.test(a)).map(a => a.split('=')));
const test = argv.includes('--test-data');
const src = test ? ROOT + '/test-data/src/' : ROOT + '/../FLYFF-V19-SOURCE/Source/Source/';
const at = test ? { cpp: 'FuncTextCmd.cpp', cc: 'CustomCommon.h', ws: 'worldserver/VersionCommon.h', nz: 'neuz/VersionCommon.h' }
  : { cpp: '_Interface/FuncTextCmd.cpp', cc: '_Common/CustomCommon.h', ws: 'WORLDSERVER/VersionCommon.h', nz: 'Neuz/VersionCommon.h' };
const t = p => (exists(src + p) ? new TextDecoder('latin1').decode(readBytes(src + p)) : null);
const cpp = new Map([['functextcmd.cpp', t(at.cpp)], ['customcommon.h', t(at.cc)], ['worldserver/versioncommon.h', t(at.ws)], ['neuz/versioncommon.h', t(at.nz)]].filter(([, v]) => v));
const res = test ? ROOT + '/test-data/Resource' : ROOT + '/test-data/fixtures/Resource';
const files = new Map();
for (const [k, e] of loadFolder(res)) files.set(k, openSource(e));
const m = new FRE.Workspace(files, { only: 'gmcmd', cpp }).load().models.gmcmd;
if (!m.ok) { print(`no FuncTextCmd.cpp in ${src}`); } else if (argv[0] === 'list') {
  const which = argv[1] === 'dead' ? m.rows.filter(r => r.dead && r.compiled) : argv[1] === 'off' ? m.rows.filter(r => !r.compiled) : m.rows.filter(r => r.live);
  for (const r of which) print(`  /${r.name}  /${r.short}  ${FRE.gmCmd.AUTH[r.auth][1]}  ${r.side}  line ${r.line}  ${FRE.gmCmd.whatOf(r) || ''}${r.conds.length ? '  [' + r.conds.join(', ') + ']' : ''}`);
  print(`${which.length} commands`);
} else {
  const line = argv.find(a => a.startsWith('/')) || '/cn 20 1 0', auth = opt.auth || 'ADMINISTRATOR';
  const r = FRE.gmCmdSim.type(m, line, { auth });
  print(`${line}  (typed by ${FRE.gmCmd.AUTH[auth][1]})`);
  print(`  ${FRE.gmCmdSim.explain(r)}`);
  if (r.row) print(`  row: /${r.row.name} /${r.row.short}, ${r.row.side}, needs ${FRE.gmCmd.AUTH[r.row.auth][1]}, FuncTextCmd.cpp:${r.row.line}`);
}
