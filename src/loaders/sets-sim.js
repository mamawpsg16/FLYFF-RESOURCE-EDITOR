// What a set gives in game (task G part 1): a port of the server code that USES propItemEtc.inc SetItem and the
// expTable.inc Setitem table. No guessing; what is not modelled is listed below.
//   Login / full recalc: CMover::RedoEquip (_Common/MoverEquip.cpp:2186-2194): GetSetItem() -> SetSetItemAvail, then
//     SetDestParamSetItem( NULL ) (Mover.cpp:9850): every worn, not expired item in ANY slot counts for the set its item
//     id is in (CSetItemFinder: the first set), GetItemAvail( n, bAll ) = every row up to n.
//   Put on one item: SetDestParamEquip (MoverEquip.cpp:2355, 2452-2459): nothing for an expired item; GetSetItem( item ) ->
//     SetSetItemAvail; SetDestParamSetItem( item ): GetEquipedSetItemNumber (Mover.cpp:9913) counts only pieces in THEIR
//     listed slot, and only the rows needing exactly that count are added.
//   Take off: DoEquip removes the item from its slot first (MoverEquip.cpp:589-597), then ResetDestParamEquip (:2469,
//     2578-2582): GetSetItem( item ) -> ResetSetItemAvail; ResetDestParamSetItem (Mover.cpp:9896): rows needing exactly
//     count + 1 are taken away. Putting an item into a full slot takes the old one off first.
//   +N bonus: GetSetItem (Mover.cpp:9562): suit, gauntlets, boots and helmet all worn and not expired -> the lowest +N
//     (GetAbilityOption); an item that is not one of those 4 parts gives 0. SetSetItemAvail (:9654): HitRate ->
//     DST_ADJ_HITRATE, Block -> DST_BLOCK_RANGE + DST_BLOCK_MELEE, Max HP % -> DST_HP_MAX_RATE, AddMagic -> DST_ADDMAGIC,
//     Added -> STR, DEX, INT, STA; a 0 is skipped. GetSetItemAvail: +1..+10 only.
//   Tooltip: CWndMgr::PutSetItemOpt (_Interface/WndManager.cpp:5553, 70f8c863) for the player hovering a piece.
// Not modelled: SetDestParam's own effects (caps, DST_STAT_ALLUP spreading, HP refill): totals are the sums it is given;
// which item may go in which slot (DoEquip's job / level / sex checks): the caller picks slots; the ITEMAVAIL array of the
// login path has 32 places (more different stats than that run past it: `overflow` says so, the extra stats are counted).
(function (FRE) {
  'use strict';
  const S = () => FRE.sets;
  const ARMOR = ['PARTS_UPPER_BODY', 'PARTS_HAND', 'PARTS_FOOT', 'PARTS_CAP'];   // GetSetItem's adwParts order
  const MAX_HUMAN_PARTS = 31;

  // env: the model, item props (dwParts, name), defines
  function envFor(ws, model) {
    const D = ws.defines.defines;
    return { model: model || ws.models.sets, D, items: ws.items.items, texts: ws.texts, words: FRE.itemTooltip.dstWords(ws),
      part: id => { const it = ws.items.items.get(id >>> 0); return it ? FRE.specItem.get(it, 'dwParts') : null; },
      name: id => { const it = ws.items.items.get(id >>> 0); return it ? (it.name || it.define) : null; } };
  }

  // a character: worn = slot -> { id, plus, expired }; stats = dst -> total
  function blank() { return { worn: new Map(), stats: new Map(), log: [] }; }
  const add = (ch, dst, adj, sign) => { const v = ((ch.stats.get(dst) || 0) + sign * adj) | 0; if (v) ch.stats.set(dst, v); else ch.stats.delete(dst); };

  // CMover::GetSetItem( pItemElem ) (Mover.cpp:9562); item = { id, plus, expired } or null (= the suit)
  function getSetItem(env, ch, item) {
    const P = ARMOR.map(n => env.D.get(n));
    let it = item;
    if (!it) it = ch.worn.get(P[0]) || null;
    else if (!P.includes(env.part(it.id))) return 0;
    if (!it || it.expired) return 0;
    let n = it.plus | 0;
    const own = env.part(it.id);
    for (const p of P) {
      if (own === p) continue;
      const o = ch.worn.get(p);
      if (o && !o.expired) { if (n > (o.plus | 0)) n = o.plus | 0; continue; }
      return 0;
    }
    return n;
  }
  // SetSetItemAvail / ResetSetItemAvail (:9654, :9681)
  function plusStats(env, n) {
    const r = S().plusRow(env.model.plus, n);
    if (!r) return [];
    const K = name => env.D.get(name), out = [];
    if (r.hit) out.push([K('DST_ADJ_HITRATE'), r.hit]);
    if (r.block) out.push([K('DST_BLOCK_RANGE'), r.block], [K('DST_BLOCK_MELEE'), r.block]);
    if (r.hp) out.push([K('DST_HP_MAX_RATE'), r.hp]);
    if (r.magic) out.push([K('DST_ADDMAGIC'), r.magic]);
    if (r.added) for (const s of ['DST_STR', 'DST_DEX', 'DST_INT', 'DST_STA']) out.push([K(s), r.added]);
    return out;
  }
  // GetEquipedSetItemNumber (:9913): pieces in their own listed slot, not expired
  function listedCount(ch, set) {
    let n = 0;
    for (const p of set.elems) { const o = ch.worn.get(p.part); if (o && (o.id >>> 0) === p.id && !o.expired) n++; }
    return n;
  }
  // GetEquipedSetItem (:9925): which listed pieces are worn (by the set with that id)
  function equipedFlags(env, ch, setId) {
    const set = env.model.byId.get(setId), flags = [];
    if (!set) return { flags, n: 0 };
    for (const p of set.elems) { const o = ch.worn.get(p.part); flags.push(!!(o && (o.id >>> 0) === p.id && !o.expired)); }
    return { flags, n: flags.filter(Boolean).length };
  }

  // RedoEquip's part: the totals right after login (or any full recalc)
  function login(env, worn) {
    const ch = blank();
    for (const [slot, it] of worn) ch.worn.set(slot, it);
    const n = getSetItem(env, ch, null);
    if (n > 0) for (const [d, a] of plusStats(env, n)) add(ch, d, a, 1);
    // SetDestParamSetItem( NULL ): count by item id in every slot
    const per = new Map();
    for (let slot = 0; slot < MAX_HUMAN_PARTS; slot++) {
      const it = ch.worn.get(slot);
      if (!it || it.expired) continue;
      const set = env.model.byItem.get(it.id >>> 0);
      if (set) per.set(set, (per.get(set) || 0) + 1);
    }
    const avail = [];
    for (const [set, k] of per) S().itemAvail(set, k, true, avail);
    for (const [d, a] of avail) add(ch, d, a, 1);
    ch.overflow = avail.length > S().MAX_AVAIL;
    ch.plusN = n;
    ch.counts = [...per].map(([set, k]) => [set.id, k]);
    return ch;
  }

  // one step: put `item` ({ id, plus, expired }) into `slot`, or take the slot's item off (item null)
  function takeOff(env, ch, slot) {
    const old = ch.worn.get(slot);
    if (!old) return;
    ch.worn.delete(slot);
    if (old.expired) return;                                       // ResetDestParamEquip returns for an expired item
    const n = getSetItem(env, ch, old);
    if (n > 0) for (const [d, a] of plusStats(env, n)) add(ch, d, a, -1);
    const set = env.model.byItem.get(old.id >>> 0);
    if (set) {
      const k = listedCount(ch, set);
      for (const [d, a] of S().itemAvail(set, k + 1, false)) add(ch, d, a, -1);
      ch.log.push({ off: slot, id: old.id, set: set.id, count: k, rows: k + 1 });
    }
  }
  function putOn(env, ch, slot, item) {
    if (ch.worn.has(slot)) takeOff(env, ch, slot);
    ch.worn.set(slot, item);
    if (item.expired) return;                                      // SetDestParamEquip returns for an expired item
    const n = getSetItem(env, ch, item);
    if (n > 0) for (const [d, a] of plusStats(env, n)) add(ch, d, a, 1);
    const set = env.model.byItem.get(item.id >>> 0);
    if (set) {
      const k = listedCount(ch, set);
      for (const [d, a] of S().itemAvail(set, k, false)) add(ch, d, a, 1);
      ch.log.push({ on: slot, id: item.id, set: set.id, count: k, rows: k });
    }
  }
  // steps: [[slot, item | null], …] from nothing worn
  function wear(env, steps, start) {
    const ch = start || blank();
    for (const [slot, item] of steps) item ? putOn(env, ch, slot, item) : takeOff(env, ch, slot);
    return ch;
  }
  const statList = ch => [...ch.stats].sort((a, b) => a[0] - b[0]);

  // CWndMgr::PutSetItemOpt for the player hovering item `id`; bag: id -> count (GetItemNumForClient)
  // lines: [{ text, color }] with colours dwSetName / dwSetItem1 (worn) / dwSetItem2 (in the bag) / dwSetItem0 / dwSetEffect
  function tooltip(env, ch, id, bag) {
    const set = env.model.byItem.get(id >>> 0);
    if (!set) return [];
    const { flags, n } = equipedFlags(env, ch, set.id);
    const lines = [{ text: `\n\n${set.name} (${listedCount(ch, set)}/${set.elems.length})`, color: 'name' }];
    set.elems.forEach((p, i) => {
      const nm = env.name(p.id);
      if (nm === null) return;                                      // prj.GetItemProp NULL: no line
      lines.push({ text: `\n   ${nm}`, color: flags[i] ? 'worn' : (bag && bag.get(p.id) > 0 ? 'bag' : 'none'), id: p.id });
    });
    const head = (env.texts && env.texts.get('TID_TOOLTIP_SET')) || 'Set Effect';
    let last = -1;
    for (const r of set.avail) {
      const on = n >= r.need;
      if (r.need !== last) { lines.push({ text: `\n${head} (${r.need}pc):`, color: on ? 'active' : 'inactive', head: r.need }); last = r.need; }
      // IsDst_Rate (WndManager.cpp:4975): its list holds three 0 entries, so stat 0 (an unknown name) shows as a rate too
      const w = env.words.get(r.dst) || { word: '' }, rate = w.rate || r.dst === 0;
      lines.push({ text: rate ? `\n${w.word} ${rateValue(env, r.dst, r.adj)}%` : `\n${w.word} +${r.adj}`, color: on ? 'active' : 'inactive', dst: r.dst, adj: r.adj, need: r.need, rate });
    }
    return lines;
  }
  // FormatDstRateValue (WndManager.cpp:5070)
  function rateValue(env, dst, adj) {
    if (dst === env.D.get('DST_ATTACKSPEED')) return adj % 20 === 0 ? FRE.itemTooltip.cfmt('%+d', adj / 20) : FRE.itemTooltip.cfmt('%+.1f', Math.fround(adj / 20));
    return FRE.itemTooltip.cfmt('%+d', adj);
  }

  // the slots a piece can be worn in: its dwParts; a ring / earring also in the other ring / earring slot (DoEquip)
  function slotsOf(env, id) {
    const p = env.part(id), K = n => env.D.get(n);
    if (p === null || p === undefined) return [];
    if (p === K('PARTS_RING1') || p === K('PARTS_RING2')) return [K('PARTS_RING1'), K('PARTS_RING2')];
    if (p === K('PARTS_EARRING1') || p === K('PARTS_EARRING2')) return [K('PARTS_EARRING1'), K('PARTS_EARRING2')];
    return [p];
  }

  FRE.setsSim = { envFor, blank, login, putOn, takeOff, wear, statList, tooltip, getSetItem, plusStats, listedCount, equipedFlags, slotsOf, rateValue, ARMOR, MAX_HUMAN_PARTS };
})(globalThis.FRE = globalThis.FRE || {});
