// File System Access API wrapper (Chrome / Edge). See docs/DESIGN.md §2.1.
(function (FRE) {
  'use strict';

  const supported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  async function pickFolder(id) {
    return window.showDirectoryPicker({ id, mode: 'readwrite' });
  }

  // Returns true when we may read+write; asks the user if needed (needs a click).
  async function ensurePermission(handle, ask = true) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (!ask) return false;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  // Case-insensitive lookup of the wanted top-level files (Windows-like).
  async function findFiles(dir, wantedNames) {
    const wanted = new Set(wantedNames.map(n => n.toLowerCase()));
    const found = new Map();
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && wanted.has(name.toLowerCase())) found.set(name.toLowerCase(), handle);
    }
    return found;
  }

  async function readHandle(fileHandle) {
    const file = await fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { bytes, stamp: { size: file.size, lastModified: file.lastModified } };
  }

  // createWritable() writes to a temporary swap file and only replaces the
  // original when close() succeeds; abort() discards it.
  async function writeHandle(fileHandle, bytes) {
    const w = await fileHandle.createWritable({ keepExistingData: false });
    try {
      await w.write(bytes);
      await w.close();
    } catch (e) {
      try { await w.abort(); } catch (_) { /* already closed */ }
      throw e;
    }
  }

  async function writeVerified(fileHandle, bytes) {
    await writeHandle(fileHandle, bytes);
    const back = await readHandle(fileHandle);
    if (!FRE.bytes.bytesEqual(back.bytes, bytes)) throw new Error(`${fileHandle.name}: read-back after writing does not match`);
    return back.stamp;
  }

  async function newFolder(parent, name) {
    // never reuse an existing folder: append -2, -3 ...
    let n = name, k = 1;
    for (;;) {
      try { await parent.getDirectoryHandle(n); k++; n = `${name}-${k}`; }
      catch (e) { if (e.name === 'NotFoundError') break; else throw e; }
    }
    return parent.getDirectoryHandle(n, { create: true });
  }

  async function newFile(dir, name, bytes) {
    const h = await dir.getFileHandle(name, { create: true });
    await writeVerified(h, bytes);
    return h;
  }

  // Remember folder handles between sessions (permission is asked again).
  const DB = 'flyff-resource-editor', STORE = 'handles';
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function remember(key, handle) {
    try {
      const db = await idb();
      await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(handle, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
    } catch (e) { console.warn('could not remember folder', e); }
  }
  async function recall(key) {
    try {
      const db = await idb();
      return await new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
    } catch (e) { return null; }
  }

  FRE.fsa = { supported, pickFolder, ensurePermission, findFiles, readHandle, writeHandle, writeVerified, newFolder, newFile, remember, recall };
})(globalThis.FRE = globalThis.FRE || {});
