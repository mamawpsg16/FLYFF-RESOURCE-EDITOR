// Secret Room Winner / Guild Siege Winner buffs in game (V19 branch feat/secret-room 885aa231 + 5d5e91f2, NOT YET TESTED IN GAME). No DOM.
// A port of _Common/OwnerBuff.cpp and its callers:
//   OwnerBuffMng::IsHolder (:60-96)  type 0: EVE_SECRETROOM on, CSecretRoomMng::m_nState == SRMNG_CLOSE, and for East then West (only an open
//                                    continent, IsContOpen): the owner = dwNextId when set (the winner, right after the war), else dwId (the tax
//                                    owner); type 1: CGuildCombat::m_nState == CLOSE_STATE and m_uWinGuildId == the guild (0 = none)
//   OwnerBuffMng::Refresh (:99-129)  per type: want = on && holder; only a change does something: SetDestParam / ResetDestParam of every slot
//                                    whose dst is not 0, the applied bit, and the snapshot (type, on, name, description, icon) to that player
//   RefreshAll (:131-135)            every online player, called every 30 s (ThreadMng.cpp, a counter in the 1-second block)
//   OnLogout (:137-140)              drops the applied bits (DPCoreClient.cpp OnGuildMemberLogOut: guild members only)
//   callers: login (DPDatabaseClient.cpp OnJoin, only with a guild), a member added (DPCoreClient.cpp OnAddGuildMember, if online),
//            a member removed (OnRemoveGuildMember: m_idGuild = 0 first, then Refresh, if online)
// A story is a list of steps; the world starts with no owners, both events closed.
// Not modelled: the buff bar drawing (WndWorld.cpp), how the tax owner changes in the DatabaseServer (Tax.cpp: modelled as dwId = dwNextId,
// dwNextId = none at "taxChange"), the Lord vote skipping that change, the siege clearing its winner (modelled as the step "siegeClear").
(function (FRE) {
  'use strict';
  const NULL_ID = 0xffffffff;
  const CONTS = ['east', 'west'];                              // anCont[] = { CONT_EAST, CONT_WEST } (OwnerBuff.cpp:76)

  function newWorld(opts = {}) {
    return {
      srEvent: opts.srEvent !== false,                         // EVE_SECRETROOM (WorldServer.ini SECRETROOM)
      srOpen: false,                                           // m_nState != SRMNG_CLOSE
      cont: { east: opts.east !== false, west: !!opts.west },  // EastOpen / WestOpen (SecretRoom.lua, West off)
      tax: { east: { id: NULL_ID, next: NULL_ID }, west: { id: NULL_ID, next: NULL_ID } },
      siegeOn: false, win: 0,                                  // m_nState != CLOSE_STATE, m_uWinGuildId
      players: new Map(),                                      // id -> { guild, online, stats: Map dst -> sum }
      applied: new Map(),                                      // s_mapApplied: idPlayer -> bits
    };
  }

  function isHolder(w, type, p) {
    if (!p.guild) return false;
    if (type === 0) {
      if (!w.srEvent || w.srOpen) return false;
      for (const c of CONTS) {
        if (!w.cont[c]) continue;
        const t = w.tax[c];
        const owner = t.next !== NULL_ID ? t.next : t.id;
        if (owner !== NULL_ID && owner === p.guild) return true;
      }
      return false;
    }
    if (type === 1) return !w.siegeOn && w.win !== 0 && w.win === p.guild;
    return false;
  }

  function refresh(w, defs, id, out) {
    const p = w.players.get(id);
    if (!p || !p.online) return;                               // IsValidObj
    let have = w.applied.has(id) ? w.applied.get(id) : 0;
    for (let t = 0; t < defs.length; t++) {
      const d = defs[t], bit = 1 << t;
      const want = d.on && isHolder(w, t, p), has = (have & bit) !== 0;
      if (want === has) continue;
      for (const b of d.bonus) {
        if (!b.dst) continue;
        p.stats.set(b.dst, (p.stats.get(b.dst) || 0) + (want ? b.adj : -b.adj));
      }
      have = want ? have | bit : have & ~bit;
      out.push({ player: id, type: t, on: want, name: d.name, desc: d.desc, icon: d.icon });
    }
    w.applied.set(id, have);
  }

  const statsOf = p => Object.fromEntries([...p.stats].filter(([, v]) => v !== 0).sort((a, b) => a[0] - b[0]));

  // one step: [op, ...args] -> the snapshots sent
  function step(w, defs, s) {
    const [op, a, b] = s, out = [];
    const P = id => { if (!w.players.has(id)) w.players.set(id, { guild: 0, online: false, stats: new Map() }); return w.players.get(id); };
    switch (op) {
      case 'login': { const p = P(a); p.online = true; p.stats = new Map(); if (b !== undefined) p.guild = b; if (p.guild) refresh(w, defs, a, out); break; }
      case 'logout': { const p = P(a); if (p.guild) w.applied.delete(a); p.online = false; p.stats = new Map(); break; }
      case 'join': { const p = P(a); p.guild = b; refresh(w, defs, a, out); break; }
      case 'leave': { const p = P(a); p.guild = 0; refresh(w, defs, a, out); break; }
      case 'srWin': w.tax[a].next = b; break;                  // CTax::SetNextSecretRoomGuild
      case 'taxChange': w.tax[a].id = w.tax[a].next; w.tax[a].next = NULL_ID; break;
      case 'srStart': w.srOpen = true; break;
      case 'srEnd': w.srOpen = false; break;
      case 'siegeStart': w.siegeOn = true; break;
      case 'siegeEnd': w.siegeOn = false; w.win = a; break;
      case 'siegeClear': w.win = 0; break;
      case 'cont': w.cont[a] = !!b; break;
      case 'srEvent': w.srEvent = !!a; break;
      case 'tick': for (const id of [...w.players.keys()].sort((x, y) => x - y)) refresh(w, defs, id, out); break;
      default: throw new Error(`unknown step ${op}`);
    }
    return out;
  }

  // defs: [{ on, bonus: [{dst, adj}] x4, name, desc, icon }] for type 0 and 1 (FRE.rates.ownerDef)
  function run(defs, story, opts) {
    const w = newWorld(opts), steps = [];
    for (const s of story) {
      const sent = step(w, defs, s);
      steps.push({ step: s, sent, players: Object.fromEntries([...w.players].sort((x, y) => x[0] - y[0]).map(([id, p]) => [id, { guild: p.guild, online: p.online, bits: w.applied.get(id) || 0, stats: statsOf(p) }])) });
    }
    return steps;
  }

  // stories the editor offers under 🎲 Try it (players 1-3; guild 10 wins, guild 20 does not)
  const STORIES = {
    0: [
      { name: 'Guild wins the Secret Room, a member leaves and comes back, the next one starts', steps: [
        ['login', 1, 10], ['login', 2, 10], ['login', 3, 20], ['srStart'], ['srEnd'], ['srWin', 'east', 10], ['tick'], ['leave', 2], ['join', 2, 10],
        ['logout', 1], ['login', 1], ['taxChange', 'east'], ['tick'], ['srStart'], ['tick']] },
      { name: 'Win on Darkon (West) while it is switched off', steps: [['login', 1, 10], ['srWin', 'west', 10], ['tick'], ['cont', 'west', true], ['tick']] },
    ],
    1: [
      { name: 'Guild wins the Guild Siege, a member leaves, the next siege starts', steps: [
        ['login', 1, 10], ['login', 2, 10], ['login', 3, 20], ['siegeStart'], ['siegeEnd', 10], ['tick'], ['leave', 2], ['tick'], ['siegeStart'], ['tick'], ['siegeEnd', 20], ['tick']] },
      { name: 'Too few guilds sign up: the winner is cleared', steps: [['login', 1, 10], ['siegeEnd', 10], ['tick'], ['siegeClear'], ['tick']] },
    ],
  };
  const STEP_WORDS = {
    login: s => `player ${s[1]} logs in${s[2] !== undefined ? ` (guild ${s[2]})` : ''}`, logout: s => `player ${s[1]} logs out`,
    join: s => `player ${s[1]} joins guild ${s[2]}`, leave: s => `player ${s[1]} leaves the guild`,
    srWin: s => `guild ${s[2]} wins the Secret Room (${s[1] === 'east' ? 'Flaris' : 'Darkon'})`, taxChange: s => `Monday: guild becomes the ${s[1] === 'east' ? 'Flaris' : 'Darkon'} tax owner`,
    srStart: () => 'the next Secret Room starts', srEnd: () => 'the Secret Room ends', siegeStart: () => 'a Guild Siege starts',
    siegeEnd: s => `the Guild Siege ends, guild ${s[1]} wins`, siegeClear: () => 'too few guilds sign up: the winner is cleared',
    cont: s => `${s[1] === 'east' ? 'Flaris' : 'Darkon'} switched ${s[2] ? 'on' : 'off'}`, srEvent: s => `SECRETROOM ${s[1] ? 'on' : 'off'}`,
    tick: () => '30 s check (every online player)',
  };
  const words = s => (STEP_WORDS[s[0]] ? STEP_WORDS[s[0]](s) : s.join(' '));

  FRE.ownerBuffSim = { NULL_ID, newWorld, isHolder, refresh, step, run, STORIES, words };
})(globalThis.FRE = globalThis.FRE || {});
