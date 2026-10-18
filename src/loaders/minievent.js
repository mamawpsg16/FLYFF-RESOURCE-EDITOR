// Mini Events (MiniEvent.inc, WorldServer only): port of CMiniEventMng::ReadConfig (WORLDSERVER/MiniEventMng.cpp:134-460;
// V19 25e4f227 Batch A, e9ee7010 Batch B, 3b12a4bb Batch C). Read on the WorldServer's first tick and by /eventreload
// (refused while an event runs). ASCII, LF in git (CRLF on the Windows PC). Lines are a CScript token stream:
//   EVENT <name> <KEY value> ...          the keys run until a word that is not a key (that word starts the next line)
//   RANK <name> <1-10> <item> <amount>    REST <name> <item> <amount>
//   POINTS <name> <1st> ... <10th> <rest> ASK TYPER "<text>" "<info>"   ASK OXQUIZ O|X "<statement>"
//   RECIPE "<title>" <n> <item> <amount> ...   SPOT <x> <z> "<region>" "<hint>" "<landmark>"
//   ITEM_HINT <item> "<text>"   HIDE_NPC <mover> <character key>   BEGIN <name|RANDOM> <day> <hour> <minute>
//   RACE_START <x> <z>   (Vagrant Race, V19 ce1659f6, not yet built: the start in WdRace; every line overwrites the last)
//   RACE_POINT <x> <z>   (V19 321d3c1b: a checkpoint on the way up, in route order; x / z above 0)
// ONE error anywhere switches EVERY Mini Event off (m_bValidConfig = FALSE, logged in error_*.txt): the server reports the
// first; the editor lists them all (each is a BLOCK).
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const NULL_ID = 0xFFFFFFFF;
  // MINIEVENT_TYPE_* (_Common/CustomCommon.h:259-267), GetTypeName / GetTypeKey (MiniEventMng.cpp:91-120)
  const TYPES = [
    null,
    { id: 1, key: 'COLORGAME', name: 'Color Game', about: 'Players pick 1 of 6 colours; 3 dice are rolled. 2 points per die with your colour, +1 for the first player who picked a colour that hit.' },
    { id: 2, key: 'TYPER', name: 'Quick Hands', about: 'A word or phrase is shown; the first 10 who type it exactly score (points by place), later correct answers get the rest points.' },
    { id: 3, key: 'OXQUIZ', name: 'O/X Quiz', about: 'A statement is shown; players pick O (true) or X (false). Right answers score by speed: the fastest 10 by place, other right answers the rest points.' },
    { id: 4, key: 'LUCKYDRAW', name: 'Lucky Draw', about: 'Nothing to do: every round a random top 10 gets points by place, everyone else the rest points.' },
    { id: 5, key: 'TURNIN', name: 'Turn-in Race', about: 'A recipe of 1-4 items is shown; bring them to Event Master. The first 10 score by place; the round ends after the END_AT-th turn-in.' },
    { id: 6, key: 'HIDESEEK', name: 'Hide and Seek', about: 'Lost Fwanki hides at a spot in Madrigal; region at the start, a hint at 40 %, a landmark at 80 %. The first to find it wins the round.' },
    { id: 7, key: 'RACE', name: 'Vagrant Race', about: 'Every round each registered player who is online becomes a level 1 Vagrant with no gear and is put at the start of WdRace (a copy of Volcane). They race to the Robe girl at the top and click "Finish!": finishers score by finish order, everyone else gets the rest points. A death puts them back at the start. At the end they get their own character back, where they were.' },
  ];
  const RANKS = 10, RECIPE_ITEMS = 4, ANSWER_LEN = 100;
  // the EVENT keys, their ME_EVENT() defaults (MiniEventMng.h:90) and the ReadConfig limits (:404-425)
  const KEYS = [
    { key: 'MIN_LEVEL', def: 120, label: 'Lowest level', min: 1, max: 200, help: 'Players below this level cannot register.' },
    { key: 'MIN_PLAYERS', def: 5, label: 'Players needed', min: 1, max: 500, help: 'Fewer registered players at the start time = the event is cancelled. 1 = a solo test.' },
    { key: 'MAX_PLAYERS', def: 100, label: 'Most players', min: 1, max: 500, help: 'Registration closes when this many have registered (at least "players needed", at most 500).' },
    { key: 'MAX_PER_IP', def: 1, label: 'Players per IP address', min: 0, max: 500, help: '0 = no limit (two characters on one PC). Set 1 before launch.' },
    { key: 'REGISTER', def: 5, label: 'Registration (minutes)', min: 1, max: 60, help: 'The event is announced this many minutes before its start time.' },
    { key: 'ROUNDS', def: 10, label: 'Rounds', min: 1, max: 30, help: '' },
    { key: 'ROUND_TIME', def: 15, label: 'Round time (seconds)', min: 5, max: 120, help: '' },
    { key: 'SCORE_TIME', def: 5, label: 'Results between rounds (seconds)', min: 2, max: 60, help: '' },
    { key: 'ASK_DAYS', def: 7, label: 'Repeat warning (days)', min: 0, max: 3650, only: [2, 3], help: 'A question asked again within this many days only logs a warning (error_*.txt).' },
    { key: 'END_AT', def: 10, label: 'Round ends after (turn-ins)', min: 1, max: 500, only: [5], help: 'The round ends early when this many players have turned in.' },
    { key: 'IN_RANDOM', def: 1, label: 'Picked by a RANDOM start time', min: 0, max: 1, bool: true, help: 'Off = only started by a fixed start time or GM /eventstart.' },
    { key: 'READY', def: 15, label: 'Frozen before GO (seconds)', min: 0, max: 60, only: [7], help: 'Every round starts frozen on the start line: the game shows READY, then 10 ... 1, then GO! (V19 e97a70b6).' },
  ];
  const KEY = new Map(KEYS.map(k => [k.key, k]));
  const roundMax = type => (type === 5 || type === 6 || type === 7 ? 600 : 120);
  // Vagrant Race: the default start (MINIEVENT_RACE_X / _Z, MiniEventMng.cpp; the Volcane landing point, WdRace.rgn RI_REVIVAL)
  const RACE_START = { x: Math.fround(505.2), z: Math.fround(593.9) };
  // CWorld::VecInWorld (World.h:756): x and z from 0, and x / MPU below WORLD_WIDTH - 1 (MAP_SIZE 128 x the .wld "size"), in float32
  function vecInWorld(w, x, z) {
    const inv = Math.fround(1 / w.mpu), ok = (v, n) => !Number.isNaN(v) && v >= 0 && Math.fround(v * inv) < 128 * n - 1;
    return ok(x, w.w) && ok(z, w.h);
  }
  // CWorld::LoadWorld (WorldFile.cpp:57): "size <w>, <h>" and "MPU <n>" (default OLD_MPU 4) of a .wld file
  function readWld(file) {
    if (!file) return null;
    const s = new Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    const out = { w: 0, h: 0, mpu: 4 };
    for (let t = s.getToken(); t.type !== 'eof'; t = s.getToken()) {
      if (t.text === 'size') { out.w = s.getNumber().value; s.getToken(); out.h = s.getNumber().value; }
      else if (t.text === 'MPU') out.mpu = s.getNumber().value;
    }
    return out;
  }
  const DEF_POINTS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2];

  // FindType (MiniEventMng.cpp:119): case-insensitive; QUICKHANDS = TYPER, HIDEANDSEEK = HIDESEEK
  function findType(word) {
    const w = String(word || '').toUpperCase();
    for (let i = 1; i < TYPES.length; i++) if (TYPES[i].key === w) return i;
    if (w === 'QUICKHANDS') return 2;
    if (w === 'HIDEANDSEEK') return 6;
    if (w === 'VAGRANTRACE') return 7;
    return 0;
  }

  function newEvent(type) {
    const e = { type, key: TYPES[type].key, name: TYPES[type].name, loaded: false, lines: [], keys: {}, values: {},
      ranks: new Array(RANKS).fill(null), rest: null, points: null, asks: [], recipes: [], spots: [], rankLines: [], restLines: [] };
    for (const k of KEYS) e.values[k.key] = k.def;
    e.pointValues = DEF_POINTS.slice(); e.restPoints = 1;
    return e;
  }

  // file: SourceFile. ctx: { defines, items (Map id -> item), movers (Map id), charKeys (Set lowercase character keys),
  //   raceWorld: { w, h, mpu } (WdRace's .wld) | null (no WdRace: World.inc or its folder missing) | undefined (maps not read: not checked) }
  function loadMiniEvent(file, ctx = {}) {
    const text = file.text, D = ctx.defines || new Map();
    const s = new Script(text, { file: file.name, defines: D, diags: [] });
    const events = [null]; for (let i = 1; i < TYPES.length; i++) events.push(newEvent(i));
    const begins = [], hints = [], errors = [];
    let hideNpc = null, raceStart = null;
    const racePoints = [];
    const itemOk = id => !!(ctx.items && ctx.items.get(id >>> 0));
    const err = (message, a, b) => errors.push({ message, start: a, end: Math.max(b, a) });
    const num = () => { const n = s.getNumber(); return { value: n.value, start: n.start, end: n.end, define: n.define || null }; };
    const tok = () => { const t = s.getToken(); return { text: t.type === 'eof' ? '' : t.text, start: t.start, end: t.end, quoted: t.type === 'string', eof: t.type === 'eof' }; };
    let t = s.getToken();
    while (t.type !== 'eof') {
      const kw = t.text, start = t.start;
      if (kw === 'EVENT') {
        const nt = tok(), type = findType(nt.text);
        if (!type) { err(`EVENT: unknown event "${nt.text}"`, start, nt.end); t = s.getToken(); continue; }
        const e = events[type];
        e.loaded = true;
        const line = { kw, type, start, end: nt.end, nameTok: nt, keys: [] };
        t = s.getToken();
        while (t.type !== 'eof' && KEY.has(t.text)) {
          const k = t.text, n = num();
          const entry = { key: k, keyTok: { start: t.start, end: t.end }, value: n, line };
          line.keys.push(entry); line.end = n.end;
          e.keys[k] = entry;
          e.values[k] = k === 'IN_RANDOM' ? (n.value !== 0 ? 1 : 0) : n.value;
          t = s.getToken();
        }
        e.lines.push(line);
        continue;                                          // t already holds the next word
      } else if (kw === 'RANK' || kw === 'REST') {
        const rest = kw === 'REST', nt = tok(), type = findType(nt.text);
        if (!type) { err(`${kw}: unknown event "${nt.text}"`, start, nt.end); t = s.getToken(); continue; }
        let rank = null;
        if (!rest) {
          rank = num();
          if (rank.value < 1 || rank.value > RANKS) { err(`RANK ${TYPES[type].key} ${rank.value}: rank must be 1 - ${RANKS}`, start, rank.end); t = s.getToken(); continue; }
        }
        const item = num(), amount = num();
        const row = { kw, type, start, end: amount.end, rank, item, amount, id: item.value >>> 0 };
        if (!itemOk(item.value) || amount.value < 0 || amount.value > 9999) err(`${kw} ${TYPES[type].key}: unknown item or amount not 0 - 9999`, start, amount.end);
        const e = events[type];
        if (rest) { e.rest = row; e.restLines.push(row); } else { e.ranks[rank.value - 1] = row; e.rankLines.push(row); }
      } else if (kw === 'POINTS') {
        const nt = tok(), type = findType(nt.text);
        if (!type) { err(`POINTS: unknown event "${nt.text}"`, start, nt.end); t = s.getToken(); continue; }
        const vals = []; for (let i = 0; i <= RANKS; i++) vals.push(num());
        const e = events[type];
        e.points = { kw, type, start, end: vals[RANKS].end, nums: vals };
        e.pointValues = vals.slice(0, RANKS).map(v => v.value); e.restPoints = vals[RANKS].value;
      } else if (kw === 'ASK') {
        const nt = tok(), type = findType(nt.text);
        if (type !== 2 && type !== 3) { err(`ASK: "${nt.text}" has no questions (TYPER or OXQUIZ)`, start, nt.end); t = s.getToken(); continue; }
        const ask = { kw, type, start, end: nt.end, truth: null, question: null, info: null };
        let bad = false;
        if (type === 3) {
          ask.truth = tok();
          if (ask.truth.text !== 'O' && ask.truth.text !== 'X') { err(`ASK OXQUIZ: answer must be O or X, not "${ask.truth.text}"`, start, ask.truth.end); bad = true; }
          else { ask.question = tok(); ask.end = ask.question.end; }
        } else {
          ask.question = tok(); ask.info = tok(); ask.end = ask.info.end;
          if (ask.info.text.length > 120) { err(`ASK TYPER "${ask.question.text}": the info text must be up to 120 letters`, start, ask.end); bad = true; }
          else if (!ask.question.text.length || ask.question.text.length > ANSWER_LEN) { err(`ASK TYPER "${ask.question.text}": the text must be 1 - ${ANSWER_LEN} letters`, start, ask.end); bad = true; }
        }
        if (!bad && ask.question && (!ask.question.text.length || ask.question.text.length > 200)) { err(`ASK ${TYPES[type].key}: the question must be 1 - 200 letters, in quotes`, start, ask.end); bad = true; }
        if (!bad) events[type].asks.push(ask);
      } else if (kw === 'RECIPE') {
        const title = tok(), n = num();
        const r = { kw, start, end: n.end, title, count: n, items: [] };
        if (!title.text.length || title.text.length > 60 || n.value < 1 || n.value > RECIPE_ITEMS) {
          err(`RECIPE "${title.text}": title 1 - 60 letters in quotes, then 1 - ${RECIPE_ITEMS} items`, start, n.end);
        } else {
          let bad = false;
          for (let k = 0; k < n.value && !bad; k++) {
            const item = num(), amount = num();
            r.items.push({ item, amount, id: item.value >>> 0 }); r.end = amount.end;
            if (!itemOk(item.value) || amount.value < 1 || amount.value > 9999) { err(`RECIPE "${title.text}": item ${k + 1} unknown or amount not 1 - 9999`, start, r.end); bad = true; }
            for (let j = 0; j < k && !bad; j++) if ((r.items[j].item.value >>> 0) === (item.value >>> 0)) { err(`RECIPE "${title.text}": the same item twice`, start, r.end); bad = true; }
          }
          if (!bad) events[5].recipes.push(r);
        }
      } else if (kw === 'SPOT') {
        const x = s.getFloat(), z = s.getFloat();
        const region = tok(), hint = tok(), landmark = tok();
        const sp = { kw, start, end: landmark.end, x: { value: Math.fround(x.value), start: x.start, end: x.end }, z: { value: Math.fround(z.value), start: z.start, end: z.end }, region, hint, landmark };
        if (!region.text.length || region.text.length > 60 || hint.text.length > 120 || landmark.text.length > 60 || !(sp.x.value > 0) || !(sp.z.value > 0))
          err(`SPOT ${Math.round(sp.x.value)} ${Math.round(sp.z.value)}: x / z above 0, "region" 1 - 60 letters, "hint" up to 120, "landmark" up to 60`, start, sp.end);
        else events[6].spots.push(sp);
      } else if (kw === 'ITEM_HINT') {
        const item = num(), txt = tok();
        const hnt = { kw, start, end: txt.end, item, text: txt, id: item.value >>> 0 };
        if (!itemOk(item.value) || txt.text.length > 100) err(`ITEM_HINT "${txt.text}": unknown item or text over 100 letters`, start, txt.end);
        else hints.push(hnt);
      } else if (kw === 'HIDE_NPC') {
        const mover = num(), key = tok();
        hideNpc = { kw, start, end: key.end, mover, key };
        if (!(ctx.movers && ctx.movers.get(mover.value)) || !(ctx.charKeys && ctx.charKeys.has(key.text.toLowerCase())))
          err(`HIDE_NPC: unknown mover or character key "${key.text}"`, start, key.end);
      } else if (kw === 'RACE_START') {
        const x = s.getFloat(), z = s.getFloat();
        raceStart = { kw, start, end: z.end, x: { value: Math.fround(x.value), start: x.start, end: x.end }, z: { value: Math.fround(z.value), start: z.start, end: z.end } };
      } else if (kw === 'RACE_POINT') {
        const x = s.getFloat(), z = s.getFloat();
        const rp = { kw, start, end: z.end, x: { value: Math.fround(x.value), start: x.start, end: x.end }, z: { value: Math.fround(z.value), start: z.start, end: z.end } };
        if (!(rp.x.value > 0) || !(rp.z.value > 0)) err(`RACE_POINT ${cRound(rp.x.value)} ${cRound(rp.z.value)}: x / z above 0`, start, rp.end);
        else racePoints.push(rp);
      } else if (kw === 'BEGIN') {
        const nt = tok(), random = nt.text.toUpperCase() === 'RANDOM', type = random ? 0 : findType(nt.text);
        if (!random && !type) { err(`BEGIN: unknown event "${nt.text}" (or RANDOM)`, start, nt.end); t = s.getToken(); continue; }
        const day = num(), hour = num(), minute = num();
        const b = { kw, start, end: minute.end, type, nameTok: nt, day, hour, minute };
        if (day.value < 0 || day.value > 7 || hour.value < 0 || hour.value > 23 || minute.value < 0 || minute.value > 59)
          err(`bad BEGIN ${day.value} ${hour.value} ${minute.value} (day 0-7, hour 0-23, minute 0-59)`, start, b.end);
        else begins.push(b);
      } else err(`unknown word "${kw}"`, start, t.end);
      t = s.getToken();
    }

    // the checks after the lines (MiniEventMng.cpp:399-438), in the server's order
    let any = false;
    for (let i = 1; i < TYPES.length; i++) {
      const e = events[i];
      if (!e.loaded) continue;
      any = true;
      const v = e.values, K = TYPES[i].key, at = e.lines[0];
      const fail = m => err(m, at.start, at.end);
      if (v.MIN_LEVEL < 1 || v.MIN_LEVEL > 200) fail(`${K} MIN_LEVEL must be 1 - 200`);
      else if (v.MIN_PLAYERS < 1) fail(`${K} MIN_PLAYERS < 1`);
      else if (v.MAX_PLAYERS < v.MIN_PLAYERS || v.MAX_PLAYERS > 500) fail(`${K} MAX_PLAYERS must be MIN_PLAYERS - 500`);
      else if (v.MAX_PER_IP < 0) fail(`${K} MAX_PER_IP < 0`);
      else if (v.REGISTER < 1 || v.REGISTER > 60) fail(`${K} REGISTER must be 1 - 60 minutes`);
      else if (v.ROUNDS < 1 || v.ROUNDS > 30) fail(`${K} ROUNDS must be 1 - 30`);
      else if (v.ROUND_TIME < 5 || v.ROUND_TIME > roundMax(i)) fail(`${K} ROUND_TIME must be 5 - ${roundMax(i)} seconds`);
      else if (v.SCORE_TIME < 2 || v.SCORE_TIME > 60) fail(`${K} SCORE_TIME must be 2 - 60 seconds`);
      else if (v.END_AT < 1 || v.END_AT > 500) fail(`${K} END_AT must be 1 - 500`);
      else if (v.READY < 0 || v.READY > 60) fail(`${K} READY must be 0 - 60 seconds`);
      else if ((i === 2 || i === 3) && e.asks.length < v.ROUNDS) fail(`${K} needs at least ${v.ROUNDS} ASK lines (one per round), has ${e.asks.length}`);
      else if (i === 5 && e.recipes.length < v.ROUNDS) fail(`TURNIN needs at least ${v.ROUNDS} RECIPE lines (one per round), has ${e.recipes.length}`);
      else if (i === 6 && e.spots.length < v.ROUNDS) fail(`HIDESEEK needs at least ${v.ROUNDS} SPOT lines (one per round), has ${e.spots.length}`);
      else if (i === 6 && !hideNpc) fail('HIDESEEK needs a HIDE_NPC line');
      else if (i === 7 && ctx.raceWorld === null) fail('RACE needs the WdRace world (World.inc WI_WORLD_RACE, World\\WdRace)');
      else if (i === 7 && ctx.raceWorld && !vecInWorld(ctx.raceWorld, raceStart ? raceStart.x.value : RACE_START.x, raceStart ? raceStart.z.value : RACE_START.z)) {
        const rs = raceStart || { x: { value: RACE_START.x }, z: { value: RACE_START.z } };
        err(`RACE_START ${cRound(rs.x.value)} ${cRound(rs.z.value)} is outside WdRace`, (raceStart || at).start, (raceStart || at).end);
      }
      else {
        const p = e.pointValues;
        for (let k = 0; k < RANKS; k++) {
          const next = k + 1 < RANKS ? p[k + 1] : e.restPoints;
          if (p[k] > 999 || next < 0 || (k + 1 < RANKS ? p[k] < next : p[k] <= next)) {
            const sp = e.points || at;
            err(`${K} POINTS: 0 - 999, places 1-10 never going up, place 10 more than the rest`, sp.start, sp.end);
            break;
          }
        }
      }
    }
    if (!any) err('no EVENT line', 0, 0);
    for (const b of begins) if (b.type && !events[b.type].loaded) err(`BEGIN ${TYPES[b.type].key}: that event has no EVENT line`, b.start, b.end);
    const race = raceStart ? { x: raceStart.x.value, z: raceStart.z.value } : { x: RACE_START.x, z: RACE_START.z };
    return { file: file.name, events, begins, hints, hideNpc, raceStart, race, racePoints, errors, diags: s.diags, eol: /\r\n/.test(text) ? '\r\n' : '\n' };
  }

  const cRound = v => (v < 0 ? -Math.round(-v) : Math.round(v));      // printf %.0f (round half away from zero)

  // the effective prize of a place (1-10) or the rest (0): { item id, amount } or null (GiveItem gives nothing)
  function prizeOf(e, place) {
    const r = place ? e.ranks[place - 1] : e.rest;
    if (!r) return null;
    return { id: r.id, amount: r.amount.value };
  }

  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    if (!ws.movers && ws.files.get('propmover.txt')) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: D, strings: ws.strings.map });
    // HIDE_NPC's key must be a character.inc block (prj.GetCharacter): the NPC files as the server loads them
    if (!ws.chars && ws.files.get('character.inc')) ws.chars = FRE.character.loadCharacters(ws.files, { defines: D, strings: ws.strings.map });
    const charKeys = new Set(ws.chars ? ws.chars.npcs.map(n => n.key.toLowerCase()) : []);
    // WdRace: World.inc's WI_WORLD_RACE map and its .wld (the maps are read after the first parse: setMapObjects parses again)
    let raceWorld;
    if (ws.worldFiles && ws.worldFiles.size && ws.worldList) {       // an empty map: the maps are not read yet (not checked)
      const w = ws.worldList().find(x => x.define === 'WI_WORLD_RACE');
      raceWorld = w ? readWld(ws.worldFiles.get(`world/${w.name}/${w.name}.wld`.toLowerCase())) : null;
    }
    const m = loadMiniEvent(ws.files.get('minievent.inc'), { defines: D, items: ws.items.items, movers: ws.movers ? ws.movers.movers : null, charKeys, raceWorld });
    m.raceWorld = raceWorld;
    m.charKeys = charKeys;
    return m;
  }

  FRE.miniEvent = { loadMiniEvent, fromWorkspace, findType, prizeOf, TYPES, KEYS, KEY, RANKS, RECIPE_ITEMS, ANSWER_LEN, DEF_POINTS, roundMax, NULL_ID, FILE: 'MiniEvent.inc',
    RACE_START, vecInWorld, readWld, cRound };
})(globalThis.FRE = globalThis.FRE || {});
