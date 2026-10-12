// What a party dungeon's settings do in game (the WorldServer side). A port of:
//   enter     CInstanceDungeonBase::TeleportToDungeon (_Common/InstanceDungeonBase.cpp:659) up to the cooldown check:
//             CheckClassLevel (:529: the legend class bit & dwClass, then nMinLevel <= level <= nMaxLevel, else
//             TID_GAME_INSTANCE_LEVEL "%d %d" / TID_GAME_INSTANCE_CLASS), then the cooldown of ANOTHER dungeon id
//             (dwRemain = dwCoolTime - now; Anarchy dungeonCooldown % taken off in float32; (int)dwRemain > 0 ->
//             TID_GAME_INSTANCE_COOLTIME "%d %d" = minutes, seconds). On entry the cooldown is set to now + GetCoolTime (:781)
//             when the player had none or it was for another dungeon id.
//   clock     CreateDungeonLayer (:143): dwEndTick = open + dwDungeonTime when dwDungeonTime > 0 (0 = no clock);
//             CInstanceDungeonHelper::ProcessInfoPanel (:1225, once a second): nSecLeft = (int)( dwEndTick - now ) / 1000;
//             the "Dungeon Time" clock when the panel is first sent; "N minute(s) left in the dungeon!" once at <= 300 s and
//             once at <= 60 s (N = ( nSecLeft + 59 ) / 60); at nSecLeft <= 0 everyone inside is sent out.
// Not modelled: disguise buffs, the channel check, the layer limit (nMaxInstanceDungeon), the teleport position, a cleared
// dungeon's 30 s exit clock (it only shortens dwEndTick), the 3-minute party-leave timer, the DWORD wrap of GetTickCount.
(function (FRE) {
  'use strict';
  const f32 = Math.fround;
  const LEGEND = { normal: 1, master: 2, hero: 4, legend: 8 };   // GetLegendChar -> CLASS_* (the switch at :535)

  // e: serverMap entry data ({ dwClass, nMinLevel, nMaxLevel, dwCoolTime }); p: { cls: 'normal'|'master'|'hero'|'legend', level }
  // cool: { dungeonId, endsAt } | null (this player's cooldown for this world); now: ms; anarchy: % (0 = off)
  function enter(e, p, o = {}) {
    const now = o.now >>> 0, cool = o.cool || null, dungeonId = o.dungeonId == null ? 1 : o.dungeonId;
    const w = LEGEND[p.cls] || 0;
    if (!(w & e.dwClass)) return { ok: false, text: 'TID_GAME_INSTANCE_CLASS', args: [] };
    if (p.level < e.nMinLevel || p.level > e.nMaxLevel) return { ok: false, text: 'TID_GAME_INSTANCE_LEVEL', args: [e.nMinLevel, e.nMaxLevel] };
    if (cool && cool.dungeonId !== dungeonId) {
      let remain = (cool.endsAt - now) >>> 0;
      const a = o.anarchy >>> 0;
      remain = (remain - (Math.trunc(f32(f32(remain) * f32(f32(a) / f32(100)))) >>> 0)) >>> 0;
      if ((remain | 0) > 0) return { ok: false, text: 'TID_GAME_INSTANCE_COOLTIME', args: [Math.floor(remain / 60000), Math.floor((remain % 60000) / 1000)] };
    }
    const setCool = !cool || cool.dungeonId !== dungeonId;
    return { ok: true, cool: setCool ? { dungeonId, endsAt: (e.dwCoolTime + now) >>> 0 } : cool };
  }

  // The clock of one run: the dungeon opens at 0, the panel loop ticks at tick0, tick0 + 1000, …; until the kick or `until` ms.
  // -> [{ t, kind: 'clock' | 'warn' | 'out', ms?, text? }]
  function clock(dwDungeonTime, o = {}) {
    const out = [];
    if (!(dwDungeonTime > 0)) return out;
    const end = dwDungeonTime >>> 0;
    const until = o.until == null ? end + 5000 : o.until;
    let warn = 0, sent = false;
    for (let t = o.tick0 || 0; t <= until; t += 1000) {
      const left = Math.trunc(((end - t) | 0) / 1000);
      if (!sent && left > 0) { out.push({ t, kind: 'clock', ms: left * 1000 }); sent = true; }
      if (left <= 0) { out.push({ t, kind: 'out' }); break; }
      const nw = left <= 60 ? 2 : left <= 300 ? 1 : 0;
      if (nw > warn) {
        const n = Math.trunc((left + 59) / 60);
        out.push({ t, kind: 'warn', text: `${n} minute${n === 1 ? '' : 's'} left in the dungeon!` });
        warn = nw;
      }
    }
    return out;
  }

  // A party's day: players try to enter at the given times (ms); -> one result per try, with the cooldown carried over.
  // tries: [{ at, dungeonId, player }]
  function day(e, tries, o = {}) {
    let cool = null;
    return tries.map(tr => {
      const r = enter(e, tr.player, { now: tr.at, cool, dungeonId: tr.dungeonId, anarchy: o.anarchy || 0 });
      if (r.ok) cool = r.cool;
      return { at: tr.at, ok: r.ok, text: r.text || null, args: r.args || null };
    });
  }

  FRE.dungeonSim = { enter, clock, day, LEGEND };
})(globalThis.FRE = globalThis.FRE || {});
