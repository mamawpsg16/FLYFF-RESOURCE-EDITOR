// Mini Events, Vagrant Race: the monsters of the race map, World/WdRace/WdRace.rgn (V19 ce1659f6: a copy of Volcane made by
// Tools/minievent/build_race_map.py). UTF-16LE, CRLF; Server + identical Client copy; the WorldServer reads it when it loads the
// world at start (CWorld::LoadRegion -> ReadRespawn, _Common/WorldFile.cpp:554).
//   parse     each "respawn7" line: type, mover, x y z, count (m_nMaxcb), time (m_uTime), aggressive (m_nMaxAttackNum),
//             the spawn box left top right bottom, then day / hour / item min-max, AI state, angle, patrol, cycle, control (0)
//   spawns    ReadRespawn's monster part (WorldFile.cpp:599-640, #ifdef __WORLDSERVER): a RANK_MATERIAL monster is never spawned,
//             a RANK_GUARD one only while EVE_PK is on (skipped here: the PK event is off on this server); the respawn time is
//             cut to (u_short)( time x 0.7 ) (x 0.5 for Aibatt / Mushpang / Burudeng 1-3), not for RANK_BOSS; a flying monster
//             keeps the line's height
// Not modelled: where in the box each monster appears (random), the respawn timing itself, the AI.
(function (FRE) {
  'use strict';
  const RANK = { BOSS: 4, MATERIAL: 6, GUARD: 8 };
  const HALF = ['MI_AIBATT1', 'MI_AIBATT2', 'MI_AIBATT3', 'MI_MUSHPANG1', 'MI_MUSHPANG2', 'MI_MUSHPANG3', 'MI_BURUDENG1', 'MI_BURUDENG2', 'MI_BURUDENG3'];
  const KEY = 'world/wdrace/wdrace.rgn';

  // -> { lines: [{ start, end, toks: [{ text, start, end }], type, mover, x, y, z, count, time, attack, rect }], eol }
  function parse(file) {
    const text = file ? file.text : '', out = [];
    const re = /[^\r\n]*(\r?\n|$)/g;
    for (let m; (m = re.exec(text)) && m[0].length;) {
      const line = m[0].replace(/\r?\n$/, ''), at = m.index;
      const toks = [];
      for (const t of line.matchAll(/\S+/g)) toks.push({ text: t[0], start: at + t.index, end: at + t.index + t[0].length });
      if (!toks.length || toks[0].text !== 'respawn7' || toks.length < 14) continue;
      const n = i => parseInt(toks[i].text, 10), f = i => Math.fround(parseFloat(toks[i].text));
      out.push({ start: at, end: at + line.length, toks, type: n(1), mover: n(2), x: f(3), y: f(4), z: f(5), count: n(6), time: n(7), attack: n(8),
        rect: [n(9), n(10), n(11), n(12)] });
    }
    return { lines: out, eol: /\r\n/.test(text) ? '\r\n' : '\n' };
  }

  // what the WorldServer spawns from each line: { line, mover, name, level, rank, count, attack, seconds, skipped }
  function spawns(rgn, movers, defines) {
    const half = new Set(HALF.map(k => defines.get(k)).filter(v => v !== undefined));
    return rgn.lines.map((l, i) => {
      const mv = l.type === 5 ? movers.get(l.mover) : null;
      let skipped = null, seconds = l.time;
      if (l.type === 5 && mv) {
        if (mv.rankId === RANK.GUARD) skipped = 'a guard: only while the PK event is on';
        else if (mv.rankId === RANK.MATERIAL) skipped = 'a material monster: never spawned';
        if (mv.rankId !== RANK.BOSS) seconds = Math.trunc((l.time & 0xFFFF) * (half.has(l.mover) ? 0.5 : 0.7)) & 0xFFFF;   // u_short x double
      } else if (l.type === 5) skipped = 'unknown monster';
      return { line: i, mover: l.mover, name: mv ? mv.name : `#${l.mover}`, level: mv ? mv.level : 0, rank: mv ? mv.rankId : 0, count: l.count, attack: l.attack, seconds, skipped };
    });
  }

  // ---- edits (the file is UTF-16LE text: the editor splices characters, SourceFile writes it back byte-exact)
  function checkCount(count, attack) {
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('How many: 1 to 50');
    if (!Number.isInteger(attack) || attack < 0 || attack > count) throw new Error(`Aggressive: 0 to ${count} (how many of them attack on sight)`);
  }
  function setCount(rgn, i, count, attack) {
    checkCount(count, attack);
    const l = rgn.lines[i], out = [];
    if (l.toks[6].text !== String(count)) out.push({ start: l.toks[6].start, end: l.toks[6].end, insert: String(count) });
    if (l.toks[8].text !== String(attack)) out.push({ start: l.toks[8].start, end: l.toks[8].end, insert: String(attack) });
    return out;
  }
  // the whole line and its line break
  function removeLine(text, rgn, i) {
    const l = rgn.lines[i];
    let end = l.end;
    if (text.startsWith('\r\n', end)) end += 2; else if (text[end] === '\n') end += 1;
    return [{ start: l.start, end, insert: '' }];
  }
  // a new spawn after the last respawn7 line, in its style: the same tail (day / hour / item, AI, angle, patrol, cycle, control)
  // s = { mover, x, y, z, count, attack, time, radius }
  function checkNew(s, movers) {
    if (!movers.get(s.mover)) throw new Error('Pick a monster');
    for (const k of ['x', 'z']) if (typeof s[k] !== 'number' || !(s[k] > 0) || s[k] > 99999) throw new Error(`${k}: a number above 0`);
    if (typeof s.y !== 'number' || !Number.isFinite(s.y)) throw new Error('y: a number');
    checkCount(s.count, s.attack);
    if (!Number.isInteger(s.time) || s.time < 1 || s.time > 32767) throw new Error('Respawn time: 1 to 32,767 seconds');
    if (!Number.isInteger(s.radius) || s.radius < 1 || s.radius > 200) throw new Error('Spawn area: 1 to 200 m around the spot');
  }
  const f6 = v => v.toFixed(6);
  function newLine(rgn, s) {
    const last = rgn.lines[rgn.lines.length - 1];
    const tail = last ? last.toks.slice(13).map(t => t.text).join(' ') : '1 30 1 24 1 1 2 0.000000 -1 0 0';
    const r = [Math.round(s.x - s.radius), Math.round(s.z - s.radius), Math.round(s.x + s.radius), Math.round(s.z + s.radius)];
    return `respawn7 5 ${s.mover} ${f6(s.x)} ${f6(s.y)} ${f6(s.z)} ${s.count} ${s.time} ${s.attack} ${r.join(' ')} ${tail} `;
  }
  function addLine(text, rgn, s, movers) {
    checkNew(s, movers);
    const last = rgn.lines[rgn.lines.length - 1];
    if (!last) throw new Error('WdRace.rgn has no respawn7 line to put it after');
    let at = last.end;
    if (text.startsWith('\r\n', at)) at += 2; else if (text[at] === '\n') at += 1;
    else return [{ start: at, end: at, insert: rgn.eol + newLine(rgn, s) }];
    return [{ start: at, end: at, insert: newLine(rgn, s) + rgn.eol }];
  }

  FRE.raceMap = { KEY, parse, spawns, checkCount, setCount, removeLine, checkNew, newLine, addLine, RANK };
})(globalThis.FRE = globalThis.FRE || {});
