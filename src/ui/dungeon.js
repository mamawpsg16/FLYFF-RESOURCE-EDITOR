// Dungeons (PartyDungeon.lua + propMoverEx.inc): pick a party dungeon, set its time limit, cooldown, levels, classes and
// kill-all, see what players get ("Try entering", the clock), and edit the drops of every monster in it with the
// Monster Drops editor itself (ui/drops.js renders inside this screen; edits go through edit/drops-ops.js).
// Loader: loaders/dungeon.js, simulator: loaders/dungeon-sim.js, edits: edit/dungeon-ops.js.
(function (FRE) {
  'use strict';
  const { h, fmt, numInput, keepFocus, durationInput, durationText } = FRE.dom;
  const { diagRow } = FRE.ui;
  const FILE = 'partydungeon.lua';
  const st = { sel: null, mon: null, tryCls: 'legend', tryLevel: null };
  const D = () => FRE.dungeon, O = () => FRE.dungeonOps, S = () => FRE.dungeonSim;
  const model = ctx => ctx.ws.models.dungeon;
  const can = ctx => ctx.ws.isEditable(FILE);
  const keyOf = d => `dg|${d.index}`;
  const dDiags = ctx => ctx.ws.diags.filter(x => x.module === 'dungeon');
  const blockDiags = (ctx, d) => {
    const m = model(ctx), next = m.dungeons[d.index + 1];
    return dDiags(ctx).filter(x => x.start >= d.at.start && (!next || x.start < next.at.start));
  };
  const CLASSES = [['CLASS_NORMAL', 'Normal (1st job)'], ['CLASS_MASTER', 'Master'], ['CLASS_HERO', 'Hero'], ['CLASS_LEGEND_HERO', 'Legend Hero']];
  const minOf = ms => (typeof ms === 'number' && Number.isFinite(ms) ? ms / 60000 : null);
  const ROLE_WORD = { boss: 'boss', 'mid-boss': 'mid-boss', normal: 'dungeon monster', map: 'map monster' };

  function titleOf(ctx, d) {
    const w = ctx.ws.area && d.worldId !== null ? ctx.ws.area.worlds.get(d.worldId) : null;
    return (w && w.title) || d.map || d.world || `Dungeon ${d.index + 1}`;
  }
  function edit(ctx, d, make, label, field) {
    ctx.editGroup(() => [{ file: FILE, splices: make(ctx.ws.files.get(FILE).text) }], label, [keyOf(d)], `dg|${d.index}|${field}`);
  }

  const mod = {
    id: 'dungeon', label: 'Dungeons', searchPlaceholder: 'Search dungeons',
    help: 'Dungeons: time limit, cooldown, levels, classes and kill-all of each party dungeon (PartyDungeon.lua), and the drops of its monsters',
    st,
    onLoad() { st.sel = null; st.mon = null; },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase();
      let shown = 0;
      for (const d of model(ctx).dungeons) {
        const name = titleOf(ctx, d);
        if (q && !name.toLowerCase().includes(q) && !String(d.world).toLowerCase().includes(q)) continue;
        shown++;
        const ds = blockDiags(ctx, d), b = ds.filter(x => x.severity === 'BLOCK').length, w = ds.filter(x => x.severity === 'WARN').length;
        const v = d.server;
        el.appendChild(h('div.npc' + (st.sel === d.index ? '.sel' : ''), { on: { click: () => { st.sel = d.index; st.mon = null; ctx.renderAll(false); } } },
          h('div.n', h('span', name), h('span', ctx.edited.has(keyOf(d)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', `lv ${v.nMinLevel}-${v.nMaxLevel} · ${v.dwDungeonTime ? durationText(Math.round(v.dwDungeonTime / 60000)) : 'no time limit'} · ${d.world}`)));
      }
      if (!shown) el.appendChild(h('div.pad.muted', 'No dungeons match.'));
    },

    renderEditor(el, ctx) {
      const d = st.sel !== null ? model(ctx).dungeons[st.sel] : null;
      if (!d) { el.appendChild(h('p.empty-state', 'Select a dungeon on the left.')); return; }
      keepFocus(el, () => dungeonView(el, ctx, d));
    },

    // + item from the item list: a drop of the monster shown below (the Monster Drops form)
    addTarget(ctx) {
      const dm = FRE.ui.modules.find(m => m.id === 'drops');
      if (st.mon === null || !dm) return { ok: false, title: 'Pick a monster of the dungeon first (Drops, below)' };
      return dm.addTarget(ctx);
    },

    locate(x, ctx) {
      if (x.module !== 'dungeon') return false;
      const m = model(ctx);
      for (let i = m.dungeons.length - 1; i >= 0; i--) if (x.start >= m.dungeons[i].at.start) { st.sel = i; break; }
      return true;
    },
  };

  function dungeonView(el, ctx, d) {
    const ws = ctx.ws, edit_ = can(ctx), f = ws.files.get(FILE), m = model(ctx);
    const entry = m.server.get(d.worldId === null ? 0 : d.worldId);
    const first = !entry || entry.first === d;
    const name = titleOf(ctx, d);
    el.appendChild(h('div.npc-title', h('h2', name), h('span.def', d.world || '?'), h('span.line', `${f.name} L${f.lineOf(d.at.start) + 1}`),
      edit_ ? null : h('span.tag.bad', 'read-only')));
    if (!first) el.appendChild(h('div.banner.bad', `This world is added twice. The server uses the first block (line ${f.lineOf(entry.first.at.start) + 1}) for every setting below; only this block's monsters count.`));
    el.appendChild(h('p.muted.small', 'The WorldServer reads PartyDungeon.lua once, at start: after saving, run Stop Server.bat, then Start Server.bat. ',
      'A setting without its own line uses the default of InstanceDungeonBase.lua (30 min time limit, 30 min cooldown, levels 1-120, every class, no kill-all).'));

    const v = d.lua, sv = d.server, own = n => (d.stmts[n] ? null : h('span.tag.info', { title: 'No line in the file: the default is used. A change writes the line.' }, 'default'));
    const rows = h('table.items.dg-set');
    const row = (label, ...cells) => rows.appendChild(h('tr', h('th', label), h('td', ...cells)));

    // time limit
    const tMin = minOf(v.dwDungeonTime);
    row('Time limit', Number.isInteger(tMin) ? durationInput({ minutes: tMin, disabled: !edit_, key: `dg|${d.index}|time`, max: O().MAX_MIN,
      onCommit: mm => edit(ctx, d, t => O().setTime(t, d, mm), `${name}: time limit ${mm ? durationText(mm) : 'none'} (was ${tMin ? durationText(tMin) : 'none'})`, 'time') })
      : h('span.tag.warn', 'not whole minutes: edit the line by hand'), ' ', own('SetDungeonTime'),
      h('div.muted.small', sv.dwDungeonTime ? `The clock starts when the party's dungeon opens. Warnings at 5 and 1 minute left; at 0 everyone inside is sent out. 0 = no limit.` : 'No time limit: the party can stay as long as they like.'));
    // cooldown
    const cMin = minOf(v.dwCoolTime);
    row('Cooldown', Number.isInteger(cMin) ? durationInput({ minutes: cMin, disabled: !edit_, key: `dg|${d.index}|cool`, max: O().MAX_MIN,
      onCommit: mm => edit(ctx, d, t => O().setCool(t, d, mm), `${name}: cooldown ${mm ? durationText(mm) : 'none'} (was ${cMin ? durationText(cMin) : 'none'})`, 'cool') })
      : h('span.tag.warn', 'not whole minutes: edit the line by hand'), ' ', own('SetCoolTime'),
      h('div.muted.small', 'Starts when a player enters. Until it ends that player cannot enter another run of this dungeon (re-entering the same run is fine). Anarchy can shorten it.'));
    // levels
    const lv = (i, val) => numInput({ value: val, min: 1, max: O().MAX_LEVEL, disabled: !edit_, key: `dg|${d.index}|lv${i}`,
      onCommit: x => { if (!x) return; const lo = i ? sv.nMinLevel : x, hi = i ? x : sv.nMaxLevel;
        if (lo > hi) { FRE.dom.toast(`The lowest level (${lo}) cannot be above the highest (${hi}).`, 'bad'); ctx.renderAll(false); return; }
        edit(ctx, d, t => O().setLevels(t, d, lo, hi), `${name}: levels ${lo}-${hi} (was ${sv.nMinLevel}-${sv.nMaxLevel})`, 'lv'); } });
    row('Levels', lv(0, sv.nMinLevel), ' to ', lv(1, sv.nMaxLevel), ' ', own('SetLevel'));
    // classes
    const have = CLASSES.filter(([c]) => sv.dwClass & D().CONST[c]).map(([c]) => c);
    row('Classes', ...CLASSES.map(([c, label]) => h('label.small', { style: 'margin-right:10px' }, h('input', { type: 'checkbox', checked: have.includes(c), disabled: !edit_,
      on: { change: e => { const next = e.target.checked ? [...have, c] : have.filter(x => x !== c);
        if (!next.length) { FRE.dom.toast('Keep at least one class: with none, nobody can enter.', 'bad'); ctx.renderAll(false); return; }
        edit(ctx, d, t => O().setClasses(t, d, next), `${name}: classes ${next.map(x => CLASSES.find(y => y[0] === x)[1]).join(', ')}`, 'cls'); } } }), ' ', label)), own('SetClass'));
    // kill-all
    row('Kill all first', h('label', h('input', { type: 'checkbox', checked: sv.bKillAll, disabled: !edit_,
      on: { change: e => edit(ctx, d, t => O().setKillAll(t, d, e.target.checked), `${name}: kill-all ${e.target.checked ? 'on' : 'off'}`, 'kill') } }),
      ' every map monster must be killed before the final boss appears'), ' ', own('SetKillAll'));
    el.appendChild(rows);

    // try entering
    el.appendChild(h('h3', 'Try entering'));
    const level = st.tryLevel === null ? sv.nMinLevel : st.tryLevel;
    const r = S().enter(entry ? entry.data : sv, { cls: st.tryCls, level }, { now: 0 });
    const msg = r.ok ? `Enters. Cooldown ${durationText(Math.round(sv.dwCoolTime / 60000)) || 'none'} starts now.`
      : r.text === 'TID_GAME_INSTANCE_LEVEL' ? `Refused: "only levels ${r.args[0]} to ${r.args[1]} can enter".` : 'Refused: "your class cannot enter this dungeon".';
    el.appendChild(h('div.dr-line', h('select', { on: { change: e => { st.tryCls = e.target.value; ctx.renderAll(false); } } },
      [['normal', 'Normal'], ['master', 'Master'], ['hero', 'Hero'], ['legend', 'Legend Hero']].map(([x, l]) => h('option', { value: x, selected: x === st.tryCls }, l))),
      h('span', 'level'), numInput({ value: level, min: 1, max: 300, onCommit: x => { if (x) { st.tryLevel = x; ctx.renderAll(false); } } }),
      h('span' + (r.ok ? '' : '.bad'), msg)));
    if (sv.dwDungeonTime) {
      const ev = S().clock(sv.dwDungeonTime);
      el.appendChild(h('p.small.muted', 'The clock of one run: ', ev.map(x => `${x.t ? `after ${durationText(Math.round(x.t / 60000))}` : 'at the start'}: ${x.kind === 'clock' ? `"Dungeon Time" ${fmt(x.ms / 1000)} s` : x.kind === 'warn' ? `"${x.text}"` : 'everyone sent out'}`).join(' · ')));
    }

    // drops of every monster in it
    const rgn = m.rgn.get(d.map);
    const mons = D().monstersOf(d, first ? entry : null, rgn);
    el.appendChild(h('h3', `Drops (${mons.length} monsters)`));
    if (rgn === null || rgn === undefined) el.appendChild(h('p.muted.small', ws.worldFiles && ws.worldFiles.size ? `No ${d.map || '?'}.rgn: only the SetMonster monsters are listed.` : 'Reading the maps… (the map monsters show when the World folder is read).'));
    const dm = FRE.ui.modules.find(x => x.id === 'drops');
    const dropsModel = ws.models.drops;
    const tb = h('table.items', h('tr', h('th', 'Monster'), h('th', 'In this dungeon'), h('th', 'Drop lines'), h('th', '')));
    for (const x of mons) {
      const mv = ws.movers.movers.get(x.id), blk = dropsModel && dropsModel.monsters.get(x.id);
      const n = blk ? blk.list.filter(e => e.kind === 'item').length : 0;
      tb.appendChild(h('tr' + (st.mon === x.id ? '.sel' : ''),
        h('td', mv ? mv.name : String(x.id), h('div.muted.small', `${mv ? `lv ${mv.level} · ` : ''}${mv ? mv.define : ''}`)),
        h('td', x.roles.map(r2 => ROLE_WORD[r2]).join(', '), x.roles.includes('map') ? h('span.muted.small', ` · ${fmt(x.count)} on the map`) : null),
        h('td', blk ? String(n) : h('span.muted', 'no drop block')),
        h('td', h('button.small', { disabled: !blk, title: blk ? 'Edit its drops here' : 'This monster has no block in propMoverEx.inc: add one by hand first',
          on: { click: () => { st.mon = st.mon === x.id ? null : x.id; ctx.renderAll(false); } } }, st.mon === x.id ? 'Close' : 'Edit drops'))));
    }
    el.appendChild(tb);
    if (st.mon !== null && dm && dropsModel && dropsModel.monsters.get(st.mon)) {
      const box = h('div.dg-drops', { style: 'border-top:2px solid var(--line, #ccc); margin-top:12px; padding-top:8px' });
      dm.st.sel = st.mon;
      dm.renderEditor(box, ctx);
      el.appendChild(box);
    }

    const ds = blockDiags(ctx, d);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const x of ds) el.appendChild(diagRow(x)); }
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
