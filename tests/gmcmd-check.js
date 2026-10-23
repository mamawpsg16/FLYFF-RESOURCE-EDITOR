// GM Commands: the JS copy (loaders/gmcmd.js, gmcmd-sim.js) against the Python copy (tools/oracle_sim.py gmcmd).
// Used by tests/run-tests.js (the core suite) and tests/run-gmcmd.js (this part alone: quick, and for planted bugs).
//   py: the JSON of `oracle_sim.py gmcmd <fixtures>`; m: the gmcmd model of a Workspace({ only: 'gmcmd', cpp }) on the fixtures
export function checkGmCmd({ FRE, py, m, ok, eq }) {
  const J = JSON.stringify;
  // 1. the table: every row, its line, names, side, level, and in which build it is compiled
  const js = m.rows.map(r => [r.line, r.name, r.short, r.side, r.auth, r.inServer, r.inClient]);
  let bad = js.length === py.rows.length ? 0 : 1, first = bad ? `${js.length} rows vs ${py.rows.length}` : '';
  js.forEach((r, i) => { if (J(r) !== J(py.rows[i])) { bad++; if (!first) first = `${J(r)} vs ${J(py.rows[i])}`; } });
  ok(!bad, `the table: ${py.rows.length} rows read the same way (line, names, side, level, WorldServer / game build)`, first);
  // 2. typed lines: ParsingCommand in the game, then on the server
  bad = 0; first = '';
  for (const c of py.cases) {
    const r = FRE.gmCmdSim.type(m, c.line, { auth: c.auth });
    const got = { result: r.result, row: r.row ? r.row.name : null, game: r.game ? r.game.stop : null, server: r.server ? r.server.stop : null };
    if (J(got) !== J(c.out)) { bad++; if (!first) first = `${J(c.line)} as ${c.auth}: ${J(got)} vs ${J(c.out)}`; }
  }
  ok(!bad, `typed lines: ${py.cases.length} lines x levels give the same result (runs in the game / on the server / chat / nothing)`, first);
  // 3. made-up tables: #if __VER / #ifndef / defined() / #else, /* */ and // rows, names starting "op", a row only one build has
  bad = 0; first = '';
  const W = new Set(py.switches.ws), N = new Set(py.switches.nz);
  py.tables.forEach((t, ti) => {
    const mm = FRE.gmCmd.parseTable(t.text, W, N);
    const rows = mm.rows.map(r => [r.line, r.name, r.short, r.side, r.auth, r.inServer, r.inClient]);
    if (J(rows) !== J(t.rows)) { bad++; if (!first) first = `table ${ti}: ${J(rows)} vs ${J(t.rows)}`; }
    for (const c of t.cases) {
      const r = FRE.gmCmdSim.type(mm, c.line, { auth: c.auth });
      const got = { result: r.result, row: r.row ? r.row.name : null, game: r.game ? r.game.stop : null, server: r.server ? r.server.stop : null };
      if (J(got) !== J(c.out)) { bad++; if (!first) first = `table ${ti} ${J(c.line)} as ${c.auth}: ${J(got)} vs ${J(c.out)}`; }
    }
  });
  ok(!bad, `made-up tables: ${py.tables.length} tables, ${py.tables.reduce((n, t) => n + t.cases.length, 0)} typed lines agree`, first);
  // 4. pet.inc: the kinds and how high each stage can roll
  eq(J(m.pets.kinds.map(k => ({ dst: k.dst, params: k.params, item: k.item }))), J(py.pets.kinds), 'pet.inc: the pet kinds (stat, the 9 amounts, item)');
  eq(J(m.pets.stageMax), J(py.pets.top), 'pet.inc: the highest roll of stages D-S');
}
