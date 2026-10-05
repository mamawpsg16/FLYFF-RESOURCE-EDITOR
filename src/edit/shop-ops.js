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

  FRE.shopOps = { addItem, removeStatement, setCost, setSlot, setShopType, shopTypePlan, shopType, stmtExtent: T.stmtExtent };
})(globalThis.FRE = globalThis.FRE || {});
