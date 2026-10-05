# Roadmap and handoff

_Last updated 2026-10-05._

## Done
- **Build 1** (`1c785ce`): NPC shop editor (`character*.inc`). Add, remove, price and tab edits; byte-exact save with verified backup. Tested by the user in Brave on `test-data`.
- **Build 1.1** (`b79f374`): shop simulator ("what players see", identical to an independent Python port for all 594 NPCs), readable rules, help text for every warning.
- **Step 1 + Step A** (the commit after `b79f374`):
  - comma display (`core/num.js`, `numInput`);
  - module system (`core/workspace.js` `MODULES`, `ui/common.js` `FRE.ui.modules`, mode switch in the toolbar);
  - shared `edit/text-ops.js`;
  - **one table per shop tab** with a Job column;
  - Donation Shop **core** (loader + validator + ops; **no UI yet**).

## Next (in this order, agreed with the user)

### B. Shop-type dropdown: Penya / Red Chips / Donate Chips
- The dropdown is already in the NPC header (`ui/npc-shops.js`), disabled until `FRE.ui.previewShopType` exists.
- **Add `setShopType(text, npc, type)`** to `edit/shop-ops.js`:
  - write, replace or remove `SetVenderType(n);` after the last `AddMenu` in the `setting` block;
  - convert `AddShopItem( t, II_X[, cost] );` ↔ `AddVenderItem2(t, II_X);` (Penya prices are dropped when converting to chips);
  - leave `AddVendorItem` rules in place, but flag them with a new `C_RULE_IGNORED` INFO in chip shops (plus help text);
  - apply everything as **one** undo step: one `applySplices` call with all splices.
- **Preview dialog** before applying: the changed lines (`FRE.ui.renderDiff` style), items with no chip price, and Penya prices that will be dropped.
- **Tests:**
  - Wafor → Penya → Red Chip round-trips to identical bytes;
  - Lui → Red Chip changes only the expected lines;
  - a harness click-through.
- **No Perin:** the server has no Perin NPC shop.

### C. Donation Shop UI (`DonationShop.inc`, LF line endings)
- **`src/ui/donation.js`** (add it to `src/order.txt`):
  - left: categories with counts, plus "All";
  - table: `#` · Item · Job · Price (Donate chips = `dwReferValue1`) · Category dropdown (move) · ✕ · Line;
  - `+` adds the item to the selected category.
- **Ops already exist:** `FRE.donationOps.addItem`, `removeItem`, `setCategory`.
- **New categories** must also exist in `Client/Client/DonationShopTree.inc`, a client-only file. Offer existing categories only, unless the user asks otherwise.
- **Tests:** golden counts (338 rows, 20 categories), an oracle cross-check, LF kept, undo restores identical bytes, mutations `DS_UNDEF` and `DS_BRACES`, and a harness save.
- **Real data finding:** 9 shields in "Shields" have no donate-chip price, so they can't be bought (`DS_NO_PRICE`).

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
