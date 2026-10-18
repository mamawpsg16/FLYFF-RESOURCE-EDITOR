// Bot Check: the JS copy (loaders/antibot.js, antibot-sim.js, edit/antibot-ops.js) against tools/oracle_sim.py antibot.
// Used by tests/run-tests.js and tests/run-antibot.js (this part alone: quick, and for planted bugs).
export function checkAntiBot({ FRE, py, ws, ok }) {
  const J = JSON.stringify, A = FRE.antiBot, Sim = FRE.antiBotSim, O = FRE.antiBotOps;
  const real = ws.files.get('antibot.inc');
  const worlds = new Set(ws.worldList().map(w => w.id >>> 0));
  const load = text => A.loadAntiBot({ name: 'AntiBot.inc', text }, { defines: ws.defines.defines, items: ws.items.items, worlds });
  let bad = 0, first = '';
  py.files.forEach((f, i) => {
    const m = load(f.text === null ? real.text : f.text);
    const tune = {}; for (const t of A.TUNING) tune[t.key] = m.tune[t.key].value;
    const js = { ok: m.ok, words: m.lines.map(r => [r.id, r.word.text]), skipped: m.skipped.map(r => [r.id, r.word.text, /does not exist/.test(r.why) ? 'item' : 'dup']),
      tune, nocheck: m.worlds.map(w => w.world), errors: m.errors.map(e => (e.key ? e.key : `world ${e.world}`)) };
    const p = { ok: f.ok, words: f.words, skipped: f.skipped, tune: f.tune, nocheck: f.nocheck, errors: f.errors };
    if (J(js) !== J(p)) { bad++; if (!first) { let k = 0; const a = J(js), b = J(p); while (a[k] === b[k]) k++; first = `file ${i} at ${k}: …${a.slice(Math.max(0, k - 80), k + 120)}  vs  …${b.slice(Math.max(0, k - 80), k + 120)}`; } }
  });
  ok(!bad, `AntiBot.inc read the same way: the real file + ${py.files.length - 1} made-up files (repeated words in any case, a missing item, an empty word, fewer than 6, every tuning edge, unknown maps, a word before the header)`, first);
  const ms = [load(real.text), null, null, load(py.files[3].text)];
  bad = 0; first = '';
  for (const c of py.sessions) {
    const r = Sim.session(ms[c.m], { seed: c.seed, every: c.every, step: c.step, climb: c.climb, answer: c.answer, delay: c.delay, seconds: c.seconds });
    const log = r.log.map(x => (x.ev === 'open' ? [x.t, 'open', x.reason, x.word, x.items, x.correct] : x.ev === 'frozen' ? [x.t, 'frozen', x.detail, x.word, x.items, x.correct]
      : x.ev === 'wrong' ? [x.t, 'wrong', x.tries] : x.ev === 'icons' ? [x.t, 'icons', x.word, x.items, x.correct] : [x.t, x.ev]));
    const js = { log, n: [r.entry.puzzles, r.entry.solved, r.entry.frozen, r.entry.town], score: r.entry.score };
    if (J(js) !== J(c.out)) { bad++; if (!first) { const k = log.findIndex((x, i) => J(x) !== J(c.out.log[i])); first = `m ${c.m} every ${c.every} step ${c.step} ${c.answer} after ${c.delay}: at ${k} ${J(log[k])} vs ${J(c.out.log[k])}; ${J(js.n)} vs ${J(c.out.n)}`; } }
  }
  ok(!bad, `a player's hours: ${py.sessions.length} sessions (kill rates, camping or moving, right / wrong / no answers, the default and a tuned file) give the same puzzles, pictures, freezes and towns`, first);
  // edits: the editor's splices = the Python copy's line edits
  bad = 0; first = '';
  py.edits.forEach((cs, k) => {
    let text = real.text;
    try {
      for (const op of cs.script) {
        const m = load(text), at = op.n < 0 ? m.lines.length + op.n : op.n, D = ws.defines.defines;
        let sp;
        if (op.op === 'add') sp = O.addWord(text, m, D.get(op.define) >>> 0, op.define, op.word);
        else if (op.op === 'word') sp = O.editWord(text, m, m.lines[at], op.word);
        else if (op.op === 'remove') sp = O.removeWord(text, m.lines[at]);
        else if (op.op === 'tune') sp = O.setTune(text, m, op.key, Number(op.v));
        else if (op.op === 'world') sp = O.addWorld(text, m, op.define, D.get(op.define) >>> 0);
        else if (op.op === 'unworld') sp = O.removeWorld(text, m, D.get(op.define) >>> 0);
        for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR ' + er.message; }
    if (text !== cs.text) { bad++; if (!first) { let i = 0; while (text[i] === cs.text[i]) i++; first = `script ${k} at ${i}: ${J(text.slice(i - 60, i + 80))} vs ${J(cs.text.slice(i - 60, i + 80))}`; } }
  });
  ok(!bad, `AntiBot.inc edits: ${py.edits.length} scripts (a word added / changed / removed, the score / camping radius / GM switch, maps added and removed) give the same file, byte for byte`, first);
}
