// Exchanges module (Exchange_Script.txt, CExchange::Load_Script). Left: the exchange menus,
// named by the NPCs that open them. Centre: one card per recipe (SET): ingredients ->
// rewards, with the chances the server really uses and the row as the game window draws it.
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const FILE = 'exchange_script.txt';
  const BINDS = 2;                  // CItemElem::binds (Item.h:132): the file header's "2 = bound"
  const st = { menu: null, show: 'game', pick: null };   // pick: { set, kind: 'cond' | 'pay', line: index | null }

  const X = () => FRE.exchange;
  const O = () => FRE.exchangeOps;
  const model = ctx => ctx.ws.models.exchange;
  const canEdit = ctx => ctx.ws.isEditable(FILE);
  // With the map files read, only the menus players can really use (NPC on a map, not hidden, has
  // recipes). Without them (no World folder), every menu an NPC has.
  const menus = ctx => model(ctx).menus.filter(m => !m.isJunk && (ctx.ws.placed ? ctx.ws.isLiveMenu(m) : true));
  const npcs = (ctx, m) => { const by = ctx.ws.npcsByMenu(); return by ? by.get(m.mmi.value) || [] : []; };
  // [{ name, key, inGame, maps, why }] of the NPCs that have this menu (FRE.world.npcStatus)
  const npcInfo = (ctx, m) => { const by = ctx.ws.npcInfoByMenu(); return by ? by.get(m.mmi.value) || [] : []; };
  const mapsKnown = ctx => !!ctx.ws.placed;
  // players can use it: an NPC with the menu stands in the game, and the server loads recipes for it
  const inGame = (ctx, m) => m.sets.length > 0 && npcInfo(ctx, m).some(x => x.inGame);
  const current = ctx => menus(ctx).find(m => m.name === st.menu) || null;
  const exDiags = ctx => ctx.ws.diags.filter(d => d.module === 'exchange');
  const inSpan = (ctx, a, b) => exDiags(ctx).filter(d => d.start !== undefined && d.start >= a && d.start < Math.max(b, a + 1));
  const pct = p => `${(p / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
  // "[Collecting Manager]Collins" -> "Collins"; a name that is only a title, "[Pet Tamer]", keeps the title
  const plainName = s => { const t = String(s || '').trim(), rest = t.replace(/^\[[^\]]*\]\s*/, '').replace(/^[\s,]+/, ''); return rest || t.replace(/^\[|\]$/g, ''); };
  function edit(ctx, make, label) { ctx.edit(FILE, make, label, 'ex|' + st.menu); }

  function itemOf(ctx, l) {
    if (l.item.penya) return { name: 'Penya', define: 'PENYA', rarity: 'normal', id: null };
    const it = l.item.undef ? null : ctx.ws.itemById(l.item.value);
    return it ? ctx.ws.itemInfo(it) : null;
  }
  const itemSpan = (info, define) => info
    ? h('span', { 'data-item-id': info.id === null ? null : info.id }, h('span.r-' + info.rarity, info.name), h('span.def.block', info.define))
    : h('span', h('span.muted', define === 'PENYA' ? 'Penya' : '(not an item)'), h('span.def.block', define));

  // only without the map files: a choice between the menus NPCs have and all menus
  const SHOW = [
    { v: 'npc', label: 'On an NPC', test: (ctx, m) => npcs(ctx, m).length > 0 },
    { v: 'all', label: 'All menus', test: () => true },
  ];
  const shows = ctx => mapsKnown(ctx) ? [] : SHOW;

  const mod = {
    id: 'exchange', label: 'Exchanges', searchPlaceholder: 'Search menus, NPCs or items',
    help: 'Exchanges: NPC recipes that turn items into other items (Exchange_Script.txt)',
    st,

    onLoad(ctx) {
      st.pick = null; st.show = 'npc';
      const first = menus(ctx).find(m => (mapsKnown(ctx) || npcs(ctx, m).length) && m.sets.length);
      st.menu = first ? first.name : (menus(ctx)[0] || {}).name || null;
    },

    listExtra(ctx) {
      if (!ctx.ws || !model(ctx)) return null;
      if (mapsKnown(ctx)) return h('div.muted.small', { style: 'padding:4px 2px' }, `${menus(ctx).length} exchange menus in the game`);
      return h('select.npc-filter', { title: 'Which menus to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        shows(ctx).map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${menus(ctx).filter(m => o.test(ctx, m)).length})`)));
    },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase();
      const test = mapsKnown(ctx) ? () => true : (SHOW.find(o => o.v === st.show) || SHOW[0]).test;
      const hit = m => !q || m.name.toLowerCase().includes(q) || npcs(ctx, m).some(n => n.toLowerCase().includes(q))
        || m.sets.some(s => [...s.condition, ...s.pay].some(l => {
          const info = itemOf(ctx, l);
          return l.item.name.toLowerCase().includes(q) || (info && info.name.toLowerCase().includes(q));
        }));
      const list = menus(ctx).filter(m => test(ctx, m) && hit(m));
      for (const m of list) {
        // in the "In game" list, name only the NPCs players can actually click
        const who = npcInfo(ctx, m).filter(x => !mapsKnown(ctx) || x.inGame).map(x => plainName(x.name)).filter(Boolean);
        const bad = inSpan(ctx, m.start, m.end).filter(d => d.severity !== 'INFO').length;
        el.appendChild(h('div.npc' + (st.menu === m.name ? '.sel' : ''), { on: { click: () => { st.menu = m.name; st.pick = null; ctx.renderAll(false); } } },
          h('div.n', h('span', who.length ? who.join(', ') : h('span.muted', 'no NPC')),
            h('span', ctx.edited.has('ex|' + m.name) ? h('span.tag.edit', 'edited') : null, bad ? h('span.tag.warn', '⚠' + bad) : null,
              h('span.count', String(m.sets.length)))),
          h('div.k', m.name)));
      }
      if (!list.length) el.appendChild(h('p.muted', { style: 'padding:8px 12px' }, 'No menu matches.'));
    },

    renderEditor(el, ctx) {
      const f = ctx.ws.files.get(FILE), m = current(ctx);
      if (!m) { el.appendChild(h('p.empty-state', 'Pick an exchange menu on the left.')); return; }
      const info = npcInfo(ctx, m).filter(x => !mapsKnown(ctx) || x.inGame);     // hidden / unplaced NPCs are not shown
      const shown = info.filter(x => x.inGame !== false), title = (shown.length ? shown : info).map(x => plainName(x.name)).filter(Boolean).join(', ');
      el.appendChild(h('div.npc-title', h('h2', title || m.name), h('span.def', m.name),
        h('span.line', `${f.name} L${f.lineOf(m.start) + 1}`), canEdit(ctx) ? null : h('span.tag.bad', 'read-only'),
        null));
      // who opens it, and whether the WorldServer shows that NPC (map files + SetOutput / SetLang)
      if (info.length) el.appendChild(h('div.ex-npcs', info.map(x => h('span.tag.' + (x.inGame ? 'ok' : x.inGame === false ? 'warn' : 'info'),
        { title: `${x.key}: ${x.why}` }, `${plainName(x.name) || x.key} · ${x.inGame ? x.why : x.inGame === false ? x.why : 'map files not read'}`))));
      el.appendChild(h('p.muted.small', info.length ? '' : 'No NPC has AddMenu with this menu, so players cannot open it. ',
        'This server takes the ingredients (CONDITION) when the exchange succeeds; the REMOVE list is ignored, and edits here keep it equal to CONDITION. ',
        'The client reads its own copy and sends only the recipe\'s position, so save with the Client folder chosen: otherwise players get the recipe that sits at that position in the old copy.'));
      const head = inSpan(ctx, m.start, m.sets.length ? m.sets[0].start : m.end);
      if (head.length) el.appendChild(h('div', head.map(d => diagRow(d))));

      if (m.description.length) {
        el.appendChild(h('details.bp-how', h('summary', `Window text (${m.description.length} page${m.description.length > 1 ? 's' : ''})`),
          m.description.map(d => h('div.ex-desc', h('span.def', d.name), h('div', ctx.ws.texts.get(d.name) || h('span.muted', '(no text)'))))));
      }
      if (!m.sets.length) { el.appendChild(h('p.muted', 'This menu has no recipes the server loads, so its window opens empty and closes.')); return; }
      el.appendChild(h('p.muted.small', 'Chances are out of 1,000,000 (= 100%). "Gives" is how many different rewards one exchange hands out, picked by chance. ',
        'Pick items with "+ Ingredient", "+ Reward" or "Change", then + on an item in the list on the right.'));
      m.sets.forEach((s, i) => el.appendChild(card(ctx, m, s, i)));
      const rest = exDiags(ctx).filter(d => d.start >= m.start && d.start < m.end && d.severity !== 'INFO' && !m.sets.some(s => d.start >= s.start && d.start < s.end) && !head.includes(d));
      if (rest.length) { el.appendChild(h('h3', 'Problems')); rest.forEach(d => el.appendChild(diagRow(d))); }
    },

    addTarget(ctx) {
      if (!canEdit(ctx)) return { ok: false, title: 'Exchange_Script.txt is read-only' };
      const m = current(ctx), p = st.pick;
      const s = m && p ? m.sets[p.set] : null;
      if (!s) return { ok: false, title: 'Click "+ Ingredient", "+ Reward" or "Change" on a recipe first' };
      const n = p.set + 1;
      const done = () => { st.pick = null; };
      if (p.kind === 'cond') {
        if (p.line === null) return { ok: true, usesPrice: false, title: `Add as an ingredient of recipe ${n} (quantity 1)`,
          add(info) { done(); edit(ctx, text => O().addIngredient(text, s, info.define, 1), `recipe ${n} add ${info.define}`); } };
        const l = s.condition[p.line];
        return { ok: true, usesPrice: false, title: `Use as recipe ${n}'s ingredient instead of ${l.item.name}`,
          add(info) { done(); edit(ctx, () => O().setIngredientItem(s, l, info.define), `recipe ${n} ingredient ${info.define}`); } };
      }
      if (p.line === null) {
        const left = Math.max(0, X().PROB_TOTAL - s.pay.reduce((a, l) => a + l.prob.value, 0));
        return { ok: true, usesPrice: false, title: `Add as a reward of recipe ${n} (quantity 1, chance ${pct(left)}: what is left of 100%)`,
          add(info) { done(); edit(ctx, text => O().addReward(text, s, info.define, 1, left), `recipe ${n} add reward ${info.define}`); } };
      }
      const l = s.pay[p.line];
      return { ok: true, usesPrice: false, title: `Give instead of ${l.item.name} in recipe ${n}`,
        add(info) { done(); edit(ctx, () => O().setRewardItem(l, info.define), `recipe ${n} reward ${info.define}`); } };
    },

    locate(d, ctx) {
      if (d.module !== 'exchange') return false;
      const m = menus(ctx).find(x => d.start >= x.start && d.start < Math.max(x.end, x.start + 1));
      if (!m) return false;
      st.menu = m.name; st.pick = null;
      if (st.show === 'npc' && !npcs(ctx, m).length) st.show = 'all';
      return true;
    },
  };

  // ---------------------------------------------------------------- one recipe
  function card(ctx, m, s, i) {
    const edit_ = canEdit(ctx), n = i + 1, f = ctx.ws.files.get(FILE);
    const picking = (kind, line) => st.pick && st.pick.set === i && st.pick.kind === kind && st.pick.line === line;
    const pickBtn = (kind, line, label) => h('button', { disabled: !edit_, title: 'Then press + on an item in the list on the right',
      on: { click: () => { st.pick = picking(kind, line) ? null : { set: i, kind, line }; ctx.renderAll(true); } } }, picking(kind, line) ? 'Pick an item →' : label);
    const lineDiags = l => inSpan(ctx, l.start, l.end);

    // ingredients
    const ing = h('table.items.ex', h('tr', h('th', 'Ingredient'), h('th.num', 'Qty'), h('th', '')));
    s.condition.forEach((l, j) => {
      const info = itemOf(ctx, l);
      ing.appendChild(h('tr' + (picking('cond', j) ? '.changed' : ''), h('td', itemSpan(info, l.item.name)),
        h('td.num', numInput({ value: l.num.value, min: 1, disabled: !edit_, onCommit: v => v && edit(ctx, () => O().setIngredientQty(s, l, v), `recipe ${n} ${l.item.name} qty`) })),
        h('td.nowrap', pickBtn('cond', j, 'Change'), ' ', h('button.icon.danger', { disabled: !edit_ || s.condition.length < 2, title: s.condition.length < 2 ? 'A recipe needs at least one ingredient' : 'Remove this ingredient',
          on: { click: () => edit(ctx, text => O().removeIngredient(text, s, l), `recipe ${n} remove ${l.item.name}`) } }, '✕'), ' ', diagTags(lineDiags(l)))));
    });

    // rewards, with the chance the server really uses
    const paid = new Map((s.paid ? s.paid.lines : []).map(x => [x.line, x.prob]));
    const rew = h('table.items.ex', h('tr', h('th', 'Reward'), h('th.num', 'Qty'), h('th.num', 'Chance (of 1,000,000)'), h('th.num', 'Server uses'), h('th', 'Bound'), h('th', '')));
    s.pay.forEach((l, j) => {
      const info = itemOf(ctx, l), eff = paid.get(l);
      const flag = l.flag ? l.flag.value : 0;
      const bound = flag === 0 || flag === BINDS
        ? h('input', { type: 'checkbox', checked: flag === BINDS, disabled: !edit_, title: 'Bound to the character (flag 2)',
          on: { change: e => edit(ctx, text => O().setRewardFlag(text, l, e.target.checked ? BINDS : 0), `recipe ${n} ${l.item.name} bound`) } })
        : h('span', { title: 'item flag value' }, String(flag));
      rew.appendChild(h('tr' + (picking('pay', j) ? '.changed' : eff === undefined ? '.dropped' : ''), h('td', itemSpan(info, l.item.name)),
        h('td.num', numInput({ value: l.num.value, min: 1, disabled: !edit_, onCommit: v => v && edit(ctx, () => O().setRewardQty(l, v), `recipe ${n} ${l.item.name} qty`) })),
        h('td.num', numInput({ value: l.prob.value, min: 0, max: X().PROB_TOTAL, disabled: !edit_, onCommit: v => v !== null && edit(ctx, () => O().setRewardChance(l, v), `recipe ${n} ${l.item.name} chance`) })),
        h('td.num', eff === undefined ? h('span.tag.bad', { title: 'The chances before this line already reach 100%' }, 'dropped') : h('span' + (eff !== l.prob.value ? '.warn-text' : ''), pct(eff))),
        h('td', bound),
        h('td.nowrap', pickBtn('pay', j, 'Change'), ' ', h('button.icon.danger', { disabled: !edit_ || s.pay.length < 2, title: s.pay.length < 2 ? 'A recipe needs at least one reward' : 'Remove this reward',
          on: { click: () => edit(ctx, text => O().removeReward(text, s, l), `recipe ${n} remove ${l.item.name}`) } }, '✕'), ' ', diagTags(lineDiags(l)))));
    });
    const given = X().rewardsGiven(s);
    const sum = s.pay.reduce((a, l) => a + l.prob.value, 0);
    const payRow = h('div.row.ex-tools',
      pickBtn('pay', null, '+ Reward'),
      s.pay.length > 1 ? h('button', { disabled: !edit_, title: 'Give every reward the same chance, adding up to exactly 1,000,000',
        on: { click: () => edit(ctx, () => O().evenChances(s), `recipe ${n} spread chances`) } }, 'Spread evenly') : null,
      s.pay.length > 1 && s.payNum ? h('label', 'Gives ', numInput({ value: s.payNum.value, min: 1, max: s.pay.length, disabled: !edit_,
        onCommit: v => v && edit(ctx, () => O().setPayNum(s, v), `recipe ${n} gives ${v}`) }), ` of ${s.pay.length}`) : null,
      h('span' + (sum === X().PROB_TOTAL ? '.muted' : '.warn-text'), `sum ${fmt(sum)} = ${pct(sum)}`),
      h('span.muted', `· one exchange gives ${given} reward${given === 1 ? '' : 's'}`));

    // the row as the client draws it (WndControl.cpp:1980): ingredients, arrow, rewards; ~9 icons fit
    const slots = [...s.condition.map(l => ({ l, kind: 'cond' })), { arrow: true }, ...s.pay.map(l => ({ l, kind: 'pay' }))];
    let k = 0;
    const game = h('div.ex-game', h('span.muted', 'In game: '), slots.map(x => {
      if (x.arrow) return h('span.ex-arrow', '→');
      k++;
      const info = itemOf(ctx, x.l);
      return h('span.ex-slot' + (k > X().ROW_SLOTS ? '.over' : ''), { 'data-item-id': info && info.id !== null ? info.id : null,
        title: k > X().ROW_SLOTS ? 'drawn past the window edge' : '' }, `${info ? info.name : x.l.item.name} ×${fmt(x.l.num.value)}`);
    }));

    const tools = h('span.ex-head-tools',
      h('button.icon', { disabled: !edit_ || i === 0, title: 'Move up', on: { click: () => move(ctx, m, s, -1) } }, '↑'),
      h('button.icon', { disabled: !edit_ || i === m.sets.length - 1, title: 'Move down', on: { click: () => move(ctx, m, s, 1) } }, '↓'),
      h('button', { disabled: !edit_ || m.sets.length >= X().MAX_SETS, title: m.sets.length >= X().MAX_SETS ? 'A menu keeps at most 30 recipes' : 'Add a copy right below, then edit it',
        on: { click: () => copy(ctx, m, s) } }, 'Copy'),
      h('button.icon.danger', { disabled: !edit_, title: 'Remove this recipe', on: { click: () => remove(ctx, m, s) } }, '✕'));
    const ownDiags = inSpan(ctx, s.start, s.end).filter(d => !s.condition.concat(s.pay).some(l => d.start >= l.start && d.start < l.end));
    // headline: what the player gets (the chance the server really uses when there is a choice)
    const got = (s.paid ? s.paid.lines : []).filter(x => x.prob > 0);
    const gets = got.map((x, k) => {
      const info = itemOf(ctx, x.line);
      return [k ? h('span.ex-or', given > 1 ? ' + ' : ' or ') : null,
        h('span.ex-get-item', { 'data-item-id': info && info.id !== null ? info.id : null, class: info ? 'r-' + info.rarity : '' },
          `${info ? info.name : x.line.item.name} ×${fmt(x.line.num.value)}`),
        got.length > 1 ? h('span.ex-get-pct', ` ${pct(x.prob)}`) : null];
    });
    return h('div.ex-card' + (s.dropped ? '.dropped' : ''),
      h('div.ex-head', h('span.ex-label', `Recipe ${n}`), s.dropped ? h('span.tag.bad', 'not loaded (over 30)') : null,
        h('span.line', { title: s.text.name }, `L${f.lineOf(s.start) + 1}`), diagTags(ownDiags), tools),
      h('div.ex-get', h('span.ex-get-label', got.length > 1 && given === 1 ? 'You get one of' : 'You get'), gets.length ? gets : h('span.muted', 'nothing')),
      h('div.ex-body',
        h('div.ex-section', h('div.ex-section-title', 'Rewards'), rew, payRow),
        h('div.ex-section', h('div.ex-section-title', 'Costs (taken from the player)'), ing, h('div.row.ex-tools', pickBtn('cond', null, '+ Ingredient')))),
      game);
  }

  // copy / move: plain when the recipe text is ASCII; recipes with EUC-KR comments are
  // rebuilt from their values (the comments go), shown before it happens
  function confirmRebuilt(ctx, title, plan, label) {
    const f = ctx.ws.files.get(FILE);
    if (!plan.rebuilt) { edit(ctx, () => plan.splices, label); return; }
    modal({ title, wide: true, body: h('div',
      h('p', 'This recipe has Korean comments, and only plain ASCII can be written into this file. The recipe is rewritten from its values: the same items, quantities and chances, without the comments.'),
      h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(plan.splices))),
      buttons: [{ label: 'Cancel' }, { label: 'OK', cls: 'primary', onClick: () => edit(ctx, () => plan.splices, label) }] });
  }
  function copy(ctx, m, s) {
    const f = ctx.ws.files.get(FILE);
    try { confirmRebuilt(ctx, `Copy recipe ${s.index + 1}`, O().copySet(f.text, s), `copy recipe ${s.index + 1}`); } catch (e) { FRE.dom.toast(e.message, 'bad'); }
  }
  function move(ctx, m, s, dir) {
    const f = ctx.ws.files.get(FILE);
    try { confirmRebuilt(ctx, `Move recipe ${s.index + 1}`, O().moveSet(f.text, m, s, dir), `move recipe ${s.index + 1}`); } catch (e) { FRE.dom.toast(e.message, 'bad'); }
  }
  function remove(ctx, m, s) {
    const f = ctx.ws.files.get(FILE);
    let splices;
    try { splices = O().removeSet(f.text, s); } catch (e) { FRE.dom.toast(e.message, 'bad'); return; }
    modal({ title: `Remove recipe ${s.index + 1} of ${m.name}`, wide: true, body: h('div',
      h('p', 'The recipes below it move up one place in the window.'),
      h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(splices))),
      buttons: [{ label: 'Cancel' }, { label: 'Remove', cls: 'primary danger', onClick: () => { st.pick = null; edit(ctx, () => splices, `remove recipe ${s.index + 1}`); } }] });
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
