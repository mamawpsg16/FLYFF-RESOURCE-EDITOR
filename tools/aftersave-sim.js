// What a save needs before players see it, by hand:   gjs -m tools/aftersave-sim.js <file> [<file> ...] [options]
// (from the repo root). Each <file> is one change touching that file (join files of one change with +:
// character.inc+client/npcboard_282.inc). Prints the "After saving" list of the Save window
// (src/core/after-save.js: who reads each file and when, ported from the WorldServer / Neuz load code).
// Options:
//   client=written|created|datares|different|none   the game's own copy of each shared file (default written)
//   npc-board=in-source|missing|unknown|built        state of docs/patches/npc-board.diff (default unknown)
//   donation-tree=in-source|missing|unknown|built    state of docs/patches/donation-tree.diff (default unknown)
//   codes=DT_PATCH,DT_ORDER                          checks present (a category the game's code does not know)
// Examples:
//   gjs -m tools/aftersave-sim.js character.txt.txt
//   gjs -m tools/aftersave-sim.js client/donationshoptree.inc codes=DT_PATCH
//   gjs -m tools/aftersave-sim.js defineneuz.h+definetext.h+textclient.inc+textclient.txt.txt+character.inc+client/npcboard_282.inc npc-board=in-source
//   gjs -m tools/aftersave-sim.js world/wdmadrigal/wdmadrigal.dyo character-etc.inc client=datares
// Never reads or writes any file.
import { FRE } from '../tests/gjs-env.js';

const opts = { client: 'written', patches: {}, codes: [] };
const changes = [];
for (const a of ARGV) {
  const m = /^([\w-]+)=(.*)$/.exec(a);
  if (m && m[1] === 'client') opts.client = m[2];
  else if (m && m[1] === 'codes') opts.codes = m[2].split(',').filter(Boolean);
  else if (m && FRE.afterSave.PATCHES[m[1]]) opts.patches[m[1]] = m[2];
  else changes.push({ label: a, files: a.toLowerCase().split('+') });
}
if (!changes.length) changes.push({ label: 'character.txt.txt', files: ['character.txt.txt'] });

const client = {};
for (const c of changes) for (const f of c.files) client[f] = opts.client;
const r = FRE.afterSave.compute({ changes, client, patches: opts.patches, codes: opts.codes });

print('\nAfter saving:');
r.steps.forEach((s, i) => print(`  ${i + 1}. ${s.text}${s.state ? `  [${s.state}]` : ''}`));
if (!r.steps.length) print('  (nothing)');
for (const id of r.built) print(`  ✓ ${id}.diff is marked as built into Neuz.`);
for (const n of r.notes) print(`  ⚠ ${n.text}`);
print('\nEach change:');
for (const c of r.changes) {
  print(`  ${c.label}: ${c.needs.join(' + ') || 'nothing in the game reads it'}`);
  for (const w of c.why) print(`      - ${w}`);
}
