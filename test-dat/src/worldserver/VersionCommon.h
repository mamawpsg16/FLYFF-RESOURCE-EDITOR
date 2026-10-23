#ifndef __VERSION_COMMON_H__
#define __VERSION_COMMON_H__
#include "../_Common/CustomCommon.h"
#define __ADDSHOPITEM
#define __RENTAL_PET
#define __MAINSERVER
#define __FIX_RANGER_ROLLER
#define __NOT_WORTH_15EURO
#define	__VER	19

#if !defined( __TESTSERVER ) && !defined( __MAINSERVER )
	#define __INTERNALSERVER
#endif

#if (_MSC_VER > 1200)
#define		__VS2003
#if (_MSC_VER >= 1600) // __VC100
#pragma warning ( disable : 4995 )
#pragma warning ( disable : 4996 )	
#endif // __VC100
#endif

//|: ~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-

#define		__3RD_LEGEND16
#define		__AUTO_JOB_CHANGE
#define		__BARUNA_PIERCING
#define		__COLOSSEUM
#define		__AURA_GLOW_CHANGE
#define		__CROSSBOW
#define		__FASHION_COMBINE
#define		__IMPROVE_MAP_SYSTEM
#define		__INSTANCE_AGGRO_SYSTEM
#define		__INVALID_USER_PACKET_FILTER
#define		__ITEMLINK
#define		__LOOKCHANGE
#define		__NEW_ITEM_VARUNA
#define		__NEW_STACKABLE_AMPS
#define		__NEW_WEAPON_GLOW
#define		__NO_SUB_LANG
#define		__SECURITY_FIXES
#define		__GM_LIST
#define		__WEAPON_RARITY
#define		__MOUNT				// true ground-mount system (ported from GozoGreen)
#define		__UPGRADE_SUCCESS_SCROLL

//|: ~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-

#define		__HACK_0516
#define		D3DDEVICE	NULL
#define		__SERVER						// Ŭ���̾�Ʈ �����ڵ带 �������� �ʱ� ���� define
#define		__X15
#define		__VERIFY_LOOP041010
#define		__S1108_BACK_END_SYSTEM			// ��ص�ý��� Trans, World, Neuz
//#define		__PROFILE_RUN
#define		__RES0807						// ������ ����
#define		__CPU_UTILDOWN_060502			// CPU ���� �����۾� 
#define		__SLIDE_060502					// ������ ������ ���� ���� 
#define		__S8_SERVER_PORT				// 2006�� 11�� 7�� ������Ʈ - World, Cache, CoreServer
#define		__EVENT_1101					// ��ý �̺�Ʈ
#define		__NEWYEARDAY_EVENT_COUPON		// �� �̺�Ʈ - ����, ���� �����̿�� ����.
// �ؿ� 6�� ���� ����
#define		__LANG_1013						// �ؿ� ���� �߰� �� ��ũ��Ʈ�� ���� Neuz. World
#define		__HACK_1130						// �̱� ��ŷ ���� - ���� ���, ��ũ��Ʈ ����
#define		__QUEST_1208					// ��ũ��Ʈ ��Ŷ ó�� ����
#define		__TRAFIC_1222					// �ߺ� ��Ŷ ���� ����
#define		__S_SERVER_UNIFY				// ���� ���� Neuz, World

// �ؿ� 7�� ���� ����
#define		__BUGFIX_0326					// ���� ���� ������ ���

// 8.5��
#define		__INFINITE_0227

#define		__LANG_IME_0327					// ������ imeǥ�� â ��� ����
#define		__STL_0402						// stl
// 9��
#define		__TRADESYS						// ��ȯ ������ ��ũ��Ʈ(�̺�Ʈ, ����Ʈ, ...) Neuz, World
#define		__EVE_BALLOON					//ǳ�� �̺�Ʈ ����

#define		__ITEMDROPRATE					// �̺�Ʈ ������ ��ӷ� ������

#define		__PK_PVP_SKILL_REGION			// PK������������ ���� ��ų�� PVP��뿡�Ը� �����ϵ���..
#define		__PVPDEBUFSKILL					// PVP ���� �� ������� ���� ī���� �Ǵ� ���� ���� - World
#define		__EVENT_1101_2					// ��ý �̺�Ʈ 64��Ʈ ����
#define		__S_RECOMMEND_EVE				// ��õ �̺�Ʈ Neuz, Trans, World
#define		__EVE_MINIGAME					// �̺�Ʈ �̴ϰ��� 4��, Neuz, World

#define		__ANGEL_LOG						// ���� ���� �α�
#define		__EXP_ANGELEXP_LOG				// ����ġ, ���� ����ġ �α� ���� CHARACTER_TBL �÷� �߰�
#define		__S_ADD_EXP						// EXP_S ������ ����

#define		__RULE_0615						// ���� ��Ģ ����
#define		__S_BUG_GC						// ������ ��û�� ���� �ݾ��� ��û�ϸ� �����̵�� ��Ʈ �Ǽ� ������ �ٲ�� ���� ����( map -> vector ) 
#define		__S_ADD_RESTATE					// ���ȭ ������ ����( ������Ʈ ��, ��ø, ü��, ���� )

//	#define		__REMOVE_ATTRIBUTE			// �Ӽ����� ����(10���� ����)
//	#define		__CHAO_DMGDEC				// ī���� PKValue�� ���� PVP Damage ����(9��)

#define		__PROP_0827						// ������ ������Ƽ ���� �Ķ���� Ȯ��
#define		__RIGHTHAND_SKILL				// ������Ʈ ����, ���� �����͸�, ������¡�ҵ�, �ҵ� �����͸� �������� ���⸸�� �������� ��ų���
#define		__LOG_MATCHLESS					// �Ϲ� ������ �������°� �Ǵ� ��찡 ���� �߻��Ͽ� �α� ����.

#define		__PKSERVER_USE_ANGEL			// PK���������� �������� ������,���� ���

//	#define		__EVENTLUA_ATKDEF			// ��� �̺�Ʈ - ���ݷ�, ���� ����(9���� �����)


// 11��
//	#define		__MA_VER11_02				// ��ǥ ���� ȭ�� '�丰' �߰�
//	#define		__MA_VER11_04				// ��� â�� �α� ��� world,database
//	#define		__MA_VER11_05				// �ɸ��� ���� �ŷ� ��� world,database,neuz
//	#define		__MA_VER11_06				// Ȯ����ų ȿ������ world,neuz

//	#define		__CSC_VER11_3				// Ĩ���� ���� �̿� �ϱ� (��� ���� ����)
//	#define		__CSC_VER11_5				// �½�ũ�� Ȯ��
//	#define		__GUILDCOMBATCHIP			// ������ Ĩ���� �� Ĩ�� ���� ���� �̿�
//	#define		__GUILD_COMBAT_1TO1			// �ϴ��� ��� ����
//	#define		__EXPITEM_TOOLTIP_CHANGE	// ����ġ ������ ǥ�� ��� ����

//	#define		__REMOVE_ENDURANCE			// ������ ������ ���� ����
//	#define		__PIERCING_REMOVE			// �Ǿ�� �ɼ� ����
#define		__EVENTLUA_COUPON			// ���� �̺�Ʈ
#define		__NOLIMIT_RIDE_ITEM			// ���� ���� ���� ����ü ������		// ������ ����
#define		__NPC_BUFF					// NPC�� ���� �����ޱ�
//	#define		__REFLECTDMG_AFTER			// �ݻ絥������ ���߿� ����
//	#define		__CHIPI_071210				// �Ⱓ�� ������ �Ⱓ ���� �˻縦 SavePlayer()���� �ϵ��� ����(15�� �̳��� ���� ����� ���Ѵ� ��� ����) - WORLDSERVER

//	#define		__SYS_POCKET				// �ָӴ�
//	#define		__SYS_COLLECTING			// ä��
//	#define		__SYS_IDENTIFY				// ����, �ູ
//	#define		__FIX_COLLISION
//	#define		__MOD_VENDOR

#define		__JEFF_11					// ���� ����� �ִ� �������� �޾���� ���ϴ� �������� AI ������ �ʿ�
#define		__SYS_TICKET				// �����
//	#define		__SYS_PLAYER_DATA			// ĳ���� ���� ����
#define		__HACK_1023					// ���ҽ� ���� // ���� �ӵ� // ���� ���� �ӵ�
#define		__RT_1025					// �޽���
#define		__VENDOR_1106				// ���λ��� ��� ����

#define		__INVALID_LOGIN_0320		// ������ �Ϸ� ���� ���� ������� ���� ����(���� ����)

#define		__JEFF_9_20					// ���� �ð��� ħ�� �ð����� ����

#define		__EVENTLUA_GIFT				// Ư�� ������ �������� ������ ����

#define		__JEFF_11_4					// �Ʒ���
#define		__JEFF_11_5					// �޸� ����
#define		__JEFF_11_6					// �ٺ� ����

#define		__DST_GIFTBOX				// ���� �����ۿ� ����Ʈ �ڽ� ��� �߰�
#define		__EVENT_MONSTER				// �̺�Ʈ ����(WorldServer)
#define		__PENYA_TO_INVENTORY		// Monster kills give gold directly to inventory, no ground drop

#define		__CHIPI_DYO					// NPC�� Ư������������ ����� �� �ְ� character.inc�� ���� 
#define		__STL_GIFTBOX_VECTOR		// GiftBox Vector�� ����(�ڽ� ���� ���� ����)
#define		__CHIPI_ITEMUPDATE_080804	// ������ ��� g_uKey�� 101�� ����. �׷��� ����...

#define		__VM_0820
//#define		__VM_0819	// ���� �޸� ���� ã��

// 12��	
//	#define 	__ANGEL_NODIE				// ĳ���Ͱ� ����ص� ������ ������� �ʴ´�.
//	#define		__SECRET_ROOM				// ����� ��
//	#define		__TAX						// ����
//	#define		__HEAVEN_TOWER				// �ɿ��� ž
//	#define		__EXT_PIERCING				// ���� �Ǿ��
//	#define		__MONSTER_SKILL				// ���Ͱ� ĳ���� ��ų �����ϵ��� ����
//	#define		__NEW_SUMMON_RULE			// ���� ��ȯ ��Ģ ����
//	#define		__LORD		// ���� �ý���
//	#define		__PET_0519	// �� ����
//	#define		__J12_0		// ����, �ູ ���� ���� �߰�
//	#define		__RANGDA_0521	// ���� �̺�Ʈ ����
//	#define		__MOD_TUTORIAL
//	#define		__JHMA_VER12_1	//12�� �ش����������  world,core
//	#define		__PARSKILL1001	//12�� �Ľ�ų ������ ����  world,core,neuz
//	#define		__ITEMCREATEMON_S0602		// ���� ���� Neuz, World
//	#define		__NEW_ITEMCREATEMON_SERVER	// ���� ���� ������(IK3_CREATE_MONSTER) ��Ģ ����(����)
//	#define		__EVENTLUA_0826
//	#define		__LEAK_0827
//	#define		__UPDATE_OPT

// 13��
//	#define		__EXT_ENCHANT				// ���� Ȯ��(�Ӽ�, �Ϲ�)
//	#define		__RAINBOW_RACE				// ���κ��� ���̽�
//	#define		__HOUSING					// �Ͽ�¡ �ý���
//	#define		__QUEST_HELPER				// ����Ʈ NPC��ġ �˸�.
//	#define		__CHIPI_QUESTITEM_FLAG		// ����Ʈ ���� ������ �ͼ� ����
//	#define		__HONORABLE_TITLE			// ����
//	#define		__COUPLE_1117				// Ŀ�� �ý���
//	#define		__COUPLE_1202				// Ŀ�� ����

#define		__LAYER_1015		// ���� ��ü ��
#define		__LAYER_1020		// __LAYER_1015 �׽�Ʈ
#define		__LAYER_1021		// __LAYER_1015 ������
#define		__AZRIA_1023	// ����� �� ����
#define		__PET_1024		// �� �۸�
#define		__BUFF_1107

#define		__OCCUPATION_SHOPITEM	// ���ɱ�� ���� ���� ���� ������

#define		__SYNC_1217		// �񵿱� ����(�ʸ��� ����)
#define		__SPEED_SYNC_0108		// ResetDestParam speed ���� �������� ���̴°� ���� Ÿ������ �ʱ⽺�ǵ�񵿱⵵ ���� ���� 
#define		__SYS_ITEMTRANSY			// ������ Ʈ������ �ý��ۿ��� ����

#define		__EVENTLUA_CHEEREXP		// ��� �̺�Ʈ - ���� ����ġ ����

#define		__FUNNY_COIN			// �۴� ����

#define		__MAP_SECURITY				// ������ ������ �� �˻�

// 14��
//	#define		__NEW_CONTINENT				// 14�� �űԴ�� �ϸ���� �߰�
//	#define		__SMELT_SAFETY				// 14�� ��������
//	#define		__INSTANCE_DUNGEON			// 14�� �ν��Ͻ� ���� ���
//	#define		__PARTY_DUNGEON				// 14�� �ش� ���� �ν��Ͻ� ����
//	#define		__ANGEL_EXPERIENCE			// 14�� ���� ���� ����(����ġ ����)
//	#define		__EQUIP_BIND				// ���������� ����� �ͼ�
//	#define		__EXT_ATTRIBUTE				// �Ӽ����� ���� Ȯ�� �� ����
//	#define		__NEW_ITEM_LIMIT_LEVEL		// ������ ���뷹�� ��Ģ ����(MASTER, HERO�� ���� ������ �ް� ���� Ŭ���� ����� ������ ���� ����)
//	#define		__BALLOON_CODE_IMPROVEMENT	// ǳ�� ���� �ڵ� ����
//	#define		__PCBANG					// PC�� ����
	#define		__QUIZ						// ���� �̺�Ʈ �ý���

#define		__BUFF_TOGIFT				// ���� �ð� ����Ǹ� ������ �����ϴ� �ý���(IK2_BUFF_TOGIFT)
#define		__EVENTLUA_SPAWN			// ������ �� ���� ���� �̺�Ʈ
#define		__EVENTLUA_KEEPCONNECT		// ���� ���� ������ ���� �̺�Ʈ

#define		__PERIN_BUY_BUG				// ��� �ݺ����� ���� Ȯ�ο� �ڵ�
#define		__AUTO_PERIN_CONVERT			// Auto-convert excess penya to Perin scrolls
#define		AUTO_PERIN_CONVERT_THRESHOLD	2000000000L	// keep raw penya at/under this; tune per server economy

#define		__ERROR_LOG_TO_DB		// ���� �α� �ý���

#define		__EVENTLUA_RAIN				// �帶 �̺�Ʈ -> ��Ʒ� ����

#define		__EVENTLUA_SNOW				// ���� �̺�Ʈ

#define		__ADD_RESTATE_LOW			// ���ȭ ������ ����( ������Ʈ �ϱ� ��, ��ø, ü��, ���� )


// 15��
//	#define		__PETVIS					// 15�� ����
//	#define		__GUILD_HOUSE				// 15�� ����Ͽ콺
//	#define		__TELEPORTER				// 15�� �ڷ����� 
//	#define		__IMPROVE_QUEST_INTERFACE	// 15�� ���� ����Ʈ �������̽� �ý���
//	#define		__CAMPUS					// 15�� ���� �ý���
//	#define		__HERO129_VER15				// 15�� ����� ����Ȯ��
//	#define		__IMPROVE_SYSTEM_VER15		// 15�� �ý��� ��������
//	#define		__DYNAMIC_MPU				// ���氡���� MPU
//	#define		__USING_CONTINENT_DATA		// ��� ������� �ܺε����Ϳ��� �ܾ��
//	#define		__REACTIVATE_EATPET			// ������ ������ �����Ÿ� �̻� �־����� ���ȯ
//	#define		__15_5TH_ELEMENTAL_SMELT_SAFETY	// 15.5�� �Ӽ� ���� ���� �߰�
//	end15th

	#define		__SHOP_COST_RATE			// ���� ���� ����

//	#define		__ITEMTRANSY_PENYA			//	��ķ� ������ Ʈ���� �����ϰ� ����.
	#define		__PROTECT_AWAKE				//	���� ��ȣ�� �η縶��.

	#define		__ENVIRONMENT_EFFECT

#if	  defined(__INTERNALSERVER)	// ���� �繫�� �׽�Ʈ���� 
//	#define	__RULE_0615

//	#define		__VERIFY_MEMPOOL
	#define		__GUILDVOTE					// ��� ��ǥ 
	#define		__IAOBJ0622					// ��� ��ǥ ��ǥ ����	// ����, ����
	#define		__SKILL0517
//	#define		__S_NEW_SKILL_2				// ��ų ���� ��Ŷ ���� Neuz, World, Trans
	#define		__Y_CASTING_SKIP			// �ɽ��� ���� ��ų �ߵ� - Neuz, World
	#define		__YAIMONSTER_EX				// AI��� �߰� - Neuz, World
	#define		__Y_PATROL					// ��ȸ�ϱ� - Neuz, World
	#define		__V060721_TEXTDRAG			// ���ڿ� ȿ���ֱ�
	#define		__Y_BEAUTY_SHOP_CHARGE
//	#define		__LUASCRIPT060908			// lua ��ũ��Ʈ����( ������ ) 
	#define		__Y_FLAG_SKILL_BUFF			// ��, ���� ������ ��۹��� ����... Neuz, World
//	#define		__EVENT_FALL				// ��ǳ �̺�Ʈ - �𵨱�ü Neuz, World
//	#define		__LANG_1013					// �ؿ� ���� �߰� ��ũ��Ʈ
//	#define		__JEFF_VER_8				// 8�� �۾�
//	#define		__JHMA_VER_8_1				// 8�� ���ӳ�����ӱ���	Neuz, World 
//	#define		__JHMA_VER_8_2				// 8�� ���ӳ��������ǸŰ�������Ǯ��	Neuz, World
//	#define		__JHMA_VER_8_5				// 8�� ��ų����ġ�ٿ��	Neuz, World
//	#define		__JHMA_VER_8_6				// 8�� ������Ͱ� �������������� ���ݰ����ϰ���   World
//	#define		__JHMA_VER_8_7				// 8�� ������� ������� PVP�����ϰ���   Neuz, World
//	#define		__JHMA_VER_8_5_1			// 8.5�� ��� ������ų ����ȿ�� �Ұ��� ���� World
//	#define		__JHMA_VER_8_5_2			// 8.5�� ������� �α����� ���������ʰ� ����  World
//	#define		__CSC_VER8_3				// 8�� Buffâ ����. Neuz, World
//	#define		__CSC_VER8_4				// 8�� ����, �������� ���� Neuz, World
//	#define		__CSC_VER8_5				// 8�� ���� ��ȯ Neuz, World, Trans
//	#define		__CSC_VER8_6				// ��� ���ɾ� statall �߰� World
	#define		__Y_MAX_GENERAL_LEVEL_8				// ���� 120���� ����... Neuz, World, Trans
	#define		__Y_HAIR_BUG_FIX
	#define		__EVENT_0117				// ���� �̺�Ʈ
//	#define		__NEWYEARDAY_EVENT_COUPON	// �� �̺�Ʈ - ����, ���� �����̿�� ����.
	#define		__TRAFIC_1215
//	#define     __Y_NEW_ENCHANT				// ���� ������ ����, Neuz, World

//	#define		__INVALID_LOGIN_0320		// ������ �Ϸ� ���� ���� ������� ���� ����(���� ����)
	#define		__BUGFIX_0326				// ���� ���� �̺�Ʈ ������ ��� ����
// 10��
//	#define		__LEGEND					// 10�� ���½ý���	Neuz, World, Trans
// 10��
//	#define		__ULTIMATE					// 9, 10�� ���͸� ���� ���� �ý���
	
//	#define		__PET_0410					// 9, 10�� ��
//	#define		__JEFF_9					// 9, 10�� �߰� �۾�
//	#define		__AI_0509					// ���� �ΰ�����
	#define		__HACK_0516					// �̱� ��ŷ 2��
//	#define		__LUASCRIPT					// ��� ��ũ��Ʈ ��� (World, Trans, Neuz)
//	#define		__EVENTLUA					// �̺�Ʈ (��� ��ũ��Ʈ ����) - World, Trans, Neuz

//	#define		__FLYBYATTACK0608			// 9th FlyByAttack edit
//	#define		__PVPDEMAGE0608				// 9th PVP DEMAGE edit
//	#define		__BLADELWEAPON0608			// 9th �����̵� ��տ� ���⸦ ���� �� �߰� �ɼ��� �����տ� ��� �ִ� ������ �͸� ������ �ǵ��� ����
//	#define		__METEONYKER_0608
//	#define		__Y_DRAGON_FIRE
//	#define		__CSC_VER9_5				// 9�� ���ð��� (�߰� �˱� ���)

	#define		__GLOBAL_COUNT_0705			// CTime::GetTimer

//	#define		__SKILL_0706				// ���ο� AddSkillProp �÷� �߰� �� ����
//	#define		__AI_0711					// ���׿���Ŀ AI ����
//	#define		__HACK_0720					// ���ҽ� ��ŷ
//11
//	#define		__JEFF_11					// ���� ����� �ִ� �������� �޾���� ���ϴ� �������� AI ������ �ʿ�
	
//	#define		__SYS_TICKET				// �����
//	#define		__SYS_PLAYER_DATA			// ĳ���� ���� ����
//	#define		__HACK_1023					// ���ҽ� ���� // ���� �ӵ� // ���� ���� �ӵ�
//	#define		__RT_1025					// �޽���

//	#define		__VENDOR_1106				// ���λ��� ��� ����

	#define		__JEFF_11_1
	#define		__JEFF_11_3					// ����/Ŭ���̾�Ʈ ���ҽ� �и�
//	#define		__JEFF_11_4					// �Ʒ���

//	#define		__JEFF_11_5					// �޸� ����

//	#define		__DST_GIFTBOX				// ���� �����ۿ� ����Ʈ �ڽ� ��� �߰�

	#define		__PERF_0226

	#define		__OPT_MEM_0811
//	#define		__MEM_TRACE
//	#define		__NEW_PROFILE		// ���ο� �������Ϸ� ����

	#define		__VTN_TIMELIMIT				// ��Ʈ�� �÷��� �ð� ����

	#define		__PROTECT_AWAKE				//	���� ��ȣ�� �η縶��.


	#undef		__VER
	#define		__VER 16

	#define		__GUILD_HOUSE_MIDDLE		// ����Ͽ콺 ����

	#define		__MOVER_STATE_EFFECT		// ���� ���°� ��ȭ�� ���� ����Ʈ ����

	#define		__NEW_ITEM_VARUNA			// �� ���� �ý���(�ٷ糪)


#elif defined(__TESTSERVER)		// �ܺ� ���� �׽�Ʈ���� 
	
	#define		__GUILDVOTE					// ��� ��ǥ 
//	#define		__SKILL0517					// ��ų ���� �Ķ����
	#define		__Y_CASTING_SKIP			// �ɽ��� ���� ��ų �ߵ� - Neuz, World
	#define		__YAIMONSTER_EX				// AI��� �߰� - Neuz, World
	#define		__Y_PATROL					// ��ȸ�ϱ� - Neuz, World
	#define		__V060721_TEXTDRAG			// ���ڿ� ȿ���ֱ�
	#define		__Y_BEAUTY_SHOP_CHARGE
	#define		__Y_FLAG_SKILL_BUFF			// ��, ���� ������ ��۹��� ����... Neuz, World
//	#define		__EVENT_FALL				// ��ǳ �̺�Ʈ - �𵨱�ü Neuz, World
	#define		__Y_MAX_GENERAL_LEVEL_8				// ���� 120���� ����... Neuz, World, Trans
	#define		__TRAFIC_1215

	// 10��
//	#define		__LEGEND					// 10�� ���½ý���	Neuz, World, Trans

//	#define		__CSC_VER9_2				// 9�� ����â ���� ���� Neuz, World

	#define		__HACK_0516					// �̱� ��ŷ 2��

//	#define		__FLYBYATTACK0608			// 9th FlyByAttack edit
//	#define		__PVPDEMAGE0608				// 9th PVP DEMAGE edit
//	#define		__BLADELWEAPON0608			// 9th �����̵� ��տ� ���⸦ ���� �� �߰� �ɼ��� �����տ� ��� �ִ� ������ �͸� ������ �ǵ��� ����

//	#define		__Y_DRAGON_FIRE
//	#define		__LUASCRIPT					// ��� ��ũ��Ʈ ��� (World, Trans, Neuz)
//	#define		__EVENTLUA					// �̺�Ʈ (��� ��ũ��Ʈ ����) - World, Trans, Neuz
//	#define		__CSC_VER9_5				// 9�� ���ð��� (�߰� �˱� ���)

//	#define		__PET_0410					// 9, 10�� ��
//	#define		__METEONYKER_0608
//	#define		__SKILL_0706				// ���ο� AddSkillProp �÷� �߰� �� ����
//	#define		__AI_0711					// ���׿���Ŀ AI ����
//	#define		__JEFF_9					// 9, 10�� �߰� �۾�
//	#define		__AI_0509					// ���� �ΰ�����
	#define		__GLOBAL_COUNT_0705			// CTime::GetTimer

//	#define		__JEFF_11					// ���� ����� �ִ� �������� �޾���� ���ϴ� �������� AI ������ �ʿ�
//	#define		__SYS_TICKET				// �����
//	#define		__SYS_PLAYER_DATA			// ĳ���� ���� ����
//	#define		__HACK_1023					// ���ҽ� ���� // ���� �ӵ� // ���� ���� �ӵ�
//	#define		__RT_1025					// �޽���
//	#define		__VENDOR_1106				// ���λ��� ��� ����

//	#undef	__VER
//	#define	__VER	11						// 11��

	#define		__JEFF_11_1
	#define		__JEFF_11_3					// ����/Ŭ���̾�Ʈ ���ҽ� �и�
//	#define		__JEFF_11_4					// �Ʒ���
//	#define		__JEFF_11_5					// �޸� ����

//	#define		__JAPAN_SAKURA				// ���� �̺�Ʈ

	#define		__OPT_MEM_0811
//	#define		__MEM_TRACE
	
//	#define		__NEW_PROFILE		// ���ο� �������Ϸ� ����

	#define		__GUILD_HOUSE_MIDDLE		// ����Ͽ콺 ����

#elif defined(__MAINSERVER)	// �ܺ� ����
 
	#define		__ON_ERROR
	#define		__IDC
	#define		__Y_BEAUTY_SHOP_CHARGE		// ��Ƽ��, ���λ��� ���������ȭ..Neuz, World
	#define		__TRAFIC_1215
//	#define		__EVENT_FALL		// ��ǳ

//	#define     __Y_NEW_ENCHANT				// ���� ������ ����, Neuz, World

	#define		__JEFF_11_1
	#define		__JEFF_11_3		// ����/Ŭ���̾�Ʈ ���ҽ� �и�

	#define		__EVENT_0117				// propEvent.inc spawn
//	#define		__JAPAN_SAKURA				// ���� �̺�Ʈ
//	#define		__RAIN_EVENT		// �帶 �̺�Ʈ(����� ���� ����ġ 2��)

	#define		__OPT_MEM_0811
//	#define		__MEM_TRACE
//	#define		__NEW_PROFILE		// ���ο� �������Ϸ� ����
	#define		__GLOBAL_COUNT_0705			// CTime::GetTimer

	#define		__BLADELWEAPON0608			// Blade left-hand weapon: only right-hand weapon's bonus options apply

#endif	// end - ���������� define 

// �ӽ� - ����� ���� ���� 
#if __VER >= 7
	#define		__REMOVE_SCIRPT_060712		 
#endif

#endif