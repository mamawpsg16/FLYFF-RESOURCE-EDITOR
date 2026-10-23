// Boss Mechanics: the JS copy (loaders/bosses.js, bosses-sim.js, edit/bosses-ops.js) against the Python copy (tools/oracle_sim.py bosses).
// Used by tests/run-tests.js. py: the JSON of `oracle_sim.py bosses <fixtures>`; ws: a Workspace({ only: 'bosses' }) on the fixtures
// with the branch files of fixtures/Boss.
export function checkBosses({ FRE, py, ws, ok }) {
  const J = JSON.stringify, B = FRE.bosses, Sim = FRE.bossSim, O = FRE.bossesOps, m = ws.models.bosses;
  const real = ws.files.get('bossmechanics.inc');
  const ctx = { monsters: m.monsters, skills: m.skills, bombs: m.bombs };
  const parse = t => B.parse(t, ctx);
  const sorted = o => Object.keys(o).sort().map(k => [k, o[k]]);
  // 1. the checker + the reader: every error, every boss, on the real file and each made-up one
  let bad = 0, first = '';
  py.files.forEach((f, i) => {
    const r = parse(f.text === null ? real.text : f.text);
    const js = { errors: r.errors.map(e => e.text), bosses: r.bosses.map(b => [b.name, b.line, b.inorder ? b.inorder.value : null, b.tier ? b.tier.value : null,
      b.sig ? b.sig.words : null, b.phases.map(p => [p.hp, p.speed, ...p.w, p.shout]), b.rows.map(x => x.words), b.shapes.slice().sort(), b.arena ? b.arena.value : null]) };
    if (J(js) !== J({ errors: f.errors, bosses: f.bosses })) { bad++; if (!first) first = `file ${i}: ${J(js.errors).slice(0, 400)} vs ${J(f.errors).slice(0, 400)}`; }
  });
  ok(!bad, `checker: ${py.files.length} files (the real one + ${py.files.length - 1} with a planted mistake or a good variant) give the same errors and bosses`, first);
  const byName = new Map(parse(real.text).bosses.map(b => [b.name, b]));
  // 2. the chance of each shape, per phase
  bad = 0; first = '';
  for (const [name, k, c] of py.chances) {
    const r = Sim.chances(byName.get(name), k);
    const js = { total: r.total, attack: r.attack, shape: sorted(r.byShape), tier: [r.byTier[1], r.byTier[2], r.byTier[3]] };
    if (J(js) !== J(c)) { bad++; if (!first) first = `${name} phase ${k}: ${J(js)} vs ${J(c)}`; }
  }
  ok(!bad, `chances: ${py.chances.length} boss phases give the same chance per shape and per tier`, first);
  // 3. fights: every swing (phase, shouts, signature / row / none / busy, the row, the swing time)
  bad = 0; first = '';
  for (const [name, seed, swings, hpEnd, reAttack, busy, out] of py.fights) {
    const js = Sim.run(byName.get(name), { seed, swings, hpEnd, reAttack, busy }).map(s => [s.hp, s.n, s.phase, s.shouts, s.kind, s.row, s.delay]);
    if (J(js) !== J(out)) { bad++; if (!first) first = `${name} seed ${seed}: ${J(js).slice(0, 300)} vs ${J(out).slice(0, 300)}`; }
  }
  ok(!bad, `fights: ${py.fights.length} fights (19 bosses x 3 seeds, busy swings, swing delays) agree on every swing`, first);
  // 4. the attack chance box
  bad = 0; first = '';
  for (const [name, pct, out] of py.spreads) {
    let js;
    try { const r = Sim.spread(O.wordsOf(byName.get(name)), pct); js = { rows: r.rows, total: r.total, pct: r.pct }; } catch (e) { js = null; }
    if (J(js) !== J(out)) { bad++; if (!first) first = `${name} ${pct} %: ${J(js).slice(0, 200)} vs ${J(out).slice(0, 200)}`; }
  }
  ok(!bad, `attack chance box: ${py.spreads.length} chances spread the rows the same way (0 and 101 % refused by both)`, first);
  // 5. edits: the same text after every step (the Python copy edits line by line, the JS by word offsets); a refused op = null in both
  bad = 0; first = '';
  let steps = 0;
  for (const sc of py.edits) {
    let text = real.text;
    sc.ops.forEach((op, k) => {
      steps++;
      const model = parse(text), b = model.bosses.find(x => x.name === op[1]);
      let sp = null;
      try {
        if (op[0] === 'inorder') sp = O.setInorder(text, b, op[2]);
        else if (op[0] === 'tier') sp = O.setTier(text, b, op[2]);
        else if (op[0] === 'arena') sp = O.setArena(text, b, op[2]);
        else if (op[0] === 'sig') sp = O.setSignature(text, b, op[2]);
        else if (op[0] === 'phases') sp = O.setPhases(text, b, op[2]);
        else if (op[0] === 'chance') sp = O.setChance(text, b, op[2]);
        else if (op[0] === 'rows') sp = O.setRows(text, b, op[2]);
        else if (op[0] === 'add') sp = O.addBoss(text, model, op[1], op[2] ? model.bosses.find(x => x.name === op[2]) : null, op[3]);
        else if (op[0] === 'remove') sp = O.removeBoss(text, b);
      } catch (e) { sp = null; }
      const next = sp === null ? null : FRE.SourceFile.spliceText(text, sp, real.kind, real.name);
      if (next !== sc.texts[k]) { bad++; if (!first) first = `${J(op).slice(0, 120)}: ${next === null ? 'refused' : next.length} vs ${sc.texts[k] === null ? 'refused' : sc.texts[k].length}`; }
      if (next !== null) text = next;
    });
  }
  // 6. the arena from pasted /position lines (design v3)
  {
    let badA = 0, firstA = '';
    for (const [text, out] of py.arenas) {
      const js = B.arenaFromPositions(text);
      const got = { spots: js.spots.map(p => [p.x, p.z]), skipped: js.skipped, far: js.far, arena: js.arena, clamped: js.clamped };
      if (J(got) !== J(out)) { badA++; if (!firstA) firstA = `${J(text).slice(0, 80)}: ${J(got)} vs ${J(out)}`; }
    }
    ok(!badA, `arena from /position: ${py.arenas.length} pastes give the same spots, farthest distance and arena`, firstA);
  }
  ok(!bad, `edits: ${py.edits.length} scripts (${steps} steps: inorder, tier, signature, phases, chance %, rows, + / - boss, refusals) give the same bossMechanics.inc after every step`, first);
}
