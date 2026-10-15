// What using a consumable does in game (task L): a port of the server code that USES the slots and dwSkillTime.
//   CMover::DoUseItem (_Common/MoverSkill.cpp:1455), by dwItemKind2:
//     IK2_BUFF / IK2_BUFF_TOGIFT (:1615): IsDoUseBuff (:3371) refuses when the item's IK3 is POTION_BUFF_STR/DEX/INT/STA/DEFENSE,
//       ANGEL_BUFF or ARMOREFFECTCHANGE, or its IK2 is BUFF_TOGIFT, and a buff of the same IK3 is on (HasBuffByIk3); then
//       DoApplySkill -> CCtrl::ApplySkill (Ctrl.cpp:1102).
//     IK2_SYSTEM + IK3_BALLOON (DoUseItemSystem :3235): refused while any balloon buff is on, else DoApplySkill.
//     IK2_ONCE (DoUseItemOnce :3254): refused while a buff of the same IK3 is on, else DoApplySkill.
//     IK2_KEEP (DoUseItemKeep :3266, __NEW_STACKABLE_AMPS): level outside nMin/MaxLimitLevel -> refused (1); not IK3_EXP_RATE:
//       HasBuff( BUFF_ITEM, id ) -> refused (5), else AddBuff( BUFF_ITEM, id, 0, dwSkillTime ) and, when it is new, ApplyParam
//       (the V19 fix of 2026-10-15: before it the stats never went on, since IBuff::Process only applies a buff with inst 0,
//       i.e. one loaded at login; Bull Hams showed "STA+20" and gave nothing until a relog).
//   ApplySkill (Ctrl.cpp:1236-1309): nSkillTime = (int)dwSkillTime; nSkillTime >= 0 -> bNew = AddBuff( BUFF_ITEM, id, 0, time );
//     a negative time (an "=" = -1 or > 2^31) adds no buff and bNew stays TRUE: the stats go on with nothing to take them off.
//     bNew -> ApplyParam.
//   CBuffMgr::AddBuff (Buff.cpp:742 / :756): IsAddable refuses (int)total < 0; Overwrite (:695): the same id at the same level
//     (items are level 0) -> AddTotal: SetTotal( max( new, remaining ) ) and the clock restarts (:56, :40) -> not new, stats
//     not applied again. CBuffItem::AddTotal (:366) adds the remaining time for PET_FEED_POCKET02 / PET_TONIC_A / _B only.
//   CMover::ApplyParam (MoverActEvent.cpp:211, 6 slots with __FIX_STAT_BUFF): NULL_ID skipped; DST_HP does nothing for an
//     item (its branch needs pAddSkillProp); everything else here -> SetDestParam.
//   CMover::SetDestParam (MoverParam.cpp:2525): a negative dst (but ADJDEF / ADJDEF_RATE) ignored; DST_MP / DST_FP are an
//     instant change (-1 = refill to max); DST_GOLD adds gold; RESIST_ALL, STAT_ALLUP, HPDMG_UP, DEFHITRATE_DOWN, LOCOMOTION
//     (jump x3) fan out; dst >= MAX_ADJPARAMARY (118) dropped; else m_adjParamAry[dst] += adj (an amount 0 adds nothing).
//   Expiry: IBuffItemBase::Release (Buff.cpp:226) -> ResetDestParam( dst, adj ) for all 6 slots (MoverParam.cpp:2802): the same
//     fan-outs, then m_adjParamAry[dst] -= adj for 0 <= dst < 118. MP / FP (and HP, never added) are subtracted too: a leftover.
// Not modelled: DoUseItemFood (food / potions / refreshers), IK3_EXP_RATE amp stacking, IK3_LINK, the cooldown groups, the
//   world / state refusals before the switch, DST_CHRSTATE / CHANCE* / CURECHR / CLEARBUFF / HEAL_* / SPEED rank checks, the
//   special recovery / kill-rate cases of SetDestParam (:2616-2717; treated as a plain add), dwChgParamVal, HP / MP / FP caps.
(function (FRE) {
  'use strict';
  const NONE = 0xFFFFFFFF, MAX_ADJ = 118;
  const s32 = v => v | 0;

  function envFor(ws, model) {
    const D = ws.defines.defines, m = model || ws.models.consumables, d = n => (D.has(n) ? D.get(n) : -999);
    return { D, m, K: m.K,
      HP: d('DST_HP'), MP: d('DST_MP'), FP: d('DST_FP'), GOLD: d('DST_GOLD'), ADJDEF: d('DST_ADJDEF'), ADJDEF_RATE: d('DST_ADJDEF_RATE'),
      FAN: new Map([
        [d('DST_RESIST_ALL'), ['DST_RESIST_ELECTRICITY', 'DST_RESIST_FIRE', 'DST_RESIST_WIND', 'DST_RESIST_WATER', 'DST_RESIST_EARTH'].map(n => [d(n), 1])],
        [d('DST_STAT_ALLUP'), ['DST_STR', 'DST_DEX', 'DST_INT', 'DST_STA'].map(n => [d(n), 1])],
        [d('DST_HPDMG_UP'), [[d('DST_HP_MAX'), 1], [d('DST_CHR_DMG'), 1]]],
        [d('DST_DEFHITRATE_DOWN'), [[d('DST_ADJDEF'), 1], [d('DST_ADJ_HITRATE'), 1]]],
        [d('DST_LOCOMOTION'), [[d('DST_SPEED'), 1], [d('DST_JUMPING'), 3]]],
      ]),
      ADDS_REMAIN: new Set(['II_SYS_SYS_SCR_PET_FEED_POCKET02', 'II_SYS_SYS_SCR_PET_TONIC_A', 'II_SYS_SYS_SCR_PET_TONIC_B'].map(n => D.get(n)).filter(v => v !== undefined)) };
  }

  // a player: buffs Map id -> { id, k3, total, start }, stats Map dst -> amount, instant [{dst, adj}], gold, now (ms), level
  function blank(level) { return { buffs: new Map(), stats: new Map(), instant: [], gold: 0, now: 0, level: level || 1, log: [] }; }
  const add = (p, d, a) => { const v = s32((p.stats.get(d) || 0) + a); if (v) p.stats.set(d, v); else p.stats.delete(d); };

  function setDest(env, p, dst, adj) {
    const sd = s32(dst);
    if (sd < 0 && sd !== env.ADJDEF_RATE && sd !== env.ADJDEF) return;
    if (dst === env.HP || dst === env.MP || dst === env.FP) { p.instant.push({ dst, adj }); return; }
    if (dst === env.GOLD) { p.gold = s32(p.gold + adj); return; }
    const fan = env.FAN.get(dst);
    if (fan) { for (const [d, m] of fan) setDest(env, p, d, s32(adj * m)); return; }
    if (dst >= MAX_ADJ) return;
    if (adj !== 0) add(p, dst, adj);
  }
  function resetDest(env, p, dst, adj) {
    const fan = env.FAN.get(dst);
    if (fan) { for (const [d, m] of fan) resetDest(env, p, d, s32(adj * m)); return; }
    const sd = s32(dst);
    if (sd >= MAX_ADJ || sd < 0) return;
    if (adj !== 0) add(p, dst, -adj);
  }
  function applyParam(env, p, c) {
    for (const s of c.slots) {
      if (!s.on || s.dst === env.HP) continue;
      setDest(env, p, s.dst, s.adj);
    }
  }
  const remaining = (p, b) => Math.max(0, b.total - (p.now - b.start));

  // AddBuff( BUFF_ITEM, id, 0, total ): true when a new buff was added
  function addBuff(env, p, c, total) {
    if (s32(total) < 0) return false;                          // IsAddable
    const old = p.buffs.get(c.id);
    if (old) {                                                 // Overwrite: same level -> AddTotal
      let t = total >>> 0;
      if (env.ADDS_REMAIN.has(c.id)) t = (t + remaining(p, old)) >>> 0;
      old.total = Math.max(t, remaining(p, old)); old.start = p.now;
      return false;
    }
    p.buffs.set(c.id, { id: c.id, k3: c.k3, total: total >>> 0, start: p.now });
    return true;
  }
  function applySkill(env, p, c) {
    const t = s32(c.time);
    let bNew = true;
    if (t >= 0) bNew = addBuff(env, p, c, t);
    else p.log.push('no buff (time < 0): the stats stay on');
    if (bNew) applyParam(env, p, c);
    return bNew;
  }
  const hasIk3 = (env, p, k3) => [...p.buffs.values()].some(b => b.k3 === k3);

  // use one item: { ok, why?, fresh? } ; why = 'same-kind' | 'balloon' | 'level' | 'active' | 'not-modelled'
  function use(env, p, c) {
    const K = env.K;
    if (c.path === 'buff') {
      const gated = [K.IK3_POTION_BUFF_STR, K.IK3_POTION_BUFF_DEX, K.IK3_POTION_BUFF_INT, K.IK3_POTION_BUFF_STA, K.IK3_POTION_BUFF_DEFENSE,
        K.IK3_ANGEL_BUFF, K.IK3_ARMOREFFECTCHANGE].includes(c.k3) || c.k2 === K.IK2_BUFF_TOGIFT;
      if (gated && hasIk3(env, p, c.k3)) return { ok: false, why: 'same-kind' };
      return { ok: true, fresh: applySkill(env, p, c) };
    }
    if (c.path === 'balloon') {
      if (hasIk3(env, p, K.IK3_BALLOON)) return { ok: false, why: 'balloon' };
      return { ok: true, fresh: applySkill(env, p, c) };
    }
    if (c.path === 'once') {
      if (hasIk3(env, p, c.k3)) return { ok: false, why: 'same-kind' };
      return { ok: true, fresh: applySkill(env, p, c) };
    }
    if (c.path === 'keep') {
      if (p.level < c.minLv || p.level > c.maxLv) return { ok: false, why: 'level' };
      if (c.k3 === K.IK3_EXP_RATE) return { ok: false, why: 'not-modelled' };
      if (p.buffs.has(c.id)) return { ok: false, why: 'active' };
      const fresh = addBuff(env, p, c, c.time);
      if (fresh) applyParam(env, p, c);
      return { ok: true, fresh };
    }
    return { ok: false, why: 'not-modelled' };
  }

  // time passes: buffs whose time is up are released (ResetDestParam for all 6 slots)
  function tick(env, p, ms) {
    p.now += ms;
    for (const b of [...p.buffs.values()].sort((x, y) => x.id - y.id)) {
      if (p.now - b.start < b.total) continue;
      p.buffs.delete(b.id);
      const c = env.m.byId.get(b.id);
      if (c) for (const s of c.slots) if (s.on) resetDest(env, p, s.dst, s.adj);
    }
  }

  // steps: ['use', id] | ['tick', ms]; returns the player and each use's result
  function run(env, steps, level) {
    const p = blank(level), results = [];
    for (const s of steps) {
      if (s[0] === 'use') { const c = env.m.byId.get(s[1]); results.push(c ? use(env, p, c) : { ok: false, why: 'unknown' }); }
      else if (s[0] === 'tick') tick(env, p, s[1]);
    }
    return { p, results };
  }
  const statList = p => [...p.stats].sort((a, b) => a[0] - b[0]);
  const buffList = p => [...p.buffs.values()].sort((a, b) => a.id - b.id).map(b => [b.id, b.total, remaining(p, b)]);

  FRE.consumablesSim = { envFor, blank, use, tick, run, statList, buffList, setDest, resetDest, MAX_ADJ };
})(globalThis.FRE = globalThis.FRE || {});
