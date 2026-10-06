// Shared bootstrap for running the editor's core (no DOM) under gjs:
//   gjs -m tests/<file>.js   (run from the repo root)
// Loads src/ files in build order into the global scope, like the browser does.
import GLib from 'gi://GLib';

export const ROOT = GLib.get_current_dir();

export function readBytes(path) {
  const [ok, data] = GLib.file_get_contents(path);
  if (!ok) throw new Error('cannot read ' + path);
  return data;
}
export function readText(path) { return new TextDecoder('utf-8').decode(readBytes(path)); }
export function exists(path) { return GLib.file_test(path, GLib.FileTest.EXISTS); }
export function listDir(path) {
  const d = GLib.Dir.open(path, 0); const out = []; let n;
  while ((n = d.read_name()) !== null) out.push(n);
  d.close(); return out;
}

// Load core sources (order from build.py)
const order = readText(ROOT + '/src/order.txt').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#') && !s.startsWith('ui/') && !s.startsWith('io/'));
for (const rel of order) {
  const code = readText(ROOT + '/src/' + rel);
  (0, eval)(code + '\n//# sourceURL=' + rel);
}
export const FRE = globalThis.FRE;

export function loadFolder(dir) {
  const files = new Map();
  for (const name of listDir(dir)) {
    if (GLib.file_test(dir + '/' + name, GLib.FileTest.IS_DIR)) continue;
    files.set(name.toLowerCase(), { name, path: dir + '/' + name });
  }
  return files;
}
export function openSource(entry) {
  return new FRE.SourceFile(entry.name, readBytes(entry.path));
}

// The World/<map>/ files the editor reads for every map in World.inc, as ui/app.js loadMaps does
// (names matched without case, like Windows): .dyo bytes, and the .rgn / .txt.txt / .wld.cnt texts.
export function loadWorldFiles(resDir, ws) {
  const dyo = new Map(), worldFiles = new Map(), seen = new Set();
  const ci = (dir, name) => exists(dir) ? listDir(dir).find(n => n.toLowerCase() === name.toLowerCase()) : undefined;
  const world = ci(resDir, 'World');
  if (!world) return { dyo, worldFiles };
  for (const x of ws.worldList()) {
    if (seen.has(x.name)) continue;
    seen.add(x.name);
    const d = ci(`${resDir}/${world}`, x.name);
    if (!d) continue;
    for (const ext of ['.dyo', '.rgn', '.txt.txt', '.wld.cnt']) {
      const n = ci(`${resDir}/${world}/${d}`, x.name + ext);
      if (!n) continue;
      const bytes = readBytes(`${resDir}/${world}/${d}/${n}`);
      if (ext === '.dyo') dyo.set(x.name, bytes);
      else worldFiles.set(`world/${x.name}/${x.name}${ext}`.toLowerCase(), new FRE.SourceFile(n, bytes));
    }
  }
  return { dyo, worldFiles };
}
