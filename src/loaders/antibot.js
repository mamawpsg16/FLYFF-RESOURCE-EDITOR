// Bot Check (task "Bot Check"): Server/Resource/AntiBot.inc, read the way CAntiBotMng::LoadScript reads it
// (WORLDSERVER/AntiBotMng.cpp, V19 78f3239f; the tuning lines V19 d816e99f, NOT YET BUILT OR TESTED: an older WorldServer
// skips them and uses the compiled CustomCommon.h ANTIBOT_* values).
//   ANTIBOT_ITEM <item> "<word>"   skipped (error_*.txt) when the item does not exist, the word is empty, or the word (any case) /
//                                  the item is already in the list; fewer than ANTIBOT_CHOICES (6) good lines = the list is not
//                                  taken (at start: no puzzles at all; /antibot reload: the old list stays).
//   SCORE_LIMIT n (1-1000000) RANDOM_CHANCE n (0-1000000) CAMP_RADIUS f (1-1000) CAMP_MINUTES n (1-1440) COOLDOWN_MINUTES n
//   (0-1440) ANSWER_SECONDS n (10-3600) FROZEN_SECONDS n (10-86400) CLICKS n (1-20) SKIP_GM 0|1   out of range = the default
//   NO_CHECK_WORLD <world>         a map where kills never count (a world the server does not load is skipped)
// One CScript token stream: any other word is skipped. The words and the tuning change together.
// SERVER ONLY: the words are the answer key (never a Client copy).
(function (FRE) {
  'use strict';
  const CHOICES = 6;      // ANTIBOT_CHOICES (CustomCommon.h:243): compiled into the game's window too
  // key, label, default (CustomCommon.h:235-245), min, max, float?, help
  const TUNING = [
    { key: 'SCORE_LIMIT', label: 'Score that opens the puzzle', def: 1200, min: 1, max: 1000000,
      help: 'Each monster kill adds 1 (2 while camping). At this score the puzzle opens. Kills in towns, events, PvP maps, guild houses and party dungeons never count.' },
    { key: 'RANDOM_CHANCE', label: 'Random check: 1 in …', def: 2000, min: 0, max: 1000000,
      help: 'Every counted kill also opens the puzzle with this chance (2000 = 1 in 2,000). 0 = off.' },
    { key: 'CAMP_RADIUS', label: 'Camping: still within … metres', def: 40, min: 1, max: 1000, float: true,
      help: 'A player who stays this close to one spot …' },
    { key: 'CAMP_MINUTES', label: '… for … minutes', def: 20, min: 1, max: 1440,
      help: '… for this long counts as camping: each kill then adds 2.' },
    { key: 'COOLDOWN_MINUTES', label: 'Rest after a right answer (minutes)', def: 30, min: 0, max: 1440,
      help: 'No new puzzle for this long after the right picture was clicked.' },
    { key: 'ANSWER_SECONDS', label: 'Time to answer (seconds)', def: 120, min: 10, max: 3600,
      help: 'Then the player is frozen (cannot move, attack, use items or teleport) and gets new pictures.' },
    { key: 'FROZEN_SECONDS', label: 'Frozen for (seconds)', def: 300, min: 10, max: 86400,
      help: 'No right answer in this time: sent to town, and the next counted kill asks again.' },
    { key: 'CLICKS', label: 'Clicks per stage', def: 3, min: 1, max: 20,
      help: 'Wrong clicks allowed while asking (then frozen) and again while frozen. A wrong click shows new pictures.' },
    { key: 'SKIP_GM', label: 'GM accounts never get it', def: 1, min: 0, max: 1, bool: true,
      help: 'On = GMs only get it with /antibot. Turn off to test it on a GM account.' },
  ];
  const BY = new Map(TUNING.map(t => [t.key, t]));
  const { Script } = FRE.lexer;

  // ctx: { defines, items (Map id -> item), worlds (Set of loaded world ids) | null }
  function loadAntiBot(file, ctx = {}) {
    const text = file.text, s = new Script(text, { file: file.name, defines: ctx.defines || new Map(), diags: [] });
    const lines = [], skipped = [], tune = {}, worlds = [], errors = [];
    for (const t of TUNING) tune[t.key] = { value: t.def, set: null };
    const itemOk = id => !!(ctx.items && ctx.items.get(id >>> 0));
    for (let t = s.getToken(); t.type !== 'eof'; t = s.getToken()) {
      const start = t.start;
      if (t.text === 'ANTIBOT_ITEM') {
        const n = s.getNumber(), w = s.getToken();
        const item = { value: n.value >>> 0, start: n.start, end: n.end, define: n.define || text.slice(n.start, n.end) };
        const word = { text: w.type === 'eof' ? '' : w.text, start: w.start, end: w.end };
        const rec = { kw: 'ANTIBOT_ITEM', start, end: w.end, item, word, id: item.value };
        const dup = lines.some(x => x.word.text.toLowerCase() === word.text.toLowerCase() || x.id === rec.id);
        if (!itemOk(rec.id)) { rec.why = `item ${rec.id} ("${word.text}") does not exist - skipped`; skipped.push(rec); }
        else if (!word.text || dup) { rec.why = `item ${rec.id} "${word.text}" - empty or repeated word / item - skipped`; skipped.push(rec); }
        else lines.push(rec);
      } else if (BY.has(t.text)) {
        const k = BY.get(t.text), v = k.float ? s.getFloat() : s.getNumber();
        const value = k.float ? Math.fround(v.value) : v.value;
        const rec = { key: k.key, start, end: v.end, valueSpan: { start: v.start, end: v.end }, value };
        // ABNumber: out of range = the DEFAULT (even after a good line of the same key); CAMP_RADIUS out of range = unchanged
        if (!(value >= k.min && value <= k.max)) {
          rec.why = `${k.key} ${value} is not ${k.min} - ${k.max}: ${k.float ? 'the value before' : k.def} kept`; errors.push(rec);
          if (!k.float) tune[k.key] = { value: k.def, set: null, lines: tune[k.key].lines };
        } else tune[k.key] = { value, set: rec, lines: tune[k.key].lines };
        tune[k.key].lines = (tune[k.key].lines || []).concat(rec);
      } else if (t.text === 'NO_CHECK_WORLD') {
        const n = s.getNumber();
        const rec = { start, end: n.end, world: n.value >>> 0, define: n.define || text.slice(n.start, n.end), span: { start: n.start, end: n.end } };
        if (ctx.worlds && !ctx.worlds.has(rec.world)) { rec.why = `NO_CHECK_WORLD ${rec.world} is not a loaded map - skipped`; errors.push(rec); }
        else worlds.push(rec);
      }
    }
    const ok = lines.length >= CHOICES;
    return { file: file.name, lines, skipped, tune, worlds, errors, ok, eol: /\r\n/.test(text) ? '\r\n' : '\n' };
  }

  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    let worlds = null;
    try { if (ws.files.get('world.inc')) worlds = new Set(ws.worldList().map(w => w.id >>> 0)); } catch (e) { worlds = null; }
    return loadAntiBot(ws.files.get('antibot.inc'), { defines: D, items: ws.items.items, worlds });
  }
  const value = (m, key) => m.tune[key].value;

  FRE.antiBot = { loadAntiBot, fromWorkspace, value, TUNING, BY, CHOICES, FILE: 'AntiBot.inc' };
})(globalThis.FRE = globalThis.FRE || {});
