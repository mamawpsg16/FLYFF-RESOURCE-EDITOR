// Mini Events simulator: what the MiniEvent.inc values do in game (WORLDSERVER/MiniEventMng.cpp, V19 25e4f227 / e9ee7010 / 3b12a4bb).
//   endRound()  CMiniEventMng::EndRound (:852-1007): the round points of every event type
//                 Color Game: 3 dice xRandom( 6 ), MINIEVENT_COLOR_DIE_POINTS 2 per die of your colour, +MINIEVENT_COLOR_FIRST_BONUS 1
//                   for the first player (lowest lock-in ms, then the lowest player id) who picked a colour that hit;
//                 Quick Hands / Turn-in Race / Hide and Seek: pick = the place of the correct answer / turn-in / find
//                   -> POINTS place 1-10, the rest value below; O/X Quiz: right answers sorted by lock-in ms (then id) -> the same;
//                 Lucky Draw: the players (by id) shuffled with xRandom( i + 1 ) -> places; tie-break adds the place.
//                 No pick adds the whole round time to the tie-break (ROUND_TIME x 1000 ms).
//   ranking()   GetRanking + MERankLess (:1010-1026): more points, then less total lock-in time, then the lower player id.
//   finish()    Finish (:1073-1148) + GiveItem (:1190-1240): places 1-10 get RANK 1-10 when they have more than 0 points, everyone
//               else REST; no item / amount 0 = nothing; the amount is split into stacks of dwPackMax (max 0x7fff).
//   run()       a whole event: rounds of endRound, the places after each round (and the places gained / lost), then finish().
// Players are kept in a std::map<u_long, ME_PLAYER>: every loop goes by ascending player id, as here.
// Not modelled (yet): registration, the start / cancel, the question / recipe / spot order, Turn-in items, Hide and Seek hints,
// the schedule; packets, mail delivery (a full bag mails the same stacks).
(function (FRE) {
  'use strict';
  const DIE_POINTS = 2, FIRST_BONUS = 1, COLORS = 6, RANKS = 10;   // CustomCommon.h:267-270
  const u32 = v => v >>> 0;

  // players: [{ id, name }] -> the server's map, by ascending id
  function newPlayers(players) {
    return [...players].sort((a, b) => a.id - b.id).map(p => ({ id: p.id, name: p.name || `P${p.id}`, points: 0, roundPoints: 0, pick: -1, pickMs: 0, totalMs: 0, place: 0, move: 0 }));
  }

  // cfg: { type, pointValues[10], restPoints, roundTime }; picks: Map/obj id -> { pick, ms }; truth (O/X Quiz: true = O); rng (FRE.xRandom.rng)
  function endRound(cfg, list, picks, truth, rng) {
    const P = cfg.pointValues, R = cfg.restPoints;
    for (const p of list) { const q = picks[p.id]; p.pick = q ? q.pick : -1; p.pickMs = q ? u32(q.ms) : 0; }
    let dice = null;
    if (cfg.type === 4) {
      const draw = list.map(p => p);
      for (let i = draw.length - 1; i > 0; i--) { const j = rng.random(i + 1); const t = draw[i]; draw[i] = draw[j]; draw[j] = t; }
      draw.forEach((p, i) => {
        p.pick = i < 254 ? i : 254;
        p.roundPoints = i < RANKS ? P[i] : R;
        p.points += p.roundPoints;
        p.totalMs = u32(p.totalMs + i + 1);
      });
    } else {
      const firstId = new Array(COLORS).fill(0), firstMs = new Array(COLORS).fill(0xFFFFFFFF);
      if (cfg.type === 1) {
        dice = [rng.random(COLORS), rng.random(COLORS), rng.random(COLORS)];
        for (const p of list) if (p.pick >= 0 && p.pick < COLORS && p.pickMs < firstMs[p.pick]) { firstMs[p.pick] = p.pickMs; firstId[p.pick] = p.id; }
      }
      for (const p of list) {
        let n = 0;
        if (p.pick >= 0) {
          if (cfg.type === 1) {
            for (const d of dice) if (d === p.pick) n += DIE_POINTS;
            if (n > 0 && p.id === firstId[p.pick]) n += FIRST_BONUS;
          } else if (cfg.type === 2 || cfg.type === 5 || cfg.type === 6) n = p.pick < RANKS ? P[p.pick] : R;
          p.totalMs = u32(p.totalMs + p.pickMs);
        } else p.totalMs = u32(p.totalMs + cfg.roundTime * 1000);
        p.roundPoints = n;
        p.points += n;
      }
      if (cfg.type === 3 && truth !== undefined && truth !== null) {
        const want = truth ? 0 : 1;
        const right = list.filter(p => p.pick === want).sort((a, b) => a.pickMs - b.pickMs || a.id - b.id);
        right.forEach((p, i) => { p.roundPoints = i < RANKS ? P[i] : R; p.points += p.roundPoints; });
      }
    }
    const rank = ranking(list);
    rank.forEach((p, i) => { p.move = p.place > 0 ? p.place - (i + 1) : 0; p.place = i + 1; });
    return { dice, rank };
  }

  const ranking = list => [...list].sort((a, b) => (b.points - a.points) || (a.totalMs - b.totalMs) || (a.id - b.id));

  // GiveItem's stacks: [n, n, ...] (nothing for no item / amount 0)
  function stacks(item, amount) {
    if (!item || amount <= 0) return [];
    const pm = item.packMax;
    const stack = pm > 0 && pm < 0x7fff ? pm : 0x7fff;
    const out = [];
    for (let n = amount; n > 0; n -= Math.min(n, stack)) out.push(Math.min(n, stack));
    return out;
  }

  // e: the event (ranks / rest rows); itemOf(id) -> { packMax } or null
  function finish(cfg, e, list, itemOf) {
    return ranking(list).map((p, i) => {
      const top = i < RANKS && p.points > 0;              // 0 points = REST prize, never a top-10 prize by tie-break
      const row = top ? e.ranks[i] : e.rest;
      const id = row ? row.id : null, amount = row ? row.amount.value : 0;
      const item = id === null ? null : itemOf(id);
      return { id: p.id, name: p.name, place: i + 1, points: p.points, time: cfg.type === 4 ? p.totalMs : Math.floor(p.totalMs / 1000),
        prize: item ? id : null, stacks: stacks(item, amount), top };
    });
  }

  // a whole event. spec: { type, e (the event: values, pointValues, restPoints, ranks, rest), players: [{ id, name }],
  //   rounds: [{ picks: { id: { pick, ms } }, truth }], seed }; itemOf(id) -> { packMax } | null
  function run(spec, itemOf) {
    const e = spec.e;
    const cfg = { type: spec.type, pointValues: e.pointValues, restPoints: e.restPoints, roundTime: e.values.ROUND_TIME };
    const list = newPlayers(spec.players), rng = FRE.xRandom.rng(spec.seed || 1);
    const rounds = spec.rounds.map(r => {
      const x = endRound(cfg, list, r.picks || {}, r.truth, rng);
      return { dice: x.dice, rows: x.rank.map(p => [p.id, p.roundPoints, p.points, p.place, p.move]) };
    });
    return { rounds, final: finish(cfg, e, list, itemOf) };
  }

  // made-up players + picks for "Try it" in the editor (the seed makes it repeatable)
  function sample(type, e, nPlayers, seed) {
    const rnd = FRE.xRandom.rng(seed), players = [], rounds = [];
    for (let i = 0; i < nPlayers; i++) players.push({ id: 1000 + i, name: `Player ${i + 1}` });
    const T = e.values.ROUND_TIME * 1000;
    for (let r = 0; r < e.values.ROUNDS; r++) {
      const picks = {}, truth = rnd.random(2) === 0;
      const order = players.map(p => p.id);
      for (let i = order.length - 1; i > 0; i--) { const j = rnd.random(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      order.forEach((id, k) => {
        if (rnd.random(10) === 0) return;                 // 1 in 10 does nothing this round
        const ms = 300 + rnd.random(Math.max(1, T - 300));
        if (type === 1) picks[id] = { pick: rnd.random(COLORS), ms };
        else if (type === 3) picks[id] = { pick: rnd.random(2), ms };
        else if (type === 6) { if (k === 0) picks[id] = { pick: 0, ms }; }        // one finder
        else if (type === 2 || type === 5) picks[id] = { pick: k, ms };
      });
      rounds.push({ picks, truth });
    }
    return { type, e, players, rounds, seed };
  }

  FRE.miniEventSim = { endRound, ranking, finish, stacks, run, sample, newPlayers, DIE_POINTS, FIRST_BONUS, COLORS };
})(globalThis.FRE = globalThis.FRE || {});
