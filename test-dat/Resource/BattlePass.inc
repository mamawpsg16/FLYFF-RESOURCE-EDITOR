// Battle Pass - season configuration.
//
// Loaded by CProject::LoadBattlePass (_Common/ProjectCmn.cpp) on both server and
// client. Plain ASCII, CRLF - NOT UTF-16, unlike most .inc files in this tree.
// Data only: editing this file needs a server restart and a client relaunch, never
// a rebuild.
//
// STARTING A NEW SEASON is not just a date change:
//   1. Give the pass a NEW item id. Reusing the old one blocks re-activation for
//      anyone whose previous pass has not expired yet.
//   2. Bump nType on the BPItem row AND on every BPReward row.
//   3. REPLACE the BP4 ladder - do not append. mapBattPass is keyed on level alone,
//      so two seasons' rows would collide.
//   4. Changing the date here does NOT move players already on a season - the end
//      date is stamped onto the character when the free track is granted. Use /rrbp
//      (ADMINISTRATOR) per character, or clear m_szBPEndTime in SQL for everyone.
//
// Players are put on the FREE track automatically at login
// (CDPDatabaseClient::OnJoin). They earn points and levels but receive nothing.
// Buying the pass sets m_nBPEnable = 1 and back-pays every level already earned.


BP1 // The purchasable pass. ONE row - one season runs at a time.
{
	// SETTING A 30-DAY SEASON - read this before changing the date.
	//
	// nTime is 8 digits, so it means MIDNIGHT AT THE START of that day, not the
	// end of it. The pass dies the instant that date begins.
	//
	//     20261005  ->  expires Mon 05 Oct 00:00  ->  last full day is Sun 04 Oct
	//     20261006  ->  expires Tue 06 Oct 00:00  ->  Oct 5 IS playable in full
	//
	// So for a true 30-day season: take the FIRST day players can earn, add 30,
	// and put THAT date here - i.e. the day AFTER the last playable day.
	//     start Mon 05 Oct  ->  30 playable days, 05 Oct..03 Nov  ->  nTime 20261104
	//
	// Getting this off by one is not cosmetic: the countdown a player sees is
	// this date minus now, so an off-by-one costs them a whole day of the season.
	//
	// Changing this does NOT move players already on the season - the date is
	// stamped onto the character when the free track is granted. Use /rrbp per
	// character, or clear m_szBPEndTime in SQL for everyone.
	//
	// Season 1: starts 2026-09-05, expires 2026-10-05 00:00.
	//			nType	dwItem					nTime (YYYYMMDD)
	BPItem		1	II_SYS_SYS_SCR_BPPASS1	20261005
}

BP2 // Preview pass - starts progress with rewards locked. Unused in season 1:
{   // the free track is granted at login instead, so there is no item to hand out.
	//			nType	dwItem					nTime
}

BP3 // Point token - a scroll that grants a random point roll. Unused in season 1:
{   // points come from monster kills only, so money buys the unlock, not progress.
	//				dwItem					nPointsMin	nPointsMax   (max 10000)
}

BP4 // The reward ladder. nPoints is the cost to advance FROM this level to the next;
{   // dwItem is granted on ARRIVING at this level. Level 1 pays on activation.
	// A full 50-level clear costs 150,000 points. A level can never cost more than
	// MAX_BPOINTS (10,000), so 50 x 10,000 = 500,000 is the hard ceiling for a ladder.
	//
	// strBGLogo is left empty on every row on purpose: the window then falls back to
	// BattlePass_Image0.tga for all 50 levels, i.e. one static banner. To change the
	// banner, overwrite that ONE file - no edit here, no rebuild.
	//			nType	nLevel	nPoints	dwItem							nQty	strBGLogo	strRarity	strCustomIcon
	BPReward	1	1	2000	II_CHR_SYS_SCR_UPCUTSTONE       10	""	""	""
	BPReward	1	2	2000	II_SYS_SYS_SCR_SMELPROT         10	""	""	""
	BPReward	1	3	2000	II_SYS_SYS_SCR_RANDOMSTA        5	""	""	""
	BPReward	1	4	2000	II_CHP_RED                      10	""	""	""
	BPReward	1	5	2000	II_SYS_SYS_SCR_AWAKESAFE        3	""	""	""
	BPReward	1	6	2000	II_SYS_SYS_SCR_AMPESS           3	""	""	""
	BPReward	1	7	2000	II_SYS_SYS_SCR_RANDOMOPTIONRTRY 5	""	""	""
	BPReward	1	8	2000	II_CHR_SYS_SCR_UPCUTSTONE       15	""	""	""
	BPReward	1	9	2000	II_SYS_SYS_SCR_SMELPROT         15	""	""	""
	BPReward	1	10	2000	II_SYS_SYS_SCR_VIP_07           1	""	""	""
	BPReward	1	11	2500	II_CHP_RED                      15	""	""	""
	BPReward	1	12	2500	II_SYS_SYS_SCR_AWAKESAFE        5	""	""	""
	BPReward	1	13	2500	II_SYS_SYS_SCR_RANDOMSTA        8	""	""	""
	BPReward	1	14	2500	II_SYS_SYS_SCR_SMELPROT4        5	""	""	""
	BPReward	1	15	2500	II_SYS_SYS_SCR_PERIN            1	""	""	""
	BPReward	1	16	2500	II_CHR_SYS_SCR_UPCUTSTONE       20	""	""	""
	BPReward	1	17	2500	II_SYS_SYS_SCR_AMPESS           5	""	""	""
	BPReward	1	18	2500	II_SYS_SYS_SCR_RANDOMOPTIONRTRY 8	""	""	""
	BPReward	1	19	2500	II_SYS_SYS_SCR_SMELPROT3        5	""	""	""
	BPReward	1	20	2500	II_CHR_SYS_SCR_BAGEXPAND_3D     1	""	""	""
	BPReward	1	21	3000	II_CHP_RED                      20	""	""	""
	BPReward	1	22	3000	II_SYS_SYS_SCR_AWAKESAFE        8	""	""	""
	BPReward	1	23	3000	II_SYS_SYS_SCR_SMELPROT         20	""	""	""
	BPReward	1	24	3000	II_SYS_SYS_SCR_RANDOMSTA        10	""	""	""
	BPReward	1	25	3000	II_SYS_SYS_SCR_PERIN            1	""	""	""
	BPReward	1	26	3000	II_CHR_SYS_SCR_UPCUTSTONE       25	""	""	""
	BPReward	1	27	3000	II_SYS_SYS_SCR_SMELPROT4        8	""	""	""
	BPReward	1	28	3000	II_SYS_SYS_SCR_AMPESS           8	""	""	""
	BPReward	1	29	3000	II_SYS_SYS_SCR_RANDOMOPTIONRTRY 10	""	""	""
	BPReward	1	30	3000	II_SYS_SYS_SCR_VIP_15           1	""	""	""
	BPReward	1	31	3500	II_CHP_RED                      25	""	""	""
	BPReward	1	32	3500	II_SYS_SYS_SCR_SMELPROT3        8	""	""	""
	BPReward	1	33	3500	II_SYS_SYS_SCR_AWAKESAFE        10	""	""	""
	BPReward	1	34	3500	II_CHR_SYS_SCR_UPCUTSTONE       30	""	""	""
	BPReward	1	35	3500	II_SYS_SYS_SCR_PERIN            1	""	""	""
	BPReward	1	36	3500	II_SYS_SYS_SCR_RANDOMSTA        12	""	""	""
	BPReward	1	37	3500	II_SYS_SYS_SCR_SMELPROT         25	""	""	""
	BPReward	1	38	3500	II_SYS_SYS_SCR_AMPESS           10	""	""	""
	BPReward	1	39	3500	II_SYS_SYS_SCR_SMELPROT4        10	""	""	""
	BPReward	1	40	3500	II_ARM_S_CLO_CLO_SPIRIT         1	""	""	""
	BPReward	1	41	4000	II_CHP_RED                      30	""	""	""
	BPReward	1	42	4000	II_SYS_SYS_SCR_SMELPROT3        10	""	""	""
	BPReward	1	43	4000	II_SYS_SYS_SCR_AWAKESAFE        12	""	""	""
	BPReward	1	44	4000	II_SYS_SYS_SCR_RANDOMOPTIONRTRY 12	""	""	""
	BPReward	1	45	4000	II_SYS_SYS_SCR_PERIN            2	""	""	""
	BPReward	1	46	4000	II_CHR_SYS_SCR_UPCUTSTONE       35	""	""	""
	BPReward	1	47	4000	II_SYS_SYS_SCR_RANDOMSTA        15	""	""	""
	BPReward	1	48	4000	II_SYS_SYS_SCR_SMELPROT4        12	""	""	""
	BPReward	1	49	4000	II_SYS_SYS_SCR_SMELPROT3        12	""	""	""
	BPReward	1	50	4000	II_SYS_SYS_SCR_VIP_30           1	""	""	""
}

BP5 // Which monsters pay points, and how many.
{   // Rebuilt from THIS server's propMover.txt - every monster with a real display
	// name and level 1-200. The donor's original list was written for their own
	// content and covered only 117 of our 863 monsters, with NOTHING at all below
	// level 21 or between 61 and 120, so most kills silently paid nothing.
	//
	// Priced by monster level, then multiplied by rank, so farming low-level trash is
	// never a shortcut:
	//     lv  1-20:    4-6      lv 21-40:  8-12      lv 41-60:  14-20
	//     lv 61-80:  22-32      lv81-100: 32-44      lv101-120: 44-60
	//     lv121-140: 60-80      lv141+:   80-110
	//   x1.25 midboss   x1.5 boss   x2 super
	//
	// TUNING NOTE: deliberately FAST. The ladder was cut 400,000 -> 150,000 and these
	// per-kill values doubled, at the owner's request, so a dedicated player clears all
	// 50 levels in roughly 1-2 DAYS (2-4 days casual). That is much quicker than the
	// 30-day season length - intentional, not an oversight. To slow it down, halve
	// these numbers and/or raise the BP4 costs; it is data only, no rebuild.
	//
	// A monster that never spawns simply never pays - harmless.
	//				dwID					  nMin	nMax
	BPMonster	MI_AIBATT1                4	6	// lv1 low - Small Aibatt
	BPMonster	MI_AIBATT2                4	6	// lv1 normal - Aibatt
	BPMonster	MI_AIBATT5                4	6	// lv1 low - Flying Aibatt
	BPMonster	MI_BUKETFOOT1             4	6	// lv1 low - Small Buketfoot
	BPMonster	MI_BUKETFOOT2             4	6	// lv1 normal - Buketfoot
	BPMonster	MI_BURNBIRD1              4	6	// lv1 low - Small Burn Bird
	BPMonster	MI_BURNBIRD2              4	6	// lv1 normal - Burn Bird
	BPMonster	MI_BURR                   4	6	// lv1 low - Buur
	BPMonster	MI_CLOCKWORKBUTLER01      4	6	// lv1 low - Clockworks Butler
	BPMonster	MI_DAMAGETEST             4	6	// lv1 material - Guru Catcher
	BPMonster	MI_DEMIAN5                6	9	// lv1 boss - Master Demian
	BPMonster	MI_DUMBBULL5              4	6	// lv1 low - Rampaging Dumb Bull
	BPMonster	MI_FROZIEST1              4	6	// lv1 low - Small Froziest
	BPMonster	MI_FROZIEST2              4	6	// lv1 normal - Froziest
	BPMonster	MI_FZOMBIE                4	6	// lv1 low - Bloody Mary
	BPMonster	MI_GRAYEARL               4	6	// lv1 low - Gray Earl
	BPMonster	MI_GRAYEARL01             4	6	// lv1 low - Earl Vermelho
	BPMonster	MI_KEAKOON5               6	9	// lv1 boss - Master Keakoon
	BPMonster	MI_MAFL_TELEPORTER        4	6	// lv1 citizen - [Teleporter] Master
	BPMonster	MI_MAFL_TELEPORTER_3VAT   4	6	// lv1 citizen - [Teleporter] Apprentice
	BPMonster	MI_MAHE_RAELRA            4	6	// lv1 citizen - Raelra
	BPMonster	MI_MASP_SANPRES           4	6	// lv1 citizen - Sanpres
	BPMonster	MI_MOCOMOCHI1             4	6	// lv1 low - Mocomochi
	BPMonster	MI_MUFFRIN5               6	9	// lv1 boss - Master Muffrin
	BPMonster	MI_MZOMBIE                4	6	// lv1 low - R. DeFeo
	BPMonster	MI_PET_AIBATT             4	6	// lv1 low - Baby Aibatt
	BPMonster	MI_PET_BANG1              4	6	// lv1 low - Baby Bang
	BPMonster	MI_PET_BARBARYLION01      4	6	// lv1 low - Babari lion
	BPMonster	MI_PET_BARBARYLION01_1    4	6	// lv1 low - Babari lion
	BPMonster	MI_PET_BARBARYLION01_2    4	6	// lv1 low - [Captain] Hellion
	BPMonster	MI_PET_BULLDOG            4	6	// lv1 low - English Bulldog
	BPMonster	MI_PET_CARDPUPPET1        4	6	// lv1 low - Small Maid Cardpuppet
	BPMonster	MI_PET_CAT01              4	6	// lv1 low - Kitty
	BPMonster	MI_PET_CHAMELEON          4	6	// lv1 low - Chameleon
	BPMonster	MI_PET_CHESHIRECAT        4	6	// lv1 low - Cheshire Cat
	BPMonster	MI_PET_CHICKEN            4	6	// lv1 low - Baby Chicken
	BPMonster	MI_PET_CHRISTMASDEER      4	6	// lv1 low - Rudolph
	BPMonster	MI_PET_CHRISTMASFAIRY     4	6	// lv1 low - Mr. Grinchie
	BPMonster	MI_PET_COBRA              4	6	// lv1 low - Baby Cobra
	BPMonster	MI_PET_COLABEAR           4	6	// lv1 low - Baby Polar Bear
	BPMonster	MI_PET_COW                4	6	// lv1 low - Baby Cow
	BPMonster	MI_PET_CUTEBEAR           4	6	// lv1 low - Kuma
	BPMonster	MI_PET_DANCER             4	6	// lv1 low - Soul Dancer
	BPMonster	MI_PET_DESERTFOX          4	6	// lv1 low - Joey
	BPMonster	MI_PET_DEVILTOY           4	6	// lv1 low - X900 EvilTron
	BPMonster	MI_PET_DOBERMAN           4	6	// lv1 low - Spike
	BPMonster	MI_PET_DOG01              4	6	// lv1 low - Doggy
	BPMonster	MI_PET_DOG2               4	6	// lv1 low - Baby Beagle
	BPMonster	MI_PET_DRAGON             4	6	// lv1 low - Baby Blue Dragon
	BPMonster	MI_PET_DRAGON01           4	6	// lv1 low - Dragon
	BPMonster	MI_PET_DRAGON01_1         4	6	// lv1 low - Dragon
	BPMonster	MI_PET_DRAGON01_2         4	6	// lv1 low - [Captain] Bahamut
	BPMonster	MI_PET_DRAGON1            4	6	// lv1 low - Baby Black Dragon
	BPMonster	MI_PET_EAGLE01            4	6	// lv1 low - Griffin
	BPMonster	MI_PET_EAGLE01_1          4	6	// lv1 low - Griffin
	BPMonster	MI_PET_EAGLE01_2          4	6	// lv1 low - [Captain] Hippogryph
	BPMonster	MI_PET_EGG                4	6	// lv1 low - Egg
	BPMonster	MI_PET_FROG               4	6	// lv1 low - Cute Frog
	BPMonster	MI_PET_GHOST              4	6	// lv1 low - Naughty Ghost
	BPMonster	MI_PET_GPOTATO            4	6	// lv1 low - Lil' gPotato
	BPMonster	MI_PET_HAETAE             4	6	// lv1 low - Baby Fu Lion
	BPMonster	MI_PET_HAMBURGER          4	6	// lv1 low - Cute Hamburger
	BPMonster	MI_PET_HAMSTER            4	6	// lv1 low - Baby Hamster
	BPMonster	MI_PET_HORSE              4	6	// lv1 low - Baby Horse
	BPMonster	MI_PET_ICEQUEEN           4	6	// lv1 low - Lumia
	BPMonster	MI_PET_IGUANA             4	6	// lv1 low - Baby Iguana
	BPMonster	MI_PET_KIMPD              4	6	// lv1 low - [Development Supervisor] Kim
	BPMonster	MI_PET_LAWOLF             4	6	// lv1 low - Baby Lawolf
	BPMonster	MI_PET_LEYENA             4	6	// lv1 low - Baby Leyena
	BPMonster	MI_PET_LITTLEZOMBIE       4	6	// lv1 low - Braaaaains
	BPMonster	MI_PET_LUIA               4	6	// lv1 low - Baby Luia
	BPMonster	MI_PET_MATRYOSHKA         4	6	// lv1 low - Charming Babushka Doll
	BPMonster	MI_PET_MIA1               4	6	// lv1 low - Small Mia
	BPMonster	MI_PET_MOCOMOCI           4	6	// lv1 low - Mocomochi
	BPMonster	MI_PET_MONKEY             4	6	// lv1 low - Baby Monkey
	BPMonster	MI_PET_NEWYEARRABBIT      4	6	// lv1 low - Usagi
	BPMonster	MI_PET_NINEFOX01          4	6	// lv1 low - Old fox
	BPMonster	MI_PET_NINEFOX01_1        4	6	// lv1 low - Old fox
	BPMonster	MI_PET_NINEFOX01_2        4	6	// lv1 low - [Captain] Reinecke
	BPMonster	MI_PET_OWL                4	6	// lv1 low - Smart Owl
	BPMonster	MI_PET_PANDA              4	6	// lv1 low - Baby Panda
	BPMonster	MI_PET_PARROT             4	6	// lv1 low - Tommy Toucan
	BPMonster	MI_PET_PENGUIN            4	6	// lv1 low - Baby Penguin
	BPMonster	MI_PET_PIG                4	6	// lv1 low - Baby Pig
	BPMonster	MI_PET_RABBIT             4	6	// lv1 low - Baby Rabbit
	BPMonster	MI_PET_RABBIT02           4	6	// lv1 low - Rabbit
	BPMonster	MI_PET_RABBIT02_1         4	6	// lv1 low - Rabbit
	BPMonster	MI_PET_RABBIT02_2         4	6	// lv1 low - [Captain] Jackalope
	BPMonster	MI_PET_RACCON             4	6	// lv1 low - Tiny Tanuki
	BPMonster	MI_PET_RAGDOLL            4	6	// lv1 low - Patches
	BPMonster	MI_PET_REDPAANG           4	6	// lv1 low - Big Red
	BPMonster	MI_PET_REDSNOWMAN         4	6	// lv1 low - Jimbo the Snowman
	BPMonster	MI_PET_RICAN              4	6	// lv1 low - Little Lykan
	BPMonster	MI_PET_ROBOT              4	6	// lv1 low - Baby Robot
	BPMonster	MI_PET_ROBOT01            4	6	// lv1 low - Johnny Four-Wheels
	BPMonster	MI_PET_SANTACLAUS         4	6	// lv1 low - Mini Santa
	BPMonster	MI_PET_SHEEP              4	6	// lv1 low - Cute Lamb
	BPMonster	MI_PET_SHEEP1             4	6	// lv1 low - [Event] Baby Sheep
	BPMonster	MI_PET_SKEL01             4	6	// lv1 low - Bone Golem
	BPMonster	MI_PET_SMELTCOBI          4	6	// lv1 low - [Upgrade Spirit] Coby
	BPMonster	MI_PET_SMELTPIERCE        4	6	// lv1 low - [Upgrade Spirit] Pierce
	BPMonster	MI_PET_SMELTPIYO          4	6	// lv1 low - Piyo
	BPMonster	MI_PET_SMELTUDI           4	6	// lv1 low - Udi
	BPMonster	MI_PET_SMELTUDI01         4	6	// lv1 low - No info
	BPMonster	MI_PET_SNOWMAN01          4	6	// lv1 low - Jack Frost
	BPMonster	MI_PET_SNOWMAN02          4	6	// lv1 low - Mini Snowman
	BPMonster	MI_PET_SOCCERBALL         4	6	// lv1 low - Soccerball Angel
	BPMonster	MI_PET_TADDYBEAR          4	6	// lv1 low - Mister Grizz
	BPMonster	MI_PET_TAIGA01            4	6	// lv1 low - Red Armored Tigar
	BPMonster	MI_PET_TAIGA02            4	6	// lv1 low - Blue Armored Tigar
	BPMonster	MI_PET_TAIGA03            4	6	// lv1 low - Yellow Armored Tigar
	BPMonster	MI_PET_TIGER              4	6	// lv1 low - Baby Tiger
	BPMonster	MI_PET_TURTLE             4	6	// lv1 low - Baby Turtle
	BPMonster	MI_PET_UNICORN01          4	6	// lv1 low - Unicorn
	BPMonster	MI_PET_UNICORN01_1        4	6	// lv1 low - Unicorn
	BPMonster	MI_PET_UNICORN01_2        4	6	// lv1 low - [Captain] Nightmare
	BPMonster	MI_PET_WHITERABBIT        4	6	// lv1 low - The White Rabbit
	BPMonster	MI_PET_WHITETIGER01       4	6	// lv1 low - White Tiger
	BPMonster	MI_PET_WHITETIGER01_1     4	6	// lv1 low - White Tiger
	BPMonster	MI_PET_WHITETIGER01_2     4	6	// lv1 low - [Captain] Behemoth
	BPMonster	MI_PET_WHITETIGER02       4	6	// lv1 low - Tiger Cub
	BPMonster	MI_PET_WRONGKOALA         4	6	// lv1 low - Inspector Koko
	BPMonster	MI_PET_YETI               4	6	// lv1 low - Baby Yetti
	BPMonster	MI_PINATA                 4	6	// lv1 low - Pinata
	BPMonster	MI_SAPHYRYAN              4	6	// lv1 low - Saphyryan
	BPMonster	MI_SPAINDRAGON01          4	6	// lv1 low - Needle Tail Dragon
	BPMonster	MI_TGLUIA01               4	6	// lv1 low - Gobbler
	BPMonster	MI_AIBATT3                4	6	// lv2 captain - Captain Aibatt
	BPMonster	MI_BUKETFOOT3             4	6	// lv2 captain - Captain Buketfoot
	BPMonster	MI_BURNBIRD3              4	6	// lv2 captain - Captain Burn Bird
	BPMonster	MI_FROZIEST3              4	6	// lv2 captain - Captain Froziest
	BPMonster	MI_MUSHPANG1              4	6	// lv3 low - Small Mushpang
	BPMonster	MI_MUSHPANG2              4	6	// lv3 normal - Mushpang
	BPMonster	MI_MUSHPANG3              4	6	// lv4 captain - Captain Mushpang
	BPMonster	MI_BUKETFOOT4             6	9	// lv5 boss - Giant Buketfoot
	BPMonster	MI_BURNBIRD4              6	9	// lv5 boss - Giant Burn Bird
	BPMonster	MI_BURUDENG1              4	6	// lv5 low - Small Burudeng
	BPMonster	MI_BURUDENG2              4	6	// lv5 normal - Burudeng
	BPMonster	MI_FROZIEST4              6	9	// lv5 boss - Giant Froziest
	BPMonster	MI_BURUDENG3              4	6	// lv6 captain - Captain Burudeng
	BPMonster	MI_MUSHPANG4              6	9	// lv6 boss - Giant Mushpang
	BPMonster	MI_PUKEPUKE1              4	6	// lv7 low - Small Pukepuke
	BPMonster	MI_PUKEPUKE2              4	6	// lv7 normal - Pukepuke
	BPMonster	MI_PEAKYTURTLE1           4	6	// lv8 low - Small Peakyturtle
	BPMonster	MI_PEAKYTURTLE2           4	6	// lv8 normal - Peakyturtle
	BPMonster	MI_PUKEPUKE3              4	6	// lv8 captain - Captain Pukepuke
	BPMonster	MI_BUFFPONG               4	6	// lv9 citizen - [Event NPC]Big Buff Pang
	BPMonster	MI_BURUDENG4              6	9	// lv9 boss - Giant Burudeng
	BPMonster	MI_DARK                   4	6	// lv9 citizen - Dark
	BPMonster	MI_DEMIAN1                4	6	// lv9 low - Urchin Demian
	BPMonster	MI_DEMIAN2                4	6	// lv9 normal - Demian
	BPMonster	MI_LIGHT                  4	6	// lv9 citizen - Light
	BPMonster	MI_NPCDEMIAN              4	6	// lv9 citizen - [Rock Scissor Paper NPC]Demian
	BPMonster	MI_PEAKYTURTLE3           4	6	// lv9 captain - Captain Peakyturtle
	BPMonster	MI_DEMIAN3                4	6	// lv10 captain - Bad Demian
	BPMonster	MI_DORIDOMA1              4	6	// lv11 low - Small Doridoma
	BPMonster	MI_DORIDOMA2              4	6	// lv11 normal - Doridoma
	BPMonster	MI_PUKEPUKE4              6	9	// lv11 boss - Giant Pukepuke
	BPMonster	MI_DORIDOMA3              4	6	// lv12 captain - Captain Doridoma
	BPMonster	MI_PEAKYTURTLE4           6	9	// lv12 boss - Giant Peakyturtle
	BPMonster	MI_DEMIAN4                6	9	// lv13 boss - Giant Demian
	BPMonster	MI_LAWOLF1                4	6	// lv13 low - Young Lawolf
	BPMonster	MI_LAWOLF2                4	6	// lv13 normal - Lawolf
	BPMonster	MI_MOMYORN                4	6	// lv13 normal - Mother Yoln
	BPMonster	MI_LAWOLF3                4	6	// lv14 captain - Grownup Lawolf
	BPMonster	MI_BABARI                 4	6	// lv15 normal - Babari
	BPMonster	MI_CHANER                 4	6	// lv15 normal - Chaner
	BPMonster	MI_CRISTMASGIGLEBOX       4	6	// lv15 low - Mischievous Present Box
	BPMonster	MI_DORIDOMA4              6	9	// lv15 boss - Giant Doridoma
	BPMonster	MI_ERONSCATCHER           4	6	// lv15 material - Erons Catcher
	BPMonster	MI_EVEKALGASBABY          4	6	// lv15 low - Event Baby Cargo
	BPMonster	MI_EVENT01                8	12	// lv15 super - GM Lysis
	BPMonster	MI_FEFERN1                4	6	// lv15 low - 1st Class Fefern
	BPMonster	MI_FEFERN2                4	6	// lv15 normal - Fefern
	BPMonster	MI_GURUCATCHER            4	6	// lv15 material - Guru Catcher
	BPMonster	MI_KRASECCATCHER          4	6	// lv15 material - Krasec Catcher
	BPMonster	MI_LOVETHIEF              4	6	// lv15 low - Love Thief
	BPMonster	MI_MINECATCHER            4	6	// lv15 material - Mine Catcher
	BPMonster	MI_PK_FEFERN              4	6	// lv15 low - Criminal Fefern
	BPMonster	MI_PUKEPUKE5              4	6	// lv15 low - Brazenface Pukepuke
	BPMonster	MI_SEIDO                  4	6	// lv15 normal - Seido
	BPMonster	MI_SHURAITURE             4	6	// lv15 normal - Shuraiture
	BPMonster	MI_FEFERN3                4	6	// lv16 captain - 2nd Class Fefern
	BPMonster	MI_LAWOLF4                6	9	// lv17 boss - Giant Lawolf
	BPMonster	MI_NYANGNYANG1            4	6	// lv17 low - Cute Nyangnyang
	BPMonster	MI_NYANGNYANG2            4	6	// lv17 normal - Nyangnyang
	BPMonster	MI_NYANGNYANG3            4	6	// lv18 captain - Creep Nyangnyang
	BPMonster	MI_BANG1                  4	6	// lv19 low - Bang
	BPMonster	MI_BANG2                  4	6	// lv19 normal - Captain Bang
	BPMonster	MI_FEFERN4                6	9	// lv19 boss - Giant Fefern
	BPMonster	MI_ANTTURTLE              4	6	// lv20 captain - Ant Turtle
	BPMonster	MI_BANG3                  4	6	// lv20 captain - Boss Bang
	BPMonster	MI_EVEMOTHBEE             4	6	// lv20 normal - Event Mosbie
	BPMonster	MI_MIA5                   8	12	// lv20 super - Event Mia
	BPMonster	MI_MOTHBEE1               4	6	// lv20 low - Small Mothbee
	BPMonster	MI_MOTHBEE2               4	6	// lv20 normal - Mothbee
	BPMonster	MI_DUFEFERN1              8	12	// lv21 normal - Mutant Fefern
	BPMonster	MI_FLYBAT1                8	12	// lv21 low - Small Flybat
	BPMonster	MI_FLYBAT2                8	12	// lv21 normal - Flybat
	BPMonster	MI_MOTHBEE3               8	12	// lv21 captain - Captain Mothbee
	BPMonster	MI_NYANGNYANG4            12	18	// lv21 boss - Giant Nyangnyang
	BPMonster	MI_WAGSAAC1               8	12	// lv21 low - Small Wagsaac
	BPMonster	MI_WAGSAAC2               8	12	// lv21 normal - Wagsaac
	BPMonster	MI_DUFEFERN2              8	12	// lv22 captain - Mutant Fefern King
	BPMonster	MI_FLYBAT3                8	12	// lv22 captain - Captain Flybat
	BPMonster	MI_PK_WAGSAAC             8	12	// lv22 captain - Criminal Wagsaac
	BPMonster	MI_VIOLMAGICION           8	12	// lv22 normal - Member of the Violet Magician Troupe
	BPMonster	MI_WAGSAAC3               8	12	// lv22 captain - Captain Wagsaac
	BPMonster	MI_BANG4                  12	18	// lv23 boss - Giant Bang
	BPMonster	MI_COLOBANG_1             12	18	// lv23 boss - [Inferior Soul] Giant Bang
	BPMonster	MI_DUNYANGNYANG1          8	12	// lv23 normal - Mutant Nyangnyang
	BPMonster	MI_MIA1                   8	12	// lv23 low - Small Mia
	BPMonster	MI_MIA2                   8	12	// lv23 normal - Mia
	BPMonster	MI_DUNYANGNYANG2          8	12	// lv24 captain - Mutant Nyangnyang Queen
	BPMonster	MI_MIA3                   8	12	// lv24 captain - Captain Mia
	BPMonster	MI_BIGMUSCLE              10	15	// lv25 midboss - Big Muscle
	BPMonster	MI_COLOWAGJAK             12	18	// lv25 boss - [Mirrored Soul] Giant Wagsaac
	BPMonster	MI_COLOWAGJAK_1           12	18	// lv25 boss - [Inferior Soul] Giant Wagsaac
	BPMonster	MI_DUBANG1                8	12	// lv25 normal - Mutant Bang
	BPMonster	MI_DUFEFERN3              12	18	// lv25 boss - Mutant Giant 2nd Class Fefern
	BPMonster	MI_FLYBAT4                12	18	// lv25 boss - Giant Flybat
	BPMonster	MI_MOTHBEE4               12	18	// lv25 boss - Giant Mothbee
	BPMonster	MI_MRPUMPKIN1             8	12	// lv25 low - Stale Mr. Pumpkin
	BPMonster	MI_MRPUMPKIN2             8	12	// lv25 normal - Mr. Pumpkin
	BPMonster	MI_ORGANIGOR              8	12	// lv25 normal - Organigor
	BPMonster	MI_WAGSAAC4               12	18	// lv25 boss - Giant Wagsaac
	BPMonster	MI_DUBANG2                8	12	// lv26 captain - Mutant Boss Bang
	BPMonster	MI_MRPUMPKIN3             8	12	// lv26 captain - Rotten Mr Pumpkin
	BPMonster	MI_DUNYANGNYANG3          12	18	// lv27 boss - Mutant Giant Nyangnyang
	BPMonster	MI_MIA4                   12	18	// lv27 boss - Giant Mia
	BPMonster	MI_PK_MRPUMPKIN           8	12	// lv27 captain - Criminal Mr. Pumpkin
	BPMonster	MI_REDMANTIS1             8	12	// lv27 low - Red Mantis C
	BPMonster	MI_REDMANTIS2             8	12	// lv27 normal - Red Mantis B
	BPMonster	MI_REDMANTIS3             8	12	// lv28 captain - Red Mantis A
	BPMonster	MI_DUBANG3                12	18	// lv29 boss - Mutant Giant Bang King
	BPMonster	MI_JACKTHEHAMMER1         8	12	// lv29 low - Small Jack the Hammer
	BPMonster	MI_JACKTHEHAMMER2         8	12	// lv29 normal - Jack the Hammer
	BPMonster	MI_MRPUMPKIN4             12	18	// lv29 boss - Giant Mr. Pumpkin
	BPMonster	MI_MRPUMPKIN5             12	18	// lv29 boss - Beast Mr. Pumpkin
	BPMonster	MI_EVENT02                16	24	// lv30 super - GM Demian
	BPMonster	MI_HAMMERKICK             8	12	// lv30 captain - Hammer Kick
	BPMonster	MI_JACKTHEHAMMER3         8	12	// lv30 captain - Captain Jack the Hammer
	BPMonster	MI_RBANG1                 8	12	// lv30 normal - Red Bang Troupe Member
	BPMonster	MI_VICEVEDUQUE            8	12	// lv30 captain - Vice Veduque
	BPMonster	MI_VIOLMAGICION2          8	12	// lv30 normal - Member of the Violet Magician Troupe
	BPMonster	MI_ZOMBIGER5              12	18	// lv30 boss - Beast Zombiger
	BPMonster	MI_COLOREDMANTIS          12	18	// lv31 boss - [Mirrored Soul] Giant Red Mantis
	BPMonster	MI_COLOREDMANTIS_1        12	18	// lv31 boss - [Inferior Soul] Giant Red Mantis
	BPMonster	MI_GIGGLEBOX1             8	12	// lv31 low - Small Giggle Box
	BPMonster	MI_GIGGLEBOX2             8	12	// lv31 normal - Giggle Box
	BPMonster	MI_REDMANTIS4             12	18	// lv31 boss - Giant Red Mantis
	BPMonster	MI_GIGGLEBOX3             8	12	// lv32 captain - Captain Giggle Box
	BPMonster	MI_PK_GIGGLEBOX           8	12	// lv32 captain - Criminal Gigglebox
	BPMonster	MI_WORMVEDUQUE            12	18	// lv32 boss - Worm Veduque
	BPMonster	MI_BANG5                  8	12	// lv33 low - Heartless Bang
	BPMonster	MI_BUCROW1                8	12	// lv33 low - Small Bucrow
	BPMonster	MI_BUCROW2                8	12	// lv33 normal - Bucrow
	BPMonster	MI_COLOJACKTHEHAMMER      12	18	// lv33 boss - [Mirrored Soul] Giant Jack the Hammer
	BPMonster	MI_COLOJACKTHEHAMMER_1    12	18	// lv33 boss - [Inferior Soul] Giant Jack the Hammer
	BPMonster	MI_JACKTHEHAMMER4         12	18	// lv33 boss - Giant Jack the Hammer
	BPMonster	MI_ROCKMUSCLE1            8	12	// lv33 low - Small Rock Muscle
	BPMonster	MI_ROCKMUSCLE2            8	12	// lv33 normal - Rock Muscle
	BPMonster	MI_BUCROW3                8	12	// lv34 captain - Captain Bucrow
	BPMonster	MI_ROCKMUSCLE3            8	12	// lv34 captain - Captain Rock Muscle
	BPMonster	MI_GANGARD                8	12	// lv35 normal - Gangard
	BPMonster	MI_GIGGLEBOX4             12	18	// lv35 boss - Giant Giggle Box
	BPMonster	MI_HOBO1                  8	12	// lv35 low - Small Hobo
	BPMonster	MI_HOBO2                  8	12	// lv35 normal - Hobo
	BPMonster	MI_KRRR                   10	15	// lv35 midboss - Krrr
	BPMonster	MI_RBANG2                 8	12	// lv35 normal - Red Bang Troupe Leader
	BPMonster	MI_SERUSURIEL             12	18	// lv35 boss - Serus Uriel
	BPMonster	MI_HOBO3                  8	12	// lv36 captain - Captain Hobo
	BPMonster	MI_SMALL_MUSHPOIE         8	12	// lv36 normal - Small Mushpoie
	BPMonster	MI_BUCROW4                12	18	// lv37 boss - Giant Bucrow
	BPMonster	MI_COLOBERKRO             12	18	// lv37 boss - [Mirrored Soul] Giant Bucrow
	BPMonster	MI_COLOBERKRO_1           12	18	// lv37 boss - [Inferior Soul] Giant Bucrow
	BPMonster	MI_DUMBBULL1              8	12	// lv37 low - Small Dumb Bull
	BPMonster	MI_DUMBBULL2              8	12	// lv37 normal - Dumb Bull
	BPMonster	MI_PK_HOBO                8	12	// lv37 captain - Criminal Hobo
	BPMonster	MI_ROCKMUSCLE4            12	18	// lv37 boss - Giant Rock Muscle
	BPMonster	MI_DUMBBULL3              8	12	// lv38 captain - Captain Dumb Bull
	BPMonster	MI_COLOHOWBOW             12	18	// lv39 boss - [Mirrored Soul] Giant Hobo
	BPMonster	MI_COLOHOWBOW_1           12	18	// lv39 boss - [Inferior Soul] Giant Hobo
	BPMonster	MI_HOBO4                  12	18	// lv39 boss - Giant Hobo
	BPMonster	MI_TOTEMIA1               8	12	// lv39 low - Small Totemia
	BPMonster	MI_TOTEMIA2               8	12	// lv39 normal - Totemia
	BPMonster	MI_CARDPUPPET5            16	24	// lv40 super - Event Cardpuppet
	BPMonster	MI_LORDBANG               12	18	// lv40 boss - Lord Bang
	BPMonster	MI_TOTEMIA3               8	12	// lv40 captain - Captain Totemia
	BPMonster	MI_VIOLMAGICION3          12	18	// lv40 boss - Arc Master of the Violet Magician Troupe
	BPMonster	MI_CARDPUPPET1            14	20	// lv41 low - Maid Cardpuppet
	BPMonster	MI_CARDPUPPET2            14	20	// lv41 normal - Cardpuppet
	BPMonster	MI_DUMBBULL4              21	30	// lv41 boss - Giant Dumb Bull
	BPMonster	MI_CARDPUPPET3            14	20	// lv42 captain - Manager Cardpuppet
	BPMonster	MI_FLBYRIGEN1             14	20	// lv42 low - Small Flbyrigen
	BPMonster	MI_FLBYRIGEN2             14	20	// lv42 normal - Flbyrigen
	BPMonster	MI_PK_CARDPUPPET          14	20	// lv42 captain - Criminal Cardpuppet
	BPMonster	MI_FLBYRIGEN3             14	20	// lv43 captain - Captain Flbyrigen
	BPMonster	MI_KINGSTER01             60	80	// lv123 normal - Small Kingster
	BPMonster	MI_SCOPICON1              14	20	// lv43 low - Small Scorpicon
	BPMonster	MI_SCOPICON2              14	20	// lv43 normal - Scorpicon
	BPMonster	MI_TOMBSTONEBEARER1       14	20	// lv43 low - Small Tombstone Bearer
	BPMonster	MI_TOMBSTONEBEARER2       14	20	// lv43 normal - Tombstone Bearer
	BPMonster	MI_TOTEMIA4               21	30	// lv43 boss - Giant Totemia
	BPMonster	MI_KINGSTER02             60	80	// lv124 normal - Kingster
	BPMonster	MI_SCOPICON3              14	20	// lv44 captain - Captain Scorpicon
	BPMonster	MI_TOMBSTONEBEARER3       14	20	// lv44 captain - Captain Tombstone Bearer
	BPMonster	MI_BASQUE1                14	20	// lv45 low - Phantom Basque
	BPMonster	MI_BASQUE2                14	20	// lv45 normal - Basque
	BPMonster	MI_CARDPUPPET4            21	30	// lv45 boss - Boss Cardpuppet
	BPMonster	MI_HADESEOR               14	20	// lv45 normal - Hadeseor
	BPMonster	MI_IBLCRASHER             14	20	// lv45 normal - Ivillis Crasher
	BPMonster	MI_IBLGUARDER             18	25	// lv45 midboss - Ivillis Guardian
	BPMonster	MI_KINGSTER03             60	80	// lv125 normal - Captain Kingster
	BPMonster	MI_MUSHMOOT               18	25	// lv45 midboss - Mushmoot
	BPMonster	MI_BASQUE3                14	20	// lv46 captain - Lumping Basque
	BPMonster	MI_FLBYRIGEN4             21	30	// lv46 boss - Giant Flbyrigen
	BPMonster	MI_KRAKEN01               60	80	// lv126 normal - Small Kraken
	BPMonster	MI_CIRCUSBEAR1            14	20	// lv47 low - Small Circus Bear
	BPMonster	MI_CIRCUSBEAR2            14	20	// lv47 normal - Circus Bear
	BPMonster	MI_KRAKEN02               60	80	// lv127 normal - Kraken
	BPMonster	MI_PK_BASQUE              14	20	// lv47 captain - Criminal Basque
	BPMonster	MI_PRANKSTER1             14	20	// lv47 low - Small Mage Prankster
	BPMonster	MI_PRANKSTER2             14	20	// lv47 normal - Prankster
	BPMonster	MI_ROCKMUSCLE5            14	20	// lv47 low - Tough Rock Muscle
	BPMonster	MI_SCOPICON4              21	30	// lv47 boss - Giant Scorpicon
	BPMonster	MI_TOMBSTONEBEARER4       21	30	// lv47 boss - Giant Tombstone Bearer
	BPMonster	MI_CIRCUSBEAR3            14	20	// lv48 captain - Captain Circus Bear
	BPMonster	MI_KRAKEN03               60	80	// lv128 normal - Captain Kraken
	BPMonster	MI_PRANKSTER3             14	20	// lv48 captain - Master Mage Prankster
	BPMonster	MI_BASQUE4                21	30	// lv49 boss - Giant Basque
	BPMonster	MI_CREPER01               60	80	// lv129 normal - Small Creper
	BPMonster	MI_EVEROCKEPELLER         14	20	// lv49 normal - Event Rocketfeller
	BPMonster	MI_ROCKEPELLER1           14	20	// lv49 low - Small Rockepeller
	BPMonster	MI_ROCKEPELLER2           14	20	// lv49 normal - Rockepeller
	BPMonster	MI_WHEELEM1               14	20	// lv49 low - Rough Wheelem
	BPMonster	MI_WHEELEM2               14	20	// lv49 normal - Wheelem
	BPMonster	MI_CREPER02               60	80	// lv130 normal - Creper
	BPMonster	MI_IBLPOISONER            14	20	// lv50 normal - Ivillis Poisoner
	BPMonster	MI_ROCKEPELLER3           14	20	// lv50 captain - Captain Rockepeller
	BPMonster	MI_WHEELEM3               14	20	// lv50 captain - Bouncing Wheelem
	BPMonster	MI_CIRCUSBEAR4            21	30	// lv51 boss - Giant Circus Bear
	BPMonster	MI_CREPER03               60	80	// lv131 normal - Captain Creper
	BPMonster	MI_LEYENA1                14	20	// lv51 low - Small Leyena
	BPMonster	MI_LEYENA2                14	20	// lv51 normal - Leyena
	BPMonster	MI_PRANKSTER4             21	30	// lv51 boss - Giantmage Prankster
	BPMonster	MI_TRANGFOMA1             14	20	// lv51 low - Small Trangfoma
	BPMonster	MI_TRANGFOMA2             14	20	// lv51 normal - Trangfoma
	BPMonster	MI_LEYENA3                14	20	// lv52 captain - Captain Leyena
	BPMonster	MI_NAGA01                 60	80	// lv132 normal - Small Naga
	BPMonster	MI_PK_LEYENA              14	20	// lv52 captain - Criminal Leyena
	BPMonster	MI_TRANGFOMA3             14	20	// lv52 captain - Captain Trangfoma
	BPMonster	MI_COLOROKEPELER          21	30	// lv53 boss - [Mirrored Soul] Giant Rockepeller
	BPMonster	MI_COLOROKEPELER_1        21	30	// lv53 boss - [Inferior Soul] Giant Rockepeller
	BPMonster	MI_IBLREDOTEM             14	20	// lv53 normal - Ivillis Red Otem
	BPMonster	MI_NAGA02                 60	80	// lv133 normal - Naga
	BPMonster	MI_ROCKEPELLER4           21	30	// lv53 boss - Giant Rockepeller
	BPMonster	MI_STEAMWALKER1           14	20	// lv53 low - Small Steam Walker
	BPMonster	MI_STEAMWALKER2           14	20	// lv53 normal - Steam Walker
	BPMonster	MI_NAGA03                 60	80	// lv134 normal - Captain Naga
	BPMonster	MI_STEAMWALKER3           14	20	// lv54 captain - Captain Steam Walker
	BPMonster	MI_ATROX01                60	80	// lv135 normal - Small Atrox
	BPMonster	MI_IBLQUAKER              18	25	// lv55 midboss - Ivillis Quaker
	BPMonster	MI_IBLWRECKER             14	20	// lv55 normal - Ivillis Wrecker
	BPMonster	MI_STEELKNIGHT1           14	20	// lv55 low - Small Steel Knight
	BPMonster	MI_STEELKNIGHT2           14	20	// lv55 normal - Steel Knight
	BPMonster	MI_ZOMBIGER1              14	20	// lv55 low - Small Zombiger
	BPMonster	MI_ZOMBIGER2              14	20	// lv55 normal - Zombiger
	BPMonster	MI_ATROX02                60	80	// lv136 normal - Atrox
	BPMonster	MI_STEELKNIGHT3           14	20	// lv56 captain - Captain Steel Knight
	BPMonster	MI_ZOMBIGER3              14	20	// lv56 captain - Captain Zombiger
	BPMonster	MI_ATROX03                60	80	// lv137 normal - Captain Atrox
	BPMonster	MI_COLOSTIMEWORK          21	30	// lv57 boss - [Mirrored Soul] Giant Steam Walker
	BPMonster	MI_COLOSTIMEWORK_1        21	30	// lv57 boss - [Inferior Soul] Giant Steam Walker
	BPMonster	MI_NUCTUVEHICLE1          14	20	// lv57 low - Small Nuctuvehicle
	BPMonster	MI_NUCTUVEHICLE2          14	20	// lv57 normal - Nuctuvehicle
	BPMonster	MI_NUTTYWHEEL1            14	20	// lv57 low - Small Nutty Wheel
	BPMonster	MI_NUTTYWHEEL2            14	20	// lv57 normal - Nutty Wheel
	BPMonster	MI_PK_STEELKNIGHT         14	20	// lv57 captain - Criminal Steelknight
	BPMonster	MI_NUCTUVEHICLE3          14	20	// lv58 captain - Captain Nuctuvehicle
	BPMonster	MI_NUTTYWHEEL3            14	20	// lv58 captain - Captain Nutty Wheel
	BPMonster	MI_OKEAN01                60	80	// lv138 normal - Small Okean
	BPMonster	MI_DRILLER1               14	20	// lv59 low - Small Driller
	BPMonster	MI_DRILLER2               14	20	// lv59 normal - Driller
	BPMonster	MI_OKEAN02                60	80	// lv139 normal - Okean
	BPMonster	MI_RISEM1                 14	20	// lv59 low - Small Risem
	BPMonster	MI_RISEM2                 14	20	// lv59 normal - Risem
	BPMonster	MI_DRILLER3               14	20	// lv60 captain - Captain Driller
	BPMonster	MI_GUARDMON1              14	20	// lv60 normal - Venel Guardian
	BPMonster	MI_HOIREN                 14	20	// lv60 normal - Hoiren
	BPMonster	MI_HUNTERX                14	20	// lv60 normal - Hunter X
	BPMonster	MI_IBLDOZER               14	20	// lv60 normal - Ivillis Destroyer
	BPMonster	MI_KIDLER                 14	20	// lv60 normal - Kidler
	BPMonster	MI_KYNSY                  14	20	// lv60 normal - Kynsy
	BPMonster	MI_OKEAN03                60	80	// lv140 normal - Captain Okean
	BPMonster	MI_REN                    14	20	// lv60 normal - Ren
	BPMonster	MI_RISEM3                 14	20	// lv60 captain - Captain Risem
	BPMonster	MI_RUBO                   14	20	// lv60 normal - Rubo
	BPMonster	MI_SHAKALPION             14	20	// lv60 normal - Shacalpion
	BPMonster	MI_SISIF                  14	20	// lv60 normal - Sisif
	BPMonster	MI_TAIGA01                80	110	// lv141 normal - Small Tigar
	BPMonster	MI_VOLT1                  22	32	// lv61 low - Small Volt
	BPMonster	MI_VOLT2                  22	32	// lv61 normal - Volt
	BPMonster	MI_CAITSITH01             22	32	// lv62 low - Small Catsy
	BPMonster	MI_PK_VOLT                22	32	// lv62 captain - Criminal Volt
	BPMonster	MI_TAIGA02                80	110	// lv142 normal - Tigar
	BPMonster	MI_VOLT3                  22	32	// lv62 captain - Captain Volt
	BPMonster	MI_ELDERGUARD1            22	32	// lv63 low - Small Elderguard
	BPMonster	MI_ELDERGUARD2            22	32	// lv63 normal - Elderguard
	BPMonster	MI_IBLBLACKOTEM           22	32	// lv63 normal - Ivillis Black Otem
	BPMonster	MI_TAIGA03                80	110	// lv143 normal - Captain Tigar
	BPMonster	MI_CAITSITH02             22	32	// lv64 normal - Catsy
	BPMonster	MI_DORIAN01               80	110	// lv144 normal - Small Dorian
	BPMonster	MI_ELDERGUARD3            22	32	// lv64 captain - Captain Elderguard
	BPMonster	MI_DORIAN02               80	110	// lv145 normal - Dorian
	BPMonster	MI_EMERALDMANTIS          22	32	// lv65 normal - Emeraldmantis
	BPMonster	MI_GARBAGEPIDER1          22	32	// lv65 low - Small Garbagepider
	BPMonster	MI_GARBAGEPIDER2          22	32	// lv65 normal - Garbagepider
	BPMonster	MI_IBLBOXTER              22	32	// lv65 normal - Ivillis Boxter
	BPMonster	MI_IBLMUCILAGER           28	40	// lv65 midboss - Ivillis Mushellizer
	BPMonster	MI_IBLPUPPET              22	32	// lv65 normal - Ivillis Puppet
	BPMonster	MI_LBHANOYAN              22	32	// lv65 normal - Lord Bang Hanoyan
	BPMonster	MI_RUSTIACRASHGATE01      44	64	// lv65 super - Water Totem pole
	BPMonster	MI_RUSTIACRASHGATE02      44	64	// lv65 super - Wind Totem pole
	BPMonster	MI_RUSTIACRASHGATE03      44	64	// lv65 super - Earth Totem pole
	BPMonster	MI_RUSTIACRASHGATE04      44	64	// lv65 super - Fire Totem pole
	BPMonster	MI_CAITSITH03             22	32	// lv66 captain - Captain Catsy
	BPMonster	MI_DORIAN03               80	110	// lv146 normal - Captain Dorian
	BPMonster	MI_GARBAGEPIDER3          22	32	// lv66 captain - Captain Garbagepider
	BPMonster	MI_CAITSITH04             33	48	// lv67 boss - Giant Catsy
	BPMonster	MI_CAITSITH04_1           120	160	// lv140 super - Great Catsy
	BPMonster	MI_CRANEMACHINERY1        22	32	// lv67 low - Small Crane Machinery
	BPMonster	MI_CRANEMACHINERY2        22	32	// lv67 normal - Crane Machinery
	BPMonster	MI_MEREL01                80	110	// lv147 normal - Small Meral
	BPMonster	MI_PK_GARBAGEPIDER        22	32	// lv67 captain - Criminal Garbagepider
	BPMonster	MI_CLOCKS                 22	32	// lv68 normal - Clocks
	BPMonster	MI_CRANEMACHINERY3        22	32	// lv68 captain - Captain Crane Machinery
	BPMonster	MI_HARPY01                22	32	// lv68 low - Small Harpy
	BPMonster	MI_IBLDANDISHER           22	32	// lv68 normal - Ivillis Dandysher
	BPMonster	MI_MEREL02                80	110	// lv148 normal - Meral
	BPMonster	MI_NAUTREPY1              22	32	// lv68 low - Small Nautrepy
	BPMonster	MI_MEREL03                80	110	// lv149 normal - Captain Meral
	BPMonster	MI_NAUTREPY2              22	32	// lv69 normal - Nautrepy
	BPMonster	MI_SYLIACA1               22	32	// lv69 low - Young Syliaca
	BPMonster	MI_SYLIACA2               22	32	// lv69 normal - Syliaca
	BPMonster	MI_BIGCOBRA01             22	32	// lv70 captain - Prismatic Cobra
	BPMonster	MI_BIGCOBRA02             22	32	// lv70 captain - Mythic Prismatic Cobra
	BPMonster	MI_EVENT03                44	64	// lv70 super - GM Redsun
	BPMonster	MI_GPOTATO02              33	48	// lv70 boss - Maximus Rex gPotato
	BPMonster	MI_HARPY02                22	32	// lv70 normal - Harpy
	BPMonster	MI_IBLLINESS              28	40	// lv70 midboss - Ivillis Leanes
	BPMonster	MI_IBLTAKER               22	32	// lv70 normal - Ivillis Thief
	BPMonster	MI_NAUTREPY3              22	32	// lv70 captain - Captain Nautrepy
	BPMonster	MI_RANGDA01               44	64	// lv70 super - Rangda
	BPMonster	MI_SYLIACA3               22	32	// lv70 captain - Grownup Syliaca
	BPMonster	MI_BIGVARIETYCOBRA01      22	32	// lv71 captain - Twinstrike Cobra
	BPMonster	MI_BIGVARIETYCOBRA02      22	32	// lv71 captain - Mythic Twinstrike Cobra
	BPMonster	MI_GREEMONG1              22	32	// lv71 low - Small Greemong
	BPMonster	MI_GREEMONG2              22	32	// lv71 normal - Greemong
	BPMonster	MI_BIGRACCOON01           22	32	// lv72 captain - Tanuki Enforcer
	BPMonster	MI_BIGRACCOON02           22	32	// lv72 captain - Elite Tanuki Enforcer
	BPMonster	MI_BOO1                   22	32	// lv72 low - Small Boo
	BPMonster	MI_COLORACCOUN            22	32	// lv72 captain - [Mirrored Soul] Tanuki
	BPMonster	MI_COLORACCOUN_1          22	32	// lv72 captain - [False Soul] Tanuki
	BPMonster	MI_GREEMONG3              22	32	// lv72 captain - Captain Greemong
	BPMonster	MI_HARPY03                22	32	// lv72 captain - Captain Harpy
	BPMonster	MI_PK_GREEMONG            22	32	// lv72 captain - Criminal Greemong
	BPMonster	MI_BIGSOLDIERRACCOON01    22	32	// lv73 captain - Tanuki Protector
	BPMonster	MI_BIGSOLDIERRACCOON02    22	32	// lv73 captain - Elite Tanuki Protector
	BPMonster	MI_BOO2                   22	32	// lv73 normal - Boo
	BPMonster	MI_CARRIERBOMB1           22	32	// lv73 low - Small Carrierbomb
	BPMonster	MI_CARRIERBOMB2           22	32	// lv73 normal - Carrierbomb
	BPMonster	MI_HARPY04                33	48	// lv73 boss - Giant Harpy
	BPMonster	MI_HARPY04_1              160	220	// lv141 super - Great Harpy
	BPMonster	MI_NPC_YETI01             22	32	// lv73 normal - Yetti
	BPMonster	MI_BOO3                   22	32	// lv74 captain - Captain Boo
	BPMonster	MI_CARRIERBOMB3           22	32	// lv74 captain - Captain Carrierbomb
	BPMonster	MI_POLEVIK01              22	32	// lv74 low - Small Gullah
	BPMonster	MI_SOLDIERTANGZ01         22	32	// lv74 captain - Wildwood Stalker
	BPMonster	MI_SOLDIERTANGZ02         22	32	// lv74 captain - Mythic Wildwood Stalker
	BPMonster	MI_COLOGRIMONG            33	48	// lv75 boss - [Mirrored Soul] Giant Greemong
	BPMonster	MI_COLOGRIMONG_1          33	48	// lv75 boss - [Inferior Soul] Giant Greemong
	BPMonster	MI_HOPPRE1                22	32	// lv75 low - Small Hoppre
	BPMonster	MI_PIRE1                  22	32	// lv75 low - Small Pire
	BPMonster	MI_PIRE2                  22	32	// lv75 normal - Pire
	BPMonster	MI_SHAMANWUTANGKA01       22	32	// lv75 captain - Wildwood Shaman
	BPMonster	MI_SHAMANWUTANGKA02       22	32	// lv75 captain - Shadowy Wildwood Shaman
	BPMonster	MI_DREAMFLAME01           22	32	// lv76 captain - Blossom
	BPMonster	MI_HOPPRE2                22	32	// lv76 normal - Hoppre
	BPMonster	MI_PIRE3                  22	32	// lv76 captain - Captain Pire
	BPMonster	MI_POLEVIK02              22	32	// lv76 normal - Gullah
	BPMonster	MI_DREAMOLDRUT01_1        22	32	// lv77 captain - Vile Oldroot
	BPMonster	MI_HOPPRE3                22	32	// lv77 captain - Captain Hoppre
	BPMonster	MI_PK_HOPPRE              22	32	// lv77 captain - Criminal Hoppre
	BPMonster	MI_DREAMMINIMUSHU01_1     22	32	// lv78 captain - Vile Minimusha
	BPMonster	MI_MUSHPOIE1              22	32	// lv78 low - Small Mushpoie
	BPMonster	MI_POLEVIK03              22	32	// lv78 captain - Captain Gullah
	BPMonster	MI_CLAWDOLL1              22	32	// lv79 low - Small Clawdoll
	BPMonster	MI_CLAWDOLL2              22	32	// lv79 normal - Clawdoll
	BPMonster	MI_DREAMLADYBLUM01        22	32	// lv79 captain - Lady Bloom
	BPMonster	MI_DREAMLADYBLUM01_1      22	32	// lv79 captain - Vile Lady Bloom
	BPMonster	MI_MUSHPOIE2              22	32	// lv79 normal - Mushpoie
	BPMonster	MI_NPC_YETI02             22	32	// lv79 normal - Mutant Yetti
	BPMonster	MI_PIRE4                  33	48	// lv79 boss - Giant Pire
	BPMonster	MI_POLEVIK04              33	48	// lv79 boss - Giant Gullah
	BPMonster	MI_POLEVIK04_1            160	220	// lv142 super - Great Gullah
	BPMonster	MI_ABRAXAS01              22	32	// lv80 low - Small Abraxas
	BPMonster	MI_BESIBIGFOOT01          44	64	// lv80 super - Beast King Khan
	BPMonster	MI_BESIBIGFOOT02          44	64	// lv80 super - Beast Overlord Khan
	BPMonster	MI_CLAWDOLL3              22	32	// lv80 captain - Captain Clawdoll
	BPMonster	MI_CLOCKWORK1             44	64	// lv80 super - Clockworks
	BPMonster	MI_COLOBIGFOOT            44	64	// lv80 super - [Mirrored Soul] Khan
	BPMonster	MI_COLOBIGFOOT_1          44	64	// lv80 super - [False Soul] Khan
	BPMonster	MI_COLOCLOCKWORK          44	64	// lv80 super - [Mirrored Soul] Clockworks
	BPMonster	MI_COLOCLOCKWORK_1        44	64	// lv80 super - [False Soul] Clockworks
	BPMonster	MI_DREAMNIGHTMIST01       22	32	// lv80 captain - Nightmyst
	BPMonster	MI_DREAMNIGHTMIST01_1     22	32	// lv80 captain - Vile Nightmyst
	BPMonster	MI_MUSHPOIE3              22	32	// lv80 captain - Captain Mushpoie
	BPMonster	MI_IREN1                  32	44	// lv81 low - Small Iren
	BPMonster	MI_ABRAXAS02              32	44	// lv82 normal - Abraxas
	BPMonster	MI_IREN2                  32	44	// lv82 normal - Iren
	BPMonster	MI_CLAWDOLL4              48	66	// lv83 boss - Giant Clawdoll
	BPMonster	MI_IREN3                  32	44	// lv83 captain - Captain Iren
	BPMonster	MI_PK_IREN                32	44	// lv83 captain - Criminal Iren
	BPMonster	MI_RAMPAGEBUTCHER1        32	44	// lv83 low - Small Rampage Butcher
	BPMonster	MI_RAMPAGEBUTCHER2        32	44	// lv83 normal - Small Rampage Butcher
	BPMonster	MI_ABRAXAS03              32	44	// lv84 captain - Captain Abraxas
	BPMonster	MI_RAMPAGEBUTCHER3        32	44	// lv84 captain - Captain Rampage Butcher
	BPMonster	MI_WATANGKA1              32	44	// lv84 low - Small Watangka
	BPMonster	MI_ABRAXAS04              48	66	// lv85 boss - Giant Abraxas
	BPMonster	MI_ABRAXAS04_1            160	220	// lv143 super - Great Abraxas
	BPMonster	MI_DREAMQEEN01            64	88	// lv85 super - [Queen of Thorns] Entaness
	BPMonster	MI_DREAMQEEN01_1          64	88	// lv85 super - [Vile Queen of Thorns] Entaness
	BPMonster	MI_DU_DKKEAKOON1          32	44	// lv85 normal - Keakoon Worker
	BPMonster	MI_DU_DKKEAKOON2          32	44	// lv85 normal - Keakoon Guard
	BPMonster	MI_DU_DKROACHFL5          32	44	// lv85 low - Pink Roach Larva
	BPMonster	MI_DU_DKROACHFL6          32	44	// lv85 low - Blue Roach Larva
	BPMonster	MI_NPC_AUGOO01            32	44	// lv85 normal - Augu
	BPMonster	MI_RANGDA02               64	88	// lv85 super - Horrible Rangda
	BPMonster	MI_WATANGKA2              32	44	// lv85 normal - Watangka
	BPMonster	MI_DU_DKKEAKOON5          32	44	// lv86 normal - Elite Keakoon Worker
	BPMonster	MI_DU_DKKEAKOON6          32	44	// lv86 normal - Elite Keakoon Guard
	BPMonster	MI_HAG01                  32	44	// lv86 low - Small Hague
	BPMonster	MI_WATANGKA3              32	44	// lv86 captain - Captain Watangka
	BPMonster	MI_ANTIQUERY1             32	44	// lv87 low - Small Antiquery
	BPMonster	MI_DU_DKKEAKOON3          48	66	// lv87 boss - Keakoon Worker Leader
	BPMonster	MI_DU_DKKEAKOON4          48	66	// lv87 boss - Keakoon Guard Leader
	BPMonster	MI_DU_DKROACHFL1          32	44	// lv87 normal - Pink Roach
	BPMonster	MI_DU_DKROACHFL2          32	44	// lv87 normal - Blue Roach
	BPMonster	MI_GRRR1                  32	44	// lv87 low - Small Grrr
	BPMonster	MI_PK_WATANGKA            32	44	// lv87 captain - Criminal Watangka
	BPMonster	MI_RAMPAGEBUTCHER4        48	66	// lv87 boss - Giant Rampage Butcher
	BPMonster	MI_ANTIQUERY2             32	44	// lv88 normal - Antiquery
	BPMonster	MI_DU_DKKEAKOON7          48	66	// lv88 boss - Elite Keakoon Worker Leader
	BPMonster	MI_DU_DKTRILLIPY1         32	44	// lv88 captain - Green Trillipy
	BPMonster	MI_GRRR2                  32	44	// lv88 normal - Grrr
	BPMonster	MI_HAG02                  32	44	// lv88 normal - Hague
	BPMonster	MI_ANTIQUERY3             32	44	// lv89 captain - Captain Antiquery
	BPMonster	MI_DU_DKKEAKOON8          48	66	// lv89 boss - Elite Keakoon Guard Leader
	BPMonster	MI_DU_DKROACHFL3          48	66	// lv89 boss - Pink Roach Queen
	BPMonster	MI_DU_DKROACHFL4          48	66	// lv89 boss - Blue Roach Queen
	BPMonster	MI_DU_DKTRILLIPY3         32	44	// lv89 captain - Violet Trillipy
	BPMonster	MI_GRRR3                  32	44	// lv89 captain - Captain Grrr
	BPMonster	MI_DUMP1                  32	44	// lv90 low - Small Dump
	BPMonster	MI_DU_DKTRILLIPY2         48	66	// lv90 boss - Hazardous Green Trillipy
	BPMonster	MI_DU_DKTRILLIPY5         32	44	// lv90 captain - Blood Trillipy
	BPMonster	MI_HAG03                  32	44	// lv90 captain - Captain Hague
	BPMonster	MI_LOADCLOCKWORK          64	88	// lv90 super - Lord Clockworks Alpha
	BPMonster	MI_LUIA1                  32	44	// lv90 low - Small Luia
	BPMonster	MI_RANGDA05               64	88	// lv90 super - Event Rangda
	BPMonster	MI_DUMP2                  32	44	// lv91 normal - Dump
	BPMonster	MI_DU_DKKEAKOON10         32	44	// lv91 normal - Mutant Keakoon Guard
	BPMonster	MI_DU_DKKEAKOON9          32	44	// lv91 normal - Mutant Keakoon Worker
	BPMonster	MI_DU_DKTRILLIPY4         48	66	// lv91 boss - Hazardous Violet Trillipy
	BPMonster	MI_HAG04                  48	66	// lv91 boss - Giant Hague
	BPMonster	MI_HAG04_1                160	220	// lv144 super - Great Hague
	BPMonster	MI_HERNMERMAN01_1         32	44	// lv91 captain - Abyssal Kappa
	BPMonster	MI_LUIA2                  32	44	// lv91 normal - Luia
	BPMonster	MI_NPC_AUGOO02            32	44	// lv91 normal - Mutant Augu
	BPMonster	MI_COLOGRREUNG            48	66	// lv92 boss - [Mirrored Soul] Giant Grrr
	BPMonster	MI_COLOGRREUNG_1          48	66	// lv92 boss - [Inferior Soul] Giant Grrr
	BPMonster	MI_DUMP3                  32	44	// lv92 captain - Captain Dump
	BPMonster	MI_DU_DKKIMERADON1        32	44	// lv92 captain - Chimeradon
	BPMonster	MI_DU_DKTRILLIPY6         48	66	// lv92 boss - Hazardous Blood Trillipy
	BPMonster	MI_HERNMERMAID01_1        32	44	// lv92 captain - Abyssal Nereid
	BPMonster	MI_LUIA3                  32	44	// lv92 captain - Captain Luia
	BPMonster	MI_PK_LUIA                32	44	// lv92 captain - Criminal Luia
	BPMonster	MI_THOTH01                32	44	// lv92 low - Small Tengu
	BPMonster	MI_DU_DKKEAKOON11         48	66	// lv93 boss - Mutant Keakoon Worker Leader
	BPMonster	MI_GONGURY1               32	44	// lv93 low - Small Gongury
	BPMonster	MI_HERNTURTLE01_1         32	44	// lv93 captain - Abyssal Terrorpin
	BPMonster	MI_KIMERADON1             32	44	// lv93 low - Soldier Chimeradon
	BPMonster	MI_KIMERADON2             32	44	// lv93 low - Brigadier Chimeradon
	BPMonster	MI_DU_DKKIMERADON2        48	66	// lv94 boss - Giant Chimeradon
	BPMonster	MI_GONGURY2               32	44	// lv94 normal - Gongury
	BPMonster	MI_HERNMERMAN02_1         32	44	// lv94 captain - Abyssal Bunyip
	BPMonster	MI_KIMERADON3             32	44	// lv94 normal - Major Chimeradon
	BPMonster	MI_THOTH02                32	44	// lv94 normal - Tengu
	BPMonster	MI_BRIGADIER              64	88	// lv95 super - Brigadier General Crumple
	BPMonster	MI_COLOLUIA               48	66	// lv95 boss - [Mirrored Soul] Giant Luia
	BPMonster	MI_COLOLUIA_1             48	66	// lv95 boss - [Inferior Soul] Giant Luia
	BPMonster	MI_DU_DKKEAKOON12         48	66	// lv95 boss - Mutant Keakoon Guard Leader
	BPMonster	MI_DU_METEONYKER3         48	66	// lv95 boss - Blue Meteonyker
	BPMonster	MI_DU_METEONYKER4         48	66	// lv95 boss - Green Meteonyker
	BPMonster	MI_GONGURY3               32	44	// lv95 captain - Captain Gongury
	BPMonster	MI_HERNMERMAID02_1        32	44	// lv95 captain - Abyssal Selkie
	BPMonster	MI_KIMERADON4             32	44	// lv95 captain - Lieutenant Chimeradon
	BPMonster	MI_BEARNUCKY1             32	44	// lv96 low - Private Bearnerky
	BPMonster	MI_BEARNUCKY2             32	44	// lv96 low - Specialist Bearnerky
	BPMonster	MI_HERNSIREN01_1          32	44	// lv96 captain - Abyssal Siren
	BPMonster	MI_SHUHAMMA1              32	44	// lv96 low - Small Shuhamma
	BPMonster	MI_THOTH03                32	44	// lv96 captain - Captain Tengu
	BPMonster	MI_BEARNUCKY3             32	44	// lv97 normal - Sergeant Bearnerky
	BPMonster	MI_NPC_SADKING01          32	44	// lv97 normal - Ghost of the Forgotten Prince
	BPMonster	MI_PK_SHUHAMMA            32	44	// lv97 low - Criminal Shuhamma
	BPMonster	MI_SHUHAMMA2              32	44	// lv97 normal - Shuhamma
	BPMonster	MI_BEARNUCKY4             32	44	// lv98 captain - Captian Bearnerky
	BPMonster	MI_COLOGONGRI             48	66	// lv98 boss - [Mirrored Soul] Giant Gongury
	BPMonster	MI_COLOGONGRI_1           48	66	// lv98 boss - [Inferior Soul] Giant Gongury
	BPMonster	MI_KHNEMU01               32	44	// lv98 low - Small Asterius
	BPMonster	MI_SHUHAMMA3              32	44	// lv98 captain - Captain Shuhamma
	BPMonster	MI_THOTH04                48	66	// lv98 boss - Giant Tengu
	BPMonster	MI_THOTH04_1              160	220	// lv145 super - Great Tengu
	BPMonster	MI_KERN1                  32	44	// lv99 low - Small Kern
	BPMonster	MI_MUFFRIN1               32	44	// lv99 low - Trainee Chef Muffrin
	BPMonster	MI_MUFFRIN2               32	44	// lv99 low - 3rd Chef Muffrin
	BPMonster	MI_KERN2                  32	44	// lv100 normal - Kern
	BPMonster	MI_KHNEMU02               32	44	// lv100 normal - Asterius
	BPMonster	MI_LIEUTENANT             64	88	// lv100 super - Lieutenant General Scythoid
	BPMonster	MI_MUFFRIN3               32	44	// lv100 normal - 2nd Chef Muffrin
	BPMonster	MI_RANGDA03               64	88	// lv100 super - Uncanny Rangda
	BPMonster	MI_SPIKETAIL              64	88	// lv100 super - Air Marshall Spiketail
	BPMonster	MI_HERNKRAKEN01_1         88	120	// lv101 super - [Abyssal Terror] King Chiton
	BPMonster	MI_KERN3                  44	60	// lv101 captain - Captain Kern
	BPMonster	MI_MUFFRIN4               44	60	// lv101 captain - 1st Chef Muffrin
	BPMonster	MI_GLAPHAN1               44	60	// lv102 low - Small Glaphan
	BPMonster	MI_KHNEMU03               44	60	// lv102 captain - Captain Asterius
	BPMonster	MI_POPCRANK1              44	60	// lv102 low - Pawn Popcrank
	BPMonster	MI_POPCRANK2              44	60	// lv102 low - Knight Popcrank
	BPMonster	MI_GLAPHAN2               44	60	// lv103 normal - Glaphan
	BPMonster	MI_NPC_SADKING02          44	60	// lv103 normal - Ghost of the Forgotten King
	BPMonster	MI_POPCRANK3              44	60	// lv103 normal - Rook Popcrank
	BPMonster	MI_COLOKEREUN             66	90	// lv104 boss - [Mirrored Soul] Giant Kern
	BPMonster	MI_COLOKEREUN_1           66	90	// lv104 boss - [Inferior Soul] Giant Kern
	BPMonster	MI_DANTALIAN01            44	60	// lv104 low - Small Dantalian
	BPMonster	MI_GLAPHAN3               44	60	// lv104 captain - Captain Glaphan
	BPMonster	MI_KHNEMU04               66	90	// lv104 boss - Giant Asterius
	BPMonster	MI_KHNEMU04_1             160	220	// lv146 super - Great Asterius
	BPMonster	MI_PK_GLAPHAN             44	60	// lv104 captain - Criminal Glaphan
	BPMonster	MI_POPCRANK4              44	60	// lv104 captain - Bishop Popcrank
	BPMonster	MI_GLYPHAXZ               88	120	// lv105 super - General Glyphaxz
	BPMonster	MI_Toadrin01              44	60	// lv105 low - Small Battle Toadrin
	BPMonster	MI_DANTALIAN02            44	60	// lv106 normal - Dantalian
	BPMonster	MI_Toadrin02              44	60	// lv106 normal - Battle Toadrin
	BPMonster	MI_SHIPMESPI_1            44	60	// lv107 captain - Ace Regal Hawk
	BPMonster	MI_Toadrin03              44	60	// lv107 captain - Creepy Battle Toadrin
	BPMonster	MI_Berken01               44	60	// lv108 low - Troglodon Clansman
	BPMonster	MI_DANTALIAN03            44	60	// lv108 captain - Captain Dantalian
	BPMonster	MI_Berken02               44	60	// lv109 normal - Troglodon Warrior
	BPMonster	MI_NPC_MAMMOTH01          44	60	// lv109 normal - Mammoth
	BPMonster	MI_SHIPREDHARPY_1         44	60	// lv109 captain - Ace Crimson Garuda
	BPMonster	MI_Berken03               44	60	// lv110 captain - Troglodon Captain
	BPMonster	MI_DANTALIAN04            66	90	// lv110 boss - Giant Dantalian
	BPMonster	MI_DANTALIAN04_1          160	220	// lv147 super - Great Dantalian
	BPMonster	MI_EVENT04                88	120	// lv110 super - GM Cromiell
	BPMonster	MI_GANESA01               44	60	// lv110 low - Small Gannessa
	BPMonster	MI_Hatsalra01             44	60	// lv111 low - Brown Bolo
	BPMonster	MI_GANESA02               44	60	// lv112 normal - Gannessa
	BPMonster	MI_Hatsalra02             44	60	// lv112 normal - Spotted Bolo
	BPMonster	MI_Hatsalra03             44	60	// lv113 captain - Superior Spotted Bolo
	BPMonster	MI_Frinker01              44	60	// lv114 low - Lazy Araknoid
	BPMonster	MI_GANESA03               44	60	// lv114 captain - Captain Gannessa
	BPMonster	MI_CRIPESCENTIPEDE01      44	60	// lv115 low - Small Scorpede
	BPMonster	MI_CRIPESCENTIPEDE01_1    44	60	// lv115 low - Cursed Small Scorpede
	BPMonster	MI_CRIPESCENTIPEDE02      44	60	// lv115 normal - Scorpede
	BPMonster	MI_CRIPESCENTIPEDE02_1    44	60	// lv115 normal - Cursed Scorpede
	BPMonster	MI_Frinker02              44	60	// lv115 normal - Araknoid
	BPMonster	MI_MAULMOUSE01            44	60	// lv115 low - Small Maul Rat
	BPMonster	MI_MAULMOUSE01_1          44	60	// lv115 low - Cursed Small Maul Rat
	BPMonster	MI_MAULMOUSE02            44	60	// lv115 normal - Maul Rat
	BPMonster	MI_MAULMOUSE02_1          44	60	// lv115 normal - Cursed Maul Rat
	BPMonster	MI_NPC_MAMMOTH02          44	60	// lv115 normal - Cannibal Mammoth
	BPMonster	MI_PRICKANT01             44	60	// lv115 low - Blunt Axe-Jaw Ant
	BPMonster	MI_PRICKANT01_1           44	60	// lv115 low - Cursed Blunt Axe-Jaw Ant
	BPMonster	MI_PRICKANT02             44	60	// lv115 normal - Axe-Jaw Ant
	BPMonster	MI_PRICKANT02_1           44	60	// lv115 normal - Cursed Axe-Jaw Ant
	BPMonster	MI_RANGDA04               88	120	// lv115 super - Dreadful Rangda
	BPMonster	MI_ASURA01                44	60	// lv116 low - Small Asuras
	BPMonster	MI_CRIPESCENTIPEDE03      44	60	// lv116 captain - Creepy Scorpede
	BPMonster	MI_CRIPESCENTIPEDE03_1    44	60	// lv116 captain - Cursed Creepy Scorpede
	BPMonster	MI_Frinker03              44	60	// lv116 captain - Creepy Araknoid
	BPMonster	MI_GANESA04               66	90	// lv116 boss - Giant Gannessa
	BPMonster	MI_GANESA04_1             160	220	// lv148 super - Great Gannessa
	BPMonster	MI_MAULMOUSE03            44	60	// lv116 captain - Creepy Maul Rat
	BPMonster	MI_MAULMOUSE03_1          44	60	// lv116 captain - Cursed Creepy Maul Rat
	BPMonster	MI_PRICKANT03             44	60	// lv116 captain - Sharp Axe-Jaw Ant
	BPMonster	MI_PRICKANT03_1           44	60	// lv116 captain - Cursed Sharp Axe-Jaw Ant
	BPMonster	MI_RABBITGUARDER01        60	80	// lv129 normal - Sakai
	BPMonster	MI_Crohell01              44	60	// lv117 low - Small Club-tailed Reptilion
	BPMonster	MI_ASURA02                44	60	// lv118 normal - Asuras
	BPMonster	MI_COLOMATEONIKER         44	60	// lv118 captain - [Mirrored Soul] Meteonyker
	BPMonster	MI_COLOMATEONIKER01       44	60	// lv118 captain - [Mirrored Soul] Red Meteonyker
	BPMonster	MI_COLOMATEONIKER01_1     44	60	// lv118 captain - [False Soul] Red Meteonkyer
	BPMonster	MI_COLOMATEONIKER_1       44	60	// lv118 captain - [False Soul] Meteonyker
	BPMonster	MI_Crohell02              44	60	// lv118 normal - Club-tailed Reptilion
	BPMonster	MI_DU_METEONYKER          44	60	// lv118 captain - Meteonyker
	BPMonster	MI_IMP01                  88	120	// lv118 super - Small Nyx
	BPMonster	MI_TUTTLEFIGHTER01        60	80	// lv133 normal - Grumble Mauler
	BPMonster	MI_ASURA04                66	90	// lv119 boss - Giant Asuras
	BPMonster	MI_ASURA04_1              160	220	// lv150 super - Great Asuras
	BPMonster	MI_CRIPESCENTIPEDE04      88	120	// lv119 super - Giant Scorpede
	BPMonster	MI_CRIPESCENTIPEDE04_1    88	120	// lv119 super - Cursed Giant Scorpede
	BPMonster	MI_Crohell03              44	60	// lv119 captain - Captain Club-tailed Reptilion
	BPMonster	MI_IMP02                  88	120	// lv119 super - Nyx
	BPMonster	MI_MAULMOUSE04            88	120	// lv119 super - Giant Maul Rat
	BPMonster	MI_MAULMOUSE04_1          88	120	// lv119 super - Cursed Giant Maul Rat
	BPMonster	MI_PRICKANT04             88	120	// lv119 super - Razor Axe-Jaw Ant
	BPMonster	MI_PRICKANT04_1           88	120	// lv119 super - Cursed Razor Axe-Jaw Ant
	BPMonster	MI_ANGELBLUE              66	90	// lv120 boss - Blue Angel
	BPMonster	MI_ANGELGREEN             66	90	// lv120 boss - Green Angel
	BPMonster	MI_ANGELRED               66	90	// lv120 boss - Red Angel
	BPMonster	MI_ANGELWHITE             66	90	// lv120 boss - White Angel
	BPMonster	MI_ASURA03                44	60	// lv120 captain - Captain Asuras
	BPMonster	MI_COLOCYCLOPSX           44	60	// lv120 captain - [Mirrored Soul] CyclopsX
	BPMonster	MI_COLOCYCLOPSX_1         44	60	// lv120 captain - [False Soul] CyclopsX
	BPMonster	MI_COLOLYCANOS            88	120	// lv120 super - [Mirrored Soul] Lykanose
	BPMonster	MI_COLOLYCANOS_1          88	120	// lv120 super - [False Soul] Lykanose
	BPMonster	MI_CYCLOPSX               44	60	// lv120 captain - CyclopsX
	BPMonster	MI_DU_METEONYKER2         55	75	// lv120 midboss - Red Meteonyker
	BPMonster	MI_IMP03                  88	120	// lv120 super - Captain Nyx
	BPMonster	MI_LYCANOS01              88	120	// lv120 super - Lykanos the Malevolent
	BPMonster	MI_LYCANOS01_1            88	120	// lv120 super - Dread Lykanos the Malevolent
	BPMonster	MI_TUTTLESWORDER01        60	80	// lv137 normal - Vile Thorn
	BPMonster	MI_AIBATT4                90	120	// lv121 boss - Giant Aibatt
	BPMonster	MI_ANTIQUERY4             90	120	// lv121 boss - Giant Antiquery
	BPMonster	MI_BEARNUCKY5             90	120	// lv121 boss - General Bearnerky
	BPMonster	MI_BOO4                   90	120	// lv121 boss - Giant Boo
	BPMonster	MI_Berken04               90	120	// lv121 boss - Troglodon Warlord
	BPMonster	MI_CARRIERBOMB4           90	120	// lv121 boss - Giant Carrierbomb
	BPMonster	MI_COLOLUCIFER            120	160	// lv121 super - [Mirrored Soul] Asmodan
	BPMonster	MI_COLOLUCIFER_1          120	160	// lv121 super - [False Soul] Asmodan
	BPMonster	MI_COLOSOULVAMPAIN        120	160	// lv121 super - [Mirrored Soul] Drakul
	BPMonster	MI_COLOSOULVAMPAIN_1      120	160	// lv121 super - [False Soul] Drakul
	BPMonster	MI_CRANEMACHINERY4        90	120	// lv121 boss - Giant Crane Machinery
	BPMonster	MI_Crohell04              90	120	// lv121 boss - Colonel Club-tailed Reptilion
	BPMonster	MI_DRILLER4               90	120	// lv121 boss - Giant Driller
	BPMonster	MI_DUMP4                  90	120	// lv121 boss - Giant Dump
	BPMonster	MI_ELDERGUARD4            90	120	// lv121 boss - Giant Elderguard
	BPMonster	MI_Frinker04              90	120	// lv121 boss - Giant Araknoid
	BPMonster	MI_GARBAGEPIDER4          90	120	// lv121 boss - Giant Garbagepider
	BPMonster	MI_GLAPHAN4               90	120	// lv121 boss - Giant Glaphan
	BPMonster	MI_GONGURY4               90	120	// lv121 boss - Giant Gongury
	BPMonster	MI_GPOTATO01              120	160	// lv121 super - Rex gPotato
	BPMonster	MI_GREEMONG4              90	120	// lv121 boss - Giant Greemong
	BPMonster	MI_GRRR4                  90	120	// lv121 boss - Giant Grrr
	BPMonster	MI_HOPPRE4                90	120	// lv121 boss - Giant Hoppre
	BPMonster	MI_Hatsalra04             90	120	// lv121 boss - Great White Bolo
	BPMonster	MI_IREN4                  90	120	// lv121 boss - Giant Iren
	BPMonster	MI_KERN4                  90	120	// lv121 boss - Giant Kern
	BPMonster	MI_KIMERADON5             90	120	// lv121 boss - General Chimeradon
	BPMonster	MI_LEYENA4                90	120	// lv121 boss - Giant Leyena
	BPMonster	MI_LUCIFER01              160	220	// lv152 super - Asmodan
	BPMonster	MI_LUIA4                  90	120	// lv121 boss - Giant Luia
	BPMonster	MI_MUFFRIN6               90	120	// lv121 boss - Great Chef Muffrin
	BPMonster	MI_MUSHPOIE4              90	120	// lv121 boss - Giant Mushpoie
	BPMonster	MI_NAUTREPY4              90	120	// lv121 boss - Giant Nautrepy
	BPMonster	MI_NUCTUVEHICLE4          90	120	// lv121 boss - Giant Nuctuvehicle
	BPMonster	MI_NUTTYWHEEL4            90	120	// lv121 boss - Giant Nutty Wheel
	BPMonster	MI_POPCRANK5              90	120	// lv121 boss - Queen Popcrank
	BPMonster	MI_RISEM4                 90	120	// lv121 boss - Giant Risem
	BPMonster	MI_SHUHAMMA4              90	120	// lv121 boss - Giant Shuhamma
	BPMonster	MI_SKELWOLF               60	80	// lv121 captain - Hellhound
	BPMonster	MI_STEAMWALKER4           90	120	// lv121 boss - Giant Steam Walker
	BPMonster	MI_STEELKNIGHT4           90	120	// lv121 boss - Giant Steel Knight
	BPMonster	MI_SYLIACA4               90	120	// lv121 boss - Giant Syliaca
	BPMonster	MI_TRANGFOMA4             90	120	// lv121 boss - Giant Trangfoma
	BPMonster	MI_Toadrin04              90	120	// lv121 boss - Giant Battle Toadrin
	BPMonster	MI_VEMPAIN01              120	160	// lv121 super - Drakul the Diabolic
	BPMonster	MI_VEMPAIN01_1            120	160	// lv121 super - Dread Drakul the Diabolic
	BPMonster	MI_VOLT4                  90	120	// lv121 boss - Giant Volt
	BPMonster	MI_WATANGKA4              90	120	// lv121 boss - Giant Watangka
	BPMonster	MI_WHEELEM4               90	120	// lv121 boss - Giant Wheelem
	BPMonster	MI_ZOMBIGER4              90	120	// lv121 boss - Giant Zombiger
	BPMonster	MI_SKELSWORD              60	80	// lv122 captain - Risen Gladiator
	BPMonster	MI_TUTTLEASSASSIN01       80	110	// lv141 normal - Blackweb Shade
	BPMonster	MI_SKELSPEAR              60	80	// lv123 captain - Risen Pikeman
	BPMonster	MI_SKELMAGE               60	80	// lv124 captain - Risen Mage
	BPMonster	MI_TUTTLEAXE01            80	110	// lv145 normal - Dire Razor
	BPMonster	MI_BEHESTATUE01           120	160	// lv125 super - Monument of Death
	BPMonster	MI_DREADSTONE01           120	160	// lv125 super - Idol of the Blighted Gryphon
	BPMonster	MI_KALGASEGG01            120	160	// lv125 super - Kalgas Statue
	BPMonster	MI_KALGASSTELE01          120	160	// lv125 super - Akin Statue
	BPMonster	MI_KALGASSTELE02          120	160	// lv125 super - Balt Statue
	BPMonster	MI_SKELASSASSIN           60	80	// lv125 captain - Risen Assassin
	BPMonster	MI_SKELGRIFFIN            60	80	// lv125 captain - Blighted Gryphon
	BPMonster	MI_DREADSTONE02           120	160	// lv126 super - Idol of the Scythe Protector
	BPMonster	MI_SKELFIGHTER            60	80	// lv126 captain - Risen Warrior
	BPMonster	MI_SKELLEADER             60	80	// lv126 captain - Scythe Protector
	BPMonster	MI_TUTTLESPEAR01          80	110	// lv149 normal - Immovable Crag
	BPMonster	MI_COLOTUTTLEKING         120	160	// lv127 super - [Mirrored Soul] Guan Yu Heavyblade
	BPMonster	MI_COLOTUTTLEKING_1       120	160	// lv127 super - [False Soul] Guan Yu Heavyblade
	BPMonster	MI_DREADSTONE03           120	160	// lv127 super - Idol of the Vile Flayer
	BPMonster	MI_SKELSPAIN              60	80	// lv127 captain - Vile Flayer
	BPMonster	MI_TUTTLEKING01           120	160	// lv127 super - Guan Yu Heavyblade
	BPMonster	MI_DREADSTONE04           120	160	// lv128 super - Idol of the Fallen Necromancer
	BPMonster	MI_SKELSHAMEN             60	80	// lv128 captain - Fallen Necromancer
	BPMonster	MI_DREADSTONE05           120	160	// lv129 super - Idol of the Forsaken Banshee
	BPMonster	MI_DREADSTONE06           120	160	// lv129 super - Idol of Kheldor
	BPMonster	MI_PUPPETWOLF             60	80	// lv129 captain - Hundur Sharpfoot
	BPMonster	MI_SKELRIDER              60	80	// lv129 captain - Forsaken Banshee
	BPMonster	MI_TURTLEGUARDER          60	80	// lv129 normal - Dark Guardian Terrapin
	BPMonster	MI_RYSENTRY               60	80	// lv130 captain - Samoset
	BPMonster	MI_RYGUARD                60	80	// lv131 captain - Kyouchish
	BPMonster	MI_RYARCHER               60	80	// lv132 captain - Kanonicus
	BPMonster	MI_COLOSKELGENERAL        120	160	// lv133 super - [Mirrored Soul] Razgul
	BPMonster	MI_COLOSKELGENERAL_1      120	160	// lv133 super - [False Soul] Razgul
	BPMonster	MI_RABBITFIGHTER          60	80	// lv133 normal - Dark Usagi Fighter
	BPMonster	MI_RYMAGI                 60	80	// lv133 captain - Mage Redcloud
	BPMonster	MI_SKELGENERAL            120	160	// lv133 super - [General] Razgul
	BPMonster	MI_STATUE                 60	80	// lv133 captain - [Twisted Soul] Orcus
	BPMonster	MI_RYWARRIOR              60	80	// lv134 captain - Taiaha
	BPMonster	MI_SPIRITTULA             60	80	// lv134 captain - [Tormented Soul] Nergal
	BPMonster	MI_COLOSKELDEVIL          120	160	// lv135 super - [Mirrored Soul] Kheldor
	BPMonster	MI_COLOSKELDEVIL_1        120	160	// lv135 super - [False Soul] Kheldor
	BPMonster	MI_SKELDEVIL              120	160	// lv135 super - [Deathbringer] Kheldor
	BPMonster	MI_SPIRITUMTULA           60	80	// lv135 captain - [Demonic Soul] Hel
	BPMonster	MI_COLODIEOPNIS_1         60	80	// lv136 captain - [False Soul] Mara
	BPMonster	MI_SPIRITOBNIS            60	80	// lv136 captain - [Perverted Soul] Morrigan
	BPMonster	MI_RABBITSWORDER          60	80	// lv137 normal - Dark Usagi Blade Master
	BPMonster	MI_RUGALWIN               60	80	// lv137 captain - Wild Sand Skitter
	BPMonster	MI_RUGALWIND02            60	80	// lv137 captain - Warrior Sand Skitter
	BPMonster	MI_SPIRITBAGNIS           60	80	// lv137 captain - [Anguished Soul] Mara
	BPMonster	MI_BEGUARDIAN             60	80	// lv138 captain - [Violent Soul] Ghed
	BPMonster	MI_RUGALHEAT01            60	80	// lv138 captain - Wild Sunbaked Rhino
	BPMonster	MI_RUGALHEAT02            60	80	// lv138 captain - Sunbaked Rhino Warrior
	BPMonster	MI_RUGALKUM               60	80	// lv139 captain - Desert Spirit of the Fallen Soldier
	BPMonster	MI_COLORYCANBARGA         120	160	// lv140 super - [Mirrored Soul] Keokuk
	BPMonster	MI_COLORYCANBARGA_1       120	160	// lv140 super - [False Soul] Keokuk
	BPMonster	MI_RUGALRIM               60	80	// lv140 captain - Desert Spirit of the Fallen Mage
	BPMonster	MI_RYBARGA                120	160	// lv140 super - Chief Keokuk
	BPMonster	MI_KALGASKUMA01           80	110	// lv141 captain - Kalgas Cave Creeper
	BPMonster	MI_RABBITSPEAR            80	110	// lv141 normal - Dark Usagi Yari
	BPMonster	MI_RUGALKUMA              80	110	// lv141 captain - Desert Spirit of the Commander
	BPMonster	MI_KALGASRIMA01           80	110	// lv142 captain - Kalgas Wretched Soul
	BPMonster	MI_RUGALRIMA              80	110	// lv142 captain - Desert Spirit of the Sage
	BPMonster	MI_BEHEMOTH               160	220	// lv143 super - [God of Death] Ankou
	BPMonster	MI_COLOANGRYBEHEMOTH      160	220	// lv143 super - [Mirrored Soul] Ankou
	BPMonster	MI_COLOANGRYBEHEMOTH_1    160	220	// lv143 super - [False Soul] Ankou
	BPMonster	MI_KALGASBABY01           80	110	// lv143 captain - Baby Kargo
	BPMonster	MI_KALGASFLY01            80	110	// lv144 captain - Kalgas Kargo Ripper
	BPMonster	MI_KALGASLESSER01         80	110	// lv145 captain - Kalgas Hound
	BPMonster	MI_RABBITASSASSIN         80	110	// lv145 normal - Dark Usagi Ninja
	BPMonster	MI_BASILISK               160	220	// lv146 super - Basilisk of the Great Maw
	BPMonster	MI_COLOBASILISK_1         80	110	// lv146 captain - [False Soul] Basilisk of the Great Maw
	BPMonster	MI_KALGASAKIN01           80	110	// lv146 captain - [Kalgas Guardian] Astaroth
	BPMonster	MI_COLOBASILISK           80	110	// lv147 captain - [Mirrored Soul] Basilisk of the Great Maw
	BPMonster	MI_KALGASBALT01           80	110	// lv147 captain - [Kalgas Guardian] Malphas
	BPMonster	MI_RABBITAXE              80	110	// lv149 normal - Dark Usagi Axe Master
	BPMonster	MI_IBLESSPUPPET           160	220	// lv150 super - Iblis's Perpetrator
	BPMonster	MI_COLOKALGAS             80	110	// lv152 captain - [Mirrored Soul] Kalgas
	BPMonster	MI_COLOKALGAS_1           80	110	// lv152 captain - [False Soul] Kalgas
	BPMonster	MI_KALGASBOSS             160	220	// lv152 super - [God of Wrath] Kalgas
	BPMonster	MI_EVENT_FWCMONSTER       120	165	// lv200 boss - Ripper
}
