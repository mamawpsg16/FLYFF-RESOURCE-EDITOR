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
  for (const [path, b64] of Object.entries(FRE.HARNESS_FILES)) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const parts = path.split('/'), n = parts.pop();
    let dir = res;
    for (const p of parts) { if (!dir.children.has(p)) dir.children.set(p, new FakeDir(p)); dir = dir.children.get(p); }
    dir.children.set(n, new FakeFile(n, u8));
  }
  const original = new Map([...res.children].filter(([, f]) => f.kind === 'file').map(([n, f]) => [n, f.bytes]));
  const backups = new FakeDir('backups');
  // fake Client folder like the real one: character.inc / DonationShop.inc identical,
  // Spec_Item.txt with LF line endings, no loose character-etc.inc / character-school.inc
  const clientDir = new FakeDir('Client');
  const lfOnly = b => { const o = []; for (let i = 0; i < b.length; i++) if (!(b[i] === 13 && b[i + 1] === 10)) o.push(b[i]); return new Uint8Array(o); };
  for (const n of ['character.inc', 'DonationShop.inc', 'BattlePass.inc']) clientDir.children.set(n, new FakeFile(n, original.get(n).slice()));
  clientDir.children.set('Spec_Item.txt', new FakeFile('Spec_Item.txt', lfOnly(original.get('Spec_Item.txt'))));
  // a new building tag's files (b4b9a465): defineNeuz.h is LF in Client, etc.inc / etc.txt.txt identical
  clientDir.children.set('defineNeuz.h', new FakeFile('defineNeuz.h', lfOnly(original.get('defineNeuz.h'))));
  for (const n of ['etc.inc', 'etc.txt.txt']) clientDir.children.set(n, new FakeFile(n, original.get(n).slice()));
  // a new exchange menu's files: defineText.h is LF in Client, textClient.* identical
  clientDir.children.set('defineText.h', new FakeFile('defineText.h', lfOnly(original.get('defineText.h'))));
  for (const n of ['textClient.inc', 'textClient.txt.txt']) clientDir.children.set(n, new FakeFile(n, original.get(n).slice()));
  // a test copy has no Client/Model folder, only its file names (tools/refresh-fixtures.sh writes Client/Model.list)
  if (FRE.HARNESS_MODEL_LIST) clientDir.children.set('Model.list', new FakeFile('Model.list', new TextEncoder().encode(FRE.HARNESS_MODEL_LIST)));
  if (FRE.HARNESS_TEX_LIST) clientDir.children.set('ModelTexture.list', new FakeFile('ModelTexture.list', new TextEncoder().encode(FRE.HARNESS_TEX_LIST)));
  if (FRE.HARNESS_TEX_INDEX) clientDir.children.set('Model.textures', new FakeFile('Model.textures', new TextEncoder().encode(FRE.HARNESS_TEX_INDEX)));
  clientDir.children.set('character.txt.txt', new FakeFile('character.txt.txt', original.get('character.txt.txt').slice()));
  {                                       // Client/World/<map>/<map>.dyo: the same bytes as the server's (Add New NPC writes both)
    const cw = new FakeDir('World');
    for (const [n, d] of res.children.get('World').children) {
      const dyo = [...d.children.values()].find(f => f.kind === 'file' && /\.dyo$/i.test(f.name));
      if (!dyo) continue;
      const cd = new FakeDir(n); cd.children.set(dyo.name, new FakeFile(dyo.name, dyo.bytes.slice())); cw.children.set(n, cd);
    }
    clientDir.children.set('World', cw);
  }
  clientDir.children.set('Exchange_Script.txt', new FakeFile('Exchange_Script.txt', lfOnly(original.get('Exchange_Script.txt'))));
  {                                       // Client/Theme: Battle Pass textures (names only)
    const th = new FakeDir('Theme');
    for (const n of ['BattlePass_New.tga', 'BattlePass_Fire.tga', 'BattlePass_Image0.tga']) th.children.set(n, new FakeFile(n, new Uint8Array(0)));
    clientDir.children.set('Theme', th);
  }
  const clientOriginal = new Map([...clientDir.children].map(([n, f]) => [n, f.bytes]));
  if (FRE.HARNESS_TREE) {                 // Client/Client/DonationShopTree.inc (client-only category tree)
    const sub = new FakeDir('Client'), bin = atob(FRE.HARNESS_TREE), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    sub.children.set('DonationShopTree.inc', new FakeFile('DonationShopTree.inc', u8));
    clientDir.children.set('Client', sub);
  }

  // the folder the user picks: FLYFF-V19-SOURCE with Server/Resource and Client (FRE.layout finds them)
  const root = new FakeDir('FLYFF-V19-SOURCE');
  const serverDir = new FakeDir('Server');
  serverDir.children.set('Resource', res);
  root.children.set('Server', serverDir);
  root.children.set('Client', clientDir);
  FRE.fsa = Object.assign({}, FRE.fsa, {
    supported: () => true,
    pickFolder: async id => (id === 'flyff-root' ? root : backups),
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
  const lastModalAny = () => [...document.querySelectorAll('.modal')].pop();
  // Try it on a form's exchange card (ui/menu-form.js, before Create): the shared Try window opens on top,
  // presses OK on a scratch load, and nothing in the workspace changes. -> the Try window's text
  async function tryCard(cardEl, what, keepOpen = false) {
    const S = FRE.app.state, steps = S.ws.history.length, dirty = S.ws.dirtyFiles().length, forms = document.querySelectorAll('.modal').length;
    click(cardEl.querySelector('button.mf-try'));
    await waitFor(() => document.querySelectorAll('.modal').length === forms + 1 && lastModalAny().querySelector('.ex-try-out'), `Try window (${what})`);
    const tw = lastModalAny(), text = tw.textContent;
    ok(/exchanged/.test(text) && /Taken from the player: \S/.test(text) && /not (created|added) yet/.test(tw.querySelector('header').textContent) && /as Create would write it/.test(text)
      && S.ws.history.length === steps && S.ws.dirtyFiles().length === dirty, `${what}: Try it presses OK before Create; no edit, no file changed`);
    if (!keepOpen) { click(btnByText(tw.querySelector('footer'), 'Close')); ok(document.querySelectorAll('.modal').length === forms, `${what}: closing Try returns to the form`); }
    return { text, tw, header: tw.querySelector('header').textContent };
  }

  // [Change task] (when a task is open) then the task's card on the start screen
  async function openTask(id) {
    const S = FRE.app.state;
    if (S.task) {
      click($('btn-change-task'));
      await waitFor(() => !S.task || document.querySelector('.modal'), 'start screen');
      if (S.task) { ok(false, `unsaved changes stopped the switch to ${id}`); return; }
      ok(getComputedStyle($('btn-diag')).display === 'none', 'start screen: the problems badge is hidden');
    }
    click(document.querySelector(`.task-card[data-task="${id}"]`));
    await waitFor(() => S.task === id && S.ws && !S.busy, 'task ' + id);
  }

  async function scenario() {
    await waitFor(() => FRE.app.state && $('btn-root'), 'app init');
    const S = FRE.app.state;
    ok(document.body.classList.contains('start') && /What do you want to edit/.test($('editor').textContent), 'start screen first');
    ok([...document.querySelectorAll('.task-card')].every(b => b.disabled), 'tasks wait for the folder');
    click($('btn-root'));
    await waitFor(() => S.layout, 'folder detected');
    ok(S.layout.kind === 'real' && S.layout.res === res && S.layout.client === clientDir && !S.layout.backups, 'FLYFF-V19-SOURCE -> Server/Resource + Client, no folder created in it');
    ok(/REAL SERVER FILES/.test($('editor').textContent) && document.querySelectorAll('.task-card:not(:disabled)').length === 4 && !document.querySelector('.task-card[data-task="exchange"]') && document.querySelector('.task-card[data-task="drops"]'), 'real-files tag; 4 tasks to pick (exchanges are in NPC Shops; Monster Drops)');
    ok(!root.children.has('backups'), 'nothing created inside the source folder');
    if (STOP === 'start') return;
    await openTask('npc');
    ok(!document.body.classList.contains('start') && /Task:\s*NPC Shops/.test($('mode-tabs').textContent), 'NPC Shops task open');
    ok(S.client && S.client.dir === clientDir, 'Client copies attached automatically');
    ok(S.ws.items.rows.length === 8067, 'items loaded (8067)');
    ok(document.querySelectorAll('#list .npc').length === 6 && /Shops with hand-picked items \(6\)/.test(document.querySelector('select.npc-filter').textContent), 'NPC list defaults to the 6 shops with fixed items (AddShopItem)');
    ok(S.ws.diags.filter(d => d.code === 'C_NO_OPEN_BRACE').length === 6, '6 missing-brace warnings');

    const lui = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Lui'));
    click(lui);
    ok($('editor').textContent.includes('Lui'), 'Lui selected');
    // where the NPC stands (loaders/area.js): map window name, area caption, /te
    ok(/Where:\s*Flaris — Flarine \/ Central Flarine/.test($('editor').querySelector('.where').textContent) && /^\/te 1 \d+ \d+$/.test($('editor').querySelector('.where button.te').textContent), 'NPC header: where Lui stands + /te button');
    ok(/Flaris — Flarine/.test(lui.querySelector('.where-short').textContent), 'NPC list: the area under each NPC');
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
    const priceInputs = [...$('editor').querySelectorAll('tr.fixed input.num-input')];
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
    {
      const t = document.querySelector('.modal .after-save');
      ok(t && /Run Stop Server\.bat, then Start Server\.bat/.test(t.textContent) && !/C\+\+/.test(t.textContent), 'review: "After saving" says Stop / Start Server.bat, no C++ step', t && t.textContent);
      ok(t && /Each change \(2\)/.test(t.textContent) && /server restart \+ game restart/.test(t.textContent), 'review: the two changes (add, price) and what they need', t && t.textContent);
      ok(!/Restart the WorldServer/.test($('banners').textContent), 'banners: no fixed "Restart the WorldServer"');
    }
    if (STOP === 'review') return;

    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent)), 'save finished');
    ok([...document.querySelectorAll('.modal .after-save')].some(x => /Run Stop Server\.bat/.test(x.textContent)), 'Saved window repeats the "After saving" list');
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
    ok(FRE.bytes.bytesEqual(clientDir.children.get('character.inc').bytes, res.children.get('character.inc').bytes), 'Client character.inc == Server (synced by the first save)');
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

    // ---- + New NPC (ui/new-npc.js): the §5 example, created, saved to Server + Client
    {
      const madSrv = res.children.get('World').children.get('WdMadrigal').children.get('WdMadrigal.dyo');
      const madCli = clientDir.children.get('World').children.get('WdMadrigal').children.get('WdMadrigal.dyo');
      const before = { dyo: madSrv.bytes, txt: res.children.get('character.txt.txt').bytes, inc: res.children.get('character.inc').bytes };
      // a list search that would hide the new NPC (user report: searched "Jeff", created Bob, Bob not listed)
      const ls = $('list-search'); ls.value = 'Jeff'; ls.dispatchEvent(new Event('input'));
      click(btnByText(document.getElementById('list-action'), '+ NPC'));
      await waitFor(() => document.querySelector('.newnpc'), 'new NPC form');
      const form = document.querySelector('.newnpc');
      const type = (sel, v) => { const el = form.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input')); };
      type('input[placeholder="MaFl_Lumi"]', 'MaFl_Lumi'); type('input[placeholder="Lumi"]', 'Lumi');
      type('input[placeholder="x"]', '6966'); type('input[placeholder="y (height)"]', '100'); type('input[placeholder="z"]', '3220');
      type('input[placeholder="Tab title, e.g. Scrolls"]', 'General Goods');
      const combos = [...form.querySelectorAll('.combo')];
      const regionBox = combos.find(c => /Flaris/.test(c.querySelector('input').value));
      ok(regionBox && /Flaris · \d+ NPCs/.test(regionBox.querySelector('input').value), 'region: Flaris with its NPC count');
      const rin = regionBox.querySelector('input');
      rin.dispatchEvent(new Event('focus')); rin.value = 'christiana'; rin.dispatchEvent(new Event('input'));
      ok(/La Christiana A \(DuSanpres\)/.test(regionBox.querySelector('.combo-list').textContent) && regionBox.querySelectorAll('.combo-opt').length === 1,
        'region search: typing "christiana" finds La Christiana A (DuSanpres) only');
      rin.dispatchEvent(new Event('blur')); await tick();
      ok(/Flaris/.test(rin.value), 'leaving the search box keeps the chosen region');
      const modelBox = combos[0], min = modelBox.querySelector('input');
      min.dispatchEvent(new Event('focus')); min.value = 'juria'; min.dispatchEvent(new Event('input'));
      ok([...modelBox.querySelectorAll('.combo-opt')].some(o => /Julia/.test(o.textContent)), 'model search finds a model by the NPC that uses it (Juria)');
      min.dispatchEvent(new Event('blur')); await tick();
      ok(/Fill in the fields above/.test(form.querySelector('.nn-problems').textContent) || /BLOCK|No problem/.test(form.querySelector('.nn-problems').textContent), 'checks section present');
      ok(/Players will read here:\s*Flaris — Flarine \/ Central Flarine/.test(form.querySelector('.nn-where').textContent), 'live: what players read at the typed spot');
      // Model list: Used by NPCs / Not used yet / Both
      const view = v => { const sel = form.querySelector('select.nn-modelview'); sel.value = v; sel.dispatchEvent(new Event('change')); };
      const modelOpts = () => { const i = form.querySelector('.combo input'); i.dispatchEvent(new Event('focus')); const o = [...form.querySelector('.combo').querySelectorAll('.combo-opt')].map(x => x.textContent); i.dispatchEvent(new Event('blur')); return o; };
      const usedN = modelOpts().length;
      const unusedOpt = form.querySelector('select.nn-modelview option[value=unused]');
      ok(unusedOpt && !unusedOpt.disabled && Number((/\((\d+)\)/.exec(unusedOpt.textContent) || [])[1]) > 50, 'Client/Model.list read: "Not used yet" can be picked (' + (unusedOpt ? unusedOpt.textContent : '?') + ')');
      view('unused');
      const un = modelOpts();
      ok(un.length > 50 && un.every(t => /\(MI_/.test(t)) && !un.some(t => /— like/.test(t)), `"Not used yet" lists only unused models (${un.length})`);
      view('all');
      ok(modelOpts().length === usedN + un.length && /Not used yet/.test(form.querySelector('.combo .combo-list').textContent + [...form.querySelectorAll('.combo-group')].map(g => g.textContent).join()), '"Both" lists used + unused, in two groups');
      view('used');
      ok(modelOpts().length === usedN && !form.querySelector('.combo input').value, '"Used by NPCs" again: Julia was not in the other list, so the model is cleared');
      const mb = form.querySelector('.combo'); mb.pick('MI_MAFL_JURIA'); await tick();
      ok(/Files: Mvr_MaFlJuria\.o3d, \d+ animations, 2 textures — all in Client\/Model/.test(form.textContent), 'Julia: .o3d, animations and 2 textures all in Client/Model');
      ok(form.querySelectorAll('.nn-req.req').length >= 7 && /\(optional\)/.test(form.textContent), 'required fields have a red *, optional ones say (optional)');
      // + Add items: the bulk item picker
      click(btnByText(form, '+ Add items'));
      await waitFor(() => document.querySelector('.ip'), 'item picker');
      const ip = document.querySelector('.ip');
      const q = ip.querySelector('input[type=search]'); q.value = 'Blessing of the Goddess'; q.dispatchEvent(new Event('input'));
      click(btnByText(ip, 'Select all shown'));
      ok(/1 selected/.test(ip.textContent), 'picker: Select all shown ticks the filtered item');
      click(btnByText(ip.closest('.modal'), 'Add 1 item'));
      await waitFor(() => !document.querySelector('.ip'), 'picker closed');
      ok(/II_SYS_SYS_SCR_BLESSEDNESS/.test(form.querySelector('.nn-items').textContent) && /1 \/ 100/.test(form.textContent), 'the picked item is in the tab table');
      ok(/No problem found/.test(form.querySelector('.nn-problems').textContent), 'new NPC form: no problem for the §5 example');
      ok(/AddVendorSlot\( 0, IDS_CHARACTER_INC_001189 \)|IDS_CHARACTER_INC_001190/.test(form.querySelector('.nn-preview').textContent) && /200 bytes inserted at offset 73300/.test(form.querySelector('.nn-preview').textContent),
        'preview: the exact block, the new text keys and the .dyo insert point');
      type('input[placeholder="MaFl_Lumi"]', 'MaFl_Juria');
      ok(/already exists/.test(form.querySelector('.nn-problems').textContent) && document.getElementById('nn-create').disabled, 'a taken key blocks Create');
      type('input[placeholder="MaFl_Lumi"]', 'MaFl_Lumi');
      ok(!document.getElementById('nn-create').disabled, 'Create enabled again');
      // Building: a new tag (b4b9a465 way)
      const tagBox = [...form.querySelectorAll('.combo')].find(c => /no tag/.test(c.querySelector('input').value));
      ok(tagBox, 'building: (none) by default');
      tagBox.pick('+new');
      await tick();
      type('input[placeholder="Dungeon Pieces"]', '[Dungeon Pieces]');
      ok(/SRT_DUNGEON_PIECES/.test(form.textContent) && /Takes row 18; only 2 new tags fit/.test(form.textContent), 'new tag box: define name and the 2 free rows');
      const pv = form.querySelector('.nn-preview').textContent;
      ok(/New tag \[Dungeon Pieces\] = row 18/.test(pv) && /#define SRT_DUNGEON_PIECES\s+18/.test(pv) && /IDS_ETC_INC_000046\tDungeon Pieces/.test(pv) && /m_nStructure= SRT_DUNGEON_PIECES;/.test(pv),
        'preview: defineNeuz.h, etc.inc, etc.txt.txt lines and m_nStructure');
      ok(/minimap icon/.test(form.querySelector('.nn-problems').textContent) && !document.getElementById('nn-create').disabled, 'NN_TAG_ICON note; Create allowed');
      // menus: the three kinds of + Menu as cards; Dialog and the long list are behind "Other game window…"
      const cards = () => [...form.querySelectorAll('.nn-cards .menu-card')];
      ok(cards().map(c => c.querySelector('b').textContent.replace('✓ ', '')).join('|') === 'Shop|Exchange|Rules text' && cards()[0].classList.contains('on'),
        'right-click menus: Shop / Exchange / Rules text cards, Shop on');
      ok(!form.querySelector('.nn-menus') && /Other game window…/.test(form.textContent), 'the long menu list is closed (Other game window…)');
      click(cards()[1]);
      ok(cards()[1].classList.contains('on') && !/After Create/.test(form.textContent) && form.querySelector('.mf-section .mf-card') && form.querySelector('input.mf-label'),
        'Exchange on: its form shows right here (label, name, exchange cards), nothing opens after Create');
      click(cards()[1]);
      ok(!cards()[1].classList.contains('on'), 'Exchange off again');
      click(btnByText(form, 'Other game window…'));
      ok(form.querySelector('.nn-menus') && ![...form.querySelectorAll('.nn-menu-text')].some(t => /^(Dialog|Trade)$/.test(t.textContent)), 'Other game window…: the list, without Trade and Dialog');
      click(btnByText(form, 'Other game window…'));
      if (STOP === 'newnpcform') return;
      click(document.getElementById('nn-create'));
      await waitFor(() => !document.querySelector('.newnpc'), 'form closed');
      ok(/In game after Save/.test($('editor').textContent) && /Stands on WdMadrigal at \/position 6966\.0, 100\.0, 3220\.0/.test($('editor').textContent) && /Tab 1 "General Goods": 1 item/.test($('editor').textContent),
        'the new NPC is selected and shows what the game will load');
      ok(ls.value === 'Lumi' && (document.querySelector('#list .npc.sel') || { textContent: '' }).textContent.includes('MaFl_Lumi'),
        'the search that hid the new NPC is replaced by its name: Lumi is listed and selected');
      ls.value = ''; ls.dispatchEvent(new Event('input'));
      ok(S.ws.dirtyFiles().length === 6, '6 files changed (character.inc, character.txt.txt, WdMadrigal.dyo, defineNeuz.h, etc.inc, etc.txt.txt)');
      ok(/Above the name: \[Dungeon Pieces\]/.test($('editor').textContent), 'in game: [Dungeon Pieces] above the name');
      const tagBefore = Object.fromEntries(['defineNeuz.h', 'etc.inc', 'etc.txt.txt'].map(n => [n, res.children.get(n).bytes]));
      if (STOP === 'newnpc') return;
      click($('btn-save'));
      await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (new NPC)');
      ok(/World\/WdMadrigal\/WdMadrigal\.dyo/.test(document.querySelector('.modal').textContent) && /\+ NPC MaFl_Lumi/.test(document.querySelector('.modal').textContent), 'review shows the map file and the new record');
      click(btnByText(document, 'Back up and write'));
      await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent)), 'save finished (new NPC)');
      ok(madSrv.bytes.length === before.dyo.length + 200 && FRE.bytes.bytesEqual(madCli.bytes, madSrv.bytes), 'WdMadrigal.dyo +200 bytes, Client copy identical');
      ok(FRE.bytes.bytesEqual(clientDir.children.get('character.txt.txt').bytes, res.children.get('character.txt.txt').bytes) && res.children.get('character.txt.txt').bytes.length > before.txt.length,
        'character.txt.txt saved, Client copy identical');
      ok(FRE.bytes.bytesEqual(clientDir.children.get('character.inc').bytes, res.children.get('character.inc').bytes), 'character.inc saved, Client copy identical');
      ok(/SRT_DUNGEON_PIECES +18\r\n/.test(new TextDecoder('latin1').decode(res.children.get('defineNeuz.h').bytes)) && FRE.bytes.bytesEqual(clientDir.children.get('defineNeuz.h').bytes, lfOnly(res.children.get('defineNeuz.h').bytes)),
        'defineNeuz.h saved (CRLF), Client copy gets the same line with LF');
      ok(['etc.inc', 'etc.txt.txt'].every(n => res.children.get(n).bytes.length > tagBefore[n].length && FRE.bytes.bytesEqual(clientDir.children.get(n).bytes, res.children.get(n).bytes)), 'etc.inc + etc.txt.txt saved, Client copies identical');
      const bk2 = [...backups.children.values()].pop();
      const bw = bk2.children.get('World');
      ok(bw && FRE.bytes.bytesEqual(bw.children.get('WdMadrigal').children.get('WdMadrigal.dyo').bytes, before.dyo) && bk2.children.get('Client').children.get('World'),
        'backup keeps World/WdMadrigal/WdMadrigal.dyo (Server and Client) with the original bytes');
      ok(S.ws.dirtyFiles().length === 0 && S.ws.chars.byKey.has('mafl_lumi'), 'clean after save; Lumi loaded');
      document.querySelectorAll('.modal-back').forEach(m => m.remove());
      // put the original files back so the later stages see the fixtures
      madSrv.bytes = before.dyo; madCli.bytes = before.dyo.slice();
      res.children.get('character.txt.txt').bytes = before.txt; clientDir.children.get('character.txt.txt').bytes = before.txt.slice();
      res.children.get('character.inc').bytes = before.inc; clientDir.children.get('character.inc').bytes = before.inc.slice();
      for (const n of ['defineNeuz.h', 'etc.inc', 'etc.txt.txt']) { res.children.get(n).bytes = tagBefore[n]; clientDir.children.get(n).bytes = n === 'defineNeuz.h' ? lfOnly(tagBefore[n]) : tagBefore[n].slice(); }
    }

    // ---- + Exchange menu (ui/menu-form.js) on Peach: preview, Create (6 files, one undo step), Undo
    {
      const peach = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Peach'));
      click(peach);
      click(btnByText($('editor'), '+ Menu'));                      // the chooser (ui/menu-chooser.js) → Swap list
      await waitFor(() => document.querySelector('.modal .menu-cards'), '+ Menu chooser');
      click([...document.querySelectorAll('.modal .menu-card')].find(c => /^Exchange/.test(c.textContent)));
      await waitFor(() => document.querySelector('.modal .mf-recipe'), 'new exchange menu dialog');
      const box = [...document.querySelectorAll('.modal')].pop();
      const inp = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); };
      const lab = box.querySelector('input.mf-label'), nm = box.querySelector('input.mf-name');
      inp(lab, 'Test Weapons');
      ok(nm.value === 'MMI_TEST_WEAPONS' && /✓ free · menu id 282/.test(box.textContent), 'menu form: the label fills the name (MMI_TEST_WEAPONS), shown free with its id');
      inp(nm, 'MMI_TRADE');
      ok(/✗ MMI_TRADE \(or TID_MMI_TRADE\) already exists/.test(box.textContent) && box.querySelector('#mf-create').disabled, 'a taken name says so and blocks Create');
      inp(nm, 'MMI_TEST_UI');
      ok(box.querySelectorAll('.nn-req.req').length >= 6 && /= required/.test(box.textContent) && /must be fixed before Create/.test(box.textContent),
        'menu form: red * on required fields, the * note and the Checks legend (the standard form footer)');
      // one card per exchange (like Collins): a card needs its costs and its reward; a menu needs a card
      ok(box.querySelectorAll('.mf-card').length === 1 && /Still needs a cost and a reward/.test(box.querySelector('.mf-card').textContent) && box.querySelector('#mf-create').disabled,
        'a new menu starts with one empty exchange card: "still needs a cost and a reward", Create greyed');
      const card = k => box.querySelectorAll('.mf-card')[k];
      const pickItems = async (btn, defs) => {
        click(btn);
        await waitFor(() => document.querySelector('.ip'), 'item picker');
        const ip = document.querySelector('.ip');
        for (const q of defs) {
          const qi = ip.querySelector('input[type=search]'); qi.value = q; qi.dispatchEvent(new Event('input'));
          const cb = [...ip.querySelectorAll('.ip-row')].find(r => r.querySelector('.def').textContent === q).querySelector('input'); cb.checked = true; cb.dispatchEvent(new Event('change'));
        }
        click([...ip.closest('.modal').querySelectorAll('footer button')].find(b => /^(Add|Make) /.test(b.textContent)));
        await waitFor(() => !document.querySelector('.ip'), 'picker closed');
      };
      card(0).querySelector('.mf-ing .combo').pick('II_SYS_SYS_SCR_SCRAPTOPAZ'); await tick();
      await pickItems(btnByText(card(0), '+ Reward'), ['II_SYS_SYS_SCR_BLESSEDNESS']);
      ok(!box.querySelector('#mf-create').disabled && /You get .*×1\s+←\s+Topaz Piece ×1/.test(card(0).querySelector('.mf-card-gets').textContent), 'card 1: Topaz → one reward; Create allowed');
      const pv = box.querySelector('.nn-preview').textContent;
      ok(/#define MMI_TEST_UI\s+282/.test(pv) && /TID_MMI_TEST_UI\s+7282/.test(pv) && /Test Weapons/.test(pv) && /AddMenu\( MMI_TEST_UI \);/.test(pv),
        'menu dialog preview: MMI_TEST_UI 282, label TID 7282, AddMenu on Peach');
      // a second reward on the same card: random, 50/50, then 70% moves the other to 30%
      await pickItems(btnByText(card(0), '+ Reward (random)'), ['II_SYS_SYS_SCR_AMPESS']);
      const pcts = () => [...card(0).querySelectorAll('.mf-rewards input.pct-input')].map(x => x.value);
      ok(String(pcts()) === '50,50' && /one of/.test(card(0).querySelector('.mf-card-gets').textContent), 'two rewards on one card: random, 50% / 50%');
      const p0 = card(0).querySelector('.mf-rewards input.pct-input'); p0.value = '70'; p0.dispatchEvent(new Event('change'));
      ok(String(pcts()) === '70,30' && /II_SYS_SYS_SCR_BLESSEDNESS\t1\t700000/.test(box.querySelector('.nn-preview').textContent)
        && /II_SYS_SYS_SCR_AMPESS\t1\t300000/.test(box.querySelector('.nn-preview').textContent), '70% on one reward moves the other to 30% (700000 / 300000 in the file)');
      // + Exchange: a second card with the costs of the first, then its own cost and reward (different ingredients per reward)
      ok(!btnByText(box, '+ Several rewards…') && btnByText(card(0), 'Same costs, other rewards…'), 'no "+ Several rewards…"; each card has "Same costs, other rewards…"');
      click(btnByText(box, '+ Exchange'));
      ok(box.querySelectorAll('.mf-card').length === 2 && card(1).querySelector('.mf-ing .combo input').value === '' && /Still needs a cost and a reward/.test(card(1).textContent),
        '+ Exchange: card 2 is empty (nothing copied)');
      ok(/"Test Weapons", exchange 2, has no cost/.test(box.querySelector('.nn-problems').textContent), 'checks name the menu by its label, not an internal name');
      card(1).querySelector('.mf-ing .combo').pick('II_SYS_SYS_SCR_SCRAPMOONSTONE'); await tick();
      click(btnByText(card(1), '+ Ingredient'));
      card(1).querySelectorAll('.mf-ing .combo')[1].pick('II_SYS_SYS_SCR_SCRAPTOPAZ'); await tick();
      await pickItems(btnByText(card(1), '+ Reward'), ['II_SYS_SYS_SCR_PIEPROT']);
      const pvx = box.querySelector('.nn-preview').textContent;
      ok(/Exchange 2: .*←\s*Moonstone Piece ×1 \+ Topaz Piece ×1/.test(pvx) && /Exchange 1: one of/.test(pvx), 'preview: exchange 2 has its own two ingredients');
      // "Same costs, other rewards…" on card 2: each ticked item = its own card with card 2's costs, right after it
      await pickItems(btnByText(card(1), 'Same costs, other rewards…'), ['II_SYS_SYS_SCR_SMELPROT', 'II_SYS_SYS_SCR_SMELPROT3']);
      const costsOf = k => [...card(k).querySelectorAll('.mf-ing .combo input')].map(x => x.value).join('+');
      ok(box.querySelectorAll('.mf-card').length === 4 && costsOf(2) === costsOf(1) && costsOf(3) === costsOf(1) && /Moonstone/.test(costsOf(2))
        && /SMELPROT/.test(card(2).textContent) && /SMELPROT3/.test(card(3).textContent), 'same costs, 2 other rewards: cards 3 and 4 cost what card 2 costs, one reward each');
      click(card(3).querySelector('.mf-card-tools .danger')); click(card(2).querySelector('.mf-card-tools .danger'));
      if (STOP === 'mfcards') { $('toasts').textContent = ''; return; }
      // Try it on a card, before Create (the user, 2026-10-08)
      click(btnByText(box, '+ Exchange'));
      ok(card(2).querySelector('button.mf-try').disabled && /Add a cost and a reward first/.test(card(2).querySelector('button.mf-try').title), 'Try it is greyed on an empty card');
      click(card(2).querySelector('.mf-card-tools .danger'));
      const t0 = await tryCard(card(0), '+ Menu › Exchange card 1');
      const rates = [...t0.tw.querySelectorAll('tr')].slice(1).map(r => r.children[4] && r.children[4].textContent).join();
      ok(/1,000 exchanged/.test(t0.text) && rates === '70.00%,30.00%' && /Test Weapons", exchange 1/.test(t0.header), 'Try on the random card: 1,000 presses, chance set 70% (the form\'s 70 / 30), titled with the label');
      ok(box.querySelectorAll('.mf-card').length === 2 && /SCRAPTOPAZ/.test(costsOf(0)), 'the form keeps its 2 cards after Try');
      const lab0 = lab.value, nm0 = nm.value;
      inp(lab, ''); inp(nm, 'MMI_TRADE');
      const t1 = await tryCard(card(1), '+ Menu › Exchange card 2, no label and a taken name');
      ok(/no label yet/.test(t1.header) && /exchanged/.test(t1.text), 'Try works before the label / name are fixed (stand-ins)');
      inp(lab, lab0); inp(nm, nm0);
      if (STOP === 'mftry') { $('toasts').textContent = ''; click(card(0).querySelector('button.mf-try')); return; }
      click(box.querySelector('#mf-create'));
      await waitFor(() => !document.querySelector('.modal .mf-recipe'), 'menu dialog closed');
      ok(S.ws.dirtyFiles().length === 6 && S.ws.files.get('exchange_script.txt').dirty && S.ws.files.get('definetext.h').dirty, '6 files changed (incl. Exchange_Script.txt, defineText.h)');
      ok(/Test Weapons ⇄ 2 exchanges/.test($('editor').textContent), 'menu chip: in-game label and 2 exchanges');
      // the exchange tab in NPC Shops: the Exchanges cards, before saving
      click([...$('editor').querySelectorAll('.tabs button')].find(b => b.textContent.includes('⇄ Test Weapons')));
      ok($('editor').querySelectorAll('.ex-card').length === 2 && /You get/.test($('editor').textContent), 'NPC Shops: the menu\'s tab shows its 2 exchange cards (before saving)');
      // ⇄ tab + New exchange: Try it on the card that would become exchange 3
      {
        click(btnByText($('editor'), '+ New exchange'));
        await waitFor(() => lastModalAny() && lastModalAny().querySelector('.mf-recipe'), '+ New exchange form');
        const nx = lastModalAny(), c0 = nx.querySelector('.mf-card');
        c0.querySelector('.mf-ing .combo').pick('II_SYS_SYS_SCR_SCRAPMOONSTONE'); await tick();
        await pickItems(btnByText(c0, '+ Reward'), ['II_SYS_SYS_SCR_AMPESS']);
        const tn = await tryCard(nx.querySelector('.mf-card'), '⇄ tab + New exchange');
        ok(/exchange 3 — not added yet/.test(tn.header) && /1,000 exchanged/.test(tn.text), '+ New exchange Try: it is exchange 3 of the menu, its reward comes out');
        click(btnByText(nx.querySelector('footer'), 'Close'));
        ok($('editor').querySelectorAll('.ex-card').length === 2, '+ New exchange closed without Add: still 2 exchanges');
      }
      // typing a percent updates by itself after a short pause, and the cursor stays in the box
      const tp = $('editor').querySelector('.ex-card input.pct-input');
      tp.focus(); tp.value = '25'; tp.dispatchEvent(new Event('input'));
      FRE.dom.flushLive(); await tick();      // = the 400 ms pause after the last key
      const exText = S.ws.files.get('exchange_script.txt').text;
      ok(/II_SYS_SYS_SCR_BLESSEDNESS\t1\t250000/.test(exText) && /II_SYS_SYS_SCR_AMPESS\t1\t750000/.test(exText), 'typing 25 (no click): 250000 / 750000 written, the total stays 100%');
      ok(document.activeElement && document.activeElement.dataset.key === tp.dataset.key && document.activeElement.value === '25', 'the cursor stays in the percent box after the update');
      ok(!S.ws.diags.some(d => d.code === 'EX_PROB_OVER'), 'no reward dropped (no EX_PROB_OVER)');
      tp.value = '20'; tp.dispatchEvent(new Event('input'));
      FRE.dom.flushLive(); await tick();      // = the 400 ms pause after the last key
      document.activeElement.blur();
      click($('btn-undo'));
      ok(/II_SYS_SYS_SCR_BLESSEDNESS\t1\t700000/.test(S.ws.files.get('exchange_script.txt').text), 'typing in one box (25, then 20) is ONE undo step: back to 70%');
      click($('btn-undo'));
      ok(S.ws.dirtyFiles().length === 0 && !S.ws.defines.defines.has('MMI_TEST_UI'), 'Undo: all 6 files back');
      FRE.ui.modules.find(m => m.id === 'npc').st.tab = 0;
    }
    if (STOP === 'newmenu') return;

    // ---- task S: existing NPC edits on Peach (ui/npc-edit.js): tab names, + Tab, rename, + Menu, all undone
    {
      const peach = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Peach'));
      click(peach);
      const tabBtns = () => [...$('editor').querySelectorAll('.tabs button')];
      ok(tabBtns().map(b => b.textContent.replace(/\s*\(\d+\)|\s*✎/g, '').trim()).slice(0, 4).join('|') === '1 · Scrolls|2 · n/a|3 · n/a|4 · n/a',
        'Peach: 4 tabs, numbered because 3 share the name "n/a" (no made-up "Tab N" label)');
      ok(/In game \(right-click → Trade\): Tabs: \[Scrolls \(6\)\]/.test($('editor').textContent), 'the shop window line shows what players see');
      ok(/adds to \[Jewel Manager\] Peach → tab 1 "Scrolls"/.test($('add-target').textContent), 'item list says where + adds');
      click(tabBtns()[1]);
      ok(/Players see this tab as "n\/a"/.test($('editor').textContent), 'a placeholder tab says how players see it and what to do');
      // rename tab 2: its key is shared by 6 tabs -> only this one, with its own new text line
      click($('editor').querySelector('.tabs .tab-edit'));
      await waitFor(() => document.querySelector('.modal input[type=text]'), 'rename tab dialog');
      let box = [...document.querySelectorAll('.modal')].pop();
      const inp = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
      ok(/also used by 5 other places/.test(box.textContent) && /Change it in all 6 places/.test(box.textContent), 'shared text: lists the 5 other tabs, offers "all 6 places"');
      inp(box.querySelector('input[type=text]'), 'Event');
      ok(/Only this one changes: it gets its own text line IDS_CHARACTER_INC_\d+ instead of the shared IDS_CHARACTER_INC_000049/.test(box.textContent), 'checks: own key, the shared one stays');
      ok(/^Edit tab 2 name: n\/a/.test(box.querySelector('header').textContent) && btnByText(box, 'Apply changes'), '✎ dialog says what it does: "Edit tab 2 name", button "Apply changes"');
      click(btnByText(box, 'Apply changes'));
      await waitFor(() => !document.querySelector('.modal input[type=text]'), 'rename closed');
      ok(tabBtns()[1].textContent.startsWith('2 · Event') && S.ws.files.get('character.txt.txt').dirty && S.ws.files.get('character.inc').dirty, 'tab 2 reads "Event"; character.inc + character.txt.txt changed');
      ok(tabBtns()[2].textContent.includes('n/a'), 'tab 3 still reads "n/a"');
      ok(/✓ Rename tab 2 of \[Jewel Manager\] Peach: Event — not saved yet \(2 files to save/.test($('toasts').textContent), 'standard note after an edit: what was done, not saved yet, how many files');
      click($('btn-undo'));
      ok(/↶ Undone: Rename tab 2/.test($('toasts').textContent), 'standard note after Undo');
      ok(S.ws.dirtyFiles().length === 0, 'Undo: both files back');
      // remove the empty last tab, then + Tab names it again
      click(tabBtns()[3]);
      click($('editor').querySelector('.tabs .tab-edit'));
      await waitFor(() => document.querySelector('.modal input[type=text]'), 'rename tab 4 dialog');
      box = [...document.querySelectorAll('.modal')].pop();
      click(btnByText(box, 'Remove this tab'));
      ok(tabBtns().filter(b => !b.classList.contains('add-tab')).length === 3 && tabBtns().some(b => b.classList.contains('add-tab')), 'tab 4 removed; + Tab appears');
      click(tabBtns().find(b => b.classList.contains('add-tab')));
      await waitFor(() => document.querySelector('.modal input[type=text]'), '+ Tab dialog');
      box = [...document.querySelectorAll('.modal')].pop();
      inp(box.querySelector('input[type=text]'), 'Bad "name"');
      ok(/⛔ The text contains a "/.test(box.textContent) && box.querySelector('footer button.primary').disabled, 'a " in the name is refused before writing');
      inp(box.querySelector('input[type=text]'), 'Pets');
      ok(/AddVendorSlot\( 3, IDS_CHARACTER_INC_\d+ \);/.test(box.textContent), '+ Tab preview: AddVendorSlot( 3, new key ) (d11123ac way)');
      click(btnByText(box, 'Add tab'));
      await waitFor(() => !document.querySelector('.modal input[type=text]'), '+ Tab closed');
      ok(tabBtns().some(b => b.textContent.startsWith('4 · Pets')) && /adds to .*tab 4 "Pets"/.test($('add-target').textContent), 'new tab "Pets" selected; + adds to it');
      click($('btn-undo')); click($('btn-undo'));
      ok(S.ws.dirtyFiles().length === 0, 'Undo twice: back to the original');
      // rename the NPC
      click($('editor').querySelector('.npc-title button.icon'));
      await waitFor(() => document.querySelector('.modal input[type=text]'), 'rename NPC dialog');
      box = [...document.querySelectorAll('.modal')].pop();
      inp(box.querySelector('input[type=text]'), 'Gem Lady Peach');
      ok(/^Edit name: /.test(box.querySelector('header').textContent), '✎ on the name: "Edit name: …"');
      click(btnByText(box, 'Apply changes'));
      await waitFor(() => !document.querySelector('.modal input[type=text]'), 'rename NPC closed');
      ok($('editor').querySelector('h2').textContent === 'Gem Lady Peach' && S.ws.dirtyFiles().length === 1, 'NPC renamed: only character.txt.txt changed (its key is used once)');
      click($('btn-undo'));
      // + Menu
      click(btnByText($('editor'), '+ Menu'));
      await waitFor(() => document.querySelector('.modal .menu-cards'), '+ Menu chooser');
      click(btnByText([...document.querySelectorAll('.modal')].pop(), 'Other game window'));
      await waitFor(() => document.querySelector('.modal .combo'), '+ Menu dialog');
      box = [...document.querySelectorAll('.modal')].pop();
      box.querySelector('.combo').pick('MMI_BANKING');
      ok(/Right-click will show: .*Dialog.*Trade/.test(box.textContent), '+ Menu shows the right-click list it will make');
      click(btnByText(box, 'Add menu'));
      ok(/AddMenu\( MMI_BANKING \);/.test(S.ws.files.get('character.inc').text) && $('editor').querySelectorAll('.menus .menu-x').length === 8, 'Bank added after the last AddMenu; every menu has ✕');
      click($('btn-undo'));
      ok(S.ws.dirtyFiles().length === 0, 'all Peach edits undone');
      // the item list's own categories: Pets › Raised pets, rarity chips hidden outside Weapons / Armor
      const srch = $('item-search'); srch.value = ''; srch.dispatchEvent(new Event('input'));
      const pickCat = v => $('item-cat').querySelector('.combo').pick(v);
      const inp2 = $('item-cat').querySelector('input'); inp2.focus(); inp2.value = 'pet'; inp2.dispatchEvent(new Event('input'));
      const shown = [...$('item-cat').querySelectorAll('.combo-opt')].map(o => o.textContent);
      ok(shown.some(t => /^Buff pets/.test(t)) && shown.some(t => /^Raised pets/.test(t)) && !shown.some(t => /^Swords/.test(t)), 'category search: "pet" lists Buff / Raised pets, not Swords');
      inp2.value = 'ra'; inp2.dispatchEvent(new Event('input'));
      const ra = [...$('item-cat').querySelectorAll('.combo-opt')].map(o => o.textContent);
      ok(ra.some(t => /^Raised pets/.test(t)) && !ra.some(t => /^Auras|^Upgrade|^All Upgrade/.test(t)), 'category search matches word starts: "ra" finds Raised pets, not Auras / Upgrade');
      inp2.blur();
      pickCat('Pets|Raised pets');
      ok(/^8 of /.test($('item-count').textContent) && $('rarity-chips').hidden, 'Raised pets: 8 items; rarity chips hidden');
      pickCat('Weapons');
      ok(!$('rarity-chips').hidden, 'Weapons: rarity chips shown');
      pickCat('');
      FRE.ui.modules.find(m => m.id === 'npc').st.tab = 0;
    }
    if (STOP === 'npcedit') return;

    // ---- task S part 2: rows the server lists by itself ("auto") on Peach: edited like the others, no extra window
    {
      const peach = [...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MaFl_Peach'));
      click(peach);
      const inc0 = S.ws.files.get('character.inc').text;
      const modals0 = document.querySelectorAll('.modal').length;      // the npcedit stage leaves its + Menu window open
      const rowOf = name => [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.textContent.includes(name) && tr.querySelector('td'));
      const block = () => { const t = S.ws.files.get('character.inc').text; const i = t.indexOf('MaFl_Peach'); return t.slice(i, t.indexOf('SetName', i)); };
      ok(/Players pay 100,000 · sells to an NPC for 25,000/.test(rowOf('Scroll of Awakening').textContent), 'row the server adds by itself: players pay 100,000, sell it to an NPC for 25,000 (OnBuyItem / OnSellItem)');
      ok(!/auto|rule/i.test($('editor').querySelector('table.items').textContent) && !btnByText($('editor'), '+ Rule'), 'no "auto" / "rule" words, no rule editor');
      ok(/Right-click menu:/.test($('editor').querySelector('.menus').textContent), 'menus row says what it is');
      ok(/Price for items added with \+/.test($('new-price-row').textContent) && /applies server-wide/.test($('new-price-hint').textContent), 'item list price box: says what it is for');
      // a price on an auto row: applied at once (no window), the tab's auto items get their own lines
      const pin = rowOf('Scroll of Awakening').querySelector('input.num-input');
      pin.value = '150000'; pin.dispatchEvent(new Event('change'));
      ok(document.querySelectorAll('.modal').length === modals0, 'no window opens');
      ok(!/AddVendorItem/.test(block()) && /AddShopItem\( 0, II_SYS_SYS_SCR_AWAKE, 150000 \);\r\n\t\tAddShopItem\( 0, II_SYS_SYS_SCR_PETAWAKE \);\r\n\t\tAddShopItem\( 0, II_SYS_SYS_SCR_SMELPROT, 30000000 \);/.test(block()),
        'Peach: auto items now each have their own line, same order, above the others (CRLF, same indent)');
      ok(/Players pay 150,000 · sells to an NPC for 37,500/.test($('editor').textContent), 'the row shows the new price');
      ok(S.ws.diags.some(d => d.code === 'C_PRICE_FROM_OTHER' && d.npcKey === 'MaEw_Raya'), 'Raia: INFO, her price now comes from Peach\'s line');
      ok(/✓ \[Jewel Manager\] Peach: price of Scroll of Awakening \(the 2 auto items of tab 1 "Scrolls" now each have their own line, same order\)/.test($('toasts').textContent), 'the note says what happened');
      const steps = S.ws.history.length;
      const pin2 = rowOf('Scroll of Awakening').querySelector('input.num-input');
      pin2.value = '160000'; pin2.dispatchEvent(new Event('change'));
      ok(/AddShopItem\( 0, II_SYS_SYS_SCR_AWAKE, 160000 \);/.test(block()) && S.ws.history.length === steps, 'typing the price again within 2 s: still one undo step');
      click($('btn-undo'));
      ok(S.ws.files.get('character.inc').text === inc0, 'one Undo restores character.inc');
      // ✕ on an auto row
      click(rowOf('Scroll of Pet Awakening').querySelector('button.icon.danger'));
      ok(document.querySelectorAll('.modal').length === modals0 && /II_SYS_SYS_SCR_AWAKE \);/.test(block()) && !/PETAWAKE/.test(block()), '✕: removed at once; Scroll of Awakening keeps its own line');
      click($('btn-undo'));
      // the Tab box on an auto row
      const sel = rowOf('Scroll of Awakening').querySelector('select');
      sel.value = '1'; sel.dispatchEvent(new Event('change'));
      ok(/AddShopItem\( 1, II_SYS_SYS_SCR_AWAKE \);/.test(block()), 'Tab: moved to tab 2 at once');
      click($('btn-undo'));
      ok(S.ws.files.get('character.inc').text === inc0 && S.ws.dirtyFiles().length === 0, 'all auto-row edits undone');
      if (STOP === 'shoprules') { $('toasts').textContent = ''; renderAllForTest(); }
    }
    if (STOP === 'shoprules') return;

    // ---- + Menu → Rules text (ui/menu-chooser.js): a new menu with a text window, saved into Client/Client
    {
      document.querySelectorAll('.modal-back').forEach(m => m.remove());
      const lastModal = () => [...document.querySelectorAll('.modal')].pop();
      click(btnByText($('editor'), '+ Menu'));
      await waitFor(() => lastModal() && lastModal().querySelector('.menu-cards'), '+ Menu chooser');
      let box = lastModal();
      const cards = [...box.querySelectorAll('.menu-card')];
      ok(cards.map(c => c.querySelector('b').textContent).join('|') === 'Shop|Exchange|Rules text', '+ Menu offers Shop, Exchange, Rules text');
      ok(cards[0].disabled && /already has a shop/.test(cards[0].textContent), 'Shop is greyed for Peach: she already has one');
      ok(!btnByText(document.querySelector('.npc-title'), '+ Exchange menu'), 'no separate + Exchange menu button any more');
      click(cards[1]);
      await waitFor(() => lastModal() && lastModal().querySelector('.mf-recipe'), 'exchange form from the chooser');
      ok(/\+ Menu for \[Jewel Manager\] Peach › Exchange/.test(lastModal().querySelector('header').textContent), 'the form title says the choice');
      click(btnByText(lastModal(), '← Back'));
      await waitFor(() => lastModal() && lastModal().querySelector('.menu-cards'), 'back to the choices');
      ok(document.querySelectorAll('.modal').length === 1, '← Back: the choices again (the form is closed)');
      click([...lastModal().querySelectorAll('.menu-card')][2]);
      await waitFor(() => lastModal() && lastModal().querySelector('textarea.board-text'), 'rules text form');
      box = lastModal();
      const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
      ok(/⛔ The name is empty/.test(box.textContent) && box.querySelector('footer button.primary').disabled, 'Create greyed until a name is typed');
      typeIn(box.querySelector('input[type=text]'), 'Guild Rules');
      typeIn(box.querySelector('textarea.board-text'), '#b#cffffcc00How to win#nc#nb\nKill players for points');
      const pv = box.querySelector('.board-preview');
      ok(pv && pv.querySelector('.board-title').textContent === 'Guild Rules' && /How to win/.test(pv.textContent) && !/#b/.test(pv.textContent), 'preview: the name as title, the codes drawn (not shown)');
      ok(/Saved as MMI_GUILD_RULES, menu 282; text file Client\/Client\/NpcBoard_282\.inc/.test(box.textContent) && /npc-board change/.test(box.textContent), 'says where it goes and that the client needs the change');
      click(btnByText(box, 'Create'));
      ok([...$('editor').querySelectorAll('.menus button.board')].some(b => /Guild Rules/.test(b.textContent) && b.querySelector('.pencil')), 'the new menu shows in the right-click row');
      ok(S.ws.dirtyFiles().some(f => f.clientOnly && f.name === 'NpcBoard_282.inc') && !S.ws.files.get('exchange_script.txt').dirty, 'Client/Client/NpcBoard_282.inc to be created; Exchange_Script.txt untouched');
      // the + NPC stage put older bytes back on the fake disk: make the disk hold what this workspace loaded
      for (const f of S.ws.dirtyFiles()) if (!f.clientOnly && res.children.has(f.name)) res.children.get(f.name).bytes = f.bytes;
      for (const [, f] of S.client.files) if (clientDir.children.has(f.name)) clientDir.children.get(f.name).bytes = f.bytes;
      click($('btn-save'));
      await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (rules)');
      click(btnByText(document, 'Back up and write'));
      await waitFor(() => [...document.querySelectorAll('.modal header')].some(hh => /^Saved|failed/.test(hh.textContent)), 'save finished (rules)');
      const made = clientDir.children.get('Client').children.get('NpcBoard_282.inc');
      ok(made && new TextDecoder().decode(made.bytes) === '#b#cffffcc00How to win#nc#nb\r\nKill players for points', 'saved: Client/Client/NpcBoard_282.inc written with CRLF');
      ok(S.ws.dirtyFiles().length === 0, 'clean after saving');
      document.querySelectorAll('.modal-back').forEach(m => m.remove());
      // edit it again from its menu button, then undo
      click([...$('editor').querySelectorAll('.menus button.board')].pop());
      await waitFor(() => lastModal() && lastModal().querySelector('textarea.board-text'), 'edit rules form');
      box = lastModal();
      ok(box.querySelector('textarea.board-text').value === '#b#cffffcc00How to win#nc#nb\nKill players for points', 'the form opens with the saved text');
      typeIn(box.querySelector('textarea.board-text'), 'Changed');
      ok(/^Edit rules text: /.test(box.querySelector('header').textContent), '✎ on a rules menu: "Edit rules text: …"');
      click(btnByText(box, 'Apply changes'));
      ok(S.ws.boardTextOf(282) === 'Changed', 'text changed');
      click($('btn-undo'));
      ok(S.ws.dirtyFiles().length === 0, 'Undo: back to the saved text');
    }
    if (STOP === 'rulesmenu') { $('toasts').textContent = ''; click(btnByText($('editor'), '+ Menu')); return; }
    if (STOP === 'rulesform') {
      $('toasts').textContent = '';
      click([...$('editor').querySelectorAll('.menus button.board')].pop());
      await waitFor(() => document.querySelector('.modal textarea.board-text'), 'rules form');
      const ta = document.querySelector('.modal textarea.board-text');
      ta.value = '#b#cffffcc00How points are gained#nc#nb\n- Kill a player: 1 point\n- Kill the guild master: 3 points\n#cffff4444Leaving the siege map costs 1 life per minute.#nc';
      ta.dispatchEvent(new Event('input'));
      return;
    }

    // ---- Edit where / model (task S part 3): same-length rewrite of the NPC's .dyo record
    {
      const mod = FRE.ui.modules.find(m => m.id === 'npc');
      const openNpc = key => { const n = S.ws.chars.byKey.get(key.toLowerCase()); mod.st.show = 'all'; mod.st.sel = mod.npcId(n[n.length - 1]); mod.st.tab = 0; renderAllForTest(); return n[n.length - 1]; };
      const peach = openNpc('MaFl_Peach');
      const P = () => FRE.npcEditOps.placementsOf(S.ws, peach)[0];
      const p0 = P(), dyo0 = S.ws.files.get(p0.file).serialize();
      click($('editor').querySelector('.place-edit'));
      await waitFor(() => lastModalAny() && /^Change position \/ model: /.test(lastModalAny().querySelector('header').textContent), 'Edit where / model dialog');
      let box = lastModalAny();
      const apply = () => btnByText(box.querySelector('footer'), 'Apply changes');
      ok(/No change\./.test(box.textContent) && apply().disabled, 'opens on the current spot and model: "No change", Apply greyed');
      ok(/Players will read here:\s*Flaris/.test(box.querySelector('.nn-where').textContent), 'shows where players read the spot');
      const typeX = v => { const el = box.querySelector('input[placeholder="x"]'); el.value = v; el.dispatchEvent(new Event('input')); };
      typeX(String(p0.x + 10));
      ok(!apply().disabled && /x [\d.]+ → [\d.]+/.test(box.querySelector('.nn-preview').textContent) && /4 bytes rewritten in place, same file size/.test(box.textContent), 'live: x changes, preview says 4 bytes rewritten in place');
      click(apply());
      const p1 = P(), dyo1 = S.ws.files.get(p0.file).serialize();
      let diff = 0; for (let i = 0; i < dyo0.length; i++) if (dyo0[i] !== dyo1[i]) diff++;
      ok(dyo1.length === dyo0.length && diff > 0 && diff <= 4 && Math.abs(p1.x - (p0.x + 10)) < 0.01 && p1.z === p0.z && p1.y === p0.y && p1.model === p0.model, 'Peach moved 10 to the east: same file size, only the x bytes changed');
      ok(/✓ \[Jewel Manager\] Peach: moved — not saved yet/.test($('toasts').textContent), 'standard note after the move');
      click($('btn-undo'));
      ok(FRE.bytes.bytesEqual(S.ws.files.get(p0.file).serialize(), dyo0), 'Undo: the map file is back');
      // an NPC in 11 places: pick spot 7, change the model on all spots
      const pb = openNpc('MaFl_Postbox');
      const spots0 = FRE.npcEditOps.placementsOf(S.ws, pb);
      click($('editor').querySelector('.place-edit'));
      await waitFor(() => lastModalAny() && /^Change position \/ model: /.test(lastModalAny().querySelector('header').textContent), 'Postbox dialog');
      box = lastModalAny();
      const spotSel = box.querySelector('select:not(.nn-modelview)');
      ok(spots0.length === 11 && spotSel && spotSel.options.length === 11, 'Postbox: a Spot list with its 11 places');
      spotSel.value = '6'; spotSel.dispatchEvent(new Event('change'));
      box = lastModalAny();
      const mbox = box.querySelector('select.nn-modelview').closest('.nn-row').querySelector('.combo'), min = mbox.querySelector('input');
      min.dispatchEvent(new Event('focus')); min.value = 'juria'; min.dispatchEvent(new Event('input'));
      const opt = [...mbox.querySelectorAll('.combo-opt')].find(o => /Julia/.test(o.textContent));
      opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      box = lastModalAny();
      const all = [...box.querySelectorAll('label')].find(l => /Change the model on all 11 spots/.test(l.textContent)).querySelector('input');
      ok(/Spot 7: model/.test(box.querySelector('.nn-preview').textContent) && !/Spot 1:/.test(box.querySelector('.nn-preview').textContent), 'model on spot 7 only');
      all.checked = true; all.dispatchEvent(new Event('change'));
      ok(/Spot 1: model/.test(box.querySelector('.nn-preview').textContent) && /Spot 11: model/.test(box.querySelector('.nn-preview').textContent), 'ticked: the model goes on all 11 spots');
      click(btnByText(box.querySelector('footer'), 'Apply changes'));
      const spots1 = FRE.npcEditOps.placementsOf(S.ws, pb);
      ok(spots1.length === 11 && spots1[0].model !== spots0[0].model && S.ws.movers.movers.get(spots1[0].model).name === 'Julia' && spots1.every(p => p.model === spots1[0].model) && spots1.every((p, i) => p.x === spots0[i].x && p.angle === spots0[i].angle), 'all 11 Postboxes now use Julia\'s body, nothing else moved');
      click($('btn-undo'));
      ok(FRE.npcEditOps.placementsOf(S.ws, pb).every((p, i) => p.model === spots0[i].model) && S.ws.dirtyFiles().length === 0, 'one Undo restores all 11');
      // + NPC with Shop + Exchange + Rules text: filled in the one form, ONE Create, ONE undo step
      click(btnByText(document.querySelector('#list-action') || document, '+ NPC'));
      await waitFor(() => document.querySelector('.newnpc'), '+ NPC form (menus inline)');
      const nf = () => document.querySelector('.newnpc');
      const typ = (sel, v) => { const el = nf().querySelector(sel); el.value = v; el.dispatchEvent(new Event('input')); };
      click(btnByText(nf().closest('.modal').querySelector('footer'), 'Reset form'));
      typ('input[placeholder="MaFl_Lumi"]', 'MaFl_Swapper'); typ('input[placeholder="Lumi"]', 'Swapper');
      typ('input[placeholder="x"]', '6990'); typ('input[placeholder="y (height)"]', '100'); typ('input[placeholder="z"]', '3290');
      const ncards = () => [...document.querySelectorAll('.newnpc .nn-cards .menu-card')];
      typ('input[placeholder="Tab title, e.g. Scrolls"]', 'Goods');
      const pick1 = async (btn, def) => {
        click(btn);
        await waitFor(() => document.querySelector('.ip'), 'item picker');
        const ip = document.querySelector('.ip');
        const qi = ip.querySelector('input[type=search]'); qi.value = def; qi.dispatchEvent(new Event('input'));
        const cb = [...ip.querySelectorAll('.ip-row')].find(r => r.querySelector('.def').textContent === def).querySelector('input'); cb.checked = true; cb.dispatchEvent(new Event('change'));
        click([...ip.closest('.modal').querySelectorAll('footer button')].find(b => /^Add /.test(b.textContent)));
        await waitFor(() => !document.querySelector('.ip'), 'picker closed');
      };
      await pick1(btnByText(nf(), '+ Add items'), 'II_SYS_SYS_SCR_BLESSEDNESS');
      // Shop off with items in its tabs: a warning (they are kept), not a block
      click(ncards()[0]);
      const probs = () => nf().querySelector('.nn-problems').textContent;
      ok(/Shop is off: the 1 item in its tabs won't be added/.test(nf().textContent) && /WARN/.test(probs()) && !/tick Trade/.test(probs()) && !document.getElementById('nn-create').disabled,
        'Shop off with an item: a warning that it won\'t be added, Create still allowed');
      click(ncards()[0]);
      ok(/1 \/ 100/.test(nf().textContent), 'Shop on again: the item is still there');
      // Exchange: the card's cost and reward right in this form
      click(ncards()[1]);
      typ('input.mf-label', 'Swapper Swaps');
      ok(document.getElementById('nn-create').disabled && /NM_RECIPE|no ingredient|no reward|has no exchange/.test(probs()), 'an empty exchange card blocks Create');
      nf().querySelector('.mf-card .mf-ing .combo').pick('II_SYS_SYS_SCR_SCRAPTOPAZ'); await tick();
      await pick1(btnByText(nf().querySelector('.mf-card'), '+ Reward'), 'II_SYS_SYS_SCR_AWAKE');
      await tryCard(nf().querySelector('.mf-card'), '+ NPC inline Exchange');
      // Rules text: name + text right in this form
      click(ncards()[2]);
      ok(nf().querySelector('textarea.board-text'), 'Rules text on: its fields show right here');
      typ('input[placeholder="e.g. Guild Siege Rules"]', 'Swapper Rules');
      const ta = nf().querySelector('textarea.board-text'); ta.value = 'Be nice'; ta.dispatchEvent(new Event('input'));
      const pvw = nf().querySelector('.nn-preview').textContent;
      const [fa, fb] = FRE.menuOps.freeMenuIds(S.ws);
      ok(!document.getElementById('nn-create').disabled && /AddMenu\( MMI_TRADE \);\s*AddMenu\( MMI_SWAPPER_SWAPS \);\s*AddMenu\( MMI_SWAPPER_RULES \);/.test(pvw)
        && new RegExp(`#define MMI_SWAPPER_SWAPS\\s+${fa}`).test(pvw) && new RegExp(`#define MMI_SWAPPER_RULES\\s+${fb}`).test(pvw) && new RegExp(`NpcBoard_${fb}\\.inc \\(new file`).test(pvw)
        && new RegExp(`Saved as MMI_SWAPPER_RULES, menu ${fb}`).test(nf().textContent),
        `preview: the NPC block lists Trade + both new menus; exchange menu ${fa}, rules menu ${fb} and its file`);
      if (STOP === 'nnmenus') { $('toasts').textContent = ''; const sc = nf().closest('.modal').querySelector('.modal-body') || nf().parentElement; const h3 = [...nf().querySelectorAll('h3')].find(x => x.textContent === 'Rules text'); if (h3) h3.scrollIntoView(); return; }
      const steps0 = S.ws.history.length;
      click(document.getElementById('nn-create'));
      await waitFor(() => !document.querySelector('.newnpc'), 'form closed (menus inline)');
      const sw = S.ws.chars.byKey.get('mafl_swapper');
      const labels = sw ? FRE.newNpcSim.rightClick(S.ws, sw.slice(-1)[0].menus).map(m => m.label) : [];
      ok(['Swapper Swaps', 'Swapper Rules'].every(l => labels.includes(l)) && S.ws.history.length === steps0 + 1 && !lastModalAny(),
        `one Create: the NPC with its exchange and rules menus (${labels.join(', ')}), one undo step, no second window`);
      ok(/Exchange_Script\.txt/.test($('toasts').textContent) && /One Undo removes it all/.test($('toasts').textContent), 'the note lists the files and says one Undo removes it all');
      click($('btn-undo'));
      ok(!S.ws.chars.byKey.has('mafl_swapper') && !S.ws.defines.defines.has('MMI_SWAPPER_SWAPS') && S.ws.dirtyFiles().length === 0, 'one Undo removes the NPC and both menus');
      if (STOP === 'npcmove') { openNpc('MaFl_Peach'); $('toasts').textContent = ''; click($('editor').querySelector('.place-edit')); return; }
    }

    // ---- Donation Shop
    await openTask('donation');
    ok(S.mode === 'donation', 'Donation Shop mode');
    ok(/MaFl_DONATION/.test($('editor').textContent) && /Flaris — Flarine \/ Central Flarine/.test($('editor').querySelector('.where').textContent), 'Donation Shop: where Adrian (MaFl_DONATION) stands');
    ok([...document.querySelectorAll('#list .npc')].some(g => g.textContent.startsWith('▾ Weapon Skins')), 'categories follow the client tree (groups clickable)');
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
    ok(/Task:\s*Donation Shop/.test($('mode-tabs').textContent) && $('btn-change-task'), 'task bar names the task, with Change task');
    ok(!S.ws.isEditable('character.inc') && S.ws.isEditable('spec_item.txt') && !S.ws.available.npc.ok, 'Donation Shop task: NPC files not open for editing, Spec_Item.txt (chip prices) is');
    // focusing a price box in the last row must scroll the editor, never the page (user report)
    const lastIn = [...ed.querySelectorAll('input.num-input')].pop();
    ed.scrollTop = 0;
    lastIn.focus(); lastIn.scrollIntoView();
    await tick();
    const sc = document.scrollingElement;
    ok(sc.scrollTop === 0 && document.body.scrollTop === 0 && $('toolbar').getBoundingClientRect().top === 0, 'the page itself never scrolls (toolbar stays on screen)');
    ok($('layout').getBoundingClientRect().bottom <= window.innerHeight + 1 && lastIn.getBoundingClientRect().bottom <= window.innerHeight + 1, 'focused last row is visible inside the window');
    lastIn.blur();

    // ---- Try buying (loaders/donation-buy.js): the 🛒 on a row
    {
      click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Suits')));
      const cart = [...$('editor').querySelectorAll('table.items button')].find(b => b.textContent === '🛒');
      ok(!!cart, 'each Donation Shop row has a 🛒 Try buying button');
      click(cart);
      await waitFor(() => lastModalAny() && /^Try buying: /.test(lastModalAny().querySelector('header').textContent), 'Try buying window');
      const box = lastModalAny(), ins = box.querySelectorAll('input.num-input');
      ok(/Bought/.test(box.textContent) && /You pay [\d,]+ Donate Chips, you get .+ ×1\./.test(box.textContent), 'quantity 1 with 1,000 chips: bought, You pay … you get …');
      ins[0].value = '9999'; ins[0].dispatchEvent(new Event('input')); ins[0].dispatchEvent(new Event('change'));
      await tick();
      ok(/More Donate Chips are needed/.test(lastModalAny().textContent), 'quantity 9,999: "More Donate Chips are needed." (the client\'s message box)');
      ins[0].value = '1'; ins[0].dispatchEvent(new Event('change'));
      ins[2].value = '0'; ins[2].dispatchEvent(new Event('change'));
      await tick();
      ok(/\[chat\]/.test(lastModalAny().textContent) && /checked before the chips are taken/.test(lastModalAny().textContent), 'no empty slot: the server\'s chat line and the bag note');
      btnByText(lastModalAny().querySelector('footer'), 'Close') ? click(btnByText(lastModalAny().querySelector('footer'), 'Close')) : lastModalAny().remove();
      // the price box applies while typing (no Enter, no click elsewhere): DS_OVERFLOW shows by itself
      const pin = $('editor').querySelector('table.items tr.fixed input.num-input');
      pin.focus(); pin.value = '214770'; pin.dispatchEvent(new Event('input'));
      ok(pin.style.borderColor !== '', 'over 214,769: the price box turns red at once');
      ok(!S.ws.diags.some(d => d.code === 'DS_OVERFLOW'), 'not applied before the pause (no half-typed price is written)');
      FRE.dom.flushLive(); await tick();      // = the 1 s pause after the last key (no Enter, no click elsewhere)
      ok(S.ws.newBlocking().some(d => d.code === 'DS_OVERFLOW'), 'typed price applies by itself (no Enter, no click elsewhere): ⛔ DS_OVERFLOW');
      ok(/⛔ 1/.test($('btn-diag').textContent), 'the top badge counts the ⛔');
      click($('btn-save'));
      await waitFor(() => lastModalAny() && /Cannot save/.test(lastModalAny().querySelector('header').textContent), 'Cannot save window');
      ok(/DS_OVERFLOW|214,769/.test(lastModalAny().textContent), 'Save refuses and lists DS_OVERFLOW');
      lastModalAny().remove();
      if (STOP === 'dsbuy') return;
      click($('btn-undo'));
      ok(!S.ws.diags.some(d => d.code === 'DS_OVERFLOW'), 'Undo: DS_OVERFLOW gone');
    }

    // ---- Donation Shop categories (task S part 4): Client/Client/DonationShopTree.inc
    {
      const K = FRE.donationTree.KEY, tree0 = S.ws.files.get(K).text, ds0 = S.ws.files.get('donationshop.inc').text;
      const pickEntry = t => click([...document.querySelectorAll('#list .npc')].find(n => n.querySelector('.n span').textContent === t));
      const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
      ok(S.ws.isEditable(K), 'the category tree is editable in the Donation Shop task');
      pickEntry('▾ Fashion');
      ok(/Items \(85\)/.test($('editor').textContent) && /In game a group shows the items of its 4 categories/.test($('editor').textContent), 'a group lists the items of its 4 categories, like the game');
      click(btnByText($('list'), '+ Category'));
      await waitFor(() => lastModalAny() && /^\+ Category in the Donation Shop/.test(lastModalAny().querySelector('header').textContent), '+ Category dialog');
      let box = lastModalAny();
      const create = () => btnByText(box.querySelector('footer'), 'Create');
      ok(!btnByText($('list'), '+ Group') && btnByText(box, '+ Add a category inside it'), 'one + Category button; categories inside are optional');
      ok(create().disabled && /Type a name/.test(box.textContent), 'Create greyed until a name is typed');
      typeIn(box.querySelector('input'), 'masks');
      ok(create().disabled && /already exists/.test(box.textContent), 'a taken name (any case) is refused');
      typeIn(box.querySelector('input'), 'Hats');
      ok(!create().disabled && /Sidebar of the Donation Shop window/.test(box.textContent) && /· Hats {2}\(0\)/.test(box.textContent) && /donation-tree\.diff/.test(box.textContent), 'live preview: the sidebar with Hats, and the patch warning');
      if (STOP === 'dstree') return;
      click(create());
      ok(S.ws.files.get(K).text.includes('\t\t"Wings"\n\t\t"Hats"\n') && S.ws.donationTree.isLeaf('Hats'), 'Hats written at the end of Fashion, tab indent, LF');
      ok(/New Donation Shop category "Hats" in Fashion/.test($('toasts').textContent) && /Hats/.test($('editor').querySelector('.npc-title').textContent), 'standard note; the new category is selected');
      ok(S.ws.diags.some(d => d.code === 'DT_PATCH' && /Hats/.test(d.message)), 'DT_PATCH warning for Hats');
      // Save's "After saving": the patch step (test-data: unknown, with the tickbox), then restart the game only
      click($('btn-save'));
      await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (tree)');
      const as = () => document.querySelector('.modal .after-save');
      ok(/donation-tree\.diff/.test(as().textContent) && /NoGameguard/.test(as().textContent) && /Close the game and start it again/.test(as().textContent) && !/Stop Server\.bat/.test(as().textContent),
        'review: the donation-tree patch step + restart the game, no server restart', as().textContent);
      const tickBox = as().querySelector('input[type=checkbox]');
      ok(tickBox && /I built it into Neuz/.test(tickBox.parentNode.textContent), 'the patch step has "I built it into Neuz"');
      tickBox.checked = true; tickBox.dispatchEvent(new Event('change'));
      ok(/Close and reopen the Donation Shop window/.test(as().textContent) && !/git apply/.test(as().textContent) && /marked as built/.test(as().textContent), 'ticked: only reopen the window', as().textContent);
      const untick = as().querySelector('input[type=checkbox]');
      untick.checked = false; untick.dispatchEvent(new Event('change'));
      ok(/git apply/.test(as().textContent) && !FRE.patchState.ticked('donation-tree'), 'unticked: the patch step is back');
      click(btnByText(document, 'Cancel'));
      click($('btn-undo'));
      ok(S.ws.files.get(K).text === tree0, 'Undo: the tree is back');
      // a group with 2 categories, then delete them: the group goes with its last one
      click(btnByText($('list'), '+ Category'));
      await waitFor(() => lastModalAny() && /^\+ Category in the Donation Shop/.test(lastModalAny().querySelector('header').textContent), '+ Category dialog (group)');
      box = lastModalAny();
      typeIn(box.querySelectorAll('input')[0], 'Mounts');
      click(btnByText(box, '+ Add a category inside it'));
      ok(document.activeElement === box.querySelectorAll('.dt-inside')[0] && !box.querySelector('.combo-list:not([hidden])'), 'the new category box gets the focus (not the Inside search box)');
      typeIn(box.querySelectorAll('input')[1], 'Boards');
      click(btnByText(box, '+ Add a category inside it'));
      typeIn(box.querySelectorAll('input')[2], 'boards');
      ok(create().disabled && /used twice/.test(box.textContent), 'the same category twice is refused');
      typeIn(box.querySelectorAll('input')[2], 'Brooms');
      ok(!create().disabled && /2 categories/.test(box.textContent), 'a group with 2 categories: Create on');
      click(create());
      ok(S.ws.donationTree.find('Mounts').children.map(n => n.name).join(',') === 'Boards,Brooms' && S.ws.history.length > 0, 'Mounts › Boards, Brooms written in one step');
      // ✎ Edit on a category with items: + Add a category inside it makes it a group, the items move into the first one
      pickEntry('Pets');
      click(btnByText($('editor'), 'Edit category')); box = lastModalAny();
      click(btnByText(box, '+ Add a category inside it'));
      typeIn(box.querySelector('.dt-inside'), 'Buff Pets');
      ok(/13 items move to "Buff Pets"/.test(box.textContent), 'the preview says Pets\' 13 items move into Buff Pets');
      click(btnByText(box, '+ Add a category inside it'));
      typeIn(box.querySelectorAll('.dt-inside')[1], 'Raised Pets');
      const dsel = box.querySelector('select.dt-dest');
      ok(dsel && [...dsel.options].map(o => o.textContent).join(',') === 'Buff Pets,Raised Pets', '"Its 13 items go to" lists the new categories');
      dsel.value = '1'; dsel.dispatchEvent(new Event('change'));
      ok(/13 items move to "Raised Pets"/.test(box.textContent), 'pick Raised Pets: the preview follows');
      click(btnByText(box.querySelector('footer'), 'Apply changes'));
      ok(S.ws.donationTree.find('Pets').children.map(n => n.name).join(',') === 'Buff Pets,Raised Pets' && S.ws.models.donation.rows.filter(r => r.category === 'Raised Pets').length === 13, 'Pets is a group, its items are in Raised Pets');
      const arrow = [...document.querySelectorAll('#list .npc')].find(n => /Pets/.test(n.textContent) && n.querySelector('.fold')).querySelector('.fold');
      click(arrow);
      ok(![...document.querySelectorAll('#list .npc')].some(n => /Raised Pets/.test(n.textContent)) && /Raised Pets/.test($('editor').querySelector('.npc-title').textContent), 'the arrow closes the group list; the selection stays');
      click([...document.querySelectorAll('#list .fold')].find(f => f.textContent === '▸'));
      ok([...document.querySelectorAll('#list .npc')].some(n => /Raised Pets/.test(n.textContent)), 'and opens it again');
      click($('btn-undo'));
      ok(!S.ws.donationTree.find('Buff Pets') && S.ws.models.donation.rows.filter(r => r.category === 'Pets').length === 13, 'one Undo: Pets holds its items again');
      pickEntry('Boards');
      click(btnByText($('editor'), 'Delete category')); box = lastModalAny();
      ok(!/Also delete the group/.test(box.textContent), 'Boards is not the only category: no group box');
      click(btnByText(box.querySelector('footer'), 'Delete category'));
      pickEntry('Brooms');
      click(btnByText($('editor'), 'Delete category')); box = lastModalAny();
      const gbox = [...box.querySelectorAll('label')].find(l => /Also delete the group "Mounts"/.test(l.textContent));
      ok(gbox && gbox.querySelector('input').checked, 'the last category: "Also delete the group" box, ticked');
      click(btnByText(box.querySelector('footer'), 'Delete category'));
      ok(!S.ws.donationTree.find('Mounts') && !S.ws.donationTree.find('Brooms'), 'one Delete removes Brooms and its group');
      click($('btn-undo')); click($('btn-undo')); click($('btn-undo'));
      ok(S.ws.files.get(K).text === tree0, 'three Undos: the tree is back');
      // rename: the items follow
      pickEntry('Masks');
      click(btnByText($('editor'), 'Edit category'));
      await waitFor(() => lastModalAny() && /^Edit category: Masks/.test(lastModalAny().querySelector('header').textContent), 'Edit category dialog');
      box = lastModalAny();
      const apply = () => btnByText(box.querySelector('footer'), 'Apply changes');
      ok(apply().disabled && /No change/.test(box.textContent), 'opens with "No change", Apply greyed');
      typeIn(box.querySelector('input'), 'Face Masks');
      click(apply());
      ok(S.ws.donationTree.isLeaf('Face Masks') && S.ws.models.donation.rows.filter(r => r.category === 'Face Masks').length === 5 && !S.ws.models.donation.rows.some(r => r.category === 'Masks'), 'renamed: the 5 mask items follow');
      click($('btn-undo'));
      ok(S.ws.files.get(K).text === tree0 && S.ws.files.get('donationshop.inc').text === ds0, 'one Undo restores both files');
      // ↑: one click
      pickEntry('Masks');
      click([...$('editor').querySelectorAll('button')].find(b => b.textContent === '↑'));
      ok(S.ws.donationTree.find('Fashion').children.map(n => n.name).join(',') === 'Suits,Masks,Cloaks,Wings', '↑ moves Masks above Cloaks');
      click($('btn-undo'));
      // delete: the items move
      pickEntry('Masks');
      click(btnByText($('editor'), 'Delete category'));
      await waitFor(() => lastModalAny() && /^Delete category: Masks/.test(lastModalAny().querySelector('header').textContent), 'Delete dialog');
      box = lastModalAny();
      const del = () => btnByText(box.querySelector('footer'), 'Delete category');
      ok(del().disabled && /holds 5 items/.test(box.textContent), 'lists its 5 items; Delete greyed until a choice');
      const cin = box.querySelector('.combo input');
      cin.dispatchEvent(new Event('focus')); cin.value = 'suits'; cin.dispatchEvent(new Event('input'));
      [...box.querySelectorAll('.combo-opt')].find(o => o.textContent === 'Suits').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      ok(!del().disabled && /moved to "Suits"/.test(box.textContent), 'pick Suits: preview says the items move there');
      click(del());
      ok(!S.ws.donationTree.find('Masks') && S.ws.models.donation.rows.filter(r => r.category === 'Suits').length === 75, 'Masks gone, Suits now holds 75');
      click($('btn-undo'));
      ok(S.ws.files.get(K).text === tree0 && S.ws.files.get('donationshop.inc').text === ds0 && S.ws.dirtyFiles().length === 0, 'Undo restores both files');
    }

    // ---- Monster Drops (propMoverEx.inc)
    await openTask('drops');
    ok(S.mode === 'drops' && document.querySelectorAll('#list .npc').length > 300, 'Monster Drops: the monster list');
    {
      const listSearch = $('list-search');
      listSearch.value = 'Small Aibatt'; listSearch.dispatchEvent(new Event('input'));
      click([...document.querySelectorAll('#list .npc')].find(n => /^Small Aibatt/.test(n.textContent)));
      const ed = () => $('editor');
      ok(/Max items per kill/.test(ed().textContent) && /Drops \(2\)/.test(ed().textContent), 'Small Aibatt: max items, 2 drops');
      ok([...ed().querySelectorAll('input.pct-input')].some(i => i.value === '13.9698'), 'a 300,000,000 line shows 13.9698% (what players get)');
      ok(/Players get \d[\d,]* - [\d,]+ Penya per kill/.test(ed().textContent) && /PenyaTable\.txt/.test(ed().textContent), 'Penya: the range players get, from PenyaTable.txt');
      const f0 = S.ws.files.get('propmoverex.inc').text;
      // + Add a drop
      click(btnByText(ed(), '+ Add a drop'));
      await waitFor(() => lastModalAny() && /Add a drop/.test(lastModalAny().querySelector('header').textContent), 'add-drop form');
      const fm = lastModalAny(), addBtn = () => fm.querySelector('#dr-add-btn');
      ok(addBtn().disabled && /Still needs: the item/.test(fm.textContent), 'Add greyed until item and chance are set');
      const ci = fm.querySelector('.combo input');
      ci.dispatchEvent(new Event('focus')); ci.value = 'II_CHP_RED'; ci.dispatchEvent(new Event('input'));
      const opt = [...fm.querySelectorAll('.combo-opt')].find(o => /II_CHP_RED\)/.test(o.textContent));
      opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const pin = fm.querySelector('input.pct-input');
      pin.value = '5'; pin.dispatchEvent(new Event('change'));
      await waitFor(() => !addBtn().disabled && /Players get it in/.test(fm.textContent), 'add form ready');
      ok(/DropItem\(II_CHP_RED, \d+, 0, -1\);/.test(fm.textContent), 'preview: the line that will be written (amount 1, not counted)');
      if (STOP === 'drops') { $('toasts').textContent = ''; return; }
      click(addBtn());
      ok(/Drops \(3\)/.test(ed().textContent) && /DropItem\(II_CHP_RED, \d+, 0, -1\);\r\n/.test(S.ws.files.get('propmoverex.inc').text), 'drop added: one CRLF line');
      ok(S.ws.history[S.ws.history.length - 1].label.startsWith('Small Aibatt: added '), 'undo label in plain words');
      // change a chance (players' %), then remove the line
      const row = () => [...ed().querySelectorAll('table.items tr')].find(tr => tr.textContent.includes('II_GEN_GEM_GEM_TWINKLESTONE_1'));
      const p2 = row().querySelector('input.pct-input');
      p2.value = '20'; p2.dispatchEvent(new Event('change'));
      ok(/TWINKLESTONE_1, 429496729,|TWINKLESTONE_1, 42949673\d,/.test(S.ws.files.get('propmoverex.inc').text), 'typing 20% writes the file value that gives 20%');
      {
        const steps = S.ws.history.length;
        const p3 = row().querySelector('input.pct-input');
        p3.value = '25'; p3.dispatchEvent(new Event('change'));
        ok(S.ws.history.length === steps && /\(was 13\.97%\)/.test(S.ws.history[steps - 1].label), 'typing the same chance again folds into one undo step (label keeps "was 13.97%")');
      }
      click(row().querySelector('button.icon.danger'));
      ok(/Drops \(2\)/.test(ed().textContent) && !/TWINKLESTONE_1,/.test(S.ws.files.get('propmoverex.inc').text.slice(f0.indexOf('MI_AIBATT1'), f0.indexOf('MI_AIBATT2'))), 'drop removed');
      // kill it
      click(btnByText(ed(), 'Kill it'));
      await waitFor(() => lastModalAny() && /kills in \d+ ms/.test(lastModalAny().textContent), 'kill window');
      ok(/Penya: [\d,]+ per kill/.test(lastModalAny().textContent), 'kill window: Penya per kill');
      if (STOP === 'dropskill') { $('toasts').textContent = ''; return; }
      click(btnByText(lastModalAny().querySelector('footer'), 'Close'));
      // a script-made line: the warning
      listSearch.value = 'MI_SYLIACA4'; listSearch.dispatchEvent(new Event('input'));
      click(document.querySelector('#list .npc'));
      ok(/script: BossDrop/.test(ed().textContent), 'script-made rows are tagged');
      const gp = [...ed().querySelectorAll('table.items tr')].find(tr => /script: BossDrop/.test(tr.textContent)).querySelector('input.pct-input');
      gp.value = '1'; gp.dispatchEvent(new Event('change'));
      ok(S.ws.diags.some(d => d.code === 'M_GEN_EDITED' && /gen_boss_drops\.ps1/.test(d.message)), 'editing a [BossDrop] line warns: the script would undo it');
      ok(S.ws.newBlocking().length === 0, 'no blocking problems');
      if (STOP === 'dropsgen') { $('toasts').textContent = ''; return; }
      while (S.ws.history.length) click($('btn-undo'));
      ok(S.ws.files.get('propmoverex.inc').text === f0 && !S.ws.dirtyFiles().length, 'every edit undone');
      listSearch.value = ''; listSearch.dispatchEvent(new Event('input'));
    }

    // ---- Battle Pass
    await openTask('battlepass');
    ok(S.mode === 'battlepass', 'Battle Pass mode');
    ok(S.ws.clientTheme && S.ws.clientTheme.has('battlepass_new.tga'), 'Client/Theme texture names read');
    const bpText0 = S.ws.files.get('battlepass.inc').text;
    ok($('editor').querySelector('input[type=date]').value === '2026-10-04', 'date box shows the last day (4 Oct; the file says 20261005)');
    ok(/Season 1 ended/.test($('editor').textContent) && /Donation Shop still sells the pass/.test($('editor').textContent), 'status card: season ended + pass warning');
    if (STOP === 'bpexpired') return;
    click(btnByText($('editor'), 'Start new season'));
    await waitFor(() => btnByText(document.querySelector('.modal'), 'Start new season'), 'new season dialog');
    const nm = document.querySelector('.modal');
    const sIn = nm.querySelector('input[type=date]');
    sIn.value = '2026-10-06'; sIn.dispatchEvent(new Event('change'));
    ok(/Runs 30 full days: Tue 06 Oct 2026 to Wed 04 Nov 2026/.test(nm.textContent) && /nTime 20261105/.test(nm.textContent) && /1 → 2 on the pass and on all 50 reward levels/.test(nm.textContent), 'dialog: 30 days from 6 Oct -> nTime 20261105, nType 1 -> 2');
    ok(nm.querySelectorAll('.diff .add').length === 51, 'dialog previews the 51 changed lines');
    ok(S.ws.files.get('battlepass.inc').text === bpText0, 'preview does not edit the file');
    if (STOP === 'bpseason') return;
    click(btnByText(nm.querySelector('footer'), 'Start new season'));
    ok(S.ws.models.battlepass.pass.time.value === 20261105 && S.ws.models.battlepass.pass.type.value === 2, 'new season written');
    ok(S.ws.models.battlepass.rows.BP4.every(r => r.type.value === 2), 'all rewards moved to season 2');

    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Reward ladder')));
    ok(/Levels \(50\)/.test($('editor').textContent) && /146,000 points to reach level 50/.test($('editor').querySelector('.bp-total').textContent), 'ladder: 50 levels, 146,000 points to the top');
    search.value = 'II_CHP_RED'; search.dispatchEvent(new Event('input'));
    const plus3 = [...document.querySelectorAll('#item-list .item')].find(r => r.querySelector('.def').textContent === 'II_CHP_RED').querySelector('button');
    ok(!plus3.disabled && /level 51/.test(plus3.title), '+ adds level 51');
    ok(!$('editor').querySelector('td.tex') && btnByText($('editor'), 'Change'), 'no texture column; rows have a "Change" button');
    click(plus3);
    ok(/Levels \(51\)/.test($('editor').textContent), 'level 51 added');
    ok(S.ws.newBlocking().length === 0, 'no blocking problems');
    if (STOP === 'bpladder') return;

    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Monster points')));
    ok(/Monsters \(757\)/.test($('editor').textContent), 'monsters: 757 real monsters shown (106 pets / town NPCs hidden)');
    const kRow = [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.textContent.includes('MI_KINGSTER01'));
    const kMin = kRow.querySelectorAll('input.num-input')[0];
    kMin.value = '14'; kMin.dispatchEvent(new Event('change'));
    const kRow2 = [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.textContent.includes('MI_KINGSTER01'));
    const kMax = kRow2.querySelectorAll('input.num-input')[1];
    kMax.value = '20'; kMax.dispatchEvent(new Event('change'));
    ok(S.ws.diags.some(d => d.code === 'BP_BAND'), 'off-band price warns');
    click(btnByText($('editor'), 'Re-price off-band rows (1)'));
    await waitFor(() => btnByText(document.querySelector('.modal'), 'Re-price'), 're-price dialog');
    ok(/Small Kingster/.test(document.querySelector('.modal').textContent) && /60-80/.test(document.querySelector('.modal').textContent), 're-price dialog lists Kingster 14-20 -> 60-80');
    ok(/Add all unlisted monsters \(32\)/.test($('editor').textContent), 'button offers the 32 unlisted real monsters');
    ok(/106 pets and town NPCs in the file are hidden/.test($('editor').textContent) && !/MI_PET_CHICKEN/.test($('editor').textContent), 'pets hidden; note offers to delete the 106 rows');
    if (STOP === 'bpmonsters') return;
    click(btnByText(document.querySelector('.modal footer'), 'Re-price'));
    ok(!S.ws.diags.some(d => d.code === 'BP_BAND'), 're-priced: no off-band rows');

    // save: the Client copy gets the same bytes (identical file)
    click($('btn-save'));
    await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (battle pass)');
    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent) && !/Client sync/.test(h.textContent)), 'save finished (battle pass)');
    const bpSrv = res.children.get('BattlePass.inc').bytes, bpCli = clientDir.children.get('BattlePass.inc').bytes;
    ok(FRE.bytes.bytesEqual(bpSrv, S.ws.files.get('battlepass.inc').bytes) && FRE.bytes.bytesEqual(bpSrv, bpCli), 'BattlePass.inc saved, Client copy identical');
    ok(!FRE.bytes.bytesEqual(bpSrv, original.get('BattlePass.inc')), 'file changed on disk');
    document.querySelectorAll('.modal-back').forEach(m => m.remove());

    // Past seasons: the save above backed up season 1; season 2 (current) is edited in Reward ladder
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Past seasons')));
    await waitFor(() => $('editor').querySelectorAll('details.bp-season').length >= 1, 'past seasons read from the backups');
    const seasons = () => [...$('editor').querySelectorAll('details.bp-season')];
    ok(!seasons().some(d => /current/.test(d.querySelector('summary').textContent)), 'the current season has no card here');
    const s1card = () => seasons().find(d => /Season 1\b/.test(d.querySelector('summary').textContent));
    ok(s1card() && !s1card().open && /ended/.test(s1card().querySelector('summary').textContent) && s1card().querySelectorAll('tr').length === 51, 'season 1 from the backup: closed, ended, 50 levels');
    s1card().open = true;
    const past5 = [...s1card().querySelectorAll('tr')][5];
    const pastName = past5.querySelector('td:nth-child(2)').textContent;
    click(past5.querySelector('button'));
    await waitFor(() => document.querySelector('.modal') && /Copy a reward from season 1 into season 2/.test(document.querySelector('.modal header').textContent), '+ opens the pop-up');
    const plm = document.querySelector('.modal');
    const whereSel = plm.querySelector('select'); whereSel.value = '3'; whereSel.dispatchEvent(new Event('change'));
    ok(/Before/.test(plm.textContent) && /After/.test(plm.textContent) && btnByText(plm.querySelector('footer'), 'Replace level 3'), 'pop-up shows level 3 before / after; the button says "Replace level 3"');
    const qtyIn = [...plm.querySelectorAll('label')].find(l => /Quantity/.test(l.textContent)).querySelector('input');
    qtyIn.value = '4'; qtyIn.dispatchEvent(new Event('change'));
    if (STOP === 'bpplace') return;
    click(btnByText(plm.querySelector('footer'), 'Replace level 3'));
    const lvOf = n => S.ws.models.battlepass.ladder.get(n);
    ok(lvOf(3).qty.value === 4 && pastName.includes(S.ws.itemInfo(S.ws.itemById(lvOf(3).id)).name), 'level 3 now has the past reward x4');
    ok(/Season 2, level 3: 4x/.test($('toasts').textContent), 'a message says what was added and where');
    if (STOP === 'bphistory') return;
    click(btnByText(s1card(), 'Use this whole ladder'));
    await waitFor(() => document.querySelector('.modal') && /Use season 1's ladder/.test(document.querySelector('.modal header').textContent), 'use-ladder preview');
    ok(/level \d+: removed/.test(document.querySelector('.modal').textContent), 'preview lists the changes (extra levels removed)');
    click(btnByText(document.querySelector('.modal footer'), 'Use this ladder'));
    ok(S.ws.models.battlepass.ladder.size === 50 && S.ws.models.battlepass.pass.type.value === 2, 'ladder back to season 1\'s 50 levels, still season 2');
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.startsWith('Reward ladder')));
    const bpTotal = () => $('editor').querySelector('.bp-total').textContent;
    ok(/146,000 points to reach level 50/.test(bpTotal()), 'total on top: 146,000 points to reach level 50');
    const ladRow = n => [...$('editor').querySelectorAll('table.items tr')].find(tr => tr.querySelector('td') && tr.querySelector('td').textContent === String(n));
    const costIn = ladRow(1).querySelectorAll('input.num-input')[1];
    costIn.value = '3000'; costIn.dispatchEvent(new Event('change'));
    ok(/147,000 points to reach level 50/.test(bpTotal()), 'a cost change updates the total');
    const [i2, i3, c2] = [lvOf(2).define, lvOf(3).define, lvOf(2).points.value];
    click([...ladRow(2).querySelectorAll('button')].find(b => b.textContent === '↓'));
    ok(lvOf(2).define === i3 && lvOf(3).define === i2 && lvOf(2).points.value === c2, '↓ on level 2 swaps the rewards of levels 2 and 3; the cost stays');
    const i6 = lvOf(6).define;
    click([...ladRow(5).querySelectorAll('button')].find(b => b.textContent === '✕'));
    await waitFor(() => document.querySelector('.modal') && /Remove level 5/.test(document.querySelector('.modal header').textContent), 'remove-level confirmation');
    click(btnByText(document.querySelector('.modal footer'), 'Remove level 5'));
    ok(S.ws.models.battlepass.ladder.size === 49 && lvOf(5).define === i6 && !S.ws.diags.some(d => d.code === 'BP_LEVEL_GAP'), '✕ on level 5: 49 levels, old level 6 is now 5, no gap');
    while (!$('btn-undo').disabled) click($('btn-undo'));
    ok(S.ws.dirtyFiles().length === 0, 'undo all: the saved file again');
    document.querySelectorAll('.modal-back').forEach(m => m.remove());

    // ---- Exchanges
    // (in NPC Shops since 2026-10-07: the user asked for exchanges next to the NPC's shop; no Exchanges task)
    await openTask('npc');
    ok(S.ws.isEditable('exchange_script.txt') && S.ws.clientFileNames().includes('Exchange_Script.txt'), 'NPC Shops edits and syncs Exchange_Script.txt');
    ok(Array.isArray(S.ws.moduleDiags.exchange) && S.ws.moduleDiags.exchange.length === 0, 'exchange checks run in NPC Shops (hidden / unplaced menus are not checked)');
    const exFilt = $('list-extra').querySelector('select');
    const exOpt = [...exFilt.options].find(o => o.value === 'exchange');
    ok(exOpt && /NPCs with exchanges \(\d+\)/.test(exOpt.textContent), 'filter "NPCs with exchanges"');
    exFilt.value = 'exchange'; exFilt.dispatchEvent(new Event('change'));
    const exList = () => [...document.querySelectorAll('#list .npc')];
    ok(exList().some(n => /Collins/.test(n.textContent)) && !exList().some(n => /Bles|Brooks/.test(n.textContent)) && !exList().some(n => /^Peach/.test(n.textContent)), 'only in-game NPCs that open an exchange (no Bles, no Brooks, no Peach)');
    const exEd = () => $('editor');
    click(exList().find(n => /MaFl_Collins|Collins/.test(n.textContent)));
    ok(exEd().querySelector('.tabs .ex-tab.sel') && exEd().querySelectorAll('.ex-card').length === 8, 'Collins opens on his ⇄ tab: 8 exchange cards');
    ok(!btnByText(exEd(), 'Open in Exchanges'), 'no "Open in Exchanges" button any more');
    ok(/In game:/.test(exEd().querySelector('.ex-card').textContent), 'each card shows the in-game row');
    ok(btnByText(exEd().querySelector('.ex-card'), 'Remove Name Color Scroll (3 Days)') && /Exchange 1/.test(exEd().querySelector('.ex-label').textContent), 'the card is named by its reward: "Exchange 1", "Remove Name Color Scroll (3 Days)"');
    ok(/You get\s*Name Color Scroll \(3 Days\) ×1/.test(exEd().querySelector('.ex-get').textContent), 'card headline: what the player gets');
    ok(/Rewards/.test(exEd().querySelectorAll('.ex-section-title')[0].textContent) && /Costs/.test(exEd().querySelectorAll('.ex-section-title')[1].textContent), 'rewards first, then costs');
    if (STOP === 'exchange') return;
    // Try it: the exchange simulator (loaders/exchange-sim.js) on Collins recipe 8 (Scroll of Holy x5)
    click(btnByText(exEd().querySelectorAll('.ex-card')[7], 'Try it'));
    await waitFor(() => document.querySelector('.modal .ex-try-out table'), 'Try it results');
    ok(/^Try: Scroll of Holy \(Collins, exchange 8\)$/.test(document.querySelector('.modal header').textContent), 'Try it title names the reward, the NPC and the position');
    const tryM = () => document.querySelector('.modal');
    ok(/1,000 exchanged/.test(tryM().textContent) && /Scroll of Holy ×5/.test(tryM().textContent) && /100\.00%/.test(tryM().textContent), 'Try it: 1,000 presses, all exchanged, Scroll of Holy x5 100%');
    ok(/Exchange complete! You received Scroll of Holy x5\./.test(tryM().textContent), 'Try it: Collins chat line shown');
    const sel = tryM().querySelector('.ex-try select'); sel.value = 'keep'; sel.dispatchEvent(new Event('change'));
    const freeIn = [...tryM().querySelectorAll('.ex-try label')].find(l => /Empty bag slots/.test(l.textContent)).querySelector('input');
    freeIn.value = '1'; freeIn.dispatchEvent(new Event('change'));          // runs again by itself (no Run click)
    ok(/refused: bag full/.test(tryM().textContent) && /at least one EMPTY bag slot/.test(tryM().textContent), 'Try it: one bag + 1 empty slot -> refused, bag full (IsFull wants an empty slot)');
    if (STOP === 'exsim') return;
    document.querySelectorAll('.modal-back').forEach(m => m.remove());
    const card1 = () => exEd().querySelectorAll('.ex-card')[0];
    const q1 = card1().querySelectorAll('.ex-section')[1].querySelector('input.num-input');
    q1.value = '450'; q1.dispatchEvent(new Event('change'));
    const s1 = S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLLECT01').sets[0];
    ok(s1.condition[0].num.value === 450 && s1.remove[0].num.value === 450, 'ingredient qty written to CONDITION and REMOVE');
    const colBadge = () => /edited/.test(exList().find(n => /Collins/.test(n.textContent)).textContent);
    ok(colBadge(), 'edit: Collins gets the "edited" badge');
    ok(/^Undo \(\d+\)$/.test($('btn-undo').textContent), 'Undo shows how many edits the task has');
    click($('btn-undo'));
    ok(!colBadge(), 'undo the only edit: the badge goes away');
    click($('btn-redo'));
    ok(colBadge() && S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLLECT01').sets[0].condition[0].num.value === 450, 'redo: the edit and its badge come back');
    // picking an item for a lower recipe keeps the editor where it is
    const exE = exEd(), card8 = () => exE.querySelectorAll('.ex-card')[7];
    exE.scrollTop = card8().offsetTop;
    const before = exE.scrollTop;
    click(btnByText(card8(), '+ Ingredient'));
    ok(before > 200 && Math.abs(exE.scrollTop - before) < 2 && /Pick an item/.test(card8().textContent), '+ Ingredient on recipe 8: no jump to the top (the button says "Pick an item")');
    click(btnByText(card8(), 'Pick an item →'));
    ok(Math.abs(exE.scrollTop - before) < 2, 'cancel the pick: still in place');
    exE.scrollTop = 0;
    click(btnByText(card1(), '+ Reward'));
    search.value = 'II_SYS_SYS_SCR_AMPESS'; search.dispatchEvent(new Event('input'));
    const plusEx = [...document.querySelectorAll('#item-list .item')].find(r => r.querySelector('.def').textContent === 'II_SYS_SYS_SCR_AMPESS').querySelector('button');
    ok(!plusEx.disabled && /reward of exchange 1/.test(plusEx.title), '+ adds a reward to exchange 1');
    click(plusEx);
    const pctsOf = c => [...c.querySelectorAll('input.pct-input')].map(x => x.value);
    ok(/Server uses/.test(card1().textContent) && String(pctsOf(card1())) === '50,50' && /chances add up to 100%/.test(card1().textContent),
      'a new reward gets an equal share: 50% / 50%, the total stays 100% (nothing dropped)');
    const pc = card1().querySelector('input.pct-input'); pc.value = '80'; pc.dispatchEvent(new Event('change'));
    ok(String(pctsOf(card1())) === '80,20' && [...card1().querySelectorAll('td')].some(td => td.textContent === '200,000'), 'percent 80 on one: the other becomes 20%; "of 1,000,000" shows 200,000 (read-only)');
    click(btnByText(card1(), 'Spread evenly'));
    ok(/chances add up to 100%/.test(card1().textContent) && String(pctsOf(card1())) === '50,50', 'spread evenly: 50% / 50%');
    ok(/You get one of\s*Name Color Scroll \(3 Days\) ×1 50%\s*or\s*Scroll of Amplification ES \(S\) ×1 50%/.test(card1().querySelector('.ex-get').textContent), 'headline: one of two rewards, 50% each');
    const bound = [...card1().querySelectorAll('tr')].find(tr => /AMPESS/.test(tr.textContent)).querySelector('input[type=checkbox]');
    bound.checked = true; bound.dispatchEvent(new Event('change'));
    const bound2 = [...card1().querySelectorAll('tr')].find(tr => /AMPESS/.test(tr.textContent)).querySelector('input[type=checkbox]');
    bound2.checked = false; bound2.dispatchEvent(new Event('change'));
    ok(/II_SYS_SYS_SCR_AMPESS\t1\t500000\r\n/.test(S.ws.files.get('exchange_script.txt').text), 'Bound on then off leaves no "0" flag behind');
    ok(S.ws.newBlocking().length === 0, 'no blocking problems');
    if (STOP === 'exrecipe') return;
    click(btnByText(exEd().querySelectorAll('.ex-card')[7], 'Copy'));
    ok(exEd().querySelectorAll('.ex-card').length === 9, 'copy: 9 recipes');
    click(exList().find(n => /Rambo/.test(n.textContent)));
    click([...exEd().querySelectorAll('.tabs .ex-tab')].find(b => b.title.startsWith('MMI_COLOSSEUM_REWARD_MIX:')));
    const mix0 = S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLOSSEUM_REWARD_MIX');
    const second = mix0.sets[1].pay[0].item.name;
    click(exEd().querySelectorAll('.ex-card')[0].querySelector('button[title="Move down"]'));
    await waitFor(() => document.querySelector('.modal') && /Korean comments/.test(document.querySelector('.modal').textContent), 'rebuild notice for a recipe with Korean comments');
    click(btnByText(document.querySelector('.modal footer'), 'OK'));
    ok(S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLOSSEUM_REWARD_MIX').sets[0].pay[0].item.name === second, 'recipe moved down (Rambo, Korean comments rebuilt)');
    click($('btn-change-task'));
    await waitFor(() => document.querySelector('.modal') && /Unsaved changes/.test(document.querySelector('.modal').textContent), 'unsaved-changes question');
    click(btnByText(document.querySelector('.modal footer'), 'Cancel'));
    ok(S.task === 'npc' && S.ws.dirtyFiles().length === 1, 'Cancel keeps the task and the edits');
    click($('btn-save'));
    await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (exchange)');
    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent) && !/Client sync/.test(h.textContent)), 'save finished (exchange)');
    const exSrv = res.children.get('Exchange_Script.txt').bytes, exCli = clientDir.children.get('Exchange_Script.txt').bytes;
    ok(FRE.bytes.bytesEqual(exSrv, S.ws.files.get('exchange_script.txt').bytes), 'Exchange_Script.txt saved');
    ok(/_npc$/.test([...backups.children.keys()].pop()), 'backup folder is named after the task (..._npc)');
    ok(FRE.bytes.bytesEqual(exCli, lfOnly(exSrv)) && !FRE.bytes.bytesEqual(exCli, clientOriginal.get('Exchange_Script.txt')), 'Client copy got the same change, LF kept');
    document.querySelectorAll('.modal-back').forEach(m => m.remove());

    // folder detection: the test-data layout, and a wrong folder
    const td = new FakeDir('test-data'), tdRes = new FakeDir('Resource');
    tdRes.children.set('Masquerade.prj', new FakeFile('Masquerade.prj', new Uint8Array(0)));
    td.children.set('Resource', tdRes); td.children.set('Client', new FakeDir('Client'));
    const tl = await FRE.layout.detectLayout(td);
    ok(tl.kind === 'test' && tl.res === tdRes && tl.backups && td.children.has('backups'), 'test-data -> Resource + Client, backups created in it');
    let refused = false;
    try { await FRE.layout.detectLayout(new FakeDir('Desktop')); } catch (e) { refused = /not the source folder/.test(e.message); }
    ok(refused, 'a folder without Server/Resource is refused');
    if (STOP === 'end') click([...document.querySelectorAll('#list .npc')].find(n => /Collins/.test(n.textContent)));
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
