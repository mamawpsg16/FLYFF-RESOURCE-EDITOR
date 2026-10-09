// Rates & Buffs (task I): the server rates in Event.lua, the Server Buff (ServerBuff.txt), the Guild Buff (GuildBuff.txt)
// and a calculator that shows what one kill gives (loaders/rates-sim.js); part 2: the level-up gifts (Event.lua SetLevelUpGift)
// and the rebirth tiers (1Rebirth.inc). Edits: edit/rates-ops.js. Plain words (the user, 2026-10-07); both drop numbers explained
// (the user, 2026-10-09). Part 2 decisions (the user, 2026-10-09): gifts of running events only are edited, new gifts are for
// everyone ("all"), rebirth tiers 0-Max only (Max is not changed here).
(function (FRE) {
  'use strict';
  const { h, fmt, modal, numInput, toast, keepFocus, liveCommit } = FRE.dom;
  const { diagTags, fieldLabel, formFooter, diagRow, pencil } = FRE.ui;
  const EV = 'event.lua', SB = 'serverbuff.txt', GB = 'guildbuff.txt', RB = '1rebirth.inc';
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
    { id: 'levelup', label: 'Level-up gifts', sub: ctx => { const n = model(ctx).events.events.filter(e => e.on).reduce((a, e) => a + e.gifts.length, 0); return `${n} gift${n === 1 ? '' : 's'} in running events`; } },
    { id: 'rebirth', label: 'Rebirth', sub: ctx => { const r = model(ctx).rebirth; return r ? `${r.max} tiers: bonus points, EXP ×, ${r.gifts.size} gift${r.gifts.size === 1 ? '' : 's'}` : '1Rebirth.inc not found'; } },
    { id: 'calc', label: '🧮 Rate calculator', sub: () => 'What one kill gives a player' },
  ];
  const fileOfSection = { rates: EV, server: SB, guild: GB, levelup: EV, rebirth: RB };
  const isGiftCode = d => /^RT_GIFT_/.test(d.code);
  // the problems a section shows: Event.lua's are split between Server rates and Level-up gifts
  const sectionDiags = (ctx, id) => {
    const f = fileOfSection[id];
    if (!f) return [];
    return rDiags(ctx).filter(d => d.file.toLowerCase() === f && (id === 'levelup' ? isGiftCode(d) : id === 'rates' ? !isGiftCode(d) : true));
  };

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
        const ds = sectionDiags(ctx, s.id);
        const b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === s.id ? '.sel' : ''), { 'data-sec': s.id, on: { click: () => { st.sel = s.id; ctx.renderAll(false); } } },
          h('div.n', h('span', s.label), h('span', [...ctx.edited].some(k => k.startsWith(`rates|${s.id}|`)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', s.sub(ctx))));
      }
      el.appendChild(h('div.pad.muted.small', 'Later in this task: the couple buff.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        if (st.sel === 'server') serverView(el, ctx);
        else if (st.sel === 'guild') guildView(el, ctx);
        else if (st.sel === 'calc') calcView(el, ctx);
        else if (st.sel === 'levelup') levelupView(el, ctx);
        else if (st.sel === 'rebirth') rebirthView(el, ctx);
        else ratesView(el, ctx);
      });
    },

    addTarget() { return { ok: false, title: 'Items are not added in this task' }; },

    locate(d) {
      if (d.module !== 'rates') return false;
      const f = String(d.file).toLowerCase();
      st.sel = f === SB ? 'server' : f === GB ? 'guild' : f === RB ? 'rebirth' : isGiftCode(d) ? 'levelup' : 'rates';
      return true;
    },
  };

  function problems(el, ctx, file, sec) {
    const ds = sec ? sectionDiags(ctx, sec) : rDiags(ctx).filter(d => d.file.toLowerCase() === file);
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
    problems(el, ctx, EV, 'rates');
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
    } else card.appendChild(h('p.muted.small', e.gifts.length
      ? ['This event sets no rate. Its ', e.gifts.length, ' level-up gift', e.gifts.length === 1 ? '' : 's', ' are under ', h('a', { href: '#', on: { click: ev_ => { ev_.preventDefault(); st.sel = 'levelup'; ctx.renderAll(false); } } }, 'Level-up gifts'), '.']
      : 'This event sets no rate.'));
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
    el.appendChild(h('p.muted.small', sb.slots
      ? `Each tier also gives up to ${sb.slots} stats to every online player (buff-stats.diff, V19 43d0b76c, not yet tested in game): pick a stat to add it, pick "(none)" to remove it. The buff-bar tooltip lists them.`
      : 'This file has no stat slots: the server it was written for gives EXP only. Stats per tier come with buff-stats.diff (V19 43d0b76c).'));
    const { opts, words } = dstOptions(ctx);
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
      if (sb.slots) tb.appendChild(h('tr', h('td'), h('td', { colSpan: 5 }, statSlots(ctx, SB, t, i, `Server Buff tier ${t.tier.value}`, key, 'sb', opts, words, edit_))));
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

  // the stat slots of one tier (both files): pick a stat to add it, "(none)" to remove it (amount 0)
  function statSlots(ctx, file, t, i, what, key, tag, opts, words, edit_) {
    const stats = h('table.items.rt', h('tr', h('th', `Stat (${t.bonus.length} slots)`), h('th', 'Amount'), h('th', '')));
    t.bonus.forEach((b, j) => {
      const cur = b.dst.ok ? b.dst.value : 0;
      stats.appendChild(h('tr',
        h('td', edit_ ? FRE.ui.combo({ options: opts, value: cur, placeholder: 'Pick a stat', wordStart: true,
          onPick: v => ctx.edit(file, () => O().setBonus(b, v, v ? (b.adj.value || 1) : 0), v ? `${what}: stat ${j + 1} ${dstLabel(words, v)} (was ${dstLabel(words, cur)})` : `${what}: removed stat ${j + 1} (${dstLabel(words, cur)})`, key) }) : dstLabel(words, cur)),
        h('td', numInput({ value: b.adj.value, min: -2147483647, max: 2147483647, disabled: !edit_ || !cur, key: `rt|${tag}|${i}|adj${j}`,
          onCommit: v => { if (v === null) return; typed(ctx, file, `${tag}|${i}|adj${j}`, () => O().setNumber(b.adj, v, -2147483647, 2147483647, 'amount'), `${what}: ${dstLabel(words, cur)} ${v} (was ${b.adj.value})`, key); } }),
          words.get(cur) && words.get(cur).rate ? ' %' : ''),
        h('td', diagTags(spanDiags(ctx, file, b.dst.start, b.adj.end)))));
    });
    return stats;
  }

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
      card.appendChild(statSlots(ctx, GB, t, i, what, key, 'gb', opts, words, edit_));
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
        bonus: last ? last.bonus.map(x => ({ dst: x.dst.ok ? x.dst.value : 0, adj: x.adj.value })) : Array.from({ length: b.slots }, () => ({ dst: 0, adj: 0 })),
        name: last ? last.name.text.replace(/\d+\s*$/, m => String(Number(m) + 1)) : 'Guild Buff Lv.1', desc: '', icon: last ? last.icon.text : '', descAuto: true }
      : { tier: last ? last.tier.value + 1 : 1, online: last ? last.online.value + 10 : 10, pct: last ? last.pct.value + 5 : 5,
        bonus: last ? last.bonus.map(x => ({ dst: x.dst.ok ? x.dst.value : 0, adj: x.adj.value })) : Array.from({ length: b.slots }, () => ({ dst: 0, adj: 0 })),
        name: last ? last.name.text : 'Server Buff', icon: last ? last.icon.text : '' };
    const { words, opts } = dstOptions(ctx);
    const checks = h('div'), preview = h('div'), body = h('div.nn-form');
    let btn = null;
    const plan = () => O().addTier(ws.files.get(file).text, b, s, guild);
    function refresh() {
      if (guild && s.descAuto) s.desc = O().describe(s.bonus, words);
      checks.textContent = ''; preview.textContent = '';
      const probs = [];
      try { O().checkTier(s, guild, b.slots); } catch (e) { probs.push(['BLOCK', e.message]); }
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
        : `With ${s.online}+ players online, every kill gets +${s.pct}% EXP (added to the EXP factor)${s.bonus.some(x => x.dst) ? `, and every online player gets ${O().describe(s.bonus, words)}` : ''}.`));
    }
    const row = (label, req, ...x) => h('div.nn-row', fieldLabel(label, req), ...x);
    const n = (field, min, max) => numInput({ value: s[field], min, max, key: `rt|add|${field}`, live: true, onCommit: v => { s[field] = v === null ? NaN : v; refresh(); } });
    body.appendChild(row('Tier number', true, n('tier', 1, 2147483647)));
    if (guild) { body.appendChild(row('Guild level (at least)', true, n('glv', 0, 1000))); body.appendChild(row('Members online (at least)', true, n('online', 0, 100000))); }
    else { body.appendChild(row('Players online (at least)', true, n('online', 0, 100000))); body.appendChild(row('EXP +%', true, n('pct', 0, 100000))); }
    s.bonus.forEach((x, j) => body.appendChild(row(`Stat ${j + 1}`, false,
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
      h('span.muted.small', ` (Server Buff: ${r.serverTier ? `tier ${r.serverTier.tier.value}, +${r.serverTier.pct.value}%${r.serverExp ? `, EXP stat +${r.serverExp}%` : ''}` : 'none'}; Guild Buff: ${r.guildTier ? `tier ${r.guildTier.tier.value}${r.guildExp ? `, EXP +${r.guildExp}%` : ', no EXP stat'}` : 'none'})`)));
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

  // ------------------------------------------------------------- Level-up gifts (Event.lua SetLevelUpGift)
  const itemOptsOf = ws => (ws._itemOpts = ws._itemOpts || [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, z) => a.name.localeCompare(z.name))
    .map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define })));
  const itemOfDefine = (ws, d) => { const D = ws.defines.defines; return d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; };
  const nameOfDefine = (ws, d) => { const it = itemOfDefine(ws, d); return it ? ws.itemInfo(it).name : d; };
  const tipBox = (ws, it) => it ? h('div.bx-tt', FRE.ui.tooltip.body(ws, it)) : null;
  const durText = m => (!m ? 'permanent' : FRE.dom.durationText(m));
  // How often a gift at each level pays one character (gifts-sim: a character's life, as for the real rows): a made-up gift at
  // every level 1-300 of a running event, worked out once per load. -> Map level -> { first, perRebirth }
  function levelPaysTable(ctx) {
    const ws = ctx.ws;
    if (ws._rtLevelPays) return ws._rtLevelPays;      // only the job levels, expTable.inc and Max decide it: none is edited here
    const env = FRE.giftsSim.envFor(ws);
    const any = [...ws.items.items.keys()][0];
    const ev = { name: '(every level)', times: [], on: true };
    const gifts = [];
    for (let lv = 1; lv <= 300; lv++) gifts.push({ event: ev, level: lv, account: 'all', define: '', id: any, num: 1, flag: 0, minutes: 0 });
    const fake = Object.assign({}, env, { gifts: Object.assign({}, env.gifts, { levelUp: { events: [ev], gifts } }) });
    const map = new Map();
    for (const [g, p] of FRE.giftsSim.levelPays(fake)) map.set(g.level, p);
    ws._rtLevelPays = map;
    return map;
  }
  const paysText = p => !p ? '?' : (p.first === 0 && p.perRebirth === 0) ? 'never'
    : `${p.first === 1 ? 'once' : p.first + ' times'}${p.perRebirth ? `, +${p.perRebirth} per rebirth` : ''}`;

  function levelupView(el, ctx) {
    const ws = ctx.ws, ev = model(ctx).events, f = ws.files.get(EV), edit_ = can(ctx, EV);
    el.appendChild(h('div.npc-title', h('h2', 'Level-up gifts'), h('span.def', 'Event.lua'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (ev.failed) el.appendChild(h('div.banner.bad', 'Event.lua would not run as it is now: nobody gets a level-up gift until the problem under Server rates is fixed.'));
    el.appendChild(h('p.muted.small', 'When a character gains a level with EXP, it gets every gift of that level in the events running now (SetLevelUpGift). ',
      'A full bag: the gift comes by mail. Levels set by a job change (121 Hero, 131 Legend) give nothing, and levels 61-120 pay twice (as Pro and again as Master) and once more after every rebirth.'));
    const pays = levelPaysTable(ctx);
    const running = ev.events.filter(e => e.on), other = ev.events.filter(e => !e.on && e.gifts.length);
    const giftTable = (e, live) => {
      const tb = h('table.items.rt', h('tr', h('th', 'Level'), h('th', 'Item'), h('th.num', 'Count'), h('th', 'Bound'), h('th', 'Time limit'), h('th', 'Who'), h('th', 'Pays one character'), h('th', '')));
      const rows = e.gifts.slice().sort((a, b) => a.level - b.level || a.idx - b.idx);
      for (const g of rows) {
        const it = itemOfDefine(ws, g.define), key = keyOf('levelup', `${e.idx}|${g.idx}`);
        const who = g.account === 'all' ? 'everyone' : [h('span', { title: 'string.find( account, text ): Lua patterns, e.g. "__bu" = accounts with __bu in the name' }, `accounts containing "${g.account}"`),
          live && edit_ ? h('button.small', { on: { click: () => ctx.edit(EV, txt => O().setGiftAll(txt, g), `Level ${g.level} gift ${nameOfDefine(ws, g.define)}: given to everyone (was accounts containing "${g.account}")`, key) } }, 'Give to everyone') : null];
        const p = g.account === 'all' && live ? pays.get(g.level) : null;
        tb.appendChild(h('tr' + (live ? '' : '.muted'),
          h('td', h('b', String(g.level))), FRE.ui.itemCell(it ? ws.itemInfo(it) : null, g.define), h('td.num', fmt(g.num)),
          h('td', g.flag === 2 ? 'bound' : g.flag ? `flag ${g.flag}` : 'no'), h('td', durText(g.minutes)), h('td.small', who),
          h('td.small', p ? (p.first === 0 && p.perRebirth === 0 ? h('span.tag.warn', '⚠ never') : paysText(p)) : live ? '' : 'not running'),
          h('td', live && edit_ ? [h('button.icon', { title: 'Edit this gift', on: { click: () => giftForm(ctx, e, g) } }, pencil()), ' ',
            h('button.icon.danger', { title: 'Remove this gift', on: { click: () => ctx.edit(EV, txt => O().removeGift(txt, g), `Level-up gifts: removed level ${g.level} ${nameOfDefine(ws, g.define)} ×${g.num}`, key) } }, '✕')] : null,
            ' ', diagTags(spanDiags(ctx, EV, g.stmt.start, g.stmt.end)), h('span.line', `L${f.lineOf(g.stmt.start) + 1}`))));
      }
      return tb;
    };
    for (const e of running.filter(x => x.gifts.length)) {
      el.appendChild(h('div.rt-card', h('div.dr-line', h('h3', { style: 'margin:0' }, e.name || '(no name)'), h('span.tag.ok', 'running now')), giftTable(e, true)));
    }
    if (!running.some(x => x.gifts.length)) el.appendChild(h('p.empty-state', 'No running event gives level-up gifts.'));
    el.appendChild(h('div.dr-line', h('button.primary', { disabled: !edit_ || !running.length || ev.failed, title: running.length ? '' : 'No event is running now: add the gift to an event first',
      on: { click: () => giftForm(ctx, null, null) } }, '+ Add a gift')));
    for (const e of other) {
      el.appendChild(h('div.rt-card.muted', h('div.dr-line', h('h3', { style: 'margin:0' }, e.name || '(no name)'), h('span.tag.info', 'not running now: nobody gets these')),
        h('p.muted.small', 'Read-only here. Change the event\'s dates under Server rates to make it run.'), giftTable(e, false)));
    }
    problems(el, ctx, EV, 'levelup');
  }

  // + Add a gift / ✎ Edit level-up gift
  function giftForm(ctx, e0, g) {
    const ws = ctx.ws, ev = model(ctx).events, running = ev.events.filter(e => e.on);
    const s = g ? { ev: e0.idx, level: g.level, define: g.define, num: g.num, bound: g.flag === 2, minutes: g.minutes }
      : { ev: (running.find(e => e.gifts.length) || running[0]).idx, level: null, define: null, num: 1, bound: true, minutes: null };
    const body = h('div.nn-form'), checks = h('div'), preview = h('div'), tip = h('div');
    let btn = null;
    const evOf = () => model(ctx).events.events[s.ev];
    const changes = () => {
      const c = {};
      if (s.level !== g.level) c.level = s.level;
      if (s.define !== g.define) c.define = s.define;
      if (s.num !== g.num) c.num = s.num;
      if (s.bound !== (g.flag === 2)) c.flag = s.bound ? 2 : 0;
      if (s.minutes !== g.minutes) c.minutes = s.minutes;
      return c;
    };
    const row_ = () => ({ level: s.level, define: s.define, num: s.num, flag: s.bound ? 2 : (g && g.flag !== 2 ? g.flag : 0), minutes: s.minutes });
    const plan = () => g ? O().setGift(ws.files.get(EV).text, g, changes()) : O().addGift(ws.files.get(EV).text, evOf(), row_());
    function refresh() {
      checks.textContent = ''; preview.textContent = ''; tip.textContent = '';
      const probs = [], it = itemOfDefine(ws, s.define);
      if (it) tip.appendChild(tipBox(ws, it));
      if (!s.level) probs.push(['BLOCK', 'Still needs: the level']);
      if (!s.define) probs.push(['BLOCK', 'Still needs: the item']);
      else if (!it) probs.push(['BLOCK', `${s.define} is not an item in Spec_Item.txt`]);
      if (!(s.num >= 1)) probs.push(['BLOCK', 'Still needs: the count (1 or more)']);
      if (s.minutes === null) probs.push(['BLOCK', 'Still needs: the time limit (Permanent or 0 = it never expires)']);
      const pm = it ? FRE.specItem.get(it, 'dwPackMax') >>> 0 : 0;
      if (it && pm && s.num > pm) probs.push(['WARN', `One bag slot holds ${fmt(pm)}: the gift takes ${Math.ceil(s.num / pm)} slots (a full bag mails it)`]);
      const p = s.level ? levelPaysTable(ctx).get(s.level) : null;
      if (p && p.first === 0 && p.perRebirth === 0) probs.push(['WARN', `Level ${s.level} is never gained with EXP: nobody gets this gift (${s.level === 121 || s.level === 131 ? 'the job change sets this level' : 'no job levels up there'})`]);
      if (s.level && s.define && evOf().gifts.some(x => x !== g && x.level === s.level && x.define === s.define)) probs.push(['WARN', `Level ${s.level} gives ${nameOfDefine(ws, s.define)} already: both rows pay`]);
      if (g && !Object.keys(changes()).length) probs.push(['BLOCK', 'Nothing changed yet']);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(x => x[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', g ? 'Change something first.' : 'Fill in the level, the item, the count and the time limit.')); return; }
      try {
        const sp = plan(), f = ws.files.get(EV);
        const line = g ? applyPreview(f.text, sp, g.stmt) : sp[0].insert.replace(/\r?\n$/, '').replace(/^\r?\n/, '');
        preview.appendChild(h('pre.preview', `Event.lua, ${evOf().name}, line ${f.lineOf(sp[0].start) + 1}:\n${g ? '' : '+'}${line.trim()}`));
        preview.appendChild(h('p', `Every character that reaches level ${s.level} with EXP gets ${nameOfDefine(ws, s.define)} ×${fmt(s.num)}`,
          s.bound ? ', bound' : '', `, ${durText(s.minutes)}`, p ? ` (${paysText(p)})` : '', '. A full bag: by mail.'));
      } catch (err) { preview.appendChild(h('p.bad', err.message)); if (btn) btn.disabled = true; }
    }
    const row = (label, req, ...x) => h('div.nn-row', fieldLabel(label, req), ...x);
    if (!g && running.length > 1) body.appendChild(row('Event', true, h('select', { on: { change: x => { s.ev = Number(x.target.value); refresh(); } } },
      running.map(e => h('option', { value: e.idx, selected: e.idx === s.ev }, e.name)))));
    body.appendChild(row('Level', true, numInput({ value: s.level, min: 1, max: 1000, key: 'rt|gift|lv', live: true, onCommit: v => { s.level = v; refresh(); } }),
      h('span.muted.small', 'the level the character reaches')));
    body.appendChild(row('Item', true, h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOptsOf(ws), value: s.define, placeholder: 'Type an item name…', onPick: v => { s.define = v; refresh(); } }))));
    body.appendChild(tip);
    body.appendChild(row('Count (how many they get)', true, numInput({ value: s.num, min: 1, max: O().MAX_GIFT_NUM, key: 'rt|gift|n', live: true, onCommit: v => { s.num = v; refresh(); } })));
    body.appendChild(row('Bound', false, h('label', h('input', { type: 'checkbox', checked: s.bound, on: { change: x => { s.bound = x.target.checked; refresh(); } } }), ' the item cannot be traded')));
    body.appendChild(row('Time limit', true, FRE.dom.durationInput({ minutes: s.minutes, key: 'rt|gift|m', permanent: true, max: O().MAX_MINUTES, onCommit: v => { s.minutes = v; refresh(); } })));
    if (g && g.account !== 'all') body.appendChild(h('p.muted.small', `Only accounts containing "${g.account}" get it ("Give to everyone" in the list changes that).`));
    formFooter({ checks, action: g ? 'Apply changes' : 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const label = () => g ? `Level ${g.level} gift ${nameOfDefine(ws, g.define)}: ${describeChanges(ws, g, changes())}` : `Level-up gifts: added level ${s.level} ${nameOfDefine(ws, s.define)} ×${s.num}`;
    const m = modal({ title: g ? `Edit level-up gift: Level ${g.level}` : 'Add a level-up gift', body, wide: true, buttons: [{ label: 'Cancel' },
      { label: g ? 'Apply changes' : 'Add', cls: 'primary', id: 'rt-gift-btn', onClick: () => ctx.edit(EV, () => plan(), label(), keyOf('levelup', g ? `${e0.idx}|${g.idx}` : `${s.ev}|new`)) }] });
    btn = m.el.querySelector('#rt-gift-btn');
    refresh();
  }
  // the edited line as it will read (splices inside one statement)
  function applyPreview(text, sp, stmt) {
    let t = text.slice(stmt.start, stmt.end + 40), base = stmt.start;
    for (const x of sp.slice().sort((a, b) => b.start - a.start)) if (x.start >= base && x.start <= base + t.length) t = t.slice(0, x.start - base) + x.insert + t.slice(x.end - base);
    return t.split(/\r?\n/)[0];
  }
  function describeChanges(ws, g, c) {
    const out = [];
    if (c.level !== undefined) out.push(`level ${c.level}`);
    if (c.define !== undefined) out.push(nameOfDefine(ws, c.define));
    if (c.num !== undefined) out.push(`count ${c.num} (was ${g.num})`);
    if (c.flag !== undefined) out.push(c.flag === 2 ? 'bound' : 'not bound');
    if (c.minutes !== undefined) out.push(`time limit ${durText(c.minutes)} (was ${durText(g.minutes)})`);
    return out.join(', ');
  }

  // ------------------------------------------------------------- Rebirth (1Rebirth.inc)
  function rebirthView(el, ctx) {
    const ws = ctx.ws, rb = model(ctx).rebirth, edit_ = can(ctx, RB);
    el.appendChild(h('div.npc-title', h('h2', 'Rebirth'), h('span.def', '1Rebirth.inc'), edit_ ? null : h('span.tag.bad', 'read-only')));
    if (!rb) { el.appendChild(h('p.empty-state', '1Rebirth.inc is not in Server/Resource.')); return; }
    const f = ws.files.get(RB);
    el.appendChild(h('p.muted.small', `A character at the max level uses Rebirth Stones to reach the next tier: back to Master level 60, plus the tier's bonus points and gift. `,
      `Max: ${rb.max} tiers (not changed here). The stones per tier are in the C++ (User.cpp:4864). `,
      'Bonus points are the TOTAL a character has at that tier (not what the tier adds): a full restat keeps them. EXP × multiplies the EXP of every kill at that tier.'));
    const tb = h('table.items.rt', h('tr', h('th', 'Tier'), h('th.num', 'Stones'), h('th', 'EXP ×'), h('th', 'Bonus points (total)'),
      h('th', { title: 'Read by the loader but never used by the server (fDropRate / fPenyaRate)' }, 'Drop × / Penya ×'), h('th', 'Gift'), h('th', '')));
    for (let t = 0; t <= rb.max; t++) {
      const r = rb.rates[t], key = keyOf('rebirth', t), prev = t > 0 ? rb.rates[t - 1] : null;
      const row = rb.rows.find(x => x.tier === t && x.used) || null;
      const it = row ? ws.itemById(row.id) : null;
      const expCell = !r ? h('span.muted', '×1 (no row)') : t === 0 ? h('span.muted', { title: 'Tier 0 = never reborn: the server never reads this row' }, `×${num(r.exp)} (not used)`)
        : decInput({ value: r.exp, key: `rt|rb|${t}|exp`, disabled: !edit_, title: 'EXP × at this tier (2 decimals)',
          onCommit: v => typed(ctx, RB, `rb|${t}|exp`, () => O().setRebirthExp(r, v), `Rebirth ${t}: EXP ×${num(v)} (was ×${num(r.exp)})`, key) });
      const gpCell = !r ? h('span.muted', '0 (no row)') : t === 0 ? h('span.muted', `${r.gp} (not used)`)
        : [numInput({ value: r.gp, min: 0, max: 1000000, disabled: !edit_, key: `rt|rb|${t}|gp`,
          onCommit: v => { if (v === null) return; typed(ctx, RB, `rb|${t}|gp`, () => O().setRebirthGp(r, v), `Rebirth ${t}: ${v} bonus points (was ${r.gp})`, key); } }),
        prev ? h('span.muted.small', ` ${r.gp - prev.gp >= 0 ? '+' : ''}${r.gp - prev.gp} vs tier ${t - 1}`) : null];
      const giftCell = t === 0 ? h('td.muted', '—') : row
        ? h('td', h('div.dr-line', FRE.ui.itemCell(it ? ws.itemInfo(it) : null, row.itemText), h('span', `×${fmt(row.num)}`),
          edit_ ? h('button.icon', { title: 'Edit this gift', on: { click: () => rebGiftForm(ctx, t, row) } }, pencil()) : null,
          edit_ ? h('button.icon.danger', { title: 'Remove this gift', on: { click: () => ctx.edit(RB, txt => O().removeRebirthGift(txt, row), `Rebirth ${t}: removed the gift ${it ? ws.itemInfo(it).name : row.itemText}`, key) } }, '✕') : null))
        : h('td', edit_ ? h('button.small', { on: { click: () => rebGiftForm(ctx, t, null) } }, '+ Gift') : h('span.muted', 'none'));
      const span = r ? { start: r.start, end: r.end } : null;
      tb.appendChild(h('tr', h('td', h('b', t ? `rebirth ${t}` : 'none (0)')), h('td.num', t ? String(FRE.giftsSim.STONES(t)) : '—'),
        h('td', expCell), h('td', gpCell), h('td.muted.small', r ? `×${num(r.drop)} / ×${num(r.penya)} not used by the server` : '—'), giftCell,
        h('td', span ? diagTags(spanDiags(ctx, RB, span.start, span.end)) : null, row ? diagTags(spanDiags(ctx, RB, row.start, row.end)) : null,
          span ? h('span.line', `L${f.lineOf(span.start) + 1}`) : null)));
    }
    el.appendChild(tb);
    const bad = rb.rows.filter(x => !x.used);
    if (bad.length) el.appendChild(h('p.small.warn-text', `⚠ ${bad.length} gift row(s) the server skips: see the problems below.`));
    problems(el, ctx, RB, 'rebirth');
  }

  // + Gift / ✎ Edit rebirth gift
  function rebGiftForm(ctx, tier, row) {
    const ws = ctx.ws, rb = model(ctx).rebirth;
    const s = { define: row ? row.itemText : null, num: row ? row.num : 1 };
    const body = h('div.nn-form'), checks = h('div'), preview = h('div'), tip = h('div');
    let btn = null;
    const changes = () => { const c = {}; if (s.define !== row.itemText) c.define = s.define; if (s.num !== row.num) c.num = s.num; return c; };
    const plan = () => row ? O().setRebirthGift(rb, row, changes()) : O().addRebirthGift(ws.files.get(RB).text, rb, { tier, define: s.define, num: s.num });
    function refresh() {
      checks.textContent = ''; preview.textContent = ''; tip.textContent = '';
      const probs = [], it = itemOfDefine(ws, s.define);
      if (it) tip.appendChild(tipBox(ws, it));
      if (!s.define) probs.push(['BLOCK', 'Still needs: the item']);
      else if (!it) probs.push(['BLOCK', `${s.define} is not an item in Spec_Item.txt: the server would skip this gift`]);
      if (!(s.num >= 1)) probs.push(['BLOCK', 'Still needs: the count (1 or more)']);
      const pm = it ? FRE.specItem.get(it, 'dwPackMax') >>> 0 : 0;
      if (it && pm && s.num > pm) probs.push(['WARN', `One bag slot holds ${fmt(pm)}: the gift takes ${Math.ceil(s.num / pm)} slots (a full bag mails it)`]);
      if (row && !Object.keys(changes()).length) probs.push(['BLOCK', 'Nothing changed yet']);
      for (const [sev, msg] of probs) checks.appendChild(diagRow({ severity: sev, code: '', message: msg }));
      if (!probs.length) checks.appendChild(h('p.muted.small', 'No problems.'));
      const ok = !probs.some(x => x[0] === 'BLOCK');
      if (btn) btn.disabled = !ok;
      if (!ok) { preview.appendChild(h('p.muted', row ? 'Change something first.' : 'Fill in the item and the count.')); return; }
      try {
        const sp = plan(), f = ws.files.get(RB);
        const line = row ? applyPreview(f.text, sp, row) : sp[0].insert.replace(/\r?\n$/, '');
        preview.appendChild(h('pre.preview', `1Rebirth.inc (+ the Client copy), Gifts, line ${f.lineOf(sp[0].start) + 1}:\n${row ? '' : '+'}${line.trim()}`));
        preview.appendChild(h('p', `Reaching rebirth ${tier} gives ${nameOfDefine(ws, s.define)} ×${fmt(s.num)} (a full bag: by mail). One gift per tier.`));
      } catch (err) { preview.appendChild(h('p.bad', err.message)); if (btn) btn.disabled = true; }
    }
    const r_ = (label, req, ...x) => h('div.nn-row', fieldLabel(label, req), ...x);
    body.appendChild(r_('Item', true, h('div', { style: 'flex:1' }, FRE.ui.combo({ options: itemOptsOf(ws), value: s.define, placeholder: 'Type an item name…', onPick: v => { s.define = v; refresh(); } }))));
    body.appendChild(tip);
    body.appendChild(r_('Count (how many they get)', true, numInput({ value: s.num, min: 1, max: 65535, key: 'rt|rbg|n', live: true, onCommit: v => { s.num = v; refresh(); } })));
    formFooter({ checks, action: row ? 'Apply changes' : 'Add', previewTitle: 'What will be written / what players get', preview }).forEach(x => body.appendChild(x));
    const label = () => row ? `Rebirth ${tier} gift: ${nameOfDefine(ws, s.define)} ×${s.num} (was ${nameOfDefine(ws, row.itemText)} ×${row.num})` : `Rebirth ${tier}: added the gift ${nameOfDefine(ws, s.define)} ×${s.num}`;
    const m = modal({ title: row ? `Edit rebirth gift: Rebirth ${tier}` : `Add a gift: Rebirth ${tier}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: row ? 'Apply changes' : 'Add', cls: 'primary', id: 'rt-rbg-btn', onClick: () => ctx.edit(RB, () => plan(), label(), keyOf('rebirth', tier)) }] });
    btn = m.el.querySelector('#rt-rbg-btn');
    refresh();
  }

  FRE.ui.modules.push(mod);
  FRE.ui.rates = { tierForm, giftForm, rebGiftForm };
})(globalThis.FRE = globalThis.FRE || {});
