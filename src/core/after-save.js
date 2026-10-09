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
//     (Project.cpp:3196 / 3218 / 3234), and it has no loose Client copy: a drop change needs only the server restart.
//   propGiftbox.inc (Boxes): LoadGiftbox is #ifdef __WORLDSERVER (Project.cpp:836-847), no Client copy: server restart only.
//   propPackItem.inc (Boxes): LoadPackItem (Project.cpp:855) runs in both; the game reads Client/propPackItem.inc (Item Wiki).
//   defineItem.h / propItem.txt.txt / mdlDyna.inc (+ New box): LoadDefines / LoadStrings / the model script, at startup in both.
//   Client/Client/DonationShopTree.inc: each time the Donation Shop window opens (WndDonationShop.cpp:346; 409 with donation-tree.diff).
//   Client/Client/NpcBoard_<id>.inc: on every click of the menu, once docs/patches/npc-board.diff is built.
// Stop Server.bat closes Neuz and every server; Start Server.bat starts them and then the game
// (Client\- Start Game.bat copies Source\Output\Neuz\NoGameguard\Neuz.exe first).
(function (FRE) {
  'use strict';

  const STARTUP = 'startup', WINDOW = 'window', CLICK = 'click';
  // key (lowercase, as in Workspace.files) -> { server, client, cite }
  const READERS = {
    'spec_item.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:790 LoadPropItem' },
    'character.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:796 / :3257 LoadCharacter' },
    'character-etc.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:796 / :3257 LoadCharacter' },
    'character-school.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:796 / :3257 LoadCharacter' },
    'character.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1256 LoadStrings' },
    'defineneuz.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1373 LoadDefines' },
    'definetext.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1383 LoadDefines' },
    'etc.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:830 LoadEtc' },
    'etc.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1259 LoadStrings' },
    'textclient.inc': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1366 LoadText' },
    'textclient.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1274 LoadStrings' },
    'exchange_script.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:979 -> Exchange.cpp:34 Load_Script' },
    'donationshop.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:932 -> ProjectCmn.cpp:1845 LoadDonationShop' },
    'battlepass.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:907 -> ProjectCmn.cpp:1682 LoadBattlePass' },
    // the game parses propMoverEx.inc too, but keeps no drop lines: DropItem / DropKind / DropGold are added #ifdef __WORLDSERVER
    'propmoverex.inc': { server: STARTUP, client: null, cite: 'Project.cpp:828 LoadPropMoverEx (drops #ifdef __WORLDSERVER :3196)' },
    // random boxes: LoadGiftbox sits in #ifdef __WORLDSERVER (Project.cpp:836-847); sets: the game loads its own copy too (Item Wiki, e08528a5)
    'propgiftbox.inc': { server: STARTUP, client: null, cite: 'Project.cpp:842 LoadGiftbox (#ifdef __WORLDSERVER :836)' },
    'proppackitem.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:855 LoadPackItem (the game too: Item Wiki)' },
    // a new box item (J part 2, the 949f2cc2 way): its #define, its name / description, its ground model
    'defineitem.h': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1376 LoadDefines' },
    'propitem.txt.txt': { server: STARTUP, client: STARTUP, cite: 'ProjectCmn.cpp:1261 LoadStrings' },
    'mdldyna.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:768 m_modelMng.LoadScript (the "model" line of Masquerade.prj)' },
    // Rates & Buffs: Event.lua (the WorldServer and the DatabaseServer, Project.cpp:983 / databaseserver/Project.cpp:192; the
    // DatabaseServer menu "Apply now", DatabaseServer.cpp:488, reloads it live), ServerBuff.txt (WorldServer only, Project.cpp:893),
    // GuildBuff.txt (both, Project.cpp:891; the game shows only what the server sends)
    'event.lua': { server: STARTUP, client: null, cite: 'Project.cpp:983 m_EventLua.LoadScript (+ databaseserver/Project.cpp:192)' },
    'serverbuff.txt': { server: STARTUP, client: null, cite: 'Project.cpp:893 loadServerBuffFile (#ifdef __WORLDSERVER)' },
    'guildbuff.txt': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:891 loadGuildBuffFile' },
    // rebirth tiers: both load it (Project.cpp:928, #ifdef __REBIRTH_SYSTEM only); the game discards the numbers but reads the file
    '1rebirth.inc': { server: STARTUP, client: STARTUP, cite: 'Project.cpp:928 LoadRebirthProp' },
    'client/donationshoptree.inc': { server: null, client: WINDOW, cite: 'WndDonationShop.cpp:346 (409 with donation-tree.diff) LoadTreeScript' },
  };
  const DYO = { server: STARTUP, client: null, cite: 'WorldFile.cpp:297 LoadObject (#ifdef __WORLDSERVER :269)' };
  const BOARD = { server: null, client: CLICK, cite: 'npc-board.diff: WndWorld.cpp OnCommand default:' };
  // a file the table does not know: assume both read it at startup (the safe answer)
  const UNKNOWN = { server: STARTUP, client: STARTUP, cite: '?' };

  function readerOf(key) {
    key = key.toLowerCase();
    if (READERS[key]) return READERS[key];
    if (/^world\/.+\.dyo$/.test(key)) return DYO;
    if (/^client\/npcboard_\d+\.inc$/.test(key)) return BOARD;
    return UNKNOWN;
  }

  const PATCHES = {
    'npc-board': { file: 'docs/patches/npc-board.diff', what: 'rules text windows', marker: 'NpcBoard_%d.inc', src: '_Interface/WndWorld.cpp' },
    'donation-tree': { file: 'docs/patches/donation-tree.diff', what: 'category order and item card text', marker: 'DS_LoadTreeOrder', src: '_Interface/WndDonationShop.cpp' },
  };
  const BUILD = 'build the Neuz project (Source/Source/Neuz/Neuz.sln, configuration NoGameguard). Only Neuz: no server is rebuilt. Start Server.bat then copies the new Neuz.exe (Client\\- Start Game.bat)';

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
        if (r.client === CLICK) {
          needs.add('click:board'); needs.add('patch:npc-board');
          why.push(`the game reads Client/Client/${name} each time the menu is clicked, but only with npc-board.diff built into Neuz`);
        }
      }
      for (const id of [...needs]) if (id.startsWith('patch:') && patches[id.slice(6)] === 'built') { needs.delete(id); built.add(id.slice(6)); }
      needs.forEach(n => all.add(n));
      outChanges.push({ label: c.label || 'edit', needs: [...needs], why });
    }

    const steps = [];
    for (const id of ['npc-board', 'donation-tree']) {
      if (!all.has('patch:' + id)) continue;
      const p = PATCHES[id], state = patches[id] || 'unknown';
      steps.push({ id: 'patch:' + id, state, short: `build Neuz with ${p.file.split('/').pop()}`, text: state === 'in-source'
        ? `C++ (once): ${p.file.split('/').pop()} (${p.what}) is already in the source. If Neuz was not built since, ${BUILD}.`
        : `C++ (once): in FLYFF-V19-SOURCE run "git apply -p1 ../FLYFF-RESOURCE-EDITOR/${p.file}" (${p.what}), then ${BUILD}.` });
    }
    const patched = steps.length > 0;
    if (all.has('servers')) steps.push({ id: 'servers', short: 'run Stop Server.bat, then Start Server.bat', text: 'Run Stop Server.bat, then Start Server.bat. The servers only read these files when they start, and Stop Server.bat also closes the game, so the game reads its copies again too.' });
    else if (all.has('game') || patched) steps.push({ id: 'game', short: 'restart the game', text: 'Close the game and start it again (Client\\- Start Game.bat). No server restart is needed.' });
    else {
      if (all.has('reopen:donation')) steps.push({ id: 'reopen:donation', short: 'reopen the Donation Shop window', text: 'Close and reopen the Donation Shop window in the game. No restart is needed: it reads the categories each time it opens.' });
      if (all.has('click:board')) steps.push({ id: 'click:board', short: 'click the rules menu again', text: 'Click the rules menu again in the game. No restart is needed: it reads the text on every click.' });
    }
    return { steps, changes: outChanges, notes, built: ['npc-board', 'donation-tree'].filter(id => built.has(id)) };
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

  FRE.afterSave = { READERS, DYO, BOARD, PATCHES, readerOf, compute, forWorkspace };
})(globalThis.FRE = globalThis.FRE || {});
