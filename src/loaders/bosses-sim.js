// Boss Mechanics: what a boss does each melee swing. Port of the planned WorldServer code in
// PLANS/Boss Mechanics/CPP_PORT_LIST.md (V19 feat/boss-patterns 3dac171b; the C++ is not written yet, so this follows the plan):
//   v2-3 OnAttackMelee_CustomBoss1: busy -> no new attack; m_dwBossSwing++; the phase = the lowest PHASE line the HP is under
//        (shout once on entering it); every N swings the SIGNATURE (shout, marks 1.5 s later); else inorder 1 = the next row
//        (m_dwAttackCount++ % rows), inorder 0 = a weighted roll xRandom( max( total, 1 ) ): every row weighs 1, in a phase a real
//        row weighs its shape tier's weight (BossRowWeight), ATTACK_NONE rows stay 1; an ATTACK_NONE pick = no attack.
//   v2-5 the swing time (AIMonster.cpp:1393): nDelay = dwReAttackDelay - 1000 + xRandom( 2000 ), x speed / 100 in a phase.
// Rolls per swing, in this order: the row roll (inorder 0, no signature), then the swing time roll.
// Not modelled: the shapes' marks and damage (the preview draws them, ui/bosses-preview.js), how long the marks stay on the
// ground (the caller says whether the boss is busy), the boss going back to full HP (m_nBossPhase back to -1).
(function (FRE) {
  'use strict';
  const B = () => FRE.bosses;
  const isNone = r => r.words[0] === 'ATTACK_NONE';

  // BossRowWeight: phase -1 = above every phase line
  function rowWeight(boss, phase, row) {
    if (phase < 0 || isNone(row)) return 1;
    return boss.phases[phase].w[(B().TIER_OF[row.words[0]] || 2) - 1];
  }

  // the chance of each row in one phase (-1 = full HP), inorder 0. -> { total, rows: [{ i, type, w, p }], attack, byShape: {type: p}, byTier: {1,2,3} }
  function chances(boss, phase) {
    const ws = boss.rows.map(r => rowWeight(boss, phase, r));
    const total = ws.reduce((a, b) => a + b, 0);
    const rows = boss.rows.map((r, i) => ({ i, type: r.words[0], w: ws[i], p: total ? ws[i] / total : 0 }));
    const byShape = {}, byTier = { 1: 0, 2: 0, 3: 0 };
    let attack = 0;
    for (const x of rows) {
      if (x.type === 'ATTACK_NONE') continue;
      attack += x.p;
      byShape[x.type] = (byShape[x.type] || 0) + x.p;
      byTier[B().TIER_OF[x.type] || 2] += x.p;
    }
    return { total, rows, attack, byShape, byTier };
  }

  // every phase of a boss: [{ phase: -1 | k, hp: 100 | below, speed, ...chances }]
  function table(boss) {
    const out = [{ phase: -1, hp: 100, speed: 100, shout: '', ...chances(boss, -1) }];
    boss.phases.forEach((p, k) => out.push({ phase: k, hp: p.hp, speed: p.speed, shout: p.shout, ...chances(boss, k) }));
    return out;
  }

  // one fight. opts: { seed, reAttack (propMover dwReAttackDelay, ms) }. -> { swing(hp, busy) -> result }
  //   result: { n (the boss's swing count), phase, shouts: [text], kind: 'busy' | 'signature' | 'row' | 'none', row (index), delay }
  function fight(boss, opts = {}) {
    const R = FRE.xRandom.rng(opts.seed === undefined ? 1 : opts.seed);
    const sig = boss.sig && boss.sig.words.length === 5 ? { every: Number(boss.sig.words[3]), shout: boss.sig.words[4].replace(/^"|"$/g, '') } : null;
    const hasSig = !!sig && sig.every >= 2;
    const reAttack = opts.reAttack === undefined ? 2000 : opts.reAttack;
    let swings = 0, count = 0, phase = -1;
    const swingTime = () => {
      let d = (reAttack - 1000 + R.random(2000)) | 0;
      if (phase >= 0) d = Math.trunc(d * boss.phases[phase].speed / 100);
      return d;
    };
    function swing(hp, busy) {
      if (!boss.rows.length) return { n: swings, phase, shouts: [], kind: 'none', row: -1, delay: swingTime() };
      if (busy) return { n: swings, phase, shouts: [], kind: 'busy', row: -1, delay: swingTime() };
      swings++;
      const shouts = [];
      let now = -1;
      boss.phases.forEach((p, k) => { if (hp <= p.hp) now = k; });
      if (now > phase) { phase = now; if (boss.phases[phase].shout) shouts.push(boss.phases[phase].shout); }
      let kind, row = -1;
      if (hasSig && swings % sig.every === 0) { shouts.push(sig.shout); kind = 'signature'; }
      else if (boss.inorder && boss.inorder.value === '1') { row = count++ % boss.rows.length; kind = isNone(boss.rows[row]) ? 'none' : 'row'; }
      else {
        let total = 0;
        for (const r of boss.rows) total += rowWeight(boss, phase, r);
        let roll = R.random(Math.max(total, 1));
        for (let i = 0; i < boss.rows.length; i++) {
          const w = rowWeight(boss, phase, boss.rows[i]);
          if (roll < w) { row = i; break; }
          roll -= w;
        }
        kind = row < 0 || isNone(boss.rows[row]) ? 'none' : 'row';
      }
      return { n: swings, phase, shouts, kind, row, delay: swingTime() };
    }
    return { swing };
  }

  // a whole fight in one go: HP from 100 down to hpEnd over `swings` swings (hp of swing k = 100 - floor(k * (100 - hpEnd) / swings)),
  // busy: a list of swing indexes (0-based) on which the last attack is still on the ground
  function run(boss, { seed = 1, swings = 40, hpEnd = 5, reAttack = 2000, busy = [] } = {}) {
    const f = fight(boss, { seed, reAttack }), out = [];
    for (let k = 0; k < swings; k++) {
      const hp = 100 - Math.floor(k * (100 - hpEnd) / swings);
      out.push(Object.assign({ hp }, f.swing(hp, busy.includes(k))));
    }
    return out;
  }

  // the "Attack chance %" box: real rows R kept in order, N rows in all so R / N is as close as possible to pct (1-100):
  // N = max(R, round(R * 100 / pct)); real row i goes to slot floor((2i + 1) * N / (2R)), every other slot is an ATTACK_NONE row
  // (MI_VEMPAIN01 today: 3 attacks, 15 rows -> slots 2, 7, 12). -> { rows: [[6 words]], real, total, pct (the real chance) }
  function spread(rows, pct) {
    const real = rows.filter(w => w[0] !== 'ATTACK_NONE');
    if (!real.length) throw new Error('The boss has no real attack row: add one first');
    if (!(pct >= 1 && pct <= 100)) throw new Error('Type an attack chance between 1 and 100 %');
    const R = real.length, N = Math.max(R, Math.round(R * 100 / pct));
    const out = [];
    for (let s = 0; s < N; s++) out.push(B().NONE_ROW.slice());
    real.forEach((w, i) => { out[Math.floor((2 * i + 1) * N / (2 * R))] = w.slice(); });
    return { rows: out, real: R, total: N, pct: 100 * R / N };
  }

  FRE.bossSim = { rowWeight, chances, table, fight, run, spread };
})(globalThis.FRE = globalThis.FRE || {});
