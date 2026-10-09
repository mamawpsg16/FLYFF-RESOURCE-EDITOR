// propMover.txt loader, ported from CProject::LoadPropMover (_Common/ProjectCmn.cpp:380).
// Read-only: the editor needs each monster's id, display name, level and rank
// (Battle Pass monster points are priced by level and rank), and for Monster Drops dwFlying and dwCorrectionValue.
// A record is a fixed token stream: id, name, then the fields below in the
// exact order the C++ reads them (__VER 19). Line breaks don't matter.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const MAX_PROPMOVER = 14900;      // _Common/ProjectCmn.h:82

  // n = GetNumber, f = GetFloat, t = GetToken, e = GetExpInteger (GetInt64, scanner.cpp:912).
  const SCHEMA_SRC = `
    dwAI:n dwStr:n dwSta:n dwDex:n dwInt:n dwHR:n dwER:n dwRace:n dwBelligerence:n dwGender:n
    dwLevel:n dwFlightLevel:n dwSize:n dwClass:n bIfParts:n nChaotic:n dwUseable:n dwActionRadius:n
    dwAtkMin:n dwAtkMax:n dwAtk1:n dwAtk2:n dwAtk3:n dwAtk4:n fFrame:f dwOrthograde:n dwThrustRate:n
    dwChestRate:n dwHeadRate:n dwArmRate:n dwLegRate:n dwAttackSpeed:n dwReAttackDelay:n dwAddHp:n
    dwAddMp:n dwNaturalArmor:n nAbrasion:n nHardness:n dwAdjAtkDelay:n eElementType:n wElementAtk:n
    dwHideLevel:n fSpeed:f dwShelter:n dwFlying:n dwJumpIng:n dwAirJump:n bTaming:n dwResisMgic:n
    fResistElecricity:f fResistFire:f fResistWind:f fResistWater:f fResistEarth:f dwCash:n
    dwSourceMaterial:n dwMaterialAmount:n dwCohesion:n dwHoldingTime:n dwCorrectionValue:n
    nExpValue:e nFxpValue:n nBodyState:n dwAddAbility:n bKillable:n dwVirtItem1:n dwVirtItem2:n
    dwVirtItem3:n bVirtType1:n bVirtType2:n bVirtType3:n dwSndAtk1:n dwSndAtk2:n dwSndDie1:n
    dwSndDie2:n dwSndDmg1:n dwSndDmg2:n dwSndDmg3:n dwSndIdle1:n dwSndIdle2:n szComment:t
    dwAreaColor:n szNpcMark:t dwMadrigalGiftPoint:n`;
  const SCHEMA = SCHEMA_SRC.trim().split(/\s+/).map(s => { const [name, kind] = s.split(':'); return { name, kind }; });
  const LEVEL = SCHEMA.findIndex(f => f.name === 'dwLevel');
  const CLASS = SCHEMA.findIndex(f => f.name === 'dwClass');
  const FLYING = SCHEMA.findIndex(f => f.name === 'dwFlying');
  const CORRECTION = SCHEMA.findIndex(f => f.name === 'dwCorrectionValue');
  const EXPVALUE = SCHEMA.findIndex(f => f.name === 'nExpValue');

  // dwClass values (defineAttribute.h RANK_*), as BattlePass.inc's row comments name them
  const RANKS = { 1: 'low', 2: 'normal', 3: 'captain', 4: 'boss', 5: 'midboss', 6: 'material', 7: 'super', 8: 'guard', 9: 'citizen' };

  function loadPropMover(file, ctx) {
    const script = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const movers = new Map();       // id -> { id, define, name, level, rank, start }
    let stopped = null;
    for (;;) {
      const id = script.getNumber();
      if (script.eof) break;
      if (id.value === 0) continue;             // the server reads the next number as the id
      if (id.value < 0 || id.value >= MAX_PROPMOVER || movers.has(id.value)) {
        // the C++ returns FALSE here: every later mover is missing
        stopped = { start: id.start, end: id.end, id: id.value };
        break;
      }
      const nameTok = script.getToken();
      const vals = new Array(SCHEMA.length);
      for (let i = 0; i < SCHEMA.length; i++) {
        const k = SCHEMA[i].kind;
        vals[i] = k === 't' ? script.getToken().text : (k === 'f' ? script.getFloat() : k === 'e' ? script.getInt64() : script.getNumber()).value;
      }
      const name = String(nameTok.text || '').replace(/\s+$/, '');
      movers.set(id.value, {
        id: id.value, define: id.define || file.text.slice(id.start, id.end),
        name, nameKey: nameTok.stringKey || null,
        level: vals[LEVEL], rankId: vals[CLASS], rank: RANKS[vals[CLASS]] || `rank ${vals[CLASS]}`,
        flying: vals[FLYING], correction: vals[CORRECTION], exp: vals[EXPVALUE],   // the kill path: drops into the bag; DropKind's chance % (Mover.cpp:8613 / 8866)
        start: id.start,
      });
    }
    return { file: file.name, movers, stopped, diags: script.diags };
  }

  FRE.propMover = { loadPropMover, SCHEMA, RANKS, MAX_PROPMOVER };
})(globalThis.FRE = globalThis.FRE || {});
