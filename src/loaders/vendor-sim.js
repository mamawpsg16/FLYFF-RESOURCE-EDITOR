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

  // ---- What players pay and get back (task S part 2) ----------------------------------------
  //   effectiveCosts <- CProject::LoadCharacter's AddShopItem branch (Project.cpp:3581): a price
  //                     overwrites pItem->dwCost server-wide; files load in Masquerade.prj order
  //                     (character.inc, character-etc.inc, character-school.inc: lines 104-106), so
  //                     the last one wins, and rule shops selling that item use it too (6b026003).
  //   buyPrice       <- CDPSrvr::OnBuyItem (WORLDSERVER/DPSrvr.cpp:3378-3405), Penya shops only
  //   sellPrice      <- CDPSrvr::OnSellItem (DPSrvr.cpp:3733-3766)
  //   getCost        <- CItemBase::GetCost (_Common/Item.cpp:135); shop items are +0
  // The rates are C++ floats (Project.h:1130). The WorldServer is Win32 / v143 (SSE2, /fp:precise),
  // so float * int is done in float32 and (int) of a float out of range gives INT_MIN (cvttss2si).
  // Not modelled: tax (only the Secret Room owner's tax rate), the karma discount (__VER < 8),
  // a player's gold (how many he can afford; the 2,100,000,000 cap when selling).
  const PERIN_VALUE = 100000000;       // define.h:265
  const INT_MIN = -2147483648;
  const f32 = Math.fround;
  const toInt = x => (Number.isNaN(x) || x >= 2147483648 || x < INT_MIN ? INT_MIN : Math.trunc(x));   // (int)float
  const mulInt = (rate, n) => toInt(f32(f32(rate) * f32(n)));
  const DEFAULT_RATES = { shopCost: 1, buy: 1, sell: 1 };

  // dwCost of every item after all AddShopItem prices: Map id -> { cost, base, by: [{npc, rec, cost}] }
  function effectiveCosts(itemsState, chars) {
    const out = new Map();
    for (const npc of chars.npcs) {
      for (const rec of npc.statements) {
        if (rec.cmd !== 'AddShopItem' || !rec.args.cost || !rec.args.item) continue;
        const id = u(rec.args.item.value);
        const item = itemsState.items.get(id);
        if (!item) continue;
        if (!out.has(id)) out.set(id, { base: u(FRE.specItem.get(item, 'dwCost')), by: [] });
        const o = out.get(id);
        o.cost = u(rec.args.cost.value);
        o.by.push({ npc, rec, cost: o.cost });
      }
    }
    return out;
  }
  // the dwCost the server ends up with (DWORD). An EXP scroll copy (60000+) is cloned in
  // LoadPropItem, before LoadCharacter, so it keeps the original's Spec_Item price.
  function costOf(costs, prop) {
    const o = costs && costs.get(prop.id);
    return o ? o.cost : u(FRE.specItem.get(prop.item, 'dwCost'));
  }
  const getCost = dwCost => (u(dwCost) === 0xffffffff ? -1 : (u(dwCost) | 0));

  // { pay, noPrice } : noPrice = the item's own cost is below 1 (or "="), so the minimum of 1 applies
  function buyPrice(prop, dwCost, rates, D) {
    rates = rates || DEFAULT_RATES;
    let n = getCost(dwCost);
    n = mulInt(rates.shopCost, n);
    n = mulInt(rates.buy, n);
    if (D && prop.id === u(D.get('II_SYS_SYS_SCR_PERIN'))) n = PERIN_VALUE;
    const min1 = n < 1;
    if (min1) n = 1;
    return { pay: n, min1 };
  }
  // why OnSellItem refuses an item (null = sellable)
  function sellRefused(prop, D) {
    const g = f => FRE.specItem.get(prop.item, f);
    if (u(g('dwItemKind3')) === u(D.get('IK3_EVENTMAIN'))) return 'event item (IK3_EVENTMAIN)';
    if (u(g('dwItemKind3')) === u(D.get('IK3_QUEST'))) return 'quest item';
    if (prop.id === u(D.get('II_SYS_SYS_SCR_SEALCHARACTER'))) return 'Sealed Character scroll';
    if (prop.id === u(D.get('II_SYS_SYS_SCR_PERIN'))) return 'Perin';
    if (g('dwParts') === D.get('PARTS_RIDE') && g('dwItemJob') === D.get('JOB_VAGRANT')) return 'vagrant flying item';
    return null;
  }
  // { get, refused }: what the NPC pays for one
  function sellPrice(prop, dwCost, rates, D) {
    rates = rates || DEFAULT_RATES;
    const refused = D ? sellRefused(prop, D) : null;
    const c = getCost(dwCost);
    let n = (c / 4) | 0;               // C int division (truncates toward 0: -1 / 4 = 0)
    n = mulInt(rates.sell, n);
    if (n === 0) n = 1;
    return { get: n, refused };
  }

  // What one tab sells, with prices: [{ prop, kind, source, dwCost, pay, min1, get, refused, setBy }]
  function pricedTab(costs, D, tab, rates) {
    return tab.entries.map(en => {
      const dwCost = costOf(costs, en.prop);
      const b = buyPrice(en.prop, dwCost, rates, D), s = sellPrice(en.prop, dwCost, rates, D);
      const o = costs && costs.get(en.prop.id);
      return Object.assign({ prop: en.prop, kind: en.kind, source: en.source, dwCost }, b, s,
        { setBy: o && o.by.length ? o.by[o.by.length - 1] : null });
    });
  }

  // Rule rows -> fixed items, giving the same tab (same items, same order). Every
  // AddVendorItem rule of this tab is replaced by one AddShopItem( tab, II_X ) per item it
  // added, without a price (dwCost and every other shop stay as they are; the 73ee4bd6 way).
  // The new lines go where the first rule (or an earlier fixed line of the tab) is, so they
  // come before the tab's existing fixed lines, as the generated items did (Mover.cpp:1723).
  // AddVendorItemLang rules are kept as they are (only commented-out ones exist, for LANG_TWN / LANG_JAP).
  // edits: { omit: Set(id), price: Map(id -> cost), slot: Map(id -> tab) } applied on the new lines.
  function ruleToFixedPlan(index, npc, slot, sim, edits = {}) {
    const plan = { slot, rules: [], items: [], anchor: null, blocked: null };
    if (npc.venderType === 1 || npc.venderType === 2) { plan.blocked = 'chip shops ignore AddVendorItem rules'; return plan; }
    const tab = sim.tabs[slot];
    for (const rec of npc.statements) {
      const e = FRE.character.shopEntry(rec);
      if (!e || e.slot !== slot) continue;
      if (e.kind === 'generated' && !e.lang) plan.rules.push(rec);
      if ((e.kind === 'generated' && !e.lang) || e.kind === 'fixed') { if (!plan.anchor) plan.anchor = rec; }
    }
    if (!plan.rules.length) { plan.blocked = 'this tab has no rule'; return plan; }
    for (const en of tab.entries) {
      if (en.kind !== 'generated') continue;
      const p = en.prop;
      if (p.ampCopyOf !== undefined || !p.item.define) { plan.blocked = `${p.item.define || p.id} has no item name to write (an EXP scroll copy made at load time)`; return plan; }
      if (edits.omit && edits.omit.has(p.id)) { plan.items.push({ prop: p, omitted: true }); continue; }
      plan.items.push({ prop: p, slot: edits.slot && edits.slot.has(p.id) ? edits.slot.get(p.id) : slot,
        cost: edits.price && edits.price.has(p.id) ? edits.price.get(p.id) : null });
    }
    return plan;
  }

  FRE.vendorSim = { buildIndex, simulateNpc, expandRule, MAX_VENDOR_INVENTORY,
    effectiveCosts, costOf, buyPrice, sellPrice, sellRefused, pricedTab, ruleToFixedPlan, DEFAULT_RATES, PERIN_VALUE };
})(globalThis.FRE = globalThis.FRE || {});
