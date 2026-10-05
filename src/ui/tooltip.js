// Item tooltip on hover: any element with data-item-id shows the in-game tooltip
// (FRE.itemTooltip, a port of the client's MakeToolTipText) plus the editor-only
// info the game leaves out. One shared box, positioned next to the pointer.
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  let box = null, cur = null;

  function render(ws, id) {
    const it = ws.itemById(Number(id));
    if (!it) return null;
    const t = FRE.itemTooltip.build(ws, it);
    const lines = ls => ls.map(l => h('div.tt-line', l.map(s => h('span', { style: `color:${s.color}${s.bold ? ';font-weight:600' : ''}` }, s.text || ' '))));
    return h('div', lines(t.game), t.editor.length ? h('div.tt-editor', h('div.tt-head', 'Editor info (not shown in game)'), lines(t.editor)) : null);
  }

  function place(e) {
    if (!box) return;
    const pad = 14, r = box.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth - 4) x = Math.max(4, e.clientX - r.width - pad);
    if (y + r.height > innerHeight - 4) y = Math.max(4, innerHeight - r.height - 4);
    box.style.left = x + 'px'; box.style.top = y + 'px';
  }

  function hide() { if (box) box.hidden = true; cur = null; }

  function init(getWs) {
    box = h('div.item-tooltip', { id: 'item-tooltip', hidden: true });
    document.body.appendChild(box);
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('[data-item-id]');
      const ws = getWs();
      if (!el || !ws) { hide(); return; }
      if (el !== cur) {
        cur = el;
        const body = render(ws, el.dataset.itemId);
        if (!body) { hide(); return; }
        box.textContent = ''; box.appendChild(body); box.hidden = false;
      }
      place(e);
    });
    document.addEventListener('mousemove', e => { if (cur) place(e); });
    document.addEventListener('scroll', hide, true);
  }

  FRE.ui.tooltip = { init, render, hide };
})(globalThis.FRE = globalThis.FRE || {});
