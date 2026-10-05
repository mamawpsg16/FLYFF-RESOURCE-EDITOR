// Keeping the game client's own copies in step with Server/Resource.
// The client reads a loose file in Client/ when there is one, otherwise an old
// copy packed in data.res (commit b7645c52, "Client/randomoption.inc loose copy").
// The proven data commits change both copies the same way ("Client copy synced",
// e.g. 93a02124). Client/Spec_Item.txt is LF while the server copy is CRLF, with
// the same content, so a plain byte copy would rewrite every line of it.
//
// The mode of each Client file is decided against the server file AS LOADED, so
// the only difference ever written to Client/ is the editor's own edit:
//   identical  Client bytes == server bytes            -> write the server's new bytes
//   eol        Client text == server text with CRLF->LF -> write the new text as LF
//   missing    no loose copy (client reads data.res)   -> create a byte copy (asked first)
//   different  anything else                           -> never touched, update by hand
(function (FRE) {
  'use strict';
  const toLf = t => t.replace(/\r\n/g, '\n');

  function modeOf(serverFile, clientFile) {
    if (!clientFile) return 'missing';
    if (FRE.bytes.bytesEqual(clientFile.bytes, serverFile.bytes)) return 'identical';
    if (clientFile.kind === serverFile.kind && serverFile.originalText.includes('\r\n')
      && clientFile.originalText === toLf(serverFile.originalText)) return 'eol';
    return 'different';
  }

  // Bytes for Client/ that match the server file's current text, or null (different).
  function clientBytes(mode, serverFile, clientFile) {
    if (mode === 'identical' || mode === 'missing') return serverFile.serialize();
    if (mode === 'eol') return clientFile.encode(toLf(serverFile.text));
    return null;
  }

  const MODE_TEXT = {
    identical: 'same as the server copy: gets the same change',
    eol: 'same content with LF line endings: gets the same change, LF kept',
    missing: 'no loose copy: the client reads an old copy in data.res',
    different: 'differs from the server copy: not touched, update it by hand',
  };

  // client: { files: Map lowerName -> SourceFile (loose copies found in Client/) }
  // -> one entry per changed server file the client also reads
  function plan(ws, client) {
    const names = new Set(ws.clientFileNames().map(n => n.toLowerCase()));
    return ws.dirtyFiles().filter(f => names.has(f.name.toLowerCase())).map(f => {
      const c = client.files.get(f.name.toLowerCase()) || null;
      const mode = modeOf(f, c);
      return { name: c ? c.name : f.name, lower: f.name.toLowerCase(), mode, server: f, client: c, bytes: clientBytes(mode, f, c), text: MODE_TEXT[mode] };
    });
  }

  FRE.clientSync = { modeOf, clientBytes, plan, MODE_TEXT, toLf };
})(globalThis.FRE = globalThis.FRE || {});
