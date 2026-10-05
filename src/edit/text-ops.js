// Line/statement helpers shared by every editor. All functions work on the
// current text and return splices [{start, end, insert}]; nothing outside the
// touched statement or row changes. New rows copy the anchor row's indent and
// line ending (some files are CRLF, some LF).
(function (FRE) {
  'use strict';

  const isSpace = c => c === ' ' || c === '\t';

  function lineStart(text, i) {
    while (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') i--;
    return i;
  }
  function lineContentEnd(text, i) {
    while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
    return i;
  }
  function lineEnd(text, i) {
    i = lineContentEnd(text, i);
    if (text[i] === '\r') { i++; if (text[i] === '\n') i++; }
    else if (text[i] === '\n') i++;
    return i;
  }
  function eolAt(text, i) {
    const c = lineContentEnd(text, i);
    if (text[c] === '\r') return text[c + 1] === '\n' ? '\r\n' : '\r';
    if (text[c] === '\n') return '\n';
    return '';
  }
  function dominantEol(text) {
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/\n/g) || []).length - crlf;
    return crlf >= lf ? '\r\n' : '\n';
  }
  function indentOf(text, i) {
    const s = lineStart(text, i);
    let e = s;
    while (e < text.length && isSpace(text[e])) e++;
    return text.slice(s, e);
  }

  // Statement span plus a trailing ';' on the same line (the server skips ';').
  function stmtExtent(text, rec) {
    let e = rec.end;
    let k = e;
    while (k < text.length && isSpace(text[k])) k++;
    if (text[k] === ';') e = k + 1;
    return { start: rec.start, end: e };
  }

  // True if only whitespace or a // comment follows `end` on its line.
  function restOfLineIsFree(text, end) {
    let k = end;
    const ce = lineContentEnd(text, end);
    while (k < ce && isSpace(text[k])) k++;
    return k === ce || text.startsWith('//', k);
  }
  function prefixIsBlank(text, start) {
    const s = lineStart(text, start);
    for (let k = s; k < start; k++) if (!isSpace(text[k])) return false;
    return true;
  }

  // Insert `row` as a new line after the line holding `anchor` ({start, end}).
  // If something else follows the anchor on its line, insert inline instead.
  function insertRowAfter(text, anchor, row) {
    const ext = stmtExtent(text, anchor);
    if (restOfLineIsFree(text, ext.end)) {
      const at = lineEnd(text, ext.end);
      let eol = eolAt(text, ext.end);
      let prefix = '';
      if (!eol) { eol = dominantEol(text); prefix = eol; }        // anchor is on the last line
      return [{ start: at, end: at, insert: prefix + indentOf(text, anchor.start) + row + (prefix ? '' : eol) }];
    }
    return [{ start: ext.end, end: ext.end, insert: ' ' + row }];
  }

  // Insert `row` on a new line right after the line containing offset `pos`
  // (e.g. an opening brace), indented one tab deeper than that line.
  function insertRowBelowLine(text, pos, row) {
    const at = lineEnd(text, pos);
    const eol = eolAt(text, pos) || dominantEol(text);
    return [{ start: at, end: at, insert: indentOf(text, pos) + '\t' + row + eol }];
  }

  // Remove a statement/row; whole line(s) if it stands alone, else just its span.
  function removeRow(text, rec) {
    const ext = stmtExtent(text, rec);
    if (prefixIsBlank(text, ext.start) && restOfLineIsFree(text, ext.end)) {
      return [{ start: lineStart(text, ext.start), end: lineEnd(text, ext.end), insert: '' }];
    }
    let s = ext.start;
    if (s > 0 && isSpace(text[s - 1]) && !prefixIsBlank(text, s)) s--;
    return [{ start: s, end: ext.end, insert: '' }];
  }

  // Replace one token or value span ({start, end}).
  function replaceSpan(span, insert) { return [{ start: span.start, end: span.end, insert: String(insert) }]; }

  function checkDefine(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`"${name}" is not a valid define name`);
  }
  function checkAmount(v, min = 0, max = 2147483647, what = 'value') {
    if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${what} must be a whole number between ${FRE.num.group(min)} and ${FRE.num.group(max)}`);
  }

  FRE.textOps = {
    lineStart, lineContentEnd, lineEnd, eolAt, dominantEol, indentOf, stmtExtent, restOfLineIsFree, prefixIsBlank,
    insertRowAfter, insertRowBelowLine, removeRow, replaceSpan, checkDefine, checkAmount,
  };
})(globalThis.FRE = globalThis.FRE || {});
