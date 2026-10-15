// Consumable Stats (task L): what each used item gives, the 6 slots dwDestParam1-6 / nAdjParamVal1-6 of its Spec_Item.txt row
// (cols 54-65, CProject::LoadPropItem _Common/ProjectCmn.cpp:665-683) and its buff time dwSkillTime (col 99, ms, :724).
// Read from the Spec model the workspace already loaded (loaders/specitem.js), like loaders/weapons.js.
//   Which items: the ones CMover::DoUseItem (_Common/MoverSkill.cpp:1455) sends down a path that applies the slots:
//     IK2_BUFF / IK2_BUFF_TOGIFT (:1615, IsDoUseBuff then DoApplySkill), IK2_SYSTEM + IK3_BALLOON (DoUseItemSystem :3235),
//     IK2_ONCE (DoUseItemOnce :3254), IK2_KEEP (DoUseItemKeep :3266, __NEW_STACKABLE_AMPS), and the instant ones
//     IK2_FOOD / IK2_POTION / IK2_REFRESHER (DoUseItemFood, listed; the simulator does not model them).
//   The Activation scrolls (II_CHR_SYS_SCR_ACTIVITION / NEWACTIVITION) have no slots: SetSMMode( SM_ACTPOINT ) is hard-coded
//     (MoverSkill.cpp:2515), so they are listed read-only.
(function (FRE) {
  'use strict';
  const SLOTS = 6;
  const NONE = 0xFFFFFFFF;
  // charged-item modes (SetSMMode in DoUseItemSystem; the item table is ADDSMMODE, _Network/CmnHdr.h:520): what they do is
  // written in the code, only their time is data (dwCircleTime, in seconds). Items with their own use path stay there.
  const HARD = {
    II_CHR_SYS_SCR_ACTIVITION: 'Action points (SM_ACTPOINT, MoverSkill.cpp:2515)', II_CHR_SYS_SCR_NEWACTIVITION: 'Action points (SM_ACTPOINT)',
    II_CHR_SYS_SCR_UPCUTSTONE: 'Damage x1.2 (SM_ATTACK_UP, MoverAttack.cpp:1234)', II_CHR_SYS_SCR_UPCUTSTONE01: 'Damage x1.2 (SM_ATTACK_UP1)',
    II_SYS_SYS_SCR_VIP_07: 'VIP perks (SM_VIP_7)', II_SYS_SYS_SCR_VIP_15: 'VIP perks (SM_VIP_15)', II_SYS_SYS_SCR_VIP_30: 'VIP perks (SM_VIP_30)',
    II_CHR_SYS_SCR_SHOUTFULL15: 'Free shouts (SM_SHOUT15)', II_CHR_SYS_SCR_SHOUTFULL30: 'Free shouts (SM_SHOUT30)',
    II_CHR_SYS_SCR_SHOUTFULL001: 'Free shouts (SM_SHOUT001)', II_CHR_SYS_SCR_SHOUTFULL03: 'Free shouts (SM_SHOUT03)',
    II_CHR_SYS_SCR_PSKILLFULL1: 'Party skills reach members at any distance (SM_PARTYSKILL1)', II_CHR_SYS_SCR_PSKILLFULL15: 'Party skills reach members at any distance (SM_PARTYSKILL15)',
    II_CHR_SYS_SCR_PSKILLFULL30: 'Party skills reach members at any distance (SM_PARTYSKILL30)',
    II_CHR_SYS_SCR_COMMBANK15: 'Common bank (SM_BANK15)', II_CHR_SYS_SCR_COMMBANK30: 'Common bank (SM_BANK30)', II_CHR_SYS_SCR_COMMBANK001: 'Common bank (SM_BANK001)',
    II_SYS_SYS_SCR_BLESSING: 'Revival protection (SM_REVIVAL)', II_SYS_SYS_SCR_VELOCIJUMP: 'Speed and jump (SM_VELOCIJUMP)',
    II_CHR_SYS_SCR_ESCAPEBLINKWING: 'Escape cool-down (SM_ESCAPE)',
    II_CHR_SYS_SCR_FIREASTONE: 'Fire attack (SM_RESIST_ATTACK)', II_CHR_SYS_SCR_WATEILSTONE: 'Water attack (SM_RESIST_ATTACK)',
    II_CHR_SYS_SCR_WINDYOSTONE: 'Wind attack (SM_RESIST_ATTACK)', II_CHR_SYS_SCR_LIGHTINESTONE: 'Electric attack (SM_RESIST_ATTACK)',
    II_CHR_SYS_SCR_EARTHYSTONE: 'Earth attack (SM_RESIST_ATTACK)', II_CHR_SYS_SCR_DEFIREASTONE: 'Fire defense (SM_RESIST_DEFENSE)',
    II_CHR_SYS_SCR_DEWATEILSTONE: 'Water defense (SM_RESIST_DEFENSE)', II_CHR_SYS_SCR_DEWINDYOSTONE: 'Wind defense (SM_RESIST_DEFENSE)',
    II_CHR_SYS_SCR_DELIGHTINESTONE: 'Electric defense (SM_RESIST_DEFENSE)', II_CHR_SYS_SCR_DEEARTHYSTONE: 'Earth defense (SM_RESIST_DEFENSE)',
  };
  // display groups, first match wins
  const GROUPS = [
    { key: 'balloon', label: 'Balloons' },
    { key: 'couple', label: 'Couple buffs' },
    { key: 'stat', label: 'Stat potions (STR / DEX / INT / STA / DEF)' },
    { key: 'premium', label: 'Premium buffs (cash items)' },
    { key: 'buff', label: 'Buff scrolls and potions' },
    { key: 'keep', label: 'Timed items (IK2_KEEP / ONCE)' },
    { key: 'food', label: 'Food and drink (instant)' },
    { key: 'hard', label: 'Hard-coded (no stats in the file)' },
  ];

  function slotsOf(it) {
    const g = f => FRE.specItem.get(it, f), out = [];
    for (let i = 1; i <= SLOTS; i++) {
      const dst = g('dwDestParam' + i) >>> 0;
      out.push({ i, dst, on: dst !== NONE, adj: g('nAdjParamVal' + i) | 0 });
    }
    return out;
  }

  // the DoUseItem path an item takes: 'buff' | 'balloon' | 'once' | 'keep' | 'food' | null (not a consumable here)
  function pathOf(k, K) {
    if (k.k2 === K.IK2_BUFF || k.k2 === K.IK2_BUFF_TOGIFT) return 'buff';
    if (k.k2 === K.IK2_SYSTEM && k.k3 === K.IK3_BALLOON) return 'balloon';
    if (k.k2 === K.IK2_ONCE) return 'once';
    if (k.k2 === K.IK2_KEEP) return 'keep';
    if (k.k2 === K.IK2_FOOD || k.k2 === K.IK2_POTION || k.k2 === K.IK2_REFRESHER) return 'food';
    return null;
  }

  function groupOf(c, K) {
    if (c.hard) return 'hard';
    if (c.k3 === K.IK3_BALLOON) return 'balloon';
    if (c.k3 === K.IK3_COUPLE_BUFF) return 'couple';
    if ([K.IK3_POTION_BUFF_STR, K.IK3_POTION_BUFF_DEX, K.IK3_POTION_BUFF_INT, K.IK3_POTION_BUFF_STA, K.IK3_POTION_BUFF_DEFENSE].includes(c.k3)) return 'stat';
    if (c.path === 'food') return 'food';
    if (c.charged && (c.path === 'buff' || c.path === 'keep' || c.path === 'once')) return 'premium';
    if (c.path === 'buff') return 'buff';
    return 'keep';
  }

  const KIND_NAMES = ['IK1_CHARGED', 'IK2_BUFF', 'IK2_BUFF_TOGIFT', 'IK2_SYSTEM', 'IK2_ONCE', 'IK2_KEEP', 'IK2_FOOD', 'IK2_POTION', 'IK2_REFRESHER',
    'IK3_BALLOON', 'IK3_COUPLE_BUFF', 'IK3_POTION_BUFF_STR', 'IK3_POTION_BUFF_DEX', 'IK3_POTION_BUFF_INT', 'IK3_POTION_BUFF_STA',
    'IK3_POTION_BUFF_DEFENSE', 'IK3_ANGEL_BUFF', 'IK3_ARMOREFFECTCHANGE', 'IK3_EXP_RATE'];

  // ws: a Workspace (items, defines) -> { items, byId, byDefine, K }
  function fromWorkspace(ws) {
    const D = ws.defines.defines, K = {};
    for (const n of KIND_NAMES) K[n] = D.has(n) ? D.get(n) : -1;
    const items = [], byId = new Map(), byDefine = new Map();
    for (const it of ws.items.items.values()) {
      const g = f => FRE.specItem.get(it, f);
      const k = { k1: g('dwItemKind1'), k2: g('dwItemKind2'), k3: g('dwItemKind3') };
      const hard = HARD[it.define] || null;
      const path = hard ? null : pathOf(k, K);
      if (!path && !hard) continue;
      const info = ws.itemInfo(it);
      const c = { id: it.id, define: it.define, name: info.name || it.define, item: it, info, k1: k.k1, k2: k.k2, k3: k.k3, path, hard,
        charged: k.k1 === K.IK1_CHARGED, time: g('dwSkillTime') >>> 0, circle: g('dwCircleTime') >>> 0, minLv: g('nMinLimitLevel') | 0, maxLv: g('nMaxLimitLevel') | 0,
        slots: slotsOf(it) };
      c.group = groupOf(c, K);
      items.push(c); byId.set(c.id, c); byDefine.set(c.define, c);
    }
    items.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return { items, byId, byDefine, K };
  }

  // a duration in ms as players read it ("1 h", "5 min", "3 d", "permanent", "none")
  function timeText(ms) {
    ms = ms >>> 0;
    if (ms === NONE) return 'none (=)';
    if (ms === 999999999) return 'permanent (999999999)';
    if (ms > 0x7FFFFFFF) return `${ms} ms (too big: refused)`;
    const s = ms / 1000;
    if (s >= 86400 && s % 3600 === 0) return `${+(s / 86400).toFixed(2)} d`;
    if (s >= 3600) return `${+(s / 3600).toFixed(2)} h`;
    if (s >= 60) return `${+(s / 60).toFixed(2)} min`;
    return `${+s.toFixed(2)} s`;
  }

  FRE.consumables = { fromWorkspace, slotsOf, pathOf, timeText, GROUPS, HARD, SLOTS, NONE };
})(globalThis.FRE = globalThis.FRE || {});
