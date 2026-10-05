// Shared UI helpers and the registry of editor modules (one per toolbar mode).
// A module: { id, label, searchPlaceholder, listExtra(ctx), renderList(el, ctx),
//             renderEditor(el, ctx), addTarget(ctx) -> {ok, title, usesPrice, add(info, cost)},
//             locate(diag, ctx) -> bool, onLoad(ctx) }
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;

  // 'IK3_COLLECTER' -> 'Collecter', 'JOB_MERCENARY' -> 'Mercenary'
  function pretty(def) {
    if (!def || !/^[A-Z0-9]+_/.test(def)) return def || '';
    return def.replace(/^[A-Z0-9]+_/, '').toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  }

  function diagRow(d, extra) {
    const help = FRE.diagHelp[d.code];
    return h('div.diag', extra && extra.on ? { on: extra.on } : null,
      h('span.sev.' + d.severity, d.severity), extra && extra.isNew ? h('span.new', 'new') : null,
      h('div', h('div', d.message), help ? h('div.help', `ⓘ ${help[0]} → ${help[1]}`) : null),
      extra && extra.where ? h('span.line', extra.where) : null);
  }

  function diagTags(list) {
    return list.map(d => h('span.tag.' + (d.severity === 'BLOCK' ? 'bad' : d.severity === 'WARN' ? 'warn' : 'info'),
      { title: d.message + (FRE.diagHelp[d.code] ? '\n\n' + FRE.diagHelp[d.code].join('\n→ ') : '') },
      (d.severity === 'BLOCK' ? '⛔ ' : d.severity === 'WARN' ? '⚠ ' : 'ⓘ ') + d.code));
  }

  // Diagnostics of `file` whose start lies inside [start, end).
  function diagsInSpan(ws, file, start, end) {
    return ws.diags.filter(d => d.file === file && d.start !== undefined && d.start >= start && d.start < Math.max(end, start + 1));
  }

  // Item cell: coloured name with the define underneath.
  function itemCell(info, fallbackDefine) {
    if (!info) return h('td', h('span.muted', '(not in Spec_Item.txt)'), h('span.def.block', fallbackDefine || ''));
    return h('td', { 'data-item-id': info.id }, h('span.r-' + info.rarity, info.name), h('span.def.block', info.define));
  }

  function jobCell(info) {
    return h('td', info && info.jobName ? pretty(info.jobName) : h('span.muted', 'any'));
  }

  FRE.ui = { modules: [], pretty, diagRow, diagTags, diagsInSpan, itemCell, jobCell };
})(globalThis.FRE = globalThis.FRE || {});
