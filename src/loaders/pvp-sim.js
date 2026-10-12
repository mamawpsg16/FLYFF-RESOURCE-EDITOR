// What happens in game with the PvP Events settings (task "PvP Events"): a port of the code that USES them. No DOM.
// Times are the server PC's wall clock as seconds (Date.UTC of the wall time: the server runs on Philippine time, no DST).
//   schedule  CFFAManager / CTDMManager::Process (FFAManager.cpp:284, TDMManager.cpp:306), one tick a second: CLOSED -> when the
//             next start (GetNextScheduledStart :222: day 0 = every day, 1 = Sunday … 7 = Saturday; the smallest start > now over
//             today + 7 days) is <= ANNOUNCE_TIME minutes away: Announce (REGISTER); at the start: OpenFFA (fewer than MIN_MEMBERS
//             registered: CancelFFA = every fee back, CLOSED) -> PREPARE for PREPARATION_TIME minutes -> StartBattle (fewer than 2
//             inside: cancelled) -> BATTLE for WAR_TIME minutes (may end early) -> ENDING 15 s (FFA_ENDING_SECONDS) -> CLOSED.
//             A start that falls inside a run is skipped (the next start is looked up only when CLOSED).
//             Guild Siege: CGuildCombat::Process (eveschool.cpp:3456): while closed, the minute of today's AUTO_OPEN row (by
//             weekday) opens it when at least MINJOINGUILDSIZE guilds applied (an hour of 24 never matches GetHour 0-23); the
//             OPEN block's lines then run one after another (each waits its time). GetNextGuildCobmatTime (:2415) = what the
//             siege window shows as the next siege: it uses only m_nDay (the LAST AUTO_OPEN_IDC row's day) and, on that day
//             after the time, adds m_nDay days (not 7).
//   money     RegisterPlayer (:794): GetTotalGold() < fee -> refused, else RemoveTotalGold (Penya + Perin). CancelPlayer (:856,
//             d267070c): back = paid - (int64)paid × cut / 100, to the purse unless it would pass INT_MAX (then by mail). A
//             cancelled run: RefundFee (:762) the full fee (purse, else mail). Guild Siege: a cancelled application gets
//             MulDiv( bid, REQUESTCANCLEPERCENT, 100 ) by mail (eveschool.cpp:512); a bid not selected NOTREQUESTPERCENT.
//   tokens    FFA: Kill (:980) pays REWARD at each kill (GiveReward :703: stacks of dwPackMax, a full bag mails it); EndBattle
//             (:644): GetRanking (more kills, then fewer deaths; an insertion sort from the std::map order = player id) and the
//             top-3 prize (needs 1+ kill). TDM (TDMManager.cpp): MakeTeams (:1108: level high -> low, ties by the higher id,
//             snake R B B R), a kill counts for the killer's team, an away life lost gives the other team 1 (:560), EndBattle
//             (:696): the winning team's players with 1+ kill get TEAM_REWARD, rank 1 with 1+ kill MVP_REWARD, a draw: no team
//             prize. Guild Siege: CGuildCombat::GetPoint (eveschool.cpp:4291) pays TokensPerKill at each kill; the places and the
//             weekly lists go through loaders/gifts-sim.js (siege / weekly).
// Not modelled: an early battle end (fewer than 2 with lives / one team out), GM commands (/ffastart, /ffaskip …), the reminders,
// the purse limit of RemoveTotalGold, a server restart in the middle of a run, the siege's MAINTENANCE / WAR blocks.
(function (FRE) {
  'use strict';
  const DAY = 86400, INT_MAX = 2147483647, ENDING = 15;
  const dow = t => new Date(t * 1000).getUTCDay() + 1;            // CTime::GetDayOfWeek: 1 = Sunday
  const midnight = t => Math.floor(t / DAY) * DAY;
  const DAYS = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // a Date (the PC's local clock = the server clock) -> wall seconds, and back
  const wallOf = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 1000;
  const p2 = n => String(n).padStart(2, '0');
  const hhmm = t => { const d = new Date(t * 1000); return `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`; };
  const dayName = t => DAYS[dow(t)];
  const dateText = t => { const d = new Date(t * 1000); return `${dayName(t)} ${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())} ${hhmm(t)}`; };

  // ---------------------------------------------------------------- FFA / TDM schedule
  // GetNextScheduledStart: times [{ day, hour, minute }] -> the smallest start > tNow over today + 7 days, or 0
  function nextStart(times, tNow) {
    let next = 0;
    const today = midnight(tNow);
    for (let off = 0; off <= 7; off++) {
      const d = today + off * DAY, w = dow(d + 12 * 3600);
      for (const x of times) {
        if (x.day !== 0 && x.day !== w) continue;
        const t = d + x.hour * 3600 + x.minute * 60;
        if (t > tNow && (next === 0 || t < next)) next = t;
      }
    }
    return next;
  }
  // the runs from `from` to `until`. cfg: readManager's cfg. o: { registered(i) -> players registered by the start (default
  // MIN_MEMBERS), joined(i) -> players inside at the battle start (default = registered) }
  // -> [{ announce, start, prepareEnd, battleEnd, closed, cancelled: null | 'registered' | 'joined', skipped: [starts] }]
  function runs(cfg, from, until, o = {}) {
    const out = [];
    if (!cfg) return out;
    let now = from, last = 0;
    for (let guard = 0; guard < 10000; guard++) {
      const tStart = nextStart(cfg.times, now);
      if (!tStart || tStart === last) break;
      const announce = Math.max(now, tStart - cfg.announce * 60);
      if (announce > until) break;
      last = tStart;
      const i = out.length;
      const reg = o.registered ? o.registered(i) : cfg.min;
      const run = { announce, start: tStart, prepareEnd: null, battleEnd: null, closed: tStart, cancelled: null, skipped: [] };
      if (reg < cfg.min) run.cancelled = 'registered';
      else {
        run.prepareEnd = tStart + cfg.prepare * 60;
        const joined = o.joined ? o.joined(i) : reg;
        if (joined < 2) { run.cancelled = 'joined'; run.closed = run.prepareEnd; }
        else { run.battleEnd = run.prepareEnd + cfg.war * 60; run.closed = run.battleEnd + ENDING; }
      }
      // starts that fall inside this run: the next start is looked up only once it is CLOSED again
      for (let t = nextStart(cfg.times, tStart); t && t <= run.closed; t = nextStart(cfg.times, t)) run.skipped.push(t);
      out.push(run);
      now = run.closed;
    }
    return out;
  }

  // ---------------------------------------------------------------- Guild Siege schedule
  // gc: readGuildCombat; tl: siegeTimeline. o: { guilds: n applied (default MINJOINGUILDSIZE) }
  // -> [{ start, enter, prepare, fight, end, out, row }] (null fields: the OPEN block has no such step)
  function sieges(gc, tl, from, until, o = {}) {
    const out = [];
    if (!gc || !gc.ok) return out;
    const guilds = o.guilds === undefined ? gc.minGuild : o.guilds;
    for (let d = midnight(from); d <= until; d += DAY) {
      const row = gc.byDay[dow(d + 12 * 3600) - 1];
      if (!row || row.hour > 23) continue;                         // GetHour() is 0-23: an hour of 24 never matches
      const t = d + row.hour * 3600 + row.minute * 60;
      if (t + 59 < from || t > until) continue;                    // the check runs every tick of that minute
      if (guilds < gc.minGuild) continue;                          // not enough guilds: no siege that day
      const at = k => (tl[k] === null ? null : t + tl[k]);
      out.push({ start: t, enter: at('enter'), prepare: at('prepare'), fight: at('fight'), end: at('end'), out: at('out'), closed: t + tl.total, row });
    }
    return out;
  }
  // GetNextGuildCobmatTime: what the siege window shows as the next siege (m_nDay = the last row's day), or null (no row)
  function shownNext(gc, tNow) {
    if (!gc || !gc.ok || !gc.lastDay || !gc.byDay[gc.lastDay - 1]) return null;
    const row = gc.byDay[gc.lastDay - 1], w = dow(tNow);
    let base, nDay = gc.lastDay - w;
    if (nDay > 0) base = tNow + nDay * DAY;
    else if (nDay === 0) base = (tNow - midnight(tNow)) <= row.hour * 3600 + row.minute * 60 ? tNow : tNow + gc.lastDay * DAY;
    else base = tNow + (7 + nDay) * DAY;
    return midnight(base) + row.hour * 3600 + row.minute * 60;
  }

  // ---------------------------------------------------------------- money
  // registering: total = Penya + Perin in Penya -> { ok, paid, total (after) }
  function register(cfg, total) {
    if (cfg.cost > 0 && total < cfg.cost) return { ok: false, paid: 0, total };
    return { ok: true, paid: cfg.cost, total: total - (cfg.cost > 0 ? cfg.cost : 0) };
  }
  // the Cancel button while registration is open -> { back, kept, where: 'purse' | 'mail' | null, gold (after) }
  function cancel(cfg, paid, gold) {
    const back = paid - Math.trunc(paid * cfg.cancelCut / 100);
    if (back > 0 && gold + back <= INT_MAX) return { back, kept: paid - back, where: 'purse', gold: gold + back };
    if (back > 0) return { back, kept: paid - back, where: 'mail', gold };
    return { back: 0, kept: paid, where: null, gold };
  }
  // a run cancelled by the server (too few players): the whole fee back
  function refund(paid, gold) {
    if (paid <= 0) return { back: 0, where: null, gold };
    if (gold + paid <= INT_MAX) return { back: paid, where: 'purse', gold: gold + paid };
    return { back: paid, where: 'mail', gold };
  }
  // MulDiv( a, b, c ) for a >= 0: rounded to the nearest
  const mulDiv = (a, b, c) => Math.floor((a * b + Math.floor(c / 2)) / c);
  function siegeCancel(gc, bid) { return mulDiv(bid, gc.cancelPct, 100); }
  function siegeNotSelected(gc, bid) { return mulDiv(bid, gc.notPct, 100); }

  // ---------------------------------------------------------------- tokens
  // GiveReward: how many stacks an amount is handed out in
  const stacks = (n, packMax) => { const s = packMax > 0 && packMax < 0x7fff ? packMax : 0x7fff; return n > 0 ? Math.ceil(n / s) : 0; };
  // GetRanking: players in std::map order (by id), insertion sort: more kills, then fewer deaths
  function ranking(players) {
    const v = players.slice().sort((a, b) => a.id - b.id);
    for (let i = 1; i < v.length; i++) {
      for (let j = i; j > 0; j--) {
        const a = v[j - 1], b = v[j];
        if (b.kills > a.kills || (b.kills === a.kills && b.deaths < a.deaths)) { v[j - 1] = b; v[j] = a; } else break;
      }
    }
    return v;
  }
  // FFA: players [{ id, kills, deaths }] -> [{ id, place, kills, deaths, perKill, top, total }] in ranking order
  function ffaResult(cfg, players) {
    return ranking(players).map((p, i) => {
      const top = i < 3 && p.kills > 0 ? cfg.top[i] : 0;
      return { id: p.id, place: i + 1, kills: p.kills, deaths: p.deaths, perKill: p.kills * cfg.reward, top, total: p.kills * cfg.reward + top };
    });
  }
  // MakeTeams: the players inside -> Map id -> 'red' | 'blue'
  function makeTeams(players) {
    const inside = players.filter(p => p.inside !== false).map(p => [p.level, p.id]);
    inside.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    inside.reverse();
    const m = new Map();
    inside.forEach(([, id], i) => { const ph = i % 4; m.set(id, ph === 0 || ph === 3 ? 'red' : 'blue'); });
    return m;
  }
  // TDM: players [{ id, level, inside, kills, deaths, team? }], o: { away: { red: n, blue: n } (lives lost away, per team) }
  // -> { teams: { red, blue } (team points), winner: 'red' | 'blue' | null, rows: [{ id, team, place, kills, perKill, team: , win, mvp, total }] }
  function tdmResult(cfg, players, o = {}) {
    const made = makeTeams(players);
    const ps = players.map(p => Object.assign({}, p, { team: p.team || made.get(p.id) || null }));
    const pts = { red: 0, blue: 0 };
    for (const p of ps) if (p.team) pts[p.team] += p.kills;
    const away = o.away || {};
    pts.blue += away.red || 0;                    // a Red life lost away = +1 Blue
    pts.red += away.blue || 0;
    const winner = pts.red > pts.blue ? 'red' : pts.blue > pts.red ? 'blue' : null;
    const rank = ranking(ps), mvp = rank.length && rank[0].kills > 0;
    const rows = rank.map((p, i) => {
      const win = winner && p.team === winner && p.kills > 0 ? cfg.team : 0;
      const mv = i === 0 && mvp ? cfg.mvp : 0;
      return { id: p.id, team: p.team, place: i + 1, kills: p.kills, deaths: p.deaths, perKill: p.kills * cfg.reward, win, mvp: mv, total: p.kills * cfg.reward + win + mv };
    });
    return { teams: pts, winner, rows };
  }
  // Guild Siege kills: TokensPerKill at each kill (GWGiveTokens: nothing when 0)
  const siegeKillTokens = (prizes, kills) => kills * Math.max(0, prizes.TokensPerKill);

  // ---------------------------------------------------------------- the week on the clock (checks)
  // every run window of one week (Sunday 00:00 + 7 days), each event: [{ ev, from, to, start }] (from: registration / the siege
  // start; to: everyone back in town), from the real schedulers above (sieges with enough guilds, runs that are not cancelled)
  const WEEK0 = Date.UTC(2026, 9, 11) / 1000;     // a Sunday
  function weekWindows(model) {
    const out = [];
    const from = WEEK0 - 2 * DAY, until = WEEK0 + 8 * DAY;
    for (const k of ['ffa', 'tdm']) {
      const cfg = model[k] && model[k].cfg;
      if (!cfg) continue;
      for (const r of runs(cfg, from, until)) out.push({ ev: k, from: r.announce, to: r.closed, start: r.start, skipped: r.skipped });
    }
    for (const s of sieges(model.gs, model.timeline, from, until)) out.push({ ev: 'gs', from: s.start, to: s.closed, start: s.start, skipped: [] });
    return out.filter(w => w.to > WEEK0 && w.from < WEEK0 + 7 * DAY).sort((a, b) => a.from - b.from);
  }
  // two events whose windows overlap -> [{ a, b }] (each pair once)
  function clashes(model) {
    const w = weekWindows(model), out = [];
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j < w.length; j++) {
      if (w[i].ev === w[j].ev) continue;
      if (w[j].from < w[i].to && w[i].from < w[j].to) out.push({ a: w[i], b: w[j] });
    }
    return out;
  }

  FRE.pvpSim = { DAY, ENDING, DAYS, dow, midnight, wallOf, hhmm, dayName, dateText, nextStart, runs, sieges, shownNext, register, cancel,
    refund, mulDiv, siegeCancel, siegeNotSelected, stacks, ranking, ffaResult, makeTeams, tdmResult, siegeKillTokens, weekWindows, clashes, WEEK0 };
})(globalThis.FRE = globalThis.FRE || {});
