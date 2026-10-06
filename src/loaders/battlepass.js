// BattlePass.inc loader, ported from CProject::LoadBattlePass (_Common/ProjectCmn.cpp:1682,
// custom __BATTLEPASS, commit cc73ccdd). Five blocks, each `NAME { rows... }`:
//   BP1 BPItem     nType dwItem nTime        the pass players buy
//   BP2 BPItemTemp nType dwItem nTime        preview pass (empty in season 1)
//   BP3 BPPoints   dwItem nMin nMax          point token (empty in season 1)
//   BP4 BPReward   nType nLevel nPoints dwItem nQty "logo" "rarity" "icon"
//   BP5 BPMonster  MI_x nMin nMax
// Inside a block the server reads a token; on the row keyword it reads the values,
// then one more token, and loops until '}'. Unknown words are skipped. Every table is
// a std::map filled with insert(), so on a duplicate key the FIRST row wins.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const FILE = 'BattlePass.inc';
  const MAX_BPOINTS = 10000;        // _Common/ProjectCmn.h:136

  const ROW_OF = { BP1: 'BPItem', BP2: 'BPItemTemp', BP3: 'BPPoints', BP4: 'BPReward', BP5: 'BPMonster' };

  const span = r => ({ value: r.value, start: r.start, end: r.end, define: r.define || null, unresolved: r.unresolved });

  function loadBattlePass(file, ctx) {
    const text = file.text;
    const script = new Script(text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const blocks = {};
    const rows = { BP1: [], BP2: [], BP3: [], BP4: [], BP5: [] };
    let t = script.getToken();
    while (!script.eof) {
      const name = t.text;
      if (ROW_OF[name] && t.type !== 'string') {
        const block = { name, start: t.start, open: script.getToken(), closed: false, end: t.end };
        (blocks[name] = blocks[name] || []).push(block);
        t = script.getToken();
        while (t.text[0] !== '}') {
          if (t.type === 'eof') {
            // `while( *scanner.token != '}' )` never ends at the end of the file
            script.diag('BP_BRACES', 'BLOCK', `${file.name}: the ${name} block is never closed with "}" - the server would hang at startup`, block.start, text.length);
            break;
          }
          if (t.text === ROW_OF[name] && t.type !== 'string') rows[name].push(readRow(script, name, t, text));
          t = script.getToken();
        }
        block.closed = t.text[0] === '}';
        block.end = t.end;
        block.close = block.closed ? { start: t.start, end: t.end } : null;
      }
      t = script.getToken();
    }

    // the server's maps (first insert wins)
    const firstBy = (list, key) => { const m = new Map(); for (const r of list) if (!m.has(key(r))) m.set(key(r), r); return m; };
    const passes = firstBy(rows.BP1, r => r.id);
    const ladder = firstBy(rows.BP4, r => r.level.value);
    const monsters = firstBy(rows.BP5, r => r.id);
    // at login the server takes mapBattPassItem.begin(): the LOWEST item id (DPDatabaseClient.cpp:1377)
    const pass = passes.size ? passes.get(Math.min(...passes.keys())) : null;
    return { file: file.name, blocks, rows, passes, ladder, monsters, pass, diags: script.diags };
  }

  function readRow(script, block, kw, text) {
    const n = () => span(script.getNumber());
    const r = { block, start: kw.start };
    if (block === 'BP1' || block === 'BP2') { r.type = n(); r.item = n(); r.time = n(); r.id = r.item.value >>> 0; r.define = r.item.define; }
    else if (block === 'BP3') { r.item = n(); r.min = n(); r.max = n(); r.id = r.item.value >>> 0; r.define = r.item.define; }
    else if (block === 'BP4') {
      r.type = n(); r.level = n(); r.points = n(); r.item = n(); r.qty = n();
      r.id = r.item.value >>> 0; r.define = r.item.define;
      for (const k of ['logo', 'rarity', 'icon']) {
        const tk = script.getToken();
        r[k] = { text: tk.type === 'eof' ? '' : tk.text, start: tk.start, end: tk.end, quoted: tk.type === 'string' && !tk.stringKey };
      }
    } else { r.mon = n(); r.min = n(); r.max = n(); r.id = r.mon.value >>> 0; r.define = r.mon.define; }
    const last = r.icon || r.max || r.time;
    r.end = last.end;
    // trailing "// ..." comment on the same line (BP5 rows carry "// lvN rank - Name")
    const ce = FRE.textOps.lineContentEnd(text, r.end);
    const ci = text.indexOf('//', r.end);
    if (ci >= 0 && ci < ce && /^[ \t]*$/.test(text.slice(r.end, ci))) r.comment = { start: ci, end: ce, text: text.slice(ci, ce) };
    return r;
  }

  // --- dates: CProject::BattlePassConfigTime (ProjectCmn.cpp:1660) ---------------
  // sprintf("%d"), then fixed slices YYYY MM DD [HH MM] through atoi. Returns null when
  // the server gets 0 (no season). MFC CTime rolls an impossible day over (Nov 31 -> Dec 1).
  function seasonEnd(nTime) {
    const s = String(nTime | 0);
    const a = (i, n) => parseInt(s.substr(i, n), 10) || 0;
    const y = a(0, 4), mo = a(4, 2), d = a(6, 2), hh = a(8, 2), mm = a(10, 2);
    if (y < 1971 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, mo - 1, d, hh, mm, 0);
    return { date, digits: s.length, rolled: date.getDate() !== d || date.getMonth() !== mo - 1, y, mo, d };
  }
  const ymd = date => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = n => String(n).padStart(2, '0');
  function dayText(date) { return `${DAYS[date.getDay()]} ${p2(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`; }
  function whenText(date) { return `${dayText(date)} ${p2(date.getHours())}:${p2(date.getMinutes())}`; }

  // --- monster price bands (BattlePass.inc BP5 comment; commits c0a828d7, 3b8e8410) ---
  // Base range by monster level, times the rank: midboss x1.25, boss x1.5, super x2
  // (rounded half up: 14 x 1.25 = 17.5 -> 18). All 863 rows of season 1 follow this exactly.
  const BANDS = [[20, 4, 6], [40, 8, 12], [60, 14, 20], [80, 22, 32], [100, 32, 44], [120, 44, 60], [140, 60, 80], [Infinity, 80, 110]];
  const RANK_MULT = { 4: 1.5, 5: 1.25, 7: 2 };
  function band(level, rankId) {
    const b = BANDS.find(x => level <= x[0]);
    const k = RANK_MULT[rankId] || 1;
    return { min: Math.round(b[1] * k), max: Math.round(b[2] * k), label: bandLabel(level) };
  }
  function bandLabel(level) {
    const i = BANDS.findIndex(x => level <= x[0]);
    const lo = i ? BANDS[i - 1][0] + 1 : 1;
    return BANDS[i][0] === Infinity ? `lv${lo}+` : `lv${lo}-${BANDS[i][0]}`;
  }

  // A monster a player can kill for points: level 1+, a display name, a combat rank
  // (RANK_LOW..RANK_SUPER; not citizens or guards) and not a pet. Season 1's BP5 was
  // built the same way ("every monster with a real display name and level 1-200").
  function isMonster(mv) {
    return mv.level >= 1 && !!mv.name && !/^IDS_/.test(mv.name) && mv.rankId >= 1 && mv.rankId <= 7 && !/^MI_PET_/.test(mv.define);
  }

  // ctx: { items, movers, defines, now (Date), theme (Set of lowercase file names in Client/Theme, or null) }
  function validateBattlePass(model, ctx) {
    const out = [];
    const add = d => out.push(Object.assign({ file: model.file, module: 'battlepass' }, d));
    for (const d of model.diags) add(Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
    const nameOf = r => r.define || (r.item || r.mon).value;
    const at = r => ({ start: r.start, end: r.end });
    for (const b of Object.keys(ROW_OF)) if (!model.blocks[b]) {
      if (b === 'BP1' || b === 'BP4' || b === 'BP5') add({ code: 'BP_FORMAT', severity: 'WARN', start: 0, end: 0, key: `BP_FORMAT|no${b}`, message: `${model.file} has no ${b} block` });
    }

    const clamp = (r, what, v, lo, hi) => {
      if (v.value >= lo && v.value <= hi) return;
      const eff = Math.min(Math.max(v.value, lo), hi);
      add(Object.assign(at(r), { code: 'BP_CLAMP', severity: 'WARN', key: `BP_CLAMP|${r.block}|${nameOf(r)}|${what}`,
        message: `${nameOf(r)}: ${what} ${v.value} is outside 1-${FRE.num.group(MAX_BPOINTS)}; the server uses ${FRE.num.group(eff)}` }));
    };
    const needItem = (r, what) => {
      if (r.id === 0) { add(Object.assign(at(r), { code: 'BP_UNDEF', severity: 'BLOCK', key: `BP_UNDEF|${r.block}|${what}`, message: `${what}: the item id is undefined or 0` })); return; }
      if (!ctx.items.get(r.id)) add(Object.assign(at(r), { code: 'BP_NO_ITEM', severity: 'BLOCK', key: `BP_NO_ITEM|${r.block}|${nameOf(r)}`,
        message: `${what}: ${nameOf(r)} is not a loaded item in Spec_Item.txt${r.block === 'BP4' ? ' - the server logs an error and the reward is lost' : ''}` }));
    };
    const dupe = (list, keyOf, code, what) => {
      const first = new Map();
      for (const r of list) {
        const k = keyOf(r);
        if (first.has(k)) add(Object.assign(at(r), { code, severity: 'BLOCK', key: `${code}|${k}|${nameOf(r)}`,
          message: `${what(r)} is listed twice: the server keeps the FIRST row (line above) and ignores this one` }));
        else first.set(k, r);
      }
    };

    // BP1 / BP2 / BP3
    for (const r of [...model.rows.BP1, ...model.rows.BP2, ...model.rows.BP3]) needItem(r, r.block === 'BP1' ? 'Battle Pass item' : r.block === 'BP2' ? 'Preview pass item' : 'Point token item');
    dupe(model.rows.BP1, r => r.id, 'BP_DUP_ITEM', r => `Pass item ${nameOf(r)}`);
    dupe(model.rows.BP2, r => r.id, 'BP_DUP_ITEM', r => `Preview pass item ${nameOf(r)}`);
    dupe(model.rows.BP3, r => r.id, 'BP_DUP_ITEM', r => `Point token ${nameOf(r)}`);
    for (const r of model.rows.BP3) { clamp(r, 'min points', r.min, 1, MAX_BPOINTS); clamp(r, 'max points', r.max, 1, MAX_BPOINTS); }
    if (model.passes.size > 1) {
      const p = model.pass;
      add(Object.assign(at(p), { code: 'BP_MULTI_PASS', severity: 'WARN', key: 'BP_MULTI_PASS',
        message: `${model.passes.size} BPItem rows: one season runs at a time, and at login the server uses the one with the lowest item id (${nameOf(p)}), not the first row` }));
    }
    for (const r of [...model.rows.BP1, ...model.rows.BP2]) {
      const e = seasonEnd(r.time.value);
      if (!e) add(Object.assign(at(r), { code: 'BP_DATE', severity: 'BLOCK', key: `BP_DATE|${r.block}|${nameOf(r)}|${r.time.value}`,
        message: `${nameOf(r)}: end date ${r.time.value} is not a valid YYYYMMDD date - the server reads it as 0, so no season runs` }));
      else if (e.digits !== 8 || e.rolled) add(Object.assign(at(r), { code: 'BP_DATE_FORMAT', severity: 'WARN', key: `BP_DATE_FORMAT|${r.block}|${r.time.value}`,
        message: `${nameOf(r)}: end date ${r.time.value} ${e.rolled ? `does not exist; the server rolls it over to ${whenText(e.date)}` : 'is not 8 digits (YYYYMMDD); the database keeps only the date, so the time part is lost'}` }));
    }
    const p = model.pass;
    if (!p) add({ code: 'BP_NO_PASS', severity: 'WARN', start: 0, end: 0, key: 'BP_NO_PASS', message: 'No BPItem row: no season runs (nobody gets the free track at login, kills earn no points)' });
    else {
      const e = seasonEnd(p.time.value);
      if (e && e.date.getTime() <= (ctx.now || new Date()).getTime()) add(Object.assign(at(p), { code: 'BP_EXPIRED', severity: 'WARN', key: `BP_EXPIRED|${p.time.value}`,
        message: `The season ended ${whenText(e.date)} (server time). Nobody is put on the pass at login and kills earn no points until a new season is set. A pass item used now is consumed for nothing but the level 1 reward (OnDoBP does not check the end date)` }));
    }

    // BP4 ladder
    const passType = p ? p.type.value : null;
    for (const r of model.rows.BP4) {
      needItem(r, `Level ${r.level.value} reward`);
      clamp(r, `level ${r.level.value} cost`, r.points, 1, MAX_BPOINTS);
      if (r.qty.value < 1) clamp(r, `level ${r.level.value} quantity`, r.qty, 1, 2147483647);
      for (const k of ['logo', 'rarity', 'icon']) if (!r[k].quoted) add(Object.assign(at(r), { code: 'BP_FORMAT', severity: 'BLOCK', key: `BP_FORMAT|${r.level.value}|${k}`,
        message: `Level ${r.level.value}: the ${k} texture must be a "quoted" name (use "" for none); otherwise the next row's values shift` }));
      if (r.logo.text) add(Object.assign(at(r), { code: 'BP_LOGO_UNUSED', severity: 'INFO', key: `BP_LOGO_UNUSED|${r.level.value}`,
        message: `Level ${r.level.value}: the banner "${r.logo.text}" is loaded but this client never draws it (WndBattlePass.cpp uses only the rarity and icon textures)` }));
      if (ctx.theme) for (const k of ['rarity', 'icon']) if (r[k].text && !ctx.theme.has(r[k].text.toLowerCase())) add(Object.assign(at(r), { code: 'BP_TEXTURE', severity: 'WARN',
        key: `BP_TEXTURE|${r.level.value}|${k}|${r[k].text}`, message: `Level ${r.level.value}: the ${k} texture "${r[k].text}" is not in the client's Theme folder` }));
      if (passType !== null && r.type.value !== passType) add(Object.assign(at(r), { code: 'BP_TYPE_ROW', severity: 'WARN', key: `BP_TYPE_ROW|${r.level.value}|${r.type.value}`,
        message: `Level ${r.level.value} has nType ${r.type.value}, but the pass has nType ${passType}: players on this season never see or get this reward` }));
    }
    dupe(model.rows.BP4, r => r.level.value, 'BP_DUP_LEVEL', r => `Level ${r.level.value}`);
    if (p) {
      const levels = [...model.ladder.values()].filter(r => r.type.value === passType);
      if (!levels.length && model.rows.BP4.length) add(Object.assign(at(p), { code: 'BP_TYPE', severity: 'BLOCK', key: `BP_TYPE|${passType}`,
        message: `No reward level has the pass's nType ${passType}: the ladder is empty for this season` }));
      // the max level is how many rows match the season (Mover.cpp:1162); a missing level
      // stops all progress there, because AddBPUpdate finds no cost row (User.cpp:4694)
      const size = levels.length, have = new Set(levels.map(r => r.level.value));
      for (let lv = 1; lv <= size; lv++) if (!have.has(lv)) {
        const above = levels.filter(r => r.level.value > size).map(r => r.level.value);
        add(Object.assign(at(p), { code: 'BP_LEVEL_GAP', severity: 'BLOCK', key: `BP_LEVEL_GAP|${lv}`,
          message: `Level ${lv} is missing: players get stuck at level ${lv} forever${above.length ? ` (level${above.length > 1 ? 's' : ''} ${above.join(', ')} can never be reached)` : ''}` }));
        break;
      }
    }

    // BP5 monsters
    for (const r of model.rows.BP5) {
      if (r.id === 0) { add(Object.assign(at(r), { code: 'BP_UNDEF', severity: 'BLOCK', key: `BP_UNDEF|BP5|${r.start}`, message: 'BPMonster: the monster id is undefined or 0' })); continue; }
      clamp(r, 'min points', r.min, 1, MAX_BPOINTS);
      clamp(r, 'max points', r.max, 1, MAX_BPOINTS);
      if (r.min.value > r.max.value && r.max.value >= 1) add(Object.assign(at(r), { code: 'BP_CLAMP', severity: 'WARN', key: `BP_CLAMP|BP5|${nameOf(r)}|minmax`,
        message: `${nameOf(r)}: min ${r.min.value} is above max ${r.max.value}; the server lowers min to ${Math.min(r.max.value, MAX_BPOINTS)}` }));
      const mv = ctx.movers && ctx.movers.get(r.id);
      if (ctx.movers && !mv) { add(Object.assign(at(r), { code: 'BP_NO_MONSTER', severity: 'BLOCK', key: `BP_NO_MONSTER|${nameOf(r)}`, message: `${nameOf(r)} is not a monster in propMover.txt` })); continue; }
      if (mv && model.monsters.get(r.id) === r) {
        const b = band(mv.level, mv.rankId);
        if (r.min.value !== b.min || r.max.value !== b.max) add(Object.assign(at(r), { code: 'BP_BAND', severity: 'WARN', key: `BP_BAND|${nameOf(r)}`,
          message: `${mv.name || nameOf(r)} (lv${mv.level} ${mv.rank}) pays ${r.min.value}-${r.max.value}; the file's ${b.label} ${mv.rank} band is ${b.min}-${b.max}` }));
      }
    }
    dupe(model.rows.BP5, r => r.id, 'BP_DUP_MONSTER', r => `Monster ${nameOf(r)}`);
    return out;
  }

  // Past seasons from backup copies of BattlePass.inc (every save backs the file up first).
  // entries: [{ stamp, file: SourceFile }] oldest first; current: the editor's model.
  // A season = the login pass's (lowest item id) nType + nTime. Per season the LAST copy's
  // ladder is kept (first row per level, that season's nType). Newest season first.
  function seasonHistory(entries, ctx, current) {
    const byKey = new Map();
    const keyOf = p => `${p.type.value}|${p.time.value}`;
    const ladderOf = (m, text) => {
      const type = m.pass.type.value;
      return [...m.ladder.values()].filter(r => r.type.value === type).sort((a, b) => a.level.value - b.level.value).map(r => ({
        level: r.level.value, points: r.points.value, define: text.slice(r.item.start, r.item.end), id: r.id, qty: r.qty.value,
        logo: r.logo.text, rarity: r.rarity.text, icon: r.icon.text }));
    };
    for (const e of entries) {
      let m;
      try { m = loadBattlePass(e.file, ctx); } catch (err) { continue; }
      if (!m.pass) continue;
      const k = keyOf(m.pass);
      const s = byKey.get(k) || { key: k, type: m.pass.type.value, time: m.pass.time.value, first: e.stamp, copies: 0 };
      Object.assign(s, { last: e.stamp, ladder: ladderOf(m, e.file.text), monsters: m.monsters.size });
      s.copies++;
      byKey.set(k, s);
    }
    const curKey = current && current.pass ? keyOf(current.pass) : null;
    const list = [...byKey.values()];
    for (const s of list) { s.current = s.key === curKey; const e = seasonEnd(s.time); s.end = e ? e.date : null; }
    return list.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.type - a.type));
  }

  FRE.battlePass = { loadBattlePass, seasonHistory, validateBattlePass, isMonster, seasonEnd, ymd, dayText, whenText, band, BANDS, FILE, MAX_BPOINTS };
})(globalThis.FRE = globalThis.FRE || {});
