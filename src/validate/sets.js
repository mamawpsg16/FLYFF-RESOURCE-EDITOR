// Set effect checks (task G part 1). Each one cites the C++ it comes from (loaders/sets.js has the reader,
// loaders/sets-sim.js what the server does with it).
(function (FRE) {
  'use strict';

  function setChecks(model, opts) {
    const out = [], ws = opts.ws, S = FRE.sets, items = ws.items.items, D = ws.defines.defines;
    const push = (file, code, severity, sp, message, k) => out.push({ module: 'sets', file, code, severity, start: sp ? sp.start : 0, end: sp ? sp.end : 0, key: `${code}|${k}`, message });
    const F = S.ETC, nm = s => `Set ${s.id} (${s.name})`;
    const env = FRE.setsSim.envFor(ws, model);
    // the lexer's own problems (an undefined II_ / PARTS_ / DST_ name becomes 0)
    for (const d of model.diags) out.push(Object.assign({ module: 'sets', file: F, key: `${d.code}|${d.name || ''}|${d.start}` }, d));
    if (model.hang) push(F, 'SE_HANG', 'BLOCK', model.hang, `${nm(model.hang.set)}: "${model.hang.word}" inside the set. LoadPiercingAvail only knows Elem and Avail here and loops forever: the server and the game hang at startup.`, model.hang.set.id);
    const seenId = new Map(), seenItem = new Map();
    for (const s of model.sets) {
      // CSetItem m_pszString[64] (Project.h:814) filled with lstrcpy (Project.cpp:4695)
      if (s.name.length >= S.MAX_NAME) push(F, 'SE_NAME_LONG', 'BLOCK', s.nameSpan, `${nm(s)}: the name has ${s.name.length} characters; the server keeps 63 (lstrcpy into a 64-byte field), a longer one writes over the set's pieces.`, s.id);
      if (!model.strings.map.has(s.nameKey) && /^IDS_/.test(s.nameKey)) push(F, 'SE_NAME_KEY', 'WARN', s.nameSpan, `Set ${s.id}: ${s.nameKey} is not in propItemEtc.txt.txt, so the tooltip shows the key itself as the name.`, s.id);
      // CSetItemFinder::AddSetItem (Project.cpp:4806): map insert, the first wins
      if (seenId.has(s.id)) push(F, 'SE_ID_DUP', 'WARN', s.idSpan, `${nm(s)}: set id ${s.id} is also used by ${seenId.get(s.id).name}. The bonuses still work (found by item), but the tooltip's piece list (GetEquipedSetItem looks up the id) checks the first set's pieces.`, s.id);
      else seenId.set(s.id, s);
      // AddSetItemElem (:4697): MAX_SETITEM_ELEM 8
      s.pieces.filter(p => !p.kept).forEach((p, i) => push(F, 'SE_PARTS_FULL', 'WARN', p, `${nm(s)}: piece ${S.MAX_ELEM + i + 1} (${p.define || p.id}) is dropped: a set holds ${S.MAX_ELEM} pieces (MAX_SETITEM_ELEM).`, `${s.id}|${i}`));
      s.rows.filter(r => !r.kept).forEach((r, i) => push(F, 'SE_ROWS_FULL', 'WARN', r, `${nm(s)}: bonus row ${S.MAX_AVAIL + i + 1} is dropped: a set holds ${S.MAX_AVAIL} bonus rows (MAX_ITEMAVAIL).`, `${s.id}|${i}`));
      if (!s.elems.length) push(F, 'SE_EMPTY', 'WARN', s.open, `${nm(s)} has no pieces: it never gives anything.`, s.id);
      for (const p of s.elems) {
        const it = items.get(p.id);
        if (!it) { push(F, 'SE_ITEM_UNKNOWN', 'BLOCK', p.spans.item, `${nm(s)}: "${p.define || p.id}" is not an item in Spec_Item.txt; this piece can never be worn.`, `${s.id}|${p.define || p.id}`); continue; }
        if (seenItem.has(p.id) && seenItem.get(p.id) !== s) push(F, 'SE_ITEM_TWO', 'WARN', p.spans.item, `${nm(s)}: ${it.name || p.define} is also in ${nm(seenItem.get(p.id))}. An item belongs to the first set it is in (CSetItemFinder), so it never counts for this one.`, `${s.id}|${p.id}`);
        else if (!seenItem.has(p.id)) seenItem.set(p.id, s);
        // GetEquipedSetItemNumber (Mover.cpp:9913) looks in the listed slot; the login count (:9871) looks in every slot
        const slots = FRE.setsSim.slotsOf(env, p.id);
        if (!slots.includes(p.part)) push(F, 'SE_PART_WRONG', 'WARN', p.spans.part, `${nm(s)}: ${it.name || p.define} is listed in slot ${p.partDefine || p.part}, but it is worn in ${slots.map(v => ws.defines.byValue('PARTS_', v) || v).join(' / ')}. Putting it on adds nothing for this piece; only after a relog does it count, so the bonus changes on relog.`, `${s.id}|${p.id}|${p.part}`);
      }
      // a row needing more pieces than the set has (or under 1) is never (or only after a relog) active
      for (const r of s.avail) {
        if (r.need > s.elems.length) push(F, 'SE_PIECES_RANGE', 'WARN', r.spans.need, `${nm(s)}: a bonus row needs ${r.need} pieces, but the set has ${s.elems.length}: it never turns on.`, `${s.id}|${r.start}`);
        else if (r.need < 1) push(F, 'SE_PIECES_RANGE', 'WARN', r.spans.need, `${nm(s)}: a bonus row needs ${r.need} pieces. Putting pieces on never adds it (that path wants exactly the worn count, at least 1); a relog does, so it appears only after relogging.`, `${s.id}|${r.start}`);
        if (r.unresolved || !r.dst) push(F, 'SE_DST_UNKNOWN', 'BLOCK', r.spans.dst, `${nm(s)}: the stat "${r.dstDefine || r.dst}" is not a known DST_ name: it becomes stat 0, which does nothing.`, `${s.id}|${r.start}`);
      }
    }
    // expTable.inc Setitem (Project.cpp:3829; m_aSetItemAvail[11], GetSetItemAvail :4535)
    const P = model.plus;
    if (model.hasExp) {
      const E = S.EXP;
      if (!P.found) push(E, 'SE_PLUS_MISSING', 'INFO', null, 'expTable.inc has no Setitem table: full +N armor gives no extra bonus.', 'none');
      else {
        if (P.shifted) push(E, 'SE_PLUS_SHIFT', 'BLOCK', P.open, 'A Setitem row has fewer than 5 numbers: the server reads on into the next row (and past the closing }), so every value after it is shifted.', 'shift');
        if (P.over) push(E, 'SE_PLUS_ROWS', 'BLOCK', P.rows[S.PLUS_SLOTS], `Setitem has ${P.rows.length} rows: the server keeps 11 (m_aSetItemAvail[11]); row 12 and later are written over other data.`, 'over');
        else if (P.rows.length !== S.PLUS_ROWS) push(E, 'SE_PLUS_ROWS', P.rows.length < S.PLUS_ROWS ? 'WARN' : 'INFO', P.open, P.rows.length < S.PLUS_ROWS
          ? `Setitem has ${P.rows.length} rows: +${P.rows.length + 1} to +10 armor gives nothing extra (the missing rows are 0).`
          : 'Setitem has 11 rows: the 11th is never used (only +1 to +10 give a bonus).', 'count');
      }
    }
    return out;
  }

  FRE.setChecks = setChecks;
})(globalThis.FRE = globalThis.FRE || {});
