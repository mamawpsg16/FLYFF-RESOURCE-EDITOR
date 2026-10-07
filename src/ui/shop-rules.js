// Rows the server lists by itself (task S part 2). An AddVendorItem line ("a whole item type") makes the
// server list every item of one type, and the server can't price, move or remove one item of it. So the
// first edit on such a row gives each auto item of the tab its own AddShopItem line, in the same order
// (vendorSim.ruleToFixedPlan + shopOps.convertRules, the 73ee4bd6 way), with the edit applied: one undo
// step, and the toast says what happened. The user asked for plain edits, no extra windows (2026-10-07).
// Plus the "players pay / get back" line under prices.
(function (FRE) {
  'use strict';
  const { h, fmt } = FRE.dom;
  const npcId = npc => `${npc.file}|${npc.key}`;
  const V = () => FRE.vendorSim;
  const tabName = (npc, s) => (npc.slotTitles[s] ? `tab ${s + 1} "${npc.slotTitles[s]}"` : `tab ${s + 1}`);
  const fresh = (ws, npc) => ws.chars.npcs.find(n => npcId(n) === npcId(npc)) || npc;

  // "players pay 100,000 · get back 25,000" under a price (vendorSim.buyPrice / sellPrice)
  // here: the NPC being shown (its own AddShopItem prices are not named)
  function payLine(row, here) {
    if (!row) return null;
    const pay = row.min1 ? h('span.warn', { title: 'Its price is below 1 (or "="), or too big for the server\'s float math: the server charges 1 (OnBuyItem)' }, 'pay 1 (no price)') : `pay ${fmt(row.pay)}`;
    const back = row.refused ? h('span', { title: 'The NPC refuses to buy it (OnSellItem)' }, `can't sell back (${row.refused})`) : `sells to an NPC for ${fmt(row.get)}`;
    return h('div.pay.small.muted', { title: 'What a player pays for one here, and what any NPC pays a player who sells one back (a quarter of the price). Shop rates 1.0; port of OnBuyItem / OnSellItem.' },
      'Players ', pay, ' · ', back,
      row.setBy && row.setBy.npc && (!here || npcId(row.setBy.npc) !== npcId(here))
        ? h('div', { title: 'A price typed in a shop is the item\'s price on the whole server (Project.cpp:3581)' }, `price set in ${row.setBy.npc.name || row.setBy.npc.key}'s shop`) : null);
  }

  // edits: { omit: Set(id), price: Map(id -> cost), slot: Map(id -> tab) }; what: plain words for the toast
  function editAuto(ctx, npc, slot, edits, what) {
    const ws = ctx.ws;
    const plan = V().ruleToFixedPlan(ws.vendorIndex, npc, slot, ws.simulate(npc), edits);
    if (plan.blocked) { FRE.dom.toast(`Can't change this row: ${plan.blocked}`, 'bad'); ctx.renderAll(false); return; }
    const n = plan.items.length;
    const [priced] = [...(edits.price || new Map())];
    const others = priced ? FRE.shopOps.otherPriceParts(ws, priced[0], priced[1], null) : { parts: [], lines: [] };
    ctx.editGroup(() => {
      const now = fresh(ws, npc);
      const p = V().ruleToFixedPlan(ws.vendorIndex, now, slot, ws.simulate(now), edits);
      const own = [{ file: ws.fileOfNpc(now).name.toLowerCase(), splices: FRE.shopOps.convertRules(ws.fileOfNpc(now).text, now, p) }];
      return priced ? FRE.shopOps.mergeParts(own, FRE.shopOps.otherPriceParts(ws, priced[0], priced[1], null).parts) : own;
    }, `${npc.name || npc.key}: ${what}${alsoText(others.lines)} (the ${n} auto item${n === 1 ? '' : 's'} of ${tabName(npc, slot)} now each have their own line, same order)`, ['npc|' + npcId(npc)],
    priced ? `price|${npcId(npc)}|${priced[0]}` : null);
  }

  const alsoText = lines => (lines.length ? `, also in ${[...new Set(lines.map(l => l.npc.name || l.npc.key))].join(', ')}'s shop line${lines.length === 1 ? '' : 's'}` : '');

  // A price on an item's own line, written on its other priced lines too (shopOps.otherPriceParts)
  function setPrice(ctx, npc, rec, value, what) {
    const ws = ctx.ws, file = npc.file.toLowerCase();
    const others = value === null ? { parts: [], lines: [] } : FRE.shopOps.otherPriceParts(ws, rec.args.item.value, value, { start: rec.start, file });
    ctx.editGroup(() => {
      const own = [{ file, splices: FRE.shopOps.setCost(ws.files.get(file).text, rec, value) }];
      return value === null ? own : FRE.shopOps.mergeParts(own, FRE.shopOps.otherPriceParts(ws, rec.args.item.value, value, { start: rec.start, file }).parts);
    }, `${npc.name || npc.key}: ${what}${alsoText(others.lines)}`, ['npc|' + npcId(npc)], `price|${npcId(npc)}|${rec.args.item.value >>> 0}`);
  }

  FRE.ui.shopRules = { payLine, editAuto, setPrice };
})(globalThis.FRE = globalThis.FRE || {});
