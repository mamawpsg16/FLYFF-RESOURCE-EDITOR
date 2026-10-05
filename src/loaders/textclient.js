// textClient.inc: the client's TID_ texts (tooltip labels and formats), ported from
// CProject::LoadText (ProjectCmn.cpp:1191). Shape, repeated:
//   TID_NAME 0xAARRGGBB { IDS_TEXTCLIENT_INC_nnnnnn }
// TID_ names are numbers from defineText.h; the IDS_ key is resolved through the
// string tables (textClient.txt.txt). A later entry with the same id replaces the
// earlier one (SetAtGrow). Read-only context for the item tooltip.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;

  // -> { byId: Map id -> {text, color}, get(tidName) -> text or '' }
  function load(files, strings, defines) {
    const byId = new Map();
    const f = files.get('textclient.inc');
    if (f) {
      const script = new Script(f.text, { file: f.name, defines, strings, diags: [] });
      let id = script.getNumber();
      do {
        const color = script.getNumber();
        const t = script.getToken();
        if (t.text[0] === '{') {
          const s = script.getToken();
          byId.set(id.value >>> 0, { text: s.text.replace(/"/g, ''), color: color.value >>> 0 });
          script.getToken();                 // }
        }
        id = script.getNumber();
      } while (!script.eof);
    }
    return {
      byId,
      get(name) {
        const id = defines.get(name);
        const e = id === undefined ? null : byId.get(id >>> 0);
        return e ? e.text : '';
      },
    };
  }

  FRE.textClient = { load };
})(globalThis.FRE = globalThis.FRE || {});
