// Set effects (task G part 1) with the offsets the edits need. Two files:
//   propItemEtc.inc (UTF-16LE + BOM, CRLF; Server + an identical Client copy): CProject::LoadPiercingAvail
//     (_Common/Project.cpp:4542-4611, called :861 by the WorldServer and the game). Read token for token like the C++:
//       SetItem <id> <name> { Elem { ITEM PART … } Avail { DST adj pieces … } }
//     The name is one token: an IDS key replaced by its propItemEtc.txt.txt text (CScript), copied with lstrcpy into
//     m_pszString[64] (MAX_SETITEM_STRING, Project.h:814; a longer one runs over the set's other fields).
//     AddSetItemElem (:4697): the 9th piece and later are dropped (MAX_SETITEM_ELEM 8, TRACE only; the duplicate-part
//     check is _DEBUG only). AddItemAvail (:4719): the 33rd row and later are dropped (MAX_ITEMAVAIL 32).
//     SortItemAvail (:4736): an exchange sort by pieces needed (not stable). CSetItemFinder::AddSetItem (:4806): the
//     first set with an id, and the first set an item is in, win (map insert).
//     A word other than Elem / Avail inside a set makes the C++ loop forever (the server hangs at startup).
//   expTable.inc (CP949, CRLF; server + game): CProject::LoadExpTable `Setitem` (:3829): rows of HitRate, Block,
//     Max HP %, AddMagic, Added (STR/DEX/INT/STA) for +1, +2, … into m_aSetItemAvail[11] (Project.h:1064);
//     GetSetItemAvail (:4535) uses row n-1 for +1..+10, nothing above +10.
(function (FRE) {
  'use strict';
  const MAX_ELEM = 8, MAX_AVAIL = 32, MAX_NAME = 64, PLUS_ROWS = 10, PLUS_SLOTS = 11;
  const ETC = 'propItemEtc.inc', ETC_TXT = 'propItemEtc.txt.txt', EXP = 'expTable.inc';
  const PLUS_COLS = ['hit', 'block', 'hp', 'magic', 'added'];

  const span = r => ({ start: r.start, end: r.end, value: r.value, define: r.define || null });

  // The string table the loader sees: the server's tables (first key wins), then propItemEtc.txt.txt (Masquerade.prj
  // loads it after propItem.txt.txt). Returns { map, meta } for the set names.
  function etcStrings(file, shared) {
    const state = { map: new Map(), meta: new Map(), diags: [], missing: [] };
    if (file) FRE.loadStringFile(state, file);
    const map = new Map(shared || []);
    for (const [k, v] of state.map) if (!map.has(k)) map.set(k, v);
    return { map, meta: state.meta, own: state.map, diags: state.diags };
  }

  function load(file, ctx) {
    const res = { file: file ? file.name : ETC, sets: [], byId: new Map(), byItem: new Map(), hang: null, diags: [], last: null };
    if (!file) return res;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: res.diags });
    const tok = () => ({ start: s.token.start, end: s.token.end });
    s.getToken();
    while (!s.eof) {
      const w = s.token.text;
      if (w === 'Piercing') {
        s.getNumber(); s.getToken(); s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); }
      } else if (w === 'SetItem') {
        const set = { start: s.token.start, end: null, id: 0, idSpan: null, nameKey: '', name: '', nameSpan: null,
          open: null, close: null, blocks: [], pieces: [], rows: [], elems: [], avail: [] };
        const id = s.getNumber();
        set.id = id.value; set.idSpan = span(id);
        const nt = s.getToken();
        set.nameKey = nt.stringKey || nt.text; set.name = nt.text; set.nameSpan = { start: nt.start, end: nt.end };
        s.getToken(); set.open = tok();             // {
        s.getToken();                               // Elem / Avail / }
        while (s.token.text[0] !== '}' && !s.eof) {
          if (s.token.text === 'Elem') {
            const blk = { kind: 'Elem', word: tok(), open: null, close: null };
            s.getToken(); blk.open = tok();
            let it = s.getNumber();
            while (s.token.text[0] !== '}' && !s.eof) {
              const pt = s.getNumber();
              const p = { id: it.value >>> 0, define: it.define || null, part: pt.value, partDefine: pt.define || null, unresolved: !!(it.unresolved || pt.unresolved),
                start: it.start, end: pt.end, spans: { item: span(it), part: span(pt) }, kept: set.elems.length < MAX_ELEM, block: blk };
              set.pieces.push(p);
              if (p.kept) set.elems.push(p);
              it = s.getNumber();
            }
            blk.close = tok();
            set.blocks.push(blk);
            s.getToken();
          } else if (s.token.text === 'Avail') {
            const blk = { kind: 'Avail', word: tok(), open: null, close: null };
            s.getToken(); blk.open = tok();
            let dst = s.getNumber();
            while (s.token.text[0] !== '}' && !s.eof) {
              const adj = s.getNumber(), need = s.getNumber();
              const r = { dst: dst.value, dstDefine: dst.define || null, adj: adj.value, need: need.value, unresolved: !!dst.unresolved,
                start: dst.start, end: need.end, spans: { dst: span(dst), adj: span(adj), need: span(need) }, kept: set.avail.length < MAX_AVAIL, block: blk };
              set.rows.push(r);
              if (r.kept) set.avail.push(r);
              dst = s.getNumber();
            }
            blk.close = tok();
            set.blocks.push(blk);
            s.getToken();
          } else {
            res.hang = { set, start: s.token.start, end: s.token.end, word: s.token.text };
            break;
          }
        }
        set.close = s.eof ? null : tok();
        set.end = s.eof ? file.text.length : s.token.end;
        set.avail = sortAvail(set.avail);
        res.sets.push(set);
        // CSetItemFinder::AddSetItem: the first set with an id / with an item wins
        if (!res.byId.has(set.id)) res.byId.set(set.id, set);
        for (const p of set.elems) if (!res.byItem.has(p.id)) res.byItem.set(p.id, set);
        res.last = set;
        if (res.hang) break;
      } else if (w === 'RandomOptItem') {
        s.getNumber(); s.getToken(); s.getNumber(); s.getNumber(); s.getToken();
        s.getNumber();
        while (s.token.text[0] !== '}' && !s.eof) { s.getNumber(); s.getNumber(); }
      }
      s.getToken();
    }
    return res;
  }

  // CSetItem::SortItemAvail (Project.cpp:4736): for i, for j > i, swap when a[i] needs more pieces than a[j]
  function sortAvail(rows) {
    const a = rows.slice();
    for (let i = 0; i < a.length - 1; i++) for (let j = i + 1; j < a.length; j++) if (a[i].need > a[j].need) { const x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }

  // CSetItem::GetItemAvail (Project.cpp:4760): rows in sorted order, stop at the first needing more than n; bAll = every
  // row up to n, else only rows needing exactly n. Same-stat rows add up. Returns [[dst, adj], …] in the C++'s order.
  function itemAvail(set, n, all, into) {
    const out = into || [];
    for (const r of set.avail) {
      if (r.need > n) break;
      if (!all && r.need !== n) continue;
      const f = out.find(x => x[0] === r.dst);
      if (f) f[1] = (f[1] + r.adj) | 0; else out.push([r.dst, r.adj]);
    }
    return out;
  }

  // expTable.inc Setitem: rows of 5 numbers until a row starts with `}` (LoadExpTable :3829-3843). A short row reads on
  // into the next tokens like the C++ (`shifted`); rows past 11 write past m_aSetItemAvail (`over`).
  function loadPlus(file) {
    const res = { file: file ? file.name : EXP, rows: [], open: null, close: null, word: null, shifted: false, over: false, found: false };
    if (!file) return res;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: new Map(), diags: [] });
    let t;
    do { t = s.getToken(); } while (!s.eof && t.text !== 'Setitem');
    if (s.eof) return res;
    res.found = true; res.word = { start: t.start, end: t.end };
    const o = s.getToken(); res.open = { start: o.start, end: o.end };
    let v = s.getNumber();
    while (s.token.text[0] !== '}' && !s.eof) {
      const cells = [span(v)];
      for (let k = 1; k < 5; k++) {
        const c = s.getNumber();
        if (c.tokens[0].text[0] === '}') res.shifted = true;
        cells.push(span(c));
      }
      const row = { cells, start: cells[0].start, end: cells[4].end };
      for (let k = 0; k < 5; k++) row[PLUS_COLS[k]] = cells[k].value;
      res.rows.push(row);
      if (res.rows.length > PLUS_SLOTS) res.over = true;
      v = s.getNumber();
    }
    res.close = s.eof ? null : { start: s.token.start, end: s.token.end };
    return res;
  }

  // CProject::GetSetItemAvail (:4535): +1..+10 = row n-1; m_aSetItemAvail is zeroed (a global), so a missing row gives 0s
  function plusRow(plus, n) {
    if (n < 0 || n > 10 || n === 0) return null;        // n = 0: m_aSetItemAvail[-1], never asked (callers check n > 0)
    const r = plus && plus.rows[n - 1];
    const z = { hit: 0, block: 0, hp: 0, magic: 0, added: 0 };
    if (!r) return z;
    for (const k of PLUS_COLS) z[k] = r[k];
    return z;
  }

  // Everything in one model, from a Workspace (or { files, defines, strings }).
  function fromWorkspace(ws) {
    const f = n => ws.files.get(n.toLowerCase());
    const strings = etcStrings(f(ETC_TXT), ws.strings ? ws.strings.map : null);
    const model = load(f(ETC), { defines: ws.defines.defines, strings: strings.map });
    model.strings = strings;
    model.hasTxt = !!f(ETC_TXT);
    model.plus = loadPlus(f(EXP));
    model.hasExp = !!f(EXP);
    return model;
  }

  // the set's piece count after load / a piece's slot name (PARTS_CAP -> "cap")
  const PART_WORD = { PARTS_CAP: 'Helmet', PARTS_UPPER_BODY: 'Suit', PARTS_HAND: 'Gauntlets', PARTS_FOOT: 'Boots', PARTS_LOWER_BODY: 'Lower body',
    PARTS_CLOAK: 'Cloak', PARTS_MASK: 'Mask', PARTS_RWEAPON: 'Weapon', PARTS_LWEAPON: 'Off-hand weapon', PARTS_SHIELD: 'Shield',
    PARTS_NECKLACE1: 'Necklace', PARTS_RING1: 'Ring 1', PARTS_RING2: 'Ring 2', PARTS_EARRING1: 'Earring 1', PARTS_EARRING2: 'Earring 2',
    PARTS_HAT: 'Fashion hat', PARTS_CLOTH: 'Fashion suit', PARTS_GLOVE: 'Fashion gloves', PARTS_BOOTS: 'Fashion boots', PARTS_CLOAK2: 'Fashion cloak',
    PARTS_RIDE: 'Mount', PARTS_BULLET: 'Ammo' };

  FRE.sets = { load, loadPlus, plusRow, sortAvail, itemAvail, etcStrings, fromWorkspace,
    MAX_ELEM, MAX_AVAIL, MAX_NAME, PLUS_ROWS, PLUS_SLOTS, PLUS_COLS, ETC, ETC_TXT, EXP, PART_WORD };
})(globalThis.FRE = globalThis.FRE || {});
