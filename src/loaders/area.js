// Where an NPC stands, named the way the game client names it (simulator; Python copy:
// tools/oracle_sim.py area).
//   position     .dyo mover records (FRE.world.readDyo): CObj::Read multiplies x and z by OLD_MPU = 4
//                (_Common/Obj.cpp:525, DefineCommon.cpp:11); CWorld::LoadObject (WorldFile.cpp:297) uses them as is.
//   world title  CWorldMng::LoadScript (_Common/worldmng.cpp:302): World.inc `WI_x SetTitle( IDS_… )`.
//   map window   CWndMapEx::GetMapArea (_Interface/WndMapEx.cpp:1385) = CContinent::GetTown, else
//                CContinent::GetContinent (_Common/Continent.cpp: Init reads World/WdMadrigal/WdMadrigal.wld.cnt,
//                Point_In_Poly), named by the first MCC_MAP_NAME entry of propMapComboBoxData.inc with that
//                SetLocationID (CMapInformationManager::LoadPropMapComboBoxData, MapInformationManager.cpp:261;
//                InitializeMapComboBoxSelecting, WndMapEx.cpp:571).
//                Every town block of WdMadrigal.wld.cnt has C_useRealData 0, so Init skips it: GetTown never
//                finds a town and the map window never opens Flarine / Sain City / Darken / Eillun by itself.
//   area caption CWorld::LoadRegion / ReadRegion (WorldFile.cpp:775, 413): World/<map>/<map>.rgn, titles from the
//                string table (CProject::LoadStrings, ProjectCmn.cpp:1253). The client's region loop
//                (_Interface/WndWorld.cpp:9258-9370, caption style bdf9f5cb): regions in file order, CRect::PtInRect;
//                the first region newly entered sets the navigator name, sends its desc lines to the chat,
//                shows its title (first line big, it clears the old area names; the rest small), then stops
//                for this frame (__VER >= 9 break).
//   teleport     TextCmd_Teleport (_Interface/FuncTextCmd.cpp:2718): `/te <world id> <x> <z>`, ints above 0.
// Not modelled: RA_INN regions (the client checks the land height; here the player stands on the ground),
// caption timers and fades, music, regions the server adds at run time (CDPClient::OnAddRegion), DBCS lead
// bytes. respawn records are skipped token by token (their arguments are all numbers). In other worlds the
// map window is not modelled (GetMapArea still reads Madrigal's polygons there); the world title names them.
(function (FRE) {
  'use strict';
  const OLD_MPU = 4;

  // CProject::LoadStrings: only the files that hold world, region and map-window names, in its order
  // (__JEFF_11_4, __AZRIA_1023, __IMPROVE_MAP_SYSTEM and __VER >= 19 are on in Neuz/VersionCommon.h).
  const STRING_FILES = [
    'world.txt.txt',
    ...['WdVolcane', 'WdMadrigal:wdMadrigal', 'WdKebaras', 'WdGuildWar', 'WdEvent01', 'DuMuscle', 'DuKrr', 'DuFlMas', 'DuDaDk',
      'DuBear', 'DuSaTemple', 'DuSaTempleBoss', 'WdVolcane', 'WdVolcaneRed', 'WdVolcaneYellow', 'WdArena',
      'WdHeaven01:wdheaven01', 'WdHeaven02:wdheaven02', 'WdHeaven03:wdheaven03', 'WdHeaven04:wdheaven04', 'WdHeaven05:wdheaven05',
      'WdHeaven06:wdheaven06', 'WdHeaven06_1:wdheaven06_1', 'WdCisland', 'DuOminous:duominous', 'DuOminous_1:duominous_1',
      'WdGuildhousesmall', 'WdGuildhousemiddle', 'WdGuildhouselarge', 'DuDreadfulCave', 'DuRustia', 'DuRustia_1'].map(worldTxt),
    'propMapComboBoxData.txt.txt',
    ...['WdRartesia', 'DuBehamah', 'DuKalgas', 'WdColosseum', 'DuUpresia', 'DuUpresia_1', 'DuSanpres', 'DuSanpres_1',
      'DuHerneos', 'DuHerneos_1', 'WdFwc', 'WdMarket', 'WdDarkRartesia'].map(worldTxt),
  ];
  function worldTxt(s) { const [dir, file] = s.split(':'); return `World/${dir}/${file || dir}.txt.txt`; }

  const script = (file, defines, strings) => new FRE.lexer.Script(file ? file.text : '', { defines, strings, diags: [] });
  // CProject::GetLangScript (ProjectCmn.cpp:1241): the token, then ")" and ";"; an empty one becomes " "
  function langScript(s) {
    const t = s.getToken();
    s.getToken(); s.getToken();
    return t.type === 'eof' || t.text === '' ? ' ' : t.text;
  }
  const isEnd = t => t.type === 'eof';
  const byte = v => v & 0xff;
  // C integer division (LONG / LONG truncates toward zero)
  const cdiv = (a, b) => Math.trunc(a / b);

  // The area string table: get(relPath) -> { name, text } | null. First key wins.
  function loadStrings(get) {
    const state = { map: new Map(), meta: new Map(), diags: [], missing: [] };
    for (const p of STRING_FILES) {
      const f = get(p);
      if (f) FRE.loadStringFile(state, f); else state.missing.push(p);
    }
    return state.map;
  }

  // CWorldMng::LoadScript -> Map id -> { id, file, title }
  function readWorlds(file, defines, strings) {
    const s = script(file, defines, strings);
    const out = new Map();
    let mark = s.lex.pos;
    let i = s.getNumber().value;
    let brace = 1;
    while (brace) {
      if (isEnd(s.token) || s.token.text[0] === '}') {
        brace--;
        if (brace === 0) continue;
      }
      const t = s.getToken();
      if (t.text === 'SetTitle') {
        s.getToken();                                    // (
        const title = langScript(s);
        if (out.has(i)) out.get(i).title = title;
      } else {
        s.lex.pos = mark;                                // GoMark
        i = s.getNumber().value;
        const f = s.getToken();
        out.set(i, { id: i, file: isEnd(f) ? '' : f.text, title: '' });
      }
      mark = s.lex.pos;                                  // SetMark
      i = s.getNumber().value;
    }
    return out;
  }

  // CContinent::Init -> { cont: Map id -> [[x, z]...] (closed), towns: Map }. std::map keeps the first insert.
  function readContinents(file, defines, strings) {
    const s = script(file, defines, strings);
    const cont = new Map(), towns = new Map();
    let vec = [], id = 0, town = 0;
    for (;;) {
      const t = s.getToken();
      if (isEnd(t)) break;
      if (t.text === 'Continent') {
        const u = s.getToken();
        if (u.text === 'BEGIN') vec = [];
        else if (u.text === 'END') {
          if (vec.length) vec.push(vec[0]);
          const m = town ? towns : cont;
          if (!m.has(byte(id))) m.set(byte(id), vec.slice());
          town = 0;
        }
      } else if (t.text === 'C_id') id = s.getNumber().value;
      else if (t.text === 'VERTEX') {
        const x = s.getFloat().value; s.getFloat(); const z = s.getFloat().value;
        vec.push([Math.trunc(x), Math.trunc(z)]);       // CPoint( (int)x, (int)z )
      } else if (t.text === 'TOWN') town = s.getNumber().value;
      else if (t.text === 'C_useRealData') {
        if (!s.getNumber().value) {                     // client-only look: skip to END
          for (;;) { const k = s.getToken(); if (isEnd(k) || k.text === 'END') break; }
        }
      }
    }
    return { cont, towns };
  }

  // CContinent::Point_In_Poly (LONG arithmetic)
  function pointInPoly(vec, x, y) {
    let counter = 0, p1 = vec[0];
    const n = vec.length;
    for (let i = 1; i <= n; i++) {
      const p2 = vec[i % n];
      if (y > Math.min(p1[1], p2[1]) && y <= Math.max(p1[1], p2[1]) && x <= Math.max(p1[0], p2[0]) && p1[1] !== p2[1]) {
        const xinters = cdiv((y - p1[1]) * (p2[0] - p1[0]), p2[1] - p1[1]) + p1[0];
        if (p1[0] === p2[0] || x <= xinters) counter++;
      }
      p1 = p2;
    }
    return counter % 2 === 1;
  }

  // GetContinent( vPos ) / GetTown( vPos ): the first polygon in id order
  function lookup(polys, x, z) {
    const px = Math.trunc(x), pz = Math.trunc(z);
    for (const id of [...polys.keys()].sort((a, b) => a - b)) if (pointInPoly(polys.get(id), px, pz)) return id;
    return 0;
  }

  // CWndMapEx::GetMapArea
  function mapArea(model, x, z) {
    const D = model.defines;
    let loc = lookup(model.towns, x, z);
    if (loc === 0) loc = lookup(model.cont, x, z);
    for (const t of ['TOWN_SAINCITY', 'TOWN_DARKEN', 'TOWN_FLARINENOSPLE', 'TOWN_ELIUN'])
      if (loc === D.get(t)) loc = lookup(model.towns, x, z);
    return loc;
  }

  // LoadPropMapComboBoxData -> the MCC_MAP_NAME entries in file order [{ id, loc, title }]
  function readMapNames(file, defines, strings) {
    const s = script(file, defines, strings);
    const out = [];
    let id = s.getNumber().value;
    while (!isEnd(s.token)) {
      s.getToken();                                     // {
      let cat = defines.get('MCC_MAP_CATEGORY'), title = '', loc = 0, nb = 1;
      while (nb > 0 && !isEnd(s.token)) {
        const w = s.getToken().text;
        if (w === '{') nb++;
        else if (w === '}') nb--;
        else if (w === 'SetCategory') { s.getToken(); cat = s.getNumber().value; s.getToken(); s.getToken(); }
        else if (w === 'SetTitle') { s.getToken(); title = langScript(s); }
        else if (w === 'SetPictureFile' || w === 'SetMonsterInformationFile') { s.getToken(); langScript(s); }
        else if (w === 'SetRealPositionRect') { s.getToken(); for (let k = 0; k < 4; k++) { s.getNumber(); s.getToken(); } s.getToken(); }
        else if (w === 'SetLocationID') { s.getToken(); loc = byte(s.getNumber().value); s.getToken(); s.getToken(); }
        else if (w === 'SetNPCPosition') { s.getToken(); s.getNumber(); s.getToken(); s.getNumber(); s.getToken(); s.getToken(); }
        else if (w === 'SetParentID') { s.getToken(); s.getNumber(); s.getToken(); s.getToken(); }
      }
      if (cat === defines.get('MCC_MAP_NAME')) out.push({ id, loc, title });
      id = s.getNumber().value;
    }
    return out;
  }

  // CWorld::LoadRegion + ReadRegion -> m_aRegion [{ rect: [l, t, r, b], attr, title, desc }]
  function readRegions(file, defines, strings) {
    const s = script(file, defines, strings);
    const skip = ['RI_BEGIN', 'RI_REVIVAL', 'RI_STRUCTURE'].map(n => defines.get(n));
    const out = [];
    const text = () => { s.getToken(); const t = s.getToken(); s.getToken(); return (isEnd(t) ? '' : t.text).split('\\n').join('\r\n'); };
    for (let t = s.getToken(); !isEnd(t); t = s.getToken()) {
      if (!['region', 'region2', 'region3'].includes(t.text)) continue;
      const v2 = t.text !== 'region', v3 = t.text === 'region3';
      s.getNumber();                                   // dwType
      const index = s.getNumber().value >>> 0;
      s.getFloat(); s.getFloat(); s.getFloat();        // vPos
      const attr = s.getNumber().value >>> 0;
      s.getNumber(); s.getNumber();                    // music, direct music
      s.getToken(); s.getToken();                      // script, sound
      s.getNumber(); s.getFloat(); s.getFloat(); s.getFloat();   // teleport world and position
      const rect = [s.getNumber().value, s.getNumber().value, s.getNumber().value, s.getNumber().value];
      s.getToken(); s.getNumber();                     // key, target key
      if (v3) for (let k = 0; k < 11; k++) s.getNumber();
      let title = '', desc = '';
      if (!v2) {
        if (byte(s.getNumber().value)) desc = text();  // m_cDescSize is a char
      } else {
        s.getToken();                                  // "title"
        if (s.getNumber().value) title = text();
        s.getToken();                                  // "desc"
        if (s.getNumber().value) desc = text();
      }
      if (!skip.includes(index)) out.push({ rect, attr, title, desc });
    }
    return out;
  }

  // The caption loop's line split: CRLF or NUL ends a line; after a CRLF it stops at a NUL (the
  // buffers are zero-filled, so reading past the end finds zeros).
  function captionLines(text) {
    const b = text + '\0\0\0', out = [];
    let cur = '', i = 0;
    for (;;) {
      if ((b[i] === '\r' && b[i + 1] === '\n') || b[i] === '\0') {
        out.push(cur); cur = ''; i += 2;
        if (i >= b.length || b[i] === '\0') break;
      } else cur += b[i++];
    }
    return out;
  }

  const newState = () => ({ nav: null, caps: [], msgs: [] });

  // One frame of the client's region loop -> index of the region entered, or null
  function frame(regs, inside, st, x, z) {
    const px = Math.trunc(x), pz = Math.trunc(z);
    for (let i = 0; i < regs.length; i++) {
      const [l, t, r, b] = regs[i].rect;
      if (l <= px && px < r && t <= pz && pz < b) {            // CRect::PtInRect
        if (inside[i]) continue;
        const reg = regs[i];
        if (reg.title === '') st.nav = '';
        inside[i] = true;
        for (const line of captionLines(reg.desc)) if (line) st.msgs.push(line);
        captionLines(reg.title).forEach((line, n) => {
          if (!line) return;
          if (n === 0) { st.nav = line; st.caps = [[line, true]]; }     // AddAreaCaption( bNewArea ): old area names go
          else st.caps.push([line, false]);
        });
        return i;                                               // one new region per frame
      }
      inside[i] = false;
    }
    return null;
  }

  // Arrive at (x, z) with every region left, and stay until no new region is entered.
  function stand(regs, x, z) {
    const inside = regs.map(() => false), st = newState(), entered = [];
    for (let f = 0; f <= regs.length; f++) {
      const i = frame(regs, inside, st, x, z);
      if (i === null) break;
      entered.push(i);
    }
    return { entered, nav: st.nav, caps: st.caps, msgs: st.msgs };
  }

  // Walk the path (int points), at most `step` units per axis each frame; every region entry is an event.
  function walk(regs, path, step) {
    const inside = regs.map(() => false), st = newState(), events = [];
    const pts = [[path[0][0], path[0][1]]];
    for (let k = 1; k < path.length; k++) {
      const [ax, az] = path[k - 1], [bx, bz] = path[k];
      const dx = bx - ax, dz = bz - az, n = Math.floor(Math.max(Math.abs(dx), Math.abs(dz)) / step) + 1;
      for (let j = 1; j <= n; j++) pts.push([ax + cdiv(dx * j, n), az + cdiv(dz * j, n)]);
    }
    pts.forEach(([x, z], f) => {
      const m = st.msgs.length;
      const i = frame(regs, inside, st, x, z);
      if (i !== null) events.push({ f, x, z, region: i, nav: st.nav, caps: st.caps.map(c => c.slice()), msgs: st.msgs.slice(m) });
    });
    return { frames: pts.length, events };
  }

  // Everything the client needs to name a spot. get(relPath) -> { name, text } | null (case-insensitive);
  // dyo: Map world file name -> bytes.
  function build({ defines, get, dyo }) {
    const strings = loadStrings(get);
    const worlds = readWorlds(get('World.inc'), defines, strings);
    const { cont, towns } = readContinents(get('World/WdMadrigal/WdMadrigal.wld.cnt'), defines, strings);
    const model = { defines, strings, worlds, cont, towns, maps: readMapNames(get('propMapComboBoxData.inc'), defines, strings),
      regions: new Map(), placed: new Map(), firstId: new Map(), cache: new Map() };
    for (const id of [...worlds.keys()].sort((a, b) => a - b)) {
      const name = worlds.get(id).file;
      if (!name || model.firstId.has(name)) continue;
      model.firstId.set(name, id);
      const rgn = get(`World/${name}/${name}.rgn`);
      model.regions.set(name, rgn ? readRegions(rgn, defines, strings) : []);
      const bytes = dyo && dyo.get(name);
      model.placed.set(name, bytes ? FRE.world.readDyo(bytes).placements : []);
    }
    model.madrigal = (worlds.get(defines.get('WI_WORLD_MADRIGAL')) || {}).file;
    return model;
  }

  const mapTitle = (model, loc) => { const m = model.maps.find(x => x.loc === loc); return m ? m.title : null; };

  // What the client shows when a player stands at (x, z) in a world (file name)
  function standAt(model, world, x, z) {
    const r = stand(model.regions.get(world) || [], x, z);
    const loc = world === model.madrigal ? mapArea(model, x, z) : null;
    return Object.assign(r, { mapArea: loc, mapWindow: loc === null ? null : mapTitle(model, loc) });
  }

  // Every spot where the NPC (character key) stands: [{ world, worldId, worldTitle, x, z, mapWindow, nav, caps, place, caption, te }]
  function whereIs(model, key) {
    if (!model) return null;
    const k = String(key).toLowerCase();
    if (model.cache.has(k)) return model.cache.get(k);
    const out = [];
    for (const [world, list] of model.placed) for (const p of list) {
      if (p.key.toLowerCase() !== k) continue;
      const r = standAt(model, world, p.x, p.z);
      const id = model.firstId.get(world), w = model.worlds.get(id);
      const worldTitle = w && w.title.trim() ? w.title : world;
      const caption = r.caps.map(c => c[0]).join(' / ');
      const x = Math.trunc(p.x), z = Math.trunc(p.z);
      out.push(Object.assign(r, { world, worldId: id, worldTitle, x: p.x, z: p.z, caption,
        place: world === model.madrigal ? (r.mapWindow || worldTitle) : worldTitle,
        te: x > 0 && z > 0 ? `/te ${id} ${x} ${z}` : null }));
    }
    model.cache.set(k, out);
    return out;
  }

  // "Flaris — Flarine / Central Flarine"
  const label = w => w.caption ? `${w.place} — ${w.caption}` : w.place;

  FRE.area = { OLD_MPU, STRING_FILES, loadStrings, readWorlds, readContinents, pointInPoly, lookup, mapArea, readMapNames,
    readRegions, captionLines, frame, stand, walk, build, mapTitle, standAt, whereIs, label };
})(globalThis.FRE = globalThis.FRE || {});
