// What players actually see in an NPC shop: a port of how the WorldServer
// fills shop tabs at startup.
//   buildIndex   <- CProject::OnAfterLoadPropItem   (_Common/Project.cpp:4983)
//                   + the __NEW_STACKABLE_AMPS clones made in LoadPropItem
//   expandRule   <- CMover::GenerateVendorItem      (_Common/Mover.cpp:5414)
//   simulateNpc  <- CMover::ProcessRegenItem        (_Common/Mover.cpp:1630)
// The server's sorts are not stable, so they are copied exactly to get the
// same item order.
(function (FRE) {
  'use strict';
  const MAX_VENDOR_INVENTORY = 100;
  const MAX_UNIQUE_SIZE = 400;     // defineItemkind.h
  const MAX_ITEM_KIND3 = 300;      // defineItemkind.h
  const AMP_FIRST_ID = 60000;      // nAmpCopyID in LoadPropItem
  const u = v => v >>> 0;          // DWORD view of a signed value

  function propOf(item, id) {
    const g = f => FRE.specItem.get(item, f);
    return {
      id: id === undefined ? item.id : id, item,
      ik1: u(g('dwItemKind1')), ik3: u(g('dwItemKind3')), rare: u(g('dwItemRare')),
      job: u(g('dwItemJob')), shopAble: u(g('dwShopAble')), chip: g('dwReferValue1'),
    };
  }

  // Item table in server index order, then per-kind arrays sorted by rarity.
  function buildIndex(itemsState, defines) {
    const byId = new Map();
    for (const [id, item] of itemsState.items) byId.set(id, propOf(item));
    // __NEW_STACKABLE_AMPS: EXP scrolls with nMaxDuplication > 1 get copies at 60000+
    const ampKind = defines.get('IK3_EXP_RATE');
    let ampId = AMP_FIRST_ID;
    for (const row of itemsState.rows) {
      if (row.ver > FRE.specItem.SERVER_VER) continue;
      if (FRE.specItem.get(row, 'dwItemKind3') !== ampKind) continue;
      const dup = FRE.specItem.get(row, 'nMaxDuplication');
      for (let i = 0; i < dup - 1; i++) byId.set(ampId, Object.assign(propOf(row, ampId++), { ampCopyOf: row.id }));
    }
    const ordered = [...byId.values()].sort((a, b) => a.id - b.id);

    const kinds = new Map();         // ik3 -> array
    for (const p of ordered) {
      if (p.ik3 === 0xffffffff || p.ik3 >= MAX_ITEM_KIND3) continue;
      if (!kinds.has(p.ik3)) kinds.set(p.ik3, []);
      kinds.get(p.ik3).push(p);
    }
    const minMax = new Map();        // ik3 -> Map(rare -> [first, last])
    for (const [k, arr] of kinds) {
      for (let j = 0; j < arr.length - 1; j++) {
        for (let m = j + 1; m < arr.length; m++) {
          if (arr[m].rare < arr[j].rare) { const t = arr[j]; arr[j] = arr[m]; arr[m] = t; }
        }
      }
      const mm = new Map();
      let cur = 0xffffffff;
      arr.forEach((p, j) => {
        if (p.rare !== cur) { cur = p.rare; if (cur !== 0xffffffff) mm.set(cur, [j, j]); }
        else if (cur !== 0xffffffff) mm.get(cur)[1] = j;
      });
      minMax.set(k, mm);
    }
    return { byId, kinds, minMax };
  }

  function getIdx(index, ik3, rare, which) {
    const r = u(rare);
    if (r >= MAX_UNIQUE_SIZE) return -1;
    const mm = index.minMax.get(u(ik3));
    const v = mm && mm.get(r);
    return v ? v[which] : -1;
  }

  // Appends the rule's items to `list` (shared by all rules of a tab, capped at 100).
  function expandRule(index, rule, list) {
    const res = { matched: 0, added: 0, empty: false };
    if (list.length >= MAX_VENDOR_INVENTORY) return res;
    const lo = rule.rareMin, hi = rule.rareMax;
    let minIdx = -1, maxIdx = -1;
    for (let j = lo; j <= Math.min(hi, lo + MAX_UNIQUE_SIZE); j++) { minIdx = getIdx(index, rule.ik3, j, 0); if (minIdx !== -1) break; }
    for (let j = hi; j >= lo && j > hi - MAX_UNIQUE_SIZE - 1; j--) { maxIdx = getIdx(index, rule.ik3, j, 1); if (maxIdx !== -1) break; }
    if (minIdx < 0) { res.empty = true; return res; }          // server: WriteError("VENDORITEM//...")
    const arr = index.kinds.get(u(rule.ik3)) || [];
    for (let k = minIdx; k <= maxIdx; k++) {
      const p = arr[k];
      if (!p || p.shopAble === 0xffffffff || (rule.job !== -1 && p.job !== u(rule.job))) continue;
      res.matched++;
      if (list.length >= MAX_VENDOR_INVENTORY) continue;
      list.push({ prop: p, source: rule.rec, kind: 'generated' });
      res.added++;
    }
    return res;
  }

  // Returns { tabs: [ {entries, dropped, rules} x4 ], chip }
  function simulateNpc(index, npc) {
    const chip = npc.venderType === 1 || npc.venderType === 2;
    const tabs = [0, 1, 2, 3].map(() => ({ entries: [], dropped: [], rules: [] }));
    for (const rec of npc.statements) {
      const e = FRE.character.shopEntry(rec);
      if (!e || !(e.slot >= 0 && e.slot < 4)) continue;
      const tab = tabs[e.slot];
      (tab.byKind || (tab.byKind = { generated: [], fixed: [], chip: [] }))[e.kind].push({ rec, e });
    }
    tabs.forEach(tab => {
      const by = tab.byKind || { generated: [], fixed: [], chip: [] };
      if (chip) {
        for (const { rec, e } of by.chip) {
          const p = index.byId.get(u(e.item.value));
          if (!p) { tab.dropped.push({ rec, reason: 'not in Spec_Item.txt' }); continue; }
          if (p.chip < 1) { tab.dropped.push({ rec, prop: p, reason: 'no chip price (dwReferValue1)' }); continue; }
          if (tab.entries.length >= MAX_VENDOR_INVENTORY) { tab.dropped.push({ rec, prop: p, reason: 'tab full' }); continue; }
          tab.entries.push({ prop: p, source: rec, kind: 'chip' });
        }
      } else if (by.generated.length) {
        const gen = [];
        for (const { rec, e } of by.generated) {
          if (e.lang) { tab.rules.push({ rec, langOnly: true }); continue; }     // only for one server language
          const r = expandRule(index, { ik3: e.ik3.value, job: e.job.value, rareMin: e.rareMin.value, rareMax: e.rareMax.value, rec }, gen);
          tab.rules.push(Object.assign({ rec }, r));
        }
        for (let j = 0; j < gen.length - 1; j++) {            // ProcessRegenItem's sort
          for (let k = j + 1; k < gen.length; k++) {
            const a = gen[j].prop, b = gen[k].prop;
            if (b.ik1 < a.ik1 || (b.ik1 === a.ik1 && b.rare < a.rare)) { const t = gen[j]; gen[j] = gen[k]; gen[k] = t; }
          }
        }
        tab.entries.push(...gen);
      }
      // __ADDSHOPITEM entries are appended in every kind of shop
      let full = tab.entries.length >= MAX_VENDOR_INVENTORY;
      for (const { rec, e } of by.fixed) {
        const p = index.byId.get(u(e.item.value));
        if (!p) { tab.dropped.push({ rec, reason: 'not in Spec_Item.txt' }); continue; }
        if (full || tab.entries.length >= MAX_VENDOR_INVENTORY) { full = true; tab.dropped.push({ rec, prop: p, reason: 'tab full' }); continue; }
        tab.entries.push({ prop: p, source: rec, kind: 'fixed' });
      }
      delete tab.byKind;
    });
    return { tabs, chip };
  }

  FRE.vendorSim = { buildIndex, simulateNpc, expandRule, MAX_VENDOR_INVENTORY };
})(globalThis.FRE = globalThis.FRE || {});
