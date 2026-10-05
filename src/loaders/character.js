// character.inc / character-etc.inc / character-school.inc loader, ported from
// CProject::LoadCharacter (Project.cpp:3257). All three files feed one NPC map.
//
// Shape:  NpcKey  <one token the server assumes is '{'>  ...statements...  '}'
// The server reads the key, swallows ONE token without checking it is '{',
// then counts braces until depth 0. Unknown words (e.g. "setting", ";") are
// skipped. Each recognised command below reads a fixed token sequence, and the
// separators ('(' ',' ')') are consumed blindly; we record what was actually
// there so validation can flag a wrong separator (which would shift arguments).
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;

  const CHARACTER_FILES = ['character.inc', 'character-etc.inc', 'character-school.inc'];
  const SHOP_CMDS = new Set(['AddVendorItem', 'AddVenderItem', 'AddVendorItem2', 'AddVenderItem2', 'AddShopItem', 'AddVendorItemLang']);

  // Reader for one statement: wraps Script and records every consumed token
  // with the separator the server *expects* there.
  class Stmt {
    constructor(script, cmdTok) {
      this.s = script;
      this.rec = { cmd: cmdTok.text, start: cmdTok.start, end: cmdTok.end, args: {}, seps: [], line: -1 };
    }
    sep(expect) {                 // script.GetToken() used to skip a separator
      const t = this.s.getToken();
      this.rec.seps.push({ expect, got: t.text, start: t.start, end: t.end, eof: t.type === 'eof' });
      if (t.type !== 'eof') this.rec.end = t.end;
      return t;
    }
    num(name) {
      const r = this.s.getNumber();
      this.rec.args[name] = r;
      if (!r.eof) this.rec.end = r.end;
      return r;
    }
    flt(name) {
      const r = this.s.getFloat();
      this.rec.args[name] = r;
      if (!r.eof) this.rec.end = r.end;
      return r;
    }
    tok(name) {
      const t = this.s.getToken();
      this.rec.args[name] = t;
      if (t.type !== 'eof') this.rec.end = t.end;
      return t;
    }
    langScript(name) {            // CProject::GetLangScript: value, ')', ';'
      const t = this.tok(name);
      this.sep(')'); this.sep(';');
      return t;
    }
  }

  // Each handler mirrors the matching "else if( script.Token == ... )" branch.
  const HANDLERS = {
    randomItem(st) {               // InterpretRandomItem (Project.cpp): { ... ; ... }
      st.sep('{');
      let t = st.s.getToken();
      while (t.text[0] !== '}') {
        if (t.type === 'eof') { st.rec.hang = true; break; }   // the server would loop forever here
        t = st.s.getToken();
      }
      st.rec.end = t.end;
    },
    SetEquip(st) {
      st.sep('(');
      let i = 0;
      for (;;) {
        const t = st.s.token;
        if (t.text[0] === ')') break;
        if (t.type === 'eof') { st.rec.hang = true; break; }   // server: infinite loop
        st.num('equip' + i++);
        st.sep(',');
      }
    },
    m_szName(st) { st.sep('='); st.tok('name'); },
    SetName(st) { st.sep('('); st.langScript('name'); },
    SetFigure(st) { st.sep('('); st.num('mover'); st.sep(','); st.num('hairMesh'); st.sep(','); st.num('hairColor'); st.sep(','); st.num('headMesh'); },
    SetMusic(st) { st.sep('('); st.num('music'); },
    m_nStructure(st) { st.sep('='); st.num('structure'); },
    m_szChar(st) { st.sep('='); st.langScript('image'); },
    m_szDialog(st) { st.sep('='); st.tok('dialog'); },
    m_szDlgQuest(st) { st.sep('='); st.tok('dlgQuest'); },
    SetImage(st) { st.sep('('); st.langScript('image'); },
    AddMenuLang(st) { st.sep('('); st.num('lang'); st.sep(','); st.num('menu'); st.sep(')'); },   // __NO_SUB_LANG
    AddMenu(st) { st.sep('('); st.num('menu'); st.sep(')'); },
    AddVenderSlot(st) { st.sep('('); st.num('slot'); st.sep(','); st.tok('title'); st.sep(')'); },
    AddVendorSlot(st) { st.sep('('); st.num('slot'); st.sep(','); st.langScript('title'); },
    AddVendorSlotLang(st) { st.sep('('); st.num('lang'); st.sep(','); st.num('slot'); st.sep(','); st.langScript('title'); },
    AddVendorItemLang(st) {
      st.sep('('); st.num('lang'); st.sep(',');
      st.num('slot'); st.sep(','); st.num('ik3'); st.sep(','); st.num('job'); st.sep(',');
      st.num('rareMin'); st.sep(','); st.num('rareMax'); st.sep(','); st.num('count'); st.sep(')');
    },
    AddVendorItem(st) {
      st.sep('('); st.num('slot'); st.sep(','); st.num('ik3'); st.sep(','); st.num('job'); st.sep(',');
      st.num('rareMin'); st.sep(','); st.num('rareMax'); st.sep(','); st.num('count'); st.sep(')');
    },
    AddVendorItem2(st) { st.sep('('); st.num('slot'); st.sep(','); st.num('item'); st.sep(')'); },
    SetVenderType(st) { st.sep('('); st.num('type'); st.sep(')'); },
    SetBuffSkill(st) {
      st.sep('('); st.num('skill'); st.sep(','); st.num('level'); st.sep(','); st.num('minLv'); st.sep(',');
      st.num('maxLv'); st.sep(','); st.num('time'); st.sep(')');
    },
    SetLang(st) {
      st.sep('('); st.num('lang');
      const t = st.s.getToken();
      st.rec.seps.push({ expect: ', or )', got: t.text, start: t.start, end: t.end });
      st.rec.end = t.end;
      if (t.text === ',') st.num('subLang');
      else st.sep(';');              // the server reads one more token after ')'
    },
    SetOutput(st) { st.sep('('); st.tok('value'); st.sep(')'); },
    AddTeleport(st) { st.sep('('); st.flt('x'); st.sep(','); st.flt('z'); st.sep(')'); },
    AddShopItem(st) {                // custom __ADDSHOPITEM: (slot, item [, cost])
      st.sep('('); st.num('slot'); st.sep(','); st.num('item');
      const t = st.s.getToken();
      st.rec.seps.push({ expect: ', or )', got: t.text, start: t.start, end: t.end, eof: t.type === 'eof' });
      if (t.type !== 'eof') st.rec.end = t.end;
      if (t.text === ',') { st.num('cost'); st.sep(')'); }
    },
  };
  HANDLERS.AddVenderItem = HANDLERS.AddVendorItem;
  HANDLERS.AddVenderItem2 = HANDLERS.AddVendorItem2;

  function loadCharacterFile(state, file, ctx) {
    const script = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: state.diags });
    let keyTok = script.getToken();
    while (!script.eof) {
      const npc = {
        key: keyTok.text, keyRaw: keyTok.raw || keyTok.text, file: file.name,
        start: keyTok.start, keyEnd: keyTok.end, end: keyTok.end,
        statements: [], closed: false, missingBrace: false,
        venderType: 0, menus: [], slotTitles: {}, name: null, nameKey: null,
      };
      const brace = script.getToken();           // assumed '{'
      npc.braceTok = brace;
      if (brace.text !== '{') npc.missingBrace = true;
      let depth = 1;
      while (depth && !script.eof) {
        const t = script.getToken();
        if (t.type === 'eof') break;
        npc.end = t.end;
        if (t.text === '{') depth++;
        else if (t.text === '}') depth--;
        else {
          const h = HANDLERS[t.text];
          if (!h) continue;
          const st = new Stmt(script, t);
          h(st);
          const rec = st.rec;
          rec.npc = npc;
          npc.end = Math.max(npc.end, rec.end);
          npc.statements.push(rec);
          if (rec.cmd === 'SetName') { npc.name = rec.args.name.text; npc.nameKey = rec.args.name.stringKey || null; }
          if (rec.cmd === 'SetVenderType') npc.venderType = rec.args.type.value;
          if (rec.cmd === 'AddMenu') npc.menus.push(rec.args.menu.value);
          if (rec.cmd === 'AddVendorSlot' || rec.cmd === 'AddVenderSlot') npc.slotTitles[rec.args.slot.value] = rec.args.title.text;
        }
      }
      npc.closed = depth === 0;
      state.npcs.push(npc);
      const lk = npc.key.toLowerCase();
      if (!state.byKey.has(lk)) state.byKey.set(lk, []);
      state.byKey.get(lk).push(npc);
      keyTok = script.getToken();
    }
  }

  function loadCharacters(files, ctx) {
    const state = { npcs: [], byKey: new Map(), diags: [], missing: [], files: [] };
    for (const name of CHARACTER_FILES) {
      const f = files.get(name.toLowerCase());
      if (!f) { state.missing.push(name); continue; }
      state.files.push(f.name);
      loadCharacterFile(state, f, ctx);
    }
    return state;
  }

  // Normalised view of a shop statement, or null.
  function shopEntry(rec) {
    const a = rec.args;
    switch (rec.cmd) {
      case 'AddShopItem': return { kind: 'fixed', slot: a.slot && a.slot.value, item: a.item, cost: a.cost || null };
      case 'AddVendorItem2': case 'AddVenderItem2': return { kind: 'chip', slot: a.slot && a.slot.value, item: a.item, cost: null };
      case 'AddVendorItem': case 'AddVenderItem': case 'AddVendorItemLang':
        return { kind: 'generated', slot: a.slot && a.slot.value, ik3: a.ik3, job: a.job, rareMin: a.rareMin, rareMax: a.rareMax, count: a.count, lang: a.lang || null };
      default: return null;
    }
  }

  FRE.character = { loadCharacters, CHARACTER_FILES, SHOP_CMDS, shopEntry };
})(globalThis.FRE = globalThis.FRE || {});
