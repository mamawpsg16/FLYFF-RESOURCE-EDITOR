// The editor's own item categories for the item lists (asked 2026-10-07: "why is the category so not
// specific, e.g. buff pets, raised pets"). The game has three kind numbers per item (Spec_Item.txt
// dwItemKind1/2/3, defineItemkind.h): IK1 is very broad (pets are GENERAL), IK3 has 206 raw names.
// Each item gets one { group, sub } here, decided from those kinds, in this order; the first rule that
// matches wins. Only boxes and sets need the name: the game files them under the same kind as scrolls.
// Pets follow the game's own tests:
//   raised pet  IK3_EGG                                   (CItemElem::IsPet / the pet system)
//   buff pet    IK3_PET and dwReferStat1 == PET_VIS        (ItemProp::IsVisPet, ProjectCmn.h:593)
//   pickup pet  any other IK3_PET                          (CItemElem::IsEatPet, Item.h:236)
// Not game behaviour: only a way to find items. Everything not matched lands in "Other".
(function (FRE) {
  'use strict';
  const W = { SWD: 'Swords', AXE: 'Axes', BOW: 'Bows', CROSSBOW: 'Crossbows', CHEERSTICK: 'Sticks', KNUCKLEHAMMER: 'Knuckles',
    YOYO: 'Yo-yos', STAFF: 'Staffs', WAND: 'Wands', HAND: 'Bare hand' };
  const A = { SUIT: 'Suits', HELMET: 'Helmets', GAUNTLET: 'Gauntlets', BOOTS: 'Boots', SHIELD: 'Shields', MAGICBARUNA: 'Baruna off-hand', ZEMBARUNA: 'Baruna off-hand' };
  const F = { CLOTH: 'Suits', HAT: 'Hats', GLOVE: 'Gloves', SHOES: 'Shoes', MASK: 'Masks', CLOAK: 'Cloaks' };
  const J = { RING: 'Rings', EARRING: 'Earrings', NECKLACE: 'Necklaces' };
  const R = { BOARD: 'Boards', STICK: 'Brooms', MOUNT: 'Mounts', WING: 'Wings', CAR: 'Cars', ACCEL: 'Fuel' };
  const GROUPS = ['Weapons', 'Armor', 'Fashion', 'Jewelry', 'Pets', 'Rides', 'Food & potions', 'Buffs', 'Scrolls', 'Upgrade materials',
    'Boxes & tickets', 'Teleport', 'Housing', 'Quest & event', 'System', 'Other'];
  const RARITY_GROUPS = new Set(['Weapons', 'Armor']);     // dwItemGrade is Normal for every other item

  const strip = (n, p) => (n || '').replace(p, '');
  const pretty = s => s.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

  // info: Workspace.itemInfo (ik1, ik2, ik3, referStat1, name); D: the defines
  function of(info, D) {
    const k1 = strip(D.byValue('IK1_', info.ik1), /^IK1_/), k2 = strip(D.byValue('IK2_', info.ik2), /^IK2_/), k3 = strip(D.byValue('IK3_', info.ik3), /^IK3_/);
    const vis = D.defines.has('PET_VIS') ? D.defines.get('PET_VIS') : 1;
    const name = info.name || '';
    const c = (group, sub) => ({ group, sub });
    if (k2 === 'MOB') return c('System', 'Monster weapons (not items)');
    if (k1 === 'WEAPON' || k2.startsWith('WEAPON_')) return c('Weapons', W[k3] || pretty(k3));
    if (k2 === 'ARMOR' || k2 === 'ARMORETC') return c('Armor', A[k3] || pretty(k3));
    if (k2 === 'CLOTH' || k2 === 'CLOTHETC') return c('Fashion', F[k3] || pretty(k3));
    if (k2 === 'JEWELRY') return c('Jewelry', J[k3] || pretty(k3));
    if (k3 === 'EGG') return c('Pets', 'Raised pets');
    if (k3 === 'PET') return c('Pets', info.referStat1 === vis ? 'Buff pets' : 'Pickup pets');
    if (k3 === 'VIS') return c('Pets', 'Buff pet beads (Vis)');
    if (k3 === 'FEED') return c('Pets', 'Pet food');
    if (/PET_RANDOMOPTION|^SYSTEMPET_|^EATPET_/.test(k3)) return c('Pets', 'Pet scrolls');
    if (k3 === 'SUMMON_NPC') return c('Pets', 'Upgrade spirits');
    if (k1 === 'RIDE') return c('Rides', R[k3] || pretty(k3));
    if (k1 === 'HOUSING') return c('Housing', /^GUILDHOU/.test(k2) ? 'Guild house' : k2 === 'PAPERING' ? 'Walls & floors' : 'Furniture');
    if (k1 === 'GOLD') return c('System', 'Penya');
    if (k2 === 'GMTEXT' || k2 === 'TEXT') return c('System', k2 === 'GMTEXT' ? 'GM items' : 'Letters');
    if (k3 === 'QUEST') return c('Quest & event', 'Quest items');
    if (k3 === 'EVENTMAIN' || k3 === 'DELETE') return c('Quest & event', 'Event items');
    if (k3 === 'BOX' || k3 === 'BOXOPEN') return c('Boxes & tickets', 'Treasure boxes & keys');
    if (k3 === 'TICKET') return c('Boxes & tickets', 'Tickets');
    if (k3 === 'KEY') return c('Boxes & tickets', 'Keys');
    if ((k3 === 'SCROLL' || k3 === 'EVENTSUB' || k3 === 'GEM') && /\b(box|package|set|chest|pouch|bundle|giftbox)\b/i.test(name)) return c('Boxes & tickets', 'Boxes & sets');
    if (k3 === 'EVENTSUB') return c('Quest & event', 'Event items');
    if (k2 === 'BLINKWING' || k2 === 'WARP' || k2 === 'TELEPORTMAP' || k3 === 'MAP') return c('Teleport', k2 === 'WARP' ? 'Couple rings' : k2 === 'TELEPORTMAP' ? 'Teleport maps' : k3 === 'MAP' ? 'Maps' : 'Blinkwings');
    if (k3.startsWith('POTION_BUFF') || (k2 === 'BUFF' && k3 === 'POTION')) return c('Food & potions', 'Buff potions');
    if (k2 === 'FOOD' || k3 === 'FOODELLDIN') return c('Food & potions', 'Food');
    if (k2 === 'POTION' || k2 === 'REFRESHER' || k2 === 'ELLDINPOTION') return c('Food & potions', 'Potions & refreshers');
    if (k3 === 'EXP_RATE') return c('Buffs', 'EXP scrolls');
    if (k3 === 'ARMOREFFECTCHANGE') return c('Buffs', 'Auras');
    if (k2 === 'BUFF' || k2 === 'BUFF2' || k2 === 'BUFF_TOGIFT' || (k1 === 'EFFECT' && k2 === 'KEEP')) return c('Buffs', 'Buff items');
    if (/RANDOMOPTION|LOOKRESTORE/.test(k3)) return c('Scrolls', 'Awakening & blessing');
    if (/PROTECTION|_SAFE$|DEFENDER|_KEEP$/.test(k3)) return c('Scrolls', 'Protection');
    if (/ENCHANT_RATE|UPGRADE_RATE|PIERCE_RATE|ELE_PROP/.test(k3)) return c('Scrolls', 'Upgrade chance');
    if (/LEVELDOWN|DECREASE_EQUIP/.test(k3)) return c('Scrolls', 'Level');
    if (/PKPENALTY/.test(k3)) return c('Scrolls', 'PK');
    if (k2 === 'MATERIAL' || k2 === 'BARUNA' || k3 === 'GEM' || /PIERCE_RUNE/.test(k3)) {
      if (/CARD/.test(k3)) return c('Upgrade materials', 'Cards');
      if (/DICE/.test(k3)) return c('Upgrade materials', 'Dice');
      if (k3 === 'ULTIMATE') return c('Upgrade materials', 'Ultimate jewels');
      if (/^(CID|OPER)/.test(k3)) return c('Upgrade materials', 'Cid & Oper');
      if (k3 === 'GEM') return c('Upgrade materials', 'Gems');
      if (k2 === 'BARUNA' || /RUNE/.test(k3)) return c('Upgrade materials', 'Baruna');
      return c('Upgrade materials', 'Smelting materials');
    }
    if (/SCROLL/.test(k3) || k2 === 'ONCE' || k2 === 'SYSTEM' && k1 === 'CHARGED') return c('Scrolls', 'Other scrolls');
    return c('Other', pretty(k3 || k2 || k1 || 'unknown'));
  }

  // Counts for the dropdown: [{ group, n, subs: [{ sub, n }] }] in GROUPS order, subs by name
  function tree(items) {
    const m = new Map();
    for (const it of items) {
      const g = m.get(it.cat.group) || { group: it.cat.group, n: 0, subs: new Map() };
      g.n++; g.subs.set(it.cat.sub, (g.subs.get(it.cat.sub) || 0) + 1);
      m.set(it.cat.group, g);
    }
    return GROUPS.filter(g => m.has(g)).map(g => {
      const x = m.get(g);
      return { group: g, n: x.n, subs: [...x.subs].map(([sub, n]) => ({ sub, n })).sort((a, b) => a.sub.localeCompare(b.sub)) };
    });
  }

  FRE.itemCategory = { of, tree, GROUPS, RARITY_GROUPS };
})(globalThis.FRE = globalThis.FRE || {});
