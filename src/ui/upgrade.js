// Upgrade Rates (task K part 1): every upgrade chance as the REAL chance players get (the rolls' off-by-one and the overseas ×0.9
// from +3 included, loaders/upgrade.js), typed in %, with what a fail costs; Weapon Rarity tiers; 🧮 an upgrade calculator
// (loaders/upgrade-sim.js). Edits: edit/upgrade-ops.js. User decisions (2026-10-09): core ladders + Ultimate + Weapon Rarity;
// 2026-10-13: + Baruna upgrade (Baruna.lua, Udi's window).
(function (FRE) {
  'use strict';
  const { h, fmt, numInput, pctInput, toast, keepFocus } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const LUA = 'itemupgrade.lua', ST = 's.txt', ULT = 'ultimate_ultimateweapon.txt', WR = 'weaponrarity.inc', FEE = 'upgradefees.lua', TXT = 'textclient.txt.txt', BAR = 'baruna.lua';
  const PATCH = 'upgrade-fees';
  const st = { sel: 'general', calc: null };
  const U = () => FRE.upgrade, O = () => FRE.upgradeOps, Sim = () => FRE.upgradeSim;
  const model = ctx => ctx.ws.models.upgrade;
  const can = (ctx, f) => ctx.ws.isEditable(f);
  const uDiags = ctx => ctx.ws.diags.filter(d => d.module === 'upgrade');
  const spanDiags = (ctx, file, a, b) => uDiags(ctx).filter(d => d.file.toLowerCase() === file && d.start !== undefined && d.start >= a && d.start < Math.max(b, a + 1));
  // a count that may be astronomical (an item that almost never gets there): plain digits up to 10^15, else "about 9.3 × 10^22"
  const big = n => { if (!Number.isFinite(n)) return '∞'; if (n < 1e15) return fmt(Math.round(n)); const e = Math.floor(Math.log10(n)); return `about ${(n / 10 ** e).toFixed(1)} × 10^${e}`; };
  const pc = c => `${Number((c * 100).toFixed(4))}%`;
  const keyOf = (sec, x) => `upgrade|${sec}|${x}`;
  const itemName = (ctx, define) => { const id = ctx.ws.defines.defines.get(define); const it = id !== undefined && ctx.ws.items.items.get(id >>> 0); return it ? it.name || define : define; };
  const fileOf = sys => (sys === 'acc' || sys === 'coll' ? ST : sys === 'ult' ? ULT : LUA);

  const SECTIONS = [
    { id: 'general', label: 'Normal upgrade', sub: ctx => ladderSub(ctx, 'general', 'orichalcum, +0 → +') },
    { id: 'attr', label: 'Element upgrade', sub: ctx => ladderSub(ctx, 'attr', 'element card, +0 → +') },
    { id: 'pierce', label: 'Piercing', sub: ctx => { const m = model(ctx); return `weapons ${m.t.weapon.length} slots · armor ${m.t.suit.length} slots`; } },
    { id: 'acc', label: 'Accessory upgrade', sub: ctx => (model(ctx).s.missing ? 's.txt not found' : ladderSub(ctx, 'acc', 'moonstone, +0 → +')) },
    { id: 'coll', label: 'Collector upgrade', sub: ctx => (model(ctx).s.missing ? 's.txt not found' : ladderSub(ctx, 'coll', 'moonstone, +0 → +')) },
    { id: 'ult', label: 'Ultimate weapons', sub: ctx => (model(ctx).ult.missing ? 'Ultimate_UltimateWeapon.txt not found' : 'transforms, +1 → +10, gems') },
    { id: 'baruna', label: 'Baruna upgrade', sub: ctx => (model(ctx).baruna.missing ? 'Baruna.lua not found' : ladderSub(ctx, 'baruna', 'Udi, +0 → +')) },
    { id: 'rarity', label: 'Weapon Rarity', sub: ctx => (model(ctx).rarity.missing ? 'WeaponRarity.inc not found' : `${model(ctx).rarity.tiers.size} tiers (Weapon Rarity Scroll)`) },
    { id: 'fees', label: 'Upgrade fees', sub: ctx => feesSub(ctx) },
    { id: 'calc', label: '🧮 Upgrade calculator', sub: () => 'Tries, scrolls and Penya to reach +N' },
  ];
  function ladderSub(ctx, sys, what) {
    const lad = U().ladder(model(ctx), sys);
    if (!lad.length) return 'no chances';
    return `${what}${lad.length}; last step ${pc(lad[lad.length - 1].chance)}`;
  }
  const sectionFiles = { general: [LUA], attr: [LUA], pierce: [LUA], acc: [ST], coll: [ST], ult: [ULT], baruna: [BAR], rarity: [WR], fees: [FEE, TXT, LUA] };
  const SEC_CODES = { attr: /^UP_ATTR_/ };
  function sectionDiags(ctx, id) {
    const fs = sectionFiles[id];
    if (!fs) return [];
    return uDiags(ctx).filter(d => fs.includes(d.file.toLowerCase()) && sectionOf(d) === id);
  }
  // which section a problem belongs to (ItemUpgrade.lua and s.txt hold several)
  function sectionOf(d) {
    const f = d.file.toLowerCase(), k = String(d.key || '');
    if (f === FEE || f === TXT || d.code === 'UP_TRANSY_MISSING') return 'fees';
    if (f === ST) return /coll|COLL/.test(k) || d.code === 'UP_COLL_EMPTY' ? 'coll' : 'acc';
    if (f === ULT) return 'ult';
    if (f === WR) return 'rarity';
    if (f === BAR) return 'baruna';
    if (SEC_CODES.attr.test(d.code) || /\|attr\|/.test('|' + k) || /tAttribute/.test(k)) return 'attr';
    if (/\|(weapon|suit)\||tSuitProb|tWeaponProb/.test('|' + k)) return 'pierce';
    return 'general';
  }

  const mod = {
    id: 'upgrade', label: 'Upgrade Rates', searchPlaceholder: 'Search sections', noItems: true,
    help: 'Upgrade Rates: every upgrade chance as players really get it, Weapon Rarity tiers, and what reaching +N costs',
    st,
    onLoad() { st.sel = 'general'; st.calc = null; },

    renderList(el, ctx) {
      const q = ctx.query.toLowerCase();
      for (const s of SECTIONS) {
        if (q && !s.label.toLowerCase().includes(q)) continue;
        const ds = sectionDiags(ctx, s.id);
        const b = ds.filter(d => d.severity === 'BLOCK').length, w = ds.filter(d => d.severity === 'WARN').length;
        el.appendChild(h('div.npc' + (st.sel === s.id ? '.sel' : ''), { 'data-sec': s.id, on: { click: () => { st.sel = s.id; ctx.renderAll(false); } } },
          h('div.n', h('span', s.label), h('span', [...ctx.edited].some(k => k.startsWith(`upgrade|${s.id}|`)) ? h('span.tag.edit', 'edited') : null,
            b ? h('span.tag.bad', '⛔' + b) : w ? h('span.tag.warn', '⚠' + w) : null)),
          h('div.k', s.sub(ctx))));
      }
    },

    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const m = model(ctx);
        if (m.lua.failed) el.appendChild(h('div.banner.bad', 'ItemUpgrade.lua would not run: the server then refuses every normal upgrade, element upgrade and piercing. See the problems below.'));
        if (st.sel === 'pierce') pierceView(el, ctx);
        else if (st.sel === 'ult') ultView(el, ctx);
        else if (st.sel === 'rarity') rarityView(el, ctx);
        else if (st.sel === 'calc') calcView(el, ctx);
        else if (st.sel === 'fees') feesView(el, ctx);
        else if (st.sel === 'baruna') barunaView(el, ctx);
        else ladderView(el, ctx, st.sel);
      });
    },

    addTarget() { return { ok: false, title: 'Items are not added in this task' }; },

    locate(d) {
      if (d.module !== 'upgrade') return false;
      st.sel = sectionOf(d);
      return true;
    },
  };

  function problems(el, ctx, sec) {
    const ds = sectionDiags(ctx, sec);
    if (ds.length) { el.appendChild(h('h3', 'Problems')); for (const d of ds) el.appendChild(diagRow(d)); }
  }
  function title(el, ctx, text, file, label) {
    el.appendChild(h('div.npc-title', h('h2', text), h('span.def', label), can(ctx, file) ? null : h('span.tag.bad', 'read-only')));
  }
  // a typed field: pauses while typing one value fold into one undo step
  function typed(ctx, file, field, make, label, key) {
    ctx.editGroup(() => [{ file, splices: make(ctx.ws.files.get(file).text) }], label, [key], `up|${field}`);
  }

  // the real-chance box of a ladder row: shows / takes the REAL chance, writes the file value that gives it
  function chanceBox(ctx, sys, r, key, label) {
    const S = U().SYSTEMS[sys];
    const conv = {
      toPct: u => U().countOf(S.mode, S.cut ? U().cut90(u, r.level) : u, S.n) / S.n * 100,
      fromPct: p => U().valueForPercent(sys, r.level, p).value,
      maxPct: 100,
      tip: u => `In the file: ${u}${S.cut && r.level >= 3 ? ` (× 0.9 = ${U().cut90(u, r.level)})` : ''} of ${fmt(S.n)}`,
    };
    return pctInput({ value: r.value, key: `up|${sys}|${r.level}`, disabled: !can(ctx, fileOf(sys)), conv,
      onCommit: u => typed(ctx, fileOf(sys), `${sys}|${r.level}`, () => O().setNumber(r.span, u, -1, 2147483647, 'The chance'),
        `${label}: ${S.label} +${r.level} → +${r.level + 1} ${pc(conv.toPct(u) / 100)} (was ${pc(r.chance)})`, key) });
  }
  // what a failed try costs, in words
  function failText(ctx, sys, level) {
    const P = n => itemName(ctx, n);
    if (sys === 'general' || sys === 'attr') return level < 3 ? 'nothing lost (the material is used)' : `the item is destroyed, unless a ${P('II_SYS_SYS_SCR_SMELPROT')} is active${sys === 'general' ? ' (the safe window never loses it)' : ''}`;
    if (sys === 'weapon' || sys === 'suit') return `the item is destroyed, unless a ${P('II_SYS_SYS_SCR_PIEPROT')} is put in (it is used up)`;
    if (sys === 'acc') return level < 3 ? 'nothing lost (the moonstone is used)' : `the accessory is destroyed, unless a ${P('II_SYS_SYS_SCR_SMELPROT4')} is active (the safe window never loses it)`;
    if (sys === 'coll') return 'nothing lost (the moonstone is used)';
    if (sys === 'ult') return `the weapon is destroyed, unless a ${P('II_SYS_SYS_SCR_SMELPROT3')} is active (the safe window never loses it)`;
    return '';
  }

  // ------------------------------------------------------------- a ladder (normal, element, accessory, collector)
  const INTRO = {
    general: 'Weapons and armor, with orichalcum. From +3 the server cuts every chance by 10% (overseas servers, GetGeneralEnchantProb): the chance below is what players really get. Success-rate scrolls add to it (see the calculator).',
    attr: 'Element upgrade with element cards, +1 to +20. The other columns are the growth per level (out of 10,000).',
    acc: 'Rings, earrings and necklaces, with moonstones, +1 to +20. The normal window and the safe window roll a little differently (below the chance < vs ≤), so each has its own chance.',
    coll: 'Collectors, with moonstones. The number of rows is the highest level. The game shows these in the Collector Details window too (Client/s.txt).',
  };
  function ladderView(el, ctx, sys) {
    const m = model(ctx), S = U().SYSTEMS[sys], file = fileOf(sys);
    title(el, ctx, S.label, file, sys === 'acc' ? 's.txt · Accessory_Probability' : sys === 'coll' ? 's.txt · Collecting_Enchant' : sys === 'attr' ? 'ItemUpgrade.lua · AddAttribute' : 'ItemUpgrade.lua · tGeneral');
    if ((sys === 'acc' || sys === 'coll') && m.s.missing) { el.appendChild(h('p.empty-state', 's.txt is not in Server/Resource.')); return; }
    el.appendChild(h('p.muted.small', INTRO[sys]));
    const lad = U().ladder(m, sys), f = ctx.ws.files.get(file);
    const head = [h('th', 'Step'), h('th', 'Chance'), S.safeMode ? h('th', 'Safe window') : null, h('th', 'Tries on average'), sys === 'attr' ? h('th', 'Damage / Defense / Attribute growth') : null, h('th', 'If it fails'), h('th', '')];
    const tb = h('table.items.up', h('tr', ...head));
    for (const r of lad) {
      const key = keyOf(sys, r.level);
      const growth = sys === 'attr' ? h('td', ...[2, 3, 4].map((i, j) => numInput({ value: r.call.args[i] ? r.call.args[i].value : null, min: 0, max: 2147483647, disabled: !can(ctx, file), key: `up|attr|${r.level}|${i}`,
        onCommit: v => { if (v === null) return; typed(ctx, file, `attr|${r.level}|${i}`, () => O().setAttrField(r.call, i, v, ['damage growth', 'defense growth', 'attribute growth'][j]),
          `Element +${r.level + 1}: ${['damage', 'defense', 'attribute'][j]} growth ${v} (was ${r.call.args[i].value})`, key); } }))) : null;
      tb.appendChild(h('tr', h('td', h('b', `+${r.level} → +${r.level + 1}`)), h('td', chanceBox(ctx, sys, r, key, 'Chance')),
        S.safeMode ? h('td.small', pc(r.safeChance)) : null,
        h('td.small', r.count ? fmt(Math.round(S.n / r.count * 10) / 10) : 'never'),
        growth, h('td.small.muted', failText(ctx, sys, r.level)),
        h('td', diagTags(spanDiags(ctx, file, r.span.start, r.span.end)), h('span.line', `L${f.lineOf(r.span.start) + 1}`))));
    }
    el.appendChild(tb);
    if (!lad.length) el.appendChild(h('p.empty-state', 'No chances in the file.'));
    if (sys === 'general' || sys === 'attr') {
      const sc = m.scrolls.filter(s => (sys === 'general' ? s.kind === 'general' || s.kind === 'generalWeapon' : s.kind === 'attr'));
      if (sc.length) el.appendChild(h('p.muted.small', 'Success-rate scrolls (Spec_Item.txt nEffectValue, out of 10,000): ',
        sc.map(s => `${s.name} +${Number((s.value / 100).toFixed(2))}% at +${s.min}-+${s.max}${s.kind === 'generalWeapon' ? ' (weapons)' : ''}`).join(' · '),
        sys === 'attr' ? ` · ${itemName(ctx, 'II_SYS_SYS_SCR_SMELTING2')} +10% below +10` : ''));
    }
    problems(el, ctx, sys);
  }

  // ------------------------------------------------------------- Baruna upgrade (Baruna.lua, EnchantBaruna)
  const BARUNA_ULT_DEFAULT_TEXT = () => { const d = U().BARUNA_ULT_DEFAULT; return `${d[0] / 100}% with ${d[1]} + ${d[2]}`; };
  function barunaView(el, ctx) {
    const m = model(ctx), B = m.baruna, edit_ = can(ctx, BAR);
    title(el, ctx, 'Baruna upgrade', BAR, 'Baruna.lua · tBarunaUpgrade / tBarunaDowngrade');
    if (B.missing) { el.appendChild(h('p.empty-state', 'Baruna.lua is not in Server/Resource.')); return; }
    if (B.lua.failed) el.appendChild(h('div.banner.bad', 'Baruna.lua would not run: the server then refuses every Baruna upgrade. See the problems below.'));
    const f = ctx.ws.files.get(BAR), udiMax = B.pet.length;
    el.appendChild(h('p.muted.small', `Baruna weapons in Udi's Baruna Upgrade window, with a Stone of Balance (+1 to +${U().BARUNA_MAX}; the server stops at +10 even when the table is longer). `
      + `Udi levels up from failed tries and multiplies the chance (right column: Udi at its highest level, ${udiMax}). WorldServer only: restart the server after saving.`));
    const tb = h('table.items.up', h('tr', h('th', 'Step'), h('th', 'Chance'), h('th', `With Udi Lv ${udiMax}`), h('th', 'Tries on average'), h('th', 'Blessing: drops a level'), h('th', 'If it fails'), h('th', '')));
    for (const r of U().ladder(m, 'baruna')) {
      const key = keyOf('baruna', r.level), drop = U().barunaDrop(B, r.level);
      const conv = { toPct: u => U().countOf('le', u, 10000) / 100, fromPct: p => Math.max(0, Math.min(10000, Math.round(p * 100))) - 1, maxPct: 100, tip: u => `In the file: ${u} of 10,000` };
      const chance = pctInput({ value: r.value, key: `up|baruna|${r.level}`, disabled: !edit_, conv,
        onCommit: u => typed(ctx, BAR, `baruna|${r.level}`, () => O().setNumber(r.span, u, -1, 2147483647, 'The chance'),
          `Baruna +${r.level} → +${r.level + 1} ${pc(conv.toPct(u) / 100)} (was ${pc(r.chance)})`, key) });
      const dconv = { toPct: d => (10000 - Math.max(0, Math.min(d, 10000))) / 100, fromPct: p => 10000 - Math.max(0, Math.min(10000, Math.round(p * 100))), maxPct: 100, tip: d => `In the file: ${d} of 10,000 keep the level` };
      const dropBox = r.level === 0 ? h('span.small.muted', 'never (+0)')
        : r.down ? pctInput({ value: r.down.value, key: `up|baruna|d|${r.level}`, disabled: !edit_, conv: dconv,
            onCommit: d => typed(ctx, BAR, `baruna|d|${r.level}`, () => O().setNumber(r.down, d, -2147483648, 2147483647, 'The keep chance'),
              `Baruna +${r.level}: a Blessing fail drops a level ${pc(dconv.toPct(d) / 100)} (was ${pc(drop / 10000)})`, key) })
        : h('span.small.muted', '100% (no tBarunaDowngrade value)');
      tb.appendChild(h('tr', h('td', h('b', `+${r.level} → +${r.level + 1}`)), h('td', chance),
        h('td.small', pc(U().barunaCount(B, r.level, udiMax) / 10000)),
        h('td.small', r.count ? fmt(Math.round(10000 / r.count * 10) / 10) : 'never'),
        h('td', dropBox),
        h('td.small.muted', `no Blessing: the weapon is destroyed · ${itemName(ctx, 'II_SYS_SYS_SCR_BARUNASMELPROT')}: kept, or drops a level · ${itemName(ctx, 'II_SYS_SYS_SCR_BARUNASMELPROT02')}: kept`),
        h('td', diagTags(spanDiags(ctx, BAR, r.span.start, r.span.end)), h('span.line', `L${f.lineOf(r.span.start) + 1}`))));
    }
    el.appendChild(tb);
    if (B.up.length > U().BARUNA_MAX) el.appendChild(h('p.muted.small', `tBarunaUpgrade has ${B.up.length} values; only the first ${U().BARUNA_MAX} are used (the +10 cap).`));
    // Udi levels (read-only here: the fail counts and bonuses)
    if (udiMax || B.petFail.length) {
      el.appendChild(h('h3', 'Udi levels'));
      const ut = h('table.items.up', h('tr', h('th', 'Udi level'), h('th', 'Failed tries to reach it'), h('th', 'Chance bonus')));
      for (let L = 0; L <= B.petFail.length; L++) {
        const v = L >= 1 && B.pet[L - 1] ? B.pet[L - 1].value : null;
        ut.appendChild(h('tr', h('td', h('b', `Lv ${L}`)), h('td.small', L === 0 ? 'start' : fmt(U().barunaFailsFor(B, L - 1))),
          h('td.small', v === null ? '×1 (no bonus)' : `+${v}% (×${Number((1 + v / 100).toFixed(2))})`)));
      }
      el.appendChild(ut);
      el.appendChild(h('p.muted.small', 'tBarunaNeedFailForPetUp / tBarunaPetMultiplicator. Udi counts every failed try; the fail count starts again at each new level.'));
    }
    // Make Ultimate Baruna (tBarunaUltimate = { chance, crystals, stones })
    el.appendChild(h('h3', 'Make Ultimate Baruna'));
    const UB = U().barunaUltimate(B), pf = k => fmt(FRE.upgradeFees.feeOf(m.fees, k, patched(ctx)));
    el.appendChild(h('p.muted.small', `Udi's "Make Ultimate Baruna" menu: a +10 Baruna weapon becomes an Ultimate Baruna at +0 (3 rune slots: 1 now, 2 at +5, 3 at +10; jewels from +6). `
      + `Every try uses the ${itemName(ctx, 'II_GEN_MAT_CID')} and ${itemName(ctx, 'II_GEN_MAT_OPERCID')} below plus ${pf('nMakeUltimateBarunaPenya')} Penya (Upgrade fees); a fail keeps the weapon.`));
    if (!B.hasUlt) el.appendChild(h('p.muted.small', `Baruna.lua has no tBarunaUltimate line: the server uses ${BARUNA_ULT_DEFAULT_TEXT()}. Add "tBarunaUltimate = { 3000, 10, 10 };" to edit it here.`));
    else {
      const ut = h('table.items.up', h('tr', h('th', 'What'), h('th', 'Value'), h('th', 'Notes'), h('th', '')));
      const [spC, spX, spS] = UB.spans;
      const conv = { toPct: u => Math.max(0, Math.min(u, 10000)) / 100, fromPct: p => Math.max(0, Math.min(10000, Math.round(p * 100))), maxPct: 100, tip: u => `In the file: ${u} of 10,000` };
      const row = (label, sp, box, note) => ut.appendChild(h('tr', h('td', h('b', label)), h('td', sp ? box : h('span.tag.warn', 'missing (default)')), h('td.small.muted', note),
        h('td', sp ? diagTags(spanDiags(ctx, BAR, sp.start, sp.end)) : null, sp ? h('span.line', `L${f.lineOf(sp.start) + 1}`) : null)));
      row('Chance', spC, spC && pctInput({ value: spC.value, key: 'up|baruna|ult|0', disabled: !edit_, conv,
        onCommit: u => typed(ctx, BAR, 'baruna|ult|0', () => O().setNumber(spC, u, -2147483648, 2147483647, 'The chance'), `Make Ultimate Baruna ${pc(conv.toPct(u) / 100)} (was ${pc(UB.count / 10000)})`, keyOf('baruna', 'ult0')) }),
        UB.count ? `${fmt(Math.round(10000 / UB.count * 10) / 10)} tries on average` : 'never works');
      for (const [i, sp, what] of [[1, spX, itemName(ctx, 'II_GEN_MAT_CID')], [2, spS, itemName(ctx, 'II_GEN_MAT_OPERCID')]]) {
        row(what, sp, sp && numInput({ value: sp.value, min: 1, max: 32767, disabled: !edit_, key: `up|baruna|ult|${i}`,
          onCommit: v => { if (v === null) return; typed(ctx, BAR, `baruna|ult|${i}`, () => O().setNumber(sp, v, 1, 32767, 'The amount'), `Make Ultimate Baruna: ${v} × ${what} per try`, keyOf('baruna', `ult${i}`)); } }),
          'per try, from one stack (the server needs that many in the stack put in the window)');
      }
      el.appendChild(ut);
    }
    problems(el, ctx, 'baruna');
  }

  // ------------------------------------------------------------- piercing
  function pierceView(el, ctx) {
    const m = model(ctx), f = ctx.ws.files.get(LUA);
    title(el, ctx, 'Piercing', LUA, 'ItemUpgrade.lua · tWeaponProb / tSuitProb');
    const pf = k => fmt(FRE.upgradeFees.feeOf(m.fees, k, patched(ctx)));
    el.appendChild(h('p.muted.small', `Adding a card slot, with a moonstone and ${pf('nPiercingPenya')} Penya every try (${pf('nSafePiercingPenya')} in the safe window; see Upgrade fees). Slot n is the chance to add the n-th slot. The item's own slot limit is not in this file.`));
    for (const sys of ['weapon', 'suit']) {
      el.appendChild(h('h3', U().SYSTEMS[sys].label));
      const tb = h('table.items.up', h('tr', h('th', 'Slot'), h('th', 'Chance'), h('th', 'Tries on average'), h('th', 'If it fails'), h('th', '')));
      for (const r of U().ladder(m, sys)) {
        const key = keyOf('pierce', `${sys}|${r.level}`);
        tb.appendChild(h('tr', h('td', h('b', `slot ${r.level + 1}`)), h('td', chanceBox(ctx, sys, r, key, 'Piercing')),
          h('td.small', r.count ? fmt(Math.round(10000 / r.count * 10) / 10) : 'never'), h('td.small.muted', failText(ctx, sys, r.level)),
          h('td', diagTags(spanDiags(ctx, LUA, r.span.start, r.span.end)), h('span.line', `L${f.lineOf(r.span.start) + 1}`))));
      }
      el.appendChild(tb);
    }
    problems(el, ctx, 'pierce');
  }

  // ------------------------------------------------------------- Ultimate weapons
  function ultView(el, ctx) {
    const m = model(ctx), u = m.ult, edit_ = can(ctx, ULT);
    title(el, ctx, 'Ultimate weapons', ULT, 'Ultimate_UltimateWeapon.txt');
    if (u.missing) { el.appendChild(h('p.empty-state', 'Ultimate_UltimateWeapon.txt is not in Server/Resource.')); return; }
    const f = ctx.ws.files.get(ULT);
    const own = ownTransform(ctx);
    const singles = [
      ['GENERAL2UNIQUE', 'General → Unique', `the weapon is destroyed on a fail. ${own.gen.total ? `Every General weapon that can change (${own.gen.total}) has its own chance in Spec_Item.txt (dwReferTarget2: ${own.gen.list}), so this line is used by ${own.gen.file} of them.` : ''}`],
      ['UNIQUE2ULTIMATE', 'Unique (+10) → Ultimate', `needs a ${itemName(ctx, 'II_SYS_SYS_SCR_SMELPROT3')}, used up every try (aaadddff); a fail keeps the weapon. ${own.uni.total - own.uni.file ? `${own.uni.total - own.uni.file} Unique weapon(s) have their own chance.` : `All ${own.uni.total} Unique weapons that can change use this line.`}`],
      ['SET_GEM', 'Put a gem into an Ultimate weapon', 'a fail loses the gem.'],
      ['REMOVE_GEM', 'Take a gem out', 'a fail loses the gem.'],
    ];
    const tb = h('table.items.up', h('tr', h('th', 'What'), h('th', 'Chance'), h('th', 'Tries on average'), h('th', 'Notes'), h('th', '')));
    for (const [k, label, note] of singles) {
      const sp = u.single[k], key = keyOf('ult', k);
      tb.appendChild(h('tr', h('td', h('b', label)),
        h('td', sp ? pctInput({ value: sp.value, key: `up|ult|${k}`, disabled: !edit_, conv: { toPct: v => U().singleChance(v) * 100, fromPct: p => Math.round(p * 10000), maxPct: 100, tip: v => `In the file: ${v} of 1,000,000` },
          onCommit: v => typed(ctx, ULT, `ult|${k}`, () => FRE.textOps.replaceSpan(sp, v), `${label}: ${pc(U().singleChance(v))} (was ${pc(U().singleChance(sp.value))})`, key) }) : h('span.tag.warn', 'missing')),
        h('td.small', sp && U().singleChance(sp.value) ? fmt(Math.round(1 / U().singleChance(sp.value) * 10) / 10) : 'never'),
        h('td.small.muted', note), h('td', sp ? diagTags(spanDiags(ctx, ULT, sp.start, sp.end)) : null)));
    }
    el.appendChild(tb);
    el.appendChild(h('h3', 'Ultimate weapon +1 → +10 (shining orichalcum)'));
    ladderInto(el, ctx, 'ult');
    el.appendChild(h('h3', 'Gems from a weapon (MAKE_GEM)'));
    el.appendChild(h('p.muted.small', 'Breaking a weapon into gems: the chance and how many, by the weapon\'s own +N. General and Unique weapons have their own columns. The weapon is used up either way.'));
    const g = h('table.items.up', h('tr', h('th', 'Weapon at'), h('th', 'General: chance'), h('th', 'gems'), h('th', 'Unique: chance'), h('th', 'gems'), h('th', '')));
    for (const r of u.makeGem) {
      const key = keyOf('ult', `gem${r.level.value}`);
      const pbox = field => pctInput({ value: r[field].value, key: `up|gem|${r.level.value}|${field}`, disabled: !edit_,
        conv: { toPct: v => U().singleChance(v) * 100, fromPct: p => Math.round(p * 10000), maxPct: 100, tip: v => `In the file: ${v} of 1,000,000` },
        onCommit: v => typed(ctx, ULT, `gem|${r.level.value}|${field}`, () => FRE.textOps.replaceSpan(r[field], v), `Gems from a +${r.level.value} weapon: ${field === 'gProb' ? 'General' : 'Unique'} chance ${pc(U().singleChance(v))}`, key) });
      const nbox = field => numInput({ value: r[field].value, min: 1, max: 32767, disabled: !edit_, key: `up|gem|${r.level.value}|${field}`,
        onCommit: v => { if (v === null) return; typed(ctx, ULT, `gem|${r.level.value}|${field}`, () => O().setMakeGem(r, field, v).splices, `Gems from a +${r.level.value} weapon: ${field === 'gNum' ? 'General' : 'Unique'} ${v} gems`, key); } });
      g.appendChild(h('tr', h('td', h('b', `+${r.level.value}`)), h('td', pbox('gProb')), h('td', nbox('gNum')), h('td', pbox('uProb')), h('td', nbox('uNum')),
        h('td', diagTags(spanDiags(ctx, ULT, r.start, r.end)), h('span.line', `L${f.lineOf(r.start) + 1}`))));
    }
    el.appendChild(g);
    problems(el, ctx, 'ult');
  }
  function ladderInto(el, ctx, sys) {
    const m = model(ctx), S = U().SYSTEMS[sys], file = fileOf(sys), f = ctx.ws.files.get(file);
    const tb = h('table.items.up', h('tr', h('th', 'Step'), h('th', 'Chance'), h('th', 'Safe window'), h('th', 'Tries on average'), h('th', 'If it fails'), h('th', '')));
    for (const r of U().ladder(m, sys)) {
      const key = keyOf(sys, r.level);
      tb.appendChild(h('tr', h('td', h('b', `+${r.level} → +${r.level + 1}`)), h('td', chanceBox(ctx, sys, r, key, 'Chance')), h('td.small', pc(r.safeChance)),
        h('td.small', r.count ? fmt(Math.round(S.n / r.count * 10) / 10) : 'never'), h('td.small.muted', failText(ctx, sys, r.level)),
        h('td', diagTags(spanDiags(ctx, file, r.span.start, r.span.end)), h('span.line', `L${f.lineOf(r.span.start) + 1}`))));
    }
    el.appendChild(tb);
  }
  // General / Unique weapons that can change (dwReferTarget1 set) and how many carry their own chance (dwReferTarget2, :591)
  function ownTransform(ctx) {
    const D = ctx.ws.defines.defines, gen = D.get('WEAPON_GENERAL'), uni = D.get('WEAPON_UNIQUE');
    const res = { gen: { total: 0, file: 0, by: new Map() }, uni: { total: 0, file: 0, by: new Map() } };
    for (const it of ctx.ws.items.items.values()) {
      const rs = FRE.specItem.get(it, 'dwReferStat1');
      const k = rs === gen ? 'gen' : rs === uni ? 'uni' : null;
      if (!k) continue;
      const t1 = FRE.specItem.get(it, 'dwReferTarget1'), t2 = FRE.specItem.get(it, 'dwReferTarget2');
      if (t1 === -1 || t1 === undefined) continue;
      res[k].total++;
      if (t2 === -1 || t2 === undefined) res[k].file++;
      else res[k].by.set(t2, (res[k].by.get(t2) || 0) + 1);
    }
    for (const k of ['gen', 'uni']) res[k].list = [...res[k].by].sort((a, b) => a[0] - b[0]).map(([v, n]) => `${n} at ${pc(U().singleChance(v))}`).join(', ');
    return res;
  }

  // ------------------------------------------------------------- Weapon Rarity
  function rarityView(el, ctx) {
    const R = model(ctx).rarity, edit_ = can(ctx, WR);
    title(el, ctx, 'Weapon Rarity', WR, 'WeaponRarity.inc');
    if (R.missing) { el.appendChild(h('p.empty-state', 'WeaponRarity.inc is not in Server/Resource.')); return; }
    el.appendChild(h('p.muted.small', `Each use of the ${itemName(ctx, 'II_SYS_SYS_SCR_WPNRARITY')} on a weapon rolls a tier (0-99 against the chances below, in tier order). `,
      'Every stat line of the weapon gets the tier\'s bonus: a % stat gets the % bonus added, any other stat the flat bonus (e.g. Attack +11% becomes +41% at +30). Both the server and the game read this file.'));
    const ch = U().rarityChances(R), f = ctx.ws.files.get(WR);
    for (const b of R.blocks) {
      const v = b.value, key = keyOf('rarity', v.level), sp = b.spans;
      const real = ch.tiers.find(t => t.level === v.level), drop = R.drop.find(d => d.level.value === v.level);
      const colour = h('input', { type: 'color', value: O().colorHex(v.color), disabled: !edit_ || !sp.color,
        on: { change: e => ctx.edit(WR, () => O().setRarityColor(b, e.target.value), `Weapon Rarity tier ${v.level}: colour ${e.target.value.toUpperCase()}`, key) } });
      const name = h('input', { type: 'text', value: v.name || '', disabled: !edit_ || !sp.name, maxLength: 63, style: 'width:12em' });
      name.dataset.key = `up|wr|${v.level}|name`;
      FRE.dom.liveCommit(name, () => { if (!name.isConnected || name.value === (v.name || '')) return; typed(ctx, WR, `wr|${v.level}|name`, () => O().setRarityName(b, name.value), `Weapon Rarity tier ${v.level}: name "${name.value}"`, key); });
      const n = (k, label) => sp[k] ? numInput({ value: sp[k].value, min: 0, max: k === 'pct' ? 1000 : 100000, disabled: !edit_, key: `up|wr|${v.level}|${k}`,
        onCommit: x => { if (x === null) return; typed(ctx, WR, `wr|${v.level}|${k}`, () => O().setRarityNumber(b, k, x), `Weapon Rarity tier ${v.level}: ${label} ${x} (was ${sp[k].value})`, key); } }) : h('span.muted', `${v[k]} (from the tier above)`);
      const luck = drop ? numInput({ value: drop.luck.value, min: 0, max: 100, disabled: !edit_, key: `up|wr|${v.level}|luck`,
        onCommit: x => { if (x === null) return; typed(ctx, WR, `wr|${v.level}|luck`, () => O().setDropLuck(drop, x), `Weapon Rarity tier ${v.level}: chance ${x}% (was ${drop.luck.value}%)`, key); } }) : h('span.tag.warn', 'not in Drop');
      el.appendChild(h('div.rt-card', h('div.dr-line', h('h3', { style: `margin:0;color:${O().colorHex(v.color)}` }, `Tier ${v.level}`), name, colour,
          h('span.line', `L${f.lineOf(b.start) + 1}`), diagTags(spanDiags(ctx, WR, b.start, b.end))),
        h('div.dr-line', h('span', '% stats +'), n('pct', '% bonus'), h('span', 'other stats +'), n('flat', 'flat bonus'),
          h('span', 'chance'), luck, h('span.muted', '%'), real ? h('span.small.muted', `players get ${pc(real.chance)}`) : null)));
    }
    el.appendChild(h('p', `Total: ${R.dropTotal}%`, R.dropTotal !== 100 ? h('span.tag.warn', ` ⚠ not 100: ${ch.nothing > 0 ? `${Math.round(ch.nothing * 100)}% of scrolls change nothing` : 'the last tiers get less'}`) : h('span.tag.ok', ' ✓')));
    problems(el, ctx, 'rarity');
  }

  // ------------------------------------------------------------- calculator
  const CALC_SYS = [['general', 'Normal upgrade'], ['attr', 'Element upgrade'], ['weapon', 'Weapon piercing'], ['suit', 'Armor piercing'], ['acc', 'Accessory upgrade'],
    ['coll', 'Collector upgrade'], ['ult', 'Ultimate weapon +N'], ['transform', 'Transform (General → Unique / Unique → Ultimate)']];
  const HAS_SAFE = new Set(['general', 'weapon', 'suit', 'acc', 'ult']);
  function calcView(el, ctx) {
    const m = model(ctx);
    if (!st.calc) st.calc = { sys: 'general', from: 0, to: 10, window: 'normal', protect: false, weapon: true, smelting: false, scrolls: [], to2: 'unique', n: 1000, seed: 1, result: null };
    const c = st.calc;
    el.appendChild(h('div.npc-title', h('h2', '🧮 Upgrade calculator'), h('span.def', 'what reaching +N costs')));
    el.appendChild(h('p.muted.small', 'Works on the chances above as they are now (edits included, nothing is written). "Per finished item" counts starting again with a new item each time one is destroyed.'));
    const redo = () => { c.result = null; ctx.renderAll(false); };
    const sel = h('select', { on: { change: e => { c.sys = e.target.value; const max = c.sys === 'transform' ? 1 : Sim().maxLevel(m, c.sys); c.from = 0; c.to = max; if (!HAS_SAFE.has(c.sys)) c.window = 'normal'; redo(); } } },
      CALC_SYS.map(([v, l]) => h('option', { value: v, selected: v === c.sys }, l)));
    const max = c.sys === 'transform' ? 1 : Sim().maxLevel(m, c.sys);
    const line = h('div.dr-line', h('span', 'Upgrade'), sel);
    if (c.sys !== 'transform') line.append(h('span', 'from +'), numInput({ value: c.from, min: 0, max: Math.max(0, max - 1), onCommit: v => { c.from = v || 0; redo(); } }),
      h('span', 'to +'), numInput({ value: c.to, min: 1, max, onCommit: v => { c.to = v || max; redo(); } }));
    else line.append(h('select', { on: { change: e => { c.to2 = e.target.value; redo(); } } }, h('option', { value: 'unique', selected: c.to2 === 'unique' }, 'General → Unique'), h('option', { value: 'ultimate', selected: c.to2 === 'ultimate' }, 'Unique (+10) → Ultimate')));
    el.appendChild(line);
    const opts = h('div.dr-line');
    const tick = (label, k, title_) => h('label', { title: title_ || '' }, h('input', { type: 'checkbox', checked: !!c[k], on: { change: e => { c[k] = e.target.checked; redo(); } } }), ' ', label);
    if (HAS_SAFE.has(c.sys)) opts.append(h('select', { on: { change: e => { c.window = e.target.value; redo(); } } },
      h('option', { value: 'normal', selected: c.window === 'normal' }, 'normal window'), h('option', { value: 'safe', selected: c.window === 'safe' }, 'safe window (a protect scroll every try)')));
    const protectName = { general: 'II_SYS_SYS_SCR_SMELPROT', attr: 'II_SYS_SYS_SCR_SMELPROT', weapon: 'II_SYS_SYS_SCR_PIEPROT', suit: 'II_SYS_SYS_SCR_PIEPROT', acc: 'II_SYS_SYS_SCR_SMELPROT4', ult: 'II_SYS_SYS_SCR_SMELPROT3' }[c.sys];
    if (protectName && c.window !== 'safe') opts.append(tick(`${itemName(ctx, protectName)} every try`, 'protect'));
    if (c.sys === 'general') opts.append(tick('it is a weapon', 'weapon', 'Weapon-only success scrolls count only on weapons'));
    if ((c.sys === 'general' && c.window === 'safe') || c.sys === 'attr') opts.append(tick(`${itemName(ctx, c.sys === 'attr' ? 'II_SYS_SYS_SCR_SMELTING2' : 'II_SYS_SYS_SCR_SMELTING')} (+10% below +${c.sys === 'attr' ? 10 : 7})`, 'smelting'));
    el.appendChild(opts);
    const kinds = c.sys === 'general' && c.window !== 'safe' ? ['general', 'generalWeapon'] : c.sys === 'attr' ? ['attr'] : c.sys === 'transform' && c.to2 === 'ultimate' ? ['transform'] : [];
    const sc = m.scrolls.filter(s => kinds.includes(s.kind));
    if (sc.length) el.appendChild(h('div.dr-line', h('span', 'Success scrolls every try:'), ...sc.map(s => h('label', h('input', { type: 'checkbox', checked: c.scrolls.includes(s.id),
      on: { change: e => { c.scrolls = e.target.checked ? [...c.scrolls, s.id] : c.scrolls.filter(x => x !== s.id); redo(); } } }), ` ${s.name} (+${Number((s.value / (s.kind === 'transform' ? 1 : 100)).toFixed(2))}% at +${s.min}-+${s.max})`))));
    const o = { patched: patched(ctx), window: c.window, protect: c.protect, weapon: c.weapon, smelting: c.smelting, scrolls: m.scrolls.filter(s => c.scrolls.includes(s.id) && kinds.includes(s.kind)), to: c.to2 };
    const from = c.sys === 'transform' ? 0 : Math.min(c.from, max - 1), to = c.sys === 'transform' ? 1 : Math.max(from + 1, Math.min(c.to, max));
    const e = Sim().expect(m, c.sys, from, to, o);
    const tb = h('table.items.up', h('tr', h('th', 'Step'), h('th', 'Chance'), h('th', 'If it fails'), h('th', 'Items that get here'), h('th', 'Tries here (per item)')));
    for (const r of e.rows) tb.appendChild(h('tr', h('td', c.sys === 'transform' ? 'transform' : `+${r.level} → +${r.level + 1}`), h('td', pc(r.chance)),
      h('td.small', r.fail === 'break' ? 'destroyed' : 'kept'), h('td.small', pc(r.reach)), h('td.small', Number.isFinite(r.tries) ? r.tries.toFixed(2) : '∞')));
    el.appendChild(tb);
    el.appendChild(e.per
      ? h('div.banner', h('b', 'Per finished item: '), `${big(e.per.tries)} tries (materials), ${e.per.items < 1000 ? e.per.items.toFixed(2) : big(e.per.items)} items, `,
        `${big(e.per.protect)} protect scrolls, ${big(e.per.scrolls)} success scrolls${e.per.penya ? `, ${big(e.per.penya)} Penya` : ''}. `,
        `One item reaches the end ${pc(e.reach)} of the time.`)
      : h('div.banner.bad', `Never: +${e.never} → +${e.never + 1} has a 0% chance.`));
    // 🎲 run with the server's rolls
    el.appendChild(h('div.dr-line', h('span', '🎲 Try it with'), numInput({ value: c.n, min: 1, max: 100000, onCommit: v => { c.n = v || 1; } }), h('span', 'items, seed'),
      numInput({ value: c.seed, min: 0, max: 2147483647, onCommit: v => { c.seed = v || 0; } }),
      h('button.primary', { on: { click: () => {
        try { c.result = Sim().run(m, c.sys, from, to, o, c.seed, c.n); ctx.renderAll(false); } catch (err) { toast(err.message, 'bad'); }
      } } }, 'Run')));
    if (c.result) {
      const t = c.result.totals;
      el.appendChild(h('p', `${fmt(c.result.items.length)} items: ${fmt(t.reached)} reached +${to}, ${fmt(t.broke)} destroyed. `,
        `${fmt(t.tries)} tries, ${fmt(t.protect)} protect scrolls, ${fmt(t.scrolls)} success scrolls${t.penya ? `, ${fmt(t.penya)} Penya` : ''}. `,
        t.reached ? `Per finished item: ${(t.tries / t.reached).toFixed(1)} tries.` : ''));
    }
  }

  // ------------------------------------------------------------- upgrade fees (part 2: docs/patches/upgrade-fees.diff, UpgradeFees.lua)
  // the fees count only with the patch: 'missing' in the source = not applied; unknown (test-data) = assumed built, with a note
  const patched = ctx => ctx.patchState(PATCH) !== 'missing';
  function feesSub(ctx) {
    const F = model(ctx).fees;
    const set = F.rows.filter(r => r.present && !r.ignored).length;
    return F.empty ? 'all compiled · UpgradeFees.lua is made on the first change' : `${set} of ${F.rows.length} set in UpgradeFees.lua`;
  }
  function patchBanner(el, ctx) {
    const s = ctx.patchState(PATCH);
    const apply = 'In FLYFF-V19-SOURCE run "git apply -p1 ../FLYFF-RESOURCE-EDITOR/docs/patches/upgrade-fees.diff", then build the WorldServer and Neuz (NoGameguard).';
    const tick = h('label.check', ' ', h('input', { type: 'checkbox', checked: s === 'built', on: { change: e => {
      if (!ctx.setPatchBuilt(PATCH, e.target.checked)) toast('This browser cannot remember the tick (site storage is blocked).', 'bad');
      else toast(e.target.checked ? 'Marked upgrade-fees.diff as built into the WorldServer and Neuz.' : 'upgrade-fees.diff: no longer marked as built.');
      ctx.renderAll(false); } } }), ' I built it into the WorldServer and Neuz (remembered in this browser)');
    if (s === 'missing') el.appendChild(h('div.banner.bad', '⛔ upgrade-fees.diff is not in FLYFF-V19-SOURCE: the server and the game ignore UpgradeFees.lua and keep the fees compiled in the C++ (the "In game now" column). ', apply));
    else if (s === 'in-source') el.appendChild(h('div.banner.warn', 'upgrade-fees.diff is in the source. If the WorldServer and Neuz were not built since, build them once (Neuz: NoGameguard).', tick));
    else if (s === 'built') el.appendChild(h('div.banner', '✓ upgrade-fees.diff is marked as built into the WorldServer and Neuz.', tick));
    else el.appendChild(h('div.banner.warn', '⚠ These fees need the C++ change docs/patches/upgrade-fees.diff (NOT YET TESTED IN GAME), built into the WorldServer and Neuz. Without it the server ignores UpgradeFees.lua. ', apply, tick));
  }
  function feesView(el, ctx) {
    const m = model(ctx), F = m.fees, f = ctx.ws.files.get(FEE), on = patched(ctx);
    title(el, ctx, 'Upgrade fees', FEE, F.empty ? 'UpgradeFees.lua · made on the first change' : 'UpgradeFees.lua');
    el.appendChild(h('p.muted.small', 'The Penya each upgrade and remove costs, taken by the WorldServer before the try (not enough Penya: the server says so and nothing happens). The game windows show only the piercing price (it reads its own Client/UpgradeFees.lua, made when you save); the other windows show no price. A fee left out keeps its default: the old compiled fee, or 0 = free.'));
    patchBanner(el, ctx);
    if (F.failed) el.appendChild(h('div.banner.bad', 'UpgradeFees.lua would not run: the server and the game keep every compiled fee. See the problems below.'));
    for (const [gid, glabel] of FRE.upgradeFees.GROUPS) {
    el.appendChild(h('h3', glabel));
    const tb = h('table.items.up', h('tr', h('th', 'Action'), h('th', 'Fee (Penya)'), h('th', 'In game now'), h('th', 'Where it is charged'), h('th', '')));
    for (const r of F.rows.filter(x => x.group === gid)) {
      const key = keyOf('fees', r.key), fee = FRE.upgradeFees.feeOf(F, r.key, on);
      const box = numInput({ value: r.value, min: 0, max: FRE.upgradeFees.INT_MAX, key: `up|fee|${r.key}`, disabled: !can(ctx, FEE) || F.failed,
        onCommit: v => { if (v === null || v === r.value) return; setFee(ctx, r, v, key); } });
      const back = r.present && r.value !== r.def && can(ctx, FEE) && !F.failed
        ? h('button.small', { title: r.def ? `Back to the compiled ${fmt(r.def)}` : 'Back to free (0)', on: { click: () => setFee(ctx, r, r.def, key) } }, r.def ? `↺ ${fmt(r.def)}` : '↺ free') : null;
      tb.appendChild(h('tr', h('td', h('b', r.label), h('div.muted.small', r.what)), h('td', box, ' ', back,
        h('div.muted.small', r.present ? (r.ignored ? `file: ${r.raw} (ignored)` : `UpgradeFees.lua L${f.lineOf(r.span.start) + 1}`) : r.def ? `not in the file: compiled ${fmt(r.def)}` : 'not in the file: free')),
        h('td.small', on ? (fee ? fmt(fee) : 'free') : r.def ? `${fmt(r.def)} (compiled; the patch is not applied)` : 'free (the patch is not applied)'),
        h('td.small.muted', `${r.server}${r.game ? ` · game: ${r.game}` : ''}`),
        h('td', r.span ? diagTags(spanDiags(ctx, FEE, r.span.start, r.span.end)) : null)));
    }
    el.appendChild(tb);
    }
    if (m.feeText) {
      const n = FRE.upgradeFees.textNumber(m.feeText.text);
      el.appendChild(h('p.muted.small', 'The remove-element window says: ', h('i', `"${m.feeText.text}"`), n ? ' — changing that fee rewrites the number in this text (textClient.txt.txt, Server + Client) in the same step.' : ' (no "<number> Penya" in it to keep in step).'));
    }
    // the gender change: already read from ItemUpgrade.lua (ItemUpgrade.cpp:118), no patch needed
    const L = m.lua;
    el.appendChild(h('h3', 'Gender change (Transy)'));
    el.appendChild(h('p.muted.small', 'ItemUpgrade.lua already holds these (ItemUpgrade.cpp:118, no C++ change needed). A missing line costs 0 Penya.'));
    const tt = h('table.items.up', h('tr', h('th', 'Item level'), h('th', 'Fee (Penya)'), h('th', '')));
    for (const [n, label] of [['nItemTransyLowLevel', 'Low level items'], ['nItemTransyHighLevel', 'High level items']]) {
      const sp = L.numbers[n], key = keyOf('fees', n);
      tt.appendChild(h('tr', h('td', h('b', label), h('div.muted.small', n)),
        h('td', sp ? numInput({ value: sp.value, min: 0, max: FRE.upgradeFees.INT_MAX, key: `up|fee|${n}`, disabled: !can(ctx, LUA) || L.failed,
          onCommit: v => { if (v === null || v === sp.value) return; typed(ctx, LUA, `fee|${n}`, () => O().setNumber(sp, v, 0, FRE.upgradeFees.INT_MAX, `${label} (Penya)`), `Upgrade fee: gender change, ${label.toLowerCase()} ${fmt(v)} Penya (was ${fmt(sp.value)})`, key); } })
          : h('span.muted', 'not in ItemUpgrade.lua (0 Penya)')),
        h('td', sp ? h('span.line', `L${ctx.ws.files.get(LUA).lineOf(sp.start) + 1}`) : null)));
    }
    el.appendChild(tt);
    problems(el, ctx, 'fees');
  }
  // one fee -> UpgradeFees.lua (+ the remove-element text) as ONE undo step; typing pauses fold into it
  function setFee(ctx, r, v, key) {
    try {
      ctx.editGroup(() => {
        const parts = [{ file: FEE, splices: O().setFee(model(ctx).fees, ctx.ws.files.get(FEE).text, r.key, v) }];
        const ft = model(ctx).feeText;
        if (r.text && ft && ctx.ws.isEditable(TXT) && FRE.upgradeFees.textNumber(ft.text)) parts.push({ file: TXT, splices: O().setFeeText(ft, v) });
        return parts;
      }, `Upgrade fee: ${r.label} ${fmt(v)} Penya (was ${fmt(r.value)})`, [key], `up|fee|${r.key}`);
    } catch (e) { toast(e.message, 'bad'); }
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
