// Weapon effect edits (task G part 2): one stat slot of a weapon's Spec_Item.txt row = two tokens, dwDestParamN (written as
// its DST_ name, the 62fb3b3e style) and nAdjParamValN; "=" in both for an empty slot. Spec_Item.txt is CRLF on the server and
// LF in Client/ (the core client sync writes the same change there). Splices only; nothing else in the row moves.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;

  // v: { dst, dstName, adj } (dst 0 / null = empty the slot)
  function setSlot(text, w, i, v, defines) {
    T.checkAmount(i, 1, FRE.weapons.SLOTS, 'The slot');
    const empty = !v || !v.dst;
    if (!empty) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.dstName || '')) throw new Error('Pick a stat');
      if (!Number.isInteger(v.adj) || v.adj < -2147483647 || v.adj > 2147483647) throw new Error('The amount must be a whole number');
    }
    const it = w.item;
    const d = FRE.itemOps.fieldSpan(text, it, 'dwDestParam' + i, defines), a = FRE.itemOps.fieldSpan(text, it, 'nAdjParamVal' + i, defines);
    const di = empty ? '=' : v.dstName, ai = empty ? '=' : String(v.adj);
    const out = [];
    if (text.slice(d.start, d.end) !== di) out.push({ start: d.start, end: d.end, insert: di });
    if (text.slice(a.start, a.end) !== ai) out.push({ start: a.start, end: a.end, insert: ai });
    return out;
  }
  // the same slot change on the weapon and its Ultimate twin (one undo step: both rows are in Spec_Item.txt)
  function setSlotBoth(text, ws, i, v, defines) {
    const out = [];
    for (const w of ws) if (w) out.push(...setSlot(text, w, i, v, defines));
    return out.sort((x, y) => x.start - y.start);
  }

  FRE.weaponsOps = { setSlot, setSlotBoth };
})(globalThis.FRE = globalThis.FRE || {});
