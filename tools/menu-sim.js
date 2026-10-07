// New exchange menus by hand:   gjs -m tools/menu-sim.js [spec.json] [--fixtures] [--write]
// (from the repo root). Builds the menus in memory (src/edit/menu-ops.js), runs the rules
// (src/validate/newmenu.js), loads the changed files the way the game does and prints the NPC's
// right-click menu, then presses OK on every new exchange (src/loaders/exchange-sim.js):
// with exactly the ingredients (and 1 free slot), one ingredient short, and a full bag (succeeds when the
// used-up ingredients free a slot: IsFull counts a stack the exchange takes whole as empty).
//   no argument   tools/jeff-menus.json (Jeff's Weapon Pieces menus, handoff section 5)
//   --fixtures    read test-data/fixtures instead of test-data
//   --write       also write the result to test-data/Resource and test-data/Client, after a backup in
//                 test-data/backups/<stamp>_npc-menus/ (never with --fixtures; never the real source folder)
import GLib from 'gi://GLib';
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles, readText, readBytes, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i < 0) return false; argv.splice(i, 1); return true; };
const fixtures = flag('--fixtures'), write = flag('--write');
if (fixtures && write) throw new Error('--write never writes the fixtures');
const BASE = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const DIR = BASE + '/Resource', CLIENT = BASE + '/Client';
const spec = JSON.parse(readText(argv[0] || ROOT + '/tools/jeff-menus.json'));

const files = new Map();
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'npc' }).load();
const { dyoFiles, worldFiles } = loadWorldFiles(DIR, ws);
ws.setMapFiles(dyoFiles, worldFiles);

print(`${spec.npcKey}: ${spec.menus.length} new menu(s), ${spec.menus.reduce((n, m) => n + (m.sets || []).length, 0)} exchange(s)\n`);
const diags = FRE.validateNewMenus(ws, spec);
for (const d of diags) print(`${d.severity.padEnd(5)} ${d.code}  ${d.field}: ${d.message}`);
if (diags.some(d => d.severity === 'BLOCK')) { print('\nBlocked: nothing would be written.'); }
else {
  const plan = FRE.menuOps.newMenusPlan(ws, spec);
  const show = (t, s) => print(`${t}:\n${s.replace(/\r/g, '').replace(/\n$/, '')}\n`);
  show('defineNeuz.h gets', plan.lines.defineNeuz);
  show('defineText.h gets', plan.lines.defineText);
  show('textClient.txt.txt gets', plan.lines.textTxt);
  show('character.inc gets', plan.lines.character);
  print(`Exchange_Script.txt gets ${plan.lines.exchange.split(/\r?\n/).length} lines (the first menu):\n` +
    plan.lines.exchange.replace(/\r/g, '').split('\n').slice(0, 30).join('\n') + '\n  …\n');
  ws.applyGroup(plan.parts, 'new menus');

  const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : String(id); };
  print('In game:');
  for (const l of FRE.newNpcSim.describe(FRE.newNpcSim.inGame(ws, spec.npcKey), name)) print('  ' + l);

  const XS = FRE.exchangeSim, env = XS.envFromWorkspace(ws), table = XS.serverTable(ws.models.exchange);
  let ok = 0, bad = 0;
  print('\nPressing OK on every new exchange (exact ingredients + 1 free slot / one short / full bag, whose used-up ingredients free a slot):');
  plan.ids.forEach((mmi, i) => {
    const m = table.find(mmi);
    m.sets.forEach((set, k) => {
      const r1 = XS.resultExchange(env, table, XS.stockedPlayer(env, set, { free: 1 }), mmi, k, XS.rng(1));
      const short = XS.stockedPlayer(env, set, { free: 1 });
      XS.removeItemA(short, set.cond[0].id, 1);
      const r2 = XS.resultExchange(env, table, short, mmi, k, XS.rng(1));
      const full = XS.stockedPlayer(env, set, { free: 0 });
      const r3 = XS.resultExchange(env, table, full, mmi, k, XS.rng(1));
      const good = r1.result === 'SUCCESS' && r1.given.length === 1 && r2.result === 'CONDITION_FAILED' && r3.result === 'SUCCESS';
      good ? ok++ : bad++;
      if (!good || k === 0) print(`  ${spec.menus[i].label} #${k + 1}: ${r1.result} -> ${r1.given.map(g => name(g.id)).join(', ')} · short: ${r2.result} · full bag: ${r3.result}${good ? '' : '   <-- WRONG'}`);
    });
  });
  print(`  ${ok} exchanges behave as expected, ${bad} do not.`);

  if (write) {
    if (bad) throw new Error('not writing: some exchanges do not behave as expected');
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
    const bdir = `${BASE}/backups/${stamp}_npc-menus`;
    GLib.mkdir_with_parents(bdir + '/Client', 0o755);
    const put = (path, bytes) => { GLib.file_set_contents(path, bytes); if (!FRE.bytes.bytesEqual(readBytes(path), bytes)) throw new Error('verify failed: ' + path); };
    for (const f of ws.dirtyFiles()) {
      put(`${bdir}/${f.name}`, f.bytes);                                        // the original bytes
      const cpath = `${CLIENT}/${f.name}`;
      if (exists(cpath)) {
        const c = new FRE.SourceFile(f.name, readBytes(cpath));
        const mode = FRE.clientSync.modeOf(f, c);
        const out = FRE.clientSync.clientBytes(mode, f, c);
        if (!out) throw new Error(`Client/${f.name} differs from the server copy: not writing anything`);
        put(`${bdir}/Client/${f.name}`, c.bytes);
        f._client = { cpath, out, mode };
      }
    }
    for (const f of ws.dirtyFiles()) {
      put(`${DIR}/${f.name}`, f.serialize());
      if (f._client) put(f._client.cpath, f._client.out);
      print(`  wrote ${f.name}${f._client ? ` + Client (${f._client.mode})` : ''}`);
    }
    print(`\nBackup: ${bdir.slice(ROOT.length + 1)}`);
  } else print('\nNothing written (add --write to write test-data).');
}
