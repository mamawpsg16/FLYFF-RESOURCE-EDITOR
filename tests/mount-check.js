// Mounts: the JS copy (loaders/mounts.js, mount-sim.js, edit/mounts-ops.js) against the Python copy (tools/oracle_sim.py mount).
// Used by tests/run-tests.js (the core suite) and tests/run-mounts.js (this part alone: quick, and for planted bugs).
//   py: the JSON of `oracle_sim.py mount <fixtures>`; ws: a Workspace({ only: 'mounts' }) on the fixtures with Client/Model.list set
export function checkMounts({ FRE, py, ws, ok, eq, openText }) {
  const J = JSON.stringify, M = FRE.mounts, Sim = FRE.mountSim, O = FRE.mountsOps, D = ws.defines.defines;
  const real = ws.files.get('mount.inc');
  const texts = py.files.map(f => f.text === null ? real.text : f.text);
  // 1. the loader: every block, every value, the hang, which block wins
  let bad = 0, first = '';
  texts.forEach((t, i) => {
    const m = M.loadMounts({ name: 'Mount.inc', text: t }, { defines: D });
    const js = { hang: !!m.hang, blocks: m.blocks.filter(b => b !== m.hang).map(b => [b.id, b.anim, b.entries.map(e => e.key)]), win: [...m.anims.keys()].sort((a, b) => a - b) };
    const p = { hang: py.files[i].hang, blocks: py.files[i].blocks, win: py.files[i].win };
    if (J(js) !== J(p)) { bad++; if (!first) first = `file ${i}: ${J(js).slice(0, 300)} vs ${J(p).slice(0, 300)}`; }
  });
  ok(!bad, `loader: ${texts.length} files (the real one + ${texts.length - 1} made up) read the same way`, first);
  const blocksOf = i => M.loadMounts({ name: 'Mount.inc', text: texts[i] }, { defines: D });
  const cache = new Map();
  const animOf = (fi, id) => { if (!cache.has(fi)) cache.set(fi, blocksOf(fi)); return cache.get(fi).anims.get(id).anim; };
  // 2. the leg loops
  const SEQS = py.seqs;
  bad = 0; first = '';
  for (const c of py.loops) {
    const a = animOf(c.file, c.id), seq = SEQS[c.seq];
    const steps = Sim.loops(a, c.model, seq).map(s => [s.motion, s.speed, s.file, s.loaded]);
    const js = { on: Sim.mountOn(a, c.model), steps };
    if (J(js) !== J(c.out)) { bad++; if (!first) first = `${c.id} seq ${c.seq}: ${J(js)} vs ${J(c.out)}`; }
  }
  ok(!bad, `leg loops: ${py.loops.length} state sequences (every mount of every file) play the same loops at the same speeds`, first);
  // 3. ground speed
  bad = 0; first = '';
  for (const c of py.ground) {
    const g = Sim.ground(animOf(c.file, c.id));
    const js = { tick: [g.perTick.run, g.perTick.walk, g.perTick.back, g.perTick.side], sec: [g.perSec.run, g.perSec.walk, g.perSec.back, g.perSec.side] };
    if (J(js) !== J(c.out)) { bad++; if (!first) first = `${c.id}: ${J(js)} vs ${J(c.out)}`; }
  }
  ok(!bad, `ground: ${py.ground.length} mounts move the same per frame and per second (float32)`, first);
  // 4. flying
  bad = 0; first = '';
  for (const c of py.fly) {
    const a = Object.assign(M.defaults(), { nType: 1, fFlightSpeed: c.push, fFlyMaxSpeed: c.top });
    const r = Sim.fly(a, { fFlightSpeed: c.item }, { turbo: c.turbo, ticks: c.ticks });
    const js = { push: r.push, max: r.max, top: r.top, reach: r.reachTicks, per: r.shownPerSec, steady: r.steady, steadyShown: r.steadyShown, glide: r.glideTicks };
    if (J(js) !== J(c.out)) { bad++; if (!first) first = `${J([c.push, c.top, c.item, c.turbo, c.ticks])}: ${J(js)} vs ${J(c.out)}`; }
  }
  ok(!bad, `flying: ${py.fly.length} flights (the real dragons + made-up pushes / top speeds, turbo, item push) agree on every number`, first);
  // 5. take-off
  bad = 0; first = '';
  for (const c of py.takeoff) {
    const a = c.nType === null ? null : Object.assign(M.defaults(), { nType: c.nType });
    const r = Sim.takeOff(a, { dwFlightLimit: c.limit }, c.ctx);
    if (J([r.ok, r.text]) !== J(c.out)) { bad++; if (!first) first = `${J(c)}: ${J([r.ok, r.text])}`; }
  }
  ok(!bad, `take-off: ${py.takeoff.length} tries get the same answer from the server`, first);
  // 6. edits: the same text after every step (the Python copy edits line by line, the JS by token offsets)
  bad = 0; first = '';
  for (const sc of py.edits) {
    let text = real.text;
    sc.ops.forEach((op, k) => {
      const m = M.loadMounts({ name: 'Mount.inc', text }, { defines: D });
      let sp;
      if (op[0] === 'set') sp = O.plan(text, m.anims.get(op[1]), Object.fromEntries(op[2]));
      else sp = O.addBlock(text, m, op[1], m.anims.get(op[2]), op[3]);
      text = FRE.SourceFile.spliceText(text, sp, real.kind, real.name);
      if (text !== sc.texts[k]) { bad++; if (!first) first = `${J(op)}: lengths ${text.length} vs ${sc.texts[k].length}`; }
    });
  }
  ok(!bad, `edits: ${py.edits.length} scripts give the same Mount.inc after every step`, first);
  eq(J(py.ownLoops.Mount058), J(O.ownLoops({ model: 'Mount058', anis: ws.clientModelNames.filter(n => /^item_Mount058_/i.test(n)) })), "a new block's loops: the model's own run / walk / walkback files");
  return { texts };
}
