// Runs the gjs test files under Node (for Windows PCs without gjs):
//   node --import ./tests/node-shim/register.mjs tests/run-tests.js
// Maps `gi://GLib` and `system` to small Node versions (only the calls the tests use).
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
globalThis.print = (...a) => console.log(...a);
globalThis.printerr = (...a) => console.error(...a);
globalThis.ARGV = process.argv.slice(2);
globalThis.imports = { system: { exit: c => process.exit(c) } };
register('./loader.mjs', pathToFileURL(import.meta.filename));
