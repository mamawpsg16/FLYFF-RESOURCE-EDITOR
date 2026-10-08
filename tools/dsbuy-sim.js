// Buying in the Donation Shop by hand:   gjs -m tools/dsbuy-sim.js <II_ item> [n=<typed quantity>] [chips=<Donate Chips>]
//   [free=<empty bag slots>] [have=<same item already in the bag>] [price=<chip price instead of Spec_Item's>]
//   [raw] [--fixtures]   (from the repo root)
// Runs src/loaders/donation-buy.js: the client's confirm dialog (CWndConfirmBuyDonation), then the packet
// it sends through CDPSrvr::OnBuyDonationItem. "raw": skip the dialog and send n as the packet's count
// (what a modified client could send). Reads test-data (or test-data/fixtures); never writes any file.
// Example: gjs -m tools/dsbuy-sim.js II_SYS_SYS_SCR_BXMNITRORACING n=3 chips=2000 free=5
//          gjs -m tools/dsbuy-sim.js II_SYS_SYS_SCR_BXMNITRORACING n=9999 chips=1000 price=214770   (the overflow)
import { FRE, ROOT, loadFolder, openSource } from '../tests/gjs-env.js';

const argv = [...ARGV];
const flag = f => { const i = argv.indexOf(f); if (i >= 0) argv.splice(i, 1); return i >= 0; };
const fixtures = flag('--fixtures'), raw = flag('raw');
const opt = (k, d) => { const a = argv.find(x => x.startsWith(k + '=')); if (a) argv.splice(argv.indexOf(a), 1); return a ? Number(a.slice(k.length + 1)) : d; };
const n = opt('n', 1), chips = opt('chips', 1000), free = opt('free', 10), have = opt('have', 0), price = opt('price', null);
const def = argv[0];
if (!def) throw new Error('usage: gjs -m tools/dsbuy-sim.js <II_ item> [n=] [chips=] [free=] [have=] [price=] [raw]');

const files = new Map();
for (const [k, e] of loadFolder(ROOT + (fixtures ? '/test-data/fixtures' : '/test-data') + '/Resource')) files.set(k, openSource(e));
const ws = new FRE.Workspace(files, { only: 'donation' }).load();
const D = ws.defines.defines, B = FRE.donationBuy, fmt = FRE.dom ? FRE.dom.fmt : String;
if (!D.has(def)) throw new Error(`${def} is not defined`);
const id = D.get(def) >>> 0;
let env = B.envFromWorkspace(ws, price === null ? {} : { [id]: { chip: price } });
const pr = env.prop(id);

// the bag: chips in full stacks, `have` of the item, other items until `free` slots are left
const slots = {};
let at = 0;
for (let left = chips; left > 0; left -= 9999) slots[at++] = [env.chipId, Math.min(left, 9999), 0];
if (have) slots[at++] = [id, have, 0];
const p = B.playerOf({ unlocked: 168, slots, fill: Math.max(0, 168 - at - free) });

print(`\n${pr ? pr.name : def} (${def})  ·  listed: ${env.catalog.has(id) ? `yes, "${env.catalog.get(id)}"` : 'no'}  ·  price: ${pr && (pr.chip | 0) >= 1 ? fmt(pr.chip) + ' Donate Chips' : 'none'}  ·  stack ${pr ? pr.packMax : '-'}`);
print(`Bag: ${fmt(chips)} Donate Chips, ${free} empty slots${have ? `, ${have} of the item` : ''}`);
let r;
if (raw) r = { client: null, server: B.serverBuy(env, p, id, n) };
else {
  r = B.buy(env, p, id, n);
  const c = r.client;
  print(`\nConfirm box: quantity ${n}${c.shown !== null ? `, total shown ${fmt(c.shown)}` : ''}`);
  print(c.box ? `  -> message box: "${B.CLIENT_TEXT[c.box]}" (nothing sent)` : `  -> OK sends: buy ${c.sent}`);
}
const s = r.server;
if (s) {
  print(`\nServer: ${s.outcome}${s.text ? ` -> chat: "${env.text(s.text) || s.text}"` : ''}`);
  if (s.total !== null && s.total !== undefined) print(`  total ${fmt(s.cost)} x ${s.num} = ${fmt(s.total)}${s.overflow ? ` (as an int: ${s.total | 0}: OVERFLOW, the chip check passes)` : ''}`);
  print(`  paid ${fmt(s.paid)} Donate Chips: ${fmt(s.chipsBefore)} -> ${fmt(s.chipsAfter)}`);
}
print('\nBag after (other items left out):');
for (const [pos, iid, num] of B.dump(p)) print(`  slot ${pos + 1}: ${env.prop(iid) ? env.prop(iid).name : iid} x${num}`);
