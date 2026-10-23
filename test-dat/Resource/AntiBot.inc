// Bot check puzzle (__ANTI_BOT, WORLDSERVER\AntiBotMng.cpp): the pictures and the words the puzzle asks for.
//
// The puzzle shows ANTIBOT_CHOICES (6) of these item icons in a random order and asks "Click the <word>".
// SERVER ONLY: never copy this file to the client - the words are the answer key.
//
//   ANTIBOT_ITEM   <item id>   "<word>"
//
// Rules:
//   - pick items whose icon clearly shows the word (a player must see it at a glance)
//   - every word and every item only once; two icons that look alike (e.g. a wand and a broom) = keep only one
//   - at least 6 lines; more lines = harder for a bot to learn
// Bad lines are skipped and written to Server\error_*.txt. Edits: GM /antibot reload (or restart the WorldServer).
// Tuning: the lines below (read with the words; GM /antibot reload). A missing line = its default (the ANTIBOT_* block in
// Source\_Common\CustomCommon.h); a value out of range keeps the default and is written to error_*.txt.

SCORE_LIMIT			1200	// score that opens the puzzle: +1 per counted monster kill, +2 while camping (1 - 1000000)
RANDOM_CHANCE		2000	// every counted kill also opens it with a 1 in N chance (0 = off, up to 1000000)
CAMP_RADIUS			40		// camping = still within this many metres of the spot ... (1 - 1000)
CAMP_MINUTES		20		// ... where the player stood this many minutes ago (1 - 1440)
COOLDOWN_MINUTES	30		// minutes without a new puzzle after a right answer (0 - 1440)
ANSWER_SECONDS		120		// seconds to answer before the player is frozen (10 - 3600)
FROZEN_SECONDS		300		// seconds frozen before being sent to town (10 - 86400)
CLICKS				3		// clicks per stage (asking, then frozen); a wrong click shows new icons (1 - 20)
SKIP_GM				1		// 1 = GM accounts never get it by themselves (/antibot still works); 0 to test on a GM account
// NO_CHECK_WORLD	WI_DUNGEON_BEAR		// kills on this map never count (one line per map; towns, events, PvP maps, guild
//										// houses and party dungeons never count anyway)

ANTIBOT_ITEM	II_WEA_SWO_LONG					"Sword"
ANTIBOT_ITEM	II_WEA_AXE_MORROW				"Axe"
ANTIBOT_ITEM	II_WEA_BOW_WOODNE				"Bow"
ANTIBOT_ITEM	II_ARM_M_VAG_BOOTS01			"Boots"
ANTIBOT_ITEM	II_GEN_FOO_INS_BREAD			"Bread"
ANTIBOT_ITEM	II_GEN_FOO_INS_LOLLIPOP			"Lollipop"
ANTIBOT_ITEM	II_GEN_FOO_INS_CHOCOLATE		"Chocolate"
ANTIBOT_ITEM	II_SYS_SYS_EVE_GOLDENAPPLE		"Apple"
ANTIBOT_ITEM	II_GEN_MAT_DIAMOND				"Diamond"
ANTIBOT_ITEM	II_GEN_GEM_GEM_MOP				"Teddy Bear"
ANTIBOT_ITEM	II_GEN_GEM_GEM_CATBELL			"Bell"
ANTIBOT_ITEM	II_GEN_GEM_GEM_NICECHEESE		"Cheese"
ANTIBOT_ITEM	II_SYS_SYS_EVE_CANDLE01			"Candle"
ANTIBOT_ITEM	II_SYS_SYS_EVE_BALLOON			"Balloons"
ANTIBOT_ITEM	II_SYS_SYS_EVE_CARROTNOSE		"Carrot"
ANTIBOT_ITEM	II_GEN_GEM_GEM_HARPYFEATHER		"Feather"
ANTIBOT_ITEM	II_SYS_SYS_GEM_REDGBOX			"Gift Box"
ANTIBOT_ITEM	II_GEN_POT_POT_WATER			"Bottle"
ANTIBOT_ITEM	II_SYS_SYS_QUE_PUMPKINHEAD		"Pumpkin"
ANTIBOT_ITEM	II_ARM_S_CLO_MAS_BUTTERFLY		"Mask"
ANTIBOT_ITEM	II_GEN_FOO_ICE_ICECREAMCAKE		"Cake"
ANTIBOT_ITEM	II_GEN_FOO_ICE_ORANGEJUIICE		"Drink"
ANTIBOT_ITEM	II_RID_RID_STI_MAGIC			"Broom"
