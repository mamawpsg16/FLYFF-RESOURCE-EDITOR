// The text of a rules window (Client/Client/NpcBoard_<menu id>.inc, the npc-board client change in
// docs/patches/npc-board.diff), read the way the game shows it: CWndGuildCombatBoard::SetString ->
// CEditString::AddParsingString (_Common/EditString.cpp:632) -> ParsingString (EditString.cpp:441),
// with its defaults (EditString.h:155): white (0xffffffff), no style, PS_USE_MACRO on; __ITEMLINK is on
// in Neuz (Neuz/VersionCommon.h:36).
//   #cAARRGGBB  colour; each of the 8 characters is read as hex with c >= 'a' ? c - 'a' + 10 : c - '0',
//               so ONLY lowercase hex works (an uppercase 'F' gives 22, garbling the colour)
//   #b #u #s    bold / underline / strike on;  #nb #nu #ns off;  #nc back to white;  #l<4> / #nl code page
//   #i<7><4>    item link ids (skipped, nothing shown)
//   #<other>    '#' and the character are shown as they are;  a '#' at the very end is dropped
//   \n          (backslash n, two characters) a new line; a real line break is kept as it is
// Returns pieces [{ text, color, bold, underline, strike }] (adjacent characters with one style merged).
(function (FRE) {
  'use strict';
  const BOLD = 2, UNDER = 1, STRIKE = 4;
  const WHITE = 0xffffffff;

  // for( j = 7; j >= 0; j-- ) { cVal = szColor[j]; cVal = cVal >= 'a' ? cVal - 'a' + 10 : cVal - '0';
  //   dwlNumber |= (DWORDLONG)cVal << dwMulCnt; dwMulCnt += 4; }  -- CHAR is signed (MSVC), so a wrong
  // character can spill into other nibbles; the low 32 bits are the colour.
  const s8 = v => ((v & 0xff) ^ 0x80) - 0x80;
  function hexColor(s) {
    let v = 0n, shift = 0n;
    for (let j = 7; j >= 0; j--) {
      const c = s8(s.charCodeAt(j) || 0);
      const val = s8(c >= 97 ? c - 97 + 10 : c - 48);
      v |= BigInt.asUintN(64, BigInt(val)) << shift;
      shift += 4n;
    }
    return Number(v & 0xffffffffn);
  }

  function parse(src) {
    const chars = [];                                      // [ch, color, style]
    let color = WHITE, style = 0;
    const n = src.length;
    for (let i = 0; i < n; i++) {
      const ch = src[i];
      if (ch === '#') {
        if (++i >= n) break;
        switch (src[i]) {
          case 'c':
            if (++i >= n) break;
            color = colorAt(src, i);
            i += 7;
            break;
          case 'u': style |= UNDER; break;
          case 'b': style |= BOLD; break;
          case 's': style |= STRIKE; break;
          case 'l': if (++i >= n) break; i += 3; break;     // code page: not drawn differently here
          case 'i': if (++i >= n) break; i += 7; i += 3; break;
          case 'n':
            if (++i >= n) break;
            switch (src[i]) {
              case 'c': color = WHITE; break;
              case 'b': style &= ~BOLD; break;
              case 'u': style &= ~UNDER; break;
              case 's': style &= ~STRIKE; break;
              default: break;
            }
            break;
          default:
            chars.push(['#', color, style], [src[i], color, style]);
        }
      } else if (ch === '\\' && src[i + 1] === 'n') {
        chars.push(['\n', color, style]);
        i += 1;
      } else chars.push([ch, color, style]);
    }
    const out = [];
    for (const [ch, c, s] of chars) {
      const last = out[out.length - 1];
      if (last && last.color === c && last.style === s) last.text += ch;
      else out.push({ text: ch, color: c, style: s });
    }
    return out.map(p => ({ text: p.text, color: p.color, bold: !!(p.style & BOLD), underline: !!(p.style & UNDER), strike: !!(p.style & STRIKE) }));
  }
  // the 8 characters after "#c" (fewer at the end of the text: the C++ copies past the end; here they count as 0)
  function colorAt(src, i) { return hexColor((src.slice(i, i + 8) + '00000000').slice(0, 8)); }

  // #cAARRGGBB for a CSS colour "#rrggbb" (lowercase, opaque)
  const code = css => '#cff' + String(css).replace(/^#/, '').toLowerCase();
  const css = v => '#' + ((v >>> 0) & 0xffffff).toString(16).padStart(6, '0');

  FRE.boardText = { parse, hexColor, code, css, WHITE };
})(globalThis.FRE = globalThis.FRE || {});
