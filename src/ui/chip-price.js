// Chip price editing shared by every editor (NPC chip shops, Donation Shop).
// One number per item: Spec_Item.txt dwReferValue1 (commits 93a02124, fea9840b),
// read by Red Chip shops, Donate Chip shops and the Donation Shop alike, so the
// other places selling the item are named before writing (commit 7bedef15).
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;

  const chipOf = info => (info && info.chipCost >= 1 ? info.chipCost : null);

  // prices: Map itemId -> chip price (null = "=", no chip price) -> grouped-edit parts
  function parts(ws, prices) {
    const sf = ws.files.get('spec_item.txt');
    const splices = [];
    for (const [id, v] of prices) splices.push(...FRE.itemOps.setChipPrice(sf.text, ws.itemById(id), v, ws.defines.defines));
    return splices.length ? [{ file: 'spec_item.txt', splices }] : [];
  }

  // isHere(use) -> true for the place being edited (not listed)
  function confirmShared(ctx, ids, isHere, then) {
    const others = [];
    for (const id of ids) {
      const it = ctx.ws.itemById(id);
      for (const u of FRE.itemOps.chipUses(ctx.ws, id)) {
        if (isHere(u)) continue;
        others.push(h('li', h('b', it ? it.name : String(id)), ': ', u.label));
      }
    }
    if (!others.length) { then(); return; }
    FRE.dom.modal({ title: 'This chip price is shared', body: h('div',
      h('p', 'A chip price is one number per item (dwReferValue1 in Spec_Item.txt). Changing it also changes the price here:'),
      h('ul.plan', others)), buttons: [
      { label: 'Cancel', onClick: () => ctx.renderAll(false) },
      { label: 'Change it everywhere', cls: 'primary', onClick: then },
    ] });
  }

  function set(ctx, info, value, isHere, editedKey) {
    confirmShared(ctx, [info.id], isHere, () => ctx.editGroup(() => parts(ctx.ws, new Map([[info.id, value]])),
      `chip price ${info.define}`, editedKey ? [editedKey] : []));
  }

  // Price input for a table cell.
  // While typing: above the Donation Shop's safe price (DS_OVERFLOW) the box turns red at once.
  function input(ctx, info, isHere, editedKey) {
    const title = 'Chip price (dwReferValue1 in Spec_Item.txt). One price per item: it also applies in the chip shops and the Donation Shop. Empty = cannot be bought for chips.';
    // keyed = applies while typing (CLAUDE.md UI standards); a longer pause, because a price shared with
    // other shops opens the "This chip price is shared" window (the red border below shows at once)
    const el = FRE.dom.numInput({ value: chipOf(info), placeholder: 'no chip price', min: 1, disabled: !ctx.ws.isEditable('spec_item.txt'),
      key: `chip|${info.id >>> 0}|${editedKey || ''}`, liveMs: 1000,
      title, onCommit: v => set(ctx, info, v, isHere, editedKey) });
    const m = ctx.ws.models.donation, safe = FRE.donation.SAFE_PRICE;
    if (m && m.catalog.has(info.id >>> 0)) {
      const check = () => {
        const r = FRE.num.parseAmount(el.value, { min: 1 });
        const over = r.ok && r.value !== null && r.value > safe;
        el.style.borderColor = over ? 'var(--bad, #e5534b)' : '';
        el.title = over ? `⛔ Over ${FRE.dom.fmt(safe)}: in the Donation Shop, buying 9,999 overflows the total and the player gets them for the chips they have (DS_OVERFLOW). Saving is blocked.` : title;
      };
      el.addEventListener('input', check);
      check();
    }
    return el;
  }

  FRE.ui.chipPrice = { chipOf, parts, confirmShared, set, input };
})(globalThis.FRE = globalThis.FRE || {});
