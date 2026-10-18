// The bot check by hand:  gjs -m tools/antibot-sim.js [every=4] [step=0] [climb=0] [minutes=60] [answer=right|wrong|none] [delay=20] [seed=1] [--fixtures]
//                         gjs -m tools/antibot-sim.js words     (the words the server takes, the skipped lines, the tuning)
// Runs src/loaders/antibot-sim.js (OnKill, NewIcons, OnAnswer, Process, SendToTown of AntiBotMng.cpp) on test-data (or
// test-data/fixtures) AntiBot.inc: a made-up player killing a monster every `every` seconds; never writes.
// On Windows: node --import ./tests/node-shim/register.mjs tools/antibot-sim.js …
// Example: gjs -m tools/antibot-sim.js every=3 answer=none minutes=120
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const base = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const files = new Map();
for (const [k, e] of loadFolder(base + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'antibot' }).load();
const m = ws.models.antibot, A = FRE.antiBot;
const name = id => { const it = ws.itemById(id); return it ? it.name : `#${id}`; };
const mmss = t => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
if (argv.includes('words')) {
  print(`${m.lines.length} words${m.ok ? '' : ' - FEWER THAN 6: the bot check is OFF'}:`);
  for (const r of m.lines) print(`  ${r.word.text}  (${name(r.id)}, ${r.item.define})`);
  for (const r of m.skipped) print(`  SKIPPED: ${r.why}`);
  print('tuning:');
  for (const t of A.TUNING) print(`  ${t.key} ${m.tune[t.key].value}${m.tune[t.key].set ? '' : ' (default)'}`);
  for (const w of m.worlds) print(`  NO_CHECK_WORLD ${w.define} (${w.world})`);
  for (const e of m.errors) print(`  BAD: ${e.why}`);
} else {
  const o = { every: Number(opt.every || 4), step: Number(opt.step || 0), climb: Number(opt.climb || 0), answer: opt.answer || 'right',
    delay: Number(opt.delay || 20), seconds: Number(opt.minutes || 60) * 60, seed: Number(opt.seed || 1) };
  const r = FRE.antiBotSim.session(m, o);
  print(`a kill every ${o.every} s, moving ${o.step} m (up ${o.climb} m) a kill, answers ${o.answer} after ${o.delay} s, for ${o.seconds / 60} minutes:`);
  for (const x of r.log) {
    if (x.ev === 'open') print(`${mmss(x.t)}  puzzle opens (${x.reason}): "Click the ${x.word}" - ${x.items.map(name).join(', ')}`);
    else if (x.ev === 'frozen') print(`${mmss(x.t)}  FROZEN (${x.detail ? 'no clicks left' : 'time is up'}): "Click the ${x.word}"`);
    else if (x.ev === 'wrong') print(`${mmss(x.t)}  wrong click (${x.tries} left)`);
    else if (x.ev === 'icons') print(`${mmss(x.t)}  new pictures: "Click the ${x.word}"`);
    else print(`${mmss(x.t)}  ${x.ev === 'town' ? 'SENT TO TOWN' : 'solved'}`);
  }
  const E = r.entry;
  print(`${E.puzzles} puzzles, ${E.solved} solved, ${E.frozen} frozen, ${E.town} sent to town; score ${E.score} / ${A.value(m, 'SCORE_LIMIT')}`);
}
