// Mini Events: the JS copy (loaders/minievent.js, minievent-sim.js) against the Python copy (tools/oracle_sim.py minievent).
// Used by tests/run-tests.js and tests/run-minievent.js (this part alone: quick, and for planted bugs).
export function checkMiniEvent({ FRE, py, ws, ok }) {
  const J = JSON.stringify, D = ws.defines.defines, ME = FRE.miniEvent, Sim = FRE.miniEventSim;
  const real = ws.files.get('minievent.inc');
  if (!ws.chars) ws.chars = FRE.character.loadCharacters(ws.files, { defines: D, strings: ws.strings.map });
  if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: D, strings: ws.strings.map });
  const ctx = { defines: D, items: ws.items.items, movers: ws.movers.movers, charKeys: new Set(ws.chars.npcs.map(n => n.key.toLowerCase())) };
  let bad = 0, first = '';
  py.files.forEach((f, i) => {
    const m = ME.loadMiniEvent({ name: 'MiniEvent.inc', text: f.text === null ? real.text : f.text }, ctx);
    const evs = {};
    for (let t = 1; t <= 6; t++) {
      const e = m.events[t];
      evs[t] = { loaded: e.loaded, v: e.values, ranks: e.ranks.map(r => (r ? [r.id, r.amount.value] : null)), rest: e.rest ? [e.rest.id, e.rest.amount.value] : null,
        pts: [...e.pointValues, e.restPoints], asks: e.asks.length, recipes: e.recipes.length, spots: e.spots.length };
    }
    const js = { events: evs, begins: m.begins.map(b => [b.type, b.day.value, b.hour.value, b.minute.value]), hints: m.hints.length,
      hide: m.hideNpc ? [m.hideNpc.mover.value, m.hideNpc.key.text] : null, errors: m.errors.map(e => e.message) };
    js.qs = { 2: m.events[2].asks.map(a => [null, a.question.text, a.info.text]), 3: m.events[3].asks.map(a => [a.truth.text, a.question.text, null]) };
    const p = { events: f.events, begins: f.begins, hints: f.hints, hide: f.hide, errors: f.errors, qs: f.qs };
    if (J(js) !== J(p)) { bad++; if (!first) { let k = 0; const a = J(js), b = J(p); while (a[k] === b[k]) k++; first = `file ${i} at ${k}: …${a.slice(k - 80, k + 120)}  vs  …${b.slice(k - 80, k + 120)}`; } }
  });
  ok(!bad, `MiniEvent.inc read the same way: the real file + ${py.files.length - 1} made-up files (settings, prizes, points, lists, start times, every error)`, first);
  const itemOf = id => { const it = ws.items.items.get(id >>> 0); return it ? { packMax: FRE.specItem.get(it, 'dwPackMax') } : null; };
  bad = 0; first = '';
  for (const r of py.runs) {
    const e = { values: { ROUND_TIME: r.rt }, pointValues: r.pts, restPoints: r.restp,
      ranks: r.ranks.map(x => (x ? { id: x[0], amount: { value: x[1] } } : null)), rest: r.rest ? { id: r.rest[0], amount: { value: r.rest[1] } } : null };
    const out = Sim.run({ type: r.type, e, players: r.players, rounds: r.rounds, seed: r.seed }, itemOf);
    const js = { out: out.rounds.map(x => ({ dice: x.dice, rows: x.rows })), final: out.final.map(x => [x.id, x.place, x.points, x.time, x.prize, x.stacks, x.top]) };
    if (J(js) !== J({ out: r.out, final: r.final })) { bad++; if (!first) first = `type ${r.type} variant ${r.variant} players ${r.players.length}: ${J(js).slice(0, 300)} vs ${J({ out: r.out, final: r.final }).slice(0, 300)}`; }
  }
  const sb = (py.stacks || []).filter(([pm, n, st]) => J(Sim.stacks({ packMax: pm }, n)) !== J(st));
  ok(py.stacks && !sb.length, `prize stacks: ${(py.stacks || []).length} stack sizes x amounts split the same way`, J(sb.slice(0, 2)));
  ok(!bad, `whole events: ${py.runs.length} runs (every event type, 0-25 players, ties, no picks, other points / prizes) give the same round points, places and prizes`, first);

  // the question order: MiniEventAsked.txt read, then several events in a row
  if (!py.order) { ok(false, 'the Python copy gave no question-order cases'); return; }
  const pb = py.order.parsed.filter(([t, want]) => J([...Sim.parseAsked(t)].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) !== J(want));
  ok(!pb.length, `MiniEventAsked.txt: ${py.order.parsed.length} files (junk lines, times 0 / negative, CR, lines longer than 511) read the same way`, J(pb.slice(0, 1)).slice(0, 400));
  const realQs = py.files[0].qs;
  bad = 0; first = '';
  for (const c of py.order.cases) {
    const type = c.key === 'OXQUIZ' ? 3 : 2;
    const texts = c.texts || realQs[c.set].map(q => q[1]);
    const e = { asks: texts.map(q => ({ question: { text: q } })), values: { ROUNDS: c.rounds, ASK_DAYS: c.days, ROUND_TIME: c.rt, SCORE_TIME: c.sc } };
    const runs = Sim.askRuns(e, type, new Map(c.asked), c.start, c.every, 4, c.seed).map(r => [r.order, r.recent]);
    if (J(runs) !== J(c.runs)) { bad++; if (!first) first = `${c.set} rounds ${c.rounds} days ${c.days}: ${J(runs).slice(0, 200)} vs ${J(c.runs).slice(0, 200)}`; }
  }
  ok(!bad, `question order: ${py.order.cases.length} cases x 4 events in a row (Quick Hands 547 / O/X 364 / 4 / 1 questions, 1-30 rounds, 0-30 days) pick the same questions`, first);
  // question edits: the editor's splices = the Python copy's line edits
  const O = FRE.miniEventOps;
  bad = 0; first = '';
  py.edits.forEach((c, k) => {
    let text = c.base === null ? real.text : c.base;
    try {
      for (const [type, op] of c.script) {
        const m = ME.loadMiniEvent({ name: 'MiniEvent.inc', text }, ctx), asks = m.events[type].asks;
        const ask = op.n === undefined ? null : asks[op.n < 0 ? asks.length + op.n : op.n];
        const sp = op.op === 'add' ? O.addAsk(text, m, type, op.q) : op.op === 'edit' ? O.editAsk(text, ask, type, op.q) : O.removeAsk(text, ask);
        for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR ' + er.message; }
    if (text !== c.text) { bad++; if (!first) { let i = 0; while (text[i] === c.text[i]) i++; first = `script ${k} at ${i}: ${J(text.slice(i - 40, i + 60))} vs ${J(c.text.slice(i - 40, i + 60))}`; } }
  });
  ok(!bad, `question edits: ${py.edits.length} add / change / remove scripts give the same file, byte for byte`, first);
}
