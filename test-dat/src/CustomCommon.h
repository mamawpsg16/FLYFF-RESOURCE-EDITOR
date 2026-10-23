#pragma once

#define __FL_SWITCH_EQ								//| Self made switch equipment system
#define __FL_TELEPORT								//| Donation teleport pass system
#define __USER_OWN_TITLE							//| Collector Exchange Phase 1: player-set custom head title
#define __USER_NAME_COLOR							//| Collector Exchange Phase 2: player-set floating name color
#define __USER_CHAT_COLOR							//| Collector Exchange Phase 3: player-picked /say + /shout color, one scroll + picker
#define __USER_FOOTSTEP_TRAIL						//| Collector Exchange Phase 4: buff-item footstep dust trail
#define __USER_ITEM_PREVIEW						//| Collector Exchange Phase 5: Shift+Click shop item 3D model preview
#define __DPS_METER									//| Collector Exchange Phase 5b: per-monster live damage meter
#define __VIP										//| VIP tiers (7/15/30 day) - real-time buff, counts down offline
#define __BATTLEPASS								//| Seasonal battle pass - kill points, 50-level reward ladder, paid unlock back-pays
#define __DONATIONSHOP								//| Dedicated donation shop window - taskbar entry, category sidebar, search, donate-chip buy
#define __CHIP_PLAYERSHOP							//| Private shop: seller picks a per-item currency - Penya/Perin/Red Chip/Donate Chip
#define __GUILDWAR_NO_PARTY						//| No party inside WI_WORLD_GUILDWAR: dissolve on entry, block Party Finder join in the siege world
#define __GW_BUFF								//| Auto-buff players on entry/revive inside WI_WORLD_GUILDWAR; also lets the buff-pang NPC work from any range
#define __GW_RANDOM_DROP							//| GW siege: always drop players at a random battlefield spawn - the zone pick has no effect
#define __AFK_NOTIFY								//| Server-side AFK detection: 5 min idle -> [AFK] name-tag broadcast
#define __REBIRTH_SYSTEM							//| Prestige rebirth: max-level+99% exp -> consume Rebirth Stone(s) -> tier up, data-driven GP/gift per tier
#define __MONSTER_HUNT							//| Monster Hunt: kill N of a monster family, claim a level, permanent stat bonus (MonsterHunt.inc)
#define __COLLECTOR_DETAILS						//| Collins' "Collector Details" window - collecting drop rates, speed + upgrade odds (client reads Client\s.txt)
#define __FREE_PK_TIME							//| Free PK Time: scheduled penalty-free PK window + monster EXP multiplier (FreePKTime.txt)
#define __PENYA_LEVEL_TABLE						//| Monster-kill Penya by monster level (PenyaTable.txt) for LOW/NORMAL/CAPTAIN, replaces their DropGold roll
#define __BADGE_SYSTEM							//| Badge System: cosmetic badge in the job-icon slot right of the name, owned list unlocked by Monster Hunt (Badge.inc)
#define __GUILD_FINDER							//| Guild Finder: guild accepts go client -> WorldServer (invite checked) -> CoreServer; later the finder window + recruit settings
#define __FAST_AWAKE							//| Fast Awake: taskbar window re-awakens an item until one stat's total over all lines reaches a target (Awakening + Reversion per roll, 1 Donate Chip per 4 rolls)
#define __QUICK_DELETE							//| Quick Delete: inventory trash-can button opens a window that deletes many items at once, picked by Pet-Filter categories
#define __ALLOW_BERSERK_SKILLUSE				//| Titanium port: Blades can use other skills while Berserk is active
#define __GUILD_COLOR							//| Sakura port: guild name over players changes color every 10 guild levels (master keeps COLOR_GUILDMASTER)
//#define __NO_CLOSE_AWAKEWINDOW					//| Titanium port: the NPC awakening window stays open when the player moves
#define __10MIN_CD_REGUILD						//| Titanium port: wait GUILD_REJOIN_MINUTES (not 2 days) to join a guild after leave/kick/disband - needs Database/32
#define __ENEMY_SYSTEM							//| Titanium port: in Guild Siege, other-guild players show as red "Enemy" - no name/title/guild/logo/badge
#define __GW_VAGRANT_WATCH						//| Guild Siege: Vagrants may enter the siege map to watch (lineup still needs level 30, so they never fight)
#define __NEW_NIGHT								//| Titanium port: darker, bluer nights with gradual sunrise/sunset; Options > Video "Night Mode" switches back to the old light table (client only)
#define __ITEM_LOCK								//| Titanium port: Shift+left-click an inventory item to lock / unlock it - no drop/sell/bank/mail/trash/trade/shop/use until unlocked (CItemElem::locked bit of m_byFlag)
#define __ADMIN_SHOUT							//| GM /sys shows "[Administrator][Name]:text" as a zoom-in notice line (pale blue, navy outline, soft band; marker byte - no CoreServer change)
#define __GIANT_KILL_NOTICE					//| A player killing a field giant (RANK_BOSS named "Giant ...") tells the whole server "<Player> killed: Giant <Name> !" as a notice line (needs __ADMIN_SHOUT, WorldServer only)
#define __AREA_CAPTION_STYLE					//| Area names (Flarine / Central Flarine) in white with a black outline; entering a new area clears the old area names
#define __GW_ICON_PNG							//| Siege winner crown / MVP star over names = frameless Sakura2.0 icons (Client\Theme\TexGuildCombat*.png, client only)
#define __CAPTION_BANNER						//| Guild Siege captions on picture banners: sword for "held this week" / "Start Combat", crown for the winner (Client\Theme\announcement\*.png, client only)
#define __EXP_STOP								//| Stop EXP: checkbox on the status window (HP/MP/FP/EXP) portrait, EXP line shows red "EXP Stopped" - no EXP from anything while on (party share lost). Old GM bit MODE_EXPUP_STOP in m_dwMode, saved per character, no SQL
#define __HIDE_FASHION							//| Titanium port: Inventory checkbox on the hat / suit / gloves / boots / cloak / mask slots hides that piece for everyone (armor under it shows, stats stay). m_dwMode bits MODE_HIDE_*, saved per character, no SQL
#define __REPORT_SYSTEM							//| Titanium port: taskbar Features > Report Problem - category + text, WorldServer saves it as Server\Reports\<Category>\<Category>_YYYYMMDD_<n>.txt and tells online GMs
#define __CRASH_REPORT							//| Titanium port: CrashRpt 1.4.3 - a client crash saves a report (minidump + Log files) to Client\CrashReport\ErrorReports, nothing uploaded. Needs Client\CrashRpt1403_32bit.dll
#define __SPLASH_SCREEN							//| Titanium port: Client\Theme\splashscreen.png (PNG with alpha) shown centered while the client loads; no file = no splash
#define __LOGIN_WALLPAPER_FIT					//| Login background fills any window size without stretching (crop-to-fill, Default.thm m_dwWallPaperType 5); optional Theme\screen_16x9 / _16x10 / _5x4 / _4x3 images are picked by window shape
#define __SCREEN_SIZE_BUTTON					//| TEMPORARY test tool: "Screen Size" button on the login window picks the client size (window / full screen), the client restarts at that size. Comment out after testing
#define __WELCOME_MESSAGE						//| Login welcome window at every login (npc-board look): title + on/off in Client\Welcome.txt, text in Client\Client\WelcomeBoard.inc (client only, no rebuild to change it)
#define __OVERHEAD_TITLE						//| Overhead title: big winged title image above a player's name - Admin / Game Master / Siege MVP / Siege winner guild / Top Spender 1-3 (Client\Theme\OverheadTitle_*.tga); replaces the small siege crown / MVP star. Chosen title + Top Spender rank saved in tblOverheadTitle (Database\33. Overhead Title.sql); players pick it in the Character window Title tab (WndOverheadTitle.cpp)

#define __SIEGE_RANK_ICON						//| Guild Siege rank medal 1-10 left of a player's name / guild logo: this week's top 10 by Guild Siege Total points (resets Monday 00:00, same as the Weekly Rankings board). WorldServer sends the 10 player ids (GC_SIEGERANK); art Client\Theme\SiegeRank_1..10.tga
#define __OFFLINE_VENDOR						//| Offline vendor: with an Offline Vendor pass (1/3/7 days, Donation shop) a player who logs out with the private shop open in the safe area of Saint Morning / Darkon 2 leaves a copy of the character that keeps selling (same currencies, no tax). Earnings + unsold items come back at the next login. WORLDSERVER\OfflineVendor.cpp, Database\37. Offline Vendor.sql. Needs __GW_STATUE (player copy)
#define __GW_STATUE							//| Player statues in Flaris (port of FLYFF_2026 __FL_PLAYER_STATUE): Guild Siege MVP + winning guild leader (anyone buys 1 buff, nPrice penya) and the monthly Top Spender #1-3 (display only). NPC movers that copy the player's look + gear; config Resource\PlayerStatue.inc, look from uspGwStatueCreate (Database\35. GW Statue.sql)

#define __FL_FFA								//| Free-For-All Arena (port of Legions __FL_FFA): scheduled solo PvP in WdFFA (world 245), register window (auto-opens at the announcement, Donaris "FFA Arena" menu), lives + respawn, PVP Tokens per kill + top 3. Config Resource\FFAManager.inc, WorldServer _Common\FFAManager.cpp, client _Interface\WndFFA.cpp

#define __WEATHER_COMMAND						//| Admin-only weather: /weather rain|snow [minutes] | off. No random weather; EXP bonus (Event.lua SetWeatherEvent) while it is on

#ifdef __FL_FFA
#define FFA_STATE_CLOSED				0		// no run (CFFAManager state, sent to CWndFFARegister)
#define FFA_STATE_REGISTER				1		// announced: registration open
#define FFA_STATE_PREPARE				2		// registration closed: registered players Join the waiting area
#define FFA_STATE_BATTLE				3		// fighting
#define FFA_STATE_ENDING				4		// rewards paid, everyone goes back to Flarine in a few seconds
#define FFA_TOP_REWARDS					3		// FFA_TOP_REWARD amounts for places 1-3
#endif // __FL_FFA
#define __FL_EQUALIZED_MODE						//| Equalized PvP (port of Legions __FL_EQUALIZED_MODE): per event (Resource\EqualizedPvP.inc) players pick a class and fight as a level 150 Hero/Legend with a GM preset bag (tblEqualizedPreset, /savetmp), skills maxed; the real character is kept in memory and given back on leaving / logout. WORLDSERVER\EqualizedPvP.cpp, Database\38. Equalized PvP.sql
#define __FL_TDM								//| Team Deathmatch (FFA/TDM step 4): our FFA arena with Red / Blue teams in WI_WORLD_TDM (WdFwc map, world 246), Amos "TDM Arena" menu (PvP Activities TDM tab), most team kills wins. Needs __FL_FFA. Config Resource\TDMManager.inc, WorldServer _Common\TDMManager.cpp
#define __DUNGEON_INFO							//| Dungeon info panel (idea from Legions __INFO_DUNGEONS): inside an instance dungeon, a panel on the left shows players inside, the phase and its monsters (killed = red). WorldServer CInstanceDungeonHelper::ProcessInfoPanel, client _Interface\WndDungeonInfo.cpp
#define __RECORD_BOOK							//| Record Book (port of RebornMMO __FL_RECORD_BOOK): top 30 players per category (stats, kills, playtime, biggest PvP / PvE hit...). Own records in CMover::m_PlayerRecords (_Common\RecordBook.cpp), saved in tblRecordBook (Database\40. Record Book.sql), WorldServer WORLDSERVER\RecordBook.cpp
#define __MINI_EVENT							//| Auto Mini Events: scheduled events at Event Master (Flaris), "Mini Event" menu to register (level / account / IP checks), rounds + live ranking list + results window, rank 1-10 + participation prizes (Event Tokens). Color Game, Quick Hands, O/X Quiz, Lucky Draw. WORLDSERVER\MiniEventMng.cpp, _Interface\WndMiniEvent.cpp, Resource\MiniEvent.inc
#define __ANTI_BOT								//| Anti-bot puzzle: monster kills in farming maps raise a hidden score (+ a small random chance) that opens a "Click the <word>" icon puzzle; no answer = frozen, still none = sent to town; every step logged for GMs. WORLDSERVER\AntiBotMng.cpp, _Interface\WndAntiBot.cpp, Resource\AntiBot.inc, Database\41. Anti Bot Log.sql
#ifdef __DUNGEON_INFO
#define DUNGEON_CLEAR_EXIT_SEC			30		// dungeon cleared: everyone is teleported out after this many seconds (like Guild Siege)
#define DUNGEON_AGGRO_MONSTERS					//| every monster spawned in an instance dungeon attacks on sight (was the Lua bRed flag)
#endif // __DUNGEON_INFO
#ifdef __FL_TDM
#define TDM_STATE_CLOSED				0		// same meaning as FFA_STATE_* (the window reads both the same way)
#define TDM_STATE_REGISTER				1
#define TDM_STATE_PREPARE				2
#define TDM_STATE_BATTLE				3
#define TDM_STATE_ENDING				4
#define TDM_TEAM_NONE					0
#define TDM_TEAM_RED					1
#define TDM_TEAM_BLUE					2
#define TDM_COLOR_RED					D3DCOLOR_ARGB( 255, 255, 80, 80 )	// overhead name in the arena
#define TDM_COLOR_BLUE					D3DCOLOR_ARGB( 255, 80, 160, 255 )
#endif // __FL_TDM

#ifdef __WEATHER_COMMAND
#define WEATHERCMD_OFF					-1		// /weather off
#define WEATHERCMD_SEASON				0		// rain or snow by the month (EnvironmentEffect.txt) - /frain
#define WEATHERCMD_RAIN					1
#define WEATHERCMD_SNOW					2
#define WEATHERCMD_MAX_MINUTES			28800	// 20 days: MIN() is int milliseconds and overflows after ~24 days
#endif // __WEATHER_COMMAND

#ifdef __10MIN_CD_REGUILD
#define GUILD_REJOIN_MINUTES			10		// must match DATEADD(mi,10,...) in GUILD_STR D1/D2 (Database/32), else a relog restores the DB value
#endif // __10MIN_CD_REGUILD

#ifdef __ADMIN_SHOUT
#define ADMIN_SHOUT_MARK				'\x01'	// first byte of a GM /sys text: the client draws it as a shout (no other system message starts with it)
#define ADMIN_SHOUT_MAX_LEN			500		// characters sent (CAPTION::m_szCaption and the client's read buffer are 512)
#define ADMIN_SHOUT_COLOR				D3DCOLOR_ARGB( 255, 215, 235, 255 )	// pale blue-white
#define ADMIN_SHOUT_OUTLINE_COLOR		D3DCOLOR_ARGB( 255, 20, 45, 100 )	// dark navy outline (CWndWorld::m_pFontAPIShout - baked into the font, area names keep black)
#define ADMIN_SHOUT_BG_COLOR			D3DCOLOR_ARGB( 100, 40, 64, 104 )	// see-through blue-gray band behind the text (fades out at both ends)
#define ADMIN_SHOUT_TOP				104		// first notice line, in 768ths of the screen height: under the Free PK timer, 3 lines end above the captions (184)
#define ADMIN_SHOUT_SHOW_MS			8000	// how long a notice line stays on screen (the last second fades out)
#define ADMIN_SHOUT_IN_MS				400		// zoom-in entrance: 7x -> 1x while fading in (the area-name caption look)
#define ADMIN_SHOUT_MAX_LINES			3		// notice lines stacked at once; a new one pushes out the oldest
#define ADMIN_SHOUT_BAND_FADE			80		// pixels at each end of the band where it fades to nothing
#endif // __ADMIN_SHOUT

#ifdef __OVERHEAD_TITLE
#define OVERHEAD_TITLE_NONE			0		// no title shown
#define OVERHEAD_TITLE_ADMIN			1		// AUTH_ADMINISTRATOR
#define OVERHEAD_TITLE_GM				2		// AUTH_GAMEMASTER and up (not admin)
#define OVERHEAD_TITLE_MVP				3		// last Guild Siege MVP (g_GuildCombatMng.m_uBestPlayer)
#define OVERHEAD_TITLE_WINNER			4		// a member of the last Guild Siege winner guild (m_uWinGuildId)
#define OVERHEAD_TITLE_SPENDER			5		// Top Spender rank 1-3 (CMover::m_nTopSpender, given by a GM: /title spender)
#define OVERHEAD_TITLE_MAX				6
#define OVERHEAD_TITLE_AUTO			0		// CMover::m_nTitle: show the first owned of Admin > GM > MVP > Top Spender > Winner
#define OVERHEAD_TITLE_HIDDEN			-1		// CMover::m_nTitle: show no title
#define OVERHEAD_TITLE_SPENDER_RANKS	3		// Top Spender ranks 1..3, one picture each
#define OVERHEAD_TITLE_GAP				1		// px between the title picture and the top text line under it (guild or name line)
#define OVERHEAD_TITLE_GAP_HP			2		// ... and above the HP bar (own character / party members)
#define OVERHEAD_TITLE_NAME_TOP		20		// px above the head point: top of the name line
#define OVERHEAD_TITLE_GUILD_TOP		32		// ... top of the guild name line
#define OVERHEAD_TITLE_ICON_TOP		37		// ... top of the badge / job icon right of the name (32 px, bottom 5 px up) - no longer moves the title (side icons sit beside the name)
#define OVERHEAD_TITLE_HP_TOP			39		// ... top of the HP bar (own character / party members, RenderHP)
#define OVERHEAD_TITLE_CAST_TOP		53		// ... top of the wand charge / casting bar (own character, RenderCasting)
#define OVERHEAD_TITLE_GAUGE_TOP		45		// ... top of the wand / bow / crossbow charge gauge (own character, RenderGauge: 40 + 3 + 2)
#define OVERHEAD_TITLE_SCALE_NEAR		15.0f	// camera distance (m) up to which a title is drawn 1:1; farther it shrinks as NEAR / distance
#define OVERHEAD_TITLE_LABEL_FROM_BOTTOM	6	// px from the picture's bottom edge to the middle of the title word (the pictures end in an empty 14 px strip)
#define OVERHEAD_TITLE_LABEL_SCALE		1.0f	// title word size (1.0 = the font's own size; scaling blurs its outline)
#define OVERHEAD_TITLE_LABEL_COLOR		0xFFFFDD66	// title word: gold
#define OVERHEAD_TITLE_LABEL_EDGE		0xFF140C04	// title word: dark outline drawn around it (RenderOverheadTitleLabel)
#define OVERHEAD_TITLE_LABEL_COLOR_STAFF	D3DCOLOR_ARGB( 255, 215, 235, 255 )	// Admin / GM title word: the /sys notice pale blue (ADMIN_SHOUT_COLOR)
#define OVERHEAD_TITLE_LABEL_EDGE_STAFF	D3DCOLOR_ARGB( 255, 20, 45, 100 )	// ... with the /sys notice navy outline (ADMIN_SHOUT_OUTLINE_COLOR)
#define OVERHEAD_TITLE_SCALE_MIN		1.0f	// smallest title size (fraction of the picture). 1.0 = titles never shrink: same size near or far (user choice 2026-10-14); e.g. 0.45 to shrink far ones
#endif // __OVERHEAD_TITLE

#ifdef __SIEGE_RANK_ICON
#define SIEGE_RANK_MAX					10		// medals 1..10
#endif // __SIEGE_RANK_ICON

#ifdef __AREA_CAPTION_STYLE
#define AREA_CAPTION_COLOR				D3DCOLOR_ARGB( 255, 255, 255, 255 )	// white
#endif // __AREA_CAPTION_STYLE

#ifdef __CAPTION_BANNER
#define CAPTION_BANNER_NONE			0
#define CAPTION_BANNER_SIEGE			1		// Theme\announcement\battlefield.png (sword)
#define CAPTION_BANNER_CROWN			2		// Theme\announcement\winner_message.png (crown)
#define CAPTION_BANNER_TEXT_Y			90		// banner pixel row the text is centered on (middle of the dark bar, rows 64-115 of 140)
#endif // __CAPTION_BANNER

#if defined( __ADMIN_SHOUT ) || defined( __AREA_CAPTION_STYLE )
#define __CLEAN_CAPTION_FONT					// CWndWorld::m_pFontAPIClean: caption size with a black outline (the Free PK timer look)
#define CAPTION_FONT_FILE				"CaptionFont.txt"	// Client folder: font name for m_pFontAPIClean (try fonts without a rebuild)
#define CLEAN_CAPTION_FONT_SIZE			15		// same size as the theme caption font (gulim20 = Verdana 15) the other captions use
#endif

#ifdef __REPORT_SYSTEM
#define REPORT_CATEGORIES				4		// Bug / Player / Suggestion / Other (CWndReport combo order = the BYTE sent)
#define REPORT_MAX_LEN					256		// characters of report text (the client caps typing, the server cuts longer ones)
#define REPORT_MIN_INTERVAL			60000	// ms between two reports from one character (the server refuses faster ones)
#define REPORT_MAX_PER_DAY				9999	// highest <n> in a category's file names per day (then the report is refused)
#endif // __REPORT_SYSTEM

#ifdef __HIDE_FASHION
#define HIDE_FASHION_HAT				0		// slot order = MODE_HIDE_* bits (authorization.h) = CMover::OverCoatItemRenderCheck's j
#define HIDE_FASHION_CLOTH				1
#define HIDE_FASHION_GLOVE				2
#define HIDE_FASHION_BOOTS				3
#define HIDE_FASHION_CLOAK				4
#define HIDE_FASHION_SLOTS				5		// slots the server stores (PACKETTYPE_HIDE_FASHION)
#define HIDE_FASHION_CHECKS			6		// inventory checkboxes: the 5 slots + the mask (the old Options "view mask" flag)
#define HIDE_FASHION_WNDID				100000	// inventory checkbox control ids: HIDE_FASHION_WNDID + 0..5
#endif // __HIDE_FASHION

#ifdef __EXP_STOP
#define EXPSTOP_MIN_INTERVAL			1000	// ms between two Stop EXP toggles from one character (the server ignores faster ones)
#define EXPSTOP_WNDID					100100	// status window (HP/MP/FP/EXP) Stop EXP checkbox control id
#define EXPSTOP_SYNC_DELAY				1500	// ms after a click before the box follows the server flag again
#endif // __EXP_STOP

#ifdef __QUICK_DELETE
#define QUICKDELETE_MIN_INTERVAL		1000	// ms between two Quick Delete requests (the server refuses faster ones)
#endif // __QUICK_DELETE

#ifdef __FAST_AWAKE
#define FASTAWAKE_CHIPS_PER_REFILL		1		// Donate Chips taken when the character has no saved awake left...
#define FASTAWAKE_AWAKES_PER_REFILL		4		// ...and how many awakes they pay for (1 chip = 4 awakes; the unused ones are saved on the character)
#define FASTAWAKE_MIN_INTERVAL			400		// ms: the server ignores rolls closer together than this (the client waits 500 ms + ping between rolls)
// SNAPSHOTTYPE_FASTAWAKE result codes (server -> CWndFastAwake)
#define FASTAWAKE_ROLLED				0		// rolled, target not met yet: the client asks for the next roll
#define FASTAWAKE_DONE					1		// rolled and the target is met: stop
#define FASTAWAKE_ALREADY				2		// not rolled: the item already meets the target
#define FASTAWAKE_NO_CHIP				3		// not rolled: no saved awake and no Donate Chip in the inventory
#define FASTAWAKE_NO_AWAKE				4		// not rolled: no Scroll of Awakening in the inventory
#define FASTAWAKE_NO_REVERSION			5		// not rolled: no Scroll of Reversion in the inventory
#define FASTAWAKE_BAD_ITEM				6		// not rolled: item missing, equipped, in use, expired or not awakenable
#define FASTAWAKE_BAD_TARGET			7		// not rolled: stat not rollable on this item, or target out of range
#define FASTAWAKE_PROTECTED				8		// not rolled: a Protection-scroll choice is pending on the item
#define FASTAWAKE_BUSY					9		// not rolled: trading / vendor open
#define FASTAWAKE_TOO_FAST				10		// not rolled: closer than FASTAWAKE_MIN_INTERVAL to the last request
#define FASTAWAKE_NO_PENYA				11		// not rolled: not enough Penya for the fast awakening fee (upgrade-fees.diff)
#endif	// __FAST_AWAKE

#ifdef __GW_STATUE
#define GW_STATUE_PROCESS_MS			10000	// ms between two CPlayerStatueMng::Process() checks (owner changed -> rebuild the statue)
#define GW_STATUE_SPENDER_RECHECK_MS	600000	// ms between two Top Spender owner lookups in the DB (catches a /title change made on another channel)
#define GW_STATUE_RANGE					20.0f	// max distance between the player and the statue to buy its buff (= the menu's own 20 m)
#endif	// __GW_STATUE

#ifdef __OFFLINE_VENDOR
#define OFFLINE_VENDOR_CHANNEL			101		// g_uKey of the only channel that keeps offline vendors (one channel today)
#define OFFLINE_VENDOR_PROCESS_MS		1000	// ms between two COfflineVendorMng::Process() checks (expiry, first load)
#define OFFLINE_VENDOR_LOAD_RETRY_MS	30000	// ms before the vendor list is asked for again when the database did not answer
#define OFFLINE_VENDOR_RANGE			20.0f	// max distance between a buyer and the vendor (= the click range)
#endif	// __OFFLINE_VENDOR

#ifdef __RECORD_BOOK
#define RECORD_BOOK_SKIP_GM				1		// 1 = GM accounts (AUTH_GAMEMASTER and up) get no records. 0 while testing on a GM account, 1 for live
#define RECORD_BOOK_REFRESH_MS			900000	// ms between two top-30 loads from the database (15 min)
#define RECORD_BOOK_RETRY_MS			30000	// ms before asking again when the database did not answer / failed
#define RECORD_BOOK_STAT_CHECK_MS		10000	// ms between two stat-record checks of every online player
#define RECORD_BOOK_REQUEST_MS			3000	// a player's window may ask for the book once per this many ms
#define RECORD_BOOK_GM_REFRESH_MS		3000	// GM /recordbook refresh: ms between saving everyone and asking the database
#endif	// __RECORD_BOOK

#ifdef __ANTI_BOT
// the defaults: Server\Resource\AntiBot.inc can set every value below except ANTIBOT_CHOICES / RESEND_SEC (AntiBotMng.h ANTIBOT_TUNING)
#define ANTIBOT_SCORE_LIMIT			1200	// score that opens the puzzle (+1 per counted monster kill, +2 while camping)
#define ANTIBOT_RANDOM				2000	// every counted kill also opens it with a 1 in N chance (0 = off)
#define ANTIBOT_CAMP_RADIUS			40.0f	// camping = still within this many meters of the spot ...
#define ANTIBOT_CAMP_MIN			20		// ... where the player stood this many minutes ago
#define ANTIBOT_COOLDOWN_MIN		30		// minutes without a new puzzle after a right answer
#define ANTIBOT_ANSWER_SEC			120		// seconds to answer before the player is frozen
#define ANTIBOT_FROZEN_SEC			300		// seconds frozen before being sent to town
#define ANTIBOT_TRIES				3		// clicks per stage (asking, then frozen); a wrong click shows new icons
#define ANTIBOT_CHOICES				6		// icons per puzzle (AntiBot.inc needs at least this many lines)
#define ANTIBOT_RESEND_SEC			10		// an open puzzle is sent again this often (timer sync, reopens a closed window)
#define ANTIBOT_SKIP_GM				1		// 1 = GM accounts never get it by themselves (/antibot still works). 0 to test on a GM account
#define ANTIBOT_STATE_NONE			0
#define ANTIBOT_STATE_ASKING		1
#define ANTIBOT_STATE_FROZEN		2
#define IS_ANTIBOT_FROZEN( pMover )	( (pMover)->m_bAntiBotFrozen )
#else	// __ANTI_BOT
#define IS_ANTIBOT_FROZEN( pMover )	FALSE
#endif	// __ANTI_BOT

#ifdef __MINI_EVENT
#define MINIEVENT_STATE_CLOSED		0		// CMiniEventMng state (sent to the client too)
#define MINIEVENT_STATE_REGISTER	1		// announced: registration open at Event Master
#define MINIEVENT_STATE_PLAY		2		// a round is running (picks allowed)
#define MINIEVENT_STATE_SCORE		3		// round result + ranking list
#define MINIEVENT_TYPE_NONE			0		// none / RANDOM in MiniEvent.inc
#define MINIEVENT_TYPE_COLORGAME	1
#define MINIEVENT_TYPE_TYPER		2		// Quick Hands (Typer): a text is shown, type it exactly in the window
#define MINIEVENT_TYPE_OXQUIZ		3		// O/X Quiz: true (O) or false (X)
#define MINIEVENT_TYPE_LUCKYDRAW	4		// Lucky Draw: a random top 10 every round
#define MINIEVENT_TYPE_TURNIN		5		// Turn-in Race: bring the shown items to Event Master, first 10 score
#define MINIEVENT_TYPE_HIDESEEK		6		// Hide and Seek: find Lost Fwanki (an NPC at a SPOT in Madrigal), first click wins
#define MINIEVENT_TYPE_RACE			7		// Vagrant Race: everyone is a level 1 Vagrant in WdRace (a copy of Volcane); click "Finish!" on the Robe girl at the top
#define MINIEVENT_TYPES				8
#define MINIEVENT_RANKS				10		// RANK 1-10 prizes, everyone else REST
#define MINIEVENT_COLORS			6		// Color Game: Red Blue Green Yellow White Pink
#define MINIEVENT_COLOR_DIE_POINTS	2		// Color Game: points per matching die
#define MINIEVENT_COLOR_FIRST_BONUS	1		// Color Game: + for the first player who locked in a colour that hit (half a die)
#define MINIEVENT_ANSWER_LEN		100		// Typer: longest text
#define MINIEVENT_RECIPE_ITEMS		4		// Turn-in Race: up to 4 different items per RECIPE
#define MINIEVENT_CMD_OPEN			0		// PACKETTYPE_MINIEVENT (client -> server): BYTE cmd, int value
#define MINIEVENT_CMD_REGISTER		1
#define MINIEVENT_CMD_CANCEL		2
#define MINIEVENT_CMD_PICK			3		// value = colour 0-5
#define MINIEVENT_CMD_ANSWER		4		// value = O/X Quiz 0 (O) / 1 (X); a string follows (Typer answer, empty otherwise)
#define MINIEVENT_CMD_TURNIN		5		// Turn-in Race: hand in this round's items (next to Event Master)
#define MINIEVENT_CMD_FOUND			6		// Hide and Seek: value = objid of the clicked Lost Fwanki
#define MINIEVENT_CMD_FINISH		7		// Vagrant Race: value = objid of the clicked finish NPC (MMI_RACE_FINISH)
#define MINIEVENT_SNAP_STATE		0		// SNAPSHOTTYPE_MINIEVENT (server -> client): BYTE sub-type first
#define MINIEVENT_SNAP_ROUND		1
#define MINIEVENT_SNAP_FINAL		2
#define MINIEVENT_SNAP_CLOSE		3
#endif	// __MINI_EVENT
