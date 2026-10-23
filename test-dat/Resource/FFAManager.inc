// Free-For-All Arena (FFA) - __FL_FFA, CFFAManager (Source\_Common\FFAManager.cpp)
//
// One run: FFA_ANNOUNCE_TIME minutes before each FFA_BEGIN time the FFA is announced; players walk to
// Donaris > FFA Arena to open the window and register (fee in Penya,
// Perin used too). At the FFA_BEGIN time registration closes: fewer than FFA_MIN_MEMBERS = cancelled, fees
// refunded. Then registered players press Join (waiting area) for FFA_PREPARATION_TIME minutes; the battle
// lasts FFA_WAR_TIME minutes (fewer than 2 inside at the start = cancelled + refund). FFA_LIFES lives,
// revive = back to the waiting area, FFA_RESPAWN_TIME seconds later into the arena. No lives left = watch
// from the waiting area. Rewards at the end: FFA_REWARD per kill + FFA_TOP_REWARD for places 1-3 (same item,
// a top-3 prize needs at least 1 kill; ties: more kills, then fewer deaths). Bag full = mail.
// Channel 1 only. No EXP loss, no PK penalty, no item drop inside WdFFA.
//
// FFA_COST              entry fee in Penya (0 = free)
// FFA_CANCEL_CUT        % of the fee kept when a registered player presses Cancel (0 - 100; registration open only)
// FFA_MIN_LEVEL         minimum character level
// FFA_MIN_MEMBERS       players needed (2 or more)
// FFA_MAX_MEMBERS       registration cap (up to 100)
// FFA_LIFES             lives per player
// FFA_ANNOUNCE_TIME     minutes of registration before FFA_BEGIN (1 - 60)
// FFA_RESPAWN_TIME      seconds in the waiting area after a revive (0 - 60)
// FFA_PREPARATION_TIME  minutes to Join between registration close and battle start (0 - 30)
// FFA_WAR_TIME          battle length in minutes (1 - 120)
// FFA_REWARD            item  amount-per-kill
// FFA_TOP_REWARD        amount for 1st  2nd  3rd (same item as FFA_REWARD)
// FFA_BEGIN             day  hour  minute   - when registration closes and the arena opens (server PC time)
//                       day: 0 = every day, 1 = Sunday, 2 = Monday ... 7 = Saturday (same as FreePKTime.txt)
//                       keep runs clear of Free PK Time (00/04/08/12/16/20 for 60 minutes)
//
// GM (administrator): /ffastart [minutes]  /ffaskip  /ffaend  /ffarefund  /ffanext  /ffainfo  /ffareload (only while no FFA runs)
// Edits need /ffareload or a WorldServer restart.

FFA_COST				10000000
FFA_CANCEL_CUT			20
FFA_MIN_LEVEL			60
FFA_MIN_MEMBERS			2
FFA_MAX_MEMBERS			100
FFA_LIFES				10
FFA_ANNOUNCE_TIME		5
FFA_RESPAWN_TIME		10
FFA_PREPARATION_TIME	1
FFA_WAR_TIME			10
FFA_REWARD				II_CHP_PVP_TOKEN	1
FFA_TOP_REWARD			30	20	10

FFA_BEGIN	0	14	30
FFA_BEGIN	0	21	30
