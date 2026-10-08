// What happens when a player presses OK in the exchange window: a port of the WorldServer's
// exchange code, run on the recipes Exchange_Script.txt loads (FRE.exchange).
//   resultExchange  <- CDPSrvr::OnExchange (WORLDSERVER/DPSrvr.cpp:10721)
//                      + CExchange::ResultExchange (_Common/Exchange.cpp:434)
//   checkCondition  <- CExchange::CheckCondition (Exchange.cpp:269) + CMover::GetItemNum (MoverParam.cpp:3922)
//   payList         <- CExchange::GetPayItemList (Exchange.cpp:328) + xRandom / xRand
//   isFull          <- CExchange::IsFull (Exchange.cpp:399) + CItemContainer::GetEmptyCount (Item.h:470)
//   removeItem      <- CMover::RemoveItemA / RemoveAllItem (MoverParam.cpp:3964), CMover::AddGold (Mover.cpp:685)
//   createItem      <- CMover::CreateItem (Mover.cpp:2757) -> CItemContainer::IsFull / Add (Item.h:694, 726)
//   clientReply     <- CWndDialogEvent::ReceiveResult (_Interface/WndField.cpp:25019; Collins' chat line: commit 15091d5f)
//   rowView         <- CWndListBox::OnDraw for APP_DIALOG_EVENT (_Interface/WndControl.cpp:1973)
// __NEW_EXCHANGE_V19 is ON: the CONDITION items are the ones taken (REMOVE is ignored).
//
// Not modelled: the Perin auto-convert in AddGold (only above 2,000,000,000 Penya),
// CONDITION_POINT / REMOVE_POINT (campus points; no recipe uses them), the item and Penya
// logs, serial numbers, and packet timing (the OK button stays disabled until the reply).
// The server's random generator is one global shared by every roll on the server; here each
// run has its own seed, so the rolls are repeatable.
(function (FRE) {
  'use strict';
  const NULL_ID = 0xffffffff;
  const MAX_INVENTORY = 336;          // ProjectCmn.h:7
  const MAX_INVENTORY_FREE = 168;     // ProjectCmn.h:8: slots every character can use without a Bag Expansion
  const MAX_HUMAN_PARTS = 31;         // Mover.h:156: equipment slots, after the bag in the same container
  const PROB_TOTAL = 1000000;
  const FILLER = 0x7ffffff0;          // stands for "some other item" filling a bag slot
  const RESULT = ['SUCCESS', 'FAILED', 'INVENTORY_FAILED', 'CONDITION_FAILED'];   // CExchange enum order
  const short = v => (v << 16) >> 16;  // CItemElem::m_nItemNum is a short

  const rng = seed => FRE.xRandom.rng(seed);     // xRand / xRandom (core/xrandom.js)

  // Everything the simulator needs from the loaded files.
  function envFromWorkspace(ws) {
    const D = ws.defines.defines;
    return {
      gold: (D.get('II_GOLD_SEED1') >>> 0),
      collins: D.has('MMI_COLLECT01') ? D.get('MMI_COLLECT01') : null,
      prop(id) {
        if ((id >>> 0) === FILLER) return { packMax: 1, charged: 0, name: '(other item)' };
        const it = ws.itemById(id);
        if (!it) return null;
        const g = f => FRE.specItem.get(it, f);
        return { packMax: g('dwPackMax') >>> 0, charged: g('bCharged') ? 1 : 0, name: it.name || it.nameKey || it.define, define: it.define };
      },
      text: name => (ws.texts ? ws.texts.get(name) : '') || '',
    };
  }
  const nameOf = (env, id) => { const p = env.prop(id); return p ? p.name : `item ${id >>> 0}`; };

  // CExchange::m_mapExchange as the server builds it: the first block of a menu id wins,
  // at most 30 SETs; each SET as the server keeps it.
  function serverTable(model) {
    const menus = new Map();
    for (const [mmi, m] of model.byId) {
      const sets = m.sets.filter(s => !s.dropped).map(s => ({
        source: s,
        resultMsg: s.resultMsg.map(r => r.name),
        cond: s.condition.map(l => ({ id: l.item.value >>> 0, num: l.num.value, define: l.item.name, penya: !!l.item.penya })),
        pay: (s.paid ? s.paid.lines : []).map(x => ({ id: x.line.item.value >>> 0, num: x.line.num.value, prob: x.prob,
          flag: x.line.flag ? x.line.flag.value & 0xff : 0, define: x.line.item.name, line: x.line })),
        payNum: s.payNum ? s.payNum.value : 0,
        crash: !!(s.paid && s.paid.crash),     // vecPayItem[size()-1] on an empty list at startup
      }));
      menus.set(mmi, { menu: m, name: m.name, sets });
    }
    return { menus, find: mmi => menus.get(mmi) || null };
  }

  // ---------------------------------------------------------------- the player
  // slots[objId] for the bag (0..335, the server's object ids; a fresh container maps
  // position i to object id i), equip[] after it. unlocked = usable bag slots.
  function player({ gold = 0, unlocked = MAX_INVENTORY_FREE, items = [], equip = [] } = {}) {
    const p = { gold, unlocked, slots: new Array(MAX_INVENTORY).fill(null), equip: new Array(MAX_HUMAN_PARTS).fill(null) };
    let at = 0;
    for (const it of items) {
      while (at < MAX_INVENTORY && p.slots[at]) at++;
      if (at >= MAX_INVENTORY) throw new Error('the bag has no room for the starting items');
      p.slots[at++] = Object.assign({ flag: 0, charged: 0, busy: false }, it);
    }
    equip.forEach((it, i) => { p.equip[i] = Object.assign({ flag: 0, charged: 0, busy: false }, it); });
    return p;
  }
  const clone = p => ({ gold: p.gold, unlocked: p.unlocked, slots: p.slots.map(x => x && Object.assign({}, x)), equip: p.equip.map(x => x && Object.assign({}, x)) });
  // object id order: the bag, then the equipment (CItemContainer::GetMax() = bag + parts)
  const allSlots = p => [...p.slots.map((it, i) => ({ it, i, bag: true })), ...p.equip.map((it, i) => ({ it, i, bag: false }))];
  // IsUsableItem (Item.cpp:18): not in a locked bag slot, not in a trade / private shop (GetExtra() == 0)
  const usable = (p, s) => !(s.bag && s.i >= p.unlocked) && !s.it.busy;
  const freeSlots = p => p.slots.filter((x, i) => !x && i < p.unlocked).length;   // GetEmptyCount
  const countOf = (p, id) => allSlots(p).reduce((a, s) => a + (s.it && s.it.id === id ? s.it.num : 0), 0);

  // CMover::GetItemNum: the whole container; ANY unusable item makes it return 0
  function getItemNum(p, id) {
    let n = 0;
    for (const s of allSlots(p)) {
      if (!s.it) continue;
      if (!usable(p, s)) return 0;
      if (s.it.id === id) n += s.it.num;
    }
    return n;
  }

  // CExchange::CheckCondition
  function checkCondition(env, p, set) {
    const missing = [], texts = [];
    for (const c of set.cond) {
      const have = c.id === env.gold ? p.gold : getItemNum(p, c.id);
      if (have < c.num) {
        missing.push({ id: c.id, define: c.define, need: c.num, have });
        if (set.resultMsg.length < 2 && env.prop(c.id))
          texts.push(fmtText(env.text('TID_EXCHANGE_FAIL'), [nameOf(env, c.id), c.num]) || `TID_EXCHANGE_FAIL "${nameOf(env, c.id)}" ${c.num}`);
      }
    }
    return { ok: missing.length === 0, missing, texts };
  }

  // CExchange::GetPayItemList: roll, pick, take that line out, roll again over what is left
  function payList(set, r) {
    const list = [];
    const payItem = set.pay.slice();
    let nProb = PROB_TOTAL, nRandom = r.random(PROB_TOTAL), nSum = 0, nCount = 0;
    for (let i = 0; i < payItem.length;) {
      nSum += payItem[i].prob;
      if (nRandom < nSum) {
        list.push(payItem[i]);
        nCount++;
        if (nCount === set.payNum) break;
        nProb -= payItem[i].prob;
        if (nProb <= 0) break;
        nRandom = r.random(nProb);
        nSum = 0;
        payItem.splice(i, 1);
        i = 0;
      } else i++;
    }
    return list;
  }

  // CExchange::IsFull: empty slots + stacks the exchange uses up - qty / dwPackMax per reward
  function isFull(env, p, remove, pay) {
    let empty = freeSlots(p);
    for (const rm of remove) {
      let left = rm.num;
      for (let j = 0; j < MAX_INVENTORY; j++) {          // GetSize(): the bag only
        const it = p.slots[j];
        if (it && usable(p, { it, i: j, bag: true }) && it.id === rm.id) {
          if (it.num <= left) empty++;
          left -= it.num;
          if (left <= 0) break;
        }
      }
    }
    for (const x of pay) {
      const pr = env.prop(x.id);
      if (pr) empty -= Math.floor((x.num >>> 0) / pr.packMax) | 0;     // int / DWORD
    }
    return { full: empty <= 0, empty };
  }

  // CMover::RemoveItemA (nNum == -1: RemoveAllItem): object id order, the equipment included
  function removeItemA(p, id, n) {
    const slots = allSlots(p);
    if (n === -1) { let all = 0; for (const s of slots) if (s.it && s.it.id === id) { all += s.it.num; clear(p, s); } return all; }
    let rem = short(n);
    for (const s of slots) {
      if (rem <= 0) break;
      if (!s.it || s.it.id !== id) continue;
      if (rem > s.it.num) { rem -= s.it.num; clear(p, s); }
      else { s.it.num -= rem; rem = 0; if (!s.it.num) clear(p, s); }
    }
    return short(n) - rem;
  }
  const clear = (p, s) => { (s.bag ? p.slots : p.equip)[s.i] = null; };

  // CItemContainer::IsFull (Item.h:694): true = `num` of the item does not fit in the usable bag
  // positions (stacks with the same id, flag and bCharged first, then empty slots)
  function bagIsFull(env, p, id, num, flag, charged) {
    const pr = env.prop(id), pack = short(pr.packMax);
    const search = Math.min(p.unlocked, MAX_INVENTORY);
    let t = short(num);
    for (let i = 0; i < search; i++) {
      const e = p.slots[i];
      if (!e) { if (t > pack) t -= pack; else return false; }
      else if (e.id === id && e.flag === flag && e.charged === charged) { if (e.num + t > pack) t -= pack - e.num; else return false; }
    }
    return true;
  }

  // CItemContainer::IsFull + Add (via CMover::CreateItem): stack with the same id, flag and
  // bCharged first, then empty slots; false = it does not fit (nothing is added).
  // charged: the new item's m_bCharged (the exchange copies the prop's bCharged; null = that)
  function createItem(env, p, id, num, flag, chargedIn = null) {
    const pr = env.prop(id);
    if (!pr || id === 0) return false;
    const pack = short(pr.packMax), charged = chargedIn === null ? pr.charged : chargedIn;
    const search = Math.min(p.unlocked, MAX_INVENTORY);
    let n = short(num);
    if (bagIsFull(env, p, id, n, flag, charged)) return false;
    if (pr.packMax !== 1) {
      for (let i = 0; i < search; i++) {
        const e = p.slots[i];
        if (e && e.id === id && e.num < pack && e.flag === flag && e.charged === charged) {
          if (e.num + n > pack) { n -= pack - e.num; e.num = pack; }
          else { e.num += n; n = 0; break; }
        }
      }
    }
    if (n > 0) {
      for (let i = 0; i < search; i++) {
        if (p.slots[i]) continue;
        if (n > pack) { p.slots[i] = { id, num: pack, flag, charged, busy: false }; n -= pack; }
        else { p.slots[i] = { id, num: n, flag, charged, busy: false }; n = 0; break; }
      }
    }
    return true;
  }

  // CExchange::ResultExchange: one press of OK. Changes p.
  function resultExchange(env, table, p, mmi, listNum, r) {
    const out = { result: 'FAILED', missing: [], taken: [], given: [], lost: [], texts: [], rolled: [] };
    const m = table.find(mmi);
    if (!m || listNum > m.sets.length - 1 || listNum < 0) return out;
    const set = m.sets[listNum];
    out.set = set;
    const cc = checkCondition(env, p, set);
    out.missing = cc.missing; out.texts.push(...cc.texts);
    if (!cc.ok) { out.result = 'CONDITION_FAILED'; return out; }
    const remove = set.cond;                              // __NEW_EXCHANGE_V19: REMOVE = CONDITION
    const pay = payList(set, r);
    out.rolled = pay;
    const bag = isFull(env, p, remove, pay);
    out.emptyEstimate = bag.empty;
    if (bag.full) { out.result = 'INVENTORY_FAILED'; return out; }
    for (const rm of remove) {
      if (rm.id === env.gold) { p.gold = Math.max(0, p.gold - rm.num); out.taken.push({ id: rm.id, define: rm.define, num: rm.num, penya: true }); continue; }
      let n = rm.num, got = 0;
      while (n > 0x7fff) { got += removeItemA(p, rm.id, 0x7fff); n -= 0x7fff; }
      got += removeItemA(p, rm.id, n);
      out.taken.push({ id: rm.id, define: rm.define, num: got });
    }
    for (const x of pay) {
      // itemElem.GetProp()->bCharged with no prop: a null read, the WorldServer crashes
      if (!env.prop(x.id)) { out.result = 'CRASH'; out.crashOn = x; return out; }
      if (createItem(env, p, x.id, x.num, x.flag)) {
        out.given.push(x);
        if (set.resultMsg.length < 2) out.texts.push(fmtText(env.text('TID_EXCHANGE_SUCCESS'), [nameOf(env, x.id), short(x.num)]) || `TID_EXCHANGE_SUCCESS "${nameOf(env, x.id)}" ${short(x.num)}`);
      } else out.lost.push(x);                             // Error(...) in the server log, the item is gone
    }
    out.result = 'SUCCESS';
    return out;
  }

  // AddDefinedText: the client fills each %s / %d of the text with the next argument
  function fmtText(fmt, args) {
    if (!fmt) return '';
    let i = 0;
    return fmt.replace(/%[sd]/g, () => String(i < args.length ? args[i++] : ''));
  }

  // CWndDialogEvent::ReceiveResult: what the player reads. clientTable is the CLIENT's copy;
  // the client looks up the recipe at the position it sent.
  function clientReply(env, clientTable, mmi, listNum, res) {
    const m = clientTable.find(mmi), set = m && m.sets[listNum];
    const msgs = set ? set.resultMsg : [];
    const out = { chat: [...res.texts], box: null };
    if (env.collins !== null && mmi === env.collins) {     // 15091d5f: one chat line, no message box
      if (res.result === 'SUCCESS') {
        const first = set && set.pay.length ? set.pay[0] : null;
        const pr = first && env.prop(first.id);
        out.chat.push(pr ? `Exchange complete! You received ${pr.name} x${first.num}.` : 'Exchange complete!');
      } else if (res.result === 'INVENTORY_FAILED') out.chat.push(env.text('TID_GAME_LACKSPACE') || 'TID_GAME_LACKSPACE');
      else if (res.result === 'CONDITION_FAILED') out.chat.push('You do not have the required Pieces.');
      else out.chat.push('Exchange failed.');
      return out;
    }
    if (res.result === 'SUCCESS') { if (msgs.length === 2) out.box = env.text(msgs[0]) || msgs[0]; }
    else if (res.result === 'INVENTORY_FAILED') out.box = env.text('TID_GAME_LACKSPACE') || 'TID_GAME_LACKSPACE';
    else if (res.result === 'CONDITION_FAILED') { if (msgs.length === 2) out.box = env.text(msgs[1]) || msgs[1]; }
    else if (res.result === 'FAILED') out.box = 'FAILED';
    return out;
  }

  // The recipe row (WndControl.cpp:1973): an ingredient icon is dimmed when the bag holds
  // fewer than needed (m_Inventory.GetItemCount: bag + equipment, no usable check; Penya is
  // never in the bag, so its icon is always dimmed). Rewards light up one at a time, 2 s each.
  function rowView(env, set, p) {
    return {
      cond: set.cond.filter(c => env.prop(c.id)).map(c => ({ id: c.id, num: c.num, have: countOf(p, c.id), dim: countOf(p, c.id) < c.num })),
      pay: set.pay.filter(x => env.prop(x.id)).map(x => ({ id: x.id, num: x.num })),
    };
  }

  // The bag a test player starts with: the ingredients for `times` exchanges (in full
  // stacks), then other items until exactly `free` usable slots are left.
  function stockedPlayer(env, set, { times = 1, free = 10, unlocked = MAX_INVENTORY_FREE, gold = 0 } = {}) {
    const items = [];
    let g = gold;
    for (const c of set.cond) {
      const need = Math.max(0, c.num) * times;
      if (c.id === env.gold) { g += need; continue; }
      const pr = env.prop(c.id);
      const pack = pr && pr.packMax > 0 ? Math.min(pr.packMax, 0x7fff) : 1;
      for (let left = need; left > 0; left -= pack) items.push({ id: c.id, num: Math.min(pack, left), charged: pr ? pr.charged : 0 });
    }
    const other = unlocked - items.length - free;
    if (other < 0) throw new Error(`the ingredients for ${times} exchange${times > 1 ? 's' : ''} need ${items.length} bag slots; with ${free} free that is more than the ${unlocked} slots`);
    for (let i = 0; i < other; i++) items.push({ id: FILLER, num: 1 });
    return player({ gold: g, unlocked, items });
  }

  // Press OK `tries` times on one recipe.
  //   mode 'same': the same bag every time (ingredients for one exchange + `free` empty slots):
  //                how often each reward comes out.
  //   taken: Map define -> { id, num, penya }
  //   mode 'keep': one bag with ingredients for `stock` exchanges + `free` empty slots; the
  //                rewards stay in the bag, so it can fill up or run out of ingredients.
  function run(env, table, mmi, listNum, { tries = 1000, seed = 1, mode = 'same', free = 10, stock = tries, unlocked = MAX_INVENTORY_FREE, clientTable = null } = {}) {
    const m = table.find(mmi), set = m && m.sets[listNum];
    if (!set) throw new Error('no such recipe on the server');
    if (set.crash) throw new Error('this recipe has an empty PAY list: the server crashes at startup');
    const r = rng(seed);
    const start = mode === 'same' ? stockedPlayer(env, set, { times: 1, free, unlocked }) : stockedPlayer(env, set, { times: stock, free, unlocked });
    let p = clone(start);
    const results = { SUCCESS: 0, CONDITION_FAILED: 0, INVENTORY_FAILED: 0, FAILED: 0, CRASH: 0 };
    const perLine = new Map(set.pay.map(x => [x, { line: x, times: 0, qty: 0, lost: 0 }]));
    const taken = new Map(), samples = {};
    let lostTotal = 0;
    for (let k = 0; k < tries; k++) {
      if (mode === 'same') p = clone(start);
      const res = resultExchange(env, table, p, mmi, listNum, r);
      results[res.result]++;
      for (const x of res.given) { const e = perLine.get(x); e.times++; e.qty += short(x.num); }
      for (const x of res.lost) { perLine.get(x).lost++; lostTotal++; }
      for (const t of res.taken) { const e = taken.get(t.define) || taken.set(t.define, { id: t.id, num: 0, penya: !!t.penya }).get(t.define); e.num += t.num; }
      if (!samples[res.result] || (res.lost.length && !samples.LOST)) {
        const view = clientReply(env, clientTable || table, mmi, listNum, res);
        if (!samples[res.result]) samples[res.result] = { res, view };
        if (res.lost.length && !samples.LOST) samples.LOST = { res, view };
      }
      if (res.result === 'CRASH') break;
    }
    const given = [...perLine.values()].map(e => Object.assign(e, { serverPct: e.line.prob / PROB_TOTAL * 100,
      seenPct: results.SUCCESS ? e.times / results.SUCCESS * 100 : 0 }));
    return { set, tries, mode, results, given, taken, lost: lostTotal, samples, end: p, start };
  }

  FRE.exchangeSim = { rng, envFromWorkspace, serverTable, player, clone, getItemNum, checkCondition, payList, isFull, removeItemA, createItem,
    resultExchange, clientReply, rowView, stockedPlayer, run, fmtText, countOf, freeSlots, bagIsFull, allSlots, short, RESULT, MAX_INVENTORY, MAX_INVENTORY_FREE, FILLER, NULL_ID };
})(globalThis.FRE = globalThis.FRE || {});
