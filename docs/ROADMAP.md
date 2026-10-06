# Roadmap and handoff

_Last updated 2026-10-06._

> **Handoff (2026-10-06, late night) — START HERE:** **Add New NPC step 1 (shop NPC, reworks 1b + 1c + 1d) is committed (`7cbb9c9`) but NOT tested in game yet.** The user tested 1c in Brave: OK except the Model list and the Building tag, both reworked in 1d (below). Next: the in-game test (handoff §8 + the `[tag]` above the name and its minimap icon) on a test copy first, then the real folder after asking. Plans: `/home/kevin/.claude/plans/magical-spinning-knuth.md`, `/home/kevin/.claude/plans/flickering-shimmying-dahl.md`. Tests: `gjs -m tests/run-tests.js` 543 pass, `tests/run-ui.sh` 183 pass, `python3 tools/oracle_sim.py newnpc` (152 cases + 12 small structure files, JS = Python).
>
> **1d (user test feedback):**
> - Model: a **Used by NPCs / Not used yet / Both** dropdown replaces the checkbox; a model not in the chosen list is cleared (no stale picture). A line under it lists the files: `.o3d`, animations, textures — all in Client/Model, or what is missing. Textures are read from the `.o3d` (`newNpcSim.o3dTextures`; a test copy uses `Client/ModelTexture.list` + `Client/Model.textures` from `tools/refresh-fixtures.sh`). Models of NPCs hidden in `b6abf414` are proven ("Soraya (until b6abf414)").
> - Building: pick an existing tag, or **type a new one** (`+ New tag [Dungeon Pieces]`): adds `#define SRT_<NAME> <row>` (defineNeuz.h), `SRT_<NAME> IDS_ETC_INC_n` (etc.inc structure block) and the text (etc.txt.txt), Server + Client, in the same undo step as the NPC, the `b4b9a465` way. Only rows 18 and 19 are free (`MAX_STRUCTURE` 20 is compiled). Rules `NN_TAG_FILES`, `NN_TAG_FULL`, `NN_TAG_CHARS`, `NN_TAG_LONG` (31 max, `szName[32]`), `NN_TAG_DUP` (BLOCK), `NN_TAG_ICON` (INFO).
> - Simulator: port of LoadEtc's structure loop + the `[tag]` line (`newNpcSim.structures`, `tagOf`), Python copy `nn_structs`; 11 planted bugs (tags, structure loop, textures, b6abf414 models), all caught after adding cases.
>
> **User's test:** `python3 build.py`, `tools/refresh-fixtures.sh test-data` (new: Client defineNeuz.h / etc.* and the texture lists), reload, NPC Shops → + NPC: switch the Model list, type a tag in Building, Create (6 files), Save (backup has defineNeuz.h, etc.inc, etc.txt.txt + Client/), Undo. In game later (Windows): handoff §8 plus the `[tag]` above the name and its minimap icon.
>
> **After the user's OK:** commit step 1 (repo identity, Co-Authored-By trailer), then **Step 2: exchange NPCs + new exchange menus, Jeff's Weapon Pieces first** (plan §Step 2; reuse `FRE.ui.itemPicker`), then **Step 3: edit an NPC's menus + info-board texts (Guild Siege rules, `GuildCombatTEXT_<n>_<lang>.inc`)**, then Donation Shop simulator, F. drops, G. set effects. No 3D model viewer (the user chose pictures only).

## Done
- **Build 1** (`1c785ce`): NPC shop editor (`character*.inc`). Add, remove, price and tab edits; byte-exact save with verified backup. Tested by the user in Brave on `test-data`.
- **Build 1.1** (`b79f374`): shop simulator ("what players see", identical to an independent Python port for all 594 NPCs), readable rules, help text for every warning.
- **Step 1 + Step A** (the commit after `b79f374`):
  - comma display (`core/num.js`, `numInput`);
  - module system (`core/workspace.js` `MODULES`, `ui/common.js` `FRE.ui.modules`, mode switch in the toolbar);
  - shared `edit/text-ops.js`;
  - **one table per shop tab** with a Job column;
  - Donation Shop **core** (loader + validator + ops; **no UI yet**).
- **Step B** (committed with B+ and C): shop-type dropdown (Penya / Red Chip / Donate Chip) in the NPC header.
  - `FRE.shopOps.setShopType` renames only the command word (`AddShopItem` ↔ `AddVenderItem2`) and keeps the `( tab, II_X )` text, so a round trip gives identical bytes. Penya prices are dropped when converting to chips. `SetVenderType(n);` goes after the last `AddMenu`, is replaced in place, or is removed for Penya. All of it is one undo step.
  - Preview dialog first (`shopTypePlan`): dropped prices, items with no chip/Penya price, ignored rules, and the exact lines.
  - New codes: `C_RULE_IGNORED` (INFO, AddVendorItem rules in a chip shop) and `C_FIXED_IN_CHIP` (WARN, AddShopItem in a chip shop is charged in chips without the chip-price check).
  - Also: the browser tab icon is the client's Infinity MMO icon (`src/favicon.png`, from `Design/Logo/infinity_mmo.ico`).
- **Step B+** (committed):
  - NPC list filter: All shops / Penya / Red Chip / Donate Chip / All NPCs.
  - **Chip prices** edited in `Spec_Item.txt` `dwReferValue1` (`edit/item-ops.js`), the way commits `93a02124` / `fea9840b` did it. One price per item, shared with every chip shop and the Donation Shop (`7bedef15`), so other uses are named before writing.
  - **Convert preview** has a price box per item: chip prices go to Spec_Item.txt; Penya prices become `AddShopItem( tab, II_X, price )`. Conversion and prices are one undo step (`Workspace.applyGroup`).
  - **Client sync** (`core/client-sync.js`, `io/save.js`): with a Client folder chosen, each save applies the same change to the client's loose copies (identical / LF-only copies), backs them up under `<backup>/<stamp>/Client/`, verifies, and restores on failure. Missing loose copies (`character-etc.inc`, `character-school.inc`) are created after asking (`b7645c52`).
  - **Item tooltip on hover** (`loaders/item-tooltip.js`, `loaders/textclient.js`, `ui/tooltip.js`): port of `CWndMgr::MakeToolTipText` for a new item, texts from `textClient.inc`, plus "Editor info" (buff effect and `dwSkillTime`, prices) that the game leaves out.
  - Fix: byte files (e.g. `DonationShop.inc`) rejected every inserted line break (`bytes.isPrintableAscii`). The Donation Shop UI would have hit it.
- **Step C** (committed): Donation Shop editor (`ui/donation.js`).
  - Left: All items + categories with counts, in the order of the client's `Client/Client/DonationShopTree.inc` (`loaders/donation-tree.js`, port of `CWndTreeCtrl::InterpriteScript`) when the Client folder is chosen; search lists matching items.
  - Table: # · Item (hover tooltip) · Job · Price (Donate chips = shared chip price, editable via `ui/chip-price.js`) · Category (move) · ✕ · Line. `+` adds to the selected category.
  - New rules: `DS_CRASH` BLOCK (Nexus Shield, Icecrown Purple Shield crashed the server when bought, commit `ae345504`), `DS_NO_LEAF` WARN (category not a leaf in the client tree: the item only shows under "All Items").
  - Categories: only the client tree's leaves (or the file's categories) are offered; the tree file is client-only and not edited.
  - Oracle cross-check of rows/categories; `DonationShop.inc` stays LF (its header comment wrongly says CRLF).
  - Toolbar: file chips collapsed into one summary chip; only changed or read-only files get their own chip.
  - User-test fixes: the editor scrolls inside the window (`#editor` needed `min-height: 0`), keeps its scroll position after an edit, and hides a stuck tooltip; the editor switch is labelled "Editing:"; the NPC list defaults to "Shops with editable items" (6 NPCs with AddShopItem / AddVenderItem2; rule-only shops like Boboku stay under "All shops").

- **Step D** (committed): Battle Pass editor (`ui/battlepass.js`, `loaders/battlepass.js`, `edit/battlepass-ops.js`, `loaders/propmover.js`).
  - Loader: port of `CProject::LoadBattlePass` (`ProjectCmn.cpp:1682`). Every table is a `std::map` filled with `insert`, so the FIRST duplicate wins. At login the server uses the pass with the LOWEST item id (`mapBattPassItem.begin()`).
  - `loaders/propmover.js`: port of `CProject::LoadPropMover` (`ProjectCmn.cpp:380`), read-only, for each monster's name, level and rank. Checked against a column read of propMover.txt in `tools/oracle.py`.
  - **Season:** the end date is a date box. `YYYYMMDD` = 00:00 at the START of that day, shown in words. **Start new season** sets the date (first day + length) and bumps nType on the pass and every reward row in one undo step. The item is reused (`2f783090`). The dialog says whether players roll over at next login (old season ended) or need `/rrbp`/SQL.
  - **Reward ladder:** qty, cost, item (↺ then +), rarity/icon textures (checked against `Client/Theme` when the Client folder is chosen). Add the next level from the item list; only the last level can be removed. The last level's cost is never used, so reaching level 50 takes **146,000** points, not the 150,000 the file header says.
  - **Monster points:** min/max per row, add/remove, filters Listed / Off band / Not listed. The level-band rule (`c0a828d7`, `3b8e8410`) matches all 863 season-1 rows exactly: base band by level, ×1.25 midboss, ×1.5 boss, ×2 super, half rounds up. "Re-price off-band rows" sets the band price and refreshes the `// lvN rank - Name` comment.
  - Rules: `BP_BRACES`, `BP_FORMAT`, `BP_UNDEF`, `BP_NO_ITEM`, `BP_NO_MONSTER`, `BP_DUP_*`, `BP_LEVEL_GAP`, `BP_DATE`, `BP_TYPE` (BLOCK); `BP_EXPIRED`, `BP_MULTI_PASS`, `BP_CLAMP`, `BP_TYPE_ROW`, `BP_TEXTURE`, `BP_BAND`, `BP_DATE_FORMAT`, `BP_NO_PASS` (WARN); `BP_LOGO_UNUSED` (INFO: the client never draws strLogo).
  - Real file today: only `BP_EXPIRED`. Season 1 ended 2026-10-05 00:00, so nobody earns points until a new season is set.
  - `BattlePass.inc` is LF in both copies (its header says CRLF) and identical in `Client/`.
  - After the user's review: only BP5 monsters pay points (`AttackArbiter.cpp:966`, killing blow only). **"Add all unlisted monsters"** adds the 32 real monsters missing from season 1 (ship, dream and Hern dungeons, zombies, Mirrored Soul) at their band price. Town NPCs, guards and pets are left out (`battlePass.isMonster`).
  - Pets (98) and town NPCs (8) listed in season 1 are hidden in the editor (they never pay points); a note offers to delete them from the file.
  - The date box shows the LAST playable day; the file gets the day after (00:00 = midnight after it). New seasons default to 30 full days.
  - Season-change tests (`tests/bp-server.js`, a port of OnJoin / OnDied / AddBPUpdate / GiveBattlePassReward / OnDoBP): S1 buyers restart S2 on the free track and keep S1 rewards; an unused S1 pass unlocks S2; a pass used while no season runs is wasted.
  - Texture column hidden (all 50 rows use "" = the item's own icon); the file keeps the three "" per row because the server reads three tokens. "↺" became a "Change" button.
  - **Server issue (C++, not fixed here):** `CDPSrvr::OnDoBP` activates a pass whose season has already ended. The Donation Shop still sells it, so a player who uses it while no season runs loses the item for only the level-1 reward. Start the new season before that happens; a C++ end-date check would close it for good.

- **Step E** (built, waiting for the user's test): Exchange editor (`loaders/exchange.js`, `edit/exchange-ops.js`, `ui/exchange.js`).
  - Loader: port of `CExchange::Load_Script` (`_Common/Exchange.cpp:32`).
    - It is a bare `CScanner`: only `CScript::GetDefineNum` resolves names (unknown = -1, no log). A name in a number slot reads as 0.
    - `PENYA` = `II_GOLD_SEED1` (gold). An optional 4th PAY value is the item flag: 2 = `binds` (`Item.h:132`), used by 38 lines.
  - **`__NEW_EXCHANGE_V19` is ON** (`_Common/LodeConfig.h:18`, included by the WorldServer and Neuz `StdAfx.h`). The old roadmap said it was off. So:
    - CONDITION is checked AND taken; REMOVE is ignored;
    - a menu keeps at most 30 SETs (Collins had 30 in `f58e56ba`).
    - Edits keep REMOVE equal to CONDITION while they match, like `f58e56ba`, `3099c822`, `15091d5f`.
  - PAY chances are out of 1,000,000: the line that crosses 100% is cut and later lines are dropped; a total under 100% tops up the last line. The editor shows the chance the server really uses.
  - The client loads its own copy and sends only the recipe's position (`WndControl.cpp:1980`, `CDPSrvr::OnExchange`), so Server and Client copies must match. The Client copy is the same text with LF (`eol` sync mode).
  - Any NPC menu id without its own `case` opens the exchange window (`WndWorld.cpp:6470`).
  - **Real file finding:** 12 old menus use `SET_SMELT` / `SET_ENCHANT_MOVE` (blocks from a newer server). This loader ends the menu at the first `}` inside them and reads the rest as junk "menus" (`PAY`, `}`, id -1). The three chains (`MMI_BEHEMOTHSMELTEVENT_TWOSWORD`, `MMI_CHRISTMASENCHANTEVENTMENU`, `MMI_SEAKINGLOOKCHANGEMENU`) also swallow `MMI_MAPLE_TRADE`, `MMI_EVENT_2012HAPPYMONEYMENU` and `MMI_SEAKINGMASKCHANGEMENU`: none of them is ever loaded (`EX_OUT_OF_STEP`, WARN). 285 recipes load in 72 + 3 menus; 24 more are read inside junk menus.
  - Rules: `EX_FORMAT` (missing } = hang), `EX_UNDEF` (ingredient / reward: BLOCK), `EX_NO_ITEM` (reward: BLOCK, server crash in `GetProp()`), `EX_PACKMAX`, `EX_PAY_EMPTY` (BLOCK); `EX_PROB_OVER`, `EX_PROB_UNDER`, `EX_PAYNUM`, `EX_QTY`, `EX_SET_CAP`, `EX_DUP_MENU`, `EX_ROW_WIDE`, `EX_OUT_OF_STEP` (WARN); `EX_NO_NPC`, `EX_REMOVE_IGNORED` (INFO). Real file today: 3 `EX_OUT_OF_STEP` and 24 `EX_NO_NPC`.
  - UI:
    - Left: menus named by their NPCs (filter "Opened by an NPC" / "All menus"). Search covers menu names, NPC names and item names.
    - One card per recipe: ingredients, rewards (qty, chance, "Server uses", Bound), "Gives n of m", "Spread evenly", and the in-game icon row (about 9 icons fit).
    - Recipe actions: move up/down, copy, remove. A recipe with EUC-KR comments is rebuilt from its values (comments dropped); the editor asks first.
  - `tools/oracle.py` reads the file as a balanced-brace tree; it agrees on all 72 in-step menus.

- **One folder, one task** (built 2026-10-06, waiting for the user's test):
  - The start screen asks for ONE folder; `io/layout.js` finds the paths: `FLYFF-V19-SOURCE` → `Server/Resource` + `Client` (REAL); `test-data` → `Resource` + `Client` + `backups` (TEST). Nothing is created inside a real source folder; its backups folder is asked once and remembered.
  - Then one task card: only that task's files are opened, shown and saved (`Workspace` `only`). The Client copies are attached automatically. "Change task" asks before dropping unsaved edits.
  - The manual "Backup" snapshot button is gone (every save backs up first). Backup subfolders are named `<stamp>_<task>`.

- **In game** (built 2026-10-06): `loaders/world.js` ports `CWorldMng::LoadScript` (World.inc), `ReadObj` / `CMover::Read` (.dyo NPC placement; every map file reads to its 0xFFFFFFFF end) and `CWorld::IsUsableDYO2` (SetOutput / SetLang; server language compiled in, `WorldServer.rc:137` = LANG_USA). The Exchanges list defaults to the **9 menus players can use** (Collins; Rambo's 4 Colosseum menus; Card Master + Epie ×2; Pet Tamer + Cheirang; Nerupha's mask menu). Each menu shows its NPCs with "on WdMadrigal" / "hidden: SetOutput( false )" / "not placed on any map".
  - Recipe cards now lead with a big "You get …" line (with the server's chances), then Rewards, then Costs.
  - Unticking Bound removes the flag value instead of writing `0`.

- **Exchange simulator** (2026-10-06, user-tested): `loaders/exchange-sim.js` (`FRE.exchangeSim`), `tools/exchange-sim.js`, and a **Try it** button on every recipe card.
  - Ports `CDPSrvr::OnExchange` → `CExchange::ResultExchange` (`_Common/Exchange.cpp:434`): CheckCondition + `CMover::GetItemNum`, GetPayItemList + `xRandom` (the server's LCG), IsFull + `GetEmptyCount`, `RemoveItemA` / `RemoveAllItem`, `CreateItem` → `CItemContainer::IsFull` / `Add`; and the client's `CWndDialogEvent::ReceiveResult` (Collins' chat line, `15091d5f`) and the row dimming (`WndControl.cpp:1973`). No commit changes `Exchange.cpp`.
  - Try it: press OK N times with the same fresh bag (how often each reward comes out) or one bag that keeps the rewards (runs out, fills up); shows refusals, items taken, lost rewards and what the player reads.
  - `gjs -m tools/exchange-sim.js` runs all 75 recipes of the 9 live menus: every one works, observed chances match the server's (Card Master 60/40).
  - In-game findings (tests assert each):
    - The reward roll happens BEFORE the bag check; a full bag takes nothing.
    - The bag check wants at least one EMPTY slot every time, even when the reward would stack (Collins' Scroll of Holy with 1 free slot: the 2nd exchange is refused). A stack the exchange uses up counts as empty.
    - It counts a reward as `qty / dwPackMax` slots, rounded down, so 3 small rewards (`PAY 0`) with 1 free slot pass the check and 2 are LOST (the server only logs an error). No live recipe hits this.
    - `PENYA` is gold only; Perin items do not count.
    - Any item in a trade / private shop, or stranded in a locked bag slot (expired Bag Expansion), makes every ingredient count 0: every exchange is refused.
    - Ingredients are counted and taken from equipped items too.
    - Ingredient quantity -1 (`=`) passes the check and takes EVERY one the player has (`RemoveAllItem`); the `EX_QTY` text now says so.
    - Collins' success line names the first reward of the CLIENT copy, not the one rolled; with Server and Client copies out of step the player gets one recipe and reads another.
  - Not modelled: Perin auto-convert in `AddGold` (only above 2,000,000,000 Penya), campus points, logs.

- **Independent copies** (2026-10-06): `tools/oracle_sim.py`, Python written from the C++ without reading the JS simulators.
  - `exchange`: its own `Load_Script` token loop, Spec_Item reading and bag model. 1,436 cases: for each of the 285 loaded recipes, exact ingredients, one short, double stock with a full bag, a bag stocked for 3 pressed 5 times, 1,500 presses for the rates; plus 10 small scripts for the edge cases. JS and Python agree on every result, roll, reward, lost reward and end bag.
  - `battlepass`: its own `LoadBattlePass` (clamps, first wins), `BattlePassConfigTime`, OnJoin, OnDied, AddBPUpdate, GiveBattlePassReward, OnDoBP. One timeline (7 players, 2 seasons, the season edit done by Python on the text vs the editor's `newSeasonPlan`), 44 steps, every player state agrees.
  - `core/xrandom.js`: the server's `xRand` / `xRandom(n)` / `xRandom(min, max)` (`_Common/xUtil.cpp`), shared by both JS simulators. `tests/bp-server.js` used its own 31-bit generator before (same range, different rolls).
  - `tests/bp-server.js` now ports OnDoBP's bag checks (1 empty slot to activate with no pass running; one empty slot per reward to pay back earlier levels; the pass is not used up when refused) and mails a reward when the bag is full.
  - Planted-bug check: 10 one-line bugs planted in the Python copy, one at a time; the tests now catch all 10. Five were missed at first because no case reached them, and cases were added: exact points at a level's cost; a roll exactly on a chance boundary (the seed is chosen so the first roll is 400,000); a bound reward next to an unbound stack in a full bag; back-pay with exactly enough free slots; a Battle Pass reward with a full bag (mailed).
  - Finding: with a nearly full bag, a bound reward (flag 2) cannot join an unbound stack of the same item, so it needs its own slot and can be LOST when a recipe gives several rewards.
  - Finding: one award of many points raises at most one level; the rest is banked and each later award raises one more level (`AddBPUpdate`).

- **After the user's test of Try it** (2026-10-06, user-tested):
  - Editor: picking an item (+ Ingredient / + Reward / Change) no longer scrolls to the top (the view key ignores `pick`; Battle Pass too). The "edited" badge rides on the undo entry, so Undo removes it. **Undo (n) / Redo (n)** count the edits of the whole task; the tooltip names the next step and its NPC / menu. Try it re-runs on every change.
  - Exchanges wording: cards are "Exchange N", named by their reward. The top button says "Remove <reward>" and removes the whole exchange (rewards and costs); the row ✕ removes one reward or cost.
  - **Battle Pass: Past seasons** (4th view): every season found in the backup copies of BattlePass.inc (`fsa.backupCopies`, `battlePass.seasonHistory`: key = login pass nType + end date, last copy's ladder), newest first, with a "now" comparison per level.
    - **+** adds a past reward as the next level (`addReward`).
    - **Use this whole ladder…** (`battlePassOps.restoreLadder`, preview, one undo step) gives the current season that season's costs, rewards and quantities; its number, end date and monsters stay.
    - **↑ / ↓** on the ladder swap rewards between levels; costs stay (`swapRewards`).
    - Tested through the Battle Pass simulator: after "Use this whole ladder" a buyer gets exactly the old season's reward at every level.
    - Seasons from before the first save through the editor are in no backup.
    - After the user's test: the current season has no card there (it is edited in Reward ladder); cards start closed; **+** opens a pop-up (a new top level, or instead of level N, with qty and cost editable) and a message says what changed; "BP4" / "BP5" replaced by plain words.
    - Reward ladder: the total ("146,000 points to reach level 50") is on top and follows every cost edit; **✕ on any level** (`removeLevel`: the levels above move down one with their rewards and costs, no gap), checked through the simulator.

- **Where each NPC stands** (2026-10-06, user-tested in Brave): `loaders/area.js` (`FRE.area`), `tools/area-sim.js`, `tools/oracle_sim.py area`.
  - Asked: in every task, show where each NPC stands in names players know, to know where to go when testing in game. Agreed: the map-window name, the area name on screen, and a GM `/te` command; shown in NPC Shops (header + list), Exchanges (each menu NPC) and Donation Shop (`MaFl_DONATION`). Battle Pass has no NPC.
  - C++ ported (details in INVESTIGATION.md §1.8):
    - `.dyo` positions × `OLD_MPU` 4 (`Obj.cpp:525`);
    - `CContinent::Init` / `Point_In_Poly` / `GetContinent` / `GetTown` (`WdMadrigal.wld.cnt`);
    - `CWndMapEx::GetMapArea`, with names from `propMapComboBoxData.inc` (`LoadPropMapComboBoxData`);
    - `CWorld::LoadRegion` / `ReadRegion` (`.rgn`) and the client's per-frame region loop (`WndWorld.cpp:9258`; caption style `bdf9f5cb`);
    - `CWorldMng::LoadScript` world titles, and the `LoadStrings` order for the world string files;
    - `TextCmd_Teleport` (`/te <world id> <x> <z>`).
  - Findings:
    - Town blocks in `.wld.cnt` have `C_useRealData 0`, so `GetTown` never finds a town (the map window never opens Flarine / Sain City / Darken / Eillun by itself).
    - The Flaris polygon has a stray vertex (7087, 8157), so it is self-intersecting.
    - `WdArena_1`'s strings file is not in `LoadStrings`, so its area names show as raw `IDS_` keys.
    - Valley of the Risen has no NPC.
    - Collins stands in three towns (Flaris, Saint Morning, Darkon 1, 2).
    - `readDyo` now treats `OT_SHIP` like `CObj` (`CShip` → `CCtrl::Read` = `CObj::Read`); no map holds one.
  - Real data: 427 NPC spots on 19 maps. WdMadrigal: Flaris 143, Saint Morning 72, Darkon 1, 2 49, Kaillun Grassland 39, Darkon 3 27, Shaduwar 6, Bahara Desert 4, Garden of Rhisis 2, outside every continent 4 (the map window shows "Madrigal").
  - Anchors in tests: the NPCs removed "from Flaris" in `b6abf414` are in Flaris; the `CContinent::GetRevivalPos` points land in Flaris / Saint Morning / Darkon 1, 2.
  - Independent copy: 427 NPC spots, 300 random walks (seeded `xRand`, 84,000 frames), 4,662 grid points over the Flaris polygon, small polygons, continent, map-window and region files. JS and Python agree on every case.
  - 16 one-line bugs were planted in the Python copy one at a time, and all 16 were caught. Cases were added for the 4 that slipped through at first: overlapping continents (id order), a duplicate map-window location, an old-format desc size of 256 (a `char`), and an empty `SetTitle( "" )`.
  - Not modelled: `RA_INN` regions (need the land height), caption timers, regions the server adds at run time, and the map window in other worlds (the world title names those).
  - `tools/refresh-fixtures.sh` and the UI harness also carry the region, string and continent files.

- **Add New NPC, step 1** (2026-10-06, committed `7cbb9c9`, NOT tested in game yet): plan `/home/kevin/.claude/plans/magical-spinning-knuth.md`.
  - `edit/npc-ops.js` (`newNpcPlan`, `buildRecord`, `insertPoint`), `validate/newnpc.js` (27 `NN_*` codes, handoff §6), `ui/new-npc.js`, `loaders/newnpc-sim.js`.
  - Core: `SourceFile` binary kind; the workspace keeps each map's `.dyo` as an editable file (`setMapFiles`, `refreshMaps`); string tables reload when a `.txt.txt` changes; save/backup/client sync handle files in sub-folders.
  - Findings: x/z ÷ 4 (`OLD_MPU`); insert at the final `FFFFFFFF`; the right-click popup lists menus by id (not AddMenu order) with a few special labels; V19 always opens it.
  - Python copy: 125 forms (the §5 example, every World.inc map, both sides of every rule, menu order); 16 one-line bugs planted, all caught (3 needed new cases: a job rule; a made-up `MMI_` 349/350 define).
  - 1d (after the user's test): Model list dropdown + file/texture line; new building tag (defineNeuz.h + etc.inc + etc.txt.txt, `b4b9a465` way, rows 18/19); `etc.txt.txt` added to the string tables; models of NPCs hidden in `b6abf414` count as proven. Python copy: 152 forms + 12 small etc.inc structure files; 11 more planted bugs caught (5 needed new cases: rows at MAX_STRUCTURE, a 32-character existing name, `[ x` spacing, blocks after the structure block, a tag whose text but not define exists).

## Next (in this order, agreed with the user)

**Order (agreed 2026-10-06; tasks S and H–M added that day):**
1. Add New NPC step 1: committed (`7cbb9c9`), **not tested in game yet**. Do the in-game test (handoff §8) before calling it done; fix what it finds before starting S.
2. **S. Shops: everything editable** (asked 2026-10-06: "the idea is we're able to edit everything in a shop").
3. **H. "Where is this item used?"**
4. Add New NPC step 2 (exchange NPCs + new menus, Jeff's Weapon Pieces).
5. Add New NPC step 3 (edit NPC menus + info boards, Guild Siege rules).
6. **I. Rates & Buffs** (server rates, level-up gifts, rebirth tiers, guild buff, server buff, couple; buff descriptions written from the stats).
7. F. Monster drops (the Rates calculator then shows real drop chances).
8. **J. Random boxes.**
9. **K. Upgrade rates.**
10. **L. Monster Hunt + Badges + Collecting.**
11. G. Item set effects and weapon effects.
12. **M. Teleporter.**

The user may move tasks (e.g. L earlier if the badge TODOs become urgent). Sections H–M below are leads from a first look, not finished investigations: read the C++ named there before designing anything.

### Add New NPC (handoff written 2026-10-05, branch `ccr-25b694d1-jie3e1`, merged)
- Spec: **`docs/HANDOFF-ADD-NPC.md`** (read it whole first). In the web app the user creates an NPC, places it on a map (a new 200-byte record in `World/<map>/<map>.dyo`), ticks its right-click menus, and gives it up to 4 shop tabs with items. The app validates (§6, with self-tests §6.5), shows the exact text and bytes, backs up, writes the 6 files (Server + Client), reads them back and validates again (§7). In-game checklist: §8; out of scope: §9; build order: §10.
- `docs/resource-forensics.csv`: encoding, BOM and line ending of every Resource file (byte-exact saves).
- Reuses `loaders/world.js` (.dyo reading, IsUsableDYO2), `loaders/character.js`, `loaders/vendor-sim.js`. The area names (task above) help choose where to place the NPC.
- Simulator rule: port what the server does with the new NPC (LoadCharacter + .dyo read + shop fill), plus an independent Python copy, as for every task.

### Add New NPC: Step 2 and Step 3 (agreed 2026-10-06)
- **Step 2:** exchange NPCs and new exchange menus (`MMI_` 282-349, label `TID_MMI_*` = 7000 + id, empty menu in `Exchange_Script.txt`); the menus can also be added to existing NPCs. First real use: Jeff's Weapon Pieces exchange (`7b1210d4`; Weapon Pieces handoff Step 3).
- **Step 3:** edit an existing NPC's menus (add / remove `AddMenu`) and the info-board texts its menus show.
  - Example: the Guild Siege manager `MaFl_GuildWar`. `MMI_GUILDCOMBAT_INFO_BOARD1/2/3` and `MMI_GUILDCOMBAT_INFO_TEX` load the client-only `Client/Client/GuildCombatTEXT_<n>_<lang>.inc` (`WndWorld.cpp:4464-4620`, `CScript::Load` + `SetString`). Each file is ASCII, CRLF, with `#c` colour codes.
  - Goal: put the siege rules (TODO `13364001`) on a board.
  - Check which `<lang>` the client uses (`GetLangFileName`).
  - A brand-new info menu needs C++: a menu id without a `case` opens the exchange window.
  - Simulator + Python copy, as for every task.

### F. Monster drops (`propMoverEx.inc`)
- **Loader:** port `LoadPropMoverEx`, including the `AI{}` sub-parser.
- **Validation:**
  - an `MI_` id out of range → the server hangs at startup (BLOCK);
  - `DropItem` chance is out of 3,000,000,000; 518 lines exceed INT_MAX (warn, show the effective %);
  - `DropKind` rarity = monster level −5 … −2.

### G. Item set effects and weapon effects (asked 2026-10-06)
- What the bonuses of an item set (wearing N pieces) and a weapon's effects give a character, edited in the app.
- First find in the C++ and the commits which files and loaders hold them. Leads: the `SetItem` blocks of `propItemEtc.inc` (`_Common/Project.cpp:4567`, the same file as `LoadPiercingAvail`), the item's own stat values in `Spec_Item.txt`, and `randomoption.inc` / `ItemMergeRandomOption.txt`.
- Simulator: a character wears / wields the items, and the simulator applies the bonuses the way the server does, giving the stats the game would show. Plus the independent Python copy, as for every task.

### S. Shops: everything editable (asked 2026-10-06)
**Why:** today only fixed items (`AddShopItem` / `AddVenderItem2`) are editable. Items that come from an `AddVendorItem` rule show in the shop but can't be priced or removed.
- Example: Peach `MaFl_Peach` (character.inc ~7520) and Raia (~9519) each have `AddVendorItem( 0, IK3_GENERAL_RANDOMOPTION_GEN, -1, 190, 190, 100 )` → Scroll of Awakening (`dwCost` 100,000), and `IK3_SYSTEMPET_RANDOMOPTION_GEN` → Scroll of Pet Awakening (200,000).

**What the server allows** (port it; these limits must be shown, not hidden):
- A rule item's price is the item's own `dwCost` (Spec_Item.txt). One value per item: it is the price in every shop that sells it and the base of the sell-back price.
- `AddShopItem( tab, II_X, price )` also overwrites that same `dwCost` server-wide (`Project.cpp` AddShopItem branch; already a rule in this editor).
- A rule can't drop one item for one shop. Only `dwShopAble = -1` hides an item from every rule in every shop.

**What to build:**
1. **Every row editable.** A row from a rule gets the same price box and ✕ as a fixed item. Editing it asks:
   - **Make it a fixed item (default; the user's proven way, `73ee4bd6` re-priced only with `AddShopItem` lines):** replace the rule with `AddShopItem( tab, II_X, price )` for each item it gave in this shop (simulate with `vendor-sim.js`, same order), then apply the edit. One undo step. If the rule matched more items than the one edited, list them all in the preview.
   - **Change the base price (`dwCost`)** in Spec_Item.txt (Server + Client, the `item-ops.js` way, like chip prices `93a02124` / `fea9840b`). The preview names every other shop and system that uses this price (task H can supply it later).
2. **✕ on a rule item:** convert to fixed items without it. Never set `dwShopAble = -1` silently: it removes the item from every rule shop, so it is a separate, named action with the list of shops affected.
3. **Rules themselves** (moves the Deferred item here): add / edit / remove `AddVendorItem` (tab, IK3, job, rarity min–max), with a live preview of the generated items from `vendor-sim.js`, the 100-per-tab cap and `VENDORITEM//` no-match warnings.
4. **Same-price check:** when two shops sell the same item at different prices (e.g. Peach converted, Raia still on the rule), warn. Only one `dwCost` exists, so the last NPC loaded wins.

**Simulator:** `vendor-sim.js` already ports ProcessRegenItem. Add the buy price the player pays (find where the shop price is computed for a normal Penya shop) and the sell-back price, so the preview shows "players pay / get back". Python copy in `tools/oracle.py`.

### H. "Where is this item used?" (asked 2026-10-06)
- Pick any item (item DB panel or a new search box): list every place it appears, each with a jump link.
  - NPC shops (`AddShopItem`, `AddVenderItem2`, and `AddVendorItem` rules that match it, via `vendor-sim.js`);
  - Donation Shop, Exchanges (ingredient / reward), Battle Pass rewards;
  - later, as their tasks land: monster drops (F), random boxes (J), level-up / rebirth / couple gifts (I), Monster Hunt (L).
- Mostly reuses the existing loaders. It is read-only, so it needs no edit ops.
- Useful checks shown with it: the item is sold cheaper than an exchange or box gives it; it is in a shop but `dwShopAble = -1`; an `AddShopItem` price overrides it server-wide (name the NPC).
- Simulator: none of its own; it reports what the other tasks' simulators produce (e.g. the real shop contents). Its Python copy: an independent cross-reference of the same files in `tools/oracle_sim.py`.

### I. Rates & Buffs (asked 2026-10-06)
**Files, and the C++ that reads each one:**

| What | File | Loader |
|---|---|---|
| Server rates + level-up gifts | `Event.lua` (Lua) | `CEventLua`, `_Common/EventLua.cpp:176` |
| Rebirth tiers | `1Rebirth.inc` | `_Common/Project.cpp:6062` |
| Guild buff tiers | `GuildBuff.txt` | `_Common/GuildBuff.cpp:15` |
| Server buff tiers | `ServerBuff.txt` | `_Common/ServerBuff.cpp:30` |
| Couple | `couple.inc` | `CCoupleProperty::Initialize`, `_Common/couple.cpp:234` |

All five came in with the import commit `3ebc5356`. `Event.lua` was also changed by `4f268007` (`/weather`, the EXP bonus while it rains or snows).

**Server rates:**
- The real rates are the `Event.lua` event "Server Rates", running 2007-12-31 → 2099-12-31: `SetExpFactor( 30 )`, `SetGoldDropFactor( 10 )`, `SetItemDropRate( 10 )`, plus `SetWeatherEvent( 1.5, … )`.
- **Trap:** `Constant.inc` has `itemDropRate` / `goldDropRate` / `monsterExpRate`, but `CProject::LoadConstant` (`_Common/Project.cpp:1182`) only reads the block whose `lang` equals the server language. The server is LANG_USA (`WorldServer.rc:137`), and the file has only KOR / JAP / CHI blocks, so **Constant.inc changes nothing**. Show it as INFO and never offer it as the place to change rates.
- `Event.lua` is Lua, not CScanner. Port only the `AddEvent` / `SetTime` / `Set*` calls the server registers (`EventLua.cpp`), and edit them as statement splices.
- Level-up gifts: `SetLevelUpGift( level, "all", "II_…", qty, flag, minutes )` in the event "Level Up Rewards". Edit them as a ladder, like the Battle Pass reward ladder.

**Couple (first look):**
- `couple.inc` has four sections:
  - **Level:** points per level. 50 rows, but `couple.h` caps couples at `eMaxLevel = 21`, so rows 22–50 are unused (INFO).
  - **Item:** gifts per level (item, sex, flag 2 = bound, minutes, count).
  - **SkillKind:** `II_COUPLE_BUFF_POWER_01` / `BLESS_01` / `MIRACLE_01`.
  - **SkillLevel:** couple level → buff level per kind. Buff item = kind + level − 1 (`LoadSkillLevel`, `couple.cpp:317`). Rows are carried forward.
- `CUser::ProcessCouple` (`WORLDSERVER/User.cpp:3993`):
  - buffs are on only while the partner is online;
  - the couple gets 1 point per tick block, counted for only one of the two partners;
  - the buff is applied only when no `IK3_COUPLE_BUFF` buff is active, so after a couple level-up the old buff level probably stays until it is removed (partner offline / relog). Needs an in-game check.
- What the buffs really give (Spec_Item.txt):
  - POWER 01–04: `DST_ATKPOWER_RATE` 3 / 5 / 8 / 10;
  - BLESS 01–03: `DST_HP_MAX_RATE` 5 / 7 / 10;
  - MIRACLE 01: `DST_SPEED` +20.
- **The descriptions are wrong:** Power says "All Stats and Attack Power" (attack only), Bless says "Max HP and Movement Speed" (HP only), Miracle says "PvE Damage" (it is movement speed). Rule: warn when a buff's description doesn't match its stats.

**Descriptions from stats (asked):**
- For buff items edited here (couple, guild, server buff), offer to rewrite the item's description (`szCommand` IDS → `propItem.txt.txt`, Server + Client, UTF-16LE) from its real stats, in the house style ("Attack +10%, Max HP +10%").
- Show it as a preview first; it is part of the same undo step as the stat change.

**Simulator:**
- A rate calculator: for a player (rebirth tier, guild buff tier, server buff tier, couple level, weather, active events), the EXP, Penya and drop multipliers per kill.
- Port how the server COMBINES them: first find where each factor is applied (kill EXP, gold drop, item drop) and whether they multiply or add. Don't guess.
- F extends the calculator with per-monster drop chances.
- Python copy, as for every task.

### J. Random boxes (asked 2026-10-06)
- Files: `propGiftbox.inc` (`LoadGiftbox`, `_Common/Project.cpp:842`) and `propPackItem.inc` (`LoadPackItem`, `Project.cpp:855`; the client loads it too, see the comment in `OpenProject`).
- Show each box's contents with the real chance of each item, as the server rolls it.
- Rules: unknown items, chances that don't add up the way the loader expects, a box sold in the Donation Shop whose contents changed.
- Simulator: "open N boxes" with the server's `xRandom` (port the open-box code path), plus the Python copy.

### K. Upgrade rates (asked 2026-10-06)
- Files:
  - `ItemUpgrade.lua` (Lua; `CItemUpgrade::LoadScript`, `WORLDSERVER/ItemUpgrade.cpp:59`);
  - `propEnchant.inc` (`LoadPropEnchant`, `Project.cpp:833`);
  - `WeaponRarity.inc` (`Project.cpp:497`);
  - the Ultimate files (`Ultimate_UltimateWeapon.txt`, `Ultimate_GemAbility.txt`).
- Related commits: the done items "Trim the success rate in upgrading" and "Weapon rarity" in the TODO list. Find their hashes in `../FLYFF-V19-SOURCE` before designing.
- Show the success / fail / break chance per level.
- Simulator: "average tries and Penya / materials to reach +N", plus the Python copy.

### L. Monster Hunt + Badges + Collecting (asked 2026-10-06)
- Files:
  - `MonsterHunt.inc` (`_Common/MonsterHunt.cpp:49`);
  - `Badge.inc` (`_Common/Badge.cpp:93`; the badge right of the name, `__BADGE_SYSTEM`);
  - `collecting.inc` (`CCollectingProperty::LoadScript`, `Project.cpp:935`).
- Pending user TODOs this task should make easy:
  - "Make the badge scroll only show the badges not given by rebirth or lvl 150";
  - "Add badges in the collecting area and remove them from the Monster Hunt".
- Rules: every hunt's badge exists; every badge has a way to be earned; no badge is given by two systems by mistake.
- Simulator: a player kills the listed monsters / collects, and which badge they get and when. Plus the Python copy.

### M. Teleporter (asked 2026-10-06)
- File: `Teleporter.inc` (`CTeleporter::ReadConfig`, `Project.cpp:955`). Each entry is `TELEPORT_CASE <world> <x> <y> <z> <type> "<name>" "<picture>"`.
- Add, move or rename spots; show each spot's area name with `loaders/area.js`; check the picture exists in the client.
- Simulator: the teleport window's list and where the player lands, plus the Python copy.

## Deferred (needs in-game testing on the user's Windows PC)
- In-game check of task S edits (a converted rule shop, a changed `dwCost`: buy and sell-back prices).
- The first save against the real `Server/Resource`, then copy to `Client/`, restart, and check in-game.
- An exchange in game after an edit (Server and Client copies saved together).
- Where NPCs stand: `/te <id> <x> <z>` to a few NPCs (Lui, Collins ×3, Adrian), then check the area name on screen and the map window (M) against the editor.
- A new Battle Pass season in game: free track at login, kill points, buying the pass back-pays (the season-1 pass item reused).

## Known data findings (pre-existing, shown as warnings or info)
- 6 NPCs have no `{` after their name (they work by accident).
- 500 `AddVendorItem` rules in `character-school.inc` match nothing.
- `KePe_Rocbin` has 3 tabs over the 100-item cap.
- `MaFl_SecretRoom_EAST`'s Trade menu is commented out on purpose.
- `ResData.h` lines 1138–1140 have define names glued to their numbers (client UI, harmless).
