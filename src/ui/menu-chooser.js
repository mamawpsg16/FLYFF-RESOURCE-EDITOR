// "+ Menu" in NPC Shops: three kinds of new right-click menu, in plain words (the user, 2026-10-07:
// "a trade that sells something, an exchange list like Collins, or the Rules like in GS"):
//   Shop        Trade + a first tab (npcEditOps.addMenu / addTab)
//   Exchange    the exchange-menu form (ui/menu-form.js, edit/menu-ops.js newMenusPlan)
//   Rules text  a menu that opens a text window (menuOps.boardPlan): needs the npc-board client change,
//               docs/patches/npc-board.diff (Client\NpcBoard_<id>.inc in CWndWorld::OnCommand's default branch)
// plus "Other game window…" (the plain menu list, ui/npc-edit.js addMenu).
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const npcId = npc => `${npc.file}|${npc.key}`;
  const E = () => FRE.npcEditOps;

  function open(ctx, npc) {
    const ws = ctx.ws, D = ws.defines.defines;
    const trade = D.get('MMI_TRADE');
    const hasTrade = npc.menus.includes(trade);
    const inc = npc.file.toLowerCase() === 'character.inc';
    let m = null;
    // each choice opens its form titled "+ Menu for X › <choice>", with ← Back to these choices
    const base = `+ Menu for ${npc.name || npc.key}`;
    const sub = title => ({ title: `${base} › ${title}`, back: () => open(ctx, npc) });
    const card = (title, text, enabled, why, go) => h('button.menu-card', { disabled: !enabled, title: enabled ? '' : why,
      on: { click: () => { m.close(); go(sub(title)); } } }, h('b', title), h('span', text), enabled ? null : h('span.why', why));
    const body = h('div.menu-cards',
      card('Shop', 'Sells items. Players buy with Penya.', !hasTrade || !npc.slotTitles[0], 'This NPC already has a shop: add items with + in the item list.', o => shop(ctx, npc, o)),
      card('Exchange', 'Players give items and get rewards (like Collins).', inc && ws.isEditable('exchange_script.txt') && FRE.ui.menuForm, 'Only for NPCs in character.inc.', o => FRE.ui.menuForm.openNewMenus(ctx, npc, o)),
      card('Rules text', 'A window with your text (like the Guild Siege rules).', inc && ctx.hasClient, inc ? 'Needs the Client folder (the text file goes in Client/Client).' : 'Only for NPCs in character.inc.', o => boardForm(ctx, npc, null, o)));
    m = FRE.dom.modal({ title: base, body, buttons: [
      { label: 'Other game window…', onClick: () => { FRE.ui.npcEdit.addMenu(ctx, npc, sub('Other game window')); } },
      { label: 'Cancel' },
    ] });
    return m;
  }

  // Trade (when missing) + the first tab (when none): one undo step
  function shop(ctx, npc, opts = {}) {
    const ws = ctx.ws, trade = ws.defines.defines.get('MMI_TRADE');
    const needTab = !npc.slotTitles[0] && E().nextSlot(npc) === 0;
    const make = name => {
      const parts = [];
      if (!npc.menus.includes(trade)) parts.push({ file: npc.file.toLowerCase(), splices: E().addMenu(ws, npc, 'MMI_TRADE') });
      return needTab ? FRE.shopOps.mergeParts(parts, E().addTab(ws, npc, name).parts) : parts;
    };
    if (!needTab) { ctx.editGroup(() => make(null), `${npc.name || npc.key}: shop added (Trade menu)`, ['npc|' + npcId(npc)]); return; }
    let name = '';
    const input = h('input', { type: 'text', style: 'width:100%', maxlength: 63, placeholder: 'e.g. Scrolls' });
    const checks = h('div');
    const problem = () => (name.trim() ? FRE.newNpcText(name) : 'is empty');
    const refresh = () => { checks.textContent = ''; const p = problem(); checks.appendChild(p ? h('div.bad', `⛔ The tab name ${p}.`) : h('div.ok', '✓ No problem found.')); if (btn) btn.disabled = !!p; };
    input.addEventListener('input', () => { name = input.value; refresh(); });
    const body = h('div', h('p.small.muted', 'The shop window shows this as its first tab. Then add items with + in the item list.'),
      h('label.nn-row', FRE.ui.fieldLabel('First tab name', true), input),
      FRE.ui.formFooter({ checks, action: 'Add shop', previewTitle: 'What players will see', preview: h('p', 'Right-click → Trade opens the shop.') }));
    const mm = FRE.dom.modal({ title: opts.title || `Shop for ${npc.name || npc.key}`, body, buttons: [
      ...(opts.back ? [{ label: '← Back', onClick: opts.back }] : []), { label: 'Cancel' },
      { label: 'Add shop', cls: 'primary', onClick: () => { if (problem()) return false; ctx.editGroup(() => make(name), `${npc.name || npc.key}: shop added (tab "${name}")`, ['npc|' + npcId(npc)]); } },
    ] });
    const btn = mm.el.querySelector('footer button.primary');
    refresh();
    setTimeout(() => input.focus(), 0);
  }

  // How the game draws the text (loaders/board-text.js, a port of CEditString::ParsingString)
  function preview(title, text) {
    const box = h('div.board-preview', h('div.board-title', title || ' '));
    const body = h('div.board-body');
    for (const p of FRE.boardText.parse(text)) {
      const span = h('span', p.text);
      span.style.color = FRE.boardText.css(p.color);
      if (p.bold) span.style.fontWeight = 'bold';
      const deco = [p.underline ? 'underline' : '', p.strike ? 'line-through' : ''].filter(Boolean).join(' ');
      if (deco) span.style.textDecoration = deco;
      body.appendChild(span);
    }
    box.appendChild(body);
    return box;
  }

  // New rules menu (menu = null) or an existing one { id, name } (label + text changed in place)
  function boardForm(ctx, npc, menu, opts = {}) {
    const ws = ctx.ws, O = FRE.menuOps;
    const oldLabel = menu ? (ws.texts.byId.get(O.TID_MMI_DIALOG + menu.id) || {}).text || '' : '';
    const oldText = menu ? (ws.boardTextOf(menu.id) || '').replace(/\r\n/g, '\n') : '';
    let label = oldLabel, text = oldText;
    const labelIn = h('input', { type: 'text', value: label, style: 'width:100%', maxlength: 63, placeholder: 'e.g. Guild Siege Rules' });
    const area = h('textarea.board-text', { rows: 12, style: 'width:100%' });
    area.value = text;
    const nameLine = h('div.small.muted');
    const checks = h('div'), prev = h('div');
    let btn = null;
    const wrap = (a, b) => {
      const s0 = area.selectionStart, s1 = area.selectionEnd;
      area.value = area.value.slice(0, s0) + a + area.value.slice(s0, s1) + b + area.value.slice(s1);
      area.selectionStart = s0 + a.length; area.selectionEnd = s1 + a.length;
      area.focus(); text = area.value; refresh();
    };
    const color = h('input', { type: 'color', value: '#ffcc00', title: 'Colour for the Colour button' });
    const tools = h('div.row.board-tools',
      h('button.small', { title: 'Bold: wraps the selected text in #b … #nb', on: { click: () => wrap('#b', '#nb') } }, h('b', 'B'), ' Bold'),
      h('button.small', { title: 'Colour: wraps the selected text in #cffRRGGBB … #nc', on: { click: () => wrap(FRE.boardText.code(color.value), '#nc') } }, 'Colour'), color,
      h('span.small.muted', ' Select text, then press a button.'));
    const plan = () => {
      if (!menu) return O.boardPlan(ws, { npcKey: npc.key, name: FRE.menuNameFromLabel(ws, label), label, text });
      const parts = [...O.setBoardText(ws, menu.id, text)];
      if (label !== oldLabel) parts.push(...O.setLabel(ws, menu.name, label));
      return { parts };
    };
    function refresh() {
      checks.textContent = ''; prev.textContent = ''; nameLine.textContent = '';
      const bad = m => { checks.appendChild(h('div.bad', '⛔ ' + m)); if (btn) btn.disabled = true; };
      const lp = label.trim() ? FRE.newNpcText(label) : 'is empty';
      prev.appendChild(preview(label, text));
      if (lp) return bad(`The name ${lp}.`);
      if (!menu) {
        const name = FRE.menuNameFromLabel(ws, label), free = O.freeMenuIds(ws);
        if (!free.length) return bad('No free menu id is left (282-349 are all used).');
        nameLine.textContent = `Saved as ${name}, menu ${free[0]}; text file Client/Client/${O.boardFileName(free[0])}`;
      }
      if (menu && label === oldLabel && text.replace(/\r\n/g, '\n') === oldText) { checks.appendChild(h('div.muted', 'No change.')); if (btn) btn.disabled = true; return; }
      let r;
      try { r = plan(); } catch (e) { return bad(e.message.replace(/^the /, 'The ') + '.'); }
      if (btn) btn.disabled = false;
      checks.appendChild(h('div.ok', '✓ No problem found.'));
      checks.appendChild(h('div.warn', '⚠ The game client needs the npc-board change (docs/patches/npc-board.diff, built into Neuz). Without it this menu opens an empty swap window.'));
      for (const p of r.parts) {
        const sf = ws.files.get(p.file);
        prev.appendChild(h('h4', sf.clientOnly ? 'Client/Client/' + sf.name + (sf.bytes.length ? '' : ' (new file)') : sf.name));
        prev.appendChild(FRE.ui.renderDiff(sf, sf.text, sf.preview(p.splices)));
      }
    }
    labelIn.addEventListener('input', () => { label = labelIn.value; refresh(); });
    area.addEventListener('input', () => { text = area.value; refresh(); });
    const body = h('div',
      h('label.nn-row', FRE.ui.fieldLabel('Name in the right-click menu', true), labelIn), nameLine,
      h('div.nn-row', FRE.ui.fieldLabel('Text', true), h('div', { style: 'flex:1' }, tools, area)),
      FRE.ui.formFooter({ checks, action: menu ? 'Apply changes' : 'Create', previewTitle: 'What players will see / what will be written', preview: prev }));
    const m = FRE.dom.modal({ title: opts.title || (menu ? `Edit rules text: ${oldLabel || menu.name}` : `New rules text for ${npc.name || npc.key}`), body, wide: true, buttons: [
      ...(opts.back ? [{ label: '← Back', onClick: opts.back }] : []), { label: 'Cancel' },
      { label: menu ? 'Apply changes' : 'Create', cls: 'primary', onClick: () => {
        if (btn && btn.disabled) return false;
        ctx.editGroup(() => plan().parts, `${npc.name || npc.key}: rules text "${label}" ${menu ? 'changed' : 'added'}`, ['npc|' + npcId(npc)]);
      } },
    ] });
    btn = m.el.querySelector('footer button.primary');
    refresh();
    setTimeout(() => labelIn.focus(), 0);
    return m;
  }

  FRE.ui.menuChooser = { open, shop, boardForm, preview };
})(globalThis.FRE = globalThis.FRE || {});
