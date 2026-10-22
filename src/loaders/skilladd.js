// propSkillAdd.csv loader, ported from CProject::LoadPropAddSkill (_Common/Project.cpp:3014-3105): every value is read with
// GetNumber( TRUE ) (comma mode, core/csv-lexer.js), 36 values per row in the order below; the first value of a row (the SA_ id)
// resolving to 0 ends the file (:3023 "if( i == 0 ) break"); SetAtGrow( i ): a later row with the same id replaces the earlier one.
// After a row (__SKILL_0706): '=' (NULL_ID) in dwAbilityMinPVP / MaxPVP, nProbabilityPVP, dwActiveSkillRatePVP takes the PvE value;
// dwCooldown '=' takes propSkill.txt's dwSkillReady (dwCastingTime / 4 when that skill's nVer < 9).
// Proven edits of this file: 8cfef4e7 (52 buffs + the Client copy), f8754f67 (self-buffs + tooltips), 26ea21f4 (a cooldown '=').
(function (FRE) {
  'use strict';
  const NULL_ID = 0xFFFFFFFF;
  const FIELDS = ['dwID', 'dwName', 'dwSkillLvl', 'dwAbilityMin', 'dwAbilityMax', 'dwAbilityMinPVP', 'dwAbilityMaxPVP', 'dwAttackSpeed',
    'dwDmgShift', 'nProbability', 'nProbabilityPVP', 'dwTaunt', 'dwDestParam1', 'dwDestParam2', 'nAdjParamVal1', 'nAdjParamVal2',
    'dwChgParamVal1', 'dwChgParamVal2', 'nDestData1_1', 'nDestData1_2', 'nDestData1_3', 'dwActiveSkill', 'dwActiveSkillRate',
    'dwActiveSkillRatePVP', 'nReqMp', 'nReqFp', 'dwCooldown', 'dwCastingTime', 'dwSkillRange', 'dwCircleTime', 'dwPainTime',
    'dwSkillTime', 'nSkillCount', 'dwSkillExp', 'dwExp', 'dwComboSkillTime'];
  const IX = new Map(FIELDS.map((f, i) => [f, i]));

  // file: SourceFile; ctx: { defines, skillReady(siId) -> { ready, ver } | null }
  // -> { rows: [{ id, sa, si, siName, lvl, toks[36], v: {field: value after fallbacks}, start, end, line }], byId, bySkill: Map si -> rows (by level), stopped, diags }
  function load(file, ctx) {
    const D = ctx.defines, toks = FRE.csvLexer.tokens(file.text, D), diags = [];
    const rows = [], byId = new Map();
    let stopped = null;
    for (let k = 0; k < toks.length;) {
      const t0 = toks[k];
      if ((t0.value >>> 0) === 0) {
        stopped = { start: t0.start, end: t0.end, after: rows.length ? rows[rows.length - 1].sa : null };
        diags.push({ code: 'CB_ID_ZERO', severity: 'BLOCK', file: file.name, start: t0.start, end: t0.end,
          message: `"${t0.text.split('\n')[0]}" is not a known SA_ name (it reads as 0): the server stops reading propSkillAdd.csv here, every later skill level is missing` });
        break;
      }
      const tk = toks.slice(k, k + FIELDS.length);
      k += FIELDS.length;
      const v = {};
      FIELDS.forEach((f, i) => { v[f] = tk[i] ? tk[i].value : 0; });
      const row = { id: t0.value >>> 0, sa: t0.text, si: v.dwName, siName: tk[1] ? tk[1].text : '', lvl: v.dwSkillLvl, toks: tk, v,
        start: t0.start, end: tk[tk.length - 1].end, short: tk.length < FIELDS.length };
      if (row.short) diags.push({ code: 'CB_FIELDS', severity: 'BLOCK', file: file.name, start: row.start, end: row.end,
        message: `${row.sa}: the file ends after ${tk.length} of the ${FIELDS.length} values of this row` });
      if ((v.dwAbilityMinPVP >>> 0) === NULL_ID) v.dwAbilityMinPVP = v.dwAbilityMin;
      if ((v.dwAbilityMaxPVP >>> 0) === NULL_ID) v.dwAbilityMaxPVP = v.dwAbilityMax;
      const sp = ctx.skillReady ? ctx.skillReady(v.dwName) : null;
      if (sp && (v.dwCooldown >>> 0) === NULL_ID) {
        v.dwCooldown = sp.ready;
        if (sp.ver < 9 && (v.dwCastingTime >>> 0) !== NULL_ID) v.dwCastingTime = Math.trunc(v.dwCastingTime / 4);
      }
      if ((v.nProbabilityPVP >>> 0) === NULL_ID) v.nProbabilityPVP = v.nProbability;
      if ((v.dwActiveSkillRatePVP >>> 0) === NULL_ID) v.dwActiveSkillRatePVP = v.dwActiveSkillRate;
      rows.push(row);
      byId.set(row.id, row);
    }
    // a row has exactly 36 values on its own line (a line with more or fewer shifts every later row)
    const lines = new Map();
    for (const r of rows) for (const t of r.toks) { const ln = file.lineOf ? file.lineOf(t.start) : 0; lines.set(ln, (lines.get(ln) || 0) + 1); }
    for (const r of rows) {
      if (r.short || !file.lineOf) continue;
      const a = file.lineOf(r.toks[0].start), b = file.lineOf(r.toks[r.toks.length - 1].end - 1);
      if (a !== b || lines.get(a) !== FIELDS.length) diags.push({ code: 'CB_FIELDS', severity: 'BLOCK', file: file.name, start: r.start, end: r.end,
        message: `${r.sa}: this line does not hold exactly ${FIELDS.length} values: the server reads the values in order, so this row and every later one get the wrong numbers` });
    }
    const bySkill = new Map();
    for (const r of byId.values()) { if (!bySkill.has(r.si)) bySkill.set(r.si, []); bySkill.get(r.si).push(r); }
    for (const l of bySkill.values()) l.sort((a, b) => a.lvl - b.lvl);
    return { file: file.name, rows, byId, bySkill, stopped, diags };
  }

  FRE.skillAdd = { load, FIELDS, IX, NULL_ID };
})(globalThis.FRE = globalThis.FRE || {});
