// Donation Shop categories (task S part 4): the dialogs that change Client/Client/DonationShopTree.inc
// (edit/donation-ops.js). + Category / + Group, ✎ Edit (name + inside which group), ↑ ↓, Delete
// (its items move to another category or leave the shop; the user's choice, 2026-10-08).
// Every dialog: standard form pieces, live checks, a preview of the sidebar as the game draws it,
// and the lines that will be written. One undo step each.
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;
  const O = () => FRE.donationOps, DT = () => FRE.donationTree;
  const KEY = () => FRE.donationTree.KEY, DS = 'donationshop.inc';
  const ui = () => FRE.ui.modules.find(m => m.id === 'donation');

  const treeOf = ctx => ctx.ws.donationTree;
  const texts = ctx => ({ [KEY()]: ctx.ws.files.get(KEY()).text, [DS]: ctx.ws.files.get(DS).text });
  // groups a node can go into: "All Items" and every group (not the node itself or anything inside it)
  function groupChoices(tree, node = null) {
    return tree.nodes.filter(n => (n.children.length || !n.parent) && !(node && DT().isUnder(n, node)))
      .map(n => ({ v: n.name, label: n.parent ? n.name : `${n.name} (top level)` }));
  }
  const leafChoices = (tree, except = null) => tree.nodes.filter(n => !n.children.length && n.parent && !(except && DT().isUnder(n, except)))
    .map(n => ({ v: n.name, label: n.name, group: n.parent.parent ? n.parent.name : '' }));
  const itemCount = (ctx, names) => O().rowsOf(ctx.ws.models.donation, names).length;

  // the sidebar after the change, drawn from the new tree text (counts from the new DonationShop.inc)
  function sidebar(ctx, treeText, dsText, mark) {
    const t = DT().loadTree({ name: 'DonationShopTree.inc', text: treeText });
    const m = FRE.donation.loadDonation({ name: 'DonationShop.inc', text: dsText }, { defines: ctx.ws.defines.defines, strings: ctx.ws.strings.map });
    const box = h('div.small', { style: 'font-family:monospace;line-height:1.5' });
    const walk = (n, d) => {
      const leaves = DT().leavesUnder(n).map(x => x.name), cnt = O().rowsOf(m, leaves).length;
      box.appendChild(h('div', { style: `padding-left:${d * 16}px;${mark && mark.has(n.name.toLowerCase()) ? 'color:var(--warn);font-weight:bold' : ''}` },
        (n.children.length ? '▾ ' : '· ') + n.name + (n.parent ? `  (${cnt})` : '')));
      n.children.forEach(c => walk(c, d + 1));
    };
    t.roots.forEach(n => walk(n, 0));
    return box;
  }
  // the preview of a list of steps (each planned on the texts the one before left): sidebar + lines
  function plan(ctx, steps) {
    let tx = texts(ctx);
    for (const make of steps) {
      const tree = DT().loadTree({ name: 'DonationShopTree.inc', text: tx[KEY()] });
      const model = FRE.donation.loadDonation({ name: 'DonationShop.inc', text: tx[DS] }, { defines: ctx.ws.defines.defines, strings: ctx.ws.strings.map });
      for (const part of make(tx, tree, model)) {
        const f = ctx.ws.files.get(part.file);
        tx = Object.assign({}, tx, { [part.file]: FRE.SourceFile.spliceText(tx[part.file], part.splices, f.kind, f.name) });
      }
    }
    return tx;
  }
  function previewOf(ctx, tx, mark, say) {
    const box = h('div');
    if (say) box.appendChild(h('p', say));
    box.appendChild(h('h4', 'Sidebar of the Donation Shop window'));
    box.appendChild(sidebar(ctx, tx[KEY()], tx[DS], mark));
    for (const k of [KEY(), DS]) {
      const f = ctx.ws.files.get(k);
      if (tx[k] === f.text) continue;
      box.appendChild(h('h4', f.clientOnly ? 'Client/Client/' + f.name : f.name + ' (Server, and the Client copy when saving)'));
      box.appendChild(FRE.ui.renderDiff(f, f.text, tx[k]));
    }
    return box;
  }
  // the standard dialog: fields, Checks (⛔ / ⚠), preview; check() -> { problems, steps, say, mark, label, select }
  function dialog(ctx, { title, action, fields, check }) {
    const checks = h('div'), preview = h('div');
    let btn = null, cur = null;
    function refresh() {
      checks.textContent = ''; preview.textContent = '';
      cur = null;
      let r;
      try { r = check(); } catch (e) { r = { problems: [{ severity: 'BLOCK', message: e.message }] }; }
      const probs = r.problems || [];
      for (const p of probs) checks.appendChild(h(p.severity === 'BLOCK' ? 'div.bad' : 'div.warn', (p.severity === 'BLOCK' ? '⛔ ' : '⚠ ') + p.message));
      if (probs.some(p => p.severity === 'BLOCK') || !r.steps) { if (btn) btn.disabled = true; return; }
      let tx;
      try { tx = plan(ctx, r.steps); } catch (e) { checks.appendChild(h('div.bad', '⛔ ' + e.message)); if (btn) btn.disabled = true; return; }
      if (!probs.length) checks.appendChild(h('div.ok', '✓ No problem found.'));
      for (const n of r.notes || []) checks.appendChild(h('div.muted.small', n));
      preview.appendChild(previewOf(ctx, tx, r.mark, r.say));
      cur = r;
      if (btn) btn.disabled = false;
    }
    let timer = null;
    const live = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    const body = h('div', fields(live, refresh), FRE.ui.formFooter({ checks, action, previewTitle: 'What players will see / what will be written', preview }));
    const m = FRE.dom.modal({ title, body, wide: true, buttons: [
      { label: 'Cancel' },
      { label: action, cls: 'primary', onClick: () => {
        refresh();
        if (!cur) return false;
        const r = cur, keys = (r.keys || []).map(k => 'ds|' + k);
        const ok = ctx.editSteps(r.steps.map(make => () => {
          const ws = ctx.ws;
          const model = ws.models.donation;
          return make(texts(ctx), ws.donationTree, model);
        }), r.label, keys);
        if (ok && r.select !== undefined) { ui().st.cat = r.select; ctx.renderAll(false); }
      } },
    ] });
    btn = m.el.querySelector('footer button.primary');
    refresh();
    setTimeout(() => { const i = m.el.querySelector('input'); if (i) i.focus(); }, 0);
    return m;
  }
  const nameProblems = (tree, name, except) => DT().nameProblems(tree, name, except);
  const patchNote = 'Needs the client change docs/patches/donation-tree.diff built into Neuz once (order and card text read from the tree); without it a new category sorts last and its items say "A cosmetic weapon skin".';
  // a text box: typing checks after a short pause (live), leaving the box (change) at once
  const input = (value, set, live, now) => {
    const i = h('input', { type: 'text', value, style: 'width:100%', maxlength: 64 });
    i.addEventListener('input', () => { set(i.value); live(); });
    i.addEventListener('change', () => { set(i.value); now(); });
    return i;
  };
  const row = (label, req, el) => h('label.nn-row', FRE.ui.fieldLabel(label, req), el);

  // "Category N inside it" rows + the "+ Add a category inside it" button (+ Category and ✎ Edit)
  function insideRows(form, cats, live, refresh, paint, hint) {
    const boxes = cats.map((c, i) => {
      const box = input(c, v => {
        cats[i] = v;
        const sel = form.querySelector('.dt-dest');            // the "items go to" list follows the typed names
        if (sel && sel.options[i]) sel.options[i].textContent = v || `Category ${i + 1} (no name yet)`;
      }, live, refresh);
      form.appendChild(row(`Category ${i + 1} inside it`, true, h('span', { style: 'display:flex;gap:6px' }, box,
        h('button.icon.danger', { title: 'Remove this category', on: { click: () => { cats.splice(i, 1); paint(); refresh(); } } }, '✕'))));
      return box;
    });
    form.appendChild(h('div', { style: 'margin:4px 0 8px' }, h('button', { on: { click: () => {
      cats.push(''); paint(); refresh();
      const all = form.querySelectorAll('.dt-inside');                   // the new category box, never the Inside search box
      if (all.length) all[all.length - 1].focus();
    } } }, '+ Add a category inside it'), h('span.muted.small', ' ' + hint)));
    boxes.forEach(b => b.classList.add('dt-inside'));
  }
  // problems of the names typed in the rows (each one, and twice among them / with `taken`)
  function insideProblems(t, cats, taken) {
    const out = [], seen = new Set(taken.map(x => x.toLowerCase()));
    cats.forEach((c, i) => {
      out.push(...nameProblems(t, c).map(p => Object.assign({}, p, { message: `Category ${i + 1}: ${p.message}` })));
      if (c && seen.has(c.toLowerCase())) out.push({ severity: 'BLOCK', message: `Category ${i + 1}: "${c}" is used twice; every name must be different.` });
      seen.add(c.toLowerCase());
    });
    return out;
  }

  // + Category: one button, one form (the user, 2026-10-08: "+ Parent, then optionally add a child, or the
  // parent holds the items like Mounts"). No categories inside = it holds items itself (like Mounts, Pets);
  // with categories inside = a group (like Weapon Skins › Sword, Axe…).
  // Placed inside the selected group (or next to the selected category).
  function add(ctx) {
    const tree = treeOf(ctx), sel = ui().st.cat !== '*' ? tree.find(ui().st.cat) : null;
    let name = '', cats = [];
    let inside = sel ? (sel.children.length ? sel.name : sel.parent.name) : DT().ROOT, after = sel && !sel.children.length ? sel.name : '';
    const g = () => treeOf(ctx).find(inside);
    const form = h('div');
    return dialog(ctx, {
      title: '+ Category in the Donation Shop', action: 'Create',
      fields(live, refresh) {
        const paint = () => {
          form.textContent = '';
          form.appendChild(row('Name', true, input(name, v => { name = v; }, live, refresh)));
          insideRows(form, cats, live, refresh, paint, cats.length ? 'It is a group (like Weapon Skins): items go into the categories inside it.'
            : 'Optional. Without one it holds items itself (like Mounts or Pets); with one it becomes a group (like Weapon Skins › Sword, Axe…).');
          const kids = g() ? g().children : [];
          if (!kids.some(k => k.name === after)) after = '';
          form.appendChild(row('Inside', true, FRE.ui.combo({ options: groupChoices(treeOf(ctx)), value: inside, wordStart: true,
            onPick: v => { inside = v; after = ''; paint(); refresh(); } })));
          form.appendChild(row('Position', false, h('select', { on: { change: e => { after = e.target.value; refresh(); } } },
            h('option', { value: '', selected: !after }, 'At the end'), h('option', { value: 'first', selected: after === 'first' }, 'At the top'),
            kids.map(k => h('option', { value: k.name, selected: after === k.name }, `After "${k.name}"`)))));
        };
        paint();
        return form;
      },
      check() {
        const t = treeOf(ctx), problems = [...nameProblems(t, name)];
        const list = cats, kind = cats.length ? 'group' : 'category';
        if (kind === 'group') problems.push(...insideProblems(t, list, [name]));
        if (!g()) problems.push({ severity: 'BLOCK', message: 'Pick where it goes.' });
        if (problems.some(p => p.severity === 'BLOCK')) return { problems };
        problems.push({ severity: 'WARN', message: patchNote });
        const af = after === 'first' ? 'first' : after || null;
        const names = list.map(c => `"${c}"`).join(', ');
        return {
          problems, select: kind === 'group' ? list[0] : name, keys: [name, ...list],
          mark: new Set([name, ...list].map(x => x.toLowerCase())),
          label: kind === 'group' ? `New Donation Shop group "${name}" (${names}) in ${inside}` : `New Donation Shop category "${name}" in ${inside}`,
          say: `The sidebar gets ${kind === 'group' ? `a group "${name}" with ${list.length === 1 ? 'the category' : `${list.length} categories:`} ${names}` : `a category "${name}"`}. Add items with + in the item list on the right.`,
          steps: [(tx, tr) => {
            const grp = tr.find(inside), a = af && af !== 'first' ? tr.find(af) : af;
            return kind === 'group' ? O().addGroup(tx[KEY()], tr, grp, name, list, a) : O().addCategory(tx[KEY()], tr, grp, name, a);
          }],
        };
      },
    });
  }

  // ✎ Edit category / group: its name (a category's items follow) and the group it sits in
  function edit(ctx, node) {
    const tree = treeOf(ctx), isGroup = node.children.length > 0, what = isGroup ? 'group' : 'category';
    const old = node.name, oldInside = node.parent.name;
    let name = old, inside = oldInside;
    const cats = [];
    let dest = 0;                                     // which new category the items go to (index into cats)
    const n = itemCount(ctx, DT().leavesUnder(node).map(x => x.name));
    const form = h('div');
    return dialog(ctx, {
      title: `Edit ${what}: ${old}`, action: 'Apply changes',
      fields(live, refresh) {
        const paint = () => {
          form.textContent = '';
          form.appendChild(row('Name players see', true, input(name, v => { name = v; }, live, refresh)));
          if (!isGroup && n && !cats.length) form.appendChild(h('p.muted.small', `Its ${n} item${n === 1 ? '' : 's'} follow a new name (their DSItem lines change too).`));
          insideRows(form, cats, live, refresh, paint, isGroup ? `New categories go at the end of "${old}".`
            : n ? `Optional. "${old}" becomes a group (like Weapon Skins); a group can't hold items itself, so its ${n} item${n === 1 ? '' : 's'} move into one of the new categories.`
              : `Optional. "${old}" becomes a group (like Weapon Skins).`);
          if (!isGroup && n && cats.length) {
            if (dest >= cats.length) dest = 0;
            form.appendChild(row(`Its ${n} item${n === 1 ? '' : 's'} go to`, true, h('select.dt-dest', { on: { change: e => { dest = Number(e.target.value); refresh(); } } },
              cats.map((c, i) => h('option', { value: i, selected: i === dest }, c || `Category ${i + 1} (no name yet)`)))));
          }
          form.appendChild(row('Inside', true, FRE.ui.combo({ options: groupChoices(treeOf(ctx), node), value: inside, wordStart: true, onPick: v => { inside = v; refresh(); } })));
        };
        paint();
        return form;
      },
      check() {
        const t = treeOf(ctx), renamed = name !== old, moved = inside.toLowerCase() !== oldInside.toLowerCase(), adding = cats.length > 0;
        if (!renamed && !moved && !adding) return { problems: [{ severity: 'BLOCK', message: 'No change: this is already its name and its group.' }] };
        const problems = renamed ? nameProblems(t, name, node) : [];
        if (adding) problems.push(...insideProblems(t, cats, [name]));
        if (problems.some(p => p.severity === 'BLOCK')) return { problems };
        if ((renamed && !isGroup && !DT().COMPILED_ORDER.some(c => c.toLowerCase() === name.toLowerCase())) || adding) problems.push({ severity: 'WARN', message: patchNote });
        if (moved && !isGroup) problems.push({ severity: 'WARN', message: 'A new order in the sidebar: the items follow it in game only with docs/patches/donation-tree.diff built into Neuz.' });
        const steps = [];
        if (renamed) steps.push((tx, tr, m) => O().renameNode(tx, tr, m, tr.find(old), name));
        const to = cats[dest] || cats[0];
        if (adding) steps.push((tx, tr, m) => O().addInside(tx, tr, m, tr.find(name), cats, to));
        if (moved) steps.push((tx, tr) => O().moveToGroup(tx[KEY()], tr.find(name), tr.find(inside)));
        const list = cats.map(c => `"${c}"`).join(', ');
        const said = [renamed ? `renamed from "${old}" to "${name}"${!isGroup && n && !adding ? ` (${n} item${n === 1 ? '' : 's'} follow)` : ''}` : null,
          adding ? `${list} added inside${!isGroup && n ? ` (its ${n} item${n === 1 ? '' : 's'} move to "${to}")` : ''}` : null,
          moved ? `moved into "${inside}"` : null].filter(Boolean).join(', ');
        const leaving = moved && node.parent.parent && node.parent.children.length === 1;
        return {
          problems, steps, select: adding ? (isGroup ? cats[0] : to) : name, keys: [name, ...cats], mark: new Set([name, ...cats].map(x => x.toLowerCase())),
          notes: leaving ? [`"${oldInside}" has no other category: it becomes a plain (empty) category.`] : [],
          label: `Donation Shop ${what} "${old}": ${said}`, say: `${what === 'group' ? 'Group' : 'Category'} "${old}": ${said}.`,
        };
      },
    });
  }

  function move(ctx, node, dir) {
    const name = node.name;
    ctx.editGroup(() => O().moveNode(ctx.ws.files.get(KEY()).text, treeOf(ctx).find(name), dir),
      `Moved Donation Shop ${node.children.length ? 'group' : 'category'} "${name}" ${dir < 0 ? 'up' : 'down'}`, ['ds|' + name]);
  }

  // Delete: the items go to another category, or leave the shop (the user's choice, 2026-10-08)
  function remove(ctx, node) {
    const isGroup = node.children.length > 0, what = isGroup ? 'group' : 'category', name = node.name;
    const leaves = DT().leavesUnder(node).map(x => x.name);
    const rows = O().rowsOf(ctx.ws.models.donation, leaves);
    let dest = null, mode = rows.length ? 'move' : 'none';
    // the last category of a group: the group goes too unless unticked (the user, 2026-10-08: it stayed as an empty category)
    const lastOfGroup = !!(node.parent && node.parent.parent && node.parent.children.length === 1);
    let alsoGroup = lastOfGroup;
    const groupBox = refresh => (lastOfGroup ? h('label', { style: 'display:block;margin-top:8px' },
      h('input', { type: 'checkbox', checked: alsoGroup, on: { change: e => { alsoGroup = e.target.checked; refresh(); } } }),
      ` Also delete the group "${node.parent.name}" (this is its only category; otherwise it stays as an empty category)`) : null);
    const list = h('ul.plan.small', rows.slice(0, 15).map(r => { const it = ctx.ws.itemById(r.id); return h('li', `${it ? it.name : r.define} (${r.category})`); }),
      rows.length > 15 ? h('li', `… ${rows.length - 15} more`) : null);
    return dialog(ctx, {
      title: `Delete ${what}: ${name}`, action: `Delete ${what}`,
      fields: (live, refresh) => {
        if (!rows.length) return h('div', h('p', `"${name}" has no items${isGroup ? ` (categories: ${leaves.join(', ')})` : ''}.`), groupBox(refresh));
        const radio = (v, label) => h('label', { style: 'display:block' }, h('input', { type: 'radio', name: 'dsdel', checked: mode === v, on: { change: () => { mode = v; refresh(); } } }), ' ', label);
        return h('div',
          h('p', `"${name}" holds ${rows.length} item${rows.length === 1 ? '' : 's'}${isGroup ? ` in ${leaves.length === 1 ? '1 category' : `${leaves.length} categories`}` : ''}. Where do they go?`), list,
          radio('move', 'Move them to another category'),
          h('div', { style: 'margin-left:24px' }, FRE.ui.combo({ options: leafChoices(treeOf(ctx), node), value: null, wordStart: true, placeholder: 'Type a category…', onPick: v => { dest = v; mode = 'move'; refresh(); } })),
          radio('drop', 'Remove them from the Donation Shop'), groupBox(refresh));
      },
      check() {
        if (mode === 'move' && !dest) return { problems: [{ severity: 'BLOCK', message: 'Pick the category the items move to, or choose "Remove them from the Donation Shop".' }] };
        const d = mode === 'move' ? dest : null;
        const leaving = lastOfGroup && !alsoGroup, gone = lastOfGroup && alsoGroup ? node.parent.name : null;
        const said = rows.length ? (d ? `its ${rows.length} item${rows.length === 1 ? '' : 's'} moved to "${d}"` : `its ${rows.length} item${rows.length === 1 ? '' : 's'} removed from the shop`) : 'it had no items';
        return {
          problems: d || !rows.length ? [] : [{ severity: 'WARN', message: `${rows.length} item${rows.length === 1 ? '' : 's'} can no longer be bought.` }],
          notes: leaving ? [`"${node.parent.name}" has no other category: it becomes a plain (empty) category.`] : [],
          steps: [(tx, tr, m) => O().removeNode(tx, tr, m, tr.find(gone || name), d)],
          select: d || '*', keys: d ? [d] : [], mark: new Set(d ? [d.toLowerCase()] : []),
          label: `Deleted Donation Shop ${what} "${name}"${gone ? ` and its group "${gone}"` : ''} (${said})`,
          say: `"${name}"${gone ? ` and its group "${gone}" leave` : ' leaves'} the sidebar; ${said}.`,
        };
      },
    });
  }

  FRE.ui.donationTree = { add, edit, move, remove };
})(globalThis.FRE = globalThis.FRE || {});
