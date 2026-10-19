# Refresh and build

Two steps, on either PC:

1. **Refresh** copies the current files from `FLYFF-V19-SOURCE` into `test-data/`. Run it after a `git pull` in FLYFF-V19-SOURCE, or whenever you want a clean copy again. It overwrites your edits in `test-data/`. FLYFF-V19-SOURCE is only read, never changed.
2. **Build** makes `dist/flyff-resource-editor.html` from `src/`. Run it after a `git pull` in FLYFF-RESOURCE-EDITOR.

Then open the editor and choose the `test-data` folder (tagged TEST COPY) to try things out, or `FLYFF-V19-SOURCE` (tagged REAL SERVER FILES) for real edits.

## Linux PC (folder `me`)

Open a terminal:

```sh
cd ~/Desktop/me/FLYFF-RESOURCE-EDITOR
git pull
git -C ../FLYFF-V19-SOURCE pull
tools/refresh-fixtures.sh test-data
python3 build.py
```

Open `dist/flyff-resource-editor.html` in Brave, Chrome or Edge.

## Windows PC (`C:\Users\Mensah\Downloads\FLYFF`)

Use **Git Bash**, not cmd or PowerShell: the refresh is a `.sh` script. Right-click inside the `FLYFF-RESOURCE-EDITOR` folder, choose **Open Git Bash here**, then:

```sh
cd /c/Users/Mensah/Downloads/FLYFF/FLYFF-RESOURCE-EDITOR
git pull
git -C ../FLYFF-V19-SOURCE pull
tools/refresh-fixtures.sh test-data
python3 build.py
```

Open `dist\flyff-resource-editor.html` by double-clicking it in Explorer.

Windows notes:
- **`python3` not found:** `python3` on this PC is a copy of `python.exe` in the Python312 folder. Either make that copy again, or run `python build.py`.
- **Brave:** turn on `brave://flags/#file-system-access-api` once, or the editor can't open folders. Chrome and Edge work without it.
- **Line endings:** on Windows the files of FLYFF-V19-SOURCE are CRLF on disk, and the game needs them that way. Don't change git's `autocrlf` setting. The refresh turns the `test-data` copies back into the line endings git stores, on its own.

## Other commands

| What | Linux | Windows (Git Bash) |
|---|---|---|
| Refresh the copy the automated tests use (`test-data/fixtures`) | `tools/refresh-fixtures.sh` | `tools/refresh-fixtures.sh` |
| Core tests | `gjs -m tests/run-tests.js` | `node --max-old-space-size=8192 --import ./tests/node-shim/register.mjs tests/run-tests.js` |
| UI test (screenshots in `test-data/ui-*.png`) | `tests/run-ui.sh` (Firefox) | `tests/run-ui.sh` (uses Brave) |

Every command and keyboard shortcut: [docs/COMMANDS.md](docs/COMMANDS.md).
