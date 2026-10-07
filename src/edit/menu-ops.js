// New NPC exchange menus (Step 2). No commit adds an exchange menu end to end, so the lines follow the
// commits that add each piece, and the stock menus' label rule:
//   defineNeuz.h        #define MMI_<NAME>\t<id>\t// <npc> exchange menu    (cda3af21 / 15091d5f: MMI 280, 281)
//   defineText.h        #define\tTID_MMI_<NAME>\t\t\t<7000 + id>            after the last TID_MMI_ (stock TID_MMI_*)
//                       #define\t<RESULT TID>\t\t\t\t\t<next>                appended at the end (f58e56ba: 8020-8042)
//   textClient.inc      TID_X\t\t\t\t0xffffffff { IDS_TEXTCLIENT_INC_n }       appended (f58e56ba)
//   textClient.txt.txt  IDS_TEXTCLIENT_INC_n\t<text>                          appended; line i holds key i, so append only
//   Exchange_Script.txt MMI_<NAME> { DESCRIPTION { } SET .. }                 appended, MMI_COLLECT01's layout (f58e56ba)
//   character.inc       AddMenu( MMI_<NAME> );                               after the NPC's last AddMenu (cda3af21)
// The right-click label is TID_MMI_DIALOG (7000) + id (WndWorld.cpp:7283); a menu id without its own case in
// CWndWorld::OnCommand opens the exchange window (WndWorld.cpp:6470); the server only runs ResultExchange
// (DPSrvr.cpp:10721). MAX_MOVER_MENU is 350 (compiled); ids below 282 are taken (240 / 243 have stray TID texts).
//
// spec: { npcKey, menus: [{ name: 'MMI_X', label, sets: [{ cond: [[define, n]], pay: [[define, n, prob]] }] }],
//         results: { tids: ['TID_S', 'TID_F'] } | { add: [{ name, text }, { name, text }] } }
(function (FRE) {
  'use strict';
  const T = FRE.textOps;
  const FIRST_ID = 282, MAX_MOVER_MENU = 350, TID_MMI_DIALOG = 7000;
  const FILES = ['defineneuz.h', 'definetext.h', 'textclient.inc', 'textclient.txt.txt', 'exchange_script.txt', 'character.inc'];

  // #define lines of one header: [{ name, value, start, end (line end incl. EOL), eol }]
  function defineLines(text, prefix) {
    const out = [];
    const re = new RegExp(`^#define[ \\t]+(${prefix}\\w*)[ \\t]+(-?\\d+)[^\\r\\n]*(\\r?\\n|$)`, 'gm');
    for (const m of text.matchAll(re)) out.push({ name: m[1], value: Number(m[2]), start: m.index, end: m.index + m[0].length, eol: m[3] });
    return out;
  }
  // Free menu ids from 282: no MMI_ #define with that value, and no TID at 7000 + id (its label slot).
  function freeMenuIds(ws) {
    const D = ws.defines;
    const usedMmi = new Set(D.withPrefix('MMI_').map(([, v]) => v));
    const usedTid = new Set(D.withPrefix('TID_').map(([, v]) => v));
    const out = [];
    for (let id = FIRST_ID; id < MAX_MOVER_MENU; id++) if (!usedMmi.has(id) && !usedTid.has(TID_MMI_DIALOG + id)) out.push(id);
    return out;
  }
  // The next free TID after the highest one in defineText.h (8044 today, after TID_TOOLTIP_SKILLDMG 8043).
  function nextTid(ws) {
    const f = ws.files.get('definetext.h');
    return Math.max(0, ...defineLines(f ? f.text : '', 'TID_').map(d => d.value)) + 1;
  }
  function nextTextId(ws) {
    let max = -1;
    const f = ws.files.get('textclient.txt.txt');
    if (f) for (const m of f.text.matchAll(/IDS_TEXTCLIENT_INC_(\d+)/g)) max = Math.max(max, Number(m[1]));
    for (const k of ws.strings.map.keys()) if (k.startsWith('IDS_TEXTCLIENT_INC_')) max = Math.max(max, Number(k.slice(19)) || 0);
    return max + 1;
  }
  const tidOf = name => 'TID_' + name;          // MMI_X -> TID_MMI_X (the stock pairing)
  const keyOf = n => 'IDS_TEXTCLIENT_INC_' + String(n).padStart(6, '0');

  // One SET in MMI_COLLECT01's layout (f58e56ba): REMOVE mirrors CONDITION like every proven commit.
  function setText(set, setTid, results, eol) {
    const L = [`\tSET\t${setTid}`, '\t{'];
    const block = (kw, rows) => L.push(`\t\t${kw}`, '\t\t{', ...rows.map(r => '\t\t\t' + r), '\t\t}');
    block('RESULTMSG', results);
    block('CONDITION', set.cond.map(([d, n]) => `${d}\t${n}`));
    block('REMOVE', set.cond.map(([d, n]) => `${d}\t${n}`));
    block(`PAY\t${set.payNum || 1}`, set.pay.map(p => p.join('\t')));
    L.push('\t}');
    return L.join(eol) + eol;
  }
  function menuText(menu, results, eol) {
    const tid = tidOf(menu.name);
    let s = [menu.name, '{', '\tDESCRIPTION', '\t{', `\t\t${tid}`, '\t}', ''].join(eol) + eol;
    for (const set of menu.sets || []) s += setText(set, tid, results, eol);
    return s + '}' + eol;
  }

  // -> { ids, results: [S, F], parts, lines: { defineNeuz, defineText, textInc, textTxt, exchange, character } }
  function newMenusPlan(ws, spec) {
    const f = Object.fromEntries(FILES.map(n => [n, ws.files.get(n)]));
    const missing = FILES.filter(n => !f[n]);
    if (missing.length) throw new Error(`a new exchange menu needs ${missing.join(', ')}`);
    const list = ws.chars && ws.chars.byKey.get(String(spec.npcKey).toLowerCase());
    if (!list || !list.length) throw new Error(`no NPC ${spec.npcKey}`);
    const npc = list[list.length - 1];
    if (npc.file.toLowerCase() !== 'character.inc') throw new Error(`${npc.key} is in ${npc.file}: only character.inc NPCs can get a new menu`);
    const free = freeMenuIds(ws);
    if (free.length < spec.menus.length) throw new Error(`only ${free.length} free menu ids under ${MAX_MOVER_MENU}`);
    const ids = spec.menus.map((m, i) => free[i]);
    const newResults = spec.results && spec.results.add ? spec.results.add : [];
    const results = newResults.length ? newResults.map(r => r.name) : spec.results.tids;
    const parts = [];

    // defineNeuz.h: after the line of the highest MMI_ id (MMI_COLLECTOR_DETAILS 281 today)
    const dn = f['defineneuz.h'], mmis = defineLines(dn.text, 'MMI_').filter(d => d.value < MAX_MOVER_MENU);
    const top = mmis.reduce((a, b) => (b.value > a.value ? b : a));
    const dnEol = top.eol || T.dominantEol(dn.text);
    const dnLines = spec.menus.map((m, i) => `#define ${m.name}\t${ids[i]}\t// ${spec.npcKey} exchange menu${dnEol}`).join('');
    parts.push({ file: 'defineneuz.h', splices: [{ start: top.end, end: top.end, insert: (top.eol ? '' : dnEol) + dnLines }] });

    // defineText.h: TID_MMI_ labels after the last TID_MMI_ in 7000..7349; result TIDs appended at the end
    const dt = f['definetext.h'];
    const labelTids = defineLines(dt.text, 'TID_MMI_').filter(d => d.value >= TID_MMI_DIALOG && d.value < TID_MMI_DIALOG + MAX_MOVER_MENU);
    const lt = labelTids.reduce((a, b) => (b.value > a.value ? b : a));
    const dtEol = lt.eol || T.dominantEol(dt.text);
    const dtLabels = spec.menus.map((m, i) => `#define\t${tidOf(m.name)}\t\t\t${TID_MMI_DIALOG + ids[i]}${dtEol}`).join('');
    const dtSplices = [{ start: lt.end, end: lt.end, insert: (lt.eol ? '' : dtEol) + dtLabels }];
    let tid = nextTid(ws), dtResults = '';
    if (newResults.length) {
      dtResults = `// ${spec.npcKey} exchange menus - result messages${dtEol}` +
        newResults.map(r => `#define\t${r.name}\t\t\t\t\t${tid++}${dtEol}`).join('');
      dtSplices.push(FRE.npcOps.appendSplice(dt.text, dtResults));
    }
    parts.push({ file: 'definetext.h', splices: dtSplices });

    // textClient.inc + textClient.txt.txt: one block and one line per new TID (labels, then results)
    const texts = [...spec.menus.map(m => ({ tid: tidOf(m.name), text: m.label })), ...newResults.map(r => ({ tid: r.name, text: r.text }))];
    let n = nextTextId(ws);
    const keyed = texts.map(t => Object.assign({ key: keyOf(n++) }, t));
    const ti = f['textclient.inc'], tiEol = T.dominantEol(ti.text);
    const tiBody = `${tiEol}// ${spec.npcKey} exchange menus${tiEol}${tiEol}` +
      keyed.map(t => `${t.tid}\t\t\t\t0xffffffff${tiEol}{${tiEol}\t${t.key}${tiEol}}${tiEol}${tiEol}`).join('');
    parts.push({ file: 'textclient.inc', splices: [FRE.npcOps.appendSplice(ti.text, tiBody)] });
    const tt = f['textclient.txt.txt'], ttEol = T.dominantEol(tt.text);
    const ttBody = keyed.map(t => `${t.key}\t${t.text}${ttEol}`).join('');
    parts.push({ file: 'textclient.txt.txt', splices: [FRE.npcOps.appendSplice(tt.text, ttBody)] });

    // Exchange_Script.txt: the menus appended after a blank line
    const ex = f['exchange_script.txt'], exEol = T.dominantEol(ex.text);
    const exBody = spec.menus.map(m => menuText(m, results, exEol)).join(exEol);
    parts.push({ file: 'exchange_script.txt', splices: [FRE.npcOps.appendSplice(ex.text, exEol + exBody)] });

    // character.inc: AddMenu lines after the NPC's last AddMenu
    const ci = f['character.inc'];
    const anchor = npc.statements.filter(r => r.cmd === 'AddMenu').pop() || npc.statements[0];
    if (!anchor) throw new Error(`${npc.key} has no setting block to add a menu to`);
    const ciEol = T.eolAt(ci.text, anchor.end) || T.dominantEol(ci.text), ind = T.indentOf(ci.text, anchor.start);
    const rows = spec.menus.map(m => `AddMenu( ${m.name} );`).join(ciEol + ind);
    parts.push({ file: 'character.inc', splices: T.insertRowAfter(ci.text, anchor, rows) });

    return { ids, results, texts: keyed, parts,
      lines: { defineNeuz: dnLines, defineText: dtLabels + dtResults, textInc: tiBody, textTxt: ttBody, exchange: exBody, character: rows } };
  }

  // More recipes in an existing menu, before its closing brace (a blank line between recipes, like MMI_COLLECT01).
  // opts.setTid / opts.results: TID names; when omitted, the menu's first recipe's are reused.
  function addSetsPlan(ws, menu, sets, opts = {}) {
    const ex = ws.files.get('exchange_script.txt');
    if (!menu.close) throw new Error(`${menu.name} is never closed with "}"`);
    const first = menu.sets[0];
    const setTid = opts.setTid || (first ? first.text.name : (menu.description[0] || {}).name);
    const results = opts.results || (first ? first.resultMsg.map(r => r.name) : null);
    if (!setTid) throw new Error('pick a text for the recipe (no recipe or description to copy it from)');
    if (!results || results.length < 2) throw new Error('pick the success and failure messages (no recipe to copy them from)');
    const at = T.lineStart(ex.text, menu.close.start);
    const eol = T.eolAt(ex.text, menu.close.start) || T.dominantEol(ex.text);
    const body = sets.map(st => setText(st, setTid, results, eol)).join(eol);
    return [{ file: 'exchange_script.txt', splices: [{ start: at, end: at, insert: (menu.sets.length ? eol : '') + body }] }];
  }

  FRE.menuOps = { addSetsPlan, newMenusPlan, freeMenuIds, nextTid, nextTextId, menuText, setText, defineLines, FIRST_ID, MAX_MOVER_MENU, TID_MMI_DIALOG, FILES };
})(globalThis.FRE = globalThis.FRE || {});
