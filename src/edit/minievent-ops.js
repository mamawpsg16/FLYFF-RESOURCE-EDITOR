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

  // ---- Turn-in Race (step 3): RECIPE "<title>" <n> <item> <amount> ... and ITEM_HINT <item> "<text>"
  // r = { title, items: [[id, amount], ...] }; keyOf(id) -> the item's define, nameOf(id) -> its name (for the // comment)
  function checkRecipe(r, itemOk) {
    checkText(r.title, 'The title', 1, 60);
    if (!r.items.length || r.items.length > M().RECIPE_ITEMS) throw new Error(`A recipe has 1 - ${M().RECIPE_ITEMS} items`);
    const seen = new Set();
    for (const [id, n] of r.items) {
      if (!itemOk(id)) throw new Error(`Item ${id} does not exist`);
      if (!Number.isInteger(n) || n < 1 || n > 9999) throw new Error('Each amount is a whole number from 1 to 9,999');
      if (seen.has(id >>> 0)) throw new Error('The same item twice: change its amount instead');
      seen.add(id >>> 0);
    }
  }
  const recipeRow = (r, keyOf, nameOf) => `RECIPE\t"${r.title}"\t${r.items.length}\t${r.items.map(([id, n]) => `${keyOf(id)} ${n}`).join(' ')}\t// ${r.items.map(([id, n]) => `${n} ${nameOf(id)}`).join(', ').replace(/[^\x20-\x7e]/g, '?')}`;
  const hintRow = (id, t, keyOf) => `ITEM_HINT\t${keyOf(id)}\t"${t}"`;
  const contentEnd = (text, i) => { let k = text.indexOf('\n', i); if (k < 0) k = text.length; if (k > 0 && text[k - 1] === '\r') k--; return k; };
  const lineStartOf = (text, i) => text.lastIndexOf('\n', i - 1) + 1;
  // where new RECIPE lines go: after the last one, else after the Turn-in Race's last EVENT / POINTS / RANK / REST line
  function recipeAnchor(model) {
    const e = model.events[5];
    const all = [...e.recipes, ...e.lines, ...e.rankLines, ...e.restLines, ...(e.points ? [e.points] : [])];
    const anchor = e.recipes.length ? e.recipes[e.recipes.length - 1] : all.sort((a, b) => b.start - a.start)[0];
    if (!anchor) throw new Error('Turn-in Race has no EVENT line');
    return anchor;
  }
  function insertRows(text, model, anchor, rows) {
    if (!rows.length) return [];
    return T.insertRowAfter(text, anchor, rows.join(model.eol));
  }
  function addRecipe(text, model, r, ctx) {
    checkRecipe(r, ctx.itemOk);
    return insertRows(text, model, recipeAnchor(model), [recipeRow(r, ctx.keyOf, ctx.nameOf)]);
  }
  // the whole line is written again (its // comment too: it names the items)
  function editRecipe(text, recipe, r, ctx) {
    checkRecipe(r, ctx.itemOk);
    return [{ start: recipe.start, end: contentEnd(text, recipe.end), insert: recipeRow(r, ctx.keyOf, ctx.nameOf) }];
  }
  const removeRecipe = (text, recipe) => T.removeRow(text, recipe);
  // many recipes at once: mode 'add' = after the last one; 'replace' = instead of every RECIPE line (one undo step)
  function putRecipes(text, model, list, ctx, mode) {
    list.forEach(r => checkRecipe(r, ctx.itemOk));
    const rows = list.map(r => recipeRow(r, ctx.keyOf, ctx.nameOf));
    const old = model.events[5].recipes;
    if (mode !== 'replace' || !old.length) return insertRows(text, model, recipeAnchor(model), rows);
    const first = old[0], out = [{ start: lineStartOf(text, first.start), end: contentEnd(text, first.end), insert: rows.join(model.eol) }];
    for (const r of old.slice(1)) out.push(...T.removeRow(text, r));
    return out;
  }

  function checkHint(t) { checkText(t, 'The hint', 0, 100); }
  function hintAnchor(model) {
    if (model.hints.length) return model.hints.reduce((a, b) => (b.start > a.start ? b : a));
    return recipeAnchor(model);
  }
  // the hint of an item: the last ITEM_HINT line of it is the one the server keeps (mapItemHint[dwItem] = ..., :337)
  const hintOf = (model, id) => { let h = null; for (const x of model.hints) if (x.id === (id >>> 0)) h = x; return h; };
  function setHint(text, model, id, t, keyOf) {
    checkHint(t);
    const h = hintOf(model, id);
    if (h) return h.text.text === t ? [] : [{ start: h.text.start, end: h.text.end, insert: `"${t}"` }];
    return insertRows(text, model, hintAnchor(model), [hintRow(id, t, keyOf)]);
  }
  // every ITEM_HINT line of the item goes
  function removeHint(text, model, id) {
    const out = [];
    for (const x of model.hints) if (x.id === (id >>> 0)) out.push(...T.removeRow(text, x));
    return out;
  }
  // many hints at once: only items without one (a hint already in the file is never changed); map id -> text
  function addHints(text, model, map, keyOf) {
    const rows = [];
    for (const [id, t] of map) { if (hintOf(model, id)) continue; checkHint(t); rows.push(hintRow(id, t, keyOf)); }
    return insertRows(text, model, hintAnchor(model), rows);
  }

  // ---- Hide and Seek (step 4): SPOT <x> <z> "<region>" "<hint>" "<landmark>" (x / z written as whole numbers, above 0)
  function checkSpot(sp) {
    for (const k of ['x', 'z']) if (!Number.isInteger(sp[k]) || sp[k] <= 0 || sp[k] > 99999) throw new Error(`${k} must be a whole number above 0`);
    checkText(sp.region, 'The region', 1, 60);
    checkText(sp.hint || '', 'The hint', 0, 120);
    checkText(sp.landmark || '', 'The landmark', 0, 60);
  }
  const spotRow = sp => `SPOT\t${sp.x}\t${sp.z}\t"${sp.region}"\t"${sp.hint || ''}"\t"${sp.landmark || ''}"`;
  function spotAnchor(model) {
    const e = model.events[6];
    if (e.spots.length) return e.spots.reduce((a, b) => (b.start > a.start ? b : a));
    const all = [...e.lines, ...e.rankLines, ...e.restLines, ...(e.points ? [e.points] : []), ...(model.hideNpc ? [model.hideNpc] : [])];
    const a = all.sort((x, y) => y.start - x.start)[0];
    if (!a) throw new Error('Hide and Seek has no EVENT line');
    return a;
  }
  function addSpot(text, model, sp) { checkSpot(sp); return insertRows(text, model, spotAnchor(model), [spotRow(sp)]); }
  // the record from SPOT to its landmark is written again; a comment after it (// /hidespot by ...) stays
  function editSpot(text, spot, sp) { checkSpot(sp); return [{ start: spot.start, end: spot.end, insert: spotRow(sp) }]; }
  const removeSpot = (text, spot) => T.removeRow(text, spot);

  // ---- the week (step 5): BEGIN <EVENT | RANDOM> <day 0-7> <hour 0-23> <minute 0-59> (the file writes minutes as 2 digits)
  // b = { type: 0 (RANDOM) | 1-7, day, hour, minute }
  function checkBegin(model, b) {
    if (!Number.isInteger(b.day) || b.day < 0 || b.day > 7) throw new Error('Day: every day, or Sunday - Saturday');
    if (!Number.isInteger(b.hour) || b.hour < 0 || b.hour > 23) throw new Error('Hour: 0 - 23');
    if (!Number.isInteger(b.minute) || b.minute < 0 || b.minute > 59) throw new Error('Minute: 0 - 59');
    if (b.type && !(model.events[b.type] && model.events[b.type].loaded)) throw new Error('That event has no EVENT line: the server would switch Mini Events off');
  }
  const beginRow = b => `BEGIN\t${b.type ? M().TYPES[b.type].key : 'RANDOM'}\t${b.day}\t${b.hour}\t${String(b.minute).padStart(2, '0')}`;
  function addBegin(text, model, b) {
    checkBegin(model, b);
    if (model.begins.length) return insertRows(text, model, model.begins.reduce((a, x) => (x.start > a.start ? x : a)), [beginRow(b)]);
    const eol = model.eol, end = text.length, nl = end && !text.endsWith('\n') ? eol : '';
    return [{ start: end, end, insert: `${nl}${beginRow(b)}${eol}` }];
  }
  function editBegin(text, model, begin, b) { checkBegin(model, b); return [{ start: begin.start, end: begin.end, insert: beginRow(b) }]; }
  const removeBegin = (text, begin) => T.removeRow(text, begin);

  // ---- Vagrant Race: RACE_START <x> <z> (V19 ce1659f6, not yet built). Written with up to 1 decimal; above 0; inside WdRace when
  // the editor knows its size (VecInWorld). The line is changed in place, else a new one goes after the race's POINTS / EVENT line.
  const coord = v => String(Math.round(v * 10) / 10);
  function checkRaceStart(model, x, z) {
    for (const [k, v] of [['x', x], ['z', z]]) if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 99999) throw new Error(`${k}: a number above 0`);
    const w = model.raceWorld;
    if (w && !M().vecInWorld(w, Math.fround(Number(coord(x))), Math.fround(Number(coord(z))))) throw new Error(`${coord(x)}, ${coord(z)} is outside WdRace (0 - ${(128 * w.w - 1) * w.mpu} by 0 - ${(128 * w.h - 1) * w.mpu}): the server would switch Mini Events off`);
  }
  function setRaceStart(text, model, x, z) {
    checkRaceStart(model, x, z);
    const rs = model.raceStart, X = coord(x), Z = coord(z);
    if (rs) {
      const out = [];
      if (text.slice(rs.x.start, rs.x.end) !== X) out.push({ start: rs.x.start, end: rs.x.end, insert: X });
      if (text.slice(rs.z.start, rs.z.end) !== Z) out.push({ start: rs.z.start, end: rs.z.end, insert: Z });
      return out;
    }
    const e = model.events[7];
    const anchor = [...e.lines, ...(e.points ? [e.points] : [])].sort((a, b) => b.start - a.start)[0];
    if (!anchor) throw new Error('Vagrant Race has no EVENT line');
    return T.insertRowAfter(text, anchor, `RACE_START\t${X}\t${Z}`);
  }

  // RACE_POINT <x> <z> checkpoints (V19 321d3c1b), in route order: a new one goes after the last one (else after RACE_START, else after
  // the race's EVENT / POINTS line); a change rewrites its two numbers; a remove takes the line (a comment after it goes too)
  function checkRacePoint(model, x, z) { checkRaceStart(model, x, z); }
  function addRacePoint(text, model, x, z) {
    checkRacePoint(model, x, z);
    const e = model.events[7], pts = model.racePoints;
    const anchor = pts.length ? pts[pts.length - 1] : model.raceStart || [...e.lines, ...(e.points ? [e.points] : [])].sort((a, b) => b.start - a.start)[0];
    if (!anchor) throw new Error('Vagrant Race has no EVENT line');
    return T.insertRowAfter(text, anchor, `RACE_POINT\t${coord(x)}\t${coord(z)}`);
  }
  function editRacePoint(text, model, rp, x, z) {
    checkRacePoint(model, x, z);
    const out = [], X = coord(x), Z = coord(z);
    if (text.slice(rp.x.start, rp.x.end) !== X) out.push({ start: rp.x.start, end: rp.x.end, insert: X });
    if (text.slice(rp.z.start, rp.z.end) !== Z) out.push({ start: rp.z.start, end: rp.z.end, insert: Z });
    return out;
  }
  const removeRacePoint = (text, rp) => T.removeRow(text, rp);

  FRE.miniEventOps = { checkRaceStart, setRaceStart, checkRacePoint, addRacePoint, editRacePoint, removeRacePoint, checkBegin, beginRow, addBegin, editBegin, removeBegin, checkSpot, spotRow, addSpot, editSpot, removeSpot, askLine, addAsk, editAsk, removeAsk, checkText, setKey, setPrize, setPoints, checkKey, prizeRow,
    checkRecipe, recipeRow, hintRow, addRecipe, editRecipe, removeRecipe, putRecipes, checkHint, hintOf, setHint, removeHint, addHints };
})(globalThis.FRE = globalThis.FRE || {});
