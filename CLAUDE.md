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
  - Status of every task's simulator: `docs/SIMULATORS.md`.
- **After saving** (`core/after-save.js`, INVESTIGATION.md §1.17): every file the editor writes is read once, at startup, by the WorldServer and/or the game; nothing reloads them. Save lists per change what is needed: a C++ patch built into Neuz (project Neuz, configuration NoGameguard; npc-board / donation-tree are Neuz-only, upgrade-fees.diff needs the WorldServer AND Neuz), "Run Stop Server.bat, then Start Server.bat" (it restarts the game too), "restart the game", or only "reopen the Donation Shop window" (DonationShopTree.inc) / "click the menu again" (NpcBoard_<id>.inc). The game never reads `.dyo`. Patch state: read from `Source/Source/_Interface/*.cpp` when FLYFF-V19-SOURCE is picked (`io/patch-state.js`, read-only), else a remembered "I built it into Neuz" tickbox. Never write "Restart the WorldServer to apply" again.
- **Commas are for display only** (`FRE.num`). The server tokenizer splits on `,`, so files always get plain digits.

## Key facts about this server (details in docs/INVESTIGATION.md)
- `__VER` is 19, so items load from **`Spec_Item.txt`**. `propItem.txt` is dead. A Spec_Item record is 175 values.
- **All files go through one tokenizer**, `CScanner` + `CScript` (ported in `src/core/lexer.js`). It's a token stream, not columns.
  - `=` means -1 / NULL_ID.
  - `-5` is two tokens.
  - An undefined name in a number slot becomes 0, logged as "Not Found".
  - `"""x"""` is 3 tokens.
- **Defines** come from the 21 headers in `CProject::LoadDefines`. Only `#define NAME <dec|hex>` is accepted; negatives and aliases are ignored, and the first definition wins.
- **NPC shops: one currency per NPC** (`SetVenderType` 0 = Penya, 1 = Red Chip, 2 = Donate Chip, 3 = PVP Token (5035ab0f), 4 = Perin, 5 = Event Token (V19 `0e9cd3e1`, Event Master); `CHARACTER::GetVenderCurrency`, Project.cpp:194). Types 1-5 are chip shops (`IsChipVender`): AddVenderItem2 lines, the price is the item's `dwReferValue1`, the SAME number in every chip shop (an item sold for 150 Event Tokens also costs 150 Red Chips / PVP Tokens wherever a chip shop sells it).
- **`AddShopItem`'s price overwrites the item's price server-wide.**
- **`AddShopItem` is added in every shop type.** In a chip shop it is charged in chips without the "chip cost < 1" check that `AddVenderItem2` gets (`C_FIXED_IN_CHIP`). Chip shops ignore `AddVendorItem` rules.
- **Client copies.** The game client reads a loose file in `Client/` if there is one, otherwise an old copy packed in `data.res` (`b7645c52`). `character-etc.inc` and `character-school.inc` have no loose copy. `Client/Spec_Item.txt` is LF while the Server copy is CRLF; the content is the same. Every proven data commit changes both copies ("Client copy synced").
- **Per-task notes** (Donation Shop, Battle Pass, NPCs, exchanges, drops, boxes, sets, PvP, Mini Events, …): `docs/TASKS.md`.

## Layout
```
src/order.txt   load/build order (classic scripts sharing globalThis.FRE)
src/core/       bytes, lexer, sourcefile (byte model), workspace (MODULES, apply/undo), xrandom, after-save, client-sync
src/loaders/    one loader per file + its *-sim.js simulator
src/validate/   rules per task; help.js = text for every diagnostic code
src/edit/       *-ops.js: splices built on text-ops
src/io/         fsa, layout, save, patch-state, source-read
src/ui/         one module per task + shared form pieces
tests/          run-tests.js (gjs core suite), run-ui.sh (headless UI harness), node-shim/
tools/          oracle.py, oracle_sim.py (Python copies), *-sim.js (replay by hand), refresh-fixtures.sh
docs/           INVESTIGATION.md, SIMULATORS.md (sim status), TASKS.md (per-task notes + full layout), DESIGN.md, ROADMAP.md, COMMANDS.md, patches/, plans/
```

Per-file detail: `docs/TASKS.md` → Full file layout.

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
- **Time limits** use `FRE.dom.durationInput`: a number (decimals allowed) + minutes / hours / days, written as whole minutes; 0 = permanent. A required one starts empty with a **Permanent** button (the user, 2026-10-08).
- **Slow work shows a window:** opening a task uses `FRE.dom.progress` (spinner, phase, count; the clicked card says Loading…); the toast gives the time and the slowest phase (all phases in the console as `[load]`). The UI harness sets `FRE.dom.instant` (it runs in microtasks).
- **Lists** you pick from are searchable (`FRE.ui.combo`; `wordStart: true` for category names).

## Build and test (Ubuntu: gjs, python3, Firefox; Windows PC: Node, Python, Brave)
```
python3 build.py                 # -> dist/flyff-resource-editor.html (commit dist/)
gjs -m tests/run-tests.js        # core suite incl. byte round-trip of all 403 Resource text files (read-only)
tests/run-ui.sh                  # headless Firefox harness -> test-data/ui-*.png (view them); STAGES="end" to limit
python3 tools/oracle.py test-data/Resource
```
- **Cloud container (Linux, no gjs / Firefox, 2026-10-18):** the same Node commands; `python` must be on PATH (the shim calls it: link it to python3), and the UI harness runs in the pre-installed Chromium: `python3 build.py --harness; BRAVE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/ui-shot.mjs <stages>` (ui-shot adds `--no-sandbox` when run as root).
- **Windows PC (2026-10-10):** no gjs and no Firefox. The same suite runs under Node: `node --max-old-space-size=8192 --import ./tests/node-shim/register.mjs tests/run-tests.js` (the shim maps `gi://GLib` / `system` / `print` / `ARGV`; tools too: `node --import ./tests/node-shim/register.mjs tools/sets-sim.js 1`). `tests/run-ui.sh` uses Brave when Firefox is missing, through `tests/ui-shot.mjs` (DevTools: each stage is shot when the harness has finished, and its pass count printed). `python3` is a copy of `python.exe` in the Python312 folder (the Store alias is off). Git Bash runs the `.sh` scripts.
- **Line endings on Windows:** Git for Windows sets `core.autocrlf=true` system-wide, so every LF-stored text file of `FLYFF-V19-SOURCE` is CRLF on disk on the Windows PC, and **the game and the servers there have always read those CRLF files: never change that.** On 2026-10-10 V19 was switched to `autocrlf=false` with its LF files checked out as LF, and the game crashed on entering the world: `Client/propSkillAdd.csv` is read with the CSV `GetNumber( TRUE )` (`Project.cpp:2887`), which needs the CR, so add-skill props went missing ("GetAddSkillProp … 3171", CBuffSkill.Apply). It was put back the same day (system autocrlf, CRLF files). The test copies must still hold git's LF: `tools/refresh-fixtures.sh` ends with `tools/fixture_eol.py`, which turns a copy back into LF when git stores it as LF (nothing in V19 is touched).
- The "C++ lines the reader table cites" check fails while `upgrade-fees.diff` is applied but not committed in V19 (the patch moves those lines); expected until it is committed and the cites move with it.
- Firefox has no File System Access API, so the real folder/save flow is tested by the user in Brave/Chrome on `test-data/Resource`.
- After changing UI code, syntax-check the bundle with gjs if the harness shows nothing: an inline-script syntax error kills the whole page.

## Git
- Repo-local identity `Kevin <kevinmensah114@gmail.com>`. Commit per finished step after the user's OK, **then push to origin main right away** (the user, 2026-10-08: "always commit and push them already in the remote"); end messages with the Co-Authored-By trailer.
- `test-data/` and `backups/` are git-ignored.

## Status / next
See `docs/ROADMAP.md`.
