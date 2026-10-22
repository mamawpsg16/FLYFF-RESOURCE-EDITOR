// Class Buffs edits (2a): splices on one propSkillAdd.csv row (a value = one comma token, written as plain digits, a DST_ name or
// '=', the way 8cfef4e7 / f8754f67 wrote them) and on the skill's tooltip text in propSkill.txt.txt (the rest of the IDS line,
// f8754f67 changed 21 of them). Nothing else in the row or the line moves. The Client copies get the same change (core/client-sync.js:
// Client/propSkillAdd.csv is the same content with LF in git, CRLF on the Windows PC).
(function (FRE) {
  'use strict';
  const T = FRE.textOps, IX = () => FRE.skillAdd.IX;
  const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

  // one value of a row: field (FIELDS name), v = a whole number, a DST_ / other define name, or '=' (empty)
  function setField(text, row, field, v) {
    const i = IX().get(field);
    if (i === undefined) throw new Error(`unknown field ${field}`);
    const t = row.toks[i];
    if (!t) throw new Error(`${row.sa} has no value for ${field}`);
    let ins;
    if (v === '=' || v === null) ins = '=';
    else if (typeof v === 'number') { T.checkAmount(v, -2147483647, 2147483647, field); ins = String(v); }
    else if (NAME_RE.test(v)) ins = v;
    else throw new Error('Type a whole number');
    if (text.slice(t.start, t.end) === ins) return [];
    return [{ start: t.start, end: t.end, insert: ins }];
  }

  // stat slot i (1 / 2): { dstName, adj } or null (empty both: '=' '=')
  function setStat(text, row, i, v) {
    T.checkAmount(i, 1, 2, 'The stat slot');
    if (v && !NAME_RE.test(v.dstName || '')) throw new Error('Pick a stat');
    if (v && (!Number.isInteger(v.adj) || v.adj < -2147483647 || v.adj > 2147483647)) throw new Error('The amount must be a whole number');
    return [...setField(text, row, 'dwDestParam' + i, v ? v.dstName : '='), ...setField(text, row, 'nAdjParamVal' + i, v ? v.adj : '=')]
      .sort((a, b) => a.start - b.start);
  }

  // duration in ms (dwSkillTime); cooldown in ms (dwCooldown, '=' = the skill's own dwSkillReady)
  const setDuration = (text, row, ms) => setField(text, row, 'dwSkillTime', ms);
  const setCooldown = (text, row, ms) => setField(text, row, 'dwCooldown', ms === null ? '=' : ms);

  // the tooltip text: the rest of the IDS line in propSkill.txt.txt (meta from FRE.loadStringFile: start / end of the value)
  function setText(meta, value) {
    const v = String(value).replace(/[\r\n]+/g, ' ').trim();
    if (!v) throw new Error('The text cannot be empty');
    if (!meta) throw new Error('This skill has no line in propSkill.txt.txt');
    return [{ start: meta.start, end: meta.end, insert: v }];
  }

  // 2b: one stat slot's amount on every level, in step with the top level: level L gets round(old_L x newTop / oldTop) (the way
  // d03a6e4f scaled the decided buffs); only rows that hold the same stat in that slot change. rows: the skill's rows, top = the last.
  function scaleLevels(text, rows, i, newTop) {
    T.checkAmount(i, 1, 2, 'The stat slot');
    if (!Number.isInteger(newTop)) throw new Error('The amount must be a whole number');
    const top = rows[rows.length - 1], dst = top.v['dwDestParam' + i] >>> 0, old = top.v['nAdjParamVal' + i] | 0;
    if (dst === FRE.skillAdd.NULL_ID) throw new Error('This slot is empty at the top level');
    if (old === 0) throw new Error('The top level amount is 0: nothing to scale from, set each level by itself');
    const out = [];
    for (const r of rows) {
      if ((r.v['dwDestParam' + i] >>> 0) !== dst) continue;
      const v = r === top ? newTop : Math.round((r.v['nAdjParamVal' + i] | 0) * newTop / old);
      out.push(...setField(text, r, 'nAdjParamVal' + i, v));
    }
    return out.sort((a, b) => a.start - b.start);
  }

  // 2b attack skills: damage (dwAbilityMin / Max) and PvP power (dwAbilityMinPVP / MaxPVP; null = '=', the PvE value)
  function setAbility(text, row, min, max, pvp) {
    const k = pvp ? 'PVP' : '';
    if (pvp && (min === null) !== (max === null)) throw new Error('Set both PvP numbers, or clear both');
    if (min !== null && max !== null && min > max) throw new Error('The lowest damage is above the highest');
    return [...setField(text, row, 'dwAbilityMin' + k, min === null ? '=' : min), ...setField(text, row, 'dwAbilityMax' + k, max === null ? '=' : max)]
      .sort((a, b) => a.start - b.start);
  }

  FRE.classBuffsOps = { setField, setStat, setDuration, setCooldown, setText, scaleLevels, setAbility };
})(globalThis.FRE = globalThis.FRE || {});
