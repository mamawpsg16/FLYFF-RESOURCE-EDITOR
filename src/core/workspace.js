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
  // Read when present, never required (context only).
  const OPTIONAL = ['Exchange_Script.txt'];

  // id, files it needs, files it may write, files the game client also reads,
  // parse(ws) -> model, validate(ws, model) -> diagnostics
  const MODULES = [
    {
      id: 'npc', label: 'NPC Shops',
      required: ['character.inc', 'character-etc.inc', 'character-school.inc', 'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt'],
      editable: ['character.inc', 'character-etc.inc', 'character-school.inc'],
      client: ['character.inc', 'character-etc.inc', 'character-school.inc'],
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
      id: 'donation', label: 'Donation Shop',
      required: ['DonationShop.inc'], editable: ['DonationShop.inc'], client: ['DonationShop.inc'],
      parse(ws) {
        return FRE.donation.loadDonation(ws.files.get('donationshop.inc'), { defines: ws.defines.defines, strings: ws.strings.map });
      },
      validate(ws, model) {
        return FRE.donation.validateDonation(model, { items: ws.items.items, textOf: n => ws.textOf(n) });
      },
    },
  ];
  const ALL_FILES = [...new Set([...CORE, ...MODULES.flatMap(m => m.required), ...OPTIONAL])];

  class Workspace {
    // files: Map lowercase name -> SourceFile
    constructor(files) {
      this.files = files;
      this.history = [];      // lowercase file names, in edit order (for global undo)
      this.redoStack = [];
      this.missing = CORE.filter(n => !files.has(n.toLowerCase()));
      this.models = {};
      this.moduleDiags = {};
      this.available = {};
      this.editable = new Set();
      for (const m of MODULES) {
        const miss = m.required.filter(n => !files.has(n.toLowerCase()));
        this.available[m.id] = miss.length ? { ok: false, missing: miss } : { ok: true };
        if (!miss.length) m.editable.forEach(n => this.editable.add(n.toLowerCase()));
      }
    }

    load() {
      this.defines = FRE.loadDefines(this.files);
      this.strings = FRE.loadStrings(this.files);
      const spec = this.files.get('spec_item.txt');
      this.items = spec ? FRE.specItem.loadSpecItem(spec, { defines: this.defines.defines, strings: this.strings.map })
        : { items: new Map(), rows: [], diags: [], stopped: null };
      this.itemDiags = this.items.diags.map(d => Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
      // exchange menus (MMI_ names at the start of a line in Exchange_Script.txt), for display only
      const ex = this.files.get('exchange_script.txt');
      this.exchangeMenus = new Set(ex ? (ex.text.match(/^MMI_\w+/gm) || []) : []);
      this.vendorIndex = FRE.vendorSim.buildIndex(this.items, this.defines.defines);
      this.reparse();
      this.baseline = this.keyCounts(this.diags);
      return this;
    }

    // Re-parse the modules that own `lowerName` (all modules when omitted).
    reparse(lowerName) {
      for (const m of MODULES) {
        if (!this.available[m.id].ok) continue;
        if (lowerName && !m.required.some(n => n.toLowerCase() === lowerName)) continue;
        this.models[m.id] = m.parse(this);
        this.moduleDiags[m.id] = m.validate(this, this.models[m.id]);
      }
      this.diags = [...Object.values(this.moduleDiags).flat(), ...this.itemDiags];
    }

    textOf(name) { return (this.files.get(String(name).toLowerCase()) || { text: '' }).text; }
    moduleOfFile(name) { const l = String(name).toLowerCase(); return MODULES.find(m => m.required.some(n => n.toLowerCase() === l)) || null; }

    isEditable(lowerName) {
      const f = this.files.get(lowerName);
      return !!f && this.editable.has(lowerName) && !f.readOnly;
    }

    fileOfNpc(npc) { return this.files.get(npc.file.toLowerCase()); }

    // Apply splices from an edit op to one file, then re-derive what depends on it.
    apply(lowerName, splices, label) {
      if (!this.isEditable(lowerName)) throw new Error(`${lowerName} is not editable`);
      if (!splices.length) return;
      this.files.get(lowerName).applySplices(splices, label);
      this.history.push(lowerName);
      this.redoStack = [];
      this.reparse(lowerName);
    }

    undo() {
      const name = this.history.pop(); if (!name) return null;
      const label = this.files.get(name).undo();
      this.redoStack.push(name); this.reparse(name); return label;
    }
    redo() {
      const name = this.redoStack.pop(); if (!name) return null;
      const label = this.files.get(name).redo();
      this.history.push(name); this.reparse(name); return label;
    }

    // What players see in this NPC's shop (cached until the next edit).
    simulate(npc) {
      if (!this._sim.has(npc)) this._sim.set(npc, FRE.vendorSim.simulateNpc(this.vendorIndex, npc));
      return this._sim.get(npc);
    }

    dirtyFiles() { return [...this.files.values()].filter(f => f.dirty); }

    // Changed files that the game client also reads (must be copied to Client/).
    clientCopiesNeeded() {
      const names = new Set(MODULES.flatMap(m => m.client).map(n => n.toLowerCase()));
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
  Workspace.MODULES = MODULES;
  Workspace.ALL_FILES = ALL_FILES;
  Workspace.REQUIRED = ALL_FILES;      // everything the editor looks for in the folder
  Workspace.OPTIONAL = [];
  FRE.Workspace = Workspace;
})(globalThis.FRE = globalThis.FRE || {});
