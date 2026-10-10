// Weapon Effects (task G part 2): each weapon's own 6 stat slots (Spec_Item.txt), what players see in its tooltip at each Weapon
// Rarity tier, 🧍 Try it (right / left hand, rarity: loaders/weapons-sim.js), and a family table (one tier family across every
// class, every cell editable: the way WEAPON_TIER_UPDATE_APPLIED.md was written). Edits: edit/weapons-ops.js.
// The user, 2026-10-10: "why the resource editor only has for set nothing for weapon".
(function (FRE) {
  'use strict';
  const { h, numInput, keepFocus } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const SPEC = 'spec_item.txt';
  const st = { sel: null, show: 'stats', type: '', rarity: 0, hand: 'right', twin: false };   // twin: off by default (the Ultimate rows are deliberately a bit stronger)
  const Sim = () => FRE.weaponsSim, O = () => FRE.weaponsOps;
  const model = ctx => ctx.ws.models.weapons;
  const can = ctx => ctx.ws.isEditable(SPEC);
  const wDiags = (ctx, w) => ctx.ws.diags.filter(d => d.module === 'weapons' && d.start === w.item.start);
  const keyOf = id => `weapons|${id}`;
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const famLabel = k => { const f = FRE.weapons.FAMILY[k]; return f ? `${f.name}${f.tier ? ` (${f.track} T${f.tier})` : ''}` : k; };
  const FAM_ORDER = ['LUZA', 'LEAGENDG', 'LUZAM', 'ANGEL', 'VEMPIRE', 'BLOODY'];

  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws), opts = [{ v: 0, label: '(empty slot)', find: 'empty none' }];
    for (const [v, w] of [...words].sort((a, b) => (a[1].word || a[1].define).localeCompare(b[1].word || b[1].define)))
      opts.push({ v, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}` });
    return { opts, words };
  }
  const dstLabel = (words, v) => { const w = words.get(v); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${v}`; };
  const valText = (ctx, words, d, a) => {
    const w = words.get(d), aspd = d === ctx.ws.defines.defines.get('DST_ATTACKSPEED');
    return aspd ? `${a >= 0 ? '+' : ''}${a / 20}% (raw ${a})` : `${a >= 0 ? '+' : ''}${a}${w && w.rate ? '%' : ''}`;
  };

  const SHOW = [
    { v: 'stats', label: 'Weapons with own stats', test: w => w.slots.some(s => s.on) },
    { v: 'all', label: 'All weapons', test: () => true },
    { v: 'tiers', label: 'Tier families (Lusaka … Bloody)', test: w => w.familyInfo && w.familyInfo.tier > 0 },
    { v: 'problems', label: 'With problems', test: (w, ctx) => wDiags(ctx, w).some(d => d.severity !== 'INFO') },
    { v: 'edited', label: 'Edited', test: (w, ctx) => ctx.edited.has(keyOf(w.id)) },
  ];

  const mod = {
    id: 'weapons', label: 'Weapon Effects', searchPlaceholder: 'Search weapons', noItems: true,
    help: "Weapon Effects: each weapon's own bonus stats (Spec_Item.txt), with the Weapon Rarity bonus and a family table",
    st,
    onLoad() { st.sel = null; st.show = 'stats'; st.type = ''; st.rarity = 0; st.hand = 'right'; st.twin = false; },

    listExtra(ctx) {
      const m = model(ctx), types = [...new Set(m.weapons.map(w => w.type))].sort();
      return h('div.bx-filters',
        h('select.npc-filter', { title: 'Which weapons', on: { change: e => { st.show = e.target.value; ctx.renderList(); } } },
          SHOW.map(o => h('option', { value: o.v, selected: o.v === st.show }, `${o.label} (${m.weapons.filter(w => o.test(w, ctx)).length})`))),
        h('select.npc-filter', { title: 'Weapon type', on: { change: e => { st.type = e.target.value; ctx.renderList(); } } },
          [h('option', { value: '' }, 'Every type'), ...types.map(t => h('option', { value: t, selected: t === st.type }, t))]));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), test = SHOW.find(o => o.v === st.show).test;
      // the family tables first
      for (const k of FAM_ORDER) {
        if (!m.families.has(k) || (q && !famLabel(k).toLowerCase().includes(q))) continue;
        const sel = st.sel === 'fam:' + k;
        el.appendChild(h('div.npc' + (sel ? '.sel' : ''), { on: { click: () => { st.sel = 'fam:' + k; ctx.renderAll(false); } } },
          h('div.n', h('span', `▦ ${famLabel(k)}`)), h('div.k', `family table · ${m.families.get(k).length} weapons`)));
      }
      let shown = 0;
      for (const w of m.weapons) {
        if (!test(w, ctx) || (st.type && w.type !== st.type)) continue;
        if (q && !w.name.toLowerCase().includes(q) && !w.define.toLowerCase().includes(q)) continue;
        if (++shown > 600) continue;
        const ds = wDiags(ctx, w), nw = ds.filter(d => d.severity === 'WARN').length, nb = ds.filter(d => d.severity === 'BLOCK').length;
        el.appendChild(h('div.npc.bx-row' + (st.sel === w.id ? '.sel' : ''), { on: { click: () => { st.sel = w.id; ctx.renderAll(false); } } },
          FRE.dds.picture(ctx, iconOf(w.item), { cls: '.bx-icon' }),
          h('div.bx-text', h('div.n', h('span', w.name), h('span', ctx.edited.has(keyOf(w.id)) ? h('span.tag.edit', 'edited') : null,
            nb ? h('span.tag.bad', '⛔' + nb) : nw ? h('span.tag.warn', '⚠' + nw) : null)),
          h('div.k', `${w.type}${w.level > 0 && w.level < 1000 ? ` · Lv ${w.level}` : ''}${w.job ? ` · ${FRE.ui.pretty(w.job)}` : ''} · ${w.slots.filter(s => s.on).length} stats`))));
      }
      if (shown > 600) el.appendChild(h('div.pad.muted', `${shown - 600} more: search to narrow the list.`));
      if (!shown) el.appendChild(h('div.pad.muted', 'No weapons match.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        if (typeof st.sel === 'string' && st.sel.startsWith('fam:')) return familyView(el, ctx, st.sel.slice(4));
        const w = st.sel === null ? null : model(ctx).byId.get(st.sel);
        if (!w) { el.appendChild(h('p.empty-state', 'Select a weapon on the left, or a ▦ family table.')); return; }
        weaponView(el, ctx, w);
      });
    },

    addTarget() { return { ok: false, title: 'Items are not added in this task' }; },
    locate(d, ctx) {
      if (d.module !== 'weapons') return false;
      const w = model(ctx).weapons.find(x => x.item.start === d.start);
      if (w) st.sel = w.id;
      return true;
    },
  };

  // one slot edit; with the twin box ticked the Ultimate twin (or its base) gets the same change in the same undo step
  function editSlot(ctx, w, i, v, label, mergeKey) {
    const m = model(ctx), other = st.twin ? (w.twin || (w.twinOf ? m.byDefine.get(w.twinOf) : null)) : null;
    const D = ctx.ws.defines.defines;
    ctx.editGroup(() => [{ file: SPEC, splices: O().setSlotBoth(ctx.ws.files.get(SPEC).text, [w, other], i, v, D) }],
      other ? `${label} (and ${other.name})` : label, [keyOf(w.id), ...(other ? [keyOf(other.id)] : [])], mergeKey);
  }

  function weaponView(el, ctx, w) {
    const m = model(ctx), edit_ = can(ctx), { opts, words } = dstOptions(ctx), D = ctx.ws.defines.defines;
    const f = ctx.ws.files.get(SPEC);
    el.appendChild(h('div.npc-title', FRE.dds.picture(ctx, iconOf(w.item), { cls: '.bx-icon' }), h('h2', w.name), h('span.def', `${w.define} · ${w.id}`),
      edit_ ? null : h('span.tag.bad', 'read-only'), h('span.line', `Spec_Item.txt L${f.lineOf(w.item.start) + 1}`)));
    el.appendChild(h('p.muted.small', `${w.type}${w.level > 0 && w.level < 1000 ? ` · Lv ${w.level}` : ''}${w.job ? ` · ${FRE.ui.pretty(w.job)}` : ''}${w.familyInfo ? ` · ${famLabel(w.family)}` : ''}. `,
      'A weapon gives its stats only in the right hand (a weapon in the left hand gives none). A Weapon Rarity tier adds its % bonus to every % stat and its flat bonus to the others, slot by slot. After saving: Stop / Start Server.bat.'));
    const other = w.twin || (w.twinOf ? m.byDefine.get(w.twinOf) : null);
    if (other) el.appendChild(h('div.dr-line', h('label', h('input', { type: 'checkbox', checked: st.twin, on: { change: e => { st.twin = e.target.checked; } } }),
      ` Edit ${w.twin ? 'its Ultimate twin' : 'its base weapon'} too: ${other.name}`), h('span.muted.small', ` (now: ${other.slots.filter(s => s.on).map(s => `${dstLabel(words, s.dst)} ${valText(ctx, words, s.dst, s.adj)}`).join(', ') || 'no stats'})`)));
    el.appendChild(h('h3', 'Stats (6 slots)'));
    const tb = h('table.items.rt', h('tr', h('th', 'Slot'), h('th', 'Stat'), h('th', 'Amount'), h('th', 'Players get'), h('th', '')));
    for (const s of w.slots) {
      const label = `${w.name}: slot ${s.i}`;
      tb.appendChild(h('tr', h('td', h('b', String(s.i))),
        h('td', edit_ ? FRE.ui.combo({ options: opts, value: s.on ? s.dst : 0, placeholder: 'Pick a stat', wordStart: true,
          onPick: v => { if (v === (s.on ? s.dst : 0)) return; editSlot(ctx, w, s.i, v ? { dst: v, dstName: ctx.ws.defines.byValue('DST_', v), adj: s.on ? s.adj : 1 } : null,
            v ? `${label} ${dstLabel(words, v)}${s.on ? ` (was ${dstLabel(words, s.dst)})` : ''}` : `${label} emptied (was ${dstLabel(words, s.dst)})`); } }) : (s.on ? dstLabel(words, s.dst) : '—')),
        h('td', s.on ? numInput({ value: s.adj, min: -2147483647, max: 2147483647, disabled: !edit_, key: `we|${w.id}|${s.i}`,
          onCommit: v => { if (v === null || v === s.adj) return; editSlot(ctx, w, s.i, { dst: s.dst, dstName: ctx.ws.defines.byValue('DST_', s.dst), adj: v }, `${label} ${dstLabel(words, s.dst)} ${v} (was ${s.adj})`, `we|${w.id}|${s.i}`); } }) : ''),
        h('td', s.on ? valText(ctx, words, s.dst, s.adj) : h('span.muted', 'empty')),
        h('td', edit_ && s.on ? h('button.icon.danger', { title: 'Empty this slot', on: { click: () => editSlot(ctx, w, s.i, null, `${label} emptied (was ${dstLabel(words, s.dst)})`) } }, '✕') : null)));
    }
    el.appendChild(tb);

    // what players see, at a rarity tier
    const env = Sim().envFor(ctx.ws), tiers = m.rarity ? [...m.rarity.tiers.values()].sort((a, b) => a.level - b.level) : [];
    el.appendChild(h('h3', 'What players see (the weapon tooltip) and 🧍 Try it'));
    el.appendChild(h('div.dr-line', h('span', 'Weapon Rarity:'), h('select', { on: { change: e => { st.rarity = Number(e.target.value); ctx.renderAll(false); } } },
      [h('option', { value: 0 }, 'none'), ...tiers.map(t => h('option', { value: t.level, selected: t.level === st.rarity }, `${t.name} (+${t.pct}% / +${t.flat})`))]),
      h('span', 'Held in:'), h('select', { on: { change: e => { st.hand = e.target.value; ctx.renderAll(false); } } },
        [['right', 'right hand (main)'], ['left', 'left hand (dual wield)']].map(([v, l]) => h('option', { value: v, selected: v === st.hand }, l)))));
    const box = h('div.bx-tt.se-tt');
    box.appendChild(h('div', { style: 'color:#62cbe9' }, w.name));
    for (const l of Sim().tooltip(env, w, st.rarity)) box.appendChild(h('div', { style: 'color:#ffeaa1' }, l.text));
    el.appendChild(box);
    const ch = Sim().run(env, [['on', st.hand, { id: w.id, rarity: st.rarity, expired: false }]]);
    const res = h('table.items.rt', h('tr', h('th', 'Stat'), h('th', 'The character gets')));
    for (const [d, a] of Sim().statList(ch)) res.appendChild(h('tr', h('td', dstLabel(words, d)), h('td', valText(ctx, words, d, a))));
    if (!ch.stats.size) res.appendChild(h('tr', h('td', { colspan: 2 }, h('span.muted', st.hand === 'left' ? 'Nothing: a weapon in the left hand gives no stats.' : 'Nothing.'))));
    el.appendChild(res);
    if (st.rarity && w.slots.some(s => s.on && s.dst === D.get('DST_ATTACKSPEED'))) {
      const t = m.rarity.tiers.get(st.rarity);
      if (t) el.appendChild(h('p.small.warn-text', `⚠ The Attack Speed slot is in raw units: the tooltip says (+${t.pct}%), but the rarity adds only +${t.pct / 20}%.`));
    }
    const ds = wDiags(ctx, w);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // ▦ one family across every class: rows = weapons, columns = every stat the family uses
  function familyView(el, ctx, k) {
    const m = model(ctx);
    const baseName = w => (w.twinOf && m.byDefine.get(w.twinOf) ? m.byDefine.get(w.twinOf).name : w.name);     // a twin sorts right under its base
    const list = (m.families.get(k) || []).slice().sort((a, b) => a.type.localeCompare(b.type) || baseName(a).localeCompare(baseName(b)) || (a.twinOf ? 1 : 0) - (b.twinOf ? 1 : 0));
    const { words } = dstOptions(ctx), edit_ = can(ctx);
    el.appendChild(h('div.npc-title', h('h2', `▦ ${famLabel(k)}`), h('span.def', `${list.length} weapons`)));
    el.appendChild(h('p.muted.small', 'Every cell is one stat of one weapon: type a number to change it (one undo step per cell). A "–" cell is a stat this weapon does not have: add it on the weapon\'s own page. Ultimate (@) rows are listed under their base weapon.'));
    const cols = [];
    for (const w of list) for (const s of w.slots) if (s.on && !cols.includes(s.dst)) cols.push(s.dst);
    const tb = h('table.items.rt', h('tr', h('th', 'Weapon'), h('th', 'Lv'), ...cols.map(d => h('th', dstLabel(words, d)))));
    for (const w of list) {
      tb.appendChild(h('tr', h('td', h('a', { href: '#', on: { click: e => { e.preventDefault(); st.sel = w.id; ctx.renderAll(false); } } }, w.name), h('span.def.block', w.type)),
        h('td', w.level > 0 && w.level < 1000 ? String(w.level) : ''),
        ...cols.map(d => {
          const s = w.slots.find(x => x.on && x.dst === d);
          if (!s) return h('td.muted', '–');
          return h('td', numInput({ value: s.adj, min: -2147483647, max: 2147483647, disabled: !edit_, key: `wf|${w.id}|${s.i}`,
            onCommit: v => { if (v === null || v === s.adj) return;
              ctx.editGroup(() => [{ file: SPEC, splices: O().setSlot(ctx.ws.files.get(SPEC).text, w, s.i, { dst: d, dstName: ctx.ws.defines.byValue('DST_', d), adj: v }, ctx.ws.defines.defines) }],
                `${w.name}: ${dstLabel(words, d)} ${v} (was ${s.adj})`, [keyOf(w.id)], `wf|${w.id}|${s.i}`); } }), diagTags([]));
        })));
    }
    el.appendChild(tb);
  }

  FRE.ui.modules.push(mod);
  FRE.ui.weapons = { weaponView, familyView };
})(globalThis.FRE = globalThis.FRE || {});
