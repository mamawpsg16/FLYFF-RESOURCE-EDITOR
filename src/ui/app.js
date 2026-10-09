// App shell: toolbar (mode switch, load, save, backup, undo), the left list and
// centre editor of the active module, the shared item database, the problems
// panel and the save flow. Editors live in ui/<module>.js (FRE.ui.modules).
// Every data change goes through Workspace.apply() with splices; everything
// shown is re-derived from the file text after each edit.
(function (FRE) {
  'use strict';
  const { h, $, fmt, toast, modal } = FRE.dom;
  const { diagRow } = FRE.ui;
  const ROW_H = 40;

  const S = {
    ws: null, resDir: null, backupDir: null, client: null, createMissing: new Set(), createAsked: new Set(), mode: 'npc',
    layout: null, pendingRoot: null, task: null, busy: false,
    queries: {}, items: [], filtered: [], rarity: new Set(), ik1: '', ik3: '', itemQuery: '',
    diagOpen: false,
  };
  const modules = () => FRE.ui.modules;
  const active = () => modules().find(m => m.id === S.mode) || modules()[0];

  // Context handed to modules
  const ctx = {
    get ws() { return S.ws; },
    get hasClient() { return !!S.client; },     // a Client folder was found (client-only files can be saved)
    get query() { return S.queries[S.mode] || ''; },
    // list badges: the keys of the edits still in the undo history, so Undo removes a badge and Redo brings it back
    get edited() { return new Set(S.ws ? S.ws.history.flatMap(e => e.tags || []) : []); },
    renderAll: (withItems) => renderAll(withItems),
    // a C++ patch's state (io/patch-state.js): 'in-source' | 'missing' | 'unknown' | 'built'
    patchState: id => FRE.patchState.effective(S.patchSrc)[id] || 'unknown',
    setPatchBuilt: (id, on) => FRE.patchState.setTicked(id, on),
    // [{ stamp, bytes }] of every backup copy of a file, or null when no backups folder is known
    backupsOf: name => (S.backupDir ? FRE.fsa.backupCopies(S.backupDir, name) : Promise.resolve(null)),
    get backupKey() { return S.backupDir ? S.backupDir.name : null; },
    renderList: () => renderList(),
    // set the list search of the current task (e.g. so a just-created NPC is listed)
    setQuery(q) { S.queries[S.mode] = q; $('list-search').value = q; },
    // switch to another task with the same folder, then run then(ctx) (e.g. select a menu);
    // unsaved edits: Cancel / Discard / Save and switch
    openTask: (id, then) => leaveTask(async () => { await loadTask(id); if (then && S.task === id) { then(ctx); renderAll(false); } }),
    // bytes of a file in the Client folder by relative path ('Char/char_NpcHende.tga', names matched without case), or null
    async clientFile(rel) {
      if (!S.client) return null;
      const parts = rel.split('/'), name = parts.pop();
      const dir = await FRE.fsa.dirAt(S.client.dir, parts.join('/'));
      if (!dir) return null;
      const fh = (await FRE.fsa.findFiles(dir, [name])).get(name.toLowerCase());
      return fh ? (await FRE.fsa.readHandle(fh)).bytes : null;
    },
    // bytes of Client/Item/<name> (item icons), or null. The folder (4,000+ files) is listed once per Client folder.
    async clientItemFile(name) {
      if (!S.client) return null;
      if (!S.itemIndex || S.itemIndex.client !== S.client) {
        const client = S.client;
        S.itemIndex = { client, map: (async () => {
          const dir = await FRE.fsa.dirAt(client.dir, 'Item'), map = new Map();
          if (dir) for await (const [n, fh] of dir.entries()) if (fh.kind === 'file') map.set(n.toLowerCase(), fh);
          return map;
        })() };
      }
      const fh = (await S.itemIndex.map).get(String(name).toLowerCase());
      return fh ? (await FRE.fsa.readHandle(fh)).bytes : null;
    },
    // file names in a Client sub-folder ('Icon'), listed once per Client folder; null without a Client folder or that folder
    async clientNames(sub) {
      if (!S.client) return null;
      if (!S.dirNames || S.dirNames.client !== S.client) S.dirNames = { client: S.client, map: new Map() };
      const key = sub.toLowerCase();
      if (!S.dirNames.map.has(key)) S.dirNames.map.set(key, (async () => {
        const dir = await FRE.fsa.dirAt(S.client.dir, sub);
        if (!dir) return null;
        const out = [];
        for await (const [n, fh] of dir.entries()) if (fh.kind === 'file') out.push(n);
        return out.sort((a, b) => a.localeCompare(b));
      })());
      return S.dirNames.map.get(key);
    },
    // Apply an edit op: make(text) -> splices. `key` marks what was edited (list badges).
    // Repeated edits of the same field within 2 s (typing) are folded into one undo step.
    edit(lowerFile, make, label, key) {
      const f = S.ws.files.get(lowerFile);
      const said = FRE.dom.toasts();
      try {
        const splices = make(f.text);
        if (!splices.length) return;
        const before = S.ws.history[S.ws.history.length - 1];
        S.ws.apply(lowerFile, splices, label);
        tagLast(key ? [key] : [], label);
        const now = Date.now(), last = S.ws.history[S.ws.history.length - 1];
        if (before && before !== last && before.label === label && String(before.tags) === String(last.tags) && now - (before.at || 0) < 2000 && S.ws.mergeLast()) before.at = now;
        else { last.at = now; done(label, said); }
      } catch (e) { toast(e.message, 'bad'); }
      renderAll(false);
    },
    // Several files as one undo step: make() -> [{ file: lowerName, splices }] (current texts).
    // mergeKey: the same field typed again within 2 s is folded into the step before (one undo step).
    editGroup(make, label, keys = [], mergeKey = null) {
      const said = FRE.dom.toasts();
      try {
        const before = S.ws.history[S.ws.history.length - 1];
        S.ws.applyGroup(make(), label);
        const last = S.ws.history[S.ws.history.length - 1], now = Date.now();
        if (mergeKey && before && before !== last && before.mergeKey === mergeKey && now - (before.at || 0) < 2000 && S.ws.mergeLast()) {
          // one undo step for the whole typed value: its label (and the toast) say the final value, "was" keeps the value before typing
          before.at = now;
          const files = S.ws.history[S.ws.history.length - 1];
          const u0 = files && files.length ? S.ws.files.get(files[0])._undo : null, first = u0 && u0.length ? u0[u0.length - 1].label : null;
          const was = first && /\(was [^)]*\)\s*$/.exec(first);
          const merged = was ? label.replace(/\(was [^)]*\)\s*$/, was[0]) : label;
          for (const n of files || []) { const u = S.ws.files.get(n)._undo; if (u.length) u[u.length - 1].label = merged; }
          done(merged, said);
          return;
        }
        tagLast(keys, label);
        if (last && last !== before) { last.at = now; last.mergeKey = mergeKey; }
        done(label, said);
      } catch (e) { toast(e.message, 'bad'); } finally { renderAll(false); }
    },
    // Several steps, each planned on the files as the step before left them, as ONE undo step:
    // makers = [() => [{ file, splices }], ...]. A failing step undoes the ones before it.
    editSteps(makers, label, keys = []) {
      const said = FRE.dom.toasts();
      let done_ = 0;
      try {
        for (const make of makers) {
          const n = S.ws.history.length;
          S.ws.applyGroup(make(), label);
          if (S.ws.history.length > n) done_++;
        }
        if (done_ > 1) S.ws.foldLast(done_, label);
        const last = S.ws.history[S.ws.history.length - 1];
        tagLast(keys, label);
        if (last) last.at = Date.now();
        done(label, said);
        return true;
      } catch (e) {
        while (done_-- > 0) S.ws.undo();
        S.ws.redoStack = [];
        toast(e.message, 'bad');
        return false;
      } finally { renderAll(false); }
    },
  };

  // ------------------------------------------------------------------ folder + task
  // The user picks ONE folder (FLYFF-V19-SOURCE, or test-data); FRE.layout finds Server/Resource,
  // Client and backups in it. Then one task at a time: only that editor's files are shown and saved.
  async function chooseRoot() {
    try { await useRoot(await FRE.fsa.pickFolder('flyff-root')); }
    catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
  }

  async function useRoot(dir) {
    if (!(await FRE.fsa.ensurePermission(dir))) { toast('Permission to the folder was not granted.', 'bad'); return; }
    let layout;
    const P = FRE.dom.progress(`Opening ${dir.name}…`);
    try {
      await P.phase('Looking for Server/Resource, Client and backups…');
      try { layout = await FRE.layout.detectLayout(dir); } catch (e) { toast(e.message, 'bad'); return; }
    S.layout = layout; S.pendingRoot = null;
    if (layout.backups) S.backupDir = layout.backups;
    else if (S.backupDir && S.backupKind === 'test') S.backupDir = null;     // never back up real files into a test folder
    S.backupKind = layout.kind;
    // which client patches are in FLYFF-V19-SOURCE (read-only; "unknown" on test-data): Save's "After saving" list
      if (layout.kind === 'real') await P.phase('Checking which client patches are in Source/ (read only)…');
      S.patchSrc = await FRE.patchState.inSource(layout);
      S.cpp = await FRE.sourceRead.read(layout);      // the Guild Siege prize amounts (Where is this item from?)
    } finally { P.close(); }
    FRE.fsa.remember('root', dir);
    renderAll(false);
  }

  // Opening a task shows a "Loading…" window with the phase and a count (the real folder takes seconds:
  // Client/Model alone lists ~19,000 names); each phase is timed and the toast names the slowest one.
  async function loadTask(id) {
    const L = S.layout;
    if (!L || S.busy) return;
    S.busy = true; S.loadingTask = id;
    const wm = FRE.Workspace.MODULES.find(x => x.id === id), res = FRE.layout.describe(L).res;
    renderAll(false);
    const P = FRE.dom.progress(`Opening ${wm ? wm.label : id}…`);
    const times = [];
    let cur = null, t = performance.now();
    const t0 = t;
    const phase = async name => { const now = performance.now(); if (cur) times.push([cur, now - t]); cur = name; t = now; await P.phase(name + '…'); };
    try {
      await phase(`Finding the files in ${res}`);
      const found = await FRE.fsa.findFiles(L.res, FRE.Workspace.ALL_FILES);
      for (const must of ['masquerade.prj', 'spec_item.txt']) {
        if (!found.has(must)) { toast(`${FRE.layout.describe(L).res} has no ${must}. Nothing was loaded.`, 'bad'); return; }
      }
      const files = new Map();
      await phase(`Reading ${res}`);
      let i = 0;
      for (const [lower, handle] of found) {
        await P.count(++i, found.size, handle.name);
        const { bytes, stamp } = await FRE.fsa.readHandle(handle);
        files.set(lower, new FRE.SourceFile(handle.name, bytes, { handle, stamp }));
      }
      await phase('Reading the items, names and defines, then checking the files');
      S.ws = new FRE.Workspace(files, { only: id, cpp: S.cpp || null }).load();
      S.resDir = L.res;
      S.ws.resDir = L.res;     // io/save.js creates new server files here (UpgradeFees.lua)
      S.client = null;
      if (L.client) { await phase('Reading the game client\'s copies (Client/)'); await loadClient(L.client, P, phase); }
      if (S.ws.needsMaps()) { await phase('Reading the maps (World/)'); await loadMaps(L.res, P); }
      await phase('Building the lists');
      S.mode = id; S.task = id;
      S.queries[id] = ''; $('list-search').value = '';      // a task opens with an empty search, like its filters (the user, 2026-10-09)
      buildItems();
      const m = modules().find(x => x.id === id);
      if (S.ws.available[id].ok && m && m.onLoad) m.onLoad(ctx);
      renderAll();
      times.push([cur, performance.now() - t]);
      const sec = ms => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
      const slow = times.reduce((a, b) => (b[1] > a[1] ? b : a));
      console.info('[load] ' + times.map(([n, ms]) => `${n}: ${sec(ms)}`).join(' · '));
      toast(`${m ? m.label : id}: loaded from ${res} in ${sec(performance.now() - t0)}${performance.now() - t0 >= 1000 ? ` (slowest: ${slow[0].replace(/^./, c => c.toLowerCase())}, ${sec(slow[1])})` : ''}`, 'ok');
    } catch (e) { toast(e.message, 'bad'); }
    finally { P.close(); S.busy = false; S.loadingTask = null; if (!S.task) renderAll(false); }
  }

  // For every map in World.inc (read-only): World/<map>/<map>.dyo (which NPCs stand in the game),
  // <map>.rgn + <map>.txt.txt (area names) and WdMadrigal.wld.cnt (continents): loaders/area.js
  async function loadMaps(res, P = null) {
    const world = await FRE.layout.child(res, 'World');
    if (!world) return;
    const dyo = new Map(), worldFiles = new Map(), seen = new Set();
    const cworld = S.client ? await FRE.layout.child(S.client.dir, 'World') : null;
    const list = S.ws.worldList(), maps = new Set(list.map(w => w.name)).size;
    for (const w of list) {
      if (seen.has(w.name)) continue;
      seen.add(w.name);
      if (P) await P.count(seen.size, maps, w.name);
      const dir = await FRE.layout.child(world, w.name);
      if (!dir) continue;
      const names = ['.dyo', '.rgn', '.txt.txt', '.wld.cnt'].map(e => w.name + e);
      const found = await FRE.fsa.findFiles(dir, names);
      for (const n of names) {
        const fh = found.get(n.toLowerCase());
        if (!fh) continue;
        const { bytes, stamp } = await FRE.fsa.readHandle(fh);
        // the .dyo with its handle: the NPC task can add an NPC record to it (Server + Client copies)
        if (n.endsWith('.dyo')) dyo.set(w.name, new FRE.SourceFile(fh.name, bytes, { handle: fh, stamp, binary: true, dir: `World/${dir.name}` }));
        else worldFiles.set(`world/${w.name}/${n}`.toLowerCase(), new FRE.SourceFile(fh.name, bytes));
      }
      // the client's copy (Client/World/<map>/<map>.dyo), for the client sync
      const cdir = cworld && dyo.has(w.name) ? await FRE.layout.child(cworld, w.name) : null;
      const ch = cdir && (await FRE.fsa.findFiles(cdir, [w.name + '.dyo'])).get((w.name + '.dyo').toLowerCase());
      if (ch) {
        const { bytes, stamp } = await FRE.fsa.readHandle(ch);
        S.client.files.set(ch.name.toLowerCase(), new FRE.SourceFile(ch.name, bytes, { handle: ch, stamp, binary: true, dir: `World/${cdir.name}` }));
      }
    }
    S.ws.setMapFiles(dyo, worldFiles);
  }

  // back to the start screen; unsaved edits are only dropped after asking
  function changeTask() {
    leaveTask(() => { S.task = null; S.ws = null; S.client = null; S.diagOpen = false; $('diag-panel').hidden = true; renderAll(false); });
  }
  // run go() once the open task has no unsaved edit: ask first, and offer to save them
  function leaveTask(go) {
    const dirty = S.ws ? S.ws.dirtyFiles() : [];
    if (!dirty.length) { go(); return; }
    modal({ title: 'Unsaved changes', body: h('div',
      h('p', `${dirty.map(f => f.name).join(', ')} ${dirty.length > 1 ? 'have' : 'has'} changes that are not saved.`),
      h('p.muted', 'Save and continue: the usual review, backup and write, then go on. Discard: the edits are lost.')),
      buttons: [{ label: 'Cancel' }, { label: 'Discard changes', cls: 'danger', onClick: go },
        { label: 'Save and continue', cls: 'primary', onClick: () => { onSave(go); } }] });
  }

  async function pickBackup() {
    try {
      const dir = await FRE.fsa.pickFolder('flyff-backups');
      if ((S.resDir && (await dir.isSameEntry(S.resDir))) || (S.layout && (await dir.isSameEntry(S.layout.root)))) { toast('Pick a folder outside the source folder for backups, e.g. FLYFF-RESOURCE-EDITOR/backups.', 'bad'); return false; }
      if (!(await FRE.fsa.ensurePermission(dir))) return false;
      S.backupDir = dir;
      FRE.fsa.remember('backup', dir);
      renderToolbar();
      return true;
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); return false; }
  }

  // ------------------------------------------------------------------ Client/ copies
  // The game client reads its own loose copies in Client/ (commit b7645c52). With a
  // Client folder chosen, every save applies the same change there (FRE.clientSync).
  const clientNames = () => S.ws ? S.ws.clientFileNames()
    : [...new Set([...FRE.Workspace.CORE_CLIENT, ...FRE.Workspace.MODULES.flatMap(m => m.client)])];

  // P / phase (optional): the "Loading…" window of loadTask
  async function loadClient(dir, P = null, phase = async () => {}) {
    const found = await FRE.fsa.findFiles(dir, clientNames());
    const files = new Map();
    let i = 0;
    for (const [lower, handle] of found) {
      if (P) await P.count(++i, found.size, handle.name);
      const { bytes, stamp } = await FRE.fsa.readHandle(handle);
      files.set(lower, new FRE.SourceFile(handle.name, bytes, { handle, stamp }));
    }
    // the Donation Shop's category tree is client-only: Client/Client/DonationShopTree.inc
    let tree = null;
    try {
      const sub = await dir.getDirectoryHandle('Client');
      const th = (await FRE.fsa.findFiles(sub, ['DonationShopTree.inc'])).get('donationshoptree.inc');
      if (th) { const { bytes, stamp } = await FRE.fsa.readHandle(th); tree = new FRE.SourceFile(th.name, bytes, { handle: th, stamp, dir: 'Client' }); }
    } catch (e) { if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') toast('DonationShopTree.inc: ' + e.message, 'bad'); }
    // rules windows (docs/patches/npc-board.diff): Client/Client/NpcBoard_<menu id>.inc, edited in NPC Shops
    const boards = [];
    try {
      const sub = await dir.getDirectoryHandle('Client');
      for await (const [name, handle] of sub.entries()) {
        if (handle.kind !== 'file' || !/^npcboard_\d+\.inc$/i.test(name)) continue;
        const { bytes, stamp } = await FRE.fsa.readHandle(handle);
        boards.push(new FRE.SourceFile(name, bytes, { handle, stamp, dir: 'Client' }));
      }
    } catch (e) { if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') toast('Client/Client/NpcBoard files: ' + e.message, 'bad'); }
    // Battle Pass rarity / icon textures live in Client/Theme (WndBattlePass.cpp MakePath(DIR_THEME, ...))
    let theme = null;
    try {
      const th = await dir.getDirectoryHandle('Theme');
      theme = [];
      for await (const [name, handle] of th.entries()) if (handle.kind === 'file') theme.push(name);
    } catch (e) { if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') toast('Client/Theme: ' + e.message, 'bad'); }
    // Client/Model file names (Add New NPC checks a model's .o3d and .ani files); names only, nothing is read
    // Client/Model/Texture names; a model's .o3d is read when it is picked (S.readModel) to check its textures
    let models = null, textures = null, texIndex = null, modelDir = null;
    // only NPC Shops needs them (+ NPC, 📍 Change model); other tasks that read the NPC files (where) skip the ~19,000 names
    if (S.ws && S.ws.available.npc && S.ws.available.npc.ok && S.ws.shown.has('npc')) {
      try {
        modelDir = await FRE.layout.child(dir, 'Model');
        if (modelDir) {
          await phase('Listing the model files (Client/Model, names only)');
          models = []; for await (const [name, handle] of modelDir.entries()) { if (handle.kind === 'file') models.push(name); if (P) await P.count(models.length, 0, 'files'); }
          await phase('Listing the textures (Client/Model/Texture, names only)');
          const td = await FRE.layout.child(modelDir, 'Texture');
          if (td) { textures = []; for await (const [name, handle] of td.entries()) { if (handle.kind === 'file') textures.push(name); if (P) await P.count(textures.length, 0, 'files'); } }
        } else {
          // a test copy has no Model folder (the 3D files are large): tools/refresh-fixtures.sh writes Client/Model.list (names),
          // Client/ModelTexture.list (Model/Texture names) and Client/Model.textures (each Mvr_*.o3d's textures, tab-separated)
          const found = await FRE.fsa.findFiles(dir, ['Model.list', 'ModelTexture.list', 'Model.textures']);
          const lines = async n => found.get(n) ? new TextDecoder('latin1').decode((await FRE.fsa.readHandle(found.get(n))).bytes).split(/\r?\n/).map(l => l.trim()).filter(Boolean) : null;
          models = await lines('model.list');
          textures = await lines('modeltexture.list');
          const idx = await lines('model.textures');
          if (idx) texIndex = new Map(idx.map(l => { const [o, ...t] = l.split('\t'); return [o, t.filter(Boolean)]; }));
        }
      } catch (e) { toast('Client/Model: ' + e.message, 'bad'); }
    }
    S.client = { dir, files, tree, theme, models, modelDir, boards };
    if (S.ws) { S.ws.setBoardFiles(boards); S.ws.setDonationTree(tree); S.ws.setClientTheme(theme); S.ws.setClientModels(models); S.ws.setClientTextures(textures, texIndex); }
    S.createMissing = new Set(clientNames().map(n => n.toLowerCase()).filter(n => !files.has(n)));   // offered, can be unticked
  }

  // [{name, lower, mode, text}] for the client files of the loaded workspace
  function clientStatus() {
    if (!S.ws || !S.client) return [];
    return S.ws.clientFileNames().filter(n => S.ws.files.has(n.toLowerCase())).map(n => {
      const lower = n.toLowerCase(), c = S.client.files.get(lower) || null;
      const mode = FRE.clientSync.modeOf(S.ws.files.get(lower), c);
      return { name: c ? c.name : n, lower, mode, text: FRE.clientSync.MODE_TEXT[mode] };
    });
  }

  // The standard note after every change (add / change / remove), unless the editor already showed one.
  function done(label, said) {
    if (FRE.dom.toasts() !== said) return;
    const n = S.ws.dirtyFiles().length;
    toast(`✓ ${label || 'Changed'} — not saved yet (${n} file${n === 1 ? '' : 's'} to save; Ctrl+Z undoes it)`, 'ok');
  }
  function undo() {
    if (!S.ws) return;
    const e = S.ws.history[S.ws.history.length - 1];
    if (S.ws.undo() !== null) { toast(`↶ Undone: ${(e && e.label) || 'edit'}`); renderAll(false); }
  }
  function redo() {
    if (!S.ws) return;
    const e = S.ws.redoStack[S.ws.redoStack.length - 1];
    if (S.ws.redo() !== null) { toast(`↷ Redone: ${(e && e.label) || 'edit'}`); renderAll(false); }
  }

  function setMode(id) { if (id !== S.task) loadTask(id); }

  // ------------------------------------------------------------------ rendering
  // the edit just applied (last undo entry): its label and the list keys it marks as edited
  function tagLast(keys, label) {
    const e = S.ws.history[S.ws.history.length - 1];
    if (!e) return;
    if (keys.length) e.tags = (e.tags || []).concat(keys);
    if (label) e.label = label;
  }
  // "recipe 1 qty (MMI_COLLECT01)" for the Undo / Redo tooltips
  const stepText = e => e ? `${e.label || 'edit'}${e.tags && e.tags.length ? ` (${[...new Set(e.tags.map(t => t.slice(t.indexOf('|') + 1)))].join(', ')})` : ''}` : '';

  function renderAll(withItems = true) {
    document.body.classList.toggle('start', !S.task);
    // a task that never adds items (Rates & Buffs) has no item list on the right
    const um = S.task ? modules().find(x => x.id === S.task) : null;
    document.body.classList.toggle('no-items', !!(um && um.noItems));
    renderToolbar(); renderBanners(); renderModes();
    if (!S.task) { renderStart(); return; }
    renderList(); renderEditor();
    if (withItems) renderItemFilters();
    renderItems();
    if (S.diagOpen) renderDiagPanel();
  }

  // toolbar while a task is open: its name, [Change task], which files (REAL / TEST)
  function renderModes() {
    const el = $('mode-tabs'); el.textContent = '';
    if (!S.task || !S.layout) return;
    const m = modules().find(x => x.id === S.task), d = FRE.layout.describe(S.layout);
    el.appendChild(h('span.tb-label', 'Task:'));
    el.appendChild(h('span.task-name', m ? m.label : S.task));
    el.appendChild(h('button', { id: 'btn-change-task', title: 'Back to the start screen to pick another task', on: { click: changeTask } }, 'Change task'));
    el.appendChild(h('span.kind-tag.' + S.layout.kind, { title: `${d.res}${d.client ? ' + ' + d.client : ''}` }, `${d.label} · ${S.layout.root.name}`));
  }

  // start screen: 1. the folder, 2. the task
  function renderStart() {
    const el = $('editor'); el.className = ''; el.textContent = '';
    FRE.ui.tooltip.hide();
    const wrap = h('div.start-wrap', h('h2', 'What do you want to edit?'),
      h('p.muted', 'Pick the source folder once, then one task. Only that task\'s files are opened, shown and saved. Nothing is written until you press Save and confirm.'));
    wrap.appendChild(h('div.start-step', '1 · Folder'));
    const L = S.layout;
    if (!FRE.fsa.supported()) wrap.appendChild(h('div.folder-card', 'This browser cannot open folders. Use Chrome or Edge (in Brave: enable brave://flags/#file-system-access-api).'));
    else if (L) {
      const d = FRE.layout.describe(L);
      wrap.appendChild(h('div.folder-card.' + L.kind,
        h('div', h('b', L.root.name), h('span.kind-tag.' + L.kind, d.label)),
        h('div.paths',
          h('div', '✓ ', d.res),
          h('div', d.client ? `✓ ${d.client}  (the game client's copies get the same change)` : '✗ no Client folder next to it: copy changed files to the client by hand'),
          h('div', d.backups ? `✓ ${d.backups}  (a backup before every save)` : S.backupDir ? `✓ backups: ${S.backupDir.name}` : '• backups: asked at the first save (pick a folder outside the source, e.g. FLYFF-RESOURCE-EDITOR/backups)')),
        L.kind === 'real' ? h('p.small', { style: 'color:var(--bad)' }, 'These are the real server files. Test on FLYFF-RESOURCE-EDITOR/test-data first.') : null,
        h('button', { id: 'btn-root', disabled: S.busy, on: { click: chooseRoot } }, 'Choose another folder')));
    } else if (S.pendingRoot) {
      wrap.appendChild(h('div.folder-card', h('p', `Last time: `, h('b', S.pendingRoot.name)),
        h('div.row', { style: 'justify-content:flex-start;gap:8px' },
          h('button.primary', { id: 'btn-allow', on: { click: () => useRoot(S.pendingRoot) } }, `Allow access to ${S.pendingRoot.name}`),
          h('button', { id: 'btn-root', on: { click: chooseRoot } }, 'Choose another folder'))));
    } else {
      wrap.appendChild(h('div.folder-card', h('p', 'Pick ', h('code', 'FLYFF-V19-SOURCE'), ' (real files), or ', h('code', 'FLYFF-RESOURCE-EDITOR/test-data'), ' (test copy). The editor finds Server/Resource and Client inside it.'),
        h('button.primary', { id: 'btn-root', on: { click: chooseRoot } }, 'Choose the source folder')));
    }
    wrap.appendChild(h('div.start-step', '2 · Task'));
    wrap.appendChild(h('div.task-grid', FRE.Workspace.MODULES.filter(wm => !wm.hidden).map(wm => {
      const um = modules().find(x => x.id === wm.id);
      return h('button.task-card' + (S.loadingTask === wm.id ? '.loading' : ''), { 'data-task': wm.id, disabled: !L || S.busy, title: L ? '' : 'Choose the folder first', on: { click: () => loadTask(wm.id) } },
        h('b', wm.label), h('span', um && um.help ? um.help.replace(/^[^:]+:\s*/, '').replace(/^./, c => c.toUpperCase()) : wm.required.join(', ')),
        S.loadingTask === wm.id ? h('div.loading-tag', h('span.spinner'), 'Loading…') : null);
    })));
    el.appendChild(wrap);
  }

  function renderToolbar() {
    const ws = S.ws;
    // counts cover the whole task (every NPC / menu); the tooltip names the step and where it is
    const nU = ws ? ws.history.length : 0, nR = ws ? ws.redoStack.length : 0;
    $('btn-undo').disabled = !nU;
    $('btn-redo').disabled = !nR;
    $('btn-undo').textContent = nU ? `Undo (${nU})` : 'Undo';
    $('btn-redo').textContent = nR ? `Redo (${nR})` : 'Redo';
    $('btn-undo').title = nU ? `Undo (Ctrl+Z): ${stepText(ws.history[nU - 1])}. ${nU} edit${nU > 1 ? 's' : ''} in this task can be undone.` : 'Undo (Ctrl+Z)';
    $('btn-redo').title = nR ? `Redo (Ctrl+Y): ${stepText(ws.redoStack[nR - 1])}` : 'Redo (Ctrl+Y)';
    const dirty = ws ? ws.dirtyFiles() : [];
    $('btn-save').disabled = !dirty.length;
    $('btn-save').textContent = dirty.length ? `Save (${dirty.length})` : 'Save';
    const fs = $('file-status'); fs.textContent = '';
    if (ws) {
      const shown = new Set(['spec_item.txt', 'propitem.txt.txt', ...FRE.Workspace.CORE_CLIENT.map(n => n.toLowerCase())]);
      for (const m of FRE.Workspace.MODULES) if (ws.shown.has(m.id)) m.editable.forEach(n => shown.add(n.toLowerCase()));
      // compact: one summary chip; only files that need attention (changed, read-only) get their own chip
      const files = [...shown].map(l => ws.files.get(l)).filter(Boolean);
      const nd = FRE.DEFINE_FILES.filter(n => ws.files.has(n.toLowerCase())).length;
      const allDefines = nd === FRE.DEFINE_FILES.length;
      const okFiles = files.filter(f => !f.readOnly && !f.dirty);
      fs.appendChild(h('span.file-chip.' + (allDefines ? 'ok' : 'missing'), {
        title: files.map(f => `${f.readOnly ? '🔒' : '✓'} ${f.name} (${f.kind}, ${fmt(f.bytes.length)} bytes)`).join('\n')
          + `\n${allDefines ? '✓' : '✗'} define headers ${nd}/${FRE.DEFINE_FILES.length}${ws.defines.missing.length ? ' (missing: ' + ws.defines.missing.join(', ') + ')' : ''}`,
      }, `${okFiles.length + files.filter(f => f.dirty).length} files${allDefines ? '' : ` · defines ${nd}/${FRE.DEFINE_FILES.length}`}`));
      for (const f of files) {
        if (!f.readOnly && !f.dirty) continue;
        fs.appendChild(h('span.file-chip.' + (f.readOnly ? 'ro' : 'ok.dirty'), { title: f.readOnly ? f.readOnlyReasons.join('\n') : 'changed, not saved yet' }, f.name + (f.dirty ? ' •' : '')));
      }
      const nb = ws.newBlocking().length;
      const nw = ws.diags.filter(d => d.severity === 'WARN').length;
      const b = $('btn-diag');
      b.textContent = nb ? `⛔ ${nb}  ⚠ ${nw}` : `⚠ ${nw}`;
      b.className = 'diag-badge task-only' + (nb ? ' has-block' : nw ? ' has-warn' : '');
    }
  }

  function renderBanners() {
    const el = $('banners'); el.textContent = '';
    const add = (cls, ...c) => el.appendChild(h('div.banner.' + cls, ...c));
    if (!FRE.fsa.supported()) add('bad', 'This browser cannot open folders (File System Access API). Use Chrome or Edge (in Brave: enable brave://flags/#file-system-access-api).');
    if (!S.ws) return;
    const ws = S.ws;
    if (ws.missing.length) add('bad', `Missing files: ${ws.missing.join(', ')}`);
    for (const f of ws.files.values()) if (f.readOnly) add('bad', `🔒 ${f.name} is READ-ONLY: ${f.readOnlyReasons.join('; ')}`);
    if (ws.items.stopped) add('bad', `Spec_Item.txt: the server stops loading items at offset ${ws.items.stopped.start}; later items are missing.`);
    if (S.client) {
      const st = clientStatus();
      add('info', `Client sync on (${S.client.dir.name}/): every save applies the same change to the client's copies. `,
        st.map(c => h('span.tag' + (c.mode === 'different' ? '.warn' : c.mode === 'missing' ? '.info' : ''), { title: c.text }, `${c.name}: ${c.mode === 'identical' ? 'same' : c.mode === 'eol' ? 'same, LF' : c.mode === 'missing' ? 'no loose copy' : 'differs'}`)),
        ' Save lists what each change needs (restart, Neuz build).');
    } else add('warn', `No Client folder next to ${S.resDir ? S.resDir.name : 'the server files'}: the game client reads its own copy of ${ws.clientFileNames().join(', ') || 'these files'}. Copy the changed files to it by hand.`);
  }

  function renderList() {
    const el = $('list'); el.textContent = '';
    const extra = $('list-extra'); extra.textContent = '';
    const action = $('list-action'); action.textContent = '';
    if (!S.ws || !S.ws.available[S.mode].ok) return;
    const m = active();
    $('list-search').placeholder = m.searchPlaceholder || 'Search';
    if (m.listAction) { const x = m.listAction(ctx); if (x) action.appendChild(x); }   // a button right of the search box
    if (m.listExtra) { const x = m.listExtra(ctx); if (x) extra.appendChild(x); }
    m.renderList(el, ctx);
    const sel = el.querySelector('.sel');                 // e.g. a new NPC at the end of the list
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  // Re-rendering the same view (after an edit) keeps the scroll position; a new view starts at the top.
  // A module's `pick` (an item being picked for a row) is not a new view.
  let lastView = null;
  function renderEditor() {
    const el = $('editor');
    if (!S.ws) return;
    FRE.ui.tooltip.hide();                       // its element is about to be replaced
    const m = active(), view = S.mode + '|' + JSON.stringify(m.st || {}, (k, v) => k === 'pick' ? undefined : v);
    const top = view === lastView ? el.scrollTop : 0;
    lastView = view;
    if (!S.ws.available[S.mode].ok) { el.className = ''; el.textContent = ''; el.appendChild(h('p.empty-state', `Not available: missing ${S.ws.available[S.mode].missing.join(', ')}`)); return; }
    FRE.dom.keepFocus(el, () => {
      el.className = ''; el.textContent = '';
      m.renderEditor(el, ctx);
    });
    el.scrollTop = top;
  }

  // ------------------------------------------------------------------ item database
  function buildItems() {
    S.items = [...S.ws.items.items.values()].map(it => S.ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name));
    for (const i of S.items) i.cat = FRE.itemCategory.of(i, S.ws.defines);     // the editor's own categories (loaders/item-category.js)
  }

  const inCategory = i => !S.ik1 || (S.ik1.includes('|') ? `${i.cat.group}|${i.cat.sub}` === S.ik1 : i.cat.group === S.ik1);
  // rarity (dwItemGrade) only tells weapons and armor apart: every other item is Normal
  function showRarity() {
    const g = S.ik1.split('|')[0];
    const on = !g || FRE.itemCategory.RARITY_GROUPS.has(g);
    $('rarity-chips').hidden = !on;
    if (!on && S.rarity.size) { S.rarity.clear(); document.querySelectorAll('#rarity-chips .chip.on').forEach(b => b.classList.remove('on')); }
  }

  function renderItemFilters() {
    if (!S.ws) return;
    const D = S.ws.defines;
    const ik3 = $('item-ik3');
    // S.ik1 holds the category: '' | 'Pets' (a group) | 'Pets|Raised pets' (one of its parts)
    // a box you can type in (FRE.ui.combo): "pet" finds Pets and every part of it
    const options = [{ v: '', label: 'All categories', find: 'all' }];
    for (const g of FRE.itemCategory.tree(S.items)) {
      options.push({ v: g.group, label: `All ${g.group} (${g.n})`, group: g.group });
      for (const x of g.subs) options.push({ v: `${g.group}|${x.sub}`, label: `${x.sub} (${x.n})`, group: g.group });
    }
    const box = $('item-cat');
    box.textContent = '';
    const cat = FRE.ui.combo({ options, value: S.ik1, placeholder: 'Category: type to search (pets, sword…)', wordStart: true,
      onPick: v => { S.ik1 = v; S.ik3 = ''; showRarity(); renderItemFilters(); renderItems(); } });
    box.appendChild(cat);
    const k3 = [...new Set(S.items.filter(inCategory).map(i => i.ik3))].sort((a, b) => a - b);
    ik3.textContent = '';
    ik3.appendChild(h('option', { value: '' }, 'All game types'));
    k3.forEach(v => ik3.appendChild(h('option', { value: v, selected: String(v) === S.ik3, title: D.byValue('IK3_', v) || String(v) }, FRE.ui.pretty(D.byValue('IK3_', v) || String(v)))));
  }

  function applyItemFilter() {
    const q = S.itemQuery.toLowerCase();
    S.filtered = S.items.filter(i =>
      (!q || i.name.toLowerCase().includes(q) || i.define.toLowerCase().includes(q)) &&
      inCategory(i) &&
      (S.ik3 === '' || String(i.ik3) === S.ik3) &&
      (!S.rarity.size || S.rarity.has(i.rarity)));
  }

  function renderItems() {
    if (!S.ws) return;
    applyItemFilter();
    $('item-spacer').style.height = S.filtered.length * ROW_H + 'px';
    $('item-count').textContent = `${fmt(S.filtered.length)} of ${fmt(S.items.length)} items`;
    const target = S.ws.available[S.mode].ok ? active().addTarget(ctx) : { ok: false, title: '' };
    $('new-price-row').hidden = !(target.ok && target.usesPrice);
    $('new-price-hint').hidden = $('new-price-row').hidden;
    const at = $('add-target');
    at.textContent = target.title ? (target.ok ? `+ ${target.title.replace(/^Add to /, 'adds to ')}` : `+ is off: ${target.title}`) : '';
    at.className = 'small add-target' + (target.ok ? '' : ' muted');
    paintItems();
  }

  function addFromDb(info) {
    const target = active().addTarget(ctx);
    if (!target.ok) { toast(target.title, 'bad'); return; }
    let cost = null;
    if (target.usesPrice) {
      const parsed = FRE.num.parseAmount($('new-price').value);
      if (!parsed.ok) { toast('Price for items added with +: ' + parsed.error, 'bad'); return; }
      cost = parsed.value;
    }
    target.add(info, cost);
  }

  function paintItems() {
    const list = $('item-list');
    [...list.querySelectorAll('.item')].forEach(n => n.remove());
    const target = S.ws.available[S.mode].ok ? active().addTarget(ctx) : { ok: false, title: '' };
    const from = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 5);
    const to = Math.min(S.filtered.length, from + Math.ceil(list.clientHeight / ROW_H) + 10);
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const it = S.filtered[i];
      const atk = it.atkMax > 0 ? `${it.atkMin}–${it.atkMax}` : '';
      frag.appendChild(h('div.item', { style: `top:${i * ROW_H}px` },
        h('div.nm', { 'data-item-id': it.id }, h('span.r-' + it.rarity, it.name), h('span.def', it.define)),
        h('div.ty', { title: it.ik3Name || '' }, (it.ik3Name || '').replace(/^IK3_/, '')),
        h('div.num', it.level > 0 ? it.level : ''),
        h('div.num', atk),
        h('button', { disabled: !target.ok, title: target.title, on: { click: () => addFromDb(it) } }, '+')));
    }
    list.appendChild(frag);
  }

  // ------------------------------------------------------------------ problems panel
  function renderDiagPanel() {
    const el = $('diag-panel');
    el.hidden = !S.diagOpen;
    if (!S.diagOpen || !S.ws) return;
    el.textContent = '';
    const fresh = new Set(S.ws.newBlocking());
    const rank = d => fresh.has(d) ? 0 : d.severity === 'BLOCK' ? 1 : d.severity === 'WARN' ? 2 : 3;
    const list = [...S.ws.diags].sort((a, b) => rank(a) - rank(b));
    el.appendChild(h('div.pad.muted.small', `${list.length} problem(s). Blocking problems introduced by your edits (⛔ new) prevent saving; problems that were already in the files are shown for information.`));
    for (const d of list) {
      const f = S.ws.files.get((d.file || '').toLowerCase());
      el.appendChild(diagRow(d, { isNew: fresh.has(d), where: f && d.start !== undefined ? `${d.file}:${f.lineOf(d.start) + 1}` : d.file || '',
        on: { click: () => locate(d) } }));
    }
  }

  function locate(d) {
    const dm = S.ws.moduleOfFile(d.file || '');
    // a file of a module this task only checks (Exchange_Script.txt in NPC Shops): the task's own view shows it
    const id = dm && (S.ws.shown.has(dm.id) ? dm.id : S.task);
    const m = id && modules().find(x => x.id === id);
    if (!m || !m.locate || !m.locate(d, ctx)) return;
    S.mode = m.id;
    renderAll(false);
  }

  // ------------------------------------------------------------------ save
  // Changed lines of `f`: saved text vs. current text, or any before/after pair (edit previews).
  function renderDiff(f, before = f.originalText, after = f.text) {
    // an empty text has no lines (a file the editor creates, UpgradeFees.lua: no "1 -" line)
    const split = s => (s === '' ? [] : FRE.diff.splitKeepEol(s));
    const a = split(before), b = split(after);
    const hs = FRE.diff.hunks(FRE.diff.diffLines(a, b), 2);
    const box = h('div.diff');
    const strip = s => f.display(s).replace(/\r\n$|\r$|\n$/, '');
    hs.forEach((hk, i) => {
      if (i > 0) box.appendChild(h('div.gap', '⋯'));
      for (const op of hk.ops) {
        if (op.type === 'eq') box.appendChild(h('div.ctx', `${String(op.b + 1).padStart(6)}   ${strip(b[op.b])}`));
        else if (op.type === 'del') box.appendChild(h('div.del', `${String(op.a + 1).padStart(6)} - ${strip(a[op.a])}`));
        else box.appendChild(h('div.add', `${String(op.b + 1).padStart(6)} + ${strip(b[op.b])}`));
      }
    });
    return box;
  }
  FRE.ui.renderDiff = renderDiff;

  // A binary file (.dyo): the inserted / removed bytes, and the NPC records that changed
  function binaryDiff(f) {
    const box = h('div.diff');
    for (const c of FRE.save.changeSummary(f)) box.appendChild(h(c.type === 'add' ? 'div.add' : 'div.del', `${c.type === 'add' ? '+' : '-'} ${c.text}`));
    const before = FRE.world.readDyo(FRE.bytes.binaryStringToBytes(f.originalText)).placements.map(p => p.key);
    for (const p of FRE.world.readDyo(f.serialize()).placements.filter(p => !before.includes(p.key)))
      box.appendChild(h('div.add', `+ NPC ${p.key} at /position ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}, facing ${p.angle.toFixed(1)}, model ${p.model}`));
    return box;
  }

  // after(): runs once the save succeeded and its log is closed (Save and continue)
  // After a reload the browser forgets write access. It only asks when the request comes straight from a
  // click, so ask for the picked folder (covers Resource, Client and backups inside it) from a button, then
  // one button per folder that still needs it.
  async function writeAccess(handles) {
    const missing = async () => { const out = []; for (const d of handles.filter(Boolean)) if (!(await FRE.fsa.ensurePermission(d, false))) out.push(d); return out; };
    let need = await missing();
    if (!need.length) return true;
    if (S.layout && S.layout.root && !(await FRE.fsa.ensurePermission(S.layout.root, false))) need = [S.layout.root].concat(need.filter(d => d !== S.layout.root));
    for (const d of need) {
      if (await FRE.fsa.ensurePermission(d, false)) continue;
      const ok = await new Promise(res => modal({ title: 'Allow writing', body: h('div',
        h('p', `The browser needs your OK to write to the folder "${d.name}" again (it forgets after a reload).`),
        h('p.muted.small', 'Nothing is written until you confirm the changes on the next screen.')),
        buttons: [{ label: 'Cancel', onClick: () => res(false) }, { label: `Allow "${d.name}"`, cls: 'primary', onClick: async () => res(await FRE.fsa.ensurePermission(d)) }] }));
      if (!ok) return false;
    }
    return !(await missing()).length;
  }

  async function onSave(after) {
    try { await reviewSave(after); }
    catch (e) { modal({ title: 'Save failed: nothing was written', body: h('div', h('p', String(e && e.message || e)), h('p.muted.small', 'Your edits are still here. Try Save again; if it fails again, send this message.')) }); }
  }

  // What players need before they see the changes about to be saved (core/after-save.js): one entry per undo
  // step still in the history (its label and files), what happens to the game's own copy of each file, the
  // client patches' state and the checks that say the category tree needs donation-tree.diff.
  function afterSaveResult() {
    return FRE.afterSave.forWorkspace(S.ws, { plan: S.client ? FRE.clientSync.plan(S.ws, S.client) : null,
      createMissing: S.createMissing, patches: FRE.patchState.effective(S.patchSrc) });
  }

  const NEED_TEXT = { servers: 'server restart', game: 'game restart', 'reopen:donation': 'reopen the Donation Shop window',
    'click:board': 'click the menu again', 'patch:npc-board': 'npc-board.diff built into Neuz', 'patch:donation-tree': 'donation-tree.diff built into Neuz',
    'patch:upgrade-fees': 'upgrade-fees.diff built into the WorldServer and Neuz' };
  const builtInto = id => (FRE.afterSave.PATCHES[id] && FRE.afterSave.PATCHES[id].server ? 'the WorldServer and Neuz' : 'Neuz');
  // live: the patch steps get the "I built it into Neuz" tickbox (the review window); redraw() after a tick
  function afterSaveBox(res, live, redraw) {
    const tick = id => h('label.check', ' ', h('input', { type: 'checkbox', checked: FRE.patchState.ticked(id),
      on: { change: e => { if (!FRE.patchState.setTicked(id, e.target.checked)) toast('This browser cannot remember the tick (site storage is blocked).', 'bad'); else toast(e.target.checked ? `Marked ${id}.diff as built into ${builtInto(id)}.` : `${id}.diff: no longer marked as built.`); redraw(); } } }),
      ` I built it into ${builtInto(id)} (remembered in this browser)`);
    return h('div.after-save', h('h3', 'After saving: what players need to see it'),
      h('ol.plan', res.steps.map(s => h('li', s.text, live && s.id.startsWith('patch:') && s.state !== 'missing' ? tick(s.id.slice(6)) : null))),
      res.built.map(id => h('p.muted.small', `✓ ${id}.diff is marked as built into ${builtInto(id)}.`, live ? tick(id) : null)),
      res.notes.map(n => h('p', { style: 'color:var(--warn)' }, '⚠ ' + n.text)),
      res.changes.length ? h('details', h('summary', `Each change (${res.changes.length})`),
        h('ul.plan', res.changes.map(c => h('li', h('b', c.label), ': ', c.needs.length ? c.needs.map(n => NEED_TEXT[n] || n).join(' + ') : 'nothing in the game reads it',
          c.why.length ? h('div.muted.small', c.why.join('; ') + '.') : null)))) : null);
  }

  async function reviewSave(after) {
    if (typeof after !== 'function') after = null;
    const ws = S.ws;
    if (!ws || !ws.dirtyFiles().length) return;
    const nb = ws.newBlocking();
    if (nb.length) {
      modal({ title: '⛔ Cannot save: your edits introduced blocking problems', body: h('div', nb.map(d => diagRow(d))) });
      return;
    }
    if (!S.backupDir) {
      const ok = await new Promise(res => modal({ title: 'Choose a backup folder first',
        body: h('p', 'Every save first copies the current files into a timestamped folder. Pick a folder outside Server/Resource, e.g. FLYFF-RESOURCE-EDITOR/backups.'),
        buttons: [{ label: 'Cancel', onClick: () => res(false) }, { label: 'Choose folder…', cls: 'primary', onClick: async () => res(await pickBackup()) }] }));
      if (!ok) return;
    }
    if (!(await writeAccess([S.resDir, S.backupDir, S.client && S.client.dir]))) { toast('Not saved: write permission was not given.', 'bad'); return; }

    const dirty = ws.dirtyFiles();
    const warns = ws.diags.filter(d => d.severity === 'WARN');
    const client = ws.clientCopiesNeeded();
    let clientBox = null;
    if (S.client) {
      if (!(await FRE.fsa.ensurePermission(S.client.dir))) { toast('Write permission to the Client folder was not granted.', 'bad'); return; }
      const plan = FRE.clientSync.plan(ws, S.client);
      // a file the editor creates (UpgradeFees.lua) needs its game copy too: ticked unless untick by hand
      for (const p of plan) if (p.mode === 'missing' && p.server.serverNew && !S.createAsked.has(p.lower)) { S.createMissing.add(p.lower); S.createAsked.add(p.lower); }
      clientBox = plan.length ? [h('h3', `Client/ (${S.client.dir.name})`), h('ul.plan', plan.map(p => h('li', h('b', p.name), ': ', p.text,
        p.mode === 'missing' ? h('label.check', ' ', h('input', { type: 'checkbox', checked: S.createMissing.has(p.lower),
          on: { change: e => { e.target.checked ? S.createMissing.add(p.lower) : S.createMissing.delete(p.lower); } } }), ' create Client/' + p.name + ' as a copy of the server file') : null)))] : null;
    }
    const afterBox = h('div');
    const drawAfter = () => { afterBox.textContent = ''; afterBox.appendChild(afterSaveBox(afterSaveResult(), true, drawAfter)); };
    drawAfter();
    const body = h('div',
      h('p', `These lines will change. Everything else in the file${dirty.length > 1 ? 's' : ''} stays byte-for-byte identical.`),
      dirty.map(f => [h('h3', `${f.dir ? f.dir + '/' : ''}${f.name}`), f.kind === FRE.SourceFile.KIND_BINARY ? binaryDiff(f) : renderDiff(f)]),
      clientBox,
      afterBox,
      warns.length ? h('p.muted', `${warns.length} warning(s) (not blocking) — see the problems panel.`) : null,
      h('p.muted.small', `Backup folder: ${S.backupDir.name}/<timestamp>/` + (!S.client && client.length ? ` · After saving, also copy to Client/: ${client.join(', ')}` : '')));
    modal({ title: `Review changes (${dirty.length} file${dirty.length > 1 ? 's' : ''})`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: `Back up and write ${dirty.length} file${dirty.length > 1 ? 's' : ''}`, cls: 'primary', onClick: () => { runSave(after); } },
    ] });
  }

  async function runSave(after) {
    const log = h('div.log'), next = h('div');
    const client = S.ws.clientCopiesNeeded();
    const res = afterSaveResult();     // before the save: it clears the undo history
    const m = modal({ title: 'Saving…', body: h('div', log, next), buttons: [{ label: 'Close' }] });
    const sync = S.client ? { dir: S.client.dir, files: S.client.files, create: S.createMissing } : null;
    const report = await FRE.save.save(S.ws, S.backupDir, msg => log.appendChild(document.createTextNode(msg + '\n')), sync)
      .catch(e => ({ ok: false, steps: [String(e && e.message || e)] }));
    if (!report.ok) log.appendChild(h('div', { style: 'color:var(--bad)' }, '\nNot saved: ' + (report.steps[report.steps.length - 1] || '')));
    else {
      for (const c of report.client || []) S.client.files.set(c.lower, new FRE.SourceFile(c.file, c.bytes, { handle: c.handle, dir: c.dir, binary: /\.dyo$/i.test(c.file) }));
      const synced = new Set((report.client || []).map(c => c.lower));
      const left = client.filter(n => !synced.has(n.toLowerCase()));
      if (left.length) log.appendChild(h('div', { style: 'color:var(--warn)' }, `\nNot in Client/ yet (copy by hand): ${left.join(', ')}`));
      next.appendChild(afterSaveBox(res, false));
      const todo = res.steps.map(s => s.short);
      toast(`Saved${synced.size ? ' (Server and Client)' : ''}.${left.length ? ' Copy the remaining files to Client/.' : ''}${todo.length ? ' Next: ' + todo.join(', then ') + '.' : ''}`, 'ok');
    }
    m.el.querySelector('header').textContent = report.ok ? 'Saved' : 'Save failed';
    renderAll(false);
    if (report.ok && after) { m.close(); after(); }
  }

  // ------------------------------------------------------------------ init
  async function init() {
    const B = FRE.BUILD_INFO || {};
    $('version').textContent = B.version ? `Version ${B.version} · ${B.when}` : 'Version: dev';
    $('version').title = B.version ? `Built ${B.when} from commit ${B.rev || '?'}${B.dirty ? ' plus changes not committed yet (the "+")' : ''}.\nThe version goes up by one with every commit. If this is older than expected, reload the page (F5).` : '';
    $('btn-save').onclick = onSave;
    $('btn-undo').onclick = undo;
    $('btn-redo').onclick = redo;
    $('btn-diag').onclick = () => { S.diagOpen = !S.diagOpen; renderDiagPanel(); };
    $('list-search').oninput = e => { S.queries[S.mode] = e.target.value; renderList(); };
    $('item-search').oninput = e => { S.itemQuery = e.target.value; $('item-list').scrollTop = 0; renderItems(); };
    $('item-ik3').onchange = e => { S.ik3 = e.target.value; renderItems(); };
    $('item-list').addEventListener('scroll', () => requestAnimationFrame(paintItems));
    window.addEventListener('resize', () => S.ws && paintItems());
    for (const b of document.querySelectorAll('#rarity-chips .chip')) {
      b.onclick = () => { const r = b.dataset.r; S.rarity.has(r) ? S.rarity.delete(r) : S.rarity.add(r); b.classList.toggle('on'); renderItems(); };
    }
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 's') { e.preventDefault(); onSave(); }
    });
    window.addEventListener('beforeunload', e => { if (S.ws && S.ws.dirtyFiles().length) { e.preventDefault(); e.returnValue = ''; } });
    FRE.ui.tooltip.init(() => S.ws);
    renderAll(false);
    if (!FRE.fsa.supported()) return;
    const bk = await FRE.fsa.recall('backup');
    if (bk && (await FRE.fsa.ensurePermission(bk, false))) { S.backupDir = bk; S.backupKind = 'real'; }
    const root = await FRE.fsa.recall('root');
    if (root) {
      if (await FRE.fsa.ensurePermission(root, false)) await useRoot(root);       // still allowed: no click needed
      else { S.pendingRoot = root; renderAll(false); }
    }
  }

  FRE.app = { init, state: S, ctx, setMode, loadTask, changeTask, useRoot };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(globalThis.FRE = globalThis.FRE || {});
