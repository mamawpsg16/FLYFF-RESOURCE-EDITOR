// Exchange_Script.txt loader, ported from CExchange::Load_Script (_Common/Exchange.cpp:32).
//   MMI_x { DESCRIPTION { TID.. }  SET TID { RESULTMSG { TID.. } CONDITION { II_x n .. }
//           REMOVE { II_x n .. }  PAY n { II_x n prob [flag] .. } } .. }
// The loader is a plain CScanner, not a CScript: names are resolved only where the C++
// calls CScript::GetDefineNum (menu, TIDs, items), which gives -1 for an unknown name and
// logs nothing. A name in a number slot is atoi("NAME") = 0. Every `while (*token != '}')`
// loop never ends at the end of the file, so a missing } hangs the server at startup.
// __NEW_EXCHANGE_V19 is ON (_Common/LodeConfig.h:18, included by the WorldServer and Neuz
// StdAfx.h): CONDITION items are also the removed items, the REMOVE block is ignored, and a
// menu keeps at most 30 SETs. The client loads the same file (Project.cpp:979) and draws
// each recipe from CONDITION and PAY (WndControl.cpp:1980).
(function (FRE) {
  'use strict';
  const { Script, NULL_ID } = FRE.lexer;
  const FILE = 'Exchange_Script.txt';
  const MAX_SETS = 30;            // __NEW_EXCHANGE_V19 (15 without it)
  const PROB_TOTAL = 1000000;     // PAY chances are n / 1,000,000
  const ROW_SLOTS = 9;            // 434 px row, 40 px per icon, the arrow takes one slot
  const II_GOLD_SEED1 = 'II_GOLD_SEED1';

  function loadExchange(file, ctx) {
    const text = file.text;
    const script = new Script(text, { file: file.name, defines: new Map(), diags: [] });
    const defines = ctx.defines;
    const hang = (what, start) => script.diag('EX_FORMAT', 'BLOCK',
      `${file.name}: ${what} is never closed with "}" - the server would hang at startup`, start, text.length, { name: `hang|${what}` });
    // CScript::GetDefineNum(token)
    const named = t => {
      const v = defines.get(t.text);
      return { name: t.text, value: v === undefined ? NULL_ID : v, undef: v === undefined, start: t.start, end: t.end };
    };
    // CScanner::GetNumber: a name reads as 0
    const number = () => {
      const r = script.getNumber();
      return { value: r.value, start: r.start, end: r.end, name: r.unresolved ? r.tokens[r.tokens.length - 1].text : null };
    };
    // `GetToken(); while (*token != '}') { body(t); GetToken(); }` -> the closing token or null at EOF
    const loop = (what, start, body) => {
      let t = script.getToken();
      while (t.text[0] !== '}') {
        if (t.type === 'eof') { hang(what, start); return null; }
        body(t);
        t = script.getToken();
      }
      return t;
    };
    const span = (open, close) => ({ open: { start: open.start, end: open.end }, close: close ? { start: close.start, end: close.end } : null });

    const menus = [];
    let t = script.getToken();
    while (!script.eof) {
      const menu = { name: t.text, mmi: named(t), start: t.start, end: t.end, description: [], descBlocks: [], sets: [], setCount: 0, closed: false,
        unknownSets: [], swallowed: [] };
      const open = script.getToken();
      menu.open = { start: open.start, end: open.end };
      const close = loop(`the ${menu.name} block`, menu.start, k => {
        if (k.text === 'DESCRIPTION') {
          const o = script.getToken();
          const c = loop(`${menu.name} DESCRIPTION`, k.start, x => menu.description.push(named(x)));
          menu.descBlocks.push(Object.assign({ start: k.start }, span(o, c)));
        } else if (k.text === 'SET') {
          menu.setCount++;
          const set = readSet(k, menu);
          set.index = menu.sets.length;
          set.dropped = menu.setCount > MAX_SETS;     // `if( nCount <= 30 ) push_back`
          menu.sets.push(set);
        } else if (/^SET_/.test(k.text)) menu.unknownSets.push({ name: k.text, start: k.start, end: k.end });   // SET_SMELT etc. (newer servers)
        else if (/^MMI_/.test(k.text)) menu.swallowed.push({ name: k.text, start: k.start, end: k.end });       // a menu name read as junk
      });
      if (close) { menu.closed = true; menu.close = { start: close.start, end: close.end }; menu.end = close.end; }
      else menu.end = text.length;
      menus.push(menu);
      t = script.getToken();
    }

    function readSet(k, menu) {
      const tid = script.getToken();
      const set = { start: k.start, end: k.end, text: named(tid), resultMsg: [], condBlocks: [], removeBlocks: [], condition: [], remove: [],
        condPoint: [], removePoint: [], payBlocks: [], pay: [], payNum: null };
      const o = script.getToken();
      set.open = { start: o.start, end: o.end };
      const where = `${menu.name} SET ${tid.text}`;
      const itemList = (kw, list, blocks) => {
        const bo = script.getToken();
        const c = loop(`${where} ${kw.text}`, kw.start, x => {
          const item = x.text === 'PENYA' ? Object.assign(named(x), { penya: true, undef: false, value: defines.get(II_GOLD_SEED1) }) : named(x);
          const num = number();
          list.push({ item, num, start: x.start, end: num.end });
        });
        blocks.push(Object.assign({ start: kw.start }, span(bo, c)));
      };
      const pointList = (kw, list) => {
        script.getToken();
        loop(`${where} ${kw.text}`, kw.start, x => { const type = named(x); const pt = number(); list.push({ type, point: pt, start: x.start, end: pt.end }); });
      };
      const c = loop(where, k.start, x => {
        if (x.text === 'RESULTMSG') { script.getToken(); loop(`${where} RESULTMSG`, x.start, m => set.resultMsg.push(named(m))); }
        else if (x.text === 'CONDITION') itemList(x, set.condition, set.condBlocks);
        else if (x.text === 'REMOVE') itemList(x, set.remove, set.removeBlocks);
        else if (x.text === 'CONDITION_POINT') pointList(x, set.condPoint);
        else if (x.text === 'REMOVE_POINT') pointList(x, set.removePoint);
        else if (x.text === 'PAY') {
          const n = number();
          set.payNum = n;
          const bo = script.getToken();
          const lines = [];
          const pc = loop(`${where} PAY`, x.start, it => {
            const item = named(it);
            const num = number(), prob = number();
            const line = { item, num, prob, flag: null, start: it.start, end: prob.end };
            // SetMark / GetToken / GoMark: an optional 4th value when the next token is a number
            const save = script.lex.pos;
            const peek = script.lex.next();
            script.lex.pos = save;
            if (peek.type === 'number') { line.flag = number(); line.end = line.flag.end; }
            lines.push(line);
          });
          set.payBlocks.push(Object.assign({ start: x.start, num: n }, span(bo, pc), { lines }));
          set.pay.push(...lines);
          set.paid = effectivePay(lines);
        }
      });
      if (c) { set.close = { start: c.start, end: c.end }; set.end = c.end; }
      return set;
    }

    // Out of step: an unknown SET_x block ends its menu at the first "}" inside it, and the
    // server reads the rest as "menus" named PAY, } ... (undefined names) until it is back in step.
    for (let i = 0; i < menus.length; i++) {
      const m = menus[i];
      if (!m.unknownSets.length) continue;
      m.junk = [];
      for (let j = i + 1; j < menus.length && menus[j].mmi.undef && !/^MMI_/.test(menus[j].name); j++) { menus[j].isJunk = true; m.junk.push(menus[j]); }
      m.junkEnd = m.junk.length ? m.junk[m.junk.length - 1].end : m.end;
      m.lost = [...m.swallowed, ...m.junk.flatMap(x => x.swallowed)];
    }

    // the server's maps: first insert wins (std::map::insert)
    const byId = new Map();
    for (const m of menus) if (!byId.has(m.mmi.value)) byId.set(m.mmi.value, m);
    const diags = script.diags.map(d => d.code === 'E_UNDEF'
      ? Object.assign({}, d, { code: 'EX_FORMAT', severity: 'WARN', message: `${d.name} is in a number slot: this loader reads names there as 0`, name: `num|${d.name}` })
      : d);
    return { file: file.name, menus, byId, diags };
  }

  // The PAY loop of Load_Script for one block: running sum; the line that crosses 1,000,000
  // is cut to fit and every later line is dropped; a total below 1,000,000 tops up the last
  // line kept. Returns { lines: [{line, prob}], sum, over, under, crash }.
  function effectivePay(lines) {
    const kept = [];
    let sum = 0, open = true;
    for (const l of lines) {
      sum += l.prob.value;
      if (sum > PROB_TOTAL) {
        if (open) { kept.push({ line: l, prob: l.prob.value - (sum - PROB_TOTAL) }); open = false; }
      } else {
        kept.push({ line: l, prob: l.prob.value });
        if (sum === PROB_TOTAL) open = false;
      }
    }
    const under = sum < PROB_TOTAL;
    // vecPayItem[size()-1] on an empty vector: undefined behaviour, a crash at startup
    const crash = under && !kept.length;
    if (under && kept.length) kept[kept.length - 1].prob += PROB_TOTAL - sum;
    return { lines: kept, sum, over: sum > PROB_TOTAL, under, crash };
  }

  // How many rewards one exchange gives (GetPayItemList): PAY n picks n different lines
  // by chance; n = 0 never matches the counter, so every line is given.
  function rewardsGiven(set) {
    const n = set.payNum ? set.payNum.value : 0;
    const lines = set.paid ? set.paid.lines.length : 0;
    return n <= 0 ? lines : Math.min(n, lines);
  }

  // ctx: { items: Map id -> item, defines, npcsByMenu: Map mmi value -> [npc names] | null,
  //        live: (menu) -> bool | null: when the map files are read, only the menus players can open }
  function validateExchange(model, ctx) {
    const out = [];
    const add = d => out.push(Object.assign({ file: model.file, module: 'exchange' }, d));
    for (const d of model.diags) add(Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
    const items = ctx.items;
    const pct = p => `${(p / 10000).toLocaleString('en-US', { maximumFractionDigits: 4 })}%`;

    const seen = new Set(), dupN = new Map();
    for (const m of model.menus) {
      if (m.isJunk) continue;
      if (ctx.live && !ctx.live(m)) continue;      // only menus players can open are checked (ctx.live, from the map files)
      const at = { start: m.start, end: m.mmi.end };
      if (m.unknownSets.length) {
        const kinds = [...new Set(m.unknownSets.map(x => x.name))];
        add(Object.assign({ code: 'EX_OUT_OF_STEP', severity: 'WARN', key: `EX_OUT_OF_STEP|${m.name}`,
          message: `${m.name} uses ${kinds.join(' / ')}, a block this server does not know (it reads only SET). The menu ends at the first "}" inside it, so it has no recipes`
            + (m.junk.length ? `, and the server reads the rest as ${m.junk.length} junk menus` : '')
            + (m.lost.length ? `. Lost with it: ${m.lost.map(x => x.name).join(', ')} (never loaded)` : '') }, at));
      }
      if (m.mmi.undef) add(Object.assign({ code: 'EX_UNDEF', severity: 'BLOCK', key: `EX_UNDEF|menu|${m.name}`,
        message: `${m.name} is not #defined: the menu id becomes -1 and no NPC can open it` }, at));
      if (seen.has(m.mmi.value)) {
        dupN.set(m.name, (dupN.get(m.name) || 0) + 1);
        add(Object.assign({ code: 'EX_DUP_MENU', severity: 'WARN', key: `EX_DUP_MENU|${m.name}|${dupN.get(m.name)}`,
          message: `${m.name} appears twice: the server keeps the FIRST block and ignores this one` }, at));
        continue;
      }
      seen.add(m.mmi.value);
      const users = ctx.npcsByMenu ? ctx.npcsByMenu.get(m.mmi.value) || [] : null;
      if (!ctx.live && users && !users.length && !m.mmi.undef) add(Object.assign({ code: 'EX_NO_NPC', severity: 'INFO', key: `EX_NO_NPC|${m.name}`,
        message: `No NPC has AddMenu(${m.name}): players cannot open these ${m.sets.length} recipe${m.sets.length === 1 ? '' : 's'}` }, at));
      for (const d of m.description) if (d.undef) add({ code: 'EX_UNDEF', severity: 'WARN', start: d.start, end: d.end, key: `EX_UNDEF|${m.name}|desc|${d.name}`,
        message: `${m.name}: description text ${d.name} is not #defined (id -1): that page is blank` });
      if (m.setCount > MAX_SETS) add(Object.assign({ code: 'EX_SET_CAP', severity: 'WARN', key: `EX_SET_CAP|${m.name}`,
        message: `${m.name} has ${m.setCount} recipes: only the first ${MAX_SETS} are loaded, the last ${m.setCount - MAX_SETS} never show` }, at));

      m.sets.forEach((s, i) => {
        const label = `${m.name} recipe ${i + 1}`;
        const sAt = { start: s.start, end: s.end };
        const key = `${m.name}|${i + 1}`;
        if (s.text.undef) add(Object.assign({ code: 'EX_UNDEF', severity: 'WARN', key: `EX_UNDEF|${key}|set|${s.text.name}`,
          message: `${label}: the recipe text ${s.text.name} is not #defined (id -1). The v19 window does not show it, so this is harmless` }, sAt));
        for (const r of s.resultMsg) if (r.undef) add({ code: 'EX_UNDEF', severity: 'WARN', start: r.start, end: r.end, key: `EX_UNDEF|${key}|msg|${r.name}`,
          message: `${label}: result message ${r.name} is not #defined (id -1): the message box is blank` });
        for (const l of s.condition) {
          const lAt = { start: l.start, end: l.end };
          if (l.item.undef) add(Object.assign({ code: 'EX_UNDEF', severity: 'BLOCK', key: `EX_UNDEF|${key}|cond|${l.item.name}`,
            message: `${label}: ingredient ${l.item.name} is not #defined (id -1): nobody has it, so the recipe can never be done` }, lAt));
          else if (!l.item.penya && !items.get(l.item.value >>> 0)) add(Object.assign({ code: 'EX_NO_ITEM', severity: 'WARN', key: `EX_NO_ITEM|${key}|cond|${l.item.name}`,
            message: `${label}: ingredient ${l.item.name} is not an item in Spec_Item.txt: the recipe can never be done, and the window draws no icon` }, lAt));
          if (l.num.value <= 0) add(Object.assign({ code: 'EX_QTY', severity: 'WARN', key: `EX_QTY|${key}|cond|${l.item.name}`,
            message: l.num.value === -1
              // RemoveItemA( id, -1 ) is RemoveAllItem (MoverParam.cpp:3966)
              ? `${label}: ingredient ${l.item.name} needs -1: the check always passes and the exchange takes EVERY ${l.item.name} the player has`
              : `${label}: ingredient ${l.item.name} needs ${l.num.value}: the check always passes and nothing is taken` }, lAt));
        }
        if (s.pay.length === 0 || (s.paid && s.paid.crash)) add(Object.assign({ code: 'EX_PAY_EMPTY', severity: 'BLOCK', key: `EX_PAY_EMPTY|${key}`,
          message: s.payBlocks.length
            ? `${label}: the PAY block is empty - the server reads past an empty list at startup and the client divides by zero drawing the row`
            : `${label}: there is no PAY block - the client divides by zero drawing the row, and players would lose the ingredients for nothing` }, sAt));
        for (const l of s.pay) {
          const lAt = { start: l.start, end: l.end };
          const it = l.item.undef ? null : items.get(l.item.value >>> 0);
          if (l.item.undef) add(Object.assign({ code: 'EX_UNDEF', severity: 'BLOCK', key: `EX_UNDEF|${key}|pay|${l.item.name}`,
            message: `${label}: reward ${l.item.name} is not #defined (id -1)${l.item.name === 'PENYA' ? ' (PENYA works only as an ingredient)' : ''}: the server crashes when it gives it` }, lAt));
          else if (!it) add(Object.assign({ code: 'EX_NO_ITEM', severity: 'BLOCK', key: `EX_NO_ITEM|${key}|pay|${l.item.name}`,
            message: `${label}: reward ${l.item.name} is not an item in Spec_Item.txt: the server crashes when it gives it (GetProp() is null)` }, lAt));
          else if (ctx.packMax && ctx.packMax(it) === 0) add(Object.assign({ code: 'EX_PACKMAX', severity: 'BLOCK', key: `EX_PACKMAX|${key}|${l.item.name}`,
            message: `${label}: reward ${l.item.name} has dwPackMax 0: the inventory check divides by zero and crashes the server` }, lAt));
          if (l.num.value <= 0) add(Object.assign({ code: 'EX_QTY', severity: 'WARN', key: `EX_QTY|${key}|pay|${l.item.name}`,
            message: `${label}: reward ${l.item.name} quantity is ${l.num.value}` }, lAt));
        }
        if (s.paid && s.pay.length) {
          if (s.paid.over) {
            const cut = s.paid.lines[s.paid.lines.length - 1];
            const lost = s.pay.length - s.paid.lines.length;
            add(Object.assign({ code: 'EX_PROB_OVER', severity: 'WARN', key: `EX_PROB_OVER|${key}`,
              message: `${label}: the chances add up to ${pct(s.paid.sum)}. The server cuts ${cut.line.item.name} to ${pct(cut.prob)}${lost ? ` and drops the ${lost} line${lost > 1 ? 's' : ''} after it` : ''}` }, sAt));
          } else if (s.paid.under && !s.paid.crash) {
            const last = s.paid.lines[s.paid.lines.length - 1];
            add(Object.assign({ code: 'EX_PROB_UNDER', severity: 'WARN', key: `EX_PROB_UNDER|${key}`,
              message: `${label}: the chances add up to ${pct(s.paid.sum)}. The server gives the missing ${pct(PROB_TOTAL - s.paid.sum)} to the last line, ${last.line.item.name} (${pct(last.prob)})` }, sAt));
          }
          const n = s.payNum.value, have = s.paid.lines.length;
          if (n <= 0 && have > 1) add(Object.assign({ code: 'EX_PAYNUM', severity: 'WARN', key: `EX_PAYNUM|${key}|0`,
            message: `${label}: PAY ${n} gives EVERY one of the ${have} rewards, not one of them` }, sAt));
          else if (n > have) add(Object.assign({ code: 'EX_PAYNUM', severity: 'WARN', key: `EX_PAYNUM|${key}|${n}`,
            message: `${label}: PAY ${n} but only ${have} reward line${have > 1 ? 's' : ''}: the server gives all of them and logs an error` }, sAt));
        }
        const icons = s.condition.length + s.pay.length;
        if (icons > ROW_SLOTS) add(Object.assign({ code: 'EX_ROW_WIDE', severity: 'WARN', key: `EX_ROW_WIDE|${key}`,
          message: `${label}: ${s.condition.length} ingredients + ${s.pay.length} rewards = ${icons} icons; the exchange window fits about ${ROW_SLOTS}, the rest are drawn past its edge` }, sAt));
        if (s.removeBlocks.length && !sameList(s.condition, s.remove)) add(Object.assign({ code: 'EX_REMOVE_IGNORED', severity: 'INFO', key: `EX_REMOVE_IGNORED|${key}`,
          message: `${label}: REMOVE differs from CONDITION. This server (__NEW_EXCHANGE_V19) takes the CONDITION items and ignores REMOVE` }, sAt));
      });
    }
    return out;
  }

  const sameList = (a, b) => a.length === b.length && a.every((l, i) => l.item.name === b[i].item.name && l.num.value === b[i].num.value);

  FRE.exchange = { loadExchange, validateExchange, effectivePay, rewardsGiven, sameList, FILE, MAX_SETS, PROB_TOTAL, ROW_SLOTS };
})(globalThis.FRE = globalThis.FRE || {});
