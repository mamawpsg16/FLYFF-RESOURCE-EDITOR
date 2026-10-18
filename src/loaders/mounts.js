// Mounts (Mount.inc): how each mount item sits, moves, plays its leg loops and flies. Port of
// CProject::LoadMountAnimationList (_Common/Project.cpp:618-790, V19 b43949aa speeds + loops, a5325b65 flying), called once at
// startup by the WorldServer AND the game (Project.cpp:1102): UTF-16LE + BOM, CRLF; Server + identical Client copy.
//   Add_Mount { dwID=<item>; nType=<0|1>; ... }   each block starts from the defaults below; keys in any order;
//   an unknown word is skipped one token at a time (the loop just reads the next token);
//   the same dwID twice: the LAST block wins (m_mapMountAnimation[ dwID ] = mountAnim);
//   a block without its "}" never ends (while( s.Token != "}" ) also runs at the end of the file): the startup hangs.
// Where each value is used: loaders/mount-sim.js.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const f32 = Math.fround;

  // every key the loader knows, in the C++ order. kind: n = GetNumber, f = GetFloat (stored as float), s = a token (s.token)
  // def = the value the block starts with (Project.cpp:633-645). min / max: the /mountset limits (FuncTextCmd.cpp:166-260)
  // where that command can set the key; the editor uses the same ranges.
  const FIELDS = [
    { key: 'dwID', kind: 'n', def: 0, group: 'id', label: 'Mount item' },
    { key: 'nType', kind: 'n', def: 0, group: 'fly', label: 'Can fly' },
    { key: 'nBindBone', kind: 'n', def: 0, group: 'seat', label: 'Seat bone' },
    { key: 'fOffSetX', kind: 'f', def: 0, group: 'seat', label: 'Seat offset X' },
    { key: 'fOffSetY', kind: 'f', def: 0, group: 'seat', label: 'Seat offset Y' },
    { key: 'fOffSetZ', kind: 'f', def: 0, group: 'seat', label: 'Seat offset Z' },
    { key: 'fRotX', kind: 'f', def: 0, group: 'seat', label: 'Seat turn X (degrees)' },
    { key: 'fRotY', kind: 'f', def: 0, group: 'seat', label: 'Seat turn Y (degrees)' },
    { key: 'fRotZ', kind: 'f', def: 0, group: 'seat', label: 'Seat turn Z (degrees)' },
    { key: 'fGroundSpeed', kind: 'f', def: 0, group: 'ground', label: 'Speed', min: 0, minOpen: true, max: 10, cmd: 'speed' },
    { key: 'szStand', kind: 's', def: '', group: 'loops', label: 'Standing loop' },
    { key: 'szWalk', kind: 's', def: '', group: 'loops', label: 'Walk-mode loop', cmd: 'walkani' },
    { key: 'szRun', kind: 's', def: '', group: 'loops', label: 'Moving loop', cmd: 'runani' },
    { key: 'szWalkBack', kind: 's', def: '', group: 'loops', label: 'Backing-up loop', cmd: 'backani' },
    { key: 'fAnimSpeed', kind: 'f', def: 1, group: 'ground', label: 'Moving leg speed', min: 0, minOpen: true, max: 10, cmd: 'run' },
    { key: 'fWalkAnimSpeed', kind: 'f', def: 1, group: 'ground', label: 'Walk / back leg speed', min: 0, minOpen: true, max: 10, cmd: 'walk' },
    { key: 'fNameOffset', kind: 'f', def: 0, group: 'name', label: 'Name height', min: -5, max: 10, cmd: 'name' },
    { key: 'fFlightSpeed', kind: 'f', def: 0, group: 'fly', label: 'Flying push', min: 0, max: 0.02, cmd: 'fly' },
    { key: 'fFlyAnimSpeed', kind: 'f', def: 1, group: 'fly', label: 'Flying leg speed', min: 0, minOpen: true, max: 10, cmd: 'flyanim' },
    { key: 'fFlyMaxSpeed', kind: 'f', def: 0, group: 'fly', label: 'Flying top speed', min: 0, max: 2, cmd: 'flymax' },
    { key: 'szFlyStand', kind: 's', def: '', group: 'flyloops', label: 'Hovering loop' },
    { key: 'szFlyWalk', kind: 's', def: '', group: 'flyloops', label: 'Flying-forward loop' },
    { key: 'szFlyStart', kind: 's', def: '', group: 'flyloops', label: 'Take-off (plays once)' },
    { key: 'szFlyLand', kind: 's', def: '', group: 'flyloops', label: 'Landing (plays once)' },
  ];
  const BY_KEY = new Map(FIELDS.map(f => [f.key, f]));
  // MOUNT_MOVE_TYPE (ProjectCmn.h:625): only MOUNT_WALK_FLY (1) may take off (DPSrvr.cpp:7844 OnMountFly)
  const MOUNT_WALK = 0, MOUNT_WALK_FLY = 1, MOUNT_FLY = 2;

  function defaults() {
    const a = {};
    for (const f of FIELDS) a[f.key] = f.def;
    return a;
  }

  // file: a SourceFile (text). ctx: { defines }. -> { file, blocks, anims: Map(id -> block that wins), hang: block | null, diags }
  //   block: { start, end, open, close, id, anim, entries: [{ key, field, keyTok, value: {start,end}, raw, stmtEnd }], unknown: [tok] }
  function loadMounts(file, ctx = {}) {
    const text = file.text;
    const s = new Script(text, { file: file.name, defines: ctx.defines || new Map(), diags: [] });
    const blocks = [], anims = new Map();
    let hang = null;
    let t = s.getToken();
    while (t.type !== 'eof') {
      if (t.text === 'Add_Mount') {
        const b = { start: t.start, end: t.end, open: null, close: null, id: 0, anim: defaults(), entries: [], unknown: [] };
        b.open = s.getToken();                                     // { (not checked)
        let tok = b.open;
        for (;;) {
          if (tok.text === '}') { b.close = tok; break; }
          if (tok.type === 'eof') { hang = b; break; }           // the C++ loops here forever
          const field = BY_KEY.get(tok.text);
          if (field && tok.type !== 'string') {
            s.getToken();                                          // =
            let value, raw;
            if (field.kind === 's') {
              const v = s.getToken();
              value = { start: v.start, end: v.end, quoted: v.type === 'string' }; raw = v.text;
              b.anim[field.key] = v.text;
            } else {
              const v = field.kind === 'n' ? s.getNumber() : s.getFloat();
              value = { start: v.start, end: v.end }; raw = text.slice(v.start, v.end);
              b.anim[field.key] = field.kind === 'n' ? (field.key === 'dwID' ? v.value >>> 0 : v.value | 0) : f32(v.value);
            }
            const semi = s.getToken();                             // ;
            b.entries.push({ key: field.key, field, keyTok: tok, value, raw, stmtEnd: semi.end });
          } else b.unknown.push(tok);
          tok = s.getToken();
        }
        if (hang) { b.end = text.length; blocks.push(b); break; }
        b.end = b.close.end;
        b.id = b.anim.dwID;
        blocks.push(b);
        anims.set(b.id, b);                                        // the last block with an id wins
      }
      t = s.getToken();
    }
    return { file: file.name, blocks, anims, hang, diags: s.diags };
  }

  // the value of one key in a block: the last statement of that key wins (each one overwrites the field)
  function entryOf(b, key) {
    let e = null;
    for (const x of b.entries) if (x.key === key) e = x;
    return e;
  }

  // "/mountset" alone prints (FuncTextCmd.cpp:252-256):
  //   Mount 225049: fGroundSpeed=0.40; fAnimSpeed=1.65; fWalkAnimSpeed=1.25; fNameOffset=0.00;
  //   szRun="item_X_run.ani"; szWalk="item_X_walk.ani"; szWalkBack="item_X_walkback.ani";
  // (+ the fly line when the mount flies). Reads every key=value; a pasted Mount.inc block works too.
  function parsePaste(str) {
    const out = { id: null, values: {}, unknown: [] };
    const m = /Mount\s+(\d+)\s*:/.exec(str) || /dwID\s*=\s*(\d+)/.exec(str);
    if (m) out.id = Number(m[1]);
    const re = /(\b[A-Za-z]\w*)\s*=\s*("([^"\r\n]*)"|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*;?/g;
    for (let r; (r = re.exec(str));) {
      const f = BY_KEY.get(r[1]);
      if (!f || f.key === 'dwID') { if (!f) out.unknown.push(r[1]); continue; }
      if (f.kind === 's') { if (r[3] !== undefined) out.values[f.key] = r[3]; else out.unknown.push(r[1]); }
      else if (r[3] === undefined) out.values[f.key] = f.kind === 'n' ? parseInt(r[2], 10) : Number(r[2]);
    }
    return out;
  }

  // a model's own motion file: CModelObject::GetMotionFileName (item_<model>_<motion>.ani for an OT_ITEM model)
  const motionFile = (model, motion) => `item_${model}_${motion}.ani`;

  // the mount task's view of the workspace: every IK3_MOUNT item and every block, with names, models, the model's .ani files
  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    const f = ws.files.get('mount.inc');
    const m = loadMounts(f, { defines: D });
    const mf = ws.files.get('mdldyna.inc');
    const mdl = mf ? FRE.mdlDyna.loadMdlDyna(mf, { defines: D }) : null;
    const IK3_MOUNT = D.has('IK3_MOUNT') ? D.get('IK3_MOUNT') : -2;
    const names = ws.clientModelNames || null;           // Client/Model file names (real case), when the Client folder is picked
    // the .ani files of each mount model (item_<model>_*.ani), read once
    const anis = names ? names.filter(n => /^item_.*\.ani$/i.test(n)) : [];
    const anisOf = model => { const p = `item_${model.toLowerCase()}_`; return anis.filter(n => n.toLowerCase().startsWith(p)).sort(); };
    const mounts = [], byId = new Map();
    const add = id => {
      if (byId.has(id)) return byId.get(id);
      const it = ws.items.items.get(id) || null;
      const info = it ? ws.itemInfo(it) : null;
      const e = mdl ? mdl.items.get(id) : null;
      const g = fld => it ? FRE.specItem.get(it, fld) : 0;
      const x = { id, define: it ? it.define : null, item: it, info, name: info ? (info.name || it.define) : `#${id}`,
        isMount: !!it && g('dwItemKind3') === IK3_MOUNT, model: e ? e.name : null,
        itemFlight: it ? f32(g('fFlightSpeed')) : 0, flightLimit: it ? g('dwFlightLimit') | 0 : 0,
        blocks: [], block: null, anim: null };
      x.anis = x.model ? anisOf(x.model) : [];
      mounts.push(x); byId.set(id, x);
      return x;
    };
    for (const it of ws.items.items.values()) if (FRE.specItem.get(it, 'dwItemKind3') === IK3_MOUNT) add(it.id);
    for (const b of m.blocks) {
      if (b === m.hang) continue;
      const x = add(b.id);
      x.blocks.push(b);
    }
    for (const x of mounts) { x.block = m.anims.get(x.id) || null; x.anim = x.block ? x.block.anim : null; }
    mounts.sort((a, b) => a.id - b.id);
    return Object.assign(m, { mounts, byId, mdl, hasModels: !!names, IK3_MOUNT });
  }

  FRE.mounts = { loadMounts, fromWorkspace, entryOf, parsePaste, defaults, motionFile, FIELDS, BY_KEY, MOUNT_WALK, MOUNT_WALK_FLY, MOUNT_FLY, FILE: 'Mount.inc' };
})(globalThis.FRE = globalThis.FRE || {});
