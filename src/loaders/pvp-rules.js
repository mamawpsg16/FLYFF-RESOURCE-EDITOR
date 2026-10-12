// The rules boards follow the data (task "PvP Events"; the user, 2026-10-12: "a change of time, fee or prize also updates the
// same value in the rules text"). No DOM. Each fact = one sentence of a board, found by its own words (written in 8362fbc6 and
// the Guild Siege boards of 4fa49551 / 6de6da39), and the value(s) in it that come from the data:
//   FFA Rules = Client/Client/NpcBoard_289.inc, TDM Rules = NpcBoard_290.inc (ASCII, CRLF)
//   Guild Siege = GuildCombatTEXT_<n>_ENG.inc (UTF-16LE: the file the game reads) and its _USA.inc twin (ANSI): both are changed.
// check(): what each board says now against the data (a sentence not found: nothing guessed, the editor says "check it").
// follow(): the splices that make the boards say the new data, for the facts whose value changes; a sentence not found -> a note.
(function (FRE) {
  'use strict';
  const S = () => FRE.pvpSim;
  const grp = n => FRE.num.group(n);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const t2 = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const DAYS = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // FFA / TDM run times as players read them: "Every day at 14:30 and 21:30", "Every Saturday at 20:00", joined with "; "
  function schedulePhrase(times) {
    if (!times || !times.length) return null;
    const by = new Map();
    for (const x of times.slice().sort((a, b) => a.day - b.day || a.hour - b.hour || a.minute - b.minute)) {
      if (!by.has(x.day)) by.set(x.day, []);
      const s = t2(x.hour, x.minute);
      if (!by.get(x.day).includes(s)) by.get(x.day).push(s);
    }
    const parts = [...by].map(([d, ts]) => `${d === 0 ? 'every day' : `every ${DAYS[d]}`} at ${list(ts)}`);
    const out = parts.join('; ');
    return out[0].toUpperCase() + out.slice(1);
  }
  // the siege rows the server uses (one per weekday, the later row of a day), in weekday order; an hour of 24 never opens
  const siegeRows = gs => (gs && gs.ok ? gs.byDay.filter(Boolean).filter(r => r.hour <= 23) : []);
  // hh:mm of (row time + sec) on the clock
  const at = (row, sec) => { const t = (row.hour * 3600 + row.minute * 60 + Math.floor(sec)) % 86400; return t2(Math.floor(t / 3600), Math.floor(t / 60) % 60); };
  const one = gs => { const r = siegeRows(gs); return r.length === 1 ? r[0] : null; };

  const BOARD = { ffa: ['client/npcboard_289.inc'], tdm: ['client/npcboard_290.inc'] };
  const GSB = n => [`client/guildcombattext_${n}_eng.inc`, `client/guildcombattext_${n}_usa.inc`];
  // m: { ffa: cfg | null, tdm: cfg | null, gs: readGuildCombat, timeline, prizes: the prizes the servers use }
  // want(m) -> [string per group] or null (the data can not say: the fact is skipped)
  const F = (ev, id, label, boards, re, want) => ({ ev, id, label, boards, re, want });
  const ev = (k, fn) => m => (m[k] ? fn(m[k]) : null);
  const FACTS = [];
  for (const k of ['ffa', 'tdm']) {
    const b = BOARD[k], L = k.toUpperCase();
    FACTS.push(
      F(k, 'times', `${L} run times`, b, /^ - (.+?) \(Philippine time/m, ev(k, c => { const p = schedulePhrase(c.times); return p ? [p] : null; })),
      F(k, 'announce', `${L} registration length`, b, /Registration opens (\d+ minutes?) before/, ev(k, c => [plural(c.announce, 'minute', 'minutes')])),
      F(k, 'cost', `${L} entry fee`, b, /Entry fee: ([\d,]+) Penya/, ev(k, c => [grp(c.cost)])),
      F(k, 'level', `${L} minimum level`, b, /Level (\d+) or higher/, ev(k, c => [String(c.level)])),
      F(k, 'cancelCut', `${L} cancel cut`, b, /fee back minus (\d+)%/, ev(k, c => [String(c.cancelCut)])),
      F(k, 'prepare', `${L} time to Join`, b, /press Join within (\d+ minutes?)/, ev(k, c => [plural(c.prepare, 'minute', 'minutes')])),
      F(k, 'war', `${L} battle length`, b, /The battle lasts (\d+ minutes?)/, ev(k, c => [plural(c.war, 'minute', 'minutes')])),
      F(k, 'lives', `${L} lives`, b, /Every player has (\d+ li(?:fe|ves))/, ev(k, c => [plural(c.lives, 'life', 'lives')])),
      k === 'ffa'
        ? F(k, 'respawn', 'FFA respawn wait', b, /back into the arena (\d+ seconds?) later/, ev(k, c => [plural(c.respawn, 'second', 'seconds')]))
        : F(k, 'respawn', 'TDM respawn wait', b, /After a death: (\d+ seconds?) in/, ev(k, c => [plural(c.respawn, 'second', 'seconds')])),
      F(k, 'reward', `${L} tokens per kill`, b, /(\d+ PVP Tokens?) for every kill/, ev(k, c => [plural(c.reward, 'PVP Token', 'PVP Tokens')])));
  }
  FACTS.push(
    F('ffa', 'top', 'FFA top 3 prizes', BOARD.ffa, /1st \+(\d+), 2nd \+(\d+), 3rd \+(\d+)/, ev('ffa', c => c.top.map(String))),
    F('tdm', 'team', 'TDM winning team prize', BOARD.tdm, /Winning team: \+(\d+)/, ev('tdm', c => [String(c.team)])),
    F('tdm', 'mvp', 'TDM MVP prize', BOARD.tdm, /MVP \(most kills\): \+(\d+)/, ev('tdm', c => [String(c.mvp)])),
    // Guild Siege: GuildCombatTEXT_1 (when, the bid), _5 (rewards)
    F('gs', 'days', 'Guild Siege day and time', GSB(1), /Siege: (.+?) \(Philippine/, m => { const r = siegeRows(m.gs); return r.length ? [r.map(x => `every ${DAYS[x.day]} ${t2(x.hour, x.minute)}`).join(' and ')] : null; }),
    F('gs', 'apply', 'Guild Siege: apply before', GSB(1), /any time before (\d\d:\d\d)/, m => { const r = one(m.gs); return r ? [t2(r.hour, r.minute)] : null; }),
    F('gs', 'schedDay', 'Guild Siege: schedule day', GSB(1), /\* Schedule \((\w+)\)/, m => { const r = one(m.gs); return r ? [DAYS[r.day]] : null; }),
    F('gs', 'close', 'Guild Siege: applications close', GSB(1), /^ - (\d\d:\d\d) +Applications close/m, m => { const r = one(m.gs); return r ? [at(r, 0)] : null; }),
    F('gs', 'enter', 'Guild Siege: enter the arena', GSB(1), /^ - (\d\d:\d\d) +Enter the arena/m, m => { const r = one(m.gs); return r && m.timeline.enter !== null ? [at(r, m.timeline.enter)] : null; }),
    F('gs', 'prep', 'Guild Siege: preparation', GSB(1), /^ - (\d\d:\d\d) +Preparation/m, m => { const r = one(m.gs); return r && m.timeline.prepare !== null ? [at(r, m.timeline.prepare)] : null; }),
    F('gs', 'fight', 'Guild Siege: combat begins', GSB(1), /^ - (\d\d:\d\d) +Combat begins/m, m => { const r = one(m.gs); return r && m.timeline.fight !== null ? [at(r, m.timeline.fight)] : null; }),
    F('gs', 'end', 'Guild Siege: combat ends', GSB(1), /^ - (\d\d:\d\d) +Combat ends/m, m => { const r = one(m.gs); return r && m.timeline.end !== null ? [at(r, m.timeline.end)] : null; }),
    F('gs', 'bid', 'Guild Siege minimum bid', GSB(1), /Minimum bid: ([\d,]+) Penya/, m => (m.gs && m.gs.ok && m.gs.joinPenya ? [grp(m.gs.joinPenya.value)] : null)),
    F('gs', 'kill', 'Guild Siege tokens per kill', GSB(5), /Every kill in the siege: (\d+ PVP Tokens?)/, m => [plural(m.prizes.TokensPerKill, 'PVP Token', 'PVP Tokens')]),
    F('gs', 'places', 'Guild Siege places 1st-3rd', GSB(5), /top 3 guilds gets PVP Tokens: (\d+) \/ (\d+) \/ (\d+)/, m => m.prizes.SiegePrize.map(String)),
    F('gs', 'wGuild', 'Guild Siege weekly: guilds', GSB(5), /top 5: (\d+(?: \/ \d+)*) PVP Tokens into/, m => [m.prizes.GuildPrize.join(' / ')]),
    F('gs', 'wTotal', 'Guild Siege weekly: players', GSB(5), /Players \(most points\), top 10: (\d+(?: \/ \d+)*) PVP Tokens/, m => [m.prizes.ClassPrize.join(' / ')]),
    F('gs', 'wClass', 'Guild Siege weekly: each class', GSB(5), /top 10 each: (\d+(?: \/ \d+)*) PVP Tokens/, m => [m.prizes.ClassPerClassPrize.join(' / ')]),
    F('gs', 'wMvp', 'Guild Siege weekly: MVP', GSB(5), /MVP \(most MVP awards\), top 10: (\d+(?: \/ \d+)*) PVP Tokens/, m => [m.prizes.MvpPrize.join(' / ')]));

  // the regex with indices ('d'): the groups' spans in the text
  const withIdx = re => new RegExp(re.source, re.flags.replace('g', '') + 'd');
  // the data a fact reads, from a PvP model (loaders/pvp.js fromWorkspace)
  const dataOf = model => ({ ffa: model.ffa.cfg, tdm: model.tdm.cfg, gs: model.gs, timeline: model.timeline, prizes: model.prizes.prizes });

  // files: Map lower -> SourceFile (the workspace's) -> [{ fact, board, status: 'ok' | 'differs' | 'notFound', said, want, spans }]
  function check(model, files) {
    const d = dataOf(model), out = [];
    for (const f of FACTS) {
      const want = f.want(d);
      if (!want) continue;
      for (const b of f.boards) {
        const file = files.get(b);
        if (!file || !file.text.length) continue;
        const m = withIdx(f.re).exec(file.text);
        if (!m) { out.push({ fact: f, board: b, status: 'notFound', said: null, want }); continue; }
        const said = m.slice(1), spans = m.indices.slice(1).map(([s, e]) => ({ start: s, end: e }));
        out.push({ fact: f, board: b, status: said.every((x, i) => x === want[i]) ? 'ok' : 'differs', said, want, spans });
      }
    }
    return out;
  }

  // oldModel / newModel: before and after the data edit; files: Map lower -> SourceFile; editable(lower) -> bool
  // -> { parts: [{ file, splices }], changed: [{ board, label, from, to }], notes: [text] }
  function follow(oldModel, newModel, files, editable = () => true) {
    const a = dataOf(oldModel), b = dataOf(newModel), by = new Map(), changed = [], notes = [];
    for (const f of FACTS) {
      const was = f.want(a), now = f.want(b);
      if (JSON.stringify(was) === JSON.stringify(now)) continue;
      for (const bd of f.boards) {
        const file = files.get(bd);
        if (!file || !file.text.length) continue;
        if (!now) { notes.push(`${file.name}: "${f.label}" can not be written from the data any more (e.g. several siege days): check the rules text by hand.`); continue; }
        const m = withIdx(f.re).exec(file.text);
        if (!m) { notes.push(`${file.name}: the sentence with "${f.label}" was not found: check the rules text by hand.`); continue; }
        if (!editable(bd)) { notes.push(`${file.name} is read-only here: "${f.label}" was not changed.`); continue; }
        const sp = [];
        m.indices.slice(1).forEach(([s, e], i) => { if (file.text.slice(s, e) !== now[i]) sp.push({ start: s, end: e, insert: now[i] }); });
        if (!sp.length) continue;
        if (!by.has(bd)) by.set(bd, []);
        by.get(bd).push(...sp);
        changed.push({ board: file.name, label: f.label, from: m.slice(1).join(' / '), to: now.join(' / ') });
      }
    }
    const parts = [...by].map(([file, splices]) => ({ file, splices: splices.sort((x, y) => x.start - y.start) }));
    return { parts, changed, notes };
  }

  FRE.pvpRules = { FACTS, schedulePhrase, siegeRows, check, follow, dataOf };
})(globalThis.FRE = globalThis.FRE || {});
