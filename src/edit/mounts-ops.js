// Mounts edits (Mount.inc, UTF-16LE + BOM, CRLF; Server + identical Client copy written by the core client sync).
// The b43949aa / a5325b65 way: one "key=value;" statement per line, tab-indented, inside an Add_Mount { } block.
//   set a value     -> only the value's own characters change (a "quoted" loop keeps its quotes)
//   a missing key   -> a new line after the block's last statement line, with that line's indent and EOL
//   back to default -> the key's line is removed (the block then starts from the loader's default, Project.cpp:633-645)
//   + block         -> a new Add_Mount block after the last one, blank line before it, the file's own indent and EOL
// Several keys of one block change in one plan (copy from another mount, a pasted /mountset reply), so the splices never overlap.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const M = () => FRE.mounts;

  // a value as written: whole numbers for n, the shortest float text for f (0.4, 1.65, -0.3), "quoted" for s
  function fmt(field, v) {
    if (field.kind === 's') return `"${v}"`;
    if (field.kind === 'n') return String(v);
    // the shortest text that reads back as the same float (the loader keeps a float: 0.4 is 0.4000000059604645 in memory)
    const n = Number(v), f = Math.fround(n);
    for (let p = 1; p <= 9; p++) {
      const t = Number(n.toPrecision(p));
      if (Math.fround(t) === f) return plain(t);
    }
    return plain(f);
  }
  // a number without an exponent (atof reads both, the file never uses one)
  function plain(t) {
    const s = String(t);
    if (!/e/i.test(s)) return s;
    return t.toFixed(20).replace(/0+$/, '').replace(/\.$/, '');
  }

  function check(field, v) {
    if (field.kind === 's') {
      if (typeof v !== 'string' || !/^[\x21\x23-\x7e][\x20\x21\x23-\x7e]*$/.test(v) || /\s$/.test(v) || v.length > 127)
        throw new Error(`${field.label}: a file name (ASCII, no quotes, no spaces at the ends)`);
      return;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${field.label}: a number`);
    if (field.kind === 'n' && !Number.isInteger(v)) throw new Error(`${field.label}: a whole number`);
    if (field.key === 'dwID' && (v < 1 || v > 0x7FFFFFFF)) throw new Error('dwID: an item id');
    if (field.min !== undefined && ((field.minOpen ? v <= field.min : v < field.min) || v > field.max))
      throw new Error(`${field.label}: ${field.minOpen ? 'above ' : ''}${field.min} to ${field.max} (what /mountset ${field.cmd} accepts)`);
  }

  // the line of a statement, if the line holds nothing else (then removing it removes the whole line)
  function stmtLine(text, e) {
    const ls = T.lineStart(text, e.keyTok.start), le = T.lineEnd(text, e.stmtEnd);
    const before = text.slice(ls, e.keyTok.start), after = text.slice(e.stmtEnd, T.lineContentEnd(text, e.stmtEnd));
    if (/^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)) return { start: ls, end: le };
    return { start: e.keyTok.start, end: e.stmtEnd };
  }

  // changes: { key: value | null (null = remove the line: back to the default) } for one block -> splices
  function plan(text, block, changes) {
    if (!block) throw new Error('This mount has no Add_Mount block yet: add one first');
    if (block.close === null) throw new Error('This block has no "}"');
    const out = [], adds = [];
    for (const [key, v] of Object.entries(changes)) {
      const field = M().BY_KEY.get(key);
      if (!field) throw new Error(`Unknown key ${key}`);
      const all = block.entries.filter(e => e.key === key);
      if (v === null) {
        if (key === 'dwID') throw new Error('dwID can\'t be removed');
        for (const e of all) out.push(Object.assign(stmtLine(text, e), { insert: '' }));
        continue;
      }
      check(field, v);
      const ins = fmt(field, v);
      if (all.length) {
        // the last statement is the one the loader keeps; earlier copies of the same key are removed so the file says one thing
        const last = all[all.length - 1];
        for (const e of all.slice(0, -1)) out.push(Object.assign(stmtLine(text, e), { insert: '' }));
        const cur = text.slice(last.value.start, last.value.end);
        const insLast = field.kind === 's' && !last.value.quoted ? String(v) : ins;
        if (cur !== insLast) out.push({ start: last.value.start, end: last.value.end, insert: insLast });
      } else if (v !== field.def || key === 'dwID') adds.push(`${key}=${ins};`);
    }
    if (adds.length) {
      // after the block's last statement line (or after the "{" line), in FIELDS order
      const order = new Map(M().FIELDS.map((f, i) => [f.key, i]));
      adds.sort((a, b) => order.get(a.split('=')[0]) - order.get(b.split('=')[0]));
      const lastE = block.entries[block.entries.length - 1];
      const anchor = lastE ? lastE.keyTok.start : block.open.start;
      const eol = T.eolAt(text, anchor) || T.dominantEol(text);
      const indent = lastE ? T.indentOf(text, lastE.keyTok.start) : '\t';
      const at = T.lineEnd(text, lastE ? lastE.stmtEnd : block.open.end);
      const lead = /[\r\n]$/.test(text.slice(0, at)) ? '' : eol;
      out.push({ start: at, end: at, insert: lead + adds.map(l => indent + l + eol).join('') });
    }
    out.sort((a, b) => a.start - b.start);
    for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) throw new Error('Two changes touch the same text');
    return out;
  }

  const setValue = (text, block, key, v) => plan(text, block, { [key]: v });
  const resetKey = (text, block, key) => plan(text, block, { [key]: null });

  // what copying from another mount changes. keys: which FIELDS (default: speeds, leg speeds, name height; loops only when
  // both mounts use the same model, since a loop file is the model's own)
  const COPY_SPEEDS = ['fGroundSpeed', 'fAnimSpeed', 'fWalkAnimSpeed', 'fNameOffset', 'nType', 'fFlightSpeed', 'fFlyAnimSpeed', 'fFlyMaxSpeed'];
  const COPY_SEAT = ['nBindBone', 'fOffSetX', 'fOffSetY', 'fOffSetZ', 'fRotX', 'fRotY', 'fRotZ'];
  const COPY_LOOPS = ['szStand', 'szWalk', 'szRun', 'szWalkBack', 'szFlyStand', 'szFlyWalk', 'szFlyStart', 'szFlyLand'];
  function copyChanges(src, keys) {
    const ch = {};
    for (const k of keys) {
      const e = M().entryOf(src, k);
      ch[k] = e ? src.anim[k] : null;
    }
    return ch;
  }
  // a pasted /mountset reply (or a pasted block) -> changes; dwID never changes
  function pasteChanges(str) {
    const p = M().parsePaste(str);
    if (!Object.keys(p.values).length) throw new Error('Nothing to read: paste the lines /mountset prints in game (Mount 225049: fGroundSpeed=…)');
    return p;
  }

  // a new Add_Mount block for item `id` after the last block. tmpl: a block to copy every value from (dwID replaced), or null;
  // loops: { key: file } for the new model's own files (replaces the template's loop keys)
  function addBlock(text, model, id, tmpl, loops = {}) {
    if (!Number.isInteger(id) || id < 1) throw new Error('Pick a mount item');
    if (model.anims.has(id)) throw new Error(`Item ${id} already has an Add_Mount block`);
    if (model.hang) throw new Error('The file has a block without "}": fix it first');
    const last = model.blocks[model.blocks.length - 1];
    const eol = last ? (T.eolAt(text, last.start) || '\r\n') : T.dominantEol(text);
    // the template's statements as written, in its order (not dwID, not its loops: those are its model's files), then the new
    // model's own loops (szRun, szWalk, szWalkBack)
    const lines = [`dwID=${id};`];
    if (tmpl) {
      for (const e of tmpl.entries) if (e.key !== 'dwID' && !COPY_LOOPS.includes(e.key)) lines.push(text.slice(e.keyTok.start, e.stmtEnd));
    } else lines.push('fGroundSpeed=0.4;');
    for (const k of ['szRun', 'szWalk', 'szWalkBack']) if (loops[k]) { check(M().BY_KEY.get(k), loops[k]); lines.push(`${k}="${loops[k]}";`); }
    const body = `Add_Mount${eol}{${eol}${lines.map(l => '\t' + l + eol).join('')}}${eol}`;
    if (!last) return [{ start: text.length, end: text.length, insert: (text && !/\n$/.test(text) ? eol : '') + eol + body }];
    const at = T.lineEnd(text, last.end);
    const lead = /[\r\n]$/.test(text.slice(0, at)) ? '' : eol;
    return [{ start: at, end: at, insert: lead + eol + body }];
  }

  // the loop files a model of its own offers for each key (item_<model>_<motion>.ani), when they exist
  function ownLoops(x) {
    const has = new Set(x.anis.map(n => n.toLowerCase()));
    const pick = (...m) => { for (const n of m) { const f = M().motionFile(x.model, n); if (has.has(f.toLowerCase())) return x.anis.find(a => a.toLowerCase() === f.toLowerCase()); } return null; };
    const out = {};
    const run = pick('run', 'walk'), walk = pick('walk'), back = pick('walkback');
    if (run) out.szRun = run;
    if (walk) out.szWalk = walk;
    if (back) out.szWalkBack = back;
    return out;
  }

  FRE.mountsOps = { plan, setValue, resetKey, copyChanges, pasteChanges, addBlock, ownLoops, fmt, check, COPY_SPEEDS, COPY_SEAT, COPY_LOOPS };
})(globalThis.FRE = globalThis.FRE || {});
