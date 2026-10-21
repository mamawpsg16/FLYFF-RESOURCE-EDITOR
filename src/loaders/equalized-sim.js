// Equalized PvP simulator (task "PvP Events"): what a player gets on entry from one preset, ported from the C++ (no DOM).
//   EqPlaceItem (EqualizedPvP.cpp:~739): items in file order; an unknown item is skipped; HP / ATTACK items need a body slot (dwParts),
//   a BAG item does not; the amount is cut to the stack size; a 2nd ring / earring goes to the 2nd slot; a 2nd item for a taken slot
//   stays in the bag; HP items are worn. After the block: the Attack set keeps the HP item in every slot it leaves empty (a switch
//   never undresses the player). CEqualizedPvP::Enter (EqualizedPvP.cpp:~474): level 150 Hero / Legend of the class, every skill maxed,
//   stats 15 + points to spend, the preset bag, Quick Switch "HP" on key 9 and "Attack" on key 0 (GiveSwitchSets).
// Not modelled: a full bag (336 slots), DoEquip refusing an item (the server logs "could not equip").
(function (FRE) {
  'use strict';
  const E = () => FRE.equalized;
  const isNull = v => v === -1 || v === 0xFFFFFFFF || v === undefined || v === null;

  // block: a readPresets block; ctx: { defines, items } -> { worn: { part: item }, attack: { part: item }, bag: [{ item, count }],
  //   placed: [{ sec, item, part, worn, why }], problems: [{ message, item }] }
  function enter(block, ctx) {
    const D = ctx.defines, items = ctx.items, spec = FRE.specItem;
    const P = n => D.get(n);
    const out = { worn: {}, attack: {}, bag: [], placed: [], problems: [] };
    const sets = { HP: out.worn, ATTACK: out.attack };
    out.buffPet = { HP: null, ATTACK: null }; out.raisedPet = { HP: null, ATTACK: null };
    for (const name of block.order) {
      const sec = block.sections[name];
      for (const it of sec.items) {
        if (it.raisedPet !== undefined) {           // EqPlaceRaisedPet: a level S pet of that kind
          const ok = it.raisedPet >= 0 && it.raisedPet < 7;
          if (!ok) { out.problems.push({ message: 'RAISEDPET needs PK_TIGER … PK_UNICORN', item: it }); out.placed.push({ sec: name, item: it, part: null, worn: false, why: 'badPet' }); continue; }
          const slot = name === 'BAG' ? null : out.raisedPet[name] ? 'taken' : 'set';
          if (slot === 'set') out.raisedPet[name] = it;
          out.placed.push({ sec: name, item: it, part: null, worn: false, why: slot === 'set' ? 'raisedPet' : 'bag' });
          continue;
        }
        const rec = it.id >= 0 ? items.get(it.id >>> 0) : null;
        if (!rec) { out.problems.push({ message: `unknown item ${it.define || it.id}, skipped`, item: it }); out.placed.push({ sec: name, item: it, part: null, worn: false, why: 'unknown' }); continue; }
        const parts = spec.get(rec, 'dwParts');
        const buffPet = name !== 'BAG' && isBuffPet(rec, ctx.defines);
        if (name !== 'BAG' && isNull(parts) && !buffPet) { out.problems.push({ message: `${rec.name || rec.define} can't be worn (put it in BAG), skipped`, item: it }); out.placed.push({ sec: name, item: it, part: null, worn: false, why: 'notWearable' }); continue; }
        const pack = spec.get(rec, 'dwPackMax');
        let count = it.count > 0 ? it.count : 1;
        if (pack > 0 && count > pack) count = pack;
        const entry = { rec, item: it, count };
        out.bag.push(entry);
        if (name === 'BAG') { out.placed.push({ sec: name, item: it, part: null, worn: false, why: 'bag', count }); continue; }
        if (buffPet) {                               // the switch set's pet slot (a 2nd one stays in the bag)
          const first = !out.buffPet[name];
          if (first) out.buffPet[name] = entry;
          out.placed.push({ sec: name, item: it, part: null, worn: false, why: first ? 'buffPet' : 'bag' });
          continue;
        }
        const set = sets[name];
        let part = parts;
        if (set[part] && (part === P('PARTS_RING1') || part === P('PARTS_EARRING1'))) part++;
        // Slayer (Blade line): a 2nd one-handed weapon to the left hand (right holds a one-handed one, no shield; MoverEquip.cpp:528)
        const R = P('PARTS_RWEAPON'), one = r => spec.get(r, 'dwHanded') === D.get('HD_ONE');
        if (block.cls === 0 && part === R && set[R] && !set[P('PARTS_SHIELD')] && !set[P('PARTS_LWEAPON')] && one(rec) && one(set[R].rec)
          && rec.id !== D.get('II_WEA_KNU_ISHOFIST')) part = P('PARTS_LWEAPON');
        if (set[part]) { out.problems.push({ message: `two items for the same slot, ${rec.name || rec.define} stays in the bag`, item: it }); out.placed.push({ sec: name, item: it, part, worn: false, why: 'slotTaken' }); continue; }
        set[part] = entry;
        entry.worn = name === 'HP';
        out.placed.push({ sec: name, item: it, part, worn: name === 'HP', why: 'set' });
      }
    }
    for (const part of Object.keys(out.worn)) if (!out.attack[part]) out.attack[part] = out.worn[part];
    return out;
  }

  // an element is only for a suit or a weapon (CItemElem::IsEleRefineryAble, Item.cpp:403)
  const elementOk = (rec, D) => !!rec && (FRE.specItem.get(rec, 'dwItemKind3') === D.get('IK3_SUIT') || FRE.specItem.get(rec, 'dwItemKind2') === D.get('IK2_WEAPON_MAGIC')
    || FRE.specItem.get(rec, 'dwItemKind2') === D.get('IK2_WEAPON_DIRECT'));
  const isBuffPet = (rec, D) => FRE.specItem.get(rec, 'dwItemKind3') === D.get('IK3_PET') && FRE.specItem.get(rec, 'dwReferStat1') === D.get('PET_VIS');
  // the item's wear rules for a Lv150 Hero / Legend of class c, sex x -> [message] (empty = fine). Spec_Item: dwItemJob (NULL = any job;
  // else one job of the class's chain), dwItemSex (NULL = both), dwLimitLevel1 (the level needed).
  function wearIssues(rec, c, x, D) {
    const spec = FRE.specItem, out = [], cl = E().CLASSES[c];
    const job = spec.get(rec, 'dwItemJob'), sex = spec.get(rec, 'dwItemSex'), lv = spec.get(rec, 'dwLimitLevel1');
    if (!isNull(job) && !cl.chain.some(j => D.get(j) === job)) out.push(`it is for another job (${cl.label} can't wear it)`);
    if (!isNull(sex) && sex !== x && (sex === 0 || sex === 1)) out.push(`it is a ${sex === 0 ? 'male' : 'female'} item`);
    if (!isNull(lv) && lv > E().EQ_LEVEL) out.push(`it needs level ${lv} (everyone inside is ${E().EQ_LEVEL})`);
    return out;
  }

  // sockets of an item and what goes in them: CItemElem::IsPierceAble (Item.cpp:803). Suits (IK3_SUIT) 4 x IK3_SOCKETCARD; weapons
  // (IK2_WEAPON_DIRECT / _MAGIC) and shields 10 x IK3_SOCKETCARD2; buff pets (IK3_PET + dwReferStat1 PET_VIS) 9 x IK3_VIS beads;
  // anything else none. -> { cap, kind3 (the card's dwItemKind3), what }
  function sockets(rec, D) {
    const g = f => FRE.specItem.get(rec, f);
    const k2 = g('dwItemKind2'), k3 = g('dwItemKind3');
    if (k3 === D.get('IK3_SUIT')) return { cap: 4, kind3: D.get('IK3_SOCKETCARD'), what: 'card' };
    if (k3 === D.get('IK3_SHIELD') || k2 === D.get('IK2_WEAPON_DIRECT') || k2 === D.get('IK2_WEAPON_MAGIC')) return { cap: 10, kind3: D.get('IK3_SOCKETCARD2'), what: 'card' };
    if (k3 === D.get('IK3_PET') && g('dwReferStat1') === D.get('PET_VIS')) return { cap: 9, kind3: D.get('IK3_VIS'), what: 'bead' };
    return { cap: 0, kind3: null, what: 'card' };
  }

  // class caps of one event: how many may still pick each class (0 = greyed in the window)
  function capsLeft(ev, counts) { return ev.caps.map((cap, c) => Math.max(0, cap - (counts ? counts[c] || 0 : 0))); }

  // a Baruna item: ItemProp::IsBaruna (ProjectCmn.h:581), dwReferStat1 BARUNA_D..BARUNA_S
  const isBaruna = (rec, D) => { const r = rec ? FRE.specItem.get(rec, 'dwReferStat1') : null; return !isNull(r) && r >= D.get('BARUNA_D') && r <= D.get('BARUNA_S'); };
  // what ULTIMATE / RUNE / JEWEL make of one item (V19 feat/eq-baruna-runes, EqPlaceItem):
  //   ULTIMATE on a Baruna weapon (IsBaruna + IK1_WEAPON) = Ultimate Baruna (CItemElem::ultbaruna): attack x1.6 (UltBarunaAtk), own positive stats +8% rounded,
  //     not attack speed (UltBarunaStat, Item.cpp:435); 3 rune positions in front of the cards.
  //   RUNE: IK3_BARUNAWEA_PIERCE_RUNE only, one per stat (same id or dwDestParam1), into the slots the level opens (GetOpenRuneSlots:
  //     1 at +0, 2 at +5, 3 at +10), in file order.
  //   JEWEL: on WEAPON_ULTIMATE or an Ultimate Baruna, ability items of Ultimate_GemAbility.txt only. Their stats: GetDestParamUltimate
  //     (UltimateWeapon.cpp:889): the slots up to the first empty one, on a Baruna only the first upgrade - 5; per jewel item its count
  //     n, its stat = its dwReferStat2, the value = GetDST: that stat's ABILITY block, that item's vN; summed per stat.
  // gems: FRE.gemAbility.load(…) or null -> { ult, runes: [id], jewels: [id], skipped: [{ id, why }], jewelStats: { dst: value },
  //   activeJewels, openRunes }; why: notBaruna, needsUltimate, notRune, sameStat, closed, needsUltimateWeapon, notJewel
  function ultimateParts(item, rec, D, items, gems) {
    const out = { ult: false, runes: [], jewels: [], skipped: [], jewelStats: {}, activeJewels: 0, openRunes: 0 };
    if (!rec) return out;
    // a Baruna weapon (Udi makes only weapons Ultimate; Baruna armor is Baruna grade too)
    const up = item.upgrade > 0 ? item.upgrade : 0, bar = isBaruna(rec, D) && FRE.specItem.get(rec, 'dwItemKind1') === D.get('IK1_WEAPON');
    if (item.ultimate && !bar) out.skipped.push({ id: item.id, why: 'notBaruna' });
    out.ult = !!item.ultimate && bar;
    const runes = item.runes || [], jewels = item.jewels || [];
    if (out.ult) {
      out.openRunes = 1 + (up >= 5 ? 1 : 0) + (up >= 10 ? 1 : 0);
      for (const id of runes) {
        const r = items.get(id >>> 0);
        if (!r || FRE.specItem.get(r, 'dwItemKind3') !== D.get('IK3_BARUNAWEA_PIERCE_RUNE')) { out.skipped.push({ id, why: 'notRune' }); continue; }
        const dst = FRE.specItem.get(r, 'dwDestParam1');
        if (out.runes.some(x => x === id || FRE.specItem.get(items.get(x >>> 0), 'dwDestParam1') === dst)) { out.skipped.push({ id, why: 'sameStat' }); continue; }
        if (out.runes.length >= out.openRunes) { out.skipped.push({ id, why: 'closed' }); continue; }
        out.runes.push(id);
      }
    } else for (const id of runes) out.skipped.push({ id, why: 'needsUltimate' });
    if (jewels.length) {
      if (FRE.specItem.get(rec, 'dwReferStat1') !== D.get('WEAPON_ULTIMATE') && !out.ult) for (const id of jewels) out.skipped.push({ id, why: 'needsUltimateWeapon' });
      else for (const id of jewels) { if (gems && gems.byItem.has(id >>> 0)) out.jewels.push(id); else out.skipped.push({ id, why: 'notJewel' }); }
    }
    let active = out.jewels.length;
    if (bar) active = Math.min(active, Math.max(0, up - 5));
    out.activeJewels = active;
    const count = new Map();
    for (let i = 0; i < active; i++) count.set(out.jewels[i], (count.get(out.jewels[i]) || 0) + 1);
    for (const [id, n] of count) {
      const r = items.get(id >>> 0), dst = r ? FRE.specItem.get(r, 'dwReferStat2') : null;
      const ab = gems ? gems.abilities.find(a => a.dst === dst) : null, g = ab ? ab.gems.find(x => x.item === id >>> 0) : null;
      out.jewelStats[dst] = (out.jewelStats[dst] || 0) + (g ? g.values[n - 1] : 0);
    }
    return out;
  }

  FRE.equalizedSim = { isBaruna, ultimateParts, elementOk, isBuffPet: (r, D) => isBuffPet(r, D), enter, wearIssues, sockets, capsLeft, isNull };
})(globalThis.FRE = globalThis.FRE || {});
