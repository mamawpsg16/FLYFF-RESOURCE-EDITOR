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
  const fmt = n => (n === null || n === undefined || Number.isNaN(n)) ? '' : Number(n).toLocaleString('en-US');

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

  FRE.dom = { h, $, fmt, toast, modal };
})(globalThis.FRE = globalThis.FRE || {});
