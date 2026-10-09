// Couple edits (task I part 3) as minimal splices.
//   couple.inc (CP949, CRLF; ASCII inserts only): a Level total is one token; a gift is a row `ITEM\tSEX_…\tflag\tminutes\tcount`
//   inside its level block (`\tN\r\n\t{\r\n\t\t<row>\r\n\t}`, the file's own style), blocks kept in level order; a buff tier is
//   one token of a SkillLevel row (`\tlevel\tA\tB\tC`); a level without a row gets one, which then also counts for the levels
//   after it until the next row (LoadSkillLevel copies the row above, couple.cpp:335-339).
//   Spec_Item.txt (the buff items): dwDestParamN / nAdjParamValN as in 62fb3b3e (stat names, "=" for an empty slot), szIcon.
//   propItem.txt.txt: the name / description lines of the buff items (UTF-16LE: any text, one line).
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const C = () => FRE.couple;
  const SEX_NAME = ['SEX_MALE', 'SEX_FEMALE', 'SEX_SEXLESS'];
  const MAX_NUM = 32767, MAX_MINUTES = 35791394;     // m_nItemNum is a short; nLife * 60 must stay an int (couplehelper.cpp:254)

  // ---------------------------------------------------------------- Level
  function setPoints(c, level, total) {
    const row = c.exp[level - 1];
    if (!row) throw new Error(`couple.inc has no Level row for level ${level}`);
    T.checkAmount(total, 0, 2147483647, 'The points');
    if (level === 1 && total !== 0) throw new Error('Level 1 must stay at 0 points: a new couple starts at 0');
    return T.replaceSpan(row, total);
  }

  // ---------------------------------------------------------------- Item (gifts)
  function checkGift(c, g) {
    T.checkAmount(g.level, 2, Math.min(C().MAX_LEVEL, c.exp.length), 'The couple level');
    T.checkDefine(g.define);
    if (![0, 1, 2].includes(g.sex)) throw new Error('Who gets it: male (0), female (1) or both (2)');
    if (g.flag !== 0 && g.flag !== 2) throw new Error('A gift is bound (2) or not (0)');
    T.checkAmount(g.minutes, 0, MAX_MINUTES, 'The time limit (minutes)');
    T.checkAmount(g.num, 1, MAX_NUM, 'The count');
  }
  const giftRow = g => `${g.define}\t${SEX_NAME[g.sex]}\t${g.flag}\t${g.minutes}\t${g.num}`;
  function setGift(c, row, v) {
    const n = { level: 2, define: row.define, sex: row.sex, flag: row.flag, minutes: row.minutes, num: row.num, ...v };
    checkGift(c, { ...n, level: Math.max(2, Math.min(n.level, c.exp.length)) });
    const out = [];
    if (v.define !== undefined) out.push(...T.replaceSpan(row.spans.item, n.define));
    if (v.sex !== undefined) out.push(...T.replaceSpan(row.spans.sex, SEX_NAME[n.sex]));
    if (v.flag !== undefined) out.push(...T.replaceSpan(row.spans.flag, n.flag));
    if (v.minutes !== undefined) out.push(...T.replaceSpan(row.spans.minutes, n.minutes));
    if (v.num !== undefined) out.push(...T.replaceSpan(row.spans.num, n.num));
    return out;
  }
  // a level block in the file's style: `\tN`, `\t{`, `\t\t<row>`, `\t}`
  const blockLines = (level, row, eol) => `\t${level}${eol}\t{${eol}\t\t${row}${eol}\t}${eol}`;
  function addGift(text, c, g) {
    checkGift(c, g);
    if (!c.items || !c.items.close) throw new Error('couple.inc has no Item { } block');
    const row = giftRow(g);
    const same = c.blocks.find(b => b.level === g.level && b.close);
    if (same) {
      const last = same.rows[same.rows.length - 1];
      if (last) return T.insertRowAfter(text, last, row);
      return T.insertRowBelowLine(text, same.open.start, '\t' + row);
    }
    // after the last block of a lower level (a blank line between), else above the first block, else in the empty Item block
    const before = c.blocks.filter(b => b.level < g.level && b.close).pop();
    if (before) {
      const at = T.lineEnd(text, before.close.end), e0 = T.eolAt(text, before.close.end);
      const eol = e0 || T.dominantEol(text);
      return [{ start: at, end: at, insert: (e0 ? '' : eol) + eol + blockLines(g.level, row, eol) }];
    }
    const first = c.blocks[0];
    if (first) {
      const at = T.lineStart(text, first.levelSpan.start), eol = T.eolAt(text, first.levelSpan.start) || T.dominantEol(text);
      return [{ start: at, end: at, insert: blockLines(g.level, row, eol) + eol }];
    }
    const at = T.lineEnd(text, c.items.open.start), eol = T.eolAt(text, c.items.open.start) || T.dominantEol(text);
    return [{ start: at, end: at, insert: blockLines(g.level, row, eol) }];
  }
  // the row; its block too when it is the block's only row (with the blank line above it)
  function removeGift(text, c, row) {
    const block = c.blocks.find(b => b.rows.includes(row));
    if (!block || block.rows.length > 1 || !block.close) return T.removeRow(text, row);
    let s = T.lineStart(text, block.levelSpan.start);
    const e = T.lineEnd(text, block.close.end);
    // the blank line between this block and the one above
    const prev = text.slice(0, s);
    const m = /(\r\n|\n|\r)[ \t]*(\r\n|\n|\r)$/.exec(prev);
    if (m) s -= m[0].length - m[1].length;
    return [{ start: s, end: e, insert: '' }];
  }

  // ---------------------------------------------------------------- SkillLevel
  function checkTier(c, kind, tier, kindTiers) {
    if (!c.kinds[kind]) throw new Error('couple.inc has no such buff kind');
    const max = kindTiers ? kindTiers[kind].length : 1000;
    T.checkAmount(tier, 0, max, `The tier (0 = none, 1-${max})`);
  }
  // tiers: the whole row for `level` ([A, B, C]); the level's own row changes in place, else a new row in level order
  function setTiers(text, c, level, tiers, kindTiers) {
    T.checkAmount(level, 1, Math.min(C().MAX_LEVEL, c.exp.length), 'The couple level');
    if (tiers.length !== c.kinds.length) throw new Error(`A SkillLevel row has ${c.kinds.length} tiers`);
    tiers.forEach((t, k) => checkTier(c, k, t, kindTiers));
    if (!c.skill || !c.skill.close) throw new Error('couple.inc has no SkillLevel { } block');
    const own = c.skillRows.find(r => r.level === level);
    if (own) {
      const out = [];
      own.tiers.forEach((sp, k) => { if (sp.value !== tiers[k]) out.push(...T.replaceSpan(sp, tiers[k])); });
      return out;
    }
    const row = `${level}\t${tiers.join('\t')}`;
    const before = c.skillRows.filter(r => r.level < level).pop();
    if (before) return T.insertRowAfter(text, before, row);
    const first = c.skillRows[0];
    if (first) { const at = T.lineStart(text, first.start); return [{ start: at, end: at, insert: T.indentOf(text, first.start) + row + (T.eolAt(text, first.start) || T.dominantEol(text)) }]; }
    return T.insertRowBelowLine(text, c.skill.open.start, row);
  }
  // a level's own row out: the level then copies the row above (level 1 keeps its row: without it level 1 has no buff)
  function removeTierRow(text, c, level) {
    const own = c.skillRows.find(r => r.level === level);
    if (!own) throw new Error(`Level ${level} has no row of its own`);
    if (level === 1) throw new Error('Level 1 keeps its row (set its tiers to 0 for no buff)');
    return T.removeRow(text, own);
  }

  // ---------------------------------------------------------------- the buff items (Spec_Item.txt, propItem.txt.txt)
  // one stat slot: DST_ name (the 62fb3b3e style), "=" for an empty slot
  function setStat(text, item, slot, dst, adj, defines, dstName) {
    if (slot < 1 || slot > 6) throw new Error('A buff item has 6 stat slots');
    if (dst) { T.checkAmount(dst, 1, 65535, 'The stat'); if (!Number.isInteger(adj) || adj < -2147483647 || adj > 2147483647) throw new Error('The amount must be a whole number'); }
    const d = FRE.itemOps.fieldSpan(text, item, 'dwDestParam' + slot, defines), a = FRE.itemOps.fieldSpan(text, item, 'nAdjParamVal' + slot, defines);
    return [{ start: d.start, end: d.end, insert: dst ? (dstName(dst) || String(dst)) : '=' }, { start: a.start, end: a.end, insert: dst ? String(adj) : '=' }];
  }
  function setIcon(text, item, name, defines) {
    if (!/^[\x21-\x7e]+$/.test(name || '') || /"/.test(name)) throw new Error('An icon file name is plain ASCII, no spaces or quotes');
    const sp = FRE.itemOps.fieldSpan(text, item, 'szIcon', defines);
    return [{ start: sp.start, end: sp.end, insert: `"${name}"` }];
  }
  // a propItem.txt.txt line's text (strings meta: the value span of the key)
  function setText(meta, text, max = 255) {
    const v = String(text).replace(/[\t\r\n]+/g, ' ').trim();
    if (!v) throw new Error('The text cannot be empty');
    if (v.length > max) throw new Error(`At most ${max} characters`);
    if (!meta) throw new Error('This text key is not in propItem.txt.txt');
    return [{ start: meta.start, end: meta.end, insert: v }];
  }
  // "Attack +3%, Max HP +5% while your partner is online." (the house style the ROADMAP asks for: "Attack +10%, Max HP +10%")
  const WORD = { DST_ATKPOWER_RATE: 'Attack', DST_HP_MAX_RATE: 'Max HP', DST_SPEED: 'Speed', DST_STAT_ALLUP: 'All Stats', DST_ADJDEF: 'Defense',
    DST_ATKPOWER: 'Attack', DST_HP_MAX: 'Max HP', DST_MP_MAX_RATE: 'Max MP', DST_FP_MAX_RATE: 'Max FP', DST_MONSTER_DMG: 'PvE Damage', DST_EXPERIENCE: 'EXP' };
  function describe(stats, words) {
    const list = stats.filter(s => s.dst).map(s => {
      const w = words.get(s.dst) || { word: '', define: '' };
      const name = WORD[w.define] || (w.word || '').replace(/[:\s]+$/, '').replace(/^Increased\s+/i, '') || w.define || `stat ${s.dst}`;
      return `${name} ${s.adj >= 0 ? '+' : ''}${s.adj}${w.rate ? '%' : ''}`;
    });
    return list.length ? `${list.join(', ')} while your partner is online.` : '';
  }

  FRE.coupleOps = { setPoints, checkGift, giftRow, setGift, addGift, removeGift, setTiers, removeTierRow, setStat, setIcon, setText, describe,
    SEX_NAME, MAX_NUM, MAX_MINUTES };
})(globalThis.FRE = globalThis.FRE || {});
