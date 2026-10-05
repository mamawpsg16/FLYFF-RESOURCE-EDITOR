# Roadmap and handoff

_Last updated 2026-10-05._

> **Handoff (2026-10-05):** Step D (Battle Pass) is built, user-tested in Brave on `test-data/` and committed. Next: apply the new season on the real `Server/Resource` (season 1 ended 2026-10-05 00:00), then **E. Exchanges**. Tests: `gjs -m tests/run-tests.js` (299 pass), `tests/run-ui.sh` (88 pass; the result box shows only failures). `gjs -m tools/bp-sim.js` replays a season change with a port of the server logic.

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

## Next (in this order, agreed with the user)

### E. Exchanges (`Exchange_Script.txt`, `CExchange::Load_Script`, `_Common/Exchange.cpp:32`)
- **Format:** `MMI_x { DESCRIPTION SET TID { RESULTMSG CONDITION REMOVE PAY n { II_x n prob [flag] } } }`.
- **Server behaviour:**
  - `__NEW_EXCHANGE_V19` is off, so `REMOVE` is used as written;
  - the loader uses `GetDefineNum`, so an unknown name becomes -1 **silently** (`EX_UNDEF` BLOCK);
  - PAY chances are out of 1,000,000: the server trims totals above it and errors on totals below it;
  - `PAY n` must not exceed the number of reward lines.
- **UI:** show which NPCs use each menu (Collins: `MMI_COLLECT01`). If feasible, show recipe names from `textClient.inc` + `textClient.txt.txt`.

### F. Monster drops (`propMoverEx.inc`)
- **Loader:** port `LoadPropMoverEx`, including the `AI{}` sub-parser.
- **Validation:**
  - an `MI_` id out of range → the server hangs at startup (BLOCK);
  - `DropItem` chance is out of 3,000,000,000; 518 lines exceed INT_MAX (warn, show the effective %);
  - `DropKind` rarity = monster level −5 … −2.

## Deferred (needs in-game testing on the user's Windows PC)
- Editing `AddVendorItem` rules (the simulator in `loaders/vendor-sim.js` is ready for a live preview).
- The first save against the real `Server/Resource`, then copy to `Client/`, restart, and check in-game.
- A new Battle Pass season in game: free track at login, kill points, buying the pass back-pays (the season-1 pass item reused).

## Known data findings (pre-existing, shown as warnings or info)
- 6 NPCs have no `{` after their name (they work by accident).
- 500 `AddVendorItem` rules in `character-school.inc` match nothing.
- `KePe_Rocbin` has 3 tabs over the 100-item cap.
- `MaFl_SecretRoom_EAST`'s Trade menu is commented out on purpose.
- `ResData.h` lines 1138–1140 have define names glued to their numbers (client UI, harmless).
