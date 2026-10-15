# Task: Consumable Stats editor (FLYFF-RESOURCE-EDITOR)

## Context
The user wants one page in the resource editor to see and change what every consumable gives: premium buff scrolls,
macarons, STR/DEX/INT/STA/DEF potions, balloons, timed foods (Bull Hams...), couple buffs, cards (Part 2 of the premium
task) and so on: which stats, how much, and for how long. Today this is only possible by hand-editing Spec_Item.txt.

Scope of this task: view + edit the stats and duration of EXISTING consumables (no C++ change, no new items). Creating
new consumables can reuse `itemOps.newItemPlan` in a later step if wanted. The pending title-over-HP-bar test and its
commit are separate (V19).

## What the game does (V19, read-only)
- Stats live in the same 6 slots weapons use: dwDestParam1-6 / nAdjParamVal1-6 / dwChgParamVal1-6 (Spec_Item cols 54-71,
  1-based), loader `CProject::LoadPropItem` (_Common/ProjectCmn.cpp:665-693). Duration = dwSkillTime (col 99, ms;
  999999999 = permanent, Buff.cpp:358).
- Use path: CUser::OnDoUseItem (User.cpp:3158) → CMover::DoUseItem (MoverSkill.cpp:1455):
  IK2_BUFF / IK2_BUFF_TOGIFT → IsDoUseBuff (3371: refused if a buff with the same IK3 is on) → DoApplySkill;
  IK3_BALLOON (3235: one balloon at a time); IK2_ONCE (3254); IK2_KEEP (3266); IK2_BUFF2 uses dwAbilityMin (no DSTs).
- Buff: CCtrl::ApplySkill (Ctrl.cpp:1102) → BUFF_ITEM, time = dwSkillTime; CBuffMgr::Overwrite (Buff.cpp:695): same item
  adds time, stats not re-applied. Stats: CMover::ApplyParam (MoverActEvent.cpp:211, 6 slots) → SetDestParam
  (MoverParam.cpp:2525): HP/MP/FP are instant heals, the rest add into m_adjParamAry; *_RATE are percent.
- Tooltip: PutToolTip_Item (WndManager.cpp:4843): FOOD/POTION/REFRESHER → PutMedicine; others → PutBaseItemOpt (6 slots,
  "%" for rate DSTs), PutKeepTime for the duration.
- Not data-driven: Activation scrolls (II_CHR_SYS_SCR_ACTIVITION / NEWACTIVITION) are hard-coded SM_ACTPOINT
  (MoverSkill.cpp:2515); the page lists them read-only with that note.

## Build (same pattern as Weapon Effects, G part 2)
1. Loader `src/loaders/consumables.js`: from the Spec model, every item whose use path applies its slots (IK2_BUFF,
   BUFF_TOGIFT, KEEP, ONCE, FOOD, POTION, REFRESHER, IK3_BALLOON, charged versions), grouped: Premium buffs, Potions /
   scrolls, Foods, Balloons, Couple, Other. Slots via `FRE.specItem.get` like `weapons.js slotsOf`.
2. Ops `src/edit/consumables-ops.js`: setSlot (stat + value, `itemOps.fieldSpan` splice like `weapons-ops.js`) and
   setDuration (dwSkillTime, entered in minutes / hours / days, written in ms). `editsSpec: true` so the Client copy syncs.
3. Checks `src/validate/consumables.js`: duration 0 on a buff, a stat on an instant item that the code ignores, two items
   sharing an IK3 (they block each other), percent values over a sane cap.
4. UI `src/ui/consumables.js`: list with icon (`dds.picture`), name, group filter, search; detail = the 6 slots with the
   stat picker (`item-tooltip.js dstWords`), value, duration; a "What players see" tooltip and a "Use it" panel that
   shows the stats before / after and who blocks it (same IK3 / balloon / time added).
5. Simulator `src/loaders/consumables-sim.js` (DoUseItem branches, IsDoUseBuff, ApplySkill + Overwrite, ApplyParam /
   SetDestParam, PutBaseItemOpt / PutMedicine / PutKeepTime) + `tools/consumables-sim.js`; independent Python copy
   `tools/oracle_sim.py consumables`; tests in `tests/run-tests.js` (every item × use / use again / use a same-IK3 item,
   tooltips, edit scripts byte-identical); planted-bug check.
6. Register: MODULES entry in `core/workspace.js`, `src/order.txt`, `core/after-save.js` (+ Python aftersave), help text,
   docs (ROADMAP, INVESTIGATION §1.x, CLAUDE.md status row), `docs/plans/<task>-consumables.md`.

## Progress / corrections (2026-10-15)
- Written: loaders/consumables.js, loaders/consumables-sim.js, edit/consumables-ops.js, validate/consumables.js,
  ui/consumables.js, registration (workspace MODULES, order.txt, help texts), tools/consumables-sim.js (smoke-tested on
  test-data: Bull Hamstern, Tiger elixirs blocking, balloons, Activition hard-coded). Next: Python copy
  `oracle_sim.py consumables` (cs_* functions written from the C++, dispatch `what == 'consumables'`), the tests section in
  tests/run-tests.js (JS = Python on every case + byte-identical edit scripts + planted bug), after-save, docs.
- Corrections from the C++: using the same item again RESTARTS the timer at the full time (IBuff::AddTotal -> SetTotal(max(new,
  remaining))), it does not add up (only pet tonics / feed pocket add); an HP slot does nothing for an item; MP / FP slots on a
  timed buff leave a negative leftover when it ends (Release subtracts all 6 slots); dst >= 118 without its own code is dropped.
- User example: Bull Hams (II_CHR_FOO_COO_BULLHAMS, IK2_KEEP, DST_HP_MAX 1200, 1 h) — the "Timed items" group covers it
  (DoUseItemKeep path), so its stat, amount and time are editable on this page.

## Verification
- `node tests/run-tests.js` passes (JS = Python on every case, edit scripts byte-identical).
- The user opens the editor on test-data, changes a macaron (e.g. Indigo STR 3 → 5, 5 min → 10 min), saves; the diff is
  only those tokens. Then on the real files (with permission), restart the servers, use the macaron in game: tooltip
  and character window show the new values.
