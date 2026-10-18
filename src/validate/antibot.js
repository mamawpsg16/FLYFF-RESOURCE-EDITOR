// Bot Check checks (AntiBot.inc). The server's own refusals (CAntiBotMng::LoadScript) first, then the editor's warnings.
(function (FRE) {
  'use strict';
  function antiBotChecks(m, opts = {}) {
    const out = [], F = FRE.antiBot.FILE;
    const push = (span, code, severity, message, k) => out.push({ module: 'antibot', file: F, code, severity, start: span.start, end: span.end, key: `${code}|${k}`, message });
    if (!m.ok) push({ start: 0, end: 0 }, 'AB_FEW', 'BLOCK', `Only ${m.lines.length} good ANTIBOT_ITEM lines, ${FRE.antiBot.CHOICES} needed: at start the bot check is OFF (a /antibot reload keeps the old list).`, 'few');
    for (const r of m.skipped) push(r, 'AB_SKIPPED', 'WARN', `${r.why} (the server writes it to error_*.txt).`, `${r.id}|${r.word.text}`);
    for (const r of m.errors) push(r, 'AB_RANGE', 'WARN', `${r.why}.`, r.key || `world|${r.world}`);
    // two words with the same icon file: a player cannot tell them apart
    const icon = opts.iconOf || (() => '');
    const seen = new Map();
    for (const r of m.lines) {
      const ic = String(icon(r.id) || '').toLowerCase();
      if (!ic) continue;
      if (seen.has(ic)) push(r, 'AB_SAME_ICON', 'WARN', `"${r.word.text}" and "${seen.get(ic).word.text}" use the same picture (${ic}): a player cannot tell them apart.`, ic);
      else seen.set(ic, r);
    }
    if (m.ok && m.lines.length < 12) push({ start: 0, end: 0 }, 'AB_SHORT', 'INFO', `${m.lines.length} words: more words = harder for a bot to learn the pictures.`, 'short');
    return out;
  }
  FRE.antiBotChecks = antiBotChecks;
})(globalThis.FRE = globalThis.FRE || {});
