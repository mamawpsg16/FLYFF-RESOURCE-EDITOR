//////////////////////////////////////////////////////////////////
//////////////////// Rebirth System Config //////////////////////
//////////////////////////////////////////////////////////////////
//
// Ported from Legions Files (__MANK_REBIRTH), adapted for a classic/
// non-high-rate server (__REBIRTH_SYSTEM). Raising the cap later = bump
// "Max", add rows to Rates{}/Gifts{} up to the new cap, restart WorldServer.
// No recompile, no DB migration needed for the cap change itself.
//
// Rates columns: fExpRate  fDropRate  fPenyaRate  GP-per-tier (stat points)
//   - Exp/Drop/Penya intentionally flat 1.00 at every tier - this is a
//     stat/gear-gate prestige system, not a rate multiplier. Job-mismatch
//     gear is stripped on rebirth, so there's no lingering gear advantage
//     to offset with a rate penalty (owner call, 2026-09-12 - a declining
//     fExpRate curve was tried and reverted once the strip fix landed).
//   - GP column = the TOTAL bonus a character has at that tier, not an
//     increment: a rebirth runs InitLevel (stats back to 15, GP recomputed
//     from level) and then adds only the new tier's value, and a full
//     restat (CMover::ReState) adds it back the same way. Owner call
//     2026-09-25: +10 per rebirth, RB20 = 200. Data-driven (Legions used a
//     flat #define) - retune by editing this column, no rebuild needed.
//
// Gifts: one row per tier, "Level  ItemDefine  Amount". Only ONE item per
// tier is supported (CProject::m_mapRebirthItems is a std::map<tier,item>).
// Owner call 2026-09-25: no Red Chip gifts - the Cloak at RB20 is the only
// rebirth reward (tiers without a row simply give nothing).
// A tier whose item define doesn't exist in Spec_Item.txt logs
// "Error in Rebirth Config > ItemChart" at boot and that tier's gift is
// simply skipped (non-fatal).
//
// Tier 20 (the last rebirth) grants II_ARM_S_CLO_CLO_SPIRIT_1 - an existing bound item already
// in this tree ("Cloak of Brave(Bind)"), not a newly created one.

Max 20 //Max Rebirth Tier

Rates //Exp //Drop //Penya //GP (stat points this tier)
{
	1.00	1.0		1.0		0	//0 (unused - never-rebirthed baseline)
	1.00	1.0		1.0		10	//1
	1.00	1.0		1.0		20	//2
	1.00	1.0		1.0		30	//3
	1.00	1.0		1.0		40	//4
	1.00	1.0		1.0		50	//5
	1.00	1.0		1.0		60	//6
	1.00	1.0		1.0		70	//7
	1.00	1.0		1.0		80	//8
	1.00	1.0		1.0		90	//9
	1.00	1.0		1.0		100	//10
	1.00	1.0		1.0		110	//11
	1.00	1.0		1.0		120	//12
	1.00	1.0		1.0		130	//13
	1.00	1.0		1.0		140	//14
	1.00	1.0		1.0		150	//15
	1.00	1.0		1.0		160	//16
	1.00	1.0		1.0		170	//17
	1.00	1.0		1.0		180	//18
	1.00	1.0		1.0		190	//19
	1.00	1.0		1.0		200	//20
}

Gifts //Rebirth Tier //Item Define //Item Amount
{
	20	II_ARM_S_CLO_CLO_SPIRIT_1		1	//Cloak of Bravery - existing bound item, already carries STR/DEX/INT/STA+7, Speed+15%, HP_MAX+10%
}
