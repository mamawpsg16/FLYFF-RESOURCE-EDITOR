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

  FRE.donationOps = { addItem, removeItem, setCategory };
})(globalThis.FRE = globalThis.FRE || {});
