// Equalized PvP pages inside the PvP Events task (ui/pvp.js calls these):
//   eventBlock    on the FFA / TDM / Guild Siege page: equalized on / off + the most players of each class (EqualizedPvP.inc)
//   presetsView   "Equalized presets": the shared gear set of each class + gender (EqualizedPresets.inc): the HP set (worn on entry,
//                 Quick Switch key 9), the Attack set (key 0; empty slots keep the HP item), the bag; what the player gets
//                 (loaders/equalized-sim.js); add / copy / remove presets; "Edit item" with upgrade, element, awakes and sockets.
// Edits: edit/equalized-ops.js, through ui/pvp.js apply() (one undo step each).
(function (FRE) {
  'use strict';
  const { h, fmt, numInput, modal, toast } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const E = () => FRE.equalized, S = () => FRE.equalizedSim, O = () => FRE.equalizedOps;
  const EVF = 'equalizedpvp.inc', PRF = 'equalizedpresets.inc';
  const eqOf = ctx => ctx.ws.models.pvp.eq;
  const can = (ctx, f) => ctx.ws.isEditable(f);
  const st = { cls: 5, sex: 0, same: true, set: 'HP' };      // same: every preset edit is copied to the other gender (armor swapped _M_ / _F_); set: the switch set shown
  const PV_WORD = { FFA: 'ffa', TDM: 'tdm', GS: 'gs' };
  const SEC_LABEL = { HP: 'HP set · switch key 9', ATTACK: 'Attack set · switch key 0', BAG: 'Inventory extras (every class)' };
  const SEC_SHORT = { HP: 'HP set', ATTACK: 'Attack set', BAG: 'inventory' };
  const SEC_HINT = { HP: 'Worn when the player enters. Key 9 switches back to it.', ATTACK: 'Kept in the inventory; key 0 puts it on. Slots it leaves empty keep the HP piece.',
    BAG: 'Extras only, no switch: premium items, beads for the buff pets, potions, food, scrolls. (The Attack set and the pets are in the inventory too, but you set them in their slots above.)' };

  const nameOfId = (ws, id) => { const it = id >= 0 ? ws.itemById(id >>> 0) : null; return it ? it.define : String(id); };
  const dstNameOf = (ws, v) => ws.defines.byValue('DST_', v) || String(v);
  const PET_KINDS = [['PK_TIGER', 'Tiger'], ['PK_LION', 'Lion'], ['PK_RABBIT', 'Rabbit'], ['PK_FOX', 'Fox'], ['PK_DRAGON', 'Dragon'], ['PK_GRIFFIN', 'Griffin'], ['PK_UNICORN', 'Unicorn']];
  const itemLabel = (ws, it) => { if (it.raisedPet !== undefined) { const k = PET_KINDS[it.raisedPet]; return `${k ? k[1] : it.define} raised pet (level S)`; } const r = it.id >= 0 ? ws.itemById(it.id >>> 0) : null; return r ? (r.name || r.define) : (it.define || String(it.id)); };
  const partLabel = (ctx, v) => { const n = ctx.ws.defines.byValue('PARTS_', v); const s = E().SLOTS.find(x => x[0] === n); return s ? s[1] : n || `slot ${v}`; };
  const elemText = it => (it.elem ? ` ${E().ELEMENTS[it.elem - 1][0]}${E().ELEMENTS[it.elem - 1].slice(1).toLowerCase()} +${it.elemLv}` : '');
  function itemSummary(ctx, it) {
    if (it.raisedPet !== undefined) return 'level S, every level at the top bonus, full life';
    const words = FRE.itemTooltip.dstWords(ctx.ws), parts = [];
    if (it.upgrade > 0) parts.push(`+${it.upgrade}`);
    if (it.elem) parts.push(`${elemText(it).trim()} element`);
    for (const a of it.awakes) { const w = words.get(a.dst); parts.push(`${w ? (w.word || w.define).replace(/[:\s]+$/, '') : dstNameOf(ctx.ws, a.dst)} ${a.adj >= 0 ? '+' : ''}${a.adj}${w && w.rate ? '%' : ''}`); }
    if (it.cards.length) {                              // same cards grouped: "Cards: 10x Fire Card (A)"
      const n = new Map();
      for (const c of it.cards) { const l = itemLabel(ctx.ws, { id: c }); n.set(l, (n.get(l) || 0) + 1); }
      parts.push(`Cards: ${[...n].map(([l, k]) => `${k}x ${l}`).join(', ')}`);
    }
    if (it.ultimate) parts.push('Ultimate');
    if (it.runes && it.runes.length) parts.push(`Runes: ${it.runes.map(r => itemLabel(ctx.ws, { id: r })).join(', ')}`);
    if (it.jewels && it.jewels.length) { const n = new Map(); for (const j of it.jewels) { const l = itemLabel(ctx.ws, { id: j }); n.set(l, (n.get(l) || 0) + 1); } parts.push(`Jewels: ${[...n].map(([l, k]) => `${k}x ${l}`).join(', ')}`); }
    if (it.count > 1) parts.push(`x${fmt(it.count)}`);
    return parts.join(' · ');
  }

  // ---------------------------------------------------------------- FFA / TDM / GS page: on / off + class limits
  function eventBlock(el, ctx, ev, apply) {
    const eq = eqOf(ctx);
    if (!eq || !eq.present) return;
    const evm = eq.events, x = evm.events[ev], dis = !can(ctx, EVF) || evm.failed;
    el.appendChild(h('h3', 'Equalized'));
    el.appendChild(h('p.muted.small', 'When on, players pick a class as they enter and fight as a level 150 Hero / Legend of it, every skill maxed, with the shared gear preset of that class (the Equalized presets page). Their own character comes back when they leave. Stats: players spend the points themselves.'));
    if (evm.failed) el.appendChild(h('div.banner.bad', `EqualizedPvP.inc: ${evm.error}`));
    const lbl = E().EVENT_LABEL[ev];
    const set = (make, label, merge = null) => apply(ctx, EVF, make, label, `pvp|${PV_WORD[ev]}|eq`, merge);
    const box = h('input', { type: 'checkbox', checked: x.on, disabled: dis, on: { change: e => set(t => O().setOn(evm, t, ev, e.target.checked), `${lbl} equalized ${e.target.checked ? 'on' : 'off'} (was ${x.on ? 'on' : 'off'})`) } });
    el.appendChild(h('label.small', box, ` ${lbl} is equalized`, x.line ? null : h('span.muted', ' (no line yet: one is added on change)')));
    const tb = h('table.items.up', h('tr', h('th', 'Class'), h('th', 'Most players'), h('th', '')));
    E().CLASSES.forEach((c, i) => {
      const v = x.caps[i], sp = x.line ? x.line.caps[i] : null;
      tb.appendChild(h('tr', h('td', c.label),
        h('td', numInput({ value: x.line ? x.line.caps[i].value : v, min: 0, max: 999, key: `pvp|eq|${ev}|${i}`, disabled: dis,
          onCommit: n => { if (n === null || n === v) return; set(t => O().setCap(evm, t, ev, i, n), `${lbl} ${c.label} limit ${n} (was ${v})`, `pvp|eq|${ev}|${i}`); } }),
          h('span.muted.small', v >= 99 ? ' no limit' : v === 0 ? ' nobody can pick it' : '')),
        h('td', sp ? diagTags(FRE.ui.diagsInSpan(ctx.ws, 'EqualizedPvP.inc', sp.start, sp.end)) : null)));
    });
    el.appendChild(tb);
  }

  // ---------------------------------------------------------------- the presets page
  function presetsView(el, ctx, apply) {
    const eq = eqOf(ctx), ws = ctx.ws;
    el.appendChild(h('div.npc-title', h('h2', 'Equalized presets'), h('span.def', ['EqualizedPresets.inc', 'EqualizedPvP.inc'].filter(f => ws.files.has(f.toLowerCase())).join(' · ')),
      can(ctx, PRF) ? null : h('span.tag.bad', 'read-only')));
    if (!eq || !eq.present) { el.appendChild(h('p.muted', 'EqualizedPvP.inc / EqualizedPresets.inc are not in this folder.')); return; }
    const pr = eq.presets;
    el.appendChild(h('p.muted.small', 'One gear set per class and gender, the same in every equalized event (FFA / TDM / Guild Siege switch it on or off on their own pages). Everyone inside is a level 150 Hero / Legend with every skill maxed and spends their own stat points. The WorldServer reads this file at start and on /eqreload.'));
    if (pr.stopped) el.appendChild(h('div.banner.bad', `${pr.stopped.message}. Fix it first: the editor does not change the file while it does not load completely.`));
    // one click: every tier weapon saved before the list showed only Ultimates (II_WEA_YOY_ANCIENT …) becomes its Ultimate (…UM),
    // keeping its +, element, awakes and cards
    const D0 = ws.defines.defines, umOf = d => { const m = TIER_BASE.exec(d || ''); return m && D0.has(d + 'UM') && ws.itemById(D0.get(d + 'UM') >>> 0) ? d + 'UM' : null; };
    const notUlt = [...pr.byKey.values()].flatMap(b => ['HP', 'ATTACK'].flatMap(n => (b.sections[n] ? b.sections[n].items : []).filter(it => umOf(it.define)).map(it => ({ b, it }))));
    if (notUlt.length && can(ctx, PRF) && !pr.stopped) el.appendChild(h('p.small', h('span.tag.warn', '⚠'),
      ` ${notUlt.length} weapon${notUlt.length === 1 ? ' is' : 's are'} the plain (Unique) version, in ${new Set(notUlt.map(x => x.b)).size} preset(s): ${[...new Set(notUlt.map(x => itemLabel(ws, x.it)))].join(', ')}. `,
      h('button.small', { on: { click: () => apply(ctx, PRF, t => {
        let text = t;
        for (;;) {
          const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: D0, items: ws.items.items });
          let hit = null;
          for (const b1 of pr1.byKey.values()) for (const n of ['HP', 'ATTACK']) (b1.sections[n] ? b1.sections[n].items : []).forEach((it, k) => { if (!hit && umOf(it.define)) hit = { b1, n, k, it }; });
          if (!hit) break;
          const sp = Object.assign(O().specOf(hit.it, id => nameOfId(ws, id), v => dstNameOf(ws, v)), { item: umOf(hit.it.define) });
          text = FRE.SourceFile.spliceText(text, O().setItem(pr1, hit.b1, hit.n, hit.k, sp));
        }
        return diffSplice(t, text);
      }, `Equalized presets: ${notUlt.length} weapon(s) changed to their Ultimate version`, 'pvp|eq|preset') } }, '⬆ Use the Ultimate versions')));
    // one click: every element on a helmet / gauntlets / boots / shield (only suits and weapons take one) goes
    const wrongEl = ws.diags.filter(d => d.code === 'EQ_ELEMENT_PART').length;
    if (wrongEl && can(ctx, PRF) && !pr.stopped) el.appendChild(h('div.banner', `${wrongEl} piece${wrongEl === 1 ? ' has' : 's have'} an element the game can't give (only suits and weapons take one). `,
      h('button.small', { on: { click: () => apply(ctx, PRF, t => {
        const D = ws.defines.defines, read = x => E().readPresets({ name: 'EqualizedPresets.inc', text: x }, { defines: D, items: ws.items.items });
        let text = t;
        for (let guard = 0; guard < 2000; guard++) {
          const pr1 = read(text);
          let hit = null;
          for (const b1 of pr1.presets) for (const n of E().SECTIONS) (b1.sections[n] ? b1.sections[n].items : []).forEach((it, i) => {
            if (!hit && it.elem && it.id >= 0 && !S().elementOk(ws.itemById(it.id >>> 0), D)) hit = { b1, n, i, it };
          });
          if (!hit) break;
          const sp = Object.assign(O().specOf(hit.it, id => nameOfId(ws, id), v => dstNameOf(ws, v)), { elem: 0, elemLv: 0 });
          text = FRE.SourceFile.spliceText(text, O().setItem(pr1, hit.b1, hit.n, hit.i, sp));
        }
        return diffSplice(t, text);
      }, `Equalized presets: ${wrongEl} wrong element${wrongEl === 1 ? '' : 's'} removed`, 'pvp|eq|preset') } }, 'Remove wrong elements (all presets)')));
    // ---- class x gender grid
    const grid = h('table.items.up', h('tr', h('th', 'Class'), h('th', 'Male'), h('th', 'Female')));
    E().CLASSES.forEach((c, ci) => {
      grid.appendChild(h('tr', h('td', c.label), [0, 1].map(x => {
        const b = pr.byKey.get(`${ci}|${x}`), sel = st.cls === ci && st.sex === x;
        const ds = b ? presetDiags(ctx, b) : [];
        const bad = ds.filter(d => d.severity === 'BLOCK').length, warn = ds.filter(d => d.severity === 'WARN').length;
        return h('td', h('button.small' + (sel ? '.primary' : ''), { on: { click: () => { st.cls = ci; st.sex = x; ctx.renderAll(false); } } },
          b ? `${countItems(b)} item${countItems(b) === 1 ? '' : 's'}` : 'missing'),
          bad ? h('span.tag.bad', '⛔' + bad) : warn ? h('span.tag.warn', '⚠' + warn) : null);
      })));
    });
    el.appendChild(grid);
    const c = E().CLASSES[st.cls], where = `${c.label} ${E().SEXES[st.sex].toLowerCase()}`;
    const b = pr.byKey.get(`${st.cls}|${st.sex}`), dis = !can(ctx, PRF) || !!pr.stopped;
    const nameOf = id => nameOfId(ws, id), dstOf = v => dstNameOf(ws, v);
    const otherSex = E().SEXES[1 - st.sex].toLowerCase();
    if (!b) {
      el.appendChild(h('h3', where));
      el.appendChild(h('p.muted', 'No preset: a player who picks this class enters naked.'));
      if (!dis) {
        const others = [...pr.byKey.values()];
        let from = '';
        const pick = h('select', { on: { change: e => { from = e.target.value; } } }, h('option', { value: '' }, 'empty (add items after)'),
          others.map(o => h('option', { value: `${o.cls}|${o.sex}` }, `copy ${E().CLASSES[o.cls].label} ${E().SEXES[o.sex].toLowerCase()}${o.cls === st.cls ? ' (armor swapped to ' + E().SEXES[st.sex].toLowerCase() + ')' : ''}`)));
        // the other gender of the same class first: copied with each armor piece swapped for its twin (_M_ / _F_)
        const twin = pr.byKey.get(`${st.cls}|${1 - st.sex}`);
        if (twin) { from = `${twin.cls}|${twin.sex}`; pick.value = from; }
        el.appendChild(h('div', pick, ' ', h('button.primary', { on: { click: () => {
          const src = from ? pr.byKey.get(from) : null;
          if (src && src.cls === st.cls) { mirror(ctx, apply, src); return; }
          apply(ctx, PRF, t => {
            const t1 = FRE.SourceFile.spliceText(t, O().addPreset(pr, t, st.cls, st.sex, src, nameOf, dstOf));
            const donor = [...pr.byKey.values()].find(x => x.sections.BAG && x.sections.BAG.items.length);
            if ((src && src.sections.BAG && src.sections.BAG.items.length) || !donor) return diffSplice(t, t1);
            const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text: t1 }, { defines: ws.defines.defines, items: ws.items.items });
            const specs = donor.sections.BAG.items.map(x => O().specOf(x, nameOf, dstOf));        // the shared inventory extras
            return diffSplice(t, FRE.SourceFile.spliceText(t1, addMany(pr1, t1, pr1.byKey.get(`${st.cls}|${st.sex}`), 'BAG', specs, ws)));
          }, `Equalized preset ${where} added${src ? ` (copy of ${E().CLASSES[src.cls].label} ${E().SEXES[src.sex].toLowerCase()})` : ''}`, `pvp|eq|preset`);
        } } }, '+ Create preset')));
      }
      return;
    }
    // what you are editing stays at the top while scrolling (the user, 2026-10-21: "I don't know what I'm working on"): class, gender,
    // switch set, and the set switch + "copy to the other gender" next to it
    const setName = st.set === 'HP' ? 'HP set (key 9)' : 'Attack set (key 0)';
    const bar = h('div.edit-bar', h('span.edit-where', `Editing: ${c.label} · ${E().SEXES[st.sex][0] + E().SEXES[st.sex].slice(1).toLowerCase()} · ${setName}`),
      h('span', { style: 'display:inline-flex;gap:4px' }, ['HP', 'ATTACK'].map(n => h('button.small' + (n === st.set ? '.primary' : ''), { title: n === st.set ? 'Shown now' : `Show the ${n === 'HP' ? 'HP' : 'Attack'} set`, on: { click: () => { st.set = n; ctx.renderAll(false); } } },
        n === 'HP' ? 'HP set · key 9' : 'Attack set · key 0'))),
      h('label.small', { title: 'Each change you make here (add, edit, remove a piece) is also made to the matching piece of the other gender: armor becomes its male / female version. Changes made only on the other gender stay.' },
        h('input', { type: 'checkbox', checked: st.same, on: { change: e => { st.same = e.target.checked; ctx.renderAll(false); } } }), ` Copy my changes to ${otherSex}`),
      dis ? null : h('button.small', { title: `Make the ${otherSex} preset the same as this one now; each armor piece becomes its ${otherSex} version (_M_ / _F_)`, on: { click: () => mirror(ctx, apply, b) } },
        `⇄ Copy to ${otherSex}${pr.byKey.has(`${st.cls}|${1 - st.sex}`) ? ' (replaces it)' : ''}`),
      dis ? null : h('button.small', { title: 'The HP set becomes the Attack set and the other way round', on: { click: () => presetEdit(ctx, apply, b, { kind: 'swap' }, () => swapSplices(b), `${where}: HP and Attack sets swapped`) } }, '⇄ Swap HP and Attack'),
      dis ? null : h('button.small', { on: { click: () => apply(ctx, PRF, t => O().removePreset(pr, t, b), `Equalized preset ${where} removed`, 'pvp|eq|preset') } }, '✕ Remove preset'));
    el.appendChild(bar);
    // the group headers stick right under the bar: its height (it wraps on a narrow window) as --eq-bar
    const barHeight = () => { if (bar.isConnected) el.style.setProperty('--eq-bar', `${bar.offsetHeight}px`); };
    requestAnimationFrame(barHeight);
    if (typeof ResizeObserver === 'function') new ResizeObserver(barHeight).observe(bar);
    const sim = S().enter(b, { defines: ws.defines.defines, items: ws.items.items });
    // pieces of the other gender (a male-only fashion set on a female preset, from before such pieces were left out): one click takes them out
    const wrongSex = sim.placed.filter(p => p.sec !== 'BAG' && p.item.id >= 0 && ws.itemById(p.item.id >>> 0) && S().wearIssues(ws.itemById(p.item.id >>> 0), b.cls, b.sex, ws.defines.defines).some(w => /male item/.test(w)));
    if (wrongSex.length && !dis) el.appendChild(h('p.small', h('span.tag.warn', '⚠'), ` ${wrongSex.length} piece${wrongSex.length === 1 ? '' : 's'} a ${E().SEXES[b.sex].toLowerCase()} can't wear: ${[...new Set(wrongSex.map(p => itemLabel(ws, p.item)))].join(', ')}. `,
      h('button.small', { on: { click: () => apply(ctx, PRF, t => {
        let text = t;
        for (;;) {
          const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: ws.defines.defines, items: ws.items.items }), b1 = pr1.byKey.get(`${b.cls}|${b.sex}`);
          if (!b1) break;
          const s1 = S().enter(b1, { defines: ws.defines.defines, items: ws.items.items });
          const x = s1.placed.filter(p => p.sec !== 'BAG' && p.item.id >= 0 && ws.itemById(p.item.id >>> 0) && S().wearIssues(ws.itemById(p.item.id >>> 0), b.cls, b.sex, ws.defines.defines).some(w => /male item/.test(w)));
          if (!x.length) break;
          const last = x[x.length - 1];
          text = FRE.SourceFile.spliceText(text, O().removeItem(pr1, text, b1, last.sec, b1.sections[last.sec].items.indexOf(last.item)));
        }
        return diffSplice(t, text);
      }, `${where}: ${wrongSex.length} piece(s) of the other gender taken out`, 'pvp|eq|preset') } }, `✕ Remove ${wrongSex.length === 1 ? 'it' : `all ${wrongSex.length}`}`)));
    // one switch set at a time (the page stays short): HP (key 9) or Attack (key 0), picked in the Editing bar; the inventory (folded) below
    for (const name of E().SECTIONS) if (name === 'BAG' || name === st.set) section(el, ctx, b, name, sim, dis, apply);
  }
  const countItems = b => E().SECTIONS.reduce((n, s) => n + (b.sections[s] ? b.sections[s].items.length : 0), 0);
  function presetDiags(ctx, b) {
    return ctx.ws.diags.filter(d => d.module === 'pvp' && d.file === 'EqualizedPresets.inc' && d.start >= b.header.start && d.start < (b.close ? b.close.end : b.header.end + 1));
  }
  // the other gender = this preset with every armor piece swapped for its twin (edit/equalized-ops.js mirrorPreset)
  function mirror(ctx, apply, src) {
    const ws = ctx.ws, pr = eqOf(ctx).presets, D = ws.defines.defines, out = {};
    const has = d => D.has(d) && !!ws.itemById(D.get(d) >>> 0);
    const to = `${E().CLASSES[src.cls].label} ${E().SEXES[1 - src.sex].toLowerCase()}`;
    const wears = d => { const r = d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; return !!r && !S().wearIssues(r, src.cls, 1 - src.sex, D).some(w => /male item/.test(w)); };
    apply(ctx, PRF, t => O().mirrorPreset(pr, t, src, id => nameOfId(ws, id), v => dstNameOf(ws, v), has, out, wears),
      `Equalized preset ${to} = ${E().SEXES[src.sex].toLowerCase()} set (${out.swapped || 0} piece(s) swapped)`, 'pvp|eq|preset');
    st.sex = 1 - src.sex;
    ctx.renderAll(false);
    toast(`${to}: ${out.swapped} piece(s) swapped to the ${E().SEXES[1 - src.sex].toLowerCase()} version, ${out.kept} kept (weapons, jewelry, potions: the same for both)${out.dropped ? `, ${out.dropped} left out: no ${E().SEXES[1 - src.sex].toLowerCase()} version (those slots stay empty)` : ''}.`);
  }

  // the HP and Attack sets trade places: only the two section words change
  function swapSplices(b) {
    const out = [];
    if (b.sections.HP) out.push({ start: b.sections.HP.word.start, end: b.sections.HP.word.end, insert: 'ATTACK' });
    if (b.sections.ATTACK) out.push({ start: b.sections.ATTACK.word.start, end: b.sections.ATTACK.word.end, insert: 'HP' });
    if (!out.length) throw new Error('Nothing to swap');
    return out;
  }
  // one piece to the other set: removed here, added there with the same settings
  function moveSplices(pr, t, b, name, i, ws) {
    const it = b.sections[name].items[i], to = name === 'HP' ? 'ATTACK' : 'HP';
    const sp = O().specOf(it, id => nameOfId(ws, id), v => dstNameOf(ws, v));
    const t1 = FRE.SourceFile.spliceText(t, O().removeItem(pr, t, b, name, i));
    const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text: t1 }, { defines: ws.defines.defines, items: ws.items.items });
    const t2 = FRE.SourceFile.spliceText(t1, O().addItem(pr1, t1, pr1.byKey.get(`${b.cls}|${b.sex}`), to, sp));
    return diffSplice(t, t2);
  }

  // one preset edit; with "Copy my changes to the other gender" on, the SAME change is made to the other gender in the same undo
  // step: on its matching item (O().twinIndex: the same item or its _M_ / _F_ twin), armor swapped for the twin. Other differences
  // there stay (edit it to make it its own); no matching item: that gender is left as it is and the toast says so.
  // op: { kind: 'set' | 'add' | 'remove', name, i, spec }. No preset for the other gender yet: it is created as a full copy.
  // fashion, cloak, mask: each gender picks its own (user, 2026-10-21): an edit of one never goes to the other gender
  const FASHION_PARTS = ['PARTS_HAT', 'PARTS_CLOTH', 'PARTS_GLOVE', 'PARTS_BOOTS', 'PARTS_CLOAK', 'PARTS_MASK'];
  const isFashion = (ws, d) => { const D = ws.defines.defines, r = d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; return !!r && FASHION_PARTS.map(x => D.get(x)).includes(FRE.specItem.get(r, 'dwParts')); };
  function presetEdit(ctx, apply, b, op, make, label) {
    const old = op.name && op.i >= 0 && b.sections[op.name] ? b.sections[op.name].items[op.i] : null;
    const fashion = (op.spec && isFashion(ctx.ws, op.spec.item)) || (old && isFashion(ctx.ws, old.define || nameOfId(ctx.ws, old.id)));
    if (!st.same || fashion) { apply(ctx, PRF, make, label, 'pvp|eq|preset'); return; }
    const ws = ctx.ws, D = ws.defines.defines, has = d => D.has(d) && !!ws.itemById(D.get(d) >>> 0);
    const toSex = 1 - b.sex, nameOf = id => nameOfId(ws, id), dstOf = v => dstNameOf(ws, v), other = E().SEXES[toSex].toLowerCase();
    const defOf = it => it.define || nameOfId(ws, it.id);
    const partOf = d => { const r = d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; return r ? FRE.specItem.get(r, 'dwParts') : null; };
    // the other gender's matching item, found once in the current text (an edit of this gender doesn't move the other block's items)
    const o0 = eqOf(ctx).presets.byKey.get(`${b.cls}|${toSex}`), sec0 = o0 && op.name ? o0.sections[op.name] : null;
    const j = old && sec0 ? O().twinIndex(b.sections[op.name].items, sec0.items, op.i, toSex, has, defOf, partOf) : -1;
    // a piece added there only when its slot is still free (2 rings, 2 earrings; the inventory has no slots): else a 2nd shield
    const ringLike = ['PARTS_RING1', 'PARTS_RING2', 'PARTS_EARRING1', 'PARTS_EARRING2'].map(x => D.get(x));
    const slotFree = () => {
      const p = op.spec && !op.spec.raisedPet ? partOf(O().twinOf(op.spec.item, toSex, has)) : null;
      if (!sec0 || p === null || p === undefined || op.name === 'BAG') return true;
      const same = q => q === p || (ringLike.includes(p) && ringLike.includes(q) && (ringLike.indexOf(q) >> 1) === (ringLike.indexOf(p) >> 1));
      return sec0.items.filter(it => it.raisedPet === undefined && same(partOf(defOf(it)))).length < (ringLike.includes(p) ? 2 : 1);
    };
    const hit = !o0 || !['set', 'remove', 'move', 'add'].includes(op.kind) || j >= 0 || ((op.kind === 'set' || op.kind === 'add') && slotFree());
    apply(ctx, PRF, t => {
      const t1 = FRE.SourceFile.spliceText(t, make(t));
      const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text: t1 }, { defines: D, items: ws.items.items });
      const b1 = pr1.byKey.get(`${b.cls}|${b.sex}`), o1 = pr1.byKey.get(`${b.cls}|${toSex}`);
      if (!b1 || pr1.stopped) return make(t);
      let s2 = [];
      // a piece the other gender can't wear (no female / male version): left out there, the slot stays empty
      const wears = d => { const r = d && D.has(d) ? ws.itemById(D.get(d) >>> 0) : null; return !!r && !S().wearIssues(r, b.cls, toSex, D).some(w => /male item/.test(w)); };
      if (!o1) s2 = O().mirrorPreset(pr1, t1, b1, nameOf, dstOf, has, {}, wears);
      else {
        const tw0 = op.spec && !op.spec.raisedPet ? O().twinOf(op.spec.item, toSex, has) : null;
        const tw = op.spec ? (op.spec.raisedPet ? op.spec : wears(tw0) ? Object.assign({}, op.spec, { item: tw0 }) : null) : null;
        // set / remove / move go to the matching item (twinIndex), never "the item at the same place"
        if (op.kind === 'swap') s2 = swapSplices(o1);
        else if (op.kind === 'move') { if (j >= 0) s2 = moveSplices(pr1, t1, o1, op.name, j, ws); }
        else if (op.kind === 'addMany') { const t3 = FRE.SourceFile.spliceText(t1, addMany(pr1, t1, o1, op.name, op.specs.map(x => Object.assign({}, x, { item: O().twinOf(x.item, toSex, has) })).filter(x => wears(x.item)), ws)); s2 = diffSplice(t1, t3); }
        else if (op.kind === 'add') s2 = tw && slotFree() ? O().addItem(pr1, t1, o1, op.name, tw) : [];
        else if (op.kind === 'set' && j >= 0) s2 = tw ? O().setItem(pr1, o1, op.name, j, tw) : O().removeItem(pr1, t1, o1, op.name, j);
        else if (op.kind === 'set') s2 = tw && slotFree() ? O().addItem(pr1, t1, o1, op.name, tw) : [];
        else if (op.kind === 'remove' && j >= 0) s2 = O().removeItem(pr1, t1, o1, op.name, j);
      }
      const t2 = FRE.SourceFile.spliceText(t1, s2);
      let p = 0, q = 0;
      while (p < t.length && p < t2.length && t[p] === t2[p]) p++;
      while (q < t.length - p && q < t2.length - p && t[t.length - 1 - q] === t2[t2.length - 1 - q]) q++;
      return [{ start: p, end: t.length - q, insert: t2.slice(p, t2.length - q) }];
    }, hit ? `${label} (+ ${other} too)` : `${label} (${other}: ${op.kind === 'add' ? 'that slot is already filled' : 'no matching item'}, left as it is)`, 'pvp|eq|preset');
  }

  // the pieces of an armor set by name: …_SUIT_… -> …_HELMET_…, …_GAUNTLET_…, …_BOOTS_… (346 of the 350 suits in defineItem.h)
  const PIECES = ['HELMET', 'SUIT', 'GAUNTLET', 'BOOTS'];
  function setPieces(define, has) {
    const m = /_(HELMET|SUIT|GAUNTLET|BOOTS)(?=_|\d|$)/.exec(define || '');
    if (!m) return [];
    return PIECES.map(p => define.slice(0, m.index) + '_' + p + define.slice(m.index + m[0].length)).filter(has);
  }
  // several items added in turn (each reads the file again) -> one splice
  function addMany(pr0, t, b, name, specs, ws) {
    const D = ws.defines.defines;
    let text = t;
    for (const sp of specs) {
      const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: D, items: ws.items.items });
      const b1 = pr1.byKey.get(`${b.cls}|${b.sex}`);
      text = FRE.SourceFile.spliceText(text, O().addItem(pr1, text, b1, name, sp));
    }
    return diffSplice(t, text);
  }
  function diffSplice(t, t2) {
    let p = 0, q = 0;
    while (p < t.length && p < t2.length && t[p] === t2[p]) p++;
    while (q < t.length - p && q < t2.length - p && t[t.length - 1 - q] === t2[t2.length - 1 - q]) q++;
    return [{ start: p, end: t.length - q, insert: t2.slice(p, t2.length - q) }];
  }

  // the inventory extras are one shared list: an edit is made in every preset. fn(pr1, text, b1, i, it) -> splices for that item
  // (the item of that preset with the same define), or null to leave it. Every preset is read again after each change.
  function everyBag(ws, t, define, fn) {
    const D = ws.defines.defines, read = x => E().readPresets({ name: 'EqualizedPresets.inc', text: x }, { defines: D, items: ws.items.items });
    let text = t;
    const keys = [...read(t).byKey.keys()];
    for (const k of keys) {
      const pr1 = read(text), b1 = pr1.byKey.get(k);
      const items = b1 && b1.sections.BAG ? b1.sections.BAG.items : [];
      const i = items.findIndex(x => (x.define || nameOfId(ws, x.id)) === define);
      if (i < 0) continue;
      const sp = fn(pr1, text, b1, i, items[i]);
      if (sp) text = FRE.SourceFile.spliceText(text, sp);
    }
    return diffSplice(t, text);
  }

  function section(el, ctx, b, name, sim, dis, apply) {
    const pr = eqOf(ctx).presets, sec = b.sections[name], where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()}`;
    const add = (label, mode) => h('button.small', { on: { click: () => itemDialog(ctx, b, name, -1, apply, mode) } }, label);
    // the inventory is long and the same for every class: it folds, shut at first (the user, 2026-10-21: "this is being so huge")
    if (name === 'BAG') {
      const n = sec ? sec.items.length : 0;
      const fold = FRE.ui.section({ title: SEC_LABEL[name], sub: `${n} item${n === 1 ? '' : 's'}, the same for every class · click to open`, key: 'eq-bag', open: false });
      el.appendChild(fold);
      el = fold;
    }
    const title = name === 'BAG' ? null : h('h3', { style: 'margin:0' }, SEC_LABEL[name]);
    el.appendChild(h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px' }, title,
      dis || name !== 'BAG' ? null : h('button.small', { on: { click: () => inventoryDialog(ctx, b, apply) } }, '+ Add items'),
      dis || name !== 'BAG' || !(sec && sec.items.length) ? null : h('button.small', { title: 'Every other preset gets these items with these counts (items it has that this one lacks stay)', on: { click: () => apply(ctx, PRF, t => {
        const ws = ctx.ws, D = ws.defines.defines, read = x => E().readPresets({ name: 'EqualizedPresets.inc', text: x }, { defines: D, items: ws.items.items });
        const specs = sec.items.map(x => O().specOf(x, id => nameOfId(ws, id), v => dstNameOf(ws, v)));
        let text = t;
        for (const k of [...pr.byKey.keys()]) {
          if (k === `${b.cls}|${b.sex}`) continue;
          for (const sp of specs) {
            const pr1 = read(text), b1 = pr1.byKey.get(k), items = b1.sections.BAG ? b1.sections.BAG.items : [];
            const j = items.findIndex(y => (y.define || nameOfId(ws, y.id)) === sp.item);
            text = FRE.SourceFile.spliceText(text, j < 0 ? O().addItem(pr1, text, b1, 'BAG', sp) : O().setItem(pr1, b1, 'BAG', j, sp));
          }
        }
        return diffSplice(t, text);
      }, `Inventory extras: ${where}'s list copied to every preset`, 'pvp|eq|preset') } }, '⇉ Use this list for every class'),
      dis || name === 'BAG' ? null : h('button.small', { title: 'The HP set becomes the Attack set and the other way round', on: { click: () => presetEdit(ctx, apply, b, { kind: 'swap' }, () => swapSplices(b), `${where}: HP and Attack sets swapped`) } }, name === 'HP' ? '⇄ Swap with Attack' : '⇄ Swap with HP')));
    el.appendChild(h('p.muted.small', SEC_HINT[name]));
    if (name !== 'BAG') { slotGrid(el, ctx, b, name, sim, dis, apply); return; }
    if (!sec || !sec.items.length) { el.appendChild(h('p.muted.small', 'Empty.')); return; }
    const tb = h('table.items.up', h('tr', h('th', name === 'BAG' ? '' : 'Slot'), h('th', 'Item'), h('th', 'Details'), h('th', ''), h('th', '')));
    sec.items.forEach((it, i) => {
      const pl = sim.placed.find(p => p.item === it);
      const slot = name === 'BAG' ? '' : pl && pl.why === 'buffPet' ? 'Buff pet' : pl && pl.why === 'raisedPet' ? 'Raised pet' : pl && pl.part !== null && pl.part !== undefined ? partLabel(ctx, pl.part) : '—';
      tb.appendChild(h('tr', h('td.small', slot, pl && pl.why === 'slotTaken' ? h('div.muted.small', 'slot taken: stays in the inventory') : null),
        h('td', itemLabel(ctx.ws, it), h('div.muted.small', it.define || '')), h('td.small', itemSummary(ctx, it)),
        h('td', dis ? null : [it.raisedPet !== undefined ? null : h('button.small', { title: 'Edit this item', on: { click: () => itemDialog(ctx, b, name, i, apply) } }, '✎ Edit'), ' ',
          h('button.small', { title: 'Remove it from every preset', on: { click: () => apply(ctx, PRF, t => everyBag(ctx.ws, t, it.define || nameOfId(ctx.ws, it.id), (pr1, x, b1, k) => O().removeItem(pr1, x, b1, 'BAG', k)),
            `Inventory extras (all presets): ${itemLabel(ctx.ws, it)} removed`, 'pvp|eq|preset') } }, '✕')]),
        h('td', diagTags(FRE.ui.diagsInSpan(ctx.ws, 'EqualizedPresets.inc', it.span.start, it.span.end)))));
    });
    el.appendChild(tb);
  }

  // every slot of a switch set, grouped, always in the same order: what key 9 / key 0 puts on. An empty Attack slot = the HP piece stays.
  const GROUPS = [
    ['Weapon & shield', [['PARTS_RWEAPON', 'Weapon'], ['PARTS_SHIELD,PARTS_LWEAPON', 'Shield / left hand']]],
    ['Armor set', [['PARTS_CAP', 'Helmet'], ['PARTS_UPPER_BODY', 'Suit'], ['PARTS_HAND', 'Gauntlets'], ['PARTS_FOOT', 'Boots']]],
    ['Jewelry', [['PARTS_NECKLACE1', 'Necklace'], ['PARTS_RING1', 'Ring 1'], ['PARTS_RING2', 'Ring 2'], ['PARTS_EARRING1', 'Earring 1'], ['PARTS_EARRING2', 'Earring 2']]],
    ['Fashion, cloak & mask', [['PARTS_HAT', 'Hat'], ['PARTS_CLOTH', 'Clothes'], ['PARTS_GLOVE', 'Gloves'], ['PARTS_BOOTS', 'Shoes'], ['PARTS_CLOAK', 'Cloak'], ['PARTS_MASK', 'Mask']]],
    ['Pets', [['buffPet', 'Buff pet'], ['raisedPet', 'Raised pet']]],
  ];
  // an item's own stats in one line: attack or defense, then its dwDestParam bonuses (the tooltip's PutBaseItemOpt part)
  function statLine(ws, rec) {
    if (!rec) return '';
    const g = f => FRE.specItem.get(rec, f), D = ws.defines.defines, words = FRE.itemTooltip.dstWords(ws), out = [];
    const k2 = g('dwItemKind2'), min = g('dwAbilityMin'), max = g('dwAbilityMax');
    if ((k2 === D.get('IK2_WEAPON_DIRECT') || k2 === D.get('IK2_WEAPON_MAGIC')) && max > 0) out.push(`Attack ${min}-${max}`);
    else if (max > 0 && !S().isNull(max)) out.push(`Defense ${min}-${max}`);
    for (let i = 1; i <= 6; i++) {
      const dst = g('dwDestParam' + i), adj = g('nAdjParamVal' + i);
      if (S().isNull(dst) || !dst) continue;
      const w = words.get(dst);
      out.push(`${w ? (w.word || w.define).replace(/[:\s]+$/, '') : dst} ${adj >= 0 ? '+' : ''}${adj}${w && w.rate ? '%' : ''}`);
    }
    return out.join(' · ');
  }
  // the set bonuses a switch set gives (propItemEtc.inc, CSetItem; FRE.sets.itemAvail): pieces worn per set -> the bonuses reached
  function setEffects(ws, worn) {
    if (!ws.files.has('propitemetc.inc')) return null;
    if (!ws._eqSets) ws._eqSets = FRE.sets.fromWorkspace(ws);
    const words = FRE.itemTooltip.dstWords(ws), count = new Map();
    for (const x of Object.values(worn)) { const st = ws._eqSets.byItem.get(x.rec.id); if (st) count.set(st, (count.get(st) || 0) + 1); }
    return [...count].map(([st, n]) => ({ name: st.name || st.nameKey || `set ${st.id}`, n, of: st.elems.length,
      bonus: FRE.sets.itemAvail(st, n, true).map(([d, a]) => { const w = words.get(d); return `${w ? (w.word || w.define).replace(/[:\s]+$/, '') : d} ${a >= 0 ? '+' : ''}${a}${w && w.rate ? '%' : ''}`; }) }));
  }

  function slotGrid(el, ctx, b, name, sim, dis, apply) {
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets, sec = b.sections[name];
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()}`;
    const items = sec ? sec.items : [];
    // what fills each slot: the placed item of this set (EqPlaceItem), a pet, or (Attack only) the HP piece kept on
    const inSlot = key => {
      if (key === 'buffPet' || key === 'raisedPet') { const pl = sim.placed.find(p => p.sec === name && p.why === key); return pl ? { it: pl.item } : null; }
      const part = D.get(key.split(',')[0]);
      const pl = sim.placed.find(p => p.sec === name && p.why === 'set' && (key.split(',').map(k => D.get(k)).includes(p.part)));
      if (pl) return { it: pl.item };
      if (name === 'ATTACK' && sim.worn[part]) return { same: sim.worn[part] };
      return null;
    };
    const groupBtn = { 'Armor set': () => itemDialog(ctx, b, name, -1, apply, 'set'), Jewelry: () => jewelryDialog(ctx, b, name, apply), 'Fashion, cloak & mask': () => fashionDialog(ctx, b, name, apply) };
    if (!dis) el.appendChild(h('p', h('button', { title: 'The jewelry and the pets of another class or set (each class keeps its own fashion)', on: { click: () => copyDialog(ctx, b, name, apply, ['Jewelry', 'Pets']) } }, '⧉ Copy jewelry & pets from…'),
      h('span.muted.small', ' then pick the weapon, the armor set and this class\'s own fashion')));
    for (const [g, slots] of GROUPS) {
      // each group folds; its header (class · gender · set · group) sticks under the "Editing" bar
      const filled = slots.filter(([key]) => { const x = inSlot(key); return x && x.it; }).length;
      const fold = FRE.ui.section({ title: g, sub: `${where} · ${SEC_SHORT[name]} · ${filled} of ${slots.length} filled`, key: `eq-grp-${g}`, top: 'calc(var(--eq-bar, 48px) - 16px)' });
      const tb = h('table.items.up');
      if (!dis) tb.appendChild(h('tr', h('td', { colspan: 4 },
        groupBtn[g] ? h('button.small', { on: { click: groupBtn[g] } }, g === 'Armor set' ? '+ whole set' : g === 'Jewelry' ? '+ all jewelry' : '+ whole fashion set') : null, ' ',
        h('button.small', { title: `Copy the ${g.toLowerCase()} of another class or set here`, on: { click: () => copyDialog(ctx, b, name, apply, g) } }, '⧉ Copy from…'))));
      for (const [key, label] of slots) {
        const x = inSlot(key), it = x && x.it, i = it ? items.indexOf(it) : -1;
        const slotMode = key === 'buffPet' ? 'pet' : `part:${key.replace(/PARTS_(RING|EARRING)2/, 'PARTS_$11')}`;      // ✎ Edit and + Pick: the same list
        const pick = () => (key === 'raisedPet' ? raisedPetDialog(ctx, b, name, apply) : itemDialog(ctx, b, name, -1, apply, slotMode));
        tb.appendChild(h('tr', h('td.small', { style: 'padding-left:16px' }, label),
          h('td', it ? [itemLabel(ws, it), h('div.small', { style: 'color:#ffeaa1' }, statLine(ws, it.id >= 0 ? ws.itemById(it.id >>> 0) : null)), h('div.muted.small', itemSummary(ctx, it))] : x && x.same ? h('span.muted', `same as HP: ${x.same.rec.name || x.same.rec.define}`) : h('span.muted', 'empty')),
          h('td', dis ? null : it ? [it.raisedPet !== undefined ? null : h('button.small', { on: { click: () => itemDialog(ctx, b, name, i, apply, slotMode) } }, '✎ Edit'), ' ',
            h('button.small', { title: `Move this piece to the ${name === 'HP' ? 'Attack' : 'HP'} set`, on: { click: () => presetEdit(ctx, apply, b, { kind: 'move', name, i }, t => moveSplices(pr, t, b, name, i, ws), `${where}: ${itemLabel(ws, it)} moved to the ${name === 'HP' ? 'Attack' : 'HP'} set`) } }, name === 'HP' ? '→ Attack' : '→ HP'), ' ',
            h('button.small', { title: 'Empty this slot', on: { click: () => presetEdit(ctx, apply, b, { kind: 'remove', name, i }, t => O().removeItem(pr, t, b, name, i), `${where} ${SEC_SHORT[name]}: ${itemLabel(ws, it)} removed`) } }, '✕')]
            : h('button.small', { on: { click: pick } }, '+ Pick')),
          h('td', it ? diagTags(FRE.ui.diagsInSpan(ws, 'EqualizedPresets.inc', it.span.start, it.span.end)) : null)));
      }
      fold.appendChild(tb);
      el.appendChild(fold);
    }
    const se = setEffects(ws, name === 'HP' ? sim.worn : sim.attack);
    if (se) el.appendChild(h('div.small', { style: 'margin:6px 0 4px;padding:6px 10px;border-left:3px solid #01ab19' }, h('b', `Set effects (key ${name === 'HP' ? 9 : 0})`),
      se.length ? se.map(x => h('div', `${x.name} ${x.n}/${x.of}: `, h('span', { style: 'color:#01ab19' }, x.bonus.length ? x.bonus.join(', ') : 'no bonus yet'))) : h('div.muted', 'no set pieces worn')));
    const extra = sim.placed.filter(p => p.sec === name && (p.why === 'slotTaken' || p.why === 'bag'));
    if (extra.length) el.appendChild(h('p.small', h('span.tag.warn', '⚠'), ` Extra pieces: ${extra.map(p => itemLabel(ws, p.item)).join(', ')}. Their slot already has another piece, so they are not worn and the switch skips them (they just sit in the inventory). `,
      dis ? null : h('button.small', { on: { click: () => apply(ctx, PRF, t => {
        let text = t;
        for (const sx of st.same ? [b.sex, 1 - b.sex] : [b.sex]) for (;;) {
          const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: D, items: ws.items.items }), b1 = pr1.byKey.get(`${b.cls}|${sx}`);
          if (!b1) break;
          const s1 = S().enter(b1, { defines: D, items: ws.items.items });
          const x = s1.placed.filter(p => p.sec === name && (p.why === 'slotTaken' || (p.why === 'bag' && p.sec !== 'BAG'))).map(p => b1.sections[name].items.indexOf(p.item)).filter(i => i >= 0);
          if (!x.length) break;
          text = FRE.SourceFile.spliceText(text, O().removeItem(pr1, text, b1, name, Math.max(...x)));
        }
        return diffSplice(t, text);
      }, `${where} ${SEC_SHORT[name]}: extra pieces removed${st.same ? ' (both genders)' : ''}`, 'pvp|eq|preset') } }, 'Remove the extras')));
  }

  // ---------------------------------------------------------------- raised pet: a kind, level S (EqPlaceRaisedPet)
  function raisedPetDialog(ctx, b, name, apply) {
    const pr = eqOf(ctx).presets, where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()} ${SEC_SHORT[name]}`;
    let kind = 'PK_DRAGON';
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' },
      row('Raised pet', [h('select', { on: { change: e => { kind = e.target.value; } } }, PET_KINDS.map(([d, l]) => h('option', { value: d, selected: d === kind }, l)))],
        'Level S, every level (D to S) at the top bonus, full life and energy. It comes out with this switch set.'));
    modal({ title: `Add a raised pet: ${where}`, body, buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => {
      const spec = { raisedPet: kind };
      presetEdit(ctx, apply, b, { kind: 'add', name, spec }, t => O().addItem(pr, t, b, name, spec), `${where}: ${PET_KINDS.find(x => x[0] === kind)[1]} raised pet added`);
      return true;
    } }] });
  }

  // the pieces of a set in some slots (PARTS_ values, or 'buffPet' / 'raisedPet') are taken out, then `specs` go in: a window's slots replace what was there
  function replaceSlots(text, cls, sex, name, parts, specs, ws) {
    const D = ws.defines.defines, read = t => E().readPresets({ name: 'EqualizedPresets.inc', text: t }, { defines: D, items: ws.items.items });
    for (;;) {
      const pr1 = read(text), b1 = pr1.byKey.get(`${cls}|${sex}`);
      if (!b1) return text;
      const sim = S().enter(b1, { defines: D, items: ws.items.items }), sec = b1.sections[name];
      const hit = sim.placed.filter(p => p.sec === name && ((p.part !== null && p.part !== undefined && parts.includes(p.part)) || parts.includes(p.why))).map(p => sec.items.indexOf(p.item)).filter(i => i >= 0);
      if (!hit.length) break;
      text = FRE.SourceFile.spliceText(text, O().removeItem(pr1, text, b1, name, Math.max(...hit)));
    }
    if (!specs.length) return text;
    const pr2 = read(text);
    return FRE.SourceFile.spliceText(text, addMany(pr2, text, pr2.byKey.get(`${cls}|${sex}`), name, specs, ws));
  }
  // what a set has in a slot now (define, upgrade) -> prefill of the windows
  function current(ws, b, name, partName) {
    const D = ws.defines.defines, sim = S().enter(b, { defines: D, items: ws.items.items });
    const pl = sim.placed.find(p => p.sec === name && p.why === 'set' && p.part === D.get(partName));
    return pl ? { item: pl.item.define || nameOfId(ws, pl.item.id), upgrade: pl.item.upgrade } : null;
  }

  // ---------------------------------------------------------------- jewelry: necklace + 2 rings + 2 earrings in one go
  function jewelryDialog(ctx, b, name, apply) {
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets;
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()} ${SEC_SHORT[name]}`;
    const kinds = [['PARTS_NECKLACE1', 'Necklace', 1], ['PARTS_RING1', 'Rings (both slots)', 2], ['PARTS_EARRING1', 'Earrings (both slots)', 2]];
    const pick = kinds.map(([part]) => { const c = current(ws, b, name, part); return c ? { item: c.item, upgrade: c.upgrade } : { item: '', upgrade: 20 }; });
    const start = JSON.stringify(pick);
    const opts = kinds.map(([part]) => itemOptions(ctx, b, name).filter(o => FRE.specItem.get(ws.itemById(D.get(o.v) >>> 0), 'dwParts') === D.get(part)));
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' });
    // one piece picked -> the other pieces of its jewelry set (propItemEtc.inc) fill the empty rows
    const fillFromSet = v => {
      if (!ws.files.has('propitemetc.inc')) return;
      if (!ws._eqSets) ws._eqSets = FRE.sets.fromWorkspace(ws);
      const st = ws._eqSets.byItem.get(D.get(v) >>> 0);
      if (!st) return;
      for (const e of st.elems) {
        const r = ws.itemById(e.id >>> 0), p = r ? FRE.specItem.get(r, 'dwParts') : null;
        const k = kinds.findIndex(([part]) => D.get(part) === p || (part === 'PARTS_RING1' && p === D.get('PARTS_RING2')) || (part === 'PARTS_EARRING1' && p === D.get('PARTS_EARRING2')));
        if (k >= 0 && !pick[k].item && r) pick[k].item = r.define;
      }
    };
    function paintJ() {
      body.textContent = '';
      kinds.forEach(([, label], k) => {
        body.appendChild(row(label, [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: opts[k], value: pick[k].item, placeholder: 'none', onPick: v => { pick[k].item = v; fillFromSet(v); paintJ(); } })),
          pick[k].item ? h('button.small', { on: { click: () => { pick[k].item = ''; paintJ(); } } }, '✕') : null], k === 0 ? 'Pick any piece: the rest of its jewelry set fills in.' : null, true));
        body.appendChild(row(`${label.split(' ')[0]} upgrade`, [h('span', '+'), numInput({ value: pick[k].upgrade, min: 0, max: 20, onCommit: v => { pick[k].upgrade = v || 0; } })], 'max +20'));
      });
    }
    paintJ();
    modal({ title: `Jewelry: ${where}`, body, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => {
      const specs = [];
      kinds.forEach(([, , n], k) => { if (pick[k].item) for (let j = 0; j < n; j++) specs.push({ item: pick[k].item, upgrade: pick[k].upgrade, elem: 0, elemLv: 0, awakes: [], cards: [], count: 1 }); });
      if (JSON.stringify(pick) === start) return true;            // nothing changed
      const parts = ['PARTS_NECKLACE1', 'PARTS_RING1', 'PARTS_RING2', 'PARTS_EARRING1', 'PARTS_EARRING2'].map(x => D.get(x));
      apply(ctx, PRF, t => {
        let text = replaceSlots(t, b.cls, b.sex, name, parts, specs, ws);
        if (st.same) { const has = d => D.has(d) && !!ws.itemById(D.get(d) >>> 0); text = replaceSlots(text, b.cls, 1 - b.sex, name, parts, specs.map(x => Object.assign({}, x, { item: O().twinOf(x.item, 1 - b.sex, has) })), ws); }
        return diffSplice(t, text);
      }, `${where}: jewelry set (${specs.length} piece${specs.length === 1 ? '' : 's'})${st.same ? ` (+ ${E().SEXES[1 - b.sex].toLowerCase()} too)` : ''}`, 'pvp|eq|preset');
      return true;
    } }] });
  }

  // ---------------------------------------------------------------- inventory extras: several items at once, an amount each
  function inventoryDialog(ctx, b, apply) {
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets;
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()}`;
    const rows = [];               // { item, count }
    let all = 1;
    const packOf = d => { const r = ws.itemById(D.get(d) >>> 0); return Math.max(1, r ? FRE.specItem.get(r, 'dwPackMax') || 1 : 1); };
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' });
    // the picker is made once: it keeps the search and stays open while rows are added (picking a row again takes it out)
    const picker = row('Add items', [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: itemOptions(ctx, b, 'BAG', null), value: '', keepOpen: true,
      isPicked: v => rows.some(r => r.item === v), placeholder: 'Premium items, beads, potions, food, scrolls… type, then click as many as you want',
      onPick: v => { const k = rows.findIndex(r => r.item === v); if (k >= 0) rows.splice(k, 1); else rows.push({ item: v, count: Math.min(all, packOf(v)) }); paintI(); } }))],
      'The list stays open: click every item you want (click again to take it out). ✓ = in the list.', true);
    const rest = h('div', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start;flex-basis:100%' });
    body.appendChild(picker); body.appendChild(rest);
    function paintI() {
      const body = rest;
      body.textContent = '';
      body.appendChild(row('Count for all', [numInput({ value: all, min: 1, max: 32767, onCommit: v => { all = v || 1; } }),
        h('button.small', { on: { click: () => { rows.forEach(r => { r.count = Math.min(all, packOf(r.item)); }); paintI(); } } }, 'Set all')], 'Each item is capped at its stack size.'));
      if (!rows.length) body.appendChild(h('p.muted.small', { style: 'flex-basis:100%' }, 'No item picked yet.'));
      rows.forEach((r, k) => body.appendChild(row(itemLabel(ws, { id: D.get(r.item), define: r.item }), [numInput({ value: r.count, min: 1, max: packOf(r.item), onCommit: v => { r.count = v || 1; } }),
        h('span.muted.small', `of ${fmt(packOf(r.item))}`), h('button.small', { title: 'Take it out of the list', on: { click: () => { rows.splice(k, 1); paintI(); } } }, '✕')], null, true)));
    }
    paintI();
    modal({ title: 'Add items to the inventory (every class, male and female)', body, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => {
      if (!rows.length) { toast('Pick at least one item', 'bad'); return false; }
      const specs = rows.map(r => ({ item: r.item, upgrade: 0, elem: 0, elemLv: 0, awakes: [], cards: [], count: r.count }));
      const label = `Inventory extras (all presets): ${specs.length} item${specs.length === 1 ? '' : 's'} added`;
      apply(ctx, PRF, t => {
        let text = t;
        for (const k of [...pr.byKey.keys()]) {
          const pr1 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: D, items: ws.items.items });
          const b1 = pr1.byKey.get(k);
          if (!b1) continue;
          const have = new Set((b1.sections.BAG ? b1.sections.BAG.items : []).map(x => x.define || nameOfId(ws, x.id)));
          const add = specs.filter(x => !have.has(x.item));
          if (add.length) text = FRE.SourceFile.spliceText(text, addMany(pr1, text, b1, 'BAG', add, ws));
          for (const x of specs.filter(x => have.has(x.item))) {    // already there: the new count
            const pr2 = E().readPresets({ name: 'EqualizedPresets.inc', text }, { defines: D, items: ws.items.items }), b2 = pr2.byKey.get(k);
            const j = b2.sections.BAG.items.findIndex(y => (y.define || nameOfId(ws, y.id)) === x.item);
            text = FRE.SourceFile.spliceText(text, O().setItem(pr2, b2, 'BAG', j, Object.assign(O().specOf(b2.sections.BAG.items[j], id => nameOfId(ws, id), v => dstNameOf(ws, v)), { count: x.count })));
          }
        }
        return diffSplice(t, text);
      }, label, 'pvp|eq|preset');
      return true;
    } }] });
  }

  // ---------------------------------------------------------------- Copy from: one group of slots (jewelry, armor, …) from another preset
  // the slots of a group as PARTS_ values (Shield / left hand = both)
  const groupParts = (D, g) => GROUPS.find(x => x[0] === g)[1].flatMap(([k]) => k.split(',')).map(k => (k.startsWith('PARTS_') ? D.get(k) : k));
  const pieceName = (ws, spec) => { if (spec.raisedPet) { const k = PET_KINDS.find(x => x[0] === spec.raisedPet); return `${k ? k[1] : spec.raisedPet} raised pet`; }
    const D = ws.defines.defines, r = D.has(spec.item) ? ws.itemById(D.get(spec.item) >>> 0) : null; return r ? r.name || r.define : spec.item; };
  const slotName = (ctx, p) => (p === 'buffPet' ? 'Buff pet' : p === 'raisedPet' ? 'Raised pet' : partLabel(ctx, p));
  const specText = sp => [sp.upgrade ? `+${sp.upgrade}` : '', sp.elem && sp.elemLv ? `${E().ELEMENTS[sp.elem - 1]} +${sp.elemLv}` : '',
    ...sp.awakes.map(a => `${a.dst} ${a.adj >= 0 ? '+' : ''}${a.adj}`), sp.cards.length ? `${sp.cards.length} card${sp.cards.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const copyEnv = ws => { const D = ws.defines.defines; return { defines: D, items: ws.items.items, nameOf: id => nameOfId(ws, id), dstOf: v => dstNameOf(ws, v), has: d => D.has(d) && !!ws.itemById(D.get(d) >>> 0) }; };
  // a short name for some pieces: their shared first words + "set" (Champion's Ring, Champion's Gore Necklace -> "Champion set"), else the names
  function setName(names) {
    const ws0 = [...new Set(names.map(n => n.replace(/\s*\((M|F)\)\s*$/, '')))];
    if (ws0.length < 2) return ws0.join('');
    const w = ws0.map(n => n.split(/\s+/));
    let k = 0;
    while (w.every(x => x.length > k + 1 && x[k] === w[0][k])) k++;
    return k ? `${w[0].slice(0, k).join(' ').replace(/'s$/, '')} set` : ws0.join(', ');
  }
  // every other switch set with something in these slots -> combo options (v = "cls|sex|SECTION"); groups: lists of slots, one summary each
  function copySources(ctx, b, name, groups) {
    const ws = ctx.ws, env = copyEnv(ws), out = [];
    for (const pb of eqOf(ctx).presets.byKey.values()) for (const sec of ['HP', 'ATTACK']) {
      if (pb === b && sec === name) continue;
      const parts = groups.flat(), got = O().copyPieces(pb, sec, parts, b.cls, b.sex, env);
      if (!got.length) continue;
      const sum = groups.map(g => setName(got.filter(x => g.includes(x.part)).map(x => pieceName(ws, x.spec)))).filter(Boolean);
      const who = `${E().CLASSES[pb.cls].label} ${E().SEXES[pb.sex].toLowerCase()} ${SEC_SHORT[sec]}`;
      out.push({ v: `${pb.cls}|${pb.sex}|${sec}`, label: `${who}: ${sum.join(' · ')}`, find: `${who} ${got.map(x => pieceName(ws, x.spec)).join(' ')}` });
    }
    return out;
  }
  // g: one group name or several ([..] = one window for all of them)
  function copyDialog(ctx, b, name, apply, g) {
    const gs = [].concat(g), what = gs.length > 1 ? `${gs.slice(0, -1).join(', ')} & ${gs[gs.length - 1]}`.toLowerCase().replace('fashion, cloak & mask', 'fashion') : gs[0].toLowerCase();
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets, env = copyEnv(ws), parts = gs.flatMap(x => groupParts(D, x));
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()} ${SEC_SHORT[name]}`;
    const srcs = copySources(ctx, b, name, gs.flatMap(x => (x === 'Fashion, cloak & mask' ? [groupParts(D, x).slice(0, 4), [groupParts(D, x)[4]], [groupParts(D, x)[5]]] : x === 'Pets' ? groupParts(D, x).map(p => [p]) : [groupParts(D, x)])));
    let from = '', all = false;
    const srcOf = v => { const [c, x, sec] = v.split('|'); return { blk: pr.byKey.get(`${c}|${x}`), sec }; };
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' });
    const preview = h('div', { style: 'flex-basis:100%' });
    function paintC() {
      preview.textContent = '';
      if (!from) { preview.appendChild(h('p.muted.small', srcs.length ? 'Pick a set to copy from.' : `No other preset has any ${what} yet.`)); return; }
      const s = srcOf(from), got = O().copyPieces(s.blk, s.sec, parts, b.cls, b.sex, env);
      const tb = h('table.items.up', h('tr', h('th', 'Slot'), h('th', 'Piece'), h('th', '')));
      for (const p of parts) {
        const x = got.find(y => y.part === p);
        tb.appendChild(h('tr', h('td.small', slotName(ctx, p)), h('td', x ? [pieceName(ws, x.spec), h('div.muted.small', specText(x.spec))] : h('span.muted', 'empty there: this slot is emptied')),
          h('td.small', x && x.issues.length ? [h('span.tag.warn', '⚠'), ` not copied: ${x.issues.join(', ')}; ${x.issues.some(w => !/male item/.test(w)) ? 'this slot keeps its piece' : 'this slot stays empty'}`] : null)));
      }
      preview.appendChild(tb);
    }
    body.appendChild(row('Copy from', [h('div', { style: 'flex:1;min-width:420px' }, FRE.ui.combo({ options: srcs, value: from, placeholder: 'Pick a class and set…', onPick: v => { from = v; paintC(); } }))],
      'Upgrades, elements, awakes and cards come too. Each gender gets its own version (_M_ / _F_).', true));
    body.appendChild(preview);
    body.appendChild(row('Who gets it', [h('label', h('input', { type: 'checkbox', checked: all, on: { change: e => { all = e.target.checked; } } }), ' Put it in every preset (all classes, male and female)')],
      `Off: only ${where}${st.same ? ' and the other gender' : ''}. Fashion, cloak and mask only ever go to ${where}. A piece a class can't wear is skipped there.`, true));
    paintC();
    modal({ title: `Copy ${what}: ${where}`, body, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => {
      if (!from) { toast('Pick a set to copy from', 'bad'); return false; }
      const s = srcOf(from), targets = all ? [...pr.byKey.values()] : st.same ? [b, { cls: b.cls, sex: 1 - b.sex }] : [b];
      let skipped = 0;
      apply(ctx, PRF, t => {
        let text = t;
        for (const tb of targets) {
          if (tb.cls === s.blk.cls && tb.sex === s.blk.sex && name === s.sec) continue;      // the set copied from stays as it is
          const fp = FASHION_PARTS.map(x => D.get(x)), parts1 = tb === b ? parts : parts.filter(p => !fp.includes(p));     // fashion: this preset only
          const got = O().copyPieces(s.blk, s.sec, parts1, tb.cls, tb.sex, env), bad = got.filter(x => x.issues.length);
          skipped += bad.length;
          // no version for this gender: that slot is emptied; another class's piece (job, level): that slot keeps what it has
          const keep = new Set(bad.filter(x => x.issues.some(w => !/male item/.test(w))).map(x => x.part));
          text = replaceSlots(text, tb.cls, tb.sex, name, parts1.filter(p => !keep.has(p)), got.filter(x => !x.issues.length).map(x => x.spec), ws);
        }
        return diffSplice(t, text);
      }, `${all ? 'Every preset' : where}: ${what} copied from ${srcs.find(o => o.v === from).label.split(':')[0]}`, 'pvp|eq|preset');
      if (skipped) toast(`${skipped} piece${skipped === 1 ? '' : 's'} not copied: a class or gender can't wear ${skipped === 1 ? 'it' : 'them'} (no gender version: slot emptied; another class: slot kept)`, 'warn');
      return true;
    } }] });
  }

  // ---------------------------------------------------------------- fashion: a fashion set (hat, clothes, gloves, shoes), cloak, mask
  const DEFAULT_CLOAK = 'II_ARM_S_CLO_CLO_SPIRIT', DEFAULT_MASK = 'II_ARM_S_CLO_MAS_MASKENDRED';     // Cloak of Bravery, Hipster Glasses (Red)
  function fashionDialog(ctx, b, name, apply) {
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets, has = d => D.has(d) && !!ws.itemById(D.get(d) >>> 0);
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()} ${SEC_SHORT[name]}`;
    const kinds = [['PARTS_HAT', 'Hat'], ['PARTS_CLOTH', 'Clothes'], ['PARTS_GLOVE', 'Gloves'], ['PARTS_BOOTS', 'Shoes'], ['PARTS_CLOAK', 'Cloak'], ['PARTS_MASK', 'Mask']];
    const pick = kinds.map(([part]) => { const c = current(ws, b, name, part); return c ? c.item : ''; });
    const start = pick.slice();
    const all = false;                // fashion is per class and gender (user, 2026-10-21): this preset only
    const opts = kinds.map(([part]) => itemOptions(ctx, b, name).filter(o => FRE.specItem.get(ws.itemById(D.get(o.v) >>> 0), 'dwParts') === D.get(part)));
    // an empty cloak / mask starts as the Cloak of Bravery / Hipster Glasses (Red); still a choice like any other
    if (!pick[4] && opts[4].some(o => o.v === DEFAULT_CLOAK)) pick[4] = DEFAULT_CLOAK;
    if (!pick[5] && opts[5].some(o => o.v === DEFAULT_MASK)) pick[5] = DEFAULT_MASK;
    // the fashion sets this class + gender can wear: one line per set, its name from the clothes (else the first piece)
    const fparts = kinds.slice(0, 4).map(([p]) => D.get(p));
    const sets = O().fashionSets(opts.slice(0, 4).flatMap((os, k) => os.map(o => ({ define: o.v, part: fparts[k] }))), fparts);
    const nameOfDef = d => { const r = ws.itemById(D.get(d) >>> 0); return r ? r.name || d : d; };
    const setOpts = sets.map(s => {
      const ds = fparts.map(p => s.pieces[p]).filter(Boolean), main = s.pieces[fparts[1]] || ds[0];
      return { v: s.base, label: `${setName(ds.map(nameOfDef)) || nameOfDef(main)} (${ds.length} piece${ds.length === 1 ? '' : 's'})`, find: `${s.base} ${ds.map(nameOfDef).join(' ').replace(/\s+/g, '')}` };
    });
    const setNow = () => { const ds = pick.slice(0, 4).filter(Boolean), base = ds.length ? O().fashionBase(ds[0]) : ''; return base && ds.every(d => O().fashionBase(d) === base) ? base : ''; };
    const copySrc = copySources(ctx, b, name, [kinds.slice(0, 4).map(([p]) => D.get(p)), [D.get('PARTS_CLOAK')], [D.get('PARTS_MASK')]]);
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' });
    function paintF() {
      body.textContent = '';
      body.appendChild(row('Copy from another class (optional)', [h('div', { style: 'flex:1;min-width:420px' }, FRE.ui.combo({ options: copySrc, value: '', placeholder: copySrc.length ? 'Pick a class and set…' : 'no other preset has fashion yet', onPick: v => {
        const [c, x, sec] = v.split('|'), got = O().copyPieces(pr.byKey.get(`${c}|${x}`), sec, kinds.map(([p]) => D.get(p)), b.cls, b.sex, copyEnv(ws));
        kinds.forEach(([p], k) => { const y = got.find(z => z.part === D.get(p) && !z.issues.length); pick[k] = y ? y.spec.item : ''; });
        paintF();
      } }))], 'Fills every slot below with what that set wears.', true));
      body.appendChild(row('Fashion set', [h('div', { style: 'flex:1;min-width:420px' }, FRE.ui.combo({ options: setOpts, value: setNow(), placeholder: 'none', onPick: v => {
        const s = sets.find(x => x.base === v);
        fparts.forEach((p, k) => { pick[k] = s.pieces[p] || ''; });
        paintF();
      } })), pick.slice(0, 4).some(Boolean) ? h('button.small', { title: 'No fashion set', on: { click: () => { for (let k = 0; k < 4; k++) pick[k] = ''; paintF(); } } }, '✕') : null],
        h('span', kinds.slice(0, 4).map(([, label], k) => h('div', `${label}: `, pick[k] ? nameOfDef(pick[k]) : h('span.muted', 'none')))), true));
      kinds.slice(4).forEach(([, label], j) => { const k = j + 4; body.appendChild(row(label, [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: opts[k], value: pick[k], placeholder: 'none', onPick: v => { pick[k] = v; paintF(); } })),
        pick[k] ? h('button.small', { title: 'Leave this slot empty', on: { click: () => { pick[k] = ''; paintF(); } } }, '✕') : null], null, true)); });
      body.appendChild(h('p.muted.small', { style: 'flex-basis:100%' }, `Only ${where} changes: each class and gender picks its own fashion. Shows what this set wears now; a change here replaces that piece. An empty cloak / mask starts as the Cloak of Bravery / Hipster Glasses (Red). One piece only: ✎ / + Pick on its row.`));
    }
    paintF();
    modal({ title: `Fashion, cloak & mask: ${where}`, body, wide: true, buttons: [{ label: 'Cancel' }, { label: 'Apply changes', cls: 'primary', onClick: () => {
      const changed = kinds.map((k, j) => j).filter(j => pick[j] !== start[j] || (all && pick[j]));
      if (!changed.length) return true;
      const parts = changed.map(j => D.get(kinds[j][0])), items = changed.map(j => pick[j]).filter(Boolean);
      const targets = [b];      // fashion is per class and gender: never another preset
      // a piece with no version for that class / gender (a male-only set on a female preset): that preset keeps its own piece
      let skipped = 0;
      apply(ctx, PRF, t => {
        let text = t;
        for (const tb of targets) {
          const specs = [];
          changed.forEach(j => {
            if (!pick[j]) return;
            const d = O().twinOf(pick[j], tb.sex, has), rec = ws.itemById(D.get(d) >>> 0);
            if (!rec || S().wearIssues(rec, tb.cls, tb.sex, D).length) { skipped++; return; }       // no version for this gender: the slot stays empty
            specs.push({ item: d, upgrade: 0, elem: 0, elemLv: 0, awakes: [], cards: [], count: 1 });
          });
          text = replaceSlots(text, tb.cls, tb.sex, name, parts, specs, ws);
        }
        return diffSplice(t, text);
      }, `${all ? 'Every preset' : where}: fashion, cloak & mask set (${items.length} piece${items.length === 1 ? '' : 's'})`, 'pvp|eq|preset');
      if (skipped) toast(`${skipped} piece${skipped === 1 ? '' : 's'} left out: no version for that gender (those slots stay empty)`, 'warn');
      return true;
    } }] });
  }

  // ---------------------------------------------------------------- Edit item
  // our weapon tiers (WEAPON_EFFECTS_REVISED.md, SERVER CHANGES/01): HP Vampire / Angel / Bloody / Ancient, ATK Lusaka / Legendary Golden /
  // Lusaka Crystal / Mystic (ENTANESSUM), Mastercraft (ROYALUM); the Ultimate (UM) versions only, no Baruna (user, 2026-10-21)
  const TIER_BASE = /^II_WEA_[A-Z]+_(VEMPIRE|ANGEL|BLOODY|ANCIENT|LUZA|LUZAM|LEAGENDG)$/;     // a tier weapon's plain (Unique) version: + UM = its Ultimate
  const TIER_WEAPON = /^II_WEA_[A-Z]+_((VEMPIRE|ANGEL|BLOODY|ANCIENT|LUZA|LUZAM|LEAGENDG)UM|ENTANESSUM|ROYALUM)$/;
  // a Baruna weapon: ItemProp::IsBaruna (ProjectCmn.h:581), dwReferStat1 BARUNA_D..BARUNA_S (the BEHE… line, Soul Sword, …)
  const isBaruna = (ws, rec) => { const D = ws.defines.defines, r = rec ? FRE.specItem.get(rec, 'dwReferStat1') : null; return r !== null && r >= D.get('BARUNA_D') && r <= D.get('BARUNA_S'); };
  // a Baruna weapon: only those can be made Ultimate (runes, jewels); Baruna armor is Baruna grade too
  const barunaWeapon = (ws, rec) => isBaruna(ws, rec) && FRE.specItem.get(rec, 'dwItemKind1') === ws.defines.defines.get('IK1_WEAPON');
  const GEAR_PARTS = ['PARTS_RWEAPON', 'PARTS_LWEAPON', 'PARTS_SHIELD', 'PARTS_CAP', 'PARTS_UPPER_BODY', 'PARTS_HAND', 'PARTS_FOOT'];
  // a piece with at least one bonus stat (dwDestParam1-6) or a piece of a set with bonuses (propItemEtc.inc: the Lv120+ armor
  // has its stats there only); look-only weapons and costumes have neither
  const hasBonus = (ws, rec) => {
    if (!rec) return false;
    for (let i = 1; i <= 6; i++) { const d = FRE.specItem.get(rec, 'dwDestParam' + i); if (d && !S().isNull(d)) return true; }
    if (!ws.files.has('propitemetc.inc')) return false;
    if (!ws._eqSets) ws._eqSets = FRE.sets.fromWorkspace(ws);
    const st = ws._eqSets.byItem.get(rec.id);
    return !!st && FRE.sets.itemAvail(st, st.elems.length, true).length > 0;
  };
  const withStats = (ws, o) => {
    const rec = ws.itemById(ws.defines.defines.get(o.v) >>> 0), st = rec && ws._eqSets ? ws._eqSets.byItem.get(rec.id) : null;
    const s = [statLine(ws, rec), st ? `set bonus: ${st.name || st.nameKey || `set ${st.id}`}` : ''].filter(Boolean).join(' · ');
    return s ? Object.assign({}, o, { label: `${o.label} — ${s}` }) : o;
  };
  const isBuffPet = (rec, D) => FRE.specItem.get(rec, 'dwItemKind3') === D.get('IK3_PET') && FRE.specItem.get(rec, 'dwReferStat1') === D.get('PET_VIS');
  function itemOptions(ctx, b, name, mode) {
    const ws = ctx.ws, D = ws.defines.defines, key = `_eqOpts|${mode === 'pet' ? 'pet' : name === 'BAG' ? 'bag' : `${b.cls}|${b.sex}`}`;
    if (mode && mode.startsWith('part:')) {            // one slot of the switch-set grid: only pieces for that slot
      const want = mode.slice(5).split(',').map(x => D.get(x));
      // Slayer's left hand: a 2nd one-handed weapon too (EqPlaceItem moves it there; MoverEquip.cpp:528)
      const dual = b.cls === 0 && want.includes(D.get('PARTS_LWEAPON'));
      const fits = itemOptions(ctx, b, name, null).filter(o => { const r = ws.itemById(D.get(o.v) >>> 0), p = FRE.specItem.get(r, 'dwParts');
        return want.includes(p) || (dual && p === D.get('PARTS_RWEAPON') && FRE.specItem.get(r, 'dwHanded') === D.get('HD_ONE') && r.define !== 'II_WEA_KNU_ISHOFIST'); });
      // the weapon row: our weapon tiers only; armor rows: the Lv120-130 sets only; the shield / left hand row lists every one. Each line with its stats
      if (!want.some(p => GEAR_PARTS.map(x => D.get(x)).includes(p))) return fits;
      if (want.includes(D.get('PARTS_SHIELD'))) return fits.map(o => withStats(ws, o));
      if (want.includes(D.get('PARTS_RWEAPON'))) return fits.filter(o => TIER_WEAPON.test(o.v) || isBaruna(ws, ws.itemById(D.get(o.v) >>> 0))).map(o => withStats(ws, o));
      return fits.filter(o => { const r = ws.itemById(D.get(o.v) >>> 0), lv = FRE.specItem.get(r, 'dwLimitLevel1'); return lv >= 120 && lv <= 130 && hasBonus(ws, r); }).map(o => withStats(ws, o));
    }
    if (mode === 'set') {                              // "Add a set": one line per armor set (its suit), level 120-130 sets only
      const suit = D.get('PARTS_UPPER_BODY');
      return itemOptions(ctx, b, name, null).filter(o => { const r = ws.itemById(D.get(o.v) >>> 0), lv = FRE.specItem.get(r, 'dwLimitLevel1');
        return FRE.specItem.get(r, 'dwParts') === suit && lv >= 120 && lv <= 130 && hasBonus(ws, r); }).map(o => withStats(ws, o));
    }
    if (ws[key]) return ws[key];
    const out = [];
    for (const rec of ws.items.items.values()) {
      if (mode === 'pet') { if (!isBuffPet(rec, D)) continue; }
      else if (name === 'BAG') {                          // Inventory = the extras only: no gear (it goes in the switch slots), no pets
        if (!S().isNull(FRE.specItem.get(rec, 'dwParts'))) continue;
        const k3 = FRE.specItem.get(rec, 'dwItemKind3');
        if (k3 === D.get('IK3_PET') || k3 === D.get('IK3_EGG')) continue;
      }
      else {
        if (S().isNull(FRE.specItem.get(rec, 'dwParts'))) continue;
        if (S().wearIssues(rec, b.cls, b.sex, D).length) continue;
      }
      const info = ws.itemInfo(rec);
      out.push({ v: rec.define, label: `${info.name} (${rec.define})`, find: `${rec.define} ${(info.name || '').replace(/\s+/g, '')}` });
    }
    out.sort((a, z) => a.label.localeCompare(z.label));
    return (ws[key] = out);
  }
  function cardOptions(ctx, kind3) {
    const ws = ctx.ws, key = `_eqCards|${kind3}`;
    if (ws[key]) return ws[key];
    const out = [];
    for (const rec of ws.items.items.values()) if (FRE.specItem.get(rec, 'dwItemKind3') === kind3) out.push({ v: rec.define, label: `${rec.name || rec.define} (${rec.define})`, find: `${rec.define} ${(rec.name || '').replace(/\s+/g, '')}` });
    out.sort((a, z) => a.label.localeCompare(z.label));
    return (ws[key] = out);
  }
  function dstOptions(ctx) {
    const words = FRE.itemTooltip.dstWords(ctx.ws), out = [];
    for (const [v, w] of words) out.push({ v: w.define, label: `${(w.word || '').replace(/[:\s]+$/, '') || w.define}${w.rate ? ' (%)' : ''} — ${w.define}`, find: `${w.word} ${w.define}`, n: v });
    return out.sort((a, z) => a.label.localeCompare(z.label));
  }

  // one form field: a label above, the controls, a grey hint under. Short fields sit side by side; wide = a whole row (pickers).
  const row = (label, fields, hint, wide = false) => h('div', { style: `display:flex;flex-direction:column;gap:4px;margin:0 22px 12px 0;${wide ? 'flex-basis:100%' : ''}` },
    h('b.small', label), h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, fields), hint ? h('div.muted.small', hint) : null);

  // the most a piece takes: jewelry +20; weapons, shields, armor +10 and an element (0-20); fashion, cloak, mask, pets nothing
  function limitsOf(ws, rec) {
    if (!rec) return { up: 10, elem: true };
    const D = ws.defines.defines, p = FRE.specItem.get(rec, 'dwParts');
    const is = (...n) => n.some(x => D.get(x) === p);
    if (is('PARTS_NECKLACE1', 'PARTS_RING1', 'PARTS_RING2', 'PARTS_EARRING1', 'PARTS_EARRING2')) return { up: 20, elem: false };
    // an element only on a suit or a weapon (CItemElem::IsEleRefineryAble, Item.cpp:403)
    if (FRE.equalizedSim.elementOk(rec, D)) return { up: 10, elem: true };
    if (is('PARTS_SHIELD', 'PARTS_CAP', 'PARTS_HAND', 'PARTS_FOOT')) return { up: 10, elem: false };
    return { up: 0, elem: false };
  }

  // ---------------------------------------------------------------- Ultimate Baruna, runes, jewels (V19 feat/eq-baruna-runes)
  // the stat runes (IK3_BARUNAWEA_PIERCE_RUNE) and the jewels (Ultimate_GemAbility.txt ability items), each with what it gives
  function runeOptions(ctx) {
    const ws = ctx.ws, D = ws.defines.defines;
    if (ws._eqRunes) return ws._eqRunes;
    const out = [];
    for (const rec of ws.items.items.values()) if (FRE.specItem.get(rec, 'dwItemKind3') === D.get('IK3_BARUNAWEA_PIERCE_RUNE')) {
      const s = statLine(ws, rec);
      out.push({ v: rec.define, label: `${rec.name || rec.define} — ${s || 'no stat'}`, find: `${rec.define} ${rec.name || ''}` });
    }
    return (ws._eqRunes = out.sort((a, z) => a.label.localeCompare(z.label)));
  }
  function jewelOptions(ctx) {
    const ws = ctx.ws, gems = eqOf(ctx).gems;
    if (ws._eqJewels) return ws._eqJewels;
    const words = FRE.itemTooltip.dstWords(ws), out = [];
    for (const ab of gems ? gems.abilities : []) for (const g of ab.gems) {
      const r = ws.itemById(g.item), w = words.get(ab.dst), gem = ws.itemById(g.gem);
      const stat = w ? (w.word || w.define).replace(/[:\s]+$/, '') : String(ab.dst);
      out.push({ v: r ? r.define : String(g.item), label: `${gem ? gem.name || gem.define : g.gem}: ${stat} (${g.values.join(' / ')} for 1-5 of it)`, find: `${r ? r.define : ''} ${stat}` });
    }
    return (ws._eqJewels = out);
  }
  // the rows of the item window for a Baruna weapon (Ultimate + 3 runes) or an Ultimate weapon (5 jewels), and what they give
  function ultimateRows(ctx, body, spec, rec, paint) {
    const ws = ctx.ws, D = ws.defines.defines, bar = barunaWeapon(ws, rec);
    const jew = bar ? spec.ultimate : !!rec && FRE.specItem.get(rec, 'dwReferStat1') === D.get('WEAPON_ULTIMATE');
    if (!bar && !jew) return;
    // what it gives: the simulator on the picks (ultimateParts); redrawn in place while the rune list stays open
    let gameLine = null;
    const inGame = () => {
      const up = spec.upgrade > 0 ? spec.upgrade : 0;
      const item = { id: rec.id, upgrade: up, ultimate: !!spec.ultimate, runes: spec.runes.filter(Boolean).map(d => D.get(d)), jewels: spec.jewels.filter(Boolean).map(d => D.get(d)) };
      const u = S().ultimateParts(item, rec, D, ws.items.items, eqOf(ctx).gems), words = FRE.itemTooltip.dstWords(ws);
      const js = Object.entries(u.jewelStats).map(([d, v]) => { const w = words.get(Number(d)); return `${w ? (w.word || w.define).replace(/[:\s]+$/, '') : d} +${v}${w && w.rate ? '%' : ''}`; });
      const rn = u.runes.map(id => { const r = ws.itemById(id >>> 0); return r ? `${r.name}${statLine(ws, r) ? ` (${statLine(ws, r)})` : ''}` : id; });
      return h('div.small', { style: 'flex-basis:100%;margin:0 0 12px;padding:6px 10px;border-left:3px solid #01ab19' }, h('b', 'In game: '),
        [u.ult ? 'Ultimate Baruna' : null, rn.length ? `runes ${rn.join(', ')}` : null, js.length ? `jewels ${js.join(', ')} (${u.activeJewels} of ${u.jewels.length} count)` : null].filter(Boolean).join(' · ') || 'nothing yet',
        u.skipped.length ? h('div', { style: 'color:#e6a23c' }, `⚠ not given: ${u.skipped.map(x => { const r = ws.itemById(x.id >>> 0); return `${r ? r.name : x.id} (${{ sameStat: 'one rune per stat', closed: 'slot not open yet', notRune: 'not a weapon rune', notJewel: 'not a jewel', needsUltimate: 'needs Ultimate', needsUltimateWeapon: 'needs an Ultimate weapon', notBaruna: 'not Baruna' }[x.why]})`; }).join(', ')}`) : null);
    };
    const up = spec.upgrade > 0 ? spec.upgrade : 0;
    const runeStat = d => FRE.specItem.get(ws.itemById(D.get(d) >>> 0), 'dwDestParam1');     // one rune per stat (same dwDestParam1)
    if (bar) body.appendChild(row('Ultimate Baruna', [h('label', h('input', { type: 'checkbox', checked: !!spec.ultimate, on: { change: e => { spec.ultimate = e.target.checked; paint(); } } }), ' Made Ultimate (Udi)')],
      'Attack x1.6 and its own stats +8% (not attack speed); 3 rune slots and the jewel slots open.', true));
    // the runes: one list, click several (click again to take one out); one per stat, as many as the level opens (1 at +0, 2 at +5, 3 at +10)
    if (bar && spec.ultimate) {
      const open = 1 + (up >= 5 ? 1 : 0) + (up >= 10 ? 1 : 0), picked = () => spec.runes.filter(Boolean);
      const runeRow = row(`Runes (${picked().length} of ${open})`, [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: runeOptions(ctx), value: '', keepOpen: true,
        isPicked: v => spec.runes.includes(v), placeholder: picked().length ? picked().map(d => (ws.itemById(D.get(d) >>> 0) || {}).name || d).join(', ') : 'Pick the runes…',
        onPick: v => {
          const k = spec.runes.indexOf(v);
          if (k >= 0) spec.runes[k] = '';
          else if (picked().some(x => runeStat(x) === runeStat(v))) { toast('One rune per stat: that stat is already picked', 'bad'); return; }
          else if (picked().length >= open) { toast(`+${up} opens ${open} rune slot${open === 1 ? '' : 's'} (2 at +5, 3 at +10)`, 'bad'); return; }
          else spec.runes[spec.runes.indexOf('')] = v;
          spec.runes.sort((a, z) => (!a) - (!z));
          runeRow.firstChild.textContent = `Runes (${picked().length} of ${open})`;
          const g = inGame(); gameLine.replaceWith(g); gameLine = g;
        } })),
        picked().length ? h('button.small', { title: 'No runes', on: { click: () => { spec.runes.fill(''); paint(); } } }, '✕') : null],
        `Click every rune you want (✓ = picked, click again to take it out). One per stat (Attack, Skill, Critical); +${up} opens ${open} slot${open === 1 ? '' : 's'} (2 at +5, 3 at +10).`, true);
      body.appendChild(runeRow);
    }
    // one jewel in all 5 slots (the usual: "all PvP Damage"); "different jewels…" opens one picker per slot
    const mixedJ = st.mixJewels || new Set(spec.jewels.filter(Boolean)).size > 1 || (spec.jewels.some(Boolean) && spec.jewels.some(j => !j));
    if (jew && !mixedJ) body.appendChild(row('Jewel (all 5 slots)', [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: jewelOptions(ctx), value: spec.jewels[0], placeholder: 'no jewels', onPick: v => { spec.jewels.fill(v); paint(); } })),
      spec.jewels[0] ? h('button.small', { title: 'No jewels', on: { click: () => { spec.jewels.fill(''); paint(); } } }, '✕') : null,
      h('button.small', { title: 'Pick a different jewel for each slot', on: { click: () => { st.mixJewels = true; paint(); } } }, 'different jewels…')],
      bar && up < 10 ? `Only ${Math.max(0, up - 5)} of the 5 count at +${up} (+6 = 1 .. +10 = 5).` : 'The same jewel 5 times gives the most (the values are for 1-5 of it).', true));
    if (jew && mixedJ) spec.jewels.forEach((j, k) => {
      const counts = !bar || up - 5 > k;
      body.appendChild(row(`Jewel ${k + 1}`, [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: jewelOptions(ctx), value: j, placeholder: 'no jewel', onPick: v => { spec.jewels[k] = v; paint(); } })),
        j ? h('button.small', { title: 'No jewel here', on: { click: () => { spec.jewels[k] = ''; paint(); } } }, '✕') : null, k === 0 && j ? h('button.small', { title: 'This jewel in all 5 slots', on: { click: () => { spec.jewels.fill(j); st.mixJewels = false; paint(); } } }, 'same in all 5') : null,
        counts ? null : h('span.muted.small', `counts from +${k + 6}`)], null, true));
    });
    body.appendChild(gameLine = inGame());
  }

  // the saved item stays in its own list even when the list no longer offers it (a plain weapon saved before only Ultimates were listed)
  const withCurrent = (ws, opts, d) => (!d || opts.some(o => o.v === d) ? opts : [{ v: d, label: `${(ws.itemById(ws.defines.defines.get(d) >>> 0) || {}).name || d} (${d}) — now`, find: d }, ...opts]);
  function itemDialog(ctx, b, name, i, apply, mode = null) {
    const ws = ctx.ws, D = ws.defines.defines, pr = eqOf(ctx).presets;
    const it = i >= 0 ? b.sections[name].items[i] : null;
    const spec = it ? O().specOf(it, id => nameOfId(ws, id), v => dstNameOf(ws, v)) : { item: '', upgrade: 0, elem: 1, elemLv: 20, awakes: [], cards: [], count: 1, suitCard: '', ultimate: false, runes: [], jewels: [] };   // new: Fire 20 by default
    while (spec.awakes.length < 3) spec.awakes.push({ dst: '', adj: 0 });
    spec.runes = (spec.runes || []).slice(); spec.jewels = (spec.jewels || []).slice();
    while (spec.runes.length < 3) spec.runes.push('');
    while (spec.jewels.length < 5) spec.jewels.push('');
    const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()} ${SEC_SHORT[name]}`;
    const body = h('div.form', { style: 'display:flex;flex-wrap:wrap;align-items:flex-start' });
    const recOf = () => (spec.item && D.has(spec.item) ? ws.itemById(D.get(spec.item) >>> 0) : null);
    st.mixCards = false; st.mixJewels = false;
    function paint() {
      body.textContent = '';
      const rec = recOf(), pet = mode === 'pet' || (rec && isBuffPet(rec, D));
      body.appendChild(row(pet ? 'Buff pet' : 'Item', [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: withCurrent(ws, itemOptions(ctx, b, name, mode), it ? spec.item : ''), value: spec.item,
        placeholder: mode === 'pet' ? 'Pick a buff pet…' : name === 'BAG' ? 'Premium items, beads, potions, food, scrolls…' : 'Pieces this class + gender can wear at level 150…', onPick: v => { spec.item = v; if (!it) { const lim = limitsOf(ws, recOf()), so0 = recOf() ? S().sockets(recOf(), D) : { cap: 0 }; spec.cards = so0.what === 'card' ? new Array(so0.cap).fill('') : []; spec.upgrade = lim.up; if (!lim.elem) { spec.elem = 0; spec.elemLv = 0; } else if (!spec.elem) { spec.elem = 1; spec.elemLv = 20; } spec.ultimate = barunaWeapon(ws, recOf()); } paint(); } }))],
        mode === 'set' ? (() => { const ps = setPieces(spec.item, d => D.has(d) && !!ws.itemById(D.get(d) >>> 0)); return spec.item ? (ps.length > 1 ? `Adds the whole set: ${ps.map(d => itemLabel(ws, { id: D.get(d), define: d })).join(', ')}. They all get the + and element below; awakes and cards go on the piece you picked.` : 'Not a helmet / suit / gauntlets / boots set piece: only this item is added.') : 'Pick a set (level 120-130 sets, listed by their suit).'; })() :
        mode === 'pet' ? 'Buff pets only. Pick its beads below.' : name === 'BAG' ? 'Extras only: premium items, beads, potions, food, scrolls. Gear and pets go in the switch-set slots above.' : 'Only pieces a level 150 Hero / Legend of this class and gender can wear are listed.', true));
      if (rec) {
        const tip = FRE.itemTooltip.build(ws, rec).game.filter(l => l.some(x => x.text));
        body.appendChild(h('div.small', { style: 'flex-basis:100%;background:rgba(0,0,0,.35);border-radius:6px;padding:8px 10px;margin-bottom:12px;max-height:220px;overflow:auto' },
          tip.map(l => h('div', l.map(x => h('span', { style: `color:${x.color || '#fff'};${x.bold ? 'font-weight:600' : ''}` }, x.text))))));
      }
      const wearable = rec && !S().isNull(FRE.specItem.get(rec, 'dwParts'));
      if (!pet && (name !== 'BAG' || wearable)) {
        const lim = limitsOf(ws, rec);
        if (lim.up) body.appendChild(row('Upgrade', [h('span', '+'), numInput({ value: Math.min(spec.upgrade, lim.up), min: 0, max: lim.up, onCommit: v => { spec.upgrade = v || 0; paint(); } }),
          h('button.small', { title: 'The highest upgrade, element level 20, Ultimate on a Baruna weapon', on: { click: () => { spec.upgrade = lim.up; if (lim.elem) { if (!spec.elem) spec.elem = 1; spec.elemLv = 20; } if (barunaWeapon(ws, rec)) spec.ultimate = true; paint(); } } }, '⬆ Max')], `max +${lim.up}`));
        if (lim.elem) body.appendChild(row('Element', [h('select', { on: { change: e => { const was = spec.elem; spec.elem = +e.target.value; if (spec.elem && !was) spec.elemLv = 20; paint(); } } },
          h('option', { value: 0, selected: !spec.elem }, 'none'), E().ELEMENTS.map((w, k) => h('option', { value: k + 1, selected: spec.elem === k + 1 }, w[0] + w.slice(1).toLowerCase()))),
          spec.elem ? [h('span', 'level'), numInput({ value: spec.elemLv, min: 0, max: 20, onCommit: v => { spec.elemLv = v || 0; } })] : null], spec.elem ? 'max level 20' : null));
        const dsts = dstOptions(ctx);
        spec.awakes.forEach((a, k) => body.appendChild(row(`Awake ${k + 1}`, [h('div', { style: 'flex:1;min-width:260px' }, FRE.ui.combo({ options: dsts, value: a.dst, placeholder: 'no awake', onPick: v => { a.dst = v; paint(); } })),
          a.dst ? [h('span', 'value'), numInput({ value: a.adj, min: -99999, max: 99999, onCommit: v => { a.adj = v || 0; } }), h('button.small', { title: 'No awake here', on: { click: () => { a.dst = ''; a.adj = 0; paint(); } } }, '✕')] : null], null, true)));
        ultimateRows(ctx, body, spec, rec, paint);
      }
      if (mode === 'set') {
        body.appendChild(row('Suit cards (4 sockets)', [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: cardOptions(ctx, D.get('IK3_SOCKETCARD')), value: spec.suitCard, placeholder: 'no cards', onPick: v => { spec.suitCard = v; } }))],
          'The suit of the set gets 4 sockets with this card, whichever piece you picked above.', true));
      }
      const so = mode === 'set' ? { cap: 0 } : rec ? S().sockets(rec, D) : { cap: 0 };
      if (pet && name !== 'BAG' && !spec.cards.length) body.appendChild(row('Beads', [h('span', 'all 9 bead slots open')], 'Players put the beads in themselves: add the beads to the Inventory list.', true));
      else if (so.cap) {
        const word = so.what === 'bead' ? 'Bead' : 'Socket';
        body.appendChild(row(so.what === 'bead' ? 'Beads' : 'Sockets', [numInput({ value: spec.cards.length, min: 0, max: so.cap, onCommit: v => { const n = v || 0; while (spec.cards.length < n) spec.cards.push(spec.cards.length ? spec.cards[spec.cards.length - 1] : ''); spec.cards.length = n; paint(); } }), h('span.muted', `of ${so.cap}`)],
          so.what === 'bead' ? 'How many beads the pet has; pick each one below.' : 'How many sockets the item has; pick the card in each below.', true));
        const opts = cardOptions(ctx, so.kind3);
        // one card for every socket (the usual: "all Fire"); "different cards" opens one picker per socket
        const mixed = st.mixCards || new Set(spec.cards.filter(Boolean)).size > 1;
        if (!mixed && spec.cards.length) body.appendChild(row(so.what === 'bead' ? 'Bead (every slot)' : 'Card (every socket)', [h('div', { style: 'flex:1;min-width:320px' },
          FRE.ui.combo({ options: opts, value: spec.cards[0], placeholder: `Pick a ${so.what}…`, onPick: v => { spec.cards.fill(v); } })),
          h('button.small', { title: `Pick a different ${so.what} for each ${word.toLowerCase()}`, on: { click: () => { st.mixCards = true; paint(); } } }, `different ${so.what}s…`)], null, true));
        if (mixed) spec.cards.forEach((cd, k) => body.appendChild(row(`${word} ${k + 1}`, [h('div', { style: 'flex:1;min-width:320px' }, FRE.ui.combo({ options: opts, value: cd, placeholder: `Pick a ${so.what}…`, onPick: v => { spec.cards[k] = v; } })),
          k === 0 ? h('button.small', { title: `Put this ${so.what} in every ${word.toLowerCase()}`, on: { click: () => { if (spec.cards[0]) { spec.cards.fill(spec.cards[0]); st.mixCards = false; paint(); } } } }, `same ${so.what} in all`) : null], null, true)));
      } else if (rec && !pet && (name !== 'BAG' || wearable)) body.appendChild(row('Sockets', [h('span.muted', 'none: this item has no sockets')]));
      if (name === 'BAG' && !pet) {
        const pack = rec ? FRE.specItem.get(rec, 'dwPackMax') : 0;
        body.appendChild(row('Count', [numInput({ value: spec.count, min: 1, max: Math.max(1, pack || 1), onCommit: v => { spec.count = v || 1; } })], `stacks up to ${fmt(pack || 1)}`));
      }
    }
    paint();
    const label = it ? `${where}: ${itemLabel(ws, it)} changed` : `${where}: ${mode === 'pet' ? 'buff pet' : 'item'} added`;
    modal({ title: it ? `Edit item: ${itemLabel(ws, it)} — ${where}` : mode === 'set' ? `Add a set: ${where}` : mode === 'pet' ? `Add a buff pet: ${where}` : `Add an item: ${where}`, body, wide: true, buttons: [{ label: 'Cancel' },
      { label: 'Apply changes', cls: 'primary', onClick: () => {
        const ultOk = barunaWeapon(ws, recOf()), jewOk = ultOk ? spec.ultimate : !!recOf() && FRE.specItem.get(recOf(), 'dwReferStat1') === D.get('WEAPON_ULTIMATE');
        const out = Object.assign({}, spec, { awakes: spec.awakes.filter(a => a.dst), cards: spec.cards.filter(Boolean), ultimate: ultOk && spec.ultimate,
          runes: ultOk && spec.ultimate ? spec.runes.filter(Boolean) : [], jewels: jewOk ? spec.jewels.filter(Boolean) : [] });
        if (!out.item) { toast('Pick an item first', 'bad'); return false; }
        if (spec.cards.every(c => !c)) spec.cards = [];      // sockets left without a card: the item gets no sockets
        if (spec.cards.some(c => !c)) { toast(`Every socket needs a card (${spec.cards.filter(c => !c).length} empty): pick them, or lower the number of sockets`, 'bad'); return false; }
        try { O().itemLine(out); } catch (e) { toast(e.message, 'bad'); return false; }
        if (mode === 'set' && !it) {
          const has = d => D.has(d) && !!ws.itemById(D.get(d) >>> 0);
          const taken = new Set((b.sections[name] ? b.sections[name].items : []).map(x => x.define));
          const elemOf = d => S().elementOk(ws.itemById(D.get(d) >>> 0), D);          // the element only goes on the suit
          const fire = out.elem || 1, fireLv = out.elem ? out.elemLv : 20;
          const specs = setPieces(out.item, has).filter(d => d === out.item || !taken.has(d)).map(d => Object.assign(d === out.item ? Object.assign({}, out, { cards: [] }) : { item: d, upgrade: out.upgrade, awakes: [], cards: [], count: 1 },
            elemOf(d) ? { elem: fire, elemLv: fireLv } : { elem: 0, elemLv: 0 }));
          const suit = specs.find(x => /_SUIT(?=_|\d|$)/.test(x.item));
          if (suit && spec.suitCard) suit.cards = [spec.suitCard, spec.suitCard, spec.suitCard, spec.suitCard];
          if (!specs.length) specs.push(out);
          const parts = specs.map(x => FRE.specItem.get(ws.itemById(D.get(x.item) >>> 0), 'dwParts'));
          apply(ctx, PRF, t => {
            let text = replaceSlots(t, b.cls, b.sex, name, parts, specs, ws);
            if (st.same) text = replaceSlots(text, b.cls, 1 - b.sex, name, parts, specs.map(x => Object.assign({}, x, { item: O().twinOf(x.item, 1 - b.sex, has) })), ws);
            return diffSplice(t, text);
          }, `${where}: set (${specs.length} piece${specs.length === 1 ? '' : 's'})${st.same ? ` (+ ${E().SEXES[1 - b.sex].toLowerCase()} too)` : ''}`, 'pvp|eq|preset');
          return true;
        }
        if (name === 'BAG' && it) {                 // the shared inventory: the same item in every preset changes
          apply(ctx, PRF, t => everyBag(ws, t, it.define || nameOfId(ws, it.id), (pr1, x, b1, k) => O().setItem(pr1, b1, 'BAG', k, out)), `Inventory extras (all presets): ${itemLabel(ws, it)} changed`, 'pvp|eq|preset');
          return true;
        }
        presetEdit(ctx, apply, b, { kind: it ? 'set' : 'add', name, i, spec: out }, t => (it ? O().setItem(pr, b, name, i, out) : O().addItem(pr, t, b, name, out)), label);
        return true;
      } }] });
  }

  FRE.ui.pvpEqualized = { st, eventBlock, presetsView, presetDiags };
})(globalThis.FRE = globalThis.FRE || {});
