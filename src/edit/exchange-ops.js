// Exchange_Script.txt edits as minimal splices. The file is CRLF and holds EUC-KR comments,
// so inserted text is ASCII only. CONDITION is what this server checks AND takes
// (__NEW_EXCHANGE_V19); REMOVE is ignored, but the proven commits (f58e56ba, 3099c822,
// 15091d5f) keep it equal to CONDITION, so ingredient edits are mirrored into REMOVE
// while the two lists are equal.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const EX = () => FRE.exchange;
  const MAX_INT = 2147483647;

  const qty = (v, what) => { T.checkAmount(v, 1, MAX_INT, what); return String(v); };
  const chance = v => { T.checkAmount(v, 0, EX().PROB_TOTAL, 'chance (out of 1,000,000)'); return String(v); };

  // A new line laid out like `sample` (a condition / pay line): the gaps between its values are kept.
  function lineLike(text, sample, vals) {
    const toks = [sample.item, sample.num, sample.prob, sample.flag].filter(Boolean);
    let s = '';
    for (let i = 0; i < vals.length; i++) {
      s += vals[i];
      if (i === vals.length - 1) break;
      s += i < toks.length - 1 ? text.slice(toks[i].end, toks[i + 1].start) || '\t' : '\t';
    }
    return s;
  }

  // REMOVE line matching condition line `l` (same position), while REMOVE mirrors CONDITION.
  function mirror(set, l) {
    if (!set.removeBlocks.length || !EX().sameList(set.condition, set.remove)) return null;
    return set.remove[set.condition.indexOf(l)] || null;
  }
  const both = (set, l, fn) => { const r = mirror(set, l); return [...fn(l), ...(r ? fn(r) : [])]; };

  // --- one value ------------------------------------------------------------
  const setIngredientQty = (set, l, v) => both(set, l, x => T.replaceSpan(x.num, qty(v, 'quantity')));
  function setIngredientItem(set, l, define) {
    if (define !== 'PENYA') T.checkDefine(define);
    return both(set, l, x => T.replaceSpan(x.item, define));
  }
  const setRewardQty = (l, v) => T.replaceSpan(l.num, qty(v, 'quantity'));
  const setRewardChance = (l, v) => T.replaceSpan(l.prob, chance(v));
  function setRewardItem(l, define) { T.checkDefine(define); return T.replaceSpan(l.item, define); }
  // byFlag: an optional 4th value (the file's header: 2 = bound to the character)
  function setRewardFlag(text, l, v) {
    T.checkAmount(v, 0, 255, 'flag');
    // 0 = no flag: drop the optional 4th value instead of writing "0" (the server reads both the same)
    if (l.flag) return v === 0 ? [{ start: l.prob.end, end: l.flag.end, insert: '' }] : T.replaceSpan(l.flag, v);
    if (v === 0) return [];
    return [{ start: l.prob.end, end: l.prob.end, insert: (text.slice(l.num.end, l.prob.start) || '\t') + v }];
  }
  function setPayNum(set, v) {
    if (!set.payNum) throw new Error('this recipe has no PAY block');
    T.checkAmount(v, 1, Math.max(1, set.pay.length), 'rewards given');
    return T.replaceSpan(set.payNum, v);
  }

  // --- lines ------------------------------------------------------------------
  function addIngredient(text, set, define, n) {
    if (define !== 'PENYA') T.checkDefine(define);
    if (set.condition.some(l => l.item.name === define)) throw new Error(`${define} is already an ingredient of this recipe`);
    const mirrored = set.removeBlocks.length > 0 && EX().sameList(set.condition, set.remove);
    const ins = (list, blocks) => {
      const last = list[list.length - 1];
      if (last) return T.insertRowAfter(text, last, lineLike(text, last, [define, qty(n, 'quantity')]));
      if (!blocks.length) throw new Error('this recipe has no CONDITION block');
      return T.insertRowBelowLine(text, blocks[0].open.start, `${define}\t${n}`);
    };
    const out = ins(set.condition, set.condBlocks);
    if (mirrored) out.push(...ins(set.remove, set.removeBlocks));
    return out;
  }
  function removeIngredient(text, set, l) {
    if (set.condition.length <= 1) throw new Error('a recipe needs at least one ingredient (with none, the reward is free)');
    return both(set, l, x => T.removeRow(text, x));
  }
  function addReward(text, set, define, n, prob) {
    T.checkDefine(define);
    const last = set.pay[set.pay.length - 1];
    const vals = [define, qty(n, 'quantity'), chance(prob)];
    if (last) return T.insertRowAfter(text, last, lineLike(text, last, vals));
    if (!set.payBlocks.length) throw new Error('this recipe has no PAY block');
    return T.insertRowBelowLine(text, set.payBlocks[0].open.start, vals.join('\t'));
  }
  function removeReward(text, set, l) {
    if (set.pay.length <= 1) throw new Error('a recipe needs at least one reward (an empty PAY crashes the server and the client)');
    const out = T.removeRow(text, l);
    // keep PAY n within the number of lines
    if (set.payNum && set.payNum.value > set.pay.length - 1) out.push(...T.replaceSpan(set.payNum, set.pay.length - 1));
    return out;
  }
  // Spread 1,000,000 evenly over the reward lines (the remainder goes to the first lines).
  function evenChances(set) {
    const n = set.pay.length, base = Math.floor(EX().PROB_TOTAL / n), extra = EX().PROB_TOTAL - base * n;
    return set.pay.flatMap((l, i) => T.replaceSpan(l.prob, base + (i < extra ? 1 : 0)));
  }

  // --- whole recipes ------------------------------------------------------------
  // The recipe's full lines [start, end) and its text. When the lines hold non-ASCII bytes
  // (EUC-KR comments) it is rebuilt from the model: values kept, comments dropped.
  function setBlock(text, set) {
    if (!set.close) throw new Error('this recipe is never closed with "}"');
    const start = T.lineStart(text, set.start), end = T.lineEnd(text, set.end);
    const raw = text.slice(start, end);
    const ascii = FRE.bytes.isPrintableAscii(raw);
    return { start, end, raw, ascii, text: ascii ? raw : buildSet(text, set) };
  }
  function buildSet(text, set) {
    const eol = T.eolAt(text, set.start) || T.dominantEol(text);
    const i0 = T.indentOf(text, set.start), i1 = i0 + '\t', i2 = i1 + '\t';
    const L = [];
    const block = (kw, rows) => { L.push(i1 + kw, i1 + '{', ...rows.map(r => i2 + r), i1 + '}'); };
    L.push(`${i0}SET\t${set.text.name}`, i0 + '{');
    if (set.resultMsg.length) block('RESULTMSG', set.resultMsg.map(r => r.name));
    block('CONDITION', set.condition.map(l => `${l.item.name}\t${l.num.value}`));
    if (set.removeBlocks.length) block('REMOVE', set.remove.map(l => `${l.item.name}\t${l.num.value}`));
    for (const [kw, list] of [['CONDITION_POINT', set.condPoint], ['REMOVE_POINT', set.removePoint]])
      if (list.length) block(kw, list.map(p => `${p.type.name}\t${p.point.value}`));
    block(`PAY\t${set.payNum ? set.payNum.value : 1}`, set.pay.map(l => [l.item.name, l.num.value, l.prob.value, ...(l.flag ? [l.flag.value] : [])].join('\t')));
    L.push(i0 + '}');
    return L.join(eol) + eol;
  }
  function copySet(text, set) {
    const b = setBlock(text, set);
    return { splices: [{ start: b.end, end: b.end, insert: b.text }], rebuilt: !b.ascii };
  }
  function removeSet(text, set) {
    const b = setBlock(text, set);
    return [{ start: b.start, end: b.end, insert: '' }];
  }
  // swap with the next (dir 1) or previous (dir -1) recipe of the same menu
  function moveSet(text, menu, set, dir) {
    const other = menu.sets[set.index + dir];
    if (!other) throw new Error(dir < 0 ? 'already the first recipe' : 'already the last recipe');
    const a = setBlock(text, dir < 0 ? other : set), b = setBlock(text, dir < 0 ? set : other);
    // a comes first in the file: put b's text where a was and a's where b was (the gap between stays)
    return { splices: [{ start: a.start, end: a.end, insert: b.text }, { start: b.start, end: b.end, insert: a.text }], rebuilt: !a.ascii || !b.ascii };
  }

  FRE.exchangeOps = {
    setIngredientQty, setIngredientItem, setRewardQty, setRewardChance, setRewardItem, setRewardFlag, setPayNum,
    addIngredient, removeIngredient, addReward, removeReward, evenChances, copySet, removeSet, moveSet, buildSet, setBlock,
  };
})(globalThis.FRE = globalThis.FRE || {});
