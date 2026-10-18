// Bot Check edits (AntiBot.inc: CRLF, tabs). A word line: ANTIBOT_ITEM<TAB><item define><TAB>"<word>"; a tuning line: KEY<TAB>value;
// a map: NO_CHECK_WORLD<TAB><world define>. New lines copy their neighbour's indent and EOL (textOps.insertRowAfter).
(function (FRE) {
  'use strict';
  const T = FRE.textOps, A = () => FRE.antiBot;
  function checkWord(m, w, exceptId) {
    if (typeof w !== 'string' || !w.length || w.length > 30) throw new Error('The word: 1 to 30 letters');
    if (/"/.test(w) || /[^\x20-\x7e]/.test(w)) throw new Error('The word: plain letters only, no "');
    if (m.lines.some(r => r.id !== exceptId && r.word.text.toLowerCase() === w.toLowerCase())) throw new Error(`"${w}" is already a word (any upper / lower case)`);
  }
  const wordRow = (define, w) => `ANTIBOT_ITEM\t${define}\t"${w}"`;
  const lastOf = list => list.reduce((a, b) => (b.start > a.start ? b : a));
  function addWord(text, m, id, define, w) {
    checkWord(m, w, null);
    if (m.lines.some(r => r.id === id) || m.skipped.some(r => r.id === id)) throw new Error('That item is already in the list');
    const all = [...m.lines, ...m.skipped];
    if (all.length) return T.insertRowAfter(text, lastOf(all), wordRow(define, w));
    return [{ start: text.length, end: text.length, insert: `${text.length && !text.endsWith('\n') ? m.eol : ''}${wordRow(define, w)}${m.eol}` }];
  }
  function editWord(text, m, rec, w) { checkWord(m, w, rec.id); return w === rec.word.text ? [] : [{ start: rec.word.start, end: rec.word.end, insert: `"${w}"` }]; }
  function changeItem(text, m, rec, define, id) {
    if (m.lines.some(r => r !== rec && r.id === id)) throw new Error('That item is already in the list');
    return [{ start: rec.item.start, end: rec.item.end, insert: define }];
  }
  const removeWord = (text, rec) => T.removeRow(text, rec);
  // a tuning value: the last line of the key is changed; no line = a new one after the last tuning line (else before the words)
  function setTune(text, m, key, v) {
    const k = A().BY.get(key);
    if (!k) throw new Error(`Unknown setting ${key}`);
    if (!(typeof v === 'number' && v >= k.min && v <= k.max && (k.float || Number.isInteger(v)))) throw new Error(`${k.label}: ${k.min} - ${k.max}${k.float ? '' : ', a whole number'}`);
    const out = k.float ? String(Number(Math.fround(v).toPrecision(6))) : String(v);
    const lines = m.tune[key].lines || [];
    if (lines.length) { const r = lastOf(lines); return [{ start: r.valueSpan.start, end: r.valueSpan.end, insert: out }]; }
    const tl = A().TUNING.flatMap(t => m.tune[t.key].lines || []);
    const row = `${key}\t${out}`;
    if (tl.length) return T.insertRowAfter(text, lastOf(tl), row);
    const first = [...m.lines, ...m.skipped].sort((a, b) => a.start - b.start)[0];
    if (first) { const ls = text.lastIndexOf('\n', first.start - 1) + 1; return [{ start: ls, end: ls, insert: `${row}${m.eol}` }]; }
    return [{ start: text.length, end: text.length, insert: `${text.length && !text.endsWith('\n') ? m.eol : ''}${row}${m.eol}` }];
  }
  function addWorld(text, m, define, id) {
    if (m.worlds.some(w => w.world === id)) throw new Error('That map is already in the list');
    const row = `NO_CHECK_WORLD\t${define}`;
    if (m.worlds.length) return T.insertRowAfter(text, lastOf(m.worlds), row);
    return setTuneAnchor(text, m, row);
  }
  function setTuneAnchor(text, m, row) {
    const tl = A().TUNING.flatMap(t => m.tune[t.key].lines || []);
    if (tl.length) return T.insertRowAfter(text, lastOf(tl), row);
    const first = [...m.lines, ...m.skipped].sort((a, b) => a.start - b.start)[0];
    if (first) { const ls = text.lastIndexOf('\n', first.start - 1) + 1; return [{ start: ls, end: ls, insert: `${row}${m.eol}` }]; }
    return [{ start: text.length, end: text.length, insert: `${row}${m.eol}` }];
  }
  function removeWorld(text, m, id) {
    const out = [];
    for (const w of [...m.worlds, ...m.errors.filter(e => e.world !== undefined)]) if (w.world === id) out.push(...T.removeRow(text, w));
    return out;
  }
  FRE.antiBotOps = { checkWord, wordRow, addWord, editWord, changeItem, removeWord, setTune, addWorld, removeWorld };
})(globalThis.FRE = globalThis.FRE || {});
