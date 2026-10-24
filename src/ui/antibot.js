// Bot Check: AntiBot.inc - the puzzle's pictures and words, the tuning (V19 d816e99f, not yet built), the maps where kills never
// count, and a simulator (loaders/antibot-sim.js): the puzzle as a player sees it, and a made-up hour of play.
(function (FRE) {
  'use strict';
  const { h, toast, keepFocus, numInput } = FRE.dom;
  const FILE = 'antibot.inc';
  const st = { sel: 'tune', q: '', newW: { id: null, word: '' }, tryState: null, seed: 1, every: 4, step: 0, answer: 'right', delay: 20, minutes: 60, zone: true };
  const A = () => FRE.antiBot, O = () => FRE.antiBotOps, Sim = () => FRE.antiBotSim;
  const model = ctx => ctx.ws.models.antibot;
  const can = ctx => ctx.ws.isEditable(FILE);
  const iconOf = it => (it ? String(FRE.specItem.get(it, 'szIcon') || '').replace(/"/g, '').trim() : '');
  const nameOf = (ws, id) => { const it = ws.itemById(id); return it ? (it.name || it.define) : `#${id}`; };
  const PAGES = [{ id: 'tune', label: 'Settings' }, { id: 'words', label: 'Pictures and words' }, { id: 'try', label: 'Try it' }];
  const edit = (ctx, make, label, mergeKey) => ctx.editGroup(() => [{ file: FILE, splices: make(ctx.ws.files.get(FILE).text, model(ctx)) }], label, ['antibot|' + st.sel], mergeKey);
  function itemOptions(ws) {
    if (!ws._abItemOpts) ws._abItemOpts = [...ws.items.items.values()].map(it => ws.itemInfo(it)).sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ v: i.define, label: `${i.name} (${i.define})`, find: i.define }));
    return ws._abItemOpts;
  }
  const table = (widths, rows) => h('table.items.rt', { style: 'table-layout:fixed;width:100%;max-width:980px' }, h('colgroup', widths.map(w => h('col', { style: `width:${w}` }))), rows);
  const two = n => String(n).padStart(2, '0');
  const mmss = t => `${Math.floor(t / 60)}:${two(t % 60)}`;

  const mod = {
    id: 'antibot', label: 'Bot Check', searchPlaceholder: 'Search', noItems: true,
    help: 'Bot Check: the puzzle\'s pictures and words, how often it opens, the timers (AntiBot.inc)',
    st,
    onLoad() { st.sel = 'tune'; st.q = ''; st.tryState = null; },
    renderList(el, ctx) {
      const m = model(ctx);
      for (const p of PAGES) {
        const sub = p.id === 'tune' ? `score ${A().value(m, 'SCORE_LIMIT')} · 1 in ${A().value(m, 'RANDOM_CHANCE') || 'off'}` : p.id === 'words' ? `${m.lines.length} words${m.ok ? '' : ' · OFF: fewer than 6'}` : 'the puzzle, a player\'s hour';
        el.appendChild(h('div.npc' + (st.sel === p.id ? '.sel' : ''), { 'data-page': p.id, on: { click: () => { st.sel = p.id; ctx.renderAll(false); } } },
          h('div.n', h('span', p.label)), h('div.k', sub)));
      }
    },
    renderEditor(el, ctx) {
      keepFocus(el, () => {
        const m = model(ctx);
        el.appendChild(h('div.note.small', 'AntiBot.inc is read by the WorldServer only (never copy it to the game: the words are the answer key). After saving: /antibot reload in game. ',
          h('b', 'Settings and "maps where kills do not count"'), ' need the V19 change d816e99f built into the WorldServer (not yet tested); an older build skips those lines and uses its compiled values.'));
        if (!m.ok) el.appendChild(h('p.warn-text', `⛔ Only ${m.lines.length} good picture lines, 6 needed: the bot check is OFF at start.`));
        if (st.sel === 'tune') tuneView(el, ctx);
        else if (st.sel === 'words') wordsView(el, ctx);
        else tryView(el, ctx);
      });
    },
    addTarget() { return { ok: false, title: 'Use the pages: Pictures and words has + Add word' }; },
    locate(d, ctx) {
      if (d.module !== 'antibot') return false;
      st.sel = /AB_RANGE/.test(d.code) ? 'tune' : 'words';
      return true;
    },
  };

  function tuneView(el, ctx) {
    const m = model(ctx), ed = can(ctx);
    el.appendChild(h('div.npc-title', h('h2', 'Settings')));
    el.appendChild(h('p', 'Monster kills raise a hidden score; at the limit (or by a random roll) the player gets "Click the <word>" with 6 pictures. No answer in time: frozen; still no answer: sent to town.'));
    const rows = [];
    for (const k of A().TUNING) {
      const t = m.tune[k.key], v = t.value;
      const set = n => edit(ctx, tx => O().setTune(tx, model(ctx), k.key, n), `Bot Check: ${k.label.toLowerCase()} ${n} (was ${v})`, `ab|${k.key}`);
      const input = k.bool ? h('label', h('input', { type: 'checkbox', checked: !!v, disabled: !ed, on: { change: ev => set(ev.target.checked ? 1 : 0) } }), ' yes')
        : numInput({ value: v, min: k.min, max: k.max, disabled: !ed, key: `ab|${k.key}`, onCommit: n => { if (n === null || n === v) return; try { set(n); } catch (er) { toast(er.message, 'bad'); } } });
      rows.push(h('tr', h('td', h('b', k.label), h('div.muted.small', k.help)), h('td', input),
        h('td.muted.small', t.set ? `${k.min} - ${k.max}` : `default ${k.def}: not in the file (${k.min} - ${k.max})`)));
    }
    el.appendChild(table(['56%', '16%', '28%'], rows));
    // what the numbers mean in play
    const lim = A().value(m, 'SCORE_LIMIT'), rnd = A().value(m, 'RANDOM_CHANCE');
    const kph = 600;
    el.appendChild(h('p.small', `At about ${kph} kills an hour: the score reaches ${lim} in about ${Math.round(lim / kph * 60)} minutes moving around, ${Math.round(lim / 2 / kph * 60)} minutes camping (after the first ${A().value(m, 'CAMP_MINUTES')} minutes). `
      + (rnd ? `The random check alone opens it about every ${Math.round(rnd / kph * 60)} minutes on average.` : 'No random check.')));
    // maps
    el.appendChild(h('h3', 'Maps where kills never count'));
    el.appendChild(h('p.muted.small', 'Towns and safe areas, events, PvP / Guild Siege maps, secret rooms, guild houses and party dungeons never count anyway. Add other maps here (e.g. Bear\'s Cave, which the game calls "Boss Monster: Mushmoot").'));
    const worlds = ctx.ws.worldList ? ctx.ws.worldList() : [];
    // the in-game name (World.inc SetTitle, loaders/area.js) when the maps were read; the folder name otherwise
    let titles = ctx.ws.area ? ctx.ws.area.worlds : null;
    if (!titles) try { titles = FRE.area.readWorlds(ctx.ws.files.get('world.inc'), ctx.ws.defines.defines, FRE.area.loadStrings(p => ctx.ws.files.get(p.toLowerCase()) || null)); } catch (e) { titles = new Map(); }
    const wtitle = w => { const a = titles.get(w.id >>> 0); return a && a.title.trim() ? a.title.trim() : w.name; };
    const wlabel = w => wtitle(w) === w.name ? `${w.name} (${w.define})` : `${wtitle(w)} (${w.name}, ${w.define})`;
    const wname = id => { const w = worlds.find(x => (x.id >>> 0) === id); return w ? wlabel(w) : `map ${id}`; };
    const wl = [h('tr', h('th', 'Map'), h('th', ''))];
    for (const w of m.worlds) wl.push(h('tr', h('td', wname(w.world)), h('td', ed ? h('button.icon.danger', { on: { click: () => edit(ctx, tx => O().removeWorld(tx, model(ctx), w.world), `Bot Check: kills count again on ${wname(w.world)}`) } }, '✕') : null)));
    if (m.worlds.length) el.appendChild(table(['90%', '10%'], wl));
    else el.appendChild(h('p.muted.small', 'None.'));
    if (ed && worlds.length) {
      const opts = [...new Map(worlds.map(w => [w.id >>> 0, w])).values()].filter(w => !m.worlds.some(x => x.world === (w.id >>> 0)))
        .map(w => ({ v: w.define, label: wlabel(w), find: `${wtitle(w)} ${w.name} ${w.define}` }));
      el.appendChild(h('div.dr-line', FRE.ui.combo({ options: opts, value: '', placeholder: '+ Add a map where kills never count', onPick: d => {
        const w = worlds.find(x => x.define === d); if (!w) return;
        try { edit(ctx, tx => O().addWorld(tx, model(ctx), w.define, w.id >>> 0), `Bot Check: kills never count on ${wtitle(w)}`); } catch (er) { toast(er.message, 'bad'); }
      } })));
    }
  }

  function wordsView(el, ctx) {
    const m = model(ctx), ed = can(ctx), ws = ctx.ws;
    el.appendChild(h('div.npc-title', h('h2', `Pictures and words (${m.lines.length})`)));
    el.appendChild(h('p.muted.small', 'Each line is an item whose picture shows the word. Pick pictures a player sees at a glance; every word and every item only once; two pictures that look alike = keep one. 6 are shown at a time, so 6 is the minimum; more = harder for a bot to learn.'));
    if (ed) {
      const nw = st.newW, msg = h('div.small');
      const add = h('button.primary', { on: { click: () => {
        const it = ws.itemById(nw.id), w = nw.word;
        try { edit(ctx, tx => O().addWord(tx, model(ctx), nw.id, it.define, w), `Bot Check: new word "${String(w).trim()}" (${nameOf(ws, nw.id)})`); } catch (er) { toast(er.message, 'bad'); return; }
        st.newW = { id: null, word: '' }; ctx.renderAll(false);
      } } }, '+ Add word');
      const check = () => {
        let v = nw.id === null ? 'Pick an item' : null;
        if (!v) try { O().checkWord(m, nw.word, null); if (m.lines.some(r => r.id === nw.id)) v = 'That item is already in the list'; } catch (er) { v = er.message; }
        add.disabled = !!v; msg.className = 'small warn-text'; msg.textContent = v && (nw.id !== null || nw.word) ? '⛔ ' + v : '';
      };
      const wordBox = h('input', { type: 'text', value: nw.word, placeholder: 'The word players are asked for', maxLength: 30, style: 'width:16em' });
      wordBox.dataset.key = 'ab-new-word';
      wordBox.addEventListener('input', () => { nw.word = wordBox.value; check(); });
      el.appendChild(h('div.dr-line',
        nw.id !== null ? FRE.dds.picture(ctx, iconOf(ws.itemById(nw.id)), { scale: 2, cls: '.bx-icon-big' }) : null,
        FRE.ui.combo({ options: itemOptions(ws), value: nw.id !== null ? ws.itemById(nw.id).define : '', placeholder: 'Pick the item (its picture)', onPick: d => {
          const v = ws.defines.defines.get(d); if (v === undefined) return; nw.id = v >>> 0;
          if (!nw.word) nw.word = (ws.itemById(nw.id) || {}).name || '';
          ctx.renderAll(false);
        } }), wordBox, add));
      el.appendChild(msg);
      check();
    }
    const rows = [h('tr', h('th', 'Picture'), h('th', 'Item'), h('th', 'Word'), h('th', ''))];
    const all = [...m.lines.map(r => [r, null]), ...m.skipped.map(r => [r, r.why])].sort((a, b) => a[0].start - b[0].start);
    for (const [r, why] of all) {
      const it = ws.itemById(r.id);
      const box = h('input', { type: 'text', value: r.word.text, disabled: !ed, maxLength: 30, style: 'width:100%' });
      box.dataset.key = `ab-word|${r.start}`;
      box.addEventListener('change', () => {
        const v = box.value;
        try { edit(ctx, tx => O().editWord(tx, model(ctx), r, v), `Bot Check: "${r.word.text}" -> "${String(v).trim()}"`); } catch (er) { toast(er.message, 'bad'); ctx.renderAll(false); }
      });
      rows.push(h('tr', h('td', FRE.dds.picture(ctx, iconOf(it), { scale: 2, cls: '.bx-icon-big' })),
        h('td', it ? nameOf(ws, r.id) : `#${r.id}`, h('div.muted.small', r.item.define), why ? h('div.small.warn-text', `⚠ skipped by the server: ${why}`) : null),
        h('td', box),
        h('td', ed ? h('button.icon.danger', { title: 'Remove this word', on: { click: () => edit(ctx, tx => O().removeWord(tx, r), `Bot Check: removed "${r.word.text}"`) } }, '✕') : null)));
    }
    el.appendChild(table(['12%', '40%', '42%', '6%'], rows));
  }

  function tryView(el, ctx) {
    const m = model(ctx), ws = ctx.ws;
    el.appendChild(h('div.npc-title', h('h2', 'Try it')));
    if (!m.ok) { el.appendChild(h('p.warn-text', 'Fewer than 6 words: there is no puzzle.')); return; }
    // the puzzle as the player sees it
    el.appendChild(h('h3', '🧩 The puzzle'));
    if (!st.tryState) {
      const rng = FRE.xRandom.rng(st.seed), e = Sim().newEntry(), log = [];
      Sim().kill(m, Object.assign(e, { recheck: true }), rng, 0, { world: 1, x: 0, y: 0, z: 0 }, true, log);
      st.tryState = { rng, e, log: [] };
    }
    const S = st.tryState, e = S.e;
    const click = i => { Sim().answer(m, e, S.rng, 0, i, S.log); ctx.renderAll(false); };
    if (e.state === Sim().NONE) el.appendChild(h('p.ok-text', `✓ ${S.log.some(x => x.ev === 'solved') ? 'Solved: "Thank you, have fun!"' : 'No puzzle.'}`));
    else {
      el.appendChild(h('p', h('b', `Click the ${e.word}`), h('span.muted.small', ` · ${e.state === Sim().FROZEN ? 'FROZEN · ' : ''}${e.tries} click${e.tries === 1 ? '' : 's'} left · ${A().value(m, e.state === Sim().FROZEN ? 'FROZEN_SECONDS' : 'ANSWER_SECONDS')} s`)));
      el.appendChild(h('div.dr-line', e.items.map((id, i) => h('button.ab-pick', { title: `${nameOf(ws, id)}${i === e.correct ? ' (the answer)' : ''}`, on: { click: () => click(i) } }, FRE.dds.picture(ctx, iconOf(ws.itemById(id)), { scale: 2, cls: '.bx-icon-big' })))));
    }
    if (S.log.length) el.appendChild(h('p.small.muted', S.log.map(x => x.ev === 'wrong' ? `wrong (${x.tries} left)` : x.ev === 'frozen' ? 'frozen, new pictures' : x.ev === 'icons' ? 'new pictures' : x.ev).join(' → ')));
    el.appendChild(h('div.dr-line', h('button', { on: { click: () => { st.seed = 1 + Math.floor(Math.random() * 99999); st.tryState = null; ctx.renderAll(false); } } }, '🎲 Another puzzle')));

    // a made-up hour
    el.appendChild(h('h3', '⏱ A player\'s hour'));
    el.appendChild(h('div.dr-line',
      h('span', 'a kill every '), numInput({ value: st.every, min: 1, max: 600, key: 'ab-every', onCommit: v => { if (v) { st.every = v; ctx.renderAll(false); } } }), h('span', ' s, moving '),
      numInput({ value: st.step, min: 0, max: 500, key: 'ab-step', onCommit: v => { st.step = v || 0; ctx.renderAll(false); } }), h('span', ' m a kill, for '),
      numInput({ value: st.minutes, min: 1, max: 1440, key: 'ab-min', onCommit: v => { if (v) { st.minutes = v; ctx.renderAll(false); } } }), h('span', ' minutes; answers ')));
    el.appendChild(h('div.dr-line', h('select', { on: { change: ev => { st.answer = ev.target.value; ctx.renderAll(false); } } },
      [['right', 'right'], ['wrong', 'wrong every time'], ['none', 'never (a bot)']].map(([v, l]) => h('option', { value: v, selected: st.answer === v }, l))),
      h('span', ' after '), numInput({ value: st.delay, min: 0, max: 3600, key: 'ab-delay', onCommit: v => { st.delay = v || 0; ctx.renderAll(false); } }), h('span', ' s'),
      h('button.small', { on: { click: () => { st.seed = 1 + Math.floor(Math.random() * 99999); ctx.renderAll(false); } } }, '🎲 Again')));
    const res = Sim().session(m, { seed: st.seed, every: st.every, step: st.step, answer: st.answer, delay: st.delay, seconds: st.minutes * 60 });
    const said = { open: x => `puzzle opens (${x.reason === 'score' ? 'score limit' : x.reason === 'random' ? 'random check' : 'check again after town'}): "Click the ${x.word}"`,
      wrong: x => `wrong click (${x.tries} left)`, icons: () => 'new pictures', frozen: x => `FROZEN (${x.detail ? 'no clicks left' : 'time is up'}), new pictures`, solved: () => 'solved: "Thank you, have fun!"', town: () => 'SENT TO TOWN' };
    const shown = res.log.filter(x => x.ev !== 'icons').slice(0, 60);
    el.appendChild(h('ul.small', shown.map(x => h('li', h('code', mmss(x.t)), ' ', said[x.ev](x)))));
    if (!res.log.length) el.appendChild(h('p.muted.small', 'Nothing happens in this time.'));
    const E = res.entry;
    el.appendChild(h('p.small', `In ${st.minutes} minutes: ${E.puzzles} puzzle${E.puzzles === 1 ? '' : 's'}, ${E.solved} solved, ${E.frozen} frozen, ${E.town} sent to town; score now ${E.score} / ${A().value(m, 'SCORE_LIMIT')}.`));
  }

  FRE.ui.modules.push(mod);
})(globalThis.FRE = globalThis.FRE || {});
