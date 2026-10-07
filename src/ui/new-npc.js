// "+ New NPC" in the NPC Shops task (docs/HANDOFF-ADD-NPC.md). One form: who, where, menus, shop.
// Every change re-runs the rules (validate/newnpc.js) and the preview of the exact text and bytes
// (edit/npc-ops.js). Create applies the three files as ONE undo step; Save writes them (Server + Client).
// Names are the ones players read: regions (Flaris, La Christiana A …), building tags ([General]), menu labels.
(function (FRE) {
  'use strict';
  const { h, modal, toast } = FRE.dom;
  const { pretty, diagRow } = FRE.ui;
  const SIM = () => FRE.newNpcSim;
  // guild-house door / notice menus: their TID_MMI text is a bid message, and only door objects use them
  const NOT_FOR_NPCS = ['MMI_GUILDHOUSE_ENTER_DOOR', 'MMI_GUILDHOUSE_NOTICE'];

  // the form, kept while the task is open (reopening the dialog keeps what was typed)
  let form = null;
  const blankTab = slot => ({ slot, title: '', rules: [], items: [] });
  function defaults(ws) {
    const madrigal = ws.area ? ws.area.madrigal : 'WdMadrigal';
    return { key: '', name: '', model: 'MI_MAFL_JURIA', image: null, structure: null, newTag: null, region: `${madrigal}|Flaris`,
      map: ws.mapFiles.has(madrigal) ? madrigal : [...ws.mapFiles.keys()][0],
      x: null, y: null, z: null, angle: 0, menus: ['MMI_TRADE'], tabs: [blankTab(0)] };
  }

  // Proven models: an NPC players can see uses it, and mdlDyna.inc has it. "Julia — like Juria, Is"
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
  // Menus: { define, id, label, count of visible NPCs using it }
  function menuList(ws, all) {
    const count = new Map();
    const seen = new Set();
    for (const p of SIM().visibleNpcs(ws)) {
      if (seen.has(p.npc)) continue;
      seen.add(p.npc);
      for (const id of new Set(p.npc.menus)) count.set(id, (count.get(id) || 0) + 1);
    }
    return ws.defines.withPrefix('MMI_').filter(([, v]) => v >= 0 && v < 350 && (all || count.has(v)))
      .map(([define, v]) => { const t = ws.texts.byId.get(SIM().TID_MMI_DIALOG + v); return { define, id: v, label: t ? t.text : pretty(define), count: count.get(v) || 0 }; })
      .filter((m, i, a) => a.findIndex(x => x.id === m.id) === i)      // one name per id (the first #define)
      .sort((a, b) => b.count - a.count || a.id - b.id);
  }

  // ---------------------------------------------------------------- item picker (bulk)
  // opts: { ws, title, have: Set of item ids already there, room: how many more fit (or Infinity), onAdd(infos) }
  function itemPicker(opts) {
    const ws = opts.ws;
    if (!ws._pickItems) ws._pickItems = [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name));
    const all = ws._pickItems;
    const D = ws.defines;
    const st = { q: '', ik1: '', ik3: '', rarity: new Set(), picked: new Set() };
    const LIMIT = 400;
    const list = h('div.ip-list'), count = h('span.muted.small'), addBtn = h('button.primary');
    const shown = () => all.filter(i => (!st.q || i.name.toLowerCase().includes(st.q) || i.define.toLowerCase().includes(st.q)) &&
      (st.ik1 === '' || String(i.ik1) === st.ik1) && (st.ik3 === '' || String(i.ik3) === st.ik3) && (!st.rarity.size || st.rarity.has(i.rarity)));
    const ik1s = [...new Set(all.map(i => i.ik1))].sort((a, b) => a - b);
    const ik3sel = h('select', { on: { change: e => { st.ik3 = e.target.value; paint(); } } });
    function fillIk3() {
      const k3 = [...new Set(all.filter(i => st.ik1 === '' || String(i.ik1) === st.ik1).map(i => i.ik3))].sort((a, b) => a - b);
      ik3sel.textContent = '';
      ik3sel.appendChild(h('option', { value: '' }, 'All types'));
      k3.forEach(v => ik3sel.appendChild(h('option', { value: v, selected: String(v) === st.ik3 }, pretty(D.byValue('IK3_', v) || String(v)))));
    }
    function paint() {
      const rows = shown();
      list.textContent = '';
      for (const i of rows.slice(0, LIMIT)) {
        const had = opts.have.has(i.id);
        const cb = h('input', { type: 'checkbox', checked: had || st.picked.has(i.id), disabled: had,
          on: { change: e => { e.target.checked ? st.picked.add(i.id) : st.picked.delete(i.id); status(); } } });
        list.appendChild(h('label.ip-row' + (had ? '.had' : ''), { 'data-item-id': i.id }, cb,
          h('span.ip-name', h('span.r-' + i.rarity, i.name), h('span.def', i.define)),
          h('span.ip-type', pretty(i.ik3Name || '')), h('span.ip-lv', i.level > 0 ? `Lv ${i.level}` : ''),
          h('span.ip-cost', had ? 'already in the tab' : i.cost > 0 ? `${FRE.dom.fmt(i.cost)} Penya` : '')));
      }
      if (rows.length > LIMIT) list.appendChild(h('p.muted.small', `Showing the first ${LIMIT} of ${FRE.dom.fmt(rows.length)}. Narrow the search; "Select all shown" still takes all ${FRE.dom.fmt(rows.length)}.`));
      if (!rows.length) list.appendChild(h('p.muted', 'No item matches.'));
      status();
    }
    function status() {
      const n = st.picked.size;
      const fit = Math.min(n, opts.room);
      count.textContent = `${n} selected · ${opts.room === Infinity ? '' : `room for ${opts.room} more in this tab (100 max)`}`;
      addBtn.textContent = n > fit ? `Add the first ${fit} (tab full after that)` : `Add ${n} item${n === 1 ? '' : 's'}`;
      addBtn.disabled = !fit;
    }
    const body = h('div.ip',
      h('div.nn-row', h('input', { type: 'search', placeholder: 'Search items (name or II_)', style: 'flex:1', on: { input: e => { st.q = e.target.value.trim().toLowerCase(); paint(); } } })),
      h('div.nn-row',
        h('select', { on: { change: e => { st.ik1 = e.target.value; st.ik3 = ''; fillIk3(); paint(); } } },
          [h('option', { value: '' }, 'All categories'), ...ik1s.map(v => h('option', { value: v }, pretty(D.byValue('IK1_', v) || String(v))))]),
        ik3sel,
        ['normal', 'unique', 'ultimate', 'baruna'].map(r => h('button.chip', { 'data-r': r, on: { click: e => { st.rarity.has(r) ? st.rarity.delete(r) : st.rarity.add(r); e.target.classList.toggle('on'); paint(); } } }, pretty('X_' + r)))),
      h('div.nn-row',
        h('button.small', { on: { click: () => { for (const i of shown()) if (!opts.have.has(i.id)) st.picked.add(i.id); paint(); } } }, 'Select all shown'),
        h('button.small', { on: { click: () => { st.picked.clear(); paint(); } } }, 'Clear'), count),
      list);
    fillIk3();
    const m = modal({ title: opts.title, body, wide: true, buttons: [{ label: 'Cancel' }] });
    addBtn.addEventListener('click', () => {
      const ids = [...st.picked].filter(id => !opts.have.has(id)).slice(0, opts.room);
      const by = new Map(all.map(i => [i.id, i]));
      opts.onAdd(ids.map(id => by.get(id)));
      m.close();
    });
    m.el.querySelector('footer').appendChild(addBtn);
    paint();
    return m;
  }

  // ---------------------------------------------------------------- the form
  function open(ctx) {
    const ws = ctx.ws;
    if (!ws.mapFiles.size || !ws.area) { toast('The map files (World/) were not read, so an NPC cannot be placed.', 'bad'); return; }
    if (!form) form = defaults(ws);
    let modelView = 'used';          // 'used': models a visible NPC uses; 'unused': models no NPC uses yet (every file in Client/Model); 'all'
    let touched = false;             // the checks show once the user has typed something
    let menuView = 'top';            // 'top': ticked + the 16 most used; 'used': every menu a visible NPC uses; 'all': also unused ones
    const models = provenModels(ws);
    const unused = SIM().unusedCompleteModels(ws);
    // a portrait picture per model: the SetImage file of a visible NPC with that model
    const modelPic = new Map();
    for (const p of SIM().visibleNpcs(ws)) {
      const img = p.npc.statements.find(r => r.cmd === 'SetImage' && r.args.image);
      if (img && !modelPic.has(p.model)) modelPic.set(p.model, img.args.image.text);
    }
    const images = [];
    for (const n of ws.chars.npcs) for (const r of n.statements) if (r.cmd === 'SetImage' && r.args.image && r.args.image.stringKey)
      if (!images.some(i => i.key === r.args.image.stringKey)) images.push({ key: r.args.image.stringKey, file: r.args.image.text, npc: n.name || n.key });
    images.sort((a, b) => a.npc.localeCompare(b.npc));
    const buildings = SIM().buildingNames(ws);
    const srts = ws.defines.withPrefix('SRT_').filter(([, v]) => buildings.get(v)).map(([d, v]) => ({ d, v, tag: buildings.get(v) }))
      .filter((s, i, a) => a.findIndex(x => x.v === s.v) === i);
    const freeTags = SIM().freeStructureIds(ws);
    const tagFiles = ['defineneuz.h', 'etc.inc', 'etc.txt.txt'].every(n => ws.isEditable(n));
    const regions = SIM().regions(ws);
    const visible = SIM().visibleNpcs(ws).map(p => ({ p, w: SIM().whereAt(ws, p.map, p.x, p.z) }));

    const body = h('div.newnpc');
    const problems = h('div.nn-problems'), preview = h('div.nn-preview'), whereNow = h('div.nn-where');
    let createBtn = null;

    const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
    const input = (field, attrs = {}) => h('input', Object.assign({ value: form[field] === null || form[field] === undefined ? '' : form[field],
      on: { input: e => { form[field] = attrs.number ? num(e.target.value) : e.target.value; touched = true;
        if (['x', 'y', 'z'].includes(field)) form.nextTo = null;          // a typed spot is no longer "next to" that NPC
        refresh(); } } }, attrs.el || {}));
    const combo = (value, options, onPick, placeholder, onNew) => FRE.ui.combo({ options, value, placeholder, onNew, onPick: v => { touched = true; onPick(v); refresh(); } });
    const select = (value, options, onChange) => h('select', { on: { change: e => { onChange(e.target.value); refresh(); } } },
      options.map(o => o.group ? h('optgroup', { label: o.group }, o.options.map(x => h('option', { value: x.v, selected: String(x.v) === String(value) }, x.label)))
        : h('option', { value: o.v, selected: String(o.v) === String(value) }, o.label)));
    const label = FRE.ui.fieldLabel;
    const row = (text, req, ...el) => h('div.nn-row', label(text, req), ...el);
    const note = t => h('span.muted.small', t);
    const region = () => regions.find(r => r.value === form.region) || regions[0];

    // "Files: Mvr_MaFlJuria.o3d, 9 animations, 2 textures — all in Client/Model"; the .o3d is read once to list its textures
    const reading = new Set();
    function modelFiles() {
      const e = form.model && SIM().modelEntries(ws) && SIM().modelEntries(ws).get(form.model);
      if (!e || !ws.clientModels) return null;
      const o3d = `Mvr_${e.name}.o3d`, lo = o3d.toLowerCase();
      const tex = ws.modelTextures.get(lo);
      if (!tex && ws.clientTextures && ws.clientModels.has(lo) && !reading.has(lo)) {
        reading.add(lo);
        ctx.clientFile('Model/' + o3d).then(b => { if (b) { ws.addModelTextures(o3d, SIM().o3dTextures(b)); ws.reparse('character.inc'); render(); } }).catch(() => {});
      }
      const miss = SIM().missingModelFiles(ws, form.model) || [];
      // every Mvr_*.o3d of the client names at least one texture: none listed means a stale or broken Model.textures index
      const texText = !ws.clientTextures ? 'textures not checked (no Model/Texture list)' : !tex ? 'textures: reading…'
        : tex.length ? `${tex.length} texture${tex.length === 1 ? '' : 's'}` : 'no textures listed (re-run tools/refresh-fixtures.sh)';
      return h('span.small' + (miss.length ? '.bad' : '.muted'), `Files: ${o3d}, ${e.anis.length} animation${e.anis.length === 1 ? '' : 's'}, ${texText} — ` +
        (miss.length ? `missing: ${miss.join(', ')}` : 'all in Client/Model'));
    }

    function render() {
      body.textContent = '';
      // --- who
      body.appendChild(h('h3', 'NPC'));
      body.appendChild(row('Key', true, input('key', { el: { placeholder: 'MaFl_Lumi', maxLength: 31 } }), note('Internal name, unique, never shown. Letters, digits, _ (31 max). Style: MaFl_ = Madrigal Flaris, MaSa_ = Saint Morning, MaDa_ = Darkon.')));
      body.appendChild(row('Name', true, input('name', { el: { placeholder: 'Lumi', maxLength: 63 } }), note('Shown above the NPC\'s head.')));
      const used = models.map(m => ({ v: m.define, label: `${m.name || m.define} — like ${m.npcs.slice(0, 3).join(', ')}${m.npcs.length > 3 ? ', …' : ''}`,
        find: m.define + ' ' + m.npcs.join(' '), group: modelView === 'all' ? 'Used by NPCs in the game' : null }));
      const fresh = unused.map(m => ({ v: m.define, label: `${m.name || m.define} (${m.define})`, find: m.define, group: modelView === 'all' ? 'Not used yet — files complete, test it first' : null }));
      const modelOpts = modelView === 'used' ? used : modelView === 'unused' ? fresh : [...used, ...fresh];
      const curModel = ws.defines.defines.get(form.model);
      const noClient = 'Needs the Client folder (its Model files or Model.list are checked)';
      body.appendChild(row('Model', true, h('div.nn-col',
        h('div.nn-row', combo(form.model, modelOpts, v => { form.model = v; render(); }, modelView === 'unused' ? 'Search a model no NPC uses yet' : 'Search a model or an NPC that uses it'),
          h('select.nn-modelview', { title: 'Which models the list shows', on: { change: e => {
            modelView = e.target.value;
            // the picked model stays only if the new list has it (else its picture would stay with nothing shown)
            const now = modelView === 'used' ? used : modelView === 'unused' ? fresh : [...used, ...fresh];
            if (!now.some(o => o.v === form.model)) form.model = '';
            render();
          } } },
            h('option', { value: 'used', selected: modelView === 'used' }, `Used by NPCs (${used.length})`),
            h('option', { value: 'unused', selected: modelView === 'unused', disabled: !ws.clientModels, title: ws.clientModels ? '' : noClient },
              ws.clientModels ? `Not used yet (${fresh.length})` : 'Not used yet (needs the Client folder)'),
            h('option', { value: 'all', selected: modelView === 'all', disabled: !ws.clientModels, title: ws.clientModels ? '' : noClient }, 'Both'))),
        modelView !== 'used' ? h('span.muted.small', 'Not used yet: no NPC players see has this body; every .o3d, .ani and texture file is in Client/Model. Check it on the test server first.') : null,
        modelFiles()),
        FRE.tga.picture(ctx, modelPic.get(curModel)),
        note('What the NPC looks like. The picture is the portrait of an NPC with this body, when there is one.')));
      const imgFile = form.image ? (images.find(i => i.key === form.image) || {}).file : null;
      body.appendChild(row('Portrait', false, combo(form.image || '', [{ v: '', label: '(none)' }, ...images.map(i => ({ v: i.key, label: `${i.npc} — ${i.file}` }))], v => { form.image = v || null; render(); }, 'Search an NPC'),
        FRE.tga.picture(ctx, imgFile, '.small'),
        note('SetImage: this client never shows it (nothing reads it). Leave (none).')));
      // Building = m_nStructure: the client draws "[tag]" above the name (MoverRender.cpp:1717) and an icon on the minimap
      const NEW = '+new';
      const tagOpts = [{ v: '', label: '(none) — no tag' }, ...srts.map(s => ({ v: s.d, label: `[${s.tag}]`, find: s.d }))];
      if (tagFiles && freeTags.length) tagOpts.splice(1, 0, { v: NEW, label: `+ New tag… (${freeTags.length} free) — or type it here`, find: 'new type' });
      const tagNow = form.newTag !== null && form.newTag !== undefined;
      body.appendChild(row('Building', false, combo(tagNow ? NEW : form.structure || '', tagOpts, v => {
        if (v === NEW) { form.structure = null; form.newTag = form.newTag || ''; } else { form.structure = v || null; form.newTag = null; }
        render();
      }, 'Search a tag, or type a new one', tagFiles && freeTags.length ? {
        label: t => `+ New tag [${FRE.npcOps.tagText(t)}]`,
        pick: t => { form.structure = null; form.newTag = t; touched = true; render(); refresh(); },
      } : null),
        note(`The tag in brackets above the name, e.g. [General], and the NPC's icon on the minimap.${tagFiles && !freeTags.length ? ' No free row for a new tag (MAX_STRUCTURE 20 is compiled into the game).' : ''}`)));
      if (tagNow) {
        const tt = FRE.npcOps.tagText(form.newTag);
        const showDef = h('span.def', tt ? FRE.npcOps.tagDefine(tt, freeTags[0]) : '');
        body.appendChild(row('New tag', true, h('div.nn-col',
          h('div.nn-row', h('input', { value: form.newTag, placeholder: 'Dungeon Pieces', maxLength: 40, on: { input: e => {
            form.newTag = e.target.value; touched = true;
            const t = FRE.npcOps.tagText(form.newTag);
            showDef.textContent = t ? FRE.npcOps.tagDefine(t, freeTags[0]) : '';
            refresh();
          } } }), showDef),
          note(`Shown as [text] (the game adds the brackets), 31 characters at most. Written to defineNeuz.h, etc.inc and etc.txt.txt (Server + Client), like the four tags of b4b9a465. Takes row ${freeTags[0]}; only ${freeTags.length} new tag${freeTags.length === 1 ? '' : 's'} fit without a C++ rebuild. Other NPCs can pick it afterwards.`))));
      }

      // --- where
      body.appendChild(h('h3', 'Where'));
      const groups = [...new Set(regions.map(r => r.group))];
      const regionOpts = groups.flatMap(g => regions.filter(r => r.group === g).sort((a, b) => g === groups[0] ? 0 : a.label.localeCompare(b.label))
        .map(r => ({ v: r.value, group: g, find: r.map, label: `${r.label} · ${r.npcs ? `${r.npcs} NPC${r.npcs === 1 ? '' : 's'}` : '0 NPCs yet — type /position'}` })));
      body.appendChild(row('Region', true, combo(form.region, regionOpts, v => { form.region = v; form.map = region().map; form.nextTo = null; render(); }, 'Search a town, region or dungeon'),
        note('Places as players read them on the map window; dungeons by their in-game name.')));
      const r = region();
      const near = visible.filter(v => v.p.map === r.map && (!v.w || v.w.place === r.place || r.group !== groups[0]))
        .sort((a, b) => (a.p.npc.name || a.p.key).localeCompare(b.p.npc.name || b.p.key));
      // the chosen neighbour stays shown until a different x / y / z is typed (form.nextTo = its key)
      body.appendChild(row('Next to', false, near.length ? combo(form.nextTo || '', near.map(o => ({ v: o.p.key, label: `${o.p.npc.name || o.p.key}${o.w && o.w.caption ? ' — ' + o.w.caption : ''}`, find: o.p.key })), v => {
        const p = near.find(o => o.p.key === v).p;
        Object.assign(form, { nextTo: v, map: p.map, x: Math.round((p.x + 6) * 10) / 10, y: Math.round(p.y * 10) / 10, z: Math.round(p.z * 10) / 10, angle: Math.round(p.angle * 10) / 10 });
        render();
      }, `Search the ${near.length} NPCs players see here`) : h('span.muted', 'No NPC stands here yet: type the spot in /position.'),
        note('Fills the spot: 6 steps to that NPC\'s side, same height and facing.')));
      body.appendChild(row('/position', true, input('x', { number: true, el: { placeholder: 'x', type: 'number', step: 'any' } }), input('y', { number: true, el: { placeholder: 'y (height)', type: 'number', step: 'any' } }),
        input('z', { number: true, el: { placeholder: 'z', type: 'number', step: 'any' } }), note('In game: stand on the spot, type /position, copy x y z.')));
      body.appendChild(whereNow);
      body.appendChild(row('Facing', true, input('angle', { number: true, el: { type: 'number', step: 'any', min: 0, max: 359.9 } }), note('Degrees, 0-359.9. "Next to" copies the neighbour\'s.')));

      // --- menus
      body.appendChild(h('h3', 'Right-click menus'));
      const every = menuList(ws, menuView === 'all').filter(m => menuView !== 'top' || !NOT_FOR_NPCS.includes(m.define));
      const list = menuView === 'top' ? every.filter((m, i) => i < 16 || form.menus.includes(m.define)) : every;
      body.appendChild(h('div.nn-menus', list.map(m => h('label.nn-menu', { title: `${m.label}\n${m.define} = ${m.id}; used by ${m.count} NPC(s) players see` },
        h('input', { type: 'checkbox', checked: form.menus.includes(m.define), on: { change: e => {
          form.menus = e.target.checked ? [...form.menus, m.define] : form.menus.filter(x => x !== m.define);
          if (m.define === 'MMI_TRADE' && e.target.checked && !form.tabs.length) form.tabs = [blankTab(0)];
          render();
        } } }), h('span.nn-menu-text', m.label), m.count ? null : h('span.tag.warn', 'unused')))));
      body.appendChild(h('div.nn-row', ['top', 'used', 'all'].map(v => h('label.nn-radio', h('input', { type: 'radio', name: 'nn-menuview', checked: menuView === v,
        on: { change: () => { menuView = v; render(); } } }), v === 'top' ? 'most used' : v === 'used' ? `every menu an NPC uses (${menuList(ws, false).length})` : 'also menus no NPC uses (untested)'))));

      // --- shop
      if (form.menus.includes('MMI_TRADE')) {
        body.appendChild(h('h3', 'Shop tabs (Penya)'));
        form.tabs.forEach((t, k) => {
          const box = h('div.nn-tab');
          box.appendChild(h('div.nn-row', label(`Tab ${t.slot + 1}`, true),
            h('input', { value: t.title, placeholder: 'Tab title, e.g. Scrolls', maxLength: 63, on: { input: e => { t.title = e.target.value; touched = true; refresh(); } } }),
            h('button.small', { on: { click: () => pick(t) } }, '+ Add items'),
            h('span.muted.small', `${t.items.length} / 100`),
            h('button.icon.danger', { title: 'Remove this tab', on: { click: () => { form.tabs.splice(k, 1); render(); } } }, '✕')));
          if (t.items.length) {
            const tb = h('table.items.nn-items', h('tr', h('th', 'Item'), h('th.num', 'Price (Penya)'), h('th', '')));
            t.items.forEach((it, j) => {
              const info = ws.items && ws.defines.defines.has(it.define) ? ws.itemById(ws.defines.defines.get(it.define)) : null;
              const ii = info ? ws.itemInfo(info) : null;
              tb.appendChild(h('tr', FRE.ui.itemCell(ii, it.define),
                h('td.num', FRE.dom.numInput({ value: it.cost || null, placeholder: ii ? `${FRE.dom.fmt(ii.cost)} (item)` : '',
                  title: 'Empty = the item\'s own price. A price here changes the item\'s price in EVERY shop.',
                  onCommit: v => { if (v === null) delete it.cost; else it.cost = v; refresh(); } })),
                h('td', h('button.icon.danger', { title: 'Remove', on: { click: () => { t.items.splice(j, 1); render(); } } }, '✕'))));
            });
            box.appendChild(tb);
          } else box.appendChild(h('p.muted.small', 'No item yet: + Add items.'));
          for (const ru of t.rules) box.appendChild(h('p.muted.small', `Also every ${pretty(ru.ik3)} item, rarity ${ru.min}-${ru.max} (rule).`));
          body.appendChild(box);
        });
        const free = [0, 1, 2, 3].find(s => !form.tabs.some(t => t.slot === s));
        if (free !== undefined) body.appendChild(h('button.small', { on: { click: () => { form.tabs.push(blankTab(free)); render(); } } }, `+ Tab ${free + 1}`));
      }
      body.append(...FRE.ui.formFooter({ checks: problems, action: 'Create', preview }));
      refresh();
    }

    function pick(t) {
      const have = new Set(t.items.map(it => ws.defines.defines.get(it.define)).filter(v => v !== undefined).map(v => v >>> 0));
      itemPicker({ ws, title: `Add items to tab ${t.slot + 1}${t.title ? ' "' + t.title + '"' : ''}`, have, room: Math.max(0, 100 - t.items.length),
        onAdd: infos => { t.items.push(...infos.map(i => ({ define: i.define }))); render(); toast(`${infos.length} item(s) added to tab ${t.slot + 1}.`, 'ok'); } });
    }

    function refresh() {
      // where a player reads this spot
      whereNow.textContent = '';
      const ok = [form.x, form.z].every(v => typeof v === 'number' && Number.isFinite(v));
      if (ok) {
        const w = SIM().whereAt(ws, form.map, form.x, form.z);
        const r = region();
        if (w) whereNow.append(...[h('span.muted', 'Players will read here: '), h('b', w.label), w.te ? h('span.def', ' · ' + w.te) : null,
          r && w.place !== r.place ? h('span.tag.warn', ` not in ${r.label}`) : null].filter(Boolean));
      }
      const diags = FRE.validateNewNpc(ws, form);
      problems.textContent = '';
      const blocks = diags.filter(d => d.severity === 'BLOCK');
      if (!touched) problems.appendChild(h('p.muted', 'Fill in the fields above; the checks show here as you type.'));
      else if (!diags.length) problems.appendChild(h('p.ok', '✓ No problem found.'));
      else diags.forEach(d => problems.appendChild(diagRow(d)));
      const blocked = blocks.length > 0;
      if (createBtn) { createBtn.disabled = blocked; createBtn.title = blocked ? 'Still to fix:\n' + blocks.map(d => '• ' + d.message).join('\n') : ''; }
      preview.textContent = '';
      if (blocked) { preview.appendChild(h('p.muted', 'Fix the ⛔ problems to see the exact text.')); return; }
      try {
        const plan = FRE.npcOps.newNpcPlan(ws, form);
        const dv = new DataView(plan.record.buffer);
        if (plan.tag) {
          preview.appendChild(h('div.muted.small', `New tag [${plan.tag.text}] = row ${plan.tag.id} (Server + Client): defineNeuz.h, etc.inc, etc.txt.txt get one line each:`));
          preview.appendChild(h('pre.nn-pre', [plan.tag.lines.define, plan.tag.lines.inc, plan.tag.lines.txt].map(l => l.replace(/\r?\n$/, '')).join('\n')));
        }
        preview.appendChild(h('div.muted.small', 'character.inc (Server + Client), appended:'));
        preview.appendChild(h('pre.nn-pre', plan.block.replace(/\r/g, '')));
        preview.appendChild(h('div.muted.small', 'character.txt.txt (Server + Client), appended:'));
        preview.appendChild(h('pre.nn-pre', plan.strings.map(s => `${s.key}\t${s.text}`).join('\n')));
        preview.appendChild(h('div.muted.small', `World/${form.map}/${plan.dyo.name} (Server + Client): 200 bytes inserted at offset ${plan.insertAt}, before the end marker:`));
        preview.appendChild(h('pre.nn-pre', `x ${dv.getFloat32(20, true)} (= ${form.x} / 4), y ${dv.getFloat32(24, true)}, z ${dv.getFloat32(28, true)} (= ${form.z} / 4), angle ${dv.getFloat32(4, true)}, model ${dv.getUint32(48, true)}, key ${form.key}\n` +
          Array.from(plan.record, b => b.toString(16).padStart(2, '0')).join(' ').replace(/((?:\S+ ){16})/g, '$1\n')));
      } catch (e) { preview.appendChild(h('p.bad', e.message)); }
    }

    render();
    const m = modal({ title: 'New NPC', body, wide: true, buttons: [
      { label: 'Close' },
      { label: 'Reset form', onClick: () => { form = defaults(ws); render(); return false; } },
      { label: 'Create NPC', cls: 'primary', id: 'nn-create', onClick: () => create(ctx) },
    ] });
    createBtn = m.el.querySelector('#nn-create');
    refresh();
  }

  function create(ctx) {
    const ws = ctx.ws;
    if (FRE.validateNewNpc(ws, form).some(d => d.severity === 'BLOCK')) return false;
    const key = form.key;
    const tagMade = form.newTag !== null && form.newTag !== undefined;
    ctx.editGroup(() => FRE.npcOps.newNpcPlan(ws, form).parts, `new NPC ${key}`, [`npc|character.inc|${key}`]);
    const npc = ws.chars.byKey.get(key.toLowerCase());
    if (!npc) return false;
    FRE.ui.newNpc.created.add(key.toLowerCase());
    select(ctx, npc[npc.length - 1]);
    form = null;
    toast(`${key} created (not saved yet). Save writes character.inc, character.txt.txt${tagMade ? ', defineNeuz.h, etc.inc, etc.txt.txt' : ''} and the map file, Server and Client.`, 'ok');
    return true;
  }

  // select the new NPC in the NPC Shops list (and show every NPC if the list filter or the search hides it)
  function select(ctx, npc) {
    const mod = FRE.ui.modules.find(m => m.id === 'npc');
    mod.st.sel = mod.npcId(npc); mod.st.tab = 0;
    if (!mod.isListed(npc)) mod.st.show = 'all';
    const q = ctx.query.toLowerCase();
    if (q && !(npc.name || '').toLowerCase().includes(q) && !npc.key.toLowerCase().includes(q)) ctx.setQuery(npc.name || npc.key);
    ctx.renderAll(false);
  }

  FRE.ui.itemPicker = itemPicker;
  FRE.ui.newNpc = { open, created: new Set(), select, provenModels, menuList, reset: () => { form = null; } };
})(globalThis.FRE = globalThis.FRE || {});
