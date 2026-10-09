// Gifts and Guild Siege prizes (task H part 2): read-only readers, no DOM. Each cites the C++ that reads the file.
//   levelUp  Event.lua SetLevelUpGift (real Lua 5.3, CLuaBase::RunScript = luaL_dofile, LuaBase.cpp:47; the calls are
//            stored by LuaFunc/EventFunc.lua:442 and read back by GetLevelUpGift, :455): exact level, "all" or a piece of
//            the account name, active events only (GetEventState, :61). Given by CEventLua::SetLevelUpGift
//            (EventLua.cpp:513-575, a021ff44): flag (2 = bound), minutes -> m_dwKeepTime, bag full -> mail.
//   rebirth  1Rebirth.inc, CProject::LoadRebirthProp (Project.cpp:6058-6131): Max, Rates{}, Gifts{ tier item count }
//            (one item per tier: map::insert keeps the first row; a tier above Max or an unknown item is rejected).
//   couple   couple.inc, CCoupleProperty::Initialize / LoadLevel / LoadItem (couple.cpp:234-292): the exp ladder and
//            the gifts per couple level { item SEX flag minutes count }. eMaxLevel 21 is compiled (couple.h:17).
//   maxLevel expTable.inc expCharacter (CProject::LoadExpTable, Project.cpp:3681): the last row with an EXP value;
//            IsMaxLevel = m_aExpCharacter[level + 1].nExp1 == 0 (Mover.h:1335).
//   siege    GuildCombat.txt JOINPENYA / MINJOINGUILDSIZE / MAXJOINGUILDSIZE (CGuildCombat::LoadScript,
//            eveschool.cpp:3528-3544) and the amounts compiled into the C++: per siege (GuildCombatResultRanking,
//            eveschool.cpp:1688-1712) and weekly (GuildSiegePrize.cpp:17-20, cda3af21). When the C++ is not there
//            (test-data) the copies below are used.
// Not modelled: a Lua `if` / loop / variable around the calls (the file has none: every call is read as written);
// Lua patterns in the account filter (read as plain text).
(function (FRE) {
  'use strict';
  const u16 = v => v & 0xFFFF;
  const MAX_COUPLE_LEVEL = 21;            // CCouple::eMaxLevel, couple.h:17
  const FLAG_BOUND = 2;                   // CItemElem::binds, Item.h:132

  // The amounts in the C++ today (read from the source when FLYFF-V19-SOURCE is picked)
  const BUILTIN = {
    siege: { factors: [0.9, 0.00001, 0.1], shares: [0.7, 0.2, 0.1] },         // eveschool.cpp:1702-1712
    weekly: {                                                                   // GuildSiegePrize.cpp:17-20 (cda3af21)
      guild: [3000, 1500, 900, 360, 240], total: [1000, 500, 300, 200, 150, 120, 100, 70, 40, 20],
      perClass: [500, 250, 150, 100, 75, 60, 50, 35, 20, 10], mvp: [1500, 750, 450, 300, 225, 180, 150, 105, 60, 30],
    },
  };
  const ARRAYS = { guild: 's_nGuildPrize', total: 's_nClassPrize', perClass: 's_nClassPerClassPrize', mvp: 's_nMvpPrize' };

  // ---------------------------------------------------------------- Lua
  // Lua comments out (`--[[ … ]]` blocks, `--` to the end of the line), strings kept; same length (offsets stay).
  function stripLua(text) {
    let out = '', i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
        out += text.slice(i, j + 1); i = j + 1; continue;
      }
      if (c === '-' && text[i + 1] === '-') {
        let j;
        if (text[i + 2] === '[' && text[i + 3] === '[') { j = text.indexOf(']]', i + 4); j = j < 0 ? n : j + 2; }
        else { j = text.indexOf('\n', i); if (j < 0) j = n; }
        out += text.slice(i, j).replace(/[^\n]/g, ' '); i = j; continue;
      }
      out += c; i++;
    }
    return out;
  }
  // `name( a, "b, c", 3 )` -> [ 'a', 'b, c', 3 ]: strings unquoted, numbers as numbers
  function luaArgs(s) {
    const out = [];
    let cur = '', q = null;
    for (const c of s) {
      if (q) { if (c === q) q = null; else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; cur += '\u0000'; continue; }
      if (c === ',') { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map(a => {
      if (a.includes('\u0000')) return a.replace(/\u0000/g, '').replace(/^\s+|\s+$/g, '');
      const t = a.trim();
      return t === '' ? undefined : (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : t);
    });
  }
  const stamp = d => Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    + `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`);

  // -> { events: [{ name, times: [[start, end]], on }], gifts: [{ event, level, account, define, id, num, flag, minutes, line }] }
  function levelUp(file, defines, now) {
    const res = { events: [], gifts: [] };
    if (!file) return res;
    const text = stripLua(file.text);
    const nowN = stamp(now || new Date());
    const re = /\b(AddEvent|SetTime|SetLevelUpGift)\s*\(([^()]*)\)/g;
    let m, ev = null;
    while ((m = re.exec(text))) {
      const a = luaArgs(m[2]), line = text.slice(0, m.index).split('\n').length;
      if (m[1] === 'AddEvent') { ev = { name: String(a[0]), times: [], on: false, line }; res.events.push(ev); continue; }
      if (!ev) continue;                 // before any AddEvent: tEvent[0] is nil, the Lua call fails
      if (m[1] === 'SetTime') { ev.times.push([String(a[0]).replace(/\D/g, ''), String(a[1]).replace(/\D/g, '')].map(Number)); continue; }
      const def = String(a[2]);
      const id = defines.has(def) ? defines.get(def) >>> 0 : null;      // CScript::GetDefineNum
      res.gifts.push({ event: ev, level: Number(a[0]), account: String(a[1]), define: def, id,
        num: Math.trunc(Number(a[3]) || 0), flag: (Number(a[4]) || 0) & 0xFF, minutes: Math.trunc(Number(a[5]) || 0), line });
    }
    // GetEventState (EventFunc.lua:61): per time window, started -> on while before the end, off after it
    for (const e of res.events) for (const [s, t] of e.times) if (s <= nowN) e.on = t > nowN;
    return res;
  }
  // GetLevelUpGift (EventFunc.lua:455): "all" or the account name contains the text, the exact level, events that are on
  const giftsFor = (lu, level, account) => lu.gifts.filter(g => g.event.on && (g.account === 'all' || String(account).includes(g.account)) && g.level === level);

  // ---------------------------------------------------------------- 1Rebirth.inc
  // -> { max, rates: [{ exp, drop, penya, gp }], gifts: Map tier -> { id, num, define }, rejected: [{ tier, define, why }], dup: [...],
  //      extraRates (rows past Max: "RateChart" error), rows: every Gifts row in file order, maxSpan, ratesOpen, giftsOpen, giftsClose }
  // Spans ({ start, end } in the text) are for the edits (edit/rates-ops.js); the readers above them do not need them.
  function rebirth(file, defines, items) {
    const res = { max: 0, rates: [], gifts: new Map(), rejected: [], dup: [], extraRates: 0, rows: [], maxSpan: null, ratesOpen: null, giftsOpen: null, giftsClose: null };
    if (!file) return null;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'Max') { const n = s.getNumber(); res.max = u16(n.value); res.maxSpan = { start: n.start, end: n.end }; }
      else if (t === 'Rates') {
        s.getToken(); res.ratesOpen = { start: s.token.start, end: s.token.end };
        s.getToken();
        while (s.token.text[0] !== '}' && !s.eof) {
          if (res.rates.length <= res.max) {
            const r = { exp: FRE.lexer.atof(s.token.text), expSpan: { start: s.token.start, end: s.token.end }, start: s.token.start };
            r.drop = s.getFloat().value; r.penya = s.getFloat().value;
            const g = s.getNumber();
            r.gp = g.value; r.gpSpan = { start: g.start, end: g.end }; r.end = g.end;
            res.rates.push(r);
          } else res.extraRates++;       // one "RateChart" error per token past Max (Project.cpp:6100)
          s.getToken();
        }
      } else if (t === 'Gifts') {
        s.getToken(); res.giftsOpen = { start: s.token.start, end: s.token.end };
        s.getToken();
        while (s.token.text[0] !== '}' && !s.eof) {
          const tierTok = s.token;
          const tier = u16(FRE.lexer.atoi(s.token.text).value);
          const n = s.getNumber(), id = n.value >>> 0, c = s.getNumber(), num = u16(c.value);
          const define = n.define || String(id);
          const row = { tier, id, num, define, start: tierTok.start, end: c.end, tierSpan: { start: tierTok.start, end: tierTok.end },
            itemText: file.text.slice(n.start, n.end), itemSpan: { start: n.start, end: n.end }, numSpan: { start: c.start, end: c.end }, used: false };
          res.rows.push(row);
          if (tier <= res.max && items.has(id)) {
            if (res.gifts.has(tier)) { res.dup.push({ tier, define, id, num }); row.why = 'dup'; }
            else { res.gifts.set(tier, { id, num, define }); row.used = true; }
          } else { row.why = tier > res.max ? 'tier above Max' : 'not an item'; res.rejected.push({ tier, define, why: row.why }); }
          s.getToken();
        }
        if (s.token.text[0] === '}') res.giftsClose = { start: s.token.start, end: s.token.end };
      }
      s.getToken();
    }
    return res;
  }

  // ---------------------------------------------------------------- couple.inc
  // -> { exp: [total exp of level i + 1], items: [{ level, id, define, sex, flag, minutes, num }], bad: [{ level, define }] }
  function couple(file, defines) {
    if (!file) return null;
    const res = { exp: [], items: [], bad: [], kinds: 0 };
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    const block = fn => { s.getToken(); fn(); };
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'Level') block(() => {
        let n = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { res.exp.push(n.value); n = s.getNumber(); }   // __MAINSERVER: no ÷100
      });
      else if (t === 'Item') block(() => {
        let level = s.getNumber().value;
        while (s.token.text[0] !== '}' && !s.eof) {
          s.getToken();
          let it = s.getNumber();
          while (s.token.text[0] !== '}' && !s.eof) {
            const sex = s.getNumber().value, flag = s.getNumber().value, minutes = s.getNumber().value, num = s.getNumber().value;
            const row = { level, id: it.value >>> 0, define: it.define || String(it.value >>> 0), sex, flag, minutes, num };
            // GetItems( nLevel ) = m_vItems[nLevel - 1]: outside the Level ladder the server writes out of bounds
            if (level < 1 || level > res.exp.length) res.bad.push(row); else res.items.push(row);
            it = s.getNumber();
          }
          level = s.getNumber().value;
        }
      });
      else if (t === 'SkillKind') block(() => { let n = s.getNumber(); while (s.token.text[0] !== '}' && !s.eof) { res.kinds++; n = s.getNumber(); } });
      else if (t === 'SkillLevel') block(() => {
        let n = s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { for (let i = 0; i < res.kinds; i++) s.getNumber(); n = s.getNumber(); }
      });
      s.getToken();
    }
    return res;
  }
  // CCoupleProperty::GetLevel (couple.cpp:342): the first i whose total is above the exp; past the ladder: 1
  function coupleLevel(c, exp) {
    for (let i = 0; i < c.exp.length; i++) if (exp < c.exp[i]) return i;
    return 1;
  }

  // ---------------------------------------------------------------- expTable.inc
  // the highest level a character can have: IsMaxLevel( level ) = expCharacter[level + 1] EXP is 0 (or no row)
  function maxLevel(file) {
    if (!file) return null;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    let t;
    do { t = s.getToken(); } while (!s.eof && t.text !== 'expCharacter');
    if (s.eof) return null;
    s.getToken();
    const exp1 = [];
    let v = s.getToken();
    while (v.text[0] !== '}' && !s.eof) { exp1.push(v.text); s.getToken(); s.getNumber(); s.getToken(); v = s.getToken(); }
    // the level whose next row is missing or 0 (rows 0 and 1 are 0: a new character starts at level 1)
    for (let lv = 1; lv < exp1.length + 1; lv++) if (lv + 1 >= exp1.length || /^0*$/.test(exp1[lv + 1].replace(/^[+]/, '') || '0')) return lv;
    return exp1.length - 1;
  }

  // ---------------------------------------------------------------- Guild Siege
  // GuildCombat.txt: the last JOINPENYA / MINJOINGUILDSIZE / MAXJOINGUILDSIZE line wins (each is a plain assignment)
  function siegeConfig(file, defines) {
    const res = { joinPenya: 0, minGuild: 0, maxGuild: 0, found: false };
    if (!file) return null;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'JOINPENYA') { res.joinPenya = s.getNumber().value; res.found = true; }
      else if (t === 'MINJOINGUILDSIZE') res.minGuild = s.getNumber().value;
      else if (t === 'MAXJOINGUILDSIZE') res.maxGuild = s.getNumber().value;
      s.getToken();
    }
    return res;
  }
  // The compiled amounts: from the C++ text when given ({ 'eveschool.cpp': text, 'guildsiegeprize.cpp': text }), else BUILTIN.
  // -> { siege: { factors, shares }, weekly: { guild, total, perClass, mvp }, from: 'cpp' | 'builtin', changed: [what was not found] }
  function compiled(cpp) {
    const res = { siege: JSON.parse(JSON.stringify(BUILTIN.siege)), weekly: JSON.parse(JSON.stringify(BUILTIN.weekly)), from: 'builtin', changed: [] };
    if (!cpp) return res;
    const ev = cpp.get ? cpp.get('eveschool.cpp') : cpp['eveschool.cpp'], gp = cpp.get ? cpp.get('guildsiegeprize.cpp') : cpp['guildsiegeprize.cpp'];
    if (!ev && !gp) return res;
    res.from = 'cpp';
    if (ev) {
      const f = /float\s+fChipNum\s*=\s*m_nJoinPanya\s*\*\s*vecGCRanking\.size\(\)\s*\*\s*([\d.]+)f\s*\*\s*([\d.]+)f\s*\*\s*([\d.]+)f\s*;/.exec(ev);
      if (f) res.siege.factors = [f[1], f[2], f[3]].map(Number); else res.changed.push('eveschool.cpp: the Red Chip formula (fChipNum)');
      const sh = [0, 1, 2].map(i => new RegExp(`case\\s+${i}\\s*:[^\\n]*\\r?\\n\\s*fChipNum\\s*\\*=\\s*([\\d.]+)f`).exec(ev));
      if (sh.every(Boolean)) res.siege.shares = sh.map(x => Number(x[1])); else res.changed.push('eveschool.cpp: the rank 1-3 shares (fChipNum *=)');
      if (!/if\(\s*i\s*>=\s*3\s*\)\s*break;/.test(ev)) res.changed.push('eveschool.cpp: "only the top 3 guilds" (i >= 3)');
    } else res.changed.push('eveschool.cpp not found');
    if (gp) {
      for (const [k, name] of Object.entries(ARRAYS)) {
        const m = new RegExp(`${name}\\[\\s*\\d+\\s*\\]\\s*=\\s*\\{([^}]*)\\}`).exec(gp);
        if (m) res.weekly[k] = m[1].split(',').map(x => Number(x.trim())).filter(x => !Number.isNaN(x));
        else res.changed.push(`GuildSiegePrize.cpp: ${name}`);
      }
      if (!/nRank\s*<\s*5\s*&&\s*!vecGuild\.empty\(\)/.test(gp)) res.changed.push('GuildSiegePrize.cpp: the top 5 guilds');
      if (!/LogPlayerBoard\(\s*pQuery,\s*vecByPoint,\s*10,/.test(gp)) res.changed.push('GuildSiegePrize.cpp: the top 10 players');
    } else res.changed.push('GuildSiegePrize.cpp not found');
    return res;
  }
  // GuildCombatResultRanking (eveschool.cpp:1702-1715): chips for the guild at rank i (0-2) when n guilds applied.
  // m_nJoinPanya (int) × size() (unsigned) -> unsigned, then float × 0.9f × 0.00001f × 0.1f × share, (int), at least 1.
  function siegeChips(joinPenya, n, rank, comp) {
    const f32 = Math.fround, { factors, shares } = (comp || BUILTIN).siege;
    let x = f32(Math.imul(joinPenya | 0, n | 0) >>> 0);
    for (const k of factors) x = f32(x * f32(k));
    x = f32(x * f32(shares[rank]));
    const v = x >= 2147483648 || Number.isNaN(x) ? -2147483648 : Math.trunc(x);
    return v < 1 ? 1 : v;
  }

  // ---------------------------------------------------------------- one workspace
  // -> { levelUp, rebirth, couple, maxLevel, siege: { config, comp } } (null parts: the file is not there)
  function fromWorkspace(ws) {
    const f = n => ws.files.get(n);
    const D = ws.defines.defines;
    return {
      levelUp: f('event.lua') ? levelUp(f('event.lua'), D, ws.now ? ws.now() : new Date()) : null,
      rebirth: rebirth(f('1rebirth.inc'), D, ws.items.items),
      couple: couple(f('couple.inc'), D),
      maxLevel: maxLevel(f('exptable.inc')),
      siege: f('guildcombat.txt') ? { config: siegeConfig(f('guildcombat.txt'), D), comp: compiled(ws.cpp || null) } : null,
    };
  }

  FRE.gifts = { levelUp, giftsFor, rebirth, couple, coupleLevel, maxLevel, siegeConfig, compiled, siegeChips, fromWorkspace,
    stripLua, luaArgs, BUILTIN, MAX_COUPLE_LEVEL, FLAG_BOUND };
})(globalThis.FRE = globalThis.FRE || {});
