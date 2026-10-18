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

  FRE.miniEventOps = { setKey, setPrize, setPoints, checkKey, prizeRow };
})(globalThis.FRE = globalThis.FRE || {});
