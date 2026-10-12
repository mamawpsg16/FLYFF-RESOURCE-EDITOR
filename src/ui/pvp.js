// PvP Events (task "PvP Events"): Guild Siege / FFA / TDM. Entry (fees, level, lives, lengths), the schedule (days and times, the
// next runs from loaders/pvp-sim.js), the PVP Token prizes, "what players get" (a sample battle through the simulator) and the
// rules boards players read, kept in step with every change (loaders/pvp-rules.js, one undo step). Edits: edit/pvp-ops.js.
(function (FRE) {
  'use strict';
  const { h, fmt, numInput, toast, keepFocus } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const FFA = 'ffamanager.inc', TDM = 'tdmmanager.inc', GC = 'guildcombat.txt', LUA = 'guildsiegeprize.lua';
  const FILE = { ffa: FFA, tdm: TDM };
  const st = { sel: 'gs' };
  const O = () => FRE.pvpOps, S = () => FRE.pvpSim, R = () => FRE.pvpRules;
  const model = ctx => ctx.ws.models.pvp;
  const can = (ctx, f) => ctx.ws.isEditable(f);
  const pDiags = ctx => ctx.ws.diags.filter(d => d.module === 'pvp');
  const t2 = (h_, m) => `${String(h_).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const DAYS = ['Every day', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const keyOf = (ev, x) => `pvp|${ev}|${x}`;
  const now = () => S().wallOf(new Date());

  // which section a problem belongs to
  function sectionOf(d) {
    const f = (d.file || '').toLowerCase();
    if (d.code === 'PVP_TIME_CLASH') return 'week';
    if (f === 'equalizedpvp.inc' || f === 'equalizedpresets.inc') return 'eq';
    if (f === FFA || f === 'npcboard_289.inc') return 'ffa';
    if (f === TDM || f === 'npcboard_290.inc') return 'tdm';
    return 'gs';
  }
  const secDiags = (ctx, id) => pDiags(ctx).filter(d => sectionOf(d) === id);
  const SECTIONS = [
    { id: 'gs', label: 'Guild Siege', sub: ctx => { const m = model(ctx), r = R().siegeRows(m.gs); return !m.gs.ok ? 'GuildCombat.txt does not load' : r.length ? r.map(x => `${DAYS[x.day]} ${t2(x.hour, x.minute)}`).join(', ') : 'no siege time'; } },
    { id: 'ffa', label: 'FFA (Free-For-All)', sub: ctx => runSub(model(ctx).ffa) },
    { id: 'tdm', label: 'TDM (Team Deathmatch)', sub: ctx => runSub(model(ctx).tdm) },
    { id: 'eq', label: '⚖ Equalized presets', sub: ctx => { const eq = model(ctx).eq; if (!eq || !eq.present) return 'not in this folder'; const on = FRE.equalized.EVENTS.filter(e => eq.events.events[e].on).map(e => FRE.equalized.EVENT_LABEL[e]); return `${eq.presets.byKey.size} of 16 presets · ${on.length ? `on in ${on.join(', ')}` : 'off everywhere'}`; } },
    { id: 'week', label: '🗓 The week', sub: ctx => { const n = S().clashes(model(ctx)).length; return n ? `${n} overlap${n === 1 ? '' : 's'}` : 'every event on the clock'; } },
  ];
  function runSub(mm) {
    if (mm.error) return `switched off: ${mm.error}`;
    const p = R().schedulePhrase(mm.cfg.times);
    return `${p || 'no start time'} · ${fmt(mm.cfg.cost)} Penya`;
  }

  const mod = {
    id: 'pvp', label: 'PvP Events', searchPlaceholder: 'Search events', noItems: true,
    help: 'PvP Events: Guild Siege, FFA and TDM days and times, entry fees and PVP Token prizes; the rules boards follow every change',
    st,
    onLoad() { st.sel = 'gs'; },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase();
      for (const s of SECTIONS) {
        if (q && !s.label.toLowerCase().includes(q)) continue;
        const ds = secDiags(ctx, s.id);
        const b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === s.id ? '.sel' : ''), { 'data-sec': s.id, on: { click: () => { st.sel = s.id; ctx.renderAll(false); } } },
          h('div.n', h('span', s.label), h('span', [...ctx.edited].some(k => k.startsWith(`pvp|${s.id}|`)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', s.sub(ctx))));
      }
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        if (st.sel === 'gs') gsView(el, ctx);
        else if (st.sel === 'week') weekView(el, ctx);
        else if (st.sel === 'eq') { FRE.ui.pvpEqualized.presetsView(el, ctx, apply); problems(el, ctx, 'eq'); }
        else runView(el, ctx, st.sel);
      });
    },

    addTarget() { return { ok: false, title: 'Nothing is added in this task' }; },

    locate(d) {
      if (d.module !== 'pvp') return false;
      st.sel = sectionOf(d);
      return true;
    },
  };

  // ---------------------------------------------------------------- shared pieces
  // one data edit + the rules boards that follow it, ONE undo step; typing pauses fold into it (mergeKey)
  function apply(ctx, lower, make, label, key, mergeKey = null) {
    let pl;
    try { pl = O().plan(ctx.ws, lower, make(ctx.ws.files.get(lower).text)); } catch (e) { toast(e.message, 'bad'); return; }
    // "…, rules board too (was …)": the shell keeps the "(was …)" at the end when typing folds steps together
    const m = /^(.*?)( \(was [^)]*\))?$/.exec(label);
    ctx.editGroup(() => pl.parts, pl.changed.length ? `${m[1]}, rules board too${m[2] || ''}` : label, [key], mergeKey);
    for (const note of pl.notes) toast('⚠ ' + note, 'bad');
  }
  function title(el, ctx, text, files) {
    el.appendChild(h('div.npc-title', h('h2', text), h('span.def', files.map(f => ctx.ws.files.get(f) ? ctx.ws.files.get(f).name : f).join(' · ')),
      files.every(f => can(ctx, f)) ? null : h('span.tag.bad', 'read-only')));
  }
  function problems(el, ctx, sec) {
    const ds = secDiags(ctx, sec);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }
  function num(ctx, file, value, min, max, key, onCommit, disabled = false) {
    return numInput({ value, min, max, key, disabled: disabled || !can(ctx, file), onCommit: v => { if (v === null || v === value) return; onCommit(v); } });
  }
  function daySelect(value, from, disabled, onChange) {
    return h('select', { disabled, on: { change: e => onChange(+e.target.value) } },
      DAYS.map((d, i) => (i < from ? null : h('option', { value: i, selected: i === value }, d))));
  }
  const pl = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
  // the boards' sentences for one event: what each says, what the data says
  function rulesTable(el, ctx, ev) {
    const rows = R().check(model(ctx), ctx.ws.files).filter(r => r.fact.ev === ev);
    el.appendChild(h('h3', 'Rules board'));
    if (!rows.length) {
      el.appendChild(h('p.muted.small', ctx.ws.files.size && !Object.values(model(ctx).boards).flat().length
        ? 'The rules boards are client files (Client/Client): pick the folder that holds the Client folder to keep them in step.'
        : 'No rules board sentence to keep in step.'));
      return;
    }
    el.appendChild(h('p.muted.small', 'Players read these boards in the game. Every change here also rewrites the same value in the board, in the same undo step (the Guild Siege boards: both the ENG and the USA copy).'));
    const tb = h('table.items.up', h('tr', h('th', 'What'), h('th', 'Board'), h('th', 'It says'), h('th', 'The data')));
    for (const r of rows) {
      const name = ctx.ws.files.get(r.board).name;
      tb.appendChild(h('tr', h('td', r.fact.label), h('td.small.muted', name),
        h('td', r.status === 'notFound' ? h('span.tag.warn', 'sentence not found') : r.said.join(' / ')),
        h('td', r.status === 'ok' ? '✓' : h('b', r.want.join(' / ')))));
    }
    el.appendChild(tb);
  }

  // ---------------------------------------------------------------- FFA / TDM
  function runView(el, ctx, ev) {
    const m = model(ctx), mm = m[ev], file = FILE[ev], K = FRE.pvp.KINDS[ev];
    title(el, ctx, ev === 'ffa' ? 'FFA (Free-For-All)' : 'TDM (Team Deathmatch)', [file, ev === 'ffa' ? 'client/npcboard_289.inc' : 'client/npcboard_290.inc'].filter(f => ctx.ws.files.has(f)));
    el.appendChild(h('p.muted.small', `${K.npc} runs it: registration opens before each start time, then players press Join, wait in the pen, fight, and go back to Flarine. The WorldServer reads ${K.file} at startup and on the GM command ${K.reload} (refused while a run is going).`));
    if (mm.error) el.appendChild(h('div.banner.bad', `${K.file}: ${mm.error}. The ${K.label} is switched off until this is fixed. See the problems below.`));
    const c = mm.cfg, off = !c;
    const val = f => (mm.keys[f] ? mm.keys[f].value : FRE.pvp.SCALARS.find(x => x[2] === f)[1]);
    const setS = (f, label, unit) => v => apply(ctx, file, t => O().setScalar(model(ctx)[ev], t, f, v), `${K.label} ${label} ${unit(v)} (was ${unit(val(f))})`, keyOf(ev, f), `pvp|${ev}|${f}`);
    // ---- entry
    el.appendChild(h('h3', 'Entry'));
    const rows = [
      ['cost', 'Entry fee', 'Penya; Penya + Perin are used. Refunded when the server cancels the run.', v => `${fmt(v)} Penya`],
      ['cancelCut', 'Cancel cut', '% of the fee kept when a player presses Cancel (registration open only)', v => `${v}%`],
      ['level', 'Minimum level', '', v => `level ${v}`],
      ['min', 'Players needed', 'registered at the start time, else cancelled (every fee back)', v => pl(v, 'player')],
      ['max', 'Most players', 'registration cap (up to 100)', v => pl(v, 'player')],
      ['lives', 'Lives', 'per player; none left = watch from the pen', v => `${fmt(v)} ${v === 1 ? 'life' : 'lives'}`],
      ['announce', 'Registration', 'minutes before each start time', v => pl(v, 'minute')],
      ['prepare', 'Time to Join', 'minutes between the start time and the battle', v => pl(v, 'minute')],
      ['war', 'Battle length', 'minutes', v => pl(v, 'minute')],
      ['respawn', 'Respawn wait', 'seconds in the pen after a death', v => pl(v, 'second')],
    ];
    const tb = h('table.items.up', h('tr', h('th', 'Setting'), h('th', 'Value'), h('th', '')));
    for (const [f, label, what, unit] of rows) {
      const lim = O().LIMITS[f], k = mm.keys[f];
      tb.appendChild(h('tr', h('td', h('b', label), what ? h('div.muted.small', what) : null),
        h('td', num(ctx, file, val(f), lim[0], lim[1], `pvp|${ev}|${f}`, setS(f, label.toLowerCase(), unit)),
          h('div.muted.small', k ? `${K.P}_${FRE.pvp.SCALARS.find(x => x[2] === f)[0]} · L${ctx.ws.files.get(file).lineOf(k.span.start) + 1}` : 'not in the file: the default, a line is added on change')),
        h('td', k ? diagTags(FRE.ui.diagsInSpan(ctx.ws, K.file, k.span.start, k.span.end)) : null)));
    }
    el.appendChild(tb);
    FRE.ui.pvpEqualized.eventBlock(el, ctx, ev.toUpperCase(), apply);
    // ---- schedule
    el.appendChild(h('h3', 'Schedule'));
    el.appendChild(h('p.muted.small', 'Each line is a start time: registration closes and the arena opens. The server PC clock (Philippine time, GMT+8). Keep runs clear of Free PK Time (00 / 04 / 08 / 12 / 16 / 20 for 60 minutes).'));
    const ts = h('table.items.up', h('tr', h('th', 'Day'), h('th', 'Time'), h('th', ''), h('th', '')));
    mm.begins.forEach((b, i) => {
      const set = t => apply(ctx, file, () => O().setBegin(model(ctx)[ev], i, t), `${K.label} start time ${DAYS[t.day].toLowerCase()} ${t2(t.hour, t.minute)} (was ${DAYS[b.day] ? DAYS[b.day].toLowerCase() : b.day} ${t2(b.hour, b.minute)})`, keyOf(ev, 'times'));
      const dis = !can(ctx, file);
      ts.appendChild(h('tr', h('td', daySelect(b.day, 0, dis, d => set({ day: d, hour: b.hour, minute: b.minute }))),
        h('td', num(ctx, file, b.hour, 0, 23, `pvp|${ev}|h${i}`, v => set({ day: b.day, hour: v, minute: b.minute })), ' : ',
          num(ctx, file, b.minute, 0, 59, `pvp|${ev}|m${i}`, v => set({ day: b.day, hour: b.hour, minute: v }))),
        h('td', can(ctx, file) ? h('button.small', { title: 'Remove this start time', on: { click: () => apply(ctx, file, t => O().removeBegin(model(ctx)[ev], t, i), `${K.label} start time ${DAYS[b.day] ? DAYS[b.day].toLowerCase() : b.day} ${t2(b.hour, b.minute)} removed`, keyOf(ev, 'times')) } }, '✕') : null),
        h('td', diagTags(FRE.ui.diagsInSpan(ctx.ws, K.file, b.stmt.start, b.stmt.end)))));
    });
    el.appendChild(ts);
    if (can(ctx, file)) el.appendChild(h('button', { on: { click: () => {
      const used = new Set(mm.begins.map(b => b.hour));
      let hr = 20; while (used.has(hr) && hr < 23) hr++;
      apply(ctx, file, t => O().addBegin(model(ctx)[ev], t, { day: 0, hour: hr, minute: 0 }), `${K.label} start time every day ${t2(hr, 0)} added`, keyOf(ev, 'times'));
    } } }, '+ Add a start time'));
    if (c) {
      const t0 = now(), runs = S().runs(c, t0, t0 + 7 * S().DAY);
      el.appendChild(h('h3', 'The next 7 days'));
      if (!runs.length) el.appendChild(h('p.muted', 'No run in the next 7 days.'));
      else el.appendChild(h('table.items.up', h('tr', h('th', 'Start'), h('th', 'Registration'), h('th', 'Battle'), h('th', 'Back in town')),
        runs.map(r => h('tr', h('td', S().dateText(r.start)), h('td', `${S().hhmm(r.announce)} - ${S().hhmm(r.start)}`),
          h('td', r.battleEnd ? `${S().hhmm(r.prepareEnd)} - ${S().hhmm(r.battleEnd)}` : '—'),
          h('td', S().hhmm(r.closed), r.skipped.length ? h('div.muted.small', `skips ${r.skipped.map(S().hhmm).join(', ')}`) : null)))));
    }
    // ---- prizes
    el.appendChild(h('h3', 'Prizes (PVP Tokens)'));
    const pt = h('table.items.up', h('tr', h('th', 'Prize'), h('th', 'PVP Tokens'), h('th', '')));
    const item = mm.rewardItem;
    if (mm.reward) pt.appendChild(h('tr', h('td', h('b', 'Every kill'), h('div.muted.small', `paid at once (${item ? item.name : 'unknown item'})`)),
      h('td', num(ctx, file, mm.reward.amount.value, 0, item ? item.packMax : 0, `pvp|${ev}|reward`, v => apply(ctx, file, () => O().setRewardAmount(model(ctx)[ev], v), `${K.label} tokens per kill ${v} (was ${mm.reward.amount.value})`, keyOf(ev, 'reward'), `pvp|${ev}|reward`))), h('td', '')));
    if (ev === 'ffa' && mm.top) mm.top.forEach((s, i) => pt.appendChild(h('tr', h('td', h('b', `Place ${i + 1}`), h('div.muted.small', 'at the end, needs 1+ kill')),
      h('td', num(ctx, file, s.value, 0, 9999, `pvp|ffa|top${i}`, v => apply(ctx, file, () => O().setTop(model(ctx).ffa, i, v), `FFA prize for place ${i + 1}: ${v} (was ${s.value})`, keyOf('ffa', 'top'), `pvp|ffa|top${i}`))), h('td', ''))));
    if (ev === 'tdm') for (const [w, label, what] of [['team', 'Winning team', 'every player of the winning team with 1+ kill; a draw pays none'], ['mvp', 'MVP', 'the player with the most kills (1+)']]) {
      const k = mm[w];
      if (k) pt.appendChild(h('tr', h('td', h('b', label), h('div.muted.small', what)), h('td', num(ctx, file, k.value, 0, 9999, `pvp|tdm|${w}`, v => apply(ctx, file, () => O().setTeamPrize(model(ctx).tdm, w, v), `TDM ${label.toLowerCase()} prize ${v} (was ${k.value})`, keyOf('tdm', w), `pvp|tdm|${w}`))), h('td', '')));
    }
    el.appendChild(pt);
    if (c) sample(el, ctx, ev, c);
    rulesTable(el, ctx, ev);
    problems(el, ctx, ev);
  }
  // what players get: one sample battle and the money, through the simulator
  function sample(el, ctx, ev, c) {
    el.appendChild(h('h3', 'What players get (a sample battle)'));
    const fee = c.cost, cut = S().cancel(c, fee, 0), money = h('p.small', `Fee ${fmt(fee)} Penya. Cancel while registration is open: ${fmt(cut.back)} back (${fmt(cut.kept)} kept). A run the server cancels (too few players): the whole ${fmt(fee)} back.`);
    el.appendChild(money);
    if (ev === 'ffa') {
      const ps = [{ id: 1, kills: 8, deaths: 3 }, { id: 2, kills: 5, deaths: 4 }, { id: 3, kills: 5, deaths: 6 }, { id: 4, kills: 2, deaths: 7 }, { id: 5, kills: 0, deaths: 10 }];
      const rows = S().ffaResult(c, ps);
      el.appendChild(h('table.items.up', h('tr', h('th', 'Place'), h('th', 'Kills / deaths'), h('th', 'Per kill'), h('th', 'Top 3'), h('th', 'Total')),
        rows.map(r => h('tr', h('td', `${r.place}`), h('td', `${r.kills} / ${r.deaths}`), h('td', fmt(r.perKill)), h('td', fmt(r.top)), h('td', h('b', fmt(r.total)))))));
      el.appendChild(h('p.muted.small', 'Ties: more kills, then fewer deaths. A top-3 prize needs at least 1 kill.'));
    } else {
      const ps = [{ id: 1, level: 150, kills: 7, deaths: 2 }, { id: 2, level: 140, kills: 4, deaths: 5 }, { id: 3, level: 130, kills: 3, deaths: 3 },
        { id: 4, level: 120, kills: 2, deaths: 4 }, { id: 5, level: 110, kills: 1, deaths: 5 }, { id: 6, level: 100, kills: 0, deaths: 4 }];
      const r = S().tdmResult(c, ps);
      el.appendChild(h('p.small', `Teams (level, snake R B B R): Red ${r.teams.red} : ${r.teams.blue} Blue → ${r.winner ? `${r.winner === 'red' ? 'Red' : 'Blue'} wins` : 'draw (no team prize)'}.`));
      el.appendChild(h('table.items.up', h('tr', h('th', 'Place'), h('th', 'Team'), h('th', 'Kills / deaths'), h('th', 'Per kill'), h('th', 'Team win'), h('th', 'MVP'), h('th', 'Total')),
        r.rows.map(x => h('tr', h('td', `${x.place}`), h('td', x.team === 'red' ? 'Red' : 'Blue'), h('td', `${x.kills} / ${x.deaths}`), h('td', fmt(x.perKill)), h('td', fmt(x.win)), h('td', fmt(x.mvp)), h('td', h('b', fmt(x.total)))))));
    }
  }

  // ---------------------------------------------------------------- Guild Siege
  function gsView(el, ctx) {
    const m = model(ctx), gc = m.gs, pz = m.prizes;
    title(el, ctx, 'Guild Siege', [GC, LUA].filter(f => ctx.ws.files.has(f) && (f !== LUA || !pz.missing)));
    el.appendChild(h('p.muted.small', 'Guilds apply at Frankie with a bid; at the siege time the siege opens if enough guilds applied. GuildCombat.txt is read when the WorldServer starts; GuildSiegePrize.lua by the WorldServer (per kill, places) and the DatabaseServer (the weekly prizes) when they start.'));
    if (!gc.ok) el.appendChild(h('div.banner.bad', `GuildCombat.txt: ${gc.error}. The WorldServer does not start with it. See the problems below.`));
    // ---- times
    el.appendChild(h('h3', 'Siege times'));
    el.appendChild(h('p.muted.small', 'One time per weekday, at most 7. The server PC clock (Philippine time, GMT+8). Applications close at the siege time.'));
    const tl = m.timeline, dis = !can(ctx, GC) || !gc.ok;
    const tt = h('table.items.up', h('tr', h('th', 'Day'), h('th', 'Time'), h('th', 'Enter / combat / end'), h('th', ''), h('th', '')));
    gc.autoOpen.forEach((r, i) => {
      const set = t => apply(ctx, GC, () => O().setSiegeRow(model(ctx).gs, i, t), `Guild Siege ${DAYS[t.day]} ${t2(t.hour, t.minute)} (was ${DAYS[r.day]} ${t2(r.hour, r.minute)})`, keyOf('gs', 'times'));
      const at = s => (s === null ? '—' : (() => { const x = (r.hour * 3600 + r.minute * 60 + s) % 86400; return t2(Math.floor(x / 3600), Math.floor(x / 60) % 60); })());
      tt.appendChild(h('tr', h('td', daySelect(r.day, 1, dis, d => set({ day: d, hour: r.hour, minute: r.minute }))),
        h('td', num(ctx, GC, r.hour, 0, 23, `pvp|gs|h${i}`, v => set({ day: r.day, hour: v, minute: r.minute }), dis), ' : ',
          num(ctx, GC, r.minute, 0, 59, `pvp|gs|m${i}`, v => set({ day: r.day, hour: r.hour, minute: v }), dis)),
        h('td.small', `${at(tl.enter)} / ${at(tl.fight)} / ${at(tl.end)}`),
        h('td', dis ? null : h('button.small', { title: 'Remove this siege time', on: { click: () => apply(ctx, GC, t => O().removeSiegeRow(model(ctx).gs, t, i), `Guild Siege ${DAYS[r.day]} ${t2(r.hour, r.minute)} removed`, keyOf('gs', 'times')) } }, '✕')),
        h('td', diagTags(FRE.ui.diagsInSpan(ctx.ws, 'GuildCombat.txt', r.stmt.start, r.stmt.end)))));
    });
    el.appendChild(tt);
    if (!dis && gc.autoOpen.length < 7) el.appendChild(h('button', { on: { click: () => {
      const free = [7, 1, 6, 4, 2, 3, 5].find(d => !gc.autoOpen.some(r => r.day === d));
      apply(ctx, GC, t => O().addSiegeRow(model(ctx).gs, t, { day: free, hour: 18, minute: 30 }), `Guild Siege ${DAYS[free]} 18:30 added`, keyOf('gs', 'times'));
    } } }, '+ Add a siege day'));
    if (gc.ok) {
      const t0 = now(), list = S().sieges(gc, tl, t0, t0 + 28 * S().DAY, { guilds: Infinity }).slice(0, 6);
      el.appendChild(h('p.small', list.length ? `Next sieges: ${list.map(s => S().dateText(s.start)).join(' · ')} (when at least ${gc.minGuild} guilds applied).` : 'No siege in the next 4 weeks.'));
      const shown = S().shownNext(gc, t0);
      if (shown !== null) el.appendChild(h('p.muted.small', `The siege window shows players: next siege ${S().dateText(shown)}.`));
    }
    // ---- entry
    el.appendChild(h('h3', 'Entry'));
    const et = h('table.items.up', h('tr', h('th', 'Setting'), h('th', 'Value')));
    if (gc.joinPenya) et.appendChild(h('tr', h('td', h('b', 'Minimum bid'), h('div.muted.small', 'Penya, paid by the guild leader when applying (JOINPENYA)')),
      h('td', num(ctx, GC, gc.joinPenya.value, 0, 2147483647, 'pvp|gs|bid', v => apply(ctx, GC, () => O().setBid(model(ctx).gs, v), `Guild Siege minimum bid ${fmt(v)} Penya (was ${fmt(gc.joinPenya.value)})`, keyOf('gs', 'bid'), 'pvp|gs|bid'), dis))));
    et.appendChild(h('tr', h('td', h('b', 'Cancel / not selected'), h('div.muted.small', 'REQUESTCANCLEPERCENT / NOTREQUESTPERCENT (shown only)')),
      h('td.small', `${gc.cancelPct}% back on cancel (${fmt(S().siegeCancel(gc, gc.joinPenya ? gc.joinPenya.value : 0))} of the minimum bid) · ${gc.notPct}% back when not selected`)));
    el.appendChild(et);
    FRE.ui.pvpEqualized.eventBlock(el, ctx, 'GS', apply);
    // ---- prizes
    el.appendChild(h('h3', 'Prizes (PVP Tokens)'));
    if (pz.missing) { el.appendChild(h('p.muted', 'GuildSiegePrize.lua not found: the compiled prizes are paid.')); }
    else {
      if (m.patch === 'missing') el.appendChild(h('div.banner.bad', 'The game source here has no part B (6de6da39): the servers ignore these numbers and pay the compiled ones.'));
      const pdis = !can(ctx, LUA) || pz.failed;
      const setP = (name, i, v, label, was) => apply(ctx, LUA, t => O().setPrize(model(ctx).prizes, t, name, i, v), `Guild Siege ${label} ${v} (was ${was})`, keyOf('gs', name), `pvp|gs|${name}|${i}`);
      const P = pz.prizes;
      const pt = h('table.items.up');
      pt.appendChild(h('tr', h('td', h('b', 'Every kill'), h('div.muted.small', 'paid at once (0 = none)')),
        h('td', num(ctx, LUA, P.TokensPerKill, 0, 32767, 'pvp|gs|kill', v => setP('TokensPerKill', 0, v, 'tokens per kill', P.TokensPerKill), pdis))));
      const ladder = (name, label, what, places) => {
        const L = pz.lists[name];
        pt.appendChild(h('tr', h('td', h('b', label), h('div.muted.small', what)),
          h('td', P[name].map((v, i) => h('span.small', `${places(i)} `, num(ctx, LUA, v, 1, 32767, `pvp|gs|${name}|${i}`, x => setP(name, i, x, `${label.toLowerCase()} ${places(i)}`, v), pdis), ' ')),
            L && L.items ? null : h('div.muted.small', 'not in the file: compiled numbers'))));
      };
      const ord = i => ['1st', '2nd', '3rd'][i] || `${i + 1}th`;
      ladder('SiegePrize', 'Siege places', 'after each siege, every fighter of the guild (online)', ord);
      ladder('GuildPrize', 'Weekly: guilds', 'most wins, top 5, into the guild bank', ord);
      ladder('ClassPrize', 'Weekly: players', 'most points, top 10, by mail', ord);
      ladder('ClassPerClassPrize', 'Weekly: each class', 'Mercenary / Magician / Acrobat / Assist, top 10 each', ord);
      ladder('MvpPrize', 'Weekly: MVP', 'most MVP awards, top 10', ord);
      el.appendChild(pt);
      el.appendChild(h('p.muted.small', `What players get: a fighter with 6 kills in the winning guild gets ${fmt(S().siegeKillTokens(P, 6))} + ${fmt(P.SiegePrize[0])} = ${fmt(S().siegeKillTokens(P, 6) + P.SiegePrize[0])} PVP Tokens from that siege, plus the weekly prizes on Monday 00:00.`));
    }
    rulesTable(el, ctx, 'gs');
    problems(el, ctx, 'gs');
  }

  // ---------------------------------------------------------------- the week
  function weekView(el, ctx) {
    const m = model(ctx);
    title(el, ctx, 'The week', []);
    el.appendChild(h('p.muted.small', 'Every run of a week, from registration (or the siege start) to everyone back in town, on the server PC clock. Two events at the same time take players from each other.'));
    const w = S().weekWindows(m), name = { ffa: 'FFA', tdm: 'TDM', gs: 'Guild Siege' };
    for (let d = 0; d < 7; d++) {
      const day0 = S().WEEK0 + d * S().DAY, list = w.filter(x => x.start >= day0 && x.start < day0 + S().DAY);
      el.appendChild(h('div.small', h('b', `${S().DAYS[d + 1]}: `), list.length ? list.map(x => `${name[x.ev]} ${S().hhmm(x.from)}-${S().hhmm(x.to)}`).join(' · ') : '—'));
    }
    const cl = S().clashes(m);
    el.appendChild(h('h3', cl.length ? `Overlaps (${cl.length})` : 'No overlaps'));
    for (const c of cl) el.appendChild(h('div.small', `${name[c.a.ev]} ${S().dayName(c.a.start)} ${S().hhmm(c.a.from)}-${S().hhmm(c.a.to)} ⟷ ${name[c.b.ev]} ${S().hhmm(c.b.from)}-${S().hhmm(c.b.to)}`));
    problems(el, ctx, 'week');
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
