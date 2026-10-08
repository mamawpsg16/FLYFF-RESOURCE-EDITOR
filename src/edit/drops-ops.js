// propMoverEx.inc edits as minimal splices (ASCII only; the file is UTF-8 with U+FFFD in old comments, CRLF).
// New lines copy the indent and line ending of the line they follow; files get plain digits.
// Where a new line goes (the way the drop commits did it):
//   DropItem  after the monster's last hand-written DropItem (outside the gen_*.ps1 blocks), else after its
//             DropGold / Maxitem, else on the line below {. Script-made blocks sit right after DropGold
//             (46c26c73, 1d4c2944, bf871bba, 76924904, d27d9a5a), so hand-written lines come after them.
//   DropKind  after the last DropKind, else after the last DropItem / DropGold / Maxitem, else below {.
//   DropGold  after Maxitem (MI_AIBATT1's order), else below {.     Maxitem  below {.
// A monster with two blocks (M_DUP) is edited in its last block.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const D = () => FRE.drops;
  const MAX_COUNT = 32767;          // (short)( xRandom( dwNum ) + 1 ) (Mover.cpp:8618): above this the amount turns negative
  const MAX_UPGRADE = 20;
  const MAX_MAXITEM = 1000;

  function lastBlock(model, monId) {
    const mon = model.monsters.get(monId);
    if (!mon) throw new Error('This monster has no block in propMoverEx.inc yet');
    const b = mon.blocks[mon.blocks.length - 1];
    if (!b.close) throw new Error(`${mon.define}'s block is not closed: fix the file first`);
    return { mon, b };
  }
  const last = (arr, f) => { for (let i = arr.length - 1; i >= 0; i--) if (f(arr[i])) return arr[i]; return null; };

  function checkItem(define, defines) {
    T.checkDefine(define);
    if (!defines.has(define)) throw new Error(`${define} is not defined`);
  }
  function checkChance(prob) { T.checkAmount(prob, 1, D().INT_MAX, 'The chance (file value)'); }
  function checkCount(count) {
    if (count !== -1) T.checkAmount(count, 1, MAX_COUNT, 'The amount');
  }
  function checkUpgrade(level) { T.checkAmount(level, 0, MAX_UPGRADE, 'The upgrade (+N)'); }

  const dropLine = (define, prob, level, count) => `DropItem(${define}, ${prob}, ${level}, ${count});`;

  // { define, prob, level, count } -> splices
  function addDrop(text, model, monId, d, defines) {
    checkItem(d.define, defines); checkChance(d.prob); checkCount(d.count); checkUpgrade(d.level);
    const { b } = lastBlock(model, monId);
    const row = dropLine(d.define, d.prob, d.level, d.count);
    const anchor = last(b.entries, e => e.kind === 'item' && !e.gen)
      || last(b.entries, e => (e.kind === 'gold' || e.kind === 'maxitem') && !e.gen);
    if (anchor) return T.insertRowAfter(text, anchor, row);
    return T.insertRowBelowLine(text, b.open.start, row);
  }

  // change some of { prob, level, count, define } of one DropItem line
  function setDrop(text, e, d, defines) {
    const out = [];
    if (d.define != null && d.define !== e.define) { checkItem(d.define, defines); out.push(...T.replaceSpan(e.id, d.define)); }
    if (d.prob != null && d.prob !== e.probability) { checkChance(d.prob); out.push(...T.replaceSpan(e.prob, d.prob)); }
    if (d.level != null && d.level !== e.levelValue) { checkUpgrade(d.level); out.push(...T.replaceSpan(e.level, d.level)); }
    if (d.count != null && (d.count === -1 ? 0xFFFFFFFF : d.count) !== e.number) { checkCount(d.count); out.push(...T.replaceSpan(e.count, d.count)); }
    return out;
  }

  const removeEntry = (text, e) => T.removeRow(text, e);

  function setGold(text, model, monId, min, max) {
    T.checkAmount(min, 0, D().INT_MAX - 1, 'The lowest Penya');
    T.checkAmount(max, 1, D().INT_MAX, 'The highest Penya');
    if (max <= min) throw new Error('The highest Penya must be more than the lowest (the server crashes when they are equal)');
    const { mon, b } = lastBlock(model, monId);
    const g = last(mon.list, e => e.kind === 'gold');
    if (g) return [...T.replaceSpan(g.min, min), ...T.replaceSpan(g.max, max)];
    const row = `DropGold(${min}, ${max});`;
    const mi = last(b.entries, e => e.kind === 'maxitem');
    return mi ? T.insertRowAfter(text, mi, row) : T.insertRowBelowLine(text, b.open.start, row);
  }

  function setMaxitem(text, model, monId, n) {
    T.checkAmount(n, 0, MAX_MAXITEM, 'Max items per kill');
    const { mon, b } = lastBlock(model, monId);
    if (mon.maxitem) return T.replaceSpan(mon.maxitem.value, n);
    return T.insertRowBelowLine(text, b.open.start, `Maxitem = ${n};`);
  }

  function addKind(text, model, monId, ik3Define, defines, level) {
    T.checkDefine(ik3Define);
    if (!defines.has(ik3Define)) throw new Error(`${ik3Define} is not defined`);
    const { mon, b } = lastBlock(model, monId);
    if (mon.kinds.length >= D().MAX_DROPKIND) throw new Error(`A monster has room for ${D().MAX_DROPKIND} random-gear lines`);
    const [lo, hi] = D().kindWindow(level);
    const row = `DropKind(${ik3Define}, ${lo}, ${hi});`;
    const anchor = last(b.entries, e => e.kind === 'kind' && !e.gen) || last(b.entries, e => e.kind !== 'kind' && !e.gen);
    return anchor ? T.insertRowAfter(text, anchor, row) : T.insertRowBelowLine(text, b.open.start, row);
  }

  FRE.dropsOps = { addDrop, setDrop, removeEntry, setGold, setMaxitem, addKind, dropLine, MAX_COUNT, MAX_UPGRADE, MAX_MAXITEM };
})(globalThis.FRE = globalThis.FRE || {});
