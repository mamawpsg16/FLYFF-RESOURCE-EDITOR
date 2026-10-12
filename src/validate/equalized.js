// Equalized PvP checks (task "PvP Events"): EqualizedPvP.inc and EqualizedPresets.inc. The readers are loaders/equalized.js, what a
// player gets loaders/equalized-sim.js; each check cites the C++ (WORLDSERVER/EqualizedPvP.cpp, ec3657c7).
(function (FRE) {
  'use strict';
  const E = () => FRE.equalized, S = () => FRE.equalizedSim;
  const EV = 'EqualizedPvP.inc', PR = 'EqualizedPresets.inc';

  function equalizedChecks(eq, opts) {
    const out = [], ws = opts.ws;
    if (!eq || !eq.present) return out;
    const D = ws.defines.defines, items = ws.items.items;
    const push = (file, code, severity, sp, message, k) => out.push({ module: 'pvp', file, code, severity, start: sp ? sp.start : 0, end: sp ? sp.end : 0, key: `${code}|${k}`, message });
    // ---- EqualizedPvP.inc: ReadConfig (EqualizedPvP.cpp:121)
    const ev = eq.events;
    if (ev.missing) push(PR, 'EQ_NO_EVENTS', 'WARN', null, 'EqualizedPvP.inc not found: the WorldServer keeps every event normal (no class picker, own characters).', 'missing');
    else if (ev.failed) push(EV, 'EQ_EVENTS_BAD', 'BLOCK', ev.errorAt, `EqualizedPvP.inc: ${ev.error}. /eqreload changes nothing (and at server start every event stays normal).`, ev.error);
    else for (const e of E().EVENTS) {
      const x = ev.events[e];
      if (x.line) x.caps.forEach((cap, c) => {
        if (x.on && cap === 0) push(EV, 'EQ_CAP_ZERO', 'INFO', x.line.caps[c], `${E().EVENT_LABEL[e]}: ${E().CLASSES[c].label} has a limit of 0, so nobody can pick it (its button is greyed).`, `${e}|${c}`);
      });
    }
    const anyOn = !ev.missing && !ev.failed && E().EVENTS.some(e => ev.events[e].on);
    // ---- EqualizedPresets.inc: LoadPresetFile + EqPlaceItem
    const pr = eq.presets;
    if (pr.missing) { if (anyOn) push(EV, 'EQ_NO_PRESETS', 'WARN', null, 'EqualizedPresets.inc not found: everyone enters naked ("No gear preset for this class yet").', 'missing'); return out; }
    if (pr.stopped) push(PR, 'EQ_PRESETS_STOP', 'BLOCK', pr.stopped.at, `${pr.stopped.message}. Every preset after this point is missing in the game.`, pr.stopped.message);
    for (const p of pr.problems) push(PR, 'EQ_PRESET_WORD', 'WARN', p.at, `${p.message} (the server writes it to Server\\error_*.txt).`, `${p.preset.header.start}|${p.message}`);
    const seen = new Map();
    for (const b of pr.presets) {
      const k = `${b.cls}|${b.sex}`, where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()}`;
      if (seen.has(k)) push(PR, 'EQ_PRESET_TWICE', 'WARN', seen.get(k).header, `${where} is written twice: the server keeps the later block and drops this one.`, k);
      seen.set(k, b);
    }
    for (const b of pr.byKey.values()) {
      const where = `${E().CLASSES[b.cls].label} ${E().SEXES[b.sex].toLowerCase()}`;
      const sim = S().enter(b, { defines: D, items });
      for (const pl of sim.placed) {
        const it = pl.item, rec = it.id >= 0 ? items.get(it.id >>> 0) : null, at = it.span, key = `${b.cls}|${b.sex}|${it.span.start}`;
        if (it.raisedPet !== undefined) {
          if (pl.why === 'badPet') push(PR, 'EQ_RAISED_PET', 'BLOCK', it.idSpan, `${where}: RAISEDPET "${it.define}" is not a pet kind (PK_TIGER, PK_LION, PK_RABBIT, PK_FOX, PK_DRAGON, PK_GRIFFIN, PK_UNICORN): the server skips it.`, key);
          else if (pl.why === 'bag' && pl.sec !== 'BAG') push(PR, 'EQ_PET_TWICE', 'WARN', at, `${where} ${pl.sec}: a 2nd raised pet in one set stays in the bag (the switch holds one).`, key);
          continue;
        }
        const nm = rec ? (rec.name || rec.define) : (it.define || String(it.id));
        if (pl.why === 'unknown') { push(PR, 'EQ_ITEM_UNKNOWN', 'BLOCK', it.idSpan, `${where}: "${it.define || it.id}" is not an item: the server skips it.`, key); continue; }
        if (pl.why === 'notWearable') { push(PR, 'EQ_ITEM_NOT_WORN', 'BLOCK', at, `${where} ${pl.sec}: ${nm} can't be worn, the server skips it (put it in BAG).`, key); continue; }
        if (pl.why === 'bag' && pl.sec !== 'BAG') push(PR, 'EQ_PET_TWICE', 'WARN', at, `${where} ${pl.sec}: a 2nd buff pet in one set stays in the bag (the switch holds one).`, key);
        if (pl.why === 'buffPet' || (pl.why === 'bag' && pl.sec !== 'BAG')) continue;
        if (pl.why === 'slotTaken') push(PR, 'EQ_SLOT_TWICE', 'WARN', at, `${where} ${pl.sec}: two items for the same slot, ${nm} stays in the bag.`, key);
        if (pl.sec !== 'BAG') for (const w of S().wearIssues(rec, b.cls, b.sex, D)) push(PR, 'EQ_ITEM_WEAR', 'WARN', at, `${where} ${pl.sec}: ${nm}: ${w}. The player gets it but can't use it.`, `${key}|${w}`);
        if (it.upgrade < 0 || it.upgrade > 20) push(PR, 'EQ_UPGRADE', 'WARN', at, `${where}: ${nm} UPGRADE ${it.upgrade}: the game's upgrades are 0 - 20 (armor and weapons stop at +10).`, key);
        if (it.elem && !S().elementOk(rec, D)) push(PR, 'EQ_ELEMENT_PART', 'WARN', at, `${where}: ${nm} has an element, but in the game only a suit or a weapon can have one.`, `${key}|ep`);
        if (it.elem && (it.elemLv < 0 || it.elemLv > 20)) push(PR, 'EQ_ELEMENT', 'WARN', at, `${where}: ${nm} element level ${it.elemLv}: the game's element levels are 0 - 20.`, key);
        if (it.cards.length) {
          const so = S().sockets(rec, D);
          if (it.cards.length > so.cap) push(PR, 'EQ_CARDS', 'WARN', at, `${where}: ${nm} has ${it.cards.length} ${so.what}s; this item takes ${so.cap ? `at most ${so.cap}` : 'none'}.`, key);
          it.cards.forEach((c, i) => {
            const cr = c >= 0 ? items.get(c >>> 0) : null;
            if (!cr) push(PR, 'EQ_CARD_UNKNOWN', 'WARN', at, `${where}: ${nm} socket ${i + 1} is not an item.`, `${key}|${i}`);
            else if (so.kind3 !== null && FRE.specItem.get(cr, 'dwItemKind3') !== so.kind3) push(PR, 'EQ_CARD_KIND', 'WARN', at, `${where}: ${nm} socket ${i + 1}: ${cr.name || cr.define} does not fit this item (it takes ${so.what === 'bead' ? 'buff pet beads' : so.cap === 4 ? 'suit cards' : 'weapon / shield cards'}).`, `${key}|${i}`);
          });
        }
      }
    }
    if (anyOn) for (let c = 0; c < E().CLASSES.length; c++) for (let x = 0; x < 2; x++) {
      if (pr.byKey.has(`${c}|${x}`)) continue;
      const pickable = E().EVENTS.some(e => ev.events[e].on && ev.events[e].caps[c] > 0);
      if (pickable) push(PR, 'EQ_PRESET_MISSING', 'WARN', null, `No preset for ${E().CLASSES[c].label} ${E().SEXES[x].toLowerCase()}: a player who picks it enters naked.`, `${c}|${x}`);
    }
    return out;
  }

  FRE.equalizedChecks = equalizedChecks;
})(globalThis.FRE = globalThis.FRE || {});
