// Shop edits expressed as minimal splices on a SourceFile's current text
// (docs/DESIGN.md §1.5). Each function returns [{start, end, insert}] and
// never touches bytes outside the statement being changed.
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

  function formatStmt(cmd, args, text) {
    // follow the file's existing spacing for this command: "Cmd( a, b );" vs "Cmd(a, b);"
    const re = new RegExp(cmd + '\\s*\\(( ?)');
    const m = re.exec(text);
    const pad = m ? m[1] : ' ';
    return `${cmd}(${pad}${args.join(', ')}${pad});`;
  }

  function checkCost(cost) {
    if (!Number.isInteger(cost) || cost < 0 || cost > 2147483647) throw new Error('price must be a whole number between 0 and 2,147,483,647');
  }
  function checkDefine(name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`"${name}" is not a valid define name`);
  }

  // Add a fixed item (AddShopItem) or, for chip shops, AddVenderItem2.
  function addItem(text, npc, slot, define, cost) {
    checkDefine(define);
    if (!(slot >= 0 && slot <= 3)) throw new Error('tab must be 0-3');
    const chip = npc.venderType === 1 || npc.venderType === 2;
    let stmt;
    if (chip) stmt = formatStmt('AddVenderItem2', [slot, define], text);
    else {
      const args = [slot, define];
      if (cost !== null && cost !== undefined) { checkCost(cost); args.push(cost); }
      stmt = formatStmt('AddShopItem', args, text);
    }

    // anchor: last shop statement in the same tab, else any shop statement,
    // else the last AddMenu, else the opening brace.
    const shop = npc.statements.filter(r => FRE.character.shopEntry(r));
    const sameTab = shop.filter(r => r.args.slot && r.args.slot.value === slot);
    const anchor = sameTab[sameTab.length - 1] || shop[shop.length - 1]
      || npc.statements.filter(r => r.cmd === 'AddMenu').pop() || null;

    if (anchor) {
      const ext = stmtExtent(text, anchor);
      if (restOfLineIsFree(text, ext.end)) {
        const at = lineEnd(text, ext.end);
        let eol = eolAt(text, ext.end);
        let prefix = '';
        if (!eol) { eol = dominantEol(text); prefix = eol; }   // anchor is on the last line
        return [{ start: at, end: at, insert: prefix + indentOf(text, anchor.start) + stmt + (prefix ? '' : eol) }];
      }
      return [{ start: ext.end, end: ext.end, insert: ' ' + stmt }];
    }
    const b = npc.braceTok;
    const at = lineEnd(text, b.end);
    const eol = eolAt(text, b.end) || dominantEol(text);
    return [{ start: at, end: at, insert: indentOf(text, b.start) + '\t' + stmt + eol }];
  }

  function removeStatement(text, rec) {
    const ext = stmtExtent(text, rec);
    if (prefixIsBlank(text, ext.start) && restOfLineIsFree(text, ext.end)) {
      return [{ start: lineStart(text, ext.start), end: lineEnd(text, ext.end), insert: '' }];
    }
    // shares its line with something else: remove only the statement (and one space before it)
    let s = ext.start;
    if (s > 0 && isSpace(text[s - 1]) && !prefixIsBlank(text, s)) s--;
    return [{ start: s, end: ext.end, insert: '' }];
  }

  function setCost(text, rec, cost) {
    if (rec.cmd !== 'AddShopItem') throw new Error('only AddShopItem entries have a price');
    if (cost === null) {
      if (!rec.args.cost) return [];
      const comma = rec.seps.find(s => s.expect === ', or )');
      return [{ start: comma.start, end: rec.args.cost.end, insert: '' }];
    }
    checkCost(cost);
    if (rec.args.cost) return [{ start: rec.args.cost.start, end: rec.args.cost.end, insert: String(cost) }];
    const it = rec.args.item;
    return [{ start: it.end, end: it.end, insert: `, ${cost}` }];
  }

  function setSlot(text, rec, slot) {
    if (!(slot >= 0 && slot <= 3)) throw new Error('tab must be 0-3');
    const a = rec.args.slot;
    return [{ start: a.start, end: a.end, insert: String(slot) }];
  }

  FRE.shopOps = { addItem, removeStatement, setCost, setSlot, stmtExtent, _internal: { lineStart, lineEnd, eolAt, indentOf } };
})(globalThis.FRE = globalThis.FRE || {});
