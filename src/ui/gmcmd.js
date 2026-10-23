// GM Commands: every chat command of the loaded source (loaders/gmcmd.js), sorted by what it is for, with a small form per command
// that builds the line, ONE command bar at the bottom with Copy, and what happens when it is typed (loaders/gmcmd-sim.js).
// Read-only: nothing is written anywhere.
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus } = FRE.dom;
  const G = () => FRE.gmCmd, Sim = () => FRE.gmCmdSim;
  const model = ctx => ctx.ws.models.gmcmd;
  // SAI79::ePropType (data.h): NO_PROP, FIRE, WATER, ELECTRICITY, WIND, EARTH
  const ELEMENTS = ['none', 'Fire', 'Water', 'Electricity', 'Wind', 'Earth'];
  const st = { cat: 'summon', sel: null, vals: {}, bar: '', auth: 'ADMINISTRATOR', short: false, recent: [], showOff: false };
  try { st.recent = JSON.parse(localStorage.getItem('fre.gm.recent') || '[]').slice(0, 8); } catch (e) { st.recent = []; }
  const keep = () => { try { localStorage.setItem('fre.gm.recent', JSON.stringify(st.recent)); } catch (e) { /* private window: not kept */ } };
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const levelName = a => (G().AUTH[a] || [null, a])[1];
  const sideText = r => r.side === 'CLIENT' ? 'in the game' : r.side === 'BOTH' ? 'game + server' : 'server';

  function state(r) {
    if (r.live) return null;
    if (!r.compiled) return r.side === 'SERVER' && r.inServer && !r.inClient ? 'not built into the game (the game never sends it)' : `not built (${r.conds.join(', ') || 'switched off'})`;
    return 'never runs: below /open';
  }
  function shown(ctx) {
    const m = model(ctx), q = (ctx.query || '').trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      return m.rows.filter(r => r.live || st.showOff).filter(r => words.every(w => `/${r.name} /${r.short} ${G().whatOf(r) || ''} ${(G().CATS.find(c => c[0] === G().catOf(r)) || [])[1]}`.toLowerCase().includes(w)));
    }
    if (st.cat === 'off') return m.rows.filter(r => !r.live);
    const rows = m.rows.filter(r => r.live || st.showOff);
    return st.cat === 'all' ? rows : rows.filter(r => G().catOf(r) === st.cat);
  }

  // ------------------------------------------------------------------ pickers
  function monsterOptions(ws) {
    if (!ws._gmMon) ws._gmMon = ws.movers ? [...ws.movers.movers.values()].filter(v => v.name && !/^IDS_/.test(v.name) && !/^MI_PET_/.test(v.define))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map(v => ({ v: v.id, label: `${v.name} · Lv ${v.level} · ${v.rank}${v.element ? ' · ' + ELEMENTS[v.element] : ''}`, find: `${v.define} ${v.id}` })) : [];
    return ws._gmMon;
  }
  function itemOptions(ws) {
    if (!ws._gmItems) ws._gmItems = [...ws.items.items.values()].map(it => ws.itemInfo(it)).filter(i => i.name && !/^IDS_/.test(i.name))
      .sort((a, b) => a.name.localeCompare(b.name)).map(i => ({ v: i.id, label: `${i.name} (${i.id})`, find: i.define }));
    return ws._gmItems;
  }
  function field(ctx, r, a, i) {
    const m = model(ctx), ws = ctx.ws, key = r.name + '|' + i;
    const v = st.vals[key];
    const set = x => { st.vals[key] = x; rebuild(ctx, r); };
    if (a.k === 'monster') {
      const pick = ws.movers && ws.movers.movers.get(+v);
      return h('span.gm-pick', FRE.ui.combo({ options: monsterOptions(ws), value: v, placeholder: 'Type a monster name, MI_ or id…', onPick: x => { set(x); ctx.renderAll(false); } }),
        pick ? h('span.muted.small', ` ${pick.define} · id ${pick.id}`) : null);
    }
    if (a.k === 'item') {
      const it = v != null ? ws.itemById(+v) : null;
      return h('span.gm-pick', it ? FRE.dds.picture(ctx, iconOf(it), { cls: '.bx-icon' }) : null,
        FRE.ui.combo({ options: itemOptions(ws), value: v, placeholder: 'Type an item name, II_ or id…', onPick: x => { set(x); ctx.renderAll(false); } }),
        it ? h('span.muted.small', ` ${it.define} · id ${it.id}`) : null);
    }
    if (a.k === 'petkind') {
      return h('span.gm-pets', m.pets.kinds.map(k => {
        const it = ws.itemById(k.item);
        return h('button.gm-pet' + (String(v) === String(k.kind) ? '.sel' : ''), { title: it ? it.name : `kind ${k.kind}`, on: { click: () => { set(k.kind); ctx.renderAll(false); } } },
          h('span.small', it ? (it.name || it.define) : `kind ${k.kind}`));
      }));
    }
    if (a.k === 'stages') {
      const cur = String(v || a.def).padEnd(5, '1').slice(0, 5).split('');
      const tops = m.pets.stageMax.length ? m.pets.stageMax : [9, 9, 9, 9, 9];
      return h('span.gm-stages', ['D', 'C', 'B', 'A', 'S'].map((s, j) => h('label.small', ` ${s} `,
        h('select', { on: { change: e => { cur[j] = e.target.value; set(cur.join('')); } } },
          Array.from({ length: tops[j] || 9 }, (_, n) => h('option', { value: n + 1, selected: +cur[j] === n + 1 }, n + 1))))),
        ' ', h('button', { title: 'D 1, C 3, B 5, A 7, S 9: the best an official pet can roll', on: { click: () => { set('13579'); ctx.renderAll(false); } } }, 'Perfect 1/3/5/7/9'),
        ' ', h('button', { title: `The highest our pet.inc allows: ${tops.join('/')}`, on: { click: () => { set(tops.join('')); ctx.renderAll(false); } } }, `Max ${tops.join('/')}`));
    }
    if (a.k === 'job') {
      const opts = m.jobs.filter(j => j.name).map(j => ({ v: j.name, label: j.name }));
      return FRE.ui.combo({ options: opts, value: v, placeholder: 'Type a job…', onPick: x => { set(x); ctx.renderAll(false); } });
    }
    if (a.k === 'world') {
      const list = ws.worldList ? ws.worldList() : [];
      return h('select', { on: { change: e => set(e.target.value) } }, h('option', { value: '' }, '— pick a map —'),
        list.map(w => h('option', { value: w.id, selected: String(v) === String(w.id) }, `${w.name} (${w.define}, ${w.id})`)));
    }
    if (a.k === 'sub' || a.k === 'choice') {
      // buttons (the user): a new sub-word clears the old word's own fields
      const cur = String(v == null ? a.def : v);
      const pick = x => {
        if (a.k === 'sub' && x !== cur) for (const k of Object.keys(st.vals)) if (k.startsWith(r.name + '|') && k !== key) delete st.vals[k];
        set(x); ctx.renderAll(false);
      };
      return h('span.gm-btns', a.opts.map(([x, t]) => h('button.gm-opt' + (cur === x ? '.sel' : ''), { 'data-v': x, on: { click: () => pick(x) } }, t)));
    }
    if (a.k === 'num') return h('input', { type: 'number', min: a.min, max: a.max, value: v == null ? a.def : v, style: 'width:9em', 'data-gm': key, on: { input: e => set(e.target.value) } });
    return h('input', { type: 'text', value: v == null ? '' : v, style: a.k === 'rest' ? 'width:28em' : 'width:14em', 'data-gm': key,
      placeholder: a.k === 'player' ? 'name (in game)' : '', on: { input: e => set(e.target.value) } });
  }
  function valuesOf(r) {
    const first = st.vals[r.name + '|0'];
    const spec = G().argsOf(r, first == null ? undefined : first);
    if (!spec) return [st.vals[r.name + '|free'] || ''];
    return spec.map((a, i) => { const v = st.vals[r.name + '|' + i]; return v == null || v === '' ? (a.def == null ? '' : a.def) : v; });
  }
  function rebuild(ctx, r) {
    st.sel = r.name;
    st.bar = G().build(r, valuesOf(r), { short: st.short });
    paintBar(ctx);
  }

  // ------------------------------------------------------------------ the command bar
  let barEl = null;
  function paintBar(ctx) {
    if (!barEl) return;
    const input = barEl.querySelector('input.gm-line'), what = barEl.querySelector('.gm-what');
    if (input && input !== document.activeElement) input.value = st.bar;
    if (what) {
      const res = Sim().type(model(ctx), st.bar, { auth: st.auth });
      const gap = G().incomplete(st.bar);
      what.textContent = !st.bar ? 'Pick a command above: its line shows here.' : gap ? `⚠ Fill in ${G().gaps(st.bar).join(', ')} above.`
        : `${levelName(st.auth)} typing it: ${Sim().explain(res)}`;
      what.className = 'gm-what small ' + (!gap && /^(game|server|both)$/.test(res.result) ? 'ok-text' : 'warn-text');
    }
  }
  function copy(ctx) {
    const line = st.bar.trim();
    if (!line) { toast('Nothing to copy: pick a command first.', 'bad'); return; }
    if (G().incomplete(line)) { toast(`Fill in ${G().gaps(line).join(', ')} first.`, 'bad'); return; }
    st.recent = [line, ...st.recent.filter(x => x !== line)].slice(0, 8); keep();
    FRE.ui.copyText(line);
    ctx.renderAll(false);
  }
  function bar(ctx) {
    barEl = h('div.gm-bar',
      h('div.gm-row', h('input.gm-line', { type: 'text', value: st.bar, spellcheck: false, placeholder: '/command …', on: { input: e => { st.bar = e.target.value; paintBar(ctx); }, keydown: e => { if (e.key === 'Enter') copy(ctx); } } }),
        h('button.primary', { on: { click: () => copy(ctx) } }, 'Copy')),
      h('div.gm-what.small'),
      st.recent.length ? h('div.gm-recent.small', 'Recent: ', st.recent.map(l => h('button.chip', { title: 'Put back in the bar', on: { click: () => { st.bar = l; paintBar(ctx); } } }, l))) : null);
    paintBar(ctx);
    return barEl;
  }

  // ------------------------------------------------------------------ one command
  function card(ctx, r) {
    const off = state(r), open = st.sel === r.name && !off;
    const spec = G().argsOf(r, st.vals[r.name + '|0']);
    const head = h('div.gm-head', h('b', '/' + r.name), r.short !== r.name ? h('span.muted', ` /${r.short}`) : null,
      h('span.tag', { title: 'This level and every higher one' }, r.auth === 'GENERAL' ? levelName(r.auth) : levelName(r.auth) + '+'), h('span.tag.muted', sideText(r)),
      h('span.gm-desc', G().whatOf(r) || ''), off ? h('span.warn-text.small', ` ⛔ ${off}`) : null,
      h('span.muted.small', { title: 'Where the command is listed' }, ` FuncTextCmd.cpp:${r.line}`));
    // closed card of a sub-word command: its words show, so it is clear it does more than one thing
    const subs = (G().ARGS[r.name.toLowerCase()] || {}).sub;
    if (subs && !open) head.querySelector('.gm-desc').appendChild(h('span.gm-subs.muted.small', ' · ' + subs.map(o => o.label).join(' · ')));
    const el = h('div.gm-card' + (open ? '.sel' : '') + (off ? '.off' : ''), { 'data-cmd': r.name }, head);
    if (!off) head.addEventListener('click', () => { if (st.sel !== r.name) { rebuild(ctx, r); ctx.renderAll(false); } });
    if (!open) return el;
    if (spec && spec.length) {
      el.appendChild(h('div.gm-form', spec.map((a, i) => h('label.gm-field', FRE.ui.fieldLabel(a.label, !a.optional), field(ctx, r, a, i)))));
    } else if (!spec) {
      el.appendChild(h('div.gm-form', h('label.gm-field', FRE.ui.fieldLabel('Words after the command', false),
        h('input', { type: 'text', style: 'width:28em', value: st.vals[r.name + '|free'] || '', on: { input: e => { st.vals[r.name + '|free'] = e.target.value; rebuild(ctx, r); } } }),
        h('div.muted.small', `This command's words are not described here yet: see TextCmd_${r.fn.replace(/^TextCmd_/, '')} in FuncTextCmd.cpp.`))));
    } else el.appendChild(h('p.muted.small', 'No words after it.'));
    if (r.name === 'notalk' && r.short === 'ta') el.appendChild(h('p.warn-text.small', '⚠ Its short name /ta is also /tradeagree\'s, which comes first: /ta runs /tradeagree. The bar always writes /notalk.'));
    if (r.name === 'petlevel') el.appendChild(h('p.muted.small', 'Works only when your pet\'s EXP is 100% (use /petexp first). Your own pet only.'));
    if (r.name === 'pet') el.appendChild(h('p.muted.small', 'The player must be online with a pet out. Stages: one number per stage reached, D first (1-9 each).'));
    return el;
  }

  const mod = {
    id: 'gmcmd', label: 'GM Commands', searchPlaceholder: 'Search every command', noItems: true,
    help: 'GM Commands: every chat command of the source, by what it is for; pick one, fill it in, Copy (read only)',
    st,
    onLoad() { st.sel = null; st.cat = 'summon'; },
    renderList(el, ctx) {
      const m = model(ctx);
      if (!m.ok) { el.appendChild(h('p.warn-text', 'FuncTextCmd.cpp not found.')); return; }
      const live = m.rows.filter(r => r.live);
      const entry = (id, label, n) => el.appendChild(h('div.npc' + (st.cat === id ? '.sel' : ''), { 'data-cat': id, on: { click: () => { st.cat = id; ctx.renderAll(false); } } },
        h('div.n', h('span', label)), h('div.k', `${n} command${n === 1 ? '' : 's'}`)));
      for (const [id, label] of G().CATS) { const n = live.filter(r => G().catOf(r) === id).length; if (n) entry(id, label, n); }
      entry('all', 'All working commands', live.length);
      entry('off', 'Not working', m.rows.length - live.length);
    },
    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const m = model(ctx);
        if (!m.ok) {
          el.appendChild(h('div.npc-title', h('h2', 'GM Commands')));
          el.appendChild(h('p.warn-text', '⚠ The command list is read from Source/Source/_Interface/FuncTextCmd.cpp. Pick the FLYFF-V19-SOURCE folder, or run sh tools/refresh-fixtures.sh test-data to copy it into the test folder.'));
          return;
        }
        const rows = shown(ctx), cat = st.cat === 'all' ? 'All working commands' : st.cat === 'off' ? 'Not working' : (G().CATS.find(c => c[0] === st.cat) || [0, ''])[1];
        const live = m.rows.filter(r => r.live).length, dead = m.rows.filter(r => r.dead && r.compiled).length;
        el.appendChild(h('div.npc-title', h('h2', ctx.query ? `Search: ${ctx.query}` : cat), h('span.def', `${rows.length} shown`)));
        el.appendChild(h('p.muted.small', `${live} commands work, read from FuncTextCmd.cpp (lines ${m.beginLine}-${m.endLine}). ${dead} more are listed below /open and never run (ParsingCommand stops there, line ${m.lines.openCheck}). `
          + 'Names are exact: small and capital letters count. Monsters and items go in by number (a text name is matched against the display name, and spaces split it).'));
        el.appendChild(h('div.gm-opts.small',
          h('label', 'You are: ', h('select', { on: { change: e => { st.auth = e.target.value; paintBar(ctx); } } }, G().LEVELS.map(a => h('option', { value: a, selected: st.auth === a }, levelName(a))))),
          ' ', h('label', h('input', { type: 'checkbox', checked: st.short, on: { change: e => { st.short = e.target.checked; const r = m.rows.find(x => x.name === st.sel); if (r) rebuild(ctx, r); } } }), ' short names (/cn)'),
          ' ', st.cat !== 'off' ? h('label', h('input', { type: 'checkbox', checked: st.showOff, on: { change: e => { st.showOff = e.target.checked; ctx.renderAll(false); } } }), ' show the ones that do not work') : null));
        el.appendChild(h('div.gm-list', rows.map(r => card(ctx, r))));
        if (!rows.length) el.appendChild(h('p.muted', 'No command matches.'));
        el.appendChild(bar(ctx));
      });
    },
    addTarget() { return { ok: false, title: 'Nothing to add: this page only builds commands to copy' }; },
    locate(d) { if (d.module !== 'gmcmd') return false; st.cat = 'off'; return true; },
  };

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
