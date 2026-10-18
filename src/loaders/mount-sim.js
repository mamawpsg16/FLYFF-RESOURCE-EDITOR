// Mounts simulator: what Mount.inc does in game, a port of the code that USES each value (V19 b43949aa, a5325b65):
//   loops()      the mount's leg loop each frame: CMover::... FrameMove mount part (_Common/Mover.cpp:4087-4160); the first loop
//                when you mount (OBJMSG_MOUNT_ON, _AIInterface/ActionMoverMsg.cpp:1124-1133)
//   ground()     how far a rider moves per tick: the mount's fGroundSpeed REPLACES CMover::GetSpeed (ActionMover.cpp:236-243),
//                walk mode / 4, backing up / 5, sideways / 4 (ActionMoverState.cpp:203-230, ActionMover.cpp:395-430); 60 ticks a
//                second (FRAME_PER_SEC, timer.h:133). A mount item with no Mount.inc block keeps the player's own speed.
//   fly()        straight level flight: CActionMover::ProcessFlyMove (ActionMoverState2.cpp:350-470) with the push of ProcessState2
//                OBJSTA_FMOVE (:505-516): (Mount.inc fFlightSpeed > 0 ? it : the item's fFlightSpeed) x 0.75, turbo x 1.2; top
//                speed fFlyMaxSpeed > 0 ? it : 0.3, turbo x 1.1; the push is added only below the top speed and clamped to it,
//                then air friction x (1 - 0.011); the number the game shows: (int)((int)(len x 60 x 60 x 60) / 200) (:463-466).
//                All in float32. Letting go of the key (OBJSTA_STAND, m_fAccPower = 0) glides until len < 0.0002.
//   takeOff()    the server's answer to the take-off key: CDPSrvr::OnMountFly (WORLDSERVER/DPSrvr.cpp:7830-7885).
// Not modelled: the seat (MoverRender.cpp:367-390 needs the bone matrices of the .chr file), turning / climbing / the drift
// boost on a turn (a straight line only), turbo fuel running out, packets and other players' views, terrain and collision.
(function (FRE) {
  'use strict';
  const f32 = Math.fround;
  const FRIC_AIR = f32(0.011);          // ActionMoverState2.cpp:17
  const TICKS = 60;                     // FRAME_PER_SEC, timer.h:133
  const BROOM_MAX = f32(0.3);           // ProcessFlyMove fMaxSpeed

  // one frame of the leg-loop picker. prev = m_nMountMotion (-1 after mounting / ResetMountMotion, Mover.h:1327 / 1330)
  //   in: { fly, moving (sideways m_vDelta > 0 on the ground; any m_vDelta length^2 > 0.0001 in the air), move: 'F' | 'B' | 'L' |
  //         'R' | 'LM' | 'RM' | null (the move state), walk (OBJSTAF_WALK), end (the playing one-shot reached its end frame) }
  //   -> { motion, speed (frame speed), file (when the loop changes, else null), changed, once }
  function frame(anim, model, prev, inp) {
    let n = 0;
    if (!inp.fly && inp.moving) {
      if (inp.move === 'B') n = 3;
      else if (inp.walk) n = 1;
      else n = 2;
    }
    const moveKey = ['F', 'B', 'L', 'R', 'LM', 'RM'].includes(inp.move);
    if (inp.fly) n = inp.moving ? 5 : 4;
    if (inp.fly && prev >= 0 && prev <= 3 && anim.szFlyStart !== '' && n === 4) n = 6;
    else if (inp.fly && prev === 6 && !inp.end && n === 4) n = 6;
    else if (!inp.fly && prev >= 4 && prev <= 6 && anim.szFlyLand !== '' && !moveKey) n = 7;
    else if (!inp.fly && prev === 7 && !inp.end && !moveKey) n = 7;
    let speed = 1;
    if (n === 2) speed = anim.fAnimSpeed;
    else if (n === 1 || n === 3) speed = anim.fWalkAnimSpeed;
    else if (n >= 4) speed = anim.fFlyAnimSpeed;
    let file = null;
    const changed = n !== prev;
    if (changed) {
      const pick = ['szStand', 'szWalk', 'szRun', 'szWalkBack', 'szFlyStand', 'szFlyWalk', 'szFlyStart', 'szFlyLand'][n];
      let s = n === 1 ? '' : anim[pick];            // state 1 has no own key: it starts empty and takes szWalk below
      if (s === '' && (n === 1 || n === 2 || n === 3 || n === 5)) s = anim.szWalk;
      if (s === '' && n !== 0) s = anim.szStand;
      if (s === '') s = model ? FRE.mounts.motionFile(model, n === 0 || n >= 4 ? 'stand' : 'walk') : '';
      file = s;                                       // '' = nothing loaded: the old loop keeps playing
    }
    return { motion: n, speed, file, changed, once: n === 6 || n === 7 };
  }

  const NAMES = ['standing', 'walk mode', 'moving', 'backing up', 'hovering', 'flying forward', 'taking off', 'landing'];

  // a sequence of frames from mounting: the loop each one plays. steps: [inp], each held for one frame
  function loops(anim, model, steps) {
    let prev = -1, playing = mountOn(anim, model);
    const out = [];
    for (const inp of steps) {
      const r = frame(anim, model, prev, inp);
      if (r.changed && r.file) playing = r.file;
      out.push({ motion: r.motion, state: NAMES[r.motion], speed: r.speed, file: playing, loaded: r.changed ? r.file : null, once: r.once });
      prev = r.motion;
    }
    return out;
  }
  // OBJMSG_MOUNT_ON: szStand, else the model's own "stand" motion
  const mountOn = (anim, model) => (anim && anim.szStand !== '') ? anim.szStand : (model ? FRE.mounts.motionFile(model, 'stand') : '');

  // ground movement per tick (float32, the delta's length along the heading) and per second
  //   footSpeed: the player's own speed for a mount item without a block (GetSpeed, no buffs modelled)
  function ground(anim, footSpeed = null) {
    if (!anim) return { block: false, run: footSpeed, walk: footSpeed === null ? null : f32(footSpeed / 4), back: footSpeed === null ? null : f32(footSpeed / 5) };
    const s = f32(anim.fGroundSpeed);
    const per = { run: s, walk: f32(s / 4), back: f32(s / 5), side: f32(s / 4) };
    const sec = {};
    for (const k of Object.keys(per)) sec[k] = f32(per[k] * TICKS);
    return { block: true, perTick: per, perSec: sec };
  }

  // straight level flight from standing still, holding forward for `ticks` frames, then letting go
  //   item: { fFlightSpeed } of the mount item (Spec_Item); opt: { turbo, ticks (holding), glide (max frames after letting go) }
  function fly(anim, item, opt = {}) {
    const holdTicks = opt.ticks == null ? 600 : opt.ticks;
    const turbo = !!opt.turbo;
    let push = f32(f32(item.fFlightSpeed) * f32(0.75));
    if (anim && anim.fFlightSpeed > 0) push = f32(f32(anim.fFlightSpeed) * f32(0.75));
    if (turbo) push = f32(push * f32(1.2));
    let max = BROOM_MAX;
    if (anim && anim.fFlyMaxSpeed > 0) max = f32(anim.fFlyMaxSpeed);
    if (turbo) max = f32(max * f32(1.1));
    const shown = d => Math.trunc(f32(Math.trunc(f32(f32(f32(f32(Math.sqrt(f32(d * d))) * 60) * 60) * 60)) / 200));
    let d = f32(0), top = 0, reach = null;
    const perSec = [];
    for (let t = 1; t <= holdTicks; t++) {
      if (push > 0) {
        const lenSq = f32(d * d);
        if (lenSq < f32(max * max)) {
          d = f32(d + push);
          const len = f32(Math.sqrt(f32(d * d)));
          if (len > max) d = f32(d * f32(max / len));
        }
      }
      d = f32(d * f32(1 - FRIC_AIR));
      const sh = shown(d);
      if (sh > top) { top = sh; reach = t; }
      if (t % TICKS === 0) perSec.push(sh);
    }
    // let go: m_fAccPower = 0, friction only, stops below 0.0002 (ActionMoverState2.cpp:458)
    let glide = 0;
    const maxGlide = opt.glide == null ? 6000 : opt.glide;
    while (d !== 0 && glide < maxGlide) {
      glide++;
      d = f32(d * f32(1 - FRIC_AIR));
      if (f32(d * d) < f32(f32(0.0002) * f32(0.0002))) d = 0;
    }
    const steady = lastSteady(push, max);
    return { push, max, top, reachTicks: reach, shownPerSec: perSec, steady, steadyShown: shown(steady), steadyPerSec: f32(steady * TICKS),
      glideTicks: glide };
  }
  // the speed a held key settles at (the tick after a clamp): run the loop until it repeats
  function lastSteady(push, max) {
    let d = f32(0);
    for (let t = 0; t < 20000; t++) {
      const before = d;
      if (push > 0 && f32(d * d) < f32(max * max)) {
        d = f32(d + push);
        const len = f32(Math.sqrt(f32(d * d)));
        if (len > max) d = f32(d * f32(max / len));
      }
      d = f32(d * f32(1 - FRIC_AIR));
      if (d === before) break;
    }
    return d;
  }

  // the server's answer to the take-off key (OnMountFly). ctx: { flyLv, worldFly (m_bFly), noFly (HATTR_NOFLY here),
  //   tooSoon (less than 1 s since the last switch), flying (already in the air), land (the land key) }
  // -> { ok, text } (text = what the player reads; null = silently ignored)
  function takeOff(anim, item, ctx = {}) {
    if (ctx.tooSoon) return { ok: false, text: null };
    if (!anim || anim.nType !== FRE.mounts.MOUNT_WALK_FLY) return { ok: false, text: 'This mount cannot fly.' };
    const want = !ctx.land;
    if (want && !ctx.flying) {
      if (!ctx.worldFly || ctx.noFly) return { ok: false, text: 'You cannot fly here.' };
      if (item && (ctx.flyLv | 0) < (item.dwFlightLimit | 0)) return { ok: false, text: 'Your flight level is too low to fly this mount.' };
      return { ok: true, text: null };
    }
    if (!want && ctx.flying) return { ok: true, text: null };
    return { ok: false, text: null };
  }

  // the name above the rider: GetOverheadPos + fNameOffset (MoverRender.cpp:1277-1279)
  const nameLift = anim => anim ? f32(anim.fNameOffset) : 0;

  // plain-words summary for the editor's "What happens in game" box
  function describe(x, opt = {}) {
    const a = x.anim, out = {};
    out.ground = ground(a, opt.footSpeed == null ? null : opt.footSpeed);
    out.mountOn = mountOn(a, x.model);
    const seq = [{ moving: true, move: 'F' }, { moving: true, move: 'F', walk: true }, { moving: true, move: 'B' }, {}];
    out.loops = a ? loops(a, x.model, seq) : [];
    out.flies = !!a && a.nType === FRE.mounts.MOUNT_WALK_FLY;
    if (out.flies) {
      out.fly = fly(a, { fFlightSpeed: x.itemFlight }, {});
      out.turbo = fly(a, { fFlightSpeed: x.itemFlight }, { turbo: true });
      out.air = loops(a, x.model, [{}, { fly: true }, { fly: true, end: true }, { fly: true, moving: true, move: 'F' }, { fly: true }, {}, { end: true }]);
    }
    out.name = nameLift(a);
    return out;
  }

  FRE.mountSim = { frame, loops, mountOn, ground, fly, takeOff, nameLift, describe, NAMES, TICKS, FRIC_AIR, BROOM_MAX };
})(globalThis.FRE = globalThis.FRE || {});
