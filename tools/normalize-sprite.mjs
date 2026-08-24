/* Normalise a sprite sheet onto a strict uniform grid.
 *
 * Sheets rendered by an image model are not laid out by a machine that knows
 * what a sprite sheet is: the figures land approximately on a grid, and
 * "approximately" is fatal. The source for the projectionist has row pitches of
 * 271, 251 and 234px and column pitches between 240 and 262 — so a CSS window
 * stepping by a fixed fraction shows part of the intended frame plus the feet
 * of the one above it.
 *
 * This finds each figure by its alpha, then redraws all of them into cells of
 * one size, centred horizontally and standing on a common baseline. The output
 * is what the CSS assumes it is. Re-run it whenever the sheet is re-exported:
 *
 *   node tools/normalize-sprite.mjs <in.png> <out.png> [cols] [rows]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';

const [, , IN, OUT, COLS = '6', ROWS = '4'] = process.argv;
if (!IN || !OUT) { console.error('usage: normalize-sprite.mjs <in.png> <out.png> [cols] [rows]'); process.exit(1); }

const dataUri = 'data:image/png;base64,' + readFileSync(IN).toString('base64');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();

const result = await page.evaluate(async ({ uri, cols, rows }) => {
  const img = new Image(); img.src = uri; await img.decode();
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  const sx = src.getContext('2d', { willReadFrequently: true });
  sx.drawImage(img, 0, 0);
  const data = sx.getImageData(0, 0, img.width, img.height).data;
  const A = 30;                                  /* alpha floor for "content" */
  const at = (x, y) => data[(y * img.width + x) * 4 + 3] > A;

  /* Runs of rows/columns that contain any pixel at all. */
  const bandsOf = (n, has) => {
    const out = []; let s = null;
    for (let i = 0; i < n; i++) {
      if (has(i) && s === null) s = i;
      else if (!has(i) && s !== null) { out.push([s, i - 1]); s = null; }
    }
    if (s !== null) out.push([s, n - 1]);
    return out;
  };
  const rowBands = bandsOf(img.height, y => { for (let x = 0; x < img.width; x++) if (at(x, y)) return true; return false; });
  const colBands = bandsOf(img.width,  x => { for (let y = 0; y < img.height; y++) if (at(x, y)) return true; return false; });
  if (rowBands.length !== rows || colBands.length !== cols) {
    return { error: `found ${colBands.length} x ${rowBands.length} bands, expected ${cols} x ${rows}` };
  }

  /* Each figure's own box, inside its band intersection. */
  const cells = [];
  for (const [y0, y1] of rowBands) for (const [x0, x1] of colBands) {
    let minX = x1, maxX = x0, minY = y1, maxY = y0, any = false;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y)) {
      any = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    cells.push(any ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null);
  }
  if (cells.some(c => !c)) return { error: 'an empty cell' };

  /* One cell, big enough for the widest and the tallest figure. Figures keep
     their own scale — a raised arm SHOULD make a frame taller, and scaling
     each to a common height would squash exactly the poses that need room. */
  const PAD = 8;
  const maxW = Math.max(...cells.map(c => c.w));
  const maxH = Math.max(...cells.map(c => c.h));
  const cell = 2 * Math.ceil((Math.max(maxW, maxH) + PAD * 2) / 2);

  const out = document.createElement('canvas');
  out.width = cell * cols; out.height = cell * rows;
  const ox = out.getContext('2d');
  cells.forEach((c, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    /* Centred across, standing on a common baseline. Feet are the anchor
       because feet are what the eye tracks; centring the box instead makes
       the character rise and sink as the pose changes shape. */
    const dx = cx + Math.round((cell - c.w) / 2);
    const dy = cy + (cell - PAD) - c.h;
    ox.drawImage(img, c.x, c.y, c.w, c.h, dx, dy, c.w, c.h);
  });

  return {
    cell, cols, rows, sheet: `${out.width}x${out.height}`,
    figures: { maxW, maxH, minH: Math.min(...cells.map(c => c.h)) },
    png: out.toDataURL('image/png'),
    webp: out.toDataURL('image/webp', 0.92),
  };
}, { uri: dataUri, cols: +COLS, rows: +ROWS });

await browser.close();
if (result.error) { console.error('FAILED:', result.error); process.exit(1); }

const write = (uri, path) => {
  const bytes = Buffer.from(uri.split(',')[1], 'base64');
  writeFileSync(path, bytes);
  return bytes.length;
};
const pngSize  = write(result.png,  OUT);
const webpSize = write(result.webp, OUT.replace(/\.png$/, '.webp'));

console.log(`grid      ${result.cols} x ${result.rows}, cell ${result.cell}px -> ${result.sheet}`);
console.log(`figures   widest ${result.figures.maxW}, tallest ${result.figures.maxH}, shortest ${result.figures.minH}`);
console.log(`source    ${(readFileSync(IN).length / 1024).toFixed(0)} KB`);
console.log(`png       ${(pngSize / 1024).toFixed(0)} KB  ${basename(OUT)}`);
console.log(`webp      ${(webpSize / 1024).toFixed(0)} KB  ${basename(OUT).replace(/\.png$/, '.webp')}`);
