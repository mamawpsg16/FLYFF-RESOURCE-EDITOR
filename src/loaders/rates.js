// Rates & Buffs (task I part 1): the server rates in Event.lua, ServerBuff.txt and GuildBuff.txt. No DOM.
//   Event.lua    real Lua run by CLuaBase::RunScript (LuaBase.cpp:47, luaL_dofile) in the WorldServer (Project.cpp:983) and the
//                DatabaseServer (databaseserver/Project.cpp:192). The calls are stored by LuaFunc/EventFunc.lua:
//                AddEvent :235 (every factor starts at 1), SetTime :262 (GetTimeToNumber :222), SetExpFactor :322,
//                SetItemDropRate :339, SetPieceItemDropRate :356, SetGoldDropFactor :373, SetWeatherEvent :582 (4f268007).
//                A second Set… in one event overwrites the first. GetEventState :62: per time window in order, a window that
//                has started sets the event on while before its end, off after it. Get…Factor: the product over the events
//                that are on (:327-388, :588-598), read by CEventLua as a float (EventLua.cpp:275-360). If the script fails
//                (RunScript != 0, EventLua.cpp:176-198) IsPossible() is false and every factor is 1.
//                The DatabaseServer window menu "Apply now" (IDM_EVENTLUA_APPLYNOW, DatabaseServer.cpp:488) reloads it live.
//   ServerBuff   ServerBuffManage::loadServerBuffFile (ServerBuff.cpp:27-63), a bare CScanner (no #defines, GetNumber = atoi):
//                `ServerBuffTiers { tier minOnline expPercent "name" "icon" … }`, WorldServer only (Project.cpp:893). 02ad5901:
//                the EXP per kill was not yet confirmed in game.
//   GuildBuff    GuildBuffManage::loadGuildBuffFile (GuildBuff.cpp:12-60), bare CScanner: `tier minGuildLevel minOnline` +
//                5 × `dst adj` + "name" "desc" "icon"; both the WorldServer and the game read it (Project.cpp:891), but the game
//                only shows the strings the server sends (DPClient.cpp:11575: name 128, desc 256, icon 64 bytes). cd03ca46, ca02d0cb.
//   Both buff loaders: no field-count check (a missing field shifts every later row); the file ending before `}` loops forever
//   (GetNumber at the end returns 0, *token is never '}'); the highest tier NUMBER whose needs are met wins (findHighestEligibleTier,
//   ServerBuff.cpp:65, GuildBuff.cpp:62).
// Not modelled in Event.lua: Lua control flow / variables around the calls (the file has none), a non-number factor.
(function (FRE) {
  'use strict';
  const f32 = Math.fround;
  const KINDS = {
    exp: { fn: 'SetExpFactor', label: 'EXP ×' },
    gold: { fn: 'SetGoldDropFactor', label: 'Penya ×' },
    item: { fn: 'SetItemDropRate', label: 'Drop roll gate ×' },
    piece: { fn: 'SetPieceItemDropRate', label: 'Item chance ×' },
    weather: { fn: 'SetWeatherEvent', label: 'Weather bonus ×' },
  };
  const FN_KIND = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.fn, k]));
  // EventFunc.lua's functions, LuaBase.cpp:16-17 (TRACE, ERROR) and the Lua globals Event.lua may call
  const KNOWN_FN = new Set(('SEC MIN Notice AddMessage IsNoticeTime SetNextNoticeTime GetNoticeMessage GetEventState SetState GetEventList ' +
    'GetAllEventList GetEventInfo GetDesc GetTimeToNumber AddEvent SetTime SetItem GetItem SetExpFactor GetExpFactor SetItemDropRate ' +
    'GetItemDropRate SetPieceItemDropRate GetPieceItemDropRate SetGoldDropFactor GetGoldDropFactor SetAttackPower GetAttackPower ' +
    'SetDefensePower GetDefensePower SetCouponEvent GetCouponEvent SetLevelUpGift GetLevelUpGift SetCheerExpFactor GetCheerExpFactor ' +
    'SetSpawn GetSpawn SetKeepConnectEvent GetKeepConnectTime GetKeepConnectItem SetRainEvent GetRainEventExpFactor GetRainEventTitle ' +
    'SetWeatherEvent GetWeatherEventExpFactor GetWeatherEventTitle SetSnowEvent GetSnowEventExpFactor GetSnowEventTitle ' +
    'TRACE ERROR dofile print tonumber tostring pairs ipairs type').split(' '));
  // Lua keywords that may stand before "(" (not calls)
  const KEYWORDS = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
  const NAME_MAX = 127, DESC_MAX = 255, ICON_MAX = 63;     // DPClient.cpp:11578 (char szName[128], szDesc[256], szIcon[64])
  const GATE_FULL = 10;                                     // nProbability 10 at a level gap of 8+ (Mover.cpp:8594): × 10 = 100

  // ---------------------------------------------------------------- Event.lua
  // comments AND strings blanked (same length), for the structure checks
  function blankLua(text) {
    let out = '', i = 0;
    const n = text.length, bad = [];
    while (i < n) {
      const c = text[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
        if (j >= n || text[j] !== c) bad.push({ start: i, end: j, what: 'a string with no closing quote on its line' });
        out += c + text.slice(i + 1, j).replace(/[^\n]/g, ' ') + (j < n && text[j] === c ? c : ''); i = j + (j < n && text[j] === c ? 1 : 0); continue;
      }
      if (c === '-' && text[i + 1] === '-') {
        let j;
        if (text[i + 2] === '[' && text[i + 3] === '[') {
          j = text.indexOf(']]', i + 4);
          if (j < 0) { bad.push({ start: i, end: n, what: 'a --[[ comment that is never closed with ]]' }); j = n; } else j += 2;
        } else { j = text.indexOf('\n', i); if (j < 0) j = n; }
        out += text.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
      }
      out += c; i++;
    }
    return { text: out, bad };
  }

  // the arguments of a call, with their spans in the file: [{ text (trimmed), start, end, str (unquoted, or null) }]
  function argSpans(text, open, close) {
    const out = [];
    let s = open, q = null, depth = 0;
    const push = e => {
      let a = s, b = e;
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      const t = text.slice(a, b);
      out.push({ text: t, start: a, end: b, str: /^(["']).*\1$/s.test(t) ? t.slice(1, -1) : null });
    };
    for (let i = open; i < close; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && !depth) { push(i); s = i + 1; }
    }
    push(close);
    return out;
  }
  const luaNum = t => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? Number(t) : NaN;
  // GetTimeToNumber (EventFunc.lua:222): the digit groups, every group after the first padded to 2 digits when below 10
  function timeNumber(s) {
    const g = String(s).match(/\d+/g) || [];
    if (!g.length) return NaN;
    return Number(g.map((x, j) => (j && Number(x) < 10) ? '0' + Number(x) : x).join(''));
  }
  const stampOf = d => Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    + `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`);

  // -> { events: [{ name, idx, start, end, times: [{ a, b, aArg, bArg, stmt }], f: { kind: { value, arg, stmt } }, weatherTitle, last }],
  //      active: { exp, item, piece, gold, weather } (double products), on: [names], errors: [{ start, end, message, warn }] }
  function loadEvents(file, now) {
    const res = { events: [], errors: [], active: { exp: 1, item: 1, piece: 1, gold: 1, weather: 1 }, file: file ? file.name : 'Event.lua' };
    if (!file) return res;
    const text = file.text;
    const bl = blankLua(text), bt = bl.text;
    for (const b of bl.bad) res.errors.push({ start: b.start, end: b.end, message: `Event.lua has ${b.what}` });
    // brackets (Lua stops at the first one out of place)
    const stack = [], PAIR = { ')': '(', ']': '[', '}': '{' };
    for (let i = 0; i < bt.length; i++) {
      const c = bt[i];
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (PAIR[c]) {
        if (!stack.length || bt[stack[stack.length - 1]] !== PAIR[c]) { res.errors.push({ start: i, end: i + 1, message: `Event.lua has a "${c}" with nothing to close` }); break; }
        stack.pop();
      }
    }
    if (stack.length) { const i = stack[stack.length - 1]; res.errors.push({ start: i, end: i + 1, message: `Event.lua has a "${bt[i]}" that is never closed` }); }
    // calls: name( … ) with one level of nested ( ) inside
    const re = /\b([A-Za-z_]\w*)\s*\(((?:[^()]|\([^()]*\))*)\)/g;
    let m, ev = null;
    while ((m = re.exec(bt))) {
      const name = m[1];
      if (KEYWORDS.has(name)) { re.lastIndex = m.index + name.length; continue; }
      if (/function\s+$/.test(bt.slice(Math.max(0, m.index - 20), m.index))) continue;
      const before = bt.slice(Math.max(0, m.index - 1), m.index);
      if (before === '.' || before === ':') continue;           // string.format( … ) and the like
      const open = m.index + m[0].indexOf('(') + 1, close = m.index + m[0].length - 1;
      const stmt = { start: m.index, end: m.index + m[0].length };
      if (!KNOWN_FN.has(name)) { res.errors.push({ start: stmt.start, end: stmt.end, message: `Event.lua calls ${name}(), which neither EventFunc.lua nor the server defines (Lua: attempt to call a nil value)` }); continue; }
      if (name === 'AddEvent') {
        const a = argSpans(text, open, close);
        ev = { name: a[0] ? (a[0].str != null ? a[0].str : a[0].text) : '', idx: res.events.length, start: stmt.start, stmt, nameArg: a[0] || null,
          times: [], f: {}, weatherTitle: null, last: stmt, on: false };
        res.events.push(ev);
        continue;
      }
      if (!/^Set/.test(name)) continue;
      if (!ev) { res.errors.push({ start: stmt.start, end: stmt.end, message: `${name}() comes before any AddEvent(): tEvent[0] is nil and Lua stops there` }); continue; }
      ev.last = stmt;
      const a = argSpans(text, open, close);
      if (name === 'SetTime') {
        ev.times.push({ a: timeNumber(a[0] && a[0].str != null ? a[0].str : ''), b: timeNumber(a[1] && a[1].str != null ? a[1].str : ''),
          aArg: a[0] || null, bArg: a[1] || null, stmt });
        continue;
      }
      const kind = FN_KIND[name];
      if (!kind || !a[0]) continue;
      ev.f[kind] = { value: luaNum(a[0].text), arg: a[0], stmt };        // the last one wins (it overwrites the field)
      if (kind === 'weather') ev.weatherTitle = a[1] || null;
    }
    for (const e of res.events) e.end = e.idx + 1 < res.events.length ? res.events[e.idx + 1].start : text.length;
    setState(res, now);
    return res;
  }
  // GetEventState + the Get…Factor products at `now` (a Date)
  function setState(res, now) {
    const nowN = stampOf(now || new Date());
    res.now = nowN;
    const act = { exp: 1, item: 1, piece: 1, gold: 1, weather: 1 };
    for (const e of res.events) {
      let on = false;
      for (const t of e.times) if (t.a <= nowN) on = t.b > nowN;
      e.on = on;
      if (!on) continue;
      for (const k of Object.keys(act)) if (e.f[k] && !Number.isNaN(e.f[k].value)) act[k] *= e.f[k].value;
    }
    // a script that fails: CEventLua::IsPossible() is false, every Get… returns 1
    res.failed = res.errors.some(x => !x.warn);
    res.active = res.failed ? { exp: 1, item: 1, piece: 1, gold: 1, weather: 1 } : act;
    res.activeF = Object.fromEntries(Object.entries(res.active).map(([k, v]) => [k, f32(v)]));   // (float) lua_tonumber
    return res;
  }

  // ---------------------------------------------------------------- ServerBuff.txt / GuildBuff.txt
  function scanTiers(file, kw, guild) {
    const res = { file: file.name, tiers: [], open: null, close: null, kw: null, problems: [] };
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    const num = what => {
      const n = s.getNumber(), t = n.tokens[0];
      const ok = t.type === 'number' || t.type === 'hex' || t.text === '=' || ((t.text === '-' || t.text === '+') && n.tokens[1] && n.tokens[1].type === 'number');
      return { value: n.value, start: n.start, end: n.end, ok, text: file.text.slice(n.start, n.end), what, word: t.type === 'ident' };
    };
    const str = what => { const t = s.getToken(); return { text: t.text, start: t.start, end: t.end, ok: t.type === 'string', what }; };
    s.getToken();
    while (!s.eof) {
      if (s.token.text !== kw) break;
      res.kw = { start: s.token.start, end: s.token.end };
      const o = s.getToken();
      res.open = { start: o.start, end: o.end };
      if (o.text !== '{') res.problems.push({ code: 'FIELDS', start: o.start, end: o.end, message: `${kw} is not followed by {: the server reads "${o.text}" as the { and every number after it shifts` });
      let tier = num('tier');
      while (s.token.text[0] !== '}') {
        if (s.eof) { res.problems.push({ code: 'NO_CLOSE', start: tier.start, end: tier.start, message: `${file.name} ends before the closing }: the server loops forever at startup` }); break; }
        const t = { tier };
        if (guild) {
          t.glv = num('guild level'); t.online = num('members online');
          t.bonus = [];
          for (let i = 0; i < 5; i++) t.bonus.push({ dst: num('stat'), adj: num('amount') });
          t.name = str('name'); t.desc = str('description'); t.icon = str('icon');
        } else {
          t.online = num('players online'); t.pct = num('EXP %'); t.name = str('name'); t.icon = str('icon');
        }
        t.start = tier.start; t.end = t.icon.end;
        res.tiers.push(t);
        tier = num('tier');
      }
      if (s.token.text[0] === '}') res.close = { start: s.token.start, end: s.token.end };
      break;          // the outer loop reads no second block: the next token is "}" (ServerBuff.cpp:57)
    }
    if (!res.kw) res.problems.push({ code: 'FIELDS', start: 0, end: 0, message: `${file.name} does not start with ${kw}: the server loads no tiers` });
    return res;
  }
  const loadServerBuff = file => file ? scanTiers(file, 'ServerBuffTiers', false) : null;
  const loadGuildBuff = file => file ? scanTiers(file, 'GuildBuffTiers', true) : null;

  // findHighestEligibleTier: the highest tier number whose needs are met (first one on a tie)
  function pickServerTier(sb, online) {
    let best = null;
    for (const t of sb ? sb.tiers : []) if (online >= t.online.value && (!best || t.tier.value > best.tier.value)) best = t;
    return best;
  }
  function pickGuildTier(gb, guildLevel, online) {
    let best = null;
    for (const t of gb ? gb.tiers : []) if (guildLevel >= t.glv.value && online >= t.online.value && (!best || t.tier.value > best.tier.value)) best = t;
    return best;
  }
  // DST names (defineAttribute.h) and the tooltip words for a stat number
  function dstName(defines, v) { return v ? (defines.byValue ? defines.byValue('DST_', v) : null) : null; }

  // ---------------------------------------------------------------- checks
  function validate(model, opts = {}) {
    const out = [];
    const ev = model.events, defs = opts.defines;
    for (const e of ev.errors) out.push({ module: 'rates', file: ev.file, code: e.warn ? 'RT_LUA_CALL' : 'RT_LUA_ERROR', severity: e.warn ? 'WARN' : 'BLOCK',
      start: e.start, end: e.end, key: `${e.warn ? 'RT_LUA_CALL' : 'RT_LUA_ERROR'}|${e.message}`,
      message: e.warn ? e.message : `${e.message}. The server cannot run Event.lua: every rate becomes 1 (no EXP ×, no Penya ×) and no level-up gift is given.` });
    if (!ev.failed && ev.active.item > GATE_FULL) {
      const by = ev.events.filter(e => e.on && e.f.item);
      out.push({ module: 'rates', file: ev.file, code: 'RT_GATE_NO_EFFECT', severity: 'WARN', start: by.length ? by[0].f.item.arg.start : 0, end: by.length ? by[0].f.item.arg.end : 0,
        key: 'RT_GATE_NO_EFFECT', message: `The drop roll gate is ×${ev.active.item} now: from ×10 every kill already passes the gate, so more changes nothing. Use "Item chance ×" to make items drop more often.` });
    }
    for (const [b, kind] of [[model.server, 'ServerBuff'], [model.guild, 'GuildBuff']]) {
      if (!b) continue;
      for (const p of b.problems) out.push({ module: 'rates', file: b.file, code: p.code === 'NO_CLOSE' ? 'RT_NO_CLOSE' : 'RT_FIELDS', severity: 'BLOCK',
        start: p.start, end: p.end, key: `RT_${p.code}|${b.file}`, message: p.message });
      const seen = new Set();
      b.tiers.forEach((t, i) => {
        const where = `${b.file} tier ${t.tier.value}`;
        const nums = kind === 'GuildBuff' ? [t.tier, t.glv, t.online] : [t.tier, t.online, t.pct];
        const bad = nums.find(n => !n.ok) || [t.name, t.icon, t.desc].filter(Boolean).find(x => !x.ok);
        if (bad) out.push({ module: 'rates', file: b.file, code: 'RT_FIELDS', severity: 'BLOCK', start: bad.start, end: bad.end, key: `RT_FIELDS|${b.file}|${i}`,
          message: `${where}: "${bad.text || '(end of file)'}" stands where the ${bad.what} should be. The server has no field check: this row and every row after it are read shifted.` });
        if (kind === 'GuildBuff') t.bonus.forEach((x, j) => {
          if (x.dst.word) out.push({ module: 'rates', file: b.file, code: 'RT_GB_DST_NAME', severity: 'WARN', start: x.dst.start, end: x.dst.end, key: `RT_GB_DST_NAME|${i}|${j}`,
            message: `${where}, stat ${j + 1}: "${x.dst.text}" is a name. GuildBuff.txt is read with atoi, so it becomes 0 (no stat). Write the number.` });
          else if (x.dst.value && defs && !dstName(defs, x.dst.value)) out.push({ module: 'rates', file: b.file, code: 'RT_GB_DST_UNKNOWN', severity: 'WARN', start: x.dst.start, end: x.dst.end, key: `RT_GB_DST_UNKNOWN|${i}|${j}`,
            message: `${where}, stat ${j + 1}: ${x.dst.value} is not a DST_ number in defineAttribute.h` });
        });
        if (seen.has(t.tier.value)) out.push({ module: 'rates', file: b.file, code: 'RT_TIER_ORDER', severity: 'WARN', start: t.tier.start, end: t.tier.end, key: `RT_TIER_DUP|${b.file}|${t.tier.value}`,
          message: `${b.file} has tier ${t.tier.value} twice: the first one is used for the tooltip` });
        seen.add(t.tier.value);
        const prev = b.tiers[i - 1];
        if (prev && (t.tier.value <= prev.tier.value || t.online.value < prev.online.value || (kind === 'GuildBuff' && t.glv.value < prev.glv.value)))
          out.push({ module: 'rates', file: b.file, code: 'RT_TIER_ORDER', severity: 'WARN', start: t.tier.start, end: t.tier.end, key: `RT_TIER_ORDER|${b.file}|${i}`,
            message: `${where} comes after tier ${prev.tier.value} but has a lower number or needs less: the server picks the highest tier NUMBER whose needs are met, so a tier can hide another` });
        for (const [x, max, what] of [[t.name, NAME_MAX, 'name'], [t.desc, DESC_MAX, 'description'], [t.icon, ICON_MAX, 'icon file name']])
          if (x && x.ok && x.text.length > max) out.push({ module: 'rates', file: b.file, code: 'RT_TEXT_LONG', severity: 'WARN', start: x.start, end: x.end, key: `RT_TEXT_LONG|${b.file}|${i}|${what}`,
            message: `${where}: the ${what} has ${x.text.length} characters; the game keeps only ${max}` });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- the task's model
  function fromWorkspace(ws) {
    const f = n => ws.files.get(n);
    return {
      events: loadEvents(f('event.lua'), ws.now ? ws.now() : new Date()),
      server: loadServerBuff(f('serverbuff.txt')),
      guild: loadGuildBuff(f('guildbuff.txt')),
      rebirth: FRE.gifts && f('1rebirth.inc') ? FRE.gifts.rebirth(f('1rebirth.inc'), ws.defines.defines, ws.items.items) : null,
      exp: loadExpLimits(f('exptable.inc')),
    };
  }

  // expTable.inc expCharacter (CProject::LoadExpTable, Project.cpp:3681-3693): per level nExp1, nExp2 (GetExpInteger), dwLPPoint, nLimitExp
  function loadExpLimits(file) {
    if (!file) return null;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    s.getToken();
    while (!s.eof && s.token.text !== 'expCharacter') s.getToken();
    if (s.eof) return null;
    s.getToken();                              // {
    const rows = [];
    let v = s.getInt64();
    while (s.token.text[0] !== '}' && !s.eof) {
      const r = { exp1: v.value };
      r.exp2 = s.getInt64().value; r.lp = s.getNumber().value; r.limit = s.getInt64().value;
      rows.push(r);
      v = s.getInt64();
    }
    return rows;
  }

  FRE.rates = { KINDS, loadEvents, setState, loadServerBuff, loadGuildBuff, pickServerTier, pickGuildTier, dstName, validate, fromWorkspace,
    loadExpLimits, timeNumber, argSpans, blankLua, NAME_MAX, DESC_MAX, ICON_MAX, GATE_FULL };
})(globalThis.FRE = globalThis.FRE || {});
