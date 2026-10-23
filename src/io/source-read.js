// The C++ files a task reads (never writes) when FLYFF-V19-SOURCE is picked: the Guild Siege prize amounts are
// compiled in, not in a data file (loaders/gifts.js `compiled`); the GM command table and the build switches (loaders/gmcmd.js).
// -> Map key -> text (latin1), or null (the files are not there: the editor then uses its own copy of the numbers).
// A test copy (test-data) has them under src/<key> (tools/refresh-fixtures.sh).
(function (FRE) {
  'use strict';
  // [path in FLYFF-V19-SOURCE, key]
  const FILES = [
    ['Source/Source/_Common/eveschool.cpp', 'eveschool.cpp'],
    ['Source/Source/_Common/GuildSiegePrize.cpp', 'guildsiegeprize.cpp'],
    ['Source/Source/_Interface/FuncTextCmd.cpp', 'functextcmd.cpp'],
    ['Source/Source/_Common/CustomCommon.h', 'customcommon.h'],
    ['Source/Source/WORLDSERVER/VersionCommon.h', 'worldserver/versioncommon.h'],
    ['Source/Source/Neuz/VersionCommon.h', 'neuz/versioncommon.h'],
  ];

  async function readOne(root, path) {
    const parts = path.split('/'), name = parts.pop();
    const dir = parts.length ? await FRE.fsa.dirAt(root, parts.join('/')) : root;
    const fh = dir && (await FRE.fsa.findFiles(dir, [name])).get(name.toLowerCase());
    return fh ? new TextDecoder('latin1').decode((await FRE.fsa.readHandle(fh)).bytes) : null;
  }

  async function read(layout) {
    if (!layout || (layout.kind !== 'real' && layout.kind !== 'test')) return null;
    const out = new Map();
    for (const [path, key] of FILES) {
      try {
        const text = await readOne(layout.root, layout.kind === 'real' ? path : 'src/' + key);
        if (text !== null) out.set(key, text);
      } catch (e) { /* not readable: left out */ }
    }
    return out.size ? out : null;
  }

  FRE.sourceRead = { read, FILES };
})(globalThis.FRE = globalThis.FRE || {});
