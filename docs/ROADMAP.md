# Roadmap and handoff

_Last updated 2026-10-09 (I part 3, Couple: user-tested and committed; next: K, plan first)._

> **Handoff (2026-10-09) — I. Rates & Buffs part 3 (💞 Couple): user-tested in Brave (all 21 steps) and committed + pushed. START HERE next session: K. Upgrade rates, plan first.** Plan: `/home/kevin/.claude/plans/cheeky-weaving-lake.md`. User decisions: edit all four parts; create a loose `Client/couple.inc`; existing buff tiers only; the buff tiers edited like the Guild / Server Buff (stats, name, icon, description).
> - **New section 💞 Couple** (4 tabs): Time per level (TOTAL points with the time online together, row 22 = end of level 21), Buffs per level (tier per kind, carried rows greyed, ✕ removes a level's own row), Buff tiers (8 cards: 6 stat slots in Spec_Item, name + description in propItem.txt.txt, icon from Client/Item, ✎ Write description from stats), Gifts (+ Add a couple gift / ✎ Edit couple gift / ✕: item, count, male / female / both, bound, time limit).
> - **Found (INVESTIGATION §1.23):** 1 point ≈ 65.4 s both online; row 22 must stay above row 21 or a level 21 couple falls back to level 1 (`CP_EXP_ORDER`); the buffs follow a level-up within a second; all 8 descriptions are wrong (`CP_DESC`).
> - Code: `loaders/couple.js`, `loaders/couple-sim.js`, `edit/couple-ops.js`, `validate/couple.js`, `tools/couple-sim.js`; `rates` module now `editsSpec` + couple.inc / propItem.txt.txt (Server + Client); `Workspace.reparse` re-reads Spec_Item after a propItem.txt.txt edit; After saving knows couple.inc.
> - Python copy `oracle_sim.py couple`: every case agrees; 13 of 16 planted bugs caught (3 cannot change a result). Core 1384 passed; UI harness stage `couple`.
>
> **User's test:** `python3 build.py`, reload, pick `test-data` (+ its Client folder), Rates & Buffs → 💞 Couple.
> 1. Time per level: level 2 2,880 → 1,440: "26.2 h" shows. Row 22 → 129,600 (same as row 21): ⛔ CP_EXP_ORDER; Undo.
> 2. Buffs per level: level 8 Power of Love → tier 2: level 8 gets its own row; level 9 says Attack +5%.
> 3. Gifts: + Add a couple gift: level 3, Red Chip ×5, the female partner, Permanent → Add; ✎ it, ✕ it, Undo.
> 4. Buff tiers: Power of Love tier 1, Attack 3 → 4; ✎ Write description from stats → "Attack +4% while your partner is online."; the icon picture shows (Client/Item).
> 5. Save: couple.inc (+ creates Client/couple.inc), Spec_Item.txt ×2, propItem.txt.txt ×2; After saving = Stop / Start Server.bat.
> 6. By hand: `gjs -m tools/couple-sim.js first=male second=female points=129600`.
> Then commit + push; next: K. Upgrade rates, plan first.

> **Handoff (2026-10-09) — I. Rates & Buffs part 2 (Level-up gifts, Rebirth) + buff stat slots: user-tested in Brave and committed + pushed. START HERE next session: I part 3 (couple buff), plan first.** Also after the test: `RT_STAT_DUP` (same stat twice in a tier), calculator text rounded to 4 decimals, per-tier icons in V19 (Server Buff `c345114c`, Guild Buff 1-5 `c24a2340`, not yet tested in game). Not warned yet: a stat with amount 0. Plan: `/home/kevin/.claude/plans/ead-the-claude-md-files-witty-magpie.md`. User decisions: rebirth tiers 0-Max only (Max not edited), gifts of running events only, new gifts for everyone ("all").
> - **Level-up gifts** (Event.lua SetLevelUpGift, `ratesOps.addGift / setGift / removeGift / setGiftAll`): ladder per running event (item, count, bound, time limit, who, "pays one character" from gifts-sim), + Add a gift (level order), ✎ Edit level-up gift, ✕, "Give to everyone"; events not running greyed. Checks `RT_GIFT_ITEM` (BLOCK), `RT_GIFT_COUNT`, `RT_GIFT_STACK`, `RT_GIFT_DUP`, `RT_GIFT_NEVER` (the real level 121 gift).
> - **Rebirth** (1Rebirth.inc, Server + Client copy): tiers 0-Max, stones (compiled, read-only), EXP × (2 decimals), bonus points (the TOTAL, 3fb37a62), Drop / Penya greyed "not used by the server", one gift per tier (+ Gift / ✎ / ✕). Checks `RT_REB_ROWS`, `RT_REB_GP_DOWN`, `RT_REB_GIFT_DUP`, `RT_REB_GIFT_BAD`. After saving: 1Rebirth.inc = Stop / Start Server.bat (Project.cpp:928). `refresh-fixtures.sh` now copies Client/1Rebirth.inc.
> - **Buff stat slots** (the user, 2026-10-09: "server buff is still just exp", "guild buff can't add stats"): `docs/patches/buff-stats.diff`, applied + committed + pushed in V19 by Claude at the user's request (`43d0b76c`, NOT YET TESTED IN GAME, needs WorldServer + Neuz rebuilt): ServerBuff.txt rows get 5 `dst adj` pairs after the EXP % (every online player gets them: ServerBuffManage::ApplyStatsTo / OnLogin, the GuildBuff way; tooltip lists current + next tier's stats), GuildBuff.txt 5 → 8 pairs. The editor reads both layouts (`FRE.rates.detectSlots`: numbers before the first string of row 1), stat pickers per slot in both (pick = add, "(none)" = remove), + Add tier with stats; the calculator counts a Server Buff EXP stat. Also new: V19 icon `Client/Icon/ServerBuff.png` (`c345114c`).
> - Python copy `oracle_sim.py rates`: + gift rows, 1Rebirth.inc as read (4 files), 16 gift / rebirth edit scripts, both buff layouts (+4 files), 3 stat-slot edit scripts: every case agrees. Core 1284 passed.
>
> **User's test:** `tools/refresh-fixtures.sh test-data`, `python3 build.py`, reload, Rates & Buffs.
> 1. Server Buff: each tier shows 5 stat slots. Tier 1, slot 1: pick STR, amount 5 → toast; pick "(none)" → removed. + Add tier: the form has 5 stats.
> 2. Guild Buff: 8 slots per tier; add a 6th stat on tier 1; ✎ Write description from stats includes it.
> 3. 🧮 calculator: give tier 1 an EXP stat 10 → the factor counts it.
> 4. Save: ServerBuff.txt, GuildBuff.txt (+ Client copy).
> In game later: build WorldServer + Neuz, Stop / Start Server.bat; the buff bar tooltip lists the stats; the character window shows them.

> **Handoff (2026-10-09) — I. Rates & Buffs part 1: user-tested in Brave (all steps + Save) and committed + pushed. START HERE next session: I part 2 (level-up gifts + rebirth tiers), plan first.**
> - **Open question for the user:** more Server Buff stats (PvE, Attack… — today ServerBuff.cpp reads only EXP %) and more than 5 Guild Buff stats (`bonus[5]` compiled) both need C++. A = a patch in docs/patches, B = TODOS later. Not answered yet.
> - After the test: tasks that never add items hide the item list (`noItems: true` on the UI module; only Rates & Buffs today); `refresh-fixtures.sh` copies Client/Icon; a missing icon says "⚠ picture not found". A new Server Buff icon is being drawn by the user (Infinity gold / crystal emblem + arrow + 3 players): later, copy the 32×32 PNG into Client/Icon and pick it. Plan: `/home/kevin/.claude/plans/enchanted-noodling-candy.md` (3 parts; both drop numbers in plain words; rebirth Drop / Penya greyed in part 2).
> - **New task card "Rates & Buffs"** (`MODULES` id `rates`, uses `drops`): left = Server rates · Server Buff · Guild Buff · 🧮 Rate calculator. Event.lua: every event with its dates and its 5 rates (EXP ×, Penya ×, Drop roll gate ×, Item chance ×, Weather bonus ×); a rate that is not set yet is added as a new `Set…( n )` line. Server Buff: table + "+ Add tier". Guild Buff: a card per tier, 5 stats picked by name (written as numbers), "✎ Write description from stats" (gives the file's own texts back exactly), "+ Add tier". Calculator: monster, player level, job (Master / Hero ÷2), rebirth, Server / Guild Buff tier (or from online counts), scrolls, gear EXP, weather → every step of the EXP factor, EXP / Penya per kill, each item's chance.
> - **Found (INVESTIGATION §1.22):** an unknown function or a `Set…` before `AddEvent` makes Event.lua fail = every rate ×1 and no level-up gifts (`RT_LUA_ERROR`); a buff file that ends before `}` hangs the WorldServer (`RT_NO_CLOSE`); the buff names reach the game cut at 127 / 255 / 63 characters; Event.lua can be reloaded live from the DatabaseServer menu "Apply now". Monster EXP and the EXP cap are 64-bit (`Script.getInt64`, `propmover.exp`).
> - Also: the "Where is this item from?" card is now **Item Sources & Uses** (the user, 2026-10-09). The UI harness shows its result box whenever a stage fails.
> - Python copy `oracle_sim.py rates`: every case agrees (see CLAUDE.md table). Tool: `gjs -m tools/rates-sim.js MI_AIBATT1 level=3 online=40 glv=20 gon=10 weather`, `… tiers`.
>
> **User's test:** run `tools/refresh-fixtures.sh test-data` (new: ServerBuff.txt, GuildBuff.txt + its Client copy) and `python3 build.py`, reload, pick `test-data`, card **Rates & Buffs**.
> 1. Server rates: EXP ×30, Penya ×10, gate ×10, item chance ×1 (empty box), weather ×1.5; the two drop numbers are explained.
> 2. Server Rates event: EXP 30 → 40 (the list says ×40). Item chance: type 2 → a `SetPieceItemDropRate( 2 )` line. Gate 20 → ⚠ "changes nothing"; Undo.
> 3. 🧮 Rate calculator, Small Aibatt: EXP factor ×40, the steps, EXP per kill 80, Penya 120 - 130, Twinkle Stone 27.94% (was 13.97% at ×1).
> 4. Server Buff: + Add tier → tier 21, 210 players, +105% → Add. Change a name; pick an icon (the list of Client/Icon).
> 5. Guild Buff tier 1: All Stat 10 → 12 → ⚠ the description does not match → ✎ Write description from stats → Apply changes.
> 6. Save once: the backup holds Event.lua, ServerBuff.txt, GuildBuff.txt (+ Client copy); After saving says Stop / Start Server.bat.
> 7. Start screen: the card says "Item Sources & Uses".
> Then commit + push; next: part 2 (level-up gifts + rebirth).

> **Handoff (2026-10-09) — Boxes: filter by what's inside: user-tested in Brave and committed + pushed. Next: I. Rates & Buffs, plan first.** Plan: `/home/kevin/.claude/plans/enchanted-noodling-candy.md`.
> - A second, searchable filter under "All boxes": "Holds Fashion (610)", its parts (Hats, Masks, …), every group of `loaders/item-category.js`. A box matches when at least one item inside is in that group; a box given by a box counts as "Boxes & sets". Counts follow the first filter. `FRE.itemCategory.holds` / `ofId`. UI only: no file written, no simulator.
> - Also: every task now opens with an empty search box (it used to remember the last text; the user's test, step 10).
> - C++ research for I is done (see the I section below for the earlier notes; new findings to put in the plan: rebirth fDropRate / fPenyaRate are parsed but never used; `SetItemDropRate` only scales the gate roll, so above 10 it changes nothing; the Server Buff EXP % is added, not multiplied (MoverParam.cpp:4615-4617); the couple buff is re-applied at the new level within a second (couplehelper.cpp:277, 286); GuildBuff.txt is read with atoi, so DSTs must be numbers).


> **Handoff (2026-10-09) — H. "Where is this item from?" part 2: user-tested in Brave (all 6 steps OK, incl. "Read from the C++ in FLYFF-V19-SOURCE" on the real folder, no ⚠) and committed + pushed. Next: Boxes filter by what's inside, then I.** Plan: `/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-cheerful-cocoa.md`. User decisions: no quest rewards and no collecting for now; no Guild Siege per-kill prize (none exists: a kill gives points only); read-only (editing gifts comes with task I); the Guild Siege amounts are read from the C++ when FLYFF-V19-SOURCE is picked.
> - **New sections on the item page:** 🎂 Level-up gift (level, count, bound / time limit, who, how often per character and per rebirth), ♻️ Rebirth gift, 💞 Couple gift (couple level, who: male / female / both, by mail), 🏰 Guild Siege after each siege (Red Chips per online lineup member for ranks 1-3, by the number of guilds that applied) and every week (guild bank / Total / each class / MVP ladders).
> - **Found (INVESTIGATION §1.21):** the level 121 gift (Pet Dog) is never given: Master → Hero sets the level with InitLevel (`W_GIFT_NEVER`); the 75 / 90 / 105 gifts come twice before the first rebirth and once more per rebirth (`W_GIFT_REPEAT`); the per-siege chips grow with every guild that applied (63 / 18 / 9 per guild); the weekly guild chips are lost when the guild bank is full.
> - Code: `loaders/gifts.js` (readers + the C++ numbers), `loaders/gifts-sim.js` (a character's life, a couple, a siege, the weekly payout), `io/source-read.js` (reads the two .cpp, read-only), `where.js` / `ui/where.js` (new kinds and checks), `tools/gifts-sim.js`. Fixtures: + 1Rebirth.inc, couple.inc, GuildCombat.txt (+ the two .cpp in fixtures/src).
> - Python copy `oracle_sim.py gifts` (6 file variants: lives, couples, sieges, weekly payouts, made-up files) + `where` facts for the new kinds; every case agrees; 27 of 29 planted bugs caught. Tests: core 1232, UI harness 425 (new stage `wheregifts`).
>
> **User's test:** run `tools/refresh-fixtures.sh test-data` (new: 1Rebirth.inc, couple.inc, GuildCombat.txt) and `python3 build.py`, reload, pick `test-data`, card **Where is this item from?**
> 1. Christmas Cake (`II_SYS_SYS_EVE_CHRISTMASCAKE01`): 🎂 level 105 ×3, bound, "2 times per character, +1 after every rebirth", and the ⓘ note.
> 2. Pet Dog (`II_PET_DOG1`): level 15 (7 days, once) and level 121 "never given" with the ⚠.
> 3. Cloak of Bravery (`II_ARM_S_CLO_CLO_SPIRIT_1`): ♻️ rebirth 20.
> 4. Wedding Bridegroom Set Box(M) (`II_SYS_SYS_SCR_BXMWED01_1`): 💞 couple level 21, the male partner, bound, 14 days, by mail.
> 5. Red Chips: 🏰 the per-siege table (3 guilds: 189 / 54 / 27 each) and the weekly ladders; the note says "the editor's own copy".
> 6. Pick FLYFF-V19-SOURCE (real folder, nothing is written), same task, Red Chips: the note says "Read from the C++ in FLYFF-V19-SOURCE".
> 7. By hand: `gjs -m tools/gifts-sim.js life rebirths=2`, `couple`, `siege n=5`.
> Then commit + push; next: Boxes filter by what's inside, then I.

> **Handoff (2026-10-09) — H. "Where is this item from?" part 1: user-tested in Brave and committed + pushed (`54406b5`). Next: H part 2 (quests, level-up / rebirth / couple gifts, collecting, Guild Siege prizes), plan first.** Plan: `/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-quiet-tulip.md`. User decisions: 2 parts; a new start card.
> - **New task card "Where is this item from?"** (`MODULES` id `where`, read-only: every model parsed, maps read, nothing editable; Client/Model is not listed for it). Pick an item (search on the left, or + on the right); the page lists: 🛒 NPC shops (price players pay, tab, town, "not in the game" when unplaced / hidden, "auto" for rule items), 💎 Donation Shop, 🔁 exchange rewards (who, costs, chance per exchange), ⚔️ monsters (in % of kills), 🎉 propDropEvent.inc extra drops (per monster), 🎲 random gear (DropKind, per item), 🎁 random boxes, 📦 sets, 🏆 Battle Pass levels, 🔧 the exchanges that take it, and "Opening it gives …" for a box. Checks: can't be obtained in game, an AddShopItem price set server-wide, Donation crash items. Every line: **Open in NPC Shops / Monster Drops / Boxes / Donation Shop / Battle Pass** (the task opens at that NPC / monster / box; coming back shows the same item).
> - **New exact maths** (INVESTIGATION §1.20): PAY n ≥ 2 reward chance (`where.payChances`, every GetPayItemList pick sequence, modulo-biased rolls) and DropKind per item (`where.kindChances`). **Bug fixed in `dropsSim.exactChances`** (also what Monster Drops shows): without a Maxitem line the first uncounted drop stops the list on the ground (`nNumber == m_dwMax`, Mover.cpp:8714); e.g. MI_MINECATCHER's lines were shown too high.
> - Also: NpcBoard rules files are editable only in NPC Shops (they were added as editable in every task).
> - Python copy `oracle_sim.py where`: 5,038 items + 50 without a source + 5 made-up file cases, every fact agrees; 17 of 18 planted bugs caught. Tool: `gjs -m tools/where-sim.js <II_ item>`. Tests: core 1155 (+24: the where section), UI harness 420 (new stage `where`; 6 start cards).
> - **User's Brave test 2026-10-09:** steps 1-7 OK. Found: Gricky Gauntlet (DropKind only) was in "Items nothing gives or uses" and said "nothing gives it": the list index skipped DropKind. Fixed (DropKind chances worked out once when the task opens, +~90 ms); test: the index = the items the Python copy finds (5,038).
>
> **User's test:** `python3 build.py`, reload, pick `test-data`, card **Where is this item from?**
> 1. Type `awake` on the left, click Scroll of Awakening: 🛒 Peach and Raia, 100,000 Penya, "auto", their towns; a random box (Faded Box 2%) and a set (Scroll of Reversion Box ×10).
> 2. Right item list: search Red Chips, press **+**: 🏆 5 Battle Pass levels, ⚔️ the monsters with % of kills, the 2 Secret Room Manager shops.
> 3. Name Color Scroll (3 Days): 🔁 Collins, exchange 1, 100% per exchange, with the five pieces it costs. Topaz Piece: 🔧 used in 5 Collins exchanges.
> 4. Sword of BoBoKu: 🎉 extra drop from 46 monsters of level 10–20. Gricky Gauntlet: 🎲 random gear from 6 monsters ("one of 16").
> 5. Scroll of Reversion Box: "Opening it gives everything in it".
> 6. Pick an item nothing gives (filter "Items nothing gives or uses"): "Can't be obtained in game".
> 7. On Scroll of Awakening press **Open in NPC Shops**: NPC Shops opens on that NPC; Change task → Where is this item from?: the same item is shown.
> Then commit + push; next: H part 2 (quests, level-up / rebirth / couple gifts, collecting, Guild Siege prizes), plan first.

> **Handoff (2026-10-09) — V. Save History is SKIPPED (the user's decision). Next: H. "Where is this item from?" (plan first).**
> - Why: every Save already writes a verified backup (`<backups>/<stamp>_<task>/`), the real files are in the FLYFF-V19-SOURCE git repo (each tested change is committed and pushed, so `git diff` / `git revert <hash>` give history and per-save undo), and Ctrl+Z covers unsaved work. The History screen + 3-way undo would have been the largest task so far for a rare case.
> - What stays from V: step 0 (paste /position + Face toward, key from region + name) and step 0b (loading window), both committed (`85012df`). The part 1 plan (`/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-quiet-tulip.md`) is kept only as a reference; no code was written for it.

> **Handoff (2026-10-09, V step 0 + 0b) — user-tested in Brave and committed + pushed (`85012df`). Next: V part 1 (History screen, read-only).** Plan: `/home/kevin/.claude/plans/cozy-tinkering-hearth.md` (V. Save History: step 0, 0b, then part 1 History screen read-only, then part 2 Undo this save / Go back; user decisions: 2 parts, 🕘 History button in each task, undo = one pending edit + the normal Save, full plain words for old saves).
> - **In-game news (user, 2026-10-08):** the new NPC stands in game; Trade, Exchange and Rules text menus work (TODOS Done). Its spot / facing were hard to get right.
> - **Step 0 — Paste from the game** (`ui/npc-place.js`, in + NPC and 📍 Change position / model): paste the `/position` chat line ("Position : x = …, y = …, z = …", `FuncTextCmd.cpp:3955`) → x y z filled; **Face toward**: paste a second line from where players stand → the facing (`GetDegree`, `Obj.h:288`; 0 = toward -z, 90 = +x). `npcEditOps.parsePosition` / `faceToward`; Python copy in `oracle_sim.py npcmove` (`pos`); INVESTIGATION §1.14.
> - **Step 0b — Loading window** (`FRE.dom.progress`, `ui/app.js` loadTask / useRoot): the clicked card says Loading…, the others grey out; the window shows the phase (Server/Resource files n / N, the Client copies, Client/Model and Model/Texture names (~19,000 on the real client: likely the slow part), the maps); the toast gives the time and the slowest phase, every phase in the console (`[load]`).
> - **User's Brave test 2026-10-09:** loading window OK (real folder 1.6 s, slowest = the maps 444 ms: no speed-up needed); paste + Face toward OK in 📍 and + NPC.
> - **Then (the user's idea): the + NPC key is made from the region + the name** (`newNpcSim.keyPrefix`: the key start most NPCs there use, e.g. Flaris `MaFl_` 83, Saint Morning `MaSa_`, Darkon `MaDa_`, Kaillun `MaEw_`; else the map's; else none) + `keyFrom` (letters, digits, _; 31 max). Typing the key stops it ("Typed by hand", **↺ From region + name**).
> - Tests: core 1131 (npcmove pos cases agree; key starts), UI harness 410 (new checks in `loaded` and `newnpcform`; new stage `pospaste`).
>
> **User's test:** `python3 build.py`, reload.
> 1. Pick FLYFF-V19-SOURCE (real folder; nothing is written), click NPC Shops: the card says Loading…, the window shows each phase with counts. The toast says the time and the slowest phase: tell Claude which one (and the time).
> 2. test-data → NPC Shops → Peach → 📍 Change position / model. Paste `Position : x = 6934.68, y = 100.000000, z = 3223.02` into "Paste from the game": x y z fill in. Paste `hello`: ⛔.
> 3. Paste `Position : x = 6939.68, y = 100, z = 3223.02` into "Face toward": Facing 90°, the preview says facing → 90°. Apply, Undo.
> 4. In game later: stand where players should talk to the NPC, `/pos`, paste into Face toward.
> 5. + NPC: type a name → the key fills as `MaFl_<name>`; pick Saint Morning → `MaSa_<name>`; type in the key → "Typed by hand" + ↺.
> Then commit + push; next: V part 1.

> **Handoff (2026-10-09) — J part 2 (+ New box, ✎ Edit box settings) is user-tested in Brave (all 7 steps + Save) and committed + pushed. Next: V. Save History, plan first.** After the first test the forms also show the picked item's full tooltip (stats, effects, editor info): under the item in + Add an item, and for the last picked row in + New box (hover an icon for the others; the user is fine with that).
> Earlier: **J part 2 built** Plan: `/home/kevin/.claude/plans/hazy-beaming-leaf.md`. The in-game test of the 8 waiting items is the user's, with `FLYFF-SOURCES-EDIT-GUIDES/SOURCES DOCUMENTATION/RESOURCE-EDITOR-IN-GAME-TEST.md`; results come back later.
> - **+ New box** (Boxes task, next to the search): name, Random (1 of N, chances kept at 100%) or Everything inside (time limit for every item), the items (count with "max N", bound, time limit, +N), the look (a searchable combo of the 65 box icons that have a ground model, the icon at 3× and the box in a bag slot with its in-game tooltip), shop price (sells back for 1/4), can be traded, stack size, description (default "Gives one of: …" / "Contains: …"). **🎲 Try it** opens the planned box N times before Create (scratch copies read by the real loaders). **Create box** = one undo step over defineItem.h, Spec_Item.txt, propItem.txt.txt, mdlDyna.inc and propGiftbox.inc / propPackItem.inc (Server + Client). The new box is selected; the preview gives `/createitem <id> 1`.
> - **✎ Edit box settings** (under every box's title): price, can be traded, stack size on its Spec_Item row; IK3_BINDS / EVENTMAIN boxes say they are always bound.
> - Written the `949f2cc2` way + an mdlDyna line (INVESTIGATION §1.19): id 31671 next, keys 017062/3, template row `II_SYS_SYS_SCR_BXMCOOK01`. New checks: `BX_EMPTY`, `BX_ID_RANGE`, `BX_TEMPLATE_MISSING` (form), `BX_MODEL_DUP` (BLOCK, workspace). After saving: Stop / Start Server.bat (defineItem.h, propItem.txt.txt, mdlDyna.inc added to `core/after-save.js` + Python `aftersave`, with their C++ lines).
> - Simulator: `gjs -m tools/boxes-sim.js --new=tools/newbox-example.json n=2000`. Python copy `oracle_sim.py newbox` (21 cases); 22 of 22 planted bugs caught. Tests: core 1122, UI harness 396 (new stages `newbox`, `boxsettings`).
>
> **User's test:** run `tools/refresh-fixtures.sh test-data` (new: the Client copies of defineItem.h, propItem.txt.txt, mdlDyna.inc) and `python3 build.py`, reload, pick `test-data`, task **Boxes**.
> 1. **+ New box**: Create is greyed. Type a name, pick Moonstone, pick the look "Box of Lucky": the picture, the bag slot and the tooltip show; the preview lists the five files and `/createitem 31671 1`.
> 2. + Add an item twice, type 50 in a chance: the others share the rest, Total 100%. Tick Bound on one, give one 7 days, +3 on a weapon.
> 3. 🎲 Try it → Run: the rates match the chances; nothing is "not saved".
> 4. Create box: one toast, the box is selected in the list, Undo removes it from every file. Redo.
> 5. Switch to Everything inside on a second box with 2 items and 30 minutes → Create.
> 6. ✎ Edit box settings on the new box: untick Can be traded → Apply → "cannot be traded". On Box of Change: price 1000 → "sells back for 250".
> 7. Save once: the backup holds the six files (+ Client copies); After saving says Stop / Start Server.bat.
> Then commit + push, TODOS → Waiting for the in-game test (+ item 9 in the in-game guide).

> **Handoff (2026-10-08, night) — START HERE: next session = a step-by-step IN-GAME test of everything in TODOS "Waiting for the in-game test"** (the user has time on the Windows PC). J part 1 (Boxes) is user-tested in Brave and committed + pushed. J part 2 (+ New box) waits until after the in-game session.
> - **The steps are written out:** `FLYFF-SOURCES-EDIT-GUIDES/SOURCES DOCUMENTATION/RESOURCE-EDITOR-IN-GAME-TEST.md` (2026-10-08: setup, GM commands, per item the editor clicks, the "After saving" check, the in-game checks with numbers from the simulators, the undo line, a results table). The user runs it alone on Windows and brings back the results + error lines.
> - **How to run the session:** one item at a time, in the order below. For each: what to do in the editor (on the REAL folder: the user picks FLYFF-V19-SOURCE in the editor and saves; ask before any step that writes the real Server/Resource), what to build / restart (the "After saving" list), what to do in game, and what to look for (incl. `Server/error_*.txt`, `eh_*.log`). Record each result; move passed items to TODOS "Done", keep failures in the table with what was seen, and fix in the editor afterwards.
> - **Build once first:** Neuz (project Neuz, configuration NoGameguard) — both client patches are already in V19 (`89796d4e`, "not yet tested in game"). Then Stop Server.bat / Start Server.bat after every save.
> - **Items, in order** (details: TODOS table, and each task's handoff below):
>   1. Add NPC step 1 (`7cbb9c9`): the new NPC stands where placed; its shop sells the right items; `[tag]` above the name and the minimap icon.
>   2. Add NPC step 2 (`11541cd`): exchange NPCs, Jeff's Weapon Pieces menus (test-data only so far: apply `tools/jeff-menus.json` to the real folder only after asking).
>   3. Rules text menus (`376f694`, npc-board.diff): click the menu, the window shows the text.
>   4. Donation Shop categories (`f1d404b`, donation-tree.diff): new category sorts in tree order, card text fits.
>   5. Donation Shop buying (`77cc6d7`): buying acts as the simulator says (chips, bag full, 214,769 limit).
>   6. Monster drops (`297a1c0`): kill the edited monster; the drop comes at about the shown rate.
>   7. Save says what each change needs (`7531898`): after each save, doing what the list says is enough.
>   8. **Boxes part 1 (this commit):** edit a random box and a set, Save, restart; `/createitem <numeric box id>`, open it: the items, counts, bound flag, time limit (7 days / 30 minutes) and +N match; a full bag refuses; a set needs one free slot per item.
> - Part 1 extras after the user's Brave test (2026-10-08): "Amount" renamed **Count** ("how many they get"); time limits typed as a number + **minutes / hours / days** (decimals: 0.5 hours = 30 min; `FRE.dom.durationInput`, the unit stays what was typed); in + Add an item the time limit is **required** (empty until typed, **Permanent** button = 0); 0 reads "permanent (no time limit)".
>
> **Handoff (2026-10-08, evening) — J part 1 (Boxes: view and edit the existing random boxes and sets): user-tested in Brave and committed.** Plan: `/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-fluttering-taco.md`. Next after the OK: commit + push, TODOS → Waiting for the in-game test, then **J part 2** (+ New box: the box item, look picker with the picture, price / trade / stack settings).
> - **New task card "Boxes"** (`MODULES` id `boxes`; `propGiftbox.inc` + `propPackItem.inc` editable, Client copy of the set file):
>   - left: every box with its icon (from Client/Item), searchable; filter All / Random boxes / Sets / With problems / Edited;
>   - random box: chance in % (always 100% in total; the others move in proportion), what players really get, amount (max = stack size), bound, time limit, +N, ✕, "Same chance for all"; the box's line format widens by itself when needed (toast);
>   - set: time limit for every item, amount, +N, ✕;
>   - **+ Add an item** (standard form), **🎲 Open it N times** (free slots, box bound / timed / locked / expired, trading, "already holds 1 of each": what the player reads, rates, lost items, stacks), **Remove contents…** (⚠, the item stays: `BX_EMPTIED`).
> - **User decisions (2026-10-08):** 2 parts; a new box gets an `mdlDyna.inc` line copied from a box with the same look, and the look picker lists only looks that have one (65 of 66); no fashion-set helper; "remove" = contents only; the look shows like the + NPC model picker (combo + picture).
> - **Found in the C++ (INVESTIGATION §1.19):** the set is checked before the random box; the random box is used up before the item is made; stacking compares id, flag and bCharged only (a timed / upgraded item that lands on a stack takes the stack's); `dwFlag` "=" means 0 after `OnAfterLoadPropItem` (both copies first got this wrong: every "=" box looked bound); 98 of 829 sets are bound boxes; 101 lines ask for more than a slot holds (WARN; BLOCK when typed in the editor).
> - Checks: BX_TOO_MANY, BX_PACK_TOO_MANY, BX_BOTH, BX_UNDEF, BX_NO_PROP, BX_BRACES, BX_NUM_ZERO (BLOCK); BX_NUM_STACK (101 WARN, BLOCK when edited), BX_OVER_100 (7), BX_DUP, BX_NOT_ITEM, BX_SKIPPED, BX_EMPTIED (WARN); BX_UNDER_100 (13, INFO).
> - Simulator: `gjs -m tools/boxes-sim.js II_SYS_SYS_SCR_BXPIG n=10000` (`free=`, `bound`, `keep=`, `locked`, `expired`, `trading`, `have`, `show=`). Python copy `oracle_sim.py boxes` + `dds`. 21 of 22 planted bugs caught. Tests: core all pass (new boxes section), UI harness 380 (new stages `boxes`, `boxesopen`; 5 task cards).
>
> **User's test:** run `tools/refresh-fixtures.sh test-data` (new: propGiftbox.inc, propPackItem.inc + Client copy, Client/Item icons) and `python3 build.py`, reload, pick `test-data`, task **Boxes**.
> 1. The list shows icons. Search "Potion Box" (II_SYS_SYS_EVE_POTION): 15 items, Total 100%.
> 2. Type 30 in the first chance (no click): the others shrink, the total stays 100%. Undo.
> 3. Type 10080 in a time limit: toast "line format was widened to GiftBox4", "7 days" under it. Undo.
> 4. + Add an item → Moonstone → the preview shows the line → Add. 🎲 Open it N times → Run; set Free bag slots 0 → "bag full".
> 5. Golden Lucky Pig (BXPIG, 102%): "Players get" differs from the chances; the ⚠ explains it.
> 6. A set (Box of Change, II_SYS_SYS_SCR_BXCHANGE): change the time limit, + Add an item, Remove contents… (⚠). Undo all.
> 7. Save once: the backup holds `propGiftbox.inc` / `propPackItem.inc` (+ Client copy); After saving says "Run Stop Server.bat, then Start Server.bat" (a set change also restarts the game copy).
> Then commit + push.
>
> **Handoff (2026-10-08, afternoon) — F (Monster Drops) is user-tested in Brave (all 6 steps + the typing fix) and committed + pushed.** Plan: `/home/kevin/.claude/plans/warm-humming-swan.md`. Next: J (boxes), plan first. In game later (Windows): Stop/Start Server.bat, kill the edited monster.
> - After the first test: typing in one box now folds into one undo step (`typed()` → `ctx.editGroup` mergeKey per field; the label keeps "was <old value>"). UI harness 367.
> - **New task card "Monster Drops"** (`MODULES` id `drops`; `propMoverEx.inc` editable; propDropEvent.inc, except.txt, PenyaTable.txt, expTable.inc, Event.lua, propItemEtc.inc read-only). Left: every monster with a block (filters: giants and bosses, with problems, edited, with script-made drops). Right: max items per kill, Penya (DropGold + what players really get from PenyaTable × rates), the drop table (real chance typed in %, per-kill chance with the Maxitem stop, amount "not counted" / 1 to N, +N, ✕, script tag), random gear (DropKind: + / ✕), the event drops (read-only, folded), problems. **+ Add a drop** (standard form: item, chance, amount, +N; checks; the line written + "players get it in x% of kills"). **🎲 Kill it N times** (kills, player level, rolls per kill, Fortune Circle, map, seed). Each edit is one undo step with a plain label ("Small Aibatt: added Red Chips as a drop (4.9%)").
> - **User decisions (2026-10-08):** script-made lines editable with a ⚠ (`M_GEN_EDITED`, only for lines changed since loading); trust the C++ on capped chances; monsters only (item side + bulk → task H).
> - **Found in the C++ (INVESTIGATION §1.18):** `xRand() % 3e9` is biased, so a "10%" line drops 13.97% and the capped "100%" 80.15% (not the 71.6% the docs said; the question to the user used 71.58%); the editor shows and types real chances. MAX_DROPKIND is 80 (the file header says 64); DropItem has no limit. Amount 0 and DropGold(n, n) crash the server; the commas are never checked (`600269aa`); a broken AI {} stops the whole file. `propItemEtc.inc` is UTF-16 and holds 68 RandomOptItem entries, so weapon / armor drops consume extra rolls. The game keeps no drop lines (`#ifdef __WORLDSERVER`): After saving says only Stop / Start Server.bat.
> - Checks: M_RANGE, M_UNDEF, M_BRACES, M_AI, M_COMMA, M_DROP_UNDEF, M_COUNT_ZERO, M_GOLD_RANGE, M_KIND_MAX (BLOCK); M_PROB_OVERFLOW (518), M_DUP, M_NO_MOVER, M_GOLD_LATE (2), M_GEN_EDITED, M_PROB_ZERO (WARN); M_EXTRA_ARGS (248), M_NO_GOLD (82) (INFO).
> - Simulator: `gjs -m tools/drops-sim.js MI_AIBATT1 kills=10000 show=2`. Python copy `oracle_sim.py drops` (1,530 kill cases, every roll identical; 15 loader scripts; 3 PenyaTable variants; 2 event files; 13 edit scripts byte-identical). 25 of 29 planted bugs caught (4 cannot change a result). Tests: core 1081 + the drops section, UI harness 366 (new stages `drops`, `dropskill`, `dropsgen`).
> - Side finding (not fixed, other tasks): the shared `defines()` helper in `tools/oracle_sim.py` does not skip `/* */` comments (defineObj.h:1852-1921 holds an old MI_ list, so 4 MI_ ids differ). The drops copy has its own `dr_defines`.
>
> **User's test:** run `tools/refresh-fixtures.sh test-data` (6 new read-only files) and `python3 build.py`, reload, pick `test-data`, task **Monster Drops**.
> 1. Small Aibatt: 2 drops at 13.9698% (the file says 300,000,000 = "10%"). Penya 120 - 130 from PenyaTable.txt.
> 2. + Add a drop → Red Chips, 5 → the preview shows the line and "4.9% of kills" → Add. Undo.
> 3. Change a chance to 20; untick "not counted" / set 1 to 3; ✕ a line; change Max items per kill and DropGold. Undo each.
> 4. 🎲 Kill it N times → Run with 10,000 kills: the % column matches the table.
> 5. Giant Syliaca: change a [BossDrop] line → ⚠ "gen_boss_drops.ps1 … undoes this edit".
> 6. Save once: the backup holds `propMoverEx.inc`; After saving says "Run Stop Server.bat, then Start Server.bat" only.
> Then commit + push.
>
> **Handoff (2026-10-08, after midnight) — START HERE: "Save says what each change needs" is built, user-tested in Brave (A-D: tab price, new category, rules text, moved NPC) and committed + pushed.** Plan: `/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-binary-valley.md`. Next: F (monster drops), plan first; then J (boxes).
> - **Research (INVESTIGATION §1.17):** every file the editor writes is read once, at startup, by the WorldServer (and the DatabaseServer for Spec_Item / strings / defines, never the fields the editor changes) and by the game from its own Client/ copy; no GM command reloads them. The game never reads `.dyo` (`WorldFile.cpp:269-382` is `#ifdef __WORLDSERVER`; §1.14 corrected). DonationShopTree.inc is read each time the Donation Shop window opens; NpcBoard_<id>.inc on each menu click (with npc-board.diff). Stop Server.bat closes Neuz too; Start Server.bat starts the game and copies `Source\Output\Neuz\NoGameguard\Neuz.exe`. Both patches are Neuz-only.
> - **Review + Saved windows: "After saving: what players need to see it"** (`core/after-save.js` `compute` / `forWorkspace`, `ui/app.js` `afterSaveBox`): 1. C++ (once): `git apply …` + build Neuz (NoGameguard), or "already in the source: build Neuz if not since" (`io/patch-state.js` reads `Source/Source/_Interface/WndWorld.cpp` / `WndDonationShop.cpp` read-only for `NpcBoard_%d.inc` / `DS_LoadTreeOrder` when FLYFF-V19-SOURCE is picked); "I built it into Neuz" tickbox (localStorage) unless the source says "not applied". 2. "Run Stop Server.bat, then Start Server.bat" (the user's wording choice), else "Close the game and start it again", else "reopen the Donation Shop window" / "click the rules menu again". "Each change (n)" lists every undo step with its needs and reasons; notes for a game copy that is not changed (data.res, differs, no Client folder). The toast says "Saved. Next: …". The fixed "Restart the WorldServer to apply" is gone (banners, Battle Pass texts). `NM_ID_FULL` / `NN_TAG_FULL` help names what to rebuild (WorldServer Release + Neuz NoGameguard; not the DatabaseServer).
> - **Both patches applied in FLYFF-V19-SOURCE** at the user's request (2026-10-08, a one-off exception to "reference-only"; committed there as "not yet tested in game"). The user builds Neuz (NoGameguard) on Windows once, then Stop/Start Server.bat.
> - Simulator: `gjs -m tools/aftersave-sim.js character.txt.txt client/donationshoptree.inc codes=DT_PATCH`. Python copy `oracle_sim.py aftersave` (8,141 cases + the 20 cited C++ lines still say so). 11 planted bugs caught (the step order one only after adding every two files in one save). Tests: core 1049, UI harness 350 (review / Saved checks in the first save, tree tickbox in `dstree`).
> - User's test E (not done yet): pick FLYFF-V19-SOURCE, make a rules text, Save → the C++ step says "already in the source" with the tickbox; Cancel, Undo.
>
> **Handoff (2026-10-08, late night) — START HERE: "Try it" inside the exchange forms is user-tested in Brave (all of A-F) and committed + pushed (`30ad400`). Next: request 2 below ("what to do after saving" per change): research who reads each file, then plan mode.** Plan: `/home/kevin/.claude/plans/read-claude-md-in-flyff-resource-editor-eager-kay.md`. Next after the OK: request 2 below ("what to do after saving" per change), plan first.
> - Every exchange card in **+ Menu → Exchange**, the Exchange part of **+ NPC**, and the ⇄ tab's **+ New exchange** has **Try it** (greyed until the card has a cost and a reward). It opens the same Try window as the ⇄ tab's cards, on top of the form; Close returns to the form.
> - It runs on exactly what Create would write: `menuOps.tryTable` splices the plan (`newMenusPlan` / `addSetsPlan`) into a scratch copy of Exchange_Script.txt, loads it with the real loader (new `MMI_` names defined), and shows the new success / failure texts. No file, define or undo step changes. Before the form is complete, a missing label / taken name get stand-ins ("no label yet", `MMI_TRY_n`). The card's ⛔ problems show at the top of the window.
> - Tests: core 1015 (the scratch load gives the same presses as Python's `newmenu` for every case; Collins + New exchange: same results before and after Add, 3 seeds × 2 bag modes), UI harness 342 (new stage `mftry`). 3 planted bugs in `tryTable` caught. `gjs -m tools/menu-sim.js` now prints "Try it before Create: 61 of 61 give the same result as after Create".
>
> **User's test:** `python3 build.py`, reload, pick `test-data`, NPC Shops.
> 1. Lui → + Menu → Exchange: Try it is greyed on the empty card. Add a cost and a reward (no label yet) → Try it → "1,000 exchanged", "Taken from the player". Close: the form is unchanged and no "not saved" note appears.
> 2. Add a 2nd reward and type 70 → Try it: Chance set 70% / 30%, "Got in this run" near it. Empty bag slots 0 → "refused: bag full".
> 3. + NPC, tick Exchange, fill a card → Try it.
> 4. Collins → ⇄ tab → + New exchange → fill a card → Try it: the title says exchange N+1 "not added yet".
> Then commit + push.
>
> **Handoff (2026-10-08, night) — the Donation Shop buy simulator is user-tested in Brave and committed (`77cc6d7`, not pushed).** Next: the two requests below, plan first. Plan: `/home/kevin/.claude/plans/joyful-petting-sunrise.md`.
> - `loaders/donation-buy.js` ports the client's confirm box (`CWndConfirmBuyDonation`) and `CDPSrvr::OnBuyDonationItem`. It reuses the exchange simulator's bag code: `bagIsFull` was split out of `createItem`, and `createItem` takes the new item's `charged`. The exchange results are unchanged.
> - **Found in the C++:** price × count is an `int`. Above 214,769 chips, buying 9,999 overflows, and the player gets them for the chips they have. New ⛔ `DS_OVERFLOW` (the user's choice: it blocks saving); the price box turns red while typing. Other findings: chips in a locked slot or a trade still pay (`GetAtItemNum`); the bag is checked before the chips are taken. INVESTIGATION §1.16.
> - The crash items have Spec_Item rows identical to the safe shields except the icon and name. The simulator says CRASH.
> - **🛒 Try buying** on each Donation Shop row: quantity, Donate Chips, empty slots, "already in the bag". It shows the confirm total, what the player reads, what they pay and get, chips before and after, and notes.
> - CLI: `gjs -m tools/dsbuy-sim.js II_SYS_SYS_SCR_BXMNITRORACING n=3 chips=2000 free=5 [price=…] [have=…] [raw]`. Python copy: `oracle_sim.py dsbuy` (2,479 buys + 8 edit scripts). 20 of 21 planted bugs caught. Tests: core 1006, UI harness 322 (new stage `dsbuy`).
>
> **User's test:** `python3 build.py`, reload, pick `test-data`, task Donation Shop.
> 1. Suits → 🛒 on a 600-chip suit: with 1,000 chips, quantity 1 is bought ("You pay 600…"); quantity 2 shows "More Donate Chips are needed."
> 2. Empty bag slots 0: the chat line "Inventory is full…", plus the note that the bag is checked first.
> 3. Type 214770 in a price (no Enter): the box turns red at once; after a 1 s pause it applies by itself (⛔ DS_OVERFLOW; Save refuses with "Cannot save"). Undo. Price boxes now apply while typing (the user's report, 2026-10-08: they had to click elsewhere first), in NPC Shops too.
> Then commit (not pushed).
>
> **Next (the user's requests, 2026-10-08):**
> 1. **Try it inside the + Menu → Exchange form**, before Create (today it is only on the ⇄ tab's cards after Create). It needs a scratch plan of the form's menus to run `exchangeSim` on.
> 2. **"What to do after saving" per change:** today every Save says "Restart the WorldServer to apply". It should name per file: WorldServer restart, game client restart (client-only files, Client copies), or a C++ patch + rebuild once (`donation-tree.diff`, `npc-board.diff`). Research who reads each file first, then plan.
> Then F (monster drops), then J (boxes).
>
> **Handoff (2026-10-08, evening) — S part 4 (Donation Shop categories) is user-tested in Brave and committed (not pushed).** Plan: `/home/kevin/.claude/plans/compressed-marinating-adleman.md`. In game still to do (Windows): apply `docs/patches/donation-tree.diff`, build Neuz, check the window. **Next: the Donation Shop simulator (buy flow: `CDPSrvr::OnBuyDonationItem`, price = dwReferValue1, chip check, the crash items), JS + Python copy. Plan it first.** Then F (monster drops), then J (boxes).
> - **Categories editable** in the Donation Shop task (`Client/Client/DonationShopTree.inc`, client-only; written into the Client folder like the rules texts):
>   - **+ Category** at the top of the list: one form, a name plus optional "categories inside it". None = it holds items itself (like Mounts); one or more = a group (like Weapon Skins). The user's idea after the first test (2026-10-08), replacing a separate + Group;
>   - on a selected entry: **✎ Edit category / group** (name, Inside, + Add a category inside it: a category with items becomes a group and its items move into the new category you pick under "Its N items go to"), **↑ ↓**, and **Delete…**;
>   - a rename takes the category's `DSItem` rows with it;
>   - a delete asks where the items go: another category, or remove them from the shop (the user's choice);
>   - deleting a group's only category also deletes the group (a ticked box; before, it stayed as an empty category: found in the user's test).
>   - Groups: the ▾ / ▸ arrow opens and closes the list (the user, 2026-10-08); the name selects the group and lists the items of all its categories, like the game.
>   - Every dialog shows the sidebar as it will look and the lines written. One undo step each.
> - **Found in the client:** the category order and each item's card text are compiled in C++ (`s_szDonationCatOrder`, `DS_CategoryBlurb`, WndDonationShop.cpp; `ae345504` had to add "Shields" there). Without a change, a new or renamed category sorts last and says "A cosmetic weapon skin".
>   - The user chose **one patch**: `docs/patches/donation-tree.diff`, which reads both from the tree. The user applies it (`git apply -p1 ../FLYFF-RESOURCE-EDITOR/docs/patches/donation-tree.diff` in FLYFF-V19-SOURCE; `--check` passes) and builds Neuz once.
>   - New checks: `DT_PATCH` (WARN) and `DT_ORDER` (INFO) until then. `DT_ROOT`, `DT_DUP`, `DT_BRACE` (a name starting with `{` / `}` breaks the client's tree reader) and `DT_CHARS` block saving. INVESTIGATION §1.15.
> - Simulator: `gjs -m tools/dstree-sim.js "Weapon Skins" sort=price-high sex=female patched`. Python copy `oracle_sim.py dstree` (600 views, 9 searches/pages, 648 made-up views, 12 small trees, 20 edit scripts). 17 planted bugs caught (5 after adding cases). UI harness: new stage `dstree`, 302 pass.
>
> **User's test:** `python3 build.py`, reload, pick `test-data`, task Donation Shop.
> 1. Click "▾ Fashion": 85 items (all 4 categories).
> 2. + Category → type "masks": refused; "Hats" → the preview shows it under Fashion → Create → it is selected; add an item with +. Undo.
>    + Category → "Mounts" + Add a category inside it ×2 ("Boards", "Brooms") → one group. Delete Boards, then Brooms: the box "Also delete the group Mounts" is ticked.
> 3. Masks → ✎ Edit category → "Face Masks" → Apply: its 5 items follow. Undo. ↑ on Masks. Undo.
> 4. Masks → Delete category… → Move them to Suits → Delete. Undo.
> 5. Save once: the backup holds `Client/Client/DonationShopTree.inc`.
> In game later (Windows): apply `donation-tree.diff`, build Neuz; a new category sorts in tree order and its card text fits.
>
> **Earlier handoff (2026-10-08, end of session), now done: everything was user-tested, committed and pushed (`b510b01` on origin/main).**
> - **Next: S part 4, Donation Shop categories** (`Client/Client/DonationShopTree.inc`, `DonationShop.inc`; follow `7d7df4f9` / `ae345504`). **Plan it first** (plan mode; the user approved this way of working).
> - Then, per the order below: the Donation Shop simulator (buy flow, JS + Python copy), F (monster drops), J (boxes: see "### J.", with the 5 C++ findings of 2026-10-08).
> - In-game test of Add New NPC + the npc-board patch still waits for the user's Windows PC (Fri 2026-10-09 / Sat 2026-10-10).
> - The branch `ccr-25b694d1-jie3e1` was merged into main in this repo (`4de36fc`), V19 (`7337fd0f`) and the guides (`fab7911`), then deleted on GitHub in all three at the user's request (2026-10-08).
>
> **Earlier handoff (2026-10-08), now done:** Last commit: `a87805f` (S part 3). Plan: `/home/kevin/.claude/plans/kind-riding-bonbon.md`.
> - **Update after the user's first look (2026-10-08): the Exchange and Rules text forms are now INSIDE + NPC** (the user: "why the rules form is not showing in the modal… like its 1 step at a time?"). Ticking a card shows its fields under the cards (`menuForm.menusSection`, `menuChooser.boardSection`, shared with + Menu). **One Create, one undo step**: `ctx.editSteps` applies the exchange menus, then the rules menu, then the NPC (its block lists every AddMenu), each planned on the files the step before left, and `Workspace.foldLast` makes them one step. `newMenusPlan` takes `newNpc` (no character.inc part) and `offset` (the preview of a rules menu after the exchange menus). The preview shows everything that will be written; the checks include the menus' (`NN_RULES`, `NN_RULES_PATCH`). **Shop off with items in its tabs** is now a WARN ("Shop is off: the N items … won't be added"), the items are kept, and the old "tick Trade" BLOCK is gone (Python `NN_BLOCKING` too). Tests: core 733, UI harness 285 (new stop `nnmenus`).
> - **+ NPC "Right-click menus" = 3 cards** (Shop / Exchange / Rules text, same as + Menu; the user: "just show that 3… Dialog maybe we don't need"). Shop on by default (shows the tabs). Exchange / Rules text open their + Menu forms for the new NPC right after Create ("Exchange for <name> (new NPC)"), each its own undo step; Exchange first, then Rules text. The old list is behind "Other game window…" (no Trade, no Dialog). `NN_NO_MENU` counts a chosen card. `FRE.dom.modal({ onClose })`; `FRE.ui.menuChooser.card` / `TEXT` shared.
> - **Exchange form = one card per exchange, like Collins** (the user: "different ingredients per reward… a reward can still have multiple ingredients"). `ui/menu-form.js` recipeBuilder: state `{ cards: [{ cond, rewards, payNum }] }`; each card has its own Costs (any number) and Reward (a 2nd reward makes the card random: percent chances, Spread evenly, Gives N of M); ↑ ↓ Copy ✕; "+ Exchange" (an empty card), and on each card **"Same costs, other rewards…"** (tick items: each becomes its own card with THAT card's costs, Jeff style; replaced "+ Several rewards…", which the user found confusing on 2026-10-08). New BLOCK `NM_COND_TWICE` (JS + Python): the same item twice in one exchange's costs; `CheckCondition` (Exchange.cpp:279) checks each line against the whole count and `RemoveItemA` finds nothing for the second, so players paid less (found in the user's test: Baby Sheep ×1 + ×1). Check messages name a menu by its label ("\"Test Weapons\", exchange 2, has no cost"), never `MMI_X` or an empty name. Used by + Menu › Exchange and the ⇄ tab's "+ New exchange". The Player picks / Random radio is gone.
> - **A reward is required:** a card missing a cost or a reward says "⛔ Still needs …"; `NM_EMPTY` is now BLOCK (JS + Python `NM_BLOCKING`).
> - Tests: core 721, UI harness 277 (new stop `mfcards`). Python `newmenu` has 2 new specs (Collins-like costs per exchange, two menus); `npcmove` has 3 built `.dyo` files with an OT_CTRL record of each version before an NPC. Planted bugs (on copies): all 10 move-NPC bugs caught; a Python crash now shows as a FAIL line.
>
> **User's test:** `python3 build.py`, reload, pick `test-data`.
> 1. + NPC: three cards. Tick Exchange and Rules text: their fields show in the same window. Fill the NPC, 2 exchange cards with different costs, a rules text → Create once → the NPC has both menus (⇄ tab + the rules button). One Undo removes it all. Untick Shop with items in a tab: a warning, the items come back when Shop is on again.
> 2. Lui → + Menu → Exchange: Create greyed until a card has costs + reward; + Exchange (empty), Copy, Same costs, other rewards…; Create → ⇄ tab cards with their own costs. Undo.
> Then commit (one commit: "+ NPC menu cards with inline Exchange / Rules text, one undo step; exchange cards per exchange; reward required"), not pushed. Next on the roadmap: S part 4 (Donation Shop categories) — plan it first.
>
> **Handoff (2026-10-07, afternoon) — START HERE: S part 3 + the user's part-2 feedback are built, NOT committed, waiting for the user's Brave test.** S part 2 + "+ Menu" were user-tested and committed (`376f694`, not pushed). Plan: `/home/kevin/.claude/plans/kind-riding-bonbon.md`. Next after the OK: S part 4 (Donation Shop categories).
> - **Exchanges live in NPC Shops** (the user: "put it in NPC Shops… just add a filter"). The Exchanges task is gone from the start screen (`MODULES` entry `hidden: true`). New list filter **"NPCs with exchanges"** (in-game NPCs that open an exchange menu); picking one opens its first ⇄ tab. Exchange checks (EX_*) run in NPC Shops (`alsoValidates`); clicking one opens the NPC's ⇄ tab. A ⇄ tab says "Also opened by …" when other NPCs share the menu. "Open in Exchanges" removed. An exchange edit marks its NPCs "edited".
> - **✎ dialogs say "Edit …"** (the user: "so I know what I'm doing"): "Edit name: Lui", "Edit tab 1 name: Poster (Lui)", "Edit rules text: Guild Rules", button **Apply changes**. In CLAUDE.md "UI standards".
> - **📍 Change position / model** next to the name of every placed NPC: Spot list (when it stands in several places), the + NPC Where fields (Region on its own map, Next to, /position, Facing, "Players will read here"), the + NPC Model picker, "Change the model on all N spots". Writes only the record's facing / x / y / z / model bytes, in place (the `b6abf414` way), Server + Client, one undo step. Same map only (the user's choice). Old warnings of the current spot stay hidden until something changes. INVESTIGATION §1.14.
> - The + NPC form now uses the same shared fields (`ui/npc-place.js`): no visible change.
> - Simulator: `gjs -m tools/npcmove-sim.js MaFl_Postbox spot=7 x=+6 model=MI_MAFL_JURIA!`. Python copy `oracle_sim.py npcmove` (391 cases). Tests: core 718, UI harness 267 (new stage `npcmove`).
>
> **User's test:** `python3 build.py`, reload, pick `test-data` (no refresh).
> 1. Start screen: 3 tasks (no Exchanges). NPC Shops → filter "NPCs with exchanges" → Collins: opens on his ⇄ tab; change a chance; Undo.
> 2. Lui → ✎ on Guild Rules: title "Edit rules text: Guild Rules", button "Apply changes". ✎ on the name: "Edit name: Lui".
> 3. Peach → "📍 Change position / model" (next to the name): "No change"; pick "Next to" another NPC → preview; Apply; the Where line changes; Undo.
> 4. Postbox → spot 7 → pick a model, tick "all 11 spots" → Apply → Undo.
> 5. Save once and look at the backup (`World/WdMadrigal/WdMadrigal.dyo`, Server + Client).
> In game later (Windows): the NPC stands at the new spot / with the new body.
>
> **Handoff (2026-10-07, late night) — START HERE: S part 2 + "+ Menu" (Shop / Exchange / Rules text) are built, NOT committed, waiting for the user's Brave test and OK.** Plan: `/home/kevin/.claude/plans/read-claude-md-and-the-wobbly-shore.md`.
> - **+ Menu** (NPC Shops) opens three big choices (the user: "a trade that sells something, an exchange list like Collins, or the Rules like in GS"):
>   - **Shop:** Trade + a first tab.
>   - **Exchange:** the old "+ Exchange menu" form. That separate button is gone. Each form has ← Back to the choices, and its title says the choice ("+ Menu for Lui › Exchange").
>   - **Rules text:** name + text with Bold / Colour buttons and a live preview drawn like the game. It writes a new menu id, its name, `AddMenu`, and the new client-only file `Client/Client/NpcBoard_<id>.inc`. The menu's button (✎) edits it later.
>   - Plus "Other game window…" (the old list).
> - **Rules text needs the client C++ change `docs/patches/npc-board.diff`** (WndWorld.cpp default branch + a type-2 title in CWndGuildCombatBoard; no server change). The user applies it in FLYFF-V19-SOURCE (`git apply -p1 ../FLYFF-RESOURCE-EDITOR/docs/patches/npc-board.diff`; `--check` passes), builds Neuz and commits it. In-game test pending (Windows, Fri/Sat). INVESTIGATION §1.13.
> - First file the editor creates: `Workspace.boardFile` / `setBoardFiles` (read from the Client folder), and `io/save.js` writes it into the Client folder (backup manifest `created`).
> - Menus show their in-game names, in the game's order, with one-line hover texts; the + Menu list is no longer clipped.
> - Simulator: `gjs -m tools/board-sim.js MaFl_Peach "Guild Siege Rules" "#b#cffffcc00How to win#nc#nb\nKill players"` (or `--file …GuildCombatTEXT_1_USA.inc`). Python copy `oracle_sim.py board`. Tests: core 705, UI harness 252.
> - **Upgrade fees (asked, decided, NOT built): goes into task K** (see "### K."). The user chose: move the fixed fees into `ItemUpgrade.lua` with one C++ change, plus an "Upgrade fees" screen.
>
> **User's test:** `python3 build.py`, reload, pick `test-data`. NPC Shops → Peach → + Menu → Rules text: type a name and a text, use Bold / Colour, Create. The new button appears in the right-click row. Save → `test-data/Client/Client/NpcBoard_282.inc` exists. Click the button: edit, Save, Undo. + Menu → Exchange opens the old form; ← Back returns to the choices.
>
> **Handoff (2026-10-07, night) — START HERE: task S part 2 is built, NOT committed, waiting for the user's Brave test.** Plan: `/home/kevin/.claude/plans/read-claude-md-and-the-wobbly-shore.md`. Next after the OK: S part 3 (move NPC / change model), then part 4 (Donation Shop categories).
> - **Every shop row is editable** (NPC Shops, Penya shops). Rows the server lists by itself (an `AddVendorItem` line = every item of one type; marked "auto") get a price box, Tab and ✕ like the others, with **no extra window** (the user, 2026-10-07: "I don't understand what that rule is for… I only want to add items, remove them and edit them"). The first change gives each auto item of the tab its own `AddShopItem( tab, II_X );` line, same order (the `73ee4bd6` way), plus the change: one undo step, and the note says so.
> - **One Penya price per item:** a typed price also goes on the item's other priced `AddShopItem` lines in any shop (`shopOps.otherPriceParts`), or the line loaded last would win. Chip prices are separate (`dwReferValue1`) and untouched. Typing again within 2 s stays one undo step (`ctx.editGroup` merge key).
> - **Players pay · get back** under every Penya price (port of `OnBuyItem` / `OnSellItem`, float32 like the Win32 build): "=" or 0 → pay 1; from 2,147,483,584 → pay 1 (float overflow); sell = cost / 4. "price set in X's shop" when another NPC's line decides it. INVESTIGATION §1.12.
> - Not in the UI (the user doesn't need them): the rule editor, changing `dwCost` in Spec_Item.txt, `dwShopAble -1`. The edit ops stay (`shopOps.addRule/setRule`, `itemOps.setCost/setShopAble`) and are tested against the Python copy.
> - New diagnostics: `C_PRICE_MIN1` (WARN: pays 1 Penya), `C_PRICE_FROM_OTHER` (INFO). Found: both Secret Room NPCs sell Red Chips for 1 Penya (dwCost 0 since `94881aa2`).
> - Item list: "Price for items added with +", with "Empty = the item's own price (dwCost). A price here applies server-wide." The NPC list filter is now named "Shops with fixed items".
> - Simulator: `gjs -m tools/shop-sim.js MaFl_Peach price1:II_SYS_SYS_SCR_AWAKE=150000 rates=1,1.5,0.5`. Python copy `oracle_sim.py shop`. Tests: core 682, UI harness 238 (stage `shoprules`); 16 planted bugs in copies of the Python copy, all caught.
> - Asked, not built yet: a **Currency** choice in **+ NPC** (today Penya only; switch to Red Chip afterwards with the dropdown). Perin has no shop type in the server (`SetVenderType` 0/1/2 only): it would need C++. Plan it first (the user is fine with plan mode).
>
> **User's test:** `python3 build.py`, reload, pick `test-data`.
> 1. NPC Shops → Peach → tab 1: rows 1-2 say "auto" and "Players pay 100,000 · get back 25,000".
> 2. Type 150000 in Scroll of Awakening's price, wait: it applies by itself, the note says the auto items got their own lines. Open Raia: "price set in Peach's shop". Undo.
> 3. ✕ on Scroll of Pet Awakening, Tab box on an auto row: at once. Undo.
> 4. Save once and look at the backup.
>
> **Earlier the same evening: task S part 1 is user-tested in Brave and committed. Next: S part 2 (rule rows editable: Scroll of Awakening / Pet Awakening on Peach and Raia, with "players pay / get back"), see "### S." below.**
> - After the user's test, also committed:
>   - **Nothing silent** (now in CLAUDE.md "UI standards"): every edit shows "✓ <what> — not saved yet (n files…)", Undo / Redo show "↶ Undone / ↷ Redone", errors show a reason.
>   - **Save never fails silently.** After a reload Brave forgot write access, and chained `requestPermission` calls without a click threw an uncaught error. Now an "Allow writing" button asks (`writeAccess`), and any Save error shows "Save failed: nothing was written".
>   - **Category search:** a type-to-search box, matching word starts ("ra" → Raised pets); readable game type names.
>   - **Rename with the same text:** "No change", button greyed.
> - Part 2 also: rename the item list's "Price for new items" box to "Price for items added with +", with a hint: empty = the item's own price (dwCost); a price is AddShopItem's and applies server-wide (the user asked what it was for).
> - Waiting for a decision: **info-board menus** ("Rules" / "Information" on any NPC, like the Guild Siege boards). Needs ONE generic C++ change in the client's `CWndWorld::OnCommand` `default:` (show `Client/Client/NpcBoard_<menu id>.inc` when it exists, else the exchange window), made in the source repo. Then the editor adds board menus + text with no further C++. The user has not said yet whether it goes in S or Step 3.
>
> **Earlier the same day — task S part 1 (built, then user-tested):** Plan: `/home/kevin/.claude/plans/read-claude-md-and-the-magical-hopcroft.md`. The user widened S the same day: edit EVERYTHING of an existing NPC (name, tabs, menus, position, model), plus clearer item categories and Donation Shop categories.
> - **NPC Shops, any character.inc NPC:**
>   - ✎ next to the name renames it;
>   - ✎ on the selected tab renames that tab, with "Remove this tab" when it is the last one and sells nothing;
>   - **+ Tab** names the lowest free slot (`d11123ac` way);
>   - menus get ✕ and **+ Menu**, a searchable list of every menu id with what it opens.
> - **Shared texts:** a shared text (e.g. `000049` "n/a" on 6 tabs) gets its own new key for this NPC or tab, unless "Change it in all N places" is ticked.
> - **Tab labels:** no more made-up "Tab 0" labels. Tabs without a name are not offered (adding items to them is blocked); repeated names show their position ("2 · n/a"). A line under the tabs shows the in-game shop window. The item list says where + adds ("+ adds to Peach → tab 2 "n/a"").
> - **Shop window port** (`loaders/shop-window.js`): only named slots become tabs, at their slot's position. Slot 0 unnamed with a later slot named → the client crashes on a tab click (`C_TAB_FIRST_UNNAMED` BLOCK); items in an unnamed tab are invisible (`C_TAB_UNNAMED_ITEMS`); a gap is harmless (`C_TAB_GAP` INFO). No shop has any of these today. INVESTIGATION §1.11.
> - **Item list categories** (`loaders/item-category.js`): Weapons › Swords…, Pets › Raised / Pickup / Buff pets (the game's `IsVisPet`), Scrolls › Awakening / Protection…, etc. The raw type list stays as "All game types". Rarity chips show only for Weapons / Armor (every other item is Normal). Penguin Buff Pet's `dwReferStat1` is -1, so the game treats it as a pickup pet.
> - **Simulator:** `tools/npcedit-sim.js MaFl_Peach tab2=Event +menu=MMI_BANKING` (in memory). Python copy `oracle_sim.py npcedit`: 88 Trade NPCs' windows, 48 small tab sets, 10 edit scripts with byte-identical character.inc / character.txt.txt. Tests: core 648, UI harness 222.
> - "Tab N" in messages (C_TAB_FULL, the new-NPC "In game" box) is now 1-based, like the game.
>
> **User's test:** `python3 build.py`, reload, pick `test-data` (no refresh needed).
> 1. NPC Shops → Peach: ✎ on tab 2 "n/a" → it says 5 other places use the text → type a name → Rename: only tab 2 changes.
> 2. Tab 4 ✎ → Remove this tab → + Tab → name it.
> 3. ✎ on the name → rename.
> 4. + Menu → Bank; ✕ on a menu.
> 5. Item list → Category → Pets › Raised pets.
> 6. Save and look at the backup. Undo works for each step.
>
> **Next in S:** part 2 (rule rows editable, players pay / get back, `C_PRICE_MIN1`), part 3 (move NPC / change model: `.dyo` record), part 4 (Donation Shop categories: `DonationShopTree.inc`, `7d7df4f9` / `ae345504`).
>
> **Handoff (2026-10-07): Step 2 (new exchange menus, Jeff) + the polish below are user-tested in Brave and committed.** In-game test of Add New NPC (steps 1 + 2) deferred to Friday 2026-10-09 or Saturday 2026-10-10 (when the user has the Windows PC); until then continue with S. Plan: `/home/kevin/.claude/plans/witty-churning-parrot.md`. The user made Bob Marley + "Bob's Weapons" on test-data and saved it (backup `test-data/backups/2026-10-07_08-04-42_npc/`).
> - **NPC Shops shows and edits exchanges:** each exchange menu of the NPC has a tab `⇄ <label> (n)` next to Tab 0–3 with the same cards as Exchanges (Try it, chances, Gives, add / remove / change, + New exchange, Open in Exchanges), before and after saving. Menu chips show the in-game label + count and open that tab.
> - **Chances in percent:** the Chance box is a percent (`FRE.dom.pctInput`, 4 decimals); "of 1,000,000" is read-only. Changing one reward rebalances the others so the total stays 100% (`exchangeOps.rebalance`, `setChanceKeepTotal`); + Reward gives an equal share (`addRewardKeepTotal`); ✕ scales the rest back up (`removeRewardKeepTotal`). No more `EX_PROB_OVER` drops from editing.
> - **Typing updates by itself** after 400 ms (keyed `numInput` / `pctInput`, `live`); the focus and caret stay (`FRE.dom.keepFocus`); typing in one field is one undo step (`Workspace.mergeLast`, 2 s).
> - **+ Exchange menu form:** Label first, Name filled from it (`FRE.menuNameFromLabel`: `MMI_BOBS_WEAPONS`, `_2` when taken) with a live `✓ free · menu id N` / `✗ already exists`; rewards in a readable table with Qty; **Player picks** (one exchange per reward) or **Random** (one exchange, chances, Spread evenly, Gives N of M: new rule `NM_PAYNUM`); "What players will see" list. Same builder in + New exchange.
> - **Standard form pieces** (user: "make everything standard"): `FRE.ui.fieldLabel` (red `*` / "(optional)"), `FRE.ui.formFooter` (* note → Checks with ⛔/⚠ legend → preview), used by + NPC, + Exchange menu, + New exchange.
> - Other: after + NPC the list search is replaced by the new NPC's name when it would hide it; Change task with unsaved edits offers **Save and continue**.
> - Simulator: `oracle_sim.py newmenu` writes `PAY <n>` and has random specs (50/50, gives 2 of 3, gives 3 of 3, gives 0 / 3 of 2 blocked) with 1,500-press rate cases; JS = Python. Tests: core 590+, UI harness 201.
>
> **User's test:** `python3 build.py`, reload, pick `test-data` (no refresh). NPC Shops → Bob → `⇄ Bob's Weapons` tab: both exchanges; type 70 in a chance (no click): the other becomes 30. + Reward: equal share. Try it. + Exchange menu on Bob: type a label (name fills), 2 rewards, Random, Create: the new tab shows it unsaved. Change task → Save and continue.
>
> **Handoff (2026-10-06, evening):** **Step 1 (Add New NPC + building tags) is committed and pushed (`7cbb9c9`). Step 2 (new exchange menus, Jeff's Weapon Pieces) is built, NOT committed, waiting for the user's test.** Plan: `/home/kevin/.claude/plans/flickering-shimmying-dahl.md`. Tests: `gjs -m tests/run-tests.js` 564 pass, `tests/run-ui.sh` 188 pass, `python3 tools/oracle_sim.py newmenu` (30 specs + 192 OK presses, JS = Python).
>
> **What Step 2 does:**
> - NPC Shops → an NPC from character.inc → **+ Exchange menu**: name (`MMI_…`), label, ingredients + rewards (one exchange per reward), messages (2 new texts or an existing pair). Create writes, as one undo step, Server + Client: `#define MMI_<NAME> <282..>` (defineNeuz.h), `TID_MMI_<NAME> 7000+id` + result TIDs (defineText.h), textClient.inc blocks + textClient.txt.txt lines, the menu block (Exchange_Script.txt), `AddMenu` (character.inc). No C++ change (INVESTIGATION §1.10).
> - Exchanges → a menu → **+ New exchange**: same ingredients, one exchange per reward, reusing the menu's text and messages.
> - Simulator: `newNpcSim.rightClick` marks which menus open the exchange window (port of `OnCommand`'s case list) and how many exchanges they hold; `tools/menu-sim.js` builds a spec, presses OK on every exchange, and with `--write` writes `test-data` (backup first). Python copy `oracle_sim.py newmenu` reads the case list from `WndWorld.cpp` (fixture copy in `test-data/fixtures/src/`).
> - **Jeff is applied to `test-data`** (`gjs -m tools/menu-sim.js --write`, spec `tools/jeff-menus.json`, backup `test-data/backups/2026-10-06_19-07-53_npc-menus/`): menus 282-287 (Entaness / Chiton / Duchess / Ancient (Drakul) / Ankou / Crystal Lusaka Weapons), 61 exchanges (200 pieces + 1 boss item, Savage Khan 30), messages "You received your weapon." / "You need the weapon pieces, the boss item and a free inventory slot." (TID 8044/8045). NOT in the real `Server/Resource` yet.
>
> **User's test:** `python3 build.py`, reload, pick `test-data` (do NOT run `tools/refresh-fixtures.sh test-data`: it would remove Jeff). NPC Shops → All shops → Jeff: menus show the 6 exchanges. Exchanges task → Jeff's 6 menus, Try it. Optional: + Exchange menu on another NPC, Create, Undo. In game later: talk to Jeff → 6 menus → counts red when missing → a trade gives the weapon; no Exchange / LoadText errors in `Server/error_*.txt`. To put Jeff in the real files: run the same spec on the real folder only after the user says so.
>
>
> **Step 1 (2026-10-06, late night):** **Add New NPC step 1 (shop NPC, reworks 1b + 1c + 1d) is committed (`7cbb9c9`) but NOT tested in game yet.** The user tested 1c in Brave: OK except the Model list and the Building tag, both reworked in 1d (below). Next: the in-game test (handoff §8 + the `[tag]` above the name and its minimap icon) on a test copy first, then the real folder after asking. Plans: `/home/kevin/.claude/plans/magical-spinning-knuth.md`, `/home/kevin/.claude/plans/flickering-shimmying-dahl.md`. Tests: `gjs -m tests/run-tests.js` 543 pass, `tests/run-ui.sh` 183 pass, `python3 tools/oracle_sim.py newnpc` (152 cases + 12 small structure files, JS = Python).
>
> **1d (user test feedback):**
> - Model: a **Used by NPCs / Not used yet / Both** dropdown replaces the checkbox; a model not in the chosen list is cleared (no stale picture). A line under it lists the files: `.o3d`, animations, textures — all in Client/Model, or what is missing. Textures are read from the `.o3d` (`newNpcSim.o3dTextures`; a test copy uses `Client/ModelTexture.list` + `Client/Model.textures` from `tools/refresh-fixtures.sh`). Models of NPCs hidden in `b6abf414` are proven ("Soraya (until b6abf414)").
> - Building: pick an existing tag, or **type a new one** (`+ New tag [Dungeon Pieces]`): adds `#define SRT_<NAME> <row>` (defineNeuz.h), `SRT_<NAME> IDS_ETC_INC_n` (etc.inc structure block) and the text (etc.txt.txt), Server + Client, in the same undo step as the NPC, the `b4b9a465` way. Only rows 18 and 19 are free (`MAX_STRUCTURE` 20 is compiled). Rules `NN_TAG_FILES`, `NN_TAG_FULL`, `NN_TAG_CHARS`, `NN_TAG_LONG` (31 max, `szName[32]`), `NN_TAG_DUP` (BLOCK), `NN_TAG_ICON` (INFO).
> - Simulator: port of LoadEtc's structure loop + the `[tag]` line (`newNpcSim.structures`, `tagOf`), Python copy `nn_structs`; 11 planted bugs (tags, structure loop, textures, b6abf414 models), all caught after adding cases.
>
> **User's test:** `python3 build.py`, `tools/refresh-fixtures.sh test-data` (new: Client defineNeuz.h / etc.* and the texture lists), reload, NPC Shops → + NPC: switch the Model list, type a tag in Building, Create (6 files), Save (backup has defineNeuz.h, etc.inc, etc.txt.txt + Client/), Undo. In game later (Windows): handoff §8 plus the `[tag]` above the name and its minimap icon.
>
> **Next (the numbered order under "## Next" is the single source of truth, updated 2026-10-06):** in-game test of step 1 → S. Shops: everything editable → V. Save History → H. Where is this item from / used → D-sim. Donation Shop simulator → C. GM Commands list → Add NPC step 2 (**built early, 2026-10-06: user test + commit pending**, see the handoff above) → step 3 (NPC menus + info boards, Guild Siege rules) → I → F → J → K → L → G → M. No 3D model viewer (the user chose pictures only).

## Done
- **Build 1** (`1c785ce`): NPC shop editor (`character*.inc`). Add, remove, price and tab edits; byte-exact save with verified backup. Tested by the user in Brave on `test-data`.
- **Build 1.1** (`b79f374`): shop simulator ("what players see", identical to an independent Python port for all 594 NPCs), readable rules, help text for every warning.
- **Step 1 + Step A** (the commit after `b79f374`):
  - comma display (`core/num.js`, `numInput`);
  - module system (`core/workspace.js` `MODULES`, `ui/common.js` `FRE.ui.modules`, mode switch in the toolbar);
  - shared `edit/text-ops.js`;
  - **one table per shop tab** with a Job column;
  - Donation Shop **core** (loader + validator + ops; **no UI yet**).
- **Step B** (committed with B+ and C): shop-type dropdown (Penya / Red Chip / Donate Chip) in the NPC header.
  - `FRE.shopOps.setShopType` renames only the command word (`AddShopItem` ↔ `AddVenderItem2`) and keeps the `( tab, II_X )` text, so a round trip gives identical bytes. Penya prices are dropped when converting to chips. `SetVenderType(n);` goes after the last `AddMenu`, is replaced in place, or is removed for Penya. All of it is one undo step.
  - Preview dialog first (`shopTypePlan`): dropped prices, items with no chip/Penya price, ignored rules, and the exact lines.
  - New codes: `C_RULE_IGNORED` (INFO, AddVendorItem rules in a chip shop) and `C_FIXED_IN_CHIP` (WARN, AddShopItem in a chip shop is charged in chips without the chip-price check).
  - Also: the browser tab icon is the client's Infinity MMO icon (`src/favicon.png`, from `Design/Logo/infinity_mmo.ico`).
- **Step B+** (committed):
  - NPC list filter: All shops / Penya / Red Chip / Donate Chip / All NPCs.
  - **Chip prices** edited in `Spec_Item.txt` `dwReferValue1` (`edit/item-ops.js`), the way commits `93a02124` / `fea9840b` did it. One price per item, shared with every chip shop and the Donation Shop (`7bedef15`), so other uses are named before writing.
  - **Convert preview** has a price box per item: chip prices go to Spec_Item.txt; Penya prices become `AddShopItem( tab, II_X, price )`. Conversion and prices are one undo step (`Workspace.applyGroup`).
  - **Client sync** (`core/client-sync.js`, `io/save.js`): with a Client folder chosen, each save applies the same change to the client's loose copies (identical / LF-only copies), backs them up under `<backup>/<stamp>/Client/`, verifies, and restores on failure. Missing loose copies (`character-etc.inc`, `character-school.inc`) are created after asking (`b7645c52`).
  - **Item tooltip on hover** (`loaders/item-tooltip.js`, `loaders/textclient.js`, `ui/tooltip.js`): port of `CWndMgr::MakeToolTipText` for a new item, texts from `textClient.inc`, plus "Editor info" (buff effect and `dwSkillTime`, prices) that the game leaves out.
  - Fix: byte files (e.g. `DonationShop.inc`) rejected every inserted line break (`bytes.isPrintableAscii`). The Donation Shop UI would have hit it.
- **Step C** (committed): Donation Shop editor (`ui/donation.js`).
  - Left: All items + categories with counts, in the order of the client's `Client/Client/DonationShopTree.inc` (`loaders/donation-tree.js`, port of `CWndTreeCtrl::InterpriteScript`) when the Client folder is chosen; search lists matching items.
  - Table: # · Item (hover tooltip) · Job · Price (Donate chips = shared chip price, editable via `ui/chip-price.js`) · Category (move) · ✕ · Line. `+` adds to the selected category.
  - New rules: `DS_CRASH` BLOCK (Nexus Shield, Icecrown Purple Shield crashed the server when bought, commit `ae345504`), `DS_NO_LEAF` WARN (category not a leaf in the client tree: the item only shows under "All Items").
  - Categories: only the client tree's leaves (or the file's categories) are offered; the tree file is client-only and not edited.
  - Oracle cross-check of rows/categories; `DonationShop.inc` stays LF (its header comment wrongly says CRLF).
  - Toolbar: file chips collapsed into one summary chip; only changed or read-only files get their own chip.
  - User-test fixes: the editor scrolls inside the window (`#editor` needed `min-height: 0`), keeps its scroll position after an edit, and hides a stuck tooltip; the editor switch is labelled "Editing:"; the NPC list defaults to "Shops with editable items" (6 NPCs with AddShopItem / AddVenderItem2; rule-only shops like Boboku stay under "All shops").

- **Step D** (committed): Battle Pass editor (`ui/battlepass.js`, `loaders/battlepass.js`, `edit/battlepass-ops.js`, `loaders/propmover.js`).
  - Loader: port of `CProject::LoadBattlePass` (`ProjectCmn.cpp:1682`). Every table is a `std::map` filled with `insert`, so the FIRST duplicate wins. At login the server uses the pass with the LOWEST item id (`mapBattPassItem.begin()`).
  - `loaders/propmover.js`: port of `CProject::LoadPropMover` (`ProjectCmn.cpp:380`), read-only, for each monster's name, level and rank. Checked against a column read of propMover.txt in `tools/oracle.py`.
  - **Season:** the end date is a date box. `YYYYMMDD` = 00:00 at the START of that day, shown in words. **Start new season** sets the date (first day + length) and bumps nType on the pass and every reward row in one undo step. The item is reused (`2f783090`). The dialog says whether players roll over at next login (old season ended) or need `/rrbp`/SQL.
  - **Reward ladder:** qty, cost, item (↺ then +), rarity/icon textures (checked against `Client/Theme` when the Client folder is chosen). Add the next level from the item list; only the last level can be removed. The last level's cost is never used, so reaching level 50 takes **146,000** points, not the 150,000 the file header says.
  - **Monster points:** min/max per row, add/remove, filters Listed / Off band / Not listed. The level-band rule (`c0a828d7`, `3b8e8410`) matches all 863 season-1 rows exactly: base band by level, ×1.25 midboss, ×1.5 boss, ×2 super, half rounds up. "Re-price off-band rows" sets the band price and refreshes the `// lvN rank - Name` comment.
  - Rules: `BP_BRACES`, `BP_FORMAT`, `BP_UNDEF`, `BP_NO_ITEM`, `BP_NO_MONSTER`, `BP_DUP_*`, `BP_LEVEL_GAP`, `BP_DATE`, `BP_TYPE` (BLOCK); `BP_EXPIRED`, `BP_MULTI_PASS`, `BP_CLAMP`, `BP_TYPE_ROW`, `BP_TEXTURE`, `BP_BAND`, `BP_DATE_FORMAT`, `BP_NO_PASS` (WARN); `BP_LOGO_UNUSED` (INFO: the client never draws strLogo).
  - Real file today: only `BP_EXPIRED`. Season 1 ended 2026-10-05 00:00, so nobody earns points until a new season is set.
  - `BattlePass.inc` is LF in both copies (its header says CRLF) and identical in `Client/`.
  - After the user's review: only BP5 monsters pay points (`AttackArbiter.cpp:966`, killing blow only). **"Add all unlisted monsters"** adds the 32 real monsters missing from season 1 (ship, dream and Hern dungeons, zombies, Mirrored Soul) at their band price. Town NPCs, guards and pets are left out (`battlePass.isMonster`).
  - Pets (98) and town NPCs (8) listed in season 1 are hidden in the editor (they never pay points); a note offers to delete them from the file.
  - The date box shows the LAST playable day; the file gets the day after (00:00 = midnight after it). New seasons default to 30 full days.
  - Season-change tests (`tests/bp-server.js`, a port of OnJoin / OnDied / AddBPUpdate / GiveBattlePassReward / OnDoBP): S1 buyers restart S2 on the free track and keep S1 rewards; an unused S1 pass unlocks S2; a pass used while no season runs is wasted.
  - Texture column hidden (all 50 rows use "" = the item's own icon); the file keeps the three "" per row because the server reads three tokens. "↺" became a "Change" button.
  - **Server issue (C++, not fixed here):** `CDPSrvr::OnDoBP` activates a pass whose season has already ended. The Donation Shop still sells it, so a player who uses it while no season runs loses the item for only the level-1 reward. Start the new season before that happens; a C++ end-date check would close it for good.

- **Step E** (built, waiting for the user's test): Exchange editor (`loaders/exchange.js`, `edit/exchange-ops.js`, `ui/exchange.js`).
  - Loader: port of `CExchange::Load_Script` (`_Common/Exchange.cpp:32`).
    - It is a bare `CScanner`: only `CScript::GetDefineNum` resolves names (unknown = -1, no log). A name in a number slot reads as 0.
    - `PENYA` = `II_GOLD_SEED1` (gold). An optional 4th PAY value is the item flag: 2 = `binds` (`Item.h:132`), used by 38 lines.
  - **`__NEW_EXCHANGE_V19` is ON** (`_Common/LodeConfig.h:18`, included by the WorldServer and Neuz `StdAfx.h`). The old roadmap said it was off. So:
    - CONDITION is checked AND taken; REMOVE is ignored;
    - a menu keeps at most 30 SETs (Collins had 30 in `f58e56ba`).
    - Edits keep REMOVE equal to CONDITION while they match, like `f58e56ba`, `3099c822`, `15091d5f`.
  - PAY chances are out of 1,000,000: the line that crosses 100% is cut and later lines are dropped; a total under 100% tops up the last line. The editor shows the chance the server really uses.
  - The client loads its own copy and sends only the recipe's position (`WndControl.cpp:1980`, `CDPSrvr::OnExchange`), so Server and Client copies must match. The Client copy is the same text with LF (`eol` sync mode).
  - Any NPC menu id without its own `case` opens the exchange window (`WndWorld.cpp:6470`).
  - **Real file finding:** 12 old menus use `SET_SMELT` / `SET_ENCHANT_MOVE` (blocks from a newer server). This loader ends the menu at the first `}` inside them and reads the rest as junk "menus" (`PAY`, `}`, id -1). The three chains (`MMI_BEHEMOTHSMELTEVENT_TWOSWORD`, `MMI_CHRISTMASENCHANTEVENTMENU`, `MMI_SEAKINGLOOKCHANGEMENU`) also swallow `MMI_MAPLE_TRADE`, `MMI_EVENT_2012HAPPYMONEYMENU` and `MMI_SEAKINGMASKCHANGEMENU`: none of them is ever loaded (`EX_OUT_OF_STEP`, WARN). 285 recipes load in 72 + 3 menus; 24 more are read inside junk menus.
  - Rules: `EX_FORMAT` (missing } = hang), `EX_UNDEF` (ingredient / reward: BLOCK), `EX_NO_ITEM` (reward: BLOCK, server crash in `GetProp()`), `EX_PACKMAX`, `EX_PAY_EMPTY` (BLOCK); `EX_PROB_OVER`, `EX_PROB_UNDER`, `EX_PAYNUM`, `EX_QTY`, `EX_SET_CAP`, `EX_DUP_MENU`, `EX_ROW_WIDE`, `EX_OUT_OF_STEP` (WARN); `EX_NO_NPC`, `EX_REMOVE_IGNORED` (INFO). Real file today: 3 `EX_OUT_OF_STEP` and 24 `EX_NO_NPC`.
  - UI:
    - Left: menus named by their NPCs (filter "Opened by an NPC" / "All menus"). Search covers menu names, NPC names and item names.
    - One card per recipe: ingredients, rewards (qty, chance, "Server uses", Bound), "Gives n of m", "Spread evenly", and the in-game icon row (about 9 icons fit).
    - Recipe actions: move up/down, copy, remove. A recipe with EUC-KR comments is rebuilt from its values (comments dropped); the editor asks first.
  - `tools/oracle.py` reads the file as a balanced-brace tree; it agrees on all 72 in-step menus.

- **One folder, one task** (built 2026-10-06, waiting for the user's test):
  - The start screen asks for ONE folder; `io/layout.js` finds the paths: `FLYFF-V19-SOURCE` → `Server/Resource` + `Client` (REAL); `test-data` → `Resource` + `Client` + `backups` (TEST). Nothing is created inside a real source folder; its backups folder is asked once and remembered.
  - Then one task card: only that task's files are opened, shown and saved (`Workspace` `only`). The Client copies are attached automatically. "Change task" asks before dropping unsaved edits.
  - The manual "Backup" snapshot button is gone (every save backs up first). Backup subfolders are named `<stamp>_<task>`.

- **In game** (built 2026-10-06): `loaders/world.js` ports `CWorldMng::LoadScript` (World.inc), `ReadObj` / `CMover::Read` (.dyo NPC placement; every map file reads to its 0xFFFFFFFF end) and `CWorld::IsUsableDYO2` (SetOutput / SetLang; server language compiled in, `WorldServer.rc:137` = LANG_USA). The Exchanges list defaults to the **9 menus players can use** (Collins; Rambo's 4 Colosseum menus; Card Master + Epie ×2; Pet Tamer + Cheirang; Nerupha's mask menu). Each menu shows its NPCs with "on WdMadrigal" / "hidden: SetOutput( false )" / "not placed on any map".
  - Recipe cards now lead with a big "You get …" line (with the server's chances), then Rewards, then Costs.
  - Unticking Bound removes the flag value instead of writing `0`.

- **Exchange simulator** (2026-10-06, user-tested): `loaders/exchange-sim.js` (`FRE.exchangeSim`), `tools/exchange-sim.js`, and a **Try it** button on every recipe card.
  - Ports `CDPSrvr::OnExchange` → `CExchange::ResultExchange` (`_Common/Exchange.cpp:434`): CheckCondition + `CMover::GetItemNum`, GetPayItemList + `xRandom` (the server's LCG), IsFull + `GetEmptyCount`, `RemoveItemA` / `RemoveAllItem`, `CreateItem` → `CItemContainer::IsFull` / `Add`; and the client's `CWndDialogEvent::ReceiveResult` (Collins' chat line, `15091d5f`) and the row dimming (`WndControl.cpp:1973`). No commit changes `Exchange.cpp`.
  - Try it: "Run again" uses the next seed (new rolls); columns "Got in this run" vs "Chance set". Press OK N times with the same fresh bag (how often each reward comes out) or one bag that keeps the rewards (runs out, fills up); shows refusals, items taken, lost rewards and what the player reads.
  - `gjs -m tools/exchange-sim.js` runs all 75 recipes of the 9 live menus: every one works, observed chances match the server's (Card Master 60/40).
  - In-game findings (tests assert each):
    - The reward roll happens BEFORE the bag check; a full bag takes nothing.
    - The bag check wants at least one EMPTY slot every time, even when the reward would stack (Collins' Scroll of Holy with 1 free slot: the 2nd exchange is refused). A stack the exchange uses up counts as empty.
    - It counts a reward as `qty / dwPackMax` slots, rounded down, so 3 small rewards (`PAY 0`) with 1 free slot pass the check and 2 are LOST (the server only logs an error). No live recipe hits this.
    - `PENYA` is gold only; Perin items do not count.
    - Any item in a trade / private shop, or stranded in a locked bag slot (expired Bag Expansion), makes every ingredient count 0: every exchange is refused.
    - Ingredients are counted and taken from equipped items too.
    - Ingredient quantity -1 (`=`) passes the check and takes EVERY one the player has (`RemoveAllItem`); the `EX_QTY` text now says so.
    - Collins' success line names the first reward of the CLIENT copy, not the one rolled; with Server and Client copies out of step the player gets one recipe and reads another.
  - Not modelled: Perin auto-convert in `AddGold` (only above 2,000,000,000 Penya), campus points, logs.

- **Independent copies** (2026-10-06): `tools/oracle_sim.py`, Python written from the C++ without reading the JS simulators.
  - `exchange`: its own `Load_Script` token loop, Spec_Item reading and bag model. 1,436 cases: for each of the 285 loaded recipes, exact ingredients, one short, double stock with a full bag, a bag stocked for 3 pressed 5 times, 1,500 presses for the rates; plus 10 small scripts for the edge cases. JS and Python agree on every result, roll, reward, lost reward and end bag.
  - `battlepass`: its own `LoadBattlePass` (clamps, first wins), `BattlePassConfigTime`, OnJoin, OnDied, AddBPUpdate, GiveBattlePassReward, OnDoBP. One timeline (7 players, 2 seasons, the season edit done by Python on the text vs the editor's `newSeasonPlan`), 44 steps, every player state agrees.
  - `core/xrandom.js`: the server's `xRand` / `xRandom(n)` / `xRandom(min, max)` (`_Common/xUtil.cpp`), shared by both JS simulators. `tests/bp-server.js` used its own 31-bit generator before (same range, different rolls).
  - `tests/bp-server.js` now ports OnDoBP's bag checks (1 empty slot to activate with no pass running; one empty slot per reward to pay back earlier levels; the pass is not used up when refused) and mails a reward when the bag is full.
  - Planted-bug check: 10 one-line bugs planted in the Python copy, one at a time; the tests now catch all 10. Five were missed at first because no case reached them, and cases were added: exact points at a level's cost; a roll exactly on a chance boundary (the seed is chosen so the first roll is 400,000); a bound reward next to an unbound stack in a full bag; back-pay with exactly enough free slots; a Battle Pass reward with a full bag (mailed).
  - Finding: with a nearly full bag, a bound reward (flag 2) cannot join an unbound stack of the same item, so it needs its own slot and can be LOST when a recipe gives several rewards.
  - Finding: one award of many points raises at most one level; the rest is banked and each later award raises one more level (`AddBPUpdate`).

- **After the user's test of Try it** (2026-10-06, user-tested):
  - Editor: picking an item (+ Ingredient / + Reward / Change) no longer scrolls to the top (the view key ignores `pick`; Battle Pass too). The "edited" badge rides on the undo entry, so Undo removes it. **Undo (n) / Redo (n)** count the edits of the whole task; the tooltip names the next step and its NPC / menu. Try it re-runs on every change.
  - Exchanges wording: cards are "Exchange N", named by their reward. The top button says "Remove <reward>" and removes the whole exchange (rewards and costs); the row ✕ removes one reward or cost.
  - **Battle Pass: Past seasons** (4th view): every season found in the backup copies of BattlePass.inc (`fsa.backupCopies`, `battlePass.seasonHistory`: key = login pass nType + end date, last copy's ladder), newest first, with a "now" comparison per level.
    - **+** adds a past reward as the next level (`addReward`).
    - **Use this whole ladder…** (`battlePassOps.restoreLadder`, preview, one undo step) gives the current season that season's costs, rewards and quantities; its number, end date and monsters stay.
    - **↑ / ↓** on the ladder swap rewards between levels; costs stay (`swapRewards`).
    - Tested through the Battle Pass simulator: after "Use this whole ladder" a buyer gets exactly the old season's reward at every level.
    - Seasons from before the first save through the editor are in no backup.
    - After the user's test: the current season has no card there (it is edited in Reward ladder); cards start closed; **+** opens a pop-up (a new top level, or instead of level N, with qty and cost editable) and a message says what changed; "BP4" / "BP5" replaced by plain words.
    - Reward ladder: the total ("146,000 points to reach level 50") is on top and follows every cost edit; **✕ on any level** (`removeLevel`: the levels above move down one with their rewards and costs, no gap), checked through the simulator.

- **Where each NPC stands** (2026-10-06, user-tested in Brave): `loaders/area.js` (`FRE.area`), `tools/area-sim.js`, `tools/oracle_sim.py area`.
  - Asked: in every task, show where each NPC stands in names players know, to know where to go when testing in game. Agreed: the map-window name, the area name on screen, and a GM `/te` command; shown in NPC Shops (header + list), Exchanges (each menu NPC) and Donation Shop (`MaFl_DONATION`). Battle Pass has no NPC.
  - C++ ported (details in INVESTIGATION.md §1.8):
    - `.dyo` positions × `OLD_MPU` 4 (`Obj.cpp:525`);
    - `CContinent::Init` / `Point_In_Poly` / `GetContinent` / `GetTown` (`WdMadrigal.wld.cnt`);
    - `CWndMapEx::GetMapArea`, with names from `propMapComboBoxData.inc` (`LoadPropMapComboBoxData`);
    - `CWorld::LoadRegion` / `ReadRegion` (`.rgn`) and the client's per-frame region loop (`WndWorld.cpp:9258`; caption style `bdf9f5cb`);
    - `CWorldMng::LoadScript` world titles, and the `LoadStrings` order for the world string files;
    - `TextCmd_Teleport` (`/te <world id> <x> <z>`).
  - Findings:
    - Town blocks in `.wld.cnt` have `C_useRealData 0`, so `GetTown` never finds a town (the map window never opens Flarine / Sain City / Darken / Eillun by itself).
    - The Flaris polygon has a stray vertex (7087, 8157), so it is self-intersecting.
    - `WdArena_1`'s strings file is not in `LoadStrings`, so its area names show as raw `IDS_` keys.
    - Valley of the Risen has no NPC.
    - Collins stands in three towns (Flaris, Saint Morning, Darkon 1, 2).
    - `readDyo` now treats `OT_SHIP` like `CObj` (`CShip` → `CCtrl::Read` = `CObj::Read`); no map holds one.
  - Real data: 427 NPC spots on 19 maps. WdMadrigal: Flaris 143, Saint Morning 72, Darkon 1, 2 49, Kaillun Grassland 39, Darkon 3 27, Shaduwar 6, Bahara Desert 4, Garden of Rhisis 2, outside every continent 4 (the map window shows "Madrigal").
  - Anchors in tests: the NPCs removed "from Flaris" in `b6abf414` are in Flaris; the `CContinent::GetRevivalPos` points land in Flaris / Saint Morning / Darkon 1, 2.
  - Independent copy: 427 NPC spots, 300 random walks (seeded `xRand`, 84,000 frames), 4,662 grid points over the Flaris polygon, small polygons, continent, map-window and region files. JS and Python agree on every case.
  - 16 one-line bugs were planted in the Python copy one at a time, and all 16 were caught. Cases were added for the 4 that slipped through at first: overlapping continents (id order), a duplicate map-window location, an old-format desc size of 256 (a `char`), and an empty `SetTitle( "" )`.
  - Not modelled: `RA_INN` regions (need the land height), caption timers, regions the server adds at run time, and the map window in other worlds (the world title names those).
  - `tools/refresh-fixtures.sh` and the UI harness also carry the region, string and continent files.

- **Add New NPC, step 1** (2026-10-06, committed `7cbb9c9`, NOT tested in game yet): plan `/home/kevin/.claude/plans/magical-spinning-knuth.md`.
  - `edit/npc-ops.js` (`newNpcPlan`, `buildRecord`, `insertPoint`), `validate/newnpc.js` (27 `NN_*` codes, handoff §6), `ui/new-npc.js`, `loaders/newnpc-sim.js`.
  - Core: `SourceFile` binary kind; the workspace keeps each map's `.dyo` as an editable file (`setMapFiles`, `refreshMaps`); string tables reload when a `.txt.txt` changes; save/backup/client sync handle files in sub-folders.
  - Findings: x/z ÷ 4 (`OLD_MPU`); insert at the final `FFFFFFFF`; the right-click popup lists menus by id (not AddMenu order) with a few special labels; V19 always opens it.
  - Python copy: 125 forms (the §5 example, every World.inc map, both sides of every rule, menu order); 16 one-line bugs planted, all caught (3 needed new cases: a job rule; a made-up `MMI_` 349/350 define).
  - 1d (after the user's test): Model list dropdown + file/texture line; new building tag (defineNeuz.h + etc.inc + etc.txt.txt, `b4b9a465` way, rows 18/19); `etc.txt.txt` added to the string tables; models of NPCs hidden in `b6abf414` count as proven. Python copy: 152 forms + 12 small etc.inc structure files; 11 more planted bugs caught (5 needed new cases: rows at MAX_STRUCTURE, a 32-character existing name, `[ x` spacing, blocks after the structure block, a tag whose text but not define exists).

## Next (in this order, agreed with the user)

**What's left, in this order (the user, 2026-10-09; FLYFF TODOS.md has the same list):** H part 2 (done) → **Boxes: filter by what's inside** (Fashion, Armor, Weapons, Pets, Scrolls…, from `loaders/item-category.js`) → **I. Rates & Buffs** → **K. Upgrade rates** → **G. Item set and weapon effects** → **C. GM Commands list** → L → M. Add NPC step 3 is covered by + Menu → Rules text (`376f694`, tested in game). Quest rewards and collecting in "Where is this item from?": later.

**Order (agreed 2026-10-06; tasks S, V, D-sim, C and H–M added that day; kept as history, see the line above):**
1. Add New NPC step 1: committed (`7cbb9c9`), **not tested in game yet**. Do the in-game test (handoff §8) before calling it done; fix what it finds before starting S.
2. **S. Shops: everything editable** (asked 2026-10-06: "the idea is we're able to edit everything in a shop").
3. ~~V. Save History~~ **skipped (the user, 2026-10-09)**: backups + git cover it. Steps 0 / 0b (paste /position, loading window) were built and kept (`85012df`).
4. **H. "Where is this item from / used?"** (every way to get an item: shops, exchanges, monster drops, boxes, rewards, quests).
5. **D-sim. Donation Shop simulator** (the only finished editor without a "what happens in game" test).
6. **C. GM Commands list** (every GM command, searchable, by category, with plain-English descriptions).
7. Add New NPC step 2 (exchange NPCs + new menus, Jeff's Weapon Pieces): **done, user-tested in Brave and committed 2026-10-07** (+ exchanges inside NPC Shops, percent chances, Random rewards). Jeff is on test-data only; in-game test pending.
8. Add New NPC step 3 (edit NPC menus + info boards, Guild Siege rules).
9. **I. Rates & Buffs** (server rates, level-up gifts, rebirth tiers, guild buff, server buff, couple; buff descriptions written from the stats).
10. F. Monster drops: add / remove / change what each monster drops (the Rates calculator then shows real drop chances).
11. **J. Boxes: create and edit treasure boxes (1 random of N), sets / bundles (everything inside) and single-item boxes.**
12. **K. Upgrade rates.**
13. **L. Monster Hunt + Badges + Collecting.**
14. G. Item set effects and weapon effects.
15. **M. Teleporter.**

**Every task gets a simulator + its independent Python copy (CLAUDE.md rule), so the user can see what would happen in game before testing in game.** The user may move tasks (e.g. L earlier if the badge TODOs become urgent). Sections H–M below are leads from a first look, not finished investigations: read the C++ named there before designing anything.

### Add New NPC (handoff written 2026-10-05, branch `ccr-25b694d1-jie3e1`, merged)
- Spec: **`docs/HANDOFF-ADD-NPC.md`** (read it whole first). In the web app the user creates an NPC, places it on a map (a new 200-byte record in `World/<map>/<map>.dyo`), ticks its right-click menus, and gives it up to 4 shop tabs with items. The app validates (§6, with self-tests §6.5), shows the exact text and bytes, backs up, writes the 6 files (Server + Client), reads them back and validates again (§7). In-game checklist: §8; out of scope: §9; build order: §10.
- `docs/resource-forensics.csv`: encoding, BOM and line ending of every Resource file (byte-exact saves).
- Reuses `loaders/world.js` (.dyo reading, IsUsableDYO2), `loaders/character.js`, `loaders/vendor-sim.js`. The area names (task above) help choose where to place the NPC.
- Simulator rule: port what the server does with the new NPC (LoadCharacter + .dyo read + shop fill), plus an independent Python copy, as for every task.

### Add New NPC: Step 2 and Step 3 (agreed 2026-10-06)
- **Step 2:** built 2026-10-06 (see the handoff): new exchange menus on any character.inc NPC (`MMI_` 282-349, label `TID_MMI_*` = 7000 + id) + new exchanges in a menu; Jeff's 6 Weapon Pieces menus (`7b1210d4`; Weapon Pieces handoff Step 3) applied to test-data.
- **Step 3:** the info-board texts an NPC's menus show (adding / removing `AddMenu` moved to task S part 1, built 2026-10-07).
  - Example: the Guild Siege manager `MaFl_GuildWar`. `MMI_GUILDCOMBAT_INFO_BOARD1/2/3` and `MMI_GUILDCOMBAT_INFO_TEX` load the client-only `Client/Client/GuildCombatTEXT_<n>_<lang>.inc` (`WndWorld.cpp:4464-4620`, `CScript::Load` + `SetString`). Each file is ASCII, CRLF, with `#c` colour codes.
  - Goal: put the siege rules (TODO `13364001`) on a board.
  - Check which `<lang>` the client uses (`GetLangFileName`).
  - A brand-new info menu needs C++: a menu id without a `case` opens the exchange window.
  - Simulator + Python copy, as for every task.

### F. Monster drops (`propMoverEx.inc`)
> **Built 2026-10-08** (see the handoff on top and INVESTIGATION §1.18). The notes below were the first look; where they differ, §1.18 wins (80 DropKind lines, not 64; real chances use the biased roll; the 71.6% cap is really 80.15%). Left for task H: "which monsters drop this item" and the bulk actions. History sentences: the undo labels already read like them.
**For players' words (asked 2026-10-06: "add or remove the items dropped by a monster"):** pick a monster and see everything it drops, with the real chance. Then:
- **add** an item to its drops (item picker, chance, quantity);
- **remove** a drop;
- **change** a drop's chance or quantity;
- change its Penya drop (min–max) and how many items it can drop at most per kill (`Maxitem`).

Example of the monster view:
```
Mushpang (lv 15, Flaris)   drops up to 2 items per kill
  Twinkle Stone        10%     ×1     [✏️] [✖]
  Scroll of Awakening  0.5%    ×1     [✏️] [✖]
  + random lv 10–13 items (DropKind)
  Penya: 6–9 (× server rate 10)
  [+ Add a drop]
```
- Also the reverse, from an item: "which monsters drop this?" (shared with task H). Bulk actions: add one item to several monsters, or remove it from all.
- History sentences (task V): `Mushpang: added Scroll of Awakening as a drop (0.5%)`, `Mushpang: changed the chance of Twinkle Stone from 10% to 5%`, `Mushpang: removed Scroll of Awakening from its drops`.

**Loader:** port `LoadPropMoverEx` (`_Common/Project.cpp:2978`), including the `AI{}` sub-parser. `propMoverEx.inc` is UTF-8 without BOM, CRLF; raw bytes for the server.
- `DropItem( II_X, chance, level, count )`: the chance is out of 3,000,000,000 (`CDropItemGenerator::GetAt`, `Project.cpp:184`, `xRandom( 3000000000 )`).
- `DropKind( IK3, a, b )`: `a` and `b` are ignored; rarity = monster level −5 … −2.
- `DropGold( min, max )`, `Maxitem = n`.
- Unknown words (`DDropGold`, `AddSummonMonster`) are silently skipped by the loader.

**Edits:**
- Statement splices inside the monster's `{ }` block. A new line copies the indent and EOL of a neighbouring `DropItem`.
- Show chances as % in the editor; files always get the plain number.
- The chance box allows at most 2,147,483,647, which the server can actually reach.

**Validation:**
- an `MI_` id out of range → the server hangs at startup (BLOCK: `continue` inside a do-while);
- an unknown `MI_` → the drops land on mover 0 (BLOCK);
- an unknown `II_` → drop of item 0 + error log (BLOCK);
- `DropItem` chance > 2,147,483,647: `atoi` caps it, so `3000000000` is 71.6%, not 100%. 518 lines today (WARN; show the effective %);
- a monster's block appearing twice: drops are appended from both blocks (WARN).

**Simulator:** port the kill → drop path (`CMover` drop code around `Mover.cpp:8604`: `m_DropItemGenerator.GetAt`, `Maxitem`, the item / gold / event rates and the unique mode) with the server's `xRandom`:
- "kill this monster N times": how often each item drops, and the Penya;
- uses the server rates from task I when that is built (`Event.lua` "Server Rates" today ×10 drop).

Python copy, as for every task.

### G. Item set effects and weapon effects (asked 2026-10-06)
- What the bonuses of an item set (wearing N pieces) and a weapon's effects give a character, edited in the app.
- First find in the C++ and the commits which files and loaders hold them. Leads: the `SetItem` blocks of `propItemEtc.inc` (`_Common/Project.cpp:4567`, the same file as `LoadPiercingAvail`), the item's own stat values in `Spec_Item.txt`, and `randomoption.inc` / `ItemMergeRandomOption.txt`.
- Simulator: a character wears / wields the items, and the simulator applies the bonuses the way the server does, giving the stats the game would show. Plus the independent Python copy, as for every task.

### S. Shops: everything editable (asked 2026-10-06)
**Widened 2026-10-07** (the user, testing Peach in Brave: "can't we edit an existing NPC… adding tab, renaming tab… even renaming npc", "move NPC / change model", "Donation Shop: add a new category"): S = everything about an existing NPC + its shop. Parts:
1. Name, tabs, menus: **built 2026-10-07**, committed `1a59e97`.
2. Rule rows editable + what players pay / get back: **built 2026-10-07** (handoff above).
3. Move NPC / change model: **built 2026-10-07** (same map, one spot at a time, model on all spots optional; handoff above).
4. Donation Shop categories: **built + user-tested 2026-10-08** (handoff above; needs `docs/patches/donation-tree.diff` in the client for order + card text).
Also built in part 1: the item list's own categories (Pets › Raised / Pickup / Buff…).

**Why:** today only fixed items (`AddShopItem` / `AddVenderItem2`) are editable. Items that come from an `AddVendorItem` rule show in the shop but can't be priced or removed.
- Example: Peach `MaFl_Peach` (character.inc ~7520) and Raia (~9519) each have `AddVendorItem( 0, IK3_GENERAL_RANDOMOPTION_GEN, -1, 190, 190, 100 )` → Scroll of Awakening (`dwCost` 100,000), and `IK3_SYSTEMPET_RANDOMOPTION_GEN` → Scroll of Pet Awakening (200,000).

**What the server allows** (port it; these limits must be shown, not hidden):
- A rule item's price is the item's own `dwCost` (Spec_Item.txt). One value per item: it is the price in every shop that sells it and the base of the sell-back price.
- `AddShopItem( tab, II_X, price )` also overwrites that same `dwCost` server-wide (`Project.cpp` AddShopItem branch; already a rule in this editor).
- A rule can't drop one item for one shop. Only `dwShopAble = -1` hides an item from every rule in every shop.

**What to build:**
1. **Every row editable.** A row from a rule gets the same price box and ✕ as a fixed item. Editing it asks:
   - **Make it a fixed item (default; the user's proven way, `73ee4bd6` re-priced only with `AddShopItem` lines):** replace the rule with `AddShopItem( tab, II_X, price )` for each item it gave in this shop (simulate with `vendor-sim.js`, same order), then apply the edit. One undo step. If the rule matched more items than the one edited, list them all in the preview.
   - **Change the base price (`dwCost`)** in Spec_Item.txt (Server + Client, the `item-ops.js` way, like chip prices `93a02124` / `fea9840b`). The preview names every other shop and system that uses this price (task H can supply it later).
2. **✕ on a rule item:** convert to fixed items without it. Never set `dwShopAble = -1` silently: it removes the item from every rule shop, so it is a separate, named action with the list of shops affected.
3. **Rules themselves** (moves the Deferred item here): add / edit / remove `AddVendorItem` (tab, IK3, job, rarity min–max), with a live preview of the generated items from `vendor-sim.js`, the 100-per-tab cap and `VENDORITEM//` no-match warnings.
4. **Same-price check:** when two shops sell the same item at different prices (e.g. Peach converted, Raia still on the rule), warn. Only one `dwCost` exists, so the last NPC loaded wins.

**Simulator:** `vendor-sim.js` already ports ProcessRegenItem. Add the buy price the player pays (find where the shop price is computed for a normal Penya shop) and the sell-back price, so the preview shows "players pay / get back". Python copy in `tools/oracle.py`.

### V. Save History (asked 2026-10-06; SKIPPED 2026-10-09, kept here only as a reference)
**In plain words (how the user described it, keep the UI this simple):**
- Every Save is a save point. A **History** screen lists them, newest first, per task, so saved work can be undone without git.
- Each row says what was done, in game words, never file names or line numbers:
  ```
  Today 2:32 PM — NPC Shops
    ✏️ Peach: changed the price of Scroll of Awakening from 100,000 to 500,000 Penya
    ➕ Peach: added Scroll of Holy for 300,000 Penya
    ➖ Raia: removed Blessing of the Goddess
  ```
- Buttons on each save:
  - **👁 View:** the shop / Battle Pass / exchange as it was then, read-only.
  - **↩ Undo this save:** takes back only that save and keeps everything done after it.
  - **⏪ Go back to this point:** everything exactly as it was, after listing what would be lost.
  - **📌 Keep** + a note (e.g. "tested in game, works"): never pruned.
- Undoing is itself a save, so the replaced version stays in the history. Nothing is lost.
- A file edited outside the editor shows a ⚠ row. After an undo: "restart the server and client".

**Wording standard** (in-game names, comma numbers; a save with many changes shows a summary that opens, e.g. `Peach: 12 changes (3 prices, 5 added, 4 removed) ▸`):
- NPC Shops:
  - `Peach (tab 1): changed the price of X from 100,000 to 500,000 Penya` / `… chip price of X from 5 to 8 Red Chips`;
  - `added X for N Penya` / `removed X` / `moved X from tab 1 to tab 2`;
  - `renamed tab 2 from "A" to "B"` / `changed the shop currency from Penya to Donate Chips`.
- Donation Shop: `added X to "Fashion" for N Donate Chips` / `changed the price of X from n to n Donate Chips` / `moved X from "A" to "B"` / `removed X`.
- Battle Pass:
  - `level 12: changed the reward from X ×1 to Y ×2` / `level 12: changed the cost from 3,000 to 3,500 points`;
  - `changed the season end from <date> to <date>` / `changed Mushpang's points from 2–4 to 3–6`.
- Exchanges: `Collins, exchange 3: changed the ingredient from 10 to 15 × Red Chip` / `… changed the chance of X from 40% to 25%` / `added exchange 7 (A → B)` / `removed exchange 2 (X)`.
- Add New NPC: `Created NPC "Lumi" on Madrigal, Flaris (x 6970, z 3337), menus: Trade, Bank, 2 shop tabs`.
- Restore: `Restored the 10:00 save: changed the chip price of X from 8 back to 5`.

**The shared-file risk (must be solved, not just warned about):**
- Files written by more than one task: today `Spec_Item.txt` (NPC Shops + Donation Shop chip prices, `workspace.js` `editsSpec`) and `character.inc` (shop edits + Add New NPC); later also task S, I (`Spec_Item.txt`, `propItem.txt.txt`) and Add NPC step 2.
- Putting back a whole old file would silently undo other tasks' later saves. The default undo therefore reverses ONLY that save's lines.
- Example:
  - 10:00 NPC Shops: Scroll of Awakening chip 5 → 8;
  - 12:10 Donation Shop: Nexus Shield 50 → 80;
  - Undo the 10:00 save → Scroll back to 5, Nexus Shield stays 80.
- If a later save changed the same line, stop and ask: "changed again later (8 → 10): keep 10, go back to 5, or cancel?". Never guess.

**What to build, in order:**
1. **Richer saves** (`io/save.js`): the manifest also stores the undo labels of the save (with NPC / menu / item names) and a fingerprint (hash) of each file before and after. Backups already hold the before-bytes. "After" = the next save's backup of that file, or the disk when no later save exists; a fingerprint mismatch = "changed outside the editor".
2. **Plain-words comparer** (new `history/describe.js`):
   - load two versions with the existing loaders and describe the difference in the wording above, one part per task;
   - it also covers old backups (no labels) and outside edits.
3. **History screen** (new `ui/history.js`): list from the backups folder (`fsa.backupCopies` / the `<stamp>_<task>` folders, like Battle Pass "Past seasons"), View (read-only), Keep + note (stored in the save's folder), search by item / NPC. Read-only: build and ship this first.
4. **Undo this save** (new `history/restore.js`):
   - **3-way, line level:** A = before the save, B = after it, C = now. Apply only the A↔B changes onto C (`core/diff.js` Myers is already here). Overlap with a later change → stop and ask.
   - **Map files (`.dyo`):** remove or restore that NPC's 200-byte record by key + position, not by offset.
   - Then a normal save: verified backup, write, verify, Client sync, the task's validators and simulator.
5. **Go back to this point:** whole files from that backup, only after listing every later change (any task, and outside edits) it would undo.
6. **Tests + Python copy** (the project rule):
   - histories: undo an old save while keeping later ones; two tasks on `Spec_Item.txt`; a same-line collision; an outside edit; an NPC added then undone; undo of an undo;
   - planted bugs in the Python copy must be caught.

### D-sim. Donation Shop simulator (agreed 2026-10-06)
**For players' words:** "Try it" in the Donation Shop editor. Pick an item, a quantity and a bag (Donate Chips owned, free slots) and see exactly what the player gets: bought, "not enough chips", "bag full", or refused.

**Port:**
- the server's `CDPSrvr::OnBuyDonationItem` (`WORLDSERVER/DPSrvr.cpp:3636`, packet `PACKETTYPE_BUYDONATIONITEM`):
  - the allow-list built by `CProject::LoadDonationShop` (`_Common/ProjectCmn.cpp:1845`);
  - price = the item's `dwReferValue1` (shared chip price, `7bedef15`) × quantity, paid in `II_CHP_DONATE`;
  - the chip check, the bag check (`IsFull` / `GetEmptyCount`, as in `exchange-sim.js`), and item creation;
- the client's confirm dialog `CWndConfirmBuyDonation` (`_Interface/WndDonationShop.h`), for what the player sees.
- Keep the crash items (Nexus Shield, Icecrown Purple Shield, `ae345504`) as a BLOCK and show why.

**Tests:** cases for exact chips, one chip short, a full bag, a stack that fits, max quantity, an item not in the list. Python copy in `tools/oracle_sim.py donation`; planted bugs must be caught. Then update CLAUDE.md's simulator status table (Donation Shop: done).

### C. GM Commands list (asked 2026-10-06)
**For players' words:** every GM command in one searchable page (and whether it really works on this server), grouped by category (Item & Inventory, Guild Siege, Monster / NPC, Teleport, Server, Moderation, Events, Custom…). Each command shows:
- the name and short alias, e.g. `/createitem` (`/ci`);
- who can use it: Player / GM 1 / GM 2 / GM 3 / Admin (`AUTH_GENERAL`, `AUTH_GAMEMASTER`, `AUTH_GAMEMASTER2`, `AUTH_GAMEMASTER3`, `AUTH_ADMINISTRATOR`);
- what it does, in plain English;
- how to type it, with an example;
- a **Copy** button.

Example:
```
🔍 [ siege          ]   Category: [ All ▾ ]   Who: [ All ▾ ]
Guild Siege
  /GCOpen (/gcopen)   GM 3   Opens Guild Combat (it must be closed)     [Copy]
  /GCClose (/gcclose) GM 3   Closes Guild Combat now or queues a close   [Copy]
```

**Where the data comes from:**
- **Live, read-only from the C++:** `Source/Source/_Interface/FuncTextCmd.cpp`, the `ON_TEXTCMDFUNC( handler, "name", "alias", "kor name", "kor alias", TCM_SERVER|TCM_CLIENT|TCM_BOTH, AUTH_*, "description" )` table. 257 entries today: 165 AUTH_ADMINISTRATOR, 36 AUTH_GAMEMASTER3, 11 AUTH_GAMEMASTER2, 5 AUTH_GAMEMASTER, 40 AUTH_GENERAL. Its descriptions are mostly Korean.
- Respect the `#ifdef` / `#if __VER` blocks around entries: only commands compiled into the WorldServer / Neuz builds count (same feature defines as `VersionCommon.h` + `CustomCommon.h`). Show the line number.
- **English descriptions and categories:** from the guides repo's `GM_COMMANDS_MASTER_LIST.md`, which has 17 categories with one-line descriptions and links to deep-dive guides (CREATEITEM, CREATENPC, LEVEL, RITEM). That list is out of date: it says 235 commands; the C++ has 257 now. Bundle a copy into the editor at build time.
- A command in the C++ but not in the master list shows its Korean description and "not described yet", so new commands (e.g. `/weather`, `4f268007`) never go missing.
- Offer to append missing ones to the master list text (the guides repo is the user's; ask first).

**Handy links from other tasks:**
- in Add New NPC / "Where each NPC stands", show `/te` to go there;
- in item views, show `/createitem <id>` to get the item for an in-game test.

**Big finding: about 108 commands can never be used on this server.**
- `ParsingCommand` (`FuncTextCmd.cpp:6103`) walks the table in source order and, on any non-Korean build, does `if( command starts with "open" ) break;`. IDS_LANG is 1 (USA), so every entry after `open` is unreachable.
- Your own comments above `ResetBattlePass` / `GWPrizePayout` say so: `/rrbp` "silently did nothing" until it was moved above `open`.
- Today about 108 entries sit after it (e.g. `/close`, `/music`, `/sound`, `/SetPlayerName`, `/SetGuildName`, `/DeclWar`, `/gmitem`). The common ones (`/createitem`, `/createnpc`, `/teleport`, `/level`, `/getgold`, `/GCOpen`, `/weather`) are before it and work.
- The page marks each dead one "❌ Can't be used on this server (listed after /open)". This is also a tip for the C++ side: move a needed command above `open`, the way `/rrbp` was moved.

**Simulator (port of `ParsingCommand`):** "type a command as Player / GM 1 / GM 2 / GM 3 / Admin" →
- **which entry matches:** name, alias or Korean name/alias, first match in source order, and the `open` break;
- **is the level high enough:** `m_dwAuthorization` compare;
- **where it runs:** client, server or both (`TCM_*`). On the client, a TCM_SERVER command is just sent as chat to the server.

Result: "works", "your level is too low", "can't be used on this server", or "unknown command".

Tests: the table parse (count, the `#ifdef` handling, the `open` cut-off) and the simulator cases, checked by an independent Python copy of the same file. Planted bugs (e.g. `continue` instead of `break`) must be caught.

### H. "Where is this item from / used?" (asked 2026-10-06; widened the same day: "where can it be dropped or obtained"; part 1 built 2026-10-09; part 2 (gifts, Guild Siege) built 2026-10-09; quests and collecting later)
**For players' words:** pick any item and see every way a player can GET it, and where it is USED. Example:
```
Scroll of Awakening
  🛒 Bought from:   Peach (Flaris) — 100,000 Penya · Raia (Darkon) — 100,000 Penya
  🔁 Exchanged at:  Collins — 5 × Red Chip
  ⚔️ Dropped by:    Mushpang (lv 15) — 0.5% · Giant Mushpang (lv 20) — 2%
  🎁 Found in box:  Lucky Scroll Box — 10% chance
  🏆 Rewards:       Battle Pass level 12 · Level-up gift at lv 60 · Quest "…"
  🔧 Used in:       Collins exchange 3 (ingredient)
```
- Each line names the NPC with its town (`loaders/area.js`), the monster with its level (`loaders/propmover.js`), prices with commas, and chances as the server really rolls them. Each line is a link that jumps to it in its editor.
- Show "Can't be obtained in game" when nothing gives it (e.g. only GM-created). Also show "only in a shop that is not placed on any map" / "hidden by SetOutput( false )" (`loaders/world.js`).

**Sources (get):**

| Source | File | How |
|---|---|---|
| NPC shops | `character*.inc` | `AddShopItem` / `AddVenderItem2`, plus `AddVendorItem` rules through `vendor-sim.js` |
| Donation Shop | `DonationShop.inc` | |
| Exchange rewards | `Exchange_Script.txt` | PAY, with the server's chance (`exchange-sim.js`) |
| Monster drops | `propMoverEx.inc` | `LoadPropMoverEx`, `Project.cpp:2978`: DropItem (chance out of 3,000,000,000; values > INT_MAX are capped by `atoi`) and DropKind (rarity = monster level −5 … −2) |
| Event drops | `propDropEvent.inc` | `LoadDropEvent`, `Project.cpp:4013` |
| Boxes | `propGiftbox.inc` / `propPackItem.inc` | `LoadGiftbox` / `LoadPackItem` |
| Battle Pass rewards | `BattlePass.inc` | |
| Level-up gifts | `Event.lua` | `SetLevelUpGift` |
| Couple gifts | `couple.inc` | Item section |
| Monster Hunt rewards | `MonsterHunt.inc` | `AddReward` |
| Quest rewards | `propQuest*.inc` | `LoadPropQuest`, `Project.cpp:1704`, the reward-item statements |

**Uses (spend):** exchange ingredients and other recipes as later tasks add them.

**Build note:**
- H needs only READ-ONLY loaders for drops, boxes, quests, Event.lua gifts and Monster Hunt. Build those minimal readers here (port the named C++ for the item / chance parts only).
- F, J, I and L later grow them into full editors; don't wait for them.
- Each new reader cites its C++ and gets the Python cross-check, as usual.

**Checks shown with it:**
- sold in a shop cheaper than an exchange or box gives it;
- in a shop but `dwShopAble = -1`;
- an `AddShopItem` price that overrides the item server-wide (name the NPC);
- an item that is a reward somewhere but can't be bought or dropped anywhere (fine, just shown).

**Simulator:** none of its own. It reports what the other loaders / simulators produce (real shop contents, server drop chances). Python copy: an independent cross-reference of the same files in `tools/oracle_sim.py`.

### I. Rates & Buffs (asked 2026-10-06)
**Files, and the C++ that reads each one:**

| What | File | Loader |
|---|---|---|
| Server rates + level-up gifts | `Event.lua` (Lua) | `CEventLua`, `_Common/EventLua.cpp:176` |
| Rebirth tiers | `1Rebirth.inc` | `_Common/Project.cpp:6062` |
| Guild buff tiers | `GuildBuff.txt` | `_Common/GuildBuff.cpp:15` |
| Server buff tiers | `ServerBuff.txt` | `_Common/ServerBuff.cpp:30` |
| Couple | `couple.inc` | `CCoupleProperty::Initialize`, `_Common/couple.cpp:234` |

All five came in with the import commit `3ebc5356`. `Event.lua` was also changed by `4f268007` (`/weather`, the EXP bonus while it rains or snows).

**Server rates:**
- The real rates are the `Event.lua` event "Server Rates", running 2007-12-31 → 2099-12-31: `SetExpFactor( 30 )`, `SetGoldDropFactor( 10 )`, `SetItemDropRate( 10 )`, plus `SetWeatherEvent( 1.5, … )`.
- **Trap:** `Constant.inc` has `itemDropRate` / `goldDropRate` / `monsterExpRate`, but `CProject::LoadConstant` (`_Common/Project.cpp:1182`) only reads the block whose `lang` equals the server language. The server is LANG_USA (`WorldServer.rc:137`), and the file has only KOR / JAP / CHI blocks, so **Constant.inc changes nothing**. Show it as INFO and never offer it as the place to change rates.
- `Event.lua` is Lua, not CScanner. Port only the `AddEvent` / `SetTime` / `Set*` calls the server registers (`EventLua.cpp`), and edit them as statement splices.
- Level-up gifts: `SetLevelUpGift( level, "all", "II_…", qty, flag, minutes )` in the event "Level Up Rewards". Edit them as a ladder, like the Battle Pass reward ladder.

**Couple (first look):**
- `couple.inc` has four sections:
  - **Level:** points per level. 50 rows, but `couple.h` caps couples at `eMaxLevel = 21`, so rows 22–50 are unused (INFO).
  - **Item:** gifts per level (item, sex, flag 2 = bound, minutes, count).
  - **SkillKind:** `II_COUPLE_BUFF_POWER_01` / `BLESS_01` / `MIRACLE_01`.
  - **SkillLevel:** couple level → buff level per kind. Buff item = kind + level − 1 (`LoadSkillLevel`, `couple.cpp:317`). Rows are carried forward.
- `CUser::ProcessCouple` (`WORLDSERVER/User.cpp:3993`):
  - buffs are on only while the partner is online;
  - the couple gets 1 point per tick block, counted for only one of the two partners;
  - the buff is applied only when no `IK3_COUPLE_BUFF` buff is active, so after a couple level-up the old buff level probably stays until it is removed (partner offline / relog). Needs an in-game check.
- What the buffs really give (Spec_Item.txt):
  - POWER 01–04: `DST_ATKPOWER_RATE` 3 / 5 / 8 / 10;
  - BLESS 01–03: `DST_HP_MAX_RATE` 5 / 7 / 10;
  - MIRACLE 01: `DST_SPEED` +20.
- **The descriptions are wrong:** Power says "All Stats and Attack Power" (attack only), Bless says "Max HP and Movement Speed" (HP only), Miracle says "PvE Damage" (it is movement speed). Rule: warn when a buff's description doesn't match its stats.

**Descriptions from stats (asked):**
- For buff items edited here (couple, guild, server buff), offer to rewrite the item's description (`szCommand` IDS → `propItem.txt.txt`, Server + Client, UTF-16LE) from its real stats, in the house style ("Attack +10%, Max HP +10%").
- Show it as a preview first; it is part of the same undo step as the stat change.

**Simulator:**
- A rate calculator: for a player (rebirth tier, guild buff tier, server buff tier, couple level, weather, active events), the EXP, Penya and drop multipliers per kill.
- Port how the server COMBINES them: first find where each factor is applied (kill EXP, gold drop, item drop) and whether they multiply or add. Don't guess.
- F extends the calculator with per-monster drop chances.
- Python copy, as for every task.

### J. Boxes: create and edit random boxes, sets and bundles (asked 2026-10-06; widened 2026-10-07)
> **Part 1 built 2026-10-08** (view / edit existing boxes + simulator; INVESTIGATION §1.19). **Part 2 next:** + New box. Decisions 2026-10-08: no fashion-set helper (dropped below); the look is a combo + picture like the + NPC model picker (not the gallery grid), listing only looks that have an `mdlDyna.inc` box line (65 of 66), and the new box copies that line (without one a dropped box shows the vagrant helmet, `ModelMng.cpp:42-44`; `949f2cc2` added none). Spec_Item rows have 171 tab columns = 175 tokens (`"""x"""` is 3 tokens). New ids: 31671-59999 (60000+ is used by `__NEW_STACKABLE_AMPS`, `ProjectCmn.cpp:593`); template row `II_SYS_SYS_SCR_BXMCOOK01` (FASHION_SET_TO_BOX_GUIDE); `Source/Resource/defineItem.h` only matters when C++ uses the id.
**For players' words:** make a new box item in one form. Pick what kind of box:
1. **Treasure box: "get 1 random item out of N".** Add items, set each one's chance in plain %, and see a bar that must add up to 100%.
2. **Set / bundle box: "get everything inside".** E.g. a fashion set (hat, suit, gloves, shoes) or a starter pack.
3. **Single-item box:** a bundle with one item.

Also view / edit / remove the 487 random boxes and 844 packs that exist today, and an **"Open it 1,000 times"** test that shows what players would really get.

Example form:
```
New box:  [ Infinity Treasure Box ]   Type: (•) 1 random item  ( ) everything inside
  Item                      Amount  Chance   Bound  Time limit  Upgrade
  Scroll of Awakening        ×1      40%      ☐      —           —
  Blessing of the Goddess    ×1      35%      ☐      —           —
  Sentinel Mask              ×1      20%      ☑      7 days      —
  Iron Sword                 ×1       5%      ☐      —           +5
  ─────────────────────────────────── 100% ✓
```

**Amount per line (asked 2026-10-07: "a moonstone in a box, n number"):** each line has its own amount, from 1 up to that item's stack size (`dwPackMax`). For example, Moonstones, Sunstones and scrolls can go up to **999**, and gear only up to 1.
- To give more than one stack, add another line of the same item. In a set/bundle, each line needs one free bag slot.
- In a random box, each choice can have a different amount (e.g. Moonstone ×10 at 50%, Moonstone ×50 at 30%).
- Show the limit next to the input ("max 999"). An amount above it is a BLOCK.

**System 1: random box** (`propGiftbox.inc`, UTF-16LE + BOM, CRLF, **server only**; the client doesn't load it)
- Loader: `CProject::LoadGiftbox`, and `CGiftboxMan::AddItem` / `Open` / `Verify` (`_Common/Project.cpp`, around 4092). Opening: `CUser::DoUseGiftbox` (`WORLDSERVER/User.cpp:2983`). It runs for ANY used item whose id is a box here.
- 6 line types. They differ only in the chance unit and the extra columns:

  | Type | Columns | Chance ×, out of 1,000,000 | Count today |
  |---|---|---|---|
  | `GiftBox` | item, chance, amount | ×100 (per 10,000) | 392 |
  | `GiftBox2` | item, chance, amount | ×1 | |
  | `GiftBox3` | + flag | ×100 | 40 |
  | `GiftBox4` | + flag, minutes | ×100 | 23 |
  | `GiftBox5` | + flag, minutes | ×10 | 1 |
  | `GiftBox6` | + flag, minutes, +upgrade | ×10 | 31 |

  - flag: 2 = bound, 4 = keep the item's default.
  - The editor shows % only and picks the smallest type that holds the needed columns and precision.
- Roll: `xRandom( 1000000 )`, walking the running total.
  - `Verify()` gives the shortfall below 100% to the LAST item.
  - Items past 100% never drop (WARN; show the real chances).
  - A full bag: the box is NOT used up (`TID_GAME_LACKSPACE`).
- **Max 128 items per box** (`MAX_GIFTBOX_ITEM`). The server does NOT check it (array overflow): BLOCK.
- The same box id twice: its lines are appended (WARN).

**System 2: pack / set** (`propPackItem.inc`: Server ANSI CRLF, Client copy LF)
- The client loads it too (the Item Wiki, see the comment in `OpenProject`), so write both copies.
- Format: `PackItem <box item> <minutes, 0 = none> { <item> <+upgrade> <amount> ... }`.
- Loader: `CProject::LoadPackItem` / `CPackItem::AddItem`; opening: `CUser::DoUsePackItem` (`WORLDSERVER/User.cpp:2937`):
  - gives ALL items;
  - needs as many free bag slots as items, otherwise nothing is given;
  - the time limit applies to every item;
  - a bound box makes every item bound.
- **Max 24 items per pack** (`MAX_ITEM_PER_PACK`, `__VER >= 18`); more = load error (BLOCK).
- There is no gender choice inside a pack: the existing fashion sets are separate male / female boxes (e.g. `II_SYS_SYS_SCR_BXMTUXEDO01` = suit + gloves + shoes). ~~Fashion-set helper~~ (dropped by the user, 2026-10-08).

**The box item itself** (created in the same undo step, Server + Client):
- `Spec_Item.txt` row, copied from an existing box (e.g. "Box of Wish" `II_SYS_SYS_SCR_BXSSUIT`: `IK1_SYSTEM / IK2_SYSTEM / IK3_SCROLL`, usable, stack 1);
- `#define` in `defineItem.h` (next free id; no clash with existing ids);
- name and description in `propItem.txt.txt`;
- an icon (pick from existing box icons, or a new `.dds`);
- the drop-model line in `mdlDyna.inc` (copy the source box's line).
- The description is written from the contents: "Gives one of: Scroll of Awakening (40%), …" / "Contains: Tuxedo Suit, Tuxedo Gloves, Tuxedo Shoes".
- After saving, offer to put the box in a shop / the Donation Shop / an exchange / a monster's drops (links to those editors). No commit of the user's has added a box yet: the first one needs the in-game check (§ Deferred).

**Box item settings (asked 2026-10-07).** The box's own `Spec_Item.txt` row (Server + Client), checked against the C++ before writing this:

| Setting (UI words) | Field | What the server really does |
|---|---|---|
| **Price** ("costs N Penya in a shop") | `dwCost` (token 12) | A Penya shop sells it for `dwCost` (unless an `AddShopItem` price overrides it server-wide, see task S). Selling it back to an NPC pays **`dwCost / 4`** (`CDPSrvr` sell code, `WORLDSERVER/DPSrvr.cpp:3760`). Show both: "Shop price 100,000 · sells back for 25,000". |
| **Can be traded** (on/off) | `dwFlag` bit `IP_FLAG_BINDS` = 0x01 (token 17; `_Common/ProjectCmn.h:360`) | **Not `bCanTrade`:** that column is loaded (`ProjectCmn.cpp:822`) but never used anywhere. The real block is `CItemElem::IsBinds` (`_Common/Item.cpp:434`), checked by `CVTInfo::TradeSetItem2` (`_Common/MoverItem.cpp:221`, "can't trade this item"). Off = set the bit. Note shown in the UI: any copy with a time limit is also always untradeable. Check the private shop and NPC sell paths before promising more than "can't be traded". |
| **Stack size** ("up to N in one bag slot") | `dwPackMax` (token 4) | Existing boxes use 1; Moonstones and scrolls use 999. Also the cap for amounts INSIDE other boxes (a line's amount must be ≤ that item's `dwPackMax`). |
| ~~Level needed to open~~ | `dwLimitLevel1` (token 128) | **Dropped (user, 2026-10-07: "any level is alright").** Not offered: the server never checks it when a box is USED (`DoUseGiftbox` / `DoUsePackItem`; it is enforced only on equip, `_Common/MoverEquip.cpp:1696`). New boxes copy the source box's value (0 on existing boxes), so any level can open them. No V19 change wanted. |

**Box look picker (asked 2026-10-07: "choose a type of box, with a preview"):**
- A gallery of every box icon in the game: 66 different icons today, used by 1,330 box items, all present in `Client/Item/` as `.dds`. Each tile shows the icon, an example box name and how many boxes use it. Search by name, filter random / set.
- Most used: `Itm_SysSysScrBxLuck.dds` "Box of Lucky" (472 boxes), `itm_EveBalPBox.dds` (280), `itm_RandomPackBox01-32.dds` (133), plus treasure chests, gift boxes, seedings, bags, beads, eggs….
- A mock-up of all 66 was shown to the user on 2026-10-07; aim for that look: dark background, grid, name + count under each icon.
- Picking a look copies:
  - the icon file name into the box's `Spec_Item.txt` row (`szIcon`);
  - the box's ground model line in `mdlDyna.inc` from a box that uses that icon. Most boxes use the common `"SysSysScrBxCom"` model; copy the line, change only the `II_` id.
- **Needs a `.dds` reader in the editor** (it only has `ui/tga.js`): DXT1/3/5 + uncompressed. Treat the magenta key colour (255, 0, 255) as transparent, as the client does. Show icons at 2–3× with smoothing off, so they stay crisp.
- Optional later: **upload your own icon** (PNG → 32×32 with the magenta key, written as an uncompressed `.dds` to `Client/Item/`). Check in game that the client loads an uncompressed `.dds` before offering it.
- The preview also shows the icon as it looks in an inventory slot, with the box name and the generated description as the hover tooltip (reuse `loaders/item-tooltip.js`).

**Nesting:** a random box may give a pack box (e.g. a 5% chance of a whole fashion set). Show the nested contents in the preview.

**Simulator:** port `CGiftboxMan::Open` / `Verify` (with the server's `xRandom`) and `DoUseGiftbox` / `DoUsePackItem`, including bag space, the bound flag, time limits and +upgrade:
- "open this box N times with this bag": what came out, how often, refusals;
- nested boxes are opened too.

Python copy in `tools/oracle_sim.py boxes`; planted bugs (e.g. `<=` vs `<` on the roll edge, the `Verify` top-up) must be caught.

**Checked against the C++ on 2026-10-08 (the review of this plan).** Everything above holds. Found in the same check:
1. **`DoUseItem` runs before `DoUseGiftbox`** (`WORLDSERVER/User.cpp:3204-3208`), so a random box's item also goes through the normal use-item code. A new box copies the kinds of an existing box row (`IK3_SCROLL`, like Box of Wish), which is safe. A box with another kind could also do that kind's effect: do not offer a kind choice.
2. **A box id in both files acts as a pack.** `CPackItem::Open` is checked first (`User.cpp:3193`), so its `propGiftbox.inc` lines are never used. BLOCK.
3. **`IK3_BINDS` and `IK3_EVENTMAIN` items are always bound.** The loader sets `IP_FLAG_BINDS` on them (`_Common/Project.cpp:4996`), so "Can be traded" has no effect for those kinds. Say so next to the switch.
4. **Opening a random box does not open a box it gives.** The player gets the box item and opens it later. The simulator and preview show it as "then, when opened: …", not as an automatic open.
5. **A locked (`RefuseLockedItem`, `__ITEM_LOCK`) or expired box is refused** before any box code (`User.cpp:3150-3166`). The simulator models both.

### K. Upgrade rates (asked 2026-10-06)
- **Upgrade fees (asked 2026-10-07 at BoBoChan: "isn't there a fee they pay to the NPC?").** Penya taken from the player (C++, read 2026-10-07; no commit changes a fee):

  | Action | Fee | Where |
  |---|---|---|
  | Awakening | 100,000 | `CDPSrvr::OnAwakening`, `DPSrvr.cpp:12498` (const) |
  | Remove element | 100,000 | `CDPSrvr::OnRemoveAttribute`, `DPSrvr.cpp` (const `nPayPenya`) |
  | Add a piercing slot | `dwItemRare × (200 + 200 × (slots + 1))` | `CItemUpgrade::OnPiercingSize`, `ItemUpgrade.cpp:231` |
  | Remove piercing | 1,000,000 | `CItemUpgrade::OnPiercingRemove`, `ItemUpgrade.cpp:447` |
  | Safe piercing | 100,000 | `CItemUpgrade::SmeltSafetyPiercingSize`, `ItemUpgrade.cpp:797` |
  | Change item gender (Transy) | 500,000 / 2,000,000 | `ItemUpgrade.lua:51-52` (`nItemTransyLowLevel` / `HighLevel`) |
  | Safe upgrade (normal / general / accessory / element), normal upgrades | none (stones and scrolls only) | `SmeltSafety*` |

  The user's choices:
  - **Move the fixed fees to a data file.** One C++ change in FLYFF-V19-SOURCE, written as a patch like `docs/patches/npc-board.diff`: the server reads each fee from `ItemUpgrade.lua` globals (e.g. `nAwakeningPenya`), with today's values as C++ defaults.
  - **Build it with K.**
  - **An "Upgrade fees" screen:** every action, its fee and an edit box.
  - A simulator port and the Python copy, as for every task. In-game test after the build.
- Files:
  - `ItemUpgrade.lua` (Lua; `CItemUpgrade::LoadScript`, `WORLDSERVER/ItemUpgrade.cpp:59`);
  - `propEnchant.inc` (`LoadPropEnchant`, `Project.cpp:833`);
  - `WeaponRarity.inc` (`Project.cpp:497`);
  - the Ultimate files (`Ultimate_UltimateWeapon.txt`, `Ultimate_GemAbility.txt`).
- Related commits: the done items "Trim the success rate in upgrading" and "Weapon rarity" in the TODO list. Find their hashes in `../FLYFF-V19-SOURCE` before designing.
- Show the success / fail / break chance per level.
- Simulator: "average tries and Penya / materials to reach +N", plus the Python copy.

### L. Monster Hunt + Badges + Collecting (asked 2026-10-06)
- Files:
  - `MonsterHunt.inc` (`_Common/MonsterHunt.cpp:49`);
  - `Badge.inc` (`_Common/Badge.cpp:93`; the badge right of the name, `__BADGE_SYSTEM`);
  - `collecting.inc` (`CCollectingProperty::LoadScript`, `Project.cpp:935`).
- Pending user TODOs this task should make easy:
  - "Make the badge scroll only show the badges not given by rebirth or lvl 150";
  - "Add badges in the collecting area and remove them from the Monster Hunt".
- Rules: every hunt's badge exists; every badge has a way to be earned; no badge is given by two systems by mistake.
- Simulator: a player kills the listed monsters / collects, and which badge they get and when. Plus the Python copy.

### M. Teleporter (asked 2026-10-06)
- File: `Teleporter.inc` (`CTeleporter::ReadConfig`, `Project.cpp:955`). Each entry is `TELEPORT_CASE <world> <x> <y> <z> <type> "<name>" "<picture>"`.
- Add, move or rename spots; show each spot's area name with `loaders/area.js`; check the picture exists in the client.
- Simulator: the teleport window's list and where the player lands, plus the Python copy.

## Deferred (needs in-game testing on the user's Windows PC)
- In-game check of task S edits (a converted rule shop, a changed `dwCost`: buy and sell-back prices).
- The first save against the real `Server/Resource`, then copy to `Client/`, restart, and check in-game.
- An exchange in game after an edit (Server and Client copies saved together).
- Where NPCs stand: `/te <id> <x> <z>` to a few NPCs (Lui, Collins ×3, Adrian), then check the area name on screen and the map window (M) against the editor.
- A new Battle Pass season in game: free track at login, kill points, buying the pass back-pays (the season-1 pass item reused).

## Known data findings (pre-existing, shown as warnings or info)
- 6 NPCs have no `{` after their name (they work by accident).
- 500 `AddVendorItem` rules in `character-school.inc` match nothing.
- `KePe_Rocbin` has 3 tabs over the 100-item cap.
- `MaFl_SecretRoom_EAST`'s Trade menu is commented out on purpose.
- `MaFl_SecretRoom_EAST` and `MaDa_SecretRoom_WEST` list `II_CHP_RED` (Red Chip), whose `dwCost` is 0 since `94881aa2`: a Penya shop sells it for 1 Penya (`C_PRICE_MIN1`). Worth a decision: remove the line, or give it an AddShopItem price.
- `ResData.h` lines 1138–1140 have define names glued to their numbers (client UI, harmless).
