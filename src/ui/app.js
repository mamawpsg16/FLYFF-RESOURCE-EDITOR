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
    ws: null, resDir: null, backupDir: null, mode: 'npc',
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
    for (const m of modules()) {
      const av = S.ws ? S.ws.available[m.id] : { ok: false, missing: [] };
      el.appendChild(h('button.mode' + (m.id === S.mode ? '.sel' : ''), {
        disabled: !S.ws || !av.ok,
        title: !S.ws ? 'Load a folder first' : av.ok ? m.label : `Not available: missing ${av.missing.join(', ')}`,
        on: { click: () => setMode(m.id) },
      }, m.label));
    }
  }

  function renderToolbar() {
    const ws = S.ws;
    $('backup-name').textContent = S.backupDir ? S.backupDir.name : 'not set';
    $('btn-undo').disabled = !ws || !ws.history.length;
    $('btn-redo').disabled = !ws || !ws.redoStack.length;
    const dirty = ws ? ws.dirtyFiles() : [];
    $('btn-save').disabled = !dirty.length;
    $('btn-save').textContent = dirty.length ? `Save (${dirty.length})` : 'Save';
    $('btn-backup').disabled = !ws;
    const fs = $('file-status'); fs.textContent = '';
    if (ws) {
      const shown = new Set(['spec_item.txt', 'propitem.txt.txt']);
      for (const m of FRE.Workspace.MODULES) m.editable.forEach(n => shown.add(n.toLowerCase()));
      for (const lower of shown) {
        const f = ws.files.get(lower);
        if (!f) continue;
        const cls = f.readOnly ? 'ro' : f.dirty ? 'ok.dirty' : 'ok';
        fs.appendChild(h('span.file-chip.' + cls, { title: f.readOnly ? f.readOnlyReasons.join('\n') : `${f.kind}, ${fmt(f.bytes.length)} bytes` }, f.name + (f.dirty ? ' •' : '')));
      }
      const nd = FRE.DEFINE_FILES.filter(n => ws.files.has(n.toLowerCase())).length;
      fs.appendChild(h('span.file-chip.' + (nd === FRE.DEFINE_FILES.length ? 'ok' : 'missing'), { title: ws.defines.missing.join(', ') || 'all define headers found' }, `defines ${nd}/${FRE.DEFINE_FILES.length}`));
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
    add('info', `Only Server/Resource is edited. The game client reads its own copy of ${mod ? mod.client.join(', ') : 'these files'}: after saving, copy the changed files to Client/ too. Restart the WorldServer to apply.`);
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

  function renderEditor() {
    const el = $('editor');
    if (!S.ws) return;
    el.className = ''; el.textContent = '';
    if (!S.ws.available[S.mode].ok) { el.appendChild(h('p.empty-state', `Not available: missing ${S.ws.available[S.mode].missing.join(', ')}`)); return; }
    active().renderEditor(el, ctx);
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
        h('div.nm', { title: `${it.name}\n${it.define} (${it.id})\nprice ${fmt(it.cost)} Penya · chip price ${it.chipCost > 0 ? fmt(it.chipCost) : 'none'}` }, h('span.r-' + it.rarity, it.name), h('span.def', it.define)),
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
  function renderDiff(f) {
    const a = FRE.diff.splitKeepEol(f.originalText), b = FRE.diff.splitKeepEol(f.text);
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
    const body = h('div',
      h('p', `These lines will change. Everything else in the file${dirty.length > 1 ? 's' : ''} stays byte-for-byte identical.`),
      dirty.map(f => [h('h3', `${f.name}`), renderDiff(f)]),
      warns.length ? h('p.muted', `${warns.length} warning(s) (not blocking) — see the problems panel.`) : null,
      h('p.muted.small', `Backup folder: ${S.backupDir.name}/<timestamp>/` + (client.length ? ` · After saving, also copy to Client/: ${client.join(', ')}` : '')));
    modal({ title: `Review changes (${dirty.length} file${dirty.length > 1 ? 's' : ''})`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: `Back up and write ${dirty.length} file${dirty.length > 1 ? 's' : ''}`, cls: 'primary', onClick: runSave },
    ] });
  }

  async function runSave() {
    const log = h('div.log');
    const client = S.ws.clientCopiesNeeded();
    const m = modal({ title: 'Saving…', body: log, buttons: [{ label: 'Close' }] });
    const report = await FRE.save.save(S.ws, S.backupDir, msg => log.appendChild(document.createTextNode(msg + '\n')))
      .catch(e => ({ ok: false, steps: [String(e && e.message || e)] }));
    if (!report.ok) log.appendChild(h('div', { style: 'color:var(--bad)' }, '\nNot saved: ' + (report.steps[report.steps.length - 1] || '')));
    else {
      S.edited.clear();
      if (client.length) log.appendChild(h('div', { style: 'color:var(--warn)' }, `\nNow copy to Client/: ${client.join(', ')}`));
      toast('Saved. Copy changed files to Client/ and restart the WorldServer.', 'ok');
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
    renderModes();
    renderBanners();
    if (!FRE.fsa.supported()) { $('btn-load').disabled = true; return; }
    const last = await FRE.fsa.recall('resource');
    if (last) {
      const btn = $('btn-reopen');
      btn.hidden = false; btn.textContent = `Reopen "${last.name}"`;
      btn.onclick = async () => { try { await loadFrom(last); btn.hidden = true; } catch (e) { toast(e.message, 'bad'); } };
    }
    const bk = await FRE.fsa.recall('backup');
    if (bk && (await FRE.fsa.ensurePermission(bk, false))) { S.backupDir = bk; renderToolbar(); }
    else if (bk) { $('backup-name').textContent = `${bk.name} (click to re-allow)`; $('btn-backup-dir').onclick = async () => { if (await FRE.fsa.ensurePermission(bk)) { S.backupDir = bk; $('btn-backup-dir').onclick = pickBackup; renderToolbar(); } else pickBackup(); }; }
  }

  FRE.app = { init, state: S, ctx, setMode };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(globalThis.FRE = globalThis.FRE || {});
