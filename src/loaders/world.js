// Where NPCs stand in the game, and whether the WorldServer shows them.
//   World.inc    CWorldMng::LoadScript (_Common/worldmng.cpp:302): `WI_x "WdName"` per map
//   *.dyo        CWorld::LoadObject (_Common/WorldFile.cpp:297): World/<name>/<name>.dyo, a stream of
//                ReadObj records (_Common/CreateObj.cpp:761) ended by 0xFFFFFFFF
//   visibility   CWorld::IsUsableDYO2 (_Common/WorldFile.cpp:1181): SetOutput / SetLang in character.inc
// The WorldServer's language is compiled into the exe: WORLDSERVER/WorldServer.rc:137
// IDS_LANG "1" (LANG_USA), IDS_SUBLANG "0"; __NO_SUB_LANG is on, so SetLang's sub language is 0.
(function (FRE) {
  'use strict';
  const SERVER_LANG = 1, SERVER_SUBLANG = 0;
  const OT = { OBJ: 0, ANI: 1, CTRL: 2, SFX: 3, ITEM: 4, MOVER: 5, SHIP: 7 };
  const OBJ_BYTES = 60;              // CObj::Read (Obj.cpp:474): angle, axis[3], pos[3], scale[3], type, index, motion, AI, AI2
  const CTRL_ELEM = 432;             // sizeof(CCtrlElem) (CommonCtrl.cpp:96, __LEGEND "432")

  // World.inc -> [{ define, id, name }]. SetTitle lines and comments are skipped.
  function readWorldList(file, defines) {
    const out = [];
    if (!file) return out;
    const lex = new FRE.lexer.Lexer(file.text);
    let prev = null;
    for (let t = lex.next(); t.type !== 'eof'; t = lex.next()) {
      if (t.type === 'string' && prev && prev.type === 'temp' && /^WI_/.test(prev.text))
        out.push({ define: prev.text, id: defines.get(prev.text), name: t.text });
      prev = t;
    }
    return out;
  }

  // One .dyo file (bytes) -> { movers: [key], end: 'eof' | 'stop' | 'short', stopType }
  // A record type the WorldServer cannot create (OT_ANI, OT_SFX, OT_SHIP has no Read here, junk)
  // makes ReadObj return NULL and the server stops reading the rest of the file.
  function readDyo(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const movers = [];
    let i = 0;
    const str = (at, len) => { let s = ''; for (let k = at; k < at + len && bytes[k]; k++) s += String.fromCharCode(bytes[k]); return s; };
    while (i + 4 <= bytes.length) {
      const type = dv.getUint32(i, true); i += 4;
      if (type === OT.OBJ || type === OT.ITEM) i += OBJ_BYTES;
      else if (type === OT.MOVER) {
        // CMover::Read (Mover.cpp:3365): m_szName[64], szDialogFile[32], m_szCharacterKey[32], belligerence, extra flag
        if (i + OBJ_BYTES + 136 > bytes.length) return { movers, end: 'short' };
        movers.push(str(i + OBJ_BYTES + 96, 32));
        i += OBJ_BYTES + 136;
      } else if (type === OT.CTRL) {
        // CCommonCtrl::Read (CommonCtrl.cpp:84): a version DWORD, then the CCtrlElem
        i += OBJ_BYTES;
        const v = dv.getUint32(i, true); i += 4;
        i += v === 0x80000000 ? CTRL_ELEM : v === 0x90000000 ? 88 + CTRL_ELEM - 152 : CTRL_ELEM - 40;
      } else return { movers, end: type === 0xFFFFFFFF && i === bytes.length ? 'eof' : 'stop', stopType: type };
    }
    return { movers, end: i === bytes.length ? 'eof' : 'short' };
  }

  // CWorld::IsUsableDYO2: no SetLang list -> SetOutput decides; the server's language in the
  // list -> SetOutput decides; otherwise the opposite of SetOutput.
  function npcShown(npc, lang = SERVER_LANG, sub = SERVER_SUBLANG) {
    const output = npc.output !== false;
    if (!npc.langs || !npc.langs.length) return output;
    return npc.langs.some(l => l.lang === lang && l.sub === sub) ? output : !output;
  }

  // Why an NPC is or is not in the game. placed: Map lowercase key -> [world names] (or null: unknown)
  function npcStatus(npc, placed) {
    const maps = placed ? placed.get(npc.key.toLowerCase()) || [] : null;
    if (maps && !maps.length) return { inGame: false, maps, why: 'not placed on any map' };
    if (!npcShown(npc)) return { inGame: false, maps, why: npc.langs && npc.langs.length ? 'hidden on this server (SetOutput / SetLang)' : 'hidden: SetOutput( false )' };
    return { inGame: maps ? true : null, maps, why: maps ? `on ${maps.join(', ')}` : 'map files not read' };
  }

  FRE.world = { readWorldList, readDyo, npcShown, npcStatus, SERVER_LANG, SERVER_SUBLANG };
})(globalThis.FRE = globalThis.FRE || {});
