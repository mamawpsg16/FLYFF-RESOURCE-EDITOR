// Port of the WorldServer's Battle Pass player logic (commit cc73ccdd + later fixes),
// used by the season-change tests (tests/run-tests.js) and tools/bp-sim.js. Each function
// names the C++ it copies; tools/oracle_sim.py holds a second, independent copy and the tests
// require both to agree step by step.
// Bag: p.free = empty slots. OnDoBP's checks use it; a reward takes one empty slot, or is
// mailed when there is none (GiveBattlePassReward). Not modelled: a reward stacking onto
// items already in the bag.
export function bpServer(FRE, ws, seed = 7) {
  const BP = FRE.battlePass;
  const MAX = BP.MAX_BPOINTS;
  const PASS_ITEM = ws.defines.defines.get('II_SYS_SYS_SCR_BPPASS1');
  const nameOf = id => { const it = ws.itemById(id); return it ? it.name : String(id); };
  const R = FRE.xRandom.rng(seed);   // the server's xRandom (one shared generator, like g_next)

  // --- the server's config tables, as CProject::LoadBattlePass builds them -------
  // (first insert wins - already so in the model's maps; the clamps are applied here)
  function config(model) {
    const pass = model.pass;
    return {
      passes: model.passes, ladder: model.ladder, monsters: model.monsters,
      first: pass,                                         // mapBattPassItem.begin()
      end: r => { const e = BP.seasonEnd(r.time.value); return e ? e.date.getTime() : 0; },
      cost: r => Math.min(Math.max(r.points.value, 1), MAX),
      qty: r => Math.max(r.qty.value, 1),
      range: m => { const hi = Math.min(Math.max(m.max.value, 1), MAX); return [Math.min(Math.max(m.min.value, 1), hi), hi]; },
    };
  }

  // --- player ---------------------------------------------------------------------
  function player(name) {
    return { name, level: 0, points: 0, type: 0, enable: 0, end: 0, got: [], passItems: 0, free: 100, refused: 0, log: [] };
  }
  const say = (p, msg) => p.log.push(msg);

  // CMover::IsBattlePass (Mover.cpp:1150): "running" purely on the end date
  const isBP = (p, now) => p.end > 0 && p.end > now.getTime();
  // CMover::BattlePassSize (Mover.cpp:1162): rows of the player's season
  const size = (cfg, p) => [...cfg.ladder.values()].filter(r => r.type.value === p.type).length;
  // MoverParam.cpp:3042: +20% speed only while a BOUGHT pass is running
  const speedBonus = (p, now) => p.enable === 1 && p.end > 0 && isBP(p, now);

  // CDPDatabaseClient::OnJoin (DPDatabaseClient.cpp:1373)
  function login(cfg, p, now) {
    if (!isBP(p, now) && cfg.first) {
      const tEnd = cfg.end(cfg.first);
      if (tEnd > now.getTime()) {
        Object.assign(p, { level: 1, points: 0, type: cfg.first.type.value, enable: 0, end: tEnd });
        say(p, `login: put on season ${p.type} (free track), level 1`);
        return;
      }
      say(p, 'login: no season running - not on a pass');
      return;
    }
    say(p, `login: still on season ${p.type}, level ${p.level}`);
  }

  // CUser::GiveBattlePassReward (User.cpp:4631): bag first, mail when it does not fit
  function giveReward(cfg, p, level) {
    const r = cfg.ladder.get(level);
    if (!r || r.type.value !== p.type || !ws.itemById(r.id)) return;
    const where = p.free > 0 ? 'bag' : 'mail';
    if (where === 'bag') p.free--;
    p.got.push({ level, id: r.id, qty: cfg.qty(r), where, text: `L${level} ${cfg.qty(r)}x ${nameOf(r.id)}${where === 'mail' ? ' (mailed)' : ''}` });
  }

  // CUserMng::AddBPUpdate (User.cpp:4685): at most one level per call, rest carries over
  function addPoints(cfg, p, n, now) {
    if (!(n > 0 && isBP(p, now) && p.level < size(cfg, p))) return;
    const r = cfg.ladder.get(p.level);
    if (!r) return;
    const total = p.points + n;
    if (total >= cfg.cost(r)) {
      p.points = total - cfg.cost(r); p.level++;
      if (p.enable === 1) giveReward(cfg, p, p.level);   // rewards only on the bought track
    } else p.points = total;
  }

  // CAttackArbiter::OnDied (AttackArbiter.cpp:966): only BP5 monsters pay, killing blow only
  function kill(cfg, p, define, now) {
    if (!(isBP(p, now) && p.level < size(cfg, p))) return 0;
    const m = cfg.monsters.get(ws.defines.defines.get(define));
    if (!m) return 0;
    const [lo, hi] = cfg.range(m);
    const n = R.range(lo, hi + 1) | 0;                 // xRandom( nMin, nMax + 1 )
    if (n > 0) addPoints(cfg, p, n, now);
    return n;
  }
  function grindTo(cfg, p, level, define, now) {
    let kills = 0, pts = 0;
    while (p.level < level && kills < 100000) { const n = kill(cfg, p, define, now); if (!n) break; pts += n; kills++; }
    say(p, kills ? `killed ${kills} x ${define}: +${pts} points -> level ${p.level}` : `killed ${define}: no points (not on a running pass)`);
    return kills;
  }

  // CDPSrvr::OnDoBP, nCheck 1 = the bought pass (DPSrvr.cpp:11818)
  function usePass(cfg, p, now) {
    if (p.passItems < 1) return;
    const refuse = msg => { p.refused++; say(p, `use pass: "${msg}" (not used up)`); };
    const row = cfg.passes.get(PASS_ITEM);
    if (!row) { refuse('That is not a battle pass item.'); return; }
    const tEnd = cfg.end(row);
    let backPay = false, payThis = false;
    if (!isBP(p, now)) {
      if (p.free <= 0) { refuse('Your inventory is full.'); return; }
      // no running pass: activated with the config date, even if that date is already past
      Object.assign(p, { level: 1, points: 0, type: row.type.value, enable: 1, end: tEnd });
      payThis = true;
      say(p, 'use pass: "Battle pass activated."');
    } else if (p.enable === 0) {
      if (p.end !== tEnd || p.type !== row.type.value) { refuse('That pass belongs to a different battle pass season.'); return; }
      let pending = 0;
      for (let lv = 1; lv <= p.level; lv++) { const r = cfg.ladder.get(lv); if (r && r.type.value === p.type) pending++; }
      if (p.free < pending) { refuse(`Activating this pass will give you ${pending} rewards. You need ${pending} free inventory slots - you have ${p.free}.`); return; }
      p.enable = 1; backPay = true;
      say(p, `use pass: "Battle pass activated. Collecting everything you have already earned..." (levels 1-${p.level})`);
    } else { refuse('You already have an active battle pass.'); return; }
    const before = p.got.length;
    if (backPay) for (let i = 1; i <= p.level; i++) giveReward(cfg, p, i);
    else if (payThis) giveReward(cfg, p, p.level);
    p.passItems--;
    say(p, `  pass item used up; rewards received: ${p.got.length - before}`);
  }

  return { config, player, say, isBP, size, speedBonus, login, giveReward, addPoints, kill, grindTo, usePass, PASS_ITEM };
}
