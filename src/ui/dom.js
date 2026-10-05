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
  function numInput({ value = null, placeholder = '', disabled = false, title = '', min = 0, max = 2147483647, onCommit }) {
    const el = h('input.num-input', { type: 'text', inputMode: 'numeric', placeholder, disabled, title, value: fmt(value) });
    el.dataset.value = value === null ? '' : String(value);
    el.addEventListener('focus', () => { el.value = el.dataset.value; el.select(); });
    el.addEventListener('blur', () => { el.value = fmt(el.dataset.value === '' ? null : Number(el.dataset.value)); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); if (e.key === 'Escape') { el.value = el.dataset.value; el.blur(); } });
    el.addEventListener('change', () => {
      const r = FRE.num.parseAmount(el.value, { min, max });
      if (!r.ok) { toast(r.error, 'bad'); el.value = document.activeElement === el ? el.dataset.value : fmt(el.dataset.value === '' ? null : Number(el.dataset.value)); return; }
      el.dataset.value = r.value === null ? '' : String(r.value);
      if (document.activeElement !== el) el.value = fmt(r.value);
      onCommit(r.value);
    });
    return el;
  }

  function toast(msg, kind = '') {
    const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
  }

  // modal({ title, body: Node, buttons: [{ label, cls, onClick -> false keeps open }] })
  function modal({ title, body, buttons = [{ label: 'Close' }], wide }) {
    const back = h('div.modal-back');
    const close = () => back.remove();
    const foot = h('footer', buttons.map(b => h('button' + (b.cls ? '.' + b.cls : ''), {
      disabled: b.disabled, id: b.id,
      on: { click: async () => { const r = b.onClick ? await b.onClick() : undefined; if (r !== false) close(); } },
    }, b.label)));
    back.appendChild(h('div.modal', { style: wide ? 'width:min(1200px,95vw)' : '' }, h('header', title), h('div.body', body), foot));
    $('modal-root').appendChild(back);
    return { close, el: back };
  }

  FRE.dom = { h, $, fmt, toast, modal, numInput };
})(globalThis.FRE = globalThis.FRE || {});
