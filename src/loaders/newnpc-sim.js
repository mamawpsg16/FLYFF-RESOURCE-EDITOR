// What the game does with an NPC after the files are written (Add New NPC simulator).
// Runs on the workspace's CURRENT text/bytes, so after FRE.npcOps' splices it shows the new NPC
// exactly as the servers and the client would load it:
//   CProject::LoadCharacter (Project.cpp:3257)      key (last block wins), AddMenu, SetName, AddVendorSlot
//   CScript::LoadString (*.txt.txt)                 name and tab titles (first key wins)
//   CWorld::LoadObject / ReadObj / CMover::Read     every map record with this key, x and z * OLD_MPU
//   CWorld::IsUsableDYO2                            SetOutput / SetLang
//   CMover::ProcessRegenItem                        the 4 shop tabs (loaders/vendor-sim.js)
//   CProject::LoadEtc structure, MoverRender  the [tag] above the name (Project.cpp:1262, MoverRender.cpp:1717)
//   CWndWorld::OnCommand switch          which menu ids open the exchange window (WndWorld.cpp:4379, default 6470)
//   right-click menu labels                         TID_MMI_DIALOG (7000) + menu id (WndWorld.cpp, textClient.inc)
//   loaders/area.js                                 where it stands, /te
// Not modelled: IsUsableDYO's event-state keys (Npc_Reward, MaFl_GuildWar, … — a new key is never one of
// them), the client's model loading, dialog scripts (WorldDialog.dll).
(function (FRE) {
  'use strict';
  const TID_MMI_DIALOG = 7000;

  // -> null (no NPC with this key) or { key, file, name, nameKey, shown, tag: { id, text: '[General]', overflow } | null, menus: [{ id, define, label }],
  //    tabs: [{ slot, title, items: [id] , dropped }], placed: [{ map, x, y, z, angle, model, modelName }], where }
  function inGame(ws, key) {
    const list = ws.chars && ws.chars.byKey.get(String(key).toLowerCase());
    if (!list || !list.length) return null;
    const npc = list[list.length - 1];                     // a duplicate key replaces the earlier NPC
    const D = ws.defines;
    const menus = rightClick(ws, npc.menus);
    const sim = FRE.vendorSim.simulateNpc(ws.vendorIndex, npc);
    const tabs = sim.tabs.map((t, slot) => ({ slot, title: npc.slotTitles[slot] !== undefined ? npc.slotTitles[slot] : null,
      items: t.entries.map(e => e.prop.id), dropped: t.dropped.length }))
      .filter(t => t.title !== null || t.items.length);
    const placed = [];
    for (const [map, lower] of ws.mapFiles) {
      for (const p of FRE.world.readDyo(ws.files.get(lower).serialize()).placements) {
        if (p.key.toLowerCase() !== String(key).toLowerCase()) continue;
        const mv = ws.movers && ws.movers.movers.get(p.model);
        placed.push({ map, x: p.x, y: p.y, z: p.z, angle: p.angle, model: p.model, modelName: mv ? mv.name : null });
      }
    }
    return { key: npc.key, file: npc.file, name: npc.name, nameKey: npc.nameKey, shown: FRE.world.npcShown(npc),
      tag: tagOf(ws, npc), menus, tabs, placed, where: ws.whereOf(npc.key) };
  }

  // The client's right-click menu (CWndWorld, WndWorld.cpp:7229): m_abMoverMenu is a flag per id, so
  // each menu shows once, in id order 0..MAX_MOVER_MENU-1, whatever the order of the AddMenu lines.
  // V19 always opens the popup (0 < nCount), even for one menu. Labels: TID_MMI_DIALOG + id, except
  //   MMI_GUILDCOMBAT_RANKING  "Overall Rankings", followed by "Weekly Rankings" when the NPC has that one too
  //   MMI_GUILDCOMBAT_RANKING_WEEKLY  never listed on its own
  //   MMI_COLLECTOR_DETAILS    "Collection Details" (__COLLECTOR_DETAILS)
  //   MMI_GUILDBANKING         only for a guild member, when the guild warehouse is on
  //   MMI_ARENA_ENTER          only after the first job change (__JEFF_11_4)
  // Menu ids with their own case in CWndWorld::OnCommand (WndWorld.cpp:4379-6724, every `case MMI_x:` of its
  // switch( nID ), #ifdef blocks included). Any other id falls to `default:` (6470, __TRADESYS) and opens the
  // exchange window for that id (CWndDialogEvent::SetMMI), which lists the menu's SETs from the client's
  // Exchange_Script.txt. (139 names; tools/oracle_sim.py reads the same list from the C++ file itself.)
  const OWN_CASE = new Set([
    'MMI_ADD_MESSENGER', 'MMI_ARENA_ENTER', 'MMI_ARENA_EXIT', 'MMI_ATTRIBUTE', 'MMI_BANKING', 'MMI_BEAUTYSHOP', 'MMI_BEAUTYSHOP_SKIN',
    'MMI_BLESSING_CANCEL', 'MMI_BUFFPET_RELEASE', 'MMI_BUFFPET_STATUS', 'MMI_CHANGEELEM', 'MMI_CHEER', 'MMI_COLLECTOR_DETAILS',
    'MMI_COLOSSEUM_COLOENTER01', 'MMI_COSTUMEMIX01', 'MMI_DIALOG', 'MMI_DUEL', 'MMI_DUEL_PARTY', 'MMI_FINDWORD', 'MMI_FIVESYSTEM',
    'MMI_GUILDBANKING', 'MMI_GUILDCOMBAT_1TO1_CANCEL', 'MMI_GUILDCOMBAT_1TO1_ENTRANCE', 'MMI_GUILDCOMBAT_1TO1_GUIDE_ENTRY',
    'MMI_GUILDCOMBAT_1TO1_GUIDE_PRIZE', 'MMI_GUILDCOMBAT_1TO1_GUIDE_RULE', 'MMI_GUILDCOMBAT_1TO1_GUIDE_TEX',
    'MMI_GUILDCOMBAT_1TO1_GUIDE_WIN', 'MMI_GUILDCOMBAT_1TO1_OFFER', 'MMI_GUILDCOMBAT_1TO1_OFFERSTATE', 'MMI_GUILDCOMBAT_1TO1_REPAYMENT',
    'MMI_GUILDCOMBAT_1TO1_SELECTION', 'MMI_GUILDCOMBAT_BESTPLAYER', 'MMI_GUILDCOMBAT_INFO_BOARD1', 'MMI_GUILDCOMBAT_INFO_BOARD2',
    'MMI_GUILDCOMBAT_INFO_BOARD3', 'MMI_GUILDCOMBAT_INFO_TEX', 'MMI_GUILDCOMBAT_JACKPOT', 'MMI_GUILDCOMBAT_JACKPOT2',
    'MMI_GUILDCOMBAT_PENYA_RETURN', 'MMI_GUILDCOMBAT_RANKING', 'MMI_GUILDCOMBAT_RANKING_WEEKLY', 'MMI_GUILDCOMBAT_SELECTION',
    'MMI_GUILDHOUSE_AUCTION01', 'MMI_GUILDHOUSE_CHARGE', 'MMI_GUILDHOUSE_ENTER', 'MMI_GUILDHOUSE_OUT', 'MMI_GUILDHOUSE_SALE',
    'MMI_GUILDWAR_APP', 'MMI_GUILDWAR_CANCEL', 'MMI_GUILDWAR_JOIN', 'MMI_GUILDWAR_STATE', 'MMI_HEAVEN_TOWER', 'MMI_INPUT_REWARD',
    'MMI_INVITE_CAMPUS', 'MMI_INVITE_COMPANY', 'MMI_INVITE_PARTY', 'MMI_ITEM_AWAKENING', 'MMI_ITEM_TRANSY', 'MMI_KAWIBAWIBO',
    'MMI_LEGEND_SKILLUP', 'MMI_LOOKCHANGE', 'MMI_LORD_EVENT', 'MMI_LORD_INFO', 'MMI_LORD_RAINBOWAPPLICATION', 'MMI_LORD_RAINBOWEND',
    'MMI_LORD_RAINBOWRULE', 'MMI_LORD_RAINBOWTOPTEN', 'MMI_LORD_RAINBOWWAIT', 'MMI_LORD_RAINBOWWIN', 'MMI_LORD_RAINBOW_ARITHMETIC',
    'MMI_LORD_RAINBOW_CARD', 'MMI_LORD_RAINBOW_DICE', 'MMI_LORD_RAINBOW_KAWIBAWIBO', 'MMI_LORD_RAINBOW_LADDER',
    'MMI_LORD_RAINBOW_STOPWATCH', 'MMI_LORD_RAINBOW_TYPING', 'MMI_LORD_RPINFO', 'MMI_LORD_STATE', 'MMI_LORD_TENDER', 'MMI_LORD_VOTE',
    'MMI_LVREQDOWN_CANCEL', 'MMI_MARKING', 'MMI_MESSAGE', 'MMI_NPC_BUFF', 'MMI_PET_AWAK_CANCEL', 'MMI_PET_EGG01', 'MMI_PET_FOODMILL',
    'MMI_PET_RELEASE', 'MMI_PET_RES', 'MMI_PET_STATUS', 'MMI_PIERCING', 'MMI_POST', 'MMI_QUERYEQUIP', 'MMI_QUIZ_ENTRANCE', 'MMI_QUIZ_EXIT',
    'MMI_QUIZ_TELE_QUIZZONE', 'MMI_RANK_GUILD', 'MMI_RANK_INFO', 'MMI_RANK_WAR', 'MMI_REASSEMBLE', 'MMI_REMOVE_CAMPUS', 'MMI_RENAME_CANCEL',
    'MMI_REPAIR', 'MMI_RETURNTO_WORLD', 'MMI_SECRET_BOARD', 'MMI_SECRET_CANCEL', 'MMI_SECRET_ENTRANCE', 'MMI_SECRET_ENTRANCE_1',
    'MMI_SECRET_OFFER', 'MMI_SECRET_OFFERSTATE', 'MMI_SECRET_SELECTION', 'MMI_SECRET_TAXRATES_CHECK', 'MMI_SHOW_REWARD',
    'MMI_SMELT_CHANGEGWEAPON', 'MMI_SMELT_CHANGEUWEAPON', 'MMI_SMELT_EXTRACTION', 'MMI_SMELT_JEWEL', 'MMI_SMELT_MIXJEWEL',
    'MMI_SMELT_REMOVE_JEWEL', 'MMI_SMELT_REMOVE_PIERCING', 'MMI_SMELT_SAFETY_ACCESSORY', 'MMI_SMELT_SAFETY_ELEMENT',
    'MMI_SMELT_SAFETY_GENERAL', 'MMI_SMELT_SAFETY_PIERCING', 'MMI_SUMMON_ANGEL', 'MMI_SUMMON_EXTRACTOPER', 'MMI_SUMMON_MAKECID',
    'MMI_SUMMON_MAKEOPER', 'MMI_SUMMON_MAKEOPERCID', 'MMI_SUMMON_PEARCING', 'MMI_SUMMON_SMELT', 'MMI_SUMMON_UPGRADECID', 'MMI_TELEPORTER',
    'MMI_TRACE', 'MMI_TRADE', 'MMI_UPGRADE', 'MMI_VISIT_FRIEND', 'MMI_VISIT_MYROOM',
  ]);
  function rightClick(ws, ids) {
    const D = ws.defines, id = n => D.defines.get(n);
    const on = new Set(ids.filter(i => i >= 0 && i < 350));
    const out = [];
    const tid = i => { const t = ws.texts && ws.texts.byId.get(TID_MMI_DIALOG + i); return t ? t.text : null; };
    for (const i of [...on].sort((a, b) => a - b)) {
      const m = { id: i, define: D.byValue('MMI_', i), label: tid(i), when: null };
      if (i === id('MMI_GUILDCOMBAT_RANKING_WEEKLY')) continue;
      if (i === id('MMI_GUILDCOMBAT_RANKING')) {
        out.push(Object.assign(m, { label: 'Overall Rankings' }));
        const w = id('MMI_GUILDCOMBAT_RANKING_WEEKLY');
        if (on.has(w)) out.push({ id: w, define: 'MMI_GUILDCOMBAT_RANKING_WEEKLY', label: 'Weekly Rankings', when: null });
        continue;
      }
      if (i === id('MMI_COLLECTOR_DETAILS')) m.label = 'Collection Details';
      if (i === id('MMI_GUILDBANKING')) m.when = 'guild member, guild warehouse on';
      if (i === id('MMI_ARENA_ENTER')) m.when = 'after the first job change';
      m.opens = opensOf(ws, i);
      out.push(m);
    }
    return out;
  }

  // What clicking menu id i opens: null (its own window, a case in OnCommand) or the exchange window:
  // { exchange: true, sets: number of SETs the menu really has in Exchange_Script.txt (0 = an empty window) }
  function opensOf(ws, i) {
    const names = ws.defines.withPrefix('MMI_').filter(([, v]) => v === i).map(([k]) => k);
    if (names.some(n => OWN_CASE.has(n))) return null;
    const model = ws.models && ws.models.exchange;
    const menu = model && model.menus.find(x => x.mmi.value === i);
    return { exchange: true, sets: menu ? Math.min(menu.sets.length, 30) : 0 };
  }

  // One line per fact, for tools/newnpc-sim.js and the editor's "In game" box.
  function describe(g, itemName = id => String(id)) {
    if (!g) return ['Not in the game: no NPC with this key in character.inc.'];
    const out = [];
    out.push(`${g.name || g.key} (${g.key}, ${g.file})${g.shown ? '' : ' — HIDDEN by SetOutput / SetLang'}`);
    if (g.tag) out.push(`Above the name: ${g.tag.text}${g.tag.overflow ? ' — OUTSIDE m_aStructure (memory overwrite)' : ''}`);
    if (!g.placed.length) out.push('Not placed on any map: nobody can see it.');
    for (const p of g.placed) out.push(`Stands on ${p.map} at /position ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, facing ${p.angle.toFixed(1)}°, model ${p.modelName || p.model}`);
    for (const w of g.where || []) out.push(`Where: ${FRE.area.label ? FRE.area.label(w) : w.caption} · GM: ${w.te}`);
    out.push('Right-click: ' + (g.menus.length ? g.menus.map(m => (m.label || m.define || m.id) + (m.when ? ` (${m.when})` : '') +
      (m.opens ? ` [exchange window: ${m.opens.sets ? m.opens.sets + ' exchange' + (m.opens.sets === 1 ? '' : 's') : 'EMPTY'}]` : '')).join(', ') : '(no menu)'));
    for (const t of g.tabs) out.push(`Tab ${t.slot + 1} "${t.title === null ? '(no title)' : t.title}": ${t.items.length} item(s)` +
      (t.items.length ? ' — ' + t.items.slice(0, 6).map(itemName).join(', ') + (t.items.length > 6 ? ', …' : '') : '') + (t.dropped ? ` (${t.dropped} left out)` : ''));
    return out;
  }

  // mdlDyna.inc ("model" line of Masquerade.prj, read by the server and the client): MI_ name -> model file name
  // ("MaFlJuria" -> Model/Mvr_MaFlJuria.o3d). The model loader (CModelMng) is not in this source tree, so a
  // model is trusted only when it has an entry here AND an NPC players can see already uses it.
  function modelNames(ws) {
    if (ws._mdl !== undefined) return ws._mdl;
    const f = ws.files.get('mdldyna.inc');
    const out = f ? new Map() : null;
    if (f) for (const m of f.text.matchAll(/"([^"\r\n]*)"[ \t]+(MI_\w+)[ \t]+MODELTYPE_/g)) if (!out.has(m[2])) out.set(m[2], m[1]);
    return (ws._mdl = out);
  }
  // mdlDyna.inc entries with their motion block: MI_ name -> { name, anis: [motion file stems] }
  //   "MaFlJuria" MI_MAFL_JURIA MODELTYPE_ANIMATED_MESH ... { "idle1" MTI_IDLE1 "stand" MTI_STAND ... }
  // Files the client needs: Model/Mvr_<name>.o3d and Model/Mvr_<name>_<motion>.ani (names are not case-sensitive on Windows).
  function modelEntries(ws) {
    if (ws._mdlEnt !== undefined) return ws._mdlEnt;
    const f = ws.files.get('mdldyna.inc');
    if (!f) return (ws._mdlEnt = null);
    const out = new Map();
    const re = /"([^"\r\n]*)"[ \t]+(MI_\w+)[ \t]+MODELTYPE_\w+[^\r\n]*(?:\s*\{([^}]*)\})?/g;
    for (const m of f.text.matchAll(re)) {
      if (out.has(m[2])) continue;
      const anis = m[3] ? [...new Set([...m[3].matchAll(/"([^"\r\n]+)"\s+MTI_\w+/g)].map(x => x[1]))] : [];
      out.set(m[2], { name: m[1], anis });
    }
    return (ws._mdlEnt = out);
  }
  // The model files missing from Client/Model for this MI_ name: [] = complete; null = the folder's names are not known.
  // Textures count too once the .o3d has been read (ws.modelTextures) and Client/Model/Texture listed (ws.clientTextures).
  function missingModelFiles(ws, define) {
    if (!ws.clientModels) return null;
    const e = modelEntries(ws) && modelEntries(ws).get(define);
    if (!e) return null;
    const o3d = `Mvr_${e.name}.o3d`;
    const need = [o3d, ...e.anis.map(a => `Mvr_${e.name}_${a}.ani`)];
    const miss = need.filter(n => !ws.clientModels.has(n.toLowerCase()));
    const tex = ws.modelTextures && ws.modelTextures.get(o3d.toLowerCase());
    if (tex && ws.clientTextures) for (const t of tex) if (!ws.clientTextures.has(t)) miss.push('Texture/' + t);
    return miss;
  }
  // The texture files an .o3d names (lowercase, sorted). The model loader (CModelMng / CObject3D) is not in this
  // source tree; in every Mvr_*.o3d of the client (457 files, 15,871 names) a texture name is stored as a 4-byte
  // length (name + NUL), the name, and a NUL. bytes: Uint8Array
  function o3dTextures(bytes) {
    const s = FRE.bytes.bytesToBinaryString(bytes);
    const out = new Set();
    const u32 = i => (s.charCodeAt(i) | s.charCodeAt(i + 1) << 8 | s.charCodeAt(i + 2) << 16 | s.charCodeAt(i + 3) << 24) >>> 0;
    for (const m of s.matchAll(/\.(?:dds|tga|bmp)\x00/gi)) {
      const end = m.index + m[0].length - 1;                 // the NUL
      // walk back over printable bytes; the name starts where the 4 bytes before it hold (name length + 1)
      for (let st = m.index - 1; st >= 4 && /[\x20-\x7e]/.test(s[st]); st--) {
        if (u32(st - 4) === end - st + 1) { out.add(s.slice(st, end).toLowerCase()); break; }
      }
    }
    return [...out].sort();
  }
  // Models no visible NPC uses that have an mdlDyna entry, a propMover row and every file: [{ id, define, name }]
  function unusedCompleteModels(ws) {
    if (!ws.clientModels || !modelEntries(ws)) return [];
    const proven = provenModels(ws);
    const out = [];
    for (const define of modelEntries(ws).keys()) {
      const id = ws.defines.defines.get(define);
      if (id === undefined || proven.has(id) || !(ws.movers && ws.movers.movers.has(id))) continue;
      if ((missingModelFiles(ws, define) || ['?']).length) continue;
      if (ws.defines.byValue('MI_', id) !== define) continue;       // first #define of that id only
      out.push({ id, define, name: ws.movers.movers.get(id).name });
    }
    return out.sort((a, b) => (a.name || a.define).localeCompare(b.name || b.define));
  }

  // NPCs players can see now: placed on a map the server loads AND shown by IsUsableDYO2.
  // -> [{ key, npc, map, x, y, z, angle, model }]
  function visibleNpcs(ws) {
    const out = [];
    for (const [map, lower] of ws.mapFiles) for (const p of FRE.world.readDyo(ws.files.get(lower).serialize()).placements) {
      const list = ws.chars && ws.chars.byKey.get(p.key.toLowerCase());
      const npc = list && list[list.length - 1];
      if (npc && FRE.world.npcShown(npc)) out.push(Object.assign({ npc, map }, p));
    }
    return out;
  }
  // NPCs players saw until a proven commit hid them (b6abf414: MaFl_Shain and MaFl_COUPONPANG got SetOutput(false);
  // MaFl_ANGEL2011's SetLang(LANG_KOR) had made it visible to every non-Korean client). Their .dyo records are unchanged,
  // so their models were seen in game.
  const SEEN_BEFORE = [['MaFl_Shain', 'b6abf414'], ['MaFl_COUPONPANG', 'b6abf414'], ['MaFl_ANGEL2011', 'b6abf414']];
  // -> Map model id -> [{ key, name, commit }]
  function seenBefore(ws) {
    const out = new Map();
    for (const [map, lower] of ws.mapFiles) for (const p of FRE.world.readDyo(ws.files.get(lower).serialize()).placements) {
      const hit = SEEN_BEFORE.find(([k]) => k.toLowerCase() === p.key.toLowerCase());
      if (!hit) continue;
      const list = ws.chars && ws.chars.byKey.get(p.key.toLowerCase());
      if (!out.has(p.model)) out.set(p.model, []);
      out.get(p.model).push({ key: hit[0], name: list ? list[list.length - 1].name || hit[0] : hit[0], commit: hit[1] });
    }
    return out;
  }
  // Models proven to load in game: an NPC players can see uses it, or one did until a proven commit hid it
  const provenModels = ws => new Set([...visibleNpcs(ws).map(p => p.model), ...seenBefore(ws).keys()]);

  // CProject::LoadEtc's "structure" block (Project.cpp:1262), read with the server's CScript:
  //   GetToken (skip {); id = GetNumber(); while( *token != '}' ) { GetToken(); _tcscpy( m_aStructure[ id ].szName, token ); id = GetNumber(); }
  // GetToken swaps an IDS_ key for its etc.txt.txt text. m_aStructure has MAX_STRUCTURE (20, compiled from
  // defineNeuz.h) rows of szName[32] (Project.h:334): an id outside 0..19 or a text of 32+ characters writes
  // past it. Tags 14-17 were added this way in b4b9a465 (verified in game).
  // -> { names: Map id -> text (last one wins, like the copy), max: MAX_STRUCTURE, bad: [{ id, text, why }] }
  function structures(ws) {
    const inc = ws.files.get('etc.inc');
    const max = ws.defines.defines.get('MAX_STRUCTURE') || 20;
    const out = { names: new Map(), max, bad: [] };
    if (!inc) return out;
    const sc = new FRE.lexer.Script(inc.text, { defines: ws.defines.defines, strings: ws.strings.map, diags: [] });
    for (let t = sc.getToken(); t.type !== 'eof'; t = sc.getToken()) {
      if (t.text !== 'structure') continue;
      sc.getToken();                                        // {
      let id = sc.getNumber().value;
      while (sc.token.text !== '}' && sc.token.type !== 'eof') {
        const name = sc.getToken().text;
        if (id < 0 || id >= max) out.bad.push({ id, text: name, why: 'id' });
        else { out.names.set(id, name); if (name.length >= 32) out.bad.push({ id, text: name, why: 'long' }); }
        id = sc.getNumber().value;
      }
      break;
    }
    return out;
  }
  // building tag texts: id -> text (the ones etc.inc names)
  function buildingNames(ws) {
    return structures(ws).names;
  }
  // The row a new tag takes: the lowest id under MAX_STRUCTURE with no SRT_ #define and no etc.inc entry
  // (18, 19 today). -> [ids]
  function freeStructureIds(ws) {
    const st = structures(ws);
    const defined = new Set(ws.defines.withPrefix('SRT_').map(([, v]) => v));
    const out = [];
    for (let id = 1; id < st.max; id++) if (!defined.has(id) && !st.names.has(id)) out.push(id);
    return out;
  }
  // What the client draws above an NPC's name (MoverRender.cpp:1717): "[%s]" of m_aStructure[ m_nStructure ].szName
  // when m_nStructure != -1 (CHARACTER::Clear sets -1), else nothing. -> { id, text, overflow } or null
  function tagOf(ws, npc) {
    const r = [...npc.statements].reverse().find(x => x.cmd === 'm_nStructure' && x.args.structure);
    const id = r ? r.args.structure.value : -1;
    if (id === -1) return null;
    const st = structures(ws);
    const text = st.names.get(id) || '';
    return { id, text: `[${text}]`, overflow: id < 0 || id >= st.max || text.length >= 32 };
  }

  // What a player reads standing at (x, z) on a map (file name): the same naming as FRE.area.whereIs
  // (map window region in Madrigal, else the world title; area caption from the .rgn; GM /te).
  function whereAt(ws, map, x, z) {
    const A = ws.area;
    if (!A || !A.firstId.has(map)) return null;
    const r = FRE.area.standAt(A, map, x, z);
    const id = A.firstId.get(map), w = A.worlds.get(id);
    const worldTitle = w && w.title.trim() ? w.title : map;
    const caption = r.caps.map(c => c[0]).join(' / ');
    const place = map === A.madrigal ? (r.mapWindow || worldTitle) : worldTitle;
    const xi = Math.trunc(x), zi = Math.trunc(z);
    return { map, place, caption, label: caption ? `${place} — ${caption}` : place, te: xi > 0 && zi > 0 ? `/te ${id} ${xi} ${zi}` : null };
  }

  // The places a new NPC can go, named as players read them:
  // Madrigal's map-window regions (WdMadrigal.wld.cnt continents titled by propMapComboBoxData), then every
  // other map by its world title. Only maps whose .dyo takes a record (npcOps.insertPoint).
  // -> [{ value, map, place, label, group, npcs: visible NPC count }]
  function regions(ws) {
    const A = ws.area;
    const vis = visibleNpcs(ws).map(p => ({ p, w: whereAt(ws, p.map, p.x, p.z) }));
    const count = (map, place) => vis.filter(v => v.p.map === map && (!place || (v.w && v.w.place === place))).length;
    const out = [];
    for (const map of ws.mapFiles.keys()) {
      if (FRE.npcOps.insertPoint(ws.mapFile(map).serialize()) === null) continue;
      const id = A && A.firstId.get(map), w = id !== undefined && A.worlds.get(id);
      const title = w && w.title.trim() ? w.title : map;
      if (A && map === A.madrigal) {
        const names = [...new Set([...A.cont.keys()].map(k => (A.maps.find(m => m.loc === k) || {}).title).filter(Boolean))];
        for (const place of names.sort()) out.push({ value: `${map}|${place}`, map, place, label: place, group: title, npcs: count(map, place) });
        out.push({ value: `${map}|${title}`, map, place: title, label: `${title} (outside every region)`, group: title, npcs: count(map, title) });
      } else {
        out.push({ value: `${map}|${title}`, map, place: title, label: `${title} (${map})`, group: /^Du/i.test(map) ? 'Dungeons' : 'Other places', npcs: count(map, null) });
      }
    }
    return out;
  }

  FRE.newNpcSim = { inGame, describe, rightClick, opensOf, OWN_CASE, modelNames, modelEntries, missingModelFiles, unusedCompleteModels, visibleNpcs, provenModels, seenBefore, o3dTextures, SEEN_BEFORE, buildingNames, structures, freeStructureIds, tagOf, whereAt, regions, TID_MMI_DIALOG };
})(globalThis.FRE = globalThis.FRE || {});
