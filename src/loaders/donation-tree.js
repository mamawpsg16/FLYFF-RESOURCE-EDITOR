// Client/Client/DonationShopTree.inc: the Donation Shop's category tree. Client-only
// (commit 7d7df4f9), LF; edited in the Donation Shop task (task S part 4).
// Ported from CWndTreeCtrl::LoadTreeScript / InterpriteScript (Neuz
// _Interface/WndControl.cpp:1029). Shape: "Name" [ { children } ] ...
// Only the first character is tested for '{' / '}', so a name starting with one breaks the tree.
// A DSItem keyword should be a LEAF: the client matches it case-insensitively
// (CWndDonationShop::KeywordMatches, WndDonationShop.cpp:408); a group shows the items
// of all its leaves (DS_CollectLeafKeywords :171); an unknown keyword only shows under
// "All Items", sorted last (DS_CatRank :233).
// The category order and the item-card text are compiled in C++ (s_szDonationCatOrder :226,
// DS_CategoryBlurb :204; ae345504 added "Shields" there). docs/patches/donation-tree.diff
// reads both from this file instead.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const ROOT = 'All Items';
  const KEY = 'client/donationshoptree.inc';     // its key in Workspace.files
  const DIAG_FILE = 'Client/DonationShopTree.inc';
  // s_szDonationCatOrder (WndDonationShop.cpp:226, as of ae345504): the order without the patch
  const COMPILED_ORDER = ['Consumables', 'Functional', 'Suits', 'Cloaks', 'Masks', 'Wings',
    'Sword', 'Great Sword', 'Axe', 'Battle Axe', 'Bow', 'Staff', 'Wand', 'Stick', 'Knuckle', 'Yo-Yo', 'Shields',
    'Pets', 'Battle Pass', 'VIP'];

  // node: { name, tok: {start, end} (with the quotes), open, close (brace tokens or null), parent, children }
  function interprite(script, list, parent) {
    let t = script.getToken();
    while (t.text[0] !== '}' && !script.eof) {
      const node = { name: t.text, tok: { start: t.start, end: t.end }, quoted: t.type === 'string', open: null, close: null, children: [], parent };
      list.push(node);
      t = script.getToken();
      if (t.text[0] === '{') {
        node.open = { start: t.start, end: t.end };
        interprite(script, node.children, node);
        t = script.token;
      }
    }
    if (script.eof) return;
    if (parent) parent.close = { start: t.start, end: t.end };
    script.getToken();
  }

  // -> { file, roots, nodes (file order), leaves: [name] in file order, isLeaf(name), pathOf(name), find(name) }
  function loadTree(file) {
    const script = new Script(file.text, { file: file.name, diags: [] });
    const roots = [];
    do {
      interprite(script, roots, null);
      if (!script.eof) script.getToken();
    } while (!script.eof);
    const leaves = [], nodes = [], byLower = new Map();
    const walk = n => {
      nodes.push(n);
      if (!byLower.has(n.name.toLowerCase())) byLower.set(n.name.toLowerCase(), n);
      if (!n.children.length) leaves.push(n.name);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
    const leafByLower = new Map();
    for (const n of nodes) if (!n.children.length && !leafByLower.has(n.name.toLowerCase())) leafByLower.set(n.name.toLowerCase(), n);
    const pathOf = name => {
      const parts = []; let n = leafByLower.get(String(name).toLowerCase());
      while (n) { parts.unshift(n.name); n = n.parent; }
      return parts;
    };
    return {
      file: file.name, text: file.text, roots, nodes, leaves, diags: script.diags,
      isLeaf: name => leafByLower.has(String(name).toLowerCase()),
      find: name => byLower.get(String(name).toLowerCase()) || null,
      pathOf,
    };
  }

  const isGroup = n => n.children.length > 0;
  const root = tree => tree.roots.find(n => n.name === ROOT) || null;       // FindTreeElem("All Items"): exact case
  // the "All Items" child a node sits under (itself when it is one)
  function topGroup(node) {
    while (node && node.parent && node.parent.parent) node = node.parent;
    return node;
  }
  // the leaves under a node (itself when it is a leaf), file order
  function leavesUnder(node) {
    const out = [];
    const walk = n => { if (!n.children.length) out.push(n); n.children.forEach(walk); };
    walk(node);
    return out;
  }
  const isUnder = (node, anc) => { for (let n = node; n; n = n.parent) if (n === anc) return true; return false; };

  // Problems with a name typed for a node (except: the node being renamed). [{ code, severity, message }]
  function nameProblems(tree, name, except = null) {
    const out = [];
    const add = (code, severity, message) => out.push({ code, severity, message });
    if (!name) { add('DT_CHARS', 'BLOCK', 'Type a name.'); return out; }
    if (name !== name.trim()) add('DT_CHARS', 'BLOCK', 'The name starts or ends with a space: items would not match it.');
    if (/["\r\n]/.test(name)) add('DT_CHARS', 'BLOCK', 'A name can\'t hold a " or a line break.');
    if (!/^[\x20-\x7e]*$/.test(name)) add('DT_CHARS', 'BLOCK', 'Use plain English letters, digits and signs only (the file is plain ASCII).');
    if (/^[{}]/.test(name)) add('DT_BRACE', 'BLOCK', `A name can't start with "${name[0]}": the client reads it as the start or end of a group and the tree breaks.`);
    if (name.length > 64) add('DT_CHARS', 'BLOCK', 'Keep the name to 64 characters: it has to fit the sidebar.');
    const other = tree && tree.nodes.find(n => n !== except && n.name.toLowerCase() === name.toLowerCase());
    if (other) add('DT_DUP', 'BLOCK', `"${other.name}" already exists (${other.children.length ? 'a group' : 'a category'}): the client would mix their items.`);
    return out;
  }

  function validateTree(tree) {
    const out = [];
    const add = d => out.push(Object.assign({ file: DIAG_FILE, module: 'donation' }, d));
    for (const d of tree.diags) add(Object.assign({}, d, { key: `${d.code}|tree|${d.message}` }));
    const r = root(tree);
    if (!r || tree.roots.length !== 1) add({ code: 'DT_ROOT', severity: 'BLOCK', start: r ? r.tok.start : 0, end: r ? r.tok.end : 0, key: 'DT_ROOT',
      message: `DonationShopTree.inc must hold one top entry "${ROOT}" with every group and category inside it (found ${tree.roots.map(n => '"' + n.name + '"').join(', ') || 'nothing'})` });
    const seen = new Map();
    for (const n of tree.nodes) {
      const k = n.name.toLowerCase();
      if (seen.has(k)) add({ code: 'DT_DUP', severity: 'BLOCK', start: n.tok.start, end: n.tok.end, key: `DT_DUP|${k}`,
        message: `"${n.name}" is in the category tree twice: the client mixes the items of both` });
      else seen.set(k, n);
      if (/^[{}]/.test(n.name)) add({ code: 'DT_BRACE', severity: 'BLOCK', start: n.tok.start, end: n.tok.end, key: `DT_BRACE|${k}`,
        message: `"${n.name}" starts with ${n.name[0]}: the client reads it as the start or end of a group` });
    }
    // without docs/patches/donation-tree.diff the client sorts by its compiled list and gives
    // unknown categories the weapon-skin card text
    const compiled = COMPILED_ORDER.map(s => s.toLowerCase());
    const leafNodes = tree.nodes.filter(n => !n.children.length && n !== r);
    for (const n of leafNodes) if (!compiled.includes(n.name.toLowerCase())) add({ code: 'DT_PATCH', severity: 'WARN', start: n.tok.start, end: n.tok.end,
      key: `DT_PATCH|${n.name.toLowerCase()}`,
      message: `Category "${n.name}" needs the client change docs/patches/donation-tree.diff built into Neuz; without it its items sort last and their card says "A cosmetic weapon skin"` });
    const known = leafNodes.map(n => compiled.indexOf(n.name.toLowerCase())).filter(i => i >= 0);
    if (known.some((v, i) => i && v < known[i - 1])) add({ code: 'DT_ORDER', severity: 'INFO', start: 0, end: 0, key: 'DT_ORDER',
      message: 'The categories are in a new order: the client follows it only with docs/patches/donation-tree.diff built into Neuz (without it, "All Items" and groups list items in the old order)' });
    return out;
  }

  FRE.donationTree = { loadTree, validateTree, nameProblems, isGroup, root, topGroup, leavesUnder, isUnder, ROOT, KEY, DIAG_FILE, COMPILED_ORDER };
})(globalThis.FRE = globalThis.FRE || {});
