// What each saved change needs before players see it (INVESTIGATION.md §1.17).
// Who reads each file the editor writes, and when (C++ paths under FLYFF-V19-SOURCE/Source/Source):
//   WorldServer: once at startup. WorldServer.cpp:397 prj.OpenProject -> Project.cpp:706 -> LoadPreFiles
//     (ProjectCmn.cpp:1413: LoadDefines :1369, LoadStrings :1253, LoadText :1366), then the .prj lines and the
//     fixed loads below. No GM command reloads any of these files (/loadscript = WorldDialog.dll, /rec =
//     Constant.inc, /lua = Event / MonsterSkill; __S0114_RELOADPRO is not built).
//   DatabaseServer: also reads Spec_Item.txt, the strings and the defines at startup (databaseserver/Project.cpp:110,
//     :125), but none of the fields or files the editor changes (no dwReferValue1 / dwCost, no character*.inc,
//     Exchange_Script, DonationShop.inc, BattlePass.inc). Stop / Start Server.bat restarts it anyway.
//   The game (Neuz): the same loads once at startup, before the login screen (Neuz.cpp:1589 BeginLoadThread ->
//     LoadPreFiles :1593, OpenProject :1573). A loose file in Client/ wins over data.res (file.cpp:273
//     CResFile::Open, b7645c52). Never reads .dyo (WorldFile.cpp:269-382 is #ifdef __WORLDSERVER).
//   propMoverEx.inc (Monster Drops): the game reads it at startup but the drop lines are kept only #ifdef __WORLDSERVER
//     (Project.cpp:3231 / 3253 / 3269), and it has no loose Client copy: a drop change needs only the server restart.
//   propGiftbox.inc (Boxes): LoadGiftbox is #ifdef __WORLDSERVER (Project.cpp:858-869), no Client copy: server restart only.
//   propPackItem.inc (Boxes): LoadPackItem (Project.cpp:877) runs in both; the game reads Client/propPackItem.inc (Item Wiki).
//   defineItem.h / propItem.txt.txt / mdlDyna.inc (+ New box): LoadDefines / LoadStrings / the model script, at startup in both.
//   Client/Client/DonationShopTree.inc: each time the Donation Shop window opens (WndDonationShop.cpp:346; 409 with donation-tree.diff).
//   Client/Client/NpcBoard_<id>.inc: on every click of the menu, once docs/patches/npc-board.diff is built.
//   Client/Client/GuildCombatTEXT_<n>_ENG / _USA.inc: the Guild Siege boards, read on every click by the game's own code
//     (WndWorld.cpp:4653 / :4734 GetLangFileName( FILE_GUILDCOMBAT_TEXT_n ), no patch).
//   FFAManager.inc / TDMManager.inc: the WorldServer at startup (Project.cpp:920 / :923 ReadConfig) AND the GM commands
//     /ffareload / /tdmreload (FuncTextCmd.cpp:423 / :517; refused while a run is going), so a save needs one of the two.
//   GuildCombat.txt: the WorldServer at startup (ThreadMng.cpp:293). GuildSiegePrize.lua: the WorldServer at startup
//     (eveschool.cpp:3672 LoadPrizes, 6de6da39) and the DatabaseServer (databaseserver/Project.cpp:216 LoadScript).
// Stop Server.bat closes Neuz and every server; Start Server.bat starts them and then the game
// (Client\- Start Game.bat copies Source\Output\Neuz\NoGameguard\Neuz.exe first).
(function (FRE) {
  'use strict';

  const STARTUP = 'startup', WINDOW = 'window', CLICK = 'click', RELOAD = 'reload';
  // key (lowercase, as in Workspace.files) -> { server, client, cite }
  const READERS = {
    'spec_item.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:812 LoadPropItem' },
    'character.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:818 / :3257 LoadCharacter' },
    'character-etc.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:818 / :3257 LoadCharacter' },
    'character-school.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:818 / :3257 LoadCharacter' },
    'character.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1256 LoadStrings' },
    'defineneuz.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1373 LoadDefines' },
    'definetext.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1383 LoadDefines' },
    'etc.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:852 LoadEtc' },
    'etc.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1259 LoadStrings' },
    'textclient.inc': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1366 LoadText' },
    'textclient.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1274 LoadStrings' },
    'exchange_script.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:1014 -> Exchange.cpp:34 Load_Script' },
    'donationshop.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:967 -> ProjectCmn.cpp:1845 LoadDonationShop' },
    'battlepass.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:935 -> ProjectCmn.cpp:1682 LoadBattlePass' },
    // the game parses propMoverEx.inc too, but keeps no drop lines: DropItem / DropKind / DropGold are added #ifdef __WORLDSERVER
    // Class Buffs: both at startup (Project.cpp:839 / :3014 LoadPropAddSkill, ProjectCmn.cpp:1253 LoadStrings); 8cfef4e7 / f8754f67
    'propskilladd.csv': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:842 LoadPropAddSkill (the "propSkillAdd" line of Masquerade.prj)' },
    'propskill.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1253 LoadStrings' },
    'propmoverex.inc': { server: STARTUP, client: null, cite: 'Project.cpp:850 LoadPropMoverEx (drops #ifdef __WORLDSERVER :3242; a lowest amount, the 5th DropItem value, needs the WorldServer built with V19 b9646b69)' },
    // random boxes: LoadGiftbox sits in #ifdef __WORLDSERVER (Project.cpp:858-869); sets: the game loads its own copy too (Item Wiki, e08528a5)
    'propgiftbox.inc': { server: STARTUP, client: null, cite: 'Project.cpp:864 LoadGiftbox (#ifdef __WORLDSERVER :836)' },
    'proppackitem.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:877 LoadPackItem (the game too: Item Wiki)' },
    // a new box item (J part 2, the 949f2cc2 way): its #define, its name / description, its ground model
    'defineitem.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1376 LoadDefines' },
    'propitem.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1261 LoadStrings' },
    'mdldyna.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:790 m_modelMng.LoadScript (the "model" line of Masquerade.prj)' },
    // Rates & Buffs: Event.lua (the WorldServer and the DatabaseServer, Project.cpp:1018 / databaseserver/Project.cpp:192; the
    // DatabaseServer menu "Apply now", DatabaseServer.cpp:488, reloads it live), ServerBuff.txt (WorldServer only, Project.cpp:915),
    // GuildBuff.txt (both, Project.cpp:913; the game shows only what the server sends)
    'event.lua': { server: STARTUP, client: null, cite: 'Project.cpp:1018 m_EventLua.LoadScript (+ databaseserver/Project.cpp:192)' },
    'serverbuff.txt': { server: STARTUP, client: null, cite: 'Project.cpp:915 loadServerBuffFile (#ifdef __WORLDSERVER)' },
    'guildbuff.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:913 loadGuildBuffFile' },
    // Secret Room Winner / Guild Siege Winner buffs: OwnerBuffMng::Load inside #ifdef __WORLDSERVER (V19 feat/secret-room 885aa231)
    'ownerbuff.txt': { server: STARTUP, client: null, cite: 'Project.cpp OwnerBuffMng::Load (#ifdef __WORLDSERVER, feat/secret-room)' },
    // rebirth tiers: both load it (Project.cpp:963, #ifdef __REBIRTH_SYSTEM only); the game discards the numbers but reads the file
    '1rebirth.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:963 LoadRebirthProp' },
    // Upgrade Rates (task K): ItemUpgrade.lua (CItemUpgrade's constructor -> LoadScript, WORLDSERVER/ItemUpgrade.cpp:31 / :59, WorldServer
    // only), s.txt (LoadServerScript Project.cpp:994, WorldServer; the game reads its own copy for the Collector Details window :937),
    // Ultimate_UltimateWeapon.txt (Project.cpp:967 LoadUltimateWeapon -> UltimateWeapon.cpp:116, #ifdef __WORLDSERVER),
    // WeaponRarity.inc (Project.cpp:971 LoadWeaponRarity, both)
    'itemupgrade.lua': { server: STARTUP, client: null, cite: 'ItemUpgrade.cpp:31 CItemUpgrade() -> LoadScript :59 (WorldServer only)' },
    'baruna.lua': { server: STARTUP, client: null, cite: 'ItemUpgrade.cpp:125 LoadScriptBaruna (WorldServer only, V19 ad93a9af)' },
    's.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:994 LoadServerScript (+ the game: :937 LoadCollectingInfo)' },
    'ultimate_ultimateweapon.txt': { server: STARTUP, client: null, cite: 'Project.cpp:967 LoadUltimateWeapon -> UltimateWeapon.cpp:116 (#ifdef __WORLDSERVER)' },
    'weaponrarity.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:971 LoadWeaponRarity' },
    // Upgrade fees (K part 2): only with upgrade-fees.diff built (WorldServer + Neuz). CUpgradeFees::GetInstance reads it once,
    // the first time a fee is needed (a static object: once per run of the WorldServer / the game)
    'upgradefees.lua': { server: STARTUP, client: STARTUP, cite: 'upgrade-fees.diff: _Common/UpgradeFees.h CUpgradeFees()', patch: 'upgrade-fees' },
    // couple: the WorldServer, the DatabaseServer and the game each load it (couplehelper.cpp Initialize); the game's couple window
    // draws its level bar from its own copy (WndField.cpp:26910 GetExperienceRate)
    'couple.inc': { server: STARTUP, client: STARTUP, cite: 'WORLDSERVER/couplehelper.cpp:44, databaseserver/couplehelper.cpp:158, Neuz/couplehelper.cpp:33 CCoupleProperty::Initialize' },
    // Set Effects (task G part 1): the sets (both: bonuses on the server, the tooltip in the game), their names (LoadStrings' list),
    // the +N armor table (the "expTable" line of Masquerade.prj, both)
    'propitemetc.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:883 LoadPiercingAvail' },
    'propitemetc.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1262 LoadStrings' },
    'exptable.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:763 LoadExpTable (the "expTable" line of Masquerade.prj)' },
    'client/donationshoptree.inc': { server: null, client: WINDOW, cite: 'WndDonationShop.cpp:346 (409 with donation-tree.diff) LoadTreeScript' },
    // PvP Events: the FFA / TDM settings (startup or the GM reload command), the siege day / bid and its prizes (startup)
    'ffamanager.inc': { server: RELOAD, client: null, reload: 'ffa', cite: 'Project.cpp:920 ReadConfig; /ffareload FuncTextCmd.cpp:423' },
    'tdmmanager.inc': { server: RELOAD, client: null, reload: 'tdm', cite: 'Project.cpp:923 ReadConfig; /tdmreload FuncTextCmd.cpp:517' },
    'guildcombat.txt': { server: STARTUP, client: null, cite: 'ThreadMng.cpp:293 g_GuildCombatMng.LoadScript' },
    // Equalized PvP (__FL_EQUALIZED_MODE): which events are equalized + the shared gear presets; /eqreload reads both (ec3657c7)
    'equalizedpvp.inc': { server: RELOAD, client: null, reload: 'eq', cite: 'EqualizedPvP.cpp:121 CEqualizedPvP::ReadConfig; /eqreload' },
    'equalizedpresets.inc': { server: RELOAD, client: null, reload: 'eq', cite: 'EqualizedPvP.cpp:~806 LoadPresetFile (after ReadConfig); /eqreload' },
    'guildsiegeprize.lua': { server: STARTUP, client: null, cite: 'eveschool.cpp:3672 LoadPrizes (WorldServer) + databaseserver/Project.cpp:216 LoadScript (DatabaseServer)' },
    // Dungeon task: time limit, cooldown, levels, kill-all (WorldServer only, read once at start; no reload command)
    // Mini Events: read on the WorldServer's first tick and by the GM command /eventreload (refused while an event runs)
    'antibot.inc': { server: RELOAD, client: null, reload: 'antibot', cite: 'AntiBotMng.cpp:375 Process -> LoadScript :28; /antibot reload' },
    'minievent.inc': { server: RELOAD, client: null, reload: 'event', cite: 'MiniEventMng.cpp:643 Process -> ReadConfig :134; /eventreload FuncTextCmd.cpp:1826' },
    // Mounts: the seat, speed, loops and flying of every mount; both read it once at start (no reload; /mountset changes only the
    // running copy until a restart)
    'mount.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:1102 LoadMountAnimationList (#ifdef __MOUNT)' },
    'partydungeon.lua': { server: STARTUP, client: null, cite: 'Project.cpp:908 CInstanceDungeonParty::LoadScript -> InstanceDungeonBase.cpp:384' },
  };
  const DYO = { server: STARTUP, client: null, cite: 'WorldFile.cpp:297 LoadObject (#ifdef __WORLDSERVER :269)' };
  // a map's monsters (the Vagrant Race map): the WorldServer spawns them from the respawn lines it reads when it loads the world
  const RGN = { server: STARTUP, client: null, cite: 'WorldFile.cpp:554 ReadRespawn (monsters: #ifdef __WORLDSERVER :601)' };
  const BOARD = { server: null, client: CLICK, cite: 'npc-board.diff: WndWorld.cpp OnCommand default:' };
  // the Guild Siege boards: the game's own code reads them on each click (no patch needed)
  const GS_BOARD = { server: null, client: CLICK, noPatch: true, cite: 'WndWorld.cpp:4653 / :4734 FILE_GUILDCOMBAT_TEXT_n' };
  // a file the table does not know: assume both read it at startup (the safe answer)
  const UNKNOWN = { server: STARTUP, client: STARTUP, cite: '?' };

  function readerOf(key) {
    key = key.toLowerCase();
    if (READERS[key]) return READERS[key];
    if (/^world\/.+\.dyo$/.test(key)) return DYO;
    if (/^world\/.+\.rgn$/.test(key)) return RGN;
    if (/^client\/npcboard_\d+\.inc$/.test(key)) return BOARD;
    if (/^client\/guildcombattext_\d_(eng|usa)\.inc$/.test(key)) return GS_BOARD;
    return UNKNOWN;
  }

  const PATCHES = {
    'npc-board': { file: 'docs/patches/npc-board.diff', what: 'rules text windows', marker: 'NpcBoard_%d.inc', src: '_Interface/WndWorld.cpp' },
    'donation-tree': { file: 'docs/patches/donation-tree.diff', what: 'category order and item card text', marker: 'DS_LoadTreeOrder', src: '_Interface/WndDonationShop.cpp' },
    // server + game: the WorldServer charges the fees, the game shows them and checks the player's Penya (NOT YET TESTED IN GAME)
    'upgrade-fees': { file: 'docs/patches/upgrade-fees.diff', what: 'upgrade fees read from UpgradeFees.lua', marker: 'CUpgradeFees', src: 'WORLDSERVER/ItemUpgrade.cpp', server: true },
  };
  const BUILD = 'build the Neuz project (Source/Source/Neuz/Neuz.sln, configuration NoGameguard). Only Neuz: no server is rebuilt. Start Server.bat then copies the new Neuz.exe (Client\\- Start Game.bat)';
  const BUILD_BOTH = 'build the WorldServer project and the Neuz project (configuration NoGameguard). Start Server.bat then starts the new WorldServer and copies the new Neuz.exe (Client\\- Start Game.bat)';
  const buildOf = p => (p.server ? BUILD_BOTH : BUILD);

  // input:
  //   changes  [{ label, files: [key] }]           one per undo step since the last save
  //   client   { key: 'written' | 'created' | 'datares' | 'different' | 'none' }
  //            what happens to the game's own copy of a shared file in this save
  //            (none = no Client folder; datares = no loose copy and none created)
  //   patches  { 'npc-board' | 'donation-tree': 'in-source' | 'missing' | 'unknown' | 'built' }
  //   codes    [diagnostic codes present now] (DT_PATCH / DT_ORDER: the tree needs donation-tree.diff)
  //   names    { key: file name as on disk } (optional; for the messages only)
  // -> { steps: [{ id, state?, text, short }], changes: [{ label, needs: [id], why: [text] }], notes: [{ id, file, text }],
  //      built: [patch ids a change needs that are ticked as built into Neuz] }
  function compute({ changes = [], client = {}, patches = {}, codes = [], names = {} }) {
    const nameOf = key => names[key] || key.split('/').pop();
    const has = new Set(codes);
    const treePatch = has.has('DT_PATCH') || has.has('DT_ORDER');
    const outChanges = [], notes = [], noted = new Set();
    const all = new Set(), built = new Set();
    for (const c of changes) {
      const needs = new Set(), why = [];
      for (const key of c.files) {
        const r = readerOf(key), name = nameOf(key);
        if (r.server === STARTUP) { needs.add('servers'); why.push(`the WorldServer reads ${name} once, at startup (${r.cite})`); }
        if (r.server === RELOAD) { needs.add('reload:' + r.reload); why.push(`the WorldServer reads ${name} at startup and on /${r.reload}reload (${r.cite})`); }
        if (r.client === STARTUP) {
          const st = client[key] || 'none';
          if (st === 'written' || st === 'created') { needs.add('game'); why.push(`the game reads its own Client/${name} once, at startup`); }
          else if (!noted.has(key)) {
            noted.add(key);
            notes.push({ id: st, file: name, text: st === 'datares'
              ? `Client/${name}: there is no loose copy, so the game keeps reading its old copy packed in data.res and will not show this change. Tick "create Client/${name}" in the Client/ list to fix it.`
              : st === 'different' ? `Client/${name} differs from the server copy, so it was not changed: the game will not show this change until you update it by hand.`
              : `No Client folder: copy ${name} into the game's Client folder by hand, or the game will not show this change.` });
          }
        }
        if (r.client === WINDOW) {
          needs.add('reopen:donation'); why.push(`the game reads Client/Client/${name} each time the Donation Shop window opens (${r.cite})`);
          if (treePatch) { needs.add('patch:donation-tree'); why.push('a category the game\'s code does not know sorts last and gets the wrong card text until donation-tree.diff is built into Neuz'); }
        }
        if (r.patch) { needs.add('patch:' + r.patch); why.push(`the server and the game read ${name} only with ${r.patch}.diff built into the WorldServer and Neuz; without it they keep the fees compiled in the C++`); }
        if (r.client === CLICK && r.noPatch) { needs.add('click:board'); why.push(`the game reads Client/Client/${name} each time the board menu is clicked (${r.cite})`); }
        else if (r.client === CLICK) {
          needs.add('click:board'); needs.add('patch:npc-board');
          why.push(`the game reads Client/Client/${name} each time the menu is clicked, but only with npc-board.diff built into Neuz`);
        }
      }
      for (const id of [...needs]) if (id.startsWith('patch:') && patches[id.slice(6)] === 'built') { needs.delete(id); built.add(id.slice(6)); }
      needs.forEach(n => all.add(n));
      outChanges.push({ label: c.label || 'edit', needs: [...needs], why });
    }

    const steps = [];
    for (const id of Object.keys(PATCHES)) {
      if (!all.has('patch:' + id)) continue;
      const p = PATCHES[id], state = patches[id] || 'unknown';
      steps.push({ id: 'patch:' + id, state, short: `build ${p.server ? 'the WorldServer and Neuz' : 'Neuz'} with ${p.file.split('/').pop()}`, text: state === 'in-source'
        ? `C++ (once): ${p.file.split('/').pop()} (${p.what}) is already in the source. If ${p.server ? 'they were' : 'Neuz was'} not built since, ${buildOf(p)}.`
        : `C++ (once): in FLYFF-V19-SOURCE run "git apply -p1 ../FLYFF-RESOURCE-EDITOR/${p.file}" (${p.what}), then ${buildOf(p)}.` });
    }
    const patched = steps.length > 0;
    if (all.has('servers')) steps.push({ id: 'servers', short: 'run Stop Server.bat, then Start Server.bat', text: 'Run Stop Server.bat, then Start Server.bat. The servers only read these files when they start, and Stop Server.bat also closes the game, so the game reads its copies again too.' });
    else if (all.has('game') || patched) steps.push({ id: 'game', short: 'restart the game', text: 'Close the game and start it again (Client\\- Start Game.bat). No server restart is needed.' });
    else {
      if (all.has('reopen:donation')) steps.push({ id: 'reopen:donation', short: 'reopen the Donation Shop window', text: 'Close and reopen the Donation Shop window in the game. No restart is needed: it reads the categories each time it opens.' });
      if (all.has('click:board')) steps.push({ id: 'click:board', short: 'click the rules menu again', text: 'Click the rules menu again in the game. No restart is needed: it reads the text on every click.' });
    }
    // FFA / TDM settings: a server restart reads them too; else the GM reload command (refused while a run is going)
    if (!all.has('servers')) for (const k of ['ffa', 'tdm']) if (all.has('reload:' + k)) {
      const L = k.toUpperCase();
      steps.push({ id: 'reload:' + k, short: `type /${k}reload in game`, text: `In the game, as GM, type /${k}reload while no ${L} runs (it is refused during a run; the chat line says how many start times and the fee it read). Or run Stop Server.bat, then Start Server.bat.` });
    }
    if (!all.has('servers') && all.has('reload:antibot')) steps.push({ id: 'reload:antibot', short: 'type /antibot reload in game', text: 'In the game, as GM, type /antibot reload (bad lines go to error_*.txt; with fewer than 6 good words the old list stays). The tuning lines need the V19 change d816e99f built into the WorldServer; an older build skips them. Or run Stop Server.bat, then Start Server.bat.' });
    if (!all.has('servers') && all.has('reload:event')) steps.push({ id: 'reload:event', short: 'type /eventreload in game', text: 'In the game, as GM, type /eventreload while no Mini Event runs (it is refused during an event; the chat line says how many start times it read, or the error that switched Mini Events off). Or run Stop Server.bat, then Start Server.bat.' });
    if (!all.has('servers') && all.has('reload:eq')) steps.push({ id: 'reload:eq', short: 'type /eqreload in game', text: 'In the game, as GM, type /eqreload (the chat line says how many presets and problems it read; a battle already running keeps the players it has). Or run Stop Server.bat, then Start Server.bat.' });
    return { steps, changes: outChanges, notes, built: Object.keys(PATCHES).filter(id => built.has(id)) };
  }

  // The input of compute() for a workspace about to be saved:
  //   plan           FRE.clientSync.plan(ws, client) (null: no Client folder)
  //   createMissing  Set of lowercase names ticked "create Client/<name>"
  //   patches        FRE.patchState.effective(...)
  // One change per undo step still in ws.history (its label; only files still changed); files changed outside
  // the history (none today) are one more change.
  function forWorkspace(ws, { plan = null, createMissing = new Set(), patches = {} } = {}) {
    const dirty = new Set([...ws.files].filter(([, f]) => f.dirty).map(([k]) => k));
    const changes = ws.history.map(e => ({ label: e.label || 'edit', files: [...e].filter(k => dirty.has(k)) })).filter(c => c.files.length);
    const covered = new Set(changes.flatMap(c => c.files));
    const rest = [...dirty].filter(k => !covered.has(k));
    if (rest.length) changes.push({ label: 'Other changes', files: rest });
    const byName = plan ? new Map(plan.map(p => [p.lower, p])) : null;
    const client = {};
    for (const k of dirty) {
      const p = byName && byName.get(k);
      client[k] = !p ? 'none' : p.mode === 'identical' || p.mode === 'eol' ? 'written'
        : p.mode === 'missing' ? (createMissing.has(k) && !p.server.dir ? 'created' : 'datares') : 'different';
    }
    const names = Object.fromEntries([...dirty].map(k => [k, ws.files.get(k).name]));
    return compute({ changes, client, names, patches, codes: ws.diags.map(d => d.code) });
  }

  FRE.afterSave = { READERS, DYO, BOARD, GS_BOARD, PATCHES, readerOf, compute, forWorkspace };
})(globalThis.FRE = globalThis.FRE || {});
