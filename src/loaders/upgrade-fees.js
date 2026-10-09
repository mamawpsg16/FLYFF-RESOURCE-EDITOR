// Upgrade fees (task K part 2): UpgradeFees.lua, read the way CUpgradeFees reads it (docs/patches/upgrade-fees.diff,
// Source/Source/_Common/UpgradeFees.h; NOT YET TESTED IN GAME). One reader for the WorldServer (Server/Resource/UpgradeFees.lua)
// and the game (Client/UpgradeFees.lua, a loose file only: fopen + luaL_dofile, no data.res).
//   no file                      -> every fee keeps the old compiled value
//   the script fails to run      -> Error( "… Run Failed, the old fees are used" ), every fee keeps the old value
//   per global: lua_isnumber (a number, or a string Lua can read as one) and 0 <= d <= 2147483647 -> (int)d (cut toward 0);
//                anything else (missing, nil, text, negative, too large) keeps the old value. A name written twice: the last wins.
// Without the patch built, the server ignores this file and charges the compiled values below.
// Transy (gender change) is not here: ItemUpgrade.lua already holds nItemTransyLowLevel / HighLevel (ItemUpgrade.cpp:118).
(function (FRE) {
  'use strict';
  const INT_MAX = 2147483647;
  // key: the Lua global; def: the value compiled in the C++ (and kept when the file does not set it)
  const FEES = [
    { key: 'nAwakeningPenya', label: 'Awakening', what: 'random stats on an item (the Awakening NPC menu)', def: 100000,
      server: 'DPSrvr.cpp:12498 OnAwakening', game: null },
    { key: 'nRemoveAttributePenya', label: 'Remove an element upgrade', what: 'takes the element and its +N off a weapon or armor', def: 100000,
      server: 'DPSrvr.cpp:6849 OnRemoveAttribute', game: null, text: 'IDS_TEXTCLIENT_INC_001814' },
    { key: 'nPiercingPenya', label: 'Piercing: add a card slot', what: 'every try in the piercing window', def: 100000,
      server: 'ItemUpgrade.cpp:231 OnPiercingSize', game: 'WndPiercing.cpp:111 (the price shown)' },
    { key: 'nSafePiercingPenya', label: 'Piercing in the safe upgrade window', what: 'every try, with a piercing protection scroll', def: 100000,
      server: 'ItemUpgrade.cpp:797 SmeltSafetyPiercingSize', game: 'WndField.cpp:28195 / 28245 (stops when the player has less)' },
    { key: 'nRemovePiercingPenya', label: 'Remove a card from a slot', what: 'each card taken out (the last filled slot first)', def: 1000000,
      server: 'ItemUpgrade.cpp:447 OnPiercingRemove', game: null },
  ];
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

  FRE.upgradeFees = { FEES, BY_KEY, INT_MAX, luaNumber, usable, load, feeOf, textNumber };
})(globalThis.FRE = globalThis.FRE || {});
