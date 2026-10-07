// Dialogs that edit an existing NPC (edit/npcedit-ops.js): rename it, rename / add / remove a shop tab,
// add a right-click menu. Standard form pieces (FRE.ui.fieldLabel, formFooter), live checks while typing.
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const O = () => FRE.npcEditOps;
  const npcId = npc => `${npc.file}|${npc.key}`;
  const PLACEHOLDER = /^(n\/a|tba|-+|\.+)?$/i;
  const isPlaceholder = t => t === undefined || t === null || PLACEHOLDER.test(String(t).trim());

  function usesText(u) {
    const who = u.npc.name || u.npc.key;
    if (u.what === 'name') return `the name of ${who} (${u.npc.key})`;
    if (u.what === 'tab') return `${who}: tab ${u.slot + 1}`;
    return `${who}: portrait`;
  }

  // One text box + checks + "what will be written". plan(text, everywhere) -> { parts, how, others }
  function textDialog(ctx, npc, { title, label, value, tok, action, describe, plan }) {
    const ws = ctx.ws;
    let text = value || '', everywhere = false, timer = null;
    const others = tok && tok.stringKey ? O().keyUses(ws, tok.stringKey).filter(u => (u.rec.args.name || u.rec.args.title || u.rec.args.image) !== tok) : [];
    const input = h('input', { type: 'text', value: text, style: 'width:100%', maxlength: 63 });
    const checks = h('div'), preview = h('div');
    let btn = null;
    const shared = others.length ? h('div.nn-shared',
      h('p.small', `This text is also used by ${others.length} other place${others.length === 1 ? '' : 's'}:`),
      h('ul.plan.small', others.slice(0, 12).map(u => h('li', usesText(u))), others.length > 12 ? h('li', `… ${others.length - 12} more`) : null),
      h('label.small', h('input', { type: 'checkbox', on: { change: e => { everywhere = e.target.checked; refresh(); } } }),
        ` Change it in all ${others.length + 1} places (otherwise only this one changes: it gets its own new text line)`)) : null;

    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      const p = FRE.newNpcText(text);
      if (p) { checks.appendChild(h('div.bad', `⛔ The text ${p}.`)); if (btn) btn.disabled = true; return; }
      if (value && text === value && !everywhere) { checks.appendChild(h('div.muted', 'No change: this is already the name.')); if (btn) btn.disabled = true; return; }
      let r;
      try { r = plan(text, everywhere); } catch (e) { checks.appendChild(h('div.bad', '⛔ ' + e.message)); if (btn) btn.disabled = true; return; }
      if (btn) btn.disabled = false;
      checks.appendChild(h('div.ok', '✓ No problem found.'));
      if (r.how === 'own key') checks.appendChild(h('div.muted.small', `Only this one changes: it gets its own text line ${r.key}${r.oldKey ? ` instead of the shared ${r.oldKey}` : ''}.`));
      if (r.how === 'everywhere') checks.appendChild(h('div.warn', `⚠ All ${others.length + 1} places that use this text change.`));
      preview.appendChild(h('p', describe(text)));
      for (const part of r.parts) {
        const sf = ws.files.get(part.file);
        preview.appendChild(h('h4', sf.name));
        preview.appendChild(FRE.ui.renderDiff(sf, sf.text, sf.preview(part.splices)));
      }
    }
    input.addEventListener('input', () => { text = input.value; clearTimeout(timer); timer = setTimeout(refresh, 250); });
    input.addEventListener('change', () => { text = input.value; clearTimeout(timer); refresh(); });
    const body = h('div', h('label.nn-row', FRE.ui.fieldLabel(label, true), input), shared,
      FRE.ui.formFooter({ checks, action, previewTitle: 'What players will see / what will be written', preview }));
    const m = FRE.dom.modal({ title, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: action, cls: 'primary', onClick: () => {
        if (FRE.newNpcText(text) || (value && text === value && !everywhere)) return false;
        ctx.editGroup(() => plan(text, everywhere).parts, `${title}: ${text}`, ['npc|' + npcId(npc)]);
      } },
    ] });
    btn = m.el.querySelector('footer button.primary');
    refresh();
    setTimeout(() => { input.focus(); input.select(); }, 0);
    return m;
  }

  function renameNpc(ctx, npc) {
    const rec = O().nameRec(npc);
    return textDialog(ctx, npc, {
      title: `Rename ${npc.name || npc.key}`, label: 'Name players see', value: npc.name || '', tok: rec && rec.args.name, action: 'Rename',
      describe: t => `Above the NPC's head and in its windows: "${t}". The key ${npc.key} stays the same (scripts and maps use it).`,
      plan: (t, all) => O().renameNpc(ctx.ws, npc, t, all),
    });
  }

  function renameTab(ctx, npc, slot) {
    const rec = O().slotRec(npc, slot);
    const removable = O().removableTab(npc);
    const m = textDialog(ctx, npc, {
      title: `Rename tab ${slot + 1} of ${npc.name || npc.key}`, label: 'Tab name players see', value: npc.slotTitles[slot] || '', tok: rec && rec.args.title, action: 'Rename',
      describe: t => `In the shop window (right-click → Trade), tab ${slot + 1} reads "${t}".`,
      plan: (t, all) => O().renameTab(ctx.ws, npc, slot, t, all),
    });
    if (removable.slot === slot) {
      const foot = m.el.querySelector('footer');
      foot.insertBefore(h('button.danger', { title: 'Remove this tab\'s AddVendorSlot line (it sells nothing). Its text line stays in character.txt.txt.',
        on: { click: () => { m.close(); ctx.editGroup(() => O().removeTab(ctx.ws, npc, slot).parts, `remove tab ${slot + 1}`, ['npc|' + npcId(npc)]); } } }, 'Remove this tab'), foot.firstChild);
    }
    return m;
  }

  function addTab(ctx, npc, after) {
    const slot = O().nextSlot(npc);
    return textDialog(ctx, npc, {
      title: `+ Tab for ${npc.name || npc.key}`, label: `Name of tab ${slot + 1}`, value: '', tok: null, action: 'Add tab',
      describe: t => `The shop window gets a tab "${t}" at position ${slot + 1}. Add items to it with + in the item list.`,
      plan: t => { const r = O().addTab(ctx.ws, npc, t); if (after) after(r.slot); return r; },
    });
  }

  // + Menu: a searchable list of every MMI_ id the client can show (< MAX_MOVER_MENU) that this NPC lacks.
  function addMenu(ctx, npc) {
    const ws = ctx.ws;
    const have = new Set(npc.menus);
    const seen = new Set();
    const options = [];
    for (const [name, id] of ws.defines.withPrefix('MMI_')) {
      if (id < 0 || id >= 350 || have.has(id) || seen.has(id)) continue;
      seen.add(id);
      const [m] = FRE.newNpcSim.rightClick(ws, [id]);
      if (!m) continue;
      const label = m.label || FRE.ui.pretty(name);
      const group = m.opens ? (m.opens.sets ? 'Opens the exchange window' : 'Opens an EMPTY exchange window (no exchanges in Exchange_Script.txt)') : 'Opens its own window';
      options.push({ v: name, label: `${label} · ${name}`, group, find: name });
    }
    options.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    let pick = null;
    const info = h('div.small.muted', 'Pick a menu. The right-click list shows menus in id order, whatever the order of the lines.');
    const body = h('div', h('label.nn-row', FRE.ui.fieldLabel('Menu', true), FRE.ui.combo({ options, value: null, placeholder: 'Type a menu name (Trade, Bank, …)',
      onPick: v => { pick = v; const ids = [...npc.menus, ws.defines.defines.get(v)];
        info.textContent = 'Right-click will show: ' + FRE.newNpcSim.rightClick(ws, ids).map(x => x.label || x.define).join(', '); } })), info);
    FRE.dom.modal({ title: `+ Menu for ${npc.name || npc.key}`, body, buttons: [
      { label: 'Cancel' },
      { label: 'Add menu', cls: 'primary', onClick: () => {
        if (!pick) { FRE.dom.toast('Pick a menu first', 'bad'); return false; }
        ctx.edit(npc.file.toLowerCase(), () => O().addMenu(ws, npc, pick), `add menu ${pick}`, 'npc|' + npcId(npc));
      } },
    ] });
  }

  function removeMenu(ctx, npc, id, label) {
    const ws = ctx.ws;
    const trade = ws.defines.defines.get('MMI_TRADE');
    const sells = npc.statements.some(r => FRE.character.shopEntry(r));
    const [m] = FRE.newNpcSim.rightClick(ws, [id]);
    const notes = [];
    if (id === trade && sells) notes.push('Without Trade, players cannot open this shop: its items stay in the file but nobody can buy them.');
    if (m && m.opens) notes.push('The exchanges of this menu stay in Exchange_Script.txt; only the right-click entry goes away.');
    const go = () => ctx.edit(npc.file.toLowerCase(), () => O().removeMenu(ws, npc, id), `remove menu ${label}`, 'npc|' + npcId(npc));
    if (!notes.length) { go(); return; }
    FRE.dom.modal({ title: `Remove "${label}" from ${npc.name || npc.key}?`, body: h('div', notes.map(n => h('p', n))), buttons: [
      { label: 'Cancel' }, { label: 'Remove', cls: 'danger', onClick: go },
    ] });
  }

  FRE.ui.npcEdit = { renameNpc, renameTab, addTab, addMenu, removeMenu, isPlaceholder };
})(globalThis.FRE = globalThis.FRE || {});
