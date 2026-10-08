// The Donation Shop window by hand:   gjs -m tools/dstree-sim.js ["<category or group>"] [sort=default|name|price-low|price-high]
//   [sex=any|male|female] [search=<text>] [page=<n>] [patched] [--fixtures]   (from the repo root)
// Prints the sidebar tree and what a player sees after clicking that entry (src/loaders/donation-window.js,
// a port of CWndDonationShop: KeywordMatches, BuildFilteredList, DS_SortCmp, FillGrid, DS_CategoryBlurb).
// "patched": with docs/patches/donation-tree.diff built into Neuz (order and card text read from the tree).
// Reads test-data (or test-data/fixtures with --fixtures); never writes any file.
// Example: gjs -m tools/dstree-sim.js "Weapon Skins" sort=price-high sex=female patched
import { FRE, ROOT, loadFolder, openSource, exists } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures'), patched = flag('patched');
const opt = k => { const a = argv.find(x => x.startsWith(k + '=')); if (a) argv.splice(argv.indexOf(a), 1); return a ? a.slice(k.length + 1) : null; };
const sort = { default: 0, name: 1, 'price-low': 2, 'price-high': 3 }[opt('sort') || 'default'];
const sex = { any: 0, male: 1, female: 2 }[opt('sex') || 'any'];
const search = opt('search') || '', page = Number(opt('page') || 1) - 1;
const pick = argv[0] || null;

const BASE = ROOT + (fixtures ? '/test-data/fixtures' : '/test-data');
const files = new Map();
for (const [k, e] of loadFolder(BASE + (fixtures ? '/Resource' : '/Resource'))) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'donation' }).load();
const TREE = BASE + '/Client/Client/DonationShopTree.inc';
if (exists(TREE)) ws.setDonationTree(openSource({ name: 'DonationShopTree.inc', path: TREE }));
const tree = ws.donationTree;
if (!tree) throw new Error('no ' + TREE);

const shop = FRE.donationWindow.shopOf(ws.models.donation, ws.items.items);
const count = n => [...shop.catalog.values()].filter(k => FRE.donationWindow.leafKeywords(n).some(l => l.toLowerCase() === k.toLowerCase())).length;
print(`\nSidebar (${TREE.replace(ROOT + '/', '')}):`);
const walk = (n, d) => { print('  ' + '  '.repeat(d) + (n.children.length ? '▸ ' : '· ') + n.name + (n.parent ? `  (${count(n)})` : '')); n.children.forEach(c => walk(c, d + 1)); };
tree.roots.forEach(n => walk(n, 0));

const node = pick ? tree.find(pick) : null;
if (pick && !node) throw new Error(`"${pick}" is not in the tree`);
const v = FRE.donationWindow.view(shop, tree, { node, sort, sex, search, page, patched });
print(`\nClick "${v.keyword}" · sort ${FRE.donationWindow.SORTS[sort]} · ${FRE.donationWindow.SEXES[sex]}${search ? ` · search "${search}"` : ''} · ${patched ? 'with' : 'without'} donation-tree.diff`);
print(`Count line: ${v.count}`);
v.grid.forEach((id, i) => {
  const p = shop.items.get(id), kw = shop.catalog.get(id);
  print(`  ${String(v.page * FRE.donationWindow.GRID_MAX + i + 1).padStart(3)}. ${p.name}  [${kw}]  ${p.chip === 0xFFFFFFFF ? 'no price' : p.chip + ' Donate Chips'}`);
});
if (v.grid.length) print(`\nCard line of "${shop.catalog.get(v.grid[0])}": ${FRE.donationWindow.blurb(shop.catalog.get(v.grid[0]), tree, patched)}`);
