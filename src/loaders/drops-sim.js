// Killing a monster: what it drops. A port of the WorldServer's kill path.
//   kill            = CMover::DropItem               (_Common/Mover.cpp:8124-8961), after DropItemByDied (Mover.cpp:8102:
//                     the top damage dealer gets the drops), from AttackArbiter.cpp:1054
//   rolls / gate    = Mover.cpp:8483-8600: nloop (Gift Box party mode, GET01 +1, GET02 +2, DST_GIFTBOX), bUnique (Fortune Circle),
//                     the level-gap table and xRandom( 100 ) < nProbability * GetItemDropRateFactor (MoverParam.cpp:4423)
//   getAt           = CDropItemGenerator::GetAt     (_Common/Project.cpp:184-208): dwRand = xRandom( 3000000000 ) / GetPieceItemDropRateFactor
//                     (MoverParam.cpp:4440), float32, then dwRand < dwProbability. The x10 item rate only feeds the gate.
//   item lines      = Mover.cpp:8604-8716 (bag for flying monsters, ground otherwise; Maxitem stops: >= in the bag, == on the ground)
//   Penya           = Mover.cpp:8717-8746 (roll 0 only) + PenyaTable::Roll (_Common/PenyaTable.cpp:84-136) + CanAdd (DPSrvr.cpp:116);
//                     __PENYA_TO_INVENTORY: straight to the bag
//   genRandomOpt    = CRandomOptItemGen::GenRandomOptItem (Project.cpp:4918): weapons / armor dropped on the ground
//   DropKind        = Mover.cpp:8823-8956 (rarity window, m_itemKindAry pick, xRandom( 11 ) start upgrade, expDropLuck × dwCorrectionValue)
// Floats are float32 (Math.fround), (int)( float ) is a truncation (cvttss2si: out of range -> INT_MIN), ints wrap at 32 bits.
//
// Not modelled (they happen before or beside the drops and don't use xRandom on the lines below, unless noted):
//   - event items (CEventGeneric::GetItem calls xRandom when an event item times out; EventLua items use Lua math.random) and quest items
//     (QuestItem lines roll xRandom( 3e9 ) for players on the quest): the simulator assumes none are pending;
//   - event monsters / EventLua spawns (no level-gap table, own drop range), guild / party quest monsters, m_nLoot == 2 inventories;
//   - Anarchy, Lord event, PC-bang factors: set them through the options (anarchyGold, pieceRate, cheering, voteThanks);
//   - CreateItem in detail: `bagFull` makes every bag drop fail (flying monsters), otherwise it always succeeds;
//   - xRandomF (item positions) uses the C runtime's rand(), a different generator: it doesn't move xRand.
(function (FRE) {
  'use strict';
  const D = () => FRE.drops;
  const f32 = Math.fround;
  const u32 = v => v >>> 0;
  const INT_MIN = -2147483648;
  const toInt = v => (Number.isNaN(v) || v >= 2147483648 || v < -2147483648) ? INT_MIN : Math.trunc(v);
  const NONE = 0xFFFFFFFF;

  // The level-gap table (Mover.cpp:8586-8594): [items %, Penya %]
  function levelGap(playerLevel, monsterLevel) {
    const d = playerLevel - monsterLevel;
    if (d <= 1) return [100, 100];
    if (d <= 2) return [80, 100];
    if (d <= 4) return [60, 80];
    if (d <= 7) return [30, 65];
    return [10, 50];
  }

  // env: { mover, list (DropItem / DropGold entries + the event lines, in the server's order), kinds (DropKind entries),
  //        maxItems, ctx (FRE.drops.contextFromFiles), items (Spec_Item Map), defines (Map) }
  function envFor(ws, monsterId, model) {
    model = model || ws.models.drops;
    const mon = model.monsters.get(monsterId) || { id: monsterId, define: String(monsterId), list: [], kinds: [], maxValue: 0, blocks: [] };
    const mover = ws.movers.movers.get(monsterId) || null;
    const ctx = ws.dropContext;
    const events = D().eventLinesFor(ctx.events, mover);
    return { mon, mover, list: mon.list.concat(events), kinds: mon.kinds.slice(0, D().MAX_DROPKIND), maxItems: mon.maxValue,
      ctx, items: ws.items.items, defines: ws.defines.defines };
  }

  // The factors (MoverParam.cpp:4423-4463, all float32)
  function factors(o) {
    let item = f32(1);
    item = f32(item * f32(o.gmItemRate));        // prj.m_fItemDropRate (1.0 until a GM changes it, CProject::SetGlobal)
    item = f32(item * f32(1));                   // pProp->m_fItemDrop_Rate (always 1.0, ProjectCmn.cpp:551)
    item = f32(item * f32(1));                   // CEventGeneric factor (no propEvent rates here)
    item = f32(item * f32(o.itemRate));          // EventLua GetItemDropRate (Event.lua "Server Rates" x10)
    let piece = f32(1);
    piece = f32(piece * f32(o.pieceRate));       // EventLua GetPieceItemDropRate
    piece = f32(piece * f32(1));                 // Lord event GetIFactor
    if (o.cheering) piece = f32(piece * f32(1.1));
    if (o.voteThanks) piece = f32(piece * f32(1.05));
    piece = f32(piece * f32(1));                 // PC-bang
    piece = f32(piece + f32(f32(o.anarchyPiece) / f32(100)));
    return { item, piece };
  }

  const DEFAULTS = { playerLevel: null, loops: 1, fortune: false, gmItemRate: 1, gmGoldRate: 1, itemRate: null, pieceRate: null, goldRate: null,
    cheering: false, voteThanks: false, anarchyPiece: 0, anarchyGold: 0, penyaRate: 0, worldId: 1, bagFull: false, gold: 0 };
  function options(env, o) {
    const r = Object.assign({}, DEFAULTS, o || {});
    const rates = env.ctx.rates;
    if (r.itemRate == null) r.itemRate = rates.item;
    if (r.pieceRate == null) r.pieceRate = rates.piece;
    if (r.goldRate == null) r.goldRate = rates.gold;
    if (r.playerLevel == null) r.playerLevel = env.mover ? env.mover.level : 1;
    return r;
  }

  // PenyaTable::Roll (PenyaTable.cpp:84-136). Returns the new gold (or the old one when the rank has no row)
  function penyaRoll(tbl, rnd, level, rank, world, gold) {
    if (!tbl.rows.length || u32(rank) >= 16 || tbl.rankPct[rank] <= 0) return gold;
    const rows = tbl.rows;
    let min, max;
    if (level <= rows[0].level) { min = rows[0].min; max = rows[0].max; }
    else if (level >= rows[rows.length - 1].level) { min = rows[rows.length - 1].min; max = rows[rows.length - 1].max; }
    else {
      let i = 1;
      while (rows[i].level < level) i++;
      const lo = rows[i - 1], hi = rows[i];
      const span = hi.level - lo.level, step = level - lo.level;
      min = lo.min + Math.trunc((hi.min - lo.min) * step / span) | 0;
      max = lo.max + Math.trunc((hi.max - lo.max) * step / span) | 0;
    }
    let wp = 100;
    for (const [w, p] of tbl.worlds) if (w === u32(world)) { wp = p; break; }
    min = Math.trunc(Math.trunc(min * tbl.rankPct[rank] / 100) * wp / 100) | 0;
    max = Math.trunc(Math.trunc(max * tbl.rankPct[rank] / 100) * wp / 100) | 0;
    if (max < min) max = min;
    const g = (min + (rnd.random(u32(max - min + 1)) | 0)) | 0;
    if (tbl.rankAtLeast[rank] && gold > g) return gold;
    return g;
  }

  // GenRandomOptItem (Project.cpp:4918-4937)
  function genRandomOpt(env, rnd, level, penalty, item, rank) {
    if (!item) return 0;
    const ik1 = FRE.specItem.get(item, 'dwItemKind1');
    const W = env.defines.get('IK1_WEAPON'), A = env.defines.get('IK1_ARMOR');
    if (ik1 !== W && ik1 !== A) return 0;
    if (level >= D().MAX_MONSTER_LEVEL) level = D().MAX_MONSTER_LEVEL - 1;
    const ro = env.ctx.randomOpt;
    const i = ro.anIndex[level];
    if (i === undefined || i === -1) return 0;
    const idx = rnd.random(i + 1);
    let r = rnd.random(3000000000);
    if (rank === env.defines.get('RANK_MIDBOSS')) r = Math.floor(r / 5);
    const p = u32(toInt(f32(f32(ro.list[idx].prob) * penalty)) >>> 0);
    return r < p ? ro.list[idx].id : 0;
  }

  // One kill. rnd: FRE.xRandom.rng(seed). Returns { rolls: [{ gate, stop }], drops: [{ id, n, plus, opt, where, from }], gold, crash }
  function kill(env, rnd, opts) {
    const o = options(env, opts);
    const mv = env.mover || { level: 1, rankId: 1, flying: 0, correction: 100, id: 0, define: '' };
    const level = mv.level | 0, rank = mv.rankId, flying = !!mv.flying;
    const fac = factors(o);
    const res = { rolls: [], drops: [], gold: 0, crash: null };
    const noAdj = ['MI_CLOCKWORK1', 'MI_DEMIAN5', 'MI_KEAKOON5', 'MI_MUFFRIN5'].some(n => env.defines.get(n) === mv.id);
    const maxItems = u32(env.maxItems);
    const SUPER = env.defines.get('RANK_SUPER');
    for (let k = 0; k < o.loops; k++) {
      const [nProb, nPenya] = noAdj ? [100, 100] : levelGap(o.playerLevel, level);
      const roll = { gate: false, stop: null };
      res.rolls.push(roll);
      const rate = f32(f32(nProb) * fac.item);
      if (!(f32(rnd.random(100)) < rate)) continue;
      roll.gate = true;
      let nNumber = 0;
      for (let i = 0; i < env.list.length; i++) {
        const e = env.list[i];
        // GetAt
        let pass;
        if (fac.piece > 0) {
          const r = rnd.random(3000000000);
          const dw = u32(toInt(f32(f32(r) / fac.piece)));
          pass = dw < (e.kind === 'gold' ? NONE : e.probability);
        } else pass = true;
        if (!pass) continue;
        if (e.kind === 'item') {
          const num = e.number === NONE ? 1 : e.number;
          if (num === 0) { res.crash = { at: i, why: 'xRandom(0): amount 0' }; return res; }
          const n = ((rnd.random(num) + 1) << 16) >> 16;          // (short)
          if (flying) {
            if (o.bagFull) continue;                              // CreateItem failed: no count, no stop check
            res.drops.push({ id: e.itemId, n, plus: e.levelValue, opt: 0, where: 'bag', from: i });
            if (e.number !== NONE) nNumber++;
            if (u32(nNumber) >= maxItems) { roll.stop = i; break; }
            continue;
          }
          const item = env.items.get(e.itemId) || null;
          let opt = 0;
          if (item) opt = genRandomOpt(env, rnd, level, f32(f32(nProb) / f32(100)), item, rank);
          if (!item) { res.crash = { at: i, why: `item ${e.itemId} has no Spec_Item row (Mover.cpp:8701)` }; return res; }
          res.drops.push({ id: e.itemId, n, plus: e.levelValue, opt, where: 'ground', from: i });
          if (e.number !== NONE) nNumber++;
          if (u32(nNumber) === maxItems) { roll.stop = i; break; }
        } else if (e.kind === 'gold' && k === 0) {
          const span = u32(e.maxValue - e.minValue);
          if (span === 0) { res.crash = { at: i, why: 'xRandom(0): DropGold min = max' }; return res; }
          let g = u32(e.minValue + rnd.random(span)) | 0;
          g = penyaRoll(env.ctx.penya, rnd, level, rank, o.worldId, g);
          g = Math.trunc(Math.imul(g, nPenya) / 100) | 0;
          g = toInt(f32(f32(f32(g) * f32(o.gmGoldRate)) * f32(1)));
          if (g === 0) continue;
          g = toInt(f32(f32(g) * f32(o.goldRate)));
          g = toInt(f32(f32(g) * f32(f32(1) + f32(f32(o.anarchyGold) / f32(100)))));
          g = toInt(f32(f32(g) * f32(f32(1) + f32(f32(o.penyaRate | 0) / f32(100)))));
          const have = u32(o.gold) | 0;
          if (g > 0 && ((have + g) | 0) > have) res.gold += g;
        }
      }
      // DropKind
      const [lo, hi] = D().kindWindow(level);
      for (let i = 0; i < env.kinds.length; i++) {
        const kd = env.kinds[i];
        let bDrop = false;
        let mn = -1, mx = -1;
        for (let j = lo; j <= hi; j++) { mn = D().minIdx(env.ctx.kinds, kd.ik3Value, j); if (mn !== -1) break; }
        for (let j = hi; j >= lo; j--) { mx = D().maxIdx(env.ctx.kinds, kd.ik3Value, j); if (mx !== -1) break; }
        if (mn < 0 || mx < 0) continue;
        const ary = env.ctx.kinds.get(kd.ik3Value).list;
        const pick = ary[mn + rnd.random(mx - mn + 1)];
        if (!pick) continue;
        const start = rnd.random(11);
        const lvIdx = pick.lv > 120 ? 119 : pick.lv - 1;
        if (lvIdx < 0) { res.crash = { at: `kind ${i}`, why: `item ${pick.id} has dwItemLV 0: expDropLuck[-1] is read out of bounds` }; return res; }
        const corr = f32(f32(u32(mv.correction)) / f32(100));
        for (let kk = start; kk >= 0; kk--) {
          const p = u32(toInt(f32(f32(env.ctx.luck[lvIdx][kk]) * corr)));
          let r = rnd.random(3000000000);
          if (o.fortune && p <= 10000000) r = Math.floor(r / 2);
          if (r < p) {
            if (flying) {
              const opt = genRandomOpt(env, rnd, level, f32(f32(nProb) / f32(100)), pick.item, rank);
              if (!o.bagFull) { res.drops.push({ id: pick.id, n: 1, plus: kk, opt, where: 'bag', from: `kind ${i}` }); break; }
            }
            const opt = genRandomOpt(env, rnd, level, f32(f32(nProb) / f32(100)), pick.item, rank);
            res.drops.push({ id: pick.id, n: 1, plus: kk, opt, where: 'ground', from: `kind ${i}` });
            bDrop = true;
            break;
          }
        }
        if (rank === SUPER && bDrop) break;
      }
    }
    return res;
  }

  // Kill it N times: how often each line drops, the Penya, how often Maxitem stopped the list.
  function run(env, opts) {
    const o = Object.assign({ kills: 1000, seed: 1 }, opts || {});
    const rnd = FRE.xRandom.rng(o.seed);
    const out = { kills: o.kills, lines: new Map(), kinds: new Map(), gold: { total: 0, min: Infinity, max: 0, kills: 0 }, stops: 0, gates: 0, crash: null };
    for (let n = 0; n < o.kills; n++) {
      const r = kill(env, rnd, o);
      if (r.crash) { out.crash = Object.assign({ kill: n + 1 }, r.crash); break; }
      for (const g of r.rolls) { if (g.gate) out.gates++; if (g.stop != null) out.stops++; }
      for (const d of r.drops) {
        const map = typeof d.from === 'number' ? out.lines : out.kinds;
        const key = typeof d.from === 'number' ? d.from : d.id;
        const s = map.get(key) || { times: 0, count: 0, id: d.id };
        s.times++; s.count += d.n;
        map.set(key, s);
      }
      out.gold.total += r.gold;
      if (r.gold) out.gold.kills++;
      out.gold.min = Math.min(out.gold.min, r.gold); out.gold.max = Math.max(out.gold.max, r.gold);
    }
    if (out.gold.min === Infinity) out.gold.min = 0;
    return out;
  }

  // The exact chance per line (no simulation): the gate × the line's own chance × P(the Maxitem stop has not come yet).
  // Uses the modulo-biased roll odds (FRE.drops.belowP). Only roll 0 pays Penya; every roll repeats the item lines.
  // Returns { gate, lines: [{ entry, chance (per roll), perKill (expected drops per kill), reach }], avgGold: null (see run) }
  function exactChances(env, opts) {
    const o = options(env, opts);
    const mv = env.mover || { level: 1, rankId: 1, flying: 0, id: 0 };
    const noAdj = ['MI_CLOCKWORK1', 'MI_DEMIAN5', 'MI_KEAKOON5', 'MI_MUFFRIN5'].some(n => env.defines.get(n) === mv.id);
    const [nProb] = noAdj ? [100] : levelGap(o.playerLevel, mv.level | 0);
    const fac = factors(o);
    const rate = f32(f32(nProb) * fac.item);
    const gate = D().belowP(100, Math.min(100, Math.ceil(rate)));
    const max = u32(env.maxItems);
    // dist[c] = P(c counted drops so far and the list not stopped)
    let dist = [1];
    const lines = [];
    for (const e of env.list) {
      const reach = dist.reduce((a, b) => a + b, 0);
      const p = e.kind === 'gold' ? 1 : D().belowP(3000000000, D().getAtLimit(e.probability, fac.piece));
      lines.push({ entry: e, chance: p, reach, perRoll: gate * reach * p });
      if (e.kind !== 'item') continue;
      const counts = e.number !== NONE && !(mv.flying && o.bagFull);
      const next = new Array(dist.length + 1).fill(0);
      for (let c = 0; c < dist.length; c++) {
        if (!dist[c]) continue;
        next[c] += dist[c] * (1 - p);
        const nc = counts ? c + 1 : c;
        // ground: nNumber == m_dwMax after EVERY drop, counted or not (Mover.cpp:8714): with no Maxitem line (m_dwMax 0)
        // the first uncounted drop (amount "=" / -1, every event line) stops the list
        const stop = mv.flying ? u32(nc) >= max && !o.bagFull : u32(nc) === max;
        if (!stop) next[nc] += dist[c] * p;
      }
      while (next.length > 1 && !next[next.length - 1]) next.pop();
      dist = next;
    }
    for (const l of lines) l.perKill = l.entry.kind === 'gold' ? l.perRoll : l.perRoll * o.loops;
    return { gate, rate, lines, loops: o.loops };
  }

  // The Penya one kill pays (roll 0, no Maxitem stop): [lowest, highest] after PenyaTable and the rates, and where it comes from.
  // DropGold rolls min .. max-1; PenyaTable (when the rank has a row) rolls its own range (mode 0 replaces, mode 1 keeps the higher).
  function penyaRange(env, opts) {
    const o = options(env, opts);
    const g = env.list.find(e => e.kind === 'gold');
    if (!g) return null;
    const mv = env.mover || { level: 1, rankId: 1 };
    const tbl = env.ctx.penya, rank = mv.rankId;
    let lo = g.minValue | 0, hi = (u32(g.maxValue - g.minValue) ? u32(g.minValue + u32(g.maxValue - g.minValue) - 1) : g.minValue) | 0, from = 'DropGold';
    if (tbl.rows.length && u32(rank) < 16 && tbl.rankPct[rank] > 0) {
      const fixed = n => ({ random: () => n });
      const tlo = penyaRoll(Object.assign({}, tbl, { rankAtLeast: [] }), fixed(0), mv.level | 0, rank, o.worldId, 0);
      const span = penyaRoll(Object.assign({}, tbl, { rankAtLeast: [] }), { random: m => m - 1 }, mv.level | 0, rank, o.worldId, 0);
      if (tbl.rankAtLeast[rank]) { lo = Math.max(lo, tlo); hi = Math.max(hi, span); from = 'PenyaTable.txt (or DropGold if higher)'; }
      else { lo = tlo; hi = span; from = 'PenyaTable.txt'; }
    }
    const [, nPenya] = levelGap(o.playerLevel, mv.level | 0);
    const pay = v => {
      v = Math.trunc(Math.imul(v, nPenya) / 100) | 0;
      v = toInt(f32(f32(f32(v) * f32(o.gmGoldRate)) * f32(1)));
      v = toInt(f32(f32(v) * f32(o.goldRate)));
      v = toInt(f32(f32(v) * f32(f32(1) + f32(f32(o.anarchyGold) / f32(100)))));
      return toInt(f32(f32(v) * f32(f32(1) + f32(f32(o.penyaRate | 0) / f32(100)))));
    };
    return { min: pay(lo), max: pay(hi), from, dropGold: [g.minValue, g.maxValue], rates: o.goldRate };
  }

  FRE.dropsSim = { penyaRange, kill, run, envFor, exactChances, levelGap, factors, penyaRoll, genRandomOpt, DEFAULTS };
})(globalThis.FRE = globalThis.FRE || {});
