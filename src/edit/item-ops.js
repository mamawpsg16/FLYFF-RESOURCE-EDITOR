// Spec_Item.txt edits. Only the chip price (dwReferValue1) for now: the field the
// proven commits 93a02124 ("Blessing of the Goddess ... 50 Red Chips") and fea9840b
// ("re-price the Red Chip shop") change. One number per item, read by Red Chip and
// Donate Chip shops (CItemBase::GetChipCost, Item.cpp:160) and the Donation Shop,
// so changing it for one shop changes it everywhere (7bedef15).
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const { Script } = FRE.lexer;
  const S = FRE.specItem;

  // Span of one field of a Spec_Item row: re-reads only that row with the same
  // token sequence as loadSpecItem (ver, dwID, szName, then the schema).
  function fieldSpan(text, item, field, defines) {
    const want = S.FIELD_INDEX.get(field);
    if (want === undefined) throw new Error(`unknown Spec_Item field ${field}`);
    const script = new Script(text, { defines: defines || new Map(), diags: [] });
    script.lex.pos = item.start;
    script.getNumber(); script.getNumber(); script.getToken();          // ver, dwID, szName
    for (let i = 0; i <= want; i++) {
      const k = S.SCHEMA[i].kind;
      const r = k === 't' ? script.getToken() : k === 'f' ? script.getFloat() : script.getNumber();
      if (r.eof || r.type === 'eof') throw new Error(`${item.define}: the record ends before ${field}`);
      if (i === want) return { start: r.start, end: r.end };
    }
  }

  // value: chip price (1 .. INT_MAX), or null = "=" (no chip price: chip shops skip the item)
  function setChipPrice(text, item, value, defines) {
    if (value !== null) T.checkAmount(value, 1, 2147483647, 'chip price');
    const span = fieldSpan(text, item, 'dwReferValue1', defines);
    const insert = value === null ? '=' : String(value);
    if (text.slice(span.start, span.end) === insert) return [];
    return T.replaceSpan(span, insert);
  }

  // Every place that sells this item for chips (they all share dwReferValue1).
  function chipUses(ws, itemId) {
    const id = itemId >>> 0, out = [];
    for (const npc of ws.chars ? ws.chars.npcs : []) {
      const type = FRE.shopOps.shopType(npc.venderType);
      if (!type) continue;
      for (const rec of npc.statements) {
        const e = FRE.character.shopEntry(rec);
        if (!e || (e.kind !== 'chip' && e.kind !== 'fixed') || (e.item.value >>> 0) !== id) continue;
        out.push({ kind: 'npc', npc, slot: e.slot, chips: type === 2 ? 'Donate chips' : 'Red chips',
          label: `${npc.name || npc.key} (${type === 2 ? 'Donate Chip' : 'Red Chip'} shop), ${npc.slotTitles[e.slot] || 'tab ' + e.slot}` });
      }
    }
    const ds = ws.models && ws.models.donation;
    for (const row of ds ? ds.rows : []) {
      if (row.id === id) out.push({ kind: 'donation', row, chips: 'Donate chips', label: `Donation Shop, "${row.category}"` });
    }
    return out;
  }

  FRE.itemOps = { fieldSpan, setChipPrice, chipUses };
})(globalThis.FRE = globalThis.FRE || {});
