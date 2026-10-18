// Mounts: every mount item's Mount.inc block (seat, speed, leg loops, flying, name height): what the GM command /mountset tunes in
// game, saved to the file. loaders/mounts.js reads it (LoadMountAnimationList), loaders/mount-sim.js says what it does in game,
// edit/mounts-ops.js writes it. The user, 2026-10-17: "edit Mount.inc per mount - speed, fly speed / fly max, run / walk / back
// animations + leg speeds, name offset (what /mountset does in game)".
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus, modal } = FRE.dom;
  const { diagRow } = FRE.ui;
  const FILE = 'mount.inc';
  const st = { sel: null, show: 'all', other: null };
  const M = () => FRE.mounts, O = () => FRE.mountsOps, Sim = () => FRE.mountSim;
  const model = ctx => ctx.ws.models.mounts;
  const can = ctx => ctx.ws.isEditable(FILE);
  const keyOf = id => `mounts|${id}`;
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const num = v => (v === null || v === undefined ? '' : String(Number(Number(v).toPrecision(7))));
  const xDiags = (ctx, x) => ctx.ws.diags.filter(d => d.module === 'mounts' && (x.blocks.some(b => d.start >= b.start && d.start < b.end) ||
    (d.code === 'MT_NO_BLOCK' && d.key === `MT_NO_BLOCK|${x.id}`)));
  const flies = x => !!x.anim && x.anim.nType === M().MOUNT_WALK_FLY;

  // a decimal box that takes any number (negative too): commits on a pause, Enter or leaving it
  function decInput({ value, key, disabled, title, onCommit }) {
    const el = h('input.num-input', { type: 'text', inputMode: 'decimal', value: num(value), disabled, title: title || '' });
    if (key) el.dataset.key = key;
    el.dataset.value = el.value;
    const commit = quiet => {
      if (!el.isConnected || el.value.trim() === el.dataset.value) return;
      const t = el.value.trim().replace(',', '.');
      const v = Number(t);
      if (!t || !Number.isFinite(v) || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) { if (!quiet) toast('Type a number (decimals allowed, e.g. 0.4 or -0.25)', 'bad'); return; }
      el.dataset.value = el.value.trim();
      onCommit(v);
    };
    FRE.dom.liveCommit(el, () => commit(true));
    el.addEventListener('change', () => commit(false));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    return el;
  }

  const SHOW = [
    { v: 'all', label: 'All mounts', test: () => true },
    { v: 'fly', label: 'Can fly', test: x => flies(x) },
    { v: 'ground', label: 'Ground only', test: x => !!x.anim && !flies(x) },
    { v: 'noblock', label: 'No Mount.inc block', test: x => x.isMount && !x.block },
    { v: 'problems', label: 'With problems', test: (x, ctx) => xDiags(ctx, x).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (x, ctx) => ctx.edited.has(keyOf(x.id)) },
  ];

  const mod = {
    id: 'mounts', label: 'Mounts', searchPlaceholder: 'Search mounts (name, id, model)', noItems: true,
    help: 'Mounts: how each mount sits, how fast it moves, its leg loops, flying and name height (Mount.inc, what /mountset tunes in game)',
    st,
    onLoad() { st.sel = null; st.show = 'all'; st.other = null; },

    listExtra(ctx) {
      const m = model(ctx);
      return h('div.bx-filters',
        h('select.npc-filter', { title: 'Which mounts', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
          SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${m.mounts.filter(x => o.test(x, ctx)).length})`))));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      const list = m.mounts.filter(x => test(x, ctx) && (!q || x.name.toLowerCase().includes(q) || String(x.id).includes(q) ||
        (x.define || '').toLowerCase().includes(q) || (x.model || '').toLowerCase().includes(q)));
      for (const x of list) {
        const ds = xDiags(ctx, x), nw = ds.filter(d => d.severity !== 'INFO').length;
        el.appendChild(h('div.npc.bx-row' + (st.sel === x.id ? '.sel' : ''), { 'data-mount': x.id, on: { click: () => { st.sel = x.id; ctx.renderAll(false); } } },
          FRE.dds.picture(ctx, iconOf(x.item), { cls: '.bx-icon' }),
          h('div.bx-text', h('div.n', h('span', x.name), h('span', ctx.edited.has(keyOf(x.id)) ? h('span.tag.edit', 'edited') : null, nw ? h('span.tag.warn', '⚠' + nw) : null)),
            h('div.k', `${x.id}${x.model ? ' · ' + x.model : ''} · ${!x.anim ? 'no block' : flies(x) ? 'can fly' : 'ground'}`))));
      }
      if (!list.length) el.appendChild(h('div.pad.muted', 'No mounts match.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const x = st.sel === null ? null : model(ctx).byId.get(st.sel);
        if (!x) {
          el.appendChild(h('p.empty-state', 'Select a mount on the left.'));
          el.appendChild(h('p.muted.small', 'Every value here is what the GM command /mountset changes in game until a restart. Tune a mount in game, type /mountset to print its lines, then paste them here with "Paste from /mountset".'));
          return;
        }
        mountView(el, ctx, x);
      });
    },

    addTarget() { return { ok: false, title: 'Mount items are added with their model (Boxes / item tools); here you give one an Add_Mount block' }; },
    locate(d, ctx) {
      if (d.module !== 'mounts') return false;
      const m = model(ctx);
      const b = m.blocks.find(b => d.start >= b.start && d.start < b.end);
      const x = b ? m.byId.get(b.id) : m.mounts.find(y => d.key === `MT_NO_BLOCK|${y.id}`);
      if (x) st.sel = x.id;
      return true;
    },
  };

  // one plan on the block as it is now (the model is read again after every edit)
  const edit = (ctx, id, changes, label, mergeKey) => ctx.editGroup(() => {
    const x = model(ctx).byId.get(id);
    return [{ file: FILE, splices: O().plan(ctx.ws.files.get(FILE).text, x.block, changes) }];
  }, label, [keyOf(id)], mergeKey);

  function fieldRow(ctx, x, key, opts = {}) {
    const f = M().BY_KEY.get(key), a = x.anim, e = M().entryOf(x.block, key), ed = can(ctx);
    const cur = a[key];
    const label = `${x.name}: ${f.label}`;
    let input;
    if (f.kind === 's') {
      const files = x.anis.slice();
      if (cur && !files.some(n => n.toLowerCase() === cur.toLowerCase())) files.unshift(cur);
      input = h('select', { disabled: !ed, 'data-key': `mt|${x.id}|${key}`, style: 'width:100%;max-width:26em', on: { change: ev => {
        const v = ev.target.value;
        if (v === cur) return;
        edit(ctx, x.id, { [key]: v === '' ? null : v }, v === '' ? `${label}: removed (was ${cur || 'none'})` : `${label}: ${v}${cur ? ` (was ${cur})` : ''}`);
      } } }, h('option', { value: '', selected: !cur }, opts.none || '(none)'), files.map(n => h('option', { value: n, selected: n === cur }, n)));
    } else if (opts.tick) {
      input = h('label', h('input', { type: 'checkbox', checked: cur === opts.tick.on, disabled: !ed, on: { change: ev => {
        const v = ev.target.checked ? opts.tick.on : opts.tick.off;
        edit(ctx, x.id, { [key]: v }, `${label}: ${ev.target.checked ? 'yes' : 'no'}`);
      } } }), ' ', opts.tick.text);
    } else {
      input = decInput({ value: cur, key: `mt|${x.id}|${key}`, disabled: !ed, title: f.min !== undefined ? `${f.minOpen ? 'above ' : ''}${f.min} to ${f.max} (/mountset ${f.cmd})` : '',
        onCommit: v => { if (f.kind === 'n' && !Number.isInteger(v)) { toast(`${f.label}: a whole number`, 'bad'); return; }
          edit(ctx, x.id, { [key]: v }, `${label} ${num(v)} (was ${num(cur)})`, `mt|${x.id}|${key}`); } });
    }
    return h('tr', h('td', f.label, f.cmd ? h('span.muted.small', ` /mountset ${f.cmd}`) : null), h('td', input),
      h('td', e ? h('span.muted.small', `line ${ctx.ws.files.get(FILE).lineOf(e.keyTok.start) + 1}`) : h('span.muted.small', `default ${f.kind === 's' ? '(none)' : num(f.def)}: not in the file`)),
      h('td', ed && e && key !== 'dwID' ? h('button.icon', { title: `Remove the line: back to the default (${f.kind === 's' ? 'none' : num(f.def)})`,
        on: { click: () => edit(ctx, x.id, { [key]: null }, `${label}: back to the default (was ${f.kind === 's' ? cur || 'none' : num(cur)})`) } }, '↺') : null),
      opts.note ? h('td.muted.small', opts.note) : h('td'));
  }
  // the same columns in every section: name, value, line, ↺, note
  const table = rows => h('table.items.rt.mt-table', { style: 'table-layout:fixed;width:100%' },
    h('colgroup', ['22%', '28%', '13%', '4%', '33%'].map(w => h('col', { style: `width:${w}` }))), rows);

  function mountView(el, ctx, x) {
    const f = ctx.ws.files.get(FILE);
    el.appendChild(h('div.npc-title', FRE.dds.picture(ctx, iconOf(x.item), { cls: '.bx-icon' }), h('h2', x.name), h('span.def', `${x.define || '?'} · ${x.id}${x.model ? ' · model ' + x.model : ''}`),
      can(ctx) ? null : h('span.tag.bad', 'read-only'), x.block ? h('span.line', `Mount.inc L${f.lineOf(x.block.start) + 1}`) : null));
    if (!x.block) { addBlockView(el, ctx, x); return; }
    if (x.blocks.length > 1) el.appendChild(h('p.small.warn-text', `⚠ ${x.blocks.length} Add_Mount blocks have this dwID: the last one (line ${f.lineOf(x.block.start) + 1}) is used and shown here.`));
    if (!ctx.ws.clientModels) el.appendChild(h('p.small.muted', 'Pick a folder with Client/Model (or test-data with Client/Model.list) to choose loops from the model\'s own .ani files.'));
    const ed = can(ctx);
    el.appendChild(h('div.dr-line',
      h('button', { disabled: !ed, on: { click: () => pasteDialog(ctx, x) } }, '📋 Paste from /mountset'),
      h('button', { disabled: !ed, on: { click: () => copyDialog(ctx, x) } }, '⧉ Copy from another mount'),
      h('button', { title: 'Open the Donation Shop task to list this mount or set its price', on: { click: () => ctx.openTask('donation') } }, '🛒 Donation Shop')));

    el.appendChild(h('h3', 'Moving on the ground'));
    el.appendChild(table([fieldRow(ctx, x, 'fGroundSpeed', { note: 'replaces the rider\'s own speed: speed buffs do nothing while riding' }),
      fieldRow(ctx, x, 'fAnimSpeed', { note: 'how fast the moving loop plays (1 = the file\'s own rate)' }),
      fieldRow(ctx, x, 'fWalkAnimSpeed', { note: 'walk mode and backing up' })]));
    el.appendChild(h('h3', 'Leg loops'));
    el.appendChild(table([fieldRow(ctx, x, 'szStand', { none: '(none: the model\'s own stand)' }), fieldRow(ctx, x, 'szRun', { none: '(none: the walk-mode loop)' }),
      fieldRow(ctx, x, 'szWalk', { none: '(none: the standing loop)' }), fieldRow(ctx, x, 'szWalkBack', { none: '(none: the walk-mode loop)' })]));
    el.appendChild(h('h3', 'Flying'));
    const rows = [fieldRow(ctx, x, 'nType', { tick: { on: 1, off: 0, text: 'can take off (Tab in game)' } })];
    if (flies(x) || M().entryOf(x.block, 'fFlightSpeed') || M().entryOf(x.block, 'fFlyMaxSpeed')) {
      rows.push(fieldRow(ctx, x, 'fFlightSpeed', { note: `0 = the item's own push (${num(x.itemFlight)}, Spec_Item fFlightSpeed)` }),
        fieldRow(ctx, x, 'fFlyMaxSpeed', { note: '0 = 0.3, every broom\'s top speed' }), fieldRow(ctx, x, 'fFlyAnimSpeed'),
        fieldRow(ctx, x, 'szFlyStand', { none: '(none: the standing loop)' }), fieldRow(ctx, x, 'szFlyWalk', { none: '(none: the walk-mode loop)' }),
        fieldRow(ctx, x, 'szFlyStart', { none: '(none: no take-off move)' }), fieldRow(ctx, x, 'szFlyLand', { none: '(none: no landing move)' }));
    }
    el.appendChild(table(rows));
    if (flies(x)) el.appendChild(h('p.muted.small', `Take-off needs flight level ${x.flightLimit} (the item's dwFlightLimit), a map where flying is allowed, and 1 second since the last take-off / landing.`));
    el.appendChild(h('h3', 'Name and seat'));
    el.appendChild(table([fieldRow(ctx, x, 'fNameOffset', { note: 'lifts the name, HP bar and chat balloon above the rider' }),
      fieldRow(ctx, x, 'nBindBone'), fieldRow(ctx, x, 'fOffSetX'), fieldRow(ctx, x, 'fOffSetY'), fieldRow(ctx, x, 'fOffSetZ'),
      fieldRow(ctx, x, 'fRotX'), fieldRow(ctx, x, 'fRotY'), fieldRow(ctx, x, 'fRotZ')]));
    el.appendChild(h('p.muted.small', 'The seat depends on the model\'s bones, so the editor can\'t show it: tune it in game, then paste the values.'));

    gameView(el, ctx, x);
    compareView(el, ctx, x);
    const ds = xDiags(ctx, x);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
    el.appendChild(h('p.muted.small', 'After saving: run Stop Server.bat, then Start Server.bat (the WorldServer reads the speed and "can fly"; the game reads the seat, loops and name height).'));
  }

  const ms = v => `${num(Math.round(v * 100) / 100)}`;
  function gameView(el, ctx, x) {
    const d = Sim().describe(x), g = d.ground;
    el.appendChild(h('h3', 'What happens in game'));
    const ul = h('ul.mt-game');
    ul.appendChild(h('li', `Moves ${ms(g.perSec.run)} units a second (${num(g.perTick.run)} a frame, 60 frames a second); walk mode ${ms(g.perSec.walk)}, backing up ${ms(g.perSec.back)}, sideways ${ms(g.perSec.side)}.`));
    ul.appendChild(h('li', `Mounting plays ${d.mountOn || '(nothing)'}.`));
    for (const s of d.loops) ul.appendChild(h('li', `${s.state[0].toUpperCase() + s.state.slice(1)}: ${s.file || '(no file: the last loop keeps playing)'}${s.motion ? ` at ${num(s.speed)}×` : ''}.`));
    if (d.flies) {
      const sec = d.fly.shownPerSec;
      ul.appendChild(h('li', `Flying: the speed meter shows ${sec[0]} after 1 s, ${sec[2]} after 3 s and settles at ${d.fly.steadyShown} (turbo ${d.turbo.steadyShown}), ${ms(d.fly.steadyPerSec)} units a second. Letting go, it glides for ${(d.fly.glideTicks / 60).toFixed(1)} s.`));
      if (d.fly.steady < d.fly.max * (1 - Sim().FRIC_AIR) - 1e-6)
        ul.appendChild(h('li.warn-text', `The flying top speed (${num(d.fly.max)}) is never reached: the push (${num(d.fly.push)} a frame) and the air friction settle at ${Number(d.fly.steady.toFixed(3))} a frame first. Raise the flying push to go faster.`));
      const air = d.air.filter((s, i) => i > 0 && s.loaded).map(s => `${s.state} ${s.loaded}${s.once ? ' (once)' : ''}`);
      ul.appendChild(h('li', `In the air: ${air.join(' → ')}.`));
    } else ul.appendChild(h('li', 'Can\'t take off: the server answers "This mount cannot fly."'));
    if (d.name) ul.appendChild(h('li', `The name sits ${num(d.name)} higher.`));
    el.appendChild(ul);
  }

  function compareView(el, ctx, x) {
    const m = model(ctx), others = m.mounts.filter(y => y.anim && y.id !== x.id);
    if (!others.length) return;
    const y = others.find(o => o.id === st.other) || others[0];
    const row = z => { const d = Sim().describe(z); return [ms(d.ground.perSec.run), num(z.anim.fAnimSpeed), num(z.anim.fWalkAnimSpeed), d.flies ? String(d.fly.steadyShown) : '—', num(z.anim.fNameOffset)]; };
    const a = row(x), b = row(y);
    el.appendChild(h('h3', 'Compare with ', h('select', { on: { change: e => { st.other = Number(e.target.value); ctx.renderAll(false); } } },
      others.map(o => h('option', { value: o.id, selected: o.id === y.id }, `${o.name} (${o.id})`)))));
    const heads = ['Speed (units / s)', 'Moving leg speed', 'Walk leg speed', 'Flying meter (held)', 'Name height'];
    el.appendChild(h('table.items.rt', [h('tr', h('th', ''), h('th', x.name), h('th', y.name)), ...heads.map((t, i) => h('tr', { style: a[i] !== b[i] ? 'font-weight:600' : '' }, h('td', t), h('td', a[i]), h('td', b[i])))]));
  }

  // what a plan of changes means, one line per key, for the preview of paste / copy
  function changeLines(x, ch) {
    return Object.entries(ch).filter(([k, v]) => {
      const cur = M().entryOf(x.block, k) ? x.anim[k] : null;
      return v === null ? cur !== null : (M().BY_KEY.get(k).kind === 's' ? v !== cur : cur === null || Math.fround(v) !== Math.fround(cur));
    }).map(([k, v]) => `${k}: ${M().entryOf(x.block, k) ? num(x.anim[k]) || x.anim[k] : '(default)'} → ${v === null ? '(default)' : (typeof v === 'string' ? v : num(v))}`);
  }
  const onlyChanged = (x, ch) => Object.fromEntries(Object.entries(ch).filter(([k]) => changeLines(x, { [k]: ch[k] }).length));

  function pasteDialog(ctx, x) {
    const ta = h('textarea', { rows: 6, style: 'width:100%', placeholder: 'Mount 225049: fGroundSpeed=0.40; fAnimSpeed=1.65; fWalkAnimSpeed=1.25; fNameOffset=0.00;\nszRun="item_Mount058_run.ani"; szWalk="item_Mount058_walk.ani"; szWalkBack="item_Mount058_walkback.ani";' });
    const prev = h('div.small');
    let ch = null;
    const show = () => {
      prev.textContent = ''; ch = null;
      if (!ta.value.trim()) return;
      try {
        const p = O().pasteChanges(ta.value);
        if (p.id !== null && p.id !== x.id) prev.appendChild(h('p.warn-text', `⚠ These lines are for mount ${p.id}, not ${x.id}: they will be applied to ${x.name} anyway.`));
        ch = onlyChanged(x, p.values);
        const lines = changeLines(x, ch);
        prev.appendChild(lines.length ? h('ul', lines.map(l => h('li', l))) : h('p.muted', 'Nothing would change.'));
        if (p.unknown.length) prev.appendChild(h('p.muted', `Skipped: ${p.unknown.join(', ')}`));
      } catch (e) { prev.appendChild(h('p.warn-text', e.message)); }
    };
    ta.addEventListener('input', show);
    modal({ title: `Paste from /mountset: ${x.name}`, body: h('div', h('p.small', 'In game, ride the mount and type /mountset: it prints the current values. Copy those lines here.'), ta, prev),
      buttons: [{ label: 'Apply changes', cls: 'primary', onClick: () => {
        if (!ch || !Object.keys(ch).length) { toast('Nothing to apply', 'bad'); return false; }
        edit(ctx, x.id, ch, `${x.name}: pasted from /mountset (${Object.keys(ch).length} value${Object.keys(ch).length > 1 ? 's' : ''})`);
      } }, { label: 'Cancel' }] });
  }

  function copyDialog(ctx, x) {
    const m = model(ctx), others = m.mounts.filter(y => y.block && y.id !== x.id);
    let src = others[0] || null;
    const pick = { speeds: true, loops: false, seat: false };
    const prev = h('div.small');
    const changes = () => {
      if (!src) return {};
      const keys = [...(pick.speeds ? O().COPY_SPEEDS : []), ...(pick.seat ? O().COPY_SEAT : []), ...(pick.loops ? O().COPY_LOOPS : [])];
      return onlyChanged(x, O().copyChanges(src.block, keys));
    };
    const show = () => {
      prev.textContent = '';
      const lines = changeLines(x, changes());
      prev.appendChild(lines.length ? h('ul', lines.map(l => h('li', l))) : h('p.muted', 'Nothing would change.'));
      if (pick.loops && src && src.model !== x.model) prev.appendChild(h('p.warn-text', `⚠ ${src.name} uses model ${src.model}: its loop files are not ${x.model}'s.`));
    };
    const tick = (k, text) => h('label', h('input', { type: 'checkbox', checked: pick[k], on: { change: e => { pick[k] = e.target.checked; show(); } } }), ' ', text);
    const combo = FRE.ui.combo({ options: others.map(y => ({ v: y.id, label: `${y.name} (${y.id})`, find: `${y.name} ${y.id} ${y.model || ''}` })), value: src ? src.id : null,
      placeholder: 'Pick a mount', onPick: v => { src = m.byId.get(v); show(); } });
    show();
    modal({ title: `Copy from another mount: ${x.name}`, body: h('div', h('div.dr-line', h('span', 'From'), combo),
      h('div.dr-line', tick('speeds', 'Speeds, leg speeds, name height, flying'), tick('loops', 'Loops (the model\'s files)'), tick('seat', 'Seat (per model)')), prev),
      buttons: [{ label: 'Apply changes', cls: 'primary', onClick: () => {
        const ch = changes();
        if (!Object.keys(ch).length) { toast('Nothing would change', 'bad'); return false; }
        edit(ctx, x.id, ch, `${x.name}: copied ${Object.keys(ch).length} value${Object.keys(ch).length > 1 ? 's' : ''} from ${src.name}`);
      } }, { label: 'Cancel' }] });
  }

  function addBlockView(el, ctx, x) {
    el.appendChild(h('p', `${x.name} has no Add_Mount block: when ridden, the rider is not placed on a seat and keeps their own speed.`));
    if (!can(ctx)) return;
    const m = model(ctx), tmpls = m.mounts.filter(y => y.block);
    let tmpl = tmpls[tmpls.length - 1] || null;
    const own = O().ownLoops(x);
    const prev = h('pre.small');
    const show = () => {
      try {
        const sp = O().addBlock(ctx.ws.files.get(FILE).text, m, x.id, tmpl ? tmpl.block : null, own);
        prev.textContent = sp[0].insert.replace(/^\r?\n+/, '');
      } catch (e) { prev.textContent = e.message; }
    };
    el.appendChild(h('div.dr-line', h('span', 'Copy the values of'), FRE.ui.combo({ options: tmpls.map(y => ({ v: y.id, label: `${y.name} (${y.id})`, find: `${y.name} ${y.id}` })),
      value: tmpl ? tmpl.id : null, placeholder: 'Pick a mount', onPick: v => { tmpl = m.byId.get(v); show(); } }),
      h('button.primary', { on: { click: () => ctx.editGroup(() => [{ file: FILE, splices: O().addBlock(ctx.ws.files.get(FILE).text, model(ctx), x.id, tmpl ? tmpl.block : null, own) }],
        `${x.name}: new Add_Mount block${tmpl ? ` (values of ${tmpl.name})` : ''}`, [keyOf(x.id)]) } }, '+ Add Mount.inc block')));
    el.appendChild(h('p.muted.small', `Its loops are ${x.model ? x.model + '\'s own files' : 'left empty (no model found)'}${Object.keys(own).length ? '' : ' (none found in Client/Model)'}; the seat is the copied mount's: tune it in game with /mountset.`));
    show();
    el.appendChild(prev);
  }

  FRE.ui.modules.push(mod);
  FRE.ui.mounts = { mountView };
})(globalThis.FRE = globalThis.FRE || {});
