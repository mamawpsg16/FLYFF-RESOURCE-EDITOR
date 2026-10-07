// Rules for new exchange menus (edit/menu-ops.js). They judge only the new menus against the loaded data.
// BLOCK = cannot be created. Limits: MAX_MOVER_MENU 350 (compiled; AddMenu writes m_abMoverMenu[id] with no
// bounds check, Project.cpp:3410), 30 SETs per menu (__NEW_EXCHANGE_V19, Exchange.cpp:209), PAY chances out of
// 1,000,000 (Exchange.cpp:154), and an item the reward line names must exist or the server crashes (GetProp()).
(function (FRE) {
  'use strict';
  const NAME = /^MMI_[A-Z0-9_]{1,40}$/;
  const TID_NAME = /^TID_[A-Z0-9_]{1,60}$/;
  // textClient texts go into a CString (CScript::LoadString): no 63-character cap like an NPC name, 255 kept as a sanity limit
  const textProblem = s => {
    if (typeof s === 'string' && s.length > 255) return `is ${s.length} characters long (255 at most)`;
    const p = FRE.newNpcText(s);
    return p && /characters long/.test(p) ? null : p;
  };

  // Why a new menu name cannot be used, or null. others: names of the other new menus in the same form.
  function menuNameProblem(ws, name, others = []) {
    const D = ws.defines.defines;
    if (!NAME.test(name || '')) return `Menu name "${name}" must be MMI_ followed by capital letters, digits or _ (40 at most).`;
    if (D.has(name) || D.has('TID_' + name) || others.includes(name)) return `${name} (or TID_${name}) already exists: choose another name.`;
    return null;
  }
  // "Bob's Weapons" -> MMI_BOBS_WEAPONS; MMI_BOBS_WEAPONS_2 (_3 …) when taken. '' when the label has no letter or digit.
  function nameFromLabel(ws, label, others = []) {
    const base = String(label || '').toUpperCase().replace(/'/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!base) return '';
    for (let n = 1; ; n++) {
      const tail = n === 1 ? '' : '_' + n;
      const name = 'MMI_' + base.slice(0, 40 - tail.length).replace(/_+$/, '') + tail;
      if (!menuNameProblem(ws, name, others)) return name;
    }
  }

  // spec as in menuOps.newMenusPlan -> [{ code, severity, field, message, key }]
  function checkNewMenus(ws, spec) {
    const out = [];
    const add = (code, severity, field, message) => out.push({ code, severity, field, message, key: `${code}|${field}`, module: 'npc' });
    const D = ws.defines.defines;
    const missing = FRE.menuOps.FILES.filter(n => !ws.files.get(n) || !ws.isEditable(n));
    if (missing.length) add('NM_FILES', 'BLOCK', 'menus', `A new menu writes ${missing.join(', ')}, which this task cannot change (not found or read-only).`);
    const list = ws.chars && ws.chars.byKey.get(String(spec.npcKey || '').toLowerCase());
    const npc = list && list[list.length - 1];
    if (!npc) add('NM_NPC', 'BLOCK', 'npc', `There is no NPC ${spec.npcKey}.`);
    else if (npc.file.toLowerCase() !== 'character.inc') add('NM_NPC', 'BLOCK', 'npc', `${npc.key} is in ${npc.file}; only NPCs in character.inc can get a new menu here.`);
    const menus = spec.menus || [];
    if (!menus.length) add('NM_NONE', 'BLOCK', 'menus', 'No menu to add.');
    const free = FRE.menuOps.freeMenuIds(ws);
    if (free.length < menus.length) add('NM_ID_FULL', 'BLOCK', 'menus', `Only ${free.length} free menu ids are left under MAX_MOVER_MENU (350, compiled); ${menus.length} are needed.`);
    const seen = new Set();
    menus.forEach((m, i) => {
      const f = `menu ${i + 1}`;
      const np = menuNameProblem(ws, m.name, [...seen]);
      if (np) add('NM_NAME', 'BLOCK', f, np);
      seen.add(m.name);
      const tp = textProblem(m.label);
      if (tp) add('NM_TEXT', 'BLOCK', f, `Label of ${m.name} ${tp}.`);
      const sets = m.sets || [];
      if (!sets.length) add('NM_EMPTY', 'WARN', f, `${m.name} has no exchange yet: its window opens empty.`);
      if (sets.length > 30) add('NM_SET_CAP', 'BLOCK', f, `${m.name} has ${sets.length} exchanges; the server keeps only the first 30.`);
      sets.forEach((s, k) => {
        const g = `${f} exchange ${k + 1}`;
        if (!(s.cond || []).length) add('NM_RECIPE', 'BLOCK', g, `${m.name} exchange ${k + 1} has no ingredient: the reward would be free.`);
        if (!(s.pay || []).length) add('NM_RECIPE', 'BLOCK', g, `${m.name} exchange ${k + 1} has no reward: an empty PAY crashes the server and the client.`);
        for (const [d, n] of s.cond || []) {
          if (d !== 'PENYA' && !D.has(d)) add('NM_ITEM', 'BLOCK', g, `Ingredient ${d} is not defined: the server reads it as -1 and nobody can trade.`);
          if (!(Number.isInteger(n) && n >= 1)) add('NM_QTY', 'BLOCK', g, `Ingredient ${d}: quantity ${n} must be a whole number, 1 or more.`);
        }
        const payNum = s.payNum === undefined ? 1 : s.payNum;
        if ((s.pay || []).length && !(Number.isInteger(payNum) && payNum >= 1 && payNum <= s.pay.length))
          add('NM_PAYNUM', 'BLOCK', g, `${m.name} exchange ${k + 1} gives ${payNum} of ${s.pay.length} rewards: it must give 1 to ${s.pay.length}.`);
        let total = 0;
        for (const [d, n, p] of s.pay || []) {
          const id = D.get(d);
          if (id === undefined || !ws.itemById(id)) add('NM_ITEM', 'BLOCK', g, `Reward ${d} is not in defineItem.h and Spec_Item.txt: the server crashes when it is paid out.`);
          if (!(Number.isInteger(n) && n >= 1)) add('NM_QTY', 'BLOCK', g, `Reward ${d}: quantity ${n} must be a whole number, 1 or more.`);
          total += p;
        }
        if ((s.pay || []).length && total !== 1000000) add('NM_CHANCE', 'WARN', g, `${m.name} exchange ${k + 1}: the chances add up to ${total.toLocaleString('en-US')}, not 1,000,000 (the server cuts or tops up the last line).`);
      });
    });
    const r = spec.results || {};
    if (r.add) {
      if (r.add.length !== 2) add('NM_RESULT', 'BLOCK', 'results', 'Give two result messages: success, then failure.');
      r.add.forEach((x, i) => {
        if (!TID_NAME.test(x.name || '') || D.has(x.name)) add('NM_RESULT', 'BLOCK', 'results', `Result text name "${x.name}" must be a new TID_ name.`);
        const tp = textProblem(x.text);
        if (tp) add('NM_TEXT', 'BLOCK', 'results', `${i ? 'Failure' : 'Success'} message ${tp}.`);
      });
    } else if (!r.tids || r.tids.length !== 2 || r.tids.some(t => !D.has(t))) add('NM_RESULT', 'BLOCK', 'results', 'Pick two existing result texts (success, failure) or write two new ones.');
    return out;
  }

  FRE.validateNewMenus = checkNewMenus;
  FRE.menuNameProblem = menuNameProblem;
  FRE.menuNameFromLabel = nameFromLabel;
})(globalThis.FRE = globalThis.FRE || {});
