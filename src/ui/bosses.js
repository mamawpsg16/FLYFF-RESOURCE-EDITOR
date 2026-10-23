// Boss Mechanics: each boss's attack rows, how often it attacks, its tier, signature attack and phases (bossMechanics.inc, V19
// branch feat/boss-patterns). loaders/bosses.js reads + checks it (the branch checker), loaders/bosses-sim.js says what each swing
// does (the planned dispatcher), edit/bosses-ops.js writes it, ui/bosses-preview.js draws the shapes (simulator.html).
// The user, 2026-10-23: boss list, edit rows, attack chance %, live preview, safe save; skills are picked only (propSkillAdd stays as is).
// Design v3 (8da5dc21): the arena (typed, or from pasted /position lines) and one page with every shape (filter by tier, Add to boss).
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus, modal } = FRE.dom;
  const { diagRow, fieldLabel, formFooter } = FRE.ui;
  const FILE = 'bossmechanics.inc';
  const st = { sel: null, show: 'all', prev: null, player: null, log: [], cards: [], shapeTier: 'all', arenaPaste: '' };
  const SHAPES_PAGE = '#shapes';
  const B = () => FRE.bosses, O = () => FRE.bossesOps, Sim = () => FRE.bossSim, P = () => FRE.bossPreview;
  const model = ctx => ctx.ws.models.bosses;
  const can = ctx => ctx.ws.isEditable(FILE);
  const keyOf = name => `bosses|${name}`;
  const pc = p => `${Math.round(p * 1000) / 10} %`;
  const nameOf = b => (b.mover ? b.mover.name : b.name);
  const tierWord = v => (v ? v.replace('BOSSTIER_', '').toLowerCase().replace(/^./, c => c.toUpperCase()) : 'Custom');
  const shapeName = t => { const i = FRE.bossPreview && FRE.bossPreview.info(t); return i ? i.name : B().shortType(t); };
  const shapeLabel = t => `${shapeName(t)} (${B().TIER_WORD[B().TIER_OF[t]] || '?'})`;
  const bDiags = (ctx, b) => ctx.ws.diags.filter(d => d.module === 'bosses' && d.start >= b.start && d.start <= b.end);
  const isInorder = b => !!b.inorder && b.inorder.value === '1';
  const HIT_WORDS = { BOSSATK_HITSELF: 'around the boss', BOSSATK_HITTARGET: 'on the player it fights', BOSSATK_HITTYPE_ALL: 'on every player near it (16 m)' };
  const DELAY_WORDS = { NO_DELAY: 'explode on time', RANDOM_DELAY: 'each mark a bit late (0-1 s, random)' };
  const APPLY_WORDS = { APPLY_INSTANT: 'all at once', APPLY_STEP: 'one by one' };

  const SHOW = [
    { v: 'all', label: 'All bosses', test: () => true },
    ...B().TIERS.map(t => ({ v: t, label: `${tierWord(t)} tier`, test: b => !!b.tier && b.tier.value === t })),
    { v: 'notier', label: 'Custom (no tier)', test: b => !b.tier },
    { v: 'problems', label: 'With problems', test: (b, ctx) => bDiags(ctx, b).length > 0 },
    { v: 'edited', label: 'Edited', test: (b, ctx) => ctx.edited.has(keyOf(b.name)) },
  ];

  function stopPreview() { if (st.player) { st.player.stop(); st.player = null; } st.cards.forEach(c => c.stop()); st.cards = []; }

  const mod = {
    id: 'bosses', label: 'Boss Mechanics', searchPlaceholder: 'Search bosses', noItems: true,
    help: 'Boss Mechanics: which attack shapes each boss uses, how often, its signature attack and its phases',
    st,
    onLoad() { stopPreview(); st.sel = null; st.show = 'all'; st.prev = null; st.log = []; st.shapeTier = 'all'; st.arenaPaste = ''; },

    listExtra(ctx) {
      const m = model(ctx);
      return h('div.bx-filters',
        h('select.npc-filter', { title: 'Which bosses', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
          SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${m.bosses.filter(b => o.test(b, ctx)).length})`))),
        h('button', { disabled: !can(ctx), title: 'Give another boss, mid boss or giant its own attack shapes', on: { click: () => newBossDialog(ctx) } }, '+ New boss'),
        h('button' + (st.sel === SHAPES_PAGE ? '.primary' : ''), { title: 'Every attack shape on one page: watch them, filter by difficulty, add one to a boss', on: { click: () => { stopPreview(); st.sel = SHAPES_PAGE; ctx.renderAll(false); } } }, '🗂 All shapes'));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      const list = m.bosses.filter(b => test(b, ctx) && (!q || b.name.toLowerCase().includes(q) || nameOf(b).toLowerCase().includes(q)));
      for (const b of list) {
        const n = bDiags(ctx, b).length, t = Sim().chances(b, -1);
        el.appendChild(h('div.npc.bx-row' + (st.sel === b.name ? '.sel' : ''), { 'data-boss': b.name, on: { click: () => { stopPreview(); st.sel = b.name; st.prev = null; st.log = []; ctx.renderAll(false); } } },
          h('div.bx-text', h('div.n', h('span', nameOf(b)), h('span', ctx.edited.has(keyOf(b.name)) ? h('span.tag.edit', 'edited') : null, n ? h('span.tag.bad', '⛔' + n) : null)),
            h('div.k', `${b.name} · ${tierWord(b.tier && b.tier.value)} · attacks ${pc(t.attack)}${b.sig ? ' · signature' : ''}${b.phases.length ? ` · ${b.phases.length} phase${b.phases.length > 1 ? 's' : ''}` : ''}`))));
      }
      if (!list.length) el.appendChild(h('div.pad.muted', 'No bosses match.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        if (st.sel === SHAPES_PAGE) { shapesView(el, ctx); return; }
        const b = st.sel === null ? null : model(ctx).byName.get(st.sel);
        if (!b) { stopPreview(); el.appendChild(h('p.empty-state', 'Pick a boss on the left to change its attack shapes, how often it attacks, its signature attack and its phases.')); return; }
        bossView(el, ctx, b);
      });
    },

    addTarget() { return { ok: false, title: 'Boss attacks use skills, not items' }; },
    locate(d, ctx) {
      if (d.module !== 'bosses') return false;
      const b = model(ctx).bosses.find(x => d.start >= x.start && d.start <= x.end);
      if (b) st.sel = b.name;
      return true;
    },
  };

  // one edit of one boss, planned on the text as it is now (the model is read again after every edit)
  const edit = (ctx, name, plan, label, mergeKey) => ctx.editGroup(() => {
    const b = model(ctx).byName.get(name), f = ctx.ws.files.get(FILE);
    return [{ file: FILE, splices: plan(f.text, b) }];
  }, label, [keyOf(name)], mergeKey);

  // a select of words with plain labels
  const pick = (opts, cur, onChange, disabled, key) => h('select', { disabled, 'data-key': key || null, on: { change: e => onChange(e.target.value) } },
    opts.map(([v, label]) => h('option', { value: v, selected: v === cur }, label)));
  const skillOpts = (m, cur) => {
    const list = m.bombSkills.map(s => { const r = m.skillRows.get(s); return [s, `${s.replace(/^SI_/, '')} (${r.bomb.replace('TYPE_', '').toLowerCase()}, ${r.range} m, ${(r.timer || 0) / 1000} s)`]; });
    if (cur && cur !== '0' && !m.bombSkills.includes(cur)) list.unshift([cur, `${cur} (not a bomb skill)`]);
    return list;
  };

  function bossView(el, ctx, b) {
    const m = model(ctx), ed = can(ctx) && !!b.close, f = ctx.ws.files.get(FILE);
    const mv = b.mover;
    el.appendChild(h('div.npc-title', h('h2', nameOf(b)), h('span.def', `${b.name}${mv ? ` · ${mv.rank} · level ${mv.level}` : ' · not in propMover.txt'} · line ${b.line}`),
      can(ctx) ? null : h('span.tag.bad', 'read-only')));
    if (!b.close) el.appendChild(h('p.warn-text', '⛔ This block has no "}": fix the file by hand first.'));
    el.appendChild(h('div.dr-line',
      h('button', { disabled: !ed, on: { click: () => sigDialog(ctx, b) } }, FRE.ui.pencil(), ' Edit signature'),
      h('button', { disabled: !ed, on: { click: () => phaseDialog(ctx, b) } }, FRE.ui.pencil(), ' Edit phases'),
      h('button', { disabled: !ed, on: { click: () => removeDialog(ctx, b) } }, '🗑 Remove boss')));

    // how it picks + tier + chance
    const t0 = Sim().chances(b, -1);
    const mix = b.tier ? B().mixOf(b.tier.value, b.shapes) : null;
    const tierOpts = [['', 'Custom: any shapes (no tier line)'], ...B().TIERS.map(t => [t, `${tierWord(t)}: ${sayMix(B().MIX[t])}`])];
    el.appendChild(h('div.mt-simple',
      h('h3', 'How it attacks'),
      h('div.mt-simple-row', h('label', h('b', 'Order of attacks'), h('div.muted.small', 'Every time the boss swings, it takes one line of the attack list below.')),
        pick([['0', 'Random: any line each swing'], ['1', 'In order: line 1, 2, 3 … then again']], b.inorder ? b.inorder.value : '0',
          v => edit(ctx, b.name, (t, x) => O().setInorder(t, x, v), `${nameOf(b)}: attacks ${v === '1' ? 'in order' : 'random'}`), !ed, `bm|${b.name}|inorder`)),
      h('div.mt-simple-row', h('label', h('b', 'Difficulty mix'), h('div.muted.small', 'A preset says how many easy / medium / hard attack shapes the boss must use (checked before Save). Custom = any mix you like, e.g. all hard.'),
        mix ? h('div.small' + (mix.ok ? '.muted' : '.warn-text'), `${mix.ok ? '✓' : '⛔'} ${tierWord(b.tier.value)} needs ${mix.want} different shapes · has ${mix.have}`) : null),
        pick(tierOpts, b.tier ? b.tier.value : '', v => edit(ctx, b.name, (t, x) => O().setTier(t, x, v || null), `${nameOf(b)}: tier ${tierWord(v || null)}`), !ed, `bm|${b.name}|tier`)),
      arenaRow(ctx, b, ed),
      h('div.mt-simple-row', h('label', h('b', 'Attack chance'), h('div.muted.small', `${b.live} attack line${b.live === 1 ? '' : 's'} out of ${b.rows.length} = ${pc(t0.attack)} of its swings are a special attack (the rest are normal hits).` +
        ' Type a new %: the editor adds or removes "No attack" lines for you.')),
        h('div', chanceInput(ctx, b, t0.attack, ed), h('span.muted', ' %')))));

    rowsView(el, ctx, b, ed);
    sigView(el, ctx, b);
    phasesView(el, ctx, b);
    whatView(el, ctx, b);
    previewView(el, ctx, b);
    const ds = bDiags(ctx, b);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
    el.appendChild(h('p.muted.small', `After saving: run Stop Server.bat, then Start Server.bat. The WorldServer reads ${f.name} only when built from V19 branch feat/boss-patterns (its C++ is not written yet).`));
  }
  const sayMix = d => Object.keys(d).sort().map(k => `${d[k]} ${B().TIER_WORD[k]}`).join(' + ');
  // the shapes of this boss (rows + signature) that need its arena
  const arenaNeeds = b => { const n = b.shapes.filter(x => B().ARENA_SHAPES.includes(x)); const sk = b.sig && b.sig.words[0]; if (sk && B().ARENA_SHAPES.includes(sk) && !n.includes(sk)) n.push(sk); return n; };

  // Arena (design v3): a number 12-48, or pasted /position lines (the boss's spot, then the room's edge)
  function arenaRow(ctx, b, ed) {
    const needs = arenaNeeds(b), cur = b.arena ? b.arena.value : null;
    const set = (v, how) => edit(ctx, b.name, (t, x) => O().setArena(t, x, v), `${nameOf(b)}: ${v === null ? 'arena line removed' : `arena ${v} m${how ? ` (${how})` : ''}`}`, `bm|${b.name}|arena`);
    const inp = h('input.num-input', { type: 'text', inputMode: 'numeric', value: cur === null ? '' : String(cur), placeholder: needs.length ? '12-48' : 'none', disabled: !ed, 'data-key': `bm|${b.name}|arena`, title: '12 to 48 m' });
    inp.dataset.value = inp.value;
    const commit = quiet => {
      if (!inp.isConnected || inp.value.trim() === inp.dataset.value) return;
      const t = inp.value.trim();
      if (t === '') { if (needs.length) { if (!quiet) toast(`Arena is needed by ${needs.map(shapeName).join(', ')} (they reach the players in the room)`, 'bad'); return; } inp.dataset.value = ''; set(null); return; }
      const v = Number(t);
      if (!(Number.isInteger(v) && v >= 12 && v <= 48)) { if (!quiet) toast('Type an arena between 12 and 48 m (a whole number)', 'bad'); return; }
      inp.dataset.value = t; set(v);
    };
    FRE.dom.liveCommit(inp, () => commit(true), 700);
    inp.addEventListener('change', () => commit(false));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    // the paste box: live result, Use it
    const res = h('div.small'), use = h('button', { disabled: true }, 'Use it');
    const ta = h('textarea.bm-paste', { rows: 3, cols: 60, disabled: !ed, value: st.arenaPaste, placeholder: 'Paste /position lines: first where the boss stands, then 1 or more spots on the room\'s edge\nPosition : x = 6970.000000, y = 100.000000, z = 3337.000000' });
    const show = () => {
      const r = B().arenaFromPositions(ta.value);
      res.textContent = ''; use.disabled = !ed || r.arena === null || r.arena === cur;
      if (!ta.value.trim()) return;
      if (r.arena === null) res.appendChild(h('span.warn-text', r.spots.length ? 'Now paste at least one spot on the room\'s edge (line 2 on).' : 'No /position line found yet.'));
      else res.appendChild(h('span.ok-text', `${r.spots.length - 1} edge spot${r.spots.length > 2 ? 's' : ''}: farthest ${r.far} m from the boss → arena ${r.arena} m${r.clamped ? ' (kept in 12-48)' : ''}${r.arena === cur ? ' (already set)' : ''}`));
      if (r.skipped.length) res.appendChild(h('div.muted', `Skipped ${r.skipped.length} line${r.skipped.length > 1 ? 's' : ''} that are not /position: ${r.skipped.slice(0, 2).join(' | ')}`));
    };
    ta.addEventListener('input', () => { st.arenaPaste = ta.value; show(); });
    use.addEventListener('click', () => { const r = B().arenaFromPositions(ta.value); if (r.arena === null) return; st.arenaPaste = ''; set(r.arena, `from ${r.spots.length} pasted /position lines, farthest ${r.far} m`); });
    show();
    return h('div.mt-simple-row',
      h('label', fieldLabel('Arena (m)', needs.length > 0),
        h('div.muted.small', 'The boss\'s room: how far from the boss its attacks reach players (12-48 m). ' + (needs.length ? `Needed by ${needs.map(shapeName).join(', ')}.` : 'None of its shapes needs it (empty = no arena line).')),
        cur === null && needs.length ? h('div.small.warn-text', '⛔ No arena yet: type it or paste /position lines.') : null),
      h('div', h('div', inp, h('span.muted', ' m')), ta, h('div.dr-line', use, res)));
  }

  function chanceInput(ctx, b, now, ed) {
    const el = h('input.num-input', { type: 'text', inputMode: 'decimal', value: String(Math.round(now * 1000) / 10), disabled: !ed, 'data-key': `bm|${b.name}|chance`, title: '1 to 100' });
    el.dataset.value = el.value;
    const commit = quiet => {
      if (!el.isConnected || el.value.trim() === el.dataset.value) return;
      const v = Number(el.value.trim().replace(',', '.').replace(/%$/, ''));
      if (!(v >= 1 && v <= 100)) { if (!quiet) toast('Type an attack chance between 1 and 100 %', 'bad'); return; }
      el.dataset.value = el.value.trim();
      const r = Sim().spread(O().wordsOf(b), v);
      edit(ctx, b.name, (t, x) => O().setChance(t, x, v), `${nameOf(b)}: attack chance ${pc(r.pct / 100)} (${r.real} attacks in ${r.total} rows; was ${pc(now)})`, `bm|${b.name}|chance`);
    };
    FRE.dom.liveCommit(el, () => commit(true), 700);
    el.addEventListener('change', () => commit(false));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    return el;
  }

  function rowsView(el, ctx, b, ed) {
    const m = model(ctx), rows = O().wordsOf(b);
    const set = (next, label) => edit(ctx, b.name, (t, x) => O().setRows(t, x, next), `${nameOf(b)}: ${label}`);
    const tb = h('tbody');
    rows.forEach((w, i) => {
      const n = i + 1, none = w[0] === 'ATTACK_NONE';
      const change = (k, v, what) => { const next = rows.map(r => r.slice()); next[i][k] = v;
        if (k === 0 && v !== 'ATTACK_STORM') next[i][4] = '0';
        set(next, `line ${n} ${what}`); };
      const moves = h('td.nowrap',
        h('button.icon', { disabled: !ed || i === 0, title: 'Move up', on: { click: () => { const x = rows.slice(); [x[i - 1], x[i]] = [x[i], x[i - 1]]; set(x, `line ${n} moved up`); } } }, '↑'),
        h('button.icon', { disabled: !ed || i === rows.length - 1, title: 'Move down', on: { click: () => { const x = rows.slice(); [x[i + 1], x[i]] = [x[i], x[i + 1]]; set(x, `line ${n} moved down`); } } }, '↓'),
        h('button.icon', { disabled: !ed, title: 'Remove the row', on: { click: () => set(rows.filter((_, j) => j !== i), `line ${n} removed (${none ? 'no attack' : shapeName(w[0])})`) } }, '✕'),
        none ? null : h('button.icon', { title: 'Show this attack in the preview', on: { click: () => { st.prev = { kind: 'row', i }; showPreview(ctx, true); } } }, '▶'));
      if (none) { tb.appendChild(h('tr.muted', h('td', n), h('td', { colSpan: 6 }, 'No attack (a normal hit only)'), moves)); return; }
      const types = B().LIVE.map(t => [t, shapeLabel(t)]);
      if (!B().LIVE.includes(w[0])) types.unshift([w[0], `${w[0]} (unknown)`]);
      tb.appendChild(h('tr' + (st.prev && st.prev.kind === 'row' && st.prev.i === i ? '.sel' : ''), h('td', n),
        h('td', pick(types, w[0], v => change(0, v, `shape ${shapeName(v)}`), !ed)),
        h('td', pick(B().HITS.map(x => [x, HIT_WORDS[x]]), w[1], v => change(1, v, `hits ${HIT_WORDS[v]}`), !ed)),
        h('td', pick(skillOpts(m, w[2]), w[2], v => change(2, v, `skill ${v}`), !ed)),
        h('td', pick(B().DELAYS.map(x => [x, DELAY_WORDS[x]]), w[3], v => change(3, v, DELAY_WORDS[v]), !ed)),
        h('td', w[0] === 'ATTACK_STORM' ? pick([['0', '(pick what falls)'], ...skillOpts(m, w[4])], w[4], v => change(4, v, `storm skill ${v}`), !ed) : h('span.muted.small', '—')),
        h('td', pick(B().APPLIES.map(x => [x, APPLY_WORDS[x]]), w[5], v => change(5, v, APPLY_WORDS[v]), !ed)), moves));
    });
    el.appendChild(h('h3', `Attack list (${b.rows.length} lines)`));
    el.appendChild(h('p.muted.small', 'Each line is one possible swing. An attack line puts marks on the ground that explode after a moment (players must step out); "No attack" = a normal hit. More "No attack" lines = fewer special attacks.'));
    el.appendChild(h('table.items.rt', h('thead', h('tr', ['#', 'Attack shape (difficulty)', 'Where', 'Damage (skill)', 'Explode timing', 'Storm drops', 'Marks appear', ''].map(x => h('th', x)))), tb));
    const first = m.bombSkills.includes('SI_BOSSATTACK_LOWDMG_1') ? 'SI_BOSSATTACK_LOWDMG_1' : m.bombSkills[0];
    el.appendChild(h('div.dr-line',
      h('button', { disabled: !ed || !first, on: { click: () => set([...rows, ['ATTACK_TARGET', 'BOSSATK_HITTARGET', first, 'NO_DELAY', '0', 'APPLY_INSTANT']], 'attack line added (Target)') } }, '+ Attack line'),
      h('button', { disabled: !ed, on: { click: () => set([...rows, B().NONE_ROW.slice()], 'no-attack line added') } }, '+ No-attack line'),
      h('span.muted.small', 'Changes are written at once (Ctrl+Z undoes them); the checks below update right away.')));
  }

  function sigView(el, ctx, b) {
    el.appendChild(h('h3', 'Signature attack'));
    if (!b.sig) { el.appendChild(h('div.dr-line', h('span.muted', 'None. A signature is a big attack every N swings, announced by a shout 1.5 s before it lands.'),
      h('button', { disabled: !can(ctx) || !b.close, on: { click: () => sigDialog(ctx, b, true) } }, '+ Add signature'))); return; }
    const w = b.sig.words;
    el.appendChild(h('div.dr-line', h('span', `Every ${w[3]} swings: shout ${w[4] || ''}, then 1.5 s later ${shapeName(w[0])} ${HIT_WORDS[w[1]] || w[1]} with ${w[2]}.`),
      h('button.icon', { title: 'Show it in the preview', on: { click: () => { st.prev = { kind: 'sig' }; showPreview(ctx, true); } } }, '▶')));
  }

  function phasesView(el, ctx, b) {
    el.appendChild(h('div.dr-line', h('h3', `Phases (${b.phases.length} of 4)`),
      h('button', { disabled: !can(ctx) || !b.close || b.phases.length >= 4, title: 'Opens Edit phases with a new phase at the end', on: { click: () => phaseDialog(ctx, b, true) } }, '+ Add phase'),
      b.phases.length ? h('button', { disabled: !can(ctx) || !b.close, on: { click: () => phaseDialog(ctx, b) } }, FRE.ui.pencil(), ' Edit phases') : null));
    if (!b.phases.length) { el.appendChild(h('p.muted', 'None: the boss fights the same way down to 0 HP.')); return; }
    el.appendChild(h('table.items.rt', h('thead', h('tr', ['Below HP', 'Swing time', 'Easy', 'Medium', 'Hard weight', 'Shout'].map(x => h('th', x)))),
      h('tbody', b.phases.map(p => h('tr', h('td', `${p.hp} %`), h('td', `${p.speed} %`), h('td', String(p.w[0])), h('td', String(p.w[1])), h('td', String(p.w[2])), h('td', p.shout || h('span.muted', '—')))))));
  }

  function whatView(el, ctx, b) {
    el.appendChild(h('h3', 'What happens in the fight'));
    const tab = Sim().table(b), shapes = [...new Set(b.rows.map(r => r.words[0]).filter(t => t !== 'ATTACK_NONE'))];
    const swing = b.mover ? b.mover.reAttack : null;
    if (isInorder(b)) el.appendChild(h('p.small', `Rows in order: swing 1 uses row 1, swing 2 row 2, … then again from row 1. Phase weights do not change the order (only the swing time).`));
    const head = ['', 'Swing every', 'Attacks', ...shapes.map(shapeLabel)];
    const rows = tab.map(t => h('tr', h('td', t.phase < 0 ? 'Full HP' : `Below ${t.hp} %`),
      h('td', swing === null ? `${t.speed} %` : `${((swing - 1000) * t.speed / 100 / 1000).toFixed(1)}-${((swing + 1000) * t.speed / 100 / 1000).toFixed(1)} s`),
      h('td', isInorder(b) ? pc(b.live / b.rows.length) : pc(t.attack)),
      ...shapes.map(s => h('td', isInorder(b) ? pc(b.rows.filter(r => r.words[0] === s).length / b.rows.length) : t.byShape[s] ? pc(t.byShape[s]) : h('span.muted', 'off')))));
    el.appendChild(h('table.items.rt', h('thead', h('tr', head.map(x => h('th', x)))), h('tbody', rows)));
    const lines = h('ul.small');
    if (!isInorder(b)) for (const t of tab) {
      if (!t.attack) continue;
      lines.appendChild(h('li', `${t.phase < 0 ? 'Full HP' : `Below ${t.hp} %`}: of its attacks ${[1, 2, 3].filter(k => t.byTier[k]).map(k => `${pc(t.byTier[k] / t.attack)} ${B().TIER_WORD[k]}`).join(', ')}.${t.shout ? ` Shout on entering: "${t.shout}".` : ''}`));
    }
    if (b.sig && b.sig.words.length === 5) lines.appendChild(h('li', `Every ${b.sig.words[3]} swings (in every phase) the signature replaces that swing's row.`));
    lines.appendChild(h('li', 'While the marks of its last attack are still on the ground, a swing starts no new attack (no stacking).'));
    el.appendChild(lines);
  }

  // the preview: one row / the signature looping, or the whole fight played from the simulator's swings
  // the preview part only is drawn again (a full redraw would jump the page back to the top)
  function previewView(el, ctx, b) {
    const box = h('div.bm-prev-box');
    el.appendChild(box);
    fillPreview(box, ctx, b);
  }
  function showPreview(ctx, scroll) {
    const box = document.querySelector('#editor .bm-prev-box'), b = model(ctx).byName.get(st.sel);
    if (!box || !b) { ctx.renderAll(false); return; }
    box.textContent = '';
    fillPreview(box, ctx, b);
    if (scroll) box.scrollIntoView({ block: 'nearest' });
  }
  function fillPreview(el, ctx, b) {
    const m = model(ctx);
    P().setSkills(m.skillRows);
    P().setArena(b.arena ? b.arena.value : 16);
    el.appendChild(h('h3', 'Preview'));
    const cv = h('canvas.bm-canvas', { width: 520, height: 520 });
    const log = h('ul.small.bm-log');
    const fightBtn = h('button.primary', { disabled: !b.rows.length, on: { click: () => { st.prev = { kind: 'fight', seed: Date.now() & 0xffff }; st.log = []; showPreview(ctx); } } }, '▶ Play the fight');
    el.appendChild(h('div.dr-line', fightBtn, h('button', { on: { click: () => { stopPreview(); st.prev = null; st.log = []; showPreview(ctx); } } }, '■ Stop'),
      h('span.muted.small', `Boss in the middle, dashed circle = its arena (${b.arena ? b.arena.value : '16, no arena line'} m), 3 players in it (P1 = its target). Marks fill up, then explode. Pick ▶ on a row to see one attack.`)));
    el.appendChild(h('div.bm-preview', cv, log));
    stopPreview();
    const p = st.prev;
    const sigAttack = () => { const w = b.sig.words; return P().rowAttack([w[0], w[1], w[2], 'NO_DELAY', '0', 'APPLY_INSTANT']); };
    if (p && p.kind === 'row' && b.rows[p.i]) {
      const a = P().rowAttack(b.rows[p.i].words);
      log.appendChild(h('li', `Row ${p.i + 1}: ${shapeName(a.type)} — ${(P().info(a.type) || {}).text || ''}`));
      if (!P().drawable(a)) log.appendChild(h('li.warn-text', 'Cannot draw it: a Storm row needs a storm skill.'));
      st.player = P().loop(cv, a);
    } else if (p && p.kind === 'sig' && b.sig && b.sig.words.length === 5) {
      log.appendChild(h('li', `Signature: ${shapeName(b.sig.words[0])} — ${(P().info(b.sig.words[0]) || {}).text || ''}`));
      st.player = P().loop(cv, sigAttack());
    } else if (p && p.kind === 'fight') {
      // the simulator's swings; HP goes down 3 % a swing; busy = the last attack's marks still on the ground (no stacking)
      const f = Sim().fight(b, { seed: p.seed, reAttack: b.mover ? b.mover.reAttack : 2000 }), plan = [];
      let at = 300, hp = 100, busy = 0;
      for (let k = 0; k < 34 && hp > 1; k++) {
        hp = Math.max(1, hp - 3);
        const s = f.swing(hp, at < busy);
        let a = null, extra = 0;
        if (s.kind === 'signature') { a = sigAttack(); extra = 1500; }
        else if (s.kind === 'row') a = P().rowAttack(b.rows[s.row].words);
        if (a) busy = Math.max(busy, at + P().busyFor(a, extra));
        const what = s.kind === 'busy' ? 'its last attack is still on the ground: no new one' : s.kind === 'signature' ? `SIGNATURE ${shapeName(a.type)} in 1.5 s` : s.kind === 'row' ? `row ${s.row + 1} ${shapeName(a.type)}` : 'no attack';
        plan.push({ at, a, extra, text: `HP ${hp} %${s.phase >= 0 ? ` (phase ${s.phase + 1})` : ''} · swing ${s.n}: ${what}${s.shouts.length ? ` — "${s.shouts.join('" / "')}"` : ''}` });
        at += Math.max(500, s.delay);
      }
      log.appendChild(h('li.muted', `Fight started: ${plan.length} swings, HP 100 % down to ${hp} %.`));
      st.player = P().play(cv, plan, (k, s) => {
        if (k < 0) { log.insertBefore(h('li.muted', 'Fight over.'), log.firstChild); return; }
        log.insertBefore(h('li' + (/SIGNATURE|"/.test(s.text) ? '.bm-shout' : ''), s.text), log.firstChild);
      });
    } else log.appendChild(h('li.muted', 'Press ▶ Play the fight, or ▶ on a row.'));
  }

  // the checks of a planned change: the op's own refusal, then every checker error of this boss in the text it would write
  function tryPlan(ctx, name, plan) {
    const f = ctx.ws.files.get(FILE), m = model(ctx), b = m.byName.get(name);
    try {
      const sp = plan(f.text, b);
      const text = FRE.SourceFile.spliceText(f.text, sp, f.kind, f.name);
      const r = B().parse(text, { monsters: m.monsters, skills: m.skills, bombs: m.bombs });
      const nb = r.bosses.find(x => x.name === name);
      const errs = r.errors.filter(e => e.mi === name && !m.errors.some(o => o.mi === name && o.msg === e.msg));
      return { sp, text, errs: errs.map(e => e.msg.replace(name + ': ', '')), block: nb, said: sp.length ? null : 'Nothing would change.' };
    } catch (e) { return { sp: null, errs: [e.message] }; }
  }
  const checksBox = r => h('div.small', r.errs.length ? r.errs.map(e => h('div.warn-text', '⛔ ' + e)) : h('div.muted', r.said || '✓ No problem.'));
  const snippet = (r, block) => {
    if (!r.sp || !r.block) return h('pre.small', '');
    const t = r.text, s = FRE.textOps.lineStart(t, r.block.start), e = r.block.close ? r.block.close.end : t.length;
    return h('pre.small.bm-snippet', t.slice(s, e).replace(/\r/g, ''));
  };
  // a dialog whose Apply button follows the live checks
  function formDialog({ title, body, render, apply, action = 'Apply changes' }) {
    const checks = h('div'), prev = h('div');
    let ok = false, dlg = null;
    const show = () => {
      const r = render();
      checks.textContent = ''; prev.textContent = '';
      checks.appendChild(checksBox(r)); prev.appendChild(r.preview || h('pre.small', ''));
      ok = !!r.sp && r.sp.length > 0 && !r.errs.length;
      if (dlg) { const btn = dlg.el.querySelector('footer button.primary'); if (btn) btn.disabled = !ok; }
    };
    const foot = formFooter({ checks, action, previewTitle: 'What will be written', preview: prev });
    dlg = modal({ title, wide: true, body: h('div', body, ...foot), buttons: [{ label: action, cls: 'primary', onClick: () => { if (!ok) { toast('Fix the ⛔ problems first', 'bad'); return false; } apply(); } }, { label: 'Cancel' }] });
    show();
    return show;
  }

  function sigDialog(ctx, b, adding) {
    const m = model(ctx), w = b.sig ? b.sig.words : null;
    const v = { on: !!w || !!adding, type: w ? w[0] : 'ATTACK_METEOR', hit: w ? w[1] : 'BOSSATK_HITSELF', skill: w && w[2] ? w[2] : (m.bombSkills[0] || ''), every: w ? w[3] : '6', shout: w && w[4] ? w[4].replace(/^"|"$/g, '') : '' };
    const plan = () => (t, x) => O().setSignature(t, x, v.on ? { type: v.type, hit: v.hit, skill: v.skill, every: Number(v.every), shout: v.shout } : null);
    let show = () => {};
    const inp = (k, attrs) => { const e = h('input', Object.assign({ type: 'text', value: v[k] }, attrs)); e.addEventListener('input', () => { v[k] = e.value; show(); }); return e; };
    const sel = (k, opts) => pick(opts, v[k], x => { v[k] = x; show(); }, false);
    const on = h('input', { type: 'checkbox', checked: v.on, on: { change: e => { v.on = e.target.checked; show(); } } });
    const body = h('div.nn-form',
      h('label', on, ' This boss has a signature attack (untick = remove it)'),
      h('div.dr-line', fieldLabel('Shape', true), sel('type', B().LIVE.filter(t => t !== 'ATTACK_STORM').map(t => [t, shapeLabel(t)]))),
      h('div.dr-line', fieldLabel('Hits', true), sel('hit', B().HITS.map(x => [x, HIT_WORDS[x]]))),
      h('div.dr-line', fieldLabel('Skill', true), sel('skill', skillOpts(m, v.skill))),
      h('div.dr-line', fieldLabel('Every N swings (2-50)', true), inp('every', { inputMode: 'numeric', style: 'width:5em' })),
      h('div.dr-line', fieldLabel('Shout (plain ASCII, up to 120 letters)', true), inp('shout', { style: 'width:30em', maxLength: 120, placeholder: 'The ground shakes!' })),
      h('p.muted.small', 'Players within 64 m of the boss see the shout as a pale blue caption; 1.5 s later the shape lands. It replaces that swing\'s row, in every phase.'));
    show = formDialog({ title: `Edit signature: ${nameOf(b)}`, body,
      render: () => { const r = tryPlan(ctx, b.name, plan()); r.preview = snippet(r); return r; },
      apply: () => edit(ctx, b.name, plan(), `${nameOf(b)}: ${v.on ? `signature ${shapeName(v.type)} every ${v.every} swings` : 'signature removed'}`) });
  }

  function phaseDialog(ctx, b, adding) {
    const list = b.phases.map(p => ({ hp: String(p.hp), speed: String(p.speed), w: p.w.map(String), shout: p.shout }));
    const plan = () => (t, x) => O().setPhases(t, x, list.map(p => ({ hp: Number(p.hp), speed: Number(p.speed), w: p.w.map(Number), shout: p.shout })));
    const tb = h('tbody'), addBtn = h('button', { on: { click: () => { if (list.length < 4) { const last = list[list.length - 1]; list.push({ hp: String(last ? Math.max(1, Number(last.hp) - 20) : 30), speed: '75', w: ['0', '1', '1'], shout: '' }); draw(); } } } }, '+ Phase');
    let show = () => {};
    const cell = (p, k, j, width) => { const e = h('input', { type: 'text', value: j === undefined ? p[k] : p[k][j], style: `width:${width}` });
      e.addEventListener('input', () => { if (j === undefined) p[k] = e.value; else p[k][j] = e.value; show(); }); return h('td', e); };
    function draw() {
      tb.textContent = '';
      list.forEach((p, i) => tb.appendChild(h('tr', h('td', i + 1), cell(p, 'hp', undefined, '4em'), cell(p, 'speed', undefined, '4em'), cell(p, 'w', 0, '3em'), cell(p, 'w', 1, '3em'), cell(p, 'w', 2, '3em'), cell(p, 'shout', undefined, '18em'),
        h('td.nowrap', h('button.icon', { disabled: i === 0, title: 'Move up', on: { click: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } } }, '↑'),
          h('button.icon', { title: 'Remove', on: { click: () => { list.splice(i, 1); draw(); } } }, '✕')))));
      addBtn.disabled = list.length >= 4;
      show();
    }
    const body = h('div',
      h('p.small', 'Below each HP % the boss enters the phase: its attack rows weigh their shape tier\'s weight (0 = that kind stops, ATTACK_NONE rows stay 1), and it swings in swing time % of the normal time (60 = 40 % faster). The shapes themselves never get faster. HP must go down line by line; at most 4.'),
      h('table.items.rt', h('thead', h('tr', h('th', '#'), h('th', fieldLabel('Below HP % (1-99)', true)), h('th', fieldLabel('Swing time % (30-100)', true)),
        h('th', fieldLabel('Easy', true)), h('th', fieldLabel('Medium', true)), h('th', fieldLabel('Hard weight (0-10)', true)), h('th', fieldLabel('Shout', false)), h('th', ''))), tb), addBtn);
    show = formDialog({ title: `Edit phases: ${nameOf(b)}`, body,
      render: () => {
        const r = tryPlan(ctx, b.name, plan());
        r.preview = snippet(r);
        if (r.block && !r.errs.length) {
          const t = Sim().table(r.block);
          r.preview = h('div', r.preview, h('ul.small', t.map(x => h('li', `${x.phase < 0 ? 'Full HP' : `Below ${x.hp} %`}: attacks ${pc(x.attack)} of swings${x.attack ? ` — ${[1, 2, 3].filter(k => x.byTier[k]).map(k => `${pc(x.byTier[k] / x.attack)} ${B().TIER_WORD[k]}`).join(', ')}` : ''}`))));
        }
        return r;
      },
      apply: () => edit(ctx, b.name, plan(), `${nameOf(b)}: ${list.length ? `phases ${list.map(p => `below ${p.hp} %`).join(', ')}` : 'phases removed'}`) });
    if (adding && list.length < 4) addBtn.click(); else draw();
  }

  function removeDialog(ctx, b) {
    modal({ title: `Remove boss: ${nameOf(b)}`, body: h('div', h('p', `${b.name}'s whole block (${b.rows.length} rows${b.sig ? ', the signature' : ''}${b.phases.length ? ', the phases' : ''}) is removed. The monster then fights with its normal attacks only.`), h('p.muted.small', 'Ctrl+Z brings it back until you save.')),
      buttons: [{ label: 'Remove', cls: 'danger', onClick: () => { stopPreview(); st.sel = null; ctx.editGroup(() => [{ file: FILE, splices: O().removeBoss(ctx.ws.files.get(FILE).text, model(ctx).byName.get(b.name)) }], `Boss Mechanics: ${nameOf(b)} removed`, [keyOf(b.name)]); } }, { label: 'Cancel' }] });
  }

  function newBossDialog(ctx) {
    const m = model(ctx);
    const v = { mi: null, from: null, skill: m.bombSkills.includes('SI_BOSSATTACK_LOWDMG_1') ? 'SI_BOSSATTACK_LOWDMG_1' : m.bombSkills[0] };
    let show = () => {};
    const plan = () => (t) => O().addBoss(t, model(ctx), v.mi, v.from ? model(ctx).byName.get(v.from) : null, v.skill);
    const monster = FRE.ui.combo({ options: m.candidates.map(x => ({ v: x.define, label: `${x.name} (${x.define}, ${x.rank}, level ${x.level})`, find: `${x.name} ${x.define}` })),
      value: null, placeholder: 'Type a boss, mid boss or giant', onPick: x => { v.mi = x; show(); } });
    const from = pick([['', 'Start new: one Target attack (then add your own rows, tier, signature, phases)'], ...m.bosses.map(b => [b.name, `${nameOf(b)} (${b.name})`])], v.from || '', x => { v.from = x || null; show(); }, false);
    const body = h('div.nn-form',
      h('div.dr-line', fieldLabel('Monster', true), monster),
      h('div.dr-line', fieldLabel('Copy the attacks of', false), from),
      h('p.muted.small', 'Only bosses, mid bosses and giants (propMover.txt rank) without a block are offered. After Create the boss opens here: every row, the tier, signature and phases can be changed.'));
    show = formDialog({ title: 'New boss', action: 'Create', body,
      render: () => {
        if (!v.mi) return { sp: null, errs: ['Pick a monster'] };
        const f = ctx.ws.files.get(FILE);
        try {
          const sp = plan()(f.text), text = FRE.SourceFile.spliceText(f.text, sp, f.kind, f.name);
          const r = B().parse(text, { monsters: m.monsters, skills: m.skills, bombs: m.bombs });
          const nb = r.bosses.find(x => x.name === v.mi);
          return { sp, text, block: nb, errs: r.errors.filter(e => e.mi === v.mi).map(e => e.msg.replace(v.mi + ': ', '')), preview: snippet({ sp, text, block: nb }) };
        } catch (e) { return { sp: null, errs: [e.message] }; }
      },
      apply: () => { const mi = v.mi, mv = m.candidates.find(x => x.define === mi);
        ctx.editGroup(() => [{ file: FILE, splices: plan()(ctx.ws.files.get(FILE).text) }], `Boss Mechanics: new boss ${mv ? mv.name : mi}${v.from ? ` (attacks of ${v.from})` : ''}`, [keyOf(mi)]);
        st.sel = mi; st.prev = null; ctx.renderAll(false); } });
  }

  // ---------------------------------------------------------------- one page with every shape (user 2026-10-23)
  const TIER_CHIPS = [['all', 'All'], ['1', 'Easy'], ['2', 'Medium'], ['3', 'Hard'], ['unused', 'On no boss yet']];
  function shapesView(el, ctx) {
    const m = model(ctx), used = {};
    // bosses using each shape: in an attack line or as the signature (counted once per boss)
    for (const b of m.bosses) for (const t of new Set([...b.shapes, ...(b.sig && b.sig.words[0] ? [b.sig.words[0]] : [])])) used[t] = (used[t] || 0) + 1;
    P().setSkills(m.skillRows); P().setArena(24);
    const skill = m.bombSkills.includes('SI_BOSSATTACK_LOWDMG_1') ? 'SI_BOSSATTACK_LOWDMG_1' : m.bombSkills[0];
    const all = B().LIVE.filter(t => P().info(t));
    const show = all.filter(t => st.shapeTier === 'all' ? true : st.shapeTier === 'unused' ? !used[t] : String(B().TIER_OF[t]) === st.shapeTier);
    el.appendChild(h('div.npc-title', h('h2', `All attack shapes (${all.length})`), h('span.def', '8 Easy · 12 Medium · 11 Hard')));
    el.appendChild(h('div.dr-line', ...TIER_CHIPS.map(([v, label]) => h('button' + (st.shapeTier === v ? '.primary' : ''), { on: { click: () => { stopPreview(); st.shapeTier = v; ctx.renderAll(false); } } },
      `${label} (${all.filter(t => v === 'all' ? true : v === 'unused' ? !used[t] : String(B().TIER_OF[t]) === v).length})`))));
    el.appendChild(h('p.muted.small', 'Each card plays the shape around a boss with a 24 m arena (dashed circle) and 3 players. In game every mark looks like its skill\'s effect (propSkill.txt + SFX): the shape only decides where the marks land and when.'));
    const grid = h('div.bm-shapes');
    stopPreview();
    for (const t of show) {
      const i = P().info(t), cv = h('canvas.bm-card-canvas', { width: 260, height: 260 });
      grid.appendChild(h('div.bm-card', h('div.dr-line', h('b', i.name), h('span.tag', B().TIER_WORD[B().TIER_OF[t]]), h('span.tag', used[t] ? `used by ${used[t]} boss${used[t] > 1 ? 'es' : ''}` : 'on no boss yet'),
        B().ARENA_SHAPES.includes(t) ? h('span.tag', 'uses the arena') : null),
        h('div.muted.small', `${t} · ${i.text}`), cv,
        h('button', { disabled: !can(ctx) || !skill, on: { click: () => addShapeDialog(ctx, t) } }, '+ Add to boss…')));
      // a Storm row: the skill is the storm area (TYPE_STORM), the 5th word what it drops (a bomb), as in the data
      const area = m.bombSkills.find(x => m.skillRows.get(x).bomb === 'TYPE_STORM');
      st.cards.push(P().loop(cv, P().rowAttack(t === 'ATTACK_STORM' && area ? [t, 'BOSSATK_HITSELF', area, 'NO_DELAY', m.bombSkills.includes('SI_BOSSATTACK_WATER2') ? 'SI_BOSSATTACK_WATER2' : skill, 'APPLY_INSTANT']
        : [t, 'BOSSATK_HITSELF', skill, 'NO_DELAY', '0', 'APPLY_INSTANT'])));
    }
    if (!show.length) grid.appendChild(h('p.muted', 'No shape matches.'));
    el.appendChild(grid);
  }

  // Add to boss: which boss, where (a new attack line / replace a line / its signature), where it hits, the skill; the arena when the
  // shape needs one and the boss has none. One undo step; the checks (tier mix too) run live.
  function addShapeDialog(ctx, type) {
    const m = model(ctx), name = shapeName(type), storm = type === 'ATTACK_STORM';
    const first = m.bombSkills.includes('SI_BOSSATTACK_LOWDMG_1') ? 'SI_BOSSATTACK_LOWDMG_1' : m.bombSkills[0];
    const v = { boss: null, where: 'row', row: '0', hit: 'BOSSATK_HITSELF', skill: first, storm: '0', every: '6', shout: '', arena: '24' };
    let show = () => {};
    const bossOf = () => (v.boss ? model(ctx).byName.get(v.boss) : null);
    const needsArena = () => { const b = bossOf(); return !!b && !b.arena && B().ARENA_SHAPES.includes(type); };
    const plan = () => (t, x) => {
      let sp;
      if (v.where === 'sig') {
        if (storm) throw new Error('A signature cannot be Storm');
        const w = x.sig && x.sig.words.length === 5 ? x.sig.words : null;
        sp = O().setSignature(t, x, { type, hit: v.hit, skill: v.skill, every: w && !v.every ? Number(w[3]) : Number(v.every), shout: v.shout || (w ? w[4].replace(/^"|"$/g, '') : '') });
      } else {
        const rows = O().wordsOf(x), row = [type, v.hit, v.skill, 'NO_DELAY', storm ? v.storm : '0', 'APPLY_INSTANT'];
        if (v.where === 'row') rows.push(row); else rows[Number(v.row)] = row;
        sp = O().setRows(t, x, rows);
      }
      if (needsArena()) sp = sp.concat(O().setArena(t, x, Number(v.arena)));
      return sp.sort((a, b) => a.start - b.start);
    };
    const mixLine = h('div.small'), whereBox = h('span'), extra = h('div');
    const sel = (k, opts) => pick(opts, v[k], x => { v[k] = x; draw(); }, false);
    const inp = (k, attrs) => { const e = h('input', Object.assign({ type: 'text', value: v[k] }, attrs)); e.addEventListener('input', () => { v[k] = e.value; show(); }); return e; };
    const bossPick = FRE.ui.combo({ options: m.bosses.map(b => ({ v: b.name, label: `${nameOf(b)} (${b.name}, ${tierWord(b.tier && b.tier.value)})`, find: `${nameOf(b)} ${b.name}` })),
      value: null, placeholder: 'Type a boss', onPick: x => { v.boss = x; v.row = '0'; const b = bossOf(); if (b && b.sig && b.sig.words.length === 5) { v.every = ''; v.shout = ''; } draw(); } });
    function draw() {
      const b = bossOf();
      whereBox.textContent = ''; extra.textContent = ''; mixLine.textContent = '';
      const real = b ? b.rows.map((r, i) => [i, r]).filter(([, r]) => r.words[0] !== 'ATTACK_NONE') : [];
      const whereOpts = [['row', 'A new attack line'], ...(real.length ? [['replace', 'Instead of one of its attack lines']] : []), ...(storm ? [] : [['sig', b && b.sig ? 'As its signature (replaces the one it has)' : 'As its signature attack']])];
      if (!whereOpts.some(o => o[0] === v.where)) v.where = 'row';
      whereBox.appendChild(sel('where', whereOpts));
      if (v.where === 'replace') {
        if (!real.some(([i]) => String(i) === v.row)) v.row = String(real[0][0]);
        whereBox.appendChild(sel('row', real.map(([i, r]) => [String(i), `line ${i + 1}: ${shapeLabel(r.words[0])}`])));
      }
      if (storm) extra.appendChild(h('div.dr-line', fieldLabel('What the storm drops', true), sel('storm', [['0', '(pick a skill)'], ...skillOpts(m, v.storm)])));
      if (v.where === 'sig') {
        const w = b && b.sig && b.sig.words.length === 5 ? b.sig.words : null;
        extra.appendChild(h('div.dr-line', fieldLabel('Every N swings (2-50)', !w), inp('every', { inputMode: 'numeric', style: 'width:5em', placeholder: w ? `${w[3]} (as now)` : '6' })));
        extra.appendChild(h('div.dr-line', fieldLabel('Shout', !w), inp('shout', { style: 'width:30em', maxLength: 120, placeholder: w ? `${w[4]} (as now)` : 'The ground shakes!' })));
      }
      if (needsArena()) extra.appendChild(h('div.dr-line', fieldLabel('Arena (m, 12-48)', true), inp('arena', { inputMode: 'numeric', style: 'width:5em' }),
        h('span.muted.small', `${nameOf(b)} has no arena yet; ${name} needs one. Change it later with pasted /position lines.`)));
      show();
    }
    const body = h('div.nn-form',
      h('p', `Shape: `, h('b', name), ` (${B().TIER_WORD[B().TIER_OF[type]]}) — ${(P().info(type) || {}).text || ''}`),
      h('div.dr-line', fieldLabel('Boss', true), bossPick),
      h('div.dr-line', fieldLabel('Where', true), whereBox),
      h('div.dr-line', fieldLabel('Hits', true), sel('hit', B().HITS.map(x => [x, HIT_WORDS[x]]))),
      h('div.dr-line', fieldLabel('Skill (what each mark does)', true), sel('skill', skillOpts(m, v.skill))),
      extra, mixLine);
    show = formDialog({ title: `Add ${name} to a boss`, action: 'Add', body,
      render: () => {
        if (!v.boss) return { sp: null, errs: ['Pick a boss'] };
        const r = tryPlan(ctx, v.boss, plan());
        r.preview = snippet(r);
        mixLine.textContent = '';
        if (r.block && r.block.tier) {
          const mx = B().mixOf(r.block.tier.value, r.block.shapes);
          mixLine.appendChild(h(mx.ok ? 'span.muted' : 'span.warn-text', `${mx.ok ? '✓' : '⛔'} ${tierWord(r.block.tier.value)} needs ${mx.want} different shapes · after this: ${mx.have}` +
            (mx.ok ? '' : '. Pick "Instead of one of its attack lines", or set its Difficulty mix to Custom first.')));
        }
        return r;
      },
      apply: () => { const b = bossOf(); edit(ctx, v.boss, plan(), `${nameOf(b)}: ${name} ${v.where === 'sig' ? 'as signature' : v.where === 'replace' ? `instead of line ${Number(v.row) + 1}` : 'added as a new attack line'}${needsArena() ? `, arena ${v.arena} m` : ''}`); } });
    draw();
  }

  FRE.ui.modules.push(mod);
  FRE.ui.bosses = { bossView };
})(globalThis.FRE = globalThis.FRE || {});
