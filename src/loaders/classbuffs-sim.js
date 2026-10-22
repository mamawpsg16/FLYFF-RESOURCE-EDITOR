// What a class's buffs give in game (Class Buffs 2a): a port of the code that USES propSkillAdd.csv's buff rows.
//   Cast: CCtrl::ApplySkill (_Common/Ctrl.cpp:1225-1270): applied when nProbability is '=' or xRandom(100) < it; the buff lasts
//     dwSkillTime ms of the row (+ SubReferTime when the skill has RT_TIME, not modelled); AddBuff -> CBuffSkill::Apply (buff.cpp:491)
//     -> CMover::ApplyParam (MoverActEvent.cpp:211): with __FIX_STAT_BUFF (LodeConfig.h:13) only slots 1 and 2 of the add-skill row,
//     a slot with dwDestParam '=' AND nAdjParamVal '=' skipped; DST_CHRSTATE = a state (stun, invisible …), not a stat;
//     everything else SetDestParam( dst, adj, chg ) (MoverParam.cpp:2523), which fans out DST_RESIST_ALL (5 resists),
//     DST_STAT_ALLUP (STR DEX INT STA), DST_HPDMG_UP (HP_MAX + CHR_DMG), DST_DEFHITRATE_DOWN (ADJDEF + ADJ_HITRATE),
//     DST_LOCOMOTION (SPEED + JUMPING x3); DST_HP / MP / FP are instant, not a stat.
//   Weapon rules: CBuffSkill::IsInvalid (buff.cpp:415-480, __3RD_LEGEND16 on): yoyo, bow, sword, axe, knuckle, two-handed,
//     dual-wield, shield buffs drop off without that weapon; Impower Weapon needs an element on the weapon.
//   Knight stances: CBuffMgr::AddBuff (buff.cpp:759): Guard replaces Rage and Rage replaces Guard.
//   Caps in words: attack speed 0.1-2.0 (MoverAttack.cpp:193), casting 2.0 = Spell rate 100% (:281), hit rate 96 (:360),
//     block: xRandom(80) roll (~74 max), move speed: no cap (MoverParam.cpp:3585, floor 0), parry = DEX x 0.5 + DST_PARRY (:561).
//   Time: dwSkillTime ms + SubReferTime (MoverActEvent.cpp:174) for each RT_TIME refer: (DWORD)( dwReferValue / 10.0f * stat +
//     level * (stat / 50.0f) ) ms, float maths; stat = the caster's STA / DEX / INT (only those three; another stat adds 0).
// Not modelled: the probability roll (every class buff row has '=' = always, except Blessing of the Wise Man 75, a cleanse), damage numbers,
// other players' buffs stacking, item buffs, the Equalized auto-buff choice (part 2b).
(function (FRE) {
  'use strict';
  const NULL_ID = 0xFFFFFFFF;
  // CBuffSkill::IsInvalid (buff.cpp:415-480): skill define -> what the active hand must hold
  const GATE = {
    SI_JST_SUP_POISON: 'yoyo', SI_JST_SUP_BLEEDING: 'yoyo', SI_JST_SUP_ABSORB: 'yoyo', SI_ACR_SUP_YOYOMASTER: 'yoyo',
    SI_JST_YOYO_CRITICALSWING: 'yoyo', SI_JST_MASTER_YOYOMASTER: 'yoyo',
    SI_RAG_SUP_FASTATTACK: 'bow', SI_ACR_SUP_BOWMASTER: 'bow', SI_RAG_MASTER_BOWMASTER: 'bow', SI_RAG_HERO_HAWKEYE: 'bow', SI_CRA_SUP_HAWKEYE: 'bow',
    SI_BLD_MASTER_ONEHANDMASTER: 'dual', SI_KNT_MASTER_TWOHANDMASTER: 'two', SI_MER_SUP_IMPOWERWEAPON: 'element',
    SI_MER_SUP_BLAZINGSWORD: 'sword', SI_MER_SUP_SWORDMASTER: 'sword', SI_MER_SUP_SMITEAXE: 'axe', SI_MER_SUP_AXEMASTER: 'axe',
    SI_BIL_PST_ASMODEUS: 'knuckle', SI_MER_SHIELD_PROTECTION: 'shield', SI_MER_SHIELD_PANBARRIER: 'shield',
  };
  const GATE_WORDS = { yoyo: 'a yoyo', bow: 'a bow', dual: 'two weapons (dual wield)', two: 'a two-handed weapon', element: 'an element on the weapon',
    sword: 'a sword', axe: 'an axe', knuckle: 'a knuckle', shield: 'a shield' };
  const FAN = {
    DST_RESIST_ALL: ['DST_RESIST_ELECTRICITY', 'DST_RESIST_FIRE', 'DST_RESIST_WIND', 'DST_RESIST_WATER', 'DST_RESIST_EARTH'],
    DST_STAT_ALLUP: ['DST_STR', 'DST_DEX', 'DST_INT', 'DST_STA'], DST_HPDMG_UP: ['DST_HP_MAX', 'DST_CHR_DMG'],
    DST_DEFHITRATE_DOWN: ['DST_ADJDEF', 'DST_ADJ_HITRATE'],
  };

  function envFor(ws) {
    const D = ws.defines.defines, n = k => D.get(k);
    const fan = new Map();
    for (const [k, list] of Object.entries(FAN)) if (n(k) !== undefined) fan.set(n(k), list.map(n).filter(v => v !== undefined).map(v => [v, 1]));
    if (n('DST_LOCOMOTION') !== undefined) fan.set(n('DST_LOCOMOTION'), [[n('DST_SPEED'), 1], [n('DST_JUMPING'), 3]]);
    const instant = new Set(['DST_HP', 'DST_MP', 'DST_FP'].map(n).filter(v => v !== undefined));
    return { D, n, fan, instant, CHRSTATE: n('DST_CHRSTATE'), words: FRE.itemTooltip.dstWords(ws) };
  }

  // a buff's own stat amounts at a row: [[dst, adj]] (fan-outs done; CHRSTATE / instant / empty left out)
  function amounts(env, row) {
    const out = [];
    for (const i of [1, 2]) {
      const dst = row.v['dwDestParam' + i] >>> 0, adj = row.v['nAdjParamVal' + i];
      if (dst === NULL_ID && (adj >>> 0) === NULL_ID) continue;
      if (dst === NULL_ID || dst === env.CHRSTATE || env.instant.has(dst)) continue;
      const a = adj | 0;
      if (env.fan.has(dst)) for (const [d, k] of env.fan.get(dst)) out.push([d, a * k]);
      else out.push([dst, a]);
    }
    return out;
  }

  // how long a buff lasts in ms, cast at row's level by a caster with stats { STA, DEX, INT } (ApplySkill Ctrl.cpp:1232-1246)
  function duration(env, b, row, stats) {
    const f = Math.fround, n = env.n;
    let ms = row.v.dwSkillTime | 0;
    for (const r of b.refer) {
      const st = r.stat === n('DST_STA') ? stats.STA : r.stat === n('DST_DEX') ? stats.DEX : r.stat === n('DST_INT') ? stats.INT : 0;
      const x = f(f(f(f(r.value) / 10) * st) + f(f(row.lvl) * f(st / 50)));
      ms = (ms + (Math.trunc(x) >>> 0)) | 0;
    }
    return ms;
  }

  // gear: { yoyo, bow, sword, axe, knuckle, two, dual, shield, element } (true = held). -> null (works) or the reason it drops
  function blocked(b, gear) {
    const need = GATE[b.define];
    if (!need) return null;
    return gear && gear[need] ? null : `needs ${GATE_WORDS[need]}`;
  }

  // the buffs one player casts on themselves: every buff of the class (all 5 tiers) whose target includes "you";
  // opts: { gear, stance: 'guard' | 'rage', party: also the party buffs of the class (they include the caster) }
  // -> { used: [{ b, row, ok, why }], stats: Map dst -> total }
  function selfBuffs(env, model, classKey, opts = {}) {
    const c = model.classes.find(x => x.key === classKey);
    const used = [], stats = new Map();
    for (const t of c.tiers) for (const b of t.buffs) {
      if (b.exe === 'EXT_TROUPE') continue;                     // a party-only buff skips the caster
      const why = blocked(b, opts.gear);
      const stanceOff = (b.define === 'SI_KNT_SUP_GUARD' && opts.stance !== 'guard') || (b.define === 'SI_KNT_SUP_RAGE' && opts.stance !== 'rage');
      const ok = !why && !stanceOff;
      used.push({ b, row: b.max, ok, why: why || (stanceOff ? 'the other stance is on (Guard and Rage replace each other)' : null) });
      if (ok) for (const [d, a] of amounts(env, b.max)) stats.set(d, (stats.get(d) || 0) + a);
    }
    for (const [d, a] of [...stats]) if (!a) stats.delete(d);
    return { used, stats };
  }
  const statList = stats => [...stats].sort((a, b) => a[0] - b[0]);

  // caps in words for a stat total (the buffs alone; gear and stats add more in game)
  function capNotes(env, stats) {
    const n = env.n, out = [];
    const v = k => stats.get(n(k)) || 0;
    if (v('DST_ATTACKSPEED') || v('DST_ATTACKSPEED_RATE')) out.push('Attack speed: capped at 2.0 (MoverAttack.cpp:193). Most endgame weapons + DEX already reach it, so more does nothing there.');
    if (v('DST_SPELL_RATE') >= 100) out.push(`Casting speed ${v('DST_SPELL_RATE')}%: 100% already means no cast time (cap 2.0).`);
    if (v('DST_SPEED')) out.push(`Move speed +${v('DST_SPEED')}% from these buffs: there is no cap on move speed (only gear and party buffs add more).`);
    if (v('DST_ADJ_HITRATE') > 96) out.push(`Hit rate +${v('DST_ADJ_HITRATE')}: a hit chance above 96% does nothing.`);
    const blk = Math.max(v('DST_BLOCK_MELEE'), v('DST_BLOCK_RANGE'));
    if (blk > 74) out.push(`Block +${blk}: the block roll is xRandom(80), so about 74 is the most that counts.`);
    if (v('DST_PARRY')) out.push(`Parry +${v('DST_PARRY')}: small next to DEX x 0.5 (300 DEX = 150 parry).`);
    return out;
  }

  FRE.classBuffsSim = { envFor, duration, amounts, blocked, selfBuffs, statList, capNotes, GATE, GATE_WORDS, NULL_ID };
})(globalThis.FRE = globalThis.FRE || {});
