// Equalized PvP edits (task "PvP Events") as splices: EqualizedPvP.inc (ASCII, CRLF) and EqualizedPresets.inc (ASCII, CRLF).
// A changed number replaces only its token; an item is one line ITEM … rewritten whole (its indent and the line end stay); new lines
// copy the indent of the brace they go under and the file's own EOL. Only ASCII is written (define names, numbers, the words the
// server reads). The readers are loaders/equalized.js.
(function (FRE) {
  'use strict';
  const T = FRE.textOps, E = () => FRE.equalized;

  // ---------------------------------------------------------------- EqualizedPvP.inc
  function eventLine(word, on, caps) { return `${word}\t${on ? 1 : 0}\t${caps.join('\t')}`; }
  function appendLine(text, row) {
    const eol = T.dominantEol(text);
    return [{ start: text.length, end: text.length, insert: (text.length && !/[\r\n]$/.test(text) ? eol : '') + row + eol }];
  }
  function setOn(ev, text, event, on) {
    if (ev.failed) throw new Error('EqualizedPvP.inc does not load (see the problems): fix it first');
    const x = ev.events[event];
    if (!x) throw new Error(`Unknown event ${event}`);
    if (x.line) return T.replaceSpan(x.line.on, on ? 1 : 0);
    return appendLine(text, eventLine(event, on, x.caps));
  }
  function setCap(ev, text, event, c, v) {
    if (ev.failed) throw new Error('EqualizedPvP.inc does not load (see the problems): fix it first');
    const x = ev.events[event];
    if (!x) throw new Error(`Unknown event ${event}`);
    T.checkAmount(v, 0, 999, `The ${E().CLASSES[c].label} limit`);
    if (x.line) return T.replaceSpan(x.line.caps[c], v);
    const caps = x.caps.slice(); caps[c] = v;
    return appendLine(text, eventLine(event, x.on, caps));
  }

  // ---------------------------------------------------------------- EqualizedPresets.inc
  // spec: { item: 'II_…', upgrade, elem (0 none, 1-5 = FIRE…EARTH), elemLv, awakes: [{ dst: 'DST_…', adj }], cards: ['II_…'], count }
  function itemLine(spec) {
    if (spec && spec.raisedPet) { T.checkDefine(spec.raisedPet); return `RAISEDPET ${spec.raisedPet}`; }
    if (!spec || !spec.item) throw new Error('Pick an item first');
    T.checkDefine(spec.item);
    let s = `ITEM ${spec.item}`;
    if (spec.upgrade) { T.checkAmount(spec.upgrade, 0, 20, 'The upgrade'); s += `\tUPGRADE ${spec.upgrade}`; }
    if (spec.elem) {
      if (!(spec.elem >= 1 && spec.elem <= 5)) throw new Error('Unknown element');
      T.checkAmount(spec.elemLv || 0, 0, 20, 'The element level');
      s += `\tELEMENT ${E().ELEMENTS[spec.elem - 1]} ${spec.elemLv || 0}`;
    }
    const aw = (spec.awakes || []).filter(a => a && a.dst);
    if (aw.length > 3) throw new Error('At most 3 awakes');
    for (const a of aw) { T.checkDefine(a.dst); T.checkAmount(a.adj, -2147483647, 2147483647, 'The awake value'); s += `\tAWAKE ${a.dst} ${a.adj}`; }
    for (const c of (spec.cards || []).filter(Boolean)) { T.checkDefine(c); s += `\tCARD ${c}`; }
    if (spec.ultimate) s += '\tULTIMATE';
    const runes = (spec.runes || []).filter(Boolean), jewels = (spec.jewels || []).filter(Boolean);
    if (runes.length > 3) throw new Error('At most 3 runes');
    if (jewels.length > 5) throw new Error('At most 5 jewels');
    for (const r of runes) { T.checkDefine(r); s += `\tRUNE ${r}`; }
    for (const j of jewels) { T.checkDefine(j); s += `\tJEWEL ${j}`; }
    if (spec.count && spec.count > 1) { T.checkAmount(spec.count, 1, 32767, 'The amount'); s += `\tCOUNT ${spec.count}`; }
    return s;
  }
  // an item of the file -> spec (names from defines / Spec_Item; nameOf(id) = the II_ define, dstOf(n) = the DST_ define)
  function specOf(it, nameOf, dstOf) {
    if (it.raisedPet !== undefined) return { raisedPet: it.define, item: '', upgrade: 0, elem: 0, elemLv: 0, awakes: [], cards: [], count: 1 };
    return { item: it.define && it.id >= 0 ? it.define : nameOf(it.id), upgrade: it.upgrade > 0 ? it.upgrade : 0, elem: it.elem || 0, elemLv: it.elemLv > 0 ? it.elemLv : 0,
      awakes: it.awakes.map(a => ({ dst: a.define || dstOf(a.dst), adj: a.adj })), cards: it.cards.map(nameOf), count: it.count > 1 ? it.count : 1,
      ultimate: !!it.ultimate, runes: (it.runes || []).map(nameOf), jewels: (it.jewels || []).map(nameOf) };
  }
  const lineStartOf = (text, i) => T.lineStart(text, i);
  // insert full lines right before the line holding `pos` (a closing brace), each indented `ind` + extra tabs
  function linesBefore(text, pos, rows) {
    const at = lineStartOf(text, pos), eol = T.eolAt(text, pos) || T.dominantEol(text);
    if (!T.prefixIsBlank(text, pos)) {        // "… }" on one line: put the rows inline before the brace
      return [{ start: pos, end: pos, insert: rows.map(r => r.text).join(' ') + ' ' }];
    }
    const ind = T.indentOf(text, pos);
    return [{ start: at, end: at, insert: rows.map(r => ind + '\t'.repeat(r.depth) + r.text + eol).join('') }];
  }
  function sectionRows(name, lines) {
    return [{ depth: 1, text: name }, { depth: 1, text: '{' }, ...lines.map(l => ({ depth: 2, text: l })), { depth: 1, text: '}' }];
  }
  function block(pr, b) { if (pr.stopped) throw new Error('EqualizedPresets.inc does not load completely (see the problems): fix it first'); if (!b || !b.close) throw new Error('That preset is not in the file'); return b; }

  function setItem(pr, b, secName, i, spec) {
    block(pr, b);
    const it = b.sections[secName] && b.sections[secName].items[i];
    if (!it) throw new Error('That item is not in the preset');
    return [{ start: it.span.start, end: it.span.end, insert: itemLine(spec) }];
  }
  function addItem(pr, text, b, secName, spec) {
    block(pr, b);
    if (!E().SECTIONS.includes(secName)) throw new Error(`Unknown section ${secName}`);
    const line = itemLine(spec), sec = b.sections[secName];
    if (sec) return linesBefore(text, sec.close.start, [{ depth: 1, text: line }]);
    return linesBefore(text, b.close.start, sectionRows(secName, [line]));
  }
  function removeItem(pr, text, b, secName, i) {
    block(pr, b);
    const it = b.sections[secName] && b.sections[secName].items[i];
    if (!it) throw new Error('That item is not in the preset');
    return T.removeRow(text, it.span);
  }
  // a whole block as text (CRLF / LF from the file), sections in HP, ATTACK, BAG order
  function blockText(cls, sex, sections, eol) {
    const out = [`${E().CLASSES[cls].word}\t${E().SEXES[sex]}`, '{'];
    for (const name of E().SECTIONS) {
      const lines = sections[name] || [];
      if (!lines.length && name !== 'HP') continue;
      out.push(`\t${name}`, '\t{', ...lines.map(l => `\t\t${l}`), '\t}');
    }
    out.push('}');
    return out.join(eol) + eol;
  }
  // a new preset at the end of the file; from: a block to copy (or null: empty HP set)
  function addPreset(pr, text, cls, sex, from, nameOf, dstOf) {
    if (pr.stopped) throw new Error('EqualizedPresets.inc does not load completely (see the problems): fix it first');
    if (!(cls >= 0 && cls < E().CLASSES.length) || !(sex === 0 || sex === 1)) throw new Error('Pick a class and a gender');
    if (pr.byKey.has(`${cls}|${sex}`)) throw new Error(`${E().CLASSES[cls].label} ${E().SEXES[sex].toLowerCase()} already has a preset`);
    const sections = {};
    if (from) for (const name of E().SECTIONS) if (from.sections[name]) sections[name] = from.sections[name].items.map(it => itemLine(specOf(it, nameOf, dstOf)));
    const eol = T.dominantEol(text);
    return [{ start: text.length, end: text.length, insert: leadFor(text, eol) + blockText(cls, sex, sections, eol) }];
  }
  // the line ends before a block added at the end of the file: one blank line between blocks
  function leadFor(text, eol) { return !text.length ? '' : /(\r?\n){2}$/.test(text) ? '' : /\r?\n$/.test(text) ? eol : eol + eol; }
  function removePreset(pr, text, b) {
    block(pr, b);
    let s = lineStartOf(text, b.header.start), e = T.lineEnd(text, b.close.end);
    if (s === lineStartOf(text, b.close.end) || !T.prefixIsBlank(text, b.header.start)) return [{ start: b.header.start, end: b.close.end, insert: '' }];
    // one blank line after the block goes with it
    const rest = text.slice(e), m = /^[ \t]*\r?\n/.exec(rest);
    if (m) e += m[0].length;
    else { const b = /(\r?\n)[ \t]*\r?\n$/.exec(text.slice(0, s)); if (b) s -= b[0].length - b[1].length; }   // the last block: the blank line before it
    return [{ start: s, end: e, insert: '' }];
  }

  // the other gender's twin of an item: II_ARM_M_… <-> II_ARM_F_… (and _M / _F at the end) when that define exists; else the same item
  function twinOf(define, toSex, has) {
    if (!define) return define;
    const [a, b] = toSex === 1 ? ['_M', '_F'] : ['_F', '_M'];
    const cands = [define.replace(new RegExp(`${a}_`, 'g'), `${b}_`), define.replace(new RegExp(`${a}$`), b)];
    for (const c of cands) if (c !== define && has(c)) return c;
    return define;
  }
  // where an edit of one gender's item goes on the other gender (the user, 2026-10-21: copying by list position turned a bow, a
  // necklace, gauntlets and a helmet into a 2nd suit, because the male and female lists are in different orders).
  // mine / items: this gender's and the other gender's items of that section; i: the edited item's position in mine;
  // defOf(item) = its II_ / PK_ define; partOf(define) = its dwParts (null: none).
  // -> the position of old's twin there (twinOf; weapons, jewelry and pets are the same item): the 2nd copy (2 rings) goes to the
  //    2nd copy, and with fewer copies there, nothing; no twin at all: the only item worn in the same slot; else -1 (also for a
  //    line that is not an item; the caller leaves that gender alone)
  function twinIndex(mine, items, i, toSex, has, defOf, partOf) {
    const old = mine && mine[i];
    if (!old || !items) return -1;
    const pet = it => it.raisedPet !== undefined, d0 = defOf(old);
    if (!pet(old) && !has(d0)) return -1;                  // not an item: nothing to match
    const rank = mine.slice(0, i).filter(it => pet(it) === pet(old) && defOf(it) === d0).length;
    const tw = pet(old) ? d0 : twinOf(d0, toSex, has);
    const same = items.map((it, k) => (pet(it) === pet(old) && defOf(it) === tw ? k : -1)).filter(k => k >= 0);
    if (same.length) return rank < same.length ? same[rank] : -1;
    if (pet(old)) return -1;
    const p0 = partOf(d0);
    if (p0 === null || p0 === undefined) return -1;
    const slot = items.map((it, k) => (!pet(it) && partOf(defOf(it)) === p0 ? k : -1)).filter(k => k >= 0);
    return slot.length === 1 ? slot[0] : -1;
  }
  // the preset of the other gender = this one, every armor piece swapped for its twin. Replaces that preset when it exists.
  // -> splices; out.swapped / out.kept / out.dropped: how many items got a twin / stayed the same / were left out because the other
  // gender can't wear them (wears(define) false: a male-only fashion set with no female version) (the caller shows them)
  function mirrorPreset(pr, text, b, nameOf, dstOf, has, out = {}, wears = null) {
    block(pr, b);
    const toSex = 1 - b.sex, sections = {};
    out.swapped = 0; out.kept = 0; out.dropped = 0;
    for (const name of E().SECTIONS) if (b.sections[name]) sections[name] = b.sections[name].items.map(it => {
      const sp = specOf(it, nameOf, dstOf);
      if (sp.raisedPet) { out.kept++; return itemLine(sp); }
      const tw = twinOf(sp.item, toSex, has);
      if (wears && !wears(tw)) { out.dropped++; return null; }
      if (tw !== sp.item) out.swapped++; else out.kept++;
      sp.item = tw;
      return itemLine(sp);
    }).filter(x => x !== null);
    const eol = T.dominantEol(text), body = blockText(b.cls, toSex, sections, eol);
    const other = pr.byKey.get(`${b.cls}|${toSex}`);
    if (other) { block(pr, other); return [{ start: other.header.start, end: other.close.end, insert: body.slice(0, body.length - eol.length) }]; }
    return [{ start: text.length, end: text.length, insert: leadFor(text, eol) + body }];
  }

  // ---------------------------------------------------------------- copying slots between presets (the "Copy from" and fashion set pickers)
  // one fashion set = the pieces whose define is the same before HAT / SUIT / GLOVES / SHOES … (II_ARM_M_CHR_SANTAHAT, …SANTASUIT)
  const FASHION_END = /(HAT|HELMET|CAP|SUIT|CLOTHES|CLOTH|COAT|GLOVES|GLOVE|GAUNTLET|SHOES|SHOE|BOOTS|CLOAK|MASK)\d*$/;
  function fashionBase(define) { return (define || '').replace(FASHION_END, ''); }
  // pieces [{ define, part }] -> the sets of 2+ pieces: [{ base, pieces: { <part>: define } }], sorted by base; in one set and
  // slot the first define in sort order wins
  function fashionSets(pieces, parts) {
    const by = new Map();
    for (const p of [...pieces].sort((a, z) => (a.define < z.define ? -1 : a.define > z.define ? 1 : 0))) {
      if (!parts.includes(p.part)) continue;
      const base = fashionBase(p.define);
      if (!base || base === p.define) continue;
      if (!by.has(base)) by.set(base, {});
      const s = by.get(base);
      if (!(p.part in s)) s[p.part] = p.define;
    }
    return [...by].filter(([, s]) => Object.keys(s).length >= 2).sort((a, z) => (a[0] < z[0] ? -1 : 1)).map(([base, s]) => ({ base, pieces: s }));
  }
  // what a switch set has in some slots (EqPlaceItem's pieces, not the HP pieces an Attack set keeps), as specs for another
  // class + gender: the other gender's twin, and why that preset can't wear it (wearIssues). env: { defines, items, nameOf, dstOf, has }
  // -> [{ part, spec, issues }] in the order of `parts`; a part can also be 'buffPet' / 'raisedPet' (the set's pets)
  function copyPieces(src, name, parts, toCls, toSex, env) {
    const D = env.defines, Sim = FRE.equalizedSim, sim = Sim.enter(src, { defines: D, items: env.items }), out = [];
    for (const part of parts) {
      const pl = sim.placed.find(p => p.sec === name && (typeof part === 'string' ? p.why === part : p.why === 'set' && p.part === part));
      if (!pl) continue;
      const spec = specOf(pl.item, env.nameOf, env.dstOf);
      if (spec.raisedPet) { out.push({ part, spec, issues: [] }); continue; }
      spec.item = twinOf(spec.item, toSex, env.has);
      const rec = D.has(spec.item) ? env.items.get(D.get(spec.item) >>> 0) : null;
      out.push({ part, spec, issues: rec ? Sim.wearIssues(rec, toCls, toSex, D) : ['unknown item'] });
    }
    return out;
  }

  FRE.equalizedOps = { setOn, setCap, itemLine, specOf, setItem, addItem, removeItem, addPreset, removePreset, blockText, twinOf, twinIndex, mirrorPreset, fashionBase, fashionSets, copyPieces };
})(globalThis.FRE = globalThis.FRE || {});
