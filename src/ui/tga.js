// TGA pictures (Client/Char/char_*.tga: the NPC portraits, 200x240 RGBA) for the new-NPC form.
// Reads image types 2 (raw true-colour) and 10 (RLE true-colour), 24 or 32 bits, either row order.
(function (FRE) {
  'use strict';
  const { h } = FRE.dom;

  // bytes -> { w, h, rgba: Uint8ClampedArray } or null
  function decode(b) {
    if (!b || b.length < 18) return null;
    const idLen = b[0], cmapType = b[1], type = b[2];
    const cmapLen = b[5] | (b[6] << 8), cmapBits = b[7];
    const w = b[12] | (b[13] << 8), hgt = b[14] | (b[15] << 8), bpp = b[16], desc = b[17];
    if ((type !== 2 && type !== 10) || (bpp !== 24 && bpp !== 32) || !w || !hgt) return null;
    const px = bpp / 8, top = (desc & 0x20) !== 0;
    let i = 18 + idLen + (cmapType ? cmapLen * Math.ceil(cmapBits / 8) : 0);
    const rgba = new Uint8ClampedArray(w * hgt * 4);
    let n = 0, anyAlpha = false;
    const put = j => {
      const x = n % w, y = Math.floor(n / w), row = top ? y : hgt - 1 - y, o = (row * w + x) * 4;
      rgba[o] = b[j + 2]; rgba[o + 1] = b[j + 1]; rgba[o + 2] = b[j];
      rgba[o + 3] = px === 4 ? b[j + 3] : 255;
      if (px === 4 && b[j + 3]) anyAlpha = true;
      n++;
    };
    const total = w * hgt;
    if (type === 2) { while (n < total && i + px <= b.length) { put(i); i += px; } }
    else while (n < total && i < b.length) {
      const c = b[i++], count = (c & 0x7f) + 1;
      if (c & 0x80) { for (let k = 0; k < count && n < total; k++) put(i); i += px; }
      else for (let k = 0; k < count && n < total; k++) { put(i); i += px; }
    }
    if (px === 4 && !anyAlpha) for (let k = 3; k < rgba.length; k += 4) rgba[k] = 255;   // alpha left empty: show it opaque
    return { w, h: hgt, rgba };
  }

  // A <div> that shows Client/Char/<file> once loaded (ctx.clientFile), or nothing when there is no such picture.
  const cache = new Map();
  function picture(ctx, file, cls = '') {
    const box = h('div.tga-pic' + cls);
    if (!file || !ctx.clientFile) return box;
    const key = file.toLowerCase();
    if (!cache.has(key)) cache.set(key, ctx.clientFile('Char/' + file).then(decode).catch(() => null));
    cache.get(key).then(img => {
      if (!img) return;
      const c = h('canvas', { width: img.w, height: img.h, title: file });
      c.getContext('2d').putImageData(new ImageData(img.rgba, img.w, img.h), 0, 0);
      box.appendChild(c);
    });
    return box;
  }

  FRE.tga = { decode, picture };
})(globalThis.FRE = globalThis.FRE || {});
