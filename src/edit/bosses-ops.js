// Boss Mechanics edits (bossMechanics.inc, ASCII, CRLF). The 09f500c3 / 3dac171b way: one statement per line, tab-indented,
// in the order inorder, tier, arena (v3 8da5dc21), SIGNATURE, PHASE lines, PATTERN [ rows ]. Every op takes the boss as parsed from the current text
// (FRE.bosses.parse) and returns splices; text outside the touched lines never changes. New lines copy the block's indent and EOL.
//   inorder / tier      -> only the value word changes; a missing tier gets its own line before SIGNATURE / PHASE / PATTERN
//   arena               -> like tier: the number changes; a missing one gets its own line before SIGNATURE / PHASE / PATTERN
//   SIGNATURE           -> its line is rewritten (or added before PHASE / PATTERN, or removed)
//   PHASE lines         -> all of them are rewritten in one go (add / change / remove / move = one undo step)
//   rows                -> the lines between [ and ] are rewritten (the attack chance %, add / remove / move / change a row)
//   + boss              -> a new block at the end (a copy of another boss, or one attack row); remove = the block's lines
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const B = () => FRE.bosses;

  const WORD = /^[\x21\x23-\x7e]+$/;                       // a word: printable ASCII, no space, no quote
  function word(v, what) { if (typeof v !== 'string' || !WORD.test(v) || /[{}\[\]]/.test(v) || v.includes('//')) throw new Error(`${what}: one word (ASCII, no spaces)`); return v; }
  function shoutText(v, what) {
    const s = String(v === undefined || v === null ? '' : v).trim();
    if (!s) throw new Error(`${what}: type the text players see`);
    if (s.length > 120 || /[^\x20-\x7e]/.test(s) || s.includes('"')) throw new Error(`${what}: plain ASCII without quotes, at most 120 characters`);
    return s;
  }
  function int(v, lo, hi, what) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${what}: a whole number from ${lo} to ${hi}`);
    return n;
  }

  const eolOf = (text, boss) => T.eolAt(text, boss.open ? boss.open.start : boss.start) || T.dominantEol(text);
  // the block's statement indent: the inorder / PATTERN line's, else one tab
  function indentOf(text, boss) {
    const a = boss.inorder ? boss.inorder.kw : boss.pattern ? boss.pattern.kw : null;
    return a ? T.indentOf(text, a.start) : '\t';
  }
  // the whole lines of a statement (its keyword to its last word)
  const lines = (text, kw, toks) => ({ start: T.lineStart(text, kw.start), end: T.lineEnd(text, (toks.length ? toks[toks.length - 1] : kw).end) });
  // where a new statement line goes: before the first of `before` that exists, else after the line of the last of `after`, else after "{"
  function insertAt(text, boss, before) {
    for (const a of before) if (a) return T.lineStart(text, a.start);
    return T.lineEnd(text, boss.open.end);
  }
  const line = (text, boss, content) => indentOf(text, boss) + content + eolOf(text, boss);
  function need(boss) { if (!boss || !boss.open || !boss.close) throw new Error('This boss block is not closed with "}": fix the file first'); }

  function setInorder(text, boss, v) {
    need(boss);
    if (v !== '0' && v !== '1') throw new Error('inorder: 0 (a random row each swing) or 1 (rows in order)');
    if (boss.inorder && boss.inorder.tok.text !== null) return boss.inorder.tok.text === v ? [] : [{ start: boss.inorder.tok.start, end: boss.inorder.tok.end, insert: v }];
    const at = T.lineEnd(text, boss.open.end);
    return [{ start: at, end: at, insert: line(text, boss, `inorder ${v}`) }];
  }

  // v: a BOSSTIER_ word, or null = no tier line
  function setTier(text, boss, v) {
    need(boss);
    if (v !== null && !B().MIX[v]) throw new Error('Pick a tier: Easy, Normal, Hard or World');
    const all = boss.tierStmts;
    if (v === null) return all.map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' }));
    if (all.length) {
      const out = all.slice(1).map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' }));
      const t = all[0].toks[0];
      if (t.text !== v) out.unshift({ start: t.start, end: t.end, insert: v });
      return out;
    }
    const at = insertAt(text, boss, [boss.arenaStmts[0] && boss.arenaStmts[0].kw, boss.sigStmts[0] && boss.sigStmts[0].kw, boss.phaseStmts[0] && boss.phaseStmts[0].kw, boss.pattern && boss.pattern.kw]);
    return [{ start: at, end: at, insert: line(text, boss, `tier ${v}`) }];
  }

  // v: the arena radius 12-48 (m), or null = no arena line
  function setArena(text, boss, v) {
    need(boss);
    const all = boss.arenaStmts;
    if (v === null) return all.map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' }));
    const n = String(int(v, 12, 48, 'Arena (m)'));
    if (all.length) {
      const out = all.slice(1).map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' }));
      const t = all[0].toks[0];
      if (t.text !== n) out.unshift({ start: t.start, end: t.end, insert: n });
      return out;
    }
    const at = insertAt(text, boss, [boss.sigStmts[0] && boss.sigStmts[0].kw, boss.phaseStmts[0] && boss.phaseStmts[0].kw, boss.pattern && boss.pattern.kw]);
    return [{ start: at, end: at, insert: line(text, boss, `arena ${n}`) }];
  }

  // sig: { type, hit, skill, every, shout } or null = no signature
  function sigLine(sig) {
    const L = B();
    if (sig.type === 'ATTACK_STORM' || !L.LIVE.includes(sig.type)) throw new Error('Signature: pick a shape (not Storm)');
    if (!L.HITS.includes(sig.hit)) throw new Error('Signature: pick where it hits');
    word(sig.skill, 'Signature skill');
    const every = int(sig.every, 2, 50, 'Signature every N swings');
    return `SIGNATURE ${sig.type} ${sig.hit} ${sig.skill} ${every} "${shoutText(sig.shout, 'Signature shout')}"`;
  }
  function setSignature(text, boss, sig) {
    need(boss);
    const all = boss.sigStmts;
    if (sig === null) return all.map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' }));
    const ins = sigLine(sig);
    if (all.length) {
      const first = all[0], last = first.toks.length ? first.toks[first.toks.length - 1] : first.kw;
      const out = [];
      if (text.slice(first.kw.start, last.end) !== ins) out.push({ start: first.kw.start, end: last.end, insert: ins });
      return out.concat(all.slice(1).map(s => Object.assign(lines(text, s.kw, s.toks), { insert: '' })));
    }
    const at = insertAt(text, boss, [boss.phaseStmts[0] && boss.phaseStmts[0].kw, boss.pattern && boss.pattern.kw]);
    return [{ start: at, end: at, insert: line(text, boss, ins) }];
  }

  // phases: [{ hp, speed, w: [Easy, Medium, Hard], shout }] in file order (hp going down), at most 4
  function phaseLine(p, k) {
    const hp = int(p.hp, 1, 99, `Phase ${k + 1} HP %`), sp = int(p.speed, 30, 100, `Phase ${k + 1} swing time %`);
    const w = [0, 1, 2].map(j => int(p.w[j], 0, 10, `Phase ${k + 1} ${B().TIER_WORD[j + 1]} weight`));
    const sh = p.shout && String(p.shout).trim() ? ` "${shoutText(p.shout, `Phase ${k + 1} shout`)}"` : '';
    return `PHASE ${hp} ${sp} ${w.join(' ')}${sh}`;
  }
  function setPhases(text, boss, phases) {
    need(boss);
    if (phases.length > 4) throw new Error('At most 4 phases');
    phases.forEach((p, k) => { if (k && Number(p.hp) >= Number(phases[k - 1].hp)) throw new Error(`Phase ${k + 1}: its HP % must be below phase ${k}'s (${phases[k - 1].hp} %)`); });
    const body = phases.map((p, k) => line(text, boss, phaseLine(p, k))).join('');
    const all = boss.phaseStmts;
    if (!all.length) {
      if (!body) return [];
      const at = insertAt(text, boss, [boss.pattern && boss.pattern.kw]);
      return [{ start: at, end: at, insert: body }];
    }
    const out = all.map((s, k) => Object.assign(lines(text, s.kw, s.toks), { insert: k === 0 ? body : '' }));
    return out[0].end - out[0].start === body.length && text.slice(out[0].start, out[0].end) === body && all.length === 1 ? [] : out;
  }

  // rows: [[type, hit, skill, delay, storm skill, apply]] in file order
  function rowLine(w, k) {
    const L = B();
    if (!Array.isArray(w) || w.length !== 6) throw new Error(`Row ${k + 1}: 6 words`);
    if (w[0] === 'ATTACK_NONE') { if (w.join(' ') !== L.NONE_ROW.join(' ')) throw new Error(`Row ${k + 1}: a no-attack row is ATTACK_NONE 0 0 0 0 0`); }
    else {
      if (!L.LIVE.includes(w[0])) throw new Error(`Row ${k + 1}: pick a shape`);
      if (!L.HITS.includes(w[1]) || !L.DELAYS.includes(w[3]) || !L.APPLIES.includes(w[5])) throw new Error(`Row ${k + 1}: pick where it hits, the delay and how it lands`);
      word(w[2], `Row ${k + 1} skill`); word(w[4], `Row ${k + 1} storm skill`);
    }
    return `BOSSATTACK ${w.join(' ')}`;
  }
  function setRows(text, boss, rows) {
    need(boss);
    if (!boss.pattern || !boss.pattern.close) throw new Error('This boss has no PATTERN [ ] block');
    if (!rows.some(w => w[0] !== 'ATTACK_NONE')) throw new Error('Keep at least one attack row (only no-attack rows: the boss would never attack)');
    const first = boss.rows[0];
    const ind = first ? T.indentOf(text, first.kw.start) : indentOf(text, boss) + '\t';
    const eol = eolOf(text, boss);
    const body = rows.map((w, k) => ind + rowLine(w, k) + eol).join('');
    if (!boss.rows.length) { const at = T.lineEnd(text, boss.pattern.open.end); return [{ start: at, end: at, insert: body }]; }
    const last = boss.rows[boss.rows.length - 1];
    const span = { start: T.lineStart(text, first.kw.start), end: T.lineEnd(text, last.toks[5].end) };
    return text.slice(span.start, span.end) === body ? [] : [Object.assign(span, { insert: body })];
  }
  const wordsOf = boss => boss.rows.map(r => r.words.slice());
  const setChance = (text, boss, pct) => setRows(text, boss, FRE.bossSim.spread(wordsOf(boss), pct).rows);

  // a new block at the end of the file for monster `mi`: a copy of `tmpl`'s block (its name replaced) or, without one, inorder 0
  // arena 24 (v3: the Target row reaches players) and one ATTACK_TARGET row with `skill` + 4 no-attack rows (20 % of swings)
  function addBoss(text, model, mi, tmpl, skill) {
    word(mi, 'Monster');
    if (!/^MI_\w+$/.test(mi)) throw new Error('Pick a monster (MI_…)');
    if (model.bosses.some(b => b.name === mi)) throw new Error(`${mi} already has a block`);
    const eol = T.dominantEol(text);
    let body;
    if (tmpl) {
      need(tmpl);
      const s = T.lineStart(text, tmpl.start), e = T.lineEnd(text, tmpl.close.end);
      const raw = text.slice(s, e);
      const at = tmpl.nameTok.start - s;
      body = raw.slice(0, at) + mi + raw.slice(at + tmpl.name.length);
      if (!/[\r\n]$/.test(body)) body += eol;
    } else {
      word(skill, 'Skill');
      const r = ['ATTACK_TARGET', 'BOSSATK_HITTARGET', skill, 'NO_DELAY', '0', 'APPLY_INSTANT'];
      const rows = [r, ...[1, 2, 3, 4].map(() => B().NONE_ROW)];
      body = [`monster ${mi}`, '{', '\tinorder 0', '\tarena 24', '\tPATTERN', '\t[', ...rows.map(w => '\t\tBOSSATTACK ' + w.join(' ')), '\t]', '}'].map(l => l + eol).join('');
    }
    const lead = text && !/[\r\n]$/.test(text) ? eol + eol : text ? eol : '';
    return [{ start: text.length, end: text.length, insert: lead + body }];
  }

  // the block's lines, and the blank line above it
  function removeBoss(text, boss) {
    need(boss);
    let s = T.lineStart(text, boss.start);
    const e = T.lineEnd(text, boss.close.end);
    if (s > 0) {
      const eolLen = text[s - 1] === '\n' && text[s - 2] === '\r' ? 2 : 1;
      const ps = T.lineStart(text, s - eolLen);
      if (/^[ \t]*(\r\n|\n|\r)$/.test(text.slice(ps, s))) s = ps;
    }
    return [{ start: s, end: e, insert: '' }];
  }

  FRE.bossesOps = { setInorder, setTier, setArena, setSignature, setPhases, setRows, setChance, addBoss, removeBoss, wordsOf, sigLine, phaseLine };
})(globalThis.FRE = globalThis.FRE || {});
