// New exchange menus on an NPC (+ Menu › Exchange) and new exchanges in a menu (the ⇄ tab's "+ New exchange").
// Both use one builder: one card per exchange, each with its own costs and reward(s), like Collins
// (same costs, another reward: Copy on a card). Writes go through edit/menu-ops.js.
(function (FRE) {
  'use strict';
  const { h, modal, toast } = FRE.dom;
  const { diagRow } = FRE.ui;

  function itemOptions(ws) {
    if (!ws._pickItems) ws._pickItems = [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name));
    if (!ws._itemOpts) ws._itemOpts = ws._pickItems.map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define }));
    return ws._itemOpts;
  }
  const itemName = (ws, define) => { const id = ws.defines.defines.get(define); const it = id === undefined ? null : ws.itemById(id); return it ? (it.name || define) : define; };

  const TOTAL = 1000000;                                 // PAY chances are out of 1,000,000 (Exchange.cpp Load_Script)
  const pct = p => `${(p / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;
  // 1,000,000 split evenly, the remainder on the first lines (exchangeOps.evenChances)
  function spread(rewards) {
    const n = rewards.length, base = Math.floor(TOTAL / n), extra = TOTAL - base * n;
    rewards.forEach((r, i) => { r.prob = base + (i < extra ? 1 : 0); });
  }

  // One card per exchange, like Collins's window (the user, 2026-10-07: "different ingredients per reward…
  // a reward can still have multiple ingredients"). A card = its own costs + its reward(s):
  //   1 reward   the player gets it (each card is one row in the window, the player picks the row)
  //   2+ rewards the server rolls payNum of them by their chances (GetPayItemList), shown as "one of"
  // state: { cards: [{ cond: [[define, n]], rewards: [{ define, qty, prob }], payNum }] }
  // -> element; onChange() after every change
  const blankCard = (cond = [['', 1]]) => ({ cond: cond.map(c => [c[0], c[1]]), rewards: [], payNum: 1, uid: ++uid });
  const usedCond = card => card.cond.filter(c => c[0]);
  function recipeBuilder(ws, state, onChange) {
    const { fieldLabel } = FRE.ui;
    const el = h('div.mf-recipe');
    const changed = () => { FRE.dom.keepFocus(el, paint); onChange(); };
    const nm = d => (d === 'PENYA' ? 'Penya' : itemName(ws, d));
    // add rewards to a card: the first gets 100%, each next one an equal share (the others shrink in proportion)
    function addRewards(card, infos) {
      for (const i of infos) {
        if (!card.rewards.length) { card.rewards.push({ define: i.define, qty: 1, prob: TOTAL }); continue; }
        const share = Math.floor(TOTAL / (card.rewards.length + 1));
        card.rewards.push({ define: i.define, qty: 1, prob: share });
        const v = FRE.exchangeOps.rebalance(card.rewards.map(r => r.prob), card.rewards.length - 1, share);
        card.rewards.forEach((r, k) => { r.prob = v[k]; });
      }
    }
    function cardEl(card, ci) {
      const cards = state.cards;
      const probs = () => card.rewards.map(r => r.prob);
      const setProbs = v => card.rewards.forEach((r, i) => { r.prob = v[i]; });
      const random = card.rewards.length > 1;
      const cond = usedCond(card);
      const gets = !card.rewards.length ? 'nothing yet' : random
        ? `${(card.payNum || 1) > 1 ? card.payNum + ' of ' : 'one of '}${card.rewards.map(r => `${nm(r.define)} ×${r.qty} (${pct(r.prob)})`).join(' / ')}`
        : `${nm(card.rewards[0].define)} ×${card.rewards[0].qty}`;
      const missing = [cond.length ? null : 'a cost', card.rewards.length ? null : 'a reward'].filter(Boolean);
      const box = h('div.mf-card' + (missing.length ? '.bad' : ''), { 'data-card': ci });
      box.appendChild(h('div.mf-card-head',
        h('b', `Exchange ${ci + 1}`),
        h('span.mf-card-gets', `You get ${gets}  ←  ${cond.map(c => `${nm(c[0])} ×${c[1]}`).join(' + ') || 'nothing'}`),
        h('span.mf-card-tools',
          h('button.icon', { title: 'Move up (earlier in the window)', disabled: ci === 0, on: { click: () => { cards.splice(ci - 1, 0, cards.splice(ci, 1)[0]); changed(); } } }, '↑'),
          h('button.icon', { title: 'Move down', disabled: ci === cards.length - 1, on: { click: () => { cards.splice(ci + 1, 0, cards.splice(ci, 1)[0]); changed(); } } }, '↓'),
          h('button.small', { title: 'A new exchange with the same costs and rewards', on: { click: () => {
            cards.splice(ci + 1, 0, Object.assign(blankCard(card.cond), { rewards: card.rewards.map(r => Object.assign({}, r)), payNum: card.payNum })); changed(); } } }, 'Copy'),
          // Jeff's case: one boss-piece price, a different weapon per row. Each ticked item = a new card with THESE costs.
          h('button.small', { disabled: !cond.length || cards.length >= 30,
            title: cond.length ? `Tick items: each one becomes its own exchange that costs ${cond.map(c => `${nm(c[0])} ×${c[1]}`).join(' + ')}` : 'Add a cost first',
            on: { click: () => FRE.ui.itemPicker({ ws, title: `Same costs as Exchange ${ci + 1} (${cond.map(c => `${nm(c[0])} ×${c[1]}`).join(' + ')}): pick the rewards, one exchange each`,
              have: new Set(), room: Math.max(0, 30 - cards.length), roomNote: 'in this window (30 max)',
              addLabel: n => `Make ${n} exchange${n === 1 ? '' : 's'}`,
              onAdd: infos => {
                const made = infos.map(i => { const c = blankCard(card.cond); addRewards(c, [i]); return c; });
                cards.splice(ci + 1, 0, ...made);
                changed(); } }) } }, 'Same costs, other rewards…'),
          h('button.icon.danger', { title: 'Remove this exchange', on: { click: () => { cards.splice(ci, 1); changed(); } } }, '✕'))));
      if (missing.length) box.appendChild(h('div.bad.small', `⛔ Still needs ${missing.join(' and ')}.`));
      // --- costs
      box.appendChild(h('div.mf-head', fieldLabel('Costs', true), h('span.muted.small', 'Taken from the player when the exchange succeeds. Add as many as you like.')));
      card.cond.forEach((c, i) => box.appendChild(h('div.nn-row.mf-ing',
        FRE.ui.combo({ options: itemOptions(ws), value: c[0], placeholder: 'Search an item', onPick: v => { c[0] = v; changed(); } }),
        FRE.dom.numInput({ value: c[1], placeholder: 'qty', title: 'How many', key: `mf|${card.uid}|cond|${i}|qty`, onCommit: v => { c[1] = v === null ? 1 : v; changed(); } }),
        h('button.icon.danger', { title: 'Remove', on: { click: () => { card.cond.splice(i, 1); changed(); } } }, '✕'))));
      box.appendChild(h('button.small', { on: { click: () => { card.cond.push(['', 1]); changed(); } } }, '+ Ingredient'));
      // --- reward(s)
      box.appendChild(h('div.mf-head', fieldLabel(random ? 'Rewards (random)' : 'Reward', true),
        h('span.muted.small', random ? 'The server rolls which one the player gets, by the chances.' : 'What the player gets. Add a second one to make it random.')));
      if (card.rewards.length) {
        const tbl = h('table.items.ex.mf-rewards', h('tr', h('th', 'Reward'), h('th.num', 'Qty'), random ? h('th.num', { title: 'Type the percent; the other rewards move so the total stays 100%' }, 'Chance') : null, random ? h('th.num', 'of 1,000,000') : null, h('th', '')));
        card.rewards.forEach((r, i) => {
          const id = ws.defines.defines.get(r.define), it = id === undefined ? null : ws.itemById(id), info = it ? ws.itemInfo(it) : null;
          tbl.appendChild(h('tr',
            h('td', h('span', { 'data-item-id': info ? info.id : null }, h('span.r-' + (info ? info.rarity : 'normal'), info ? info.name : r.define), h('span.def.block', r.define))),
            h('td.num', FRE.dom.numInput({ value: r.qty, min: 1, title: 'How many the player gets', key: `mf|${card.uid}|pay|${i}|qty`, onCommit: v => { r.qty = v === null ? 1 : v; changed(); } })),
            random ? h('td.num', FRE.dom.pctInput({ value: r.prob, key: `mf|${card.uid}|pay|${i}|pct`, title: 'The other rewards move so the total stays 100%',
              onCommit: v => { setProbs(FRE.exchangeOps.rebalance(probs(), i, v)); changed(); } })) : null,
            random ? h('td.num.muted', FRE.dom.fmt(r.prob)) : null,
            h('td', h('button.icon.danger', { title: 'Remove this reward', on: { click: () => {
              card.rewards.splice(i, 1);
              if (card.rewards.length === 1) card.rewards[0].prob = TOTAL;
              else if (card.rewards.length) setProbs(FRE.exchangeOps.rebalance(probs(), null, 0));     // the others grow back to 100%
              card.payNum = Math.min(card.payNum || 1, Math.max(1, card.rewards.length));
              changed(); } } }, '✕'))));
        });
        box.appendChild(tbl);
      }
      const tools = h('div.nn-row');
      tools.appendChild(h('button.small', { on: { click: () => FRE.ui.itemPicker({ ws, title: card.rewards.length ? `Exchange ${ci + 1}: more rewards (random)` : `Exchange ${ci + 1}: reward`,
        have: new Set(card.rewards.map(r => ws.defines.defines.get(r.define) >>> 0)), room: Math.max(0, 30 - card.rewards.length), roomNote: 'on this card',
        onAdd: infos => { addRewards(card, infos); changed(); } }) } }, card.rewards.length ? '+ Reward (random)' : '+ Reward'));
      if (random) {
        tools.appendChild(h('button.small', { title: 'Give every reward the same chance', on: { click: () => { spread(card.rewards); changed(); } } }, 'Spread evenly'));
        tools.appendChild(h('label', { title: 'How many different rewards one exchange hands out (PAY n)' }, 'Gives ',
          FRE.dom.numInput({ value: card.payNum || 1, min: 1, max: card.rewards.length, key: `mf|${card.uid}|gives`, onCommit: v => { card.payNum = v || 1; changed(); } }), ` of ${card.rewards.length}`));
        const sum = card.rewards.reduce((a, r) => a + r.prob, 0);
        if (sum !== TOTAL) tools.appendChild(h('span.small.warn', `Chances add up to ${pct(sum)} (should be 100%).`));
      }
      box.appendChild(tools);
      return box;
    }
    const paint = () => {
      el.textContent = '';
      el.appendChild(h('div.mf-head', fieldLabel('Exchanges', true), h('span.muted.small', 'One card per row of the exchange window: its own costs and its reward. The player picks a row.')));
      state.cards.forEach((c, i) => el.appendChild(cardEl(c, i)));
      if (!state.cards.length) el.appendChild(h('div.bad.small', '⛔ No exchange yet: press + Exchange.'));
      // + Exchange = an empty card (the user, 2026-10-08: copying the costs above was confusing); Copy on a card repeats it
      el.appendChild(h('div.nn-row',
        h('button.small', { title: 'A new, empty exchange card', disabled: state.cards.length >= 30,
          on: { click: () => { state.cards.push(blankCard()); changed(); } } }, '+ Exchange'),
        h('span.muted.small', `${state.cards.length} exchange${state.cards.length === 1 ? '' : 's'} (30 at most per window). Same costs for other rewards: "Same costs, other rewards…" on a card.`)));
    };
    paint();
    return el;
  }
  const setsOf = st => st.cards.map(c => ({
    cond: usedCond(c).map(x => [x[0], x[1]]),
    pay: c.rewards.map(r => [r.define, r.qty, c.rewards.length === 1 ? TOTAL : r.prob]),
    payNum: c.rewards.length > 1 ? (c.payNum || 1) : 1,
  }));
  let uid = 0;
  const blankRecipe = () => ({ cards: [blankCard()] });
  // "Exchange 1: Wand ×1 ← Emerald Piece ×460 + Flyff Piece ×45" lines: what the window will list
  function setLines(ws, sets) {
    const nm = d => (d === 'PENYA' ? 'Penya' : itemName(ws, d));
    return sets.map((s, i) => {
      const gets = s.pay.length > 1
        ? `${s.payNum > 1 ? s.payNum + ' of ' : 'one of '}` + s.pay.map(p => `${nm(p[0])} ×${p[1]} (${pct(p[2])})`).join(' / ')
        : s.pay.map(p => `${nm(p[0])} ×${p[1]}`).join('');
      return `Exchange ${i + 1}: ${gets}  ←  ${s.cond.map(c => `${nm(c[0])} ×${c[1]}`).join(' + ') || '(nothing)'}`;
    });
  }

  // ---------------------------------------------------------------- NPC Shops: + Exchange menu
  const blankMenu = () => Object.assign({ name: '', label: '', nameTouched: false }, blankRecipe());
  const blankMenus = () => ({ menus: [blankMenu()], resMode: 'add', resNames: ['', ''],
    resTexts: ['You received your item.', 'You do not have the ingredients, or your inventory is full.'], resTids: ['', ''] });
  // st -> the spec of menuOps.newMenusPlan. who: { key, newNpc } (newNpc: the NPC is created in the same step)
  function menusSpec(st, who) {
    const base = (st.menus[0] ? st.menus[0].name : '').replace(/^MMI_/, '');
    const names = st.resNames.map((n, i) => n || `TID_GAME_${base}_${i ? 'FAIL' : 'SUCCESS'}`);
    return { npcKey: who.key, newNpc: !!who.newNpc, menus: st.menus.map(m => ({ name: m.name, label: m.label, sets: setsOf(m) })),
      results: st.resMode === 'add' ? { add: names.map((n, i) => ({ name: n, text: st.resTexts[i] })) } : { tids: st.resTids } };
  }
  // The fields of new exchange menus (label, name, exchange cards, messages): used by the + Menu › Exchange window
  // and inline in + NPC. onChange() after every change; the host draws the checks and the preview.
  // -> { el, refreshNames() }
  function menusSection(ctx, st, onChange) {
    const ws = ctx.ws;
    const { fieldLabel } = FRE.ui;
    const others = m => st.menus.filter(x => x !== m).map(x => x.name);
    // the name follows the label until it is typed in by hand
    const autoName = m => { if (!m.nameTouched) m.name = FRE.menuNameFromLabel(ws, m.label, others(m)); };
    // result text pairs already used by exchanges: RESULTMSG of every loaded recipe
    const pairs = [];
    for (const m of (ws.models.exchange || { menus: [] }).menus) for (const s of m.sets) if (s.resultMsg.length >= 2) {
      const k = s.resultMsg.slice(0, 2).map(r => r.name).join('|');
      if (!pairs.some(p => p.k === k)) pairs.push({ k, tids: s.resultMsg.slice(0, 2).map(r => r.name), text: s.resultMsg.slice(0, 2).map(r => ws.texts.get(r.name) || r.name).join(' / ') });
    }
    const el = h('div.mf-section');
    const nameViews = [];             // per menu: { input, status } updated without a re-render (keeps the focus)
    function refreshNames() {
      const free = FRE.menuOps.freeMenuIds(ws);
      st.menus.forEach((m, i) => {
        const v = nameViews[i]; if (!v) return;
        if (v.input !== document.activeElement) v.input.value = m.name;
        const p = m.name ? FRE.menuNameProblem(ws, m.name, st.menus.slice(0, i).map(x => x.name)) : 'Type a label, or a name.';
        v.status.textContent = p ? '✗ ' + p : `✓ free · menu id ${free[i] !== undefined ? free[i] : '?'}`;
        v.status.className = 'small ' + (p ? 'bad' : 'ok');
      });
    }
    const changed = () => { refreshNames(); onChange(); };
    function render() {
      el.textContent = '';
      nameViews.length = 0;
      st.menus.forEach((m, i) => {
        el.appendChild(h('h4', `Exchange menu ${i + 1}`, st.menus.length > 1 ? h('button.icon.danger', { style: 'margin-left:8px', title: 'Remove this menu', on: { click: () => { st.menus.splice(i, 1); render(); changed(); } } }, '✕') : null));
        el.appendChild(h('div.nn-row', fieldLabel('Label', true), h('input.mf-label', { value: m.label, placeholder: 'Entaness Weapons', on: { input: e => { m.label = e.target.value; autoName(m); changed(); } } }),
          h('span.muted.small', 'What players read when they right-click the NPC.')));
        const input = h('input.mf-name', { value: m.name, placeholder: 'MMI_ENTANESS_WEAPONS', on: { input: e => {
          m.name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); e.target.value = m.name;
          m.nameTouched = m.name !== '';          // emptied: follows the label again
          if (!m.nameTouched) autoName(m);
          changed(); } } });
        const status = h('span.small');
        nameViews[i] = { input, status };
        el.appendChild(h('div.nn-row', fieldLabel('Name', true), input, status));
        el.appendChild(h('div.muted.small.mf-hint', 'Internal name the server needs (an MMI_ #define); players never see it. It is filled from the label and must be new; change it only if you want another.'));
        el.appendChild(recipeBuilder(ws, m, changed));
      });
      el.appendChild(h('button.small', { on: { click: () => { st.menus.push(blankMenu()); render(); changed(); } } }, '+ Another exchange menu'));
      el.appendChild(h('h4', 'Messages after an exchange'));
      el.appendChild(h('div.nn-row', ['add', 'tids'].map(v => h('label.nn-radio', h('input', { type: 'radio', name: 'mf-res', checked: st.resMode === v, on: { change: () => { st.resMode = v; render(); changed(); } } }),
        v === 'add' ? 'two new texts (shared by these menus)' : 'texts an exchange already uses'))));
      if (st.resMode === 'add') ['Success', 'Failure'].forEach((t, i) => el.appendChild(h('div.nn-row', fieldLabel(t, true),
        h('input', { value: st.resTexts[i], style: 'flex:1', on: { input: e => { st.resTexts[i] = e.target.value; changed(); } } }))));
      else el.appendChild(h('div.nn-row', fieldLabel('Messages', true), FRE.ui.combo({ options: pairs.map(p => ({ v: p.k, label: p.text, find: p.k })), value: st.resTids.join('|'), placeholder: 'Search a message pair',
        onPick: v => { st.resTids = v.split('|'); changed(); } })));
      refreshNames();
    }
    render();
    return { el, refreshNames };
  }
  // What players see and the lines written, for a spec (menuOps.newMenusPlan) -> elements appended to `into`
  function menusPreview(ws, s, p, npcName, into) {
    into.appendChild(h('div.mf-players', s.menus.map(m => [h('div', h('b', `${m.label}`), h('span.muted', ` — right-click ${npcName} → ${m.label} → exchange window:`)),
      setLines(ws, m.sets).map(l => h('div.mf-line', l))])));
    const show = (t, x) => { into.appendChild(h('div.muted.small', t)); into.appendChild(h('pre.nn-pre', x.replace(/\r/g, '').replace(/\n$/, ''))); };
    show(`defineNeuz.h (menu id${p.ids.length > 1 ? 's' : ''} ${p.ids.join(', ')}):`, p.lines.defineNeuz);
    show('defineText.h (label = TID 7000 + id):', p.lines.defineText);
    show('textClient.txt.txt (+ one textClient.inc block each):', p.lines.textTxt);
    if (!s.newNpc) show(`character.inc (${s.npcKey}):`, p.lines.character);
    show(`Exchange_Script.txt (${p.lines.exchange.split(/\r?\n/).length} lines; the start):`, p.lines.exchange.split(/\r?\n/).slice(0, 40).join('\n'));
  }

  // opts: { title, back } from + Menu (ui/menu-chooser.js): its title, and a ← Back to the choices
  function openNewMenus(ctx, npc, opts = {}) {
    const ws = ctx.ws;
    const st = blankMenus();
    const checks = h('div.nn-problems'), preview = h('div.nn-preview');
    let btn = null;
    const spec = () => menusSpec(st, { key: npc.key });
    const refresh = () => {
      const s = spec();
      const diags = FRE.validateNewMenus(ws, s);
      checks.textContent = '';
      if (!diags.length) checks.appendChild(h('p.ok', '✓ No problem found.'));
      diags.forEach(d => checks.appendChild(diagRow(d)));
      const blocked = diags.some(d => d.severity === 'BLOCK');
      if (btn) btn.disabled = blocked;
      preview.textContent = '';
      if (blocked) { preview.appendChild(h('p.muted', 'Fix the ⛔ problems to see the exact lines.')); return; }
      try { menusPreview(ws, s, FRE.menuOps.newMenusPlan(ws, s), npc.name || npc.key, preview); }
      catch (e) { preview.appendChild(h('p.bad', e.message)); }
    };
    const sec = menusSection(ctx, st, refresh);
    const body = h('div.newnpc',
      h('p.muted.small', `Adds right-click menus to ${npc.name || npc.key} that open the exchange window. No C++ change: a menu id without its own case opens the exchange window (WndWorld.cpp:6470), and its label is text 7000 + id. Server + Client copies, one undo step.`),
      sec.el,
      ...FRE.ui.formFooter({ checks, action: 'Create', previewTitle: 'What players will see, and what will be written', preview }));
    const m = modal({ title: opts.title || `New exchange menu — ${npc.name || npc.key}`, body, wide: true, onClose: opts.onClose, buttons: [
      ...(opts.back ? [{ label: '← Back', onClick: opts.back }] : []), { label: 'Close' },
      { label: 'Create', cls: 'primary', id: 'mf-create', onClick: () => {
        const s = spec();
        if (FRE.validateNewMenus(ws, s).some(d => d.severity === 'BLOCK')) return false;
        if (FRE.ui.newNpc) FRE.ui.newNpc.created.add(npc.key.toLowerCase());     // shows the "In game after Save" box (drawn by editGroup)
        ctx.editGroup(() => FRE.menuOps.newMenusPlan(ws, s).parts, `new menu${s.menus.length > 1 ? 's' : ''} on ${npc.key}`, [`npc|character.inc|${npc.key}`]);
        toast(`${s.menus.map(x => x.label).join(', ')} added to ${npc.name || npc.key} (not saved yet). Save writes the 6 files, Server and Client.`, 'ok');
        return true;
      } },
    ] });
    btn = m.el.querySelector('#mf-create');
    refresh();
  }

  // ---------------------------------------------------------------- Exchanges: + New exchange
  function openNewExchanges(ctx, menu) {
    const ws = ctx.ws;
    const st = blankRecipe();
    const body = h('div.newnpc'), checks = h('div.nn-problems'), players = h('div.mf-players');
    let btn = null;
    const refresh = () => {
      const sets = setsOf(st);
      const fake = { npcKey: '-', menus: [{ name: menu.name, label: (ws.texts.get('TID_' + menu.name) || menu.name), sets }], results: { tids: ['x', 'y'] } };
      const diags = FRE.validateNewMenus(ws, fake).filter(d => /^NM_(RECIPE|ITEM|QTY|CHANCE|PAYNUM)$/.test(d.code));
      if (menu.sets.length + sets.length > 30) diags.push({ code: 'NM_SET_CAP', severity: 'BLOCK', field: 'menu', message: `${menu.name} would have ${menu.sets.length + sets.length} exchanges; the server keeps only the first 30.` });
      if (!sets.length) diags.push({ code: 'NM_RECIPE', severity: 'BLOCK', field: 'menu', message: 'No exchange yet: press + Exchange.' });
      checks.textContent = '';
      diags.forEach(d => checks.appendChild(diagRow(d)));
      if (!diags.length) checks.appendChild(h('p.ok', `✓ ${sets.length} exchange${sets.length === 1 ? '' : 's'} will be added.`));
      if (btn) btn.disabled = diags.some(d => d.severity === 'BLOCK');
      players.textContent = '';
      setLines(ws, sets).forEach((l, i) => players.appendChild(h('div.mf-line', l.replace(/^Exchange \d+/, `Exchange ${menu.sets.length + i + 1}`))));
    };
    body.appendChild(h('p.muted.small', menu.sets.length ? `New exchanges reuse the text and the messages of ${menu.name}'s first exchange.` : `${menu.name} has no exchange yet: its text and messages come from its description.`));
    body.appendChild(recipeBuilder(ws, st, refresh));
    body.append(...FRE.ui.formFooter({ checks, action: 'Add', previewTitle: 'What players will see (added at the end of the window)', preview: players }));
    const m = modal({ title: `New exchange — ${menu.name}`, body, wide: true, buttons: [
      { label: 'Close' },
      { label: 'Add', cls: 'primary', id: 'mf-add', onClick: () => {
        const sets = setsOf(st);
        ctx.editGroup(() => FRE.menuOps.addSetsPlan(ws, menu, sets), `${sets.length} new exchange(s) in ${menu.name}`, [`exchange|${menu.name}`]);
        return true;
      } },
    ] });
    btn = m.el.querySelector('#mf-add');
    refresh();
  }

  FRE.ui.menuForm = { openNewMenus, openNewExchanges, recipeBuilder, setsOf, setLines, blankRecipe, blankMenus, menusSpec, menusSection, menusPreview };
})(globalThis.FRE = globalThis.FRE || {});
