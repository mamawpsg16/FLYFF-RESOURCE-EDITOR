// The game's shop window tabs: what a player sees after right-click → Trade, and what a click
// on each tab does. Port of the client code (Neuz):
//   CWndShop::OnInitialUpdate      (_Interface/WndShop.cpp:815-833)  one tab per NAMED slot
//                                   (m_venderSlot[i] not empty), then blank tabs up to 3
//   CWndTabCtrl::CWndTabCtrl       (_Interface/WndControl.cpp:5219)  m_nCurSelect = 0
//   CWndTabCtrl::InsertItem        (WndControl.cpp:5744)  the tab goes to index i (m_aTab.resize(i+1)),
//                                   so an unnamed slot below a named one stays a NULL entry
//   CWndTabCtrl::OnLButtonDown     (WndControl.cpp:5632)  NULL entries cannot be clicked
//   CWndTabCtrl::SetCurSel         (WndControl.cpp:5674)  only a tab with an item list is selected; it first
//                                   hides the old one: m_aTab[old]->pWndBase, a NULL dereference when old
//                                   is a NULL entry (slot 0 unnamed while a later slot is named) = client crash
//   buying                         CWndShop sends cTab = GetCurSel() (WndShop.cpp:673); the server sells from
//                                   m_ShopInventory[cTab] (CDPSrvr::OnBuyItem, DPSrvr.cpp:3363), the same slot
// Titles are m_venderSlot (AddVendorSlot / AddVenderSlot, CProject::LoadCharacter, Project.cpp:3424-3439),
// read by the client from its own character.inc + character.txt.txt (Client/ copies, kept identical).
// AddVendorSlotLang is not modelled: it appears only in comments in this data.
// Not modelled: tab widths and drawing, the window position.
(function (FRE) {
  'use strict';
  const MAX_TAB = 4;                 // MAX_VENDOR_INVENTORY_TAB
  const named = t => t !== undefined && t !== null && t !== '';

  // titles: { slot: text } ; counts: [n0..n3] items in each slot (vendor-sim)
  // -> { tabs: [ null | { slot, title, list, items } ], cur, shown, clicks: [ 'select' | 'nothing' | 'crash' ] }
  function open(titles, counts) {
    const tabs = [];
    for (let i = 0; i < MAX_TAB; i++) {
      if (!named(titles[i])) continue;
      while (tabs.length < i) tabs.push(null);
      tabs[i] = { slot: i, title: titles[i], list: true, items: counts[i] || 0 };
    }
    for (let i = tabs.length; i < 3; i++) tabs.push({ slot: null, title: '', list: false, items: 0 });
    const cur = 0;
    const shown = tabs[cur] && tabs[cur].list ? tabs[cur].slot : null;
    return { tabs, cur, shown, clicks: tabs.map((_, i) => click(tabs, cur, i).result) };
  }

  // One click on tab position i with tab `cur` selected -> { result, cur }
  function click(tabs, cur, i) {
    if (!tabs.length || i < 0 || i >= tabs.length || !tabs[i]) return { result: 'nothing', cur };
    if (!tabs[i].list) return { result: 'nothing', cur };
    const old = tabs[cur];
    if (!old || !old.list) return { result: 'crash', cur };
    return { result: 'select', cur: i };
  }

  // The window of one NPC from the loaded workspace (vendor-sim gives the item counts).
  function ofNpc(npc, sim) {
    return open(npc.slotTitles, sim.tabs.map(t => t.entries.length));
  }

  // Plain lines for tools/npcedit-sim.js and the editor.
  function describe(win) {
    const out = [];
    out.push('Tabs: ' + win.tabs.map((t, i) => !t ? `[${i + 1}: no tab]` : t.list ? `[${t.title} (${t.items})]` : `[${i + 1}: blank]`).join(' '));
    out.push(win.shown === null ? 'Opens with no item list showing.' : `Opens on "${win.tabs[win.cur].title}".`);
    win.clicks.forEach((c, i) => { if (c === 'crash') out.push(`Clicking tab ${i + 1} crashes the game client (slot 0 has no name).`); });
    return out;
  }

  FRE.shopWindow = { open, click, ofNpc, describe, MAX_TAB };
})(globalThis.FRE = globalThis.FRE || {});
