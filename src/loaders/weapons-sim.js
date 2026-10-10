// What a weapon's own stats give in game (task G part 2): a port of the code that USES them.
//   Put on: CMover::SetDestParamEquip (_Common/MoverEquip.cpp:2355): an expired item gives nothing; with a Weapon Rarity tier
//     (GetWeaponRarity() > 0 and prj.m_nWeaponRarity.GetAt( level ) found, :2365) every slot with dwDestParam != -1 gets
//     WeaponRarity_ScaleParam (:2347): + nStatsPctBonus when WeaponRarity_IsDst_Rate (:2257, the client's IsDst_Rate list, three
//     0 entries included), else + nStatsFlatBonus; without one, SetDestParam( i, prop ) (MoverParam.cpp:2490) adds nAdjParamVal.
//   Take off: ResetDestParamEquip (:2457) takes the same amounts away.
//   Hands (__BLADELWEAPON0608): a weapon in the left hand gives NO stats (equip gate MoverEquip.cpp:1843, login :2122); when it
//     moves to the right hand its stats are added (:1035).
//   DST_STAT_ALLUP fans out to STR, DEX, INT, STA (MoverParam.cpp:2588); DST_ATTACKSPEED is in 1/20 % (MoverAttack.cpp:177:
//     GetParam / 1000 on the speed factor; the tooltip shows adj / 20, WndManager.cpp:5070).
//   Tooltip: CWndMgr::PutBaseItemOpt (_Interface/WndManager.cpp:5729): 6 lines, ALLUP as 4 lines, the rarity bonus as " (+n%)"
//     or " (+n)" after the base value, never added in.
// Not modelled: dwChgParamVal (only the plain path passes it; no weapon here uses a changing stat), caps / clamps inside
// SetDestParam, the other equip sources (resists, piercing, awakening, Ultimate gems, sets).
(function (FRE) {
  'use strict';
  const W = () => FRE.weapons;

  function envFor(ws, model) {
    const D = ws.defines.defines, m = model || ws.models.weapons;
    const rate = new Set(FRE.itemTooltip.DST_RATE_NAMES().map(n => D.get(n)).filter(v => v !== undefined)); rate.add(0);
    return { D, m, rate, words: FRE.itemTooltip.dstWords(ws), tiers: m.rarity ? m.rarity.tiers : new Map(),
      ALLUP: D.get('DST_STAT_ALLUP'), ASPD: D.get('DST_ATTACKSPEED'), FOUR: ['DST_STR', 'DST_DEX', 'DST_INT', 'DST_STA'].map(n => D.get(n)) };
  }

  // the amounts one held weapon adds: [[dst, amount], …] in slot order (ALLUP fanned out)
  function amounts(env, w, held) {
    if (!w || !held || held.expired) return [];
    const t = held.rarity > 0 ? env.tiers.get(held.rarity) : null;
    const out = [];
    for (const s of w.slots) {
      if (!s.on) continue;
      const adj = t ? s.adj + (env.rate.has(s.dst) ? t.pct : t.flat) : s.adj;
      if (s.dst === env.ALLUP) for (const d of env.FOUR) out.push([d, adj]); else out.push([s.dst, adj]);
    }
    return out;
  }

  // a character's hands: { right: held | null, left: held | null }, held = { id, rarity, expired }; stats Map dst -> total
  function blank() { return { right: null, left: null, stats: new Map() }; }
  const add = (ch, list, sign) => { for (const [d, a] of list) { const v = ((ch.stats.get(d) || 0) + sign * a) | 0; if (v) ch.stats.set(d, v); else ch.stats.delete(d); } };
  // put a weapon in a hand (the old one there is taken off first); only the right hand counts
  function putOn(env, ch, hand, held) {
    takeOff(env, ch, hand);
    ch[hand] = held;
    if (hand === 'right') add(ch, amounts(env, env.m.byId.get(held.id), held), 1);
  }
  function takeOff(env, ch, hand) {
    const old = ch[hand];
    if (!old) return;
    ch[hand] = null;
    if (hand === 'right') add(ch, amounts(env, env.m.byId.get(old.id), old), -1);
  }
  // the left-hand weapon moves to the right hand (the right one was taken off): its stats are added (:1035)
  function promote(env, ch) {
    if (!ch.left || ch.right) return;
    const h = ch.left; ch.left = null; ch.right = h;
    add(ch, amounts(env, env.m.byId.get(h.id), h), 1);
  }
  function run(env, steps) {
    const ch = blank();
    for (const s of steps) {
      if (s[0] === 'on') putOn(env, ch, s[1], s[2]);
      else if (s[0] === 'off') takeOff(env, ch, s[1]);
      else if (s[0] === 'promote') promote(env, ch);
    }
    return ch;
  }
  const statList = ch => [...ch.stats].sort((a, b) => a[0] - b[0]);
  // the real attack-speed % of a DST_ATTACKSPEED amount (FormatDstRateValue: adj / 20)
  const aspdPct = adj => adj / 20;

  // PutBaseItemOpt for a weapon at a rarity level: [{ text, dst, adj, bonus }]
  function tooltip(env, w, rarity) {
    const t = rarity > 0 ? env.tiers.get(rarity) || null : null;
    const word = d => (env.words.get(d) || { word: '' }).word;
    const cf = FRE.itemTooltip.cfmt, out = [];
    for (const s of w.slots) {
      if (!s.on) continue;
      if (s.dst === env.ALLUP) {
        const b = t ? cf(' (%+d)', t.flat) : '';
        for (const d of env.FOUR) out.push({ text: `${word(d)}${cf('%+d', s.adj)}${b}`, dst: d, adj: s.adj, bonus: t ? t.flat : 0 });
      } else if (env.rate.has(s.dst)) {
        const shown = s.dst === env.ASPD ? (s.adj % 20 === 0 ? cf('%+d', s.adj / 20) : cf('%+.1f', Math.fround(s.adj / 20))) : cf('%+d', s.adj);
        out.push({ text: `${word(s.dst)}${shown}%${t ? cf(' (%+d%%)', t.pct) : ''}`, dst: s.dst, adj: s.adj, bonus: t ? t.pct : 0, rate: true });
      } else out.push({ text: `${word(s.dst)}${cf('%+d', s.adj)}${t ? cf(' (%+d)', t.flat) : ''}`, dst: s.dst, adj: s.adj, bonus: t ? t.flat : 0 });
    }
    return out;
  }

  FRE.weaponsSim = { envFor, amounts, blank, putOn, takeOff, promote, run, statList, tooltip, aspdPct };
})(globalThis.FRE = globalThis.FRE || {});
