// What players see in the Donation Shop window (task S part 4 simulator). Port of the client's
// CWndDonationShop (Neuz _Interface/WndDonationShop.cpp, commit 7d7df4f9, ae345504):
//   OnChildNotify tree click (:795)  -> keyword, parent flag, DS_CollectLeafKeywords (:171)
//   KeywordMatches (:408)            -> "All Items" / empty = everything; a group = any of its leaves; case-insensitive
//   BuildFilteredList (:469)         -> prj.mapDonationShop (id order), sex filter, search on the lower-case name
//   SortFiltered / DS_SortCmp (:256) -> Default (category rank, then name), Name, Price low, Price high
//   DS_CatRank (:233)                -> compiled s_szDonationCatOrder, or (docs/patches/donation-tree.diff) the tree's leaf order
//   DS_CategoryBlurb (:204)          -> the item card's line, compiled or patched
//   FillGrid (:509)                  -> 96 items a page (DS_GRID_MAX), the count line
// prj.mapDonationShop is CProject::LoadDonationShop's map (FRE.donation catalog: id -> last row).
// Not modelled: Windows lstrcmpi's word sort (here: case-insensitive, by character code, so names with
// '-' or '\'' may order differently in game); qsort is not stable (here: equal names keep id order);
// icons, the selected item, the Buy button and the purchase (OnBuyDonationItem: the Donation Shop simulator, next task).
(function (FRE) {
  'use strict';
  const GRID_MAX = 96;
  const SORTS = ['Default', 'Name (A-Z)', 'Price (low)', 'Price (high)'];
  const SEXES = ['Any sex', 'Male', 'Female'];
  const ROOT = 'All Items';
  const lower = s => String(s).toLowerCase();        // CString::MakeLower / CompareNoCase on ASCII names
  const cmpi = (a, b) => { a = lower(a); b = lower(b); return a < b ? -1 : a > b ? 1 : 0; };   // lstrcmpi (see above)

  // the leaf keywords under a node, file order (DS_CollectLeafKeywords)
  function leafKeywords(node, out = []) {
    if (!node.children.length) out.push(node.name);
    else node.children.forEach(c => leafKeywords(c, out));
    return out;
  }
  // FindTreeElem("All Items"): depth-first, exact case
  function findRoot(list) {
    for (const n of list) {
      if (n.name === ROOT) return n;
      const r = findRoot(n.children);
      if (r) return r;
    }
    return null;
  }
  // donation-tree.diff DS_LoadTreeOrder: [{ leaf, group }] under "All Items" (empty without it)
  function treeOrder(tree) {
    const r = tree ? findRoot(tree.roots) : null, out = [];
    if (r) for (const top of r.children) for (const leaf of leafKeywords(top)) out.push({ leaf, group: top.name });
    return out;
  }

  // view state of the window: OnInitialUpdate starts on "All Items" (keyword, not a parent)
  function clickState(node) {
    if (!node) return { keyword: ROOT, parent: false, set: [] };
    const parent = node.children.length > 0;
    return { keyword: node.name, parent, set: parent ? leafKeywords(node) : [] };
  }
  function keywordMatches(st, kw) {
    if (st.keyword === '' || st.keyword === ROOT) return true;
    if (st.parent) return st.set.some(k => lower(k) === lower(kw));
    return lower(st.keyword) === lower(kw);
  }

  // shop: { catalog: Map id -> keyword, items: Map id -> { name, sex, chip, packMax } }
  // opts: { node (tree node or null), search, sort 0-3, sex 0-2, patched, page }
  function view(shop, tree, opts = {}) {
    const st = clickState(opts.node || null);
    const patched = !!opts.patched, order = patched ? treeOrder(tree) : [];
    const rankOf = kw => {
      if (order.length) { const i = order.findIndex(o => lower(o.leaf) === lower(kw)); return i < 0 ? order.length : i; }
      const i = FRE.donationTree.COMPILED_ORDER.findIndex(c => lower(c) === lower(kw));
      return i < 0 ? FRE.donationTree.COMPILED_ORDER.length : i;
    };
    const search = lower(opts.search || ''), sex = opts.sex || 0, sort = opts.sort || 0;
    const list = [];
    for (const id of [...shop.catalog.keys()].sort((a, b) => a - b)) {          // std::map: ascending id
      const kw = shop.catalog.get(id);
      if (!keywordMatches(st, kw)) continue;
      const p = shop.items.get(id);
      if (!p) continue;
      if (sex > 0 && p.sex !== 0xFFFFFFFF && p.sex !== sex - 1) continue;
      if (search && !lower(p.name).includes(search)) continue;
      list.push(id);
    }
    const chip = p => (p.chip === 0xFFFFFFFF ? 0 : p.chip);
    const cmp = (a, b) => {
      const pa = shop.items.get(a), pb = shop.items.get(b);
      if (sort === 0) {
        const ra = rankOf(shop.catalog.get(a)), rb = rankOf(shop.catalog.get(b));
        if (ra !== rb) return ra < rb ? -1 : 1;
        return cmpi(pa.name, pb.name);
      }
      if (sort === 1) return cmpi(pa.name, pb.name);
      const ca = chip(pa), cb = chip(pb);
      if (ca === cb) return cmpi(pa.name, pb.name);
      if (sort === 2) return ca < cb ? -1 : 1;
      return ca > cb ? -1 : 1;
    };
    if (list.length > 1) list.sort(cmp);
    const total = list.length, pages = total > 0 ? Math.floor((total + GRID_MAX - 1) / GRID_MAX) : 1;
    let page = opts.page || 0;
    if (page >= pages) page = pages - 1;
    if (page < 0) page = 0;
    const start = page * GRID_MAX, end = Math.min(start + GRID_MAX, total);
    const cat = st.keyword === '' ? 'All' : st.keyword;
    const count = total === 0 ? `${cat} - 0 items` : pages > 1 ? `${cat} - ${start + 1}/${total}  (${page + 1}/${pages})` : `${cat} - ${total} items`;
    return { keyword: st.keyword, ids: list, page, pages, grid: list.slice(start, end), count };
  }

  // the card line of an item filed under `kw` (DS_CategoryBlurb, unpatched or patched)
  function blurb(kw, tree, patched) {
    if (['Suits', 'Cloaks', 'Masks', 'Wings', 'Fashion'].includes(kw)) return 'A cosmetic outfit piece. Changes your look only - no stat effect.';
    if (kw === 'Shields') return 'A cosmetic shield skin. Appearance only - no stat effect.';
    if (kw === 'Pets') return 'A companion pet.';
    if (['Battle Pass', 'VIP', 'Premium'].includes(kw)) return 'A premium account item.';
    if (kw === 'Consumables') return 'A single-use donation consumable.';
    if (kw === 'Functional') return 'A utility donation item.';
    const order = patched ? treeOrder(tree) : [];
    if (order.length) {
      const o = order.find(x => lower(x.leaf) === lower(kw)), g = o ? o.group : '';
      if (g === 'Fashion') return 'A cosmetic outfit piece. Changes your look only - no stat effect.';
      if (g === 'Premium') return 'A premium account item.';
      if (g !== 'Weapon Skins') return 'A Donation Shop item.';
    }
    return 'A cosmetic weapon skin. Changes your weapon\'s look only - no stat effect.';
  }

  // the window's inputs from a workspace: the catalog (DonationShop.inc) and each item's props
  function shopOf(model, items) {
    const catalog = new Map(), props = new Map();
    for (const [id, r] of model.catalog) catalog.set(id, r.category);
    for (const id of catalog.keys()) {
      const it = items.get(id);
      if (!it) continue;
      const g = f => FRE.specItem.get(it, f) >>> 0;
      props.set(id, { name: it.name, sex: g('dwItemSex'), chip: g('dwReferValue1'), packMax: g('dwPackMax') });
    }
    return { catalog, items: props };
  }

  FRE.donationWindow = { view, blurb, shopOf, treeOrder, leafKeywords, GRID_MAX, SORTS, SEXES };
})(globalThis.FRE = globalThis.FRE || {});
