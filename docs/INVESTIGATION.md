# FlyFF Resource Editor: investigation report for Phases 0–2

## Context
You want a single-file, no-backend HTML editor (File System Access API) that edits this source's resource files without breaking a single byte it doesn't need to touch. Before designing it, you asked for three things: Git safety checks (Phase 0), the actual C++ parser behaviour for each target file (Phase 1), and a byte-level encoding survey of every Resource file (Phase 2). Everything below comes from reading the C++ source and the raw bytes. **Nothing was modified in either repo** (plan mode kept this session read-only). Forensic scripts ran in memory via `python3 -` and wrote no files.

---

## Phase 0: Git safety

| Repo | State |
|---|---|
| `FLYFF-RESOURCE-EDITOR` | **Already a Git repo** (`main`, tracks `origin/main`, 1 commit `67a6df3 first commit`, only `README.md`). Clean. No init needed. No `.gitignore` yet. I'll add one with the first build commit. |
| `FLYFF-V19-SOURCE` | `git status`: **clean**, up to date with `origin/main`. Nothing modified or untracked. |
| Line-ending conversion | No `.gitattributes`, no `core.autocrlf`, `git ls-files --eol` shows index == worktree. **The bytes on disk are exactly the committed bytes**, so before/after byte comparisons are trustworthy. |

### ⚠ Path correction: there is no `FLYFF-V19-SOURCE/Resource/`
- The server's live data folder is **`FLYFF-V19-SOURCE/Server/Resource/`** (15,299 files, 1.1 GB). The servers run with this as their working directory (see `Start Server.bat` / the source's CLAUDE.md).
- `Source/Resource/` only holds a few headers (not read at runtime).
- **`Client/` holds loose mirror copies** of some files:
  - byte-identical: `character.inc`, `propItem.txt.txt`, `propItemEtc.inc`.
  - same content but **LF instead of CRLF**: `Spec_Item.txt`, `defineItem.h`, `propMover.txt`.
  - The client parses `character.inc` itself (shop UI and prices).

---

## Phase 1: How the server really parses these files

### 1.0 The three things that matter most
1. **`propItem.txt` is not loaded by this server.**
   - `__VER` is 19 (`Source/Source/WORLDSERVER/VersionCommon.h:9`). The `#define __VER 16` at line 356 sits inside the `__INTERNALSERVER` block, which is inactive because `__MAINSERVER` is defined.
   - `CProject::OpenProject` (`_Common/Project.cpp:788`) does `#if __VER >= 16 LoadPropItem("Spec_Item.txt")`. `Masquerade.prj` still says `"propItem.txt"`, but the filename is ignored.
   - Evidence it's dead: `propItem.txt` hasn't changed since the baseline commit, while every recent item change landed in `Spec_Item.txt`. Its rows also have **128 values**, but the v19 loader needs **175**.
   - → **Build 3 must target `Spec_Item.txt`.**
2. **None of these files is parsed by lines or columns.**
   - All five go through one tokenizer, `CScanner` (`_Common/scanner.cpp`) plus `CScript` (`_Common/Script.cpp`).
   - Web analogy: it's like a JS lexer that turns the whole file into a token stream. Each loader then calls `next()` a fixed number of times per record.
   - Tabs, spaces, CR and LF are all just whitespace. A missing or extra column **doesn't raise an error**. It silently shifts every later field *and every later record*.
3. **Unknown names don't stop the parse.**
   - An undefined `II_FOO` where a number is expected logs `"II_FOO Not Found."` (to `Server/error_*.txt`) and becomes `0`.
   - What happens next depends on the loader: it ranges from "harmless" to "server won't start" to "server hangs" (details below).

Startup order (`OpenProject`):
1. Defines.
2. String tables.
3. Then, in `.prj` order: `propMover.txt` → `Spec_Item.txt` → `character.inc` → `character-etc.inc` → `character-school.inc`.
4. Finally `PropMoverEx.inc`.

### 1.1 Shared tokenizer rules (apply to all files)

| Topic | Actual behaviour |
|---|---|
| Open | `CResFile::Open(name,"rb")` relative to the working directory (`Server/Resource`). The whole file is read into memory and NUL-terminated. File names are case-insensitive on Windows (e.g. code asks for `defineQuest.h`, disk has `definequest.h`). |
| Encoding | **Raw bytes, no decoding.** Only special case: a leading `FF FE` (UTF-16LE BOM) makes the server convert the file with `WideCharToMultiByte(g_codePage)`. WorldServer never sets `g_codePage` → `0` = `CP_ACP` (the Windows system ANSI code page). There's **no** UTF-8 BOM handling (an `EF BB BF` would glue onto the first token) and **no** UTF-16BE support. |
| Whitespace | Any byte `0x01–0x20`. Tab, space, CR and LF are interchangeable. |
| Blank line | Just whitespace; it carries no meaning. |
| Comments | `//` to end of line (CR, LF or CRLF). `/* … */` (an unterminated one eats the rest of the file). `/` is a delimiter, so `X//note` works. |
| Quoted strings | `"…"` runs up to the next `"`, **or a CR**, or EOF. Not LF: in an LF-only file an unclosed quote spans lines. There are no escapes; the limit is 2048 bytes. `""` = one empty token. **`"""abc"""` = 3 tokens** (`""`, `"abc"`, `""`), and the item loader counts on that. |
| Numbers | Start with a digit and run to the next delimiter. `.` is *not* a delimiter (`0.075` is one token). `0x…` is hex. **`-5` is two tokens**: the number reader sees `-` and negates the next token. **`=` in a number slot = `NULL_ID` (0xFFFFFFFF, i.e. -1)**, which is the "empty cell" convention in the tab files. Floats use `atof`. Integers use `atoi` (32-bit). |
| Identifiers | Resolved in this order (`CScript::GetToken`): **① string table** (`IDS_*` → replaced by its text) → **② `#define` map** → number → **③ unresolved**: in a number slot this logs "Not Found" and the value is `0`. |
| Delimiters | `+ - * ^ / % = ; ( ) , ' : { } .` are each their own token. Commas, parentheses and semicolons are mostly *skipped blindly* by loaders ("read one token, assume it's the comma"). |
| Error line numbers | Only CR bytes are counted. |

### 1.2 `#define` resolution (II_*, MI_*, IK3_*, …)
- **Which headers:** `CProject::LoadDefines` (`_Common/ProjectCmn.cpp:1369`) reads a fixed list of 21 headers from `Server/Resource`: define, defineNeuz, defineQuest, defineJob, defineItem, defineWorld, defineItemkind, lang, defineObj, defineAttribute, defineSkill, defineText, defineSound, resdata, WndStyle, definelordskill, defineHonor, ContinentDef, defineMapComboBoxData, defineItemGrade, defineItemType (all `.h`).
- **Accepted syntax:** only `#define NAME <decimal|0xhex>` (`CScript::ExecDefine`).
  - **Silently ignored:** negative values (`PK_NPC -1` at define.h:250, `HM_SATISFIED -1` at defineHonor.h:66), aliases (`JOB_ALL MAX_JOB` at defineJob.h:162), and expressions.
  - `enum` and `#include` are ignored too (`__REMOVE_SCIRPT_060712`).
- **Storage:** one global `std::map<string,int>` (≈ a JS `Map`). On a duplicate name the **first wins silently**. There are 5 duplicates today (`MAX_JOB`, `QUEST_COOKER02`, …).
- **Where the IDs live:**
  - `II_*` comes only from **defineItem.h** (8,114 names, all values unique, max 225047).
  - `MI_*` comes only from **defineObj.h** (1,120 names, unique, max 1543; `MAX_PROPMOVER` = 14900).
- The numeric value is the real identity: it's what the DB stores. The editor must never renumber anything.

### 1.3 String tables (`*.txt.txt`)
- **Loader:** `CProject::LoadStrings` (`ProjectCmn.cpp:1253`) loads ~70 files into **one global map**. On a duplicate key the first wins and an error is logged.
- **Format** (`CScript::LoadString`): each entry is a key token that must start with `IDS` (otherwise error + skip). The value is then the rest of the line up to **CR**, with leading and trailing whitespace trimmed (so tabs after the key are irrelevant).
  - An LF-only file would swallow everything into one string.
  - `//` inside a value is kept.
- **Name lookups:**
  - Item name: `Spec_Item` column 3 (`IDS_PROPITEM_TXT_…`) → `propItem.txt.txt`.
  - Item description: the `szCommand` column (also an IDS key).
  - Monster name: `propMover` column 2 → `propMover.txt.txt`.
  - NPC name: `SetName(IDS_CHARACTER_INC_…)` → `character.txt.txt`.
- **Missing key:** the name silently stays as the raw `IDS_…` text.
- **Current data:** 20,473 keys across those 3 files, no duplicates, every line well-formed. Four keys are missing: `IDS_PROPMOVER_TXT_002232…002235` (used by the last `propMover.txt` rows, e.g. `MI_PET_BABYCAT_2`).

### 1.4 `Spec_Item.txt`: the real item table (`CProject::LoadPropItem`, ProjectCmn.cpp:573)
- **Record = 175 values:**
  - version, `II_` id, name (IDS), then 165 number/define fields.
  - `szIcon` as **3 tokens** (`"""itm_x.dds"""`), `dwQuestId`, `szTextFileName` as 3 tokens (`""""""`), `szCommand` (IDS).
  - The v16 block (27), v18 block (6) and v19 block (2).
  - I emulated the tokenizer in Python: **all 8,067 rows have exactly 175 values, one row per line.** The `//ver6 //dwID szName …` comment line documents the column names.
- **Version:** rows with version > 19 are skipped (logged). Today the max is 19.
- **Unresolved id (0) → parsing stops (`return FALSE`) and every later item is missing.** This is a custom diagnostic `WriteError` in this source.
- **Duplicate id:** the later row overwrites silently.
- **Quoting is fragile:** writing `"itm.dds"` instead of `"""itm.dds"""` shifts the row by 2 tokens.
- **Custom code in this source:**
  - `__NEW_STACKABLE_AMPS` clones EXP scrolls with `nMaxDuplication>1` into IDs 60000+. No `II_` currently collides with that range.
  - `__CROSSBOW` forces looks-change flags on `II_WEA_BOW_BEHECROSSBOW`.

### 1.5 `propMover.txt` (`CProject::LoadPropMover`, ProjectCmn.cpp:380)
- **Record = 86 values:**
  - `MI_` id, name (IDS), 80 numbers/floats.
  - Then a comment token (IDS, ignored), `dwAreaColor`, `szNpcMark` (raw token, often `=`) and `dwMadrigalGiftPoint`.
  - Verified on all 1,114 rows.
- **id 0:** skips that single token and continues.
  - That's why line 940, `"//대만 가위,바위,보 NPC"`, is harmless. It's an Excel artifact: **a quoted string, not a comment, to the server**.
- **id < 0 or ≥ 14900, or a duplicate id → `return FALSE` → the server fails to start.**

### 1.6 `character.inc`: NPC shops (`CProject::LoadCharacter`, Project.cpp:3257)
`character-etc.inc` and `character-school.inc` load into the **same NPC map**.

**Block structure:**
- Each NPC is `NpcKey { … }`. The parser reads the key, **consumes one token assuming it's `{` (it doesn't check)**, then counts braces until depth 0.
- Anything it doesn't recognise (`setting`, `;`, stray words) is skipped.
- Statements often span lines (`SetName\n(\nIDS_…\n);`), so the editor can't assume one statement per line.

**Shop commands:**

| Command | Meaning |
|---|---|
| `AddVendorItem(tab, IK3_x, job, rareMin, rareMax, count)` (424 uses) | Auto-generated stock. Items are chosen by item kind 3, job and rarity range, then sorted. |
| `AddShopItem(tab, II_x [, cost])` (179 uses) | **Custom `__ADDSHOPITEM`.** A fixed item, appended after the generated stock. **The optional cost overwrites `ItemProp.dwCost` globally**: the item's price changes everywhere. If two NPCs list it with different costs, the last one loaded wins. |
| `SetVenderType(1\|2)` + `AddVenderItem2(tab, II_x)` | Chip shops (1 = Red Chip, 2 = Donate Chip). Only `MaFl_Waforu` (32 items). Items with chip cost < 1 are skipped with an error. |
| `AddVendorSlot(tab, IDS_…)` | Tab titles. |
| `*Lang` variants | Gated by language. |

**Limits and failure modes:**
- 4 tabs (0–3), 100 items max per tab. The overflow is dropped silently.
- **The tab index is not bounds-checked: tab ≥ 4 corrupts memory.**
- An undefined `II_` is logged and becomes 0, and the shop skips it silently.
- A duplicate NPC key (case-insensitive) silently replaces the earlier one in Release builds.

**⚠ Generic parsers get this wrong:**
- 6 NPCs have **no opening `{`** after their name. Examples: `NPC_Door` at line 7856; the others close around lines 7919, 8497, 8517, 8536 and 8866.
- They only work because the parser swallows `setting` as the "brace" and the `setting { }` braces then balance everything.
- A normal brace matcher reports 6 errors here. The editor must mirror the server's logic and treat this as a *warning*.
- Missing `;` after `AddMenu(…)` is common and harmless.

### 1.7 `propMoverEx.inc`: drops (`CProject::LoadPropMoverEx`, Project.cpp:2978)
- **Block form:** `MI_x { … }`.
- **Statements:**
  - `Maxitem = n;`
  - `DropGold(min, max);`
  - `DropItem(II_x, prob, level, count);`
  - `DropKind(IK3_x, a, b);`. `a` and `b` are **ignored**: the rarity window is computed as monster level −5 … −2.
  - `AI { #scan{…} #battle{…} #move{…} }` (a sub-parser).
  - `m_* = n;`, `SetCallHelper(…)`, `SetRunAway(…)`, `Transform(…)`.
  - Unknown words are skipped.
- **Probability scale:** `3,000,000,000` = 100% at 1× rate (`xRandom(3e9)/rate < prob`, Project.cpp:184).
- **⚠ 518 `DropItem` probabilities exceed 2,147,483,647** (the largest is 30,000,000,000). They go through 32-bit `atoi`. MSVC's `atoi` clamps on overflow to 2,147,483,647 (≈71.6% at 1× rate), so all of these probably behave identically. *Not confirmed in-game.*
- **Undefined `II_`:** logs an error, and an id-0 drop entry is still added.
- **Undefined `MI_` (→0):** the block silently applies to `MI_DEFAULT`.
- **`MI_` id out of range → infinite loop** (a `continue` inside `do…while` re-tests the same id forever) → **the server hangs at startup.** The editor must hard-block this.
- **Missing `}`:** the next monster's statements get absorbed silently.
- **Two blocks for one monster:** the drop list is never cleared, so the drops append.
- **Custom:** `PenyaTable` (`_Common/PenyaTable.h` + `PenyaTable.txt`) replaces `DropGold` for listed ranks at runtime. The file's DropGold isn't always what players get.

### 1.8 Where an NPC stands, and the names players see (added 2026-10-06, `loaders/area.js`)
- **Position:** a `.dyo` mover record holds `m_vPos` at byte 16 of the 60-byte CObj part. `CObj::Read` multiplies x and z by `OLD_MPU` = 4 (`Obj.cpp:525`, `DefineCommon.cpp:11`). `CWorld::LoadObject` uses the result as is.
- **Map window (M):** `CWndMapEx::GetMapArea` (`WndMapEx.cpp:1385`) calls `CContinent::GetTown`, then `GetContinent`.
  - The polygons come from `World/WdMadrigal/WdMadrigal.wld.cnt` (`CContinent::Init`, `_Common/Continent.cpp`). They are checked in id order with `Point_In_Poly`, whose arithmetic is integer (LONG).
  - The name is the first `MCC_MAP_NAME` entry in `propMapComboBoxData.inc` with that `SetLocationID`: 1 Flaris, 2 Saint Morning, 3 Garden of Rhisis, 4 Valley of the Risen (Estia), 241 Darkon 1, 2, 242 Darkon 3, 243 Shaduwar (Harmonin), 244 Kaillun Grassland, 245 Bahara Desert, 0 Madrigal.
  - **Finding:** every town block (Flarine, Sain City, Darken, Eillun) has `C_useRealData 0`. Init skips those blocks, so `GetTown` never finds a town and the map window never opens a town map by itself.
  - **Finding:** the Flaris polygon has a stray vertex (7087, 8157), so it is self-intersecting and claims a thin strip of other continents. No NPC stands in that strip.
- **Area name on screen:** this comes from the client's region loop in `CWndWorld` (`WndWorld.cpp:9258–9370`; white style `bdf9f5cb`).
  - The regions are the `.rgn` records (`CWorld::ReadRegion`, `WorldFile.cpp:413`), in file order, minus `RI_BEGIN`, `RI_REVIVAL` and `RI_STRUCTURE`.
  - Each frame, the first region newly entered (`CRect::PtInRect`) does four things: it sets the navigator name ("" when it has no title), sends its desc lines to the chat, and shows its title. The title's first line is big and clears the old area names; the rest is small. Then the loop stops for that frame.
  - Titles come from the string table (`CProject::LoadStrings`). A map whose `.txt.txt` is not in that list (e.g. `WdArena_1`) shows the raw `IDS_…` key.
- **Other maps:** `World.inc` `SetTitle` sets the world's name (`world.txt.txt`).
- **Teleport:** a GM types `/te <world id> <x> <z>` (`TextCmd_Teleport`, `FuncTextCmd.cpp:2718`).
- **Donation Shop:** the client opens it from the taskbar (`7d7df4f9`) or for the NPC whose key is `MaFl_DONATION` (`WndWorld.cpp:5835`).

---

### 1.9 Adding an NPC (added 2026-10-06, `edit/npc-ops.js`, `loaders/newnpc-sim.js`)
- **No V19 commit has added an NPC** (character.inc keys compared commit by commit). Closest proof: `b6abf414` rewrote `WdMadrigal.dyo` with every record's name[64] / dialog[32] zeroed and a control record moved after the NPCs, and the game kept working.
- A `.dyo` NPC record is always 200 bytes (`ReadObj`, CreateObj.cpp:761 → `CObj::Read` 4+60 → `CMover::Read`, Mover.cpp:3365: name 64, dialog 32, key 32, belligerence, extra flag). 398 of the 447 placed NPCs use axis 0, scale 1, motion 0xFFFFFFFF, AI 0 / 2, belligerence 1: a new record uses those.
- **x and z in the file are world / 4.** `CObj::Read` multiplies them by `OLD_MPU` (Obj.cpp:525); `/position` prints the world position (`TextCmd_Position`, FuncTextCmd.cpp). Juria: file 1739.61 = 6958.4 in game. The handoff said to write the `/position` numbers as they are: that would put the NPC 4x further out.
- **Insert point = the final 0xFFFFFFFF**, found with the typed walk (OBJ/ITEM/SHIP 64 bytes, MOVER 200, CTRL by version). The handoff's "walk while type == 5" stops at offset 0 on `DuDaDk` and `Wdguildhousemiddle`, whose control records come first. 46 of 48 maps end at the marker; `WdGuildWar1To1` and `WdVolcaneYellow` start with `0xA8A8A8F8`, so the server reads no object there (blocked). Several World.inc maps have no `.dyo` at all (WdTest, WdLux, …).
- The client's right-click popup (WndWorld.cpp:7229) lists each flagged menu once, by id 0..349 (not AddMenu order), label `TID_MMI_DIALOG` (7000) + id, except `MMI_GUILDCOMBAT_RANKING` ("Overall Rankings" + "Weekly Rankings"), `MMI_COLLECTOR_DETAILS` ("Collection Details"), `MMI_GUILDBANKING` (guild members, warehouse on) and `MMI_ARENA_ENTER` (after the first job change). V19 always opens the popup (`0 < nCount`), even for one menu. Menus 191/192 show unrelated TID texts (guild house auction messages).
- Server and Client copies: all 48 `.dyo`, `character.inc`, `character.txt.txt` are byte-identical.
- **Building tag** (`m_nStructure`): the client draws `"[%s]"` of `prj.m_aStructure[n].szName` above the name when `m_nStructure != -1` (MoverRender.cpp:1717; `CHARACTER::Clear` sets -1, Project.cpp:162), and minimap icon `6 + n` (WndField.cpp:11790). Names come from etc.inc `structure { SRT_X IDS_ETC_INC_n }` (`CProject::LoadEtc`, Project.cpp:1262: id = GetNumber, until a `}`; GetToken swaps the IDS key for its etc.txt.txt text, `_tcscpy` into `szName[32]`, Project.h:334). The table has `MAX_STRUCTURE` (20, compiled from Source/Resource/defineNeuz.h) rows, so a new tag can only take a free row: 18 and 19 today (11 is `SRT_DUNGEON`, defined without a name). An id ≥ 20 or a text of 32+ characters writes past the table. `b4b9a465` added rows 14-17 this way (defineNeuz.h + etc.inc + etc.txt.txt, Server + Client) and they work in game; the icon of rows 18/19 is untested. The editor writes Server + Client only, not `Source/Resource/defineNeuz.h` (b4b9a465 also changed that build copy). `etc.txt.txt` was missing from the editor's string tables (it is 4th in `CProject::LoadStrings`); added.
- **Model files**: the model loader (CModelMng / CObject3D) is not in this source tree. A model counts as complete when mdlDyna.inc names it and `Client/Model` has `Mvr_<name>.o3d`, one `.ani` per motion, and every texture the `.o3d` names in `Client/Model/Texture`. In every one of the 457 `Mvr_*.o3d` files (15,871 names) a texture name is a uint32 length (name + NUL), the name, and a NUL; all their textures are present. Models of NPCs hidden in `b6abf414` (MaFl_Shain, MaFl_COUPONPANG, MaFl_ANGEL2011, whose SetLang(LANG_KOR) had shown it everywhere but Korea) were seen in game and count as proven.

## Phase 2: Encoding and line-ending forensics (all 15,299 files, raw bytes)

**Method:** Python read every file as bytes. For each one it checked:
- the BOM;
- binary content (NUL bytes);
- strict UTF-8 and CP949 validity, per file *and per line*;
- CR / LF / CRLF counts;
- a decode→encode byte comparison with the best single codec.

**Totals:**
- **14,896 binary** assets (o3d, ani, lnd, dds, chr, dyo…). Out of scope.
- **403 text** files:

| Encoding | Count |
|---|---|
| UTF-16LE + BOM | 170 (all `.rgn`, all `*.txt.txt`, `character*.inc`, `propQuest.inc`, `propItemEtc.inc`, `textClient.inc`, …) |
| ASCII | 118 |
| CP949 / EUC-KR (no BOM) | 98 |
| UTF-8 (no BOM) | 9 |
| **Mixed / undecodable** | **8** |

- None found: UTF-8-with-BOM, UTF-16BE.
- **Line endings:** CRLF 354, single-line 25, **LF-only 14**, **mixed 10**, CR-only 0.
  - The LF-only files are all custom additions: `PenyaTable.txt`, `Badge.inc`, `BattlePass.inc`, `DonationShop.inc`, `1Rebirth.inc`, `MonsterHunt.inc`, `Teleporter.inc`, `Anarchy.txt`, `GuildBuff.txt`, `ServerBuff.txt`, `FreePKTime.txt`, `DPSProp.txt`, 2× GuildSiegePrize lua.
  - Mixed: `defineItem.h`, `Mount.inc`, `WeaponRarity.inc`, `couple.inc`, `connect.txt`, 5× `InvalidName_*.inc`.
- **Round-trip failures with a single codec** (8):
  - `Spec_Item.txt`, `defineItem.h`.
  - Six Letter/InvalidName FRE/GER/SPA files, probably Windows-1252 (not verified).

### Editor target files

| File | Encoding | BOM | Line endings | Single-codec round trip | Notes |
|---|---|---|---|---|---|
| character.inc | UTF-16LE | yes | CRLF ×13,467 | ✅ | Hangul only in comments. No lone surrogates. 6 missing-`{` NPCs. Client copy identical. |
| character-etc.inc / -school.inc | UTF-16LE | yes | CRLF | ✅ | Same NPC map. |
| character.txt.txt | UTF-16LE | yes | CRLF | ✅ | |
| propMoverEx.inc | UTF-8 | no | CRLF ×51,426 | ✅ | 7,980 U+FFFD in comments: Korean comments were already destroyed by an earlier "save as UTF-8". All data ASCII. |
| propMover.txt | CP949 | no | CRLF | ✅ | Korean header comment. Client copy = LF. |
| propMover.txt.txt | UTF-16LE | yes | CRLF | ✅ | Last line has no trailing CRLF. |
| **Spec_Item.txt** | **mixed** | no | CRLF ×8,404 | **❌** | All 261 non-ASCII lines are `//` comments mixing U+FFFD-in-UTF-8 and raw CP949 bytes. Line 1 is invalid in both codecs. **All 8,067 data rows are pure ASCII.** Client copy = LF. |
| propItem.txt (unused) | CP949 | no | CRLF | ✅ | Legacy 128-value format. |
| propItem.txt.txt | UTF-16LE | yes | CRLF ×17,051 | ✅ | No final CRLF. 108 non-ASCII values (Hangul, `’`, CJK). Client copy identical. |
| **defineItem.h** | **mixed** | no | **mixed** CRLF 9,810 / LF 52 | **❌** | Non-ASCII only in comments. 3 lines invalid in both codecs. Client copy = LF. |
| defineObj.h, other define*.h | CP949 / ASCII | no | CRLF | ✅ | defineNeuz.h, defineText.h, definequest.h are UTF-8 with U+FFFD comments. |

### What this means for Phase 3 (preview only)
- **Browser support is asymmetric:**
  - Decoding: `TextDecoder('euc-kr')` exists (it's actually windows-949) and handles CP949 fine.
  - Encoding: there's **no CP949 encoder** (`TextEncoder` is UTF-8 only).
  - So a "decode whole file → encode whole file" approach is impossible natively for CP949 files. For `Spec_Item.txt` and `defineItem.h` it's impossible with *any* single codec.
- **The data itself is easy:** every byte the editor would ever change is ASCII (define names, numbers, punctuation), or UTF-16LE (`character.inc`), which is trivial to encode by hand in JS.
- **Direction I'll propose in Phase 3:**
  - Keep each line's **original raw bytes plus its exact terminator**.
  - Decode only for display.
  - Re-emit only the lines that were edited.
  - Only allow ASCII in edits to byte-oriented files.
  - Round-trip check = reassemble the lines and compare byte-for-byte with the original.
- **Conflict with your rule:** under a literal "decode→encode must match or the file goes READ-ONLY" rule, `Spec_Item.txt` and `defineItem.h` would be read-only, which blocks Build 3. That's one of the questions below.

---

## Open questions (your call before Phase 3)
1. **Folder and mirrors.** The Resource folder is `Server/Resource`. Should saves also update the `Client/` mirrors (`character.inc`, `propItem.txt.txt`, `Spec_Item.txt`, `propMover.txt`; the last two are LF there)? If yes, the user should pick the repo root (or two folders) in the browser.
2. **Build 3** targets `Spec_Item.txt` (+ `propItem.txt.txt`, `defineItem.h`) instead of the unused `propItem.txt`. OK?
3. **Round-trip definition** for the two mixed-encoding files: accept the "raw bytes per line, ASCII-only edits, reassembly must be byte-identical" test instead of a single-codec decode/encode?
4. **Drop chances above 2,147,483,647** (518 lines): intentional? Should the editor warn, or clamp its display to the effective value?
5. **`AddShopItem` cost** is global. Should the editor flag an item that is priced differently in two shops?

### Decisions (answered 2026-10-05)
1. Server only: the user picks `Server/Resource`, and the UI warns that the `Client/` mirrors must be synced separately.
2. Round trip uses the raw-bytes line model: only edited lines are re-emitted, edits are ASCII (UTF-16LE for `character*.inc`), and reassembly must be byte-identical or the file becomes read-only.
3. Drop chances above INT_MAX: keep as written, warn, and show the effective (clamped) %.
4. `AddShopItem` cost conflicts across shops: non-blocking warning naming which NPC's price wins.

## Next step after you approve
Write the **Phase 3 + Phase 4 design** only:
- the file representation;
- the safe save and backup flow with the File System Access API (including browser permission limits);
- validation rules derived from the server behaviour above;
- the single-HTML architecture.

No editor code, no writes to `Server/Resource`, nothing touched in `FLYFF-V19-SOURCE`. The editor repo needs no Git setup now; `.gitignore` goes in with Build 1.
