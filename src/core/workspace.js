// Workspace: the loaded Resource folder as the editor sees it. No DOM here,
// so it can be tested outside the browser (tests/run-tests.js under gjs).
(function (FRE) {
  'use strict';

  // Files Build 1 needs. Only the character files are ever written.
  const REQUIRED = [
    'Masquerade.prj', 'Spec_Item.txt', 'propItem.txt.txt',
    'character.inc', 'character-etc.inc', 'character-school.inc',
    'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt',
    ...FRE.DEFINE_FILES,
  ];
  const EDITABLE = new Set(FRE.character.CHARACTER_FILES.map(n => n.toLowerCase()));

  class Workspace {
    // files: Map lowercase name -> SourceFile
    constructor(files) {
      this.files = files;
      this.history = [];      // lowercase file names, in edit order (for global undo)
      this.redoStack = [];
      this.missing = REQUIRED.filter(n => !files.has(n.toLowerCase()));
    }

    load() {
      this.defines = FRE.loadDefines(this.files);
      this.strings = FRE.loadStrings(this.files);
      const spec = this.files.get('spec_item.txt');
      this.items = spec ? FRE.specItem.loadSpecItem(spec, { defines: this.defines.defines, strings: this.strings.map })
        : { items: new Map(), rows: [], diags: [], stopped: null };
      this.reparse();
      this.baseline = this.keyCounts(this.diags);
      return this;
    }

    reparse() {
      this.chars = FRE.character.loadCharacters(this.files, { defines: this.defines.defines, strings: this.strings.map });
      const charDiags = FRE.validateCharacters(this.chars, { items: this.items.items, defines: this.defines.defines });
      const itemDiags = this.items.diags.map(d => Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
      this.diags = [...charDiags, ...itemDiags];
    }

    isEditable(lowerName) {
      const f = this.files.get(lowerName);
      return !!f && EDITABLE.has(lowerName) && !f.readOnly;
    }

    fileOfNpc(npc) { return this.files.get(npc.file.toLowerCase()); }

    // Apply splices produced by FRE.shopOps to one file, then re-derive everything.
    apply(lowerName, splices, label) {
      if (!this.isEditable(lowerName)) throw new Error(`${lowerName} is not editable`);
      if (!splices.length) return;
      this.files.get(lowerName).applySplices(splices, label);
      this.history.push(lowerName);
      this.redoStack = [];
      this.reparse();
    }

    undo() {
      const name = this.history.pop(); if (!name) return null;
      const label = this.files.get(name).undo();
      this.redoStack.push(name); this.reparse(); return label;
    }
    redo() {
      const name = this.redoStack.pop(); if (!name) return null;
      const label = this.files.get(name).redo();
      this.history.push(name); this.reparse(); return label;
    }

    dirtyFiles() { return [...this.files.values()].filter(f => f.dirty); }

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

    isNew(d) { return d.severity === 'BLOCK' && this.newBlocking().includes(d); }

    // After a verified save of `savedFiles`.
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
        level: g('dwLimitLevel1'), atkMin: g('dwAbilityMin'), atkMax: g('dwAbilityMax'),
        grade, rarity: grade === 100 ? 'normal' : grade === 200 ? 'unique' : grade === 300 ? 'ultimate' : grade === 400 ? 'baruna' : 'other',
        cost: g('dwCost'), chipCost: g('dwReferValue1'), icon: g('szIcon'), packMax: g('dwPackMax'),
      };
    }
  }

  Workspace.REQUIRED = REQUIRED;
  Workspace.EDITABLE = EDITABLE;
  FRE.Workspace = Workspace;
})(globalThis.FRE = globalThis.FRE || {});
