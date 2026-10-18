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
    // Turn-in Race: the same recipe twice (title + items = one "asked" entry); a recipe item with no "where to get it" line;
    // an item with two ITEM_HINT lines (the server keeps the last one, ReadConfig :337)
    {
      const e = model.events[5], seen = new Map(), hinted = new Map();
      for (const r of e.recipes) {
        const k = `${r.title.text}|${r.items.map(x => x.id).join(' ')}`;
        if (seen.has(k)) push(r, 'ME_RECIPE_DUP', 'WARN', `Turn-in Race: the recipe "${r.title.text}" is in the list twice.`, k);
        else seen.set(k, r);
      }
      for (const h of model.hints) {
        if (hinted.has(h.id)) push(hinted.get(h.id), 'ME_HINT_DUP', 'WARN', `Item ${h.item.define || h.id} has two ITEM_HINT lines: the server shows the last one ("${h.text.text}").`, `${h.id}`);
        hinted.set(h.id, h);
      }
      const told = new Set();
      for (const r of e.recipes) for (const x of r.items) if (!hinted.has(x.id) && !told.has(x.id)) {
        told.add(x.id);
        push(x.item, 'ME_HINT_MISSING', 'INFO', `Turn-in Race: ${x.item.define || x.id} has no "where to get it" line (ITEM_HINT): players see no hint under it.`, `${x.id}`);
      }
    }
    // Hide and Seek: two spots at the same whole-number x / z share one "asked" entry (AskKey "HIDESEEK|x z", GetAskText %.0f)
    {
      const seen = new Map(), r0 = v => (v < 0 ? -Math.round(-v) : Math.round(v));
      for (const sp of model.events[6].spots) {
        const k = `${r0(sp.x.value)} ${r0(sp.z.value)}`;
        if (seen.has(k)) push(sp, 'ME_SPOT_DUP', 'WARN', `Hide and Seek: two spots at ${k}: they share one "last used" entry, so both can come up in one event.`, k);
        else seen.set(k, sp);
      }
    }
    const randomBegins = model.begins.filter(b => b.type === 0);
    const inRandom = model.events.filter(e => e && e.loaded && e.values.IN_RANDOM);
    if (randomBegins.length && !inRandom.length) push(randomBegins[0], 'ME_NO_RANDOM', 'WARN', 'Every event is off for RANDOM start times (IN_RANDOM 0): those start times start nothing, and nothing is logged.', 'random');
    return out;
  }
  FRE.miniEventChecks = miniEventChecks;
})(globalThis.FRE = globalThis.FRE || {});
