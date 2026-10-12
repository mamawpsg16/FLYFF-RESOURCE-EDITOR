// Equalized PvP (task "PvP Events", __FL_EQUALIZED_MODE): the two WorldServer files, read the way CEqualizedPvP reads them, with
// the offsets the edits need. No DOM. C++: FLYFF-V19-SOURCE/Source/Source/WORLDSERVER/EqualizedPvP.cpp (ec3657c7, verified in game
// 2026-10-12; the shared-preset header is the later change EQ_PRESET_EVENT, not yet tested).
//   EqualizedPvP.inc      CEqualizedPvP::ReadConfig (EqualizedPvP.cpp:121), a CScript at WorldServer start and on /eqreload.
//                         One line per event: EVENT ON cap x8. An unknown event word: "Nothing changed" (the old settings stay).
//                         ON = GetNumber() != 0; a cap <= 0 is 0 (nobody may pick that class); an event with no line is off, caps 99.
//   EqualizedPresets.inc  CEqualizedPvP::LoadPresetFile (EqualizedPvP.cpp:~806) right after ReadConfig. One shared set per class +
//                         gender for every event: [EVENT] CLASS MALE|FEMALE { HP { … } ATTACK { … } BAG { … } } (an old event word is
//                         skipped). A bad header stops the loading (the presets read so far stay). A later block of the same class +
//                         gender replaces the earlier one. Items: EqPlaceItem (EqualizedPvP.cpp:~739).
// Not modelled: what the C++ reads after an unknown section word (it breaks out of the preset mid-file; here the reading stops there).
(function (FRE) {
  'use strict';
  const NULL_ID = -1;
  const EVENTS = ['FFA', 'TDM', 'GS'];
  const EVENT_LABEL = { FFA: 'FFA', TDM: 'TDM', GS: 'Guild Siege' };
  // picker order (APP_TMP_CLASS buttons): EqClassFromName / HeroJobOfClass (EqualizedPvP.cpp:245)
  const CLASSES = [
    { word: 'SLAYER', label: 'Slayer', hero: 'JOB_STORMBLADE_HERO', chain: ['JOB_VAGRANT', 'JOB_MERCENARY', 'JOB_BLADE', 'JOB_BLADE_MASTER', 'JOB_BLADE_HERO', 'JOB_STORMBLADE_HERO'] },
    { word: 'TEMPLAR', label: 'Templar', hero: 'JOB_LORDTEMPLER_HERO', chain: ['JOB_VAGRANT', 'JOB_MERCENARY', 'JOB_KNIGHT', 'JOB_KNIGHT_MASTER', 'JOB_KNIGHT_HERO', 'JOB_LORDTEMPLER_HERO'] },
    { word: 'HARLEQUIN', label: 'Harlequin', hero: 'JOB_WINDLURKER_HERO', chain: ['JOB_VAGRANT', 'JOB_ACROBAT', 'JOB_JESTER', 'JOB_JESTER_MASTER', 'JOB_JESTER_HERO', 'JOB_WINDLURKER_HERO'] },
    { word: 'CRACKSHOOTER', label: 'Crackshooter', hero: 'JOB_CRACKSHOOTER_HERO', chain: ['JOB_VAGRANT', 'JOB_ACROBAT', 'JOB_RANGER', 'JOB_RANGER_MASTER', 'JOB_RANGER_HERO', 'JOB_CRACKSHOOTER_HERO'] },
    { word: 'MENTALIST', label: 'Mentalist', hero: 'JOB_MENTALIST_HERO', chain: ['JOB_VAGRANT', 'JOB_MAGICIAN', 'JOB_PSYCHIKEEPER', 'JOB_PSYCHIKEEPER_MASTER', 'JOB_PSYCHIKEEPER_HERO', 'JOB_MENTALIST_HERO'] },
    { word: 'ARCANIST', label: 'Arcanist', hero: 'JOB_ELEMENTORLORD_HERO', chain: ['JOB_VAGRANT', 'JOB_MAGICIAN', 'JOB_ELEMENTOR', 'JOB_ELEMENTOR_MASTER', 'JOB_ELEMENTOR_HERO', 'JOB_ELEMENTORLORD_HERO'] },
    { word: 'FORCEMASTER', label: 'Force Master', hero: 'JOB_FORCEMASTER_HERO', chain: ['JOB_VAGRANT', 'JOB_ASSIST', 'JOB_BILLPOSTER', 'JOB_BILLPOSTER_MASTER', 'JOB_BILLPOSTER_HERO', 'JOB_FORCEMASTER_HERO'] },
    { word: 'SERAPH', label: 'Seraph', hero: 'JOB_FLORIST_HERO', chain: ['JOB_VAGRANT', 'JOB_ASSIST', 'JOB_RINGMASTER', 'JOB_RINGMASTER_MASTER', 'JOB_RINGMASTER_HERO', 'JOB_FLORIST_HERO'] },
  ];
  const SEXES = ['MALE', 'FEMALE'];          // SEX_MALE 0, SEX_FEMALE 1
  const SECTIONS = ['HP', 'ATTACK', 'BAG'];
  const ELEMENTS = ['FIRE', 'WATER', 'ELECTRICITY', 'WIND', 'EARTH'];   // SAI79::FIRE 1 … EARTH 5 (EqElementFromName)
  const EQ_LEVEL = 150;
  // the body slots (defineNeuz.h PARTS_*) a preset fills, in the order the editor shows them
  const SLOTS = [
    ['PARTS_RWEAPON', 'Weapon'], ['PARTS_LWEAPON', 'Left weapon'], ['PARTS_SHIELD', 'Shield'], ['PARTS_CAP', 'Helmet'], ['PARTS_UPPER_BODY', 'Suit'],
    ['PARTS_HAND', 'Gauntlets'], ['PARTS_FOOT', 'Boots'], ['PARTS_NECKLACE1', 'Necklace'], ['PARTS_RING1', 'Ring 1'], ['PARTS_RING2', 'Ring 2'],
    ['PARTS_EARRING1', 'Earring 1'], ['PARTS_EARRING2', 'Earring 2'], ['PARTS_CLOAK', 'Cloak'], ['PARTS_MASK', 'Mask'], ['PARTS_HAT', 'Fashion hat'],
    ['PARTS_CLOTH', 'Fashion suit'], ['PARTS_GLOVE', 'Fashion gloves'], ['PARTS_BOOTS', 'Fashion shoes'], ['PARTS_CLOAK2', 'Fashion cloak'],
    ['PARTS_BULLET', 'Arrows'], ['PARTS_RIDE', 'Board / broom'],
  ];
  const sp = n => ({ start: n.start, end: n.end });

  // CScript token -> EqTokenNumber: a number (the lexer already turned a known #define into its number) or -1 (GetDefineNum: unknown)
  function tokenNumber(t) {
    if (!t || t.text === '') return -1;
    const c = t.text[0];
    if ((c >= '0' && c <= '9') || c === '-') return FRE.lexer.atoi(t.text).value;
    return -1;
  }
  const wordOf = t => (t.define || t.raw || t.text);
  const eqWord = (t, w) => t.type !== 'eof' && wordOf(t).toUpperCase() === w;

  // ---------------------------------------------------------------- EqualizedPvP.inc
  // -> { missing, failed (unknown event: nothing changed), error, errorAt, events: { FFA: { on, caps[8], line: { key, on, caps: [span] } } } }
  function readEvents(file, defines) {
    const res = { file: 'EqualizedPvP.inc', missing: !file, failed: false, error: null, errorAt: null, events: {}, last: null };
    for (const e of EVENTS) res.events[e] = { on: false, caps: CLASSES.map(() => 99), line: null };
    if (!file) { res.error = 'EqualizedPvP.inc not found: every event stays normal'; return res; }
    const s = new FRE.lexer.Script(file.text, { file: 'EqualizedPvP.inc', defines: defines || new Map(), diags: [] });
    const read = {};
    for (const e of EVENTS) read[e] = { on: false, caps: CLASSES.map(() => 99), line: null };
    s.getToken();
    while (!s.eof) {
      const t = s.token, ev = EVENTS.find(e => eqWord(t, e));
      if (!ev) { res.failed = true; res.error = `unknown event "${t.text}" (FFA, TDM or GS): nothing changed`; res.errorAt = sp(t); return res; }
      const on = s.getNumber();
      const caps = CLASSES.map(() => s.getNumber());
      read[ev] = { on: on.value !== 0, caps: caps.map(n => (n.value > 0 ? n.value : 0)),
        line: { key: sp(t), on: Object.assign(sp(on), { value: on.value }), caps: caps.map(n => Object.assign(sp(n), { value: n.value })), stmt: { start: t.start, end: caps[7].end } } };
      res.last = read[ev].line.stmt;
      s.getToken();
    }
    res.events = read;
    return res;
  }

  // ---------------------------------------------------------------- EqualizedPresets.inc
  // ctx: { defines, items: Map id -> Spec_Item record }
  // -> { missing, stopped: { message, at } | null, presets: [block] (every block as written), byKey: Map 'CLASS|SEX' -> the block the server
  //      keeps (the later one), problems: [{ message, at, preset }] }
  // block: { cls, sex, header: span, open, close, eventWord: span|null, sections: { HP: sec, ATTACK: sec, BAG: sec }, order: [names] }
  // sec: { open, close, items: [item] }; item: { id, define, upgrade, elem, elemLv, count, awakes: [{ dst, adj }], cards: [id], span, problems }
  function readPresets(file, ctx = {}) {
    const res = { file: 'EqualizedPresets.inc', missing: !file, stopped: null, presets: [], byKey: new Map(), problems: [] };
    if (!file) return res;
    const D = ctx.defines || new Map();
    const s = new FRE.lexer.Script(file.text, { file: 'EqualizedPresets.inc', defines: D, diags: [] });
    const stop = (message, at) => { res.stopped = { message, at }; };
    s.getToken();
    while (!s.eof) {
      const head = s.token;
      let eventWord = null;
      if (EVENTS.some(e => eqWord(s.token, e))) { eventWord = sp(s.token); s.getToken(); }
      const cTok = s.token, cls = CLASSES.findIndex(c => eqWord(cTok, c.word));
      const xTok = s.getToken(), sex = SEXES.findIndex(w => eqWord(xTok, w));
      const open = s.getToken();
      if (cls < 0 || sex < 0 || open.text !== '{') {
        stop(`bad preset header near "${open.text}" (CLASS MALE|FEMALE {): the server stops reading the file here`, { start: head.start, end: open.end });
        break;
      }
      const block = { cls, sex, header: { start: head.start, end: xTok.end }, eventWord, open: sp(open), close: null, sections: {}, order: [], problems: [] };
      res.presets.push(block);
      const where = `${CLASSES[cls].label} ${SEXES[sex].toLowerCase()}`;
      const problem = (message, at) => { const p = { message: `${where}: ${message}`, at, preset: block }; block.problems.push(p); res.problems.push(p); };
      s.getToken();
      let broke = false;
      while (!s.eof && s.token.text !== '}') {
        const secTok = s.token, name = SECTIONS.find(w => eqWord(secTok, w));
        const sOpen = s.getToken();
        if (!name || sOpen.text !== '{') {
          problem(`expected HP / ATTACK / BAG {, found "${sOpen.text}"`, { start: secTok.start, end: sOpen.end });
          stop(`${where}: a section word is wrong: the server reads the rest of the file out of step (fix it first)`, { start: secTok.start, end: sOpen.end });
          broke = true;
          break;
        }
        const sec = { name, word: sp(secTok), open: sp(sOpen), close: null, items: [] };
        block.sections[name] = sec;
        block.order.push(name);
        // the C++ fills one spec from the section start: words before the first ITEM change a spec that is never placed
        let cur = { dummy: true, awakes: [], cards: [], span: { start: 0, end: 0 } };
        s.getToken();
        while (!s.eof) {
          const t = s.token;
          const end = t.text === '}';
          if (end || eqWord(t, 'ITEM')) {
            if (!cur.dummy) { cur.span.end = cur.lastEnd; sec.items.push(cur); }
            if (end) break;
            const idTok = s.getToken();
            const id = tokenNumber(idTok);
            cur = { id, define: idTok.define || (id < 0 ? idTok.text : null), idSpan: sp(idTok), upgrade: 0, elem: 0, elemLv: 0, count: 1, awakes: [], cards: [],
              span: { start: t.start, end: idTok.end }, lastEnd: idTok.end, words: [] };
          } else if (eqWord(t, 'UPGRADE')) { const n = s.getToken(); cur.upgrade = tokenNumber(n); cur.lastEnd = n.end; }
          else if (eqWord(t, 'COUNT')) { const n = s.getToken(); cur.count = tokenNumber(n); cur.lastEnd = n.end; }
          else if (eqWord(t, 'ELEMENT')) {
            const e = s.getToken(), n = s.getToken();
            const k = ELEMENTS.findIndex(w => eqWord(e, w));
            cur.elem = k + 1; cur.elemLv = tokenNumber(n); cur.lastEnd = n.end;
            if (k < 0) problem(`unknown element "${e.text}" (FIRE, WATER, ELECTRICITY, WIND or EARTH): the item gets no element`, sp(e));
          } else if (eqWord(t, 'AWAKE')) {
            const d = s.getToken(), a = s.getToken();
            const dst = tokenNumber(d), adj = tokenNumber(a);
            cur.lastEnd = a.end;
            if (dst > 0 && cur.awakes.length < 3) cur.awakes.push({ dst, adj, define: d.define || null });
            else problem('bad AWAKE (unknown DST or more than 3): skipped', { start: t.start, end: a.end });
          } else if (eqWord(t, 'CARD')) { const n = s.getToken(); cur.cards.push(tokenNumber(n)); cur.lastEnd = n.end; }
          else if (eqWord(t, 'RAISEDPET')) {
            // its own entry (EqPlaceRaisedPet): the pending ITEM is placed first, the words after it until the next ITEM change nothing
            if (!cur.dummy) { cur.span.end = cur.lastEnd; sec.items.push(cur); }
            const k = s.getToken();
            sec.items.push({ raisedPet: tokenNumber(k), id: -2, define: k.define || k.text, idSpan: sp(k), upgrade: 0, elem: 0, elemLv: 0, count: 1, awakes: [], cards: [], span: { start: t.start, end: k.end } });
            cur = { dummy: true, awakes: [], cards: [], span: { start: 0, end: 0 } };
          }
          else problem(`unknown word "${t.text}": skipped`, sp(t));
          s.getToken();
        }
        sec.close = sp(s.token);
        s.getToken();
      }
      if (broke) break;
      block.close = sp(s.token);
      res.byKey.set(`${cls}|${sex}`, block);
      s.getToken();
    }
    return res;
  }

  // ---------------------------------------------------------------- one workspace
  function fromWorkspace(ws) {
    const D = ws.defines.defines, f = n => ws.files.get(n) || null;
    const events = readEvents(f('equalizedpvp.inc'), D);
    const presets = readPresets(f('equalizedpresets.inc'), { defines: D, items: ws.items.items });
    return { events, presets, present: !!(f('equalizedpvp.inc') || f('equalizedpresets.inc')) };
  }

  FRE.equalized = { NULL_ID, EVENTS, EVENT_LABEL, CLASSES, SEXES, SECTIONS, ELEMENTS, SLOTS, EQ_LEVEL, readEvents, readPresets, fromWorkspace };
})(globalThis.FRE = globalThis.FRE || {});
