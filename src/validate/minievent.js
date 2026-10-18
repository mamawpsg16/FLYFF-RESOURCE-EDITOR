// Mini Events checks. loaders/minievent.js reads MiniEvent.inc the way CMiniEventMng::ReadConfig does: every error it finds
// switches ALL Mini Events off (BLOCK); the rest are the editor's own warnings.
(function (FRE) {
  'use strict';
  function miniEventChecks(model) {
    const out = [], F = FRE.miniEvent.FILE, T = FRE.miniEvent.TYPES;
    const push = (span, code, severity, message, k) => out.push({ module: 'minievent', file: F, code, severity, start: span.start, end: span.end, key: `${code}|${k}`, message });
    for (const er of model.errors) push(er, 'ME_CONFIG', 'BLOCK', `${er.message}: the WorldServer switches every Mini Event off until this is fixed.`, er.message);
    for (let i = 1; i < T.length; i++) {
      const e = model.events[i];
      const seen = new Map();
      for (const r of e.rankLines) {
        const k = r.rank.value;
        if (seen.has(k)) push(seen.get(k), 'ME_DUP_PRIZE', 'WARN', `${e.name}: place ${k} has two RANK lines; the last one is used.`, `${e.key}|${k}`);
        seen.set(k, r);
      }
      if (e.restLines.length > 1) push(e.restLines[0], 'ME_DUP_PRIZE', 'WARN', `${e.name}: two REST lines; the last one is used.`, `${e.key}|rest`);
    }
    // two questions with the same text share one "asked" entry and can both come up in one run
    for (const t of [2, 3]) {
      const e = model.events[t], seen = new Map();
      for (const a of e.asks) {
        const k = a.question.text;
        if (seen.has(k)) push(a, 'ME_ASK_DUP', 'WARN', `${e.name}: "${k.length > 60 ? k.slice(0, 57) + '...' : k}" is in the list twice.`, `${e.key}|${k}`);
        else seen.set(k, a);
      }
    }
    const randomBegins = model.begins.filter(b => b.type === 0);
    const inRandom = model.events.filter(e => e && e.loaded && e.values.IN_RANDOM);
    if (randomBegins.length && !inRandom.length) push(randomBegins[0], 'ME_NO_RANDOM', 'WARN', 'Every event is off for RANDOM start times (IN_RANDOM 0): those start times start nothing, and nothing is logged.', 'random');
    return out;
  }
  FRE.miniEventChecks = miniEventChecks;
})(globalThis.FRE = globalThis.FRE || {});
