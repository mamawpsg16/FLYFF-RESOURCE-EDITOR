// SourceFile: one resource file held as immutable original bytes plus the
// current text. Edits are splices on the current text, so bytes outside an
// edited range are copied verbatim on save. See docs/DESIGN.md §1.
(function (FRE) {
  'use strict';
  const B = FRE.bytes;

  const KIND_UTF16 = 'utf16le-bom';
  const KIND_BYTES = 'bytes';

  class SourceFile {
    constructor(name, bytes, opts = {}) {
      this.name = name;
      this.handle = opts.handle || null;
      this.stamp = opts.stamp || null;          // { size, lastModified } at load
      this.bytes = bytes;                       // original bytes (replaced only after a successful save)
      this.readOnlyReasons = [];
      this._undo = [];
      this._redo = [];
      this._linesCache = null;
      this._linesFor = null;
      this._load();
    }

    get readOnly() { return this.readOnlyReasons.length > 0; }
    get dirty() { return this.text !== this.originalText; }

    _load() {
      const b = this.bytes;
      const has = (...sig) => sig.every((v, i) => b[i] === v);
      if (b.length >= 2 && has(0xff, 0xfe)) {
        this.kind = KIND_UTF16;
        this.bom = b.subarray(0, 2);
        if ((b.length & 1) !== 0) {
          this.readOnlyReasons.push('UTF-16 file has an odd number of bytes');
          // fall back to a byte view so it can still be displayed
          this.kind = KIND_BYTES;
          this.bom = new Uint8Array(0);
          this.text = B.bytesToBinaryString(b);
        } else {
          this.text = B.utf16leToString(b, 2);
        }
        this.displayCodec = 'utf-16le';
      } else {
        this.kind = KIND_BYTES;
        this.bom = new Uint8Array(0);
        this.text = B.bytesToBinaryString(b);
        if (b.length >= 3 && has(0xef, 0xbb, 0xbf)) {
          this.readOnlyReasons.push('UTF-8 BOM: the server parser would treat the BOM as part of the first token');
        } else if (b.length >= 2 && has(0xfe, 0xff)) {
          this.readOnlyReasons.push('UTF-16 big-endian: not supported by the server parser');
        }
        this.displayCodec = B.isAllAscii(b) ? 'ascii' : (B.isValidUtf8(b) ? 'utf-8' : 'euc-kr');
      }
      this.originalText = this.text;

      // Round-trip gate: re-encoding the untouched text must give back the
      // exact original bytes, otherwise the file is read-only.
      if (!B.bytesEqual(this.encode(this.text), b)) {
        this.readOnlyReasons.push('round-trip check failed: re-encoding the file does not reproduce its bytes');
      }
      const lines = this.lines;
      let joined = 0;
      for (const l of lines) joined += l.end - l.start;
      if (joined !== this.text.length) this.readOnlyReasons.push('line index does not cover the whole file');
    }

    encode(text) {
      const body = this.kind === KIND_UTF16 ? B.stringToUtf16le(text) : B.binaryStringToBytes(text);
      return this.bom.length ? B.concatBytes([this.bom, body]) : body;
    }

    serialize() { return this.encode(this.text); }

    get lines() {
      if (this._linesFor !== this.text) {
        this._linesCache = B.scanLines(this.text);
        this._linesFor = this.text;
      }
      return this._linesCache;
    }

    get originalLines() {
      if (!this._origLines || this._origLinesFor !== this.originalText) {
        this._origLines = B.scanLines(this.originalText);
        this._origLinesFor = this.originalText;
      }
      return this._origLines;
    }

    lineOf(offset) { return B.lineIndexAt(this.lines, offset); }

    // Decodes a slice of `text` for display only. Never used for saving.
    display(text, start = 0, end = text.length) {
      const s = text.slice(start, end);
      if (this.kind === KIND_UTF16 || this.displayCodec === 'ascii') return s;
      let bytes;
      try { bytes = B.binaryStringToBytes(s); } catch (e) { return s; }
      for (const codec of [this.displayCodec, 'utf-8']) {
        try { return new TextDecoder(codec === 'ascii' ? 'utf-8' : codec, { fatal: false }).decode(bytes); } catch (e) { /* codec unsupported here */ }
      }
      return s;
    }

    displayLine(i, useOriginal = false) {
      const text = useOriginal ? this.originalText : this.text;
      const lines = useOriginal ? this.originalLines : this.lines;
      const l = lines[i];
      return this.display(text, l.start, l.contentEnd);
    }

    // splices: [{ start, end, insert }] in offsets of the CURRENT text.
    // Applied right-to-left so earlier offsets stay valid.
    applySplices(splices, label = 'edit') {
      if (this.readOnly) throw new Error(`${this.name} is read-only: ${this.readOnlyReasons.join('; ')}`);
      if (!splices.length) return;
      const sorted = [...splices].sort((a, b) => a.start - b.start);
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (s.start < 0 || s.end < s.start || s.end > this.text.length) throw new Error(`bad splice ${s.start}..${s.end}`);
        if (i > 0 && s.start < sorted[i - 1].end) throw new Error('overlapping splices');
        if (this.kind === KIND_BYTES && !B.isPrintableAscii(s.insert)) {
          throw new Error(`${this.name}: only printable ASCII can be inserted into this file`);
        }
      }
      let t = this.text;
      for (let i = sorted.length - 1; i >= 0; i--) {
        const s = sorted[i];
        t = t.slice(0, s.start) + s.insert + t.slice(s.end);
      }
      this._undo.push({ text: this.text, label });
      this._redo = [];
      this.text = t;
    }

    canUndo() { return this._undo.length > 0; }
    canRedo() { return this._redo.length > 0; }
    undo() {
      const u = this._undo.pop(); if (!u) return null;
      this._redo.push({ text: this.text, label: u.label });
      this.text = u.text; return u.label;
    }
    redo() {
      const r = this._redo.pop(); if (!r) return null;
      this._undo.push({ text: this.text, label: r.label });
      this.text = r.text; return r.label;
    }
    revertAll() {
      if (!this.dirty) return;
      this._undo.push({ text: this.text, label: 'revert' });
      this._redo = [];
      this.text = this.originalText;
    }

    // After a verified save: the written bytes become the new baseline.
    commitSaved(bytes, stamp) {
      this.bytes = bytes;
      this.stamp = stamp || this.stamp;
      this.originalText = this.text;
      this._undo = [];
      this._redo = [];
    }
  }

  SourceFile.KIND_UTF16 = KIND_UTF16;
  SourceFile.KIND_BYTES = KIND_BYTES;
  FRE.SourceFile = SourceFile;
})(globalThis.FRE = globalThis.FRE || {});
