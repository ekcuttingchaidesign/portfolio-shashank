#!/usr/bin/env node
/* ============================================================================
   measure-mascots — where a mascot's feet actually are.

   The three figures are delivered on canvases with different amounts of empty
   space around them, and they are not centred in it. Anchoring them at a
   nominal (0.5, 0.96) therefore floats them off the block by as much as a
   quarter of their own height, and sideways by a tenth of their width.

   So it is measured: the alpha bounding box of each file, the widest opaque
   run across the bottom of that box (the footprint), and the content's own
   height — which is what the section normalises on, so a seated figure and a
   standing one read at the same scale on the same plinth. Same reasoning as
   the sprite sheets next door, which are scaled to a common figure height
   rather than to their own boxes.

   Decoding happens in a headless browser for the same reason normalize-sprite
   does it there: it is the one PNG decoder already on this machine.

   Usage:
     node tools/measure-mascots.mjs public/img/iplay.png [...]
   ========================================================================== */

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync } from 'fs';
import { basename } from 'path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/measure-mascots.mjs <mascot.png> [...]');
  process.exit(1);
}

const uris = files.map(f => ({
  name: basename(f),
  uri: 'data:image/png;base64,' + readFileSync(f).toString('base64')
}));

const browser = await chromium.launch();
const page = await browser.newPage();

const out = await page.evaluate(async (list) => {
  const res = [];
  for (const { name, uri } of list) {
    const img = new Image(); img.src = uri; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const A = 12;                                  // anything fainter is a stray edge pixel

    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > A) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }

    /* The footprint, not the bounding box's middle: an arm out to one side
       would drag a centred anchor off the feet. Bottom 8% of the content. */
    let fx0 = 1e9, fx1 = -1;
    for (let y = Math.floor(y1 - (y1 - y0) * .08); y <= y1; y++)
      for (let x = 0; x < c.width; x++)
        if (d[(y * c.width + x) * 4 + 3] > A) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }

    const r = n => Math.round(n * 10000) / 10000;
    res.push({ name, w: c.width, h: c.height,
               contentW: x1 - x0 + 1, contentH: y1 - y0 + 1,
               ax: r((fx0 + fx1) / 2 / c.width),
               ay: r((y1 + 1) / c.height) });
  }
  return res;
}, uris);

await browser.close();

console.log('\n--- MASCOTS manifest (paste into assets/js/outside.js) ---\n');
for (const m of out) {
  console.log(`    '${m.name}': { w: ${m.w}, h: ${m.h}, contentH: ${m.contentH}, ` +
              `ax: ${m.ax}, ay: ${m.ay} },`);
}
console.log('\n  content boxes:');
for (const m of out)
  console.log(`    ${m.name.padEnd(12)} ${m.contentW}x${m.contentH} in ${m.w}x${m.h}` +
              `  (${(100 - m.contentH / m.h * 100).toFixed(0)}% vertical padding)`);
console.log();
