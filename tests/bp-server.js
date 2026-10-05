// Port of the WorldServer's Battle Pass player logic (commit cc73ccdd + later fixes),
// used by the season-change tests (tests/run-tests.js) and tools/bp-sim.js.
// Each function names the C++ it copies. Not modelled: bag space (the server refuses a
// pass use without free slots for the back-pay, and mails rewards that do not fit).
export function bpServer(FRE, ws) {
  const BP = FRE.battlePass;
  const PASS_ITEM = ws.defines.defines.get('II_SYS_SYS_SCR_BPPASS1');
  const nameOf = id => { const it = ws.itemById(id); return it ? it.name : String(id); };

  // --- the server's config tables, as CProject::LoadBattlePass builds them -------
  function config(model) {
    const pass = model.pass;
    return {
      passes: model.passes, ladder: model.ladder, monsters: model.monsters,
      first: pass,                                         // mapBattPassItem.begin()
      end: r => { const e = BP.seasonEnd(r.time.value); return e ? e.date.getTime() : 0; },
    };
  }

  // --- player ---------------------------------------------------------------------
  function player(name) {
    return { name, level: 0, points: 0, type: 0, enable: 0, end: 0, got: [], passItems: 0, log: [] };
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

  // CUser::GiveBattlePassReward (User.cpp:4631)
  function giveReward(cfg, p, level) {
    const r = cfg.ladder.get(level);
    if (!r || r.type.value !== p.type) return;
    p.got.push(`L${level} ${r.qty.value}x ${nameOf(r.id)}`);
  }

  // CUserMng::AddBPUpdate (User.cpp:4685): at most one level per call, rest carries over
  function addPoints(cfg, p, n, now) {
    if (!(n > 0 && isBP(p, now) && p.level < size(cfg, p))) return;
    const r = cfg.ladder.get(p.level);
    if (!r) return;
    const total = p.points + n;
    if (total >= r.points.value) {
      p.points = total - r.points.value; p.level++;
      if (p.enable === 1) giveReward(cfg, p, p.level);   // rewards only on the bought track
    } else p.points = total;
  }

  // CAttackArbiter::OnDied (AttackArbiter.cpp:966): only BP5 monsters pay, killing blow only
  let seed = 7;   // fixed seed: the same rolls on every run
  const rnd = (lo, hi) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return lo + (seed % (hi - lo + 1)); };
  function kill(cfg, p, define, now) {
    if (!(isBP(p, now) && p.level < size(cfg, p))) return 0;
    const m = cfg.monsters.get(ws.defines.defines.get(define));
    if (!m) return 0;
    const n = rnd(Math.max(1, m.min.value), Math.max(1, m.max.value));    // xRandom(min, max + 1)
    addPoints(cfg, p, n, now);
    return n;
  }
  function grindTo(cfg, p, level, define, now) {
    let kills = 0, pts = 0;
    while (p.level < level && kills < 100000) { const n = kill(cfg, p, define, now); if (!n) break; pts += n; kills++; }
    say(p, kills ? `killed ${kills} x ${define}: +${pts} points -> level ${p.level}` : `killed ${define}: no points (not on a running pass)`);
  }

  // CDPSrvr::OnDoBP, nCheck 1 = the bought pass (DPSrvr.cpp:11870)
  function usePass(cfg, p, now) {
    const row = cfg.passes.get(PASS_ITEM);
    if (!row) { say(p, 'use pass: "That is not a battle pass item."'); return; }
    const tEnd = cfg.end(row);
    let backPay = false, payThis = false;
    if (!isBP(p, now)) {
      // no running pass: activated with the config date, even if that date is already past
      Object.assign(p, { level: 1, points: 0, type: row.type.value, enable: 1, end: tEnd });
      payThis = true;
      say(p, 'use pass: "Battle pass activated."');
    } else if (p.enable === 0) {
      if (p.end !== tEnd || p.type !== row.type.value) { say(p, 'use pass: "That pass belongs to a different battle pass season." (not used up)'); return; }
      p.enable = 1; backPay = true;
      say(p, `use pass: "Battle pass activated. Collecting everything you have already earned..." (levels 1-${p.level})`);
    } else { say(p, 'use pass: "You already have an active battle pass." (not used up)'); return; }
    const before = p.got.length;
    if (backPay) for (let i = 1; i <= p.level; i++) giveReward(cfg, p, i);
    else if (payThis) giveReward(cfg, p, p.level);
    p.passItems--;
    say(p, `  pass item used up; rewards received: ${p.got.length - before}`);
  }

  return { config, player, say, isBP, size, speedBonus, login, giveReward, addPoints, kill, grindTo, usePass, PASS_ITEM };
}
