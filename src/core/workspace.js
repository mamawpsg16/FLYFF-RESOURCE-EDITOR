// Workspace: the loaded Resource folder as the editor sees it. No DOM here,
// so it can be tested outside the browser (tests/run-tests.js under gjs).
//
// Shared data (defines, strings, Spec_Item items) is loaded once. Each editor
// is a "data module" that owns some files, parses them and validates them;
// a module whose required files are missing is simply unavailable.
(function (FRE) {
  'use strict';

  // Needed by every editor.
  const CORE = ['Masquerade.prj', 'Spec_Item.txt', 'propItem.txt.txt', ...FRE.DEFINE_FILES];
  // Shared files the editor may write. Spec_Item.txt: only dwReferValue1 (chip prices), the
  // field the proven commits 93a02124 / fea9840b change. The client reads its own copy.
  const CORE_EDITABLE = ['Spec_Item.txt'];
  const CORE_CLIENT = ['Spec_Item.txt'];
  // Read when present, never required (context only).
  // World.inc, world.txt.txt and propMapComboBoxData.*: where NPCs stand (loaders/area.js)
  // mdlDyna.inc: which MI_ models have a model (Add New NPC); etc.inc + etc.txt.txt: building tag names (SRT_)
  const OPTIONAL = ['textClient.inc', 'textClient.txt.txt', 'World.inc', 'world.txt.txt', 'propMapComboBoxData.inc', 'propMapComboBoxData.txt.txt',
    'mdlDyna.inc', 'etc.inc', 'etc.txt.txt'];

  // id, files it needs, files it may write, files the game client also reads,
  // parse(ws) -> model, validate(ws, model) -> diagnostics
  const MODULES = [
    {
      id: 'npc', label: 'NPC Shops', editsSpec: true,
      required: ['character.inc', 'character-etc.inc', 'character-school.inc', 'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt'],
      // character.txt.txt: a new NPC's name and tab names (appended IDS_CHARACTER_INC_ lines, like f58e56ba)
      // defineNeuz.h + etc.inc + etc.txt.txt: a new building tag (SRT_), the way b4b9a465 added four
      // defineText.h + textClient.inc + textClient.txt.txt + Exchange_Script.txt: a new exchange menu (edit/menu-ops.js)
      editable: ['character.inc', 'character-etc.inc', 'character-school.inc', 'character.txt.txt', 'defineNeuz.h', 'etc.inc', 'etc.txt.txt',
        'defineText.h', 'textClient.inc', 'textClient.txt.txt', 'Exchange_Script.txt'],
      client: ['character.inc', 'character-etc.inc', 'character-school.inc', 'character.txt.txt', 'defineNeuz.h', 'etc.inc', 'etc.txt.txt',
        'defineText.h', 'textClient.inc', 'textClient.txt.txt', 'Exchange_Script.txt'],
      uses: ['exchange'],    // the menus' recipes (read here; a new menu's recipes are written with it)
      alsoValidates: ['exchange'],   // exchanges are edited here (the ⇄ tabs), so their checks show here too
      maps: true,            // reads World/*/ to show where each NPC stands
      editsMaps: true,       // a new NPC is a new record in World/<map>/<map>.dyo (Server + Client copies)
      parse(ws) {
        ws._sim = new Map(); ws._costs = null;
        // model names and the "has a propMover row" check of a new NPC (validate/newnpc.js)
        if (!ws.movers && ws.files.get('propmover.txt')) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
        return (ws.chars = FRE.character.loadCharacters(ws.files, { defines: ws.defines.defines, strings: ws.strings.map }));
      },
      validate(ws, model) {
        return FRE.validateCharacters(model, {
          items: ws.items.items, defines: ws.defines.defines,
          simulate: npc => ws.simulate(npc), textOf: n => ws.textOf(n), costs: () => ws.costs(),
        }).map(d => Object.assign({ module: 'npc' }, d));
      },
    },
    {
      id: 'donation', label: 'Donation Shop', editsSpec: true,
      required: ['DonationShop.inc'], editable: ['DonationShop.inc'], client: ['DonationShop.inc'],
      deps: ['Client/DonationShopTree.inc'],   // the client-only category tree (setDonationTree), edited here too
      maps: true,            // where MaFl_DONATION stands (the client opens the shop for that key, WndWorld.cpp:5835)
      parse(ws) {
        const tf = ws.files.get(FRE.donationTree.KEY);
        ws.donationTree = tf ? FRE.donationTree.loadTree(tf) : null;
        return FRE.donation.loadDonation(ws.files.get('donationshop.inc'), { defines: ws.defines.defines, strings: ws.strings.map });
      },
      validate(ws, model) {
        const out = FRE.donation.validateDonation(model, { items: ws.items.items, textOf: n => ws.textOf(n), defines: ws.defines.defines, tree: ws.donationTree });
        return ws.donationTree ? out.concat(FRE.donationTree.validateTree(ws.donationTree)) : out;
      },
    },
    {
      // BattlePass.inc (commit cc73ccdd). propMover.txt gives each monster's name, level and rank.
      id: 'battlepass', label: 'Battle Pass',
      required: ['BattlePass.inc', 'propMover.txt', 'propMover.txt.txt'], editable: ['BattlePass.inc'], client: ['BattlePass.inc'],
      parse(ws) {
        if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
        return FRE.battlePass.loadBattlePass(ws.files.get('battlepass.inc'), { defines: ws.defines.defines, strings: ws.strings.map });
      },
      validate(ws, model) {
        return FRE.battlePass.validateBattlePass(model, { items: ws.items.items, movers: ws.movers.movers, defines: ws.defines.defines, now: ws.now ? ws.now() : new Date(), theme: ws.clientTheme });
      },
    },
    {
      // Exchange_Script.txt (CExchange::Load_Script). The NPC files tell which NPCs open each menu.
      // Not a start-screen task since 2026-10-07 (the user: exchanges belong to their NPC): edited in NPC Shops' ⇄ tabs.
      id: 'exchange', label: 'Exchanges', hidden: true,
      required: ['Exchange_Script.txt'], editable: ['Exchange_Script.txt'], client: ['Exchange_Script.txt'],
      deps: ['character.inc', 'character-etc.inc', 'character-school.inc'],
      uses: ['npc'],         // the NPC files are read (not edited) to name the NPCs that open each menu
      maps: true,            // reads World/*/ to tell which of those NPCs stand in the game, and where
      parse(ws) {
        return FRE.exchange.loadExchange(ws.files.get('exchange_script.txt'), { defines: ws.defines.defines });
      },
      validate(ws, model) {
        return FRE.exchange.validateExchange(model, { items: ws.items.items, npcsByMenu: ws.npcsByMenu(), packMax: it => FRE.specItem.get(it, 'dwPackMax'),
          live: ws.placed ? m => ws.isLiveMenu(m) : null });
      },
    },
    {
      // propMoverEx.inc (CProject::LoadPropMoverEx, Project.cpp:2978): each monster's drops, Penya and max items per kill.
      // Server only: the drop lines are kept #ifdef __WORLDSERVER and there is no loose Client copy.
      // optional: what the kill path also reads (loaders/drops.js), read-only here.
      id: 'drops', label: 'Monster Drops',
      required: ['propMoverEx.inc', 'propMover.txt', 'propMover.txt.txt'], editable: ['propMoverEx.inc'], client: [],
      optional: ['propDropEvent.inc', 'except.txt', 'PenyaTable.txt', 'expTable.inc', 'Event.lua', 'propItemEtc.inc'],
      parse(ws) {
        if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
        if (!ws.dropContext) ws.dropContext = FRE.drops.contextFromFiles(ws);
        return FRE.drops.loadDrops(ws.files.get('propmoverex.inc'), { defines: ws.defines.defines, strings: ws.strings.map, movers: ws.movers.movers });
      },
      validate(ws, model) {
        const f = ws.files.get('propmoverex.inc');
        return FRE.drops.validateDrops(model, { items: ws.items.items, movers: ws.movers.movers, text: f.text, original: f.originalText });
      },
    },
    {
      // propGiftbox.inc (CProject::LoadGiftbox, Project.cpp:4261) = random boxes, server only (UTF-16);
      // propPackItem.inc (CProject::LoadPackItem, Project.cpp:4492) = sets; the game reads its own LF copy (Item Wiki, e08528a5).
      // + New box (J part 2) also writes the box item the 949f2cc2 way: Spec_Item.txt (editsSpec), defineItem.h, propItem.txt.txt,
      // and its ground model line in mdlDyna.inc (Project.cpp:768 m_modelMng.LoadScript); all with a Client copy.
      id: 'boxes', label: 'Boxes', editsSpec: true,
      required: ['propGiftbox.inc', 'propPackItem.inc'],
      editable: ['propGiftbox.inc', 'propPackItem.inc', 'defineItem.h', 'propItem.txt.txt', 'mdlDyna.inc'],
      client: ['propPackItem.inc', 'defineItem.h', 'propItem.txt.txt', 'mdlDyna.inc'],
      deps: ['mdlDyna.inc'],
      parse(ws) {
        const m = FRE.boxes.loadBoxes(ws.files, { defines: ws.defines.defines, strings: ws.strings.map });
        const mf = ws.files.get('mdldyna.inc');
        m.mdl = mf ? FRE.mdlDyna.loadMdlDyna(mf, { defines: ws.defines.defines }) : null;
        // the boxes when the task opened: a box whose contents are removed later gets BX_EMPTIED
        if (!ws._boxIds) ws._boxIds = { gift: new Set(m.gift.boxes.keys()), pack: new Set(m.pack.boxes.keys()), stack: FRE.boxes.stackKeys(m, ws.items.items) };
        return m;
      },
      validate(ws, model) {
        const out = FRE.boxes.validateBoxes(model, { items: ws.items.items, original: ws._boxIds });
        // the same model twice stops the startup with a message box (ModelMng.cpp:455)
        for (const e of model.mdl ? model.mdl.dups : []) out.push({ module: 'boxes', file: 'mdlDyna.inc', code: 'BX_MODEL_DUP', severity: 'BLOCK',
          start: e.idx.start, end: e.idx.end, key: `BX_MODEL_DUP|${e.type}|${e.index}`,
          message: `mdlDyna.inc lists model ${e.define || e.index} (type ${e.type}) twice: the server and the game stop at startup with a message box` });
        return out;
      },
    },
    {
      // Rates & Buffs (task I, loaders/rates.js): Event.lua's rates (WorldServer + DatabaseServer), ServerBuff.txt (WorldServer only),
      // GuildBuff.txt (both; the game only shows what the server sends, but every commit keeps the Client copy in sync: cd03ca46, ca02d0cb).
      // uses drops: the calculator's Penya and item chances (loaders/drops-sim.js); propMover.txt for the monster EXP.
      // part 3 (loaders/couple.js): couple.inc (WorldServer, DatabaseServer and the game; no loose Client copy yet: Save offers to
      // create one so the couple window's level bar matches) and the couple buff items (Spec_Item.txt + their propItem.txt.txt texts).
      id: 'rates', label: 'Rates & Buffs', editsSpec: true,
      // OwnerBuff.txt (Secret Room Winner / Guild Siege Winner pages): WorldServer only (OwnerBuffMng::Load, Project.cpp; the game gets the
      // name / description / icon in SNAPSHOTTYPE_OwnerBuffState), so no Client copy. V19 branch feat/secret-room 885aa231, not yet tested in game.
      required: ['Event.lua'], optional: ['ServerBuff.txt', 'GuildBuff.txt', '1Rebirth.inc', 'expTable.inc', 'couple.inc', 'propItem.txt.txt', 'OwnerBuff.txt'],
      editable: ['Event.lua', 'ServerBuff.txt', 'GuildBuff.txt', '1Rebirth.inc', 'couple.inc', 'propItem.txt.txt', 'OwnerBuff.txt'],
      client: ['GuildBuff.txt', '1Rebirth.inc', 'couple.inc', 'propItem.txt.txt'],
      deps: ['ServerBuff.txt', 'GuildBuff.txt', '1Rebirth.inc', 'couple.inc', 'OwnerBuff.txt'],
      uses: ['drops'],
      parse(ws) { return FRE.rates.fromWorkspace(ws); },
      validate(ws, model) { return FRE.rates.validate(model, { defines: ws.defines, ws }); },
    },
    {
      // Upgrade Rates (task K, loaders/upgrade.js): ItemUpgrade.lua (CItemUpgrade::LoadScript, WorldServer only), s.txt (accessory /
      // collector chances: LoadServerScript, WorldServer; the game reads the collecting blocks of its LF copy, 15091d5f),
      // Ultimate_UltimateWeapon.txt (WorldServer only), WeaponRarity.inc (both, 3168003d). Spec_Item is read for the rate scrolls.
      id: 'upgrade', label: 'Upgrade Rates',
      // Part 2: UpgradeFees.lua (docs/patches/upgrade-fees.diff: the WorldServer and the game read it; created by the editor when
      // there is none: `creates`) and the remove-element text in textClient.txt.txt that names its fee.
      // Baruna.lua: the Baruna upgrade chances (LoadScriptBaruna, WorldServer only, V19 ad93a9af)
      required: ['ItemUpgrade.lua'], optional: ['s.txt', 'Ultimate_UltimateWeapon.txt', 'WeaponRarity.inc', 'UpgradeFees.lua', 'textClient.txt.txt', 'Baruna.lua'],
      editable: ['ItemUpgrade.lua', 's.txt', 'Ultimate_UltimateWeapon.txt', 'WeaponRarity.inc', 'UpgradeFees.lua', 'textClient.txt.txt', 'Baruna.lua'],
      client: ['s.txt', 'WeaponRarity.inc', 'UpgradeFees.lua', 'textClient.txt.txt'],
      deps: ['s.txt', 'Ultimate_UltimateWeapon.txt', 'WeaponRarity.inc', 'UpgradeFees.lua', 'Baruna.lua'],
      creates: ['UpgradeFees.lua'],
      parse(ws) { return FRE.upgrade.fromWorkspace(ws); },
      validate(ws, model) { return FRE.upgradeChecks(model, { ws }); },
    },
    {
      // Set Effects (task G part 1, loaders/sets.js): propItemEtc.inc SetItem blocks (LoadPiercingAvail, Project.cpp:4542; read by
      // the WorldServer and the game: the tooltip lists the pieces and bonuses, 70f8c863), their names in propItemEtc.txt.txt
      // (no loose Client copy yet: the game reads the old one in data.res, so Save offers to create one), and the +N armor
      // bonus in expTable.inc (LoadExpTable `Setitem`, Project.cpp:3829; server and game, no loose Client copy).
      id: 'sets', label: 'Set Effects',
      required: ['propItemEtc.inc'], optional: ['propItemEtc.txt.txt', 'expTable.inc'],
      editable: ['propItemEtc.inc', 'propItemEtc.txt.txt', 'expTable.inc'],
      // expTable.inc: the game lists the +N bonus in an equipped armor piece's tooltip from its own copy (WndManager.cpp:5520
      // GetSetItemAvail). No loose propItemEtc.txt.txt / expTable.inc today: like every missing copy, Save offers to create them
      // (ticked, app.js loadClient); without them the game shows a new set's key and the old +N numbers.
      client: ['propItemEtc.inc', 'propItemEtc.txt.txt', 'expTable.inc'],
      deps: ['propItemEtc.txt.txt', 'expTable.inc'],
      parse(ws) { return FRE.sets.fromWorkspace(ws); },
      validate(ws, model) { return FRE.setChecks(model, { ws }); },
    },
    {
      // Weapon Effects (task G part 2, loaders/weapons.js): each weapon's own 6 stat slots in Spec_Item.txt (editsSpec: the
      // server copy and its LF Client copy, read at startup by both: SetDestParamEquip MoverEquip.cpp:2355, the tooltip
      // PutBaseItemOpt WndManager.cpp:5729). WeaponRarity.inc is read for the rarity bonus (edited in Upgrade Rates).
      id: 'weapons', label: 'Weapon Effects', editsSpec: true,
      required: [], optional: ['WeaponRarity.inc'], editable: [], client: [], deps: ['WeaponRarity.inc'],
      parse(ws) { return FRE.weapons.fromWorkspace(ws); },
      validate(ws, model) { return FRE.weaponChecks(model, { ws }); },
    },
    {
      // Class Buffs (2a, loaders/classbuffs.js): each class's buffs at their top level in propSkillAdd.csv (LoadPropAddSkill,
      // Project.cpp:3014, comma mode) + the tooltip text in propSkill.txt.txt; propSkill.txt read-only (LoadPropItemEx). Both the
      // WorldServer and the game read them at startup; the Client copies get the same change (8cfef4e7 / f8754f67).
      id: 'classbuffs', label: 'Class Buffs',
      required: ['propSkillAdd.csv', 'propSkill.txt', 'propSkill.txt.txt'], editable: ['propSkillAdd.csv', 'propSkill.txt.txt'],
      client: ['propSkillAdd.csv', 'propSkill.txt.txt'], deps: [],
      parse(ws) { return FRE.classBuffs.fromWorkspace(ws); },
      validate(ws, model) { return FRE.classBuffChecks(model, { ws }); },
    },
    {
      // Consumable Stats (task L, loaders/consumables.js): each used item's 6 stat slots and buff time dwSkillTime in Spec_Item.txt
      // (editsSpec: the server copy and its LF Client copy; applied by CMover::DoUseItem MoverSkill.cpp:1455 -> ApplySkill Ctrl.cpp:1102).
      id: 'consumables', label: 'Consumable Stats', editsSpec: true,
      required: [], optional: ['propItem.txt.txt'], editable: ['propItem.txt.txt'], client: ['propItem.txt.txt'], deps: [],
      parse(ws) { return FRE.consumables.fromWorkspace(ws); },
      validate(ws, model) { return FRE.consumableChecks(model, { ws }); },
    },
    {
      // Mini Events (loaders/minievent.js): MiniEvent.inc, CMiniEventMng::ReadConfig (WORLDSERVER/MiniEventMng.cpp:134; read on the
      // WorldServer's first tick and by /eventreload while no event runs). WorldServer only. propMover.txt + the NPC files: the
      // HIDE_NPC mover and character key; FFAManager.inc / TDMManager.inc: the schedule's clashes (CheckClashes :464).
      id: 'minievent', label: 'Mini Events',
      required: ['MiniEvent.inc'], optional: ['propMover.txt', 'propMover.txt.txt', 'character.inc', 'character-etc.inc', 'character-school.inc',
        'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt', 'FFAManager.inc', 'TDMManager.inc', 'GuildCombat.txt', 'FreePKTime.txt'],
      editable: ['MiniEvent.inc'], client: [], deps: [],
      // Turn-in Race (loaders/minievent-turnin.js): the "where to get it" hints and the random recipes read the NPC shops,
      // monster drops, the Donation Shop, exchanges and boxes (read-only), and WdMadrigal.rgn (monster spots, area names)
      uses: ['npc', 'drops', 'donation', 'exchange', 'boxes'],
      maps: true,
      // Vagrant Race: World/WdRace/WdRace.rgn, the race map's monsters (respawn7 lines), editable here (Server + Client copies)
      raceMap: true,
      parse(ws) { return FRE.miniEvent.fromWorkspace(ws); },
      validate(ws, model) { return FRE.miniEventChecks(model); },
    },
    {
      // Bot Check (loaders/antibot.js): AntiBot.inc, the puzzle's pictures + words and (V19 d816e99f, not yet built) its tuning.
      // WorldServer only: never a Client copy (the words are the answer key). World.inc: which maps NO_CHECK_WORLD may name.
      id: 'antibot', label: 'Bot Check',
      required: ['AntiBot.inc'], optional: ['World.inc'], editable: ['AntiBot.inc'], client: [], deps: [],
      parse(ws) { return FRE.antiBot.fromWorkspace(ws); },
      validate(ws, model) {
        const iconOf = id => { const it = ws.itemById(id); return it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : ''; };
        return FRE.antiBotChecks(model, { iconOf });
      },
    },
    {
      // Mounts (loaders/mounts.js): Mount.inc, how each mount item sits, moves, plays its leg loops and flies (LoadMountAnimationList
      // Project.cpp:618, called at :1102 by the WorldServer AND the game; V19 b43949aa, a5325b65). UTF-16LE, CRLF; identical Client
      // copy. mdlDyna.inc gives each mount item's model (its .ani files are the loop choices).
      id: 'mounts', label: 'Mounts',
      required: ['Mount.inc'], optional: ['mdlDyna.inc'], editable: ['Mount.inc'], client: ['Mount.inc'], deps: ['mdlDyna.inc'],
      parse(ws) { return FRE.mounts.fromWorkspace(ws); },
      validate(ws, model) { return FRE.mountChecks(model, { hasModels: ws.clientModels }); },
    },
    {
      // PvP Events (loaders/pvp.js): FFAManager.inc / TDMManager.inc (ReadConfig: WorldServer start + /ffareload, /tdmreload),
      // GuildCombat.txt (the siege day / time AUTO_OPEN_IDC and the minimum bid JOINPENYA, CGuildCombat::LoadScript),
      // GuildSiegePrize.lua (the siege prizes, PvP events part B 6de6da39). Server files only; the rules boards players read are
      // client-only files in Client/Client (NpcBoard_289 / 290, GuildCombatTEXT_<n>_ENG / _USA: Workspace.setBoardFiles).
      id: 'pvp', label: 'PvP Events',
      // + Equalized PvP (loaders/equalized.js): EqualizedPvP.inc (which events are equalized, class caps) and EqualizedPresets.inc (the
      // shared gear presets), WorldServer only, /eqreload (ec3657c7).
      required: ['FFAManager.inc', 'TDMManager.inc', 'GuildCombat.txt'], optional: ['GuildSiegePrize.lua', 'EqualizedPvP.inc', 'EqualizedPresets.inc', 'propItemEtc.inc', 'propItemEtc.txt.txt', 'Ultimate_GemAbility.txt'],   // propItemEtc: the set bonuses shown on the presets page (read only)
      editable: ['FFAManager.inc', 'TDMManager.inc', 'GuildCombat.txt', 'GuildSiegePrize.lua', 'EqualizedPvP.inc', 'EqualizedPresets.inc'],
      client: [], deps: ['GuildSiegePrize.lua', 'EqualizedPvP.inc', 'EqualizedPresets.inc', 'client/npcboard_289.inc', 'client/npcboard_290.inc',
        ...[1, 2, 3, 4, 5, 6].flatMap(n => [`client/guildcombattext_${n}_eng.inc`, `client/guildcombattext_${n}_usa.inc`])],
      parse(ws) { return Object.assign(FRE.pvp.fromWorkspace(ws), { eq: FRE.equalized.fromWorkspace(ws) }); },
      validate(ws, model) { return FRE.pvpChecks(model, { ws }).concat(FRE.equalizedChecks(model.eq, { ws })); },
    },
    {
      // Dungeons (loaders/dungeon.js): PartyDungeon.lua (WorldServer only, CInstanceDungeonParty::LoadScript, Project.cpp:908) and
      // the drops of each dungeon's monsters, edited with the Monster Drops code (edit/drops-ops.js) on propMoverEx.inc.
      // maps: the map monsters of each dungeon come from World/<map>/<map>.rgn (CWorld::LoadRespawn, read-only).
      id: 'dungeon', label: 'Dungeons',
      required: ['PartyDungeon.lua', 'propMoverEx.inc', 'propMover.txt', 'propMover.txt.txt'],
      editable: ['PartyDungeon.lua', 'propMoverEx.inc'], client: [],
      optional: ['propDropEvent.inc', 'except.txt', 'PenyaTable.txt', 'expTable.inc', 'Event.lua', 'propItemEtc.inc'],
      uses: ['drops'],
      maps: true,
      parse(ws) {
        if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
        const m = FRE.dungeon.loadDungeons(ws.files.get('partydungeon.lua'), { defines: ws.defines.defines });
        m.server = FRE.dungeon.serverMap(m);
        // the map monsters per dungeon world (null until the maps are read: setMapObjects reparses this module)
        m.rgn = new Map();
        const wf = ws.worldFiles || new Map();
        const list = ws.worldList ? ws.worldList() : [];
        for (const d of m.dungeons) {
          const w = list.find(x => x.define === d.world);
          d.map = w ? w.name : null;
          if (!w || m.rgn.has(w.name)) continue;
          const f = wf.get(`world/${w.name}/${w.name}.rgn`.toLowerCase());
          m.rgn.set(w.name, f ? FRE.dungeon.regionMonsters(f, { defines: ws.defines.defines, movers: ws.movers.movers }) : null);
        }
        return m;
      },
      validate(ws, model) {
        return FRE.dungeon.validateDungeons(model, { defines: ws.defines.defines, movers: ws.movers.movers }).map(d => Object.assign({ module: 'dungeon' }, d));
      },
    },
    {
      // Where is this item from? (task H, loaders/where.js): every model above parsed read-only, nothing editable.
      // Last, so its parse sees the other models. maps: towns of the NPCs, and whether they stand in the game.
      id: 'where', label: 'Item Sources & Uses',
      required: [], editable: [], client: [],
      // part 2 (loaders/gifts.js): level-up gifts (Event.lua), rebirth gifts, couple gifts, the max level (expTable.inc),
      // the Guild Siege config; the prize amounts compiled into the C++ come in as opts.cpp (io/source-read.js)
      optional: ['Event.lua', 'expTable.inc', '1Rebirth.inc', 'couple.inc', 'GuildCombat.txt', 'GuildSiegePrize.lua'],
      uses: ['npc', 'donation', 'exchange', 'drops', 'boxes', 'battlepass'],
      maps: true,
      parse(ws) { return FRE.where.index(ws); },
      validate() { return []; },
    },
  ];
  const ALL_FILES = [...new Set([...CORE, ...MODULES.flatMap(m => [...m.required, ...(m.optional || [])]), ...OPTIONAL])];

  class Workspace {
    // files: Map lowercase name -> SourceFile
    // opts.only: one task (module id). Only that module is shown, validated and editable;
    // the modules it `uses` are parsed as read-only context. Without it: every module.
    constructor(files, opts = {}) {
      this.files = files;
      this.only = opts.only || null;
      this.cpp = opts.cpp || null;      // Map 'eveschool.cpp' / 'guildsiegeprize.cpp' -> text (read-only, FLYFF-V19-SOURCE picked)
      this.history = [];      // lowercase file names, in edit order (for global undo)
      this.redoStack = [];
      this.missing = CORE.filter(n => !files.has(n.toLowerCase()));
      this.models = {};
      this.moduleDiags = {};
      this.available = {};
      this.editable = new Set();
      this.donationTree = null;
      this.clientModels = null;     // lowercase file names in Client/Model (setClientModels), when the Client folder is chosen
      this.clientTextures = null;   // lowercase file names in Client/Model/Texture (setClientTextures)
      this.modelTextures = new Map(); // lowercase Mvr_X.o3d -> [texture names it uses] (addModelTextures; newNpcSim.o3dTextures)
      this.clientTheme = null;      // lowercase file names in Client/Theme (Battle Pass textures), when the Client folder is chosen
      this.placed = null;           // lowercase NPC key -> [map names] from World/*/*.dyo (null: not read)
      this.mapFiles = new Map();    // map name -> lowercase key in this.files of its .dyo (setMapFiles)
      this.worldFiles = new Map();
      this.area = null;             // FRE.area.build: where each NPC stands, named as the client names it (null: not read)
      const task = this.only ? MODULES.find(m => m.id === this.only) : null;
      if (this.only && !task) throw new Error(`unknown task ${this.only}`);
      this.active = new Set(task ? [task.id, ...(task.uses || [])] : MODULES.map(m => m.id));
      this.shown = new Set(task ? [task.id] : MODULES.map(m => m.id));
      this.validated = new Set([...this.shown, ...(task && task.alsoValidates || [])]);
      for (const m of MODULES) {
        const miss = m.required.filter(n => !files.has(n.toLowerCase()));
        this.available[m.id] = !this.active.has(m.id) ? { ok: false, missing: [], off: true } : miss.length ? { ok: false, missing: miss } : { ok: true };
        if (!miss.length && this.shown.has(m.id)) m.editable.forEach(n => this.editable.add(n.toLowerCase()));
        // a file the task may create (UpgradeFees.lua): an empty one with no handle; io/save.js creates it in Server/Resource
        // when it gets text (serverNew), and an Undo back to empty leaves nothing to save
        if (!miss.length && this.shown.has(m.id)) for (const n of m.creates || []) {
          if (files.has(n.toLowerCase())) continue;
          const f = new FRE.SourceFile(n, new Uint8Array(0));
          f.serverNew = true;
          files.set(n.toLowerCase(), f);
        }
      }
      if (!task || task.editsSpec) CORE_EDITABLE.forEach(n => { if (files.has(n.toLowerCase())) this.editable.add(n.toLowerCase()); });
    }

    load() {
      this.defines = FRE.loadDefines(this.files);
      this.strings = FRE.loadStrings(this.files);
      this.texts = FRE.textClient.load(this.files, this.strings.map, this.defines.defines);
      this.loadItems();
      // exchange menus (MMI_ names at the start of a line in Exchange_Script.txt), for display only
      const ex = this.files.get('exchange_script.txt');
      this.exchangeMenus = new Set(ex ? (ex.text.match(/^MMI_\w+/gm) || []) : []);
      this.reparse();
      this.baseline = this.keyCounts(this.diags);
      return this;
    }

    // Spec_Item.txt and everything derived from it (also after a price edit).
    loadItems() {
      const spec = this.files.get('spec_item.txt');
      this.items = spec ? FRE.specItem.loadSpecItem(spec, { defines: this.defines.defines, strings: this.strings.map })
        : { items: new Map(), rows: [], diags: [], stopped: null };
      this.itemDiags = this.items.diags.map(d => Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
      this.vendorIndex = FRE.vendorSim.buildIndex(this.items, this.defines.defines);
    }

    // Re-parse the modules that own `lowerName` (all modules when omitted).
    reparse(lowerName) {
      if (lowerName === 'spec_item.txt') { this.loadItems(); lowerName = undefined; }   // every module reads items
      // a string table (character.txt.txt: a new NPC's name): every module reads names through it
      if (lowerName && /\.txt\.txt$/.test(lowerName)) {
        this.strings = FRE.loadStrings(this.files);
        // item names and descriptions are put in place of their IDS keys when Spec_Item.txt is read (couple buff texts)
        if (lowerName === 'propitem.txt.txt') this.loadItems();
        lowerName = undefined;
      }
      for (const m of MODULES) {
        if (!this.available[m.id].ok) continue;
        if (lowerName && ![...m.required, ...(m.deps || [])].some(n => n.toLowerCase() === lowerName)) continue;
        this.models[m.id] = m.parse(this);
        if (this.validated.has(m.id)) this.moduleDiags[m.id] = m.validate(this, this.models[m.id]);
      }
      // Spec_Item problems matter only to tasks that can change Spec_Item.txt
      const specDiags = [...this.shown].some(id => MODULES.find(m => m.id === id).editsSpec) ? this.itemDiags : [];
      this.diags = [...Object.values(this.moduleDiags).flat(), ...specDiags];
    }

    // Client/Client/DonationShopTree.inc (client-only; read from the Client folder when chosen): a SourceFile,
    // kept in this.files as 'client/donationshoptree.inc' (written into the Client folder by io/save.js),
    // editable in the Donation Shop task. The donation module parses it (this.donationTree).
    setDonationTree(file) {
      const key = FRE.donationTree.KEY;
      if (this.files.has(key)) { this.files.delete(key); this.editable.delete(key); }
      if (file) {
        file.clientOnly = true;
        file.dir = 'Client';
        this.files.set(key, file);
        if (this.shown.has('donation') && !file.readOnly) this.editable.add(key);
      }
      this.donationTree = null;
      if (this.available.donation && this.available.donation.ok) this.reparse('donationshop.inc');
    }

    // lowercase file names in Client/Model (Add New NPC: does a model have all its files?)
    setClientModels(names) {
      this.clientModels = names ? new Set([...names].map(n => n.toLowerCase())) : null;
      this.clientModelNames = names ? [...names] : null;     // real case: the Mounts task offers a model's own .ani files
      if (this.available.npc && this.available.npc.ok) this.reparse('character.inc');
      if (this.available.mounts && this.available.mounts.ok) this.reparse('mount.inc');
    }

    // Client/Model/Texture file names, and the textures of .o3d files already read (Map lowercase o3d -> [names])
    setClientTextures(names, index) {
      this.clientTextures = names ? new Set([...names].map(n => n.toLowerCase())) : null;
      if (index) for (const [k, v] of index) this.modelTextures.set(k.toLowerCase(), v);
      if (this.available.npc && this.available.npc.ok) this.reparse('character.inc');
    }
    addModelTextures(o3d, names) {
      this.modelTextures.set(o3d.toLowerCase(), names);
    }

    // file names in the client's Theme folder (BattlePass.inc rarity / icon textures)
    // Rules windows (docs/patches/npc-board.diff): Client/Client/NpcBoard_<menu id>.inc, client-only files.
    // They sit in this.files as 'client/npcboard_<id>.inc' with clientOnly set; io/save.js writes them into
    // the Client folder. setBoardFiles: the ones already there (SourceFiles read from Client/Client).
    setBoardFiles(list) {
      for (const f of list || []) this._addBoard(f);
      if (this.available.pvp && this.available.pvp.ok && (list || []).length) this.reparse('guildsiegeprize.lua');   // the boards it checks
    }
    _addBoard(f) {
      f.clientOnly = true;
      f.dir = 'Client';
      const lower = 'client/' + f.name.toLowerCase();
      this.files.set(lower, f);
      // rules texts are edited in NPC Shops; the PvP Events task keeps its own boards (FFA / TDM Rules, the Guild Siege boards) in step
      const pvp = this.shown.has('pvp') && FRE.pvp.isPvpBoard(lower);
      if (!f.readOnly && ((this.shown.has('npc') && /^client\/npcboard_\d+\.inc$/.test(lower)) || pvp)) this.editable.add(lower);
      return { lower, file: f };
    }
    // -> { lower, file } of NpcBoard_<id>.inc; create: an empty one (no bytes yet) when there is none
    boardFile(id, create = false) {
      const lower = `client/npcboard_${id}.inc`;
      if (this.files.has(lower)) return { lower, file: this.files.get(lower) };
      if (!create) return null;
      return this._addBoard(new FRE.SourceFile(`NpcBoard_${id}.inc`, new Uint8Array(0)));
    }
    // the rules text players see for menu id (null: no board file, or an empty one)
    boardTextOf(id) {
      const b = this.boardFile(id);
      return b && b.file.text.length ? b.file.text : null;
    }

    setClientTheme(names) {
      this.clientTheme = names ? new Set([...names].map(n => n.toLowerCase())) : null;
      if (this.available.battlepass && this.available.battlepass.ok) this.reparse('battlepass.inc');
    }

    // exchange menu id -> names of the NPCs with AddMenu(id) (null without the NPC files)
    npcsByMenu() {
      const by = this.npcInfoByMenu();
      return by && new Map([...by].map(([id, list]) => [id, list.map(x => x.name)]));
    }
    // exchange menu id -> [{ npc, name, key, inGame, maps, why }] (FRE.world.npcStatus)
    npcInfoByMenu() {
      if (!this.available.npc || !this.available.npc.ok || !this.chars) return null;
      const m = new Map();
      for (const npc of this.chars.npcs) for (const id of npc.menus) {
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(Object.assign({ npc, name: npc.name || npc.key, key: npc.key, where: this.whereOf(npc.key) }, FRE.world.npcStatus(npc, this.placed)));
      }
      return m;
    }
    // An exchange menu players can use: it has recipes, and an NPC with it stands in the game.
    isLiveMenu(m) {
      if (!m.sets.length) return false;
      const by = this.npcInfoByMenu();
      return !!by && (by.get(m.mmi.value) || []).some(x => x.inGame);
    }
    // The maps the server loads (World.inc), for the app to read their .dyo files
    worldList() { return FRE.world.readWorldList(this.files.get('world.inc'), this.defines.defines); }
    // dyo: Map map name -> bytes of World/<name>/<name>.dyo
    // worldFiles: Map lowercase path ('world/wdmadrigal/wdmadrigal.rgn') -> SourceFile: each map's .rgn and
    // .txt.txt, and WdMadrigal.wld.cnt (read-only; loaders/area.js names the spots)
    setMapObjects(dyo, worldFiles = new Map()) {
      this.worldFiles = worldFiles;     // the Dungeons task reads each dungeon's .rgn (its map monsters)
      const placed = new Map();
      for (const [name, bytes] of dyo) for (const key of FRE.world.readDyo(bytes).movers) {
        const k = key.toLowerCase();
        if (!placed.has(k)) placed.set(k, []);
        if (!placed.get(k).includes(name)) placed.get(k).push(name);
      }
      this.placed = placed;
      const get = rel => worldFiles.get(rel.toLowerCase()) || this.files.get(rel.toLowerCase()) || null;
      this.area = FRE.area.build({ defines: this.defines.defines, get, dyo });
      for (const m of MODULES) {
        if (!m.maps || !this.available[m.id].ok) continue;
        if (m.required.length) this.reparse(m.required[0].toLowerCase());
        else this.models[m.id] = m.parse(this);       // a task without files of its own (where)
      }
    }
    // The .dyo files as SourceFiles (binary, with handles), so a task may edit them. They are kept
    // in this.files under 'world/<map>/<file>.dyo'; the NPC task may write them.
    setMapFiles(dyoFiles, worldFiles = new Map()) {
      this.worldFiles = worldFiles;
      const maps = MODULES.some(m => m.editsMaps && this.shown.has(m.id) && this.available[m.id].ok);
      for (const [name, f] of dyoFiles) {
        const lower = `${f.dir}/${f.name}`.toLowerCase();
        this.files.set(lower, f);
        this.mapFiles.set(name, lower);
        if (maps) this.editable.add(lower);
      }
      // the Vagrant Race map's monsters (FRE.raceMap): the same SourceFile as worldFiles holds, so a re-read sees the edits
      const race = worldFiles.get(FRE.raceMap.KEY);
      if (race && MODULES.some(m => m.raceMap && this.shown.has(m.id) && this.available[m.id].ok)) {
        this.files.set(FRE.raceMap.KEY, race);
        this.editable.add(FRE.raceMap.KEY);
      }
      this.refreshMaps();
    }
    refreshMaps() {
      const dyo = new Map([...this.mapFiles].map(([name, lower]) => [name, this.files.get(lower).serialize()]));
      this.setMapObjects(dyo, this.worldFiles);
    }
    mapFile(name) { const l = this.mapFiles.get(name); return l ? this.files.get(l) : null; }
    // [{ place, caption, te, world, x, z, … }] where the NPC with this key stands (FRE.area.whereIs); null: maps not read
    whereOf(key) { return this.area ? FRE.area.whereIs(this.area, key) : null; }
    needsMaps() { return MODULES.some(m => m.maps && this.shown.has(m.id) && this.available[m.id].ok); }

    textOf(name) { return (this.files.get(String(name).toLowerCase()) || { text: '' }).text; }
    moduleOfFile(name) {
      const l = String(name).toLowerCase(), has = list => (list || []).some(n => n.toLowerCase() === l);
      return MODULES.find(m => has(m.required)) || MODULES.find(m => m.id === 'donation' && has(m.deps)) || null;   // + the client-only tree
    }

    isEditable(lowerName) {
      const f = this.files.get(lowerName);
      return !!f && this.editable.has(lowerName) && !f.readOnly;
    }

    fileOfNpc(npc) { return this.files.get(npc.file.toLowerCase()); }

    // Apply splices from an edit op to one file, then re-derive what depends on it.
    apply(lowerName, splices, label) {
      this.applyGroup([{ file: lowerName, splices }], label);
    }

    // Several files changed as ONE undo step. All splices are checked before any file changes.
    applyGroup(parts, label) {
      parts = parts.filter(p => p.splices.length);
      if (!parts.length) return;
      for (const p of parts) {
        if (!this.isEditable(p.file)) throw new Error(`${p.file} is not editable`);
        const f = this.files.get(p.file);
        FRE.SourceFile.spliceText(f.text, p.splices, f.kind, f.name);       // throws before anything changes
      }
      for (const p of parts) this.files.get(p.file).applySplices(p.splices, label);
      this.history.push(parts.map(p => p.file));
      this.redoStack = [];
      this._reparseAll(parts.map(p => p.file));
    }

    _reparseAll(names) {
      // a #define file (defineNeuz.h: a new SRT_ tag): everything that reads names is loaded again
      if (names.some(n => FRE.DEFINE_FILES.some(d => d.toLowerCase() === n))) {
        this.defines = FRE.loadDefines(this.files);
        this.strings = FRE.loadStrings(this.files);
        this.texts = FRE.textClient.load(this.files, this.strings.map, this.defines.defines);
        names = ['spec_item.txt', ...names];
      }
      // textClient.inc / textClient.txt.txt (a new menu's label): the TID texts are read again
      if (names.some(n => n === 'textclient.inc' || n === 'textclient.txt.txt')) {
        if (names.includes('textclient.txt.txt')) this.strings = FRE.loadStrings(this.files);
        this.texts = FRE.textClient.load(this.files, this.strings.map, this.defines.defines);
      }
      if (names.includes('exchange_script.txt')) {       // the "exchange" tags in NPC Shops (MMI_ names at a line start)
        const ex = this.files.get('exchange_script.txt');
        this.exchangeMenus = new Set(ex ? (ex.text.match(/^MMI_\w+/gm) || []) : []);
      }
      if (names.some(n => /\.dyo$/.test(n))) this.refreshMaps();
      // spec_item.txt reparses every module, but not the string tables: the group's other files
      // (a new NPC's character.txt.txt names) are read first, or their names show as IDS_ keys
      names.filter(n => n !== 'spec_item.txt').forEach(n => this.reparse(n));
      if (names.includes('spec_item.txt')) this.reparse('spec_item.txt');
    }

    // Fold the last step into the one before it (typing in one field = one undo step): only when both changed
    // the same files and nothing was undone in between. Undo then goes straight back to before both.
    mergeLast() {
      const h = this.history;
      if (h.length < 2 || this.redoStack.length) return false;
      const a = h[h.length - 2], b = h[h.length - 1];
      if (a.length !== b.length || a.some((n, i) => n !== b[i])) return false;
      for (const n of b) this.files.get(n)._undo.pop();
      h.pop();
      return true;
    }

    // Fold the last n steps into ONE undo step (a new NPC + its new menus, each planned after the one before).
    // Each file keeps only its oldest snapshot of those steps, so Undo goes back to before all of them.
    foldLast(n, label) {
      const h = this.history;
      if (n < 2 || h.length < n || this.redoStack.length) return false;
      const steps = h.splice(h.length - n, n);
      const names = [...new Set(steps.flat())];
      for (const name of names) {
        const u = this.files.get(name)._undo;
        const k = steps.filter(s => s.includes(name)).length;
        u.splice(u.length - k + 1, k - 1);
        if (label) u[u.length - 1].label = label;
      }
      h.push(names);
      return true;
    }

    undo() {
      const names = this.history.pop(); if (!names) return null;
      let label = null;
      for (const n of names) label = this.files.get(n).undo();
      this.redoStack.push(names); this._reparseAll(names); return label;
    }
    redo() {
      const names = this.redoStack.pop(); if (!names) return null;
      let label = null;
      for (const n of names) label = this.files.get(n).redo();
      this.history.push(names); this._reparseAll(names); return label;
    }

    // What players see in this NPC's shop (cached until the next edit).
    simulate(npc) {
      if (!this._sim.has(npc)) this._sim.set(npc, FRE.vendorSim.simulateNpc(this.vendorIndex, npc));
      return this._sim.get(npc);
    }

    // Each item's dwCost after every AddShopItem price (vendorSim.effectiveCosts; cached until the next edit).
    costs() {
      if (!this._costs) this._costs = FRE.vendorSim.effectiveCosts(this.items, this.chars);
      return this._costs;
    }
    // What players pay / get back for every item of one tab (vendorSim.pricedTab)
    pricedTab(npc, slot, rates) {
      return FRE.vendorSim.pricedTab(this.costs(), this.defines.defines, this.simulate(npc).tabs[slot], rates);
    }

    dirtyFiles() { return [...this.files.values()].filter(f => f.dirty); }

    // Files the game client also reads (it has its own copies in Client/).
    clientFileNames() {
      const own = MODULES.filter(m => this.available[m.id].ok && this.shown.has(m.id));
      const spec = !this.only || own.some(m => m.editsSpec) ? CORE_CLIENT : [];
      const maps = own.some(m => m.editsMaps) ? [...this.mapFiles.values()].map(l => this.files.get(l).name) : [];
      if (own.some(m => m.raceMap) && this.files.has(FRE.raceMap.KEY)) maps.push(this.files.get(FRE.raceMap.KEY).name);
      return [...new Set([...spec, ...own.flatMap(m => m.client), ...maps])];
    }

    // Changed files that the game client also reads (must be copied to Client/).
    clientCopiesNeeded() {
      const names = new Set(this.clientFileNames().map(n => n.toLowerCase()));
      return this.dirtyFiles().filter(f => names.has(f.name.toLowerCase())).map(f => f.name);
    }

    keyCounts(diags) {
      const m = new Map();
      for (const d of diags) if (d.severity === 'BLOCK') m.set(d.key, (m.get(d.key) || 0) + 1);
      return m;
    }

    // BLOCK diagnostics that did not exist when the folder was loaded / last saved.
    newBlocking() {
      const left = new Map(this.baseline);
      const out = [];
      for (const d of this.diags) {
        if (d.severity !== 'BLOCK') continue;
        const n = left.get(d.key) || 0;
        if (n > 0) left.set(d.key, n - 1); else out.push(d);
      }
      return out;
    }

    // After a verified save.
    markSaved() {
      this.history = []; this.redoStack = [];
      this.baseline = this.keyCounts(this.diags);
    }

    // --- read helpers for the UI ---------------------------------------
    itemById(id) { return this.items.items.get(id >>> 0) || null; }
    itemInfo(item) {
      const g = (f) => FRE.specItem.get(item, f);
      const D = this.defines;
      const grade = g('dwItemGrade');
      return {
        id: item.id, define: item.define, name: item.name || item.nameKey,
        ik1: g('dwItemKind1'), ik2: g('dwItemKind2'), ik3: g('dwItemKind3'),
        ik3Name: D.byValue('IK3_', g('dwItemKind3')),
        job: g('dwItemJob'), jobName: g('dwItemJob') === -1 ? null : D.byValue('JOB_', g('dwItemJob')),
        level: g('dwLimitLevel1'), atkMin: g('dwAbilityMin'), atkMax: g('dwAbilityMax'),
        grade, rarity: grade === 100 ? 'normal' : grade === 200 ? 'unique' : grade === 300 ? 'ultimate' : grade === 400 ? 'baruna' : 'other',
        cost: g('dwCost'), chipCost: g('dwReferValue1'), referStat1: g('dwReferStat1'), icon: g('szIcon'), packMax: g('dwPackMax'),
      };
    }
  }

  Workspace.CORE = CORE;
  Workspace.CORE_CLIENT = CORE_CLIENT;
  Workspace.MODULES = MODULES;
  Workspace.ALL_FILES = ALL_FILES;
  Workspace.REQUIRED = ALL_FILES;      // everything the editor looks for in the folder
  Workspace.OPTIONAL = [];
  FRE.Workspace = Workspace;
})(globalThis.FRE = globalThis.FRE || {});
