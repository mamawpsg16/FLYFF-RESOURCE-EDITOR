// PvP Events (task "PvP Events"): the FFA, TDM and Guild Siege settings, read the way the servers read them, with the offsets
// the edits need. No DOM. Each reader cites the C++ (FLYFF-V19-SOURCE/Source/Source/_Common).
//   FFAManager.inc   CFFAManager::ReadConfig (FFAManager.cpp:91; 0600d7e9, cancel cut d267070c), a CScript read at WorldServer start
//                    and by the GM command /ffareload (only while no FFA runs). The loop stops at the first error; any error switches
//                    the FFA off ("FFA switched off" in Server\error_*.txt). Keys: the last line wins; FFA_BEGIN lines add up.
//   TDMManager.inc   CTDMManager::ReadConfig (TDMManager.cpp:99; f42b83eb): the same, + TDM_TEAM_REWARD / TDM_MVP_REWARD and the three
//                    boxes TDM_WAIT / TDM_SPAWN_RED / TDM_SPAWN_BLUE (x1 z1 x2 z2 height, all needed). /tdmreload.
//   GuildCombat.txt  CGuildCombat::LoadScript (eveschool.cpp:3658), a bare CScanner at WorldServer start (ThreadMng.cpp:293: FALSE stops
//                    the start). __MAINSERVER is defined (WORLDSERVER/VersionCommon.h), so AUTO_OPEN_IDC is read and AUTO_OPEN_TEST
//                    skipped. AUTO_OPEN_IDC { day hour minute … }: at most 7 rows, day 1-7 (1 = Sunday), hour 0-24, minute 0-59, else
//                    the load fails; a row is stored per weekday (__AutoOpen[day-1]): a day written twice keeps the later row.
//                    JOINPENYA (the minimum bid), MINJOINGUILDSIZE, MAXJOINGUILDSIZE, REQUESTCANCLEPERCENT, NOTREQUESTPERCENT and the
//                    OPEN { … } block (each line runs, then waits its dwTime ms: ProcessCommand :2203) for the siege's timeline.
//   GuildSiegePrize.lua  CGuildSiegePrize::ReadPrizes (GuildSiegePrize.cpp, 6de6da39 = PvP events part B, verified in game 2026-10-12):
//                    TokensPerKill (0-32767) and the lists SiegePrize[3], GuildPrize[5], ClassPrize[10], ClassPerClassPrize[10],
//                    MvpPrize[10] (each entry 1-32767, a whole number; lua_isnumber, so "5" counts). A missing value keeps the compiled
//                    number, a bad one too (+ an Error line). The WorldServer reads TokensPerKill + SiegePrize (when it loads
//                    GuildCombat.txt), the DatabaseServer the weekly lists. A script that does not run: every compiled number.
// Not modelled: a Lua value computed from another global or an expression; a table with [n] = keys; the 1vs1 siege.
(function (FRE) {
  'use strict';
  const NULL_ID = -1;

  // ---------------------------------------------------------------- FFAManager.inc / TDMManager.inc
  // the plain number keys of ReadConfig: [suffix, default, field]
  const SCALARS = [['COST', 0, 'cost'], ['CANCEL_CUT', 20, 'cancelCut'], ['MIN_LEVEL', 1, 'level'], ['MIN_MEMBERS', 2, 'min'],
    ['MAX_MEMBERS', 30, 'max'], ['LIFES', 10, 'lives'], ['ANNOUNCE_TIME', 10, 'announce'], ['RESPAWN_TIME', 10, 'respawn'],
    ['PREPARATION_TIME', 1, 'prepare'], ['WAR_TIME', 10, 'war']];
  const KINDS = {
    ffa: { id: 'ffa', P: 'FFA', label: 'FFA', file: 'FFAManager.inc', npc: 'Donaris', reload: '/ffareload', cite: 'FFAManager.cpp:91 CFFAManager::ReadConfig' },
    tdm: { id: 'tdm', P: 'TDM', label: 'TDM', file: 'TDMManager.inc', npc: 'Amos', reload: '/tdmreload', cite: 'TDMManager.cpp:99 CTDMManager::ReadConfig' },
  };
  const BOXES = ['WAIT', 'SPAWN_RED', 'SPAWN_BLUE'];
  const sp = n => ({ start: n.start, end: n.end, value: n.value });

  // file: SourceFile or null; ctx: { defines: Map, items: Map id -> item (Spec_Item) }
  // -> { kind, missing, cfg (what ReadConfig keeps, null when switched off), error (ReadConfig's text) + errorAt,
  //      keys: { field: { value, span, key: span of the word } } (the LAST line of each key), reward: { item, amount, key },
  //      top: [span x3] (FFA), team / mvp (TDM), boxes: { WAIT: { nums: [span x5], key } }, begins: [{ day, hour, minute, key, nums }] }
  function readManager(file, kindId, ctx = {}) {
    const K = KINDS[kindId], P = K.P;
    const res = { kind: kindId, file: K.file, missing: !file, cfg: null, error: null, errorAt: null, keys: {}, reward: null, top: null,
      team: null, mvp: null, boxes: {}, begins: [], lastScalar: null };
    if (!file) { res.error = `${K.file} not found`; return res; }
    const D = ctx.defines || new Map();
    const s = new FRE.lexer.Script(file.text, { file: K.file, defines: D, diags: [] });
    // ReadConfig's locals and their defaults
    const v = { cost: 0, level: 1, min: 2, max: 30, lives: 10, announce: 10, respawn: 10, prepare: 1, war: 10, cancelCut: 20,
      rewardId: NULL_ID, reward: 0, top: [0, 0, 0], team: 0, mvp: 0, times: [] };
    const boxSeen = {};
    let error = null;
    const fail = (msg, at) => { if (!error) { error = msg; res.errorAt = at; } };
    s.getToken();
    while (!s.eof) {
      const live = !error;                                // the C++ loop stops at the first error; the rest is read for its spans only
      const t = s.token, word = t.text;
      const sc = SCALARS.find(x => word === `${P}_${x[0]}`);
      if (sc) {
        const n = s.getNumber();
        res.keys[sc[2]] = { value: n.value, span: sp(n), key: { start: t.start, end: t.end } };
        res.lastScalar = { start: t.start, end: n.end };
        if (live) v[sc[2]] = n.value;
      } else if (word === `${P}_REWARD`) {
        const a = s.getNumber(), b = s.getNumber();
        res.reward = { item: Object.assign(sp(a), { define: a.define }), amount: sp(b), key: { start: t.start, end: t.end } };
        if (live) { v.rewardId = a.value; v.reward = b.value; }
      } else if (kindId === 'ffa' && word === 'FFA_TOP_REWARD') {
        const ns = [s.getNumber(), s.getNumber(), s.getNumber()];
        res.top = ns.map(sp);
        if (live) v.top = ns.map(n => n.value);
      } else if (kindId === 'tdm' && (word === 'TDM_TEAM_REWARD' || word === 'TDM_MVP_REWARD')) {
        const n = s.getNumber();
        res[word === 'TDM_TEAM_REWARD' ? 'team' : 'mvp'] = { value: n.value, span: sp(n), key: { start: t.start, end: t.end } };
        if (live) v[word === 'TDM_TEAM_REWARD' ? 'team' : 'mvp'] = n.value;
      } else if (kindId === 'tdm' && BOXES.some(b => word === `TDM_${b}`)) {
        // (float)GetNumber() x5: x2 > x1, z2 > z1, height > 0
        const ns = [0, 1, 2, 3, 4].map(() => s.getNumber());
        const [x1, z1, x2, z2, y] = ns.map(n => n.value);
        const b = word.slice(4);
        res.boxes[b] = { nums: ns.map(sp), key: { start: t.start, end: t.end }, x1, z1, x2, z2, y };
        if (live) {
          if (x2 <= x1 || z2 <= z1) fail(`${word} x1 z1 x2 z2 height: x2 must be > x1 and z2 > z1`, { start: t.start, end: ns[4].end });
          else if (y <= 0) fail(`${word} x1 z1 x2 z2 height: the height (5th number) is missing or not > 0`, { start: t.start, end: ns[4].end });
          else boxSeen[b] = { x1, z1, x2, z2, y };
        }
      } else if (word === `${P}_BEGIN`) {
        const ns = [s.getNumber(), s.getNumber(), s.getNumber()];
        const [day, hour, minute] = ns.map(n => n.value);
        const ok = !(day < 0 || day > 7 || hour < 0 || hour > 23 || minute < 0 || minute > 59);
        res.begins.push({ day, hour, minute, ok, key: { start: t.start, end: t.end }, nums: ns.map(sp), stmt: { start: t.start, end: ns[2].end }, used: live && ok });
        if (live) {
          if (!ok) fail(`bad ${P}_BEGIN ${day} ${hour} ${minute} (day 0-7, hour 0-23, minute 0-59)`, { start: t.start, end: ns[2].end });
          else v.times.push({ day, hour, minute });
        }
      } else if (live) {
        fail(`unknown word "${word}"`, { start: t.start, end: t.end });
      }
      s.getToken();
    }
    // the checks after the loop, in ReadConfig's order
    const item = v.rewardId === NULL_ID ? null : (ctx.items && ctx.items.get(v.rewardId >>> 0)) || null;
    const pack = item ? FRE.specItem.get(item, 'dwPackMax') : 0;
    res.rewardItem = item ? { id: item.id, define: item.define, name: item.name || item.define, packMax: pack } : null;
    if (!error) {
      const e = (msg, field) => fail(msg, field && res.keys[field] ? res.keys[field].span : null);
      if (v.cost < 0) e(`${P}_COST < 0`, 'cost');
      else if (v.cancelCut < 0 || v.cancelCut > 100) e(`${P}_CANCEL_CUT must be 0 - 100`, 'cancelCut');
      else if (v.level < 1) e(`${P}_MIN_LEVEL < 1`, 'level');
      else if (v.min < 2) e(`${P}_MIN_MEMBERS < 2`, 'min');
      else if (v.max < v.min || v.max > 100) e(`${P}_MAX_MEMBERS must be ${P}_MIN_MEMBERS - 100`, 'max');
      else if (v.lives < 1) e(`${P}_LIFES < 1`, 'lives');
      else if (v.announce < 1 || v.announce > 60) e(`${P}_ANNOUNCE_TIME must be 1 - 60 minutes`, 'announce');
      else if (v.respawn < 0 || v.respawn > 60) e(`${P}_RESPAWN_TIME must be 0 - 60 seconds`, 'respawn');
      else if (v.prepare < 0 || v.prepare > 30) e(`${P}_PREPARATION_TIME must be 0 - 30 minutes`, 'prepare');
      else if (v.war < 1 || v.war > 120) e(`${P}_WAR_TIME must be 1 - 120 minutes`, 'war');
      else if (!item) fail(`${P}_REWARD: unknown item`, res.reward && res.reward.item);
      else if (v.reward < 0 || v.reward > pack) fail(`${P}_REWARD: amount must be 0 - the item's stack size`, res.reward && res.reward.amount);
      else if (kindId === 'ffa') {
        for (let i = 0; i < 3; i++) if (v.top[i] < 0 || v.top[i] > 9999) fail('FFA_TOP_REWARD: amounts must be 0 - 9999', res.top && res.top[i]);
      } else if (v.team < 0 || v.team > 9999) fail('TDM_TEAM_REWARD must be 0 - 9999', res.team && res.team.span);
      else if (v.mvp < 0 || v.mvp > 9999) fail('TDM_MVP_REWARD must be 0 - 9999', res.mvp && res.mvp.span);
      else if (!boxSeen.WAIT || !boxSeen.SPAWN_RED || !boxSeen.SPAWN_BLUE) fail('TDM_WAIT, TDM_SPAWN_RED and TDM_SPAWN_BLUE are all needed', null);
    }
    res.error = error;
    if (!error) {
      res.cfg = { cost: v.cost, cancelCut: v.cancelCut, level: v.level, min: v.min, max: v.max, lives: v.lives, announce: v.announce,
        respawn: v.respawn, prepare: v.prepare, war: v.war, rewardId: v.rewardId, reward: v.reward, packMax: pack, times: v.times };
      if (kindId === 'ffa') res.cfg.top = v.top.slice();
      else { res.cfg.team = v.team; res.cfg.mvp = v.mvp; res.cfg.boxes = boxSeen; }
    }
    return res;
  }

  // ---------------------------------------------------------------- GuildCombat.txt
  const GS_STATE = { ALLMSG: 1, GUILDMSG: 2, JOINMSG: 3, WORLDMSG: 4, STATE: 5, WARSTATE: 6, WAIT: 7 };
  // the WARSTATE commands (eveschool.h): NOTENTER_STATE = 100 …
  const WAR = { NOTENTER_COUNT: 101, ENTER: 102, MAINTENANCE: 103, WAR_WAR: 104, WAR_CLOSE: 105, WAR_CLOSE_WAIT: 106, WAR_TELEPORT: 107 };
  // -> { missing, ok (LoadScript's result), error, errorAt, autoOpen: [{ day, hour, minute, nums, row }] (rows as written),
  //      byDay: [7] (what __AutoOpen holds: the later row of a day), lastDay (m_nDay), block (the AUTO_OPEN_IDC braces),
  //      joinPenya: { value, span }, minGuild, maxGuild, cancelPct, notPct, open: [{ state, time, command, param }], hang }
  function readGuildCombat(file, defines) {
    const res = { file: 'GuildCombat.txt', missing: !file, ok: false, error: null, errorAt: null, autoOpen: [], byDay: [null, null, null, null, null, null, null],
      lastDay: 0, block: null, joinPenya: null, minGuild: 0, maxGuild: 0, cancelPct: 0, notPct: 0, open: [], hang: false };
    if (!file) { res.error = 'GuildCombat.txt not found'; return res; }
    // a bare CScanner (no #define lookup: a name in a number slot is atoi = 0); `defines` is not used
    const s = new FRE.lexer.Script(file.text, { file: 'GuildCombat.txt', defines: new Map(), diags: [] });
    const atoi = x => FRE.lexer.atoi(x).value;
    const fail = (msg, at) => { res.error = msg; res.errorAt = at; return res; };
    s.getToken();
    while (!s.eof) {
      let nCount = -1;
      const t = s.token, w = t.text;
      if (w === 'AUTO_OPEN_IDC') {
        const open = s.getToken();          // {
        s.getToken();
        res.block = { key: { start: t.start, end: t.end }, open: { start: open.start, end: open.end }, close: null };
        while (s.token.text[0] !== '}') {
          if (s.eof) return fail('AUTO_OPEN_IDC { … } is never closed with "}": the day read at the end of the file is 0 (Day Error)', { start: t.start, end: t.end });
          if (res.autoOpen.length >= 7) return fail('AUTO_OPEN_IDC has more than 7 rows (the server allows 7: one per weekday)', { start: s.token.start, end: s.token.end });
          const dTok = s.token, day = atoi(dTok.text);
          res.lastDay = day;
          if (day <= 0 || day > 7) return fail(`AUTO_OPEN_IDC day ${day}: must be 1 (Sunday) - 7 (Saturday) (Day Error)`, { start: dTok.start, end: dTok.end });
          const h = s.getNumber();
          if (h.value < 0 || h.value > 24) return fail(`AUTO_OPEN_IDC hour ${h.value}: must be 0 - 24 (Time Error)`, sp(h));
          const m = s.getNumber();
          if (m.value < 0 || m.value > 59) return fail(`AUTO_OPEN_IDC minute ${m.value}: must be 0 - 59 (Time Error)`, sp(m));
          const row = { day, hour: h.value, minute: m.value, nums: [{ start: dTok.start, end: dTok.end, value: day }, sp(h), sp(m)],
            stmt: { start: dTok.start, end: m.end } };
          res.autoOpen.push(row);
          res.byDay[day - 1] = row;
          s.getToken();
        }
        res.block.close = { start: s.token.start, end: s.token.end };
      } else if (w === 'JOINPENYA') { const n = s.getNumber(); res.joinPenya = { value: n.value, span: sp(n) }; }
      else if (w === 'MINJOINGUILDSIZE') res.minGuild = s.getNumber().value;
      else if (w === 'MAXJOINGUILDSIZE') res.maxGuild = s.getNumber().value;
      else if (w === 'REQUESTCANCLEPERCENT') res.cancelPct = s.getNumber().value;
      else if (w === 'NOTREQUESTPERCENT') res.notPct = s.getNumber().value;
      else if (w === 'OPEN') nCount = 0;
      else if (w === 'MAINTENANCE') nCount = 1;
      else if (w === 'WAR') nCount = 2;
      if (nCount !== -1) {
        s.getNumber();
        s.getToken();                       // {
        s.getToken();
        const lines = [];
        while (s.token.text[0] !== '}') {
          if (s.eof) { res.hang = true; return fail(`${w} { … } is never closed with "}": the server loops forever at startup`, { start: t.start, end: t.end }); }
          const state = GS_STATE[s.token.text] || 0;
          const time = s.getNumber().value >>> 0, command = s.getNumber().value, param = s.getNumber().value;
          lines.push({ state, time, command, param });
          s.getToken();
        }
        if (nCount === 0) res.open = lines;
      }
      s.getToken();
    }
    res.ok = true;
    return res;
  }

  // the siege's timeline from the OPEN block, in seconds after the start (each line runs, then waits its time)
  // -> { enter, prepare, fight, end, out } (null: that step is not in the block)
  function siegeTimeline(gc) {
    const at = {};
    let ms = 0;
    for (const l of gc.open || []) {
      if (l.state === GS_STATE.WARSTATE) {
        const k = { [WAR.ENTER]: 'enter', [WAR.MAINTENANCE]: 'prepare', [WAR.WAR_WAR]: 'fight', [WAR.WAR_CLOSE]: 'end', [WAR.WAR_TELEPORT]: 'out' }[l.command];
        if (k && at[k] === undefined) at[k] = ms / 1000;
      }
      ms += l.time;
    }
    const g = k => (at[k] === undefined ? null : at[k]);
    return { enter: g('enter'), prepare: g('prepare'), fight: g('fight'), end: g('end'), out: g('out'), total: ms / 1000 };
  }

  // ---------------------------------------------------------------- GuildSiegePrize.lua
  const PRIZE_LISTS = [['SiegePrize', 3, [50, 14, 7]], ['GuildPrize', 5, [600, 300, 180, 72, 48]],
    ['ClassPrize', 10, [200, 100, 60, 40, 30, 24, 20, 14, 8, 4]], ['ClassPerClassPrize', 10, [100, 50, 30, 20, 15, 12, 10, 7, 4, 2]],
    ['MvpPrize', 10, [300, 150, 90, 60, 45, 36, 30, 21, 12, 6]]];
  const PRIZE_DEFAULT = { TokensPerKill: 2, ...Object.fromEntries(PRIZE_LISTS.map(([n, , d]) => [n, d])) };
  // lua_isnumber + lua_tonumber of a literal (a string holding a number counts), else NaN
  const luaNumber = raw => FRE.upgradeFees.luaNumber(raw);
  // GSReadPrizeValue: a whole number nMin..32767 -> it, else null
  const prizeValue = (d, nMin) => (Number.isFinite(d) && d >= nMin && d <= 32767 && d === Math.trunc(d) ? d : null);

  // -> { missing, failed, errors: [{ start, end, message }], number: { TokensPerKill: { raw, value (read), used, span, stmt } },
  //      lists: { SiegePrize: { items: [{ raw, read, used, start, end }], open, close, stmt }, … },
  //      prizes: { TokensPerKill: n, SiegePrize: [..], … } (what the servers end with), bad: [{ name, index, raw, used }] }
  function readPrizes(file) {
    const res = { file: 'GuildSiegePrize.lua', missing: !file, failed: false, errors: [], number: {}, lists: {}, prizes: JSON.parse(JSON.stringify(PRIZE_DEFAULT)), bad: [] };
    if (!file) return res;
    const text = file.text, bl = FRE.rates.blankLua(text), bt = bl.text;
    for (const b of bl.bad) res.errors.push({ start: b.start, end: b.end, message: `GuildSiegePrize.lua has ${b.what}` });
    const stack = [], PAIR = { ')': '(', ']': '[', '}': '{' };
    for (let i = 0; i < bt.length; i++) {
      const c = bt[i];
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (PAIR[c]) {
        if (!stack.length || bt[stack[stack.length - 1]] !== PAIR[c]) { res.errors.push({ start: i, end: i + 1, message: `GuildSiegePrize.lua has a "${c}" with nothing to close` }); break; }
        stack.pop();
      }
    }
    if (stack.length) { const i = stack[stack.length - 1]; res.errors.push({ start: i, end: i + 1, message: `GuildSiegePrize.lua has a "${bt[i]}" that is never closed` }); }
    res.failed = res.errors.length > 0;
    // top-level assignments NAME = value / NAME = { … } (blanked text: comments and string insides are spaces); the last one wins
    const re = /(^|[^\w.:])([A-Za-z_]\w*)\s*=(?!=)\s*(\{[^{}]*\}|"[^"\n]*"|'[^'\n]*'|[^\s;,{}]+)/g;
    let m;
    while ((m = re.exec(bt))) {
      const name = m[2], vs = m.index + m[0].length - m[3].length;
      const stmt = { start: m.index + m[1].length, end: vs + m[3].length };
      if (name === 'TokensPerKill') {
        const raw = text.slice(vs, vs + m[3].length);
        res.number.TokensPerKill = { raw, read: luaNumber(raw), span: { start: vs, end: vs + raw.length }, stmt };
      } else if (PRIZE_LISTS.some(x => x[0] === name)) {
        if (!m[3].startsWith('{')) { res.lists[name] = { notList: true, raw: text.slice(vs, vs + m[3].length), stmt, items: [] }; continue; }
        const items = [], inner = bt.slice(vs + 1, vs + m[3].length - 1), reI = /[^,;]+/g;
        let n;
        while ((n = reI.exec(inner))) {
          const lead = n[0].length - n[0].trimStart().length, body = n[0].trim();
          if (!body) continue;
          const s0 = vs + 1 + n.index + lead, raw = text.slice(s0, s0 + body.length);
          if (/=/.test(body)) continue;                       // a [n] = / name = entry: not a list position (not modelled)
          items.push({ raw, read: luaNumber(raw), start: s0, end: s0 + body.length });
        }
        res.lists[name] = { items, open: { start: vs, end: vs + 1 }, close: { start: vs + m[3].length - 1, end: vs + m[3].length }, stmt };
      }
    }
    if (res.failed) return res;                                // RunScript != 0: every compiled number
    const t = res.number.TokensPerKill;
    if (t) {
      t.used = t.raw === 'nil' ? null : prizeValue(t.read, 0);
      if (t.raw !== 'nil' && t.used === null) res.bad.push({ name: 'TokensPerKill', index: 0, raw: t.raw, span: t.span, min: 0, kept: res.prizes.TokensPerKill });
      if (t.used !== null) res.prizes.TokensPerKill = t.used;
    }
    for (const [name, count] of PRIZE_LISTS) {
      const L = res.lists[name];
      if (!L) continue;
      if (L.notList) { if (L.raw !== 'nil') res.bad.push({ name, index: -1, raw: L.raw, span: L.stmt, kept: null }); continue; }
      L.items.forEach((it, i) => {
        if (i >= count) { it.extra = true; return; }
        it.used = it.raw === 'nil' ? null : prizeValue(it.read, 1);
        if (it.raw !== 'nil' && it.used === null) res.bad.push({ name, index: i, raw: it.raw, span: { start: it.start, end: it.end }, min: 1, kept: res.prizes[name][i] });
        if (it.used !== null) res.prizes[name][i] = it.used;
      });
    }
    return res;
  }

  // ---------------------------------------------------------------- rules boards (Client/Client, the game reads them on each click)
  // FFA Rules = NpcBoard_289.inc (Donaris, MMI 289), TDM Rules = NpcBoard_290.inc (Amos, MMI 290): ASCII, CRLF (8362fbc6).
  // Guild Siege boards: GuildCombatTEXT_<n>_ENG.inc (UTF-16LE, the one LANG_USA reads: ProjectCmn.cpp:266 GetLangFileName) and
  // the _USA.inc ANSI twin (kept the same, 3b 4fa49551). Read on each menu click (WndWorld.cpp:4564 / :4600).
  const BOARDS = {
    ffa: ['client/npcboard_289.inc'],
    tdm: ['client/npcboard_290.inc'],
    gs: [1, 2, 3, 4, 5, 6].flatMap(n => [`client/guildcombattext_${n}_eng.inc`, `client/guildcombattext_${n}_usa.inc`]),
  };
  const isPvpBoard = lower => Object.values(BOARDS).some(l => l.includes(lower));

  // ---------------------------------------------------------------- one workspace
  // ws.cpp (io/source-read.js, FLYFF-V19-SOURCE picked): is part B (GuildSiegePrize.lua prizes) in the source?
  //   'in-source' | 'missing' | 'unknown' (no source here: test-data)
  function prizePatch(cpp) {
    if (!cpp) return 'unknown';
    const gp = cpp.get ? cpp.get('guildsiegeprize.cpp') : cpp['guildsiegeprize.cpp'];
    if (!gp) return 'unknown';
    return /CGuildSiegePrize::ReadPrizes/.test(gp) ? 'in-source' : 'missing';
  }
  function fromWorkspace(ws) {
    const D = ws.defines.defines, ctx = { defines: D, items: ws.items.items };
    const f = n => ws.files.get(n) || null;
    const gc = readGuildCombat(f('guildcombat.txt'), D);
    const boards = {};
    for (const [k, list] of Object.entries(BOARDS)) boards[k] = list.filter(l => ws.files.has(l)).map(l => ({ lower: l, file: ws.files.get(l) }));
    return {
      ffa: readManager(f('ffamanager.inc'), 'ffa', ctx),
      tdm: readManager(f('tdmmanager.inc'), 'tdm', ctx),
      gs: gc, timeline: siegeTimeline(gc),
      prizes: readPrizes(f('guildsiegeprize.lua')),
      patch: prizePatch(ws.cpp || null),
      boards,
    };
  }

  FRE.pvp = { KINDS, SCALARS, BOXES, WAR, GS_STATE, PRIZE_LISTS, PRIZE_DEFAULT, BOARDS, readManager, readGuildCombat, siegeTimeline,
    readPrizes, prizeValue, prizePatch, isPvpBoard, fromWorkspace };
})(globalThis.FRE = globalThis.FRE || {});
