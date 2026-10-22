// A class's buffs by hand:   gjs -m tools/classbuffs-sim.js <slayer|templar|harlequin|crackshooter|seraph|forcemaster|mentalist|arcanist>
//                              [weapon=sword|axe|two|dual|yoyo|bow|knuckle|staff] [stance=guard|rage] [stat=100] [--fixtures]
// Runs src/loaders/classbuffs-sim.js (ApplyParam with the SetDestParam fan-outs, the IsInvalid weapon rules, Guard / Rage,
// SubReferTime) on test-data (or test-data/fixtures); never writes. On Windows: node --import ./tests/node-shim/register.mjs tools/classbuffs-sim.js …
// Example: gjs -m tools/classbuffs-sim.js slayer weapon=dual
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--'));
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'classbuffs' }).load();
const m = ws.models.classbuffs, Sim = FRE.classBuffsSim, env = Sim.envFor(ws), words = FRE.itemTooltip.dstWords(ws);
const label = d => { const w = words.get(d); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${d}`; };
const val = (d, a) => d === ws.defines.defines.get('DST_ATTACKSPEED') ? `${a / 20}% (raw ${a})` : `${a}${words.get(d) && words.get(d).rate ? '%' : ''}`;
const GEAR = { sword: { sword: 1, shield: 1 }, axe: { axe: 1, shield: 1 }, two: { two: 1, sword: 1 }, dual: { dual: 1, sword: 1 }, yoyo: { yoyo: 1 }, bow: { bow: 1 }, knuckle: { knuckle: 1 }, staff: {} };
const c = m.classes.find(x => x.key === what);
if (!c) print(`usage: tools/classbuffs-sim.js <${m.classes.map(x => x.key).join('|')}> [weapon=…] [stance=guard|rage] [stat=100]`);
else {
  const stat = Number(opt.stat || 100), gear = GEAR[opt.weapon || 'sword'] || {};
  for (const t of c.tiers) {
    if (!t.buffs.length) continue;
    print(`${c.name} · ${t.label}`);
    for (const b of t.buffs) {
      const ms = Sim.duration(env, b, b.max, { STA: stat, DEX: stat, INT: stat });
      print(`  ${b.name} (level ${b.max.lvl}, ${b.who}): ${Sim.amounts(env, b.max).map(([d, a]) => `${label(d)} ${val(d, a)}`).join(', ')} · ${ms / 1000} s`);
    }
  }
  const r = Sim.selfBuffs(env, m, c.key, { gear, stance: opt.stance || 'rage' });
  print(`\nWith every own buff on (${opt.weapon || 'sword'}): ${Sim.statList(r.stats).map(([d, a]) => `${label(d)} ${val(d, a)}`).join(', ')}`);
  for (const u of r.used.filter(x => !x.ok)) print(`  not counted: ${u.b.name} (${u.why})`);
  for (const n of Sim.capNotes(env, r.stats)) print(`  ! ${n}`);
}
