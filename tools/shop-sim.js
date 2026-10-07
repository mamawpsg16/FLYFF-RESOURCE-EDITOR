// What players pay and get back in one NPC's shop, by hand:   gjs -m tools/shop-sim.js <NPC key> [edit ...] [--fixtures]
// (from the repo root). Prints every tab as the server fills it (src/loaders/vendor-sim.js: ProcessRegenItem)
// with the price a player pays (OnBuyItem) and gets back when selling one (OnSellItem), applies the
// edits in memory, and prints it again. Never writes any file.
//   rates=<shop>,<buy>,<sell>   the server's shop rates (default 1,1,1: m_fShopCost, GetShopBuyFactor, GetShopSellFactor)
//   fixed<N>                     turn the rules of tab N (1-4) into fixed items (AddShopItem lines, same order)
//   price<N>:<II_X>=<n>          the same, with a price for one item (server-wide)
//   -<N>:<II_X>                  the same, without that item
//   cost:<II_X>=<n|=>            the item's own price (dwCost in Spec_Item.txt)
//   hide:<II_X>                  dwShopAble -1 (gone from every rule shop)
//   --fixtures                   read test-data/fixtures/Resource instead of test-data/Resource
// Example: gjs -m tools/shop-sim.js MaFl_Peach price1:II_SYS_SYS_SCR_AWAKE=150000
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const fixtures = argv.includes('--fixtures'); if (fixtures) argv.splice(argv.indexOf('--fixtures'), 1);
const DIR = ROOT + (fixtures ? '/test-data/fixtures/Resource' : '/test-data/Resource');
const key = argv.shift() || 'MaFl_Peach';
let rates = FRE.vendorSim.DEFAULT_RATES;

const files = new Map();
for (const [k, e] of loadFolder(DIR)) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'npc' }).load();
const D = ws.defines.defines, V = FRE.vendorSim;
const npcOf = () => ws.chars.npcs.filter(n => n.key.toLowerCase() === key.toLowerCase()).pop();
if (!npcOf()) { print(`No NPC ${key}.`); throw new Error('no such NPC'); }
const num = n => FRE.num.group(n);

function show(title) {
  const npc = npcOf();
  print(`\n${title} ${npc.name || npc.key} (${npc.key}, ${['Penya', 'Red Chip', 'Donate Chip'][FRE.shopOps.shopType(npc.venderType)]} shop)`);
  if (FRE.shopOps.shopType(npc.venderType) !== 0) { print('  A chip shop: prices are chips (dwReferValue1), not modelled here.'); return; }
  ws.simulate(npc).tabs.forEach((tab, t) => {
    if (!tab.entries.length && !npc.slotTitles[t]) return;
    print(`  Tab ${t + 1} "${npc.slotTitles[t] || ''}" (${tab.entries.length} item${tab.entries.length === 1 ? '' : 's'})`);
    ws.pricedTab(npc, t, rates).forEach((r, i) => {
      const by = r.setBy && r.setBy.npc !== npc ? `  (price set by ${r.setBy.npc.key})` : '';
      print(`    ${String(i + 1).padStart(3)}. ${r.prop.item.name || r.prop.item.define} [${r.kind === 'generated' ? 'rule' : 'fixed'}]  pays ${num(r.pay)}${r.min1 ? ' (no price: minimum 1)' : ''}` +
        `  gets back ${r.refused ? `nothing (${r.refused})` : num(r.get)}${by}`);
    });
  });
  for (const d of ws.diags.filter(d => d.npcKey === npc.key && /^C_PRICE/.test(d.code))) print(`  ${d.severity} ${d.code}: ${d.message}`);
}

const edits = [];
for (const a of argv) {
  const m = /^rates=([\d.]+),([\d.]+),([\d.]+)$/.exec(a);
  if (m) rates = { shopCost: Number(m[1]), buy: Number(m[2]), sell: Number(m[3]) }; else edits.push(a);
}
show('Before:');
const idOf = d => { const v = D.get(d); if (v === undefined) throw new Error(`unknown item ${d}`); return v >>> 0; };
for (const a of edits) {
  const npc = npcOf();
  let m;
  try {
    const convert = (tab, e) => {
      const plan = V.ruleToFixedPlan(ws.vendorIndex, npc, tab, ws.simulate(npc), e);
      ws.apply(npc.file.toLowerCase(), FRE.shopOps.convertRules(ws.fileOfNpc(npc).text, npc, plan), a);
      return `${plan.rules.length} rule(s) -> ${plan.items.filter(x => !x.omitted).length} AddShopItem line(s)`;
    };
    let how;
    if ((m = /^fixed([1-4])$/.exec(a))) how = convert(Number(m[1]) - 1, {});
    else if ((m = /^price([1-4]):(\w+)=(\d+)$/.exec(a))) how = convert(Number(m[1]) - 1, { price: new Map([[idOf(m[2]), Number(m[3])]]) });
    else if ((m = /^-([1-4]):(\w+)$/.exec(a))) how = convert(Number(m[1]) - 1, { omit: new Set([idOf(m[2])]) });
    else if ((m = /^cost:(\w+)=(\d+|=)$/.exec(a))) {
      ws.apply('spec_item.txt', FRE.itemOps.setCost(ws.files.get('spec_item.txt').text, ws.itemById(idOf(m[1])), m[2] === '=' ? null : Number(m[2]), D), a);
      how = `dwCost; also in: ${FRE.itemOps.penyaUses(ws, idOf(m[1])).map(u => u.npc.key).join(', ')}`;
    } else if ((m = /^hide:(\w+)$/.exec(a))) {
      const before = FRE.itemOps.penyaUses(ws, idOf(m[1])).filter(u => u.how === 'rule').map(u => u.npc.key);
      ws.apply('spec_item.txt', FRE.itemOps.setShopAble(ws.files.get('spec_item.txt').text, ws.itemById(idOf(m[1])), true, D), a);
      how = `dwShopAble -1; leaves: ${before.join(', ')}`;
    } else { print(`\nUnknown edit "${a}"`); continue; }
    print(`\n${a}: ${how}`);
  } catch (e) { print(`\n${a}: refused: ${e.message}`); }
}
if (edits.length) show('After (in memory, nothing written):');
