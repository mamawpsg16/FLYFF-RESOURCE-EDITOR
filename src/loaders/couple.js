// couple.inc with the offsets the edits need (task I part 3). The reader follows CCoupleProperty::Initialize
// (_Common/couple.cpp:234-340) token for token; loaded by the WorldServer, the DatabaseServer and the game
// (couplehelper.cpp in each). __MAINSERVER is defined (VersionCommon.h), so the Level numbers are not divided by 100.
//   Level       one total per level: m_vExp[i] = the points a couple needs for level i + 1 (LoadLevel :255)
//   Item        level { item sex flag minutes count … } (LoadItem :271), mailed by CCoupleHelper::PostItem
//               (databaseserver/couplehelper.cpp:213-258)
//   SkillKind   the first buff item of each kind (LoadSkillKind :306)
//   SkillLevel  level tier tier tier: item = kind + tier - 1, 0 = none; a level without a row copies the row above
//               (LoadSkillLevel :317-339)
//   GetLevel    the first i with points < m_vExp[i]; past the last row: 1 (:342)
// In game (WORLDSERVER/User.cpp): ProcessCouple runs every 16 frames (m_nCount & 15, :452), a frame is 67 ms
// (ThreadMng.cpp:329), and every 61st call (:3997) the partner with the higher player id sends +1 point while both
// are online. So 1 point = 61 * 16 * 67 ms = about 65.4 s together. The buffs are removed on every point
// (WORLDSERVER/couplehelper.cpp:277, 286) and put back at the current level by ActiveCoupleBuff (:4025).
(function (FRE) {
  'use strict';
  const MAX_LEVEL = 21;                         // CCouple::eMaxLevel, couple.h:17
  const POINT_MS = 61 * 16 * 67;                // 65,392 ms
  const SEX = { 0: 'male', 1: 'female', 2: 'both' };   // SEX_MALE / SEX_FEMALE / SEX_SEXLESS (couple.inc's own header)

  const span = r => ({ start: r.start, end: r.end, value: r.value, define: r.define || null });

  function load(file, defines) {
    if (!file) return null;
    const res = { file: file.name, exp: [], level: null, items: null, blocks: [], kinds: [], kindBlock: null, skill: null, skillRows: [], bad: [] };
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    const close = () => (s.token.text[0] === '}' ? { start: s.token.start, end: s.token.end } : null);
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'Level') {
        const open = s.getToken();
        let n = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { res.exp.push(span(n)); n = s.getNumber(); }
        res.level = { open: { start: open.start, end: open.end }, close: close() };
      } else if (t === 'Item') {
        const open = s.getToken();
        let lv = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) {
          const bo = s.getToken();
          const block = { level: lv.value, levelSpan: span(lv), open: { start: bo.start, end: bo.end }, close: null, rows: [] };
          let it = s.getNumber();
          while (s.token.text[0] !== '}' && !s.eof) {
            const sx = s.getNumber(), fl = s.getNumber(), mi = s.getNumber(), nu = s.getNumber();
            block.rows.push({ id: it.value >>> 0, define: it.define || String(it.value >>> 0), sex: sx.value, flag: fl.value, minutes: mi.value, num: nu.value,
              start: it.start, end: nu.end, spans: { item: span(it), sex: span(sx), flag: span(fl), minutes: span(mi), num: span(nu) } });
            it = s.getNumber();
          }
          block.close = close();
          // GetItems( nLevel ) = m_vItems[nLevel - 1] (ASSERT only): outside the Level rows the server writes out of bounds
          if (lv.value < 1 || lv.value > res.exp.length) res.bad.push(block);
          res.blocks.push(block);
          lv = s.getNumber();
        }
        res.items = { open: { start: open.start, end: open.end }, close: close() };
      } else if (t === 'SkillKind') {
        const open = s.getToken();
        let n = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { res.kinds.push(span(n)); n = s.getNumber(); }
        res.kindBlock = { open: { start: open.start, end: open.end }, close: close() };
      } else if (t === 'SkillLevel') {
        const open = s.getToken();
        let lv = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) {
          const tiers = [];
          for (let i = 0; i < res.kinds.length; i++) tiers.push(span(s.getNumber()));
          res.skillRows.push({ level: lv.value, levelSpan: span(lv), tiers, start: lv.start, end: tiers.length ? tiers[tiers.length - 1].end : lv.end });
          lv = s.getNumber();
        }
        res.skill = { open: { start: open.start, end: open.end }, close: close() };
      }
      s.getToken();
    }
    res.perLevel = buffsPerLevel(res);
    return res;
  }

  // m_vSkills per level (1-based index): the tier of each kind; a level without a row copies the one above.
  // A row for a level outside the Level rows writes out of bounds in the server: skipped here, CP_SKILL_LEVEL says so.
  function buffsPerLevel(c) {
    const n = c.exp.length, out = Array.from({ length: n + 1 }, () => null), own = Array.from({ length: n + 1 }, () => null);
    for (const r of c.skillRows) {
      if (r.level < 1 || r.level > n) continue;
      if (!own[r.level]) own[r.level] = [];
      own[r.level].push(...r.tiers.map(t => t.value));      // push_back: a second row for a level adds more buffs
    }
    for (let l = 1; l <= n; l++) out[l] = own[l] ? own[l] : (l > 1 && out[l - 1] ? out[l - 1].slice() : []);
    return { tiers: out, own: own.map(Boolean) };
  }
  // the buff items at a level: kind + tier - 1 (LoadSkillLevel :329-330)
  function buffItems(c, level) {
    const t = c.perLevel.tiers[level] || [];
    return t.map((tier, i) => (tier > 0 && c.kinds[i % c.kinds.length] ? (c.kinds[i % c.kinds.length].value >>> 0) + tier - 1 : 0));
  }
  // CCoupleProperty::GetLevel (:342)
  function levelOf(c, points) {
    for (let i = 0; i < c.exp.length; i++) if (points < c.exp[i].value) return i;
    return 1;
  }
  // the tiers a kind has: kind, kind + 1, … while the item exists and is a couple buff (IK3_COUPLE_BUFF), up to the next kind
  function kindTiers(c, items, ik3) {
    const firsts = c.kinds.map(k => k.value >>> 0);
    return c.kinds.map((k, i) => {
      const out = [];
      for (let id = k.value >>> 0; ; id++) {
        if (id !== (k.value >>> 0) && firsts.includes(id)) break;
        const it = items.get(id);
        if (!it || FRE.specItem.get(it, 'dwItemKind3') !== ik3) break;
        out.push(it);
        if (out.length > 50) break;
      }
      return out;
    });
  }

  FRE.couple = { load, buffsPerLevel, buffItems, levelOf, kindTiers, MAX_LEVEL, POINT_MS, SEX };
})(globalThis.FRE = globalThis.FRE || {});
