// PvP Events checks (task "PvP Events"). Each one cites the C++ it comes from (loaders/pvp.js has the readers, loaders/pvp-sim.js
// the schedulers, loaders/pvp-rules.js the rules boards).
(function (FRE) {
  'use strict';
  const S = () => FRE.pvpSim;
  const t2 = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const LABEL = { ffa: 'FFA', tdm: 'TDM', gs: 'Guild Siege' };

  function pvpChecks(model, opts) {
    const out = [], ws = opts.ws;
    const push = (file, code, severity, sp, message, k) => out.push({ module: 'pvp', file, code, severity, start: sp ? sp.start : 0, end: sp ? sp.end : 0, key: `${code}|${k}`, message });
    // ---- FFAManager.inc / TDMManager.inc: ReadConfig (FFAManager.cpp:91, TDMManager.cpp:99)
    for (const k of ['ffa', 'tdm']) {
      const mm = model[k], K = FRE.pvp.KINDS[k];
      if (mm.missing) continue;
      if (mm.error) push(K.file, 'PVP_OFF', 'BLOCK', mm.errorAt, `${K.file}: ${mm.error}. The server writes "${K.label} switched off" in Server\\error_*.txt and no ${K.label} runs until the file is fixed (${K.reload} then, or a restart).`, `${k}|${mm.error}`);
      else if (!mm.cfg.times.length) push(K.file, 'PVP_NO_TIMES', 'WARN', null, `${K.file} has no ${K.P}_BEGIN line: the ${K.label} never starts on its own (only by the GM command /${k}start).`, k);
      if (mm.cfg) {
        const seen = new Set();
        mm.begins.filter(b => b.used).forEach(b => {
          const id = `${b.day}|${b.hour}|${b.minute}`;
          if (seen.has(id)) push(K.file, 'PVP_TIME_TWICE', 'INFO', b.stmt, `${K.P}_BEGIN ${b.day} ${b.hour} ${b.minute} is written twice: it is one run.`, `${k}|${id}`);
          seen.add(id);
        });
      }
    }
    // ---- GuildCombat.txt: CGuildCombat::LoadScript (eveschool.cpp:3658)
    const gc = model.gs;
    if (!gc.missing) {
      if (!gc.ok) push('GuildCombat.txt', 'PVP_GS_LOAD', 'BLOCK', gc.errorAt, `${gc.error}. CGuildCombat::LoadScript returns FALSE and the WorldServer stops starting ("[CRITICAL] Missing File ->GuildCombat.txt", ThreadMng.cpp:293).`, gc.error);
      else {
        const days = new Map();
        for (const r of gc.autoOpen) {
          if (days.has(r.day)) push('GuildCombat.txt', 'PVP_GS_DAY_TWICE', 'WARN', r.stmt, `Two siege times on ${S().DAYS[r.day]}: the server keeps one per weekday (__AutoOpen[day - 1]), so ${t2(days.get(r.day).hour, days.get(r.day).minute)} is replaced by ${t2(r.hour, r.minute)}.`, r.day);
          days.set(r.day, r);
          if (r.hour === 24) push('GuildCombat.txt', 'PVP_GS_HOUR24', 'WARN', r.nums[1], `${S().DAYS[r.day]} at hour 24: the loader accepts it, but the clock's hour is 0-23 (eveschool.cpp:3459), so this siege never opens.`, r.day);
        }
        if (!FRE.pvpRules.siegeRows(gc).length) push('GuildCombat.txt', 'PVP_GS_NONE', 'WARN', gc.block && gc.block.key, 'No siege time in AUTO_OPEN_IDC: the Guild Siege never opens on its own.', 'none');
        const sh = shownWrong(gc, model.timeline);
        if (sh) push('GuildCombat.txt', 'PVP_GS_SHOWN', 'WARN', gc.byDay[gc.lastDay - 1] && gc.byDay[gc.lastDay - 1].stmt,
          `The Guild Siege window shows the wrong next siege at times: it only knows the last row (${S().DAYS[gc.lastDay]}) and, on that day after the siege, adds ${gc.lastDay} days instead of 7 (GetNextGuildCobmatTime, eveschool.cpp:2415). E.g. ${S().dateText(sh.at)}: it shows ${S().dateText(sh.shown)}, the real next siege is ${S().dateText(sh.real)}.`, `${gc.lastDay}|${gc.autoOpen.length}`);
      }
    }
    // ---- one week on the clock: skipped starts, events overlapping
    for (const w of S().weekWindows(model)) {
      if (w.ev === 'gs') continue;
      const K = FRE.pvp.KINDS[w.ev];
      for (const t of w.skipped) {
        if (t < S().WEEK0 || t >= S().WEEK0 + 7 * S().DAY) continue;
        push(K.file, 'PVP_SKIPPED', 'WARN', null, `The ${K.label} of ${S().dayName(t)} ${S().hhmm(t)} never starts: the run of ${S().hhmm(w.start)} is still going then (from registration to everyone back in town: ${S().hhmm(w.from)} - ${S().hhmm(w.to)}).`, `${w.ev}|${S().dow(t)}|${S().hhmm(t)}`);
      }
    }
    for (const c of S().clashes(model)) {
      const d = w => `${LABEL[w.ev]} ${S().dayName(w.start)} ${S().hhmm(w.start)} (${S().hhmm(w.from)} - ${S().hhmm(w.to)})`;
      const fileOf = ev => (ev === 'gs' ? 'GuildCombat.txt' : FRE.pvp.KINDS[ev].file);
      push(fileOf(c.a.ev), 'PVP_TIME_CLASH', 'WARN', null, `${d(c.a)} and ${d(c.b)} overlap: a player can be in only one of them (Join is refused inside another PvP arena), and both ask for the same players.`,
        `${c.a.ev}|${S().dow(c.a.start)}|${S().hhmm(c.a.start)}|${c.b.ev}|${S().dow(c.b.start)}|${S().hhmm(c.b.start)}`);
    }
    // ---- GuildSiegePrize.lua: CGuildSiegePrize::ReadPrizes (6de6da39)
    const pz = model.prizes, LUA = 'GuildSiegePrize.lua';
    if (!pz.missing) {
      for (const e of pz.errors) push(LUA, 'PVP_PRIZE_LUA', 'BLOCK', e, `${e.message}. The script does not run: the WorldServer and the DatabaseServer use every compiled prize, and the DatabaseServer's weekly payout clock (CheckChangeTime, a function of this script) never fires.`, e.message);
      for (const b of pz.bad) push(LUA, 'PVP_PRIZE_BAD', 'WARN', b.span, b.index < 0 ? `${b.name} = ${b.raw} is not a list { … }: the compiled prizes are used (an Error line in the log).`
        : `${b.name}${b.name === 'TokensPerKill' ? '' : `[${b.index + 1}]`} = ${b.raw} is not a whole number ${b.min}-32767: the server keeps ${b.kept} (and writes an Error line).`, `${b.name}|${b.index}`);
      for (const [name, count] of FRE.pvp.PRIZE_LISTS) {
        const L = pz.lists[name];
        if (L && L.items && L.items.length > count) push(LUA, 'PVP_PRIZE_EXTRA', 'INFO', L.items[count], `${name} has ${L.items.length} numbers; the server reads the first ${count}.`, name);
      }
      if (model.patch === 'missing' && (pz.number.TokensPerKill || Object.keys(pz.lists).length))
        push(LUA, 'PVP_PATCH_MISSING', 'WARN', null, 'The game source in this folder has no CGuildSiegePrize::ReadPrizes (PvP events part B, 6de6da39): the servers ignore these prizes and pay the compiled numbers.', 'b');
    }
    // ---- the rules boards say what the data says (loaders/pvp-rules.js)
    if (ws) for (const r of FRE.pvpRules.check(model, ws.files)) {
      const name = ws.files.get(r.board).name;
      if (r.status === 'differs') push(name, 'PVP_RULES_DIFF', 'WARN', r.spans[0], `${name} says ${r.said.join(' / ')} for ${r.fact.label}; the data says ${r.want.join(' / ')}. Players read the board: change the value here, or edit the board.`, `${r.board}|${r.fact.id}`);
      else if (r.status === 'notFound') push(name, 'PVP_RULES_NOTFOUND', 'INFO', null, `${name}: the sentence with ${r.fact.label} was not found (its wording changed), so the editor can not keep it in step: check it by hand after a change.`, `${r.board}|${r.fact.id}`);
    }
    return out;
  }

  // one moment of a week where the siege window's "next siege" differs from the real one -> { at, shown, real } or null
  function shownWrong(gc, tl) {
    const rows = FRE.pvpRules.siegeRows(gc);
    if (!rows.length) return null;
    const w0 = S().WEEK0;
    for (let t = w0 + 1; t < w0 + 7 * S().DAY; t += 1800) {
      const shown = S().shownNext(gc, t);
      const next = S().sieges(gc, tl, t, t + 8 * S().DAY, { guilds: Infinity }).find(s => s.start >= t);
      if (shown !== null && next && shown !== next.start) return { at: t, shown, real: next.start };
    }
    return null;
  }

  FRE.pvpChecks = pvpChecks;
  FRE.pvpChecks.shownWrong = shownWrong;
})(globalThis.FRE = globalThis.FRE || {});
