// Where NPCs stand in the game, and whether the WorldServer shows them.
//   World.inc    CWorldMng::LoadScript (_Common/worldmng.cpp:302): `WI_x "WdName"` per map
//   *.dyo        CWorld::LoadObject (_Common/WorldFile.cpp:297): World/<name>/<name>.dyo, a stream of
//                ReadObj records (_Common/CreateObj.cpp:761) ended by 0xFFFFFFFF. Positions: CObj::Read
//                (Obj.cpp:474) reads m_vPos at byte 16 and multiplies x and z by OLD_MPU = 4 (Obj.cpp:525)
//   visibility   CWorld::IsUsableDYO2 (_Common/WorldFile.cpp:1181): SetOutput / SetLang in character.inc
// The WorldServer's language is compiled into the exe: WORLDSERVER/WorldServer.rc:137
// IDS_LANG "1" (LANG_USA), IDS_SUBLANG "0"; __NO_SUB_LANG is on, so SetLang's sub language is 0.
(function (FRE) {
  'use strict';
  const SERVER_LANG = 1, SERVER_SUBLANG = 0;
  const OT = { OBJ: 0, ANI: 1, CTRL: 2, SFX: 3, ITEM: 4, MOVER: 5, SHIP: 7 };
  const OBJ_BYTES = 60;              // CObj::Read (Obj.cpp:474): angle, axis[3], pos[3], scale[3], type, index, motion, AI, AI2
  const OLD_MPU = 4;                 // DefineCommon.cpp:11
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

  // One .dyo file (bytes) -> { movers: [key], placements: [{ key, x, y, z, angle, model, at }] (keyed movers only),
  // end: 'eof' | 'stop' | 'short', stopType, endAt }
  // endAt: offset of the type the server stopped at (the final 0xFFFFFFFF when end is 'eof' and a
  // marker is there). A new record inserted there is read like the others (Add New NPC).
  // A record type the WorldServer cannot create (OT_ANI, OT_SFX on the server, junk) makes ReadObj
  // return NULL and the server stops reading the rest of the file. OT_SHIP is a CShip, whose Read is
  // CCtrl::Read = CObj::Read (Ctrl.cpp:85). No map file holds one.
  function readDyo(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const movers = [], placements = [];
    let i = 0;
    const str = (at, len) => { let s = ''; for (let k = at; k < at + len && bytes[k]; k++) s += String.fromCharCode(bytes[k]); return s; };
    while (i + 4 <= bytes.length) {
      const type = dv.getUint32(i, true); i += 4;
      if (type === OT.OBJ || type === OT.ITEM || type === OT.SHIP) i += OBJ_BYTES;
      else if (type === OT.MOVER) {
        // CMover::Read (Mover.cpp:3365): m_szName[64], szDialogFile[32], m_szCharacterKey[32], belligerence, extra flag
        if (i + OBJ_BYTES + 136 > bytes.length) return { movers, placements, end: 'short' };
        const key = str(i + OBJ_BYTES + 96, 32);
        movers.push(key);
        if (key) placements.push({ key, x: dv.getFloat32(i + 16, true) * OLD_MPU, y: dv.getFloat32(i + 20, true), z: dv.getFloat32(i + 24, true) * OLD_MPU,
          angle: dv.getFloat32(i, true), model: dv.getUint32(i + 44, true), at: i - 4 });
        i += OBJ_BYTES + 136;
      } else if (type === OT.CTRL) {
        // CCommonCtrl::Read (CommonCtrl.cpp:84): a version DWORD, then the CCtrlElem
        i += OBJ_BYTES;
        const v = dv.getUint32(i, true); i += 4;
        i += v === 0x80000000 ? CTRL_ELEM : v === 0x90000000 ? 88 + CTRL_ELEM - 152 : CTRL_ELEM - 40;
      } else return { movers, placements, end: type === 0xFFFFFFFF && i === bytes.length ? 'eof' : 'stop', stopType: type, endAt: i - 4 };
    }
    return { movers, placements, end: i === bytes.length ? 'eof' : 'short', endAt: i };
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

  FRE.world = { readWorldList, readDyo, OLD_MPU, npcShown, npcStatus, SERVER_LANG, SERVER_SUBLANG };
})(globalThis.FRE = globalThis.FRE || {});
