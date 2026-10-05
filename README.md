# FLYFF-RESOURCE-EDITOR

A single-file, offline editor for the resource files of `FLYFF-V19-SOURCE`. It runs in Chrome or Edge with no server.

**Build 1: NPC Shop Editor** (`character.inc`, `character-etc.inc`, `character-school.inc`).

## Use it
1. Open `dist/flyff-resource-editor.html` in **Chrome or Edge** (double-click it).
2. **Load Folder** → pick `FLYFF-V19-SOURCE/Server/Resource`. While trying it out, pick a copy instead (see *Testing on a copy*).
3. Pick an NPC on the left and a tab in the middle. Then:
   - click **+** on an item on the right to add it;
   - edit a price;
   - move an item to another tab;
   - remove an item.
4. **Save:**
   1. The editor checks your edits.
   2. It shows exactly which lines change.
   3. It copies the current files to the **backup folder** (pick one outside `Server/Resource`, e.g. `FLYFF-RESOURCE-EDITOR/backups/`).
   4. It writes, then reads back to verify.
5. Copy the changed `character*.inc` files to `Client/` as well, and restart the WorldServer.

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
`test-data/Resource/` (git-ignored) holds copies of the files the editor reads. Refresh them with:
```
mkdir -p test-data/Resource && cp -p ../FLYFF-V19-SOURCE/Server/Resource/{Masquerade.prj,character*.inc,character*.txt.txt,Spec_Item.txt,propItem.txt.txt,propMover.txt,propMover.txt.txt,propMoverEx.inc,DonationShop.inc,BattlePass.inc,Exchange_Script.txt,define*.h,ResData.h,WndStyle.h,lang.h,ContinentDef.h} test-data/Resource/
```

## Docs
- [docs/INVESTIGATION.md](docs/INVESTIGATION.md): how the server actually parses each file, and the encoding forensics.
- [docs/DESIGN.md](docs/DESIGN.md): file model, save/backup pipeline, validation rules, architecture.
- [docs/ROADMAP.md](docs/ROADMAP.md): what's done, what's next (shop-type switch, Donation Shop, Battle Pass, Exchanges, drops).

## Roadmap
1. ~~Build 1: NPC shops~~
2. Build 2: monster drops (`propMoverEx.inc`)
3. Build 3: item stats (`Spec_Item.txt`, the file the v19 server actually loads instead of `propItem.txt`)
4. Build 4: monster stats (`propMover.txt`)
