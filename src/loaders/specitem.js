// Spec_Item.txt loader, ported from CProject::LoadPropItem (ProjectCmn.cpp:573).
// With __VER 19 the server loads Spec_Item.txt; propItem.txt is never read.
// A record is 175 values read as a token stream (line breaks don't matter).
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const SERVER_VER = 19;

  // Fields after (ver, dwID, szName), in the exact order the C++ reads them
  // (__VER 19, __PROP_0827). n = GetNumber, f = GetFloat, t = GetToken.
  const SCHEMA_SRC = `
    dwNum:n dwPackMax:n dwItemKind1:n dwItemKind2:n dwItemKind3:n dwItemJob:n bPermanence:n dwUseable:n
    dwItemSex:n dwCost:n dwEndurance:n nAbrasion:n nMaxRepair:n dwHanded:n dwFlag:n dwParts:n dwPartsub:n
    bPartsFile:n dwExclusive:n dwBasePartsIgnore:n dwItemLV:n dwItemRare:n dwShopAble:n nLog:n bCharged:n
    dwLinkKindBullet:n dwLinkKind:n dwAbilityMin:n dwAbilityMax:n eItemType:n wItemEatk:n dwParry:n
    dwblockRating:n nAddSkillMin:n nAddSkillMax:n dwAtkStyle:n dwWeaponType:n dwItemAtkOrder1:n
    dwItemAtkOrder2:n dwItemAtkOrder3:n dwItemAtkOrder4:n tmContinuousPain:n nShellQuantity:n dwRecoil:n
    dwLoadingTime:n nAdjHitRate:n fAttackSpeed:f dwDmgShift:n dwAttackRange:n nProbability:n
    dwDestParam1:n dwDestParam2:n dwDestParam3:n dwDestParam4:n dwDestParam5:n dwDestParam6:n
    nAdjParamVal1:n nAdjParamVal2:n nAdjParamVal3:n nAdjParamVal4:n nAdjParamVal5:n nAdjParamVal6:n
    dwChgParamVal1:n dwChgParamVal2:n dwChgParamVal3:n dwChgParamVal4:n dwChgParamVal5:n dwChgParamVal6:n
    nDestData1_1:n nDestData1_2:n nDestData1_3:n nDestData1_4:n nDestData1_5:n nDestData1_6:n
    dwActiveSkill:n dwActiveSkillLv:n dwActiveSkillRate:n dwReqMp:n dwReqFp:n dwReqDisLV:n dwReSkill1:n
    dwReSkillLevel1:n dwReSkill2:n dwReSkillLevel2:n dwSkillReadyType:n dwSkillReady:n _dwSkillRange:n
    dwSfxElemental:n dwSfxObj:n dwSfxObj2:n dwSfxObj3:n dwSfxObj4:n dwSfxObj5:n dwUseMotion:n
    dwCircleTime:n dwSkillTime:n dwExeTarget:n dwUseChance:n dwSpellRegion:n dwSpellType:n dwReferStat1:n
    dwReferStat2:n dwReferTarget1:n dwReferTarget2:n dwReferValue1:n dwReferValue2:n dwSkillType:n
    fResistElecricity:f fResistFire:f fResistWind:f fResistWater:f fResistEarth:f nEvildoing:n
    dwExpertLV:n dwExpertMax:n dwSubDefine:n dwExp:n dwComboStyle:n fFlightSpeed:f fFlightLRAngle:f
    fFlightTBAngle:f dwFlightLimit:n dwFFuelReMax:n dwAFuelReMax:n dwFuelRe:n dwLimitLevel1:n nReflect:n
    dwSndAttack1:n dwSndAttack2:n
    iconOpen:t szIcon:t iconClose:t dwQuestId:n textOpen:t szTextFileName:t textClose:t szCommand:t
    nMinLimitLevel:n nMaxLimitLevel:n nItemGroup:n nUseLimitGroup:n nMaxDuplication:n nEffectValue:n
    nTargetMinEnchant:n nTargetMaxEnchant:n bResetBind:n nBindCondition:n nResetBindCondition:n
    dwHitActiveSkillId:n dwHitActiveSkillLv:n dwHitActiveSkillProb:n dwHitActiveSkillTarget:n
    dwDamageActiveSkillId:n dwDamageActiveSkillLv:n dwDamageActiveSkillProb:n dwDamageActiveSkillTarget:n
    dwEquipActiveSkillId:n dwEquipActiveSkillLv:n dwSmelting:n dwAttsmelting:n dwGemsmelting:n dwPierce:n
    dwUprouse:n bAbsoluteTime:n dwItemGrade:n bCanTrade:n dwMainCategory:n dwSubCategory:n
    bCanHaveServerTransform:n bCanSavePotion:n bCanLooksChange:n bIsLooksChangeMaterial:n`;
  const SCHEMA = SCHEMA_SRC.trim().split(/\s+/).map(s => { const [name, k] = s.split(':'); return { name, kind: k }; });
  const FIELD_INDEX = new Map(SCHEMA.map((f, i) => [f.name, i]));
  const VALUES_PER_RECORD = SCHEMA.length + 3;   // + ver, dwID, szName  (= 175)

  function loadSpecItem(file, ctx) {
    const script = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const items = new Map();       // id -> item (later rows overwrite, like SetAtGrow)
    const rows = [];
    let stopped = null, skippedVer = 0;
    let ver = script.getNumber();
    while (!script.eof) {
      const rowStart = ver.start;
      const id = script.getNumber();
      if ((id.value >>> 0) === 0) {
        stopped = { start: id.start, end: id.end, after: rows.length ? rows[rows.length - 1].define : null };
        script.diag('S_ID_ZERO', 'BLOCK', `item id "${file.text.slice(id.start, id.end)}" resolves to 0: the server stops loading ${file.name} here, every later item is missing`, id.start, id.end);
        break;
      }
      const nameTok = script.getToken();
      const values = new Array(SCHEMA.length);
      const raw = new Array(SCHEMA.length);
      let truncated = false, end = nameTok.end;
      for (let i = 0; i < SCHEMA.length; i++) {
        const k = SCHEMA[i].kind;
        if (k === 't') {
          const t = script.getToken();
          values[i] = t.text; raw[i] = t.stringKey || t.raw || t.text;
          if (t.type === 'eof') truncated = true; else end = t.end;
        } else {
          const r = k === 'f' ? script.getFloat() : script.getNumber();
          values[i] = r.value; raw[i] = file.text.slice(r.start, r.end);
          if (r.eof) truncated = true; else end = r.end;
        }
      }
      const item = {
        ver: ver.value, id: id.value >>> 0, define: id.define || file.text.slice(id.start, id.end),
        nameKey: nameTok.stringKey || nameTok.raw || nameTok.text,
        name: nameTok.text.replace(/\s+$/, ''),
        values, raw, start: rowStart, end,
      };
      rows.push(item);
      if (truncated) script.diag('S_TRUNCATED', 'BLOCK', `${item.define}: the file ends in the middle of this record`, rowStart, end);
      if (item.ver <= SERVER_VER) {
        if (items.has(item.id)) {
          script.diag('S_DUP_ID', 'BLOCK', `${item.define} (${item.id}) appears twice: the later row silently replaces the earlier one`, rowStart, end, { name: item.define });
        }
        items.set(item.id, item);
      } else {
        skippedVer++;
        script.diag('S_VER', 'WARN', `${item.define}: version ${item.ver} > ${SERVER_VER}, the server skips this row`, rowStart, end, { name: item.define });
      }
      ver = script.getNumber();
    }
    return { file: file.name, items, rows, stopped, skippedVer, diags: script.diags };
  }

  const get = (item, field) => item.values[FIELD_INDEX.get(field)];
  const getRaw = (item, field) => item.raw[FIELD_INDEX.get(field)];

  FRE.specItem = { loadSpecItem, SCHEMA, FIELD_INDEX, VALUES_PER_RECORD, get, getRaw, SERVER_VER };
})(globalThis.FRE = globalThis.FRE || {});
