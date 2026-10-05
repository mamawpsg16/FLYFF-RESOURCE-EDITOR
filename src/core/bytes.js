// Byte <-> string helpers. Nothing here ever "fixes" data: every mapping is
// lossless so that encode(decode(bytes)) === bytes. See docs/DESIGN.md §1.2.
(function (FRE) {
  'use strict';

  const CHUNK = 0x8000;

  // Each byte becomes one char with the same code (0-255). This is NOT
  // TextDecoder('latin1'), which browsers treat as windows-1252 and which
  // remaps 0x80-0x9F. The C++ server never decodes these files either.
  function bytesToBinaryString(u8, start = 0, end = u8.length) {
    let out = '';
    for (let i = start; i < end; i += CHUNK) {
      out += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + CHUNK, end)));
    }
    return out;
  }

  function binaryStringToBytes(s) {
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xff) throw new Error(`character U+${c.toString(16)} at ${i} cannot be stored in a byte file`);
      u8[i] = c;
    }
    return u8;
  }

  // UTF-16LE code units -> JS string, one char per code unit. Lone surrogates
  // survive (TextDecoder would replace them with U+FFFD).
  function utf16leToString(u8, start = 0) {
    const n = (u8.length - start) >> 1;
    let out = '';
    const buf = new Array(Math.min(n, CHUNK));
    for (let i = 0; i < n; i += CHUNK) {
      const m = Math.min(CHUNK, n - i);
      buf.length = m;
      for (let k = 0; k < m; k++) {
        const o = start + 2 * (i + k);
        buf[k] = u8[o] | (u8[o + 1] << 8);
      }
      out += String.fromCharCode.apply(null, buf);
    }
    return out;
  }

  function stringToUtf16le(s) {
    const u8 = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      u8[2 * i] = c & 0xff;
      u8[2 * i + 1] = c >> 8;
    }
    return u8;
  }

  function concatBytes(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Splits text into lines, keeping each line's exact terminator.
  // Returns [{ start, contentEnd, end, eol }] where text.slice(start, end)
  // concatenated over all lines === text.
  function scanLines(text) {
    const lines = [];
    let start = 0;
    const n = text.length;
    for (let i = 0; i < n; i++) {
      const c = text.charCodeAt(i);
      if (c === 13) {
        const crlf = i + 1 < n && text.charCodeAt(i + 1) === 10;
        const end = crlf ? i + 2 : i + 1;
        lines.push({ start, contentEnd: i, end, eol: crlf ? '\r\n' : '\r' });
        if (crlf) i++;
        start = end;
      } else if (c === 10) {
        lines.push({ start, contentEnd: i, end: i + 1, eol: '\n' });
        start = i + 1;
      }
    }
    if (start < n || n === 0) lines.push({ start, contentEnd: n, end: n, eol: '' });
    return lines;
  }

  // Binary search: index of the line containing offset.
  function lineIndexAt(lines, offset) {
    let lo = 0, hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  function isPrintableAscii(s) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c !== 9 && (c < 0x20 || c > 0x7e)) return false;
    }
    return true;
  }

  function isAllAscii(u8) {
    for (let i = 0; i < u8.length; i++) if (u8[i] >= 0x80) return false;
    return true;
  }

  function isValidUtf8(u8) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(u8); return true; } catch (e) { return false; }
  }

  FRE.bytes = {
    bytesToBinaryString, binaryStringToBytes, utf16leToString, stringToUtf16le,
    concatBytes, bytesEqual, scanLines, lineIndexAt, isPrintableAscii, isAllAscii, isValidUtf8,
  };
})(globalThis.FRE = globalThis.FRE || {});
