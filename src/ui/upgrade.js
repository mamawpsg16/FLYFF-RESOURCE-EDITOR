// Upgrade Rates (task K part 1): every upgrade chance as the REAL chance players get (the rolls' off-by-one and the overseas ×0.9
// from +3 included, loaders/upgrade.js), typed in %, with what a fail costs; Weapon Rarity tiers; 🧮 an upgrade calculator
// (loaders/upgrade-sim.js). Edits: edit/upgrade-ops.js. User decisions (2026-10-09): core ladders + Ultimate + Weapon Rarity, no Baruna.
(function (FRE) {
  'use strict';
  const { h, fmt, numInput, pctInput, toast, keepFocus } = FRE.dom;
  const { diagTags, diagRow } = FRE.ui;
  const LUA = 'itemupgrade.lua', ST = 's.txt', ULT = 'ultimate_ultimateweapon.txt', WR = 'weaponrarity.inc';
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
    { id: 'rarity', label: 'Weapon Rarity', sub: ctx => (model(ctx).rarity.missing ? 'WeaponRarity.inc not found' : `${model(ctx).rarity.tiers.size} tiers (Weapon Rarity Scroll)`) },
    { id: 'calc', label: '🧮 Upgrade calculator', sub: () => 'Tries, scrolls and Penya to reach +N' },
  ];
  function ladderSub(ctx, sys, what) {
    const lad = U().ladder(model(ctx), sys);
    if (!lad.length) return 'no chances';
    return `${what}${lad.length}; last step ${pc(lad[lad.length - 1].chance)}`;
  }
  const sectionFiles = { general: [LUA], attr: [LUA], pierce: [LUA], acc: [ST], coll: [ST], ult: [ULT], rarity: [WR] };
  const SEC_CODES = { attr: /^UP_ATTR_/ };
  function sectionDiags(ctx, id) {
    const fs = sectionFiles[id];
    if (!fs) return [];
    return uDiags(ctx).filter(d => fs.includes(d.file.toLowerCase()) && sectionOf(d) === id);
  }
  // which section a problem belongs to (ItemUpgrade.lua and s.txt hold several)
  function sectionOf(d) {
    const f = d.file.toLowerCase(), k = String(d.key || '');
    if (f === ST) return /coll|COLL/.test(k) || d.code === 'UP_COLL_EMPTY' ? 'coll' : 'acc';
    if (f === ULT) return 'ult';
    if (f === WR) return 'rarity';
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

  // ------------------------------------------------------------- piercing
  function pierceView(el, ctx) {
    const m = model(ctx), f = ctx.ws.files.get(LUA);
    title(el, ctx, 'Piercing', LUA, 'ItemUpgrade.lua · tWeaponProb / tSuitProb');
    el.appendChild(h('p.muted.small', `Adding a card slot, with a moonstone and ${fmt(Sim().PIERCE_PENYA)} Penya every try (compiled). Slot n is the chance to add the n-th slot. The item's own slot limit is not in this file.`));
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
    const o = { window: c.window, protect: c.protect, weapon: c.weapon, smelting: c.smelting, scrolls: m.scrolls.filter(s => c.scrolls.includes(s.id) && kinds.includes(s.kind)), to: c.to2 };
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

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
