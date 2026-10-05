// Line diff (Myers O(ND)) for the save review dialog.
// Lines are compared including their EOL, so a line-ending change shows up.
(function (FRE) {
  'use strict';

  function splitKeepEol(text) {
    return FRE.bytes.scanLines(text).map(l => text.slice(l.start, l.end));
  }

  // Returns ops: [{ type: 'eq'|'del'|'add', a: lineIdxInOld, b: lineIdxInNew }]
  function diffLines(a, b) {
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    const A = a.slice(pre, a.length - suf), Bv = b.slice(pre, b.length - suf);
    const N = A.length, M = Bv.length, MAX = N + M;
    const v = new Int32Array(2 * MAX + 2);
    const trace = [];
    let done = false;
    for (let d = 0; d <= MAX && !done; d++) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[MAX + k - 1] < v[MAX + k + 1])) ? v[MAX + k + 1] : v[MAX + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[x] === Bv[y]) { x++; y++; }
        v[MAX + k] = x;
        if (x >= N && y >= M) { done = true; break; }
      }
    }
    // backtrack
    const mid = [];
    let x = N, y = M;
    for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
      const vv = trace[d];
      const k = x - y;
      const prevK = (k === -d || (k !== d && vv[MAX + k - 1] < vv[MAX + k + 1])) ? k + 1 : k - 1;
      const px = vv[MAX + prevK], py = px - prevK;
      while (x > px && y > py) { mid.push({ type: 'eq', a: pre + x - 1, b: pre + y - 1 }); x--; y--; }
      if (d > 0) {
        if (x === px) mid.push({ type: 'add', b: pre + y - 1 }); else mid.push({ type: 'del', a: pre + x - 1 });
      }
      x = px; y = py;
    }
    mid.reverse();
    const ops = [];
    for (let i = 0; i < pre; i++) ops.push({ type: 'eq', a: i, b: i });
    ops.push(...mid);
    for (let i = 0; i < suf; i++) ops.push({ type: 'eq', a: a.length - suf + i, b: b.length - suf + i });
    return ops;
  }

  // Groups changes into hunks with `ctx` lines of context.
  function hunks(ops, ctx = 2) {
    const out = [];
    let cur = null, lastChange = -1e9;
    ops.forEach((op, i) => {
      if (op.type !== 'eq') {
        if (!cur || i - lastChange > 2 * ctx + 1) {     // merge when no line would be hidden between them
          cur = { ops: [] };
          out.push(cur);
          for (let k = Math.max(0, i - ctx); k < i; k++) if (ops[k].type === 'eq') cur.ops.push(ops[k]);
        } else {
          for (let k = lastChange + 1; k < i; k++) cur.ops.push(ops[k]);
        }
        cur.ops.push(op);
        lastChange = i;
      }
    });
    // trailing context
    for (const h of out) {
      const lastIdx = ops.indexOf(h.ops[h.ops.length - 1]);
      for (let k = lastIdx + 1; k < Math.min(ops.length, lastIdx + 1 + ctx); k++) {
        if (ops[k].type !== 'eq') break;
        h.ops.push(ops[k]);
      }
    }
    return out;
  }

  FRE.diff = { splitKeepEol, diffLines, hunks };
})(globalThis.FRE = globalThis.FRE || {});
