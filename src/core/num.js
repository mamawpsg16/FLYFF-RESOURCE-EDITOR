// Number helpers for display and input. Commas are for people only: values
// written into resource files are always plain digits, because the server's
// tokenizer treats ',' as a separator (a "1,000" would become two values).
(function (FRE) {
  'use strict';

  // 1234567 -> "1,234,567"
  function group(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '';
    const s = String(n);
    const neg = s.startsWith('-');
    const [int, frac] = (neg ? s.slice(1) : s).split('.');
    return (neg ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? '.' + frac : '');
  }

  // "25,000" / "25 000" / "25000" -> { ok: true, value: 25000 }; "" -> { ok: true, value: null }
  function parseAmount(text, { min = 0, max = 2147483647 } = {}) {
    const s = String(text).trim().replace(/[,\s_]/g, '');
    if (s === '') return { ok: true, value: null };
    if (!/^-?\d+$/.test(s)) return { ok: false, error: `"${text}" is not a whole number` };
    const v = Number(s);
    if (v < min || v > max) return { ok: false, error: `${group(v)} is outside ${group(min)} – ${group(max)}` };
    return { ok: true, value: v };
  }

  // chance on a given scale -> "0.0125%"
  function percent(value, scale) {
    const p = (value / scale) * 100;
    if (p === 0) return '0%';
    const digits = p >= 1 ? 2 : Math.min(8, Math.max(2, 1 - Math.floor(Math.log10(p)) + 2));
    return p.toFixed(digits).replace(/\.?0+$/, '') + '%';
  }

  FRE.num = { group, parseAmount, percent };
})(globalThis.FRE = globalThis.FRE || {});
