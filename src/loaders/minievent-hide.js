// Mini Events, Hide and Seek (step 4): where Lost Fwanki hides (SPOT lines) and what one round does.
//   suggest   region / hint / landmark for a spot, the way V19 Tools/minievent/build_spots.py wrote the first 37 (3b12a4bb):
//             region = the smallest titled WdMadrigal.rgn box of 5,000+ around it (else the nearest), its FIRST title line
//             + the Teleport-list town (medata.py with_town); hint = "close to where <monster> spawn" for the nearest normal
//             monster spot (RANK_LOW / RANK_NORMAL, not Captain / Giant / Boss / Lord / General) within 250; landmark =
//             "the <name>" of the nearest small titled box (under 5,000) whose centre is within 120 (the script put each spot
//             40-80 from one; 120 is this editor's choice for a spot typed anywhere).
//   round     CMiniEventMng::Process (MiniEventMng.cpp:710-733): the hint at 40 % of ROUND_TIME, the landmark at 80 %
//             (MINIEVENT_HINT1_PCT / HINT2_PCT, :36): the first whole second t with t x 100 >= ROUND_TIME x pct; an empty
//             text is skipped (no message). SpawnHideNpc (:1563): at the spot, on the ground (GetLandHeight), the region
//             shouted at the start. Found (:1518): within MINIEVENT_FOUND_DIST 6 m on x / z (y ignored) = 1st place, the
//             round ends; nobody = "it got away".
// Not modelled: the ground height (the .lnd files), walls / water at the spot, packets.
(function (FRE) {
  'use strict';
  const SKIP = ['Collecting Area', 'Guild Combat', 'Gravity Disorder', 'Kion Soldiers', 'residence'];
  const SMALL = 5000, HINT_NEAR = 250, LANDMARK_NEAR = 120;
  const HINT1_PCT = 40, HINT2_PCT = 80, FOUND_DIST = 6;
  const BOSSY = ['Captain', 'Giant', 'Boss', 'Lord', 'General'];
  const area = r => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
  const clean = (s, n) => s.split('"').join("'").replace(/[^\x20-\x7e]/g, '?').slice(0, n);
  const skipped = r => SKIP.some(w => r.titles.join(' ').includes(w));

  // the monsters a hint may name: normal Madrigal spots, in file order
  function mobs(ws, mad) {
    const mv = ws.movers ? ws.movers.movers : new Map(), out = [];
    for (const r of mad.respawns) {
      const m = mv.get(r.mover);
      if (!m || (m.rankId !== 1 && m.rankId !== 2) || BOSSY.some(b => m.name.startsWith(b))) continue;
      out.push({ name: m.name, x: r.x, z: r.z });
    }
    return out;
  }

  function suggest(mad, mobList, x, z) {
    const big = mad.regions.filter(r => area(r) >= SMALL && !skipped(r));
    const small = mad.regions.filter(r => area(r) < SMALL && !skipped(r));
    let reg = null, bv = Infinity;
    for (const r of big) if (r.rect[0] <= x && x <= r.rect[2] && r.rect[1] <= z && z <= r.rect[3] && area(r) < bv) { bv = area(r); reg = r; }
    if (!reg) for (const r of big) { const d = (x - (r.rect[0] + r.rect[2]) / 2) ** 2 + (z - (r.rect[1] + r.rect[3]) / 2) ** 2; if (d < bv) { bv = d; reg = r; } }
    let region = reg ? reg.titles[0] : FRE.miniEventTurnIn.townOf(mad, x, z);
    region = ['darkon', 'saint', 'eillun', 'shaduwar', 'flaris', 'flarine'].some(w => region.toLowerCase().includes(w)) ? region : `${region} (${FRE.miniEventTurnIn.townOf(mad, x, z)})`;
    let hint = '', hb = Infinity, hm = null;
    for (const m of mobList) { const d = (m.x - x) ** 2 + (m.z - z) ** 2; if (d < hb) { hb = d; hm = m; } }
    if (hm && hb < HINT_NEAR ** 2) hint = `close to where ${hm.name} spawn`;
    let landmark = '', lb = Infinity, lm = null;
    for (const r of small) { const d = (x - (r.rect[0] + r.rect[2]) / 2) ** 2 + (z - (r.rect[1] + r.rect[3]) / 2) ** 2; if (d < lb) { lb = d; lm = r; } }
    if (lm && lb < LANDMARK_NEAR ** 2) { const n = lm.titles[lm.titles.length - 1]; landmark = n.toLowerCase().startsWith('the ') ? n : `the ${n}`; }
    return { region: clean(region, 60), hint: clean(hint, 120), landmark: clean(landmark, 60) };
  }

  // the seconds into a round at which the hint / landmark show (null = that text is empty: nothing shown)
  function hintTimes(roundTime, spot) {
    const at = pct => { let t = 0; while (t * 100 < roundTime * pct) t++; return t; };
    return { hint: spot && !spot.hint ? null : at(HINT1_PCT), landmark: spot && !spot.landmark ? null : at(HINT2_PCT) };
  }
  // what one round shows: [{ t, text }] (the shouts / player notices of SpawnHideNpc and Process), then the end
  function roundLog(roundTime, spot, foundAt, finder) {
    const out = [{ t: 0, text: `[Event] Lost Fwanki is hiding somewhere in ${spot.region}!` }];
    const ht = hintTimes(roundTime, spot);
    const end = foundAt !== null && foundAt !== undefined && foundAt < roundTime ? foundAt : null;
    if (ht.hint !== null && (end === null || ht.hint < end)) out.push({ t: ht.hint, text: `[Event] Hint: Lost Fwanki is ${spot.hint}.` });
    if (ht.landmark !== null && (end === null || ht.landmark < end)) out.push({ t: ht.landmark, text: `[Event] Lost Fwanki is within about 100 m of ${spot.landmark}!` });
    out.push(end !== null ? { t: end, text: `[Event] ${finder || 'A player'} found Lost Fwanki!` } : { t: roundTime, text: '[Event] Lost Fwanki got away!' });
    return out;
  }
  // Found: close enough on x / z (the height does not count)
  const found = (spot, px, pz) => { const dx = Math.fround(spot.x - px), dz = Math.fround(spot.z - pz); return Math.fround(dx * dx + dz * dz) <= FOUND_DIST * FOUND_DIST; };

  FRE.miniEventHide = { mobs, suggest, hintTimes, roundLog, found, SMALL, HINT_NEAR, LANDMARK_NEAR, FOUND_DIST, HINT1_PCT, HINT2_PCT };
})(globalThis.FRE = globalThis.FRE || {});
