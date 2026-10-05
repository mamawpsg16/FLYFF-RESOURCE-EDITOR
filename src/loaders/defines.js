// #define loading, ported from CProject::LoadDefines (ProjectCmn.cpp:1369)
// and CScript::PreScan / ExecDefine (Script.cpp:301, :399).
// Only "#define NAME <decimal|0xhex>" defines anything. Negative values,
// aliases (#define A B) and expressions are silently skipped, exactly like
// the server. The first definition of a name wins.
(function (FRE) {
  'use strict';
  const { Lexer, atoi } = FRE.lexer;

  // Same order as the server (__VER 19, __IMPROVE_MAP_SYSTEM on).
  const DEFINE_FILES = [
    'define.h', 'defineNeuz.h', 'defineQuest.h', 'defineJob.h', 'defineItem.h',
    'defineWorld.h', 'defineItemkind.h', 'lang.h', 'defineObj.h', 'defineAttribute.h',
    'defineSkill.h', 'defineText.h', 'defineSound.h', 'resdata.h', 'WndStyle.h',
    'definelordskill.h', 'defineHonor.h', 'ContinentDef.h', 'defineMapComboBoxData.h',
    'defineItemGrade.h', 'defineItemType.h',
  ];

  // sscanf("%x"): leading hex digits only
  function scanHex(s) {
    const m = /^[0-9a-fA-F]+/.exec(s);
    return m ? (parseInt(m[0].slice(-8), 16) | 0) : 0;
  }

  function prescanFile(state, file) {
    const lex = new Lexer(file.text, { file: file.name, diags: state.diags });
    const first = lex.next();
    if (first.text === '#') return;            // "compiler" mode: never defines anything
    lex.putBack(first);
    for (;;) {
      const tok = lex.next();
      if (tok.type === 'eof') break;
      if (tok.type === 'temp' && tok.text.startsWith('#define')) {
        const name = lex.next();
        const val = lex.next();
        let n;
        if (val.type === 'number') n = atoi(val.text).value;
        else if (val.type === 'hex') n = scanHex(val.text);
        else {
          if (val.type === 'temp') lex.putBack(val);
          state.skipped.push({ name: name.text, file: file.name, start: name.start, value: val.text });
          continue;
        }
        if (state.defines.has(name.text)) {
          state.dups.push({ name: name.text, file: file.name, start: name.start, value: n, kept: state.defines.get(name.text) });
        } else {
          state.defines.set(name.text, n);
          state.origin.set(name.text, { file: file.name, start: name.start });
        }
      } else if (tok.type === 'temp') {   // every other TEMP token is an IDENTIFIER to PreScan
        const nx = lex.next();
        if (nx.text === '(') {
          // PreScan treats "NAME(" as a function and skips to the next ')'
          const close = file.text.indexOf(')', lex.pos);
          lex.pos = close < 0 ? lex.limit : close + 1;
        } else lex.putBack(nx);
      } else if (tok.text === '{') {
        // PreScan returns at the first top-level '{': the rest of the file defines nothing.
        state.diags.push({ code: 'D_BRACE', severity: 'WARN', file: file.name, start: tok.start, end: tok.end,
          message: `${file.name}: the server stops reading defines at this '{'` });
        break;
      }
    }
  }

  // files: Map lowercase name -> SourceFile
  function loadDefines(files) {
    const state = { defines: new Map(), origin: new Map(), dups: [], skipped: [], diags: [], missing: [] };
    for (const name of DEFINE_FILES) {
      const f = files.get(name.toLowerCase());
      if (!f) { state.missing.push(name); continue; }
      prescanFile(state, f);
    }
    // reverse lookup by prefix, e.g. byValue('IK3_', 2) -> 'IK3_SWD'
    const reverse = new Map();
    state.byValue = (prefix, value) => {
      let m = reverse.get(prefix);
      if (!m) {
        m = new Map();
        for (const [k, v] of state.defines) if (k.startsWith(prefix) && !m.has(v)) m.set(v, k);
        reverse.set(prefix, m);
      }
      return m.get(value) || null;
    };
    state.withPrefix = prefix => [...state.defines].filter(([k]) => k.startsWith(prefix));
    return state;
  }

  FRE.loadDefines = loadDefines;
  FRE.DEFINE_FILES = DEFINE_FILES;
})(globalThis.FRE = globalThis.FRE || {});
