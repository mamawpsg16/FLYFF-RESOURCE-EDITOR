// Comma mode of the server tokenizer (CScanner::GetToken( TRUE ), Source/_Common/scanner.cpp:575-683, and
// CScanner::GetNumber( TRUE ) :860-910 with CScript::GetToken's #define lookup, Script.cpp:184). Used for propSkillAdd.csv.
//   Before a token: white space (1..0x20) and // comments are skipped (so a line break, or a trailing comma before it, adds nothing).
//   A token runs to the next ',' or '\r' or NUL; that ',' / '\r' is used up. '\n' does NOT end it: in an LF-only file the last value
//   of a row and the first value of the next row are ONE token ("600\nSA_X" -> atoi = 600, SA_X is lost, every later row shifts).
//   Trailing white space is cut off. "..." quotes: the text up to the closing quote (or '\r').
//   Value: first char a digit -> number (atoi: leading digits; "0x.." hex); else a #define name -> its value; '=' -> NULL_ID
//   (0xFFFFFFFF); '-' / '+' -> atoi of the whole token; empty -> 0; an unknown name -> atoi = 0 (the server logs "Not Found").
(function (FRE) {
  'use strict';
  const NULL_ID = 0xFFFFFFFF;
  const isWhite = c => c > 0 && c <= 0x20;
  const isDigit = c => c >= 48 && c <= 57;

  // C atoi as MSVC does it (clamps at INT_MAX / INT_MIN): the shared port in core/lexer.js
  const atoi = s => FRE.lexer.atoi(s).value;

  // text: binary string. -> [{ text, start, end, value, raw }] (start/end: the token's own chars, end exclusive)
  function tokens(text, defines) {
    const nul = text.indexOf('\0'), limit = nul < 0 ? text.length : nul;
    const c = i => (i < limit ? text.charCodeAt(i) : 0);
    const out = [];
    let p = 0;
    for (;;) {
      for (;;) {
        while (isWhite(c(p))) p++;
        if (c(p) === 47 && c(p + 1) === 47) {
          p += 2;
          while (p < limit && c(p) !== 13 && c(p) !== 10) p++;
          if (c(p) === 13) { p++; if (c(p) === 10) p++; } else if (c(p) === 10) p++;
          continue;
        }
        if (c(p) === 47 && c(p + 1) === 42) {
          const close = text.indexOf('*/', p + 2);
          if (close < 0 || close >= limit) return out;
          p = close + 2;
          continue;
        }
        break;
      }
      if (p >= limit) return out;
      let start = p, end, str = false;
      if (c(p) === 34) {
        str = true; p++; start = p;
        while (p < limit && c(p) !== 34 && c(p) !== 13) p++;
        end = p; p++;
      } else {
        while (p < limit && c(p) !== 44 && c(p) !== 13) p++;
        end = p;
      }
      if (c(p) === 44 || c(p) === 13) p++;
      if (!str) while (end > start && isWhite(c(end - 1))) end--;
      const raw = text.slice(start, end);
      out.push({ text: raw, start, end, value: valueOf(raw, str, defines) });
    }
  }

  function valueOf(raw, str, defines) {
    if (!raw.length) return 0;
    const f = raw.charCodeAt(0);
    if (!str && f === 48 && raw[1] === 'x') {        // HEX: every char as a hex digit (GetNumber :863)
      let v = 0;
      for (let i = 2; i < raw.length; i++) { const ch = raw.toLowerCase().charCodeAt(i); v = (v * 16 + (ch >= 97 ? ch - 87 : ch - 48)) % 4294967296; }
      return v >>> 0;
    }
    if (!str && !isDigit(f) && defines && defines.has(raw)) return defines.get(raw) | 0;
    if (raw[0] === '=') return NULL_ID;
    return atoi(raw);
  }

  FRE.csvLexer = { tokens, valueOf, atoi, NULL_ID };
})(globalThis.FRE = globalThis.FRE || {});
