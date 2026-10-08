// DonationShop.inc edits as minimal splices.
(function (FRE) {
  'use strict';
  const T = FRE.textOps;

  // Rebuild a row in the file's own layout ("DSItem<sep>"Cat"<sep>II_X"), copied from an existing row.
  function rowText(text, model, category, define) {
    const sample = model.rows[0];
    let sep1 = '\t', sep2 = '\t';
    if (sample) {
      const line = text.slice(sample.start, sample.end);
      const m = /^DSItem([ \t]+)"[^"]*"([ \t]+)/.exec(line);
      if (m) { sep1 = m[1]; sep2 = m[2]; }
    }
    return `DSItem${sep1}"${category}"${sep2}${define}`;
  }

  function checkCategory(cat) {
    if (!cat || /["\r\n]/.test(cat)) throw new Error('category must be a non-empty name without quotes');
  }

  function addItem(text, model, category, define) {
    T.checkDefine(define);
    checkCategory(category);
    const inCat = model.rows.filter(r => r.category === category);
    const anchor = inCat[inCat.length - 1] || model.rows[model.rows.length - 1];
    const row = rowText(text, model, category, define);
    if (anchor) return T.insertRowAfter(text, anchor, row);
    const block = model.blocks[0];
    if (!block) throw new Error('DonationShop.inc has no DONATIONSHOP block');
    return T.insertRowBelowLine(text, block.open.start, row);
  }

  const removeItem = (text, row) => T.removeRow(text, row);

  function setCategory(text, row, category) {
    checkCategory(category);
    return T.replaceSpan(row.cat, `"${category}"`);
  }

  // ---------------------------------------------------------------- the category tree
  // Client/Client/DonationShopTree.inc (FRE.donationTree; task S part 4). Every op returns
  // [{ file, splices }] for Workspace.applyGroup: the tree, plus DonationShop.inc when items follow
  // (a rename) or move / leave (a delete). New lines copy the siblings' tab indent and the file's EOL.
  const TREE = () => FRE.donationTree.KEY;
  const DS = 'donationshop.inc';
  const DT = () => FRE.donationTree;

  function checkName(tree, name, except) {
    const bad = DT().nameProblems(tree, name, except).filter(p => p.severity === 'BLOCK');
    if (bad.length) throw new Error(bad[0].message);
  }
  // whole lines of a node, from its name to its closing brace
  function extent(text, node) {
    const s = T.lineStart(text, node.tok.start), endTok = node.close || node.tok;
    if (!T.prefixIsBlank(text, node.tok.start) || !T.restOfLineIsFree(text, endTok.end))
      throw new Error(`"${node.name}" shares its line with something else in DonationShopTree.inc; change that by hand`);
    return { start: s, end: T.lineEnd(text, endTok.end) };
  }
  const eolOf = text => (text.includes('\r\n') ? '\r\n' : '\n');
  const childIndent = (text, group) => T.indentOf(text, group.open.start) + '\t';
  // where a new child of `group` goes: after `after` (a child), at the start (after = 'first'), or at the end (null)
  function insertAt(text, group, after) {
    if (!group.open || !group.close) throw new Error(`"${group.name}" is a category, not a group: it can't hold other categories`);
    if (after === 'first' || (!after && !group.children.length)) return T.lineEnd(text, group.open.end);
    const a = after || group.children[group.children.length - 1];
    return extent(text, a).end;
  }
  // lines of a block re-indented from `from` to `to`
  function reindent(block, from, to) {
    return block.split(/(?<=\n)/).map(l => (l.startsWith(from) ? to + l.slice(from.length) : l)).join('');
  }
  // removing the last child of a group: its { } lines go too, so it reads as a plain category
  function removeSpan(text, node) {
    const p = node.parent;
    if (p && p.parent && p.children.length === 1 && p.open && p.close &&
        T.prefixIsBlank(text, p.open.start) && T.restOfLineIsFree(text, p.open.end) && T.prefixIsBlank(text, p.close.start) && T.restOfLineIsFree(text, p.close.end))
      return { start: T.lineStart(text, p.open.start), end: T.lineEnd(text, p.close.end), emptied: p };
    return Object.assign(extent(text, node), { emptied: null });
  }
  const rowsOf = (model, names) => {
    const set = new Set(names.map(n => n.toLowerCase()));
    return model.rows.filter(r => set.has(r.category.toLowerCase()));
  };

  // + Category: a new leaf inside `group` (after `after`, or at the end)
  function addCategory(text, tree, group, name, after = null) {
    checkName(tree, name);
    const at = insertAt(text, group, after);
    return [{ file: TREE(), splices: [{ start: at, end: at, insert: `${childIndent(text, group)}"${name}"${eolOf(text)}` }] }];
  }
  // a group with its categories (at least one: a group without one is read as a category)
  function addGroup(text, tree, group, name, cats, after = null) {
    cats = [].concat(cats);
    if (!cats.length) throw new Error('A group needs at least one category');
    checkName(tree, name);
    const seen = new Set([name.toLowerCase()]);
    for (const c of cats) {
      checkName(tree, c);
      if (seen.has(c.toLowerCase())) throw new Error(`"${c}" is used twice: every name must be different`);
      seen.add(c.toLowerCase());
    }
    const at = insertAt(text, group, after), i = childIndent(text, group), e = eolOf(text);
    const kids = cats.map(c => `${i}\t"${c}"${e}`).join('');
    return [{ file: TREE(), splices: [{ start: at, end: at, insert: `${i}"${name}"${e}${i}{${e}${kids}${i}}${e}` }] }];
  }
  // categories added inside an existing entry. A group gets them at the end of its list; a category
  // becomes a group: { } lines under its name, and its items move into `dest` (one of the new
  // categories, the first by default; the user picks it) - a group's own name shows no items in game (KeywordMatches).
  function addInside(texts, tree, model, node, cats, dest = null) {
    cats = [].concat(cats);
    if (!cats.length) return [];
    if (!node.parent) throw new Error(`Use + Category to add at the top level`);
    const seen = new Set([node.name.toLowerCase()]);
    for (const c of cats) {
      checkName(tree, c);
      if (seen.has(c.toLowerCase())) throw new Error(`"${c}" is used twice: every name must be different`);
      seen.add(c.toLowerCase());
    }
    const text = texts[TREE()], e = eolOf(text);
    if (node.children.length) {
      const at = insertAt(text, node, null), i = childIndent(text, node);
      return [{ file: TREE(), splices: [{ start: at, end: at, insert: cats.map(c => `${i}"${c}"${e}`).join('') }] }];
    }
    const to = dest || cats[0];
    if (!cats.some(c => c === to)) throw new Error(`"${to}" is not one of the new categories`);
    const ex = extent(text, node), ind = T.indentOf(text, node.tok.start);
    const block = `${ind}{${e}${cats.map(c => `${ind}\t"${c}"${e}`).join('')}${ind}}${e}`;
    return [{ file: TREE(), splices: [{ start: ex.end, end: ex.end, insert: block }] },
      { file: DS, splices: rowsOf(model, [node.name]).flatMap(r => setCategory(texts[DS], r, to)) }];
  }
  // rename: the tree line; a category's DSItem rows follow it (Server; the Client copy by the save sync)
  function renameNode(texts, tree, model, node, name) {
    if (!node.parent) throw new Error(`"${node.name}" is the top of the tree; the client looks for it by name`);
    checkName(tree, name, node);
    const parts = [{ file: TREE(), splices: T.replaceSpan(node.tok, `"${name}"`) }];
    if (!node.children.length) parts.push({ file: DS, splices: rowsOf(model, [node.name]).flatMap(r => setCategory(texts[DS], r, name)) });
    return parts;
  }
  // ↑ / ↓ among its siblings (dir -1 / +1): the two blocks swap, whatever lies between them stays
  function moveNode(text, node, dir) {
    const sib = node.parent ? node.parent.children : null;
    const i = sib ? sib.indexOf(node) : -1, j = i + dir;
    if (i < 0 || j < 0 || j >= sib.length) throw new Error(`"${node.name}" can't move ${dir < 0 ? 'up' : 'down'}`);
    const [a, b] = dir < 0 ? [sib[j], node] : [node, sib[j]];
    const ea = extent(text, a), eb = extent(text, b);
    const blockA = text.slice(ea.start, ea.end), blockB = text.slice(eb.start, eb.end), mid = text.slice(ea.end, eb.start);
    return [{ file: TREE(), splices: [{ start: ea.start, end: eb.end, insert: blockB + mid + blockA }] }];
  }
  // into another group (at its end)
  function moveToGroup(text, node, group) {
    if (!node.parent) throw new Error(`"${node.name}" is the top of the tree`);
    if (DT().isUnder(group, node)) throw new Error(`"${group.name}" is inside "${node.name}"`);
    if (group === node.parent) throw new Error(`"${node.name}" is already in "${group.name}"`);
    const ex = extent(text, node), rm = removeSpan(text, node), at = insertAt(text, group, null);
    if (at > rm.start && at < rm.end) throw new Error(`"${group.name}" can't take it`);
    const block = reindent(text.slice(ex.start, ex.end), T.indentOf(text, node.tok.start), childIndent(text, group));
    // the group losing its last child keeps its name line; its { } lines go (removeSpan)
    const cut = rm.emptied ? [{ start: rm.start, end: rm.end, insert: '' }] : [{ start: ex.start, end: ex.end, insert: '' }];
    const ins = { start: at, end: at, insert: block };
    return [{ file: TREE(), splices: at <= cut[0].start ? [ins, ...cut] : [...cut, ins] }];
  }
  // delete a category or a group: its items go to `dest` (a category name) or leave the shop (dest null)
  function removeNode(texts, tree, model, node, dest) {
    if (!node.parent) throw new Error(`"${node.name}" is the top of the tree and can't be deleted`);
    const leaves = DT().leavesUnder(node).map(n => n.name);
    if (dest && leaves.some(n => n.toLowerCase() === dest.toLowerCase())) throw new Error(`"${dest}" is being deleted too`);
    if (dest && !tree.isLeaf(dest)) throw new Error(`"${dest}" is not a category`);
    const text = texts[TREE()], rm = removeSpan(text, node);
    const rows = rowsOf(model, leaves);
    const ds = rows.flatMap(r => (dest ? setCategory(texts[DS], r, dest) : removeItem(texts[DS], r)));
    return [{ file: TREE(), splices: [{ start: rm.start, end: rm.end, insert: '' }] }, { file: DS, splices: ds }];
  }

  FRE.donationOps = { addItem, removeItem, setCategory, addCategory, addGroup, addInside, renameNode, moveNode, moveToGroup, removeNode, rowsOf };
})(globalThis.FRE = globalThis.FRE || {});
