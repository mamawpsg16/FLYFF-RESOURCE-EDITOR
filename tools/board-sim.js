// A rules window by hand:   gjs -m tools/board-sim.js [<NPC key> "<menu name>" "<text>"] [--file <path>] [--fixtures]
// (from the repo root). With an NPC: adds the rules menu in memory (edit/menu-ops.js boardPlan), then prints
// the NPC's right-click list (src/loaders/newnpc-sim.js) and the window as the game draws it
// (src/loaders/board-text.js, a port of CEditString::ParsingString). With --file: reads an existing text
// file (e.g. ../FLYFF-V19-SOURCE/Client/Client/GuildCombatTEXT_1_USA.inc) and prints how it is drawn.
// Needs the npc-board client change in game: docs/patches/npc-board.diff. Never writes any file.
// Example: gjs -m tools/board-sim.js MaFl_Peach "Guild Siege Rules" "#b#cffffcc00How to win#nc#nb\nKill players"
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';
import GLib from 'gi://GLib';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const fi = argv.indexOf('--file');

function draw(title, text) {
  print(`  ┌ ${title || ''}`);
  const line = FRE.boardText.parse(text).map(p => {
    const tags = [p.bold ? 'bold' : '', p.underline ? 'underline' : '', p.strike ? 'strike' : '', p.color !== FRE.boardText.WHITE ? FRE.boardText.css(p.color) : ''].filter(Boolean);
    return tags.length ? `[${tags.join(' ')}]${p.text}[/]` : p.text;
  }).join('');
  for (const l of line.split(/\r\n|\n/)) print('  │ ' + l);
  print('  └');
}

if (fi >= 0) {
  const [ok, bytes] = GLib.file_get_contents(argv[fi + 1]);
  if (!ok) throw new Error('cannot read ' + argv[fi + 1]);
  draw(argv[fi + 1].split('/').pop(), new TextDecoder('latin1').decode(bytes));
} else {
  const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');
  const [key = 'MaFl_Peach', label = 'Rules', text = '#b#cffffcc00Rules#nc#nb\nBe nice.'] = argv;
  const files = new Map();
  for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
  const ws = new FRE.Workspace(files, { only: 'npc' }).load();
  const name = FRE.menuNameFromLabel(ws, label);
  const plan = FRE.menuOps.boardPlan(ws, { npcKey: key, name, label, text: text.replace(/\\n/g, '\n') });
  ws.applyGroup(plan.parts, 'rules');
  print(`\nAdded ${name} (menu ${plan.ids[0]}) to ${key}; text file Client/Client/${plan.board.file} (in memory).`);
  const npc = ws.chars.npcs.filter(n => n.key.toLowerCase() === key.toLowerCase()).pop();
  print('Right-click: ' + FRE.newNpcSim.rightClick(ws, npc.menus).map(m => `${m.label || m.define}${m.opens && m.opens.board ? ' [rules window]' : ''}`).join(', '));
  draw(label, ws.boardTextOf(plan.ids[0]));
}
