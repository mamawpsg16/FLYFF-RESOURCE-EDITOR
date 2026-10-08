// Is a client patch (docs/patches/*.diff) built into the game? (Save's "After saving" list, core/after-save.js)
// With FLYFF-V19-SOURCE picked, the patched C++ file is READ (never written) for one line the patch adds:
//   npc-board.diff     -> Source/Source/_Interface/WndWorld.cpp        "NpcBoard_%d.inc"
//   donation-tree.diff -> Source/Source/_Interface/WndDonationShop.cpp "DS_LoadTreeOrder"
// in-source: the line is there (Neuz may still need a build); missing: not applied; unknown: no source here
// (test-data). "I built it into Neuz" is a tickbox remembered in this browser (localStorage): 'built'.
(function (FRE) {
  'use strict';
  const KEY = id => 'fre.patchBuilt.' + id;

  function ticked(id) {
    try { return localStorage.getItem(KEY(id)) === '1'; } catch (e) { return false; }
  }
  function setTicked(id, on) {
    try { on ? localStorage.setItem(KEY(id), '1') : localStorage.removeItem(KEY(id)); return true; } catch (e) { return false; }
  }

  // layout: FRE.layout.detectLayout's result -> { 'npc-board': 'in-source' | 'missing' | 'unknown', ... }
  async function inSource(layout) {
    const out = {};
    for (const [id, p] of Object.entries(FRE.afterSave.PATCHES)) {
      out[id] = 'unknown';
      if (!layout || layout.kind !== 'real') continue;
      try {
        const parts = ('Source/Source/' + p.src).split('/'), name = parts.pop();
        const dir = await FRE.fsa.dirAt(layout.root, parts.join('/'));
        const fh = dir && (await FRE.fsa.findFiles(dir, [name])).get(name.toLowerCase());
        if (!fh) continue;
        const text = new TextDecoder('latin1').decode((await FRE.fsa.readHandle(fh)).bytes);
        out[id] = text.includes(p.marker) ? 'in-source' : 'missing';
      } catch (e) { out[id] = 'unknown'; }
    }
    return out;
  }

  // the state compute() uses: a tick counts unless the source says the patch is not applied
  function effective(found) {
    const out = {};
    for (const id of Object.keys(FRE.afterSave.PATCHES)) {
      const s = (found && found[id]) || 'unknown';
      out[id] = s !== 'missing' && ticked(id) ? 'built' : s;
    }
    return out;
  }

  FRE.patchState = { inSource, effective, ticked, setTicked };
})(globalThis.FRE = globalThis.FRE || {});
