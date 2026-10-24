// GM Commands (task "GM Commands", read-only): the chat command table of the source, read from the loaded C++ (io/source-read.js),
// never from a copy kept here, so a renamed or moved command (V19 branch feat/gm-rules) shows once it is in the source.
//   FuncTextCmd.cpp: BEGINE_TEXTCMDFUNC_MAP ... END_TEXTCMDFUNC_MAP, one ON_TEXTCMDFUNC( fn, name, short, kr, krShort, TCM_x, AUTH_x, help )
//   a row; `//` rows and `/* */` blocks are not compiled; #ifdef / #ifndef / #if __VER / #else / #endif decide which build has a row.
//   CustomCommon.h + WORLDSERVER/VersionCommon.h (the WorldServer) and + Neuz/VersionCommon.h (the game) give the switched-on names.
//   ParsingCommand (FuncTextCmd.cpp, "open" check): on a non-Korean build the walk stops at the first row whose name starts with
//   "open", so every row after it can never run (SOURCES DOCUMENTATION/Bug Fixes/DEAD_GM_COMMANDS_AFTER_OPEN.md).
// Not modelled: #if expressions other than __VER >= / defined(); #define lines inside #if blocks of the version headers count as on.
// The argument forms (ARGS) are written from each handler's GetToken / GetNumber order; a command without one gets a free text box.
(function (FRE) {
  'use strict';

  const FILE = 'functextcmd.cpp', CUSTOM = 'customcommon.h', WS_VER = 'worldserver/versioncommon.h', NZ_VER = 'neuz/versioncommon.h';
  // authorization.h: AUTH_* letters, compared as numbers (m_dwAuthorization > the player's)
  const AUTH = {
    OBSERVER: ['D', 'Observer'], GENERAL: ['F', 'Every player'], LOGCHATTING: ['G', 'Logged chat'], JOURNALIST: ['H', 'Journalist'], HELPER: ['J', 'Helper'],
    GAMEMASTER: ['L', 'GM 1'], GAMEMASTER2: ['M', 'GM 2'], GAMEMASTER3: ['N', 'GM 3'], OPERATOR: ['O', 'Operator'], ADMINISTRATOR: ['P', 'Admin'],
  };
  const LEVELS = ['GENERAL', 'GAMEMASTER', 'GAMEMASTER2', 'GAMEMASTER3', 'ADMINISTRATOR'];

  // #define names a header switches on (commented lines are off)
  function defines(text) {
    const s = new Set();
    for (const l of String(text || '').split(/\r?\n/)) { const m = /^\s*#\s*define\s+(\w+)/.exec(l); if (m) s.add(m[1]); }
    return s;
  }

  // one #if line -> true / false for a build's defines
  function cond(kind, expr, D) {
    expr = expr.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim();
    if (kind === 'ifdef') return D.has(expr);
    if (kind === 'ifndef') return !D.has(expr);
    let m = /^__VER\s*>=\s*(\d+)/.exec(expr);
    if (m) return 19 >= +m[1];
    m = /^defined\s*\(\s*(\w+)\s*\)/.exec(expr);
    if (m) return D.has(m[1]);
    m = /^!\s*defined\s*\(\s*(\w+)\s*\)/.exec(expr);
    if (m) return !D.has(m[1]);
    return D.has(expr);
  }

  // the comma-separated macro arguments of one ON_TEXTCMDFUNC( ... ) (quotes kept as text)
  function macroArgs(s) {
    const out = [];
    let cur = '', q = false;
    for (const c of s) {
      if (c === '"') { q = !q; cur += c; continue; }
      if (c === ',' && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  const unq = s => (/^"(.*)"$/.exec(s) || [null, s])[1];

  // -> { rows, beginLine, endLine } ; text = FuncTextCmd.cpp (latin1), ws / nz = the two builds' define sets
  function parseTable(text, ws, nz) {
    const lines = String(text).split('\n').map(l => l.replace(/\r$/, ''));
    const begin = lines.findIndex(l => /BEGINE_TEXTCMDFUNC_MAP/.test(l) && !/#\s*define/.test(l));
    const rows = [];
    if (begin < 0) return { rows, beginLine: 0, endLine: 0 };
    const stack = [];      // { kind, expr, ws, nz, neg }
    let inBlock = false, end = lines.length;
    for (let i = begin + 1; i < lines.length; i++) {
      let l = lines[i];
      if (inBlock) { const k = l.indexOf('*/'); if (k < 0) continue; l = l.slice(k + 2); inBlock = false; }
      if (/END_TEXTCMDFUNC_MAP/.test(l)) { end = i; break; }
      const pp = /^\s*#\s*(ifdef|ifndef|if|else|elif|endif)\b\s*(.*)$/.exec(l);
      if (pp) {
        const [, k, e] = pp;
        if (k === 'endif') stack.pop();
        else if (k === 'else' && stack.length) { const t = stack[stack.length - 1]; t.ws = !t.ws; t.nz = !t.nz; t.neg = true; }
        else if (k === 'elif' && stack.length) { const t = stack[stack.length - 1]; t.ws = !t.ws && cond('if', e, ws); t.nz = !t.nz && cond('if', e, nz); t.expr = e.trim(); }
        else if (k !== 'else' && k !== 'elif') stack.push({ kind: k, expr: e.replace(/\/\/.*$/, '').trim(), ws: cond(k, e, ws), nz: cond(k, e, nz), neg: false });
        continue;
      }
      const bs = l.indexOf('/*'), cm = l.indexOf('//'), on = l.indexOf('ON_TEXTCMDFUNC');
      if (on < 0) { if (bs >= 0 && l.indexOf('*/', bs) < 0) inBlock = true; continue; }
      if ((cm >= 0 && cm < on) || (bs >= 0 && bs < on)) { if (bs >= 0 && bs < on && l.indexOf('*/', bs) < 0) inBlock = true; continue; }
      const open = l.indexOf('(', on), close = l.lastIndexOf(')');
      const a = macroArgs(l.slice(open + 1, close));
      if (a.length < 8) continue;
      const auth = a[6].replace(/^AUTH_/, '');
      rows.push({
        n: rows.length, line: i + 1, fn: a[0], name: unq(a[1]), short: unq(a[2]), kr: unq(a[3]), krShort: unq(a[4]),
        side: a[5].replace(/^TCM_/, ''), auth, authChar: (AUTH[auth] || ['P'])[0], help: unq(a[7]),
        conds: stack.map(t => (t.neg ? 'not ' : '') + (t.kind === 'if' ? t.expr : t.expr)),
        inServer: stack.every(t => t.ws), inClient: stack.every(t => t.nz),
      });
    }
    // ParsingCommand's "open" stop, per build (memcmp( m_pCommand, "open", 4 ))
    for (const side of ['inServer', 'inClient']) {
      let stop = false;
      for (const r of rows) {
        if (!r[side]) continue;
        r[side === 'inServer' ? 'deadServer' : 'deadClient'] = stop;
        if (!stop && r.name.slice(0, 4) === 'open') { stop = true; r.isOpen = true; }
      }
    }
    for (const r of rows) {
      r.dead = !!(r.deadServer || r.deadClient);
      // usable when the game knows it (the game parses first) and, for a server command, the WorldServer too
      r.compiled = r.side === 'SERVER' ? r.inClient && r.inServer : r.side === 'CLIENT' ? r.inClient : r.inClient;
      r.live = r.compiled && !r.dead;
    }
    return { rows, beginLine: begin + 1, endLine: end + 1 };
  }

  // the line of ParsingCommand and of its "open" check (cited on the page)
  function parsingLines(text) {
    const lines = String(text).split('\n');
    return { parsing: lines.findIndex(l => /^int\s+ParsingCommand\s*\(/.test(l)) + 1, openCheck: lines.findIndex(l => /memcmp\(\s*pTextCmdFunc->m_pCommand,\s*"open"/.test(l)) + 1 };
  }

  // ------------------------------------------------------------------ what each command is for (by name, lowercase)
  const CATS = [
    ['summon', 'Summon monsters'], ['items', 'Give items'], ['upgrade', 'Upgrade items'], ['pets', 'Pets'], ['me', 'My character'],
    ['move', 'Move'], ['players', 'Other players'], ['quests', 'Quests'], ['party', 'Party & Guild'], ['siege', 'Guild Siege & 1v1'],
    ['pvp', 'FFA, TDM, Free PK'], ['events', 'Events'], ['couple', 'Couples'], ['server', 'Server & weather'], ['everyone', 'Every player'], ['other', 'Other'],
  ];
  // name -> [category, what it does]
  const INFO = {
    createnpc: ['summon', 'Spawn monsters next to you'], rmvnpc: ['summon', 'Remove the monster / NPC you target'], aroundkill: ['summon', 'Kill the monsters around you'],
    onekill: ['summon', 'Your hits kill monsters at once'], noonekill: ['summon', 'Turn one-hit kills off'], disguise: ['me', 'Look like a monster'], nodisguise: ['me', 'Back to your own look'],
    createitem: ['items', 'Create an item in your bag'], createitem2: ['items', 'Create an item with a random option id'], getgold: ['items', 'Give yourself Penya'],
    piercing: ['upgrade', 'Piercing on an item'], refineaccessory: ['upgrade', 'Set the + level of the accessory in your bag'], refinecollector: ['upgrade', 'Set the + level of a collector'],
    genrandomoption: ['upgrade', 'Roll random options (awake)'], initializerandomoption: ['upgrade', 'Remove random options (awake)'], setrandomoption: ['upgrade', 'Set random options (awake): stat, amount, ...'],
    resistitem: ['upgrade', 'Element and element level on an item'],
    pet: ['pets', 'Set a player\'s pet: kind, EXP, stages, life (the pet must be out, not in the bag; else nothing happens)'], petlevel: ['pets', 'Raise your pet one stage (its EXP must be 100%)'], petexp: ['pets', 'Fill your pet\'s EXP to 100%'],
    makepetfeed: ['pets', 'Open the pet food mill'], setpetname: ['pets', 'Name your pet'], clearpetname: ['pets', 'Remove your pet\'s name'],
    level: ['me', 'Set your job and level'], stat: ['me', 'Set a stat (str / sta / dex / int / gp / all / restate)'], changejob: ['me', 'Change your job'], jobname: ['me', 'Job names'],
    skilllevel: ['me', 'Set a skill\'s level'], skilllevelall: ['me', 'Max every skill'], initskillexp: ['me', 'Reset your skills'], setrebirthlevel: ['me', 'Set your rebirth level'],
    undying: ['me', 'You cannot die'], undying2: ['me', 'You cannot die (HP stays)'], noundying: ['me', 'You can die again'], invisible: ['me', 'Players cannot see you'], noinvisible: ['me', 'Visible again'],
    title: ['me', 'Overhead title'], honortitleset: ['me', 'Set an honor title\'s count'], removebuff: ['me', 'Remove your buffs'], badge: ['me', 'Badges'], record: ['me', 'Record Book'], mountset: ['me', 'Mount values of your mount'],
    teleport: ['move', 'Go to a player, or to a map and place'], position: ['move', 'Show where you stand'], summon: ['move', 'Bring a player to you'],
    out: ['players', 'Kick a player'], freeze: ['players', 'Freeze a player'], nofreeze: ['players', 'Unfreeze a player'], mute: ['players', 'Mute a player'],
    talk: ['players', 'Let a player talk again'], notalk: ['players', 'Stop a player talking'], ip: ['players', 'A player\'s IP'], indirect: ['players', 'Make an NPC say a line'],
    count: ['players', 'How many players are online'], gmlist: ['everyone', 'The GMs online'],
    beginquest: ['quests', 'Start a quest'], endquest: ['quests', 'Finish a quest'], removequest: ['quests', 'Remove a quest'], removeallquest: ['quests', 'Remove every quest'],
    removecompletequest: ['quests', 'Remove the finished quests'], queststate: ['quests', 'Set a quest\'s state'],
    partylevel: ['party', 'Set your party\'s level and points'], guildstat: ['party', 'Guild stats: logo, pxp, penya, notice'], createguild: ['party', 'Create a guild'], destroyguild: ['party', 'Disband a guild'],
    gcin: ['siege', 'Guild Siege: let players in'], gcopen: ['siege', 'Guild Siege: open sign-up'], gcclose: ['siege', 'Guild Siege: close'], gcnext: ['siege', 'Guild Siege: next step'],
    gscancel: ['siege', 'Guild Siege: cancel, no prizes, every fee back'], gsinfo: ['siege', 'Guild Siege: phase and signed-up guilds'],
    gwfight: ['siege', 'Guild Siege fight buff'], gwprizepayout: ['siege', 'Pay the Guild Siege prizes now'], statuerefresh: ['siege', 'Refresh the winner statues'],
    gc1to1open: ['siege', '1v1 guild fight: open'], gc1to1close: ['siege', '1v1 guild fight: close'], gc1to1next: ['siege', '1v1 guild fight: next step'],
    freepkstart: ['pvp', 'Start Free PK Time'], freepkstop: ['pvp', 'Stop Free PK Time'], pvpparam: ['pvp', 'Set your fame and slaughter'], pkparam: ['pvp', 'PK values'],
    ffastart: ['pvp', 'FFA: announce one now (sign-up minutes)'], ffaend: ['pvp', 'FFA: end the battle now, with rewards'], ffaskip: ['pvp', 'FFA: next phase now'], ffanext: ['pvp', 'FFA: the next scheduled one'],
    ffainfo: ['pvp', 'FFA: state and players'], ffarefund: ['pvp', 'FFA: cancel, refund, everyone to town'], ffareload: ['pvp', 'FFA: reload FFAManager.inc'],
    tdmstart: ['pvp', 'TDM: announce one now (sign-up minutes)'], tdmend: ['pvp', 'TDM: end the battle now, with rewards'], tdmskip: ['pvp', 'TDM: next phase now'], tdmnext: ['pvp', 'TDM: the next scheduled one'],
    tdminfo: ['pvp', 'TDM: state and players'], tdmrefund: ['pvp', 'TDM: cancel, refund, everyone to town'], tdmreload: ['pvp', 'TDM: reload TDMManager.inc'],
    savetmp: ['pvp', 'Equalized: save your gear as a preset'], copytmp: ['pvp', 'Equalized: copy a preset'], eqreload: ['pvp', 'Equalized: reload the files'],
    eventstart: ['events', 'Mini Event: start'], eventend: ['events', 'Mini Event: end'], eventskip: ['events', 'Mini Event: skip'], eventnext: ['events', 'Mini Event: next'],
    eventstatus: ['events', 'Mini Event: status'], eventreload: ['events', 'Mini Events: reload MiniEvent.inc'], eventrecipe: ['events', 'Turn-in Race: pick the round\'s items'],
    hidespot: ['events', 'Hide and Seek: spots'], hidegoto: ['events', 'Hide and Seek: go to a spot'], racestart: ['events', 'Vagrant Race: start line'], racepoint: ['events', 'Vagrant Race: checkpoint'],
    eventlist: ['events', 'Lua events: the list'], eventinfo: ['events', 'Lua events: one event'], lua: ['events', 'Reload the Lua events'],
    propose: ['couple', 'Propose'], refuse: ['couple', 'Refuse a proposal'], couple: ['couple', 'Make a couple'], decouple: ['couple', 'Break a couple'], clearpropose: ['couple', 'Clear proposals'], nextcouplelevel: ['couple', 'Next couple level'],
    system: ['server', 'Notice to everyone'], fallsnow: ['server', 'Snow for 60 min (CoreServer OnFallSnow; needs the CoreServer with the 2026-10-24 fix)'],
    stopsnow: ['server', 'Stop the weather (rain or snow)'],
    fallrain: ['server', 'Rain for 60 min'],
    stoprain: ['server', 'Stop the weather (rain or snow)'], weather: ['server', 'Weather'],
    gamesetting: ['server', 'Game settings'], loadscript: ['server', 'Reload scripts'], reloadconstant: ['server', 'Reload constant.inc'], antibot: ['server', 'Bot Check'],
    vendorlist: ['server', 'Offline vendors'], vendorclose: ['server', 'Close an offline vendor'], resetbattlepass: ['server', 'Reset the Battle Pass'], ctd: ['server', 'ctd'], crashtest: ['server', 'Crash test'],
    whisper: ['everyone', 'Whisper'], say: ['everyone', 'Say'], shout: ['everyone', 'Shout'], partychat: ['everyone', 'Party chat'], guildchat: ['everyone', 'Guild chat'], time: ['everyone', 'The time'],
    wiki: ['everyone', 'Item wiki'], switch: ['everyone', 'Switch'], sw: ['everyone', 'Switch'],
  };
  // a row that is only a window shortcut / chat setting for every player
  // feat/gm-rules renames a command and keeps the old name in a Korean-name slot (e.g. "gsstart", "gsstart", "GCOpen", "gcopen"):
  // the old name still finds what it is for
  const infoOf = r => INFO[r.name.toLowerCase()] || INFO[String(r.kr).toLowerCase()] || INFO[String(r.krShort).toLowerCase()] || null;
  const catOf = r => (infoOf(r) || [r.auth === 'GENERAL' ? 'everyone' : 'other'])[0];
  const whatOf = r => (/^[\x20-\x7e]+$/.test(r.help) && /[a-z]{3}/i.test(r.help) && infoOf(r) && r.name.toLowerCase() !== (r.kr || '').toLowerCase() && !INFO[r.name.toLowerCase()] ? r.help.trim() : null)
    || (infoOf(r) || [null, null])[1] || (/^[\x20-\x7e]+$/.test(r.help) && r.help.trim() ? r.help.trim() : null);

  // ------------------------------------------------------------------ argument forms (from each handler, line cited by the UI)
  // k: monster (id), item (id), player (a name), job, world, petkind, stages, num, word, choice, rest (the rest of the line)
  const P = { k: 'player', label: 'Player name' };
  const ARGS = {
    createnpc: [{ k: 'monster', label: 'Monster' }, { k: 'num', label: 'How many', def: 1, min: 1, max: 100 }, { k: 'choice', label: 'Aggressive', def: '0', opts: [['0', 'No'], ['1', 'Yes']] }],
    createitem: [{ k: 'item', label: 'Item' }, { k: 'num', label: 'How many', def: 1, min: 1 }],
    disguise: [{ k: 'monster', label: 'Monster' }],
    pet: [P, { k: 'petkind', label: 'Pet' }, { k: 'num', label: 'EXP %', def: 100, min: 0, max: 100 }, { k: 'stages', label: 'Stages D C B A S', def: '13579' }, { k: 'num', label: 'Life', def: 99, min: 0, max: 99 }],
    petlevel: [], petexp: [], makepetfeed: [], skilllevelall: [], invisible: [], noinvisible: [], count: [], fallsnow: [], stopsnow: [], fallrain: [], stoprain: [],
    setpetname: [{ k: 'word', label: 'Pet name' }],
    teleport: [{ k: 'world', label: 'Map' }, { k: 'num', label: 'X', def: 0, min: 1 }, { k: 'num', label: 'Z', def: 0, min: 1 }],
    summon: [P], out: [P], freeze: [P], nofreeze: [P],
    mute: [P, { k: 'num', label: 'Mute value (m_dwMute)', def: 1, min: 0 }],
    system: [{ k: 'rest', label: 'Message' }],
    stat: [{ k: 'choice', label: 'Stat', def: 'str', opts: [['str', 'STR'], ['sta', 'STA'], ['dex', 'DEX'], ['int', 'INT'], ['gp', 'Stat points'], ['all', 'All four'], ['restate', 'Reset stats']] }, { k: 'num', label: 'Amount', def: 15, min: 0 }],
    level: [{ k: 'job', label: 'Job' }, { k: 'num', label: 'Level', def: 1, min: 1 }, { k: 'num', label: 'Hero / Legend (0 = no, 1-3)', def: 0, min: 0, max: 3, optional: true }],
    changejob: [{ k: 'job', label: 'Job' }],
    getgold: [{ k: 'num', label: 'Penya', def: 1000000, min: 1 }],
    skilllevel: [{ k: 'num', label: 'Skill id', def: 1, min: 0 }, { k: 'num', label: 'Level', def: 1, min: 0 }],
    beginquest: [{ k: 'num', label: 'Quest id', def: 0, min: 0 }], endquest: [{ k: 'num', label: 'Quest id', def: 0, min: 0 }],
    partylevel: [{ k: 'num', label: 'Party level', def: 10, min: 1 }, { k: 'num', label: 'Points', def: 0, min: 0 }],
    indirect: [{ k: 'num', label: 'NPC object id', def: 0, min: 0 }, { k: 'rest', label: 'What it says' }],
    honortitleset: [{ k: 'num', label: 'Title index', def: 0, min: 0 }, { k: 'num', label: 'Count', def: 1, min: 0 }],
    pvpparam: [{ k: 'num', label: 'Fame', def: 0, min: 0 }, { k: 'num', label: 'Slaughter', def: 0 }],
    ffastart: [{ k: 'num', label: 'Sign-up minutes', def: '', min: 1, optional: true }], tdmstart: [{ k: 'num', label: 'Sign-up minutes', def: '', min: 1, optional: true }],
    refineaccessory: [{ k: 'num', label: '+ level', def: 1, min: 0, max: 20 }],
  };
  // a command with sub-words (/GuildStat logo|pxp|penya|notice): { sub: [[word, label, [its own fields]], ...] } -> the first field picks
  // the word (buttons), the rest are that word's fields. A word '' writes nothing (e.g. /antibot <name>).
  const SUB = (label, opts) => ({ sub: opts.map(([v, l, args]) => ({ v, label: l, args: args || [] })), label });
  const N = (label, def = '', more = {}) => Object.assign({ k: 'num', label, def, min: 0 }, more);
  const OPT = { optional: true };
  Object.assign(ARGS, {
    // TextCmd_GuildStat (FuncTextCmd.cpp:2422): a word, then a number (notice: one word, quoted when it has spaces)
    guildstat: SUB('What', [['logo', 'Logo', [N('Logo number', 1)]], ['pxp', 'PXP', [N('Points', 9999)]], ['penya', 'Penya', [N('Penya', 1000000)]],
      ['notice', 'Notice', [{ k: 'word', label: 'Notice text (the guild window shows it)' }]]]),
    // TextCmd_stat (:1406): a word, then the number (restate: none)
    stat: SUB('Stat', [['str', 'STR', [N('Amount', 15)]], ['sta', 'STA', [N('Amount', 15)]], ['dex', 'DEX', [N('Amount', 15)]], ['int', 'INT', [N('Amount', 15)]],
      ['all', 'All four', [N('Amount', 15)]], ['gp', 'Stat points', [N('Points', 0)]], ['restate', 'Reset stats']]),
    // TextCmd_Weather (:5016): rain | snow [time: 30 | 2h | 5d, max 20 days; none = until /weather off] | off
    weather: SUB('Weather', [['rain', 'Rain', [{ k: 'word', label: 'How long (30 = minutes, 2h, 5d; empty = until off)', optional: true }]],
      ['snow', 'Snow', [{ k: 'word', label: 'How long (30 = minutes, 2h, 5d; empty = until off)', optional: true }]], ['off', 'Stop']]),
    // TextCmd_Badge (:1546): add | del | set <id> ; count <id> <count> ; all | clear
    badge: SUB('Do', [['add', 'Unlock', [N('Badge id', 1)]], ['del', 'Remove', [N('Badge id', 1)]], ['set', 'Wear (0 = job icon, -1 = none)', [N('Badge id', 1, { min: -1 })]],
      ['count', 'Set counter', [N('Badge id', 1), N('Count', 0)]], ['all', 'Unlock all'], ['clear', 'Remove all']]),
    // TextCmd_Record (:1945): set <type> <value> ; top <type> ; clear | stats | refresh
    record: SUB('Do', [['set', 'Set a record', [N('Record type', 0), N('Value', 0)]], ['top', 'Top 30 of a type', [N('Record type', 0)]],
      ['stats', 'My records'], ['clear', 'Clear mine'], ['refresh', 'Reload the top 30']]),
    // TextCmd_AntiBot (:1880): <name> (send the puzzle) | info <name> | free <name> | reload
    antibot: SUB('Do', [['', 'Send the puzzle', [{ k: 'player', label: 'Player name' }]], ['info', 'Info', [{ k: 'player', label: 'Player name' }]],
      ['free', 'Free', [{ k: 'player', label: 'Player name' }]], ['reload', 'Reload AntiBot.inc']]),
    // TextCmd_Title (:2081): spender <name> 1|2|3|off ; set <title> [name] ; info [name]
    title: SUB('Do', [['spender', 'Top Donator title', [{ k: 'player', label: 'Player name' }, { k: 'choice', label: 'Rank', def: '1', opts: [['1', '1'], ['2', '2'], ['3', '3'], ['off', 'Off']] }]],
      ['set', 'Set a title', [N('Title', 1), Object.assign({ k: 'player', label: 'Player name' }, OPT)]], ['info', 'Info', [Object.assign({ k: 'player', label: 'Player name' }, OPT)]]]),
    // TextCmd_Lua (:3976): event | ms | rr
    lua: SUB('Reload', [['event', 'Lua events'], ['ms', 'ms'], ['rr', 'Rainbow Race']]),
    // TextCmd_MiniEventStart (:1717): [event|random] [minutes] [players needed]
    eventstart: [{ k: 'choice', label: 'Event', def: 'random', opts: [['random', 'Random'], ['colorgame', 'Color Game'], ['quickhands', 'Quick Hands'], ['oxquiz', 'O/X Quiz'],
      ['luckydraw', 'Lucky Draw'], ['turnin', 'Turn-in Race'], ['hideseek', 'Hide and Seek'], ['race', 'Vagrant Race']] }, N('Minutes', '', OPT), N('Players needed', '', OPT)],
    eventrecipe: [{ k: 'rest', label: 'The round\'s items (rest of the line, item links work)' }],
    // TextCmd_EqCopyPresets (:553): FFA | TDM | GS, from then to (CEqualizedPvP::EventFromName)
    copytmp: [{ k: 'choice', label: 'From', def: 'FFA', opts: [['FFA', 'FFA'], ['TDM', 'TDM'], ['GS', 'Guild Siege']] }, { k: 'choice', label: 'To', def: 'TDM', opts: [['FFA', 'FFA'], ['TDM', 'TDM'], ['GS', 'Guild Siege']] }],
    // TextCmd_GuildCombatClose (:5548): 0 = close now, other = close after the wait
    gcclose: [{ k: 'choice', label: 'When', def: '0', opts: [['0', 'Now'], ['1', 'After the wait']] }],
    gwfight: [N('Wait seconds', 60), N('Fight minutes', 30)],
    gc1to1open: [{ k: 'choice', label: 'Server going down', def: '0', opts: [['0', 'No'], ['1', 'Yes']] }],
    talk: [P], notalk: [P], ip: [P], propose: [P],
    pkparam: [N('PK value', 0), N('Propensity', 0)], setrebirthlevel: [N('Rebirth tier', 1)],
    vendorclose: [{ k: 'player', label: 'Vendor owner' }], createguild: [{ k: 'word', label: 'Guild name' }],
    removequest: [N('Quest id', 0), Object.assign({ k: 'player', label: 'Player name' }, OPT)],
    queststate: [N('Quest id', 0), N('State', 0), Object.assign({ k: 'player', label: 'Player name' }, OPT)],
    eventinfo: [N('Event id', 0)], rmvnpc: [N('Object id', 0)], refinecollector: [N('+ level', 1, { max: 20 })], piercing: [N('Item object id', 0), N('Sockets', 1)],
    resistitem: [N('Item object id', 0), { k: 'choice', label: 'Element', def: '1', opts: [['0', 'None'], ['1', 'Fire'], ['2', 'Water'], ['3', 'Electricity'], ['4', 'Wind'], ['5', 'Earth']] }, N('Element level', 1), N('Ability option', 0)],
  });
  // no words after these (the handler reads none)
  for (const n of ['freepkstart', 'freepkstop', 'ffarefund', 'ffaskip', 'ffaend', 'ffanext', 'ffainfo', 'ffareload', 'tdmrefund', 'tdmskip', 'tdmend', 'tdmnext', 'tdminfo', 'tdmreload',
    'savetmp', 'eqreload', 'undying', 'undying2', 'noundying', 'onekill', 'noonekill', 'aroundkill', 'eventend', 'eventskip', 'eventnext', 'eventstatus', 'hidegoto', 'racestart',
    'racepoint', 'eventreload', 'statuerefresh', 'vendorlist', 'initskillexp', 'removeallquest', 'removecompletequest', 'destroyguild', 'gcin', 'gcopen', 'gcnext', 'eventlist',
    'gamesetting', 'nodisguise', 'reloadconstant', 'ctd', 'genrandomoption', 'initializerandomoption', 'clearpetname', 'refuse', 'couple', 'decouple', 'clearpropose',
    'nextcouplelevel', 'removebuff', 'resetbattlepass', 'gwprizepayout', 'gc1to1close', 'gc1to1next']) if (!ARGS[n]) ARGS[n] = [];
  // -> the fields of a command (a sub-word command: the word field + the chosen word's own fields)
  function argsOf(r, sub) {
    const a = ARGS[r.name.toLowerCase()];
    if (!a || !a.sub) return a;
    const pick = a.sub.find(o => o.v === sub) || a.sub[0];
    return [{ k: 'sub', label: a.label, def: a.sub[0].v, opts: a.sub.map(o => [o.v, o.label]) }, ...pick.args];
  }

  // one argument value as it goes on the line (a name with spaces in quotes: CScanner reads "..." as one token)
  function word(v) {
    v = String(v == null ? '' : v).trim();
    return /\s/.test(v) && !/"/.test(v) ? `"${v}"` : v;
  }
  // -> the command line; vals: one per ARGS entry ({ world: {id}, x, z } style already flattened by the UI)
  function build(r, vals, opts = {}) {
    const cmd = '/' + (opts.short ? r.short : r.name);
    const spec = argsOf(r, vals[0]);
    if (!spec) return (cmd + ' ' + String(vals[0] || '').trim()).trim();
    const out = [];
    spec.forEach((a, i) => {
      const v = vals[i];
      const empty = v === '' || v == null;
      if (a.k === 'sub') { if (!empty) out.push(String(v)); return; }
      if (a.optional && (empty || String(v) === String(a.def))) return;
      // a required word left empty: a visible gap, never a shift (the server reads the words in order)
      out.push(empty ? `<${a.label}>` : a.k === 'rest' ? String(v).trim() : word(v));
    });
    return [cmd, ...out].join(' ');
  }

  // ------------------------------------------------------------------ pet.inc (CPetProperty::LoadScript, pet.cpp): the kinds and how high a stage can roll
  function loadPets(file, ctx) {
    const out = { kinds: [], stageMax: [] };
    if (!file) return out;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    for (let t = s.getToken(); !s.eof; t = s.getToken()) {
      if (t.text === 'AvailDestParam') {
        s.getToken();
        let dst = s.getNumber();
        while (!s.eof && s.token.text !== '}') {
          const params = []; for (let i = 0; i < 9; i++) params.push(s.getNumber().value);
          const item = s.getNumber();
          s.getNumber(); s.getNumber(); s.getNumber(); s.getNumber();
          out.kinds.push({ kind: out.kinds.length, dst: dst.value, item: item.value, params });
          dst = s.getNumber();
        }
      } else if (t.text === 'LevelupAvail') {
        s.getToken();
        let p = s.getNumber();
        while (!s.eof && s.token.text !== '}') {
          let max = p.value > 0 ? 0 : -1;
          for (let i = 1; i < 9; i++) if (s.getNumber().value > 0) max = i;
          out.stageMax.push(max + 1);       // GetLevelupAvailLevel returns i + 1
          p = s.getNumber();
        }
      }
    }
    return out;
  }

  // etc.inc "job" { JOB_x IDS_name base type } (CProject::LoadEtc): the job names /level and /changejob compare with
  function loadJobs(file, ctx) {
    const out = [];
    if (!file) return out;
    const s = new FRE.lexer.Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    for (let t = s.getToken(); !s.eof; t = s.getToken()) {
      if (t.text !== 'job') continue;
      s.getToken();
      let id = s.getNumber();
      while (!s.eof && s.token.text !== '}') {
        const name = s.getToken();
        s.getNumber(); s.getNumber();
        out.push({ id: id.value, name: name.text });
        id = s.getNumber();
      }
      break;
    }
    return out;
  }

  function fromWorkspace(ws) {
    const cpp = ws.cpp || null, text = cpp && cpp.get(FILE);
    if (!text) return { ok: false, rows: [], cats: CATS };
    const base = defines(cpp.get(CUSTOM));
    const W = new Set([...base, ...defines(cpp.get(WS_VER)), '__WORLDSERVER']), N = new Set([...base, ...defines(cpp.get(NZ_VER)), '__CLIENT']);
    const t = parseTable(text, W, N);
    if (!ws.movers && ws.files.get('propmover.txt')) ws.movers = FRE.propMover.loadPropMover(ws.files.get('propmover.txt'), { defines: ws.defines.defines, strings: ws.strings.map });
    const ctx = { defines: ws.defines.defines, strings: ws.strings.map };
    return Object.assign(t, {
      ok: true, cats: CATS, lines: parsingLines(text), hasVer: !!(cpp.get(WS_VER) && cpp.get(NZ_VER)),
      pets: loadPets(ws.files.get('pet.inc'), ctx), jobs: loadJobs(ws.files.get('etc.inc'), ctx),
    });
  }

  function checks(m) {
    if (!m.ok) return [{ module: 'gmcmd', code: 'GM_NO_SOURCE', severity: 'WARN', key: 'GM_NO_SOURCE', file: 'FuncTextCmd.cpp', message: 'FuncTextCmd.cpp was not found: pick FLYFF-V19-SOURCE, or run tools/refresh-fixtures.sh test-data' }];
    const dead = m.rows.filter(r => r.dead && r.compiled).length;
    return dead ? [{ module: 'gmcmd', code: 'GM_DEAD', severity: 'INFO', key: 'GM_DEAD', file: 'FuncTextCmd.cpp', message: `${dead} commands are listed below /open: they can never run` }] : [];
  }

  // a line still holding a <gap> (build above)
  const GAP = /<\S(?:[^<>]*\S)?>/g;
  const gaps = line => String(line).match(GAP) || [];
  const incomplete = line => gaps(line).length > 0;

  FRE.gmCmd = { incomplete, gaps, FILE, CUSTOM, WS_VER, NZ_VER, AUTH, LEVELS, CATS, INFO, ARGS, defines, parseTable, parsingLines, catOf, whatOf, argsOf, build, word, loadPets, loadJobs, fromWorkspace, checks };
})(globalThis.FRE = globalThis.FRE || {});
