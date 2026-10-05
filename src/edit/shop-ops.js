// NPC shop edits (character*.inc) as minimal splices. Built on FRE.textOps.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;

  function formatStmt(cmd, args, text) {
    // follow the file's existing spacing for this command: "Cmd( a, b );" vs "Cmd(a, b);"
    const m = new RegExp(cmd + '\\s*\\(( ?)').exec(text);
    const pad = m ? m[1] : ' ';
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

  FRE.shopOps = { addItem, removeStatement, setCost, setSlot, stmtExtent: T.stmtExtent };
})(globalThis.FRE = globalThis.FRE || {});
