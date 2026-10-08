// Boxes: random boxes (propGiftbox.inc) and sets (propPackItem.inc).
//   loadGiftboxes = CProject::LoadGiftbox          (_Common/Project.cpp:4261-4380)
//                   + CGiftboxMan::AddItem / Verify (Project.cpp:4116-4174, 4250-4256)
//   loadPacks     = CProject::LoadPackItem         (Project.cpp:4492-4533) + CPackItem::AddItem (4450-4482)
// propGiftbox.inc: UTF-16LE + BOM, CRLF, read only by the WorldServer (LoadGiftbox sits in #ifdef __WORLDSERVER,
// Project.cpp:836-847); no Client copy. propPackItem.inc: CP949 bytes, CRLF; the game loads it too, from its own
// LF copy Client/propPackItem.inc, for the Item Wiki's "box holds fashion" filter (e08528a5, WndWikiItems.cpp:70-125).
// A box item is a box only because its id is in one of these files; a pack is checked first when used
// (User.cpp:3193), so an id in both acts as a pack.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const GIFT = 'propGiftbox.inc', PACK = 'propPackItem.inc';
  const TOTAL = 1000000;                 // CGiftboxMan::Open: xRandom( 1000000 ) (Project.cpp:4184)
  const MAX_GIFTBOX_ITEM = 128;          // Project.h:679; the vector path (__STL_GIFTBOX_VECTOR) never checks it
  const MAX_ITEM_PER_PACK = 24;          // Project.h:760-766 (__VER >= 18)
  // the line types: weight multiplier (out of 1,000,000) and the columns after item, weight, amount
  const TYPES = {
    GiftBox: { prec: 100, cols: [] },
    GiftBox2: { prec: 1, cols: [] },
    GiftBox3: { prec: 100, cols: ['flag'] },
    GiftBox4: { prec: 100, cols: ['flag', 'minutes'] },
    GiftBox5: { prec: 10, cols: ['flag', 'minutes'] },
    GiftBox6: { prec: 10, cols: ['flag', 'minutes', 'upgrade'] },
  };
  const FLAG_BOUND = 2, FLAG_KEEP = 4;   // CItemElem::binds = 0x02 (Item.h:132); 4 = "ignore property" (User.cpp:3010)
  const u32 = v => v >>> 0, i32 = v => v | 0;

  // ---- propGiftbox.inc ----
  // -> { file, blocks, boxes: Map(id -> box), skipped: [{start, end, text}], hung }
  //   block = { type, kw:{start,end}, box: num, open:{start,end,ok}, close:{start,end}|null, lines }
  //   line  = { block, item, w, num, flag, minutes, upgrade (getNumber results or null), start, end }
  //   box   = { id, define, blocks, lines, sum, cum: [u32 per line after Verify] }
  function loadGiftboxes(file, ctx) {
    const s = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const blocks = [], boxes = new Map(), skipped = [];
    let hung = null, t = s.getToken(), skip = null;
    while (t.type !== 'eof') {
      const type = Object.prototype.hasOwnProperty.call(TYPES, t.text) ? t.text : null;   // s.Token == _T( "GiftBox" ): exact case
      if (!type) {
        // one run of skipped words between two boxes = one warning
        if (!skip) { skip = { start: t.start, end: t.end, text: t.text }; skipped.push(skip); } else skip.end = t.end;
        t = s.getToken();
        continue;
      }
      skip = null;
      const T = TYPES[type];
      const block = { type, kw: { start: t.start, end: t.end }, box: s.getNumber(), open: null, close: null, lines: [] };
      const ob = s.getToken();
      block.open = { start: ob.start, end: ob.end, ok: ob.text === '{' };
      blocks.push(block);
      let item = s.getNumber();
      while (s.token.text[0] !== '}') {
        if (s.token.type === 'eof') { hung = { start: block.kw.start, end: block.kw.end }; break; }   // *token is '\0': the C++ loops forever
        const line = { block, item, w: s.getNumber(), num: s.getNumber(), flag: null, minutes: null, upgrade: null, start: item.start, end: 0 };
        for (const c of T.cols) line[c] = s.getNumber();
        line.end = (line.upgrade || line.minutes || line.flag || line.num).end;
        block.lines.push(line);
        addGift(boxes, block, line);
        item = s.getNumber();
      }
      if (hung) break;
      block.close = { start: s.token.start, end: s.token.end };
      t = s.getToken();
    }
    // CGiftboxMan::Verify: the last line's running total gets 1,000,000 - nSum (always exactly 1,000,000)
    for (const b of boxes.values()) if (b.cum.length) b.cum[b.cum.length - 1] = u32(b.cum[b.cum.length - 1] + TOTAL - b.sum);
    return { file: file.name, blocks, boxes, skipped, hung, lexDiags: s.diags.filter(d => d.code !== 'E_UNDEF') };
  }
  // CGiftboxMan::AddItem: nSum += dwProbability; adwProbability[i] = nSum (int, kept as DWORD)
  function addGift(boxes, block, line) {
    const id = u32(block.box.value);
    let b = boxes.get(id);
    if (!b) { b = { id, define: block.box.define || null, blocks: [], lines: [], sum: 0, cum: [] }; boxes.set(id, b); }
    if (!b.blocks.includes(block)) b.blocks.push(block);
    line.weight = u32(Math.imul(u32(line.w.value), TYPES[block.type].prec));
    b.sum = i32(b.sum + line.weight);
    b.cum.push(u32(b.sum));
    b.lines.push(line);
  }
  const flagOf = l => (l.flag ? l.flag.value & 0xff : 0);          // BYTE nFlag
  const minutesOf = l => (l.minutes ? l.minutes.value : 0);
  const upgradeOf = l => (l.upgrade ? l.upgrade.value : 0);

  // CGiftboxMan::Open: the first line whose running total is above the roll. -> chance (0..1) per line
  function chances(box) {
    const out = [];
    let covered = 0;                     // rolls below this already picked an earlier line
    for (const c of box.cum) {
      const top = Math.min(c, TOTAL);
      out.push(Math.max(0, top - covered) / TOTAL);
      covered = Math.max(covered, top);
    }
    return out;
  }

  // ---- propPackItem.inc ----
  // -> { file, blocks, boxes: Map(id -> pack), stopped: {start, end, pack} | null, hung }
  //   block = { box, span, open, close, lines: [{ block, item, upgrade, num, start, end, loaded }] }
  //   pack  = { id, define, blocks, lines (loaded only), span: the last block's minutes }
  function loadPacks(file, ctx) {
    const s = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const blocks = [], boxes = new Map();
    let stopped = null, hung = null, t = s.getToken();
    while (t.type !== 'eof') {
      if (t.text === 'PackItem') {
        const block = { kw: { start: t.start, end: t.end }, box: s.getNumber(), span: s.getNumber(), open: null, close: null, lines: [] };
        const ob = s.getToken();
        block.open = { start: ob.start, end: ob.end, ok: ob.text === '{' };
        blocks.push(block);
        const id = u32(block.box.value);
        let item = s.getNumber();
        while (s.token.text[0] !== '}') {
          if (s.token.type === 'eof') { hung = { start: block.kw.start, end: block.kw.end }; break; }
          const line = { block, item, upgrade: s.getNumber(), num: s.getNumber(), start: item.start, end: 0, loaded: true };
          line.end = line.num.end;
          block.lines.push(line);
          let p = boxes.get(id);
          if (!p) { p = { id, define: block.box.define || null, blocks: [], lines: [], span: 0, spanRec: null }; boxes.set(id, p); }
          if (!p.blocks.includes(block)) p.blocks.push(block);
          if (p.lines.length === MAX_ITEM_PER_PACK) {         // CPackItem::AddItem returns FALSE: LoadPackItem stops here
            line.loaded = false;
            stopped = { start: line.start, end: line.end, pack: id };
            break;
          }
          p.lines.push(line);
          item = s.getNumber();
        }
        if (stopped || hung) break;
        block.close = { start: s.token.start, end: s.token.end };
        const p = boxes.get(id);                               // Open( dwPackItem ): only when a line was added
        if (p) { p.span = block.span.value; p.spanRec = block.span; }
      }
      t = s.getToken();
    }
    return { file: file.name, blocks, boxes, stopped, hung, lexDiags: s.diags.filter(d => d.code !== 'E_UNDEF') };
  }

  // ---- both files ----
  // ctx: { defines, strings } -> { gift, pack } (either null when its file is missing)
  function loadBoxes(files, ctx) {
    const g = files.get(GIFT.toLowerCase()), p = files.get(PACK.toLowerCase());
    return { gift: g ? loadGiftboxes(g, ctx) : null, pack: p ? loadPacks(p, ctx) : null };
  }

  // ---- checks ----
  // ctx: { items: Map id -> Spec_Item row, original: { gift: Set ids, pack: Set ids } (ids when the task opened) }
  function validateBoxes(model, ctx) {
    const out = [];
    const items = ctx.items || new Map();
    const add = (file, d) => out.push(Object.assign({ module: 'boxes', file }, d));
    const nameOf = num => num.define || String(u32(num.value));
    const packMax = id => { const it = items.get(u32(id)); return it ? u32(FRE.specItem.get(it, 'dwPackMax')) : null; };
    function lineChecks(file, boxName, l, k) {
      const key = `${boxName}|${nameOf(l.item)}|${k}`;
      if (l.item.unresolved) add(file, { code: 'BX_UNDEF', severity: 'BLOCK', start: l.item.start, end: l.item.end, key: `BX_UNDEF|${key}`,
        message: `${boxName}: ${l.item.tokens[l.item.tokens.length - 1].raw || '?'} is not defined: the server reads it as item 0 and crashes when this line is given` });
      else if (!items.has(u32(l.item.value))) add(file, { code: 'BX_NO_PROP', severity: 'BLOCK', start: l.item.start, end: l.item.end, key: `BX_NO_PROP|${key}`,
        message: `${boxName}: ${nameOf(l.item)} has no row in Spec_Item.txt: the server crashes when this line is given (GetProp() is NULL)` });
      const n = l.num.value, max = packMax(l.item.value);
      if (n < 1) add(file, { code: 'BX_NUM_ZERO', severity: 'BLOCK', start: l.num.start, end: l.num.end, key: `BX_NUM_ZERO|${key}`,
        message: `${boxName}: ${nameOf(l.item)} has count ${n}: it must be at least 1` });
      else if (max !== null && n > max) add(file, { code: 'BX_NUM_STACK', start: l.num.start, end: l.num.end, key: `BX_NUM_STACK|${key}`,
        // a line already like this when the task opened works (it takes more slots): WARN; one added or changed here: BLOCK (the user's rule)
        severity: ctx.original && ctx.original.stack && ctx.original.stack.has(`${boxName}|${nameOf(l.item)}|${n}`) ? 'WARN' : 'BLOCK',
        message: `${boxName}: ${nameOf(l.item)} ×${FRE.num.group(n)} is more than one bag slot holds (max ${FRE.num.group(max)}): it needs ${Math.ceil(n / Math.max(1, max))} free slots, and with fewer the item is lost. Add a second line for more` });
    }
    const g = model.gift, p = model.pack;
    if (g) {
      for (const d of g.lexDiags) add(g.file, Object.assign({ key: `${d.code}|${g.file}|${d.message}` }, d));
      if (g.hung) add(g.file, { code: 'BX_BRACES', severity: 'BLOCK', start: g.hung.start, end: g.hung.end, key: `BX_BRACES|${GIFT}`,
        message: `${GIFT}: a box block is never closed with }: the server loops forever at startup` });
      for (const sk of g.skipped) add(g.file, { code: 'BX_SKIPPED', severity: 'WARN', start: sk.start, end: sk.end, key: `BX_SKIPPED|${GIFT}|${sk.text}`,
        message: `"${sk.text}" is not GiftBox / GiftBox2-6: the server skips these words one by one until the next box` });
      for (const b of g.boxes.values()) {
        const name = b.define || String(b.id), at = b.blocks[0].kw;
        if (b.blocks.length > 1) add(g.file, { code: 'BX_DUP', severity: 'WARN', start: b.blocks[1].kw.start, end: b.blocks[1].kw.end, key: `BX_DUP|${name}`,
          message: `${name} has ${b.blocks.length} blocks: the server adds their lines together into one box` });
        if (b.lines.length > MAX_GIFTBOX_ITEM) add(g.file, { code: 'BX_TOO_MANY', severity: 'BLOCK', start: at.start, end: at.end, key: `BX_TOO_MANY|${name}`,
          message: `${name} has ${b.lines.length} lines: a random box holds at most ${MAX_GIFTBOX_ITEM} (the server does not check and writes past the end)` });
        if (!items.has(b.id)) add(g.file, { code: 'BX_NOT_ITEM', severity: 'WARN', start: b.blocks[0].box.start, end: b.blocks[0].box.end, key: `BX_NOT_ITEM|${name}`,
          message: `${name} is not an item in Spec_Item.txt: nobody can own this box` });
        if (p && p.boxes.has(b.id)) add(g.file, { code: 'BX_BOTH', severity: 'BLOCK', start: at.start, end: at.end, key: `BX_BOTH|${name}`,
          message: `${name} is also a set in ${PACK}: the set is used first (User.cpp:3193), so these random lines are never used` });
        if (b.sum > TOTAL) {
          const ch = chances(b), never = b.lines.filter((l, i) => ch[i] === 0).length;
          add(g.file, { code: 'BX_OVER_100', severity: 'WARN', start: at.start, end: at.end, key: `BX_OVER_100|${name}`,
            message: `${name}: the chances add up to ${pctText(b.sum / TOTAL)}. The server cuts the list at 100%: ${never ? `${never} line${never > 1 ? 's' : ''} never drop${never > 1 ? '' : 's'}, and ` : ''}the last line gets less` });
        } else if (b.sum < TOTAL) add(g.file, { code: 'BX_UNDER_100', severity: 'INFO', start: at.start, end: at.end, key: `BX_UNDER_100|${name}`,
          message: `${name}: the chances add up to ${pctText(b.sum / TOTAL)}; the server gives the missing ${pctText((TOTAL - b.sum) / TOTAL)} to the last line` });
        b.lines.forEach((l, k) => lineChecks(g.file, name, l, k));
      }
    }
    if (p) {
      for (const d of p.lexDiags) add(p.file, Object.assign({ key: `${d.code}|${p.file}|${d.message}` }, d));
      if (p.hung) add(p.file, { code: 'BX_BRACES', severity: 'BLOCK', start: p.hung.start, end: p.hung.end, key: `BX_BRACES|${PACK}`,
        message: `${PACK}: a set block is never closed with }: the server loops forever at startup` });
      if (p.stopped) {
        const name = (p.boxes.get(p.stopped.pack) || {}).define || String(p.stopped.pack);
        add(p.file, { code: 'BX_PACK_TOO_MANY', severity: 'BLOCK', start: p.stopped.start, end: p.stopped.end, key: `BX_PACK_TOO_MANY|${name}`,
          message: `${name} has more than ${MAX_ITEM_PER_PACK} items: the server stops reading ${PACK} here, so every set after it is lost` });
      }
      for (const b of p.boxes.values()) {
        const name = b.define || String(b.id);
        if (b.blocks.length > 1) add(p.file, { code: 'BX_DUP', severity: 'WARN', start: b.blocks[1].kw.start, end: b.blocks[1].kw.end, key: `BX_DUP|${name}|set`,
          message: `${name} has ${b.blocks.length} set blocks: the server adds their items together (time limit from the last block)` });
        if (!items.has(b.id)) add(p.file, { code: 'BX_NOT_ITEM', severity: 'WARN', start: b.blocks[0].box.start, end: b.blocks[0].box.end, key: `BX_NOT_ITEM|${name}|set`,
          message: `${name} is not an item in Spec_Item.txt: nobody can own this set` });
        b.lines.forEach((l, k) => lineChecks(p.file, name, l, k));
      }
    }
    // contents removed since the task opened (Remove contents…): the box item stays, opening it does nothing
    if (ctx.original) {
      for (const [file, ids, now] of [[GIFT, ctx.original.gift, g], [PACK, ctx.original.pack, p]]) {
        if (!ids || !now) continue;
        for (const id of ids) if (!now.boxes.has(id) && !(g && g.boxes.has(id)) && !(p && p.boxes.has(id))) {
          const it = items.get(id), name = it ? it.define : String(id);
          add(file, { code: 'BX_EMPTIED', severity: 'WARN', key: `BX_EMPTIED|${name}`,
            message: `${it && it.name ? it.name : name} has no contents any more: players who own it can no longer open it (the item stays)` });
        }
      }
    }
    return out;
  }
  // "box|item|amount" of every line above the item's stack size (taken when the task opens; see BX_NUM_STACK)
  function stackKeys(model, items) {
    const out = new Set();
    for (const src of [model.gift, model.pack]) if (src) for (const b of src.boxes.values()) for (const l of b.lines) {
      const it = items.get(l.item.value >>> 0);
      if (it && l.num.value > (FRE.specItem.get(it, 'dwPackMax') >>> 0)) out.add(`${b.define || String(b.id)}|${l.item.define || String(l.item.value >>> 0)}|${l.num.value}`);
    }
    return out;
  }
  const pctText = x => `${Number((x * 100).toFixed(4))}%`;

  FRE.boxes = {
    GIFT, PACK, TOTAL, TYPES, MAX_GIFTBOX_ITEM, MAX_ITEM_PER_PACK, FLAG_BOUND, FLAG_KEEP,
    loadGiftboxes, loadPacks, loadBoxes, validateBoxes, stackKeys, chances, flagOf, minutesOf, upgradeOf, pctText,
  };
})(globalThis.FRE = globalThis.FRE || {});
