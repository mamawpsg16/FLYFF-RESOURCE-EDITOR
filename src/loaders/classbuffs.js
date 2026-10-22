// Class Buffs (task, part 2a): which skills are each class's buffs, joined from propSkill.txt (loaders/skillprop.js: job, target,
// max level, names), propSkillAdd.csv (loaders/skilladd.js: what each level gives) and propSkill.txt.txt (name + tooltip text).
//   A buff here = a skill of one of the 8 class lines whose target is you / another player / the party (dwExeTarget
//   EXT_SELFCHGPARAMET / EXT_ANOTHERWITH / EXT_TROUPE / EXT_TROUPEWITH, CCtrl::ApplySkill Ctrl.cpp:1102) and whose top level row
//   gives a stat for a time (a stat slot that is not DST_CHRSTATE, and dwSkillTime > 0). Heals (no time) and debuffs are left out.
//   Class lines (defineJob.h): 1st job -> 2nd job -> Master (Lv60) -> Hero (Lv120) -> 3rd job (Lv130), e.g. Mercenary -> Blade ->
//   BLADE_MASTER -> BLADE_HERO -> STORMBLADE_HERO (Slayer). A 1st-job buff belongs to two classes and is the same row in both.
(function (FRE) {
  'use strict';
  const NULL_ID = 0xFFFFFFFF;
  const CLASSES = [
    { key: 'slayer', name: 'Slayer', line: ['JOB_MERCENARY', 'JOB_BLADE', 'JOB_BLADE_MASTER', 'JOB_BLADE_HERO', 'JOB_STORMBLADE_HERO'], second: 'Blade' },
    { key: 'templar', name: 'Templar', line: ['JOB_MERCENARY', 'JOB_KNIGHT', 'JOB_KNIGHT_MASTER', 'JOB_KNIGHT_HERO', 'JOB_LORDTEMPLER_HERO'], second: 'Knight' },
    { key: 'harlequin', name: 'Harlequin', line: ['JOB_ACROBAT', 'JOB_JESTER', 'JOB_JESTER_MASTER', 'JOB_JESTER_HERO', 'JOB_WINDLURKER_HERO'], second: 'Jester' },
    { key: 'crackshooter', name: 'Crackshooter', line: ['JOB_ACROBAT', 'JOB_RANGER', 'JOB_RANGER_MASTER', 'JOB_RANGER_HERO', 'JOB_CRACKSHOOTER_HERO'], second: 'Ranger' },
    { key: 'seraph', name: 'Seraph', line: ['JOB_ASSIST', 'JOB_RINGMASTER', 'JOB_RINGMASTER_MASTER', 'JOB_RINGMASTER_HERO', 'JOB_FLORIST_HERO'], second: 'Ringmaster' },
    { key: 'forcemaster', name: 'Force Master', line: ['JOB_ASSIST', 'JOB_BILLPOSTER', 'JOB_BILLPOSTER_MASTER', 'JOB_BILLPOSTER_HERO', 'JOB_FORCEMASTER_HERO'], second: 'Billposter' },
    { key: 'mentalist', name: 'Mentalist', line: ['JOB_MAGICIAN', 'JOB_PSYCHIKEEPER', 'JOB_PSYCHIKEEPER_MASTER', 'JOB_PSYCHIKEEPER_HERO', 'JOB_MENTALIST_HERO'], second: 'Psykeeper' },
    { key: 'arcanist', name: 'Arcanist', line: ['JOB_MAGICIAN', 'JOB_ELEMENTOR', 'JOB_ELEMENTOR_MASTER', 'JOB_ELEMENTOR_HERO', 'JOB_ELEMENTORLORD_HERO'], second: 'Elementor' },
  ];
  const TIERS = ['1st job', '2nd job', 'Master (Lv60)', 'Hero (Lv120)', '3rd job (Lv130)'];
  const WHO = { EXT_SELFCHGPARAMET: 'you', EXT_ANOTHERWITH: 'you or one other player', EXT_TROUPE: 'your party (not you)', EXT_TROUPEWITH: 'you and your party' };

  // ws: a Workspace -> { classes: [{ ...CLASSES[i], tiers: [{ tier, label, job, buffs }] }], buffs, bySi, add, skills, strings }
  function fromWorkspace(ws) {
    const D = ws.defines.defines;
    const strings = { map: new Map(), meta: new Map(), diags: [] };
    const tf = ws.files.get('propskill.txt.txt');
    if (tf) FRE.loadStringFile(strings, tf);
    const skills = FRE.skillProp.load(ws.files.get('propskill.txt'), { defines: D, strings: strings.map });
    const G = FRE.skillProp.get;
    const add = FRE.skillAdd.load(ws.files.get('propskilladd.csv'), {
      defines: D, skillReady: si => { const s = skills.items.get(si >>> 0); return s ? { ready: G(s, 'dwSkillReady'), ver: s.ver } : null; } });
    const exeName = v => { for (const n of Object.keys(WHO)) if (D.get(n) === v) return n; return null; };
    const CHRSTATE = D.get('DST_CHRSTATE');
    const buffs = [], bySi = new Map();
    const jobOf = new Map();
    CLASSES.forEach(c => c.line.forEach((j, t) => { const v = D.get(j); if (v !== undefined) jobOf.set(v, t); }));
    for (const sk of skills.items.values()) {
      const job = G(sk, 'dwItemJob');
      if (!jobOf.has(job)) continue;
      const exe = exeName(G(sk, 'dwExeTarget'));
      if (!exe) continue;
      const rows = add.bySkill.get(sk.id);
      if (!rows || !rows.length) continue;
      const max = rows[rows.length - 1];
      const slots = [1, 2].map(i => ({ i, dst: max.v['dwDestParam' + i] >>> 0, adj: max.v['nAdjParamVal' + i] | 0, chg: max.v['dwChgParamVal' + i] | 0 }));
      const stat = slots.some(s => s.dst !== NULL_ID && s.dst !== 0 && s.dst !== CHRSTATE);
      if (!stat || (max.v.dwSkillTime >>> 0) === NULL_ID || (max.v.dwSkillTime | 0) <= 0) continue;
      const descKey = String(sk.raw[FRE.skillProp.SCHEMA().findIndex(f => f.name === 'szCommand')] || '').trim();   // the IDS key (values[] holds its text)
      const b = {
        si: sk.id, define: sk.define, name: sk.name || sk.define, nameKey: sk.nameKey, descKey, desc: strings.map.get(descKey) || '',
        job, jobName: ws.defines.byValue('JOB_', job), tier: jobOf.get(job), exe, who: WHO[exe], party: exe !== 'EXT_SELFCHGPARAMET',
        expertMax: G(sk, 'dwExpertMax'), rows, max, slots, skill: sk,
        // RT_TIME: extra time from the caster's STA / DEX / INT (CMover::SubReferTime, MoverActEvent.cpp:174)
        refer: [1, 2].filter(i => G(sk, 'dwReferTarget' + i) === D.get('RT_TIME')).map(i => ({ stat: G(sk, 'dwReferStat' + i), value: G(sk, 'dwReferValue' + i) >>> 0 })),
      };
      buffs.push(b); bySi.set(b.si, b);
    }
    const classes = CLASSES.map(c => {
      const jobs = c.line.map(j => D.get(j));
      return Object.assign({}, c, { tiers: TIERS.map((label, t) => ({ tier: t, label, job: jobs[t], buffs: buffs.filter(b => b.job === jobs[t]).sort((a, b) => a.name.localeCompare(b.name)) })) });
    });
    return { classes, buffs, bySi, add, skills, strings, TIERS };
  }

  FRE.classBuffs = { fromWorkspace, CLASSES, TIERS, WHO };
})(globalThis.FRE = globalThis.FRE || {});
