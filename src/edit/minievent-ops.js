// Mini Events edits (MiniEvent.inc; LF in git, CRLF on the Windows PC: new lines copy their neighbour's EOL and tabs).
// The file's own style (V19 25e4f227): "EVENT<TAB>COLORGAME<TAB>MIN_LEVEL 120<TAB>MIN_PLAYERS 5 ...", "RANK<TAB>COLORGAME<TAB>1<TAB>
// II_SYS_SYS_EVENT_TOKEN<TAB>30", "REST<TAB>COLORGAME<TAB>II_...<TAB>2", "POINTS<TAB>TYPER<TAB>15 12 10 8 7 6 5 4 3 2<TAB>1".
// A value changes only its own characters; a missing key is added at the end of the EVENT line; a new prize line goes right
// after the prize line above it (or after the EVENT / POINTS line).
(function (FRE) {
  'use strict';
  const T = FRE.textOps, M = () => FRE.miniEvent;

  function checkKey(type, key, v) {
    const k = M().KEY.get(key);
    if (!k) throw new Error(`Unknown setting ${key}`);
    const max = key === 'ROUND_TIME' ? M().roundMax(type) : k.max;
    if (!Number.isInteger(v) || v < k.min || v > max) throw new Error(`${k.label}: a whole number from ${k.min} to ${max}`);
  }

  function setKey(text, model, type, key, v) {
    checkKey(type, key, v);
    const e = model.events[type];
    const entry = e.keys[key];
    if (entry) return T.replaceSpan(entry.value, String(v));
    const line = e.lines[0];
    if (!line) throw new Error(`${e.name} has no EVENT line`);
    // the separator between two keys on that line (a tab in the file), else a tab
    let sep = '\t';
    if (line.keys.length >= 2) sep = text.slice(line.keys[0].value.end, line.keys[1].keyTok.start) || '\t';
    return [{ start: line.end, end: line.end, insert: `${sep}${key} ${v}` }];
  }

  const prizeRow = (e, place, define, amount) => place ? `RANK\t${e.key}\t${place}\t${define}\t${amount}` : `REST\t${e.key}\t${define}\t${amount}`;

  // place 1-10, or 0 = everyone else (REST). prize: { define, amount } or null (no prize: the line(s) are removed)
  function setPrize(text, model, type, place, prize, defines) {
    const e = model.events[type];
    const rows = place ? e.rankLines.filter(r => r.rank.value === place) : e.restLines;
    if (!prize) return rows.flatMap(r => T.removeRow(text, r));
    if (!/^II_[A-Z0-9_]+$/.test(prize.define || '') || !defines.has(prize.define)) throw new Error('Pick an item');
    if (!Number.isInteger(prize.amount) || prize.amount < 0 || prize.amount > 9999) throw new Error('The amount: 0 to 9999');
    if (rows.length) {
      const r = rows[rows.length - 1], out = [];
      if (text.slice(r.item.start, r.item.end) !== prize.define) out.push(...T.replaceSpan(r.item, prize.define));
      if (text.slice(r.amount.start, r.amount.end) !== String(prize.amount)) out.push(...T.replaceSpan(r.amount, prize.amount));
      return out;
    }
    // after the closest prize line above it in the file's order (RANK 1..10, then REST), else after the POINTS / EVENT line
    const above = [...e.rankLines.filter(r => !place || r.rank.value < place)].sort((a, b) => a.start - b.start);
    const anchor = above.length ? above.reduce((a, b) => (a.rank.value >= b.rank.value ? a : b)) : (e.points && e.points.start > e.lines[0].start ? e.points : e.lines[0]);
    if (!anchor) throw new Error(`${e.name} has no EVENT line`);
    return T.insertRowAfter(text, anchor, prizeRow(e, place, prize.define, prize.amount));
  }

  // values: [1st .. 10th, rest]
  function setPoints(text, model, type, values) {
    if (values.length !== 11 || values.some(v => !Number.isInteger(v) || v < 0 || v > 999)) throw new Error('Points: whole numbers from 0 to 999');
    const e = model.events[type];
    if (e.points) {
      const out = [];
      e.points.nums.forEach((n, i) => { if (text.slice(n.start, n.end) !== String(values[i])) out.push(...T.replaceSpan(n, values[i])); });
      return out;
    }
    return T.insertRowAfter(text, e.lines[0], `POINTS\t${e.key}\t${values.slice(0, 10).join(' ')}\t${values[10]}`);
  }

  // ---- questions (step 2). A text goes between quotes on one line: no ", no line break, printable ASCII (the file is ASCII)
  function checkText(v, what, min, max) {
    if (typeof v !== 'string') throw new Error(`${what}: text`);
    if (v.length < min || v.length > max) throw new Error(`${what}: ${min ? `${min} to ` : 'up to '}${max} letters (now ${v.length})`);
    if (/"/.test(v)) throw new Error(`${what}: no " inside (it would end the text early)`);
    if (/[^\x20-\x7e]/.test(v)) throw new Error(`${what}: plain letters only (no line breaks or special characters)`);
  }
  // q: Quick Hands { question, info } / O/X { truth: true (O) | false (X), question }
  function askLine(type, q) {
    if (type === 2) {
      checkText(q.question, 'The text to type', 1, FRE.miniEvent.ANSWER_LEN);
      checkText(q.info || '', 'The small line', 0, 120);
      return `ASK\tTYPER\t"${q.question}"\t"${q.info || ''}"`;
    }
    if (type === 3) {
      checkText(q.question, 'The statement', 1, 200);
      return `ASK\tOXQUIZ\t${q.truth ? 'O' : 'X'}\t"${q.question}"`;
    }
    throw new Error('Only Quick Hands and O/X Quiz have questions');
  }
  // a new question after the last one of that event (else after its last prize / POINTS / EVENT line)
  function addAsk(text, model, type, q) {
    const row = askLine(type, q), e = model.events[type];
    const anchor = e.asks.length ? e.asks[e.asks.length - 1]
      : [...e.lines, ...e.rankLines, ...e.restLines, ...(e.points ? [e.points] : [])].sort((a, b) => b.start - a.start)[0];
    if (!anchor) throw new Error(`${e.name} has no EVENT line`);
    return T.insertRowAfter(text, anchor, row);
  }
  // change a question in place: only the parts that differ (the quotes stay)
  function editAsk(text, ask, type, q) {
    askLine(type, q);
    const out = [];
    const put = (tok, v, quote) => { if (tok && tok.text !== v) out.push({ start: tok.start, end: tok.end, insert: quote ? `"${v}"` : v }); };
    if (type === 3) put(ask.truth, q.truth ? 'O' : 'X', false);
    put(ask.question, q.question, true);                    // a new text is always written in quotes (spaces)
    if (type === 2) put(ask.info, q.info || '', true);
    return out;
  }
  const removeAsk = (text, ask) => T.removeRow(text, ask);

  FRE.miniEventOps = { askLine, addAsk, editAsk, removeAsk, checkText, setKey, setPrize, setPoints, checkKey, prizeRow };
})(globalThis.FRE = globalThis.FRE || {});
