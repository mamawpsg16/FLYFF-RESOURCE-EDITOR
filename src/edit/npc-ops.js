// Add New NPC (docs/HANDOFF-ADD-NPC.md): the exact bytes a new NPC adds to
//   character.inc      a new block at the end (CProject::LoadCharacter, Project.cpp:3257)
//   character.txt.txt  new IDS_CHARACTER_INC_ lines at the end (name, tab names; like f58e56ba, d09949ac, d11123ac)
//   World/<map>/<map>.dyo  one 200-byte OT_MOVER record (ReadObj, CreateObj.cpp:761; CObj::Read, Obj.cpp:474;
//                      CMover::Read, Mover.cpp:3365), inserted where the server stops reading (the final 0xFFFFFFFF)
// A new building tag (form.newTag = its text) adds, the way b4b9a465 added SRT_FASHIONSHOP .. SRT_REDCHIPMERCHANT
// (verified in game):
//   defineNeuz.h  #define SRT_<NAME> <id>   after the last SRT_ line (id: newNpcSim.freeStructureIds, under MAX_STRUCTURE)
//   etc.inc       SRT_<NAME> IDS_ETC_INC_n  before the structure block's }   (CProject::LoadEtc, Project.cpp:1262)
//   etc.txt.txt   IDS_ETC_INC_n <text>      appended
// b4b9a465 also changed Source/Resource/defineNeuz.h (the build's copy); the editor writes only Server + Client.
// No V19 commit has added an NPC yet; the record's name/dialog fields are zero, as in every record of
// WdMadrigal.dyo since b6abf414 (verified in game).
//
// form: { key, name, model: 'MI_X', image: 'IDS_..' | null, structure: 'SRT_X' | null, map, x, y, z, angle,
//         newTag: 'Dungeon Pieces' | null (a new building tag instead of structure),
//         menus: ['MMI_X', ...], tabs: [{ slot, title, rules: [{ ik3, job, min, max }], items: [{ define, cost }] }] }
// x / z are what /position prints in game (world units); the file stores them / OLD_MPU (4).
(function (FRE) {
  'use strict';
  const RECORD = 200;
  const ID_PREFIX = 'IDS_CHARACTER_INC_';

  // The highest IDS_CHARACTER_INC_ number in the three NPC files and in every loaded string table.
  function lastStringId(ws) {
    let max = 0;
    const scan = t => { for (const m of t.matchAll(/IDS_CHARACTER_INC_(\d+)/g)) max = Math.max(max, Number(m[1])); };
    for (const n of [...FRE.character.CHARACTER_FILES, 'character.txt.txt']) { const f = ws.files.get(n); if (f) scan(f.text); }
    for (const k of ws.strings.map.keys()) if (k.startsWith(ID_PREFIX)) max = Math.max(max, Number(k.slice(ID_PREFIX.length)) || 0);
    return max;
  }
  const idsKey = n => ID_PREFIX + String(n).padStart(6, '0');

  // The texts this NPC needs, each with its new IDS key: the name first, then each tab title in tab order.
  function newStrings(ws, form) {
    let n = lastStringId(ws);
    const out = [{ what: 'name', text: form.name, key: idsKey(++n) }];
    for (const t of tabsOf(form)) out.push({ what: 'tab', slot: t.slot, text: t.title, key: idsKey(++n) });
    return out;
  }
  const tabsOf = form => (form.menus || []).includes('MMI_TRADE') ? [...(form.tabs || [])].sort((a, b) => a.slot - b.slot) : [];

  // The character.inc block (handoff §5.2: TAB indent, the file's EOL).
  function blockText(form, strings, eol) {
    const L = [];
    const S = strings.find(s => s.what === 'name').key;
    L.push(form.key, '{', '\tsetting', '\t{');
    for (const m of form.menus || []) L.push(`\t\tAddMenu( ${m} );`);
    for (const t of tabsOf(form)) {
      for (const r of t.rules || []) L.push(`\t\tAddVendorItem( ${t.slot}, ${r.ik3}, ${r.job}, ${r.min}, ${r.max}, 100 );`);
      for (const it of t.items || []) L.push(`\t\tAddShopItem( ${t.slot}, ${it.define}${it.cost ? ', ' + it.cost : ''} );`);
    }
    if (form.structure) L.push(`\t\tm_nStructure= ${form.structure};`);
    if (form.image) L.push('\t\tSetImage', '\t\t(', `\t\t${form.image}`, '\t\t);');
    L.push('\t}', '\tSetName', '\t(', `\t${S}`, '\t);');
    for (const s of strings) if (s.what === 'tab') L.push(`\tAddVendorSlot( ${s.slot}, ${s.key} );`);
    L.push('}');
    return L.join(eol) + eol;
  }

  // Splice that appends `body` at the end of a text file, after a line break if the file lacks one.
  function appendSplice(text, body, lead = '') {
    const eol = FRE.textOps.dominantEol(text);
    const needs = text.length && !/[\r\n]$/.test(text);
    return { start: text.length, end: text.length, insert: (needs ? eol : '') + lead + body };
  }

  // The 200-byte record (handoff §3.1). Defaults are those of 398 of the 447 placed NPCs:
  // axis 0, scale 1, motion 0xFFFFFFFF, AI 0 / 2, belligerence 1, extra flag 0.
  function buildRecord({ angle, x, y, z, model, key }) {
    const b = new Uint8Array(RECORD), dv = new DataView(b.buffer);
    dv.setUint32(0, 5, true);                                   // OT_MOVER
    dv.setFloat32(4, angle, true);
    dv.setFloat32(20, x / FRE.world.OLD_MPU, true);             // CObj::Read multiplies x and z by OLD_MPU
    dv.setFloat32(24, y, true);
    dv.setFloat32(28, z / FRE.world.OLD_MPU, true);
    for (const o of [32, 36, 40]) dv.setFloat32(o, 1, true);    // scale
    dv.setUint32(44, 5, true);                                  // m_dwType
    dv.setUint32(48, model >>> 0, true);                        // m_dwIndex = MI_ id
    dv.setUint32(52, 0xFFFFFFFF, true);                         // motion
    dv.setUint32(56, 0, true);                                  // AI interface
    dv.setUint32(60, 2, true);                                  // AI 2
    for (let i = 0; i < key.length; i++) b[160 + i] = key.charCodeAt(i);   // m_szCharacterKey[32], zero padded
    dv.setUint32(192, 1, true);                                 // belligerence
    return b;
  }

  // Where the record goes: the offset of the final 0xFFFFFFFF, or null when the map cannot take one.
  function insertPoint(bytes) {
    const r = FRE.world.readDyo(bytes);
    return r.end === 'eof' && r.stopType === 0xFFFFFFFF ? r.endAt : null;
  }

  // A typed tag as the game shows it: brackets are the client's ("[%s]"), so typed ones are dropped.
  const tagText = raw => String(raw || '').trim().replace(/^\[\s*/, '').replace(/\s*\]$/, '');
  const tagDefine = (text, id) => {
    const n = text.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return 'SRT_' + (n || 'TAG_' + id);
  };
  // The highest IDS_ETC_INC_ number in etc.inc, etc.txt.txt and the loaded string tables.
  function lastEtcId(ws) {
    let max = 0;
    for (const n of ['etc.inc', 'etc.txt.txt']) { const f = ws.files.get(n); if (f) for (const m of f.text.matchAll(/IDS_ETC_INC_(\d+)/g)) max = Math.max(max, Number(m[1])); }
    for (const k of ws.strings.map.keys()) if (k.startsWith('IDS_ETC_INC_')) max = Math.max(max, Number(k.slice(12)) || 0);
    return max;
  }
  // -> { id, define, text, key, parts: [{ file, splices }], lines: { define, inc, txt } } ; throws when it cannot be built
  function newTagPlan(ws, raw) {
    const def = ws.files.get('defineneuz.h'), inc = ws.files.get('etc.inc'), txt = ws.files.get('etc.txt.txt');
    if (!def || !inc || !txt) throw new Error('defineNeuz.h, etc.inc and etc.txt.txt are needed for a new tag');
    const id = FRE.newNpcSim.freeStructureIds(ws)[0];
    if (id === undefined) throw new Error('no free building tag row under MAX_STRUCTURE');
    const text = tagText(raw), define = tagDefine(text, id);
    const key = 'IDS_ETC_INC_' + String(lastEtcId(ws) + 1).padStart(6, '0');
    // defineNeuz.h: after the last "#define SRT_" line, same EOL, the value at column 25 like its neighbours
    const lastSrt = [...def.text.matchAll(/^#define[ \t]+SRT_\w+[^\r\n]*(\r?\n)/gm)].pop();
    if (!lastSrt) throw new Error('defineNeuz.h has no SRT_ line');
    const defLine = `#define ${define.padEnd(24)} ${id}${lastSrt[1]}`;
    const defAt = lastSrt.index + lastSrt[0].length;
    // etc.inc: a line before the structure block's closing brace
    const blk = /\bstructure\s*\{/.exec(inc.text);
    const close = blk ? inc.text.indexOf('}', blk.index + blk[0].length) : -1;
    if (close < 0) throw new Error('etc.inc has no structure { } block');
    const incAt = inc.text.lastIndexOf('\n', close) + 1;
    const incLine = `\t${define}\t\t${key}${FRE.textOps.dominantEol(inc.text)}`;
    const txtLine = `${key}\t${text}${FRE.textOps.dominantEol(txt.text)}`;
    return {
      id, define, text, key, lines: { define: defLine, inc: incLine, txt: txtLine },
      parts: [
        { file: def.name.toLowerCase(), splices: [{ start: defAt, end: defAt, insert: defLine }] },
        { file: inc.name.toLowerCase(), splices: [{ start: incAt, end: incAt, insert: incLine }] },
        { file: txt.name.toLowerCase(), splices: [appendSplice(txt.text, txtLine)] },
      ],
    };
  }

  // -> { parts: [{ file, splices }], strings, block, record, insertAt, dyo, tag } ; throws on what cannot be built
  function newNpcPlan(ws, form) {
    const inc = ws.files.get('character.inc'), txt = ws.files.get('character.txt.txt');
    const dyo = ws.mapFile(form.map);
    if (!inc || !txt) throw new Error('character.inc and character.txt.txt are needed');
    if (!dyo) throw new Error(`no World/${form.map}/${form.map}.dyo`);
    const model = ws.defines.defines.get(form.model);
    if (model === undefined) throw new Error(`${form.model} is not defined`);
    const strings = newStrings(ws, form);
    const tag = form.newTag !== null && form.newTag !== undefined ? newTagPlan(ws, form.newTag) : null;
    const eol = FRE.textOps.dominantEol(inc.text);
    const block = blockText(tag ? Object.assign({}, form, { structure: tag.define }) : form, strings, eol);
    const teol = FRE.textOps.dominantEol(txt.text);
    const lines = strings.map(s => `${s.key}\t${s.text}${teol}`).join('');
    const bytes = dyo.serialize();
    const at = insertPoint(bytes);
    if (at === null) throw new Error(`${form.map}: the server does not read this map's NPC list to its end marker`);
    const record = buildRecord({ angle: form.angle, x: form.x, y: form.y, z: form.z, model, key: form.key });
    const lower = n => n.toLowerCase();
    return {
      strings, block, record, insertAt: at, dyo, tag,
      parts: [
        ...(tag ? tag.parts : []),          // defineNeuz.h first: the NPC block names the new SRT_
        { file: lower(inc.name), splices: [appendSplice(inc.text, block, eol)] },
        { file: lower(txt.name), splices: [appendSplice(txt.text, lines)] },
        { file: ws.mapFiles.get(form.map), splices: [{ start: at, end: at, insert: FRE.bytes.bytesToBinaryString(record) }] },
      ],
    };
  }

  FRE.npcOps = { appendSplice, newNpcPlan, newTagPlan, tagText, tagDefine, lastEtcId, buildRecord, insertPoint, blockText, newStrings, lastStringId, RECORD };
})(globalThis.FRE = globalThis.FRE || {});
