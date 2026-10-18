// Mini Events, Turn-in Race (step 3): where each item comes from (ITEM_HINT lines), random RECIPE lists, and a turn-in.
//   hints     the "where to get it" line under each recipe item (CMiniEventMng::SendRound, MiniEventMng.cpp:1741: the
//             ITEM_HINT text of that item, by item id; the last ITEM_HINT of an item wins, ReadConfig :337). Written the way
//             V19 Tools/minievent/build_turnin.py wrote the first 98 (3b12a4bb): "Drop: <monster> - <area> (<town>)" with
//             the area from WdMadrigal.rgn's titled region3 boxes (medata.py madrigal_regions / area_name / with_town /
//             town_of), "Shop: <NPC> - <town>" (TOWNS by the key's first 4 letters; the NPC = the first in the character
//             files whose shop shows the item, vendor-sim). Ranks come from propmover.js (the script read the RANK_ words, so
//             a few of its picks differ: those lines are never rewritten). This editor adds (the user, 2026-10-18:
//             a hint for every item that has a source, so a GM's /eventrecipe item has one too): drops of other Madrigal
//             monsters, chip shops, the Donation Shop, exchanges, boxes, drops outside Madrigal. Up to 100 letters, no ".
//   generate  a random RECIPE list like build_turnin.py main(): parts (II_GEN_GEM_) of normal Madrigal monsters (RANK_LOW /
//             RANK_NORMAL, a DropItem line of at least 1 %), supplies (food / potions / refreshers / quest items they drop,
//             and Penya-shop consumables), Penya-shop gear; 4 shapes; no item combination twice. The server rolls nothing
//             here: the list is fixed in the file, and StartEvent picks never-used recipes first (askOrder).
//             Rolls use the server's xRandom (core/xrandom.js) so a seed always gives the same list.
//   turnIn    CMiniEventMng::TurnIn (:1422-1500) + MECountTurnInItem (:1410): bag items only (not equipped, usable: not
//             locked / in a trade / in a shop), every item of the recipe at least its amount, then taken in object-id order.
// Not modelled: the 1.5 s retry wait (MINIEVENT_TRY_MS), the distance to Event Master, packets, the item log.
(function (FRE) {
  'use strict';
  const TOWNS = { MaFl: 'Flaris', MaSa: 'Saint Morning', MaDa: 'Darkon', MaHa: 'Harmonin', MaEw: 'Eillun', MaRu: 'Ruendera' };
  const TOWN_NAMES = { flaris: 'Flaris', saintmorning: 'Saint Morning', darkon1: 'Darkon 1', harmonin: 'Shaduwar', elliun: 'Eillun', ruendera: 'Eillun' };
  const KINDS = ['II_GEN_GEM_', 'II_GEN_FOO_', 'II_GEN_POT_', 'II_SYS_SYS_QUE_'];
  const CONSUMABLE_IK3 = ['IK3_REFRESHER', 'IK3_DRINK', 'IK3_INSTANT', 'IK3_PILL', 'IK3_FOOD'];
  const DROP_BASE = 3000000000, MIN_PROB = DROP_BASE / 100;
  const CURRENCY = ['Penya', 'Red Chips', 'Donate Chips', 'PVP Tokens', 'Perins'];
  const HINT_LEN = 100, TITLE_LEN = 60;

  // Python's str.title(): a letter after a non-letter is upper case, the others lower case
  const pyTitle = s => { let out = '', prev = false; for (const c of s) { const cased = c.toLowerCase() !== c.toUpperCase(); out += cased ? (prev ? c.toLowerCase() : c.toUpperCase()) : c; prev = cased; } return out; };
  const clean = (s, n) => s.split('"').join("'").replace(/[^\x20-\x7e]/g, '?').slice(0, n);   // the file is ASCII
  // a .rgn line split like medata.py: "quoted" or runs of non-space
  const fields = l => l.match(/"[^"]*"|\S+/g) || [];

  // WdMadrigal.rgn (+ wdMadrigal.txt.txt titles): monster respawns (respawn7 type 5), titled region3 boxes, revival points
  function madrigal(ws) {
    const wf = ws.worldFiles || new Map();
    const rgn = wf.get('world/wdmadrigal/wdmadrigal.rgn'), txt = wf.get('world/wdmadrigal/wdmadrigal.txt.txt');
    if (!rgn) return null;
    const strings = new Map();
    if (txt) for (const l of txt.text.split(/\r\n|\n|\r/)) { const k = l.indexOf('\t'); if (k >= 0) strings.set(l.slice(0, k).trim(), l.slice(k + 1).trim()); }
    const L = rgn.text.split(/\r\n|\n|\r/);
    const respawns = [], regions = [], towns = [];
    L.forEach((l, i) => {
      if (l.startsWith('respawn7')) {
        const f = l.split(/\s+/).filter(Boolean);
        if (f[1] === '5') respawns.push({ mover: parseInt(f[2], 10), x: parseFloat(f[3]), z: parseFloat(f[5]) });
      } else if (l.startsWith('region3')) {
        const f = fields(l);
        if (f[2] === '13' && f[19] && f[19].replace(/"/g, '')) towns.push({ key: f[19].replace(/"/g, '').toLowerCase(), x: parseFloat(f[3]), z: parseFloat(f[5]) });
        let title = '';
        if (i + 3 < L.length && L[i + 1].startsWith('title') && L[i + 2].trim() === '{') title = strings.get(L[i + 3].trim()) || '';
        if (title) regions.push({ rect: f.slice(15, 19).map(v => parseInt(v, 10)), titles: title.split('\\n').join('\n').split('\n').map(x => x.trim()).filter(Boolean) });
      }
    });
    return { respawns, regions, towns };
  }

  // town_of: the big region a player knows from the Teleport list
  function townOf(m, x, z) {
    if (x < 3600) return 'Darkon 3';
    let best = null, bd = Infinity;
    for (const t of m.towns) { const d = (t.x - x) ** 2 + (t.z - z) ** 2; if (d < bd) { bd = d; best = t; } }
    if (!best) return 'Madrigal';
    if (best.key === 'darkon') return best.x > 4800 ? 'Darkon 1' : 'Darkon 2';
    return TOWN_NAMES[best.key] || pyTitle(best.key);
  }
  const withTown = (m, name, x, z) => (['darkon', 'saint', 'eillun', 'shaduwar', 'flaris', 'flarine'].some(w => name.toLowerCase().includes(w)) ? name : `${name} (${townOf(m, x, z)})`);
  // area_name: the smallest titled box around the point (its last title line), else the nearest one; + the town
  function areaName(m, x, z) {
    const regs = m.regions.filter(r => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]) >= 5000
      && !['Guild Combat', 'Collecting', 'Entrance', 'Altar'].some(w => r.titles.join(' ').includes(w)));
    if (!regs.length) return townOf(m, x, z);
    const area = r => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
    let best = null, bv = Infinity;
    for (const r of regs) if (r.rect[0] <= x && x <= r.rect[2] && r.rect[1] <= z && z <= r.rect[3] && area(r) < bv) { bv = area(r); best = r; }
    if (!best) for (const r of regs) { const d = (x - (r.rect[0] + r.rect[2]) / 2) ** 2 + (z - (r.rect[1] + r.rect[3]) / 2) ** 2; if (d < bv) { bv = d; best = r; } }
    return withTown(m, best.titles[best.titles.length - 1], x, z);
  }

  // everything the hints and the generator need, read once from the workspace
  function context(ws) {
    const D = ws.defines.defines, items = ws.items.items, get = FRE.specItem.get;
    const def = n => D.get(n);
    const mad = madrigal(ws);
    const movers = ws.movers ? ws.movers.movers : new Map();
    const drops = ws.models.drops || null;
    // shops: NPCs in file order; each item -> the first Penya NPC / the first chip NPC selling it
    const penya = new Map(), chip = new Map(), special = new Set();
    if (ws.chars && ws.vendorIndex) for (const npc of ws.chars.npcs) {
      if (!npc.statements.some(r => FRE.character.shopEntry(r))) continue;
      const tabs = ws.simulate(npc).tabs, isChip = npc.venderType !== 0;
      for (const tab of tabs) for (const en of tab.entries) {
        const id = en.prop.id >>> 0;
        if (isChip) { special.add(id); if (!chip.has(id)) chip.set(id, npc); }
        else if (!penya.has(id)) penya.set(id, npc);
      }
    }
    return { ws, D, items, get, def, mad, movers, drops, penya, chip, special };
  }
  const nameOf = (c, id) => { const it = c.items.get(id >>> 0); return it ? (it.name || it.define) : `item ${id >>> 0}`; };
  const keyOf = (c, id) => { const it = c.items.get(id >>> 0); return it ? it.define : String(id >>> 0); };
  const townOfNpc = npc => TOWNS[npc.key.slice(0, 4)] || 'Madrigal';
  const npcName = npc => npc.name || npc.key;
  const normalRank = mon => mon && (mon.rank === 'low' || mon.rank === 'normal');

  // Madrigal monster drops: each item -> [{ mid, x, z, prob, tier }] in respawn file order (each monster once).
  // tier 0 = a normal monster's line of at least 1 % (build_turnin.py's rule); tier 1 = any other Madrigal drop line
  function madrigalDrops(c) {
    if (c._mdrops) return c._mdrops;
    const out = new Map(), seen = new Set();
    if (c.mad && c.drops) for (const r of c.mad.respawns) {
      if (seen.has(r.mover)) continue;
      seen.add(r.mover);
      const mon = c.drops.monsters.get(r.mover), mv = c.movers.get(r.mover);
      if (!mon || !mv) continue;
      for (const e of mon.list) {
        if (e.kind !== 'item' || e.event || !c.items.get(e.itemId) || !(e.probability > 0)) continue;
        const prob = Math.min(e.probability, 2147483647);
        const tier = normalRank(mv) && prob >= MIN_PROB ? 0 : 1;
        if (!out.has(e.itemId)) out.set(e.itemId, []);
        out.get(e.itemId).push({ mid: r.mover, x: r.x, z: r.z, prob, tier, define: e.define });
      }
    }
    return (c._mdrops = out);
  }

  // one item's "where to get it" text (or null: no source)
  function hintFor(c, id) {
    id = id >>> 0;
    // order: a normal Madrigal monster's drop (1 %+), a Penya shop, any other Madrigal drop, a chip shop, the Donation Shop,
    // an exchange, a box, a drop outside Madrigal
    const md = madrigalDrops(c).get(id) || [];
    const drop = x => clean(`Drop: ${c.movers.get(x.mid).name} - ${areaName(c.mad, x.x, x.z)}`, HINT_LEN);
    const t0 = md.find(x => x.tier === 0);
    if (t0) return drop(t0);
    if (c.penya.has(id)) { const npc = c.penya.get(id); return clean(`Shop: ${npcName(npc)} - ${townOfNpc(npc)}`, HINT_LEN); }
    if (md.length) return drop(md[0]);
    if (c.chip.has(id)) { const npc = c.chip.get(id); return clean(`Shop: ${npcName(npc)} (${CURRENCY[npc.venderType] || 'chips'}) - ${townOfNpc(npc)}`, HINT_LEN); }
    const dm = c.ws.models.donation;
    if (dm && dm.catalog.has(id)) return 'Shop: Donation Shop (Donate Chips) - Flaris';
    const ex = exchangeOf(c, id);
    if (ex) return clean(`Exchange: ${npcName(ex)} - ${townOfNpc(ex)}`, HINT_LEN);
    const box = boxOf(c, id);
    if (box !== null) return clean(`Box: ${nameOf(c, box)}`, HINT_LEN);
    if (c.drops) for (const [mid, mon] of c.drops.monsters) {
      if (!mon.list.some(e => e.kind === 'item' && !e.event && e.itemId === id && e.probability > 0)) continue;
      const mv = c.movers.get(mid);
      if (mv) return clean(`Drop: ${mv.name}`, HINT_LEN);
    }
    return null;
  }
  // the first NPC (character files order) with an exchange menu that gives the item
  function exchangeOf(c, id) {
    const m = c.ws.models.exchange, by = c.ws.npcInfoByMenu ? c.ws.npcInfoByMenu() : null;
    if (!m || !by) return null;
    if (!c._ex) {
      c._ex = new Map();
      const table = FRE.exchangeSim.serverTable(m);
      for (const [mmi, menu] of table.menus) {
        const npcs = by.get(mmi);
        if (!npcs || !npcs.length) continue;
        for (const set of menu.sets) for (const p of set.pay) if (!c._ex.has(p.id >>> 0)) c._ex.set(p.id >>> 0, npcs[0].npc);
      }
    }
    return c._ex.get(id) || null;
  }
  // a box that holds the item: sets first (propPackItem.inc), then random boxes; the lowest box id
  function boxOf(c, id) {
    const bx = c.ws.models.boxes;
    if (!bx) return null;
    for (const src of [bx.pack, bx.gift]) {
      if (!src) continue;
      let best = null;
      for (const b of src.boxes.values()) if (b.lines.some(l => (l.item.value >>> 0) === id) && c.items.get(b.id) && (best === null || b.id < best)) best = b.id;
      if (best !== null) return best;
    }
    return null;
  }

  // every item with a source -> its hint (for "write a hint for every item"): the ids in id order
  function allHints(c) {
    const out = new Map();
    const ids = new Set([...madrigalDrops(c).keys(), ...c.penya.keys(), ...c.chip.keys()]);
    if (c.ws.models.donation) for (const id of c.ws.models.donation.catalog.keys()) ids.add(id >>> 0);
    if (c.ws.models.exchange) { exchangeOf(c, 0); for (const id of (c._ex || new Map()).keys()) ids.add(id); }
    const bx = c.ws.models.boxes;
    if (bx) for (const src of [bx.pack, bx.gift]) if (src) for (const b of src.boxes.values()) for (const l of b.lines) ids.add(l.item.value >>> 0);
    if (c.drops) for (const mon of c.drops.monsters.values()) for (const e of mon.list) if (e.kind === 'item' && !e.event && e.probability > 0) ids.add(e.itemId);
    for (const id of [...ids].sort((a, b) => a - b)) {
      if (!c.items.get(id)) continue;
      const h = hintFor(c, id);
      if (h) out.set(id, h);
    }
    return out;
  }

  // ---- the random RECIPE list (build_turnin.py main, with xRandom)
  function pools(c) {
    const ik = n => c.def(n);
    const consumable = new Set(CONSUMABLE_IK3.map(ik).filter(v => v !== undefined));
    const best = new Map();                      // item -> { id, prob, mid } with the best drop line (tier 0 only)
    for (const [id, list] of madrigalDrops(c)) for (const x of list) {
      if (x.tier !== 0 || c.special.has(id) || !KINDS.some(k => x.define.startsWith(k))) continue;
      const b = best.get(id);
      if (!b || x.prob > b.prob) best.set(id, { id, prob: x.prob, mid: x.mid, define: x.define });
    }
    const byDefine = (a, b) => (a.define < b.define ? -1 : a.define > b.define ? 1 : 0);
    const parts = [...best.values()].filter(x => x.define.startsWith('II_GEN_GEM_')).sort(byDefine);
    const food = [...best.values()].filter(x => !x.define.startsWith('II_GEN_GEM_')).sort(byDefine);
    const inFood = new Set(food.map(x => x.id));
    const shop = [...c.penya.keys()].filter(id => c.items.get(id)).map(id => ({ id, define: c.items.get(id).define })).sort(byDefine);
    for (const s of shop) {
      const it = c.items.get(s.id);
      if (s.define.includes('_EVE_') || c.special.has(s.id) || inFood.has(s.id) || !consumable.has(c.get(it, 'dwItemKind3'))) continue;
      food.push({ id: s.id, prob: DROP_BASE / 8, mid: null, define: s.define });
    }
    const gear = shop.filter(s => {
      const it = c.items.get(s.id), k1 = c.get(it, 'dwItemKind1');
      return (k1 === ik('IK1_WEAPON') || k1 === ik('IK1_ARMOR')) && !s.define.includes('_EVE_')
        && (s.define.startsWith('II_WEA_') || s.define.startsWith('II_ARM_')) && !s.define.includes('_CHR_') && !s.define.includes('_SEC_');
    });
    return { parts, food, gear };
  }

  // n recipes, seed = xRandom seed; skip = item-combination keys already in the file (no duplicate of those either)
  function generate(c, n, seed, skip = new Set()) {
    const rng = FRE.xRandom.rng(seed >>> 0 || 1), R = k => rng.random(k);
    const { parts, food, gear } = pools(c);
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = R(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    const P = shuffle(parts.slice()), F = shuffle(food.slice());
    const mname = x => (x.mid !== null ? c.movers.get(x.mid).name : '');
    const out = [], used = new Set(skip);
    const pick = arr => arr[R(arr.length)];
    for (let i = 0; i < P.length && out.length < n; i++) {
      const a = P[i];
      const kind = R(100), sup = F.length ? F[R(F.length)] : null;
      let picks, title;
      if (kind < 35 || !sup) { picks = [[a.id, pick([30, 40, 50])]]; title = `${mname(a)} Hunt`; }
      else if (kind < 65) { picks = [[a.id, pick([20, 30])], [sup.id, pick([20, 30, 50])]]; title = `${mname(a)} and Supplies`; }
      else if (kind < 85 && gear.length) { picks = [[pick(gear).id, 1], [a.id, 20], [sup.id, 20]]; title = `${mname(a)} Expedition`; }
      else {
        if (P.length < 2) continue;
        const b = P[(i + 1 + R(P.length - 1)) % P.length];
        picks = [[a.id, 20], [b.id, 20]]; title = `${mname(a)} and ${mname(b)}`;
      }
      const key = comboKey(picks.map(p => p[0]));
      if (new Set(picks.map(p => p[0])).size !== picks.length || used.has(key)) continue;
      used.add(key);
      out.push({ title: clean(title, TITLE_LEN), items: picks });
    }
    return out;
  }
  const comboKey = ids => [...ids].map(v => v >>> 0).sort((a, b) => a - b).join(',');

  // ---- a turn-in (TurnIn :1422): bag = [{ id, n, equip, usable }] in object-id order; -> { ok, missing, bag (after), msg }
  function turnIn(recipe, bag, nameOfId = id => String(id)) {
    const usable = s => s && !s.equip && s.usable !== false;
    const have = id => bag.reduce((t, s) => t + (usable(s) && s.id === id ? s.n : 0), 0);
    const missing = recipe.items.filter(([id, n]) => have(id) < n).map(([id, n]) => ({ id, n, have: have(id) }));
    if (missing.length) {
      return { ok: false, missing, bag: bag.map(s => (s ? Object.assign({}, s) : s)),
        msg: `[Event] Not yet. Need ${missing.map(x => `${x.n} ${nameOfId(x.id)} (you have ${x.have})`).join(', ')}. Equipped or locked items do not count.` };
    }
    const after = bag.map(s => (s ? Object.assign({}, s) : s));
    for (const [id, n] of recipe.items) {
      let left = n;
      for (let i = 0; i < after.length && left > 0; i++) {
        const s = after[i];
        if (!usable(s) || s.id !== id) continue;
        const take = Math.min(left, s.n);
        left -= take;
        s.n -= take;
        if (s.n === 0) after[i] = null;          // UpdateItem( UI_NUM, 0 ) removes it
      }
    }
    return { ok: true, missing: [], bag: after, msg: '[Event] Turned in!' };
  }

  // the title the server gives a GM recipe without one (MakeGmTitle, V19 4a733f19, not yet tested in game)
  function gmTitle(c, ids, hintOf) {
    const mons = [];
    let gear = false, supply = false;
    for (const id of ids) {
      const it = c.items.get(id >>> 0);
      if (!it) continue;
      const k1 = c.get(it, 'dwItemKind1'), k2 = c.get(it, 'dwItemKind2');
      if (k1 === c.def('IK1_WEAPON') || k1 === c.def('IK1_ARMOR')) { gear = true; continue; }
      const h = hintOf(id >>> 0) || '';
      let mon = '';
      if (k2 === c.def('IK2_GEM') && h.startsWith('Drop: ')) { mon = h.slice(6); const d = mon.indexOf(' - '); if (d >= 0) mon = mon.slice(0, d); }
      if (!mon) supply = true;
      else if (mons.length === 0 || (mons.length === 1 && mons[0] !== mon)) mons.push(mon);
    }
    let s;
    if (!mons.length) s = "Admin's pick";
    else if (gear) s = `${mons[0]} Expedition`;
    else if (mons.length >= 2) s = `${mons[0]} and ${mons[1]}`;
    else if (supply) s = `${mons[0]} and Supplies`;
    else s = `${mons[0]} Hunt`;
    return s.split('"').join("'").slice(0, 60);
  }

  FRE.miniEventTurnIn = { madrigal, townOf, areaName, context, madrigalDrops, hintFor, allHints, pools, generate, comboKey, turnIn, gmTitle,
    nameOf, keyOf, TOWNS, HINT_LEN, TITLE_LEN };
})(globalThis.FRE = globalThis.FRE || {});
