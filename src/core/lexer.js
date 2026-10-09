// Port of the server tokenizer:
//   Lexer  = CScanner (Source/_Common/scanner.cpp, GetToken / GetLastFull / GetNumber)
//   Script = CScript  (Source/_Common/Script.cpp, GetToken: string table, then #define lookup)
// The goal is to read tokens exactly the way the server does, including its
// quirks, while also recording each token's start/end offsets so the editor
// can splice precisely. Comma mode (bComma) is not used by the files we edit.
(function (FRE) {
  'use strict';

  const NULL_ID = -1;            // 0xFFFFFFFF as a signed int
  const INT_MAX = 2147483647;
  const INT_MIN = -2147483648;
  const MAX_TOKENSTR = 2048;

  // isdelim(): " !:;,+-<>'/*%^=()&|\"{}" plus tab, CR, NUL, LF
  const DELIM = new Uint8Array(128);
  for (const ch of " !:;,+-<>'/*%^=()&|\"{}\t\r\n\0") DELIM[ch.charCodeAt(0)] = 1;
  // single-char delimiter tokens: "+-*^/%=;(),':{}."
  const SINGLE = new Uint8Array(128);
  for (const ch of "+-*^/%=;(),':{}.") SINGLE[ch.charCodeAt(0)] = 1;

  const isDelim = c => c < 128 && DELIM[c] === 1;
  const isWhite = c => c > 0 && c <= 0x20;
  const isDigit = c => c >= 48 && c <= 57;
  const isAlpha = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

  class Lexer {
    // text: binary string (byte files) or UTF-16 string (FF FE files)
    constructor(text, opts = {}) {
      this.text = text;
      const nul = text.indexOf('\0');
      this.limit = nul < 0 ? text.length : nul;   // the server stops at the first NUL
      this.pos = 0;
      this.diags = opts.diags || [];
      this.file = opts.file || '';
      this.token = null;
      if (nul >= 0) this.diag('E_NUL', 'WARN', 'file contains a NUL byte: the server ignores everything after it', nul, nul + 1);
    }

    diag(code, severity, message, start, end, extra) {
      this.diags.push(Object.assign({ code, severity, message, file: this.file, start, end }, extra || {}));
    }

    c(i) { return i < this.limit ? this.text.charCodeAt(i) : 0; }

    // CScanner::GetToken( FALSE )
    next() {
      const t = this.text;
      let p = this.pos;
      // whitespace + comments
      for (;;) {
        while (isWhite(this.c(p))) p++;
        if (this.c(p) === 47 /* / */ && this.c(p + 1) === 47) {
          p += 2;
          while (p < this.limit) { const c = this.c(p); if (c === 13 || c === 10) break; p++; }
          if (this.c(p) === 13) { p++; if (this.c(p) === 10) p++; } else if (this.c(p) === 10) p++;
          continue;
        }
        if (this.c(p) === 47 && this.c(p + 1) === 42 /* * */) {
          const close = t.indexOf('*/', p + 2);
          if (close < 0 || close >= this.limit) {
            this.diag('E_UNTERM_CMT', 'BLOCK', 'unterminated /* comment: the server ignores the rest of the file', p, this.limit);
            this.pos = this.limit;
            return (this.token = { type: 'eof', text: '', start: this.limit, end: this.limit });
          }
          p = close + 2;
          continue;
        }
        break;
      }
      const start = p;
      const c = this.c(p);
      let type, text, end;

      if (p >= this.limit) {
        this.pos = p;
        return (this.token = { type: 'eof', text: '', start: p, end: p });
      }

      // relational operators
      if ((c === 61 /* = */ || c === 33 /* ! */ || c === 60 /* < */ || c === 62 /* > */)) {
        if (this.c(p + 1) === 61) { type = 'delim'; text = t.substr(p, 2); end = p + 2; }
        else if (c !== 61) { type = 'delim'; text = t[p]; end = p + 1; }
      }
      if (!type && ((c === 38 && this.c(p + 1) === 38) || (c === 124 && this.c(p + 1) === 124))) {
        type = 'delim'; text = t.substr(p, 2); end = p + 2;
      }
      if (!type && c < 128 && SINGLE[c]) { type = 'delim'; text = t[p]; end = p + 1; }

      if (!type && c === 34 /* " */) {
        let q = p + 1;
        while (q < this.limit && this.c(q) !== 34 && this.c(q) !== 13 && (q - p - 1) < MAX_TOKENSTR) q++;
        text = t.slice(p + 1, q);
        type = 'string';
        if (this.c(q) === 34) { end = q + 1; this.pos = q + 1; }
        else {
          // the server skips the CR too (or stays at EOF)
          end = q;
          this.pos = q < this.limit ? q + 1 : q;
          this.diag('E_UNTERM_STR', 'BLOCK', 'string has no closing quote on this line', p, q);
          return (this.token = { type, text, start, end });
        }
        return (this.token = { type, text, start, end });
      }

      if (!type && c === 48 && this.c(p + 1) === 120 /* 0x */) {
        let q = p + 2;
        while (q < this.limit && !isDelim(this.c(q))) q++;
        type = 'hex'; text = t.slice(p + 2, q); end = q;
      }
      if (!type && isDigit(c)) {
        let q = p;
        while (q < this.limit && !isDelim(this.c(q))) q++;
        type = 'number'; text = t.slice(p, q); end = q;
      }
      if (!type && (isAlpha(c) || c >= 128 || c === 35 || c === 95 || c === 64 || c === 36 || c === 63)) {
        let q = p;
        while (q < this.limit && !isDelim(this.c(q))) q++;
        type = 'temp'; text = t.slice(p, q); end = q;
      }
      if (!type) { type = 'temp'; text = t[p]; end = p + 1; }

      this.pos = end;
      return (this.token = { type, text, start, end });
    }

    putBack(tok) { this.pos = tok.start; }

    // CScanner::GetLastFull: rest of the line up to CR (not LF!), trimmed.
    lastFull() {
      let p = this.pos;
      while (isWhite(this.c(p)) && this.c(p) !== 13) p++;
      const start = p;
      while (p < this.limit && this.c(p) !== 13) p++;
      let end = p;
      while (end > start && isWhite(this.c(end - 1))) end--;
      this.pos = p;
      return { text: this.text.slice(start, end), start, end };
    }
  }

  // C atoi() as compiled by MSVC: clamps to INT_MAX / INT_MIN on overflow.
  function atoi(s) {
    let i = 0;
    while (i < s.length && /\s/.test(s[i])) i++;
    let sign = 1;
    if (s[i] === '-' || s[i] === '+') { if (s[i] === '-') sign = -1; i++; }
    let v = 0, any = false, overflow = false;
    while (i < s.length && s[i] >= '0' && s[i] <= '9') {
      v = v * 10 + (s.charCodeAt(i) - 48); any = true; i++;
      if (v > 2147483648) overflow = true;
    }
    v *= sign;
    if (v > INT_MAX) { v = INT_MAX; overflow = true; }
    if (v < INT_MIN) { v = INT_MIN; overflow = true; }
    return { value: any ? v : 0, overflow, numeric: any };
  }

  function atof(s) {
    const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(s);
    return m ? parseFloat(m[0]) : 0;
  }

  // GetNumber's hex branch: lowercase, each char (c >= 'a' ? c-'a'+10 : c-'0') << 4k, low 32 bits.
  function hexValue(digits) {
    let v = 0n;
    const d = digits.toLowerCase();
    for (let i = d.length - 1, sh = 0n; i >= 0; i--, sh += 4n) {
      const code = d.charCodeAt(i);
      let cv = code >= 97 ? code - 97 + 10 : code - 48;
      cv = ((cv + 128) & 0xff) - 128;     // CHAR is signed
      v |= BigInt.asUintN(64, BigInt(cv) << sh);
    }
    return Number(BigInt.asIntN(32, BigInt.asUintN(32, v)));
  }

  // CScript layered on the Lexer: identifiers are resolved through the
  // string table first, then the #define map.
  class Script {
    constructor(text, opts = {}) {
      this.lex = new Lexer(text, opts);
      this.defines = opts.defines || new Map();
      this.strings = opts.strings || null;
      this.def = 0;               // m_dwDef: 1 while inside GetNumber
      this.token = null;
    }
    get diags() { return this.lex.diags; }
    get file() { return this.lex.file; }
    diag(...a) { this.lex.diag(...a); }

    getToken() {
      const raw = this.lex.next();
      let tok = raw;
      if (raw.type === 'temp') {
        if (raw.text.startsWith('#define')) {
          tok = Object.assign({}, raw, { type: 'keyword' });
        } else {
          tok = Object.assign({}, raw, { type: 'ident', raw: raw.text });
          if (this.strings && this.strings.has(raw.text)) {
            tok.type = 'string'; tok.text = this.strings.get(raw.text); tok.stringKey = raw.text;
          } else if (this.defines.has(raw.text)) {
            const v = this.defines.get(raw.text);
            tok.type = 'number'; tok.text = String(v); tok.define = raw.text; tok.defineValue = v;
          } else if (this.def === 1) {
            const ch = raw.text[0];
            if (raw.text !== '' && ch !== '=' && ch !== '-' && ch !== '+') {
              tok.unresolved = true;
              this.diag('E_UNDEF', 'BLOCK', `${raw.text} is not defined (the server logs "Not Found" and uses 0)`, raw.start, raw.end, { name: raw.text });
            }
          }
        }
      }
      this.token = tok;
      return tok;
    }

    get eof() { return this.token && this.token.type === 'eof'; }

    // CScanner::GetNumber. Returns { value, start, end, tokens, define, overflow, isNull, unresolved }.
    getNumber() {
      this.def = 1;
      const t = this.getToken();
      const r = { value: 0, start: t.start, end: t.end, tokens: [t], define: t.define || null, overflow: false, isNull: false, unresolved: !!t.unresolved, eof: t.type === 'eof' };
      if (t.type === 'hex') {
        r.value = hexValue(t.text);
      } else if (t.text !== '') {
        const ch = t.text[0];
        if (ch === '=') { r.value = NULL_ID; r.isNull = true; }
        else if (ch === '-' || ch === '+') {
          const n = this.getToken();
          r.tokens.push(n); r.end = n.end; r.define = n.define || null; r.unresolved = !!n.unresolved;
          const a = atoi(n.text);
          r.value = ch === '-' ? -a.value | 0 : a.value; r.overflow = a.overflow;
          r.numeric = a.numeric;
        } else {
          const a = atoi(t.text);
          r.value = a.value; r.overflow = a.overflow; r.numeric = a.numeric;
        }
      }
      this.def = 0;
      return r;
    }

    // CScanner::GetInt64 (scanner.cpp:912): _atoi64, no clamp; hex gives 0. Values here stay below 2^53.
    getInt64() {
      this.def = 1;
      const t = this.getToken();
      const r = { value: 0, start: t.start, end: t.end, eof: t.type === 'eof' };
      const a64 = s => { const m = /^\s*[-+]?\d+/.exec(s); return m ? Number(m[0]) : 0; };
      if (t.type !== 'hex' && t.text !== '') {
        const ch = t.text[0];
        if (ch === '=') r.value = -1;
        else if (ch === '-' || ch === '+') { const n = this.getToken(); r.end = n.end; r.value = ch === '-' ? -a64(n.text) : a64(n.text); }
        else r.value = a64(t.text);
      }
      this.def = 0;
      return r;
    }

    // CScanner::GetFloat
    getFloat() {
      this.def = 1;
      const t = this.getToken();
      const r = { value: 0, start: t.start, end: t.end, tokens: [t], isNull: false, unresolved: !!t.unresolved, eof: t.type === 'eof' };
      if (t.text !== '') {
        const ch = t.text[0];
        if (ch === '=') { r.value = -1; r.isNull = true; }
        else if (ch === '-' || ch === '+') {
          const n = this.getToken();
          r.tokens.push(n); r.end = n.end; r.unresolved = !!n.unresolved;
          r.value = ch === '-' ? -atof(n.text) : atof(n.text);
        } else r.value = atof(t.text);
      }
      this.def = 0;
      return r;
    }
  }

  FRE.lexer = { Lexer, Script, atoi, atof, hexValue, NULL_ID, INT_MAX };
})(globalThis.FRE = globalThis.FRE || {});
