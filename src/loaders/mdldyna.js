// mdlDyna.inc: the model of every object, read by the server and the game at startup through the "model" line of
// Masquerade.prj (Project.cpp:768 m_modelMng.LoadScript). Port of CModelMng::LoadScript (_Common/ModelMng.cpp:314-470):
//   "<type name>" <type> { "<model>" <index> <modeltype> "<part>" fly distant pick scale trans shadow textureEx render [ { motions } ] ... }
// with "<folder>" { ... } groups inside a type. An item (type OT_ITEM 4, Source/Resource/define.h:84) without an entry is
// drawn with the vagrant helmet when it lies on the ground (ModelMng.cpp:42-44). The same type + index twice stops the
// startup with a message box (ModelMng.cpp:455), so a new entry needs an index nobody uses.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const OT_ITEM = 4;

  // -> { elems: [{ type, index, name, define, idx: {start,end}, line: {start, end} (the entry's own line incl. its EOL),
  //      oneLine }], items: Map(index -> first elem of type OT_ITEM), dups: [elem] }
  function loadMdlDyna(file, ctx) {
    const s = new Script(file.text, { file: file.name, defines: ctx.defines, diags: [] });
    const text = file.text, elems = [], seen = new Map(), dups = [];
    const lineOf = (a, b) => {
      const start = text.lastIndexOf('\n', a - 1) + 1;
      let end = text.indexOf('\n', b);
      end = end < 0 ? text.length : end + 1;
      return { start, end };
    };
    let t = s.getToken();                                 // subject or FINISHED
    while (t.type !== 'eof') {
      const iType = s.getNumber().value;
      s.getToken();                                       // {
      s.getToken();                                       // object name or }
      let nBrace = 1;
      while (nBrace) {
        if (s.token.type === 'eof') return { elems, items: itemsOf(elems), dups, hung: true };
        if (s.token.text[0] === '}') {
          nBrace--;
          if (nBrace > 0) { s.getToken(); continue; }
          continue;
        }
        const nameTok = s.token;
        const mark = s.lex.pos;
        s.getToken();                                     // {
        if (s.token.text[0] === '{') { nBrace++; s.getToken(); continue; }
        s.lex.pos = mark;                                 // GoMark
        const idx = s.getNumber();
        s.getNumber();                                    // m_dwModelType
        s.getToken();                                     // m_szPart
        s.getNumber(); s.getNumber(); s.getNumber();      // fly, distant, pick
        s.getFloat();                                     // scale
        s.getNumber(); s.getNumber();                     // trans, shadow
        s.getNumber();                                    // m_nTextureEx
        const last = s.getNumber();                       // m_bRenderFlag
        let end = last.end, oneLine = true;
        s.getToken();                                     // object name or { or }
        if (s.token.text[0] === '{') {
          oneLine = false;
          s.getToken();
          while (!(s.token.text[0] === '}') && s.token.type !== 'eof') { s.getNumber(); s.getToken(); }
          end = s.token.end;
          s.getToken();
        }
        const e = { type: iType >>> 0, index: idx.value >>> 0, name: nameTok.text, define: idx.define || null,
          idx: { start: idx.start, end: idx.end }, line: lineOf(nameTok.start, end), oneLine: oneLine && !text.slice(nameTok.start, end).includes('\n') };
        const key = `${e.type}:${e.index}`;
        if (seen.has(key)) dups.push(e); else seen.set(key, e);
        elems.push(e);
      }
      t = s.getToken();                                   // type name or }
    }
    return { elems, items: itemsOf(elems), dups, hung: false };
  }
  function itemsOf(elems) {
    const m = new Map();
    for (const e of elems) if (e.type === OT_ITEM && !m.has(e.index)) m.set(e.index, e);
    return m;
  }

  FRE.mdlDyna = { loadMdlDyna, OT_ITEM };
})(globalThis.FRE = globalThis.FRE || {});
