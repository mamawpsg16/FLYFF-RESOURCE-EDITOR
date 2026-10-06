# Commands

Run every terminal command from the `FLYFF-RESOURCE-EDITOR` folder. None of them writes to `../FLYFF-V19-SOURCE`.

## Use the editor
You only need a browser:
- Open `dist/flyff-resource-editor.html` in Brave, Chrome or Edge (double-click it, or `brave-browser dist/flyff-resource-editor.html`).
- In Brave, enable `brave://flags/#file-system-access-api` once.
- Pick the folder:
  - `FLYFF-V19-SOURCE` for the real files;
  - `FLYFF-RESOURCE-EDITOR/test-data` for the test copy.
- Then pick a task.

## Keyboard shortcuts (in the editor)
These do nothing while the cursor is inside a text box.

| Keys | What it does |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save. Shows the review first, then backs up and writes. |

These work inside a number box:

| Keys | What it does |
|---|---|
| `Enter` | Accept the number |
| `Esc` | Cancel the change |

## Test copy
| Command | What it does |
|---|---|
| `tools/refresh-fixtures.sh test-data` | Resets your test copy (`test-data/Resource`, `test-data/Client`, map files) to the real files. Your test edits there are lost; backups in `test-data/backups` stay. |
| `tools/refresh-fixtures.sh` | Refreshes `test-data/fixtures`, the copy the automated tests read. Run it after the real files change. |

## Build
| Command | What it does |
|---|---|
| `python3 build.py` | Builds `dist/flyff-resource-editor.html` from `src/`. Needed after code changes. The label at the top right shows the version (number of commits, `+` = changes not committed yet) and the build time. |
| `python3 build.py --harness` | Builds the test page `test-data/harness.html` (used by `tests/run-ui.sh`). |

## Tests
| Command | What it does |
|---|---|
| `gjs -m tests/run-tests.js` | Core tests: loaders, edits, byte-exact round trip of every Resource file, Battle Pass server replay. Prints `N passed, M failed`. |
| `tests/run-ui.sh` | Clicks through the real editor in headless Firefox and saves screenshots to `test-data/ui-*.png`. The `end` screenshot shows the result box. |
| `STAGES="start exchange end" tests/run-ui.sh` | The same test, but only those screenshots. Stages: `start loaded shoptype review bpexpired bpseason bpladder bpmonsters exchange exrecipe end`. |
| `python3 tools/oracle.py test-data/fixtures/Resource` | An independent Python reader of the same files (prints JSON). The core tests compare against it. |

## Simulators
| Command | What it does |
|---|---|
| `gjs -m tools/bp-sim.js` | Replays a Battle Pass season change the way the WorldServer does (login, kills, buying the pass) on `test-data/Resource/BattlePass.inc`. Writes nothing. |

The exchange simulator is next on the roadmap (`docs/ROADMAP.md`).

## Git
| Command | What it does |
|---|---|
| `git log --oneline` | The commits. The version number is how many there are. |
| `git status` | What changed since the last commit. |
