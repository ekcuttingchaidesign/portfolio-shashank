/* ============================================================================
   Outside Work — "Ledge World".

   A camera travelling one fixed isometric axis past four stops. Deliberately
   independent of both the landing page's scrub engine and sections.js: it owns
   the stage between the pull-out and the end of the page and never reaches
   into either. The only thing it takes from the landing engine is the
   pull-out's scrub position, and that arrives by being handed to it — see
   window.SX.ledge at the bottom.

   Loop discipline matches the rest of the site: one rAF that parks itself when
   nothing is moving, woken by scroll and resize. Rect is read once at the top
   of render(); nothing inside the node loop touches layout.
   ========================================================================== */

(() => {
  'use strict';

  const sec = document.getElementById('outside-work');
  if (!sec) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage   = sec.querySelector('.lw-stage');
  const world   = sec.querySelector('.lw-world');
  if (!stage || !world) return;

  /* Reduced motion drops the stage entirely — the stack in the markup is the
     section. Nothing below this point needs to run. */
  if (reduced) { sec.dataset.lwMode = 'stack'; return; }

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp   = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ==========================================================================
     1 · THE AXIS
     --------------------------------------------------------------------------
     MEASURED, not assumed. Spec section 2: if the travel axis does not match
     the angle baked into the artwork, blocks slide ACROSS the ground plane
     instead of moving THROUGH it — the failure subtle enough to reach
     production.

     The delivered master block's top face reads 230.70 / 395.95 = 0.5826:
     true isometric, 0.1% off, the same projection the hero's own depth vector
     (+120, -70) already uses. Re-measure after any re-export:

         node tools/measure-iso.mjs public/img/master_block.svg

     and paste the pair it prints here. It is the only line that changes.

       ratio ~0.583  ->  { AX: 0.8637, AY: -0.5039 }   true isometric
       ratio ~0.500  ->  { AX: 0.8944, AY: -0.4472 }   dimetric 2:1
     ====================================================================== */
  const ISO = { AX: 0.8637, AY: -0.5039 };

  /* The top face's rise/run. Derived from ISO rather than written beside it,
     so the contact shadow can never end up lying on a different ground plane
     than the blocks are drawn on. */
  const ISO_RATIO = Math.abs(ISO.AY) / ISO.AX;

  /* ==========================================================================
     2 · BLOCK MANIFEST
     --------------------------------------------------------------------------
     Anchors as fractions of each file's own box, so they survive scaling.
     `origin` is the front-bottom vertex — everything positions there. `ridge`
     is where a mascot's feet land: a step back from the front lip, not on it,
     for the same reason the mascot on the plinth stands 40% down the stage
     rather than at its 47% edge.

     Measured off the delivered art by tools/prep-blocks.mjs, which is also
     what named the faces. Re-run it after any re-export rather than editing
     nw/nh or the anchors by hand — the origin is genuinely not (0.5, 1) on
     these blocks, and eyeballing it puts every block off the ground.
     ====================================================================== */
  const BLOCKS = {
    master: { src: 'master_block.svg', nw: 715, nh: 509, origin: { x: .444, y: .998 }, ridge: { x: .473, y: .608 } },
    amb_1:  { src: 'block_1.svg',      nw: 278, nh: 207, origin: { x: .201, y: 1    }, ridge: { x: .350, y: .569 } },
    amb_2:  { src: 'block_2.svg',      nw: 395, nh: 281, origin: { x: .443, y: .998 }, ridge: { x: .472, y: .608 } },
    amb_3:  { src: 'block_3.svg',      nw: 324, nh: 233, origin: { x: .315, y: .998 }, ridge: { x: .405, y: .591 } },
    amb_4:  { src: 'block_4.svg',      nw:  55, nh:  59, origin: { x: .443, y: 1    }, ridge: { x: .472, y: .403 } }
  };
  const IMG = '../public/img/';

  /* ==========================================================================
     2b · MASCOT MANIFEST
     --------------------------------------------------------------------------
     Measured off the files by tools/measure-mascots.mjs, not assumed. The three
     are delivered on canvases with 4% to 12% vertical padding and the figures
     are not centred in it — the footprints sit at x 0.44, 0.67 and 0.64 — so a
     nominal (0.5, 0.96) anchor floats them off the block and shunts them
     sideways.

     `contentH` is the ink's own height, and the section scales on THAT rather
     than on the canvas, so a seated figure on a couch and a standing one read
     at the same size on the same plinth. It is the reasoning the sprite sheets
     next door already use: a common figure height, never a common box.
     ====================================================================== */
  const MASCOTS = {
    /* `h` is the figure's ink height as a share of the block it stands on,
       measured off each design frame. NOT one shared number: the sprite sheets
       next door normalise to a common figure height because they are the same
       character walking, but here a seated figure on a couch is short BECAUSE
       it is sitting down. Forcing 0.53 on all three shrank both standing
       figures to two thirds of the size the design draws them.

       iplay is then carried past its measured 0.53 on purpose: a couch is
       wider than a person, so matching its ink height left it with less
       presence on its block than the standing figures have on theirs. */
    'iplay.png':  { w: 776, h: 631, contentH: 554, ax: 0.4407, ay: 0.9128, h3: 0.82 },
    'iShoot.png': { w: 701, h: 728, contentH: 698, ax: 0.6683, ay: 0.9712, h3: 0.90 },
    'iMeme.png':  { w: 716, h: 783, contentH: 698, ax: 0.6425, ay: 0.9298, h3: 0.90 }
  };

  const MASCOT_H = 0.62;                 // only for a file with no entry above

  /* ==========================================================================
     3 · DEPTH TIERS
     --------------------------------------------------------------------------
     Parallax and scale live here; the tone treatment lives in CSS on the inner
     .lw-tone element and is written once. Two elements, one property each, so
     depth opacity and entrance opacity can never overwrite one another.
     ====================================================================== */
  const TIER = {
    bg:    { parallax: 0.35, scale: 0.55, float:  7 },
    mid:   { parallax: 0.70, scale: 0.80, float: 11 },
    near:  { parallax: 0.85, scale: 0.92, float: 14 },
    /* The title's slab is stage tier and has nothing standing on it, so it
       drifts too; the station masters are held still by their own flag
       below, not by their tier. */
    stage: { parallax: 1.00, scale: 1.00, float:  9 },
    fg:    { parallax: 1.60, scale: 1.25, float: 16 }
  };

  /* Copy drifts at 0.30x. The axis carries things down and to the left, so the
     left column exits frame first; at full rate the headline would be gone
     while the reader was still on the second line. The mascot runs a touch
     FASTER than the block it stands on — 1.06x — because that sliver of
     differential is what makes it read as standing in the scene rather than
     composited onto it. Below ~0.5px it does nothing, past ~1.15x it detaches. */
  const COPY_PARALLAX   = 0.30;
  const MASCOT_PARALLAX = 1.06;

  /* Everything except the block a mascot is standing on drifts, so the field
     reads as hovering rather than as sitting on an invisible floor. Two
     unequal periods per node and a per-node phase, so nothing pulses in
     unison; amplitude falls with depth because a far object moving as far as
     a near one is a near object. Translation only — rotating an isometric
     block turns its faces off the ground plane, which is the same reason the
     mirrored blocks below had to go. */
  /* Periods of about 4.6s and 6.1s. The first pass ran these at 13s and 10s
     with 2-5px of travel, which works out to one to three pixels a second —
     genuinely animating, and far too slow and too small for anyone to see it.
     A hover has to be perceptible within a glance or it is just a static
     block. Vertical dominates; the horizontal component is a quarter of it,
     there to stop the motion reading as a lift rather than a drift. */
  const FLOAT_A = 0.001366, FLOAT_B = 0.00103, FLOAT_X = 0.28;

  /* ==========================================================================
     4 · THE WORLD
     ====================================================================== */
  const STATIONS = [
    /* Filenames exactly as delivered. Two of the three are camel-cased and
       Pages serves off a case-sensitive filesystem, so 'ishoot.png' is a 404
       there while resolving fine on a Mac. */
    { id: 'play',  t: 0,    master: 'master', mascot: 'iplay.png'  },
    { id: 'click', t: 1450, master: 'master', mascot: 'iShoot.png' },
    { id: 'meme',  t: 2900, master: 'master', mascot: 'iMeme.png'  }
  ];

  /* Hand-placed, not scattered. A seed that reproduces a balanced composition
     costs longer to find than forty entries cost to type, and the compositions
     these come from are already balanced.

     Rules held to: nothing sits in the left third at the moment a station is
     dwelling (that is the copy column); 5-8 blocks near each stop thinning to
     2-3 across the gaps; at most two fg per station, because fg is
     punctuation; no two neighbours share a variant and a flip.

     Retune with ?edit=1 — drag, then press E to print this array back out. */
  const AMBIENT = [
    /* Offsets are in the design's own 1920x1080 units and scale with the
       world. Station one is read off the I play frame; two and three keep its
       tier mix and their own frames' broad placement.

       NO `flip`. Mirroring an isometric block with scaleX(-1) mirrors the
       projection with it: the faces end up lit for the opposite axis and the
       block visibly stops travelling along the same line as everything else.
       Spec §5 offers it "for variety" and it is not variety, it is a block
       facing the wrong way. Variety comes from the four variants and the
       tiers. */

    /* approach to the title */
    { t: -1350, ox:  430, oy: -300, variant: 'amb_3', tier: 'bg'   },
    { t: -1180, ox: -700, oy:  310, variant: 'amb_4', tier: 'bg'   },
    { t: -1010, ox: -760, oy: -280, variant: 'amb_2', tier: 'bg'   },
    { t:  -700, ox: -300, oy:  470, variant: 'amb_4', tier: 'bg'   },
    { t:  -560, ox:  760, oy:  520, variant: 'amb_1', tier: 'near' },
    { t:  -420, ox: -640, oy: -360, variant: 'amb_4', tier: 'bg'   },

    /* the title card's own block — the focal object of that frame, so it
       keeps the full palette the way a station's master does */
    { t:  -900, ox:  474, oy:  315, variant: 'master', tier: 'stage', k: .78 },
    { t:  -900, ox:  641, oy:  -75, variant: 'amb_3',  tier: 'bg'   },
    { t:  -900, ox:  904, oy:  180, variant: 'amb_4',  tier: 'near' },
    { t:  -900, ox:  836, oy:  480, variant: 'amb_2',  tier: 'bg'   },

    /* station 1 — I play, off the design frame */
    { t:  -300, ox:  180, oy: -380, variant: 'amb_3', tier: 'bg'   },
    { t:   -80, ox: -200, oy:  515, variant: 'amb_2', tier: 'near' },
    { t:   -40, ox:  -69, oy:  142, variant: 'amb_3', tier: 'bg'   },
    { t:    40, ox:  862, oy: -110, variant: 'amb_3', tier: 'near' },
    { t:    80, ox:  846, oy:  290, variant: 'amb_3', tier: 'bg'   },
    { t:   120, ox:  805, oy:  470, variant: 'amb_2', tier: 'near' },
    { t:   160, ox:  235, oy:  540, variant: 'amb_4', tier: 'bg'   },
    { t:   320, ox: -420, oy:  260, variant: 'amb_4', tier: 'bg'   },
    { t:   420, ox:  980, oy:  620, variant: 'amb_2', tier: 'fg'   },

    /* the gap */
    { t:   700, ox:  520, oy: -240, variant: 'amb_3', tier: 'bg'   },
    { t:   950, ox: -520, oy:  300, variant: 'amb_4', tier: 'bg'   },
    { t:  1180, ox:  840, oy:  380, variant: 'amb_2', tier: 'mid'  },

    /* station 2 — I click */
    { t:  1300, ox:  200, oy: -380, variant: 'amb_4', tier: 'bg'   },
    { t:  1370, ox: -240, oy:  520, variant: 'amb_2', tier: 'near' },
    { t:  1410, ox:  -90, oy:  150, variant: 'amb_3', tier: 'bg'   },
    { t:  1490, ox:  880, oy: -130, variant: 'amb_3', tier: 'near' },
    { t:  1530, ox:  860, oy:  300, variant: 'amb_3', tier: 'bg'   },
    { t:  1570, ox:  790, oy:  480, variant: 'amb_1', tier: 'near' },
    { t:  1620, ox:  250, oy:  560, variant: 'amb_4', tier: 'bg'   },
    { t:  1790, ox: -440, oy:  270, variant: 'amb_4', tier: 'bg'   },
    { t:  1880, ox:  940, oy:  640, variant: 'amb_2', tier: 'fg'   },

    /* the gap */
    { t:  2150, ox: -760, oy: -300, variant: 'amb_3', tier: 'bg'   },
    { t:  2400, ox:  600, oy:  320, variant: 'amb_4', tier: 'bg'   },
    { t:  2640, ox:  860, oy: -260, variant: 'amb_2', tier: 'mid'  },

    /* station 3 — I meme. Thinner than the other two: this is the last stop
       before the world dissolves, and the field arriving at its densest right
       before it empties reads as clutter rather than as a crescendo. */
    { t:  2830, ox: -210, oy:  505, variant: 'amb_2', tier: 'near' },
    { t:  2870, ox:  -80, oy:  135, variant: 'amb_3', tier: 'bg'   },
    { t:  2950, ox:  870, oy: -120, variant: 'amb_3', tier: 'near' },
    { t:  3030, ox:  800, oy:  490, variant: 'amb_2', tier: 'near' },
    { t:  3080, ox:  240, oy:  550, variant: 'amb_4', tier: 'bg'   },

    /* the thinning — density and tier both drop away, so the world dissolves
       rather than stopping. Nothing at all past 4100, and nothing standing at
       the end: the closing block that used to drift in past "Say hello." is
       gone, so the last thing on the page is the line itself. */
    { t:  3520, ox:  560, oy: -200, variant: 'amb_3', tier: 'mid'  },
    { t:  3700, ox: -500, oy:  280, variant: 'amb_4', tier: 'bg'   },
    { t:  3880, ox:  780, oy:  340, variant: 'amb_3', tier: 'bg'   },
    { t:  4060, ox:  360, oy: -150, variant: 'amb_4', tier: 'bg'   }
  ];



  /* ==========================================================================
     5 · CAMERA
     --------------------------------------------------------------------------
     Fractions of the section's own travel, so the 720vh in the CSS re-times
     everything at once. easeInOutQuad between adjacent keys; the paired keys
     are the dwells.
     ====================================================================== */
  const KEYS = [
    [0.00, -1600],
    [0.07,  -900],   // title arrives
    [0.16,  -900],   // dwell
    [0.26,     0],   // I play
    [0.38,     0],
    [0.50,  1450],   // I click
    [0.62,  1450],
    [0.74,  2900],   // I meme
    [0.86,  2900],
    [1.00,  4300]    // exit
  ];

  const easeInOutQuad = k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  function camAt(p) {
    if (p <= KEYS[0][0]) return KEYS[0][1];
    for (let i = 1; i < KEYS.length; i++) {
      if (p <= KEYS[i][0]) {
        const [p0, t0] = KEYS[i - 1], [p1, t1] = KEYS[i];
        if (p1 === p0) return t1;
        return t0 + (t1 - t0) * easeInOutQuad((p - p0) / (p1 - p0));
      }
    }
    return KEYS[KEYS.length - 1][1];
  }

  /* ==========================================================================
     6 · SVG LOADER
     --------------------------------------------------------------------------
     Each variant is fetched once and cloned from a cached template. An <img>
     could not do this job at all: its faces cannot be targeted, cannot be
     recoloured by a CSS variable, and cannot animate independently, and the
     face-by-face assembly needs all three.
     ====================================================================== */
  const cache = new Map();
  let placeholderWarned = false;

  function loadBlock(key) {
    const b = BLOCKS[key];
    if (!b) return Promise.reject(new Error('unknown block ' + key));
    if (cache.has(key)) return cache.get(key);
    const p = fetch(IMG + b.src)
      .then(r => { if (!r.ok) throw new Error(r.status + ' ' + b.src); return r.text(); })
      .then(txt => {
        const tpl = document.createElement('template');
        tpl.innerHTML = txt.trim();
        const svg = tpl.content.querySelector('svg');
        if (!svg) throw new Error('no <svg> in ' + b.src);
        /* Stand-ins say so, once, rather than shipping quietly as if they were
           the delivered art. */
        if (svg.hasAttribute('data-placeholder') && !placeholderWarned) {
          placeholderWarned = true;
          console.warn('[outside-work] placeholder block art is in use — see docs/outside-work.md');
          sec.dataset.lwPlaceholder = '1';
        }
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        return svg;
      });
    cache.set(key, p);
    return p;
  }

  /* ==========================================================================
     7 · NODES
     ====================================================================== */
  const nodes = [];

  function makeNode(spec) {
    const el = document.createElement('div');
    el.className = 'lw-node' + (spec.kind ? ' lw-' + spec.kind : '');
    const tone = document.createElement('div');
    tone.className = 'lw-tone';
    tone.dataset.tier = spec.tier;
    el.appendChild(tone);
    world.appendChild(el);
    const n = Object.assign({ el, tone, kind: 'block', ox: 0, oy: 0, delay: 0,
                             phase: nodes.length * 1.618 }, spec);
    nodes.push(n);
    return n;
  }

  /* Blocks */
  function addBlock(spec) {
    const n = makeNode(spec);
    loadBlock(spec.variant).then(svg => {
      const c = svg.cloneNode(true);
      n.tone.appendChild(c);
      n.svg = c;
      /* The three faces, if the export named them. Without the ids the
         assembly degrades to a whole-block rise — which is the documented
         fallback, and a reason to fix the export rather than the code. */
      n.faces = {
        top:   c.querySelector('#top'),
        left:  c.querySelector('#left'),
        right: c.querySelector('#right')
      };
      n.assembles = !!(spec.assemble && n.faces.top && n.faces.left && n.faces.right);
      if (spec.assemble && !n.assembles && !makeNode._warned) {
        makeNode._warned = true;
        console.warn('[outside-work] master block has no #top/#left/#right — falling back to a whole-block rise');
      }
      request();
    }).catch(err => console.warn('[outside-work]', err.message));
    return n;
  }

  /* Mascots. The art may not be here yet; a missing file marks the node rather
     than leaving a broken image in the scene. */
  function addMascot(spec) {
    const n = makeNode(spec);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = IMG + spec.file;
    img.addEventListener('load', request);
    img.addEventListener('error', () => {
      n.el.dataset.missing = '1';
      console.warn('[outside-work] missing mascot art: ' + spec.file);
    });
    n.tone.appendChild(img);
    n.img = img;
    return n;
  }

  /* The contact shadow, drawn rather than baked: the block palette will move
     again and a shadow baked into a PNG would fight it. */
  function addShadow(spec) {
    const n = makeNode(Object.assign({ kind: 'shadow' }, spec));
    const s = document.createElement('div');
    s.className = 'lw-shadow';
    n.tone.appendChild(s);
    n.shadow = s;
    return n;
  }

  /* Build the world. Ambient first so the masters paint over them at equal
     tier, and the fg tier last of all. */
  /* The quiet blocks have always been there; the loud ones arrive.

     Spec §8 gives the whole ambient field a wide 1400 window so it fades up
     from far off rather than popping in — right for the dark bg and mid slabs,
     wrong for the bright stage-tier ones. At 1400 a stage block is 90% opaque
     while still 820 units out, and since the design frames were each composed
     on their own, one of station one's bright slabs was arriving at full
     strength on top of the title card's block and reading as a single broken
     stepped solid. The two share a path down the axis and no coordinate fixes
     that; the loud ones simply have to arrive nearer their own stop. */
  const AMB_WIN = { bg: 1400, mid: 1400, near: 620, stage: 620, fg: 620 };
  AMBIENT.forEach((a, i) => addBlock(
    Object.assign({ kind: 'block', win: AMB_WIN[a.tier] || 1400, ai: i }, a)));

  STATIONS.forEach(st => {
    const m = BLOCKS[st.master];
    addShadow({ t: st.t, ox: 280, oy: 40, tier: 'stage', station: st.id, delay: .12, master: m });
    addBlock({ t: st.t, ox: 280, oy: 40, tier: 'stage', variant: st.master,
               station: st.id, assemble: true, win: 520, delay: 0 });
    addMascot({ t: st.t, ox: 280, oy: 40, tier: 'stage', kind: 'mascot',
                file: st.mascot, station: st.id, delay: .12, win: 520, master: m });
  });

  /* §11 has a figure riding the closing block. It is NOT drawn here:
     mascot_say_hi.png belongs to the Say hello section, which is its own
     build, and borrowing it would pre-empt that design. The block drifts in
     bare and the plaque carries the beat until Say hello absorbs this stop. */
  /* The copy, the title and the exit are already in the document — they are
     real text in source order and nothing may exist only inside the traversal.
     JS only drives their drift and their fade. They are positioned by CSS so
     the gutter stays responsive; the transform carries the parallax alone. */
  /* ==========================================================================
     THE TITLE'S SPRING
     --------------------------------------------------------------------------
     The entrance is scrubbed — it has to be, or scrolling up would not play it
     backwards — so a time-based Motion animation cannot drive it directly.
     What Motion CAN give is the curve: `spring()` is sampled once across its
     own settling time and baked into a lookup, and the scrub then rides real
     spring physics instead of a cubic. Overshoots to ~1.08 and settles, which
     is what makes the words arrive with weight rather than just sliding.

     Falls back to a back-ease with a comparable overshoot if the library did
     not load, for the same reason everything else here does: the page never
     depends on it. */
  const SPRING = (() => {
    const N = 160, lut = new Float32Array(N + 1);
    const M = window.Motion;
    if (M && typeof M.spring === 'function') {
      try {
        const gen = M.spring({ keyframes: [0, 1], stiffness: 190, damping: 17, mass: 1 });
        let settle = 0;
        for (let t = 0; t <= 4000; t += 10) { if (gen.next(t).done) { settle = t; break; } }
        if (!settle) settle = 900;
        const g2 = M.spring({ keyframes: [0, 1], stiffness: 190, damping: 17, mass: 1 });
        for (let i = 0; i <= N; i++) lut[i] = g2.next((i / N) * settle).value;
        return k => lut[Math.round(clamp01(k) * N)];
      } catch (e) { /* fall through */ }
    }
    const c1 = 1.70158, c3 = c1 + 1;
    return k => { const x = clamp01(k); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  })();

  const titleEl = sec.querySelector('.lw-title');

  /* Words, not lines. Each one is its own token so they can arrive on a
     stagger — the flourish is in six things landing in sequence, not in one
     block of type sliding. Split from JS so the markup stays plain text. */
  const titleTokens = (() => {
    if (!titleEl) return [];
    const serif = titleEl.querySelector('.lw-serif');
    if (serif && !serif.querySelector('.lw-w')) {
      serif.innerHTML = serif.textContent.trim().split(/\s+/)
        .map(w => `<span class="lw-w">${w}</span>`).join(' ');
    }
    return [...titleEl.querySelectorAll('.lw-w, .lw-num, .lw-to')];
  })();

  /* Stitch the per-word gradients back into one sweep: each word gets the
     line's full width as its background-size and is offset by its own left
     edge, so the ramp continues across the gaps instead of restarting at every
     word. Re-run on resize and once the webfont has actually landed, since
     both change where the words sit. */
  function paintTitleGradient() {
    if (!titleEl) return;
    const serif = titleEl.querySelector('.lw-serif');
    if (!serif) return;
    const lineW = serif.offsetWidth;
    if (!lineW) return;
    serif.querySelectorAll('.lw-w').forEach(el => {
      el.style.backgroundSize = lineW + 'px 100%';
      el.style.backgroundPosition = (-el.offsetLeft) + 'px 0';
    });
  }
  paintTitleGradient();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintTitleGradient);
  const exitEl  = sec.querySelector('.lw-exit');
  const copyEls = [...sec.querySelectorAll('.lw-copy')].map(el => ({
    el, t: STATIONS.find(s => s.id === el.dataset.station)?.t ?? 0
  }));

  /* ==========================================================================
     8 · GEOMETRY
     ====================================================================== */
  let vw = innerWidth, vh = innerHeight;
  let worldScale = 1, spacing = 1, dropFg = false, thinAmbient = false;

  /* The design frames are authored at 1920x1080 and the blocks are drawn 1:1
     into them — the master's 715px natural width IS 715px on that canvas, 37%
     of the frame. So the world scales off 1920, not off 1. Held at 1.0 the
     same block ate 50% of a 1440 window, which is a different composition
     wearing the same numbers. */
  const REF_W = 1920;

  /* Where a station's block sits relative to the middle of the frame. Beside
     the copy on a desktop; BELOW it on a phone, which is the whole of the
     spec's "copy moves above the master block rather than beside it" — at
     390px the two were simply landing on top of one another.

     Read off the design frame rather than off the spec: the master block's
     front-bottom vertex sits at (1345, 925) on a 1920x1080 canvas whose centre
     is (960, 540). Both numbers are therefore in design units and get scaled
     with the rest of the world. The spec's +280/+40 predates the artwork. */
  let stOx = 385, stOy = 385;

  /* The phone is not the desktop world shrunk. It is the same world at 0.62
     with the fg tier gone — punctuation that covers the copy on a 390px screen
     is just an obstruction — and the stops pulled closer so the gaps stay
     under half a viewport. One breakpoint, agreed with outside.css. */
  function measure() {
    vw = innerWidth; vh = innerHeight;
    const phone = vw <= 720;
    /* Floors and a ceiling so a narrow laptop does not get a toy world and a
       5K display does not get a wall. The phone runs the world hotter than the
       pure ratio would — at 390 that is 0.20, which is unreadable — but cooler
       than the desktop, which is what the spec's 0.62 was reaching for. */
    worldScale = phone ? clamp(vw / REF_W * 1.9, .30, .50)
                       : clamp(vw / REF_W,       .55, 1.15);
    spacing    = phone ? 900 / 1450 : 1;
    dropFg     = phone;
    thinAmbient = phone;
    stOx = phone ? 0   : 385;
    /* Phone stacks copy over block, so the block has to clear the TALLEST
       copy — I click runs three lines plus a pill, where I play is two lines
       and no pill. Set for the tall one; the short one just gets more air. */
    stOy = phone ? 480 : 385;
  }
  measure();

  /* ==========================================================================
     9 · ENTRANCE
     --------------------------------------------------------------------------
     A pure function of camera distance, never of time and never of an
     observer. That is what lets scrolling UP play every entrance backwards:
     an IntersectionObserver plus a transition works perfectly until someone
     scrolls back, at which point elements are stuck visible or replay at the
     wrong moment.
     ====================================================================== */
  function entrance(node, camT) {
    const win = (node.win || 520) * spacing;
    const raw = 1 - clamp(((node.t * spacing - camT) - 160 * spacing) / win, 0, 1);
    const k   = clamp((raw - node.delay) / (1 - node.delay), 0, 1);
    return 1 - Math.pow(1 - k, 3);          // easeOutCubic
  }

  /* Faces slide in from the direction they face, so the block folds together
     rather than appearing. Ambient blocks deliberately do not get this: if
     everything assembles, nothing reads as special. */
  /* Section 11: after the last station the field thins to nothing across
     roughly 900 world units, so the world DISSOLVES rather than stopping.
     Entrance cannot do this on its own — it counts up as the camera arrives
     and never counts back down once the camera is past — so the exit needs its
     own factor. Still a pure function of camera position, so it reverses on
     the way back up like everything else. The one block the spec leaves
     standing at the end is exempt. */
  const DISSOLVE_FROM = 3400, DISSOLVE_TO = 4300;

  /* Entrance counts up as the camera arrives and never counts back down, so a
     block placed for one station was still sitting there two stations later —
     one of station one's slabs was covering 39% of station two's copy, which
     is exactly what spec §6 forbids and is not fixable by nudging its
     coordinates, because the offence only exists at the far station.

     So the band is symmetric: a block fades out once it is well behind the
     camera, over the same kind of window it faded in on. Still a pure function
     of camera distance, so it reverses on the way back up like everything
     else, and it keeps the ambient field from silting up in front of the
     copy. Gone by 1200 behind — well before the next stop, which is 1450 on. */
  const TRAIL_KEEP = 700, TRAIL_FADE = 500;

  const FACE_DELAY = { top: 0, left: .05, right: .10 };
  const FACE_FROM  = { top: [0, -40], left: [-26, 0], right: [26, 0] };

  /* ==========================================================================
     10 · RENDER
     ====================================================================== */
  let rafId = 0, running = false, reveal = 0, ledgeSeen = false;

  /* The float is the only thing here that moves without the scroll moving, so
     it is the only reason the loop cannot park. It runs while the section is
     on screen and stops the moment it is not — an idle page still costs
     nothing. `data-lw-still` freezes it, which is what lets the reversibility
     check compare transforms at a scroll position rather than at an instant. */
  let onScreen = false;
  /* A query param, not an attribute: outside.js is deferred, so it reads this
     before DOMContentLoaded and anything setting an attribute on that event
     would be too late to be seen. ?still=1 also gives a way to look at a
     composition without it drifting under you. */
  const still = new URLSearchParams(location.search).get('still') === '1';

  /* One write, for the whole stage. Ground, glow, world and copy come up
     together — a world whose blocks are already solid over a film that is
     still playing does not read as rising out of it.

     Cleared entirely at full strength rather than set to 1: opacity below 1 on
     a sticky element this size forces an offscreen composite every frame, and
     the traversal proper spends all of its time at 1. */
  function setReveal(r) {
    reveal = r;
    stage.style.opacity = r >= .999 ? '' : r.toFixed(3);

    /* A pinned stage still covering the window at opacity 0 would swallow
       pointer events above the section, so it is taken out of the page
       entirely until it has something to show. */
    stage.style.visibility = r <= .001 ? 'hidden' : '';
    /* Published as well as applied. The number is the section's state — worth
       being able to read off the element in devtools and to hang a CSS rule on
       later — and keeping one function as the only writer is what stops the
       two from ever disagreeing. */
    sec.style.setProperty('--lw-reveal', r.toFixed(3));
  }

  function request() {
    if (!running) { running = true; rafId = requestAnimationFrame(render); }
  }

  function render() {
    running = false;
    const now = performance.now();

    /* Layout is read exactly once, here. Nothing in the loop below touches it. */
    const rect   = sec.getBoundingClientRect();
    const travel = rect.height - vh;
    const p = travel <= 0 ? (rect.top <= 0 ? 1 : 0) : clamp01(-rect.top / travel);

    /* The reveal normally arrives from the landing engine, which is the only
       thing that knows where the film is. If it never calls — the engine is
       absent, or its loop is not running — the ground, the glow and the title
       would all stay keyed to 0 and the section would simply never appear. So
       when nothing has handed us a position, derive one from the section's own
       rect: it rises as it enters instead of staying dark. A fallback, not a
       second source of truth — the first real call takes over for good. */
    if (!ledgeSeen) {
      const r = clamp01((vh - rect.top) / (vh * .6));
      if (r !== reveal) setReveal(r);
    }

    /* Every distance below lives in the SAME space as the node positions,
       which are t * spacing. camAt returns raw key-frame t, so it has to be
       scaled too — without this the camera on a phone stops 550 units short of
       the stations it is aiming at, and two of them dwell on screen at once,
       copy and mascots overlapping. Every threshold in this function scales
       with it for the same reason. On desktop spacing is 1 and none of it
       does anything. */
    const camT = camAt(p) * spacing;
    const cx = vw * .5, cy = vh * .5;
    const dissolve = 1 - clamp01((camT - DISSOLVE_FROM * spacing) /
                                 ((DISSOLVE_TO - DISSOLVE_FROM) * spacing));

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const tier = TIER[n.tier];

      if (dropFg && n.tier === 'fg') { n.el.dataset.culled = '1'; continue; }
      /* Half the ambient field on a phone: the same density on a third of the
         width is not the same picture, it is a wall. */
      if (thinAmbient && n.ai !== undefined && (n.ai % 2)) { n.el.dataset.culled = '1'; continue; }

      const nox = n.station ? stOx : n.ox;
      const noy = n.station ? stOy : n.oy;

      const d = (n.t * spacing - camT) * tier.parallax;
      let x = cx + d * ISO.AX * worldScale + nox * worldScale;
      let y = cy + d * ISO.AY * worldScale + noy * worldScale;

      /* Paint is the real cost once there are a hundred inline SVGs, so
         anything well outside the frame stops painting altogether. */
      if (x < -1400 || x > vw + 1400 || y < -1400 || y > vh + 1400) {
        if (!n.culled) { n.culled = true; n.el.dataset.culled = '1'; }
        continue;
      }
      if (n.culled) { n.culled = false; delete n.el.dataset.culled; }

      const behind = camT - n.t * spacing;
      const trail = n.last ? 1 : 1 - clamp01((behind - TRAIL_KEEP * spacing) / (TRAIL_FADE * spacing));
      const e = entrance(n, camT) * trail * (n.last ? 1 : dissolve);
      let sc = tier.scale * worldScale * (n.k || 1);

      const b = BLOCKS[n.variant];

      if (n.kind === 'mascot' || n.kind === 'shadow') {
        /* Both hang off the master block's ridge, not its centre — feet on the
           front ridge line is the difference between standing on the block and
           floating over it. The mascot's own anchor is its soles. */
        const m = n.master;
        const bw = m.nw * TIER.stage.scale * worldScale;
        const bh = m.nh * TIER.stage.scale * worldScale;
        if (!m.ridge) continue;                    // nothing to stand on
        const dM = (n.t * spacing - camT) *
                   (n.kind === 'mascot' ? MASCOT_PARALLAX : TIER.stage.parallax);
        x = cx + dM * ISO.AX * worldScale + nox * worldScale
              + (m.ridge.x - m.origin.x) * bw;
        y = cy + dM * ISO.AY * worldScale + noy * worldScale
              + (m.ridge.y - m.origin.y) * bh;

        if (n.kind === 'shadow') {
          /* A rhombus matching the ground plane, built from a square: rotate
             45deg and the diagonals become the axes, then squash the vertical
             one to the projection's ratio. Side = W/sqrt(2) so the horizontal
             diagonal comes out at W. */
          const w = bw * .34, side = w / Math.SQRT2;
          if (n.lastW !== side) {
            n.shadow.style.width  = side + 'px';
            n.shadow.style.height = side + 'px';
            n.shadow.style.transform = `rotate(45deg) scaleY(${ISO_RATIO.toFixed(4)})`;
            n.lastW = side;
          }
          n.el.style.transform =
            `translate3d(${(x - side / 2).toFixed(1)}px,${(y - side / 2).toFixed(1)}px,0)`;
          n.el.style.opacity = (e * .30).toFixed(3);
          continue;
        }

        /* Anchored on the measured footprint, so a named point of the artwork
           lands on a named point of the world — which is the whole purpose of
           the ridge maths above. Scaled on the ink's height, not the canvas's,
           so the padding around each figure cannot change how big it looks. */
        const M = MASCOTS[n.file];
        const k  = M ? (bh * M.h3) / M.contentH : (bh * MASCOT_H) / 600;
        const mw = (M ? M.w : 240) * k;
        const mh = (M ? M.h : 320) * k;
        if (n.lastW !== mw) { n.el.style.width = mw + 'px'; n.lastW = mw; }
        n.el.style.transform =
          `translate3d(${(x - (M ? M.ax : .5) * mw).toFixed(1)}px,` +
          `${(y - (M ? M.ay : .96) * mh).toFixed(1)}px,0)` +
          ` translateY(${((1 - e) * 18).toFixed(1)}px)`;
        n.el.style.opacity = e.toFixed(3);
        continue;
      }

      /* Blocks. Position by the origin anchor — the nearest, lowest corner —
         so a taller block grows upward out of the same point on the ground. */
      const w = (b ? b.nw : 0) * sc;
      const h = (b ? b.nh : 0) * sc;
      const px = x - (b ? b.origin.x : .5) * w;
      const py = y - (b ? b.origin.y : 1) * h;

      /* The drift. Two unequal periods so a node never returns to the same
         place on a beat, and a phase from its own index so the field does not
         pulse together. The block a mascot stands on does not move: a figure
         bobbing on its own plinth reads as a mistake, not as weightlessness. */
      /* Anything a mascot stands on is pinned. `assemble` marks exactly the
         station masters, so the flag is the same one that decides which block
         folds itself together — there is only ever one kind of block with a
         figure on it. */
      const fa = (still || n.assemble) ? 0 : (tier.float || 0) * worldScale;
      const fx = fa ? Math.cos(now * FLOAT_B + n.phase * 1.7) * fa * FLOAT_X : 0;
      const fy = fa ? Math.sin(now * FLOAT_A + n.phase) * fa : 0;

      /* Width is not a compositor property — writing it invalidates layout for
         the node. That was survivable while the loop only ran on scroll; with
         the drift running it every frame it put layout on the critical path
         (measured: 65 layouts in 3s, about one per frame). It only ever
         changes on resize, so it is written only when it actually changes. */
      if (n.lastW !== w) { n.el.style.width = w + 'px'; n.lastW = w; }
      n.el.style.transform =
        `translate3d(${(px + fx).toFixed(1)}px,${(py + fy).toFixed(1)}px,0)` +
        (n.assembles ? '' : ` translateY(${((1 - e) * 26).toFixed(1)}px)`);
      n.el.style.opacity = e.toFixed(3);

      if (n.assembles) {
        for (const k in FACE_DELAY) {
          const f = n.faces[k];
          if (!f) continue;
          const kk = clamp((e - FACE_DELAY[k]) / (1 - FACE_DELAY[k]), 0, 1);
          const ee = 1 - Math.pow(1 - kk, 3);
          const [fx, fy] = FACE_FROM[k];
          f.setAttribute('transform',
            `translate(${(fx * (1 - ee)).toFixed(2)} ${(fy * (1 - ee)).toFixed(2)})`);
          f.style.opacity = ee.toFixed(3);
        }
      }
    }

    /* Copy drifts at its reduced rate and fades on a proximity band, so it is
       legible for the whole dwell and gone well before the next stop. */
    for (const c of copyEls) {
      const d = (c.t * spacing - camT);
      const dist = Math.abs(d);
      const op = 1 - clamp((dist - 380 * spacing) / (420 * spacing), 0, 1);
      c.el.style.opacity = op.toFixed(3);
      c.el.style.visibility = op < .005 ? 'hidden' : '';
      const dd = d * COPY_PARALLAX;
      c.el.style.transform =
        `translate3d(${(dd * ISO.AX * worldScale).toFixed(1)}px,${(dd * ISO.AY * worldScale).toFixed(1)}px,0)` +
        (vw <= 720 ? ' translateX(-50%)' : '');
    }

    /* The title is NOT on the travel axis, and that is the point.

       §9 puts it at full parallax, which made it one more thing sliding down
       and left with the blocks — the desk finished turning and the type was
       already leaving on the same vector as the scenery. It is a separate
       entity: the desk rotates, the type arrives from the left, and the world
       is revealed behind it. Two things happening at once, not one thing
       moving.

       So entry is driven by the FILM (reveal), not by the camera, and it is a
       straight horizontal move. Only the exit is the camera's, once it has
       pushed past the title stop toward I play. */
    if (titleEl) {
      const past = camT - (-900 * spacing);
      const out  = 1 - clamp((past - 260 * spacing) / (520 * spacing), 0, 1);

      /* Held back until the film is well into its turn. Driven straight off
         `reveal` the type was already arriving as the desk began to move; it
         should land INTO the space the rotation opens, not race it. */
      const tIn = clamp01((reveal - TITLE_DELAY) / (1 - TITLE_DELAY));

      titleEl.style.opacity = out.toFixed(3);
      titleEl.style.visibility = (out * tIn) < .005 ? 'hidden' : '';
      titleEl.style.transform =
        `translateY(-50%) translate3d(${(-90 * (1 - out)).toFixed(1)}px,0,0)`;

      const n = titleTokens.length;
      const span = 1 - TITLE_STAGGER * (n - 1);
      for (let i = 0; i < n; i++) {
        const el = titleTokens[i];
        const k  = clamp01((tIn - i * TITLE_STAGGER) / span);
        const e  = SPRING(k);
        /* Opacity and blur clear ahead of the movement, so a word is legible
           while it is still settling rather than arriving already still. */
        const o  = clamp01(k * 2.4);
        const bl = (1 - clamp01(k * 1.7)) * 14;
        el.style.opacity = o.toFixed(3);
        el.style.transform =
          `translate3d(${(-190 * (1 - e)).toFixed(1)}px,0,0)` +
          ` rotate(${(-7 * (1 - e)).toFixed(2)}deg)` +
          ` scale(${(0.84 + 0.16 * e).toFixed(4)})`;
        /* Dropped entirely once sharp — a filter left on the element keeps it
           rasterising through its own layer for the rest of the section. */
        el.style.filter = bl > .05 ? `blur(${bl.toFixed(2)}px)` : '';
      }
    }

    if (exitEl) {
      const d = (4300 * spacing - camT);
      const op = 1 - clamp((Math.abs(d) - 300 * spacing) / (380 * spacing), 0, 1);
      exitEl.style.opacity = op.toFixed(3);
      exitEl.style.visibility = op < .005 ? 'hidden' : '';
      exitEl.style.transform =
        `translate(-50%,-50%) translate3d(${(d * .5 * ISO.AX).toFixed(1)}px,${(d * .5 * ISO.AY).toFixed(1)}px,0)`;
    }

    if (onScreen && !still) request();

    /* The glow travels #FF8C6C -> #FFFFFF across the traversal: warm where the
       section is personal, white by the time it is empty. */
    const g = clamp01((p - .06) / .78);
    sec.style.setProperty('--lw-glow-rgb',
      `255,${Math.round(140 + (255 - 140) * g)},${Math.round(108 + (255 - 108) * g)}`);
  }

  /* ==========================================================================
     11 · THE OVERLAP WITH THE PULL-OUT
     --------------------------------------------------------------------------
     The world rises over the last of the out-of-the-screen film rather than
     waiting for it to finish. Two independent knobs:

     The SCROLL overlap — the section is pulled up over the tail of #s-exit by
     40% of that section's travel, so the two share that stretch of scroll and
     the camera has already left its first key by the time the desk stops
     turning.

     The REVEAL ramp — opacity, handed the film's own scrub position by the
     landing engine. 0.60 -> 1.00 puts the world at exactly 25% revealed when
     the film is 70% scrubbed, which is the brief.

     Reading #s-exit's height is a read, not a reach-in: the world owns its own
     overlap and the landing engine is not asked to know about it.
     ====================================================================== */
  const REVEAL_START = 0.60, REVEAL_END = 1.00;

  /* How much of the reveal passes before the title starts arriving, and how
     far apart its six words land. */
  const TITLE_DELAY = 0.42, TITLE_STAGGER = 0.085;

  function applyOverlap() {
    const ex = document.getElementById('s-exit');
    if (!ex) return;
    const exTravel = ex.offsetHeight - innerHeight;
    if (exTravel <= 0) { sec.style.marginTop = ''; return; }
    sec.style.marginTop = -(exTravel * 0.40) + 'px';
  }
  applyOverlap();

  window.SX = window.SX || {};
  window.SX.ledge = function (pExit) {
    ledgeSeen = true;
    setReveal(clamp01((pExit - REVEAL_START) / (REVEAL_END - REVEAL_START)));
    request();
  };

  /* ==========================================================================
     12 · WARMING
     --------------------------------------------------------------------------
     Nothing is fetched with the page. Every variant and every mascot is warmed
     when the section comes within a screen of the viewport — a station must
     never be the thing that asks for a file, for the same reason the Experience
     cels are handed their sheet before the wipe that reveals them.
     ====================================================================== */
  new IntersectionObserver(es => {
    onScreen = es.some(e => e.isIntersecting);
    if (onScreen) request();
  }, { rootMargin: '10% 0px' }).observe(sec);

  const warm = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    warm.disconnect();
    Object.keys(BLOCKS).forEach(loadBlock);
    STATIONS.forEach(s => { const i = new Image(); i.src = IMG + s.mascot; });
  }, { rootMargin: '100% 0px' });
  warm.observe(sec);

  /* ==========================================================================
     13 · LOOP
     ====================================================================== */
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { measure(); applyOverlap(); paintTitleGradient(); request(); });
  request();

  /* ==========================================================================
     14 · ?edit=1 — the placement tool
     --------------------------------------------------------------------------
     Drag any ambient block; press E to print the AMBIENT array back out with
     the new offsets in it. Two hours of tooling against a day of guessing
     coordinates, and it never loads unless it is asked for by name.
     ====================================================================== */
  if (new URLSearchParams(location.search).get('edit') === '1') {
    let drag = null;
    sec.dataset.lwEdit = '1';
    world.style.cursor = 'grab';
    world.addEventListener('pointerdown', ev => {
      const el = ev.target.closest('.lw-node');
      if (!el) return;
      const n = nodes.find(q => q.el === el);
      if (!n || n.kind !== 'block' || n.assemble) return;
      drag = { n, x: ev.clientX, y: ev.clientY, ox: n.ox, oy: n.oy };
      world.setPointerCapture(ev.pointerId);
      world.style.cursor = 'grabbing';
    });
    world.addEventListener('pointermove', ev => {
      if (!drag) return;
      drag.n.ox = Math.round(drag.ox + (ev.clientX - drag.x) / worldScale);
      drag.n.oy = Math.round(drag.oy + (ev.clientY - drag.y) / worldScale);
      request();
    });
    world.addEventListener('pointerup', ev => {
      drag = null; world.style.cursor = 'grab';
      try { world.releasePointerCapture(ev.pointerId); } catch (e) {}
    });
    addEventListener('keydown', ev => {
      if (ev.key !== 'e' && ev.key !== 'E') return;
      const rows = nodes.filter(n => n.kind === 'block' && !n.assemble).map(n =>
        `    { t: ${String(n.t).padStart(5)}, ox: ${String(n.ox).padStart(4)}, ` +
        `oy: ${String(n.oy).padStart(4)}, variant: '${n.variant}', tier: '${n.tier}'` +
        ' },');
      console.log('  const AMBIENT = [\n' + rows.join('\n') + '\n  ];');
    });
    console.info('[outside-work] edit mode — drag blocks, press E to print the array');
  }
})();
