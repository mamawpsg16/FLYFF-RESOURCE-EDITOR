# Plan: Economy page (what players earn per hour, what things cost in hours)

Asked 2026-10-23 ("what can we do without Windows"); plan written 2026-10-24, OK'd the same day ("yes to all").

**Status 2026-10-24: all 3 steps built in one cloud session, waiting for the user's Brave test.** Changes from the plan while building: the currencies use the exact chance (1,000 simulated kills are too noisy for 0.2 % drops), Penya and loot stay simulated; loot is priced per drop (dropped equipment can be upgraded, which raises GetCost); a spot's cap is all its boxes (the biggest box is shown in the tooltip); the dungeon / race-map readers were not merged into `spawns.js` (both stay as they are, tested), but the race map's missing `/2` was fixed (INVESTIGATION.md §1.34).
Goal: guides `PLANS/Economy Retest/ECONOMY_RETEST_PLAN.md` **Step 1** ("expected rates from the simulators, no game needed"), done by the editor instead of ~30 hand runs of `drops-sim` / `where-sim` / `upgrade-sim`. Its results set the prices of the Penya shops, Waforu (Red Chips), Donaris / Amos (PVP Tokens), the Event Master, the Donation Shop and the mounts (TODOS "Retest the economy", and "Weapon + set sources", which waits for it).

**Read-only task** (like Where is this item from? / GM Commands): it writes no file. Every number links to the task that changes it ("Change this drop" → Monster Drops, "Change this price" → NPC Shops, "Change the rates" → Rates & Buffs), so a price can be fixed in two clicks.

## What the page shows

Top bar, used by every tab: **player level** (default 150), **kill speed** (4 / 15 / 30 kills a minute, or a typed number), **Gift Box party** on/off (2 rolls per kill, `loops=2`), **Event.lua rates** read from the file (EXP / Penya / Drop; a "what if" field per rate, not saved).

1. **💰 Farming spots** (main table). One row per spot = one map region with monsters (`.rgn` `respawn7` lines grouped by map + monster; 50 maps, 3,001 spawn lines). Columns: map, monsters (level, rank, how many), **kills a minute here** = min(your speed, what the spot can respawn), **Penya / hour**, **Sunstones / hour**, **Moonstones / hour**, **Red Chips / hour**, **loot sold to an NPC / hour** (Penya), set pieces / cards / other worth-noting drops per hour. Sort by any column; filter by map, level range, currency. A ⚠ when a spot's respawn, not your speed, limits the kills.
2. **🏷 Prices in hours.** Every item an NPC sells (Penya shops, the 5 chip-shop currencies) and the Donation Shop: price, currency, and **"= N hours of farming at the best spot for that currency"** (and at a picked spot). Sort by hours; highlight the cheapest / dearest outliers. Upgrade costs from `upgrade-sim` (+0 → +10 with protect, accessory, piercing, element, Ultimate) in hours too.
3. **📈 Per hour by level.** For one currency: the best spot at each level band (45-60, 60-75, 75-90, 90-105, 105-120, 120-135, 135-150), so the Lv45-105 gap ("Nothing measured for Lv45-105" in the retest plan) shows at a glance.
4. **📋 Copy as table.** The Step 1 "sim rows" of the retest plan as Markdown, ready to paste into `ECONOMY_RETEST_PLAN.md`.

## Where every number comes from (all already in the editor except the respawn cap)

| Number | Source (C++) | Editor code |
|---|---|---|
| Spawns: monster, how many, respawn time, box | `CWorld::ReadRespawn` (`_Common/WorldFile.cpp:554`): time x 0.7 (x 0.5 for Aibatt / Mushpang / Burudeng 1-3, not bosses), RANK_MATERIAL never spawned, RANK_GUARD only in the PK event | `loaders/minievent-racemap.js` `parse` (count, time, box, the x0.7 / x0.5 cut) and `loaders/dungeon.js` `regionMonsters` (counts only): merged into one shared reader |
| **Respawn cap (new)** | `CRespawner::Spawn` (`_Common/Respawn.cpp:373-500`), called once a second (`ThreadMng.cpp:359` `timeoutRespawn( 1000 )`): each line's timer counts down; below 0 it refills to its max and resets to `time × xRandom( 50, 150 ) / 100`; every other refill spawns only half (`m_bHalf`); Madrigal only: `m_fMonsterRebirthRate` / `m_fMonsterRespawnRate` (1.0 unless the DB game-rate row changes them, `DPDatabaseClient.cpp:1982`) | new `loaders/economy-sim.js` `respawnCap` (simulated with `Rand`, plus an exact average) |
| Penya per kill | `CMover::DropItem` Penya part + `PenyaTable::Roll` + rates + level gap | `dropsSim.penyaRange` / `run` |
| Sun / Moonstones, Red Chips, set pieces per kill | GetAt, gate, Maxitem stop, `propDropEvent` lines | `dropsSim.exactChances` (`perKill`) |
| Loot sell value | `CDPSrvr::OnSellItem` (`DPSrvr.cpp:3733-3766`), cost / 4 with the sell rate | `vendor-sim` `sellPrice` |
| Shop prices | AddShopItem / dwCost, chip price = `dwReferValue1` (`93a02124` / `fea9840b`), Donation price (`7bedef15`) | `vendor-sim`, `shop-window`, `donation-buy` |
| Upgrade costs | EnchantGeneral … + `UpgradeFees.lua` | `upgrade-sim` `expect` |
| Other ways to get an item | | `where.js` (a price row says "also from: …") |

Per hour = min(speed, cap) × 60 × per-kill. The cap of a spot is the sum of its lines' caps; one player is assumed to farm one spot alone (stated on the page).

## Not modelled (listed at the top of economy-sim.js and on the page)

- How fast a real player kills (the page asks for it; the in-game sessions of retest Step 2 measure it), walking between monsters, other players on the spot.
- Quests, mini events, Battle Pass, Guild Siege / FFA / TDM prizes (listed as "other income" from their own tasks, not per hour), player trade and the Secret Room tax.
- AI farming (Step 2 measures it).
- Where in the box a monster appears, monster AI, aggro.

## Simulator + independent Python copy (CLAUDE.md rule)

- `loaders/economy-sim.js`: `respawnCap(line, seconds, seed)` (the CRespawner timeline with `Rand`), `capAverage(line)` (exact: average timer = (time × E[xRandom(50,150)] / 100) + 1 s, half / full alternating), `spotHour(ws, spot, opts)` (cap + drops-sim per-kill numbers), `priceHours(...)`.
- `tools/economy-sim.js <map> [level=] [speed=] [loops=]`: prints the spots of a map and one price list, to replay by hand.
- `tools/oracle_sim.py economy`, written from the C++ without reading the JS: its own respawn timelines (full / half refills, kills faster and slower than the respawn, a line with 1 monster, a boss line, the Madrigal factors), every spot of 5 maps at 3 levels x 3 speeds, and price-hours for 50 shop rows. `tests/run-tests.js` requires identical results; planted bugs (a `<` for `<=` in the timer, the half refill, the x0.7 cut) must each fail a case.
- UI harness stage `economy` (sort, filter, the cap ⚠, a price row's link to NPC Shops).

## Steps (each one: build, tests, the user's Brave test, then commit + push)

1. **Spawns + respawn cap**: one shared `.rgn` reader (dungeon + race map move to it, their tests unchanged), `economy-sim.js` cap + Python copy. Tab 1 with kills a minute and Penya / hour only.
2. **All currencies + loot value** in tab 1, tab 3 (by level).
3. **Prices in hours** (tab 2) incl. upgrades, and **Copy as table** (tab 4). Then fill the retest plan's "sim" rows with the output.

Size: M (about 2-3 sessions).

## User decisions (2026-10-24: "yes to all")

1. Defaults: player Lv150, kill speeds 4 / 15 / 30 a minute.
2. Columns: Penya, Sunstone, Moonstone, Red Chip, loot sell value; set pieces and cards as "worth noting"; Perin, Event Tokens, PVP Tokens as "other income" (not from monsters).
3. Prices in hours: every NPC shop + the Donation Shop + upgrades + the mounts.
4. A spot = map + monster.

## Questions asked (answered above)

1. Default **player level and kill speeds**: Lv150 and 4 / 15 / 30 a minute (from the retest plan), or others?
2. Which **currencies / drops** get a column? Proposed: Penya, Sunstone, Moonstone, Red Chip, loot sell value; set pieces and cards as a "worth noting" list. Add Perin, Event Tokens, PVP Tokens (not from monsters: shown as "other income")?
3. **Prices in hours** for which shops? Proposed: every NPC shop + the Donation Shop + upgrades. Mounts too (47 new ones)?
4. A spot = **map + monster** (simple), or **map + nearby spawn boxes** of several monsters (closer to how people farm, more work)? Proposed: map + monster first.
