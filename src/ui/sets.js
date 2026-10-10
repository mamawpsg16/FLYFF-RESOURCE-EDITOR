// Set Effects (task G part 1): the item sets of propItemEtc.inc (pieces + the bonus each piece count gives), their names
// (propItemEtc.txt.txt) and the +N armor bonus of expTable.inc. Pick a set, change its pieces and bonuses, see the tooltip
// players get with 0..N pieces worn, and 🧍 Try it (loaders/sets-sim.js: putting pieces on one by one vs after a relog).
// Edits: edit/sets-ops.js. User decisions (2026-10-10): both kinds of set bonus; edit existing sets + "+ New set";
// weapon effects later (G part 2).
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput, toast, keepFocus } = FRE.dom;
  const { diagTags, fieldLabel, formFooter, diagRow, pencil } = FRE.ui;
  const ETC = 'propitemetc.inc', TXT = 'propitemetc.txt.txt', EXP = 'exptable.inc';
  const PLUS = '__plus';
  const st = { sel: null, show: 'all', worn: null, tryState: null };
  const S = () => FRE.sets, O = () => FRE.setsOps, Sim = () => FRE.setsSim;
  const model = ctx => ctx.ws.models.sets;
  const can = (ctx, f) => ctx.ws.isEditable(f);
  const sDiags = ctx => ctx.ws.diags.filter(d => d.module === 'sets');
  const keyOf = id => `sets|${id}`;
  const setOf = (ctx, id) => (id === null || id === PLUS ? null : model(ctx).sets.find(s => s.id === id && model(ctx).byId.get(id) === s) || model(ctx).sets.find(s => s.id === id) || null);
  const inSet = (d, s) => d.file && d.file.toLowerCase() === ETC && d.start >= s.start && d.start <= (s.end || s.start);
  const setDiags = (ctx, s) => sDiags(ctx).filter(d => inSet(d, s) || (s.nameSpan && d.file && d.file.toLowerCase() === ETC && d.start === s.nameSpan.start));
  const spanDiags = (ctx, a, b) => sDiags(ctx).filter(d => d.file && d.file.toLowerCase() === ETC && d.start >= a && d.start < Math.max(b, a + 1));
  const plusDiags = ctx => sDiags(ctx).filter(d => d.file && d.file.toLowerCase() === EXP);
  const itemOf = (ctx, id) => ctx.ws.itemById(id);
  const nameOf = (ctx, id, fb) => { const it = itemOf(ctx, id); return it && it.name ? it.name : fb || String(id >>> 0); };
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const partName = (ctx, v) => ctx.ws.defines.byValue('PARTS_', v) || String(v);
  const partWord = (ctx, v) => S().PART_WORD[partName(ctx, v)] || partName(ctx, v);
  // the game's tooltip colours (WndManager.cpp:642-646, the dark tooltip)
  const COLOR = { name: '#ffffff', worn: '#01ab19', bag: '#ffc800', none: '#b2b2b2', active: '#ff9d00', inactive: '#b2b2b2' };

  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws);
    const opts = [];
    for (const [v, w] of [...words].sort((a, b) => (a[1].word || a[1].define).localeCompare(b[1].word || b[1].define)))
      opts.push({ v, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}` });
    return { opts, words };
  }
  const dstLabel = (words, v) => { const w = words.get(v); return w ? `${(w.word || '').replace(/[:\s]+$/, '') || w.define}` : `stat ${v}`; };
  const dstText = (words, v, adj) => { const w = words.get(v); return `${dstLabel(words, v)} ${adj >= 0 ? '+' : ''}${adj}${w && w.rate ? '%' : ''}`; };
  const itemOptsOf = ws => (ws._itemOpts = ws._itemOpts || [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, z) => a.name.localeCompare(z.name))
    .map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define })));
  const itemOfDefine = (ws, d) => { const D = ws.defines.defines; return d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; };
  // the slots an item can be worn in (dwParts; rings / earrings: either one), as PARTS_ names
  const slotsOfItem = (ctx, it) => (it ? Sim().slotsOf(Sim().envFor(ctx.ws, model(ctx)), it.id).map(v => partName(ctx, v)) : []);
  // the lowest level and the job(s) of a set's pieces (list filter text)
  function setMeta(ctx, s) {
    let lv = null; const jobs = new Set();
    for (const p of s.elems) {
      const it = itemOf(ctx, p.id); if (!it) continue;
      const info = ctx.ws.itemInfo(it);
      if (info.level > 0 && info.level < 1000 && (lv === null || info.level < lv)) lv = info.level;
      if (info.jobName) jobs.add(FRE.ui.pretty(info.jobName));
    }
    return { lv, jobs: [...jobs] };
  }

  const SHOW = [
    { v: 'all', label: 'All sets', test: () => true },
    { v: 'armor', label: 'Armor (+N bonus parts)', test: (s, ctx) => s.elems.some(p => ['PARTS_UPPER_BODY', 'PARTS_CAP'].includes(partName(ctx, p.part))) },
    { v: 'fashion', label: 'Fashion', test: (s, ctx) => s.elems.some(p => ['PARTS_HAT', 'PARTS_CLOTH', 'PARTS_GLOVE', 'PARTS_BOOTS'].includes(partName(ctx, p.part))) },
    { v: 'jewelry', label: 'Jewelry', test: (s, ctx) => s.elems.some(p => /RING|EARRING|NECKLACE/.test(partName(ctx, p.part))) },
    { v: 'problems', label: 'With problems', test: (s, ctx) => setDiags(ctx, s).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (s, ctx) => ctx.edited.has(keyOf(s.id)) },
  ];

  const mod = {
    id: 'sets', label: 'Set Effects', searchPlaceholder: 'Search sets or pieces', noItems: true,
    help: 'Set Effects: what each item set gives for 2, 3, 4… pieces worn (propItemEtc.inc), and the +N armor bonus (expTable.inc)',
    st,
    onLoad() { st.sel = null; st.show = 'all'; st.worn = null; st.tryState = null; },

    listAction(ctx) {
      const ok = ctx.ws && can(ctx, ETC) && can(ctx, TXT);
      return h('button.primary', { disabled: !ok, title: ok ? 'Make a new set: its name, pieces and bonuses' : 'Needs propItemEtc.inc and propItemEtc.txt.txt (editable)',
        on: { click: () => newSetForm(ctx) } }, '+ New set');
    },

    listExtra(ctx) {
      const all = model(ctx).sets;
      return h('select.npc-filter', { title: 'Which sets to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${all.filter(s => o.test(s, ctx)).length})`)));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      // the +N armor bonus first
      if (!q || '+n armor bonus'.includes(q)) {
        const ds = plusDiags(ctx), b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === PLUS ? '.sel' : ''), { on: { click: () => { st.sel = PLUS; ctx.renderAll(false); } } },
          h('div.n', h('span', '+N armor bonus'), h('span', ctx.edited.has(keyOf(PLUS)) ? h('span.tag.edit', 'edited') : null, b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', m.hasExp ? 'expTable.inc: full armor set at +1…+10' : 'expTable.inc not found')));
      }
      let shown = 0;
      for (const s of m.sets) {
        if (!test(s, ctx)) continue;
        if (q && !s.name.toLowerCase().includes(q) && !String(s.id).includes(q) && !s.elems.some(p => nameOf(ctx, p.id, p.define).toLowerCase().includes(q) || (p.define || '').toLowerCase().includes(q))) continue;
        if (++shown > 600) continue;
        const ds = setDiags(ctx, s), nb = ds.filter(d => d.severity === 'BLOCK').length, nw = ds.filter(d => d.severity === 'WARN').length;
        const meta = setMeta(ctx, s), first = s.elems[0] ? itemOf(ctx, s.elems[0].id) : null;
        el.appendChild(h('div.npc.bx-row' + (st.sel === s.id ? '.sel' : ''), { on: { click: () => { st.sel = s.id; st.worn = null; st.tryState = null; ctx.renderAll(false); } } },
          FRE.dds.picture(ctx, iconOf(first), { cls: '.bx-icon' }),
          h('div.bx-text', h('div.n', h('span', s.name), h('span', ctx.edited.has(keyOf(s.id)) ? h('span.tag.edit', 'edited') : null,
            nb ? h('span.tag.bad', '⛔' + nb) : nw ? h('span.tag.warn', '⚠' + nw) : null)),
          h('div.k', `${s.elems.length} piece${s.elems.length === 1 ? '' : 's'}${meta.lv ? ` · Lv ${meta.lv}` : ''}${meta.jobs.length ? ` · ${meta.jobs.slice(0, 2).join(', ')}` : ''} · set ${s.id}`))));
      }
      if (shown > 600) el.appendChild(h('div.pad.muted', `${shown - 600} more: search to narrow the list.`));
      if (!shown && st.show !== 'all') el.appendChild(h('div.pad.muted', 'No sets match.'));
    },

    renderEditor(el, ctx) {
      const m = model(ctx);
      if (m.hang) el.appendChild(h('div.banner.bad', `Set ${m.hang.set.id} has the word "${m.hang.word}" where only Elem / Avail may stand: the server and the game hang at startup. See the problems list.`));
      keepFocus(el, () => {
        if (st.sel === PLUS) return plusView(el, ctx);
        const s = setOf(ctx, st.sel);
        if (!s) { el.appendChild(h('p.empty-state', 'Select a set on the left, or the +N armor bonus.')); return; }
        setView(el, ctx, s);
      });
    },

    addTarget(ctx) {
      const s = setOf(ctx, st.sel);
      if (!s) return { ok: false, title: 'Select a set on the left first' };
      if (!can(ctx, ETC)) return { ok: false, title: 'propItemEtc.inc is read-only' };
      return { ok: true, usesPrice: false, title: `Add a piece to ${s.name}`, add(info) { pieceForm(ctx, s, null, info.define); } };
    },

    locate(d, ctx) {
      if (d.module !== 'sets') return false;
      if (d.file && d.file.toLowerCase() === EXP) { st.sel = PLUS; return true; }
      const s = model(ctx).sets.find(x => inSet(d, x));
      if (s) st.sel = s.id;
      return true;
    },
  };

  // ------------------------------------------------------------- one set
  function setView(el, ctx, s) {
    const ws = ctx.ws, m = model(ctx), edit_ = can(ctx, ETC), f = ws.files.get(ETC);
    const { opts, words } = dstOptions(ctx);
    const key = keyOf(s.id);
    el.appendChild(h('div.npc-title', h('h2', s.name), h('span.def', `SetItem ${s.id} · ${s.nameKey}`),
      can(ctx, TXT) ? h('button.icon', { title: 'Edit the set name', on: { click: () => renameForm(ctx, s) } }, pencil()) : null,
      edit_ ? null : h('span.tag.bad', 'read-only'), h('span.line', `propItemEtc.inc L${f.lineOf(s.start) + 1}`)));
    if (m.byId.get(s.id) !== s) el.appendChild(h('div.banner.warn', `Another set has id ${s.id} before this one: the tooltip lists that set's worn pieces.`));
    el.appendChild(h('p.muted.small', 'The bonuses add up: wearing 4 pieces gives every row for 2, 3 and 4 pieces. Rows of the same stat are added. ',
      'Players see the set in each piece\'s tooltip (every tier listed, bright once reached). After saving: Stop / Start Server.bat.'));

    // pieces
    el.appendChild(h('h3', `Pieces (${s.elems.length} of ${S().MAX_ELEM})`));
    const pt = h('table.items.rt', h('tr', h('th', ''), h('th', 'Item'), h('th', 'Worn in'), h('th', 'Level / job'), h('th', '')));
    s.pieces.forEach((p, j) => {
      const it = itemOf(ctx, p.id), info = it ? ws.itemInfo(it) : null;
      pt.appendChild(h('tr' + (p.kept ? '' : '.muted'),
        h('td', FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' })), FRE.ui.itemCell(info, p.define || p.id),
        h('td', partWord(ctx, p.part), h('span.def.block', partName(ctx, p.part))),
        h('td', info ? `${info.level > 0 && info.level < 1000 ? 'Lv ' + info.level : ''}${info.jobName ? ' · ' + FRE.ui.pretty(info.jobName) : ''}` : ''),
        h('td', diagTags(spanDiags(ctx, p.start, p.end)), p.kept ? null : h('span.tag.warn', 'dropped (9th+)'),
          edit_ ? h('button.icon', { title: 'Change this piece', on: { click: () => pieceForm(ctx, s, p) } }, pencil()) : null,
          edit_ ? h('button.icon.danger', { title: 'Remove this piece', on: { click: () => ctx.edit(ETC, t => O().removePiece(t, p), `${s.name}: removed piece ${nameOf(ctx, p.id, p.define)}`, key) } }, '✕') : null)));
    });
    el.appendChild(pt);
    el.appendChild(h('div.dr-line', h('button', { disabled: !edit_ || s.pieces.length >= S().MAX_ELEM, title: s.pieces.length >= S().MAX_ELEM ? 'A set holds 8 pieces' : 'Add a piece',
      on: { click: () => pieceForm(ctx, s, null) } }, '+ Add piece')));

    // bonuses by piece count
    el.appendChild(h('h3', `Bonuses (${s.rows.length} of ${S().MAX_AVAIL} rows)`));
    const needs = [...new Set(s.rows.map(r => r.need))].sort((a, b) => a - b);
    const bt = h('table.items.rt', h('tr', h('th', 'Pieces worn'), h('th', 'Stat'), h('th', 'Amount'), h('th', 'Pieces needed'), h('th', '')));
    for (const n of needs) for (const r of s.rows.filter(x => x.need === n)) {
      const label = `${s.name}: ${dstText(words, r.dst, r.adj)} (${r.need} pieces)`;
      bt.appendChild(h('tr' + (r.kept ? '' : '.muted'), h('td', h('b', `${n} piece${n === 1 ? '' : 's'}`)),
        h('td', edit_ ? FRE.ui.combo({ options: opts, value: r.dst, placeholder: 'Pick a stat', wordStart: true,
          onPick: v => { if (!v) return; ctx.edit(ETC, () => O().setRow(r, { dst: v, dstName: ws.defines.byValue('DST_', v) }), `${s.name}: ${dstLabel(words, r.dst)} → ${dstLabel(words, v)} (${r.need} pieces)`, key); } }) : dstLabel(words, r.dst)),
        h('td', numInput({ value: r.adj, min: -2147483647, max: 2147483647, disabled: !edit_, key: `se|${s.id}|${r.start}|adj`,
          onCommit: v => { if (v === null) return; ctx.editGroup(() => [{ file: ETC, splices: O().setRow(r, { adj: v }) }], `${s.name}: ${dstLabel(words, r.dst)} ${v} (was ${r.adj})`, [key], `se|${s.id}|${r.start}|adj`); } }),
          words.get(r.dst) && words.get(r.dst).rate ? ' %' : ''),
        h('td', numInput({ value: r.need, min: 1, max: S().MAX_ELEM, disabled: !edit_, key: `se|${s.id}|${r.start}|need`,
          onCommit: v => { if (v === null) return; ctx.editGroup(() => [{ file: ETC, splices: O().setRow(r, { need: v }) }], `${s.name}: ${dstLabel(words, r.dst)} needs ${v} pieces (was ${r.need})`, [key], `se|${s.id}|${r.start}|need`); } })),
        h('td', diagTags(spanDiags(ctx, r.start, r.end)), r.kept ? null : h('span.tag.warn', 'dropped (33rd+)'),
          edit_ ? h('button.icon.danger', { title: 'Remove this bonus', on: { click: () => ctx.edit(ETC, t => O().removeRow(t, r), `${label}: removed`, key) } }, '✕') : null)));
    }
    el.appendChild(bt);
    el.appendChild(h('div.dr-line', h('button', { disabled: !edit_ || s.rows.length >= S().MAX_AVAIL, on: { click: () => bonusForm(ctx, s) } }, '+ Add bonus')));

    tooltipView(el, ctx, s);
    tryView(el, ctx, s);
    const ds = setDiags(ctx, s);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // "What players see": PutSetItemOpt for a player wearing the first N pieces (slider), hovering the first piece
  function tooltipLines(ctx, s, worn, model_) {
    const env = Sim().envFor(ctx.ws, model_ || model(ctx));
    const steps = s.elems.slice(0, worn).map(p => [p.part, { id: p.id, plus: 0, expired: false }]);
    const ch = Sim().wear(env, steps);
    return Sim().tooltip(env, ch, s.elems.length ? s.elems[0].id : 0, new Map());
  }
  function renderTooltip(lines) {
    const box = h('div.bx-tt.se-tt');
    for (const l of lines) for (const part of l.text.split('\n').slice(1)) box.appendChild(h('div', { style: `color:${COLOR[l.color] || '#fff'}` }, part || ' '));
    return box;
  }
  function tooltipView(el, ctx, s) {
    if (!s.elems.length) return;
    const n = st.worn === null ? s.elems.length : Math.min(st.worn, s.elems.length);
    el.appendChild(h('h3', 'What players see (the piece tooltip)'));
    const slider = h('input', { type: 'range', min: 0, max: s.elems.length, value: n, on: { input: e => { st.worn = Number(e.target.value); ctx.renderAll(false); } } });
    el.appendChild(h('div.dr-line', h('span', 'Pieces worn:'), slider, h('b', `${n} of ${s.elems.length}`), h('span.muted.small', ' (the first pieces in the list, each in its own slot)')));
    el.appendChild(renderTooltip(tooltipLines(ctx, s, n)));
  }

  // 🧍 Try it: tick the worn pieces, their +N and expired flags -> totals putting them on in list order, and after a relog
  function tryView(el, ctx, s) {
    const ws = ctx.ws, env = Sim().envFor(ws, model(ctx)), { words } = dstOptions(ctx);
    if (!st.tryState || st.tryState.id !== s.id || st.tryState.rows.length !== s.elems.length)
      st.tryState = { id: s.id, rows: s.elems.map(p => ({ on: true, plus: 0, expired: false, slot: p.part })) };
    const T = st.tryState;
    el.appendChild(h('h3', '🧍 Try it: what a character gets'));
    el.appendChild(h('p.muted.small', 'The server adds set bonuses in two ways: when a piece is put on (only pieces in their listed slot count, and only the rows for exactly that count are added) and at login (every worn piece counts). Normally both agree; a wrong slot makes them differ.'));
    const tb = h('table.items.rt', h('tr', h('th', 'Worn'), h('th', 'Piece'), h('th', 'Slot'), h('th', '+N'), h('th', 'Expired')));
    s.elems.forEach((p, j) => {
      const r = T.rows[j], slots = Sim().slotsOf(env, p.id);
      const slotSel = h('select', { on: { change: e => { r.slot = Number(e.target.value); ctx.renderAll(false); } } },
        [...new Set([p.part, ...slots])].map(v => h('option', { value: v, selected: v === r.slot }, partWord(ctx, v))));
      tb.appendChild(h('tr', h('td', h('input', { type: 'checkbox', checked: r.on, on: { change: e => { r.on = e.target.checked; ctx.renderAll(false); } } })),
        h('td', nameOf(ctx, p.id, p.define)), h('td', slotSel),
        h('td', h('select', { on: { change: e => { r.plus = Number(e.target.value); ctx.renderAll(false); } } },
          Array.from({ length: 21 }, (_, k) => h('option', { value: k, selected: k === r.plus }, `+${k}`)))),
        h('td', h('input', { type: 'checkbox', checked: r.expired, on: { change: e => { r.expired = e.target.checked; ctx.renderAll(false); } } }))));
    });
    el.appendChild(tb);
    const steps = s.elems.map((p, j) => [T.rows[j].slot, T.rows[j].on ? { id: p.id, plus: T.rows[j].plus, expired: T.rows[j].expired } : null]).filter(x => x[1]);
    const ch = Sim().wear(env, steps), lg = Sim().login(env, ch.worn);
    const all = new Set([...ch.stats.keys(), ...lg.stats.keys()]);
    const res = h('table.items.rt', h('tr', h('th', 'Stat'), h('th', 'Putting the pieces on'), h('th', 'After a relog')));
    for (const d of [...all].sort((a, b) => a - b)) {
      const a = ch.stats.get(d) || 0, b = lg.stats.get(d) || 0, rate = words.get(d) && words.get(d).rate ? '%' : '';
      res.appendChild(h('tr' + (a !== b ? '.warn-row' : ''), h('td', dstLabel(words, d)), h('td', `${a >= 0 ? '+' : ''}${a}${rate}`), h('td', `${b >= 0 ? '+' : ''}${b}${rate}`, a !== b ? h('span.tag.warn', 'differs') : null)));
    }
    if (!all.size) res.appendChild(h('tr', h('td', { colspan: 3 }, h('span.muted', 'Nothing yet.'))));
    el.appendChild(res);
    const n = Sim().getSetItem(env, ch, null);
    el.appendChild(h('p.small', n > 0 ? `+N armor bonus: suit, gauntlets, boots and helmet all worn, the lowest is +${n}: ${n > 10 ? 'nothing (only +1 to +10 give a bonus)' : plusText(model(ctx).plus, n)}.`
      : '+N armor bonus: needs suit, gauntlets, boots and helmet all worn (not expired) at +1 or more.'));
  }
  function plusText(plus, n) {
    const r = S().plusRow(plus, n);
    if (!r) return 'nothing';
    const parts = [];
    if (r.hit) parts.push(`Hit Rate +${r.hit}%`);
    if (r.block) parts.push(`Block +${r.block}% (melee and range)`);
    if (r.hp) parts.push(`Max HP +${r.hp}%`);
    if (r.magic) parts.push(`Magic attack +${r.magic}`);
    if (r.added) parts.push(`STR, DEX, INT, STA +${r.added}`);
    return parts.join(', ') || 'nothing';
  }

  // ------------------------------------------------------------- +N armor bonus
  function plusView(el, ctx) {
    const m = model(ctx), P = m.plus, edit_ = can(ctx, EXP);
    el.appendChild(h('div.npc-title', h('h2', '+N armor bonus'), h('span.def', 'expTable.inc · Setitem'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (!m.hasExp) { el.appendChild(h('p.empty-state', 'expTable.inc is not in Server/Resource.')); return; }
    el.appendChild(h('p.muted.small', 'A character wearing a suit, gauntlets, boots AND a helmet (any set, none expired) gets the row of the LOWEST +N among the four. ',
      'Only +1 to +10 have a row. "Added" goes to STR, DEX, INT and STA each; "Block" to melee and range block. The game reads its own copy for the character window.'));
    if (!P.found) { el.appendChild(h('p', 'expTable.inc has no Setitem table.')); return; }
    const COLS = [['hit', 'Hit Rate %'], ['block', 'Block %'], ['hp', 'Max HP %'], ['magic', 'Magic attack'], ['added', 'STR/DEX/INT/STA']];
    const tb = h('table.items.rt', h('tr', h('th', 'Lowest +N'), ...COLS.map(c => h('th', c[1])), h('th', 'Players get')));
    P.rows.forEach((r, i) => {
      tb.appendChild(h('tr' + (i >= 10 ? '.muted' : ''), h('td', h('b', `+${i + 1}`)),
        ...COLS.map(([c, label]) => h('td', numInput({ value: r[c], min: 0, max: 2147483647, disabled: !edit_ || i >= 10, key: `se|plus|${i}|${c}`,
          onCommit: v => { if (v === null) return; ctx.editGroup(() => [{ file: EXP, splices: O().setPlus(P, i, c, v) }], `+N armor bonus +${i + 1}: ${label} ${v} (was ${r[c]})`, [keyOf(PLUS)], `se|plus|${i}|${c}`); } }))),
        h('td.small', i >= 10 ? 'never used' : plusText(P, i + 1))));
    });
    el.appendChild(tb);
    const ds = plusDiags(ctx);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // ------------------------------------------------------------- forms
  function renameForm(ctx, s) {
    const ws = ctx.ws, body = h('div.nn-form'), checks = h('div'), preview = h('div');
    let name = s.name, btn = null;
    const plan = () => O().renamePlan(model(ctx), ws.files.get(ETC).text, ws.files.get(TXT).text, s, name);
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      let parts = null, err = null;
      try { parts = plan(); } catch (e) { err = e.message; }
      if (err) checks.appendChild(diagRow({ severity: 'BLOCK', code: '', message: err }));
      else if (!parts.length) checks.appendChild(diagRow({ severity: 'BLOCK', code: '', message: 'Nothing changed yet' }));
      else checks.appendChild(h('p.muted.small', 'No problems.'));
      if (btn) btn.disabled = !!err || !parts || !parts.length;
      if (parts && parts.length) {
        preview.appendChild(h('pre.preview', parts.length === 1 ? `propItemEtc.txt.txt (+ Client copy): ${s.nameKey}\t${name.trim()}`
          : `The key ${s.nameKey} is not this set's own line: a new key.\npropItemEtc.inc: SetItem ${s.id} ${parts[1].splices[0].insert.trim().split('\t')[0]}\npropItemEtc.txt.txt: +${parts[1].splices[0].insert.trim()}`));
        preview.appendChild(h('p', `Players see "${name.trim()} (worn/${s.elems.length})" in the tooltip of each piece.`));
      }
    }
    const input = h('input', { type: 'text', value: name, maxLength: S().MAX_NAME - 1, style: 'width:24em', on: { input: e => { name = e.target.value; refresh(); } } });
    body.appendChild(h('div.nn-row', fieldLabel('Name', true), input));
    formFooter({ checks, action: 'Apply changes', previewTitle: 'What will be written / what players see', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: `Edit name: ${s.name}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: 'Apply changes', cls: 'primary', id: 'se-ren-btn', onClick: () => ctx.editGroup(() => plan(), `Set ${s.id}: renamed to "${name.trim()}" (was "${s.name}")`, [keyOf(s.id)]) }] });
    btn = m.el.querySelector('#se-ren-btn');
    refresh();
  }

  // + Add piece / ✎ Edit piece: item, slot (from the item's dwParts)
  function pieceForm(ctx, s, p, define0) {
    const ws = ctx.ws, body = h('div.nn-form'), checks = h('div'), preview = h('div'), slotBox = h('span');
    const v = { define: p ? (p.define || null) : (define0 || null), part: p ? partName(ctx, p.part) : null };
    let btn = null;
    const plan = t => (p ? O().setPiece(p, { define: v.define, partName: v.part }) : O().addPiece(t, s, { define: v.define, partName: v.part }));
    function refresh() {
      checks.textContent = ''; preview.textContent = ''; slotBox.textContent = '';
      const it = itemOfDefine(ws, v.define), slots = slotsOfItem(ctx, it);
      if (it && (!v.part || (!p && !slots.includes(v.part)))) v.part = slots[0] || v.part;
      if (it) slotBox.appendChild(h('select', { on: { change: e => { v.part = e.target.value; refresh(); } } },
        [...new Set([...slots, v.part].filter(Boolean))].map(x => h('option', { value: x, selected: x === v.part }, `${S().PART_WORD[x] || x} (${x})`))));
      const probs = [];
      if (!v.define) probs.push(['BLOCK', 'Still needs: the item']);
      else if (!it) probs.push(['BLOCK', `${v.define} is not an item in Spec_Item.txt`]);
      if (it && v.part && !slots.includes(v.part)) probs.push(['WARN', `${it.name} is worn in ${slots.join(' / ')}: listed in ${v.part} it counts only after a relog`]);
      const other = it && model(ctx).byItem.get(it.id);
      if (other && other !== s) probs.push(['WARN', `${it.name} is in ${other.name} already: an item counts for the first set only`]);
      if (p && v.define === p.define && v.part === partName(ctx, p.part)) probs.push(['BLOCK', 'Nothing changed yet']);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(x => x[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', 'Pick an item first.')); return; }
      try {
        const sp = plan(ws.files.get(ETC).text), f = ws.files.get(ETC);
        preview.appendChild(h('pre.preview', `propItemEtc.inc (+ Client copy), line ${f.lineOf(sp[0].start) + 1}:\n${p ? '' : '+'}${O().pieceText({ define: v.define, partName: v.part })}`));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); if (btn) btn.disabled = true; }
    }
    body.appendChild(h('div.nn-row', fieldLabel('Item', true), h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOptsOf(ws), value: v.define, placeholder: 'Type an item name…', onPick: x => { v.define = x; v.part = null; refresh(); } }))));
    body.appendChild(h('div.nn-row', fieldLabel('Worn in', true), slotBox, h('span.muted.small', ' from the item (rings and earrings: either slot)')));
    formFooter({ checks, action: p ? 'Apply changes' : 'Add', previewTitle: 'What will be written', preview }).forEach(x => body.appendChild(x));
    const label = () => (p ? `${s.name}: piece ${nameOf(ctx, p.id, p.define)} → ${(itemOfDefine(ws, v.define) || {}).name || v.define}` : `${s.name}: added piece ${(itemOfDefine(ws, v.define) || {}).name || v.define}`);
    const m = modal({ title: p ? `Edit piece: ${nameOf(ctx, p.id, p.define)}` : `Add a piece: ${s.name}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: p ? 'Apply changes' : 'Add', cls: 'primary', id: 'se-pc-btn', onClick: () => ctx.edit(ETC, t => plan(t), label(), keyOf(s.id)) }] });
    btn = m.el.querySelector('#se-pc-btn');
    refresh();
  }

  function bonusForm(ctx, s) {
    const ws = ctx.ws, { opts, words } = dstOptions(ctx), body = h('div.nn-form'), checks = h('div'), preview = h('div');
    const v = { dst: null, adj: 1, need: Math.min(Math.max(2, s.elems.length), S().MAX_ELEM) };
    let btn = null;
    const plan = t => O().addRow(t, s, { dst: v.dst, dstName: ws.defines.byValue('DST_', v.dst), adj: v.adj, need: v.need });
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      const probs = [];
      if (!v.dst) probs.push(['BLOCK', 'Still needs: the stat']);
      if (!Number.isInteger(v.adj)) probs.push(['BLOCK', 'Still needs: the amount']);
      if (!(v.need >= 1)) probs.push(['BLOCK', 'Still needs: pieces needed (1-8)']);
      else if (v.need > new Set(s.elems.map(p => p.part)).size) probs.push(['WARN', `The set has ${new Set(s.elems.map(p => p.part)).size} slots to wear: ${v.need} pieces are never worn at once`]);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(x => x[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', 'Pick the stat first.')); return; }
      try {
        const sp = plan(ws.files.get(ETC).text), f = ws.files.get(ETC);
        preview.appendChild(h('pre.preview', `propItemEtc.inc (+ Client copy), line ${f.lineOf(sp[0].start) + 1}:\n+${O().rowText({ dstName: ws.defines.byValue('DST_', v.dst), adj: v.adj, need: v.need })}`));
        preview.appendChild(h('p', `With ${v.need} or more pieces worn: ${dstText(words, v.dst, v.adj)}.`));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); if (btn) btn.disabled = true; }
    }
    const row = (label, req, ...x) => h('div.nn-row', fieldLabel(label, req), ...x);
    body.appendChild(row('Stat', true, FRE.ui.combo({ options: opts, value: v.dst, placeholder: 'Pick a stat', wordStart: true, onPick: x => { v.dst = x || null; refresh(); } })));
    body.appendChild(row('Amount', true, numInput({ value: v.adj, min: -2147483647, max: 2147483647, key: 'se|add|adj', live: true, onCommit: x => { v.adj = x === null ? NaN : x; refresh(); } })));
    body.appendChild(row('Pieces needed', true, numInput({ value: v.need, min: 1, max: S().MAX_ELEM, key: 'se|add|need', live: true, onCommit: x => { v.need = x === null ? NaN : x; refresh(); } })));
    formFooter({ checks, action: 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: `Add a bonus: ${s.name}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: 'Add', cls: 'primary', id: 'se-row-btn', onClick: () => ctx.edit(ETC, t => plan(t), `${s.name}: added ${dstText(words, v.dst, v.adj)} (${v.need} pieces)`, keyOf(s.id)) }] });
    btn = m.el.querySelector('#se-row-btn');
    refresh();
  }

  // + New set: name, 1-8 pieces, bonus rows; Create = both files in one undo step
  function newSetForm(ctx) {
    const ws = ctx.ws, { opts, words } = dstOptions(ctx);
    const s = { name: '', pieces: [{ define: null, part: null }, { define: null, part: null }], rows: [{ dst: null, adj: 1, need: 2 }] };
    const body = h('div.nn-form'), list = h('div'), rowsBox = h('div'), checks = h('div'), preview = h('div');
    let btn = null;
    const spec = () => ({ name: s.name, pieces: s.pieces.filter(p => p.define).map(p => ({ define: p.define, partName: p.part })),
      rows: s.rows.filter(r => r.dst).map(r => ({ dst: r.dst, dstName: ws.defines.byValue('DST_', r.dst), adj: r.adj, need: r.need })) });
    const plan = () => O().newSetPlan(model(ctx), ws.files.get(ETC).text, ws.files.get(TXT).text, spec());
    function drawPieces() {
      list.textContent = '';
      s.pieces.forEach((p, j) => {
        const it = itemOfDefine(ws, p.define), slots = slotsOfItem(ctx, it);
        if (it && !slots.includes(p.part)) p.part = slots[0] || null;
        list.appendChild(h('div.nn-row', fieldLabel(`Piece ${j + 1}`, j === 0),
          h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOptsOf(ws), value: p.define, placeholder: 'Type an item name…', onPick: x => { p.define = x; p.part = null; drawPieces(); refresh(); } })),
          it ? h('select', { on: { change: e => { p.part = e.target.value; refresh(); } } }, slots.map(x => h('option', { value: x, selected: x === p.part }, S().PART_WORD[x] || x))) : null,
          h('button.icon.danger', { title: 'Remove', disabled: s.pieces.length <= 1, on: { click: () => { s.pieces.splice(j, 1); drawPieces(); refresh(); } } }, '✕')));
      });
      list.appendChild(h('div.dr-line', h('button', { disabled: s.pieces.length >= S().MAX_ELEM, on: { click: () => { s.pieces.push({ define: null, part: null }); drawPieces(); refresh(); } } }, '+ Piece')));
    }
    function drawRows() {
      rowsBox.textContent = '';
      s.rows.forEach((r, j) => rowsBox.appendChild(h('div.nn-row', fieldLabel(`Bonus ${j + 1}`, false),
        FRE.ui.combo({ options: opts, value: r.dst, placeholder: 'Pick a stat', wordStart: true, onPick: x => { r.dst = x || null; refresh(); } }),
        numInput({ value: r.adj, min: -2147483647, max: 2147483647, key: `se|new|adj${j}`, live: true, onCommit: x => { r.adj = x === null ? NaN : x; refresh(); } }),
        h('span', 'with'), numInput({ value: r.need, min: 1, max: S().MAX_ELEM, key: `se|new|need${j}`, live: true, onCommit: x => { r.need = x === null ? NaN : x; refresh(); } }), h('span', 'pieces'),
        h('button.icon.danger', { title: 'Remove', on: { click: () => { s.rows.splice(j, 1); drawRows(); refresh(); } } }, '✕'))));
      rowsBox.appendChild(h('div.dr-line', h('button', { disabled: s.rows.length >= S().MAX_AVAIL, on: { click: () => { s.rows.push({ dst: null, adj: 1, need: 2 }); drawRows(); refresh(); } } }, '+ Bonus')));
    }
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      const probs = [], sp = spec();
      if (!s.name.trim()) probs.push(['BLOCK', 'Still needs: the name']);
      else if (s.name.trim().length >= S().MAX_NAME) probs.push(['BLOCK', `The name has at most ${S().MAX_NAME - 1} characters`]);
      if (!sp.pieces.length) probs.push(['BLOCK', 'Still needs: at least one piece']);
      s.pieces.forEach((p, j) => { if (p.define && !itemOfDefine(ws, p.define)) probs.push(['BLOCK', `Piece ${j + 1}: ${p.define} is not an item`]); });
      const seen = new Set();
      for (const p of sp.pieces) {
        const it = itemOfDefine(ws, p.define), other = it && model(ctx).byItem.get(it.id);
        if (other) probs.push(['WARN', `${it.name} is in ${other.name} already: it would count for that set only`]);
        if (seen.has(p.define + p.partName)) probs.push(['WARN', `${it ? it.name : p.define} is listed twice in the same slot`]);
        seen.add(p.define + p.partName);
      }
      if (s.rows.some(r => r.dst && (!Number.isInteger(r.adj) || !(r.need >= 1)))) probs.push(['BLOCK', 'Every bonus needs an amount and pieces needed (1-8)']);
      const slots = new Set(sp.pieces.map(p => p.partName)).size;
      for (const r of sp.rows) if (r.need > slots) probs.push(['WARN', `${dstText(words, r.dst, r.adj)} needs ${r.need} pieces: only ${slots} can be worn at once`]);
      if (!sp.rows.length) probs.push(['WARN', 'No bonus yet: the set would give nothing']);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(x => x[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', 'Fill in the name and the pieces.')); return; }
      try {
        const p = plan();
        preview.appendChild(h('pre.preview', `propItemEtc.inc (+ Client copy), after the last set:\n${p.parts[0].splices[0].insert.replace(/\r/g, '').replace(/^\n+|\n+$/g, '')}\n\npropItemEtc.txt.txt (+ Client copy):\n+${p.key}\t${s.name.trim()}`));
        // the tooltip of the new set as players will see it, all pieces worn: loaded from a scratch copy of the file
        const sf = new FRE.SourceFile('propItemEtc.inc', ws.files.get(ETC).serialize());
        sf.applySplices(p.parts[0].splices, 'try');
        const strings = new Map(model(ctx).strings.map); strings.set(p.key, s.name.trim());
        const m2 = S().load(sf, { defines: ws.defines.defines, strings });
        m2.plus = model(ctx).plus;
        const ns = m2.sets.find(x => x.id === p.id);
        if (ns && ns.elems.length) { preview.appendChild(h('p', `Set ${p.id}, all ${ns.elems.length} pieces worn, a piece's tooltip:`)); preview.appendChild(renderTooltip(tooltipLines(ctx, ns, ns.elems.length, m2))); }
      } catch (e) { preview.appendChild(h('p.bad', e.message)); if (btn) btn.disabled = true; }
    }
    body.appendChild(h('div.nn-row', fieldLabel('Name', true), h('input', { type: 'text', maxLength: S().MAX_NAME - 1, style: 'width:24em', placeholder: 'e.g. Dragon Knight Set', on: { input: e => { s.name = e.target.value; refresh(); } } })));
    body.appendChild(h('h4', 'Pieces (1-8; each worn in its own slot)'));
    body.appendChild(list);
    body.appendChild(h('h4', 'Bonuses (they add up: 4 pieces give every row for 2, 3 and 4)'));
    body.appendChild(rowsBox);
    drawPieces(); drawRows();
    formFooter({ checks, action: 'Create', previewTitle: 'What will be written / what players see', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: 'New set', body, wide: true, buttons: [{ label: 'Cancel' },
      { label: 'Create', cls: 'primary', id: 'se-new-btn', onClick: () => { const p = plan(); ctx.editGroup(() => p.parts, `New set ${p.id}: ${s.name.trim()}`, [keyOf(p.id)]); st.sel = p.id; ctx.renderAll(false); } }] });
    btn = m.el.querySelector('#se-new-btn');
    refresh();
  }

  FRE.ui.modules.push(mod);
  FRE.ui.sets = { newSetForm, renameForm, pieceForm, bonusForm, tooltipLines };
})(globalThis.FRE = globalThis.FRE || {});
