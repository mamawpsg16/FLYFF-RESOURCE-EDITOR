// NPC Shops module (character*.inc). One table per tab: exactly what players
// see, in server order. Fixed items (AddShopItem / AddVenderItem2) are edited
// in place; an edit on an item from an AddVendorItem rule asks first (ui/shop-rules.js).
(function (FRE) {
  'use strict';
  const { h, fmt, numInput } = FRE.dom;
  const { pretty, diagRow, diagTags, diagsInSpan, itemCell, jobCell } = FRE.ui;

  const st = { sel: null, tab: 0, show: 'editable' };
  const npcId = npc => `${npc.file}|${npc.key}`;
  const isShopNpc = npc => npc.statements.some(r => FRE.character.shopEntry(r)) || npc.venderType > 0;
  const selNpc = ctx => (ctx.ws && st.sel ? ctx.ws.chars.npcs.find(n => npcId(n) === st.sel) : null) || null;
  // The exchange menus an NPC opens (names, in its AddMenu order, once each), with their Exchange_Script.txt menu.
  const exMenuOf = (ws, m) => (ws.models.exchange && ws.models.exchange.menus.find(x => x.name === m && !x.isJunk)) || null;
  const exMenusOf = (ws, npc) => [...new Set(npc.menus.map(v => ws.defines.byValue('MMI_', v) || String(v)))]
    .filter(m => ws.exchangeMenus.has(m) && exMenuOf(ws, m));
  // the "NPCs with exchanges" filter: NPCs players can use (on a map, shown) that open at least one exchange menu
  let listWs = null;
  const hasExchanges = npc => !!listWs && exMenusOf(listWs, npc).length > 0
    && (!listWs.placed || FRE.world.npcStatus(npc, listWs.placed).inGame !== false);
  const TYPES = [{ v: 0, label: 'Penya shop' }, { v: 1, label: 'Red Chip shop' }, { v: 2, label: 'Donate Chip shop' }];
  // NPC list filter: which NPCs to list
  // editable = has fixed items (AddShopItem / AddVenderItem2). Rule items are editable too (ui/shop-rules.js),
  // but listing every rule shop here would hide the few shops with hand-set prices.
  const hasEditable = npc => npc.statements.some(r => { const e = FRE.character.shopEntry(r); return e && e.kind !== 'generated'; });
  const SHOW = [
    { v: 'editable', label: 'Shops with hand-picked items', test: hasEditable },
    { v: 'shops', label: 'All shops', test: isShopNpc },
    { v: 'penya', label: 'Penya shops', test: n => isShopNpc(n) && FRE.shopOps.shopType(n.venderType) === 0 },
    { v: 'red', label: 'Red Chip shops', test: n => FRE.shopOps.shopType(n.venderType) === 1 },
    { v: 'donate', label: 'Donate Chip shops', test: n => FRE.shopOps.shopType(n.venderType) === 2 },
    { v: 'exchange', label: 'NPCs with exchanges', test: hasExchanges },
    { v: 'all', label: 'All NPCs', test: () => true },
  ];
  // hover text of a right-click menu: what a click does, in plain words (newNpcSim.rightClick / opensOf)
  const MENU_HELP = {
    MMI_DIALOG: 'Talk to the NPC.',
    MMI_TRADE: 'Opens the shop.',
    MMI_BANKING: 'Opens the bank.',
    MMI_GUILDBANKING: 'Opens the guild bank.',
    MMI_NPC_BUFF: 'Gives buffs.',
  };
  function menuHelp(name, x) {
    const what = MENU_HELP[name] || (x && x.opens ? (x.opens.board ? 'Shows your rules text. Click to edit.' : x.opens.sets ? `Swap items for other items (${x.opens.sets}).` : 'Swap items for other items (none set up yet).')
      : 'Opens its own window.');
    return `${what}${x && x.when ? ` Only if: ${x.when}.` : ''}`;
  }
  // the tab an NPC opens on: its first exchange under the "NPCs with exchanges" filter, else shop tab 1
  const firstTab = (ws, npc) => { const ex = st.show === 'exchange' ? exMenusOf(ws, npc) : []; return ex.length ? 'ex:' + ex[0] : 0; };
  const showTest = () => (SHOW.find(o => o.v === st.show) || SHOW[0]).test;

  function edit(ctx, npc, make, label) {
    ctx.edit(npc.file.toLowerCase(), make, label, 'npc|' + npcId(npc));
  }

  // One exchange menu of this NPC, edited in place with the Exchanges task's cards (ui/exchange.js):
  // works before saving too, since the cards read the live Exchange_Script.txt model.
  function exchangeTab(el, ctx, npc, menu, label) {
    const ws = ctx.ws, xv = FRE.ui.exchangeView;
    const editable = ws.isEditable('exchange_script.txt');
    el.appendChild(h('div.row.ex-tools', { style: 'margin:8px 0' },
      h('span', h('b', label), h('span.def', ' ' + menu.name), h('span.muted', ` · ${Math.min(menu.sets.length, 30)} exchange${menu.sets.length === 1 ? '' : 's'} in the window`)),
      editable && menu.closed && FRE.ui.menuForm ? h('button.small', { title: 'Add exchanges to this menu', on: { click: () => FRE.ui.menuForm.openNewExchanges(ctx, menu) } }, '+ New exchange') : null,
      editable ? null : h('span.tag.bad', 'read-only')));
    // the same menu id on other NPCs: they open the same window, so an edit here changes theirs too
    const others = ((ws.npcInfoByMenu() || new Map()).get(menu.mmi.value) || []).filter(x => x.npc !== npc && x.inGame !== false);
    const otherNames = [...new Set(others.map(x => x.name))];
    if (otherNames.length) el.appendChild(h('p.small.warn.ex-shared', `Also opened by ${otherNames.join(', ')}: they show the same window, so a change here changes theirs too.`));
    el.appendChild(h('p.muted.small', `What players see after right-click ${npc.name || npc.key} → ${label}. Chances are in percent; changing one moves the others so they always add up to 100%. Try it presses OK in the game's exchange window.`));
    if (!menu.sets.length) el.appendChild(h('p.muted', 'No exchange yet: the window opens empty. Press + New exchange.'));
    xv.cards(ctx, menu).forEach(c => el.appendChild(c));
  }

  // "Change position / model" (map-pin icon) next to the name: where it stands and its body (task S part 3)
  const PIN = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#ea4335" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';
  function placeButton(ctx, npc) {
    const ws = ctx.ws;
    if (!ws.placed) return null;
    const spots = FRE.npcEditOps.placementsOf(ws, npc);
    if (!spots.length || !spots.every(p => ws.isEditable(p.file))) return null;
    const b = h('button.place-edit', { title: `Move ${npc.name || npc.key} or change its model (its map record, Server + Client)${spots.length > 1 ? `; it stands in ${spots.length} places` : ''}`,
      on: { click: () => FRE.ui.npcEdit.editPlace(ctx, npc) } });
    b.innerHTML = PIN;
    b.appendChild(h('span', 'Change position / model'));
    return b;
  }

  function shopTypeSelect(ctx, npc, canEdit) {
    const cur = FRE.shopOps.shopType(npc.venderType);
    const sel = h('select.shop-type', { disabled: !canEdit, title: 'Which currency this NPC sells for. Changing it converts the item lines (preview first).' },
      // Donate Chips are sold in the Donation Shop window since commit 7d7df4f9 (Adrian's
      // SetVenderType(2) shop was removed), so type 2 is only offered to an NPC that already has it.
      TYPES.filter(t => t.v !== 2 || cur === 2).map(t => h('option', { value: t.v, selected: t.v === cur }, t.label)));
    sel.addEventListener('change', () => {
      const to = Number(sel.value);
      sel.value = String(cur);                    // only changes after confirming
      previewShopType(ctx, npc, to);
    });
    return sel;
  }

  const { chipOf } = FRE.ui.chipPrice;
  const chipPriceParts = (ws, prices) => FRE.ui.chipPrice.parts(ws, prices);
  const hereNpc = npc => u => u.kind === 'npc' && npcId(u.npc) === npcId(npc);
  const confirmShared = (ctx, npc, ids, then) => FRE.ui.chipPrice.confirmShared(ctx, ids, hereNpc(npc), then);

  // Preview of a currency change: each converted item with its new price, then the exact lines.
  function previewShopType(ctx, npc, to) {
    const ws = ctx.ws, f = ws.fileOfNpc(npc);
    const from = FRE.shopOps.shopType(npc.venderType);
    if (to === from) return;
    const itemOf = id => { const it = ws.itemById(id); return it ? ws.itemInfo(it) : null; };
    const plan = FRE.shopOps.shopTypePlan(npc, to, itemOf);
    const label = TYPES[to].label, chips = to === 2 ? 'Donate chips' : 'Red chips';
    const toChips = to !== 0;
    const specOk = ws.isEditable('spec_item.txt');
    const prices = new Map();     // to chips: itemId -> chip price; to Penya: rec.start -> Penya price
    const fresh = () => ws.chars.npcs.find(n => npcId(n) === npcId(npc)) || npc;

    function parts() {
      const now = fresh();
      const out = [{ file: f.name.toLowerCase(), splices: FRE.shopOps.setShopType(f.text, now, to, toChips ? null : prices) }];
      if (toChips) {
        const changed = new Map([...prices].filter(([id, v]) => v !== chipOf(itemOf(id))));
        out.push(...chipPriceParts(ws, changed));
      }
      return out;
    }

    const dropped = new Map(plan.droppedPrices.map(r => [r.rec.start, r.cost]));
    const diffBox = h('div');
    function refreshDiff() {
      diffBox.textContent = '';
      try {
        for (const p of parts()) {
          const sf = ws.files.get(p.file);
          diffBox.appendChild(h('h4', sf.name));
          diffBox.appendChild(FRE.ui.renderDiff(sf, sf.text, sf.preview(p.splices)));
        }
      } catch (e) { diffBox.appendChild(h('p.bad', e.message)); }
    }

    const rows = plan.converted.map(r => {
      const id = r.info ? r.info.id : null;
      const key = toChips ? id : r.rec.start;
      const status = h('span');
      const update = () => {
        const v = prices.has(key) ? prices.get(key) : (toChips ? chipOf(r.info) : null);
        status.textContent = ''; status.className = '';
        if (toChips) {
          if (v === null) { status.className = 'tag warn'; status.textContent = 'no chip price: left out of the shop'; }
        } else if (v === null) {
          if (r.info && r.info.cost > 0) { status.className = 'muted'; status.textContent = `item's own price: ${fmt(r.info.cost)}`; }
          else { status.className = 'tag warn'; status.textContent = 'no price: sells for 1 Penya (DPSrvr.cpp:3404)'; }
        }
      };
      const input = numInput({
        value: toChips ? chipOf(r.info) : null, min: toChips ? 1 : 0,
        placeholder: toChips ? 'no chip price' : (r.info ? `${fmt(r.info.cost)} (item)` : ''),
        disabled: toChips && (!specOk || !r.info),
        title: toChips ? 'Chip price (dwReferValue1 in Spec_Item.txt). One price per item: it also applies in other chip shops and the Donation Shop.'
          : 'Penya price written as AddShopItem( tab, item, price ). Empty = the item\'s own price (dwCost). AddShopItem prices apply server-wide.',
        onCommit: v => { prices.set(key, v); update(); refreshDiff(); },
      });
      update();
      const was = toChips
        ? (dropped.has(r.rec.start) ? `${fmt(dropped.get(r.rec.start))} Penya (removed)` : r.info ? `${fmt(r.info.cost)} Penya (item)` : '')
        : (chipOf(r.info) ? `${fmt(chipOf(r.info))} chips` : 'no chip price');
      return h('tr', itemCell(r.info, r.define), h('td.muted', was), h('td', input), h('td', status));
    });

    const body = h('div',
      h('p', `${npc.name || npc.key} changes from ${TYPES[from].label} to ${label}. You can undo it in one step.`),
      plan.converted.length ? [
        h('p', toChips
          ? `${plan.converted.length} item line(s) become AddVenderItem2, sold for ${chips}. Set each item's chip price below (Spec_Item.txt, shared by every chip shop and the Donation Shop).`
          : `${plan.converted.length} item line(s) become AddShopItem, sold for Penya. Type a price, or leave it empty to use the item's own price.`),
        toChips && !specOk ? h('p.bad', 'Spec_Item.txt is not editable, so chip prices cannot be changed here.') : null,
        toChips && plan.droppedPrices.length ? h('p.muted', 'Removed AddShopItem prices also stop overriding the item\'s Penya price server-wide.') : null,
        h('table.items', h('tr', h('th', 'Item'), h('th', 'Before'), h('th.num', toChips ? `Price (${chips})` : 'Price (Penya)'), h('th', '')), rows),
      ] : null,
      plan.rulesIgnored ? h('p.muted', `${plan.rulesIgnored} AddVendorItem rule(s) stay in the file but are ignored in chip shops.`) : null,
      plan.rulesUsedAgain ? h('p.muted', `${plan.rulesUsedAgain} AddVendorItem rule(s) fill the tabs again.`) : null,
      h('h3', 'Lines that change'), diffBox);
    refreshDiff();
    FRE.dom.modal({ title: `Make ${npc.name || npc.key} a ${label}?`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: `Make it a ${label}`, cls: 'primary', onClick: () => {
        const changedIds = toChips ? [...prices].filter(([id, v]) => v !== chipOf(itemOf(id))).map(([id]) => id) : [];
        confirmShared(ctx, npc, changedIds, () => ctx.editGroup(parts, `shop type: ${label}`, ['npc|' + npcId(npc)]));
      } },
    ] });
  }
  FRE.ui.previewShopType = previewShopType;

  const mod = {
    id: 'npc', label: 'NPC Shops', searchPlaceholder: 'Search NPCs',
    help: 'NPC Shops: what each NPC sells (character.inc, character-etc.inc, character-school.inc), its currency and prices',
    st, npcId,

    onLoad(ctx) {
      listWs = ctx.ws;
      const first = ctx.ws.chars.npcs.find(showTest()) || ctx.ws.chars.npcs.find(isShopNpc);
      st.sel = first ? npcId(first) : null; st.tab = first ? firstTab(ctx.ws, first) : 0;
    },

    isListed: npc => showTest()(npc),

    listAction(ctx) {
      const canAdd = ctx.ws && ctx.ws.isEditable('character.inc') && ctx.ws.isEditable('character.txt.txt') && ctx.ws.mapFiles.size;
      return h('button.primary', { disabled: !canAdd,
        title: canAdd ? 'Create a new NPC: place it on a map, pick its menus and shop' : 'Needs character.inc, character.txt.txt and the World/ map files (editable)',
        on: { click: () => FRE.ui.newNpc.open(ctx) } }, '+ NPC');
    },

    listExtra(ctx) {
      listWs = ctx.ws;
      const npcs = ctx.ws ? ctx.ws.chars.npcs : [];
      return h('select.npc-filter', { title: 'Which NPCs to list. Hand-picked items: a shop where at least one item was added one by one (with a price you can set), not only every item of a type (auto)', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => ({ o, n: npcs.filter(o.test).length }))
          .filter(x => x.n > 0 || x.o.v === st.show)            // e.g. no Donate Chip NPC since 7d7df4f9: option hidden
          .map(({ o, n }) => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${n})`)));
    },

    renderList(el, ctx) {
      listWs = ctx.ws;
      const q = ctx.query.toLowerCase();
      const diagBy = new Map();
      for (const d of ctx.ws.diags) if (d.npcKey && d.severity !== 'INFO') {
        const k = `${d.file}|${d.npcKey}`; const o = diagBy.get(k) || { w: 0, b: 0 };
        if (d.severity === 'BLOCK') o.b++; else o.w++;
        diagBy.set(k, o);
      }
      let shown = 0;
      const test = showTest();
      for (const npc of ctx.ws.chars.npcs) {
        if (!test(npc)) continue;
        const label = npc.name || npc.key;
        if (q && !label.toLowerCase().includes(q) && !npc.key.toLowerCase().includes(q)) continue;
        const id = npcId(npc), dg = diagBy.get(id);
        shown++;
        el.appendChild(h('div.npc' + (id === st.sel ? '.sel' : ''), { on: { click: () => { st.sel = id; st.tab = firstTab(ctx.ws, npc); if (FRE.ui.exchangeView) FRE.ui.exchangeView.clearPick(); ctx.renderAll(false); } } },
          h('div.n', h('span', label),
            h('span', npc.venderType === 1 ? h('span.tag.chip', 'Red Chip') : npc.venderType === 2 ? h('span.tag.chip', 'Donate') : null,
              ctx.edited.has('npc|' + id) || exMenusOf(ctx.ws, npc).some(m => ctx.edited.has('ex|' + m)) ? h('span.tag.edit', 'edited') : null,
              dg && dg.b ? h('span.tag.bad', '⛔' + dg.b) : dg && dg.w ? h('span.tag.warn', '⚠' + dg.w) : null)),
          h('div.k', `${npc.key} · ${npc.file}`),
          ctx.ws.area ? h('div.k.where-short', FRE.ui.whereText(ctx.ws.whereOf(npc.key))) : null));
      }
      if (!shown) el.appendChild(h('div.pad.muted', 'No NPCs match.'));
    },

    renderEditor(el, ctx) {
      const ws = ctx.ws, npc = selNpc(ctx);
      if (!npc) { el.appendChild(h('p.empty-state', 'Select an NPC on the left.')); return; }
      const f = ws.fileOfNpc(npc);
      const canEdit = ws.isEditable(f.name.toLowerCase());
      const chip = npc.venderType === 1 || npc.venderType === 2;
      const chipName = npc.venderType === 2 ? 'Donate' : 'Red';
      const D = ws.defines;
      const entries = npc.statements.map(r => ({ r, e: FRE.character.shopEntry(r) })).filter(x => x.e);
      const line = pos => 'L' + (f.lineOf(pos) + 1);
      const npcName = npc.name || npc.key;

      const E = FRE.npcEditOps, canTexts = E.canEditTexts(ws, npc);
      el.appendChild(h('div.npc-title', h('h2', npc.name || npc.key),
        canTexts ? h('button.icon.edit-btn', { title: 'Edit the name (the name players see; the key stays)', on: { click: () => FRE.ui.npcEdit.renameNpc(ctx, npc) } }, FRE.ui.pencil()) : null,
        placeButton(ctx, npc),
        h('span.def', npc.key),
        h('span.line', `${npc.file}:${f.lineOf(npc.start) + 1}`),
        shopTypeSelect(ctx, npc, canEdit),
        canEdit ? null : h('span.tag.bad', 'read-only')));
      if (ws.placed) {
        const status = FRE.world.npcStatus(npc, ws.placed);
        el.appendChild(h('div.where-row', FRE.ui.whereLine(ws.whereOf(npc.key)),
          status.inGame === false && status.maps.length ? h('span.tag.warn', { title: 'CWorld::IsUsableDYO2: the WorldServer does not load this NPC' }, status.why) : null));
      }
      // a NPC made with "+ New NPC": what the game will load (loaders/newnpc-sim.js)
      if (FRE.ui.newNpc && FRE.ui.newNpc.created.has(npc.key.toLowerCase())) {
        const g = FRE.newNpcSim.inGame(ws, npc.key);
        const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : String(id); };
        el.appendChild(h('div.nn-ingame', h('b', 'In game after Save + restart: '), FRE.newNpcSim.describe(g, name).map(l => h('div', l))));
      }
      const menus = npc.menus.map(v => D.byValue('MMI_', v) || String(v));
      // exchange menus: the label players read + how many exchanges; each has its own tab next to the shop tabs
      const exMenu = m => exMenuOf(ws, m);
      const labelOf = m => { const id = D.defines.get(m); const t = id === undefined || !ws.texts ? null : ws.texts.byId.get(FRE.newNpcSim.TID_MMI_DIALOG + id); return t ? t.text : pretty(m); };
      const exNames = FRE.ui.exchangeView ? exMenusOf(ws, npc) : [];
      const showTab = t => { if (FRE.ui.exchangeView) FRE.ui.exchangeView.clearPick(); st.tab = t; ctx.renderAll(false); };
      if (typeof st.tab === 'string' && !exNames.includes(st.tab.slice(3))) st.tab = 0;
      const ownMenu = new Set(npc.statements.filter(r => r.cmd === 'AddMenu').map(r => r.args.menu.value));
      const rmMenu = (i, m) => canEdit && ownMenu.has(npc.menus[i])
        ? h('button.icon.menu-x', { title: `Remove ${m} from the right-click menu`, on: { click: e => { e.stopPropagation(); FRE.ui.npcEdit.removeMenu(ctx, npc, npc.menus[i], exNames.includes(m) ? labelOf(m) : pretty(m)); } } }, '✕') : null;
      // shown as players see it: the in-game label, in the game's order (newNpcSim.rightClick), with what a click does
      const rc = new Map(FRE.newNpcSim.rightClick(ws, npc.menus).map(x => [x.id, x]));
      const order = npc.menus.map((v, i) => i).sort((a, b) => npc.menus[a] - npc.menus[b]);
      el.appendChild(h('div.menus', h('span.menus-label', { title: 'What players see when they right-click this NPC.' }, 'Right-click menu:'), order.map(i => {
        const m = menus[i], x = rc.get(npc.menus[i]);
        const label = (x && x.label) || pretty(m);
        if (x && x.opens && x.opens.board) return h('span.tag.exch-wrap', h('button.tag.board', { title: menuHelp(m, x), on: { click: () => FRE.ui.menuChooser.boardForm(ctx, npc, { id: npc.menus[i], name: m }) } }, label, ' ', FRE.ui.pencil(12)), rmMenu(i, m));
        if (!exNames.includes(m)) return h('span.tag', { title: menuHelp(m, x) }, label, rmMenu(i, m));
        const n = Math.min(exMenu(m).sets.length, 30);
        return h('span.tag.exch-wrap', h('button.tag.exch', { title: `Swap items for other items (${n}). Click to edit.`,
          on: { click: () => showTab('ex:' + m) } }, `${label} ⇄ ${n} exchange${n === 1 ? '' : 's'}`), rmMenu(i, m));
      }), canEdit ? h('button.small.add-menu', { title: 'Add a right-click menu: a shop, a swap list or a rules text', on: { click: () => FRE.ui.menuChooser.open(ctx, npc) } }, '+ Menu') : null));

      const sim = ws.simulate(npc);
      const named = s => npc.slotTitles[s] !== undefined && npc.slotTitles[s] !== '';
      // only tabs the game shows (a name) or that hold items; an unnamed tab is never offered as a place for items
      const shownTabs = [0, 1, 2, 3].filter(t => named(t) || sim.tabs[t].entries.length || sim.tabs[t].dropped.length);
      if (typeof st.tab === 'number' && !shownTabs.includes(st.tab)) st.tab = shownTabs.length ? shownTabs[0] : 0;
      const dupTitles = shownTabs.map(t => npc.slotTitles[t]).filter((x, i, a) => x !== undefined && a.indexOf(x) !== i).length > 0;
      const tabLabel = t => !named(t) ? `Tab ${t + 1} · no name` : dupTitles ? `${t + 1} · ${npc.slotTitles[t]}` : npc.slotTitles[t];
      const tabs = h('div.tabs');
      for (const t of shownTabs) {
        const n = sim.tabs[t].entries.length;
        const sel = t === st.tab;
        tabs.appendChild(h('button' + (sel ? '.sel' : '') + (named(t) ? (FRE.ui.npcEdit.isPlaceholder(npc.slotTitles[t]) ? '.placeholder' : '') : '.unnamed'),
          { title: named(t) ? `Tab ${t + 1} (slot ${t} in the file)` : 'No AddVendorSlot: the game shows no such tab, so these items are invisible', on: { click: () => showTab(t) } },
          named(t) ? '' : '⚠ ', tabLabel(t), h('span.count', n ? `(${n})` : ''),
          sel && named(t) && canTexts ? h('span.tab-edit', { title: 'Edit this tab\'s name', on: { click: e => { e.stopPropagation(); FRE.ui.npcEdit.renameTab(ctx, npc, t); } } }, ' ', FRE.ui.pencil(12)) : null));
      }
      if (canTexts && E.nextSlot(npc) !== null) {
        tabs.appendChild(h('button.add-tab', { title: `Add tab ${E.nextSlot(npc) + 1}: a name players see in the shop window (AddVendorSlot, the d11123ac way)`,
          on: { click: () => FRE.ui.npcEdit.addTab(ctx, npc, slot => { st.tab = slot; }) } }, '+ Tab'));
      }
      for (const m of exNames) {
        const n = Math.min(exMenu(m).sets.length, 30);
        tabs.appendChild(h('button.ex-tab' + ('ex:' + m === st.tab ? '.sel' : ''), { title: `${m}: the exchange window this menu opens`, on: { click: () => showTab('ex:' + m) } },
          `⇄ ${labelOf(m)}`, h('span.count', `(${n})`)));
      }
      el.appendChild(tabs);
      if (typeof st.tab === 'string') { exchangeTab(el, ctx, npc, exMenu(st.tab.slice(3)), labelOf(st.tab.slice(3))); return; }
      const tab = sim.tabs[st.tab];
      const trade = D.defines.get('MMI_TRADE');
      if (npc.menus.includes(trade)) {
        const win = FRE.shopWindow.ofNpc(npc, sim);
        const crash = win.clicks.includes('crash');
        el.appendChild(h('div.shop-window.small' + (crash ? '.bad' : '.muted'), { title: 'Port of the client\'s shop window (loaders/shop-window.js)' },
          'In game (right-click → Trade): ', FRE.shopWindow.describe(win).join(' ')));
      }
      if (!shownTabs.length) {
        el.appendChild(h('p.muted', canTexts ? 'This NPC has no shop tab. + Tab adds one; players also need the Trade menu (+ Menu).' : 'This NPC has no shop tab.'));
        return;
      }
      if (!named(st.tab)) el.appendChild(h('p.bad.small', `Tab ${st.tab + 1} has no name, so the game shows no such tab and players never see the items below. ${canTexts ? 'Name it with + Tab, or move the items to a named tab.' : ''}`));
      else if (FRE.ui.npcEdit.isPlaceholder(npc.slotTitles[st.tab]) && !tab.entries.length)
        el.appendChild(h('p.muted.small', `Players see this tab as "${npc.slotTitles[st.tab]}" (a placeholder name).${canTexts ? ' Rename it with ✎ on the tab, then add items with the + button next to an item in the list on the right.' : ''}`));

      // items the server lists by itself (AddVendorItem: every item of one type) are edited like the others (ui/shop-rules.js)
      const SR = FRE.ui.shopRules;
      // one table: every item players see, in server order, plus fixed items left out
      el.appendChild(h('h3', `Items in this tab (${tab.entries.length}/100)`));
      const rows = tab.entries.map(en => ({ rec: en.source, kind: en.kind, prop: en.prop }))
        .concat(tab.dropped.map(d => ({ rec: d.rec, kind: d.rec.cmd === 'AddShopItem' ? 'fixed' : 'chip', prop: d.prop || null, dropped: d.reason })));
      if (!rows.length) el.appendChild(h('p.muted', `Empty. Add items with the + button next to an item in the list on the right: they go to "${tabLabel(st.tab)}".`));
      else {
        const tb = h('table.items', h('tr', h('th.num', '#'), h('th', 'Item'), h('th', 'Job'),
          h('th.num', chip ? `Price (${chipName} chips)` : 'Price (Penya)'), h('th', 'Tab'), h('th', ''), h('th', 'From')));
        const priced = chip ? [] : ws.pricedTab(npc, st.tab);
        const ruleRow = row => row.kind === 'generated' && !chip && canEdit && named(st.tab);
        const convert = (row, edits, what) => SR.editAuto(ctx, npc, st.tab, edits, what);
        rows.forEach((row, i) => {
          const info = row.prop ? ws.itemInfo(row.prop.item) : null;
          const r = row.rec;
          const editable = row.kind !== 'generated' || ruleRow(row);
          const pay = row.dropped || chip ? null : SR.payLine(priced[i], npc);
          const def = row.prop ? row.prop.item.define : (r.args.item && (r.args.item.define || f.text.slice(r.args.item.start, r.args.item.end)));
          let price;
          if (chip) {
            price = info ? FRE.ui.chipPrice.input(ctx, info, hereNpc(npc), 'npc|' + npcId(npc)) : '';
          }
          else if (row.kind === 'fixed') {
            price = numInput({ value: r.args.cost ? r.args.cost.value : null, placeholder: info ? fmt(info.cost) + ' (item)' : '', disabled: !canEdit, key: `shop|${npcId(npc)}|${st.tab}|${i}|price`,
              title: 'Empty = the item\'s own price from Spec_Item.txt. A price here changes the item\'s price everywhere (server-wide). Commas are only for display.',
              onCommit: v => FRE.ui.shopRules.setPrice(ctx, npc, r, v, `price of ${info ? info.name : def}`) });
          } else if (ruleRow(row)) {
            // same key as a fixed row's box: after the first change the row is fixed and keeps the focus
            const own = FRE.vendorSim.costOf(ws.costs(), row.prop);
            price = numInput({ value: null, placeholder: `${fmt(own)} (item)`, key: `shop|${npcId(npc)}|${st.tab}|${i}|price`,
              title: 'Empty = the item\'s own price from Spec_Item.txt. A price here changes the item\'s price everywhere (server-wide). Commas are only for display.',
              onCommit: v => { if (v === null) return; convert(row, { price: new Map([[row.prop.id, v]]) }, `price of ${info ? info.name : def}`); } });
          } else price = info ? fmt(info.cost) : '';
          const moveTo = to => (ruleRow(row) ? convert(row, { slot: new Map([[row.prop.id, to]]) }, `moved ${info ? info.name : def} to tab ${to + 1}`)
            : edit(ctx, npc, text => FRE.shopOps.setSlot(text, r, to), `${npcName}: moved ${info ? info.name : def} to tab ${to + 1}`));
          const tabCell = editable
            ? h('select', { disabled: !canEdit, on: { change: ev => moveTo(Number(ev.target.value)) } },
              [0, 1, 2, 3].filter(t => named(t) || t === st.tab).map(t => h('option', { value: t, selected: t === st.tab }, tabLabel(t))))
            : '';
          const rm = !editable ? '' : ruleRow(row)
            ? h('button.icon.danger', { title: 'Remove from this shop', on: { click: () => convert(row, { omit: new Set([row.prop.id]) }, `removed ${info ? info.name : def}`) } }, '✕')
            : h('button.icon.danger', { disabled: !canEdit, title: 'Remove from this shop', on: { click: () => edit(ctx, npc, text => FRE.shopOps.removeStatement(text, r), `${npcName}: removed ${info ? info.name : def}`) } }, '✕');
          const from = row.dropped ? h('span.tag.warn', `left out: ${row.dropped}`)
            : h('span.line', { title: f.text.slice(r.start, r.end) }, line(r.start));
          tb.appendChild(h('tr' + (row.kind !== 'generated' ? '.fixed' : editable ? '.rule-row' : '') + (row.dropped ? '.dropped' : ''),
            h('td.num.line', row.dropped ? '–' : i + 1), itemCell(info, def), jobCell(info),
            h('td.num', price, pay),
            h('td', tabCell), h('td', rm, ' ', row.kind !== 'generated' ? diagTags(diagsInSpan(ws, npc.file, r.start, r.end)) : null), h('td', from)));
        });
        el.appendChild(tb);
      }

      const nd = ws.diags.filter(d => d.file === npc.file && d.npcKey === npc.key);
      if (nd.length) {
        el.appendChild(h('h3', 'Problems for this NPC'));
        nd.forEach(d => el.appendChild(diagRow(d)));
      }
    },

    addTarget(ctx) {
      const npc = selNpc(ctx);
      if (!npc) return { ok: false, title: 'Select an NPC first' };
      if (typeof st.tab === 'string') {         // an exchange tab: the item goes to the exchange being edited
        const xv = FRE.ui.exchangeView;
        if (xv && xv.picking() && xv.st.menu === st.tab.slice(3)) return xv.addTarget(ctx);
        return { ok: false, title: 'Click "+ Ingredient", "+ Reward" or "Change" on an exchange first' };
      }
      if (!ctx.ws.isEditable(npc.file.toLowerCase())) return { ok: false, title: `${npc.file} is read-only` };
      const title = npc.slotTitles[st.tab];
      if (title === undefined || title === '') return { ok: false, title: `Tab ${st.tab + 1} has no name, so players can't see it: name it with + Tab first` };
      return {
        ok: true, title: `Add to ${npc.name || npc.key} → tab ${st.tab + 1} "${title}"`, usesPrice: !(npc.venderType === 1 || npc.venderType === 2),
        add(info, cost) { edit(ctx, npc, text => FRE.shopOps.addItem(text, npc, st.tab, info.define, cost), `${npc.name || npc.key}: added ${info.name} to tab ${st.tab + 1} "${title}"`); },
      };
    },

    locate(d, ctx) {
      if (d.module === 'exchange') {           // an exchange problem: the first NPC players use that opens the menu, on its ⇄ tab
        const ex = ctx.ws.models.exchange;
        const m = ex && ex.menus.find(x => d.start >= x.start && d.start < Math.max(x.end, x.start + 1));
        const users = m ? ((ctx.ws.npcInfoByMenu() || new Map()).get(m.mmi.value) || []) : [];
        const u = users.find(x => x.inGame) || users[0];
        if (!u || !exMenusOf(ctx.ws, u.npc).includes(m.name)) return false;
        st.sel = npcId(u.npc); st.tab = 'ex:' + m.name;
        if (!showTest()(u.npc)) st.show = 'exchange';
        if (FRE.ui.exchangeView) FRE.ui.exchangeView.clearPick();
        return true;
      }
      const npc = d.npcKey && ctx.ws.chars.npcs.find(n => n.key === d.npcKey && n.file === d.file);
      if (!npc) return false;
      st.sel = npcId(npc);
      return true;
    },
  };

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
