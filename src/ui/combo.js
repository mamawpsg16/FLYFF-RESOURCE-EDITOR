// A dropdown you can type in (searchable select). The text box filters the list; every word typed must
// appear in the option's label or its extra search text. Keys: ↑ ↓ to move, Enter to pick, Esc to close.
//   FRE.ui.combo({ options: [{ v, label, group?, find? }], value, placeholder, onPick(v), onNew? }) -> element
//   onNew: { label: text => 'row text', pick(text) }: a first row that takes the typed text as a new value
//   wordStart: match typed words at the start of words only
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const MAX = 300;

  // wordStart: each typed word must match the START of a word ("ra" finds "Raised pets", not "Upgrade")
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function combo({ options, value, placeholder = 'Type to search…', onPick, onNew = null, wordStart = false }) {
    const cur = () => options.find(o => String(o.v) === String(value));
    const input = h('input.combo-input', { type: 'text', placeholder, value: cur() ? cur().label : '', autocomplete: 'off' });
    const list = h('div.combo-list');
    const el = h('div.combo', input, list);
    let shown = [], hi = -1;
    list.hidden = true;

    function paint(q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const hit = (hay, w) => wordStart ? new RegExp('(^|[^a-z0-9])' + esc(w)).test(hay) : hay.includes(w);
      shown = options.filter(o => words.every(w => hit((o.label + ' ' + (o.find || '') + ' ' + (o.group || '')).toLowerCase(), w)));
      if (onNew && q.trim()) shown.unshift({ v: null, label: onNew.label(q.trim()), typed: q.trim() });
      list.textContent = '';
      let group = null;
      shown.slice(0, MAX).forEach((o, i) => {
        if (o.group && o.group !== group) { group = o.group; list.appendChild(h('div.combo-group', group)); }
        list.appendChild(h('div.combo-opt' + (i === hi ? '.hi' : '') + (String(o.v) === String(value) ? '.sel' : ''),
          { 'data-i': i, on: { mousedown: e => { e.preventDefault(); pick(o); } } }, o.label));
      });
      if (shown.length > MAX) list.appendChild(h('div.combo-more', `${shown.length - MAX} more: type more letters`));
      if (!shown.length) list.appendChild(h('div.combo-more', 'Nothing matches.'));
    }
    // The list is position: fixed at the box's spot on screen, so a scrolling parent (a window's body)
    // can't clip it; it opens upward when there is more room above.
    function place() {
      const r = input.getBoundingClientRect(), below = window.innerHeight - r.bottom - 8, above = r.top - 8;
      const up = below < 200 && above > below;
      list.style.left = r.left + 'px'; list.style.width = r.width + 'px';
      list.style.maxHeight = Math.max(120, Math.min(320, up ? above : below)) + 'px';
      list.style.top = up ? '' : r.bottom + 'px';
      list.style.bottom = up ? (window.innerHeight - r.top) + 'px' : '';
    }
    const onMove = () => { if (!list.hidden && input.isConnected) place(); };
    const watch = on => { const f = on ? 'addEventListener' : 'removeEventListener'; window[f]('scroll', onMove, true); window[f]('resize', onMove); };
    const show = () => { if (list.hidden) watch(true); list.hidden = false; place(); };
    const hide = () => { if (!list.hidden) watch(false); list.hidden = true; };
    function open() { hi = -1; paint(''); show(); input.select(); }
    function close() { hide(); input.value = cur() ? cur().label : ''; }
    function pick(o) {
      if (o.typed !== undefined) { hide(); onNew.pick(o.typed); return; }
      value = o.v; close(); onPick(o.v);
    }
    function move(d) {
      if (!shown.length) return;
      hi = Math.max(0, Math.min(Math.min(shown.length, MAX) - 1, hi + d));
      paint(input.value === (cur() && cur().label) ? '' : input.value);
      const node = list.querySelector('.combo-opt.hi');
      if (node) node.scrollIntoView({ block: 'nearest' });
    }
    input.addEventListener('focus', open);
    input.addEventListener('blur', close);              // a click in the list never blurs: its mousedown is cancelled
    input.addEventListener('input', () => { hi = 0; paint(input.value); show(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) pick(shown[hi]); }
      else if (e.key === 'Escape') { e.preventDefault(); input.blur(); }
    });
    el.pick = v => { const o = options.find(x => String(x.v) === String(v)); if (o) pick(o); };    // for tests
    return el;
  }

  FRE.ui.combo = combo;
})(globalThis.FRE = globalThis.FRE || {});
