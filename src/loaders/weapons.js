// Weapon effects (task G part 2): each weapon's own bonus stats, the 6 slots dwDestParam1-6 / nAdjParamVal1-6 (and
// dwChgParamVal1-6) of its Spec_Item.txt row (cols 54-71). Read from the Spec model the workspace already loaded
// (loaders/specitem.js); nothing else is parsed here. WeaponRarity.inc (the rarity bonus added to each slot) comes from
// FRE.upgrade.loadRarity (CProject::LoadWeaponRarity, Project.cpp:494), read-only here: it is edited in Upgrade Rates.
//   A slot counts when dwDestParam != -1 (MoverEquip.cpp:2368-2402: stat 0 is applied too, and does nothing).
//   Families (the tier doc WEAPON-SET-EFFECTS/WEAPON_TIER_UPDATE_APPLIED.md) from the define's last part: LUZA = Lusaka
//   (T1, Lv90), LEAGENDG = Legendary Golden (T2, Lv105), LUZAM = Lusaka's Crystal (T3, Lv121), ANGEL / VEMPIRE / BLOODY = the HP
//   track T1-T3, LEAGENDG1 = the [EVENT] rows the doc leaves out. A define + "UM" is the Ultimate twin of its base row (the doc's
//   rule: same stat line as the base).
(function (FRE) {
  'use strict';
  const SLOTS = 6;
  const NONE = 0xFFFFFFFF;
  const FAMILY = {
    LUZA: { name: 'Lusaka', track: 'ATK', tier: 1 }, LEAGENDG: { name: 'Legendary Golden', track: 'ATK', tier: 2 },
    LUZAM: { name: "Lusaka's Crystal", track: 'ATK', tier: 3 }, ANGEL: { name: 'Angel', track: 'HP', tier: 1 },
    VEMPIRE: { name: 'Vampire', track: 'HP', tier: 2 }, BLOODY: { name: 'Bloody', track: 'HP', tier: 3 },
    LEAGENDG1: { name: 'Legendary Golden [EVENT]', track: 'event', tier: 0 },
  };

  // the define's family key and whether it is an Ultimate twin (base define + "UM" that exists)
  function familyOf(define, defines) {
    const m = /^II_WEA_[A-Z0-9]+_(\w+)$/.exec(define || '');
    if (!m) return { key: null, twinOf: null };
    let key = m[1], twinOf = null;
    if (/UM$/.test(define) && defines.has(define.slice(0, -2))) { twinOf = define.slice(0, -2); key = key.slice(0, -2); }
    return { key, twinOf };
  }

  function slotsOf(it) {
    const g = f => FRE.specItem.get(it, f), out = [];
    for (let i = 1; i <= SLOTS; i++) {
      const dst = g('dwDestParam' + i) >>> 0;
      out.push({ i, dst, on: dst !== NONE, adj: g('nAdjParamVal' + i) | 0, chg: g('dwChgParamVal' + i) | 0 });
    }
    return out;
  }

  // ws: a Workspace (items, defines) -> { weapons, byId, byDefine, rarity, families }
  function fromWorkspace(ws) {
    const D = ws.defines.defines, I = ws.items.items;
    const kinds = new Set(['IK2_WEAPON_DIRECT', 'IK2_WEAPON_MAGIC'].map(n => D.get(n)).filter(v => v !== undefined));
    const weapons = [], byId = new Map(), byDefine = new Map();
    for (const it of I.values()) {
      if (!kinds.has(FRE.specItem.get(it, 'dwItemKind2'))) continue;
      const info = ws.itemInfo(it), fam = familyOf(it.define, D);
      const w = { id: it.id, define: it.define, name: info.name || it.define, item: it, info, level: info.level, job: info.jobName,
        type: FRE.itemCategory.of(info, ws.defines).sub, family: fam.key, familyInfo: FAMILY[fam.key] || null, twinOf: fam.twinOf, twin: null,
        slots: slotsOf(it) };
      weapons.push(w); byId.set(w.id, w); byDefine.set(w.define, w);
    }
    for (const w of weapons) if (w.twinOf && byDefine.has(w.twinOf)) byDefine.get(w.twinOf).twin = w;
    weapons.sort((a, b) => (a.level - b.level) || a.name.localeCompare(b.name));
    const rf = ws.files.get('weaponrarity.inc');
    const rarity = rf && FRE.upgrade ? FRE.upgrade.loadRarity(rf, D) : null;
    const families = new Map();
    for (const w of weapons) if (w.family) { if (!families.has(w.family)) families.set(w.family, []); families.get(w.family).push(w); }
    return { weapons, byId, byDefine, rarity, families };
  }

  FRE.weapons = { fromWorkspace, slotsOf, familyOf, FAMILY, SLOTS, NONE };
})(globalThis.FRE = globalThis.FRE || {});
