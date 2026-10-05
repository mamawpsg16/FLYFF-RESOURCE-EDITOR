# FLYFF-RESOURCE-EDITOR

A single-file, offline HTML editor (`dist/flyff-resource-editor.html`) for the resource files of the FlyFF v19 source in `../FLYFF-V19-SOURCE`. It runs in Chrome or Edge, or in Brave with `brave://flags/#file-system-access-api` enabled. It uses the File System Access API and has no backend.

The user is a web developer learning C++. When server behaviour matters, explain it in JS/TS terms.

## Hard rules
- **`../FLYFF-V19-SOURCE` is reference-only.** Never modify, build, or commit anything there. Before and after work, check `git -C ../FLYFF-V19-SOURCE status` is clean.
- **The real data folder is `../FLYFF-V19-SOURCE/Server/Resource/`.** There is no top-level `Resource/`. `Client/` holds copies the game client reads.
- **Never write to the real `Server/Resource` without asking first.** Test on `test-data/Resource/` (git-ignored copies; the refresh command is in README).
- **Base the work on what is committed in `../FLYFF-V19-SOURCE`.** Its commits are the user's own changes, and all of them were tested in game, even when the message doesn't say "Verified in game".
  - Before designing a loader, edit or warning, search `git -C ../FLYFF-V19-SOURCE log` (messages and diffs) for that file or system, and follow the way it was done there.
  - Cite the commit hash in code comments and docs. Only the parts a commit message calls "not yet tested" are unproven; say so when relying on them.
  - Examples: chip prices `93a02124` / `fea9840b`, shared Donation price `7bedef15`, loose Client copies `b7645c52`, tooltip `cf6f5502`.
- **The C++ loader is the authority**, not the file's look. Every loader here cites its C++ function and line. Read the C++ before adding or changing a parser. See `docs/INVESTIGATION.md`.
- **Byte-exact saves.**
  - `SourceFile` keeps the original bytes. Edits are splices on the current text, and bytes outside a splice are never rewritten.
  - Byte-oriented files accept ASCII-only inserts. Never normalise line endings, encodings, or whitespace. New lines copy the anchor line's indent and EOL.
  - Many custom files are LF; most legacy files are CRLF.
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
  - `Exchange_Script.txt`: an unknown name becomes -1 silently.

## Layout
```
src/order.txt       load/build order (classic scripts sharing globalThis.FRE)
src/core/           bytes, num, sourcefile (byte model + round-trip gate), lexer (CScanner/CScript port),
                    diff (Myers), workspace (data-module registry, apply/applyGroup/undo, newBlocking),
                    client-sync (Client/ copy modes: identical / eol / missing / different)
src/loaders/        defines, strings (*.txt.txt), textclient (TID_ texts), item-tooltip (MakeToolTipText port),
                    specitem, propmover (monster name/level/rank), character, vendor-sim (shop contents), donation,
                    donation-tree (client category tree), battlepass
src/validate/       help.js (text for every diagnostic code), character.js
src/edit/           text-ops (shared row/statement splices), shop-ops, donation-ops, item-ops (Spec_Item chip price), battlepass-ops
src/io/             fsa (File System Access), save (conflict check -> verified backup -> write+verify -> restore on failure;
                    Server files, then the same change in the Client/ copies)
src/ui/             dom, common (FRE.ui registry + helpers), tooltip (item hover), chip-price (shared price input),
                    npc-shops, donation, battlepass, app (shell: modes, item DB, problems, save)
tests/              run-tests.js (gjs core suite), ui-harness.js + run-ui.sh (headless Firefox, fake FS), gjs-env.js
tools/oracle.py     independent Python reference (differential tests)
docs/               INVESTIGATION.md, DESIGN.md, ROADMAP.md (what's next)
```

**Adding an editor ("module"):**
1. Loader + validator, registered in `MODULES` in `src/core/workspace.js` (required/editable/client files, `parse`, `validate`).
2. Edit ops built on `FRE.textOps`.
3. A UI module in `src/ui/<name>.js` pushed to `FRE.ui.modules` (`renderList`, `renderEditor`, `addTarget`, `locate`).
4. Help text for every new diagnostic code in `validate/help.js` (a test enforces this).
5. Add every new file to `src/order.txt`.

**Diagnostics:** `BLOCK` / `WARN` / `INFO`, each with a stable `key` without offsets. Saving is blocked only by **new** BLOCKs (`Workspace.newBlocking()`); pre-existing problems are shown but don't block.

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
