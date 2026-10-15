// Consumable Stats checks (task L). loaders/consumables.js reads the slots, loaders/consumables-sim.js what the server does.
(function (FRE) {
  'use strict';
  // SetDestParam's own cases (MoverParam.cpp:2525-2717): these work although some are >= MAX_ADJPARAMARY
  const SPECIAL = ['DST_RESIST_ALL', 'DST_STAT_ALLUP', 'DST_HPDMG_UP', 'DST_DEFHITRATE_DOWN', 'DST_LOCOMOTION', 'DST_MASTRY_ALL', 'DST_GOLD',
    'DST_HP_RECOVERY_RATE', 'DST_MP_RECOVERY_RATE', 'DST_FP_RECOVERY_RATE', 'DST_ALL_RECOVERY', 'DST_ALL_RECOVERY_RATE', 'DST_KILL_ALL',
    'DST_KILL_HP_RATE', 'DST_KILL_MP_RATE', 'DST_KILL_FP_RATE', 'DST_KILL_ALL_RATE', 'DST_ALL_DEC_RATE'];

  function consumableChecks(model, opts) {
    const ws = opts.ws, out = [], D = ws.defines.defines, F = 'Spec_Item.txt', MAX = FRE.consumablesSim.MAX_ADJ;
    const words = FRE.itemTooltip.dstWords(ws), special = new Set(SPECIAL.map(n => D.get(n)).filter(v => v !== undefined));
    const HP = D.get('DST_HP'), MP = D.get('DST_MP'), FP = D.get('DST_FP');
    const label = d => { const x = words.get(d); return x ? (x.word || x.define).replace(/[:\s]+$/, '') : (ws.defines.byValue('DST_', d) || `stat ${d}`); };
    const push = (c, code, severity, message, k) => out.push({ module: 'consumables', file: F, code, severity, start: c.item.start, end: c.item.end,
      key: `${code}|${c.define}|${k || ''}`, message });
    for (const c of model.items) {
      if (c.hard || c.path === 'food') continue;
      const on = c.slots.filter(s => s.on), t = c.time | 0, seen = new Map();
      if (!on.length) continue;
      if (t < 0 && c.path !== 'keep') push(c, 'CS_NO_TIME', 'WARN', `${c.name}: no buff time (${c.time === 0xFFFFFFFF ? '=' : c.time}): no buff is made, so its stats stay on until the player logs out.`);
      if (t < 0 && c.path === 'keep') push(c, 'CS_KEEP_REFUSED', 'WARN', `${c.name}: buff time ${c.time} is negative as a number: the buff is refused and the item does nothing.`);
      if (t === 0) push(c, 'CS_ZERO_TIME', 'WARN', `${c.name}: buff time 0: the buff ends at once (the stats flash on and off).`);
      for (const s of on) {
        if (s.dst === 0) push(c, 'CS_DST_ZERO', 'WARN', `${c.name}: slot ${s.i} is stat 0 (an unknown name becomes 0): it does nothing.`, s.i);
        else if (s.dst === HP && c.path !== 'keep') push(c, 'CS_HP_NOTHING', 'WARN', `${c.name}: slot ${s.i} is HP: an item's HP slot does nothing when used (ApplyParam's HP branch is for skills).`, s.i);
        else if ((s.dst === MP || s.dst === FP || s.dst === HP) && t >= 0) push(c, 'CS_INSTANT_LEFTOVER', 'WARN', `${c.name}: slot ${s.i} is ${label(s.dst)}: it is an instant change, yet when the buff ends ${s.adj} is taken off the stat table, leaving a leftover.`, s.i);
        else if ((s.dst >>> 0) >= MAX && !special.has(s.dst)) push(c, 'CS_DST_DROPPED', 'WARN', `${c.name}: slot ${s.i} is ${label(s.dst)} (${s.dst}): stats from ${MAX} up are dropped unless they have their own code.`, s.i);
        if (seen.has(s.dst)) push(c, 'CS_SLOT_DUP', 'INFO', `${c.name}: ${label(s.dst)} is in slot ${seen.get(s.dst)} and slot ${s.i}: both are added.`, s.dst);
        else seen.set(s.dst, s.i);
      }
    }
    return out;
  }

  FRE.consumableChecks = consumableChecks;
})(globalThis.FRE = globalThis.FRE || {});
