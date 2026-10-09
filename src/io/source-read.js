// The C++ files a task reads (never writes) when FLYFF-V19-SOURCE is picked: the Guild Siege prize amounts are
// compiled in, not in a data file (loaders/gifts.js `compiled`). -> Map lowercase name -> text (latin1), or null
// (test-data, or the files are not there: the editor then uses its own copy of the numbers).
(function (FRE) {
  'use strict';
  const FILES = ['Source/Source/_Common/eveschool.cpp', 'Source/Source/_Common/GuildSiegePrize.cpp'];

  async function read(layout) {
    if (!layout || layout.kind !== 'real') return null;
    const out = new Map();
    for (const path of FILES) {
      try {
        const parts = path.split('/'), name = parts.pop();
        const dir = await FRE.fsa.dirAt(layout.root, parts.join('/'));
        const fh = dir && (await FRE.fsa.findFiles(dir, [name])).get(name.toLowerCase());
        if (fh) out.set(name.toLowerCase(), new TextDecoder('latin1').decode((await FRE.fsa.readHandle(fh)).bytes));
      } catch (e) { /* not readable: left out */ }
    }
    return out.size ? out : null;
  }

  FRE.sourceRead = { read, FILES };
})(globalThis.FRE = globalThis.FRE || {});
