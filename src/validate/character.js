// Validation rules for character*.inc (docs/DESIGN.md §3.2).
// Every diagnostic gets a stable `key` (no offsets) so the save step can tell
// pre-existing problems from ones introduced by an edit.
(function (FRE) {
  'use strict';
  const { shopEntry } = FRE.character;
  const MAX_TAB = 4;                 // MAX_VENDOR_INVENTORY_TAB
  const MAX_TAB_ITEMS = 100;         // MAX_VENDOR_INVENTORY

  const ARG_CMDS = new Set(['AddShopItem', 'AddVendorItem', 'AddVenderItem', 'AddVendorItem2', 'AddVenderItem2',
    'AddVendorItemLang', 'AddVendorSlot', 'AddVenderSlot', 'AddVendorSlotLang', 'SetVenderType', 'AddMenu', 'AddMenuLang', 'SetBuffSkill']);

  function validateCharacters(chars, ctx) {
    const out = [];
    const add = (d) => out.push(d);
    const items = ctx.items;          // Map id -> item (Spec_Item)
    const defs = ctx.defines;

    // lexer-level diagnostics (undefined names, unterminated strings, ...)
    for (const d of chars.diags) {
      add(Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
    }

    // duplicate NPC keys (case-insensitive, shared by the 3 files)
    for (const [lk, list] of chars.byKey) {
      if (list.length > 1) {
        for (const npc of list.slice(1)) {
          add({ code: 'C_DUP_NPC', severity: 'BLOCK', file: npc.file, start: npc.start, end: npc.keyEnd, npcKey: npc.key,
            key: `C_DUP_NPC|${lk}`, message: `NPC "${npc.key}" is defined ${list.length} times (${list.map(n => n.file).join(', ')}): the last one replaces the others` });
        }
      }
    }

    const tradeMenu = defs.get('MMI_TRADE');
    const priceByItem = new Map();    // item id -> [{npc, cost}]

    for (const npc of chars.npcs) {
      const at = { file: npc.file, npcKey: npc.key };
      if (!npc.closed) {
        add(Object.assign({ code: 'C_BRACES', severity: 'BLOCK', start: npc.start, end: npc.end, key: `C_BRACES|${npc.file}|${npc.key}`,
          message: `${npc.key}: its block never closes (the server reads to the end of the file)` }, at));
      }
      if (npc.missingBrace) {
        add(Object.assign({ code: 'C_NO_OPEN_BRACE', severity: 'WARN', start: npc.braceTok.start, end: npc.braceTok.end, key: `C_NO_OPEN_BRACE|${npc.file}|${npc.key}`,
          message: `${npc.key}: no "{" after the name; the server silently uses "${npc.braceTok.text}" as the brace (works by accident)` }, at));
      }
      let shopCount = 0;
      for (const rec of npc.statements) {
        if (rec.hang) {
          add(Object.assign({ code: 'C_HANG', severity: 'BLOCK', start: rec.start, end: rec.end, key: `C_HANG|${npc.file}|${npc.key}|${rec.cmd}`,
            message: `${npc.key}: ${rec.cmd} is never closed, the server would hang at startup` }, at));
        }
        if (ARG_CMDS.has(rec.cmd)) {
          for (const s of rec.seps) {
            // the trailing ';' read by GetLangScript / SetLang is optional in practice
            if (s.expect !== ';' && !s.expect.split(' or ').includes(s.got)) {
              add(Object.assign({ code: 'C_ARGS', severity: 'BLOCK', start: rec.start, end: rec.end,
                key: `C_ARGS|${npc.file}|${npc.key}|${rec.cmd}|${s.expect}|${s.got}`,
                message: `${npc.key}: ${rec.cmd} expected "${s.expect}" but found "${s.got}"; the server skips it blindly and the arguments shift` }, at));
              break;
            }
          }
        }
        const slotArg = rec.args.slot;
        if (slotArg && (slotArg.value < 0 || slotArg.value >= MAX_TAB)) {
          add(Object.assign({ code: 'C_SLOT', severity: 'BLOCK', start: rec.start, end: rec.end,
            key: `C_SLOT|${npc.file}|${npc.key}|${rec.cmd}|${slotArg.value}`,
            message: `${npc.key}: ${rec.cmd} uses tab ${slotArg.value}; only 0-3 exist and the server does not check (memory corruption)` }, at));
        }
        const e = shopEntry(rec);
        if (!e) continue;
        shopCount++;
        const chipShop = npc.venderType === 1 || npc.venderType === 2;
        if (e.kind === 'generated' && chipShop) {
          const ik3 = e.ik3.define || e.ik3.value;
          add(Object.assign({ code: 'C_RULE_IGNORED', severity: 'INFO', start: rec.start, end: rec.end,
            key: `C_RULE_IGNORED|${npc.file}|${npc.key}|${e.slot}|${ik3}|${e.rareMin.value}-${e.rareMax.value}`,
            message: `${npc.key}: ${rec.cmd}(${e.slot}, ${ik3}, ...) is ignored because this is a chip shop (SetVenderType(${npc.venderType}))` }, at));
        }
        if (e.kind === 'fixed' || e.kind === 'chip') {
          const id = e.item.value >>> 0;
          const itemName = e.item.define || e.item.tokens.map(t => t.raw || t.text).join('');
          const prop = items.get(id);
          if (!prop) {
            add(Object.assign({ code: 'C_ITEM', severity: 'BLOCK', start: rec.start, end: rec.end,
              key: `C_ITEM|${npc.file}|${npc.key}|${itemName}`,
              message: `${npc.key}: ${itemName} is not a loaded item in Spec_Item.txt; the shop silently skips it` }, at));
          }
          if (e.kind === 'fixed' && e.cost) {
            const c = e.cost.value;
            if (c <= 0) add(Object.assign({ code: 'C_PRICE_ZERO', severity: 'WARN', start: rec.start, end: rec.end,
              key: `C_PRICE_ZERO|${npc.file}|${npc.key}|${itemName}`, message: `${npc.key}: ${itemName} costs ${c}` }, at));
            if (!priceByItem.has(id)) priceByItem.set(id, []);
            priceByItem.get(id).push({ npc, cost: c, rec, itemName });
          }
          // Mover.cpp:1723 appends AddShopItem entries in every shop type; DPSrvr.cpp:3516 then
          // charges chips (dwReferValue1) without the "chip cost < 1" check AddVenderItem2 gets.
          if (e.kind === 'fixed' && chipShop) {
            add(Object.assign({ code: 'C_FIXED_IN_CHIP', severity: 'WARN', start: rec.start, end: rec.end,
              key: `C_FIXED_IN_CHIP|${npc.file}|${npc.key}|${itemName}`,
              message: `${npc.key}: AddShopItem in a chip shop: ${itemName} is sold for chips without the server's chip-price check` }, at));
          }
          if (e.kind === 'chip' && !chipShop) {
            add(Object.assign({ code: 'C_CHIP_TYPE', severity: 'WARN', start: rec.start, end: rec.end,
              key: `C_CHIP_TYPE|${npc.file}|${npc.key}|${itemName}`,
              message: `${npc.key}: ${rec.cmd} only works in chip shops (SetVenderType(1) or (2)); the server ignores it here` }, at));
          }
          if (e.kind === 'chip' && prop) {
            const chip = FRE.specItem.get(prop, 'dwReferValue1');
            if (chip === -1 || chip < 1) add(Object.assign({ code: 'C_CHIP_COST', severity: 'WARN', start: rec.start, end: rec.end,
              key: `C_CHIP_COST|${npc.file}|${npc.key}|${itemName}`,
              message: `${npc.key}: ${itemName} has no chip price (dwReferValue1); the server skips it in this chip shop` }, at));
          }
        }
      }
      // What the server really puts in each tab (generated rules + fixed items, 100 max)
      const sim = ctx.simulate ? ctx.simulate(npc) : null;
      if (sim) {
        sim.tabs.forEach((tab, t) => {
          const full = tab.dropped.filter(d => d.reason === 'tab full');
          const overflow = tab.rules.reduce((n, r) => n + Math.max(0, (r.matched || 0) - (r.added || 0)), 0);
          if (full.length || overflow) {
            const names = full.map(d => (d.prop && d.prop.item.define) || d.rec.cmd).slice(0, 5).join(', ');
            add(Object.assign({ code: 'C_TAB_FULL', severity: 'WARN', start: npc.start, end: npc.keyEnd, key: `C_TAB_FULL|${npc.file}|${npc.key}|${t}`,
              message: `${npc.key}: tab ${t} would hold more than ${MAX_TAB_ITEMS} items; ${overflow + full.length} are left out${names ? ' (' + names + (full.length > 5 ? ', …' : '') + ')' : ''}` }, at));
          }
          for (const r of tab.rules) {
            if (!r.empty) continue;
            const ik3 = r.rec.args.ik3.define || r.rec.args.ik3.value;
            add(Object.assign({ code: 'C_RULE_EMPTY', severity: 'INFO', start: r.rec.start, end: r.rec.end,
              key: `C_RULE_EMPTY|${npc.file}|${npc.key}|${t}|${ik3}|${r.rec.args.rareMin.value}-${r.rec.args.rareMax.value}`,
              message: `${npc.key}: ${r.rec.cmd}(${t}, ${ik3}, rarity ${r.rec.args.rareMin.value}-${r.rec.args.rareMax.value}) matches no item; the server logs a VENDORITEM error and adds nothing` }, at));
          }
        });
      }
      if (shopCount && tradeMenu !== undefined && !npc.menus.includes(tradeMenu)) {
        const text = ctx.textOf ? ctx.textOf(npc.file) : '';
        const disabled = /\/\/[ \t]*AddMenu[ \t]*\([ \t]*MMI_TRADE/.test(text.slice(npc.start, npc.end));
        add(Object.assign({ code: 'C_NO_TRADE', severity: 'INFO', start: npc.start, end: npc.keyEnd, key: `C_NO_TRADE|${npc.file}|${npc.key}`,
          message: `${npc.key}: players can't buy here: shop items but no Trade menu (the buy code requires MMI_TRADE)` +
            (disabled ? '. The Trade menu is commented out in this NPC, so it was disabled on purpose.' : '') }, at));
      }
    }

    // One price per item: AddShopItem's cost overwrites the item's price globally.
    for (const [id, list] of priceByItem) {
      const costs = new Set(list.map(x => x.cost));
      if (costs.size > 1) {
        const winner = list[list.length - 1];     // load order: file order, then position
        const desc = list.map(x => `${x.npc.key}=${x.cost}`).join(', ');
        add({ code: 'C_PRICE_CONFLICT', severity: 'WARN', file: winner.npc.file, npcKey: winner.npc.key, start: winner.rec.start, end: winner.rec.end,
          key: `C_PRICE_CONFLICT|${winner.itemName}|${[...costs].sort().join('/')}`, itemId: id,
          message: `${winner.itemName} has different AddShopItem prices (${desc}). The price is global: the last one loaded (${winner.npc.key}, ${winner.cost}) applies everywhere` });
      }
    }
    return out;
  }

  FRE.validateCharacters = validateCharacters;
})(globalThis.FRE = globalThis.FRE || {});
