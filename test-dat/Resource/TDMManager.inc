// Team Deathmatch (TDM, FFA/TDM step 4) - read at WorldServer start and by /tdmreload (only while no TDM runs).
// The same flow as FFAManager.inc (registration, Join at Amos, waiting area, battle, lives), with two teams:
// at the battle start everyone inside is put on Red or Blue (by level, snake draft). Team mates can't hurt each
// other but can buff / heal each other. Most team kills wins. Mistakes switch TDM off: see Server\error_*.txt.
//
// TDM_COST              entry fee in Penya (0 = free), refunded when the run is cancelled
// TDM_CANCEL_CUT        % of the fee kept when a registered player presses Cancel (0 - 100; registration open only)
// TDM_MIN_LEVEL         minimum character level
// TDM_MIN_MEMBERS       players needed (2 or more)
// TDM_MAX_MEMBERS       registration cap (up to 100)
// TDM_LIFES             lives per player
// TDM_ANNOUNCE_TIME     minutes of registration before TDM_BEGIN (1 - 60)
// TDM_RESPAWN_TIME      seconds in the waiting area after a revive (0 - 60)
// TDM_PREPARATION_TIME  minutes to Join between registration close and battle start (0 - 30)
// TDM_WAR_TIME          battle length in minutes (1 - 120)
// TDM_REWARD            item  amount-per-kill (paid at the kill)
// TDM_TEAM_REWARD       amount for every player of the winning team with 1+ kill (same item; a draw pays none)
// TDM_MVP_REWARD        amount for the player with the most kills (same item)
// TDM_WAIT              x1 z1 x2 z2 height   the waiting area (everyone)
// TDM_SPAWN_RED         x1 z1 x2 z2 height   where the Red team enters the arena
// TDM_SPAWN_BLUE        x1 z1 x2 z2 height   where the Blue team enters the arena
//                       height = where players appear; they drop onto what is below (arena floor: 100,
//                       Arena Manager frames are at ~117). A waiting player more than 40 below the
//                       TDM_WAIT height (fell off the frame) is put back.
// TDM_BEGIN             day  hour  minute   - when registration closes and the arena opens (server PC time)
//                       day 0 = every day, 1 = Sunday ... 7 = Saturday

TDM_COST				10000000
TDM_CANCEL_CUT			20
TDM_MIN_LEVEL			60
TDM_MIN_MEMBERS			2
TDM_MAX_MEMBERS			100
TDM_LIFES				10
TDM_ANNOUNCE_TIME		5
TDM_RESPAWN_TIME		10
TDM_PREPARATION_TIME	1
TDM_WAR_TIME			10
TDM_REWARD				II_CHP_PVP_TOKEN	1
TDM_TEAM_REWARD			15
TDM_MVP_REWARD			20

// WdFwc Arena Manager frames (NPCs from WdFwc.dyo, ~117 high): north 1247 1318 = waiting area,
// the frames are closed in (players can't get down), so the teams start / revive on the arena floor:
// Red on the west side, Blue on the east side
TDM_WAIT				1246	1317	1248	1319	135
TDM_SPAWN_RED			1210	1268	1222	1282	100
TDM_SPAWN_BLUE			1262	1268	1274	1282	100

TDM_BEGIN	0	17	30
TDM_BEGIN	0	23	30
