// NPC Shops module (character*.inc). One table per tab: exactly what players
// see, in server order. Fixed items (AddShopItem / AddVenderItem2) are edited
// in place; generated items come from AddVendorItem rules (read-only).
(function (FRE) {
  'use strict';
  const { h, fmt, numInput } = FRE.dom;
  const { pretty, diagRow, diagTags, diagsInSpan, itemCell, jobCell } = FRE.ui;

  const st = { sel: null, tab: 0, show: 'editable' };
  const npcId = npc => `${npc.file}|${npc.key}`;
  const isShopNpc = npc => npc.statements.some(r => FRE.character.shopEntry(r)) || npc.venderType > 0;
  const selNpc = ctx => (ctx.ws && st.sel ? ctx.ws.chars.npcs.find(n => npcId(n) === st.sel) : null) || null;
  const TYPES = [{ v: 0, label: 'Penya shop' }, { v: 1, label: 'Red Chip shop' }, { v: 2, label: 'Donate Chip shop' }];
  // NPC list filter: which NPCs to list
  // editable = has fixed items (AddShopItem / AddVenderItem2); AddVendorItem rule items are read-only
  const hasEditable = npc => npc.statements.some(r => { const e = FRE.character.shopEntry(r); return e && e.kind !== 'generated'; });
  const SHOW = [
    { v: 'editable', label: 'Shops with editable items', test: hasEditable },
    { v: 'shops', label: 'All shops', test: isShopNpc },
    { v: 'penya', label: 'Penya shops', test: n => isShopNpc(n) && FRE.shopOps.shopType(n.venderType) === 0 },
    { v: 'red', label: 'Red Chip shops', test: n => FRE.shopOps.shopType(n.venderType) === 1 },
    { v: 'donate', label: 'Donate Chip shops', test: n => FRE.shopOps.shopType(n.venderType) === 2 },
    { v: 'all', label: 'All NPCs', test: () => true },
  ];
  const showTest = () => (SHOW.find(o => o.v === st.show) || SHOW[0]).test;

  function edit(ctx, npc, make, label) {
    ctx.edit(npc.file.toLowerCase(), make, label, 'npc|' + npcId(npc));
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
      const first = ctx.ws.chars.npcs.find(showTest()) || ctx.ws.chars.npcs.find(isShopNpc);
      st.sel = first ? npcId(first) : null; st.tab = 0;
    },

    isListed: npc => showTest()(npc),

    listAction(ctx) {
      const canAdd = ctx.ws && ctx.ws.isEditable('character.inc') && ctx.ws.isEditable('character.txt.txt') && ctx.ws.mapFiles.size;
      return h('button.primary', { disabled: !canAdd,
        title: canAdd ? 'Create a new NPC: place it on a map, pick its menus and shop' : 'Needs character.inc, character.txt.txt and the World/ map files (editable)',
        on: { click: () => FRE.ui.newNpc.open(ctx) } }, '+ NPC');
    },

    listExtra(ctx) {
      const npcs = ctx.ws ? ctx.ws.chars.npcs : [];
      return h('select.npc-filter', { title: 'Which NPCs to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => ({ o, n: npcs.filter(o.test).length }))
          .filter(x => x.n > 0 || x.o.v === st.show)            // e.g. no Donate Chip NPC since 7d7df4f9: option hidden
          .map(({ o, n }) => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${n})`)));
    },

    renderList(el, ctx) {
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
        el.appendChild(h('div.npc' + (id === st.sel ? '.sel' : ''), { on: { click: () => { st.sel = id; st.tab = 0; ctx.renderAll(false); } } },
          h('div.n', h('span', label),
            h('span', npc.venderType === 1 ? h('span.tag.chip', 'Red Chip') : npc.venderType === 2 ? h('span.tag.chip', 'Donate') : null,
              ctx.edited.has('npc|' + id) ? h('span.tag.edit', 'edited') : null,
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

      el.appendChild(h('div.npc-title', h('h2', npc.name || npc.key), h('span.def', npc.key),
        h('span.line', `${npc.file}:${f.lineOf(npc.start) + 1}`),
        shopTypeSelect(ctx, npc, canEdit),
        canEdit ? null : h('span.tag.bad', 'read-only')));
      if (ws.placed) {
        const status = FRE.world.npcStatus(npc, ws.placed);
        el.appendChild(h('div', FRE.ui.whereLine(ws.whereOf(npc.key)),
          status.inGame === false && status.maps.length ? h('span.tag.warn', { title: 'CWorld::IsUsableDYO2: the WorldServer does not load this NPC' }, status.why) : null));
      }
      // a NPC made with "+ New NPC": what the game will load (loaders/newnpc-sim.js)
      if (FRE.ui.newNpc && FRE.ui.newNpc.created.has(npc.key.toLowerCase())) {
        const g = FRE.newNpcSim.inGame(ws, npc.key);
        const name = id => { const it = ws.itemById(id); return it ? (it.name || it.define) : String(id); };
        el.appendChild(h('div.nn-ingame', h('b', 'In game after Save + restart: '), FRE.newNpcSim.describe(g, name).map(l => h('div', l))));
      }
      const menus = npc.menus.map(v => D.byValue('MMI_', v) || String(v));
      if (menus.length) el.appendChild(h('div.menus', 'Menus: ', menus.map(m => ws.exchangeMenus.has(m)
        ? h('span.tag.exch', { title: `${m} is an item exchange defined in Exchange_Script.txt (Exchanges editor coming)` }, `${pretty(m)} ⇄ exchange`)
        : h('span.tag', { title: m }, pretty(m)))));

      const sim = ws.simulate(npc);
      const tabs = h('div.tabs');
      for (let t = 0; t < 4; t++) {
        const n = sim.tabs[t].entries.length;
        tabs.appendChild(h('button' + (t === st.tab ? '.sel' : ''), { on: { click: () => { st.tab = t; ctx.renderAll(false); } } },
          npc.slotTitles[t] || `Tab ${t}`, h('span.count', n ? `(${n})` : '')));
      }
      el.appendChild(tabs);
      const tab = sim.tabs[st.tab];

      // the rules that fill this tab, as one compact line
      const rules = entries.filter(x => x.e.kind === 'generated' && x.e.slot === st.tab);
      if (rules.length) {
        el.appendChild(h('div.rules', h('span.muted.small', chip ? 'Rules (ignored in chip shops): ' : 'Auto-filled by rules (read-only): '), rules.map(({ r, e }) => {
          const ik3 = e.ik3.define || D.byValue('IK3_', e.ik3.value) || String(e.ik3.value);
          const job = e.job.value === -1 ? 'any job' : pretty(e.job.define || D.byValue('JOB_', e.job.value));
          const res = tab.rules.find(x => x.rec === r) || {};
          const adds = chip ? 'ignored' : e.lang ? 'other language only' : res.empty ? 'matches nothing' : `${res.added}`;
          return h('span.tag.rule' + (res.empty || chip ? '.warn' : ''), {
            title: `${f.text.slice(r.start, r.end)}\n\nAdds every sellable ${pretty(ik3)} item${e.job.value === -1 ? '' : ' for ' + job} with rarity (dwItemRare) ${e.rareMin.value}–${e.rareMax.value}. The last number (${e.count.value}) is ignored by the server.`,
          }, `${pretty(ik3)} · ${job} · rarity ${e.rareMin.value}–${e.rareMax.value} → ${adds}`, h('span.line', ' ' + line(r.start)));
        })));
      }

      if (rules.length && !entries.some(x => x.e.kind !== 'generated' && x.e.slot === st.tab)) {
        el.appendChild(h('p.muted.small', 'The items below come from the rules above, so they can\'t be removed or priced one by one. You can still add fixed items to this tab with + in the item list.'));
      }
      // one table: every item players see, in server order, plus fixed items left out
      el.appendChild(h('h3', `Items in this tab (${tab.entries.length}/100)`));
      const rows = tab.entries.map(en => ({ rec: en.source, kind: en.kind, prop: en.prop }))
        .concat(tab.dropped.map(d => ({ rec: d.rec, kind: d.rec.cmd === 'AddShopItem' ? 'fixed' : 'chip', prop: d.prop || null, dropped: d.reason })));
      if (!rows.length) el.appendChild(h('p.muted', 'Empty. Use + in the item list on the right to add an item.'));
      else {
        const tb = h('table.items', h('tr', h('th.num', '#'), h('th', 'Item'), h('th', 'Job'),
          h('th.num', chip ? `Price (${chipName} chips)` : 'Price (Penya)'), h('th', 'Tab'), h('th', ''), h('th', 'From')));
        rows.forEach((row, i) => {
          const info = row.prop ? ws.itemInfo(row.prop.item) : null;
          const r = row.rec;
          const editable = row.kind !== 'generated';
          const def = row.prop ? row.prop.item.define : (r.args.item && (r.args.item.define || f.text.slice(r.args.item.start, r.args.item.end)));
          let price;
          if (chip) {
            price = info ? FRE.ui.chipPrice.input(ctx, info, hereNpc(npc), 'npc|' + npcId(npc)) : '';
          }
          else if (row.kind === 'fixed') {
            price = numInput({ value: r.args.cost ? r.args.cost.value : null, placeholder: info ? fmt(info.cost) + ' (item)' : '', disabled: !canEdit,
              title: 'Empty = the item\'s own price from Spec_Item.txt. A price here changes the item\'s price everywhere (server-wide). Commas are only for display.',
              onCommit: v => edit(ctx, npc, text => FRE.shopOps.setCost(text, r, v), 'price') });
          } else price = info ? fmt(info.cost) : '';
          const tabCell = editable
            ? h('select', { disabled: !canEdit, on: { change: ev => edit(ctx, npc, text => FRE.shopOps.setSlot(text, r, Number(ev.target.value)), 'move tab') } },
              [0, 1, 2, 3].map(t => h('option', { value: t, selected: t === st.tab }, npc.slotTitles[t] || `Tab ${t}`)))
            : '';
          const rm = editable ? h('button.icon.danger', { disabled: !canEdit, title: 'Remove from this shop', on: { click: () => edit(ctx, npc, text => FRE.shopOps.removeStatement(text, r), `remove ${def}`) } }, '✕') : '';
          const from = row.dropped ? h('span.tag.warn', `left out: ${row.dropped}`)
            : h('span.line', { title: f.text.slice(r.start, r.end) }, `${row.kind === 'generated' ? 'rule' : 'fixed'} ${line(r.start)}`);
          tb.appendChild(h('tr' + (editable ? '.fixed' : '') + (row.dropped ? '.dropped' : ''),
            h('td.num.line', row.dropped ? '–' : i + 1), itemCell(info, def), jobCell(info),
            h('td.num', { title: chip || row.kind === 'fixed' ? '' : 'Base price before the server shop-rate multipliers' }, price),
            h('td', tabCell), h('td', rm, ' ', editable ? diagTags(diagsInSpan(ws, npc.file, r.start, r.end)) : null), h('td', from)));
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
      if (!ctx.ws.isEditable(npc.file.toLowerCase())) return { ok: false, title: `${npc.file} is read-only` };
      const tabName = npc.slotTitles[st.tab] || `tab ${st.tab}`;
      return {
        ok: true, title: `Add to ${npc.name || npc.key}, ${tabName}`, usesPrice: !(npc.venderType === 1 || npc.venderType === 2),
        add(info, cost) { edit(ctx, npc, text => FRE.shopOps.addItem(text, npc, st.tab, info.define, cost), `add ${info.define}`); },
      };
    },

    locate(d, ctx) {
      const npc = d.npcKey && ctx.ws.chars.npcs.find(n => n.key === d.npcKey && n.file === d.file);
      if (!npc) return false;
      st.sel = npcId(npc);
      return true;
    },
  };

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
