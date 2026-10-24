// Economy: what one player earns an hour at each farming spot (plan docs/plans/E-economy.md; Python copy:
// tools/oracle_sim.py economy).
//   spots        loaders/spawns.js (CWorld::ReadRespawn + CRespawner::Add): a spot = one map + one monster, all of its spawn
//                lines on that map together.
//   respawn      CRespawner::Spawn (_Common/Respawn.cpp:373-676), called once a second (WORLDSERVER/ThreadMng.cpp:359
//                CTimeout timeoutRespawn( 1000 )). Per line, in list order: the day / hour gate on the game clock (Respawn.cpp:
//                421-443; CGameTimer::Compute, _Common/timer.cpp:183, TIMESPEED 83 ms a game second, hours / days 1-based);
//                m_cbTime-- ; below 0: nTime = (short)( ( m_uTime * xRandom( 50, 150 ) ) / 100 ) (DWORD maths), cb = 0;
//                m_nGMIndex != 0: m_cbTime = nTime, cb = m_nMaxcb - m_cb if above 0; else (the map's first line) in Madrigal:
//                m_cbTime = (short)( nTime * m_fMonsterRebirthRate ), cb from m_nMaxcb * m_fMonsterRespawnRate (both 1.0 unless
//                the game-rate row changes them, DPDatabaseClient.cpp:1982), elsewhere like the others; m_bHalf: cb =
//                ( m_nMaxcb / 2 ) - ( m_nMaxcb - cb ); m_bHalf flips; cb monsters spawn (m_cb++ each). A kill: m_cb--
//                (CRespawnInfo::Increment, Respawn.cpp:163).
//   capAverage   the long-run spawns a minute when every monster dies at once: E[spawned per expiry] / E[seconds between
//                expiries] (renewal-reward); the spawned amount alternates m_nMaxcb and m_nMaxcb / 2, the wait is nTime + 1
//                seconds (1 when nTime wrapped below 0).
//   per kill     loaders/drops-sim.js `run` (CMover::DropItem, PenyaTable, the level gap, Gift Box rolls) with a seed:
//                Penya and every item per kill, averaged.
//   loot value   CDPSrvr::OnSellItem (DPSrvr.cpp:3733-3766): GetCost (with the dropped item's upgrade) / 4, dwCost after
//                AddShopItem (vendor-sim costOf); event / quest items, Perin and the Sealed Character scroll are refused.
//   currencies   exact per kill (exactItems: drops-sim exactChances x the average amount), not simulated.
//   per hour     min( kill speed, the spot's cap ) x 60 x per kill.
// Not modelled (the page lists these too): how fast a real player kills (asked), walking between a spot's spawn boxes, other
// players on the spot; GenResPoint dropping a box with no walkable spot (needs height maps); where in a box a monster appears;
// the Secret Room shop tax on selling; the other xRandom calls between two timer rolls on the real server (positions, monster set-up): the timer rolls use their own
// sequence here, with the same odds; quests, mini events, PvP prizes, the Battle Pass, player trade, AI farming.
(function (FRE) {
  'use strict';
  const f32 = Math.fround;
  const s16 = v => (v << 16) >> 16;
  const TIMESPEED = 83;                       // timer.cpp:142
  const MONTH = 30 * 24 * 60 * 60;
  const CURRENCIES = [
    { key: 'sun', define: 'II_GEN_MAT_ORICHALCUM01', label: 'Sunstone' },
    { key: 'moon', define: 'II_GEN_MAT_MOONSTONE', label: 'Moonstone' },
    { key: 'red', define: 'II_CHP_RED', label: 'Red Chip' },
  ];
  const DEFAULTS = { level: 150, speed: 15, loops: 1, kills: 1000, seed: 1 };
  const SPEEDS = [4, 15, 30];

  // CGameTimer::Compute: [day 1-30, hour 1-24] at a game-clock time in ms
  function gameDayHour(ms) {
    let sec = (ms / TIMESPEED) % MONTH;
    if (sec < 0) sec += MONTH;
    const t = Math.trunc(sec);
    return [Math.trunc(t / 86400) % 30 + 1, Math.trunc(t / 3600) % 24 + 1];
  }
  // Respawn.cpp:424-443: false = this line's timer does not run now
  function gateOpen(l, day, hour) {
    if (l.dayMin < l.dayMax) { if (day < l.dayMin || day > l.dayMax) return false; }
    else if (day < l.dayMin && day > l.dayMax) return false;
    if (l.hourMin < l.hourMax) { if (hour < l.hourMin || hour > l.hourMax) return false; }
    else if (hour < l.hourMin && hour > l.hourMax) return false;
    return true;
  }

  // One spot's spawn lines over `seconds` seconds with one player killing `speed` a minute (Infinity: every monster at once).
  // opts: { seconds, warmup (not counted), speed, seed, startMs (game clock), madrigal, rebirthRate, respawnRate }
  // -> { kills, perMinute, spawned, expiries, alive }
  function respawnRun(lines, opts) {
    const o = Object.assign({ seconds: 3600, warmup: 600, speed: Infinity, seed: 1, startMs: 0, madrigal: false, rebirthRate: 1, respawnRate: 1 }, opts || {});
    const rnd = FRE.xRandom.rng(o.seed);
    const st = lines.map(() => ({ cb: 0, cbTime: 0, half: false }));
    let kills = 0, spawned = 0, expiries = 0, budget = 0;
    const per = o.speed === Infinity ? Infinity : o.speed / 60;
    for (let t = 0; t < o.warmup + o.seconds; t++) {
      const counting = t >= o.warmup;
      const [day, hour] = gameDayHour(o.startMs + t * 1000);
      lines.forEach((l, i) => {
        const p = st[i];
        if (!gateOpen(l, day, hour)) return;
        p.cbTime = s16(p.cbTime - 1);
        if (p.cbTime >= 0) return;
        const nTime = s16(Math.floor(((l.seconds * rnd.range(50, 150)) >>> 0) / 100));
        let cb = 0;
        if (l.gmIndex !== 0 || !o.madrigal) {
          p.cbTime = nTime;
          if (l.max - p.cb > 0) cb = s16(l.max - p.cb);
        } else {
          p.cbTime = s16(Math.trunc(f32(nTime * f32(o.rebirthRate))));
          const want = f32(f32(l.max * f32(o.respawnRate)) - p.cb);
          if (want > 0) cb = s16(Math.trunc(want));
        }
        if (p.half) cb = s16(Math.trunc(l.max / 2) - (l.max - cb));
        p.half = !p.half;
        if (counting) expiries++;
        while (cb-- > 0) { p.cb++; if (counting) spawned++; }
      });
      // the player, after the respawn pass of this second: the first line with a monster up goes first
      let alive = st.reduce((a, p) => a + p.cb, 0);
      if (per === Infinity) {
        if (counting) kills += alive;
        for (const p of st) p.cb = 0;
      } else {
        budget += per;
        for (let k = 0; budget >= 1 && alive > 0; k++) {
          const p = st.find(x => x.cb > 0);
          p.cb--; alive--; budget--;
          if (counting) kills++;
        }
        if (alive === 0 && budget > 1) budget = 1;          // no kills banked while nothing is up
      }
    }
    return { kills, perMinute: kills / (o.seconds / 60), spawned, expiries, alive: st.reduce((a, p) => a + p.cb, 0) };
  }

  // The exact long-run spawns a minute of one line when every monster dies at once
  function capAverage(l) {
    if (l.max <= 0) return 0;
    let wait = 0;
    for (let r = 50; r < 150; r++) {
      const nTime = s16(Math.floor(((l.seconds * r) >>> 0) / 100));
      wait += nTime >= 0 ? nTime + 1 : 1;
    }
    wait /= 100;
    const half = Math.trunc(l.max / 2);
    return 60 * ((l.max + Math.max(0, half)) / 2) / wait;
  }

  // Map + monster spots: [{ key, world, file, title, mover, name, level, rank, lines, count, boxes, cap (all boxes), boxCap (the biggest) }]
  function spots(maps, movers) {
    const out = [], byKey = new Map();
    for (const m of maps) for (const l of m.lines) {
      const key = `${m.world}:${l.mover}`;
      let s = byKey.get(key);
      if (!s) {
        const mv = movers.get(l.mover) || {};
        s = { key, world: m.world, file: m.file, title: m.title, mover: l.mover, name: mv.name || `#${l.mover}`, level: mv.level | 0, rank: mv.rankId | 0,
          lines: [], count: 0, boxes: 0, cap: 0, boxCap: 0 };
        byKey.set(key, s); out.push(s);
      }
      const c = capAverage(l);
      s.lines.push(l); s.count += Math.max(0, l.max); s.boxes++; s.cap += c; s.boxCap = Math.max(s.boxCap, c);
    }
    return out;
  }

  // CDPSrvr::OnSellItem (WORLDSERVER/DPSrvr.cpp): what an NPC pays for one dropped item, or null when it refuses it.
  // CItemBase::GetCost (_Common/Item.cpp:136): -1 for dwCost 0xFFFFFFFF; upgraded: (int)( dwCost + dwCost * ( 0.1f + plus * plus
  // / 18.0f ) ) in float32. nGold = GetCost() / 4 (C division), x the Event.lua shop sell factor (none set: 1), at least 1.
  function sellOne(ws, id, plus, costs) {
    const it = ws.itemById(id), D = ws.defines.defines;
    if (!it) return null;
    const g = f => FRE.specItem.get(it, f) >>> 0;
    const ik3 = g('dwItemKind3');
    if (ik3 === (D.get('IK3_EVENTMAIN') >>> 0) || ik3 === (D.get('IK3_QUEST') >>> 0)) return null;
    if (id === D.get('II_SYS_SYS_SCR_SEALCHARACTER') || id === D.get('II_SYS_SYS_SCR_PERIN')) return null;
    const dw = FRE.vendorSim.costOf(costs, { id, item: it }) >>> 0;
    let cost;
    if (dw === 0xFFFFFFFF) cost = -1;
    else if (plus) {
      const c = f32(dw);
      const v = f32(c + f32(c * f32(f32(0.1) + f32(f32(plus * plus) / f32(18)))));
      cost = (Number.isNaN(v) || v >= 2147483648 || v < -2147483648) ? -2147483648 : Math.trunc(v);
    } else cost = dw | 0;
    const n = Math.trunc(cost / 4);
    return n === 0 ? 1 : n;
  }

  // Penya, items and loot value per kill of one monster: `kills` kills of drops-sim with the seed, averaged.
  // { penya, loot, items: Map id -> per kill, kills, crash, totals: { penya, loot, items } (sums over the kills) }
  function perKill(ws, mover, opts, world) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const env = FRE.dropsSim.envFor(ws, mover);
    const rnd = FRE.xRandom.rng(o.seed);
    const costs = ws.chars ? ws.costs() : null;
    const ko = { playerLevel: o.level, loops: o.loops, worldId: world, itemRate: o.itemRate, goldRate: o.goldRate, pieceRate: o.pieceRate };
    const items = new Map();
    let penya = 0, loot = 0, crash = null;
    for (let k = 0; k < o.kills; k++) {
      const r = FRE.dropsSim.kill(env, rnd, ko);
      if (r.crash) { crash = Object.assign({ kill: k + 1 }, r.crash); break; }
      penya += r.gold;
      for (const d of r.drops) {
        items.set(d.id, (items.get(d.id) || 0) + d.n);
        const v = sellOne(ws, d.id, d.plus | 0, costs);
        if (v !== null) loot += v * d.n;
      }
    }
    const totals = { penya, loot, items: new Map(items) };
    for (const [id, n] of items) items.set(id, n / o.kills);
    return { penya: penya / o.kills, loot: loot / o.kills, items, kills: o.kills, crash, totals };
  }

  // The exact drops per kill of every item on the monster's DropItem lines and event lines (not DropKind): drops-sim
  // exactChances (the gate with the level gap, GetAt, the Maxitem stop, x rolls) x the average amount ( min + max ) / 2
  // (amount = (short)( min + xRandom( max - min + 1 ) ), V19 b9646b69; amounts above 32,767 would wrap: none in the files).
  // Map id -> per kill. The currencies use this (rare drops: a simulation of 1,000 kills is too noisy).
  function exactItems(ws, mover, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const env = FRE.dropsSim.envFor(ws, mover);
    const ex = FRE.dropsSim.exactChances(env, { playerLevel: o.level, loops: o.loops, itemRate: o.itemRate, pieceRate: o.pieceRate });
    const out = new Map();
    for (const l of ex.lines) {
      const e = l.entry;
      if (e.kind !== 'item') continue;
      const num = e.number === 0xFFFFFFFF ? 1 : e.number;
      if (num === 0) continue;
      let mn = (e.min2 > 1 && e.number !== 0xFFFFFFFF) ? e.min2 : 1;
      if (mn > num) mn = num;
      out.set(e.itemId, (out.get(e.itemId) || 0) + l.perKill * ((mn + num) / 2));
    }
    return out;
  }

  // What one hour at a spot gives: { kpm, capped, penya, sun, moon, red, loot, items: Map id -> per hour }
  function spotHour(ws, spot, opts, cache) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const key = `${spot.mover}|${spot.world}|${o.level}|${o.loops}|${o.kills}|${o.seed}|${o.itemRate}|${o.goldRate}|${o.pieceRate}`;
    let pk = cache && cache.get(key);
    if (!pk) { pk = perKill(ws, spot.mover, o, spot.world); pk.exact = exactItems(ws, spot.mover, o); if (cache) cache.set(key, pk); }
    const kpm = Math.min(o.speed, spot.cap), perHour = kpm * 60;
    const D = ws.defines.defines;
    const out = { kpm, capped: spot.cap < o.speed, penya: pk.penya * perHour, loot: pk.loot * perHour, items: new Map(), crash: pk.crash, perKill: pk };
    for (const c of CURRENCIES) out[c.key] = (pk.exact.get(D.get(c.define)) || 0) * perHour;
    for (const [id, n] of pk.items) out.items.set(id, n * perHour);
    return out;
  }

  // ---- prices in hours (step 3)
  const CUR_NAMES = ['Penya', 'Red Chips', 'Donate Chips', 'PVP Tokens', 'Perins', 'Event Tokens'];     // CHARACTER::GetVenderCurrency
  const PERIN = 100000000;                                                                              // define.h:265
  // Every item players can buy: NPC shops (vendor-sim: the tab contents CDPSrvr / CProject build, Penya price = OnBuyItem with
  // dwCost after AddShopItem, chip shops = dwReferValue1 in the NPC's currency) and the Donation Shop (dwReferValue1 Donate Chips,
  // 7bedef15). [{ from: 'npc' | 'donation', npc, key, slot, id, currency (0-5), price }]
  function priceRows(ws) {
    const rows = [];
    if (ws.chars) for (const npc of ws.chars.npcs) {
      const sim = ws.simulate(npc), cur = FRE.shopOps.shopType(npc.venderType), key = `${npc.file}|${npc.key}`;
      sim.tabs.forEach((tab, slot) => {
        if (sim.chip) for (const en of tab.entries) rows.push({ from: 'npc', npc, key, slot, id: en.prop.id, currency: cur, price: en.prop.chip });
        else for (const p of ws.pricedTab(npc, slot)) rows.push({ from: 'npc', npc, key, slot, id: p.prop.id, currency: 0, price: p.pay });
      });
    }
    const don = ws.models && ws.models.donation;
    if (don) for (const id of don.catalog.keys()) {
      const it = ws.itemById(id);
      const chip = it ? FRE.specItem.get(it, 'dwReferValue1') | 0 : 0;
      if (chip >= 1) rows.push({ from: 'donation', npc: null, key: 'DonationShop.inc', slot: 0, id, currency: 2, price: chip });
    }
    return rows;
  }
  // the best spot per currency at the page's settings: rows = [{ s, h }] -> { penya: { s, perHour }, red, sun, moon }
  function bestOf(rows) {
    const out = {};
    for (const k of ['penya', 'red', 'sun', 'moon']) {
      let b = null;
      for (const r of rows) if (r.h[k] > 0 && (!b || r.h[k] > b.perHour)) b = { s: r.s, perHour: r.h[k] };
      out[k] = b;
    }
    return out;
  }
  // hours of farming for a price: Penya and Perins (100,000,000 Penya each) at the best Penya spot, Red Chips at the best Red Chip
  // spot; Donate Chips, PVP Tokens and Event Tokens do not drop from monsters: null
  function hoursOf(currency, price, best) {
    if (currency === 0 || currency === 4) return best.penya ? price * (currency === 4 ? PERIN : 1) / best.penya.perHour : null;
    if (currency === 1) return best.red ? price / best.red.perHour : null;
    return null;
  }
  // Upgrades in hours (upgrade-sim expect: the exact average tries, protect scrolls and Penya fees for one finished item; one
  // stone a try: EnchantGeneral takes II_GEN_MAT_ORICHALCUM01, WORLDSERVER/ItemUpgrade.cpp:1131; RefineAccessory
  // II_GEN_MAT_MOONSTONE, :884): weapon / armor +0 -> +10 with SMELPROT (Sunstones), jewelry +0 -> +10 with SMELPROT4 (Moonstones). The protect scrolls
  // are counted at the cheapest NPC price for Penya or Red Chips when an NPC sells them.
  const UPGRADES = [
    { label: 'Weapon / armor +0 → +10, protect scroll on', sys: 'general', from: 0, to: 10, opts: { window: 'normal', protect: true, patched: true }, stone: 'sun',
      scroll: 'II_SYS_SYS_SCR_SMELPROT' },
    { label: 'Jewelry +0 → +10, protect scroll on', sys: 'acc', from: 0, to: 10, opts: { window: 'normal', protect: true, patched: true }, stone: 'moon',
      scroll: 'II_SYS_SYS_SCR_SMELPROT4' },
  ];
  function upgradeRows(ws, best, prices) {
    const m = ws.models && ws.models.upgrade;
    if (!m) return [];
    const D = ws.defines.defines;
    return UPGRADES.map(u => {
      const e = FRE.upgradeSim.expect(m, u.sys, u.from, Math.min(u.to, FRE.upgradeSim.maxLevel(m, u.sys)), u.opts);
      if (!e.per) return { u, never: e.never };
      const sid = u.scroll ? D.get(u.scroll) : null;
      const shop = sid == null ? null : prices.filter(r => r.id === sid && (r.currency === 0 || r.currency === 1))
        .map(r => ({ r, hours: hoursOf(r.currency, r.price, best) })).filter(x => x.hours !== null).sort((a, b) => a.hours - b.hours)[0] || null;
      const stoneH = best[u.stone] ? e.per.tries / best[u.stone].perHour : null;
      const penyaH = best.penya ? e.per.penya / best.penya.perHour : null;
      const scrollH = u.scroll && e.per.protect ? (shop ? e.per.protect * shop.hours : null) : 0;
      const total = [stoneH, penyaH, scrollH].every(v => v !== null) ? stoneH + penyaH + scrollH : null;
      return { u, per: e.per, stones: e.per.tries, stoneH, penyaH, scrollH, shop, total, feesFile: !(m.fees && (m.fees.missing || m.fees.empty || m.fees.failed)) };
    });
  }

  // The spots of every loaded map (needs the maps read: ws.area, ws.worldFiles)
  function fromWorkspace(ws) {
    if (!ws.area || !ws.movers) return { maps: null, spots: [] };
    const get = rel => (ws.worldFiles && ws.worldFiles.get(rel.toLowerCase())) || ws.files.get(rel.toLowerCase()) || null;
    const maps = FRE.spawns.allMaps(ws.area.worlds, get, ws.movers.movers, ws.defines.defines);
    return { maps, spots: spots(maps, ws.movers.movers) };
  }

  FRE.economySim = { respawnRun, capAverage, gameDayHour, gateOpen, spots, sellOne, perKill, exactItems, spotHour, priceRows, bestOf, hoursOf, upgradeRows, UPGRADES, CUR_NAMES, PERIN, fromWorkspace, CURRENCIES, DEFAULTS, SPEEDS, TIMESPEED };
})(globalThis.FRE = globalThis.FRE || {});
