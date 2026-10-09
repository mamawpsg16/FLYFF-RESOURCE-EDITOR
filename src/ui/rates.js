// Rates & Buffs (task I part 1): the server rates in Event.lua, the Server Buff (ServerBuff.txt), the Guild Buff (GuildBuff.txt)
// and a calculator that shows what one kill gives (loaders/rates-sim.js). Edits: edit/rates-ops.js. Plain words (the user, 2026-10-07);
// both drop numbers explained (the user, 2026-10-09).
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput, toast, keepFocus, liveCommit } = FRE.dom;
  const { diagTags, fieldLabel, formFooter, diagRow, pencil } = FRE.ui;
  const EV = 'event.lua', SB = 'serverbuff.txt', GB = 'guildbuff.txt';
  const st = { sel: 'rates', calc: null };
  const R = () => FRE.rates, O = () => FRE.ratesOps, Sim = () => FRE.ratesSim;
  const model = ctx => ctx.ws.models.rates;
  const can = (ctx, f) => ctx.ws.isEditable(f);
  const rDiags = ctx => ctx.ws.diags.filter(d => d.module === 'rates');
  const spanDiags = (ctx, file, a, b) => rDiags(ctx).filter(d => d.file.toLowerCase() === file && d.start !== undefined && d.start >= a && d.start < Math.max(b, a + 1));
  const num = v => Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : '?';
  const stampText = n => { const s = String(n); return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10)}` : s; };
  const keyOf = (sec, x) => `rates|${sec}|${x}`;

  const SECTIONS = [
    { id: 'rates', label: 'Server rates', sub: ctx => { const a = model(ctx).events.active; return `EXP ×${num(a.exp)} · Penya ×${num(a.gold)} · items ×${num(a.piece)}`; } },
    { id: 'server', label: 'Server Buff', sub: ctx => model(ctx).server ? `${model(ctx).server.tiers.length} tiers (players online → EXP)` : 'ServerBuff.txt not found' },
    { id: 'guild', label: 'Guild Buff', sub: ctx => model(ctx).guild ? `${model(ctx).guild.tiers.length} tiers (guild level + members online → stats)` : 'GuildBuff.txt not found' },
    { id: 'calc', label: '🧮 Rate calculator', sub: () => 'What one kill gives a player' },
  ];
  const fileOfSection = { rates: EV, server: SB, guild: GB };

  // a decimal box (rates): commits while typing (after a pause) and on Enter / leaving it
  function decInput({ value, key, disabled, title, onCommit }) {
    const el = h('input.num-input', { type: 'text', inputMode: 'decimal', value: value == null ? '' : num(value), disabled, title: title || '' });
    if (key) el.dataset.key = key;
    el.dataset.value = el.value;
    const commit = () => {
      if (!el.isConnected || el.value.trim() === el.dataset.value) return;
      const v = Number(el.value.trim().replace(',', '.'));
      if (!el.value.trim() || !Number.isFinite(v) || v <= 0) { toast('Type a number above 0 (decimals allowed, e.g. 1.5)', 'bad'); return; }
      el.dataset.value = el.value.trim();
      onCommit(v);
    };
    liveCommit(el, commit);
    el.addEventListener('change', commit);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    return el;
  }
  function textInput({ value, key, disabled, max, width, onCommit }) {
    const el = h('input', { type: 'text', value: value || '', disabled, maxLength: max || 255, style: `width:${width || '14em'}` });
    if (key) el.dataset.key = key;
    el.dataset.value = el.value;
    const commit = () => { if (!el.isConnected || el.value === el.dataset.value) return; el.dataset.value = el.value; onCommit(el.value); };
    liveCommit(el, commit);
    el.addEventListener('change', commit);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
    return el;
  }
  // a typed field: pauses while typing one value fold into one undo step
  function typed(ctx, file, field, make, label, key) {
    ctx.editGroup(() => [{ file, splices: make(ctx.ws.files.get(file).text) }], label, [key], `rt|${field}`);
  }

  // an icon of Client/Icon (.dds or a picture file)
  const iconCache = new Map();
  function iconPic(ctx, name, scale = 1) {
    const box = h('span.dds-pic.rt-icon');
    if (!name || !ctx.clientFile) return box;
    const k = name.toLowerCase();
    if (!iconCache.has(k)) iconCache.set(k, ctx.clientFile('Icon/' + name).then(b => {
      if (!b) return null;
      if (/\.dds$/i.test(name)) return { dds: FRE.dds.decode(b) };
      return { url: URL.createObjectURL(new Blob([b])) };
    }).catch(() => null));
    iconCache.get(k).then(img => {
      if (!img) { box.appendChild(h('span.tag.warn', { title: `The game looks for this picture in Client/Icon/${name} and did not find it there: the buff bar would show no picture. (Or no Client folder was picked.)` }, '⚠ picture not found')); return; }
      if (img.url) { const i = h('img', { src: img.url, title: name }); i.style.height = 32 * scale + 'px'; box.appendChild(i); return; }
      const d = img.dds, c = h('canvas', { width: d.w, height: d.h, title: name });
      c.style.width = d.w * scale + 'px'; c.style.height = d.h * scale + 'px';
      c.getContext('2d').putImageData(new ImageData(d.rgba, d.w, d.h), 0, 0);
      box.appendChild(c);
    });
    return box;
  }
  // icon field: a searchable list of Client/Icon when the Client folder is there, else a text box
  function iconField(ctx, { value, key, disabled, onCommit }) {
    const wrap = h('span.rt-iconfield', iconPic(ctx, value));
    const fallback = () => wrap.appendChild(textInput({ value, key, disabled, max: R().ICON_MAX, onCommit }));
    if (!ctx.clientNames || disabled) { fallback(); return wrap; }
    ctx.clientNames('Icon').then(names => {
      if (!names) { fallback(); return; }
      wrap.appendChild(FRE.ui.combo({ options: names.map(n => ({ v: n, label: n, find: n })), value, placeholder: 'Pick an icon (Client/Icon)', onPick: v => onCommit(v) }));
    });
    return wrap;
  }

  const mod = {
    id: 'rates', label: 'Rates & Buffs', searchPlaceholder: 'Search sections', noItems: true,
    help: 'Rates & Buffs: the server rates (Event.lua), the Server Buff and the Guild Buff, and what one kill gives',
    st,
    onLoad() { st.sel = 'rates'; st.calc = null; },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase();
      for (const s of SECTIONS) {
        if (q && !s.label.toLowerCase().includes(q)) continue;
        const f = fileOfSection[s.id];
        const ds = f ? rDiags(ctx).filter(d => d.file.toLowerCase() === f) : [];
        const b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === s.id ? '.sel' : ''), { 'data-sec': s.id, on: { click: () => { st.sel = s.id; ctx.renderAll(false); } } },
          h('div.n', h('span', s.label), h('span', [...ctx.edited].some(k => k.startsWith(`rates|${s.id}|`)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', s.sub(ctx))));
      }
      el.appendChild(h('div.pad.muted.small', 'Later in this task: level-up gifts, rebirth tiers, the couple buff.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        if (st.sel === 'server') serverView(el, ctx);
        else if (st.sel === 'guild') guildView(el, ctx);
        else if (st.sel === 'calc') calcView(el, ctx);
        else ratesView(el, ctx);
      });
    },

    addTarget() { return { ok: false, title: 'Items are not added in this task' }; },

    locate(d) {
      if (d.module !== 'rates') return false;
      const f = String(d.file).toLowerCase();
      st.sel = f === SB ? 'server' : f === GB ? 'guild' : 'rates';
      return true;
    },
  };

  function problems(el, ctx, file) {
    const ds = rDiags(ctx).filter(d => d.file.toLowerCase() === file);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // ------------------------------------------------------------- Server rates (Event.lua)
  function ratesView(el, ctx) {
    const ev = model(ctx).events, f = ctx.ws.files.get(EV), edit_ = can(ctx, EV);
    el.appendChild(h('div.npc-title', h('h2', 'Server rates'), h('span.def', 'Event.lua'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (ev.failed) el.appendChild(h('div.banner.bad', 'Event.lua would not run: the server then uses ×1 for every rate and gives no level-up gifts. See the problems below.'));
    const a = ev.active, on = ev.events.filter(e => e.on);
    const who = k => on.filter(e => e.f[k]).map(e => e.name).join(' × ') || 'no event sets it';
    el.appendChild(h('p.muted.small', `Running now (${stampText(ev.now)}): ${on.map(e => e.name).join(', ') || 'no event'}. When several events run at the same time, their numbers multiply.`));
    const gate = R().GATE_FULL;
    const rows = [
      ['exp', 'EXP ×', 'Every monster kill gives this many times the EXP (more parts below in the calculator).'],
      ['gold', 'Penya ×', 'The Penya of every kill is multiplied by this.'],
      ['item', 'Drop roll gate ×', `Decides whether a kill can drop items at all: a roll of 0-99 must be below 100 × this (a monster at the player's level), down to 10 × this (8+ levels below the player). From ×${gate} every kill passes, so more changes nothing.`],
      ['piece', 'Item chance ×', 'Every drop line\'s own chance is multiplied by this (a line that gives 2% gives about 4% at ×2). This is the number that makes items drop more often.'],
      ['weather', 'Weather bonus ×', 'EXP is multiplied by this while it rains or snows (/weather). Only then.'],
    ];
    const tb = h('table.items.rt', h('tr', h('th', 'Rate'), h('th', 'Now'), h('th', 'Set by'), h('th', 'What it does')));
    for (const [k, label, what] of rows) {
      const warn = k === 'item' && a.item > gate ? h('span.tag.warn', { title: FRE.diagHelp.RT_GATE_NO_EFFECT.join('\n→ ') }, `⚠ above ×${gate} changes nothing`) : null;
      tb.appendChild(h('tr', h('td', h('b', label)), h('td', `×${num(a[k])}`, warn), h('td.small', who(k)), h('td.small.muted', what)));
    }
    el.appendChild(tb);

    for (const e of ev.events) eventCard(el, ctx, e, f, edit_);
    problems(el, ctx, EV);
  }

  function eventCard(el, ctx, e, f, edit_) {
    const rateKinds = Object.keys(R().KINDS);
    const hasRates = rateKinds.some(k => e.f[k]);
    const card = h('div.rt-card', h('div.dr-line', h('h3', { style: 'margin:0' }, e.name || '(no name)'),
      h('span.tag.' + (e.on ? 'ok' : 'info'), e.on ? 'running now' : 'not running now'),
      h('span.line', `Event.lua L${f.lineOf(e.start) + 1}`)));
    const key = keyOf('rates', e.idx);
    // time windows
    for (const [i, t] of e.times.entries()) {
      const set = (which, s) => typed(ctx, EV, `${e.idx}|t${i}|${which}`, txt => O().setTime(txt, t, which, s),
        `${e.name}: changed the ${which} date (was ${stampText(which === 'start' ? t.a : t.b)})`, key);
      card.appendChild(h('div.dr-line', h('span', i ? 'and from' : 'From'),
        textInput({ value: t.aArg ? t.aArg.str : '', key: `rt|${e.idx}|t${i}|a`, disabled: !edit_, width: '10em', onCommit: v => set('start', v) }),
        h('span', 'until'),
        textInput({ value: t.bArg ? t.bArg.str : '', key: `rt|${e.idx}|t${i}|b`, disabled: !edit_, width: '10em', onCommit: v => set('end', v) }),
        h('span.muted.small', '(YYYY-MM-DD HH:MM, the server\'s clock)')));
    }
    if (!e.times.length) card.appendChild(h('p.muted.small', 'No SetTime line: this event never runs.'));
    // rates of this event: shown for events that have one (and for "Server Rates"-like events: any event may get one)
    if (hasRates || /rate/i.test(e.name)) {
      const tb = h('table.items.rt');
      for (const k of rateKinds) {
        const cur = e.f[k];
        const label = R().KINDS[k].label;
        tb.appendChild(h('tr', h('td', label),
          h('td', decInput({ value: cur ? cur.value : null, key: `rt|${e.idx}|${k}`, disabled: !edit_,
            title: cur ? `${R().KINDS[k].fn}( ${cur.arg.text} ), line ${f.lineOf(cur.stmt.start) + 1}` : `Not set (×1). Typing a number adds ${R().KINDS[k].fn}( … ) to this event.`,
            onCommit: v => typed(ctx, EV, `${e.idx}|${k}`, txt => O().setFactor(txt, e, k, v), `${e.name}: ${label}${num(v)} (was ${cur ? '×' + num(cur.value) : 'not set'})`, key) })),
          h('td.small.muted', cur ? '' : 'not set: ×1'),
          h('td', cur ? diagTags(spanDiags(ctx, EV, cur.stmt.start, cur.stmt.end)) : null)));
      }
      card.appendChild(tb);
      if (e.weatherTitle) card.appendChild(h('div.dr-line', h('span', 'Weather message'),
        textInput({ value: e.weatherTitle.str, key: `rt|${e.idx}|wt`, disabled: !edit_, width: '22em',
          onCommit: v => typed(ctx, EV, `${e.idx}|wt`, txt => O().setWeatherTitle(txt, e, v), `${e.name}: changed the weather message`, key) })));
    } else card.appendChild(h('p.muted.small', 'This event sets no rate (level-up gifts and the like come in part 2).'));
    el.appendChild(card);
  }

  // ------------------------------------------------------------- Server Buff
  function serverView(el, ctx) {
    const sb = model(ctx).server, edit_ = can(ctx, SB);
    el.appendChild(h('div.npc-title', h('h2', 'Server Buff'), h('span.def', 'ServerBuff.txt'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (!sb) { el.appendChild(h('p.empty-state', 'ServerBuff.txt is not in Server/Resource.')); return; }
    el.appendChild(h('p.muted.small', 'Free EXP for everyone on this WorldServer, by how many players are online. The highest tier reached counts (tiers do not add up). ',
      'Its % is ADDED to the EXP factor (×30 with +20% = ×30.2), not multiplied. The game shows the name, the icon and the next tier on the buff bar. ',
      'Not yet confirmed in game: the EXP per kill (02ad5901).'));
    const tb = h('table.items.rt', h('tr', h('th', 'Tier'), h('th', 'Players online'), h('th', 'EXP +%'), h('th', 'Name'), h('th', 'Icon'), h('th', '')));
    const f = ctx.ws.files.get(SB);
    for (const [i, t] of sb.tiers.entries()) {
      const key = keyOf('server', i);
      const n = (field, span, min, max, what) => numInput({ value: span.value, min, max, disabled: !edit_, key: `rt|sb|${i}|${field}`,
        onCommit: v => { if (v === null) return; typed(ctx, SB, `sb|${i}|${field}`, () => O().setNumber(span, v, min, max, what), `Server Buff tier ${t.tier.value}: ${what} ${v} (was ${span.value})`, key); } });
      tb.appendChild(h('tr', h('td', n('tier', t.tier, 1, 2147483647, 'tier number')),
        h('td', n('on', t.online, 0, 100000, 'players online')), h('td', n('pct', t.pct, 0, 100000, 'EXP +%')),
        h('td', textInput({ value: t.name.text, key: `rt|sb|${i}|name`, disabled: !edit_, max: R().NAME_MAX,
          onCommit: v => typed(ctx, SB, `sb|${i}|name`, () => O().setString(t.name, v, 'name', R().NAME_MAX), `Server Buff tier ${t.tier.value}: name "${v}"`, key) })),
        h('td', iconField(ctx, { value: t.icon.text, key: `rt|sb|${i}|icon`, disabled: !edit_,
          onCommit: v => ctx.edit(SB, () => O().setString(t.icon, v, 'icon file name', R().ICON_MAX), `Server Buff tier ${t.tier.value}: icon ${v}`, key) })),
        h('td', h('button.icon.danger', { disabled: !edit_, title: 'Remove this tier', on: { click: () => ctx.edit(SB, txt => O().removeTier(txt, t), `Server Buff: removed tier ${t.tier.value}`, key) } }, '✕'), ' ',
          diagTags(spanDiags(ctx, SB, t.start, t.end)), h('span.line', `L${f.lineOf(t.start) + 1}`))));
    }
    el.appendChild(tb);
    el.appendChild(h('div.dr-line', h('button.primary', { disabled: !edit_ || !sb.open, on: { click: () => tierForm(ctx, false) } }, '+ Add tier')));
    problems(el, ctx, SB);
  }

  // ------------------------------------------------------------- Guild Buff
  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws);
    const opts = [{ v: 0, label: '(none)', find: 'none' }];
    for (const [v, w] of [...words].sort((a, b) => (a[1].word || a[1].define).localeCompare(b[1].word || b[1].define)))
      opts.push({ v, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}` });
    return { opts, words };
  }
  const dstLabel = (words, v) => { if (!v) return '(none)'; const w = words.get(v); return w ? `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' %' : ''}` : `stat ${v}`; };

  function guildView(el, ctx) {
    const gb = model(ctx).guild, edit_ = can(ctx, GB);
    el.appendChild(h('div.npc-title', h('h2', 'Guild Buff'), h('span.def', 'GuildBuff.txt'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (!gb) { el.appendChild(h('p.empty-state', 'GuildBuff.txt is not in Server/Resource.')); return; }
    el.appendChild(h('p.muted.small', 'Every online member of a guild gets these stats when the guild level AND the members online reach a tier. The highest tier reached counts. ',
      'An EXP stat multiplies the EXP factor by (1 + %/100). The description is only text: players read it on the buff bar, so keep it in step with the stats ("✎ Write description from stats").'));
    const { opts, words } = dstOptions(ctx);
    const f = ctx.ws.files.get(GB);
    for (const [i, t] of gb.tiers.entries()) {
      const key = keyOf('guild', i), what = `Guild Buff tier ${t.tier.value}`;
      const n = (field, span, min, max, label) => numInput({ value: span.value, min, max, disabled: !edit_, key: `rt|gb|${i}|${field}`,
        onCommit: v => { if (v === null) return; typed(ctx, GB, `gb|${i}|${field}`, () => O().setNumber(span, v, min, max, label), `${what}: ${label} ${v} (was ${span.value})`, key); } });
      const card = h('div.rt-card', h('div.dr-line', h('h3', { style: 'margin:0' }, `Tier ${t.tier.value}`), iconPic(ctx, t.icon.text),
        h('span.line', `GuildBuff.txt L${f.lineOf(t.start) + 1}`), diagTags(spanDiags(ctx, GB, t.start, t.end)),
        h('button.icon.danger', { disabled: !edit_, title: 'Remove this tier', on: { click: () => ctx.edit(GB, txt => O().removeTier(txt, t), `Guild Buff: removed tier ${t.tier.value}`, key) } }, '✕')));
      card.appendChild(h('div.dr-line', h('span', 'Tier number'), n('tier', t.tier, 1, 2147483647, 'tier number'),
        h('span', 'Guild level'), n('glv', t.glv, 0, 1000, 'guild level'), h('span', 'Members online'), n('on', t.online, 0, 100000, 'members online')));
      const stats = h('table.items.rt', h('tr', h('th', 'Stat'), h('th', 'Amount'), h('th', '')));
      t.bonus.forEach((b, j) => {
        const cur = b.dst.ok ? b.dst.value : 0;
        stats.appendChild(h('tr',
          h('td', edit_ ? FRE.ui.combo({ options: opts, value: cur, placeholder: 'Pick a stat', wordStart: true,
            onPick: v => ctx.edit(GB, () => O().setBonus(b, v, v ? (b.adj.value || 1) : 0), `${what}: stat ${j + 1} ${dstLabel(words, v)} (was ${dstLabel(words, cur)})`, key) }) : dstLabel(words, cur)),
          h('td', numInput({ value: b.adj.value, min: -2147483647, max: 2147483647, disabled: !edit_ || !cur, key: `rt|gb|${i}|adj${j}`,
            onCommit: v => { if (v === null) return; typed(ctx, GB, `gb|${i}|adj${j}`, () => O().setNumber(b.adj, v, -2147483647, 2147483647, 'amount'), `${what}: ${dstLabel(words, cur)} ${v} (was ${b.adj.value})`, key); } }),
            words.get(cur) && words.get(cur).rate ? ' %' : ''),
          h('td', diagTags(spanDiags(ctx, GB, b.dst.start, b.adj.end)))));
      });
      card.appendChild(stats);
      card.appendChild(h('div.dr-line', h('span', 'Name'), textInput({ value: t.name.text, key: `rt|gb|${i}|name`, disabled: !edit_, max: R().NAME_MAX,
        onCommit: v => typed(ctx, GB, `gb|${i}|name`, () => O().setString(t.name, v, 'name', R().NAME_MAX), `${what}: name "${v}"`, key) }),
        h('span', 'Icon'), iconField(ctx, { value: t.icon.text, key: `rt|gb|${i}|icon`, disabled: !edit_,
          onCommit: v => ctx.edit(GB, () => O().setString(t.icon, v, 'icon file name', R().ICON_MAX), `${what}: icon ${v}`, key) })));
      const auto = O().describe(t.bonus.map(b => ({ dst: b.dst.ok ? b.dst.value : 0, adj: b.adj.value })), words);
      card.appendChild(h('div.dr-line', h('span', 'Description'), textInput({ value: t.desc.text, key: `rt|gb|${i}|desc`, disabled: !edit_, max: R().DESC_MAX, width: '28em',
        onCommit: v => typed(ctx, GB, `gb|${i}|desc`, () => O().setString(t.desc, v, 'description', R().DESC_MAX), `${what}: description`, key) }),
        h('button', { disabled: !edit_ || auto === t.desc.text || !auto, title: auto === t.desc.text ? 'The description already says this' : `Write: ${auto}`,
          on: { click: () => describeDialog(ctx, t, auto, what, key) } }, pencil(), ' Write description from stats')));
      if (auto && auto !== t.desc.text) card.appendChild(h('p.small.warn-text', `⚠ The description does not match the stats: they give "${auto}".`));
      el.appendChild(card);
    }
    el.appendChild(h('div.dr-line', h('button.primary', { disabled: !edit_ || !gb.open, on: { click: () => tierForm(ctx, true) } }, '+ Add tier')));
    problems(el, ctx, GB);
  }

  function describeDialog(ctx, t, auto, what, key) {
    modal({ title: `Edit description: ${what}`, body: h('div', h('p', 'Now:'), h('pre.preview', t.desc.text), h('p', 'From the stats:'), h('pre.preview', auto),
      h('p.muted.small', 'One undo step. Players see it on the buff bar after Stop / Start Server.bat.')),
    buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => ctx.edit(GB, () => O().setString(t.desc, auto, 'description', R().DESC_MAX), `${what}: description written from the stats`, key) }] });
  }

  // ------------------------------------------------------------- + Add tier (both files)
  function tierForm(ctx, guild) {
    const ws = ctx.ws, b = guild ? model(ctx).guild : model(ctx).server, file = guild ? GB : SB, last = b.tiers[b.tiers.length - 1];
    const s = guild
      ? { tier: last ? last.tier.value + 1 : 1, glv: last ? last.glv.value + 10 : 1, online: last ? last.online.value + 5 : 1,
        bonus: last ? last.bonus.map(x => ({ dst: x.dst.ok ? x.dst.value : 0, adj: x.adj.value })) : [0, 0, 0, 0, 0].map(() => ({ dst: 0, adj: 0 })),
        name: last ? last.name.text.replace(/\d+\s*$/, m => String(Number(m) + 1)) : 'Guild Buff Lv.1', desc: '', icon: last ? last.icon.text : '', descAuto: true }
      : { tier: last ? last.tier.value + 1 : 1, online: last ? last.online.value + 10 : 10, pct: last ? last.pct.value + 5 : 5,
        name: last ? last.name.text : 'Server Buff', icon: last ? last.icon.text : '' };
    const words = guild ? dstOptions(ctx).words : null, opts = guild ? dstOptions(ctx).opts : null;
    const checks = h('div'), preview = h('div'), body = h('div.nn-form');
    let btn = null;
    const plan = () => O().addTier(ws.files.get(file).text, b, s, guild);
    function refresh() {
      if (guild && s.descAuto) s.desc = O().describe(s.bonus, words);
      checks.textContent = ''; preview.textContent = '';
      const probs = [];
      try { O().checkTier(s, guild); } catch (e) { probs.push(['BLOCK', e.message]); }
      if (b.tiers.some(t => t.tier.value === s.tier)) probs.push(['BLOCK', `Tier ${s.tier} exists already`]);
      if (last && (s.tier < last.tier.value || s.online < last.online.value || (guild && s.glv < last.glv.value)))
        probs.push(['WARN', 'This tier needs less than the last one or has a lower number: the server picks the highest tier NUMBER whose needs are met']);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(p => p[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', 'Fix the ⛔ first.')); return; }
      const sp = plan(), f = ws.files.get(file);
      preview.appendChild(h('pre.preview', `${f.name}, line ${f.lineOf(sp[0].start) + 1}:\n+${sp[0].insert.replace(/\r?\n$/, '')}`));
      preview.appendChild(h('p', guild ? `Members of a guild of level ${s.glv}+ with ${s.online}+ members online get: ${O().describe(s.bonus, words) || 'nothing'}.`
        : `With ${s.online}+ players online, every kill gets +${s.pct}% EXP (added to the EXP factor).`));
    }
    const row = (label, req, ...x) => h('div.nn-row', fieldLabel(label, req), ...x);
    const n = (field, min, max) => numInput({ value: s[field], min, max, key: `rt|add|${field}`, live: true, onCommit: v => { s[field] = v === null ? NaN : v; refresh(); } });
    body.appendChild(row('Tier number', true, n('tier', 1, 2147483647)));
    if (guild) { body.appendChild(row('Guild level (at least)', true, n('glv', 0, 1000))); body.appendChild(row('Members online (at least)', true, n('online', 0, 100000))); }
    else { body.appendChild(row('Players online (at least)', true, n('online', 0, 100000))); body.appendChild(row('EXP +%', true, n('pct', 0, 100000))); }
    if (guild) s.bonus.forEach((x, j) => body.appendChild(row(`Stat ${j + 1}`, false,
      FRE.ui.combo({ options: opts, value: x.dst, placeholder: 'Pick a stat', wordStart: true, onPick: v => { x.dst = v; if (!v) x.adj = 0; refresh(); } }),
      numInput({ value: x.adj, min: -2147483647, max: 2147483647, key: `rt|add|adj${j}`, live: true, onCommit: v => { x.adj = v || 0; refresh(); } }))));
    body.appendChild(row('Name', true, textInput({ value: s.name, key: 'rt|add|name', max: R().NAME_MAX, onCommit: v => { s.name = v; refresh(); } })));
    if (guild) {
      const descBox = textInput({ value: s.desc, key: 'rt|add|desc', max: R().DESC_MAX, width: '28em', onCommit: v => { s.desc = v; s.descAuto = false; refresh(); } });
      body.appendChild(row('Description', false, descBox, h('span.muted.small', ' written from the stats until you type in it')));
    }
    body.appendChild(row('Icon', true, iconField(ctx, { value: s.icon, key: 'rt|add|icon', onCommit: v => { s.icon = v; refresh(); } })));
    formFooter({ checks, action: 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const m = modal({ title: `Add a tier: ${guild ? 'Guild Buff' : 'Server Buff'}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: 'Add', cls: 'primary', id: 'rt-add-btn', onClick: () => ctx.edit(file, () => plan(), `${guild ? 'Guild' : 'Server'} Buff: added tier ${s.tier}`, keyOf(guild ? 'guild' : 'server', b.tiers.length)) }] });
    btn = m.el.querySelector('#rt-add-btn');
    refresh();
  }

  // ------------------------------------------------------------- 🧮 calculator
  function calcView(el, ctx) {
    const ws = ctx.ws, m = model(ctx);
    const mvs = ws.movers ? ws.movers.movers : new Map();
    if (!st.calc) {
      const first = [...mvs.values()].find(x => /AIBATT1$/.test(x.define)) || [...mvs.values()].find(x => x.exp > 0);
      st.calc = { monsterId: first ? first.id : null, playerLevel: first ? first.level : 1, tier: 'normal', scrollPct: 0, gearExp: 0,
        serverTier: null, online: 0, guildTier: null, guildLevel: 0, guildOnline: 0, weather: false, rebirth: 0 };
    }
    const c = st.calc;
    el.appendChild(h('div.npc-title', h('h2', '🧮 Rate calculator')));
    el.appendChild(h('p.muted.small', 'One kill by one player alone who did all the damage, with the rates in the files as they are now (also before saving). ',
      'Not counted: party EXP, cheers, Anarchy, the Lord event, Free PK Time, rest points, a GM /exprate.'));
    const rerender = () => ctx.renderAll(false);
    const monOpts = ws._rtMonOpts || [...mvs.values()].filter(x => x.exp > 0).sort((a, b) => a.level - b.level || a.define.localeCompare(b.define))
      .map(x => ({ v: x.id, label: `${x.name || x.define} (lv ${x.level})`, find: `${x.name} ${x.define}` }));
    ws._rtMonOpts = monOpts;
    const sel = (key, list) => h('select', { on: { change: e => { const v = e.target.value; c[key] = v === '' ? null : (isNaN(Number(v)) ? v : Number(v)); rerender(); } } },
      list.map(([v, l]) => h('option', { value: v === null ? '' : v, selected: c[key] === v }, l)));
    const n = (key, min, max) => numInput({ value: c[key], min, max, key: `rt|calc|${key}`, live: true, onCommit: v => { c[key] = v || 0; rerender(); } });
    const sbT = m.server ? m.server.tiers : [], gbT = m.guild ? m.guild.tiers : [];
    const maxReb = m.rebirth ? m.rebirth.max : 0;
    el.appendChild(h('div.nn-form',
      h('div.nn-row', fieldLabel('Monster', true), h('div', { style: 'flex:1' }, FRE.ui.combo({ options: monOpts, value: c.monsterId, placeholder: 'Type a monster…', onPick: v => { c.monsterId = v; rerender(); } }))),
      h('div.nn-row', fieldLabel('Player level', true), n('playerLevel', 1, 300), fieldLabel('Job', false),
        sel('tier', [['normal', 'normal / 1st / 2nd job'], ['master', 'Master (EXP ÷2)'], ['hero', 'Hero / Legend (EXP ÷2)']]),
        maxReb ? fieldLabel('Rebirth', false) : null, maxReb ? sel('rebirth', [...Array(maxReb + 1).keys()].map(i => [i, i ? `rebirth ${i}` : 'none'])) : null),
      h('div.nn-row', fieldLabel('Server Buff', false), sel('serverTier', [[null, 'from players online →']].concat(sbT.map(t => [t.tier.value, `tier ${t.tier.value} (+${t.pct.value}%)`]))),
        c.serverTier === null ? n('online', 0, 100000) : null, c.serverTier === null ? h('span.muted.small', 'players online') : null),
      h('div.nn-row', fieldLabel('Guild Buff', false), sel('guildTier', [[null, 'from guild level + members online →']].concat(gbT.map(t => [t.tier.value, `tier ${t.tier.value}`]))),
        c.guildTier === null ? [n('guildLevel', 0, 1000), h('span.muted.small', 'guild level'), n('guildOnline', 0, 1000), h('span.muted.small', 'members online')] : null),
      h('div.nn-row', fieldLabel('EXP scrolls', false), n('scrollPct', 0, 10000), h('span.muted.small', '% (all active EXP scrolls added)'),
        fieldLabel('Other EXP stat', false), n('gearExp', 0, 10000), h('span.muted.small', '% (gear, buffs)'),
        h('label', h('input', { type: 'checkbox', checked: c.weather, on: { change: e => { c.weather = e.target.checked; rerender(); } } }), ' raining / snowing'))));
    const r = Sim().calc(ws, m, c);
    if (r.failed) el.appendChild(h('div.banner.bad', 'Event.lua would not run as it is now: every Event.lua rate counts as ×1 below.'));
    el.appendChild(h('h3', 'EXP factor'));
    el.appendChild(h('ul.small', r.factor.steps.map(s => h('li', `${s.text} → ${num(s.after)}`))));
    el.appendChild(h('p', 'EXP factor: ', h('b', `×${num(r.factor.factor)}`),
      h('span.muted.small', ` (Server Buff: ${r.serverTier ? `tier ${r.serverTier.tier.value}, +${r.serverTier.pct.value}%` : 'none'}; Guild Buff: ${r.guildTier ? `tier ${r.guildTier.tier.value}${r.guildExp ? `, EXP +${r.guildExp}%` : ', no EXP stat'}` : 'none'})`)));
    if (!r.mover) { el.appendChild(h('p.muted', 'Pick a monster.')); return; }
    el.appendChild(h('h3', `One kill of ${r.mover.name || r.mover.define} (lv ${r.mover.level})`));
    el.appendChild(h('ul.small', r.kill.steps.map(s => h('li', s))));
    el.appendChild(h('p', 'EXP per kill: ', h('b', fmt(r.kill.exp)), r.kill.capped ? h('span.muted.small', ' (the level\'s cap from expTable.inc was reached before the factor)') : null));
    if (r.penya) el.appendChild(h('p', 'Penya per kill: ', h('b', `${fmt(r.penya.min)} - ${fmt(r.penya.max)}`), h('span.muted.small', ` (${r.penya.from}, × ${num(m.events.active.gold)} Event.lua, level gap counted)`)));
    else if (ws.models.drops) el.appendChild(h('p.muted', 'This monster gives no Penya (no DropGold line).'));
    if (r.items) {
      const g = r.gate;
      el.appendChild(h('p.small', `Drop roll gate: a kill can drop items when a roll of 0-99 is below ${g.base} × ${num(m.events.active.item)} = ${num(g.rate)}: `,
        h('b', g.rate >= 100 ? 'every kill' : `${num(Math.max(0, Math.min(100, Math.ceil(g.rate))))}% of kills`), `. Item chance ×${num(m.events.active.piece)} on every line:`));
      const tb = h('table.items.rt', h('tr', h('th', 'Item'), h('th', 'Per kill')));
      for (const l of r.items.lines) {
        if (l.entry.kind !== 'item') continue;
        const it = ws.itemById(l.entry.itemId);
        tb.appendChild(h('tr', FRE.ui.itemCell(it ? ws.itemInfo(it) : null, l.entry.define), h('td', FRE.drops.pct(l.perKill))));
      }
      el.appendChild(tb);
    }
  }

  FRE.ui.modules.push(mod);
  FRE.ui.rates = { tierForm };
})(globalThis.FRE = globalThis.FRE || {});
