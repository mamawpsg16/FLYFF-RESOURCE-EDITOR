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
