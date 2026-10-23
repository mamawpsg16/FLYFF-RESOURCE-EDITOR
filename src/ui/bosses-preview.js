// Boss Mechanics preview: the shapes drawn on a canvas, ported from V19 feat/boss-patterns Tools/BossMechanics/simulator.html
// (12c0df34 shapes 18-28, 3dac171b; design v3 8da5dc21: arena, shapes 29-31, small shapes on every player), the same math as the planned C++
// (CPP_PORT_LIST.md: CreateAttack / CreateStorm, int math, skill range R0). Changed for the editor: the skill numbers come from the
// loaded propSkillAdd.csv (FRE.bosses.skillTable), the colours are the simulator's dark ones, and the loops run inside a canvas
// card. The preview only draws; which row a swing picks comes from loaders/bosses-sim.js (the planned dispatcher).
(function (FRE) {
  'use strict';
  var SKILLS = new Map(), FALLBACK = { range: 4, timer: 2000, bomb: 'TYPE_BOMB', pain: 500, time: 0, dest0: null };
  var PALETTE = { '--grid': '#2a2a30', '--boss': '#a98bea', '--player': '#6bb0f0', '--mark': '#f0a050', '--boom': '#ff6a4a', '--burn': '#f5c842',
    '--ink': '#dde3ee', '--muted': '#8a96aa' };
  function css(name) { return PALETTE[name] || '#888'; }

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var R = rng(1);
  function xRandom(a, b) { if (b === undefined) return Math.floor(R() * a); a = Math.trunc(a); b = Math.trunc(b); return b <= a ? a : a + Math.floor(R() * (b - a)); }
  var I = Math.trunc;

  var BOSS_RADIUS = 3, PLAYER_RADIUS = 1;
  var PLAYERS = [];
  // design v3: per-boss arena radius (12-48 m) around the boss; players stand spread inside it
  var ARENA = 24;
  function placePlayers() {
    PLAYERS = [{ x: I(ARENA * 0.3), z: I(ARENA * 0.2), name: "P1" }, { x: -I(ARENA * 0.38), z: I(ARENA * 0.25), name: "P2" }, { x: I(ARENA * 0.08), z: -I(ARENA * 0.46), name: "P3" }];
  }
  placePlayers();
  function inArena(p, c) { return Math.hypot(p.x - c.x, p.z - c.z) <= ARENA; }

  function skillRow(si) { return SKILLS.get(si) || FALLBACK; }

  // ---------- event builders (one "world" = list of marks + storms) ----------
  // mark: {x,z,t0,t1,r,type,pain}
  function World() { this.marks = []; this.notes = []; }

  World.prototype.bomb = function (si, x, z, t0, extra) {
    var s = skillRow(si); if (!s) return;
    if (Math.hypot(x, z) > ARENA) return;     // design v3: a mark beyond the arena (the boss at 0, 0) is not made
    var timer = (s.timer || 0) + extra;
    this.marks.push({ x: x, z: z, t0: t0, t1: t0 + timer, r: s.range || 4, type: s.bomb, pain: s.pain || 500 });
  };
  // CustomBossAttack_CreateAttack
  World.prototype.createAttack = function (atk, p, customDelay, t0) {
    var v = atk.randomDelay ? xRandom(1000) : 0;
    if (customDelay !== undefined && customDelay > -1) v = customDelay;
    this.bomb(atk.skill, p.x, p.z, t0, v);
  };
  // CreateStorm (ver 1 = list in order, ver 3 = on the target each time)
  World.prototype.storm = function (si, list, ver, delay, t0, target) {
    for (var k = 0; k < list.length; k++) {
      var p = ver === 3 && target ? target : list[k];
      this.bomb(si, p.x, p.z, t0 + k * delay, 0);
    }
  };
  // CustomBossAttack_CreateAttackStorm
  World.prototype.attackStorm = function (atk, c, target, t0) {
    var st = skillRow(atk.skill); if (!st) return;
    var size = st.range || 0, delay = st.pain || 250, life = st.time || 0, follow = st.dest0 === 1;
    for (var t = 0; t <= life; t += delay) {
      var base = follow && target ? target : c;
      var rx = xRandom(size), rz = xRandom(size);
      var x = base.x + (xRandom(100) > 50 ? rx : -rx);
      var z = base.z + (xRandom(100) > 50 ? rz : -rz);
      this.bomb(atk.storm, x, z, t0 + t, 0);
    }
    this.marks.push({ x: c.x, z: c.z, t0: t0, t1: t0 + life, r: size, type: "STORM_AREA" });
  };

  function add(p, dx, dz) { return { x: p.x + dx, z: p.z + dz }; }
  function createCircle(c, radius, amount) {
    var out = [];
    for (var i = 0; i < amount; i++) out.push({ x: c.x + I(radius * Math.cos(i * 2 * 3.141592653 / amount)), z: c.z + I(radius * Math.sin(i * 2 * 3.141592653 / amount)) });
    return out;
  }
  function createCycle(a, b, distance, step) {
    var out = [], n = I(distance * 2 / step) + 1;
    for (var i = 0; i < n; i++) {
      var p = { x: a.x, z: a.z };
      if (a.x < b.x) p.x += step * i; else if (a.x > b.x) p.x -= step * i;
      if (a.z < b.z) p.z += step * i; else if (a.z > b.z) p.z -= step * i;
      out.push(p);
    }
    return out;
  }

  // The 12 shapes (CustomBossAttack_*). c = centre, r = mob radius, w = world, t0 = start ms
  var SHAPES = {
    ATTACK_AROUNDSELF: { text: "3 marks around the spot: one in front, two behind; v3: around the boss and every player in the arena.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, range = r > R0 ? I(r) : R0;
      [add(c, 0, -range), add(c, range, range), add(c, -range, range)].forEach(function (p) { w.createAttack(a, p, -1, t0); });
    } },
    ATTACK_LINE: { text: "4 marks in a line on 1-4 random arms (x / z, both ways).", run: function (w, a, c, r, t0) { lineAttack(w, a, true, c, r, t0); } },
    ATTACK_CROSS: { text: "All 4 arms: a + of 4 marks each.", run: function (w, a, c, r, t0) { lineAttack(w, a, false, c, r, t0); } },
    ATTACK_TRIANGLE: { text: "6 marks in a triangle; inner 3 land 250 ms later.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = r > R0 ? I(r) : R0;
      var top = add(c, 0, -2 * s), left = add(c, 2 * s, 2 * s), right = add(c, -2 * s, 2 * s);
      var top2 = add(c, -s, 0), left2 = add(c, s, 0), right2 = add(c, 0, 2 * s);
      if (a.step) w.storm(a.skill, [top, top2, left, left2, right, right2], 1, 125, t0);
      else [[top, 0], [top2, 250], [left, 0], [left2, 250], [right, 0], [right2, 250]].forEach(function (q) { w.createAttack(a, q[0], q[1], t0); });
    } },
    ATTACK_SQUARE: { text: "3 x 3 grid, row by row (250 ms apart).", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = r > R0 * 2 ? I(r) : R0 * 2;
      for (var i = 0; i < 3; i++) {
        var dz = i === 0 ? s : i === 2 ? -s : 0;
        var row = [add(c, -s, dz), add(c, 0, dz), add(c, s, dz)];
        if (a.step) w.storm(a.skill, row, 1, 250, t0);
        else row.forEach(function (p) { w.createAttack(a, p, i * 250, t0); });
      }
    } },
    ATTACK_RANDOM: { text: "5-9 marks scattered at random around the spot.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = r > R0 ? I(r) : R0, n = xRandom(5, 10), list = [];
      for (var i = 0; i < n; i++) {
        var rr = xRandom(0, s * 1.5) + xRandom(2, 6), p = { x: c.x, z: c.z };
        p.x += xRandom(1000) > 500 ? rr : -rr;
        if (xRandom(2000) > 1000) p.z += xRandom(3000) > 1500 ? rr : -rr;
        if (a.step) list.push(p); else w.createAttack(a, p, -1, t0);
      }
      if (a.step) w.storm(a.skill, list, 1, 125, t0);
    } },
    ATTACK_TARGET: { text: "1 mark on the boss and 1 on every player in the arena (v3).", run: function (w, a, c, r, t0) { w.createAttack(a, c, -1, t0); } },
    ATTACK_STORM: { text: "A storm area: drops the storm skill at random spots inside it, again and again; v3: one storm around the boss, and 1 mark of what it drops on every player in the arena.", run: function (w, a, c, r, t0, target) { w.attackStorm(a, c, target, t0); } },
    ATTACK_CORNER: { text: "1-3 marks: front, then back-left, back-right; v3: around the boss and every player in the arena.", run: function (w, a, c, r, t0) {
      var n = xRandom(1, 4), d = I(5 + r);
      if (n > 0) w.createAttack(a, add(c, 0, -d), 0, t0);
      if (n > 1) w.createAttack(a, add(c, d, d), 0, t0);
      if (n > 2) w.createAttack(a, add(c, -d, d), 0, t0);
    } },
    ATTACK_CIRCLE1: { text: "1 ring of 10 marks.", run: function (w, a, c, r, t0) { circleAttack(w, a, c, r, 1, t0); } },
    ATTACK_CIRCLE2: { text: "2 rings: 10, then 15 marks further out.", run: function (w, a, c, r, t0) { circleAttack(w, a, c, r, 2, t0); } },
    ATTACK_CIRCLE3: { text: "3 rings: 10, 15, 20 marks, each further out.", run: function (w, a, c, r, t0) { circleAttack(w, a, c, r, 3, t0); } }
  };

  function lineAttack(w, a, isRandom, c, r, t0) {
    var R0 = skillRow(a.skill).range, first = R0 + I(R0 / 2), range = r > first ? I(r) : first;
    var xA = xRandom(1000) > 500, zA = xRandom(1000) > 500, xB = xRandom(1000) > 500, zB = xRandom(1000) > 500;
    if (!xA && !zA) xA = true;
    if (!isRandom) xA = zA = xB = zB = true;
    var pos = [];
    function arm(dx, dz) {
      for (var i = 0; i < 4; i++) pos.push(add(c, dx * range * i, dz * range * i));
      if (a.step) { w.storm(a.skill, pos, 1, 250, t0); pos = []; }
    }
    if (xA) { arm(1, 0); if (xB) arm(-1, 0); }
    if (zA) { arm(0, 1); if (zB) arm(0, -1); }
    if (!a.step) pos.forEach(function (p) { w.createAttack(a, p, -1, t0); });
  }

  function circleAttack(w, a, c, mob, waves, t0) {
    var R0 = skillRow(a.skill).range;
    for (var wave = 1; wave <= waves; wave++) {
      if (mob < 3) mob = 2;
      var range = I(mob + R0 * 2), bonus = I(1 + (R0 * 1.5) * (wave - 1));
      if (wave > 1) range += bonus;
      var list = createCircle(c, range, 10 + (wave === 2 ? 5 : 0) + (wave === 3 ? 10 : 0));
      for (var i = 0; i < list.length; i++) {
        var d = 100 + i * 100 + (wave === 2 ? 2000 : 0) + (wave === 3 ? 4000 : 0);
        if (!a.randomDelay) d = wave === 2 ? 500 : wave === 3 ? 1000 : 0;
        if (!a.step) w.createAttack(a, list[i], d, t0);
      }
      if (a.step) w.storm(a.skill, list, 1, 100 * wave, t0);
    }
  }

  // Our own shapes, types 13-17 (C++ copy in PLANS/Boss Mechanics/CPP_PORT_LIST.md). Built only from what the 12 use:
  // CreateAttack( pos, delay ) and CreateStorm( list, delay ), int math, skill range R0.
  function ring(c, rad, n) { return createCircle(c, rad, Math.max(n, 6)); }
  var NEW_SHAPES = {
    ATTACK_SPIRAL: { name: "Spiral", text: "16 marks wind out from the spot (2 turns), landing 150 ms apart.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [];
      for (var i = 0; i < 16; i++) {
        var ang = i * 2 * 3.141592653 / 8, d = I(r + R0 + i * R0 / 3);
        list.push({ x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) });
      }
      if (a.step) w.storm(a.skill, list, 1, 150, t0);
      else list.forEach(function (p, i) { w.createAttack(a, p, i * 150, t0); });
    } },
    ATTACK_RINGWAVE: { name: "Ripple", text: "3 rings of 8 spaced marks go off from the inside out, 600 ms apart; each ring turned half a step: weave through the gaps.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, all = [], turn = xRandom(8) * 45;
      for (var k = 0; k < 3; k++) {
        var rad = I(r + R0 * (1.5 + 2 * k));
        for (var i = 0; i < 8; i++) {
          var ang = (turn + i * 45 + (k % 2) * 22.5) * 3.141592653 / 180, p = { x: c.x + I(rad * Math.cos(ang)), z: c.z + I(rad * Math.sin(ang)) };
          if (a.step) all.push(p); else w.createAttack(a, p, k * 600, t0);
        }
      }
      if (a.step) w.storm(a.skill, all, 1, 50, t0);
    } },
    ATTACK_CHECKER: { name: "Checkerboard", text: "5 x 5 board: the dark squares go off, 1.5 s later the light ones.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = R0 * 2, first = [], second = [];
      for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++)
        (((i + j) % 2 + 2) % 2 ? second : first).push(add(c, i * s, j * s));
      if (a.step) w.storm(a.skill, first.concat(second), 1, 100, t0);
      else { first.forEach(function (p) { w.createAttack(a, p, 0, t0); }); second.forEach(function (p) { w.createAttack(a, p, 1500, t0); }); }
    } },
    ATTACK_SAFELANE: { name: "Safe lane", text: "2 full rings + the centre explode at once, except 2 lanes on opposite sides (random angle): walk to the nearer one.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, gap = xRandom(360), list = [{ x: c.x, z: c.z }];
      [[I(r + R0 * 2), 12], [I(r + R0 * 4), 20]].forEach(function (q) {
        createCircle(c, q[0], q[1]).forEach(function (p, i) {
          var deg = i * 360 / q[1], off = Math.abs(((deg - gap) % 360 + 540) % 360 - 180);
          if (off >= 45 && off <= 135) list.push(p);           // v3: 2 lanes of 90 degrees, opposite each other
        });
      });
      if (a.step) w.storm(a.skill, list, 1, 60, t0);
      else list.forEach(function (p) { w.createAttack(a, p, 0, t0); });
    } },
    ATTACK_BEAM: { name: "Rotating beam", text: "A line of 5 marks sweeps around the spot like a clock hand, 300 ms per step.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, start = xRandom(8), dir = xRandom(2) ? 1 : -1, all = [];
      for (var j = 0; j < 8; j++) {
        var ang = (start + dir * j) * 2 * 3.141592653 / 8;
        for (var k = 0; k < 5; k++) {
          var d = I(r + R0 + k * R0 * 1.25), p = { x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) };
          if (a.step) all.push(p); else w.createAttack(a, p, j * 300, t0);
        }
      }
      if (a.step) w.storm(a.skill, all, 1, 60, t0);
    } }
    ,
    // design v2 (BOSS_DESIGN_V2.md), types 18-22: harder versions of CROSS and the circles
    ATTACK_TWINSPIRAL: { name: "Twin spiral", text: "2 spiral arms wind out from opposite sides, 12 marks each, 150 ms apart; start angle and left / right turn are random: walk around them.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [], turn = xRandom(8) * 45, dir = xRandom(2) ? 1 : -1;
      for (var i = 0; i < 12; i++) for (var arm = 0; arm < 2; arm++) {
        var ang = (turn + arm * 180 + dir * i * 40) * 3.141592653 / 180, d = I(r + R0 + i * R0 / 2.5);
        var p = { x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) };
        if (a.step) list.push(p); else w.createAttack(a, p, i * 150, t0);
      }
      if (a.step) w.storm(a.skill, list, 1, 75, t0);
    } },
    ATTACK_CROSS_SPIN: { name: "Spinning cross", text: "A + of 4 arms turns 22.5 degrees per wave, 4 waves 400 ms apart; start angle and left / right spin are random: keep walking around.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, all = [], turn = xRandom(4) * 22.5, dir = xRandom(2) ? 1 : -1;
      for (var wv = 0; wv < 4; wv++) for (var arm = 0; arm < 4; arm++) {
        var ang = (turn + arm * 90 + dir * wv * 22.5) * 3.141592653 / 180;
        for (var k = 1; k <= 4; k++) {
          var d = I(r + R0 * 1.5 * k), p = { x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) };
          if (a.step) all.push(p); else w.createAttack(a, p, wv * 400, t0);
        }
      }
      if (a.step) w.storm(a.skill, all, 1, 25, t0);
    } },
    ATTACK_METEOR: { name: "Meteor rain", text: "20 marks fall one by one, 120 ms apart: 2 on each player in the arena, the rest at random spots around the boss (never on top of each other): keep moving.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [], tries = 0, max = R0 * 6;
      // v3: 2 of them on each player in the arena (off by up to R0 / 2), the rest at random
      PLAYERS.forEach(function (pl) { if (!inArena(pl, c)) return; for (var k = 0; k < 2; k++) list.push({ x: pl.x + xRandom(0, R0 + 1) - I(R0 / 2), z: pl.z + xRandom(0, R0 + 1) - I(R0 / 2) }); });
      while (list.length < 20 && tries++ < 400) {
        var p = { x: c.x + xRandom(0, max * 2) - max, z: c.z + xRandom(0, max * 2) - max }, ok = true;
        for (var k = 0; k < list.length; k++) if (Math.hypot(p.x - list[k].x, p.z - list[k].z) < R0 * 1.6) { ok = false; break; }
        if (ok) list.push(p);
      }
      if (a.step) w.storm(a.skill, list, 1, 120, t0);
      else list.forEach(function (p, i) { w.createAttack(a, p, i * 120, t0); });
    } },
    ATTACK_HUNTER: { name: "Hunter", text: "Every player in the arena gets 3 marks on where they stand, 700 ms apart, each a little off at random: never stand still.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [];
      PLAYERS.forEach(function (pl) {
        if (!inArena(pl, c)) return;
        for (var k = 0; k < 3; k++) {
          var p = { x: pl.x + xRandom(0, R0 * 2 + 1) - R0, z: pl.z + xRandom(0, R0 * 2 + 1) - R0 };
          if (a.step) list.push(p); else w.createAttack(a, p, k * 700, t0);
        }
      });
      if (a.step) w.storm(a.skill, list, 1, 700, t0);
    } },
    ATTACK_PETALS: { name: "Petals", text: "8 petals of 4 marks around the boss: all blow except 2 side by side; 3 waves 800 ms apart, the safe pair moves one step left or right each wave: follow it.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [], safe = xRandom(8), dir = xRandom(2) ? 1 : -1;
      for (var n = 0; n < 3; n++) {
        var s0 = ((safe + dir * n) % 8 + 8) % 8;
        for (var petal = 0; petal < 8; petal++) {
          if (petal === s0 || petal === (s0 + 1) % 8) continue;
          for (var k = 0; k < 4; k++) {
            var ang = (petal * 45 + 22.5) * 3.141592653 / 180, d = I(r + R0 * (1.2 + 1.5 * k)), p = { x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) };
            if (a.step) list.push(p); else w.createAttack(a, p, n * 800, t0);
          }
        }
      }
      if (a.step) w.storm(a.skill, list, 1, 30, t0);
    } },
    ATTACK_STOMP: { name: "Shockwave", text: "The boss stomps: a blast on itself, then rings grow out to the arena edge, 500 ms apart, with gaps between the rings and one 60 degree safe lane (same for every ring). Easy: stand in a gap or the lane.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, step = R0 * 3, lane = xRandom(360), list = [c], k = 0;
      if (!a.step) w.createAttack(a, c, 0, t0);
      for (var rad = r + R0 * 1.5; rad <= ARENA; rad += step, k++) createCircle(c, I(rad), Math.ceil(2 * 3.141592653 * rad / step)).forEach(function (p) {
        var deg = Math.atan2(p.z - c.z, p.x - c.x) * 180 / 3.141592653, off = Math.abs(((deg - lane) % 360 + 540) % 360 - 180);
        if (off < 30) return;
        if (a.step) list.push(p); else w.createAttack(a, p, k * 500, t0);
      });
      if (a.step) w.storm(a.skill, list, 1, 10, t0);
    } },
    ATTACK_CHARGE: { name: "Charge line", text: "A straight line from the boss toward EVERY player in the arena, out to the arena edge, 80 ms per mark. Easy: step to the side.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [];
      PLAYERS.forEach(function (t) {
        if (!inArena(t, c)) return;
        var ang = Math.atan2(t.z - c.z, t.x - c.x);
        for (var i = 1; r + R0 * 1.5 * i <= ARENA; i++) { var d = I(r + R0 * 1.5 * i); list.push({ x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) }); }
      });
      if (a.step) w.storm(a.skill, list, 1, 80, t0); else list.forEach(function (p, i) { w.createAttack(a, p, i * 80, t0); });
    } },
    ATTACK_QUADS: { name: "Four squares", text: "4 squares of 4 marks at random spots around the boss, then 4 more 1 s later somewhere else: watch where the next ones show.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, list = [], max = R0 * 5;
      for (var wave = 0; wave < 2; wave++) for (var q = 0; q < 4; q++) {
        var o = { x: c.x + xRandom(0, max * 2) - max, z: c.z + xRandom(0, max * 2) - max };
        [[0, 0], [R0, 0], [0, R0], [R0, R0]].forEach(function (d) {
          var p = add(o, I(d[0] * 1.6), I(d[1] * 1.6));
          if (a.step) list.push(p); else w.createAttack(a, p, wave * 1000, t0);
        });
      }
      if (a.step) w.storm(a.skill, list, 1, 60, t0);
    } },
    ATTACK_WALLS: { name: "Closing walls", text: "2 walls sweep across the whole arena from both sides, through the boss and out the far side, 300 ms per step; each wall has a 2-mark gap every 12 m (same size in any arena, random place per wall): stand in a gap's line as each wall passes.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = R0 * 1.4, n = Math.ceil(ARENA / s), every = Math.max(4, Math.round(12 / s)), list = [], vert = xRandom(2);
      for (var side = -1; side <= 1; side += 2) {
        var gap = xRandom(every);
        for (var step = 0; step <= 2 * n; step++) for (var j = -n; j <= n; j++) {
          var g = ((j - gap) % every + every) % every;
          if (g === 0 || g === 1) continue;
          var u = side * (n - step) * s, v = j * s, p = vert ? add(c, I(v), I(u)) : add(c, I(u), I(v));
          if (a.step) list.push(p); else w.createAttack(a, p, step * 300, t0);
        }
      }
      if (a.step) w.storm(a.skill, list, 1, 10, t0);
    } },
    ATTACK_SWEEP: { name: "Row sweep", text: "A board as wide as the arena blows one row at a time, 350 ms per row; each row has one random safe spot: find the hole, or step into a row that already blew.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, s = R0 * 1.6, n = Math.ceil(ARENA / s), list = [], back = xRandom(2);
      for (var i = 0; i <= 2 * n; i++) {
        var row = back ? n - i : i - n, hole = xRandom(2 * n + 1) - n;
        for (var j = -n; j <= n; j++) {
          if (j === hole) continue;
          var p = add(c, I(j * s), I(row * s));
          if (a.step) list.push(p); else w.createAttack(a, p, i * 350, t0);
        }
      }
      if (a.step) w.storm(a.skill, list, 1, 50, t0);
    } },
    // design v3 (BOSS_DESIGN_V2.md 6): Crossfire 25 (was Zigzag), Outer ring 29, Cross lines 30, Crosshair 31
    ATTACK_OUTER_RING: { name: "Outer ring", text: "In, then out: the band from the arena edge in to 12 m (half the arena if smaller) blows 2 s late, so run in; then everything inside it blows (later in a bigger arena), so run back out to the band.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, step = R0 * 1.5, band = Math.min(ARENA / 2, 12), inner = Math.max(ARENA - band, r + R0 * 1.5), list = [];
      var wave2 = 2000 + Math.max(2500, Math.ceil((inner - r) * 200) + 500);   // 5 m/s from the boss to the band, + 0.5 s
      for (var rad = ARENA; rad >= inner; rad -= step) createCircle(c, I(rad), Math.ceil(2 * 3.141592653 * rad / step)).forEach(function (p) {
        if (a.step) list.push(p); else w.createAttack(a, p, 2000, t0);
      });
      if (a.step) list.push({ x: c.x, z: c.z }); else w.createAttack(a, c, wave2, t0);
      for (rad = inner - step; rad >= R0; rad -= step) createCircle(c, I(rad), Math.ceil(2 * 3.141592653 * rad / step)).forEach(function (p) {
        if (a.step) list.push(p); else w.createAttack(a, p, wave2, t0);
      });
      if (a.step) w.storm(a.skill, list, 1, 10, t0);
    } },
    ATTACK_CROSSFIRE: { name: "Crossfire", text: "3-4 lines shoot across the arena from random edge points, passing near the boss, 100 ms per mark: step out of each line's path.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, step = R0 * 1.5, lines = 3 + xRandom(2), list = [];
      for (var k = 0; k < lines; k++) {
        var ang = xRandom(360) * 3.141592653 / 180, off = xRandom(0, R0 * 4 + 1) - R0 * 2;
        var sx = c.x + ARENA * Math.cos(ang) - off * Math.sin(ang), sz = c.z + ARENA * Math.sin(ang) + off * Math.cos(ang);
        for (var i = 0; i * step <= ARENA * 2; i++) {
          var p = { x: I(sx - i * step * Math.cos(ang)), z: I(sz - i * step * Math.sin(ang)) };
          if (!inArena(p, c)) continue;
          if (a.step) list.push(p); else w.createAttack(a, p, k * 300 + i * 100, t0);
        }
      }
      if (a.step) w.storm(a.skill, list, 1, 40, t0);
    } },
    ATTACK_CROSSLINES: { name: "Cross lines", text: "Every player in the arena gets a line along x and one along z through where they stand, across the arena, 1 s late: step diagonally.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, step = R0 * 1.5, list = [];
      PLAYERS.forEach(function (pl) {
        if (!inArena(pl, c)) return;
        for (var i = -Math.ceil(2 * ARENA / step); i * step <= 2 * ARENA; i++) [add(pl, I(i * step), 0), add(pl, 0, I(i * step))].forEach(function (p) {
          if (!inArena(p, c)) return;
          if (a.step) list.push(p); else w.createAttack(a, p, 1000, t0);
        });
      });
      if (a.step) w.storm(a.skill, list, 1, 15, t0);
    } },
    ATTACK_CROSSHAIR: { name: "Crosshair", text: "2 lines across the arena through the boss (a +), then 600 ms later the same turned 45 degrees (an x): stand between the arms, then move.", run: function (w, a, c, r, t0) {
      var R0 = skillRow(a.skill).range, step = R0 * 1.5, turn = xRandom(4) * 22.5, list = [];
      for (var wv = 0; wv < 2; wv++) for (var arm = 0; arm < 4; arm++) {
        var ang = (turn + wv * 45 + arm * 90) * 3.141592653 / 180;
        for (var d = r + R0; d <= ARENA; d += step) {
          var p = { x: c.x + I(d * Math.cos(ang)), z: c.z + I(d * Math.sin(ang)) };
          if (a.step) list.push(p); else w.createAttack(a, p, wv * 600, t0);
        }
      }
      if (a.step) w.storm(a.skill, list, 1, 20, t0);
    } }
  };

  var TIER = { ATTACK_TARGET: "Easy", ATTACK_AROUNDSELF: "Easy", ATTACK_LINE: "Easy", ATTACK_CROSS: "Easy", ATTACK_TRIANGLE: "Easy", ATTACK_STORM: "Easy",
    ATTACK_SQUARE: "Medium", ATTACK_CIRCLE1: "Medium", ATTACK_CIRCLE2: "Medium", ATTACK_RANDOM: "Medium", ATTACK_CORNER: "Medium", ATTACK_SPIRAL: "Medium", ATTACK_CHECKER: "Medium", ATTACK_TWINSPIRAL: "Medium",
    ATTACK_STOMP: "Easy", ATTACK_CHARGE: "Easy", ATTACK_QUADS: "Medium",
    ATTACK_CROSSFIRE: "Medium", ATTACK_CROSSLINES: "Medium", ATTACK_CROSSHAIR: "Medium" };
  function tierOf(type) { return TIER[type] || "Hard"; }
  function shapeOf(type) { return SHAPES[type] || NEW_SHAPES[type]; }

  var EVERY_PLAYER = { ATTACK_TARGET: 1, ATTACK_CORNER: 1, ATTACK_AROUNDSELF: 1 };
  // Hit type -> where the shape is drawn (OnAttackMelee_CustomBoss1)
  function fire(w, a, t0) {
    var boss = { x: 0, z: 0 }, target = PLAYERS[0];
    if (a.hit === "BOSSATK_HITSELF") {
      shapeOf(a.type).run(w, a, boss, BOSS_RADIUS / 2, t0, boss);
      // design v3: small shapes also go on every player in the arena, so nobody gets a free pass by standing away
      if (EVERY_PLAYER[a.type]) PLAYERS.forEach(function (p) { if (inArena(p, boss)) shapeOf(a.type).run(w, a, p, PLAYER_RADIUS / 2, t0, p); });
      // Storm (Easy): one storm around the boss, and 1 mark of what it drops on each player in the arena
      if (a.type === "ATTACK_STORM") PLAYERS.forEach(function (p) { if (inArena(p, boss)) w.bomb(a.storm, p.x, p.z, t0, 0); });
    }
    else if (a.hit === "BOSSATK_HITTARGET") shapeOf(a.type).run(w, a, target, PLAYER_RADIUS / 2, t0, target);
    else PLAYERS.forEach(function (p) { if (Math.hypot(p.x, p.z) <= 16) shapeOf(a.type).run(w, a, p, PLAYER_RADIUS / 2, t0, p); });
  }


  function draw(cv, w, t, view) {
    view = Math.max(view, ARENA + 4);
    var g = cv.getContext("2d"), W = cv.width, s = W / (2 * view);
    function X(x) { return W / 2 + x * s; } function Z(z) { return W / 2 + z * s; }
    g.clearRect(0, 0, W, W);
    g.strokeStyle = css("--grid"); g.lineWidth = 1;
    for (var k = -view; k <= view; k += 5) { g.beginPath(); g.moveTo(X(k), 0); g.lineTo(X(k), W); g.moveTo(0, Z(k)); g.lineTo(W, Z(k)); g.stroke(); }
    var hits = {};
    w.marks.forEach(function (m) {
      if (m.type === "STORM_AREA") {
        if (t < m.t0 || t > m.t1) return;
        g.setLineDash([6, 6]); g.strokeStyle = css("--boss"); g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s, 0, 7); g.stroke(); g.setLineDash([]);
        return;
      }
      if (t < m.t0) return;
      var burn = m.type === "TYPE_BURN";
      if (burn && t <= m.t1) {
        var tick = ((t - m.t0) % m.pain) < 120;
        g.globalAlpha = tick ? 0.75 : 0.35; g.fillStyle = css("--burn"); g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s, 0, 7); g.fill(); g.globalAlpha = 1;
        return;
      }
      if (t < m.t1) {
        var f = (t - m.t0) / Math.max(1, m.t1 - m.t0);
        g.strokeStyle = css("--mark"); g.lineWidth = 2; g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s, 0, 7); g.stroke();
        g.globalAlpha = 0.35; g.fillStyle = css("--mark"); g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s * f, 0, 7); g.fill(); g.globalAlpha = 1;
      } else if (t < m.t1 + 350 && !burn) {
        g.globalAlpha = 1 - (t - m.t1) / 350; g.fillStyle = css("--boom"); g.beginPath(); g.arc(X(m.x), Z(m.z), m.r * s, 0, 7); g.fill(); g.globalAlpha = 1;
      }
    });
    // who got hit so far
    PLAYERS.forEach(function (p) { hits[p.name] = 0; });
    w.marks.forEach(function (m) {
      if (m.type === "STORM_AREA") return;
      PLAYERS.forEach(function (p) {
        if (Math.hypot(p.x - m.x, p.z - m.z) > m.r) return;
        if (m.type === "TYPE_BURN") { if (t >= m.t0) hits[p.name] += Math.floor((Math.min(t, m.t1) - m.t0) / m.pain); }
        else if (t >= m.t1) hits[p.name]++;
      });
    });
    g.setLineDash([3, 5]); g.strokeStyle = css("--muted"); g.lineWidth = 1; g.beginPath(); g.arc(X(0), Z(0), ARENA * s, 0, 7); g.stroke(); g.setLineDash([]);
    g.fillStyle = css("--boss"); g.beginPath(); g.arc(X(0), Z(0), BOSS_RADIUS * s, 0, 7); g.fill();
    g.font = (11 * W / 300) + "px system-ui"; g.textAlign = "center";
    PLAYERS.forEach(function (p) {
      g.fillStyle = css("--player"); g.beginPath(); g.arc(X(p.x), Z(p.z), Math.max(3, PLAYER_RADIUS * s), 0, 7); g.fill();
      g.fillStyle = css("--ink"); g.fillText(p.name + (hits[p.name] ? " x" + hits[p.name] : ""), X(p.x), Z(p.z) - 8);
    });
    if (w.notes.length) { g.fillStyle = css("--muted"); g.textAlign = "left"; g.fillText(w.notes[0], 6, W - 6); }
    return hits;
  }

  function endOf(w) { var e = 0; w.marks.forEach(function (m) { e = Math.max(e, m.t1 + 400); }); return e; }

  // one canvas that loops a shape (or plays a fight): stop() ends it; the loop stops by itself when the canvas leaves the page
  // a: { type, hit, skill, randomDelay, storm, step } (a row as simulator.html's rowAttack makes it)
  function rowAttack(words) {
    return { type: words[0], hit: words[1], skill: words[2], randomDelay: words[3] === 'RANDOM_DELAY', storm: words[4], step: words[5] === 'APPLY_STEP' };
  }
  function drawable(a) { return !!shapeOf(a.type) && (a.type !== 'ATTACK_STORM' || SKILLS.has(a.storm)); }
  function loop(cv, a, view) {
    var seed = 1, w, end, start, raf = 0, dead = false;
    function restart() { R = rng(seed++); w = new World(); if (drawable(a)) fire(w, a, 300); end = endOf(w) + 600; start = performance.now(); }
    function tick(now) {
      if (dead || !cv.isConnected) return;
      var t = now - start;
      if (t > end) { restart(); t = 0; }
      draw(cv, w, t, view || 32);
      raf = requestAnimationFrame(tick);
    }
    restart();
    raf = requestAnimationFrame(tick);
    return { stop: function () { dead = true; cancelAnimationFrame(raf); } };
  }
  // a fight: plan = [{ at (ms from the start), a | null, text }] made from the simulator's swings; onSwing(k) per step
  function play(cv, plan, onSwing, view) {
    R = rng(Date.now() & 0xffff);
    var w = new World(), start = performance.now(), k = 0, raf = 0, dead = false;
    function tick(now) {
      if (dead || !cv.isConnected) return;
      var t = now - start;
      while (k < plan.length && plan[k].at <= t) {
        var s = plan[k];
        if (s.a && drawable(s.a)) fire(w, s.a, s.at + (s.extra || 0));
        if (onSwing) onSwing(k, s);
        k++;
      }
      w.marks = w.marks.filter(function (m) { return m.t1 + 400 > t; });
      draw(cv, w, t, view || 32);
      if (k >= plan.length && !w.marks.length) { if (onSwing) onSwing(-1); return; }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return { stop: function () { dead = true; cancelAnimationFrame(raf); } };
  }
  // how long a row's marks stay on the ground (ms, from the swing): the boss is busy until then (no stacking, BOSS_DESIGN_V2.md 5)
  function busyFor(a, extra) {
    if (!drawable(a)) return 0;
    R = rng(7);
    var w = new World();
    fire(w, a, extra || 0);
    var e = 0;
    w.marks.forEach(function (m) { e = Math.max(e, m.t1 + 300); });
    return e;
  }
  function setSkills(rows) { SKILLS = rows || new Map(); }
  // one cast's marks (tests and checks): [{ x, z, t0, t1, r, type }]
  function cast(a, seed) { R = rng(seed || 1); var w = new World(); if (drawable(a)) fire(w, a, 0); return w.marks; }
  // the boss's arena (m): players stand spread inside it; no arena line = 16 m (the C++ default, CPP_PORT_LIST.md v3-2)
  function setArena(v) { ARENA = v >= 12 && v <= 48 ? v : 16; placePlayers(); }
  var TYPES = function () { return Object.keys(SHAPES).concat(Object.keys(NEW_SHAPES)); };
  var info = function (type) { var s = shapeOf(type); return s ? { name: s.name || type.replace('ATTACK_', '').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }), text: s.text } : null; };

  FRE.bossPreview = { cast: cast, setSkills: setSkills, setArena: setArena, types: TYPES, tierOf: tierOf, loop: loop, play: play, rowAttack: rowAttack, drawable: drawable, busyFor: busyFor, info: info };
})(globalThis.FRE = globalThis.FRE || {});
