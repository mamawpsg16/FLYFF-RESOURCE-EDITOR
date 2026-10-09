// The "Where" and "Model" fields of an NPC form, shared by "+ New NPC" (ui/new-npc.js) and
// "Edit where / model" of an existing NPC (ui/npc-edit.js). Names are the ones players read
// (regions, NPC names); the spot is what /position prints in game.
//   form:  { region, map, x, y, z, angle, nextTo, model }
//   opts:  { rerender() — build the form again; changed() — re-run checks and preview only;
//            onlyMap — offer only this map's regions (a move stays on its map); skipAt — the record being moved;
//            cache — an object kept while the dialog is open (model lists are read once) }
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const SIM = () => FRE.newNpcSim;
  const note = t => h('span.muted.small', t);
  const row = (text, req, ...el) => h('div.nn-row', FRE.ui.fieldLabel(text, req), ...el);

  function cached(ws, cache) {
    if (cache.ws === ws) return cache;
    Object.assign(cache, { ws, regions: SIM().regions(ws), visible: SIM().visibleNpcs(ws).map(p => ({ p, w: SIM().whereAt(ws, p.map, p.x, p.z) })) });
    return cache;
  }
  const regionOf = (c, form) => c.regions.find(r => r.value === form.region) || c.regions[0];

  // The region a spot is in (for an existing NPC: its own place), or null.
  function regionAt(ws, map, x, z, cache = {}) {
    const c = cached(ws, cache), w = SIM().whereAt(ws, map, x, z);
    const same = c.regions.filter(r => r.map === map);
    return (w && same.find(r => r.place === w.place)) || same[0] || null;
  }

  // -> { rows: [elements], whereNow, refreshWhere() }
  function whereFields(ctx, form, opts) {
    const ws = ctx.ws, c = cached(ws, opts.cache || {});
    let regions = opts.onlyMap ? c.regions.filter(r => r.map === opts.onlyMap) : c.regions;
    // a map that takes no new record (npcOps.insertPoint) has no region entry; an NPC already on it can still move
    if (!regions.length && opts.onlyMap) regions = [{ value: `${opts.onlyMap}|${opts.onlyMap}`, map: opts.onlyMap, place: opts.onlyMap, label: opts.onlyMap, group: opts.onlyMap, npcs: 0 }];
    const whereNow = h('div.nn-where');
    // shown to 2 decimals (a map file holds 6930.6767578125); the form keeps the exact value until something is typed
    const shown = v => (v === null || v === undefined ? '' : Number.isFinite(v) ? Math.round(v * 100) / 100 : v);
    const typed = (field, attrs) => h('input', Object.assign({ value: shown(form[field]), type: 'number', step: 'any',
      on: { input: e => { form[field] = e.target.value === '' ? null : Number(e.target.value);
        if (['x', 'y', 'z'].includes(field)) { form.nextTo = null; form.pasteNote = null; }   // a typed spot is no longer "next to" that NPC
        if (field === 'angle') form.faceNote = null;
        opts.changed(); } } }, attrs));
    const rows = [];
    const groups = [...new Set(regions.map(r => r.group))];
    const regionOpts = groups.flatMap(g => regions.filter(r => r.group === g).sort((a, b) => g === groups[0] ? 0 : a.label.localeCompare(b.label))
      .map(r => ({ v: r.value, group: g, find: r.map, label: `${r.label} · ${r.npcs ? `${r.npcs} NPC${r.npcs === 1 ? '' : 's'}` : '0 NPCs yet — type /position'}` })));
    const pick = (value, options, onPick, placeholder) => FRE.ui.combo({ options, value, placeholder, onPick: v => { onPick(v); opts.rerender(); } });
    rows.push(row('Region', true, pick(form.region, regionOpts, v => { form.region = v; form.map = regionOf({ regions }, form).map; form.nextTo = null; }, 'Search a town, region or dungeon'),
      note(opts.onlyMap ? `Places on this NPC's map (${opts.onlyMap}) as players read them on the map window.` : 'Places as players read them on the map window; dungeons by their in-game name.')));
    const r = regionOf({ regions }, form);
    const near = c.visible.filter(v => v.p.map === r.map && v.p.at !== opts.skipAt && (!v.w || v.w.place === r.place || r.group !== groups[0]))
      .sort((a, b) => (a.p.npc.name || a.p.key).localeCompare(b.p.npc.name || b.p.key));
    // the chosen neighbour stays shown until a different x / y / z is typed (form.nextTo = its key)
    rows.push(row('Next to', false, near.length ? pick(form.nextTo || '', near.map(o => ({ v: o.p.key, label: `${o.p.npc.name || o.p.key}${o.w && o.w.caption ? ' — ' + o.w.caption : ''}`, find: o.p.key })), v => {
      const p = near.find(o => o.p.key === v).p;
      Object.assign(form, { nextTo: v, map: p.map, x: Math.round((p.x + 6) * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10, angle: Math.round(p.angle * 10) / 10 });
    }, `Search the ${near.length} NPCs players see here`) : h('span.muted', 'No NPC stands here yet: type the spot in /position.'),
      note('Fills the spot: 6 steps to that NPC\'s side, same height and facing.')));
    // a /position line pasted from the game chat (npcEditOps.parsePosition); form.pasteNote / faceNote: what it did
    const E = FRE.npcEditOps;
    const paste = (placeholder, onLine) => h('input.nn-paste', { type: 'text', placeholder, on: { input: e => {
      const t = e.target.value.trim();
      if (!t) return;
      const p = E.parsePosition(t);
      onLine(p, t);
      opts.rerender();
    } } });
    const said = k => form[k] ? h('span.small', { style: `color:var(--${form[k].bad ? 'bad' : 'ok'})` }, form[k].text) : null;
    rows.push(row('Paste from the game', false, paste('Position : x = 6970.12, y = 100.00, z = 3337.45', p => {
      if (!p) { form.pasteNote = { bad: true, text: '⛔ That is not a /position line: it should look like "Position : x = …, y = …, z = …".' }; return; }
      Object.assign(form, { x: p.x, y: p.y, z: p.z, nextTo: null });
      form.pasteNote = { text: `✓ Spot filled from your /position line: x ${shown(p.x)}, y ${shown(p.y)}, z ${shown(p.z)}.` };
    }), said('pasteNote'), note('In game: stand where the NPC should stand, type /position (or /pos), copy the chat line and paste it here.')));
    rows.push(row('/position', true, typed('x', { placeholder: 'x' }), typed('y', { placeholder: 'y (height)' }), typed('z', { placeholder: 'z' }),
      note('Or type the x y z that /position printed.')));
    rows.push(whereNow);
    rows.push(row('Facing', true, typed('angle', { min: 0, max: 359.9 }), note('Degrees, 0-359.9. "Next to" copies the neighbour\'s.')));
    rows.push(row('Face toward', false, paste('Position : x = …, y = …, z = … (where players stand)', p => {
      const spot = [form.x, form.z].every(v => typeof v === 'number' && Number.isFinite(v));
      if (!p) { form.faceNote = { bad: true, text: '⛔ That is not a /position line.' }; return; }
      if (!spot) { form.faceNote = { bad: true, text: '⛔ Fill the NPC\'s spot first (paste or type it above).' }; return; }
      const a = E.faceToward(form, p);
      if (a === null) { form.faceNote = { bad: true, text: '⛔ That is the NPC\'s own spot: stand a few steps in front of it.' }; return; }
      form.angle = a; form.nextTo = null;
      form.faceNote = { text: `✓ Facing ${a}°: the NPC looks toward x ${shown(p.x)}, z ${shown(p.z)}.` };
    }), said('faceNote'), note('Optional: stand where players will talk to the NPC, type /position, paste the line: the NPC turns to look at that spot.')));

    function refreshWhere() {
      whereNow.textContent = '';
      if (![form.x, form.z].every(v => typeof v === 'number' && Number.isFinite(v))) return;
      const w = SIM().whereAt(ws, form.map, form.x, form.z);
      const rr = regionOf({ regions }, form);
      if (w) whereNow.append(...[h('span.muted', 'Players will read here: '), h('b', w.label), w.te ? h('span.def', ' · ' + w.te) : null,
        rr && w.place !== rr.place ? h('span.tag.warn', ` not in ${rr.label}`) : null].filter(Boolean));
    }
    return { rows, whereNow, refreshWhere };
  }

  // Models an NPC players can see uses (and mdlDyna.inc has): "Julia — like Juria, Is"
  function provenModels(ws) {
    const mdl = SIM().modelNames(ws);
    const by = new Map();
    for (const p of SIM().visibleNpcs(ws)) {
      if (!by.has(p.model)) by.set(p.model, []);
      const n = p.npc.name || p.key;
      if (!by.get(p.model).includes(n)) by.get(p.model).push(n);
    }
    // NPCs players saw until a proven commit hid them: "Soraya (until b6abf414)"
    for (const [id, list] of SIM().seenBefore(ws)) {
      if (!by.has(id)) by.set(id, []);
      for (const b of list) by.get(id).push(`${b.name} (until ${b.commit})`);
    }
    return [...by].map(([id, npcs]) => ({ id, define: ws.defines.byValue('MI_', id), npcs,
      name: ws.movers && ws.movers.movers.get(id) ? ws.movers.movers.get(id).name : '' }))
      .filter(m => m.define && (!mdl || mdl.has(m.define)))
      .sort((a, b) => (a.name || a.define).localeCompare(b.name || b.define));
  }

  // The model picker: Used by NPCs / Not used yet / Both, the files line, a portrait picture.
  // state: { modelView } kept by the caller. -> element
  function modelField(ctx, form, state, opts) {
    const ws = ctx.ws, c = opts.cache || {};
    if (c.modelWs !== ws) {
      c.modelWs = ws;
      c.models = provenModels(ws);
      c.unused = SIM().unusedCompleteModels(ws);
      c.modelPic = new Map();     // a portrait per model: the SetImage file of a visible NPC with that model
      for (const p of SIM().visibleNpcs(ws)) {
        const img = p.npc.statements.find(r => r.cmd === 'SetImage' && r.args.image);
        if (img && !c.modelPic.has(p.model)) c.modelPic.set(p.model, img.args.image.text);
      }
      c.reading = new Set();
    }
    const view = state.modelView || 'used';
    const used = c.models.map(m => ({ v: m.define, label: `${m.name || m.define} — like ${m.npcs.slice(0, 3).join(', ')}${m.npcs.length > 3 ? ', …' : ''}`,
      find: m.define + ' ' + m.npcs.join(' '), group: view === 'all' ? 'Used by NPCs in the game' : null }));
    const fresh = c.unused.map(m => ({ v: m.define, label: `${m.name || m.define} (${m.define})`, find: m.define, group: view === 'all' ? 'Not used yet — files complete, test it first' : null }));
    const listOf = v => v === 'used' ? used : v === 'unused' ? fresh : [...used, ...fresh];
    const noClient = 'Needs the Client folder (its Model files or Model.list are checked)';

    // "Files: Mvr_MaFlJuria.o3d, 9 animations, 2 textures — all in Client/Model"; the .o3d is read once to list its textures
    function files() {
      const e = form.model && SIM().modelEntries(ws) && SIM().modelEntries(ws).get(form.model);
      if (!e || !ws.clientModels) return null;
      const o3d = `Mvr_${e.name}.o3d`, lo = o3d.toLowerCase();
      const tex = ws.modelTextures.get(lo);
      if (!tex && ws.clientTextures && ws.clientModels.has(lo) && !c.reading.has(lo)) {
        c.reading.add(lo);
        ctx.clientFile('Model/' + o3d).then(b => { if (b) { ws.addModelTextures(o3d, SIM().o3dTextures(b)); ws.reparse('character.inc'); opts.rerender(); } }).catch(() => {});
      }
      const miss = SIM().missingModelFiles(ws, form.model) || [];
      // every Mvr_*.o3d of the client names at least one texture: none listed means a stale or broken Model.textures index
      const texText = !ws.clientTextures ? 'textures not checked (no Model/Texture list)' : !tex ? 'textures: reading…'
        : tex.length ? `${tex.length} texture${tex.length === 1 ? '' : 's'}` : 'no textures listed (re-run tools/refresh-fixtures.sh)';
      return h('span.small' + (miss.length ? '.bad' : '.muted'), `Files: ${o3d}, ${e.anis.length} animation${e.anis.length === 1 ? '' : 's'}, ${texText} — ` +
        (miss.length ? `missing: ${miss.join(', ')}` : 'all in Client/Model'));
    }

    return row('Model', true, h('div.nn-col',
      h('div.nn-row', FRE.ui.combo({ options: listOf(view), value: form.model, placeholder: view === 'unused' ? 'Search a model no NPC uses yet' : 'Search a model or an NPC that uses it',
        onPick: v => { form.model = v; if (opts.picked) opts.picked(); opts.rerender(); } }),
        h('select.nn-modelview', { title: 'Which models the list shows', on: { change: e => {
          state.modelView = e.target.value;
          // the picked model stays only if the new list has it (else its picture would stay with nothing shown)
          if (!listOf(state.modelView).some(o => o.v === form.model)) form.model = opts.keepModel || '';
          opts.rerender();
        } } },
          h('option', { value: 'used', selected: view === 'used' }, `Used by NPCs (${used.length})`),
          h('option', { value: 'unused', selected: view === 'unused', disabled: !ws.clientModels, title: ws.clientModels ? '' : noClient },
            ws.clientModels ? `Not used yet (${fresh.length})` : 'Not used yet (needs the Client folder)'),
          h('option', { value: 'all', selected: view === 'all', disabled: !ws.clientModels, title: ws.clientModels ? '' : noClient }, 'Both'))),
      view !== 'used' ? h('span.muted.small', 'Not used yet: no NPC players see has this body; every .o3d, .ani and texture file is in Client/Model. Check it on the test server first.') : null,
      files()),
      FRE.tga.picture(ctx, c.modelPic.get(ws.defines.defines.get(form.model))),
      note(opts.note || 'What the NPC looks like. The picture is the portrait of an NPC with this body, when there is one.'));
  }

  FRE.ui.npcPlace = { whereFields, modelField, provenModels, regionAt };
})(globalThis.FRE = globalThis.FRE || {});
