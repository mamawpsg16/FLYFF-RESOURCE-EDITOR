// Upgrade Rates edits (task K) as minimal splices: only the number (or the name / colour) token changes; comments, spacing and line
// ends stay. ItemUpgrade.lua (ASCII, CRLF), s.txt (UTF-8, CRLF; the game's LF copy follows), Ultimate_UltimateWeapon.txt (CP949, CRLF;
// ASCII inserts only), WeaponRarity.inc (UTF-16LE: a tier name may hold any character but a quote or a line break).
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const U = () => FRE.upgrade;

  function setNumber(span, v, min, max, what) {
    if (!span) throw new Error(`There is no ${what} to change`);
    T.checkAmount(v, min, max, what);
    return T.replaceSpan(span, v);
  }
  // a level's chance typed as the REAL chance in percent -> the file value that gives it
  function setChance(model, sys, level, pct) {
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Type a chance from 0 to 100 %');
    const row = U().ladder(model, sys).find(r => r.level === level);
    if (!row) throw new Error(`${U().SYSTEMS[sys].label}: there is no row for +${level} → +${level + 1}`);
    const { value } = U().valueForPercent(sys, level, pct);
    return { splices: T.replaceSpan(row.span, value), value, was: row.value };
  }
  // AddAttribute( level, chance, damage, defense, attribute ): field 2-4 (0-based), numbers out of 10,000
  function setAttrField(call, idx, v, what) {
    const a = call.args[idx];
    if (!a) throw new Error(`AddAttribute has no ${what}`);
    return setNumber(a, v, 0, 2147483647, what);
  }
  // Ultimate_UltimateWeapon.txt: SET_GEM / REMOVE_GEM / GENERAL2UNIQUE / UNIQUE2ULTIMATE, out of 1,000,000 (r < p)
  function setSingle(model, key, pct) {
    const sp = model.ult.single[key];
    if (!sp) throw new Error(`Ultimate_UltimateWeapon.txt has no ${key} line`);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Type a chance from 0 to 100 %');
    const v = Math.round(pct / 100 * 1000000);
    return { splices: T.replaceSpan(sp, v), value: v, was: sp.value };
  }
  // MAKE_GEM row: gProb / uProb (percent, out of 1,000,000), gNum / uNum (a count)
  function setMakeGem(row, field, v) {
    if (field === 'gProb' || field === 'uProb') {
      if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error('Type a chance from 0 to 100 %');
      const n = Math.round(v / 100 * 1000000);
      return { splices: T.replaceSpan(row[field], n), value: n };
    }
    T.checkAmount(v, 1, 32767, 'The number of gems');
    return { splices: T.replaceSpan(row[field], v), value: v };
  }

  // ---------------------------------------------------------------- WeaponRarity.inc
  function setRarityNumber(blk, key, v) {
    const sp = blk.spans[key];
    if (!sp) throw new Error(`This tier has no ${key} line of its own`);
    const lim = { pct: [0, 1000, 'The % bonus'], flat: [0, 100000, 'The flat bonus'], level: [1, 1000, 'The tier number'] }[key];
    T.checkAmount(v, lim[0], lim[1], lim[2]);
    return T.replaceSpan(sp, v);
  }
  function setRarityName(blk, name) {
    const v = String(name).trim();
    if (!v) throw new Error('A tier needs a name');
    if (/["\r\n\t]/.test(v)) throw new Error('A tier name cannot hold a quote, a tab or a line break');
    if (v.length > 63) throw new Error('At most 63 characters');
    const sp = blk.spans.name;
    if (!sp) throw new Error('This tier has no szName line');
    // the token is "…" (type string: start/end take in the quotes) or a bare word
    return [{ start: sp.start, end: sp.end, insert: `"${v}"` }];
  }
  // #RRGGBB (or RRGGBB) -> 0xFFRRGGBB in the file's case (0xFF… upper case, the 3168003d style)
  function setRarityColor(blk, rgb) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(String(rgb).trim());
    if (!m) throw new Error('A colour is 6 hex digits, e.g. #FF8800');
    const sp = blk.spans.color;
    if (!sp) throw new Error('This tier has no dwColor line of its own');
    return T.replaceSpan(sp, '0xFF' + m[1].toUpperCase());
  }
  const colorHex = v => '#' + ((v >>> 0) & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0');
  function setDropLuck(row, v) {
    T.checkAmount(v, 0, 100, 'The chance (%)');
    return T.replaceSpan(row.luck, v);
  }

  // ---------------------------------------------------------------- UpgradeFees.lua (part 2, upgrade-fees.diff)
  const FEE_HEAD = [
    '-- UpgradeFees.lua: the Penya fees of the upgrade windows (FLYFF-RESOURCE-EDITOR docs/patches/upgrade-fees.diff).',
    '-- Read once at startup by the WorldServer (Server/Resource) and by the game (Client): keep both copies the same.',
    '-- A missing line keeps the fee compiled in the C++. Whole numbers from 0 to 2147483647.',
  ];
  // the fee `key` -> v: the last "key = n" gets the new number; no line yet -> "key = v" at the end (a new file starts with FEE_HEAD)
  // text: UpgradeFees.lua's current text ('' for a file the editor creates)
  function setFee(fees, text, key, v) {
    const f = FRE.upgradeFees.BY_KEY.get(key);
    if (!f) throw new Error(`Unknown fee ${key}`);
    T.checkAmount(v, 0, FRE.upgradeFees.INT_MAX, `${f.label} (Penya)`);
    if (fees.failed) throw new Error('UpgradeFees.lua does not run (see the problems panel): fix it first');
    const row = fees.rows.find(r => r.key === key);
    if (row && row.span) return T.replaceSpan(row.span, v);
    const eol = T.dominantEol(text), line = `${key} = ${v}`;
    if (!text.trim()) return [{ start: 0, end: text.length, insert: [...FEE_HEAD, line].join(eol) + eol }];
    const needEol = !/[\r\n]$/.test(text);
    return [{ start: text.length, end: text.length, insert: (needEol ? eol : '') + line + eol }];
  }
  // the remove-element text (textClient.txt.txt IDS_TEXTCLIENT_INC_001814): its "100,000 Penya" -> v (commas: it is a text players read)
  function setFeeText(feeText, v) {
    if (!feeText) throw new Error('textClient.txt.txt has no IDS_TEXTCLIENT_INC_001814 line');
    const n = FRE.upgradeFees.textNumber(feeText.text);
    if (!n) throw new Error('The remove-element text has no "<number> Penya" to change');
    return [{ start: feeText.start + n.start, end: feeText.start + n.end, insert: FRE.num.group(v) }];
  }

  FRE.upgradeOps = { setFee, setFeeText, FEE_HEAD, setNumber, setChance, setAttrField, setSingle, setMakeGem, setRarityNumber, setRarityName, setRarityColor, setDropLuck, colorHex };
})(globalThis.FRE = globalThis.FRE || {});
