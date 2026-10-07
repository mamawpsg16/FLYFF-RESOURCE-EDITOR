// Edits of an EXISTING NPC (task S): its name, its shop tabs, its right-click menus.
// The ways the proven commits did it:
//   name        f58e56ba  the text after the SetName key in character.txt.txt (Vaelishe -> Penya Shop)
//   tab name    ba92f67f  the same for an AddVendorSlot key (Peach: Awaken -> Scrolls), 5794b14d (Adrian 1/2/3)
//   new tab     d11123ac  an IDS line appended to character.txt.txt + "\tAddVendorSlot( n, IDS_... );" after the
//                         SetName block (Pet Tamer)
//   inline tab  f58e56ba  AddVendorSlot( 0, "Male" ): the text is in character.inc itself
//   menus       AddMenu( MMI_X ); lines (CProject::LoadCharacter, Project.cpp:3405)
// A key used by several NPCs or tabs (IDS_CHARACTER_INC_000049 "n/a" is six tabs) is changed in place only when
// asked ("everywhere"); otherwise this NPC / tab gets its own new key, so nothing else changes.
// Name and tab edits are offered for character.inc NPCs only: the client has no loose copy of
// character-etc.inc / character-school.inc and their string files (it reads data.res), so it would not see them.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const TXT = 'character.txt.txt';
  const MAX_TAB = 4;                 // MAX_VENDOR_INVENTORY_TAB
  const isSlot = r => r.cmd === 'AddVendorSlot' || r.cmd === 'AddVenderSlot';

  const canEditTexts = (ws, npc) => npc.file.toLowerCase() === 'character.inc'
    && ws.isEditable('character.inc') && ws.isEditable(TXT);

  // Every NPC statement that shows the text of `key` (a name, a tab title, a portrait name).
  function keyUses(ws, key) {
    const out = [];
    for (const npc of ws.chars.npcs) for (const r of npc.statements) {
      const tok = r.cmd === 'SetName' ? r.args.name : isSlot(r) ? r.args.title : (r.cmd === 'SetImage' || r.cmd === 'm_szChar') ? r.args.image : null;
      if (tok && tok.stringKey === key) out.push({ npc, rec: r, what: r.cmd === 'SetName' ? 'name' : isSlot(r) ? 'tab' : 'image', slot: isSlot(r) ? r.args.slot.value : null });
    }
    return out;
  }

  // The statement that sets the name / a tab title (the last one wins in LoadCharacter).
  const nameRec = npc => npc.statements.filter(r => r.cmd === 'SetName').pop() || null;
  const slotRecs = (npc, slot) => npc.statements.filter(r => isSlot(r) && r.args.slot.value === slot);
  const slotRec = (npc, slot) => slotRecs(npc, slot).pop() || null;
  const namedSlots = npc => [0, 1, 2, 3].filter(s => npc.slotTitles[s] !== undefined && npc.slotTitles[s] !== '');

  function checkText(text) {
    const p = FRE.newNpcText(text);
    if (p) throw new Error(`The text ${p}.`);
  }

  // A new line "IDS_CHARACTER_INC_n<TAB>text" at the end of character.txt.txt -> { key, splice }
  function newKey(ws, text, n = 0) {
    const f = ws.files.get(TXT);
    const key = FRE.npcOps.idsKey(FRE.npcOps.lastStringId(ws) + 1 + n);
    return { key, splice: FRE.npcOps.appendSplice(f.text, `${key}\t${text}${T.dominantEol(f.text)}`) };
  }

  // Splice that changes the text of an existing key in character.txt.txt (null if the key is not there).
  function textSplice(ws, key, text) {
    const m = ws.strings.meta.get(key);
    if (!m || m.file.toLowerCase() !== TXT) return null;
    const f = ws.files.get(TXT);
    const glue = m.start === m.end && !/[ \t]/.test(f.text[m.start - 1] || '') ? '\t' : '';
    return { start: m.start, end: m.end, insert: glue + text };
  }

  // The parts that make token `tok` (an IDS key or a "quoted" text in npc.file) show `text`.
  // -> { parts, how: 'text' | 'everywhere' | 'own key' | 'inline', key, others: [uses] }
  function retitle(ws, npc, tok, text, everywhere) {
    checkText(text);
    const inc = npc.file.toLowerCase();
    if (!tok.stringKey) {                     // AddVendorSlot( 0, "Male" ) / AddVenderSlot: the text is in character.inc
      return { parts: [{ file: inc, splices: T.replaceSpan(tok, `"${text}"`) }], how: 'inline', key: null, others: [] };
    }
    const key = tok.stringKey;
    const others = keyUses(ws, key).filter(u => (u.rec.args.name || u.rec.args.title || u.rec.args.image) !== tok);
    const sp = textSplice(ws, key, text);
    if (sp && (!others.length || everywhere)) return { parts: [{ file: TXT, splices: [sp] }], how: others.length ? 'everywhere' : 'text', key, others };
    const nk = newKey(ws, text);
    return { parts: [{ file: TXT, splices: [nk.splice] }, { file: inc, splices: T.replaceSpan(tok, nk.key) }], how: 'own key', key: nk.key, oldKey: key, others };
  }

  function renameNpc(ws, npc, text, everywhere = false) {
    if (!canEditTexts(ws, npc)) throw new Error('Only NPCs of character.inc can be renamed here (the client reads the other files from data.res).');
    const rec = nameRec(npc);
    if (!rec) throw new Error(`${npc.key} has no SetName`);
    return retitle(ws, npc, rec.args.name, text, everywhere);
  }

  function renameTab(ws, npc, slot, text, everywhere = false) {
    if (!canEditTexts(ws, npc)) throw new Error('Only NPCs of character.inc can have their tabs renamed here.');
    const rec = slotRec(npc, slot);
    if (!rec) throw new Error(`tab ${slot + 1} has no name yet: use + Tab`);
    return retitle(ws, npc, rec.args.title, text, everywhere);
  }

  // The slot "+ Tab" names: the lowest slot without a name (fills a gap first), or null when all 4 have one.
  function nextSlot(npc) {
    for (let s = 0; s < MAX_TAB; s++) if (npc.slotTitles[s] === undefined || npc.slotTitles[s] === '') return s;
    return null;
  }

  // + Tab (d11123ac): IDS line + "AddVendorSlot( n, KEY );" after the tab below it, else after SetName.
  function addTab(ws, npc, text) {
    if (!canEditTexts(ws, npc)) throw new Error('Only NPCs of character.inc can get new tabs here.');
    checkText(text);
    const slot = nextSlot(npc);
    if (slot === null) throw new Error('This shop already has 4 tabs, the most the game allows (MAX_VENDOR_INVENTORY_TAB).');
    const f = ws.files.get(npc.file.toLowerCase());
    const nk = newKey(ws, text);
    const row = `AddVendorSlot( ${slot}, ${nk.key} );`;
    const lower = npc.statements.filter(r => isSlot(r) && r.args.slot.value < slot).pop();
    const anchor = lower || nameRec(npc) || npc.statements.filter(isSlot).pop() || null;
    const splices = anchor ? T.insertRowAfter(f.text, anchor, row) : T.insertRowBelowLine(f.text, npc.braceTok.start, row);
    return { parts: [{ file: TXT, splices: [nk.splice] }, { file: npc.file.toLowerCase(), splices }], slot, key: nk.key };
  }

  // The tab that may be removed: the last named one, when nothing is sold in it. -> { slot, why }
  function removableTab(npc) {
    const slots = namedSlots(npc);
    if (!slots.length) return { slot: null, why: 'no tab has a name' };
    const slot = slots[slots.length - 1];
    if (npc.statements.some(r => { const e = FRE.character.shopEntry(r); return e && e.slot === slot; }))
      return { slot: null, why: 'the last tab still has items: remove or move them first' };
    return { slot, why: null };
  }

  // Remove the last tab's AddVendorSlot line(s). Its text line stays in character.txt.txt (unused text is harmless).
  function removeTab(ws, npc, slot) {
    if (!canEditTexts(ws, npc)) throw new Error('Only NPCs of character.inc can have tabs removed here.');
    const r = removableTab(npc);
    if (r.slot !== slot) throw new Error(r.why || 'only the last tab can be removed');
    const f = ws.files.get(npc.file.toLowerCase());
    return { parts: [{ file: npc.file.toLowerCase(), splices: slotRecs(npc, slot).flatMap(rec => T.removeRow(f.text, rec)) }] };
  }

  // AddMenu( MMI_X ); after the last AddMenu, else at the top of the "setting { }" block, else below the NPC's brace.
  function addMenu(ws, npc, define) {
    T.checkDefine(define);
    const id = ws.defines.defines.get(define);
    if (id === undefined) throw new Error(`${define} is not defined`);
    if (npc.menus.includes(id)) throw new Error(`${npc.name || npc.key} already has this menu`);
    const f = ws.files.get(npc.file.toLowerCase());
    const row = FRE.shopOps.formatStmt('AddMenu', [define], f.text);
    const last = npc.statements.filter(r => r.cmd === 'AddMenu').pop();
    if (last) return T.insertRowAfter(f.text, last, row);
    const setting = /\bsetting\s*\{/.exec(f.text.slice(npc.braceTok.end, npc.end));
    const at = setting ? npc.braceTok.end + setting.index + setting[0].length - 1 : npc.braceTok.start;
    return T.insertRowBelowLine(f.text, at, row);
  }

  // Remove every AddMenu line of this menu id (AddMenuLang lines are left: they belong to other languages).
  function removeMenu(ws, npc, id) {
    const f = ws.files.get(npc.file.toLowerCase());
    const recs = npc.statements.filter(r => r.cmd === 'AddMenu' && r.args.menu.value === id);
    if (!recs.length) throw new Error('this menu is not an AddMenu line of this NPC');
    return recs.flatMap(rec => T.removeRow(f.text, rec));
  }

  // ---------------------------------------------------------------- where it stands, its model (task S part 3)
  // An NPC's spots: every OT_MOVER record with its key in a map the server loads (CWorld::LoadObject,
  // WorldFile.cpp:297). The key match ignores case, like ws.placed. -> [{ map, file, at, x, y, z, angle, model }]
  function placementsOf(ws, npc) {
    const out = [], k = npc.key.toLowerCase();
    for (const [map, lower] of ws.mapFiles) {
      const f = ws.files.get(lower);
      for (const p of FRE.world.readDyo(f.serialize()).placements)
        if (p.key.toLowerCase() === k) out.push(Object.assign({ map, file: lower }, p));
    }
    return out;
  }

  const f32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return b; };
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };

  // The record bytes a spot / model change rewrites, same length (b6abf414 moved MaFl_Angel's record in place).
  // spot: index into placementsOf(ws, npc), the one that moves; to: { x, y, z, angle } (in /position units) and / or
  // model: 'MI_X'; modelSpots: the spots that get the model (default: only `spot`).
  // -> { parts: [{ file, splices }], changes: [{ spot, field, from, to }] } ; throws on what cannot be done
  function placePlan(ws, npc, spot, to, modelSpots = [spot]) {
    const all = placementsOf(ws, npc);
    if (!all.length) throw new Error(`${npc.key} stands on no map the server loads`);
    const F = FRE.npcOps.FIELD, MPU = FRE.world.OLD_MPU;
    let model = null;
    if (to.model !== undefined && to.model !== null) {
      model = ws.defines.defines.get(to.model);
      if (model === undefined || !/^MI_/.test(to.model)) throw new Error(`${to.model} is not an MI_ model`);
    }
    const byFile = new Map(), changes = [];
    for (const i of [...new Set([spot, ...modelSpots])].sort((a, b) => a - b)) {
      const p = all[i];
      if (!p) throw new Error(`spot ${i + 1} does not exist`);
      const f = ws.files.get(p.file);
      if (!ws.isEditable(p.file)) throw new Error(`${f.name} is read-only`);
      const bytes = f.serialize();
      const want = [];
      if (i === spot) for (const k of ['angle', 'x', 'y', 'z']) if (to[k] !== undefined && to[k] !== null)
        want.push([k, f32(k === 'x' || k === 'z' ? to[k] / MPU : to[k])]);
      if (model !== null && modelSpots.includes(i)) want.push(['model', u32(model)]);
      for (const [k, b] of want) {
        const at = p.at + F[k];
        if (b.every((v, j) => bytes[at + j] === v)) continue;          // same bytes: nothing to write
        if (!byFile.has(p.file)) byFile.set(p.file, []);
        byFile.get(p.file).push({ start: at, end: at + 4, insert: FRE.bytes.bytesToBinaryString(b) });
        changes.push({ spot: i, field: k, from: k === 'model' ? p.model : p[k], to: k === 'model' ? model : to[k] });
      }
    }
    const parts = [...byFile].map(([file, splices]) => ({ file, splices: splices.sort((a, b) => a.start - b.start) }));
    return { parts, changes };
  }

  FRE.npcEditOps = { placementsOf, placePlan, keyUses, canEditTexts, renameNpc, renameTab, nextSlot, addTab, removableTab, removeTab, addMenu, removeMenu, namedSlots, slotRec, nameRec };
})(globalThis.FRE = globalThis.FRE || {});
