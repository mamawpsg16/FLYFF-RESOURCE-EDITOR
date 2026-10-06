// Donation Shop module (DonationShop.inc, commit 7d7df4f9). Left: the categories
// (in the client's DonationShopTree.inc order when the Client folder is chosen).
// Middle: the items of a category. Prices are each item's chip price in
// Spec_Item.txt (dwReferValue1), paid in Donate Chips (CDPSrvr::OnBuyDonationItem).
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const { diagTags, diagRow, itemCell, jobCell } = FRE.ui;
  const FILE = 'donationshop.inc';
  const ALL = '*';
  const st = { cat: ALL };

  const model = ctx => ctx.ws.models.donation;
  const tree = ctx => ctx.ws.donationTree;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();       // the client compares case-insensitively

  // categories offered for moving / adding: the client's leaves, else the ones in the file
  function categoryChoices(ctx) {
    const t = tree(ctx);
    return t ? t.leaves.slice() : model(ctx).categories.slice();
  }

  function rowDiags(ctx, r) {
    return ctx.ws.diags.filter(d => d.module === 'donation' && d.start !== undefined && d.start >= r.start && d.start < Math.max(r.end, r.start + 1));
  }

  function edit(ctx, make, label) { ctx.edit(FILE, make, label, 'ds|' + st.cat); }

  const mod = {
    id: 'donation', label: 'Donation Shop', searchPlaceholder: 'Search items in the shop',
    help: 'Donation Shop: the catalog of the Donation Shop window (DonationShop.inc), its categories and Donate Chip prices',
    st,

    onLoad() { st.cat = ALL; },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase();
      if (q) {                            // search: matching items, click jumps to their category
        const hits = m.rows.filter(r => {
          const it = ctx.ws.itemById(r.id);
          return (r.define || '').toLowerCase().includes(q) || (it && it.name.toLowerCase().includes(q));
        });
        for (const r of hits.slice(0, 300)) {
          const it = ctx.ws.itemById(r.id);
          el.appendChild(h('div.npc', { 'data-item-id': it ? it.id : null, on: { click: () => { st.cat = r.category; ctx.renderAll(false); } } },
            h('div.n', h('span', it ? it.name : r.define)), h('div.k', `${r.define} · ${r.category}`)));
        }
        if (!hits.length) el.appendChild(h('div.pad.muted', 'No items match.'));
        return;
      }
      const count = new Map(), bad = new Map();
      for (const r of m.rows) count.set(r.category.toLowerCase(), (count.get(r.category.toLowerCase()) || 0) + 1);
      for (const d of ctx.ws.diags) if (d.module === 'donation' && d.severity !== 'INFO') {
        const r = m.rows.find(x => x.start === d.start);
        if (r) { const k = r.category.toLowerCase(); bad.set(k, (bad.get(k) || 0) + 1); }
      }
      const entry = (name, label, depth = 0) => {
        const k = name.toLowerCase(), n = name === ALL ? m.rows.length : count.get(k) || 0, b = name === ALL ? 0 : bad.get(k) || 0;
        el.appendChild(h('div.npc' + (st.cat === name || (name !== ALL && st.cat !== ALL && same(st.cat, name)) ? '.sel' : ''),
          { style: depth ? `padding-left:${12 + depth * 14}px` : '', on: { click: () => { st.cat = name; ctx.renderAll(false); } } },
          h('div.n', h('span', label), h('span', ctx.edited.has('ds|' + name) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.warn', '⚠' + b) : null, h('span.count', String(n))))));
      };
      entry(ALL, 'All items');
      const t = tree(ctx);
      if (t) {
        const walk = (node, depth) => {
          if (node.children.length) {
            if (node.parent) el.appendChild(h('div.group', { style: `padding-left:${12 + depth * 14}px` }, node.name));
            node.children.forEach(c => walk(c, node.parent ? depth + 1 : depth));
          } else entry(node.name, node.name, depth);
        };
        t.roots.forEach(r => walk(r, 0));
        const orphans = m.categories.filter(c => !t.isLeaf(c));
        if (orphans.length) {
          el.appendChild(h('div.group', 'Not in the client\'s category tree'));
          orphans.forEach(c => entry(c, c, 1));
        }
      } else m.categories.forEach(c => entry(c, c));
    },

    renderEditor(el, ctx) {
      const ws = ctx.ws, m = model(ctx), f = ws.files.get(FILE);
      const canEdit = ws.isEditable(FILE);
      const rows = st.cat === ALL ? m.rows : m.rows.filter(r => same(r.category, st.cat));
      const t = tree(ctx);
      el.appendChild(h('div.npc-title', h('h2', 'Donation Shop'),
        h('span.def', st.cat === ALL ? 'All items' : (t && t.isLeaf(st.cat) ? t.pathOf(st.cat).join(' › ') : st.cat)),
        h('span.line', `${f.name}`), canEdit ? null : h('span.tag.bad', 'read-only')));
      // the client opens the shop from its taskbar button (7d7df4f9) or for the NPC with key MaFl_DONATION (WndWorld.cpp:5835)
      if (ws.area) el.appendChild(h('div', h('span.muted.small', 'Players open it from the taskbar, or by talking to MaFl_DONATION. '),
        FRE.ui.whereLine(ws.whereOf('MaFl_DONATION'))));
      el.appendChild(h('p.muted.small', 'Prices are each item\'s chip price (dwReferValue1 in Spec_Item.txt), paid in Donate Chips. ',
        'The same number is the item\'s price in Red Chip and Donate Chip NPC shops. An item listed here but without a price cannot be bought.'));
      if (!t) el.appendChild(h('p.muted.small', 'Choose the Client folder (toolbar) to check the categories against the client\'s DonationShopTree.inc.'));

      el.appendChild(h('h3', `Items (${rows.length})`));
      if (!rows.length) el.appendChild(h('p.muted', st.cat === ALL ? 'The shop is empty.' : 'Empty. Use + in the item list on the right to add an item to this category.'));
      else {
        const choices = categoryChoices(ctx);
        const here = id => u => u.kind === 'donation' && u.row.id === id;
        const tb = h('table.items', h('tr', h('th.num', '#'), h('th', 'Item'), h('th', 'Job'), h('th.num', 'Price (Donate chips)'),
          h('th', 'Category'), h('th', ''), h('th', 'Line')));
        rows.forEach((r, i) => {
          const it = ws.itemById(r.id), info = it ? ws.itemInfo(it) : null;
          const opts = choices.some(c => same(c, r.category)) ? choices : [r.category, ...choices];
          const cat = h('select', { disabled: !canEdit, on: { change: ev => edit(ctx, text => FRE.donationOps.setCategory(text, r, ev.target.value), `move ${r.define}`) } },
            opts.map(c => h('option', { value: c, selected: same(c, r.category) }, c)));
          const rm = h('button.icon.danger', { disabled: !canEdit, title: 'Remove from the Donation Shop',
            on: { click: () => edit(ctx, text => FRE.donationOps.removeItem(text, r), `remove ${r.define}`) } }, '✕');
          tb.appendChild(h('tr.fixed', h('td.num.line', i + 1), itemCell(info, r.define), jobCell(info),
            h('td.num', info ? FRE.ui.chipPrice.input(ctx, info, here(r.id), 'ds|' + r.category) : ''),
            h('td', cat), h('td', rm, ' ', diagTags(rowDiags(ctx, r))),
            h('td', h('span.line', { title: f.text.slice(r.start, r.end) }, 'L' + (f.lineOf(r.start) + 1)))));
        });
        el.appendChild(tb);
      }
      const nd = ws.diags.filter(d => d.module === 'donation' && (st.cat === ALL || rows.some(r => r.start === d.start)));
      if (nd.length) {
        el.appendChild(h('h3', 'Problems'));
        nd.forEach(d => el.appendChild(diagRow(d)));
      }
    },

    addTarget(ctx) {
      if (!ctx.ws.isEditable(FILE)) return { ok: false, title: 'DonationShop.inc is read-only' };
      if (st.cat === ALL) return { ok: false, title: 'Pick a category on the left first' };
      return {
        ok: true, title: `Add to the Donation Shop, "${st.cat}"`, usesPrice: false,
        add(info) { edit(ctx, text => FRE.donationOps.addItem(text, model(ctx), st.cat, info.define), `add ${info.define}`); },
      };
    },

    locate(d, ctx) {
      if (d.module !== 'donation') return false;
      const r = model(ctx).rows.find(x => x.start === d.start);
      st.cat = r ? r.category : ALL;
      return true;
    },
  };

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
