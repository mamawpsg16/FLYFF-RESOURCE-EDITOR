// Rules for a new NPC (docs/HANDOFF-ADD-NPC.md §6). They judge only the new NPC against the
// loaded data; old quirks in the files never block it. BLOCK = the form cannot be saved.
// Every message names the field and how to fix it.
(function (FRE) {
  'use strict';
  const MAX_MOVER_MENU = 350;            // Mover.h: m_abMoverMenu[MAX_MOVER_MENU], no bounds check in AddMenu
  const INT_MAX = 2147483647;
  const BLOCKED_MAPS = new Set(['wdguildwar1to1', 'wdvolcaneyellow']);   // start with junk: the server reads no object
  // Windows-1252 characters above 0x7F that UTF-16 -> code page conversion keeps (0x80-0x9F block + 0xA0-0xFF)
  const CP1252_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
  const isCp1252 = ch => { const c = ch.codePointAt(0); return (c >= 0x20 && c < 0x7f) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch); };

  function textProblem(s) {
    if (typeof s !== 'string' || !s.length) return 'is empty';
    if (s !== s.trim()) return 'starts or ends with a space (the server trims it)';
    if (s.length > 63) return `is ${s.length} characters long (63 at most)`;
    if (/["\r\n]/.test(s)) return 'contains a " or a line break';
    const bad = [...s].find(ch => !isCp1252(ch));
    if (bad) return `contains "${bad}", which the game cannot show (only Windows-1252 characters work; it would show as ?)`;
    return null;
  }

  // The model checks, shared by + NPC and "Edit where / model" (an existing NPC).
  function checkModel(ws, define, add) {
    const D = ws.defines.defines;
    const model = D.get(define);
    if (!define) add('NN_MODEL', 'BLOCK', 'model', 'Pick a model.');
    else if (model === undefined || !/^MI_/.test(String(define))) add('NN_MODEL', 'BLOCK', 'model', `Model ${define} is not in defineObj.h.`);
    else if (ws.movers && !ws.movers.movers.has(model)) add('NN_MODEL', 'BLOCK', 'model', `Model ${define} (${model}) has no row in propMover.txt: the server cannot create it.`);
    else if (FRE.newNpcSim.modelNames(ws) && !FRE.newNpcSim.modelNames(ws).has(define)) add('NN_MODEL', 'BLOCK', 'model', `Model ${define} has no entry in mdlDyna.inc: the game has no 3D model for it.`);
    else if ((FRE.newNpcSim.missingModelFiles(ws, define) || []).length)
      add('NN_MODEL_FILES', 'BLOCK', 'model', `Model ${define} is missing ${FRE.newNpcSim.missingModelFiles(ws, define).join(', ')} in Client/Model: the game cannot draw, colour or animate it.`);
    else if (ws.mapFiles.size && !FRE.newNpcSim.provenModels(ws).has(model)) add('NN_MODEL_UNPROVEN', 'WARN', 'model', `No NPC players can see uses ${define}: not seen in game yet, check it on the test server first.`);
  }

  // The spot checks (x, y, z, angle on the map in `file`), shared by + NPC and "Edit where / model".
  // skipAt: the record offset of the NPC being moved (it does not overlap itself).
  function checkSpot(ws, file, form, add, skipAt = null) {
    const nums = ['x', 'y', 'z', 'angle'];
    const bad = nums.filter(k => typeof form[k] !== 'number' || !Number.isFinite(form[k]));
    if (bad.length) add('NN_POS', 'BLOCK', 'position', `${bad.join(', ')} must be numbers (copy them from /position in game).`);
    else if (form.angle < 0 || form.angle >= 360) add('NN_POS', 'BLOCK', 'position', `Angle ${form.angle} must be 0 or more and under 360.`);
    if (!bad.length) {
      const near = FRE.world.readDyo(file.serialize()).placements.filter(p => p.at !== skipAt);
      const close = near.find(p => Math.hypot(p.x - form.x, p.z - form.z) < FRE.world.OLD_MPU);
      if (close) add('NN_OVERLAP', 'WARN', 'position', `${close.key} stands less than 4 units away: the two NPCs overlap.`);
      let best = null;
      for (const p of near) { const d = Math.hypot(p.x - form.x, p.z - form.z); if (!best || d < best.d) best = { p, d }; }
      if (best && Math.abs(best.p.y - form.y) > 30)
        add('NN_HEIGHT', 'WARN', 'position', `Height ${form.y} is ${Math.round(Math.abs(best.p.y - form.y))} away from the nearest NPC (${best.p.key}, ${best.p.y.toFixed(1)}): it may float or be under the ground. Check y with /position.`);
    }
  }

  // -> [{ code, severity, field, message }]
  function checkNewNpc(ws, form) {
    const out = [];
    const add = (code, severity, field, message) => out.push({ code, severity, field, message, key: `${code}|${field}`, module: 'npc' });
    const D = ws.defines.defines;
    const key = String(form.key || '');

    // --- the NPC
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(key))
      add('NN_KEY', 'BLOCK', 'key', `Key "${key}" must be 1-31 letters, digits or _, not starting with a digit (it is stored in a 32-byte field of the map file).`);
    const dup = ws.chars && ws.chars.byKey.get(key.toLowerCase());
    if (dup && dup.length) add('NN_KEY_DUP', 'BLOCK', 'key', `Key "${key}" already exists in ${dup[0].file} (upper/lower case does not matter) — choose another name.`);
    if (D.has(key) || ws.strings.map.has(key))
      add('NN_KEY_NAME', 'BLOCK', 'key', `Key "${key}" is a ${D.has(key) ? '#define name' : 'text key'}: the server would replace it with ${D.has(key) ? 'a number' : 'its text'} — choose another name.`);
    const np = textProblem(form.name);
    if (np) add('NN_TEXT', 'BLOCK', 'name', `Name ${np}.`);
    let strings = [];
    try { strings = FRE.npcOps.newStrings(ws, form); } catch (e) { /* reported below */ }
    for (const s of strings) if (ws.strings.map.has(s.key)) add('NN_IDS_TAKEN', 'BLOCK', 'name', `Text key ${s.key} is already used in a .txt.txt file.`);

    const menus = form.menus || [];
    const used = new Set(ws.chars ? ws.chars.npcs.flatMap(n => n.menus) : []);
    for (const m of menus) {
      const v = D.get(m);
      if (v === undefined || !/^MMI_/.test(m)) add('NN_MENU', 'BLOCK', 'menus', `Menu ${m} is not in defineNeuz.h: the server would turn it into the Dialog menu.`);
      else if (v < 0 || v >= MAX_MOVER_MENU) add('NN_MENU', 'BLOCK', 'menus', `Menu ${m} = ${v} is outside 0-${MAX_MOVER_MENU - 1}: the server writes past the menu array.`);
      else if (!used.has(v)) add('NN_MENU_NEW', 'WARN', 'menus', `Menu ${m} is used by no other NPC: untested in this game.`);
    }
    if (new Set(menus).size !== menus.length) add('NN_MENU_TWICE', 'WARN', 'menus', 'A menu is ticked twice: it is listed once in game.');
    if (!menus.length && !(form.add && (form.add.exchange || form.add.rules))) add('NN_NO_MENU', 'WARN', 'menus', 'No menu is ticked: right-clicking the NPC does nothing.');
    if (menus.includes('MMI_DIALOG')) add('NN_DIALOG', 'WARN', 'menus', 'Dialog needs a C++ dialog script (WorldDialog.dll); without one the menu does nothing.');

    checkModel(ws, form.model, add);
    if (form.image && !ws.strings.map.has(form.image)) add('NN_IMAGE', 'WARN', 'image', `Portrait ${form.image} is not a known text key: the dialog shows no picture.`);
    if (form.structure && !D.has(form.structure)) add('NN_STRUCTURE', 'BLOCK', 'structure', `${form.structure} is not defined: the server uses 0.`);
    if (form.newTag !== null && form.newTag !== undefined) {
      // a new building tag (b4b9a465): one m_aStructure row (szName[32], MAX_STRUCTURE rows, Project.h:334)
      const text = FRE.npcOps.tagText(form.newTag);
      const free = FRE.newNpcSim.freeStructureIds(ws);
      const tp = textProblem(text);
      const names = [...FRE.newNpcSim.buildingNames(ws).values()].map(t => t.toLowerCase());
      if (!['defineneuz.h', 'etc.inc', 'etc.txt.txt'].every(n => ws.files.get(n)))
        add('NN_TAG_FILES', 'BLOCK', 'structure', 'A new tag needs defineNeuz.h, etc.inc and etc.txt.txt in the Resource folder.');
      else if (!free.length) add('NN_TAG_FULL', 'BLOCK', 'structure', `Every building tag row under MAX_STRUCTURE (${FRE.newNpcSim.structures(ws).max}) is taken: pick an existing tag (a new row needs a C++ rebuild).`);
      if (tp && !/63/.test(tp)) add('NN_TAG_CHARS', 'BLOCK', 'structure', `Tag ${tp}.`);
      else if (text.length > 31) add('NN_TAG_LONG', 'BLOCK', 'structure', `Tag is ${text.length} characters long (31 at most: the game copies it into a 32-byte field and would overwrite memory).`);
      else if (D.has(FRE.npcOps.tagDefine(text, free[0])) || names.includes(text.toLowerCase()))
        add('NN_TAG_DUP', 'BLOCK', 'structure', `[${text}] or ${FRE.npcOps.tagDefine(text, free[0])} already exists: pick it from the list instead.`);
      else if (free.length) add('NN_TAG_ICON', 'INFO', 'structure', `The new tag takes row ${free[0]} (${free.length - 1} left after it). Its minimap icon (row + 6 in the client's icon sheet) has not been seen in game; rows 14-17 work (b4b9a465).`);
    }

    // --- the shop
    const trade = menus.includes('MMI_TRADE');
    const tabs = form.tabs || [];
    if (!trade && tabs.some(t => (t.items || []).length || (t.rules || []).length))
      add('NN_SHOP_NO_TRADE', 'WARN', 'tabs', 'Shop is off: the items in its tabs won\'t be added. Turn Shop on again to keep them.');
    if (trade && !tabs.some(t => (t.items || []).length || (t.rules || []).length))
      add('NN_SHOP_EMPTY', 'BLOCK', 'tabs', 'Trade is ticked but no tab has an item: Trade would open an empty shop.');
    const slots = new Set();
    const index = ws.vendorIndex;
    const fixedPrices = new Map();       // item id -> [{ npc, cost }] from the other NPCs' AddShopItem lines
    if (ws.chars) for (const n of ws.chars.npcs) for (const r of n.statements) {
      if (r.cmd !== 'AddShopItem' || !r.args.cost || !r.args.item) continue;
      const id = r.args.item.value >>> 0;
      if (!fixedPrices.has(id)) fixedPrices.set(id, []);
      fixedPrices.get(id).push({ npc: n.key, cost: r.args.cost.value });
    }
    for (const t of trade ? tabs : []) {
      const f = `tab ${t.slot}`;
      if (!(Number.isInteger(t.slot) && t.slot >= 0 && t.slot <= 3)) add('NN_TAB', 'BLOCK', f, `Tab ${t.slot + 1}: only tabs 1-4 exist (0-3 in the file); a higher one writes past the shop's memory.`);
      else if (slots.has(t.slot)) add('NN_TAB', 'BLOCK', f, `Tab ${t.slot + 1} is listed twice.`);
      slots.add(t.slot);
      const tp = textProblem(t.title);
      if (tp) add('NN_TEXT', 'BLOCK', f, `Tab ${t.slot + 1} title ${tp}.`);
      const seen = new Set();
      let count = 0;
      for (const r of t.rules || []) {
        const ik3 = D.get(r.ik3);
        if (ik3 === undefined || !/^IK3_/.test(String(r.ik3))) { add('NN_RULE', 'BLOCK', f, `Rule kind ${r.ik3} is not in defineItemkind.h.`); continue; }
        if (!(Number.isInteger(r.min) && Number.isInteger(r.max) && r.min >= 0 && r.max >= r.min))
          { add('NN_RULE', 'BLOCK', f, `Rule ${r.ik3}: rarity ${r.min}-${r.max} must be whole numbers, 0 or more, min not above max.`); continue; }
        if (!(Number.isInteger(r.job) && r.job >= -1)) { add('NN_RULE', 'BLOCK', f, `Rule ${r.ik3}: job ${r.job} must be -1 (any job) or a JOB_ number.`); continue; }
        const list = [];
        const res = FRE.vendorSim.expandRule(index, { ik3, job: r.job, rareMin: r.min, rareMax: r.max }, list);
        if (!res.matched) add('NN_RULE_EMPTY', 'WARN', f, `Rule ${r.ik3} rarity ${r.min}-${r.max} matches no item: the server adds nothing${res.empty ? ' (it logs VENDORITEM)' : ''}.`);
        for (const e of list) seen.add(e.prop.id);
        count += res.matched;
      }
      for (const it of t.items || []) {
        const id = D.get(it.define);
        const item = id === undefined ? null : ws.itemById(id);
        if (!item) { add('NN_ITEM', 'BLOCK', f, `Item ${it.define} is not in defineItem.h and Spec_Item.txt: the shop would leave it out.`); continue; }
        if (seen.has(item.id)) add('NN_ITEM_TWICE', 'WARN', f, `${item.name || it.define} is in tab ${t.slot + 1} twice: it shows twice.`);
        seen.add(item.id);
        count++;
        if (it.cost !== undefined && it.cost !== null && it.cost !== '') {
          if (!(Number.isInteger(it.cost) && it.cost >= 1 && it.cost <= INT_MAX)) add('NN_PRICE', 'BLOCK', f, `Price of ${it.define} must be a whole number 1-2,147,483,647.`);
          else {
            add('NN_PRICE_GLOBAL', 'WARN', f, `A price on ${it.define} changes its price in every shop, not only here.`);
            const other = (fixedPrices.get(item.id) || []).find(p => p.cost !== it.cost);
            if (other) add('NN_PRICE_CONFLICT', 'BLOCK', f, `${other.npc} already sets ${it.define} to ${other.cost}; a different price makes the last NPC loaded win. Use ${other.cost} or leave the price out.`);
          }
        }
      }
      if (count > 100) add('NN_TAB_FULL', 'WARN', f, `Tab ${t.slot + 1} would hold ${count} items: only the first 100 show.`);
    }

    // --- the place
    const lowerMap = String(form.map || '').toLowerCase();
    const file = ws.mapFile(form.map);
    if (!file) add('NN_MAP', 'BLOCK', 'map', `Map ${form.map} has no .dyo file in World/.`);
    else if (BLOCKED_MAPS.has(lowerMap) || FRE.npcOps.insertPoint(file.serialize()) === null)
      add('NN_MAP', 'BLOCK', 'map', `Map ${form.map}: the server does not read this map's objects to the end marker, so a new NPC there would not appear. Pick another map.`);
    if (file) checkSpot(ws, file, form, add);
    return out;
  }

  FRE.validateNewNpc = checkNewNpc;
  FRE.validateNpcModel = checkModel;
  FRE.validateNpcSpot = checkSpot;
  FRE.newNpcText = textProblem;
})(globalThis.FRE = globalThis.FRE || {});
