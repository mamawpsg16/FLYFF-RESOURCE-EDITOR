// What players get from the gifts and the Guild Siege (task H part 2): a port of the code that GIVES them. No DOM.
//   life     one character from level 1: CMover::AddExperience one level at a time (MoverParam.cpp:1401-1660, the
//            __AUTO_JOB_CHANGE branch of 30727fd4): Vagrant stops at 15 and Expert at 60 (MAX_JOB_LEVEL /
//            MAX_EXP_LEVEL, MoverParam.cpp:1230-1245) until the job change; a Pro or Master at 120 changes job
//            automatically: Pro -> Master InitLevel( job, 60 ), Master -> Hero InitLevel( job, 121 ) (:1602-1622); a Hero
//            stops at 130 (MAX_LEGEND_LEVEL) until the player picks Legend (DoLegendPromotion = InitLevel( job, 131 ),
//            User.cpp:2465, DPSrvr.cpp:5376); a Legend stops at 150 (MAX_3RD_LEGEND_LEVEL). InitLevel sets
//            m_nDeathLevel = the new level (Mover.cpp:2164). The level-up gifts come only when m_nDeathLevel < m_nLevel
//            (MoverParam.cpp:1627 -> CEventLua::SetLevelUpGift, EventLua.cpp:513). A death keeps the level it happened
//            at (m_nDeathLevel = m_nLevel, Mover.cpp:8061) and may cost a level.
//            Rebirth (the Rebirth Stone, CUser::ProcessRebirthLevelUp, User.cpp:4838-4920): at the max level
//            (IsMaxLevel: the exp table has no next level), below Max, enough stones (1/2/3/5/7/10 by tier); the gift of
//            the new tier (GiveRebirthGift, User.cpp:4821: bag, else mail), then InitLevel( Master job, 60 ).
//            CreateItem = exchangeSim.createItem (IsFull + Add); a gift that does not fit is mailed.
//   couple   a couple from level 1: CCouple::AddExperience( 1 ) per tick (couple.cpp:96: none at eMaxLevel 21) and
//            CCoupleHelper::PostItem on every level change (databaseserver/couplehelper.cpp:194-257): the new level's
//            rows, SEX_SEXLESS to both partners, a male / female row to that partner only (an unknown sex counts as
//            SEX_SEXLESS); always by mail.
//   siege    CGuildCombat::GuildCombatResultRanking (eveschool.cpp:1582-1759): the bubble sort (points, then lives,
//            then the average level of the members still alive and online, int division), then the top 3 guilds:
//            every ONLINE lineup member gets the chips (bag, else mail). Not after a GM stop (eveschool.cpp:3089).
//   weekly   CGuildSiegePrizeDBController::ComputeAndLogWeeklyPrizes (GuildSiegePrize.cpp:353-480, cda3af21): top 5
//            guilds by wins (> 0) -> the guild bank (full: lost, DPDatabaseClient.cpp:3790); top 10 players by points on
//            the Total board and on their class board, top 10 by MVP count; ties: the first row; by mail.
// Deaths: IsAfterDeath (Mover.cpp:9545) at level granularity: at the death level itself the EXP counts as not back yet.
// Not modelled: the guild order before
// the sort (vecRequestRanking, given as the input order); the bag search of Rebirth Stones (a count is given).
(function (FRE) {
  'use strict';
  const MAX_JOB_LEVEL = 15, MAX_EXP_LEVEL = 45, MAX_GENERAL_LEVEL = 120, MAX_LEGEND_LEVEL = 130, MAX_3RD_LEGEND_LEVEL = 150;   // defineJob.h:32-54
  const STONES = tier => (tier <= 3 ? 1 : tier <= 6 ? 2 : tier <= 8 ? 3 : tier <= 10 ? 5 : tier <= 15 ? 7 : 10);           // User.cpp:4869
  const X = () => FRE.exchangeSim;
  const G = () => FRE.gifts;

  // env: { gifts (FRE.gifts.fromWorkspace), prop (exchangeSim env.prop) }
  function envFor(ws, model) {
    const base = X().envFromWorkspace(ws);
    const D = ws.defines.defines;
    return { gifts: model || G().fromWorkspace(ws), prop: base.prop, text: base.text, redChip: D.has('II_CHP_RED') ? D.get('II_CHP_RED') >>> 0 : null };
  }
  // a bag with `free` empty slots (the rest filled with other items)
  function bag(free = X().MAX_INVENTORY_FREE) {
    const items = [];
    for (let i = 0; i < X().MAX_INVENTORY_FREE - free; i++) items.push({ id: X().FILLER, num: 1 });
    return X().player({ items });
  }
  const give = (env, p, id, num, flag, charged = 0) => (env.prop(id) && X().createItem(env, p, id, num, flag, charged) ? 'bag' : 'mail');

  // ---------------------------------------------------------------- one character
  // o: { account = 'player', rebirths = 0, free = 168, stones = Infinity, deaths: [levels, in order: die there and lose a level],
  //      stopAt: { tier, level } (optional) }
  // -> { got: [{ what: 'level' | 'rebirth', level, tier, reb, id, num, flag, minutes, where, gift }], steps: [...], end }
  function life(env, o = {}) {
    const g = env.gifts, lu = g.levelUp || { gifts: [], events: [] };
    const account = o.account || 'player';
    const p = { tier: 'vagrant', level: 1, death: 0, reb: 0, stones: o.stones === undefined ? Infinity : o.stones, bag: bag(o.free) };
    const deaths = (o.deaths || []).slice();       // in this order: the next death happens at deaths[0]
    const got = [], steps = [];
    const maxLv = g.maxLevel || MAX_3RD_LEGEND_LEVEL;
    const initLevel = (tier, level) => { p.tier = tier; p.level = level; p.death = level; };
    const levelGifts = () => {
      for (const gift of G().giftsFor(lu, p.level, account)) {
        if (gift.id === null || !env.prop(gift.id)) continue;           // "ItemProp is NULL": logged, skipped
        got.push({ what: 'level', level: p.level, tier: p.tier, reb: p.reb, id: gift.id, num: gift.num, flag: gift.flag, minutes: gift.minutes,
          where: give(env, p.bag, gift.id, (gift.num << 16) >> 16, gift.flag), gift });
      }
    };
    // CMover::AddExperience with enough EXP for one level -> 'up' | 'cap'
    const gain = () => {
      if (p.tier === 'vagrant' && p.level >= MAX_JOB_LEVEL) return 'cap';
      if (p.tier === 'expert' && p.level >= MAX_JOB_LEVEL + MAX_EXP_LEVEL) return 'cap';
      const next = p.level + 1;
      let change = false;
      if (p.tier === 'legend' && next > MAX_3RD_LEGEND_LEVEL) return 'cap';
      if (p.tier === 'hero' && next > MAX_LEGEND_LEVEL) return 'cap';
      if (p.tier !== 'hero' && p.tier !== 'legend' && next > MAX_GENERAL_LEVEL) change = true;
      p.level = next;
      if (change) {
        if (p.tier === 'master') initLevel('hero', MAX_GENERAL_LEVEL + 1);
        else initLevel('master', 60);
        steps.push(`auto job change: ${p.tier} ${p.level}`);
      }
      if (p.death < p.level) levelGifts();
      return 'up';
    };
    const rebirth = () => {
      const r = g.rebirth;
      if (!r || p.level < maxLv || p.reb >= r.max) return false;
      const tier = p.reb + 1;
      if (p.stones < STONES(tier)) return false;
      p.stones -= STONES(tier);
      const gift = r.gifts.get(tier);
      if (gift) got.push({ what: 'rebirth', level: p.level, tier: p.tier, reb: tier, id: gift.id, num: gift.num, flag: 0, minutes: 0,
        where: give(env, p.bag, gift.id, (gift.num << 16) >> 16, 0) });
      p.reb = tier;
      initLevel('master', 60);
      steps.push(`rebirth ${tier}`);
      return true;
    };
    let left = o.rebirths || 0, guard = 0;
    while (guard++ < 100000) {
      if (o.stopAt && p.tier === o.stopAt.tier && p.level >= o.stopAt.level) break;
      if (deaths.length && p.level === deaths[0]) {
        deaths.shift();
        // Mover.cpp:8058: m_nDeathLevel = m_nLevel unless IsAfterDeath (Mover.cpp:9545: the death level is above the
        // level, or equal while the EXP is not back yet; at the death level itself this counts it as not back yet)
        if (!(p.death >= p.level)) p.death = p.level;
        if (p.level > 1) p.level--;
        steps.push(`died at ${p.level + 1}, back to ${p.level}`);
        continue;
      }
      if (gain() === 'up') continue;
      // capped: the player's own choice points
      if (p.tier === 'vagrant') { p.tier = 'expert'; steps.push('job change: expert'); continue; }
      if (p.tier === 'expert') { p.tier = 'pro'; steps.push('job change: pro'); continue; }
      if (p.tier === 'hero') { initLevel('legend', MAX_LEGEND_LEVEL + 1); steps.push('Legend: 131'); continue; }
      if (left > 0 && rebirth()) { left--; continue; }
      break;
    }
    return { got, steps, end: { tier: p.tier, level: p.level, reb: p.reb } };
  }

  // How many times each level-up gift row pays one character: in the first life (level 1 -> 150) and per rebirth after it.
  // -> Map gift -> { first, perRebirth }
  function levelPays(env, account = 'player') {
    const one = life(env, { account, rebirths: 0 }), two = life(env, { account, rebirths: 1 });
    const out = new Map();
    const lu = env.gifts.levelUp;
    if (!lu) return out;
    const can = env.gifts.rebirth && env.gifts.rebirth.max > 0 && two.end.reb === 1;
    for (const gift of lu.gifts) {
      const a = one.got.filter(x => x.gift === gift).length, b = two.got.filter(x => x.gift === gift).length;
      out.set(gift, { first: a, perRebirth: can ? b - a : 0 });
    }
    return out;
  }

  // ---------------------------------------------------------------- a couple
  // o: { sex: [first, second] (0 male, 1 female, 2 unknown) } -> { posts: [{ level, to, id, num, flag, minutes }], levels: [reached], end }
  function couple(env, o = {}) {
    const c = env.gifts.couple, MAX = G().MAX_COUPLE_LEVEL;
    const out = { posts: [], levels: [], end: 1 };
    if (!c || !c.exp.length) return out;
    const sex = o.sex || [0, 1];
    const limit = Math.max(...c.exp) + 2;
    let exp = 0, level = G().coupleLevel(c, 0);
    while (exp <= limit) {
      if (level >= MAX) break;                    // ProcessCouple: no exp at eMaxLevel; AddExperience: none at it
      exp += 1;
      const now = G().coupleLevel(c, exp);
      if (now === level) continue;
      level = now;
      out.levels.push(level);
      for (const it of c.items.filter(x => x.level === level)) {
        for (const to of [0, 1]) if (it.sex === 2 || it.sex === sex[to]) out.posts.push({ level, to, id: it.id, num: it.num, flag: it.flag, minutes: it.minutes });
      }
    }
    out.end = level;
    return out;
  }

  // ---------------------------------------------------------------- one siege
  // o: { guilds: [{ name, points, lineup: [{ life, level, online, free }] }] (the order the guilds applied), gm }
  // -> { order: [guild index], paid: [{ guild, rank, chips, member, where }] }
  function siege(env, o) {
    const s = env.gifts.siege, cfg = s.config, comp = s.comp;
    const out = { order: [], paid: [] };
    if (o.gm) return out;
    const gs = o.guilds.map((x, i) => ({ i, x }));
    const lives = gr => gr.x.lineup.reduce((a, m) => a + m.life, 0);
    const avg = gr => {
      let lv = 0, n = 0;
      for (const m of gr.x.lineup) if (m.life > 0 && m.online) { lv += m.level; n++; }
      return n ? Math.fround(Math.trunc(lv / n)) : 1;
    };
    for (let i = 0; i < gs.length - 1; i++) {
      if (i >= cfg.maxGuild) break;
      for (let j = 0; j < gs.length - 1 - i; j++) {
        const a = gs[j], b = gs[j + 1];
        let swap = false;
        if (a.x.points < b.x.points) swap = true;
        else if (a.x.points === b.x.points) {
          const la = lives(a), lb = lives(b);
          if (la < lb) swap = true;
          else if (la === lb && avg(a) < avg(b)) swap = true;
        }
        if (swap) { gs[j] = b; gs[j + 1] = a; }
      }
    }
    out.order = gs.map(g => g.i);
    const charged = env.prop(env.redChip) ? env.prop(env.redChip).charged : 0;
    for (let r = 0; r < gs.length && r < 3; r++) {
      const chips = G().siegeChips(cfg.joinPenya, gs.length, r, comp);
      gs[r].x.lineup.forEach((m, k) => {
        if (!m.online) return;
        const p = bag(m.free === undefined ? X().MAX_INVENTORY_FREE : m.free);
        out.paid.push({ guild: gs[r].i, rank: r + 1, chips, member: k, where: give(env, p, env.redChip, (chips << 16) >> 16, 0, charged) });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- the weekly payout
  // o: { guilds: [{ wins, bankFull }], players: [{ point, mvp, group (0-3, -1 none) }] }
  // -> { guild: [{ guild, rank, chips, lost }], boards: { total|merc|mage|acro|asst|mvp: [{ player, rank, chips }] } }
  function weekly(env, o) {
    const w = env.gifts.siege.comp.weekly;
    const top = (rows, key, n) => {
      const v = rows.slice(), res = [];
      for (let r = 0; r < n && v.length; r++) {
        let best = 0;
        for (let i = 1; i < v.length; i++) if (key(v[i]) > key(v[best])) best = i;
        res.push(v[best]);
        v.splice(best, 1);
      }
      return res;
    };
    const guilds = o.guilds.map((g, i) => Object.assign({ i }, g)).filter(g => g.wins > 0);
    const out = { guild: top(guilds, g => g.wins, Math.min(5, w.guild.length)).map((g, r) => ({ guild: g.i, rank: r + 1, chips: w.guild[r], lost: !!g.bankFull })), boards: {} };
    const pl = o.players.map((p, i) => Object.assign({ i }, p));
    const byPoint = pl.filter(p => p.point > 0);
    const board = (rows, key, ladder) => top(rows, key, Math.min(10, ladder.length)).map((p, r) => ({ player: p.i, rank: r + 1, chips: ladder[r] }));
    out.boards.total = board(byPoint, p => p.point, w.total);
    ['merc', 'mage', 'acro', 'asst'].forEach((k, gi) => { out.boards[k] = board(byPoint.filter(p => p.group === gi), p => p.point, w.perClass); });
    out.boards.mvp = board(pl.filter(p => p.mvp > 0), p => p.mvp, w.mvp);
    return out;
  }

  FRE.giftsSim = { envFor, life, levelPays, couple, siege, weekly, bag, STONES,
    MAX_JOB_LEVEL, MAX_EXP_LEVEL, MAX_GENERAL_LEVEL, MAX_LEGEND_LEVEL, MAX_3RD_LEGEND_LEVEL };
})(globalThis.FRE = globalThis.FRE || {});
