// Client/Client/DonationShopTree.inc: the Donation Shop's category tree. Client-only
// (commit 7d7df4f9); read from the chosen Client folder, never edited here.
// Ported from CWndTreeCtrl::LoadTreeScript / InterpriteScript (Neuz
// _Interface/WndControl.cpp:1029). Shape: "Name" [ { children } ] ...
// A DSItem keyword should be a LEAF: the client matches it case-insensitively
// (CWndDonationShop::KeywordMatches); an unknown keyword only shows under
// "All Items", sorted last (DS_CatRank, WndDonationShop.cpp:233).
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;

  function interprite(script, list, parent) {
    let t = script.getToken();
    while (t.text[0] !== '}' && !script.eof) {
      const node = { name: t.text, children: [], parent };
      list.push(node);
      t = script.getToken();
      if (t.text[0] === '{') {
        interprite(script, node.children, node);
        t = script.token;
      }
    }
    if (script.eof) return;
    script.getToken();
  }

  // -> { roots, leaves: [name] in file order, isLeaf(name), pathOf(name) }
  function loadTree(file) {
    const script = new Script(file.text, { file: file.name, diags: [] });
    const roots = [];
    do {
      interprite(script, roots, null);
      if (!script.eof) script.getToken();
    } while (!script.eof);
    const leaves = [], byLower = new Map();
    const walk = n => {
      if (!n.children.length) { leaves.push(n.name); byLower.set(n.name.toLowerCase(), n); }
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    const pathOf = name => {
      const parts = []; let n = byLower.get(String(name).toLowerCase());
      while (n) { parts.unshift(n.name); n = n.parent; }
      return parts;
    };
    return { file: file.name, roots, leaves, isLeaf: name => byLower.has(String(name).toLowerCase()), pathOf };
  }

  FRE.donationTree = { loadTree };
})(globalThis.FRE = globalThis.FRE || {});
