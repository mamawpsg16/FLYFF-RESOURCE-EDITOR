// What happens when a player buys in the Donation Shop: a port of the client's confirm dialog
// and the WorldServer's handler (custom __DONATIONSHOP, commit 7d7df4f9), run on the catalog
// DonationShop.inc loads (FRE.donation) and the prices in Spec_Item.txt (dwReferValue1).
//   confirm    <- CWndConfirmBuyDonation (Neuz _Interface/WndDonationShop.cpp):
//                 Initialize (:38, no price -> message), OnChildNotify (:83, quantity 0..9999 typed,
//                 1..9999 with + / - / Max), OnChangeBuyCount (:64, total = DWORD count x price),
//                 OnOK (:131, 1..9999, (int)(count x price) > GetAtItemNum(II_CHP_DONATE) -> message)
//   serverBuy  <- CDPSrvr::OnBuyDonationItem (WORLDSERVER/DPSrvr.cpp:3636)
//                 CItemBase::GetChipCost (_Common/Item.cpp:160: "=" or no prop -> -1)
//                 CItemContainer::GetAtItemNum (_Common/Item.h:595: every slot, locked or in a trade too)
//                 CItemContainer::IsFull (Item.h:694), CMover::RemoveItemA (MoverParam.cpp:3964),
//                 CMover::CreateItem (Mover.cpp:2757) -> CItemContainer::Add: the bag code is shared
//                 with loaders/exchange-sim.js
// The order on the server: count < 1 ignored, > 9999 cut to 9999; not in the catalog, no item or
// no price -> ignored without a message; not enough chips (TID_GAME_LACKCHIP); bag check
// (TID_GAME_LACKSPACE) BEFORE the chips are taken, so a chip stack that would run out does not
// free its slot; chips taken 0x7fff at a time; the item is created with flag 0 and m_bCharged
// FALSE (CItemElem::CItemElem, Item.cpp:223; this handler never sets it).
// Both sides compute the total in 32 bits: from price x count > 2,147,483,647 the (int) total is
// negative, the chip check passes, and the player gets the items for the chips they have
// (DS_OVERFLOW; read from the C++, not seen in game).
//
// Not modelled: the two crash items (commit ae345504: buying them crashed the server, the cause
// was never found; their Spec_Item rows match the safe shields except the icon and the name):
// the outcome is CRASH and nothing changes. Also not modelled: the item log, serial numbers,
// packet timing, and the window's grid (loaders/donation-window.js).
(function (FRE) {
  'use strict';
  const MAX_BUY = 9999;                               // MAX_DS_BUY (WndDonationShop.cpp:85) / OnBuyDonationItem
  const INT_MAX = 2147483647;
  const SAFE_PRICE = Math.floor(INT_MAX / MAX_BUY);   // 214,769: the highest price where 9,999 x price fits an int
  const i32 = v => v | 0;
  const mul32 = (a, b) => Math.imul(a, b) >>> 0;      // DWORD x DWORD, wrapped
  const X = () => FRE.exchangeSim;

  // Everything the simulator needs. over: { [id]: { chip, packMax } } replaces values of an item.
  function envFromWorkspace(ws, over = {}) {
    const D = ws.defines.defines, m = ws.models.donation;
    const catalog = new Map();
    for (const [id, r] of m ? m.catalog : []) catalog.set(id >>> 0, r.category);
    const crash = new Set(FRE.donation.CRASH_ITEMS.filter(d => D.has(d)).map(d => D.get(d) >>> 0));
    return {
      chipId: D.has('II_CHP_DONATE') ? D.get('II_CHP_DONATE') >>> 0 : null,
      catalog, crash,
      prop(id) {
        if ((id >>> 0) === X().FILLER) return { packMax: 1, charged: 0, chip: 0xffffffff, name: '(other item)' };
        const it = ws.itemById(id);
        if (!it) return null;
        const g = f => FRE.specItem.get(it, f), o = over[id >>> 0] || {};
        return { packMax: (o.packMax !== undefined ? o.packMax : g('dwPackMax')) >>> 0, charged: g('bCharged') ? 1 : 0,
          chip: (o.chip !== undefined ? o.chip : g('dwReferValue1')) >>> 0, name: it.name || it.nameKey || it.define, define: it.define };
      },
      text: name => (ws.texts ? ws.texts.get(name) : '') || '',
    };
  }

  // A test player: spec = { unlocked, slots: { pos: [id, num, busy, flag, charged] }, fill }.
  // Positions 0..335 are the bag, 336.. the equipment; `fill` puts other items in the first empty
  // bag positions (locked ones too).
  function playerOf(spec) {
    const S = X(), p = S.player({ unlocked: spec.unlocked === undefined ? S.MAX_INVENTORY_FREE : spec.unlocked });
    for (const [k, v] of Object.entries(spec.slots || {})) {
      const pos = Number(k), it = { id: v[0] >>> 0, num: v[1], busy: !!v[2], flag: v[3] || 0, charged: v[4] || 0 };
      if (pos < S.MAX_INVENTORY) p.slots[pos] = it; else p.equip[pos - S.MAX_INVENTORY] = it;
    }
    let left = spec.fill || 0;
    for (let i = 0; i < S.MAX_INVENTORY && left > 0; i++) if (!p.slots[i]) { p.slots[i] = { id: S.FILLER, num: 1, flag: 0, charged: 0, busy: false }; left--; }
    return p;
  }

  // CItemContainer::GetAtItemNum: every slot of the container, nothing skipped
  const getAtItemNum = (p, id) => X().allSlots(p).reduce((a, s) => a + (s.it && s.it.id === id ? s.it.num : 0), 0);

  // GetChipCost: -1 (as a DWORD) when there is no item or the price is "="
  const chipCost = (env, id) => { const pr = env.prop(id); return pr ? pr.chip : 0xffffffff; };

  // CWndConfirmBuyDonation: the player clicks the item, types `typed` (an int; atoi of the box)
  // and presses OK. chips = what the client's bag holds.
  function confirm(env, id, typed, chips) {
    const cost = chipCost(env, id);
    if (i32(cost) < 1) return { box: 'NO_PRICE', shown: null, sent: null };
    const n = Math.min(Math.max(typed === undefined ? 1 : typed, 0), MAX_BUY);   // EN_CHANGE
    const shown = mul32(n, cost);                                                 // OnChangeBuyCount, %u
    const nBuy = Math.min(Math.max(n, 1), MAX_BUY);                               // OnOK
    if (i32(mul32(nBuy, cost)) > chips) return { box: 'LACK_CHIPS', shown, sent: null };
    return { box: null, shown, sent: X().short(nBuy) };
  }
  const CLIENT_TEXT = { NO_PRICE: 'This item has no donate-chip price set.', LACK_CHIPS: 'More Donate Chips are needed.' };

  // CDPSrvr::OnBuyDonationItem with a packet { dwItemId, nNum }. Changes p.
  function serverBuy(env, p, id, nNumIn) {
    const S = X();
    id = id >>> 0;
    let nNum = S.short(nNumIn);
    const out = { outcome: null, text: null, num: nNum, cost: null, total: null, paid: 0, chipsBefore: env.chipId === null ? 0 : getAtItemNum(p, env.chipId) };
    const done = (outcome, text = null) => { out.outcome = outcome; out.text = text; out.chipsAfter = env.chipId === null ? 0 : getAtItemNum(p, env.chipId); return out; };
    if (nNum < 1) return done('IGNORED_COUNT');
    if (nNum > MAX_BUY) nNum = MAX_BUY;
    out.num = nNum;
    if (!env.catalog.has(id)) return done('IGNORED_NOT_LISTED');
    const pr = env.prop(id);
    if (!pr) return done('IGNORED_NO_ITEM');
    const cost = pr.chip;
    out.cost = cost;
    if (i32(cost) < 1) return done('IGNORED_NO_PRICE');
    const total = mul32(cost, nNum);
    out.total = total;
    out.overflow = total > INT_MAX;
    if (out.chipsBefore < i32(total)) return done('LACK_CHIP', 'TID_GAME_LACKCHIP');
    if (S.bagIsFull(env, p, id, nNum, 0, 0)) return done('LACK_SPACE', 'TID_GAME_LACKSPACE');
    if (env.crash.has(id)) return done('CRASH');
    let t = total;
    while (t > 0x7fff) {
      if (getAtItemNum(p, env.chipId) === 0) break;      // every further RemoveItemA takes nothing
      out.paid += S.removeItemA(p, env.chipId, 0x7fff);
      t -= 0x7fff;
    }
    if (t <= 0x7fff) out.paid += S.removeItemA(p, env.chipId, S.short(t));
    return done(S.createItem(env, p, id, nNum, 0, 0) ? 'BOUGHT' : 'CREATE_FAILED');
  }

  // The whole buy: the dialog, then the packet it sends (if any). p changes.
  function buy(env, p, id, typed) {
    const client = confirm(env, id, typed, env.chipId === null ? 0 : getAtItemNum(p, env.chipId));
    return { client, server: client.sent === null ? null : serverBuy(env, p, id, client.sent) };
  }

  // the bag as [position, id, num, flag, charged], other items left out
  function dump(p) {
    const S = X(), out = [];
    S.allSlots(p).forEach((s, k) => { if (s.it && s.it.id !== S.FILLER) out.push([k, s.it.id, s.it.num, s.it.flag, s.it.charged]); });
    return out;
  }

  // What players read (the editor's Try buying window)
  function describe(env, r) {
    if (r.client.box) return { kind: 'box', text: CLIENT_TEXT[r.client.box] };
    const s = r.server;
    if (s.text) return { kind: 'chat', text: env.text(s.text) || s.text };
    if (s.outcome === 'BOUGHT') return { kind: 'ok', text: '' };
    if (s.outcome === 'CRASH') return { kind: 'crash', text: 'The server crashes (known crash item, commit ae345504).' };
    return { kind: 'none', text: '(nothing: the server ignores the request)' };
  }

  FRE.donationBuy = { envFromWorkspace, playerOf, getAtItemNum, confirm, serverBuy, buy, dump, describe, CLIENT_TEXT, MAX_BUY, SAFE_PRICE, INT_MAX };
})(globalThis.FRE = globalThis.FRE || {});
