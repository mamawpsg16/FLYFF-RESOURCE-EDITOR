// Where is this item from? (task H part 1). No DOM: gjs-testable. Read-only: it reports what the other loaders and
// simulators give, for one item:
//   shops      vendor-sim (ProcessRegenItem: fixed, chip and rule-made items; pricedTab: what players pay)
//   donation   DonationShop.inc catalog, the price is dwReferValue1 (Donate Chips)
//   exchange   exchange-sim serverTable; the chance of a reward per press = payChances (CExchange::GetPayItemList,
//              Exchange.cpp:328, every pick sequence with the modulo-biased xRandom odds); CONDITION lines = "used in"
//   drops      drops-sim exactChances (CMover::DropItem, Mover.cpp:8483-8716): the monster's lines and the event lines
//              (propDropEvent.inc, Project.cpp:4048); DropKind per item = kindChance (Mover.cpp:8823-8956)
//   boxes      CGiftboxMan chances (random boxes), CPackItem (sets: always every item; a set is checked first)
//   battlepass the live BPReward rows (nType of the login pass)
//   part 2 (loaders/gifts.js + gifts-sim.js): level-up gifts (Event.lua; how often one character gets each: giftsSim.life),
//              rebirth gifts (1Rebirth.inc), couple gifts (couple.inc; which levels a couple reaches: giftsSim.couple),
//              Guild Siege Red Chips per siege (top 3 guilds, GuildCombatResultRanking) and weekly (GuildSiegePrize.cpp)
// Each line has `facts`: the plain values the independent Python copy (tools/oracle_sim.py where) must find too.
(function (FRE) {
  'use strict';
  const u32 = v => v >>> 0;
  const f32 = Math.fround;
  const INT_MIN = -2147483648;
  const toInt = v => (Number.isNaN(v) || v >= 2147483648 || v < -2147483648) ? INT_MIN : Math.trunc(v);
  const PROB_TOTAL = 1000000;
  const DROP_ONE = 3000000000;
  const CURRENCY = ['Penya', 'Red Chips', 'Donate Chips'];
  const round12 = x => Number(x.toPrecision(12));

  // ---------------------------------------------------------------- exact chances
  // CExchange::GetPayItemList: nRandom = xRandom( nProb ); the first line whose running total is above it is given,
  // taken out, nProb -= its chance, roll again over what is left, until PAY n lines are given (n <= 0: never equal,
  // so until nProb <= 0). -> chance (0..1) per pay line that it is among the rewards of one press, or null when the
  // pick sequences are too many to list (only with a large PAY n).
  function payChances(set, limit = 200000) {
    const lines = set.pay, n = lines.length, want = set.payNum;
    const belowP = FRE.drops.belowP;
    const memo = new Map();
    let states = 0;
    // from a state (the lines still in, in file order): P(each line is given from here on)
    function from(rem, nProb, count) {
      const key = rem.join(',');
      if (memo.has(key)) return memo.get(key);
      if (++states > limit) throw new Error('too many');
      const out = new Array(n).fill(0);
      let sum = 0;
      for (let j = 0; j < rem.length; j++) {
        const lo = sum;
        sum += lines[rem[j]].prob;
        const q = belowP(nProb, Math.min(Math.max(sum, 0), nProb)) - belowP(nProb, Math.min(Math.max(lo, 0), nProb));
        if (q <= 0) continue;
        out[rem[j]] += q;
        if (count + 1 === want) continue;
        const np = nProb - lines[rem[j]].prob;
        if (np <= 0) continue;
        const next = from(rem.filter((_, k) => k !== j), np, count + 1);
        for (let k = 0; k < n; k++) out[k] += q * next[k];
      }
      memo.set(key, out);
      return out;
    }
    try { return from(lines.map((_, i) => i), PROB_TOTAL, 0); } catch (e) { if (e.message === 'too many') return null; throw e; }
  }

  // DropKind (Mover.cpp:8823-8956), per roll that passes the gate: for each DropKind line in order, the rarity window
  // (monster level -5 .. -2) gives an index range of m_itemKindAry[ik3]; one item of it is picked (xRandom( n )), then
  // the upgrade start xRandom( 11 ) and the tries kk = start .. 0: xRandom( 3e9 ) < expDropLuck[lv-1][kk] × correction%
  // (Fortune Circle halves the roll when the chance is <= 10,000,000). A RANK_SUPER monster stops after the first DropKind
  // item that lands on the ground. -> expected drops of `itemId` per kill (all its DropKind lines), and the details.
  // -> Map item id -> { perKill: expected drops per kill (all its DropKind lines), among }
  function kindChances(env, opts) {
    const ex = FRE.dropsSim.exactChances(env, opts);
    const o = Object.assign({ loops: 1, fortune: false, bagFull: false }, opts || {});
    const D = FRE.drops, belowP = D.belowP;
    const mv = env.mover || { level: 1, rankId: 1, flying: 0, correction: 100, id: 0 };
    const [lo, hi] = D.kindWindow(mv.level | 0);
    const corr = f32(f32(u32(mv.correction)) / f32(100));
    const superStop = mv.rankId === env.defines.get('RANK_SUPER') && !(mv.flying && !o.bagFull);
    const memo = new Map();
    const pDrop = pick => {                    // P(the tries give it) once this item is picked
      const lvIdx = pick.lv > 120 ? 119 : pick.lv - 1;
      if (lvIdx < 0 || !env.ctx.luck) return 0;    // dwItemLV 0: the server reads out of bounds (the kill simulator stops there)
      if (memo.has(lvIdx)) return memo.get(lvIdx);
      const q = [];
      for (let kk = 0; kk <= 10; kk++) {
        const p = u32(toInt(f32(f32(env.ctx.luck[lvIdx][kk]) * corr)));
        q.push(belowP(DROP_ONE, o.fortune && p <= 10000000 ? Math.min(DROP_ONE, 2 * p) : Math.min(DROP_ONE, p)));
      }
      let total = 0;
      for (let s = 0; s <= 10; s++) {           // start = xRandom( 11 ): modulo-biased like every roll
        let miss = 1;
        for (let kk = s; kk >= 0; kk--) miss *= 1 - q[kk];
        total += (belowP(11, s + 1) - belowP(11, s)) * (1 - miss);
      }
      memo.set(lvIdx, total);
      return total;
    };
    let reach = 1;
    const out = new Map();     // item id -> { perKill, among (items in the window of its first DropKind line) }
    for (const kd of env.kinds) {
      let mn = -1, mx = -1;
      for (let j = lo; j <= hi; j++) { mn = D.minIdx(env.ctx.kinds, kd.ik3Value, j); if (mn !== -1) break; }
      for (let j = hi; j >= lo; j--) { mx = D.maxIdx(env.ctx.kinds, kd.ik3Value, j); if (mx !== -1) break; }
      if (mn < 0 || mx < 0) continue;
      const ary = env.ctx.kinds.get(kd.ik3Value).list, count = mx - mn + 1;
      let any = 0;
      for (let i = mn; i <= mx; i++) {
        const pick = ary[i];
        if (!pick) continue;
        const p = pDrop(pick) * (belowP(count, i - mn + 1) - belowP(count, i - mn));    // ary[mn + xRandom( n )]
        any += p;
        const x = out.get(pick.id) || { perKill: 0, among: count };
        x.perKill += ex.gate * reach * p * o.loops;
        out.set(pick.id, x);
      }
      if (superStop) reach *= 1 - any;
    }
    return out;
  }
  const kindChance = (env, itemId, opts) => kindChances(env, opts).get(u32(itemId)) || { perKill: 0, among: 0 };

  // ---------------------------------------------------------------- the index
  // itemId -> [ref]: every place the item shows up, cheap (built once per parse; sources() fills in the numbers).
  function index(ws) {
    const idx = new Map();
    const add = (id, ref) => { id = u32(id); if (!idx.has(id)) idx.set(id, []); idx.get(id).push(ref); };
    if (ws.chars) for (const npc of ws.chars.npcs) {
      if (!npc.statements.some(r => FRE.character.shopEntry(r))) continue;
      const sim = ws.simulate(npc);
      sim.tabs.forEach((tab, slot) => {
        tab.entries.forEach((en, i) => add(en.prop.id, { k: 'shop', npc, slot, i }));
        tab.dropped.forEach(d => { if (d.prop) add(d.prop.id, { k: 'shop', npc, slot, dropped: d.reason }); });
      });
    }
    const dm = ws.models.donation;
    if (dm) for (const [id, row] of dm.catalog) add(id, { k: 'donation', row });
    const table = ws.models.exchange ? FRE.exchangeSim.serverTable(ws.models.exchange) : null;
    const gold = u32(ws.defines.defines.get('II_GOLD_SEED1'));
    if (table) for (const [mmi, m] of table.menus) if (u32(mmi) !== 0xFFFFFFFF) m.sets.forEach((set, si) => {
      const seen = new Set();
      set.pay.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); add(p.id, { k: 'exchange', mmi, menu: m, set, si }); } });
      const used = new Set();
      set.cond.forEach(c => { if (!c.penya && c.id !== gold && !used.has(c.id)) { used.add(c.id); add(c.id, { k: 'use', mmi, menu: m, set, si }); } });
    });
    const drops = ws.models.drops;
    // DropKind: the chance of every item of every monster's windows, worked out once here (also used by sources())
    const kinds = new Map();         // monster id -> Map item id -> { perKill, among }
    if (drops) for (const [mid, mon] of drops.monsters) {
      const ids = new Set(mon.list.filter(e => e.kind === 'item').map(e => e.itemId));
      for (const id of ids) add(id, { k: 'drop', mid });
      if (!mon.kinds.length || !ws.dropContext) continue;
      const kc = kindChances(FRE.dropsSim.envFor(ws, mid));
      kinds.set(mid, kc);
      for (const [id, x] of kc) if (x.perKill > 0) add(id, { k: 'kind', mid });
    }
    const events = drops && ws.dropContext ? ws.dropContext.events : [];
    for (const e of events) add(e.itemId, { k: 'event', e });
    const bx = ws.models.boxes;
    if (bx) {
      if (bx.pack) for (const b of bx.pack.boxes.values()) b.lines.forEach((l, i) => add(l.item.value, { k: 'set', box: b, i }));
      if (bx.gift) for (const b of bx.gift.boxes.values()) {
        if (bx.pack && bx.pack.boxes.has(b.id)) continue;         // an id in both files is opened as a set (boxes-sim.js:111)
        b.lines.forEach((l, i) => add(l.item.value, { k: 'box', box: b, i }));
      }
    }
    const bp = ws.models.battlepass;
    if (bp && bp.pass) for (const r of bp.rows.BP4) if (r.type.value === bp.pass.type.value && bp.ladder.get(r.level.value) === r) add(r.id, { k: 'bp', row: r });
    // part 2: gifts and Guild Siege prizes
    const gifts = FRE.gifts.fromWorkspace(ws), genv = FRE.giftsSim.envFor(ws, gifts);
    const has = id => id !== null && !!ws.itemById(id);
    const pays = new Map();          // level-up gift -> { first, perRebirth } (for an account the gift is meant for)
    if (gifts.levelUp) {
      const accounts = new Set(gifts.levelUp.gifts.map(g => g.account));
      for (const a of accounts) for (const [g, v] of FRE.giftsSim.levelPays(genv, a === 'all' ? 'player' : a)) if (g.account === a) pays.set(g, v);
      for (const g of gifts.levelUp.gifts) if (has(g.id)) add(g.id, { k: 'levelup', g });
    }
    if (gifts.rebirth) for (const [tier, g] of gifts.rebirth.gifts) add(g.id, { k: 'rebirth', tier, g });
    const reached = new Set(gifts.couple ? FRE.giftsSim.couple(genv, { sex: [0, 1] }).levels : []);
    if (gifts.couple) for (const row of gifts.couple.items) if (has(row.id)) add(row.id, { k: 'couple', row });
    if (gifts.siege && has(genv.redChip)) { add(genv.redChip, { k: 'siege' }); add(genv.redChip, { k: 'weekly' }); }
    return { idx, table, cache: { ex: new Map(), kinds }, gifts, pays, reached };
  }
  // the per-siege table: for n guilds that applied (MINJOINGUILDSIZE .. MAXJOINGUILDSIZE), the chips of rank 1-3
  function siegeTable(gifts) {
    const { config: c, comp } = gifts.siege, rows = [];
    for (let n = Math.max(1, c.minGuild); n <= Math.max(c.minGuild, c.maxGuild); n++) {
      const r = [n];
      for (let k = 0; k < Math.min(3, n); k++) r.push(FRE.gifts.siegeChips(c.joinPenya, n, k, comp));
      rows.push(r);
    }
    return rows;
  }

  // ---------------------------------------------------------------- one item
  // -> { id, item, lines: [line], contains: [line] (the item is a box), checks: [{ severity, text }] }
  //   line = { kind, who, key (to open it in its editor), facts, ... }
  function sources(ws, itemId, model) {
    itemId = u32(itemId);
    model = model || ws.models.where || index(ws);
    const refs = model.idx.get(itemId) || [];
    const item = ws.itemById(itemId);
    const lines = [], checks = [];
    const nameOfItem = id => { const it = ws.itemById(id); return it ? (it.name || it.nameKey || it.define) : `item ${u32(id)}`; };
    const moverOf = id => (ws.movers && ws.movers.movers.get(id)) || null;
    const costs = ws.chars ? ws.costs() : null;
    // per monster, cached in the model (rebuilt with it after every reparse)
    const cache = model.cache || (model.cache = { ex: new Map(), kinds: new Map() });
    const exOf = mid => { if (!cache.ex.has(mid)) cache.ex.set(mid, FRE.dropsSim.exactChances(FRE.dropsSim.envFor(ws, mid))); return cache.ex.get(mid); };
    const kindsOf = mid => { if (!cache.kinds.has(mid)) cache.kinds.set(mid, kindChances(FRE.dropsSim.envFor(ws, mid))); return cache.kinds.get(mid); };

    // shops: one line per NPC tab (an item listed twice in a tab is one line)
    const shopSeen = new Set();
    for (const r of refs.filter(r => r.k === 'shop')) {
      const key = `${r.npc.file}|${r.npc.key}|${r.slot}|${r.dropped ? 'x' : ''}`;
      if (shopSeen.has(key)) continue;
      shopSeen.add(key);
      const npc = r.npc, chip = npc.venderType === 1 || npc.venderType === 2;
      const status = ws.placed ? FRE.world.npcStatus(npc, ws.placed) : { inGame: null, why: 'map files not read' };
      const base = { kind: 'shop', npc, slot: r.slot, who: npc.name || npc.key, tab: npc.slotTitles[r.slot], where: ws.whereOf(npc.key),
        inGame: status.inGame, why: status.why, currency: chip ? npc.venderType : 0 };
      if (r.dropped) { lines.push(Object.assign(base, { dropped: r.dropped, facts: null })); continue; }
      const en = ws.simulate(npc).tabs[r.slot].entries[r.i];
      let price;
      if (chip) price = en.prop.chip;
      else price = ws.pricedTab(npc, r.slot)[r.i].pay;
      const how = en.kind === 'generated' ? 'rule' : en.kind;
      lines.push(Object.assign(base, { price, how,
        facts: { kind: 'shop', file: npc.file, npc: npc.key, tab: r.slot + 1, currency: base.currency, price, how } }));
    }
    for (const r of refs.filter(r => r.k === 'donation')) {
      const price = item ? FRE.specItem.get(item, 'dwReferValue1') : 0;
      lines.push({ kind: 'donation', who: 'Donation Shop', category: r.row.category, price, where: ws.whereOf('MaFl_DONATION'),
        crash: FRE.donation.CRASH_ITEMS.some(d => ws.defines.defines.get(d) === itemId),
        facts: { kind: 'donation', category: r.row.category, price } });
    }
    // exchanges: the NPCs that open the menu, what it costs, the chance this reward comes per press
    const byMenu = ws.npcInfoByMenu ? ws.npcInfoByMenu() : null;
    for (const r of refs.filter(r => r.k === 'exchange' || r.k === 'use')) {
      const npcs = (byMenu && byMenu.get(r.mmi)) || [];
      const base = { menu: r.menu, mmi: r.mmi, set: r.set, si: r.si, npcs, who: npcs.length ? npcs.map(x => x.name).join(', ') : r.menu.name,
        live: ws.isLiveMenu ? ws.isLiveMenu(r.menu.menu) : null };
      if (r.k === 'use') {
        const num = r.set.cond.filter(c => c.id === itemId).reduce((a, c) => a + c.num, 0);
        lines.push(Object.assign(base, { kind: 'use', num, facts: { kind: 'use', menu: r.mmi, set: r.si + 1, num } }));
        continue;
      }
      const ch = payChances(r.set);
      const mine = r.set.pay.map((p, i) => ({ p, i })).filter(x => x.p.id === itemId);
      const chance = ch ? mine.reduce((a, x) => a + ch[x.i], 0) : null;
      const num = mine.length ? mine[0].p.num : 0;
      lines.push(Object.assign(base, { kind: 'exchange', num, chance, payNum: r.set.payNum, picks: r.set.pay.length,
        cost: r.set.cond.map(c => ({ id: c.id, num: c.num, penya: c.penya, name: c.penya ? 'Penya' : nameOfItem(c.id) })),
        facts: { kind: 'exchange', menu: r.mmi, set: r.si + 1, num, chance: chance === null ? null : round12(chance) } }));
    }
    // monster drops: the monster's own lines, then the event lines (per monster), then DropKind
    const dropMons = [...new Set(refs.filter(r => r.k === 'drop').map(r => r.mid))];
    for (const mid of dropMons) {
      const ex = exOf(mid);
      const mine = ex.lines.filter(l => l.entry.kind === 'item' && !l.entry.event && l.entry.itemId === itemId);
      const perKill = mine.reduce((a, l) => a + l.perKill, 0);
      const mv = moverOf(mid);
      lines.push({ kind: 'drop', mid, who: mv ? mv.name : String(mid), level: mv ? mv.level : null, perKill,
        number: Math.max(...mine.map(l => (l.entry.number === 0xFFFFFFFF ? 1 : l.entry.number))),
        facts: { kind: 'drop', monster: mid, perKill: round12(perKill) } });
    }
    const evs = refs.filter(r => r.k === 'event').map(r => r.e);
    if (evs.length && ws.models.drops) {
      for (const [mid] of ws.models.drops.monsters) {
        const mv = moverOf(mid);
        if (!mv || !evs.some(e => u32(mv.level) >= e.minLv && u32(mv.level) <= e.maxLv)) continue;
        const ex = exOf(mid);
        const perKill = ex.lines.filter(l => l.entry.event && l.entry.itemId === itemId).reduce((a, l) => a + l.perKill, 0);
        lines.push({ kind: 'event', mid, who: mv.name, level: mv.level, perKill, facts: { kind: 'event', monster: mid, perKill: round12(perKill) } });
      }
    }
    for (const mid of refs.filter(r => r.k === 'kind').map(r => r.mid)) {
      {
        const r = kindsOf(mid).get(itemId);
        const mv = moverOf(mid);
        lines.push({ kind: 'kind', mid, who: mv ? mv.name : String(mid), level: mv ? mv.level : null, perKill: r.perKill,
          among: r.among, facts: { kind: 'kind', monster: mid, perKill: round12(r.perKill) } });
      }
    }
    // boxes
    for (const r of refs.filter(r => r.k === 'box' || r.k === 'set')) {
      const l = r.box.lines[r.i], bi = ws.itemById(r.box.id);
      const base = { box: r.box, who: bi ? (bi.name || bi.define) : (r.box.define || String(r.box.id)), num: l.num.value,
        upgrade: FRE.boxes.upgradeOf(l), minutes: FRE.boxes.minutesOf(l) };
      if (r.k === 'set') {
        lines.push(Object.assign(base, { kind: 'set', facts: { kind: 'set', box: r.box.id, num: base.num, upgrade: base.upgrade, minutes: r.box.span || 0 } }));
        continue;
      }
      const chance = FRE.boxes.chances(r.box)[r.i];
      const bound = (FRE.boxes.flagOf(l) & FRE.boxes.FLAG_BOUND) !== 0;
      lines.push(Object.assign(base, { kind: 'box', chance, bound,
        facts: { kind: 'box', box: r.box.id, num: base.num, chance: round12(chance), bound, minutes: base.minutes, upgrade: base.upgrade } }));
    }
    for (const r of refs.filter(r => r.k === 'bp')) {
      const row = r.row;
      // the server clamps the cost to 1..10000 and the count to at least 1 (loaders/battlepass.js)
      const points = Math.min(Math.max(row.points.value, 1), 10000), num = Math.max(row.qty.value, 1);
      lines.push({ kind: 'bp', who: 'Battle Pass', level: row.level.value, points, num, facts: { kind: 'bp', level: row.level.value, points, num } });
    }

    // part 2: gifts and Guild Siege prizes
    for (const r of refs.filter(r => r.k === 'levelup')) {
      const g = r.g, p = (model.pays && model.pays.get(g)) || { first: 0, perRebirth: 0 };
      lines.push({ kind: 'levelup', who: 'Level-up gift', level: g.level, num: g.num, flag: g.flag, bound: (g.flag & FRE.gifts.FLAG_BOUND) !== 0,
        minutes: g.minutes > 0 ? g.minutes : 0, account: g.account, event: g.event.name, on: g.event.on, first: p.first, perRebirth: p.perRebirth,
        facts: { kind: 'levelup', level: g.level, num: g.num, flag: g.flag, minutes: g.minutes > 0 ? g.minutes : 0, account: g.account, on: g.event.on, first: p.first, perRebirth: p.perRebirth } });
    }
    for (const r of refs.filter(r => r.k === 'rebirth')) {
      lines.push({ kind: 'rebirth', who: 'Rebirth gift', tier: r.tier, num: r.g.num, facts: { kind: 'rebirth', tier: r.tier, num: r.g.num } });
    }
    for (const r of refs.filter(r => r.k === 'couple')) {
      const row = r.row, reached = !!(model.reached && model.reached.has(row.level));
      lines.push({ kind: 'couple', who: 'Couple gift', level: row.level, sex: row.sex, flag: row.flag, bound: (row.flag & FRE.gifts.FLAG_BOUND) !== 0,
        minutes: row.minutes > 0 ? row.minutes : 0, num: row.num, reached,
        facts: { kind: 'couple', level: row.level, sex: row.sex, flag: row.flag, minutes: row.minutes > 0 ? row.minutes : 0, num: row.num, reached } });
    }
    const gifts = model.gifts;
    if (refs.some(r => r.k === 'siege') && gifts && gifts.siege) {
      const table = siegeTable(gifts), c = gifts.siege.config;
      lines.push({ kind: 'siege', who: 'Guild Siege', table, config: c, from: gifts.siege.comp.from,
        facts: { kind: 'siege', joinPenya: c.joinPenya, table } });
    }
    if (refs.some(r => r.k === 'weekly') && gifts && gifts.siege) {
      const w = gifts.siege.comp.weekly;
      lines.push({ kind: 'weekly', who: 'Guild Siege weekly', weekly: w, from: gifts.siege.comp.from,
        facts: { kind: 'weekly', guild: w.guild, total: w.total, perClass: w.perClass, mvp: w.mvp } });
    }

    // the item is a box: what opening it gives
    const contains = [];
    const bx = ws.models.boxes;
    const pack = bx && bx.pack && bx.pack.boxes.get(itemId), gift = !pack && bx && bx.gift && bx.gift.boxes.get(itemId);
    if (pack) pack.lines.forEach(l => contains.push({ kind: 'set', id: u32(l.item.value), name: nameOfItem(l.item.value), num: l.num.value, upgrade: FRE.boxes.upgradeOf(l), minutes: pack.span || 0 }));
    if (gift) { const ch = FRE.boxes.chances(gift); gift.lines.forEach((l, i) => contains.push({ kind: 'box', id: u32(l.item.value), name: nameOfItem(l.item.value), num: l.num.value, chance: ch[i],
      bound: (FRE.boxes.flagOf(l) & FRE.boxes.FLAG_BOUND) !== 0, minutes: FRE.boxes.minutesOf(l), upgrade: FRE.boxes.upgradeOf(l) })); }

    // checks
    const never = l => l.kind === 'levelup' && (!l.on || (l.first === 0 && l.perRebirth === 0));
    const gets = lines.filter(l => l.kind !== 'use' && !l.dropped);
    const real = gets.filter(l => !(l.kind === 'shop' && l.inGame === false) && !(l.kind === 'exchange' && l.live === false)
      && !((l.kind === 'drop' || l.kind === 'event' || l.kind === 'kind') && !(l.perKill > 0)) && !never(l) && !(l.kind === 'couple' && !l.reached));
    if (!gets.length) checks.push({ severity: 'WARN', code: 'W_NONE', text: 'Can\'t be obtained in game: no shop, exchange, monster, box, Battle Pass, gift or prize gives it (only a GM can create it).' });
    else if (!real.length) checks.push({ severity: 'WARN', code: 'W_HIDDEN', text: 'Can\'t be obtained in game: only from NPCs or exchanges that are not in the game, or from gifts that are never given.' });
    for (const l of lines.filter(l => l.kind === 'levelup')) {
      if (!l.on) checks.push({ severity: 'WARN', code: 'W_GIFT_EVENT_OFF', text: `The level ${l.level} gift is in the Event.lua event "${l.event}", which is not running now (its SetTime dates): nobody gets it.` });
      else if (l.first === 0 && l.perRebirth === 0) checks.push({ severity: 'WARN', code: 'W_GIFT_NEVER', text: (l.level === 121 || l.level === 131)
        ? `The level ${l.level} gift is never given: players get to level ${l.level} by ${l.level === 121 ? 'the automatic Master → Hero change' : 'the Legend promotion'}, which sets the level directly (InitLevel), and only a level gained with EXP gives a gift (MoverParam.cpp:1627).`
        : `The level ${l.level} gift is never given: no character gains level ${l.level} with EXP (levels go 1-15 Vagrant, 16-60 Expert, 61-120 Pro and Master, 122-130 Hero, 132-150 Legend).` });
      else if (l.first > 1 || l.perRebirth > 0) checks.push({ severity: 'INFO', code: 'W_GIFT_REPEAT', text: `The level ${l.level} gift is given ${l.first} times before the first rebirth (as Pro and again as Master)${l.perRebirth ? `, and ${l.perRebirth === 1 ? 'once' : l.perRebirth + ' times'} more after every rebirth (rebirth starts again at Master level 60)` : ''}.` });
    }
    for (const l of lines.filter(l => l.kind === 'couple' && !l.reached)) checks.push({ severity: 'WARN', code: 'W_COUPLE_UNREACHABLE', text: `The couple level ${l.level} gift is never given: couples stop at level ${FRE.gifts.MAX_COUPLE_LEVEL} (couple.h:17).` });
    const sg = lines.find(l => l.kind === 'siege' || l.kind === 'weekly');
    if (sg && gifts.siege.comp.changed.length) checks.push({ severity: 'WARN', code: 'W_CPP_CHANGED', text: `The Guild Siege C++ changed: ${gifts.siege.comp.changed.join('; ')}. The numbers shown for those parts are the editor's own copy (cda3af21).` });
    const set = costs && costs.get(itemId);
    if (set && set.by.length) {
      const last = set.by[set.by.length - 1];
      checks.push({ severity: 'INFO', code: 'W_PRICE_SET', text: `Its Penya price is set by an AddShopItem line in ${last.npc.name || last.npc.key}'s shop: ${FRE.num.group(set.cost)} in every Penya shop (Spec_Item.txt says ${FRE.num.group(set.base)}).` });
    }
    if (lines.some(l => l.kind === 'donation' && l.crash)) checks.push({ severity: 'BLOCK', code: 'W_CRASH', text: 'Buying it in the Donation Shop crashed the server (commit ae345504).' });
    return { id: itemId, item, lines, contains, checks };
  }

  // the canonical facts of one item, sorted (what tests/run-tests.js compares with the Python copy)
  function factsOf(res) {
    const key = f => JSON.stringify(f);
    return res.lines.filter(l => l.facts).map(l => l.facts).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }

  FRE.where = { index, sources, factsOf, payChances, kindChances, kindChance, siegeTable, CURRENCY };
})(globalThis.FRE = globalThis.FRE || {});
