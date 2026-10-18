// Mini Events, the week (step 5): when each BEGIN line really starts an event, and which ones the server skips.
//   schedule  CMiniEventMng::Process (MiniEventMng.cpp:642-695), one tick a second while CLOSED: the next start
//             (GetNextScheduledStart :585: day 0 = every day, 1 = Sunday ... 7 = Saturday; the smallest start after now over
//             today + 7 days, the first BEGIN line wins a tie); RANDOM = PickRandomType (:613, xRandom over the loaded events with
//             IN_RANDOM 1, picked once per start); when the start is REGISTER minutes away (of the picked event) it is
//             announced - unless FFA, TDM or the Guild Siege is not CLOSED or Free PK Time is open at that moment: then that
//             start is skipped (error_*.txt "skipped: <event> is running"). A start is never announced twice (m_tLastStart).
//             The run: registration until the start, then ROUNDS x (ROUND_TIME + SCORE_TIME), then closed (Turn-in / Hide and
//             Seek rounds can end sooner); starts that fall in a run are lost (the next start is looked up when CLOSED).
//   clashes   CheckClashes (:465): ReadConfig's log warning for a BEGIN within an hour of an FFA / TDM start (any day pairs
//             with day 0); shown as a note, the skip above is what matters.
//   free pk   FreePKTime::LoadFile / FindScheduled (_Common/FreePKTime.cpp): FreePKTime.txt DURATION (1-1440 minutes, default 60),
//             SCHEDULE { day hour minute ... }; open from each start for DURATION minutes.
// FFA / TDM / Guild Siege windows come from loaders/pvp-sim.js (runs: announce -> closed, sieges: start -> closed).
// Not modelled: GM /eventstart, a cancelled run (too few players: it closes at the start), a server restart, /freepkstop.
(function (FRE) {
  'use strict';
  const DAY = 86400;
  const P = () => FRE.pvpSim;

  // FreePKTime.txt (a bare CScanner): DURATION n, EXPRATE f, WARNING n, SCHEDULE { day hour minute ... }; any other word stops it
  function readFreePk(file) {
    const out = { ok: !!file, dur: 60, slots: [] };
    if (!file) return out;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    for (let t = s.getToken(); t.type !== 'eof'; t = s.getToken()) {
      if (t.text === 'DURATION') out.dur = s.getNumber().value;
      else if (t.text === 'EXPRATE') s.getFloat();
      else if (t.text === 'WARNING') s.getNumber();
      else if (t.text === 'SCHEDULE') {
        s.getToken();                                         // {
        // GetNumber() then `while( *s.token != '}' )`: read as tokens (the times are plain numbers)
        for (let d = s.getToken(); d.type !== 'eof' && !d.text.startsWith('}'); d = s.getToken()) {
          const day = parseInt(d.text, 10) || 0, hour = parseInt(s.getToken().text, 10) || 0, minute = parseInt(s.getToken().text, 10) || 0;
          if (day >= 0 && day <= 7 && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) out.slots.push({ day, hour, minute });
        }
      } else break;
    }
    out.dur = Math.min(1440, Math.max(1, out.dur));
    return out;
  }
  // the open windows [{ from, to }] that touch from..until
  function freePkWindows(fp, from, until) {
    const out = [];
    if (!fp || !fp.ok) return out;
    for (let d = P().midnight(from) - DAY; d <= until; d += DAY) {
      const w = P().dow(d + 12 * 3600);
      for (const sl of fp.slots) {
        if (sl.day !== 0 && sl.day !== w) continue;
        const a = d + sl.hour * 3600 + sl.minute * 60, b = a + fp.dur * 60;
        if (b > from && a <= until) out.push({ from: a, to: b });
      }
    }
    return out.sort((x, y) => x.from - y.from);
  }

  // GetNextScheduledStart with the BEGIN line's event: { t, type, line } | null
  function nextStart(times, tNow) {
    let best = null;
    const today = P().midnight(tNow);
    for (let off = 0; off <= 7; off++) {
      const d = today + off * DAY, w = P().dow(d + 12 * 3600);
      times.forEach((x, line) => {
        if (x.day !== 0 && x.day !== w) return;
        const t = d + x.hour * 3600 + x.minute * 60;
        if (t > tNow && (best === null || t < best.t)) best = { t, type: x.type, line };
      });
    }
    return best;
  }

  // the busy windows of the other events: [{ ev: 'FFA' | 'TDM' | 'Guild Siege' | 'Free PK Time', from, to }]
  function busyWindows(pvpModel, fp, from, until) {
    const out = [];
    if (pvpModel) {
      for (const [k, name] of [['ffa', 'FFA'], ['tdm', 'TDM']]) {
        const cfg = pvpModel[k] && pvpModel[k].cfg;
        if (cfg) for (const r of P().runs(cfg, from - 2 * DAY, until)) out.push({ ev: name, from: r.announce, to: r.closed });
      }
      if (pvpModel.gs && pvpModel.gs.ok) for (const sg of P().sieges(pvpModel.gs, pvpModel.timeline, from - 2 * DAY, until)) out.push({ ev: 'Guild Siege', from: sg.start, to: sg.closed });
    }
    for (const w of freePkWindows(fp, from - 2 * DAY, until)) out.push({ ev: 'Free PK Time', from: w.from, to: w.to });
    return out.filter(w => w.to > from - DAY).sort((a, b) => a.from - b.from || a.to - b.to);
  }
  // FFA / TDM / GS: not CLOSED from announce (incl.) to closed (excl.); Free PK Time: start <= now < start + DURATION.
  // The server asks FFA, then TDM, then the Guild Siege, then Free PK Time.
  const ORDER = ['FFA', 'TDM', 'Guild Siege', 'Free PK Time'];
  function busyAt(busy, t) {
    for (const ev of ORDER) if (busy.some(w => w.ev === ev && w.from <= t && t < w.to)) return ev;
    return null;
  }

  // model: loaders/minievent.js; -> [{ start, line, type (0 = RANDOM), picked, announce, end, busy, why }] for starts from..until
  // why: null = runs; 'busy' (another event: busy names it); 'none' (RANDOM with no IN_RANDOM event); 'lost' (inside a run)
  function week(model, pvpModel, fp, from, until, o = {}) {
    const times = model.begins.map(b => ({ type: b.type, day: b.day.value, hour: b.hour.value, minute: b.minute.value }));
    const busy = busyWindows(pvpModel, fp, from, until);
    const rng = FRE.xRandom.rng(o.seed || 1);
    const pool = model.events.filter(e => e && e.loaded && e.values.IN_RANDOM).map(e => e.type);
    const out = [];
    let now = from;
    for (let guard = 0; guard < 5000; guard++) {
      const nx = nextStart(times, now);
      if (!nx || nx.t > until) break;
      const type = nx.type || (pool.length ? pool[rng.random(pool.length)] : 0);
      const row = { start: nx.t, line: nx.line, type: nx.type, picked: type, announce: null, end: null, busy: null, why: null };
      out.push(row);
      if (!type) { row.why = 'none'; now = nx.t; continue; }
      const e = model.events[type], reg = e.values.REGISTER * 60;
      row.announce = Math.max(now, nx.t - reg);
      const b = busyAt(busy, row.announce);
      if (b) { row.why = 'busy'; row.busy = b; now = nx.t; continue; }
      row.end = nx.t + e.values.ROUNDS * (e.values.ROUND_TIME + e.values.SCORE_TIME);
      // starts inside this run are never announced (the next start is looked up only when CLOSED again)
      for (let t2 = nextStart(times, nx.t); t2 && t2.t <= row.end && t2.t <= until; t2 = nextStart(times, t2.t))
        out.push({ start: t2.t, line: t2.line, type: t2.type, picked: null, announce: null, end: null, busy: null, why: 'lost' });
      now = row.end;
    }
    return { runs: out, busy };
  }

  // CheckClashes: BEGIN lines within an hour of an FFA / TDM start line (the server's log warning)
  function clashes(model, pvpModel) {
    const out = [];
    if (!pvpModel) return out;
    for (const [k, name] of [['ffa', 'FFA'], ['tdm', 'TDM']]) {
      const cfg = pvpModel[k] && pvpModel[k].cfg;
      if (!cfg) continue;
      for (const x of cfg.times) model.begins.forEach((b, i) => {
        if (b.day.value !== 0 && x.day !== 0 && b.day.value !== x.day) return;
        let d = Math.abs((b.hour.value * 60 + b.minute.value) - (x.hour * 60 + x.minute));
        if (d > 12 * 60) d = 24 * 60 - d;
        if (d < 60) out.push({ line: i, ev: name, day: x.day, hour: x.hour, minute: x.minute });
      });
    }
    return out;
  }

  FRE.miniEventWeek = { readFreePk, freePkWindows, nextStart, busyWindows, busyAt, week, clashes };
})(globalThis.FRE = globalThis.FRE || {});
