// Headless UI screenshots with Brave / Chrome (Windows, no Firefox): drives the browser over the DevTools protocol, so each
// stage is shot when the harness is DONE (its #harness-results box is there), not after a guessed time.
//   node tests/ui-shot.mjs [stage ...]        (run from the repo root, after `python3 build.py --harness`)
//   BRAVE=<path to brave.exe or chrome.exe> overrides the search. Output: test-data/ui-<stage>.png + each stage's result line.
// tests/run-ui.sh calls it when Firefox is not installed (Firefox stays the Linux way).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const stages = process.argv.slice(2);
const find = () => [process.env.BRAVE, path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe'),
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')].find(p => p && fs.existsSync(p));
const exe = find();
if (!exe) { console.error('no brave.exe / chrome.exe found (set BRAVE=...)'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fre-ui-'));
const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1600,1000', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error('the browser did not start')), 30000);
  proc.stderr.on('data', d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) { clearTimeout(t); res(m[1]); } });
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } });
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; waiting.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let code = 0;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  const page = pathToFileURL(path.join(ROOT, 'test-data', 'harness.html')).href;
  for (const stage of stages) {
    const out = path.join(ROOT, 'test-data', `ui-${stage}.png`);
    fs.rmSync(out, { force: true });
    await S('Page.navigate', { url: `${page}?stop=${encodeURIComponent(stage)}` });
    let text = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 600000) {
      await sleep(500);
      const r = await S('Runtime.evaluate', { expression: "(document.getElementById('harness-results') || {}).textContent || null", returnByValue: true }).catch(() => null);
      if (r && r.result && r.result.value) { text = r.result.value; break; }
    }
    await sleep(400);                    // let the last paint settle
    const shot = await S('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log(`screenshot: test-data/ui-${stage}.png  ${text ? text.split('\n')[0] : '(no result after 10 min)'}`);
    if (text) for (const l of text.split('\n').slice(1)) console.log('   ' + l);
    if (!text || /✗/.test(text)) code = 1;
  }
} catch (e) { console.error(e.message); code = 1; }
finally {
  try { await send('Browser.close'); } catch { proc.kill(); }
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.exit(code);
