#!/usr/bin/env node
/* ============================================================================
   measure-iso — build-order step 1 of the Outside Work spec.

   "Nothing else starts until this is verified." The travel axis the camera
   moves along has to be the same axis the artwork was drawn on, or the blocks
   slide ACROSS the ground plane instead of THROUGH it — the one failure mode
   the spec calls out as subtle enough to survive to production.

   So this does not eyeball it. It opens the SVG, takes the top face's
   front-right edge, and divides rise by run.

     ratio ~ 0.583  ->  true isometric, 30 degrees
     ratio ~ 0.500  ->  dimetric 2:1, 26.57 degrees

   Usage:
     node tools/measure-iso.mjs public/img/master_block.svg [...more]
   ========================================================================== */

import { readFileSync } from 'node:fs';

/* The two projections the spec recognises, with the axis vector each one
   implies. AX/AY are what the camera multiplies its travel by. */
const CANDIDATES = [
  { name: 'true isometric, 30deg', ratio: 0.5833, AX:  0.8637, AY: -0.5039 },
  { name: 'dimetric 2:1, 26.57deg', ratio: 0.5000, AX:  0.8944, AY: -0.4472 }
];

/* Pull every absolute M/L vertex out of a path's `d`. The block tops are flat
   polygons — no curves — so this is the whole grammar that needs handling. If
   a curve ever shows up the vertex list is still right, it just ignores the
   control points, and a curved "top face" is a different problem anyway. */
function vertices(d) {
  const pts = [];
  const re = /([MLHVmlhv])([^MLHVZmlhvz]*)/g;
  let m, cx = 0, cy = 0;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const n = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    if (cmd.toUpperCase() === 'H') {
      for (const v of n) { cx = rel ? cx + v : v; pts.push([cx, cy]); }
    } else if (cmd.toUpperCase() === 'V') {
      for (const v of n) { cy = rel ? cy + v : v; pts.push([cx, cy]); }
    } else {
      for (let i = 0; i + 1 < n.length; i += 2) {
        cx = rel ? cx + n[i] : n[i];
        cy = rel ? cy + n[i + 1] : n[i + 1];
        pts.push([cx, cy]);
      }
    }
  }
  return pts;
}

/* The top face by preference is the one the export names. Falling back to the
   first path is a guess, and it says so — an unnamed face also means the
   face-by-face assembly in section 8 cannot run, which is worth hearing about
   at the same moment. */
function topFace(svg) {
  const byId = svg.match(/<path[^>]*\bid=["']top["'][^>]*\bd=["']([^"']+)["']/i)
            || svg.match(/<path[^>]*\bd=["']([^"']+)["'][^>]*\bid=["']top["']/i);
  if (byId) return { d: byId[1], named: true };
  const first = svg.match(/<path[^>]*\bd=["']([^"']+)["']/i);
  return first ? { d: first[1], named: false } : null;
}

function measure(file) {
  const svg = readFileSync(file, 'utf8');
  const face = topFace(svg);
  if (!face) return console.error(`${file}: no <path> found`);

  const pts = vertices(face.d);
  if (pts.length < 3) return console.error(`${file}: top face has too few vertices`);

  /* On a rhombus drawn in screen space the front vertex is the lowest point
     and the right vertex is the rightmost. The edge between them is the one
     the spec asks for. */
  const front = pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const right = pts.reduce((a, b) => (b[0] > a[0] ? b : a));

  const run  = right[0] - front[0];
  const rise = front[1] - right[1];
  if (run <= 0 || rise <= 0)
    return console.error(`${file}: front/right vertices are degenerate — is this the top face?`);

  const ratio = rise / run;
  const best = CANDIDATES.reduce((a, b) =>
    Math.abs(b.ratio - ratio) < Math.abs(a.ratio - ratio) ? b : a);
  const off = Math.abs(best.ratio - ratio) / best.ratio;

  console.log(`\n${file}`);
  if (!face.named)
    console.log(`  ! no id="top" — measured the first path instead, and the`);
  if (!face.named)
    console.log(`    face-by-face assembly (spec 8) needs those ids to run.`);
  console.log(`  front vertex   ${front[0].toFixed(2)}, ${front[1].toFixed(2)}`);
  console.log(`  right vertex   ${right[0].toFixed(2)}, ${right[1].toFixed(2)}`);
  console.log(`  rise / run     ${rise.toFixed(2)} / ${run.toFixed(2)} = ${ratio.toFixed(4)}`);
  console.log(`  nearest        ${best.name}  (${(off * 100).toFixed(1)}% off)`);
  if (off > 0.04)
    console.log(`  ! more than 4% off both conventions — check the export before trusting this.`);
  console.log(`\n  export const ISO = { AX: ${best.AX}, AY: ${best.AY} };\n`);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/measure-iso.mjs <block.svg> [...]');
  process.exit(1);
}
files.forEach(measure);
