# FLYFF Resource Editor: design (Phases 3 + 4)

Status: **proposal, waiting for approval.** No editor code exists yet.
Facts referenced here come from [INVESTIGATION.md](INVESTIGATION.md). Each section heading there is cited as "INV §x".

## 0. Decisions already made

| # | Decision |
|---|---|
| D1 | The editor works on `Server/Resource` only. The UI warns that the `Client/` mirrors must be synced separately. |
| D2 | Round-trip uses a raw-bytes model: unchanged bytes are copied verbatim, and only edited regions are re-encoded. |
| D3 | `DropItem` probabilities above 2,147,483,647 are kept as written. The UI warns and shows the effective (clamped) chance. |
| D4 | The same `II_` with different `AddShopItem` costs in different shops gives a non-blocking warning that names which price wins. |
| D5 | Build 3 edits `Spec_Item.txt` (the file the v19 server loads), not `propItem.txt`. |

---

## 1. Internal file representation

### 1.1 Core idea: never re-encode what you didn't change
- The original file bytes are **immutable**.
- An edit is recorded as a **splice**: "replace offsets `start..end` with this new text".
- Saving builds the output from the original bytes, with the splices applied.
- Every byte outside a splice is copied verbatim. So unchanged lines are identical **by construction**, not by careful re-encoding.

Web analogy: it's a patch list applied to a buffer. VS Code's text buffer (a "piece table") works the same way.

```js
class SourceFile {
  name          // exact on-disk name, e.g. 'definequest.h'
  handle        // FileSystemFileHandle
  bytes         // Uint8Array: the original, never mutated
  stamp         // { size, lastModified } at load, for conflict detection
  kind          // 'utf16le-bom' | 'bytes'
  displayCodec  // 'euc-kr' | 'utf-8' | 'ascii'  (bytes files, display only)
  text          // the string the lexer reads (see 1.2)
  lines         // [{ start, contentEnd, end, eol }]: offsets into text; eol is '\r\n' | '\n' | '\r' | ''
  splices       // [{ start, end, insert, reason }]: sorted, non-overlapping
  readOnly, readOnlyReasons[]
}
```

### 1.2 Two file kinds

| Kind | Files | How `text` is built | Encode back |
|---|---|---|---|
| `utf16le-bom` | `character*.inc`, all `*.txt.txt`, `propItemEtc.inc`, `propQuest.inc` | Skip `FF FE`, then map each 16-bit code unit to one JS char (`String.fromCharCode` over a `Uint16Array`). **Not** `TextDecoder`: it turns lone surrogates into U+FFFD, which would break round-trip. | Write each code unit back as 2 bytes, little-endian. Lossless for any content. |
| `bytes` | everything else (`Spec_Item.txt`, `propMoverEx.inc`, `propMover.txt`, `define*.h`) | A "binary string": byte value N becomes char code N (0–255), mapped manually. **Not** `TextDecoder('latin1')`: browsers treat that label as windows-1252 and remap 0x80–0x9F. Offsets in `text` equal byte offsets. | `charCodeAt` gives the byte back. |

- The `bytes` mapping is exactly what the C++ server sees, because the server never decodes these files (INV §1.1).
- Human-readable display is a **separate, display-only** decode per line: `TextDecoder(displayCodec, {fatal:false})`. That decoded text is never saved.

### 1.3 Rules for inserted text
- **`bytes` files:** inserted text must be printable ASCII (0x20–0x7E) or tab. Anything else is a blocking validation error.
  - All data the editor writes is already ASCII: define names, numbers, punctuation.
- **`utf16le-bom` files:** any characters are allowed.
  - Non-ASCII is only expected in string-table values (Build 3).
  - It gets a warning: the server converts UTF-16 through the Windows ANSI code page, so characters outside it become `?` (INV §1.1).
- **Line endings:** a new line copies the EOL of the line it's anchored to. CRLF files stay CRLF, and `defineItem.h`'s mixed lines follow their neighbours. Line endings are never normalized.
- **Indentation:** a new statement copies the leading whitespace of the anchor statement.
- **Style:** new statements follow the existing house style of the file, e.g. `AddShopItem( 1, II_X, 1000000 );`.

### 1.4 Load-time gate (decides READ-ONLY)
For every file on load:
1. **Detect the kind from raw bytes.**
   - `FF FE` → `utf16le-bom`.
   - `EF BB BF` or `FE FF` → read-only (the server doesn't support these; none exist today).
   - Otherwise → `bytes`.
2. **UTF-16 length:** an odd byte length → read-only.
3. **Round trip:** serialize with zero splices. The result must be byte-identical to the original. This proves the text↔bytes mapping is lossless for *this* file.
4. **Line index:** the concatenation of all line slices must equal `text`.
5. **Parser confidence:** the server-emulating loader (§3) must understand the parts the editor will edit.
   - An NPC block the server itself can't close → that NPC is read-only.
   - A `Spec_Item.txt` value count other than 175 per row → the whole file is read-only.

Any failure means read-only, plus a red banner with the reason. **Nothing is ever auto-fixed.**
With this model, `Spec_Item.txt` and `defineItem.h` pass step 3, which is consistent with D2.

### 1.5 Structured models on top, always derived from the bytes
Loaders produce records that carry spans pointing into `text`:

```js
ShopEntry { npcKey, file, kind: 'AddShopItem' | 'AddVendorItem' | 'AddVenderItem2',
            slot, itemDefine, itemId, cost /* or null */, stmtSpan, argSpans, line }
```

UI actions become **minimal splices**:

| Action | Splice |
|---|---|
| Change price | Replace only the cost token. If there's no cost yet, insert `, 1000` before `)`. |
| Move to another tab | Replace only the slot token. |
| Add item | Insert one new line after the last shop statement of that tab (or of the NPC). |
| Remove item | If the statement sits alone on its line(s), remove those lines including the EOL. Otherwise remove just the statement span. |

- After each edit, the dirty file's **candidate text** (original + splices) is re-lexed and re-parsed. The UI model is rebuilt from it.
- There's a single source of truth (bytes + splices), so the model and the file can't drift apart.
- Undo/redo is a stack of splice-list snapshots.

---

## 2. Safe save strategy (File System Access API)

### 2.1 Browser constraints that shape the design
- **Browsers:** Chrome/Edge only. Firefox and Safari have no `showDirectoryPicker`.
- **Opened from disk (`file://`):** File System Access is expected to work in Chrome/Edge. This is to be **verified first thing in Build 1** (R1).
- **Permission is per folder handle and per session.**
  - After a page reload you must pick the folder again, or click to re-grant it (`requestPermission` needs a click).
  - Handles can be remembered in IndexedDB to skip the navigation, but the permission click remains.
- **The page can only write inside folders you picked.** So the backup location must be picked too.
- **`createWritable()` is safe against crashes:**
  - Chrome writes to a temporary `<name>.crswap` next to the file and only replaces the original on `close()`.
  - A crash mid-write leaves the original intact, but a stray `.crswap` file may remain.
  - It is **not atomic across several files**.
- **No file locking:** another program, or a `git checkout`, can change a file while the editor is open.

### 2.2 Folders
- **Resource folder.** You pick `Server/Resource` (read-write).
  - The editor refuses the folder unless it contains `Masquerade.prj`, `character.inc` and `Spec_Item.txt`.
  - Files are looked up case-insensitively by iterating the folder (`defineQuest.h` vs `definequest.h`).
- **Backup folder.** You pick it once; recommended: `FLYFF-RESOURCE-EDITOR/backups/` (git-ignored).
  - Not inside `Server/Resource`: that folder is tracked by the source repo, so backups there would show up in its `git status`. We must not edit the source repo's `.gitignore`.
  - **Save stays disabled until a backup folder is set.**

### 2.3 Save pipeline (one Save click)
1. **Validate** the candidate bytes of every dirty file (§3). A *new* blocking error aborts the save; nothing is written.
2. **Review:** a dialog lists every changed line per file (old → new). You confirm.
3. **Conflict check:** re-read each dirty file from disk. It must be byte-identical to what was loaded. If it differs, abort and offer to reload.
4. **Backup:**
   - Create `backups/YYYY-MM-DD_HH-mm-ss/`.
   - Write each file's *current disk bytes* (from step 3) into it.
   - Close, read back, and byte-compare. Any mismatch aborts the save.
5. **Write** each file: `createWritable()` → `write(candidate)` → `close()`.
6. **Verify:** re-read each written file and byte-compare it with the candidate.
7. **Manifest:** write `manifest.json` into the backup folder: time, editor version, files with sizes before/after, and the change list.
8. **Failure in 5–6:**
   - Restore every already-written file from the backup.
   - Verify the restore.
   - Report the exact state of each file.
9. **Success:** the candidate becomes the new baseline (bytes replaced, splices and undo history cleared). The banner reminds you about `Client/` and that the server only reads these files at startup.

Extra safety net: `Server/Resource` text files are tracked in the source repo, so `git diff` there shows exactly what the editor changed. The editor itself never runs Git.

### 2.4 Toolbar "Backup" button
Writes a snapshot of **all** loaded editor files, not just dirty ones, into a new timestamped folder with a manifest.

### 2.5 Restore
- Build 1: manual (copy the files back from the backup folder).
- Later: a "Restore from backup" dialog that reads the manifests.

---

## 3. Validation strategy

### 3.1 Principles
1. **Use the server's rules, not a nice grammar.**
   - A JS port of the `CScanner`/`CScript` tokenizer.
   - Plus a port of each loader's control flow. It reads tokens exactly like the C++ code does, e.g. "skip one token and assume it's a comma".
   - It flags problems wherever the server would:
     - log an error,
     - silently misparse,
     - refuse to start,
     - or hang.
2. **Validate the bytes that will be written:** the candidate text, never the UI model.
3. **Severity comes from what the server would do:**

   | Severity | Meaning |
   |---|---|
   | **BLOCK** | The server won't start or hangs, memory gets corrupted, later data stops loading, or the edit is silently ignored. |
   | **WARN** | The server tolerates it, but it's probably unintended, or it's a known pre-existing quirk. |
   | **INFO** | Informational only. |

4. **"No new BLOCK" rule:**
   - Each diagnostic is keyed by its rule code plus the record it applies to.
   - BLOCKs that already exist in the original are shown but don't prevent unrelated saves.
   - Any BLOCK introduced by your edits prevents saving.
   - Today the target files have no known BLOCKs, only quirks such as the 6 missing-brace NPCs and the 518 overflowing probabilities.

### 3.2 Rule catalogue

**All files**

| Code | Condition | Severity | Why |
|---|---|---|---|
| E_UNDEF | An identifier in a number slot isn't a loaded define. This includes ignored defines like `PK_NPC -1`. | BLOCK | The server logs "Not Found" and uses 0. |
| E_UNTERM_STR / E_UNTERM_CMT | Unterminated `"` or `/*` | BLOCK | It swallows the rest of the line or file. |
| E_NON_ASCII | Inserted non-ASCII text in a `bytes` file | BLOCK | The browser can't encode it as the server expects. |
| E_TOKEN | A number slot holds something that isn't a number, define, `=` or `-n` | BLOCK | `atoi` returns garbage or 0. |

**`character.inc`, `character-etc.inc`, `character-school.inc`** (Build 1)

| Code | Condition | Severity |
|---|---|---|
| C_BRACES | The block doesn't close by the server's brace counting | BLOCK |
| C_NO_OPEN_BRACE | The token after the NPC key isn't `{` (the server swallows it) | WARN (6 existing) |
| C_DUP_NPC | The same key, case-insensitive, appears in any of the 3 files | BLOCK if new, WARN if existing |
| C_SLOT | Tab outside 0–3 | BLOCK (memory corruption) |
| C_ITEM | The item isn't in `Spec_Item.txt` or has version > 19 | BLOCK |
| C_ARGS | Wrong argument count or punctuation | BLOCK |
| C_PRICE_CONFLICT | One `II_` with different costs across NPCs | WARN, names the winner (last in load order) |
| C_PRICE_ZERO | Cost ≤ 0 | WARN |
| C_TAB_FULL | More than 100 fixed items in a tab | WARN (the server drops the overflow) |
| C_CHIP_TYPE | `AddVenderItem2` in an NPC without `SetVenderType(1\|2)` | WARN (the server ignores it) |
| C_CHIP_COST | A chip-shop item with chip cost < 1 | WARN (the server skips it) |
| C_NO_TRADE | Shop entries but no `AddMenu(MMI_TRADE)` | WARN *(assumption, to verify)* |

**`propMoverEx.inc`** (Build 2)

| Code | Condition | Severity |
|---|---|---|
| M_RANGE | `MI_` id outside the mover table | BLOCK (infinite loop at startup) |
| M_UNDEF | Undefined `MI_` | BLOCK (block lands on `MI_DEFAULT`) |
| M_BRACES | Missing `}` | BLOCK (absorbs the next monster) |
| M_DROP_UNDEF | Undefined `II_` in `DropItem` | BLOCK |
| M_DUP | Two blocks for one monster | WARN (drops append) |
| M_PROB_OVERFLOW | Probability > 2,147,483,647 | WARN, shows the effective % (D3) |
| M_PROB_ZERO | Probability ≤ 0 | WARN |

**`Spec_Item.txt` + strings + defines** (Build 3)
- BLOCK:
  - a row with ≠ 175 values;
  - an undefined `II_` (loading stops at that row);
  - a duplicate id;
  - an icon or text-file field that isn't `"""…"""`;
  - a version > 19.
- WARN:
  - a missing `IDS_` key;
  - an id in the AMP clone range 60000+;
  - non-ANSI characters in a name.
- New defines must look like `#define NAME <non-negative decimal>`, with a unique name and value (BLOCK).
- String keys must start with `IDS` and be unique (BLOCK).

**`propMover.txt`** (Build 4)
- BLOCK: a row with ≠ 86 values, an id < 0 or ≥ 14900, or a duplicate id. Any of these stops the server from starting.

### 3.3 Proving the emulator is correct
1. **Golden numbers:** the JS must reproduce the Phase 2 results on the real files:
   - `Spec_Item` 8,067 rows × 175 values;
   - `propMover` 1,114 × 86;
   - 0 undefined references;
   - 6 missing-brace NPCs;
   - 518 overflowing probabilities;
   - 20,473 string keys.
2. **Differential test:** the Phase 2 Python reference tokenizer is kept as `tools/oracle.py`. JS and Python must agree on the fixtures.
3. **Mutation tests** on fixture copies: delete a comma, use an undefined `II_`, use tab 4, remove a `}`, and so on. Each must trigger the expected rule.
4. **Round trip** for every Resource text file (403): load → serialize with no edits → identical bytes.

---

## 4. Architecture of the standalone HTML

### 4.1 Delivery
- **Output:** `dist/flyff-resource-editor.html`. One file with inline CSS and JS, **no CDN, no network**. It works offline and sends nothing anywhere.
- **Source:** small plain-JS files in `src/`, concatenated by `build.py` (Python standard library, ~40 lines).
  - Why a build step: a page opened from disk can't load `<script type="module" src=…>` (Chrome blocks it as cross-origin), so multi-file source must be inlined.
  - `dist/` is committed, so the editor can always just be opened.
- **No framework:** vanilla JS and DOM with tiny render helpers.
  - The hard part is byte-exact data handling, not UI state.
  - It keeps the single file small and dependency-free.
  - The item list (8k rows) is virtualized.

### 4.2 Layout of the source
```
src/
  shell.html            page skeleton (toolbar / left / centre / right panels)
  styles.css            dark theme (CSS variables)
  core/bytes.js         binary string <-> Uint8Array, UTF-16LE codec, EOL scan
  core/sourcefile.js    SourceFile: load gate, line index, splices, serialize
  core/lexer.js         CScanner/CScript port: tokens with offsets + line numbers
  core/resolver.js      define map + string map (first wins, numeric-only defines)
  loaders/defines.js    the 21 headers from LoadDefines
  loaders/strings.js    *.txt.txt
  loaders/specitem.js   Spec_Item.txt -> item DB
  loaders/character.js  character*.inc -> NPCs + shop entries
  loaders/movers.js     propMover.txt, propMoverEx.inc   (Builds 2/4)
  validate/*.js         rule catalogue (section 3.2)
  edit/shop-ops.js      UI action -> splices
  io/fsa.js             pickers, case-insensitive lookup, verified read/write
  io/save.js            save pipeline, backup, manifest, restore-on-failure
  ui/*.js               toolbar, NPC list, shop editor, item DB, diagnostics, diff dialog
tests/test.html         in-browser test runner (golden, mutation, round-trip)
tools/oracle.py         Python reference tokenizer (from Phase 2)
build.py                -> dist/flyff-resource-editor.html
```

### 4.3 Data flow
- **Load Folder:**
  1. Locate the files.
  2. Run the `SourceFile` load gate on each.
  3. Load the defines (21 headers).
  4. Load the strings.
  5. Load `Spec_Item.txt` (item DB).
  6. Load the 3 character files (NPC model).
  7. Record the baseline diagnostics.
- **Edit:** UI action → splices → re-parse the dirty file → re-validate → re-render.
- **Save:** the pipeline in §2.3.

### 4.4 UI for Build 1 (NPC Shop Editor)
```
┌ [Load Folder] [Save] [Backup]   ✓ character.inc ✓ Spec_Item.txt ✓ propItem.txt.txt ✓ defines 21/21   ⚠ 8 ┐
├────────────────┬──────────────────────────────────────────────┬───────────────────────────────┤
│ NPCs [search ] │ MaFl_Lui · "Lui"            character.inc:L… │ Items [search            ]    │
│ ▸ MaFl_Lui     │ [0 Charms] [1 Food] [2 Arrows] [3 —]          │ Category [IK1 ▸ IK2 ▸ IK3 ▾]  │
│   MaFl_Losha   │ Generated (AddVendorItem), read-only:         │ [Normal][Unique][Ultimate]    │
│   MaFl_Waforu  │   IK3_REFRESHER  job −1  rarity 1–5  ×50       │ Name     Type  Lv  ATK  II_ + │
│   …            │ Fixed items (AddShopItem):                    │ Ddukguk  Food   1   –   …   + │
│ [only shops ✓] │   Ddukguk  II_GEN_FOO_…   1,000,000  [✎][✕]   │ …                             │
│                │ ▸ Diagnostics (2 warnings)                    │                               │
└────────────────┴──────────────────────────────────────────────┴───────────────────────────────┘
```

**Item database (right panel)**
- **Columns:**
  - name (from `propItem.txt.txt`);
  - type (the `IK3_` name, prettified);
  - level (`dwLimitLevel1`, the required level);
  - ATK (`dwAbilityMin`–`dwAbilityMax`);
  - the `II_` define.
- **Rarity** comes from the `dwItemGrade` column: Normal (100), Unique (200), Ultimate (300). The file also has 84 Baruna (400) items; see Q3.
- **Category filter:** IK1 → IK2 → IK3, from `defineItemkind.h`.
- **`+` button:** adds an `AddShopItem` to the selected tab. The cost is optional; without it the item's own `dwCost` applies.

**Centre panel**
- **Chip shops** (`SetVenderType`) show `AddVenderItem2` entries with chip prices.
- **Generated `AddVendorItem` rules** are shown read-only in Build 1 (see Q4).

**Banners**
- After saving: "Update `Client/character.inc` too", because the client reads its own copy for shop display and prices.
- Server reminder: "Restart the WorldServer to apply."

---

## 5. Risks and unknowns

| # | Risk | Mitigation |
|---|---|---|
| R1 | File System Access / IndexedDB behaviour when the page is opened from disk in Chrome/Edge | A 30-minute spike at the start of Build 1, before anything else |
| R2 | MSVC `atoi` overflow behaviour (not confirmed in-game) | Warn only (D3) |
| R3 | Simulating which items `AddVendorItem` generates (`GenerateVendorItem`) | Not needed for Build 1: rules are displayed, not simulated |
| R4 | Client desync: the client shows prices from `Client/character.inc` and `Client/Spec_Item.txt` | Banner (D1). Possible optional sync later. |
| R5 | The server reads files only at startup | Banner |
| R6 | A file changes on disk while the editor is open (git checkout, other editor, second tab) | Byte-compare conflict check before every save. No merging. |
| R7 | Multi-file save isn't atomic; a stray `.crswap` can be left behind | Backup first, then restore on failure. Report leftovers. |
| R8 | **This Linux machine has only Firefox (no File System Access) and no Node** | Logic tests run in Firefox via `tests/test.html` plus the Python oracle. The save flow has to be tested by you in Chrome/Edge on fixture copies. |
| R9 | Re-parsing the 4.7 MB `Spec_Item.txt` on every edit (Build 3) | Row-level incremental re-parse, since rows are one per line |
| R10 | The JS emulator drifts from the C++ if the loaders change later | Every loader cites its C++ `file:line`. Golden tests. |
| R11 | Unverified assumptions: shop needs `MMI_TRADE`; `Maxitem` semantics | Marked "to verify" and kept as WARN only |

---

## 6. Development safety
- **Fixtures:** the target files are copied (read-only) from `Server/Resource` into `FLYFF-RESOURCE-EDITOR/test-data/Resource/`. All write tests run there.
- **`.gitignore`** in the editor repo: `test-data/`, `backups/`.
- **Real data:** before the first save against the real `Server/Resource`, I stop and ask you.
- **Source repo:** nothing in `FLYFF-V19-SOURCE` is ever modified.

## 7. Build 1 steps (after approval)
1. Spike for R1, then the skeleton: `build.py`, dark layout, `.gitignore`.
2. `bytes` + `sourcefile`, with the round-trip test over all 403 text files.
3. Lexer, resolver, and the defines/strings loaders. The golden numbers must match.
4. `Spec_Item` loader (read-only) and the item DB panel.
5. Character loader, NPC list and shop view.
6. Shop edit ops and the `character` rule set.
7. Save pipeline and backups, against fixtures.
8. You test in Chrome/Edge on fixtures; then the real folder, with your OK.

## 8. Answers (2026-10-05, "do what you recommend")
1. **Node:** not installed. Tests run under `gjs` (already on the machine) plus a headless-Firefox UI harness with a fake file system.
2. **Source layout:** `src/` + `build.py`.
3. **Baruna:** gets its own fourth rarity chip.
4. **`AddVendorItem` rules:** read-only in Build 1.

## 8a. Original open questions
1. **Node.js** for command-line tests? It's optional and dev-only; without it, tests run in Firefox plus the Python oracle.
2. **Source layout:** `src/` + `build.py` (recommended), or one hand-edited HTML file?
3. **Baruna (84 items):** add a 4th rarity chip, or fold them into "Ultimate"?
4. **Generated `AddVendorItem` rules** read-only in Build 1, with editing later. OK?
