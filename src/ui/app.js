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
    ws: null, resDir: null, backupDir: null, client: null, createMissing: new Set(), mode: 'npc',
    queries: {}, items: [], filtered: [], rarity: new Set(), ik1: '', ik3: '', itemQuery: '',
    edited: new Set(), diagOpen: false,
  };
  const modules = () => FRE.ui.modules;
  const active = () => modules().find(m => m.id === S.mode) || modules()[0];

  // Context handed to modules
  const ctx = {
    get ws() { return S.ws; },
    get query() { return S.queries[S.mode] || ''; },
    get edited() { return S.edited; },
    renderAll: (withItems) => renderAll(withItems),
    renderList: () => renderList(),
    // Apply an edit op: make(text) -> splices. `key` marks what was edited (list badges).
    edit(lowerFile, make, label, key) {
      const f = S.ws.files.get(lowerFile);
      try {
        const splices = make(f.text);
        S.ws.apply(lowerFile, splices, label);
        if (key) S.edited.add(key);
      } catch (e) { toast(e.message, 'bad'); }
      renderAll(false);
    },
    // Several files as one undo step: make() -> [{ file: lowerName, splices }] (current texts).
    editGroup(make, label, keys = []) {
      try {
        S.ws.applyGroup(make(), label);
        keys.forEach(k => S.edited.add(k));
      } catch (e) { toast(e.message, 'bad'); }
      renderAll(false);
    },
  };

  // ------------------------------------------------------------------ loading
  async function pickResource() {
    try {
      const dir = await FRE.fsa.pickFolder('flyff-resource');
      await loadFrom(dir);
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); }
  }

  async function loadFrom(dir) {
    if (S.ws && S.ws.dirtyFiles().length && !confirm('Discard unsaved changes and load another folder?')) return;
    if (!(await FRE.fsa.ensurePermission(dir))) { toast('Permission to the folder was not granted.', 'bad'); return; }
    const found = await FRE.fsa.findFiles(dir, FRE.Workspace.ALL_FILES);
    for (const must of ['masquerade.prj', 'spec_item.txt']) {
      if (!found.has(must)) {
        toast(`"${dir.name}" does not look like Server/Resource (no ${must}). Nothing was loaded.`, 'bad');
        return;
      }
    }
    const files = new Map();
    for (const [lower, handle] of found) {
      const { bytes, stamp } = await FRE.fsa.readHandle(handle);
      files.set(lower, new FRE.SourceFile(handle.name, bytes, { handle, stamp }));
    }
    const t0 = performance.now();
    S.ws = new FRE.Workspace(files).load();
    S.resDir = dir;
    S.edited.clear();
    FRE.fsa.remember('resource', dir);
    if (S.client) await loadClient(S.client.dir);
    buildItems();
    for (const m of modules()) if (S.ws.available[m.id] && S.ws.available[m.id].ok && m.onLoad) m.onLoad(ctx);
    if (!S.ws.available[S.mode].ok) S.mode = (modules().find(m => S.ws.available[m.id].ok) || modules()[0]).id;
    renderAll();
    toast(`Loaded ${files.size} files from "${dir.name}" in ${Math.round(performance.now() - t0)} ms`, 'ok');
  }

  async function pickBackup() {
    try {
      const dir = await FRE.fsa.pickFolder('flyff-backups');
      if (S.resDir && (await dir.isSameEntry(S.resDir))) { toast('Pick a folder outside Server/Resource for backups.', 'bad'); return false; }
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

  async function loadClient(dir) {
    const found = await FRE.fsa.findFiles(dir, clientNames());
    const files = new Map();
    for (const [lower, handle] of found) {
      const { bytes, stamp } = await FRE.fsa.readHandle(handle);
      files.set(lower, new FRE.SourceFile(handle.name, bytes, { handle, stamp }));
    }
    // the Donation Shop's category tree is client-only: Client/Client/DonationShopTree.inc
    let tree = null;
    try {
      const sub = await dir.getDirectoryHandle('Client');
      const th = (await FRE.fsa.findFiles(sub, ['DonationShopTree.inc'])).get('donationshoptree.inc');
      if (th) tree = FRE.donationTree.loadTree(new FRE.SourceFile(th.name, (await FRE.fsa.readHandle(th)).bytes));
    } catch (e) { if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') toast('DonationShopTree.inc: ' + e.message, 'bad'); }
    // Battle Pass rarity / icon textures live in Client/Theme (WndBattlePass.cpp MakePath(DIR_THEME, ...))
    let theme = null;
    try {
      const th = await dir.getDirectoryHandle('Theme');
      theme = [];
      for await (const [name, handle] of th.entries()) if (handle.kind === 'file') theme.push(name);
    } catch (e) { if (e.name !== 'NotFoundError' && e.name !== 'TypeMismatchError') toast('Client/Theme: ' + e.message, 'bad'); }
    S.client = { dir, files, tree, theme };
    if (S.ws) { S.ws.setDonationTree(tree); S.ws.setClientTheme(theme); }
    S.createMissing = new Set(clientNames().map(n => n.toLowerCase()).filter(n => !files.has(n)));   // offered, can be unticked
  }

  async function pickClient() {
    try {
      const dir = await FRE.fsa.pickFolder('flyff-client');
      if (S.resDir && (await dir.isSameEntry(S.resDir))) { toast('That is the Server/Resource folder. Pick the game\'s Client folder.', 'bad'); return false; }
      if (!(await FRE.fsa.ensurePermission(dir))) return false;
      const probe = await FRE.fsa.findFiles(dir, ['Spec_Item.txt', 'character.inc']);
      if (!probe.size) { toast(`"${dir.name}" does not look like the Client folder (no Spec_Item.txt or character.inc).`, 'bad'); return false; }
      if (S.ws && S.ws.dirtyFiles().length && !confirm('The Client copies are compared with the server files as they are on disk. Choose the Client folder now anyway?')) return false;
      await loadClient(dir);
      FRE.fsa.remember('client', dir);
      renderAll(false);
      return true;
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'bad'); return false; }
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

  function undo() { if (S.ws && S.ws.undo() !== null) renderAll(false); }
  function redo() { if (S.ws && S.ws.redo() !== null) renderAll(false); }

  function setMode(id) {
    S.mode = id;
    $('list-search').value = S.queries[id] || '';
    renderAll(false);
  }

  // ------------------------------------------------------------------ rendering
  function renderAll(withItems = true) {
    renderToolbar(); renderBanners(); renderModes(); renderList(); renderEditor();
    if (withItems) renderItemFilters();
    renderItems();
    if (S.diagOpen) renderDiagPanel();
  }

  function renderModes() {
    const el = $('mode-tabs'); el.textContent = '';
    el.appendChild(h('span.tb-label', { title: 'Which game file you are editing. Switching keeps your unsaved changes.' }, 'Editing:'));
    for (const m of modules()) {
      const av = S.ws ? S.ws.available[m.id] : { ok: false, missing: [] };
      el.appendChild(h('button.mode' + (m.id === S.mode ? '.sel' : ''), {
        disabled: !S.ws || !av.ok,
        title: !S.ws ? 'Load a folder first' : av.ok ? (m.help || m.label) : `Not available: missing ${av.missing.join(', ')}`,
        on: { click: () => setMode(m.id) },
      }, m.label));
    }
  }

  function renderToolbar() {
    const ws = S.ws;
    $('backup-name').textContent = S.backupDir ? S.backupDir.name : 'not set';
    $('client-name').textContent = S.client ? S.client.dir.name : 'not set';
    $('btn-undo').disabled = !ws || !ws.history.length;
    $('btn-redo').disabled = !ws || !ws.redoStack.length;
    const dirty = ws ? ws.dirtyFiles() : [];
    $('btn-save').disabled = !dirty.length;
    $('btn-save').textContent = dirty.length ? `Save (${dirty.length})` : 'Save';
    $('btn-backup').disabled = !ws;
    const fs = $('file-status'); fs.textContent = '';
    if (ws) {
      const shown = new Set(['spec_item.txt', 'propitem.txt.txt', ...FRE.Workspace.CORE_CLIENT.map(n => n.toLowerCase())]);
      for (const m of FRE.Workspace.MODULES) m.editable.forEach(n => shown.add(n.toLowerCase()));
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
      b.className = 'diag-badge' + (nb ? ' has-block' : nw ? ' has-warn' : '');
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
    if (S.resDir && S.resDir.name.toLowerCase() !== 'resource') add('info', `Editing folder "${S.resDir.name}" (a test copy?).`);
    const mod = FRE.Workspace.MODULES.find(m => m.id === S.mode);
    if (S.client) {
      const st = clientStatus();
      add('info', `Client sync on (${S.client.dir.name}/): every save applies the same change to the client's copies. `,
        st.map(c => h('span.tag' + (c.mode === 'different' ? '.warn' : c.mode === 'missing' ? '.info' : ''), { title: c.text }, `${c.name}: ${c.mode === 'identical' ? 'same' : c.mode === 'eol' ? 'same, LF' : c.mode === 'missing' ? 'no loose copy' : 'differs'}`)),
        ' Restart the WorldServer to apply.');
    } else add('info', `Only Server/Resource is edited. The game client reads its own copy of ${mod ? [...new Set([...FRE.Workspace.CORE_CLIENT, ...mod.client])].join(', ') : 'these files'}: choose the Client folder (toolbar) to update it on every save, or copy the changed files by hand. Restart the WorldServer to apply.`);
  }

  function renderList() {
    const el = $('list'); el.textContent = '';
    const extra = $('list-extra'); extra.textContent = '';
    if (!S.ws || !S.ws.available[S.mode].ok) return;
    const m = active();
    $('list-search').placeholder = m.searchPlaceholder || 'Search';
    if (m.listExtra) { const x = m.listExtra(ctx); if (x) extra.appendChild(x); }
    m.renderList(el, ctx);
  }

  // Re-rendering the same view (after an edit) keeps the scroll position; a new view starts at the top.
  let lastView = null;
  function renderEditor() {
    const el = $('editor');
    if (!S.ws) return;
    FRE.ui.tooltip.hide();                       // its element is about to be replaced
    const m = active(), view = S.mode + '|' + JSON.stringify(m.st || {});
    const top = view === lastView ? el.scrollTop : 0;
    lastView = view;
    el.className = ''; el.textContent = '';
    if (!S.ws.available[S.mode].ok) { el.appendChild(h('p.empty-state', `Not available: missing ${S.ws.available[S.mode].missing.join(', ')}`)); return; }
    m.renderEditor(el, ctx);
    el.scrollTop = top;
  }

  // ------------------------------------------------------------------ item database
  function buildItems() {
    S.items = [...S.ws.items.items.values()].map(it => S.ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name));
  }

  function renderItemFilters() {
    if (!S.ws) return;
    const D = S.ws.defines;
    const ik1 = $('item-ik1'), ik3 = $('item-ik3');
    const k1 = [...new Set(S.items.map(i => i.ik1))].sort((a, b) => a - b);
    ik1.textContent = '';
    ik1.appendChild(h('option', { value: '' }, 'All categories'));
    k1.forEach(v => ik1.appendChild(h('option', { value: v, selected: String(v) === S.ik1 }, (D.byValue('IK1_', v) || String(v)).replace(/^IK1_/, ''))));
    const k3 = [...new Set(S.items.filter(i => S.ik1 === '' || String(i.ik1) === S.ik1).map(i => i.ik3))].sort((a, b) => a - b);
    ik3.textContent = '';
    ik3.appendChild(h('option', { value: '' }, 'All types'));
    k3.forEach(v => ik3.appendChild(h('option', { value: v, selected: String(v) === S.ik3 }, (D.byValue('IK3_', v) || String(v)).replace(/^IK3_/, ''))));
  }

  function applyItemFilter() {
    const q = S.itemQuery.toLowerCase();
    S.filtered = S.items.filter(i =>
      (!q || i.name.toLowerCase().includes(q) || i.define.toLowerCase().includes(q)) &&
      (S.ik1 === '' || String(i.ik1) === S.ik1) &&
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
    paintItems();
  }

  function addFromDb(info) {
    const target = active().addTarget(ctx);
    if (!target.ok) { toast(target.title, 'bad'); return; }
    let cost = null;
    if (target.usesPrice) {
      const parsed = FRE.num.parseAmount($('new-price').value);
      if (!parsed.ok) { toast('Price for new items: ' + parsed.error, 'bad'); return; }
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
    const m = dm && modules().find(x => x.id === dm.id);
    if (!m || !m.locate || !m.locate(d, ctx)) return;
    S.mode = m.id;
    renderAll(false);
  }

  // ------------------------------------------------------------------ save
  // Changed lines of `f`: saved text vs. current text, or any before/after pair (edit previews).
  function renderDiff(f, before = f.originalText, after = f.text) {
    const a = FRE.diff.splitKeepEol(before), b = FRE.diff.splitKeepEol(after);
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

  async function onSave() {
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
    if (!(await FRE.fsa.ensurePermission(S.resDir)) || !(await FRE.fsa.ensurePermission(S.backupDir))) { toast('Write permission was not granted.', 'bad'); return; }

    const dirty = ws.dirtyFiles();
    const warns = ws.diags.filter(d => d.severity === 'WARN');
    const client = ws.clientCopiesNeeded();
    let clientBox = null;
    if (S.client) {
      if (!(await FRE.fsa.ensurePermission(S.client.dir))) { toast('Write permission to the Client folder was not granted.', 'bad'); return; }
      const plan = FRE.clientSync.plan(ws, S.client);
      clientBox = plan.length ? [h('h3', `Client/ (${S.client.dir.name})`), h('ul.plan', plan.map(p => h('li', h('b', p.name), ': ', p.text,
        p.mode === 'missing' ? h('label.check', ' ', h('input', { type: 'checkbox', checked: S.createMissing.has(p.lower),
          on: { change: e => { e.target.checked ? S.createMissing.add(p.lower) : S.createMissing.delete(p.lower); } } }), ' create Client/' + p.name + ' as a copy of the server file') : null)))] : null;
    }
    const body = h('div',
      h('p', `These lines will change. Everything else in the file${dirty.length > 1 ? 's' : ''} stays byte-for-byte identical.`),
      dirty.map(f => [h('h3', `${f.name}`), renderDiff(f)]),
      clientBox,
      warns.length ? h('p.muted', `${warns.length} warning(s) (not blocking) — see the problems panel.`) : null,
      h('p.muted.small', `Backup folder: ${S.backupDir.name}/<timestamp>/` + (!S.client && client.length ? ` · After saving, also copy to Client/: ${client.join(', ')}` : '')));
    modal({ title: `Review changes (${dirty.length} file${dirty.length > 1 ? 's' : ''})`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: `Back up and write ${dirty.length} file${dirty.length > 1 ? 's' : ''}`, cls: 'primary', onClick: runSave },
    ] });
  }

  async function runSave() {
    const log = h('div.log');
    const client = S.ws.clientCopiesNeeded();
    const m = modal({ title: 'Saving…', body: log, buttons: [{ label: 'Close' }] });
    const sync = S.client ? { dir: S.client.dir, files: S.client.files, create: S.createMissing } : null;
    const report = await FRE.save.save(S.ws, S.backupDir, msg => log.appendChild(document.createTextNode(msg + '\n')), sync)
      .catch(e => ({ ok: false, steps: [String(e && e.message || e)] }));
    if (!report.ok) log.appendChild(h('div', { style: 'color:var(--bad)' }, '\nNot saved: ' + (report.steps[report.steps.length - 1] || '')));
    else {
      S.edited.clear();
      for (const c of report.client || []) S.client.files.set(c.lower, new FRE.SourceFile(c.name, c.bytes, { handle: c.handle }));
      const synced = new Set((report.client || []).map(c => c.lower));
      const left = client.filter(n => !synced.has(n.toLowerCase()));
      if (left.length) log.appendChild(h('div', { style: 'color:var(--warn)' }, `\nNot in Client/ yet (copy by hand): ${left.join(', ')}`));
      toast(left.length ? 'Saved. Copy the remaining files to Client/ and restart the WorldServer.' : `Saved${synced.size ? ' (Server and Client)' : ''}. Restart the WorldServer to apply.`, 'ok');
    }
    m.el.querySelector('header').textContent = report.ok ? 'Saved' : 'Save failed';
    renderAll(false);
  }

  async function onBackup() {
    if (!S.ws) return;
    if (!S.backupDir && !(await pickBackup())) return;
    if (!(await FRE.fsa.ensurePermission(S.backupDir))) return;
    try { const name = await FRE.save.snapshot(S.ws, S.backupDir); toast(`Snapshot written: ${S.backupDir.name}/${name}`, 'ok'); }
    catch (e) { toast('Backup failed: ' + e.message, 'bad'); }
  }

  // ------------------------------------------------------------------ init
  async function init() {
    $('version').textContent = FRE.BUILD_INFO || 'dev';
    $('btn-load').onclick = pickResource;
    $('btn-backup-dir').onclick = pickBackup;
    $('btn-client-dir').onclick = pickClient;
    $('btn-save').onclick = onSave;
    $('btn-backup').onclick = onBackup;
    $('btn-undo').onclick = undo;
    $('btn-redo').onclick = redo;
    $('btn-diag').onclick = () => { S.diagOpen = !S.diagOpen; renderDiagPanel(); };
    $('list-search').oninput = e => { S.queries[S.mode] = e.target.value; renderList(); };
    $('item-search').oninput = e => { S.itemQuery = e.target.value; $('item-list').scrollTop = 0; renderItems(); };
    $('item-ik1').onchange = e => { S.ik1 = e.target.value; S.ik3 = ''; renderItemFilters(); renderItems(); };
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
    renderModes();
    renderBanners();
    if (!FRE.fsa.supported()) { $('btn-load').disabled = true; return; }
    const last = await FRE.fsa.recall('resource');
    if (last) {
      const btn = $('btn-reopen');
      btn.hidden = false; btn.textContent = `Reopen "${last.name}"`;
      btn.onclick = async () => { try { await loadFrom(last); btn.hidden = true; } catch (e) { toast(e.message, 'bad'); } };
    }
    const cl = await FRE.fsa.recall('client');
    if (cl && (await FRE.fsa.ensurePermission(cl, false))) { S.client = { dir: cl, files: new Map() }; renderToolbar(); }
    else if (cl) { $('client-name').textContent = `${cl.name} (click to re-allow)`; $('btn-client-dir').onclick = async () => { if (await FRE.fsa.ensurePermission(cl)) { await loadClient(cl); $('btn-client-dir').onclick = pickClient; renderAll(false); } else pickClient(); }; }
    const bk = await FRE.fsa.recall('backup');
    if (bk && (await FRE.fsa.ensurePermission(bk, false))) { S.backupDir = bk; renderToolbar(); }
    else if (bk) { $('backup-name').textContent = `${bk.name} (click to re-allow)`; $('btn-backup-dir').onclick = async () => { if (await FRE.fsa.ensurePermission(bk)) { S.backupDir = bk; $('btn-backup-dir').onclick = pickBackup; renderToolbar(); } else pickBackup(); }; }
  }

  FRE.app = { init, state: S, ctx, setMode };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(globalThis.FRE = globalThis.FRE || {});
