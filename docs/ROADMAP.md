# Roadmap and handoff

_Last updated 2026-10-06._

> **Handoff (2026-10-06, later):** **Where each NPC stands** is committed after the user's test in Brave (in-game check deferred to the Windows PC). The NPC Shops, Exchanges and Donation Shop tasks show "Where: Flaris — Flarine / Central Flarine" with a `/te 1 x z` copy button for each spot. The simulator is `loaders/area.js` + `tools/area-sim.js`, the independent copy is `tools/oracle_sim.py area`, and they agree on every case. **Next:** (1) **Add New NPC** (`docs/HANDOFF-ADD-NPC.md`; the area names help pick a spot); (2) a **Donation Shop simulator** (the buy flow) + its Python copy; (3) **F. Monster drops**, with both copies; (4) **G. Item set effects and weapon effects**, with both copies. Rule (CLAUDE.md): every task has a JS simulator AND an independent Python copy, and the tests require them to agree. Tests: `gjs -m tests/run-tests.js` (492 pass, about 90 s, reads `test-data/fixtures`), `tests/run-ui.sh` (150 pass). `tools/refresh-fixtures.sh` now also copies each map's `.rgn` / `.txt.txt`, `WdMadrigal.wld.cnt`, `world.txt.txt` and `propMapComboBoxData.*`; run `tools/refresh-fixtures.sh test-data` once so the manual copy has them (leave `test-data/backups`: Past seasons reads it).

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

## Next (in this order, agreed with the user)

### Add New NPC (handoff written 2026-10-05, branch `ccr-25b694d1-jie3e1`, merged)
- Spec: **`docs/HANDOFF-ADD-NPC.md`** (read it whole first). In the web app the user creates an NPC, places it on a map (a new 200-byte record in `World/<map>/<map>.dyo`), ticks its right-click menus, and gives it up to 4 shop tabs with items. The app validates (§6, with self-tests §6.5), shows the exact text and bytes, backs up, writes the 6 files (Server + Client), reads them back and validates again (§7). In-game checklist: §8; out of scope: §9; build order: §10.
- `docs/resource-forensics.csv`: encoding, BOM and line ending of every Resource file (byte-exact saves).
- Reuses `loaders/world.js` (.dyo reading, IsUsableDYO2), `loaders/character.js`, `loaders/vendor-sim.js`. The area names (task above) help choose where to place the NPC.
- Simulator rule: port what the server does with the new NPC (LoadCharacter + .dyo read + shop fill), plus an independent Python copy, as for every task.

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

## Deferred (needs in-game testing on the user's Windows PC)
- Editing `AddVendorItem` rules (the simulator in `loaders/vendor-sim.js` is ready for a live preview).
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
