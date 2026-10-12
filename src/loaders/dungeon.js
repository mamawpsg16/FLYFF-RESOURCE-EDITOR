// Party dungeons: PartyDungeon.lua (time limit, cooldown, levels, classes, kill-all, the SetMonster list).
//   The file is real Lua, run by the WorldServer at start: CInstanceDungeonParty::LoadScript (Project.cpp:908)
//   -> CInstanceDungeonBase::LoadScript (_Common/InstanceDungeonBase.cpp:384). It first runs LuaFunc/InstanceDungeonBase.lua,
//   whose AddDungeon sets the defaults: dwClass 65535, levels 1-120, dwCoolTime MIN(30), nKillAll 0, dwDungeonTime MIN(30)
//   (__DUNGEON_INFO, V19 214324ad / f078fc52). A dungeon without SetDungeonTime gets 30 minutes, not "no limit"; 0 = no limit.
//   MIN( a ) = a * 60000 ms, SEC( a ) = a * 1000 ms. Set* functions write into the LAST AddDungeon (#tDungeon).
//   LoadScript: the world id from the define name (GetDefineNum), the numbers cast from Lua doubles (static_cast<int> / <DWORD>:
//   truncation), nKillAll != 0, m_mapDungeonData.insert: a second AddDungeon of the same world keeps the FIRST one's settings,
//   but its SetMonster lines are added to the first one's list (the iterator points at the existing entry).
// Map monsters (kill-all, and the drop list of the Dungeon task): the world's region respawns, World/<map>/<map>.rgn
//   (CWorld::LoadRespawn, _Common/WorldFile.cpp:550: respawnN dwType dwIndex x y z nMaxcb ...; OT_MOVER only; RANK_MATERIAL is
//   never added, WorldFile.cpp:601), counted the way BuildKillAll does (InstanceDungeonBase.cpp:1154: max( m_nMaxcb, m_cb ), m_cb = 0
//   at load). Not modelled: the guard skip (no guard stands in a dungeon), RI_ records of other types.
// Only this Lua subset is read: AddDungeon / Set* calls whose values are numbers, strings, true / false, the CLASS_ / ID_ names,
// MIN( ) / SEC( ) and + - * /; -- and --[[ ]] comments. Anything else is reported (DG_SYNTAX) and that value is left unknown.
(function (FRE) {
  'use strict';
  const FILE = 'PartyDungeon.lua';
  const CONST = { CLASS_NORMAL: 1, CLASS_MASTER: 2, CLASS_HERO: 4, CLASS_LEGEND_HERO: 8, ID_NORMAL: 0, ID_MIDBOSS: 1, ID_BOSS: 2 };
  const DEFAULTS = { dwClass: 65535, nMinLevel: 1, nMaxLevel: 120, dwCoolTime: 30 * 60000, nKillAll: 0, dwDungeonTime: 30 * 60000 };
  const STMTS = ['SetClass', 'SetLevel', 'SetCoolTime', 'SetDungeonTime', 'SetKillAll', 'SetMonster', 'SetTeleportPos'];
  // the order new lines are written in (the order of the header comment and of every block in the file)
  const ORDER = ['SetClass', 'SetLevel', 'SetCoolTime', 'SetDungeonTime', 'SetKillAll'];

  // Lua tokens: { t: 'name' | 'num' | 'str' | 'op', v, start, end }. Comments are skipped.
  function tokenize(text) {
    const out = [];
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      if (c === '-' && text[i + 1] === '-') {
        const m = /^--\[(=*)\[/.exec(text.slice(i, i + 40));
        if (m) {
          const close = ']' + m[1] + ']';
          const e = text.indexOf(close, i + m[0].length);
          i = e < 0 ? n : e + close.length;
        } else {
          while (i < n && text[i] !== '\n') i++;
        }
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
        out.push({ t: 'name', v: text.slice(i, j), start: i, end: j }); i = j; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] || ''))) {
        const m = /^(0[xX][0-9A-Fa-f]+|[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i, i + 64));
        out.push({ t: 'num', v: Number(m[0]), start: i, end: i + m[0].length }); i += m[0].length; continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
        out.push({ t: 'str', v: text.slice(i + 1, j), start: i, end: Math.min(j + 1, n) }); i = j + 1; continue;
      }
      out.push({ t: 'op', v: c, start: i, end: i + 1 }); i++;
    }
    return out;
  }

  // An expression from tokens[k] -> { value (number | string | boolean | null = not understood), end index, start, endPos }
  function expr(toks, k) {
    const start = toks[k] ? toks[k].start : 0;
    let r = term(toks, k);
    while (r.ok && toks[r.k] && toks[r.k].t === 'op' && (toks[r.k].v === '+' || toks[r.k].v === '-')) {
      const op = toks[r.k].v, b = term(toks, r.k + 1);
      if (!b.ok) return { ok: false, k: b.k };
      r = { ok: true, k: b.k, value: typeof r.value === 'number' && typeof b.value === 'number' ? (op === '+' ? r.value + b.value : r.value - b.value) : null };
    }
    return Object.assign(r, { start, endPos: toks[r.k - 1] ? toks[r.k - 1].end : start });
  }
  function term(toks, k) {
    let r = unary(toks, k);
    while (r.ok && toks[r.k] && toks[r.k].t === 'op' && (toks[r.k].v === '*' || toks[r.k].v === '/')) {
      const op = toks[r.k].v, b = unary(toks, r.k + 1);
      if (!b.ok) return { ok: false, k: b.k };
      r = { ok: true, k: b.k, value: typeof r.value === 'number' && typeof b.value === 'number' ? (op === '*' ? r.value * b.value : r.value / b.value) : null };
    }
    return r;
  }
  function unary(toks, k) {
    const t = toks[k];
    if (!t) return { ok: false, k };
    if (t.t === 'op' && t.v === '-') { const r = unary(toks, k + 1); return r.ok ? { ok: true, k: r.k, value: typeof r.value === 'number' ? -r.value : null } : r; }
    if (t.t === 'op' && t.v === '(') {
      const r = expr(toks, k + 1);
      if (!r.ok || !toks[r.k] || toks[r.k].v !== ')') return { ok: false, k: r.k };
      return { ok: true, k: r.k + 1, value: r.value };
    }
    if (t.t === 'num') return { ok: true, k: k + 1, value: t.v };
    if (t.t === 'str') return { ok: true, k: k + 1, value: t.v };
    if (t.t === 'name') {
      if (t.v === 'true') return { ok: true, k: k + 1, value: true };
      if (t.v === 'false' || t.v === 'nil') return { ok: true, k: k + 1, value: t.v === 'false' ? false : null };
      if ((t.v === 'MIN' || t.v === 'SEC') && toks[k + 1] && toks[k + 1].v === '(') {
        const r = expr(toks, k + 2);
        if (!r.ok || !toks[r.k] || toks[r.k].v !== ')') return { ok: false, k: r.k };
        return { ok: true, k: r.k + 1, value: typeof r.value === 'number' ? r.value * (t.v === 'MIN' ? 60000 : 1000) : null };
      }
      if (t.v in CONST) return { ok: true, k: k + 1, value: CONST[t.v] };
      return { ok: true, k: k + 1, value: null, unknown: t.v };
    }
    return { ok: false, k };
  }

  // C casts of a Lua number: static_cast<int> / <DWORD> truncate toward zero
  const toInt = v => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) | 0 : 0);
  const toDword = v => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) >>> 0 : 0);

  // PartyDungeon.lua -> { dungeons: [ { world, at, stmts: { SetLevel: { start, end, args: [{ value, start, end }] }, … }, monsters,
  //   values (after the defaults) } ], diags, eol }
  function loadDungeons(file, opts = {}) {
    const text = file ? file.text : '';
    const toks = tokenize(text);
    const diags = [];
    const dungeons = [];
    let k = 0;
    while (k < toks.length) {
      const t = toks[k];
      if (t.t === 'name' && (t.v === 'AddDungeon' || STMTS.includes(t.v)) && toks[k + 1] && toks[k + 1].v === '(') {
        const args = [];
        let j = k + 2, bad = false;
        if (toks[j] && toks[j].v === ')') j++;
        else for (;;) {
          const r = expr(toks, j);
          if (!r.ok) { bad = true; break; }
          args.push({ value: r.value, unknown: r.unknown || null, start: r.start, end: r.endPos });
          j = r.k;
          if (toks[j] && toks[j].v === ',') { j++; continue; }
          if (toks[j] && toks[j].v === ')') { j++; break; }
          bad = true; break;
        }
        const stmt = { name: t.v, start: t.start, end: toks[j - 1] ? toks[j - 1].end : t.end, args };
        if (bad) {
          diags.push({ code: 'DG_SYNTAX', severity: 'WARN', start: t.start, end: stmt.end, key: `DG_SYNTAX|${t.v}|${dungeons.length}`,
            message: `${t.v}( … ): this line is not plain numbers, names and MIN( ) / SEC( ). The editor leaves it alone; check it by hand` });
          while (j < toks.length && toks[j].v !== ')') j++;
          k = j + 1; continue;
        }
        if (t.v === 'AddDungeon') {
          const w = args[0] && typeof args[0].value === 'string' ? args[0].value : null;
          dungeons.push({ world: w, worldArg: args[0] || null, at: stmt, stmts: {}, monsters: [], index: dungeons.length });
        } else if (!dungeons.length) {
          diags.push({ code: 'DG_NO_DUNGEON', severity: 'WARN', start: t.start, end: stmt.end, key: `DG_NO_DUNGEON|${t.v}`,
            message: `${t.v} comes before any AddDungeon: the Lua stops with an error (tDungeon[0] is nil) and the WorldServer quits at start` });
        } else {
          const d = dungeons[dungeons.length - 1];
          if (t.v === 'SetMonster') d.monsters.push({ type: toInt(args[0] && args[0].value), define: args[1] && typeof args[1].value === 'string' ? args[1].value : null,
            red: !!(args[2] && args[2].value), stmt });
          else if (t.v === 'SetTeleportPos') { /* positions: not edited */ }
          else { if (d.stmts[t.v]) d.stmts[t.v].dup = (d.stmts[t.v].dup || 0) + 1; d.stmts[t.v] = stmt; }   // the last call wins (it overwrites the field)
        }
        k = j; continue;
      }
      k++;
    }
    const defines = opts.defines || new Map();
    for (const d of dungeons) {
      const v = Object.assign({}, DEFAULTS);
      const num = (s, i) => (s && s.args[i] && typeof s.args[i].value === 'number' ? s.args[i].value : (s && s.args[i] ? NaN : undefined));
      const s = d.stmts;
      if (s.SetClass) v.dwClass = s.SetClass.args.reduce((a, x) => a + (typeof x.value === 'number' ? x.value : NaN), 0);
      if (s.SetLevel) { v.nMinLevel = num(s.SetLevel, 0); v.nMaxLevel = num(s.SetLevel, 1); }
      if (s.SetCoolTime) v.dwCoolTime = num(s.SetCoolTime, 0);
      if (s.SetDungeonTime) v.dwDungeonTime = num(s.SetDungeonTime, 0);
      if (s.SetKillAll) v.nKillAll = num(s.SetKillAll, 0);
      d.lua = v;
      d.worldId = d.world && defines.has(d.world) ? defines.get(d.world) : null;
      for (const m of d.monsters) m.id = m.define && defines.has(m.define) ? defines.get(m.define) : null;
      // what LoadScript keeps
      d.server = { dwClass: toDword(v.dwClass), nMinLevel: toInt(v.nMinLevel), nMaxLevel: toInt(v.nMaxLevel), dwCoolTime: toDword(v.dwCoolTime),
        dwDungeonTime: toDword(v.dwDungeonTime), bKillAll: toDword(v.nKillAll) !== 0 && v.nKillAll !== 0 };
    }
    return { file: FILE, dungeons, diags, eol: /\r\n/.test(text) ? '\r\n' : '\n' };
  }

  // LoadScript's map: world id -> { first dungeon, its settings, every SetMonster of every block with that world }
  function serverMap(model) {
    const map = new Map();
    for (const d of model.dungeons) {
      const id = d.worldId === null ? 0 : d.worldId;          // GetDefineNum of an unknown name = -1 in CScript, 0 when cast? see DG_WORLD
      if (!map.has(id)) map.set(id, { first: d, data: Object.assign({}, d.server), monsters: [], blocks: [] });
      const e = map.get(id);
      e.blocks.push(d);
      e.monsters.push(...d.monsters);
    }
    return map;
  }

  // The map monsters of a world's .rgn (CWorld::LoadRespawn), counted like BuildKillAll: [{ id, count }] in first-seen order
  function regionMonsters(rgnFile, opts) {
    if (!rgnFile) return null;
    const defines = opts.defines, movers = opts.movers || new Map();
    const s = new FRE.lexer.Script(rgnFile.text, { defines, strings: opts.strings || new Map(), diags: [] });
    const OT_MOVER = defines.get('OT_MOVER'), MATERIAL = defines.get('RANK_MATERIAL');
    const out = [];
    for (let t = s.getToken(); t.type !== 'eof'; t = s.getToken()) {
      if (!/^respawn[2-7]?$/.test(t.text)) continue;
      const type = s.getNumber().value >>> 0;
      const index = s.getNumber().value >>> 0;
      s.getFloat(); s.getFloat(); s.getFloat();
      const maxcb = s.getNumber().value | 0;
      if (type !== OT_MOVER) continue;
      const mv = movers.get(index);
      if (!mv) continue;                                  // !prj.GetMoverProp: not added
      if (MATERIAL !== undefined && mv.rankId === MATERIAL) continue;
      if (maxcb <= 0) continue;
      const have = out.find(x => x.id === index);
      if (have) have.count += maxcb; else out.push({ id: index, count: maxcb });
    }
    return out;
  }

  // Every monster of a dungeon, merged: SetMonster ones (boss / mid-boss / normal) first, then the map monsters. For the drop list.
  function monstersOf(d, entry, rgn) {
    const out = [];
    const add = (id, role, n) => {
      if (id === null || id === undefined) return;
      const have = out.find(x => x.id === id);
      if (have) { if (!have.roles.includes(role)) have.roles.push(role); have.count += n; } else out.push({ id, roles: [role], count: n });
    };
    const ROLE = ['normal', 'mid-boss', 'boss'];
    for (const m of (entry ? entry.monsters : d.monsters).slice().sort((a, b) => b.type - a.type)) add(m.id, ROLE[m.type] || 'normal', 1);
    for (const r of rgn || []) add(r.id, 'map', r.count);
    return out;
  }

  function validateDungeons(model, opts = {}) {
    const out = model.diags.map(d => Object.assign({ file: FILE }, d));
    const defines = opts.defines || new Map(), movers = opts.movers || new Map();
    const seen = new Map();
    const push = (d, code, sev, span, msg) => out.push({ code, severity: sev, file: FILE, start: span.start, end: span.end, key: `${code}|${d.world}|${d.index}`, message: msg });
    for (const d of model.dungeons) {
      const who = d.world || `dungeon ${d.index + 1}`;
      if (d.worldId === null) push(d, 'DG_WORLD', 'BLOCK', d.at, `${who}: "${d.world}" is not a world in defineWorld.h. The server reads it as an unknown world: nobody can enter it`);
      else if (seen.has(d.worldId)) push(d, 'DG_DUP', 'WARN', d.at, `${who} is added twice. The server keeps the first block's settings and adds this block's monsters to it`);
      else seen.set(d.worldId, d);
      const v = d.server;
      if (d.stmts.SetLevel && d.lua.nMinLevel > d.lua.nMaxLevel) push(d, 'DG_LEVEL', 'BLOCK', d.stmts.SetLevel, `${who}: the lowest level ${d.lua.nMinLevel} is above the highest ${d.lua.nMaxLevel}: nobody can enter`);
      if (!(v.dwClass & 15)) push(d, 'DG_CLASS', 'BLOCK', d.stmts.SetClass || d.at, `${who}: no class can enter (SetClass has none of CLASS_NORMAL / MASTER / HERO / LEGEND_HERO)`);
      for (const [name, s] of Object.entries(d.stmts)) if (s.dup) push(d, 'DG_TWICE', 'INFO', s, `${who}: ${name} is called ${s.dup + 1} times; the last one wins`);
      if (d.stmts.SetDungeonTime && d.lua.dwDungeonTime > 0 && d.lua.dwDungeonTime < 5 * 60000) push(d, 'DG_SHORT', 'WARN', d.stmts.SetDungeonTime, `${who}: a time limit under 5 minutes; everyone is sent out when it runs out`);
      for (const m of d.monsters) {
        if (m.id === null) push(d, 'DG_MONSTER', 'BLOCK', m.stmt, `${who}: SetMonster "${m.define}" is not a monster in defineObj.h. The server logs "Invalid Monster!" and that monster never appears`);
        else if (!movers.has(m.id)) push(d, 'DG_MONSTER', 'BLOCK', m.stmt, `${who}: ${m.define} has no row in propMover.txt. The server logs "Invalid Monster!"`);
      }
      for (const [name, s] of Object.entries(d.stmts)) for (const a of s.args) if (a.unknown && !(a.unknown in CONST)) push(d, 'DG_NAME', 'WARN', s, `${who}: ${name} uses "${a.unknown}", which Lua does not know (nil): the value is lost`);
    }
    return out;
  }

  FRE.dungeon = { FILE, CONST, DEFAULTS, ORDER, tokenize, loadDungeons, serverMap, regionMonsters, monstersOf, validateDungeons, toInt, toDword };
})(globalThis.FRE = globalThis.FRE || {});
