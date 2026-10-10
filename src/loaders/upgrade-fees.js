// Upgrade fees (task K part 2): UpgradeFees.lua, read the way CUpgradeFees reads it (docs/patches/upgrade-fees.diff,
// Source/Source/_Common/UpgradeFees.h; NOT YET TESTED IN GAME). One reader for the WorldServer (Server/Resource/UpgradeFees.lua)
// and the game (Client/UpgradeFees.lua, a loose file only: fopen + luaL_dofile, no data.res).
//   no file                      -> every fee keeps the old compiled value
//   the script fails to run      -> Error( "… Run Failed, the old fees are used" ), every fee keeps the old value
//   per global: lua_isnumber (a number, or a string Lua can read as one) and 0 <= d <= 2147483647 -> (int)d (cut toward 0);
//                anything else (missing, nil, text, negative, too large) keeps the old value. A name written twice: the last wins.
// Without the patch built, the server ignores this file and charges the compiled values below.
// Part 3 (the same patch): 24 more fees (default 0 = free) for every upgrade / remove; the server takes them only (no window
// shows them). Transy (gender change) is not here: ItemUpgrade.lua already holds nItemTransyLowLevel / HighLevel (ItemUpgrade.cpp:118).
(function (FRE) {
  'use strict';
  const INT_MAX = 2147483647;
  // key: the Lua global; def: the value compiled in the C++ (and kept when the file does not set it)
  // group: the screen's sections. The first five had a compiled fee; the rest were free (def 0) until upgrade-fees.diff part 3.
  const F = (key, group, label, what, def, server, game = null, text = null) => ({ key, group, label, what, def, server, game, text });
  const FEES = [
    F('nEnchantGeneralPenya', 'gear', 'Normal upgrade', 'every try, normal window (orichalcum)', 0, 'ItemUpgrade.cpp EnchantGeneral'),
    F('nSafeGeneralPenya', 'gear', 'Normal upgrade, safe window', 'every try in the safe upgrade window', 0, 'ItemUpgrade.cpp SmeltSafetyGeneral'),
    F('nEnchantAttributePenya', 'gear', 'Element upgrade', 'every try (element card)', 0, 'ItemUpgrade.cpp EnchantAttribute'),
    F('nChangeAttributePenya', 'gear', 'Change the element', 'keeps the +N, swaps the element', 0, 'ItemUpgrade.cpp ChangeAttribute'),
    F('nEnchantAccessoryPenya', 'gear', 'Accessory upgrade', 'every try, normal window (moonstone)', 0, 'ItemUpgrade.cpp RefineAccessory'),
    F('nSafeAccessoryPenya', 'gear', 'Accessory upgrade, safe window', 'every try in the safe upgrade window', 0, 'ItemUpgrade.cpp SmeltSafetyAccessory'),
    F('nEnchantCollectorPenya', 'gear', 'Collector upgrade', 'every try (moonstone)', 0, 'ItemUpgrade.cpp RefineCollector'),
    F('nPiercingPenya', 'gear', 'Piercing: add a card slot', 'every try in the piercing window', 100000, 'ItemUpgrade.cpp:231 OnPiercingSize', 'WndPiercing.cpp:111 (the price shown)'),
    F('nSafePiercingPenya', 'gear', 'Piercing in the safe upgrade window', 'every try, with a piercing protection scroll', 100000, 'ItemUpgrade.cpp:797 SmeltSafetyPiercingSize', 'WndField.cpp:28195 / 28245 (stops when the player has less)'),
    F('nPiercingCardPenya', 'gear', 'Put a card in a slot', 'each card put in', 0, 'ItemUpgrade.cpp OnPiercing'),
    F('nAwakeningPenya', 'gear', 'Awakening', 'random stats on an item (the Awakening NPC menu)', 100000, 'DPSrvr.cpp:12498 OnAwakening'),
    F('nFastAwakeRollPenya', 'gear', 'Fast awakening', 'each roll of the Fast Awake window (stops when short)', 0, 'DPSrvr.cpp OnFastAwakeRoll'),
    F('nUltimateMakeItemPenya', 'ultimate', 'Make an Ultimate weapon', 'the Ultimate making window', 0, 'UltimateWeapon.cpp MakeItem'),
    F('nUltimateMakeGemPenya', 'ultimate', 'Make a gem', 'each gem made from a weapon', 0, 'UltimateWeapon.cpp MakeGem'),
    F('nUltimateToUniquePenya', 'ultimate', 'General → Unique', 'each try', 0, 'UltimateWeapon.cpp TransWeapon'),
    F('nUltimateToUltimatePenya', 'ultimate', 'Unique → Ultimate', 'each try (+10 Unique)', 0, 'UltimateWeapon.cpp TransWeapon'),
    F('nUltimateEnchantPenya', 'ultimate', 'Ultimate upgrade', 'every try, normal window (+1 → +10)', 0, 'UltimateWeapon.cpp EnchantWeapon'),
    F('nSafeUltimatePenya', 'ultimate', 'Ultimate upgrade, safe window', 'every try in the safe upgrade window', 0, 'UltimateWeapon.cpp SmeltSafetyUltimate'),
    F('nUltimateSetGemPenya', 'ultimate', 'Put a gem in', 'each try', 0, 'UltimateWeapon.cpp SetGem'),
    F('nUltimateRemoveGemPenya', 'ultimate', 'Take a gem out', 'each try', 0, 'UltimateWeapon.cpp RemoveGem'),
    F('nRemoveAttributePenya', 'remove', 'Remove an element upgrade', 'takes the element and its +N off a weapon or armor', 100000, 'DPSrvr.cpp:6849 OnRemoveAttribute', null, 'IDS_TEXTCLIENT_INC_001814'),
    F('nRemovePiercingPenya', 'remove', 'Remove a card from a slot', 'each card taken out (the last filled slot first)', 1000000, 'ItemUpgrade.cpp:447 OnPiercingRemove'),
    F('nBlessingCancelPenya', 'remove', 'Remove a blessing', 'the Blessing cancel NPC menu', 0, 'DPSrvr.cpp OnBlessednessCancel'),
    F('nRemoveLevelDownPenya', 'remove', 'Remove a level-down', 'clears the item level-down', 0, 'DPSrvr.cpp OnRemoveItemLevelDown'),
    F('nPetAwakeningCancelPenya', 'pets', 'Cancel a pet awakening', 'paid only when the cancel works', 0, 'DPSrvr.cpp OnPickupPetAwakeningCancel'),
    F('nRemoveVisPenya', 'pets', 'Remove a vis', 'taken off the buff pet by hand (an expired vis is free)', 0, 'ItemUpgrade.cpp RemovePetVisItem'),
    F('nSwapVisPenya', 'pets', 'Swap two vis', 'each swap', 0, 'ItemUpgrade.cpp SwapVis'),
    F('nRemoveAuraPenya', 'pets', 'Remove the aura', 'the aura / glow change on armor', 0, 'DPSrvr.cpp OnRemoveAura'),
    F('nLookChangePenya', 'pets', 'Change an item\'s look', 'transmute or revert', 0, 'DPSrvr.cpp OnLookChange'),
  ];
  const GROUPS = [['gear', 'Gear upgrades'], ['ultimate', 'Ultimate weapons'], ['remove', 'Removes and cancels'], ['pets', 'Pets, vis, aura and looks']];
  const BY_KEY = new Map(FEES.map(f => [f.key, f]));

  // lua_isnumber + lua_tonumber of a literal: decimal / hex numbers, or a string holding one (Lua 5.3 string coercion)
  function luaNumber(raw) {
    let t = String(raw).trim();
    const q = /^(["'])(.*)\1$/.exec(t);
    if (q) t = q[2].trim();
    if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(t)) return Number.parseInt(t, 16);
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return Number(t);
    return NaN;
  }
  // the value CUpgradeFees::Read keeps: (int)d when 0 <= d <= INT_MAX, else null (the old value stays)
  function usable(d) {
    return Number.isFinite(d) && d >= 0 && d <= INT_MAX ? Math.trunc(d) : null;
  }

  // file: SourceFile or null -> { file, missing, empty, failed, errors, rows: [{ ...FEES[i], present, raw, value (used), span, count }] }
  function load(file) {
    const res = { file: 'UpgradeFees.lua', missing: !file, empty: !file || !file.text.trim(), failed: false, errors: [], rows: [] };
    let L = null;
    if (file && file.text.trim()) {
      L = FRE.upgrade.loadLua(file);
      res.failed = L.failed;
      res.errors = L.errors.filter(e => !e.warn);
    }
    for (const f of FEES) {
      const n = L && L.numbers[f.key];
      const count = L ? (file.text.match(new RegExp(`(^|[^\\w.])${f.key}\\s*=(?!=)`, 'g')) || []).length : 0;
      // the loader blanks strings, so a quoted value is read again from the text: "500000" is a number for lua_isnumber
      const raw = n ? (/^("[^"\r\n]*"|'[^'\r\n]*'|[^\s;]+)/.exec(file.text.slice(n.start)) || [n.raw])[0] : null;
      const d = n ? luaNumber(raw) : NaN;
      if (n && raw.length !== n.end - n.start) n.end = n.start + raw.length;
      const ok = !res.failed && n ? usable(d) : null;
      res.rows.push({ ...f, present: !!n, raw, read: d, value: ok === null ? f.def : ok, ignored: !!n && !res.failed && ok === null,
        span: n ? { start: n.start, end: n.end } : null, stmt: n ? n.stmt : null, count });
    }
    return res;
  }
  // the fee the server charges for key (with the patch); without it: the compiled value
  function feeOf(fees, key, patched = true) {
    const f = BY_KEY.get(key);
    if (!patched || !fees) return f.def;
    const r = fees.rows.find(x => x.key === key);
    return r ? r.value : f.def;
  }

  // The remove-element text (TID_GAME_REMOVE_ATTRIBUTE = IDS_TEXTCLIENT_INC_001814, shown by WndField.cpp:25596): the
  // number written before "Penya" -> { start, end, value } inside the string value, or null
  function textNumber(s) {
    const m = /(\d{1,3}(?:,\d{3})+|\d+)(?=\s*penya)/i.exec(s || '');
    return m ? { start: m.index, end: m.index + m[1].length, value: Number(m[1].replace(/,/g, '')) } : null;
  }

  FRE.upgradeFees = { FEES, GROUPS, BY_KEY, INT_MAX, luaNumber, usable, load, feeOf, textNumber };
})(globalThis.FRE = globalThis.FRE || {});
