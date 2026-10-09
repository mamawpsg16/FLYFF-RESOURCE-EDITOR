// Where is this item from? (task H part 1): pick any item, see every way players get it and where it is used, in game
// words, each line with a button that opens it in its own task. Read-only. The numbers: loaders/where.js.
(function (FRE) {
  'use strict';
  const { h, fmt } = FRE.dom;
  const st = { id: null, show: 'all', recent: [] };
  const MAX_ROWS = 25;                  // per section; the rest fold under "▸ n more"

  const W = () => FRE.where;
  const group = n => FRE.num.group(n);
  const pct = x => FRE.drops.pct(x);
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const itemName = (ws, id) => { const it = ws.itemById(id); return it ? (it.name || it.nameKey || it.define) : `item ${id >>> 0}`; };
  const money = (n, currency) => `${group(n)} ${W().CURRENCY[currency] || 'Penya'}`;
  const durText = m => (m ? FRE.dom.durationText(m) : '');
  const model = ctx => ctx.ws.models.where;

  function show(ctx, id) {
    st.id = id >>> 0;
    st.recent = [st.id, ...st.recent.filter(x => x !== st.id)].slice(0, 20);
    ctx.renderAll(false);
  }
  // open another task at one NPC / monster / box (it reloads the folder: a few seconds)
  function openIn(task, label, setup) {
    return h('button.small', { title: `Opens the ${label} task here (the files are read again: a few seconds)`, on: { click: () => {
      FRE.app.ctx.openTask(task, c => { const m = FRE.ui.modules.find(x => x.id === task); if (m) setup(m.st, c); });
    } } }, `Open in ${label}`);
  }
  const openNpc = (npc, tab) => openIn('npc', 'NPC Shops', s => { s.show = 'all'; s.sel = `${npc.file}|${npc.key}`; s.tab = tab; });
  const openMonster = mid => openIn('drops', 'Monster Drops', s => { s.show = 'all'; s.sel = mid; });
  const openBox = (kind, id) => openIn('boxes', 'Boxes', s => { s.show = 'all'; s.sel = { kind, id }; });

  // where an NPC stands, short, or why players can't use it
  function npcWhere(l) {
    if (l.inGame === false) return h('span.tag.warn', { title: l.why || '' }, `not in the game: ${l.why || 'not placed'}`);
    return h('span.muted', FRE.ui.whereText(l.where) || '');
  }
  const exNpcs = l => (l.npcs.length
    ? l.npcs.map(x => h('div', x.name, ' ', x.inGame === false ? h('span.tag.warn', { title: x.why || '' }, 'not in the game') : h('span.muted', FRE.ui.whereText(x.where) || '')))
    : h('span.tag.warn', 'no NPC opens this menu'));
  const costText = (ws, l) => l.cost.length ? l.cost.map(c => c.penya ? `${group(c.num)} Penya` : `${group(c.num)} × ${c.name}`).join(', ') : 'nothing';

  // one section: a title with the count, a table, rows past MAX_ROWS folded
  function section(icon, title, head, rows, note) {
    if (!rows.length) return null;
    const table = (list) => h('table.items.wh-table', h('tr', head.map(x => h('th', x))), list);
    return h('div.wh-sec', h('h3', `${icon} ${title} (${rows.length})`), note ? h('p.muted.small', note) : null,
      table(rows.slice(0, MAX_ROWS)),
      rows.length > MAX_ROWS ? h('details', h('summary', `▸ ${rows.length - MAX_ROWS} more`), table(rows.slice(MAX_ROWS))) : null);
  }

  function itemPage(el, ctx) {
    const ws = ctx.ws, r = W().sources(ws, st.id, model(ctx));
    const it = r.item;
    el.appendChild(h('div.wh-head',
      it ? FRE.dds.picture(ctx, iconOf(it), { scale: 2, cls: '.bx-icon-big' }) : null,
      h('div', h('h2', { 'data-item-id': it ? st.id : null }, it ? (it.name || it.nameKey || it.define) : `Item ${st.id}`),
        h('div.muted.small', `${it ? it.define : 'not in Spec_Item.txt'} · id ${st.id} · GM: /createitem ${st.id} 1`))));
    for (const c of r.checks) el.appendChild(h('div.banner.' + (c.severity === 'BLOCK' ? 'bad' : c.severity === 'WARN' ? 'warn' : 'info'), c.text));
    const of = k => r.lines.filter(l => l.kind === k);
    const put = x => { if (x) el.appendChild(x); };     // an empty section is left out

    // 🛒 shops (sold first, then "listed but not sold")
    const shops = of('shop').sort((a, b) => (a.dropped ? 1 : 0) - (b.dropped ? 1 : 0) || (a.inGame === false) - (b.inGame === false) || a.who.localeCompare(b.who));
    put(section('🛒', 'Bought from an NPC', ['NPC', 'Where', 'Tab', 'Price', ''], shops.map(l => h('tr' + (l.dropped || l.inGame === false ? '.muted' : ''),
      h('td', l.who), h('td', npcWhere(l)), h('td', l.tab || `tab ${l.slot + 1}`),
      h('td', l.dropped ? h('span.tag.warn', `listed but not sold: ${l.dropped}`)
        : [l.currency && l.price < 1 ? h('span.tag.warn', { title: `dwReferValue1 is ${l.price}: an AddShopItem line in a chip shop skips the chip price check (C_FIXED_IN_CHIP)` }, 'no chip price') : money(l.price, l.currency), l.how === 'rule' ? h('span.muted.small', { title: 'Added by an AddVendorItem rule (every item of a kind and rarity)' }, ' · auto') : null]),
      h('td', openNpc(l.npc, l.slot)))),
      'Prices are what players pay at the normal shop rates.'));
    // 💎 Donation Shop
    put(section('💎', 'Donation Shop', ['Category', 'Price', 'Where', ''], of('donation').map(l => h('tr',
      h('td', l.category), h('td', money(l.price, 2), l.crash ? h('span.tag.bad', ' crashes the server') : null),
      h('td.muted', FRE.ui.whereText(l.where) || ''),
      h('td', openIn('donation', 'Donation Shop', (s, c) => { s.cat = l.category; c.setQuery(it ? (it.name || '') : ''); }))))));
    // 🔁 exchange rewards
    put(section('🔁', 'Exchange reward', ['NPC', 'Exchange', 'Costs', 'Gets', 'Chance', ''], of('exchange').map(l => h('tr' + (l.live === false ? '.muted' : ''),
      h('td', exNpcs(l)), h('td', `${l.menu.name}, exchange ${l.si + 1}`), h('td', costText(ws, l)), h('td', `×${group(l.num)}`),
      h('td', l.chance === null ? `one of ${l.payNum} picks` : l.chance >= 0.999999 ? 'always' : `${pct(l.chance)} per exchange`,
        l.payNum > 1 ? h('div.muted.small', `${l.payNum} rewards per exchange`) : null),
      h('td', l.npcs.length ? openNpc(l.npcs[0].npc, 'ex:' + l.menu.name) : null)))));
    // ⚔️ monster drops
    const byChance = (a, b) => b.perKill - a.perKill;
    put(section('⚔️', 'Dropped by', ['Monster', 'Level', 'Chance', ''], of('drop').sort(byChance).map(l => h('tr',
      h('td', l.who), h('td', l.level === null ? '' : String(l.level)),
      h('td', `in ${pct(l.perKill)} of kills`, l.number > 1 ? h('span.muted.small', ` · 1–${group(l.number)} at a time`) : null),
      h('td', openMonster(l.mid)))),
      'For a player at the monster\'s level, with the server rates of Event.lua (as in Monster Drops).'));
    const ev = of('event').sort(byChance);
    if (ev.length) {
      const lv = ev.map(l => l.level), lo = Math.min(...lv), hi = Math.max(...lv);
      put(section('🎉', 'Extra drop from every monster in a level range (propDropEvent.inc)', ['Monster', 'Level', 'Chance', ''], ev.map(l => h('tr',
        h('td', l.who), h('td', String(l.level)), h('td', `in ${pct(l.perKill)} of kills`), h('td', openMonster(l.mid)))),
        `${ev.length} monster${ev.length === 1 ? '' : 's'} of level ${lo}–${hi}: about ${pct(ev[ev.length - 1].perKill)} to ${pct(ev[0].perKill)} per kill.`));
    }
    put(section('🎲', 'Random gear drop (DropKind)', ['Monster', 'Level', 'Chance', ''], of('kind').sort(byChance).map(l => h('tr',
      h('td', l.who), h('td', l.level === null ? '' : String(l.level)),
      h('td', `in ${pct(l.perKill)} of kills`, h('div.muted.small', `one of ${l.among} items of its kind and rarity`)),
      h('td', openMonster(l.mid))))));
    // 🎁 boxes
    put(section('🎁', 'Found in a random box', ['Box', 'Chance', 'Count', '', ''], of('box').sort((a, b) => b.chance - a.chance).map(l => h('tr',
      h('td', { 'data-item-id': l.box.id }, l.who), h('td', pct(l.chance)), h('td', `×${group(l.num)}`),
      h('td.muted.small', [l.bound ? 'bound' : null, l.minutes ? durText(l.minutes) : null, l.upgrade ? `+${l.upgrade}` : null].filter(Boolean).join(' · ')),
      h('td', openBox('random', l.box.id))))));
    put(section('📦', 'In a set (everything inside)', ['Set', 'Count', '', ''], of('set').map(l => h('tr',
      h('td', { 'data-item-id': l.box.id }, l.who), h('td', `×${group(l.num)}`),
      h('td.muted.small', [l.box.span ? durText(l.box.span) : null, l.upgrade ? `+${l.upgrade}` : null].filter(Boolean).join(' · ')),
      h('td', openBox('set', l.box.id))))));
    // 🏆 Battle Pass
    put(section('🏆', 'Battle Pass reward', ['Level', 'Cost', 'Count', ''], of('bp').sort((a, b) => a.level - b.level).map(l => h('tr',
      h('td', `level ${l.level}`), h('td', `${group(l.points)} points`), h('td', `×${group(l.num)}`),
      h('td', openIn('battlepass', 'Battle Pass', s => { s.view = 'ladder'; }))))));
    // 🔧 used in
    put(section('🔧', 'Used in an exchange (players give it)', ['NPC', 'Exchange', 'Takes', 'Gives', ''], of('use').map(l => h('tr' + (l.live === false ? '.muted' : ''),
      h('td', exNpcs(l)), h('td', `${l.menu.name}, exchange ${l.si + 1}`), h('td', `${group(l.num)} ×`),
      h('td', l.set.pay.map(p => itemName(ws, p.id)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join(', ') + (l.set.pay.length > 4 ? ', …' : '')),
      h('td', l.npcs.length ? openNpc(l.npcs[0].npc, 'ex:' + l.menu.name) : null)))));
    // the item is a box
    if (r.contains.length) {
      const set = r.contains[0].kind === 'set';
      put(section('🎁', set ? 'Opening it gives everything in it' : 'Opening it gives one of', ['Item', set ? 'Count' : 'Chance', set ? '' : 'Count', ''],
        r.contains.map(c => h('tr', h('td', { 'data-item-id': c.id }, h('a', { href: '#', on: { click: e => { e.preventDefault(); show(ctx, c.id); } } }, c.name)),
          h('td', set ? `×${group(c.num)}` : pct(c.chance)), h('td', set ? '' : `×${group(c.num)}`),
          h('td.muted.small', [c.bound ? 'bound' : null, c.minutes ? durText(c.minutes) : null, c.upgrade ? `+${c.upgrade}` : null].filter(Boolean).join(' · ')))),
        null));
    }
    if (!r.lines.length && !r.contains.length) el.appendChild(h('p.muted', 'Nothing in the files the editor reads gives or uses this item. Quests, level-up gifts and other rewards come in part 2.'));
    else el.appendChild(h('p.muted.small', 'Not listed yet: quest rewards, level-up gifts, rebirth gifts, collecting, couple gifts, Guild Siege prizes (part 2).'));
  }

  const SHOW = [
    { v: 'all', label: 'Items with a source or a use', test: (ctx, id) => model(ctx).idx.has(id) },
    { v: 'none', label: 'Items nothing gives or uses', test: (ctx, id) => !model(ctx).idx.has(id) },
    { v: 'recent', label: 'Recently viewed', test: (ctx, id) => st.recent.includes(id) },
  ];

  const mod = {
    id: 'where', label: 'Where is this item from?', searchPlaceholder: 'Search items (name or II_ name)',
    help: 'Where is this item from?: every way players get an item (shops, exchanges, monsters, boxes, Battle Pass) and where it is used',
    st,
    onLoad() { st.show = 'all'; },          // the item stays: coming back from another task shows it again

    listExtra(ctx) {
      const ids = [...ctx.ws.items.items.keys()];
      return h('select.npc-filter', { title: 'Which items to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${fmt(ids.filter(id => o.test(ctx, id)).length)})`)));
    },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      const hint = !q && st.show === 'all';          // 4,899 items: search first
      if (hint) {
        el.appendChild(h('div.pad.muted', 'Type an item name to search, or press + next to an item in the list on the right.'));
        if (!st.recent.length) return;
        el.appendChild(h('div.pad.muted.small', 'Recently viewed:'));
      }
      const ids = hint || st.show === 'recent' ? st.recent : [...ctx.ws.items.items.keys()];
      let shown = 0;
      for (const id of ids) {
        const it = ctx.ws.itemById(id);
        if (!it || (!hint && !test(ctx, id))) continue;
        const name = it.name || it.nameKey || it.define;
        if (q && !name.toLowerCase().includes(q) && !it.define.toLowerCase().includes(q)) continue;
        if (++shown > 300) continue;
        const n = (model(ctx).idx.get(id) || []).length;
        el.appendChild(h('div.npc.bx-row' + (id === st.id ? '.sel' : ''), { on: { click: () => show(ctx, id) } },
          FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' }),
          h('div.bx-text', h('div.n', h('span', { 'data-item-id': id }, name)), h('div.k', `${it.define}${n ? ` · ${n} place${n === 1 ? '' : 's'}` : ' · nothing gives it'}`))));
      }
      if (shown > 300) el.appendChild(h('div.pad.muted', `${shown - 300} more: type more to narrow the list.`));
      if (!shown && !hint) el.appendChild(h('div.pad.muted', 'No items match.'));
    },

    renderEditor(el, ctx) {
      if (st.id === null || !ctx.ws.itemById(st.id) && !model(ctx).idx.has(st.id)) {
        st.id = null;
        el.appendChild(h('p.empty-state', 'Pick an item: search on the left, or press + next to an item in the list on the right.'));
        return;
      }
      itemPage(el, ctx);
    },

    addTarget(ctx) {
      return { ok: true, usesPrice: false, title: 'Show where it comes from', add(info) { show(ctx, info.id); } };
    },

    locate() { return false; },
  };

  FRE.ui.where = { show };
  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
