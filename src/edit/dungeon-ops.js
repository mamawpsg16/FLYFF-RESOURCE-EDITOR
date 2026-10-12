// PartyDungeon.lua edits as minimal splices (ASCII only; the file is LF in git, CRLF-safe: new lines copy the anchor's EOL).
//   A value that has its line: only the value is replaced (SetDungeonTime( MIN(30) ) -> SetDungeonTime( MIN(45) )).
//   A value without a line: a new "\tSetX( … )" line is written in the file's order (SetClass, SetLevel, SetCoolTime,
//   SetDungeonTime, SetKillAll) after the nearest line before it, else after the "--{" line under AddDungeon, else after AddDungeon.
//   Times are written as MIN(n) (whole minutes), 0 as 0 (no time limit / no cooldown).
// Only blocks whose line could be read are edited (DG_SYNTAX lines are left alone).
(function (FRE) {
  'use strict';
  const MAX_MIN = 35791;              // MIN(n) in ms must fit a DWORD: 35,791 minutes ≈ 24.8 days
  const MAX_LEVEL = 300;

  const lineStart = (t, i) => t.lastIndexOf('\n', i - 1) + 1;
  const lineEnd = (t, i) => { const j = t.indexOf('\n', i); return j < 0 ? t.length : j + 1; };
  const eolOf = (t, i) => { const e = lineEnd(t, i); return t.slice(e - 2, e) === '\r\n' ? '\r\n' : (t[e - 1] === '\n' ? '\n' : ''); };
  const indentOf = (t, i) => /^[ \t]*/.exec(t.slice(lineStart(t, i)))[0];

  const timeText = min => (min === 0 ? '0' : `MIN(${min})`);
  function checkMinutes(min, what) {
    if (!Number.isInteger(min) || min < 0 || min > MAX_MIN) throw new Error(`${what} must be whole minutes from 0 to ${FRE.num.group(MAX_MIN)}`);
  }

  // the line to write after: the nearest earlier statement of ORDER, else "--{", else AddDungeon
  function anchorFor(text, d, name) {
    const order = FRE.dungeon.ORDER;
    for (let i = order.indexOf(name) - 1; i >= 0; i--) if (d.stmts[order[i]]) return d.stmts[order[i]].start;
    const after = lineEnd(text, d.at.end);
    if (/^[ \t]*--\{/.test(text.slice(after, after + 20))) return after;
    return d.at.start;
  }
  function insertLine(text, d, name, args) {
    const at = anchorFor(text, d, name);
    const end = lineEnd(text, at);
    // indent: a Set* line of this block, else a tab
    const any = Object.values(d.stmts)[0] || d.monsters[0] && d.monsters[0].stmt;
    const indent = any ? indentOf(text, any.start) : '\t';
    let eol = eolOf(text, at), prefix = '';
    if (!eol) { eol = /\r\n/.test(text) ? '\r\n' : '\n'; prefix = eol; }
    return [{ start: end, end, insert: prefix + `${indent}${name}( ${args} )` + (prefix ? '' : eol) }];
  }
  function setArg(text, d, name, i, value, args) {
    const s = d.stmts[name];
    if (s && s.args[i]) return text.slice(s.args[i].start, s.args[i].end) === String(value) ? [] : [{ start: s.args[i].start, end: s.args[i].end, insert: String(value) }];
    if (s) throw new Error(`${name} in ${d.world} has no value ${i + 1}: fix the line by hand`);
    return insertLine(text, d, name, args);
  }

  // minutes: 0 = no limit
  function setTime(text, d, minutes) {
    checkMinutes(minutes, 'The time limit');
    return setArg(text, d, 'SetDungeonTime', 0, timeText(minutes), timeText(minutes));
  }
  function setCool(text, d, minutes) {
    checkMinutes(minutes, 'The cooldown');
    return setArg(text, d, 'SetCoolTime', 0, timeText(minutes), timeText(minutes));
  }
  function setLevels(text, d, lo, hi) {
    for (const [v, w] of [[lo, 'The lowest level'], [hi, 'The highest level']])
      if (!Number.isInteger(v) || v < 1 || v > MAX_LEVEL) throw new Error(`${w} must be a whole number from 1 to ${MAX_LEVEL}`);
    if (lo > hi) throw new Error(`The lowest level (${lo}) is above the highest (${hi}): nobody could enter`);
    const s = d.stmts.SetLevel;
    if (s && s.args.length >= 2) {
      const out = [];
      if (s.args[1].value !== hi) out.push({ start: s.args[1].start, end: s.args[1].end, insert: String(hi) });
      if (s.args[0].value !== lo) out.push({ start: s.args[0].start, end: s.args[0].end, insert: String(lo) });
      return out;
    }
    if (s) throw new Error(`SetLevel in ${d.world} does not have two values: fix the line by hand`);
    return insertLine(text, d, 'SetLevel', `${lo}, ${hi}`);
  }
  function setKillAll(text, d, on) {
    return setArg(text, d, 'SetKillAll', 0, on ? 1 : 0, on ? '1' : '0');
  }
  // classes: a subset of ['CLASS_NORMAL', 'CLASS_MASTER', 'CLASS_HERO', 'CLASS_LEGEND_HERO'], in that order
  function setClasses(text, d, names) {
    const all = ['CLASS_NORMAL', 'CLASS_MASTER', 'CLASS_HERO', 'CLASS_LEGEND_HERO'];
    const list = all.filter(n => names.includes(n));
    if (!list.length) throw new Error('Pick at least one class: with none, nobody can enter');
    const s = d.stmts.SetClass;
    const args = list.join(', ');
    if (s && s.args.length) return [{ start: s.args[0].start, end: s.args[s.args.length - 1].end, insert: args }];
    if (s) {                                    // SetClass( ) with no value: dwClass 0
      const open = text.indexOf('(', s.start);
      return [{ start: open + 1, end: s.end - 1, insert: ` ${args} ` }];
    }
    return insertLine(text, d, 'SetClass', args);
  }

  FRE.dungeonOps = { setTime, setCool, setLevels, setKillAll, setClasses, timeText, MAX_MIN, MAX_LEVEL };
})(globalThis.FRE = globalThis.FRE || {});
