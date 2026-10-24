// Every map's monster spawns, the way the WorldServer reads them (Economy task; simulator: loaders/economy-sim.js,
// Python copy: tools/oracle_sim.py economy).
//   file       World/<map>/<map>.rgn (UTF-16LE), read by CWorld::LoadRegion (_Common/WorldFile.cpp:775): token by token, a
//              `region*` record goes to ReadRegion, a `respawn*` record to ReadRespawn, anything else is skipped. Here every
//              token that is not respawn* is skipped (region records hold no respawn* token), like loaders/dungeon.js.
//   record     CWorld::ReadRespawn (WorldFile.cpp:554-770): respawn / respawn2-7 = version 1-7. type, index, x y z, how many
//              (m_nMaxcb, __S1108_BACK_END_SYSTEM is on: WORLDSERVER/VersionCommon.h:54), time (`(short)GetNumber()` stored in
//              the u_short m_uTime), aggressive (m_nMaxAttackNum), the box left top right bottom; v2+: day min max, hour min
//              max, item min max; v4+: AI state, angle; v5+: patrol; v6+: patrol cycle; v3+: control (0, 1 or 2) and, when
//              not 0, the control element (v7: 32 job flags, older: 16).
//   server     ReadRespawn #ifdef __WORLDSERVER: a RANK_GUARD monster only while EVE_PK is on (the language is not Korean,
//              WorldServer.rc IDS_LANG "1"), RANK_MATERIAL never; not RANK_BOSS: time = (u_short)( time x 0.5 ) for Aibatt /
//              Mushpang / Burudeng 1-3, else (u_short)( time x 0.7 ). Then CRespawner::Add (_Common/Respawn.cpp:237, always
//              RESPAWNTYPE_REGION here) halves it again: m_uTime /= 2, and m_nGMIndex = the line's place in the map's list.
// Not modelled: GenResPoint (__RES0807, Respawn.cpp:94): a box with no walkable (flying: no flyable) spot is dropped at
// start; it needs the map's height data, so every box counts here.
(function (FRE) {
  'use strict';
  const RANK = { BOSS: 4, MATERIAL: 6, GUARD: 8 };
  const HALF = ['MI_AIBATT1', 'MI_AIBATT2', 'MI_AIBATT3', 'MI_MUSHPANG1', 'MI_MUSHPANG2', 'MI_MUSHPANG3', 'MI_BURUDENG1', 'MI_BURUDENG2', 'MI_BURUDENG3'];
  const MAX_CTRLDROPITEM = 4, MAX_CTRLDROPMOB = 3, MAX_TRAP = 3;          // CommonCtrl.h
  const u16 = v => v & 0xFFFF;

  // .rgn -> [{ version, type, index, x, y, z, max, time, attack, rect, dayMin, dayMax, hourMin, hourMax }] in file order
  function read(rgnFile, opts) {
    if (!rgnFile) return [];
    const defines = (opts && opts.defines) || new Map();
    const s = new FRE.lexer.Script(rgnFile.text, { defines, strings: new Map(), diags: [] });
    const out = [];
    const num = () => s.getNumber().value;
    for (let t = s.getToken(); t.type !== 'eof'; t = s.getToken()) {
      const m = /^respawn([2-7]?)$/.exec(t.text);
      if (!m) continue;
      const version = m[1] ? Number(m[1]) : 1;
      const r = { version, type: num() >>> 0, index: num() >>> 0, x: s.getFloat().value, y: s.getFloat().value, z: s.getFloat().value };
      r.max = num() | 0;
      r.time = u16(num());                               // (short) GetNumber() into the u_short m_uTime
      r.attack = num() | 0;
      r.rect = [num() | 0, num() | 0, num() | 0, num() | 0];
      r.dayMin = 1; r.dayMax = 30; r.hourMin = 1; r.hourMax = 24;   // CRespawnInfo::CRespawnInfo (Respawn.cpp:20-23)
      if (version >= 2) { r.dayMin = num() | 0; r.dayMax = num() | 0; r.hourMin = num() | 0; r.hourMax = num() | 0; num(); num(); }
      if (version >= 4) { num(); s.getFloat(); }
      if (version >= 5) num();
      if (version >= 6) num();
      if (version >= 3) {
        const ctrl = num() | 0;
        if (ctrl) {
          const two = ctrl === 2;
          num(); num(); if (two) num();                    // set, set item, (set item count)
          num(); num(); num();                             // set level, quest, flag
          if (two) { num(); num(); num(); num(); }
          num();                                           // gender
          for (let i = 0; i < (version <= 6 ? 16 : 32); i++) num();
          num(); num(); num();                             // endurance, min / max items
          for (let i = 0; i < MAX_CTRLDROPITEM * 2 + MAX_CTRLDROPMOB * 3; i++) num();
          num(); num(); num();                             // trap type, random, delay
          for (let i = 0; i < MAX_TRAP * 2; i++) num();
          if (two) { num(); num(); num(); num(); }        // teleport world x y z
        }
      }
      out.push(r);
    }
    return out;
  }

  // What the WorldServer keeps of one record: null when it never spawns it; else the respawner entry
  // { mover, max, seconds (m_uTime after both cuts), attack, dayMin, dayMax, hourMin, hourMax }
  function serverLine(r, movers, defines, opts) {
    const OT_MOVER = defines.get('OT_MOVER');
    if (r.type !== OT_MOVER) return null;
    const mv = movers.get(r.index);
    if (!mv) return null;                                  // no MoverProp: CreateObj fails, the line stops at its first spawn
    if (mv.rankId === RANK.GUARD && !(opts && opts.pkEvent)) return null;
    if (mv.rankId === RANK.MATERIAL) return null;
    let t = r.time;
    if (mv.rankId !== RANK.BOSS) t = u16(Math.trunc(t * (HALF.some(k => defines.get(k) === r.index) ? 0.5 : 0.7)));
    t = Math.floor(t / 2);                                // CRespawner::Add: ri.m_uTime /= 2
    return { mover: r.index, max: r.max, seconds: t, attack: r.attack, dayMin: r.dayMin, dayMax: r.dayMax, hourMin: r.hourMin, hourMax: r.hourMax };
  }

  // ReadRespawn returned before CRespawner::Add: a guard (PK event off) or a material monster that has a MoverProp
  function skipped(r, movers, defines, opts) {
    if (r.type !== defines.get('OT_MOVER')) return false;
    const mv = movers.get(r.index);
    return !!mv && ((mv.rankId === RANK.GUARD && !(opts && opts.pkEvent)) || mv.rankId === RANK.MATERIAL);
  }

  // Every loaded map's monster spawns: [{ world, file, title, lines: [respawner entries + gmIndex] }]
  // worlds: ws.area.worlds (Map id -> { id, file, title }); get(path) -> SourceFile
  function allMaps(worlds, get, movers, defines, opts) {
    const out = [];
    for (const id of [...worlds.keys()].sort((a, b) => a - b)) {
      const w = worlds.get(id);
      if (!w.file) continue;
      const f = get(`world/${w.file}/${w.file}.rgn`);
      if (!f) continue;
      const recs = read(f, { defines });
      const lines = [];
      let added = 0;                                      // m_nGMIndex = how many records CRespawner::Add got before this one
      for (const r of recs) {
        const l = serverLine(r, movers, defines, opts);
        if (l) lines.push(Object.assign(l, { gmIndex: added }));
        if (l || !skipped(r, movers, defines, opts)) added++;
      }
      out.push({ world: id, file: w.file, title: w.title || w.file, lines });
    }
    return out;
  }

  FRE.spawns = { read, serverLine, allMaps, RANK, HALF };
})(globalThis.FRE = globalThis.FRE || {});
