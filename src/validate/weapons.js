// Weapon effect checks (task G part 2). loaders/weapons.js reads the slots, loaders/weapons-sim.js what the server does.
(function (FRE) {
  'use strict';

  function weaponChecks(model, opts) {
    const ws = opts.ws, out = [], D = ws.defines.defines, F = 'Spec_Item.txt';
    const env = FRE.weaponsSim.envFor(ws, model), ASPD = env.ASPD;
    const push = (w, code, severity, message, k) => out.push({ module: 'weapons', file: F, code, severity, start: w.item.start, end: w.item.end,
      key: `${code}|${w.define}|${k || ''}`, message });
    const label = d => { const x = env.words.get(d); return x ? (x.word || x.define).replace(/[:\s]+$/, '') : `stat ${d}`; };
    for (const w of model.weapons) {
      const on = w.slots.filter(s => s.on), seen = new Map();
      for (const s of on) {
        if (s.dst === 0) push(w, 'WE_DST_ZERO', 'WARN', `${w.name}: slot ${s.i} is stat 0 (an unknown name becomes 0): it does nothing.`, s.i);
        else if (seen.has(s.dst)) push(w, 'WE_SLOT_DUP', 'WARN', `${w.name}: ${label(s.dst)} is in slot ${seen.get(s.dst)} and slot ${s.i}: both are added (${s.adj} + ${on.find(x => x.i === seen.get(s.dst)).adj}).`, s.dst);
        else seen.set(s.dst, s.i);
        // DST_ATTACKSPEED is in 1/20 % (MoverAttack.cpp:177): a small number is almost nothing (the yoyo fix cfe2740e moved those to ATTACKSPEED_RATE)
        if (s.dst === ASPD && s.adj > 0 && s.adj < 20) push(w, 'WE_ASPD_SMALL', 'WARN', `${w.name}: Attack Speed ${s.adj} is in 1/20 % units = +${s.adj / 20}% real. For a whole percent use DST_ATTACKSPEED_RATE (or ${s.adj * 20} here).`, s.i);
      }
      if (model.rarity && on.some(s => s.dst === ASPD)) {
        const top = [...env.tiers.values()].sort((a, b) => b.level - a.level)[0];
        if (top) push(w, 'WE_RARITY_ASPD', 'INFO', `${w.name}: a Weapon Rarity tier adds its % bonus to the Attack Speed slot in raw units: ${top.name} (+${top.pct}) = +${top.pct / 20}% real, though the tooltip says (+${top.pct}%).`);
      }
    }
    // the doc's rule: raw Attack Speed must not drop from tier 1 to tier 2 of the ATK track (same weapon type and hands)
    const key = w => `${w.type}|${FRE.specItem.get(w.item, 'dwHanded')}`;
    const aspd = w => w.slots.filter(s => s.on && s.dst === ASPD).reduce((a, s) => a + s.adj, 0);
    const t1 = new Map((model.families.get('LUZA') || []).filter(w => !w.twinOf).map(w => [key(w), w]));
    for (const w of (model.families.get('LEAGENDG') || []).filter(x => !x.twinOf)) {
      const a = t1.get(key(w));
      if (a && aspd(a) > 0 && aspd(w) < aspd(a)) push(w, 'WE_TIER_ASPD', 'INFO', `${w.name} (tier 2) has less raw Attack Speed (${aspd(w)}) than ${a.name} (tier 1, ${aspd(a)}).`);
    }
    return out;
  }

  FRE.weaponChecks = weaponChecks;
})(globalThis.FRE = globalThis.FRE || {});
