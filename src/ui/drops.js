// Monster Drops (propMoverEx.inc): pick a monster, see what it drops with the chance players really get,
// add / change / remove drops, its Penya and its max items per kill. "🎲 Kill it" replays kills through
// loaders/drops-sim.js (CMover::DropItem). Edits: edit/drops-ops.js. Plain words (the user, 2026-10-07).
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput, pctInput, toast, keepFocus } = FRE.dom;
  const { diagTags, itemCell, fieldLabel, formFooter, diagRow, pretty } = FRE.ui;
  const FILE = 'propmoverex.inc';
  const st = { sel: null, show: 'all', killOpts: null };

  const Dr = () => FRE.drops, Sim = () => FRE.dropsSim, O = () => FRE.dropsOps;
  const model = ctx => ctx.ws.models.drops;
  const movers = ctx => ctx.ws.movers.movers;
  const canEdit = ctx => ctx.ws.isEditable(FILE);
  const keyOf = id => 'drops|' + id;
  const pctOf = p => Dr().pct(p);
  const RANK_WORD = { 1: 'small', 2: 'normal', 3: 'captain', 4: 'giant', 5: 'boss', 6: 'material', 7: 'world boss', 8: 'guard', 9: 'citizen' };
  const rankWord = mv => RANK_WORD[mv.rankId] || mv.rank;
  const nameOf = (ctx, id) => { const mv = movers(ctx).get(id); return mv && mv.name ? mv.name : (model(ctx).monsters.get(id) || {}).define || String(id); };
  const itemNameOf = (ctx, e) => { const it = ctx.ws.itemById(e.itemId); return it && it.name ? it.name : e.define; };
  const genNote = e => e.gen ? ` (made by ${Dr().GEN_SCRIPT[e.gen] || 'a gen script'})` : '';
  const dropDiags = ctx => ctx.ws.diags.filter(d => d.module === 'drops');
  const rowDiags = (ctx, e) => dropDiags(ctx).filter(d => d.start !== undefined && d.start >= e.start && d.start < Math.max(e.end, e.start + 1));
  const monDiags = (ctx, mon) => dropDiags(ctx).filter(d => mon.blocks.some(b => d.start >= b.start && d.start <= (b.close ? b.close.end : b.start + 1)));
  // the chance box: players' real chance in %, written as the file value that gives it (FRE.drops.probForChance)
  const CONV = {
    toPct: u => Dr().effChance(u) * 100, fromPct: p => Dr().probForChance(p / 100),
    get maxPct() { return Number((Dr().MAX_CHANCE() * 100).toFixed(4)); },
    tip: u => `= ${fmt(u)} in the file (out of 3,000,000,000; on paper ${pctOf(u / Dr().DROP_ONE)})`,
  };

  function monsterList(ctx) {
    const m = model(ctx), mv = movers(ctx);
    return [...m.monsters.values()].map(mon => ({ mon, mover: mv.get(mon.id) || null }))
      .sort((a, b) => ((a.mover ? a.mover.level : 0) - (b.mover ? b.mover.level : 0)) || a.mon.define.localeCompare(b.mon.define));
  }
  const SHOW = [
    { v: 'all', label: 'All monsters', test: () => true },
    { v: 'boss', label: 'Giants and bosses', test: x => x.mover && [4, 5, 7].includes(x.mover.rankId) },
    { v: 'problems', label: 'With problems', test: (x, ctx) => monDiags(ctx, x.mon).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (x, ctx) => ctx.edited.has(keyOf(x.mon.id)) },
    { v: 'gen', label: 'With script-made drops', test: x => x.mon.list.some(e => e.gen) || x.mon.kinds.some(e => e.gen) },
  ];
  function edit(ctx, id, make, label) { ctx.edit(FILE, make, label, keyOf(id)); }
  // a typed field: the pauses while typing one value fold into one undo step (keeps the first label: "was <the value before>")
  function typed(ctx, id, field, make, label) {
    ctx.editGroup(() => [{ file: FILE, splices: make(ctx.ws.files.get(FILE).text) }], label, [keyOf(id)], `dr|${id}|${field}`);
  }

  const mod = {
    id: 'drops', label: 'Monster Drops', searchPlaceholder: 'Search monsters',
    help: 'Monster Drops: what each monster drops, its Penya and how many items per kill (propMoverEx.inc)',
    st,
    onLoad() { st.sel = null; st.show = 'all'; st.killOpts = null; },

    listExtra(ctx) {
      const all = monsterList(ctx);
      return h('select.npc-filter', { title: 'Which monsters to list', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
        SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${all.filter(x => o.test(x, ctx)).length})`)));
    },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      let shown = 0;
      for (const x of monsterList(ctx)) {
        if (!test(x, ctx)) continue;
        const name = x.mover && x.mover.name ? x.mover.name : x.mon.define;
        if (q && !name.toLowerCase().includes(q) && !x.mon.define.toLowerCase().includes(q)) continue;
        if (++shown > 600) continue;
        const ds = monDiags(ctx, x.mon), b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === x.mon.id ? '.sel' : ''), { on: { click: () => { st.sel = x.mon.id; ctx.renderAll(false); } } },
          h('div.n', h('span', name), h('span', ctx.edited.has(keyOf(x.mon.id)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', `${x.mover ? `lv ${x.mover.level} · ${rankWord(x.mover)} · ` : ''}${x.mon.define}`)));
      }
      if (shown > 600) el.appendChild(h('div.pad.muted', `${shown - 600} more: search to narrow the list.`));
      if (!shown) el.appendChild(h('div.pad.muted', 'No monsters match.'));
    },

    renderEditor(el, ctx) {
      const m = model(ctx);
      if (m.stopped) el.appendChild(h('div.banner.bad', m.stopped.reason === 'ai'
        ? 'The server stops reading propMoverEx.inc at a broken AI { } block: every monster after it loses its drops. See the problems list.'
        : 'The server never finishes loading propMoverEx.inc (it loops forever at startup). See the problems list.'));
      const mon = st.sel !== null ? m.monsters.get(st.sel) : null;
      if (!mon) { el.appendChild(h('p.empty-state', 'Select a monster on the left.')); return; }
      keepFocus(el, () => monsterView(el, ctx, mon));
    },

    addTarget(ctx) {
      if (!canEdit(ctx)) return { ok: false, title: 'propMoverEx.inc is read-only' };
      const mon = st.sel !== null ? model(ctx).monsters.get(st.sel) : null;
      if (!mon) return { ok: false, title: 'Select a monster on the left first' };
      return { ok: true, usesPrice: false, title: `Add as a drop of ${nameOf(ctx, mon.id)} (opens the form)`, add(info) { addForm(ctx, mon, info.define); } };
    },

    locate(d, ctx) {
      if (d.module !== 'drops') return false;
      const b = model(ctx).blocks.find(x => d.start >= x.start && d.start <= (x.close ? x.close.end : Infinity));
      if (b) st.sel = b.id;
      return true;
    },
  };

  // ------------------------------------------------------------- one monster
  function monsterView(el, ctx, mon) {
    const ws = ctx.ws, edit_ = canEdit(ctx), mv = movers(ctx).get(mon.id) || null, f = ws.files.get(FILE);
    const env = Sim().envFor(ws, mon.id), ex = Sim().exactChances(env, {});
    const name = nameOf(ctx, mon.id);
    el.appendChild(h('div.npc-title', h('h2', name), h('span.def', mon.define),
      mv ? h('span.muted', ` lv ${mv.level} · ${rankWord(mv)}${mv.flying ? ' · flies (drops go straight into the bag)' : ''}`) : h('span.tag.bad', 'not in propMover.txt'),
      h('span.line', `${f.name} L${f.lineOf(mon.blocks[0].start) + 1}`), edit_ ? null : h('span.tag.bad', 'read-only')));
    const rates = ws.dropContext.rates;
    el.appendChild(h('p.muted.small', `Chances below are what players get: a player at the monster's level, the server rates on now (${rates.events.filter(e => e.on).map(e => e.name).join(', ') || 'none'}: item rate ×${rates.item}, Penya ×${rates.gold}). `,
      'The item rate only decides whether a kill drops anything at all; each line then rolls its own chance (the server picks the roll with xRand() % 3,000,000,000, so low chances come out about 1.4 times what the file says).'));

    // max items per kill
    const maxRow = h('div.dr-line',
      h('b', 'Max items per kill'),
      numInput({ value: mon.maxValue, min: 0, max: O().MAX_MAXITEM, disabled: !edit_, key: `dr|${mon.id}|max`,
        title: '0 = no limit. Lines marked "not counted" never use it up.',
        onCommit: v => { if (v === null) return; typed(ctx, mon.id, 'max', t => O().setMaxitem(t, model(ctx), mon.id, v), `${name}: changed max items per kill (was ${mon.maxValue})`); } }),
      h('span.muted.small', mon.maxValue ? `The server reads the list top to bottom and stops after ${mon.maxValue} counted item${mon.maxValue > 1 ? 's' : ''}.` : 'No limit.'));
    el.appendChild(maxRow);

    // Penya
    const gold = mon.list.find(e => e.kind === 'gold');
    const pr = Sim().penyaRange(env, {});
    el.appendChild(h('h3', 'Penya'));
    const setGold = (min, max) => typed(ctx, mon.id, 'gold', t => O().setGold(t, model(ctx), mon.id, min, max), `${name}: changed Penya (was ${gold ? `${gold.minValue}-${gold.maxValue}` : 'none'})`);
    el.appendChild(h('div.dr-line',
      h('span', 'DropGold'), numInput({ value: gold ? gold.minValue : null, min: 0, max: Dr().INT_MAX - 1, disabled: !edit_, key: `dr|${mon.id}|gmin`,
        onCommit: v => { if (v !== null) setGold(v, gold ? Math.max(gold.maxValue, v + 1) : v + 1); } }),
      h('span', 'to'), numInput({ value: gold ? gold.maxValue : null, min: 1, max: Dr().INT_MAX, disabled: !edit_, key: `dr|${mon.id}|gmax`,
        onCommit: v => { if (v !== null) setGold(gold ? Math.min(gold.minValue, v - 1) : 0, v); } }),
      gold && gold.gen ? h('span.tag.info', `made by ${Dr().GEN_SCRIPT[gold.gen]}`) : null,
      gold ? h('button.icon.danger', { disabled: !edit_, title: 'Remove: this monster gives no Penya',
        on: { click: () => edit(ctx, mon.id, t => O().removeEntry(t, gold), `${name}: removed its Penya`) } }, '✕') : null,
      gold ? diagTags(rowDiags(ctx, gold)) : null));
    el.appendChild(h('p.small', pr ? [`Players get ${fmt(pr.min)} - ${fmt(pr.max)} Penya per kill, straight into the bag `,
      h('span.muted', `(from ${pr.from}${pr.from === 'DropGold' ? '' : ': this monster\'s DropGold numbers only matter as noted'}, × ${pr.rates} server rate)`)]
      : h('span.muted', 'No DropGold line: this monster gives no Penya.')));

    // the drop lines
    el.appendChild(h('div.dr-line', { style: 'margin-top:14px' }, h('h3', { style: 'margin:0' }, `Drops (${mon.list.filter(e => e.kind === 'item').length})`),
      h('button.primary', { disabled: !edit_, on: { click: () => addForm(ctx, mon) } }, '+ Add a drop'),
      h('button', { on: { click: () => killWindow(ctx, mon) } }, '🎲 Kill it N times…')));
    const tb = h('table.items.dr', h('tr', h('th', 'Item'), h('th', { title: 'Typed in percent: what players get when the list reaches this line' }, 'Chance'),
      h('th', { title: 'Per kill, with the item rate and the max items per kill' }, 'Per kill'), h('th', 'Amount'), h('th', 'Upgrade'), h('th', ''), h('th', 'Line')));
    ex.lines.forEach((l, i) => {
      const e = l.entry;
      if (e.kind !== 'item' || e.event) return;
      const info = ws.itemById(e.itemId) ? ws.itemInfo(ws.itemById(e.itemId)) : null;
      const iname = itemNameOf(ctx, e);
      const set = (what, d, was) => typed(ctx, mon.id, `${e.start}|${what}`, () => O().setDrop(null, e, d, ws.defines.defines), `${name}: changed the ${what} of ${iname} (was ${was})${genNote(e)}`);
      const free = e.number === 0xFFFFFFFF;
      const amount = h('td.dr-amt', h('label.small', { title: 'Not counted: always exactly 1, and it never uses up the max items per kill' },
        h('input', { type: 'checkbox', checked: free, disabled: !edit_, on: { change: ev => set('amount', { count: ev.target.checked ? -1 : 1 }, free ? '1, not counted' : `1 to ${e.number}`) } }), ' not counted'),
        free ? null : h('span', ' 1 to ', numInput({ value: e.number, min: 1, max: O().MAX_COUNT, disabled: !edit_, key: `dr|${mon.id}|${e.start}|n`,
          onCommit: v => { if (v) set('amount', { count: v }, `1 to ${e.number}`); } })));
      const reach = l.reach < 0.9995 ? h('div.muted.small', `reached in ${pctOf(l.reach)} of kills (the max stops the list before it)`) : null;
      tb.appendChild(h('tr', itemCell(info, e.define),
        h('td', pctInput({ value: e.probability, disabled: !edit_, key: `dr|${mon.id}|${e.start}|p`, conv: CONV,
          onCommit: u => set('chance', { prob: u }, pctOf(Dr().effChance(e.probability)))})),
        h('td', pctOf(l.perKill), reach),
        amount,
        h('td.dr-amt', h('span', '+', numInput({ value: e.levelValue, min: 0, max: O().MAX_UPGRADE, disabled: !edit_, key: `dr|${mon.id}|${e.start}|lv`,
          onCommit: v => { if (v !== null) set('upgrade', { level: v }, `+${e.levelValue}`); } }))),
        h('td', h('button.icon.danger', { disabled: !edit_, title: 'Remove this drop',
          on: { click: () => edit(ctx, mon.id, t => O().removeEntry(t, e), `${name}: removed ${iname} from its drops${genNote(e)}`) } }, '✕'), ' ',
          e.gen ? h('span.tag.info', { title: `Running ${Dr().GEN_SCRIPT[e.gen]} again rewrites this block` }, `script: ${e.gen}`) : null, diagTags(rowDiags(ctx, e))),
        h('td', h('span.line', { title: f.text.slice(e.start, e.end) }, 'L' + (f.lineOf(e.start) + 1)))));
    });
    el.appendChild(tb);

    // random gear (DropKind)
    const [lo, hi] = Dr().kindWindow(mv ? mv.level : 1);
    el.appendChild(h('h3', `Random gear (${mon.kinds.length})`));
    el.appendChild(h('p.muted.small', `Each line can drop one random item of that kind whose rarity is ${lo} - ${hi} (the monster's level −5 to −2), at a random +0 - +10, rolled from expTable.inc's drop luck × this monster's ${mv ? mv.correction : 100}%.`));
    const kt = h('table.items', h('tr', h('th', 'Kind'), h('th', 'Items it can pick'), h('th', '')));
    for (const k of mon.kinds) {
      const ka = ws.dropContext.kinds.get(k.ik3Value);
      let n = 0;
      if (ka) for (const it of ka.list) if (it.rare >= lo && it.rare <= hi) n++;
      kt.appendChild(h('tr', h('td', pretty(k.define)), h('td', n ? `${n} item${n > 1 ? 's' : ''}` : h('span.muted', 'none: this line never drops anything')),
        h('td', h('button.icon.danger', { disabled: !edit_, on: { click: () => edit(ctx, mon.id, t => O().removeEntry(t, k), `${name}: removed random ${pretty(k.define)}${genNote(k)}`) } }, '✕'), ' ', diagTags(rowDiags(ctx, k)))));
    }
    if (mon.kinds.length) el.appendChild(kt);
    const ik3 = [...ws.dropContext.kinds.keys()].map(v => ws.defines.byValue('IK3_', v)).filter(Boolean).sort();
    el.appendChild(h('div.dr-line', h('span', '+ Random gear:'),
      edit_ ? FRE.ui.combo({ options: ik3.map(d => ({ v: d, label: pretty(d), find: d })), placeholder: 'Pick a kind (Sword, Axe…)', wordStart: true,
        onPick: d => edit(ctx, mon.id, t => O().addKind(t, model(ctx), mon.id, d, ws.defines.defines, mv ? mv.level : 1), `${name}: added random ${pretty(d)}`) }) : null));

    // event drops (read-only)
    const evs = env.list.filter(e => e.event);
    if (evs.length) {
      const det = h('details', h('summary', `Event drops every monster of this level has (propDropEvent.inc): ${evs.length} item${evs.length > 1 ? 's' : ''}, after its own lines`));
      const et = h('table.items', h('tr', h('th', 'Item'), h('th', 'Chance'), h('th', 'Per kill')));
      ex.lines.forEach(l => { if (!l.entry.event) return; const e = l.entry, it = ws.itemById(e.itemId);
        et.appendChild(h('tr', itemCell(it ? ws.itemInfo(it) : null, e.define), h('td', pctOf(l.chance)), h('td', pctOf(l.perKill)))); });
      det.appendChild(h('p.muted.small', 'Edited in propDropEvent.inc (not in this task). They come after the monster\'s own lines, so the max items per kill can stop them too.'));
      det.appendChild(et);
      el.appendChild(det);
    }
    const ds = monDiags(ctx, mon);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // ------------------------------------------------------------- + Add a drop
  function addForm(ctx, mon, define) {
    const ws = ctx.ws, name = nameOf(ctx, mon.id);
    const s = { define: define || null, prob: null, count: 1, free: true, level: 0 };
    const body = h('div.nn-form');
    const checks = h('div'), preview = h('div');
    let createBtn = null;
    const itemOpts = ws._itemOpts || [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name)).map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define }));
    ws._itemOpts = itemOpts;
    const plan = () => {
      const f = ws.files.get(FILE);
      return O().addDrop(f.text, model(ctx), mon.id, { define: s.define, prob: s.prob, level: s.level, count: s.free ? -1 : s.count }, ws.defines.defines);
    };
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      const probs = [];
      if (!s.define) probs.push(['BLOCK', 'Still needs: the item']);
      if (!s.prob) probs.push(['BLOCK', 'Still needs: the chance']);
      if (s.define && mon.list.some(e => e.kind === 'item' && e.define === s.define)) probs.push(['WARN', `${name} already drops this item: both lines roll, one after the other`]);
      if (s.define) { const id = ws.defines.defines.get(s.define), it = id === undefined ? null : ws.itemById(id);
        if (it && s.level && ![ws.defines.defines.get('IK1_WEAPON'), ws.defines.defines.get('IK1_ARMOR')].includes(FRE.specItem.get(it, 'dwItemKind1'))) probs.push(['WARN', `+${s.level} on an item that is not a weapon or armor`]); }
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(p => p[0] === 'BLOCK');
      if (createBtn) createBtn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', 'Fill in the item and the chance.')); return; }
      try {
        const sp = plan(), f = ws.files.get(FILE);
        const scratch = sp.reduce((t, x) => t.slice(0, x.start) + x.insert + t.slice(x.end), f.text);
        const line = sp[0].insert.replace(/\r?\n$/, '');
        preview.appendChild(h('pre.preview', `${FRE.drops.FILE}, ${name}'s block, line ${f.lineOf(sp[0].start) + 1}:\n+${line}`));
        const sm = Dr().loadDrops({ name: FILE, text: scratch }, { defines: ws.defines.defines, strings: ws.strings.map, movers: movers(ctx) });
        const ex2 = Sim().exactChances(Sim().envFor(ws, mon.id, sm), {});
        const mine = ex2.lines.find(l => l.entry.kind === 'item' && !l.entry.event && l.entry.start === sp[0].start + sp[0].insert.indexOf('DropItem'));
        if (mine) preview.appendChild(h('p', `Players get it in ${pctOf(mine.perKill)} of kills (about ${fmt(Math.round(mine.perKill * 1000) / 10)} per 100 kills)`,
          mine.reach < 0.9995 ? ` — the list reaches it in ${pctOf(mine.reach)} of kills because of the max items per kill.` : '.'));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); if (createBtn) createBtn.disabled = true; }
    }
    const debounce = refresh;          // the inputs already wait for a pause in typing (FRE.dom live inputs)
    const cnt = numInput({ value: 1, min: 1, max: O().MAX_COUNT, key: 'dr|add|n', disabled: s.free, onCommit: v => { s.count = v || 1; debounce(); } });
    const row = (label, req, ...el) => h('div.nn-row', fieldLabel(label, req), ...el);
    body.appendChild(h('div',
      row('Item', true, h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOpts, value: s.define, placeholder: 'Type an item name…', onPick: v => { s.define = v; refresh(); } }))),
      row('Chance (what players get, per roll)', true, pctInput({ value: null, conv: CONV, key: 'dr|add|p', live: true, onCommit: u => { s.prob = u; debounce(); } })),
      row('Amount', false,
        h('label', h('input', { type: 'checkbox', checked: s.free, on: { change: ev => { s.free = ev.target.checked; cnt.disabled = s.free; refresh(); } } }),
          ' exactly 1, not counted toward the max items per kill'),
        h('span.muted', '— or untick it for a random amount from 1 to'), cnt),
      row('Upgrade (+N)', false, numInput({ value: 0, min: 0, max: O().MAX_UPGRADE, key: 'dr|add|lv', onCommit: v => { s.level = v || 0; debounce(); } }))));
    body.appendChild(h('p.muted.small', `The chance can be at most ${CONV.maxPct}%: the server reads the number with atoi, which stops at 2,147,483,647. For "every kill", add the same line twice.`));
    formFooter({ checks, action: 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: `Add a drop: ${name}`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: 'Add', cls: 'primary', id: 'dr-add-btn', onClick: () => {
        const iname = (() => { const id = ws.defines.defines.get(s.define), it = id === undefined ? null : ws.itemById(id); return it && it.name ? it.name : s.define; })();
        edit(ctx, mon.id, () => plan(), `${name}: added ${iname} as a drop (${pctOf(Dr().effChance(s.prob))})`);
      } },
    ] });
    createBtn = m.el.querySelector('#dr-add-btn');
    refresh();
  }

  // ------------------------------------------------------------- 🎲 Kill it N times
  function killWindow(ctx, mon) {
    const ws = ctx.ws, mv = movers(ctx).get(mon.id), name = nameOf(ctx, mon.id);
    const o = st.killOpts && st.killOpts.id === mon.id ? st.killOpts : { id: mon.id, kills: 1000, playerLevel: mv ? mv.level : 1, loops: 1, seed: 1, fortune: false, worldId: 1 };
    st.killOpts = o;
    const out = h('div');
    const run = () => {
      out.textContent = '';
      const env = Sim().envFor(ws, mon.id);
      const t0 = Date.now();
      const r = Sim().run(env, { kills: o.kills, seed: o.seed, playerLevel: o.playerLevel, loops: o.loops, fortune: o.fortune, worldId: o.worldId });
      if (r.crash) out.appendChild(h('div.banner.bad', `The server would crash at kill ${r.crash.kill}: ${r.crash.why}.`));
      out.appendChild(h('p', `${fmt(r.kills)} kills in ${Date.now() - t0} ms. A drop roll happened ${fmt(r.gates)} times; the max items per kill stopped the list ${fmt(r.stops)} times. `,
        `Penya: ${fmt(Math.round(r.gold.total / Math.max(1, r.kills)))} per kill on average (${fmt(r.gold.min)} - ${fmt(r.gold.max)}).`));
      const tb = h('table.items.dr', h('tr', h('th', 'Item'), h('th.num', 'Kills it dropped'), h('th.num', '% of kills'), h('th.num', 'Items in all')));
      const rows = [...r.lines.entries()].map(([i, s]) => ({ e: env.list[i], s })).concat([...r.kinds.values()].map(s => ({ e: null, s })))
        .sort((a, b) => b.s.times - a.s.times);
      for (const x of rows) {
        const it = ws.itemById(x.s.id);
        tb.appendChild(h('tr', itemCell(it ? ws.itemInfo(it) : null, x.e ? x.e.define : String(x.s.id)),
          h('td.num', fmt(x.s.times)), h('td.num', pctOf(x.s.times / r.kills)), h('td.num', fmt(x.s.count)),
          x.e && x.e.event ? h('td.muted.small', 'event drop') : !x.e ? h('td.muted.small', 'random gear') : null));
      }
      out.appendChild(rows.length ? tb : h('p.muted', 'Nothing dropped.'));
    };
    const worlds = [[1, 'Madrigal (1)']].concat(ws.dropContext.penya.worlds.map(([w, p]) => [w, `world ${w} (Penya ${p}%)`]));
    const body = h('div',
      h('p.muted.small', 'Replays the server\'s kill code with its random generator: the same seed gives the same kills. Not modelled: event / quest items, Anarchy, the Lord event, PC-bang.'),
      h('div.nn-row',
        fieldLabel('Kills', true), numInput({ value: o.kills, min: 1, max: 200000, onCommit: v => { o.kills = v || 1; } }),
        fieldLabel('Player level', true), numInput({ value: o.playerLevel, min: 1, max: 200, onCommit: v => { o.playerLevel = v || 1; } }),
        fieldLabel('Seed', false), numInput({ value: o.seed, min: 0, max: 4294967295, onCommit: v => { o.seed = v || 0; } })),
      h('div.nn-row',
        fieldLabel('Rolls per kill', false), h('select', { on: { change: e => { o.loops = Number(e.target.value); } } },
          [[1, '1 (normal)'], [2, '2 (Gift Box party, or a GET01 scroll)'], [3, '3 (GET02 scroll)'], [4, '4']].map(([v, l]) => h('option', { value: v, selected: o.loops === v }, l))),
        h('label', h('input', { type: 'checkbox', checked: o.fortune, on: { change: e => { o.fortune = e.target.checked; } } }), ' Fortune Circle party'),
        fieldLabel('Map', false), h('select', { on: { change: e => { o.worldId = Number(e.target.value); } } }, worlds.map(([v, l]) => h('option', { value: v, selected: o.worldId === v }, l)))),
      h('button.primary', { on: { click: run } }, 'Run'), out);
    modal({ title: `Kill ${name} N times`, body, wide: true });
    run();
  }

  FRE.ui.modules.push(mod);
  FRE.ui.drops = { addForm, killWindow };
})(globalThis.FRE = globalThis.FRE || {});
