// NPC shop edits (character*.inc) as minimal splices. Built on FRE.textOps.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;

  // Spacing used when the file has no statement of that command yet. SetVenderType
  // is only ever written "SetVenderType(1);" in the original data.
  const DEFAULT_PAD = { SetVenderType: '' };

  function formatStmt(cmd, args, text) {
    // follow the file's existing spacing for this command: "Cmd( a, b );" vs "Cmd(a, b);"
    const m = new RegExp(cmd + '\\s*\\(( ?)').exec(text);
    const pad = m ? m[1] : (cmd in DEFAULT_PAD ? DEFAULT_PAD[cmd] : ' ');
    return `${cmd}(${pad}${args.join(', ')}${pad});`;
  }
  const checkCost = c => T.checkAmount(c, 0, 2147483647, 'price');
  const checkSlot = s => { if (!(s >= 0 && s <= 3)) throw new Error('tab must be 0-3'); };

  // Add a fixed item (AddShopItem) or, for chip shops, AddVenderItem2.
  function addItem(text, npc, slot, define, cost) {
    T.checkDefine(define);
    checkSlot(slot);
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
    if (anchor) return T.insertRowAfter(text, anchor, stmt);
    return T.insertRowBelowLine(text, npc.braceTok.start, stmt);
  }

  const removeStatement = (text, rec) => T.removeRow(text, rec);

  function setCost(text, rec, cost) {
    if (rec.cmd !== 'AddShopItem') throw new Error('only AddShopItem entries have a price');
    if (cost === null) {
      if (!rec.args.cost) return [];
      const comma = rec.seps.find(s => s.expect === ', or )');
      return [{ start: comma.start, end: rec.args.cost.end, insert: '' }];
    }
    checkCost(cost);
    if (rec.args.cost) return T.replaceSpan(rec.args.cost, cost);
    const it = rec.args.item;
    return [{ start: it.end, end: it.end, insert: `, ${cost}` }];
  }

  function setSlot(text, rec, slot) {
    checkSlot(slot);
    return T.replaceSpan(rec.args.slot, slot);
  }

  // Shop currency (SetVenderType: 0 Penya, 1 Red Chip, 2 Donate Chip; CProject::LoadCharacter,
  // Project.cpp:3518). Chip shops sell AddVenderItem2 entries for chips (Mover.cpp:1651);
  // Penya shops sell AddShopItem entries. Converting renames only the command word and
  // keeps the "( tab, II_X )" text as written, so converting back gives identical bytes.
  // AddShopItem's Penya price cannot exist on AddVenderItem2 and is dropped.
  // Returns every splice at once, so the whole change is one undo step.
  const shopType = v => (v === 1 || v === 2 ? v : 0);
  const isChipItem = r => r.cmd === 'AddVenderItem2' || r.cmd === 'AddVendorItem2';

  // penyaPrices (optional, converting to Penya): Map rec.start -> price written as
  // AddShopItem( tab, II_X, price ). Chip prices live in Spec_Item.txt (itemOps.setChipPrice).
  function setShopType(text, npc, type, penyaPrices) {
    if (type !== 0 && type !== 1 && type !== 2) throw new Error('shop type must be 0 (Penya), 1 (Red Chip) or 2 (Donate Chip)');
    const from = shopType(npc.venderType);
    const splices = [];
    const rename = (rec, cmd) => splices.push({ start: rec.start, end: rec.start + rec.cmd.length, insert: cmd });
    if ((from === 0) !== (type === 0)) {
      for (const rec of npc.statements) {
        if (type !== 0 && rec.cmd === 'AddShopItem') { rename(rec, 'AddVenderItem2'); splices.push(...setCost(text, rec, null)); }
        if (type === 0 && isChipItem(rec)) {
          rename(rec, 'AddShopItem');
          const cost = penyaPrices && penyaPrices.get(rec.start);
          if (cost !== undefined && cost !== null) {
            checkCost(cost);
            splices.push({ start: rec.args.item.end, end: rec.args.item.end, insert: `, ${cost}` });
          }
        }
      }
    }
    const typeRecs = npc.statements.filter(r => r.cmd === 'SetVenderType');
    if (type === 0) {
      for (const rec of typeRecs) splices.push(...T.removeRow(text, rec));
    } else if (typeRecs.length) {
      const last = typeRecs[typeRecs.length - 1];
      for (const rec of typeRecs.slice(0, -1)) splices.push(...T.removeRow(text, rec));
      if (last.args.type.value !== type) splices.push(...T.replaceSpan(last.args.type, type));
    } else {
      const stmt = formatStmt('SetVenderType', [type], text);
      const menu = npc.statements.filter(r => r.cmd === 'AddMenu').pop();
      splices.push(...(menu ? T.insertRowAfter(text, menu, stmt) : T.insertRowBelowLine(text, npc.braceTok.start, stmt)));
    }
    return splices;
  }

  // What a currency change does to the items, for the preview (no splices).
  // itemOf(id) -> item info (Workspace.itemInfo) or null.
  function shopTypePlan(npc, type, itemOf) {
    const from = shopType(npc.venderType);
    const plan = { from, to: type, converted: [], droppedPrices: [], noChipPrice: [], noPenyaPrice: [], rulesIgnored: 0, rulesUsedAgain: 0 };
    if (from === type) return plan;
    const crossing = (from === 0) !== (type === 0);
    for (const rec of npc.statements) {
      const e = FRE.character.shopEntry(rec);
      if (!e) continue;
      if (e.kind === 'generated') {
        if (crossing && type !== 0) plan.rulesIgnored++;
        if (crossing && type === 0) plan.rulesUsedAgain++;
        continue;
      }
      const info = itemOf(e.item.value);
      const define = e.item.define || (info && info.define) || String(e.item.value);
      const row = { rec, define, info, slot: e.slot };
      // chip shops only sell AddVenderItem2 items with a chip price (dwReferValue1 >= 1)
      if (!crossing) continue;
      if (type !== 0 && !(info && info.chipCost >= 1)) plan.noChipPrice.push(row);
      if (type !== 0 && e.kind === 'fixed') {
        plan.converted.push(row);
        if (e.cost) plan.droppedPrices.push(Object.assign({ cost: e.cost.value }, row));
      }
      if (type === 0 && e.kind === 'chip') {
        plan.converted.push(row);
        if (!(info && info.cost > 0)) plan.noPenyaPrice.push(row);
      }
    }
    return plan;
  }

  // A tab's AddVendorItem rules -> AddShopItem lines (plan from vendorSim.ruleToFixedPlan).
  // Every rule row is removed; the new lines take the place of the plan's anchor (the first rule,
  // or an earlier fixed line of the tab, which then stays below them), with its indent and EOL.
  function convertRules(text, npc, plan) {
    if (plan.blocked) throw new Error(plan.blocked);
    const stmts = plan.items.filter(it => !it.omitted).map(it => {
      checkSlot(it.slot); T.checkDefine(it.prop.item.define);
      const args = [it.slot, it.prop.item.define];
      if (it.cost !== null && it.cost !== undefined) { checkCost(it.cost); args.push(it.cost); }
      return formatStmt('AddShopItem', args, text);
    });
    const a = plan.anchor;
    const eol = T.eolAt(text, a.start) || T.dominantEol(text);
    const asLines = () => stmts.map(s => T.indentOf(text, a.start) + s + eol).join('');
    const splices = [];
    for (const rec of plan.rules) {
      const r = T.removeRow(text, rec)[0];
      if (rec === a && stmts.length) {
        if (r.start === T.lineStart(text, a.start)) r.insert = asLines();      // the whole line: the new lines replace it
        else r.insert = (r.start < a.start ? ' ' : '') + stmts.join(' ');      // shares its line: inline
      }
      splices.push(r);
    }
    if (!plan.rules.includes(a) && stmts.length) {
      if (T.prefixIsBlank(text, a.start)) { const at = T.lineStart(text, a.start); splices.push({ start: at, end: at, insert: asLines() }); }
      else splices.push({ start: a.start, end: a.start, insert: stmts.join(' ') + ' ' });
    }
    return splices.sort((x, y) => x.start - y.start);
  }

  // AddVendorItem( tab, IK3_X, job, rarity min, rarity max, n ): every sellable item of kind IK3_X
  // (for that job, -1 = any) with dwItemRare min..max (Mover.cpp:5414). The server ignores n.
  function checkRule(r) {
    checkSlot(r.slot); T.checkDefine(r.ik3);
    if (r.job !== -1) T.checkDefine(r.job);
    T.checkAmount(r.rareMin, 0, 2147483647, 'lowest rarity');
    T.checkAmount(r.rareMax, r.rareMin, 2147483647, 'highest rarity');
  }
  function ruleArgs(r) { return [r.slot, r.ik3, r.job, r.rareMin, r.rareMax, r.count === undefined ? 100 : r.count]; }
  function addRule(text, npc, r) {
    checkRule(r);
    const stmt = formatStmt('AddVendorItem', ruleArgs(r), text);
    // after the tab's last rule, else after its last shop line, else as addItem places a line
    const tabRecs = npc.statements.filter(x => { const e = FRE.character.shopEntry(x); return e && e.slot === r.slot; });
    const rules = tabRecs.filter(x => FRE.character.shopEntry(x).kind === 'generated');
    const shop = npc.statements.filter(x => FRE.character.shopEntry(x));
    const anchor = rules[rules.length - 1] || tabRecs[tabRecs.length - 1] || shop[shop.length - 1]
      || npc.statements.filter(x => x.cmd === 'AddMenu').pop() || null;
    if (anchor) return T.insertRowAfter(text, anchor, stmt);
    return T.insertRowBelowLine(text, npc.braceTok.start, stmt);
  }
  // Only the values that change are replaced (the rest of the line stays byte for byte).
  function setRule(text, rec, r) {
    if (rec.cmd !== 'AddVendorItem' && rec.cmd !== 'AddVenderItem') throw new Error('only AddVendorItem rules can be changed here');
    checkRule(r);
    const out = [];
    const put = (name, v) => { const a = rec.args[name]; if (text.slice(a.start, a.end) !== String(v)) out.push(...T.replaceSpan(a, v)); };
    put('slot', r.slot); put('ik3', r.ik3); put('job', r.job); put('rareMin', r.rareMin); put('rareMax', r.rareMax);
    return out;
  }

  // One Penya price per item: every AddShopItem( tab, II_X, price ) line sets II_X's dwCost for the whole
  // server and the last one loaded wins (Project.cpp:3581). So a new price is also written on the item's
  // other priced lines, or an older line loaded later would win. Returns grouped-edit parts (every NPC file);
  // `except` = the line being edited (left out). Lines without a price are left alone: they use dwCost.
  function otherPriceParts(ws, itemId, cost, except) {
    const id = itemId >>> 0, byFile = new Map(), lines = [];
    if (cost === null || cost === undefined) return { parts: [], lines };
    checkCost(cost);
    for (const npc of ws.chars.npcs) {
      for (const rec of npc.statements) {
        if (rec.cmd !== 'AddShopItem' || !rec.args.cost || !rec.args.item || (rec.args.item.value >>> 0) !== id) continue;
        if (except && rec.start === except.start && npc.file.toLowerCase() === except.file) continue;
        if (rec.args.cost.value === cost) continue;
        const f = npc.file.toLowerCase();
        if (!byFile.has(f)) byFile.set(f, []);
        byFile.get(f).push(...T.replaceSpan(rec.args.cost, cost));
        lines.push({ npc, rec, was: rec.args.cost.value });
      }
    }
    return { parts: [...byFile].map(([file, splices]) => ({ file, splices })), lines };
  }
  // parts + more parts: splices of the same file go together
  function mergeParts(a, b) {
    const out = a.map(p => ({ file: p.file, splices: [...p.splices] }));
    for (const p of b) {
      const same = out.find(x => x.file === p.file);
      if (same) same.splices.push(...p.splices); else out.push({ file: p.file, splices: [...p.splices] });
    }
    out.forEach(p => p.splices.sort((x, y) => x.start - y.start));
    return out;
  }

  FRE.shopOps = { otherPriceParts, mergeParts, formatStmt, addItem, removeStatement, setCost, setSlot, setShopType, shopTypePlan, shopType, stmtExtent: T.stmtExtent,
    convertRules, addRule, setRule };
})(globalThis.FRE = globalThis.FRE || {});
