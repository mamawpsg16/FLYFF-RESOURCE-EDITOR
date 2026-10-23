// GM Commands simulator: what happens when a player of a given level types a line in the chat box.
// Port of:
//   CWndMgr chat (WndManager.cpp:4365): a line starting with '/' goes to ParsingCommand in the game; nothing else is sent for it.
//   ParsingCommand (FuncTextCmd.cpp, int ParsingCommand): CScanner GetToken twice ('/', then the command word); walks the table in order;
//     a non-Korean build stops at the first row whose name starts with "open"; a row matches on name, short name or the two Korean
//     names (exact, case-sensitive CString ==); too low a level stops the walk (break); the game runs TCM_CLIENT / TCM_BOTH rows and
//     sends the line on for TCM_SERVER rows (TCM_BOTH: sent on when the handler returns TRUE).
//   CDPSrvr::OnChat (WORLDSERVER/DPSrvr.cpp:875): the server runs ParsingCommand on its own table; when that returns FALSE the
//     line is ordinary chat (everyone near sees it), unless the player is in talk mode / muted.
// Not modelled: what each handler does with its arguments; a TCM_BOTH handler returning FALSE; emoticon lines ("/" + an emoticon word).
(function (FRE) {
  'use strict';

  // the command word, as CScanner reads it (the second token)
  function commandWord(line) {
    const L = new FRE.lexer.Lexer(String(line));
    L.next();
    const t = L.next();
    return t.type === 'eof' ? '' : t.text;
  }

  // one build's walk -> { row, stop: 'match' | 'open' | 'auth' | 'none' }
  function walk(rows, side, word, authChar) {
    const inBuild = side === 'client' ? 'inClient' : 'inServer';
    for (const r of rows) {
      if (!r[inBuild]) continue;
      if (r.name.slice(0, 4) === 'open') return { row: null, stop: 'open', at: r };
      if (word === r.name || word === r.short || word === r.kr || word === r.krShort) {
        if (r.authChar > authChar) return { row: r, stop: 'auth' };
        return { row: r, stop: 'match' };
      }
    }
    return { row: null, stop: 'none' };
  }

  // -> { word, game: walk, server: walk | null, result, text }
  //   result: 'game' (runs in the game only), 'both' (game, then server), 'server', 'ignored' (nothing happens), 'chat' (shown as chat),
  //   'swallowed' (the server matched a TCM_CLIENT row: nothing happens)
  function type(model, line, opts = {}) {
    const authChar = (FRE.gmCmd.AUTH[opts.auth || 'ADMINISTRATOR'] || ['P'])[0];
    const s = String(line);
    const word = commandWord(s);
    const out = { word, game: null, server: null, result: 'ignored', row: null,
      known: model.rows.some(r => word === r.name || word === r.short || word === r.kr || word === r.krShort) };
    if (s[0] !== '/') { out.result = 'chat'; return out; }
    const g = out.game = walk(model.rows, 'client', word, authChar);
    if (g.stop !== 'match') return out;
    out.row = g.row;
    if (g.row.side === 'CLIENT') { out.result = 'game'; return out; }
    const sv = out.server = walk(model.rows, 'server', word, authChar);
    if (sv.stop !== 'match') { out.result = g.row.side === 'BOTH' ? 'game' : 'chat'; return out; }
    out.row = sv.row;
    out.result = sv.row.side === 'CLIENT' ? (g.row.side === 'BOTH' ? 'game' : 'swallowed') : g.row.side === 'BOTH' ? 'both' : 'server';
    return out;
  }

  // plain words for the page
  function explain(r) {
    const name = x => `/${x.name}`;
    const why = (w, where) => !r.known ? `${where} does not know "/${r.word}" (names are exact: small and capital letters count)` : w.stop === 'open' ? `${where} stops at ${name(w.at)} (FuncTextCmd.cpp:${w.at.line}) before reaching it`
      : w.stop === 'auth' ? `${where} needs ${FRE.gmCmd.AUTH[w.row.auth][1]} or higher` : `${where} does not know "/${r.word}"`;
    switch (r.result) {
      case 'game': return `Runs in the game (${name(r.row)}).`;
      case 'both': return `Runs in the game, then on the server (${name(r.row)}).`;
      case 'server': return `Runs on the server (${name(r.row)}).`;
      case 'swallowed': return 'The server knows it only as a game-side command: nothing happens.';
      case 'chat': return r.game ? `Shown as normal chat: everyone near sees the line. The ${why(r.server, 'server')}.` : 'Not a command: normal chat.';
      default: return `Nothing happens: the ${why(r.game, 'game')}.`;
    }
  }

  FRE.gmCmdSim = { commandWord, walk, type, explain };
})(globalThis.FRE = globalThis.FRE || {});
