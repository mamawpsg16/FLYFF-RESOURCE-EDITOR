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
    ok(/REAL SERVER FILES/.test($('editor').textContent) && document.querySelectorAll('.task-card:not(:disabled)').length === 4, 'real-files tag; 4 tasks to pick');
    ok(!root.children.has('backups'), 'nothing created inside the source folder');
    if (STOP === 'start') return;
    await openTask('npc');
    ok(!document.body.classList.contains('start') && /Task:\s*NPC Shops/.test($('mode-tabs').textContent), 'NPC Shops task open');
    ok(S.client && S.client.dir === clientDir, 'Client copies attached automatically');
    ok(S.ws.items.rows.length === 8067, 'items loaded (8067)');
    ok(document.querySelectorAll('#list .npc').length === 6 && /Shops with editable items \(6\)/.test(document.querySelector('select.npc-filter').textContent), 'NPC list defaults to the 6 shops with editable items');
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
      if (STOP === 'newnpcform') return;
      click(document.getElementById('nn-create'));
      await waitFor(() => !document.querySelector('.newnpc'), 'form closed');
      ok(/In game after Save/.test($('editor').textContent) && /Stands on WdMadrigal at \/position 6966\.0, 100\.0, 3220\.0/.test($('editor').textContent) && /Tab 0 "General Goods": 1 item/.test($('editor').textContent),
        'the new NPC is selected and shows what the game will load');
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

    // ---- Donation Shop
    await openTask('donation');
    ok(S.mode === 'donation', 'Donation Shop mode');
    ok(/MaFl_DONATION/.test($('editor').textContent) && /Flaris — Flarine \/ Central Flarine/.test($('editor').querySelector('.where').textContent), 'Donation Shop: where Adrian (MaFl_DONATION) stands');
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
    await openTask('exchange');
    ok(!S.ws.isEditable('spec_item.txt') && !S.ws.isEditable('character.inc') && S.ws.clientFileNames().join() === 'Exchange_Script.txt', 'Exchanges task: only Exchange_Script.txt is editable and synced');
    ok(S.mode === 'exchange', 'Exchanges mode');
    ok(!document.querySelector('#list-extra select') && /9 exchange menus in the game/.test($('list-extra').textContent), 'no filter: only the 9 menus players can really use');
    ok(S.ws.moduleDiags.exchange.length === 0, 'hidden / unplaced menus are not checked (their old warnings are gone)');
    ok(document.querySelectorAll('#list .npc').length === 9 && ![...document.querySelectorAll('#list .npc')].some(n => /Bles|Brooks/.test(n.textContent)), 'only in-game NPCs listed (no Bles, no Brooks)');
    const exEd = () => $('editor');
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MMI_COLLECT01')));
    ok(/Collins/.test(exEd().querySelector('h2').textContent) && exEd().querySelectorAll('.ex-card').length === 8, 'Collins: 8 recipe cards');
    ok(/In game:/.test(exEd().querySelector('.ex-card').textContent), 'each card shows the in-game row');
    ok(btnByText(exEd().querySelector('.ex-card'), 'Remove Name Color Scroll (3 Days)') && /Exchange 1/.test(exEd().querySelector('.ex-label').textContent), 'the card is named by its reward: "Exchange 1", "Remove Name Color Scroll (3 Days)"');
    ok(/You get\s*Name Color Scroll \(3 Days\) ×1/.test(exEd().querySelector('.ex-get').textContent), 'card headline: what the player gets');
    ok(/Rewards/.test(exEd().querySelectorAll('.ex-section-title')[0].textContent) && /Costs/.test(exEd().querySelectorAll('.ex-section-title')[1].textContent), 'rewards first, then costs');
    ok([...exEd().querySelectorAll('.ex-npcs .ex-npc')].some(t => /Collins/.test(t.textContent) && /Flaris/.test(t.textContent) && /Saint Morning/.test(t.textContent) && /Darkon 1, 2/.test(t.textContent) && t.querySelectorAll('button.te').length === 3), 'Collins: his three spots (Flaris, Saint Morning, Darkon 1, 2) with /te');
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
    const colBadge = () => /edited/.test([...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MMI_COLLECT01')).textContent);
    ok(colBadge(), 'edit: Collins gets the "edited" badge');
    ok(/^Undo \(\d+\)$/.test($('btn-undo').textContent) && /MMI_COLLECT01/.test($('btn-undo').title), 'Undo shows how many edits the task has, and its tooltip names the step and the menu');
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
    ok(/Server uses/.test(card1().textContent) && [...card1().querySelectorAll('tr')].some(tr => /AMPESS/.test(tr.textContent) && [...tr.querySelectorAll('td')].some(td => td.textContent === '0%')), 'new reward after 100% gets chance 0 (kept by the server at 0%)');
    click(btnByText(card1(), 'Spread evenly'));
    ok(/sum 1,000,000 = 100%/.test(card1().textContent) && (card1().textContent.match(/50%/g) || []).length >= 2, 'spread evenly: 50% / 50%');
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
    click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MMI_COLOSSEUM_REWARD_MIX')));
    const mix0 = S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLOSSEUM_REWARD_MIX');
    const second = mix0.sets[1].pay[0].item.name;
    click(exEd().querySelectorAll('.ex-card')[0].querySelector('button[title="Move down"]'));
    await waitFor(() => document.querySelector('.modal') && /Korean comments/.test(document.querySelector('.modal').textContent), 'rebuild notice for a recipe with Korean comments');
    click(btnByText(document.querySelector('.modal footer'), 'OK'));
    ok(S.ws.models.exchange.menus.find(m => m.name === 'MMI_COLOSSEUM_REWARD_MIX').sets[0].pay[0].item.name === second, 'recipe moved down (Rambo, Korean comments rebuilt)');
    click($('btn-change-task'));
    await waitFor(() => document.querySelector('.modal') && /Unsaved changes/.test(document.querySelector('.modal').textContent), 'unsaved-changes question');
    click(btnByText(document.querySelector('.modal footer'), 'Cancel'));
    ok(S.task === 'exchange' && S.ws.dirtyFiles().length === 1, 'Cancel keeps the task and the edits');
    click($('btn-save'));
    await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (exchange)');
    click(btnByText(document, 'Back up and write'));
    await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent) && !/Client sync/.test(h.textContent)), 'save finished (exchange)');
    const exSrv = res.children.get('Exchange_Script.txt').bytes, exCli = clientDir.children.get('Exchange_Script.txt').bytes;
    ok(FRE.bytes.bytesEqual(exSrv, S.ws.files.get('exchange_script.txt').bytes), 'Exchange_Script.txt saved');
    ok(/_exchange$/.test([...backups.children.keys()].pop()), 'backup folder is named after the task (..._exchange)');
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
    if (STOP === 'end') click([...document.querySelectorAll('#list .npc')].find(n => n.textContent.includes('MMI_COLLECT01')));
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
