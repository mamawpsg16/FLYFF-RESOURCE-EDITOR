// New exchange menus on an NPC (NPC Shops: "+ Exchange menu") and new exchanges in a menu
// (Exchanges: "+ New exchange"). Both use one builder: an ingredient list + rewards; every reward
// becomes its own exchange with the same ingredients (the player picks the reward in the window),
// e.g. Jeff: 200 pieces + 1 core -> one of 10 weapons. Writes go through edit/menu-ops.js.
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

  // state: { cond: [[define, n]], rewards: [{ define, qty, prob }], mode: 'pick' | 'random', payNum }
  //   pick:   one exchange per reward (the player picks the reward in the window), e.g. Jeff
  //   random: one exchange; the server rolls payNum of the rewards by their chances (GetPayItemList)
  // -> element; onChange() after every change
  function recipeBuilder(ws, state, onChange) {
    const { fieldLabel } = FRE.ui;
    const el = h('div.mf-recipe');
    const changed = () => { FRE.dom.keepFocus(el, paint); onChange(); };
    const probs = () => state.rewards.map(r => r.prob);
    const setProbs = v => state.rewards.forEach((r, i) => { r.prob = v[i]; });
    const paint = () => {
      el.textContent = '';
      // --- ingredients
      el.appendChild(h('div.mf-head', fieldLabel('Costs', true), h('span.muted.small', 'Ingredients, taken from the player when the exchange succeeds.')));
      state.cond.forEach((c, i) => el.appendChild(h('div.nn-row.mf-ing',
        FRE.ui.combo({ options: itemOptions(ws), value: c[0], placeholder: 'Search an item', onPick: v => { c[0] = v; onChange(); } }),
        FRE.dom.numInput({ value: c[1], placeholder: 'qty', title: 'How many', key: `mf|cond|${i}|qty`, onCommit: v => { c[1] = v === null ? 1 : v; onChange(); } }),
        h('button.icon.danger', { title: 'Remove', on: { click: () => { state.cond.splice(i, 1); changed(); } } }, '✕'))));
      el.appendChild(h('button.small', { on: { click: () => { state.cond.push(['', 1]); changed(); } } }, '+ Ingredient'));

      // --- rewards
      const random = state.mode === 'random';
      el.appendChild(h('div.mf-head', fieldLabel('Rewards', true), h('span.muted.small', 'What the player gets.')));
      el.appendChild(h('div.nn-row.mf-mode', [['pick', 'Player picks', 'one exchange per reward: the window lists every reward and the player picks one'],
        ['random', 'Random', 'one exchange: the server rolls which reward the player gets, by the chances below']].map(([v, t, d]) =>
        h('label.nn-radio', { title: d }, h('input', { type: 'radio', name: 'mf-mode-' + (state.uid || 0), checked: state.mode === v,
          on: { change: () => { state.mode = v; if (v === 'random' && state.rewards.reduce((a, r) => a + r.prob, 0) !== TOTAL) spread(state.rewards); changed(); } } }), h('b', t), ' — ', h('span.muted', d)))));
      if (state.rewards.length) {
        const tbl = h('table.items.ex.mf-rewards', h('tr', h('th', 'Reward'), h('th.num', 'Qty'), random ? h('th.num', { title: 'Type the percent; the other rewards move so the total stays 100%' }, 'Chance') : null, random ? h('th.num', 'of 1,000,000') : null, h('th', '')));
        state.rewards.forEach((r, i) => {
          const id = ws.defines.defines.get(r.define), it = id === undefined ? null : ws.itemById(id), info = it ? ws.itemInfo(it) : null;
          tbl.appendChild(h('tr',
            h('td', h('span', { 'data-item-id': info ? info.id : null }, h('span.r-' + (info ? info.rarity : 'normal'), info ? info.name : r.define), h('span.def.block', r.define))),
            h('td.num', FRE.dom.numInput({ value: r.qty, min: 1, title: 'How many the player gets', key: `mf|pay|${i}|qty`, onCommit: v => { r.qty = v === null ? 1 : v; changed(); } })),
            random ? h('td.num', FRE.dom.pctInput({ value: r.prob, key: `mf|pay|${i}|pct`, disabled: state.rewards.length < 2, title: state.rewards.length < 2 ? 'The only reward: always 100%' : 'The other rewards move so the total stays 100%',
              onCommit: v => { setProbs(FRE.exchangeOps.rebalance(probs(), i, v)); changed(); } })) : null,
            random ? h('td.num.muted', FRE.dom.fmt(r.prob)) : null,
            h('td', h('button.icon.danger', { title: 'Remove this reward', on: { click: () => {
              state.rewards.splice(i, 1);
              if (state.rewards.length) setProbs(FRE.exchangeOps.rebalance(probs(), null, 0));     // the others grow back to 100%
              state.payNum = Math.min(state.payNum || 1, Math.max(1, state.rewards.length));
              changed(); } } }, '✕'))));
        });
        el.appendChild(tbl);
      }
      const tools = h('div.nn-row');
      tools.appendChild(h('button.small', { on: { click: () => FRE.ui.itemPicker({ ws, title: random ? 'Rewards (rolled by chance)' : 'Rewards (one exchange each)',
        have: new Set(state.rewards.map(r => ws.defines.defines.get(r.define) >>> 0)), room: Math.max(0, 30 - state.rewards.length),
        onAdd: infos => {
          // each new reward gets an equal share (100% / n) and the others shrink in proportion
          for (const i of infos) {
            const share = Math.floor(TOTAL / (state.rewards.length + 1));
            state.rewards.push({ define: i.define, qty: 1, prob: share });
            setProbs(FRE.exchangeOps.rebalance(probs(), state.rewards.length - 1, share));
          }
          changed(); } }) } }, '+ Rewards…'));
      if (random && state.rewards.length > 1) {
        tools.appendChild(h('button.small', { title: 'Give every reward the same chance', on: { click: () => { spread(state.rewards); changed(); } } }, 'Spread evenly'));
        tools.appendChild(h('label', { title: 'How many different rewards one exchange hands out (PAY n)' }, 'Gives ',
          FRE.dom.numInput({ value: state.payNum || 1, min: 1, max: state.rewards.length, key: 'mf|gives', onCommit: v => { state.payNum = v || 1; changed(); } }), ` of ${state.rewards.length}`));
      }
      el.appendChild(tools);
      const n = state.rewards.length;
      if (!n) el.appendChild(h('div.muted.small', 'No reward yet: press + Rewards… and tick one or more items.'));
      else if (!random) el.appendChild(h('div.muted.small', `${n} exchange${n === 1 ? '' : 's'} in the window, one per reward, each with the costs above.`));
      else {
        const sum = state.rewards.reduce((a, r) => a + r.prob, 0);
        el.appendChild(h('div.small' + (sum === TOTAL ? '.muted' : '.warn'), `1 exchange in the window. Chances add up to ${pct(sum)}` +
          (sum === TOTAL ? '' : ' (should be 100%; the server cuts or tops up the last reward)') + `; it gives ${state.payNum || 1} reward${(state.payNum || 1) === 1 ? '' : 's'}.` +
          (n === 1 ? ' With one reward, Random is the same as Player picks.' : '')));
      }
    };
    paint();
    return el;
  }
  const setsOf = st => {
    const cond = st.cond.filter(c => c[0]).map(c => [c[0], c[1]]);
    if (st.mode === 'random') return st.rewards.length ? [{ cond, pay: st.rewards.map(r => [r.define, r.qty, r.prob]), payNum: st.payNum || 1 }] : [];
    return st.rewards.map(r => ({ cond, pay: [[r.define, r.qty, TOTAL]], payNum: 1 }));
  };
  let uid = 0;
  const blankRecipe = () => ({ cond: [['', 1]], rewards: [], mode: 'pick', payNum: 1, uid: ++uid });
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
  function openNewMenus(ctx, npc) {
    const ws = ctx.ws;
    const blank = () => Object.assign({ name: '', label: '', nameTouched: false }, blankRecipe());
    const { fieldLabel } = FRE.ui;
    const others = m => st.menus.filter(x => x !== m).map(x => x.name);
    // the name follows the label until it is typed in by hand
    const autoName = m => { if (!m.nameTouched) m.name = FRE.menuNameFromLabel(ws, m.label, others(m)); };
    const st = { menus: [blank()], resMode: 'add', resNames: ['', ''], resTexts: ['You received your item.', 'You do not have the ingredients, or your inventory is full.'], resTids: ['', ''] };
    const body = h('div.newnpc'), checks = h('div.nn-problems'), preview = h('div.nn-preview');
    let btn = null;
    // result text pairs already used by exchanges: RESULTMSG of every loaded recipe
    const pairs = [];
    for (const m of (ws.models.exchange || { menus: [] }).menus) for (const s of m.sets) if (s.resultMsg.length >= 2) {
      const k = s.resultMsg.slice(0, 2).map(r => r.name).join('|');
      if (!pairs.some(p => p.k === k)) pairs.push({ k, tids: s.resultMsg.slice(0, 2).map(r => r.name), text: s.resultMsg.slice(0, 2).map(r => ws.texts.get(r.name) || r.name).join(' / ') });
    }
    const spec = () => {
      const base = st.menus[0].name.replace(/^MMI_/, '');
      const names = st.resNames.map((n, i) => n || `TID_GAME_${base}_${i ? 'FAIL' : 'SUCCESS'}`);
      return { npcKey: npc.key, menus: st.menus.map(m => ({ name: m.name, label: m.label, sets: setsOf(m) })),
        results: st.resMode === 'add' ? { add: names.map((n, i) => ({ name: n, text: st.resTexts[i] })) } : { tids: st.resTids } };
    };
    const nameViews = [];             // per menu: { input, status } updated without a re-render (keeps the focus)
    const refresh = () => {
      const s = spec();
      const free = FRE.menuOps.freeMenuIds(ws);
      st.menus.forEach((m, i) => {
        const v = nameViews[i]; if (!v) return;
        if (v.input !== document.activeElement) v.input.value = m.name;
        const p = m.name ? FRE.menuNameProblem(ws, m.name, st.menus.slice(0, i).map(x => x.name)) : 'Type a label, or a name.';
        v.status.textContent = p ? '✗ ' + p : `✓ free · menu id ${free[i] !== undefined ? free[i] : '?'}`;
        v.status.className = 'small ' + (p ? 'bad' : 'ok');
      });
      const diags = FRE.validateNewMenus(ws, s);
      checks.textContent = '';
      if (!diags.length) checks.appendChild(h('p.ok', '✓ No problem found.'));
      diags.forEach(d => checks.appendChild(diagRow(d)));
      const blocked = diags.some(d => d.severity === 'BLOCK');
      if (btn) btn.disabled = blocked;
      preview.textContent = '';
      if (blocked) { preview.appendChild(h('p.muted', 'Fix the ⛔ problems to see the exact lines.')); return; }
      try {
        const p = FRE.menuOps.newMenusPlan(ws, s);
        preview.appendChild(h('div.mf-players', s.menus.map(m => [h('div', h('b', `${m.label}`), h('span.muted', ` — right-click ${npc.name || npc.key} → ${m.label} → exchange window:`)),
          setLines(ws, m.sets).map(l => h('div.mf-line', l))])));
        const show = (t, x) => { preview.appendChild(h('div.muted.small', t)); preview.appendChild(h('pre.nn-pre', x.replace(/\r/g, '').replace(/\n$/, ''))); };
        show(`defineNeuz.h (menu id${p.ids.length > 1 ? 's' : ''} ${p.ids.join(', ')}):`, p.lines.defineNeuz);
        show('defineText.h (label = TID 7000 + id):', p.lines.defineText);
        show('textClient.txt.txt (+ one textClient.inc block each):', p.lines.textTxt);
        show(`character.inc (${npc.key}):`, p.lines.character);
        show(`Exchange_Script.txt (${p.lines.exchange.split(/\r?\n/).length} lines; the start):`, p.lines.exchange.split(/\r?\n/).slice(0, 40).join('\n'));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); }
    };
    const render = () => {
      body.textContent = '';
      body.appendChild(h('p.muted.small', `Adds right-click menus to ${npc.name || npc.key} that open the exchange window. No C++ change: a menu id without its own case opens the exchange window (WndWorld.cpp:6470), and its label is text 7000 + id. Server + Client copies, one undo step.`));
      nameViews.length = 0;
      st.menus.forEach((m, i) => {
        body.appendChild(h('h3', `Menu ${i + 1}`, st.menus.length > 1 ? h('button.icon.danger', { style: 'margin-left:8px', title: 'Remove this menu', on: { click: () => { st.menus.splice(i, 1); render(); } } }, '✕') : null));
        body.appendChild(h('div.nn-row', fieldLabel('Label', true), h('input.mf-label', { value: m.label, placeholder: 'Entaness Weapons', on: { input: e => { m.label = e.target.value; autoName(m); refresh(); } } }),
          h('span.muted.small', 'What players read when they right-click the NPC.')));
        const input = h('input.mf-name', { value: m.name, placeholder: 'MMI_ENTANESS_WEAPONS', on: { input: e => {
          m.name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); e.target.value = m.name;
          m.nameTouched = m.name !== '';          // emptied: follows the label again
          if (!m.nameTouched) autoName(m);
          refresh(); } } });
        const status = h('span.small');
        nameViews[i] = { input, status };
        body.appendChild(h('div.nn-row', fieldLabel('Name', true), input, status));
        body.appendChild(h('div.muted.small.mf-hint', 'Internal name the server needs (an MMI_ #define); players never see it. It is filled from the label and must be new; change it only if you want another.'));
        body.appendChild(recipeBuilder(ws, m, refresh));
      });
      body.appendChild(h('button.small', { on: { click: () => { st.menus.push(blank()); render(); } } }, '+ Another menu'));
      body.appendChild(h('h3', 'Messages after an exchange'));
      body.appendChild(h('div.nn-row', ['add', 'tids'].map(v => h('label.nn-radio', h('input', { type: 'radio', name: 'mf-res', checked: st.resMode === v, on: { change: () => { st.resMode = v; render(); } } }),
        v === 'add' ? 'two new texts (shared by these menus)' : 'texts an exchange already uses'))));
      if (st.resMode === 'add') ['Success', 'Failure'].forEach((t, i) => body.appendChild(h('div.nn-row', fieldLabel(t, true),
        h('input', { value: st.resTexts[i], style: 'flex:1', on: { input: e => { st.resTexts[i] = e.target.value; refresh(); } } }))));
      else body.appendChild(h('div.nn-row', fieldLabel('Messages', true), FRE.ui.combo({ options: pairs.map(p => ({ v: p.k, label: p.text, find: p.k })), value: st.resTids.join('|'), placeholder: 'Search a message pair',
        onPick: v => { st.resTids = v.split('|'); refresh(); } })));
      body.append(...FRE.ui.formFooter({ checks, action: 'Create', previewTitle: 'What players will see, and what will be written', preview }));
      refresh();
    };
    render();
    const m = modal({ title: `New exchange menu — ${npc.name || npc.key}`, body, wide: true, buttons: [
      { label: 'Close' },
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
      const fake = { npcKey: '-', menus: [{ name: 'MMI_X', label: 'x', sets }], results: { tids: ['x', 'y'] } };
      const diags = FRE.validateNewMenus(ws, fake).filter(d => /^NM_(RECIPE|ITEM|QTY|CHANCE|PAYNUM)$/.test(d.code));
      if (menu.sets.length + sets.length > 30) diags.push({ code: 'NM_SET_CAP', severity: 'BLOCK', field: 'menu', message: `${menu.name} would have ${menu.sets.length + sets.length} exchanges; the server keeps only the first 30.` });
      if (!sets.length) diags.push({ code: 'NM_RECIPE', severity: 'BLOCK', field: 'menu', message: 'Pick at least one reward.' });
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

  FRE.ui.menuForm = { openNewMenus, openNewExchanges, recipeBuilder, setsOf, setLines, blankRecipe };
})(globalThis.FRE = globalThis.FRE || {});
