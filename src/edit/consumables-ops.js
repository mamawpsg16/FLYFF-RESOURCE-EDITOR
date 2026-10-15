// Consumable Stats edits (task L): one stat slot of an item's Spec_Item.txt row = two tokens, dwDestParamN (written as its
// DST_ name, the 62fb3b3e style) and nAdjParamValN ("=" in both for an empty slot), and the buff time dwSkillTime (ms, one
// token). Same splice way as edit/weapons-ops.js; Spec_Item.txt is CRLF on the server and LF in Client/ (the core client sync
// writes the same change there). Nothing else in the row moves.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;

  // v: { dstName, adj } or null (empty the slot)
  function setSlot(text, c, i, v, defines) {
    T.checkAmount(i, 1, FRE.consumables.SLOTS, 'The slot');
    if (c.hard) throw new Error(`${c.name} is hard-coded: it has no stats in the file`);
    const empty = !v;
    if (!empty) {
      if (!/^DST_[A-Z0-9_]+$/.test(v.dstName || '')) throw new Error('Pick a stat');
      if (!Number.isInteger(v.adj) || v.adj < -2147483647 || v.adj > 2147483647) throw new Error('The amount must be a whole number');
    }
    const d = FRE.itemOps.fieldSpan(text, c.item, 'dwDestParam' + i, defines), a = FRE.itemOps.fieldSpan(text, c.item, 'nAdjParamVal' + i, defines);
    const di = empty ? '=' : v.dstName, ai = empty ? '=' : String(v.adj);
    const out = [];
    if (text.slice(d.start, d.end) !== di) out.push({ start: d.start, end: d.end, insert: di });
    if (text.slice(a.start, a.end) !== ai) out.push({ start: a.start, end: a.end, insert: ai });
    return out;
  }

  // ms: whole milliseconds 0 .. 2147483647, or 999999999 (permanent: CBuffItem::IsRemovable, Buff.cpp:358)
  function setTime(text, c, ms, defines) {
    if (c.hard) throw new Error(`${c.name} is hard-coded: its time is not in this field`);
    T.checkAmount(ms, 0, 2147483647, 'The time (ms)');
    const f = FRE.itemOps.fieldSpan(text, c.item, 'dwSkillTime', defines), ins = String(ms);
    return text.slice(f.start, f.end) === ins ? [] : [{ start: f.start, end: f.end, insert: ins }];
  }

  // a charged-item mode's time: dwCircleTime in SECONDS (SetSMMode( mode, dwCircleTime ), MoverSkill.cpp:2377-2610)
  function setCircle(text, c, sec, defines) {
    if (!c.hard) throw new Error(`${c.name} has no charged-item time`);
    T.checkAmount(sec, 1, 2147483647, 'The time (s)');
    const f = FRE.itemOps.fieldSpan(text, c.item, 'dwCircleTime', defines), ins = String(sec);
    return text.slice(f.start, f.end) === ins ? [] : [{ start: f.start, end: f.end, insert: ins }];
  }

  // "Provides STA +20 for 1 hour." from the slots and the time (the house style of coupleOps.describe)
  const WORD = { DST_ATKPOWER_RATE: 'Attack', DST_ATKPOWER: 'Attack', DST_HP_MAX_RATE: 'Max HP', DST_HP_MAX: 'Max HP', DST_MP_MAX: 'Max MP',
    DST_MP_MAX_RATE: 'Max MP', DST_FP_MAX: 'Max FP', DST_FP_MAX_RATE: 'Max FP', DST_STAT_ALLUP: 'All Stats', DST_ADJDEF: 'Defense', DST_SPEED: 'Speed',
    DST_MONSTER_DMG: 'PvE Damage', DST_EXPERIENCE: 'EXP', DST_STR: 'STR', DST_STA: 'STA', DST_DEX: 'DEX', DST_INT: 'INT' };
  function timeWords(ms) {
    ms = ms >>> 0;
    if (ms === 999999999) return ' permanently';
    if ((ms | 0) <= 0) return '';
    const s = ms / 1000, one = (n, w) => `${+n.toFixed(2)} ${w}${n === 1 ? '' : 's'}`;
    if (s >= 86400 && s % 86400 === 0) return ` for ${one(s / 86400, 'day')}`;
    if (s >= 3600 && s % 3600 === 0) return ` for ${one(s / 3600, 'hour')}`;
    if (s >= 60) return ` for ${one(s / 60, 'minute')}`;
    return ` for ${one(s, 'second')}`;
  }
  function describe(c, words) {
    const list = c.slots.filter(s => s.on && s.dst).map(s => {
      const w = words.get(s.dst) || { word: '', define: '' };
      const name = WORD[w.define] || (w.word || '').replace(/[:\s]+$/, '').replace(/^Increased\s+/i, '') || w.define || `stat ${s.dst}`;
      return `${name} ${s.adj >= 0 ? '+' : ''}${s.adj}${w.rate ? '%' : ''}`;
    });
    return list.length ? `Provides ${list.join(', ')}${c.path === 'food' ? '' : timeWords(c.time)}.` : '';
  }

  FRE.consumablesOps = { setSlot, setTime, setCircle, describe };
})(globalThis.FRE = globalThis.FRE || {});
