// What happens when a player uses a box: a port of the WorldServer's use-item path for boxes, run on what
// loaders/boxes.js loads.
//   open        <- CUser::OnDoUseItem (WORLDSERVER/User.cpp:3133-3217): IsUsableState (3102: in a trade
//                  TID_GAME_TRADELIMITUSING), IsUsableItem (Item.cpp:18), expired (3151), locked
//                  (RefuseLockedItem, __ITEM_LOCK, 3163 / 746), then the pack first (3193), then DoUseGiftbox (3208)
//   usePack     <- CUser::DoUsePackItem (User.cpp:2937-2981) + CItemElem::IsBinds (Item.cpp:434)
//   useGiftbox  <- CUser::DoUseGiftbox (User.cpp:2983-3042) + CGiftboxMan::Open (Project.cpp:4181-4222)
//   addItem     <- CMover::CreateItem (Mover.cpp:2757) -> CItemContainer::IsFull / Add (Item.h:694-800): a new item
//                  joins a stack with the same id, flag and bCharged only. The time limit and the +N are NOT compared,
//                  so a timed or upgraded item that joins a stack takes that stack's time limit / +N.
// Not modelled: DoUseItem, which runs before DoUseGiftbox and whose result is ignored (it can show the level
// message; a box row copied from an existing box does nothing there); IsBinds' random-option / level-down rules
// (no box has them); the item logs; serial numbers. The server's random generator is one global; here each run
// has its own seed, so the rolls are repeatable.
(function (FRE) {
  'use strict';
  const X = () => FRE.exchangeSim, Bx = () => FRE.boxes;
  const NULL_ID = -1;
  const BINDS = 0x02;                    // CItemElem::binds (Item.h:132)
  const EXPIRED = 0x01;                  // CItemElem::expired
  const IP_FLAG_BINDS = 0x01;            // ProjectCmn.h:360
  const short = v => (v << 16) >> 16;

  // Everything the simulator needs from the loaded files: the exchange simulator's items + a few more fields.
  function envFor(ws, model) {
    const base = X().envFromWorkspace(ws), D = ws.defines.defines;
    const k = name => (D.has(name) ? D.get(name) : null);
    return {
      model: model || ws.models.boxes,
      IK2_WARP: k('IK2_WARP'), IK3_EGG: k('IK3_EGG'), IK3_PET: k('IK3_PET'),
      prop(id) {
        const p = base.prop(id);
        if (!p) return null;
        const it = ws.itemById(id);
        if (!it) return p;                                  // the FILLER stand-in
        const g = f => FRE.specItem.get(it, f);
        // CProject::OnAfterLoadPropItem (Project.cpp:4988-5000): dwFlag "=" (NULL_ID) becomes 0; IK3_EVENTMAIN / IK3_BINDS get IP_FLAG_BINDS
        let flag = g('dwFlag');
        if (flag === -1) flag = 0;
        const ik3 = g('dwItemKind3');
        if (ik3 !== -1 && (ik3 === k('IK3_EVENTMAIN') || ik3 === k('IK3_BINDS'))) flag |= IP_FLAG_BINDS;
        return Object.assign({}, p, { binds: (flag & IP_FLAG_BINDS) === IP_FLAG_BINDS, ik2: g('dwItemKind2'), ik3, parts: g('dwParts') });
      },
      text: base.text,
    };
  }
  const nameOf = (env, id) => { const p = env.prop(id); return p ? p.name : `item ${id >>> 0}`; };

  // CItemContainer::Add after IsFull (Item.h:726): stacks first (same id, flag, bCharged; not when dwPackMax is 1),
  // then empty slots. A new slot keeps the item's time limit and +N; a stack keeps its own.
  // -> { ok, stacked: number put on existing stacks, slots: [bag positions it went to] }
  function addItem(env, p, it) {
    const pr = env.prop(it.id);
    if (!pr || it.id === 0) return { ok: false, stacked: 0, slots: [] };   // CreateItem: m_dwItemId == 0 / Add: GetProp() NULL
    const pack = short(pr.packMax), search = Math.min(p.unlocked, X().MAX_INVENTORY);
    let n = short(it.num), stacked = 0;
    if (X().bagIsFull(env, p, it.id, n, it.flag, it.charged)) return { ok: false, stacked: 0, slots: [] };
    const slots = [];
    if (pr.packMax !== 1) {
      for (let i = 0; i < search; i++) {
        const e = p.slots[i];
        if (e && e.id === it.id && e.num < pack && e.flag === it.flag && e.charged === it.charged) {
          slots.push(i);
          if (e.num + n > pack) { stacked += pack - e.num; n -= pack - e.num; e.num = pack; }
          else { e.num += n; stacked += n; n = 0; break; }
        }
      }
    }
    if (n > 0) {
      for (let i = 0; i < search; i++) {
        if (p.slots[i]) continue;
        const put = n > pack ? pack : n;
        p.slots[i] = { id: it.id, num: put, flag: it.flag, charged: it.charged, busy: false, keep: it.keep || 0, upgrade: it.upgrade || 0 };
        slots.push(i);
        n -= put;
        if (n <= 0) break;
      }
    }
    return { ok: true, stacked, slots };
  }

  // CItemElem::IsBinds for the box itself: a time limit (unless IK2_WARP), the IP_FLAG_BINDS prop flag, or the binds flag
  function boxBinds(env, box) {
    const pr = env.prop(box.id);
    if (!pr) return false;
    if (box.keep && pr.ik2 !== env.IK2_WARP) return true;
    if (pr.binds) return true;
    return (box.flag & BINDS) === BINDS;
  }

  // One use of the box in bag position `at`. Changes p. opts: { trading }
  // -> { refused: null | 'trade' | 'unusable' | 'expired' | 'locked' | 'space' | 'not-a-box', texts, used, kind: 'set' | 'random',
  //      roll, line (random: the line index picked), got: [{ line, id, num, flag, charged, keep, upgrade, stacked }], lost: [...], crash }
  function open(env, p, at, rnd, opts = {}) {
    const box = p.slots[at];
    const res = { refused: null, texts: [], used: false, kind: null, roll: null, line: null, got: [], lost: [], crash: null };
    if (!box) throw new Error('no item in that bag slot');
    if (opts.trading) { res.refused = 'trade'; res.texts.push(env.text('TID_GAME_TRADELIMITUSING') || 'TID_GAME_TRADELIMITUSING'); return res; }
    if (at >= p.unlocked || box.busy) { res.refused = 'unusable'; return res; }   // IsUsableItem: nothing happens, no message
    const pr = env.prop(box.id);
    if (pr && pr.parts === NULL_ID && (box.flag & EXPIRED)) {
      res.refused = 'expired';
      res.texts.push(env.text(pr.ik3 === env.IK3_EGG ? 'TID_GAME_PET_DEAD' : 'TID_GAME_ITEM_EXPIRED') || 'TID_GAME_ITEM_EXPIRED');
      return res;
    }
    if (pr && pr.parts === NULL_ID && pr.ik3 !== env.IK3_EGG && pr.ik3 !== env.IK3_PET && box.locked) {
      res.refused = 'locked';
      res.texts.push(`${pr.name} is locked. Unlock it (Shift + left-click in your inventory) before using it.`);
      return res;
    }
    const pack = env.model.pack ? env.model.pack.boxes.get(box.id >>> 0) : null;
    if (pack) { res.kind = 'set'; usePack(env, p, at, pack, res); return res; }
    res.kind = 'random';
    useGiftbox(env, p, at, rnd, res);
    return res;
  }

  function usePack(env, p, at, pack, res) {
    const box = p.slots[at];
    if (X().freeSlots(p) < pack.lines.length) { res.refused = 'space'; res.texts.push(env.text('TID_GAME_LACKSPACE') || 'TID_GAME_LACKSPACE'); return; }
    const bound = boxBinds(env, box);
    pack.lines.forEach((l, i) => {
      const id = l.item.value >>> 0, pr = env.prop(id);
      if (!pr) { res.crash = res.crash || `${l.item.define || id} has no Spec_Item row: GetProp()->bCharged crashes the server`; return; }
      const it = { line: i, id, num: l.num.value, flag: bound ? BINDS : 0, charged: pr.charged, keep: pack.span, upgrade: l.upgrade.value };
      const r = addItem(env, p, it);
      it.stacked = r.stacked;
      if (r.ok) { res.got.push(it); res.texts.push(fmt(env.text('TID_GAME_REAPITEM'), `"${nameOf(env, id)}"`)); }
      else res.lost.push(it);                              // "// critical err": nothing is said
    });
    if (res.crash) return;
    res.used = true;
    take(p, at);
  }

  function useGiftbox(env, p, at, rnd, res) {
    const box = p.slots[at];
    res.roll = rnd.random(Bx().TOTAL);                       // Open: the roll comes before the box lookup
    const g = env.model.gift ? env.model.gift.boxes.get(box.id >>> 0) : null;
    if (!g) { res.refused = 'not-a-box'; return; }
    const j = g.cum.findIndex(c => res.roll < c);
    if (j < 0) { res.refused = 'not-a-box'; return; }        // Open returns FALSE (only with broken running totals)
    res.line = j;
    if (X().freeSlots(p) < 1) { res.refused = 'space'; res.texts.push(env.text('TID_GAME_LACKSPACE') || 'TID_GAME_LACKSPACE'); return; }
    res.used = true;
    take(p, at);                                             // the box goes first: its slot can take the item
    const l = g.lines[j], id = l.item.value >>> 0, flag = Bx().flagOf(l);
    const pr = env.prop(id);
    const it = { line: j, id, num: l.num.value, flag: 0, charged: 0, keep: Bx().minutesOf(l), upgrade: Bx().upgradeOf(l) };
    if (flag !== Bx().FLAG_KEEP) {
      if (!pr) { res.crash = `${l.item.define || id} has no Spec_Item row: GetProp()->bCharged crashes the server`; return; }
      it.flag = flag; it.charged = pr.charged;
    }
    const r = addItem(env, p, it);
    it.stacked = r.stacked;
    if (r.ok) { res.got.push(it); res.texts.push(fmt(env.text('TID_GAME_REAPITEM'), `"${nameOf(env, id)}"`)); }
    else res.lost.push(it);
  }
  const take = (p, at) => { const b = p.slots[at]; b.num = short(b.num - 1); if (b.num <= 0) p.slots[at] = null; };   // UpdateItem( UI_NUM, n - 1 )
  const fmt = (f, a) => (f ? X().fmtText(f, [a]) : `TID_GAME_REAPITEM ${a}`);

  // A bag for a test: the box in slot 0, then `have` stacks, then filler items so exactly `free` slots stay empty.
  // box: { id, num, bound, keep, locked, expired }
  function bag(env, box, { free = 10, have = [], unlocked = X().MAX_INVENTORY_FREE } = {}) {
    const items = [{ id: box.id >>> 0, num: box.num || 1, flag: (box.bound ? BINDS : 0) | (box.expired ? EXPIRED : 0), charged: (env.prop(box.id) || {}).charged || 0,
      keep: box.keep || 0, locked: !!box.locked, upgrade: 0 }];
    for (const h of have) items.push(Object.assign({ flag: 0, charged: (env.prop(h.id) || {}).charged || 0, keep: 0, upgrade: 0 }, h));
    const fill = Math.max(0, unlocked - items.length - free);
    for (let i = 0; i < fill; i++) items.push({ id: X().FILLER, num: 1 });
    return X().player({ unlocked, items });
  }

  // "Open it N times": each open on a fresh copy of the same bag, one random sequence.
  // -> { opens, used, refused: {why: n}, lines: Map(line -> { times, qty, lost, stacked }), lost, crash, sample, firstTexts }
  function run(env, boxId, o = {}) {
    const rnd = FRE.xRandom.rng(o.seed == null ? 1 : o.seed);
    const start = bag(env, { id: boxId, num: 1, bound: o.bound, keep: o.keep, locked: o.locked, expired: o.expired }, { free: o.free, have: o.have || [] });
    const out = { opens: 0, used: 0, refused: {}, lines: new Map(), lost: 0, crash: null, sample: null, texts: [] };
    for (let i = 0; i < (o.n || 1000); i++) {
      const p = X().clone(start);
      const r = open(env, p, 0, rnd, { trading: o.trading });
      out.opens++;
      if (!out.sample) { out.sample = r; out.texts = r.texts; out.bag = p; }
      if (r.crash) { out.crash = r.crash; break; }
      if (r.refused) { out.refused[r.refused] = (out.refused[r.refused] || 0) + 1; continue; }
      out.used++;
      for (const it of r.got) { const e = lineStat(out, it.line); e.times++; e.qty += short(it.num); if (it.stacked) e.stacked++; }
      for (const it of r.lost) { lineStat(out, it.line).lost++; out.lost++; }
    }
    return out;
  }
  function lineStat(out, i) { if (!out.lines.has(i)) out.lines.set(i, { times: 0, qty: 0, lost: 0, stacked: 0 }); return out.lines.get(i); }

  // A new box before Create (+ New box → Try it): the plan (boxesOps.newBoxPlan) spliced into scratch copies of
  // Spec_Item.txt and the box file, read back by the real loaders with the new #define and texts. Nothing changes
  // in the workspace. -> { env, model, item, id }
  function scratch(ws, plan) {
    const D = new Map(ws.defines.defines);
    D.set(plan.define, plan.id);
    const strings = new Map(ws.strings.map);
    strings.set(plan.item.keys.name, plan.item.name);
    strings.set(plan.item.keys.desc, plan.item.desc);
    const textOf = name => {
      const f = ws.files.get(name), part = plan.parts.find(p => p.file === name);
      return part ? f.preview(part.splices) : f.text;
    };
    const items = FRE.specItem.loadSpecItem({ name: 'Spec_Item.txt', text: textOf('spec_item.txt') }, { defines: D, strings });
    const ctx = { defines: D, strings };
    const model = { gift: Bx().loadGiftboxes({ name: Bx().GIFT, text: textOf('propgiftbox.inc') }, ctx),
      pack: Bx().loadPacks({ name: Bx().PACK, text: textOf('proppackitem.inc') }, ctx) };
    const view = { defines: { defines: D }, texts: ws.texts, itemById: id => items.items.get(id >>> 0) || null, models: { boxes: model } };
    return { env: envFor(view, model), model, item: view.itemById(plan.id), id: plan.id, items };
  }

  FRE.boxesSim = { envFor, open, addItem, boxBinds, bag, run, scratch, BINDS, EXPIRED };
})(globalThis.FRE = globalThis.FRE || {});
