// Spec_Item.txt edits. Only the chip price (dwReferValue1) for now: the field the
// proven commits 93a02124 ("Blessing of the Goddess ... 50 Red Chips") and fea9840b
// ("re-price the Red Chip shop") change. One number per item, read by Red Chip and
// Donate Chip shops (CItemBase::GetChipCost, Item.cpp:160) and the Donation Shop,
// so changing it for one shop changes it everywhere (7bedef15).
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const { Script } = FRE.lexer;
  const S = FRE.specItem;

  // Span of one field of a Spec_Item row: re-reads only that row with the same
  // token sequence as loadSpecItem (ver, dwID, szName, then the schema).
  function fieldSpan(text, item, field, defines) {
    const want = S.FIELD_INDEX.get(field);
    if (want === undefined) throw new Error(`unknown Spec_Item field ${field}`);
    const script = new Script(text, { defines: defines || new Map(), diags: [] });
    script.lex.pos = item.start;
    script.getNumber(); script.getNumber(); script.getToken();          // ver, dwID, szName
    for (let i = 0; i <= want; i++) {
      const k = S.SCHEMA[i].kind;
      const r = k === 't' ? script.getToken() : k === 'f' ? script.getFloat() : script.getNumber();
      if (r.eof || r.type === 'eof') throw new Error(`${item.define}: the record ends before ${field}`);
      if (i === want) return { start: r.start, end: r.end };
    }
  }

  // value: chip price (1 .. INT_MAX), or null = "=" (no chip price: chip shops skip the item)
  function setChipPrice(text, item, value, defines) {
    if (value !== null) T.checkAmount(value, 1, 2147483647, 'chip price');
    const span = fieldSpan(text, item, 'dwReferValue1', defines);
    const insert = value === null ? '=' : String(value);
    if (text.slice(span.start, span.end) === insert) return [];
    return T.replaceSpan(span, insert);
  }

  // Every place that sells this item for chips (they all share dwReferValue1).
  function chipUses(ws, itemId) {
    const id = itemId >>> 0, out = [];
    for (const npc of ws.chars ? ws.chars.npcs : []) {
      const type = FRE.shopOps.shopType(npc.venderType);
      if (!type) continue;
      for (const rec of npc.statements) {
        const e = FRE.character.shopEntry(rec);
        if (!e || (e.kind !== 'chip' && e.kind !== 'fixed') || (e.item.value >>> 0) !== id) continue;
        out.push({ kind: 'npc', npc, slot: e.slot, chips: type === 2 ? 'Donate chips' : 'Red chips',
          label: `${npc.name || npc.key} (${type === 2 ? 'Donate Chip' : 'Red Chip'} shop), ${npc.slotTitles[e.slot] || 'tab ' + e.slot}` });
      }
    }
    const ds = ws.models && ws.models.donation;
    for (const row of ds ? ds.rows : []) {
      if (row.id === id) out.push({ kind: 'donation', row, chips: 'Donate chips', label: `Donation Shop, "${row.category}"` });
    }
    return out;
  }

  // dwCost: the item's own Penya price (94881aa2 changed II_CHP_RED's the same way, Server + Client).
  // Shops that sell the item through a rule, or with AddShopItem and no price, charge it; selling
  // to an NPC gives dwCost / 4 (OnSellItem). An AddShopItem price loaded later still replaces it.
  // value: 0 .. INT_MAX, or null = "=" (no price: players pay 1 Penya, the client shows no price)
  function setCost(text, item, value, defines) {
    if (value !== null) T.checkAmount(value, 0, 2147483647, 'price');
    const span = fieldSpan(text, item, 'dwCost', defines);
    const insert = value === null ? '=' : String(value);
    if (text.slice(span.start, span.end) === insert) return [];
    return T.replaceSpan(span, insert);
  }

  // dwShopAble: -1 hides the item from every AddVendorItem rule in every shop. Only
  // CMover::GenerateVendorItem reads it (9bf0cebb), so fixed AddShopItem lines still sell it.
  function setShopAble(text, item, hidden, defines) {
    const span = fieldSpan(text, item, 'dwShopAble', defines);
    const insert = hidden ? '-1' : '1';
    const cur = text.slice(span.start, span.end);
    if (cur === insert || (hidden && cur === '=')) return [];
    return T.replaceSpan(span, insert);
  }

  // Every Penya shop tab that sells this item, and how (a rule, or a fixed line with or without
  // its own price). These all charge the same dwCost (vendorSim.effectiveCosts).
  function penyaUses(ws, itemId) {
    const id = itemId >>> 0, out = [];
    for (const npc of ws.chars ? ws.chars.npcs : []) {
      if (FRE.shopOps.shopType(npc.venderType) !== 0) continue;
      ws.simulate(npc).tabs.forEach((tab, slot) => {
        for (const en of tab.entries) {
          if (en.prop.id !== id) continue;
          const how = en.kind === 'generated' ? 'rule' : en.source.args.cost ? 'own price' : 'fixed';
          out.push({ kind: 'npc', npc, slot, how, rec: en.source,
            label: `${npc.name || npc.key}, ${npc.slotTitles[slot] ? `tab ${slot + 1} "${npc.slotTitles[slot]}"` : 'tab ' + (slot + 1)} (${how === 'rule' ? 'from a rule' : how === 'own price' ? 'AddShopItem with a price' : 'AddShopItem'})` });
        }
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- a new item (J part 2: + New box)
  // The way 949f2cc2 added II_SYS_SYS_SCR_BXMBLKDRAGON01 / _BXFBLKDRAGON01 (verified in game), Server + Client:
  //   defineItem.h      #define\tII_X\t\t\t<id>       before the final #endif
  //   Spec_Item.txt     a copy of an existing row (the template) with its id, name, description, icon and settings changed
  //   propItem.txt.txt  IDS_PROPITEM_TXT_n\t<name> and n+1\t<description>   (UTF-16: any text)
  // 949f2cc2 also wrote Source/Resource/defineItem.h: only C++ reads that copy, and no C++ uses a new box's id.
  const IP_FLAG_BINDS = 0x01;                   // ProjectCmn.h:360; CItemElem::IsBinds (Item.cpp:434) blocks trading
  const ID_LIMIT = 60000;                        // 60000+ is used by __NEW_STACKABLE_AMPS (ProjectCmn.cpp:593)
  const MAX_PACK = 32767;                        // CItemElem::m_nItemNum is a short
  const NAME_PREFIX = 'IDS_PROPITEM_TXT_';

  // The next item id: one above the highest id below 60000 (Spec_Item rows and II_ #defines). null: none left.
  function nextItemId(ws) {
    let max = 0;
    for (const id of ws.items.items.keys()) if (id < ID_LIMIT) max = Math.max(max, id);
    for (const r of ws.items.rows) if (r.id < ID_LIMIT) max = Math.max(max, r.id);
    for (const [, v] of ws.defines.withPrefix('II_')) if ((v >>> 0) < ID_LIMIT) max = Math.max(max, v >>> 0);
    return max + 1 < ID_LIMIT ? max + 1 : null;
  }
  // The highest IDS_PROPITEM_TXT_ number in propItem.txt.txt, Spec_Item.txt and the loaded strings.
  function lastNameId(ws) {
    let max = 0;
    for (const n of ['propitem.txt.txt', 'spec_item.txt']) {
      const f = ws.files.get(n);
      if (f) for (const m of f.text.matchAll(/IDS_PROPITEM_TXT_(\d+)/g)) max = Math.max(max, Number(m[1]));
    }
    for (const k of ws.strings.map.keys()) if (k.startsWith(NAME_PREFIX)) max = Math.max(max, Number(k.slice(NAME_PREFIX.length)) || 0);
    return max;
  }
  const nameKey = n => NAME_PREFIX + String(n).padStart(6, '0');
  // a text as one propItem.txt.txt line: no tabs or line breaks (LoadStrings reads to the end of the line)
  const oneLine = s => String(s || '').replace(/[\t\r\n]+/g, ' ').trim();

  // The spans of the fields to change in one row: dwID and szName by position (ver, dwID, szName), the others by fieldSpan.
  function rowSpans(text, item, fields, defines) {
    const out = {};
    const script = new Script(text, { defines: defines || new Map(), diags: [] });
    script.lex.pos = item.start;
    script.getNumber();
    const id = script.getNumber(), nm = script.getToken();
    out.dwID = { start: id.start, end: id.end };
    out.szName = { start: nm.start, end: nm.end };
    for (const f of fields) if (!out[f]) out[f] = fieldSpan(text, item, f, defines);
    return out;
  }
  // dwFlag with the IP_FLAG_BINDS bit set (tradeable false) or cleared; "=" (NULL_ID, read as 0 by OnAfterLoadPropItem,
  // Project.cpp:4988) stays "=" when nothing else changes
  function flagText(raw, tradeable) {
    const v = raw === '=' ? 0 : (Number(raw) | 0);
    const now = tradeable ? v & ~IP_FLAG_BINDS : v | IP_FLAG_BINDS;
    return now === v ? raw : now === 0 && raw === '=' ? '=' : String(now >>> 0);
  }

  // form: { define, name, desc, icon (file name), cost (null = keep the template's), packMax, tradeable, template: 'II_X' }
  // -> { id, define, keys: { name, desc }, row, lines: { define, strings }, parts: [{ file, splices }] } ; throws when it cannot be built
  function newItemPlan(ws, form) {
    const spec = ws.files.get('spec_item.txt'), def = ws.files.get('defineitem.h'), str = ws.files.get('propitem.txt.txt');
    if (!spec || !def || !str) throw new Error('Spec_Item.txt, defineItem.h and propItem.txt.txt are needed for a new item');
    const D = ws.defines.defines;
    if (!/^II_[A-Z0-9_]+$/.test(form.define || '')) throw new Error(`"${form.define}" is not a valid item name (II_ + capital letters, digits, _)`);
    if (D.has(form.define)) throw new Error(`${form.define} is already defined`);
    const tid = D.get(form.template), tpl = tid === undefined ? null : ws.itemById(tid);
    if (!tpl) throw new Error(`the template item ${form.template} is not in Spec_Item.txt`);
    const id = nextItemId(ws);
    if (id === null) throw new Error(`no free item id below ${ID_LIMIT}`);
    if (!/^[\x21-\x7e]+$/.test(form.icon || '') || form.icon.includes('"')) throw new Error('the icon must be a file name like Itm_SysSysScrBxLuck.dds');
    T.checkAmount(form.packMax, 1, MAX_PACK, 'The stack size');
    if (form.cost !== null && form.cost !== undefined) T.checkAmount(form.cost, 0, 2147483647, 'The price');
    const name = oneLine(form.name);
    if (!name) throw new Error('the name is empty');
    const n = lastNameId(ws), keys = { name: nameKey(n + 1), desc: nameKey(n + 2) };

    // the row: the template's text with only these fields changed
    const sp = rowSpans(spec.text, tpl, ['dwPackMax', 'dwCost', 'dwFlag', 'szIcon', 'szCommand'], D);
    const rawFlag = spec.text.slice(sp.dwFlag.start, sp.dwFlag.end);
    const put = {
      dwID: form.define, szName: keys.name, dwPackMax: String(form.packMax),
      dwCost: form.cost === null || form.cost === undefined ? spec.text.slice(sp.dwCost.start, sp.dwCost.end) : String(form.cost),
      dwFlag: flagText(rawFlag, form.tradeable !== false), szIcon: `"${form.icon}"`, szCommand: keys.desc,
    };
    let row = '', at = tpl.start;
    for (const [f, s] of Object.entries(sp).sort((a, b) => a[1].start - b[1].start)) { row += spec.text.slice(at, s.start) + put[f]; at = s.end; }
    row += spec.text.slice(at, tpl.end);
    const seol = T.dominantEol(spec.text);

    // defineItem.h: before the last #endif, with the EOL of the line above it
    const endif = def.text.lastIndexOf('#endif');
    if (endif < 0) throw new Error('defineItem.h has no #endif');
    const dAt = def.text.lastIndexOf('\n', endif - 1) + 1;
    const above = def.text.slice(0, dAt);
    const deol = /\r\n$/.test(above) ? '\r\n' : /\n$/.test(above) ? '\n' : T.dominantEol(def.text);
    const defLine = `#define\t${form.define}\t\t\t${id}${deol}`;

    const teol = T.dominantEol(str.text);
    const desc = oneLine(form.desc) || name;
    const strLines = `${keys.name}\t${name}${teol}${keys.desc}\t${desc}${teol}`;
    return {
      id, define: form.define, keys, row, name, desc,
      lines: { define: defLine, strings: strLines, row: row + seol },
      parts: [
        { file: 'defineitem.h', splices: [{ start: dAt, end: dAt, insert: defLine }] },
        { file: 'spec_item.txt', splices: [FRE.npcOps.appendSplice(spec.text, row + seol)] },
        { file: 'propitem.txt.txt', splices: [FRE.npcOps.appendSplice(str.text, strLines)] },
      ],
    };
  }

  // A box's own settings on its Spec_Item row: { cost (null = "="), packMax, tradeable }; only the fields given change.
  function setItemSettings(text, item, s, defines) {
    const out = [];
    if (s.cost !== undefined) out.push(...setCost(text, item, s.cost, defines));
    if (s.packMax !== undefined) {
      T.checkAmount(s.packMax, 1, MAX_PACK, 'The stack size');
      const sp = fieldSpan(text, item, 'dwPackMax', defines);
      if (text.slice(sp.start, sp.end) !== String(s.packMax)) out.push(...T.replaceSpan(sp, String(s.packMax)));
    }
    if (s.tradeable !== undefined) {
      const sp = fieldSpan(text, item, 'dwFlag', defines), raw = text.slice(sp.start, sp.end), now = flagText(raw, s.tradeable);
      if (now !== raw) out.push(...T.replaceSpan(sp, now));
    }
    return out;
  }
  // tradeable as players see it: the bind bit after OnAfterLoadPropItem (IK3_BINDS / IK3_EVENTMAIN are always bound)
  function isTradeable(ws, item) {
    let f = S.get(item, 'dwFlag');
    if (f === -1) f = 0;
    const ik3 = S.get(item, 'dwItemKind3'), D = ws.defines.defines;
    if (ik3 !== -1 && (ik3 === D.get('IK3_EVENTMAIN') || ik3 === D.get('IK3_BINDS'))) return { tradeable: false, forced: true };
    return { tradeable: (f & IP_FLAG_BINDS) === 0, forced: false };
  }

  FRE.itemOps = { fieldSpan, setChipPrice, chipUses, setCost, setShopAble, penyaUses,
    nextItemId, lastNameId, nameKey, newItemPlan, setItemSettings, isTradeable, flagText, IP_FLAG_BINDS, ID_LIMIT, MAX_PACK };
})(globalThis.FRE = globalThis.FRE || {});
