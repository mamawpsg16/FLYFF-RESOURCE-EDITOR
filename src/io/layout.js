// Finds the folders the editor needs inside the ONE folder the user picks.
//   FLYFF-V19-SOURCE/                 -> real:  Server/Resource + Client (backups asked at the first save)
//   FLYFF-RESOURCE-EDITOR/test-data/  -> test:  Resource + Client + backups (created)
//   a folder with Masquerade.prj      -> plain: that folder, no Client
// Names are matched case-insensitively, like Windows. Nothing is ever created inside a real
// source folder.
(function (FRE) {
  'use strict';

  async function child(dir, name) {
    for await (const [n, handle] of dir.entries()) if (handle.kind === 'directory' && n.toLowerCase() === name.toLowerCase()) return handle;
    return null;
  }
  async function hasFile(dir, name) {
    for await (const [n, handle] of dir.entries()) if (handle.kind === 'file' && n.toLowerCase() === name.toLowerCase()) return true;
    return false;
  }

  // -> { kind: 'real' | 'test' | 'plain', root, res, client, backups } ; throws when nothing fits
  async function detectLayout(dir) {
    const server = await child(dir, 'Server');
    const sres = server && await child(server, 'Resource');
    if (sres) return { kind: 'real', root: dir, res: sres, client: await child(dir, 'Client'), backups: null };
    const res = await child(dir, 'Resource');
    if (res) {
      const backups = (await child(dir, 'backups')) || await dir.getDirectoryHandle('backups', { create: true });
      return { kind: 'test', root: dir, res, client: await child(dir, 'Client'), backups };
    }
    if (await hasFile(dir, 'Masquerade.prj')) return { kind: 'plain', root: dir, res: dir, client: null, backups: null };
    throw new Error(`"${dir.name}" is not the source folder: there is no Server/Resource inside it. Pick FLYFF-V19-SOURCE (or FLYFF-RESOURCE-EDITOR/test-data to test).`);
  }

  // display paths, relative to the picked folder
  function describe(L) {
    return {
      res: L.kind === 'real' ? `${L.root.name}/Server/Resource` : L.kind === 'test' ? `${L.root.name}/Resource` : L.root.name,
      client: L.client ? `${L.root.name}/Client` : null,
      backups: L.backups ? `${L.root.name}/backups` : null,
      label: L.kind === 'test' ? 'TEST COPY' : L.kind === 'real' ? 'REAL SERVER FILES' : 'SERVER FILES',
    };
  }

  FRE.layout = { detectLayout, describe, child };
})(globalThis.FRE = globalThis.FRE || {});
