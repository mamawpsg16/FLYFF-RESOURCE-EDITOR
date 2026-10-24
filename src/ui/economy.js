// Economy (docs/plans/E-economy.md): what one player earns an hour at each farming spot (map + monster), the best spot per
// level band, and a table to paste into the economy retest plan. Read-only: every number links to the task that changes it.
// The numbers: loaders/economy-sim.js (respawn cap, drops-sim per kill, exact currency drops, NPC sell price).
(function (FRE) {
  'use strict';
  const { h, fmt } = FRE.dom;
  const E = () => FRE.economySim;
  const model = ctx => ctx.ws.models.economy;
  const st = {
    sel: 'spots', level: 150, speed: 15, loops: 1, kills: 1000, goldRate: null, pieceRate: null,
    map: 'all', lvMin: 0, lvMax: 999, sort: 'penya', desc: true, shown: 100, band: 'penya',
  };
  // the worked-out numbers live outside `st` (the app compares JSON.stringify( st ) to spot a new view)
  const mem = { cache: new Map(), rows: null, rowsKey: null, bandsKey: null, busy: false, prices: null };
  const group = n => FRE.num.group(Math.round(n));
  const dec = (n, d = 1) => (n >= 100 ? group(n) : n.toFixed(d));
  // kills a minute; below 1: how long between two kills (a boss that respawns every 40 minutes)
  const kpmText = v => (v <= 0 ? '0' : v >= 1 ? v.toFixed(1) : `1 every ${v >= 1 / 90 ? Math.round(1 / v) + ' min' : (1 / v / 60).toFixed(1) + ' h'}`);
  const BANDS = [[1, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90], [90, 105], [105, 120], [120, 135], [135, 150], [150, 999]];
  const COLS = [
    { k: 'penya', label: 'Penya / h', fmt: group, tip: 'Penya per hour: drops-sim Penya per kill (PenyaTable, the level gap, the rates) × kills an hour' },
    { k: 'sun', label: 'Sunstone / h', fmt: v => dec(v), tip: 'Sunstones (II_GEN_MAT_ORICHALCUM01) per hour, from the exact drop chance' },
    { k: 'moon', label: 'Moonstone / h', fmt: v => dec(v), tip: 'Moonstones (II_GEN_MAT_MOONSTONE) per hour, from the exact drop chance' },
    { k: 'red', label: 'Red Chip / h', fmt: v => dec(v), tip: 'Red Chips (II_CHP_RED) per hour, from the exact drop chance' },
    { k: 'loot', label: 'Loot sold / h', fmt: group, tip: 'What an NPC pays for everything that dropped in an hour (cost / 4, upgraded drops cost more; event / quest items cannot be sold)' },
  ];
  const opts = () => ({ level: st.level, speed: st.speed, loops: st.loops, kills: st.kills, seed: 1,
    goldRate: st.goldRate == null ? undefined : st.goldRate, pieceRate: st.pieceRate == null ? undefined : st.pieceRate });
  const optsKey = () => JSON.stringify([st.level, st.loops, st.kills, st.goldRate, st.pieceRate]);
  const rankName = (ctx, id) => { for (const [k, v] of ctx.ws.defines.defines) if (v === id && /^RANK_/.test(k)) return k.slice(5).toLowerCase(); return ''; };

  // open another task (it reloads the folder: a few seconds)
  function openIn(task, label, setup) {
    return h('button.small', { title: `Opens the ${label} task here (the files are read again: a few seconds)`, on: { click: () => {
      FRE.app.ctx.openTask(task, c => { const m = FRE.ui.modules.find(x => x.id === task); if (m) setup(m.st, c); });
    } } }, label);
  }
  const openMonster = mid => openIn('drops', 'Drops', s => { s.show = 'all'; s.sel = mid; });

  const fresh = () => !!mem.rows && mem.rowsKey === optsKey();
  // every spot's hour at the current settings, computed behind a progress window; per-kill numbers are cached
  async function compute(ctx) {
    if (mem.busy || fresh()) return;
    mem.busy = true;
    const spots = model(ctx).spots, P = FRE.dom.progress('Working out every farming spot');
    const t0 = Date.now();
    try {
      await P.phase(`Killing each monster ${fmt(st.kills)} times (drops-sim) and adding up an hour`);
      const rows = [], o = opts();
      for (let i = 0; i < spots.length; i++) {
        if (i % 25 === 0) await P.count(i, spots.length, spots[i].name);
        rows.push({ s: spots[i], h: E().spotHour(ctx.ws, spots[i], o, mem.cache) });
      }
      mem.rows = rows; mem.rowsKey = optsKey();
      FRE.dom.toast(`✓ ${fmt(spots.length)} farming spots worked out in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    } catch (e) {
      FRE.dom.toast(`Working out the spots failed: ${e.message}`, 'bad');
      console.error(e);
    } finally {
      P.close();
      mem.busy = false;
    }
    ctx.renderAll(false);
  }
  // kills a minute depend on the speed only (no new kills needed): re-done from the cached per-kill numbers
  const hourOf = (ctx, r) => E().spotHour(ctx.ws, r.s, opts(), mem.cache);

  function setOpt(ctx, k, v, label) {
    if (st[k] === v) return;
    st[k] = v;
    st.shown = 100;
    FRE.dom.toast(`${label}: ${v == null ? 'as in Event.lua' : v} (nothing is saved: this page changes no file)`);
    ctx.renderAll(false);
  }

  function settingsBar(el, ctx) {
    const rates = ctx.ws.dropContext ? ctx.ws.dropContext.rates : { gold: 1, piece: 1, item: 1, events: [] };
    const num = (value, min, max, onSet, title) => {
      const i = h('input.num-input', { type: 'text', inputMode: 'decimal', value: value == null ? '' : String(value), title, style: 'width:5em' });
      const go = () => {
        const t = i.value.trim().replace(/,/g, '');
        if (t === '') return onSet(null);
        const v = Number(t);
        if (!Number.isFinite(v) || v < min || v > max) { FRE.dom.toast(`${title}: a number from ${min} to ${max}`, 'bad'); i.value = value == null ? '' : String(value); return; }
        onSet(v);
      };
      i.addEventListener('change', go);
      i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      return i;
    };
    const on = rates.events.filter(e => e.on).map(e => e.name);
    el.appendChild(h('div.ec-bar',
      h('label', 'Player level ', num(st.level, 1, 200, v => setOpt(ctx, 'level', v == null ? 150 : Math.round(v), 'Player level'), 'Player level (1-200)')),
      h('span', ' Kills a minute ', ...E().SPEEDS.map(v => h('button.small' + (st.speed === v ? '.primary' : ''), { on: { click: () => setOpt(ctx, 'speed', v, 'Kill speed') } }, String(v))),
        ' or ', num(E().SPEEDS.includes(st.speed) ? null : st.speed, 0.1, 600, v => setOpt(ctx, 'speed', v == null ? 15 : v, 'Kill speed'), 'Kills a minute (0.1-600)')),
      h('label', { title: 'A Gift Box party (GET01 / GET02, DST_GIFTBOX) rolls the drops twice a kill' },
        h('input', { type: 'checkbox', checked: st.loops === 2, on: { change: e => setOpt(ctx, 'loops', e.target.checked ? 2 : 1, 'Rolls a kill') } }), ' Gift Box party (2 rolls a kill)'),
      h('label', { title: 'How many kills drops-sim runs per monster for Penya and loot (the currencies use the exact chance)' }, ' Accuracy ',
        h('select', { on: { change: e => setOpt(ctx, 'kills', Number(e.target.value), 'Kills simulated per monster') } },
          [300, 1000, 3000].map(v => h('option', { value: v, selected: st.kills === v }, `${fmt(v)} kills`))))));
    el.appendChild(h('div.ec-bar.muted.small',
      `Event.lua now: Penya ×${rates.gold}, item chance ×${rates.piece}, item gate ×${rates.item} (${on.join(', ') || 'no event on'}). What if: `,
      h('label', 'Penya × ', num(st.goldRate, 0, 1000, v => setOpt(ctx, 'goldRate', v, 'What if Penya ×'), 'What if the Penya rate were (empty = Event.lua)')),
      h('label', ' Item chance × ', num(st.pieceRate, 0, 1000, v => setOpt(ctx, 'pieceRate', v, 'What if item chance ×'), 'What if the item chance rate were (empty = Event.lua)')),
      ' ', openIn('rates', 'Change the rates', s => { s.sel = 'rates'; })));
  }

  function filtered(ctx) {
    const q = ctx.query.toLowerCase();
    return mem.rows.filter(({ s }) => (st.map === 'all' || String(s.world) === st.map) && s.level >= st.lvMin && s.level <= st.lvMax
      && (!q || s.name.toLowerCase().includes(q) || s.title.toLowerCase().includes(q)));
  }

  function spotsView(el, ctx) {
    const m = model(ctx);
    el.appendChild(h('div.npc-title', h('h2', '💰 Farming spots'), h('span.muted', `${fmt(m.spots.length)} spots (a map + a monster) on ${fmt(m.maps.length)} maps`)));
    settingsBar(el, ctx);
    if (!fresh()) { el.appendChild(h('p.muted', 'Working out the spots…')); setTimeout(() => compute(ctx), 0); return; }
    const maps = [...new Map(m.spots.map(s => [s.world, s.title])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const lvBox = (k, label) => {
      const i = h('input.num-input', { type: 'text', value: st[k] === 0 || st[k] === 999 ? '' : String(st[k]), style: 'width:4em', title: label });
      i.addEventListener('change', () => { const v = Number(i.value); st[k] = i.value.trim() === '' || !Number.isFinite(v) ? (k === 'lvMin' ? 0 : 999) : v; st.shown = 100; ctx.renderAll(false); });
      return i;
    };
    el.appendChild(h('div.ec-bar',
      h('label', 'Map ', h('select', { on: { change: e => { st.map = e.target.value; st.shown = 100; ctx.renderAll(false); } } },
        h('option', { value: 'all', selected: st.map === 'all' }, 'Every map'), maps.map(([id, t]) => h('option', { value: String(id), selected: st.map === String(id) }, t)))),
      h('label', ' Monster level ', lvBox('lvMin', 'Lowest monster level'), ' to ', lvBox('lvMax', 'Highest monster level')),
      h('span.muted.small', ' Search on the left: monster or map name.')));
    const rows = filtered(ctx).map(r => ({ s: r.s, h: hourOf(ctx, r) }));
    const val = r => (st.sort === 'kpm' ? r.h.kpm : st.sort === 'level' ? r.s.level : st.sort === 'name' ? r.s.name : r.h[st.sort]);
    rows.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return st.desc ? -c : c; });
    const head = (k, label, tip) => h('th', { title: tip || 'Sort', style: 'cursor:pointer', on: { click: () => { if (st.sort === k) st.desc = !st.desc; else { st.sort = k; st.desc = k !== 'name'; } ctx.renderAll(false); } } },
      label, st.sort === k ? (st.desc ? ' ▾' : ' ▴') : '');
    const capped = rows.filter(r => r.h.capped).length;
    el.appendChild(h('p.muted.small', `${fmt(rows.length)} spot${rows.length === 1 ? '' : 's'}. Per hour = min( ${st.speed} kills a minute, what the spot respawns ) × 60 × what one kill gives at player level ${st.level}${st.loops === 2 ? ', 2 rolls a kill' : ''}.`
      + (capped ? ` ⚠ ${capped} spot${capped === 1 ? '' : 's'} respawn${capped === 1 ? 's' : ''} slower than you kill: the respawn sets the pace there.` : '')));
    const table = h('table.items.ec-table',
      h('tr', head('name', 'Monster'), h('th', 'Map'), head('level', 'Lv'), h('th', { title: 'Monsters of this kind on the map, in how many spawn boxes' }, 'How many'),
        head('kpm', 'Kills / min', 'Your kill speed, or what the spot respawns if that is lower (CRespawner::Spawn)'),
        COLS.map(c => head(c.k, c.label, c.tip)), h('th', '')),
      rows.slice(0, st.shown).map(({ s, h: hr }) => h('tr', { 'data-spot': s.key },
        h('td', s.name, h('div.muted.small', `${rankName(ctx, s.rank)} · id ${s.mover}`)),
        h('td', s.title), h('td', String(s.level)),
        h('td', { title: `respawn: ${s.lines.map(l => `${l.max} every ~${l.seconds} s`).join(', ')}` }, `${fmt(s.count)} in ${s.boxes} box${s.boxes === 1 ? '' : 'es'}`),
        h('td', { title: `This spot respawns about ${s.cap.toFixed(1)} a minute (all boxes; the biggest box ${s.boxCap.toFixed(1)})` },
          kpmText(hr.kpm), hr.capped ? h('span.tag.warn', { title: 'The respawn, not your speed, sets the pace here' }, '⚠ respawn') : null),
        COLS.map(c => h('td.num', hr[c.k] ? c.fmt(hr[c.k]) : h('span.muted', '-'))),
        h('td', openMonster(s.mover)))));
    el.appendChild(table);
    if (rows.length > st.shown) el.appendChild(h('button', { on: { click: () => { st.shown += 200; ctx.renderAll(false); } } }, `Show ${fmt(Math.min(200, rows.length - st.shown))} more (${fmt(rows.length - st.shown)} left)`));
    notCounted(el);
  }

  function notCounted(el) {
    el.appendChild(h('details.muted.small', h('summary', 'What is and is not counted'),
      h('ul',
        h('li', 'Counted: the respawn (CRespawner::Spawn: every spawn line refills about every respawn time, every other refill only half), the drops of each kill (drops-sim: PenyaTable, the level gap, the Event.lua rates, Gift Box rolls), the exact chance of each currency, what an NPC pays for the loot.'),
        h('li', 'One player farms the spot alone; a spot is every spawn box of that monster on the map (walking between boxes is not counted).'),
        h('li', 'Not counted: how fast you really kill (you set it), other players, quests, mini events, PvP prizes, the Battle Pass, trade, AI farming, the Secret Room tax on selling, Perin / Event Tokens / PVP Tokens (not from monsters).'))));
  }

  // every spot at its band's player level (fills the per-kill cache), behind a progress window
  async function computeBands(ctx) {
    if (mem.busy || mem.bandsKey === optsKey()) return;
    mem.busy = true;
    const spots = model(ctx).spots, P = FRE.dom.progress('Working out the best spot per level band');
    try {
      await P.phase(`Killing each monster ${fmt(st.kills)} times at its band's player level`);
      for (let i = 0; i < spots.length; i++) {
        if (i % 25 === 0) await P.count(i, spots.length, spots[i].name);
        const band = BANDS.find(([a, b]) => spots[i].level >= a && spots[i].level < b);
        if (band) E().spotHour(ctx.ws, spots[i], Object.assign(opts(), { level: Math.min(band[1], 200) }), mem.cache);
      }
      mem.bandsKey = optsKey();
      FRE.dom.toast(`✓ ${BANDS.length} level bands worked out`);
    } catch (e) {
      FRE.dom.toast(`Working out the bands failed: ${e.message}`, 'bad');
      console.error(e);
    } finally {
      P.close();
      mem.busy = false;
    }
    ctx.renderAll(false);
  }

  // the best spot per level band, for one currency (player level = the band's top)
  function levelView(el, ctx) {
    el.appendChild(h('div.npc-title', h('h2', '📈 Best spot by level'), h('span.muted', 'player level = the top of each band')));
    settingsBar(el, ctx);
    el.appendChild(h('div.ec-bar', h('label', 'Best for ', h('select', { on: { change: e => { st.band = e.target.value; ctx.renderAll(false); } } },
      COLS.map(c => h('option', { value: c.k, selected: st.band === c.k }, c.label.replace(' / h', '')))))));
    if (mem.bandsKey !== optsKey()) { el.appendChild(h('p.muted', 'Working out the bands…')); setTimeout(() => computeBands(ctx), 0); return; }
    const spots = model(ctx).spots, rows = [];
    for (const [a, b] of BANDS) {
      const lv = Math.min(b, 200);
      let best = null;
      for (const s of spots) {
        if (s.level < a || s.level >= b) continue;
        const hr = E().spotHour(ctx.ws, s, Object.assign(opts(), { level: lv }), mem.cache);
        if (!best || hr[st.band] > best.h[st.band]) best = { s, h: hr };
      }
      rows.push({ a, b, lv, best });
    }
    const col = COLS.find(c => c.k === st.band);
    el.appendChild(h('table.items.ec-table',
      h('tr', h('th', 'Monster level'), h('th', 'Player level'), h('th', 'Best spot'), h('th', 'Map'), h('th', 'Kills / min'), h('th', col.label), h('th', 'Penya / h'), h('th', '')),
      rows.map(r => h('tr', h('td', r.b >= 999 ? `${r.a}+` : `${r.a}-${r.b - 1}`), h('td', String(r.lv)),
        r.best ? [h('td', `${r.best.s.name} (Lv${r.best.s.level})`), h('td', r.best.s.title), h('td', kpmText(r.best.h.kpm)),
          h('td.num', col.fmt(r.best.h[st.band])), h('td.num', group(r.best.h.penya)), h('td', openMonster(r.best.s.mover))]
          : h('td', { colSpan: 6 }, h('span.muted', 'no monster spawns at these levels'))))));
    notCounted(el);
  }

  // Markdown for ECONOMY_RETEST_PLAN.md: the top spots per currency at 4 / 15 / 30 kills a minute
  function copyText(ctx) {
    const o0 = opts(), lines = [];
    lines.push(`Economy page (Resource editor), player Lv${st.level}${st.loops === 2 ? ', Gift Box party' : ''}, ${fmt(st.kills)} kills per monster; per hour at 4 / 15 / 30 kills a minute.`, '');
    for (const c of COLS) {
      lines.push(`**${c.label.replace(' / h', '')} per hour, best 5 spots**`, '', '| Spot | Map | Lv | 4 / min | 15 / min | 30 / min |', '|---|---|---|---|---|---|');
      const at = sp => model(ctx).spots.map(s => ({ s, h: E().spotHour(ctx.ws, s, Object.assign({}, o0, { speed: sp }), mem.cache) }));
      const by = E().SPEEDS.map(at);
      const order = by[1].slice().sort((x, y) => y.h[c.k] - x.h[c.k]).slice(0, 5);
      for (const r of order) {
        const v = E().SPEEDS.map((sp, i) => c.fmt(by[i].find(x => x.s === r.s).h[c.k]));
        lines.push(`| ${r.s.name} | ${r.s.title} | ${r.s.level} | ${v.join(' | ')} |`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }
  function copyView(el, ctx) {
    el.appendChild(h('div.npc-title', h('h2', '📋 Copy as table'), h('span.muted', 'for ECONOMY_RETEST_PLAN.md, Step 1 "sim" rows')));
    settingsBar(el, ctx);
    if (!fresh()) { el.appendChild(h('p.muted', 'Working out the spots…')); setTimeout(() => compute(ctx), 0); return; }
    const text = copyText(ctx);
    const ta = h('textarea.ec-copy', { readOnly: true, rows: 24, style: 'width:100%;font-family:monospace' }, text);
    el.appendChild(h('div.row', h('button.primary', { on: { click: async () => {
      try { await navigator.clipboard.writeText(text); FRE.dom.toast('✓ Copied the tables (Markdown)'); }
      catch (e) { ta.select(); FRE.dom.toast('Copy was blocked by the browser: the text is selected, press Ctrl+C', 'bad'); }
    } } }, 'Copy')));
    el.appendChild(ta);
  }

  // ---- 🏷 prices in hours
  const PST = { cur: 'all', group: 'all', sort: 'hours', desc: true, shown: 100 };
  function pricesView(el, ctx) {
    el.appendChild(h('div.npc-title', h('h2', '🏷 Prices in hours'), h('span.muted', 'how long a player farms for each thing they can buy')));
    settingsBar(el, ctx);
    if (!fresh()) { el.appendChild(h('p.muted', 'Working out the spots…')); setTimeout(() => compute(ctx), 0); return; }
    const ws = ctx.ws, Ec = E();
    const best = Ec.bestOf(mem.rows.map(r => ({ s: r.s, h: hourOf(ctx, r) })));
    const bestLine = (k, label) => (best[k] ? h('span', `${label}: `, h('b', `${best[k].s.name} (${best[k].s.title})`), ` ${k === 'penya' ? group(best[k].perHour) : dec(best[k].perHour)} an hour`) : h('span.muted', `${label}: no spot`));
    el.appendChild(h('div.ec-bar.small', h('span.muted', `At ${st.speed} kills a minute, player level ${st.level}, the best spot for`),
      bestLine('penya', 'Penya'), bestLine('red', 'Red Chips'), bestLine('sun', 'Sunstones'), bestLine('moon', 'Moonstones')));
    if (!mem.prices) mem.prices = Ec.priceRows(ws);
    const hoursText = v => (v === null ? h('span.muted', 'not from monsters') : v === 0 ? '-' : v >= 1 ? `${v.toFixed(v >= 100 ? 0 : 1)} h` : `${Math.max(1, Math.round(v * 60))} min`);
    // upgrades
    const ups = Ec.upgradeRows(ws, best, mem.prices);
    if (ups.length) el.appendChild(h('div.wh-sec', h('h3', '⚒ Upgrades (exact averages, upgrade-sim)'),
      h('table.items.ec-table', h('tr', h('th', 'Upgrade'), h('th', 'Stones'), h('th', 'Protect scrolls'), h('th', 'Penya fees'), h('th', 'Hours: stones'), h('th', 'Penya'), h('th', 'Scrolls'), h('th', 'Total')),
        ups.map(r => r.never !== undefined && !r.per ? h('tr', h('td', r.u.label), h('td', { colSpan: 7 }, `never: +${r.never} cannot pass`))
          : h('tr', h('td', r.u.label), h('td.num', `${dec(r.stones)} ${r.u.stone === 'sun' ? 'Sunstones' : 'Moonstones'}`), h('td.num', r.per.protect ? dec(r.per.protect) : '-'),
            h('td.num', group(r.per.penya)), h('td.num', hoursText(r.stoneH)), h('td.num', hoursText(r.penyaH)),
            h('td.num', r.scrollH === null ? h('span.muted', { title: 'No NPC sells the protect scroll for Penya or Red Chips' }, 'not sold') : r.scrollH ? hoursText(r.scrollH) : '-'),
            h('td.num', r.total === null ? h('span.muted', '-') : h('b', hoursText(r.total)))))),
      ups.some(r => r.per && !r.feesFile) ? h('p.muted.small', 'Penya fees: no UpgradeFees.lua in this folder, so these are the fees compiled into the WorldServer (the editor\'s Upgrade Rates task creates the file).') : null));
    // filters
    const curOpts = [['all', 'Every currency'], ...Ec.CUR_NAMES.map((n, i) => [String(i), n])];
    const groups = FRE.itemCategory.GROUPS;
    el.appendChild(h('div.ec-bar',
      h('label', 'Paid in ', h('select', { on: { change: e => { PST.cur = e.target.value; PST.shown = 100; ctx.renderAll(false); } } }, curOpts.map(([v, t]) => h('option', { value: v, selected: PST.cur === v }, t)))),
      h('label', ' Kind ', h('select', { on: { change: e => { PST.group = e.target.value; PST.shown = 100; ctx.renderAll(false); } } },
        h('option', { value: 'all', selected: PST.group === 'all' }, 'Every kind'), groups.map(g => h('option', { value: g, selected: PST.group === g }, g === 'Rides' ? 'Rides (mounts)' : g)))),
      h('span.muted.small', ' Search on the left: item or NPC name.')));
    const q = ctx.query.toLowerCase();
    const name = id => { const it = ws.itemById(id); return it ? (it.name || it.nameKey || it.define) : `item ${id}`; };
    let rows = mem.prices.filter(r => (PST.cur === 'all' || String(r.currency) === PST.cur) && (PST.group === 'all' || FRE.itemCategory.ofId(ws, r.id).group === PST.group));
    if (q) rows = rows.filter(r => name(r.id).toLowerCase().includes(q) || (r.npc && String(r.npc.name || r.npc.key).toLowerCase().includes(q)));
    rows = rows.map(r => ({ r, hrs: Ec.hoursOf(r.currency, r.price, best) }));
    const key = x => (PST.sort === 'price' ? x.r.price : PST.sort === 'name' ? name(x.r.id) : x.hrs === null ? -1 : x.hrs);
    rows.sort((a, b) => { const x = key(a), y = key(b); const c = typeof x === 'string' ? x.localeCompare(y) : x - y; return PST.desc ? -c : c; });
    const head = (k, label) => h('th', { style: 'cursor:pointer', on: { click: () => { if (PST.sort === k) PST.desc = !PST.desc; else { PST.sort = k; PST.desc = k !== 'name'; } ctx.renderAll(false); } } }, label, PST.sort === k ? (PST.desc ? ' ▾' : ' ▴') : '');
    el.appendChild(h('p.muted.small', `${fmt(rows.length)} thing${rows.length === 1 ? '' : 's'} to buy. Hours = price ÷ what the best spot for that currency gives an hour (Perins: 100,000,000 Penya each). Donate Chips, PVP Tokens and Event Tokens do not drop from monsters.`));
    const where = r => (r.from === 'donation' ? 'Donation Shop' : `${r.npc.name || r.npc.key} · tab ${r.slot + 1}`);
    el.appendChild(h('table.items.ec-table',
      h('tr', head('name', 'Item'), h('th', 'Kind'), h('th', 'Sold by'), head('price', 'Price'), head('hours', 'Hours of farming'), h('th', '')),
      rows.slice(0, PST.shown).map(({ r, hrs }) => h('tr', { 'data-price': `${r.key}|${r.slot}|${r.id}` },
        h('td', { 'data-item-id': r.id }, name(r.id)), h('td.muted.small', FRE.itemCategory.ofId(ws, r.id).sub || ''), h('td', where(r)),
        h('td.num', `${group(r.price)} ${Ec.CUR_NAMES[r.currency]}`), h('td.num', hoursText(hrs)),
        h('td', r.from === 'donation' ? openIn('donation', 'Donation Shop', () => {}) : openIn('npc', 'NPC Shops', s2 => { s2.show = 'all'; s2.sel = r.key; s2.tab = r.slot; }))))));
    if (rows.length > PST.shown) el.appendChild(h('button', { on: { click: () => { PST.shown += 200; ctx.renderAll(false); } } }, `Show ${fmt(Math.min(200, rows.length - PST.shown))} more (${fmt(rows.length - PST.shown)} left)`));
    notCounted(el);
  }

  const VIEWS = [
    { id: 'spots', label: '💰 Farming spots', sub: ctx => `${fmt(model(ctx).spots.length)} spots: Penya, Sunstones, Moonstones, Red Chips, loot per hour` },
    { id: 'prices', label: '🏷 Prices in hours', sub: ctx => 'Every shop item, the Donation Shop and upgrades, in hours of farming' },
    { id: 'level', label: '📈 Best spot by level', sub: () => 'The best spot for each 15-level band' },
    { id: 'copy', label: '📋 Copy as table', sub: () => 'Markdown for the economy retest plan' },
  ];

  const mod = {
    id: 'economy', label: 'Economy', searchPlaceholder: 'Search a monster or a map',
    help: 'Economy: what one player earns an hour at each farming spot (Penya, Sunstones, Moonstones, Red Chips, loot), with the respawn of every spawn line; every shop price and upgrade in hours of farming; the best spot per level',
    st, VIEWS,
    onLoad() { mem.cache = new Map(); mem.rows = null; mem.bandsKey = null; mem.prices = null; },

    renderList(el, ctx) {
      if (!model(ctx).maps) { el.appendChild(h('div.pad.muted', 'The maps (World/) were not read.')); return; }
      for (const v of VIEWS) el.appendChild(h('div.npc' + (st.sel === v.id ? '.sel' : ''), { 'data-view': v.id, on: { click: () => { st.sel = v.id; ctx.renderAll(false); } } },
        h('div.n', h('span', v.label)), h('div.k', v.sub(ctx))));
    },

    renderEditor(el, ctx) {
      if (!model(ctx).maps) { el.appendChild(h('p.empty-state', 'The maps were not read: pick FLYFF-V19-SOURCE or test-data (it needs Server/Resource/World).')); return; }
      if (st.sel === 'level') levelView(el, ctx);
      else if (st.sel === 'prices') pricesView(el, ctx);
      else if (st.sel === 'copy') copyView(el, ctx);
      else spotsView(el, ctx);
    },

    addTarget() { return { ok: false, title: 'Nothing to add: the Economy page changes no file' }; },
    locate() { return false; },
  };

  FRE.ui.economy = { compute, computeBands, copyText, mem };
  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
