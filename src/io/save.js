// Save pipeline (docs/DESIGN.md §2.3). Every step is logged; any failure
// before writing aborts with nothing changed, a failure while writing
// restores the files already written from the fresh backup.
(function (FRE) {
  'use strict';
  const B = FRE.bytes;
  const VERSION = 'build-1';

  function stampName(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  function changeSummary(f) {
    const a = FRE.diff.splitKeepEol(f.originalText), b = FRE.diff.splitKeepEol(f.text);
    const ops = FRE.diff.diffLines(a, b);
    const out = [];
    for (const o of ops) {
      if (o.type === 'del') out.push({ type: 'del', line: o.a + 1, text: f.display(a[o.a]).replace(/\r?\n$|\r$/, '') });
      if (o.type === 'add') out.push({ type: 'add', line: o.b + 1, text: f.display(b[o.b]).replace(/\r?\n$|\r$/, '') });
    }
    return out;
  }

  // ws: Workspace, backupDir: directory handle, log: (msg) => void
  async function save(ws, backupDir, log = () => {}) {
    const report = { ok: false, steps: [], files: [], backupFolder: null };
    const step = (m) => { report.steps.push(m); log(m); };
    const dirty = ws.dirtyFiles();
    if (!dirty.length) { step('Nothing to save.'); report.ok = true; return report; }

    const blocking = ws.newBlocking();
    if (blocking.length) { step(`Aborted: ${blocking.length} new blocking problem(s). Nothing was written.`); report.blocking = blocking; return report; }
    for (const f of dirty) if (!f.handle) { step(`Aborted: ${f.name} has no file handle.`); return report; }

    // 1. conflict check: the disk must still hold exactly what we loaded
    const onDisk = new Map();
    for (const f of dirty) {
      const cur = await FRE.fsa.readHandle(f.handle);
      if (!B.bytesEqual(cur.bytes, f.bytes)) {
        step(`Aborted: ${f.name} was changed on disk since it was loaded (another program, git, or another tab). Nothing was written. Reload the folder.`);
        report.conflict = f.name;
        return report;
      }
      onDisk.set(f, cur.bytes);
    }
    step('Disk contents unchanged since load.');

    // 2. backup the current disk bytes, verified
    const folder = await FRE.fsa.newFolder(backupDir, stampName());
    report.backupFolder = folder.name;
    for (const f of dirty) await FRE.fsa.newFile(folder, f.name, onDisk.get(f));
    step(`Backup written and verified: ${backupDir.name}/${folder.name}/ (${dirty.length} file(s))`);

    // 3. write + verify each file; restore on failure
    const written = [];
    try {
      for (const f of dirty) {
        const candidate = f.serialize();
        const stamp = await FRE.fsa.writeVerified(f.handle, candidate);
        written.push({ f, candidate, stamp });
        report.files.push({ name: f.name, before: f.bytes.length, after: candidate.length, changes: changeSummary(f) });
        step(`Wrote and verified ${f.name} (${f.bytes.length} -> ${candidate.length} bytes).`);
      }
    } catch (e) {
      step(`WRITE FAILED: ${e.message}. Restoring from the backup...`);
      for (const w of written) {
        try { await FRE.fsa.writeVerified(w.f.handle, onDisk.get(w.f)); step(`Restored ${w.f.name}.`); }
        catch (e2) { step(`!! Could not restore ${w.f.name}: ${e2.message}. Copy it back manually from ${folder.name}.`); }
      }
      await writeManifest(folder, report, 'failed-restored');
      return report;
    }

    await writeManifest(folder, report, 'ok');
    for (const w of written) w.f.commitSaved(w.candidate, w.stamp);
    ws.markSaved();
    report.ok = true;
    step('Saved.');
    return report;
  }

  async function writeManifest(folder, report, status) {
    const manifest = {
      tool: 'FLYFF Resource Editor', version: VERSION, status, time: new Date().toISOString(),
      files: report.files.map(f => ({ name: f.name, bytesBefore: f.before, bytesAfter: f.after, changes: f.changes })),
      log: report.steps,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await FRE.fsa.newFile(folder, 'manifest.json', bytes);
  }

  // Toolbar "Backup": snapshot of every loaded file as it is on disk right now.
  async function snapshot(ws, backupDir, log = () => {}) {
    const folder = await FRE.fsa.newFolder(backupDir, stampName() + '_snapshot');
    const names = [];
    for (const f of ws.files.values()) {
      if (!f.handle) continue;
      const cur = await FRE.fsa.readHandle(f.handle);
      await FRE.fsa.newFile(folder, f.name, cur.bytes);
      names.push(f.name);
    }
    const manifest = { tool: 'FLYFF Resource Editor', version: VERSION, status: 'snapshot', time: new Date().toISOString(), files: names };
    await FRE.fsa.newFile(folder, 'manifest.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
    log(`Snapshot of ${names.length} files written to ${backupDir.name}/${folder.name}/`);
    return folder.name;
  }

  FRE.save = { save, snapshot, changeSummary, stampName };
})(globalThis.FRE = globalThis.FRE || {});
