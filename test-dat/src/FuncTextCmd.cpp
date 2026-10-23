#include "stdafx.h"
#if defined( __WORLDSERVER ) && defined( __FL_EQUALIZED_MODE )
#include "EqualizedPvP.h"
#endif // __WORLDSERVER __FL_EQUALIZED_MODE
#include "defineText.h"
#include "defineObj.h"
#include "FuncTextCmd.h"
#include "WorldMng.h"
#include "definequest.h"

#ifdef __CLIENT
#include "AppDefine.h"
#include "WndAdminCreateItem.h"
#include "WndIndirectTalk.h"
#include "WndChangeFace.h"
#include "dpclient.h"
#include "timeLimit.h"
#endif // __CLIENT

#ifdef __WORLDSERVER
#include "User.h"
#include "UserMacro.h"
#include "DPCoreClient.h"
#include "dpdatabaseclient.h"
#include "dpSrvr.h"
#include "eveschool.h"
#include "WorldDialog.h"
#include "FreePKTime.h"
#ifdef __FL_FFA
#include "FFAManager.h"
#endif	// __FL_FFA
#ifdef __FL_TDM
#include "TDMManager.h"
#endif	// __FL_TDM
#if __VER >= 13 // __EXT_ENCHANT
#include "ItemUpgrade.h"
#endif // __EXT_ENCHANT
#endif	// __WORLDSERVER

#if __VER >= 11 // __SYS_IDENTIFY
#include "randomoption.h"
#endif	// __SYS_IDENTIFY

#if __VER >= 11 // __SYS_PLAYER_DATA
#include "playerdata.h"
#endif	// __SYS_PLAYER_DATA

#if __VER >= 12 // __SECRET_ROOM
#include "SecretRoom.h"
#endif // __SECRET_ROOM

#if __VER >= 12 // __LORD
#ifdef __CLIENT
#include "clord.h"
#endif	// __CLIENT
#endif	// __LORD

#if __VER >= 12 // __TAX
#include "Tax.h"
#include "GuildSiegePrize.h"
#endif // __TAX

#if __VER >= 13 // __HONORABLE_TITLE			// 달인
	#include "honor.h"
#endif	// __HONORABLE_TITLE			// 달인

#if __VER >= 13 // __RAINBOW_RACE
#ifdef __WORLDSERVER
#include "RainbowRace.h"
#endif // __WORLDSERVER
#endif // __RAINBOW_RACE

#include "guild.h"
#include "party.h"
#include "post.h"

#if __VER >= 13 // __COUPLE_1117
#include "couplehelper.h"
#include "couple.h"
#endif	// __COUPLE_1117

#ifdef __QUIZ
#ifdef __WORLDSERVER
#include "Quiz.h"
#endif // __WORLDSERVER
#endif // __QUIZ

#if __VER >= 15 // __GUILD_HOUSE
#include "GuildHouse.h"
#endif // __GUILD_HOUSE

#if __VER >= 15 // __CAMPUS
#ifdef __WORLDSERVER
#include "CampusHelper.h"
#endif // __WORLDSERVER
#endif // __CAMPUS

extern	CPartyMng			g_PartyMng;
extern	CGuildMng			g_GuildMng;

#ifdef __CLIENT
extern	CParty				g_Party;
extern  CDPClient			g_DPlay;
#endif // __CLITEM

#ifdef __WORLDSERVER
extern	CDPDatabaseClient	g_dpDBClient;
extern	CDPCoreClient		g_DPCoreClient;
extern	CUserMng			g_UserMng;
extern  CWorldMng			g_WorldMng;
extern	CDPSrvr				g_DPSrvr;
extern	CGuildCombat		g_GuildCombatMng;
#endif

#if __VER >= 11 // __SYS_COLLECTING
#include "definesound.h"
#endif	// __SYS_COLLECTING


#define TCM_CLIENT 0
#define TCM_SERVER 1
#define TCM_BOTH   2


#define BEGINE_TEXTCMDFUNC_MAP TextCmdFunc m_textCmdFunc[] = {
#define END_TEXTCMDFUNC_MAP 0, 0, 0, 0, 0, 0, AUTH_GENERAL, 0 };
#define ON_TEXTCMDFUNC( a, b, c, d, e, f, g, h ) a, b, c, d, e, f, g, h,

BOOL TextCmd_InvenClear( CScanner& scanner )       
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	D3DXVECTOR3 vPos	= pUser->GetPos();
	CWorld* pWorld	= pUser->GetWorld();
	
	if( !pUser->HasActivatedSystemPet() )
	{
		int nNum = 0;
		int	nSize	= pUser->m_Inventory.GetMax();
		
		for( int i = 0 ; i < nSize; ++i )
		{
			CItemElem* pItemElem = pUser->m_Inventory.GetAtId( i );
			if( pItemElem )
			{
				pUser->UpdateItem( i, UI_NUM, 0 );		// remove
			}
		}
	}
	else
		pUser->AddDefinedText( TID_GAME_PET_NOWUSE );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CommandList( CScanner& scanner )  
{ 
	return TRUE;
}

#ifdef __MOUNT
// __MOUNT: GM tuning for the mount you ride; changes the loaded Mount.inc data until restart (client, then server)
//   /mountset                                 show the current values as Mount.inc lines
//   /mountset speed|run|walk|name <value>     fGroundSpeed | fAnimSpeed | fWalkAnimSpeed | fNameOffset
//   /mountset runani|walkani|backani <motion> loop for that state, e.g. "runani walk" plays item_<mesh>_walk.ani
BOOL TextCmd_MountSet( CScanner& scanner )
{
#ifdef __CLIENT
	CMover* pMover = g_pPlayer;
#else // __CLIENT
	CMover* pMover = (CMover*)scanner.dwValue;
#endif // __CLIENT
	if( pMover == NULL || pMover->GetMountId() == 0 )
		return FALSE;
	MOUNT_ANIMATION* pMountAnim = prj.GetMountAnimation( pMover->GetMountId() );
	if( pMountAnim == NULL )
		return FALSE;

	scanner.GetToken();
	CString strKey = scanner.Token;
	strKey.MakeLower();
	if( strKey == "fly" || strKey == "flyanim" || strKey == "flymax" )
	{
		float fValue = scanner.GetFloat();
		if( fValue < 0.0f || fValue > 10.0f )
			return FALSE;
		if( strKey == "fly" )
		{
			if( fValue > 0.02f )		// brooms use 0.0023; bigger values overshoot the top speed
				return FALSE;
			pMountAnim->fFlightSpeed = fValue;
		}
		else if( strKey == "flymax" )
		{
			if( fValue > 2.0f )
				return FALSE;
			pMountAnim->fFlyMaxSpeed = fValue;	// 0 = the normal broom top speed (0.3)
		}
		else if( fValue > 0.0f )
			pMountAnim->fFlyAnimSpeed = fValue;
		else
			return FALSE;
	}
	else if( strKey == "speed" || strKey == "run" || strKey == "walk" || strKey == "name" )
	{
		float fValue = scanner.GetFloat();
		if( strKey == "name" )
		{
			if( fValue < -5.0f || fValue > 10.0f )
				return FALSE;
			pMountAnim->fNameOffset = fValue;
		}
		else
		{
			if( fValue <= 0.0f || fValue > 10.0f )
				return FALSE;
			if( strKey == "speed" )
				pMountAnim->fGroundSpeed = fValue;
			else if( strKey == "run" )
				pMountAnim->fAnimSpeed = fValue;
			else
				pMountAnim->fWalkAnimSpeed = fValue;
		}
	}
	else if( strKey == "runani" || strKey == "walkani" || strKey == "backani" )
	{
#ifdef __CLIENT
		scanner.GetToken();
		CModelObject* pMountModel = pMover->GetMountModel();
		if( pMountModel == NULL )
			return FALSE;
		CString strFile = pMountModel->GetMotionFileName( CString( scanner.token ) );
		if( g_MotionMng.LoadMotion( strFile ) == NULL )
		{
			g_WndMng.PutString( "No such animation: " + strFile, NULL, 0xffff0000 );
			return FALSE;
		}
		if( strKey == "runani" )
			pMountAnim->szRun = strFile;
		else if( strKey == "walkani" )
			pMountAnim->szWalk = strFile;
		else
			pMountAnim->szWalkBack = strFile;
#endif // __CLIENT
	}
	else if( strKey != "" )
	{
#ifdef __CLIENT
		g_WndMng.PutString( "/mountset [speed|run|walk|name|fly|flyanim|flymax <value>] [runani|walkani|backani <motion>]", NULL, 0xffff0000 );
#endif // __CLIENT
		return FALSE;
	}
#ifdef __CLIENT
	pMover->ResetMountMotion();
	CString str;
	str.Format( "Mount %d: fGroundSpeed=%.2f; fAnimSpeed=%.2f; fWalkAnimSpeed=%.2f; fNameOffset=%.2f;", pMover->GetMountId(),
		pMountAnim->fGroundSpeed, pMountAnim->fAnimSpeed, pMountAnim->fWalkAnimSpeed, pMountAnim->fNameOffset );
	g_WndMng.PutString( str, NULL, 0xff00ffff );
	str.Format( "szRun=\"%s\"; szWalk=\"%s\"; szWalkBack=\"%s\";", (LPCTSTR)pMountAnim->szRun, (LPCTSTR)pMountAnim->szWalk, (LPCTSTR)pMountAnim->szWalkBack );
	g_WndMng.PutString( str, NULL, 0xff00ffff );
	str.Format( "nType=%d; fFlightSpeed=%.4f; fFlyAnimSpeed=%.2f; fFlyMaxSpeed=%.2f;", (int)pMountAnim->mType, pMountAnim->fFlightSpeed, pMountAnim->fFlyAnimSpeed, pMountAnim->fFlyMaxSpeed );
	g_WndMng.PutString( str, NULL, 0xff00ffff );
#endif // __CLIENT
	return TRUE;
}
#endif // __MOUNT

BOOL TextCmd_Wiki( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_WIKI_ITEMS );
#endif
	return TRUE;
}
BOOL TextCmd_Switch( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_EQ_SWITCH );
#endif
	return TRUE;
}
#ifdef __DONATIONSHOP
BOOL TextCmd_DShop( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_DONATIONSHOP );
#endif
	return TRUE;
}
#endif // __DONATIONSHOP
#ifdef __BATTLEPASS
BOOL TextCmd_BattlePass( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_BATTLEPASS );
#endif
	return TRUE;
}
#endif // __BATTLEPASS
#ifdef __MONSTER_HUNT
BOOL TextCmd_MonsterHunt( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_MONSTERHUNT );
#endif
	return TRUE;
}
#endif // __MONSTER_HUNT
#ifdef __GUILD_FINDER
BOOL TextCmd_GuildFinder( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_GUILD_FIND );
#endif
	return TRUE;
}
#endif	// __GUILD_FINDER
#ifdef __FAST_AWAKE
BOOL TextCmd_FastAwake( CScanner& scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_FASTAWAKE );
#endif
	return TRUE;
}
#endif	// __FAST_AWAKE
BOOL TextCmd_Open( CScanner& scanner )  
{ 
#ifdef __CLIENT
	scanner.GetToken();
	DWORD dwIdApplet = g_WndMng.GetAppletId( scanner.token );
	g_WndMng.CreateApplet( dwIdApplet );
#endif
	return TRUE;
}
BOOL TextCmd_Close( CScanner& scanner )  
{ 
#ifdef __CLIENT
	scanner.GetToken();
	DWORD dwIdApplet = g_WndMng.GetAppletId( scanner.token );
	CWndBase* pWndBase = g_WndMng.GetWndBase( dwIdApplet );
	if( pWndBase ) pWndBase->Destroy();
#endif
	return TRUE;
}

#ifdef __CRASH_REPORT
// /crashtest - admin only: crashes this client on purpose to test CrashRpt (Client\CrashReport\ErrorReports)
BOOL TextCmd_CrashTest( CScanner& scanner )
{
#ifdef __CLIENT
	*(volatile int*)0 = 0;
#endif // __CLIENT
	return TRUE;
}
#endif // __CRASH_REPORT

BOOL TextCmd_Time( CScanner& scanner )  
{ 
#ifdef __CLIENT
	CString string;
	CTime time = CTime::GetCurrentTime();
	//time.Get
	string = time.Format( "Real Time - %H:%M:%S" );
	g_WndMng.PutString( string );
	string.Format( "Madrigal Time - %d:%d:%d\n", g_GameTimer.m_nHour, g_GameTimer.m_nMin, g_GameTimer.m_nSec );
	g_WndMng.PutString( string );
#ifdef __NEW_NIGHT
	// Night Mode diagnostics: what the 24h light table holds now and what reached D3D
	CWorld* pWorld = g_WorldMng.Get();
	if( pWorld )
	{
		int h = g_GameTimer.m_nHour - 1;
		if( h < 0 ) h = 0;
		if( h > 23 ) h = 23;
		const LIGHTCOLOR& c = pWorld->m_k24Light[ h ];
		string.Format( "NightMode %d  use24Light %d  indoor %d  contEnvir %d  bloom %d",
			g_Option.m_bNewNight, pWorld->m_bUsing24Light, pWorld->m_bIsIndoor,
			pWorld->m_kCurContinent._bUseEnvir, g_Option.m_nBloom );
		g_WndMng.PutString( string );
		string.Format( "Table[%d] diffuse %.2f %.2f %.2f  ambient %.2f %.2f %.2f", h, c.r1, c.g1, c.b1, c.r2, c.g2, c.b2 );
		g_WndMng.PutString( string );
		string.Format( "Applied diffuse %.2f %.2f %.2f  ambient %.2f %.2f %.2f",
			CWorld::m_light.Diffuse.r, CWorld::m_light.Diffuse.g, CWorld::m_light.Diffuse.b,
			CWorld::m_light.Ambient.r, CWorld::m_light.Ambient.g, CWorld::m_light.Ambient.b );
		g_WndMng.PutString( string );
	}
#endif // __NEW_NIGHT
	
#endif
	return TRUE;
}

#ifdef __GM_LIST
BOOL TextCmd_GMList( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	vector<char*> GMList = g_UserMng.GetGMList();
	if( GMList.empty() )
	{
		pUser->AddText( "No GM is currently online." );
		return TRUE;
	}

	pUser->AddText( "GMs currently online:" );
	for( int i = 0; i < (int)GMList.size(); ++i )
		pUser->AddText( (LPCSTR)GMList[i] );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __GM_LIST

#ifdef __FREE_PK_TIME
BOOL TextCmd_FreePKStart( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( !FreePKTime::ForceOpen() )
		pUser->AddText( "[Free PK] Free PK Time is already running." );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_FreePKStop( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( !FreePKTime::ForceClose() )
		pUser->AddText( "[Free PK] Free PK Time is not running." );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __FREE_PK_TIME

#ifdef __FL_FFA
// /ffastart [minutes]: announce an FFA now, registration open for [minutes] (default FFA_ANNOUNCE_TIME)
BOOL TextCmd_FFAStart( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	int nMinutes = 0;
	scanner.GetToken();
	if( scanner.tok != FINISHED )
		nMinutes = atoi( scanner.token );
	if( !CFFAManager::GetInstance()->ForceAnnounce( nMinutes ) )
		pUser->AddText( "[FFA] Cannot start: an FFA is already running, FFAManager.inc has an error, or this is not channel 1. See /ffainfo." );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffarefund: cancel the running FFA, refund the fees, everyone back to Flarine (no rewards)
BOOL TextCmd_FFARefund( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( !CFFAManager::GetInstance()->ForceStop() )
		pUser->AddText( "[FFA] No FFA is running." );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffaskip: next phase now (registration closes -> arena open -> battle starts; ending -> all to Flarine)
BOOL TextCmd_FFASkip( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( CFFAManager::GetInstance()->ForceSkip( pUser ) )
		pUser->AddText( "[FFA] Skipped to the next phase." );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffaend: finish the battle now - winner, PVP Tokens, everyone to Flarine 15 s later
BOOL TextCmd_FFAEnd( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	CFFAManager::GetInstance()->ForceEnd( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffanext: when the next scheduled FFA starts
BOOL TextCmd_FFANext( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CFFAManager::GetInstance()->SendNext( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffainfo: state + every registered player (kills, deaths, lives, where)
BOOL TextCmd_FFAInfo( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CFFAManager::GetInstance()->SendInfo( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /ffareload: read FFAManager.inc again (only while no FFA runs)
BOOL TextCmd_FFAReload( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CFFAManager::GetInstance()->ReadConfig( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __FL_FFA

#ifdef __FL_EQUALIZED_MODE
// /savetmp: inside an equalized event, your current bag (equipped + bag items) becomes the preset of that event
// for your gender and class
BOOL TextCmd_EqSavePreset( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CEqualizedPvP::GetInstance()->SavePreset( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /copytmp FFA TDM: every preset of one event copied to another
BOOL TextCmd_EqCopyPresets( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;
	scanner.GetToken();
	const int nFrom = CEqualizedPvP::EventFromName( scanner.token );
	scanner.GetToken();
	const int nTo = CEqualizedPvP::EventFromName( scanner.token );
	if( nFrom < 0 || nTo < 0 || nFrom == nTo )
	{
		pUser->AddText( "[Equalized] Use: /copytmp FFA TDM (events: FFA, TDM, GS)" );
		return TRUE;
	}
	CEqualizedPvP::GetInstance()->CopyPresets( pUser, nFrom, nTo );
#endif // __WORLDSERVER
	return TRUE;
}

// /eqreload: read EqualizedPvP.inc again
BOOL TextCmd_EqReload( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CEqualizedPvP::GetInstance()->ReadConfig( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __FL_EQUALIZED_MODE

#ifdef __FL_TDM
// /tdmstart [minutes]: announce an TDM now, registration open for [minutes] (default TDM_ANNOUNCE_TIME)
BOOL TextCmd_TDMStart( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	int nMinutes = 0;
	scanner.GetToken();
	if( scanner.tok != FINISHED )
		nMinutes = atoi( scanner.token );
	if( !CTDMManager::GetInstance()->ForceAnnounce( nMinutes ) )
		pUser->AddText( "[TDM] Cannot start: an TDM is already running, TDMManager.inc has an error, or this is not channel 1. See /tdminfo." );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdmrefund: cancel the running TDM, refund the fees, everyone back to Flarine (no rewards)
BOOL TextCmd_TDMRefund( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( !CTDMManager::GetInstance()->ForceStop() )
		pUser->AddText( "[TDM] No TDM is running." );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdmskip: next phase now (registration closes -> arena open -> battle starts; ending -> all to Flarine)
BOOL TextCmd_TDMSkip( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	if( CTDMManager::GetInstance()->ForceSkip( pUser ) )
		pUser->AddText( "[TDM] Skipped to the next phase." );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdmend: finish the battle now - winner, PVP Tokens, everyone to Flarine 15 s later
BOOL TextCmd_TDMEnd( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	CTDMManager::GetInstance()->ForceEnd( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdmnext: when the next scheduled TDM starts
BOOL TextCmd_TDMNext( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CTDMManager::GetInstance()->SendNext( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdminfo: state + every registered player (kills, deaths, lives, where)
BOOL TextCmd_TDMInfo( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CTDMManager::GetInstance()->SendInfo( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /tdmreload: read TDMManager.inc again (only while no TDM runs)
BOOL TextCmd_TDMReload( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CTDMManager::GetInstance()->ReadConfig( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __FL_TDM

BOOL TextCmd_ChangeShopCost( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	FLOAT f = scanner.GetFloat();
	int nAllServer = scanner.GetNumber();

	if( f > 2.0f )
		f = 1.0f;
	else if( f < 0.5f )
		f = 1.0f;

	if( nAllServer != 0 )
	{
		g_DPCoreClient.SendGameRate( f, GAME_RATE_SHOPCOST );
		return TRUE;
	}

	prj.m_fShopCost = f;	
	g_UserMng.AddGameRate( prj.m_fShopCost, GAME_RATE_SHOPCOST );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_SetMonsterRespawn( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	D3DXVECTOR3 vPos	= pUser->GetPos();
	CWorld* pWorld	= pUser->GetWorld();
	
	MoverProp* pMoverProp	= NULL;

	scanner.GetToken();
	if( scanner.tokenType == NUMBER ) 
	{
		DWORD dwID	= _ttoi( scanner.Token );
		pMoverProp = prj.GetMoverPropEx( dwID );

	}
	else
		pMoverProp	= prj.GetMoverProp( scanner.Token );

	if( pMoverProp && pMoverProp->dwID != 0 )
	{
		DWORD dwNum	= scanner.GetNumber();
		if( dwNum > 30 ) dwNum = 30;
		if( dwNum < 1 ) dwNum = 1;

		DWORD dwAttackNum	= scanner.GetNumber();
		if( dwAttackNum > dwNum ) dwAttackNum = dwNum;
		if( dwAttackNum < 1 ) dwAttackNum = 0;

		DWORD dwRect = scanner.GetNumber();
		if( dwRect > 255 ) dwRect = 255;
		if( dwRect < 1 ) dwRect = 1;

		DWORD dwTime = scanner.GetNumber();
		if( dwTime > 10800 ) dwTime = 10800;
		if( dwTime < 10 ) dwTime = 10;

		int nAllServer = scanner.GetNumber();
		if( nAllServer != 0 )
		{
			BOOL bFlying = FALSE;
			if( pMoverProp->dwFlying )
				bFlying = TRUE;
			g_DPCoreClient.SendSetMonsterRespawn( pUser->m_idPlayer, pMoverProp->dwID, dwNum, dwAttackNum, dwRect, dwTime, bFlying );
			return TRUE;
		}

		CRespawnInfo ri;
		ri.m_dwType = OT_MOVER;
		ri.m_dwIndex = pMoverProp->dwID;
		ri.m_cb = dwNum;
		ri.m_nActiveAttackNum = dwAttackNum;
		if( pMoverProp->dwFlying != 0 )
			ri.m_vPos = vPos;
		ri.m_rect.left		= (LONG)( vPos.x - dwRect );
		ri.m_rect.right		= (LONG)( vPos.x + dwRect );
		ri.m_rect.top		= (LONG)( vPos.z - dwRect );
		ri.m_rect.bottom	= (LONG)( vPos.z + dwRect );
		ri.m_uTime			= (u_short)( dwTime );
		ri.m_cbTime			= 0;

		char chMessage[512] = {0,};
#ifdef __S1108_BACK_END_SYSTEM
			pWorld->m_respawner.Add( ri, TRUE );
#else // __S1108_BACK_END_SYSTEM
		pWorld->m_respawner.Add( ri );
#endif // __S1108_BACK_END_SYSTEM

		sprintf( chMessage, "Add Respwan Monster : %s(%d/%d) Rect(%d, %d, %d, %d) Time : %d", 
			pMoverProp->szName, ri.m_cb, ri.m_nActiveAttackNum, ri.m_rect.left, ri.m_rect.right, ri.m_rect.top, ri.m_rect.bottom, ri.m_uTime );
		pUser->AddText( chMessage );
	}
#endif	// __WORLDSERVER
	return TRUE;
}

#ifdef __S1108_BACK_END_SYSTEM

BOOL TextCmd_PropMonster( CScanner & scanner )
{
#ifdef __CLIENT
	char chMessage[1024] = {0,};
	if( 0 < prj.m_nAddMonsterPropSize )
	{
		for( int i = 0 ; i < prj.m_nAddMonsterPropSize ; ++i )
		{
			sprintf( chMessage, "Monster Prop(%s) AttackPower(%d), Defence(%d), Exp(%d), Hitpioint(%d), ItemDorp(%d), Penya(%d)", 
				prj.m_aAddProp[i].szMonsterName, prj.m_aAddProp[i].nAttackPower, prj.m_aAddProp[i].nDefence, prj.m_aAddProp[i].nExp,
				prj.m_aAddProp[i].nHitPoint, prj.m_aAddProp[i].nItemDrop, prj.m_aAddProp[i].nPenya	);
			g_WndMng.PutString( chMessage, NULL, 0xffff0000, CHATSTY_GENERAL );
		}
	}
	else
	{
		sprintf( chMessage, "Monster Prop Not Data" );
		g_WndMng.PutString( chMessage, NULL, 0xffff0000, CHATSTY_GENERAL );
	}
#endif	// __CLIENT
	return TRUE;
}
#endif // __S1108_BACK_END_SYSTEM

BOOL TextCmd_GameSetting( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->AddGameSetting();	
#endif // __WORLDSERVER
	return TRUE;	
}

BOOL TextCmd_ChangeFace( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;

	DWORD dwFace = scanner.GetNumber();
	if( dwFace < 0 || 4 < dwFace )
		return TRUE;
	
	if( (pUser->m_dwMode & NOTFRESH_MODE) || (pUser->m_dwMode & NOTFRESH_MODE2) )
	{
		pUser->m_dwHeadMesh = dwFace;
		g_UserMng.AddChangeFace( pUser->m_idPlayer, dwFace );
		if( pUser->m_dwMode & NOTFRESH_MODE )
		{
			pUser->m_dwMode &= ~NOTFRESH_MODE;
			pUser->AddDefinedText( TID_CHANGEFACE_ONE, "" );
//			pUser->AddText( "얼굴변경을 한번 사용하였습니다" );
		}
		else
		{
			pUser->m_dwMode &= ~NOTFRESH_MODE2;
			pUser->AddDefinedText( TID_CHANGEFACE_TWO, "" );
//			pUser->AddText( "얼굴변경을 2번 사용하였습니다" );
		}
	}
	else
	{
		pUser->AddDefinedText( TID_CHANGEFACE_THREE, "" );
//		pUser->AddText( "얼굴변경을 2번 모두 사용하여 사용할수 없습니다" );
	}
#else // __WORLDSERVER
	CWndChangeSex* pWndChangeSex	= (CWndChangeSex*)g_WndMng.GetWndBase( APP_CHANGESEX );
	if( NULL == pWndChangeSex )
	{
		pWndChangeSex	= new CWndChangeSex;
		pWndChangeSex->Initialize();
	}
	pWndChangeSex->SetData( NULL_ID, NULL_ID );
	return FALSE;
#endif
	return TRUE;
}

BOOL TextCmd_AroundKill( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( pUser->GetWeaponItem() == NULL )
		return TRUE;

	CWorld* pWorld	= pUser->GetWorld();
	if( pWorld )
		pUser->SendDamageAround( AF_MAGICSKILL, (CMover*)pUser, OBJTYPE_MONSTER, 1, 64.0f, 0.0, 1.0f );
#endif // __WORLDSERVER
	return TRUE;
}

#if __VER >= 9	// __PET_0410
BOOL	TextCmd_PetLevel( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CPet* pPet	= pUser->GetPet();
	if( pPet && pPet->GetExpPercent() == 100 )
		pUser->PetLevelup();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL	TextCmd_MakePetFeed( CScanner & s )
{
#ifdef __CLIENT
	if( g_WndMng.m_pWndPetFoodMill == NULL )
	{
		SAFE_DELETE( g_WndMng.m_pWndPetFoodMill );
		g_WndMng.m_pWndPetFoodMill = new CWndPetFoodMill;
		g_WndMng.m_pWndPetFoodMill->Initialize( &g_WndMng, APP_PET_FOOD );
		return FALSE;
	}
#endif	// __CLIENT
	return TRUE;
}

BOOL	TextCmd_PetExp( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CPet* pPet	= pUser->GetPet();
	if( pPet && pPet->GetLevel() != PL_S )
	{
		pPet->SetExp( MAX_PET_EXP );
		pUser->AddPetSetExp( pPet->GetExp() );
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Pet( CScanner & s )
{
	// /pet 1 100
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
#if __VER >= 11 // __SYS_PLAYER_DATA
	DWORD idPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
#else	// __SYS_PLAYER_DATA
	DWORD idPlayer	= prj.GetPlayerID( s.token );
#endif	// __SYS_PLAYER_DATA
	if( idPlayer == 0 )	//
		return TRUE;
	CUser* pTarget	= (CUser*)prj.GetUserByID( idPlayer );
	if( IsValidObj( pTarget ) == FALSE )
		return TRUE;
	CPet* pPet	= pTarget->GetPet();
	if( pPet == NULL )	//
		return TRUE;

	// kind
	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
	BYTE nKind	= atoi( s.token );
	if( nKind >= PK_MAX )
		return TRUE;

	// exp
	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
	BYTE nExpRate	= atoi( s.token );

	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
	BYTE nLevel		= s.Token.GetLength();

	if( nLevel > PL_S )
		return TRUE;

	BYTE anAvail[PL_MAX - 1]	= { 0,};
	char sAvail[2]	= { 0,};
	
	for( int i = 0; i < nLevel; i++ )
	{
		sAvail[0]	= s.Token.GetAt( i );
		sAvail[1]	= '\0';
		anAvail[i]	= atoi( sAvail );
		if( anAvail[i] < 1 || anAvail[i] > 9 )
			return TRUE;
	}

	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
	BYTE nLife	= atoi( s.token );
	if( nLife > 99 )
		nLife	= 99;

	CItemElem* pItemElem	= pTarget->GetPetItem();
	pPet->SetKind( nKind );
	pPet->SetLevel( nLevel );
	if( nLevel == PL_EGG )
		pPet->SetKind( 0 );	// initialize
	pItemElem->m_dwItemId	= pPet->GetItemId();
	pPet->SetEnergy( pPet->GetMaxEnergy() );
	DWORD dwExp		= pPet->GetMaxExp() * nExpRate / 100;
	pPet->SetExp( dwExp );

	for( int i = PL_D; i <= nLevel; i++ )
		pPet->SetAvailLevel( i, anAvail[i-1] );
	for( int i = nLevel + 1; i <= PL_S; i++ )
		pPet->SetAvailLevel( i, 0 );

	pPet->SetLife( nLife );

	if( pTarget->HasPet() )
		pTarget->RemovePet();

	g_dpDBClient.CalluspPetLog( pTarget->m_idPlayer, pItemElem->GetSerialNumber(), 0, PETLOGTYPE_LEVELUP, pPet );

	pTarget->AddPet( pPet, PF_PET_GET_AVAIL );	// 自
	g_UserMng.AddPetLevelup( pTarget, MAKELONG( (WORD)pPet->GetIndex(), (WORD)pPet->GetLevel() ) );	// 他
#endif	// __WORLDSERVER
	return TRUE;
}

#endif	// __PET_0410

#if __VER >= 11 // __SYS_POCKET
BOOL	TextCmd_MoveItem_Pocket( CScanner & s )
{
#ifdef __CLIENT
	int	nPocket1	= s.GetNumber();
	int nData	= s.GetNumber();
	int nNum	= s.GetNumber();
	int	nPocket2	= s.GetNumber();
	CItemElem* pItem	= NULL;
	if( nPocket1 < 0 )
		pItem	= g_pPlayer->m_Inventory.GetAt( nData );
	else
	{
		pItem	= g_pPlayer->m_Pocket.GetAtId( nPocket1, nData );
	}
	if( pItem )
		g_DPlay.SendMoveItem_Pocket( nPocket1, pItem->m_dwObjId, nNum, nPocket2 );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_AvailPocket( CScanner & s )
{
#ifdef __CLIENT
	int nPocket		= s.GetNumber();
	CItemElem* pItemElem	= g_pPlayer->m_Inventory.GetAt( 0 );
	if( pItemElem )
		g_DPlay.SendAvailPocket( nPocket, pItemElem->m_dwObjId );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_PocketView( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->AddPocketView();
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __SYS_POCKET

#if __VER >= 11 // __SYS_COLLECTING
BOOL TextCmd_RefineCollector( CScanner & s )
{
// 0번째
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	int nAbilityOption	= s.GetNumber();
	if( s.tok == FINISHED )
		nAbilityOption	= 0;
	if( nAbilityOption > 5 )
		nAbilityOption	= 5;
	CItemElem* pTarget	= pUser->m_Inventory.GetAt( 0 );
	if( pTarget && pTarget->IsCollector( TRUE ) )
	{
		pUser->AddDefinedText( TID_UPGRADE_SUCCEEFUL );
		pUser->AddPlaySound( SND_INF_UPGRADESUCCESS );
		if( pUser->IsMode( TRANSPARENT_MODE ) == 0 )
			g_UserMng.AddCreateSfxObj( pUser, XI_INT_SUCCESS, pUser->GetPos().x, pUser->GetPos().y, pUser->GetPos().z );
		pUser->UpdateItem( (WORD)( pTarget->m_dwObjId ), UI_AO,  nAbilityOption );
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_StartCollecting( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->StartCollecting();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_StopCollecting( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->StopCollecting();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_DoUseItemBattery( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->DoUseItemBattery();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_RefineAccessory( CScanner & s )
{
	// 0번째
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	int nAbilityOption	= s.GetNumber();
	if( s.tok == FINISHED )
		nAbilityOption	= 0;
	CItemElem* pTarget	= pUser->m_Inventory.GetAt( 0 );
	if( pTarget && pTarget->IsAccessory() )
		pUser->UpdateItem( (WORD)( pTarget->m_dwObjId ), UI_AO,  nAbilityOption );
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __SYS_COLLECTING

#if __VER >= 11 // __SYS_IDENTIFY
BOOL TextCmd_SetRandomOption( CScanner & s )
{
#ifdef __WORLDSERVER
    CUser* pUser    = (CUser*)s.dwValue;
    CItemElem* pItemElem    = pUser->m_Inventory.GetAt( 0 );
    if( pItemElem )
    {
        int nRandomOptionKind    = g_xRandomOptionProperty->GetRandomOptionKind( pItemElem );
        if( nRandomOptionKind >= 0 )
        {
            g_xRandomOptionProperty->InitializeRandomOption( pItemElem->GetRandomOptItemIdPtr() );
            int nDst, nAdj;
            int cb    = 0;
            nDst    = s.GetNumber();
            while( s.tok != FINISHED )
            {
                nAdj    = s.GetNumber();
                if( nDst == 48 )
                    break;
                if ( nDst > 96 || nDst < 1 )
                    break;
                if ( nAdj > 512 || nAdj < -512 )
                    break;
                g_xRandomOptionProperty->SetParam( pItemElem->GetRandomOptItemIdPtr(), nDst, nAdj );
                cb++;
                if( cb >= MAX_RANDOM_OPTION )
                    break;
                nDst    = s.GetNumber();
            }
            pUser->UpdateItemEx( (WORD)( pItemElem->m_dwObjId ), UI_RANDOMOPTITEMID, pItemElem->GetRandomOptItemId() );
        }
    }
#endif    // __WORLDSERVER
    return TRUE;
}

BOOL TextCmd_GenRandomOption( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
//	int i	= s.GetNumber();
	CItemElem* pItemElem	= pUser->m_Inventory.GetAt( 0 );
	if( pItemElem )
	{
		int nRandomOptionKind	= g_xRandomOptionProperty->GetRandomOptionKind( pItemElem );
		if( nRandomOptionKind >= 0 )	// 아이템 각성, 여신의 축복이 가능한 대상
		{
			g_xRandomOptionProperty->InitializeRandomOption( pItemElem->GetRandomOptItemIdPtr() );
			g_xRandomOptionProperty->GenRandomOption( pItemElem->GetRandomOptItemIdPtr(), nRandomOptionKind, pItemElem->GetProp()->dwParts );
			pUser->UpdateItemEx( (WORD)( pItemElem->m_dwObjId ), UI_RANDOMOPTITEMID, pItemElem->GetRandomOptItemId() );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_PickupPetAwakeningCancel( CScanner & s )
{
#ifdef __CLIENT
	SAFE_DELETE( g_WndMng.m_pWndPetAwakCancel );
	g_WndMng.m_pWndPetAwakCancel = new CWndPetAwakCancel;
	g_WndMng.m_pWndPetAwakCancel->Initialize(&g_WndMng);
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_InitializeRandomOption( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
//	int i	= s.GetNumber();
	CItemElem* pItemElem	= pUser->m_Inventory.GetAt( 0 );
	if( pItemElem )
	{
		int nRandomOptionKind	= g_xRandomOptionProperty->GetRandomOptionKind( pItemElem );
		if( nRandomOptionKind >= 0 )	// 아이템 각성, 여신의 축복이 가능한 대상
		{
			g_xRandomOptionProperty->InitializeRandomOption( pItemElem->GetRandomOptItemIdPtr() );
			pUser->UpdateItemEx( (WORD)( pItemElem->m_dwObjId ), UI_RANDOMOPTITEMID, pItemElem->GetRandomOptItemId() );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ItemLevel( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	int i	= s.GetNumber();
	if( s.tok == FINISHED )
		i	= 0;
	CItemElem* pTarget	= pUser->m_Inventory.GetAt( 0 );
	if( pTarget )
	{
		ItemProp* pProp	= pTarget->GetProp();
		if( pProp->dwParts != NULL_ID && pProp->dwLimitLevel1 != 0xFFFFFFFF )
		{
			pTarget->SetLevelDown( i );
			pUser->UpdateItemEx( (WORD)( pTarget->m_dwObjId ), UI_RANDOMOPTITEMID, pTarget->GetRandomOptItemId() );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __SYS_IDENTIFY

BOOL TextCmd_Level( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	scanner.GetToken();
	CString strJob = scanner.Token;

	int nJob = JOB_VAGRANT;

	LONG nLevel = scanner.GetNumber();
	
	if( nLevel == 0 )
		nLevel = 1;

	for( int i = 0 ; i < MAX_JOB ; i++ )
	{
		if( strcmp( strJob, prj.m_aJob[i].szName ) == 0 || strcmp( strJob, prj.m_aJob[i].szEName ) == 0 )
		{
			nJob = i;
			break;
		}
	}

	char chMessage[MAX_PATH] = {0,};
	if( MAX_JOB_LEVEL < nLevel && nJob == 0 )
	{
		sprintf( chMessage, prj.GetText(TID_GAME_CHOICEJOB) );
		pUser->AddText( chMessage );		
		return TRUE;
	}

#if __VER >= 10 // __LEGEND	//	10차 전승시스템	Neuz, World, Trans
	LONG	nLegend = scanner.GetNumber();
	if( ( nLegend > 0 ) && ( nLegend < 4 ) )
	{
		for( int i = nJob + 1 ; i < MAX_JOB ; i++ )
		{
			if( strcmp( strJob, prj.m_aJob[i].szName ) == 0 || strcmp( strJob, prj.m_aJob[i].szEName ) == 0 )
			{
				nJob = i;
				if( nLegend == 1 )
					break;
				else
					nLegend--;
			}
		}

		pUser->InitLevel( nJob, nLevel );	// lock
		return	TRUE;
	}
#endif	//__LEGEND	//	10차 전승시스템	Neuz, World, Trans
	
	if( nLevel <= MAX_JOB_LEVEL )	
	{
		pUser->InitLevel( JOB_VAGRANT, nLevel );	// lock
	}
	else
	if( MAX_JOB_LEVEL < nLevel &&  nLevel <= MAX_JOB_LEVEL + MAX_EXP_LEVEL )
	{
		if( MAX_JOBBASE <= nJob && nJob < MAX_EXPERT)
		{
			pUser->InitLevel( nJob, nLevel );	// lock
		}
		else
		{
			sprintf( chMessage, "Not Expert Job" );
			pUser->AddText( chMessage );
			sprintf( chMessage, "Expert Job : " );
			for( int i = MAX_JOBBASE ; i < MAX_EXPERT ; ++i )
			{
				if( strlen( prj.m_aJob[i].szName ) < 15 )
				{
					strcat( chMessage, prj.m_aJob[i].szName );
					if( i + 1 != MAX_EXPERT )
					{
						strcat( chMessage, ", ");
					}
				}
			}
			pUser->AddText( chMessage );
			sprintf( chMessage, "Expert Level : %d ~ %d", MAX_JOB_LEVEL + 1, MAX_JOB_LEVEL + MAX_EXP_LEVEL );
			pUser->AddText( chMessage );
			return TRUE;
		}
	}
	else
	if( MAX_JOB_LEVEL + MAX_EXP_LEVEL < nLevel && nLevel < MAX_GENERAL_LEVEL + 1 )
	{
		if( MAX_EXPERT <= nJob && nJob < MAX_PROFESSIONAL )
		{
			pUser->InitLevel( nJob, nLevel );	// lock
		}
		else
		{
			sprintf( chMessage, "Not Professional Job" );
			pUser->AddText( chMessage );
			sprintf( chMessage, "Professional Job : " );
			for( int i = MAX_EXPERT ; i < MAX_PROFESSIONAL ; ++i )
			{
				if( strlen( prj.m_aJob[i].szName ) < 15 )
				{
					strcat( chMessage, prj.m_aJob[i].szName );
					if( i + 1 != MAX_PROFESSIONAL )
					{
						strcat( chMessage, ", ");
					}
				}
			}
			pUser->AddText( chMessage );
			sprintf( chMessage, "Professional Level : %d ~~~ ", MAX_JOB_LEVEL + MAX_EXP_LEVEL + 1 );
			pUser->AddText( chMessage );
			return TRUE;
		}
	}
#endif // __WORLDSERVER
	return TRUE;
}

#ifdef __SFX_OPT
BOOL TextCmd_SfxLv( CScanner & scanner )
{
	int nLevel = scanner.GetNumber();
	if(nLevel > 5) nLevel = 5;
	if(nLevel < 0) nLevel = 0;
	g_Option.m_nSfxLevel = nLevel;

	return TRUE;
}
#endif

BOOL TextCmd_ChangeJob( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	scanner.GetToken();
	CString strJob = scanner.Token;
	
	int nJob = JOB_VAGRANT;
	
	for( int i = 0 ; i < MAX_JOB ; i++ )
	{
		if( strcmp( strJob, prj.m_aJob[i].szName ) == 0 || strcmp( strJob, prj.m_aJob[i].szEName ) == 0 )
		{
			nJob = i;
			break;
		}
	}
	
	char chMessage[MAX_PATH] = {0,};
	if( nJob == 0 )
	{
		sprintf( chMessage, "Error Job Name or Number" );
		pUser->AddText( chMessage );		
		return TRUE;
	}
	
	if( pUser->AddChangeJob( nJob ) )
	{
		( (CUser*)pUser )->AddSetChangeJob( nJob );
		g_UserMng.AddNearSetChangeJob( (CMover*)pUser, nJob, &pUser->m_aJobSkill[MAX_JOB_SKILL] );
		g_dpDBClient.SendLogLevelUp( (CUser*)pUser, 4 );
#if __VER >= 11 // __SYS_PLAYER_DATA
		g_dpDBClient.SendUpdatePlayerData( pUser );
#else	// __SYS_PLAYER_DATA
		g_DPCoreClient.SendPartyMemberJob( (CUser*)pUser );
		g_DPCoreClient.SendFriendChangeJob( (CUser*)pUser );
		if( pUser->m_idGuild != 0 )
			g_DPCoreClient.SendGuildChangeJobLevel( (CUser*)pUser );
#endif	// __SYS_PLAYER_DATA
		return TRUE;
	}
	else
	{
		sprintf( chMessage, "Error 1ch -> 2ch" );
		pUser->AddText( chMessage );		
		return TRUE;
	}

#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_stat( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	scanner.GetToken();
	CString strstat = scanner.Token;
	
	DWORD dwNum	= scanner.GetNumber();

	if( 2 <= strstat.GetLength() && strstat.GetLength() <= 7)
	{
		strstat.MakeLower();

		if( strcmp( strstat, "str" ) == 0 )
		{
			pUser->m_nStr = dwNum;
		}
		else
		if( strcmp( strstat, "sta" ) == 0 )
		{
			pUser->m_nSta = dwNum;
		}
		else
		if( strcmp( strstat, "dex" ) == 0 )
		{
			pUser->m_nDex = dwNum;
		}
		else
		if( strcmp( strstat, "int" ) == 0 )
		{
			pUser->m_nInt = dwNum;
		}
		else
		if( strcmp( strstat, "gp" ) == 0 )
		{
			pUser->m_nRemainGP = dwNum;
		}
		else
		if( strcmp( strstat, "restate" ) == 0 )
		{
			pUser->ReState();
			return FALSE;
		}
#if __VER >= 8 //__CSC_VER8_6
		else if( strcmp( strstat, "all" ) == 0 )
		{
			pUser->m_nStr = dwNum;
			pUser->m_nSta = dwNum;
			pUser->m_nDex = dwNum;
			pUser->m_nInt = dwNum;
		}
#endif //__CSC_VER8_6
		else
		{
			strstat += "unknown setting target";
			pUser->AddText( strstat );
			return FALSE;
		}
	}
	else
	{
		strstat += "unknown setting target";
		pUser->AddText( strstat );
		return FALSE;
	}

	pUser->AddSetState( pUser->m_nStr, pUser->m_nSta, pUser->m_nDex, pUser->m_nInt, pUser->m_nRemainGP );
#if __VER >= 13 // __HONORABLE_TITLE			// 달인
	pUser->CheckHonorStat();
	pUser->AddHonorListAck();
	g_UserMng.AddHonorTitleChange( pUser, pUser->m_nHonor);
#endif	// __HONORABLE_TITLE			// 달인
#endif // __WORLDSERVER
	return TRUE;
}

#ifdef __REBIRTH_SYSTEM
// GM testing tool: force your own rebirth tier directly, same spirit as /stat
// above. No stone cost and no level-60 reset, so testers can jump straight to
// any tier. Raising the tier also pays out what real rebirths would have: every
// tier's 1Rebirth.inc gift on the way, plus the rebirth GP difference between
// the old and new tier. Lowering it removes nothing.
BOOL TextCmd_SetRebirthLevel( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	int nTier = scanner.GetNumber();
	if( nTier < 0 )
		nTier = 0;
	if( nTier > (int)prj.GetMaximumRebirthLevel() )
		nTier = prj.GetMaximumRebirthLevel();

	int nOld = pUser->m_nReb;
	pUser->m_nReb = nTier;

	if( nTier > nOld )
	{
		// the GP column is each tier's TOTAL bonus (see 1Rebirth.inc), so only
		// the difference is added - same end result as real rebirths
		int nGP = prj.GetRebirthProperty( (USHORT)nTier ).nStatPoint
			- prj.GetRebirthProperty( (USHORT)nOld ).nStatPoint;
		for( int t = nOld + 1; t <= nTier; ++t )
			pUser->GiveRebirthGift( (USHORT)t );
		pUser->m_nRemainGP += nGP;
		pUser->AddSetGrowthLearningPoint( pUser->m_nRemainGP );

		CString strMsg;
		strMsg.Format( "[GM] Rebirth %d -> %d: +%d stat points, tier gifts added (inventory or mail).", nOld, nTier, nGP );
		pUser->AddText( strMsg );
	}
	g_UserMng.AddRebirthLevelUp( pUser );
	g_dpDBClient.SendUpdatePlayerData( pUser );	// guild member lists show the new tier (real rebirths send it via InitLevel)
#ifdef __BADGE_SYSTEM
	pUser->BadgeCheckMilestones();
#endif // __BADGE_SYSTEM
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __REBIRTH_SYSTEM

#ifdef __BADGE_SYSTEM
// GM testing tool for the Badge System: unlock / remove / select badges and set the running
// KILL / USE_ITEM counters by hand, then relog to check that everything was saved.
//   /badge info            selected badge, unlocked badges, counters (also: /badge alone)
//   /badge add <id>        unlock a badge
//   /badge del <id>        remove an unlocked badge (if it was selected: back to the job icon)
//   /badge set <id>        select: 0 = job icon, -1 = no icon, or an unlocked badge ID
//   /badge count <id> <n>  set a KILL / USE_ITEM badge's counter (0 clears it)
static LPCTSTR GetBadgeSelectName( int nId )
{
	if( nId == BADGE_DEFAULT )
		return "Default Job Badge";
	if( nId == BADGE_HIDDEN )
		return "Remove Badge";
	const BadgeProp* pBadge = CBadge::GetInstance()->GetBadge( nId );
	return pBadge ? pBadge->m_strName.c_str() : "not in Badge.inc";
}

BOOL TextCmd_Badge( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	CString strMsg;

	scanner.GetToken();
	CString strSub	= scanner.Token;
	strSub.MakeLower();

	if( strSub == "add" || strSub == "del" || strSub == "set" || strSub == "count" )
	{
		int nId = scanner.GetNumber();
		const BadgeProp* pBadge = CBadge::GetInstance()->GetBadge( nId );

		if( strSub == "set" )
		{
			if( nId != BADGE_DEFAULT && nId != BADGE_HIDDEN && ( !pBadge || !pUser->m_PlayerBadges.IsOwned( nId ) ) )
				strMsg.Format( "[GM] Badge %d is not unlocked - /badge add %d first (0 = job icon, -1 = no icon).", nId, nId );
			else
			{
				pUser->m_nBadge = nId;
				strMsg.Format( "[GM] Selected badge: %d (%s)", nId, GetBadgeSelectName( nId ) );
			}
		}
		else if( !pBadge )
			strMsg.Format( "[GM] There is no badge %d in Badge.inc.", nId );
		else if( strSub == "add" )
		{
			if( pUser->m_PlayerBadges.AddOwned( nId ) )
				strMsg.Format( "[GM] Unlocked badge %d: %s", nId, pBadge->m_strName.c_str() );
			else
				strMsg.Format( "[GM] Badge %d (%s) was already unlocked.", nId, pBadge->m_strName.c_str() );
		}
		else if( strSub == "del" )
		{
			if( pUser->m_PlayerBadges.RemoveOwned( nId ) )
			{
				if( pUser->m_nBadge == nId )
					pUser->m_nBadge = BADGE_DEFAULT;
				strMsg.Format( "[GM] Removed badge %d: %s", nId, pBadge->m_strName.c_str() );
			}
			else
				strMsg.Format( "[GM] Badge %d (%s) was not unlocked.", nId, pBadge->m_strName.c_str() );
		}
		else	// count
		{
			int nCount = scanner.GetNumber();
			if( nCount < 0 )
				nCount = 0;
			if( !pBadge->IsCounted() )
				strMsg.Format( "[GM] Badge %d (%s) has no counter - only KILL / USE_ITEM badges count.", nId, pBadge->m_strName.c_str() );
			else if( pUser->m_PlayerBadges.IsOwned( nId ) )
				strMsg.Format( "[GM] Badge %d (%s) is already unlocked - /badge del %d first.", nId, pBadge->m_strName.c_str(), nId );
			else
			{
				pUser->m_PlayerBadges.SetProgress( nId, (DWORD)nCount );
				strMsg.Format( "[GM] Badge %d (%s) counter: %d / %u", nId, pBadge->m_strName.c_str(), nCount, pBadge->m_dwAmount );
			}
		}
		pUser->AddText( strMsg );
		pUser->AddBadgeOwned();
		g_UserMng.AddBadgeUpdate( pUser );
		return TRUE;
	}

	// all: unlock every badge in Badge.inc / clear: remove every badge and counter (fresh test start)
	if( strSub == "all" || strSub == "clear" )
	{
		if( strSub == "all" )
		{
			int nNew = 0;
			const std::map<int, BadgeProp>& mBadges = CBadge::GetInstance()->GetAllBadges();
			for( std::map<int, BadgeProp>::const_iterator it = mBadges.begin(); it != mBadges.end(); ++it )
				if( pUser->m_PlayerBadges.AddOwned( it->first ) )
					++nNew;
			strMsg.Format( "[GM] Unlocked %d new badge(s) - you now own all %d.", nNew, (int)mBadges.size() );
		}
		else
		{
			int nOwned = (int)pUser->m_PlayerBadges.GetOwned().size();
			pUser->m_PlayerBadges.Clear();
			pUser->m_nBadge = BADGE_DEFAULT;
			strMsg.Format( "[GM] Removed all %d badge(s) and every counter. Level / rebirth badges come back at the next login.", nOwned );
		}
		pUser->AddText( strMsg );
		pUser->AddBadgeOwned();
		g_UserMng.AddBadgeUpdate( pUser );
		return TRUE;
	}

	// info
	strMsg.Format( "[GM] Selected badge: %d (%s)", pUser->m_nBadge, GetBadgeSelectName( pUser->m_nBadge ) );
	pUser->AddText( strMsg );

	const std::set<int>& setOwned = pUser->m_PlayerBadges.GetOwned();
	strMsg.Format( "[GM] Unlocked: %d badge(s)", (int)setOwned.size() );
	pUser->AddText( strMsg );
	for( std::set<int>::const_iterator it = setOwned.begin(); it != setOwned.end(); ++it )
	{
		strMsg.Format( "    %d  %s", *it, GetBadgeSelectName( *it ) );
		pUser->AddText( strMsg );
	}

	const std::map<int, DWORD>& mProgress = pUser->m_PlayerBadges.GetAllProgress();
	strMsg.Format( "[GM] Counting: %d badge(s)", (int)mProgress.size() );
	pUser->AddText( strMsg );
	for( std::map<int, DWORD>::const_iterator it = mProgress.begin(); it != mProgress.end(); ++it )
	{
		const BadgeProp* pBadge = CBadge::GetInstance()->GetBadge( it->first );
		strMsg.Format( "    %d  %s  %u / %u", it->first, GetBadgeSelectName( it->first ), it->second, pBadge ? pBadge->m_dwAmount : 0 );
		pUser->AddText( strMsg );
	}
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __BADGE_SYSTEM

#ifdef __OVERHEAD_TITLE
// GM tool for the overhead titles (players pick their own in the Character window's Title tab, WndOverheadTitle.cpp):
//   /title spender <name> 1|2|3|off   give / take a Top Spender rank (the player must be online on this server)
//   /title set <n>                    your own title: 0 = Auto, -1 = Hide, 1-5 = a title you own right now
//   /title info [name]                Top Spender rank, chosen title and the title that shows (also: /title alone)
#ifdef __WORLDSERVER	// the helpers use CUser (Neuz compiles this file too)
static LPCTSTR GetOverheadTitleName( int nTitle )
{
	static LPCTSTR s_aszName[OVERHEAD_TITLE_MAX] = { "none", "Administrator", "Game Master", "MVP", "Guild Winner", "Top Donator" };
	if( nTitle == OVERHEAD_TITLE_HIDDEN )
		return "Hide";
	if( nTitle < 0 || nTitle >= OVERHEAD_TITLE_MAX )
		return "unknown";
	return s_aszName[nTitle];
}

static LPCTSTR GetOverheadTitleChoiceName( int nTitle )
{
	return nTitle == OVERHEAD_TITLE_AUTO ? "Auto" : GetOverheadTitleName( nTitle );
}

static CUser* GetOverheadTitleTarget( LPCTSTR szName )
{
	char szPlayer[64] = { 0, };
	strncpy( szPlayer, szName, sizeof( szPlayer ) - 1 );
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long idPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( szPlayer );
#else	// __SYS_PLAYER_DATA
	u_long idPlayer	= prj.GetPlayerID( szPlayer );
#endif	// __SYS_PLAYER_DATA
	if( idPlayer == 0 )
		return NULL;
	CUser* pTarget = g_UserMng.GetUserByPlayerID( idPlayer );
	return IsValidObj( pTarget ) ? pTarget : NULL;
}

static void ShowOverheadTitleInfo( CUser* pGM, CUser* pTarget )
{
	CString strMsg;
	strMsg.Format( "[GM] %s: Top Donator rank %d, chosen %d (%s), showing: %s", pTarget->GetName(), pTarget->m_nTopSpender,
		pTarget->m_nTitle, GetOverheadTitleChoiceName( pTarget->m_nTitle ), GetOverheadTitleName( pTarget->GetShownOverheadTitle() ) );
	pGM->AddText( strMsg );
}

#endif // __WORLDSERVER

#ifdef __MINI_EVENT
#ifdef __WORLDSERVER
#include "MiniEventMng.h"
#endif // __WORLDSERVER
// GM: Auto Mini Events (WORLDSERVER\MiniEventMng.cpp, Resource\MiniEvent.inc)
// /eventstart [name] [minutes] [players]: announce an event now (colorgame, typer, oxquiz, luckydraw, turnin, hideseek, race, or none = random); registration open
// [minutes] (default = the event's REGISTER), then it starts; [players] = players needed for this run (default MIN_PLAYERS)
BOOL TextCmd_MiniEventStart( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	int nType = MINIEVENT_TYPE_NONE;
	int anNum[2] = { 0, 0 };		// [minutes] [players needed]
	int nNum = 0;
	scanner.GetToken();
	while( scanner.tok != FINISHED )
	{
		if( isdigit( (unsigned char)scanner.token[0] ) )
		{
			if( nNum < 2 )
				anNum[nNum++] = atoi( scanner.token );
		}
		else if( nNum == 0 && nType == MINIEVENT_TYPE_NONE && _stricmp( scanner.token, "random" ) != 0 )
		{
			nType = CMiniEventMng::FindType( scanner.token );
			if( nType == MINIEVENT_TYPE_NONE )
			{
				pUser->AddText( "[Event] Unknown event. Use: /eventstart [colorgame|quickhands|oxquiz|luckydraw|turnin|hideseek|race|random] [minutes] [players needed]" );
				return TRUE;
			}
		}
		scanner.GetToken();
	}
	CMiniEventMng::GetInstance()->ForceStart( pUser, nType, anNum[0], anNum[1] );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventend: stop the running event (no prizes)
BOOL TextCmd_MiniEventEnd( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->ForceEnd( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventskip: end the current wait now (registration = start, round = results, results = next round)
BOOL TextCmd_MiniEventSkip( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->ForceSkip( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventnext: when the next scheduled event starts
BOOL TextCmd_MiniEventNext( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->SendNext( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventstatus: state, round and the players (points, pick, offline)
BOOL TextCmd_MiniEventStatus( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->SendStatus( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /hidespot "<region>" ["<hint>"] ["<landmark>"]: your position becomes a Hide and Seek spot (Madrigal only, appended to MiniEvent.inc)
BOOL TextCmd_MiniEventHideSpot( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;
	CString astr[3];
	int nArg = 0;
	scanner.GetToken();
	while( scanner.tok != FINISHED && nArg < 3 )
	{
		astr[nArg++] = scanner.token;
		scanner.GetToken();
	}
	CMiniEventMng::GetInstance()->AddHideSpot( pUser, astr[0], astr[1], astr[2] );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventrecipe [round] ["title"] <Ctrl+click items> [amount] ...: the GM picks a Turn-in Race round's recipe (no round = the next one);
// /eventrecipe = the recipes waiting; /eventrecipe clear [round]. Rounds without one use the RECIPE list (MiniEventMng.cpp SetGmRecipe)
BOOL TextCmd_MiniEventRecipe( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->SetGmRecipe( pUser, scanner.m_pProg );	// the rest of the line, links included
#endif // __WORLDSERVER
	return TRUE;
}

// /racestart, /racepoint: your position in WdRace becomes the Vagrant Race start / the next checkpoint (appended to MiniEvent.inc)
BOOL TextCmd_MiniEventRaceStart( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->AddRacePos( pUser, FALSE );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_MiniEventRacePoint( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->AddRacePos( pUser, TRUE );
#endif // __WORLDSERVER
	return TRUE;
}

// /hidegoto: GM test - teleport next to the hidden Lost Fwanki (Hide and Seek)
BOOL TextCmd_MiniEventHideGoto( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->GotoHideNpc( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

// /eventreload: read MiniEvent.inc again (only while no event runs)
BOOL TextCmd_MiniEventReload( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
		CMiniEventMng::GetInstance()->ReadConfig( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __MINI_EVENT

#ifdef __ANTI_BOT
#ifdef __WORLDSERVER
#include "AntiBotMng.h"
#endif // __WORLDSERVER
// GM: bot-check puzzle (WORLDSERVER\AntiBotMng.cpp)
//   /antibot <name>          open a puzzle for the player now (also the way to test it)
//   /antibot info <name>     score, open puzzle, totals since the server started
//   /antibot free <name>     close the open puzzle (unfreeze), no penalty
//   /antibot reload          read Resource\AntiBot.inc again
BOOL TextCmd_AntiBot( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	CAntiBotMng* pMng	= CAntiBotMng::GetInstance();

	scanner.GetToken();
	CString strSub	= scanner.Token;
	CString strLower	= strSub;
	strLower.MakeLower();

	if( strLower == "reload" )
	{
		if( pMng->LoadScript() )
			pUser->AddText( "[Bot Check] AntiBot.inc loaded." );
		else
			pUser->AddText( "[Bot Check] AntiBot.inc has errors (see Server\\error_*.txt): the old list is kept." );
		return TRUE;
	}

	CString strName	= strSub;
	if( strLower == "info" || strLower == "free" )
	{
		scanner.GetToken();
		strName	= scanner.Token;
	}
	if( strName.IsEmpty() )
	{
		pUser->AddText( "[Bot Check] /antibot <name> | info <name> | free <name> | reload" );
		return TRUE;
	}

	char szPlayer[64] = { 0, };
	strncpy( szPlayer, strName, sizeof( szPlayer ) - 1 );
	u_long idPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( szPlayer );
	CUser* pTarget	= idPlayer ? g_UserMng.GetUserByPlayerID( idPlayer ) : NULL;
	if( !IsValidObj( pTarget ) )
	{
		pUser->AddText( "[Bot Check] That player is not online on this channel." );
		return TRUE;
	}

	if( strLower == "info" )
		pMng->ShowInfo( pUser, pTarget );
	else if( strLower == "free" )
		pUser->AddText( pMng->FreePlayer( pTarget ) ? "[Bot Check] Puzzle closed, the player can move again." : "[Bot Check] That player has no open puzzle." );
	else if( pMng->ForcePuzzle( pTarget ) )
		pUser->AddText( "[Bot Check] Puzzle sent." );
	else
		pUser->AddText( pMng->GetWordCount() ? "[Bot Check] That player already has an open puzzle." : "[Bot Check] AntiBot.inc is not loaded: puzzles are off." );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __ANTI_BOT
#ifdef __RECORD_BOOK
#ifdef __WORLDSERVER
#include "RecordBookMng.h"
#endif // __WORLDSERVER
// GM test tool for the Record Book:
//   /record                    your records (id, value, level, class)
//   /record set <id> <value>   set one of your records (0 removes it)
//   /record clear              remove all your records
//   /record stats              your stat values now, with gear and without buffs (what the stat records use)
//   /record top <id>           the top 30 of a category as this channel has it
//   /record refresh            save everyone online, then load the top 30 again (a few seconds)
BOOL TextCmd_Record( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	CRecordBookMng* pMng	= CRecordBookMng::GetInstance();
	CString strMsg;

	scanner.GetToken();
	CString strSub	= scanner.Token;
	strSub.MakeLower();

	if( strSub == "set" )
	{
		int nType	= scanner.GetNumber();
		__int64 n64	= scanner.GetInt64();
		RECORD_ENTRY* pEntry	= pUser->m_PlayerRecords.Get( nType );
		if( !pEntry || !GetRecordTypeInfo( nType ) )
			strMsg.Format( "[GM] %d is not a Record Book category.", nType );
		else
		{
			pEntry->n64Value	= n64 > 0 ? n64 : 0;
			pEntry->nLevel		= pUser->GetLevel();
			pEntry->nJob		= pUser->GetJob();
			pEntry->tmRecord	= (int)time_null();
			strMsg.Format( "[GM] Record %d (%s) = %I64d", nType, GetRecordTypeInfo( nType )->szName, pEntry->n64Value );
		}
		pUser->AddText( strMsg );
	}
	else if( strSub == "clear" )
	{
		pUser->m_PlayerRecords.Clear();
		pUser->AddText( "[GM] All your records were removed (saved with the character)." );
	}
	else if( strSub == "stats" )
	{
		static const int s_anStat[] = { REC_STR, REC_STA, REC_DEX, REC_INT, REC_MAX_HP, REC_CRIT_DMG };
		for( int i = 0; i < (int)( sizeof( s_anStat ) / sizeof( s_anStat[0] ) ); ++i )
		{
			strMsg.Format( "[GM] %s: now %I64d without buffs, record %I64d", GetRecordTypeInfo( s_anStat[i] )->szName,
				pMng->GetStatValue( pUser, s_anStat[i] ), pUser->m_PlayerRecords.Get( s_anStat[i] )->n64Value );
			pUser->AddText( strMsg );
		}
	}
	else if( strSub == "top" )
	{
		int nType	= scanner.GetNumber();
		const RECORD_TYPE_INFO* pInfo	= GetRecordTypeInfo( nType );
		const std::vector<RECORD_BOOK_ROW>& vecTop	= pMng->GetBook().GetTop( nType );
		strMsg.Format( "[GM] Top %d: %s / %s (book version %u, %d rows)", nType, pInfo ? pInfo->szGroup : "?", pInfo ? pInfo->szName : "not a category",
			pMng->GetVersion(), (int)vecTop.size() );
		pUser->AddText( strMsg );
		for( size_t i = 0; i < vecTop.size(); ++i )
		{
			strMsg.Format( "#%d %s - %I64d (Lv %d, job %d)", (int)i + 1, vecTop[i].szName, vecTop[i].entry.n64Value, vecTop[i].entry.nLevel, vecTop[i].entry.nJob );
			pUser->AddText( strMsg );
		}
	}
	else if( strSub == "refresh" )
	{
		pMng->RefreshNow();
		pUser->AddText( "[GM] Everyone online is saved; the top 30 loads again in a few seconds." );
	}
	else
	{
		strMsg.Format( "[GM] Your records (%d):", pUser->m_PlayerRecords.GetCount() );
		pUser->AddText( strMsg );
		for( int i = 0; i < GetRecordTypeCount(); ++i )
		{
			const RECORD_TYPE_INFO* pInfo	= GetRecordTypeByIndex( i );
			const RECORD_ENTRY* pEntry		= pUser->m_PlayerRecords.Get( pInfo->nId );
			if( !pEntry || pEntry->n64Value <= 0 )
				continue;
			strMsg.Format( "%d %s / %s: %I64d (Lv %d, job %d)", pInfo->nId, pInfo->szGroup, pInfo->szName, pEntry->n64Value, pEntry->nLevel, pEntry->nJob );
			pUser->AddText( strMsg );
		}
	}
#endif // __WORLDSERVER
	return TRUE;
}

// /recordbook, /book: open the Record Book window
BOOL TextCmd_RecordBook( CScanner & scanner )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_RECORD_BOOK );
#endif // __CLIENT
	return TRUE;
}
#endif // __RECORD_BOOK
#ifdef __GW_STATUE
#include "PlayerStatue.h"
// /statuerefresh: save the online statue owners, then rebuild every statue with their current gear / title
BOOL TextCmd_StatueRefresh( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	int nCount		= CPlayerStatueMng::GetInstance()->RefreshAll();
	CString strMsg;
	strMsg.Format( "[GM] %d statue(s) will be rebuilt in a few seconds with their owners' current look.", nCount );
	pUser->AddText( strMsg );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __GW_STATUE
#ifdef __OFFLINE_VENDOR
#ifdef __WORLDSERVER
#include "OfflineVendor.h"
#endif // __WORLDSERVER
// /vendorlist: every offline vendor of this server (open / closed, listings, time left, place)
BOOL TextCmd_VendorList( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	COfflineVendorMng::GetInstance()->ListVendors( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
// /vendorclose <name>: the copy goes away; items + earnings wait for the owner's next login as usual
BOOL TextCmd_VendorClose( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	scanner.GetToken();
	CString strName	= scanner.Token;
	CString strMsg;
	if( strName.IsEmpty() )
		strMsg	= "[GM] /vendorclose <character name>";
	else if( COfflineVendorMng::GetInstance()->CloseByName( strName ) )
		strMsg.Format( "[GM] The offline vendor of %s is closed. Items and earnings wait for the owner's next login.", (LPCTSTR)strName );
	else
		strMsg.Format( "[GM] %s has no open offline vendor.", (LPCTSTR)strName );
	pUser->AddText( strMsg );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __OFFLINE_VENDOR
BOOL TextCmd_Title( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	CString strMsg;

	scanner.GetToken();
	CString strSub	= scanner.Token;
	strSub.MakeLower();

	if( strSub == "spender" )
	{
		scanner.GetToken();
		CString strName	= scanner.Token;
		scanner.GetToken();
		CString strRank	= scanner.Token;
		strRank.MakeLower();
		int nRank = ( strRank == "off" ) ? 0 : atoi( strRank );
		if( strName.IsEmpty() || strRank.IsEmpty() || nRank < 0 || nRank > OVERHEAD_TITLE_SPENDER_RANKS
			|| ( nRank == 0 && strRank != "off" && strRank != "0" ) )
		{
			pUser->AddText( "[GM] Usage: /title spender <name> 1|2|3|off" );
			return TRUE;
		}
		CUser* pTarget = GetOverheadTitleTarget( strName );
		if( pTarget == NULL )
		{
			strMsg.Format( "[GM] %s is not online on this server.", (LPCTSTR)strName );
			pUser->AddText( strMsg );
			return TRUE;
		}
		// a rank belongs to one player: take it from whoever wears it now (online on this channel here;
		// an offline holder loses it in the DB when the new holder is saved, uspOverheadTitleSave / script 36)
		if( nRank > 0 )
		{
			for( std::map<DWORD, CUser*>::iterator it = g_UserMng.GetUserMap().begin(); it != g_UserMng.GetUserMap().end(); ++it )
			{
				CUser* pHolder	= it->second;
				if( !IsValidObj( pHolder ) || pHolder == pTarget || pHolder->m_nTopSpender != nRank )
					continue;
				pHolder->m_nTopSpender	= 0;
				g_UserMng.AddOverheadTitleUpdate( pHolder );
				strMsg.Format( "[GM] %s is no longer Top Donator #%d.", pHolder->GetName(), nRank );
				pUser->AddText( strMsg );
				if( pHolder != pUser )
					pHolder->AddText( "Your Top Donator title was removed." );
#ifdef __GW_STATUE
				if( pHolder->GetWorld() )
					g_dpDBClient.SavePlayer( pHolder, pHolder->GetWorld()->GetID(), pHolder->GetPos(), pHolder->GetLayer() );
				CPlayerStatueMng::GetInstance()->OnTopSpenderChanged( pHolder->m_idPlayer, nRank, 0 );
#endif // __GW_STATUE
			}
		}
#ifdef __GW_STATUE
		int nOldRank	= pTarget->m_nTopSpender;
#endif // __GW_STATUE
		pTarget->m_nTopSpender = nRank;
#ifdef __GW_STATUE
		// save now: the Top Spender statues on the other channels look the rank up in the database
		if( pTarget->GetWorld() )
			g_dpDBClient.SavePlayer( pTarget, pTarget->GetWorld()->GetID(), pTarget->GetPos(), pTarget->GetLayer() );
		CPlayerStatueMng::GetInstance()->OnTopSpenderChanged( pTarget->m_idPlayer, nOldRank, nRank );
#endif // __GW_STATUE
		g_UserMng.AddOverheadTitleUpdate( pTarget );
		if( nRank > 0 )
			strMsg.Format( "[GM] %s is now Top Donator #%d.", pTarget->GetName(), nRank );
		else
			strMsg.Format( "[GM] %s is no longer a Top Donator.", pTarget->GetName() );
		pUser->AddText( strMsg );
		if( pTarget != pUser )
		{
			if( nRank > 0 )
				strMsg.Format( "You are now Top Donator #%d!", nRank );
			else
				strMsg = "Your Top Donator title was removed.";
			pTarget->AddText( strMsg );
		}
		ShowOverheadTitleInfo( pUser, pTarget );
		return TRUE;
	}

	if( strSub == "set" )
	{
		int nTitle = scanner.GetNumber();
		if( nTitle != OVERHEAD_TITLE_AUTO && nTitle != OVERHEAD_TITLE_HIDDEN
			&& ( nTitle <= OVERHEAD_TITLE_NONE || nTitle >= OVERHEAD_TITLE_MAX || !pUser->OwnsOverheadTitle( nTitle ) ) )
			strMsg.Format( "[GM] You don't own title %d (%s) right now. 0 = Auto, -1 = Hide.", nTitle, GetOverheadTitleName( nTitle ) );
		else
		{
			pUser->m_nTitle = nTitle;
			g_UserMng.AddOverheadTitleUpdate( pUser );
			strMsg.Format( "[GM] Chosen title: %d (%s).", nTitle, GetOverheadTitleChoiceName( nTitle ) );
		}
		pUser->AddText( strMsg );
		ShowOverheadTitleInfo( pUser, pUser );
		return TRUE;
	}

	// info [name]
	CUser* pTarget = pUser;
	if( strSub == "info" )
	{
		scanner.GetToken();
		if( scanner.tok != FINISHED && scanner.Token.GetLength() > 0 )
		{
			pTarget = GetOverheadTitleTarget( scanner.Token );
			if( pTarget == NULL )
			{
				strMsg.Format( "[GM] %s is not online on this server.", (LPCTSTR)scanner.Token );
				pUser->AddText( strMsg );
				return TRUE;
			}
		}
	}
	ShowOverheadTitleInfo( pUser, pTarget );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __OVERHEAD_TITLE

BOOL TextCmd_SetSnoop( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;

	s.GetToken();
	if( s.tok != FINISHED )
	{
		if( lstrcmp( pUser->GetName(), s.Token ) )
		{
#if __VER >= 11 // __SYS_PLAYER_DATA
			u_long idPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
#else	// __SYS_PLAYER_DATA
			u_long idPlayer	= prj.GetPlayerID( s.Token );
#endif	// __SYS_PLAYER_DATA
			if( idPlayer > 0 )
			{
				BOOL bRelease	= FALSE;
				s.GetToken();
				if( s.tok != FINISHED )
					bRelease	= (BOOL)atoi( s.Token );
				g_DPCoreClient.SendSetSnoop( idPlayer, pUser->m_idPlayer,  bRelease );
			}
			else
				pUser->AddReturnSay( 3, s.Token );
		}
	}
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_SetSnoopGuild( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;

	s.GetToken();
	if( s.tok != FINISHED )
	{
		CGuild* pGuild	= g_GuildMng.GetGuild( s.Token );
		if( pGuild )
		{
			BOOL bRelease	= FALSE;
			s.GetToken();
			if( s.tok != FINISHED )
				bRelease	= (BOOL)atoi( s.Token );
			g_DPCoreClient.SendSetSnoopGuild( pGuild->m_idGuild, bRelease );
		}
	}
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_QuerySetPlayerName( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	scanner.GetToken();
	CString strPlayer	= scanner.Token;
	strPlayer.TrimLeft();
	strPlayer.TrimRight();
	g_dpDBClient.SendQuerySetPlayerName( pUser->m_idPlayer, strPlayer, MAKELONG( 0xffff, 0 ) );
	return TRUE;
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_QuerySetGuildName( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	scanner.GetToken();
	CString strGuild	= scanner.Token;
	strGuild.TrimLeft();
	strGuild.TrimRight();
	CGuild* pGuild	= g_GuildMng.GetGuild( pUser->m_idGuild );
	if( pGuild && pGuild->IsMaster( pUser->m_idPlayer ) )
	{
		g_DPCoreClient.SendQuerySetGuildName( pUser->m_idPlayer, pUser->m_idGuild, (LPSTR)(LPCSTR)strGuild, 0xffff );
	}
	else
	{
		// is not kingpin
	}
	return TRUE;
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_CreateGuild( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	scanner.GetToken();
	GUILD_MEMBER_INFO	info;
	info.idPlayer	= pUser->m_idPlayer;
#if __VER < 11 // __SYS_PLAYER_DATA
	info.nLevel	= pUser->GetLevel();
	info.nJob	= pUser->GetJob();
	info.dwSex	= pUser->GetSex();
#endif	// __SYS_PLAYER_DATA
	g_DPCoreClient.SendCreateGuild( &info, 1, scanner.Token );
	return TRUE;
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_DestroyGuild( CScanner & scanner )
{
#ifdef __CLIENT
	g_DPlay.SendDestroyGuild( g_pPlayer->m_idPlayer );
#endif
	return TRUE; 
}

BOOL TextCmd_RemoveGuildMember( CScanner & scanner )
{
#ifdef __CLIENT
	scanner.GetToken();
	char lpszPlayer[MAX_PLAYER]	= { 0, };
	lstrcpy( lpszPlayer, scanner.Token );
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( lpszPlayer );
#else	// __SYS_PLAYER_DATA
	u_long idPlayer	= prj.GetPlayerID( lpszPlayer );
#endif	// __SYS_PLAYER_DATA
	if( idPlayer != 0 )
		g_DPlay.SendRemoveGuildMember( g_pPlayer->m_idPlayer, idPlayer );
	return TRUE;
#endif	// __CLIENT
	return FALSE;
}

BOOL TextCmd_GuildChat( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

#ifdef __JEFF_9_20
#if __VER >= 12 // __LORD
	int nText	= pUser->GetMuteText();
	if(  nText )
	{
		pUser->AddDefinedText( nText );
		return TRUE;
	}
#else	// __LORD
	if( pUser->IsMute() )
		return TRUE;
#endif	// __LORD
#endif	// __JEFF_9_20

	char sChat[260]		= { 0, };
	scanner.GetLastFull();
	if( strlen( scanner.token ) >= 260 )
		return TRUE;
	strcpy( sChat, scanner.token );

	StringTrimRight( sChat );
	if( !(pUser->HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_FONTEDIT)))
		ParsingEffect(sChat, strlen(sChat) );
	
	RemoveCRLF( sChat );

	g_DPCoreClient.SendGuildChat( pUser, sChat );
	return TRUE;
#else	// __WORLDSERVER
#ifdef __CLIENT
	CString string	= scanner.m_pProg;
	g_WndMng.WordChange( string );

	if( ::GetLanguage() == LANG_THA )
		string = '"'+string+'"';

	CString strCommand;
	strCommand.Format( "/g %s", string );
	g_DPlay.SendChat( strCommand );
	return FALSE;
#endif	// __CLIENT
#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_DeclWar( CScanner & scanner )
{
#ifdef __CLIENT
	char szGuild[MAX_G_NAME]	= { 0, };
	scanner.GetLastFull();
	if( strlen( scanner.token ) >= MAX_G_NAME )
		return TRUE;
	strcpy( szGuild, scanner.token );
	StringTrimRight( szGuild );
	g_DPlay.SendDeclWar( g_pPlayer->m_idPlayer, szGuild );
#endif	// __CLIENT
	return FALSE;
}

#ifdef __GUILDRANK
// 길드 랭킹정보를 업데이트 시키는 명령어이다.
BOOL TextCmd_GuildRanking( CScanner & scanner )
{
#ifdef __WORLDSERVER
	// TRANS 서버에게 길드 랭킹 정보가 업데이트 되야함을 알린다.
	g_dpDBClient.UpdateGuildRanking();
#endif

	return TRUE;
}

// 길드 랭킹정보 DB를 업데이트 시키는 명령어이다.
BOOL TextCmd_GuildRankingDBUpdate( CScanner & scanner )
{
#ifdef __WORLDSERVER
	// TRANS 서버에게 길드 랭킹 정보가 업데이트 되야함을 알린다.
	g_dpDBClient.UpdateGuildRankingUpdate();
#endif
	
	return TRUE;
}
#endif

BOOL TextCmd_GuildStat( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	scanner.GetToken();
	CString strstat = scanner.Token;
	
	strstat.MakeLower();

	if( strstat == "logo" )
	{
		DWORD dwLogo = scanner.GetNumber();
		TRACE("guild Logo:%d\n", dwLogo);
		g_DPCoreClient.SendGuildStat( pUser, GUILD_STAT_LOGO, dwLogo );
	}
	else
	if( strstat == "pxp" )
	{
		DWORD dwPxpCount = scanner.GetNumber();
		TRACE("guild pxpCount:%d\n", dwPxpCount);
		g_DPCoreClient.SendGuildStat( pUser, GUILD_STAT_PXPCOUNT, dwPxpCount );
	}
	else
	if( strstat == "penya" )
	{
		DWORD dwPenya = scanner.GetNumber();
		TRACE("guild dwPenya:%d\n", dwPenya);
		g_DPCoreClient.SendGuildStat( pUser, GUILD_STAT_PENYA, dwPenya);
	}
	else
	if( strstat == "notice" )
	{
		scanner.GetToken();
		TRACE("guild notice:%s\n", scanner.Token);
		g_DPCoreClient.SendGuildStat( pUser, GUILD_STAT_NOTICE, (DWORD)(LPCTSTR)scanner.Token);
	}
	else
	{
		strstat += "syntax error guild stat command.";
		pUser->AddText( strstat );
	}

#endif 
	return FALSE;
}

BOOL TextCmd_SetGuildQuest( CScanner & s )
{
#ifdef __WORLDSERVER

	s.GetToken();
	char sGuild[MAX_G_NAME];
	lstrcpy( sGuild, s.Token );
	int nQuestId	= s.GetNumber();
	int nState		= s.GetNumber();
	GUILDQUESTPROP* pProp	= prj.GetGuildQuestProp( nQuestId );
	if( !pProp )
		return FALSE;

	CGuild* pGuild	= g_GuildMng.GetGuild( sGuild );
	if( pGuild )
	{
		if( nState < QS_BEGIN || nState > QS_END )
		{
		}
		else
		{
			pGuild->SetQuest( nQuestId, nState );
			g_dpDBClient.SendUpdateGuildQuest( pGuild->m_idGuild, nQuestId, nState );
		}
	}
	return TRUE;

#endif	// __WORLDSERVER
	return FALSE;
}

BOOL TextCmd_PartyLevel( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	DWORD dwLevel = scanner.GetNumber();
	DWORD dwPoint = scanner.GetNumber();
	if( dwPoint == 0 )
		dwPoint = 100;

	TRACE("plv LV:%d POINT:%d\n", dwLevel, dwPoint);
	
	CParty* pParty;
	pParty = g_PartyMng.GetParty( pUser->GetPartyId() );
	if( pParty )
	{
		pParty->SetPartyLevel( pUser, dwLevel, dwPoint, pParty->GetExp() );
	}
#endif // __WORLDSERVER
	return TRUE;
}

BOOL  TextCmd_InitSkillExp( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	if( pUser->InitSkillExp() == TRUE )
		pUser->AddInitSkill();
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_SkillLevel( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	DWORD dwSkillKind	= scanner.GetNumber();
	DWORD dwSkillLevel = scanner.GetNumber();

	LPSKILL pSkill = pUser->GetSkill( dwSkillKind );
	if( pSkill )
	{
		pSkill->dwLevel = dwSkillLevel;
	}
	else
	{
		return FALSE;
	}
	
	pUser->AddSetSkill( pSkill->dwSkill, pSkill->dwLevel );
#endif // __WORLDSERVER
#ifdef __CLIENT

	DWORD dwSkillLevel = scanner.GetNumber();

#if __VER >= 10 // __CSC_VER9_1
#ifdef __NEW_SKILL_TREE
	CWndSkillTreeEx* pSkill = (CWndSkillTreeEx*)g_WndMng.GetWndBase( APP_SKILL4 );
#else // __NEW_SKILL_TREE
	CWndSkillTreeEx* pSkill = (CWndSkillTreeEx*)g_WndMng.GetWndBase( APP_SKILL3 );
#endif // __NEW_SKILL_TREE
#else
	CWndSkillTreeEx* pSkill = (CWndSkillTreeEx*)g_WndMng.GetWndBase( APP_SKILL1 );
#endif //__CSC_VER9_1
	if( pSkill )
	{
		int nIndex = pSkill->GetCurSelect();
		if( nIndex == -1 )
		{
			g_WndMng.PutString( prj.GetText(TID_GAME_CHOICESKILL), NULL, 0xffff0000 );
			//g_WndMng.PutString( "스킬창에 있는 스킬을 선택하여 주십시요", NULL, 0xffff0000 );
			return FALSE;
		}
		LPSKILL pSkillbuf = pSkill->GetSkill( nIndex );
		if( pSkillbuf == NULL ) 
		{
			g_WndMng.PutString( prj.GetText(TID_GAME_CHOICESKILL), NULL, 0xffff0000 );
			//g_WndMng.PutString( "스킬창에 있는 스킬을 선택하여 주십시요", NULL, 0xffff0000 );
			return FALSE;
		}

		ItemProp* pSkillProp = prj.GetSkillProp( pSkillbuf->dwSkill );

		if( pSkillProp->dwExpertMax < 1 || pSkillProp->dwExpertMax < dwSkillLevel )
		{
			char szMessage[MAX_PATH];
			sprintf ( szMessage, prj.GetText(TID_GAME_SKILLLEVELLIMIT), pSkillProp->szName, pSkillProp->dwExpertMax );
//			sprintf ( szMessage, "%s' 스킬은 1 ~ %d 로만 레벨을 올릴수 있습니다", pSkillProp->szName, pSkillProp->dwExpertMax );

			g_WndMng.PutString( szMessage, NULL, 0xffff0000 );
			return FALSE;
		}
		char szSkillLevel[MAX_PATH];
		sprintf( szSkillLevel, prj.GetText(TID_GAME_GAMETEXT001), pSkillbuf->dwSkill, dwSkillLevel );
		scanner.SetProg( szSkillLevel );		
		//sprintf( scanner.pBuf, "/스렙 %d %d", pSkillbuf->dwSkill, dwSkillLevel );
	}
	else
	{
		g_WndMng.PutString( prj.GetText(TID_GAME_CHOICESKILL), NULL, 0xffff0000 );
//		g_WndMng.PutString( "스킬창에 있는 스킬을 선택하여 주십시요", NULL, 0xffff0000 );
		return FALSE;
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SkillLevelAll( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	LPSKILL pSkill = NULL;
	ItemProp* pSkillProp = NULL;

	for( int i = 0; i < MAX_SKILL_JOB; i++ )	
	{
		pSkill = &(pUser->m_aJobSkill[i]);

		if( pSkill == NULL || pSkill->dwSkill == 0xffffffff )
			continue;

		pSkillProp = prj.GetSkillProp( pSkill->dwSkill );

		if( pSkillProp == NULL )
			continue;

		pSkill->dwLevel = pSkillProp->dwExpertMax;
		pUser->AddSetSkill( pSkill->dwSkill, pSkill->dwLevel );
	}
#endif // __WORLDSERVER

	return TRUE;
}

BOOL TextCmd_whisper( CScanner& scanner )              
{ 
#ifdef __WORLDSERVER
	static	CHAR	lpString[260];

	CUser* pUser	= (CUser*)scanner.dwValue;
	if( pUser->IsMode( SAYTALK_MODE ) )
		return TRUE;
#ifdef __JEFF_9_20
#if __VER >= 12 // __LORD
	int nText	= pUser->GetMuteText();
	if(  nText )
	{
		pUser->AddDefinedText( nText );
		return TRUE;
	}
#else	// __LORD
	if( pUser->IsMute() )
		return TRUE;
#endif	// __LORD
#endif	// __JEFF_9_20

	scanner.GetToken();

	if( strcmp( pUser->GetName(), scanner.Token ) )
	{
#if __VER >= 11 // __SYS_PLAYER_DATA
			u_long idPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
			u_long idPlayer	= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
			if( idPlayer > 0 ) 
			{
				scanner.GetLastFull();
				if( strlen( scanner.token ) >= 260 )	
					return TRUE;
				strcpy( lpString, scanner.token );
				
				StringTrimRight( lpString );
				
				if( !(pUser->HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_FONTEDIT)))
				{
					ParsingEffect(lpString, strlen(lpString) );
				}
				RemoveCRLF( lpString );
				
				if( 0 < strlen(lpString) )
					g_DPCoreClient.SendWhisper( pUser->m_idPlayer, idPlayer, lpString );
			}
			else 
			{
				//scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
				pUser->AddReturnSay( 3, scanner.Token );
			}
	}
	else
	{
		pUser->AddReturnSay( 2, " " );  	// 자기 자신에게 명령했다.
	}
#endif	// __WORLDSERVER

	return TRUE;
}

BOOL TextCmd_say( CScanner& scanner )              
{ 
#ifdef __WORLDSERVER
	static	CHAR	lpString[1024];
	CUser* pUser	= (CUser*)scanner.dwValue;

	if( pUser->IsMode( SAYTALK_MODE ) )
		return TRUE;
#ifdef __JEFF_9_20
#if __VER >= 12 // __LORD
	int nText	= pUser->GetMuteText();
	if(  nText )
	{
		pUser->AddDefinedText( nText );
		return TRUE;
	}
#else	// __LORD
	if( pUser->IsMute() )
		return TRUE;
#endif	// __LORD
#endif	// __JEFF_9_20

	scanner.GetToken();
	if( strcmp( pUser->GetName(), scanner.Token ) )
	{
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer		= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idPlayer > 0 ) 
		{
			scanner.GetLastFull();
			if( strlen( scanner.token ) > 260 )	//
				return TRUE;

			strcpy( lpString, scanner.token );

			StringTrimRight( lpString );
			
			if( !(pUser->HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_FONTEDIT)))
			{
				ParsingEffect(lpString, strlen(lpString) );
			}
			RemoveCRLF( lpString );
			
			g_DPCoreClient.SendSay( pUser->m_idPlayer, idPlayer, lpString );
		}
		else 
		{
			//scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
	else
	{
		pUser->AddReturnSay( 2, " " );  	// 자기 자신에게 명령했다.
	}
	
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ResistItem( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	DWORD dwObjId	= scanner.GetNumber();
	BYTE bItemResist = scanner.GetNumber();
	int nResistAbilityOption = scanner.GetNumber();
	int nAbilityOption	= scanner.GetNumber();

	if( bItemResist < 0 || 5 < bItemResist )
	{
		return FALSE;
	}
#if __VER >= 13 // __EXT_ENCHANT
#ifdef __NEW_ITEM_VARUNA
	if( nResistAbilityOption < 0 || 20 < nResistAbilityOption || nAbilityOption < 0 || 20 < nAbilityOption )
#else // __NEW_ITEM_VARUNA
	if( nResistAbilityOption < 0 || CItemUpgrade::GetInstance()->GetMaxAttributeEnchantSize() < nResistAbilityOption 
		|| nAbilityOption < 0 || CItemUpgrade::GetInstance()->GetMaxGeneralEnchantSize() < nAbilityOption )
#endif // __NEW_ITEM_VARUNA
#else // __EXT_ENCHANT
	if( nResistAbilityOption < 0 || 10 < nResistAbilityOption || nAbilityOption < 0 || 10 < nAbilityOption )
#endif // __EXT_ENCHANT
	{
		return FALSE;
	}

	if( bItemResist == 0 )
	{
		nResistAbilityOption = 0;
	}

	CItemElem* pItemElem0	= pUser->m_Inventory.GetAtId( dwObjId );
	if( NULL == pItemElem0 )
		return FALSE;
	if( pUser->m_Inventory.IsEquip( dwObjId ) )
	{
		pUser->AddDefinedText( TID_GAME_EQUIPPUT , "" );
		return FALSE;
	}
	
	pUser->UpdateItem( (WORD)( pItemElem0->m_dwObjId ), UI_IR,  bItemResist );
	pUser->UpdateItem( (WORD)( pItemElem0->m_dwObjId ), UI_RAO,  nResistAbilityOption );
	pUser->UpdateItem( (WORD)( pItemElem0->m_dwObjId ), UI_AO,  nAbilityOption );
#if __VER >= 9 // __ULTIMATE
	if( nAbilityOption > 5 && pItemElem0->GetProp()->dwReferStat1 == WEAPON_ULTIMATE )
#if __VER >= 12 // __EXT_PIERCING
		pUser->UpdateItem( (WORD)pItemElem0->m_dwObjId, UI_ULTIMATE_PIERCING_SIZE, nAbilityOption - 5 );
#else // __EXT_PIERCING
		pUser->UpdateItem( (WORD)pItemElem0->m_dwObjId, UI_PIERCING_SIZE, nAbilityOption - 5 );
#endif // __EXT_PIERCING
#endif //__ULTIMATE
#else // __WORLDSEVER
#ifdef __CLIENT
	if( g_WndMng.m_pWndUpgradeBase == NULL )
	{
		SAFE_DELETE( g_WndMng.m_pWndUpgradeBase );
		g_WndMng.m_pWndUpgradeBase = new CWndUpgradeBase;
		g_WndMng.m_pWndUpgradeBase->Initialize( &g_WndMng, APP_TEST );
		return FALSE;
	}

	BYTE bItemResist = scanner.GetNumber();
	int nResistAbilityOption = scanner.GetNumber();
	int nAbilityOption	= scanner.GetNumber();
	if( bItemResist < 0 || 5 < bItemResist )
	{
		return FALSE;
	}
#if __VER >= 13 // __EXT_ENCHANT
#ifdef __NEW_ITEM_VARUNA
	if( nResistAbilityOption < 0 || 20 < nResistAbilityOption || nAbilityOption < 0 || 20 < nAbilityOption )
#else // __NEW_ITEM_VARUNA
	if( nResistAbilityOption < 0 || 20 < nResistAbilityOption || nAbilityOption < 0 || 10 < nAbilityOption )
#endif // __NEW_ITEM_VARUNA
#else	// __EXT_ENCHANT
	if( nResistAbilityOption < 0 || 10 < nResistAbilityOption || nAbilityOption < 0 || 10 < nAbilityOption )
#endif	// __EXT_ENCHANT
	{
		return FALSE;
	}

	if( bItemResist == 0 )
	{
		nResistAbilityOption = 0;
	}

	if( g_WndMng.m_pWndUpgradeBase )
	{
		if( g_WndMng.m_pWndUpgradeBase->m_pItemElem[0] )
		{
			DWORD dwObjId = g_WndMng.m_pWndUpgradeBase->m_pItemElem[0]->m_dwObjId;
			char szSkillLevel[MAX_PATH];
			sprintf( szSkillLevel, "/ritem %d %d %d %d", dwObjId, bItemResist, nResistAbilityOption, nAbilityOption );
			scanner.SetProg( szSkillLevel );		
		}
		else
		{
			return FALSE;
		}
	}
	else
	{
		return FALSE;
	}
#endif // __CLIENT
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CommercialElem( CScanner& scanner )
{
#ifdef __CLIENT
	SAFE_DELETE( g_WndMng.m_pWndCommerialElem );
	g_WndMng.m_pWndCommerialElem = new CWndCommercialElem;
	g_WndMng.m_pWndCommerialElem->Initialize( &g_WndMng, APP_COMMERCIAL_ELEM );
#endif // __CLIENT
	return FALSE;
}

BOOL TextCmd_Piercing( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	DWORD dwObjId	= scanner.GetNumber();
	BYTE bPierNum = scanner.GetNumber();

	CItemElem* pItemElem0	= pUser->m_Inventory.GetAtId( dwObjId );
	if( NULL == pItemElem0 )
		return FALSE;

	if( bPierNum < 0 || bPierNum > MAX_PIERCING )
		return FALSE;

	if( pUser->m_Inventory.IsEquip( dwObjId ) )
	{
		pUser->AddDefinedText( TID_GAME_EQUIPPUT , "" );
		return FALSE;
	}

	if( bPierNum < pItemElem0->GetPiercingSize() )
	{
		pUser->UpdateItem( (WORD)pItemElem0->m_dwObjId, UI_PIERCING_SIZE, bPierNum );
		return TRUE;
	}

	for( int i=1; i<=bPierNum; i++ )
	{
#if __VER >= 12 // __EXT_PIERCING
		if( pItemElem0->IsPierceAble( NULL_ID, TRUE ) )
#endif // __EXT_PIERCING
			pUser->UpdateItem( (WORD)pItemElem0->m_dwObjId, UI_PIERCING_SIZE, i );
	}
#else // __WORLDSEVER
#ifdef __CLIENT
	BYTE bPierNum = scanner.GetNumber();

	if( bPierNum < 0 || bPierNum > MAX_PIERCING )
	{
		return FALSE;
	}	

	CWndPiercing* pWndPiercing = (CWndPiercing*)g_WndMng.GetWndBase(APP_PIERCING);
	if( pWndPiercing )
	{
		if( pWndPiercing->m_pItemElem[0] )
		{
			DWORD dwObjId = pWndPiercing->m_pItemElem[0]->m_dwObjId;
			char szSkillLevel[MAX_PATH];
			sprintf( szSkillLevel, "/pier %d %d", dwObjId, bPierNum );
			scanner.SetProg( szSkillLevel );		
		}
		else
		{
			return FALSE;
		}
	}
	else
	{
		SAFE_DELETE(g_WndMng.m_pWndPiercing);
		g_WndMng.m_pWndPiercing = new CWndPiercing;
		g_WndMng.m_pWndPiercing->Initialize(&g_WndMng, APP_PIERCING);
		return FALSE;
	}
#endif // __CLIENT
#endif // __WORLDSERVER
	return TRUE;
}

BOOL IsRight( CString &str )
{
	if( str.GetLength() == 1 )
	{
		if( str.Find( "#", 0 ) == 0 )
			return FALSE;
	}
	else
	if( str.GetLength() == 2 )
	{
		if( str.Find( "#u", 0 ) == 0 )
			return FALSE;
		
		if( str.Find( "#b", 0 ) == 0 )
			return FALSE;
	}
	
	int nFind = str.Find( "#c", 0 );	
	if( nFind != -1 )
	{
		if( (str.GetLength() - nFind) < 8 )
			return FALSE;
	}
		
		return TRUE;
}

BOOL TextCmd_shout( CScanner& scanner )            
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( pUser->IsMode( SHOUTTALK_MODE ) )
		return FALSE;
#ifdef __QUIZ
	if( pUser->GetWorld() && pUser->GetWorld()->GetID() == WI_WORLD_QUIZ )
		return FALSE;
#endif // __QUIZ
#ifdef __JEFF_9_20
#if __VER >= 12 // __LORD
	int nText	= pUser->GetMuteText();
	if(  nText )
	{
		pUser->AddDefinedText( nText );
		return FALSE;
	}
#else	// __LORD
	if( pUser->IsMute() )
		return FALSE;
#endif	// __LORD
	if( ( // 미국 & 유럽
#ifdef __NO_SUB_LANG
		( ::GetLanguage() == LANG_USA )
		|| ( ::GetLanguage() == LANG_ID )
#else // __NO_SUB_LANG
		( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_USA )
		|| ( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_IND )
#endif // __NO_SUB_LANG		
		|| ::GetLanguage() == LANG_GER
		|| ::GetLanguage() == LANG_FRE
		|| ::GetLanguage() == LANG_VTN
		|| ::GetLanguage() == LANG_POR
		|| ::GetLanguage() == LANG_RUS
		)
		&& pUser->GetLevel() < 20 )
	{
		pUser->AddDefinedText( TID_GAME_CANT_SHOUT_BELOW_20 );
		return FALSE;
	}
#endif	// __JEFF_9_20

	if( ( GetLanguage() == LANG_TWN || GetLanguage() == LANG_HK )  && pUser->GetLevel() < 15 )
	{
		pUser->AddDefinedText( TID_GAME_CANNOT_SHOUT_BELOW_15_LEVEL );
		return FALSE;
	}

	char szString[1024];
	szString[0] = '\0';

	scanner.GetLastFull();
	if( strlen( scanner.token ) > 260 )	//
		return TRUE;

	strcpy( szString, scanner.token );
	StringTrimRight( szString );

	if( !(pUser->HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_FONTEDIT)))
	{
		ParsingEffect( szString, strlen(szString) );
	}
	RemoveCRLF( szString );

	CAr arBlock;
	arBlock << NULL_ID << SNAPSHOTTYPE_SHOUT;
	arBlock << GETID( pUser );
	arBlock.WriteString(pUser->GetName());
	arBlock.WriteString( szString );
#if __VER >= 12 // __LORD
	DWORD dwColor	= 0xffff99cc;
#ifdef __USER_CHAT_COLOR
	if( pUser->m_dwChatColor )						// Collector Exchange Phase 3 cosmetic pick
		dwColor		= pUser->m_dwChatColor;
#endif	// __USER_CHAT_COLOR
	if( pUser->HasBuff(  BUFF_ITEM, II_SYS_SYS_LS_SHOUT ) )	// paid buff still wins over the cosmetic pick
		dwColor		= 0xff00ff00;
	arBlock << dwColor;
#endif	// __LORD
	GETBLOCK( arBlock, lpBlock, uBlockSize );

#if  __VER >= 13
	int nRange = 0x000000ff;
	if( pUser->IsShoutFull() )
		nRange = 0;
	g_UserMng.AddShout( pUser, nRange, lpBlock, uBlockSize );
#else // __VER >= 13
	if( pUser->IsShoutFull() )	// 여기서 유료 아이템 사용중인지 확인
		g_UserMng.AddShout( pUser->GetPos(), 0, lpBlock, uBlockSize );
	else
		g_UserMng.AddShout( pUser->GetPos(), 0xff, lpBlock, uBlockSize );
#endif // __VER >= 13

#else	// __WORLDSERVER
#ifdef __CLIENT

	static CTimer timerDobe;
	static CString stringBack;
	static CTimeLimit timeLimit( g_Neuz.m_nShoutLimitCount, g_Neuz.m_dwShoutLimitSecond );

	CString string = scanner.m_pProg; 

	CString strTrim = string;
	strTrim.TrimLeft();
		
	if( IsRight( strTrim ) == FALSE )
		return FALSE;

#ifdef __BAN_CHATTING_SYSTEM
	if( g_WndMng.GetBanningTimer().IsTimeOut() == FALSE )
	{
		CWndChat* pWndChat = ( CWndChat* )g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
		if( pWndChat )
		{
			int nOriginalSecond = static_cast< int >( CWndMgr::BANNING_MILLISECOND - static_cast< int >( g_WndMng.GetBanningTimer().GetLeftTime() ) ) / 1000;
			int nMinute = static_cast< int >( nOriginalSecond / 60 );
			int nSecond = static_cast< int >( nOriginalSecond % 60 );
			CString strMessage = _T( "" );
			// 현재 채팅 금지 페널티를 받고 있습니다. (남은 시간: %d분 %d초)
			strMessage.Format( prj.GetText( TID_GAME_ERROR_CHATTING_3 ), nMinute, nSecond );
			pWndChat->PutString( strMessage, 0xffff0000 );
			return FALSE;
		}
	}
	else
	{
		if( stringBack != string || timerDobe.TimeOut() )
		{
			if( !g_pPlayer->IsShoutFull()
#ifdef __NO_SUB_LANG
				|| ( ::GetLanguage() == LANG_USA )
#else // __NO_SUB_LANG
				|| ( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_USA )
				|| ( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_IND )
#endif // __NO_SUB_LANG
				|| ::GetLanguage() == LANG_GER
				|| ::GetLanguage() == LANG_FRE
				|| ::GetLanguage() == LANG_JAP
				|| ::GetLanguage() == LANG_VTN
				|| ::GetLanguage() == LANG_POR
				|| ::GetLanguage() == LANG_RUS
				)
			{
				if( g_Neuz.m_nShoutLimitCount > 0 && timeLimit.Check() == TRUE ) // 제한을 넘었다.
				{
					//외치기는 %n초안에 %d번만 허용됩니다.
					char szMsg[256];
					sprintf( szMsg, prj.GetText( TID_GAME_LIMIT_SHOUT ), g_Neuz.m_dwShoutLimitSecond / 1000, g_Neuz.m_nShoutLimitCount );
					g_WndMng.PutString( szMsg, NULL, prj.GetTextColor( TID_GAME_LIMIT_SHOUT ) );
					return FALSE;
				}
			}

			stringBack = string;
			timerDobe.Set( SEC( 3 ) );
			g_WndMng.WordChange( string );

			if( g_WndMng.IsShortcutCommand() == TRUE )
			{
				if( g_WndMng.GetShortcutWarningTimer().IsTimeOut() == FALSE )
				{
					g_WndMng.SetWarningCounter( g_WndMng.GetWarningCounter() + 1 );
					CWndChat* pWndChat = ( CWndChat* )g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
					if( pWndChat )
					{
						if( g_WndMng.GetWarningCounter() >= CWndMgr::BANNING_POINT )
						{
							// 과도한 채팅으로 인하여 %d분 동안 채팅 금지 페널티를 받으셨습니다.
							CString strChattingError1 = _T( "" );
							strChattingError1.Format( prj.GetText( TID_GAME_ERROR_CHATTING_2 ), CWndMgr::BANNING_MILLISECOND / 1000 / 60 );
							pWndChat->PutString( strChattingError1, prj.GetTextColor( TID_GAME_ERROR_CHATTING_2 ) );
							g_WndMng.SetWarningCounter( 0 );
							g_WndMng.GetBanningTimer().Reset();
						}
						else
						{
							// 연속 채팅으로 인하여 메시지가 출력되지 않았습니다.
							pWndChat->PutString( prj.GetText( TID_GAME_ERROR_CHATTING_1 ), 0xffff0000 );
						}
					}
				}
				else
				{
					CString strCommand = _T( "" );
					strCommand.Format( "/s %s", string );
					g_DPlay.SendChat( strCommand );
				}
				g_WndMng.GetShortcutWarningTimer().Reset();
			}
			else
			{
				if( g_WndMng.GetWarningTimer().IsTimeOut() == FALSE )
				{
					g_WndMng.SetWarningCounter( g_WndMng.GetWarningCounter() + 1 );
					CWndChat* pWndChat = ( CWndChat* )g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
					if( pWndChat )
					{
						if( g_WndMng.GetWarningCounter() >= CWndMgr::BANNING_POINT )
						{
							// 과도한 채팅으로 인하여 %d분 동안 채팅 금지 페널티를 받으셨습니다.
							CString strChattingError1 = _T( "" );
							strChattingError1.Format( prj.GetText( TID_GAME_ERROR_CHATTING_2 ), CWndMgr::BANNING_MILLISECOND / 1000 / 60 );
							pWndChat->PutString( strChattingError1, prj.GetTextColor( TID_GAME_ERROR_CHATTING_2 ) );
							g_WndMng.SetWarningCounter( 0 );
							g_WndMng.GetBanningTimer().Reset();
						}
						else
						{
							// 연속 채팅으로 인하여 메시지가 출력되지 않았습니다.
							pWndChat->PutString( prj.GetText( TID_GAME_ERROR_CHATTING_1 ), 0xffff0000 );
						}
					}
				}
				else
				{
					if( g_WndMng.GetWarning2Timer().IsTimeOut() == FALSE )
					{
						g_WndMng.SetWarning2Counter( g_WndMng.GetWarning2Counter() + 1 );
						CWndChat* pWndChat = ( CWndChat* )g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
						if( pWndChat )
						{
							if( g_WndMng.GetWarning2Counter() >= CWndMgr::BANNING_2_POINT )
							{
								// 과도한 채팅으로 인하여 %d분 동안 채팅 금지 페널티를 받으셨습니다.
								CString strChattingError1 = _T( "" );
								strChattingError1.Format( prj.GetText( TID_GAME_ERROR_CHATTING_2 ), CWndMgr::BANNING_MILLISECOND / 1000 / 60 );
								pWndChat->PutString( strChattingError1, prj.GetTextColor( TID_GAME_ERROR_CHATTING_2 ) );
								g_WndMng.SetWarning2Counter( 0 );
								g_WndMng.GetBanningTimer().Reset();
							}
							else
							{
								CString strCommand = _T( "" );
								strCommand.Format( "/s %s", string );
								g_DPlay.SendChat( strCommand );
							}
						}
					}
					else
					{
						CString strCommand = _T( "" );
						strCommand.Format( "/s %s", string );
						g_DPlay.SendChat( strCommand );
					}
				}
				g_WndMng.GetWarningTimer().Reset();
				g_WndMng.GetWarning2Timer().Reset();
			}
		}
		else
		{
			CWndChat* pWndChat = (CWndChat*)g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
			if( pWndChat )
				g_WndMng.PutString( prj.GetText( TID_GAME_CHATSAMETEXT ), NULL, prj.GetTextColor( TID_GAME_CHATSAMETEXT ) );
		}
	}
#else // __BAN_CHATTING_SYSTEM
	if( stringBack != string || timerDobe.TimeOut() )
	{
		if( !g_pPlayer->IsShoutFull()
			|| ( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_USA )
			|| ( ::GetLanguage() == LANG_ENG && ::GetSubLanguage() == LANG_SUB_IND )
			|| ::GetLanguage() == LANG_GER
			|| ::GetLanguage() == LANG_FRE
			|| ::GetLanguage() == LANG_JAP
			|| ::GetLanguage() == LANG_VTN
			|| ::GetLanguage() == LANG_POR
			|| ::GetLanguage() == LANG_RUS
		)
			if( g_Neuz.m_nShoutLimitCount > 0 && timeLimit.Check() == TRUE ) // 제한을 넘었다.
			{
				//외치기는 %n초안에 %d번만 허용됩니다.
				char szMsg[256];
				sprintf( szMsg, prj.GetText( TID_GAME_LIMIT_SHOUT ), g_Neuz.m_dwShoutLimitSecond / 1000, g_Neuz.m_nShoutLimitCount );
				g_WndMng.PutString( szMsg, NULL, prj.GetTextColor( TID_GAME_LIMIT_SHOUT ) );
				return FALSE;
			}

		stringBack = string;
		timerDobe.Set( SEC( 3 ) );
		g_WndMng.WordChange( string );

		CString strCommand;
		strCommand.Format( "/s %s", string );
		g_DPlay.SendChat( strCommand );
	}
	else
	{
		CWndChat* pWndChat = (CWndChat*)g_WndMng.GetWndBase( APP_COMMUNICATION_CHAT );
		if( pWndChat )
			g_WndMng.PutString( prj.GetText( TID_GAME_CHATSAMETEXT ), NULL, prj.GetTextColor( TID_GAME_CHATSAMETEXT ) );
	}
#endif // __BAN_CHATTING_SYSTEM
	return FALSE;
#endif // __CLIENT
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_PartyChat( CScanner& scanner )            
{ 
#ifdef __WORLDSERVER
	static	\
		CHAR lpString[260];
	
	CUser* pUser	= (CUser*)scanner.dwValue;

#ifdef __JEFF_9_20
#if __VER >= 12 // __LORD
	int nText	= pUser->GetMuteText();
	if(  nText )
	{
		pUser->AddDefinedText( nText );
		return TRUE;
	}
#else	// __LORD
	if( pUser->IsMute() )
		return TRUE;
#endif	// __LORD
#endif	// __JEFF_9_20
	
	lpString[0] = '\0';
	
	scanner.GetLastFull();
	if( lstrlen( scanner.token ) >= 260 )
		return TRUE;
	strcpy( lpString, scanner.token );

	StringTrimRight( lpString );	

	if( !(pUser->HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_FONTEDIT)))
	{
		ParsingEffect(lpString, strlen(lpString) );
	}
	RemoveCRLF( lpString );
	
	CParty* pParty;
	
	pParty	= g_PartyMng.GetParty( pUser->GetPartyId() );
	if( pParty && pParty->IsMember( pUser->m_idPlayer ))
	{
		// 파티가 있어서 파티원들에게 보냄
		g_DPCoreClient.SendPartyChat( pUser, lpString );
	}
	else
	{
		// 월드서버에서 파티가 없는경우
		pUser->AddSendErrorParty( ERROR_NOPARTY );
	}

	// 클라이언트에서 극단참여중이니즐 먼저 검색함
#else // __WORLDSERVER
#ifdef __CLIENT
	if( g_Party.GetSizeofMember() >= 2 )
	{
		CString string = scanner.m_pProg;
		g_WndMng.WordChange( string );

		if( ::GetLanguage() == LANG_THA )
			string = '"'+string+'"';
		
		CString strCommand;
		strCommand.Format( "/p %s", string );
		g_DPlay.SendChat( strCommand );
	}
	else
	{
		// 극단원이 아니므로 
		// 극단에 포함되지 않아 극단채팅을 할수 없습니다.
		//g_WndMng.PutString( "극단에 포함되지 않아 극단채팅을 할수 없습니다", NULL, 0xff99cc00 );
		g_WndMng.PutString( prj.GetText( TID_GAME_PARTYNOTCHAT ), NULL, prj.GetTextColor( TID_GAME_PARTYNOTCHAT ) );
		
	}
	return FALSE;
#endif // __CLIENT
#endif // __WORLDSERVER
	return TRUE;
}


BOOL TextCmd_Music( CScanner& scanner )            
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;

	u_long idmusic	= scanner.GetNumber();
	g_DPCoreClient.SendPlayMusic( pUser->GetWorld()->GetID(), idmusic );
#endif	// __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_Sound( CScanner& scanner )            
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	u_long idsound	= scanner.GetNumber();
	g_DPCoreClient.SendPlaySound( pUser->GetWorld()->GetID(), idsound );
#endif	// __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_Summon( CScanner& scanner )           
{
#ifdef __WORLDSERVER
	TCHAR lpszPlayer[32];

	scanner.GetToken();
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( strcmp( pUser->GetName(), scanner.Token) )
	{
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer		= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idPlayer > 0 ){
			strcpy( lpszPlayer, scanner.Token );
#ifdef __SECURITY_FIXES
		CUser* pUserTarget = static_cast<CUser*>( prj.GetUserByID( idPlayer ) );
		if( pUserTarget )
			pUserTarget->REPLACE( g_uIdofMulti, pUser->GetWorld()->GetID(),  pUser->GetPos(), REPLACE_FORCE,  pUser->GetLayer() );
#else// __SECURITY_FIXES
#ifdef __LAYER_1015
			g_DPCoreClient.SendSummonPlayer( pUser->m_idPlayer, pUser->GetWorld()->GetID(), pUser->GetPos(), idPlayer, pUser->GetLayer() );
#else	// __LAYER_1015
			g_DPCoreClient.SendSummonPlayer( pUser->m_idPlayer, pUser->GetWorld()->GetID(), pUser->GetPos(), idPlayer );
#endif	// __LAYER_1015
#endif // __SECURITY_FIXES
		}
		else {
//			scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
	else 
	{
		pUser->AddReturnSay( 2, " " );  		// 자기 자신에게 명령했다.		
	}
	
#endif	// __WORLDSERVER
	return TRUE;
}

#ifdef __PET_1024
BOOL TextCmd_ClearPetName( CScanner & s )
{
#ifdef __CLIENT
	g_DPlay.SendClearPetName();
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_SetPetName( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CPet* pPet	= pUser->GetPet();
	if( !pPet )
		return TRUE;
	s.GetToken();
	pPet->SetName( s.token );
	g_UserMng.AddSetPetName( pUser, s.token );
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __PET_1024

#ifdef __LAYER_1020
BOOL TextCmd_CreateLayer( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	DWORD dwWorld	= s.GetNumber();
	CWorld* pWorld	= g_WorldMng.GetWorld( dwWorld );
	if( pWorld )
	{
		int nLayer	= s.GetNumber();
//		pWorld->m_linkMap.CreateLinkMap( nLayer );
		pWorld->CreateLayer( nLayer );
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_DeleteLayer( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	DWORD dwWorld	= s.GetNumber();
	CWorld* pWorld	= g_WorldMng.GetWorld( dwWorld );
	if( pWorld )
	{
		int nLayer	= s.GetNumber();
//		pWorld->m_linkMap.DeleteLinkMap( nLayer );
		pWorld->ReleaseLayer( nLayer );		// do not call ReleaseLayer directly
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Layer( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	DWORD dwWorld	= s.GetNumber();
	CWorld* pWorld	= g_WorldMng.GetWorld( dwWorld );
	if( pWorld )
	{
		int nLayer	= s.GetNumber();
		CLinkMap* pLinkMap	= pWorld->m_linkMap.GetLinkMap( nLayer );
		if( pLinkMap )
		{
			FLOAT x	= s.GetFloat();
			FLOAT z	= s.GetFloat();
			if( pWorld->VecInWorld( x, z ) && x > 0 && z > 0 )	
				pUser->REPLACE( g_uIdofMulti, pWorld->GetID(), D3DXVECTOR3( x, 0, z ), REPLACE_NORMAL, nLayer );
			else
				pUser->AddText( "OUT OF WORLD" );
		}
		else
		{
			pUser->AddText( "LAYER NO EXISTS" );
		}
	}
	else
	{
		pUser->AddText( "UNDEFINED WORLD" );
	}
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __LAYER_1020

#if __VER >= 13 // __COUPLE_1117
#if __VER >= 13 // __COUPLE_1202
BOOL TextCmd_NextCoupleLevel( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CCouple* pCouple	= CCoupleHelper::Instance()->GetCouple( pUser->m_idPlayer );
	if( pCouple )
	{
		if( pCouple->GetLevel() < CCouple::eMaxLevel )
		{
			int nExperience	= CCoupleProperty::Instance()->GetTotalExperience( pCouple->GetLevel() + 1 ) - pCouple->GetExperience();
			g_dpDBClient.SendQueryAddCoupleExperience( pUser->m_idPlayer, nExperience );
		}
		else
			pUser->AddText( "MAX COUPLE LEVEL" );
	}
	else
		pUser->AddText( "COUPLE NOT FOUND" );
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __COUPLE_1202

BOOL TextCmd_Propose( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	s.GetToken();
	CCoupleHelper::Instance()->OnPropose( pUser, s.token );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Refuse( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CCoupleHelper::Instance()->OnRefuse( pUser );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Couple( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CCoupleHelper::Instance()->OnCouple( pUser );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Decouple( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CCoupleHelper::Instance()->OnDecouple( pUser );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ClearPropose( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	g_dpDBClient.SendClearPropose();
#endif	// __WORLDSERVER
	return TRUE;
}
/*
BOOL TextCmd_CoupleState( CScanner & s )
{
#ifdef __CLIENT
	CCouple* pCouple	= CCoupleHelper::Instance()->GetCouple();
	if( pCouple )
	{
		char szText[200]	= { 0,};
		const char* pszPartner	= CPlayerDataCenter::GetInstance()->GetPlayerString( pCouple->GetPartner( g_pPlayer->m_idPlayer ) );
		if( !pszPartner )	pszPartner	= "";
		sprintf( szText, "%s is partner.", pszPartner );
		g_WndMng.PutString( szText );
	}
	else
	{
		g_WndMng.PutString( "null couple." );
	}
#endif	// __CLIENT
	return TRUE;
}
*/
#endif	// __COUPLE_1117

BOOL TextCmd_Teleport( CScanner& scanner )         
{ 
#ifdef __WORLDSERVER
	TCHAR *lpszPlayer = NULL;
	int x, z;
	CUser* pUser	= (CUser*)scanner.dwValue;

	// 플레이어에게 바로 텔레포트 
	int nTok = scanner.GetToken();
	if( nTok != NUMBER )
	{
		// player
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer	= prj.GetPlayerID( scanner.token );
#endif	// __SYS_PLAYER_DATA
#if __VER >= 14 // __INSTANCE_DUNGEON
		CUser* pUserTarget = static_cast<CUser*>( prj.GetUserByID( idPlayer ) );
		if( IsValidObj( pUserTarget ) )
		{
			CWorld* pWorld = pUserTarget->GetWorld();
			if( pWorld )
			{
				if( CInstanceDungeonHelper::GetInstance()->IsInstanceDungeon( pWorld->GetID() ) )
					if( pWorld != pUser->GetWorld() || pUser->GetLayer() != pUserTarget->GetLayer() )
						return TRUE;

				pUser->REPLACE( g_uIdofMulti, pWorld->GetID(), pUserTarget->GetPos(), REPLACE_NORMAL, pUserTarget->GetLayer() );
			}
		}
#else // __INSTANCE_DUNGEON
		if( idPlayer > 0 ) 
		{
			g_DPCoreClient.SendTeleportPlayer( pUser->m_idPlayer, idPlayer );
		}
#endif // __INSTANCE_DUNGEON
		else 
		{
		#ifdef _DEBUG
			// 플레이어를 못찾으면 NPC로 찾는다.
			CWorld* pWorld	= pUser->GetWorld();
			CMover* pMover = pWorld->FindMover( scanner.Token );
			if( pMover )
			{
				pUser->REPLACE( g_uIdofMulti, pWorld->GetID(), pMover->GetPos(), REPLACE_NORMAL, pMover->GetLayer() );
				return TRUE;
			}
		#endif // _DEBUG
			pUser->AddReturnSay( 3, scanner.m_mszToken );
		}
	}
	// 첫번째 파라메타는 월드 번호.
	DWORD dwWorldId = atoi( scanner.token );
#if __VER >= 14 // __INSTANCE_DUNGEON
	if( CInstanceDungeonHelper::GetInstance()->IsInstanceDungeon( dwWorldId ) )
	{
		if( pUser->GetWorld() && pUser->GetWorld()->GetID() != dwWorldId )
			return TRUE;
	}
#endif // __INSTANCE_DUNGEON
	if( g_WorldMng.GetWorldStruct( dwWorldId ) )
	{
		// 두번째 파라메타가 스트링이면 리젼 키
		if( scanner.GetToken() != NUMBER )
		{
			PRegionElem pRgnElem = g_WorldMng.GetRevivalPos( dwWorldId, scanner.token );
			if( NULL != pRgnElem )
				pUser->REPLACE( g_uIdofMulti, pRgnElem->m_dwWorldId, pRgnElem->m_vPos, REPLACE_NORMAL, nRevivalLayer );
		}
		// 스트링이 아니면 좌표 
		else
		{
			x = atoi( scanner.token );
			z = scanner.GetNumber();

			CWorld* pWorld = g_WorldMng.GetWorld( dwWorldId );
			if( pWorld && pWorld->VecInWorld( (FLOAT)( x ), (FLOAT)( z ) ) && x > 0 && z > 0 )
			{
				int nLayer	= pWorld == pUser->GetWorld()? pUser->GetLayer(): nDefaultLayer;
				pUser->REPLACE( g_uIdofMulti, dwWorldId, D3DXVECTOR3( (FLOAT)x, 0, (FLOAT)z ), REPLACE_NORMAL, nLayer );
			}
		}
	}
#endif // __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_Out( CScanner& scanner )              
{ 
#ifdef __WORLDSERVER
//	TCHAR lpszPlayer[MAX_PLAYER];
	scanner.GetToken();

	CUser* pUser	= (CUser*)scanner.dwValue;
	if( strcmp( pUser->GetName(), scanner.Token) )
	{	
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer		= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idPlayer > 0 ) {
			g_DPCoreClient.SendKillPlayer( pUser->m_idPlayer, idPlayer );
		}
		else {
//			scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
	else
	{
		pUser->AddReturnSay( 2, " " );  		// 자기 자신에게 명령했다.
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_RemoveNpc( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	OBJID objid	= (OBJID)s.GetNumber();

	CMover* pMover	= prj.GetMover( objid );
	if( IsValidObj( (CObj*)pMover ) )
	{
		if( pMover->IsNPC() )
			pMover->Delete();
	}
#endif	// __WORLDSERVER
	return TRUE;
}


BOOL TextCmd_CreateItem2( CScanner & s )
{
#ifdef __WORLDSERVER
	s.GetToken();
	ItemProp* pItemProp	= prj.GetItemProp( s.Token );
	if( pItemProp && pItemProp->dwItemKind3 != IK3_VIRTUAL )
	{
		int nRandomOptItemId	= s.GetNumber();
		PRANDOMOPTITEM pRandomOptItem	= CRandomOptItemGen::GetInstance()->GetRandomOptItem( nRandomOptItemId );
		if( pRandomOptItem )
		{
			CItemElem itemElem;
			itemElem.m_dwItemId		= pItemProp->dwID;
			itemElem.m_nItemNum	= 1;
			itemElem.m_nHitPoint	= -1;
			itemElem.SetRandomOpt( pRandomOptItem->nId );
			CUser* pUser	= (CUser*)s.dwValue;
			pUser->CreateItem( &itemElem );
		}
	}
	return TRUE;
#else	// __WORLDSERVER
	return TRUE;
#endif	// __WORLDSERVER
}

BOOL TextCmd_CreateItem( CScanner& scanner )       
{
	scanner.GetToken();

#ifdef __CLIENT
	// 클라이언트에서
	if( scanner.tok == FINISHED )
	{
		g_WndMng.CreateApplet( APP_WIKI_ITEMS );
		return FALSE;
	}
	return TRUE;
#else   // __CLIENT
	DWORD dwNum;
	DWORD dwCharged		= 0;
	ItemProp* pProp	= NULL;

	if( scanner.tokenType == NUMBER )
		pProp	= prj.GetItemProp( _ttoi( scanner.Token ) );
	else
		pProp	= prj.GetItemProp( scanner.Token );

	if( pProp && pProp->dwItemKind3 != IK3_VIRTUAL )
	{
		if( pProp->dwItemKind3 == IK3_EGG && pProp->dwID != II_PET_EGG )	// 리어펫을 생성하려고 할 경우 "알"인 경우만 생성 가능하다.
		{
			// A species pet item (not the plain egg) needs a real CPet payload
			// (kind/level/exp/life/energy/avail-levels), not just an item id -
			// build one instead of refusing, mirroring what CMover::PetLevelup()'s
			// hatch branch does for a freshly-hatched grade D pet.
#ifdef __LOOKCHANGE
			BYTE nKind;
			if( !CPetProperty::GetInstance()->FindKindByItemId( pProp->dwID, nKind ) )
				return TRUE;	// not a recognized pet species item

			dwNum	= scanner.GetNumber();
			dwNum	= ( dwNum == 0? 1: dwNum );

			CItemElem itemElem;
			itemElem.m_dwItemId	= pProp->dwID;
			itemElem.m_nItemNum	= (short)( dwNum );
			itemElem.m_nHitPoint	= -1;

			CPet* pPet	= itemElem.m_pPet	= new CPet;
			pPet->SetKind( nKind );
			pPet->SetLevel( PL_D );
			pPet->SetLife( 1 );
			pPet->SetExp( 0 );
			pPet->SetEnergy( pPet->GetMaxEnergy() );
			pPet->SetAvailLevel( PL_D, CPetProperty::GetInstance()->GetLevelupAvailLevel( PL_D ) );

			CUser* pUser	= (CUser*)scanner.dwValue;
			pUser->CreateItem( &itemElem );
#endif	// __LOOKCHANGE
			return TRUE;
		}

		dwNum	= scanner.GetNumber();
		dwNum	= ( dwNum == 0? 1: dwNum );
		dwCharged	= scanner.GetNumber();
		dwCharged	= ( dwCharged == 0 ? 0 : 1 );
		
		CItemElem itemElem;
		itemElem.m_dwItemId		= pProp->dwID;
		itemElem.m_nItemNum		= (short)( dwNum );
		itemElem.m_nHitPoint	= -1;
		itemElem.m_bCharged		= dwCharged;

		CUser* pUser	= (CUser*)scanner.dwValue;
		pUser->CreateItem( &itemElem );
	}
#endif	// !__CLIENT 
	return TRUE;
}

BOOL TextCmd_LocalEvent( CScanner & s )
{
#ifdef __WORLDSERVER
	int id	= s.GetNumber();
	if( id != EVE_18 )	// 이 식별자는 18세 서버를 나타내는 식별자므로 운영자의 명령에 의한 설정 불가
	{
		BYTE nState		= (BYTE)s.GetNumber();
		if( g_eLocal.SetState( id, nState ) )		g_UserMng.AddSetLocalEvent( id, nState );
	}
#endif	// __WORLDSERVER
	return TRUE;
}

// 무버이름 캐릭터키 갯수 선공 
BOOL TextCmd_CreateChar( CScanner& scanner )       
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	D3DXVECTOR3 vPos = pUser->GetPos();
	CWorld* pWorld	= pUser->GetWorld();
	
	MoverProp* pMoverProp	= NULL;

	scanner.GetToken();
	if( scanner.tokenType == NUMBER ) 
	{
		DWORD dwID	= _ttoi( scanner.Token );
		pMoverProp = prj.GetMoverPropEx( dwID );
	}
	else
		pMoverProp	= prj.GetMoverProp( scanner.Token );

	scanner.GetToken();
	CString strName = scanner.Token;

	if( pMoverProp && pMoverProp->dwID != 0 )
	{
		DWORD dwNum	= scanner.GetNumber();
		if( dwNum > 100 ) dwNum = 100;
		if( dwNum == 0 ) dwNum = 1;

		BOOL bActiveAttack = scanner.GetNumber();
		for( DWORD dw = 0; dw < dwNum; dw++ )
		{
			CMover* pMover = (CMover*)CreateObj( D3DDEVICE, OT_MOVER, pMoverProp->dwID );
			if( NULL == pMover ) return FALSE; // ASSERT( pObj );
			strcpy( pMover->m_szCharacterKey, strName );
			pMover->InitNPCProperty();
			pMover->InitCharacter( pMover->GetCharacter() );
			pMover->SetPos( vPos );
			pMover->InitMotion( MTI_STAND );
			pMover->UpdateLocalMatrix();
			if( bActiveAttack )
				pMover->m_bActiveAttack = bActiveAttack;
			pWorld->ADDOBJ( pMover, TRUE, pUser->GetLayer() );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CreateCtrl( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	D3DXVECTOR3 vPos	= pUser->GetPos();
	CWorld* pWorld	= pUser->GetWorld();

	DWORD dwID	= s.GetNumber();
	
	if( dwID == 0 )
		return FALSE;

	CCtrl* pCtrl	= (CCtrl*)CreateObj( D3DDEVICE, OT_CTRL, dwID );
	if( !pCtrl )
		return FALSE;

	pCtrl->SetPos( vPos );
	pWorld->ADDOBJ( pCtrl, TRUE, pUser->GetLayer() );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_PostMail( CScanner & s )
{
#ifdef __CLIENT
	DWORD dwIndex	= s.GetNumber();
	short nItemNum	= s.GetNumber();
	char lpszReceiver[MAX_PLAYER]	= { 0, };
	s.GetToken();
	lstrcpy( lpszReceiver, s.Token );
	int nGold	= s.GetNumber();
	char lpszTitle[MAX_MAILTITLE]	= { 0, };
	s.GetToken();
	lstrcpy( lpszTitle, s.Token );
	char lpszText[MAX_MAILTEXT]	= { 0, };
	s.GetToken();
	lstrcpy( lpszText, s.Token );

	CItemElem* pItemElem	= g_pPlayer->m_Inventory.GetAt( dwIndex );
	if( pItemElem )
	{
		g_DPlay.SendQueryPostMail( (WORD)( pItemElem->m_dwObjId ), nItemNum, lpszReceiver, nGold, lpszTitle, lpszText );
	}
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_RemoveMail( CScanner & s )
{
#ifdef __CLIENT
	u_long nMail	= s.GetNumber();
	g_DPlay.SendQueryRemoveMail( nMail );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_GetMailItem( CScanner & s )
{
#ifdef __CLIENT
	u_long nMail	= s.GetNumber();
	g_DPlay.SendQueryGetMailItem( nMail );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_GetMailGold( CScanner & s )
{
#ifdef __CLIENT
	u_long nMail	= s.GetNumber();
	g_DPlay.SendQueryGetMailGold( nMail );
#endif	// __CLIENT
	return TRUE;
}

#if __VER >= 9 // __EVENTLUA
BOOL TextCmd_Lua( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	s.GetToken();
	s.Token.MakeLower();
		
	if( s.Token == "event" )
	{
		pUser->AddText( "Event.lua Reload..." );
		Error( "Event.lua Reload... - %s", pUser->GetName() );
		g_dpDBClient.SendEventLuaChanged();
	}
#if __VER >= 12 // __MONSTER_SKILL
	else if( s.Token == "ms" )
	{
		CMonsterSkill::GetInstance()->Clear();
		CMonsterSkill::GetInstance()->LoadScript();
	}
#endif // __MONSTER_SKILL
#if __VER >= 13 // __RAINBOW_RACE
	else if( s.Token == "rr" )
	{
		CRainbowRaceMng::GetInstance()->LoadScript();
	}
#endif // __RAINBOW_RACE
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_LuaEventList( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	prj.m_EventLua.GetAllEventList( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_LuaEventInfo( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	prj.m_EventLua.GetEventInfo( pUser, s.GetNumber() );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __EVENTLUA

#ifdef __JEFF_9_20
BOOL TextCmd_Mute( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	s.GetToken();
	if( s.tok == FINISHED )
		return TRUE;
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
#else	// __SYS_PLAYER_DATA
	u_long uidPlayer	= prj.GetPlayerID( s.token );
#endif	// __SYS_PLAYER_DATA
	
	if( idPlayer == 0 )
	{
		pUser->AddText( "player not found" );
		return TRUE;
	}
	CUser* pTarget	= g_UserMng.GetUserByPlayerID( idPlayer );
	if( IsValidObj( pTarget ) )
	{
		DWORD dwMute	= (DWORD)s.GetNumber();
		if( s.tok == FINISHED )
			return TRUE;
		pTarget->m_dwMute	= dwMute;
	}
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __JEFF_9_20

#if __VER >= 8 // __CSC_VER8_5
BOOL TextCmd_AngelExp( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	int nAddExp	= s.GetNumber();

	if( pUser->HasBuffByIk3( IK3_ANGEL_BUFF ) )
	{
		int nAngel = 100;
	#ifdef __BUFF_1107
		IBuff* pBuff	= pUser->m_buffs.GetBuffByIk3( IK3_ANGEL_BUFF );
		WORD wId	= ( pBuff? pBuff->GetId(): 0 );
	#else	// __BUFF_1107
		LPSKILLINFLUENCE lpSkillIn = pUser->m_SkillState.GetItemBuf( IK3_ANGEL_BUFF );
		WORD wId	= ( lpSkillIn? lpSkillIn->wID: 0 );
	#endif	// __BUFF_1107
		if( wId )
		{
			ItemProp* pItemProp = prj.GetItemProp( wId );
			if( pItemProp )
				nAngel = (int)( (float)pItemProp->nAdjParamVal1 );
		}
		if( nAngel <= 0 || 100 < nAngel  )
			nAngel = 100;

		EXPINTEGER nMaxAngelExp = prj.m_aExpCharacter[pUser->m_nAngelLevel].nExp1 / 100 * nAngel;
		if( pUser->m_nAngelExp < nMaxAngelExp )
		{
			pUser->m_nAngelExp += nAddExp;
			BOOL bAngelComplete = FALSE;
			if( pUser->m_nAngelExp > nMaxAngelExp )
			{
				pUser->m_nAngelExp = nMaxAngelExp;
				bAngelComplete = TRUE;
			}
			pUser->AddAngelInfo( bAngelComplete );
		}
	}
#endif // __WORLDSERVER
	return TRUE;	
}
#endif // __CSC_VER8_5

#ifdef __EVENT_1101
BOOL TextCmd_CallTheRoll( CScanner& s )  
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nCount	= s.GetNumber();
#ifdef __EVENT_1101_2
	pUser->m_nEventFlag = 0;
#else // __EVENT_1101_2
	pUser->m_dwEventFlag	= 0;
#endif // __EVENT_1101_2
	pUser->m_dwEventTime	= 0;
	pUser->m_dwEventElapsed	= 0;
	for(  int i = 0; i < nCount; i++ )
#ifdef __EVENT_1101_2
		pUser->SetEventFlagBit( 62 - i );
#else // __EVENT_1101_2
		pUser->SetEventFlagBit( 31 - i );
#endif // __EVENT_1101_2
#endif	// __WORLDSERVER
	return TRUE;
}

#endif	// __EVENT_1101

BOOL TextCmd_CreatePc( CScanner& scanner )  
{ 
#ifdef __PERF_0226
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	int nNum = scanner.GetNumber();
	for( int i=0; i<nNum; i++ )
	{
		int nSex	= xRandom( 2 );
		DWORD dwIndex	= ( nSex == SEX_FEMALE? MI_FEMALE: MI_MALE );

		CMover* pMover	= (CMover*)CreateObj( D3DDEVICE, OT_MOVER, dwIndex );
		if( NULL == pMover )	
			return FALSE;
		pMover->SetPos( pUser->GetPos() );
		pMover->InitMotion( MTI_STAND );
		pMover->UpdateLocalMatrix();
		SAFE_DELETE( pMover->m_pAIInterface );
		pMover->SetAIInterface( AII_MONSTER );
		pMover->m_Inventory.SetItemContainer( ITYPE_ITEM, MAX_INVENTORY, MAX_HUMAN_PARTS ); 

		static DWORD adwParts[5]	= {	PARTS_CAP, PARTS_HAND, PARTS_UPPER_BODY, PARTS_FOOT, PARTS_RWEAPON };
		for( int i = 0; i < 5; i++ )
		{
			CItemElem itemElem;
			ItemProp* pProp	= CPartsItem::GetInstance()->GetItemProp( ( i == 4? SEX_SEXLESS: nSex ), adwParts[i] );
			if( pProp )
			{
				CItemElem	itemElem;
				itemElem.m_dwItemId	= pProp->dwID;
				itemElem.m_nItemNum	= 1;
				itemElem.SetAbilityOption( xRandom( 10 ) );
				WORD nId; BYTE nCount;
				short nNum;
				pMover->m_Inventory.Add( &itemElem, &nId, &nNum, &nCount );
				CItemElem* pAddItem	= pMover->m_Inventory.GetAtId( nId );
				pMover->m_Inventory.DoEquip( pAddItem->m_dwObjIndex, pProp->dwParts );
			}
		}
		pUser->GetWorld()->ADDOBJ( pMover, TRUE, pUser->GetLayer() );
	}
#endif	// __WORLDSERVER
#endif	// __PERF_0226
	return TRUE;
}

BOOL TextCmd_CreateNPC( CScanner& scanner )  
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	D3DXVECTOR3 vPos	= pUser->GetPos();
	CWorld* pWorld	= pUser->GetWorld();

	MoverProp* pMoverProp	= NULL;

	scanner.GetToken();
	if( scanner.tokenType == NUMBER ) 
	{
		DWORD dwID	= _ttoi( scanner.Token );
		pMoverProp = prj.GetMoverPropEx( dwID );
	}
	else
		pMoverProp	= prj.GetMoverProp( scanner.Token );

	CString strName = scanner.Token;

	if( pMoverProp && pMoverProp->dwID != 0 )
	{
		if( pMoverProp->dwAI != AII_MONSTER
			&& pMoverProp->dwAI != AII_CLOCKWORKS
			&& pMoverProp->dwAI != AII_BIGMUSCLE
			&& pMoverProp->dwAI != AII_KRRR
			&& pMoverProp->dwAI != AII_BEAR
			&& pMoverProp->dwAI != AII_METEONYKER
#ifdef __INSTANCE_AGGRO_SYSTEM
			&& pMoverProp->dwAI != AII_AGGRO_NORMAL
			&& pMoverProp->dwAI != AII_PARTY_AGGRO_LEADER
			&& pMoverProp->dwAI != AII_PARTY_AGGRO_SUB
#endif // __INSTANCE_AGGRO_SYSTEM
#if __VER >= 19
			&& pMoverProp->dwAI != AII_ARENA_REAPER
#endif
		)
			return TRUE;

		DWORD dwNum	= scanner.GetNumber();
		if( dwNum > 100 ) dwNum = 100;
		if( dwNum == 0 ) dwNum = 1;

		BOOL bActiveAttack = scanner.GetNumber();
		for( DWORD dw = 0; dw < dwNum; dw++ )
		{
			CObj* pObj	= CreateObj( D3DDEVICE, OT_MOVER, pMoverProp->dwID );
			if( NULL == pObj )	
				return FALSE;	
			pObj->SetPos( vPos );
			pObj->InitMotion( MTI_STAND );
			pObj->UpdateLocalMatrix();

			if( bActiveAttack )
				((CMover*)pObj)->m_bActiveAttack = bActiveAttack;
			
#if defined(__DPS_METER) && defined(__WORLDSERVER)
			{
				for( int idps = 0; idps < (int)prj.m_aDPSProp.size(); idps++ )
					if( pMoverProp->dwID == prj.m_aDPSProp[ idps ]->dwID )
						((CMover*)pObj)->m_bIsDPSMover = TRUE;

				if( pMoverProp->dwClass == RANK_BOSS || pMoverProp->dwClass == RANK_MIDBOSS || pMoverProp->dwClass == RANK_SUPER )
					((CMover*)pObj)->m_bIsDPSMover = TRUE;
			}
#endif // __DPS_METER && __WORLDSERVER
			((CMover*)pObj)->SetGold(((CMover*)pObj)->GetLevel()*15);  // 몬스터 생성시 기본 페냐를 설정
			pWorld->ADDOBJ( pObj, TRUE, pUser->GetLayer() );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Invisible( CScanner& scanner )        
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode |= TRANSPARENT_MODE;
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_NoInvisible( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode &= (~TRANSPARENT_MODE);
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_NoUndying( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode &= (~MATCHLESS_MODE);
	pUser->m_dwMode &= (~MATCHLESS2_MODE);
	g_UserMng.AddModifyMode( pUser );
#endif
	return TRUE;
}

// exp상승 금지 명령. 토글방식으로 동작.
BOOL TextCmd_ExpUpStop( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( pUser->m_dwMode & MODE_EXPUP_STOP )
		pUser->m_dwMode &= (~MODE_EXPUP_STOP);
	else
		pUser->m_dwMode |= MODE_EXPUP_STOP;
	
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	
	return TRUE;
}
BOOL TextCmd_PartyInvite( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	MoverProp* pMoverProp = NULL;
	scanner.GetToken();
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long uidPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
	u_long uidPlayer = prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
	if( 0 < uidPlayer )
	{
		CUser* pUser2	= g_UserMng.GetUserByPlayerID( uidPlayer );	
		if( IsValidObj( pUser2 ) )
			g_DPSrvr.InviteParty( pUser->m_idPlayer, pUser2->m_idPlayer, FALSE );
		else
			pUser->AddDefinedText( TID_DIAG_0060, "\"%s\"", scanner.Token );
	}
	else
	{
		pUser->AddDefinedText( TID_DIAG_0061, "\"%s\"", scanner.Token );
	}
#endif // __WORLDSERVER

	return TRUE;
}
BOOL TextCmd_GuildInvite( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	MoverProp* pMoverProp = NULL;
	scanner.GetToken();
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long uidPlayer	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
	u_long uidPlayer = prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
	if( 0 < uidPlayer )
	{
		CUser* pUser2	= g_UserMng.GetUserByPlayerID( uidPlayer );	
		if( IsValidObj( pUser2 ) )
		{
			g_DPSrvr.InviteCompany( pUser, pUser2->GetId() );
		}
		else
			pUser->AddDefinedText( TID_DIAG_0060, "\"%s\"", scanner.Token );
	}
	else
	{
		pUser->AddDefinedText( TID_DIAG_0061, "\"%s\"", scanner.Token );
	}
#endif // __WORLDSERVER

	return TRUE;
}

BOOL bCTDFlag	= FALSE;

BOOL TextCmd_CTD( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	if( g_eLocal.GetState( EVE_WORMON ) == 0 )
	{
		CGuildQuestProcessor* pProcessor	= CGuildQuestProcessor::GetInstance();
		CRect* pRect	= pProcessor->GetQuestRect( QUEST_WARMON_LV1 );
		if( pRect )
		{
			OutputDebugString( "recv /ctd" );
			REGIONELEM re;
			memset( &re, 0, sizeof(REGIONELEM) );
			re.m_uItemId	= 0xffffffff;
			re.m_uiItemCount	= 0xffffffff;
			re.m_uiMinLevel	= 0xffffffff;
			re.m_uiMaxLevel	= 0xffffffff;
			re.m_iQuest	= 0xffffffff;
			re.m_iQuestFlag	= 0xffffffff;
			re.m_iJob	= 0xffffffff;
			re.m_iGender	= 0xffffffff;
			re.m_dwAttribute	= RA_DANGER | RA_FIGHT;
			re.m_dwIdMusic	= 121;
			re.m_bDirectMusic	= TRUE;
			re.m_dwIdTeleWorld	= 0;
			re.m_rect.SetRect( pRect->TopLeft(), pRect->BottomRight() );
			lstrcpy( re.m_szTitle, "Duel Zone" );

			CWorld* pWorld	= g_WorldMng.GetWorld( WI_WORLD_MADRIGAL );
			if( pWorld )
			{
				LPREGIONELEM ptr	= pWorld->m_aRegion.GetAt( pWorld->m_aRegion.GetSize() - 1 );
				if( ptr->m_dwAttribute != ( RA_DANGER | RA_FIGHT ) )
					pWorld->m_aRegion.AddTail( &re );
				pUser->AddText( "recv /ctd" );
				g_UserMng.AddAddRegion( WI_WORLD_MADRIGAL, re );
			}
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Undying( CScanner& scanner )          
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode &= (~MATCHLESS2_MODE);
	pUser->m_dwMode |= MATCHLESS_MODE;
	g_UserMng.AddModifyMode( pUser );
#else // __WORLDSERVER
#ifndef __CLIENT
	CMover* pUser = (CMover*)scanner.dwValue;
	pUser->m_dwMode &= (~MATCHLESS2_MODE);
	pUser->m_dwMode |= MATCHLESS_MODE;
#endif
#endif
	return TRUE;
}
BOOL TextCmd_Undying2( CScanner& scanner )          
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode &= (~MATCHLESS_MODE);
	pUser->m_dwMode |= MATCHLESS2_MODE;
	g_UserMng.AddModifyMode( pUser );
#else // __WORLDSERVER
#ifndef __CLIENT
	CMover* pUser = (CMover*)scanner.dwValue;
	pUser->m_dwMode &= (~MATCHLESS_MODE);
	pUser->m_dwMode |= MATCHLESS2_MODE;
#endif
#endif
	return TRUE;
}


BOOL TextCmd_NoDisguise( CScanner& scanner )         
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->NoDisguise( NULL );
	g_UserMng.AddNoDisguise( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

#ifdef __WORLDSERVER
BOOL DoDisguise( CUser* pUser, DWORD dwIndex )
{
	pUser->Disguise( NULL, dwIndex );
	g_UserMng.AddDisguise( pUser, dwIndex );
	return TRUE;
}
#endif // __WORLDSERVER


BOOL TextCmd_Disguise( CScanner& scanner )         
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	MoverProp* pMoverProp = NULL;
	scanner.GetToken();
	if( scanner.tokenType == NUMBER ) 
	{
		DWORD dwID	= _ttoi( scanner.Token );
		pMoverProp = prj.GetMoverPropEx( dwID );
	}
	else
		pMoverProp	= prj.GetMoverProp( scanner.Token );

	if( pMoverProp )
		DoDisguise( pUser, pMoverProp->dwID );
#endif
	return TRUE;
}
BOOL TextCmd_Freeze( CScanner& scanner )           
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	scanner.GetToken();

	if( strcmp( pUser->GetName(), scanner.Token) )
	{
		u_long idFrom, idTo;
#if __VER >= 11 // __SYS_PLAYER_DATA
		idFrom	= CPlayerDataCenter::GetInstance()->GetPlayerId( (char*)pUser->GetName() );
		idTo	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		idFrom	= prj.GetPlayerID( pUser->GetName() );
		idTo	= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idFrom > 0 && idTo > 0 ) 
		{
			// 1 : 추가 m_dwMode
			g_DPCoreClient.SendModifyMode( DONMOVE_MODE, (BYTE)1, idFrom, idTo );					
		}
		else 
		{
//			scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
	else
	{
		pUser->AddReturnSay( 2, " " );		// 자기 자신에게 명령했다.
	}
#endif	// __WORLDSERVER	
	return TRUE;
}

BOOL TextCmd_NoFreeze( CScanner& scanner )           
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	scanner.GetToken();
	if( strcmp( pUser->GetName(), scanner.Token) )
	{
		u_long idFrom, idTo;
#if __VER >= 11 // __SYS_PLAYER_DATA
		idFrom	= CPlayerDataCenter::GetInstance()->GetPlayerId( (char*)pUser->GetName() );
		idTo	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		idFrom	= prj.GetPlayerID( pUser->GetName() );
		idTo	= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idFrom > 0 && idTo > 0 ) 
		{
			g_DPCoreClient.SendModifyMode( DONMOVE_MODE, (BYTE)0, idFrom, idTo );	// 0 : 뺌 m_dwMode
		}
		else 
		{
			//scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
	else
	{
		pUser->AddReturnSay( 2, " " );		// 자기 자신에게 명령했다.
	}
#endif	// __WORLDSERVER	
	return TRUE;
}

BOOL TextCmd_Talk( CScanner& scanner )           
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	
	scanner.GetToken();

	u_long idFrom, idTo;
#if __VER >= 11 // __SYS_PLAYER_DATA
	idFrom	= CPlayerDataCenter::GetInstance()->GetPlayerId( (char*)pUser->GetName() );
	idTo	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
	idFrom	= prj.GetPlayerID( pUser->GetName() );
	idTo	= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
	if( idFrom > 0 && idTo > 0 ) 
	{
		g_DPCoreClient.SendModifyMode( DONTALK_MODE, (BYTE)0, idFrom, idTo );	// 0 : 뺌 m_dwMode
	}
	else 
	{
		//scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
		pUser->AddReturnSay( 3, scanner.Token );
	}
#endif	// __WORLDSERVER	
	return TRUE;
}

BOOL TextCmd_NoTalk( CScanner& scanner )           
{ 
#ifdef __WORLDSERVER

	CUser* pUser	= (CUser*)scanner.dwValue;
	
	scanner.GetToken();

	{
		u_long idFrom, idTo;
#if __VER >= 11 // __SYS_PLAYER_DATA
		idFrom	= CPlayerDataCenter::GetInstance()->GetPlayerId( (char*)pUser->GetName() );
		idTo	= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
		idFrom	= prj.GetPlayerID( pUser->GetName() );
		idTo	= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
		if( idFrom > 0 && idTo > 0 ) 
		{
			g_DPCoreClient.SendModifyMode( DONTALK_MODE, (BYTE)1, idFrom, idTo );	// 1 : 추가
		}
		else 
		{
			//scanner.Token라는 이름을 가진 사용자는 이 게임에 존재하지 않는다.
			pUser->AddReturnSay( 3, scanner.Token );
		}
	}
#endif	// __WORLDSERVER	
	return TRUE;
}

BOOL TextCmd_GetGold( CScanner& scanner )           
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	int nGold = scanner.GetNumber();	
	pUser->AddGold( nGold );
#endif	// __WORLDSERVER	
	return TRUE;
}

// /간접 npcId "대사"
BOOL TextCmd_indirect( CScanner& scanner )         
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	DWORD dwIdNPC = scanner.GetNumber();
	TCHAR szString[ 1024 ];

	scanner.GetLastFull();
	if( strlen( scanner.token ) > 260 )
		return TRUE;
	strcpy( szString, scanner.token );
	StringTrimRight( szString );

	if( szString[ 0 ] )
	{
		CMover* pMover = prj.GetMover( dwIdNPC );
		if( pMover )
			g_UserMng.AddChat( (CCtrl*)pMover, (LPCSTR)szString );
	}
#else // __WORLDSERVER
	scanner.GetToken();
	if( g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER ) )
	{
		if( scanner.tok == FINISHED )
		{
			if( g_WndMng.GetWndBase( APP_ADMIN_INDIRECT_TALK ) == NULL )
			{
				CWndIndirectTalk* pWndIndirectTalk = new CWndIndirectTalk;
				pWndIndirectTalk->Initialize();
			}
			return FALSE;
		}
	}
#endif // __WORLDSERVER
	return TRUE;
}
/*
BOOL TextCmd_sbreport( CScanner & scanner )
{
#ifdef __WORLDSERVER
	if( !g_eLocal.GetState( EVE_SCHOOL ) )
		return FALSE;
	return CEveSchool::GetInstance()->Report();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_sbready( CScanner & scanner )
{
#ifdef __WORLDSERVER
	if( !g_eLocal.GetState( EVE_SCHOOL ) )
		return FALSE;
	return CEveSchool::GetInstance()->Ready();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_sbstart( CScanner & scanner )
{
#ifdef __WORLDSERVER
	if( !g_eLocal.GetState( EVE_SCHOOL ) )
		return FALSE;
	return CEveSchool::GetInstance()->Start();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_sbstart2( CScanner & scanner )
{
#ifdef __WORLDSERVER
	if( !g_eLocal.GetState( EVE_SCHOOL ) )
		return FALSE;
	return CEveSchool::GetInstance()->Start2();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_sbend( CScanner & scanner )
{
#ifdef __WORLDSERVER
	if( !g_eLocal.GetState( EVE_SCHOOL ) )
		return FALSE;
	return CEveSchool::GetInstance()->End();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_OpenBattleServer( CScanner & s )
{
#ifdef __WORLDSERVER
	BEFORESENDDUAL( ar, PACKETTYPE_OPEN_BATTLESERVER, DPID_UNKNOWN, DPID_UNKNOWN );
	SEND( ar, &g_dpDBClient, DPID_SERVERPLAYER );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CloseBattleServer( CScanner & s )
{
#ifdef __WORLDSERVER
	BEFORESENDDUAL( ar, PACKETTYPE_CLOSE_BATTLESERVER, DPID_UNKNOWN, DPID_UNKNOWN );
	SEND( ar, &g_dpDBClient, DPID_SERVERPLAYER );
#endif	// __WORLDSERVER
	return TRUE;
}
*/

BOOL TextCmd_ItemMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetMode( ITEM_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ItemNotMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetNotMode( ITEM_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_AttackMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetMode( NO_ATTACK_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_EscapeReset( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	CMover* pMover = prj.GetUserByID( scanner.GetNumber() );
	if( IsValidObj( pMover ) ) {
		pMover->SetSMMode( SM_ESCAPE, 0 );
	}
	else {
		pUser->SetSMMode( SM_ESCAPE, 0 );
	}
#else	// __WORLDSERVER
#ifdef __CLIENT
	CWorld* pWorld	= g_WorldMng.Get();
	CObj*	pObj;
	
	pObj = pWorld->GetObjFocus();
	if( pObj && pObj->GetType() == OT_MOVER && ((CMover*)pObj)->IsPlayer() )
	{
		CMover* pMover = (CMover*)pObj;
		CString strSend;
		if( pMover->IsPlayer() )
		{
			strSend.Format( "/EscapeReset %d", pMover->m_idPlayer  );
		}

		g_DPlay.SendChat( (LPCSTR)strSend );

		return FALSE;
	}
#endif //__CLIENT
#endif	// __WORLDSERVER
	return TRUE;
}



BOOL TextCmd_AttackNotMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetNotMode( NO_ATTACK_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CommunityMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetMode( COMMUNITY_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_CommunityNotMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetNotMode( COMMUNITY_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ObserveMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetMode( OBSERVE_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ObserveNotMode( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->SetNotMode( OBSERVE_MODE );
	g_UserMng.AddModifyMode( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_Onekill( CScanner& scanner )          
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode |= ONEKILL_MODE;
	g_UserMng.AddModifyMode( pUser );
#else // __WORLDSERVER
#ifndef __CLIENT
	CMover* pUser = (CMover*)scanner.dwValue;
	pUser->m_dwMode |= ONEKILL_MODE;
#endif
#endif
	return TRUE;
}
BOOL TextCmd_Position( CScanner& scanner )          
{ 
#ifdef __CLIENT
	CString string;
	D3DXVECTOR3 vPos = g_pPlayer->GetPos();
	//string.Format( "현재좌표 : x = %f, y = %f, z = %f", vPos.x, vPos.y, vPos.z );
	string.Format( prj.GetText(TID_GAME_NOWPOSITION), vPos.x, vPos.y, vPos.z );
	g_WndMng.PutString( string, NULL, prj.GetTextColor( TID_GAME_NOWPOSITION ) );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_NoOnekill( CScanner& scanner )          
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	pUser->m_dwMode &= (~ONEKILL_MODE);
	g_UserMng.AddModifyMode( pUser );
#else // __WORLDSERVER
#ifndef __CLIENT
	CMover* pUser = (CMover*)scanner.dwValue;
	pUser->m_dwMode &= (~ONEKILL_MODE);
#endif
#endif
	return TRUE;
}
BOOL TextCmd_ip( CScanner& scanner )               
{ 
#ifdef __WORLDSERVER
	scanner.GetToken();

	CUser* pUser = (CUser*)scanner.dwValue;
#if __VER >= 11 // __SYS_PLAYER_DATA
	u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( scanner.token );
#else	// __SYS_PLAYER_DATA
	u_long idPlayer		= prj.GetPlayerID( scanner.Token );
#endif	// __SYS_PLAYER_DATA
	if( idPlayer > 0 )
		g_DPCoreClient.SendGetPlayerAddr( pUser->m_idPlayer, idPlayer );
	else 
		pUser->AddReturnSay( 3, scanner.Token );
#else	// __WORLDSERVER
	#ifdef __CLIENT
	CWorld* pWorld	= g_WorldMng.Get();
	CObj*	pObj;
	
	pObj = pWorld->GetObjFocus();
	if( pObj && pObj->GetType() == OT_MOVER )
	{
		CMover* pMover = (CMover*)pObj;
		CString strSend;
		if( pMover->IsPlayer() )
		{
			strSend.Format( "/ip %s", pMover->GetName() );
		}
		else
		{
			strSend.Format( "%s", scanner.m_pBuf );
		}
		g_DPlay.SendChat( (LPCSTR)strSend );
		return FALSE;
	}
	#endif //__CLIENT
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_userlist( CScanner& scanner )         
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	g_DPCoreClient.SendGetCorePlayer( pUser->m_idPlayer );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_count( CScanner& scanner )            
{ 
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	g_DPCoreClient.SendGetPlayerCount( pUser->m_idPlayer );

	char szCount[128]	= { 0, };
	sprintf( szCount, "Players online: %d", g_UserMng.GetCount() );
	pUser->AddText( szCount );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_System( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CHAR szString[512] = "";

	CUser* pUser	= (CUser*)scanner.dwValue;

	scanner.GetLastFull();
	if( strlen( scanner.token ) >= 512 )
		return TRUE;
	strcpy( szString, scanner.token );
	StringTrimRight( szString );

#ifdef __ADMIN_SHOUT
	// "[Administrator][Name]:text" - ADMIN_SHOUT_MARK tells the client to draw it as a GM shout
	if( !IsValidObj( pUser ) || szString[0] == '\0' )
		return TRUE;
	LPCSTR szRank = "GameMaster";
	if( pUser->m_dwAuthorization >= AUTH_ADMINISTRATOR )
		szRank = "Administrator";
	else if( pUser->m_dwAuthorization == AUTH_OPERATOR )
		szRank = "Operator";
	CString strShout;
	strShout.Format( "%c[%s][%s]:%s", ADMIN_SHOUT_MARK, szRank, pUser->GetName(), szString );
	if( strShout.GetLength() > ADMIN_SHOUT_MAX_LEN )
		strShout = strShout.Left( ADMIN_SHOUT_MAX_LEN );
	g_DPCoreClient.SendSystem( strShout );
#else	// __ADMIN_SHOUT
	g_DPCoreClient.SendSystem( szString );
#endif	// __ADMIN_SHOUT
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_LoadScript( CScanner & scanner )
{
#ifdef __WORLDSERVER
	#if defined(__REMOVE_SCIRPT_060712)
		if( CWorldDialog::GetInstance().Reload() == FALSE )
			Error("WorldScript.dll reload error");
	#else
		CUser* pUser	 = (CUser*)scanner.dwValue;
		pUser->GetWorld()->LoadAllMoverDialog();
	#endif
#endif
	return TRUE;
}

BOOL TextCmd_FallSnow( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	 = (CUser*)scanner.dwValue;
	g_DPCoreClient.SendFallSnow();
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_FallRain( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	 = (CUser*)scanner.dwValue;
	g_DPCoreClient.SendFallRain();
#endif // __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_StopSnow( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	 = (CUser*)scanner.dwValue;
	g_DPCoreClient.SendStopSnow();
#endif // __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_StopRain( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	 = (CUser*)scanner.dwValue;
	g_DPCoreClient.SendStopRain();
#endif // __WORLDSERVER
	return TRUE;
}

#ifdef __WEATHER_COMMAND
// /weather rain|snow [time]  - time: 30 (minutes) | 30m | 2h | 5d, max 20 days; none: until /weather off
// /weather off
BOOL TextCmd_Weather( CScanner & scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	scanner.GetToken();
	CString strType	= scanner.token;
	strType.MakeLower();
	int nType;
	if( strType == "rain" )			nType = WEATHERCMD_RAIN;
	else if( strType == "snow" )	nType = WEATHERCMD_SNOW;
	else if( strType == "off" )		nType = WEATHERCMD_OFF;
	else
	{
		pUser->AddText( "Usage: /weather rain|snow [time]   time: 30 | 2h | 5d (max 20 days) - no time = until /weather off   |   /weather off" );
		return TRUE;
	}

	// Duration: "30" / "30m" / "2h" / "2 hours" / "5d" / "5 days". None = until /weather off.
	int nMinutes	= 0;
	if( nType != WEATHERCMD_OFF )
	{
		scanner.GetToken();
		if( scanner.tok != FINISHED )
		{
			CString strDur	= scanner.token;
			int nAmount		= atoi( strDur );
			CString strUnit	= strDur.Mid( strDur.SpanIncluding( "0123456789" ).GetLength() );
			if( strUnit.IsEmpty() )		// "5 days": the unit is the next word, if any
			{
				scanner.GetToken();
				if( scanner.tok != FINISHED )
					strUnit	= scanner.token;
			}
			strUnit.MakeLower();
			int nPerUnit	= 0;
			if( strUnit.IsEmpty() || strUnit == "m" || strUnit.Left( 3 ) == "min" )	nPerUnit = 1;
			else if( strUnit == "h" || strUnit.Left( 2 ) == "hr" || strUnit.Left( 4 ) == "hour" )	nPerUnit = 60;
			else if( strUnit == "d" || strUnit.Left( 3 ) == "day" )	nPerUnit = 60 * 24;
			if( nAmount <= 0 || nPerUnit == 0 )
			{
				pUser->AddText( "Duration examples: 30 | 30m | 2h | 2 hours | 5d | 5 days  (max 20 days)" );
				return TRUE;
			}
			nMinutes	= ( nAmount > WEATHERCMD_MAX_MINUTES / nPerUnit ) ? WEATHERCMD_MAX_MINUTES : nAmount * nPerUnit;
		}
	}

	g_DPCoreClient.SendSetWeather( nType, nMinutes );
	pUser->AddText( "[Weather] Sent. (Players need the weather effect option on to see it.)" );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __WEATHER_COMMAND

BOOL TextCmd_JobName( CScanner & scanner )
{
#ifdef __CLIENT
	char chMessage[MAX_PATH] = {0,};
	sprintf( chMessage, "Expert Job : " );
	for( int i = MAX_JOBBASE ; i < MAX_EXPERT ; ++i )
	{
		if( strlen( prj.m_aJob[i].szName ) < 15 )
		{
			strcat( chMessage, prj.m_aJob[i].szName );
			if( i + 1 != MAX_EXPERT )
			{
				strcat( chMessage, ", ");
			}
		}
	}
	g_WndMng.PutString( chMessage, NULL, 0xffff0000 );
	sprintf( chMessage, "Expert Level : %d ~ %d", MAX_JOB_LEVEL + 1, MAX_JOB_LEVEL + MAX_EXP_LEVEL );
	g_WndMng.PutString( chMessage, NULL, 0xffff0000 );

	sprintf( chMessage, "Professional Job : " );
	for( int i = MAX_EXPERT ; i < MAX_PROFESSIONAL ; ++i )
	{
		if( strlen( prj.m_aJob[i].szName ) < 15 )
		{
			strcat( chMessage, prj.m_aJob[i].szName );
			if( i + 1 != MAX_PROFESSIONAL )
			{
				strcat( chMessage, ", ");
			}
		}
	}
	g_WndMng.PutString( chMessage, NULL, 0xffff0000 );
	sprintf( chMessage, "Professional Level : %d ~~~ ", MAX_JOB_LEVEL + MAX_EXP_LEVEL );
	g_WndMng.PutString( chMessage, NULL, 0xffff0000 );
#endif // __CLIENT
	return TRUE;
}

#ifdef __CLIENT

BOOL TextCmd_tradeagree( CScanner & scanner )
{
	g_Option.m_bTrade = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_TRADEAGREE ), NULL, prj.GetTextColor( TID_GAME_TRADEAGREE ) );
	return TRUE;
}
BOOL TextCmd_traderefuse( CScanner & scanner )
{
	g_Option.m_bTrade = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_TRADEREFUSE ), NULL, prj.GetTextColor( TID_GAME_TRADEREFUSE ) );
	return TRUE;
}
BOOL TextCmd_whisperagree( CScanner & scanner )
{
	g_Option.m_bSay = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_WHISPERAGREE ), NULL, prj.GetTextColor( TID_GAME_WHISPERAGREE ) );
	return TRUE;
}
BOOL TextCmd_whisperrefuse( CScanner & scanner )
{
	g_Option.m_bSay = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_WHISPERREFUSE ), NULL, prj.GetTextColor( TID_GAME_WHISPERREFUSE ) );
	return TRUE;
}
BOOL TextCmd_messengeragree( CScanner & scanner )
{
	g_Option.m_bMessenger = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_MSGERAGREE ), NULL, prj.GetTextColor( TID_GAME_MSGERAGREE ) );
	return TRUE;
}
BOOL TextCmd_messengerrefuse( CScanner & scanner )
{
	g_Option.m_bMessenger = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_MSGERREFUSE ), NULL, prj.GetTextColor( TID_GAME_MSGERREFUSE ) );
	return TRUE;
}
BOOL TextCmd_stageagree( CScanner & scanner )
{
	g_Option.m_bParty = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_STAGEAGREE ), NULL, prj.GetTextColor( TID_GAME_STAGEAGREE ) );
	return TRUE;
}
BOOL TextCmd_stagerefuse( CScanner & scanner )
{
	g_Option.m_bParty = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_STAGEREFUSE ), NULL, prj.GetTextColor( TID_GAME_STAGEREFUSE ) );
	return TRUE;
}
BOOL TextCmd_connectagree( CScanner & scanner )
{
	g_Option.m_bMessengerJoin = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_CONNAGREE ), NULL, prj.GetTextColor( TID_GAME_CONNAGREE ) );
	return TRUE;
}
BOOL TextCmd_connectrefuse( CScanner & scanner )
{
	g_Option.m_bMessengerJoin = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_CONNREFUSE ), NULL, prj.GetTextColor( TID_GAME_CONNREFUSE ) );
	return TRUE;
}
BOOL TextCmd_shoutagree( CScanner & scanner )
{
	g_Option.m_bShout = 1;
	g_WndMng.PutString( prj.GetText( TID_GAME_SHOUTAGREE ), NULL, prj.GetTextColor( TID_GAME_SHOUTAGREE ) );
	return TRUE;
}
BOOL TextCmd_shoutrefuse( CScanner & scanner )
{
	g_Option.m_bShout = 0;
	g_WndMng.PutString( prj.GetText( TID_GAME_SHOUTREFUSE ), NULL, prj.GetTextColor( TID_GAME_SHOUTREFUSE ) );
	return TRUE;
}

#ifdef __YS_CHATTING_BLOCKING_SYSTEM
BOOL TextCmd_BlockUser( CScanner & scanner )
{
	if( prj.m_setBlockedUserID.size() >= CProject::BLOCKING_NUMBER_MAX )
	{
		// 차단 가능한 유저 수를 초과하였습니다. 차단 목록을 정리한 후에 다시 사용해 주십시오.
		g_WndMng.PutString( prj.GetText( TID_GAME_ERROR_FULL_BLOCKED_USER_LIST ), NULL, prj.GetTextColor( TID_GAME_ERROR_FULL_BLOCKED_USER_LIST ) );
		return FALSE;
	}
	scanner.GetToken();
	CString strUserName = scanner.token;
	if( strUserName == _T( "" ) )
	{
		// 존재하지 않은 아이디입니다. 아이디를 확인해 주십시오.
		g_WndMng.PutString( prj.GetText( TID_GAME_ERROR_INVALID_USER_ID ), NULL, prj.GetTextColor( TID_GAME_ERROR_INVALID_USER_ID ) );
		return FALSE;
	}
	if( g_pPlayer && g_pPlayer->GetName( TRUE ) == strUserName )
	{
		// 자기 캐릭터는 차단할 수 없습니다. 아이디를 확인해 주십시오.
		g_WndMng.PutString( prj.GetText( TID_GAME_ERROR_MY_CHARACTER_CANT_BLOCKING ), NULL, prj.GetTextColor( TID_GAME_ERROR_MY_CHARACTER_CANT_BLOCKING ) );
		return FALSE;
	}
	set< CString >::iterator BlockedUserIterator = prj.m_setBlockedUserID.find( strUserName );
	if( BlockedUserIterator != prj.m_setBlockedUserID.end() )
	{
		// 이미 채팅 차단되어 있는 대상입니다.
		g_WndMng.PutString( prj.GetText( TID_GAME_ERROR_ALREADY_BLOCKED ), NULL, prj.GetTextColor( TID_GAME_ERROR_ALREADY_BLOCKED ) );
	}
	else
	{
		prj.m_setBlockedUserID.insert( strUserName );

		if( g_WndMng.m_pWndChattingBlockingList )
		{
			g_WndMng.m_pWndChattingBlockingList->UpdateInformation();
		}

		CString strMessage = _T( "" );
		// %s 님의 채팅을 차단하였습니다.
		strMessage.Format( prj.GetText( TID_GAME_USER_CHATTING_BLOCKING ), strUserName );
		g_WndMng.PutString( strMessage, NULL, prj.GetTextColor( TID_GAME_USER_CHATTING_BLOCKING ) );
	}
	return TRUE;
}

BOOL TextCmd_CancelBlockedUser( CScanner & scanner )
{
	scanner.GetToken();
	CString strUserName = scanner.token;
	set< CString >::iterator BlockedUserIterator = prj.m_setBlockedUserID.find( strUserName );
	if( BlockedUserIterator != prj.m_setBlockedUserID.end() )
	{
		prj.m_setBlockedUserID.erase( strUserName );

		if( g_WndMng.m_pWndChattingBlockingList )
		{
			g_WndMng.m_pWndChattingBlockingList->UpdateInformation();
		}

		CString strMessage = _T( "" );
		// %s 님의 채팅 차단을 해제하였습니다.
		strMessage.Format( prj.GetText( TID_GAME_USER_CHATTING_UNBLOCKING ), strUserName );
		g_WndMng.PutString( strMessage, NULL, prj.GetTextColor( TID_GAME_USER_CHATTING_UNBLOCKING ) );
	}
	else
	{
		// 채팅 차단 목록에 없는 대상입니다.
		g_WndMng.PutString( prj.GetText( TID_GAME_ERROR_THERE_IS_NO_BLOCKED_TARGET ), NULL, prj.GetTextColor( TID_GAME_ERROR_THERE_IS_NO_BLOCKED_TARGET ) );
	}
	return TRUE;
}

BOOL TextCmd_IgnoreList( CScanner & scanner )
{
	if( g_WndMng.m_pWndChattingBlockingList )
	{
		SAFE_DELETE( g_WndMng.m_pWndChattingBlockingList );
	}

	g_WndMng.m_pWndChattingBlockingList = new CWndChattingBlockingList;
	if( g_WndMng.m_pWndChattingBlockingList )
	{
		g_WndMng.m_pWndChattingBlockingList->Initialize();
	}

	return TRUE;
}
#endif // __YS_CHATTING_BLOCKING_SYSTEM

#endif // __CLIENT

BOOL TextCmd_QuestState( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pAdmin	= (CUser*)s.dwValue;
	CUser* pUser	= NULL;
	int nQuest	= s.GetNumber();
	int nState = s.GetNumber();
	s.GetToken();
	if( s.tok != FINISHED )
	{
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer		= prj.GetPlayerID( s.Token );
#endif	// __SYS_PLAYER_DATA
		if( idPlayer )
			pUser	= g_UserMng.GetUserByPlayerID( idPlayer );
		if( pUser == NULL )
		{
			pAdmin->AddDefinedText( TID_DIAG_0061, "%s", s.Token );
			return TRUE;
		}
	}
	else
	{
		pUser	= pAdmin;
	}
	if( nState >= QS_BEGIN && nState < QS_END )
	{
		QUEST quest;
		if( pUser->SetQuest( nQuest, nState, &quest ) )
		{
			pUser->AddSetQuest( &quest );

			char pszComment[100]	= { 0, };
			sprintf( pszComment, "%s %d", pAdmin->GetName(), nState );
			g_dpDBClient.CalluspLoggingQuest(  pUser->m_idPlayer, nQuest, 11, pszComment );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_BeginQuest( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nQuest = s.GetNumber();
	QUEST quest;
	if( pUser->SetQuest( nQuest, 0, &quest ) )
		pUser->AddSetQuest( &quest );
#endif
	return TRUE;
}
BOOL TextCmd_EndQuest( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nQuest = s.GetNumber();
	QUEST quest;
	if( pUser->SetQuest( nQuest, QS_END, &quest ) )
		pUser->AddSetQuest( &quest );
#endif
	return TRUE;
}
// 지정한 것, 현재와 완료 다 뒤져서 삭제 
BOOL TextCmd_RemoveQuest( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pAdmin	= (CUser*)s.dwValue;
	CUser* pUser	= NULL;
	int nQuest	= s.GetNumber();
	s.GetToken();
	if( s.tok != FINISHED )
	{
#if __VER >= 11 // __SYS_PLAYER_DATA
		u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
#else	// __SYS_PLAYER_DATA
		u_long idPlayer		= prj.GetPlayerID( s.Token );
#endif	// __SYS_PLAYER_DATA
		if( idPlayer )
			pUser	= g_UserMng.GetUserByPlayerID( idPlayer );
		if( pUser == NULL )
		{
			pAdmin->AddDefinedText( TID_DIAG_0061, "%s", s.Token );
			return TRUE;
		}
	}
	else
	{
		pUser	= pAdmin;
	}

	LPQUEST pQuest	= pUser->GetQuest(nQuest );
	char pszComment[100]	= { 0, };
	sprintf( pszComment, "%s %d", pAdmin->GetName(), ( pQuest? pQuest->m_nState: -1 ) );
	g_dpDBClient.CalluspLoggingQuest(  pUser->m_idPlayer, nQuest, 40, pszComment );

	pUser->RemoveQuest( nQuest );
	pUser->AddRemoveQuest( nQuest );
#endif	// __WORLDSERVER
	return TRUE;
}
// 현재, 완료 모두 삭제 
BOOL TextCmd_RemoveAllQuest( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nQuest = s.GetNumber();
	pUser->RemoveAllQuest();
	pUser->AddRemoveAllQuest();
#endif
	return TRUE;
}
// 완료만 삭제 
BOOL TextCmd_RemoveCompleteQuest( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nQuest = s.GetNumber();
	pUser->RemoveCompleteQuest();
	pUser->AddRemoveCompleteQuest();
#endif
	return TRUE;
}

BOOL TextCmd_PvpParam( CScanner& scanner )
{
#if defined(__WORLDSERVER)
	CUser* pUser	= (CUser*)scanner.dwValue;
	int	nFame       = scanner.GetNumber();
	int nSlaughter  = scanner.GetNumber();

	pUser->m_nFame  = nFame;
	g_UserMng.AddSetFame( pUser, nFame );

#if __VER < 8 // __S8_PK
	pUser->ChangeSlaughter( CHANGE_SLAUGHTER_SET, NULL, nSlaughter );
#endif // __VER < 8 // __S8_PK
#endif
	return TRUE;
}
#if __VER >= 8 // __S8_PK
BOOL TextCmd_PKParam( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser*	pUser			= (CUser*)scanner.dwValue;
	int		nPKValue		= scanner.GetNumber();
	int		nPKPropensity	= scanner.GetNumber();

	if( nPKValue >= 0 )
	{
		pUser->SetPKValue( nPKValue );
		pUser->AddPKValue();
#if __VER >= 13 // __HONORABLE_TITLE			// 달인
		pUser->CheckHonorStat();
		pUser->AddHonorListAck();
		g_UserMng.AddHonorTitleChange( pUser, pUser->m_nHonor);
#endif	// __HONORABLE_TITLE			// 달인
	}

	if( nPKPropensity >= 0 )
	{
		pUser->SetPKPropensity( nPKPropensity );
		g_UserMng.AddPKPropensity( pUser );
	}
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __VER >= 8 // __S8_PK

#ifdef _DEBUG
BOOL TextCmd_TransyItemList( CScanner& scanner )
{
#ifdef __CLIENT
	CString szMsg;
	scanner.GetToken();
	if( scanner.tokenType == STRING )
	{
		szMsg.Format( "Wait : Write %s", scanner.Token );
		g_WndMng.PutString( szMsg );

		for( int i = 0; i < prj.m_aPropItem.GetSize(); i++ )
		{
			ItemProp* pItemProp =  prj.GetItemProp( i );
			g_pPlayer->GetTransyItem( pItemProp, TRUE, scanner.Token );
		}
		szMsg.Format( "Finish : Finish %s", scanner.Token );
		g_WndMng.PutString( szMsg );
	}
	else
	{
		g_WndMng.PutString( "Error : Ex) /TransyItemList Transy.txt&" );
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_LoadToolTipColor( CScanner& scanner )
{
#ifdef __CLIENT
	return g_Option.LoadToolTip( "ToolTip.ini" );
#else
	return TRUE;
#endif // __CLIENT
}

#endif //_DEBUG


BOOL TextCmd_ReloadConstant( CScanner& scanner )
{
#ifdef __THA_0808
	if( ::GetLanguage() == LANG_THA )
		return TRUE;
#endif	// __THA_0808
#ifdef __WORLDSERVER
	g_DPCoreClient.SendLoadConstant();
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatRequest( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	DWORD dwPenya = scanner.GetNumber();	
	g_GuildCombatMng.GuildCombatRequest( pUser, dwPenya );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatCancel( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	g_GuildCombatMng.GuildCombatCancel( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatOpen( CScanner& scanner )
{
#ifdef __CLIENT
#endif // __CLINET
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( g_GuildCombatMng.m_nState != CGuildCombat::CLOSE_STATE )
	{
		char chMessage[128] = {0,};
		sprintf( chMessage, "Not GuildCombat Open :: Not CLOSE_STATE" );
		pUser->AddText( chMessage );
		return TRUE;
	}

	g_GuildCombatMng.GuildCombatOpen();
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatIn( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	g_GuildCombatMng.GuildCombatEnter( pUser );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatClose( CScanner& scanner )
{
#ifdef __WORLDSERVER
	int	nClose       = scanner.GetNumber();

	CUser* pUser	= (CUser*)scanner.dwValue;
	if( g_GuildCombatMng.m_nState == CGuildCombat::CLOSE_STATE )
	{
		char chMessage[128] = {0,};
		sprintf( chMessage, "Not GuildCombat Close :: Is CLOSE_STATE" );
		pUser->AddText( chMessage );
		return TRUE;
	}

	if( nClose == 0 )
		g_GuildCombatMng.SetGuildCombatClose( TRUE );
	else
		g_GuildCombatMng.SetGuildCombatCloseWait( TRUE );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_GuildCombatNext( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( g_GuildCombatMng.m_nState == CGuildCombat::CLOSE_STATE )
	{
		char chMessage[128] = {0,};
		sprintf( chMessage, "Not GuildCombat Close :: Is CLOSE_STATE" );
		pUser->AddText( chMessage );
		return TRUE;
	}
	
	g_GuildCombatMng.m_dwTime = GetTickCount();
#endif // __WORLDSERVER
	return TRUE;
}

#ifdef __GW_BUFF
// GM: pull the arena to the battlefield, hold a prep window, then start combat.  /GWFight [seconds]
BOOL TextCmd_GWFight( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( g_GuildCombatMng.m_nState == CGuildCombat::CLOSE_STATE )
	{
		pUser->AddText( "Guild War is not running - use /GCOpen first." );
		return TRUE;
	}
	int nWait = scanner.GetNumber();
	if( nWait <= 0 )
		nWait = 30;					// default prep window (seconds)
	int nWarMin = scanner.GetNumber();
	if( nWarMin <= 0 )
		nWarMin = 30;				// default war length (minutes) - matches GuildCombat.txt
	g_GuildCombatMng.m_dwGWWarMs = (DWORD)( nWarMin * 60000 );

	g_GuildCombatMng.m_nState       = CGuildCombat::WAR_STATE;
	g_GuildCombatMng.m_nGCState     = CGuildCombat::MAINTENANCE_STATE;	// grace: PvP blocked until the timer fires
	g_GuildCombatMng.m_nStopWar     = 0;
	g_GuildCombatMng.m_dwTime       = GetTickCount() + 3600000;	// freeze the GuildCombatProcess script
	g_UserMng.AddGuildCombatState();

	g_GuildCombatMng.GWPullToBattle();		// select + SetMaintenance -> battlefield teleport + sync
	g_GuildCombatMng.SetGuildCombatStart();	// flag any real select members state 1
	int nFlagged = g_GuildCombatMng.GWFlagArena();	// flag every alive lineup player in the arena (watchers stay out of PvP)

	g_GuildCombatMng.m_dwGWFightArm = GetTickCount() + nWait * 1000;	// GWForceWar() fires from Process() after nWait
	g_UserMng.AddGuildCombatNextTimeWorld( (DWORD)( nWait * 1000 ), CGuildCombat::WAR_WAR_STATE );	// ticking prep clock
	char szMsg[128];
	sprintf( szMsg, "Get to your positions - combat starts in %d seconds!", nWait );
	g_UserMng.AddWorldMsg( WI_WORLD_GUILDWAR, szMsg );

	char szDbg[160];
	sprintf( szDbg, "GWFight: gcstate=%d flagged=%d wait=%d warMin=%d you=%d guild=%u",
		g_GuildCombatMng.m_nGCState, nFlagged, nWait, nWarMin, pUser->m_nGuildCombatState, pUser->m_idGuild );
	pUser->AddText( szDbg );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __GW_BUFF

#if __VER >= 10 // __REMOVE_ATTRIBUTE
BOOL TextCmd_RemoveAttribute( CScanner& scanner )
{
#ifdef __CLIENT
	if( g_WndMng.m_pWndUpgradeBase == NULL )
	{
		SAFE_DELETE( g_WndMng.m_pWndUpgradeBase );
		g_WndMng.m_pWndUpgradeBase = new CWndUpgradeBase;
		g_WndMng.m_pWndUpgradeBase->Initialize( &g_WndMng, APP_TEST );
		return FALSE;
	}
	
	if( g_WndMng.m_pWndUpgradeBase )
	{
		if( g_WndMng.m_pWndUpgradeBase->m_pItemElem[0] )
		{
			DWORD dwObjId = g_WndMng.m_pWndUpgradeBase->m_pItemElem[0]->m_dwObjId;
			g_DPlay.SendRemoveAttribute( dwObjId );
		}
		else
		{
			return FALSE;
		}
	}
	else
	{
		return FALSE;
	}
#endif // __CLIENT
	return TRUE;	
}
#endif // __REMOVE_ATTRIBUTE

#if __VER >= 11 // __GUILD_COMBAT_1TO1
BOOL	TextCmd_GC1to1Open( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( g_GuildCombat1to1Mng.m_nState != g_GuildCombat1to1Mng.GC1TO1_OPEN )
	{
		BOOL bSrvrDown = FALSE;
		if( scanner.GetNumber() == 1 )
			bSrvrDown = TRUE;
		g_GuildCombat1to1Mng.GuildCombat1to1Open( bSrvrDown );
		return TRUE;
	}

	pUser->AddText( "already OPEN State!!!" );
#endif //__WORLDSERVER
	return TRUE;
}

BOOL	TextCmd_GC1to1Close( CScanner& scanner )
{
#ifdef __WORLDSERVER
	g_GuildCombat1to1Mng.m_nState = g_GuildCombat1to1Mng.GC1TO1_WAR;
	for( DWORD i=0; i<g_GuildCombat1to1Mng.m_vecGuilCombat1to1.size(); i++ )
	{
		if( g_GuildCombat1to1Mng.m_vecGuilCombat1to1[i].m_nState != CGuildCombat1to1::GC1TO1WAR_CLOSEWAIT )
			g_GuildCombat1to1Mng.m_vecGuilCombat1to1[i].GuildCombat1to1CloseWait();
		g_GuildCombat1to1Mng.m_vecGuilCombat1to1[i].m_nWaitTime = -1;
	}
#endif // __WORLDSERVER
	return TRUE;
}

BOOL	TextCmd_GC1to1Next( CScanner& scanner )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)scanner.dwValue;
	if( g_GuildCombat1to1Mng.m_nState == g_GuildCombat1to1Mng.GC1TO1_CLOSE ) // GC1TO1_CLOSE
	{
		pUser->AddText( "Is CLOSE State!!!" );
		return TRUE;
	}
	if( g_GuildCombat1to1Mng.m_nState == g_GuildCombat1to1Mng.GC1TO1_WAR )
	{
		for( DWORD i=0; i<g_GuildCombat1to1Mng.m_vecGuilCombat1to1.size(); i++ )
			g_GuildCombat1to1Mng.m_vecGuilCombat1to1[i].m_nWaitTime = -1;
		return TRUE;
	}

	g_GuildCombat1to1Mng.m_nWaitTime = -1;
#endif // __WORLDERVER
	return TRUE;
}
#endif // __GUILD_COMBAT_1TO1

#ifdef __EVENTLUA_COUPON
BOOL TextCmd_Coupon( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->m_nCoupon = s.GetNumber();
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __EVENTLUA_COUPON

#ifdef __NPC_BUFF
BOOL TextCmd_RemoveAllBuff( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	pUser->RemoveAllBuff();
	pUser->ClearAllSMMode();
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __NPC_BUFF


#ifdef __BATTLEPASS
// /ResetBattlePass (/rrbp) - ADMINISTRATOR. Backdates this character's season so the
// pass counts as expired. The next login re-grants the current season's free track
// from scratch (CDPDatabaseClient::OnJoin), which is how a straggler left on an old
// season is unstuck. Also the only way to re-test the purchase flow on one character.
BOOL TextCmd_ResetBattlePass( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	pUser->m_nBPLevel    = 0;
	pUser->m_nBPPoints   = 0;
	pUser->m_nBPType     = 0;
	pUser->m_nBPEnable   = 0;
	pUser->m_szBPEndTime = 0;

	g_UserMng.AddBPUpdate( pUser );
	pUser->AddText( "Battle Pass reset. Log out and back in to rejoin the current season." );

	if( pUser->GetWorld() )
		g_dpDBClient.SavePlayer( pUser, pUser->GetWorld()->GetID(), pUser->GetPos(), pUser->GetLayer() );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __BATTLEPASS
#if __VER >= 12 // __HEAVEN_TOWER
BOOL TextCmd_HeavenTower( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndHeavenTower)
		SAFE_DELETE(g_WndMng.m_pWndHeavenTower);

	g_WndMng.m_pWndHeavenTower = new CWndHeavenTower;

	if(g_WndMng.m_pWndHeavenTower)
		g_WndMng.m_pWndHeavenTower->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}
#endif //__HEAVEN_TOWER

#if __VER >= 12 // __CSC_VER12_4
BOOL TextCmd_RemoveJewel( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndRemoveJewel)
		SAFE_DELETE(g_WndMng.m_pWndRemoveJewel);
	if(g_WndMng.m_pWndSmeltJewel)		// same layout + window id as Remove Jewel: one at a time
		g_WndMng.m_pWndSmeltJewel->Destroy();

	g_WndMng.m_pWndRemoveJewel = new CWndRemoveJewel;

	if(g_WndMng.m_pWndRemoveJewel)
		g_WndMng.m_pWndRemoveJewel->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}
#endif //__CSC_VER12_4

#if __VER >= 12 // __CSC_VER12_5
BOOL TextCmd_TransEggs( CScanner& s )
{
#ifdef __CLIENT
	g_WndMng.CreateApplet( APP_INVENTORY );

	if(g_WndMng.m_pWndPetTransEggs)
		SAFE_DELETE(g_WndMng.m_pWndPetTransEggs);
	
	g_WndMng.m_pWndPetTransEggs = new CWndPetTransEggs;

	if(g_WndMng.m_pWndPetTransEggs)
		g_WndMng.m_pWndPetTransEggs->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}
#endif //__CSC_VER12_5

#if __VER >= 12 // __SECRET_ROOM
BOOL TextCmd_SecretRoomOpen( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	if( CSecretRoomMng::GetInstance()->m_nState == SRMNG_CLOSE )
		CSecretRoomMng::GetInstance()->SecretRoomOpen();
	else
		pUser->AddText( "Is Not Close State!!!" );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_SecretRoomEntrance( CScanner& s )
{
#ifdef __CLIENT
	if( s.GetNumber() == 1 )
	{
		g_DPlay.SendTeleportToSecretRoomDungeon();
		return TRUE;
	}

	CWndWorld* pWndWorld = (CWndWorld*)g_WndMng.GetWndBase( APP_WORLD );
	if(pWndWorld)
	{
		for(int i=0; i<MAX_KILLCOUNT_CIPHERS; i++)
		{
			pWndWorld->m_stKillCountCiphers[i].bDrawMyGuildKillCount = TRUE;
			pWndWorld->m_stKillCountCiphers[i].szMyGuildKillCount = '0';
			pWndWorld->m_stKillCountCiphers[i].ptPos = CPoint(0,0);
			pWndWorld->m_stKillCountCiphers[i].fScaleX = 1.0f;
			pWndWorld->m_stKillCountCiphers[i].fScaleY = 1.0f;
			pWndWorld->m_stKillCountCiphers[i].nAlpha = 255;

//			pWndWorld->m_bDrawMyGuildKillCount[i] = TRUE;
//			pWndWorld->m_szMyGuildKillCount[i] = '0';
		}
	}
	
	if(g_WndMng.m_pWndSecretRoomMsg)
		SAFE_DELETE( g_WndMng.m_pWndSecretRoomMsg );

	g_DPlay.SendSecretRoomEntrance();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SecretRoomNext( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CSecretRoomMng::GetInstance()->m_dwRemainTime = 0;
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_SecretRoomTender( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendSecretRoomTenderOpenWnd();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SecretRoomLineUp( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendSecretRoomLineUpOpenWnd();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SecretRoomClose( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	
	if( CSecretRoomMng::GetInstance()->m_nState == SRMNG_WAR )
	{
		map<BYTE, CSecretRoomContinent*>::iterator it = CSecretRoomMng::GetInstance()->m_mapSecretRoomContinent.begin();
		for( ; it!=CSecretRoomMng::GetInstance()->m_mapSecretRoomContinent.end(); it++ )
		{
			CSecretRoomContinent* pSRCont = it->second;
			if( pSRCont && pSRCont->m_nState != SRCONT_CLOSE )
				pSRCont->m_dwRemainTime = 0;
				//pSRCont->SetContCloseWait();
		}
	}
	else	
		pUser->AddText( "Is Not War State!!!" );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_SecretRoomTenderView( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendSecretRoomTenderView();

	SAFE_DELETE(g_WndMng.m_pWndSecretRoomCheckTaxRate);
	g_WndMng.m_pWndSecretRoomCheckTaxRate = new CWndSecretRoomCheckTaxRate;

	if(g_WndMng.m_pWndSecretRoomCheckTaxRate)
	{
		g_WndMng.m_pWndSecretRoomCheckTaxRate->Initialize(NULL);
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SecretRoomTenderCancelReturn( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendSecretRoomTenderCancelReturn();
#endif // __CLIENT
	return TRUE;
}
#endif // __SECRET_ROOM

#if __VER >= 12 // __LORD
BOOL TextCmd_ElectionRequirement( CScanner& s )
{
#ifdef __CLIENT
	IElection* pElection	= CCLord::Instance()->GetElection();
	char lpString[100]		= { 0,};
	sprintf( lpString, "election state : total(%d)/requirement(%d)", pElection->GetVote(), pElection->GetRequirement() );
	g_WndMng.PutString( lpString );
#endif	// __CLIENT
	return TRUE;
}

//#ifdef __INTERNALSERVER
BOOL TextCmd_RemoveTotalGold( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	__int64 iGold	= static_cast<__int64>( s.GetInt64() );
	if( iGold > pUser->GetTotalGold() )
	{
		char szText[100]	= { 0,};
		sprintf( szText, "TextCmd_RemoveTotalGold: %I64d", pUser->GetTotalGold() );
		pUser->AddText( szText );
	}
	else
		pUser->RemoveTotalGold( iGold );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ElectionAddDeposit( CScanner& s )
{
#ifdef __CLIENT
	__int64 iDeposit	= static_cast<__int64>( s.GetNumber() );
	g_DPlay.SendElectionAddDeposit( iDeposit );
#endif	// __CLIENT
	return TRUE;
}
BOOL TextCmd_ElectionSetPledge( CScanner& s )
{
#ifdef __CLIENT
	char szPledge[CCandidate::nMaxPledgeLen]	= { 0,};
	
	s.GetLastFull();
	if( lstrlen( s.token ) >= CCandidate::nMaxPledgeLen )
		return TRUE;
	lstrcpy( szPledge, s.token );
	StringTrimRight( szPledge );
//	RemoveCRLF( szPledge );
	g_DPlay.SendElectionSetPledge( szPledge );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_ElectionIncVote( CScanner& s )
{
#ifdef __CLIENT
	s.GetToken();
	u_long idPlayer		= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
	if( idPlayer > 0 )
		g_DPlay.SendElectionIncVote( idPlayer );
	else
		g_WndMng.PutString( prj.GetText( TID_GAME_ELECTION_INC_VOTE_E001 ) );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_ElectionProcess( CScanner& s )
{
#ifdef __WORLDSERVER
	BOOL bRun	= static_cast<BOOL>( s.GetNumber() );
	g_dpDBClient.SendElectionProcess( bRun );
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ElectionBeginCandidacy( CScanner& s )
{
#ifdef __WORLDSERVER
	g_dpDBClient.SendElectionBeginCandidacy();
#endif	// __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_ElectionBeginVote( CScanner& s )
{
#ifdef __WORLDSERVER
	g_dpDBClient.SendElectionBeginVote();
#endif	// __WORLDSERVER
	return TRUE;
}
BOOL TextCmd_ElectionEndVote( CScanner& s )
{
#ifdef __WORLDSERVER
	g_dpDBClient.SendElectionBeginEndVote();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_ElectionState( CScanner& s )
{
#ifdef __CLIENT
	CCElection* pElection	= static_cast<CCElection*>( CCLord::Instance()->GetElection() );
	pElection->State();
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_LEventCreate( CScanner & s )
{
#ifdef __CLIENT
	int iEEvent		= s.GetNumber();
	int iIEvent		= s.GetNumber();
	g_DPlay.SendLEventCreate( iEEvent, iIEvent );
#endif	// __CLIENT
	return TRUE;
}

BOOL TextCmd_LEventInitialize( CScanner & s )
{
#ifdef __WORLDSERVER
	g_dpDBClient.SendLEventInitialize();
#endif	// __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_LSkill( CScanner & s )
{
#ifdef __CLIENT
	int nSkill	= s.GetNumber();
	s.GetToken();
	char szTarget[MAX_PLAYER]	= { 0,};
	strncpy( szTarget, s.token, MAX_PLAYER );
	szTarget[MAX_PLAYER-1]	= '\0';
	g_DPlay.SendLordSkillUse( nSkill, szTarget );
#endif	// __CLIENT
	return TRUE;
}
//#endif	// __INTERNALSERVER
#endif	// __LORD

#if __VER >= 12 // __MOD_TUTORIAL
BOOL TextCmd_SetTutorialState( CScanner & s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	int nTutorialState	= s.GetNumber();
	pUser->SetTutorialState( nTutorialState );
	pUser->AddSetTutorialState();
#endif	// __WORLDSERVER
	return TRUE;
}
#endif	// __MOD_TUTORIAL

#if __VER >= 12 // __TAX
BOOL TextCmd_TaxApplyNow( CScanner& s )
{
#ifdef __WORLDSERVER
	CTax::GetInstance()->SetApplyTaxRateNow();
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __TAX

BOOL TextCmd_GuildSiegePrizeNow( CScanner& s )
{
#ifdef __WORLDSERVER
	CGuildSiegePrize::GetInstance()->SetApplyPrizeNow();
#endif // __WORLDSERVER
	return TRUE;
}

#if __VER >= 13 // __HONORABLE_TITLE			// 달인
BOOL TextCmd_HonorTitleSet( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	int nIdx = -1;
	s.GetToken();
	if( s.tokenType == NUMBER ) 
	{
		nIdx	= _ttoi( s.Token );
	}
	else
	{
		nIdx	= CTitleManager::Instance()->GetIdxByName( s.Token );
	}

	if( nIdx < 0 ||  nIdx >= MAX_HONOR_TITLE )
		return FALSE;

	DWORD dwNum	= s.GetNumber();
	if( dwNum > 100000000 ) dwNum = 100000000;
	if( dwNum < 0 ) dwNum = 0;

	pUser->SetHonorCount(nIdx,dwNum);
	pUser->AddHonorListAck();
	g_dpDBClient.SendLogGetHonorTime(pUser,nIdx);
#endif // __WORLDSERVER
	return TRUE;
}

#endif	// __HONORABLE_TITLE			// 달인

#if __VER >= 13 // __RAINBOW_RACE
BOOL TextCmd_RainbowRaceApp( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendRainbowRaceApplicationOpenWnd();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRacePass( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CRainbowRace* pRainbowRace = CRainbowRaceMng::GetInstance()->GetRainbowRacerPtr( pUser->m_idPlayer );
	if( pRainbowRace )
	{
		pRainbowRace->SetNowGameComplete( pUser );
	}
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_RainbowRaceOpen( CScanner& s )
{
#ifdef __WORLDSERVER
	if( CRainbowRaceMng::GetInstance()->GetState() == CRainbowRaceMng::RR_CLOSED )
		CRainbowRaceMng::GetInstance()->SetState( CRainbowRaceMng::RR_OPEN );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_RainbowRaceNext( CScanner& s )
{
#ifdef __WORLDSERVER
	CRainbowRaceMng::GetInstance()->SetNextTime( 0 );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_RainbowRaceInfo( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndRainbowRaceInfo)
		SAFE_DELETE(g_WndMng.m_pWndRainbowRaceInfo);

	g_WndMng.m_pWndRainbowRaceInfo = new CWndRainbowRaceInfo;

	if(g_WndMng.m_pWndRainbowRaceInfo)
		g_WndMng.m_pWndRainbowRaceInfo->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceRule( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndRainbowRaceRule)
		SAFE_DELETE(g_WndMng.m_pWndRainbowRaceRule);

	g_WndMng.m_pWndRainbowRaceRule = new CWndRainbowRaceRule;

	if(g_WndMng.m_pWndRainbowRaceRule)
		g_WndMng.m_pWndRainbowRaceRule->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceRanking( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendRainbowRacePrevRankingOpenWnd();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRacePrize( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndRainbowRacePrize)
		SAFE_DELETE(g_WndMng.m_pWndRainbowRacePrize);

	g_WndMng.m_pWndRainbowRacePrize = new CWndRainbowRacePrize;

	if(g_WndMng.m_pWndRainbowRacePrize)
		g_WndMng.m_pWndRainbowRacePrize->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceKawiBawiBo( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_GAWIBAWIBO, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceDice( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_DICEPLAY, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceArithmetic( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_ARITHMATIC, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceStopWatch( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_STOPWATCH, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceTyping( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_TYPING, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceCard( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_PAIRGAME, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceLadder( CScanner& s )
{
#ifdef __CLIENT
	CRainbowRace::GetInstance()->SendMinigamePacket( RMG_LADDER, MP_OPENWND );
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_RainbowRaceReqFininsh( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendRainbowRaceReqFinish();
#endif // __CLIENT
	return TRUE;
}

#endif // __RAINBOW_RACE

#if __VER >= 13 // __EXT_ENCHANT
BOOL TextCmd_ChangeAttribute( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndChangeAttribute)
		SAFE_DELETE(g_WndMng.m_pWndChangeAttribute);

	g_WndMng.m_pWndChangeAttribute = new CWndChangeAttribute;

	if(g_WndMng.m_pWndChangeAttribute)
		g_WndMng.m_pWndChangeAttribute->Initialize(NULL);
#endif // __CLIENT
	return TRUE;
}
#endif //__EXT_ENCHANT

#if __VER >= 13 // __HOUSING
BOOL TextCmd_HousingVisitRoom( CScanner& s )
{
#ifdef __CLIENT
	s.GetToken();
	if( s.Token == "" )	// 아무 값 없으면 내방으로...
		g_DPlay.SendHousingVisitRoom( g_pPlayer->m_idPlayer );
	else	// 캐릭터명이 있으면 해당 캐릭터의 방으로...
	{
		DWORD dwPlayerId = CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );
		if( dwPlayerId )
			g_DPlay.SendHousingVisitRoom( dwPlayerId );
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_HousingGMRemoveAll( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	CHousingMng::GetInstance()->ReqGMFunrnitureListAll( pUser );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __HOUSING
/*
#if __VER >= 14 // __SMELT_SAFETY
BOOL TextCmd_SmeltSafetyNormal( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndSmeltSafety)
		SAFE_DELETE(g_WndMng.m_pWndSmeltSafety);

	g_WndMng.m_pWndSmeltSafety = new CWndSmeltSafety(CWndSmeltSafety::WND_NORMAL);
	if(g_WndMng.m_pWndSmeltSafety)
	{
		g_WndMng.m_pWndSmeltSafety->Initialize(NULL);
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SmeltSafetyAccessary( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndSmeltSafety)
		SAFE_DELETE(g_WndMng.m_pWndSmeltSafety);

	g_WndMng.m_pWndSmeltSafety = new CWndSmeltSafety(CWndSmeltSafety::WND_ACCESSARY);
	if(g_WndMng.m_pWndSmeltSafety)
	{
		g_WndMng.m_pWndSmeltSafety->Initialize(NULL);
	}
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_SmeltSafetyPiercing( CScanner& s )
{
#ifdef __CLIENT
	if(g_WndMng.m_pWndSmeltSafety)
		SAFE_DELETE(g_WndMng.m_pWndSmeltSafety);

	g_WndMng.m_pWndSmeltSafety = new CWndSmeltSafety(CWndSmeltSafety::WND_PIERCING);
	if(g_WndMng.m_pWndSmeltSafety)
	{
		g_WndMng.m_pWndSmeltSafety->Initialize(NULL);
	}
#endif // __CLIENT
	return TRUE;
}

#endif //__SMELT_SAFETY
*/
#if __VER >= 15 // __15_5TH_ELEMENTAL_SMELT_SAFETY
BOOL TextCmd_SmeltSafetyElement( CScanner& s )
{
#ifdef __CLIENT
	if( g_WndMng.m_pWndSmeltSafety )
		SAFE_DELETE( g_WndMng.m_pWndSmeltSafety );

	g_WndMng.m_pWndSmeltSafety = new CWndSmeltSafety( CWndSmeltSafety::WND_ELEMENT );
	if( g_WndMng.m_pWndSmeltSafety )
		g_WndMng.m_pWndSmeltSafety->Initialize( NULL );
#endif // __CLIENT
	return TRUE;
}
#endif // __15_5TH_ELEMENTAL_SMELT_SAFETY

#ifdef __QUIZ
BOOL TextCmd_QuizEventOpen( CScanner& s )
{
#ifdef __WORLDSERVER
	if( !CQuiz::GetInstance()->IsRun() )
		g_dpDBClient.SendQuizEventOpen( CQuiz::GetInstance()->GetType() );
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_QuizEventEnterance( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendQuizEventEntrance();
#endif // __CLIENT
	return TRUE;
}

BOOL TextCmd_QuizStateNext( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser	= (CUser*)s.dwValue;
	if( CQuiz::GetInstance()->IsRun() )
	{
		if( IsValidObj( pUser ) && pUser->GetWorld() && pUser->GetWorld()->GetID() == WI_WORLD_QUIZ )
		{
			CQuiz::GetInstance()->SetNextTime( 0 );
			CQuiz::GetInstance()->Process();
		}
	}
#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_QuizEventClose( CScanner& s )
{
#ifdef __WORLDSERVER
	if( CQuiz::GetInstance()->IsRun() )
		CQuiz::GetInstance()->CloseQuizEvent();
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __QUIZ

#if __VER >= 15 // __GUILD_HOUSE
BOOL TextCmd_BuyGuildHouse( CScanner& s )
{
#ifdef __CLIENT
	g_DPlay.SendBuyGuildHouse();
#endif // __CLIENT
	return TRUE;
}

#ifdef __CLIENT
#include "WndGuildHouse.h"
#endif // __CLIENT
BOOL TextCmd_GuildHouseUpkeep( CScanner & s )
{
#ifdef __CLIENT
	if( !g_WndMng.m_pWndUpkeep )
	{
		g_WndMng.m_pWndUpkeep = new CWndGHUpkeep;
		g_WndMng.m_pWndUpkeep->Initialize( &g_WndMng, APP_CONFIRM_BUY_ );
	}
	else
	{
		g_WndMng.m_pWndUpkeep->Destroy( );
		g_WndMng.m_pWndUpkeep = NULL;
	}
#endif // __CLIENT
	return TRUE;
}
#endif // __GUILD_HOUSE

#if __VER >= 15 // __CAMPUS
BOOL TextCmd_CampusInvite( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pRequest = (CUser*)s.dwValue;
	if( !IsValidObj( pRequest ) )
		return FALSE;

	s.GetToken();
	u_long idTarget	= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );

	if( 0 < idTarget )
	{
		CUser* pTarget	= g_UserMng.GetUserByPlayerID( idTarget );	
		if( IsValidObj( pTarget ) )
		{
			CCampusHelper::GetInstance()->OnInviteCampusMember( pRequest, pTarget );
			PlayerData* pPlayerData	= CPlayerDataCenter::GetInstance()->GetPlayerData( idTarget );
			if( pPlayerData )
				pRequest->AddQueryPlayerData( idTarget, pPlayerData );
		}

		else
			pRequest->AddDefinedText( TID_DIAG_0061, "\"%s\"", s.Token );
	}
	else
		pRequest->AddDefinedText( TID_DIAG_0060, "\"%s\"", s.Token );
#endif // __WORLDSERVER

	return TRUE;
}

BOOL TextCmd_RemoveCampusMember( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pRequest = (CUser*)s.dwValue;
	if( !IsValidObj( pRequest ) )
		return FALSE;

	s.GetToken();
	u_long idTarget	= CPlayerDataCenter::GetInstance()->GetPlayerId( s.token );

	if( idTarget > 0 )
		CCampusHelper::GetInstance()->OnRemoveCampusMember( pRequest, idTarget );
		
	else
		pRequest->AddDefinedText( TID_DIAG_0060, "\"%s\"", s.Token );

#endif // __WORLDSERVER
	return TRUE;
}

BOOL TextCmd_UpdateCampusPoint( CScanner& s )
{
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)s.dwValue;
	if( !IsValidObj( pUser ) )
		return FALSE;

	int nCampusPoint = 0;
	nCampusPoint = s.GetNumber();

	if( IsValidObj( pUser ) )
		g_dpDBClient.SendUpdateCampusPoint( pUser->m_idPlayer, nCampusPoint, TRUE, 'G' );
#endif // __WORLDSERVER
	return TRUE;
}
#endif // __CAMPUS

BOOL TextCmd_InvenRemove( CScanner& scanner )       
{ 
#ifdef __WORLDSERVER
	CUser* pUser = (CUser*)scanner.dwValue;
	if( IsValidObj( pUser ) )
	{
		int nSize = pUser->m_Inventory.GetMax();
		for( int i = 0 ; i < nSize; ++i )
		{
			CItemElem* pItemElem = pUser->m_Inventory.GetAtId( i );
			if( IsUsableItem( pItemElem ) && !pUser->m_Inventory.IsEquip( pItemElem->m_dwObjId ) && !pItemElem->IsPet() && !pItemElem->IsEatPet() )
				pUser->UpdateItem( i, UI_NUM, 0 );
		}
	}
#endif	// __WORLDSERVER
	return TRUE;
}


BEGINE_TEXTCMDFUNC_MAP
////////////////////////////////////////////////// AUTH_GENERAL begin/////////////////////////////////////////////////////
	ON_TEXTCMDFUNC( TextCmd_whisper,               "whisper",           "w",              "귓속말",         "귓",      TCM_SERVER, AUTH_GENERAL      , "귓속말 [/명령 아이디 내용]" )
	ON_TEXTCMDFUNC( TextCmd_say,                   "say",               "say",            "말",             "말",      TCM_SERVER, AUTH_GENERAL      , "속삭임 [/명령 아이디 내용]" )
	ON_TEXTCMDFUNC( TextCmd_Position,              "position",          "pos",            "좌표",           "좌표",    TCM_CLIENT, AUTH_GENERAL      , "현재 좌표를 출력해준다." )
	ON_TEXTCMDFUNC( TextCmd_shout,                 "shout",             "s",              "외치기",         "외",      TCM_BOTH  , AUTH_GENERAL      , "외치기 [/명령 아이디 내용]" )
	ON_TEXTCMDFUNC( TextCmd_PartyChat,             "partychat",         "p",              "극단말",         "극",      TCM_BOTH  , AUTH_GENERAL      , "파티 채팅 [/명령 내용]" )
#ifdef __CRASH_REPORT
	ON_TEXTCMDFUNC( TextCmd_CrashTest,             "crashtest",         "ctest",          "crashtest2",     "ctest2",  TCM_CLIENT, AUTH_ADMINISTRATOR , "crash this client on purpose to test CrashRpt" )
#endif // __CRASH_REPORT
	ON_TEXTCMDFUNC( TextCmd_Time,                  "Time",              "ti",             "시간",           "시",      TCM_CLIENT, AUTH_GENERAL      , "시간 보기 [/시간]" )
#ifdef __GM_LIST
	ON_TEXTCMDFUNC( TextCmd_GMList,                "gmlist",            "gml",           "gmlist2",       "gml2",   TCM_BOTH, AUTH_GENERAL      , "list online GMs [/gmlist]" )
#endif // __GM_LIST
#ifdef __FREE_PK_TIME
	ON_TEXTCMDFUNC( TextCmd_FreePKStart,           "freepkstart",       "fpks",          "freepkstart2",  "fpks2",  TCM_SERVER, AUTH_ADMINISTRATOR, "open a Free PK Time window now [/freepkstart]" )
	ON_TEXTCMDFUNC( TextCmd_FreePKStop,            "freepkstop",        "fpkst",         "freepkstop2",   "fpkst2", TCM_SERVER, AUTH_ADMINISTRATOR, "end the running Free PK Time window [/freepkstop]" )
#endif // __FREE_PK_TIME
#ifdef __FL_FFA
	ON_TEXTCMDFUNC( TextCmd_FFAStart,              "ffastart",          "ffas",          "ffastart2",     "ffas2",  TCM_SERVER, AUTH_ADMINISTRATOR, "announce an FFA now [/ffastart minutes]" )
	ON_TEXTCMDFUNC( TextCmd_FFARefund,             "ffarefund",         "ffarf",         "ffarefund2",    "ffarf2", TCM_SERVER, AUTH_ADMINISTRATOR, "cancel the FFA, refund, all to town [/ffarefund]" )
	ON_TEXTCMDFUNC( TextCmd_FFASkip,               "ffaskip",           "ffask",         "ffaskip2",      "ffask2", TCM_SERVER, AUTH_ADMINISTRATOR, "FFA: next phase now [/ffaskip]" )
	ON_TEXTCMDFUNC( TextCmd_FFAEnd,                "ffaend",            "ffae",          "ffaend2",       "ffae2",  TCM_SERVER, AUTH_ADMINISTRATOR, "FFA: end the battle now with rewards [/ffaend]" )
	ON_TEXTCMDFUNC( TextCmd_FFANext,               "ffanext",           "ffan",          "ffanext2",      "ffan2",  TCM_SERVER, AUTH_ADMINISTRATOR, "next scheduled FFA [/ffanext]" )
	ON_TEXTCMDFUNC( TextCmd_FFAInfo,               "ffainfo",           "ffai",          "ffainfo2",      "ffai2",  TCM_SERVER, AUTH_ADMINISTRATOR, "FFA state + players [/ffainfo]" )
	ON_TEXTCMDFUNC( TextCmd_FFAReload,             "ffareload",         "ffar",          "ffareload2",    "ffar2",  TCM_SERVER, AUTH_ADMINISTRATOR, "reload FFAManager.inc [/ffareload]" )
#endif // __FL_FFA
#ifdef __FL_EQUALIZED_MODE
	ON_TEXTCMDFUNC( TextCmd_EqSavePreset,          "savetmp",           "savetmp",       "savetmp2",      "stmp2",  TCM_SERVER, AUTH_ADMINISTRATOR, "Equalized PvP: your bag = the preset of this event/gender/class [/savetmp]" )
	ON_TEXTCMDFUNC( TextCmd_EqCopyPresets,         "copytmp",           "copytmp",       "copytmp2",      "ctmp2",  TCM_SERVER, AUTH_ADMINISTRATOR, "Equalized PvP: copy all presets [/copytmp FFA TDM]" )
	ON_TEXTCMDFUNC( TextCmd_EqReload,              "eqreload",          "eqr",           "eqreload2",     "eqr2",   TCM_SERVER, AUTH_ADMINISTRATOR, "reload EqualizedPvP.inc [/eqreload]" )
#endif // __FL_EQUALIZED_MODE
#ifdef __FL_TDM
	ON_TEXTCMDFUNC( TextCmd_TDMStart,              "tdmstart",          "tdms",          "tdmstart2",     "tdms2",  TCM_SERVER, AUTH_ADMINISTRATOR, "announce an TDM now [/tdmstart minutes]" )
	ON_TEXTCMDFUNC( TextCmd_TDMRefund,             "tdmrefund",         "tdmrf",         "tdmrefund2",    "tdmrf2", TCM_SERVER, AUTH_ADMINISTRATOR, "cancel the TDM, refund, all to town [/tdmrefund]" )
	ON_TEXTCMDFUNC( TextCmd_TDMSkip,               "tdmskip",           "tdmsk",         "tdmskip2",      "tdmsk2", TCM_SERVER, AUTH_ADMINISTRATOR, "TDM: next phase now [/tdmskip]" )
	ON_TEXTCMDFUNC( TextCmd_TDMEnd,                "tdmend",            "tdme",          "tdmend2",       "tdme2",  TCM_SERVER, AUTH_ADMINISTRATOR, "TDM: end the battle now with rewards [/tdmend]" )
	ON_TEXTCMDFUNC( TextCmd_TDMNext,               "tdmnext",           "tdmn",          "tdmnext2",      "tdmn2",  TCM_SERVER, AUTH_ADMINISTRATOR, "next scheduled TDM [/tdmnext]" )
	ON_TEXTCMDFUNC( TextCmd_TDMInfo,               "tdminfo",           "tdmi",          "tdminfo2",      "tdmi2",  TCM_SERVER, AUTH_ADMINISTRATOR, "TDM state + players [/tdminfo]" )
	ON_TEXTCMDFUNC( TextCmd_TDMReload,             "tdmreload",         "tdmr",          "tdmreload2",    "tdmr2",  TCM_SERVER, AUTH_ADMINISTRATOR, "reload TDMManager.inc [/tdmreload]" )
#endif // __FL_TDM
//	ON_TEXTCMDFUNC( TextCmd_ChangeFace,            "ChangeFace",        "cf",             "얼굴변경",       "얼변",    TCM_BOTH  , AUTH_GENERAL      , "얼굴 변경" )
	ON_TEXTCMDFUNC( TextCmd_GuildChat,             "GuildChat",         "g",              "길드말",         "길말",    TCM_BOTH, AUTH_GENERAL      , "길드말" )
	ON_TEXTCMDFUNC( TextCmd_PartyInvite,           "PartyInvite",       "partyinvite",    "극단초청",       "극초",    TCM_SERVER, AUTH_GENERAL      , "극단 초청" )
	ON_TEXTCMDFUNC( TextCmd_GuildInvite,           "GuildInvite",       "guildinvite",    "길드초청",       "길초",    TCM_SERVER, AUTH_GENERAL      , "길드 초청" )
#if __VER >= 15 // __CAMPUS
	ON_TEXTCMDFUNC( TextCmd_CampusInvite,          "CampusInvite",		"campusinvite",   "사제초청",		"사초",    TCM_SERVER, AUTH_GENERAL      , "사제 초청" )
#endif // __CAMPUS
#ifdef __CLIENT
	ON_TEXTCMDFUNC( TextCmd_tradeagree,            "tradeagree",        "ta",             "거래승인",       "거승",    TCM_CLIENT, AUTH_GENERAL      , "거래 승인 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_traderefuse,           "traderefuse",       "tr",             "거래거절",       "거절",    TCM_CLIENT, AUTH_GENERAL      , "거래 거절 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_whisperagree,          "whisperagree",      "wa",             "귓속말승인",     "귓승",    TCM_CLIENT, AUTH_GENERAL      , "귓속말 승인 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_whisperrefuse,         "whisperrefuse",     "wr",             "귓속말거절",     "귓절",    TCM_CLIENT, AUTH_GENERAL      , "귓속말 거절 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_messengeragree,        "messengeragree",    "ma",             "메신저승인",     "메승",    TCM_CLIENT, AUTH_GENERAL      , "메신저 승인 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_messengerrefuse,       "messengerrefuse",   "mr",             "메신저거절",     "메절",    TCM_CLIENT, AUTH_GENERAL      , "메신저 거절 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_stageagree,            "stageagree",        "ga",             "극단승인",       "극승",    TCM_CLIENT, AUTH_GENERAL      , "극단 승인 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_stagerefuse,           "stagerefuse",       "gr",             "극단거절",       "극절",    TCM_CLIENT, AUTH_GENERAL      , "극단 거절 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_connectagree,          "connectagree",      "ca",             "접속알림",       "접알",    TCM_CLIENT, AUTH_GENERAL      , "접속알림 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_connectrefuse,         "connectrefuse",     "cr",             "접속알림해제",   "접해",    TCM_CLIENT, AUTH_GENERAL      , "접속알림 해제 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_shoutagree,            "shoutagree",        "ha",             "외치기승인",     "외승",    TCM_CLIENT, AUTH_GENERAL      , "외치기 승인 [/명령] " )
	ON_TEXTCMDFUNC( TextCmd_shoutrefuse,           "shoutrefuse",       "hr",             "외치기해제",     "외해",    TCM_CLIENT, AUTH_GENERAL      , "외치기 거절 [/명령] " )
#ifdef __YS_CHATTING_BLOCKING_SYSTEM
	ON_TEXTCMDFUNC( TextCmd_BlockUser,             "ignore",             "ig",             "채팅차단",       "채차",    TCM_CLIENT, AUTH_GENERAL      , "채팅차단 [/명령 아이디]" )
	ON_TEXTCMDFUNC( TextCmd_CancelBlockedUser,     "unignore",           "uig",            "채팅차단해제",   "채차해",  TCM_CLIENT, AUTH_GENERAL      , "채팅차단해제 [/명령 아이디]" )
	ON_TEXTCMDFUNC( TextCmd_IgnoreList,            "ignorelist",         "igl",            "채팅차단목록",   "채차목",  TCM_CLIENT, AUTH_GENERAL      , "채팅 차단 목록" )
#endif // __YS_CHATTING_BLOCKING_SYSTEM
#endif //__CLIENT
////////////////////////////////////////////////// AUTH_GENERAL end/////////////////////////////////////////////////////
	// GM_LEVEL_1
	ON_TEXTCMDFUNC( TextCmd_Teleport,              "teleport",          "te",             "텔레포트",       "텔레",    TCM_SERVER, AUTH_GAMEMASTER   , "텔레포트" )
	ON_TEXTCMDFUNC( TextCmd_Invisible,             "invisible",         "inv",            "투명",           "투명",    TCM_SERVER, AUTH_GAMEMASTER   , "투명화" )
	ON_TEXTCMDFUNC( TextCmd_NoInvisible,           "noinvisible",       "noinv",          "투명해제",       "투해",    TCM_SERVER, AUTH_GAMEMASTER   , "투명화 해제" )
	ON_TEXTCMDFUNC( TextCmd_Summon,                "summon",            "su",             "소환",           "소환",    TCM_SERVER, AUTH_GAMEMASTER   , "유저소환" )
	ON_TEXTCMDFUNC( TextCmd_count,                 "count",             "cnt",            "접속자수",       "접속자수",TCM_SERVER, AUTH_GAMEMASTER   , "접속자 카운트" )
	
	// GM_LEVEL_2
	ON_TEXTCMDFUNC( TextCmd_Out,                   "out",               "out",            "퇴출",           "퇴출",    TCM_SERVER, AUTH_GAMEMASTER2   , "퇴출" )
	ON_TEXTCMDFUNC( TextCmd_Talk,                  "talk",              "nota",           "말해제",         "말해",    TCM_SERVER, AUTH_GAMEMASTER2   , "말하지 못하게 하기 해제" )
	ON_TEXTCMDFUNC( TextCmd_NoTalk,                "notalk",            "ta",             "말정지",         "말정",    TCM_SERVER, AUTH_GAMEMASTER2   , "말하지 못하게 하기" )
	ON_TEXTCMDFUNC( TextCmd_ip,                    "ip",                "ip",             "아이피",         "아이피",  TCM_BOTH  , AUTH_GAMEMASTER2     , "상대 IP알기" )
#ifdef __JEFF_9_20
	ON_TEXTCMDFUNC( TextCmd_Mute,					"Mute",				"mute",          "조용히",     "조용히",    TCM_SERVER,  AUTH_GAMEMASTER2, "" )	
#endif	// __JEFF_9_20
#ifdef __GUILDRANK
	ON_TEXTCMDFUNC( TextCmd_GuildRanking,          "GuildRanking",       "ranking",        "길랭",           "길랭",    TCM_SERVER, AUTH_GAMEMASTER2   , "" )
#endif
	ON_TEXTCMDFUNC( TextCmd_FallSnow,              "FallSnow",           "fs",             "눈와라",         "눈와",    TCM_SERVER, AUTH_GAMEMASTER2   , "눈 내리기 토글" )
	ON_TEXTCMDFUNC( TextCmd_StopSnow,              "StopSnow",           "ss",             "눈그만",         "눈끝",    TCM_SERVER, AUTH_GAMEMASTER2   , "눈 내리기 못하게 토글" )
	ON_TEXTCMDFUNC( TextCmd_FallRain,              "FallRain",           "frain",          "비와라",         "비와",    TCM_SERVER, AUTH_GAMEMASTER2   , "비 내리기 토글" )
	ON_TEXTCMDFUNC( TextCmd_StopRain,              "StopRain",           "sr",             "비그만",         "비끝",    TCM_SERVER, AUTH_GAMEMASTER2   , "비 내리기 못하게 토글" )
#ifdef __WEATHER_COMMAND
	ON_TEXTCMDFUNC( TextCmd_Weather,               "weather",            "wt",             "weather2",       "wt2",   TCM_SERVER, AUTH_ADMINISTRATOR , "set the weather [/weather rain|snow [30|2h|5d] | off]" )
#endif // __WEATHER_COMMAND
	ON_TEXTCMDFUNC( TextCmd_System,                "system",             "sys",            "알림",           "알",      TCM_SERVER, AUTH_GAMEMASTER2   , "시스템 메시지" )

	// GM_LEVEL_3
	ON_TEXTCMDFUNC( TextCmd_PvpParam,              "PvpParam",           "p_Param",        "PVP설정",        "피설",    TCM_SERVER, AUTH_GAMEMASTER3, "PVP(카오)설정" )
#if __VER >= 8 // __S8_PK
	ON_TEXTCMDFUNC( TextCmd_PKParam,			   "PKParam",			 "pkparam",		   "PK설정",		 "pk설정",  TCM_SERVER, AUTH_GAMEMASTER3, "카오설정" )
#endif // __VER >= 8 // __S8_PK
	ON_TEXTCMDFUNC( TextCmd_Undying,               "undying",            "ud",             "무적",           "무",      TCM_BOTH  , AUTH_GAMEMASTER3   , "무적" )
	ON_TEXTCMDFUNC( TextCmd_Undying2,              "undying2",           "ud2",            "반무적",         "반무",    TCM_BOTH  , AUTH_GAMEMASTER3   , "반무적" )
	ON_TEXTCMDFUNC( TextCmd_NoUndying,             "noundying",          "noud",           "무적해제",       "무해",    TCM_BOTH  , AUTH_GAMEMASTER3   , "무적 해제" )
	ON_TEXTCMDFUNC( TextCmd_Onekill,               "onekill",            "ok",             "초필",           "초필",    TCM_BOTH  , AUTH_GAMEMASTER3   , "적을 한방에 죽이기" )
	ON_TEXTCMDFUNC( TextCmd_NoOnekill,             "noonekill",          "nook",           "초필해제",       "초해",    TCM_BOTH  , AUTH_GAMEMASTER3   , "적을 한방에 죽이기 해제" )
	ON_TEXTCMDFUNC( TextCmd_AroundKill,            "aroundkill",         "ak",             "원샷",           "원",      TCM_SERVER, AUTH_GAMEMASTER3   , "어라운드에 있는 몬스터 죽이기" )
	ON_TEXTCMDFUNC( TextCmd_stat,                  "stat",               "stat",           "스탯",           "스탯",    TCM_SERVER, AUTH_GAMEMASTER3   , "스탯 설정 하기" )
#ifdef __REBIRTH_SYSTEM
	ON_TEXTCMDFUNC( TextCmd_SetRebirthLevel,       "setrebirthlevel",    "srl",            "setrebirthlevel","srl",     TCM_SERVER, AUTH_ADMINISTRATOR , "GM: force own rebirth tier directly" )
#endif // __REBIRTH_SYSTEM
#ifdef __BADGE_SYSTEM
	ON_TEXTCMDFUNC( TextCmd_Badge,                 "badge",              "badge",          "badge",          "badge",   TCM_SERVER, AUTH_ADMINISTRATOR , "GM: Badge System test - /badge info|add|del|set|count|all|clear" )
#endif // __BADGE_SYSTEM
#ifdef __RECORD_BOOK
	ON_TEXTCMDFUNC( TextCmd_Record,                "record",             "record",         "record",         "record",  TCM_SERVER, AUTH_ADMINISTRATOR , "GM: Record Book test - /record [set <id> <value>|clear|stats|top <id>|refresh]" )
#endif // __RECORD_BOOK
#ifdef __ANTI_BOT
	ON_TEXTCMDFUNC( TextCmd_AntiBot,               "antibot",            "antibot",        "antibot",        "antibot", TCM_SERVER, AUTH_GAMEMASTER    , "GM: bot check - /antibot <name> | info <name> | free <name> | reload" )
#endif // __ANTI_BOT
#ifdef __MINI_EVENT
	ON_TEXTCMDFUNC( TextCmd_MiniEventStart,        "eventstart",         "eventstart",     "eventstart",     "eventstart",  TCM_SERVER, AUTH_GAMEMASTER    , "GM: event now - /eventstart [colorgame|quickhands|oxquiz|luckydraw|turnin|hideseek|race|random] [minutes] [players needed]" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventEnd,          "eventend",           "eventend",       "eventend",       "eventend",    TCM_SERVER, AUTH_GAMEMASTER    , "GM: stop the running mini event, no prizes" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventSkip,         "eventskip",          "eventskip",      "eventskip",      "eventskip",   TCM_SERVER, AUTH_GAMEMASTER    , "GM: skip the mini event wait - registration / round / results" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventNext,         "eventnext",          "eventnext",      "eventnext",      "eventnext",   TCM_SERVER, AUTH_GAMEMASTER    , "GM: when the next mini event starts" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventStatus,       "eventstatus",        "eventstatus",    "eventstatus",    "eventstatus", TCM_SERVER, AUTH_GAMEMASTER    , "GM: mini event state + players" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventHideSpot,     "hidespot",           "hidespot",       "hidespot",       "hidespot",    TCM_SERVER, AUTH_GAMEMASTER    , "GM: Hide and Seek spot here - /hidespot \"region\" [\"hint\"] [\"landmark\"]" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventRecipe,       "eventrecipe",        "eventrecipe",    "eventrecipe",    "eventrecipe", TCM_SERVER, AUTH_GAMEMASTER    , "GM: Turn-in recipe - /eventrecipe [round] [\"title\"] <Ctrl+click items> [amount] | clear [round]" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventHideGoto,     "hidegoto",           "hidegoto",       "hidegoto",       "hidegoto",    TCM_SERVER, AUTH_GAMEMASTER    , "GM: teleport next to Lost Fwanki (Hide and Seek test)" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventRaceStart,    "racestart",          "racestart",      "racestart",      "racestart",   TCM_SERVER, AUTH_GAMEMASTER    , "GM: Vagrant Race start here (in WdRace) - /racestart" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventRacePoint,    "racepoint",          "racepoint",      "racepoint",      "racepoint",   TCM_SERVER, AUTH_GAMEMASTER    , "GM: next Vagrant Race checkpoint here (in route order) - /racepoint" )
	ON_TEXTCMDFUNC( TextCmd_MiniEventReload,       "eventreload",        "eventreload",    "eventreload",    "eventreload", TCM_SERVER, AUTH_GAMEMASTER    , "GM: read MiniEvent.inc again" )
#endif // __MINI_EVENT
#ifdef __OVERHEAD_TITLE
	ON_TEXTCMDFUNC( TextCmd_Title,                 "title",              "title",          "title",          "title",   TCM_SERVER, AUTH_ADMINISTRATOR , "GM: Overhead titles - /title spender <name> 1|2|3|off, /title set <0|-1|1-5>, /title info [name]" )
#ifdef __GW_STATUE
	ON_TEXTCMDFUNC( TextCmd_StatueRefresh,         "statuerefresh",      "statuerefresh",  "statuerefresh",  "statuerefresh", TCM_SERVER, AUTH_GAMEMASTER , "GM: rebuild the player statues with their owners' current gear and title" )
#endif // __GW_STATUE
#ifdef __OFFLINE_VENDOR
	ON_TEXTCMDFUNC( TextCmd_VendorList,            "vendorlist",         "vendorlist",     "vendorlist",     "vendorlist", TCM_SERVER, AUTH_GAMEMASTER , "GM: list the offline vendors (open / closed, listings, time left, place)" )
	ON_TEXTCMDFUNC( TextCmd_VendorClose,           "vendorclose",        "vendorclose",    "vendorclose",    "vendorclose", TCM_SERVER, AUTH_GAMEMASTER , "GM: /vendorclose <name> - close an offline vendor; items + earnings go back at the owner's next login" )
#endif // __OFFLINE_VENDOR
#endif // __OVERHEAD_TITLE
	ON_TEXTCMDFUNC( TextCmd_Level,                 "level",              "lv",             "레벨",           "렙",      TCM_SERVER, AUTH_GAMEMASTER3   , "레벨 설정 하기" )
	ON_TEXTCMDFUNC( TextCmd_InitSkillExp,          "InitSkillExp",       "InitSE",         "스킬초기화",     "스초",    TCM_SERVER, AUTH_GAMEMASTER3, "스킬초기화" )
	ON_TEXTCMDFUNC( TextCmd_SkillLevel,            "skilllevel",         "slv",            "스킬레벨",       "스렙",    TCM_BOTH  , AUTH_GAMEMASTER3   , "스킬레벨 설정 하기" )
	ON_TEXTCMDFUNC( TextCmd_SkillLevelAll,         "skilllevelAll",      "slvAll",         "스킬레벨올",     "스렙올",  TCM_BOTH  , AUTH_GAMEMASTER3   , "스킬레벨 설정 하기" )
	ON_TEXTCMDFUNC( TextCmd_BeginQuest,            "BeginQuest",         "bq",             "퀘스트시작",     "퀘시",    TCM_SERVER, AUTH_GAMEMASTER3, "퀘스트 시작 [ID]" )
	ON_TEXTCMDFUNC( TextCmd_EndQuest,              "EndQuest",           "eq",             "퀘스트종료",     "퀘종",    TCM_SERVER, AUTH_GAMEMASTER3, "퀘스트 종료 [ID]" )
	ON_TEXTCMDFUNC( TextCmd_RemoveQuest,           "RemoveQuest",        "rq",             "퀘스트제거",     "퀘제",    TCM_SERVER, AUTH_GAMEMASTER3, "퀘스트 제거 [ID]" )
	ON_TEXTCMDFUNC( TextCmd_RemoveAllQuest,        "RemoveAllQuest",     "raq",            "퀘스트전체제거", "퀘전제",  TCM_SERVER, AUTH_GAMEMASTER3, "퀘스트 전체 제거" )
	ON_TEXTCMDFUNC( TextCmd_RemoveCompleteQuest,   "RemoveCompleteQuest","rcq",            "퀘스트완료제거", "퀘완제",  TCM_SERVER, AUTH_GAMEMASTER3, "퀘스트 완료 제거" )
	ON_TEXTCMDFUNC( TextCmd_ChangeJob,             "changejob",			 "cjob",           "전직",           "전직",    TCM_SERVER, AUTH_GAMEMASTER3   , "전직 하기" )
	ON_TEXTCMDFUNC( TextCmd_Freeze,                "freeze",             "fr",             "정지",           "정지",    TCM_SERVER, AUTH_GAMEMASTER3   , "움직이지 못하게 하기" )
	ON_TEXTCMDFUNC( TextCmd_NoFreeze,              "nofreeze",           "nofr",           "정지해제",       "정해",    TCM_SERVER, AUTH_GAMEMASTER3   , "움직이지 못하게 하기 해제" )
	ON_TEXTCMDFUNC( TextCmd_PartyLevel,            "PartyLevel",         "plv",            "극단레벨",       "극레",    TCM_SERVER, AUTH_GAMEMASTER3   , "극단레벨 설정 하기" )
	ON_TEXTCMDFUNC( TextCmd_GuildStat,             "GuildStat",          "gstat",          "길드스탯",       "길스탯",  TCM_SERVER, AUTH_GAMEMASTER3   , "길드 스탯변경" )
	ON_TEXTCMDFUNC( TextCmd_CreateGuild,           "createguild",        "cg",             "길드생성",       "길생",    TCM_SERVER, AUTH_GAMEMASTER3   , "길드 생성" )
	ON_TEXTCMDFUNC( TextCmd_DestroyGuild,          "destroyguild",       "dg",             "길드해체",       "길해",    TCM_CLIENT, AUTH_GAMEMASTER3   , "길드 해체" )
	ON_TEXTCMDFUNC( TextCmd_GuildCombatIn,         "GCIn",               "gcin",           "길드워입장",     "길워입",  TCM_BOTH  , AUTH_GAMEMASTER3, "길드대전 입장" )
	ON_TEXTCMDFUNC( TextCmd_GuildCombatOpen,       "GCOpen",             "gcopen",         "길드워오픈",     "길워오",  TCM_BOTH  , AUTH_GAMEMASTER3, "길드대전 오픈" )
	ON_TEXTCMDFUNC( TextCmd_GuildCombatClose,      "GCClose",            "gcclose",        "길드워닫기",     "길워닫",  TCM_BOTH  , AUTH_GAMEMASTER3, "길드대전 닫기" )
	ON_TEXTCMDFUNC( TextCmd_GuildCombatNext,       "GCNext",             "gcNext",         "길드워다음",     "길워다",  TCM_BOTH  , AUTH_GAMEMASTER3, "길드대전 다음" )	
#ifdef __GW_BUFF
	ON_TEXTCMDFUNC( TextCmd_GWFight,               "GWFight",            "gwf",            "gwfight2",       "gwf2",   TCM_BOTH  , AUTH_GAMEMASTER3, "force guild war to WAR state" )
#endif // __GW_BUFF
	ON_TEXTCMDFUNC( TextCmd_indirect,              "indirect",           "id",             "간접",           "간접",    TCM_BOTH  , AUTH_GAMEMASTER3   , "상대에게 간접으로 말하게 하기" )
	ON_TEXTCMDFUNC( TextCmd_CreateNPC,             "createnpc",          "cn",             "엔피씨생성",     "엔생",    TCM_SERVER, AUTH_GAMEMASTER3   , "npc생성" )
#if __VER >= 9 // __EVENTLUA
	ON_TEXTCMDFUNC( TextCmd_LuaEventList,     "EVENTLIST",         "eventlist",          "이벤트목록",     "이벤트목록",    TCM_SERVER,  AUTH_GAMEMASTER3, "" )
	ON_TEXTCMDFUNC( TextCmd_LuaEventInfo,     "EVENTINFO",         "eventinfo",          "이벤트정보",     "이벤트정보",    TCM_SERVER,  AUTH_GAMEMASTER3, "" )	
#endif	// __EVENTLUA
	ON_TEXTCMDFUNC( TextCmd_GameSetting,           "gamesetting",        "gs",             "게임설정",       "게설",    TCM_SERVER, AUTH_GAMEMASTER3   , "게임 설정 보기" )
	ON_TEXTCMDFUNC( TextCmd_RemoveNpc,             "rmvnpc",             "rn",             "삭제",           "삭",      TCM_SERVER, AUTH_GAMEMASTER3, "NPC삭제" )

	// GM_LEVEL_4
	ON_TEXTCMDFUNC( TextCmd_Disguise,				"disguise",           "dis",            "변신",           "변",      TCM_SERVER, AUTH_ADMINISTRATOR   , "변신" )
	ON_TEXTCMDFUNC( TextCmd_NoDisguise,				"noDisguise",         "nodis",          "변신해제",       "변해",    TCM_SERVER, AUTH_ADMINISTRATOR   , "변신 해제" )
	ON_TEXTCMDFUNC( TextCmd_ResistItem,				"ResistItem",         "ritem",          "속성아이템",     "속아",    TCM_BOTH  , AUTH_ADMINISTRATOR, "속성아이템" )
	ON_TEXTCMDFUNC( TextCmd_JobName,				"jobname",            "jn",             "직업이름",       "직이",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "직업이름 보기" )
	ON_TEXTCMDFUNC( TextCmd_GetGold,				"getgold",            "gg",             "돈줘",           "돈",      TCM_SERVER, AUTH_ADMINISTRATOR, "돈 얻기" )
	ON_TEXTCMDFUNC( TextCmd_CreateItem,				"createitem",         "ci",             "아이템생성",     "아생",    TCM_BOTH  , AUTH_ADMINISTRATOR, "아이템생성" )
	ON_TEXTCMDFUNC( TextCmd_CreateItem2,			"createitem2",        "ci2",            "아이템생성2",    "아생2",   TCM_SERVER, AUTH_ADMINISTRATOR, "아이템생성2" )
	ON_TEXTCMDFUNC( TextCmd_QuestState,				"QuestState",         "qs",             "퀘스트상태",     "퀘상",    TCM_SERVER, AUTH_ADMINISTRATOR, "퀘스트 설정 [ID] [State]" )
	ON_TEXTCMDFUNC( TextCmd_LoadScript,				"loadscript",         "loscr",          "로드스크립트",   "로스",    TCM_BOTH  , AUTH_ADMINISTRATOR   , "스크립트 다시 읽기" )
	ON_TEXTCMDFUNC( TextCmd_ReloadConstant,			"ReloadConstant",     "rec",            "리로드콘스탄트", "리콘",    TCM_SERVER, AUTH_ADMINISTRATOR, "리로드 콘스탄트파일" )
	ON_TEXTCMDFUNC( TextCmd_CTD,					"ctd",				 "ctd",            "이벤트듀얼존",   "이듀",    TCM_BOTH  , AUTH_ADMINISTRATOR   , "이벤트 듀얼존 설정" )
	ON_TEXTCMDFUNC( TextCmd_Piercing,				"Piercing",           "pier",           "피어싱",         "피싱",    TCM_BOTH  , AUTH_ADMINISTRATOR, "피어싱(소켓)" )
#if __VER >= 9	// __PET_0410
	ON_TEXTCMDFUNC( TextCmd_PetLevel,				"petlevel",         "pl",          "펫레벨",     "펫레",    TCM_BOTH,  AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_PetExp,					"petexp",         "pe",          "펫경험치",     "펫경",    TCM_BOTH,  AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_MakePetFeed,			"makepetfeed",         "mpf",          "먹이만들기",     "먹이",    TCM_BOTH,  AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_Pet,					"Pet",         "pet",          "펫",     "펫",    TCM_BOTH,  AUTH_ADMINISTRATOR, "" )
#endif	// __PET_0410
#if __VER >= 9 // __EVENTLUA
	ON_TEXTCMDFUNC( TextCmd_Lua,					"Lua",         "lua",          "루아",     "루아",    TCM_SERVER,  AUTH_ADMINISTRATOR, "" )
#endif	// __EVENTLUA
#if __VER >= 11 // __GUILD_COMBAT_1TO1
	ON_TEXTCMDFUNC( TextCmd_GC1to1Open,				"GC1TO1OPEN",		"gc1to1open",			"일대일대전오픈", "일오",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_GC1to1Close,			"GC1TO1CLOSE",		"gc1to1close",			"일대일대전닫기", "일닫",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_GC1to1Next,				"GC1TO1NEXT",		"gc1to1next",			"일대일대전다음", "일다",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RefineAccessory,		"RefineAccessory",	"ra",	"액세서리제련", "액제",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RefineCollector,		"RefineCollector",	"rc",	"채집기재련", "채제",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_GenRandomOption,		"GenRandomOption",	"gro",	"각성축복", "각축",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_InitializeRandomOption,	"InitializeRandomOption",	"iro",	"각성축복제거", "각축제거",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SetRandomOption,		"SetRandomOption",	"sro",	"각성축복지정", "각지",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
#endif // __GUILD_COMBAT_1TO1
#ifdef __PET_1024
	ON_TEXTCMDFUNC( TextCmd_SetPetName,             "SetPetName",           "setpetname",             "펫작명",       "펫작",    TCM_SERVER, AUTH_ADMINISTRATOR , "펫작명" )
	ON_TEXTCMDFUNC( TextCmd_ClearPetName,           "ClearPetName",           "cpn",             "펫작명취소",       "펫작취",    TCM_CLIENT, AUTH_ADMINISTRATOR , "펫작명취소" )
#endif	// __PET_1024
#if __VER >= 13 // __COUPLE_1117
	ON_TEXTCMDFUNC( TextCmd_Propose,				"Propose",           "propose",             "프러포즈",       "프러포즈",    TCM_SERVER, AUTH_ADMINISTRATOR , "프러포즈" )
	ON_TEXTCMDFUNC( TextCmd_Refuse,					"Refuse",           "refuse",             "프러포즈거절",       "프거",    TCM_SERVER, AUTH_ADMINISTRATOR , "프러포즈거절" )
	ON_TEXTCMDFUNC( TextCmd_Couple,					"Couple",           "couple",             "커플",       "커플",    TCM_SERVER, AUTH_ADMINISTRATOR , "커플" )
	ON_TEXTCMDFUNC( TextCmd_Decouple,				"Decouple",           "decouple",             "커플해지",       "커해",    TCM_SERVER, AUTH_ADMINISTRATOR , "커플해지" )
	ON_TEXTCMDFUNC( TextCmd_ClearPropose,           "ClearPropose",           "clearpropose",             "프러포즈초기화",       "프초",    TCM_SERVER, AUTH_ADMINISTRATOR , "프러포즈초기화" )
//	ON_TEXTCMDFUNC( TextCmd_CoupleState,            "CoupleState",           "couplestate",             "커플상태",       "커상",    TCM_CLIENT, AUTH_ADMINISTRATOR , "커플상태" )
#if __VER >= 13 // __COUPLE_1202
	ON_TEXTCMDFUNC( TextCmd_NextCoupleLevel,        "NextCoupleLevel",           "ncl",             "커플레벨업",       "커레",    TCM_SERVER, AUTH_ADMINISTRATOR , "커플레벨업" )
#endif	// __COUPLE_1202
#endif	// __COUPLE_1117
#ifdef __NPC_BUFF
	ON_TEXTCMDFUNC( TextCmd_RemoveAllBuff,			"RemoveBuff",		"rb",			"버프해제", "버해",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif // __NPC_BUFF
	#if __VER >= 13 // __HONORABLE_TITLE			// 달인
	ON_TEXTCMDFUNC( TextCmd_HonorTitleSet,			"HonorTitleSet", "hts", "달인세팅", "달세", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif	// __HONORABLE_TITLE			// 달인




// 여기부터 국내만 
	ON_TEXTCMDFUNC( TextCmd_Wiki,                  "wiki",               "wiki",           "wiki",           "wiki",    TCM_CLIENT, AUTH_GENERAL         , "Open the item wiki" )
#ifdef __MOUNT
	ON_TEXTCMDFUNC( TextCmd_MountSet,              "mountset",           "mountset",       "mountset",       "mountset",TCM_BOTH  , AUTH_GAMEMASTER      , "Tune the ridden mount: speed, leg speed, loops, name height" )
#endif // __MOUNT
ON_TEXTCMDFUNC( TextCmd_Switch,                "switch",             "switch",         "switch",         "switch",  TCM_CLIENT, AUTH_GENERAL         , "Open the equipment switch presets" )
ON_TEXTCMDFUNC( TextCmd_Switch,                "sw",                 "sw",             "sw",             "sw",      TCM_CLIENT, AUTH_GENERAL         , "Open the equipment switch presets" )
#ifdef __DONATIONSHOP
	ON_TEXTCMDFUNC( TextCmd_DShop,                 "dshop",              "dshop",          "dshop",          "dshop",          TCM_CLIENT, AUTH_GENERAL         , "Open the donation shop" )
	ON_TEXTCMDFUNC( TextCmd_DShop,                 "donationshop",       "donationshop",   "donationshop",   "donationshop",   TCM_CLIENT, AUTH_GENERAL         , "Open the donation shop" )
	ON_TEXTCMDFUNC( TextCmd_DShop,                 "ds",                 "ds",             "ds",             "ds",             TCM_CLIENT, AUTH_GENERAL         , "Open the donation shop" )
#endif // __DONATIONSHOP
#ifdef __MONSTER_HUNT
	ON_TEXTCMDFUNC( TextCmd_MonsterHunt,           "mh",                 "mh",             "mh",             "mh",             TCM_CLIENT, AUTH_GENERAL         , "Open the Monster Hunt" )
	ON_TEXTCMDFUNC( TextCmd_MonsterHunt,           "monsterhunt",        "monsterhunt",    "monsterhunt",    "monsterhunt",    TCM_CLIENT, AUTH_GENERAL         , "Open the Monster Hunt" )
#endif // __MONSTER_HUNT
#ifdef __GUILD_FINDER
	ON_TEXTCMDFUNC( TextCmd_GuildFinder,           "gf",                 "gf",             "gf",             "gf",             TCM_CLIENT, AUTH_GENERAL         , "Open the Guild Finder" )
	ON_TEXTCMDFUNC( TextCmd_GuildFinder,           "guildfinder",        "guildfinder",    "guildfinder",    "guildfinder",    TCM_CLIENT, AUTH_GENERAL         , "Open the Guild Finder" )
#endif	// __GUILD_FINDER
#ifdef __FAST_AWAKE
	ON_TEXTCMDFUNC( TextCmd_FastAwake,             "fa",                 "fa",             "fa",             "fa",             TCM_CLIENT, AUTH_GENERAL         , "Open Fast Awake" )
	ON_TEXTCMDFUNC( TextCmd_FastAwake,             "fastawake",          "fastawake",      "fastawake",      "fastawake",      TCM_CLIENT, AUTH_GENERAL         , "Open Fast Awake" )
#endif	// __FAST_AWAKE
#ifdef __RECORD_BOOK
	ON_TEXTCMDFUNC( TextCmd_RecordBook,            "recordbook",         "recordbook",     "recordbook",     "recordbook",     TCM_CLIENT, AUTH_GENERAL         , "Open the Record Book" )
	ON_TEXTCMDFUNC( TextCmd_RecordBook,            "book",               "book",           "book",           "book",           TCM_CLIENT, AUTH_GENERAL         , "Open the Record Book" )
#endif	// __RECORD_BOOK
#ifdef __BATTLEPASS
	ON_TEXTCMDFUNC( TextCmd_BattlePass,            "bp",                 "bp",             "bp",             "bp",             TCM_CLIENT, AUTH_GENERAL         , "Open the Battle Pass" )
	// MUST stay above the "open" entry below. ParsingCommand walks this table in
	// source order and does `if( GetLanguage() != LANG_KOR ) if( command starts with
	// "open" ) break;` - a break, not a continue - so on a non-Korean build every
	// command registered after "open" is unreachable. IDS_LANG is "1" in every
	// project here and LANG_KOR is 0, so that always fires: 121 of the 237 entries
	// are dead. /rrbp was originally added at the end of the map and silently did
	// nothing. Wiki and Switch sit here for the same reason.
	ON_TEXTCMDFUNC( TextCmd_ResetBattlePass,        "ResetBattlePass",     "rrbp",      "",               "",        TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif // __BATTLEPASS
	// MUST stay above the "open" entry below - see the ResetBattlePass comment
	// a few lines up for why (non-Korean builds truncate the command table at
	// "open"; anything registered after it is unreachable).
	ON_TEXTCMDFUNC( TextCmd_GuildSiegePrizeNow,			"GWPrizePayout", "gspn", "Guild Siege weekly prize - force now", "", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_Open,                  "open",               "open",           "열기",           "열기",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "" )
	ON_TEXTCMDFUNC( TextCmd_Close,                 "close",              "close",          "닫기",           "닫기",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "" )
	ON_TEXTCMDFUNC( TextCmd_Music,                 "music",              "mu",             "음악",           "음악",    TCM_SERVER, AUTH_ADMINISTRATOR   , "배경음악" )
	ON_TEXTCMDFUNC( TextCmd_Sound,                 "sound",              "so",             "소리",           "소리",    TCM_SERVER, AUTH_ADMINISTRATOR   , "사운드 효과" )
	ON_TEXTCMDFUNC( TextCmd_LocalEvent,            "localevent",         "le",             "지역이벤트",     "지이",    TCM_SERVER, AUTH_ADMINISTRATOR   , "지역이벤트" )
	ON_TEXTCMDFUNC( TextCmd_CommercialElem,        "CommercialElem",     "CommercialElem", "속성강화창",     "속강",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "속성강화창 띄우기" )
	ON_TEXTCMDFUNC( TextCmd_QuerySetPlayerName,    "SetPlayerName",      "spn",            "플레이어이름",   "플이",    TCM_SERVER, AUTH_ADMINISTRATOR   , "플레이어 이름 변경" )
	ON_TEXTCMDFUNC( TextCmd_QuerySetGuildName,     "SetGuildName",       "sgn",            "길드이름",       "길이",    TCM_SERVER, AUTH_ADMINISTRATOR   , "길드 이름 변경" )
	ON_TEXTCMDFUNC( TextCmd_DeclWar,               "DeclWar",            "declwar",        "길드전신청",     "길신",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "길드전 신청" )
	ON_TEXTCMDFUNC( TextCmd_RemoveGuildMember,     "rgm",                "rgm",            "길드추방",       "길추",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "길드 추방" )
#ifdef __GUILDRANK
	ON_TEXTCMDFUNC( TextCmd_GuildRankingDBUpdate,  "GuildRankingUpdate", "rankingupdate",  "길업",           "길업",    TCM_SERVER, AUTH_ADMINISTRATOR   , "" )
#endif
	ON_TEXTCMDFUNC( TextCmd_ItemMode,              "gmitem",             "gmitem",         "아이템모드",     "아모",    TCM_SERVER, AUTH_ADMINISTRATOR   , "아이템 못집고 못떨어트리게 하기" )
	ON_TEXTCMDFUNC( TextCmd_ItemNotMode,           "gmnotitem",          "gmnotitem",      "아이템해제",     "아모해",  TCM_SERVER, AUTH_ADMINISTRATOR   , "아이템 모드 해제" )
	ON_TEXTCMDFUNC( TextCmd_AttackMode,            "gmattck",            "gmattck",        "공격모드",       "공모",    TCM_SERVER, AUTH_ADMINISTRATOR   , "공격 못하게 하기" )
	ON_TEXTCMDFUNC( TextCmd_AttackNotMode,         "gmnotattck",         "gmnotattck",     "공격해제",       "공모해",  TCM_SERVER, AUTH_ADMINISTRATOR   , "공격 모드 해제" )
	ON_TEXTCMDFUNC( TextCmd_CommunityMode,         "gmcommunity",        "gmcommunity",    "커뮤니티모드",   "커모",    TCM_SERVER, AUTH_ADMINISTRATOR	, "길드, 파티, 친구, 거래, 상점 못하게 하기" )
	ON_TEXTCMDFUNC( TextCmd_CommunityNotMode,      "gmnotcommunity",     "gmnotcommunity", "커뮤니티해제",   "커모해",  TCM_SERVER, AUTH_ADMINISTRATOR   , "커뮤니티 모드 해체" )
	ON_TEXTCMDFUNC( TextCmd_ObserveMode,           "gmobserve",          "gmobserve",      "관전모드",       "관모",    TCM_SERVER, AUTH_ADMINISTRATOR   , "아이템, 커뮤니티, 말못하게, 어텍 모드 합한것" )
	ON_TEXTCMDFUNC( TextCmd_ObserveNotMode,        "gmnotobserve",       "gmnotobserve",   "관전해제",       "관모해",  TCM_SERVER, AUTH_ADMINISTRATOR   , "관전 모드 해제" )
	ON_TEXTCMDFUNC( TextCmd_EscapeReset,           "EscapeReset",        "EscapeReset",    "탈출초기화",     "탈초",    TCM_BOTH  , AUTH_ADMINISTRATOR   , "탈출(귀환석) 시간 초기화" )
	ON_TEXTCMDFUNC( TextCmd_userlist,              "userlist",           "ul",             "사용자리스트",   "사용자리",TCM_SERVER, AUTH_ADMINISTRATOR, "사용자 리스트" )
	//ON_TEXTCMDFUNC( TextCmd_sbready,               "sbready",            "sbready",        "sbready",        "sbready", TCM_SERVER, AUTH_ADMINISTRATOR   , "sbready" )
	//ON_TEXTCMDFUNC( TextCmd_sbstart,               "sbstart",            "sbstart",        "sbstart",        "sbstart", TCM_SERVER, AUTH_ADMINISTRATOR   , "sbstart" )
	//ON_TEXTCMDFUNC( TextCmd_sbstart2,              "sbstart2",           "sbstart2",       "sbstart2",       "sbstart2",TCM_SERVER, AUTH_ADMINISTRATOR   , "sbstart2" )
	//ON_TEXTCMDFUNC( TextCmd_sbend,                 "sbend",              "sbend",          "sbend",          "sbend",   TCM_SERVER, AUTH_ADMINISTRATOR   , "sbend" )
	//ON_TEXTCMDFUNC( TextCmd_sbreport,              "sbreport",           "sbreport",       "sbreport",       "sbreport",TCM_SERVER, AUTH_ADMINISTRATOR   , "sbreport" )
	//ON_TEXTCMDFUNC( TextCmd_OpenBattleServer,      "bsopen",             "bsopen",         "bsopen",         "bsopen",  TCM_SERVER, AUTH_ADMINISTRATOR   , "bsopen" )
	//ON_TEXTCMDFUNC( TextCmd_CloseBattleServer,     "bsclose",            "bsclose",        "bsclose",        "bsclose", TCM_SERVER, AUTH_ADMINISTRATOR   , "bsclose" )
	ON_TEXTCMDFUNC( TextCmd_SetGuildQuest,         "SetGuildQuest",      "sgq",            "길드퀘스트",     "길퀘",    TCM_SERVER, AUTH_ADMINISTRATOR   , "길드 퀘스트 상태 변경" )
	ON_TEXTCMDFUNC( TextCmd_SetSnoop,              "Snoop",              "snoop",          "감청",           "감청",    TCM_SERVER, AUTH_ADMINISTRATOR   , "감청" )
	ON_TEXTCMDFUNC( TextCmd_SetSnoopGuild,         "SnoopGuild",         "sg",             "길드대화저장",   "길저",    TCM_SERVER, AUTH_ADMINISTRATOR   , "길드 대화 저장" )

	ON_TEXTCMDFUNC( TextCmd_GuildCombatRequest,    "GCRequest",          "gcrquest",       "길드워신청",     "길워신",  TCM_BOTH  , AUTH_ADMINISTRATOR, "길드대전 신청" )
	ON_TEXTCMDFUNC( TextCmd_GuildCombatCancel,     "GCCancel",           "gccancel",       "길드워탈퇴",     "길워탈",  TCM_BOTH  , AUTH_ADMINISTRATOR, "길드대전 탈퇴" )
	ON_TEXTCMDFUNC( TextCmd_PostMail,              "PostMail",           "pm",             "편지발송",       "발송",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "편지 발송" )
	ON_TEXTCMDFUNC( TextCmd_RemoveMail,            "RemoveMail",         "rm",             "편지삭제",       "편삭",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "편지 삭제" )
	ON_TEXTCMDFUNC( TextCmd_GetMailItem,           "GetMailItem",        "gm",             "소포받기",       "소포",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "소포 받기" )
	ON_TEXTCMDFUNC( TextCmd_GetMailGold,           "GetMailGolg",        "gmg",            "수금",           "수금",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "수금" )
	ON_TEXTCMDFUNC( TextCmd_InvenClear,            "InvenClear",         "icr",            "인벤청소",       "인청",    TCM_SERVER, AUTH_ADMINISTRATOR, "인벤토리의 내용을 모두 삭제" )
	ON_TEXTCMDFUNC( TextCmd_ExpUpStop,             "ExpUpStop",          "es",             "경험치금지",     "경금",    TCM_SERVER, AUTH_ADMINISTRATOR, "사냥으로 오르는 경험치 상승을 금지" )

#ifdef _DEBUG
	ON_TEXTCMDFUNC( TextCmd_CreateChar,            "createchar",         "cc",             "캐릭터생성",     "캐생",    TCM_SERVER, AUTH_ADMINISTRATOR   , "캐릭터생성" )
	ON_TEXTCMDFUNC( TextCmd_CreateCtrl,            "createctrl",         "ct",             "컨트롤생성",     "컨생",    TCM_SERVER, AUTH_ADMINISTRATOR   , "ctrl생성" )
	ON_TEXTCMDFUNC( TextCmd_SetMonsterRespawn,     "setmonsterrespawn",  "smr",            "리스폰영역설정", "리영설",  TCM_SERVER, AUTH_ADMINISTRATOR, "리스폰 영역 설정" )
	ON_TEXTCMDFUNC( TextCmd_TransyItemList,        "TransyItemList",     "til",            "트랜지리스트",   "트아리",  TCM_CLIENT, AUTH_ADMINISTRATOR, "트랜지아이템리스트" )
	ON_TEXTCMDFUNC( TextCmd_LoadToolTipColor,      "LoadToolTip",        "ltt",            "로드툴팁",       "로툴팁",  TCM_CLIENT, AUTH_ADMINISTRATOR, "로드 툴팁 컬러" )
#endif

#ifdef __S1108_BACK_END_SYSTEM
	ON_TEXTCMDFUNC( TextCmd_PropMonster,           "monstersetting",     "ms",             "몬스터설정",     "몬설",    TCM_CLIENT, AUTH_ADMINISTRATOR   , "몬스터 설정 보기" )
#else
	ON_TEXTCMDFUNC( TextCmd_ChangeShopCost,	       "changeshopcost",	 "csc",	           "상점가격조정",   "상가조",  TCM_SERVER, AUTH_ADMINISTRATOR, "상점가격조정 Min(0.5) ~ Max(2.0)"  )
#endif // __S1108_BACK_END_SYSTEM

#ifdef __EVENT_1101
	ON_TEXTCMDFUNC( TextCmd_CallTheRoll,			"CallTheRoll",        "ctr",            "출석설정",       "출석",  TCM_BOTH,	AUTH_ADMINISTRATOR, "출석 조작 명령어" )
#endif	// __EVENT_1101
	
#if __VER >= 8 //__CSC_VER8_5
	ON_TEXTCMDFUNC( TextCmd_AngelExp,				"AExp",		"aexp",			"엔젤경험치", "엔경",	TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif // __CSC_VER8_5
	
#if __VER >= 10 // __REMOVE_ATTRIBUTE
	ON_TEXTCMDFUNC( TextCmd_RemoveAttribute,		"RemAttr",		"remattr",			"속성제거", "속제",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
#endif // __REMOVE_ATTRIBUTE

#if __VER >= 11 // __SYS_COLLECTING
	ON_TEXTCMDFUNC( TextCmd_StartCollecting,		"StartCollecting",	"col1",	"채집시작", "채시",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_StopCollecting,			"StopCollecting",	"col2",	"채집끝", "채끝",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_DoUseItemBattery,		"Battery",	"battery",	"채집기충전", "채충",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
#endif	// __SYS_COLLECTING

#if __VER >= 11 // __SYS_POCKET
	ON_TEXTCMDFUNC( TextCmd_AvailPocket,			"AvailPocket",	"ap",	"주머니사용", "주사",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_PocketView,				"PocketView",	"pv",	"주머니보기", "주보",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_MoveItem_Pocket,		"MoveItemPocket",	"mip",	"아이템이동", "아이",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
#endif	// __SYS_POCKET

#if __VER >= 11 // __SYS_IDENTIFY
	ON_TEXTCMDFUNC( TextCmd_ItemLevel,				"ItemLevel",	"il",	"하락", "하락",	TCM_BOTH,	AUTH_ADMINISTRATOR, "" )
#endif	// __SYS_IDENTIFY

#ifdef __EVENTLUA_COUPON
	ON_TEXTCMDFUNC( TextCmd_Coupon,					"COUPON",		"coupon",			"쿠폰설정", "쿠폰",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif // __EVENTLUA_COUPON

//#ifdef __PERF_0226
	ON_TEXTCMDFUNC( TextCmd_CreatePc,				"CreatePc",		"cp",			"cp", "cp",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
//#endif	// __PERF_0226
#ifdef __SFX_OPT
	ON_TEXTCMDFUNC( TextCmd_SfxLv,					"SfxLevel",		"sl",			"sl", "sl",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif	

#if __VER >= 12 // __SECRET_ROOM
	ON_TEXTCMDFUNC( TextCmd_SecretRoomOpen,			"SROPEN",		"sropen",			"비밀의방오픈", "비오",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomNext,			"SRNEXT",		"srnext",			"비밀의방다음", "비다",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomEntrance,		"SRENTRANCE",		"srentrance",			"비밀의방입장", "비입장",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomTender,		"SRTENDER",		"srtender",			"비밀의방입찰", "비입",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomLineUp,		"SRLINEUP",		"srlineup",			"비밀의방구성", "비구",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomClose,		"SRCLOSE",		"srclose",			"비밀의방닫기", "비닫",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomTenderView,	"SRVIEW",		"srview",			"비밀의방입찰현황", "비현",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SecretRoomTenderCancelReturn, "SRCANCEL",		"srcancel",		"비밀의방입찰취소", "비취",	TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif // __SECRET_ROOM

#if __VER >= 12 // __LORD
	ON_TEXTCMDFUNC( TextCmd_ElectionRequirement,	"ElectionRequirement", "er", "군주투표현황", "군투현", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
//#ifdef __INTERNALSERVER
	ON_TEXTCMDFUNC( TextCmd_ElectionAddDeposit,		"ElectionAddDeposit", "ead", "군주입찰", "군입", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionSetPledge,		"ElectionSetPledge", "esp", "군주공약설정", "군공", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionIncVote,		"ElectionIncVote", "eiv", "군주투표", "군투", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionProcess,		"ElectionProcess", "ep", "군주프로세스", "군프", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionBeginCandidacy,	"ElectionBeginCandidacy", "ebc", "군주입후보시작", "군입시", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionBeginVote,		"ElectionBeginVote", "ebv", "군주투표시작", "군투시", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionEndVote,		"ElectionEndVote", "eev", "군주투표종료", "군투종", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_ElectionState,			"ElectionState", "estate", "군주투표상태", "군투상", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_LEventCreate,			"LEventCreate", "lecreate", "군주이벤트시작", "군이시", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_LEventInitialize,		"LEventInitialize", "leinitialize", "군주이벤트초기화", "군이초", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_LSkill,					"LSkill", "lskill", "군주스킬", "군스", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RemoveTotalGold,		"RemoveTotalGold", "rtg", "돈삭제", "돈삭", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
//#endif	// __INTERNALSERVER
#endif	// __LORD

#if __VER >= 12 // __MOD_TUTORIAL
	ON_TEXTCMDFUNC( TextCmd_SetTutorialState,		"SetTutorialState", "sts", "튜토리얼레벨", "튜레", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif	// __MOD_TUTORIAL

#if __VER >= 12 // __TAX
	ON_TEXTCMDFUNC( TextCmd_TaxApplyNow,			"TaxApplyNow", "tan", "세율적용", "세적", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif // __TAX

#if __VER >= 12 // __HEAVEN_TOWER
	ON_TEXTCMDFUNC( TextCmd_HeavenTower,			"HeavenTower", "HTower", "심연의탑", "심탑", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif //__HEAVEN_TOWER

#if __VER >= 12 // __CSC_VER12_4
	ON_TEXTCMDFUNC( TextCmd_RemoveJewel,			"RemoveJewel", "RJewel", "보석제거", "보제", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif //__CSC_VER12_4

#if __VER >= 12 // __CSC_VER12_5
	ON_TEXTCMDFUNC( TextCmd_TransEggs,				"TransEggs", "TEggs", "알변환", "알변", TCM_BOTH, AUTH_ADMINISTRATOR, "" )
#endif //__CSC_VER12_5
	ON_TEXTCMDFUNC( TextCmd_PickupPetAwakeningCancel,	"PickupPetAwakeningCancel",	"ppac",	"픽업펫각성취소", "픽소",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )

#ifdef __LAYER_1020
	ON_TEXTCMDFUNC( TextCmd_CreateLayer,            "CreateLayer",           "cl",             "레이어생성",       "레생",    TCM_SERVER, AUTH_ADMINISTRATOR , "레이어생성" )
	ON_TEXTCMDFUNC( TextCmd_DeleteLayer,            "DeleteLayer",           "dl",             "레이어파괴",       "레파",    TCM_SERVER, AUTH_ADMINISTRATOR , "레이어파괴" )
	ON_TEXTCMDFUNC( TextCmd_Layer,					"Layer",           "lay",             "레이어이동",       "레이",    TCM_SERVER, AUTH_ADMINISTRATOR , "레이어이동" )
#endif	// __LAYER_1020

#if __VER >= 13 // __RAINBOW_RACE
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceApp,			"RRApp",	"rrapp",	"레인보우신청", "레신",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceOpen,		"RROpen",	"rropen",	"레인보우오픈", "레오",	TCM_SERVER,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceNext,		"RRNext",	"rrnext",	"레인보우다음", "레다",	TCM_SERVER,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRacePass,		"RRPass",	"rrpass",	"레인보우패스", "레패",	TCM_SERVER,	AUTH_ADMINISTRATOR, "" )
	
//	ON_TEXTCMDFUNC( TextCmd_RainbowRaceInfo,		"RRinfo",	"rrinfo",	"레인보우정보", "레정",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
//	ON_TEXTCMDFUNC( TextCmd_RainbowRaceRule,		"RRRule",	"rrrule",	"레인보우규칙", "레규",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
//	ON_TEXTCMDFUNC( TextCmd_RainbowRaceRanking,		"RRRanking","rrranking","레인보우랭킹", "레랭",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
//	ON_TEXTCMDFUNC( TextCmd_RainbowRacePrize,		"RRPrize",	"rrprize",	"레인보우상품", "레상",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )

	ON_TEXTCMDFUNC( TextCmd_RainbowRaceKawiBawiBo,	"RRKawiBawiBo",	"rrkawibawibo",	"레인보우가위바위보", "레가",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceDice,		"RRDice",	"rrdice",	"레인보우주사위", "레주",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceArithmetic,	"RRArithmetic",	"rrarithmetic",	"레인보우수학", "레수",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )	
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceStopWatch,	"RRStopWatch",	"rrstopwatch",	"레인보우스톱워치", "레스",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceTyping,		"RRTyping",	"rrtyping",	"레인보우타자치기", "레타",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceCard,		"RRCard",	"rrcard",	"레인보우카드", "레카",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceLadder,		"RRLadder",	"rrladder",	"레인보우사다리", "레사",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_RainbowRaceReqFininsh,	"RRFINISH",	"rrfinish",	"레인보우완주", "레완",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
#endif // __RAINBOW_RACE

//#ifdef __EXT_ENCHANT
//	ON_TEXTCMDFUNC( TextCmd_ChangeAttribute,		"CHATTRIBUTE",	"chattribute",	"속성변경", "속변",	TCM_CLIENT,	AUTH_ADMINISTRATOR, "" )
//#endif //__EXT_ENCHANT
#if __VER >= 13 // __HOUSING
	ON_TEXTCMDFUNC( TextCmd_HousingVisitRoom,		"HousingVisit",	"hv",	"방문", "방문",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_HousingGMRemoveAll,		"HousingGMRemoveAll",	"hgmra",	"가구삭제", "가삭",	TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif // __HOUSING
/*
#if __VER >= 14 // __SMELT_SAFETY
	ON_TEXTCMDFUNC( TextCmd_SmeltSafetyNormal,		"SmeltSafetyNormal",	"ssn",	"안전제련일반", "안제일",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SmeltSafetyAccessary,	"SmeltSafetyAccessary",	"ssa",	"안전제련악세", "안제악",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_SmeltSafetyPiercing,	"SmeltSafetyPiercing",	"ssp",	"안전제련피어싱", "안제피",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
#endif //__SMELT_SAFETY
*/
#if __VER >= 15 // __15_5TH_ELEMENTAL_SMELT_SAFETY
	ON_TEXTCMDFUNC( TextCmd_SmeltSafetyElement,		"SmeltSafetyElement",	"sse",	"안전제련속성", "안제속",	TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
#endif // __15_5TH_ELEMENTAL_SMELT_SAFETY
#ifdef __QUIZ
	ON_TEXTCMDFUNC( TextCmd_QuizEventOpen,			"QuizEventOpen",		"qeo",		"퀴즈오픈", "퀴오", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_QuizEventEnterance,		"QuizEventEnterance",	"qee",		"퀴즈입장", "퀴입", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_QuizStateNext,			"QuizStateNext",		"qsn",		"퀴즈다음", "퀴다", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_QuizEventClose,			"QuizEventClose",		"qec",		"퀴즈종료", "퀴종", TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif // __QUIZ

#if __VER >= 15 // __GUILD_HOUSE
	ON_TEXTCMDFUNC( TextCmd_BuyGuildHouse,			"BuyGuildHouse",		"bgh",		"길드하우스구입",	"길하구", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_GuildHouseUpkeep,		"GuildHouseUpkeep",		"ghu",		"길드하우스유지비",	"길하유", TCM_CLIENT, AUTH_ADMINISTRATOR, "" )
#endif // __GUILD_HOUSE

#if __VER >= 15 // __CAMPUS
	ON_TEXTCMDFUNC( TextCmd_RemoveCampusMember,		"RemoveCampusMember",	"rcm",		"사제해지",		"사해",		TCM_SERVER, AUTH_ADMINISTRATOR, "" )
	ON_TEXTCMDFUNC( TextCmd_UpdateCampusPoint,		"UpdateCampusPoint",	"ucp",		"사제포인트업",	"사포업",	TCM_SERVER, AUTH_ADMINISTRATOR, "" )
#endif // __CAMPUS
	ON_TEXTCMDFUNC( TextCmd_InvenRemove,            "InvenRemove",         "irm",       "인벤삭제",       "인삭",    TCM_SERVER, AUTH_ADMINISTRATOR, "" )
END_TEXTCMDFUNC_MAP


int ParsingCommand( LPCTSTR lpszString, CMover* pMover, BOOL bItem )
{
	CScanner scanner;
	scanner.SetProg( (LPTSTR)lpszString );
	scanner.dwValue	= (DWORD)pMover;
	scanner.GetToken(); // skip /
	scanner.GetToken(); // get command

	int nCount = 0;
	while( m_textCmdFunc[ nCount ].m_pFunc )
	{
		TextCmdFunc* pTextCmdFunc = &m_textCmdFunc[nCount];			// 해외 명령어 제한 
		if( ::GetLanguage() != LANG_KOR )
		{
			if( memcmp( pTextCmdFunc->m_pCommand, "open", 4 ) == 0 )
				break;
		}

		if( scanner.Token == pTextCmdFunc->m_pCommand || scanner.Token == pTextCmdFunc->m_pAbbreviation ||
			scanner.Token == pTextCmdFunc->m_pKrCommand || scanner.Token == pTextCmdFunc->m_pKrAbbreviation )

		{
		#ifdef __CLIENT
			/*if( scanner.Token == "disguise" || scanner.Token == "dis" || scanner.Token == "변신" || scanner.Token == "변" ||
				scanner.Token == "noDisguise" || scanner.Token == "nodis" || scanner.Token == "변신해제" || scanner.Token == "변해" )
			{
				g_WndMng.PutString( "Not Command!" );
				return TRUE;
			}*/				
		#endif // __CLIENT

			if( bItem == FALSE && pTextCmdFunc->m_dwAuthorization > pMover->m_dwAuthorization )
				break;

		#ifdef __WORLDSERVER
			if( pTextCmdFunc->m_dwAuthorization > pMover->m_dwAuthorization )
				break;
		#endif //__WORLDSERVER

		#ifdef __CLIENT
			if( pTextCmdFunc->m_nServer == TCM_CLIENT || pTextCmdFunc->m_nServer == TCM_BOTH )
			{
				if( ( *pTextCmdFunc->m_pFunc )( scanner ) )
					if( pTextCmdFunc->m_nServer == TCM_BOTH )
					{
						char szSendChat[MAX_PATH];
						sprintf( szSendChat, "%s", scanner.m_pBuf );
						g_DPlay.SendChat( (LPCSTR)szSendChat );
					}
			}
			else
				g_DPlay.SendChat( (LPCSTR)lpszString );
		#else	// __CLIENT
			if( pTextCmdFunc->m_nServer == TCM_SERVER ||  pTextCmdFunc->m_nServer == TCM_BOTH )
				( *pTextCmdFunc->m_pFunc )( scanner );
		#endif	// __CLIENT
			return TRUE;
		}
		nCount++;
	}

#ifdef __CLIENT
	BOOL bSkip = FALSE;
	CString strTemp = lpszString;
	
	if( strTemp.Find( "#", 0 ) >= 0 )
		bSkip = TRUE;

	int nstrlen = strlen(lpszString);

	if( !bSkip )
	{
		TCHAR	szText[MAX_EMOTICON_STR];

		if(nstrlen < MAX_EMOTICON_STR)
			strcpy( szText, lpszString );
		else
		{
			strncpy(szText, lpszString, MAX_EMOTICON_STR);
			szText[MAX_EMOTICON_STR] = NULL;
		}

		// 이모티콘 명령
		for( int j=0; j < MAX_EMOTICON_NUM; j++ )
		{
			if( stricmp( &(szText[1]), g_DialogMsg.m_EmiticonCmd[ j ].m_szCommand ) == 0 )			
	//		if( _tcsicmp( szText, g_DialogMsg.m_EmiticonCmd[ j ].m_szCommand ) == 0 )
			{
				g_DPlay.SendChat( (LPCSTR)lpszString );
				return TRUE;
			}
		}
	}
#endif	//__CLIENT

	return FALSE;
}

void RemoveCRLF( char* szString )
{
	CString str		= szString;
	str.Replace( "\\n", " " );
	lstrcpy( szString, (LPCSTR)str );
}

void ParsingEffect( TCHAR* pChar, int nLen )
{
	CString strTemp;
#ifdef __ITEMLINK
	bool bIsLink = false;
	TCHAR* pBack = new TCHAR[strlen(pChar)+2];
	strcpy( pBack, pChar );
#endif

	for( int i = 0; i < nLen; i++ )
	{
		if( pChar[ i ] == '#' ) // 인식 코드
		{
			if( ++i >= nLen )
				break;
			switch( pChar[ i ] )
			{
			case 'c':
				{
					if( ++i >= nLen )
						break;
					
					i += 7;
				}
				break;
			case 'u':
				break;
			case 'b':
				break;
			case 's':
				break;
				
			case 'l':
				{
					if(++i >= nLen)
						break;
					
					i += 3;
				}				
				break;
#ifdef __ITEMLINK
			case 'i':
				{
					if( ++i >= nLen )
						break;
					
					i += 6;
					i += 4;
					bIsLink = true;
				}
				break;
#endif			
			case 'n':
				if( ++i >= nLen )
					break;
				
				{					
					switch( pChar[ i ] )
					{
					case 'c':
						break;
					case 'b':
						break;
					case 'u':
						break;
					case 's':
						break;
					case 'l':
						break;
#ifdef __ITEMLINK
					case 'i':
						break;
#endif					
					}
				}
				break;
			default: // 명령코드를 발견 못했을 경우 
				{
					// #코드를 넣어준다
					strTemp += pChar[ i - 1 ];
					strTemp += pChar[ i ];
				}
				break;
			}
		}
		else
		{
			if( pChar[ i ] == '\\' && pChar[ i+1 ] == 'n' )
			{
				strTemp += '\n';
				i+=1;
			}
			else
			{
				strTemp += pChar[ i ];
				int nlength = strTemp.GetLength();
			}
		}
	}
	
//	memcpy( pChar, strTemp, sizeof(TCHAR)*nLen );
#ifdef __ITEMLINK
	if( bIsLink )
		strcpy( pChar, pBack );
	else
#endif
		strcpy( pChar, strTemp );
#ifdef __ITEMLINK
	SAFE_DELETE_ARRAY( pBack );
#endif
}
