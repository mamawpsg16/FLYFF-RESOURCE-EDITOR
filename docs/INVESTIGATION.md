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
> **Superseded by §1.18 (2026-10-08, task F), read the C++ line by line.** Corrections: a capped "100%" line drops **80.15%**, not 71.6% (`xRand() % 3e9` favours low rolls); a missing `}` at the end of the file is an endless loop; "out of range" means above the highest propMover.txt id.
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

### 1.10 Adding an exchange menu to an NPC (added 2026-10-06, `edit/menu-ops.js`, `validate/newmenu.js`)
- **No commit adds an exchange menu end to end.** `cda3af21` (MMI 280) and `15091d5f` (MMI 281) add `#define MMI_x <id>\t// comment` lines (all copies) and an `AddMenu` line, but both menus have hard-coded labels and their own `case`. `f58e56ba` is the only commit that adds TIDs: `#define\tTID_x\t\t\t\t\t<next>` at the end of defineText.h, a `TID_x\t\t\t\t0xffffffff { IDS_TEXTCLIENT_INC_n }` block appended to textClient.inc and the line appended to textClient.txt.txt. The editor combines these with the stock menus' label rule.
- **Label:** the client's popup appends `prj.GetText( TID_MMI_DIALOG + i )` for every flagged id (WndWorld.cpp:7283; `TID_MMI_DIALOG` = 7000). Ids 280/281 skip it (literal strings). So menu 282 needs TID 7282.
- **Click:** `CWndWorld::OnCommand` (WndWorld.cpp:4379-6724) has 139 `case MMI_x:` labels; any other id falls to `default:` (6470, `__TRADESYS`) and opens `CWndDialogEvent` with that id, which lists the menu's SETs from the client's own Exchange_Script.txt. The server (`CDPSrvr::OnExchange`, DPSrvr.cpp:10721) only calls `ResultExchange`: it does not check that the NPC has the menu or that the player stands near it.
- **Limits:** `MAX_MOVER_MENU` 350 (compiled; `AddMenu` writes `m_abMoverMenu[id]` with no bounds check, Project.cpp:3410). Ids 282-349 are free; 240 and 243 have no MMI_ but TIDs 7240 / 7243 exist (stray labels), so the editor starts at 282. Highest TID 8043 → new result texts 8044+.
- **textClient.txt.txt** holds key `IDS_TEXTCLIENT_INC_i` on line i (0-based) for all 3,929 lines; the loader is key-based (`CScript::LoadString`) but the editor only appends, so the shape stays.
- **Client copies:** defineText.h, defineNeuz.h and Exchange_Script.txt are LF in Client (`eol` sync), textClient.* and character.inc identical.
- **Full bag:** an exchange whose ingredients are used up whole frees their slots (`IsFull` counts them as empty), so Jeff's exchanges succeed even with no free slot (the core's slot is freed).

### 1.11 Editing an existing NPC: name, shop tabs, menus (added 2026-10-07, `edit/npcedit-ops.js`, `loaders/shop-window.js`)

**Name and tab texts.**
- `SetName( IDS_… )` and `AddVendorSlot( n, IDS_… )` show the text of a `character.txt.txt` line.
- `AddVendorSlot( n, "Male" )` keeps its text in character.inc itself (`GetLangScript`, `Project.cpp:3433`).
- The proven edits:
  - change the text after the key: `f58e56ba` NPC renames, `ba92f67f` Peach Awaken → Scrolls, `5794b14d`;
  - add a tab: append a key line + `\tAddVendorSlot( n, KEY );` after `SetName` (`d11123ac`).
- Many keys are shared: `IDS_CHARACTER_INC_000049` "n/a" is 6 tabs (Peach 2–4, Raia 2–4), and the guild house doors share one name ×17. So the editor changes a shared text only when asked, and otherwise gives this NPC or tab its own new key.
- Only character.inc NPCs: the client has no loose copy of character-etc.inc / character-school.inc or their string files (it reads `data.res`).

**The shop window** (client, `CWndShop::OnInitialUpdate`, `WndShop.cpp:815-833`):
- One tab per slot whose `m_venderSlot` is not empty, inserted at index = slot (`CWndTabCtrl::InsertItem`, `WndControl.cpp:5744`, `m_aTab.resize(i+1)`).
- Unnamed slots below a named one stay NULL entries: not drawn, not clickable (`OnLButtonDown`, 5632). Fewer than 3 entries are padded with blank tabs.
- `m_nCurSelect` starts at 0. A click runs `SetCurSel`, which first hides `m_aTab[old]->pWndBase`. With slot 0 unnamed and another slot named, that is a NULL dereference, so **the client crashes on the first tab click** (rule `C_TAB_FIRST_UNNAMED`, BLOCK; from the code, not seen in game).
- Items in an unnamed slot are never shown (`C_TAB_UNNAMED_ITEMS`).
- A gap in the middle only leaves an empty space (`C_TAB_GAP`, INFO).
- Buying sends `cTab = GetCurSel()` (`WndShop.cpp:673`) and the server sells from `m_ShopInventory[cTab]` (`DPSrvr.cpp:3363`). Position = slot, so a gap does not mix up tabs.
- Real data today: no shop has any of the three.

**Menus:** `AddMenu( MMI_X );` lines. `AddMenuLang` and `AddVendorSlotLang` are for other languages; `AddVendorSlotLang` appears only in comments here.

### 1.12 What players pay and get back; rule rows made fixed items (added 2026-10-07, task S part 2, `loaders/vendor-sim.js`, `ui/shop-rules.js`)

**One price per item.** A Penya shop charges the item's `dwCost`.
- `AddShopItem( tab, II_X, price )` writes `pItem->dwCost` while the NPC files load (`Project.cpp:3581`), for the whole server.
- The files load in `Masquerade.prj` order (lines 104-106: `character.inc`, `character-etc.inc`, `character-school.inc`), each top to bottom. The last price wins.
- Rule shops (`AddVendorItem`) and priceless `AddShopItem` lines charge that same number. So a price typed in one shop changes the price everywhere that item is sold (`6b026003`: "AddShopItem also sets its dwCost, so it sells back for 2,500").
- An EXP scroll copy (id 60000+, `__NEW_STACKABLE_AMPS`) is cloned in `LoadPropItem`, before the NPC files, so it keeps the Spec_Item price.

**Buy** (`CDPSrvr::OnBuyItem`, `DPSrvr.cpp:3378-3405`; only shops with `SetVenderType 0`):
1. `nCost = (int)GetCost()`. `GetCost` (`Item.cpp:135`) returns -1 for `dwCost` "=" (0xFFFFFFFF); shop items are +0.
2. `nCost = (int)(m_fShopCost * nCost)`, then `(int)(GetShopBuyFactor() * nCost)` (`__SHOP_COST_RATE`). Both rates are `float` (`Project.h:1130`) and default to 1.0.
3. `II_SYS_SYS_SCR_PERIN` costs `PERIN_VALUE` (100,000,000, `define.h:265`).
4. `nCost < 1` becomes 1. Tax applies only to the Secret Room owner (not modelled).

**Sell back** (`OnSellItem`, `DPSrvr.cpp:3733-3766`): `GetCost() / 4` (C int division, so -1 / 4 = 0), then `(int)(GetShopSellFactor() * n)`, and `0` becomes 1.
- NPCs refuse to buy: `IK3_EVENTMAIN`, quest items (`IK3_QUEST`), `II_SYS_SYS_SCR_SEALCHARACTER`, Perin, and a flying item for Vagrants (`PARTS_RIDE` + `JOB_VAGRANT`). Equipped and locked items are refused too.

**Float math.** The WorldServer is built Win32 with toolset v143 (`WorldServer.vcxproj`): SSE2 and `/fp:precise`. So `float × int` is done in float32:
- A price above 16,777,216 can move by a few Penya (16,777,217 is charged 16,777,216).
- A price from 2,147,483,584 up overflows `(int)` (cvttss2si gives INT_MIN) and is charged **1 Penya**. The editor shows it as `C_PRICE_MIN1`.

**Client.** The tooltip (`WndManager.cpp:6329-6372`, `6435-6460`) uses the same `dwCost`; it hides the price line for "=".

**Rule rows -> fixed items** (the `73ee4bd6` way: prices with AddShopItem lines):
- `CMover::ProcessRegenItem` (`Mover.cpp:1630`) puts the rule items of a tab first (sorted by kind then rarity), then the `AddShopItem` items in file order, 100 at most.
- So the tab's rules are replaced by one `AddShopItem( tab, II_X );` per item they added, in that order. The lines go where the first rule was, or above an earlier `AddShopItem` of the tab. Players then see the same tab.
- No price is written unless typed, so nothing else changes.
- All 234 Penya tabs with rules convert to identical contents (tests).

**The other two ways:**
- `dwCost` in Spec_Item.txt (`94881aa2` changed `II_CHP_RED`'s). It does nothing for an item that some AddShopItem prices, since that price replaces it at load.
- `dwShopAble -1` (`9bf0cebb`). Only `GenerateVendorItem` reads it, so the item leaves every rule shop and stays in fixed lines.

**Found:** `MaFl_SecretRoom_EAST` / `MaDa_SecretRoom_WEST` sell `II_CHP_RED` (Red Chip) for 1 Penya. Its `dwCost` became 0 in `94881aa2` (so selling chips gives 1 Penya), and the buy minimum makes it 1 Penya.

### 1.13 Rules windows: a menu that shows a text (added 2026-10-07, `ui/menu-chooser.js`, `loaders/board-text.js`, `docs/patches/npc-board.diff`)

**What exists in the game.** The Guild Siege rules boards are client-only:
- `case MMI_GUILDCOMBAT_INFO_BOARD1..3` / `MMI_GUILDCOMBAT_1TO1_GUIDE_*` in `CWndWorld::OnCommand` (`_Interface/WndWorld.cpp:4544`) load `Client\GuildCombatTEXT_<n>_<lang>.inc` (`GetLangFileName`, `ProjectCmn.cpp`) with `CScript`.
- They then call `CWndGuildCombatBoard(0)->SetString(scanner.m_pProg)`, which adds the text through `CEditString::AddParsingString`.
- The window title is fixed by type: 0 = `TID_GAME_GUILDCOMBAT_BOARD`, 1 = the 1-to-1 board (`WndField.cpp:18457`, `PaintFrame`).
- No normal menu shows a text of your own. The NPC "Dialog" lines are compiled into `WorldDialog.dll`.

**The change** (`docs/patches/npc-board.diff`; the user applies it in FLYFF-V19-SOURCE and builds Neuz; no server change):
- In the `default:` branch (`WndWorld.cpp:6471`, `__TRADESYS`), first `CScript::Load("Client\\NpcBoard_<menu id>.inc")`. A missing file returns FALSE silently (`CScanner::Load`, `scanner.cpp:508`).
- If it loads: open `CWndGuildCombatBoard(2)` with `m_strBoardTitle = prj.GetText(TID_MMI_DIALOG + nID)` (the menu's right-click name), then `SetString`.
- Otherwise: the exchange window, unchanged. No `NpcBoard_` file exists today, so no existing menu changes.

**Text codes** (`CEditString::ParsingString`, `EditString.cpp:441`; defaults `EditString.h:155`: white, PS_USE_MACRO; `__ITEMLINK` on in `Neuz/VersionCommon.h:36`):
- `#cAARRGGBB` colour. Each character is read as `c >= 'a' ? c - 'a' + 10 : c - '0'` (signed `CHAR`), ORed into 64 bits. So **only lowercase hex works**: `#cFFFF0000` gives a garbled colour.
- `#b` / `#u` / `#s` turn bold / underline / strike on; `#nb` / `#nu` / `#ns` turn them off; `#nc` goes back to white.
- `#l<4>` sets the code page and `#i<7><4>` an item link: skipped.
- Any other `#x` is shown as typed. A `#` at the very end is dropped.
- `\n` (two characters) is a line break; real line breaks stay as they are.

**A new rules menu** (`menuOps.boardPlan`), one undo step:
- `#define MMI_<NAME> <282..349>` (defineNeuz.h), `TID_MMI_<NAME>` 7000 + id and its text (defineText.h, textClient.inc / .txt.txt), `AddMenu` (character.inc); Server + Client.
- Plus the new client-only file `Client/Client/NpcBoard_<id>.inc` (ASCII, CRLF like `GuildCombatTEXT_1_USA.inc`).
- `io/save.js` creates it in the Client folder (backup manifest: `created`, so restore deletes it).

### 1.14 Moving an NPC / changing its model (added 2026-10-07, task S part 3, `edit/npcedit-ops.js` `placePlan`, `ui/npc-place.js`)

**Where the game reads it.** `CWorld::LoadObject` (`_Common/WorldFile.cpp:297`) calls `ReadObj` (`CreateObj.cpp:761`) until it returns NULL. An NPC record is the type DWORD (5), then `CObj::Read` (`Obj.cpp:474`): `m_fAngle`, `vAxis[3]`, `m_vPos[3]`, `m_vScale[3]`, `m_dwType`, `m_dwIndex`, motion, AI, AI2 (4 bytes each); `m_vPos.x` / `.z` are multiplied by `OLD_MPU` (4). Then `CMover::Read` (`Mover.cpp:3365`): name[64], dialog[32], key[32], belligerence, extra flag. Offsets from the type DWORD: facing 4, x 20, y 24, z 28, model (`m_dwIndex`, the `MI_` id given to `SetIndex`) 48, key 160.

**The edit.** Only those 4-byte fields are rewritten, in place; the file keeps its size. `b6abf414` moved MaFl_Angel's record the same way (Server + Client). One spot moves at a time (14 NPCs stand in several places: Postbox 11, Helper_ver12 10…); a model change can go on every spot. The game client never reads `.dyo` files: `CWorld::LoadObject` (with its Quest Helper part, which copies each keyed NPC's position into its character) sits inside `#ifdef __WORLDSERVER` (`WorldFile.cpp:269-382`), and NPCs reach the client in server packets (`CDPClient::OnAddObj`). (Corrected 2026-10-08; this note used to say the client reads its copy.) The Client copy is still changed with the Server one, the `b6abf414` way (client sync: identical `.dyo` copies), so the two never drift.

**Checks** (shared with + NPC, `validate/newnpc.js` `checkSpot` / `checkModel`): numbers, facing 0-359.9, overlap (< 4 units; the NPC's own record is skipped), height far from the nearest NPC, model defined / in propMover / in mdlDyna / files in Client/Model / used by a visible NPC. A move stays on its map (the user, 2026-10-07: "same map only"; moving to another map would remove and insert records, which no commit has done yet).

**Simulator:** `tools/npcmove-sim.js MaFl_Postbox spot=7 x=+6 model=MI_MAFL_JURIA!`; Python copy `oracle_sim.py npcmove` (391 cases: Peach moves, unchanged, negative / tiny values, another body, Postbox spot 7 + all spots, and every placed NPC moved once): same bytes and same read-back.

### 1.15 Donation Shop categories (added 2026-10-08, task S part 4, `loaders/donation-tree.js`, `loaders/donation-window.js`, `edit/donation-ops.js`, `ui/donation-tree.js`, `docs/patches/donation-tree.diff`)

**Where the game reads it.** Only the client: `CWndDonationShop::OnInitialUpdate` (`_Interface/WndDonationShop.cpp:343`) calls `CWndTreeCtrl::LoadTreeScript("DonationShopTree.inc")` (`WndControl.cpp:1029`). `InterpriteScript`: a name, then `{ children }` if the next token's FIRST character is `{`; a list ends on a token whose first character is `}`. So a name starting with `{` or `}` breaks the tree. After a top-level `}`, `LoadTreeScript` skips two tokens. The server never reads the tree; `OnBuyDonationItem` only checks the item is in `DonationShop.inc`. Categories are display only.

**What a click shows.** `OnChildNotify` (`:795`): a category shows rows whose keyword matches its name (any case, `KeywordMatches` `:408`); a group shows the rows of all its categories (`DS_CollectLeafKeywords` `:171`); "All Items" (exact case, `FindTreeElem`) shows everything. A row filed under a group's name shows only under "All Items" (`DS_NO_LEAF`).

**Compiled in C++ (found 2026-10-08).** The order of items in "All Items" and in a group (`DS_SortCmp` Default: category rank, then name) comes from `s_szDonationCatOrder` (`:226`), and the card text from `DS_CategoryBlurb` (`:204`). `ae345504` had to add "Shields" to that list. A new or renamed category sorts last and its items say "A cosmetic weapon skin".
- **The user's choice:** one client patch, `docs/patches/donation-tree.diff` (WndDonationShop.cpp only). It reads the order and each category's top group from the tree when the window opens. An unknown category gets its group's card text (Fashion / Premium / Weapon Skins), else "A Donation Shop item.". The user applies it in FLYFF-V19-SOURCE and builds Neuz once (`git apply --check -p1` passes on HEAD). Without it the editor warns (`DT_PATCH`, `DT_ORDER`).

**The edits** (tree = `Client/Client/DonationShopTree.inc`, LF, tab indent, one name per line; a client-only file the editor now writes, like the rules texts):
- + Category: a name plus optional categories inside it (none = it holds items; one or more = a group: an empty group is read as a category);
- ✎ rename (a category's `DSItem` rows follow, Server + Client copy) and move into another group;
- ✎ add categories inside an entry: a group gets them at its end; a category becomes a group and its items move into the first new one (a group's own name shows no items in game);
- ↑ ↓ among siblings;
- delete: its items move to a chosen category or leave the shop (the user's choice, 2026-10-08).
- When a group loses its last category, its `{ }` lines go too; the delete window offers (ticked) to delete the group with it.
Checks: `DT_ROOT`, `DT_DUP`, `DT_BRACE`, `DT_CHARS` (BLOCK), `DT_PATCH` (WARN), `DT_ORDER` (INFO).

**Simulator:** `tools/dstree-sim.js "Weapon Skins" sort=price-high sex=female patched` (`loaders/donation-window.js`: the click, `BuildFilteredList`, `DS_SortCmp`, `FillGrid` 96 a page + count line, `DS_CategoryBlurb`, with and without the patch). Python copy `oracle_sim.py dstree`:
- 600 window views of the real tree;
- 9 searches and pages;
- a made-up shop (648 views: case ties, no price, sexes);
- 12 small tree files;
- 20 edit scripts: byte-identical files and the same views.
17 planted bugs caught (5 after adding cases). Not modelled: Windows `lstrcmpi` word sort (names with `-` or `'` may order differently), unstable `qsort` ties.

### 1.16 Buying in the Donation Shop (added 2026-10-08, `loaders/donation-buy.js`, `tools/dsbuy-sim.js`, 🛒 Try buying)

Ported from the client's `CWndConfirmBuyDonation` (Neuz `_Interface/WndDonationShop.cpp:38-157`) and the server's `CDPSrvr::OnBuyDonationItem` (`WORLDSERVER/DPSrvr.cpp:3636`), commit `7d7df4f9`.

- **Client:** no chip price (`(int)GetChipCost() < 1`) shows "This item has no donate-chip price set." and the box does not open. The quantity is clamped to 0..9,999 while typing and to 1..9,999 on OK. The box shows `count x price` as a DWORD. OK checks `(int)(count x price) > GetAtItemNum(II_CHP_DONATE)` and shows "More Donate Chips are needed."; otherwise it sends `(item id, (short)count)`.
- **Server**, in this order:
  1. count < 1 is ignored; above 9,999 it becomes 9,999;
  2. an item that is not in `DonationShop.inc` is ignored, with no message;
  3. no item or no price is ignored;
  4. `GetAtItemNum(II_CHP_DONATE) < (int)(price x count)` gives `TID_GAME_LACKCHIP`;
  5. `IsFull` gives `TID_GAME_LACKSPACE`;
  6. chips are taken `0x7fff` at a time;
  7. `CreateItem`.
- `GetAtItemNum` (`Item.h:595`) counts every slot: chips in a locked bag slot or in a trade window still pay.
- The bag check runs **before** the chips are taken, so a chip stack that would run out does not free its slot.
- The new item has flag 0 and `m_bCharged` FALSE (`Item.cpp:223`). It stacks only onto stacks with no flag that are not charged.
- **Overflow (`DS_OVERFLOW`, BLOCK):** both sides compute the total in 32 bits. Above a price of 214,769, buying 9,999 makes `(int)` total negative. The chip check passes, and the server takes only the chips the player has: 9,999 items for 1,000 chips. Read from the C++, not seen in game. The current highest price is 600.
- **Crash items** (`ae345504`): Nexus Shield and Icecrown Purple Shield. Their Spec_Item rows match the safe shields except the icon file and the name, so the data shows no cause. The simulator says CRASH and changes nothing; `DS_CRASH` still blocks.
- Checked against `tools/oracle_sim.py dsbuy` (2,479 buys + 8 edit scripts with byte-identical files). 20 of 21 planted bugs were caught. The 21st, "first catalog row wins", cannot change a purchase: the server only checks that the item is listed.

### 1.17 What each saved change needs: who reads each file, and when (added 2026-10-08, `core/after-save.js`, `io/patch-state.js`)

**Processes.** `Start Server.bat` starts `3. Database.exe` and `7. World.exe` from `Server\Resource` (the other five servers from `Server\Program`, where no resource file lies), then the game (`Client\- Start Game.bat`, which first copies `Source\Output\Neuz\NoGameguard\Neuz.exe`). `Stop Server.bat` kills `Neuz.exe` and all seven servers. `Start Server.bat` also copies `Source\Output\WorldServer\Release\WorldServer.exe` to `7. World.exe`.

**Every file the editor writes is read once, at startup.** No GM command or timer reads them again: `/loadscript` reloads WorldDialog.dll, `/rec` Constant.inc, `/lua` Event.lua / MonsterSkill.lua / RainbowRace; `__S0114_RELOADPRO` ("reload project") is not built.

| File | WorldServer (startup) | DatabaseServer | Game (Neuz) |
|---|---|---|---|
| Spec_Item.txt | `Project.cpp:790 LoadPropItem` | reads it (`databaseserver/Project.cpp:125`) for pack max, parts, piercing; never dwReferValue1 / dwCost | startup, loose `Client/Spec_Item.txt` |
| character.inc | `Project.cpp:796` → `LoadCharacter :3257` | no | startup, loose copy |
| character-etc.inc, character-school.inc | same | no | startup, **no loose copy: data.res** |
| character.txt.txt, etc.txt.txt, textClient.txt.txt | `ProjectCmn.cpp:1256 / 1259 / 1274 LoadStrings` | reads the strings (`LoadPreFiles`) | startup, loose |
| defineNeuz.h, defineText.h | `ProjectCmn.cpp:1373 / 1383 LoadDefines` (names in scripts only) | reads them | startup, loose (names in scripts only; the code's own values are compiled from `Source/Resource/`) |
| etc.inc | `Project.cpp:830 LoadEtc` | no | startup, loose |
| textClient.inc | `ProjectCmn.cpp:1366 LoadText` | reads it | startup, loose |
| Exchange_Script.txt | `Project.cpp:979` → `Exchange.cpp:34 Load_Script` | no | startup, loose (draws the window; the server decides from its own copy) |
| DonationShop.inc | `Project.cpp:932` → `ProjectCmn.cpp:1845` | no | startup, loose (the catalog; the server's copy is the allow-list) |
| BattlePass.inc | `Project.cpp:907` → `ProjectCmn.cpp:1682` | no | startup, loose |
| World/&lt;map&gt;/&lt;map&gt;.dyo | `WorldFile.cpp:297 LoadObject` (`#ifdef __WORLDSERVER :269`); again for each new layer (instances, guild house) | no | **never** |
| Client/Client/DonationShopTree.inc | no | no | **each time the Donation Shop window opens** (`WndDonationShop.cpp:346`; 409 with donation-tree.diff) |
| Client/Client/NpcBoard_&lt;id&gt;.inc | no | no | **each click of the menu**, with `npc-board.diff` built |

The game loads at startup before the login screen (`Neuz.cpp:1589 BeginLoadThread` → `LoadPreFiles :1593`, `OpenProject :1573`); a loose file wins over data.res (`file.cpp:273 CResFile::Open`, `b7645c52`). The servers never send these files' contents to the game: each side reads its own copy. Commits say the same: `08801378` "no rebuild, restart WorldServer and relaunch Neuz", `15091d5f` "the data files need a server restart and client relaunch".

**So, after a save** (`afterSave.compute`):
1. A C++ patch, once: `npc-board.diff` for any rules text, `donation-tree.diff` when the tree has a category the compiled list does not know (`DT_PATCH` / `DT_ORDER`). Both change only Neuz (`_Interface/WndWorld.cpp`, `WndField.*`, `WndDonationShop.cpp`): build the Neuz project, configuration NoGameguard; no server is rebuilt. With FLYFF-V19-SOURCE picked, the editor reads (never writes) those files for a line each patch adds (`NpcBoard_%d.inc`, `DS_LoadTreeOrder`): "in the source" / "not applied". On test-data it can't tell; "I built it into Neuz" is a tickbox remembered in the browser.
2. Any file the WorldServer reads → **Stop Server.bat, then Start Server.bat** (this also restarts the game).
3. Otherwise a file the game reads at startup (or a patch was just built) → restart the game.
4. Otherwise: the Donation Shop tree → close and reopen the window; a rules text → click the menu again.
5. Notes: a shared file whose game copy is not changed (no loose copy, a copy that differs, no Client folder) is named, since the game keeps showing the old one.

**Compiled limits (a rebuild, never a data edit):** `MAX_MOVER_MENU` 350 (`Source/Resource/defineNeuz.h:483`; `Project.h:433 m_abMoverMenu`, `WORLDSERVER/npchecker.h:18`) and `MAX_STRUCTURE` 20 (`defineNeuz.h:93`; `Project.h:1046 m_aStructure`). Neither array is bounds-checked. Raising one means WorldServer (Release) + Neuz (NoGameguard); the DatabaseServer has its own `project.h` and uses neither. New `MMI_` / `TID_MMI_` / `SRT_` names in the Resource copies need no rebuild as long as no C++ code names them.

**Simulator:** `gjs -m tools/aftersave-sim.js character.txt.txt client/donationshoptree.inc codes=DT_PATCH`. Python copy `oracle_sim.py aftersave` (8,141 cases: every file alone × 5 game-copy states × 16 patch states × 4 check sets, every two files in one save, 600 mixed saves; plus a check that the 20 cited C++ lines still say so, before or after a patch moves them). 11 planted bugs caught.

### 1.18 Monster drops: the loader and the kill (added 2026-10-08, task F, `loaders/drops.js`, `loaders/drops-sim.js`, `edit/drops-ops.js`, `ui/drops.js`)
**Loader** `CProject::LoadPropMoverEx` (`_Common/Project.cpp:2978-3255`), on `CScript` (defines resolved):
- Block = `MI_X` then tokens until the first token starting with `}`. `nVal >= m_nMoverPropSize` (highest propMover.txt id + 1, `ProjectCmn.cpp:558`) or `< 0`: `continue` inside the do-while never reads on → **endless loop at startup** (`M_RANGE`). An undefined name reads as 0: slot 0 (`M_UNDEF`). End of file inside a block: `*token` is `\0`, never `}` → endless loop (`M_BRACES`).
- `AI` (strcmpi) → `LoadPropMoverEx_AI` (`ProjectLux.cpp`): `#SCAN` / `#BATTLE` / `#MOVE` sections; an unknown word returns FALSE and **the whole file stops loading** (`M_AI`): every later monster keeps no drops.
- Token-consuming statements: `m_* = n`, `SetEvasion`, `SetRunAway` (two more values only if a `,` follows the first), `SetCallHelper`, `randomItem { }`, `Transform`, `Maxitem = n` (the last one wins), `DropItem`, `DropKind`, `DropGold`. Anything else is skipped one token at a time (`DDropGold` line 47531, `SetLevelDropPanalty_Off`, the 5th/6th values of the 248 six-value lines).
- `DropItem( id, prob, level, number )`: every value via `GetNumber` (MSVC `atoi`: saturates at 2,147,483,647, 518 lines); **the commas are not checked**: `DropItem(II_X 21000000, 0, 1)` reads prob = `atoi(",")` = 0 (`600269aa`). `id` 0: an error is logged and the line is kept → the drop crashes the server (`Mover.cpp:8701` dereferences a NULL prop).
- `DropKind( IK3, a, b )`: a, b read and ignored; rarity window `(short)(level-5) .. (short)(level-2)`, at least 1. `MAX_DROPKIND` is **80** (`ProjectCmn.h:758`; the file's header says 64), checked only by ASSERT. DropItem has no limit (a vector).
- `DropGold( min, max )`: a SEED entry in the same list as the items (prob 0xFFFFFFFF), in file order.
- `DropItem` / `DropKind` / `DropGold` are kept only `#ifdef __WORLDSERVER` (3196 / 3218 / 3234): the game parses the file but keeps no drops, and there is no loose Client copy. A save needs only Stop / Start Server.bat (`core/after-save.js`).
- Then `LoadDropEvent` (`propDropEvent.inc`, `Project.cpp:4013`): ~707 global lines appended after every monster's own lines (`minLv <= dwLevel <= maxLv`), minus `except.txt` "worldDrop = 0" items for LANG_USA / sublang 0; `II_GEN_SKILL_BUFFBREAKER` at half chance outside Korea (commented out in this data).

**Kill** `CMover::DropItem` (`Mover.cpp:8124-8961`), from `DropItemByDied` (the top damage dealer, 8102):
- Rolls per kill `nloop`: 1, +1 Gift Box party mode (or within 255 of the leader), +1 GET01, +2 GET02, + `DST_GIFTBOX`. Fortune Circle sets `bUnique`.
- Each roll: level gap `d = player - monster`: ≤1 100/100, ≤2 80/100, ≤4 60/80, ≤7 30/65, else 10/50 (items % / Penya %); not for MI_CLOCKWORK1 / DEMIAN5 / KEAKOON5 / MUFFRIN5. Gate `xRandom(100) < nProbability × GetItemDropRateFactor` (GM rate × Event.lua `SetItemDropRate`: ×10 now, so it always passes).
- Then every list entry in order: `GetAt` (`Project.cpp:184`): `dwRand = xRandom(3e9); dwRand = (DWORD)(dwRand / GetPieceItemDropRateFactor)` (float32), pass if `dwRand < prob`. **The x10 item rate does not touch the lines.**
- Item (ground): amount `(short)(xRandom(n)+1)` (-1 = 1; **0 = `xRandom(0)` crash**); `GenRandomOptItem` (weapons / armor: `xRandom(i+1)` + `xRandom(3e9)`, 68 `RandomOptItem` entries in the UTF-16 `propItemEtc.inc`); counted lines `nNumber++`; stop when `nNumber == Maxitem`. Flying monsters: into the bag, stop when `nNumber >= Maxitem` (checked after -1 lines too; Maxitem 0 → stops after the first bag drop).
- Penya (roll 0 only): `min + xRandom(max - min)` (**min = max: `xRandom(0)` crash**), `PenyaTable::Roll`, × Penya %, × GM rate, × Event.lua gold (×10), × Anarchy, × `DST_PENYA_RATE`; `CanAdd` → straight into the bag. A DropGold placed below counted lines can be cut off by the Maxitem stop (2 monsters, `M_GOLD_LATE`).
- DropKind: index range of the rarity window in `m_itemKindAry[IK3]` (items by id, exchange-sorted by `dwItemRare`, not stable), uniform pick, `xRandom(11)` start upgrade, down to +0: `expDropLuck[lv][k] × dwCorrectionValue %` vs `xRandom(3e9)` (halved for Fortune Circle when ≤ 10,000,000). A world boss (RANK_SUPER) drops at most one.

**What players really get.** `xRand()` is a full-period 32-bit LCG, and 2^32 is not a multiple of 3e9: the rolls 0 … 1,294,967,295 come twice as often. A line's real chance = `(T + min(T, 1,294,967,296)) / 2^32` with T its first failing roll: **a "10%" line (300,000,000) drops 13.97%; a capped "100%" line 80.15%** (not 71.6%). The editor shows and types these real chances (`FRE.drops.effChance` / `probForChance`), and the per-kill chance including the gate and the Maxitem stop (`dropsSim.exactChances`, a DP over "counted drops so far"; checked against 20,000 simulated kills).

**Edits** (`edit/drops-ops.js`): a new DropItem goes after the monster's last hand-written DropItem (outside the `gen_*.ps1` blocks, which the drop commits put right after DropGold), else after DropGold / Maxitem, else below `{`; it copies that line's indent and CRLF. Values are token-span replaces. A script-made line edited or removed → `M_GEN_EDITED` (the user's choice: editable, with a warning).

**Simulator:** `gjs -m tools/drops-sim.js MI_AIBATT1 kills=10000 show=2`. Python copy `oracle_sim.py drops`: its own readers (propMover.txt / Spec_Item.txt by header columns, defines without commented-out blocks), 761 monsters × 2 seeds × 25 kills + 9 special cases × 400 kills (1,530 cases, every roll identical), 15 loader edge scripts, 3 PenyaTable variants, 2 event files, 13 edit scripts (byte-identical files, sha256). 25 of 29 planted bugs caught; the 4 others cannot change a result (`CanAdd` `>`/`>=` with g > 0, the mode-1 `>`/`>=` tie, expDropLuck row 119/120 (needs rarity 200 at monster level 202+), an indented `{` (none in the data)).

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
