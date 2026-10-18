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
    for (let t = 1; t <= 7; t++) {
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

// Turn-in Race (step 3): the JS copy (loaders/minievent-turnin.js, edit/minievent-ops.js) against tools/oracle_sim.py turnin.
// ws: a Workspace({ only: 'minievent' }) with its map files read (WdMadrigal.rgn: monster spots, area names).
export function checkTurnIn({ FRE, py, ws, ok }) {
  const J = JSON.stringify, T = FRE.miniEventTurnIn, O = FRE.miniEventOps, c = T.context(ws);
  const all = T.allHints(c), mine = {};
  for (const [id, t] of all) mine[id] = t;
  const keys = new Set([...Object.keys(mine), ...Object.keys(py.hints)]);
  const bad = [...keys].filter(k => mine[k] !== py.hints[k]);
  ok(!bad.length, `where to get it: ${keys.size} items get the same ITEM_HINT text (drops with the area name, shops, Donation Shop, exchanges, boxes)`,
    `${bad.length} differ, e.g. ${J(bad.slice(0, 4).map(k => [k, mine[k] || null, py.hints[k] || null]))}`);
  const ab = py.areas.filter(([x, z, a, t]) => T.areaName(c.mad, x, z) !== a || T.townOf(c.mad, x, z) !== t);
  ok(!ab.length, `area names: ${py.areas.length} spots (every 3rd monster spot, made-up points, box centres and corners) get the same "<area> (<town>)"`,
    J(ab.slice(0, 2).map(([x, z, a, t]) => [x, z, a, t, T.areaName(c.mad, x, z), T.townOf(c.mad, x, z)])));
  const tb0 = py.tiers.filter(([rk, pb, t]) => T.tierOf(rk, pb) !== t);
  ok(!tb0.length, `which drops count as "normal monster, 1 %+": ${py.tiers.length} rank x chance edges`, J(tb0.slice(0, 3)));
  const P = T.pools(c), pj = [P.parts.map(x => x.id), P.food.map(x => x.id), P.gear.map(x => x.id)];
  ok(J(pj) === J(py.pools), `random recipes: the same item pools (${pj.map(x => x.length).join(' / ')} parts / supplies / gear)`,
    pj.map((x, i) => `${x.length} vs ${py.pools[i].length}: +${x.filter(v => !py.pools[i].includes(v)).slice(0, 5)} -${py.pools[i].filter(v => !x.includes(v)).slice(0, 5)}`).join('; '));
  const m = ws.models.minievent, skip0 = new Set(m.events[5].recipes.map(r => T.comboKey(r.items.map(x => x.id))));
  const gb = py.gens.filter(g => J(T.generate(c, g.n, g.seed, g.skip ? skip0 : new Set()).map(r => ({ title: r.title, items: r.items }))) !== J(g.out));
  ok(!gb.length, `random recipes: ${py.gens.length} lists (5 - 1,000 recipes, other seeds, without the file's combinations) are the same, recipe by recipe`,
    gb.length ? `n ${gb[0].n} seed ${gb[0].seed}: ${J(T.generate(c, gb[0].n, gb[0].seed, gb[0].skip ? skip0 : new Set()).slice(0, 2))} vs ${J(gb[0].out.slice(0, 2))}` : '');
  const tb = py.turns.filter(t => { const r = T.turnIn({ items: t.items }, t.bag); return J([r.ok, r.missing.map(x => [x.id, x.n, x.have]), r.bag]) !== J([t.res.ok, t.res.missing, t.res.bag]); });
  ok(!tb.length, `turning in: ${py.turns.length} made-up bags (equipped / locked items, several stacks, too few) give the same result and the same bag after`, J(tb.slice(0, 1)));
  // recipe / hint edits: the editor's splices = the Python copy's line edits
  const real = ws.files.get('minievent.inc').text;
  const oc = { itemOk: id => !!ws.itemById(id), keyOf: id => ws.itemById(id).define, nameOf: id => ws.itemById(id).name };
  const load = text => FRE.miniEvent.loadMiniEvent({ name: 'MiniEvent.inc', text }, { defines: ws.defines.defines, items: ws.items.items, movers: ws.movers.movers, charKeys: m.charKeys });
  let eb = 0, first = '';
  py.edits.forEach((cs, k) => {
    let text = real;
    try {
      for (const op of cs.script) {
        const mm = load(text), rs = mm.events[5].recipes, at = op.n < 0 ? rs.length + op.n : op.n;
        let sp;
        if (op.op === 'add') sp = O.addRecipe(text, mm, op.r, oc);
        else if (op.op === 'edit') sp = O.editRecipe(text, rs[at], op.r, oc);
        else if (op.op === 'remove') sp = O.removeRecipe(text, rs[at]);
        else if (op.op === 'hint') sp = O.setHint(text, mm, op.map[0][0], op.map[0][1], oc.keyOf);
        else if (op.op === 'hints') sp = O.addHints(text, mm, new Map(op.map), oc.keyOf);
        else if (op.op === 'unhint') sp = O.removeHint(text, mm, op.id);
        else if (op.op === 'replace') sp = O.putRecipes(text, mm, op.list, oc, 'replace');
        for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR ' + er.message; }
    if (text !== cs.text) { eb++; if (!first) { let i = 0; while (text[i] === cs.text[i]) i++; first = `script ${k} at ${i}: ${J(text.slice(i - 60, i + 80))} vs ${J(cs.text.slice(i - 60, i + 80))}`; } }
  });
  ok(!eb, `recipe / hint edits: ${py.edits.length} scripts (add, change, remove, 4 items, a ' in a title, hints set / kept / removed, a whole new list) give the same file, byte for byte`, first);

  // Hide and Seek (step 4): spot suggestions, hint times, Found's distance, SPOT edits
  const HS = FRE.miniEventHide, hp = py.hide;
  if (!hp) { ok(false, 'the Python copy gave no Hide and Seek cases'); return; }
  const mobs = HS.mobs(ws, c.mad);
  const sb = hp.sugg.filter(([x, z, r, h, l]) => { const s2 = HS.suggest(c.mad, mobs, x, z); return s2.region !== r || s2.hint !== h || s2.landmark !== l; });
  ok(mobs.length === hp.mobs && !sb.length, `Hide and Seek: ${hp.sugg.length} spots get the same region / hint / landmark (${mobs.length} monster spots for hints)`,
    `${mobs.length} vs ${hp.mobs}; ${J(sb.slice(0, 2).map(([x, z, r, h, l]) => [x, z, [r, h, l], HS.suggest(c.mad, mobs, x, z)]))}`);
  const tb2 = hp.times.filter(([rt, a, b]) => { const t = HS.hintTimes(rt); return t.hint !== a || t.landmark !== b; });
  ok(!tb2.length, `Hide and Seek: hint / landmark times for every round time 5-600 s`, J(tb2.slice(0, 3)));
  const fb = hp.found.filter(([sx, sz, px, pz, f]) => HS.found({ x: Math.fround(sx), z: Math.fround(sz) }, Math.fround(px), Math.fround(pz)) !== f);
  ok(!fb.length, `Hide and Seek: "Found it!" within 6 m: ${hp.found.length} cases at the edge`, J(fb.slice(0, 2)));
  let hb = 0, hf = '';
  hp.edits.forEach((cs, k) => {
    let text = real;
    try {
      for (const op of cs.script) {
        const mm = load(text), sps = mm.events[6].spots, at = op.n < 0 ? sps.length + op.n : (op.n || 0);
        const sp = op.op === 'add' ? O.addSpot(text, mm, op.s) : op.op === 'remove' ? O.removeSpot(text, sps[at]) : O.editSpot(text, sps[at], op.s);
        for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR ' + er.message; }
    if (text !== cs.text) { hb++; if (!hf) { let i = 0; while (text[i] === cs.text[i]) i++; hf = `script ${k} at ${i}: ${J(text.slice(i - 60, i + 80))} vs ${J(cs.text.slice(i - 60, i + 80))}`; } }
  });
  ok(!hb, `Hide and Seek: ${hp.edits.length} SPOT edit scripts (add, the longest texts, change with a ' inside, the /hidespot line keeps its comment, remove) give the same file`, hf);
}

// the week (step 5): the JS copy (loaders/minievent-week.js) against tools/oracle_sim.py week.
// ws: a Workspace({ only: 'minievent' }) (FFAManager.inc / TDMManager.inc / GuildCombat.txt / FreePKTime.txt read)
export function checkWeek({ FRE, py, ws, ok }) {
  const J = JSON.stringify, WK = FRE.miniEventWeek, m0 = ws.models.minievent;
  const pvp = FRE.pvp.fromWorkspace(ws);
  const fps = py.fp_texts.map(t => WK.readFreePk(t === null ? null : { name: 'FreePKTime.txt', text: t }));
  const fpJ = fps.map(f => (f.ok ? { dur: f.dur, slots: f.slots.map(x => [x.day, x.hour, x.minute]) } : null));
  ok(J(fpJ) === J(py.freepk), `FreePKTime.txt: ${py.fp_texts.length} files (the real one, missing, a whole day, bad rows, DURATION 0, an unknown word) read the same way`, `${J(fpJ).slice(0, 300)} vs ${J(py.freepk).slice(0, 300)}`);
  const load = text => FRE.miniEvent.loadMiniEvent({ name: 'MiniEvent.inc', text }, { defines: ws.defines.defines, items: ws.items.items, movers: ws.movers ? ws.movers.movers : null, charKeys: m0.charKeys });
  const models = py.texts.map(load);
  let bad = 0, first = '', n = 0;
  for (const c of py.cases) {
    const from = py.week0, until = from + 21 * 86400;
    const res = WK.week(models[c.text], pvp, fps[c.fp], from, until, { seed: c.seed });
    const busy = res.busy.map(w => [w.ev, w.from, w.to]).sort((a, b) => a[1] - b[1] || a[2] - b[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const runs = res.runs.map(r => [r.start, r.line, r.type, r.picked, r.announce, r.end, r.busy, r.why]);
    n += runs.length;
    if (J(busy) !== J(c.busy) || J(runs) !== J(c.runs)) {
      bad++;
      if (!first) {
        const i = runs.findIndex((r, k) => J(r) !== J(c.runs[k]));
        first = J(busy) !== J(c.busy) ? `case text ${c.text} fp ${c.fp}: busy ${busy.length} vs ${c.busy.length}: ${J(busy.find((b, k) => J(b) !== J(c.busy[k])))} vs ${J(c.busy.find((b, k) => J(b) !== J(busy[k])))}`
          : `case text ${c.text} fp ${c.fp} seed ${c.seed} at ${i}: ${J(runs[i])} vs ${J(c.runs[i])}`;
      }
    }
  }
  ok(!bad, `the week: ${py.cases.length} cases (7 start-time sets x 6 Free PK files x 2 seeds, 3 weeks, ${n} starts: runs, skips for FFA / TDM / Guild Siege / Free PK Time, lost inside a run, random picks) agree`, first);
}

// Vagrant Race (V19 ce1659f6 / 321d3c1b, not yet built): RACE_START / RACE_POINT + the WdRace check (ReadConfig, VecInWorld), the
// round points (finishers by place, the rest value for the others; nobody finished = places by how far up), RACE_START edits.
// The JS copy against tools/oracle_sim.py race.
export function checkRace({ FRE, py, ws, ok }) {
  const J = JSON.stringify, D = ws.defines.defines, ME = FRE.miniEvent, Sim = FRE.miniEventSim, O = FRE.miniEventOps;
  const real = ws.files.get('minievent.inc');
  if (!ws.chars) ws.chars = FRE.character.loadCharacters(ws.files, { defines: D, strings: ws.strings.map });
  if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: D, strings: ws.strings.map });
  const base = { defines: D, items: ws.items.items, movers: ws.movers.movers, charKeys: new Set(ws.chars.npcs.map(n => n.key.toLowerCase())) };
  const world = w => (w === null ? undefined : w === false ? null : { w: w[0], h: w[1], mpu: w[2] });
  let bad = 0, first = '';
  for (const f of py.files) {
    const m = ME.loadMiniEvent({ name: 'MiniEvent.inc', text: f.text === null ? real.text : f.text }, Object.assign({ raceWorld: world(f.world) }, base));
    const e = m.events[7];
    const js = { loaded: e.loaded, v: e.values, pts: [...e.pointValues, e.restPoints], race: [m.race.x, m.race.z], rstart: !!m.raceStart,
      rpoints: m.racePoints.map(p => [p.x.value, p.z.value]), begins: m.begins.map(b => [b.type, b.day.value, b.hour.value, b.minute.value]), errors: m.errors.map(x => x.message) };
    const p = { loaded: f.loaded, v: f.v, pts: f.pts, race: f.race, rstart: f.rstart, rpoints: f.rpoints, begins: f.begins, errors: f.errors };
    if (J(js) !== J(p)) { bad++; if (!first) first = `world ${J(f.world)} ${J((f.text || 'real').slice(0, 60))}: ${J(js).slice(0, 300)} vs ${J(p).slice(0, 300)}`; }
  }
  ok(!bad, `Vagrant Race lines: ${py.files.length} cases (the real file + ${py.files.length / 7 - 1} made-up files x 7 map sizes / no map / not read) read the same way`, first);
  const eb = py.edges.filter(([w, x, z, want]) => ME.vecInWorld({ w: w[0], h: w[1], mpu: w[2] }, x === 'nan' ? NaN : x, z) !== want);
  ok(!eb.length, `VecInWorld: ${py.edges.length} points at the map edges (float32) agree`, J(eb.slice(0, 3)));
  const itemOf = id => { const it = ws.items.items.get(id >>> 0); return it ? { packMax: FRE.specItem.get(it, 'dwPackMax') } : null; };
  bad = 0; first = '';
  for (const r of py.runs) {
    const e = { values: { ROUND_TIME: r.rt }, pointValues: r.pts, restPoints: r.restp,
      ranks: r.ranks.map(x => (x ? { id: x[0], amount: { value: x[1] } } : null)), rest: r.rest ? { id: r.rest[0], amount: { value: r.rest[1] } } : null };
    const out = Sim.run({ type: 7, e, players: r.players, rounds: r.rounds, seed: 1 }, itemOf);
    const js = { out: out.rounds.map(x => ({ dice: x.dice, rows: x.rows })), final: out.final.map(x => [x.id, x.place, x.points, x.time, x.prize, x.stacks, x.top]) };
    if (J(js) !== J({ out: r.out, final: r.final })) { bad++; if (!first) first = `variant ${r.variant} players ${r.players.length}: ${J(js).slice(0, 300)} vs ${J({ out: r.out, final: r.final }).slice(0, 300)}`; }
  }
  ok(!bad, `whole races: ${py.runs.length} runs (1-40 racers, finishers with gaps, rounds nobody finished ranked by how far up, ties) give the same points, places and prizes`, first);
  bad = 0; first = '';
  for (const c of py.edits) {
    let text = c.base === 0 ? real.text : py.bases[c.base - 1];
    try {
      const m = ME.loadMiniEvent({ name: 'MiniEvent.inc', text }, base);
      m.raceWorld = world(c.world);
      const sp = O.setRaceStart(text, m, c.x, c.z);
      for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
    } catch (er) { text = 'ERROR'; }
    if (text !== c.text) { bad++; if (!first) first = `base ${c.base} ${c.x}, ${c.z} world ${J(c.world)}: ${J(text.slice(-160))} vs ${J(String(c.text).slice(-160))}`; }
  }
  ok(!bad, `race start edits: ${py.edits.length} scripts (in place, a new line after the race's EVENT / POINTS line, decimals, outside the map, 0) give the same file`, first);
  bad = 0; first = '';
  for (const c of py.pedits || []) {
    let text = c.base === 0 ? real.text : py.bases[c.base - 1];
    try {
      for (const op of c.script) {
        const m = ME.loadMiniEvent({ name: 'MiniEvent.inc', text }, base);
        m.raceWorld = world(c.world);
        const sp = op[0] === 'add' ? O.addRacePoint(text, m, op[1], op[2]) : op[0] === 'edit' ? O.editRacePoint(text, m, m.racePoints[op[1]], op[2], op[3]) : O.removeRacePoint(text, m.racePoints[op[1]]);
        for (const x of [...sp].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR'; }
    if (text !== c.text) { bad++; if (!first) first = `base ${c.base} ${J(c.script)} world ${J(c.world)}: ${J(text.slice(-160))} vs ${J(String(c.text).slice(-160))}`; }
  }
  ok(py.pedits && !bad, `checkpoint edits: ${(py.pedits || []).length} scripts (add after the last one / the start / the EVENT line, change, remove with its comment, outside the map, 0) give the same file`, first);
  // the race map's monsters (WdRace.rgn, FRE.raceMap): what spawns, and the edits
  const RM = FRE.raceMap, rf = ws.worldFiles && ws.worldFiles.get(RM.KEY);
  if (!py.rmap || !rf) { ok(false, 'the race map (WdRace.rgn) and its Python cases are there'); return; }
  const kind = s => (s ? (s.includes('guard') ? 'guard' : s.includes('material') ? 'material' : 'unknown') : null);
  const sp = f => RM.spawns(RM.parse(f), ws.movers.movers, D).map(x => [x.mover, x.rank, x.count, x.attack, x.seconds, kind(x.skipped)]);
  ok(J(sp(rf)) === J(py.rmap.spawns), `race map: the ${py.rmap.spawns.length} spawn spots of WdRace.rgn give the same monsters, counts, aggressive counts and respawn times`, J(sp(rf)).slice(0, 200));
  ok(J(sp({ text: py.rmap.small })) === J(py.rmap.smallSpawns), 'race map: a small made-up file (an unknown monster, Aibatt x 0.5, another type) reads the same way', J(sp({ text: py.rmap.small })));
  bad = 0; first = '';
  for (const c of py.rmap.edits) {
    let text = rf.text;
    try {
      for (const op of c.script) {
        const rg = RM.parse({ text });
        const s2 = op[0] === 'count' ? RM.setCount(rg, op[1], op[2], op[3]) : op[0] === 'remove' ? RM.removeLine(text, rg, op[1])
          : RM.addLine(text, rg, { mover: op[1], x: op[2], y: op[3], z: op[4], count: op[5], attack: op[6], time: op[7], radius: op[8] }, ws.movers.movers);
        for (const x of [...s2].sort((a, b) => b.start - a.start)) text = text.slice(0, x.start) + x.insert + text.slice(x.end);
      }
    } catch (er) { text = 'ERROR'; }
    if (text !== c.text) { bad++; if (!first) { let k = 0; while (text[k] === c.text[k]) k++; first = `${J(c.script)} at ${k}: ${J(text.slice(k - 40, k + 80))} vs ${J(String(c.text).slice(k - 40, k + 80))}`; } }
  }
  ok(!bad, `race map edits: ${py.rmap.edits.length} scripts (how many / aggressive, remove, add a spawn after the last one, every limit) give the same file`, first);
}
