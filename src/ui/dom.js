// Tiny DOM helpers (no framework).
(function (FRE) {
  'use strict';

  // h('div.cls1.cls2', { title: 'x', on: { click: fn } }, child, 'text', [more])
  function h(sel, props, ...children) {
    const [tag, ...classes] = sel.split('.');
    const el = document.createElement(tag || 'div');
    if (classes.length) el.className = classes.join(' ');
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = null; }
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'style') el.style.cssText = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = c => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    children.forEach(add);
    return el;
  }

  const $ = id => document.getElementById(id);
  const fmt = n => FRE.num.group(n);

  // Amount box: shows "1,000,000" when idle and plain digits while editing.
  // onCommit(value|null) gets a plain number; commas never reach the files.
  // Live inputs commit LIVE_MS after the last keystroke (and at once on Enter / leaving the field);
  // while typing, a value that does not parse yet just waits (no error until the field is left).
  const LIVE_MS = 400;
  const pending = new Map();         // input -> its waiting commit (flushLive runs them now; for tests)
  function liveCommit(el, tryCommit, ms) {
    let timer = null;
    const run = () => { pending.delete(el); if (el.isConnected && document.activeElement === el) tryCommit(true); };
    el.addEventListener('input', () => { clearTimeout(timer); pending.set(el, run); timer = setTimeout(run, ms || FRE.dom.LIVE_MS || LIVE_MS); });
    el.addEventListener('change', () => { clearTimeout(timer); pending.delete(el); });
  }
  const flushLive = () => { for (const run of [...pending.values()]) run(); };

  // key: a stable name for this field (e.g. 'ex|MMI_BOB|0|pay|1|qty'), so a re-render keeps the focus in it.
  // Only keyed inputs update while typing (live): without a key the re-render would drop the focus mid-number.
  // liveMs: a longer pause before committing (e.g. when the commit opens a preview window)
  function numInput({ value = null, placeholder = '', disabled = false, title = '', min = 0, max = 2147483647, onCommit, key = null, live = !!key, liveMs = 0 }) {
    const el = h('input.num-input', { type: 'text', inputMode: 'numeric', placeholder, disabled, title, value: fmt(value) });
    if (key) el.dataset.key = key;
    el.dataset.value = value === null ? '' : String(value);
    el.addEventListener('focus', () => { el.value = el.dataset.value; if (!el.dataset.restoring) el.select(); });
    if (live) liveCommit(el, () => {
      const r = FRE.num.parseAmount(el.value, { min, max });
      if (!r.ok || String(r.value === null ? '' : r.value) === el.dataset.value) return;
      el.dataset.value = r.value === null ? '' : String(r.value);
      onCommit(r.value);
    }, liveMs);
    el.addEventListener('blur', () => { el.value = fmt(el.dataset.value === '' ? null : Number(el.dataset.value)); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = el.dataset.value; el.blur(); } });
    el.addEventListener('change', () => {
      if (!el.isConnected) return;               // replaced by a re-render: its line offsets are out of date
      const r = FRE.num.parseAmount(el.value, { min, max });
      if (r.ok && live && String(r.value === null ? '' : r.value) === el.dataset.value) { el.value = fmt(r.value); return; }
      if (!r.ok) { toast(r.error, 'bad'); el.value = document.activeElement === el ? el.dataset.value : fmt(el.dataset.value === '' ? null : Number(el.dataset.value)); return; }
      el.dataset.value = r.value === null ? '' : String(r.value);
      if (document.activeElement !== el) el.value = fmt(r.value);
      onCommit(r.value);
    });
    return el;
  }

  // A chance typed in percent ("50", "33.3333", "12.5%") and kept in the file's units: out of 1,000,000,
  // so 1% = 10,000 and 0.0001% = 1 (the smallest step the file can hold). value / onCommit are in units.
  const PCT_UNIT = 10000;
  const pctText = u => (u === null || u === undefined ? '' : (u / PCT_UNIT).toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false }));
  // conv (another scale, e.g. drop chances out of 3,000,000,000): { toPct(u) -> percent, fromPct(p) -> u, maxPct, tip(u) -> text }
  function pctInput({ value = null, disabled = false, title = '', onCommit, key = null, live = !!key, conv = null }) {
    const pctText = u => (u === null || u === undefined ? '' : conv
      ? Number(conv.toPct(Number(u)).toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4, useGrouping: false }) : FRE.dom.pctText(u));
    const tip = u => `${title ? title + '\n' : ''}${u === null ? '' : conv ? conv.tip(Number(u)) : `= ${fmt(u)} of 1,000,000 in the file`}`;
    const el = h('input.num-input.pct-input', { type: 'text', inputMode: 'decimal', disabled, title: tip(value), value: pctText(value), placeholder: '%' });
    el.dataset.value = value === null ? '' : String(value);
    if (key) el.dataset.key = key;
    el.addEventListener('focus', () => { if (!el.dataset.restoring) el.select(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = pctText(el.dataset.value === '' ? null : Number(el.dataset.value)); el.blur(); } });
    // quiet: while typing (no toast, no rewrite of what is being typed)
    const commit = quiet => {
      if (!el.isConnected) return;
      const t = el.value.trim().replace(/%$/, '').trim().replace(',', '.');
      const back = () => { el.value = pctText(el.dataset.value === '' ? null : Number(el.dataset.value)); };
      if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) { if (!quiet) { toast('Type a percent between 0 and 100, e.g. 50 or 12.5.', 'bad'); back(); } return; }
      if (conv && Number(t) > conv.maxPct) { if (!quiet) { toast(`A chance is at most ${conv.maxPct}% here.`, 'bad'); back(); } return; }
      const u = conv ? conv.fromPct(Number(t)) : Math.round(Number(t) * PCT_UNIT);
      if (!conv && u > 100 * PCT_UNIT) { if (!quiet) { toast('A chance is at most 100%.', 'bad'); back(); } return; }
      if (!conv && !quiet && Math.abs(u - Number(t) * PCT_UNIT) > 1e-6) toast(`Rounded to ${pctText(u)}% (the file keeps 4 decimals).`);
      if (!quiet) el.value = pctText(u);
      el.title = tip(u);
      if (String(u) === el.dataset.value) return;
      el.dataset.value = String(u);
      onCommit(u);
    };
    el.addEventListener('change', () => commit(false));
    if (live) liveCommit(el, commit);
    return h('span.pct-wrap', el, h('span.muted', ' %'));
  }

  // Re-render(fn) inside root without losing the field being typed in: an input made with a `key`
  // (numInput / pctInput) is found again by that key and gets the focus, its typed text and the caret back.
  function keepFocus(root, fn) {
    const a = document.activeElement;
    const key = a && root.contains(a) && a.dataset ? a.dataset.key : null;
    if (!key) { fn(); return; }
    const text = a.value, s0 = a.selectionStart, s1 = a.selectionEnd;
    fn();
    const n = [...root.querySelectorAll('input[data-key]')].find(x => x.dataset.key === key);
    if (!n || n.disabled) return;
    n.dataset.restoring = '1';
    n.focus();
    delete n.dataset.restoring;
    n.value = text;
    try { n.setSelectionRange(s0, s1); } catch (e) { /* not a text input */ }
  }

  let toastCount = 0;                 // lets the shell skip its own "done" note when an editor already said something
  function toast(msg, kind = '') {
    toastCount++;
    const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
  }

  // modal({ title, body: Node, buttons: [{ label, cls, onClick -> false keeps open }] })
  // onClose: called once when the window closes (any button), e.g. to open the next form
  function modal({ title, body, buttons = [{ label: 'Close' }], wide, onClose }) {
    const back = h('div.modal-back');
    let closed = false;
    const close = () => { back.remove(); if (!closed && onClose) { closed = true; onClose(); } };
    const foot = h('footer', buttons.map(b => h('button' + (b.cls ? '.' + b.cls : ''), {
      disabled: b.disabled, id: b.id,
      on: { click: async () => { const r = b.onClick ? await b.onClick() : undefined; if (r !== false) close(); } },
    }, b.label)));
    back.appendChild(h('div.modal', { style: wide ? 'width:min(1200px,95vw)' : '' }, h('header', title), h('div.body', body), foot));
    $('modal-root').appendChild(back);
    return { close, el: back };
  }

  // A "Loading…" window with no buttons (opening a task can take seconds on the real folder):
  // progress(title) -> { phase(text), count(i, n, what), close() }. phase() and count() let the browser paint
  // (count at most every 100 ms), so the window shows what is being read while the files load.
  function progress(title) {
    const phaseEl = h('div.load-phase'), countEl = h('div.muted.small.load-count');
    const back = h('div.modal-back.loading-back', h('div.modal.loading', h('header', h('span.spinner'), title), h('div.body', phaseEl, countEl)));
    $('modal-root').appendChild(back);
    let last = 0;
    // FRE.dom.instant (the UI harness, which runs in microtasks only): no wait for a paint
    const paint = () => FRE.dom.instant ? Promise.resolve() : new Promise(r => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 50); });
    return {
      async phase(text) { phaseEl.textContent = text; countEl.textContent = ''; last = Date.now(); await paint(); },
      async count(i, n, what = '') {
        if (Date.now() - last < 100 && i !== n) return;
        countEl.textContent = (n ? `${fmt(i)} / ${fmt(n)}` : fmt(i)) + (what ? ` · ${what}` : '');
        last = Date.now(); await paint();
      },
      close() { back.remove(); },
    };
  }

  // A time limit typed as a number (decimals allowed) + a unit: minutes / hours / days. The file keeps whole minutes:
  // 0.5 hours = 30, 1.5 days = 2,160 (rounded to the minute). The unit starts at the biggest one that fits the value;
  // a keyed field remembers the unit chosen across re-renders. onCommit(minutes).
  const UNITS = [['minutes', 1], ['hours', 60], ['days', 1440]];
  const unitPref = new Map();
  function durationText(m) {
    if (m === null || m === undefined) return 'not set yet';
    if (!m) return 'permanent (no time limit)';
    const parts = [], d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mi = m % 60;
    if (d) parts.push(`${fmt(d)} day${d === 1 ? '' : 's'}`);
    if (hr) parts.push(`${hr} hour${hr === 1 ? '' : 's'}`);
    if (mi) parts.push(`${mi} minute${mi === 1 ? '' : 's'}`);
    return parts.join(' ');
  }
  // minutes null = empty (a required field not filled yet); permanent: true adds a "Permanent" button (sets 0)
  function durationInput({ minutes = 0, disabled = false, key = null, live = !!key, max = 2147483647, permanent = false, onCommit }) {
    let unit = key && unitPref.has(key) ? unitPref.get(key) : !minutes ? 1440 : minutes % 1440 === 0 ? 1440 : minutes % 60 === 0 ? 60 : 1;
    if (key) unitPref.set(key, unit);          // the unit stays what it was when the value was typed (1.5 days stays days after a re-render)
    let cur = minutes;
    const show = m => (m === null || m === undefined ? '' : String(Number((m / unit).toFixed(4))));
    const el = h('input.num-input.dur-input', { type: 'text', inputMode: 'decimal', disabled, value: show(minutes), title: '0 = no time limit; decimals allowed (0.5 hours = 30 minutes)' });
    if (key) el.dataset.key = key;
    const hint = h('span.muted.small', ' = ' + durationText(minutes));
    const sel = h('select.dur-unit', { disabled, on: { change: e => {
      unit = Number(e.target.value);
      if (key) unitPref.set(key, unit);
      el.value = show(cur);                       // same time limit, shown in the new unit; nothing is written
    } } }, UNITS.map(([n, v]) => h('option', { value: v, selected: v === unit }, n)));
    const parse = () => {
      const t = el.value.trim().replace(',', '.');
      if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return null;
      return Math.round(Number(t) * unit);
    };
    el.addEventListener('input', () => { const m = parse(); hint.textContent = ' = ' + (m === null ? (el.value.trim() ? '?' : 'not set yet') : m > max ? 'too long' : durationText(m)); });
    const commit = quiet => {
      if (!el.isConnected) return;
      const m = parse();
      if (m === null || m > max) { if (!quiet) { toast('Type a number, e.g. 7 or 0.5 (decimals are fine).', 'bad'); el.value = show(cur); hint.textContent = ' = ' + durationText(cur); } return; }
      if (!quiet) el.value = show(m);
      if (m === cur) return;
      cur = m;
      onCommit(m);
    };
    el.addEventListener('change', () => commit(false));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = show(cur); el.blur(); } });
    if (live) liveCommit(el, commit);
    const perm = permanent ? h('button.small.dur-perm', { type: 'button', disabled, title: 'No time limit: the item never expires (0)',
      on: { click: () => { el.value = '0'; hint.textContent = ' = ' + durationText(0); commit(false); } } }, 'Permanent') : null;
    return h('span.dur-wrap', el, ' ', sel, ' ', perm, hint);
  }

  FRE.dom = { h, $, fmt, toast, toasts: () => toastCount, modal, progress, numInput, pctInput, pctText, keepFocus, LIVE_MS, flushLive, durationInput, durationText };
})(globalThis.FRE = globalThis.FRE || {});
