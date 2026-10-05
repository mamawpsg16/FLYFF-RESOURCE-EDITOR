// NPC Shops module (character*.inc). One table per tab: exactly what players
// see, in server order. Fixed items (AddShopItem / AddVenderItem2) are edited
// in place; generated items come from AddVendorItem rules (read-only).
(function (FRE) {
  'use strict';
  const { h, fmt, numInput } = FRE.dom;
  const { pretty, diagRow, diagTags, diagsInSpan, itemCell, jobCell } = FRE.ui;

  const st = { sel: null, tab: 0, shopsOnly: true };
  const npcId = npc => `${npc.file}|${npc.key}`;
  const isShopNpc = npc => npc.statements.some(r => FRE.character.shopEntry(r)) || npc.venderType > 0;
  const selNpc = ctx => (ctx.ws && st.sel ? ctx.ws.chars.npcs.find(n => npcId(n) === st.sel) : null) || null;
  const TYPES = [{ v: 0, label: 'Penya shop' }, { v: 1, label: 'Red Chip shop' }, { v: 2, label: 'Donate Chip shop' }];

  function edit(ctx, npc, make, label) {
    ctx.edit(npc.file.toLowerCase(), make, label, 'npc|' + npcId(npc));
  }

  function shopTypeSelect(ctx, npc, canEdit) {
    const ready = !!FRE.ui.previewShopType;      // the conversion (plan Step B) is not built yet
    const sel = h('select.shop-type', { disabled: !canEdit || !ready, title: ready ? 'Which currency this NPC sells for. Changing it converts the item lines (preview first).' : 'Shows this NPC\'s currency. Changing it is coming next (plan Step B).' },
      TYPES.map(t => h('option', { value: t.v, selected: t.v === (npc.venderType === 1 || npc.venderType === 2 ? npc.venderType : 0) }, t.label)));
    sel.addEventListener('change', () => {
      const to = Number(sel.value);
      sel.value = String(npc.venderType === 1 || npc.venderType === 2 ? npc.venderType : 0);   // only changes after confirming
      if (FRE.ui.previewShopType) FRE.ui.previewShopType(ctx, npc, to);
    });
    return sel;
  }

  const mod = {
    id: 'npc', label: 'NPC Shops', searchPlaceholder: 'Search NPCs',
    st, npcId,

    onLoad(ctx) {
      const first = ctx.ws.chars.npcs.find(isShopNpc);
      st.sel = first ? npcId(first) : null; st.tab = 0;
    },

    listExtra(ctx) {
      return h('label.check', h('input', { type: 'checkbox', checked: st.shopsOnly, on: { change: e => { st.shopsOnly = e.target.checked; ctx.renderList(); } } }), ' shops only');
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
      for (const npc of ctx.ws.chars.npcs) {
        if (st.shopsOnly && !isShopNpc(npc)) continue;
        const label = npc.name || npc.key;
        if (q && !label.toLowerCase().includes(q) && !npc.key.toLowerCase().includes(q)) continue;
        const id = npcId(npc), dg = diagBy.get(id);
        shown++;
        el.appendChild(h('div.npc' + (id === st.sel ? '.sel' : ''), { on: { click: () => { st.sel = id; st.tab = 0; ctx.renderAll(false); } } },
          h('div.n', h('span', label),
            h('span', npc.venderType === 1 ? h('span.tag.chip', 'Red Chip') : npc.venderType === 2 ? h('span.tag.chip', 'Donate') : null,
              ctx.edited.has('npc|' + id) ? h('span.tag.edit', 'edited') : null,
              dg && dg.b ? h('span.tag.bad', '⛔' + dg.b) : dg && dg.w ? h('span.tag.warn', '⚠' + dg.w) : null)),
          h('div.k', `${npc.key} · ${npc.file}`)));
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
          if (chip) price = info ? fmt(info.chipCost) : '';
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
