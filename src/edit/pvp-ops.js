// PvP Events edits (task "PvP Events") as minimal splices: only the number tokens change; comments, spacing and line ends stay.
// A new line copies the anchor line's indent, separators and EOL. Limits = what the server accepts (loaders/pvp.js), so an edit never
// switches an event off. plan(): the data edit + the rules boards that follow it (loaders/pvp-rules.js), ONE undo step.
//   FFAManager.inc / TDMManager.inc (ASCII, CRLF), GuildCombat.txt (CP949 comments, CRLF: ASCII inserts only),
//   GuildSiegePrize.lua (LF in git, CRLF on the Windows disk: the file's own EOL is kept).
(function (FRE) {
  'use strict';
  const T = FRE.textOps, P = () => FRE.pvp;
  const INT_MAX = 2147483647;
  const p2 = n => String(n).padStart(2, '0');
  // field -> [min, max, label]; max of members: up to 100 (and not under the minimum: checked in setScalar)
  const LIMITS = {
    cost: [0, INT_MAX, 'The entry fee (Penya)'], cancelCut: [0, 100, 'The cancel cut (%)'], level: [1, INT_MAX, 'The minimum level'],
    min: [2, 100, 'The players needed'], max: [2, 100, 'The most players'], lives: [1, INT_MAX, 'The lives'],
    announce: [1, 60, 'The registration time (minutes)'], respawn: [0, 60, 'The respawn wait (seconds)'],
    prepare: [0, 30, 'The time to Join (minutes)'], war: [1, 120, 'The battle length (minutes)'],
  };
  const keyOf = (mm, field) => `${P().KINDS[mm.kind].P}_${P().SCALARS.find(x => x[2] === field)[0]}`;

  // ---------------------------------------------------------------- FFAManager.inc / TDMManager.inc
  function setScalar(mm, text, field, v) {
    const lim = LIMITS[field];
    if (!lim) throw new Error(`Unknown setting ${field}`);
    T.checkAmount(v, lim[0], lim[1], lim[2]);
    if (field === 'min' && mm.keys.max && v > mm.keys.max.value) throw new Error(`The players needed can not be more than the most players (${mm.keys.max.value})`);
    if (field === 'max' && v < (mm.keys.min ? mm.keys.min.value : 2)) throw new Error(`The most players can not be less than the players needed (${mm.keys.min ? mm.keys.min.value : 2})`);
    const k = mm.keys[field];
    if (k) return T.replaceSpan(k.span, v);
    // no line yet (an older file has no CANCEL_CUT): a new line under the last setting, or at the end
    const row = `${keyOf(mm, field)}\t\t\t${v}`;
    if (mm.lastScalar) return T.insertRowAfter(text, mm.lastScalar, row);
    return appendLine(text, row);
  }
  function appendLine(text, row) {
    const eol = T.dominantEol(text);
    return [{ start: text.length, end: text.length, insert: (text.length && !/[\r\n]$/.test(text) ? eol : '') + row + eol }];
  }
  function setRewardAmount(mm, v) {
    if (!mm.reward) throw new Error(`${mm.file} has no ${P().KINDS[mm.kind].P}_REWARD line`);
    const max = mm.rewardItem ? mm.rewardItem.packMax : 0;
    T.checkAmount(v, 0, Math.max(0, max), `Tokens per kill (the item stacks to ${max})`);
    return T.replaceSpan(mm.reward.amount, v);
  }
  function setTop(mm, i, v) {
    if (!mm.top || !mm.top[i]) throw new Error('FFAManager.inc has no FFA_TOP_REWARD line');
    T.checkAmount(v, 0, 9999, `The prize for place ${i + 1}`);
    return T.replaceSpan(mm.top[i], v);
  }
  function setTeamPrize(mm, which, v) {
    const k = mm[which];
    if (!k) throw new Error(`TDMManager.inc has no TDM_${which === 'team' ? 'TEAM' : 'MVP'}_REWARD line`);
    T.checkAmount(v, 0, 9999, which === 'team' ? 'The winning team prize' : 'The MVP prize');
    return T.replaceSpan(k.span, v);
  }
  function checkTime(t, minDay, maxDay) {
    T.checkAmount(t.day, minDay, maxDay, 'The day');
    T.checkAmount(t.hour, 0, 23, 'The hour');
    T.checkAmount(t.minute, 0, 59, 'The minute');
  }
  // day / hour / minute spans -> splices for the numbers that change (minutes written with 2 digits: "05")
  function timeSplices(nums, t) {
    return [String(t.day), String(t.hour), p2(t.minute)].map((x, k) => ({ start: nums[k].start, end: nums[k].end, insert: x }))
      .filter((s, k) => Number(s.insert) !== nums[k].value || s.insert.length !== nums[k].end - nums[k].start);
  }
  function setBegin(mm, i, t) {
    const b = mm.begins[i];
    if (!b) throw new Error('There is no such start time');
    checkTime(t, 0, 7);
    return timeSplices(b.nums, t);
  }
  function addBegin(mm, text, t) {
    checkTime(t, 0, 7);
    const key = `${P().KINDS[mm.kind].P}_BEGIN`;
    const last = mm.begins[mm.begins.length - 1];
    if (!last) return appendLine(text, `${key}\t${t.day}\t${t.hour}\t${p2(t.minute)}`);
    const sep = [text.slice(last.key.end, last.nums[0].start), text.slice(last.nums[0].end, last.nums[1].start), text.slice(last.nums[1].end, last.nums[2].start)]
      .map(s => (/^[ \t]+$/.test(s) ? s : '\t'));
    return T.insertRowAfter(text, last.stmt, `${key}${sep[0]}${t.day}${sep[1]}${t.hour}${sep[2]}${p2(t.minute)}`);
  }
  function removeBegin(mm, text, i) {
    const b = mm.begins[i];
    if (!b) throw new Error('There is no such start time');
    return T.removeRow(text, b.stmt);
  }

  // ---------------------------------------------------------------- GuildCombat.txt
  function setBid(gc, v) {
    if (!gc.joinPenya) throw new Error('GuildCombat.txt has no JOINPENYA line');
    T.checkAmount(v, 0, INT_MAX, 'The minimum bid (Penya)');
    return T.replaceSpan(gc.joinPenya.span, v);
  }
  function checkSiegeRow(gc, t, skip) {
    checkTime(t, 1, 7);
    const other = gc.autoOpen.find((r, k) => k !== skip && r.day === t.day);
    if (other) throw new Error(`There is already a siege on ${FRE.pvpSim.DAYS[t.day]}: the server keeps one time per weekday (the later row would replace it)`);
  }
  function setSiegeRow(gc, i, t) {
    if (!gc.ok) throw new Error('GuildCombat.txt does not load: fix it first');
    const r = gc.autoOpen[i];
    if (!r) throw new Error('There is no such siege time');
    checkSiegeRow(gc, t, i);
    return timeSplices(r.nums, t);
  }
  function addSiegeRow(gc, text, t) {
    if (!gc.ok) throw new Error('GuildCombat.txt does not load: fix it first');
    if (!gc.block) throw new Error('GuildCombat.txt has no AUTO_OPEN_IDC { … } block');
    if (gc.autoOpen.length >= 7) throw new Error('The server allows 7 siege times (one per weekday)');
    checkSiegeRow(gc, t, -1);
    const last = gc.autoOpen[gc.autoOpen.length - 1];
    if (!last) return T.insertRowBelowLine(text, gc.block.open.start, `${t.day}\t${t.hour}\t${p2(t.minute)}`);
    const sep = [text.slice(last.nums[0].end, last.nums[1].start), text.slice(last.nums[1].end, last.nums[2].start)].map(s => (/^[ \t]+$/.test(s) ? s : '\t'));
    return T.insertRowAfter(text, last.stmt, `${t.day}${sep[0]}${t.hour}${sep[1]}${p2(t.minute)}`);
  }
  function removeSiegeRow(gc, text, i) {
    if (!gc.ok) throw new Error('GuildCombat.txt does not load: fix it first');
    const r = gc.autoOpen[i];
    if (!r) throw new Error('There is no such siege time');
    return T.removeRow(text, r.stmt);
  }

  // ---------------------------------------------------------------- GuildSiegePrize.lua
  // name: 'TokensPerKill' or a list name; i: the place (0-based, lists only)
  function setPrize(pz, text, name, i, v) {
    if (pz.missing) throw new Error('There is no GuildSiegePrize.lua');
    if (pz.failed) throw new Error('GuildSiegePrize.lua does not run (see the problems): fix it first');
    if (name === 'TokensPerKill') {
      T.checkAmount(v, 0, 32767, 'PVP Tokens per kill');
      const n = pz.number.TokensPerKill;
      if (n) return T.replaceSpan(n.span, v);
      return appendLine(text, `TokensPerKill = ${v}`);
    }
    const def = P().PRIZE_LISTS.find(x => x[0] === name);
    if (!def) throw new Error(`Unknown prize list ${name}`);
    if (!Number.isInteger(i) || i < 0 || i >= def[1]) throw new Error(`${name} has places 1-${def[1]}`);
    T.checkAmount(v, 1, 32767, `${name} place ${i + 1} (PVP Tokens)`);
    const L = pz.lists[name];
    if (L && !L.notList && L.items[i]) return T.replaceSpan(L.items[i], v);
    const vals = pz.prizes[name].slice();
    vals[i] = v;
    const body = `{ ${vals.join(', ')} }`;
    if (L && !L.notList) return [{ start: L.open.start, end: L.close.end, insert: body }];
    if (L && L.notList) return [{ start: L.stmt.start, end: L.stmt.end, insert: `${name} = ${body}` }];
    return appendLine(text, `${name} = ${body}`);
  }

  // ---------------------------------------------------------------- one edit + the rules boards, one undo step
  // ws: the workspace (models.pvp), lower: the data file, splices: its edit -> { parts: [{ file, splices }], changed, notes }
  function plan(ws, lower, splices) {
    const model = ws.models.pvp, f = ws.files.get(lower);
    const text = FRE.SourceFile.spliceText(f.text, splices, f.kind, f.name);
    const scratch = { name: f.name, text };
    const ctx = { defines: ws.defines.defines, items: ws.items.items };
    const next = Object.assign({}, model);
    if (lower === 'ffamanager.inc') next.ffa = P().readManager(scratch, 'ffa', ctx);
    else if (lower === 'tdmmanager.inc') next.tdm = P().readManager(scratch, 'tdm', ctx);
    else if (lower === 'guildcombat.txt') { next.gs = P().readGuildCombat(scratch); next.timeline = P().siegeTimeline(next.gs); }
    else if (lower === 'guildsiegeprize.lua') next.prizes = P().readPrizes(scratch);
    const fol = FRE.pvpRules.follow(model, next, ws.files, l => ws.isEditable(l));
    return { parts: [{ file: lower, splices }, ...fol.parts], changed: fol.changed, notes: fol.notes, next };
  }

  FRE.pvpOps = { LIMITS, setScalar, setRewardAmount, setTop, setTeamPrize, setBegin, addBegin, removeBegin, setBid, setSiegeRow, addSiegeRow,
    removeSiegeRow, setPrize, plan };
})(globalThis.FRE = globalThis.FRE || {});
