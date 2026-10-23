// Boss Mechanics (bossMechanics.inc, WorldServer only): each boss's attack rows, tier, signature attack and phases.
// V19 branch feat/boss-patterns (09f500c3 + 97aa58b7, design v2 3dac171b, design v3 8da5dc21), not merged and no C++ yet: the authority is the
// branch's checker, Tools/BossMechanics/checker.js (= check_boss_mechanics.py, 37 cases agree in test_checkers.py), ported here
// with the byte offset of every word so edits can splice. The planned C++ reader (PLANS/Boss Mechanics/CPP_PORT_LIST.md v2-2):
//   monster MI_x
//   {
//   	inorder 0|1
//   	tier BOSSTIER_EASY|NORMAL|HARD|WORLD                                  (optional)
//   	arena <12-48>      the room's radius in m (v3; needed when a shape below reaches players: ARENA_SHAPES)
//   	SIGNATURE <type> <hit> <skill> <every N swings> "shout"              (optional)
//   	PHASE <below hp %> <swing time %> <Easy> <Medium> <Hard weight> ["shout"]   (optional, up to 4, hp going down)
//   	PATTERN
//   	[
//   		BOSSATTACK <type> <hit> <skill> <delay> <storm skill> <apply>
//   	]
//   }
// ATTACK_NONE rows (BOSSATTACK ATTACK_NONE 0 0 0 0 0) = a swing with no boss attack. CRLF, ASCII. The skills must have a bomb type
// in propSkillAdd.csv column 37 (dwBombMine, the branch's 38-column file, 97aa58b7).
(function (FRE) {
  'use strict';

  // the words, as in checker.js (8da5dc21)
  const LIVE = ['ATTACK_AROUNDSELF', 'ATTACK_LINE', 'ATTACK_TRIANGLE', 'ATTACK_SQUARE',
    'ATTACK_RANDOM', 'ATTACK_TARGET', 'ATTACK_CROSS', 'ATTACK_STORM',
    'ATTACK_CORNER', 'ATTACK_CIRCLE1', 'ATTACK_CIRCLE2', 'ATTACK_CIRCLE3',
    'ATTACK_SPIRAL', 'ATTACK_RINGWAVE', 'ATTACK_CHECKER', 'ATTACK_SAFELANE', 'ATTACK_BEAM',
    'ATTACK_TWINSPIRAL', 'ATTACK_CROSS_SPIN', 'ATTACK_METEOR', 'ATTACK_HUNTER', 'ATTACK_PETALS',
    'ATTACK_STOMP', 'ATTACK_CHARGE', 'ATTACK_CROSSFIRE', 'ATTACK_QUADS', 'ATTACK_WALLS', 'ATTACK_SWEEP',
    'ATTACK_OUTER_RING', 'ATTACK_CROSSLINES', 'ATTACK_CROSSHAIR'];
  // design v3 (BOSS_DESIGN_V2.md 6): shapes that reach players across the room need the boss's arena
  const ARENA_SHAPES = ['ATTACK_HUNTER', 'ATTACK_CHARGE', 'ATTACK_CROSSFIRE', 'ATTACK_CROSSLINES', 'ATTACK_CROSSHAIR', 'ATTACK_WALLS', 'ATTACK_SWEEP',
    'ATTACK_OUTER_RING', 'ATTACK_STOMP', 'ATTACK_TARGET', 'ATTACK_STORM', 'ATTACK_CORNER', 'ATTACK_AROUNDSELF'];
  // shape tier 1 Easy / 2 Medium / 3 Hard (BOSS_DESIGN_V2.md 1, 6)
  const TIER_OF = {};
  'TARGET AROUNDSELF LINE CROSS TRIANGLE STORM STOMP CHARGE'.split(' ').forEach(t => { TIER_OF['ATTACK_' + t] = 1; });
  'SQUARE CIRCLE1 CIRCLE2 RANDOM CORNER SPIRAL CHECKER TWINSPIRAL CROSSFIRE QUADS CROSSLINES CROSSHAIR'.split(' ').forEach(t => { TIER_OF['ATTACK_' + t] = 2; });
  'CIRCLE3 RINGWAVE SAFELANE BEAM CROSS_SPIN METEOR HUNTER PETALS WALLS SWEEP OUTER_RING'.split(' ').forEach(t => { TIER_OF['ATTACK_' + t] = 3; });
  const TIER_WORD = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  // boss tier -> how many different shapes of each shape tier its real attacks use (BOSS_DESIGN_V2.md 2)
  const MIX = { BOSSTIER_EASY: { 1: 2, 2: 1 }, BOSSTIER_NORMAL: { 1: 1, 2: 2 }, BOSSTIER_HARD: { 2: 2, 3: 1 }, BOSSTIER_WORLD: { 2: 1, 3: 2 } };
  const TIERS = Object.keys(MIX);
  const DEAD = ['ATTACK_CROSSSQUARE', 'ATTACK_SINGLELINEFORWARD', 'ATTACK_LINE_CROSS',
    'ATTACK_LINE_CIRCLE', 'ATTACK_FOLLOWTARGET', 'ATTACK_LEFTSTRIKE',
    'ATTACK_RIGHTSTRIKE', 'ATTACK_BACKSTRIKE', 'ATTACK_FRONTSTRIKE',
    'ATTACK_LEFTSTRIKE2', 'ATTACK_RIGHTSTRIKE2', 'ATTACK_BACKSTRIKE2',
    'ATTACK_FRONTSTRIKE2', 'ATTACK_CIRCLE4', 'ATTACK_CIRCLE5',
    'ATTACK_SQUARE2', 'ATTACK_CIRCLE6'];
  const HITS = ['BOSSATK_HITSELF', 'BOSSATK_HITTARGET', 'BOSSATK_HITTYPE_ALL'];
  const DELAYS = ['NO_DELAY', 'RANDOM_DELAY'];
  const APPLIES = ['APPLY_INSTANT', 'APPLY_STEP'];
  const BOMBS = ['TYPE_BOMB', 'TYPE_MINE', 'TYPE_MOVER', 'TYPE_STORM', 'TYPE_BURN', 'TYPE_LINE', 'TYPE_FOLLOW'];
  const NONE_ROW = ['ATTACK_NONE', '0', '0', '0', '0', '0'];
  const has = (list, x) => list.indexOf(x) >= 0;

  // checker.js lex(): per line, // outside quotes ends the line; words = "quoted" | { } [ ] | anything else between spaces.
  // -> [{ line (1-based), text, start, end }] (offsets in the whole text)
  function lex(text) {
    const out = [];
    const re = /\r\n|\n|\r/g;
    let pos = 0, n = 0;
    for (;;) {
      const m = re.exec(text);
      const end = m ? m.index : text.length;
      let line = text.slice(pos, end);
      n++;
      let q = false;
      for (let c = 0; c < line.length; c++) {
        if (line[c] === '"') q = !q;
        else if (!q && line[c] === '/' && line[c + 1] === '/') { line = line.slice(0, c); break; }
      }
      const w = /"[^"]*"|[{}\[\]]|[^\s{}\[\]"]+/g;
      for (let t; (t = w.exec(line)) !== null;) out.push({ line: n, text: t[0], start: pos + t.index, end: pos + t.index + t[0].length });
      if (!m) break;
      pos = m.index + m[0].length;
    }
    return out;
  }

  // checker.js check(), with spans. ctx: { monsters: Set of MI_ names, skills: Set of SI_ names, bombs: Map SI -> [column 37 cells] }
  // -> { errors: [{ line, code, mi, msg, text: 'line: msg' }], bosses: [boss], count }
  //   boss: { name, line, nameTok, start (the 'monster' word), open, close (the '}' token or null), inorder: { value, tok } | null,
  //     tier: { value, tok, kw } | null, arena: { value, tok, kw } | null, sig: { words, toks, kw } | null, phases: [{ hp, speed, w: [E, M, H], shout, kw, toks }],
  //     pattern: { kw, open, close } | null, rows: [{ line, words, toks, kw }], live, shapes: [type] }
  function parse(text, ctx) {
    const errors = [], bosses = [], seen = {};
    const toks = lex(text);
    let i = 0;
    const err = (line, code, mi, msg) => errors.push({ line, code, mi, msg, text: line + ': ' + msg });
    const END = () => ({ line: toks.length ? toks[toks.length - 1].line : 0, text: null, start: text.length, end: text.length });
    const next = () => (i >= toks.length ? END() : toks[i++]);

    function checkSkill(mi, line, skill, what) {
      if (!ctx.skills.has(skill)) { err(line, 'BM_SKILL', mi, mi + ': ' + what + " '" + skill + "' is not in defineSkill.h"); return; }
      const cells = ctx.bombs.get(skill);
      if (!cells || !cells.length) { err(line, 'BM_SKILL', mi, mi + ': ' + what + " '" + skill + "' has no propSkillAdd.csv row"); return; }
      for (const c of cells) if (has(BOMBS, c)) return;
      const shown = cells.slice().sort().filter((c, j, a) => j === 0 || a[j - 1] !== c);
      err(line, 'BM_SKILL', mi, mi + ': ' + what + " '" + skill + "' has no bomb type in propSkillAdd.csv column 37 (found " + shown.join(', ') + ')');
    }
    function checkRow(mi, line, w) {
      if (w.join(' ') === NONE_ROW.join(' ')) return 0;
      if (w[0] === 'ATTACK_NONE') { err(line, 'BM_NONE_ROW', mi, mi + ": ATTACK_NONE row must be 'ATTACK_NONE 0 0 0 0 0'"); return 0; }
      if (has(DEAD, w[0])) { err(line, 'BM_DEAD', mi, mi + ': ' + w[0] + ' is never fired by the server, use one of the 31 types'); return 0; }
      if (w[0] === 'ATTACK_ZIGZAG') { err(line, 'BM_OLD_ZIGZAG', mi, mi + ': ATTACK_ZIGZAG is the old name, write ATTACK_CROSSFIRE'); return 0; }
      if (!has(LIVE, w[0])) { err(line, 'BM_WORD', mi, mi + ": unknown attack type '" + w[0] + "'"); return 0; }
      if (!has(HITS, w[1])) err(line, 'BM_WORD', mi, mi + ": unknown hit type '" + w[1] + "'");
      if (!has(DELAYS, w[3])) err(line, 'BM_WORD', mi, mi + ": unknown delay '" + w[3] + "'");
      if (!has(APPLIES, w[5])) err(line, 'BM_WORD', mi, mi + ": unknown apply '" + w[5] + "'");
      checkSkill(mi, line, w[2], 'skill');
      if (w[0] === 'ATTACK_STORM') {
        if (w[4] === '0') err(line, 'BM_STORM', mi, mi + ': ATTACK_STORM needs a storm skill (5th word)');
        else checkSkill(mi, line, w[4], 'storm skill');
      } else if (w[4] !== '0') {
        err(line, 'BM_STORM', mi, mi + ": storm skill '" + w[4] + "' only works on ATTACK_STORM rows");
      }
      return 1;
    }
    const sayMix = d => { const ks = Object.keys(d).sort(); return ks.length ? ks.map(k => d[k] + ' ' + TIER_WORD[k]).join(', ') : 'none'; };
    function checkShout(mi, line, sh, what, code) {
      if (!(sh.length >= 3 && sh[0] === '"' && sh[sh.length - 1] === '"' && sh.slice(1, -1).trim())) err(line, code, mi, mi + ': ' + what + ' shout must be a "quoted text", found \'' + sh + "'");
      else if (sh.length - 2 > 120 || /[^\x00-\x7e]/.test(sh)) err(line, code, mi, mi + ': ' + what + ' shout: plain ASCII, at most 120 characters');
    }
    function checkSig(mi, line, w) {
      if (w.length !== 5) { err(line, 'BM_SIG', mi, mi + ': SIGNATURE needs 5 words after it (type hit skill every "shout"), found ' + w.length); return; }
      if (w[0] === 'ATTACK_STORM' || !has(LIVE, w[0])) err(line, 'BM_SIG', mi, mi + ": SIGNATURE type '" + w[0] + "' must be one of the shapes (not NONE / STORM)");
      if (!has(HITS, w[1])) err(line, 'BM_WORD', mi, mi + ": unknown hit type '" + w[1] + "'");
      checkSkill(mi, line, w[2], 'signature skill');
      if (!/^\d+$/.test(w[3]) || +w[3] < 2 || +w[3] > 50) err(line, 'BM_SIG', mi, mi + ": SIGNATURE every must be 2 to 50 swings, found '" + w[3] + "'");
      checkShout(mi, line, w[4], 'SIGNATURE', 'BM_SIG');
    }
    const PHASE_RANGES = [[1, 99, 'hp %'], [30, 100, 'swing time %'], [0, 10, 'Easy weight'], [0, 10, 'Medium weight'], [0, 10, 'Hard weight']];
    function checkPhase(mi, line, w) {
      if (w.length !== 5 && w.length !== 6) { err(line, 'BM_PHASE', mi, mi + ': PHASE needs 5 numbers (hp %, swing time %, Easy, Medium, Hard weight) and an optional "shout", found ' + w.length + ' words'); return null; }
      let good = true;
      PHASE_RANGES.forEach((r, k) => {
        if (!/^\d+$/.test(w[k]) || +w[k] < r[0] || +w[k] > r[1]) { err(line, 'BM_PHASE', mi, mi + ': PHASE ' + r[2] + ' must be ' + r[0] + ' to ' + r[1] + ", found '" + w[k] + "'"); good = false; }
      });
      if (w.length === 6) checkShout(mi, line, w[5], 'PHASE', 'BM_PHASE');
      return good ? w.slice(0, 5).map(Number) : null;
    }

    while (i < toks.length) {
      let t = next(), line = t.line, word = t.text;
      if (word !== 'monster') { err(line, 'BM_SYNTAX', null, "expected 'monster', found '" + word + "'"); continue; }
      const kwMonster = t;
      t = next(); line = t.line; const mi = t.text, nameTok = t;
      if (mi === null) { err(line, 'BM_SYNTAX', null, "file ends after 'monster'"); break; }
      if (!ctx.monsters.has(mi)) err(line, 'BM_MONSTER', mi, mi + ' is not in defineObj.h (server would crash at boot)');
      if (seen[mi]) err(line, 'BM_DUP', mi, mi + ' already listed on line ' + seen[mi] + ' (the second block replaces the first)');
      if (!seen[mi]) seen[mi] = line;
      const boss = { name: mi, line, nameTok, start: kwMonster.start, open: null, close: null, inorder: null, tier: null, sig: null, phases: [],
        pattern: null, rows: [], live: 0, shapes: [], phaseStmts: [], sigStmts: [], tierStmts: [], arena: null, arenaStmts: [] };
      t = next(); line = t.line; word = t.text;
      if (word !== '{') { err(line, 'BM_SYNTAX', mi, mi + ": expected '{', found '" + word + "'"); continue; }
      boss.open = t;
      bosses.push(boss);
      let pattern = false, tier = null, sig = false;
      const shapes = {};
      for (;;) {
        t = next(); line = t.line; word = t.text;
        if (word === null) { err(line, 'BM_SYNTAX', mi, mi + ": file ends before '}'"); break; }
        if (word === '}') { boss.close = t; break; }
        if (word === 'inorder') {
          const kw = t;
          t = next();
          if (t.text !== '0' && t.text !== '1') err(t.line, 'BM_INORDER', mi, mi + ": inorder must be 0 or 1, found '" + t.text + "'");
          boss.inorder = { value: t.text, tok: t, kw };
          continue;
        }
        if (word === 'tier') {
          const kw = t;
          t = next();
          boss.tierStmts.push({ kw, toks: [t] });
          if (!MIX[t.text]) err(t.line, 'BM_TIER', mi, mi + ": tier must be BOSSTIER_EASY, _NORMAL, _HARD or _WORLD, found '" + t.text + "'");
          else if (tier) err(t.line, 'BM_TIER', mi, mi + ': tier written twice');
          else { tier = [t.line, t.text]; boss.tier = { value: t.text, tok: t, kw }; }
          continue;
        }
        if (word === 'arena') {
          const kw = t;
          t = next();
          boss.arenaStmts.push({ kw, toks: [t] });
          if (t.text === null || !/^\d+$/.test(t.text) || +t.text < 12 || +t.text > 48) err(t.line, 'BM_ARENA', mi, mi + ": arena must be 12 to 48 (m), found '" + t.text + "'");
          else if (boss.arena) err(t.line, 'BM_ARENA', mi, mi + ': arena written twice');
          else boss.arena = { value: +t.text, tok: t, kw };
          continue;
        }
        if (word === 'RAGE') {
          err(line, 'BM_RAGE', mi, mi + ': RAGE is the old name, write PHASE <hp> <speed> <Easy> <Medium> <Hard weight> "shout" (the weight on its hardest tier)');
          while (i < toks.length && toks[i].line === line) next();
          continue;
        }
        if (word === 'SIGNATURE' || word === 'PHASE') {
          const kw = t, at = line, ws = [], wt = [], want = word === 'PHASE' ? 6 : 5;
          while (ws.length < want && i < toks.length && toks[i].line === at) { const x = next(); ws.push(x.text); wt.push(x); }
          if (word === 'PHASE') {
            boss.phaseStmts.push({ kw, toks: wt });
            if (boss.phases.length === 4) err(at, 'BM_PHASE', mi, mi + ': at most 4 PHASE lines');
            const ph = checkPhase(mi, at, ws), prev = boss.phases[boss.phases.length - 1];
            if (ph) {
              if (prev && ph[0] >= prev.hp) err(at, 'BM_PHASE', mi, mi + ': PHASE hp must go down in file order (' + ph[0] + ' after ' + prev.hp + ')');
              boss.phases.push({ line: at, hp: ph[0], speed: ph[1], w: ph.slice(2), shout: ws.length === 6 ? ws[5].slice(1, -1) : '', kw, toks: wt });
            } else boss.badPhase = true;
          } else {
            boss.sigStmts.push({ kw, toks: wt });
            if (sig) err(at, 'BM_SIG', mi, mi + ': SIGNATURE written twice (one per boss)');
            sig = true;
            checkSig(mi, at, ws);
            if (!boss.sig) boss.sig = { words: ws, toks: wt, kw, line: at };
          }
          continue;
        }
        if (word === 'randomized') { err(line, 'BM_INORDER', mi, mi + ": 'randomized' is the old name, write 'inorder'"); next(); continue; }
        if (word === 'PATTERN') {
          if (boss.inorder === null) err(line, 'BM_INORDER', mi, mi + ": 'inorder' must come before PATTERN");
          pattern = true;
          const kw = t;
          t = next(); line = t.line; word = t.text;
          if (word !== '[') { err(line, 'BM_SYNTAX', mi, mi + ": expected '[' after PATTERN, found '" + word + "'"); continue; }
          boss.pattern = { kw, open: t, close: null };
          for (;;) {
            t = next(); line = t.line; word = t.text;
            if (word === null) { err(line, 'BM_SYNTAX', mi, mi + ": file ends before ']'"); break; }
            if (word === ']') { boss.pattern.close = t; break; }
            if (word !== 'BOSSATTACK') { err(line, 'BM_SYNTAX', mi, mi + ': expected BOSSATTACK, found \'' + word + "'"); continue; }
            const kwRow = t, rowLine = line, w = [], wt = [];
            while (w.length < 6 && i < toks.length && toks[i].line === rowLine &&
                   toks[i].text !== 'BOSSATTACK' && toks[i].text !== ']' && toks[i].text !== '}') { const x = next(); w.push(x.text); wt.push(x); }
            if (w.length !== 6) { err(rowLine, 'BM_SYNTAX', mi, mi + ': BOSSATTACK needs 6 words after it, found ' + w.length); continue; }
            boss.rows.push({ line: rowLine, words: w, toks: wt, kw: kwRow });
            if (checkRow(mi, rowLine, w)) { boss.live++; shapes[w[0]] = true; }
          }
          continue;
        }
        err(line, 'BM_SYNTAX', mi, mi + ": unknown word '" + word + "'");
      }
      if (!pattern) err(line, 'BM_NO_ATTACK', mi, mi + ': no PATTERN block');
      else if (boss.live === 0) err(line, 'BM_NO_ATTACK', mi, mi + ': no real attack (only ATTACK_NONE rows)');
      boss.shapes = Object.keys(shapes);
      if (tier) {
        const want = MIX[tier[1]], have = {};
        boss.shapes.forEach(s => { have[TIER_OF[s]] = (have[TIER_OF[s]] || 0) + 1; });
        if (sayMix(have) !== sayMix(want)) err(tier[0], 'BM_MIX', mi, mi + ': ' + tier[1] + ' needs ' + sayMix(want) + ' different shapes, has ' + sayMix(have));
      }
      if (!boss.arena) {
        const need = boss.shapes.filter(x => has(ARENA_SHAPES, x)).sort();
        const ls = boss.sigStmts[boss.sigStmts.length - 1], sk = ls && ls.toks.length ? ls.toks[0].text : null;   // the last SIGNATURE line, as checker.js
        if (sk && has(ARENA_SHAPES, sk) && !has(need, sk)) need.push(sk);
        if (need.length) err(line, 'BM_ARENA_NEEDED', mi, mi + ': no arena line, needed by ' + need.join(', ') + ' (write arena <12-48>)');
      }
      const used = [...new Set(boss.shapes.map(x => TIER_OF[x]))];
      boss.phases.forEach(p => {
        if (used.length && used.every(tt => p.w[tt - 1] === 0)) err(p.line, 'BM_PHASE', mi, mi + ': PHASE ' + p.hp + ' sets every shape tier the boss uses to 0 (it would never attack)');
      });
      boss.end = boss.close ? boss.close.end : text.length;
    }
    return { errors, bosses, count: Object.keys(seen).length };
  }

  // the mix line: what the tier needs and what the boss has, e.g. { want: '2 Medium, 1 Hard', have: '2 Medium, 1 Hard', ok: true }
  function mixOf(tier, shapes) {
    const say = d => { const ks = Object.keys(d).sort(); return ks.length ? ks.map(k => d[k] + ' ' + TIER_WORD[k]).join(', ') : 'none'; };
    const have = {};
    shapes.forEach(s => { if (TIER_OF[s]) have[TIER_OF[s]] = (have[TIER_OF[s]] || 0) + 1; });
    const want = MIX[tier] ? say(MIX[tier]) : null;
    return { want, have: say(have), ok: want === null || want === say(have) };
  }

  // propSkillAdd.csv, the way the branch's tools read it (build_simulator.py / check_boss_mechanics.py bomb_skills): one row per line,
  // cells split on ",", column 2 the SI_ name, column 37 the bomb type, column 38 the explode timer. The C++ reader of the 38 columns
  // is not written yet (CPP_PORT_LIST.md).  -> { bombs: Map SI -> [column 37 cells], rows: Map SI -> {min, max, dest0, range, pain, time, bomb, timer} }
  const COL = { min: 3, max: 4, dest0: 18, range: 28, pain: 30, time: 31, timer: 37 };
  function skillTable(text) {
    const bombs = new Map(), rows = new Map();
    const num = c => (/^-?\d+$/.test(c) ? parseInt(c, 10) : null);
    for (const line of text.split(/\r\n|\n|\r/)) {
      const c = line.split(',');
      if (c.length < 37 || !c[1].startsWith('SI_')) continue;
      const name = c[1], b = c[36].trim();
      if (!bombs.has(name)) bombs.set(name, []);
      if (!bombs.get(name).includes(b)) bombs.get(name).push(b);
      if (c.length >= 38 && !rows.has(name) && c[36].startsWith('TYPE_')) {
        const r = {};
        for (const [k, ix] of Object.entries(COL)) r[k] = num(c[ix].trim());
        r.bomb = b;
        rows.set(name, r);
      }
    }
    return { bombs, rows };
  }

  // the task's view of the workspace: the parsed file, the names of the monsters, the bomb skills
  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    const f = ws.files.get('bossmechanics.inc');
    const sk = ws.files.get('propskilladd.csv');
    const tab = skillTable(sk ? sk.text : '');
    const monsters = new Set(), skills = new Set();
    for (const k of D.keys()) { if (k.startsWith('MI_')) monsters.add(k); else if (k.startsWith('SI_')) skills.add(k); }
    const m = parse(f.text, { monsters, skills, bombs: tab.bombs });
    if (!ws.movers && ws.files.get('propmover.txt')) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: D, strings: ws.strings.map });
    const byDefine = new Map();
    if (ws.movers) for (const mv of ws.movers.movers.values()) if (mv.define) byDefine.set(mv.define, mv);
    for (const b of m.bosses) b.mover = byDefine.get(b.name) || null;
    // skills a row may use: a bomb type in column 37 and in defineSkill.h (the storm skill list: the TYPE_STORM ones)
    const bombSkills = [...tab.rows.keys()].filter(s => skills.has(s) && has(BOMBS, tab.rows.get(s).bomb)).sort();
    // monsters a new block can name: bosses, mid bosses and giants (RANK_BOSS 4, RANK_MIDBOSS 5, RANK_SUPER 7) not listed yet
    const listed = new Set(m.bosses.map(b => b.name));
    const candidates = ws.movers ? [...ws.movers.movers.values()].filter(mv => [4, 5, 7].includes(mv.rankId) && mv.define && monsters.has(mv.define) && !listed.has(mv.define)) : [];
    return Object.assign(m, { file: f, skillRows: tab.rows, bombs: tab.bombs, bombSkills, monsters, skills, candidates, byName: new Map(m.bosses.map(b => [b.name, b])) });
  }

  // the arena from pasted /position lines (design v3): line 1 = where the boss stands, the others = the room's edge.
  // radius = the farthest edge spot (x / z only, /position units = m), rounded, kept in 12-48.
  // -> { spots: [{ x, z }], skipped: [line text], far (m, 1 decimal) | null, arena | null, clamped }
  function arenaFromPositions(text) {
    const spots = [], skipped = [];
    for (const l of String(text || '').split(/\r\n|\n|\r/)) {
      if (!l.trim()) continue;
      const p = FRE.npcEditOps.parsePosition(l);
      if (p) spots.push({ x: p.x, z: p.z }); else skipped.push(l.trim());
    }
    if (spots.length < 2) return { spots, skipped, far: null, arena: null, clamped: false };
    const c = spots[0];
    const far = Math.max(...spots.slice(1).map(p => Math.hypot(p.x - c.x, p.z - c.z)));
    const r = Math.round(far), arena = Math.min(48, Math.max(12, r));
    return { spots, skipped, far: Math.round(far * 10) / 10, arena, clamped: arena !== r };
  }

  const shortType = t => String(t).replace(/^ATTACK_/, '');
  FRE.bosses = { lex, parse, skillTable, fromWorkspace, mixOf, shortType, arenaFromPositions, ARENA_SHAPES, LIVE, TIER_OF, TIER_WORD, MIX, TIERS, DEAD, HITS, DELAYS, APPLIES, BOMBS, NONE_ROW, FILE: 'bossMechanics.inc' };
})(globalThis.FRE = globalThis.FRE || {});
