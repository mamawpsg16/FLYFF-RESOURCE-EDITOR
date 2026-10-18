// Bot Check simulator: what the AntiBot.inc words and tuning do to a player (WORLDSERVER/AntiBotMng.cpp, V19 78f3239f + d816e99f).
//   kill      OnKill (:183): nothing while no word list, outside a counted zone, while a puzzle is open; a pending re-check (after
//             being sent to town) opens it at once; inside the cooldown nothing; camping = the same world and within CAMP_RADIUS
//             (x, y and z, D3DXVec3LengthSq in float) of the anchor, else the anchor moves here; +2 when the anchor is CAMP_MINUTES
//             old, else +1; score >= SCORE_LIMIT opens it, else a 1 in RANDOM_CHANCE roll (xRandom) may.
//   icons     NewIcons (:223): a nonce = xRand() (not 0), 6 different lines by a partial shuffle (i + xRandom( n - i )), the asked
//             one = xRandom( 6 ).
//   answer    OnAnswer (:340): a right click: solved, score 0, the cooldown starts; a wrong one: -1 click; no clicks left while
//             asking = frozen (FROZEN_SECONDS, the clicks again, new icons); else new icons. No clicks left while frozen: wait.
//   tick      Process (:375) once a second for an online player with a puzzle: the seconds left -1; 0 while asking = frozen,
//             0 while frozen = SendToTown (score 0, the next counted kill asks again).
//   zone      IsCountedZone (:76): GM accounts (SKIP_GM), safe regions, NO_CHECK_WORLD maps, the event / PvP / guild maps, secret
//             rooms, guild houses, party dungeons never count (the caller says which of those the player is in).
// Not modelled: offline players (their timers wait), the 10 s resend, the logs, the town position.
(function (FRE) {
  'use strict';
  const A = () => FRE.antiBot;
  const f32 = Math.fround;
  const NONE = 0, ASKING = 1, FROZEN = 2;

  function newEntry() {
    return { state: NONE, score: 0, anchor: null, anchorWorld: null, tAnchor: 0, cooldown: 0, recheck: false,
      secLeft: 0, tries: 0, wrong: 0, nonce: 0, items: [], correct: -1, word: '', puzzles: 0, solved: 0, frozen: 0, town: 0 };
  }
  function newIcons(m, e, rng) {
    do e.nonce = rng.rand(); while (e.nonce === 0);
    const n = m.lines.length, idx = [...Array(n).keys()];
    if (n < A().CHOICES) return;
    for (let i = 0; i < A().CHOICES; i++) { const j = i + rng.random(n - i); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; e.items[i] = m.lines[idx[i]].id; }
    e.items.length = A().CHOICES;
    e.correct = rng.random(A().CHOICES);
    e.word = m.lines[idx[e.correct]].word.text;
  }
  function start(m, e, rng, reason, log) {
    const T = k => A().value(m, k);
    e.recheck = false; e.state = ASKING; e.secLeft = T('ANSWER_SECONDS'); e.tries = T('CLICKS'); e.wrong = 0; e.puzzles++;
    newIcons(m, e, rng);
    log.push({ ev: 'open', reason, word: e.word, items: e.items.slice(), correct: e.correct });
  }
  // a counted-zone kill at t (seconds) and pos { world, x, y, z }; zone = IsCountedZone's answer for that spot
  function kill(m, e, rng, t, pos, zone, log) {
    if (!m.ok || !zone) return;
    if (e.state !== NONE) return;
    if (e.recheck) { start(m, e, rng, 'recheck', log); return; }
    if (t < e.cooldown) return;
    const T = k => A().value(m, k);
    let far = e.anchorWorld !== pos.world;
    if (!far) {
      const dx = f32(pos.x - e.anchor.x), dy = f32(pos.y - e.anchor.y), dz = f32(pos.z - e.anchor.z);
      const r = f32(T('CAMP_RADIUS'));
      far = f32(f32(f32(dx * dx) + f32(dy * dy)) + f32(dz * dz)) > f32(r * r);
    }
    if (far) { e.anchorWorld = pos.world; e.anchor = { x: f32(pos.x), y: f32(pos.y), z: f32(pos.z) }; e.tAnchor = t; }
    e.score += (t - e.tAnchor >= T('CAMP_MINUTES') * 60) ? 2 : 1;
    if (e.score >= T('SCORE_LIMIT')) start(m, e, rng, 'score', log);
    else if (T('RANDOM_CHANCE') > 0 && rng.random(T('RANDOM_CHANCE')) === 0) start(m, e, rng, 'random', log);
  }
  function freeze(m, e, rng, log, detail) {
    const T = k => A().value(m, k);
    e.state = FROZEN; e.secLeft = T('FROZEN_SECONDS'); e.tries = T('CLICKS'); e.frozen++;
    newIcons(m, e, rng);
    log.push({ ev: 'frozen', detail, word: e.word, items: e.items.slice(), correct: e.correct });
  }
  function end(e) { e.state = NONE; e.secLeft = 0; e.tries = 0; e.nonce = 0; }
  // a click on icon `index` (0-5) at t
  function answer(m, e, rng, t, index, log, nonce = e.nonce) {
    if (e.state === NONE || nonce !== e.nonce || index < 0 || index >= A().CHOICES) return;
    if (e.tries <= 0) return;
    if (index === e.correct) {
      e.solved++; end(e); e.score = 0; e.cooldown = t + A().value(m, 'COOLDOWN_MINUTES') * 60;
      log.push({ ev: 'solved' });
      return;
    }
    e.wrong++; e.tries--;
    log.push({ ev: 'wrong', tries: e.tries });
    if (e.tries <= 0 && e.state === ASKING) { freeze(m, e, rng, log, 1); return; }
    if (e.tries > 0) { newIcons(m, e, rng); log.push({ ev: 'icons', word: e.word, items: e.items.slice(), correct: e.correct }); }
  }
  // one second of Process for an online player
  function tick(m, e, rng, log) {
    if (e.state === NONE) return;
    if (--e.secLeft <= 0) {
      if (e.state === ASKING) freeze(m, e, rng, log, 0);
      else { e.town++; end(e); e.score = 0; e.recheck = true; log.push({ ev: 'town' }); }
    }
  }

  // a made-up hour (or more): kills every `every` seconds, standing still (camping) or moving `step` metres (and `climb` up) a kill; the player
  // answers after `delay` seconds: 'right', 'wrong' (always the next icon), 'none'. -> { log: [{ t, ev, ... }], entry }
  function session(m, o) {
    const rng = FRE.xRandom.rng(o.seed || 1), e = newEntry(), log = [];
    const at = t => x => { x.t = t; return x; };
    let pending = null;
    for (let t = 0; t <= o.seconds; t++) {
      const before = log.length;
      if (e.state !== NONE && pending !== null && t >= pending) {
        const idx = o.answer === 'right' ? e.correct : o.answer === 'wrong' ? (e.correct + 1) % A().CHOICES : -1;
        if (idx >= 0) answer(m, e, rng, t, idx, log);
        pending = e.state !== NONE ? t + o.delay : null;
      }
      if (t > 0) tick(m, e, rng, log);
      if (t % o.every === 0) {
        const k = t / o.every;
        kill(m, e, rng, t, { world: 1, x: 6900 + (o.step || 0) * k, y: 100 + (o.climb || 0) * k, z: 3300 }, o.zone !== false, log);
      }
      for (let i = before; i < log.length; i++) at(t)(log[i]);
      if (e.state !== NONE && pending === null) pending = t + o.delay;
    }
    return { log, entry: e };
  }

  FRE.antiBotSim = { newEntry, newIcons, kill, answer, tick, session, NONE, ASKING, FROZEN };
})(globalThis.FRE = globalThis.FRE || {});
