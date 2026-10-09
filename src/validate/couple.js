// couple.inc checks (task I part 3). Each one cites the C++ it comes from (loaders/couple.js has the reader).
(function (FRE) {
  'use strict';
  const F = 'couple.inc';

  function coupleChecks(model, opts, out) {
    const c = model.couple, ws = opts.ws;
    if (!c || !ws) return;
    const C = FRE.couple, MAX = C.MAX_LEVEL;
    const push = (code, severity, sp, message, k) => out.push({ module: 'rates', file: F, code, severity, start: sp ? sp.start : 0, end: sp ? sp.end : 0, key: `${code}|${k}`, message });
    const D = ws.defines.defines, items = ws.items.items;
    // ---- Level: GetLevel (couple.cpp:342) needs rows 1-22 rising: a couple at level 21 sits at row 21's total, below row 22
    const e = c.exp;
    if (!e.length) push('CP_EXP_ROWS', 'BLOCK', c.level && c.level.open, 'couple.inc has no Level rows: every couple is level 1 and the server reads out of bounds.', 'none');
    else {
      if (e[0].value !== 0) push('CP_EXP_FIRST', 'BLOCK', e[0], `Level 1 needs ${e[0].value} points: a new couple has 0, so GetLevel gives level 0 and the buff lookup reads before the table (crash risk). Write 0.`, 'first');
      if (e.length < MAX + 1) push('CP_EXP_ROWS', 'BLOCK', c.level.open, `Level has ${e.length} rows. Level ${MAX} needs a row ${MAX + 1} above row ${MAX}: past the last row GetLevel returns 1, so a couple ${e.length <= MAX ? `that passes row ${e.length}` : `at level ${MAX}`} falls back to level 1.`, 'few');
      for (let i = 1; i < Math.min(e.length, MAX + 1); i++) if (e[i].value <= e[i - 1].value)
        push('CP_EXP_ORDER', 'BLOCK', e[i], i === MAX
          ? `Row ${MAX + 1} (${e[i].value}) must be above row ${MAX} (${e[i - 1].value}): it is where level ${MAX} ends. Otherwise a couple that reaches level ${MAX} falls back to level 1 (GetLevel returns 1 past the rows).`
          : `Level ${i + 1} needs ${e[i].value} points, not more than level ${i} (${e[i - 1].value}): GetLevel ${e[i].value === e[i - 1].value ? `skips level ${i}, and its gifts are never mailed` : 'jumps back and forth between levels'}.`, i);
      if (e.length > MAX + 1) push('CP_ROWS_UNUSED', 'INFO', e[MAX + 1], `Rows ${MAX + 2}-${e.length} are never used: couples stop at level ${MAX} (CCouple::eMaxLevel, compiled).`, 'unused');
    }
    // ---- SkillKind / SkillLevel (couple.cpp:306-339; ActiveCoupleBuff User.cpp:4025)
    const ik3 = D.get('IK3_COUPLE_BUFF');
    const tiers = C.kindTiers(c, items, ik3);
    c.kinds.forEach((k, i) => { if (!tiers[i].length) push('CP_KIND_ITEM', 'BLOCK', k, `Buff kind ${i + 1} (${k.define || k.value}) is not a couple buff item in Spec_Item.txt (IK3_COUPLE_BUFF): no buff of this kind works.`, i); });
    const seen = new Map();
    for (const r of c.skillRows) {
      if (r.level < 1 || r.level > e.length) { push('CP_SKILL_LEVEL', 'BLOCK', r.levelSpan, `SkillLevel row for level ${r.level}: there is no such Level row, so the server writes outside its table.`, `${r.level}|${r.start}`); continue; }
      if (r.level > MAX) push('CP_SKILL_LEVEL', 'INFO', r.levelSpan, `SkillLevel row for level ${r.level}: couples stop at level ${MAX}, so it is never used.`, `${r.level}|max`);
      if (seen.has(r.level)) push('CP_SKILL_DUP', 'WARN', r.levelSpan, `Level ${r.level} has two SkillLevel rows: both are applied (push_back), so the couple gets the buffs of both.`, r.level);
      seen.set(r.level, true);
      r.tiers.forEach((t, k) => {
        if (t.value < 0 || (tiers[k] && t.value > tiers[k].length)) push('CP_TIER_BAD', 'BLOCK', t,
          `Level ${r.level}: tier ${t.value} of ${kindName(ws, c, k)}, but it has ${tiers[k] ? tiers[k].length : 0} tier(s). Item ${c.kinds[k].define || c.kinds[k].value} + ${t.value - 1} is ${tierItemText(ws, c.kinds[k].value + t.value - 1)}.`, `${r.level}|${k}`);
      });
    }
    // ---- Item (couple.cpp:271; PostItem databaseserver/couplehelper.cpp:213-258)
    for (const b of c.blocks) {
      if (b.level < 1 || b.level > e.length) { push('CP_GIFT_LEVEL', 'BLOCK', b.levelSpan, `Gifts for couple level ${b.level}: there is no such Level row, so the server writes outside its table at startup.`, `${b.level}|${b.levelSpan.start}`); continue; }
      if (b.level === 1) push('CP_GIFT_LEVEL', 'WARN', b.levelSpan, 'Gifts for couple level 1 are never mailed: a couple starts at level 1, and gifts come with a level change.', '1');
      else if (b.level > MAX) push('CP_GIFT_LEVEL', 'WARN', b.levelSpan, `Gifts for couple level ${b.level} are never mailed: couples stop at level ${MAX}.`, `${b.level}|max`);
      for (const r of b.rows) {
        const it = items.get(r.id), k = `${b.level}|${r.define}|${r.start}`;
        if (!it) { push('CP_GIFT_ITEM', 'BLOCK', r.spans.item, `Couple level ${b.level}: "${r.define}" is not an item in Spec_Item.txt; the mail would carry an unknown item.`, k); continue; }
        if (![0, 1, 2].includes(r.sex)) push('CP_GIFT_SEX', 'WARN', r.spans.sex, `Couple level ${b.level}, ${r.define}: "who" is ${r.sex}; only 0 (male), 1 (female) or 2 (both) gets it to anyone.`, k);
        if (!(r.num >= 1)) push('CP_GIFT_COUNT', 'BLOCK', r.spans.num, `Couple level ${b.level}, ${r.define}: the count is ${r.num}. A gift needs at least 1.`, k);
        const pm = FRE.specItem.get(it, 'dwPackMax') >>> 0;
        if (pm && r.num > pm) push('CP_GIFT_STACK', 'WARN', r.spans.num, `Couple level ${b.level}: ${r.num} × ${r.define} in one mail, but one bag slot holds only ${pm}.`, k);
      }
    }
    // ---- the buff items: description vs stats
    const words = FRE.itemTooltip.dstWords(ws);
    tiers.forEach((list, k) => list.forEach((it, t) => {
      const auto = FRE.coupleOps.describe(statsOf(it), words);
      const desc = descOf(ws, it);
      if (auto && desc !== null && desc !== auto) push('CP_DESC', 'WARN', null, `${kindName(ws, c, k)} tier ${t + 1} (${it.define}): the description says "${desc}", but the stats give "${auto}".`, it.define);
    }));
  }
  function statsOf(it) {
    const out = [];
    for (let i = 1; i <= 6; i++) {
      const d = FRE.specItem.get(it, 'dwDestParam' + i), a = FRE.specItem.get(it, 'nAdjParamVal' + i);
      const dst = d === -1 || d === 0xFFFFFFFF || !d ? 0 : d >>> 0;
      out.push({ dst, adj: dst ? (a | 0) : 0 });
    }
    return out;
  }
  // the texts as the game shows them (the lexer already put the propItem.txt.txt line in place of the IDS key)
  const descOf = (ws, it) => { const v = FRE.specItem.get(it, 'szCommand'); return v === undefined || v === null ? null : String(v).trim(); };
  const nameOf = (ws, it) => it.name || it.define;
  // the IDS key a field holds (Spec_Item.txt's own token) and that key's line in propItem.txt.txt
  function keyOf(ws, it, field) {
    const f = ws.files.get('spec_item.txt');
    if (field === 'szName') return it.nameKey;
    const sp = FRE.itemOps.fieldSpan(f.text, it, field, ws.defines.defines);
    return f.text.slice(sp.start, sp.end);
  }
  const textLine = (ws, key) => (ws.strings.meta.get(key) || null);
  function kindName(ws, c, k) { const it = ws.items.items.get(c.kinds[k].value >>> 0); return it ? nameOf(ws, it) : `kind ${k + 1}`; }
  function tierItemText(ws, id) { const it = ws.items.items.get(id >>> 0); return it ? `${it.define} (${nameOf(ws, it)}), not a buff of this kind` : 'not an item'; }

  FRE.coupleChecks = coupleChecks;
  FRE.coupleChecks.statsOf = statsOf;
  FRE.coupleChecks.descOf = descOf;
  FRE.coupleChecks.nameOf = nameOf;
  FRE.coupleChecks.keyOf = keyOf;
  FRE.coupleChecks.textLine = textLine;
})(globalThis.FRE = globalThis.FRE || {});
