// DonationShop.inc loader, ported from CProject::LoadDonationShop
// (_Common/ProjectCmn.cpp:1845, custom __DONATIONSHOP).
//   DONATIONSHOP { DSItem "<category>" II_x  ... }
// Inside the block the server reads a token; on "DSItem" it reads the category
// token and the item number, then reads one more token and loops until '}'.
// Unknown words are skipped. The catalog is a map item -> category, so an item
// listed twice ends up in the LAST category. Prices are not in this file: they
// are each item's dwReferValue1 (donate chips) in Spec_Item.txt.
(function (FRE) {
  'use strict';
  const { Script } = FRE.lexer;
  const FILE = 'DonationShop.inc';

  function loadDonation(file, ctx) {
    const script = new Script(file.text, { file: file.name, defines: ctx.defines, strings: ctx.strings, diags: [] });
    const rows = [];
    const blocks = [];
    let t = script.getToken();
    while (!script.eof) {
      if (t.text === 'DONATIONSHOP') {
        const block = { start: t.start, open: script.getToken(), closed: false, end: t.end };
        blocks.push(block);
        t = script.getToken();
        while (t.text[0] !== '}') {
          if (t.type === 'eof') {
            // the server's loop (`while( *scanner.token != '}' )`) never ends here
            script.diag('DS_BRACES', 'BLOCK', `${file.name}: the DONATIONSHOP block is never closed with "}" - the server would hang at startup`, block.start, file.text.length);
            break;
          }
          if (t.text === 'DSItem') {
            const cat = script.getToken();
            const item = script.getNumber();
            const row = { cmd: 'DSItem', start: t.start, end: item.end, cat, category: cat.text, item, id: item.value >>> 0, define: item.define || null };
            if (cat.type !== 'string') row.badCategory = true;
            rows.push(row);
          }
          t = script.getToken();
        }
        block.closed = t.text[0] === '}';
        block.end = t.end;
      }
      t = script.getToken();
    }
    // the server's map: id -> category (later rows overwrite earlier ones)
    const catalog = new Map();
    for (const r of rows) if (r.id !== 0) catalog.set(r.id, r);
    const categories = [];
    for (const r of rows) if (!categories.includes(r.category)) categories.push(r.category);
    return { file: file.name, rows, blocks, catalog, categories, diags: script.diags };
  }

  function validateDonation(model, ctx) {
    const out = [];
    const add = d => out.push(Object.assign({ file: model.file, module: 'donation' }, d));
    for (const d of model.diags) add(Object.assign({}, d, { key: `${d.code}|${d.file}|${d.name || d.message}` }));
    if (!model.blocks.length) add({ code: 'DS_FORMAT', severity: 'BLOCK', start: 0, end: 0, key: 'DS_FORMAT|noblock', message: `${model.file} has no DONATIONSHOP { } block: the shop is empty` });
    const seen = new Map();
    for (const r of model.rows) {
      const name = r.define || ctx.textOf(model.file).slice(r.item.start, r.item.end);
      if (r.badCategory) add({ code: 'DS_FORMAT', severity: 'BLOCK', start: r.start, end: r.end, key: `DS_FORMAT|${name}|${r.category}`, itemName: name,
        message: `DSItem ${name}: the category must be a "quoted" name (found ${r.cat.text || 'nothing'}); otherwise the values shift` });
      if (r.id === 0) {
        add({ code: 'DS_UNDEF', severity: 'BLOCK', start: r.start, end: r.end, key: `DS_UNDEF|${name}`, itemName: name,
          message: `DSItem "${r.category}" ${name}: the item id is undefined or 0, so the server leaves it out (and logs an error)` });
        continue;
      }
      const item = ctx.items.get(r.id);
      if (!item) {
        add({ code: 'DS_NO_ITEM', severity: 'BLOCK', start: r.start, end: r.end, key: `DS_NO_ITEM|${name}`, itemName: name,
          message: `${name} is not a loaded item in Spec_Item.txt: it can't be bought` });
      } else {
        const chip = FRE.specItem.get(item, 'dwReferValue1');
        if (chip < 1) add({ code: 'DS_NO_PRICE', severity: 'WARN', start: r.start, end: r.end, key: `DS_NO_PRICE|${name}`, itemName: name,
          message: `${item.name || name} (${name}) has no donate-chip price (dwReferValue1 = ${chip < 0 ? '=' : chip}): the server refuses to sell it` });
      }
      if (seen.has(r.id)) {
        const first = seen.get(r.id);
        add({ code: 'DS_DUP', severity: 'WARN', start: r.start, end: r.end, key: `DS_DUP|${name}`, itemName: name,
          message: `${name} is listed twice ("${first.category}" and "${r.category}"): it only appears under "${r.category}" (the last one wins)` });
      } else seen.set(r.id, r);
    }
    return out;
  }

  FRE.donation = { loadDonation, validateDonation, FILE };
})(globalThis.FRE = globalThis.FRE || {});
