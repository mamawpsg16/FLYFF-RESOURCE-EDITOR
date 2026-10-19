// Secret Room Winner / Guild Siege Winner: the JS copy (loaders/rates.js loadOwnerBuff / ownerChecks, loaders/ownerbuff-sim.js,
// edit/rates-ops.js) against tools/oracle_sim.py ownerbuff. Used by tests/run-tests.js and tests/run-ownerbuff.js (alone: quick, planted bugs).
export function checkOwnerBuff({ FRE, py, ok, eq, print }) {
  const J = JSON.stringify, R = FRE.rates, O = FRE.ratesOps, S = FRE.ownerBuffSim;
    const CODE = { RT_FIELDS: 'FIELDS', RT_NO_CLOSE: 'NO_CLOSE', RT_OB_TYPE: 'TYPE', RT_OB_DUP: 'DUP', RT_GB_DST_NAME: 'DST_NAME', RT_OB_MISSING: 'MISSING' };
    let same = 0;
    for (const l of py.loads) {
      const L = R.loadOwnerBuff({ name: 'OwnerBuff.txt', text: py.files[l.name] });
      const out2 = []; R.ownerChecks({ owner: L }, {}, out2);
      const codes = [...new Set(out2.map(d => CODE[d.code]).filter(Boolean))].sort();
      const defs = R.OWNER_TYPES.map(t => (L.defs[t.type] ? (d => ({ on: d.on, bonus: d.bonus.map(b => [b.dst, b.adj]), name: d.name, desc: d.desc, icon: d.icon }))(R.ownerDef(L, t.type)) : null));
      if (J(codes) === J(l.codes) && J(defs) === J(l.defs)) same++; else print(`  ${l.name}: JS ${J(codes)} ${J(defs)}\n  PY ${J(l.codes)} ${J(l.defs)}`);
    }
    eq(same, py.loads.length, `${py.loads.length} files (the branch one, shifted, no }, type 5, a type twice, all off, negatives / a stat name / dst 65615, no keyword, LF + spaces, two blocks, empty): the same buffs and problems`);
    same = 0;
    let shown = 0;
    for (const r of py.runs) {
      const L = R.loadOwnerBuff({ name: 'OwnerBuff.txt', text: py.files[r.file] });
      const defs = R.OWNER_TYPES.map(t => R.ownerDef(L, t.type));
      const js = S.run(defs, py.stories[r.story]).map(x => ({ sent: x.sent, players: x.players }));
      const norm = a => J(a.map(x => ({ sent: x.sent, players: Object.fromEntries(Object.entries(x.players).map(([k, p]) => [String(k), { guild: p.guild, online: p.online, bits: p.bits, stats: Object.fromEntries(Object.entries(p.stats).map(([d, v]) => [String(d), v])) }])) })));
      if (norm(js) === norm(r.steps)) same++; else if (shown++ < 2) print(`  ${r.file} story ${r.story}: differs`);
    }
    eq(same, py.runs.length, `${py.runs.length} stories (6 files × 50 stories: wins, tax change, leave / join, log out / in, events on / off, Darkon switched on, the siege cleared): the same buffs, stats and snapshots at every step`);
    same = 0;
    const applySp = (t, sp) => { for (const x of sp.slice().sort((a, b) => b.start - a.start)) t = t.slice(0, x.start) + x.insert + t.slice(x.end); return t; };
    for (const e of py.edits) {
      let t = py.files[e.base];
      try {
        for (const op of e.ops) {
          const L = R.loadOwnerBuff({ name: 'OwnerBuff.txt', text: t }), r = L.defs[op[1]];
          let sp;
          if (op[0] === 'on') sp = O.setOn(r, op[2]);
          else if (op[0] === 'dst') { const b = r.bonus[op[2]]; sp = O.setBonus(b, op[3], op[3] ? (b.adj.value || 1) : 0); }
          else if (op[0] === 'adj') sp = O.setNumber(r.bonus[op[2]].adj, op[3], -2147483647, 2147483647, 'amount');
          else if (op[0] === 'addrow') sp = O.addOwnerRow(t, L, { type: op[1], on: op[2], bonus: op[3].map(([dst, adj]) => ({ dst, adj })), name: op[4], desc: op[5], icon: op[6] });
          else sp = O.setString(r[op[0]], op[2], op[0]);
          t = applySp(t, sp);
        }
        if (t === e.text) same++; else print(`  edit ${J(e.ops)}: the files differ`);
      } catch (x) { print(`  edit ${J(e.ops)}: ${x.message}`); }
    }
    eq(same, py.edits.length, `${py.edits.length} edit scripts (on / off, stats picked / emptied, amounts, name / description / icon, a missing row added): byte-identical files`);
  }
