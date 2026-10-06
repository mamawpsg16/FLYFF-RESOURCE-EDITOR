// Battle Pass module (BattlePass.inc, commit cc73ccdd). Four views:
//   Season         - the pass item and its end date, "Start new season"
//   Reward ladder  - BP4: one reward per level, the points to reach the next level
//   Monster points - BP5: points per kill, priced by the file's level bands
//   Past seasons   - the seasons found in the backup copies of the file (every save makes one)
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput } = FRE.dom;
  const { diagTags, diagRow, itemCell } = FRE.ui;
  const FILE = 'battlepass.inc';
  const st = { view: 'season', mfilter: 'listed', pick: null };
  // Past seasons: read from the backups folder each time the view is opened (a save adds a copy)
  const hist = { list: null, loading: false, error: null, key: null };

  const model = ctx => ctx.ws.models.battlepass;
  const movers = ctx => ctx.ws.movers.movers;
  const BP = () => FRE.battlePass;
  const O = () => FRE.battlePassOps;
  const canEdit = ctx => ctx.ws.isEditable(FILE);
  const bpDiags = ctx => ctx.ws.diags.filter(d => d.module === 'battlepass');
  const rowDiags = (ctx, r) => bpDiags(ctx).filter(d => d.start !== undefined && d.start >= r.start && d.start < Math.max(r.end, r.start + 1));
  const lineCell = (ctx, r) => { const f = ctx.ws.files.get(FILE); return h('td', h('span.line', { title: f.text.slice(r.start, r.end) }, 'L' + (f.lineOf(r.start) + 1))); };
  function edit(ctx, make, label) { ctx.edit(FILE, make, label, 'bp|' + st.view); }

  // date <-> <input type=date>
  const isoOf = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const dateOfIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

  // the current season's ladder rows (first row per level wins), by level
  function ladderRows(m) {
    const type = m.pass ? m.pass.type.value : null;
    return [...m.ladder.values()].filter(r => type === null || r.type.value === type).sort((a, b) => a.level.value - b.level.value);
  }
  function monsterRows(ctx) {
    const m = model(ctx), mv = movers(ctx), q = ctx.query.toLowerCase();
    const match = (def, x) => !q || (def || '').toLowerCase().includes(q) || (x && x.name.toLowerCase().includes(q));
    if (st.mfilter === 'unlisted') {
      // like season 1's list: every monster with a display name and level 1-200 (BP5 comment)
      return unlisted(ctx).filter(x => match(x.define, x))
        .sort((a, b) => a.level - b.level || a.define.localeCompare(b.define)).map(x => ({ mover: x }));
    }
    let rows = shownRows(ctx);
    if (st.mfilter === 'off') rows = rows.filter(x => offBand(x));
    return rows.filter(x => match(x.row.define, x.mover));
  }
  // real monsters (BP().isMonster: no town NPCs or pets) that pay no points yet
  const unlisted = ctx => [...movers(ctx).values()].filter(x => BP().isMonster(x) && !model(ctx).monsters.has(x.id));
  // pets (buff / raised) and town NPCs are never killed as monsters: never shown
  const isJunk = x => !!x.mover && !BP().isMonster(x.mover);
  const shownRows = ctx => model(ctx).rows.BP5.map(r => ({ row: r, mover: movers(ctx).get(r.id) })).filter(x => !isJunk(x));
  const junkRows = ctx => model(ctx).rows.BP5.map(r => ({ row: r, mover: movers(ctx).get(r.id) })).filter(isJunk);
  function offBand(x) {
    if (!x.mover) return false;
    const b = BP().band(x.mover.level, x.mover.rankId);
    return x.row.min.value !== b.min || x.row.max.value !== b.max;
  }

  const mod = {
    id: 'battlepass', label: 'Battle Pass', searchPlaceholder: 'Search monsters or rewards',
    help: 'Battle Pass: season end date, the reward ladder and the points each monster pays (BattlePass.inc)',
    st,

    onLoad() { st.view = 'season'; st.mfilter = 'listed'; st.pick = null; hist.list = null; hist.error = null; },

    renderList(el, ctx) {
      const m = model(ctx), diags = bpDiags(ctx).filter(d => d.severity !== 'INFO');
      const inBlock = b => diags.filter(d => (b === 'BP1' ? [...m.rows.BP1] : m.rows[b]).some(r => r.start === d.start) || (b === 'BP1' && !d.start)).length;
      const entry = (view, label, n, bad, sub) => el.appendChild(h('div.npc' + (st.view === view ? '.sel' : ''),
        { on: { click: () => { st.view = view; st.pick = null; if (view === 'history') hist.list = null; ctx.renderAll(false); } } },
        h('div.n', h('span', label), h('span', ctx.edited.has('bp|' + view) ? h('span.tag.edit', 'edited') : null,
          bad ? h('span.tag.warn', '⚠' + bad) : null, n !== null ? h('span.count', String(n)) : null)),
        sub ? h('div.k', sub) : null));
      const p = m.pass, e = p && BP().seasonEnd(p.time.value);
      entry('season', 'Season', null, inBlock('BP1'), e ? `${e.date <= new Date() ? 'ended · ' : ''}last day ${BP().dayText(addDays(e.date, -1))}` : 'no season');
      entry('ladder', 'Reward ladder', ladderRows(m).length, inBlock('BP4'), p ? `season ${p.type.value} (current) · one reward per level` : 'one reward per level');
      entry('monsters', 'Monster points', shownRows(ctx).length, inBlock('BP5'), 'points per kill');
      entry('history', 'Past seasons', hist.list ? hist.list.filter(x => !x.current).length : null, 0, 'seasons in the backups · reuse their rewards');
    },

    renderEditor(el, ctx) {
      const f = ctx.ws.files.get(FILE);
      el.appendChild(h('div.npc-title', h('h2', 'Battle Pass'),
        h('span.def', { season: 'Season', ladder: model(ctx).pass ? `Season ${model(ctx).pass.type.value} ladder (the current season)` : 'Reward ladder', monsters: 'Monster points', history: 'Past seasons' }[st.view]),
        h('span.line', f.name), canEdit(ctx) ? null : h('span.tag.bad', 'read-only')));
      if (st.view === 'season') season(el, ctx);
      else if (st.view === 'ladder') ladder(el, ctx);
      else if (st.view === 'history') history(el, ctx);
      else monsters(el, ctx);
    },

    addTarget(ctx) {
      if (!canEdit(ctx)) return { ok: false, title: 'BattlePass.inc is read-only' };
      if (st.view !== 'ladder') return { ok: false, title: 'Open "Reward ladder" on the left to add rewards' };
      const m = model(ctx), rows = ladderRows(m);
      if (st.pick !== null) {
        const r = rows.find(x => x.level.value === st.pick);
        if (r) return { ok: true, usesPrice: false, title: `Make this level ${st.pick}'s reward`,
          add(info) { st.pick = null; edit(ctx, () => O().setRewardItem(r, info.define), `level ${r.level.value} reward ${info.define}`); ctx.renderAll(true); } };
      }
      const last = rows[rows.length - 1];
      const next = (last ? last.level.value : 0) + 1;
      return { ok: true, usesPrice: false, title: `Add as level ${next}'s reward (quantity 1, cost copied from level ${next - 1})`,
        add(info) { edit(ctx, text => O().addReward(text, model(ctx), info.define, 1, last ? last.points.value : 1000).splices, `add level ${next}`); } };
    },

    locate(d, ctx) {
      if (d.module !== 'battlepass') return false;
      const m = model(ctx);
      const r = Object.values(m.rows).flat().find(x => x.start === d.start);
      st.view = !r || r.block === 'BP1' || r.block === 'BP2' || r.block === 'BP3' ? 'season' : r.block === 'BP4' ? 'ladder' : 'monsters';
      if (st.view === 'monsters') st.mfilter = d.code === 'BP_BAND' ? 'off' : 'listed';
      return true;
    },
  };

  // ---------------------------------------------------------------- Season
  function season(el, ctx) {
    const ws = ctx.ws, m = model(ctx), p = m.pass, edit_ = canEdit(ctx);
    if (!p) {
      el.appendChild(h('div.bp-hero.bad', h('div.bp-status', 'No season'), h('div.bp-head', 'There is no pass row (BPItem in BP1)'),
        h('p', 'Nobody gets the free track and kills earn no points. Add the row by hand: BPItem 1 II_... YYYYMMDD.')));
    } else {
      const it = ws.itemById(p.id), info = it ? ws.itemInfo(it) : null;
      const e = BP().seasonEnd(p.time.value), now = new Date();
      const ended = !e || e.date <= now;
      const left = e ? e.date - now : 0, days = Math.floor(left / 86400000), hours = Math.floor(left % 86400000 / 3600000);
      const newBtn = h('button.primary.bp-cta', { disabled: !edit_, on: { click: () => newSeason(ctx) } }, 'Start new season…');

      // status card
      el.appendChild(h('div.bp-hero' + (ended ? '.bad' : '.ok'),
        h('div.bp-hero-top',
          h('div', h('div.bp-status', ended ? 'Ended' : 'Running'),
            h('div.bp-head', ended ? `Season ${p.type.value} ended` : `Season ${p.type.value}: ${days} day${days === 1 ? '' : 's'} ${hours} h left`),
            h('div.bp-sub', e ? `last day ${BP().dayText(addDays(e.date, -1))}, ${ended ? 'ended' : 'ends'} at midnight after it` : `end date ${p.time.value} is not valid`)),
          newBtn),
        ended ? h('ul.bp-effects',
          h('li', 'Nobody is put on the pass at login, and kills earn no points.'),
          h('li', h('b', 'The Donation Shop still sells the pass: '), 'a player who uses it now loses it and gets only the level 1 reward.'),
          h('li', 'Start a new season, save, and restart the WorldServer.')) : null));

      // facts
      // shown as the LAST playable day; the file gets the day after (00:00 = midnight after the last day)
      const dateIn = h('input', { type: 'date', disabled: !edit_, value: e ? isoOf(addDays(e.date, -1)) : '',
        title: 'The last day players can earn. The season ends at midnight after this day (server time).',
        on: { change: ev => { if (ev.target.value) edit(ctx, () => O().setEndDate(p, BP().ymd(addDays(dateOfIso(ev.target.value), 1))), 'season last day'); } } });
      const fact = (label, value, note) => h('div.bp-fact', h('div.bp-label', label), h('div.bp-value', value), note ? h('div.bp-note', note) : null);
      el.appendChild(h('div.bp-facts',
        fact('Pass item', h('span', { 'data-item-id': info ? info.id : null, class: info ? 'r-' + info.rarity : '' }, info ? info.name : p.define), p.define),
        fact('Season number', String(p.type.value), 'nType · rewards must match it'),
        fact('Last day', dateIn, `ends at midnight after it · nTime ${p.time.value}`),
        fact('Ladder', `${ladderRows(m).length} levels`, `${m.rows.BP5.filter(r => { const x = movers(ctx).get(r.id); return x && BP().isMonster(x); }).length} monsters pay points`)));
      const other = rowDiags(ctx, p).filter(d => d.code !== 'BP_EXPIRED');
      if (other.length) el.appendChild(h('div', diagTags(other)));

      el.appendChild(h('details.bp-how', h('summary', 'How a season works'), h('ul',
        h('li', 'Every player is put on the free track at login. Killing listed monsters earns points and levels, but no rewards.'),
        h('li', 'Using the pass item (sold in the Donation Shop) pays every level already reached, then each new level as it comes.'),
        h('li', 'The end date is stamped on the character when they join. Changing it here does not move players already on the season (use /rrbp or SQL).'),
        h('li', 'After saving, restart the WorldServer and relaunch the client.'))));
    }
    const blocks = ['BP2', 'BP3'].filter(b => m.rows[b].length).map(b => `${b}: ${m.rows[b].length} row(s)`);
    el.appendChild(h('p.muted.small', blocks.length ? `Not edited here: ${blocks.join(', ')}.` : 'BP2 (preview pass) and BP3 (point token) are empty and not used.'));
    problems(el, ctx, d => d.code !== 'BP_EXPIRED' && (!d.start || [...m.rows.BP1, ...m.rows.BP2, ...m.rows.BP3].some(r => r.start === d.start)));
  }

  // nTime = first playable day + length (the header of BP1 explains why)
  function newSeason(ctx) {
    const m = model(ctx), p = m.pass, oldEnd = BP().seasonEnd(p.time.value);
    const f = ctx.ws.files.get(FILE);
    const v = { start: today(), len: 30 };
    const info = h('div'), diffBox = h('div');
    let plan = null;
    const refresh = () => {
      const end = addDays(v.start, v.len);
      plan = O().newSeasonPlan(m, BP().ymd(end));
      info.textContent = '';
      info.appendChild(h('ul.plan',
        h('li', `Runs ${v.len} full days: ${BP().dayText(v.start)} to ${BP().dayText(addDays(end, -1))}, ending at midnight after the last day `,
          `(written to the file as nTime ${BP().ymd(end)} = ${BP().whenText(end)}).`),
        h('li', `Season number (nType) ${plan.from} → ${plan.to} on the pass and on all ${plan.rows.length} reward levels. `,
          'The pass item stays the same (commit 2f783090): an unused pass a player still holds unlocks the new season.'),
        h('li', oldEnd && oldEnd.date <= new Date()
          ? 'The current season has ended, so every player starts the new one at level 1 at their next login.'
          : `The current season runs until ${oldEnd ? BP().whenText(oldEnd.date) : '?'}: players on it stay there until then. To move them now, use /rrbp per character or clear m_szBPEndTime in SQL.`)));
      diffBox.textContent = '';
      diffBox.appendChild(FRE.ui.renderDiff(f, f.text, f.preview(plan.splices)));
    };
    const startIn = h('input', { type: 'date', value: isoOf(v.start), on: { change: ev => { if (ev.target.value) { v.start = dateOfIso(ev.target.value); refresh(); } } } });
    const lenIn = numInput({ value: v.len, min: 1, max: 3650, title: 'Season length in days', onCommit: n => { if (n) { v.len = n; refresh(); } } });
    refresh();
    modal({ title: 'Start a new Battle Pass season', wide: true, body: h('div',
      h('div.row', h('label', 'First day players can earn ', startIn), h('label', ' Length in days ', lenIn)),
      info, h('h3', 'Lines that change'), diffBox),
      buttons: [{ label: 'Cancel' }, { label: 'Start new season', cls: 'primary', onClick: () => ctx.edit(FILE, () => plan.splices, `new season ${plan.to}`, 'bp|season') }] });
  }

  // ---------------------------------------------------------------- Reward ladder
  function ladder(el, ctx) {
    const ws = ctx.ws, m = model(ctx), rows = ladderRows(m), edit_ = canEdit(ctx);
    el.appendChild(h('p.muted.small', `This is the current season's ladder${m.pass ? ` (season ${m.pass.type.value})` : ''}; older seasons are under "Past seasons". `,
      'Each level gives its reward when a player reaches it (level 1 when they join); rewards are paid only to players who bought the pass. ',
      '"Cost" is the points needed to go from that level to the next one, at most 10,000. ',
      'Use + in the item list on the right to add the next level, or "Change" on a row and then + to pick its new reward. ',
      '↑ / ↓ swap two levels\' rewards (the costs stay). ✕ removes a level: the levels above move down one, with their rewards and costs. ',
      'The window shows each reward with the item\'s own icon.'));
    const tb = h('table.items.bp', h('tr', h('th.num', 'Level'), h('th', 'Reward'), h('th.num', 'Qty'), h('th.num', 'Cost to next level'),
      h('th.num', 'Points to reach'), h('th', ''), h('th', 'Line')));
    let total = 0;
    const last = rows[rows.length - 1];
    rows.forEach(r => {
      const it = ws.itemById(r.id), info = it ? ws.itemInfo(it) : null, lv = r.level.value;
      const reach = total;
      if (r !== last) total += Math.min(Math.max(r.points.value, 1), BP().MAX_BPOINTS);
      const pick = h('button', { disabled: !edit_, title: 'Change this reward: click, then + on an item in the list on the right',
        on: { click: () => { st.pick = st.pick === lv ? null : lv; ctx.renderAll(true); } } }, st.pick === lv ? 'Pick an item →' : 'Change');
      // ↑ / ↓: swap rewards (item, quantity) with the next level; each level keeps its cost
      const i = rows.indexOf(r);
      const mv = (o, sym, title) => h('button.icon', { disabled: !edit_ || !o, title,
        on: { click: () => edit(ctx, text => O().swapRewards(text, r, o), `swap rewards of levels ${lv} and ${o.level.value}`) } }, sym);
      const up = mv(rows[i - 1], '↑', `Swap this reward with level ${lv - 1}'s (the costs stay)`);
      const down = mv(rows[i + 1], '↓', `Swap this reward with level ${lv + 1}'s (the costs stay)`);
      const rm = h('button.icon.danger', { disabled: !edit_, title: r === last ? `Remove level ${lv}` : `Remove level ${lv}: levels ${lv + 1}-${last.level.value} move down one (with their rewards and costs)`,
        on: { click: () => removeLevel(ctx, r, last) } }, '✕');
      tb.appendChild(h('tr' + (st.pick === lv ? '.changed' : ''), h('td.num', String(lv)), itemCell(info, r.define),
        h('td.num', numInput({ value: r.qty.value, min: 1, disabled: !edit_, onCommit: v => v && edit(ctx, () => O().setRewardValue(r, 'qty', v), `level ${lv} quantity`) })),
        h('td.num', r === last ? h('span.muted', { title: 'There is no next level: this cost is never used' }, `(${fmt(r.points.value)} unused)`)
          : numInput({ value: r.points.value, min: 1, max: BP().MAX_BPOINTS, disabled: !edit_, onCommit: v => v && edit(ctx, () => O().setRewardValue(r, 'points', v), `level ${lv} cost`) })),
        h('td.num', fmt(reach)),
        h('td.nowrap', up, down, ' ', pick, ' ', rm, ' ', diagTags(rowDiags(ctx, r))), lineCell(ctx, r)));
    });
    // the total on top: what reaching the top level costs (every level's cost but the top one's)
    if (last) el.appendChild(h('div.bp-total', h('span.bp-total-n', fmt(total)), ` points to reach level ${last.level.value}`,
      h('span.muted', ` · ${rows.length} levels · the top level's cost is never used`)));
    el.appendChild(h('h3', `Levels (${rows.length})`));
    el.appendChild(tb);
    problems(el, ctx, d => m.rows.BP4.some(r => r.start === d.start) || d.code === 'BP_LEVEL_GAP' || d.code === 'BP_TYPE');
  }

  // a ladder edit made from another view; true when it went into the undo history
  function editAndTell(ctx, make, label) {
    const n = ctx.ws.history.length;
    ctx.edit(FILE, make, label, 'bp|ladder');
    return ctx.ws.history.length > n;
  }

  function removeLevel(ctx, r, last) {
    const lv = r.level.value, f = ctx.ws.files.get(FILE);
    if (r === last) { edit(ctx, text => O().removeReward(text, model(ctx), r), `remove level ${lv}`); return; }
    let splices;
    try { splices = O().removeLevel(f.text, model(ctx), r); } catch (e) { FRE.dom.toast(e.message, 'bad'); return; }
    modal({ title: `Remove level ${lv}`, wide: true, body: h('div',
      h('p', `Level ${lv}'s reward goes. Levels ${lv + 1}-${last.level.value} move down one, each with its reward and its cost, so the ladder ends at level ${last.level.value - 1}.`),
      h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(splices))),
      buttons: [{ label: 'Cancel' }, { label: `Remove level ${lv}`, cls: 'primary danger', onClick: () => edit(ctx, () => splices, `remove level ${lv}`) }] });
  }

  // + on a past reward: where it goes (a new top level, or instead of an existing level), with
  // its quantity and cost editable before it is written
  function placeDialog(ctx, s, p) {
    const ws = ctx.ws, rows = ladderRows(model(ctx)), last = rows[rows.length - 1];
    const cur = model(ctx).pass.type.value, top = last ? last.level.value : 0, next = top + 1;
    const nameOf = (id, define) => { const it = ws.itemById(id); return it ? ws.itemInfo(it).name : define; };
    const name = nameOf(p.id, p.define);
    const pts = n => `${fmt(n)} points to the next level`;
    const v = { level: null, qty: p.qty, points: p.points };
    const now = h('div.bp-place-now');
    const okText = () => (v.level === null ? `Add as level ${next}` : `Replace level ${v.level}`);
    const showNow = () => {
      now.textContent = '';
      const r = v.level === null ? null : rows.find(x => x.level.value === v.level);
      const lv = v.level === null ? next : v.level;
      const isTop = v.level === null || v.level === top;
      now.appendChild(h('table.items.bp-place-diff',
        h('tr', h('th', `Season ${cur}, level ${lv}`), h('th', 'Reward'), h('th.num', 'Points to the next level')),
        h('tr', h('td.muted', 'Before'), r ? h('td', `${fmt(r.qty.value)}x ${nameOf(r.id, r.define)}`) : h('td.muted', '(no level yet)'), h('td.num', r ? fmt(r.points.value) : '')),
        h('tr', h('td', h('b', 'After')), h('td', h('b', `${fmt(v.qty)}x ${name}`)), h('td.num', h('b', fmt(v.points))))));
      if (v.level === null && last) now.appendChild(h('p.muted.small', `Level ${top} stops being the top level, so its ${pts(last.points.value)} start to count.`));
      else if (isTop) now.appendChild(h('p.muted.small', `Level ${lv} is the top level: its points to the next level are never used.`));
      const ok = document.getElementById('bp-place-ok');
      if (ok) ok.textContent = okText();
    };
    const where = h('select', { on: { change: e => { v.level = e.target.value === 'new' ? null : +e.target.value; showNow(); } } },
      h('option', { value: 'new' }, `As a new level ${next} (after level ${top})`),
      rows.map(r => h('option', { value: r.level.value }, `Replace level ${r.level.value} (has ${fmt(r.qty.value)}x ${nameOf(r.id, r.define)} now)`)));
    showNow();
    modal({ title: `Copy a reward from season ${s.type} into season ${cur}`, wide: true, body: h('div.bp-place',
      h('p', `From season ${s.type}, level ${p.level}: `, h('b', `${fmt(p.qty)}x ${name}`), `, ${pts(p.points)}.`),
      h('div.row.ex-tools', h('label', `Where in season ${cur}: `, where)),
      h('div.row.ex-tools',
        h('label', 'Quantity ', numInput({ value: v.qty, min: 1, onCommit: x => { if (x) { v.qty = x; showNow(); } } })),
        h('label', 'Points to the next level ', numInput({ value: v.points, min: 1, max: BP().MAX_BPOINTS, onCommit: x => { if (x) { v.points = x; showNow(); } } }))),
      now),
      buttons: [{ label: 'Cancel' }, { label: okText(), id: 'bp-place-ok', cls: 'primary', onClick: () => {
        const lv = v.level === null ? next : v.level;
        const done = editAndTell(ctx, text => O().placeReward(text, model(ctx), { define: p.define, qty: v.qty, points: v.points, level: v.level }),
          `${name} from season ${s.type}${v.level === null ? ` as new level ${lv}` : ` on level ${lv}`}`);
        if (done) FRE.dom.toast(`Season ${cur}, level ${lv}${v.level === null ? ' (new)' : ''}: ${fmt(v.qty)}x ${name}, ${pts(v.points)}. See "Reward ladder"; nothing is written until Save.`, 'ok');
      } }] });
  }

  // ---------------------------------------------------------------- Past seasons
  // "2026-10-06_08-40-20_battlepass" -> "Tue 06 Oct 2026 08:40"
  function stampText(stamp) {
    if (stamp === NOW) return 'the editor now';
    const m = /^(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)/.exec(stamp);
    return m ? `${BP().dayText(new Date(+m[1], m[2] - 1, +m[3]))} ${m[4]}:${m[5]}` : stamp;
  }
  const NOW = '~now';               // sorts after every backup folder name
  function loadHistory(ctx) {
    if (hist.loading) return;
    hist.loading = true; hist.error = null;
    ctx.backupsOf(FRE.battlePass.FILE).then(copies => {
      const entries = (copies || []).map(c => ({ stamp: c.stamp, file: new FRE.SourceFile(`${c.stamp}/${FRE.battlePass.FILE}`, c.bytes) }));
      entries.push({ stamp: NOW, file: ctx.ws.files.get(FILE) });       // the file as it is in the editor (edits included)
      hist.list = BP().seasonHistory(entries, { defines: ctx.ws.defines.defines, strings: ctx.ws.strings.map }, model(ctx));
      hist.key = ctx.backupKey; hist.copies = copies ? copies.length : 0;
    }).catch(e => { hist.error = String(e && e.message || e); hist.list = []; })
      .finally(() => { hist.loading = false; ctx.renderAll(false); });
  }

  function history(el, ctx) {
    const ws = ctx.ws, edit_ = canEdit(ctx), m = model(ctx), defines = ws.defines.defines;
    el.appendChild(h('p.muted.small', 'Every save through this editor first copies BattlePass.inc into the backups folder, so an old season shows up here after the save that replaces it. ',
      'One card per season found in the copies, newest first; seasons from before the first save are in no copy. The current season is edited in "Reward ladder". ',
      '+ puts a past reward on the current season (pick the level, quantity and cost); "Use this whole ladder" copies them all. Nothing is written to disk until you press Save.'));
    if (!ctx.backupKey) { el.appendChild(h('p', 'No backups folder yet: it is asked at the first save, and the history starts there.')); return; }
    if (!hist.list) { el.appendChild(h('p.muted', 'Reading the backups…')); loadHistory(ctx); return; }
    if (hist.error) el.appendChild(h('p.warn-text', 'Could not read the backups: ' + hist.error));
    el.appendChild(h('div.row', { style: 'justify-content:flex-start' },
      h('span.muted.small', { style: 'flex:0 0 auto' }, `${hist.copies} backup cop${hist.copies === 1 ? 'y' : 'ies'} of BattlePass.inc in ${ctx.backupKey}/`),
      h('button', { style: 'flex:0 0 auto', on: { click: () => { hist.list = null; ctx.renderAll(false); } } }, 'Read again')));
    const now = new Map(ladderRows(m).map(r => [r.level.value, r]));
    const curType = m.pass ? m.pass.type.value : null;
    const past = hist.list.filter(x => !x.current);
    if (!past.length) el.appendChild(h('p', 'No past season in the backups yet. When a save replaces a season (for example after "Start new season"), the old one shows up here.'));
    past.forEach((s, k) => {
      const ended = !s.end || s.end <= new Date();
      const where = s.first === NOW ? 'the current file (each backup holds the file from before a save)'
        : `in ${s.copies - (s.last === NOW ? 1 : 0)} backup cop${s.copies - (s.last === NOW ? 1 : 0) === 1 ? 'y' : 'ies'} from ${stampText(s.first)}${s.last === NOW ? ' and the current file' : ''}`;
      const tb = h('table.items.bp', h('tr', h('th.num', 'Level'), h('th', 'Reward'), h('th.num', 'Qty'), h('th.num', 'Cost to next level'), h('th', 'Now'), h('th', '')));
      for (const p of s.ladder) {
        const it = ws.itemById(p.id), info = it ? ws.itemInfo(it) : null, r = now.get(p.level);
        const same = r && r.define === p.define && r.qty.value === p.qty && r.points.value === p.points;
        const cmp = s.current ? '' : !r ? h('span.tag.info', 'not in the current ladder')
          : same ? h('span.muted', 'same') : h('span.warn-text', `now ${r.qty.value}x ${r.define}, cost ${fmt(r.points.value)}`);
        const known = defines.has(p.define);
        const add = s.current ? null : h('button.icon', { disabled: !edit_ || !known || !m.pass,
          title: known ? `Add to the current season: pick the level, quantity and cost` : `${p.define} is not #defined any more`,
          on: { click: () => placeDialog(ctx, s, p) } }, '+');
        tb.appendChild(h('tr', h('td.num', String(p.level)), itemCell(info, p.define), h('td.num', fmt(p.qty)), h('td.num', fmt(p.points)), h('td', cmp), h('td', add)));
      }
      const useAll = s.current ? null : h('button', { disabled: !edit_ || !m.pass, title: 'Make the current ladder equal to this one (costs, rewards, quantities); one undo step',
        on: { click: () => useLadder(ctx, s) } }, 'Use this whole ladder…');
      const reach = s.ladder.slice(0, -1).reduce((a, p) => a + Math.min(Math.max(p.points, 1), BP().MAX_BPOINTS), 0);
      el.appendChild(h('details.bp-season', {},
        h('summary', h('b', `Season ${s.type}`), ' ',
          h('span.tag.' + (s.current ? 'ok' : ended ? 'warn' : 'info'), s.current ? 'current' : ended ? 'ended' : 'not current'),
          h('span.muted', ` · last day ${s.end ? BP().dayText(addDays(s.end, -1)) : '(no valid date)'} · ${s.ladder.length} levels, ${fmt(reach)} points to the top · ${s.monsters} monsters · ${where}`),
          s.type === curType && !s.current ? h('span.muted', ' (same season number, other end date)') : null),
        h('div.row', { style: 'justify-content:flex-start;margin:6px 0' }, useAll),
        tb));
    });
  }

  function useLadder(ctx, s) {
    const f = ctx.ws.files.get(FILE);
    let plan;
    try { plan = O().restoreLadder(f.text, model(ctx), s.ladder, ctx.ws.defines.defines); } catch (e) { FRE.dom.toast(e.message, 'bad'); return; }
    if (!plan.changes.length) { FRE.dom.toast(`The current ladder is already the same as season ${s.type}'s.`, 'ok'); return; }
    modal({ title: `Use season ${s.type}'s ladder`, wide: true, body: h('div',
      h('p', `The current season (${model(ctx).pass.type.value}) gets season ${s.type}'s costs, rewards and quantities. Its season number, end date and monsters stay.`),
      h('ul.small', plan.changes.map(c => h('li', c))),
      h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(plan.splices))),
      buttons: [{ label: 'Cancel' }, { label: 'Use this ladder', cls: 'primary', onClick: () => {
        if (editAndTell(ctx, () => plan.splices, `use season ${s.type}'s ladder`))
          FRE.dom.toast(`Season ${model(ctx).pass.type.value} now has season ${s.type}'s ladder (${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'}). Nothing is written until Save.`, 'ok');
      } }] });
  }

  // ---------------------------------------------------------------- Monster points
  function monsters(el, ctx) {
    const m = model(ctx), edit_ = canEdit(ctx), mv = movers(ctx);
    const all = shownRows(ctx);
    const off = all.filter(offBand);
    const missing = unlisted(ctx);
    const junk = junkRows(ctx);
    const filt = h('select', { on: { change: ev => { st.mfilter = ev.target.value; ctx.renderAll(false); } } },
      [['listed', `Listed (${all.length})`], ['off', `Off their level band (${off.length})`], ['unlisted', `Not listed (${missing.length})`]].map(([v, l]) => h('option', { value: v, selected: st.mfilter === v }, l)));
    el.appendChild(h('div.row', { style: 'justify-content:flex-start;flex-wrap:wrap' }, h('span', { style: 'flex:0 0 auto' }, filt),
      h('button', { style: 'flex:0 0 auto', disabled: !edit_ || !off.length, on: { click: () => reprice(ctx, off) } }, `Re-price off-band rows (${off.length})…`),
      h('button', { style: 'flex:0 0 auto', disabled: !edit_ || !missing.length, title: 'Every real monster not in the list (no town NPCs or pets), at its band price',
        on: { click: () => addAll(ctx, missing) } }, `Add all unlisted monsters (${missing.length})…`)));
    if (junk.length) el.appendChild(h('p.muted.small', `${junk.length} pets and town NPCs in the file are hidden here: players never kill them, so they never pay points. `,
      h('button', { disabled: !edit_, on: { click: () => removeJunk(ctx, junk) } }, 'Delete them from the file…')));
    el.appendChild(h('p.muted.small', 'Only monsters in this list pay points; the player who lands the killing blow gets a random number between min and max (1-10,000). ',
      'The file prices by monster level - lv1-20: 4-6, 21-40: 8-12, 41-60: 14-20, 61-80: 22-32, 81-100: 32-44, 101-120: 44-60, 121-140: 60-80, 141+: 80-110 - ',
      'times 1.25 for a midboss, 1.5 for a boss and 2 for a super (commits c0a828d7, 3b8e8410). Search with the box on the left.'));
    const rows = monsterRows(ctx);
    const shown = rows.slice(0, 400);
    const tb = h('table.items.bp', h('tr', h('th', 'Monster'), h('th.num', 'Level'), h('th', 'Rank'), h('th.num', 'Min'), h('th.num', 'Max'),
      h('th', 'Band'), h('th', ''), h('th', 'Line')));
    for (const x of shown) {
      const mo = x.mover, b = mo ? BP().band(mo.level, mo.rankId) : null;
      const name = h('td', mo ? h('span', mo.name || '') : h('span.muted', '(not in propMover.txt)'), h('span.def.block', mo ? mo.define : x.row.define));
      if (!x.row) {
        tb.appendChild(h('tr', name, h('td.num', String(mo.level)), h('td', mo.rank), h('td.num', ''), h('td.num', ''), h('td', `${b.min}-${b.max}`),
          h('td', h('button', { disabled: !edit_, title: `Add with the band price ${b.min}-${b.max}`,
            on: { click: () => edit(ctx, text => O().addMonster(text, model(ctx), mo, b.min, b.max, movers(ctx)), `add ${mo.define}`) } }, '+ Add')), h('td', '')));
        continue;
      }
      const r = x.row;
      const set = (which, v) => {
        if (!v) return;
        const min = which === 'min' ? v : r.min.value, max = which === 'max' ? v : r.max.value;
        edit(ctx, () => O().setMonsterPoints(r, min, max), `${r.define} points`);
      };
      const rm = h('button.icon.danger', { disabled: !edit_, title: 'Remove: this monster pays no points',
        on: { click: () => edit(ctx, text => O().removeMonster(text, r), `remove ${r.define}`) } }, '✕');
      tb.appendChild(h('tr' + (offBand(x) ? '.changed' : ''), name, h('td.num', mo ? String(mo.level) : ''), h('td', mo ? mo.rank : ''),
        h('td.num', numInput({ value: r.min.value, min: 1, max: BP().MAX_BPOINTS, disabled: !edit_, onCommit: v => set('min', v) })),
        h('td.num', numInput({ value: r.max.value, min: 1, max: BP().MAX_BPOINTS, disabled: !edit_, onCommit: v => set('max', v) })),
        h('td', b ? `${b.min}-${b.max}` : ''), h('td', rm, ' ', diagTags(rowDiags(ctx, r))), lineCell(ctx, r)));
    }
    el.appendChild(h('h3', `Monsters (${rows.length})`));
    if (!rows.length) el.appendChild(h('p.muted', st.mfilter === 'off' ? 'Every listed monster pays its band price.' : 'Nothing matches.'));
    else el.appendChild(tb);
    if (rows.length > shown.length) el.appendChild(h('p.muted.small', `Showing the first ${shown.length} of ${rows.length}: search on the left to narrow the list.`));
    problems(el, ctx, d => all.some(x => x.row.start === d.start) && (d.code !== 'BP_BAND' || st.mfilter === 'off'));
  }

  function addAll(ctx, list) {
    const f = ctx.ws.files.get(FILE), m = model(ctx);
    const splices = O().addMonstersAtBand(f.text, m, list, movers(ctx));
    const tb = h('table.items', h('tr', h('th', 'Monster'), h('th.num', 'Level'), h('th', 'Rank'), h('th.num', 'Points')),
      [...list].sort((a, b) => a.level - b.level).map(x => { const b = BP().band(x.level, x.rankId);
        return h('tr', h('td', x.name, h('span.def.block', x.define)), h('td.num', String(x.level)), h('td', x.rank), h('td.num', `${b.min}-${b.max}`)); }));
    modal({ title: `Add ${list.length} monster${list.length > 1 ? 's' : ''} at their band price`, wide: true, body: h('div',
      h('p', 'Each row goes next to the listed monsters of the same level. Town NPCs (citizens, guards), pets and movers without a name or level are left out. One undo step.'),
      tb, h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(splices))),
      buttons: [{ label: 'Cancel' }, { label: `Add ${list.length}`, cls: 'primary', onClick: () => ctx.edit(FILE, () => splices, `add ${list.length} monsters`, 'bp|monsters') }] });
  }

  function removeJunk(ctx, list) {
    const f = ctx.ws.files.get(FILE);
    const splices = O().removeMonsters(f.text, list.map(x => x.row));
    const pets = list.filter(x => /^MI_PET_/.test(x.mover.define)).length;
    modal({ title: `Remove ${list.length} rows that are not monsters`, wide: true, body: h('div',
      h('p', `${pets} pets (buff pets from items, raised pets from pet.inc) and ${list.length - pets} town NPCs. None of them spawns as a monster in the world, so these rows never pay points. One undo step.`),
      h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(splices))),
      buttons: [{ label: 'Cancel' }, { label: `Remove ${list.length}`, cls: 'primary danger', onClick: () => ctx.edit(FILE, () => splices, `remove ${list.length} non-monsters`, 'bp|monsters') }] });
  }

  function reprice(ctx, list) {
    const f = ctx.ws.files.get(FILE);
    const splices = list.flatMap(x => O().repriceMonster(x.row, x.mover));
    const tb = h('table.items', h('tr', h('th', 'Monster'), h('th.num', 'Level'), h('th', 'Rank'), h('th.num', 'Now'), h('th.num', 'New')),
      list.map(x => { const b = BP().band(x.mover.level, x.mover.rankId);
        return h('tr', h('td', x.mover.name, h('span.def.block', x.mover.define)), h('td.num', String(x.mover.level)), h('td', x.mover.rank),
          h('td.num', `${x.row.min.value}-${x.row.max.value}`), h('td.num', `${b.min}-${b.max}`)); }));
    modal({ title: `Re-price ${list.length} monster${list.length > 1 ? 's' : ''} to their level band`, wide: true, body: h('div',
      h('p', 'Sets min and max to the band of each monster\'s level and rank in propMover.txt, and updates the "// lvN rank - Name" comment. One undo step.'),
      tb, h('h3', 'Lines that change'), FRE.ui.renderDiff(f, f.text, f.preview(splices))),
      buttons: [{ label: 'Cancel' }, { label: 'Re-price', cls: 'primary', onClick: () => ctx.edit(FILE, () => splices, `re-price ${list.length} monsters`, 'bp|monsters') }] });
  }

  function problems(el, ctx, pred) {
    const nd = bpDiags(ctx).filter(pred);
    if (!nd.length) return;
    el.appendChild(h('h3', 'Problems'));
    nd.slice(0, 200).forEach(d => el.appendChild(diagRow(d)));
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
