// Item tooltip: what the game client shows when hovering a NEW item (+0, no
// awakening, no sockets), ported from CWndMgr::MakeToolTipText (Neuz
// _Interface/WndManager.cpp:7310) with this server's local tooltip changes from
// commit cf6f5502 (attack speed shown as value/20 %, "Hit Rate" / "Cast Speed"
// labels). Texts come from textClient.inc, so labels match the game.
//
// Buff and premium items (IK2_BUFF, IK2_KEEP, ...) show only name, level and
// description in game: their stats (dwDestParam) and buff time (dwSkillTime) are
// never printed. The editor adds them in a separate "Editor info" part.
//
// Returns { game: [line], editor: [line] }, line = [{ text, color, bold }].
(function (FRE) {
  'use strict';
  const NULL = 0xffffffff;
  const u = v => v >>> 0;

  // dwItemColor[FIRST_TC] for __VER >= 19 (WndManager.cpp:595)
  const C = {
    name0: '#62cbe9', name1: '#acdc65', name2: '#804000', name3: '#ff46aa', name4: '#ff4027',
    general: '#ffffff', time: '#00c800', dst: '#ffeaa1', command: '#ffffff', editor: '#9fb3c8',
  };

  // g_DstString (WndManager.cpp:4834): DST -> TID of its label
  const DST_TEXT = [
    ['DST_STR', 'TID_TOOLTIP_STR'], ['DST_DEX', 'TID_TOOLTIP_DEX'], ['DST_INT', 'TID_TOOLTIP_INT'], ['DST_STA', 'TID_TOOLTIP_STA'],
    ['DST_SPEED', 'TID_TOOLTIP_SPEED'], ['DST_ABILITY_MIN', 'TID_TOOLTIP_ABILITYMIN'], ['DST_ABILITY_MAX', 'TID_TOOLTIP_ABILITYMAX'],
    ['DST_ATTACKSPEED', 'TID_TOOLTIP_ATKSPEED'], ['DST_ADJDEF', 'TID_TOOLTIP_DEFENCE'], ['DST_RESIST_MAGIC', 'TID_TOOLTIP_DEFMAGIC'],
    ['DST_RESIST_ELECTRICITY', 'TID_TOOLTIP_DEFELECTRICITY'], ['DST_RESIST_ALL', 'TID_TOOLTIP_DEFALLELEMETAL'],
    ['DST_RESIST_FIRE', 'TID_TOOLTIP_DEFFIFE'], ['DST_RESIST_WIND', 'TID_TOOLTIP_DEFWIND'], ['DST_RESIST_WATER', 'TID_TOOLTIP_DEFWATER'],
    ['DST_RESIST_EARTH', 'TID_TOOLTIP_DEFEARTH'], ['DST_HP_MAX', 'TID_TOOLTIP_MAXHP'], ['DST_MP_MAX', 'TID_TOOLTIP_MAXMP'],
    ['DST_FP_MAX', 'TID_TOOLTIP_MAXFP'], ['DST_HP', 'TID_TOOLTIP_HP'], ['DST_MP', 'TID_TOOLTIP_MP'], ['DST_FP', 'TID_TOOLTIP_FP'],
    ['DST_HP_RECOVERY', 'TID_TOOLTIP_HPRECOVERY'], ['DST_MP_RECOVERY', 'TID_TOOLTIP_MPRECOVERY'], ['DST_FP_RECOVERY', 'TID_TOOLTIP_FPRECOVERY'],
    ['DST_HP_RECOVERY_RATE', 'TID_TOOLTIP_HPRECOVERYRATE'], ['DST_MP_RECOVERY_RATE', 'TID_TOOLTIP_MPRECOVERYRATE'],
    ['DST_FP_RECOVERY_RATE', 'TID_TOOLTIP_FPRECOVERYRATE'], ['DST_ALL_RECOVERY', 'TID_TOOLTIP_ALL_RECOVERY'],
    ['DST_ALL_RECOVERY_RATE', 'TID_TOOLTIP_ALL_RECOVERY_RATE'], ['DST_KILL_HP', 'TID_TOOLTIP_KILL_HP'], ['DST_KILL_MP', 'TID_TOOLTIP_KILL_MP'],
    ['DST_KILL_FP', 'TID_TOOLTIP_KILL_FP'], ['DST_KILL_ALL', 'TID_TOOLTIP_KILL_ALL'], ['DST_KILL_HP_RATE', 'TID_TOOLTIP_KILL_HP_RATE'],
    ['DST_KILL_MP_RATE', 'TID_TOOLTIP_KILL_MP_RATE'], ['DST_KILL_FP_RATE', 'TID_TOOLTIP_KILL_FP_RATE'], ['DST_KILL_ALL_RATE', 'TID_TOOLTIP_KILL_ALL_RATE'],
    ['DST_ALL_DEC_RATE', 'TID_TOOLTIP_ALL_DEC_RATE'], ['DST_ADJ_HITRATE', 'TID_TOOLTIP_HITRATE'], ['DST_CHR_DMG', 'TID_TOOLTIP_CHRDMG'],
    ['DST_CHRSTATE', 'TID_TOOLTIP_CHRSTATE'], ['DST_PARRY', 'TID_TOOLTIP_PARRY'], ['DST_ATKPOWER_RATE', 'TID_TOOLTIP_ATKPOWER'],
    ['DST_JUMPING', 'TID_TOOLTIP_JUMPING'], ['DST_BLOCK_MELEE', 'TID_GAME_TOOLTIP_BLOCK'], ['DST_BLOCK_RANGE', 'TID_GAME_TOOLTIP_BLOCKRANGE'],
    ['DST_STAT_ALLUP', 'TID_GAME_TOOLTIPALLSTAT'], ['DST_HP_MAX_RATE', 'TID_TOOLTIP_DST_HP_MAX_RATE'], ['DST_ADDMAGIC', 'TID_GAME_TOOLTIPCONDITIONRATE'],
    ['DST_ADJDEF_RATE', 'TID_TOOLTIP_DST_ADJDEF_RATE'], ['DST_MP_MAX_RATE', 'TID_TOOLTIP_DST_MP_MAX_RATE'], ['DST_FP_MAX_RATE', 'TID_TOOLTIP_DST_FP_RATE'],
    ['DST_CHR_CHANCECRITICAL', 'TID_TOOLTIP_DST_CRITICAL_RATE'], ['DST_CHR_WEAEATKCHANGE', 'TID_TOOLTIP_DST_CHR_WEAEATKCHANGE'],
    ['DST_MASTRY_EARTH', 'TID_TOOLTIP_DST_MASTRY_EARTH'], ['DST_MASTRY_FIRE', 'TID_TOOLTIP_DST_MASTRY_FIRE'], ['DST_MASTRY_WATER', 'TID_TOOLTIP_DST_MASTRY_WATER'],
    ['DST_MASTRY_ELECTRICITY', 'TID_TOOLTIP_DST_MASTRY_ELECTRICITY'], ['DST_MASTRY_WIND', 'TID_TOOLTIP_DST_MASTRY_WIND'],
    ['DST_REFLECT_DAMAGE', 'TID_TOOLTIP_DST_REFLECT_DAMAGE'], ['DST_MP_DEC_RATE', 'TID_TOOLTIP_DST_MP_DEC_RATE'], ['DST_FP_DEC_RATE', 'TID_TOOLTIP_DST_FP_DEC_RATE'],
    ['DST_SPELL_RATE', 'TID_TOOLTIP_DST_SPELL_RATE'], ['DST_CAST_CRITICAL_RATE', 'TID_TOOLTIP_DST_CAST_CRITICAL_RATE'],
    ['DST_CRITICAL_BONUS', 'TID_TOOLTIP_DST_CRITICAL_BONUS'], ['DST_YOY_DMG', 'TID_TOOLTIP_DST_YOY_DMG'], ['DST_BOW_DMG', 'TID_TOOLTIP_DST_BOW_DMG'],
    ['DST_KNUCKLE_DMG', 'TID_TOOLTIP_DST_KNUCKLE_DMG'], ['DST_SWD_DMG', 'TID_TOOLTIP_DST_SWD_DMG'], ['DST_AXE_DMG', 'TID_TOOLTIP_DST_AXE_DMG'],
    ['DST_ATTACKSPEED_RATE', 'TID_TOOLTIP_ATTACKSPEED_RATE'], ['DST_CHR_STEALHP', 'TID_TOOLTIP_DST_DMG_GET'], ['DST_PVP_DMG_RATE', 'TID_TOOLTIP_DST_DMG_GET'],
    ['DST_EXPERIENCE', 'TID_TOOLTIP_DST_EXPERIENCE'], ['DST_MELEE_STEALHP', 'TID_TOOLTIP_DST_MELEE_STEALHP'], ['DST_MONSTER_DMG', 'TID_TOOLTIP_DST_MONSTER_DMG'],
    ['DST_PVP_DMG', 'TID_TOOLTIP_DST_PVP_DMG'], ['DST_HEAL', 'TID_TOOLTIP_DST_HEAL'], ['DST_ATKPOWER', 'TID_TOOLTIP_ATKPOWER_VALUE'],
    ['DST_ONEHANDMASTER_DMG', 'TID_TOOLTIP_DST_ONEHANDMASTER_DMG'], ['DST_TWOHANDMASTER_DMG', 'TID_TOOLTIP_DST_TWOHANDMASTER_DMG'],
    ['DST_YOYOMASTER_DMG', 'TID_TOOLTIP_DST_YOYOMASTER_DMG'], ['DST_BOWMASTER_DMG', 'TID_TOOLTIP_DST_BOWMASTER_DMG'],
    ['DST_KNUCKLEMASTER_DMG', 'TID_TOOLTIP_DST_KNUCKLEMASTER_DMG'], ['DST_HAWKEYE_RATE', 'TID_TOOLTIP_DST_HAWKEYE'],
    ['DST_RESIST_MAGIC_RATE', 'TID_TOOLTIP_DEFMAGIC_RATE'], ['DST_GIFTBOX', 'TID_TOOLTIP_DST_GIFTBOX'], ['DST_HPDMG_UP', 'TID_TOOLTIP_DST_HPDMG_UP'],
    ['DST_DEFHITRATE_DOWN', 'TID_TOOLTIP_DST_DEFHITRATE_DOWN'], ['DST_RESTPOINT_RATE', 'TID_TOOLTIP_RESTPOINT_RATE'],
    ['DST_CHR_RANGE', 'TID_GAME_TOOLTIP_ATTACKRANGE4'], ['DST_STOP_MOVEMENT', 'TID_GAME_TOOLTIP_MOVEMENT1'], ['DST_IMMUNITY', 'TID_GAME_TOOLTIP_IMMUNITY1'],
    ['DST_IGNORE_DMG_PVP', 'TID_MMI_ABSOLUTEBERRIER01'], ['DST_TAKE_PVP_DMG_PHYSICAL_RATE', 'TID_TOOLTIP_TAKE_PVP_DMG_PHYSICAL_RATE'],
    ['DST_TAKE_PVP_DMG_MAGIC_RATE', 'TID_TOOLTIP_TAKE_PVP_DMG_MAGIC_RATE'], ['DST_TAKE_PVE_DMG_PHYSICAL_RATE', 'TID_TOOLTIP_TAKE_PVE_DMG_PHYSICAL_RATE'],
    ['DST_TAKE_PVE_DMG_MAGIC_RATE', 'TID_TOOLTIP_TAKE_PVE_DMG_MAGIC_RATE'], ['DST_DROP_ITEM_ALLGRADE_RATE', 'TID_TOOLTIP_DROP_ITEM_ALLGRADE_RATE'],
    ['DST_DROP_ITEM_ONEMORE_CHANCE', 'TID_TOOLTIP_DROP_ITEM_ONEMORE_CHANCE'],
    ['DST_GIVE_PVE_DMG_ELEMENT_FIRE_RATE', 'TID_TOOLTIP_GIVE_PVE_DMG_ELEMENT_FIRE_RATE'], ['DST_GIVE_PVE_DMG_ELEMENT_WATER_RATE', 'TID_TOOLTIP_GIVE_PVE_DMG_ELEMENT_WATER_RATE'],
    ['DST_GIVE_PVE_DMG_ELEMENT_ELECT_RATE', 'TID_TOOLTIP_GIVE_PVE_DMG_ELEMENT_ELECT_RATE'], ['DST_GIVE_PVE_DMG_ELEMENT_WIND_RATE', 'TID_TOOLTIP_GIVE_PVE_DMG_ELEMENT_WIND_RATE'],
    ['DST_GIVE_PVE_DMG_ELEMENT_EARTH_RATE', 'TID_TOOLTIP_GIVE_PVE_DMG_ELEMENT_EARTH_RATE'], ['DST_ADJ_ITEM_EQUIP_LEVEL', 'TID_TOOLTIP_ADJ_ITEM_EQUIP_LEVEL'],
    ['DST_SKILL_LEVELUP_ALL', 'TID_TOOLTIP_SKILL_LEVELUP_ALL'], ['DST_GIVE_DMG_RATE_ENEMY_STUN', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_STUN'],
    ['DST_GIVE_DMG_RATE_ENEMY_DARK', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_DARK'], ['DST_GIVE_DMG_RATE_ENEMY_POISON', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_POISON'],
    ['DST_GIVE_DMG_RATE_ENEMY_SLOW', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_SLOW'], ['DST_GIVE_DMG_RATE_ENEMY_BLEEDING', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_BLEEDING'],
    ['DST_GIVE_DMG_RATE_ENEMY_SILENT', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_SLILENT'], ['DST_GIVE_DMG_RATE_ENEMY_LOOT', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_LOOT'],
    ['DST_GIVE_DMG_RATE_ENEMY_SETSTONE', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_SETSTONE'], ['DST_GIVE_DMG_RATE_ENEMY_SLEEPING', 'TID_TOOLTIP_GIVE_DMG_RATE_ENEMY_SLEEPING'],
    ['DST_SKILL_DMG_RATE', 'TID_TOOLTIP_SKILLDMG'],
  ];
  // FindDstString's hardcoded labels (WndManager.cpp:5087; "Hit Rate" / "Cast Speed" from cf6f5502)
  const DST_FIXED = { DST_PENYA_RATE: 'Penya Rate', DST_ADJ_HITRATE: 'Hit Rate', DST_SPELL_RATE: 'Cast Speed' };
  // IsDst_Rate (WndManager.cpp:4975): shown with a % sign
  const DST_RATE = ['DST_SKILL_DMG_RATE', 'DST_ADJ_HITRATE', 'DST_ATKPOWER_RATE', 'DST_ADJDEF_RATE', 'DST_DEFHITRATE_DOWN',
    'DST_HP_MAX_RATE', 'DST_MP_MAX_RATE', 'DST_FP_MAX_RATE', 'DST_HP_RECOVERY_RATE', 'DST_MP_RECOVERY_RATE', 'DST_FP_RECOVERY_RATE',
    'DST_CHR_CHANCECRITICAL', 'DST_MASTRY_EARTH', 'DST_MASTRY_FIRE', 'DST_MASTRY_WATER', 'DST_MASTRY_ELECTRICITY', 'DST_MASTRY_WIND',
    'DST_ATTACKSPEED', 'DST_MP_DEC_RATE', 'DST_FP_DEC_RATE', 'DST_SPELL_RATE', 'DST_CAST_CRITICAL_RATE', 'DST_CRITICAL_BONUS',
    'DST_ALL_RECOVERY_RATE', 'DST_KILL_HP_RATE', 'DST_KILL_MP_RATE', 'DST_KILL_FP_RATE', 'DST_KILL_ALL_RATE', 'DST_ALL_DEC_RATE',
    'DST_BLOCK_MELEE', 'DST_BLOCK_RANGE', 'DST_ATTACKSPEED_RATE', 'DST_CHR_STEALHP', 'DST_EXPERIENCE', 'DST_HAWKEYE_RATE',
    'DST_RESIST_MAGIC_RATE', 'DST_SPEED', 'DST_REFLECT_DAMAGE', 'DST_RESTPOINT_RATE', 'DST_MONSTER_DMG', 'DST_PVP_DMG',
    'DST_TAKE_PVP_DMG_PHYSICAL_RATE', 'DST_TAKE_PVP_DMG_MAGIC_RATE', 'DST_TAKE_PVE_DMG_PHYSICAL_RATE', 'DST_TAKE_PVE_DMG_MAGIC_RATE',
    'DST_DROP_ITEM_ALLGRADE_RATE', 'DST_GIVE_PVE_DMG_ELEMENT_FIRE_RATE', 'DST_GIVE_PVE_DMG_ELEMENT_WATER_RATE',
    'DST_GIVE_PVE_DMG_ELEMENT_ELECT_RATE', 'DST_GIVE_PVE_DMG_ELEMENT_WIND_RATE', 'DST_GIVE_PVE_DMG_ELEMENT_EARTH_RATE',
    'DST_GIVE_DMG_RATE_ENEMY_STUN', 'DST_GIVE_DMG_RATE_ENEMY_DARK', 'DST_GIVE_DMG_RATE_ENEMY_POISON', 'DST_GIVE_DMG_RATE_ENEMY_SLOW',
    'DST_GIVE_DMG_RATE_ENEMY_BLEEDING', 'DST_GIVE_DMG_RATE_ENEMY_SILENT', 'DST_GIVE_DMG_RATE_ENEMY_LOOT',
    'DST_GIVE_DMG_RATE_ENEMY_SETSTONE', 'DST_GIVE_DMG_RATE_ENEMY_SLEEPING', 'DST_PENYA_RATE'];
  // PutJob (WndManager.cpp:6688): JOB_ -> TID
  const JOB_TEXT = {
    JOB_VAGRANT: 'REGVANG', JOB_MERCENARY: 'REGMERSER', JOB_ACROBAT: 'ACRO', JOB_ASSIST: 'ASSIST', JOB_MAGICIAN: 'MAG',
    JOB_PUPPETEER: 'PUPPET', JOB_KNIGHT: 'KNIGHT', JOB_BLADE: 'BLADE', JOB_JESTER: 'JASTER', JOB_RANGER: 'RANGER',
    JOB_RINGMASTER: 'RINGMAS', JOB_BILLPOSTER: 'BILLPOS', JOB_PSYCHIKEEPER: 'PSYCHIKEEPER', JOB_ELEMENTOR: 'ELEMENTOR',
    JOB_GATEKEEPER: 'GATE', JOB_DOPPLER: 'DOPPLER',
  };
  for (const j of ['KNIGHT', 'BLADE', 'JESTER', 'RANGER', 'RINGMASTER', 'BILLPOSTER', 'PSYCHIKEEPER', 'ELEMENTOR']) {
    JOB_TEXT[`JOB_${j}_MASTER`] = `${j}_MASTER`; JOB_TEXT[`JOB_${j}_HERO`] = `${j}_HERO`;
  }
  for (const j of ['LORDTEMPLER', 'STORMBLADE', 'WINDLURKER', 'CRACKSHOOTER', 'FLORIST', 'FORCEMASTER', 'MENTALIST', 'ELEMENTORLORD']) JOB_TEXT[`JOB_${j}_HERO`] = `${j}_HERO`;

  // tiny printf: %d %+d %s %.Nd %+.1f %%
  function cfmt(f, ...args) {
    let i = 0;
    return String(f).replace(/%([+]?)(\.\d+)?([dsf%])/g, (m, plus, prec, t) => {
      if (t === '%') return '%';
      const v = args[i++];
      if (t === 's') return String(v);
      if (t === 'f') { const s = Number(v).toFixed(prec ? Number(prec.slice(1)) : 6); return plus && v >= 0 ? '+' + s : s; }
      let s = String(Math.trunc(v));
      if (prec && t === 'd') s = s.padStart(Number(prec.slice(1)), '0');
      return plus && v >= 0 ? '+' + s : s;
    });
  }

  function build(ws, item) {
    const D = ws.defines.defines, T = name => ws.texts.get(name);
    const g = f => FRE.specItem.get(item, f);
    const K = name => D.get(name);
    const dstName = new Map(), dstByValue = new Map();
    for (const [dst, tid] of DST_TEXT) { const v = K(dst); if (v !== undefined && !dstName.has(v)) dstName.set(v, T(tid)); }
    for (const [dst, txt] of Object.entries(DST_FIXED)) { const v = K(dst); if (v !== undefined) dstName.set(v, txt); }
    const rate = new Set(DST_RATE.map(K).filter(v => v !== undefined));
    const findDst = v => dstName.get(v) || '';
    const rateValue = (dst, adj) => dst === K('DST_ATTACKSPEED')
      ? (adj % 20 === 0 ? cfmt('%+d', adj / 20) : cfmt('%+.1f', adj / 20)) : cfmt('%+d', adj);
    // PutBaseItemOpt (WndManager.cpp:5729) for a new item: no rarity / accessory bonus
    const dstLines = () => {
      const out = [];
      for (let i = 1; i <= 6; i++) {
        const dst = g('dwDestParam' + i), adj = g('nAdjParamVal' + i);
        if (u(dst) === NULL) continue;
        if (dst === K('DST_STAT_ALLUP')) {
          for (const s of ['DST_STR', 'DST_DEX', 'DST_INT', 'DST_STA']) out.push([{ text: cfmt('%s%+d', findDst(K(s)), adj), color: C.dst }]);
        } else if (rate.has(dst)) out.push([{ text: cfmt('%s%s%%', findDst(dst), rateValue(dst, adj)), color: C.dst }]);
        else out.push([{ text: cfmt('%s%+d', findDst(dst), adj), color: C.dst }]);
      }
      return out;
    };

    const game = [];
    const line = (text, color = C.general, bold = false) => game.push([{ text, color, bold }]);

    // PutItemName (5112)
    let nameColor = C.name0;
    const rs = g('dwReferStat1');
    if (rs === K('WEAPON_UNIQUE') || rs === K('ARMOR_SET')) nameColor = C.name1;
    else if (rs === K('WEAPON_ULTIMATE')) nameColor = C.name3;
    else if (K('BARUNA_D') !== undefined && rs >= K('BARUNA_D') && rs <= K('BARUNA_S')) nameColor = C.name4;
    if (g('dwItemRare') === 200) nameColor = C.name1; else if (g('dwItemRare') === 300) nameColor = C.name2;
    line(item.name || item.define, nameColor, true);

    const ik2 = g('dwItemKind2'), ik3 = g('dwItemKind3');
    // PutWeapon (6880)
    if (ik3 !== K('IK3_SHIELD') && u(g('dwHanded')) !== NULL) {
      if (g('dwHanded') === K('HD_ONE')) line(T('TID_GAME_TOOLTIP_ONEHANDWEAPON'));
      else if (g('dwHanded') === K('HD_TWO')) line(T('TID_GAME_TOOLTIP_TWOHANDWEAPON'));
    }
    // PutSex (6671)
    if (u(g('dwItemSex')) !== NULL) line(T(g('dwItemSex') === 0 ? 'TID_GAME_TOOLTIP_SEXMALE' : 'TID_GAME_TOOLTIP_SEXFEMALE'));

    const isWeapon = ik2 === K('IK2_WEAPON_DIRECT') || ik2 === K('IK2_WEAPON_MAGIC');
    const equip = ['IK2_WEAPON_DIRECT', 'IK2_WEAPON_MAGIC', 'IK2_ARMORETC', 'IK2_CLOTHETC', 'IK2_ARMOR', 'IK2_CLOTH', 'IK2_BLINKWING'].map(K);
    if (equip.includes(ik2)) {
      // PutItemMinMax (5624): a new item's multiplier is 1.0 (MoverAttack.cpp:2160)
      if (u(g('dwAbilityMin')) !== NULL && u(g('dwAbilityMax')) !== NULL && u(g('dwEndurance')) !== NULL) {
        game.push([{ text: T(isWeapon ? 'TID_GAME_TOOLTIP_ATTACKRANGE2' : 'TID_GAME_TOOLTIP_DEFENSE_B'), color: C.general },
          { text: cfmt(' %d ~ %d', g('dwAbilityMin'), g('dwAbilityMax')), color: C.general }]);
      } else game.push([{ text: '', color: C.general }]);       // the function always starts a new line
      // PutItemSpeed (5293) with GetATKSpeedString (WndManager.cpp:109)
      if (isWeapon) {
        const sp = g('fAttackSpeed');
        const word = sp < 0.035 ? 'TID_GAME_VERYSLOW' : sp < 0.050 ? 'TID_GAME_SLOW' : sp < 0.070 ? 'TID_GAME_NORMALS'
          : sp < 0.080 ? 'TID_GAME_FAST' : sp < 0.17 ? 'TID_GAME_VERYFAST' : 'TID_GAME_FASTEST';
        line(cfmt(T('TID_GAME_TOOLTIP_ATTACKSPEED'), T(word)));
      }
      // PutBaseResist (6288): Spec_Item floats x 100 (ProjectCmn.cpp:736)
      for (const [f, tid] of [['fResistElecricity', 'ELEC'], ['fResistFire', 'FIRE'], ['fResistWater', 'WATER'], ['fResistWind', 'WIND'], ['fResistEarth', 'EARTH']]) {
        const v = Math.trunc(Math.fround(Math.fround(g(f)) * 100));
        if (v) line(cfmt(T(`TID_GAME_TOOLTIP_${tid}_RES`), v));
      }
      game.push(...dstLines());
    } else if (['IK2_REFRESHER', 'IK2_FOOD', 'IK2_POTION'].map(K).includes(ik2)) {
      // PutMedicine (5693), once per dwDestParam1..6
      for (let i = 1; i <= 6; i++) {
        const dst = g('dwDestParam' + i), adj = g('nAdjParamVal' + i);
        if (u(dst) === NULL) continue;
        if (u(adj) !== NULL) {
          if (dst === K('DST_MP')) line(cfmt(T('TID_GAME_TOOLTIP_RECOVMP'), adj));
          else if (dst === K('DST_HP')) line(cfmt(T('TID_GAME_TOOLTIP_RECOVHP'), adj));
          else if (dst === K('DST_FP')) line(cfmt(T('TID_GAME_TOOLTIP_RECOVFP'), adj));
        }
        if (u(g('dwAbilityMin')) !== NULL) line(cfmt(T('TID_GAME_TOOLTIP_MAXRECOVER'), g('dwAbilityMin')));
      }
    } else if (ik2 === K('IK2_JEWELRY') || (ik2 === K('IK2_SYSTEM') && ik3 === K('IK3_VIS'))) {
      game.push(...dstLines());
    }

    // PutKeepTime (6525): dwCircleTime in seconds
    const circle = g('dwCircleTime');
    if (u(circle) !== NULL && ik3 !== K('IK3_PET')) {
      if (circle === 1) line(T('TID_GAME_COND_USE'), C.time);
      else {
        const s = u(circle);
        game.push([{ text: `${T('TID_TOOLTIP_ITEMTIME')} : `, color: C.time },
          { text: cfmt(T('TID_TOOLTIP_DATE'), Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60), color: C.time }]);
      }
    }
    // PutJob (6688)
    if (u(g('dwItemJob')) !== NULL) {
      const jobDef = ws.defines.byValue('JOB_', g('dwItemJob'));
      const tid = jobDef && JOB_TEXT[jobDef];
      if (tid) line(T('TID_GAME_TOOLTIP_' + tid));
    }
    // PutLevel (6830)
    if (u(g('dwLimitLevel1')) !== NULL) line(cfmt(T('TID_GAME_TOOLTIP_REQLEVEL'), g('dwLimitLevel1')));
    // PutCommand (6901)
    const cmd = g('szCommand');
    if (cmd) line(cfmt(T('TID_ITEM_INFO'), cmd), C.command);

    // ---- editor info: what the game tooltip leaves out
    const editor = [];
    const ed = (text, color = C.editor) => editor.push([{ text, color }]);
    if (!equip.includes(ik2) && ik2 !== K('IK2_JEWELRY') && !(ik2 === K('IK2_SYSTEM') && ik3 === K('IK3_VIS'))
      && !['IK2_REFRESHER', 'IK2_FOOD', 'IK2_POTION'].map(K).includes(ik2)) {
      const eff = dstLines();
      if (eff.length) { ed('Effect (dwDestParam, not shown in game):'); editor.push(...eff); }
    }
    const skillTime = g('dwSkillTime');
    if (u(skillTime) !== NULL && skillTime > 0) ed(`Buff time: ${duration(skillTime / 1000)} (dwSkillTime ${FRE.num.group(skillTime)} ms)`);
    const cost = g('dwCost'), chip = g('dwReferValue1');
    ed(`Penya price: ${u(cost) === NULL ? 'none' : FRE.num.group(cost)}${cost > 0 ? `, sells back for ${FRE.num.group(Math.floor(cost / 4))}` : ''}`);
    ed(`Chip price: ${chip >= 1 ? FRE.num.group(chip) : 'none (not sold in chip shops)'}`);
    ed(`${item.define} (${item.id})`, '#7f8fa3');
    return { game, editor };
  }

  function duration(sec) {
    const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60, s = Math.round(sec % 60);
    const parts = [];
    if (d) parts.push(`${d} day${d > 1 ? 's' : ''}`);
    if (h) parts.push(`${h} hour${h > 1 ? 's' : ''}`);
    if (m) parts.push(`${m} min`);
    if (s) parts.push(`${s} s`);
    return parts.join(' ') || '0 s';
  }

  FRE.itemTooltip = { build, cfmt, duration };
})(globalThis.FRE = globalThis.FRE || {});
