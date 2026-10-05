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
  // client (optional): { dir, files: Map lower -> SourceFile, create: Set of lower names }
  //   -> the same change is written to the Client/ copies (FRE.clientSync), with the
  //      same conflict check, backup (<backup>/<stamp>/Client/), verify and restore.
  async function save(ws, backupDir, log = () => {}, client = null) {
    const report = { ok: false, steps: [], files: [], backupFolder: null, client: [] };
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
    // Client/ copies: what to write, and the same "unchanged since load" check
    const targets = [];
    if (client) {
      for (const p of FRE.clientSync.plan(ws, client)) {
        if (p.mode === 'different') { step(`Client/${p.name}: ${p.text}.`); continue; }
        if (p.mode === 'missing' && !client.create.has(p.lower)) { step(`Client/${p.name}: no loose copy, not created (the client keeps reading data.res).`); continue; }
        if (p.client) {
          const cur = await FRE.fsa.readHandle(p.client.handle);
          if (!B.bytesEqual(cur.bytes, p.client.bytes)) {
            step(`Aborted: Client/${p.name} was changed on disk since it was loaded. Nothing was written. Reload the Client folder.`);
            report.conflict = 'Client/' + p.name;
            return report;
          }
        } else if (await exists(client.dir, p.name)) {
          step(`Aborted: Client/${p.name} appeared on disk since it was loaded. Nothing was written. Reload the Client folder.`);
          report.conflict = 'Client/' + p.name;
          return report;
        }
        targets.push(p);
      }
    }
    step(`Disk contents unchanged since load${targets.length ? ' (Server and Client)' : ''}.`);

    // 2. backup the current disk bytes, verified
    const folder = await FRE.fsa.newFolder(backupDir, stampName());
    report.backupFolder = folder.name;
    for (const f of dirty) await FRE.fsa.newFile(folder, f.name, onDisk.get(f));
    const existing = targets.filter(t => t.client);
    if (existing.length) {
      const cf = await folder.getDirectoryHandle('Client', { create: true });
      for (const t of existing) await FRE.fsa.newFile(cf, t.client.name, t.client.bytes);
    }
    step(`Backup written and verified: ${backupDir.name}/${folder.name}/ (${dirty.length} file(s)${existing.length ? ` + ${existing.length} in Client/` : ''})`);

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
      for (const t of targets) {
        let handle;
        if (t.client) { handle = t.client.handle; await FRE.fsa.writeVerified(handle, t.bytes); }
        else handle = await FRE.fsa.newFile(client.dir, t.name, t.bytes);
        report.client.push({ name: t.name, lower: t.lower, mode: t.mode, handle, bytes: t.bytes, before: t.client ? t.client.bytes : null });
        step(`Client/${t.name}: ${t.mode === 'missing' ? 'created as a copy of the server file' : t.mode === 'eol' ? 'same change written, LF kept' : 'same change written'} and verified (${t.bytes.length} bytes).`);
      }
    } catch (e) {
      step(`WRITE FAILED: ${e.message}. Restoring from the backup...`);
      for (const w of written) {
        try { await FRE.fsa.writeVerified(w.f.handle, onDisk.get(w.f)); step(`Restored ${w.f.name}.`); }
        catch (e2) { step(`!! Could not restore ${w.f.name}: ${e2.message}. Copy it back manually from ${folder.name}.`); }
      }
      for (const c of report.client) {
        try {
          if (c.before) await FRE.fsa.writeVerified(c.handle, c.before);
          else await client.dir.removeEntry(c.name);
          step(`Restored Client/${c.name}.`);
        } catch (e2) { step(`!! Could not restore Client/${c.name}: ${e2.message}. Copy it back manually from ${folder.name}/Client.`); }
      }
      report.client = [];
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

  async function exists(dir, name) {
    try { await dir.getFileHandle(name); return true; } catch (e) { if (e.name === 'NotFoundError') return false; throw e; }
  }

  async function writeManifest(folder, report, status) {
    const manifest = {
      tool: 'FLYFF Resource Editor', version: VERSION, status, time: new Date().toISOString(),
      files: report.files.map(f => ({ name: f.name, bytesBefore: f.before, bytesAfter: f.after, changes: f.changes })),
      client: report.client.map(c => ({ name: 'Client/' + c.name, mode: c.mode, bytesBefore: c.before ? c.before.length : null, bytesAfter: c.bytes.length })),
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
