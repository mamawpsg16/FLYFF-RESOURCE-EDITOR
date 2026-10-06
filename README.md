# FLYFF-RESOURCE-EDITOR

A single-file, offline editor for the resource files of `FLYFF-V19-SOURCE`. It runs in Chrome or Edge with no server.

**Tasks:** NPC Shops (`character*.inc`), Donation Shop (`DonationShop.inc`) — both with chip prices in `Spec_Item.txt` —, Battle Pass (`BattlePass.inc`) and Exchanges (`Exchange_Script.txt`). One task is open at a time.

## Use it
1. Open `dist/flyff-resource-editor.html` in **Chrome or Edge** (double-click it).
2. **Choose the source folder** → pick `FLYFF-V19-SOURCE` (tagged REAL SERVER FILES). The editor finds `Server/Resource` and `Client` inside it. While trying it out, pick `FLYFF-RESOURCE-EDITOR/test-data` instead (tagged TEST COPY; see *Testing on a copy*). The folder is remembered: next time it is one "Allow" click.
   Then pick **one task**. Only that task's files are opened, shown and saved. **Change task** (toolbar) goes back; it asks first if there are unsaved changes.
3. NPC Shops: pick an NPC on the left (the dropdown filters Penya / Red Chip / Donate Chip shops) and a tab in the middle. Then:
   - click **+** on an item on the right to add it;
   - edit a price. In chip shops this is the item's chip price (`dwReferValue1` in `Spec_Item.txt`). Every chip shop and the Donation Shop share that price, and the editor names the other places before writing;
   - move an item to another tab;
   - remove an item;
   - switch the shop's currency with the dropdown next to the NPC name. A preview opens first, where you can set each item's new price.
   Hover over an item to see its in-game tooltip, plus what the game leaves out (buff effect and duration, prices).
   **Donation Shop** task: pick a category on the left, then add items with **+**, move them to another category, remove them, or set their Donate Chip price. With the Client folder chosen, the categories follow the client's `DonationShopTree.inc`.
4. **Save:**
   1. The editor checks your edits.
   2. It shows exactly which lines change.
   3. It copies the current files to the **backup folder**, into a new subfolder per save named after the time and the task (e.g. `2026-10-06_08-10-00_exchange/`). With `test-data` that is `test-data/backups/`; with the real files the editor asks once (pick one outside the source folder, e.g. `FLYFF-RESOURCE-EDITOR/backups/`) and remembers it.
   4. It writes, then reads back to verify.
5. **Client/**: the game client reads its own copies. The editor uses the `Client` folder next to the server files automatically. Every save then applies the same change there, keeping each copy's line endings (`Client/Spec_Item.txt` is LF), with the same backup and verify steps. A file with no loose copy in `Client/` (`character-etc.inc`, `character-school.inc`; the client then reads an old copy in `data.res`) is created as a copy of the server file, unless you untick it in the review. Without a Client folder, copy the changed files by hand.
6. Restart the WorldServer.

Safety rules the editor enforces (details in [docs/DESIGN.md](docs/DESIGN.md)):
- **Bytes you didn't edit are never rewritten.** No encoding conversion, no line-ending or whitespace "cleanup".
- **Save is blocked** if your edits introduce something the server would choke on: an undefined `II_`, tab ≥ 4, broken punctuation, an unclosed block, a duplicate NPC, …
- **Problems that were already in the files are shown but don't block saving.**
- **If a file changed on disk since you loaded it, the save is aborted.**
- **If writing fails half-way, the files already written are restored from the backup.**

## Develop
| What | Command |
|---|---|
| Build `dist/` | `python3 build.py` |
| Core tests (lexer, loaders, edits, validation, byte round-trip of every text file in `Server/Resource`) | `gjs -m tests/run-tests.js` |
| UI test in headless Firefox (fake file system; writes screenshots to `test-data/ui-*.png`) | `tests/run-ui.sh` |
| Independent reference counts (Python) | `python3 tools/oracle.py test-data/Resource` |

- Source lives in `src/`. `src/order.txt` lists the files; `build.py` inlines them into one HTML file, because a page opened from disk can't load ES modules.
- `gjs` comes with GNOME (`apt install gjs`). Node is not needed.

### Testing on a copy
`test-data/` (git-ignored) holds copies of the files the editor reads. `tools/refresh-fixtures.sh` copies them from `../FLYFF-V19-SOURCE` (read-only):
```
tools/refresh-fixtures.sh test-data      # your copy for trying things in the browser (Resource, Client, World maps)
tools/refresh-fixtures.sh                # test-data/fixtures: used only by the automated tests
```
Then choose `test-data` as the source folder: it uses `test-data/Resource`, `test-data/Client` and `test-data/backups`. Your edits there never affect the automated tests.

## Docs
- [docs/INVESTIGATION.md](docs/INVESTIGATION.md): how the server actually parses each file, and the encoding forensics.
- [docs/DESIGN.md](docs/DESIGN.md): file model, save/backup pipeline, validation rules, architecture.
- [docs/ROADMAP.md](docs/ROADMAP.md): what's done, what's next.
- [docs/COMMANDS.md](docs/COMMANDS.md): every command and keyboard shortcut.

## Roadmap
1. ~~Build 1: NPC shops~~
2. Build 2: monster drops (`propMoverEx.inc`)
3. Build 3: item stats (`Spec_Item.txt`, the file the v19 server actually loads instead of `propItem.txt`)
4. Build 4: monster stats (`propMover.txt`)
