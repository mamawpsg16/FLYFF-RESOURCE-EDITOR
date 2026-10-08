// Monster drops: propMoverEx.inc and the read-only files the kill path also uses.
//   loadDrops      = CProject::LoadPropMoverEx      (_Common/Project.cpp:2978-3255)
//                    + LoadPropMoverEx_AI / _SCAN / _BATTLE / _MOVE (_Common/ProjectLux.cpp)
//                    + InterpretRandomItem           (Project.cpp:3606)
//   loadExcept     = CProject::LoadExcept            (Project.cpp:5059; only "worldDrop = 0" matters here)
//   loadDropEvent  = CProject::LoadDropEvent         (Project.cpp:4013; runs after LoadPropMoverEx, Project.cpp:828-898)
//   loadPenyaTable = PenyaTable::LoadFile            (_Common/PenyaTable.cpp:9, __PENYA_LEVEL_TABLE, commits ed940337 / fbf9bc22)
//   loadDropLuck   = the expDropLuck block of LoadExpTable (Project.cpp:3815)
//   loadEventRates = Event.lua AddEvent / SetTime / Set*Rate + LuaFunc/EventFunc.lua GetEventState / Get*Rate
//   kindArrays     = CProject::OnAfterLoadPropItem   (Project.cpp:4983: m_itemKindAry sorted by dwItemRare, m_minMaxIdxAry)
// DropItem / DropKind / DropGold are added only #ifdef __WORLDSERVER (Project.cpp:3196 / 3218 / 3234):
// the game client parses the file but keeps no drops. propMoverEx.inc has no loose Client copy.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const FILE = 'propMoverEx.inc';
  const MAX_DROPKIND = 80;           // ProjectCmn.h:758 (the file's header comment still says 64)
  const INT_MAX = 2147483647;
  const DROP_ONE = 3000000000;       // GetAt: xRandom( 3000000000 ) (Project.cpp:187)
  const LANG_USA = 1, SUBLANG = 0;   // WorldServer.rc:137-138 IDS_LANG "1", IDS_SUBLANG "0"
  // Script-made blocks: "// [Name] begin" ... "// [Name] end" (46c26c73, 1d4c2944, bf871bba, 76924904, d27d9a5a)
  const GEN_SCRIPT = { BossDrop: 'gen_boss_drops.ps1', SetDrop: 'gen_set_drops.ps1', TowerCard: 'gen_tower_cards.ps1',
    RedChip: 'gen_red_chips.ps1', MoonSun: 'gen_moonsun_drops.ps1' };

  const ieq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();   // strcmpi
  const u32 = v => v >>> 0;

  // "// [X] begin" / "// [X] end" lines -> [{ name, start, end }]
  function genRanges(text) {
    const out = [], open = new Map();
    const re = /\/\/[ \t]*\[(\w+)\][ \t]*(begin|end)\b/g;
    let m;
    while ((m = re.exec(text))) {
      if (m[2] === 'begin') open.set(m[1], m.index);
      else if (open.has(m[1])) { out.push({ name: m[1], start: open.get(m[1]), end: m.index }); open.delete(m[1]); }
    }
    return out;
  }

  // ---- AI {} (ProjectLux.cpp). Returns false where the C++ returns FALSE: the whole file stops loading. ----
  // tokenType: IDENTIFIER = our 'ident', NUMBER = our 'number' (a #define resolves to NUMBER, CScript::GetToken).
  function aiBlock(s, fail) {
    let t = s.getToken();                                     // {
    if (t.text[0] !== '{') return fail(t, 'AI is not followed by {');
    for (;;) {
      t = s.getToken();
      if (t.type === 'eof') return fail(t, 'the file ends inside AI { }');
      if (t.text[0] === '}') break;
      if (t.text[0] !== '#') return fail(t, `AI { } holds "${t.text}" where a #SCAN / #BATTLE / #MOVE section should start`);
      const sec = t.text;
      let ok;
      if (ieq(sec, '#SCAN')) ok = aiScan(s, fail);
      else if (ieq(sec, '#BATTLE')) ok = aiBattle(s, fail);
      else if (ieq(sec, '#MOVE')) ok = aiMove(s, fail);
      else return fail(t, `unknown AI section "${sec}"`);
      if (!ok) return false;
    }
    return true;
  }
  function sectionOpen(s, fail, what) {
    const t = s.getToken();
    if (t.text[0] !== '{') { fail(t, `${what} is not followed by {`); return false; }
    return true;
  }
  function aiScan(s, fail) {
    if (!sectionOpen(s, fail, '#SCAN')) return false;
    let cmd = 0;
    for (;;) {
      const t = s.getToken();
      if (t.type === 'eof') return fail(t, 'the file ends inside #SCAN { }');
      if (t.text[0] === '}') break;
      if (t.type !== 'ident') continue;
      if (cmd === 'scan') {
        if (['job', 'range', 'quest', 'item', 'chao'].some(w => ieq(t.text, w))) s.getNumber();
        else return fail(t, `#SCAN: "${t.text}" is not job / range / quest / item / chao`);
      }
      if (ieq(t.text, 'scan')) {
        if (cmd) return fail(t, '#SCAN: scan appears twice');
        cmd = 'scan';
      }
    }
    return true;
  }
  function aiBattle(s, fail) {
    if (!sectionOpen(s, fail, '#BATTLE')) return false;
    let cmd = 0, recvMe = 0, recvHow = 100, recvMP = 0, helpUnit = 0, helpMul = 2;
    for (;;) {
      const t = s.getToken();
      if (t.type === 'eof') return fail(t, 'the file ends inside #BATTLE { }');
      if (t.text[0] === '}') break;
      const w = t.text;
      if (t.type === 'ident') {
        if (ieq(w, 'Attack')) cmd = 'attack';
        else if (ieq(w, 'cunning')) {
          if (!cmd) return fail(t, '#BATTLE: cunning before a command');
          if (cmd === 'attack') {
            const n = s.getToken();
            if (!['low', 'Sam', 'Hi'].some(x => ieq(n.text, x))) return fail(n, `#BATTLE: cunning "${n.text}" is not low / sam / hi`);
          }
        } else if (ieq(w, 'Recovery')) { cmd = 'recovery'; recvMe = 0; recvHow = 100; recvMP = 0; }
        else if (ieq(w, 'u') || ieq(w, 'm') || ieq(w, 'a')) { if (!cmd) return fail(t, `#BATTLE: ${w} before a command`); }
        else if (ieq(w, 'RangeAttack')) cmd = 'range';
        else if (ieq(w, 'KeepRangeAttack')) cmd = 'keeprange';
        else if (ieq(w, 'Summon')) cmd = 'summon';
        else if (ieq(w, 'Evade')) cmd = 'evade';
        else if (ieq(w, 'Helper')) { cmd = 'helper'; helpUnit = 0; helpMul = 2; }
        else if (ieq(w, 'all') || ieq(w, 'sam')) { if (!cmd) return fail(t, `#BATTLE: ${w} before a command`); }
        else if (ieq(w, 'Berserk')) cmd = 'berserk';
        else if (ieq(w, 'Randomtarget')) { /* nothing */ }
        else return fail(t, `#BATTLE: unknown command "${w}"`);
      } else if (t.type === 'number') {
        if (!cmd) return fail(t, '#BATTLE: a number before any command');
        const n = FRE.lexer.atoi(w).value;
        if (cmd === 'recovery') {
          if (recvMe === 0) recvMe = n; else if (recvHow === 100) recvHow = n; else if (recvMP === 0) recvMP = n;
        } else if (cmd === 'summon') { s.getNumber(); s.getToken(); }   // count, then the monster id token
        else if (cmd === 'helper') { if (helpUnit === 0) helpUnit = n; else if (helpMul === 2) helpMul = n; }
        else if (cmd === 'berserk') s.getFloat();
      }
    }
    return true;
  }
  function aiMove(s, fail) {
    if (!sectionOpen(s, fail, '#MOVE')) return false;
    let cmd = 0;
    for (;;) {
      const t = s.getToken();
      if (t.type === 'eof') return fail(t, 'the file ends inside #MOVE { }');
      if (t.text[0] === '}') break;
      if (t.type === 'ident') {
        if (ieq(t.text, 'Loot')) cmd = 'loot';
        else if (ieq(t.text, 'd')) { /* Loot option */ }
        else return fail(t, `#MOVE: unknown command "${t.text}"`);
      } else if (t.type === 'number' && !cmd) return fail(t, '#MOVE: a number before any command');
    }
    return true;
  }

  // ---- propMoverEx.inc ----
  // ctx: { defines, strings, movers (Map id -> mover from propMover.txt) }
  // Returns { file, monsters: Map(id -> mon), blocks: [block], stopped, diags }
  //   mon   = { id, define, blocks: [block], list: [entry], kinds: [entry], maxitem: { value, rec } | null }  (list = the C++ m_dropItems, file order)
  //   entry = { kind: 'item' | 'gold' | 'kind', block, start, end, ... }
  function loadDrops(file, ctx) {
    const text = file.text;
    const s = new Script(text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const movers = ctx.movers || new Map();
    let size = 0;                                              // m_nMoverPropSize = highest id + 1 (ProjectCmn.cpp:558)
    for (const id of movers.keys()) if (id + 1 > size) size = id + 1;
    const gens = genRanges(text);
    const genAt = pos => { const g = gens.find(r => pos > r.start && pos < r.end); return g ? g.name : null; };
    const monsters = new Map(), blocks = [], diags = [];
    let stopped = null;
    const add = d => diags.push(Object.assign({ file: file.name, module: 'drops' }, d));

    let nVal = s.getNumber();
    if (s.eof) return { file: file.name, monsters, blocks, stopped, diags: s.diags.concat(diags), size };
    do {
      if (nVal.value < 0 || nVal.value >= size) {
        // GetMoverProp returns NULL; `continue` in a do-while jumps to the condition without reading on: the server loops forever.
        stopped = { start: nVal.start, end: nVal.end, reason: 'range' };
        add({ code: 'M_RANGE', severity: 'BLOCK', start: nVal.start, end: nVal.end, key: `M_RANGE|${text.slice(nVal.start, nVal.end)}`,
          message: `${text.slice(nVal.start, nVal.end)} (id ${nVal.value}) is not a monster id of propMover.txt (0-${size - 1}): the server hangs at startup here` });
        break;
      }
      const define = nVal.define || text.slice(nVal.start, nVal.end);
      const block = { id: nVal.value, define, start: nVal.start, defEnd: nVal.end, open: null, close: null, entries: [], unresolved: nVal.unresolved };
      blocks.push(block);
      let mon = monsters.get(block.id);
      if (!mon) { mon = { id: block.id, define, blocks: [], list: [], kinds: [], maxitem: null }; monsters.set(block.id, mon); }
      mon.blocks.push(block);
      const openTok = s.getToken();                            // {
      block.open = { start: openTok.start, end: openTok.end, ok: openTok.text === '{' };
      let t = s.getToken();
      let hung = false;
      while (t.text[0] !== '}') {
        if (t.type === 'eof') { hung = true; break; }          // *token is '\0', never '}': the C++ loops forever
        if (t.text === ';') { t = s.getToken(); continue; }
        if (ieq(t.text, 'AI')) {
          const ok = aiBlock(s, (at, why) => {
            stopped = { start: at.start, end: at.end, reason: 'ai' };
            add({ code: 'M_AI', severity: 'BLOCK', start: at.start, end: at.end, key: `M_AI|${define}`,
              message: `${define}: ${why}. The server stops reading ${FILE} here: this and every later monster lose their drops` });
            return false;
          });
          if (!ok) break;
          t = s.token;
        }
        const w = t.text;
        if (w === 'm_nAttackFirstRange' || w === 'm_nAttackItemNear' || w === 'm_nAttackItemFar' || w === 'm_nAttackItem1' || w === 'm_nAttackItem2'
          || w === 'm_nAttackItem3' || w === 'm_nAttackItem4' || w === 'm_nAttackItemSec' || w === 'm_nMagicReflection' || w === 'm_nImmortality'
          || w === 'm_bBlow' || w === 'm_nChangeTargetRand' || w === 'm_dwAttackMoveDelay' || w === 'm_dwRunawayDelay') {
          s.getToken(); s.getNumber();
        } else if (w === 'SetEvasion') {
          s.getToken(); s.getNumber(); s.getToken(); s.getNumber(); s.getToken();
        } else if (w === 'SetRunAway') {
          s.getToken(); s.getNumber();
          const c = s.getToken();
          if (c.text === ',') { s.getNumber(); s.getToken(); s.getNumber(); s.getToken(); }
        } else if (w === 'SetCallHelper') {
          s.getToken(); s.getNumber(); s.getToken(); s.getNumber(); s.getToken(); s.getNumber(); s.getToken(); s.getNumber(); s.getToken();
        } else if (w === 'randomItem') {
          s.getToken(); let r = s.getToken();
          while (r.text[0] !== '}' && r.type !== 'eof') { if (r.text === ';') { r = s.getToken(); continue; } r = s.getToken(); }
        } else if (w === 'Maxitem') {
          const eq = s.getToken();
          const v = s.getNumber();
          const rec = { kind: 'maxitem', block, start: t.start, end: v.end, value: v, eq };
          mon.maxitem = rec;                                     // the last one read wins (m_dwMax =)
          block.entries.push(rec);
        } else if (w === 'DropItem') {
          const toks = [s.getToken()];                           // (
          const id = s.getNumber();
          toks.push(s.getToken());                               // ,
          const prob = s.getNumber();
          toks.push(s.getToken());                               // ,
          const level = s.getNumber();
          toks.push(s.getToken());                               // ,
          const count = s.getNumber();
          const close = s.getToken();                            // )
          toks.push(close);
          const e = { kind: 'item', block, start: t.start, end: close.end, id, prob, level, count, toks,
            itemId: u32(id.value), define: id.define || text.slice(id.start, id.end),
            probability: u32(prob.value), levelValue: u32(level.value), number: u32(count.value),
            // a 5th value (",") is skipped token by token like any unknown word: the 4 values are right (M_EXTRA_ARGS)
            shape: toks[0].text === '(' && toks[1].text === ',' && toks[2].text === ',' && toks[3].text === ',' && (close.text === ')' || close.text === ','),
            gen: genAt(t.start) };
          block.entries.push(e); mon.list.push(e);
        } else if (w === 'DropKind') {
          const open = s.getToken();
          const ik3 = s.getNumber();
          s.getToken(); const a = s.getNumber(); s.getToken(); const b = s.getNumber();
          const close = s.getToken();
          const e = { kind: 'kind', block, start: t.start, end: close.end, ik3, a, b, ik3Value: u32(ik3.value), define: ik3.define || text.slice(ik3.start, ik3.end),
            shape: open.text === '(' && close.text === ')', gen: genAt(t.start) };
          block.entries.push(e); mon.kinds.push(e);
        } else if (w === 'DropGold') {
          const open = s.getToken();
          const min = s.getNumber();
          const comma = s.getToken();
          const max = s.getNumber();
          const close = s.getToken();
          const e = { kind: 'gold', block, start: t.start, end: close.end, min, max, minValue: u32(min.value), maxValue: u32(max.value),
            shape: open.text === '(' && comma.text === ',' && close.text === ')', gen: genAt(t.start) };
          block.entries.push(e); mon.list.push(e);
        } else if (w === 'Transform') {
          s.getToken(); s.getFloat(); s.getToken(); s.getNumber(); s.getToken();
        }
        t = s.getToken();
      }
      if (stopped) break;
      if (hung) {
        stopped = { start: block.start, end: text.length, reason: 'braces' };
        add({ code: 'M_BRACES', severity: 'BLOCK', start: block.start, end: block.defEnd, key: `M_BRACES|${define}`,
          message: `${define}: its { } block is never closed. The server loops forever at startup` });
        break;
      }
      block.close = { start: t.start, end: t.end };
      nVal = s.getNumber();
    } while (!s.eof);

    // monster-level facts the checks and the UI need
    for (const mon of monsters.values()) mon.maxValue = mon.maxitem ? u32(mon.maxitem.value.value) : 0;
    return { file: file.name, monsters, blocks, stopped, diags: s.diags.map(d => Object.assign({ module: 'drops' }, d)).concat(diags), size, gens };
  }

  // ---- except.txt (Project.cpp:5059): ids with "worldDrop = 0" for the server's language are not event drops ----
  function loadExcept(file, ctx) {
    const set = new Set();
    if (!file) return set;
    const s = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const lang = ctx.lang != null ? ctx.lang : LANG_USA, sub = ctx.subLang != null ? ctx.subLang : SUBLANG;
    let t = s.getToken();
    while (!s.eof) {
      const nLang = FRE.lexer.atoi(t.text).value;
      const nSub = s.getNumber().value;
      s.getToken();
      t = s.getToken();
      while (t.text[0] !== '}' && t.type !== 'eof') {
        if (t.text === 'ItemProp') {
          s.getToken();
          t = s.getToken();                                  // dwID
          while (t.text[0] !== '}' && t.type !== 'eof') {
            const id = u32(FRE.lexer.atoi(t.text).value);
            s.getToken();                                     // {
            t = s.getToken();
            while (t.text[0] !== '}' && t.type !== 'eof') {
              if (nLang !== lang || nSub !== sub) { t = s.getToken(); continue; }
              const w = t.text;
              if (w === 'fFlightSpeed') { s.getToken(); s.getFloat(); s.getToken(); }
              else if (w === 'dwShopAble' || w === 'dwCircleTime' || w === 'dwFlag' || w === 'dwLimitLevel1' || w === 'dwSkillReadyType') { s.getToken(); s.getNumber(); s.getToken(); }
              else if (w === 'worldDrop') { s.getToken(); if (!s.getNumber().value) set.add(id); s.getToken(); }
              t = s.getToken();
            }
            t = s.getToken();
          }
        }
        t = s.getToken();
      }
      t = s.getToken();
    }
    return set;
  }

  // ---- propDropEvent.inc (Project.cpp:4013): DropItem( id, prob, level, number, minLv, maxLv ) for every monster in the level range ----
  // II_GEN_SKILL_BUFFBREAKER: half chance when the language is not Korean (Project.cpp:4044).
  function loadDropEvent(file, ctx) {
    const out = [];
    if (!file) return out;
    const s = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const except = ctx.except || new Set();
    const buff = ctx.defines.get('II_GEN_SKILL_BUFFBREAKER');
    do {
      const t = s.getToken();
      if (t.text !== 'DropItem') continue;
      s.getToken(); const id = s.getNumber();
      s.getToken(); const prob = s.getNumber();
      s.getToken(); const level = s.getNumber();
      s.getToken(); const num = s.getNumber();
      s.getToken(); const minLv = s.getNumber();
      s.getToken(); const maxLv = s.getNumber();
      s.getToken();
      const itemId = u32(id.value);
      if (except.has(itemId)) continue;
      let p = u32(prob.value);
      if (buff != null && itemId === u32(buff)) p = u32(Math.trunc(p * 0.5));
      out.push({ kind: 'item', event: true, start: t.start, end: maxLv.end, itemId, define: id.define || file.text.slice(id.start, id.end),
        probability: p, levelValue: u32(level.value), number: u32(num.value), minLv: u32(minLv.value), maxLv: u32(maxLv.value) });
    } while (!s.eof);
    return out;
  }

  // The event lines a monster gets: pProp->dwID && minLv <= dwLevel <= maxLv (Project.cpp:4048-4052)
  const eventLinesFor = (events, mover) => mover && mover.id ? events.filter(e => u32(mover.level) >= e.minLv && u32(mover.level) <= e.maxLv) : [];

  // ---- PenyaTable.txt (PenyaTable.cpp:9): a bare CScanner (no #define lookup) ----
  function loadPenyaTable(file) {
    const tbl = { rows: [], rankPct: new Array(16).fill(0), rankAtLeast: new Array(16).fill(false), worlds: [] };
    if (!file) return tbl;
    const s = new Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    let t = s.getToken();
    while (!s.eof) {
      if (t.text === 'LEVELS') {
        s.getToken();
        let lv = s.getNumber().value;
        while (s.token.text[0] !== '}' && !s.eof) {
          const row = { level: lv, min: s.getNumber().value, max: s.getNumber().value };
          if (row.min >= 0 && row.max >= row.min) {
            let i = 0;
            while (i < tbl.rows.length && tbl.rows[i].level < row.level) i++;
            tbl.rows.splice(i, 0, row);
          }
          lv = s.getNumber().value;
        }
      } else if (t.text === 'RANKS') {
        s.getToken();
        let rank = s.getNumber().value;
        while (s.token.text[0] !== '}' && !s.eof) {
          const pct = s.getNumber().value, mode = s.getNumber().value;
          if (rank > 0 && rank < 16 && pct > 0) { tbl.rankPct[rank] = pct; tbl.rankAtLeast[rank] = mode === 1; }
          rank = s.getNumber().value;
        }
      } else if (t.text === 'WORLDS') {
        s.getToken();
        let w = s.getNumber().value;
        while (s.token.text[0] !== '}' && !s.eof) {
          const pct = s.getNumber().value;
          if (w > 0 && pct > 0) tbl.worlds.push([u32(w), pct]);
          w = s.getNumber().value;
        }
      } else break;
      t = s.getToken();
    }
    return tbl;
  }

  // ---- expTable.inc expDropLuck { 122 x 11 values } (Project.cpp:3815) ----
  function loadDropLuck(file) {
    const luck = Array.from({ length: 122 }, () => new Array(11).fill(0));
    if (!file) return null;
    const s = new Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    let t;
    do { t = s.getToken(); } while (!s.eof && t.text !== 'expDropLuck');
    if (s.eof) return null;
    s.getToken();
    let i = 0, v = s.getNumber();
    while (s.token.text[0] !== '}' && !s.eof) {
      if (i < 122 * 11) luck[Math.floor(i / 11)][i % 11] = u32(v.value);
      i++;
      v = s.getNumber();
    }
    return luck;
  }

  // ---- Event.lua: the events on now, and their item / piece / gold rates (EventFunc.lua GetEventState, Get*Rate) ----
  function loadEventRates(file, now) {
    const res = { events: [], item: 1, piece: 1, gold: 1 };
    if (!file) return res;
    let text = file.text.replace(/--\[\[[\s\S]*?\]\]/g, m => m.replace(/[^\n]/g, ' '));
    text = text.replace(/--[^\n]*/g, '');
    const stamp = d => Number(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`);
    const nowN = stamp(now || new Date());
    let ev = null;
    const re = /\b(AddEvent|SetTime|SetItemDropRate|SetPieceItemDropRate|SetGoldDropFactor)\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(text))) {
      const args = m[2].split(',').map(a => a.trim().replace(/^"|"$/g, ''));
      if (m[1] === 'AddEvent') { ev = { name: args[0], times: [], item: null, piece: null, gold: null }; res.events.push(ev); continue; }
      if (!ev) continue;
      if (m[1] === 'SetTime') ev.times.push(args.map(a => Number(a.replace(/\D/g, ''))));
      else if (m[1] === 'SetItemDropRate') ev.item = Number(args[0]);
      else if (m[1] === 'SetPieceItemDropRate') ev.piece = Number(args[0]);
      else ev.gold = Number(args[0]);
    }
    for (const e of res.events) {
      let on = false;
      for (const [a, b] of e.times) if (a <= nowN) on = b > nowN;
      e.on = on;
      if (!on) continue;
      if (e.item != null) res.item *= e.item;
      if (e.piece != null) res.piece *= e.piece;
      if (e.gold != null) res.gold *= e.gold;
    }
    return res;
  }

  // ---- m_itemKindAry / m_minMaxIdxAry (Project.cpp:4983-5040) ----
  // Items by id ascending (m_aPropItem is indexed by dwID), per dwItemKind3; then an exchange sort by dwItemRare
  // (not stable: copied exactly); then the first / last index of each rarity below MAX_UNIQUE_SIZE (400).
  // Not modelled: __NEW_STACKABLE_AMPS copies of experience scrolls (ProjectCmn.cpp:891) get extra ids.
  function kindArrays(items) {
    const get = (it, f) => FRE.specItem.get(it, f);
    const byIk3 = new Map();
    const ids = [...items.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const it = items.get(id);
      const ik3 = u32(get(it, 'dwItemKind3'));
      if (ik3 === 0xFFFFFFFF) continue;
      if (!byIk3.has(ik3)) byIk3.set(ik3, []);
      byIk3.get(ik3).push({ id, rare: u32(get(it, 'dwItemRare')), lv: u32(get(it, 'dwItemLV')), ik1: get(it, 'dwItemKind1'), item: it });
    }
    const out = new Map();
    for (const [ik3, a] of byIk3) {
      for (let j = 0; j < a.length - 1; j++) for (let k = j + 1; k < a.length; k++) {
        if (a[k].rare < a[j].rare) { const t = a[j]; a[j] = a[k]; a[k] = t; }
      }
      const minMax = new Map();
      let rare = 0xFFFFFFFF;
      for (let j = 0; j < a.length; j++) {
        if (rare !== a[j].rare) {
          rare = a[j].rare;
          if (rare !== 0xFFFFFFFF) minMax.set(rare, [j, j]);
        } else if (rare !== 0xFFFFFFFF) minMax.get(rare)[1] = j;
      }
      out.set(ik3, { list: a, minMax });
    }
    return out;
  }
  const minIdx = (ka, ik3, rare) => { if (rare >= 400) return -1; const k = ka.get(ik3); const v = k && k.minMax.get(rare); return v ? v[0] : -1; };
  const maxIdx = (ka, ik3, rare) => { if (rare >= 400) return -1; const k = ka.get(ik3); const v = k && k.minMax.get(rare); return v ? v[1] : -1; };
  // DropKind's rarity window: monster level -5 .. -2, at least 1 (Project.cpp:3211-3216)
  function kindWindow(level) {
    const s16 = v => ((v & 0xffff) << 16) >> 16;
    let lo = s16(u32(level) - 5), hi = s16(u32(level) - 2);
    if (lo < 1) lo = 1;
    if (hi < 1) hi = 1;
    return [lo, hi];
  }

  // ---- checks ----
  // ctx: { items (Map id -> item), movers (Map id -> mover) }
  function validateDrops(model, ctx) {
    const out = [];
    const text = ctx.text || '';
    const add = d => out.push(Object.assign({ file: model.file, module: 'drops' }, d));
    for (const d of model.diags) {
      if (d.code === 'E_UNDEF') continue;               // reported below per entry, in plain words
      add(Object.assign({}, d, { key: d.key || `${d.code}|${d.name || d.message}` }));
    }
    const items = ctx.items || new Map(), movers = ctx.movers || new Map();
    const nameOf = mon => { const mv = movers.get(mon.id); return mv && mv.name ? `${mv.name} (${mon.define})` : mon.define; };
    const itemName = e => { const it = items.get(e.itemId); return it && it.name ? it.name : e.define; };
    const seen = new Map();
    for (const b of model.blocks) {
      const mon = model.monsters.get(b.id);
      const who = nameOf(mon);
      if (b.unresolved || b.id === 0) add({ code: 'M_UNDEF', severity: 'BLOCK', start: b.start, end: b.defEnd, key: `M_UNDEF|${b.define}`,
        message: `${b.define} is not defined: the server reads it as 0, so these drops belong to no monster` });
      else if (!movers.has(b.id)) add({ code: 'M_NO_MOVER', severity: 'WARN', start: b.start, end: b.defEnd, key: `M_NO_MOVER|${b.define}`,
        message: `${b.define} (id ${b.id}) has no row in propMover.txt: no such monster exists, so nothing drops these items` });
      if (seen.has(b.id)) add({ code: 'M_DUP', severity: 'WARN', start: b.start, end: b.defEnd, key: `M_DUP|${b.define}`,
        message: `${who} has two blocks: the server adds the drops of both (and the second "Maxitem" wins)` });
      seen.set(b.id, b);
      if (!b.open.ok) add({ code: 'M_BRACES', severity: 'BLOCK', start: b.start, end: b.defEnd, key: `M_BRACES|${b.define}|open`,
        message: `${who}: "${text.slice(b.open.start, b.open.end)}" stands where { should be. The server skips it and reads on` });
      for (const e of b.entries) {
        const at = { start: e.start, end: e.end };
        if (e.kind === 'item') {
          const key = `${b.define}|${e.define}|${e.probability}|${e.number}`;
          if (!e.shape) add(Object.assign(at, { code: 'M_COMMA', severity: 'BLOCK', key: `M_COMMA|${key}`,
            message: `${who}: this DropItem line is not "DropItem(item, chance, upgrade, amount);". The server reads its values shifted by one: chance ${pct(effChance(e.probability))}` }));
          if (e.itemId === 0) add(Object.assign(at, { code: 'M_DROP_UNDEF', severity: 'BLOCK', key: `M_DROP_UNDEF|${key}`,
            message: `${who}: "${e.define}" is not an item (it reads as 0). The server logs an error at startup and crashes when it drops` }));
          else if (!items.has(e.itemId)) add(Object.assign(at, { code: 'M_DROP_UNDEF', severity: 'BLOCK', key: `M_DROP_UNDEF|${key}|spec`,
            message: `${who}: ${e.define} (id ${e.itemId}) is not in Spec_Item.txt. The server crashes when it drops on the ground` }));
          if (e.number === 0) add(Object.assign(at, { code: 'M_COUNT_ZERO', severity: 'BLOCK', key: `M_COUNT_ZERO|${key}`,
            message: `${who}: ${itemName(e)} has amount 0. When it drops the server divides by zero (xRandom(0)) and crashes` }));
          if (e.prob.overflow) add(Object.assign(at, { code: 'M_PROB_OVERFLOW', severity: 'WARN', key: `M_PROB_OVERFLOW|${key}`,
            message: `${who}: ${itemName(e)}'s chance ${text.slice(e.prob.start, e.prob.end)} is above 2,147,483,647. atoi stops there, so it drops ${pct(effChance(e.probability))} of the time, not ${pct(Number(text.slice(e.prob.start, e.prob.end)) / DROP_ONE)}` }));
          else if (e.probability === 0 && e.shape) add(Object.assign(at, { code: 'M_PROB_ZERO', severity: 'WARN', key: `M_PROB_ZERO|${key}`,
            message: `${who}: ${itemName(e)} has chance 0: it never drops` }));
          if (e.toks[4] && e.toks[4].text === ',') add(Object.assign(at, { code: 'M_EXTRA_ARGS', severity: 'INFO', key: `M_EXTRA_ARGS|${key}`,
            message: `${who}: this DropItem line has more than 4 values. The server reads the first 4 and skips the rest` }));
        } else if (e.kind === 'gold') {
          const key = `${b.define}|gold`;
          if (!e.shape) add(Object.assign(at, { code: 'M_COMMA', severity: 'BLOCK', key: `M_COMMA|${key}`, message: `${who}: this DropGold line is not "DropGold(min, max);"` }));
          if (e.maxValue <= e.minValue) add(Object.assign(at, { code: 'M_GOLD_RANGE', severity: 'BLOCK', key: `M_GOLD_RANGE|${key}`,
            message: e.maxValue === e.minValue
              ? `${who}: DropGold(${e.minValue}, ${e.maxValue}): min and max are equal. The server rolls xRandom(max - min) = xRandom(0), divides by zero and crashes at the first kill`
              : `${who}: DropGold(${e.minValue}, ${e.maxValue}): min is above max. The server's roll wraps around and pays a random, wrong amount` }));
        }
      }
    }
    if (ctx.original != null && ctx.original !== text) {
      for (const g of genEdits(ctx.original, text)) {
        const [define, name] = g.key.split('|');
        const mon = [...model.monsters.values()].find(x => x.define === define);
        const b = mon ? mon.blocks[mon.blocks.length - 1] : null;
        const what = [g.changed && `${g.changed} line${g.changed > 1 ? 's' : ''} changed`, g.removed && `${g.removed} removed`].filter(Boolean).join(', ');
        add({ code: 'M_GEN_EDITED', severity: 'WARN', start: b ? b.start : 0, end: b ? b.defEnd : 0, key: `M_GEN_EDITED|${g.key}`,
          message: `${mon ? nameOf(mon) : define}: ${what} in the [${name}] block. ${GEN_SCRIPT[name] || 'Its gen_*.ps1 script'} rewrites that block when it runs again, which undoes this edit` });
      }
    }
    for (const mon of model.monsters.values()) {
      const who = nameOf(mon);
      if (mon.kinds.length > MAX_DROPKIND) add({ code: 'M_KIND_MAX', severity: 'BLOCK', start: mon.kinds[MAX_DROPKIND].start, end: mon.kinds[MAX_DROPKIND].end, key: `M_KIND_MAX|${mon.define}`,
        message: `${who} has ${mon.kinds.length} DropKind lines; the server has room for ${MAX_DROPKIND}. Line ${MAX_DROPKIND + 1} onward overwrites server memory` });
      const golds = mon.list.filter(e => e.kind === 'gold');
      if (!golds.length && movers.has(mon.id) && FRE.battlePass.isMonster(movers.get(mon.id))) add({ code: 'M_NO_GOLD', severity: 'INFO', start: mon.blocks[0].start, end: mon.blocks[0].defEnd,
        key: `M_NO_GOLD|${mon.define}`, message: `${who} has no DropGold line: it gives no Penya (PenyaTable.txt only changes a DropGold roll)` });
      // DropGold below lines that count toward Maxitem: the stop can skip the Penya (Mover.cpp:8714)
      if (mon.maxValue > 0) for (const g of golds) {
        const before = mon.list.slice(0, mon.list.indexOf(g)).filter(e => e.kind === 'item' && e.number !== 0xFFFFFFFF).length;
        if (before >= mon.maxValue) add({ code: 'M_GOLD_LATE', severity: 'WARN', start: g.start, end: g.end, key: `M_GOLD_LATE|${mon.define}`,
          message: `${who}: DropGold comes after ${before} drop lines that count toward its ${mon.maxValue}-item limit. When ${mon.maxValue} of them drop, the server stops and pays no Penya` });
      }
    }
    return out;
  }

  // Script-made lines per monster: Map("MI_X|Name" -> [trimmed lines]) for a text (genRanges + the MI_ line above each range)
  function genLines(text) {
    const out = new Map();
    const heads = [];
    const re = /^(MI_\w+)[ \t]*\r?$/gm;
    let h;
    while ((h = re.exec(text))) heads.push([h.index, h[1]]);
    let k = 0;
    for (const g of genRanges(text).sort((x, y) => x.start - y.start)) {
      while (k + 1 < heads.length && heads[k + 1][0] < g.start) k++;
      const key = `${heads.length && heads[k][0] < g.start ? heads[k][1] : '?'}|${g.name}`;
      const body = text.slice(text.indexOf('\n', g.start) + 1, g.end).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      out.set(key, (out.get(key) || []).concat(body));
    }
    return out;
  }
  // M_GEN_EDITED: script-made lines changed or removed since the file was loaded
  function genEdits(original, current) {
    const a = genLines(original), b = genLines(current), out = [];
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const left = (a.get(key) || []).slice();
      let changed = 0;
      for (const l of b.get(key) || []) { const i = left.indexOf(l); if (i >= 0) left.splice(i, 1); else changed++; }
      if (changed || left.length) out.push({ key, changed, removed: Math.max(0, left.length - changed) });
    }
    return out;
  }

  // ---- chances ----
  // xRand() is a full-period 32-bit LCG (core/xrandom.js), so over its cycle every value 0 .. 2^32-1 comes once.
  // xRandom(n) = xRand() % n: when 2^32 is not a multiple of n the low values come once more.
  // For n = 3e9 the values 0 .. 1,294,967,295 come twice: a 10% line drops 13.97% of the time.
  const TWO32 = 4294967296;
  // P( xRandom(n) < t ) for a whole t (0..n)
  function belowP(n, t) {
    t = Math.max(0, Math.min(t, n));
    return (Math.floor(TWO32 / n) * t + Math.min(t, TWO32 % n)) / TWO32;
  }
  // The first roll GetAt refuses (Project.cpp:184-208): dwRand = xRandom(3e9); dwRand = (DWORD)(dwRand / f), float32; pass while dwRand < prob.
  function getAtLimit(prob, factor) {
    const f = Math.fround(factor == null ? 1 : factor);
    const pass = x => Math.trunc(Math.fround(Math.fround(x) / f)) < prob;
    if (!pass(0)) return 0;
    if (pass(DROP_ONE - 1)) return DROP_ONE;
    let lo = 0, hi = DROP_ONE - 1;                // pass(lo), !pass(hi); pass is monotone in x
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (pass(mid)) lo = mid; else hi = mid; }
    return hi;
  }
  // The real chance one DropItem line passes (what players get per roll that reaches it)
  const effChance = (prob, factor) => belowP(DROP_ONE, getAtLimit(prob >>> 0, factor));
  // The file value that gives (at least) a real chance p, piece factor 1: the inverse of effChance, at most INT_MAX
  function probForChance(p) {
    if (!(p > 0)) return 0;
    let lo = 0, hi = INT_MAX;                     // smallest prob with effChance(prob) >= p
    if (effChance(hi) < p) return hi;
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (effChance(mid) >= p) hi = mid; else lo = mid; }
    return hi;
  }
  const MAX_CHANCE = () => effChance(INT_MAX);
  const pct = p => {
    const v = p * 100;
    if (v === 0) return '0%';
    if (v >= 1) return `${+v.toFixed(2)}%`;
    if (v >= 0.01) return `${+v.toFixed(3)}%`;
    return `${+v.toPrecision(2)}%`;
  };

  // ---- propItemEtc.inc RandomOptItem (LoadPiercingAvail, Project.cpp:4542-4637) + CRandomOptItemGen::Arrange (Project.cpp:4864) ----
  // The file is UTF-16LE. Piercing / SetItem blocks are walked token by token the way the C++ reads them.
  // Not modelled: AddPiercingAvail failing (it would return FALSE before Arrange); the server starts, so it doesn't.
  const MAX_RANDOMOPTITEM = 256, MAX_MONSTER_LEVEL = 160;   // Project.h:905 (__VER >= 11), defineJob.h:39
  function loadRandomOpt(file, ctx) {
    const list = [];
    if (file) {
      const s = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
      s.getToken();
      while (!s.eof) {
        const w = s.token.text;
        if (w === 'Piercing') {
          s.getNumber(); s.getToken(); s.getNumber();
          while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); }
        } else if (w === 'SetItem') {
          s.getNumber(); s.getToken(); s.getToken(); s.getToken();
          while (s.token.text[0] !== '}' && !s.eof) {
            if (s.token.text === 'Elem') {
              s.getToken(); s.getNumber();
              while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); }
              s.getToken();
            } else if (s.token.text === 'Avail') {
              s.getToken(); s.getNumber();
              while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); s.getNumber(); }
              s.getToken();
            } else break;      // the C++ loops forever here; never in this data
          }
        } else if (w === 'RandomOptItem') {
          const id = s.getNumber().value;
          s.getToken();
          const level = s.getNumber().value, prob = u32(s.getNumber().value);
          s.getToken();
          s.getNumber();
          while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); }
          if (list.length < MAX_RANDOMOPTITEM) list.push({ id, level, prob });
        }
        s.getToken();
      }
    }
    // Arrange: exchange sort by nLevel (not stable), then m_anIndex[level-1] = the last entry below that level
    const a = list.slice();
    for (let i = 0; i < a.length - 1; i++) for (let j = i + 1; j < a.length; j++) if (a[i].level > a[j].level) { const x = a[i]; a[i] = a[j]; a[j] = x; }
    const anIndex = new Array(MAX_MONSTER_LEVEL).fill(0);
    let lv = 1, prev = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i].level > lv) { for (let j = lv; j < a[i].level; j++) anIndex[j - 1] = prev; lv = a[i].level; }
      prev = i;
    }
    for (let i = lv; i <= MAX_MONSTER_LEVEL; i++) anIndex[i - 1] = prev;
    return { list: a, anIndex };
  }

  // Everything the kill path reads besides propMoverEx.inc, from a Workspace (or any { files, defines, strings, items }).
  function contextFromFiles(ws, now) {
    const f = n => ws.files.get(n);
    const defines = ws.defines.defines, strings = ws.strings ? ws.strings.map : null;
    const except = loadExcept(f('except.txt'), { defines, strings });
    const etc = f('propitemetc.inc');
    return {
      randomOpt: loadRandomOpt(etc, { defines, strings }),
      except, events: loadDropEvent(f('propdropevent.inc'), { defines, strings, except }),
      penya: loadPenyaTable(f('penyatable.txt')), luck: loadDropLuck(f('exptable.inc')),
      rates: loadEventRates(f('event.lua'), now || (ws.now ? ws.now() : new Date())),
      kinds: kindArrays(ws.items.items),
      has: { events: !!f('propdropevent.inc'), penya: !!f('penyatable.txt'), luck: !!f('exptable.inc'), rates: !!f('event.lua'), etc: !!etc },
    };
  }

  FRE.drops = { FILE, contextFromFiles, loadRandomOpt, MAX_MONSTER_LEVEL, MAX_DROPKIND, INT_MAX, DROP_ONE, GEN_SCRIPT, LANG_USA, loadDrops, loadExcept, loadDropEvent, eventLinesFor, loadPenyaTable, loadDropLuck,
    loadEventRates, genLines, genEdits, kindArrays, minIdx, maxIdx, kindWindow, validateDrops, effChance, belowP, getAtLimit, probForChance, MAX_CHANCE, pct, genRanges };
})(globalThis.FRE = globalThis.FRE || {});
