/* Normalise one or more sprite sheets onto a strict, SHARED uniform grid.
 *
 * Two problems, and the second is why this takes a list rather than one file.
 *
 * 1. Sheets rendered by an image model are not laid out by a machine that knows
 *    what a sprite sheet is. The figures land approximately on a grid, and
 *    approximately is fatal: the moonwalk sheet has row pitches of 271, 251 and
 *    234px, so a CSS window stepping by a fixed fraction shows part of the
 *    intended frame plus the feet of the one above it.
 *
 * 2. Two sheets of the same character are not drawn at the same size. The vibe
 *    figures are 428px tall and the moonwalk's are 208 — the same character,
 *    rendered about twice as large. Normalised independently they would each be
 *    correct and the mascot would still double in size the moment it switched
 *    states. So every sheet passed in one run is scaled to a COMMON standing
 *    height and drawn into a COMMON cell.
 *
 * Standing height is taken as each sheet's shortest figure, which is its most
 * compact pose. Within a sheet figures keep their relative scale: a raised arm
 * should make a frame taller, and flattening heights would squash exactly the
 * poses that need the room.
 *
 *   node tools/normalize-sprite.mjs <outdir> <in.png:COLSxROWS> [more...]
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

const [, , OUTDIR, ...SPECS] = process.argv;
if (!OUTDIR || !SPECS.length) {
  console.error('usage: normalize-sprite.mjs <outdir> <in.png:COLSxROWS> [more...]');
  process.exit(1);
}
const sheets = SPECS.map(spec => {
  const m = spec.match(/^(.*):(\d+)x(\d+)$/);
  if (!m) { console.error(`bad spec: ${spec}`); process.exit(1); }
  return { path: m[1], cols: +m[2], rows: +m[3],
           uri: 'data:image/png;base64,' + readFileSync(m[1]).toString('base64') };
});

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();

const out = await page.evaluate(async (input) => {
  const A = 30;
  const measure = async ({ uri, cols, rows }) => {
    const img = new Image(); img.src = uri; await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const at = (X, Y) => d[(Y * img.width + X) * 4 + 3] > A;
    const bandsOf = (n, has) => {
      const o = []; let s = null;
      for (let i = 0; i < n; i++) {
        if (has(i) && s === null) s = i;
        else if (!has(i) && s !== null) { o.push([s, i - 1]); s = null; }
      }
      if (s !== null) o.push([s, n - 1]);
      return o;
    };
    /* Occupancy per row and per column, which both strategies below read. */
    const occRow = [], occCol = [];
    for (let y = 0; y < img.height; y++) { let n = 0; for (let X = 0; X < img.width; X++) if (at(X, y)) n++; occRow.push(n); }
    for (let X = 0; X < img.width; X++) { let n = 0; for (let y = 0; y < img.height; y++) if (at(X, y)) n++; occCol.push(n); }

    /* Preferred: figures separated by genuinely empty gutters. */
    let rb = bandsOf(img.height, y => occRow[y] > 0);
    let cb = bandsOf(img.width,  X => occCol[X] > 0);

    /* Fallback: figures that TOUCH. The moonwalk-only sheet packs eight across
       1536 at a 192px pitch and neighbouring shoes overlap by a few pixels, so
       there is no empty column to split on and band detection merges three
       figures into one. But the sheet is still on a grid — the occupancy
       minima land within six pixels of every expected boundary, at zero to
       fifteen pixels of overlap. So when the strict pass misses the expected
       count, split at the quietest column near each nominal boundary instead
       of giving up. A few pixels of a neighbour's toe get clipped; that is the
       correct trade against not reading the sheet at all. */
    const splitEvenly = (n, count, occ) => {
      const pitch = n / count, cuts = [0];
      for (let i = 1; i < count; i++) {
        const c0 = Math.round(i * pitch);
        let best = c0, bv = Infinity;
        for (let dx = -Math.round(pitch * 0.25); dx <= Math.round(pitch * 0.25); dx++) {
          const X = c0 + dx;
          if (X <= cuts[cuts.length - 1] + 1 || X >= n) continue;
          if (occ[X] < bv) { bv = occ[X]; best = X; }
        }
        cuts.push(best);
      }
      cuts.push(n);
      return cuts.slice(0, -1).map((s2, i) => [s2, cuts[i + 1] - 1]);
    };
    if (cb.length !== cols) cb = splitEvenly(img.width, cols, occCol);
    if (rb.length !== rows) rb = splitEvenly(img.height, rows, occRow);
    if (rb.length !== rows || cb.length !== cols) {
      return { error: `${cb.length} x ${rb.length} figures, expected ${cols} x ${rows}` };
    }
    const cells = [];
    for (const [y0, y1] of rb) for (const [x0, x1] of cb) {
      let minX = x1, maxX = x0, minY = y1, maxY = y0, any = false;
      for (let y = y0; y <= y1; y++) for (let X = x0; X <= x1; X++) if (at(X, y)) {
        any = true;
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (!any) return { error: 'an empty cell' };
      cells.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
    }
    return { img, cells, cols, rows };
  };

  const measured = [];
  for (const s of input) {
    const m = await measure(s);
    if (m.error) return { error: `${s.path}: ${m.error}` };
    measured.push({ ...m, path: s.path });
  }

  /* The common scale, taken from each sheet's MEDIAN figure height.

     The shortest figure was the first attempt and it is wrong for a cycle. A
     walk's most compressed frame is an outlier, so anchoring on it floated the
     whole sheet up: the moonwalk's median came out at 244 against the vibe's
     212, and the character would have grown 15% the moment it started walking.
     The median is the sheet's typical size, which is the thing that has to
     agree across sheets.

     Head width was tried as a pose-invariant anchor and is not one — on the
     dab sheet it reads an arm thrown across the face as a 30% bigger head. */
  const median = a => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const stands = measured.map(m => median(m.cells.map(c => c.h)));
  const target = Math.min(...stands);
  measured.forEach((m, i) => { m.scale = target / stands[i]; });

  /* One cell for all of them, big enough for the tallest scaled figure. */
  const PAD = 8;
  let need = 0;
  for (const m of measured) for (const c of m.cells) {
    need = Math.max(need, c.w * m.scale, c.h * m.scale);
  }
  const cell = 2 * Math.ceil((need + PAD * 2) / 2);

  const results = [];
  for (const m of measured) {
    const canvas = document.createElement('canvas');
    canvas.width = cell * m.cols; canvas.height = cell * m.rows;
    const cx = canvas.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    m.cells.forEach((c, i) => {
      const w = c.w * m.scale, h = c.h * m.scale;
      const ox = (i % m.cols) * cell + Math.round((cell - w) / 2);
      /* Feet on a common baseline. Feet are the anchor because feet are what
         the eye tracks; centring the box makes the character rise and sink as
         the pose changes shape. */
      const oy = Math.floor(i / m.cols) * cell + (cell - PAD) - h;
      cx.drawImage(m.img, c.x, c.y, c.w, c.h, ox, oy, w, h);
    });
    results.push({
      path: m.path, cols: m.cols, rows: m.rows,
      frames: m.cols * m.rows, scale: +m.scale.toFixed(3),
      stand: median(m.cells.map(c => c.h)),
      sheet: `${canvas.width}x${canvas.height}`,
      webp: canvas.toDataURL('image/webp', 0.92),
    });
  }
  return { cell, target, results };
}, sheets.map(s => ({ uri: s.uri, cols: s.cols, rows: s.rows, path: s.path })));

await browser.close();
if (out.error) { console.error('FAILED:', out.error); process.exit(1); }

console.log(`common cell   ${out.cell}px   (median figure normalised to ${out.target}px)`);
for (const r of out.results) {
  const name = basename(r.path).replace(/\.png$/, '') + '.webp';
  const bytes = Buffer.from(r.webp.split(',')[1], 'base64');
  writeFileSync(join(OUTDIR, name), bytes);
  console.log(`  ${basename(r.path).padEnd(28)} ${r.cols}x${r.rows} ${String(r.frames).padStart(2)}f  ` +
    `stand ${String(r.stand).padStart(3)} -> scale ${r.scale}  ${r.sheet}  ` +
    `${(bytes.length / 1024).toFixed(0)} KB  ->  ${name}`);
}
