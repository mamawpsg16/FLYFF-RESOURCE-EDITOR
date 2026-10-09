// Upgrade Rates (task K): the upgrade chance tables, read the way the server reads them, with the offsets the edits need. No DOM.
//   ItemUpgrade.lua   real Lua run by CItemUpgrade::LoadScript (WORLDSERVER/ItemUpgrade.cpp:56-122; the constructor :31, WorldServer
//                     only). Globals read after the run: tSuitProb, tWeaponProb (piercing: slot n = key n, GetSizeProb :309), tGeneral
//                     (normal +N: key = level + 1, GetGeneralEnchantProb :1285), tAttribute (filled by AddAttribute( n, prob, dmg, def,
//                     addAtk ): element +N, GetAttributeEnchantProb :1911), nItemTransyLowLevel / HighLevel (:118). Every value goes
//                     through static_cast<int>( lua_tonumber ): decimals are cut. A script that fails to run (RunScript != 0, :59) only
//                     logs "ItemUpgrade.lua Run Failed": the tables stay empty, and GetMax…EnchantSize() = 0 refuses every upgrade.
//                     5208bb88 / 0cdedeec: the rounds of in-game tuning (each old value kept in a comment).
//   s.txt             CProject::LoadServerScript (Project.cpp:5684, WorldServer :994): Accessory_Probability fills
//                     m_adwProbability[MAX_AAO = 20] with no bound check (accessory.h:27; a 21st row writes past the table),
//                     Collecting_Enchant one int per collector level (out of 1,000; GetMaxCollectorLevel = the row count, collecting.h:27).
//                     The game reads its own LF copy (Client/s.txt) for the Collector Details window: only the collecting blocks
//                     (LoadCollectingInfo, Project.cpp:5785; 15091d5f).
//   Ultimate_UltimateWeapon.txt  CUltimateWeapon::Load_UltimateWeapon (_Common/UltimateWeapon.cpp:116, #ifdef __WORLDSERVER), a bare
//                     CScanner: SET_GEM, REMOVE_GEM, GENERAL2UNIQUE, UNIQUE2ULTIMATE (one number each, out of 1,000,000), MAKE_GEM
//                     { level gProb gNum uProb uNum }, ULTIMATE_ENCHANT { level prob }; both maps keep the FIRST row of a level
//                     (map::insert). A weapon's own dwReferTarget2 replaces the transform chance (:591).
//   WeaponRarity.inc  CProject::LoadWeaponRarity (Project.cpp:494, both the WorldServer and the game: Project.cpp:971), a CScript:
//                     Add_Weapon_Rarity { nRarityLevel = n; szName = "…"; dwColor = 0x…; nStatsPctBonus = n; nStatsFlatBonus = n; }
//                     (one struct reused: a field a block leaves out keeps the block above's value), then Drop { level luck … } with
//                     exactly as many pairs as blocks before it; the lucks must add up to 100 (else Error, :576). 3168003d.
// Not modelled: Baruna.lua (the user left Baruna out, 2026-10-09); PiercingSize.txt (nothing loads it).
(function (FRE) {
  'use strict';
  const MAX_AAO = 20;                                   // accessory.h:4
  const span = r => ({ start: r.start, end: r.end, value: r.value });

  // ---------------------------------------------------------------- ItemUpgrade.lua
  const LUA_KNOWN = new Set('print tonumber tostring pairs ipairs type math string table'.split(' '));
  const LUA_KEYWORDS = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
  const luaNum = t => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) ? Number(t) : NaN;

  // -> { tables: { name: { open, close, items: [{ value, start, end }] } }, numbers: { name: span }, attr: [{ args, stmt }],
  //      fns: Set, errors: [{ start, end, message }], failed }
  function loadLua(file) {
    const res = { file: file ? file.name : 'ItemUpgrade.lua', tables: {}, numbers: {}, attr: [], fns: new Set(), errors: [], failed: false, missing: !file };
    if (!file) return res;
    const text = file.text;
    const bl = FRE.rates.blankLua(text), bt = bl.text;
    for (const b of bl.bad) res.errors.push({ start: b.start, end: b.end, message: `ItemUpgrade.lua has ${b.what}` });
    // brackets
    const stack = [], PAIR = { ')': '(', ']': '[', '}': '{' };
    for (let i = 0; i < bt.length; i++) {
      const c = bt[i];
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (PAIR[c]) {
        if (!stack.length || bt[stack[stack.length - 1]] !== PAIR[c]) { res.errors.push({ start: i, end: i + 1, message: `ItemUpgrade.lua has a "${c}" with nothing to close` }); break; }
        stack.pop();
      }
    }
    if (stack.length) { const i = stack[stack.length - 1]; res.errors.push({ start: i, end: i + 1, message: `ItemUpgrade.lua has a "${bt[i]}" that is never closed` }); }
    // function blocks: function NAME( … ) … end (blocks: function / if / do open, end closes)
    const fnSpans = [];
    const reFn = /\bfunction\s+([A-Za-z_]\w*)\s*\(/g;
    let m;
    while ((m = reFn.exec(bt))) {
      let depth = 0, end = -1;
      const reKw = /\b(function|if|do|end)\b/g;
      reKw.lastIndex = m.index;
      let k;
      while ((k = reKw.exec(bt))) {
        if (k[1] === 'end') { depth--; if (!depth) { end = k.index + 3; break; } } else depth++;
      }
      if (end < 0) { res.errors.push({ start: m.index, end: m.index + m[0].length, message: `function ${m[1]} has no closing "end"` }); end = bt.length; }
      fnSpans.push({ name: m[1], start: m.index, end });
      reFn.lastIndex = end;
    }
    const inFn = i => fnSpans.some(f => i >= f.start && i < f.end);
    // top-level statements: NAME = { … } / NAME = number / NAME = {} and calls NAME( … ); in file order (a call before its function fails)
    const defined = new Set();
    const reSt = /\b([A-Za-z_]\w*)\s*(=\s*(\{[^{}]*\}|[^\s;]+)|\(((?:[^()]|\([^()]*\))*)\))/g;
    let fi = 0;
    while ((m = reSt.exec(bt))) {
      while (fi < fnSpans.length && fnSpans[fi].end <= m.index) { defined.add(fnSpans[fi].name); fi++; }
      if (inFn(m.index)) { const f = fnSpans.find(x => m.index >= x.start && m.index < x.end); reSt.lastIndex = f.end; continue; }
      const name = m[1];
      if (LUA_KEYWORDS.has(name)) { reSt.lastIndex = m.index + name.length; continue; }
      const before = bt.slice(Math.max(0, m.index - 1), m.index);
      if (before === '.' || before === ':') continue;
      if (m[2].startsWith('=')) {
        if (bt[m.index + m[0].indexOf('=') + 1] === '=') continue;          // ==
        const valStart = m.index + m[0].indexOf(m[3]);
        const v = m[3];
        if (v.startsWith('{')) {
          const items = [];
          const inner = bt.slice(valStart + 1, valStart + v.length - 1);
          const reN = /[^,;\s]+/g;
          let n;
          while ((n = reN.exec(inner))) {
            const s = valStart + 1 + n.index, t = text.slice(s, s + n[0].length), val = luaNum(t);
            if (!Number.isFinite(val)) res.errors.push({ start: s, end: s + n[0].length, message: `${name} holds "${t}", not a number: the server reads it as 0`, warn: true });
            items.push({ value: Number.isFinite(val) ? Math.trunc(val) : 0, raw: t, start: s, end: s + n[0].length });
          }
          res.tables[name] = { open: { start: valStart, end: valStart + 1 }, close: { start: valStart + v.length - 1, end: valStart + v.length }, items, stmt: { start: m.index, end: valStart + v.length } };
        } else {
          const t = text.slice(valStart, valStart + v.length), val = luaNum(t);
          res.numbers[name] = { value: Number.isFinite(val) ? Math.trunc(val) : NaN, raw: t, start: valStart, end: valStart + v.length, stmt: { start: m.index, end: valStart + v.length } };
        }
        continue;
      }
      // a call
      const open = m.index + m[0].indexOf('(') + 1, close = m.index + m[0].length - 1;
      if (!defined.has(name) && !LUA_KNOWN.has(name)) {
        res.errors.push({ start: m.index, end: m.index + m[0].length, message: fnSpans.some(f => f.name === name)
          ? `${name}() is called before "function ${name}" is defined (Lua: attempt to call a nil value)`
          : `ItemUpgrade.lua calls ${name}(), which nothing defines (Lua: attempt to call a nil value)` });
        continue;
      }
      if (name === 'AddAttribute') {
        const args = FRE.rates.argSpans(text, open, close).map(a => ({ value: Math.trunc(luaNum(a.text)), raw: a.text, start: a.start, end: a.end }));
        res.attr.push({ args, stmt: { start: m.index, end: m.index + m[0].length } });
        if (args.length !== 5 || args.some(a => !Number.isFinite(a.value))) res.errors.push({ start: m.index, end: m.index + m[0].length, message: 'AddAttribute( level, chance, damage, defense, attribute ) needs 5 numbers', warn: true });
      }
    }
    if (res.attr.length && !(res.tables.tAttribute && res.tables.tAttribute.stmt.start < res.attr[0].stmt.start))
      res.errors.push({ start: res.attr[0].stmt.start, end: res.attr[0].stmt.end, message: 'AddAttribute runs before "tAttribute = {}" (Lua: attempt to index a nil value)' });
    res.failed = res.errors.some(e => !e.warn);
    for (const f of fnSpans) res.fns.add(f.name);
    return res;
  }

  // the tables as the server holds them after the run (lua_next order does not matter: maps by key)
  function luaTables(L) {
    if (L.failed) return { general: [], suit: [], weapon: [], attr: [], transy: { low: 1000000, high: 2000000 } };
    const t = n => (L.tables[n] ? L.tables[n].items : []);
    // tAttribute[n] = …: a level written twice keeps the LAST call (a Lua table, not a map::insert)
    const byLevel = new Map();
    for (const a of L.attr) if (a.args.length >= 2) byLevel.set(a.args[0].value, a);
    const attr = [...byLevel.keys()].sort((a, b) => a - b).map(k => ({ level: k, call: byLevel.get(k) }));
    const num = (n, d) => (L.numbers[n] && Number.isFinite(L.numbers[n].value) ? L.numbers[n].value : d);
    return { general: t('tGeneral'), suit: t('tSuitProb'), weapon: t('tWeaponProb'), attr,
      // GetGlobalNumber of a missing global = lua_tonumber( nil ) = 0
      transy: { low: L.numbers.nItemTransyLowLevel ? num('nItemTransyLowLevel', 0) : 0, high: L.numbers.nItemTransyHighLevel ? num('nItemTransyHighLevel', 0) : 0 } };
  }

  // ---------------------------------------------------------------- s.txt
  function loadS(file, defines) {
    const res = { file: file ? file.name : 's.txt', acc: [], accBlock: null, coll: [], collBlock: null, missing: !file };
    if (!file) return res;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    const block = into => {
      const open = s.getToken();
      let n = s.getNumber();
      while (s.token.text[0] !== '}' && !s.eof) { into.push(span(n)); n = s.getNumber(); }
      return { open: { start: open.start, end: open.end }, close: s.token.text[0] === '}' ? { start: s.token.start, end: s.token.end } : null };
    };
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'Accessory_Probability') res.accBlock = block(res.acc);
      else if (t === 'Collecting_Enchant') res.collBlock = block(res.coll);
      s.getToken();
    }
    return res;
  }

  // ---------------------------------------------------------------- Ultimate_UltimateWeapon.txt (bare CScanner: no defines)
  function loadUltimate(file) {
    const res = { file: file ? file.name : 'Ultimate_UltimateWeapon.txt', single: {}, makeGem: [], makeBlock: null, enchant: [], enchantBlock: null, missing: !file };
    if (!file) return res;
    const s = new FRE.lexer.Script(file.text, { file: file.name, diags: [] });
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (['SET_GEM', 'REMOVE_GEM', 'GENERAL2UNIQUE', 'UNIQUE2ULTIMATE'].includes(t)) res.single[t] = { ...span(s.getNumber()), key: t };
      else if (t === 'MAKE_GEM' || t === 'ULTIMATE_ENCHANT') {
        const open = s.getToken();
        let tok = s.getToken();
        while (tok.text[0] !== '}' && !s.eof) {
          const lv = { value: FRE.lexer.atoi(tok.text).value, start: tok.start, end: tok.end };
          if (t === 'MAKE_GEM') {
            const gp = s.getNumber(), gn = s.getNumber(), up = s.getNumber(), un = s.getNumber();
            res.makeGem.push({ level: lv, gProb: span(gp), gNum: span(gn), uProb: span(up), uNum: span(un), start: lv.start, end: un.end });
          } else {
            const p = s.getNumber();
            res.enchant.push({ level: lv, prob: span(p), start: lv.start, end: p.end });
          }
          tok = s.getToken();
        }
        const blk = { open: { start: open.start, end: open.end }, close: tok.text[0] === '}' ? { start: tok.start, end: tok.end } : null };
        if (t === 'MAKE_GEM') res.makeBlock = blk; else res.enchantBlock = blk;
      }
      s.getToken();
    }
    return res;
  }
  // map::insert keeps the first row of a level
  function firstByLevel(rows) {
    const m = new Map();
    for (const r of rows) if (!m.has(r.level.value)) m.set(r.level.value, r);
    return m;
  }

  // ---------------------------------------------------------------- WeaponRarity.inc
  function loadRarity(file, defines) {
    const res = { file: file ? file.name : 'WeaponRarity.inc', blocks: [], tiers: new Map(), high: 0, drop: [], dropBlock: null, dropTotal: 0, dropErrors: [], missing: !file };
    if (!file) return res;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines, diags: [] });
    const cur = { level: 0, name: null, color: 0, pct: 0, flat: 0, luck: 0 };   // ZeroMemory once, then reused
    s.getToken();
    while (!s.eof) {
      const t = s.token.text;
      if (t === 'Add_Weapon_Rarity') {
        const open = s.getToken();
        const blk = { start: open.start, open: { start: open.start, end: open.end }, close: null, spans: {} };
        let tok = s.token;
        while (tok.text !== '}' && !s.eof) {
          const f = tok.text;
          if (f === 'nRarityLevel' || f === 'nStatsPctBonus' || f === 'nStatsFlatBonus' || f === 'dwColor') {
            s.getToken();                                      // =
            const n = s.getNumber();
            const key = { nRarityLevel: 'level', nStatsPctBonus: 'pct', nStatsFlatBonus: 'flat', dwColor: 'color' }[f];
            cur[key] = f === 'dwColor' ? n.value >>> 0 : n.value;
            blk.spans[key] = { start: n.start, end: n.end, value: cur[key], hex: f === 'dwColor' };
            if (key === 'level' && cur.level > res.high) res.high = cur.level;
            s.getToken();                                      // ;
          } else if (f === 'szName') {
            s.getToken();                                      // =
            const n = s.getToken();
            cur.name = n.text;
            blk.spans.name = { start: n.start, end: n.end, value: n.text, quoted: n.type === 'string' };
            s.getToken();                                      // ;
          }
          tok = s.getToken();
        }
        blk.close = tok.text === '}' ? { start: tok.start, end: tok.end } : null;
        blk.end = blk.close ? blk.close.end : tok.end;
        blk.value = { level: cur.level, name: cur.name, color: cur.color, pct: cur.pct, flat: cur.flat };
        res.blocks.push(blk);
        res.tiers.set(cur.level, { ...blk.value, luck: 0, block: blk });       // SetAtGrow: a level written twice keeps the last
      } else if (t === 'Drop') {
        const open = s.getToken();
        let total = 0;
        for (let i = 0; i < res.blocks.length; i++) {
          const lv = s.getNumber(), luck = s.getNumber();
          const tier = res.tiers.get(lv.value);
          res.drop.push({ level: span(lv), luck: span(luck), start: lv.start, end: luck.end, found: !!tier });
          if (tier) { tier.luck = luck.value; total += luck.value; }
          else res.dropErrors.push({ start: lv.start, end: lv.end, level: lv.value });
        }
        const close = s.getToken();
        res.dropBlock = { open: { start: open.start, end: open.end }, close: close.text === '}' ? { start: close.start, end: close.end } : null, closeTok: { start: close.start, end: close.end, text: close.text } };
        res.dropTotal = total;
      }
      s.getToken();
    }
    return res;
  }
  // CItemElem::SetRandomWeaponRarity (Item.cpp:724): r = xRandom( 100 ), the first tier 1..high whose running luck total passes r.
  // -> [{ level, chance (0..1) }] + the chance that nothing changes (the total stays below 100)
  function rarityChances(R) {
    const out = [];
    let total = 0;
    for (let i = 1; i <= R.high; i++) {
      const t = R.tiers.get(i);
      if (!t) continue;
      const a = Math.min(100, Math.max(0, total)), b = Math.min(100, Math.max(0, total + t.luck));
      total += t.luck;
      out.push({ level: i, chance: Math.max(0, b - a) / 100 });
    }
    const nothing = 1 - out.reduce((x, y) => x + y.chance, 0);
    return { tiers: out, nothing: Math.max(0, Math.round(nothing * 100) / 100) };
  }

  // ---------------------------------------------------------------- real chances
  // Every roll is xRandom( n ) = 0 .. n-1. "count" = how many of the n results succeed.
  //   le: success when r <= p   (fail if r > p:  EnchantGeneral :1229, SmeltSafetyGeneral :667, EnchantAttribute :1788,
  //                                              OnPiercingSize :262 / SmeltSafetyPiercingSize :838 (p < r fails),
  //                                              SmeltSafetyAccessory :743, SmeltSafetyUltimate UltimateWeapon.cpp:814)
  //   lt: success when r < p    (RefineAccessory :900, RefineCollector :963, EnchantWeapon UltimateWeapon.cpp:733,
  //                                              transforms :632, SetGem :333, RemoveGem :391, MakeGem :258)
  const countOf = (mode, p, n) => Math.max(0, Math.min(n, mode === 'le' ? p + 1 : p));
  const valueFor = (mode, count) => (mode === 'le' ? count - 1 : count);
  // the overseas cut (GetGeneralEnchantProb :1293): not LANG_KOR (the WorldServer is LANG_USA, WorldServer.rc:137) and level >= 3
  const f32 = Math.fround;
  const cut90 = (p, level) => (level >= 3 ? Math.trunc(f32(f32(p) * f32(0.9))) : p);
  // the file value that gives `count` after the cut (the smallest one)
  function uncut90(count, level, mode) {
    const want = valueFor(mode, count);
    if (level < 3 || want < 0) return want;
    let p = Math.max(0, Math.floor(want / 0.9) - 2);
    while (cut90(p, level) < want) p++;
    return p;
  }

  // the systems: { id, file, n (out of), mode, cut } and how a level's file value is found
  const SYSTEMS = {
    general: { label: 'Normal upgrade', n: 10000, mode: 'le', cut: true },
    attr: { label: 'Element upgrade', n: 10000, mode: 'le' },
    weapon: { label: 'Weapon piercing', n: 10000, mode: 'le' },
    suit: { label: 'Armor piercing', n: 10000, mode: 'le' },
    acc: { label: 'Accessory upgrade', n: 10000, mode: 'lt', safeMode: 'le' },
    coll: { label: 'Collector upgrade', n: 1000, mode: 'lt' },
    ult: { label: 'Ultimate upgrade', n: 1000000, mode: 'lt', safeMode: 'le' },
  };
  // the ladder of one system: [{ level (from), value (file), eff (after the cut), count, chance, safeCount, safeChance, span }]
  function ladder(model, sys) {
    const S = SYSTEMS[sys], t = model.t;
    let rows;
    if (sys === 'general') rows = t.general.map((x, i) => ({ level: i, span: x, value: x.value }));
    else if (sys === 'weapon' || sys === 'suit') rows = t[sys].map((x, i) => ({ level: i, span: x, value: x.value }));
    else if (sys === 'attr') rows = t.attr.map(a => ({ level: a.level - 1, span: a.call.args[1], value: a.call.args[1].value, call: a.call }));
    else if (sys === 'acc') rows = model.s.acc.slice(0, MAX_AAO).map((x, i) => ({ level: i, span: x, value: x.value }));
    else if (sys === 'coll') rows = model.s.coll.map((x, i) => ({ level: i, span: x, value: x.value }));
    else if (sys === 'ult') { const m = firstByLevel(model.ult.enchant); rows = [...m.keys()].sort((a, b) => a - b).map(k => ({ level: k - 1, span: m.get(k).prob, value: m.get(k).prob.value, row: m.get(k) })); }
    return rows.map(r => {
      const eff = S.cut ? cut90(r.value, r.level) : r.value;
      const count = countOf(S.mode, eff, S.n);
      const o = { ...r, eff, count, chance: count / S.n };
      if (S.safeMode) { o.safeCount = countOf(S.safeMode, eff, S.n); o.safeChance = o.safeCount / S.n; }
      return o;
    });
  }
  // a typed real % -> the file value (rounded to the system's unit); -> { value, count }
  function valueForPercent(sys, level, pct) {
    const S = SYSTEMS[sys];
    const count = Math.max(0, Math.min(S.n, Math.round(pct / 100 * S.n)));
    const value = S.cut ? uncut90(count, level, S.mode) : valueFor(S.mode, count);
    return { value, count };
  }
  // a single-roll chance (Ultimate file): r < p out of 1,000,000
  const singleChance = p => countOf('lt', p, 1000000) / 1000000;

  // ---------------------------------------------------------------- the workspace model
  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    const lua = loadLua(ws.files.get('itemupgrade.lua'));
    const m = { lua, t: luaTables(lua), s: loadS(ws.files.get('s.txt'), D), ult: loadUltimate(ws.files.get('ultimate_ultimateweapon.txt')),
      rarity: loadRarity(ws.files.get('weaponrarity.inc'), D) };
    m.scrolls = rateScrolls(ws);
    // part 2: the fees (UpgradeFees.lua, upgrade-fees.diff) + the remove-element text that names its fee (textClient.txt.txt)
    m.fees = FRE.upgradeFees.load(ws.files.get('upgradefees.lua'));
    const tk = 'IDS_TEXTCLIENT_INC_001814', tm = ws.strings && ws.strings.meta.get(tk);
    m.feeText = tm ? { key: tk, text: ws.strings.map.get(tk), file: tm.file, start: tm.start, end: tm.end } : null;
    return m;
  }
  // the success-rate scrolls in Spec_Item (IK3_… _ENCHANT_RATE / _UPGRADE_RATE): nEffectValue in the enchant range
  function rateScrolls(ws) {
    const D = ws.defines.defines, out = [];
    const kinds = { IK3_GENERAL_ENCHANT_RATE: 'general', IK3_GENERAL_WEAPON_ENCHANT_RATE: 'generalWeapon', IK3_GEN_ATT_ENCHANT_RATE: 'attr', IK3_ULTIMATE_UPGRADE_RATE: 'transform' };
    const ik = new Map(Object.keys(kinds).filter(k => D.has(k)).map(k => [D.get(k), kinds[k]]));
    for (const it of ws.items.items.values()) {
      const k = ik.get(FRE.specItem.get(it, 'dwItemKind3'));
      if (!k) continue;
      out.push({ id: it.id, define: it.define, name: it.name || it.define, kind: k, value: FRE.specItem.get(it, 'nEffectValue') | 0,
        min: FRE.specItem.get(it, 'nTargetMinEnchant') | 0, max: FRE.specItem.get(it, 'nTargetMaxEnchant') | 0 });
    }
    return out.sort((a, b) => a.id - b.id);
  }

  FRE.upgrade = { MAX_AAO, SYSTEMS, loadLua, luaTables, loadS, loadUltimate, firstByLevel, loadRarity, rarityChances, ladder, valueForPercent,
    countOf, cut90, uncut90, singleChance, fromWorkspace, rateScrolls };
})(globalThis.FRE = globalThis.FRE || {});
