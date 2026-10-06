# HANDOFF — "Add New NPC" feature for the Resource Editor

**Read this whole file before writing any code.**

> **Corrections found while building it (2026-10-06, see INVESTIGATION.md §1.9):**
> 1. §3.1 / §3.3: the `.dyo` stores **x / 4 and z / 4** (`CObj::Read` multiplies by `OLD_MPU`, Obj.cpp:525). `/position` prints world units, so the app divides x and z by 4; y is written as it is.
> 2. §3.2: insert at the **final `FFFFFFFF`** (typed walk), not after the leading type-5 run: `DuDaDk` and `Wdguildhousemiddle` start with control records.
> 3. §6 P3: "within 1 unit" is 1 file unit = 4 world units.
> Built as "+ New NPC" in the NPC Shops task; rules are the `NN_*` codes (`src/validate/newnpc.js`).


## How this works (read first)

**Nobody edits the FlyFF V19 files by hand.** Not the user, and not you (Claude).

- **Your job:** build the feature *inside the web app* (`FLYFF-RESOURCE-EDITOR`, a single HTML file).
- **The user's job:** open the web app in Chrome or Edge, fill in a form, and click Save.
- **The web app's job:** read the V19 files, check everything (§6), back up, and write the changes itself.

```
User fills the form in the web app
      │
      ▼
Web app validates (§6)  ──any ERROR──►  nothing is written, user sees what to fix
      │ all OK
      ▼
Web app shows exactly what will change → user clicks Confirm
      │
      ▼
Web app backs up → writes the 6 files → reads them back → validates again (§7)
      │
      ▼
User restarts the servers and checks in game (§8)
```

This document describes what the web app must do. The text templates (§5) and byte layouts (§3) are **specifications for the web app's code**, not instructions for anyone to follow manually. If you ever catch yourself about to edit `character.inc`, `character.txt.txt` or a `.dyo` in the V19 folder with a text editor, script or tool: stop. That change belongs in the web app.

**Goal:** in the web app, the user can:

1. create a brand-new NPC,
2. place it on a map at a chosen position,
3. tick which right-click menus it has (Trade, Bank, Guild Bank, …),
4. if it has Trade: give it shop tabs (up to 4) and put items in each tab,

and the web app guarantees that the files it writes will load correctly in **this** server (FLYFF-V19-SOURCE).

Everything below was checked against the real C++ loaders and the real files in this repo, not copied from forum posts. File/line references are given so you can re-check anything.

---

## 0. Ground rules (follow every time)

1. **All changes to V19 files happen through the web app's Save button.** You never hand-edit, script-edit or tool-edit V19 resource files, not even "just to test".
2. **Never modify anything in `FLYFF-V19-SOURCE/Source/`.** The C++ is read-only reference.
3. **While developing, the web app only saves into a *copy* of the V19 folder** (the user copies `FLYFF-V19-SOURCE` to e.g. `FLYFF-V19-TEST`). The first save to the real folder happens only after the user says yes, and only after the self-tests in §6.5 pass.
4. **Before any save to the real folder, `git status` in `FLYFF-V19-SOURCE` must be clean** (ask the user to run it, or run it yourself if you have access). If it isn't clean, stop and report it. It was clean at commit `ca77a931` when this was written. Because every change is then one git diff, the user can review it or undo it with `git checkout`.
5. **The C++ parser is the authority.** If this file and the C++ ever disagree, the C++ wins. Tell the user about it instead of guessing.
6. **Unchanged bytes stay unchanged.** The web app must never re-encode, re-indent, trim, or change line endings of lines it didn't touch. It only *inserts* new text/records at the documented places.
7. **Validate first, then back up, then write, then re-read and re-validate.** See §7.
8. Update `FLYFF-SOURCES-EDIT-GUIDES/SOURCES DOCUMENTATION/FLYFF TODOS.txt` as the repo `CLAUDE.md` requires.

---

## 1. The real folder layout (important — there is no `Resource/` at the top)

There is **no** `FLYFF-V19-SOURCE/Resource/` folder. The game reads two separate trees:

| Who reads it | Folder |
|---|---|
| World server (and other servers) | `FLYFF-V19-SOURCE/Server/Resource/` |
| Game client | `FLYFF-V19-SOURCE/Client/` |

`Source/Resource/` only holds copies of `define*.h` headers for compiling. The editor never writes there.

**So the folder the user picks with `showDirectoryPicker()` must be the `FLYFF-V19-SOURCE` root**, because an NPC change must be written to **both** trees.

### Files this feature writes (each one in both copies)

| File | Server copy | Client copy | Format | Copies identical today? |
|---|---|---|---|---|
| NPC definitions | `Server/Resource/character.inc` | `Client/character.inc` | UTF-16LE **with BOM** (`FF FE`), CRLF | yes (byte-identical) |
| NPC text (name, tab names) | `Server/Resource/character.txt.txt` | `Client/character.txt.txt` | UTF-16LE with BOM, CRLF | yes |
| Map placement | `Server/Resource/World/<Map>/<Map>.dyo` | `Client/World/<Map>/<Map>.dyo` | binary | yes, all 48 maps |

**Rule:** when the editor loads, compare each Server/Client pair byte-for-byte. If a pair differs, show that file as **read-only** with a warning, because the editor can't know which copy is right.

### Files this feature only reads (lookup data, never written)

| Purpose | File (use the `Server/Resource/` copy) | Format |
|---|---|---|
| Menu IDs `MMI_*` | `defineNeuz.h` | UTF-8 text |
| NPC model IDs `MI_*` | `defineObj.h` | ANSI (CP949) text |
| Item IDs `II_*` | `defineItem.h` | ANSI, **mixed** UTF-8/legacy comments, mixed CRLF/LF |
| Item kinds `IK3_*` | `defineItemkind.h` | ANSI |
| Item stats (kind, level, rarity, price, shop flag) | **`Spec_Item.txt`** — NOT `propItem.txt` (see §2.4) | ANSI |
| Item display names | `propItem.txt.txt` | UTF-16LE with BOM |
| Model names | `propMover.txt` + `propMover.txt.txt` | ANSI / UTF-16LE |
| Other NPC files (for duplicate-key checks) | `character-etc.inc`, `character-school.inc` | UTF-16LE with BOM |

Encoding and line-ending details for every text file in `Server/Resource` are in [`resource-forensics.csv`](resource-forensics.csv).

---

## 2. How the server actually reads these files (web-dev summary)

### 2.1 The tokenizer used for all of them (`_Common/scanner.cpp`, `_Common/Script.cpp`)

Think of it as a very simple lexer that turns the file into a stream of tokens, **not** a line-based or JSON-like parser:

- **Encoding:** the reader loads raw bytes. If the file starts with `FF FE`, it converts UTF-16LE to the Windows "ANSI" code page. The world server uses code page `0`, meaning the Windows machine's own code page (`WORLDSERVER/WorldServer.rc`, `IDS_CODEPAGE "0"`); the client uses 1252. Any other file is used as raw bytes. A UTF-8 BOM would *not* be stripped: it becomes part of the first token. UTF-16BE is not supported.
  → **Rule:** text the editor writes (NPC names, tab names) must only use characters that exist in Windows-1252. Block anything else (Korean, emoji, …), otherwise it shows as `?` in game.
- **Whitespace:** any byte from 1 to 32 (space, tab, CR, LF). They are all the same; blank lines don't matter.
- **Comments:** `// …` to end of line and `/* … */`.
- **Strings:** `"…"`, ending at the next `"` **or at a CR** (no escapes, no multi-line strings).
- **Names (identifiers):** if a name is an `IDS_*` key from a `.txt.txt` file, it is replaced by that text. Otherwise, if it is a `#define` name, it is replaced by the number. Otherwise, when a number was expected, the server logs `"<name> Not Found."` to `Server/error_YYYYMMDD.txt` and uses **0**.
  (In JS terms: `value = strings[tok] ?? defines[tok] ?? (logError(), 0)`.)
- **`#define` tables** (`CProject::LoadDefines`, `_Common/ProjectCmn.cpp`): every `define*.h` goes into one global map. **The first definition wins**; later duplicates are silently ignored. Only plain decimal or `0x` hex values are stored. `defineObj.h` has 65 `MI_*` names defined twice with different values, so a generic "last one wins" parser would give the **wrong** ID. Use first-wins.
- **`.txt.txt` string tables** (`CScript::LoadString`): each line is `IDS_KEY<whitespace>text up to CR`, with whitespace trimmed both ends. All `.txt.txt` files share **one** global map. A duplicate key → error log, first wins. A missing key → the raw `IDS_…` text is shown in game, with no error.

### 2.2 `character.inc` (`CProject::LoadCharacter`, `_Common/Project.cpp:3257`)

Loaded from `Masquerade.prj` in this order: `character.inc`, `character-etc.inc`, `character-school.inc`.

```
MaFl_Juria                       <- NPC key (one token)
{
	setting                      <- just a word the loader ignores
	{
		AddMenu( MMI_DIALOG );
		AddMenu( MMI_BANKING );
		AddMenu( MMI_TRADE );
		AddVendorItem( 0, IK3_SCROLL, -1, 150, 150, 1 );
		m_nStructure= SRT_PUBLICOFFICE;
		SetImage( IDS_CHARACTER_INC_000056 );
		m_szDialog= "MaFl_Juria.txt";
	}
	SetName( IDS_CHARACTER_INC_000057 );
	AddVendorSlot( 0, IDS_CHARACTER_INC_000702 );
}
```

How the loader behaves (and what can go wrong):

- It counts `{` and `}` to find where the block ends. **A missing or extra brace swallows or breaks every NPC after it.**
- The key is stored **lower-cased**, so keys are case-insensitive. A duplicate key (in any of the 3 files) **silently replaces** the earlier NPC; the check only exists in debug builds.
- Command names are **case-sensitive** (`AddMenu` works, `addmenu` doesn't). **An unknown or misspelled command is silently ignored.** That is the main reason to generate this text from a template instead of letting users type it.
- The key itself goes through the tokenizer, so **a key that matches a `#define` name or an `IDS_*` key would be replaced by a number or text.** Keys must not collide with either.

Commands this feature uses:

| Command | Arguments | What the server does |
|---|---|---|
| `AddMenu( MMI_X );` | menu id | turns on menu `MMI_X` (array size `MAX_MOVER_MENU` = 350, no bounds check). **An unknown `MMI_` name becomes 0 = `MMI_DIALOG`, silently.** |
| `SetName( IDS_… );` | text id | NPC display name. An empty text logs an error. |
| `SetImage( IDS_… );` | text id | Portrait image filename (`.tga`) shown in dialogs. Reuse an existing NPC's image ID. |
| `m_nStructure= SRT_X;` | building type | Optional. Existing NPCs use `SRT_*` from `defineNeuz.h` (e.g. `SRT_PUBLICOFFICE` = 9, `SRT_WEAPON` = 4). |
| `AddVendorSlot( tab, IDS_… );` | tab 0-3, text id | Shop **tab name**. |
| `AddVendorItem( tab, IK3_X, job, minRarity, maxRarity, n );` | see below | **Auto-fill** a tab with every item of one kind in a rarity range. |
| `AddShopItem( tab, II_X );` or `AddShopItem( tab, II_X, price );` | tab, item id, optional price | **Exact item** — custom to this source (`__ADDSHOPITEM`). |

### 2.3 How shop tabs are filled (`CMover::ProcessRegenItem`, `_Common/Mover.cpp:1630`; `GenerateVendorItem`, `Mover.cpp:5414`)

- **4 tabs maximum: 0, 1, 2, 3** (`MAX_VENDOR_INVENTORY_TAB`). The loader does **not** check the tab number, so tab ≥ 4 writes outside the array (memory corruption). The editor must block it.
- **100 items per tab maximum** (`MAX_VENDOR_INVENTORY`). Anything past 100 is silently dropped.
- For each tab, the server first adds all `AddVendorItem` matches, sorted by item kind then rarity, and then appends the `AddShopItem` items in file order.
- `AddVendorItem(tab, IK3, job, min, max, n)` picks every item in `Spec_Item.txt` where kind3 = `IK3`, rarity (`dwItemRare`) is between `min` and `max`, the shop flag (`dwShopAble`) isn't `-1`, and job matches (`-1` = any job). The last number `n` is **not used** by the server; existing NPCs use 1 or 100.
- `AddShopItem(tab, II_X)` adds that exact item, **ignoring** its shop flag.
- ⚠️ **`AddShopItem(tab, II_X, price)` changes the item's price globally**, not just in this shop. It overwrites the item's `dwCost` (`Project.cpp`, `AddShopItem` branch), which affects every shop that sells it (and anything else that reads `dwCost`). The last NPC loaded wins. The editor must:
  - leave the price out by default;
  - if the user sets one, warn: *"This changes the price of <item> everywhere."*;
  - block saving if a different NPC already sets a **different** price for the same item (179 `AddShopItem` lines exist today; check them all).
- Chip shops (`SetVenderType(1|2)` + `AddVendorItem2`) are **out of scope** for this feature.

### 2.4 Items: `Spec_Item.txt`, not `propItem.txt`

`CProject::OpenProject` (`_Common/Project.cpp:787`) loads **`Spec_Item.txt`** because `__VER` is 19 (`WORLDSERVER/VersionCommon.h:9`, with `__MAINSERVER` defined; the client is the same). **`propItem.txt` is not loaded at all in this build.** The item picker must read `Spec_Item.txt`.

The parts of a `Spec_Item.txt` row the item picker needs (0-based token positions; one row = 175 tokens, verified on all 8,067 rows):

| Token | Field | Notes |
|---|---|---|
| 0 | row version | Rows with version > 19 are skipped by the server; hide them in the picker |
| 1 | `II_*` item id | |
| 2 | `IDS_PROPITEM_TXT_*` name | look up in `propItem.txt.txt` |
| 5 / 6 / 7 | `IK1_*` / `IK2_*` / `IK3_*` | kind (category filter) |
| 8 | `dwItemJob` | |
| 12 | `dwCost` | sometimes written quoted, e.g. `"500"` — still a number |
| 23 | `dwItemLV` | level |
| 24 | `dwItemRare` | rarity used by `AddVendorItem` |
| 25 | `dwShopAble` | `=` (meaning -1) → excluded from `AddVendorItem` auto-fill |

Watch out: `=` on its own means `-1` (`0xFFFFFFFF`). The icon column is written `"""file.dds"""`, which is **3 tokens**. Because of that, tab-column numbers and token numbers differ after column 132. Re-check these positions against `CProject::LoadPropItem` (`_Common/ProjectCmn.cpp:573`) before relying on any other column.

---

## 3. Map placement: the `.dyo` file (binary)

### 3.1 How the server reads it

`CWorld::LoadObject` (`_Common/WorldFile.cpp:297`) opens `World/<Map>/<Map>.dyo` and calls `ReadObj()` (`_Common/CreateObj.cpp:761`) in a loop until it gets nothing back. **There is no file header and no record count**: it's just records back to back, each starting with a 4-byte object type.

An NPC record is object type `5` (`OT_MOVER`) and is **exactly 200 bytes**, read by `CObj::Read` (`_Common/Obj.cpp:474`) followed by `CMover::Read` (`_Common/Mover.cpp:3365`). All numbers are **little-endian**; use `DataView` with `littleEndian = true`.

| Offset | Size | Type | Field | Value for a new NPC |
|---|---|---|---|---|
| 0 | 4 | uint32 | object type | `5` |
| 4 | 4 | float32 | facing angle in degrees | user input, 0–360 |
| 8 | 12 | 3× float32 | axis (unused) | `0, 0, 0` |
| 20 | 4 | float32 | X | user input |
| 24 | 4 | float32 | **Y = height** | user input (ground height, see §3.3) |
| 28 | 4 | float32 | Z | user input |
| 32 | 12 | 3× float32 | scale X/Y/Z | `1, 1, 1` |
| 44 | 4 | uint32 | type (again) | `5` |
| 48 | 4 | uint32 | **model id** (`MI_*` number) | from the model picker |
| 52 | 4 | uint32 | motion | `0xFFFFFFFF` |
| 56 | 4 | uint32 | AI interface | `0` |
| 60 | 4 | uint32 | AI 2 | `2` |
| 64 | 64 | char[64] | name | all zero (unused for NPCs) |
| 128 | 32 | char[32] | dialog file | all zero |
| 160 | 32 | char[32] | **character key** | ASCII key + zero padding (max 31 chars) |
| 192 | 4 | uint32 | belligerence | `1` |
| 196 | 4 | uint32 | extra flag | `0` |

Verified by decoding Juria's real record in `WdMadrigal.dyo` (Server and Client copies give the same bytes): angle 182.38, pos (1739.61, 100.0, 802.95), scale 1, model 212 (`MI_MAFL_JURIA`), motion `0xFFFFFFFF`, AI 0 / 2, key `MaFl_Juria`, belligerence 1. **Best practice:** copy an existing NPC record from the same map byte-for-byte, then overwrite only angle, X/Y/Z, model id and key.

### 3.2 Where to insert the new record

In every map file, all NPC records come first, one after another, from offset 0. After them comes one of:

- an `FF FF FF FF` end marker (41 maps), or
- a control record, type `2` (5 maps, e.g. `WdMadrigal.dyo`: 364 NPC records, then one control record), or
- something unrecognised (2 maps: **`WdGuildWar1To1`** and **`WdVolcaneYellow`**).

**Rule:** walk forward from offset 0 in 200-byte steps while the uint32 at the current offset is `5`. The point where the walk stops is the **insert point**. Insert the 200-byte record there, shifting the rest of the file down unchanged. Don't append at the very end: anything after an `FF FF FF FF` marker is never read.

**Block** NPC placement on the two unrecognised maps (and on any map where the walk stops at a type other than `2` or `FFFFFFFF`) until someone works out their layout.

Do the identical insert in **both** `Server/Resource/World/<Map>/<Map>.dyo` and `Client/World/<Map>/<Map>.dyo`.

### 3.3 Getting coordinates

Any player can type **`/position`** (or `/pos`) in game chat (`_Interface/FuncTextCmd.cpp:5682`). It prints the character's current x, y, z. The user should stand on the exact spot and copy all three numbers. **Y must be the real ground height** (around 100 in Flaris/Saint Morning, around 59 in Darkon), or the NPC floats or is buried. Angle is in degrees; copy a nearby NPC's angle if unsure.

### 3.4 Map name list

Map folders are `Server/Resource/World/<Map>/` (48 of them). The `.dyo` file name inside the folder may differ in letter case from the folder (e.g. `Wdguildhousemiddle.dyo`), so find it case-insensitively.

---

## 4. What the "Add NPC" form collects

| Field | Rules |
|---|---|
| **Key** (internal name) | `^[A-Za-z_][A-Za-z0-9_]{0,30}$` (max 31 chars). Unique, case-insensitive, across `character.inc`, `character-etc.inc` and `character-school.inc`. Not equal to any `#define` name or `IDS_*` key. Suggest the existing style: `<Continent><Town>_<Name>`, e.g. `MaFl_Lumi`. |
| **Display name** | 1–63 chars, Windows-1252 only, no `"`, no CR/LF. |
| **Model** | Dropdown of `MI_*` models already used by at least one placed NPC (169 distinct models today), showing the `propMover.txt.txt` name. Store the numeric value from `defineObj.h`, first definition wins. |
| **Portrait** | Optional: pick an existing NPC to copy its `SetImage( IDS_… )` from. |
| **Map** | One of the allowed maps (§3.2). |
| **X / Y / Z / angle** | Finite numbers. Show a hint to use `/position`. |
| **Menus** | Checkboxes. **Default list:** menus already used by at least one existing NPC (189 today; most common: `MMI_DIALOG`, `MMI_TRADE`, `MMI_BANKING`, `MMI_GUILDBANKING`). Hide the others behind an "advanced" toggle with a warning. |
| **Shop tabs** (only if `MMI_TRADE` is ticked) | 1–4 tabs. Each tab has a name (same rules as the display name) and items. |
| **Tab items** | Either exact items (`AddShopItem`, chosen from the item database panel with the + button) or an auto-fill rule (`AddVendorItem`: kind3 + job + rarity min/max). Optional price per exact item, with the global-price warning. |

**About `MMI_DIALOG`:** NPC conversations are C++ in `WorldDialog.dll` (`Source/Source/WORLDDIALOG/`). The editor can't create them. Default this checkbox to **off** and explain that "Dialog" needs a C++ script. If the user still ticks it, show a warning; don't write an `m_szDialog=` line.

---

## 5. Exact text the web app writes

(These are what the web app's code generates and writes. Don't type them into the V19 files yourself.)

### 5.1 New IDs for `character.txt.txt`

Find the highest `IDS_CHARACTER_INC_NNNNNN` number used in `character.inc`, `character-etc.inc`, `character-school.inc` **and** `character.txt.txt` (today it's `001188`). New IDs continue from there with the same 6-digit zero padding. Also check that each new key isn't already in **any** `.txt.txt` file (they share one global map).

Append one line per new ID at the **end** of both `character.txt.txt` copies:

```
IDS_CHARACTER_INC_001189<TAB>Lumi
IDS_CHARACTER_INC_001190<TAB>General Goods
```

Format: key, one TAB, text, then CRLF. The whole file is UTF-16LE: encode the new lines as UTF-16LE yourself. `TextEncoder` only does UTF-8, so write the code units with a `DataView`/`Uint16Array`. If the file currently doesn't end with CRLF, add a CRLF before your first new line. Leave every existing byte alone (including the BOM).

### 5.2 New block for `character.inc`

Append at the **end** of both `character.inc` copies, preceded by a blank line, using **TAB** indentation and CRLF exactly like the existing blocks:

```
MaFl_Lumi
{
	setting
	{
		AddMenu( MMI_TRADE );
		AddMenu( MMI_BANKING );
		AddShopItem( 0, II_SYS_SYS_SCR_BLESSEDNESS );
		AddVendorItem( 1, IK3_SCROLL, -1, 1, 150, 100 );
		m_nStructure= SRT_GENERAL;
		SetImage
		(
		IDS_CHARACTER_INC_000056
		);
	}
	SetName
	(
	IDS_CHARACTER_INC_001189
	);
	AddVendorSlot( 0, IDS_CHARACTER_INC_001190 );
	AddVendorSlot( 1, IDS_CHARACTER_INC_001191 );
}
```

(The item names here are examples. Always use ids that exist in `defineItem.h` and `Spec_Item.txt`.)

Encode as UTF-16LE, append only, and don't touch the BOM or any existing line.

### 5.3 New record for the `.dyo`

200 bytes as in §3.1, inserted at the insert point from §3.2, in both copies.

---

## 6. Validation rules (the web app runs all of them before writing anything)

These checks are code inside the web app. They run automatically when the user clicks Save (and live while they fill the form). The user never has to check anything by hand.

**ERROR = the Save button is disabled and the message says what to fix. WARN = saving is allowed, but the warning is shown on the confirm screen.**

Every message must name the field and say how to fix it, e.g. *"Key `MaFl_Juria` already exists in character.inc — choose another name."*, not just "invalid".

### Loading / file safety

| # | Rule | Level |
|---|---|---|
| L1 | Every file that will be written exists in **both** Server and Client trees, and each pair is byte-identical. | ERROR (mark read-only) |
| L2 | `character*.inc` and `character.txt.txt` start with `FF FE` and decode as valid UTF-16LE. Decoding then re-encoding gives the exact original bytes. | ERROR |
| L3 | The `.dyo` NPC walk (§3.2) ends at `FFFFFFFF`, type `2`, or EOF; every key in the walked records is ASCII and zero-padded. | ERROR for that map |
| L4 | `git status` in `FLYFF-V19-SOURCE` is clean before the first write of the session. | ERROR (ask the user) |

### The new NPC

| # | Rule | Why (code) | Level |
|---|---|---|---|
| N1 | Key matches `^[A-Za-z_][A-Za-z0-9_]{0,30}$` | 32-byte key field in `.dyo` (`Mover.h:672`) | ERROR |
| N2 | Key not used by any NPC in the 3 `character*.inc` files (case-insensitive) | duplicates silently replace (`LoadCharacter`) | ERROR |
| N3 | Key isn't a `#define` name or `IDS_*` key | tokenizer would replace it | ERROR |
| N4 | Display name and tab names: 1–63 chars, Windows-1252 only, no `"`, no CR/LF | UTF-16 → code page conversion; `.txt.txt` value ends at CR | ERROR |
| N5 | New `IDS_CHARACTER_INC_*` keys don't exist in any `.txt.txt` file | one global string map, first wins | ERROR |
| N6 | Every `MMI_*` used exists in `Server/Resource/defineNeuz.h` **and** `Client/defineNeuz.h` with the same value, and is < 350 | unknown → silently becomes `MMI_DIALOG`; array size 350 | ERROR |
| N7 | `MMI_DIALOG` ticked | needs C++ dialog script | WARN |
| N8 | A menu not used by any existing NPC | untested combination | WARN |
| N9 | Model id exists in `defineObj.h` (first-wins value) and has a row in `propMover.txt` | `CMover::SetIndex` needs the mover row | ERROR |

### Shop

| # | Rule | Why | Level |
|---|---|---|---|
| S1 | Shop rows only if `MMI_TRADE` is ticked; if `MMI_TRADE` is ticked, at least one tab with at least one item | otherwise the menu opens an empty shop | ERROR |
| S2 | Tab numbers 0–3 only, each used tab has exactly one `AddVendorSlot` | no bounds check → memory corruption | ERROR |
| S3 | Every `II_*` exists in `defineItem.h` **and** has a row in `Spec_Item.txt` with version ≤ 19 | unknown → 0; item skipped | ERROR |
| S4 | Every `IK3_*` exists in `defineItemkind.h`; `min ≤ max`; both ≥ 0 | `GenerateVendorItem` asserts ≥ 0 | ERROR |
| S5 | An `AddVendorItem` rule matches 0 items (simulate it using §2.3 on `Spec_Item.txt`) | server logs `VENDORITEM//…` and adds nothing | WARN |
| S6 | Simulated tab size > 100 | extra items silently dropped | WARN, list what gets cut |
| S7 | Same item twice in one tab | shows twice | WARN |
| S8 | `AddShopItem` with a price | changes the price everywhere | WARN |
| S9 | That item already has a **different** price set by another NPC's `AddShopItem` | last loaded wins, unpredictable | ERROR |
| S10 | Price is an integer 1 … 2,147,483,647 | read with `atoi` into a signed int | ERROR |

### Placement

| # | Rule | Level |
|---|---|---|
| P1 | Map is not `WdGuildWar1To1` or `WdVolcaneYellow` and passes L3 | ERROR |
| P2 | X, Y, Z, angle are finite numbers; angle 0 ≤ a < 360 | ERROR |
| P3 | Another NPC on the same map is within 1 unit (X/Z) | WARN (overlap) |
| P4 | Y differs by more than 30 from the nearest existing NPC on that map | WARN (probably floating or buried; re-check with `/position`) |

### After building the new file contents (self-check, before writing)

| # | Rule | Level |
|---|---|---|
| V1 | Re-parse the **new** `character.inc` text with the same tokenizer rules (§2.1): braces balance, the new key is found exactly once, and every command in the new block is in the known-commands table (§2.2). | ERROR |
| V2 | Byte-diff old vs new: only the expected appended/inserted bytes differ. For `.dyo`: new length = old + 200, the prefix up to the insert point is identical, and the suffix after it is identical. | ERROR |
| V3 | Server and Client outputs are byte-identical to each other. | ERROR |

Rules that compare against "existing NPCs" (N2, S9, P3 …) only judge the **new** NPC against the existing data. Existing data has old quirks (for example, the same item already given different prices by two existing NPCs). Show those in an "existing issues" list, but they must never block the user's new NPC.

### 6.5 Proving the validation itself is correct (self-tests)

A validator with a bug is worse than none, because it says "OK" when it isn't. So before the web app is trusted, build a **"Run self-tests"** button into it (a developer panel is fine). It runs these checks **in memory only, without writing anything**, against the loaded folder. **All of them must pass before the first real save**, and again after any change to the validation or save code.

1. **The current game data passes.** Load the real, unmodified files. Expected:
   - every `character*.inc` block parses;
   - every map's NPC walk (§3.2) finishes, except the 2 blocked maps;
   - `WdMadrigal.dyo` has exactly 364 NPC records, and Juria's record decodes to the values in §3.1;
   - `Spec_Item.txt` gives 8,067 rows of 175 tokens;
   - the loader checks (L1–L3) report **zero errors**.

   If the validator flags data the live server loads fine, the validator is wrong.
2. **Round trip.** For every file the feature can write: decode → encode → bytes identical to the original.
3. **Every rule can fire, and doesn't fire by mistake.** Keep a table of test cases in the code. Each rule in §6 needs at least one input that must trigger it and one valid input that must not. For example:

   | Test input | Expected result |
   |---|---|
   | key `MaFl_Juria` | N2 error |
   | key `mafl_juria` (other case) | N2 error |
   | key `II_SYS_SYS_SCR_BLESSEDNESS` | N3 error |
   | key 32 characters long | N1 error |
   | name containing `가` | N4 error |
   | `AddMenu( MMI_NOT_REAL )` | N6 error |
   | shop tab 4 | S2 error |
   | item `II_NOT_REAL` | S3 error |
   | map `WdVolcaneYellow` | P1 error |
   | Y = `NaN` | P2 error |
   | the full example from §5 on map `WdMadrigal` | **no errors** |

4. **Golden output.** Build the §5 example NPC in memory, then check:
   - the new `.dyo` is exactly 200 bytes longer;
   - the bytes before the insert point and after the inserted record are unchanged;
   - decoding the new record gives back the form values;
   - the new `character.inc` / `character.txt.txt` endings equal the expected text from §5, encoded as UTF-16LE + CRLF.
5. **Independent re-read.** Run the in-memory output through the *loader* again (not the generator). The new NPC must show up in that map's NPC list with the right name, menus, tabs and items. Existing NPC counts must go up by exactly 1.

The self-test results (pass/fail per test) are shown on screen. The final proof is still the in-game test (§8), done first on the test copy.

---

## 7. Saving — what the web app does when the user clicks Save (File System Access API)

1. Run all validations (§6). If there's any ERROR, stop.
2. Show a **summary of changes**: the new `character.inc` block, the new `character.txt.txt` lines, the map + coordinates. The user clicks **Confirm**.
3. **Backup first.** Copy the 6 original files (3 files × Server/Client) into a backup folder **outside** `FLYFF-V19-SOURCE` so it doesn't make the git tree dirty. Ask the user once to pick it with `showDirectoryPicker()`, e.g. `FLYFF-RESOURCE-EDITOR/backups/` (make sure `backups/` is git-ignored). Use one subfolder per save, `YYYYMMDD-HHMMSS/`, keeping the relative paths. Check each backup by reading it back and comparing bytes. **If any backup fails, don't write anything.**
4. Write the 6 files with `createWritable()` → `write()` → `close()`. The browser only replaces the file on `close()`, so a crash mid-write leaves the original intact.
5. **Re-read all 6 files** from disk and re-run V1–V3. If anything doesn't match, tell the user and offer to restore from the backup.
6. Remind the user to fully restart all servers and the client (`Start Server.bat`). These files are only read at startup.

Browser notes: the user has to grant read/write permission to the folder, and Chrome/Edge may ask again later (`queryPermission` / `requestPermission`). `showDirectoryPicker` needs a secure context. If it doesn't work when the HTML file is opened from `file://`, tell the user to serve the folder from `localhost` instead of working around it.

---

## 8. In-game test checklist (the user does this; mark the TODO as DONE only after it passes)

1. Server starts with no new lines in `Server/error_YYYYMMDD.txt` that mention the key, the new IDS ids, or `Not Found`.
2. Type `/position` near the spot and check the NPC stands on the ground, facing the right way.
3. The NPC shows the right name; right-click shows exactly the chosen menus.
4. Trade: every tab has the right name and the expected items; prices are correct.
5. Buy one item from each tab.
6. Restart the client again: the NPC is still there (the Client copy was written too).

---

## 9. Out of scope for this feature (say so in the UI)

- NPC dialog/conversations (C++ in `WorldDialog.dll`).
- New menu *types* (a new `MMI_*` needs client C++).
- Chip shops (`SetVenderType`, `AddVendorItem2`), teleporters (`AddTeleport`), NPC buffs (`SetBuffSkill`), equipment (`SetEquip`, `SetFigure`): possible later; only one, two or three of each exist today.
- Editing or removing existing NPCs (removal = deleting a 200-byte `.dyo` record + its block; do it later with the same rules).
- New models (only existing `MI_*` models).

---

## 10. Suggested build order (all inside the web app)

1. **Read-only loader:** pick the root folder, load and validate all files in §1, show load status and checkmarks, show the item database (from `Spec_Item.txt` + `propItem.txt.txt` + `defineItem.h`) and the list of existing NPCs per map (from the `.dyo` walk + `character.inc`). No writing yet. Self-tests 1–2 (§6.5) must pass.
2. **Form + validation:** the §4 form with all §6 rules and a live preview of the exact text/bytes from §5. Still no writing. Self-tests 3–5 must pass.
3. **Save to a test copy** of `FLYFF-V19-SOURCE` (a folder the user copies), using the web app's Save button. The web app re-reads and re-validates (V1–V3). If the user can, they start the servers from the test copy and run §8 there.
4. **Ask the user** before the first save to the real folder. They use the same Save button there, then run the in-game test (§8). Only then mark the TODO as DONE.
