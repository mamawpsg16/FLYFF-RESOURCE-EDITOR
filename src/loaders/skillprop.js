// propSkill.txt loader: CProject::LoadPropItemEx (_Common/ProjectCmn.cpp:934, used for propSkill.txt by LoadSkill, Project.cpp:445,
// __VER >= 16). The same token stream as Spec_Item.txt's LoadPropItem (loaders/specitem.js), with two differences read from the C++:
//   - 3 stat slots, not 6: dwDestParam[0..2], nAdjParamVal[0..2], dwChgParamVal[0..2], nDestData1[0..2] (__PROP_0827)
//   - after szCommand (here: the skill's description key): dwBuffTickType (__VER >= 16), dwMonsterGrade, dwEquipItemKeepSkill
//     (>= 18), bCanUseActionSlot (>= 19); none of the Spec_Item fields after szCommand.
// dwID == 0 ends the file (:952 Error + return FALSE). Rows with nVer > 19 are skipped (:1172).
(function (FRE) {
  'use strict';
  const SP = () => FRE.specItem;
  let schema = null;
  function SCHEMA() {
    if (schema) return schema;
    const out = [];
    for (const f of SP().SCHEMA) {
      if (/^(dwDestParam|nAdjParamVal|dwChgParamVal)[4-6]$/.test(f.name) || /^nDestData1_[4-6]$/.test(f.name)) continue;
      out.push(f);
      if (f.name === 'szCommand') break;
    }
    for (const n of ['dwBuffTickType', 'dwMonsterGrade', 'dwEquipItemKeepSkill', 'bCanUseActionSlot']) out.push({ name: n, kind: 'n' });
    return (schema = out);
  }
  let index = null;
  const IX = () => index || (index = new Map(SCHEMA().map((f, i) => [f.name, i])));
  const get = (sk, field) => sk.values[IX().get(field)];

  // -> { items: Map id -> skill row (Spec_Item-like: { id, define, nameKey, name, values, raw, start, end }), rows, stopped, diags }
  function load(file, ctx) {
    return SP().loadSpecItem(file, ctx, { schema: SCHEMA() });
  }

  FRE.skillProp = { load, get, SCHEMA };
})(globalThis.FRE = globalThis.FRE || {});
