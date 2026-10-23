// Boss Mechanics checks: every error of the branch's checker (Tools/BossMechanics/checker.js 3dac171b, ported in
// loaders/bosses.js parse). All BLOCK: the checker's rule is "fix before every commit", and a wrong row is skipped or
// crashes the WorldServer at boot (an unknown MI_).
(function (FRE) {
  'use strict';
  function bossChecks(model) {
    const text = model.file.text, starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\r') { if (text[i + 1] === '\n') i++; starts.push(i + 1); }
      else if (text[i] === '\n') starts.push(i + 1);
    }
    return model.errors.map(e => {
      const s = starts[Math.max(0, e.line - 1)] || 0;
      const end = FRE.textOps.lineContentEnd(text, s);
      return { module: 'bosses', file: FRE.bosses.FILE, code: e.code, severity: 'BLOCK', start: s, end, line: e.line,
        key: `${e.code}|${e.mi || ''}|${e.msg.replace(/line \d+/g, 'line')}`, message: `Line ${e.line}: ${e.msg}` };
    });
  }
  FRE.bossChecks = bossChecks;
})(globalThis.FRE = globalThis.FRE || {});
