// Donation Shop module (DonationShop.inc, commit 7d7df4f9). Left: the categories
// (in the client's DonationShopTree.inc order when the Client folder is chosen).
// Middle: the items of a category. Prices are each item's chip price in
// Spec_Item.txt (dwReferValue1), paid in Donate Chips (CDPSrvr::OnBuyDonationItem).
// The categories (Client/Client/DonationShopTree.inc) are edited here too (task S part 4): + Category,
// + Group, ✎ Edit (name, inside which group), ↑ ↓, Delete (its items move or leave the shop).
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const { diagTags, diagRow, itemCell, jobCell } = FRE.ui;
  const FILE = 'donationshop.inc';
  const ALL = '*';
  const st = { cat: ALL, folded: new Set() };      // folded: groups whose list is closed (lowercase names)

  const model = ctx => ctx.ws.models.donation;
  const tree = ctx => ctx.ws.donationTree;
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();       // the client compares case-insensitively

  // categories offered for moving / adding: the client's leaves, else the ones in the file
  function categoryChoices(ctx) {
    const t = tree(ctx);
    return t ? t.leaves.slice() : model(ctx).categories.slice();
  }

  function rowDiags(ctx, r) {
    return ctx.ws.diags.filter(d => d.module === 'donation' && d.file === model(ctx).file && d.start !== undefined && d.start >= r.start && d.start < Math.max(r.end, r.start + 1));
  }
  // the selected tree entry (a category or a group), or null
  const nodeOf = ctx => (st.cat !== ALL && tree(ctx) ? tree(ctx).find(st.cat) : null);
  // the rows a click on the entry shows in game: a group = any of its categories (KeywordMatches)
  function rowsOf(ctx) {
    const m = model(ctx), n = nodeOf(ctx);
    if (st.cat === ALL) return m.rows;
    if (n && n.children.length) return FRE.donationOps.rowsOf(m, FRE.donationTree.leavesUnder(n).map(x => x.name));
    return m.rows.filter(r => same(r.category, st.cat));
  }
  const treeEditable = ctx => !!tree(ctx) && ctx.ws.isEditable(FRE.donationTree.KEY);

  function edit(ctx, make, label) { ctx.edit(FILE, make, label, 'ds|' + st.cat); }

  // ---------------------------------------------------------------- Try buying (FRE.donationBuy)
  // The player clicks the item, types a quantity and presses OK: the client's confirm dialog, then the
  // server's OnBuyDonationItem, on the prices and the list as they are in the editor now (saved or not).
  const trial = { n: 1, chips: 1000, free: 10, have: 0 };
  function tryBuy(ctx, r) {
    const B = FRE.donationBuy, fmt = FRE.dom.fmt, out = h('div.ex-try-out');
    const set = (k, v) => { if (v !== null) { trial[k] = v; go(); } };
    const num = (k, min, max) => FRE.dom.numInput({ key: 'dsbuy|' + k, value: trial[k], min, max, onCommit: v => set(k, v) });
    function go() {
      out.textContent = '';
      let env, p, res;
      try {
        env = B.envFromWorkspace(ctx.ws);
        const id = r.id >>> 0, slots = {};
        let at = 0;
        for (let left = trial.chips; left > 0 && at < 168; left -= 9999) slots[at++] = [env.chipId, Math.min(left, 9999), 0];
        const pack = Math.max(1, (env.prop(id) || { packMax: 1 }).packMax);
        for (let left = trial.have; left > 0 && at < 168; left -= pack) slots[at++] = [id, Math.min(left, pack), 0];
        p = B.playerOf({ unlocked: 168, slots, fill: Math.max(0, 168 - at - trial.free) });
        res = B.buy(env, p, id, trial.n);
      } catch (e) { out.appendChild(h('p.warn-text', 'Cannot run: ' + e.message)); return; }
      const pr = env.prop(r.id), name = pr ? pr.name : r.define, c = res.client, s = res.server, said = B.describe(env, res);
      out.appendChild(h('h3', 'Confirm box'));
      out.appendChild(h('p', c.shown === null ? 'It does not open: the item has no chip price.'
        : `Quantity ${fmt(Math.min(Math.max(trial.n, 0), B.MAX_BUY))}, total shown ${fmt(c.shown)} Donate Chips.`));
      out.appendChild(h('h3', 'What the player sees'));
      if (said.kind === 'ok') out.appendChild(h('p', h('span.tag.ok', 'Bought'), ` You pay ${fmt(s.paid)} Donate Chips, you get ${name} ×${fmt(s.num)}.`));
      else if (said.kind === 'crash') out.appendChild(h('p', h('span.tag.bad', 'the server CRASHES'), ' ', said.text));
      else out.appendChild(h('p', h('span.muted', said.kind === 'box' ? '[message box] ' : said.kind === 'chat' ? '[chat] ' : ''), said.text));
      if (s) out.appendChild(h('p.muted.small', `Donate Chips: ${fmt(s.chipsBefore)} → ${fmt(s.chipsAfter)}.`,
        s.outcome === 'BOUGHT' ? ` Bag: ${B.dump(p).filter(x => x[1] === (r.id >>> 0)).map(x => `slot ${x[0] + 1} ×${fmt(x[2])}`).join(', ')}.` : ''));
      const notes = [];
      if (s && s.overflow) notes.push(h('li.warn-text', `${fmt(s.cost)} × ${fmt(s.num)} is over 2,147,483,647: as an int the total is ${fmt(s.total | 0)}, so the chip check passes and the player pays only the chips they have. Keep the price at ${fmt(B.SAFE_PRICE)} or less (DS_OVERFLOW).`));
      if (s && s.outcome === 'LACK_SPACE') notes.push(h('li', 'The bag is checked before the chips are taken, so a chip stack that would run out does not free its slot. The item stacks only onto stacks of the same kind (no flag, not charged).'));
      if (pr && pr.packMax > 1) notes.push(h('li', `One bag slot holds ${fmt(pr.packMax)} of this item.`));
      if (notes.length) out.appendChild(h('ul.small', notes));
    }
    const body = h('div.ex-try',
      h('p.muted.small', 'This buys the item the way the game does it: the confirm box (CWndConfirmBuyDonation), then the server (CDPSrvr::OnBuyDonationItem: listed? price? enough Donate Chips? room in the bag? take the chips, give the item). It uses the prices and the list as they are in the editor now, saved or not.'),
      h('div.row.ex-tools',
        h('label', 'Quantity typed ', num('n', 0, 99999)),
        h('label', 'Donate Chips in the bag ', num('chips', 0, 167 * 9999)),
        h('label', 'Empty bag slots ', num('free', 0, 167)),
        h('label', { title: 'How many of this item the bag already holds (it can stack on them)' }, 'Already in the bag ', num('have', 0, 9999))),
      out);
    FRE.dom.modal({ title: `Try buying: ${(ctx.ws.itemById(r.id) || {}).name || r.define}`, wide: true, body });
    go();
  }

  const mod = {
    id: 'donation', label: 'Donation Shop', searchPlaceholder: 'Search items in the shop',
    help: 'Donation Shop: the catalog of the Donation Shop window (DonationShop.inc), its categories and Donate Chip prices',
    st,

    onLoad() { st.cat = ALL; st.folded = new Set(); },

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
      if (treeEditable(ctx)) el.appendChild(h('div.pad', { style: 'display:flex;gap:6px' },
        h('button', { title: 'A new category (like Consumables) or a group with categories inside (like Weapon Skins) in the Donation Shop window\'s sidebar',
          on: { click: () => FRE.ui.donationTree.add(ctx) } }, '+ Category')));
      const count = new Map(), bad = new Map();
      for (const r of m.rows) count.set(r.category.toLowerCase(), (count.get(r.category.toLowerCase()) || 0) + 1);
      for (const d of ctx.ws.diags) if (d.module === 'donation' && d.severity !== 'INFO') {
        const r = d.file === m.file && m.rows.find(x => x.start === d.start);
        if (r) { const k = r.category.toLowerCase(); bad.set(k, (bad.get(k) || 0) + 1); }
      }
      const entry = (name, label, depth = 0, leaves = null) => {
        const sum = f => (leaves || [name]).reduce((a, x) => a + (f.get(x.toLowerCase()) || 0), 0);
        const n = name === ALL ? m.rows.length : sum(count), b = name === ALL ? 0 : sum(bad);
        el.appendChild(h('div.npc' + (st.cat === name || (name !== ALL && st.cat !== ALL && same(st.cat, name)) ? '.sel' : ''),
          { style: depth ? `padding-left:${12 + depth * 14}px` : '', on: { click: () => { st.cat = name; ctx.renderAll(false); } } },
          h('div.n', h('span', leaves ? h('b', h('span.fold', { title: st.folded.has(name.toLowerCase()) ? 'Open this group' : 'Close this group',
              style: 'cursor:pointer;padding-right:2px', on: { click: e => { e.stopPropagation(); const k = name.toLowerCase();
                if (st.folded.has(k)) st.folded.delete(k); else st.folded.add(k); ctx.renderAll(false); } } }, st.folded.has(name.toLowerCase()) ? '▸' : '▾'), ' ' + label) : label), h('span', ctx.edited.has('ds|' + name) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.warn', '⚠' + b) : null, h('span.count', String(n))))));
      };
      entry(ALL, 'All items');
      const t = tree(ctx);
      if (t) {
        // a group is clickable: in game it shows the items of all its categories
        const walk = (node, depth) => {
          if (node.children.length) {
            if (node.parent) entry(node.name, node.name, depth, FRE.donationTree.leavesUnder(node).map(x => x.name));
            if (node.parent && st.folded.has(node.name.toLowerCase())) return;      // closed with its arrow
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
      const rows = rowsOf(ctx);
      const t = tree(ctx), node = nodeOf(ctx), isGroup = !!(node && node.children.length);
      const path = n => { const p = []; for (let x = n; x; x = x.parent) p.unshift(x.name); return p.join(' › '); };
      el.appendChild(h('div.npc-title', h('h2', 'Donation Shop'),
        h('span.def', st.cat === ALL ? 'All items' : (node ? path(node) : st.cat)),
        h('span.line', `${f.name}`), canEdit ? null : h('span.tag.bad', 'read-only')));
      if (node && node.parent && treeEditable(ctx)) {
        const sib = node.parent.children, i = sib.indexOf(node), what = isGroup ? 'group' : 'category';
        el.appendChild(h('div', { style: 'display:flex;gap:6px;align-items:center;margin:4px 0 8px' },
          h('button', { title: `Edit ${what}: ${node.name} (name, inside which group)`, on: { click: () => FRE.ui.donationTree.edit(ctx, node) } }, FRE.ui.pencil(), ` Edit ${what}`),
          h('button', { disabled: i === 0, title: `Move ${node.name} up in the sidebar`, on: { click: () => FRE.ui.donationTree.move(ctx, node, -1) } }, '↑'),
          h('button', { disabled: i === sib.length - 1, title: `Move ${node.name} down in the sidebar`, on: { click: () => FRE.ui.donationTree.move(ctx, node, 1) } }, '↓'),
          h('button.danger', { title: `Delete ${what} ${node.name}`, on: { click: () => FRE.ui.donationTree.remove(ctx, node) } }, `Delete ${what}…`),
          isGroup ? h('span.muted.small', (k => `In game a group shows the items of its ${k === 1 ? 'category' : `${k} categories`}.`)(FRE.donationTree.leavesUnder(node).length)) : null));
      }
      // the client opens the shop from its taskbar button (7d7df4f9) or for the NPC with key MaFl_DONATION (WndWorld.cpp:5835)
      if (ws.area) el.appendChild(h('div', h('span.muted.small', 'Players open it from the taskbar, or by talking to MaFl_DONATION. '),
        FRE.ui.whereLine(ws.whereOf('MaFl_DONATION'))));
      el.appendChild(h('p.muted.small', 'Prices are each item\'s chip price (dwReferValue1 in Spec_Item.txt), paid in Donate Chips. ',
        'The same number is the item\'s price in Red Chip and Donate Chip NPC shops. An item listed here but without a price cannot be bought.'));
      if (!t) el.appendChild(h('p.muted.small', 'Choose the Client folder (toolbar) to check the categories against the client\'s DonationShopTree.inc.'));

      el.appendChild(h('h3', `Items (${rows.length})`));
      if (!rows.length) el.appendChild(h('p.muted', st.cat === ALL ? 'The shop is empty.' : isGroup ? 'Its categories are empty.' : 'Empty. Use + in the item list on the right to add an item to this category.'));
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
          const buy = h('button.icon', { title: `Try buying ${info ? info.name : r.define}: what the game does with the prices as they are in the editor now`,
            on: { click: () => tryBuy(ctx, r) } }, '🛒');
          const rm = h('button.icon.danger', { disabled: !canEdit, title: 'Remove from the Donation Shop',
            on: { click: () => edit(ctx, text => FRE.donationOps.removeItem(text, r), `remove ${r.define}`) } }, '✕');
          tb.appendChild(h('tr.fixed', h('td.num.line', i + 1), itemCell(info, r.define), jobCell(info),
            h('td.num', info ? FRE.ui.chipPrice.input(ctx, info, here(r.id), 'ds|' + r.category) : ''),
            h('td', cat), h('td', buy, ' ', rm, ' ', diagTags(rowDiags(ctx, r))),
            h('td', h('span.line', { title: f.text.slice(r.start, r.end) }, 'L' + (f.lineOf(r.start) + 1)))));
        });
        el.appendChild(tb);
      }
      const nd = ws.diags.filter(d => d.module === 'donation' && (st.cat === ALL || (d.file === m.file && rows.some(r => r.start === d.start))
        || (node && d.file === FRE.donationTree.DIAG_FILE && d.start >= node.tok.start && d.start < node.tok.end)));
      if (nd.length) {
        el.appendChild(h('h3', 'Problems'));
        nd.forEach(d => el.appendChild(diagRow(d)));
      }
    },

    addTarget(ctx) {
      if (!ctx.ws.isEditable(FILE)) return { ok: false, title: 'DonationShop.inc is read-only' };
      if (st.cat === ALL) return { ok: false, title: 'Pick a category on the left first' };
      if (nodeOf(ctx) && nodeOf(ctx).children.length) return { ok: false, title: `"${st.cat}" is a group: pick one of its categories` };
      return {
        ok: true, title: `Add to the Donation Shop, "${st.cat}"`, usesPrice: false,
        add(info) { edit(ctx, text => FRE.donationOps.addItem(text, model(ctx), st.cat, info.define), `add ${info.define}`); },
      };
    },

    locate(d, ctx) {
      if (d.module !== 'donation') return false;
      if (d.file === FRE.donationTree.DIAG_FILE) {
        const n = tree(ctx) && tree(ctx).nodes.find(x => d.start >= x.tok.start && d.start < x.tok.end);
        st.cat = n && n.parent ? n.name : ALL;
        return true;
      }
      const r = model(ctx).rows.find(x => x.start === d.start);
      st.cat = r ? r.category : ALL;
      return true;
    },
  };

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
