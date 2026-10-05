// Build 1 UI: NPC Shop Editor. All data changes go through Workspace.apply()
// with splices from FRE.shopOps; everything shown is re-derived from the file
// text after each edit.
(function (FRE) {
  'use strict';
  const { h, $, fmt, toast, modal } = FRE.dom;
  const ROW_H = 40;

  const S = {
    ws: null, resDir: null, backupDir: null,
    sel: null, tab: 0, shopsOnly: true, npcQuery: '',
    items: [], filtered: [], rarity: new Set(), ik1: '', ik3: '', itemQuery: '',
    edited: new Set(), diagOpen: false,
  };
  const npcId = npc => `${npc.file}|${npc.key}`;
  const selNpc = () => S.ws && S.sel ? S.ws.chars.npcs.find(n => npcId(n) === S.sel) || null : null;
  const isShopNpc = npc => npc.statements.some(r => FRE.character.shopEntry(r)) || npc.venderType > 0;

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
    const found = await FRE.fsa.findFiles(dir, FRE.Workspace.REQUIRED);
    for (const must of ['masquerade.prj', 'character.inc', 'spec_item.txt']) {
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
    const first = S.ws.chars.npcs.find(isShopNpc);
    S.sel = first ? npcId(first) : null; S.tab = 0;
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

  // ------------------------------------------------------------------ editing
  function edit(npc, makeSplices, label) {
    const f = S.ws.fileOfNpc(npc);
    try {
      const splices = makeSplices(f.text);
      S.ws.apply(f.name.toLowerCase(), splices, label);
      S.edited.add(npcId(npc));
    } catch (e) { toast(e.message, 'bad'); }
    renderAll(false);
  }

  function addItemToSelected(info) {
    const npc = selNpc();
    if (!npc) { toast('Select an NPC first.', 'bad'); return; }
    const p = $('new-price').value.trim();
    const cost = p === '' ? null : Number(p);
    edit(npc, text => FRE.shopOps.addItem(text, npc, S.tab, info.define, cost), `add ${info.define}`);
  }

  function undo() { if (S.ws && S.ws.undo() !== null) renderAll(false); }
  function redo() { if (S.ws && S.ws.redo() !== null) renderAll(false); }

  // ------------------------------------------------------------------ rendering
  function renderAll(withItems = true) {
    renderToolbar(); renderBanners(); renderNpcList(); renderEditor();
    if (withItems) renderItemFilters();
    renderItems();
    if (S.diagOpen) renderDiagPanel();
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
      const chip = (label, lower) => {
        const f = ws.files.get(lower);
        const cls = !f ? 'missing' : f.readOnly ? 'ro' : f.dirty ? 'ok.dirty' : 'ok';
        fs.appendChild(h('span.file-chip.' + cls, { title: f ? (f.readOnly ? f.readOnlyReasons.join('\n') : `${f.kind}, ${fmt(f.bytes.length)} bytes`) : 'not found' }, label + (f && f.dirty ? ' •' : '')));
      };
      ['character.inc', 'character-etc.inc', 'character-school.inc', 'Spec_Item.txt', 'propItem.txt.txt', 'character.txt.txt'].forEach(n => chip(n, n.toLowerCase()));
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
    if (!FRE.fsa.supported()) add('bad', 'This browser cannot open folders (File System Access API). Use Chrome or Edge.');
    if (!S.ws) return;
    const ws = S.ws;
    if (ws.missing.length) add('bad', `Missing files: ${ws.missing.join(', ')}`);
    for (const f of ws.files.values()) if (f.readOnly) add('bad', `🔒 ${f.name} is READ-ONLY: ${f.readOnlyReasons.join('; ')}`);
    if (ws.items.stopped) add('bad', `Spec_Item.txt: the server stops loading items at offset ${ws.items.stopped.start}; later items are missing.`);
    if (S.resDir && S.resDir.name.toLowerCase() !== 'resource') add('info', `Editing folder "${S.resDir.name}" (a test copy?).`);
    add('info', 'Only Server/Resource is edited. The game client reads its own copy: after saving, also copy the changed character*.inc files to Client/ so shop lists and prices match. Restart the WorldServer to apply.');
  }

  function renderNpcList() {
    const el = $('npc-list'); el.textContent = '';
    if (!S.ws) return;
    const q = S.npcQuery.toLowerCase();
    const diagBy = new Map();
    for (const d of S.ws.diags) if (d.npcKey) {
      const k = `${d.file}|${d.npcKey}`; const o = diagBy.get(k) || { w: 0, b: 0 };
      if (d.severity === 'BLOCK') o.b++; else if (d.severity === 'WARN') o.w++;
      diagBy.set(k, o);
    }
    const frag = document.createDocumentFragment();
    let shown = 0;
    for (const npc of S.ws.chars.npcs) {
      if (S.shopsOnly && !isShopNpc(npc)) continue;
      const label = npc.name || npc.key;
      if (q && !label.toLowerCase().includes(q) && !npc.key.toLowerCase().includes(q)) continue;
      const id = npcId(npc), dg = diagBy.get(id);
      shown++;
      frag.appendChild(h('div.npc' + (id === S.sel ? '.sel' : ''), { on: { click: () => { S.sel = id; S.tab = 0; renderAll(false); } } },
        h('div.n', h('span', label),
          h('span', npc.venderType === 1 ? h('span.tag.chip', 'Red Chip') : npc.venderType === 2 ? h('span.tag.chip', 'Donate') : null,
            S.edited.has(id) ? h('span.tag.edit', 'edited') : null,
            dg && dg.b ? h('span.tag.bad', '⛔' + dg.b) : dg && dg.w ? h('span.tag.warn', '⚠' + dg.w) : null)),
        h('div.k', `${npc.key} · ${npc.file}`)));
    }
    if (!shown) frag.appendChild(h('div.pad.muted', 'No NPCs match.'));
    el.appendChild(frag);
  }

  function itemLabel(id) {
    const it = S.ws.itemById(id);
    if (!it) return { name: '(not in Spec_Item.txt)', rarity: '', info: null };
    const info = S.ws.itemInfo(it);
    return { name: info.name, rarity: info.rarity, info };
  }

  function diagsIn(npc, rec) {
    return S.ws.diags.filter(d => d.file === npc.file && d.start !== undefined && (rec ? (d.start >= rec.start && d.start < Math.max(rec.end, rec.start + 1)) : d.npcKey === npc.key));
  }
  function diagTags(list) {
    return list.map(d => h('span.tag.' + (d.severity === 'BLOCK' ? 'bad' : 'warn'), { title: d.message }, (d.severity === 'BLOCK' ? '⛔ ' : '⚠ ') + d.code));
  }

  function renderEditor() {
    const el = $('editor');
    const npc = selNpc();
    if (!S.ws || !npc) { if (S.ws) { el.className = 'empty-state'; el.innerHTML = '<p>Select an NPC on the left.</p>'; } return; }
    el.className = ''; el.textContent = '';
    const f = S.ws.fileOfNpc(npc);
    const canEdit = S.ws.isEditable(f.name.toLowerCase());
    const chip = npc.venderType === 1 || npc.venderType === 2;
    const entries = npc.statements.map(r => ({ r, e: FRE.character.shopEntry(r) })).filter(x => x.e);

    el.appendChild(h('div.npc-title', h('h2', npc.name || npc.key), h('span.def', npc.key),
      h('span.line', `${npc.file}:${f.lineOf(npc.start) + 1}`),
      chip ? h('span.tag.chip', npc.venderType === 1 ? 'Red Chip shop' : 'Donate Chip shop') : h('span.tag', 'Penya shop'),
      canEdit ? null : h('span.tag.bad', 'read-only')));

    const tabs = h('div.tabs');
    for (let t = 0; t < 4; t++) {
      const n = entries.filter(x => x.e.slot === t).length;
      tabs.appendChild(h('button' + (t === S.tab ? '.sel' : ''), { on: { click: () => { S.tab = t; renderEditor(); renderItems(); } } },
        npc.slotTitles[t] || `Tab ${t}`, h('span.count', n ? `(${n})` : '')));
    }
    el.appendChild(tabs);

    // fixed items (AddShopItem / AddVenderItem2)
    const fixed = entries.filter(x => (x.e.kind === 'fixed' || x.e.kind === 'chip') && x.e.slot === S.tab);
    el.appendChild(h('h3', chip ? 'Chip items (AddVenderItem2)' : 'Fixed items (AddShopItem)'));
    if (!fixed.length) el.appendChild(h('p.muted', 'None in this tab. Use + in the item list on the right to add one.'));
    else {
      const tb = h('table', h('tr', h('th', 'Item'), h('th', 'Define'), h('th.num', chip ? 'Chip price' : 'Price'), h('th', 'Tab'), h('th', ''), h('th', '')));
      for (const { r, e } of fixed) {
        const id = e.item.value >>> 0;
        const lab = itemLabel(id);
        const def = e.item.define || f.text.slice(e.item.start, e.item.end);
        let priceCell;
        if (e.kind === 'chip') priceCell = h('td.num', lab.info ? fmt(lab.info.chipCost) : '');
        else {
          const inp = h('input', { type: 'number', min: 0, step: 1, value: e.cost ? e.cost.value : '', placeholder: lab.info ? fmt(lab.info.cost) + ' (item)' : '', disabled: !canEdit,
            title: 'Empty = the item\'s own price from Spec_Item.txt. A price here changes the item\'s price everywhere (server-wide).',
            on: { change: ev => { const v = ev.target.value.trim(); edit(npc, text => FRE.shopOps.setCost(text, r, v === '' ? null : Number(v)), 'price'); } } });
          priceCell = h('td.num', inp);
        }
        const sel = h('select', { disabled: !canEdit, on: { change: ev => edit(npc, text => FRE.shopOps.setSlot(text, r, Number(ev.target.value)), 'move tab') } },
          [0, 1, 2, 3].map(t => h('option', { value: t, selected: t === e.slot }, String(t))));
        tb.appendChild(h('tr', h('td', h('span.r-' + lab.rarity, lab.name), ' ', diagTags(diagsIn(npc, r))),
          h('td.def', def), priceCell, h('td', sel), h('td.line', 'L' + (f.lineOf(r.start) + 1)),
          h('td', h('button.icon.danger', { disabled: !canEdit, title: 'Remove', on: { click: () => edit(npc, text => FRE.shopOps.removeStatement(text, r), `remove ${def}`) } }, '✕'))));
      }
      el.appendChild(tb);
    }

    // generated stock (read-only in Build 1)
    const gen = entries.filter(x => x.e.kind === 'generated' && x.e.slot === S.tab);
    if (gen.length) {
      el.appendChild(h('h3', 'Generated stock (AddVendorItem) · read-only'));
      const D = S.ws.defines;
      const tb = h('table', h('tr', h('th', 'Item kind'), h('th', 'Job'), h('th.num', 'Rarity'), h('th.num', 'Count'), h('th', '')));
      for (const { r, e } of gen) {
        const ik3 = e.ik3.define || D.byValue('IK3_', e.ik3.value) || e.ik3.value;
        const job = e.job.value === -1 ? 'any' : (e.job.define || D.byValue('JOB_', e.job.value) || e.job.value);
        tb.appendChild(h('tr', h('td.def', ik3, e.lang ? ` (lang ${e.lang.value})` : ''), h('td.def', job),
          h('td.num', `${e.rareMin.value}–${e.rareMax.value}`), h('td.num', e.count.value), h('td.line', 'L' + (f.lineOf(r.start) + 1))));
      }
      el.appendChild(tb);
    }

    const nd = diagsIn(npc, null);
    if (nd.length) {
      el.appendChild(h('h3', 'Problems for this NPC'));
      nd.forEach(d => el.appendChild(h('div.diag', h('span.sev.' + d.severity, d.severity), h('span', d.message))));
    }
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
    const list = $('item-list');
    if (!S.ws) return;
    applyItemFilter();
    $('item-spacer').style.height = S.filtered.length * ROW_H + 'px';
    $('item-count').textContent = `${fmt(S.filtered.length)} of ${fmt(S.items.length)} items`;
    paintItems();
  }

  function paintItems() {
    const list = $('item-list');
    [...list.querySelectorAll('.item')].forEach(n => n.remove());
    const npc = selNpc();
    const canAdd = npc && S.ws.isEditable(npc.file.toLowerCase());
    const from = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 5);
    const to = Math.min(S.filtered.length, from + Math.ceil(list.clientHeight / ROW_H) + 10);
    const frag = document.createDocumentFragment();
    for (let i = from; i < to; i++) {
      const it = S.filtered[i];
      const atk = it.atkMax > 0 ? `${it.atkMin}–${it.atkMax}` : '';
      frag.appendChild(h('div.item', { style: `top:${i * ROW_H}px` },
        h('div.nm', { title: `${it.name}\n${it.define} (${it.id})\nprice ${fmt(it.cost)}` }, h('span.r-' + it.rarity, it.name), h('span.def', it.define)),
        h('div.ty', { title: it.ik3Name || '' }, (it.ik3Name || '').replace(/^IK3_/, '')),
        h('div.num', it.level > 0 ? it.level : ''),
        h('div.num', atk),
        h('button', { disabled: !canAdd, title: npc ? `Add to ${npc.name || npc.key}, tab ${S.tab}` : 'Select an NPC first', on: { click: () => addItemToSelected(it) } }, '+')));
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
      el.appendChild(h('div.diag', { on: { click: () => {
        const npc = d.npcKey && S.ws.chars.npcs.find(n => n.key === d.npcKey && n.file === d.file);
        if (npc) { S.sel = npcId(npc); renderAll(false); }
      } } },
        h('span.sev.' + d.severity, d.severity), fresh.has(d) ? h('span.new', 'new') : null,
        h('span', d.message), h('span.line', f && d.start !== undefined ? `${d.file}:${f.lineOf(d.start) + 1}` : d.file || '')));
    }
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

  async function onSave() {
    const ws = S.ws;
    if (!ws || !ws.dirtyFiles().length) return;
    const nb = ws.newBlocking();
    if (nb.length) {
      modal({ title: '⛔ Cannot save: your edits introduced blocking problems',
        body: h('div', nb.map(d => h('div.diag', h('span.sev.BLOCK', 'BLOCK'), h('span', d.message)))) });
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
    const body = h('div',
      h('p', `These lines will change. Everything else in the file${dirty.length > 1 ? 's' : ''} stays byte-for-byte identical.`),
      dirty.map(f => [h('h3', `${f.name}`), renderDiff(f)]),
      warns.length ? h('p.muted', `${warns.length} warning(s) (not blocking) — see the problems panel.`) : null,
      h('p.muted.small', `Backup folder: ${S.backupDir.name}/<timestamp>/ · Remember to copy changed character*.inc files to Client/.`));
    modal({ title: `Review changes (${dirty.length} file${dirty.length > 1 ? 's' : ''})`, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: `Back up and write ${dirty.length} file${dirty.length > 1 ? 's' : ''}`, cls: 'primary', onClick: runSave },
    ] });
  }

  async function runSave() {
    const log = h('div.log');
    const m = modal({ title: 'Saving…', body: log, buttons: [{ label: 'Close' }] });
    const report = await FRE.save.save(S.ws, S.backupDir, msg => log.appendChild(document.createTextNode(msg + '\n')))
      .catch(e => ({ ok: false, steps: [String(e && e.message || e)] }));
    if (!report.ok) log.appendChild(h('div', { style: 'color:var(--bad)' }, '\nNot saved: ' + (report.steps[report.steps.length - 1] || '')));
    else { S.edited.clear(); toast('Saved. Copy changed files to Client/ and restart the WorldServer.', 'ok'); }
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
    $('npc-search').oninput = e => { S.npcQuery = e.target.value; renderNpcList(); };
    $('npc-shops-only').onchange = e => { S.shopsOnly = e.target.checked; renderNpcList(); };
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

  FRE.app = { init, state: S };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
})(globalThis.FRE = globalThis.FRE || {});
