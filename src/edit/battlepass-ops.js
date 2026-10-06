// BattlePass.inc edits as minimal splices. New rows copy the layout of an existing
// row (tabs stay tabs, space-padded columns stay aligned), and the file's LF.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const BP = () => FRE.battlePass;

  const amount = (v, what, min = 1, max = BP().MAX_BPOINTS) => { T.checkAmount(v, min, max, what); return String(v); };

  // Build a row like `sample`: tokens [{start,end}] of the sample, new token texts in `vals`.
  // A gap of plain spaces is re-padded so the next column starts where it did.
  function rowLike(text, toks, vals) {
    let s = '';
    for (let i = 0; i < toks.length; i++) {
      s += vals[i];
      if (i === toks.length - 1) break;
      const gap = text.slice(toks[i].end, toks[i + 1].start);
      if (/^ +$/.test(gap)) s += ' '.repeat(Math.max(1, toks[i + 1].start - toks[i].start - vals[i].length));
      else s += gap;
    }
    return s;
  }
  const kwTok = r => ({ start: r.start, end: r.start + (r.block === 'BP4' ? 8 : 9) });   // "BPReward" / "BPMonster"

  // "// lv123 normal - Small Kingster": the comment season 1's BP5 rows carry
  function monsterComment(mv) {
    const name = mv.name && FRE.bytes.isPrintableAscii(mv.name) ? mv.name : mv.define;
    return `// lv${mv.level} ${mv.rank} - ${name}`;
  }
  const isGenerated = c => !!c && /^\/\/ lv\d+ \S+ - /.test(c.text);

  // --- season ------------------------------------------------------------
  function checkDate(ymd) {
    const e = BP().seasonEnd(ymd);
    if (String(ymd).length !== 8 || !e || e.rolled) throw new Error(`${ymd} is not a valid YYYYMMDD date`);
  }
  function setEndDate(pass, ymd) { checkDate(ymd); return T.replaceSpan(pass.time, ymd); }

  // A new season, the way BattlePass.inc's header says: new end date, and nType + 1 on
  // the pass AND every reward row of the current season (the upgrade check compares both,
  // DPSrvr.cpp:11893). The pass item is reused (commit 2f783090).
  function newSeasonPlan(model, ymd) {
    checkDate(ymd);
    const p = model.pass;
    if (!p) throw new Error('BattlePass.inc has no BPItem row');
    const from = p.type.value, to = from + 1;
    const rows = model.rows.BP4.filter(r => r.type.value === from);
    const splices = [...T.replaceSpan(p.time, ymd), ...T.replaceSpan(p.type, to), ...rows.flatMap(r => T.replaceSpan(r.type, to))];
    return { from, to, rows, splices };
  }

  // --- reward ladder --------------------------------------------------------
  const setRewardValue = (row, field, v) => T.replaceSpan(row[field], amount(v, field === 'qty' ? 'quantity' : 'points', 1, field === 'qty' ? 2147483647 : BP().MAX_BPOINTS));
  function setRewardItem(row, define) { T.checkDefine(define); return T.replaceSpan(row.item, define); }
  function setRewardTexture(row, field, name) {
    if (/["\r\n]/.test(name) || !FRE.bytes.isPrintableAscii(name)) throw new Error('texture name must be plain ASCII without quotes');
    return T.replaceSpan(row[field], `"${name}"`);
  }
  // next level at the end of the current season's ladder
  function addReward(text, model, define, qty, points) {
    T.checkDefine(define);
    const type = model.pass ? model.pass.type.value : 1;
    const own = model.rows.BP4.filter(r => r.type.value === type);
    const level = own.reduce((m, r) => Math.max(m, r.level.value), 0) + 1;
    const sample = own[own.length - 1] || model.rows.BP4[model.rows.BP4.length - 1];
    const vals = ['BPReward', String(type), String(level), amount(points, 'points'), define, amount(qty, 'quantity', 1, 2147483647), '""', '""', '""'];
    if (sample) {
      const toks = [kwTok(sample), sample.type, sample.level, sample.points, sample.item, sample.qty, sample.logo, sample.rarity, sample.icon];
      return { level, splices: T.insertRowAfter(text, sample, rowLike(text, toks, vals)) };
    }
    const block = (model.blocks.BP4 || [])[0];
    if (!block) throw new Error('BattlePass.inc has no BP4 block');
    return { level, splices: T.insertRowBelowLine(text, block.open.start, vals.join('\t')) };
  }
  // only the top level can go: removing one in the middle leaves a gap players get stuck at
  function removeReward(text, model, row) {
    const own = model.rows.BP4.filter(r => r.type.value === row.type.value);
    if (own.some(r => r.level.value > row.level.value)) throw new Error(`level ${row.level.value} is not the last level; removing it would leave a gap`);
    return T.removeRow(text, row);
  }

  // Remove any level of the current season without leaving a gap: its row goes, and every
  // level above moves down one (each keeps its reward and its cost).
  function removeLevel(text, model, row) {
    const type = row.type.value, lv = row.level.value;
    const out = [...T.removeRow(text, row)];
    for (const r of model.rows.BP4) if (r !== row && r.type.value === type && r.level.value > lv) out.push(...T.replaceSpan(r.level, r.level.value - 1));
    return out;
  }

  // A reward put on the current season: as a new top level (level null) or on an existing
  // level (its reward, quantity and cost replaced). -> splices
  function placeReward(text, model, { define, qty, points, level }) {
    T.checkDefine(define);
    if (level === null || level === undefined) return addReward(text, model, define, qty, points).splices;
    const type = model.pass ? model.pass.type.value : null;
    const r = model.rows.BP4.find(x => x.type.value === type && x.level.value === level);
    if (!r) throw new Error(`the current season has no level ${level}`);
    const out = [];
    if (text.slice(r.item.start, r.item.end) !== define) out.push(...T.replaceSpan(r.item, define));
    if (r.qty.value !== qty) out.push(...T.replaceSpan(r.qty, amount(qty, 'quantity', 1, 2147483647)));
    if (r.points.value !== points) out.push(...T.replaceSpan(r.points, amount(points, 'points')));
    return out;
  }

  // ↑ / ↓ on the ladder: two levels swap rewards (item, quantity, textures); each keeps its cost
  function swapRewards(text, a, b) {
    const out = [];
    for (const k of ['item', 'qty', 'logo', 'rarity', 'icon']) {
      const ta = text.slice(a[k].start, a[k].end), tb = text.slice(b[k].start, b[k].end);
      if (ta !== tb) out.push(...T.replaceSpan(a[k], tb), ...T.replaceSpan(b[k], ta));
    }
    return out;
  }

  // Make the current season's ladder equal to a past one (FRE.battlePass.seasonHistory):
  // levels in both get only their differing values replaced, levels the current season lacks
  // are added after its top kept row (in order), current levels above the past top are removed.
  // nType, the end date and the monsters stay. -> { splices, changes: [text] }
  function restoreLadder(text, model, past, defines) {
    if (!model.pass) throw new Error('BattlePass.inc has no BPItem row');
    const type = model.pass.type.value;
    const cur = new Map();
    for (const r of model.rows.BP4) if (r.type.value === type && !cur.has(r.level.value)) cur.set(r.level.value, r);
    for (const p of past) { T.checkDefine(p.define); if (!defines.has(p.define)) throw new Error(`level ${p.level}: ${p.define} is not #defined any more`); }
    const top = past.reduce((m, p) => Math.max(m, p.level), 0);
    const splices = [], changes = [], missing = [];
    const quoted = v => `"${v}"`;
    for (const p of past) {
      const r = cur.get(p.level);
      if (!r) { missing.push(p); continue; }
      const was = [];
      if (r.points.value !== p.points) { splices.push(...T.replaceSpan(r.points, amount(p.points, 'points'))); was.push(`cost ${r.points.value} -> ${p.points}`); }
      const item = text.slice(r.item.start, r.item.end);
      if (item !== p.define) { splices.push(...T.replaceSpan(r.item, p.define)); was.push(`${item} -> ${p.define}`); }
      if (r.qty.value !== p.qty) { splices.push(...T.replaceSpan(r.qty, amount(p.qty, 'quantity', 1, 2147483647))); was.push(`qty ${r.qty.value} -> ${p.qty}`); }
      for (const k of ['logo', 'rarity', 'icon']) if (r[k].text !== p[k]) { splices.push(...T.replaceSpan(r[k], quoted(p[k]))); was.push(`${k} "${r[k].text}" -> "${p[k]}"`); }
      if (was.length) changes.push(`level ${p.level}: ${was.join(', ')}`);
    }
    const kept = [...cur.values()].filter(r => r.level.value <= top).sort((a, b) => a.level.value - b.level.value);
    const anchor = kept[kept.length - 1] || null;
    const sample = anchor || [...cur.values()][0] || model.rows.BP4[0] || null;
    for (const p of missing) {
      const vals = ['BPReward', String(type), String(p.level), String(p.points), p.define, String(p.qty), quoted(p.logo), quoted(p.rarity), quoted(p.icon)];
      const row = sample ? rowLike(text, [kwTok(sample), sample.type, sample.level, sample.points, sample.item, sample.qty, sample.logo, sample.rarity, sample.icon], vals) : vals.join('\t');
      if (anchor) splices.push(...T.insertRowAfter(text, anchor, row));
      else {
        const block = (model.blocks.BP4 || [])[0];
        if (!block) throw new Error('BattlePass.inc has no BP4 block');
        splices.push(...T.insertRowBelowLine(text, block.open.start, row));
      }
      changes.push(`level ${p.level}: added (${p.qty}x ${p.define}, cost ${p.points})`);
    }
    for (const r of [...cur.values()].filter(r => r.level.value > top).sort((a, b) => a.level.value - b.level.value)) {
      splices.push(...T.removeRow(text, r));
      changes.push(`level ${r.level.value}: removed`);
    }
    return { splices, changes };
  }

  // --- monsters -------------------------------------------------------------
  function setMonsterPoints(row, min, max) {
    amount(min, 'min points'); amount(max, 'max points');
    if (min > max) throw new Error('min points must not be above max points');
    return [...T.replaceSpan(row.min, min), ...T.replaceSpan(row.max, max)];
  }
  // re-price to the level band, and refresh a generated "// lvN rank - Name" comment
  function repriceMonster(row, mv) {
    const b = BP().band(mv.level, mv.rankId);
    const out = setMonsterPoints(row, b.min, b.max);
    if (isGenerated(row.comment) && row.comment.text !== monsterComment(mv)) out.push(...T.replaceSpan(row.comment, monsterComment(mv)));
    return out;
  }
  // new row after the last listed monster of the same or a lower level (the file is sorted by level)
  function addMonster(text, model, mv, min, max, movers) {
    T.checkDefine(mv.define);
    if (model.monsters.has(mv.id)) throw new Error(`${mv.define} is already listed`);
    amount(min, 'min points'); amount(max, 'max points');
    if (min > max) throw new Error('min points must not be above max points');
    const rows = model.rows.BP5;
    let anchor = null;
    for (const r of rows) { const m = movers.get(r.id); if (m && m.level <= mv.level) anchor = r; }
    const sample = rows[0];
    const vals = ['BPMonster', mv.define, String(min), String(max)];
    let row = sample ? rowLike(text, [kwTok(sample), sample.mon, sample.min, sample.max], vals) : vals.join('\t');
    if (sample && sample.comment) row += text.slice(sample.max.end, sample.comment.start) + monsterComment(mv);
    if (anchor) return T.insertRowAfter(text, anchor, row);
    if (sample) {               // lower than every listed monster: insert above the first row
      const at = T.lineStart(text, sample.start);
      return [{ start: at, end: at, insert: T.indentOf(text, sample.start) + row + T.eolAt(text, sample.start) }];
    }
    const block = (model.blocks.BP5 || [])[0];
    if (!block) throw new Error('BattlePass.inc has no BP5 block');
    return T.insertRowBelowLine(text, block.open.start, row);
  }
  const removeMonster = (text, row) => T.removeRow(text, row);
  const removeMonsters = (text, rows) => rows.flatMap(r => T.removeRow(text, r));
  // several monsters at their band price, one edit (inserts at one spot keep the list's order)
  function addMonstersAtBand(text, model, list, movers) {
    return [...list].sort((a, b) => a.level - b.level || a.define.localeCompare(b.define))
      .flatMap(mv => { const b = BP().band(mv.level, mv.rankId); return addMonster(text, model, mv, b.min, b.max, movers); });
  }

  FRE.battlePassOps = {
    setEndDate, newSeasonPlan, setRewardValue, setRewardItem, setRewardTexture, addReward, removeReward, removeLevel, placeReward, swapRewards, restoreLadder,
    setMonsterPoints, repriceMonster, addMonster, addMonstersAtBand, removeMonster, removeMonsters, monsterComment,
  };
})(globalThis.FRE = globalThis.FRE || {});
