// DDS pictures (Client/Item/*.dds: the item icons, mostly 32x32) for the Boxes task.
// Formats found in Client/Item (2026-10-08): uncompressed A1R5G5B5 (4,015 files), A8R8G8B8 (179), R8G8B8 (60),
// A8B8G8R8 (13), A4R4G4B4 (9), X1R5G5B5 (4), and DXT1 (33), DXT3 (24), DXT5 (122). The magenta key colour
// (255, 0, 255) is drawn transparent, as the game draws item icons.
// decode() is a plain function (tested against an independent Python decode in tools/oracle_sim.py dds).
(function (FRE) {
  'use strict';
  const rd32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const rd16 = (b, o) => b[o] | (b[o + 1] << 8);
  const DDPF_ALPHAPIXELS = 0x1, DDPF_FOURCC = 0x4, DDSD_PITCH = 0x8;

  // one channel of an uncompressed pixel, scaled to 0..255 (rounded)
  function channel(px, mask) {
    if (!mask) return null;
    let shift = 0;
    while (!((mask >>> shift) & 1)) shift++;
    const max = mask >>> shift, v = (px & mask) >>> shift;
    return Math.floor((v * 255 + (max >>> 1)) / max);
  }
  const c565 = c => [((c >> 11) & 31) << 3 | ((c >> 11) & 31) >> 2, ((c >> 5) & 63) << 2 | ((c >> 5) & 63) >> 4, (c & 31) << 3 | (c & 31) >> 2];

  // bytes -> { w, h, rgba: Uint8ClampedArray, format } or null (not a DDS / unknown format)
  function decode(b) {
    if (!b || b.length < 128 || rd32(b, 0) !== 0x20534444) return null;   // 'DDS '
    const hdrFlags = rd32(b, 8), h = rd32(b, 12), w = rd32(b, 16), pitch = rd32(b, 20);
    const pfFlags = rd32(b, 80), four = String.fromCharCode(b[84], b[85], b[86], b[87]);
    const bits = rd32(b, 88), rm = rd32(b, 92), gm = rd32(b, 96), bm = rd32(b, 100), am = rd32(b, 104);
    if (!w || !h || w > 4096 || h > 4096) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    let format;
    if (pfFlags & DDPF_FOURCC) {
      if (four !== 'DXT1' && four !== 'DXT3' && four !== 'DXT5') return null;
      format = four;
      const blk = four === 'DXT1' ? 8 : 16;
      let o = 128;
      for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 4) {
        if (o + blk > b.length) return null;
        const alpha = new Array(16).fill(255);
        let co = o;
        if (four === 'DXT3') {
          for (let i = 0; i < 16; i++) alpha[i] = ((b[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
          co = o + 8;
        } else if (four === 'DXT5') {
          const a0 = b[o], a1 = b[o + 1], pal = [a0, a1];
          if (a0 > a1) for (let i = 2; i < 8; i++) pal.push(Math.floor(((8 - i) * a0 + (i - 1) * a1) / 7));
          else { for (let i = 2; i < 6; i++) pal.push(Math.floor(((6 - i) * a0 + (i - 1) * a1) / 5)); pal.push(0, 255); }
          let bitsA = 0n;
          for (let i = 0; i < 6; i++) bitsA |= BigInt(b[o + 2 + i]) << BigInt(8 * i);
          for (let i = 0; i < 16; i++) alpha[i] = pal[Number((bitsA >> BigInt(3 * i)) & 7n)];
          co = o + 8;
        }
        const c0 = rd16(b, co), c1 = rd16(b, co + 2), p0 = c565(c0), p1 = c565(c1);
        const cols = [p0.concat(255), p1.concat(255)];
        if (c0 > c1 || four !== 'DXT1') {
          cols.push([0, 1, 2].map(k => Math.floor((2 * p0[k] + p1[k]) / 3)).concat(255));
          cols.push([0, 1, 2].map(k => Math.floor((p0[k] + 2 * p1[k]) / 3)).concat(255));
        } else {
          cols.push([0, 1, 2].map(k => (p0[k] + p1[k]) >> 1).concat(255));
          cols.push([0, 0, 0, 0]);
        }
        const idx = rd32(b, co + 4);
        for (let i = 0; i < 16; i++) {
          const x = bx + (i & 3), y = by + (i >> 2);
          if (x >= w || y >= h) continue;
          const c = cols[(idx >>> (2 * i)) & 3], q = (y * w + x) * 4;
          rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = four === 'DXT1' ? c[3] : alpha[i];
        }
        o += blk;
      }
    } else {
      if (bits !== 16 && bits !== 24 && bits !== 32) return null;
      const bpp = bits / 8;
      const row = (hdrFlags & DDSD_PITCH) && pitch >= w * bpp ? pitch : w * bpp;
      if (128 + row * (h - 1) + w * bpp > b.length) return null;
      const useA = (pfFlags & DDPF_ALPHAPIXELS) && am;
      format = `${bits}-bit ${useA ? 'with' : 'no'} alpha`;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = 128 + y * row + x * bpp;
        const px = bpp === 2 ? rd16(b, o) : bpp === 3 ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) >>> 0 : rd32(b, o);
        const q = (y * w + x) * 4;
        rgba[q] = channel(px, rm) || 0; rgba[q + 1] = channel(px, gm) || 0; rgba[q + 2] = channel(px, bm) || 0;
        rgba[q + 3] = useA ? channel(px, am) : 255;
      }
    }
    for (let q = 0; q < rgba.length; q += 4) if (rgba[q] === 255 && rgba[q + 1] === 0 && rgba[q + 2] === 255) rgba[q + 3] = 0;   // the magenta key
    return { w, h, rgba, format };
  }

  // An element that shows Client/Item/<file> once loaded (ctx.clientItemFile), drawn `scale` times bigger with
  // crisp pixels; empty when there is no Client folder or no such file.
  const cache = new Map();
  function picture(ctx, file, { scale = 1, cls = '', title } = {}) {
    const box = FRE.dom.h('span.dds-pic' + cls);
    if (!file || !ctx.clientItemFile) return box;
    const key = file.toLowerCase();
    if (!cache.has(key)) cache.set(key, ctx.clientItemFile(file).then(decode).catch(() => null));
    cache.get(key).then(img => {
      if (!img) return;
      const c = FRE.dom.h('canvas', { width: img.w, height: img.h, title: title || file });
      c.style.width = img.w * scale + 'px'; c.style.height = img.h * scale + 'px';
      c.getContext('2d').putImageData(new ImageData(img.rgba, img.w, img.h), 0, 0);
      box.appendChild(c);
    });
    return box;
  }

  FRE.dds = { decode, picture };
})(globalThis.FRE = globalThis.FRE || {});
