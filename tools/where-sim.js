// Where is this item from? by hand:   gjs -m tools/where-sim.js <II_ item | item id> [--fixtures]   (from the repo root)
// Runs src/loaders/where.js (the same lines the "Where is this item from?" task shows): every NPC shop that sells it
// (with the price players pay), the Donation Shop, exchange rewards (chance per exchange), monster drops (in % of kills,
// player at the monster's level), extra drops from propDropEvent.inc, random gear (DropKind), boxes, sets, Battle Pass
// levels, and the exchanges that take it. Reads test-data (or test-data/fixtures) and its World/ maps; never writes.
// Example: gjs -m tools/where-sim.js II_SYS_SYS_SCR_AWAKE
//          gjs -m tools/where-sim.js II_CHP_RED --fixtures
import { FRE, ROOT, loadFolder, openSource, loadWorldFiles } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures');
const arg = argv[0];
if (!arg) throw new Error('usage: gjs -m tools/where-sim.js <II_ item | item id> [--fixtures]');

const RES = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource';
const files = new Map();
for (const [k, e] of loadFolder(RES)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'where' }).load();
const w = loadWorldFiles(RES, ws);
ws.setMapFiles(w.dyoFiles, w.worldFiles);
const D = ws.defines.defines, fmt = n => FRE.num.group(n), pct = x => FRE.drops.pct(x);
const id = /^\d+$/.test(arg) ? Number(arg) : D.get(arg);
if (id === undefined) throw new Error(`${arg} is not defined`);
const r = FRE.where.sources(ws, id);
const name = x => { const it = ws.itemById(x); return it ? (it.name || it.define) : `item ${x}`; };
const where = list => (list && list.length ? FRE.area.label(list[0]) + (list.length > 1 ? ` +${list.length - 1}` : '') : '');
const money = (n, c) => `${fmt(n)} ${FRE.where.CURRENCY[c]}`;

print(`\n${name(id)} (${r.item ? r.item.define : '?'}, id ${id >>> 0})`);
for (const c of r.checks) print(`  ${c.severity === 'WARN' ? '⚠' : c.severity === 'BLOCK' ? '⛔' : 'ⓘ'} ${c.text}`);
const of = k => r.lines.filter(l => l.kind === k);
const block = (title, rows) => { if (!rows.length) return; print(`\n${title} (${rows.length})`); rows.forEach(x => print('  ' + x)); };
block('🛒 Bought from', of('shop').map(l => `${l.who} [${l.tab || 'tab ' + (l.slot + 1)}] ${l.dropped ? `listed but not sold: ${l.dropped}` : money(l.price, l.currency)}${l.how === 'rule' ? ' (auto)' : ''}`
  + `  ${l.inGame === false ? `NOT IN GAME: ${l.why}` : where(l.where)}`));
block('💎 Donation Shop', of('donation').map(l => `"${l.category}" ${money(l.price, 2)}${l.crash ? '  CRASHES THE SERVER' : ''}`));
block('🔁 Exchange reward', of('exchange').map(l => `${l.who} · ${l.menu.name} exchange ${l.si + 1}: ×${fmt(l.num)}, ${l.chance === null ? 'one of ' + l.payNum : pct(l.chance)} per exchange`
  + `; costs ${l.cost.map(c => c.penya ? `${fmt(c.num)} Penya` : `${fmt(c.num)} × ${c.name}`).join(', ') || 'nothing'}`));
const byKill = (a, b) => b.perKill - a.perKill;
block('⚔️ Dropped by', of('drop').sort(byKill).map(l => `${l.who} (lv ${l.level}): in ${pct(l.perKill)} of kills`));
block('🎉 Extra drop (propDropEvent.inc)', of('event').sort(byKill).map(l => `${l.who} (lv ${l.level}): in ${pct(l.perKill)} of kills`));
block('🎲 Random gear (DropKind)', of('kind').sort(byKill).map(l => `${l.who} (lv ${l.level}): in ${pct(l.perKill)} of kills (one of ${l.among})`));
block('🎁 Random box', of('box').sort((a, b) => b.chance - a.chance).map(l => `${l.who}: ${pct(l.chance)}, ×${fmt(l.num)}${l.bound ? ', bound' : ''}${l.minutes ? `, ${l.minutes} min` : ''}${l.upgrade ? `, +${l.upgrade}` : ''}`));
block('📦 Set', of('set').map(l => `${l.who}: ×${fmt(l.num)}${l.box.span ? `, ${l.box.span} min` : ''}${l.upgrade ? `, +${l.upgrade}` : ''}`));
block('🏆 Battle Pass', of('bp').sort((a, b) => a.level - b.level).map(l => `level ${l.level} (${fmt(l.points)} points): ×${fmt(l.num)}`));
block('🔧 Used in', of('use').map(l => `${l.who} · ${l.menu.name} exchange ${l.si + 1}: takes ${fmt(l.num)}`));
block(r.contains.length && r.contains[0].kind === 'set' ? '📦 Opening it gives all of' : '🎁 Opening it gives one of',
  r.contains.map(c => `${c.name} ×${fmt(c.num)}${c.chance !== undefined ? ` (${pct(c.chance)})` : ''}`));
if (!r.lines.length && !r.contains.length) print('\nNothing in the files gives or uses it.');
