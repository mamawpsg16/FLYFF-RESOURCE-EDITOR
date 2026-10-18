// Mini Events: one page per event (the user, 2026-10-18: "each event should have a separate menu ... as they have separate
// mechanics", "set prize separately for each event"): its settings, its prizes (places 1-10 + everyone else), its round
// points, and a "Try it" run; + the week's start times. MiniEvent.inc, WorldServer only (loaders/minievent.js = ReadConfig).
// The question / recipe / spot lists and the schedule editor come in the next steps (guides NEXT_TASKS_PLAN.md 1b).
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus, numInput } = FRE.dom;
  const { diagRow } = FRE.ui;
  const FILE = 'minievent.inc';
  const st = { sel: 1, players: 12, seed: 1, q: '', page: 0, tryAsk: 0, typed: '', newQ: { 2: { question: '', info: '' }, 3: { question: '', truth: true } } };
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
      el.appendChild(table(Array(11).fill('9%'), h('tr', cells)));
      el.appendChild(h('p.muted.small', 'Rules the server checks: 0 - 999, never going up from 1st to 10th, and 10th more than the rest.'));
    }

    // what this event's list holds (edited in the next steps)
    const list = e.type === 2 || e.type === 3 ? `${e.asks.length} question${e.asks.length === 1 ? '' : 's'}` : e.type === 5 ? `${e.recipes.length} recipes` : e.type === 6 ? `${e.spots.length} hiding spots` : null;
    if (e.type === 2 || e.type === 3) questionsView(el, ctx, e);
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
