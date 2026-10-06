// The server's random numbers, ported from _Common/xUtil.cpp (xRand / xRandom are inline in
// xUtil.h): a 32-bit LCG, g_next = g_next * 1103515245 + 12345.
//   xRandom( num )       = xRand() % num                      (0 .. num-1)
//   xRandom( min, max )  = max > min ? min + xRandom( max - min ) : min   (min .. max-1)
// On the server g_next is one global shared by every roll; a simulator seeds its own.
(function (FRE) {
  'use strict';
  function rng(seed) {
    let next = seed >>> 0;
    const rand = () => (next = (Math.imul(next, 1103515245) + 12345) >>> 0);
    const random = n => rand() % (n >>> 0);
    const range = (min, max) => { min >>>= 0; max >>>= 0; return max > min ? min + random(max - min) : min; };
    return { rand, random, range, get next() { return next; } };
  }
  FRE.xRandom = { rng };
})(globalThis.FRE = globalThis.FRE || {});
