# Roadmap and handoff

_Last updated 2026-10-05._

> **Handoff (end of session 2026-10-05):** Steps B, B+ and C are built, user-tested in Brave on `test-data/` and committed (one commit, shared files). Next: **D. Battle Pass**. Before designing it, check `git -C ../FLYFF-V19-SOURCE log` for BattlePass commits (CLAUDE.md rule). Tests: `gjs -m tests/run-tests.js` (197 pass), `tests/run-ui.sh` (66 pass; the result box shows only failures). Headless Brave does not run in this environment, only Firefox. The user's Brave window sits partly behind the OS taskbar, so keep important UI away from the bottom edge.

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

## Next (in this order, agreed with the user)

### D. Battle Pass (`BattlePass.inc`, `CProject::LoadBattlePass`, `ProjectCmn.cpp:1682`)
- **What to edit:**
  - `BP1` holds the pass item and season end date (`YYYYMMDD` = midnight at the *start* of that day; show it in words);
  - `BP4` holds the reward ladder (`BPReward type level points item qty "logo" "rarity" "icon"`);
  - `BP5` holds the monster points (`BPMonster MI_x min max`, 863 rows; names from `propMover.txt.txt`).
- **Rules:**
  - `std::map::insert` keeps the FIRST entry, so duplicates are ignored (BLOCK if new);
  - clamps to 1–10000 (`MAX_BPOINTS`);
  - `nType` must match between the pass and its rewards;
  - level gaps;
  - date validity.

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

## Known data findings (pre-existing, shown as warnings or info)
- 6 NPCs have no `{` after their name (they work by accident).
- 500 `AddVendorItem` rules in `character-school.inc` match nothing.
- `KePe_Rocbin` has 3 tabs over the 100-item cap.
- `MaFl_SecretRoom_EAST`'s Trade menu is commented out on purpose.
- `ResData.h` lines 1138–1140 have define names glued to their numbers (client UI, harmless).
