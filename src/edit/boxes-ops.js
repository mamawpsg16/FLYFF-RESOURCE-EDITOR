// Box edits as minimal splices.
//   propGiftbox.inc: UTF-16 (any text may be inserted), CRLF. A box is one GiftBoxN block; its type sets the
//     chance unit and the columns (FRE.boxes.TYPES). Chances are kept at exactly 100% (1,000,000): changing one line
//     moves the others in proportion (exchangeOps.rebalance), like the exchange chances.
//     When an edit needs a column or a finer chance than the block's type has, the block is rewritten to the
//     smallest type that holds it (the keyword and each line's values; comments and gaps are kept).
//   propPackItem.inc: CP949 bytes (ASCII inserts only), CRLF; `<item> <+N> <amount>` lines and the block's minutes.
// New lines copy the indent, the gaps and the line ending of the block's last line.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const Bx = () => FRE.boxes;
  const TOTAL = 1000000;
  const MAX_NUM = 32767;                 // CItemElem::m_nItemNum is a short
  const MAX_UPGRADE = 20;
  const MAX_MINUTES = 2147483647;
  // the types that hold each set of columns, smallest first
  const CANDIDATES = { none: ['GiftBox', 'GiftBox2'], flag: ['GiftBox3', 'GiftBox5'], minutes: ['GiftBox4', 'GiftBox5'], upgrade: ['GiftBox6'] };
  const COL_ORDER = ['flag', 'minutes', 'upgrade'];

  function onlyBlock(box, what) {
    if (box.blocks.length !== 1) throw new Error(`${box.define || box.id} has ${box.blocks.length} ${what} blocks: merge them in the file first`);
    const b = box.blocks[0];
    if (!b.close) throw new Error(`${box.define || box.id}'s block is not closed with }: fix the file first`);
    return b;
  }
  function checkItem(define, defines) {
    T.checkDefine(define);
    if (!defines.has(define)) throw new Error(`${define} is not defined`);
  }
  const checkNum = n => T.checkAmount(n, 1, MAX_NUM, 'The count');
  const checkUpgrade = n => T.checkAmount(n, 0, MAX_UPGRADE, 'The upgrade (+N)');
  const checkMinutes = n => T.checkAmount(n, 0, MAX_MINUTES, 'The time limit (minutes)');
  const checkFlag = f => { if (![0, Bx().FLAG_BOUND, Bx().FLAG_KEEP].includes(f)) throw new Error('flag must be 0, 2 (bound) or 4 (keep the item\'s own settings)'); };

  // ---------------------------------------------------------------- random boxes
  // The box as a list the ops change: { src (line | null), define, w (out of 1,000,000), num, flag, minutes, upgrade }
  function stateOf(box) {
    return box.lines.map(l => ({ src: l, define: l.item.define || String(l.item.value >>> 0), w: l.weight, num: l.num.value,
      flag: Bx().flagOf(l), minutes: Bx().minutesOf(l), upgrade: Bx().upgradeOf(l) }));
  }
  const colsOf = st => {
    const has = c => st.some(x => x[c]);
    return has('upgrade') ? 'upgrade' : has('minutes') ? 'minutes' : has('flag') ? 'flag' : 'none';
  };
  // the type to write: the block's own type when it still fits, else the smallest that holds the columns and the chances
  function chooseType(current, st) {
    const fits = ty => { const T0 = Bx().TYPES[ty], need = colsOf(st); return (need === 'none' || T0.cols.includes(need)) && st.every(x => x.w % T0.prec === 0); };
    if (fits(current)) return current;
    const list = CANDIDATES[colsOf(st)];
    return list.find(fits) || list[list.length - 1];
  }
  // chances as multiples of `prec` that still add up to 1,000,000 (the largest line takes the rounding)
  function quantize(ws, prec) {
    const out = ws.map(w => Math.round(w / prec) * prec);
    const diff = TOTAL - out.reduce((a, b) => a + b, 0);
    if (diff && out.length) { let k = 0; out.forEach((w, i) => { if (w > out[k]) k = i; }); out[k] += diff; }
    return out;
  }
  // rebalance in the finest unit the change needs: the block's own unit when the typed chance is a multiple of it
  function balance(st, j, u, cur) {
    const prec = Bx().TYPES[cur].prec;
    const unit = j == null || u % prec === 0 ? prec : (u % 10 === 0 ? 10 : 1);
    const vals = FRE.exchangeOps.rebalance(st.map(x => Math.floor(x.w / unit)), j, j == null ? 0 : Math.round(u / unit), TOTAL / unit);
    vals.forEach((v, i) => { st[i].w = v * unit; });
  }

  // The values after the item on one line, in the type's columns, joined with the line's own gaps.
  function valuesText(text, type, x, src) {
    const T0 = Bx().TYPES[type], vals = [x.w / T0.prec, x.num, ...T0.cols.map(c => x[c])];
    const toks = src ? [src.w, src.num, src.flag, src.minutes, src.upgrade].filter(Boolean) : [];
    let s = '';
    vals.forEach((v, i) => {
      if (i) s += i < toks.length ? text.slice(toks[i - 1].end, toks[i].start) || '\t' : '\t';
      s += String(v);
    });
    return s;
  }
  // a new line laid out like `sample` (the gap after the item is copied)
  function newLineText(text, type, x, sample) {
    const gap = sample ? text.slice(sample.item.end, sample.w.start) || '\t' : '\t';
    return x.define + gap + valuesText(text, type, x, sample);
  }

  // Write `st` (the box after the change) over the box's block. -> splices (with .type = the type written)
  function writeRandom(text, box, st) {
    const b = onlyBlock(box, 'random box');
    const type = chooseType(b.type, st);
    const ws = quantize(st.map(x => x.w), Bx().TYPES[type].prec);
    st.forEach((x, i) => { x.w = ws[i]; });
    for (const x of st) {
      T.checkAmount(x.w, 0, TOTAL, 'A chance'); checkNum(x.num); checkFlag(x.flag); checkMinutes(x.minutes); checkUpgrade(x.upgrade);
    }
    const out = [];
    if (type !== b.type) out.push(...T.replaceSpan(b.kw, type));
    const kept = new Set(st.filter(x => x.src).map(x => x.src));
    for (const l of b.lines) if (!kept.has(l)) out.push(...T.removeRow(text, l));
    let anchor = null;
    for (const x of st) {
      if (!x.src) continue;
      anchor = x.src;
      const was = { define: x.src.item.define || String(x.src.item.value >>> 0) };
      if (x.define !== was.define) out.push(...T.replaceSpan({ start: x.src.item.start, end: x.src.item.end }, x.define));
      const now = valuesText(text, type, x, x.src), old = text.slice(x.src.w.start, x.src.end);
      if (now !== old) out.push({ start: x.src.w.start, end: x.src.end, insert: now });
    }
    const sample = b.lines[b.lines.length - 1] || null;
    let rows = st.filter(x => !x.src).map(x => newLineText(text, type, x, sample));
    if (rows.length) {
      if (anchor) out.push(...T.insertRowAfter(text, { start: anchor.start, end: anchor.end }, rows.join(T.eolAt(text, anchor.start) + T.indentOf(text, anchor.start))));
      else out.push(...T.insertRowBelowLine(text, b.open.start, rows.join(T.eolAt(text, b.open.start) + T.indentOf(text, b.open.start) + '\t')));
    }
    out.type = type;
    out.retyped = type !== b.type ? type : null;
    return out;
  }

  // set line j's chance to u (out of 1,000,000); the others move so the total stays 100%
  function setChance(text, box, j, u) {
    T.checkAmount(u, 0, TOTAL, 'The chance');
    const st = stateOf(box);
    balance(st, j, u, onlyBlock(box, 'random box').type);
    return writeRandom(text, box, st);
  }
  // change some of { define, num, flag, minutes, upgrade } of line j (the chances stay)
  function setLine(text, box, j, d, defines) {
    const st = stateOf(box);
    if (d.define != null && d.define !== st[j].define) checkItem(d.define, defines);
    Object.assign(st[j], pick(d));
    return writeRandom(text, box, st);
  }
  // a new line with chance u; the others shrink in proportion
  function addLine(text, box, d, defines) {
    checkItem(d.define, defines);
    const st = stateOf(box);
    st.push(Object.assign({ src: null, define: d.define, w: 0, num: 1, flag: 0, minutes: 0, upgrade: 0 }, pick(d)));
    balance(st, st.length - 1, d.w, onlyBlock(box, 'random box').type);
    return writeRandom(text, box, st);
  }
  // remove line j; the others grow back to 100%
  function removeLine(text, box, j) {
    const st = stateOf(box);
    if (st.length < 2) throw new Error('A random box needs at least one item: use "Remove contents" to empty it');
    st.splice(j, 1);
    balance(st, null, 0, onlyBlock(box, 'random box').type);
    return writeRandom(text, box, st);
  }
  // share 100% evenly over the lines
  function spreadEvenly(text, box) {
    const st = stateOf(box), n = st.length, cur = onlyBlock(box, 'random box').type, prec = Bx().TYPES[cur].prec;
    const units = TOTAL / prec, base = Math.floor(units / n), extra = units - base * n;
    st.forEach((x, i) => { x.w = (base + (i < extra ? 1 : 0)) * prec; });
    return writeRandom(text, box, st);
  }
  function pick(d) {
    const o = {};
    for (const k of ['define', 'num', 'flag', 'minutes', 'upgrade']) if (d[k] != null) o[k] = d[k];
    return o;
  }

  // ---------------------------------------------------------------- sets
  function lineLikePack(text, sample, vals) {
    const toks = sample ? [sample.item, sample.upgrade, sample.num] : [];
    let s = '';
    vals.forEach((v, i) => { if (i) s += i < toks.length ? text.slice(toks[i - 1].end, toks[i].start) || '\t' : '\t'; s += String(v); });
    return s;
  }
  function addPackLine(text, box, d, defines) {
    checkItem(d.define, defines); checkNum(d.num); checkUpgrade(d.upgrade || 0);
    const b = box.blocks[box.blocks.length - 1];
    if (!b.close) throw new Error(`${box.define || box.id}'s block is not closed with }: fix the file first`);
    if (box.lines.length >= Bx().MAX_ITEM_PER_PACK) throw new Error(`A set holds at most ${Bx().MAX_ITEM_PER_PACK} items (one more stops the server reading every set after it)`);
    const last = b.lines[b.lines.length - 1];
    const row = lineLikePack(text, last, [d.define, d.upgrade || 0, d.num]);
    return last ? T.insertRowAfter(text, { start: last.start, end: last.end }, row) : T.insertRowBelowLine(text, b.open.start, row);
  }
  function setPackLine(text, l, d, defines) {
    const out = [];
    if (d.define != null && d.define !== (l.item.define || String(l.item.value >>> 0))) { checkItem(d.define, defines); out.push(...T.replaceSpan(l.item, d.define)); }
    if (d.upgrade != null && d.upgrade !== l.upgrade.value) { checkUpgrade(d.upgrade); out.push(...T.replaceSpan(l.upgrade, d.upgrade)); }
    if (d.num != null && d.num !== l.num.value) { checkNum(d.num); out.push(...T.replaceSpan(l.num, d.num)); }
    return out;
  }
  function removePackLine(text, box, l) {
    if (box.lines.length < 2) throw new Error('A set needs at least one item: use "Remove contents" to empty it');
    return T.removeRow(text, l);
  }
  // the time limit of every item (the last block's minutes are the ones the server keeps)
  function setPackMinutes(text, box, minutes) {
    checkMinutes(minutes);
    const b = box.blocks[box.blocks.length - 1];
    return minutes === b.span.value ? [] : T.replaceSpan(b.span, minutes);
  }

  // ---------------------------------------------------------------- both
  // remove every block of the box (the box item stays in Spec_Item.txt: BX_EMPTIED)
  function removeContents(text, box) {
    const out = [];
    for (const b of box.blocks) {
      if (!b.close) throw new Error(`${box.define || box.id}'s block is not closed with }: fix the file first`);
      out.push(...T.removeRow(text, { start: b.kw.start, end: b.close.end }));
    }
    return out;
  }

  FRE.boxesOps = {
    stateOf, chooseType, quantize, setChance, setLine, addLine, removeLine, spreadEvenly,
    addPackLine, setPackLine, removePackLine, setPackMinutes, removeContents, MAX_NUM, MAX_UPGRADE, MAX_MINUTES,
  };
})(globalThis.FRE = globalThis.FRE || {});
