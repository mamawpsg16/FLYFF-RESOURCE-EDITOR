// Consumable Stats (task L): every used item that gives stats (premium buffs, macarons, STR/DEX/INT/STA/DEF potions,
// balloons, timed foods, couple buffs): its 6 stat slots and buff time (Spec_Item.txt), what players see (the game tooltip:
// loaders/item-tooltip.js), and 🧪 Use it (loaders/consumables-sim.js: use, use again, a blocking item, the timer running out).
// Edits: edit/consumables-ops.js. The user, 2026-10-15: "an editor for stats for all consumables like prems like activation
// etc macaron what stats it gives".
(function (FRE) {
  'use strict';
  const { h, numInput, keepFocus } = FRE.dom;
  const { diagRow } = FRE.ui;
  const SPEC = 'spec_item.txt';
  const st = { sel: null, show: 'stats', group: '', unit: 'min', other: null };
  const Sim = () => FRE.consumablesSim, O = () => FRE.consumablesOps, C = () => FRE.consumables;
  const model = ctx => ctx.ws.models.consumables;
  const can = ctx => ctx.ws.isEditable(SPEC);
  const cDiags = (ctx, c) => ctx.ws.diags.filter(d => d.module === 'consumables' && d.start === c.item.start);
  const keyOf = id => `consumables|${id}`;
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const UNITS = { s: 1000, min: 60000, h: 3600000, d: 86400000 };
  const PATH = { buff: 'used like a buff scroll (IK2_BUFF)', balloon: 'a balloon (one at a time)', once: 'IK2_ONCE (one of its kind at a time)',
    keep: 'IK2_KEEP (one at a time, level range)', food: 'food / potion (instant)' };
  const WHY = { 'same-kind': 'refused: a buff of the same kind is on', balloon: 'refused: a balloon is already on', level: 'refused: outside its level range',
    active: 'refused: already active', 'not-modelled': 'not modelled here', unknown: 'unknown item' };

  // a text box that commits on pause / Enter / leaving it (the same as ui/rates.js textInput)
  function textInput({ value, key, disabled, max, width, onCommit }) {
    const el = h('input', { type: 'text', value: value || '', disabled, maxLength: max || 255, style: `width:${width || '14em'}` });
    if (key) el.dataset.key = key;
    el.dataset.value = el.value;
    const commit = () => { if (!el.isConnected || el.value === el.dataset.value) return; el.dataset.value = el.value; onCommit(el.value); };
    FRE.dom.liveCommit(el, commit);
    el.addEventListener('change', commit);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    return el;
  }

  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws), opts = [{ v: 0, label: '(empty slot)', find: 'empty none' }];
    for (const [v, w] of [...words].sort((a, b) => (a[1].word || a[1].define).localeCompare(b[1].word || b[1].define)))
      opts.push({ v, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}` });
    return { opts, words };
  }
  const dstLabel = (ctx, words, v) => { const w = words.get(v); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : (ctx.ws.defines.byValue('DST_', v) || `stat ${v}`); };
  const valText = (ctx, words, d, a) => {
    const w = words.get(d), aspd = d === ctx.ws.defines.defines.get('DST_ATTACKSPEED');
    return aspd ? `${a >= 0 ? '+' : ''}${a / 20}% (raw ${a})` : `${a >= 0 ? '+' : ''}${a}${w && w.rate ? '%' : ''}`;
  };

  const SHOW = [
    { v: 'stats', label: 'With stats', test: c => c.slots.some(s => s.on) || !!c.hard },
    { v: 'all', label: 'All consumables', test: () => true },
    { v: 'problems', label: 'With problems', test: (c, ctx) => cDiags(ctx, c).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (c, ctx) => ctx.edited.has(keyOf(c.id)) },
  ];

  const mod = {
    id: 'consumables', label: 'Consumable Stats', searchPlaceholder: 'Search consumables', noItems: true,
    help: 'Consumable Stats: what premium buffs, macarons, potions, balloons and foods give, and for how long (Spec_Item.txt)',
    st,
    onLoad() { st.sel = null; st.show = 'stats'; st.group = ''; st.other = null; },

    listExtra(ctx) {
      const m = model(ctx);
      return h('div.bx-filters',
        h('select.npc-filter', { title: 'Which items', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
          SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${m.items.filter(c => o.test(c, ctx)).length})`))),
        h('select.npc-filter', { title: 'Group', on: { change: e => { st.group = e.target.value; ctx.renderList(); } } },
          [h('option', { value: '' }, 'Every group'), ...C().GROUPS.map(g => h('option', { value: g.key, selected: g.key === st.group }, `${g.label} (${m.items.filter(c => c.group === g.key).length})`))]));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      let shown = 0;
      for (const g of C().GROUPS) {
        if (st.group && g.key !== st.group) continue;
        const list = m.items.filter(c => c.group === g.key && test(c, ctx) && (!q || c.name.toLowerCase().includes(q) || c.define.toLowerCase().includes(q)));
        if (!list.length) continue;
        el.appendChild(h('div.pad.muted.small', h('b', g.label), ` · ${list.length}`));
        for (const c of list) {
          if (++shown > 600) continue;
          const ds = cDiags(ctx, c), nw = ds.filter(d => d.severity === 'WARN').length;
          el.appendChild(h('div.npc.bx-row' + (st.sel === c.id ? '.sel' : ''), { on: { click: () => { st.sel = c.id; st.other = null; ctx.renderAll(false); } } },
            FRE.dds.picture(ctx, iconOf(c.item), { cls: '.bx-icon' }),
            h('div.bx-text', h('div.n', h('span', c.name), h('span', ctx.edited.has(keyOf(c.id)) ? h('span.tag.edit', 'edited') : null, nw ? h('span.tag.warn', '⚠' + nw) : null)),
              h('div.k', c.hard ? 'hard-coded' : `${c.slots.filter(s => s.on).length} stats · ${C().timeText(c.time)}${c.charged ? ' · cash' : ''}`))));
        }
      }
      if (shown > 600) el.appendChild(h('div.pad.muted', `${shown - 600} more: search to narrow the list.`));
      if (!shown) el.appendChild(h('div.pad.muted', 'No consumables match.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const c = st.sel === null ? null : model(ctx).byId.get(st.sel);
        if (!c) { el.appendChild(h('p.empty-state', 'Select a consumable on the left.')); return; }
        itemView(el, ctx, c);
      });
    },

    addTarget() { return { ok: false, title: 'Items are not added in this task' }; },
    locate(d, ctx) {
      if (d.module !== 'consumables') return false;
      const c = model(ctx).items.find(x => x.item.start === d.start);
      if (c) st.sel = c.id;
      return true;
    },
  };

  const edit = (ctx, c, splicesOf, label, mergeKey) =>
    ctx.editGroup(() => [{ file: SPEC, splices: splicesOf(ctx.ws.files.get(SPEC).text) }], label, [keyOf(c.id)], mergeKey);

  function itemView(el, ctx, c) {
    const m = model(ctx), edit_ = can(ctx) && !c.hard, { opts, words } = dstOptions(ctx), D = ctx.ws.defines.defines;
    const f = ctx.ws.files.get(SPEC);
    el.appendChild(h('div.npc-title', FRE.dds.picture(ctx, iconOf(c.item), { cls: '.bx-icon' }), h('h2', c.name), h('span.def', `${c.define} · ${c.id}`),
      can(ctx) ? null : h('span.tag.bad', 'read-only'), h('span.line', `Spec_Item.txt L${f.lineOf(c.item.start) + 1}`)));
    if (c.hard) {
      el.appendChild(h('p', `${c.name} has no stat slots: what it does is written in the game code: ${c.hard}. Only its time is data (dwCircleTime, seconds).`));
      const sec = c.circle;
      el.appendChild(h('div.dr-line', h('span', `Time now: ${(sec | 0) > 0 ? C().timeText(sec * 1000) : 'none'}.`),
        can(ctx) ? numInput({ value: (sec | 0) > 0 ? +(sec / (UNITS[st.unit] / 1000)).toFixed(3) : 0, min: 0, step: 'any', key: `csc|${c.id}|${st.unit}`,
          onCommit: v => { if (v === null) return; const n = Math.round(v * UNITS[st.unit] / 1000); if (n === sec || n < 1) return;
            edit(ctx, c, t => O().setCircle(t, c, n, ctx.ws.defines.defines), `${c.name}: time ${C().timeText(n * 1000)} (was ${C().timeText(sec * 1000)})`, `csc|${c.id}`); } }) : null,
        can(ctx) ? h('select', { on: { change: e => { st.unit = e.target.value; ctx.renderAll(false); } } },
          Object.keys(UNITS).map(u => h('option', { value: u, selected: u === st.unit }, { s: 'seconds', min: 'minutes', h: 'hours', d: 'days' }[u]))) : null));
      el.appendChild(h('p.muted.small', "Players see what it gives when they hover its buff icon (V19 fix 2026-10-15). The description below is what the inventory tooltip shows."));
    }
    if (!c.hard) el.appendChild(h('p.muted.small', `${PATH[c.path] || c.path}${c.charged ? ' · cash item' : ''}. `,
      c.path === 'food' ? 'Food and potions heal at once; the 🧪 panel does not model them. ' : '',
      'Buff items show only their name and description in game: players do not see these numbers in the tooltip. After saving: Stop / Start Server.bat.'));

    // stats (not for a hard-coded item: it has none)
    if (!c.hard) {
    el.appendChild(h('h3', 'Stats (6 slots)'));
    const tb = h('table.items.rt', h('tr', h('th', 'Slot'), h('th', 'Stat'), h('th', 'Amount'), h('th', 'Players get'), h('th', '')));
    for (const s of c.slots) {
      const label = `${c.name}: slot ${s.i}`;
      tb.appendChild(h('tr', h('td', h('b', String(s.i))),
        h('td', edit_ ? FRE.ui.combo({ options: opts, value: s.on ? s.dst : 0, placeholder: 'Pick a stat', wordStart: true,
          onPick: v => { if (v === (s.on ? s.dst : 0)) return;
            edit(ctx, c, t => O().setSlot(t, c, s.i, v ? { dstName: ctx.ws.defines.byValue('DST_', v), adj: s.on ? s.adj : 1 } : null, D),
              v ? `${label} ${dstLabel(ctx, words, v)}${s.on ? ` (was ${dstLabel(ctx, words, s.dst)})` : ''}` : `${label} emptied (was ${dstLabel(ctx, words, s.dst)})`); } })
          : (s.on ? dstLabel(ctx, words, s.dst) : '—')),
        h('td', s.on ? numInput({ value: s.adj, min: -2147483647, max: 2147483647, disabled: !edit_, key: `cs|${c.id}|${s.i}`,
          onCommit: v => { if (v === null || v === s.adj) return;
            edit(ctx, c, t => O().setSlot(t, c, s.i, { dstName: ctx.ws.defines.byValue('DST_', s.dst), adj: v }, D), `${label} ${dstLabel(ctx, words, s.dst)} ${v} (was ${s.adj})`, `cs|${c.id}|${s.i}`); } }) : ''),
        h('td', s.on ? valText(ctx, words, s.dst, s.adj) : h('span.muted', 'empty')),
        h('td', edit_ && s.on ? h('button.icon.danger', { title: 'Empty this slot', on: { click: () => edit(ctx, c, t => O().setSlot(t, c, s.i, null, D), `${label} emptied (was ${dstLabel(ctx, words, s.dst)})`) } }, '✕') : null)));
    }
    el.appendChild(tb);

    // buff time
    if (c.path !== 'food' && !c.hard) {
      const ms = c.time >>> 0, unit = UNITS[st.unit], shown = (ms | 0) >= 0 && ms !== 999999999 ? +(ms / unit).toFixed(3) : null;
      el.appendChild(h('h3', 'Buff time'));
      el.appendChild(h('div.dr-line', h('span', `Now: ${C().timeText(ms)}.`),
        edit_ ? numInput({ value: shown === null ? 0 : shown, min: 0, max: Math.floor(2147483647 / unit), step: 'any', key: `cst|${c.id}|${st.unit}`,
          onCommit: v => { if (v === null) return; const n = Math.round(v * unit); if (n === ms) return;
            edit(ctx, c, t => O().setTime(t, c, n, D), `${c.name}: time ${C().timeText(n)} (was ${C().timeText(ms)})`, `cst|${c.id}`); } }) : null,
        edit_ ? h('select', { on: { change: e => { st.unit = e.target.value; ctx.renderAll(false); } } },
          Object.keys(UNITS).map(u => h('option', { value: u, selected: u === st.unit }, { s: 'seconds', min: 'minutes', h: 'hours', d: 'days' }[u]))) : null,
        edit_ ? h('button', { title: 'Never runs out (999999999: the buff cannot be removed)', on: { click: () => edit(ctx, c, t => O().setTime(t, c, 999999999, D), `${c.name}: permanent (was ${C().timeText(ms)})`) } }, 'Permanent') : null));
      el.appendChild(h('p.muted.small', 'Using the same item again restarts its timer at the full time (it does not add up), and its stats are not added twice.'));
    }

    }

    // name + description (propItem.txt.txt, + its Client copy): the description is the only place players read what it gives
    {
      const ws = ctx.ws, PT = 'propitem.txt.txt', CK = FRE.coupleChecks, CO = FRE.coupleOps;
      const editText = ctx.ws.isEditable(PT) && ws.files.has(PT);
      const nameKey = CK.keyOf(ws, c.item, 'szName'), descKey = CK.keyOf(ws, c.item, 'szCommand');
      const nameMeta = CK.textLine(ws, nameKey), descMeta = CK.textLine(ws, descKey);
      const desc = CK.descOf(ws, c.item) || '', auto = O().describe(c, words);
      const putText = (key, v, max, label, mk) => ctx.editGroup(() => [{ file: PT, splices: CO.setText(CK.textLine(ws, key), v, max) }], label, [keyOf(c.id)], mk);
      el.appendChild(h('h3', 'Name and description'));
      el.appendChild(h('div.dr-line', h('span', 'Name'), textInput({ value: c.name, key: `csn|${c.id}`, disabled: !editText || !nameMeta, max: 63,
        onCommit: v => putText(nameKey, v, 63, `${c.name}: name "${v}"`, `csn|${c.id}`) })));
      el.appendChild(h('div.dr-line', h('span', 'Description'), textInput({ value: desc, key: `csd|${c.id}`, disabled: !editText || !descMeta, max: 255, width: '28em',
        onCommit: v => putText(descKey, v, 255, `${c.name}: description`, `csd|${c.id}`) }),
        h('button', { disabled: !editText || !descMeta || !auto || auto === desc, title: auto === desc ? 'The description already says this' : `Write: ${auto}`,
          on: { click: () => putText(descKey, auto, 255, `${c.name}: description written from the stats`) } }, FRE.ui.pencil(), ' Write description from stats')));
      if (descKey && /^IDS_/.test(descKey) && !descMeta) el.appendChild(h('p.small.muted', `The description key ${descKey} is not in propItem.txt.txt.`));
      if (auto && desc && auto !== desc) el.appendChild(h('p.small.warn-text', `⚠ Check the description: the stats give "${auto}"`));
    }

    // what players see
    el.appendChild(h('h3', 'What players see (the item tooltip)'));
    const tt = FRE.itemTooltip.build(ctx.ws, c.item), box = h('div.bx-tt.se-tt');
    for (const line of tt.game) box.appendChild(h('div', line.map(p => h('span', { style: `color:${p.color}${p.bold ? ';font-weight:bold' : ''}` }, p.text))));
    if (tt.editor.length) { box.appendChild(h('hr')); for (const line of tt.editor) box.appendChild(h('div', line.map(p => h('span', { style: `color:${p.color}` }, p.text)))); }
    el.appendChild(box);

    // 🧪 use it
    if (c.path !== 'food' && !c.hard) {
      const env = Sim().envFor(ctx.ws), others = m.items.filter(x => x.id !== c.id && x.path && x.path !== 'food' && (x.k3 === c.k3 || (c.path === 'balloon' && x.path === 'balloon')));
      el.appendChild(h('h3', '🧪 Use it'));
      const steps = [['use', c.id]], tm = (c.time | 0) > 0 && c.time !== 999999999 ? c.time : 0;
      const once = Sim().run(env, steps, Math.max(1, c.minLv | 0));
      const rows = h('table.items.rt', h('tr', h('th', 'What happens'), h('th', 'Result')));
      const sl = p => Sim().statList(p).map(([d, a]) => `${dstLabel(ctx, words, d)} ${valText(ctx, words, d, a)}`).join(', ') || 'no stats';
      rows.appendChild(h('tr', h('td', 'Use it'), h('td', once.results[0].ok ? `${sl(once.p)}${once.p.instant.length ? `; at once: ${once.p.instant.map(i => `${dstLabel(ctx, words, i.dst)} ${i.adj === -1 ? 'refilled' : valText(ctx, words, i.dst, i.adj)}`).join(', ')}` : ''}${once.p.log.length ? ` (${once.p.log.join('; ')})` : ''}` : WHY[once.results[0].why])));
      const twice = Sim().run(env, [['use', c.id], ['tick', Math.floor(tm / 2)], ['use', c.id]], Math.max(1, c.minLv | 0));
      const r2 = twice.results[1], b2 = Sim().buffList(twice.p).find(b => b[0] === c.id);
      rows.appendChild(h('tr', h('td', 'Use it again half-way'), h('td', r2.ok ? `${sl(twice.p)}; time left ${b2 ? C().timeText(b2[2]) : '—'}` : WHY[r2.why])));
      if (tm) {
        const end = Sim().run(env, [['use', c.id], ['tick', tm]], Math.max(1, c.minLv | 0));
        rows.appendChild(h('tr', h('td', `After ${C().timeText(tm)}`), h('td', Sim().statList(end.p).length ? `leftover: ${sl(end.p)}` : 'the stats are gone')));
      }
      if (others.length) {
        const pick = others.find(x => x.id === st.other) || others[0];
        const both = Sim().run(env, [['use', pick.id], ['use', c.id]], Math.max(1, c.minLv | 0));
        rows.appendChild(h('tr', h('td', h('span', 'With ', h('select', { on: { change: e => { st.other = Number(e.target.value); ctx.renderAll(false); } } },
          others.slice(0, 200).map(x => h('option', { value: x.id, selected: x.id === pick.id }, x.name))), ' on first')),
          h('td', both.results[1].ok ? `works: ${sl(both.p)}` : WHY[both.results[1].why])));
      }
      el.appendChild(rows);
    }
    const ds = cDiags(ctx, c);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  FRE.ui.modules.push(mod);
  FRE.ui.consumables = { itemView };
})(globalThis.FRE = globalThis.FRE || {});
