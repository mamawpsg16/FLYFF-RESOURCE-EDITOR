// Class Buffs checks (2a). loaders/classbuffs.js joins the files, loaders/classbuffs-sim.js says what the game does with them.
(function (FRE) {
  'use strict';
  const NULL_ID = 0xFFFFFFFF;

  // the max-level stats + time of a buff as one string (to tell an edited buff from the loaded one)
  const sig = b => JSON.stringify([b.slots.map(s => [s.dst, s.adj]), b.max.v.dwSkillTime | 0]);

  function classBuffChecks(model, opts) {
    const ws = opts.ws, out = [], env = FRE.classBuffsSim.envFor(ws), n = env.n, F = 'propSkillAdd.csv';
    for (const d of model.add.diags) out.push(Object.assign({ module: 'classbuffs', key: `${d.code}|${d.message}` }, d));
    // what each buff was when the folder was read (CB_TEXT_OLD): kept on the workspace, set once
    if (!ws._cbBase) ws._cbBase = new Map(model.buffs.map(b => [b.si, { sig: sig(b), desc: b.desc }]));
    const push = (b, code, severity, message, k) => out.push({ module: 'classbuffs', file: F, code, severity, start: b.max.start, end: b.max.end,
      key: `${code}|${b.define}|${k || ''}`, message });
    const word = d => { const w = env.words.get(d); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${d}`; };
    for (const b of model.buffs) {
      const a = FRE.classBuffsSim.amounts(env, b.max), get = k => a.filter(x => x[0] === n(k)).reduce((s, x) => s + x[1], 0);
      for (const s of b.slots) if (s.dst === 0) push(b, 'CB_DST_ZERO', 'WARN', `${b.name}: stat slot ${s.i} is stat 0 (an unknown name reads as 0): it does nothing.`, s.i);
      if (b.slots[0].dst !== NULL_ID && b.slots[0].dst === b.slots[1].dst) push(b, 'CB_SLOT_DUP', 'WARN', `${b.name}: ${word(b.slots[0].dst)} is in both slots: the two amounts are added.`);
      // bow range (DST_HAWKEYE_RATE): only 1-80 counts, above that the WHOLE bonus is dropped (MoverMsg.cpp:159, __SECURITY_FIXES)
      if (get('DST_HAWKEYE_RATE') > 80) push(b, 'CB_HAWKEYE_80', 'WARN', `${b.name}: bow range +${get('DST_HAWKEYE_RATE')}%: above 80 the game ignores the whole bow range bonus (not just the part above 80).`);
      const blk = Math.max(get('DST_BLOCK_MELEE'), get('DST_BLOCK_RANGE'));
      if (blk > 74) push(b, 'CB_BLOCK_CAP', 'WARN', `${b.name}: Block +${blk} on its own: the block roll is xRandom(80), about 74 is the most that counts.`);
      if (get('DST_ADJ_HITRATE') > 96) push(b, 'CB_HIT_CAP', 'WARN', `${b.name}: Hit rate +${get('DST_ADJ_HITRATE')}: a hit chance above 96% does nothing.`);
      if (get('DST_ATTACKSPEED') || get('DST_ATTACKSPEED_RATE')) push(b, 'CB_ASPD_SAT', 'INFO', `${b.name}: gives attack speed, which is capped at 2.0; endgame weapons + DEX already reach it, so this stat often does nothing (the 2026-10-21 decisions swap these out).`);
      if (b.party && b.exe !== 'EXT_ANOTHERWITH' && (get('DST_CRITICAL_BONUS') || get('DST_CHR_CHANCECRITICAL')))
        push(b, 'CB_PARTY', 'INFO', `${b.name} is a party buff with a crit stat: party members who cast skills (crit never applies to skills) get nothing from it.`);
      const base = ws._cbBase.get(b.si);
      if (base && base.sig !== sig(b) && base.desc === b.desc) push(b, 'CB_TEXT_OLD', 'WARN', `${b.name}: its stats changed but its tooltip text did not: players read the old numbers.`);
    }
    // move speed: every class's own buffs + its party buffs, added up (no cap in GetSpeed)
    for (const c of model.classes) {
      const all = { yoyo: true, bow: true, sword: true, axe: true, knuckle: true, two: true, dual: true, shield: true, element: true };
      const r = FRE.classBuffsSim.selfBuffs(env, model, c.key, { gear: all, stance: 'rage' });
      const sp = r.stats.get(n('DST_SPEED')) || 0;
      const first = c.tiers.flatMap(t => t.buffs)[0];
      if (sp > 0 && first) out.push({ module: 'classbuffs', file: F, code: 'CB_SPEED_STACK', severity: 'INFO', start: first.max.start, end: first.max.end,
        key: `CB_SPEED_STACK|${c.key}`, message: `${c.name}: its own buffs add up to move speed +${sp}% (no cap; other classes' party buffs and gear add more).` });
    }
    return out;
  }

  FRE.classBuffChecks = classBuffChecks;
})(globalThis.FRE = globalThis.FRE || {});
