// Mini Events: one page per event (the user, 2026-10-18: "each event should have a separate menu ... as they have separate
// mechanics", "set prize separately for each event"): its settings, its prizes (places 1-10 + everyone else), its round
// points, and a "Try it" run; + the week's start times. MiniEvent.inc, WorldServer only (loaders/minievent.js = ReadConfig).
// The question / recipe / spot lists and the schedule editor come in the next steps (guides NEXT_TASKS_PLAN.md 1b).
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus, numInput } = FRE.dom;
  const { diagRow } = FRE.ui;
  const FILE = 'minievent.inc';
  const st = { tr: { q: '', page: 0, hq: '', hpage: 0, n: 50, seed: 1 + Math.floor(Math.random() * 99999), mode: 'add', withHints: true, preview: null,
    newR: { title: '', items: [[null, 20]] }, tryR: 0, have: {}, newH: { id: null, text: '' } }, sel: 1, players: 12, seed: 1, q: '', page: 0, tryAsk: 0, typed: '', newQ: { 2: { question: '', info: '' }, 3: { question: '', truth: true } } };
  const M = () => FRE.miniEvent, O = () => FRE.miniEventOps, Sim = () => FRE.miniEventSim;
  const model = ctx => ctx.ws.models.minievent;
  const can = ctx => ctx.ws.isEditable(FILE);
  const keyOf = id => `minievent|${id}`;
  const DAYS = ['every day', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORD = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  const two = n => String(n).padStart(2, '0');
  const eDiags = (ctx, e) => ctx.ws.diags.filter(d => d.module === 'minievent' && (new RegExp(`\\b${e.key}\\b`).test(d.message) ||
    [...e.lines, ...e.rankLines, ...e.restLines, ...(e.points ? [e.points] : [])].some(l => d.start >= l.start && d.start < l.end)));

  function itemOptions(ws) {
    if (!ws._meItemOpts) ws._meItemOpts = [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define }));
    return ws._meItemOpts;
  }
  const itemOf = (ws, id) => ws.itemById(id >>> 0);
  // a table with fixed column widths (the page stays readable on a wide screen)
  const table = (widths, rows) => h('table.items.rt', { style: 'table-layout:fixed;width:100%;max-width:980px' }, h('colgroup', widths.map(w => h('col', { style: `width:${w}` }))), rows);
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const nameOf = (ws, id) => { const it = itemOf(ws, id); return it ? (it.name || it.define) : `#${id}`; };

  const PAGES = () => [...M().TYPES.slice(1).map(t => ({ id: t.id, label: t.name })), { id: 'week', label: 'Start times (the week)' }];

  const mod = {
    id: 'minievent', label: 'Mini Events', searchPlaceholder: 'Search', noItems: true,
    help: 'Mini Events: each event\'s settings, prizes and round points, and when they start (MiniEvent.inc)',
    st,
    onLoad() { st.sel = 1; st.players = 12; st.seed = 1; st.q = ''; st.page = 0; st.typed = ''; },
    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase();
      for (const p of PAGES()) {
        if (q && !p.label.toLowerCase().includes(q)) continue;
        const e = typeof p.id === 'number' ? m.events[p.id] : null;
        const nw = e ? eDiags(ctx, e).filter(d => d.severity !== 'INFO').length : 0;
        const sub = e ? (e.loaded ? `${e.values.ROUNDS} rounds · ${e.values.ROUND_TIME} s${e.values.IN_RANDOM ? '' : ' · not random'}` : 'no EVENT line: off') : `${m.begins.length} start times`;
        el.appendChild(h('div.npc' + (st.sel === p.id ? '.sel' : ''), { 'data-page': p.id, on: { click: () => { st.sel = p.id; st.q = ''; st.page = 0; ctx.renderAll(false); } } },
          h('div.n', h('span', p.label), h('span', e && ctx.edited.has(keyOf(p.id)) ? h('span.tag.edit', 'edited') : null, nw ? h('span.tag.warn', '⚠' + nw) : null)),
          h('div.k', sub)));
      }
    },
    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const m = model(ctx);
        if (m.errors.length) el.appendChild(h('p.warn-text', `⛔ ${m.errors.length} mistake${m.errors.length > 1 ? 's' : ''} in MiniEvent.inc: the WorldServer switches EVERY Mini Event off until ${m.errors.length > 1 ? 'they are' : 'it is'} fixed. See the problems list.`));
        if (st.sel === 'week') weekView(el, ctx);
        else eventView(el, ctx, m.events[st.sel]);
      });
    },
    addTarget() { return { ok: false, title: 'The six events are fixed in the game code' }; },
    locate(d, ctx) {
      if (d.module !== 'minievent') return false;
      const m = model(ctx);
      for (let i = 1; i < m.events.length; i++) if (eDiags(ctx, m.events[i]).includes(d)) { st.sel = i; return true; }
      if (m.begins.some(b => d.start >= b.start && d.start < b.end)) st.sel = 'week';
      return true;
    },
  };

  const edit = (ctx, type, make, label, mergeKey) =>
    ctx.editGroup(() => [{ file: FILE, splices: make(ctx.ws.files.get(FILE).text, model(ctx)) }], label, [keyOf(type)], mergeKey);

  function eventView(el, ctx, e) {
    const ed = can(ctx), T = M().TYPES[e.type];
    el.appendChild(h('div.npc-title', h('h2', e.name), h('span.def', e.key), can(ctx) ? null : h('span.tag.bad', 'read-only')));
    el.appendChild(h('p', T.about));
    if (!e.loaded) { el.appendChild(h('p.warn-text', 'This event has no EVENT line in MiniEvent.inc, so it never runs.')); return; }

    // settings
    el.appendChild(h('h3', 'Settings'));
    const rows = [];
    for (const k of M().KEYS) {
      if (k.only && !k.only.includes(e.type)) continue;
      const entry = e.keys[k.key], v = e.values[k.key], max = k.key === 'ROUND_TIME' ? M().roundMax(e.type) : k.max;
      const label = `${e.name}: ${k.label.toLowerCase()}`;
      const input = k.bool
        ? h('label', h('input', { type: 'checkbox', checked: !!v, disabled: !ed, on: { change: ev => edit(ctx, e.type, (t, mm) => O().setKey(t, mm, e.type, k.key, ev.target.checked ? 1 : 0), `${label}: ${ev.target.checked ? 'yes' : 'no'}`) } }), ' yes')
        : numInput({ value: v, min: k.min, max, disabled: !ed, key: `me|${e.type}|${k.key}`,
          onCommit: n => { if (n === null || n === v) return; edit(ctx, e.type, (t, mm) => O().setKey(t, mm, e.type, k.key, n), `${label} ${n} (was ${v})`, `me|${e.type}|${k.key}`); } });
      rows.push(h('tr', h('td', h('b', k.label), k.help ? h('div.muted.small', k.help) : null), h('td', input),
        h('td.muted.small', entry ? `${k.min} - ${max}` : `default ${v}: not in the file (${k.min} - ${max})`)));
    }
    el.appendChild(table(['52%', '18%', '30%'], rows));

    // prizes
    el.appendChild(h('h3', 'Prizes'));
    el.appendChild(h('p.muted.small', 'Places 1-10 get their own prize (only with more than 0 points); everyone else gets the last row. A full bag or an offline player gets it by mail. These prizes are for this event only.'));
    const ptab = [h('tr', h('th', 'Place'), h('th', 'Item'), h('th', 'Amount'), h('th', ''))];
    for (let place = 1; place <= 11; place++) {
      const pl = place === 11 ? 0 : place, row = pl ? e.ranks[pl - 1] : e.rest;
      const it = row ? itemOf(ctx.ws, row.id) : null, plText = pl ? ORD(pl) : 'Everyone else';
      const set = (define, amount) => edit(ctx, e.type, (t, mm) => O().setPrize(t, mm, e.type, pl, { define, amount }, ctx.ws.defines.defines),
        `${e.name} prize, ${plText}: ${amount} × ${nameOf(ctx.ws, ctx.ws.defines.defines.get(define))}${row ? ` (was ${row.amount.value} × ${nameOf(ctx.ws, row.id)})` : ''}`, `mep|${e.type}|${pl}`);
      ptab.push(h('tr', h('td', h('b', plText)),
        h('td', h('div', { style: 'display:flex;align-items:center;gap:6px' }, it ? FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' }) : null,
          ed ? FRE.ui.combo({ options: itemOptions(ctx.ws), value: it ? it.define : '', placeholder: 'No prize: pick an item', onPick: d => { if (!d || (it && d === it.define)) return; set(d, row ? row.amount.value : 1); } })
            : h('span', it ? nameOf(ctx.ws, row.id) : 'no prize'))),
        h('td', row ? numInput({ value: row.amount.value, min: 0, max: 9999, disabled: !ed, key: `mepn|${e.type}|${pl}`,
          onCommit: n => { if (n === null || n === row.amount.value) return; set(it.define, n); } }) : ''),
        h('td', ed && row ? h('button.icon.danger', { title: 'No prize for this place', on: { click: () => edit(ctx, e.type, (t, mm) => O().setPrize(t, mm, e.type, pl, null), `${e.name} prize, ${plText}: none (was ${row.amount.value} × ${nameOf(ctx.ws, row.id)})`) } }, '✕') : null)));
    }
    el.appendChild(table(['16%', '56%', '20%', '8%'], ptab));

    // round points
    el.appendChild(h('h3', 'Round points'));
    if (e.type === 1) el.appendChild(h('p.muted.small', `Color Game points are fixed in the game code: ${Sim().DIE_POINTS} per die showing your colour (3 dice), +${Sim().FIRST_BONUS} for the first player who picked a colour that hit.`));
    else {
      const vals = [...e.pointValues, e.restPoints];
      el.appendChild(h('p.muted.small', e.type === 3 ? 'Right answers, fastest first: these points by place; every other right answer gets "the rest"; wrong / none 0.'
        : e.type === 4 ? 'Every round a random order: these points by place, everyone else "the rest".'
        : e.type === 6 ? 'Only the 1st place is used: the player who finds Lost Fwanki.'
        : 'The first 10 get these points by place, later ones "the rest"; none 0.'));
      const cells = vals.map((v, i) => h('td', h('div.muted.small', i < 10 ? ORD(i + 1) : 'the rest'), numInput({ value: v, min: 0, max: 999, disabled: !ed, key: `mept|${e.type}|${i}`,
        onCommit: n => { if (n === null || n === v) return; const nv = vals.slice(); nv[i] = n;
          edit(ctx, e.type, (t, mm) => O().setPoints(t, mm, e.type, nv), `${e.name} points, ${i < 10 ? ORD(i + 1) : 'the rest'}: ${n} (was ${v})`, `mept|${e.type}|${i}`); } })));
      el.appendChild(h('div.me-pts', table(Array(11).fill('9%'), h('tr', cells))));
      el.appendChild(h('p.muted.small', 'Rules the server checks: 0 - 999, never going up from 1st to 10th, and 10th more than the rest.'));
    }

    // what this event's list holds (edited in the next steps)
    const list = e.type === 2 || e.type === 3 ? `${e.asks.length} question${e.asks.length === 1 ? '' : 's'}` : e.type === 5 ? `${e.recipes.length} recipes` : e.type === 6 ? `${e.spots.length} hiding spots` : null;
    if (e.type === 2 || e.type === 3) questionsView(el, ctx, e);
    else if (e.type === 5) turninView(el, ctx, e);
    else if (list) el.appendChild(h('p.muted.small', `This event has ${list} (at least one per round is needed: ${e.values.ROUNDS}). Editing the list comes in a later step.`));

    tryView(el, ctx, e);
    const ds = eDiags(ctx, e);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
    el.appendChild(h('p.muted.small', 'After saving: type /eventreload in game as GM while no Mini Event runs (or restart the servers).'));
  }

  // a text box that commits on Enter / leaving it (and after a pause while typing)
  function textBox({ value, key, disabled, max, width, placeholder, onCommit, onInput }) {
    const el = h('input', { type: 'text', value: value || '', disabled, maxLength: max || 255, placeholder: placeholder || '', style: `width:${width || '100%'}` });
    if (key) el.dataset.key = key;
    el.dataset.value = el.value;
    const commit = () => { if (!el.isConnected || el.value === el.dataset.value) return; el.dataset.value = el.value; onCommit(el.value); };
    if (onCommit) { el.addEventListener('change', commit); el.addEventListener('keydown', ev => { if (ev.key === 'Enter') el.blur(); }); }
    if (onInput) el.addEventListener('input', () => onInput(el.value));
    return el;
  }
  const PAGE = 50;
  const dateText = t => { const d = new Date(t * 1000); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`; };

  // Quick Hands / O/X Quiz: the ASK lines of this event - add, edit, remove, search; the order the next runs ask them
  function questionsView(el, ctx, e) {
    const ed = can(ctx), ox = e.type === 3, ws = ctx.ws, asked = ws.miniEventAsked || null;
    const S2 = Sim(), noun = ox ? 'statement' : 'text';
    el.appendChild(h('h3', `Questions (${e.asks.length})`));
    el.appendChild(h('p.muted.small', `${e.values.ROUNDS} are asked per event, one per round, never one twice in an event. Never-asked questions come first, then the ones asked longest ago (random among equals).`
      + (ox ? ' O = true, X = false.' : ' Players must type the text exactly: upper / lower case, letters and spaces.')
      + (asked ? ' "Asked last" comes from the server\'s MiniEventAsked.txt.' : ' (No MiniEventAsked.txt found next to Resource: "asked last" is not shown.)')));

    // + add
    const nq = st.newQ[e.type], msg = h('div.small');
    const check = () => {
      msg.textContent = '';
      try {
        O().askLine(e.type, nq);
        if (e.asks.some(a => a.question.text === nq.question)) { msg.className = 'small warn-text'; msg.textContent = '⚠ Already in the list.'; }
        add.disabled = false;
      } catch (er) { add.disabled = true; if (nq.question) { msg.className = 'small warn-text'; msg.textContent = '⛔ ' + er.message; } }
    };
    const add = h('button.primary', { disabled: true, on: { click: () => {
      const q = Object.assign({}, nq);
      edit(ctx, e.type, (t, mm) => O().addAsk(t, mm, e.type, q), `${e.name}: new question "${q.question}"`);
      st.newQ[e.type] = ox ? { question: '', truth: true } : { question: '', info: '' };
      ctx.renderAll(false);
    } } }, '+ Add question');
    if (ed) {
      const parts = [];
      if (ox) parts.push(h('select', { on: { change: ev => { nq.truth = ev.target.value === 'O'; check(); } } }, h('option', { value: 'O', selected: nq.truth }, 'O (true)'), h('option', { value: 'X', selected: !nq.truth }, 'X (false)')));
      parts.push(textBox({ value: nq.question, max: ox ? 200 : M().ANSWER_LEN, placeholder: ox ? 'The statement (true or false)' : 'The text players type', width: ox ? '34em' : '18em', onInput: v => { nq.question = v; check(); } }));
      if (!ox) parts.push(textBox({ value: nq.info, max: 120, placeholder: 'Small line under it: what it is (optional)', width: '26em', onInput: v => { nq.info = v; check(); } }));
      el.appendChild(h('div.dr-line', ...parts, add));
      el.appendChild(msg);
      check();
    }

    // search + table, 50 a page
    const q = st.q.toLowerCase();
    const list = e.asks.map((a, i) => [a, i]).filter(([a]) => !q || a.question.text.toLowerCase().includes(q) || (a.info && a.info.text.toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (st.page >= pages) st.page = pages - 1;
    el.appendChild(h('div.dr-line', textBox({ value: st.q, placeholder: `Search the ${e.asks.length} questions`, width: '20em', key: `meq|${e.type}`, onInput: v => { st.q = v; st.page = 0; ctx.renderAll(false); } }),
      h('span.muted.small', `${list.length} shown`), pages > 1 ? h('span', h('button.small', { disabled: st.page === 0, on: { click: () => { st.page--; ctx.renderAll(false); } } }, '‹'),
        h('span.muted.small', ` page ${st.page + 1} / ${pages} `), h('button.small', { disabled: st.page >= pages - 1, on: { click: () => { st.page++; ctx.renderAll(false); } } }, '›')) : null));
    const head = [h('th', '#'), ox ? h('th', 'Answer') : null, h('th', ox ? 'Statement' : 'Text to type'), ox ? null : h('th', 'Small line'), h('th', 'Asked last'), h('th', '')].filter(Boolean);
    const rows = [h('tr', head)];
    for (const [a, i] of list.slice(st.page * PAGE, st.page * PAGE + PAGE)) {
      const label = `${e.name} question ${i + 1}`;
      const cur = () => model(ctx).events[e.type].asks[i];
      const change = (patch, what) => {
        const now = cur(), qv = ox ? { truth: now.truth.text === 'O', question: now.question.text } : { question: now.question.text, info: now.info.text };
        Object.assign(qv, patch);
        try { O().askLine(e.type, qv); } catch (er) { toast(er.message, 'bad'); ctx.renderAll(false); return; }
        edit(ctx, e.type, t => O().editAsk(t, cur(), e.type, qv), `${label}: ${what}`);
      };
      const when = asked ? asked.get(S2.askKey(e.type, a.question.text)) : null;
      rows.push(h('tr', [h('td.muted', String(i + 1)),
        ox ? h('td', h('select', { disabled: !ed, on: { change: ev => change({ truth: ev.target.value === 'O' }, `answer ${ev.target.value}`) } },
          h('option', { value: 'O', selected: a.truth.text === 'O' }, 'O'), h('option', { value: 'X', selected: a.truth.text === 'X' }, 'X'))) : null,
        h('td', textBox({ value: a.question.text, disabled: !ed, max: ox ? 200 : M().ANSWER_LEN, key: `meqt|${e.type}|${i}`, onCommit: v => change({ question: v }, `${noun} "${v}"`) })),
        ox ? null : h('td', textBox({ value: a.info.text, disabled: !ed, max: 120, key: `meqi|${e.type}|${i}`, onCommit: v => change({ info: v }, `small line "${v}"`) })),
        h('td.muted.small', asked ? (when ? dateText(when) : 'never') : '—'),
        h('td', ed ? h('button.icon.danger', { title: 'Remove this question', on: { click: () => edit(ctx, e.type, t => O().removeAsk(t, cur()), `${e.name}: removed question "${a.question.text}"`) } }, '✕') : null)].filter(Boolean)));
    }
    el.appendChild(h('table.items.rt', { style: 'table-layout:fixed;width:100%' },
      h('colgroup', (ox ? ['5%', '9%', '72%', '10%', '4%'] : ['5%', '24%', '57%', '10%', '4%']).map(w => h('col', { style: `width:${w}` }))), rows));
    if (e.asks.length < e.values.ROUNDS) el.appendChild(h('p.warn-text', `⛔ Only ${e.asks.length} questions for ${e.values.ROUNDS} rounds: the server switches Mini Events off.`));

    // the next runs, from now (the history is copied, nothing is written)
    const hist = new Map(asked || []), now = Math.floor(Date.now() / 1000);
    const runs = S2.askRuns(e, e.type, hist, now, 86400, 3, st.seed);
    el.appendChild(h('h3', 'The next 3 events (one a day)'));
    const ul = h('ol.small');
    runs.forEach((r, k) => ul.appendChild(h('li', `${r.order.map(i => `"${e.asks[i].question.text.length > 40 ? e.asks[i].question.text.slice(0, 37) + '…' : e.asks[i].question.text}"`).join(', ')}${r.recent ? ` (${r.recent} asked in the last ${e.values.ASK_DAYS} days: the server logs a warning)` : ''}`)));
    el.appendChild(ul);
    el.appendChild(h('p.muted.small', `With ${e.asks.length} questions and ${e.values.ROUNDS} a run, a question comes back after about ${Math.max(1, Math.floor(e.asks.length / Math.max(1, e.values.ROUNDS)))} events.`));

    // Quick Hands: try typing
    if (!ox && e.asks.length) {
      if (st.tryAsk >= e.asks.length) st.tryAsk = 0;
      const a = e.asks[st.tryAsk], res = h('span');
      const show = v => { res.textContent = !v ? '' : S2.typerCorrect(a, v) ? '✓ Correct!' : '✗ Wrong answer, try again.'; res.className = S2.typerCorrect(a, v) ? 'ok-text' : 'warn-text'; };
      el.appendChild(h('h3', '⌨ Try typing'));
      el.appendChild(h('div.dr-line', h('select', { style: 'max-width:22em', on: { change: ev => { st.tryAsk = Number(ev.target.value); st.typed = ''; ctx.renderAll(false); } } },
        e.asks.slice(0, 600).map((x, i) => h('option', { value: i, selected: i === st.tryAsk }, x.question.text))),
        h('span.muted.small', a.info.text)));
      const inp = textBox({ value: st.typed, placeholder: 'Type it here exactly', width: '24em', key: 'metype', onInput: v => { st.typed = v; show(v); } });
      el.appendChild(h('div.dr-line', inp, res));
      show(st.typed);
    }
  }

  // ---- Turn-in Race (step 3): RECIPE lines, ITEM_HINT lines, 🎲 random recipes, Try turning in (loaders/minievent-turnin.js)
  const TI = () => FRE.miniEventTurnIn;
  function tctx(ws) { if (!ws._meTurn) ws._meTurn = TI().context(ws); return ws._meTurn; }
  const opsCtx = ws => ({ itemOk: id => !!ws.itemById(id), keyOf: id => ws.itemById(id).define, nameOf: id => (ws.itemById(id) || {}).name || String(id) });
  const iname = (ws, id) => { const it = ws.itemById(id >>> 0); return it ? (it.name || it.define) : `item ${id >>> 0}`; };
  const idOfDefine = (ws, d) => ws.defines.defines.get(d);

  // one recipe's items as an editable list: [[id, n], ...] -> a row of "name × amount ✕" + "+ item"
  function itemsEditor(ctx, items, ed, onChange, keyBase) {
    const box = h('div.dr-line', { style: 'flex-wrap:wrap;gap:6px' });
    items.forEach(([id, n], k) => {
      box.appendChild(h('span.tag', { style: 'display:inline-flex;align-items:center;gap:4px' },
        id === null ? (ed ? FRE.ui.combo({ options: itemOptions(ctx.ws), value: '', placeholder: 'Pick an item', onPick: d => { const v = idOfDefine(ctx.ws, d); if (v === undefined) return; const x = items.map(y => y.slice()); x[k][0] = v >>> 0; onChange(x, `item ${k + 1}: ${iname(ctx.ws, v)}`); } }) : '?')
          : h('span', iname(ctx.ws, id)),
        ' ×', numInput({ value: n, min: 1, max: 9999, disabled: !ed, key: `${keyBase}|n${k}`, onCommit: v => { if (v === null || v === n) return; const x = items.map(y => y.slice()); x[k][1] = v; onChange(x, `${id === null ? 'amount' : iname(ctx.ws, id)} × ${v}`); } }),
        ed && items.length > 1 ? h('button.icon.danger', { title: 'Remove this item', on: { click: () => onChange(items.filter((_, j) => j !== k), `without ${id === null ? 'an empty item' : iname(ctx.ws, id)}`) } }, '✕') : null));
    });
    if (ed && items.length < M().RECIPE_ITEMS) box.appendChild(h('button.small', { on: { click: () => onChange([...items, [null, 20]], null) } }, '+ item'));
    return box;
  }

  function turninView(el, ctx, e) {
    const ws = ctx.ws, ed = can(ctx), m = model(ctx), S = st.tr, oc = opsCtx(ws);
    const hintMap = new Map(); for (const x of m.hints) hintMap.set(x.id, x);     // the last line of an item wins
    const recipeOf = r => ({ title: r.title.text, items: r.items.map(x => [x.id, x.amount.value]) });

    // the GM command (V19 4a733f19)
    el.appendChild(h('div.note.small', h('b', 'In game: '), 'a GM can set a round\'s recipe with ', h('code', '/eventrecipe [round] ["title"] <Ctrl+click items> [amount]'),
      ' (no round = the next one; amount = the linked stack). Rounds without one use this list. Needs the V19 change 4a733f19 built into the WorldServer and Neuz (not yet tested in game).'));

    // ---- recipes
    el.appendChild(h('h3', `Recipes (${e.recipes.length})`));
    el.appendChild(h('p.muted.small', `One recipe per round (${e.values.ROUNDS} a run), never one twice in a run; never-used recipes come first, then the ones used longest ago. Players bring the items to Event Master and press TURN IN: equipped or locked items do not count; the first ${e.values.END_AT} to turn in end the round.`));
    // + add
    if (ed) {
      const nr = S.newR, msg = h('div.small');
      const valid = () => { try { O().checkRecipe({ title: nr.title, items: nr.items }, oc.itemOk); return null; } catch (er) { return er.message; } };
      const add = h('button.primary', { on: { click: () => {
        const r = { title: nr.title, items: nr.items.map(x => x.slice()) };
        edit(ctx, 5, (t, mm) => O().addRecipe(t, mm, r, oc), `Turn-in Race: new recipe "${r.title}"`);
        S.newR = { title: '', items: [[null, 20]] };
        ctx.renderAll(false);
      } } }, '+ Add recipe');
      const check = () => { const v = valid(); add.disabled = !!v; msg.className = 'small warn-text'; msg.textContent = v && (nr.title || nr.items.some(x => x[0] !== null)) ? '⛔ ' + v : ''; };
      const auto = h('button.small', { title: 'A title like the list\'s: "<monster> Hunt" ...', on: { click: () => {
        const c = tctx(ws), ids = nr.items.filter(x => x[0] !== null).map(x => x[0]);
        nr.title = TI().gmTitle(c, ids, id => (hintMap.get(id) ? hintMap.get(id).text.text : TI().hintFor(c, id)));
        ctx.renderAll(false);
      } } }, '✨ Title from items');
      el.appendChild(h('div.dr-line', textBox({ value: nr.title, max: 60, placeholder: 'Title players see (1-60 letters)', width: '22em', key: 'metr-title', onInput: v => { nr.title = v; check(); } }), auto,
        itemsEditor(ctx, nr.items, true, (x) => { nr.items = x; ctx.renderAll(false); }, 'metr-new'), add));
      el.appendChild(msg);
      check();
    }
    // search + table
    const q = S.q.toLowerCase();
    const list = e.recipes.map((r, i) => [r, i]).filter(([r]) => !q || r.title.text.toLowerCase().includes(q) || r.items.some(x => iname(ws, x.id).toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (S.page >= pages) S.page = pages - 1;
    el.appendChild(h('div.dr-line', textBox({ value: S.q, placeholder: `Search the ${e.recipes.length} recipes (title or item)`, width: '20em', key: 'metr-q', onInput: v => { S.q = v; S.page = 0; ctx.renderAll(false); } }),
      h('span.muted.small', `${list.length} shown`), pages > 1 ? h('span', h('button.small', { disabled: S.page === 0, on: { click: () => { S.page--; ctx.renderAll(false); } } }, '‹'),
        h('span.muted.small', ` page ${S.page + 1} / ${pages} `), h('button.small', { disabled: S.page >= pages - 1, on: { click: () => { S.page++; ctx.renderAll(false); } } }, '›')) : null));
    const asked = ws.miniEventAsked || null;
    const rows = [h('tr', h('th', '#'), h('th', 'Title'), h('th', 'Items'), h('th', 'Used last'), h('th', ''))];
    for (const [r, i] of list.slice(S.page * PAGE, S.page * PAGE + PAGE)) {
      const label = `Turn-in recipe ${i + 1}`;
      const cur = () => model(ctx).events[5].recipes[i];
      const change = (patch, what) => {
        const nr = Object.assign(recipeOf(cur()), patch);
        if (nr.items.some(x => x[0] === null)) { S.pending = { i, items: nr.items }; ctx.renderAll(false); return; }
        try { O().checkRecipe(nr, oc.itemOk); } catch (er) { toast(er.message, 'bad'); ctx.renderAll(false); return; }
        S.pending = null;
        edit(ctx, 5, t => O().editRecipe(t, cur(), nr, oc), `${label}: ${what}`);
      };
      const items = S.pending && S.pending.i === i ? S.pending.items : recipeOf(r).items;
      const when = asked ? asked.get(Sim().askKey(5, Sim().askText(e, 5, i))) : null;
      const missing = r.items.filter(x => !hintMap.has(x.id)).length;
      rows.push(h('tr', h('td.muted', String(i + 1)),
        h('td', textBox({ value: r.title.text, disabled: !ed, max: 60, key: `metr-t|${i}`, onCommit: v => change({ title: v }, `title "${v}"`) }),
          missing ? h('div.small.warn-text', `${missing} item${missing > 1 ? 's' : ''} without a hint`) : null),
        h('td', itemsEditor(ctx, items, ed, (x, what) => change({ items: x }, what || 'items'), `metr|${i}`)),
        h('td.muted.small', asked ? (when ? dateText(when) : 'never') : '—'),
        h('td', ed ? h('button.icon.danger', { title: 'Remove this recipe', on: { click: () => edit(ctx, 5, t => O().removeRecipe(t, cur()), `Turn-in Race: removed recipe "${r.title.text}"`) } }, '✕') : null)));
    }
    el.appendChild(h('table.items.rt', { style: 'table-layout:fixed;width:100%' }, h('colgroup', ['4%', '26%', '56%', '10%', '4%'].map(w => h('col', { style: `width:${w}` }))), rows));
    if (e.recipes.length < e.values.ROUNDS) el.appendChild(h('p.warn-text', `⛔ Only ${e.recipes.length} recipes for ${e.values.ROUNDS} rounds: the server switches Mini Events off.`));

    // ---- 🎲 random recipes
    if (ed) {
      el.appendChild(h('h3', '🎲 Make random recipes'));
      el.appendChild(h('p.muted.small', 'Parts of normal Madrigal monsters (drop 1 % or more), food / potions they drop or Penya shops sell, and Penya-shop gear, in 4 shapes: "<monster> Hunt" (one part ×30-50), "… and Supplies" (a part + a supply), "… Expedition" (gear ×1 + part ×20 + supply ×20), "<monster> and <monster>" (two parts ×20). No item combination twice. With a big list the server picks never-used ones first, so every event looks new.'));
      const c0 = () => tctx(ws);
      const run = () => {
        try {
          const c = c0(), skip = new Set(e.recipes.map(r => TI().comboKey(r.items.map(x => x.id))));
          S.preview = TI().generate(c, S.n, S.seed, S.mode === 'add' ? skip : new Set());
        } catch (er) { toast(`Could not make recipes: ${er.message}`, 'bad'); S.preview = []; }
        ctx.renderAll(false);
      };
      el.appendChild(h('div.dr-line',
        h('span', 'How many '), numInput({ value: S.n, min: 1, max: 1000, key: 'metr-gn', onCommit: v => { if (v) { S.n = v; S.preview = null; ctx.renderAll(false); } } }),
        h('select', { on: { change: ev => { S.mode = ev.target.value; S.preview = null; ctx.renderAll(false); } } },
          h('option', { value: 'add', selected: S.mode === 'add' }, 'Add to the list'), h('option', { value: 'replace', selected: S.mode === 'replace' }, 'Replace the whole list')),
        h('label.small', h('input', { type: 'checkbox', checked: S.withHints, on: { change: ev => { S.withHints = ev.target.checked; } } }), ' + hints for their items'),
        h('span.muted.small', `seed ${S.seed}`),
        h('button', { on: { click: () => { S.seed = 1 + Math.floor(Math.random() * 99999); run(); } } }, '🎲 Roll'),
        S.preview ? null : h('button', { on: { click: run } }, 'Preview')));
      if (S.preview) {
        const pv = S.preview;
        el.appendChild(h('ol.small', pv.slice(0, 12).map(r => h('li', h('b', r.title), ': ', r.items.map(([id, n]) => `${n} ${iname(ws, id)}`).join(', ')))));
        if (pv.length > 12) el.appendChild(h('p.muted.small', `… and ${pv.length - 12} more.`));
        if (pv.length < S.n) el.appendChild(h('p.warn-text.small', `Only ${pv.length} different recipes could be made from these items (asked for ${S.n}).`));
        el.appendChild(h('div.dr-line', h('button.primary', { disabled: !pv.length, on: { click: () => {
          const c = c0(), used = new Set(pv.flatMap(r => r.items.map(x => x[0])));
          const hm = new Map();
          if (S.withHints) for (const id of [...used].sort((a, b) => a - b)) { if (hintMap.has(id)) continue; const t = TI().hintFor(c, id); if (t) hm.set(id, t); }
          ctx.editGroup(() => {
            const f = ws.files.get(FILE);
            const sp = O().putRecipes(f.text, model(ctx), pv, oc, S.mode);
            return [{ file: FILE, splices: sp }];
          }, `Turn-in Race: ${S.mode === 'replace' ? 'replaced the list with' : 'added'} ${pv.length} random recipes`, [keyOf(5)]);
          if (hm.size) edit(ctx, 5, (t, mm) => O().addHints(t, mm, hm, oc.keyOf), `Turn-in Race: ${hm.size} hints for the new recipes' items`);
          S.preview = null;
          ctx.renderAll(false);
        } } }, `Write ${pv.length} recipes`), h('button', { on: { click: () => { S.preview = null; ctx.renderAll(false); } } }, 'Cancel')));
      }
    }

    // ---- hints
    el.appendChild(h('h3', `Where to get it (${m.hints.length} hints)`));
    el.appendChild(h('p.muted.small', 'The grey line under each item in the Turn-in window, by item: the same line shows in a GM\'s /eventrecipe round. Up to 100 letters. A hint already here is never changed by the buttons below.'));
    if (ed) {
      const recipeIds = [...new Set(e.recipes.flatMap(r => r.items.map(x => x.id)))].filter(id => !hintMap.has(id)).sort((a, b) => a - b);
      el.appendChild(h('div.dr-line',
        h('button', { disabled: !recipeIds.length, on: { click: () => {
          const c = tctx(ws), hm = new Map();
          for (const id of recipeIds) { const t = TI().hintFor(c, id); if (t) hm.set(id, t); }
          if (!hm.size) { toast('No source found for those items.', 'bad'); return; }
          edit(ctx, 5, (t, mm) => O().addHints(t, mm, hm, oc.keyOf), `Turn-in Race: ${hm.size} missing hints for recipe items`);
        } } }, `Write missing hints for recipe items (${recipeIds.length})`),
        h('button', { title: 'Every item that drops, is sold, given by an exchange or found in a box: so a GM\'s /eventrecipe item has a hint too', on: { click: () => {
          const t0 = Date.now(), c = tctx(ws), all = TI().allHints(c), hm = new Map([...all].filter(([id]) => !hintMap.has(id)));
          if (!hm.size) { toast('Every item with a source already has a hint.'); return; }
          edit(ctx, 5, (t, mm) => O().addHints(t, mm, hm, oc.keyOf), `Turn-in Race: hints for ${hm.size} more items (every item with a source)`);
          console.log(`[minievent] allHints ${Date.now() - t0} ms`);
        } } }, 'Write hints for every item with a source')));
      const nh = S.newH, hmsg = h('div.small');
      const hadd = h('button.primary', { on: { click: () => { const id = nh.id, t = nh.text; edit(ctx, 5, (tx, mm) => O().setHint(tx, mm, id, t, oc.keyOf), `Hint for ${iname(ws, id)}: "${t}"`); S.newH = { id: null, text: '' }; ctx.renderAll(false); } } }, '+ Add / change hint');
      const hcheck = () => { let v = nh.id === null ? 'Pick an item' : null; if (!v) try { O().checkHint(nh.text); } catch (er) { v = er.message; } hadd.disabled = !!v; hmsg.className = 'small warn-text'; hmsg.textContent = v && nh.id !== null ? '⛔ ' + v : ''; };
      el.appendChild(h('div.dr-line', FRE.ui.combo({ options: itemOptions(ws), value: nh.id !== null ? ws.itemById(nh.id).define : '', placeholder: 'Item', onPick: d => {
        const v = idOfDefine(ws, d); if (v === undefined) return; nh.id = v >>> 0;
        nh.text = hintMap.has(nh.id) ? hintMap.get(nh.id).text.text : (TI().hintFor(tctx(ws), nh.id) || '');
        ctx.renderAll(false);
      } }), textBox({ value: nh.text, max: 100, placeholder: 'Where to get it (picked items get a suggestion)', width: '30em', key: 'metr-h', onInput: v => { nh.text = v; hcheck(); } }), hadd));
      el.appendChild(hmsg);
      hcheck();
    }
    const hq = S.hq.toLowerCase();
    const hl = m.hints.filter(x => !hq || x.text.text.toLowerCase().includes(hq) || iname(ws, x.id).toLowerCase().includes(hq));
    const hpages = Math.max(1, Math.ceil(hl.length / PAGE));
    if (S.hpage >= hpages) S.hpage = hpages - 1;
    el.appendChild(h('div.dr-line', textBox({ value: S.hq, placeholder: 'Search the hints', width: '20em', key: 'metr-hq', onInput: v => { S.hq = v; S.hpage = 0; ctx.renderAll(false); } }),
      h('span.muted.small', `${hl.length} shown`), hpages > 1 ? h('span', h('button.small', { disabled: S.hpage === 0, on: { click: () => { S.hpage--; ctx.renderAll(false); } } }, '‹'),
        h('span.muted.small', ` page ${S.hpage + 1} / ${hpages} `), h('button.small', { disabled: S.hpage >= hpages - 1, on: { click: () => { S.hpage++; ctx.renderAll(false); } } }, '›')) : null));
    const hrows = [h('tr', h('th', 'Item'), h('th', 'Where to get it'), h('th', ''))];
    for (const x of hl.slice(S.hpage * PAGE, S.hpage * PAGE + PAGE)) {
      const shown = hintMap.get(x.id) === x;
      hrows.push(h('tr', h('td', iname(ws, x.id), shown ? null : h('div.small.warn-text', 'not shown: a later line wins')),
        h('td', textBox({ value: x.text.text, disabled: !ed, max: 100, key: `metr-ht|${x.start}`, onCommit: v => {
          try { O().checkHint(v); } catch (er) { toast(er.message, 'bad'); ctx.renderAll(false); return; }
          edit(ctx, 5, tx => [{ start: x.text.start, end: x.text.end, insert: `"${v}"` }], `Hint for ${iname(ws, x.id)}: "${v}"`);
        } })),
        h('td', ed ? h('button.icon.danger', { title: 'Remove this hint', on: { click: () => edit(ctx, 5, tx => FRE.textOps.removeRow(tx, x), `Removed the hint for ${iname(ws, x.id)}`) } }, '✕') : null)));
    }
    el.appendChild(h('table.items.rt', { style: 'table-layout:fixed;width:100%' }, h('colgroup', ['32%', '64%', '4%'].map(w => h('col', { style: `width:${w}` }))), hrows));

    // ---- the next runs + try turning in
    if (e.recipes.length) {
      const hist = new Map(asked || []), now = Math.floor(Date.now() / 1000);
      const runs = Sim().askRuns(e, 5, hist, now, 86400, 3, st.seed);
      el.appendChild(h('h3', 'The next 3 events (one a day)'));
      el.appendChild(h('ol.small', runs.map(r => h('li', r.order.map(i => e.recipes[i].title.text).join(', ')))));
      if (S.tryR >= e.recipes.length) S.tryR = 0;
      const r = e.recipes[S.tryR], rec = recipeOf(r);
      el.appendChild(h('h3', '🧺 Try turning in'));
      el.appendChild(h('div.dr-line', h('select', { style: 'max-width:26em', on: { change: ev => { S.tryR = Number(ev.target.value); S.have = {}; ctx.renderAll(false); } } },
        e.recipes.map((x, i) => h('option', { value: i, selected: i === S.tryR }, x.title.text)))));
      const bagRows = [h('tr', h('th', 'Item'), h('th', 'Needed'), h('th', 'In your bag'), h('th', 'Equipped / locked'), h('th', 'Under it in the window'))];
      for (const [id, n] of rec.items) {
        const hv = S.have[id] || (S.have[id] = { bag: n, locked: 0 });
        bagRows.push(h('tr', h('td', iname(ws, id)), h('td', String(n)),
          h('td', numInput({ value: hv.bag, min: 0, max: 99999, key: `metr-bag|${id}`, onCommit: v => { hv.bag = v || 0; ctx.renderAll(false); } })),
          h('td', numInput({ value: hv.locked, min: 0, max: 99999, key: `metr-lk|${id}`, onCommit: v => { hv.locked = v || 0; ctx.renderAll(false); } })),
          h('td.muted.small', hintMap.has(id) ? hintMap.get(id).text.text : '(no hint)')));
      }
      el.appendChild(table(['30%', '10%', '16%', '16%', '28%'], bagRows));
      const bag = [];
      for (const [id] of rec.items) { const hv = S.have[id]; if (hv.locked) bag.push({ id, n: hv.locked, equip: true }); if (hv.bag) bag.push({ id, n: hv.bag }); }
      const res = TI().turnIn(rec, bag, id => iname(ws, id));
      el.appendChild(h(res.ok ? 'p.ok-text' : 'p.warn-text', res.ok ? `✓ Turned in! ${rec.items.map(([id, n]) => `${n} ${iname(ws, id)}`).join(', ')} taken; left in the bag: ${rec.items.map(([id]) => `${res.bag.filter(s => s && s.id === id && !s.equip).reduce((t, s) => t + s.n, 0)} ${iname(ws, id)}`).join(', ')}.` : res.msg));
    }
  }

  // a made-up event: N players, random picks (repeatable), the server's scoring and prizes
  function tryView(el, ctx, e) {
    el.appendChild(h('h3', '🎲 Try it'));
    const box = h('div');
    el.appendChild(h('div.dr-line', h('span', 'Players'), numInput({ value: st.players, min: 1, max: 500, key: `metry|${e.type}`, onCommit: n => { if (n) { st.players = n; ctx.renderAll(false); } } }),
      h('button', { on: { click: () => { st.seed++; ctx.renderAll(false); } } }, 'Play again'), h('span.muted.small', `${e.values.ROUNDS} rounds, random picks; the scoring and prizes are the server's.`)));
    const ws = ctx.ws;
    const r = Sim().run(Sim().sample(e.type, e, st.players, st.seed), id => { const it = itemOf(ws, id); return it ? { packMax: FRE.specItem.get(it, 'dwPackMax') } : null; });
    const rows = [h('tr', h('th', 'Place'), h('th', 'Player'), h('th', 'Points'), h('th', e.type === 4 ? 'Place sum' : 'Time (s)'), h('th', 'Prize'))];
    for (const p of r.final.slice(0, 12)) rows.push(h('tr', h('td', String(p.place)), h('td', p.name), h('td', String(p.points)), h('td', String(p.time)),
      h('td', p.prize === null || !p.stacks.length ? 'nothing' : `${p.stacks.reduce((a, b) => a + b, 0)} × ${nameOf(ws, p.prize)}${p.stacks.length > 1 ? ` (${p.stacks.length} stacks)` : ''}${p.top ? '' : ' (everyone else)'}`)));
    if (r.final.length > 12) rows.push(h('tr', h('td', { colspan: 5 }, h('span.muted', `… ${r.final.length - 12} more`))));
    box.appendChild(h('table.items.rt', rows));
    el.appendChild(box);
  }

  function weekView(el, ctx) {
    const m = model(ctx), T = M().TYPES;
    el.appendChild(h('div.npc-title', h('h2', 'Start times (the week)')));
    el.appendChild(h('p', 'Registration opens before each start time (each event\'s "Registration" minutes). RANDOM picks one of the events that are on for random start times. A start time is skipped while FFA, TDM, Guild Siege or Free PK Time is running.'));
    const rows = [h('tr', h('th', 'Day'), h('th', 'Time'), h('th', 'Event'))];
    for (const b of m.begins) rows.push(h('tr', h('td', DAYS[b.day.value] || String(b.day.value)), h('td', `${two(b.hour.value)}:${two(b.minute.value)}`),
      h('td', b.type ? T[b.type].name : `Random (${m.events.filter(e => e && e.loaded && e.values.IN_RANDOM).map(e => e.name).join(', ') || 'none'})`)));
    el.appendChild(h('table.items.rt', rows));
    el.appendChild(h('p.muted.small', 'Editing the start times comes in a later step.'));
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
