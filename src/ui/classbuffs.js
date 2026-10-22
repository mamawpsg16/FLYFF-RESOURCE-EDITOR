// Class Buffs (2a): each class's buffs at their top level (propSkillAdd.csv), their tooltip text (propSkill.txt.txt), and what a
// player of the class gets from them (loaders/classbuffs-sim.js). The user, 2026-10-21: class balance decisions are made here.
// Edits: edit/classbuffs-ops.js. 2b: every level (+ scale every level in step), filters, the Equalized PvP level, attack skills
// (cooldown, damage, PvP power: Asal, Hit of Penya).
(function (FRE) {
  'use strict';
  const { h, numInput, keepFocus } = FRE.dom;
  const { diagRow } = FRE.ui;
  const ADD = 'propskilladd.csv', TXT = 'propskill.txt.txt';
  const NULL_ID = 0xFFFFFFFF;
  const st = { sel: null, cls: '', who: '', stat: 100, gear: 'sword', lvl: new Map(), scale: true };
  const Sim = () => FRE.classBuffsSim, O = () => FRE.classBuffsOps;
  const model = ctx => ctx.ws.models.classbuffs;
  const can = ctx => ctx.ws.isEditable(ADD);
  // badge from dwExeTarget: EXT_ANOTHERWITH = you or 1 player, EXT_TROUPE / EXT_TROUPEWITH = whole party
  const badge = b => b.exe === 'EXT_ANOTHERWITH' ? '1 player' : b.exe === 'EXT_TROUPE' || b.exe === 'EXT_TROUPEWITH' ? 'party' : '';
  const keyOf = si => `classbuffs|${si}`;
  const bDiags = (ctx, b) => ctx.ws.diags.filter(d => d.module === 'classbuffs' && d.start === b.max.start && d.code !== 'CB_SPEED_STACK');
  const secs = ms => { const s = ms / 1000; return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${Number(s.toFixed(1))} s`; };
  // weapon held, for the weapon rules (CBuffSkill::IsInvalid)
  const GEAR = [['sword', 'Sword + shield', { sword: true, shield: true }], ['axe', 'Axe + shield', { axe: true, shield: true }],
    ['two', 'Two-handed weapon', { two: true, sword: true }], ['dual', 'Two weapons (dual wield)', { dual: true, sword: true }],
    ['yoyo', 'Yoyo', { yoyo: true }], ['bow', 'Bow', { bow: true }], ['knuckle', 'Knuckle', { knuckle: true }], ['staff', 'Staff / wand / stick', {}]];

  // stats the game has no tooltip word for (or a misleading one): names for this page only
  const OWN_WORDS = { DST_AUTOHP: 'Auto-heal HP', DST_DEBUFF_ALL_CLEAR: 'Removes debuffs', DST_PVP_DMG_RATE: 'PvP damage taken',
    DST_CHR_CHANCEPOISON: 'Poison chance', DST_CHR_CHANCEBLEEDING: 'Bleeding chance' };
  const OWN_RATE = ['DST_PVP_DMG_RATE', 'DST_CHR_CHANCEPOISON', 'DST_CHR_CHANCEBLEEDING'];
  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws), opts = [], D = ctx.ws.defines.defines;
    for (const [dst, word] of Object.entries(OWN_WORDS)) { const v = D.get(dst); if (v !== undefined) words.set(v, { word, define: dst, rate: OWN_RATE.includes(dst) }); }
    for (const [v, w] of [...words].sort((a, b) => (a[1].word || a[1].define).localeCompare(b[1].word || b[1].define)))
      opts.push({ v, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}` });
    return { opts, words };
  }
  const dstLabel = (words, v) => { const w = words.get(v); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${v}`; };
  const valText = (ctx, words, d, a) => {
    const w = words.get(d), aspd = d === ctx.ws.defines.defines.get('DST_ATTACKSPEED');
    // AttackArbiter.cpp:205: nDamage -= nDamage * DST_PVP_DMG_RATE / 100, so +10 in the file = 10% less PvP damage taken
    // the value of DST_DEBUFF_ALL_CLEAR is not an amount (the buff just clears debuffs)
    if (d === ctx.ws.defines.defines.get('DST_DEBUFF_ALL_CLEAR')) return '';
    if (d === ctx.ws.defines.defines.get('DST_PVP_DMG_RATE')) return `${a >= 0 ? '-' : '+'}${Math.abs(a)}%`;
    return aspd ? `${a >= 0 ? '+' : ''}${a / 20}% (raw ${a})` : `${a >= 0 ? '+' : ''}${a}${w && w.rate ? '%' : ''}`;
  };
  const statsText = (ctx, words, b) => b.slots.filter(s => s.dst !== NULL_ID && s.dst !== 0).map(s => `${dstLabel(words, s.dst)} ${valText(ctx, words, s.dst, s.adj)}`).join(', ') || 'no stat';
  // list filter: who a buff reaches (dwExeTarget), or the attack skills
  const WHO_FILTER = [['', 'Every buff'], ['you', 'Only you'], ['one', 'You or 1 player'], ['party', 'Party buffs'], ['attack', 'Attack skills (cooldown, PvP power)']];
  const whoOk = b => !st.who ? true : st.who === 'you' ? b.exe === 'EXT_SELFCHGPARAMET' : st.who === 'one' ? b.exe === 'EXT_ANOTHERWITH'
    : st.who === 'party' ? b.exe === 'EXT_TROUPE' || b.exe === 'EXT_TROUPEWITH' : false;
  const rowOf = b => { const l = st.lvl.get(b.si); return b.rows.find(r => r.lvl === l) || b.max; };
  const eqText = b => b.eqRow ? `Equalized PvP: level ${b.eqRow.lvl} (the skill's max level)${b.eqRow === b.max ? '' : ', not the top row'}.`
    : `Equalized PvP: level ${b.expertMax}, which has NO row: players there get nothing from it.`;
  const classOf = (m, b) => m.classes.find(c => c.tiers.some(t => t.buffs.includes(b) || t.attacks.includes(b)));

  const mod = {
    id: 'classbuffs', label: 'Class Buffs', searchPlaceholder: 'Search buffs', noItems: true,
    help: "Class Buffs: change what each class's buffs give, how long they last, and their tooltip",
    st,
    onLoad() { st.sel = null; st.cls = ''; st.who = ''; st.lvl.clear(); },

    listExtra(ctx) {
      const m = model(ctx);
      return h('div.bx-filters', h('select.npc-filter', { title: 'Which class', on: { change: e => { st.cls = e.target.value; ctx.renderList(); } } },
        [h('option', { value: '' }, `Every class (${m.buffs.length} buffs)`), ...m.classes.map(c => h('option', { value: c.key, selected: c.key === st.cls }, `${c.name} (${c.second})`))]),
        h('select.npc-filter', { title: 'Who gets it', on: { change: e => { st.who = e.target.value; ctx.renderList(); } } },
          WHO_FILTER.map(([v, l]) => h('option', { value: v, selected: v === st.who }, l))));
    },

    renderList(el, ctx) {
      const m = model(ctx), q = ctx.query.toLowerCase(), { words } = dstOptions(ctx);
      let shown = 0;
      const att = st.who === 'attack';
      for (const c of m.classes) {
        if (st.cls && c.key !== st.cls) continue;
        const fold = FRE.ui.section({ title: `${c.name} (${c.second})`, sub: att ? `${c.tiers.reduce((a, t) => a + t.attacks.length, 0)} attack skills` : `${c.tiers.reduce((a, t) => a + t.buffs.length, 0)} buffs`,
          key: q || st.cls || st.who ? null : `cb-class-${c.key}`, open: !!(q || st.cls || st.who) });
        for (const t of c.tiers) {
          const list = (att ? t.attacks : t.buffs.filter(whoOk)).filter(b => !q || b.name.toLowerCase().includes(q) || b.define.toLowerCase().includes(q));
          if (!list.length) continue;
          fold.appendChild(h('div.muted.small.pad', t.label));
          for (const b of list) {
            shown++;
            const ds = bDiags(ctx, b), nw = ds.filter(d => d.severity === 'WARN').length, nb = ds.filter(d => d.severity === 'BLOCK').length;
            fold.appendChild(h('div.npc' + (st.sel === b.si ? '.sel' : ''), { on: { click: () => { st.sel = b.si; ctx.renderAll(false); } } },
              h('div.n', h('span', b.name), h('span', badge(b) ? h('span.tag', badge(b)) : null, ctx.edited.has(keyOf(b.si)) ? h('span.tag.edit', 'edited') : null,
                nb ? h('span.tag.bad', '⛔' + nb) : nw ? h('span.tag.warn', '⚠' + nw) : null)),
              h('div.k', b.kind === 'attack' ? attackText(b.max) : statsText(ctx, words, b))));
          }
        }
        el.appendChild(fold);
      }
      if (!shown) el.appendChild(h('div.pad.muted', 'No buffs match.'));
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const b = st.sel === null ? null : model(ctx).bySi.get(st.sel);
        if (!b) { el.appendChild(h('p.empty-state', 'Select a buff on the left. Each class opens to its 1st job, 2nd job, Master, Hero and 3rd job buffs. Attack skills (cooldown, PvP power): the filter above the list.')); return; }
        if (b.kind === 'attack') attackView(el, ctx, b); else buffView(el, ctx, b);
      });
    },

    addTarget() { return { ok: false, title: 'Buffs are not added in this task' }; },
    locate(d, ctx) {
      if (d.module !== 'classbuffs') return false;
      const b = [...model(ctx).bySi.values()].find(x => x.max.start === d.start);
      if (b) st.sel = b.si;
      return true;
    },
  };

  function edit(ctx, b, make, label, mergeKey) {
    ctx.editGroup(() => [{ file: ADD, splices: make(ctx.ws.files.get(ADD).text) }], label, [keyOf(b.si)], mergeKey);
  }

  function buffView(el, ctx, b) {
    const m = model(ctx), edit_ = can(ctx), { opts, words } = dstOptions(ctx), c = classOf(m, b), tier = m.TIERS[b.tier];
    const f = ctx.ws.files.get(ADD), row = rowOf(b), top = row === b.max, label = `${b.name} (level ${row.lvl})`;
    el.appendChild(h('div.edit-bar', h('span.edit-where', `Editing: ${c ? c.name : ''} · ${tier} · ${b.name}${badge(b) === 'party' ? ' · party buff' : badge(b) ? ' · you or 1 other player' : ''}`)));
    el.appendChild(h('div.npc-title', h('h2', b.name), h('span.def', `${b.define} · ${row.sa}`), edit_ ? null : h('span.tag.bad', 'read-only'),
      h('span.line', `propSkillAdd.csv L${f.lineOf(row.start) + 1}`)));
    el.appendChild(levelBar(ctx, b));
    el.appendChild(h('p.muted.small', `Who gets it: ${b.who}. ${eqText(b)} After saving: Stop Server.bat, then Start Server.bat (it restarts the game too).`));

    el.appendChild(h('h3', `Stats at level ${row.lvl}${top ? ' (top)' : ''} (2 slots)`));
    if (top && b.rows.length > 1) el.appendChild(h('label.small', h('input', { type: 'checkbox', checked: st.scale, on: { change: e => { st.scale = e.target.checked; } } }),
      ` When I change an amount here, change the lower levels that have the same stat in step (each keeps its share of the top amount).`));
    const tb = h('table.items.rt', h('tr', h('th', 'Slot'), h('th', 'Stat'), h('th', 'Amount'), h('th', 'Players get'), h('th', '')));
    for (const s of slotsOf(row)) {
      const on = s.dst !== NULL_ID, dn = v => ctx.ws.defines.byValue('DST_', v);
      tb.appendChild(h('tr', h('td', h('b', String(s.i))),
        h('td', edit_ ? FRE.ui.combo({ options: opts, value: on ? s.dst : null, placeholder: 'Pick a stat', wordStart: true,
          onPick: v => { if (!v || v === s.dst) return; edit(ctx, b, t => O().setStat(t, row, s.i, { dstName: dn(v), adj: on ? s.adj : 1 }), `${label}: slot ${s.i} ${dstLabel(words, v)}${on ? ` (was ${dstLabel(words, s.dst)})` : ''}`); } })
          : (on ? dstLabel(words, s.dst) : '—')),
        h('td', on ? numInput({ value: s.adj, min: -2147483647, max: 2147483647, disabled: !edit_, key: `cb|${b.si}|${s.i}`,
          onCommit: v => { if (v === null || v === s.adj) return;
            if (top && st.scale && sameLower(b, s.i, s.dst) && (s.adj !== 0 || typing(ctx, `cbs|${b.si}|${s.i}`))) scaleTyped(ctx, b, s.i, v, words);
            else edit(ctx, b, t => O().setStat(t, row, s.i, { dstName: dn(s.dst), adj: v }), `${label}: ${dstLabel(words, s.dst)} ${v} (was ${s.adj})`, `cb|${b.si}|${row.lvl}|${s.i}`); } }) : ''),
        h('td', on ? valText(ctx, words, s.dst, s.adj) : h('span.muted', 'empty')),
        h('td', edit_ && on ? h('button.icon.danger', { title: 'Empty this slot', on: { click: () => edit(ctx, b, t => O().setStat(t, row, s.i, null), `${label}: slot ${s.i} emptied (was ${dstLabel(words, s.dst)})`) } }, '✕') : null)));
    }
    el.appendChild(tb);

    // time + cooldown
    const env = Sim().envFor(ctx.ws), base = row.v.dwSkillTime | 0, cdRaw = row.toks[FRE.skillAdd.IX.get('dwCooldown')].text;
    el.appendChild(h('h3', 'Time'));
    el.appendChild(h('div.dr-line', FRE.ui.fieldLabel('Lasts (seconds)'),
      numInput({ value: base / 1000, min: 1, max: 2147483, disabled: !edit_, key: `cbt|${b.si}`,
        onCommit: v => { if (v === null || v * 1000 === base) return; edit(ctx, b, t => O().setDuration(t, row, v * 1000), `${label}: lasts ${v} s (was ${secs(base)})`, `cbt|${b.si}|${row.lvl}`); } }),
      b.refer.length ? h('span.muted.small', ` + extra time from the caster's ${b.refer.map(r => ctx.ws.defines.byValue('DST_', r.stat).replace('DST_', '')).join(' / ')} (see below)`) : null));
    el.appendChild(h('div.dr-line', FRE.ui.fieldLabel('Cooldown (seconds)'),
      numInput({ value: cdRaw === '=' ? null : (row.v.dwCooldown | 0) / 1000, min: 0, max: 2147483, disabled: !edit_, placeholder: `${(row.v.dwCooldown | 0) / 1000}`, key: `cbc|${b.si}|${row.lvl}`,
        onCommit: v => { if (v === null) return; edit(ctx, b, t => O().setCooldown(t, row, v * 1000), `${label}: cooldown ${v} s`, `cbc|${b.si}|${row.lvl}`); } }),
      cdRaw === '=' ? h('span.muted.small', ` "=" uses the skill's own cooldown (${secs(row.v.dwCooldown | 0)}).`)
        : edit_ ? h('button.small', { on: { click: () => edit(ctx, b, t => O().setCooldown(t, row, null), `${label}: cooldown back to the skill's own`) } }, "Use the skill's own") : null));

    // tooltip text
    el.appendChild(h('h3', 'Tooltip text (propSkill.txt.txt)'));
    const meta = m.strings.meta.get(b.descKey), canTxt = ctx.ws.isEditable(TXT);
    const ta = h('textarea.cb-text', { rows: 3, disabled: !canTxt || !meta, style: 'width:100%' });
    ta.value = b.desc;
    ta.addEventListener('change', () => {
      if (ta.value.trim() === b.desc) return;
      ctx.editGroup(() => [{ file: TXT, splices: O().setText(m.strings.meta.get(b.descKey), ta.value) }], `${b.name}: tooltip text`, [keyOf(b.si)]);
    });
    el.appendChild(ta);
    el.appendChild(h('p.muted.small', `${b.descKey || 'no text key'} · the game shows this under the skill name; the numbers in it are not filled in by the game, so keep them in step with the stats.`));

    // what players get
    el.appendChild(h('h3', 'What players get'));
    el.appendChild(h('div.dr-line', h('span', `Caster's ${b.refer.length ? ctx.ws.defines.byValue('DST_', b.refer[0].stat).replace('DST_', '') : 'stat'}:`),
      numInput({ value: st.stat, min: 0, max: 100000, onCommit: v => { if (v !== null) { st.stat = v; ctx.renderAll(false); } } }),
      h('span', 'Weapon:'), h('select', { on: { change: e => { st.gear = e.target.value; ctx.renderAll(false); } } }, GEAR.map(([v, l]) => h('option', { value: v, selected: v === st.gear }, l)))));
    const ms = Sim().duration(env, b, row, { STA: st.stat, DEX: st.stat, INT: st.stat });
    const gear = (GEAR.find(g => g[0] === st.gear) || GEAR[0])[2], why = Sim().blocked(b, gear);
    el.appendChild(h('p', `${b.name} at level ${row.lvl}: ${statsText(ctx, words, { slots: slotsOf(row) })} for ${b.who}, lasts ${secs(ms)}${b.refer.length ? ` (with ${st.stat} in that stat)` : ''}.`,
      why ? h('span.warn-text', ` Not with this weapon: it ${why}.`) : null));
    if (c) {
      const r = Sim().selfBuffs(env, m, c.key, { gear, stance: 'rage' });
      const tb2 = h('table.items.rt', h('tr', h('th', 'Stat'), h('th', `A ${c.name} with every own buff on`)));
      for (const [d, a] of Sim().statList(r.stats)) tb2.appendChild(h('tr', h('td', dstLabel(words, d)), h('td', valText(ctx, words, d, a))));
      el.appendChild(tb2);
      const off = r.used.filter(u => !u.ok);
      if (off.length) el.appendChild(h('p.muted.small', 'Not counted: ' + off.map(u => `${u.b.name} (${u.why})`).join('; ') + '.'));
      for (const n of Sim().capNotes(env, r.stats)) el.appendChild(h('p.small.warn-text', '⚠ ' + n));
    }
    const ds = bDiags(ctx, b);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  // lower levels holding the same stat in slot i (only those move in step; e.g. on main Berserk L1-9 give other stats than L10)
  const sameLower = (b, i, dst) => b.rows.some(r => r !== b.max && (r.v['dwDestParam' + i] >>> 0) === dst);
  // live typing commits every keystroke: scaling 10 -> 2 -> 20 step by step would lose the low levels (1 x 2/10 rounds to 0).
  // So while the same box is still being typed into (the merge window of editGroup, ui/app.js), the last scaling is undone first
  // and the final number always scales from the values before typing started.
  const typing = (ctx, mk) => { const h_ = ctx.ws.history, last = h_[h_.length - 1]; return !!(last && last.mergeKey === mk && Date.now() - (last.at || 0) < 2000); };
  function scaleTyped(ctx, b, i, v, words) {
    const mk = `cbs|${b.si}|${i}`;
    if (typing(ctx, mk)) ctx.ws.undo();
    const nb = model(ctx).bySi.get(b.si), old = nb.slots[i - 1];
    if (old.adj === v) { ctx.renderAll(false); return; }
    edit(ctx, nb, t => O().scaleLevels(t, nb.rows, i, v), `${nb.name}: ${dstLabel(words, old.dst)} ${v} at the top, every level in step (was ${old.adj})`, mk);
  }
  // the 2 stat slots of any level's row (b.slots is the top row's)
  function slotsOf(row) { return [1, 2].map(i => ({ i, dst: row.v['dwDestParam' + i] >>> 0, adj: row.v['nAdjParamVal' + i] | 0 })); }

  function levelBar(ctx, b) {
    const row = rowOf(b);
    return h('div.dr-line', FRE.ui.fieldLabel('Level'),
      h('select', { on: { change: e => { st.lvl.set(b.si, Number(e.target.value)); ctx.renderAll(false); } } },
        b.rows.map(r => h('option', { value: r.lvl, selected: r === row }, `${r.lvl}${r === b.max ? ' (top)' : ''}${r === b.eqRow ? ' (Equalized PvP)' : ''}`))),
      h('span.muted.small', ` ${b.rows.length} levels in propSkillAdd.csv · propSkillAdd.csv L${ctx.ws.files.get(ADD).lineOf(row.start) + 1}`));
  }

  // damage, then PvP power: '=' in the file = the same as against monsters
  const pvpRaw = (row, k) => row.toks[FRE.skillAdd.IX.get(k)].text.trim();
  function attackText(row) {
    const v = row.v, same = pvpRaw(row, 'dwAbilityMinPVP') === '=' && pvpRaw(row, 'dwAbilityMaxPVP') === '=';
    return `Damage ${v.dwAbilityMin | 0}-${v.dwAbilityMax | 0} · PvP ${same ? 'same' : `${v.dwAbilityMinPVP | 0}-${v.dwAbilityMaxPVP | 0}`} · cooldown ${secs(v.dwCooldown | 0)}`;
  }

  function attackView(el, ctx, a) {
    const m = model(ctx), edit_ = can(ctx), c = classOf(m, a), row = rowOf(a), label = `${a.name} (level ${row.lvl})`, v = row.v;
    el.appendChild(h('div.edit-bar', h('span.edit-where', `Editing: ${c ? c.name : ''} · ${m.TIERS[a.tier]} · ${a.name} · attack skill`)));
    el.appendChild(h('div.npc-title', h('h2', a.name), h('span.def', `${a.define} · ${row.sa}`), edit_ ? null : h('span.tag.bad', 'read-only')));
    el.appendChild(levelBar(ctx, a));
    el.appendChild(h('p.muted.small', `${eqText(a)} Only the skill's power numbers, PvP power and cooldown are edited here; the damage formula itself is in the C++.`));
    const pair = (title, k, pvp) => {
      const raw = pvp && pvpRaw(row, 'dwAbilityMinPVP') === '=' && pvpRaw(row, 'dwAbilityMaxPVP') === '=';
      const lo = v['dwAbilityMin' + k] | 0, hi = v['dwAbilityMax' + k] | 0;
      const put = (nlo, nhi) => edit(ctx, a, t => O().setAbility(t, row, nlo, nhi, pvp), `${label}: ${title} ${nlo === null ? 'same as monsters' : `${nlo}-${nhi}`} (was ${raw ? 'same' : `${lo}-${hi}`})`, `cba|${a.si}|${row.lvl}|${k}`);
      return h('div.dr-line', FRE.ui.fieldLabel(title),
        numInput({ value: raw ? null : lo, placeholder: raw ? String(lo) : '', min: 0, max: 2147483647, disabled: !edit_, key: `cba|${a.si}|${row.lvl}|${k}|lo`, onCommit: x => { if (x !== null && x !== lo) put(x, Math.max(x, hi)); } }),
        h('span', ' to '),
        numInput({ value: raw ? null : hi, placeholder: raw ? String(hi) : '', min: 0, max: 2147483647, disabled: !edit_, key: `cba|${a.si}|${row.lvl}|${k}|hi`, onCommit: x => { if (x !== null && x !== hi) put(Math.min(lo, x), x); } }),
        pvp ? (raw ? h('span.muted.small', ' "=": the same as against monsters') : edit_ ? h('button.small', { on: { click: () => put(null, null) } }, 'Same as against monsters') : null) : null,
        pvp && !raw && (lo + hi) ? h('span.muted.small', ` = about x${((v.dwAbilityMinPVP + v.dwAbilityMaxPVP) / ((v.dwAbilityMin + v.dwAbilityMax) || 1)).toFixed(2)} of the monster power`) : null);
    };
    el.appendChild(h('h3', `Power at level ${row.lvl}`));
    el.appendChild(pair('Against monsters', '', false));
    el.appendChild(pair('Against players (PvP)', 'PVP', true));
    const cdRaw = pvpRaw(row, 'dwCooldown');
    el.appendChild(h('h3', 'Cooldown'));
    el.appendChild(h('div.dr-line', FRE.ui.fieldLabel('Cooldown (seconds)'),
      numInput({ value: cdRaw === '=' ? null : (v.dwCooldown | 0) / 1000, min: 0, max: 2147483, disabled: !edit_, placeholder: `${(v.dwCooldown | 0) / 1000}`, key: `cbc|${a.si}|${row.lvl}`,
        onCommit: x => { if (x === null) return; edit(ctx, a, t => O().setCooldown(t, row, x * 1000), `${label}: cooldown ${x} s`, `cbc|${a.si}|${row.lvl}`); } }),
      cdRaw === '=' ? h('span.muted.small', ` "=" uses the skill's own cooldown (${secs(v.dwCooldown | 0)}).`) : null));
    const ds = bDiags(ctx, a);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }

  FRE.ui.modules.push(mod);
  FRE.ui.classbuffs = { buffView, attackView };
})(globalThis.FRE = globalThis.FRE || {});
