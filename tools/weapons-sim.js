// A weapon by hand:   gjs -m tools/weapons-sim.js <define | name> [rarity=0-6] [hand=right|left] [--fixtures]
//                     gjs -m tools/weapons-sim.js family=<LUZA|LEAGENDG|LUZAM|ANGEL|VEMPIRE|BLOODY>   (one family's stats)
// Runs src/loaders/weapons-sim.js (SetDestParamEquip with WeaponRarity_ScaleParam, the left hand giving nothing, PutBaseItemOpt)
// on test-data (or test-data/fixtures); never writes. On Windows: node --import ./tests/node-shim/register.mjs tools/weapons-sim.js …
// Example: gjs -m tools/weapons-sim.js II_WEA_SWO_LUZA rarity=5
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures');
const opt = Object.fromEntries(argv.filter(a => a.includes('=')).map(a => a.split('=')));
const what = argv.find(a => !a.includes('=') && !a.startsWith('--'));
const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'weapons' }).load();
const m = ws.models.weapons, Sim = FRE.weaponsSim, env = Sim.envFor(ws), words = FRE.itemTooltip.dstWords(ws);
const label = d => { const w = words.get(d); return w ? (w.word || w.define).replace(/[:\s]+$/, '') : `stat ${d}`; };
const val = (d, a) => d === ws.defines.defines.get('DST_ATTACKSPEED') ? `${a / 20}% (raw ${a})` : `${a}${words.get(d) && words.get(d).rate ? '%' : ''}`;
if (opt.family) {
  for (const w of (m.families.get(opt.family) || [])) print(`${w.name} (Lv ${w.level}): ${w.slots.filter(s => s.on).map(s => `${label(s.dst)} ${val(s.dst, s.adj)}`).join(', ')}`);
} else if (!what) print('usage: tools/weapons-sim.js <define | name> [rarity=0-6] [hand=right|left]   or   family=<key>');
else {
  const w = m.byDefine.get(what) || m.weapons.find(x => x.name.toLowerCase().includes(what.toLowerCase()));
  if (!w) print(`no weapon ${what}`);
  else {
    const rarity = Number(opt.rarity || 0), hand = opt.hand === 'left' ? 'left' : 'right';
    print(`${w.name} (${w.define}, Lv ${w.level}, ${w.type})${w.twin ? `, Ultimate twin ${w.twin.name}` : ''}`);
    print('tooltip:'); print(`  ${w.name}`); for (const l of Sim.tooltip(env, w, rarity)) print(`  ${l.text}`);
    const ch = Sim.run(env, [['on', hand, { id: w.id, rarity, expired: false }]]);
    print(`in the ${hand} hand${rarity ? ` at rarity ${rarity}` : ''}: ${Sim.statList(ch).map(([d, a]) => `${label(d)} ${val(d, a)}`).join(', ') || 'nothing'}`);
  }
}
