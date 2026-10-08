// Boxes: random boxes (propGiftbox.inc: the player gets 1 of N) and sets (propPackItem.inc: the player gets
// everything inside). Pick a box, see what it gives with the chance players really get, add / change / remove
// items, and "🎲 Open it N times" through loaders/boxes-sim.js (CUser::DoUseGiftbox / DoUsePackItem).
// Edits: edit/boxes-ops.js. Plain words (the user, 2026-10-07).
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput, pctInput, toast, keepFocus } = FRE.dom;
  const { diagTags, itemCell, fieldLabel, formFooter, diagRow } = FRE.ui;
  const GIFT = 'propgiftbox.inc', PACK = 'proppackitem.inc';
  const st = { sel: null, show: 'all', openOpts: null };

  const Bx = () => FRE.boxes, Sim = () => FRE.boxesSim, O = () => FRE.boxesOps;
  const model = ctx => ctx.ws.models.boxes;
  const fileOf = kind => (kind === 'random' ? GIFT : PACK);
  const canEdit = (ctx, kind) => ctx.ws.isEditable(fileOf(kind));
  const keyOf = (kind, id) => `boxes|${kind}:${id}`;
  const boxOf = (ctx, sel) => (sel ? (sel.kind === 'random' ? model(ctx).gift : model(ctx).pack).boxes.get(sel.id) || null : null);
  const pct = x => `${Number((x * 100).toFixed(4))}%`;
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const itemOf = (ctx, id) => ctx.ws.itemById(id);
  const itemName = (ctx, id, fallback) => { const it = itemOf(ctx, id); return it && it.name ? it.name : fallback || String(id >>> 0); };
  const boxName = (ctx, b) => itemName(ctx, b.id, b.define);
  const lineName = (ctx, l) => itemName(ctx, l.item.value >>> 0, l.item.define);
  const packMaxOf = (ctx, id) => { const it = itemOf(ctx, id); return it ? FRE.specItem.get(it, 'dwPackMax') >>> 0 : null; };
  // time limits: a number (decimals allowed) + minutes / hours / days (FRE.dom.durationInput); the file keeps whole minutes
  const daysInput = (minutes, o) => FRE.dom.durationInput(Object.assign({ minutes }, o));
  const dayText = m => FRE.dom.durationText(m);
  const boxDiags = ctx => ctx.ws.diags.filter(d => d.module === 'boxes');
  const inBlocks = (d, b) => b.blocks.some(x => d.start >= x.kw.start && d.start <= (x.close ? x.close.end : x.kw.end + 1));
  const diagsOf = (ctx, sel, b) => boxDiags(ctx).filter(d => d.file && d.file.toLowerCase() === fileOf(sel.kind) && d.start !== undefined && inBlocks(d, b));
  const lineDiags = (ctx, sel, l) => boxDiags(ctx).filter(d => d.file && d.file.toLowerCase() === fileOf(sel.kind) && d.start >= l.start && d.start < Math.max(l.end, l.start + 1));
  // what a box inside a box holds (shown as "then, when opened: …"; opening one box never opens the box it gives)
  function insideText(ctx, id) {
    const m = model(ctx), g = m.gift.boxes.get(id), p = m.pack.boxes.get(id);
    const b = p || g;
    if (!b) return null;
    const names = b.lines.slice(0, 3).map(l => lineName(ctx, l));
    return `a ${p ? 'set' : 'random box'}: then, when opened, ${p ? 'all of' : '1 of'} ${names.join(', ')}${b.lines.length > 3 ? `, … (${b.lines.length})` : ''}`;
  }

  function entries(ctx) {
    const m = model(ctx), out = [];
    for (const b of m.gift.boxes.values()) out.push({ kind: 'random', b });
    for (const b of m.pack.boxes.values()) out.push({ kind: 'set', b });
    return out.map(x => Object.assign(x, { name: boxName(ctx, x.b) })).sort((a, z) => a.name.localeCompare(z.name));
  }
  const SHOW = [
    { v: 'all', label: 'All boxes', test: () => true },
    { v: 'random', label: 'Random boxes (1 of N)', test: x => x.kind === 'random' },
    { v: 'set', label: 'Sets (everything inside)', test: x => x.kind === 'set' },
    { v: 'problems', label: 'With problems', test: (x, ctx) => diagsOf(ctx, x, x.b).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (x, ctx) => ctx.edited.has(keyOf(x.kind, x.b.id)) },
  ];
  function edit(ctx, sel, make, label) {
    ctx.edit(fileOf(sel.kind), t => { const sp = make(t); if (sp.retyped) toast(`The box's line format was widened to ${sp.retyped} to hold this (same items and chances).`); return sp; }, label, keyOf(sel.kind, sel.id));
  }
  // a typed field: the pauses while typing one value fold into one undo step
  function typed(ctx, sel, field, make, label) {
    ctx.editGroup(() => [{ file: fileOf(sel.kind), splices: make(ctx.ws.files.get(fileOf(sel.kind)).text) }], label, [keyOf(sel.kind, sel.id)], `bx|${sel.kind}|${sel.id}|${field}`);
  }

  const mod = {
    id: 'boxes', label: 'Boxes', searchPlaceholder: 'Search boxes',
    help: 'Boxes: what each random box and set gives (propGiftbox.inc, propPackItem.inc)',
    st,
    onLoad() { st.sel = null; st.show = 'all'; st.openOpts = null; },

    listExtra(ctx) {
      const all = entries(ctx);
      return h('select.npc-filter', { title: 'Which boxes to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${all.filter(x => o.test(x, ctx)).length})`)));
    },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      let shown = 0;
      for (const x of entries(ctx)) {
        if (!test(x, ctx)) continue;
        if (q && !x.name.toLowerCase().includes(q) && !(x.b.define || '').toLowerCase().includes(q)) continue;
        if (++shown > 600) continue;
        const ds = diagsOf(ctx, x, x.b), nb = ds.filter(d => d.severity === 'BLOCK').length, nw = ds.filter(d => d.severity === 'WARN').length;
        const sel = st.sel && st.sel.kind === x.kind && st.sel.id === x.b.id;
        el.appendChild(h('div.npc.bx-row' + (sel ? '.sel' : ''), { on: { click: () => { st.sel = { kind: x.kind, id: x.b.id }; ctx.renderAll(false); } } },
          FRE.dds.picture(ctx, iconOf(itemOf(ctx, x.b.id)), { cls: '.bx-icon' }),
          h('div.bx-text', h('div.n', h('span', x.name), h('span', ctx.edited.has(keyOf(x.kind, x.b.id)) ? h('span.tag.edit', 'edited') : null,
            nb ? h('span.tag.bad', '⛔' + nb) : nw ? h('span.tag.warn', '⚠' + nw) : null)),
          h('div.k', `${x.kind === 'random' ? 'random' : 'set'} · ${x.b.lines.length} item${x.b.lines.length === 1 ? '' : 's'} · ${x.b.define || x.b.id}`))));
      }
      if (shown > 600) el.appendChild(h('div.pad.muted', `${shown - 600} more: search to narrow the list.`));
      if (!shown) el.appendChild(h('div.pad.muted', 'No boxes match.'));
    },

    renderEditor(el, ctx) {
      const m = model(ctx);
      if (m.pack.stopped) el.appendChild(h('div.banner.bad', 'The server stops reading propPackItem.inc at a set with more than 24 items: every set after it is lost. See the problems list.'));
      if (m.gift.hung || m.pack.hung) el.appendChild(h('div.banner.bad', 'A box block is never closed with }: the server loops forever at startup. See the problems list.'));
      const b = boxOf(ctx, st.sel);
      if (!b) { el.appendChild(h('p.empty-state', 'Select a box on the left.')); emptied(el, ctx); return; }
      keepFocus(el, () => (st.sel.kind === 'random' ? randomView : setView)(el, ctx, st.sel, b));
    },

    addTarget(ctx) {
      const b = boxOf(ctx, st.sel);
      if (!b) return { ok: false, title: 'Select a box on the left first' };
      if (!canEdit(ctx, st.sel.kind)) return { ok: false, title: `${st.sel.kind === 'random' ? 'propGiftbox.inc' : 'propPackItem.inc'} is read-only` };
      const sel = st.sel;
      return { ok: true, usesPrice: false, title: `Add to ${boxName(ctx, b)} (opens the form)`, add(info) { addForm(ctx, sel, info.define); } };
    },

    locate(d, ctx) {
      if (d.module !== 'boxes') return false;
      const m = model(ctx);
      const kind = d.file && d.file.toLowerCase() === GIFT ? 'random' : 'set';
      const src = kind === 'random' ? m.gift : m.pack;
      for (const b of src.boxes.values()) if (d.start !== undefined && inBlocks(d, b)) { st.sel = { kind, id: b.id }; return true; }
      return true;
    },
  };

  // boxes whose contents were removed in this session (BX_EMPTIED): listed under the empty state
  function emptied(el, ctx) {
    const ds = boxDiags(ctx).filter(d => d.code === 'BX_EMPTIED');
    if (!ds.length) return;
    el.appendChild(h('h3', 'Emptied in this session'));
    for (const d of ds) el.appendChild(diagRow(d));
  }

  function header(el, ctx, sel, b, what) {
    const it = itemOf(ctx, b.id), f = ctx.ws.files.get(fileOf(sel.kind));
    el.appendChild(h('div.npc-title.bx-title', FRE.dds.picture(ctx, iconOf(it), { scale: 2, cls: '.bx-icon-big' }),
      h('h2', boxName(ctx, b)), h('span.def', b.define || String(b.id)), h('span.muted', ' ' + what),
      h('span.line', `${f.name} L${f.lineOf(b.blocks[0].kw.start) + 1}`), canEdit(ctx, sel.kind) ? null : h('span.tag.bad', 'read-only')));
    if (!it) el.appendChild(h('p.bad', 'This box is not an item in Spec_Item.txt: no player can own it.'));
  }
  function tools(ctx, sel, b, extra) {
    const ed = canEdit(ctx, sel.kind);
    return h('div.dr-line', { style: 'margin-top:10px' },
      h('button.primary', { disabled: !ed, on: { click: () => addForm(ctx, sel) } }, '+ Add an item'),
      h('button', { on: { click: () => openWindow(ctx, sel) } }, '🎲 Open it N times…'),
      ...(extra || []),
      h('button.danger', { disabled: !ed, title: 'Removes what the box gives; the box item itself stays', on: { click: () => removeWindow(ctx, sel, b) } }, 'Remove contents…'));
  }
  function problems(el, ctx, sel, b) {
    const ds = diagsOf(ctx, sel, b);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }
  function amountCell(ctx, sel, l, ed, onSet) {
    const max = packMaxOf(ctx, l.item.value >>> 0);
    return h('td.dr-amt', '×', numInput({ value: l.num.value, min: 1, max: O().MAX_NUM, disabled: !ed, key: `bx|${sel.id}|${l.start}|n`,
      onCommit: v => { if (v) onSet(v); } }), max ? h('span.muted.small', ` max ${fmt(max)}`) : null);
  }

  // ------------------------------------------------------------- a random box
  function randomView(el, ctx, sel, b) {
    const ed = canEdit(ctx, sel.kind), name = boxName(ctx, b), ch = Bx().chances(b), block = b.blocks[b.blocks.length - 1];
    header(el, ctx, sel, b, `random box: the player gets 1 of ${b.lines.length}`);
    el.appendChild(h('p.muted.small', 'The server rolls once per box (0 to 999,999) and walks down the list. The chances you type always add up to 100%: changing one moves the others in proportion. ',
      'Opening needs 1 free bag slot (the box is used up first, so its own slot counts when it was the last one).'));
    const fileTotal = b.sum / Bx().TOTAL;
    el.appendChild(h('p' + (b.sum === Bx().TOTAL ? '.small' : '.small.warn-text'), b.sum === Bx().TOTAL ? 'Total: 100% ✓'
      : b.sum > Bx().TOTAL ? `The file's chances add up to ${pct(fileTotal)}: the server cuts the list at 100% (see "Players get").`
        : `The file's chances add up to ${pct(fileTotal)}: the server gives the missing ${pct(1 - fileTotal)} to the last line (see "Players get").`));
    el.appendChild(tools(ctx, sel, b, [h('button', { disabled: !ed || b.lines.length < 2, title: 'Give every item the same chance',
      on: { click: () => edit(ctx, sel, t => O().spreadEvenly(t, b), `${name}: same chance for every item`) } }, 'Same chance for all')]));
    const tb = h('table.items.dr.bx', h('tr', h('th', ''), h('th', 'Item'), h('th', { title: 'Typed in percent; the file keeps the type\'s steps (0.01% or finer)' }, 'Chance'),
      h('th', { title: 'What the server really does with the file\'s numbers' }, 'Players get'), h('th', { title: 'How many of the item the player gets' }, 'Count'),
      h('th', { title: 'Bound: the item cannot be traded' }, 'Bound'), h('th', { title: 'A number + minutes / hours / days; 0 = no time limit' }, 'Time limit'), h('th', 'Upgrade'), h('th', ''), h('th', 'Line')));
    b.lines.forEach((l, j) => {
      const id = l.item.value >>> 0, it = itemOf(ctx, id), iname = lineName(ctx, l), flag = Bx().flagOf(l), mins = Bx().minutesOf(l);
      const set = (field, d, was) => typed(ctx, sel, `${l.start}|${field}`, t => {
        const sp = O().setLine(t, boxOf(ctx, sel), j, d, ctx.ws.defines.defines);
        if (sp.retyped) toast(`The box's line format was widened to ${sp.retyped} to hold this (same items and chances).`);
        return sp;
      }, `${name}: changed the ${field} of ${iname} (was ${was})`);
      const inside = insideText(ctx, id);
      tb.appendChild(h('tr',
        h('td', FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' })),
        h('td', itemCell(it ? ctx.ws.itemInfo(it) : null, l.item.define || String(id)), inside ? h('div.muted.small', inside) : null),
        h('td', pctInput({ value: l.weight, disabled: !ed, key: `bx|${sel.id}|${l.start}|p`,
          onCommit: u => typed(ctx, sel, `${l.start}|chance`, t => O().setChance(t, boxOf(ctx, sel), j, u), `${name}: changed the chance of ${iname} (was ${pct(l.weight / Bx().TOTAL)})`) })),
        h('td' + (Math.abs(ch[j] * Bx().TOTAL - l.weight) > 0.5 ? '.warn-text' : ''), ch[j] ? pct(ch[j]) : h('span.bad', 'never')),
        amountCell(ctx, sel, l, ed, v => set('count', { num: v }, `×${l.num.value}`)),
        h('td', flag === Bx().FLAG_KEEP ? h('span.muted.small', { title: 'Flag 4: the item keeps its own settings (not bound, not "charged")' }, 'item\'s own')
          : h('input', { type: 'checkbox', checked: flag === Bx().FLAG_BOUND, disabled: !ed, title: 'Bound: cannot be traded',
            on: { change: e => set('bound setting', { flag: e.target.checked ? Bx().FLAG_BOUND : 0 }, flag === Bx().FLAG_BOUND ? 'bound' : 'not bound') } })),
        h('td.dr-amt', daysInput(mins, { disabled: !ed, key: `bx|${sel.id}|${l.start}|m`,
          onCommit: v => set('time limit', { minutes: v }, dayText(mins)) })),
        h('td.dr-amt', '+', numInput({ value: Bx().upgradeOf(l), min: 0, max: O().MAX_UPGRADE, disabled: !ed, key: `bx|${sel.id}|${l.start}|u`,
          onCommit: v => { if (v !== null) set('upgrade', { upgrade: v }, `+${Bx().upgradeOf(l)}`); } })),
        h('td', h('button.icon.danger', { disabled: !ed || b.lines.length < 2, title: b.lines.length < 2 ? 'The last item: use Remove contents' : 'Remove this item (the others grow back to 100%)',
          on: { click: () => edit(ctx, sel, t => O().removeLine(t, boxOf(ctx, sel), j), `${name}: removed ${iname}`) } }, '✕'), ' ', diagTags(lineDiags(ctx, sel, l))),
        h('td', h('span.line', 'L' + (ctx.ws.files.get(GIFT).lineOf(l.start) + 1)))));
    });
    el.appendChild(tb);
    el.appendChild(h('p.muted.small', `Line format: ${block.type} (chances in steps of ${pct(Bx().TYPES[block.type].prec / Bx().TOTAL)}${Bx().TYPES[block.type].cols.length ? `; ${Bx().TYPES[block.type].cols.join(', ')}` : ''}). `,
      'A timed or upgraded item that lands on a stack the player already has takes that stack\'s time limit and +N (the server only compares the item, its bound flag and "charged").'));
    problems(el, ctx, sel, b);
  }

  // ------------------------------------------------------------- a set
  function setView(el, ctx, sel, b) {
    const ed = canEdit(ctx, sel.kind), name = boxName(ctx, b);
    header(el, ctx, sel, b, `set: the player gets all ${b.lines.length} item${b.lines.length === 1 ? '' : 's'}`);
    el.appendChild(h('p.muted.small', `Opening needs ${b.lines.length} free bag slot${b.lines.length === 1 ? '' : 's'} (one per item; otherwise nothing happens). `,
      'When the box itself is bound or has a time limit, every item comes bound.'));
    el.appendChild(h('div.dr-line', h('b', 'Time limit for every item'),
      daysInput(b.span, { disabled: !ed, key: `bx|${sel.id}|span`,
        onCommit: v => typed(ctx, sel, 'span', t => O().setPackMinutes(t, boxOf(ctx, sel), v), `${name}: changed the time limit (was ${dayText(b.span)})`) })));
    el.appendChild(tools(ctx, sel, b));
    const tb = h('table.items.dr.bx', h('tr', h('th', ''), h('th', 'Item'), h('th', { title: 'How many of the item the player gets' }, 'Count'), h('th', 'Upgrade'), h('th', ''), h('th', 'Line')));
    b.lines.forEach(l => {
      const id = l.item.value >>> 0, it = itemOf(ctx, id), iname = lineName(ctx, l), inside = insideText(ctx, id);
      const set = (field, d, was) => typed(ctx, sel, `${l.start}|${field}`, t => O().setPackLine(t, l, d, ctx.ws.defines.defines), `${name}: changed the ${field} of ${iname} (was ${was})`);
      tb.appendChild(h('tr',
        h('td', FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' })),
        h('td', itemCell(it ? ctx.ws.itemInfo(it) : null, l.item.define || String(id)), inside ? h('div.muted.small', inside) : null),
        amountCell(ctx, sel, l, ed, v => set('count', { num: v }, `×${l.num.value}`)),
        h('td.dr-amt', '+', numInput({ value: l.upgrade.value, min: 0, max: O().MAX_UPGRADE, disabled: !ed, key: `bx|${sel.id}|${l.start}|u`,
          onCommit: v => { if (v !== null) set('upgrade', { upgrade: v }, `+${l.upgrade.value}`); } })),
        h('td', h('button.icon.danger', { disabled: !ed || b.lines.length < 2, title: b.lines.length < 2 ? 'The last item: use Remove contents' : 'Remove this item',
          on: { click: () => edit(ctx, sel, t => O().removePackLine(t, boxOf(ctx, sel), l), `${name}: removed ${iname}`) } }, '✕'), ' ', diagTags(lineDiags(ctx, sel, l))),
        h('td', h('span.line', 'L' + (ctx.ws.files.get(PACK).lineOf(l.start) + 1)))));
    });
    el.appendChild(tb);
    problems(el, ctx, sel, b);
  }

  // ------------------------------------------------------------- + Add an item
  function addForm(ctx, sel, define) {
    const ws = ctx.ws, b0 = boxOf(ctx, sel), name = boxName(ctx, b0), random = sel.kind === 'random';
    const s = { define: define || null, u: random ? Math.round(Bx().TOTAL / (b0.lines.length + 1)) : null, num: 1, bound: false, minutes: random ? null : 0, upgrade: 0 };
    const body = h('div.nn-form'), checks = h('div'), preview = h('div');
    let btn = null;
    const itemOpts = ws._itemOpts || [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, z) => a.name.localeCompare(z.name)).map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define }));
    ws._itemOpts = itemOpts;
    const plan = () => {
      const t = ws.files.get(fileOf(sel.kind)).text, b = boxOf(ctx, sel), D = ws.defines.defines;
      return random ? O().addLine(t, b, { define: s.define, w: s.u, num: s.num, flag: s.bound ? Bx().FLAG_BOUND : 0, minutes: s.minutes, upgrade: s.upgrade }, D)
        : O().addPackLine(t, b, { define: s.define, num: s.num, upgrade: s.upgrade }, D);
    };
    const idOf = () => (s.define && ws.defines.defines.has(s.define) ? ws.defines.defines.get(s.define) >>> 0 : null);
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      const probs = [], id = idOf(), max = id !== null ? packMaxOf(ctx, id) : null;
      if (!s.define) probs.push(['BLOCK', 'Still needs: the item']);
      if (random && !s.u) probs.push(['BLOCK', 'Still needs: the chance']);
      if (random && s.minutes === null) probs.push(['BLOCK', 'Still needs: the time limit (Permanent or 0 = it never expires)']);
      if (max !== null && s.num > max) probs.push(['BLOCK', `One bag slot holds at most ${fmt(max)} of this item: add a second line for more`]);
      if (!random && b0.lines.length >= Bx().MAX_ITEM_PER_PACK) probs.push(['BLOCK', `A set holds at most ${Bx().MAX_ITEM_PER_PACK} items`]);
      if (random && b0.lines.length >= Bx().MAX_GIFTBOX_ITEM) probs.push(['BLOCK', `A random box holds at most ${Bx().MAX_GIFTBOX_ITEM} items`]);
      if (s.define && b0.lines.some(l => l.item.define === s.define)) probs.push(['WARN', `${name} already has this item: both lines stay`]);
      if (id !== null && insideText(ctx, id)) probs.push(['WARN', `This item is a box itself: players get the box and open it later (${insideText(ctx, id)})`]);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(p => p[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', random ? 'Fill in the item, the chance and the time limit.' : 'Fill in the item.')); return; }
      try {
        const sp = plan(), f = ws.files.get(fileOf(sel.kind));
        const ins = sp.filter(x => x.insert && x.start === x.end);
        preview.appendChild(h('pre.preview', `${f.name}, ${name}'s block:\n` + ins.map(x => '+' + x.insert.replace(/\r?\n$/, '').replace(/\r?\n/g, '\n+')).join('\n')));
        if (random) {
          const others = sp.filter(x => !(x.insert && x.start === x.end)).length;
          preview.appendChild(h('p', `Players get it in ${pct(s.u / Bx().TOTAL)} of opens.`,
            others ? ` The other ${b0.lines.length} chances shrink in proportion so the total stays 100%.` : '',
            sp.retyped ? ` The box's line format becomes ${sp.retyped} to hold the time limit, bound flag, +N or a finer chance.` : ''));
        } else preview.appendChild(h('p', `Opening the set then needs ${b0.lines.length + 1} free bag slots.`));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); if (btn) btn.disabled = true; }
    }
    const row = (label, req, ...el) => h('div.nn-row', fieldLabel(label, req), ...el);
    body.appendChild(h('div',
      row('Item', true, h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOpts, value: s.define, placeholder: 'Type an item name…', onPick: v => { s.define = v; refresh(); } }))),
      random ? row('Chance', true, pctInput({ value: s.u, key: 'bx|add|p', live: true, onCommit: u => { s.u = u; refresh(); } })) : null,
      row('Count (how many they get)', true, numInput({ value: 1, min: 1, max: O().MAX_NUM, key: 'bx|add|n', onCommit: v => { s.num = v || 1; refresh(); } })),
      random ? row('Bound', false, h('label', h('input', { type: 'checkbox', on: { change: e => { s.bound = e.target.checked; refresh(); } } }), ' the item cannot be traded')) : null,
      random ? row('Time limit', true, daysInput(null, { key: 'bx|add|m', permanent: true, onCommit: v => { s.minutes = v; refresh(); } })) : null,
      row('Upgrade (+N)', false, numInput({ value: 0, min: 0, max: O().MAX_UPGRADE, key: 'bx|add|u', onCommit: v => { s.upgrade = v || 0; refresh(); } }))));
    if (!random) body.appendChild(h('p.muted.small', 'Every item of a set shares the set\'s time limit (above the table).'));
    formFooter({ checks, action: 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: `Add an item: ${name}`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: 'Add', cls: 'primary', id: 'bx-add-btn', onClick: () => {
        const id = idOf(), iname = id !== null ? itemName(ctx, id, s.define) : s.define;
        edit(ctx, sel, () => plan(), `${name}: added ${iname} ×${s.num}${random ? ` (${pct(s.u / Bx().TOTAL)})` : ''}`);
      } },
    ] });
    btn = m.el.querySelector('#bx-add-btn');
    refresh();
  }

  // ------------------------------------------------------------- Remove contents…
  function removeWindow(ctx, sel, b) {
    const name = boxName(ctx, b);
    modal({ title: `Remove contents: ${name}`, body: h('div',
      h('p', `This removes everything ${name} gives (${b.lines.length} item${b.lines.length === 1 ? '' : 's'}).`),
      h('p.warn-text', '⚠ Players who already own this box keep it, but using it will do nothing. The box item itself stays in the game (items are never deleted).'),
      h('p.muted.small', 'Ctrl+Z undoes it until you save.')), buttons: [
      { label: 'Cancel' },
      { label: 'Remove contents', cls: 'danger', onClick: () => { edit(ctx, sel, t => O().removeContents(t, b), `${name}: removed its contents`); st.sel = null; } },
    ] });
  }

  // ------------------------------------------------------------- 🎲 Open it N times
  function openWindow(ctx, sel) {
    const ws = ctx.ws, b = boxOf(ctx, sel), name = boxName(ctx, b);
    const o = st.openOpts && st.openOpts.id === b.id ? st.openOpts : { id: b.id, n: 1000, free: 10, seed: 1, bound: false, keep: 0, locked: false, expired: false, trading: false, have: false };
    st.openOpts = o;
    const out = h('div');
    const run = () => {
      out.textContent = '';
      const env = Sim().envFor(ws);
      const have = o.have ? b.lines.map(l => ({ id: l.item.value >>> 0, num: 1 })).filter(x => itemOf(ctx, x.id)) : [];
      const t0 = Date.now();
      const r = Sim().run(env, b.id, { n: o.n, free: o.free, seed: o.seed, bound: o.bound, keep: o.keep, locked: o.locked, expired: o.expired, trading: o.trading, have });
      if (r.crash) out.appendChild(h('div.banner.bad', `The server would crash: ${r.crash}.`));
      const refused = Object.entries(r.refused);
      out.appendChild(h('p', `${fmt(r.opens)} opens in ${Date.now() - t0} ms: ${fmt(r.used)} used the box${refused.length ? `, refused ${refused.map(([k, v]) => `${fmt(v)}× (${WHY[k] || k})`).join(', ')}` : ''}.`));
      if (r.texts.length) out.appendChild(h('div.bx-chat', h('b', 'The player reads: '), r.texts.slice(0, 6).map(t => h('div', t)), r.texts.length > 6 ? h('div.muted', `… ${r.texts.length - 6} more lines`) : null));
      if (r.used) {
        const tb = h('table.items.dr', h('tr', h('th', 'Item'), h('th.num', 'Times'), h('th.num', '% of opens'), sel.kind === 'random' ? h('th.num', 'Shown chance') : null, h('th.num', 'Items in all'), h('th', 'Notes')));
        const ch = sel.kind === 'random' ? Bx().chances(b) : null;
        b.lines.forEach((l, i) => {
          const s = r.lines.get(i) || { times: 0, qty: 0, lost: 0, stacked: 0 }, id = l.item.value >>> 0, it = itemOf(ctx, id);
          const notes = [];
          if (s.lost) notes.push(h('span.bad', `${fmt(s.lost)}× lost (did not fit in the bag)`));
          if (s.stacked) notes.push(h('span.muted', `${fmt(s.stacked)}× joined a stack already in the bag`));
          const inside = insideText(ctx, id);
          if (inside) notes.push(h('span.muted', inside));
          tb.appendChild(h('tr', itemCell(it ? ws.itemInfo(it) : null, l.item.define || String(id)), h('td.num', fmt(s.times)), h('td.num', pct(s.times / r.opens)),
            ch ? h('td.num', pct(ch[i])) : null, h('td.num', fmt(s.qty)), h('td', notes)));
        });
        out.appendChild(tb);
      }
    };
    const WHY = { trade: 'in a trade', unusable: 'cannot be used', expired: 'expired', locked: 'locked', space: 'bag full', 'not-a-box': 'not a box' };
    const body = h('div',
      h('p.muted.small', 'Replays the server\'s box code with its random generator, each open on the same starting bag: the same seed gives the same results. Not modelled: the use-item code that runs before a random box opens (a box row copied from an existing box does nothing there), logs.'),
      h('div.nn-row',
        fieldLabel('Opens', true), numInput({ value: o.n, min: 1, max: 200000, onCommit: v => { o.n = v || 1; } }),
        fieldLabel('Free bag slots', true), numInput({ value: o.free, min: 0, max: 160, onCommit: v => { o.free = v === null ? 0 : v; } }),
        fieldLabel('Seed', false), numInput({ value: o.seed, min: 0, max: 4294967295, onCommit: v => { o.seed = v || 0; } })),
      h('div.nn-row',
        ...[['bound', 'The box is bound'], ['locked', 'The box is locked'], ['expired', 'The box has expired'], ['trading', 'The player is trading'],
          ['have', 'The bag already holds 1 of each item']].map(([k, label]) => h('label', h('input', { type: 'checkbox', checked: o[k], on: { change: e => { o[k] = e.target.checked; } } }), ' ' + label)),
        h('label', 'The box has a time limit of ', daysInput(o.keep, { onCommit: v => { o.keep = v; } }))),
      h('button.primary', { on: { click: run } }, 'Run'), out);
    modal({ title: `Open ${name} N times`, body, wide: true });
    run();
  }

  FRE.ui.modules.push(mod);
  FRE.ui.boxes = { addForm, openWindow };
})(globalThis.FRE = globalThis.FRE || {});
