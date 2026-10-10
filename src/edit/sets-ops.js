// Set effect edits (task G part 1) as minimal splices. propItemEtc.inc and propItemEtc.txt.txt are UTF-16LE + BOM,
// CRLF (SourceFile re-encodes; only the splices change); expTable.inc is CP949, CRLF (ASCII inserts only).
//   A piece is a row `ITEM\t\tPARTS_X` in Elem, a bonus `DST_X\t\tadj\tpieces` in Avail (the file's own style: rows indented
//   two tabs); a new row copies the indent and line ending of the row it goes under (FRE.textOps).
//   A new set is a block in the file's style after the last SetItem (blank line above), with id = the highest + 1 and a
//   new name key IDS_PROPITEMETC_INC_<n> (the highest + 1) appended to propItemEtc.txt.txt.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const S = () => FRE.sets;
  const KEY_RE = /^IDS_PROPITEMETC_INC_(\d+)$/;

  function checkName(name) {
    const v = String(name || '').replace(/[\t\r\n]+/g, ' ').trim();
    if (!v) throw new Error('The set needs a name');
    if (v.length >= S().MAX_NAME) throw new Error(`A set name has at most ${S().MAX_NAME - 1} characters (the server copies it into a 64-byte field)`);
    return v;
  }
  function checkRow(r, named = true) {
    if (!r.dst || (named && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(r.dstName || ''))) throw new Error('Pick a stat');
    if (!Number.isInteger(r.adj) || r.adj < -2147483647 || r.adj > 2147483647) throw new Error('The amount must be a whole number');
    T.checkAmount(r.need, 1, S().MAX_ELEM, 'Pieces needed');
  }

  // ---------------------------------------------------------------- bonus rows (Avail)
  // v: { dst, dstName, adj, need }: only the given fields change
  function setRow(row, v) {
    const n = { dst: row.dst, dstName: row.dstDefine, adj: row.adj, need: row.need, ...v };
    checkRow(n, v.dst !== undefined && v.dst !== row.dst);
    const out = [];
    if (v.dst !== undefined && v.dst !== row.dst) out.push(...T.replaceSpan(row.spans.dst, n.dstName));
    if (v.adj !== undefined && v.adj !== row.adj) out.push(...T.replaceSpan(row.spans.adj, n.adj));
    if (v.need !== undefined && v.need !== row.need) out.push(...T.replaceSpan(row.spans.need, n.need));
    return out;
  }
  const rowText = r => `${r.dstName}\t\t${r.adj}\t${r.need}`;
  // the file lists rows from most pieces to fewest (4, 3, 3, 2): a new row goes after the last row needing as many or more
  function addRow(text, set, r) {
    checkRow(r);
    if (set.rows.length >= S().MAX_AVAIL) throw new Error(`A set holds at most ${S().MAX_AVAIL} bonus rows`);
    const avail = set.blocks.find(b => b.kind === 'Avail');
    if (!avail) return newBlock(text, set, 'Avail', rowText(r));
    const kept = set.rows.filter(x => x.block === avail);
    const after = kept.filter(x => x.need >= r.need).pop();
    if (after) return T.insertRowAfter(text, after, rowText(r));
    if (kept.length) {
      const first = kept[0], at = T.lineStart(text, first.start);
      return [{ start: at, end: at, insert: T.indentOf(text, first.start) + rowText(r) + (T.eolAt(text, first.start) || T.dominantEol(text)) }];
    }
    return T.insertRowBelowLine(text, avail.open.start, rowText(r));
  }
  function removeRow(text, row) { return T.removeRow(text, row); }

  // ---------------------------------------------------------------- pieces (Elem)
  function checkPiece(p, needPart = true) {
    T.checkDefine(p.define);
    if (needPart && !/^PARTS_[A-Z0-9_]+$/.test(p.partName || '')) throw new Error('Pick the slot the piece is worn in');
  }
  const pieceText = p => `${p.define}\t\t${p.partName}`;
  function addPiece(text, set, p) {
    checkPiece(p);
    if (set.pieces.length >= S().MAX_ELEM) throw new Error(`A set holds at most ${S().MAX_ELEM} pieces`);
    const elem = set.blocks.find(b => b.kind === 'Elem');
    if (!elem) return newBlock(text, set, 'Elem', pieceText(p));
    const last = set.pieces.filter(x => x.block === elem).pop();
    if (last) return T.insertRowAfter(text, last, pieceText(p));
    return T.insertRowBelowLine(text, elem.open.start, pieceText(p));
  }
  function setPiece(piece, v) {
    const n = { define: piece.define || String(piece.id), partName: piece.partDefine, ...v };
    checkPiece(n, v.partName !== undefined && v.partName !== piece.partDefine);
    const out = [];
    if (v.define !== undefined && v.define !== piece.define) out.push(...T.replaceSpan(piece.spans.item, n.define));
    if (v.partName !== undefined && v.partName !== piece.partDefine) out.push(...T.replaceSpan(piece.spans.part, n.partName));
    return out;
  }
  function removePiece(text, piece) { return T.removeRow(text, piece); }

  // an Elem / Avail block that is missing: `\tElem\r\n\t{\r\n\t\t<row>\r\n\t}` (Elem first, Avail after it)
  function newBlock(text, set, kind, row) {
    const eol = T.eolAt(text, set.open.start) || T.dominantEol(text);
    const lines = `\t${kind}${eol}\t{${eol}\t\t${row}${eol}\t}${eol}`;
    const elem = set.blocks.find(b => b.kind === 'Elem');
    if (kind === 'Avail' && elem) { const at = T.lineEnd(text, elem.close.start); return [{ start: at, end: at, insert: lines }]; }
    const at = T.lineEnd(text, set.open.start);
    return [{ start: at, end: at, insert: lines }];
  }

  // ---------------------------------------------------------------- names (propItemEtc.txt.txt)
  // the highest IDS_PROPITEMETC_INC_ number in either file, + 1, as 6 digits
  function nextKey(etcText, txtText) {
    let hi = -1;
    for (const t of [etcText || '', txtText || '']) for (const m of t.matchAll(/IDS_PROPITEMETC_INC_(\d+)/g)) hi = Math.max(hi, Number(m[1]));
    return `IDS_PROPITEMETC_INC_${String(hi + 1).padStart(6, '0')}`;
  }
  // a new line `KEY\tname` at the end of propItemEtc.txt.txt (the file ends without a line break: keep it so)
  function appendLine(txtText, key, name) {
    const eol = T.dominantEol(txtText || '\r\n');
    const t = txtText || '';
    const ends = /(\r\n|\n|\r)$/.test(t);
    return [{ start: t.length, end: t.length, insert: (t.length && !ends ? eol : '') + `${key}\t${name}` + (ends ? eol : '') }];
  }
  // how many times the key stands as a token in propItemEtc.inc (a key used twice gets a new one on rename)
  const keyUses = (etcText, key) => (etcText.match(new RegExp(`(^|[^A-Za-z0-9_])${key}(?![A-Za-z0-9_])`, 'g')) || []).length;

  // -> [{ file, splices }]: the name line changes in place; a key with no line, or used by something else too, gets a new key
  function renamePlan(model, etcText, txtText, set, name) {
    const v = checkName(name);
    if (v === set.name) return [];
    if (txtText === null || txtText === undefined) throw new Error('propItemEtc.txt.txt is not in the folder: the set names live there');
    const meta = model.strings.meta.get(set.nameKey);
    const own = meta && meta.file && meta.file.toLowerCase() === S().ETC_TXT.toLowerCase();
    if (own && KEY_RE.test(set.nameKey) && keyUses(etcText, set.nameKey) === 1)
      return [{ file: 'propitemetc.txt.txt', splices: [{ start: meta.start, end: meta.end, insert: v }] }];
    const key = nextKey(etcText, txtText);
    return [{ file: 'propitemetc.inc', splices: T.replaceSpan(set.nameSpan, key) }, { file: 'propitemetc.txt.txt', splices: appendLine(txtText, key, v) }];
  }

  // ---------------------------------------------------------------- + New set
  // spec: { name, pieces: [{ define, partName }], rows: [{ dst, dstName, adj, need }] } -> { id, key, parts: [{ file, splices }] }
  function newSetPlan(model, etcText, txtText, spec) {
    const name = checkName(spec.name);
    if (txtText === null || txtText === undefined) throw new Error('propItemEtc.txt.txt is not in the folder: the set names live there');
    const pieces = spec.pieces || [], rows = spec.rows || [];
    if (pieces.length < 1) throw new Error('A set needs at least one piece');
    if (pieces.length > S().MAX_ELEM) throw new Error(`A set holds at most ${S().MAX_ELEM} pieces`);
    if (rows.length > S().MAX_AVAIL) throw new Error(`A set holds at most ${S().MAX_AVAIL} bonus rows`);
    pieces.forEach(checkPiece);
    rows.forEach(checkRow);
    const last = model.sets[model.sets.length - 1];
    if (!last || !last.close) throw new Error('propItemEtc.inc has no complete SetItem block to add after');
    if (model.hang) throw new Error('propItemEtc.inc has a broken set (see the checks): fix it first');
    const id = Math.max(...model.sets.map(s => s.id)) + 1;
    const key = nextKey(etcText, txtText);
    const eol = T.eolAt(etcText, last.close.start) || T.dominantEol(etcText);
    // the rows from most pieces to fewest, like the file
    const sorted = rows.map((r, i) => [r, i]).sort((a, b) => b[0].need - a[0].need || a[1] - b[1]).map(x => x[0]);
    const block = [`SetItem\t\t${id}\t${key}`, '{', '\tElem', '\t{', ...pieces.map(p => '\t\t' + pieceText(p)), '\t}',
      '\tAvail', '\t{', ...sorted.map(r => '\t\t' + rowText(r)), '\t}', '}'].join(eol) + eol;
    const at = T.lineEnd(etcText, last.close.start), e0 = T.eolAt(etcText, last.close.start);
    return { id, key, parts: [
      { file: 'propitemetc.inc', splices: [{ start: at, end: at, insert: (e0 ? '' : eol) + eol + block }] },
      { file: 'propitemetc.txt.txt', splices: appendLine(txtText, key, name) },
    ] };
  }

  // ---------------------------------------------------------------- the +N table (expTable.inc Setitem)
  function setPlus(plus, row, col, value) {
    const r = plus.rows[row];
    if (!r) throw new Error(`The +N table has no row +${row + 1}`);
    const k = S().PLUS_COLS.indexOf(col);
    if (k < 0) throw new Error('Unknown column');
    T.checkAmount(value, 0, 2147483647, 'The value');
    return T.replaceSpan(r.cells[k], value);
  }

  FRE.setsOps = { setRow, addRow, removeRow, addPiece, setPiece, removePiece, renamePlan, newSetPlan, setPlus, nextKey, appendLine, keyUses, checkName, rowText, pieceText };
})(globalThis.FRE = globalThis.FRE || {});
