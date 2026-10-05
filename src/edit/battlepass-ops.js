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
    setEndDate, newSeasonPlan, setRewardValue, setRewardItem, setRewardTexture, addReward, removeReward,
    setMonsterPoints, repriceMonster, addMonster, addMonstersAtBand, removeMonster, removeMonsters, monsterComment,
  };
})(globalThis.FRE = globalThis.FRE || {});
