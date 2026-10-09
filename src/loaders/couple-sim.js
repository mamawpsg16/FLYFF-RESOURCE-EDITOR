// A couple in game (task I part 3): the points, levels, buffs and mailed gifts, as the C++ does it.
//   tick     CUser::ProcessCouple (WORLDSERVER/User.cpp:3994): both partners online, the couple below eMaxLevel -> +1 point
//            (SendQueryAddCoupleExperience). The DatabaseServer adds it: CCouple::AddExperience (couple.cpp:96: nothing at
//            level 21; level = GetLevel( TRUE )) and on a level change CCoupleHelper::PostItem (databaseserver/couplehelper.cpp:213):
//            each gift of the NEW level to the partner whose sex matches (SEX_SEXLESS = both), m_dwKeepTime = minutes * 60,
//            m_byFlag = flag, by mail.
//   buffs    ActiveCoupleBuff (User.cpp:4025): every item of GetSkill( level ) that exists (prj.GetItemProp), applied with
//            DoApplySkill; the buffs are removed on every point (WORLDSERVER/couplehelper.cpp:277, 286), so the new level's
//            buffs are on within a second. Only while the partner is online (User.cpp:4014-4017).
//   restore  CCoupleController::Restore (databaseserver/couplehelper.cpp:33-41): at server start the saved points are added
//            in one AddExperience: the level comes back, no gift is mailed.
// Not modelled: a partner offline (no points, no buff), the propose / marriage steps, the honorable title (SetHonorAdd).
(function (FRE) {
  'use strict';
  const C = () => FRE.couple;

  // -> { levels: [{ level, points, ms }], posts: [{ level, to: 'first'|'second', id, num, flag, minutes }], end: { points, level } }
  // sex: [first partner's sex, second's] (0 male, 1 female); limit: stop after this many points
  function run(c, sex = [0, 1], limit) {
    const MAX = C().MAX_LEVEL;
    const max = limit || Math.max(0, ...c.exp.map(e => e.value)) + 2;
    let pts = 0, level = 1;                                        // CCouple(): m_nLevel( 1 ), couple.cpp:92
    const levels = [{ level, points: 0, ms: 0 }], posts = [];
    for (let n = 0; n < max; n++) {
      if (level === MAX) break;                                     // ProcessCouple: no tick at eMaxLevel; AddExperience: FALSE
      pts += 1;
      const now = C().levelOf(c, pts);
      if (now !== level) {
        level = now;
        levels.push({ level, points: pts, ms: pts * C().POINT_MS });
        for (const g of giftsAt(c, level)) {
          if (g.sex === 2 || g.sex === sex[0]) posts.push({ level, to: 'first', id: g.id, num: g.num, flag: g.flag & 0xFF, minutes: g.minutes });
          if (g.sex === 2 || g.sex === sex[1]) posts.push({ level, to: 'second', id: g.id, num: g.num, flag: g.flag & 0xFF, minutes: g.minutes });
        }
      }
    }
    return { levels, posts, end: { points: pts, level } };
  }
  // m_vItems[level - 1]: the blocks of that level, in file order (a level written twice adds both)
  function giftsAt(c, level) {
    if (level < 1 || level > c.exp.length) return [];
    return c.blocks.filter(b => b.level === level).flatMap(b => b.rows);
  }
  // restore: AddExperience( saved ) from a fresh couple
  function restore(c, points) { return C().levelOf(c, points); }   // m_nLevel starts at 1 (< 21), so the points are always added
  // the buffs at a level: the items that exist, and their stats added up (DoApplySkill -> SetDestParam per slot)
  function buffsAt(c, items, level) {
    if (level < 1 || level > c.exp.length) return { items: [], stats: [] };
    const ids = C().buffItems(c, level).filter(id => id && items.has(id));
    const sum = new Map();
    for (const id of ids) for (const s of FRE.coupleChecks.statsOf(items.get(id))) if (s.dst) sum.set(s.dst, (sum.get(s.dst) || 0) + s.adj);
    return { items: ids, stats: [...sum].map(([dst, adj]) => ({ dst, adj })) };
  }
  // every level 1-21 at a glance: reached after how long, its buffs, its gifts
  function ladder(c, items, sex = [0, 1]) {
    const r = run(c, sex);
    return Array.from({ length: C().MAX_LEVEL }, (_, i) => {
      const level = i + 1, at = r.levels.find(x => x.level === level);
      return { level, points: level === 1 ? 0 : at ? at.points : null, ms: level === 1 ? 0 : at ? at.ms : null, buffs: buffsAt(c, items, level),
        posts: r.posts.filter(p => p.level === level) };
    });
  }

  FRE.coupleSim = { run, giftsAt, restore, buffsAt, ladder };
})(globalThis.FRE = globalThis.FRE || {});
