// UI harness: runs the real editor UI against an in-memory fake of the File
// System Access API, filled from test-data/Resource (embedded as base64 by the harness build).
// Built into test-data/harness.html by `python3 build.py --harness`; run by
// tests/run-ui.sh (headless Firefox screenshot). Never touches real files.
(function (FRE) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const STOP = params.get('stop') || 'end';     // 'loaded' | 'shoptype' | 'review' | 'end'
  const results = [];
  const ok = (c, name) => results.push({ c: !!c, name });

  // ---- fake handles -------------------------------------------------------
  const notFound = n => Object.assign(new Error(n + ' not found'), { name: 'NotFoundError' });
  class FakeFile {
    constructor(name, bytes) { this.kind = 'file'; this.name = name; this.bytes = bytes; this.lastModified = 1; this.writes = 0; }
    async getFile() { const b = this.bytes; return { size: b.length, lastModified: this.lastModified, arrayBuffer: async () => b.slice().buffer }; }
    async createWritable() {
      let buf = null; const self = this;
      return { write: async d => { buf = new Uint8Array(d); }, close: async () => { self.bytes = buf; self.lastModified++; self.writes++; }, abort: async () => {} };
    }
    async queryPermission() { return 'granted'; }
  }
  class FakeDir {
    constructor(name) { this.kind = 'directory'; this.name = name; this.children = new Map(); }
    async *entries() { for (const e of this.children) yield e; }
    async getDirectoryHandle(n, o = {}) {
      if (this.children.has(n)) return this.children.get(n);
      if (!o.create) throw notFound(n);
      const d = new FakeDir(n); this.children.set(n, d); return d;
    }
    async getFileHandle(n, o = {}) {
      if (this.children.has(n)) return this.children.get(n);
      if (!o.create) throw notFound(n);
      const f = new FakeFile(n, new Uint8Array(0)); this.children.set(n, f); return f;
    }
    async isSameEntry(o) { return o === this; }
    async removeEntry(n) { if (!this.children.delete(n)) throw notFound(n); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
  }

  // ---- fake Resource folder from the fixtures embedded by build.py --harness
  const res = new FakeDir('Resource');
  for (const [n, b64] of Object.entries(FRE.HARNESS_FILES)) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    res.children.set(n, new FakeFile(n, u8));
  }
  const original = new Map([...res.children].map(([n, f]) => [n, f.bytes]));
  const backups = new FakeDir('backups');
  // fake Client folder like the real one: character.inc / DonationShop.inc identical,
  // Spec_Item.txt with LF line endings, no loose character-etc.inc / character-school.inc
  const clientDir = new FakeDir('Client');
  const lfOnly = b => { const o = []; for (let i = 0; i < b.length; i++) if (!(b[i] === 13 && b[i + 1] === 10)) o.push(b[i]); return new Uint8Array(o); };
  for (const n of ['character.inc', 'DonationShop.inc']) clientDir.children.set(n, new FakeFile(n, original.get(n).slice()));
  clientDir.children.set('Spec_Item.txt', new FakeFile('Spec_Item.txt', lfOnly(original.get('Spec_Item.txt'))));
  const clientOriginal = new Map([...clientDir.children].map(([n, f]) => [n, f.bytes]));
  if (FRE.HARNESS_TREE) {                 // Client/Client/DonationShopTree.inc (client-only category tree)
    const sub = new FakeDir('Client'), bin = atob(FRE.HARNESS_TREE), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    sub.children.set('DonationShopTree.inc', new FakeFile('DonationShopTree.inc', u8));
    clientDir.children.set('Client', sub);
  }

  FRE.fsa = Object.assign({}, FRE.fsa, {
    supported: () => true,
    pickFolder: async id => (id === 'flyff-resource' ? res : id === 'flyff-client' ? clientDir : backups),
    remember: async () => {}, recall: async () => null,
  });

  // ---- scenario -----------------------------------------------------------
  const $ = id => document.getElementById(id);
  const tick = async (n = 50) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
  async function waitFor(pred, what) {
    for (let i = 0; i < 400; i++) { if (pred()) return true; await tick(); }
    ok(false, 'timed out waiting for ' + what); return false;
  }
  const click = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const renderAllForTest = () => FRE.app.ctx.renderAll(false);
  const btnByText = (root, t) => [...root.querySelectorAll('button')].find(b => b.textContent.includes(t));

  async function scenario() {
    await waitFor(() => FRE.app.state && $('btn-load'), 'app init');
    click($('btn-load'));
    await waitFor(() => FRE.app.state.ws, 'workspace');
    const S = FRE.app.state;
    ok(S.ws.items.rows.length === 8067, 'items loaded (8067)');
    ok(document.querySelectorAll('#list .npc').length === 6 && /Shops with editable items \(6\)/.test(document.querySelector('select.npc-filter').textContent), 'NPC list defaults to the 6 shops with editable items');
    ok(S.ws.diags.filter(d => d.code === 'C_NO_OPEN_BRACE').length === 6, '6 missing-brace warnings');

    const lui = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Lui'));
    click(lui);
    ok($('editor').textContent.includes('Lui'), 'Lui selected');
    click(btnByText(document.querySelector('.tabs'), 'Magic Tools'));
    ok($('editor').textContent.includes('II_GEN_FOO_COO_DDUKGUKHOT'), 'tab 1 shows the existing AddShopItem');
    ok(/Items in this tab \(11\/100\)/.test($('editor').textContent), 'one table lists the 11 items players see in Lui tab 1');
    ok($('editor').textContent.includes('Refresher'), 'rules show readable type names');
    if (STOP === 'loaded') return;

    // NPC list filter by currency
    const filt = document.querySelector('select.npc-filter');
    filt.value = 'red'; filt.dispatchEvent(new Event('change'));
    const redList = [...document.querySelectorAll('#list .npc')];
    ok(redList.length === 1 && redList[0].textContent.includes('MaFl_Waforu'), 'filter "Red Chip shops" lists only Waforu');
    ok(/Red Chip shops \(1\)/.test(document.querySelector('select.npc-filter').textContent), 'filter shows counts');
    ok(!/Donate Chip shops/.test(document.querySelector('select.npc-filter').textContent), 'empty filter (Donate Chip shops, 0) is hidden');
    const f2 = document.querySelector('select.npc-filter');
    f2.value = 'shops'; f2.dispatchEvent(new Event('change'));
    ok(document.querySelectorAll('#list .npc').length > 50, 'filter back to all shops');

    // shop type: Lui Penya -> Red Chip via the dropdown, preview, confirm, one undo
    const ciText0 = S.ws.files.get('character.inc').text;
    const typeSel = $('editor').querySelector('select.shop-type');
    ok(typeSel && !typeSel.disabled, 'shop-type dropdown enabled');
    ok(![...typeSel.options].some(o => o.textContent.includes('Donate')), 'no "Donate Chip shop" option (Donation Shop window replaced it, 7d7df4f9)');
    typeSel.value = '1'; typeSel.dispatchEvent(new Event('change'));
    await waitFor(() => btnByText(document, 'Make it a Red Chip shop'), 'shop-type preview');
    const pm = document.querySelector('.modal');
    ok(typeSel.value === '0', 'dropdown waits for confirmation');
    ok(pm.querySelectorAll('.diff .add').length === 2 && pm.querySelectorAll('.diff .del').length === 1, 'preview shows 2 added + 1 removed line');
    ok(pm.textContent.includes('1,000,000 Penya (removed)'), 'preview shows the dropped Penya price');
    ok(pm.querySelectorAll('table.items input.num-input').length === 1, 'preview has a chip price box per converted item');
    ok(S.ws.files.get('character.inc').text === ciText0, 'preview does not edit the file');
    if (STOP === 'shoptype') return;
    click(btnByText(document, 'Make it a Red Chip shop'));
    const t1 = S.ws.files.get('character.inc').text;
    ok(t1.includes('\t\tSetVenderType(1);\r\n') && t1.includes('AddVenderItem2( 1, II_GEN_FOO_COO_DDUKGUKHOT );'), 'conversion written');
    ok([...document.querySelectorAll('#list .npc.sel .tag.chip')].some(t => t.textContent === 'Red Chip'), 'list shows the Red Chip tag');
    ok($('editor').querySelector('select.shop-type').value === '1', 'dropdown shows Red Chip');
    click($('btn-undo'));
    ok(S.ws.files.get('character.inc').text === ciText0, 'one undo restores the file');

    const search = $('item-search');
    search.value = 'II_SYS_SYS_SCR_BLESSEDNESS'; search.dispatchEvent(new Event('input'));
    const plus = [...document.querySelectorAll('#item-list .item')].find(r => r.querySelector('.def').textContent === 'II_SYS_SYS_SCR_BLESSEDNESS').querySelector('button');
    click(plus);
    ok([...$('editor').querySelectorAll('.def.block')].some(td => td.textContent === 'II_SYS_SYS_SCR_BLESSEDNESS'), 'item added to the shop');
    const priceInputs = [...$('editor').querySelectorAll('input.num-input')];
    ok(priceInputs[0].value === '1,000,000', 'existing price is shown with commas');
    const inp = priceInputs[priceInputs.length - 1];
    inp.value = '25,000'; inp.dispatchEvent(new Event('change'));   // typed with a comma
    ok(/AddShopItem\( 1, II_SYS_SYS_SCR_BLESSEDNESS, 25000 \);/.test(S.ws.files.get('character.inc').text), 'price typed as "25,000" is written as plain 25000');
    ok(!$('btn-save').disabled, 'Save enabled');

    click($('btn-save'));
    await waitFor(() => btnByText(document, 'Choose folder'), 'backup prompt');
    click(btnByText(document, 'Choose folder'));
    await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog');
    ok(document.querySelectorAll('.diff .add').length === 1 && document.querySelectorAll('.diff .del').length === 0, 'review shows exactly one added line');
    if (STOP === 'review') return;

    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent)), 'save finished');
    const ch = res.children.get('character.inc');
    ok(ch.writes === 1, 'character.inc written once');
    ok(FRE.bytes.bytesEqual(ch.bytes, S.ws.files.get('character.inc').bytes), 'disk == editor baseline after save');
    let others = 0;
    for (const [n, f] of res.children) if (n !== 'character.inc' && f.writes) others++;
    ok(others === 0, 'no other file was written');
    const bdir = [...backups.children.values()][0];
    ok(bdir && FRE.bytes.bytesEqual(bdir.children.get('character.inc').bytes, original.get('character.inc')), 'backup holds the original bytes');
    ok(bdir && bdir.children.has('manifest.json'), 'manifest written');
    // byte-level proof: removing the one inserted line from the new file gives the original bytes
    const o = original.get('character.inc'), nb = ch.bytes;
    const line = '\t\tAddShopItem( 1, II_SYS_SYS_SCR_BLESSEDNESS, 25000 );\r\n';
    const newText = FRE.bytes.utf16leToString(nb, 2);
    const at = newText.indexOf(line);
    const without = FRE.bytes.concatBytes([nb.subarray(0, 2), FRE.bytes.stringToUtf16le(newText.slice(0, at) + newText.slice(at + line.length))]);
    ok(at > 0 && newText.indexOf(line, at + 1) < 0 && FRE.bytes.bytesEqual(without, o), 'only the new line differs, byte-for-byte');
    ok(S.ws.dirtyFiles().length === 0 && $('btn-save').disabled, 'clean after save');

    // a conflicting external change must abort the next save
    const lui2 = S.ws.chars.byKey.get('mafl_lui')[0];
    const f = S.ws.fileOfNpc(lui2);
    S.ws.apply('character.inc', FRE.shopOps.setCost(f.text, lui2.statements.filter(r => r.cmd === 'AddShopItem')[0], 7), 'p');
    ch.bytes = new Uint8Array([...ch.bytes, 0x20, 0x00]);       // someone else edits the file
    const rep = await FRE.save.save(S.ws, backups);
    ok(!rep.ok && rep.conflict === 'character.inc', 'external change detected, save aborted');

    // a write that fails half-way through a two-file save must restore the file already written
    ch.bytes = S.ws.files.get('character.inc').bytes;                 // undo the "external" change
    const etc = res.children.get('character-etc.inc');
    const etcBefore = etc.bytes;
    S.ws.apply('character-etc.inc', [{ start: 0, end: 0, insert: '// harness\r\n' }], 'raw');
    const realCreate = ch.createWritable;
    ch.createWritable = async () => { throw new Error('simulated disk error'); };
    const nBackups = backups.children.size;
    const rep2 = await FRE.save.save(S.ws, backups);
    ch.createWritable = realCreate;
    ok(!rep2.ok, 'failed write reported');
    ok(etc.writes === 2 && FRE.bytes.bytesEqual(etc.bytes, etcBefore), 'file written before the failure was restored to its original bytes');
    ok(FRE.bytes.bytesEqual(ch.bytes, S.ws.files.get('character.inc').bytes), 'failed file left untouched');
    ok(backups.children.size === nBackups + 1, 'backup made before the failed write');
    ok(S.ws.dirtyFiles().length === 2, 'edits kept in the editor after a failed save');
    document.querySelectorAll('.modal-back').forEach(m => m.remove());
    while (S.ws.undo() !== null);
    ok(S.ws.dirtyFiles().length === 0, 'undo all: clean');

    // ---- Client sync + chip price edit (Spec_Item.txt dwReferValue1)
    click($('btn-client-dir'));
    await waitFor(() => S.client && S.client.files.size === 3, 'client folder');
    ok(/Client sync on/.test($('banners').textContent) && /Spec_Item.txt: same, LF/.test($('banners').textContent), 'banner shows the Client sync modes');
    const waf = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Waforu'));
    click(waf);
    click(document.querySelectorAll('.tabs button')[1]);
    const row = [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.textContent.includes('II_SYS_SYS_SCR_BLESSEDNESS'));
    const chipIn = row && row.querySelector('input.num-input');
    ok(chipIn && chipIn.value === '50', 'Waforu shows the chip price 50 in an input');
    chipIn.value = '75'; chipIn.dispatchEvent(new Event('change'));
    ok(FRE.specItem.get(S.ws.itemById(S.ws.defines.defines.get('II_SYS_SYS_SCR_BLESSEDNESS')), 'dwReferValue1') === 75, 'chip price 75 applied');
    click($('btn-save'));
    await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (client)');
    ok(/Client\//.test(document.querySelector('.modal').textContent) && /LF kept/.test(document.querySelector('.modal').textContent), 'review lists the Client copy');
    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent)), 'save finished (client)');
    const srv = res.children.get('Spec_Item.txt').bytes, cli = clientDir.children.get('Spec_Item.txt').bytes;
    ok(FRE.bytes.bytesEqual(lfOnly(srv), cli), 'Client Spec_Item.txt == server Spec_Item.txt with LF');
    ok(!FRE.bytes.bytesEqual(cli, clientOriginal.get('Spec_Item.txt')) && cli.length === clientOriginal.get('Spec_Item.txt').length, 'Client copy changed by the same 2 digits');
    ok(FRE.bytes.bytesEqual(clientDir.children.get('character.inc').bytes, clientOriginal.get('character.inc')), 'Client character.inc untouched (not edited)');
    const bk = [...backups.children.values()].pop();
    ok(bk.children.has('Client') && FRE.bytes.bytesEqual(bk.children.get('Client').children.get('Spec_Item.txt').bytes, clientOriginal.get('Spec_Item.txt')), 'backup holds the original Client copy');
    ok(S.ws.dirtyFiles().length === 0, 'clean after the synced save');
    document.querySelectorAll('.modal-back').forEach(m => m.remove());

    // ---- tooltip on hover
    const cell = $('editor').querySelector('[data-item-id]');
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 400, clientY: 300 }));
    const tip = $('item-tooltip');
    ok(tip && !tip.hidden && /Required Level/.test(tip.textContent) && /Editor info/.test(tip.textContent), 'hover shows the item tooltip');
    cell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: 5, clientY: 5 }));
    document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    // ---- Donation Shop
    click([...document.querySelectorAll('#mode-tabs button')].find(b => b.textContent.includes('Donation Shop')));
    ok(S.mode === 'donation', 'Donation Shop mode');
    ok([...document.querySelectorAll('#list .group')].some(g => g.textContent === 'Weapon Skins'), 'categories follow the client tree');
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Consumables')));
    ok(/Items \(14\)/.test($('editor').textContent), 'Consumables lists 14 items');
    const dsText0 = S.ws.files.get('donationshop.inc').text;
    const search2 = $('item-search');
    search2.value = 'II_SYS_SYS_SCR_BLESSEDNESS'; search2.dispatchEvent(new Event('input'));
    const plus2 = [...document.querySelectorAll('#item-list .item')].find(r => r.querySelector('.def').textContent === 'II_SYS_SYS_SCR_BLESSEDNESS').querySelector('button');
    ok(!plus2.disabled, '+ is enabled for a category');
    click(plus2);
    ok(S.ws.files.get('donationshop.inc').text.includes('\tDSItem\t"Consumables"\tII_SYS_SYS_SCR_BLESSEDNESS\n'), 'item added to Consumables (LF row)');
    ok(/Items \(15\)/.test($('editor').textContent), 'Consumables now lists 15 items');
    const row2 = [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.textContent.includes('II_SYS_SYS_SCR_BLESSEDNESS'));
    ok(row2.querySelector('input.num-input').value === '75', 'price column shows the shared chip price (75, set at Waforu above)');
    const sel2 = row2.querySelector('select');
    sel2.value = 'Functional'; sel2.dispatchEvent(new Event('change'));
    ok(S.ws.files.get('donationshop.inc').text.includes('"Functional"\tII_SYS_SYS_SCR_BLESSEDNESS'), 'moved to Functional');
    click($('btn-undo')); click($('btn-undo'));
    ok(S.ws.files.get('donationshop.inc').text === dsText0, 'two undos restore DonationShop.inc');
    // a long category must scroll inside the editor (it once grew past the window)
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Suits')));
    const ed = $('editor');
    ok(ed.scrollHeight > ed.clientHeight && ed.getBoundingClientRect().bottom <= window.innerHeight + 1, 'long category scrolls inside the window');
    ed.scrollTop = ed.scrollHeight;
    const lastRow = [...ed.querySelectorAll('table.items tr')].pop();
    ok(lastRow.getBoundingClientRect().bottom <= ed.getBoundingClientRect().bottom + 1, 'the last row can be scrolled into view');
    const keep = ed.scrollTop;
    renderAllForTest();
    ok(Math.abs(ed.scrollTop - keep) < 2, 'scroll position kept when the same view re-renders');
    ok($('mode-tabs').textContent.startsWith('Editing:'), 'editor switch is labelled');
    // focusing a price box in the last row must scroll the editor, never the page (user report)
    const lastIn = [...ed.querySelectorAll('input.num-input')].pop();
    ed.scrollTop = 0;
    lastIn.focus(); lastIn.scrollIntoView();
    await tick();
    const sc = document.scrollingElement;
    ok(sc.scrollTop === 0 && document.body.scrollTop === 0 && $('toolbar').getBoundingClientRect().top === 0, 'the page itself never scrolls (toolbar stays on screen)');
    ok($('layout').getBoundingClientRect().bottom <= window.innerHeight + 1 && lastIn.getBoundingClientRect().bottom <= window.innerHeight + 1, 'focused last row is visible inside the window');
    lastIn.blur();
    if (STOP === 'end') click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Shields')));
  }

  document.addEventListener('DOMContentLoaded', () => scenario().catch(e => ok(false, 'exception: ' + e.message + ' ' + e.stack)).then(() => {
    const failed = results.filter(r => !r.c);
    document.title = failed.length ? `FAIL ${failed.length}` : `PASS ${results.length}`;
    const box = document.createElement('div');
    box.id = 'harness-results';
    box.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99;background:#000c;border:1px solid #4f8cff;padding:8px 12px;font:12px monospace;max-width:480px;white-space:pre-wrap';
    // only the failures are listed (the full list no longer fits on screen)
    box.textContent = `UI harness (stop=${STOP}): ${results.length - failed.length}/${results.length} passed` + (failed.length ? '\n' + failed.map(r => '✗ ' + r.name).join('\n') : ' ✓');
    if (STOP !== 'end') box.style.display = 'none';
    document.body.appendChild(box);
    const pre = document.createElement('pre'); pre.id = 'harness-json'; pre.hidden = true; pre.textContent = JSON.stringify(results); document.body.appendChild(pre);
  }));
})(globalThis.FRE);
