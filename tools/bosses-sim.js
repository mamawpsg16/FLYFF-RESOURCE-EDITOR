// A boss by hand:   gjs -m tools/bosses-sim.js <MI_ name | part of it> [seed=N] [swings=N] [hp=N] [--fixtures]
//                   gjs -m tools/bosses-sim.js list            (every boss: tier, rows, attack chance, phases, problems)
// Runs src/loaders/bosses-sim.js (the planned dispatcher of CPP_PORT_LIST.md v2-3 + the swing time v2-5) on test-data (or
// test-data/fixtures with the branch files of fixtures/Boss); never writes. hp = the boss's HP after the last swing (default 5).
// On Windows: node --import ./tests/node-shim/register.mjs tools/bosses-sim.js …
// Example: gjs -m tools/bosses-sim.js MI_KALGASBOSS seed=3
import { FRE, ROOT, loadFolder, openSource, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--'));
const base = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const files = new Map();
for (const [k, e] of loadFolder(base + '/Resource')) files.set(k, openSource(e));
if (fixtures && exists(base + '/Boss')) for (const [k, e] of loadFolder(base + '/Boss')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'bosses' }).load();
const m = ws.models.bosses, Sim = FRE.bossSim, B = FRE.bosses;
const pc = p => `${Math.round(p * 1000) / 10} %`;

if (!what) print('usage: tools/bosses-sim.js <MI_ name>   or   list');
else if (what === 'list') {
  for (const b of m.bosses) {
    const t = Sim.table(b), errs = m.errors.filter(e => e.mi === b.name).length;
    print(`${b.name} (${b.mover ? b.mover.name : '?'}): ${b.tier ? b.tier.value.replace('BOSSTIER_', '') : 'no tier'}, ${b.rows.length} rows, ` +
      `${b.inorder && b.inorder.value === '1' ? 'in order' : 'random'}, attacks ${pc(t[0].attack)}` +
      `${b.sig ? `, signature every ${b.sig.words[3]}` : ''}${b.phases.map(p => `, below ${p.hp} %: ${pc(Sim.chances(b, b.phases.indexOf(p)).attack)}`).join('')}${errs ? `, ${errs} problems` : ''}`);
  }
} else {
  const b = m.byName.get(what) || m.bosses.find(x => x.name.toLowerCase().includes(what.toLowerCase()));
  if (!b) print(`no boss ${what}`);
  else {
    print(`${b.name}: ${b.mover ? `${b.mover.name}, swing delay ${b.mover.reAttack} ms` : 'not in propMover'}`);
    for (const t of Sim.table(b)) {
      print(`  ${t.phase < 0 ? 'full HP' : `below ${t.hp} % (swing time ${t.speed} %)`}: attacks ${pc(t.attack)}; ` +
        Object.entries(t.byShape).map(([k, p]) => `${B.shortType(k)} ${pc(p)}`).join(', '));
    }
    const run = Sim.run(b, { seed: Number(opt.seed || 1), swings: Number(opt.swings || 30), hpEnd: Number(opt.hp || 5), reAttack: b.mover ? b.mover.reAttack : 2000 });
    for (const s of run) {
      const r = s.row >= 0 ? b.rows[s.row].words : null;
      print(`  swing ${s.n} HP ${s.hp} %${s.phase >= 0 ? ` phase ${s.phase + 1}` : ''}: ${s.kind === 'signature' ? `SIGNATURE ${B.shortType(b.sig.words[0])}` : s.kind === 'row' ? `row ${s.row + 1} ${B.shortType(r[0])}` : 'no attack'}` +
        `${s.shouts.length ? ` — shout: ${s.shouts.join(' / ')}` : ''}; next swing in ${s.delay} ms`);
    }
  }
}
for (const e of m.errors.slice(0, 20)) print(`problem line ${e.text}`);
