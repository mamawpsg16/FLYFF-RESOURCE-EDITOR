import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ChecksumType = { MD5: 'md5', SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' };
const FileTest = { IS_DIR: 'dir', EXISTS: 'exists' };

class Bytes { constructor(data) { this.data = data; } }

const GLib = {
  ChecksumType, FileTest, Bytes,
  get_current_dir: () => process.cwd().split('\\').join('/'),
  getenv: k => process.env[k] ?? null,
  file_get_contents: p => [true, new Uint8Array(fs.readFileSync(p))],
  file_set_contents: (p, b) => { fs.writeFileSync(p, b); return true; },
  file_test: (p, t) => { try { const s = fs.statSync(p); return t === 'dir' ? s.isDirectory() : true; } catch { return false; } },
  mkdir_with_parents: (p, m) => { fs.mkdirSync(p, { recursive: true }); return 0; },
  Dir: { open: p => { const names = fs.readdirSync(p); let i = 0; return { read_name: () => i < names.length ? names[i++] : null, close() {} }; } },
  compute_checksum_for_string: (t, s) => crypto.createHash(t).update(s, 'utf8').digest('hex'),
  compute_checksum_for_bytes: (t, b) => crypto.createHash(t).update(b instanceof Bytes ? b.data : b).digest('hex'),
  // `python3` is a Store stub on this PC; the real one is `python`.
  spawn_command_line_sync: cmd => {
    const c = cmd.replace(/^python3 /, 'python ');
    const r = spawnSync(c, { shell: true, maxBuffer: 1 << 30 });
    return [r.status !== null, new Uint8Array(r.stdout || []), new Uint8Array(r.stderr || []), r.status];
  },
};
export default GLib;
