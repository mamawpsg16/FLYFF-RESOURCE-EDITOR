# FLYFF-RESOURCE-EDITOR

A single-file, offline HTML editor (`dist/flyff-resource-editor.html`) for the resource files of the FlyFF v19 source in `../FLYFF-V19-SOURCE`. It runs in Chrome or Edge, or in Brave with `brave://flags/#file-system-access-api` enabled. It uses the File System Access API and has no backend.

The user is a web developer learning C++. When server behaviour matters, explain it in JS/TS terms.

## Hard rules
- **`../FLYFF-V19-SOURCE` is reference-only.** Never modify, build, or commit anything there. Before and after work, check `git -C ../FLYFF-V19-SOURCE status` is clean.
- **The real data folder is `../FLYFF-V19-SOURCE/Server/Resource/`.** There is no top-level `Resource/`. `Client/` holds copies the game client reads.
- **Never write to the real `Server/Resource` without asking first.** The user tests in the browser on `test-data/` (git-ignored copies). Automated tests read `test-data/fixtures/` only. Refresh either with `tools/refresh-fixtures.sh [test-data]`.
- **Base the work on what is committed in `../FLYFF-V19-SOURCE`.** Its commits are the user's own changes, and all of them were tested in game, even when the message doesn't say "Verified in game".
  - Before designing a loader, edit or warning, search `git -C ../FLYFF-V19-SOURCE log` (messages and diffs) for that file or system, and follow the way it was done there.
  - Cite the commit hash in code comments and docs. Only the parts a commit message calls "not yet tested" are unproven; say so when relying on them.
  - Examples: chip prices `93a02124` / `fea9840b`, shared Donation price `7bedef15`, loose Client copies `b7645c52`, tooltip `cf6f5502`.
- **The C++ loader is the authority**, not the file's look. Every loader here cites its C++ function and line. Read the C++ before adding or changing a parser. See `docs/INVESTIGATION.md`.
- **Byte-exact saves.**
  - `SourceFile` keeps the original bytes. Edits are splices on the current text, and bytes outside a splice are never rewritten.
  - Byte-oriented files accept ASCII-only inserts. Never normalise line endings, encodings, or whitespace. New lines copy the anchor line's indent and EOL.
  - Many custom files are LF; most legacy files are CRLF.
- **Every task has a simulator.** For each editor, port the server (and client, where it decides what players see) code that USES the data, not only the loader, so a test can replay what happens in game: a player opens the window, buys, exchanges, kills, logs in.
  - The simulator is a port of the named C++ functions (cite file:line and commits), with no guessing; anything not modelled is listed at the top of the file.
  - It runs headless (gjs) on `test-data/fixtures`. The core tests use it to prove each edit does in game what the user asked; a `tools/<name>-sim.js` lets the user (and you) replay it by hand.
  - Where it helps, the editor shows the result too ("what players see", "You get …").
  - **Every simulator has a second, independent copy in Python** (`tools/oracle_sim.py <task>`, or `tools/oracle.py` for NPC shops), written straight from the C++ without reading the JS copy. The Python copy makes its own test cases (bags, seeds, timelines, small scripts), runs them, and prints cases + results as JSON. `tests/run-tests.js` runs the same cases through the JS copy and requires identical results (every roll, item and state).
    - Both copies use the server's random generator (`core/xrandom.js` / `Rand`: `xRand`, `xRandom(n)`, `xRandom(min, max)` from `_Common/xUtil.cpp`), so the same seed gives the same rolls.
    - Plant a bug in the Python copy (a `<` for `<=`) and check a test fails. If none does, add a case that reaches that branch.
    - Limit: both copies are written by Claude, so they catch copying slips, not a shared misreading of the C++.
  - A new task is not done until its simulator, its independent copy and their tests exist.
  - Status:

    | Task | Simulator (JS) | Independent copy (Python) | Status |
    |---|---|---|---|
    | NPC Shops | `loaders/vendor-sim.js` (ProcessRegenItem / shop contents) | `tools/oracle.py` `vendor_sim` | done, all 594 NPCs agree |
    | Battle Pass | `tests/bp-server.js`, `tools/bp-sim.js` (OnJoin, OnDied, AddBPUpdate, GiveBattlePassReward, OnDoBP) | `tools/oracle_sim.py battlepass` (a 2-season timeline, 7 players) | done, every step agrees |
    | Exchanges | `loaders/exchange-sim.js`, `tools/exchange-sim.js`, "Try it" on each recipe (ResultExchange, CheckCondition, GetPayItemList, IsFull, RemoveItemA, CreateItem, ReceiveResult) | `tools/oracle_sim.py exchange` (1,436 cases) | done, every case agrees |
    | Where NPCs stand | `loaders/area.js`, `tools/area-sim.js` (CContinent, GetMapArea, ReadRegion, the client's region loop) | `tools/oracle_sim.py area` (427 NPC spots, 300 walks, small files) | done, every case agrees |
    | Add New NPC (step 1: shop NPC) | `loaders/newnpc-sim.js`, `tools/newnpc-sim.js` (LoadCharacter, LoadString, ReadObj/CMover::Read, IsUsableDYO2, ProcessRegenItem, the client's right-click popup, LoadEtc structure + the `[tag]` line) | `tools/oracle_sim.py newnpc` (152 forms: every map, every rule's edge, model files and textures, new tags; 12 small structure files) | done, every case agrees; 27 planted bugs caught |
    | New exchange menus (Step 2) | `newNpcSim.rightClick` / `opensOf` (AddMenu, TID 7000+id label, OnCommand's case list), `tools/menu-sim.js` + `exchange-sim` (every new exchange pressed) | `tools/oracle_sim.py newmenu` (35 specs incl. Jeff and random rewards (PAY n), 205 OK presses incl. 1,500-press rates; case list read from `WndWorld.cpp`) | done, every case agrees; 17 planted bugs |
    | Existing NPC edits (task S part 1) | `loaders/shop-window.js` (CWndShop tab bar, InsertItem, OnLButtonDown, SetCurSel, buy tab), `tools/npcedit-sim.js`, `npcEditOps` + `newNpcSim.rightClick` | `tools/oracle_sim.py npcedit` (88 Trade NPCs' windows, 48 small tab sets, 10 edit scripts: byte-identical files) | done, every case agrees; 13 of 14 planted bugs caught (the 14th changes nothing: a blank tab has no slot either way) |
    | Shop prices + rule rows (task S part 2) | `loaders/vendor-sim.js` (effectiveCosts: AddShopItem prices in load order; buyPrice / sellPrice: OnBuyItem / OnSellItem in float32; ruleToFixedPlan), `tools/shop-sim.js` | `tools/oracle_sim.py shop` (593 Penya NPCs × 6 rates, 179 price overrides, 38 edge prices, 234 rule tabs made fixed one after another (one item priced by 2 NPCs), a fixed line above the rules, rule + Spec_Item edits: byte-identical files) | done, every case agrees; 16 planted bugs caught (4 after adding cases) |
    | Rules windows (+ Menu → Rules text) | `loaders/board-text.js` (CEditString::ParsingString), `newNpcSim.opensOf` (the patched `default:` branch), `tools/board-sim.js` | `tools/oracle_sim.py board` (15 texts incl. the Guild Siege file's codes, 2 menus: written files byte-identical, right-click with / without the patch) | done, every case agrees; 8 planted bugs caught |
    | Move NPC / change model (task S part 3) | `npcEditOps.placementsOf` / `placePlan` (CWorld::LoadObject → ReadObj → CObj::Read / CMover::Read: facing, x/z ÷ OLD_MPU, y, m_dwIndex), `tools/npcmove-sim.js` | `tools/oracle_sim.py npcmove` (391 cases: every placed NPC moved once, Postbox spot 7 + model on all 11 spots, no-change, negative values) | done, every case agrees |
    | Donation Shop | none | none | **missing:** the buy flow (price = dwReferValue1, chip check, the crash items) |
    | Monster drops (F) | — | — | build both with the editor |
- **Commas are for display only** (`FRE.num`). The server tokenizer splits on `,`, so files always get plain digits.

## Key facts about this server (details in docs/INVESTIGATION.md)
- `__VER` is 19, so items load from **`Spec_Item.txt`**. `propItem.txt` is dead. A Spec_Item record is 175 values.
- **All files go through one tokenizer**, `CScanner` + `CScript` (ported in `src/core/lexer.js`). It's a token stream, not columns.
  - `=` means -1 / NULL_ID.
  - `-5` is two tokens.
  - An undefined name in a number slot becomes 0, logged as "Not Found".
  - `"""x"""` is 3 tokens.
- **Defines** come from the 21 headers in `CProject::LoadDefines`. Only `#define NAME <dec|hex>` is accepted; negatives and aliases are ignored, and the first definition wins.
- **NPC shops: one currency per NPC** (`SetVenderType` 0 = Penya, 1 = Red Chip, 2 = Donate Chip). There is no Perin NPC shop.
- **`AddShopItem`'s price overwrites the item's price server-wide.**
- **`AddShopItem` is added in every shop type.** In a chip shop it is charged in chips without the "chip cost < 1" check that `AddVenderItem2` gets (`C_FIXED_IN_CHIP`). Chip shops ignore `AddVendorItem` rules.
- **Client copies.** The game client reads a loose file in `Client/` if there is one, otherwise an old copy packed in `data.res` (`b7645c52`). `character-etc.inc` and `character-school.inc` have no loose copy. `Client/Spec_Item.txt` is LF while the Server copy is CRLF; the content is the same. Every proven data commit changes both copies ("Client copy synced").
- **Custom systems:**
  - `DonationShop.inc`: prices are each item's `dwReferValue1`. It is LF (its header comment says CRLF). Categories must be leaves of the client-only `Client/Client/DonationShopTree.inc`. Never list Nexus Shield / Icecrown Purple Shield: buying them crashed the server (`ae345504`).
  - `BattlePass.inc`: on a duplicate level or monster the first wins; values are clamped to 1–10000. LF (its header says CRLF). A season = end date + nType on the pass AND every reward row; the pass item is reused (`2f783090`). Monster prices follow level bands × rank (`c0a828d7`, `3b8e8410`).
  - **Which NPCs are in the game:** placed in a map `.dyo` file (`World/<map>/<map>.dyo`, maps from `World.inc`) AND shown by `CWorld::IsUsableDYO2` (`SetOutput` / `SetLang` in `character.inc`). The WorldServer's language is compiled in: `WorldServer.rc:137` `IDS_LANG "1"` = LANG_USA. Ported in `loaders/world.js`; skip commented lines (the real loader does).
  - **Adding an NPC** (`edit/npc-ops.js`, "+ New NPC" in NPC Shops): a block appended to character.inc, IDS lines appended to character.txt.txt, a 200-byte record inserted at the map `.dyo`'s final `FFFFFFFF`, x and z stored ÷ 4. All three in Server + Client. A new building tag adds `SRT_` lines to defineNeuz.h + etc.inc + etc.txt.txt (`b4b9a465`); only rows 18/19 are free (`MAX_STRUCTURE` 20 is compiled). No commit has added an NPC yet (first in-game test pending). Details: INVESTIGATION.md §1.9.
  - **Where an NPC stands** (`loaders/area.js`): `.dyo` x/z × 4 (`OLD_MPU`). The map-window name comes from the `WdMadrigal.wld.cnt` polygons and `propMapComboBoxData.inc`. The on-screen area name comes from the map's `.rgn` titles. Town blocks in `.wld.cnt` have `C_useRealData 0`, so the map window never picks a town. A GM jumps there with `/te <world id> <x> <z>`.
  - **Shop prices** (`loaders/vendor-sim.js`, INVESTIGATION.md §1.12): one `dwCost` per item; the last `AddShopItem` price loaded (Masquerade.prj: character.inc, -etc, -school) is the price in every shop, rule shops included. Players pay `(int)(rate × cost)` in float32, at least 1 (cost "=" or 0 → 1; from 2,147,483,584 the float overflows → 1); they get back cost / 4. An edit on an "auto" row (from `AddVendorItem`) first gives each auto item of the tab its own `AddShopItem` line, same order, with no extra window (`ui/shop-rules.js`); a typed price is also written on the item's other priced lines (`shopOps.otherPriceParts`).
  - **Editing chances:** the UI types percent and keeps the total at 1,000,000 (`exchangeOps.rebalance`); NPC Shops shows each exchange menu of an NPC as a tab with the Exchanges cards.
  - **Moving an NPC / changing its model** (`npcEditOps.placePlan`, NPC Shops "📍 Change position / model" (next to the name)): rewrites the record's facing (byte 4), x/y/z (20/24/28, x and z ÷ 4) and model (`m_dwIndex`, 48) in place, same file size, the `b6abf414` way; one spot at a time, the model optionally on every spot; same map only. Shared form fields: `ui/npc-place.js`. INVESTIGATION.md §1.14.
  - **Editing an existing NPC** (`edit/npcedit-ops.js`, NPC Shops ✎ / + Tab / + Menu): name and tab texts are `character.txt.txt` lines (`f58e56ba`, `ba92f67f`); a shared key (`000049` "n/a" ×6) gets a new key for this NPC/tab unless "everywhere" is asked; + Tab = key line + `AddVendorSlot( n, KEY );` after SetName (`d11123ac`). The shop window shows only named tabs, at their slot's position; slot 0 unnamed with a later slot named crashes the client on a tab click (`C_TAB_FIRST_UNNAMED`). character.inc NPCs only. INVESTIGATION.md §1.11.
  - **Item list categories** (`loaders/item-category.js`): the editor's own groups from dwItemKind1/2/3; pets follow `IsVisPet` (`IK3_PET` + `dwReferStat1 == PET_VIS` = buff pet), `IK3_EGG` = raised. Rarity chips only for Weapons / Armor.
  - **+ Menu** (`ui/menu-chooser.js`): Shop (Trade + first tab), Exchange (the exchange-menu form below), Rules text (a text window; needs the client change `docs/patches/npc-board.diff`, which the user applies and builds: the source repo stays reference-only), and "Other game window…". A rules text is `Client/Client/NpcBoard_<menu id>.inc`, a client-only file the editor creates (`Workspace.boardFile`, `io/save.js`). Colour codes need lowercase hex. INVESTIGATION.md §1.13.
  - **Adding an exchange menu** (`edit/menu-ops.js`, NPC Shops "+ Exchange menu"): `#define MMI_<NAME> <282..349>` (defineNeuz.h), `TID_MMI_<NAME>` = 7000 + id (defineText.h; the popup label), textClient.inc/txt.txt lines (append only: line i = key i), the menu block (Exchange_Script.txt), `AddMenu` (character.inc); Server + Client. Any id without a `case` in `CWndWorld::OnCommand` opens the exchange window; no C++ change. INVESTIGATION.md §1.10.
  - `Exchange_Script.txt`: a bare `CScanner`, so an unknown name becomes -1 silently (`GetDefineNum`). `__NEW_EXCHANGE_V19` is ON (`LodeConfig.h`): CONDITION is checked and taken, REMOVE is ignored, at most 30 SETs per menu. PAY chances are out of 1,000,000. The client sends only the recipe's position, so the Client copy (LF) must match. `SET_SMELT` / `SET_ENCHANT_MOVE` put the loader out of step (see ROADMAP).
    - In game (`exchange-sim.js`): the roll happens before the bag check; the bag check wants at least one EMPTY slot even when the reward would stack, and counts a reward smaller than a full stack as 0 slots, so a recipe giving several rewards can lose some (the server only logs it). Penya means gold only (not Perin). Any item in a trade / private shop or a locked bag slot makes every ingredient count 0. Ingredient quantity -1 takes every one the player has.

## Layout
```
src/order.txt       load/build order (classic scripts sharing globalThis.FRE)
src/core/           bytes, num, xrandom (the server's xRand / xRandom), sourcefile (byte model + round-trip gate; binary kind for .dyo), lexer (CScanner/CScript port),
                    diff (Myers), workspace (data-module registry, apply/applyGroup/undo, newBlocking),
                    client-sync (Client/ copy modes: identical / eol / missing / different)
src/loaders/        defines, strings (*.txt.txt), textclient (TID_ texts), item-tooltip (MakeToolTipText port),
                    specitem, propmover (monster name/level/rank), world (maps, .dyo NPC placement, SetOutput/SetLang),
                    area (where an NPC stands: map window name, area caption, /te), character, vendor-sim (shop contents), donation,
                    donation-tree (client category tree), battlepass, exchange, exchange-sim (pressing OK in the exchange window),
                    newnpc-sim (a new NPC as the game loads it), shop-window (the client's shop tabs), item-category (item list groups), board-text (a rules window's text codes)
src/validate/       help.js (text for every diagnostic code), character.js, newnpc.js (Add New NPC rules), newmenu.js (new menu rules)
src/edit/           text-ops (shared row/statement splices), shop-ops (+ rules, rules -> fixed items), donation-ops, item-ops (Spec_Item chip price, dwCost, dwShopAble), battlepass-ops, exchange-ops,
                    npc-ops (a new NPC: block, IDS lines, .dyo record), menu-ops (new exchange menus / exchanges),
                    npcedit-ops (an existing NPC: name, tabs, menus, where it stands, its model)
src/io/             fsa (File System Access), layout (finds Server/Resource + Client + backups in the ONE picked folder), save (conflict check -> verified backup -> write+verify -> restore on failure;
                    Server files, then the same change in the Client/ copies)
src/ui/             dom, common (FRE.ui registry + helpers), tooltip (item hover), chip-price (shared price input), shop-rules (auto rows edited like the others, players pay / get back), menu-chooser (+ Menu: Shop / Exchange / Rules text, each with ← Back),
                    npc-shops, npc-place (the shared Where / Model fields), new-npc (the "+ New NPC" form), npc-edit (rename / tab / menu / where-model dialogs), menu-form ("+ Exchange menu" / "+ New exchange"), donation, battlepass, exchange, app (shell: modes, item DB, problems, save)
tests/              run-tests.js (gjs core suite), ui-harness.js + run-ui.sh (headless Firefox, fake FS), gjs-env.js
tools/oracle.py     independent Python reference (differential tests)
tools/refresh-fixtures.sh  copies the real files into test-data/fixtures (tests) or test-data (manual)
tools/bp-sim.js, tools/exchange-sim.js, tools/area-sim.js, tools/newnpc-sim.js, tools/menu-sim.js (+ jeff-menus.json), tools/npcedit-sim.js, tools/shop-sim.js, tools/board-sim.js, tools/npcmove-sim.js  replay the in-game behaviour by hand (gjs -m tools/<name>-sim.js)
tools/oracle_sim.py independent Python copies of the simulators (differential tests)
docs/               INVESTIGATION.md, DESIGN.md, ROADMAP.md (what's next), patches/ (C++ changes for the user to apply in FLYFF-V19-SOURCE)
```

**Adding an editor ("module"):**
1. Loader + validator, registered in `MODULES` in `src/core/workspace.js` (required/editable/client files, `parse`, `validate`).
2. Edit ops built on `FRE.textOps`.
3. A UI module in `src/ui/<name>.js` pushed to `FRE.ui.modules` (`renderList`, `renderEditor`, `addTarget`, `locate`).
4. Help text for every new diagnostic code in `validate/help.js` (a test enforces this).
5. Add every new file to `src/order.txt`.

**One task at a time:** the start screen picks one folder (`io/layout.js`) and one task. `new Workspace(files, { only: id })` shows, validates and lets you edit only that module (plus Spec_Item.txt for `editsSpec` tasks); modules in its `uses` are parsed as read-only context. Backups go to `<backups>/<stamp>_<task>/`.

**Diagnostics:** `BLOCK` / `WARN` / `INFO`, each with a stable `key` without offsets. Saving is blocked only by **new** BLOCKs (`Workspace.newBlocking()`); pre-existing problems are shown but don't block.

## UI standards (the user asked for these on 2026-10-07: "make everything standard", "not just silent operations")
- **Nothing is silent.** Every change, Undo, Redo, Save and failure shows a message:
  - Every add / change / remove goes through `ctx.edit` or `ctx.editGroup` (`ui/app.js`). Those show "✓ <what> — not saved yet (n files to save; Ctrl+Z undoes it)", unless the editor already showed its own toast. So give every edit a plain-words label, e.g. `Rename tab 2 of Peach: Event`, not `tab`.
  - Undo / Redo show "↶ Undone: …" / "↷ Redone: …".
  - Errors show a red toast with the reason. Never let an exception end silently: wrap async UI work in try/catch (as `onSave` does).
  - Save always ends in a "Saved" or "Save failed" window.
- **Write permission** after a reload: the browser asks only when the request comes straight from a click. Ask from a button (`writeAccess` in `ui/app.js`); never chain several `requestPermission` calls after an `await`.
- **Forms** use the standard pieces:
  - `FRE.ui.fieldLabel` (red * / "(optional)");
  - `FRE.ui.formFooter` (* note → Checks with the ⛔/⚠ legend → "what players will see / what will be written" preview);
  - live checks while typing;
  - Create / Rename greyed out while a ⛔ problem exists or nothing would change.
- **✎ dialogs say "Edit …"** (user, 2026-10-07: "so I know what I'm doing"): title "Edit name: Lui", "Edit rules text: Guild Rules", button **Apply changes**. "+" dialogs say New / Add / Create.
- **One place per NPC:** what an NPC owns is edited in NPC Shops (filters, tabs), not in a separate task. The Exchanges task was folded into NPC Shops on 2026-10-07 (filter "NPCs with exchanges", ⇄ tabs; `MODULES` entry `hidden: true`, checks via `alsoValidates`).
- **Numbers players see** are 1-based ("tab 1-4"), never the file's 0-based slot. Chances are typed in percent.
- **Lists** you pick from are searchable (`FRE.ui.combo`; `wordStart: true` for category names).

## Build and test (no Node on this machine; gjs and python3 are available)
```
python3 build.py                 # -> dist/flyff-resource-editor.html (commit dist/)
gjs -m tests/run-tests.js        # core suite incl. byte round-trip of all 403 Resource text files (read-only)
tests/run-ui.sh                  # headless Firefox harness -> test-data/ui-*.png (view them); STAGES="end" to limit
python3 tools/oracle.py test-data/Resource
```
- Firefox has no File System Access API, so the real folder/save flow is tested by the user in Brave/Chrome on `test-data/Resource`.
- After changing UI code, syntax-check the bundle with gjs if the harness shows nothing: an inline-script syntax error kills the whole page.

## Git
- Repo-local identity `Kevin <kevinmensah114@gmail.com>`. Commit per finished step after the user's OK; end messages with the Co-Authored-By trailer. Don't push unless asked.
- `test-data/` and `backups/` are git-ignored.

## Status / next
See `docs/ROADMAP.md`.
