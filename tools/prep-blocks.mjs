#!/usr/bin/env node
/* ============================================================================
   prep-blocks — make a delivered block meet the section's export contract.

   The blocks arrive as three anonymous <path>s with baked fills. Spec 3.1
   wants the faces named so they can be animated apart (the fold-together is
   the section's signature moment) and 3.2 wants the fills on CSS variables so
   a depth tier can retint them. Rather than send the art back for a re-export,
   this adds both, mechanically:

     - the three faces get id="top" / "left" / "right"
     - each fill becomes var(--blk-<face>, <the colour that was already there>)

   GEOMETRY IS NEVER TOUCHED. The delivered colours survive as the fallbacks,
   so a file that has been through this renders identically to the one that
   went in — until something sets a variable, which is the entire point.

   Faces are identified by position, not by document order: the top face is the
   one sitting highest, and of the remaining two the left is the one further
   left. Fill brightness is checked against that independently and the tool
   refuses the file if the two disagree, because a silent mislabel would send
   the top face sliding in sideways.

   Re-running is safe: a file that already carries the ids is left alone.

   Usage:
     node tools/prep-blocks.mjs public/img/master_block.svg [...]
     node tools/prep-blocks.mjs --manifest public/img/master_block.svg
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

function vertices(d) {
  const pts = [];
  const re = /([MLHVmlhv])([^MLHVZmlhvz]*)/g;
  let m, cx = 0, cy = 0;
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const n = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    if (cmd.toUpperCase() === 'H') for (const v of n) { cx = rel ? cx + v : v; pts.push([cx, cy]); }
    else if (cmd.toUpperCase() === 'V') for (const v of n) { cy = rel ? cy + v : v; pts.push([cx, cy]); }
    else for (let i = 0; i + 1 < n.length; i += 2) {
      cx = rel ? cx + n[i] : n[i]; cy = rel ? cy + n[i + 1] : n[i + 1]; pts.push([cx, cy]);
    }
  }
  return pts;
}

/* These paths close by repeating their first vertex before Z. Averaged raw,
   that duplicate pulls the centroid toward one corner — on the master block it
   moved the top face's centre 55px and put the mascot off the middle of the
   face. So the ring is closed before it is averaged. */
const dedupe = p => {
  const q = p.filter((v, i) => i === 0 || v[0] !== p[i-1][0] || v[1] !== p[i-1][1]);
  const f = q[0], l = q[q.length - 1];
  if (q.length > 1 && f[0] === l[0] && f[1] === l[1]) q.pop();
  return q;
};
const centroid = p0 => { const p = dedupe(p0);
  return [p.reduce((a, v) => a + v[0], 0) / p.length,
          p.reduce((a, v) => a + v[1], 0) / p.length]; };
const luma = hex => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return .2126 * ((n >> 16) & 255) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255);
};
const r3 = n => Math.round(n * 1000) / 1000;

function prep(file, manifestOnly) {
  let svg = readFileSync(file, 'utf8');
  const name = basename(file);

  const paths = [...svg.matchAll(/<path\b[^>]*>/gi)].map(m => m[0]);
  if (paths.length < 3) { console.error(`${name}: expected 3 faces, found ${paths.length}`); return null; }

  const faces = paths.slice(0, 3).map(tag => {
    const d = (tag.match(/\bd=["']([^"']+)["']/i) || [])[1] || '';
    const fill = (tag.match(/\bfill=["'](#[0-9a-f]{3,8})["']/i) || [])[1] || '#000';
    const pts = vertices(d);
    return { tag, d, fill, pts, c: centroid(pts) };
  });

  /* Highest centroid is the cap; of the other two, the further left is left. */
  const byY = [...faces].sort((a, b) => a.c[1] - b.c[1]);
  const top = byY[0];
  const sides = faces.filter(f => f !== top).sort((a, b) => a.c[0] - b.c[0]);
  const role = new Map([[top, 'top'], [sides[0], 'left'], [sides[1], 'right']]);

  /* An independent read on the same question. A block is lit from above, so
     the cap is the brightest face; if geometry and light disagree, something
     about this export is not what the tool assumes and guessing would be worse
     than stopping. */
  const brightest = faces.reduce((a, b) => (luma(b.fill) > luma(a.fill) ? b : a));
  if (brightest !== top) {
    console.error(`${name}: the highest face is not the brightest — refusing to guess. ` +
                  `Name the faces in the export instead.`);
    return null;
  }

  const W = Number((svg.match(/\bwidth=["']([\d.]+)["']/i) || [])[1]);
  const H = Number((svg.match(/\bheight=["']([\d.]+)["']/i) || [])[1]);

  /* origin — the front-bottom vertex, the nearest and lowest corner of the
     whole block. Everything in the world positions here.
     ridge  — where a mascot's feet go: the midpoint between the top face's
     centre and its front vertex, so the figure stands a step back from the
     lip rather than on it. */
  const all = faces.flatMap(f => f.pts);
  const origin = all.reduce((a, b) => (b[1] > a[1] ? b : a));
  const topFront = top.pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const ridge = [(top.c[0] + topFront[0]) / 2, (top.c[1] + topFront[1]) / 2];

  if (!manifestOnly && !/\bid=["'](top|left|right)["']/i.test(svg)) {
    for (const f of faces) {
      const id = role.get(f);
      const withId = f.tag.replace(/<path\b/i, `<path id="${id}"`)
                          .replace(/\bfill=["']#[0-9a-f]{3,8}["']/i,
                                   `fill="var(--blk-${id}, ${f.fill})"`);
      svg = svg.replace(f.tag, withId);
    }
    writeFileSync(file, svg);
    console.log(`${name}: named top/left/right, fills on variables`);
  } else if (!manifestOnly) {
    console.log(`${name}: already prepared, left alone`);
  }

  return { name, W, H,
           origin: [r3(origin[0] / W), r3(origin[1] / H)],
           ridge:  [r3(ridge[0] / W),  r3(ridge[1] / H)] };
}

const args = process.argv.slice(2);
const manifestOnly = args.includes('--manifest');
const files = args.filter(a => !a.startsWith('--'));
if (!files.length) { console.error('usage: node tools/prep-blocks.mjs <block.svg> [...]'); process.exit(1); }

const out = files.map(f => prep(f, manifestOnly)).filter(Boolean);
console.log('\n--- BLOCKS manifest ---\n');
for (const m of out) {
  console.log(`  { src:'${m.name}', nw:${m.W}, nh:${m.H}, ` +
              `origin:{x:${m.origin[0]},y:${m.origin[1]}}, ridge:{x:${m.ridge[0]},y:${m.ridge[1]}} },`);
}
console.log();
