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

  // Where an NPC stands (list from Workspace.whereOf / FRE.area.whereIs): one entry per spot, named the
  // way the client names it ("Flaris — Flarine / Central Flarine"), with a button that copies the GM
  // teleport command. null: the map files were not read.
  function copyText(text) {
    const done = () => FRE.dom.toast(`Copied: ${text}. Paste it in the game chat (GM account).`, 'ok');
    try { navigator.clipboard.writeText(text).then(done, () => FRE.dom.toast(`Copy this: ${text}`)); }
    catch (e) { FRE.dom.toast(`Copy this: ${text}`); }
  }
  function whereTip(w) {
    return [`${w.worldTitle} (${w.world}), x ${Math.trunc(w.x)}, z ${Math.trunc(w.z)}`,
      w.mapWindow !== null ? `Map window (M) opens: ${w.mapWindow || '—'}` : null,
      `Area name on screen when you arrive: ${w.caption || '(none)'}`,
      w.te ? `${w.te} takes a GM to this spot (TextCmd_Teleport)` : null].filter(Boolean).join('\n');
  }
  function whereLine(list, opts = {}) {
    if (!list) return opts.quiet ? null : h('div.where.muted.small', 'Where: map files not read.');
    if (!list.length) return h('div.where.muted.small', 'Where: not placed on any map.');
    return h('div.where', h('span.muted', 'Where:'), list.map(w => h('span.where-spot', { title: whereTip(w) },
      FRE.area.label(w), w.te ? h('button.te', { title: `Copy ${w.te}`, on: { click: e => { e.stopPropagation(); copyText(w.te); } } }, w.te) : null)));
  }
  // Short text for lists: the first spot, "+n" for more
  function whereText(list) {
    if (!list || !list.length) return '';
    return FRE.area.label(list[0]) + (list.length > 1 ? ` +${list.length - 1}` : '');
  }

  FRE.ui = { modules: [], pretty, diagRow, diagTags, diagsInSpan, itemCell, jobCell, whereLine, whereText, copyText };
})(globalThis.FRE = globalThis.FRE || {});
