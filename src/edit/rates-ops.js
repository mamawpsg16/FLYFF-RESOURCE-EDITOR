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

  const serverRow = t => `${t.tier}  ${t.online}   ${t.pct}   "${t.name}" "${t.icon}"`;
  const guildRow = t => `${t.tier} ${t.glv} ${t.online}  ${t.bonus.map(b => `${b.dst} ${b.adj}`).join('  ')}  "${t.name}" "${t.desc}" "${t.icon}"`;
  function checkTier(t, guild) {
    int(t.tier, 1, 2147483647, 'The tier'); int(t.online, 0, 100000, 'Players online');
    if (guild) {
      int(t.glv, 0, 1000, 'The guild level');
      if (t.bonus.length !== 5) throw new Error('A guild tier has 5 stat slots');
      for (const b of t.bonus) { int(b.dst, 0, 65535, 'A stat'); int(b.adj, -2147483647, 2147483647, 'A stat amount'); }
      checkText(t.desc, 'description', R().DESC_MAX);
    } else int(t.pct, 0, 100000, 'The EXP %');
    checkText(t.name, 'name', R().NAME_MAX); checkText(t.icon, 'icon file name', R().ICON_MAX);
    if (!t.icon) throw new Error('Pick an icon');
  }
  function addTier(text, b, t, guild) {
    checkTier(t, guild);
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

  FRE.ratesOps = { setFactor, setTime, setWeatherTitle, setNumber, setString, addTier, removeTier, setBonus, describe, luaNumber, checkDate, checkTier, serverRow, guildRow, MAX_FACTOR };
})(globalThis.FRE = globalThis.FRE || {});
