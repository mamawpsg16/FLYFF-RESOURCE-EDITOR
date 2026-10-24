// Economy: the JS copy (loaders/spawns.js, loaders/economy-sim.js) against tools/oracle_sim.py economy (written from the C++).
// Used by tests/run-tests.js and tests/run-economy.js (alone: quick, planted bugs).
export function checkEconomy({ FRE, py, ws, ok, eq, print }) {
  const J = JSON.stringify, E = FRE.economySim, D = ws.defines.defines;
  const m = ws.models.economy;
  const line = l => [l.mover, l.max, l.seconds, l.gmIndex, l.dayMin, l.dayMax, l.hourMin, l.hourMax];
  let same = 0;
  for (const c of py.rgn) {
    const js = FRE.spawns.read({ text: c.text }, { defines: D }).map(r => [r.version, r.type, r.index, r.max, r.time, r.attack, r.dayMin, r.dayMax, r.hourMin, r.hourMax]);
    if (J(js) === J(c.recs)) same++; else print(`  rgn text: JS ${J(js)}\n  PY ${J(c.recs)}`);
  }
  eq(same, py.rgn.length, `${py.rgn.length} made-up .rgn texts (respawn 1-7, control elements 1 / 2 in v3 / v6 / v7 before a monster line, comments, a region record): the same records`);
  same = 0;
  const jsMaps = m.maps.map(x => ({ world: x.world, file: x.file, lines: x.lines.map(line) }));
  for (let i = 0; i < py.maps.length; i++) if (J(jsMaps[i]) === J(py.maps[i])) same++; else if (same >= 0) print(`  map ${py.maps[i].file}: JS ${J(jsMaps[i]).slice(0, 300)}\n  PY ${J(py.maps[i]).slice(0, 300)}`);
  eq(same, py.maps.length, `${py.maps.length} maps: the same spawn lines (monster, how many, seconds after the x0.7 / x0.5 cut and the /2 of CRespawner::Add, list place, day / hour window)`);
  eq(jsMaps.length, py.maps.length, 'the same number of maps');
  same = 0;
  const sp = m.spots.map(s => ({ world: s.world, mover: s.mover, count: s.count, boxes: s.boxes, cap: s.cap, boxCap: s.boxCap }));
  for (let i = 0; i < py.spots.length; i++) if (J(sp[i]) === J(py.spots[i])) same++; else if (same - i > -3) print(`  spot ${i}: JS ${J(sp[i])}\n  PY ${J(py.spots[i])}`);
  eq(same, py.spots.length, `${py.spots.length} spots (map + monster): the same monsters, counts, boxes and exact respawn caps`);
  eq(sp.length, py.spots.length, 'the same number of spots');
  const byKey = new Map(m.spots.map(s => [`${s.world}:${s.mover}`, s]));
  const MAD = D.get('WI_WORLD_MADRIGAL');
  same = 0;
  for (const t of py.timelines) {
    const s = byKey.get(`${t.world}:${t.mover}`);
    const r = s ? E.respawnRun(s.lines, { speed: t.speed === null ? Infinity : t.speed, seed: t.seed, seconds: 900, warmup: 120, madrigal: t.world === MAD }) : null;
    const js = r && { kills: r.kills, spawned: r.spawned, expiries: r.expiries, alive: r.alive };
    if (J(js) === J(t.r)) same++; else if (same > -1) print(`  timeline ${t.world}:${t.mover} speed ${t.speed}: JS ${J(js)} PY ${J(t.r)}`);
  }
  eq(same, py.timelines.length, `${py.timelines.length} respawn timelines of real spots (4 / 15 / 30 kills a minute and instant, 15 minutes after 2 of warm-up): the same kills, spawns, refills and monsters left`);
  same = 0;
  for (const c of py.made) {
    const lines = c.lines.map(a => ({ mover: a[0], max: a[1], seconds: a[2], gmIndex: a[3], dayMin: a[4], dayMax: a[5], hourMin: a[6], hourMax: a[7] }));
    const o = c.opts;
    const r = E.respawnRun(lines, { speed: c.speed === null ? Infinity : c.speed, seed: c.seed, seconds: 1800, warmup: 0, startMs: o.start || 0,
      madrigal: !!o.madrigal, rebirthRate: o.rebirth == null ? 1 : o.rebirth, respawnRate: o.respawn == null ? 1 : o.respawn });
    const js = { kills: r.kills, spawned: r.spawned, expiries: r.expiries, alive: r.alive };
    const cap = lines.map(l => E.capAverage(l));
    if (J(js) === J(c.r) && J(cap) === J(c.cap)) same++; else print(`  made ${J(c.lines)} ${J(o)} speed ${c.speed}: JS ${J(js)} ${J(cap)}\n  PY ${J(c.r)} ${J(c.cap)}`);
  }
  eq(same, py.made.length, `${py.made.length} made-up timelines (times 0 / 1 / 2 / 7 / above the short wrap, max 0 / 1 / odd / negative, Madrigal's first line with other rates, day / hour windows incl. min > max and min == max, a moving game clock; 6 speeds): the same results and caps`);
  same = 0;
  let shown = 0;
  for (const h of py.hours) {
    const pk = E.perKill(ws, h.mover, { level: h.level, loops: h.loops, kills: h.kills, seed: h.seed }, h.world);
    const items = Object.fromEntries([...pk.totals.items].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), v]));
    const s = byKey.get(`${h.world}:${h.mover}`);
    const kpm = [4, 15, 30].map(v => E.spotHour(ws, s, { speed: v, level: h.level, loops: h.loops, kills: h.kills, seed: h.seed }, new Map()).kpm);
    const js = { gold: pk.totals.penya, loot: pk.totals.loot, items };
    const ex = E.exactItems(ws, h.mover, { level: h.level, loops: h.loops });
    const cur = Object.fromEntries([...ex].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), Number(v.toPrecision(12))]));
    if (J(js) === J(h.pk) && J(kpm) === J(h.kpm) && J(cur) === J(h.cur)) same++;
    else if (shown++ < 3) print(`  hour ${h.world}:${h.mover} lv ${h.level} x${h.loops}: JS ${J(js).slice(0, 300)} ${J(kpm)} ${J(cur)}\n  PY ${J(h.pk).slice(0, 300)} ${J(h.kpm)} ${J(h.cur)}`);
  }
  eq(same, py.hours.length, `${py.hours.length} spot runs (every 9th spot x 4 player levels (150, the monster's, +2, +9) x 1 / 2 rolls, 100 kills each): the same Penya, items and loot sell value, the same exact drops per kill of every item (12 digits) and kills a minute`);
  same = 0;
  for (const x of py.exact) {
    const ex = E.exactItems(ws, x.mover, { level: x.level, loops: x.loops, itemRate: 1, pieceRate: 1 });
    const js = Object.fromEntries([...ex].sort((a, b) => a[0] - b[0]).map(([k, v]) => [String(k), Number(v.toPrecision(12))]));
    if (J(js) === J(x.ex)) same++; else if (same > -1) print(`  exact ${x.mover} lv ${x.level}: JS ${J(js).slice(0, 300)}\n  PY ${J(x.ex).slice(0, 300)}`);
  }
  eq(same, py.exact.length, `${py.exact.length} exact drop lists at rates x1 (every 23rd spot + the monsters with min-max amounts, player 0-8 levels above): the same drops per kill of every item (12 digits)`);
  {
    const js = E.priceRows(ws).map(r => [r.key, r.slot, r.id, r.currency, r.price]).sort((a, b) => (J(a) < J(b) ? -1 : J(a) > J(b) ? 1 : 0));
    const pyRows = py.prices.slice().sort((a, b) => (J(a) < J(b) ? -1 : J(a) > J(b) ? 1 : 0));
    const a = new Set(js.map(x => J(x))), b = new Set(pyRows.map(x => J(x)));
    const onlyJs = [...a].filter(x => !b.has(x)), onlyPy = [...b].filter(x => !a.has(x));
    if (onlyJs.length || onlyPy.length) print(`  prices only in JS (${onlyJs.length}): ${onlyJs.slice(0, 5).join(' ')}\n  only in PY (${onlyPy.length}): ${onlyPy.slice(0, 5).join(' ')}`);
    eq(onlyJs.length + onlyPy.length, 0, `${pyRows.length} things players can buy (every NPC shop tab + the Donation Shop): the same item, currency and price in both copies`);
  }
  same = 0;
  const costs = ws.chars ? ws.costs() : null;
  for (const [id, want] of py.sells) {
    const js = [0, 3, 10, 20].map(u => E.sellOne(ws, id, u, costs));
    if (J(js) === J(want)) same++; else if (same > -1) print(`  sell ${id}: JS ${J(js)} PY ${J(want)}`);
  }
  eq(same, py.sells.length, `${py.sells.length} items x upgrade 0 / 3 / 10 / 20: the same NPC sell price (or refused)`);
}
