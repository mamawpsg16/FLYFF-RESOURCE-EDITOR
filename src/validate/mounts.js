// Mounts checks. loaders/mounts.js reads Mount.inc the way LoadMountAnimationList does, loaders/mount-sim.js what the game does.
(function (FRE) {
  'use strict';
  const LOOPS = ['szStand', 'szWalk', 'szRun', 'szWalkBack', 'szFlyStand', 'szFlyWalk', 'szFlyStart', 'szFlyLand'];

  function mountChecks(model, opts = {}) {
    const out = [], F = FRE.mounts.FILE, M = FRE.mounts;
    const push = (span, code, severity, message, k) => out.push({ module: 'mounts', file: F, code, severity, start: span.start, end: span.end,
      key: `${code}|${k}`, message });
    if (model.hang) push(model.hang, 'MT_UNCLOSED', 'BLOCK', `The Add_Mount block at the end has no "}": the loader reads past the end of the file forever, so the WorldServer and the game hang at startup.`, 'end');
    const seen = new Map();
    for (const b of model.blocks) {
      if (b === model.hang) continue;
      const x = model.byId.get(b.id), name = x ? x.name : `#${b.id}`, k = String(b.id);
      if (seen.has(b.id)) push(b, 'MT_DUP_ID', 'WARN', `${name} (${b.id}) has another Add_Mount block above: the last one is used, the earlier one does nothing.`, `${k}|${b.start}`);
      seen.set(b.id, b);
      if (!M.entryOf(b, 'dwID')) push(b, 'MT_NO_ID', 'WARN', 'This Add_Mount block has no dwID: it is filed under item 0 and no mount uses it.', `noid|${b.start}`);
      else if (!x || !x.item) push(b, 'MT_NOT_ITEM', 'WARN', `dwID ${b.id} is not an item in Spec_Item.txt: no mount uses this block.`, k);
      else if (!x.isMount) push(b, 'MT_NOT_MOUNT', 'WARN', `${name} (${b.id}) is not a mount item (dwItemKind3 is not IK3_MOUNT): it can't be ridden, so the block is never used.`, k);
      if (model.anims.get(b.id) !== b) continue;            // only the block that wins matters from here
      const a = b.anim;
      if (!(a.fGroundSpeed > 0)) push(b, 'MT_SPEED_ZERO', 'WARN', `${name}: speed ${a.fGroundSpeed}${M.entryOf(b, 'fGroundSpeed') ? '' : ' (no fGroundSpeed line)'}: the mount replaces the rider's speed, so the rider can't move.`, k);
      if (a.nType !== M.MOUNT_WALK && a.nType !== M.MOUNT_WALK_FLY) push(b, 'MT_TYPE', 'WARN', `${name}: nType ${a.nType}: only 0 (ground) and 1 (can fly) mean anything; the server refuses take-off for anything but 1.`, k);
      if (a.nType === M.MOUNT_WALK_FLY && !a.szFlyStand && !a.szFlyWalk) push(b, 'MT_FLY_NO_LOOPS', 'WARN', `${name} can fly but has no hovering / flying loop: in the air it plays its walk / standing loop.`, k);
      if (a.nType !== M.MOUNT_WALK_FLY) {
        const used = ['fFlightSpeed', 'fFlyMaxSpeed', 'fFlyAnimSpeed', 'szFlyStand', 'szFlyWalk', 'szFlyStart', 'szFlyLand'].filter(n => M.entryOf(b, n));
        if (used.length) push(b, 'MT_FLY_UNUSED', 'INFO', `${name} is a ground mount (nType ${a.nType}): ${used.join(', ')} ${used.length > 1 ? 'are' : 'is'} never used.`, k);
      }
      for (const f of M.FIELDS) {
        if (f.min === undefined) continue;
        const e = M.entryOf(b, f.key);
        if (!e) continue;
        const v = a[f.key];
        if ((f.minOpen ? v <= f.min : v < f.min) || v > f.max)
          push(e.value, 'MT_RANGE', 'WARN', `${name}: ${f.key} ${e.raw} is outside what /mountset ${f.cmd} accepts (${f.minOpen ? 'above ' : ''}${f.min} to ${f.max}).`, `${k}|${f.key}`);
      }
      if (x && x.model && opts.hasModels) {
        for (const n of LOOPS) {
          const e = M.entryOf(b, n);
          if (!e || !a[n]) continue;
          if (!opts.hasModels.has(a[n].toLowerCase())) push(e.value, 'MT_ANI_MISSING', 'WARN', `${name}: ${n} "${a[n]}" is not in Client/Model: the game finds no animation for that state.`, `${k}|${n}`);
        }
      }
    }
    for (const x of model.mounts) {
      if (x.isMount && !x.block) push({ start: 0, end: 0 }, 'MT_NO_BLOCK', 'WARN', `${x.name} (${x.id}) is a mount item with no Add_Mount block: the rider is not placed on a seat (MoverRender skips the seat code) and moves at their own speed.`, String(x.id));
    }
    return out;
  }

  FRE.mountChecks = mountChecks;
})(globalThis.FRE = globalThis.FRE || {});
