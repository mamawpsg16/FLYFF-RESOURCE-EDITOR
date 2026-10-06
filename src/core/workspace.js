// Workspace: the loaded Resource folder as the editor sees it. No DOM here,
// so it can be tested outside the browser (tests/run-tests.js under gjs).
//
// Shared data (defines, strings, Spec_Item items) is loaded once. Each editor
// is a "data module" that owns some files, parses them and validates them;
// a module whose required files are missing is simply unavailable.
(function (FRE) {
  'use strict';

  // Needed by every editor.
  const CORE = ['Masquerade.prj', 'Spec_Item.txt', 'propItem.txt.txt', ...FRE.DEFINE_FILES];
  // Shared files the editor may write. Spec_Item.txt: only dwReferValue1 (chip prices), the
  // field the proven commits 93a02124 / fea9840b change. The client reads its own copy.
  const CORE_EDITABLE = ['Spec_Item.txt'];
  const CORE_CLIENT = ['Spec_Item.txt'];
  // Read when present, never required (context only).
  // World.inc, world.txt.txt and propMapComboBoxData.*: where NPCs stand (loaders/area.js)
  const OPTIONAL = ['textClient.inc', 'textClient.txt.txt', 'World.inc', 'world.txt.txt', 'propMapComboBoxData.inc', 'propMapComboBoxData.txt.txt'];

  // id, files it needs, files it may write, files the game client also reads,
  // parse(ws) -> model, validate(ws, model) -> diagnostics
  const MODULES = [
    {
      id: 'npc', label: 'NPC Shops', editsSpec: true,
      required: ['character.inc', 'character-etc.inc', 'character-school.inc', 'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt'],
      editable: ['character.inc', 'character-etc.inc', 'character-school.inc'],
      client: ['character.inc', 'character-etc.inc', 'character-school.inc'],
      maps: true,            // reads World/*/ to show where each NPC stands
      parse(ws) {
        ws._sim = new Map();
        return (ws.chars = FRE.character.loadCharacters(ws.files, { defines: ws.defines.defines, strings: ws.strings.map }));
      },
      validate(ws, model) {
        return FRE.validateCharacters(model, {
          items: ws.items.items, defines: ws.defines.defines,
          simulate: npc => ws.simulate(npc), textOf: n => ws.textOf(n),
        }).map(d => Object.assign({ module: 'npc' }, d));
      },
    },
    {
      id: 'donation', label: 'Donation Shop', editsSpec: true,
      required: ['DonationShop.inc'], editable: ['DonationShop.inc'], client: ['DonationShop.inc'],
      maps: true,            // where MaFl_DONATION stands (the client opens the shop for that key, WndWorld.cpp:5835)
      parse(ws) {
        return FRE.donation.loadDonation(ws.files.get('donationshop.inc'), { defines: ws.defines.defines, strings: ws.strings.map });
      },
      validate(ws, model) {
        return FRE.donation.validateDonation(model, { items: ws.items.items, textOf: n => ws.textOf(n), defines: ws.defines.defines, tree: ws.donationTree });
      },
    },
    {
      // BattlePass.inc (commit cc73ccdd). propMover.txt gives each monster's name, level and rank.
      id: 'battlepass', label: 'Battle Pass',
      required: ['BattlePass.inc', 'propMover.txt', 'propMover.txt.txt'], editable: ['BattlePass.inc'], client: ['BattlePass.inc'],
      parse(ws) {
        if (!ws.movers) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
        return FRE.battlePass.loadBattlePass(ws.files.get('battlepass.inc'), { defines: ws.defines.defines, strings: ws.strings.map });
      },
      validate(ws, model) {
        return FRE.battlePass.validateBattlePass(model, { items: ws.items.items, movers: ws.movers.movers, defines: ws.defines.defines, now: ws.now ? ws.now() : new Date(), theme: ws.clientTheme });
      },
    },
    {
      // Exchange_Script.txt (CExchange::Load_Script). The NPC files tell which NPCs open each menu.
      id: 'exchange', label: 'Exchanges',
      required: ['Exchange_Script.txt'], editable: ['Exchange_Script.txt'], client: ['Exchange_Script.txt'],
      deps: ['character.inc', 'character-etc.inc', 'character-school.inc'],
      uses: ['npc'],         // the NPC files are read (not edited) to name the NPCs that open each menu
      maps: true,            // reads World/*/ to tell which of those NPCs stand in the game, and where
      parse(ws) {
        return FRE.exchange.loadExchange(ws.files.get('exchange_script.txt'), { defines: ws.defines.defines });
      },
      validate(ws, model) {
        return FRE.exchange.validateExchange(model, { items: ws.items.items, npcsByMenu: ws.npcsByMenu(), packMax: it => FRE.specItem.get(it, 'dwPackMax'),
          live: ws.placed ? m => ws.isLiveMenu(m) : null });
      },
    },
  ];
  const ALL_FILES = [...new Set([...CORE, ...MODULES.flatMap(m => m.required), ...OPTIONAL])];

  class Workspace {
    // files: Map lowercase name -> SourceFile
    // opts.only: one task (module id). Only that module is shown, validated and editable;
    // the modules it `uses` are parsed as read-only context. Without it: every module.
    constructor(files, opts = {}) {
      this.files = files;
      this.only = opts.only || null;
      this.history = [];      // lowercase file names, in edit order (for global undo)
      this.redoStack = [];
      this.missing = CORE.filter(n => !files.has(n.toLowerCase()));
      this.models = {};
      this.moduleDiags = {};
      this.available = {};
      this.editable = new Set();
      this.donationTree = null;
      this.clientTheme = null;      // lowercase file names in Client/Theme (Battle Pass textures), when the Client folder is chosen
      this.placed = null;           // lowercase NPC key -> [map names] from World/*/*.dyo (null: not read)
      this.area = null;             // FRE.area.build: where each NPC stands, named as the client names it (null: not read)
      const task = this.only ? MODULES.find(m => m.id === this.only) : null;
      if (this.only && !task) throw new Error(`unknown task ${this.only}`);
      this.active = new Set(task ? [task.id, ...(task.uses || [])] : MODULES.map(m => m.id));
      this.shown = new Set(task ? [task.id] : MODULES.map(m => m.id));
      for (const m of MODULES) {
        const miss = m.required.filter(n => !files.has(n.toLowerCase()));
        this.available[m.id] = !this.active.has(m.id) ? { ok: false, missing: [], off: true } : miss.length ? { ok: false, missing: miss } : { ok: true };
        if (!miss.length && this.shown.has(m.id)) m.editable.forEach(n => this.editable.add(n.toLowerCase()));
      }
      if (!task || task.editsSpec) CORE_EDITABLE.forEach(n => { if (files.has(n.toLowerCase())) this.editable.add(n.toLowerCase()); });
    }

    load() {
      this.defines = FRE.loadDefines(this.files);
      this.strings = FRE.loadStrings(this.files);
      this.texts = FRE.textClient.load(this.files, this.strings.map, this.defines.defines);
      this.loadItems();
      // exchange menus (MMI_ names at the start of a line in Exchange_Script.txt), for display only
      const ex = this.files.get('exchange_script.txt');
      this.exchangeMenus = new Set(ex ? (ex.text.match(/^MMI_\w+/gm) || []) : []);
      this.reparse();
      this.baseline = this.keyCounts(this.diags);
      return this;
    }

    // Spec_Item.txt and everything derived from it (also after a price edit).
    loadItems() {
      const spec = this.files.get('spec_item.txt');
      this.items = spec ? FRE.specItem.loadSpecItem(spec, { defines: this.defines.defines, strings: this.strings.map })
        : { items: new Map(), rows: [], diags: [], stopped: null };
      this.itemDiags = this.items.diags.map(d => Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
      this.vendorIndex = FRE.vendorSim.buildIndex(this.items, this.defines.defines);
    }

    // Re-parse the modules that own `lowerName` (all modules when omitted).
    reparse(lowerName) {
      if (lowerName === 'spec_item.txt') { this.loadItems(); lowerName = undefined; }   // every module reads items
      for (const m of MODULES) {
        if (!this.available[m.id].ok) continue;
        if (lowerName && ![...m.required, ...(m.deps || [])].some(n => n.toLowerCase() === lowerName)) continue;
        this.models[m.id] = m.parse(this);
        if (this.shown.has(m.id)) this.moduleDiags[m.id] = m.validate(this, this.models[m.id]);
      }
      // Spec_Item problems matter only to tasks that can change Spec_Item.txt
      const specDiags = [...this.shown].some(id => MODULES.find(m => m.id === id).editsSpec) ? this.itemDiags : [];
      this.diags = [...Object.values(this.moduleDiags).flat(), ...specDiags];
    }

    // Client/Client/DonationShopTree.inc (client-only; read from the Client folder when chosen)
    setDonationTree(tree) {
      this.donationTree = tree || null;
      if (this.available.donation && this.available.donation.ok) this.reparse('donationshop.inc');
    }

    // file names in the client's Theme folder (BattlePass.inc rarity / icon textures)
    setClientTheme(names) {
      this.clientTheme = names ? new Set([...names].map(n => n.toLowerCase())) : null;
      if (this.available.battlepass && this.available.battlepass.ok) this.reparse('battlepass.inc');
    }

    // exchange menu id -> names of the NPCs with AddMenu(id) (null without the NPC files)
    npcsByMenu() {
      const by = this.npcInfoByMenu();
      return by && new Map([...by].map(([id, list]) => [id, list.map(x => x.name)]));
    }
    // exchange menu id -> [{ npc, name, key, inGame, maps, why }] (FRE.world.npcStatus)
    npcInfoByMenu() {
      if (!this.available.npc || !this.available.npc.ok || !this.chars) return null;
      const m = new Map();
      for (const npc of this.chars.npcs) for (const id of npc.menus) {
        if (!m.has(id)) m.set(id, []);
        m.get(id).push(Object.assign({ npc, name: npc.name || npc.key, key: npc.key, where: this.whereOf(npc.key) }, FRE.world.npcStatus(npc, this.placed)));
      }
      return m;
    }
    // An exchange menu players can use: it has recipes, and an NPC with it stands in the game.
    isLiveMenu(m) {
      if (!m.sets.length) return false;
      const by = this.npcInfoByMenu();
      return !!by && (by.get(m.mmi.value) || []).some(x => x.inGame);
    }
    // The maps the server loads (World.inc), for the app to read their .dyo files
    worldList() { return FRE.world.readWorldList(this.files.get('world.inc'), this.defines.defines); }
    // dyo: Map map name -> bytes of World/<name>/<name>.dyo
    // worldFiles: Map lowercase path ('world/wdmadrigal/wdmadrigal.rgn') -> SourceFile: each map's .rgn and
    // .txt.txt, and WdMadrigal.wld.cnt (read-only; loaders/area.js names the spots)
    setMapObjects(dyo, worldFiles = new Map()) {
      const placed = new Map();
      for (const [name, bytes] of dyo) for (const key of FRE.world.readDyo(bytes).movers) {
        const k = key.toLowerCase();
        if (!placed.has(k)) placed.set(k, []);
        if (!placed.get(k).includes(name)) placed.get(k).push(name);
      }
      this.placed = placed;
      const get = rel => worldFiles.get(rel.toLowerCase()) || this.files.get(rel.toLowerCase()) || null;
      this.area = FRE.area.build({ defines: this.defines.defines, get, dyo });
      for (const m of MODULES) if (m.maps && this.available[m.id].ok) this.reparse(m.required[0].toLowerCase());
    }
    // [{ place, caption, te, world, x, z, … }] where the NPC with this key stands (FRE.area.whereIs); null: maps not read
    whereOf(key) { return this.area ? FRE.area.whereIs(this.area, key) : null; }
    needsMaps() { return MODULES.some(m => m.maps && this.shown.has(m.id) && this.available[m.id].ok); }

    textOf(name) { return (this.files.get(String(name).toLowerCase()) || { text: '' }).text; }
    moduleOfFile(name) { const l = String(name).toLowerCase(); return MODULES.find(m => m.required.some(n => n.toLowerCase() === l)) || null; }

    isEditable(lowerName) {
      const f = this.files.get(lowerName);
      return !!f && this.editable.has(lowerName) && !f.readOnly;
    }

    fileOfNpc(npc) { return this.files.get(npc.file.toLowerCase()); }

    // Apply splices from an edit op to one file, then re-derive what depends on it.
    apply(lowerName, splices, label) {
      this.applyGroup([{ file: lowerName, splices }], label);
    }

    // Several files changed as ONE undo step. All splices are checked before any file changes.
    applyGroup(parts, label) {
      parts = parts.filter(p => p.splices.length);
      if (!parts.length) return;
      for (const p of parts) {
        if (!this.isEditable(p.file)) throw new Error(`${p.file} is not editable`);
        const f = this.files.get(p.file);
        FRE.SourceFile.spliceText(f.text, p.splices, f.kind, f.name);       // throws before anything changes
      }
      for (const p of parts) this.files.get(p.file).applySplices(p.splices, label);
      this.history.push(parts.map(p => p.file));
      this.redoStack = [];
      this._reparseAll(parts.map(p => p.file));
    }

    _reparseAll(names) {
      if (names.includes('spec_item.txt')) this.reparse('spec_item.txt');   // reparses every module
      else names.forEach(n => this.reparse(n));
    }

    undo() {
      const names = this.history.pop(); if (!names) return null;
      let label = null;
      for (const n of names) label = this.files.get(n).undo();
      this.redoStack.push(names); this._reparseAll(names); return label;
    }
    redo() {
      const names = this.redoStack.pop(); if (!names) return null;
      let label = null;
      for (const n of names) label = this.files.get(n).redo();
      this.history.push(names); this._reparseAll(names); return label;
    }

    // What players see in this NPC's shop (cached until the next edit).
    simulate(npc) {
      if (!this._sim.has(npc)) this._sim.set(npc, FRE.vendorSim.simulateNpc(this.vendorIndex, npc));
      return this._sim.get(npc);
    }

    dirtyFiles() { return [...this.files.values()].filter(f => f.dirty); }

    // Files the game client also reads (it has its own copies in Client/).
    clientFileNames() {
      const own = MODULES.filter(m => this.available[m.id].ok && this.shown.has(m.id));
      const spec = !this.only || own.some(m => m.editsSpec) ? CORE_CLIENT : [];
      return [...new Set([...spec, ...own.flatMap(m => m.client)])];
    }

    // Changed files that the game client also reads (must be copied to Client/).
    clientCopiesNeeded() {
      const names = new Set(this.clientFileNames().map(n => n.toLowerCase()));
      return this.dirtyFiles().filter(f => names.has(f.name.toLowerCase())).map(f => f.name);
    }

    keyCounts(diags) {
      const m = new Map();
      for (const d of diags) if (d.severity === 'BLOCK') m.set(d.key, (m.get(d.key) || 0) + 1);
      return m;
    }

    // BLOCK diagnostics that did not exist when the folder was loaded / last saved.
    newBlocking() {
      const left = new Map(this.baseline);
      const out = [];
      for (const d of this.diags) {
        if (d.severity !== 'BLOCK') continue;
        const n = left.get(d.key) || 0;
        if (n > 0) left.set(d.key, n - 1); else out.push(d);
      }
      return out;
    }

    // After a verified save.
    markSaved() {
      this.history = []; this.redoStack = [];
      this.baseline = this.keyCounts(this.diags);
    }

    // --- read helpers for the UI ---------------------------------------
    itemById(id) { return this.items.items.get(id >>> 0) || null; }
    itemInfo(item) {
      const g = (f) => FRE.specItem.get(item, f);
      const D = this.defines;
      const grade = g('dwItemGrade');
      return {
        id: item.id, define: item.define, name: item.name || item.nameKey,
        ik1: g('dwItemKind1'), ik2: g('dwItemKind2'), ik3: g('dwItemKind3'),
        ik3Name: D.byValue('IK3_', g('dwItemKind3')),
        job: g('dwItemJob'), jobName: g('dwItemJob') === -1 ? null : D.byValue('JOB_', g('dwItemJob')),
        level: g('dwLimitLevel1'), atkMin: g('dwAbilityMin'), atkMax: g('dwAbilityMax'),
        grade, rarity: grade === 100 ? 'normal' : grade === 200 ? 'unique' : grade === 300 ? 'ultimate' : grade === 400 ? 'baruna' : 'other',
        cost: g('dwCost'), chipCost: g('dwReferValue1'), icon: g('szIcon'), packMax: g('dwPackMax'),
      };
    }
  }

  Workspace.CORE = CORE;
  Workspace.CORE_CLIENT = CORE_CLIENT;
  Workspace.MODULES = MODULES;
  Workspace.ALL_FILES = ALL_FILES;
  Workspace.REQUIRED = ALL_FILES;      // everything the editor looks for in the folder
  Workspace.OPTIONAL = [];
  FRE.Workspace = Workspace;
})(globalThis.FRE = globalThis.FRE || {});
