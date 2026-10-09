// Upgrading in game (task K): one try, many tries with the server's rolls, and the exact averages. Ports (WORLDSERVER/ItemUpgrade.cpp
// unless noted; __UPGRADE_SUCCESS_SCROLL is ON and __SM_ITEM_2ND_EX / __15_5TH_ELEMENTAL_SMELT_SAFETY are OFF, VersionCommon.h):
//   general  normal window CItemUpgrade::EnchantGeneral :1098: chance GetGeneralEnchantProb( level ) (×0.9 from +3, :1293), SMELPROT
//            buff = keep the item (:1149), rate buffs IK3_GENERAL_WEAPON_ENCHANT_RATE (weapons only) then IK3_GENERAL_ENCHANT_RATE:
//            + nEffectValue when nTargetMinEnchant <= level <= nTargetMaxEnchant, the buff used up only then (:1193-1226);
//            fail if xRandom( 10000 ) > chance (:1229); a fail from +3 without SMELPROT destroys the item (:1239-1256).
//            safe window SmeltSafetyGeneral :589: a SMELPROT scroll used up every try, fail = nothing lost (:667); the scroll slot
//            takes only II_SYS_SYS_SCR_SMELTING: +1000 below +7 (:623-643).
//   attr     EnchantAttribute :1659: GetAttributeEnchantProb (no cut), SMELPROT buff, II_SYS_SYS_SCR_SMELTING2 buff +1000 below +10
//            (:1723), IK3_GEN_ATT_ENCHANT_RATE buff (:1769); fail if xRandom( 10000 ) > chance; from +3 without SMELPROT: destroyed.
//   weapon / suit  piercing: OnPiercingSize :181: 100,000 Penya every try (:231), chance GetSizeProb (slot = size + 1, :309),
//            fail if chance < xRandom( 10000 ) (:262); a fail without the II_SYS_SYS_SCR_PIEPROT item destroys the item (:274);
//            safe window SmeltSafetyPiercingSize :771: PIEPROT used up every try, 100,000 Penya, fail = nothing lost (:838).
//   acc      RefineAccessory :866: success if xRandom( 10000 ) < chance (:900); fail from +3 without the SMELPROT4 buff: destroyed (:920);
//            safe SmeltSafetyAccessory :699: SMELPROT4 used up, fail if xRandom( 10000 ) > chance (:743), nothing lost. Max +20 (MAX_AAO).
//   coll     RefineCollector :935: success if xRandom( 1000 ) < chance (:963), a fail loses only the moonstone; max = the row count.
//   ult      CUltimateWeapon::EnchantWeapon (_Common/UltimateWeapon.cpp:681): success if xRandom( 1000000 ) < chance (:733); a fail
//            without the SMELPROT3 buff destroys the weapon at any level (:753); safe SmeltSafetyUltimate (:795-840): SMELPROT3 used
//            up, fail if xRandom( 1000000 ) > chance (:814), nothing lost. Max +10 (:701).
//   transform  CUltimateWeapon::TransWeapon (UltimateWeapon.cpp:548-678): General -> Unique GENERAL2UNIQUE, a fail destroys the weapon;
//            Unique (+10 only) -> Ultimate UNIQUE2ULTIMATE with a SMELPROT3 scroll always used up (aaadddff), a fail keeps it; the
//            weapon's own dwReferTarget2 replaces the chance (:591); an IK3_ULTIMATE_UPGRADE_RATE buff adds (WORD)nEffectValue × 100
//            in its level range (:595-611); success if xRandom( 1000000 ) < chance (:632).
// Materials per try: orichalcum (general), the element card (attr), a moonstone (piercing, accessory, collector), shining orichalcum
// (ult), the gems (transform). Not modelled: which items may be upgraded or pierced at all (IsDiceRefineryAble, IsPierceAble and the
// item's own slot limit), the element-card level check (WhatEleCard), equipped / trading refusals, the 15.5 safe element window
// (compiled out), Baruna.
(function (FRE) {
  'use strict';
  const U = () => FRE.upgrade;
  const PIERCE_PENYA = 100000;                                    // ItemUpgrade.cpp:231 / :797 (compiled)

  // the chance of one try at `level` (before the roll), the roll size and how it compares
  //   opts: { window: 'normal'|'safe', protect: bool, scrolls: [scroll], smelting: bool (safe general / SMELTING2 for attr), weapon: bool }
  // -> { n, mode, chance (the number compared), used: [scroll ids used up], fail: 'keep'|'break', max }
  function plan(model, sys, level, opts = {}) {
    const S = U().SYSTEMS[sys] || {}, safe = opts.window === 'safe';
    const lad = sys === 'transform' ? null : U().ladder(model, sys);
    const row = lad ? lad.find(r => r.level === level) : null;
    const used = [];
    let chance = row ? row.eff : 0, n = S.n, mode = safe && S.safeMode ? S.safeMode : S.mode, fail = 'keep';
    const max = lad ? maxLevel(model, sys, lad) : 1;
    const addRate = kind => {
      for (const s of opts.scrolls || []) if (s.kind === kind && level >= s.min && level <= s.max) { chance += s.value; used.push(s.id); break; }
    };
    if (sys === 'general') {
      if (safe) { if (opts.smelting && level < 7) { chance += 1000; used.push('smelting'); } }
      else {
        if (opts.weapon) addRate('generalWeapon');
        addRate('general');
        if (level >= 3 && !opts.protect) fail = 'break';
      }
    } else if (sys === 'attr') {
      if (opts.smelting && level < 10) { chance += 1000; used.push('smelting2'); }
      addRate('attr');
      if (level >= 3 && !opts.protect) fail = 'break';
    } else if (sys === 'weapon' || sys === 'suit') {
      if (!safe && !opts.protect) fail = 'break';
    } else if (sys === 'acc') {
      if (!safe && !opts.protect && level >= 3) fail = 'break';
    } else if (sys === 'ult') {
      if (!safe && !opts.protect) fail = 'break';
    } else if (sys === 'transform') {
      const s = model.ult.single, uni = opts.to === 'ultimate';
      chance = opts.override != null ? opts.override : (s[uni ? 'UNIQUE2ULTIMATE' : 'GENERAL2UNIQUE'] || { value: 0 }).value;
      n = 1000000; mode = 'lt';
      if (uni) {
        for (const sc of opts.scrolls || []) if (sc.kind === 'transform' && 10 >= sc.min && 10 <= sc.max) { chance += (sc.value & 0xFFFF) * 100; used.push(sc.id); break; }
      }
      fail = uni ? 'keep' : 'break';
    }
    return { n, mode, chance, used, fail, max, have: !!row || sys === 'transform' };
  }
  // the highest level a system can reach: the table size (GetMax…EnchantSize = map size; MAX_AAO; collector row count; Ultimate +10)
  function maxLevel(model, sys, lad) {
    if (sys === 'acc') return U().MAX_AAO;
    if (sys === 'ult') return 10;
    if (sys === 'weapon' || sys === 'suit') return (lad || U().ladder(model, sys)).length;
    return (lad || U().ladder(model, sys)).length;
  }
  const succeeds = (p, r) => (p.mode === 'le' ? r <= p.chance : r < p.chance);
  const chanceOf = p => U().countOf(p.mode, p.chance, p.n) / p.n;

  // one try with a roll from rng -> { level, roll, ok, result: 'up'|'keep'|'break', used, penya }
  function attempt(model, sys, level, opts, rng) {
    const p = plan(model, sys, level, opts);
    const penya = (sys === 'weapon' || sys === 'suit') ? PIERCE_PENYA : 0;
    const r = rng.random(p.n);
    const ok = succeeds(p, r);
    return { level, roll: r, ok, result: ok ? 'up' : p.fail, used: p.used, penya, protect: protectUsed(sys, opts, level) };
  }
  // the protect item / buff used up on this try
  function protectUsed(sys, opts, level) {
    if (sys === 'transform') return opts.to === 'ultimate' ? 1 : 0;        // Unique -> Ultimate always takes a SMELPROT3 (aaadddff)
    if (sys === 'coll') return 0;
    if (opts.window === 'safe') return 1;                                   // the safe windows always take the scroll
    if (!opts.protect) return 0;
    return 1;                                                                // SMELPROT / SMELPROT4 / SMELPROT3 buff, PIEPROT item
  }

  // many items from `from` to `to`, each until it gets there or breaks; at most `cap` tries per item
  // -> { items: [{ tries, reached, broke, end }], totals: { tries, material, protect, scrolls, penya, reached, broke }, log: [first 40 tries] }
  function run(model, sys, from, to, opts, seed, count = 1, cap = 100000) {
    const rng = FRE.xRandom.rng(seed);
    const items = [], log = [];
    const totals = { tries: 0, material: 0, protect: 0, scrolls: 0, penya: 0, reached: 0, broke: 0 };
    for (let i = 0; i < count; i++) {
      let level = from, tries = 0, broke = false;
      while (level < to && tries < cap) {
        const a = attempt(model, sys, level, opts, rng);
        tries++; totals.material++; totals.protect += a.protect; totals.scrolls += a.used.length; totals.penya += a.penya;
        if (log.length < 40) log.push([i, a.level, a.roll, a.result]);
        if (a.result === 'up') level++;
        else if (a.result === 'break') { broke = true; break; }
      }
      totals.tries += tries;
      if (level >= to) totals.reached++;
      if (broke) totals.broke++;
      items.push({ tries, reached: level >= to, broke, end: level });
    }
    return { items, totals, log };
  }

  // the exact averages from `from` to `to` (a Markov chain: fail = stay or break)
  // -> { rows: [{ level, chance, fail, reach, tries }], reach (one item gets there), triesPerItem, per: { tries, items, protect, scrolls, penya } (per finished item,
  //      starting again with a new item after a break), never (a level that can never pass) }
  function expect(model, sys, from, to, opts) {
    const rows = [];
    let reach = 1, tries = 0, protect = 0, scrolls = 0, penya = 0, never = null;
    for (let L = from; L < to; L++) {
      const p = plan(model, sys, L, opts), c = chanceOf(p);
      let t;
      if (p.fail === 'keep') t = c > 0 ? 1 / c : Infinity;
      else t = 1;
      const here = reach * t;
      rows.push({ level: L, chance: c, fail: p.fail, reach, tries: here });
      tries += here;
      protect += here * protectUsed(sys, opts, L);
      scrolls += here * p.used.length;
      if (sys === 'weapon' || sys === 'suit') penya += here * PIERCE_PENYA;
      if (c <= 0) { never = L; reach = 0; break; }
      if (p.fail === 'break') reach *= c;
    }
    const per = reach > 0 ? { tries: tries / reach, items: 1 / reach, protect: protect / reach, scrolls: scrolls / reach, penya: penya / reach } : null;
    return { rows, reach, triesPerItem: tries, per, never };
  }

  FRE.upgradeSim = { PIERCE_PENYA, plan, maxLevel, attempt, run, expect, chanceOf };
})(globalThis.FRE = globalThis.FRE || {});
