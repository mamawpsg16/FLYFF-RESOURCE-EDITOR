// Rates & Buffs edits as minimal splices (ASCII only).
//   Event.lua (CRLF, EUC-KR comments): a factor is the first argument of its Set… call; a missing one is added as a new line
//   after the event's last call (copying its indent and line ending), e.g. `SetPieceItemDropRate( 2 )`, the style of the
//   "Server Rates" block (4f268007 added SetWeatherEvent the same way). Dates are the SetTime strings ("2007-12-31 00:00").
//   ServerBuff.txt / GuildBuff.txt (LF): a value is one token; a new tier is a row after the last one, a removed tier its whole line.
//   GuildBuff.txt stats are written as numbers (the loader uses atoi, GuildBuff.cpp:33).
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const R = () => FRE.rates;
  const MAX_FACTOR = 100000;

  // a Lua number as the file gets it: plain digits, at most 4 decimals
  function luaNumber(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_FACTOR) throw new Error(`A rate must be a number above 0 and at most ${FRE.num.group(MAX_FACTOR)}`);
    const s = String(Math.round(v * 10000) / 10000);
    if (/e/i.test(s) || s === '0') throw new Error('A rate needs at most 4 decimals');
    return s;
  }
  function checkText(s, what, max) {
    if (typeof s !== 'string') throw new Error(`The ${what} is missing`);
    if (/["\r\n]/.test(s)) throw new Error(`The ${what} cannot hold a " or a line break`);
    if (/[^\x20-\x7e]/.test(s)) throw new Error(`The ${what} must be plain ASCII text`);
    if (max && s.length > max) throw new Error(`The ${what} can be at most ${max} characters (the game cuts the rest)`);
  }

  // ---------------------------------------------------------------- Event.lua
  function setFactor(text, ev, kind, value) {
    const k = R().KINDS[kind];
    if (!k) throw new Error(`unknown rate ${kind}`);
    const v = luaNumber(value);
    const cur = ev.f[kind];
    if (cur) return T.replaceSpan(cur.arg, v);
    const row = kind === 'weather' ? `${k.fn}( ${v}, "Weather bonus: EXP x${v}!" )\t-- only while it rains/snows` : `${k.fn}( ${v} )`;
    // a new line under the event's last call (a Lua "--" comment may follow it on its line)
    const at = T.lineEnd(text, ev.last.end);
    let eol = T.eolAt(text, ev.last.end), prefix = '';
    if (!eol) { eol = T.dominantEol(text); prefix = eol; }
    return [{ start: at, end: at, insert: prefix + T.indentOf(text, ev.last.start) + row + (prefix ? '' : eol) }];
  }
  // "YYYY-MM-DD HH:MM"
  function checkDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(s));
    if (!m) throw new Error('A date is written as YYYY-MM-DD HH:MM, e.g. 2026-10-09 18:00');
    const [, , mo, d, hh, mm] = m.map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) throw new Error(`${s} is not a real date and time`);
  }
  function setTime(text, win, which, s) {
    checkDate(s);
    const arg = which === 'start' ? win.aArg : win.bArg;
    if (!arg) throw new Error('This SetTime line has no such date');
    const next = which === 'start' ? R().timeNumber(s) : win.a, end = which === 'end' ? R().timeNumber(s) : win.b;
    if (end <= next) throw new Error('The end must come after the start');
    return T.replaceSpan(arg, `"${s}"`);
  }
  function setWeatherTitle(text, ev, title) {
    checkText(title, 'weather message');
    if (!ev.weatherTitle) throw new Error('This event has no weather line yet');
    return T.replaceSpan(ev.weatherTitle, `"${title}"`);
  }

  // ---------------------------------------------------------------- ServerBuff.txt / GuildBuff.txt
  const int = (v, min, max, what) => { T.checkAmount(v, min, max, what); return String(v); };
  function setNumber(span, v, min, max, what) { return T.replaceSpan(span, int(v, min, max, what)); }
  function setString(span, s, what, max) { checkText(s, what, max); return T.replaceSpan(span, `"${s}"`); }

  // the row style of the files (buff-stats.diff converted them the same way: the pairs after the numbers, two spaces apart)
  const pairs = bonus => bonus.map(b => `${b.dst} ${b.adj}`).join('  ');
  const serverRow = t => (t.bonus && t.bonus.length ? `${t.tier}  ${t.online}   ${t.pct}  ${pairs(t.bonus)}   "${t.name}" "${t.icon}"` : `${t.tier}  ${t.online}   ${t.pct}   "${t.name}" "${t.icon}"`);
  const guildRow = t => `${t.tier} ${t.glv} ${t.online}  ${pairs(t.bonus)}  "${t.name}" "${t.desc}" "${t.icon}"`;
  // slots: the file's layout (FRE.rates.detectSlots): Guild Buff 5 / 8, Server Buff 0 / 5
  function checkTier(t, guild, slots = guild ? 5 : 0) {
    int(t.tier, 1, 2147483647, 'The tier'); int(t.online, 0, 100000, 'Players online');
    const bonus = t.bonus || [];
    if (bonus.length !== slots) throw new Error(`A ${guild ? 'guild' : 'server'} tier in this file has ${slots} stat slots`);
    for (const b of bonus) { int(b.dst, 0, 65535, 'A stat'); int(b.adj, -2147483647, 2147483647, 'A stat amount'); }
    if (guild) {
      int(t.glv, 0, 1000, 'The guild level');
      checkText(t.desc, 'description', R().DESC_MAX);
    } else int(t.pct, 0, 100000, 'The EXP %');
    checkText(t.name, 'name', R().NAME_MAX); checkText(t.icon, 'icon file name', R().ICON_MAX);
    if (!t.icon) throw new Error('Pick an icon');
  }
  function addTier(text, b, t, guild) {
    checkTier(t, guild, b ? b.slots : undefined);
    if (!b || !b.open) throw new Error('The file has no tier block');
    const row = guild ? guildRow(t) : serverRow(t);
    const last = b.tiers[b.tiers.length - 1];
    if (last) return T.insertRowAfter(text, last, row);
    return T.insertRowBelowLine(text, b.open.start, row);
  }
  function removeTier(text, t) { return T.removeRow(text, t); }
  function setBonus(slot, dst, adj) {
    return [...setNumber(slot.dst, dst, 0, 65535, 'The stat'), ...setNumber(slot.adj, dst ? adj : 0, -2147483647, 2147483647, 'The amount')];
  }

  // "All Stat +10, Atk +3%, HP +3%, EXP +10%" (the style of GuildBuff.txt's own descriptions, ca02d0cb)
  const SHORT = { DST_STAT_ALLUP: 'All Stat', DST_ATKPOWER_RATE: 'Atk', DST_HP_MAX_RATE: 'HP', DST_EXPERIENCE: 'EXP', DST_MONSTER_DMG: 'PvE Dmg',
    DST_STR: 'STR', DST_STA: 'STA', DST_DEX: 'DEX', DST_INT: 'INT', DST_PENYA_RATE: 'Penya' };
  function describe(bonus, words) {
    return bonus.filter(b => b.dst).map(b => {
      const w = words.get(b.dst) || { word: `stat ${b.dst}` };
      const name = SHORT[w.define] || w.word.replace(/[:\s]+$/, '') || `stat ${b.dst}`;
      return `${name} ${b.adj >= 0 ? '+' : ''}${b.adj}${w.rate ? '%' : ''}`;
    }).join(', ');
  }

  // ---------------------------------------------------------------- level-up gifts (part 2): SetLevelUpGift rows in Event.lua
  //   `\tSetLevelUpGift( 60,  "all", "II_…", 3, 2, 0 )`: the style of the "Level Up Rewards" block (a021ff44): the level and its
  //   comma padded to 5 characters, then "all", the item, count, flag (2 = bound), minutes (always written, 0 = permanent).
  const MAX_GIFT_LEVEL = 1000, MAX_GIFT_NUM = 32767, MAX_MINUTES = 35791394;     // nLifeMinutes * 60 must stay an int (EventLua.cpp:545)
  function checkGift(g) {
    T.checkAmount(g.level, 1, MAX_GIFT_LEVEL, 'The level');
    T.checkDefine(g.define);
    T.checkAmount(g.num, 1, MAX_GIFT_NUM, 'The count');
    if (g.flag !== 0 && g.flag !== 2) throw new Error('A gift is bound (2) or not (0)');
    T.checkAmount(g.minutes, 0, MAX_MINUTES, 'The time limit (minutes)');
  }
  const giftRow = g => `SetLevelUpGift( ${(g.level + ',').padEnd(5)}"all", "${g.define}", ${g.num}, ${g.flag}, ${g.minutes} )`;
  // the end of a Lua line: only spaces or a -- comment may follow the call
  const luaRestFree = (text, end) => /^[ \t]*(--.*)?$/.test(text.slice(end, T.lineEnd(text, end)).replace(/\r?\n$|\r$/, ''));
  function luaLineAfter(text, stmt, row) {
    const at = T.lineEnd(text, stmt.end);
    let eol = T.eolAt(text, stmt.end), prefix = '';
    if (!eol) { eol = T.dominantEol(text); prefix = eol; }
    return [{ start: at, end: at, insert: prefix + T.indentOf(text, stmt.start) + row + (prefix ? '' : eol) }];
  }
  // change one row: each argument in place; a missing flag / minutes is added after the last one
  function setGift(text, g, v) {
    const n = { level: g.level, define: g.define, num: g.num, flag: g.flag, minutes: g.minutes, ...v };
    checkGift(n);
    const a = g.args, out = [];
    if (!a[2] || !a[3]) throw new Error('This SetLevelUpGift line has no item or count');
    if (v.level !== undefined) out.push(...T.replaceSpan(a[0], n.level));
    if (v.define !== undefined) out.push(...T.replaceSpan(a[2], `"${n.define}"`));
    if (v.num !== undefined) out.push(...T.replaceSpan(a[3], n.num));
    let tail = '';
    if (a[4]) { if (v.flag !== undefined) out.push(...T.replaceSpan(a[4], n.flag)); } else if (v.flag !== undefined || v.minutes !== undefined) tail += `, ${n.flag}`;
    if (a[5]) { if (v.minutes !== undefined) out.push(...T.replaceSpan(a[5], n.minutes)); } else if (v.minutes !== undefined) tail += `, ${n.minutes}`;
    if (tail) { const last = a[4] || a[3]; out.push({ start: last.end, end: last.end, insert: tail }); }
    return out;
  }
  function setGiftAll(text, g) {
    if (!g.args[1]) throw new Error('This SetLevelUpGift line has no account part');
    return T.replaceSpan(g.args[1], '"all"');
  }
  // a new row in level order: after the last row of this event with a level <= the new one, else above the first row,
  // else under the event's last call
  function addGift(text, ev, g) {
    checkGift(g);
    const row = giftRow(g), rows = ev.gifts;
    const before = rows.filter(x => x.level <= g.level).pop();
    if (before) return luaLineAfter(text, before.stmt, row);
    if (rows.length) {
      const s = T.lineStart(text, rows[0].stmt.start);
      return [{ start: s, end: s, insert: T.indentOf(text, rows[0].stmt.start) + row + (T.eolAt(text, rows[0].stmt.start) || T.dominantEol(text)) }];
    }
    return luaLineAfter(text, ev.last, row);
  }
  function removeGift(text, g) {
    const s = T.lineStart(text, g.stmt.start);
    if (text.slice(s, g.stmt.start).trim() || !luaRestFree(text, g.stmt.end)) return [{ start: g.stmt.start, end: g.stmt.end, insert: '' }];
    return [{ start: s, end: T.lineEnd(text, g.stmt.end), insert: '' }];
  }

  // ---------------------------------------------------------------- 1Rebirth.inc (part 2)
  //   Rates rows: `1.00\t1.0\t\t1.0\t\t10\t//1`; EXP × written with 2 decimals (the file's own style), bonus points as a whole number.
  //   Gifts rows: `20\tII_…\t\t1\t//comment` (3fb37a62), kept in tier order.
  const MAX_REB_EXP = 100, MAX_GP = 1000000;
  function rebExp(v) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_REB_EXP) throw new Error(`EXP × must be above 0 and at most ${MAX_REB_EXP}`);
    if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) throw new Error('EXP × takes at most 2 decimals (e.g. 1.25)');
    return (Math.round(v * 100) / 100).toFixed(2);
  }
  function setRebirthExp(row, v) { return T.replaceSpan(row.expSpan, rebExp(v)); }
  function setRebirthGp(row, n) { T.checkAmount(n, 0, MAX_GP, 'The bonus points'); return T.replaceSpan(row.gpSpan, n); }
  function checkRebGift(rb, g) {
    T.checkAmount(g.tier, 1, rb.max, 'The rebirth');
    T.checkDefine(g.define);
    T.checkAmount(g.num, 1, 65535, 'The count');
  }
  const rebGiftRow = g => `${g.tier}\t${g.define}\t\t${g.num}`;
  function setRebirthGift(rb, row, v) {
    const n = { tier: row.tier, define: row.itemText, num: row.num, ...v };
    checkRebGift(rb, n);
    const out = [];
    if (v.define !== undefined) out.push(...T.replaceSpan(row.itemSpan, n.define));
    if (v.num !== undefined) out.push(...T.replaceSpan(row.numSpan, n.num));
    return out;
  }
  function addRebirthGift(text, rb, g) {
    checkRebGift(rb, g);
    if (!rb.giftsOpen) throw new Error('1Rebirth.inc has no Gifts { } block');
    if (rb.rows.some(r => r.tier === g.tier)) throw new Error(`Rebirth ${g.tier} has a gift already (one item per tier)`);
    const row = rebGiftRow(g);
    const before = rb.rows.filter(r => r.tier < g.tier).pop();
    if (before) return T.insertRowAfter(text, before, row);
    if (rb.rows.length) {
      const f = rb.rows[0], s = T.lineStart(text, f.start);
      return [{ start: s, end: s, insert: T.indentOf(text, f.start) + row + (T.eolAt(text, f.start) || T.dominantEol(text)) }];
    }
    return T.insertRowBelowLine(text, rb.giftsOpen.start, row);
  }
  function removeRebirthGift(text, row) { return T.removeRow(text, row); }

  FRE.ratesOps = { setGift, setGiftAll, addGift, removeGift, giftRow, checkGift, setRebirthExp, setRebirthGp, setRebirthGift, addRebirthGift,
    removeRebirthGift, rebExp, rebGiftRow, MAX_GIFT_NUM, MAX_MINUTES, setFactor, setTime, setWeatherTitle, setNumber, setString, addTier, removeTier, setBonus, describe, luaNumber, checkDate, checkTier, serverRow, guildRow, MAX_FACTOR };
})(globalThis.FRE = globalThis.FRE || {});
