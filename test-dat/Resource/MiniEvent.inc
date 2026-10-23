// Auto Mini Events - __MINI_EVENT, CMiniEventMng (Source\WORLDSERVER\MiniEventMng.cpp)
//
// REGISTER minutes before each BEGIN time the event is announced (server shout). Players go to Event Master in
// Flaris, press "Event" and Register (free). At the BEGIN time: fewer than MIN_PLAYERS = cancelled.
// Otherwise ROUNDS rounds of ROUND_TIME seconds, each followed by SCORE_TIME seconds of results + the ranking list.
// End: results window for everyone + top-3 shout. RANK 1-10 get their own prize, everyone else gets REST.
// Points only decide the final place; the prize comes from the place (RANK / REST), never from the points.
// Bag full or offline = mail. Every prize is in the item log as MINIEVENT_<EVENT>.
// A slot is skipped (error log line) while FFA, TDM, Guild Siege or Free PK Time is running.
//
// EVENT <name> <key value> ...       name: COLORGAME, TYPER, OXQUIZ, LUCKYDRAW, TURNIN, HIDESEEK, RACE
//     MIN_LEVEL    minimum level (1 - 200)
//     MIN_PLAYERS  players needed to start (1 or more; 1 = solo test)
//     MAX_PLAYERS  registration cap (up to 500)
//     MAX_PER_IP   players per IP address (0 = no limit; 0 = test with 2 characters on one PC)
//     REGISTER     minutes of registration before the start (1 - 60)
//     ROUNDS       rounds (1 - 30); TYPER / OXQUIZ need at least this many ASK lines
//     ROUND_TIME   seconds per round (5 - 120; TURNIN / HIDESEEK / RACE up to 600)
//     SCORE_TIME   seconds of results between rounds (2 - 60)
// RANK <name> <place 1-10> <item> <amount>
// REST <name> <item> <amount>        everyone below place 10
// POINTS <name> <1st> <2nd> ... <10th> <rest>   TYPER / OXQUIZ / LUCKYDRAW round points (never going up, 10th > rest)
//     TYPER: the first 10 correct answers of a round get 1st - 10th, every later correct answer <rest>, wrong / none 0.
//     LUCKYDRAW: every round a random top 10 gets 1st - 10th, everyone else <rest>.
// ASK TYPER "<text>" "<info>"      Quick Hands: the text is shown (info = small line: what it is), players type the text
//     exactly: upper / lower case, letters and spaces must all match. Up to 100 letters. Every try is logged in Server\..\MiniEventTyper.txt.
// ASK OXQUIZ O|X "<statement>"       O = true, X = false. Right answers ranked by lock-in time: fastest 10 get
//     1st - 10th, other right answers <rest>, wrong / none 0.
//     Questions are asked in a random order, never twice in one run. Keep them short (about 3 lines in the window),
//     no " inside a question.
// RECIPE "<title>" <items 1-4> <item> <amount> ...   Turn-in Race: one recipe per round, never the same twice in a row
//     (least recently used first). Items are taken at Event Master; equipped / locked items never count.
//     END_AT <n> (EVENT key, TURNIN): the round ends after n turn-ins (default 10). ROUND_TIME up to 600 here.
//     List made by tools/minievent/build_turnin.py (normal Madrigal monster parts + Penya-shop gear / food).
// SPOT <x> <z> "<region>" "<hint>" "<landmark>"   Hide and Seek, Madrigal only. Region at the start, the hint at 40 %,
//     "within about 100 m of <landmark>" at 80 % of the round; "" = skipped. GM /hidespot "<region>" ["<hint>"] ["<landmark>"]
//     appends one at your position. Starter list: tools/minievent/build_spots.py (not terrain-checked: walk them).
// ITEM_HINT <item> "<where to get it>"   Turn-in Race: grey line(s) under the item (up to 100 letters).
// HIDE_NPC <mover> <character.inc key>   the Hide and Seek NPC ("Found it!" menu = MMI_HIDE_FOUND)
// RACE_START <x> <z>   Vagrant Race: the start in WdRace (a copy of Volcane; default 505 594 = the Volcane landing point).
//     Every round each registered player who is online becomes a level 1 Vagrant with no gear and is put at the start; click
//     "Finish!" on the Robe girl at the top. Finishers get POINTS 1st, 2nd ... in finish order, everyone else <rest>. A death =
//     back to the start (the clock keeps running). At the end everyone gets their own character back where they were.
// READY <0-60> (EVENT key, RACE): seconds frozen on the start line before GO (default 15): the game shows READY, then 10, 9 ... 1, then GO!
// RACE_POINT <x> <z>   Vagrant Race checkpoints on the way up, in route order (passed within 15 m). When nobody finishes a round,
//     its places go by the checkpoints each racer passed in order (without RACE_POINT lines: the highest point reached), then
//     who got there first; no progress = <rest>. GM in WdRace (/te 247 505 594): /racestart = the start here, /racepoint = the next
//     checkpoint here (both appended below, used at once).
// IN_RANDOM 0 (EVENT key): never picked by BEGIN RANDOM, GM /eventstart only.
// BEGIN <name | RANDOM> <day> <hour> <minute>   start time (registration opens REGISTER minutes before)
//     day: 0 = every day, 1 = Sunday, 2 = Monday ... 7 = Saturday. RANDOM = a random event from the EVENT lines.
//     keep clear of FFA / TDM / Guild Siege and Free PK Time (00/04/08/12/16/20 for 60 minutes)
//
// GM: /eventstart [colorgame|typer|oxquiz|luckydraw|turnin|hideseek|race|random] [minutes] [players needed]
//     /eventend  /eventnext  /eventstatus  /eventreload (only while no event runs)
//     /eventrecipe [round] ["title"] <Ctrl+click items in your bag> [amount] ...   Turn-in Race: the GM picks that round's
//         recipe (no round = the next one; amount = the linked stack, or the number after it; no title = "<monster> Hunt" from
//         the ITEM_HINT lines). Rounds without one use the RECIPE list. /eventrecipe = list, /eventrecipe clear [round].
// Edits need /eventreload or a WorldServer restart.
// Prize amounts below are placeholders until the Event Token shop list is decided.

//////////////////////////////////////////////////////////////////////
// Color Game
//////////////////////////////////////////////////////////////////////
EVENT	COLORGAME	MIN_LEVEL 120	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 10	ROUND_TIME 15	SCORE_TIME 5

RANK	COLORGAME	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	COLORGAME	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	COLORGAME	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	COLORGAME	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	COLORGAME	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	COLORGAME	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	COLORGAME	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	COLORGAME	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	COLORGAME	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	COLORGAME	10	II_SYS_SYS_EVENT_TOKEN	5
REST	COLORGAME	II_SYS_SYS_EVENT_TOKEN	2

//////////////////////////////////////////////////////////////////////
// Quick Hands (TYPER)
//////////////////////////////////////////////////////////////////////
EVENT	TYPER	MIN_LEVEL 120	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 10	ROUND_TIME 15	SCORE_TIME 5
POINTS	TYPER	15 12 10 8 7 6 5 4 3 2	1

RANK	TYPER	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	TYPER	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	TYPER	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	TYPER	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	TYPER	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	TYPER	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	TYPER	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	TYPER	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	TYPER	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	TYPER	10	II_SYS_SYS_EVENT_TOKEN	5
REST	TYPER	II_SYS_SYS_EVENT_TOKEN	2

// Quick Hands: "<what to type>" "<small info line: what it is>". Same skills / items as the O/X Quiz below:
// typing them teaches, the quiz tests. From propSkill / propItem.
// Quick Hands: "<what to type>" "<small info line: what it is>". Same skills / items as the O/X Quiz below:
// typing them teaches, the quiz tests. From propSkill / propItem.
ASK	TYPER	"Slash"	"Mercenary skill: Strikes the enemy two times, in rapid succession"
ASK	TYPER	"Keenwheel"	"Mercenary skill: A continuous spinning attack"
ASK	TYPER	"Blindside"	"Mercenary skill: A spinning, finishing move"
ASK	TYPER	"Protection"	"Mercenary skill: Increases the defense of a Shield against melee attacks"
ASK	TYPER	"Pan Barrier"	"Mercenary skill: Increases the defense of a shield against ranged attacks"
ASK	TYPER	"Blazing Sword"	"Mercenary skill: Increases the accuracy and striking power of a sword"
ASK	TYPER	"Smite Axe"	"Mercenary skill: Increases your Defense Rate and Striking Power of an axe"
ASK	TYPER	"Empower Weapon"	"Mercenary skill: Strengthens the elemental damage of a weapon"
ASK	TYPER	"Bloody Strike"	"Mercenary skill: Drains life from an enemy"
ASK	TYPER	"Sword Mastery"	"Mercenary skill: Increases the striking power of a sword"
ASK	TYPER	"Axe Mastery"	"Mercenary skill: Increases the striking power of an axe"
ASK	TYPER	"Special Hit"	"Mercenary skill: A single, powerful strike"
ASK	TYPER	"Guillotine"	"Mercenary skill: A powerful, ranged attack"
ASK	TYPER	"Sneaker"	"Mercenary skill: Stops an enemy"
ASK	TYPER	"Hit Reflect"	"Mercenary skill: This skill absorbs one attack and releases back at an enemy"
ASK	TYPER	"Guard"	"Knight skill: Increases Block Rate by lowering Attack Power. Requires a two-handed weapon"
ASK	TYPER	"Pain Reflection"	"Knight skill: Reflects a part of the damage received by an enemy. Increases STA"
ASK	TYPER	"Rage"	"Knight skill: Increases Attack Power by lowering Block Rate. Requires a two-handed weapon"
ASK	TYPER	"Power Swing"	"Knight skill: To strike a blow at the enemy by flourishing a weapon. Requires a two-handed weapon"
ASK	TYPER	"Earth Divider"	"Knight skill: Powerful, downward strike"
ASK	TYPER	"Charge"	"Knight skill: Powerful, upward strike"
ASK	TYPER	"Pain Dealer"	"Knight skill: Powerful, downward strike. Lowers the defense of the target. Requires two-handed axe"
ASK	TYPER	"Power Stomp"	"Knight skill: Pounds the ground, stunning nearby enemies. Requires two-handed axe"
ASK	TYPER	"Cross Strike"	"Blade skill: Powerful strike using two weapons"
ASK	TYPER	"Armor Penetrate"	"Blade skill: Strikes at the enemy and lowers its defense"
ASK	TYPER	"Silent Strike"	"Blade skill: A fast, sliding strike. Requires two weapons"
ASK	TYPER	"Blade Dance"	"Blade skill: Strikes at multiple enemies. Requires two swords"
ASK	TYPER	"Spring Attack"	"Blade skill: Strikes at an enemy multiple times. Requires two axes"
ASK	TYPER	"Hawk Attack"	"Blade skill: Powerful, downward strike. Small chance to blind the target. Requires two axes"
ASK	TYPER	"Sonic Blade"	"Blade skill: Powerful, slashing attack. Requires two weapons"
ASK	TYPER	"Berserk"	"Blade skill: Increases Critical Damage and Movement Speed. Unable to use other skills using Berserk"
ASK	TYPER	"Heal"	"Assist skill: Recover the HP of a target"
ASK	TYPER	"Straight Punch"	"Assist skill: Powerful, straight punch"
ASK	TYPER	"Resurrection"	"Assist skill: Resurrects a dead player"
ASK	TYPER	"Patience"	"Assist skill: Increase the Max. HP of a target for a limited time"
ASK	TYPER	"Prevention"	"Assist skill: Target recovers HP when it reaches below a certain point"
ASK	TYPER	"Heap Up"	"Assist skill: Increases the physical strength of the target"
ASK	TYPER	"Cannon Ball"	"Assist skill: Increases the DEX of the target"
ASK	TYPER	"Circle Healing"	"Assist skill: Heals party members close to you"
ASK	TYPER	"Mental Sign"	"Assist skill: Increases INT of a target"
ASK	TYPER	"Beef Up"	"Assist skill: Increases striking power of a target"
ASK	TYPER	"Burst Crack"	"Assist skill: Pounds the ground and damages enemies around you"
ASK	TYPER	"Stonehand"	"Assist skill: All attacks gain the chance to stun"
ASK	TYPER	"Quick Step"	"Assist skill: Increases the walk speed of a target"
ASK	TYPER	"Cat's Reflex"	"Assist skill: Increases the block rate of a target"
ASK	TYPER	"Accuracy"	"Assist skill: Increases the accuracy of a target"
ASK	TYPER	"Power Fist"	"Assist skill: Concentrated power strike"
ASK	TYPER	"Haste"	"Assist skill: Increases attack speed of a target"
ASK	TYPER	"Heal Rain"	"Ringmaster skill: Recovers HP for party members near you"
ASK	TYPER	"Holycross"	"Ringmaster skill: Target enemy takes double damage for a limited time"
ASK	TYPER	"Protect"	"Ringmaster skill: Decreases the damage from physical attacks on a target"
ASK	TYPER	"Holyguard"	"Ringmaster skill: Decreases the damage from magical attacks on a target"
ASK	TYPER	"Spirit Fortune"	"Ringmaster skill: Increases Attack Power and Skill Damage of a target"
ASK	TYPER	"Gvur Tialla"	"Ringmaster skill: Removes de-buffs from a target"
ASK	TYPER	"Geburah Tiphreth"	"Ringmaster skill"
ASK	TYPER	"Merkaba Hanzelrusha"	"Ringmaster skill: Enemies take damage in an area around you"
ASK	TYPER	"Belial Smashing"	"Billposter skill: Sliding, crushing attack"
ASK	TYPER	"Piercing Serpent"	"Billposter skill: Fires a piercing beam at the target"
ASK	TYPER	"Blood Fist"	"Billposter skill: Strikes a heavy blow to the enemy that causes it to lose health over time"
ASK	TYPER	"Sonichand"	"Billposter skill: Fast, straight punch"
ASK	TYPER	"Asmodeus"	"Billposter skill: Increases striking power"
ASK	TYPER	"Baraqijal Esna"	"Billposter skill: Increases striking power while decreasing defensive power"
ASK	TYPER	"Bgvur Tialbold"	"Billposter skill: Strikes at nearby enemies with an outward shockwave"
ASK	TYPER	"Asalraalaikum"	"Billposter skill: Fully concentrated strike. Consumes 100% MP"
ASK	TYPER	"Flame Ball"	"Magician skill: Strikes at the enemy with a ball of flame"
ASK	TYPER	"Flame Geyser"	"Magician skill: Damages the enemy continuously with a geyser of flame"
ASK	TYPER	"Swordwind"	"Magician skill: Ranged, wind attack"
ASK	TYPER	"Strongwind"	"Magician skill: Ranged, wind attack that moves the enemy"
ASK	TYPER	"Blinkpool"	"Magician skill: Allows you to teleport"
ASK	TYPER	"Ice Missile"	"Magician skill: Blasts the enemy with a missile of ice"
ASK	TYPER	"Static Ball"	"Magician skill: Damages the enemy with a ball of static"
ASK	TYPER	"Stone Spike"	"Magician skill: Damages an enemy with a stone spike. Chance to stun the enemy"
ASK	TYPER	"Mental Strike"	"Magician skill: Ranged Mental attack"
ASK	TYPER	"Fire Strike"	"Magician skill: Damages an enemy with a fire ball. The enemy loses health for a limited time afterwards"
ASK	TYPER	"Wind Cutter"	"Magician skill: Ranged, wind attack"
ASK	TYPER	"Waterball"	"Magician skill"
ASK	TYPER	"Water Well"	"Magician skill: Splashes the enemy with a water attack. The enemy takes damage over time"
ASK	TYPER	"Lighting Ram"	"Magician skill: Damages the enemy with an electric ball"
ASK	TYPER	"Lighting Shock"	"Magician skill: Damages the enemy with a small but fast lightning ball"
ASK	TYPER	"Rock Crash"	"Magician skill: Damages the enemy with a giant stone"
ASK	TYPER	"Rooting"	"Magician skill: Prevents an enemy from approaching"
ASK	TYPER	"Demonology"	"Psykeeper skill: Damages the enemy with a mental blast"
ASK	TYPER	"Satanology"	"Psykeeper skill: Prevents an enemy from approaching"
ASK	TYPER	"Psychic Bomb"	"Psykeeper skill: Damages the enemy the with a ball of mental energy"
ASK	TYPER	"Psychic Wall"	"Psykeeper skill: Creates a wall that pushes an enemy back and damages them if they touch it"
ASK	TYPER	"Spirit Bomb"	"Psykeeper skill: Does damage to an enemy based on your remaining MP amount"
ASK	TYPER	"Crucio Spell"	"Psykeeper skill: Deals damage to an enemy equal to twice the amount the enemy deals. Increases STA"
ASK	TYPER	"Maximum Crisis"	"Psykeeper skill: Surrounds and damages the enemy in a strong mental barrier"
ASK	TYPER	"Psychic Square"	"Psykeeper skill: Damages the enemies around you with a psychic blast"
ASK	TYPER	"Firebird"	"Elementor skill: Damages the enemy with a fire blast"
ASK	TYPER	"Fire Master"	"Elementor skill: Increases the striking power of fire spells,"
ASK	TYPER	"Burningfield"	"Elementor skill: Does damage to the enemy over a period of time"
ASK	TYPER	"Lightning Strike"	"Elementor skill: Damages the enemy with a bolt of lightning"
ASK	TYPER	"Lightning Mastery"	"Elementor skill: Increases the striking power of electric spells"
ASK	TYPER	"Electric Shock"	"Elementor skill: Damage surrounding enemies with electricity. Defense of the enemies decreases"
ASK	TYPER	"Stone Spear"	"Elementor skill: Damages an enemy with a stone spear"
ASK	TYPER	"Earth Master"	"Elementor skill: Increases the striking power of earth spells"
ASK	TYPER	"Earthquake"	"Elementor skill: Damages surrounding enemies area"
ASK	TYPER	"Iceshark"	"Elementor skill: Ranged attack that fires an ice projectile"
ASK	TYPER	"Water Master"	"Elementor skill: Increases striking power of water spells"
ASK	TYPER	"Poison Cloud"	"Elementor skill: Damages enemies in the surrounding area"
ASK	TYPER	"Void"	"Elementor skill: To attack the enemy by generating a perfect vacuum"
ASK	TYPER	"Wind Master"	"Elementor skill: Increases the striking power of wind spells"
ASK	TYPER	"Windfield"	"Elementor skill: Damages surrounding enemies with a wind attack. The speed of the enemies will be reduced"
ASK	TYPER	"Meteo Shower"	"Elementor skill: Damages surrounding enemies with a falling meteor"
ASK	TYPER	"Lightingstorm"	"Elementor skill: Damages surrounding enemies with electric blasts"
ASK	TYPER	"Sandstorm"	"Elementor skill: Damages surrounding enemies with a sandstorm"
ASK	TYPER	"Blizzard"	"Elementor skill: Damages surrounding enemies with a snowstorm"
ASK	TYPER	"Yo-Yo mastery"	"Acrobat skill: Increases damage done with a Yo-yo. At max level, increases STR and Critical Rate instead"
ASK	TYPER	"Bow Mastery"	"Acrobat skill: Increases damage done with a Bow. At max level, increases DEX and Critical Damage instead"
ASK	TYPER	"Dark Illusion"	"Acrobat skill: Become Invisible for a short time"
ASK	TYPER	"Rapid Shot"	"Acrobat skill: Fire arrows wildly"
ASK	TYPER	"Fast Walker"	"Acrobat skill: Increases walk speed for a short time"
ASK	TYPER	"Aimed Shot"	"Acrobat skill: Slow shot that has a chance to deal double damage"
ASK	TYPER	"Slow Step"	"Acrobat skill: Slows an enemy"
ASK	TYPER	"Silent Shot"	"Acrobat skill: A surprise attack that does more damage during Dark Illusion"
ASK	TYPER	"Perfect Block"	"Acrobat skill: Increases block rate"
ASK	TYPER	"Arrow Rain"	"Acrobat skill: Creates a rain of arrows that does damage over time"
ASK	TYPER	"Cross Line"	"Acrobat skill: A Yo-yo strike that can cause stun"
ASK	TYPER	"Auto Shot"	"Acrobat skill: Rapid shot that can blind an enemy"
ASK	TYPER	"Snatch"	"Acrobat skill: Steal penya from a target while in Dark Illusion. Attack from behind"
ASK	TYPER	"Counterattack"	"Acrobat skill: Execute an attack after the enemy does"
ASK	TYPER	"Deadly swing"	"Acrobat skill: Strong Yo-yo blast. Chance to make the enemy lose health over time"
ASK	TYPER	"Pulling"	"Acrobat skill: Brings a target to you using Yo-yo"
ASK	TYPER	"Critical Swing"	"Jester skill: Increases chance of critical strike"
ASK	TYPER	"Enchant Poison"	"Jester skill: Adds poison damage to your yo-yo and increases striking power"
ASK	TYPER	"Enchant Blood"	"Jester skill: Adds blood damage to your yo-yo and increases striking power"
ASK	TYPER	"Enchant Absorb"	"Jester skill: Increases Hit Rate"
ASK	TYPER	"Sneak Stab"	"Jester skill: Attack a target from behind. Chance to stun target"
ASK	TYPER	"Penya Strike"	"Jester skill: Strengthens the attack of a yo-yo by consuming penya"
ASK	TYPER	"Escape"	"Jester skill: Removes the effects of Ice Missile, Slow Step, and Ice Arrow"
ASK	TYPER	"Vital stab"	"Jester skill: Surprise attack while in Dark Illusion"
ASK	TYPER	"Fast Shot"	"Ranger skill: Increases Attack Power and Critical Damage for a limited time"
ASK	TYPER	"Ice Arrow"	"Ranger skill: Slows an enemy down by shooting it with arrows covered in ice"
ASK	TYPER	"Flame Arrow"	"Ranger skill: Gives the fire element to arrows and damages surrounding enemies"
ASK	TYPER	"Piercing Arrow"	"Ranger skill: Increased arrow strike"
ASK	TYPER	"Poison Arrow"	"Ranger skill: Adds poison damage to Bow and increase your striking damage"
ASK	TYPER	"Silent Arrow"	"Ranger skill: Attacks the enemy and prevents him from casting spells"
ASK	TYPER	"Nature"	"Ranger skill: Increases resistance to magic"
ASK	TYPER	"Triple shot"	"Ranger skill: Fires three arrows at once"
ASK	TYPER	"Swordcross"	"Ringmaster skill"
ASK	TYPER	"First Refresher"	"Item: MP 25 Recovery"
ASK	TYPER	"Second Refresher"	"Item: MP 50 Recovery"
ASK	TYPER	"Third Refresher"	"Item: MP 75 Recovery"
ASK	TYPER	"Fourth Refresher"	"Item: MP 100 Recovery"
ASK	TYPER	"Fifth Refresher"	"Item: MP 125 Recovery"
ASK	TYPER	"Sixth Refresher"	"Item: MP 150 Recovery"
ASK	TYPER	"Eighth Refresher"	"Item: MP 200 Recovery"
ASK	TYPER	"Ninth Refresher"	"Item: MP 225 Recovery"
ASK	TYPER	"Tenth Refresher"	"Item: MP 250 Recovery"
ASK	TYPER	"Demol Earring"	"Item: Increases Attack Power. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Plug Earring"	"Item: Increases Defense. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Gore Necklace"	"Item: Increases Max HP. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Mental Necklace"	"Item: Increases Max MP. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Peision Necklace"	"Item: Increases Max FP. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Vigor Ring"	"Item: Increases STR. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Intelli Ring"	"Item: Increases INT. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Arek Ring"	"Item: Increases DEX. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Stam Ring"	"Item: Increases STA. (Can be upgraded with a Moonstone up to level 20)"
ASK	TYPER	"Meteor"	"Item: All Stats +1 Ring"
ASK	TYPER	"Meteofy"	"Item: All Stats +3 Ring"
ASK	TYPER	"Lollipop"	"Item: Recovers 70 HP"
ASK	TYPER	"Biscuit"	"Item: Recovers 140 HP"
ASK	TYPER	"Chocolate Bar"	"Item: Recovers 200 HP"
ASK	TYPER	"Milk"	"Item: Recovers 260 HP"
ASK	TYPER	"Roll Bread"	"Item: Recovers 330 HP"
ASK	TYPER	"Hot Dog"	"Item: Recovers 429 HP"
ASK	TYPER	"Super Hot Dog"	"Item: Recovers ALL HP"
ASK	TYPER	"Pizza"	"Item: Recovers 552 HP"
ASK	TYPER	"Kimbap"	"Item: Recovers 676 HP"
ASK	TYPER	"Chicken Stick"	"Item: Recover 812 HP"
ASK	TYPER	"Star Candy"	"Item: Recover 975 HP"
ASK	TYPER	"Meat Skewer"	"Item: Recovers 120 HP"
ASK	TYPER	"Barbecue"	"Item: Recovers 160 HP"
ASK	TYPER	"Seafood Pan Cake"	"Item: Recovers 230 HP"
ASK	TYPER	"Fish Soup"	"Item: Recovers 300 HP"
ASK	TYPER	"Sausage Casserole"	"Item: Recovers 370 HP"
ASK	TYPER	"Fish Stew"	"Item: Recovers 514 HP"
ASK	TYPER	"Steamed Seafood"	"Item: Recovers 670 HP"
ASK	TYPER	"Meat Salad"	"Item: Recovers 860 HP"
ASK	TYPER	"Gratin"	"Item: Recovers 1075 HP"
ASK	TYPER	"Seafood Pizza"	"Item: Recovers 1313 HP"
ASK	TYPER	"Orange Juice"	"Item: Recovers 60 HP"
ASK	TYPER	"Strawberry Shake"	"Item: Recovers 110 HP"
ASK	TYPER	"Pineapple Cone"	"Item: Recovers 160 HP"
ASK	TYPER	"Banana Jujubar"	"Item: Recovers 210 HP"
ASK	TYPER	"Fruit Juice"	"Item: Recovers 260 HP"
ASK	TYPER	"Fruit Icewater"	"Item: Recovers 334 HP"
ASK	TYPER	"Fruit Parfait"	"Item: Recovers 417 HP"
ASK	TYPER	"Fruit Sherbet"	"Item: Recovers 508 HP"
ASK	TYPER	"Icecream Cake"	"Item: Recovers 607 HP"
ASK	TYPER	"Fruit Punch"	"Item: Recovers 714 HP"
ASK	TYPER	"Gray Pill"	"Item: Recovers 975 HP"
ASK	TYPER	"Yellow Pill"	"Item: Recover 1200 HP"
ASK	TYPER	"Blue Pill"	"Item: Recovers 2000 HP"
ASK	TYPER	"Red Pill"	"Item: Recovers 4000 HP"
ASK	TYPER	"Gold Pill"	"Item: Recovers 8000 HP"
ASK	TYPER	"Mysterious Pill"	"Item: Recovers HP by 12,000"
ASK	TYPER	"Hot Ddukguk"	"Item: Recovers 9999 HP"
ASK	TYPER	"Fresh Ddukguk"	"Item: Recovers 9999 FP"
ASK	TYPER	"Sweet Ddukguk"	"Item: Recovers 9999 MP"
ASK	TYPER	"Skill Poster"	"Item: Needed to use Billposter skills"
ASK	TYPER	"Bless Poster"	"Item: Needed to use Ringmaster skills"
ASK	TYPER	"Battery"	"Item: 30 minute battery for the Collector"
ASK	TYPER	"Return"	"Item: Teleport to the nearest town. (Takes 5 min. to cast)"
ASK	TYPER	"Bull Hamstern"	"Item: Provides STA +20 for 1 hour"
ASK	TYPER	"King Card"	"Item: Provides Attack +10%, STR +13 for 1 hour"
ASK	TYPER	"Queen Card"	"Item: Provides Magic Power +50, INT +13 for 1 hour"
ASK	TYPER	"Jack Card"	"Item: Provides Max HP +20%, STA +13 for 1 hour"
ASK	TYPER	"Ace Card"	"Item: Provides Critical Damage +10%, DEX +13 for 1 hour"
ASK	TYPER	"Grilled Eel"	"Item: Provides +50% HP for 1 hour"
ASK	TYPER	"Re-Stat"	"Item: Resets your stats"
ASK	TYPER	"Activition"	"Item: Provides unlimited Action Slot skills for a limited time"
ASK	TYPER	"Wings of an Angel"	"Item: Gives a character golden wings for a limited time"
ASK	TYPER	"Tineined Stone"	"Item: Magic Stone for removing Attributes"
ASK	TYPER	"Firea Stone"	"Item: Magic Stone that adds 20% Fire Attack"
ASK	TYPER	"Wateil Stone"	"Item: Magic Stone that adds 20% Water Attack"
ASK	TYPER	"Windyo Stone"	"Item: Magic Stone that adds 20% Wind Attack"
ASK	TYPER	"Lightine Stone"	"Item: Magic Stone that adds 20% Electric Attack"
ASK	TYPER	"Earthy Stone"	"Item: Magic Stone that adds 20% Earth Attack"
ASK	TYPER	"Def-Firea Stone"	"Item: Magic Stone that adds 20% Fire Defense"
ASK	TYPER	"Def-Wateil Stone"	"Item: Magic Stone that adds 20% Water Defense"
ASK	TYPER	"Def-Windyo Stone"	"Item: Magic Stone that adds 20% Wind Defense"
ASK	TYPER	"Def-Lightine Stone"	"Item: Magic Stone that adds 20% Electric Defense"
ASK	TYPER	"Def-Earthy Stone"	"Item: Magic Stone that adds 20% Fire Defense"
ASK	TYPER	"Scroll of Holy"	"Item: Recovers Condition"
ASK	TYPER	"Scroll of Forgive"	"Item: Recovers Karma"
ASK	TYPER	"Scroll of Selected Party"	"Item: Upgrade Party Level to 40"
ASK	TYPER	"Scroll of Velocity"	"Item: Increases Moving Speed and Jump Height"
ASK	TYPER	"Re-Skill"	"Item: Allows you to redistribute your skill points once. Does not work for Vagrants"
ASK	TYPER	"Power of Party"	"Item: Possess Exp.and Party Skill 30 and Selected Party"
ASK	TYPER	"Pumpkin Soup"	"Item: +50% Max. FP"
ASK	TYPER	"Uriel Cold noodle"	"Item: +50% Max. FP"
ASK	TYPER	"Scroll of G-Name Change"	"Item: Changes Guild Name"
ASK	TYPER	"Gloves of Cheering"	"Item: Gives the character 1 cheer point and makes it possible to cheer yourself (for a limited time)"
ASK	TYPER	"Scroll of Smelting"	"Item: +10% Upgrade success rate"
ASK	TYPER	"Scroll of Return"	"Item: Returns a character to where it was when the scroll was activated"
ASK	TYPER	"Shout of Blood"	"Item: x2 HP Recovery per Second (For a limited time)"
ASK	TYPER	"Swirl of Soul"	"Item: MP Recovery per second x2 HP Recovery per Second (For a limited time)"
ASK	TYPER	"Pain of Patience"	"Item: FP Recovery per second x2 FP Recovery per Second (For a limited time)"
ASK	TYPER	"Scroll of Amplification DR"	"Item: x2 Item Drop Rate"
ASK	TYPER	"Def-Upcut Stone"	"Item: Adds 20% Defense"
ASK	TYPER	"Instructor of Skill"	"Item: x2 Skill Exp"
ASK	TYPER	"Love of Uriel"	"Item: Possess Uriel Cold Noodle and Sweet Ddukguk"
ASK	TYPER	"Scroll of Private Custody"	"Item: Allows you to instantly access your bank account"
ASK	TYPER	"Scroll of Custody"	"Item: Summon Banker for 3 Min"
ASK	TYPER	"Blessing of Party Leader"	"Item: x2 Party Exp. (Only Party Leader can use)"
ASK	TYPER	"Summon of Party Leader"	"Item: Summons Party members to the Party Leader (Only Party Leader can use)"
ASK	TYPER	"Teleport Pass"	"Item: A reusable pass that opens the teleport destination list from anywhere. Never consumed"
ASK	TYPER	"Potion of Recklessness"	"Item: Increases your Critical Hit Rate by 10%. Lasts 1 hour"
ASK	TYPER	"Potion of Swiftness"	"Item: Increases your Attack Speed by 10%. Lasts 1 hour"
ASK	TYPER	"Potion of Accuracy"	"Item: Increases your Hit Rate by 10%. Lasts 1 hour"
ASK	TYPER	"Potion of Clarity"	"Item: Decreases your Casting Time by 10%. Lasts 1 hour"
ASK	TYPER	"Elixir of the Tiger"	"Item: Increases your Strength (STR) by +10. Lasts 1 hour"
ASK	TYPER	"Elixir of the Rabbit"	"Item: Increases your Dexterity (DEX) by +10. Lasts 1 hour"
ASK	TYPER	"Elixir of the Fox"	"Item: Increases your Intellect (INT) by +10. Lasts 1 hour"
ASK	TYPER	"Elixir of the Lion"	"Item: Increases your Stamina (STA) by +10. Lasts 1 hour"
ASK	TYPER	"Elixir of Stone"	"Item: Increases your Defense (DEF) by +100. Lasts 1 hour"
ASK	TYPER	"Elixir of Anti-Magic"	"Item: Increases your Magic Resistance by +50. Lasts 1 hour"
ASK	TYPER	"Elixir of Flowing Thought"	"Item: Increases your Maximum MP amount by 10%. Lasts 1 hour"
ASK	TYPER	"Elixir of the Sorceror"	"Item: Increases your Magic Attack bonus by +20. Lasts 1 hour"
ASK	TYPER	"Elixir of Evasion"	"Item: Increases your Parry Rate by 10%. Lasts 1 hour"
ASK	TYPER	"Flask of the Tiger"	"Item: Increases your Strength (STR) by +20. Lasts 1 hour"
ASK	TYPER	"Flask of the Rabbit"	"Item: Increases your Dexterity (DEX) by +20. Lasts 1 hour"
ASK	TYPER	"Flask of the Fox"	"Item: Increases your Intellect (INT) by +20. Lasts 1 hour"
ASK	TYPER	"Flask of the Lion"	"Item: Increases your Stamina (STA) by +20. Lasts 1 hour"
ASK	TYPER	"Flask of Stone"	"Item: Increases your Defense (DEF) by +200. Lasts 1 hour"
ASK	TYPER	"Clothes Test"	"Item: Item for tesing costumes"
ASK	TYPER	"Pink Nurse"	"Item: Pink Nurse set for Female Characters"
ASK	TYPER	"Blinkwing of Flaris"	"Item: Teleport to Flaris"
ASK	TYPER	"Blinkwing of Saint Morning"	"Item: Teleport to Saint Morning"
ASK	TYPER	"Town Blinkwing"	"Item: Teleport to the nearest town"
ASK	TYPER	"Blinkwing of Darkon"	"Item: Teleport to Darkon"
ASK	TYPER	"Blinkwing of Dekane"	"Item: Teleport to the Dekane Mines"
ASK	TYPER	"Blinkwing of Mars"	"Item: Teleport to the Mars Dungeon"
ASK	TYPER	"Blinkwing of Volkane"	"Item: Teleport to Volkane"
ASK	TYPER	"Valin Cookies"	"Item: Cookies that Valin baked"
ASK	TYPER	"Rooney Refresher"	"Item: A special Refresher made by the Assist Rooney"
ASK	TYPER	"Hair Coupon"	"Item: Good for one free hair change"
ASK	TYPER	"Nyanyang"	"Item: Giant Nyang Nyang's favorite food. Can be found wherever Giant Nyang Nyang is"
ASK	TYPER	"Letter of Pardon"	"Item: Letter of Pardon"
ASK	TYPER	"Ring of Promise"	"Item: Ring of Promise"
ASK	TYPER	"Silver Candle Stick"	"Item: Silver Candle Stick"
ASK	TYPER	"Fire Feather"	"Item: Fire Feather"
ASK	TYPER	"Troupe Badge"	"Item: Troupe Badge"
ASK	TYPER	"Bone of Heaven"	"Item: Bone of Heaven"
ASK	TYPER	"Confidential Map"	"Item: Confidential Map"
ASK	TYPER	"Flaris Citizen Recommendation"	"Item: Flaris Citizen Recommendation"
ASK	TYPER	"Doridori Sushi"	"Item: Delicious sushi made from Doridoma Keratin and Mushpang Secretion"
ASK	TYPER	"Clue of Golden Helmet"	"Item: Do not forget that the Golden Helmet was hidden behind the Quest Office"
ASK	TYPER	"Golden Helmet of Billaon"	"Item: A beautiful golden helmet that the Knight Hero used during the war"
ASK	TYPER	"Earring of Heren"	"Item: The magic earring of Heren the Blade hero. It increases attack speed"
ASK	TYPER	"Tear of Darkness"	"Item: A tear that the Black Magician shed for the Heroes that died in the war"
ASK	TYPER	"Hall Document"	"Item: The document of the hall where Roentel, the Billposter hero, learned his millitary arts"
ASK	TYPER	"Seal of Aenn"	"Item: Symbol of Erranapogar family. Aenn takes care of it, as the last of his family"
ASK	TYPER	"Teardrop of Aenn"	"Item: A tear that Aen shed as he watched his friends go off into battle"
ASK	TYPER	"Magic Underwear of Power"	"Item: Makes magic more powerful!"
ASK	TYPER	"Trace of Offerep"	"Item: A gem which was created by the mental power of Offerep"
ASK	TYPER	"Feather of Magic Power"	"Item: A magic tool made by Lillip from a Luia feather. It can double magic power"
ASK	TYPER	"Perfume of Lillip"	"Item: A rare perfume handed down through Lillip's family"
ASK	TYPER	"Beaujolai of Flaris"	"Item: Beaujolai red wine"
ASK	TYPER	"Beaujolai of Saintmorning"	"Item: Beaujolai white wine"
ASK	TYPER	"Beaujolai of Darkon"	"Item: Beaujolai purple wine"
ASK	TYPER	"A Lucky Bag"	"Item: Rumor says that there are special presents in the lucky bag which was made by Gerglin"
ASK	TYPER	"Rice cake Soup"	"Item: Special Korean Ddukguk Losha made for Chinese New Year which is the biggest holiday in Madrigal"
ASK	TYPER	"Broken Tombmarble"	"Item: People in Madrigal are using this for making brick when they build houses"
ASK	TYPER	"Liquid Eronsimit"	"Item: People in Madrigal are using this for making adhesive when they build houses"
ASK	TYPER	"Dryness Rootioe"	"Item: People in Madrigal are using this for making timber when they build houses"
ASK	TYPER	"Red Socks"	"Item: Red socks that Santa lost"
ASK	TYPER	"Blue Roach Fluid"	"Item: Fluid of Pink Roach"
ASK	TYPER	"Wake Roach Water"	"Item: Wake Roach Water"
ASK	TYPER	"Pink Roach Queen Fluid"	"Item: Pink Roach Queen Fluid"
ASK	TYPER	"Blue Roach Queen Fluid"	"Item: Blue Roach Queen Fluid"
ASK	TYPER	"Puran Necklace"	"Item: STA Necklace made by the Dwarves"
ASK	TYPER	"Bucket"	"Item: Water Bucket"
ASK	TYPER	"Baby Lawolf"	"Item: A cute, baby, Lawolf that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Aibatt"	"Item: A cute, baby, Aibatt that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Leyena"	"Item: A cute, baby, Leyena that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Luia"	"Item: A cute, baby, Luia that follows its master around and picks up dropped items"
ASK	TYPER	"Doggy"	"Item: A cute Doggy that follows its master around and picks up dropped items"
ASK	TYPER	"Kitty"	"Item: A cute Kitty that follows its master around and picks up dropped items"
ASK	TYPER	"Polar Bear"	"Item: A Polar Bear that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Penguin"	"Item: A cute, baby, Penguin that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Iguana"	"Item: A cute, baby, Iguana that follows its master around and picks up dropped items"
ASK	TYPER	"Baby Cobra"	"Item: A cute, baby, Cobra that follows its master around and picks up dropped items"
ASK	TYPER	"Cute Frog"	"Item: Cute Frog that follows its owner around and picks up dropped items"
ASK	TYPER	"Cute Hamburger"	"Item: Cute Hamburger that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Turtle"	"Item: Cute Turtle that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Chicken"	"Item: Cute Chicken that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Cow"	"Item: Cute Cow that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Beagle"	"Item: Cute Beagle that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Blue Dragon"	"Item: This devoted little dragon flies around and picks up nearby items for its master"
ASK	TYPER	"Baby Black Dragon"	"Item: This devoted little dragon flies around and picks up nearby items for its master"
ASK	TYPER	"Baby Hamster"	"Item: Cute Hamster that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Horse"	"Item: Cute Horse that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Monkey"	"Item: Cute Monkey that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Pig"	"Item: Cute Pig that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Rabbit"	"Item: Cute Rabbit that follows its owner around and picks up dropped items"
ASK	TYPER	"Cute Lamb"	"Item: Cute Lamb that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Tiger"	"Item: Baby tiger that follows its owner around and picks up dropped items"
ASK	TYPER	"Little Maid Cardpuppet"	"Item: A cute, little Maid Cardpuppet that follows its master around and picks up dropped items"
ASK	TYPER	"Little Mia"	"Item: A cute, little Mia that follows its master around and picks up dropped items"
ASK	TYPER	"English Bulldog"	"Item: English Bulldog that follows its owner around and picks up dropped items"
ASK	TYPER	"Naughty Ghost"	"Item: Naughty Ghost that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Fu Lion"	"Item: A Baby Fu Lion with a bad hair day that follows it's owner around, picking up dropped items"
ASK	TYPER	"Smart Owl"	"Item: Smart Owl that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Robot"	"Item: Baby Robot that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Bang"	"Item: Baby Bang that follows its owner around and picks up dropped items"
ASK	TYPER	"Baby Panda"	"Item: Baby Panda that follows its owner around and picks up dropped items"
ASK	TYPER	"Lucky Bag"	"Item: Happy New Year!"
ASK	TYPER	"White Cake"	"Item: Not quite a Chef Duff masterpiece, but it does the job!"
ASK	TYPER	"Green Cake"	"Item: A lot of movies are about life, mine are like a slice of cake"
ASK	TYPER	"Pink Cake"	"Item: I wanted to buy a candle holder, but the store didn't have one. So I got a cake"
ASK	TYPER	"Rice Cake"	"Item: The more of these you collect. The better the kind of bead you will get"
ASK	TYPER	"Leaf"	"Item: The more leaves you gather the better!"
ASK	TYPER	"Font Editor"	"Item: Color your chat message! Just highlight your text and right click with your mouse!"
ASK	TYPER	"Beauty Shop"	"Item: Change your hair style and color"
ASK	TYPER	"Personal Shop"	"Item: Only players using the Personal Shop item can buy from players using the Personal Shop item"
ASK	TYPER	"Christmas Cookies"	"Item: Then we'll eat a whole roll of Cookiedough as fast as we can, and then we'll snuggle!"
ASK	TYPER	"Red Angel"	"Item: EXP should be gained as much as 100% of the EXP of its character based on the level"
ASK	TYPER	"Blue Angel"	"Item: EXP should be gained as much as 60% of the EXP of its character based on the level"
ASK	TYPER	"Green Angel"	"Item: EXP should be gained as much as 30% of the EXP of its character based on the level"
ASK	TYPER	"White Angel"	"Item: EXP should be gained as much as 10% of the EXP of its character based on the level"
ASK	TYPER	"Stationery"	"Item: Gather some more and get a School Bag"
ASK	TYPER	"Milk Chocolate"	"Item: Increase moving speed for 3 Mins"
ASK	TYPER	"Pink Balloons"	"Item: Stunning Pink Balloons that increase your Attack Power (ATK) by +50. Lasts 2 days"
ASK	TYPER	"Blue Balloons"	"Item: Beautiful Blue Balloons that increase your Defense (DEF) by +100. Lasts 2 days"
ASK	TYPER	"Yellow Balloons"	"Item: Pretty Yellow Balloons that increase your Health Points (HP) by +150. Lasts 2 days"
ASK	TYPER	"Pumpkin Pie"	"Item: Straight from the ovens of Mrs. Lovett!"
ASK	TYPER	"Whiteday Chocolate Set"	"Item: Sweet chocolates!"
ASK	TYPER	"Rock-Paper-Scissors Coupon"	"Item: A coupon that can be exchanged for a single game of Rock-Paper-Scissors"
ASK	TYPER	"Young Seedling"	"Item: Gather more and claim a reward!"
ASK	TYPER	"White Tiger Cage"	"Item: This ferocious Tiger is GGGREAT! Tigers will increase your STR"
ASK	TYPER	"Babari Lion Cage"	"Item: Good thing these Lions come with courage! Lions will increase your STA"
ASK	TYPER	"Unicorn Corral"	"Item: Look! Majestic speedy mule! Unicorns will increase your Speed"
ASK	TYPER	"Old Fox Cage"	"Item: A fox is a wolf who sends flowers. Foxes will increase your INT"
ASK	TYPER	"Baby Griffin Cage"	"Item: RAWR!!! Griffins will increase your Defense Power"
ASK	TYPER	"Scroll of Pet Recovery"	"Item: Increases the life of a raised pet by 1"
ASK	TYPER	"Pet Feed"	"Item: 1 Pet Feed restores 2 Pet HP. (Use Pet feed to give Eggs experience.)"
ASK	TYPER	"Pet Feed Maker"	"Item: Makes the maximum amount of pet food with the materials available in your inventory"
ASK	TYPER	"Red Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Orange Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Yellow Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Green Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Blue Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Dark-Blue Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Purple Rainbow Piece"	"Item: Beautiful but mysterious rainbow piece"
ASK	TYPER	"Scroll of Reversion"	"Item: Removes awakenings on Weapons, Armor, or Shields. Once removed, a new awakening can be applied"
ASK	TYPER	"Scroll of Sealed Character"	"Item: Turns a character into an item that can be traded"
ASK	TYPER	"Small Toothed Wheel"	"Item: What is it? Looks useless"
ASK	TYPER	"Toothed Wheel"	"Item: What is it? Looks useless"
ASK	TYPER	"Sunstone Piece"	"Item: Gather 10 of these to get a Sunstone from Collins"
ASK	TYPER	"Moonstone Piece"	"Item: Gather 10 of these to get a Moonstone from Collins"
ASK	TYPER	"Topaz Piece"	"Item: Gather 10 of these to get a Topaz from Collins"
ASK	TYPER	"Ruby Piece"	"Item: Gather 10 of these to get a Ruby from Collins"
ASK	TYPER	"Sapphire Piece"	"Item: Gather 10 of these to get a Sapphire from Collins"
ASK	TYPER	"Emerald Piece"	"Item: Gather 10 of these to get a Emerald from Collins"
ASK	TYPER	"Diamond Piece"	"Item: Gather 10 of these to get a Diamond from Collins"
ASK	TYPER	"Purple Cotton Candy"	"Item: Increases STA by 3 for a short time"
ASK	TYPER	"Blue Cotton Candy"	"Item: Increases INT by 3 for a short time"
ASK	TYPER	"Green Cotton Candy"	"Item: Increases DEX by 3 for a short time"
ASK	TYPER	"Red Cotton Candy"	"Item: Increases STR by 3 for a short time"
ASK	TYPER	"Sky-Blue Cotton Candy"	"Item: Increases Evasion Rate by 5 for a short time"
ASK	TYPER	"Pink Cotton Candy"	"Item: Increases Critical Rate by 5 for a short time"
ASK	TYPER	"Yellow Cotton Candy"	"Item: Increases Attack Speed by 5 for a short time"
ASK	TYPER	"White Cotton Candy"	"Item: Decreases Cast Time by 5 for a short time"
ASK	TYPER	"Gray Cotton Candy"	"Item: Increases Defense by 30 for a short time"
ASK	TYPER	"Orange Cotton Candy"	"Item: Increases Hit Rate by 5 for a short time"
ASK	TYPER	"Flying Ship Material"	"Item: A piece of an ancient Flying Ship"
ASK	TYPER	"Strange Wrapping Cloth"	"Item: There is something strange wrapped in this cloth"
ASK	TYPER	"Upgrading Set"	"Item: Items to help you upgrade!"
ASK	TYPER	"Cooked Corn"	"Item: Increases every stat by 2 for 3 minutes"
ASK	TYPER	"Cooked Octopus"	"Item: Increases speed by 20% for 3 minutes"
ASK	TYPER	"Piece of Silk"	"Item: Useful piece for fixing worn-out silk"
ASK	TYPER	"Balloonflower Silk"	"Item: Silk with balloonflower patterns"
ASK	TYPER	"Voter's Buff"	"Item: This is a special buff for voters. Increases Experience and Item Drops by 5%"
ASK	TYPER	"Red Candle"	"Item: A vibrant Red Candle. The Mysterious Teller of Tales might be able to use it to remove a curse!"
ASK	TYPER	"Charm"	"Item: A strange charm. The Mysterious Teller of Tales might be able to use it to remove a curse!"
ASK	TYPER	"Sugar Boost"	"Item: Increases every character stat by up to 5 for 3 minutes"
ASK	TYPER	"Flash Charm"	"Item: Increases your movement speed by up to 30% for 3 minutes"
ASK	TYPER	"FLY"	"Item: Increases your movement speed by 15% for 1 hour"
ASK	TYPER	"FOR"	"Item: Increases your Defense Power by 150 for one hour"
ASK	TYPER	"FUN"	"Item: Increases your Attack Power by 200 for 1 hour"
ASK	TYPER	"Scroll of Change Pet Name"	"Item: A Special Scroll used to name your summoned pet. This scroll only works on raised pets"
ASK	TYPER	"Miracle of Love"	"Item: Increases PvE Damage based on the achieved couple level"
ASK	TYPER	"Stat Redistribution Coupon"	"Item: Exchange for one restatel(for only one stat)"
ASK	TYPER	"Wish Roll"	"Item: A roll that can make your wishes come true, assuming your wishing for 2000 HP"
ASK	TYPER	"Soy Bean"	"Item: A healthy finger food"
ASK	TYPER	"Soju"	"Item: It's a creeper"
ASK	TYPER	"Picnic Basket"	"Item: Let's open to see what's in the basket!"
ASK	TYPER	"Chocolate Drink"	"Item: Chocolate milk? Think quik!!"
ASK	TYPER	"Chocolate Cookie"	"Item: A balanced diet is a cookie in each hand"
ASK	TYPER	"Love Chocolate"	"Item: This delicious chocolate increases your Attack Power and HP by 10% for 2 hours"
ASK	TYPER	"Herb of Life"	"Item: A natural herb used to ease pain, restore health, and increase appetite"
ASK	TYPER	"Recipe of legend-Material"	"Item: Document about the combination of food materail"
ASK	TYPER	"Completed recipe"	"Item: The best recipe made by Loya's father"
ASK	TYPER	"Tofu Salad"	"Item: Are you a health nut? This is the best health food around! HP Recovery 20,000"
ASK	TYPER	"Blinkwing of Shaduwar"	"Item: Teleport to Shaduwar"
ASK	TYPER	"Diary of adventurer"	"Item: Document which has records of adventurer"
ASK	TYPER	"Decoding Document"	"Item: Mysterious document that have not decoded yet"
ASK	TYPER	"Decoded Document"	"Item: Document that decoding have been completed"
ASK	TYPER	"Battle Toadrin Heart"	"Item: A slightly warm Battle Toadrin Heart. It appears to throb occasionally"
ASK	TYPER	"Scroll of Sprint"	"Item: Substantially increases your run speed. Lasts 3 Minutes"
ASK	TYPER	"Melon Cookie"	"Item: Specially made Melon Cookie from Melon Bakery"
ASK	TYPER	"Melon Denish"	"Item: Specially made Melon Denish from Melon Bakery"
ASK	TYPER	"Melon Waffle"	"Item: Specially made Melon Waffle from Melon Bakery"
ASK	TYPER	"Melon Basket"	"Item: Obtain items with certain chances"
ASK	TYPER	"Japan Easter Balloon"	"Item: Gives user +200 Max HP for 5 days"
ASK	TYPER	"Philippines Easter Balloon"	"Item: Gives user +200 Max HP for 5 days"
ASK	TYPER	"Vietnam Easter Balloon"	"Item: Gives user +200 Max HP for 5 days"
ASK	TYPER	"Chile Easter Balloon"	"Item: Gives user +200 Max HP for 5 days"
ASK	TYPER	"Tommy Toucan"	"Item: A portly toucan that follows its master around, picking up dropped items. SQUAWK!"
ASK	TYPER	"Brewing Kettle"	"Item: You would be surprised how easy it is to make Rootbeer, assuming you have the right materials"
ASK	TYPER	"Red Gumball"	"Item: This tastey little treat will increase your STR by 5 for 3 minutes"
ASK	TYPER	"Blue Gumball"	"Item: This tastey little treat will increase your INT by 5 for 3 minutes"
ASK	TYPER	"Yellow Gumball"	"Item: This tastey little treat will increase your DEX by 5 for 3 minutes"
ASK	TYPER	"Bead Slot Key"	"Item: Use this key to unlock a Bead Slot in your Buff Pet. The key is consumed when used"
ASK	TYPER	"Second Journal"	"Item: The translated version of the second journal"
ASK	TYPER	"Three Shaduwar journals"	"Item: Three diaries including the history about Shaduwar"
ASK	TYPER	"Magic Liquor"	"Item: A very potent alcohol. Only the hardiest of drinkers can stomach the harsh liquid inside"
ASK	TYPER	"Blessed Cross"	"Item: A powerful item stolen from Rhisis long ago"
ASK	TYPER	"Razer"	"Item: Razer item for use at a later date"
ASK	TYPER	"Glass"	"Item: Handle with care!"
ASK	TYPER	"Holiday Medal"	"Item: Proof that you have helped save Christmas!"
ASK	TYPER	"Rope"	"Item: In the movies, they always have rope and they always end up using it"
ASK	TYPER	"Enriched Soil Deposit"	"Item: The extra UMPH that the soil mixture needs!"
ASK	TYPER	"Water"	"Item: That is some high quality H20!"
ASK	TYPER	"Christmas Cake"	"Item: This isn't your typical Holiday Fruit Cake! Increases Attack Power by 10%. Lasts 20 minutes"
ASK	TYPER	"Mini Santa"	"Item: Collecting goodies is much faster than relying on those elves to make everything!"
ASK	TYPER	"Bronze Package"	"Item: Package including Feed Bag (6hours), Chance of the Pet Tamer"
ASK	TYPER	"MVP Blessing"	"Item: The blessing of the Guild Siege MVP statue in Flaris. All stats +15 for 30 minutes"
ASK	TYPER	"Sardine Roll"	"Item: Much like a Hot Pocket with a Sardine inside, except this one has magical healing powers!"
ASK	TYPER	"Lost lucky bag"	"Item: A lucky bag which Bubble priest have lost"
ASK	TYPER	"Joey"	"Item: This cute little guy will follow his owner around and pick up dropped items"
ASK	TYPER	"Spike"	"Item: A mean mut that follows its owner around and picks up dropped items"
ASK	TYPER	"Lumia"	"Item: This frozen beauty follows its owner around and picks up dropped items"
ASK	TYPER	"Three-Leaf Clover"	"Item: Collect 10 of these special Three-leaf Clovers and bring them to the Leprechaun!"
ASK	TYPER	"Cheshire Cat"	"Item: This cheesy kitty follows it's owner around and picks up dropped items. He's also quite mad"
ASK	TYPER	"Tiger Cub"	"Item: This cutie pie follows his *mommy* around and picks up dropped items"
ASK	TYPER	"Easter Egg"	"Item: Collect 100 of these and turn them into the Egg Decorator to get a Festive Easter Egg Basket"
ASK	TYPER	"Purple Egg"	"Item: Increases your Stamina (STA) by +5 for 5 minutes"
ASK	TYPER	"Green Egg"	"Item: Increases your Intelligence (INT) by +5 for 5 minutes"
ASK	TYPER	"Blue Egg"	"Item: Increases your Dexterity (DEX) by +5 for 5 minutes"
ASK	TYPER	"Red Egg"	"Item: Increases your Strength (STR) by +5 for 5 minutes"
ASK	TYPER	"Sky Blue Egg"	"Item: Increases your Parry Rate by 5% for 5 minutes"
ASK	TYPER	"Pink Egg"	"Item: Increase your Critical Hit Chance by 5% for 5 minutes"
ASK	TYPER	"Yellow Egg"	"Item: Increase your Attack Speed by 5% for 5 minutes"
ASK	TYPER	"White Egg"	"Item: Decreases your Casting Time by 5% for 5 minutes"
ASK	TYPER	"Gray Egg"	"Item: Increases your Defense by +30 for 5 minutes"
ASK	TYPER	"Orange Egg"	"Item: Increases your Chance to Hit by 5% for 5 minutes"
ASK	TYPER	"Pink Soccer Ball"	"Item: Increases your Attack Power by +300 for 30 min"
ASK	TYPER	"Black Soccer Ball"	"Item: Increases your Defence by +200 for 30 min"
ASK	TYPER	"Blue Soccer Ball"	"Item: Increases your Max HP by +300 for 30 min"
ASK	TYPER	"Pride of Victory"	"Item: Increases your HP by +20% and ATT +5% for 60 min"
ASK	TYPER	"Cloak for the Disciple"	"Item: Radion made this cloak to honor the memory of his favored disciple"
ASK	TYPER	"Branka's Heirloom"	"Item: This is the last tie Branka has to his parents"
ASK	TYPER	"Branka's Leather Ball"	"Item: An old toy that belonged to Branka and his father"
ASK	TYPER	"Cave Reed"	"Item: Once a favored play thing of the Muran young, this Reed may now serve another purpose"
ASK	TYPER	"Healers Salve"	"Item: A very potent medicine rumored to cure any illness"
ASK	TYPER	"Rainbow Blossom"	"Item: This rare flower grows only in place across all of Madrigal"
ASK	TYPER	"Rune Stone"	"Item: The runes placed on this stone are rumored to contain the secrets to the origins of Magic"
ASK	TYPER	"Almighty Magnifying Glass"	"Item: You can see everything through this magnifying glass"
ASK	TYPER	"Chief's Letter"	"Item: A letter which was written by Huntrang"
ASK	TYPER	"Decoded Letter"	"Item: Decoded Huntrang's letter"
ASK	TYPER	"Restored Diary"	"Item: RestoredBartholomew Hunt's diary"
ASK	TYPER	"Tarin Drink"	"Item: An exteremly potent alcohol"
ASK	TYPER	"Sign of Hero"	"Item: An item which can be only hold by hero"
ASK	TYPER	"Egg Booster"	"Item: Helps to transform Eggs into D grade pets"
ASK	TYPER	"Chameleon"	"Item: Chameleon follows his owner around picking up dropped items"
ASK	TYPER	"Enhanced Activition"	"Item: This new and improved Enhanced Activition provides unlimited Action Slot skills for 30 mins"
ASK	TYPER	"Zombie Head"	"Item: This Zombie Head has seen better days"
ASK	TYPER	"Zombie Left Arm"	"Item: Look at that... It's still trying to grab you"
ASK	TYPER	"Zombie Right Arm"	"Item: Look at that... It's still trying to grab you"
ASK	TYPER	"Zombie Left Leg"	"Item: A slimy, twitchy, throbbing, green mess. You can hardly stand looking at it"
ASK	TYPER	"Zombie Right Leg"	"Item: A slimy, twitchy, throbbing, green mess. You can hardly stand looking at it"
ASK	TYPER	"Zombie Chest"	"Item: You can hear a faint thumping sound as if the heart is still beating"
ASK	TYPER	"Cornucopia"	"Item: A hollowed shaped horn basket filled with various foods and surprises!"
ASK	TYPER	"Rudas's Bracelet"	"Item: A finely crafted bracelet"
ASK	TYPER	"Dusty Old Rock"	"Item: This rock doesn't appear to be of any significance. Or does it?"
ASK	TYPER	"Strange Fruit"	"Item: This odd looking fruit emits a strange odor"
ASK	TYPER	"Pendant of Eternity"	"Item: A majestic pendant that appears to have been around for some time"
ASK	TYPER	"Christmas Spirit"	"Item: Every time a bell rings, an Aibatt gets it's wings!"
ASK	TYPER	"Top Hat"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Coal Eyes"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Carrot Nose"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Scarf"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Snowballs"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Mittens"	"Item: A Piece of Danny the Snowboy's father, Jimbo the Snowdaddy"
ASK	TYPER	"Observing Producer Kim Cage"	"Item: This picks up items around automatically and gives buff when beads are added"
ASK	TYPER	"Pieces of Plastic"	"Item: These small pieces of plastic could possibly be used to create something special"
ASK	TYPER	"Love Spirit Angel's Letter"	"Item: A letter from Love Spirit Angel to Hate Spirit Devil. It's full of juicy stuff!"
ASK	TYPER	"Little Rabbit"	"Item: A Little Rabbit that is energetic and loves sweets"
ASK	TYPER	"Easter Charm A"	"Item: A charm you received for helping the Little Bunny. Should definitely hold on to this"
ASK	TYPER	"Easter Charm B"	"Item: A charm you received for helping the Little Bunny. Should definitely hold on to this"
ASK	TYPER	"Easter Charm C"	"Item: A charm you received for helping the Little Bunny. Should definitely hold on to this"
ASK	TYPER	"Baruna Oblivion"	"Item: This item removes the awakening on your Baruna equipment"
ASK	TYPER	"Flame Ove"	"Item: This Ove provides a Fire Element to your Baruna item. Baruna Element levels range from 1~20"
ASK	TYPER	"Dessert Ove"	"Item: This Ove provides a Land Element to your Baruna item. Baruna Element levels range from 1~20"
ASK	TYPER	"River Ove"	"Item: This Ove provides a Water Element to your Baruna item. Baruna Element levels range from 1~20"
ASK	TYPER	"Cyclone Ove"	"Item: This Ove provides a Wind Element to your Baruna item. Baruna Element levels range from 1~20"
ASK	TYPER	"Blue Token of Valor"	"Item: A special Token of Valor from the Colosseum that can be redeemed for special items"
ASK	TYPER	"Red Token of Valor"	"Item: A special Token of Valor from the Colosseum that can be redeemed for special items"
ASK	TYPER	"Rudolph Ring"	"Item: A cute and preciously rare ring. Given only to the most hardcore Christmas folk!"
ASK	TYPER	"Rudolph Necklace"	"Item: A cute and preciously rare necklace. Given only to the most hardcore Christmas folk!"
ASK	TYPER	"Rudolph Earing"	"Item: A cute and preciously rare earring. Given only to the most hardcore Christmas folk!"
ASK	TYPER	"Flami's Guitar"	"Item: You found Flami's Guitar! Go give it to Nightmare Flami!"
ASK	TYPER	"Weapon Rarity Scroll"	"Item: Use on a weapon to reroll its rarity tier"

//////////////////////////////////////////////////////////////////////
// O/X Quiz
//////////////////////////////////////////////////////////////////////
EVENT	OXQUIZ	MIN_LEVEL 120	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 10	ROUND_TIME 15	SCORE_TIME 5
POINTS	OXQUIZ	15 12 10 8 7 6 5 4 3 2	1

RANK	OXQUIZ	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	OXQUIZ	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	OXQUIZ	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	OXQUIZ	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	OXQUIZ	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	OXQUIZ	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	OXQUIZ	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	OXQUIZ	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	OXQUIZ	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	OXQUIZ	10	II_SYS_SYS_EVENT_TOKEN	5
REST	OXQUIZ	II_SYS_SYS_EVENT_TOKEN	2

ASK	OXQUIZ	O	"Every new character starts as a Vagrant."
ASK	OXQUIZ	X	"Magicians fight with a bow."
ASK	OXQUIZ	O	"Knight is a second job of the Mercenary."
ASK	OXQUIZ	X	"Jester is a second job of the Magician."
ASK	OXQUIZ	O	"Penya is the money of Madrigal."
ASK	OXQUIZ	X	"Ringmaster is a second job of the Acrobat."
ASK	OXQUIZ	O	"Elementor is a second job of the Magician."
ASK	OXQUIZ	O	"Billposter is a second job of the Assist."
ASK	OXQUIZ	X	"Psykeeper is a second job of the Mercenary."
ASK	OXQUIZ	O	"Rangers fight with a bow."
ASK	OXQUIZ	X	"Mushpang is a world boss."
ASK	OXQUIZ	O	"Flaris is a town in Madrigal."
ASK	OXQUIZ	X	"Mini Events cost Penya to join."
ASK	OXQUIZ	O	"Event Tokens are won in Mini Events."
ASK	OXQUIZ	O	"Guild Siege is held on Saturday."
ASK	OXQUIZ	X	"Free PK Time lasts the whole day."
ASK	OXQUIZ	O	"An Assist can heal other players."
ASK	OXQUIZ	X	"A Scroll of Return takes you to a dungeon."

// skills and items, from propSkill / propItem (O = true, X = false)
ASK	OXQUIZ	O	"Slash is a Mercenary skill."
ASK	OXQUIZ	O	"Keenwheel is a Mercenary skill."
ASK	OXQUIZ	X	"Blindside is a Ringmaster skill."
ASK	OXQUIZ	X	"Protection is a Billposter skill."
ASK	OXQUIZ	X	"Pan Barrier is a Billposter skill."
ASK	OXQUIZ	X	"Blazing Sword is a Billposter skill."
ASK	OXQUIZ	X	"Smite Axe is a Psykeeper skill."
ASK	OXQUIZ	O	"Empower Weapon is a Mercenary skill."
ASK	OXQUIZ	X	"Bloody Strike is a Billposter skill."
ASK	OXQUIZ	O	"Sword Mastery is a Mercenary skill."
ASK	OXQUIZ	X	"Axe Mastery is a Magician skill."
ASK	OXQUIZ	X	"Special Hit is a Magician skill."
ASK	OXQUIZ	O	"Guillotine is a Mercenary skill."
ASK	OXQUIZ	X	"Sneaker is a Psykeeper skill."
ASK	OXQUIZ	O	"Hit Reflect is a Mercenary skill."
ASK	OXQUIZ	X	"Guard is a Jester skill."
ASK	OXQUIZ	X	"Pain Reflection is a Mercenary skill."
ASK	OXQUIZ	X	"Rage is a Jester skill."
ASK	OXQUIZ	O	"Power Swing is a Knight skill."
ASK	OXQUIZ	X	"Earth Divider is a Ringmaster skill."
ASK	OXQUIZ	X	"Charge is a Ranger skill."
ASK	OXQUIZ	X	"Pain Dealer is a Magician skill."
ASK	OXQUIZ	O	"Power Stomp is a Knight skill."
ASK	OXQUIZ	O	"Cross Strike is a Blade skill."
ASK	OXQUIZ	X	"Armor Penetrate is a Ranger skill."
ASK	OXQUIZ	O	"Silent Strike is a Blade skill."
ASK	OXQUIZ	O	"Blade Dance is a Blade skill."
ASK	OXQUIZ	X	"Spring Attack is a Psykeeper skill."
ASK	OXQUIZ	O	"Hawk Attack is a Blade skill."
ASK	OXQUIZ	X	"Sonic Blade is a Jester skill."
ASK	OXQUIZ	O	"Berserk is a Blade skill."
ASK	OXQUIZ	O	"Heal is an Assist skill."
ASK	OXQUIZ	O	"Straight Punch is an Assist skill."
ASK	OXQUIZ	O	"Resurrection is an Assist skill."
ASK	OXQUIZ	O	"Patience is an Assist skill."
ASK	OXQUIZ	X	"Prevention is a Ranger skill."
ASK	OXQUIZ	X	"Heap Up is a Ringmaster skill."
ASK	OXQUIZ	O	"Cannon Ball is an Assist skill."
ASK	OXQUIZ	X	"Circle Healing is a Mercenary skill."
ASK	OXQUIZ	O	"Mental Sign is an Assist skill."
ASK	OXQUIZ	X	"Beef Up is a Jester skill."
ASK	OXQUIZ	O	"Burst Crack is an Assist skill."
ASK	OXQUIZ	X	"Stonehand is a Ranger skill."
ASK	OXQUIZ	O	"Quick Step is an Assist skill."
ASK	OXQUIZ	O	"Cat's Reflex is an Assist skill."
ASK	OXQUIZ	O	"Accuracy is an Assist skill."
ASK	OXQUIZ	O	"Power Fist is an Assist skill."
ASK	OXQUIZ	O	"Haste is an Assist skill."
ASK	OXQUIZ	O	"Heal Rain is a Ringmaster skill."
ASK	OXQUIZ	X	"Holycross is an Assist skill."
ASK	OXQUIZ	O	"Protect is a Ringmaster skill."
ASK	OXQUIZ	O	"Holyguard is a Ringmaster skill."
ASK	OXQUIZ	X	"Spirit Fortune is an Acrobat skill."
ASK	OXQUIZ	X	"Gvur Tialla is a Ranger skill."
ASK	OXQUIZ	X	"Geburah Tiphreth is a Billposter skill."
ASK	OXQUIZ	O	"Merkaba Hanzelrusha is a Ringmaster skill."
ASK	OXQUIZ	O	"Belial Smashing is a Billposter skill."
ASK	OXQUIZ	X	"Piercing Serpent is a Psykeeper skill."
ASK	OXQUIZ	O	"Blood Fist is a Billposter skill."
ASK	OXQUIZ	X	"Sonichand is a Mercenary skill."
ASK	OXQUIZ	X	"Asmodeus is an Elementor skill."
ASK	OXQUIZ	O	"Baraqijal Esna is a Billposter skill."
ASK	OXQUIZ	O	"Bgvur Tialbold is a Billposter skill."
ASK	OXQUIZ	X	"Asalraalaikum is an Acrobat skill."
ASK	OXQUIZ	X	"Flame Ball is a Ringmaster skill."
ASK	OXQUIZ	O	"Flame Geyser is a Magician skill."
ASK	OXQUIZ	O	"Swordwind is a Magician skill."
ASK	OXQUIZ	O	"Strongwind is a Magician skill."
ASK	OXQUIZ	O	"Blinkpool is a Magician skill."
ASK	OXQUIZ	O	"Ice Missile is a Magician skill."
ASK	OXQUIZ	O	"Static Ball is a Magician skill."
ASK	OXQUIZ	O	"Stone Spike is a Magician skill."
ASK	OXQUIZ	O	"Mental Strike is a Magician skill."
ASK	OXQUIZ	X	"Fire Strike is an Elementor skill."
ASK	OXQUIZ	O	"Wind Cutter is a Magician skill."
ASK	OXQUIZ	X	"Waterball is a Knight skill."
ASK	OXQUIZ	O	"Water Well is a Magician skill."
ASK	OXQUIZ	X	"Lighting Ram is a Knight skill."
ASK	OXQUIZ	O	"Lighting Shock is a Magician skill."
ASK	OXQUIZ	X	"Rock Crash is a Mercenary skill."
ASK	OXQUIZ	X	"Rooting is a Mercenary skill."
ASK	OXQUIZ	O	"Demonology is a Psykeeper skill."
ASK	OXQUIZ	X	"Satanology is a Billposter skill."
ASK	OXQUIZ	X	"Psychic Bomb is a Ranger skill."
ASK	OXQUIZ	O	"Psychic Wall is a Psykeeper skill."
ASK	OXQUIZ	X	"Spirit Bomb is a Jester skill."
ASK	OXQUIZ	X	"Crucio Spell is an Assist skill."
ASK	OXQUIZ	O	"Maximum Crisis is a Psykeeper skill."
ASK	OXQUIZ	X	"Psychic Square is a Blade skill."
ASK	OXQUIZ	O	"Firebird is an Elementor skill."
ASK	OXQUIZ	O	"Fire Master is an Elementor skill."
ASK	OXQUIZ	O	"Burningfield is an Elementor skill."
ASK	OXQUIZ	X	"Lightning Strike is a Blade skill."
ASK	OXQUIZ	X	"Lightning Mastery is a Blade skill."
ASK	OXQUIZ	O	"Electric Shock is an Elementor skill."
ASK	OXQUIZ	X	"Stone Spear is a Blade skill."
ASK	OXQUIZ	O	"Earth Master is an Elementor skill."
ASK	OXQUIZ	X	"Earthquake is a Ranger skill."
ASK	OXQUIZ	X	"Iceshark is a Billposter skill."
ASK	OXQUIZ	O	"Water Master is an Elementor skill."
ASK	OXQUIZ	O	"Poison Cloud is an Elementor skill."
ASK	OXQUIZ	X	"Void is a Ringmaster skill."
ASK	OXQUIZ	O	"Wind Master is an Elementor skill."
ASK	OXQUIZ	X	"Windfield is a Psykeeper skill."
ASK	OXQUIZ	O	"Meteo Shower is an Elementor skill."
ASK	OXQUIZ	X	"Lightingstorm is a Ringmaster skill."
ASK	OXQUIZ	O	"Sandstorm is an Elementor skill."
ASK	OXQUIZ	O	"Blizzard is an Elementor skill."
ASK	OXQUIZ	X	"Yo-Yo mastery is a Ringmaster skill."
ASK	OXQUIZ	X	"Bow Mastery is a Psykeeper skill."
ASK	OXQUIZ	O	"Dark Illusion is an Acrobat skill."
ASK	OXQUIZ	O	"Rapid Shot is an Acrobat skill."
ASK	OXQUIZ	X	"Fast Walker is an Assist skill."
ASK	OXQUIZ	X	"Aimed Shot is a Knight skill."
ASK	OXQUIZ	O	"Slow Step is an Acrobat skill."
ASK	OXQUIZ	O	"Silent Shot is an Acrobat skill."
ASK	OXQUIZ	X	"Perfect Block is a Ranger skill."
ASK	OXQUIZ	O	"Arrow Rain is an Acrobat skill."
ASK	OXQUIZ	O	"Cross Line is an Acrobat skill."
ASK	OXQUIZ	O	"Auto Shot is an Acrobat skill."
ASK	OXQUIZ	O	"Snatch is an Acrobat skill."
ASK	OXQUIZ	X	"Counterattack is a Psykeeper skill."
ASK	OXQUIZ	X	"Deadly swing is a Ranger skill."
ASK	OXQUIZ	X	"Pulling is a Ranger skill."
ASK	OXQUIZ	X	"Critical Swing is a Psykeeper skill."
ASK	OXQUIZ	O	"Enchant Poison is a Jester skill."
ASK	OXQUIZ	X	"Enchant Blood is a Ranger skill."
ASK	OXQUIZ	O	"Enchant Absorb is a Jester skill."
ASK	OXQUIZ	O	"Sneak Stab is a Jester skill."
ASK	OXQUIZ	X	"Penya Strike is a Magician skill."
ASK	OXQUIZ	X	"Escape is a Billposter skill."
ASK	OXQUIZ	X	"Vital stab is an Elementor skill."
ASK	OXQUIZ	X	"Fast Shot is a Billposter skill."
ASK	OXQUIZ	O	"Ice Arrow is a Ranger skill."
ASK	OXQUIZ	O	"Flame Arrow is a Ranger skill."
ASK	OXQUIZ	X	"Piercing Arrow is an Elementor skill."
ASK	OXQUIZ	X	"Poison Arrow is a Knight skill."
ASK	OXQUIZ	X	"Silent Arrow is an Assist skill."
ASK	OXQUIZ	O	"Nature is a Ranger skill."
ASK	OXQUIZ	O	"Triple shot is a Ranger skill."
ASK	OXQUIZ	X	"Swordcross is a Magician skill."
ASK	OXQUIZ	O	"First Refresher: MP 25 Recovery."
ASK	OXQUIZ	X	"Second Refresher: Teleport to the Mars Dungeon."
ASK	OXQUIZ	O	"Third Refresher: MP 75 Recovery."
ASK	OXQUIZ	X	"Fourth Refresher: Increases your Stamina (STA) by +10. Lasts 1 hour."
ASK	OXQUIZ	O	"Fifth Refresher: MP 125 Recovery."
ASK	OXQUIZ	X	"Sixth Refresher: Increases INT by 3 for a short time."
ASK	OXQUIZ	O	"Eighth Refresher: MP 200 Recovery."
ASK	OXQUIZ	X	"Ninth Refresher: Adds 20% Defense."
ASK	OXQUIZ	O	"Tenth Refresher: MP 250 Recovery."
ASK	OXQUIZ	X	"Demol Earring: Teleport to the Mars Dungeon."
ASK	OXQUIZ	O	"Plug Earring: Increases Defense. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	X	"Gore Necklace: Increases your Strength (STR) by +10. Lasts 1 hour."
ASK	OXQUIZ	O	"Mental Necklace: Increases Max MP. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	X	"Peision Necklace: A roll that can make your wishes come true, assuming your wishing for 2000 HP."
ASK	OXQUIZ	O	"Vigor Ring: Increases STR. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	X	"Intelli Ring: Recovers 676 HP."
ASK	OXQUIZ	O	"Arek Ring: Increases DEX. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	X	"Stam Ring: Increase moving speed for 3 Mins."
ASK	OXQUIZ	O	"Meteor: All Stats +1 Ring."
ASK	OXQUIZ	X	"Meteofy: Gives the character 1 cheer point and makes it possible to cheer yourself (for a limited time)."
ASK	OXQUIZ	O	"Lollipop: Recovers 70 HP."
ASK	OXQUIZ	X	"Biscuit: Collect 100 of these and turn them into the Egg Decorator to get a Festive Easter Egg Basket."
ASK	OXQUIZ	O	"Chocolate Bar: Recovers 200 HP."
ASK	OXQUIZ	X	"Milk: Gather 10 of these to get a Sunstone from Collins."
ASK	OXQUIZ	O	"Roll Bread: Recovers 330 HP."
ASK	OXQUIZ	X	"Hot Dog: Removes awakenings on Weapons, Armor, or Shields. Once removed, a new awakening can be applied."
ASK	OXQUIZ	O	"Super Hot Dog: Recovers ALL HP."
ASK	OXQUIZ	X	"Pizza: Increases speed by 20% for 3 minutes."
ASK	OXQUIZ	O	"Kimbap: Recovers 676 HP."
ASK	OXQUIZ	X	"Chicken Stick: Provides STA +20 for 1 hour."
ASK	OXQUIZ	O	"Star Candy: Recover 975 HP."
ASK	OXQUIZ	X	"Meat Skewer: Increases your Attack Speed by 10%. Lasts 1 hour."
ASK	OXQUIZ	O	"Barbecue: Recovers 160 HP."
ASK	OXQUIZ	X	"Seafood Pan Cake: Increases your movement speed by up to 30% for 3 minutes."
ASK	OXQUIZ	O	"Fish Soup: Recovers 300 HP."
ASK	OXQUIZ	X	"Sausage Casserole: Helps to transform Eggs into D grade pets."
ASK	OXQUIZ	O	"Fish Stew: Recovers 514 HP."
ASK	OXQUIZ	X	"Steamed Seafood: Increases PvE Damage based on the achieved couple level."
ASK	OXQUIZ	O	"Meat Salad: Recovers 860 HP."
ASK	OXQUIZ	X	"Gratin: Increases STR. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Seafood Pizza: Recovers 1313 HP."
ASK	OXQUIZ	X	"Orange Juice: Items to help you upgrade!."
ASK	OXQUIZ	O	"Strawberry Shake: Recovers 110 HP."
ASK	OXQUIZ	X	"Pineapple Cone: Increases Attack Power. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Banana Jujubar: Recovers 210 HP."
ASK	OXQUIZ	X	"Fruit Juice: Removes awakenings on Weapons, Armor, or Shields. Once removed, a new awakening can be applied."
ASK	OXQUIZ	O	"Fruit Icewater: Recovers 334 HP."
ASK	OXQUIZ	X	"Fruit Parfait: MP 150 Recovery."
ASK	OXQUIZ	O	"Fruit Sherbet: Recovers 508 HP."
ASK	OXQUIZ	X	"Icecream Cake: Increases Critical Rate by 5 for a short time."
ASK	OXQUIZ	O	"Fruit Punch: Recovers 714 HP."
ASK	OXQUIZ	X	"Gray Pill: Increases speed by 20% for 3 minutes."
ASK	OXQUIZ	O	"Yellow Pill: Recover 1200 HP."
ASK	OXQUIZ	X	"Blue Pill: Stunning Pink Balloons that increase your Attack Power (ATK) by +50. Lasts 2 days."
ASK	OXQUIZ	O	"Red Pill: Recovers 4000 HP."
ASK	OXQUIZ	X	"Gold Pill: Gives user +200 Max HP for 5 days."
ASK	OXQUIZ	O	"Mysterious Pill: Recovers HP by 12,000."
ASK	OXQUIZ	X	"Hot Ddukguk: Increases your Strength (STR) by +10. Lasts 1 hour."
ASK	OXQUIZ	O	"Fresh Ddukguk: Recovers 9999 FP."
ASK	OXQUIZ	X	"Sweet Ddukguk: MP 200 Recovery."
ASK	OXQUIZ	O	"Battery: 30 minute battery for the Collector."
ASK	OXQUIZ	X	"Return: Recovers 2000 HP."
ASK	OXQUIZ	O	"Bull Hamstern: Provides STA +20 for 1 hour."
ASK	OXQUIZ	X	"King Card: Increases STA by 3 for a short time."
ASK	OXQUIZ	O	"Queen Card: Provides Magic Power +50, INT +13 for 1 hour."
ASK	OXQUIZ	X	"Jack Card: Increases your Dexterity (DEX) by +10. Lasts 1 hour."
ASK	OXQUIZ	O	"Ace Card: Provides Critical Damage +10%, DEX +13 for 1 hour."
ASK	OXQUIZ	X	"Grilled Eel: Increases your Attack Power by 200 for 1 hour."
ASK	OXQUIZ	O	"Firea Stone: Magic Stone that adds 20% Fire Attack."
ASK	OXQUIZ	X	"Wateil Stone: Increases STR by 3 for a short time."
ASK	OXQUIZ	O	"Windyo Stone: Magic Stone that adds 20% Wind Attack."
ASK	OXQUIZ	X	"Lightine Stone: Recovers 330 HP."
ASK	OXQUIZ	O	"Earthy Stone: Magic Stone that adds 20% Earth Attack."
ASK	OXQUIZ	X	"Def-Firea Stone: Increases STR by 3 for a short time."
ASK	OXQUIZ	O	"Def-Wateil Stone: Magic Stone that adds 20% Water Defense."
ASK	OXQUIZ	X	"Def-Windyo Stone: This tastey little treat will increase your INT by 5 for 3 minutes."
ASK	OXQUIZ	O	"Def-Lightine Stone: Magic Stone that adds 20% Electric Defense."
ASK	OXQUIZ	X	"Def-Earthy Stone: Recovers 330 HP."
ASK	OXQUIZ	O	"Scroll of Holy: Recovers Condition."
ASK	OXQUIZ	X	"Scroll of Forgive: Recovers 160 HP."
ASK	OXQUIZ	O	"Scroll of Selected Party: Upgrade Party Level to 40."
ASK	OXQUIZ	X	"Scroll of Velocity: Provides Magic Power +50, INT +13 for 1 hour."
ASK	OXQUIZ	O	"Pumpkin Soup: +50% Max. FP."
ASK	OXQUIZ	X	"Uriel Cold noodle: FP Recovery per second x2 FP Recovery per Second (For a limited time)."
ASK	OXQUIZ	X	"Gloves of Cheering: Increases every character stat by up to 5 for 3 minutes."
ASK	OXQUIZ	O	"Scroll of Smelting: +10% Upgrade success rate."
ASK	OXQUIZ	O	"Shout of Blood: x2 HP Recovery per Second (For a limited time)."
ASK	OXQUIZ	X	"Swirl of Soul: Increases STA. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Pain of Patience: FP Recovery per second x2 FP Recovery per Second (For a limited time)."
ASK	OXQUIZ	X	"Scroll of Amplification DR: Recovers 334 HP."
ASK	OXQUIZ	O	"Def-Upcut Stone: Adds 20% Defense."
ASK	OXQUIZ	X	"Instructor of Skill: Decreases your Casting Time by 5% for 5 minutes."
ASK	OXQUIZ	O	"Scroll of Custody: Summon Banker for 3 Min."
ASK	OXQUIZ	X	"Blessing of Party Leader: Increases Evasion Rate by 5 for a short time."
ASK	OXQUIZ	O	"Summon of Party Leader: Summons Party members to the Party Leader (Only Party Leader can use)."
ASK	OXQUIZ	X	"Teleport Pass: Increases your Maximum MP amount by 10%. Lasts 1 hour."
ASK	OXQUIZ	O	"Potion of Recklessness: Increases your Critical Hit Rate by 10%. Lasts 1 hour."
ASK	OXQUIZ	X	"Potion of Swiftness: Gather 10 of these to get a Sunstone from Collins."
ASK	OXQUIZ	O	"Potion of Accuracy: Increases your Hit Rate by 10%. Lasts 1 hour."
ASK	OXQUIZ	X	"Potion of Clarity: Recover 975 HP."
ASK	OXQUIZ	O	"Elixir of the Tiger: Increases your Strength (STR) by +10. Lasts 1 hour."
ASK	OXQUIZ	X	"Elixir of the Rabbit: Recovers Condition."
ASK	OXQUIZ	O	"Elixir of the Fox: Increases your Intellect (INT) by +10. Lasts 1 hour."
ASK	OXQUIZ	O	"Elixir of Stone: Increases your Defense (DEF) by +100. Lasts 1 hour."
ASK	OXQUIZ	X	"Elixir of Anti-Magic: Recovers 8000 HP."
ASK	OXQUIZ	O	"Elixir of Flowing Thought: Increases your Maximum MP amount by 10%. Lasts 1 hour."
ASK	OXQUIZ	X	"Elixir of the Sorceror: A roll that can make your wishes come true, assuming your wishing for 2000 HP."
ASK	OXQUIZ	O	"Elixir of Evasion: Increases your Parry Rate by 10%. Lasts 1 hour."
ASK	OXQUIZ	X	"Flask of the Tiger: That is some high quality H20!."
ASK	OXQUIZ	O	"Flask of the Rabbit: Increases your Dexterity (DEX) by +20. Lasts 1 hour."
ASK	OXQUIZ	X	"Flask of the Fox: Magic Stone that adds 20% Wind Attack."
ASK	OXQUIZ	O	"Flask of the Lion: Increases your Stamina (STA) by +20. Lasts 1 hour."
ASK	OXQUIZ	X	"Flask of Stone: Items to help you upgrade!."
ASK	OXQUIZ	O	"Blinkwing of Flaris: Teleport to Flaris."
ASK	OXQUIZ	X	"Blinkwing of Saint Morning: Increases PvE Damage based on the achieved couple level."
ASK	OXQUIZ	O	"Town Blinkwing: Teleport to the nearest town."
ASK	OXQUIZ	X	"Blinkwing of Darkon: Increases INT by 3 for a short time."
ASK	OXQUIZ	O	"Blinkwing of Dekane: Teleport to the Dekane Mines."
ASK	OXQUIZ	X	"Blinkwing of Mars: A natural herb used to ease pain, restore health, and increase appetite."
ASK	OXQUIZ	O	"Blinkwing of Volkane: Teleport to Volkane."
ASK	OXQUIZ	O	"Earring of Heren: The magic earring of Heren the Blade hero. It increases attack speed."
ASK	OXQUIZ	O	"Red Angel: EXP should be gained as much as 100% of the EXP of its character based on the level."
ASK	OXQUIZ	X	"Blue Angel: MP 250 Recovery."
ASK	OXQUIZ	O	"Green Angel: EXP should be gained as much as 30% of the EXP of its character based on the level."
ASK	OXQUIZ	X	"White Angel: That is some high quality H20!."
ASK	OXQUIZ	X	"Milk Chocolate: Increases Max MP. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Pink Balloons: Stunning Pink Balloons that increase your Attack Power (ATK) by +50. Lasts 2 days."
ASK	OXQUIZ	X	"Blue Balloons: Increases your HP by +20% and ATT +5% for 60 min."
ASK	OXQUIZ	O	"Yellow Balloons: Pretty Yellow Balloons that increase your Health Points (HP) by +150. Lasts 2 days."
ASK	OXQUIZ	X	"White Tiger Cage: Teleport to the Mars Dungeon."
ASK	OXQUIZ	O	"Babari Lion Cage: Good thing these Lions come with courage! Lions will increase your STA."
ASK	OXQUIZ	X	"Unicorn Corral: MP Recovery per second x2 HP Recovery per Second (For a limited time)."
ASK	OXQUIZ	O	"Old Fox Cage: A fox is a wolf who sends flowers. Foxes will increase your INT."
ASK	OXQUIZ	X	"Baby Griffin Cage: Increases your Defense (DEF) by +100. Lasts 1 hour."
ASK	OXQUIZ	O	"Scroll of Pet Recovery: Increases the life of a raised pet by 1."
ASK	OXQUIZ	X	"Pet Feed: Recovers HP by 12,000."
ASK	OXQUIZ	O	"Sunstone Piece: Gather 10 of these to get a Sunstone from Collins."
ASK	OXQUIZ	X	"Moonstone Piece: Increases your Max HP by +300 for 30 min."
ASK	OXQUIZ	O	"Topaz Piece: Gather 10 of these to get a Topaz from Collins."
ASK	OXQUIZ	X	"Ruby Piece: Increases your Dexterity (DEX) by +5 for 5 minutes."
ASK	OXQUIZ	O	"Sapphire Piece: Gather 10 of these to get a Sapphire from Collins."
ASK	OXQUIZ	X	"Emerald Piece: Increases INT. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Diamond Piece: Gather 10 of these to get a Diamond from Collins."
ASK	OXQUIZ	X	"Purple Cotton Candy: Recover 1200 HP."
ASK	OXQUIZ	O	"Blue Cotton Candy: Increases INT by 3 for a short time."
ASK	OXQUIZ	X	"Green Cotton Candy: Recover 975 HP."
ASK	OXQUIZ	O	"Red Cotton Candy: Increases STR by 3 for a short time."
ASK	OXQUIZ	X	"Sky-Blue Cotton Candy: A reusable pass that opens the teleport destination list from anywhere. Never consumed."
ASK	OXQUIZ	O	"Pink Cotton Candy: Increases Critical Rate by 5 for a short time."
ASK	OXQUIZ	X	"Yellow Cotton Candy: Stunning Pink Balloons that increase your Attack Power (ATK) by +50. Lasts 2 days."
ASK	OXQUIZ	O	"White Cotton Candy: Decreases Cast Time by 5 for a short time."
ASK	OXQUIZ	X	"Gray Cotton Candy: Recovers 429 HP."
ASK	OXQUIZ	O	"Orange Cotton Candy: Increases Hit Rate by 5 for a short time."
ASK	OXQUIZ	X	"Upgrading Set: Recovers 230 HP."
ASK	OXQUIZ	O	"Cooked Corn: Increases every stat by 2 for 3 minutes."
ASK	OXQUIZ	X	"Cooked Octopus: The magic earring of Heren the Blade hero. It increases attack speed."
ASK	OXQUIZ	O	"Voter's Buff: This is a special buff for voters. Increases Experience and Item Drops by 5%."
ASK	OXQUIZ	X	"Red Candle: Increases your Magic Attack bonus by +20. Lasts 1 hour."
ASK	OXQUIZ	O	"Charm: A strange charm. The Mysterious Teller of Tales might be able to use it to remove a curse!."
ASK	OXQUIZ	X	"Sugar Boost: Gives the character 1 cheer point and makes it possible to cheer yourself (for a limited time)."
ASK	OXQUIZ	O	"Flash Charm: Increases your movement speed by up to 30% for 3 minutes."
ASK	OXQUIZ	X	"FLY: Summon Banker for 3 Min."
ASK	OXQUIZ	O	"FOR: Increases your Defense Power by 150 for one hour."
ASK	OXQUIZ	X	"FUN: Recovers HP by 12,000."
ASK	OXQUIZ	X	"Miracle of Love: Magic Stone that adds 20% Water Defense."
ASK	OXQUIZ	X	"Wish Roll: Teleport to Flaris."
ASK	OXQUIZ	X	"Love Chocolate: Recovers 160 HP."
ASK	OXQUIZ	O	"Herb of Life: A natural herb used to ease pain, restore health, and increase appetite."
ASK	OXQUIZ	X	"Tofu Salad: RestoredBartholomew Hunt's diary."
ASK	OXQUIZ	O	"Blinkwing of Shaduwar: Teleport to Shaduwar."
ASK	OXQUIZ	X	"Scroll of Sprint: Magic Stone that adds 20% Fire Attack."
ASK	OXQUIZ	O	"Japan Easter Balloon: Gives user +200 Max HP for 5 days."
ASK	OXQUIZ	X	"Philippines Easter Balloon: Recovers 429 HP."
ASK	OXQUIZ	O	"Vietnam Easter Balloon: Gives user +200 Max HP for 5 days."
ASK	OXQUIZ	X	"Chile Easter Balloon: Increase your Critical Hit Chance by 5% for 5 minutes."
ASK	OXQUIZ	O	"Red Gumball: This tastey little treat will increase your STR by 5 for 3 minutes."
ASK	OXQUIZ	X	"Blue Gumball: Increases DEX. (Can be upgraded with a Moonstone up to level 20)."
ASK	OXQUIZ	O	"Yellow Gumball: This tastey little treat will increase your DEX by 5 for 3 minutes."
ASK	OXQUIZ	X	"Water: Recovers 200 HP."
ASK	OXQUIZ	O	"Christmas Cake: This isn't your typical Holiday Fruit Cake! Increases Attack Power by 10%. Lasts 20 minutes."
ASK	OXQUIZ	O	"Bronze Package: Package including Feed Bag (6hours), Chance of the Pet Tamer."
ASK	OXQUIZ	X	"MVP Blessing: Good thing these Lions come with courage! Lions will increase your STA."
ASK	OXQUIZ	X	"Three-Leaf Clover: Recovers 260 HP."
ASK	OXQUIZ	O	"Easter Egg: Collect 100 of these and turn them into the Egg Decorator to get a Festive Easter Egg Basket."
ASK	OXQUIZ	X	"Purple Egg: Recovers 975 HP."
ASK	OXQUIZ	O	"Green Egg: Increases your Intelligence (INT) by +5 for 5 minutes."
ASK	OXQUIZ	X	"Blue Egg: Recovers 4000 HP."
ASK	OXQUIZ	O	"Red Egg: Increases your Strength (STR) by +5 for 5 minutes."
ASK	OXQUIZ	X	"Sky Blue Egg: Recovers 2000 HP."
ASK	OXQUIZ	O	"Pink Egg: Increase your Critical Hit Chance by 5% for 5 minutes."
ASK	OXQUIZ	X	"Yellow Egg: A fox is a wolf who sends flowers. Foxes will increase your INT."
ASK	OXQUIZ	O	"White Egg: Decreases your Casting Time by 5% for 5 minutes."
ASK	OXQUIZ	X	"Gray Egg: Teleport to the nearest town."
ASK	OXQUIZ	O	"Orange Egg: Increases your Chance to Hit by 5% for 5 minutes."
ASK	OXQUIZ	X	"Pink Soccer Ball: Pretty Yellow Balloons that increase your Health Points (HP) by +150. Lasts 2 days."
ASK	OXQUIZ	O	"Black Soccer Ball: Increases your Defence by +200 for 30 min."
ASK	OXQUIZ	X	"Blue Soccer Ball: Summons Party members to the Party Leader (Only Party Leader can use)."
ASK	OXQUIZ	O	"Pride of Victory: Increases your HP by +20% and ATT +5% for 60 min."
ASK	OXQUIZ	X	"Restored Diary: Increase your Critical Hit Chance by 5% for 5 minutes."
ASK	OXQUIZ	O	"Egg Booster: Helps to transform Eggs into D grade pets."
ASK	OXQUIZ	O	"Baruna Oblivion: This item removes the awakening on your Baruna equipment."
ASK	OXQUIZ	X	"Flame Ove: Recovers 110 HP."
ASK	OXQUIZ	O	"Dessert Ove: This Ove provides a Land Element to your Baruna item. Baruna Element levels range from 1~20."
ASK	OXQUIZ	X	"River Ove: Increases your Dexterity (DEX) by +5 for 5 minutes."
ASK	OXQUIZ	O	"Cyclone Ove: This Ove provides a Wind Element to your Baruna item. Baruna Element levels range from 1~20."



//////////////////////////////////////////////////////////////////////
// Lucky Draw
//////////////////////////////////////////////////////////////////////
EVENT	LUCKYDRAW	MIN_LEVEL 120	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 10	ROUND_TIME 15	SCORE_TIME 5
POINTS	LUCKYDRAW	15 12 10 8 7 6 5 4 3 2	1

RANK	LUCKYDRAW	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	LUCKYDRAW	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	LUCKYDRAW	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	LUCKYDRAW	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	LUCKYDRAW	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	LUCKYDRAW	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	LUCKYDRAW	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	LUCKYDRAW	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	LUCKYDRAW	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	LUCKYDRAW	10	II_SYS_SYS_EVENT_TOKEN	5
REST	LUCKYDRAW	II_SYS_SYS_EVENT_TOKEN	2

//////////////////////////////////////////////////////////////////////
// Turn-in Race (TURNIN) - IN_RANDOM 0 until the RECIPE list is reviewed
//////////////////////////////////////////////////////////////////////
EVENT	TURNIN	MIN_LEVEL 60	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 3	ROUND_TIME 600	SCORE_TIME 10	END_AT 10	IN_RANDOM 0
POINTS	TURNIN	15 12 10 8 7 6 5 4 3 2	1

RANK	TURNIN	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	TURNIN	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	TURNIN	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	TURNIN	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	TURNIN	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	TURNIN	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	TURNIN	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	TURNIN	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	TURNIN	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	TURNIN	10	II_SYS_SYS_EVENT_TOKEN	5
REST	TURNIN	II_SYS_SYS_EVENT_TOKEN	2

// Turn-in Race recipes: generated by tools/minievent/build_turnin.py (68), reviewed by hand
RECIPE	"Small Garbagepider and Supplies"	2	II_GEN_GEM_GEM_GARBAGETON 20 II_GEN_FOO_INS_BISCUIT 30	// 20 Garbageton, 30 Biscuit
RECIPE	"Small Kern Hunt"	1	II_GEN_GEM_GEM_RNAMOND 30	// 30 Rnamond
RECIPE	"Brown Bolo and Stale Mr. Pumpkin"	2	II_GEN_GEM_GEM_NECKLACE 20 II_GEN_GEM_GEM_FURIOUSMATCH 20	// 20 Bolo Necklace, 20 Furious Match
RECIPE	"Small Wagsaac and Supplies"	2	II_GEN_GEM_GEM_BLUEHONEY 20 II_GEN_POT_DRI_VITAL100 50	// 20 Blue Honey, 50 VitalDrink 100
RECIPE	"Small Crane Machinery Hunt"	1	II_GEN_GEM_GEM_ERONIOR 50	// 50 Eronior
RECIPE	"1st Class Fefern and Small Luia"	2	II_GEN_GEM_GEM_TARINROOT 20 II_GEN_GEM_GEM_LUCHEST 20	// 20 Tarin Root, 20 Luchest
RECIPE	"Small Risem Hunt"	1	II_GEN_GEM_GEM_ZEMMARK 50	// 50 Zem Mark
RECIPE	"Small Carrierbomb and Small Giggle Box"	2	II_GEN_GEM_GEM_BOMBTIMER 20 II_GEN_GEM_GEM_GIGGLANDE 20	// 20 Bomb Timer, 20 Gigglande
RECIPE	"Driller and Supplies"	2	II_GEN_GEM_GEM_DROIL 30 II_GEN_FOO_INS_STARCANDY 30	// 30 Droil, 30 Star Candy
RECIPE	"Lazy Araknoid and Supplies"	2	II_GEN_GEM_GEM_FLOWER 20 II_GEN_FOO_INS_CHICKENSTICK 30	// 20 Araknoid Flower, 30 Chicken Stick
RECIPE	"Small Gongury Expedition"	3	II_ARM_M_MAG_GAUNTLET0401 1 II_GEN_GEM_GEM_ERONSIMINT 20 II_GEN_REF_REF_FIRST 20	// 1 Ditch Gauntlet, 20 Eronsimint, 20 First Refresher
RECIPE	"Bang and Small Tombstone Bearer"	2	II_GEN_GEM_GEM_GOLDENWING 20 II_GEN_GEM_GEM_TOMBMARBLE 20	// 20 Golden Wing, 20 Tomb Marble
RECIPE	"Specialist Bearnerky Hunt"	1	II_GEN_GEM_GEM_BEARMANE 50	// 50 Nerkymane
RECIPE	"Small Flybat Hunt"	1	II_GEN_GEM_GEM_BATHOOK 50	// 50 Flyclaw
RECIPE	"Small Leyena and Supplies"	2	II_GEN_GEM_GEM_TOMA 30 II_GEN_REF_REF_FIFTH 20	// 30 Toma, 20 Fifth Refresher
RECIPE	"Small Antiquery and Red Mantis C"	2	II_GEN_GEM_GEM_ROOTIOE 20 II_GEN_GEM_GEM_CARDRIN 20	// 20 Rootioe, 20 Cardrin
RECIPE	"Small Club-tailed Reptilion Expedition"	3	II_WEA_KNU_TALIN 1 II_GEN_GEM_GEM_DOGTOOTH 20 II_GEN_FOO_PIL_RED 20	// 1 Talin Knuckle, 20 Reptilion Tooth, 20 Red Pill
RECIPE	"Small Doridoma and Supplies"	2	II_GEN_GEM_GEM_POPORAM 20 II_GEN_REF_REF_FIFTH 30	// 20 Poporam, 30 Fifth Refresher
RECIPE	"Small Nutty Wheel Expedition"	3	II_ARM_F_ACR_GAUNTLET0301 1 II_GEN_GEM_GEM_WHEESHOE 20 II_GEN_FOO_INS_CHICKENSTICK 20	// 1 Phiatoic Gauntlet, 20 Wheeshoe, 20 Chicken Stick
RECIPE	"Small Luia Expedition"	3	II_ARM_M_JST_HELMET08 1 II_GEN_GEM_GEM_LUCHEST 20 II_GEN_FOO_INS_HOTDOG 20	// 1 Decasron Helmet, 20 Luchest, 20 Hot Dog
RECIPE	"Grrr and Supplies"	2	II_GEN_GEM_GEM_GRBANDAGE 30 II_GEN_REF_REF_FIRST 20	// 30 Grrr Bandage, 20 First Refresher
RECIPE	"Red Mantis C and Supplies"	2	II_GEN_GEM_GEM_CARDRIN 20 II_GEN_FOO_PIL_YELLOW 30	// 20 Cardrin, 30 Yellow Pill
RECIPE	"Small Boo Expedition"	3	II_ARM_M_MAG_HELMET06 1 II_GEN_GEM_GEM_BOOPOSN 20 II_GEN_REF_REF_FIRST 20	// 1 Props Helmet, 20 Boopoison, 20 First Refresher
RECIPE	"Small Trangfoma and Supplies"	2	II_GEN_GEM_GEM_RANGLASS 30 II_GEN_FOO_PIL_BLUE 30	// 30 Trangoggle, 30 Blue Pill
RECIPE	"Rough Wheelem and Supplies"	2	II_GEN_GEM_GEM_GOLDENCUP 30 II_GEN_FOO_PIL_YELLOW 50	// 30 Golden Cup, 50 Yellow Pill
RECIPE	"Small Shuhamma Hunt"	1	II_GEN_GEM_GEM_HAMMAMER 50	// 50 Hammamer
RECIPE	"Small Tombstone Bearer and Supplies"	2	II_GEN_GEM_GEM_TOMBMARBLE 20 II_GEN_FOO_PIL_SINBI 30	// 20 Tomb Marble, 30 Mysterious Pill
RECIPE	"Small Watangka and Supplies"	2	II_GEN_GEM_GEM_TANGKASK 20 II_GEN_FOO_INS_BREAD 20	// 20 Tangkask, 20 Roll Bread
RECIPE	"Small Mage Prankster and Supplies"	2	II_GEN_GEM_GEM_ORBRIN 30 II_GEN_FOO_PIL_SINBI 30	// 30 Orbrin, 30 Mysterious Pill
RECIPE	"3rd Chef Muffrin Hunt"	1	II_GEN_GEM_GEM_CRUETMUF 40	// 40 Rincruet
RECIPE	"Small Burudeng Expedition"	3	II_ARM_M_KIN_GAUNTLET02 1 II_GEN_GEM_GEM_PALIN 20 II_GEN_FOO_PIL_SINBI 20	// 1 Keimay Gauntlet, 20 Palin, 20 Mysterious Pill
RECIPE	"Small Aibatt and Supplies"	2	II_GEN_GEM_GEM_TWINKLESTONE 30 II_GEN_POT_DRI_VITAL500 30	// 30 Twinkle Stone, 30 VitalDrink 500
RECIPE	"Small Mushpoie and Small Jack the Hammer"	2	II_GEN_GEM_GEM_POIESPORE 20 II_GEN_GEM_GEM_HAMMARBLE 20	// 20 Poiespore, 20 Hammarble
RECIPE	"Urchin Demian and 1st Class Fefern"	2	II_GEN_GEM_GEM_MOP 20 II_GEN_GEM_GEM_TARINROOT 20	// 20 Teddy Bear, 20 Tarin Root
RECIPE	"Small Peakyturtle and Supplies"	2	II_GEN_GEM_GEM_PEAKYRIND 30 II_GEN_POT_DRI_VITAL100 30	// 30 Peakyrind, 30 VitalDrink 100
RECIPE	"Small Nuctuvehicle Hunt"	1	II_GEN_GEM_GEM_NUCTUWHEEL 40	// 40 Nuctu-Wheel
RECIPE	"Small Volt Hunt"	1	II_GEN_GEM_GEM_AMPERE 50	// 50 Ampere
RECIPE	"Small Bucrow and Supplies"	2	II_GEN_GEM_GEM_BUCORONG 30 II_GEN_REF_REF_FIFTH 30	// 30 Bucring, 30 Fifth Refresher
RECIPE	"Battle Toadrin Expedition"	3	II_ARM_M_RAG_GAUNTLET04 1 II_GEN_GEM_GEM_POISONBAG 20 II_GEN_REF_REF_SECOND 20	// 1 Geiler Gauntlet, 20 Poison Bag, 20 Second Refresher
RECIPE	"Small Elderguard Hunt"	1	II_GEN_GEM_GEM_GUARDIEYE 30	// 30 Guardieye
RECIPE	"Small Mushpang and Supplies"	2	II_GEN_GEM_GEM_FORFORM 30 II_GEN_POT_DRI_VITAL100 20	// 30 Forform, 20 VitalDrink 100
RECIPE	"Dump and Supplies"	2	II_GEN_GEM_GEM_DUMPTIRE 30 II_GEN_REF_REF_THIRD 50	// 30 Dumptire, 50 Third Refresher
RECIPE	"Small Pukepuke and Small Wagsaac"	2	II_GEN_GEM_GEM_CHUPIM 20 II_GEN_GEM_GEM_BLUEHONEY 20	// 20 Chupim, 20 Blue Honey
RECIPE	"Small Glaphan Expedition"	3	II_ARM_M_MAG_GAUNTLET0301 1 II_GEN_GEM_GEM_PHANBUBLE 20 II_GEN_FOO_INS_KIMBAP 20	// 1 Coring Gauntlet, 20 Phanbubble, 20 Kimbap
RECIPE	"Small Nautrepy Expedition"	3	II_ARM_M_ASS_GAUNTLET06 1 II_GEN_GEM_GEM_REPYGLE 20 II_GEN_FOO_PIL_RED 20	// 1 Saturn Gauntlet, 20 Repygle, 20 Red Pill
RECIPE	"Small Hobo and 3rd Chef Muffrin"	2	II_GEN_GEM_GEM_BOBAND 20 II_GEN_GEM_GEM_CRUETMUF 20	// 20 Boband, 20 Rincruet
RECIPE	"Small Greemong and Small Gongury"	2	II_GEN_GEM_GEM_MONGTEAR 20 II_GEN_GEM_GEM_ERONSIMINT 20	// 20 Mong Tear, 20 Eronsimint
RECIPE	"Small Scorpicon and Supplies"	2	II_GEN_GEM_GEM_SCOTOOTH 30 II_GEN_REF_REF_THIRD 30	// 30 Scoptooth, 30 Third Refresher
RECIPE	"Phantom Basque and Supplies"	2	II_GEN_GEM_GEM_GOLDENFIST 20 II_GEN_REF_REF_SECOND 30	// 20 Golden Fist, 30 Second Refresher
RECIPE	"Small Totemia Hunt"	1	II_GEN_GEM_GEM_KALIN 40	// 40 Kalin
RECIPE	"Small Jack the Hammer and Supplies"	2	II_GEN_GEM_GEM_HAMMARBLE 20 II_GEN_POT_DRI_VITAL300 30	// 20 Hammarble, 30 VitalDrink 300
RECIPE	"Maid Cardpuppet and Supplies"	2	II_GEN_GEM_GEM_CLOCKHEART 20 II_GEN_FOO_PIL_SINBI 30	// 20 Clock Heart, 30 Mysterious Pill
RECIPE	"Small Rock Muscle Hunt"	1	II_GEN_GEM_GEM_MOONSTONE 30	// 30 Crescent Stone
RECIPE	"Stale Mr. Pumpkin and Supplies"	2	II_GEN_GEM_GEM_FURIOUSMATCH 30 II_GEN_FOO_PIL_RED 50	// 30 Furious Match, 50 Red Pill
RECIPE	"Pawn Popcrank Hunt"	1	II_GEN_GEM_GEM_SHIFTPOP 30	// 30 Popshift
RECIPE	"Small Zombiger Hunt"	1	II_GEN_GEM_GEM_ZOMBYHOE 50	// 50 Zombyhoe
RECIPE	"Small Hoppre and Small Glaphan"	2	II_GEN_GEM_GEM_PREWING 20 II_GEN_GEM_GEM_PHANBUBLE 20	// 20 Prewing, 20 Phanbubble
RECIPE	"Small Steam Walker and Supplies"	2	II_GEN_GEM_GEM_STEAMTEAR 20 II_GEN_POT_DRI_VITAL200 30	// 20 Steam Tear, 30 VitalDrink 200
RECIPE	"Young Syliaca Expedition"	3	II_ARM_F_ASS_SUIT0401 1 II_GEN_GEM_GEM_SYCALE 20 II_GEN_REF_REF_FIFTH 20	// 1 Lily Suit, 20 Sycale, 20 Fifth Refresher
RECIPE	"Small Steel Knight and Supplies"	2	II_GEN_GEM_GEM_KNIGHTLER 30 II_GEN_REF_REF_THIRD 50	// 30 Knightler, 50 Third Refresher
RECIPE	"Small Iren Hunt"	1	II_GEN_GEM_GEM_RENYKEN 40	// 40 Renyken
RECIPE	"Cute Nyangnyang and Supplies"	2	II_GEN_GEM_GEM_STARSTONE 30 II_GEN_FOO_PIL_YELLOW 30	// 30 Star Stone, 30 Yellow Pill
RECIPE	"Brigadier Chimeradon and Supplies"	2	II_GEN_GEM_GEM_HOOKKIMERA 20 II_GEN_FOO_INS_BREAD 50	// 20 Merahook, 50 Roll Bread
RECIPE	"Small Dumb Bull Hunt"	1	II_GEN_GEM_GEM_DUMBLING 40	// 40 Dumbling
RECIPE	"Small Giggle Box Hunt"	1	II_GEN_GEM_GEM_GIGGLANDE 50	// 50 Gigglande
RECIPE	"Lawolf and Supplies"	2	II_GEN_GEM_GEM_SLAIN 20 II_GEN_FOO_PIL_GOLD 50	// 20 Fangs, 50 Gold Pill
RECIPE	"Troglodon Clansman Hunt"	1	II_GEN_GEM_GEM_BLAD 50	// 50 Troglodon Sword
RECIPE	"Small Mia Expedition"	3	II_ARM_F_BLA_SUIT08 1 II_GEN_GEM_GEM_MIADOLL 20 II_GEN_FOO_INS_CHICKENSTICK 20	// 1 Huaris Suit, 20 Mia Doll, 20 Chicken Stick

// Turn-in Race: where to get each item (up to 100 letters), shown under the item
ITEM_HINT	II_GEN_GEM_GEM_GARBAGETON	"Drop: Garbagepider - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_FOO_INS_BISCUIT	"Shop: Losha - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_RNAMOND	"Drop: Kern - Magmient (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_NECKLACE	"Drop: Brown Bolo - Fallen Leaf Camp (Shaduwar)"
ITEM_HINT	II_GEN_GEM_GEM_FURIOUSMATCH	"Drop: Mr. Pumpkin - The Home of Mr. Pumpkin. (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_BLUEHONEY	"Drop: Small Wagsaac - Northern Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_POT_DRI_VITAL100	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_ERONIOR	"Drop: Small Crane Machinery - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_GEM_GEM_TARINROOT	"Drop: 1st Class Fefern - Haunt of Nyangnyang (Flaris)"
ITEM_HINT	II_GEN_GEM_GEM_LUCHEST	"Drop: Small Luia - Magmient (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_ZEMMARK	"Drop: Small Risem - Eienble Cave (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_BOMBTIMER	"Drop: Small Carrierbomb - Eienble Cave (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_GIGGLANDE	"Drop: Small Giggle Box - Hill of Shade (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_DROIL	"Drop: Driller - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_FOO_INS_STARCANDY	"Shop: Losha - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_FLOWER	"Drop: Lazy Araknoid - Fallen Leaf Camp (Shaduwar)"
ITEM_HINT	II_GEN_FOO_INS_CHICKENSTICK	"Shop: Losha - Flaris"
ITEM_HINT	II_ARM_M_MAG_GAUNTLET0401	"Shop: Phacham - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_ERONSIMINT	"Drop: Small Gongury - Brekin (Darkon 3)"
ITEM_HINT	II_GEN_REF_REF_FIRST	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_GOLDENWING	"Drop: Bang - Saint Morning"
ITEM_HINT	II_GEN_GEM_GEM_TOMBMARBLE	"Drop: Small Tombstone Bearer - The Garden of Rhisis (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_BEARMANE	"Drop: Specialist Bearnerky - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_BATHOOK	"Drop: Small Flybat - Northern Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_TOMA	"Drop: Small Leyena - Khipra (Flaris)"
ITEM_HINT	II_GEN_REF_REF_FIFTH	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_ROOTIOE	"Drop: Small Antiquery - Aniceknight (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_CARDRIN	"Drop: Red Mantis C - Hill of Shade (Saint Morning)"
ITEM_HINT	II_WEA_KNU_TALIN	"Shop: Bulrox - Saint Morning"
ITEM_HINT	II_GEN_GEM_GEM_DOGTOOTH	"Drop: Small Club-tailed Reptilion - Fallen Leaf Camp (Shaduwar)"
ITEM_HINT	II_GEN_FOO_PIL_RED	"Shop: Achaben - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_POPORAM	"Drop: Small Doridoma - Plain of Bubble (Flaris)"
ITEM_HINT	II_ARM_F_ACR_GAUNTLET0301	"Shop: Martin - Saint Morning"
ITEM_HINT	II_GEN_GEM_GEM_WHEESHOE	"Drop: Small Nutty Wheel - Erons Factory 2 (Darkon 1)"
ITEM_HINT	II_ARM_M_JST_HELMET08	"Shop: Haven - Darkon"
ITEM_HINT	II_GEN_FOO_INS_HOTDOG	"Shop: Losha - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_GRBANDAGE	"Drop: Grrr - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_FOO_PIL_YELLOW	"Shop: Bill - Saint Morning"
ITEM_HINT	II_ARM_M_MAG_HELMET06	"Shop: Phacham - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_BOOPOSN	"Drop: Small Boo - Arians (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_RANGLASS	"Drop: Small Trangfoma - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_FOO_PIL_BLUE	"Shop: Bill - Saint Morning"
ITEM_HINT	II_GEN_GEM_GEM_GOLDENCUP	"Drop: Rough Wheelem - The Garden of Rhisis (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_HAMMAMER	"Drop: Small Shuhamma - Brekin (Darkon 3)"
ITEM_HINT	II_GEN_FOO_PIL_SINBI	"Shop: Ciel - Madrigal"
ITEM_HINT	II_GEN_GEM_GEM_TANGKASK	"Drop: Small Watangka - Aniceknight (Darkon 3)"
ITEM_HINT	II_GEN_FOO_INS_BREAD	"Shop: Losha - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_ORBRIN	"Drop: Small Mage Prankster - The Garden of Rhisis (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_CRUETMUF	"Drop: 3rd Chef Muffrin - Deadwallderness (Darkon 2)"
ITEM_HINT	II_ARM_M_KIN_GAUNTLET02	"Shop: Haven - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_PALIN	"Drop: Small Burudeng - Plain of Bubble (Flaris)"
ITEM_HINT	II_GEN_GEM_GEM_TWINKLESTONE	"Drop: Small Aibatt - The South of Leren Mountains (Flaris)"
ITEM_HINT	II_GEN_POT_DRI_VITAL500	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_POIESPORE	"Drop: Small Mushpoie - Western Cendil (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_HAMMARBLE	"Drop: Jack the Hammer - Hill of Shade (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_MOP	"Drop: Urchin Demian - Madren Town (Flaris)"
ITEM_HINT	II_GEN_GEM_GEM_PEAKYRIND	"Drop: Small Peakyturtle - Plain of Bubble (Flaris)"
ITEM_HINT	II_GEN_GEM_GEM_NUCTUWHEEL	"Drop: Small Nuctuvehicle - Eienble Cave (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_AMPERE	"Drop: Small Volt - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_GEM_GEM_BUCORONG	"Drop: Small Bucrow - Southern Hillid Mountains (Saint Morning)"
ITEM_HINT	II_ARM_M_RAG_GAUNTLET04	"Shop: Haven - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_POISONBAG	"Drop: Battle Toadrin - Fallen Leaf Camp (Shaduwar)"
ITEM_HINT	II_GEN_REF_REF_SECOND	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_GUARDIEYE	"Drop: Elderguard - Eienble Cave (Darkon 1)"
ITEM_HINT	II_GEN_GEM_GEM_FORFORM	"Drop: Small Mushpang - Northern Flarine"
ITEM_HINT	II_GEN_GEM_GEM_DUMPTIRE	"Drop: Dump - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_REF_REF_THIRD	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_CHUPIM	"Drop: Small Pukepuke - Madren Town (Flaris)"
ITEM_HINT	II_ARM_M_MAG_GAUNTLET0301	"Shop: Martin - Saint Morning"
ITEM_HINT	II_GEN_GEM_GEM_PHANBUBLE	"Drop: Small Glaphan - Guardiane (Darkon 3)"
ITEM_HINT	II_GEN_FOO_INS_KIMBAP	"Shop: Losha - Flaris"
ITEM_HINT	II_ARM_M_ASS_GAUNTLET06	"Shop: Phacham - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_REPYGLE	"Drop: Small Nautrepy - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_BOBAND	"Drop: Small Hobo - Fantasy Desert (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_MONGTEAR	"Drop: Small Greemong - Eienble Cave (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_SCOTOOTH	"Drop: Small Scorpicon - The Garden of Rhisis (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_GOLDENFIST	"Drop: Phantom Basque - The Garden of Rhisis (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_KALIN	"Drop: Small Totemia - Central Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_POT_DRI_VITAL300	"Shop: Lui - Flaris"
ITEM_HINT	II_GEN_GEM_GEM_CLOCKHEART	"Drop: Maid Cardpuppet - Southern Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_MOONSTONE	"Drop: Small Rock Muscle - Southern Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_SHIFTPOP	"Drop: Pawn Popcrank - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_ZOMBYHOE	"Drop: Small Zombiger - Eienble Cave (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_PREWING	"Drop: Hoppre - Heret (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_STEAMTEAR	"Drop: Small Steam Walker - Khipra (Darkon 1)"
ITEM_HINT	II_GEN_POT_DRI_VITAL200	"Shop: Lui - Flaris"
ITEM_HINT	II_ARM_F_ASS_SUIT0401	"Shop: Phacham - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_SYCALE	"Drop: Syliaca - Eienble Cave (Darkon 1)"
ITEM_HINT	II_GEN_GEM_GEM_KNIGHTLER	"Drop: Small Steel Knight - Erons Factory 2 (Darkon 1)"
ITEM_HINT	II_GEN_GEM_GEM_RENYKEN	"Drop: Small Iren - Eastern Cendil (Darkon 3)"
ITEM_HINT	II_GEN_GEM_GEM_STARSTONE	"Drop: Cute Nyangnyang - Haunt of Nyangnyang (Flaris)"
ITEM_HINT	II_GEN_GEM_GEM_HOOKKIMERA	"Drop: Brigadier Chimeradon - Deadwallderness (Darkon 2)"
ITEM_HINT	II_GEN_GEM_GEM_DUMBLING	"Drop: Small Dumb Bull - Central Hillid Mountains (Saint Morning)"
ITEM_HINT	II_GEN_GEM_GEM_SLAIN	"Drop: Lawolf - Middle of River of Weeping (Flaris)"
ITEM_HINT	II_GEN_FOO_PIL_GOLD	"Shop: Ciel - Madrigal"
ITEM_HINT	II_GEN_GEM_GEM_BLAD	"Drop: Troglodon Clansman - Fallen Leaf Camp (Shaduwar)"
ITEM_HINT	II_ARM_F_BLA_SUIT08	"Shop: Haven - Darkon"
ITEM_HINT	II_GEN_GEM_GEM_MIADOLL	"Drop: Small Mia - The Home of Mr. Pumpkin. (Saint Morning)"

//////////////////////////////////////////////////////////////////////
// Hide and Seek (HIDESEEK) - IN_RANDOM 0 until the SPOT list is checked in game
//////////////////////////////////////////////////////////////////////
EVENT	HIDESEEK	MIN_LEVEL 60	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 5	ROUND_TIME 300	SCORE_TIME 10	IN_RANDOM 0
POINTS	HIDESEEK	15 12 10 8 7 6 5 4 3 2	0
HIDE_NPC	MI_MAFL_LOSHA	MaFl_LostFwanki		// Loyah model (MaFl_Loyah in Flaris), name "Lost Fwanki" (character.inc)

RANK	HIDESEEK	1	II_SYS_SYS_EVENT_TOKEN	30
RANK	HIDESEEK	2	II_SYS_SYS_EVENT_TOKEN	20
RANK	HIDESEEK	3	II_SYS_SYS_EVENT_TOKEN	15
RANK	HIDESEEK	4	II_SYS_SYS_EVENT_TOKEN	10
RANK	HIDESEEK	5	II_SYS_SYS_EVENT_TOKEN	10
RANK	HIDESEEK	6	II_SYS_SYS_EVENT_TOKEN	8
RANK	HIDESEEK	7	II_SYS_SYS_EVENT_TOKEN	8
RANK	HIDESEEK	8	II_SYS_SYS_EVENT_TOKEN	6
RANK	HIDESEEK	9	II_SYS_SYS_EVENT_TOKEN	6
RANK	HIDESEEK	10	II_SYS_SYS_EVENT_TOKEN	5
REST	HIDESEEK	II_SYS_SYS_EVENT_TOKEN	2

// Hide and Seek spots: generated by tools/minievent/build_spots.py (37) - check in game, delete bad ones
SPOT	6698	3394	"The Middle of Leren Mountains (Flaris)"	"close to where Aibatt spawn"	"the Flaris Observatory"
SPOT	6809	3081	"The South of Leren Mountains (Flaris)"	"close to where Small Aibatt spawn"	"the Altar of Dreadpet"
SPOT	8657	3496	"Saint Morning"	"close to where Mothbee spawn"	"the Saint Tree"
SPOT	8169	3119	"Saint Morning"	"close to where Small Mia spawn"	"the Altar of Violet"
SPOT	8392	3528	"Saint City"	"close to where Mothbee spawn"	"the Ancient Document Office"
SPOT	7029	3941	"The Middle of Leren Mountains (Flaris)"	"close to where Member of the Violet Magician Troupe spawn"	"the Billeting Place of High-Dwarpets"
SPOT	8403	3580	"Saint Morning"	"close to where Mothbee spawn"	"the Saint Hall"
SPOT	8592	3644	"Saint Morning"	"close to where Seido spawn"	"the Saint Morning square"
SPOT	8379	4025	"Saint Morning"	"close to where Member of the Violet Magician Troupe spawn"	"The Madrigal History Society."
SPOT	8338	3678	"Saint City"	""	"the Little Theater of Pepoview"
SPOT	7104	4135	"Haunt of Nyangnyang (Flaris)"	"close to where Member of the Violet Magician Troupe spawn"	"the Northern River of Weeping"
SPOT	7737	4205	"Northern Leren Mountains (Flaris)"	"close to where Member of the Violet Magician Troupe spawn"	"the Fountain of Dead Person"
SPOT	7551	4254	"Northern Leren Mountains (Flaris)"	"close to where Red Bang Troupe Leader spawn"	"the Mars Mine"
SPOT	7682	4310	"Northern Leren Mountains (Flaris)"	"close to where Member of the Violet Magician Troupe spawn"	"the Lab of Wise-men"
SPOT	5191	4715	"Darkon 1"	""	"The Wilds Dungeon Entrance"
SPOT	6806	6016	"Fallen Leaf Camp (Shaduwar)"	"close to where Brown Bolo spawn"	"the Cursed Aminus Dungeon Entrance"
SPOT	8586	2266	"Southern Hillid Mountains (Saint Morning)"	"close to where Small Rock Muscle spawn"	"The Entrance to Fantasy Desert"
SPOT	3192	2573	"Darkon 3"	"close to where Venel Guardian spawn"	"the Room of Guardian"
SPOT	3072	2962	"Darkon 3"	"close to where Luia spawn"	"the Altar of Knight"
SPOT	2721	2852	"Darkon 3"	""	"the Altar of Jester"
SPOT	3514	2716	"Darkon 3"	"close to where Shuhamma spawn"	"the Altar of Blade"
SPOT	3478	3573	"Darkon 3"	"close to where Small Boo spawn"	"the Altar of Billposter"
SPOT	3950	3563	"Darkon 3"	"close to where Nautrepy spawn"	"the Altar of Ellementor"
SPOT	4962	3530	"Darkon 1"	""	"The Savage Wilds Dungeon Entrance"
SPOT	2950	3993	"Darkon 3"	"close to where Small Watangka spawn"	"the House of Laola"
SPOT	3126	3655	"Darkon 3"	"close to where Small Antiquery spawn"	"the Altar of Ranger"
SPOT	2475	4628	"Darkon 3"	""	"the Altar of Psykeeper"
SPOT	3278	4175	"Darkon 3"	"close to where Small Iren spawn"	"the Altar of Ringmaster"
SPOT	3935	4233	"Darkon 2"	"close to where Kidler spawn"	"The Cage of Clockworks."
SPOT	5742	8084	"Ruendera Campsite (Eillun)"	""	"the Entrance of Kalgas Cave"
SPOT	6332	8108	"Ruendera Campsite (Eillun)"	""	"the Entrance to the Catacombs of Anguish"
SPOT	6938	8656	"Eillun"	""	"the Kaillun Grassland"
SPOT	6185	9273	"Ruendera Campsite (Eillun)"	""	"the Bahara Desert"
SPOT	6684	6462	"Fallen Leaf Camp (Shaduwar)"	"close to where Troglodon Clansman spawn"	"the Aminus Dungeon Entrance"
SPOT	7123	6456	"Fallen Leaf Camp (Shaduwar)"	"close to where Troglodon Warrior spawn"	"the Valley of the Risen"
SPOT	8069	6945	"Eillun"	""	"the Abandoned Borough"
SPOT	8259	9342	"Eillun"	""	"the Asylum Entrance"

//////////////////////////////////////////////////////////////////////
// Vagrant Race (RACE) - everyone a level 1 Vagrant in WdRace, finish at the Robe girl at the top. No level needed.
// IN_RANDOM 0 until it is checked in game. The best prizes of all the events (the user, 2026-10-16).
//////////////////////////////////////////////////////////////////////
EVENT	RACE	MIN_LEVEL 1	MIN_PLAYERS 5	MAX_PLAYERS 100	MAX_PER_IP 0	REGISTER 5	ROUNDS 2	ROUND_TIME 600	SCORE_TIME 15	IN_RANDOM 0	READY 15
POINTS	RACE	15 12 10 8 7 6 5 4 3 2	1
RACE_START	505	594

RANK	RACE	1	II_SYS_SYS_EVENT_TOKEN	50
RANK	RACE	2	II_SYS_SYS_EVENT_TOKEN	40
RANK	RACE	3	II_SYS_SYS_EVENT_TOKEN	30
RANK	RACE	4	II_SYS_SYS_EVENT_TOKEN	20
RANK	RACE	5	II_SYS_SYS_EVENT_TOKEN	15
RANK	RACE	6	II_SYS_SYS_EVENT_TOKEN	12
RANK	RACE	7	II_SYS_SYS_EVENT_TOKEN	10
RANK	RACE	8	II_SYS_SYS_EVENT_TOKEN	8
RANK	RACE	9	II_SYS_SYS_EVENT_TOKEN	8
RANK	RACE	10	II_SYS_SYS_EVENT_TOKEN	6
REST	RACE	II_SYS_SYS_EVENT_TOKEN	3

//////////////////////////////////////////////////////////////////////
// Monday / Wednesday / Friday, 13:15 and 19:00 (13:00 and 20:00 fall in Free PK Time)
//////////////////////////////////////////////////////////////////////
BEGIN	RANDOM	2	13	15
BEGIN	RANDOM	2	19	00
BEGIN	RANDOM	4	13	15
BEGIN	RANDOM	4	19	00
BEGIN	RANDOM	6	13	15
BEGIN	RANDOM	6	19	00
SPOT	6887	3233	"Flaris"	"Near Collecting Area"	"Flaris"	// /hidespot by Diablo, 2026-10-17
