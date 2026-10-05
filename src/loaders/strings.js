// String tables (*.txt.txt), ported from CProject::LoadStrings (ProjectCmn.cpp:1253)
// and CScript::LoadString (Script.cpp:103).
// Each entry: a token starting with "IDS", then the rest of the line up to CR
// (not LF), whitespace-trimmed. All files share one map; the first key wins.
(function (FRE) {
  'use strict';
  const { Lexer, Script } = FRE.lexer;

  // Subset of the server's list that the editor needs, in the server's order.
  const STRING_FILES = [
    'character.txt.txt', 'character-etc.txt.txt', 'character-school.txt.txt',
    'propItem.txt.txt', 'propMover.txt.txt',
  ];

  function loadStringFile(state, file) {
    const script = new Script(file.text, { file: file.name, diags: state.diags });
    const lex = script.lex;
    let tok = lex.next();
    while (tok.type !== 'eof') {
      if (!tok.text.startsWith('IDS')) {
        state.diags.push({ code: 'T_KEY', severity: 'WARN', file: file.name, start: tok.start, end: tok.end,
          message: `"${tok.text}" is not an IDS key: the server logs an error and skips it` });
        tok = script.getToken();
        continue;
      }
      const v = lex.lastFull();
      if (state.map.has(tok.text)) {
        state.diags.push({ code: 'T_DUP', severity: 'WARN', file: file.name, start: tok.start, end: tok.end, name: tok.text,
          message: `duplicate string key ${tok.text}: the first one wins` });
      } else {
        state.map.set(tok.text, v.text);
        state.meta.set(tok.text, { file: file.name, keyStart: tok.start, start: v.start, end: v.end });
      }
      tok = lex.next();
    }
  }

  function loadStrings(files) {
    const state = { map: new Map(), meta: new Map(), diags: [], missing: [] };
    for (const name of STRING_FILES) {
      const f = files.get(name.toLowerCase());
      if (!f) { state.missing.push(name); continue; }
      loadStringFile(state, f);
    }
    return state;
  }

  FRE.loadStrings = loadStrings;
  FRE.STRING_FILES = STRING_FILES;
})(globalThis.FRE = globalThis.FRE || {});
