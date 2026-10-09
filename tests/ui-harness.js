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
  if (original.has('GuildBuff.txt')) clientDir.children.set('GuildBuff.txt', new FakeFile('GuildBuff.txt', original.get('GuildBuff.txt').slice()));
  for (const n of ['WeaponRarity.inc']) if (original.has(n)) clientDir.children.set(n, new FakeFile(n, original.get(n).slice()));
  if (original.has('s.txt')) clientDir.children.set('s.txt', new FakeFile('s.txt', lfOnly(original.get('s.txt'))));
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
  clientDir.children.set('propPackItem.inc', new FakeFile('propPackItem.inc', lfOnly(original.get('propPackItem.inc'))));
  {
    const items = new FakeDir('Item');
    for (const [n, b64] of Object.entries(FRE.HARNESS_ITEMS || {})) items.children.set(n, new FakeFile(n, Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    clientDir.children.set('Item', items);
  }
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
    FRE.dom.instant = true;      // the loading window must not wait for a paint (this harness runs in microtasks)
    await waitFor(() => FRE.app.state && $('btn-root'), 'app init');
    const S = FRE.app.state;
    ok(document.body.classList.contains('start') && /What do you want to edit/.test($('editor').textContent), 'start screen first');
    ok([...document.querySelectorAll('.task-card')].every(b => b.disabled), 'tasks wait for the folder');
    click($('btn-root'));
    await waitFor(() => S.layout, 'folder detected');
    // the cards are drawn after the patch check (io/patch-state.js reads one C++ file per patch)
    await waitFor(() => document.querySelector('.task-card:not(:disabled)'), 'task cards enabled');
    ok(S.layout.kind === 'real' && S.layout.res === res && S.layout.client === clientDir && !S.layout.backups, 'FLYFF-V19-SOURCE -> Server/Resource + Client, no folder created in it');
    ok(/REAL SERVER FILES/.test($('editor').textContent) && document.querySelectorAll('.task-card:not(:disabled)').length === 8 && document.querySelector('.task-card[data-task="upgrade"]') && !document.querySelector('.task-card[data-task="exchange"]') && document.querySelector('.task-card[data-task="drops"]') && document.querySelector('.task-card[data-task="boxes"]') && document.querySelector('.task-card[data-task="where"]') && document.querySelector('.task-card[data-task="rates"]'), 'real-files tag; 8 tasks to pick (exchanges are in NPC Shops; Monster Drops; Boxes; Item Sources & Uses; Rates & Buffs; Upgrade Rates)');
    ok(!root.children.has('backups'), 'nothing created inside the source folder');
    if (STOP === 'start') return;
    // opening a task shows a "Loading…" window at once (the real folder takes seconds) and closes it when done
    click(document.querySelector('.task-card[data-task="npc"]'));
    const card = document.querySelector('.task-card[data-task="npc"]'), lw = document.querySelector('.loading-back');
    ok(lw && /Opening NPC Shops/.test(lw.textContent) && /Finding the files/.test(lw.textContent), 'loading window shows at once, with the phase');
    ok(card && card.classList.contains('loading') && /Loading…/.test(card.textContent) && [...document.querySelectorAll('.task-card')].every(b => b.disabled) && $('btn-root').disabled, 'the clicked card says Loading…; the other cards and Choose another folder are greyed');
    const phases = new Set();
    const watch = new MutationObserver(() => { const e = document.querySelector('.loading-back .load-phase'); if (e) phases.add(e.textContent); });
    watch.observe($('modal-root'), { subtree: true, childList: true, characterData: true });
    await waitFor(() => S.task === 'npc' && S.ws && !S.busy, 'task npc');
    watch.disconnect();
    ok(!document.querySelector('.loading-back') && /NPC Shops: loaded from/.test($('toasts').textContent), 'loading window closed; the toast says it loaded');
    ok([...phases].some(t => /Reading the game client/.test(t)) || phases.size >= 2, `the window went through the phases (${[...phases].join(' | ')})`);
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
      // the key is made from the region + the name until it is typed by hand (the user, 2026-10-09)
      type('input[placeholder="Lumi"]', 'Lu mi');
      ok(form.querySelector('input[placeholder="MaFl_Lumi"]').value === 'MaFl_Lumi' && /MaFl_ is what \d+ NPCs in Flaris use/.test(form.textContent), 'name "Lu mi" in Flaris: key MaFl_Lumi, and the note says why');
      type('input[placeholder="MaFl_Lumi"]', 'MaFl_Lumi2'); type('input[placeholder="Lumi"]', 'Lumi');
      ok(form.querySelector('input[placeholder="MaFl_Lumi"]').value === 'MaFl_Lumi2' && /Typed by hand/.test(form.textContent) && btnByText(form, '↺ From region + name'), 'a typed key stays when the name changes; ↺ is offered');
      click(btnByText(form, '↺ From region + name'));
      ok(document.querySelector('.newnpc input[placeholder="MaFl_Lumi"]').value === 'MaFl_Lumi', '↺: back to region + name');
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
      // paste the /position chat line, then "Face toward" a second line (the user's in-game test, 2026-10-09)
      click($('editor').querySelector('.place-edit'));
      await waitFor(() => lastModalAny() && /^Change position \/ model: /.test(lastModalAny().querySelector('header').textContent), 'Peach dialog again');
      const pasteIn = (i, v) => { const el = lastModalAny().querySelectorAll('input.nn-paste')[i]; el.value = v; el.dispatchEvent(new Event('input')); };
      ok(lastModalAny().querySelectorAll('input.nn-paste').length === 2, 'two paste boxes: the spot and Face toward');
      pasteIn(0, 'hello');
      ok(/That is not a \/position line/.test(lastModalAny().textContent), 'a line that is not /position: ⛔ says so');
      const nx = p0.x + 4, nz = p0.z - 3;
      pasteIn(0, `[12:01] Position : x = ${nx.toFixed(6)}, y = ${p0.y.toFixed(6)}, z = ${nz.toFixed(6)}`);
      box = lastModalAny();
      ok(Math.abs(Number(box.querySelector('input[placeholder="x"]').value) - nx) < 0.01 && Math.abs(Number(box.querySelector('input[placeholder="z"]').value) - nz) < 0.01 && /Spot filled from your \/position line/.test(box.textContent), 'the pasted line fills x y z');
      pasteIn(1, `Position : x = ${(nx + 5).toFixed(6)}, y = ${p0.y.toFixed(6)}, z = ${nz.toFixed(6)}`);
      box = lastModalAny();
      ok(Number(box.querySelectorAll('input[type=number]')[3].value) === 90 && /Facing 90°/.test(box.textContent), 'Face toward a spot 5 to the east (+x): facing 90°');
      if (STOP === 'pospaste') { $('toasts').textContent = ''; return; }
      click(btnByText(box.querySelector('footer'), 'Apply changes'));
      const p2 = P();
      ok(Math.abs(p2.x - nx) < 0.01 && Math.abs(p2.z - nz) < 0.01 && Math.abs(p2.angle - 90) < 0.01, `written: x ${p2.x}, z ${p2.z}, facing ${p2.angle}`);
      click($('btn-undo'));
      ok(FRE.bytes.bytesEqual(S.ws.files.get(p0.file).serialize(), dyo0), 'Undo: the map file is back (after the paste)');
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

    // ---- Boxes (propGiftbox.inc + propPackItem.inc)
    await openTask('boxes');
    ok(S.mode === 'boxes' && document.querySelectorAll('#list .npc').length >= 600, 'Boxes: the box list (600 shown, search for more)');
    {
      // "What's inside": a second filter (the editor's item groups); counts follow the first filter
      const pickInside = re => {
        const ci = document.querySelector('#list-extra .bx-inside input');
        ci.dispatchEvent(new Event('focus')); ci.value = ''; ci.dispatchEvent(new Event('input'));
        [...document.querySelectorAll('#list-extra .combo-opt')].find(o => re.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      };
      ok(document.querySelectorAll('#list-extra select.npc-filter').length === 1 && document.querySelector('#list-extra .bx-inside'), 'Boxes: two filters (which boxes, what\'s inside)');
      const all = document.querySelectorAll('#list .npc').length;
      pickInside(/^Holds Fashion \(\d+\)$/);
      const nFash = +/Holds Fashion \((\d+)\)/.exec(document.querySelector('#list-extra .bx-inside input').value)[1];
      const m = S.ws.models.boxes, isBox = id => m.gift.boxes.has(id) || m.pack.boxes.has(id);
      const holds = x => FRE.itemCategory.holds(S.ws, x.lines.map(l => l.item.value >>> 0), isBox);
      const want = [...m.gift.boxes.values(), ...m.pack.boxes.values()].filter(b => holds(b).has('Fashion')).length;
      ok(nFash === want && document.querySelectorAll("#list .npc").length === Math.min(want, 600) && want < m.gift.boxes.size + m.pack.boxes.size, `"Holds Fashion" lists the ${want} boxes that give a fashion item`);
      pickInside(/^Hats \(\d+\)$/);
      const nHats = document.querySelectorAll('#list .npc').length;
      ok(nHats > 0 && nHats < Math.min(want, 600), 'a part (Hats) narrows it further');
      const sel = document.querySelector('#list-extra select.npc-filter');
      sel.value = 'set'; sel.dispatchEvent(new Event('change'));
      ok(/Holds Fashion|Hats \(\d+\)/.test(document.querySelector('#list-extra .bx-inside input').value) && [...document.querySelectorAll('#list .npc .k')].every(k => /^set ·/.test(k.textContent)), 'both filters together: sets that give a hat');
      sel.value = 'all'; sel.dispatchEvent(new Event('change'));
      pickInside(/^Anything inside$/);
      ok(document.querySelectorAll('#list .npc').length === all, '"Anything inside" shows every box again');
    }
    {
      const listSearch = $('list-search'), ed = () => $('editor');
      const g0 = S.ws.files.get('propgiftbox.inc').text, p0 = S.ws.files.get('proppackitem.inc').text;
      listSearch.value = 'II_SYS_SYS_EVE_POTION'; listSearch.dispatchEvent(new Event('input'));
      click(document.querySelector('#list .npc'));
      ok(/random box: the player gets 1 of 15/.test(ed().textContent) && /Total: 100%|add up to/.test(ed().textContent), 'a random box: 15 items and the total');
      await waitFor(() => document.querySelector('#list .bx-icon canvas'), 'box icons drawn from Client/Item');
      const row = k => [...ed().querySelectorAll('table.bx tr')][k + 1];
      const p1 = row(0).querySelector('input.pct-input');
      p1.value = '30'; p1.dispatchEvent(new Event('change'));
      ok(/II_SYS_SYS_SCR_STRONG_STA\t\t3000\t1\t2/.test(S.ws.files.get('propgiftbox.inc').text) && /Total: 100%/.test(ed().textContent), 'typing 30% writes 3000 (GiftBox3 steps) and the total stays 100%');
      ok(/^[^:]+: changed the chance of [^(]+\(was /.test(S.ws.history[S.ws.history.length - 1].label) && !/II_/.test(S.ws.history[S.ws.history.length - 1].label), 'undo label names the box and item in plain words');
      const mins = row(1).querySelector('input.dur-input');
      ok(row(1).querySelector('select.dur-unit').value === '1440', 'time limits are typed in days by default');
      mins.value = '7'; mins.dispatchEvent(new Event('change'));
      ok(/^GiftBox4 II_SYS_SYS_EVE_POTION/m.test(S.ws.files.get('propgiftbox.inc').text) && /7 days/.test(ed().textContent), 'a time limit typed in days (7) widens the box to GiftBox4');
      ok(/II_SYS_SYS_SCR_STRONG_INT\t\t\d+\t1\t2\t10080/.test(S.ws.files.get('propgiftbox.inc').text), '7 days are written as 10080 minutes');
      {
        const r2 = row(2), u = r2.querySelector('select.dur-unit');
        u.value = '60'; u.dispatchEvent(new Event('change'));
        const i2 = r2.querySelector('input.dur-input'); i2.value = '.5'; i2.dispatchEvent(new Event('change'));
        ok(/II_SYS_SYS_SCR_STRONG_DEX\t\t\d+\t1\t2\t30\r\n/.test(S.ws.files.get('propgiftbox.inc').text), '0.5 hours are written as 30 minutes');
        const r3 = () => row(3), i3 = r3().querySelector('input.dur-input');
        i3.value = '1.5'; i3.dispatchEvent(new Event('change'));
        ok(/II_SYS_SYS_SCR_STRONG_STR\t\t\d+\t1\t2\t2160\r\n/.test(S.ws.files.get('propgiftbox.inc').text) && r3().querySelector('select.dur-unit').value === '1440'
          && r3().querySelector('input.dur-input').value === '1.5', '1.5 days are written as 2160 and the field still says 1.5 days after the re-render');
      }
      // + Add an item
      click(btnByText(ed(), '+ Add an item'));
      await waitFor(() => lastModalAny() && /Add an item/.test(lastModalAny().querySelector('header').textContent), 'add form');
      const fm = lastModalAny(), add = () => fm.querySelector('#bx-add-btn');
      ok(add().disabled && /Still needs: the item/.test(fm.textContent), 'Add greyed until an item is picked');
      const ci = fm.querySelector('.combo input');
      ci.dispatchEvent(new Event('focus')); ci.value = 'II_GEN_MAT_MOONSTONE'; ci.dispatchEvent(new Event('input'));
      [...fm.querySelectorAll('.combo-opt')].find(o => /II_GEN_MAT_MOONSTONE\)/.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await waitFor(() => /Still needs: the time limit/.test(fm.textContent), 'the time limit is required');
      ok(add().disabled, 'Add greyed until the time limit is set');
      click(btnByText(fm, 'Permanent'));
      await waitFor(() => !add().disabled && /Players get it in/.test(fm.textContent), 'add form ready');
      ok(/= permanent/.test(fm.textContent), 'Permanent sets 0: "= permanent"');
      ok(/\+\tII_GEN_MAT_MOONSTONE/.test(fm.textContent), 'preview: the line that will be written');
      if (STOP === 'boxes') { $('toasts').textContent = ''; return; }
      click(add());
      ok(/the player gets 1 of 16/.test(ed().textContent), 'item added: 16 items');
      click(btnByText(ed(), 'Open it'));
      await waitFor(() => lastModalAny() && /opens in \d+ ms/.test(lastModalAny().textContent), 'open window');
      ok(/The player reads/.test(lastModalAny().textContent) && /% of opens/.test(lastModalAny().textContent), 'open window: what the player reads, rates per item');
      if (STOP === 'boxesopen') { $('toasts').textContent = ''; return; }
      click(btnByText(lastModalAny().querySelector('footer'), 'Close'));
      // a set
      listSearch.value = 'II_SYS_SYS_SCR_BXCHANGE'; listSearch.dispatchEvent(new Event('input'));
      click(document.querySelector('#list .npc'));
      ok(/set: the player gets all 2 items/.test(ed().textContent) && /needs 2 free bag slots/.test(ed().textContent), 'a set: all items, the bag slots it needs');
      click(btnByText(ed(), 'Remove contents'));
      await waitFor(() => lastModalAny() && /Remove contents/.test(lastModalAny().querySelector('header').textContent), 'remove window');
      click(btnByText(lastModalAny().querySelector('footer'), 'Remove contents'));
      ok(S.ws.diags.some(d => d.code === 'BX_EMPTIED'), 'removing the contents warns: players who own it can no longer open it');
      while (S.ws.history.length) click($('btn-undo'));
      ok(S.ws.files.get('propgiftbox.inc').text === g0 && S.ws.files.get('proppackitem.inc').text === p0 && !S.ws.dirtyFiles().length, 'every edit undone');

      // + New box (J part 2): one form, Try it, Create = one undo step over six files
      const pickIn = async (root, combo, text, re) => {
        const ci = combo.querySelector('input');
        ci.dispatchEvent(new Event('focus')); ci.value = text; ci.dispatchEvent(new Event('input'));
        await waitFor(() => [...root.querySelectorAll('.combo-opt')].some(x => re.test(x.textContent)), 'combo option ' + text);
        [...root.querySelectorAll('.combo-opt')].find(x => re.test(x.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      };
      click(btnByText(document, '+ New box'));
      await waitFor(() => lastModalAny() && /New box/.test(lastModalAny().querySelector('header').textContent), 'new box form');
      const nf = lastModalAny();
      const create = () => nf.querySelector('#nb-create');
      ok(create().disabled && /Fill in the fields/.test(nf.textContent), 'Create greyed until the form is filled');
      const nameIn = nf.querySelector('input[data-key="nb|name"]');
      nameIn.value = 'Harness Box'; nameIn.dispatchEvent(new Event('input'));
      await pickIn(nf, nf.querySelector('table.bx .combo'), 'II_GEN_MAT_MOONSTONE', /II_GEN_MAT_MOONSTONE\)/);
      const lookCombo = () => [...nf.querySelectorAll('.combo')].find(c => /box look/.test(c.querySelector('input').placeholder));
      await pickIn(nf, lookCombo(), 'Itm_SysSysScrBxLuck', /look — used by/);
      await waitFor(() => !create().disabled, 'Create enabled');
      ok(/\/createitem 31671 1/.test(nf.textContent) && /GiftBox\tII_SYS_SYS_SCR_HARNESS_BOX/.test(nf.textContent) && /#define\tII_SYS_SYS_SCR_HARNESS_BOX\t\t\t31671/.test(nf.textContent),
        'preview: item 31671, the #define, the GiftBox block');
      ok(/SysSysScrBxCom/.test(nf.textContent) && /IDS_PROPITEM_TXT_017062\tHarness Box/.test(nf.textContent), 'preview: the ground model line and the name line');
      await waitFor(() => [...nf.querySelectorAll('.bx-tt')].some(t => /Harness Box/.test(t.textContent)), 'the tooltip of the planned box');
      ok([...nf.querySelectorAll('.bx-tt')].some(t => /Moonstone/.test(t.textContent) && /Penya price/.test(t.textContent)), 'the picked item\'s tooltip shows in the form');
      click(btnByText(nf.querySelector('footer'), 'Try it'));
      await waitFor(() => lastModalAny() !== nf && /not created yet/.test(lastModalAny().querySelector('header').textContent) && /opens in \d+ ms/.test(lastModalAny().textContent), 'Try it window');
      ok(/Moonstone/.test(lastModalAny().textContent) && !S.ws.dirtyFiles().length, 'Try it opens the planned box; nothing in the workspace changed');
      click(btnByText(lastModalAny().querySelector('footer'), 'Close'));
      if (STOP === 'newbox') { $('toasts').textContent = ''; return; }
      click(create());
      ok(S.ws.history.length === 1 && /new box Harness Box/.test(S.ws.history[0].label || S.ws.files.get('spec_item.txt')._undo.slice(-1)[0].label), 'Create: one undo step');
      ok(['defineitem.h', 'spec_item.txt', 'propitem.txt.txt', 'mdldyna.inc', 'propgiftbox.inc'].every(n => S.ws.files.get(n).dirty), 'six-file box: defineItem.h, Spec_Item.txt, propItem.txt.txt, mdlDyna.inc, propGiftbox.inc changed');
      ok(/Harness Box/.test(ed().textContent) && /the player gets 1 of 1/.test(ed().textContent) && S.ws.newBlocking().length === 0, 'the new box is selected, no new problem');
      // ✎ Edit box settings
      click(btnByText(ed(), 'Edit box settings'));
      await waitFor(() => lastModalAny() && /Edit box settings: Harness Box/.test(lastModalAny().querySelector('header').textContent), 'settings dialog');
      const sf = lastModalAny();
      ok(sf.querySelector('#bxs-apply').disabled && /No change yet/.test(sf.textContent), 'settings: Apply greyed while nothing changes');
      const tradeBox = [...sf.querySelectorAll('input[type=checkbox]')][0];
      tradeBox.checked = false; tradeBox.dispatchEvent(new Event('change'));
      await waitFor(() => !sf.querySelector('#bxs-apply').disabled && /cannot trade it/.test(sf.textContent), 'settings ready');
      if (STOP === 'boxsettings') { $('toasts').textContent = ''; return; }
      click(sf.querySelector('#bxs-apply'));
      ok(/cannot be traded/.test(ed().textContent) && !FRE.itemOps.isTradeable(S.ws, S.ws.itemById(31671)).tradeable, 'settings applied: the box cannot be traded');
      while (S.ws.history.length) click($('btn-undo'));
      ok(!S.ws.dirtyFiles().length && !S.ws.itemById(31671), 'Undo removes the new box from every file');
      listSearch.value = ''; listSearch.dispatchEvent(new Event('input'));
    }

    // ---- Where is this item from? (task H)
    {
      await openTask('where');
      const ed = () => $('editor'), search = $('list-search');
      ok(S.mode === 'where' && S.ws.editable.size === 0 && $('btn-save').disabled && /Pick an item/.test(ed().textContent), 'Where is this item from?: read-only task, asks for an item');
      ok(!S.client || !S.client.models, 'the where task does not list Client/Model');
      search.value = 'II_SYS_SYS_SCR_AWAKE'; search.dispatchEvent(new Event('input'));
      const row = [...document.querySelectorAll('#list .npc')].find(n => /II_SYS_SYS_SCR_AWAKE\b/.test(n.textContent));
      ok(!!row, 'search by define lists the item');
      click(row);
      ok(/🛒 Bought from an NPC \(2\)/.test(ed().textContent) && /Peach/.test(ed().textContent) && /100,000 Penya/.test(ed().textContent) && /auto/.test(ed().textContent), 'Scroll of Awakening: Peach and Raya, 100,000 Penya (auto rule rows)');
      ok(/Found in a random box/.test(ed().textContent) && /In a set/.test(ed().textContent), 'boxes and sets that give it');
      // the + of the item list on the right shows an item too
      const isearch = $('item-search');
      isearch.value = 'II_CHP_RED'; isearch.dispatchEvent(new Event('input'));
      const redRow = () => [...document.querySelectorAll('#item-list .item')].find(r => r.querySelector('.def') && r.querySelector('.def').textContent === 'II_CHP_RED');
      await waitFor(() => redRow(), 'item list: Red Chip');
      click(redRow().querySelector('button'));
      ok(/🏆 Battle Pass reward \(5\)/.test(ed().textContent) && /⚔️ Dropped by/.test(ed().textContent) && /of kills/.test(ed().textContent), 'Red Chip (+ on the right): Battle Pass levels and the monsters that drop it, with the chance');
      isearch.value = ''; isearch.dispatchEvent(new Event('input'));
      if (STOP === 'where') { $('toasts').textContent = ''; return; }
      // part 2: gifts and Guild Siege prizes
      ok(/🏰 Guild Siege, after each siege \(top 3 guilds\)/.test(ed().textContent) && /189 each/.test(ed().textContent) && /🏰 Guild Siege, every week/.test(ed().textContent) && /3,000/.test(ed().textContent),
        'Red Chip: the per-siege table (3 guilds: 189 each for rank 1) and the weekly ladders');
      const pick = def => { search.value = def; search.dispatchEvent(new Event('input')); click([...document.querySelectorAll('#list .npc')].find(n => new RegExp(def + '\\b').test(n.textContent))); };
      pick('II_SYS_SYS_EVE_CHRISTMASCAKE01');
      ok(/🎂 Level-up gift \(1\)/.test(ed().textContent) && /level 105/.test(ed().textContent) && /2 times per character/.test(ed().textContent) && /\+1 after every rebirth/.test(ed().textContent)
        && /given 2 times before the first rebirth/.test(ed().textContent), 'Christmas Cake: level 105 gift, 2 times per character, +1 per rebirth, with the note');
      pick('II_PET_DOG1');
      ok(/never given/.test(ed().textContent) && /automatic Master → Hero change/.test(ed().textContent) && /once per character/.test(ed().textContent), 'Pet Dog: the level 121 gift is never given (InitLevel), the level 15 one once');
      pick('II_ARM_S_CLO_CLO_SPIRIT_1');
      ok(/♻️ Rebirth gift \(1\)/.test(ed().textContent) && /rebirth 20/.test(ed().textContent), 'Cloak of Bravery: the rebirth 20 gift');
      pick('II_SYS_SYS_SCR_BXMWED01_1');
      ok(/💞 Couple gift \(1\)/.test(ed().textContent) && /level 21/.test(ed().textContent) && /the male partner/.test(ed().textContent) && /by mail/.test(ed().textContent), 'the male wedding box: couple level 21, male partner, by mail');
      if (STOP === 'wheregifts') { $('toasts').textContent = ''; return; }
      // Open in …: the other task opens at that NPC; coming back shows the same item
      search.value = 'II_SYS_SYS_SCR_AWAKE'; search.dispatchEvent(new Event('input'));
      click([...document.querySelectorAll('#list .npc')].find(n => /II_SYS_SYS_SCR_AWAKE\b/.test(n.textContent)));
      click(btnByText(ed().querySelector('.wh-sec'), 'Open in NPC Shops'));
      await waitFor(() => S.task === 'npc' && S.ws && !S.busy, 'jump to NPC Shops');
      const npcMod = FRE.ui.modules.find(m => m.id === 'npc');
      ok(/MaEw_Raya|MaFl_Peach/.test(npcMod.st.sel) && /Awakening|AWAKE/i.test(ed().textContent), 'Open in NPC Shops: the NPC that sells it is selected');
      await openTask('where');
      ok(/🛒 Bought from an NPC/.test(ed().textContent) && FRE.ui.modules.find(m => m.id === 'where').st.id === S.ws.defines.defines.get('II_SYS_SYS_SCR_AWAKE'), 'back in Where is this item from?: the same item');
      search.value = ''; search.dispatchEvent(new Event('input'));
    }

    // ---- Rates & Buffs (task I part 1)
    {
      await openTask('rates');
      const ed = () => $('editor'), sec = id => click(document.querySelector(`#list .npc[data-sec="${id}"]`));
      ok(S.mode === 'rates' && /Server rates/.test(ed().textContent) && /×30/.test(ed().textContent) && /Drop roll gate/.test(ed().textContent) && /Item chance/.test(ed().textContent),
        'Rates & Buffs opens on the server rates: EXP ×30, both drop numbers explained');
      const pieceBox = ed().querySelector('input[data-key="rt|0|piece"]');
      ok(!!pieceBox && pieceBox.value === '', 'Server Rates: "Item chance ×" not set yet (empty box)');
      pieceBox.value = '2'; pieceBox.dispatchEvent(new Event('change'));
      ok(/SetPieceItemDropRate\( 2 \)/.test(S.ws.files.get('event.lua').text) && S.ws.models.rates.events.active.piece === 2, 'typing 2 adds SetPieceItemDropRate( 2 ) to the event');
      const expBox = ed().querySelector('input[data-key="rt|0|exp"]');
      expBox.value = '40'; expBox.dispatchEvent(new Event('change'));
      ok(S.ws.models.rates.events.active.exp === 40 && /EXP ×40/.test(document.querySelector('#list').textContent), 'EXP 30 -> 40: the list shows ×40');
      const gate = ed().querySelector('input[data-key="rt|0|item"]');
      gate.value = '20'; gate.dispatchEvent(new Event('change'));
      ok(/changes nothing/.test(ed().textContent) && S.ws.diags.some(d => d.code === 'RT_GATE_NO_EFFECT'), 'gate ×20: ⚠ "above ×10 changes nothing"');
      click($('btn-undo'));
      ok(S.ws.models.rates.events.active.item === 10, 'Undo puts the gate back to ×10');
      sec('server');
      ok(/Server Buff/.test(ed().textContent) && ed().querySelectorAll('input[data-key$="|tier"]').length === 20 && ed().querySelectorAll('input[data-key^="rt|sb|0|adj"]').length === 5, 'Server Buff: 20 tiers, 5 stat slots each (buff-stats.diff layout)');
      {
        const pick = ed().querySelector('input[data-key="rt|sb|0|adj0"]').closest('tr').querySelector('.combo input');
        pick.dispatchEvent(new Event('focus')); pick.value = 'DST_STR'; pick.dispatchEvent(new Event('input'));
        [...ed().querySelectorAll('.combo-opt')].find(o => /— DST_STR$/.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        ok(/\t1  10   5  \d+ 1  0 0/.test(S.ws.files.get('serverbuff.txt').text) && S.ws.models.rates.server.tiers[0].bonus[0].dst.value > 0, 'Server Buff tier 1: pick STR in slot 1 -> written as a number, amount 1');
        click($('btn-undo'));
      }
      click(btnByText(ed(), '+ Add tier'));
      await waitFor(() => lastModalAny() && /Add a tier/.test(lastModalAny().textContent), 'add tier form');
      ok(/\+\s*21\s+210\s+105/.test(lastModalAny().querySelector('pre.preview').textContent), 'the form proposes tier 21 at 210 players, +105%');
      click(lastModalAny().querySelector('#rt-add-btn'));
      ok(S.ws.models.rates.server.tiers.length === 21, 'Add: tier 21 written');
      sec('guild');
      ok(/Tier 5/.test(ed().textContent) && !/does not match the stats/.test(ed().textContent) && ed().querySelectorAll('input[data-key^="rt|gb|0|adj"]').length === 8, 'Guild Buff: 5 tiers with 8 stat slots, descriptions match their stats');
      const adj = ed().querySelector('input[data-key="rt|gb|0|adj0"]');
      adj.value = '12'; adj.dispatchEvent(new Event('change'));
      ok(/does not match the stats/.test(ed().textContent), 'All Stat 10 -> 12: ⚠ the description no longer matches');
      click(btnByText(ed(), 'Write description from stats'));
      await waitFor(() => lastModalAny() && /Edit description/.test(lastModalAny().textContent), 'describe dialog');
      click(btnByText(lastModalAny().querySelector('footer'), 'Apply changes'));
      ok(/"All Stat \+12, Atk \+3%, HP \+3%, EXP \+10%"/.test(S.ws.files.get('guildbuff.txt').text), 'Write description from stats: "All Stat +12, …"');
      if (STOP === 'rates') { $('toasts').textContent = ''; return; }
      sec('calc');
      ok(/EXP factor/.test(ed().textContent) && /EXP per kill/.test(ed().textContent) && /×40 Event\.lua EXP/.test(ed().textContent) && /Penya per kill/.test(ed().textContent),
        'calculator: the factor steps (×40 from the edit), EXP and Penya per kill');
      if (STOP === 'ratescalc') { $('toasts').textContent = ''; return; }
      // part 2: level-up gifts
      sec('levelup');
      ok(/Level-up gifts/.test(ed().textContent) && /Level Up Rewards/.test(ed().textContent) && ed().querySelectorAll('.rt-card table.rt tr').length === 11, 'Level-up gifts: the running event with its 10 gifts');
      ok(/⚠ never/.test(ed().textContent) && /2 times, \+1 per rebirth/.test(ed().textContent), 'level 121: ⚠ never; level 75: "2 times, +1 per rebirth"');
      click(btnByText(ed(), '+ Add a gift'));
      await waitFor(() => lastModalAny() && /Add a level-up gift/.test(lastModalAny().querySelector('header').textContent), 'gift form');
      {
        const fm = lastModalAny(), add = () => fm.querySelector('#rt-gift-btn');
        ok(add().disabled && /Still needs: the level/.test(fm.textContent) && /Still needs: the time limit/.test(fm.textContent), 'Add greyed: level, item and time limit needed');
        const lv = fm.querySelector('input[data-key="rt|gift|lv"]'); lv.value = '50'; lv.dispatchEvent(new Event('input')); lv.dispatchEvent(new Event('change'));
        const ci = fm.querySelector('.combo input');
        ci.dispatchEvent(new Event('focus')); ci.value = 'II_GEN_MAT_MOONSTONE'; ci.dispatchEvent(new Event('input'));
        [...fm.querySelectorAll('.combo-opt')].find(o => /II_GEN_MAT_MOONSTONE\)/.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        const n = fm.querySelector('input[data-key="rt|gift|n"]'); n.value = '2'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change'));
        const d = fm.querySelector('input[data-key="rt|gift|m"]'); d.value = '1'; d.dispatchEvent(new Event('change'));
        await waitFor(() => !add().disabled, 'gift form ready');
        ok(/SetLevelUpGift\( 50,  "all", "II_GEN_MAT_MOONSTONE", 2, 2, 1440 \)/.test(fm.querySelector('pre.preview').textContent), 'preview: the Lua line (bound, 1 day = 1440 minutes)');
        click(add());
      }
      const lt = S.ws.files.get('event.lua').text;
      ok(/HOLD", 3, 2, 0 \)\r\n(?:.*\r\n)\tSetLevelUpGift\( 50,  "all", "II_GEN_MAT_MOONSTONE", 2, 2, 1440 \)\r\n\tSetLevelUpGift\( 60,/.test(lt), 'Add: the line goes in level order (after 45, before 60), CRLF kept');
      const pen = [...ed().querySelectorAll('tr')].find(r => /II_PET_DOG1/.test(r.textContent) && /^15/.test(r.textContent.trim()));
      click(pen.querySelector('button.icon:not(.danger)'));
      await waitFor(() => lastModalAny() && /Edit level-up gift: Level 15/.test(lastModalAny().querySelector('header').textContent), 'edit gift dialog');
      {
        const fm = lastModalAny();
        ok(fm.querySelector('#rt-gift-btn').disabled && /Nothing changed yet/.test(fm.textContent), 'Edit: Apply greyed until something changes');
        click(btnByText(fm, 'Permanent'));
        await waitFor(() => !fm.querySelector('#rt-gift-btn').disabled, 'edit ready');
        click(fm.querySelector('#rt-gift-btn'));
      }
      ok(/SetLevelUpGift\( 15,  "all", "II_PET_DOG1", 1, 2, 0 \)/.test(S.ws.files.get('event.lua').text), 'Edit level 15: Permanent writes 0 minutes');
      if (STOP === 'levelgifts') { $('toasts').textContent = ''; return; }
      // part 2: rebirth
      sec('rebirth');
      ok(/Rebirth/.test(ed().textContent) && /not used by the server/.test(ed().textContent) && ed().querySelectorAll('table.rt tr').length === 22, 'Rebirth: tiers 0-20, Drop / Penya greyed "not used by the server"');
      const gp5 = ed().querySelector('input[data-key="rt|rb|5|gp"]'); gp5.value = '35'; gp5.dispatchEvent(new Event('change'));
      ok(S.ws.diags.some(d => d.code === 'RT_REB_GP_DOWN'), 'tier 5: 50 -> 35 bonus points: ⚠ fewer than tier 4');
      click($('btn-undo'));
      const ex10 = ed().querySelector('input[data-key="rt|rb|10|exp"]'); ex10.value = '1.1'; ex10.dispatchEvent(new Event('change'));
      ok(S.ws.models.rates.rebirth.rates[10].exp === 1.1 && /\t1\.10\t/.test(S.ws.files.get('1rebirth.inc').text), 'rebirth 10: EXP ×1.1 written as 1.10');
      const row10 = [...ed().querySelectorAll('tr')].find(r => /^rebirth 10/.test(r.textContent.trim()));
      click(btnByText(row10, '+ Gift'));
      await waitFor(() => lastModalAny() && /Add a gift: Rebirth 10/.test(lastModalAny().querySelector('header').textContent), 'rebirth gift form');
      {
        const fm = lastModalAny();
        const ci = fm.querySelector('.combo input');
        ci.dispatchEvent(new Event('focus')); ci.value = 'II_CHP_RED'; ci.dispatchEvent(new Event('input'));
        [...fm.querySelectorAll('.combo-opt')].find(o => /\(II_CHP_RED\)/.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        const n = fm.querySelector('input[data-key="rt|rbg|n"]'); n.value = '50'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change'));
        await waitFor(() => !fm.querySelector('#rt-rbg-btn').disabled, 'rebirth gift ready');
        click(fm.querySelector('#rt-rbg-btn'));
      }
      ok(S.ws.models.rates.rebirth.gifts.get(10) && S.ws.models.rates.rebirth.gifts.get(10).num === 50 && /\t10\tII_CHP_RED\t\t50\r?\n\t20\t/.test(S.ws.files.get('1rebirth.inc').text), 'rebirth 10 gift: Red Chips ×50, above the tier 20 row');
      sec('calc');
      const rbSel = [...ed().querySelectorAll('select')].find(x => [...x.options].some(o => o.textContent === 'rebirth 10'));
      rbSel.value = '10'; rbSel.dispatchEvent(new Event('change'));
      ok(/×1\.1\d* rebirth 10/.test(ed().textContent), 'calculator at rebirth 10 shows ×1.1');
      ok(S.ws.dirtyFiles().some(f => /1rebirth/i.test(f.name)) , '1Rebirth.inc is to be saved');
      if (STOP === 'rebirth') { $('toasts').textContent = ''; return; }
      // part 3: couple
      sec('couple');
      ok(/Time per level/.test(ed().textContent) && /row 22 \(end of 21\)/.test(ed().textContent), 'Couple: Time per level, row 22 shown as the end of level 21');
      const p2 = ed().querySelector('input[data-key="rt|cp|exp|1"]'); p2.value = '1440'; p2.dispatchEvent(new Event('change'));
      ok(S.ws.models.rates.couple.exp[1].value === 1440 && /\t1440 \t\/\/ 2\r\n/.test(S.ws.files.get('couple.inc').text), 'level 2: 2,880 -> 1,440 points, the comment and CRLF kept');
      click(ed().querySelector('button[data-ctab="buffs"]'));
      const t8 = ed().querySelector('select[data-key="rt|cp|tier|8|0"]'); t8.value = '2'; t8.dispatchEvent(new Event('change'));
      ok(S.ws.models.rates.couple.perLevel.own[8] && /\t6\t1\t0\t0\r\n\t8\t2\t0\t0\r\n\t11\t/.test(S.ws.files.get('couple.inc').text), 'level 8 (greyed, from level 6): Power tier 2 -> its own row, in level order');
      ok(/Attack \+5%/.test([...ed().querySelectorAll('tr')].find(r => /^level 9/.test(r.textContent.trim())).textContent), 'level 9 now copies level 8: Attack +5%');
      click(ed().querySelector('button[data-ctab="gifts"]'));
      click(btnByText(ed(), '+ Add a couple gift'));
      await waitFor(() => lastModalAny() && /Add a couple gift/.test(lastModalAny().querySelector('header').textContent), 'couple gift form');
      {
        const fm = lastModalAny();
        const lv = fm.querySelector('input[data-key="rt|cpg|lv"]'); lv.value = '3'; lv.dispatchEvent(new Event('input')); lv.dispatchEvent(new Event('change'));
        const ci = fm.querySelector('.combo input');
        ci.dispatchEvent(new Event('focus')); ci.value = 'II_CHP_RED'; ci.dispatchEvent(new Event('input'));
        [...fm.querySelectorAll('.combo-opt')].find(o => /\(II_CHP_RED\)/.test(o.textContent)).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        const sx = fm.querySelector('select[data-key="rt|cpg|sex"]'); sx.value = '1'; sx.dispatchEvent(new Event('change'));
        const n = fm.querySelector('input[data-key="rt|cpg|n"]'); n.value = '5'; n.dispatchEvent(new Event('input')); n.dispatchEvent(new Event('change'));
        click(btnByText(fm, 'Permanent'));
        await waitFor(() => !fm.querySelector('#rt-cpg-btn').disabled, 'couple gift ready');
        ok(/the female partner gets/.test(fm.textContent), 'preview: the female partner gets it by mail');
        click(fm.querySelector('#rt-cpg-btn'));
      }
      ok(/II_SYS_SYS_EVE_WINGS\tSEX_SEXLESS\t2\t0\t10\r\n\t\tII_CHP_RED\tSEX_FEMALE\t2\t0\t5\r\n/.test(S.ws.files.get('couple.inc').text), 'couple level 3: Red Chips ×5 for the female partner, under the Wings row');
      click(ed().querySelector('button[data-ctab="tiers"]'));
      ok(ed().querySelectorAll('.rt-card').length === 8 && /6 slots/.test(ed().textContent), 'Buff tiers: 8 cards (4 Power, 3 Blessing, 1 Miracle), 6 stat slots each');
      click(btnByText(ed().querySelector('.rt-card'), ' Write description from stats'));
      await waitFor(() => lastModalAny() && /Edit description: Power of Love tier 1/.test(lastModalAny().querySelector('header').textContent), 'description dialog');
      click(btnByText(lastModalAny(), 'Apply changes'));
      ok(S.ws.diags.filter(d => d.code === 'CP_DESC').length === 7 && /Attack \+3% while your partner is online\./.test(S.ws.files.get('propitem.txt.txt').text), 'Power of Love tier 1: description written from the stats; 7 tiers left');
      ok(['couple.inc', 'propItem.txt.txt'].every(n => S.ws.dirtyFiles().some(f => f.name === n)), 'couple.inc and propItem.txt.txt are to be saved');
      if (STOP === 'couple') { $('toasts').textContent = ''; return; }
      while (S.ws.history.length) click($('btn-undo'));
      ok(!S.ws.dirtyFiles().length, 'Undo all: nothing left to save');
    }

    // ---- Upgrade Rates (K part 1)
    {
      await openTask('upgrade');
      const ed = () => $('editor'), sec = id => click(document.querySelector(`#list .npc[data-sec="${id}"]`));
      ok(S.mode === 'upgrade' && /Normal upgrade/.test(ed().textContent) && /14\.64/.test(ed().innerHTML + [...ed().querySelectorAll('input')].map(i => i.value).join(' ')), 'Upgrade Rates opens on Normal upgrade: +3 → +4 shows the real 14.64%');
      const box = ed().querySelector('input[data-key="up|general|3"]');
      ok(box && box.value === '14.64', 'the +3 box holds the real chance (file 1626, ×0.9, +1)');
      box.value = '25'; box.dispatchEvent(new Event('change'));
      ok(/tGeneral = \{ 3251, 3251, 2276, 2777,/.test(S.ws.files.get('itemupgrade.lua').text), '25% written as 2777 (×0.9 = 2499, +1 = 25.00%)');
      ok(/easier than/.test(ed().textContent), '⚠ +3 → +4 now easier than +2 → +3');
      {
        const b0 = () => ed().querySelector('input[data-key="up|general|0"]');
        b0().value = '4'; b0().dispatchEvent(new Event('change'));
        b0().value = '40'; b0().dispatchEvent(new Event('change'));
        const last = [...$('toasts').children].pop();
        ok(last && /\+0 → \+1 40% \(was 32\.52%\)/.test(last.textContent), 'typing 4 then 40 = one step; the toast says 40% (was 32.52%)');
        click($('btn-undo'));
        ok(/tGeneral = \{ 3251,/.test(S.ws.files.get('itemupgrade.lua').text), '… one Undo goes back to 32.52%');
      }
      sec('acc');
      ok(/Safe window/.test(ed().textContent) && ed().querySelectorAll('input[data-key^="up|acc|"]').length === 20, 'Accessory: 20 steps with the safe-window chance');
      sec('ult');
      ok(/Ultimate weapon \+1 → \+10/.test(ed().textContent) && /dwReferTarget2/.test(ed().textContent) && /used by 0 of them/.test(ed().textContent), 'Ultimate: transforms, General → Unique line used by none (own chances)');
      sec('rarity');
      ok([...ed().querySelectorAll('input')].some(i => i.value === 'Mythic') && /Total: 100%/.test(ed().textContent), 'Weapon Rarity: 6 tiers, total 100%');
      const luck = ed().querySelector('input[data-key="up|wr|6|luck"]'); luck.value = '2'; luck.dispatchEvent(new Event('change'));
      ok(/not 100/.test(ed().textContent), 'Mythic 1 → 2%: ⚠ the total is not 100');
      if (STOP === 'upgrade') { $('toasts').textContent = ''; return; }
      sec('calc');
      ok(/Per finished item/.test(ed().textContent), 'calculator: per finished item');
      click(btnByText(ed(), 'Run'));
      ok(/items: /.test(ed().textContent) && /reached/.test(ed().textContent), '🎲 Run: the totals');
      if (STOP === 'upgradecalc') { $('toasts').textContent = ''; return; }
      while (S.ws.history.length) click($('btn-undo'));
      ok(!S.ws.dirtyFiles().length, 'Undo all: nothing left to save');
      // ---- K part 2: Upgrade fees (UpgradeFees.lua does not exist yet: the first change makes it, Save creates it)
      sec('fees');
      ok(/upgrade-fees\.diff/.test(ed().textContent) && /made on the first change/.test(ed().textContent), 'Upgrade fees: the patch note and "UpgradeFees.lua · made on the first change"');
      const fb = k => ed().querySelector(`input[data-key="up|fee|${k}"]`);
      ok(fb('nPiercingPenya') && fb('nPiercingPenya').value.replace(/,/g, '') === '100000' && fb('nRemovePiercingPenya').value.replace(/,/g, '') === '1000000', 'five fee boxes: piercing 100,000, remove a card 1,000,000');
      ok(/100,000 Penya will be paid/.test(ed().textContent), 'the remove-element text is shown');
      fb('nPiercingPenya').value = '25000'; fb('nPiercingPenya').dispatchEvent(new Event('change'));
      fb('nPiercingPenya').value = '250000'; fb('nPiercingPenya').dispatchEvent(new Event('change'));
      const fl = S.ws.files.get('upgradefees.lua');
      ok(/^-- UpgradeFees\.lua/.test(fl.text) && /\r\nnPiercingPenya = 250000\r\n$/.test(fl.text) && S.ws.history.length === 1, 'typing 25000 then 250000: one step, the new file holds the header + nPiercingPenya = 250000');
      ok(/250,000 Penya \(was 100,000\)/.test([...$('toasts').children].pop().textContent), '… the toast says 250,000 Penya (was 100,000)');
      fb('nRemoveAttributePenya').value = '50000'; fb('nRemoveAttributePenya').dispatchEvent(new Event('change'));
      ok(/And 50,000 Penya will be paid/.test(S.ws.strings.map.get('IDS_TEXTCLIENT_INC_001814')) && S.ws.history.length === 2, 'remove element 50,000: the text says 50,000 Penya in the same step');
      ok(ed().querySelector('button') && [...ed().querySelectorAll('button')].some(b => /↺ 100,000/.test(b.textContent)), '↺ 100,000 puts a fee back');
      sec('pierce');
      ok(/250,000 Penya every try/.test(ed().textContent), 'Piercing says 250,000 Penya every try');
      if (STOP === 'upgradefees') { sec('fees'); $('toasts').textContent = ''; return; }
      click($('btn-save'));
      await waitFor(() => btnByText(document, 'Back up and write'), 'review dialog (fees)');
      const rv = document.querySelector('.modal').textContent;
      { const hd = [...document.querySelectorAll('.modal h3')].find(x => x.textContent === 'UpgradeFees.lua'), d = hd && hd.nextElementSibling;
        ok(d && d.querySelector('.add') && !d.querySelector('.del'), 'review: the new file shows only + lines (no empty "1 -" line)'); }
      ok(/UpgradeFees\.lua/.test(rv) && /upgrade-fees\.diff/.test(rv) && /WorldServer project and the Neuz project/.test(rv), 'review: UpgradeFees.lua and "build the WorldServer and Neuz with upgrade-fees.diff"');
      click(btnByText(document, 'Back up and write'));
      await waitFor(() => [...document.querySelectorAll('.modal header')].some(h => /^Saved|failed/.test(h.textContent)), 'save finished (fees)');
      const nf = res.children.get('UpgradeFees.lua');
      ok(nf && /nPiercingPenya = 250000\r\n/.test(new TextDecoder().decode(nf.bytes)) && fl.handle === nf && !fl.serverNew, 'Saved: UpgradeFees.lua created in Server/Resource');
      ok(!S.client || (clientDir.children.get('UpgradeFees.lua') && FRE.bytes.bytesEqual(clientDir.children.get('UpgradeFees.lua').bytes, nf.bytes)), '… and its Client copy (ticked by default)');
      const bk = [...backups.children.values()].pop(), man = JSON.parse(new TextDecoder().decode(bk.children.get('manifest.json').bytes));
      ok(!bk.children.has('UpgradeFees.lua') && man.files.some(x => x.name === 'UpgradeFees.lua' && x.created), 'backup: no old copy (it is new), the manifest says created');
      ok(S.ws.dirtyFiles().length === 0, 'clean after save');
      for (const m of [...document.querySelectorAll('.modal')]) { const b = btnByText(m, 'Close'); if (b) click(b); }
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
    if (STOP !== 'end' && !failed.length) box.style.display = 'none';      // a failure always shows
    document.body.appendChild(box);
    const pre = document.createElement('pre'); pre.id = 'harness-json'; pre.hidden = true; pre.textContent = JSON.stringify(results); document.body.appendChild(pre);
  }));
})(globalThis.FRE);
