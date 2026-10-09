// Rates & Buffs simulator: what one solo kill gives a player. A port of the WorldServer's kill path (paths under _Common/):
//   SubExperience        Mover.cpp:6855-6890: fExpValue = nExpValue × m_fExp_Rate (1.0, ProjectCmn.cpp:550; __S1108_BACK_END_SYSTEM)
//   AddExperienceKillMember  Mover.cpp:7001: fExpValuePerson = (float)( fExpValue × hit / max hit ): the killer did all the damage
//   AddExperienceSolo    Mover.cpp:7034-7116: level gap ×0.7f / ×0.4f / ×0.1f (EXPFLOAT = double), capped at expTable.inc nLimitExp of
//                        the player's level, then AddExperience( (EXPINTEGER)fExpValue )
//   AddExperience        MoverParam.cpp:1140-1162: Master / Hero / Legend Hero halve it (nExp /= 2), then nExp = (EXPINTEGER)( nExp × GetExpFactor() )
//                        (int64 × float is done in float)
//   GetExpFactor         MoverParam.cpp:4465-4630 (float32, in this order): EXP scrolls ×(1 + Σ%/100) (__NEW_STACKABLE_AMPS: IK3_EXP_RATE
//                        buffs in their level range), Event.lua EXP, the GM rate (1.0), ×(1 + DST_EXPERIENCE/100) (Guild Buff EXP + gear),
//                        + Server Buff %/100 (ADDED, :4615), ×1Rebirth.inc fExpRate (m_nReb > 0), ×Event.lua weather while it rains / snows
//                        (__ENVIRONMENT_EFFECT, :4648).
//   Penya / items        loaders/drops-sim.js (penyaRange, exactChances) with this task's Event.lua rates.
//   Server / Guild Buff  findHighestEligibleTier (ServerBuff.cpp:65, GuildBuff.cpp:62).
// Not modelled (each is 1 / off here): old-boy mode, the cheer buffs, CEventGeneric (no propEvent.inc), Anarchy (server-wide and personal),
// the Lord event and its buffs, Free PK Time, the rest-point bonus, PC-bang, EVE_EVENT0214, parties, a GM rate (/exprate).
(function (FRE) {
  'use strict';
  const f32 = Math.fround;
  const trunc = Math.trunc;

  // -> { factor, steps: [{ what, text, after }] }
  const show = v => String(Math.round(v * 10000) / 10000);     // float32 for the maths, 4 decimals for the text
  function expFactor(o) {
    const steps = [];
    let f = f32(1);
    const step = (what, text) => steps.push({ what, text, after: f });
    if (o.scrollPct) { f = f32(f * f32(1 + f32(f32(o.scrollPct) / 100))); step('scroll', `×${1 + o.scrollPct / 100} EXP scrolls (+${o.scrollPct}%)`); }
    f = f32(f * f32(o.eventExp)); step('event', `×${show(f32(o.eventExp))} Event.lua EXP`);
    if (o.dstExp > 0) { f = f32(f * f32(1 + f32(f32(o.dstExp) / 100))); step('dst', `×${1 + o.dstExp / 100} EXP stat (+${o.dstExp}%: Guild Buff and gear)`); }
    if (o.serverBuffPct) { f = f32(f + f32(f32(o.serverBuffPct) / 100)); step('serverbuff', `+${o.serverBuffPct / 100} Server Buff (+${o.serverBuffPct}%, added)`); }
    if (o.rebirth > 0 && o.rebirthRate != null) { f = f32(f * f32(o.rebirthRate)); step('rebirth', `×${show(f32(o.rebirthRate))} rebirth ${o.rebirth}`); }
    if (o.weather) { f = f32(f * f32(o.weatherExp)); step('weather', `×${show(f32(o.weatherExp))} weather (rain / snow)`); }
    return { factor: f, steps };
  }

  // -> { exp, steps: [text], base, capped }
  function killExp(o) {
    const steps = [];
    let v = f32(o.expValue);                        // (float) on the way through AddExperienceKillMember
    steps.push(`${v} the monster's EXP`);
    const d = o.playerLevel - o.monsterLevel;
    if (d > 0) {
      const m = d <= 2 ? f32(0.7) : d <= 4 ? f32(0.4) : f32(0.1);
      v = v * m;
      steps.push(`×${d <= 2 ? 0.7 : d <= 4 ? 0.4 : 0.1} player ${d} level${d > 1 ? 's' : ''} above the monster`);
    }
    let capped = false;
    if (o.limit != null && v > o.limit) { v = o.limit; capped = true; steps.push(`capped at ${o.limit} (expTable.inc, level ${o.playerLevel})`); }
    let n = trunc(v);
    if (o.halve) { n = trunc(n / 2); steps.push('÷2 Master / Hero'); }
    const exp = trunc(f32(f32(n) * f32(o.factor)));
    steps.push(`×${show(f32(o.factor))} the EXP factor`);
    return { exp, steps, capped };
  }

  // The calculator: inputs { monsterId, playerLevel, tier: 'normal' | 'master' | 'hero', scrollPct, gearExp, online (Server Buff),
  //   serverTier (number or null: from online), guildLevel, guildOnline, guildTier (number or null), weather, rebirth }
  function calc(ws, model, inp, opt = {}) {
    const ev = model.events, act = ev.activeF;
    const sb = inp.serverTier != null ? (model.server ? model.server.tiers.find(t => t.tier.value === inp.serverTier) || null : null)
      : FRE.rates.pickServerTier(model.server, inp.online | 0);
    const gb = inp.guildTier != null ? (model.guild ? model.guild.tiers.find(t => t.tier.value === inp.guildTier) || null : null)
      : FRE.rates.pickGuildTier(model.guild, inp.guildLevel | 0, inp.guildOnline | 0);
    const dstExpV = ws.defines.defines.get('DST_EXPERIENCE');
    let guildExp = 0;
    if (gb) for (const b of gb.bonus) if (b.dst.value === dstExpV) guildExp += b.adj.value;
    // a Server Buff EXP stat (buff-stats.diff) is a dest param like the Guild Buff's: the same (1 + DST_EXPERIENCE / 100)
    let serverExp = 0;
    if (sb && sb.bonus) for (const b of sb.bonus) if (b.dst.value === dstExpV) serverExp += b.adj.value;
    const rb = model.rebirth && inp.rebirth > 0 ? model.rebirth.rates[inp.rebirth] : null;
    const ef = expFactor({ scrollPct: inp.scrollPct | 0, eventExp: act.exp, dstExp: guildExp + serverExp + (inp.gearExp | 0), serverBuffPct: sb ? sb.pct.value : 0,
      rebirth: inp.rebirth | 0, rebirthRate: rb ? rb.exp : (inp.rebirth > 0 ? 1 : null), weather: !!inp.weather, weatherExp: act.weather });
    const mv = ws.movers.movers.get(inp.monsterId) || null;
    const res = { factor: ef, serverTier: sb, guildTier: gb, guildExp, serverExp, mover: mv, rates: act, failed: ev.failed };
    if (!mv) return res;
    const lim = model.exp && model.exp[inp.playerLevel] ? model.exp[inp.playerLevel].limit : null;
    res.kill = killExp({ expValue: mv.exp, monsterLevel: mv.level | 0, playerLevel: inp.playerLevel, limit: lim, halve: inp.tier === 'master' || inp.tier === 'hero', factor: ef.factor });
    if (ws.models.drops && !opt.expOnly) {
      const env = FRE.dropsSim.envFor(ws, inp.monsterId);
      const o = { playerLevel: inp.playerLevel, itemRate: ev.active.item, pieceRate: ev.active.piece, goldRate: ev.active.gold };
      res.penya = FRE.dropsSim.penyaRange(env, o);
      res.items = FRE.dropsSim.exactChances(env, o);
      const gap = FRE.dropsSim.levelGap(inp.playerLevel, mv.level | 0);
      res.gate = { base: gap[0], rate: f32(f32(gap[0]) * f32(ev.active.item)) };
    }
    return res;
  }

  FRE.ratesSim = { expFactor, killExp, calc };
})(globalThis.FRE = globalThis.FRE || {});
