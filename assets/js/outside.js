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
     UNVERIFIED, and the one number here that must not be guessed at for long.
     Spec section 2: if the travel axis does not match the angle baked into the
     artwork, blocks slide ACROSS the ground plane instead of moving THROUGH
     it — the failure that is subtle enough to reach production.

     The delivered blocks have not landed, so there is nothing to measure yet
     and this is set to the projection the rest of the site already uses: the
     hero's depth vector (+120, -70), whose edge ratio is 70/120 = 0.5833.
     public/img/*.svg are stand-ins drawn on that same axis by
     tools/make-blocks.mjs, so the world is self-consistent today.

     When the real art arrives:
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

     Printed by tools/make-blocks.mjs. If a delivered block's box differs, run
     that tool's manifest line again rather than editing nw/nh by hand.
     ====================================================================== */
  const BLOCKS = {
    master: { src: 'master_block.svg', nw: 420, nh: 394.99, origin: { x: .5, y: 1 }, ridge: { x: .5, y: .465 } },
    amb_1:  { src: 'block_1.svg',      nw: 300, nh: 292.99, origin: { x: .5, y: 1 } },
    amb_2:  { src: 'block_2.svg',      nw: 220, nh: 214.33, origin: { x: .5, y: 1 } },
    amb_3:  { src: 'block_3.svg',      nw: 150, nh: 145.50, origin: { x: .5, y: 1 } },
    amb_4:  { src: 'block_4.svg',      nw: 260, nh: 181.66, origin: { x: .5, y: 1 } }
  };
  const IMG = '../public/img/';

  /* ==========================================================================
     3 · DEPTH TIERS
     --------------------------------------------------------------------------
     Parallax and scale live here; the tone treatment lives in CSS on the inner
     .lw-tone element and is written once. Two elements, one property each, so
     depth opacity and entrance opacity can never overwrite one another.
     ====================================================================== */
  const TIER = {
    bg:    { parallax: 0.35, scale: 0.55 },
    mid:   { parallax: 0.70, scale: 0.80 },
    stage: { parallax: 1.00, scale: 1.00 },
    fg:    { parallax: 1.60, scale: 1.25 }
  };

  /* Copy drifts at 0.30x. The axis carries things down and to the left, so the
     left column exits frame first; at full rate the headline would be gone
     while the reader was still on the second line. The mascot runs a touch
     FASTER than the block it stands on — 1.06x — because that sliver of
     differential is what makes it read as standing in the scene rather than
     composited onto it. Below ~0.5px it does nothing, past ~1.15x it detaches. */
  const COPY_PARALLAX   = 0.30;
  const MASCOT_PARALLAX = 1.06;

  /* ==========================================================================
     4 · THE WORLD
     ====================================================================== */
  const STATIONS = [
    { id: 'play',  t: 0,    master: 'master', mascot: 'iplay.png'  },
    { id: 'click', t: 1450, master: 'master', mascot: 'ishoot.png' },
    { id: 'meme',  t: 2900, master: 'master', mascot: 'imeme.png'  }
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
    /* approach to the title */
    { t: -1350, ox:  380, oy: -140, variant: 'amb_3', tier: 'bg'  },
    { t: -1180, ox: -520, oy:  240, variant: 'amb_4', tier: 'bg'  },
    { t:  -980, ox:  720, oy:  180, variant: 'amb_2', tier: 'mid', flip: 1 },
    { t:  -860, ox: -680, oy: -200, variant: 'amb_3', tier: 'bg'  },
    { t:  -700, ox:  520, oy:  360, variant: 'amb_1', tier: 'mid' },
    { t:  -520, ox: -340, oy:  -60, variant: 'amb_4', tier: 'bg',  flip: 1 },

    /* station 1 — I play */
    { t:  -300, ox:  180, oy: -320, variant: 'amb_3', tier: 'bg'  },
    { t:  -180, ox:  560, oy: -230, variant: 'amb_2', tier: 'mid' },
    { t:   -60, ox:  820, oy:  110, variant: 'amb_3', tier: 'mid', flip: 1 },
    { t:    60, ox: 1010, oy:  -70, variant: 'amb_4', tier: 'bg',  flip: 1 },
    { t:   150, ox:  430, oy:  270, variant: 'amb_1', tier: 'mid' },
    { t:   240, ox: -360, oy:  350, variant: 'amb_4', tier: 'bg'  },
    { t:   330, ox:  660, oy:  430, variant: 'amb_2', tier: 'fg'  },
    { t:   430, ox: -140, oy:  470, variant: 'amb_3', tier: 'fg',  flip: 1 },

    /* the gap */
    { t:   700, ox:  460, oy: -180, variant: 'amb_3', tier: 'bg'  },
    { t:   950, ox: -420, oy:  200, variant: 'amb_4', tier: 'bg',  flip: 1 },
    { t:  1180, ox:  700, oy:  300, variant: 'amb_2', tier: 'mid' },

    /* station 2 — I click */
    { t:  1280, ox:  200, oy: -300, variant: 'amb_4', tier: 'bg'  },
    { t:  1370, ox:  600, oy: -240, variant: 'amb_3', tier: 'mid', flip: 1 },
    { t:  1500, ox:  870, oy:   90, variant: 'amb_2', tier: 'mid' },
    { t:  1600, ox:  400, oy:  290, variant: 'amb_1', tier: 'mid', flip: 1 },
    { t:  1700, ox: -330, oy:  330, variant: 'amb_3', tier: 'bg'  },
    { t:  1790, ox:  980, oy: -140, variant: 'amb_4', tier: 'bg'  },
    { t:  1880, ox:  620, oy:  450, variant: 'amb_2', tier: 'fg',  flip: 1 },

    /* the gap */
    { t:  2150, ox: -480, oy: -120, variant: 'amb_3', tier: 'bg'  },
    { t:  2400, ox:  520, oy:  240, variant: 'amb_4', tier: 'bg',  flip: 1 },
    { t:  2640, ox:  760, oy: -200, variant: 'amb_2', tier: 'mid' },

    /* station 3 — I meme */
    { t:  2740, ox:  240, oy: -330, variant: 'amb_3', tier: 'bg',  flip: 1 },
    { t:  2830, ox:  580, oy: -210, variant: 'amb_2', tier: 'mid' },
    { t:  2960, ox:  900, oy:  120, variant: 'amb_3', tier: 'mid' },
    { t:  3060, ox:  420, oy:  300, variant: 'amb_1', tier: 'mid', flip: 1 },
    { t:  3150, ox: -350, oy:  360, variant: 'amb_4', tier: 'bg'  },
    { t:  3260, ox:  680, oy:  440, variant: 'amb_2', tier: 'fg'  },

    /* the thinning — density and tier both drop away, so the world dissolves
       rather than stopping. Nothing at all past 4100. */
    { t:  3520, ox:  480, oy: -160, variant: 'amb_3', tier: 'mid' },
    { t:  3700, ox: -400, oy:  220, variant: 'amb_4', tier: 'bg'  },
    { t:  3880, ox:  640, oy:  280, variant: 'amb_3', tier: 'bg'  },
    { t:  4060, ox:  300, oy: -120, variant: 'amb_4', tier: 'bg'  },

    /* The last block on the page. Full tier where everything around it has
       faded to bg, so it reads as the one thing left rather than as the
       nearest of many. The spec has a mascot riding it; that figure has not
       been chosen yet, so it drifts in empty for now. */
    { t:  4300, ox:  520, oy:  150, variant: 'amb_3', tier: 'stage', last: 1 }
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
    const n = Object.assign({ el, tone, kind: 'block', ox: 0, oy: 0, delay: 0, flip: 0 }, spec);
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
    img.addEventListener('load', () => {
      if (img.naturalWidth) n.aspect = img.naturalHeight / img.naturalWidth;
      request();
    });
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
  AMBIENT.forEach((a, i) => addBlock(Object.assign({ kind: 'block', win: 1400, ai: i }, a)));

  STATIONS.forEach(st => {
    const m = BLOCKS[st.master];
    addShadow({ t: st.t, ox: 280, oy: 40, tier: 'stage', station: st.id, delay: .12, master: m });
    addBlock({ t: st.t, ox: 280, oy: 40, tier: 'stage', variant: st.master,
               station: st.id, assemble: true, win: 520, delay: 0 });
    addMascot({ t: st.t, ox: 280, oy: 40, tier: 'stage', kind: 'mascot',
                file: st.mascot, station: st.id, delay: .12, win: 520, master: m });
  });

  /* The copy, the title and the exit are already in the document — they are
     real text in source order and nothing may exist only inside the traversal.
     JS only drives their drift and their fade. They are positioned by CSS so
     the gutter stays responsive; the transform carries the parallax alone. */
  const titleEl = sec.querySelector('.lw-title');
  const exitEl  = sec.querySelector('.lw-exit');
  const copyEls = [...sec.querySelectorAll('.lw-copy')].map(el => ({
    el, t: STATIONS.find(s => s.id === el.dataset.station)?.t ?? 0
  }));

  /* ==========================================================================
     8 · GEOMETRY
     ====================================================================== */
  let vw = innerWidth, vh = innerHeight;
  let worldScale = 1, spacing = 1, dropFg = false, thinAmbient = false;

  /* Where a station's block sits relative to the middle of the frame. Beside
     the copy on a desktop; BELOW it on a phone, which is the whole of the
     spec's "copy moves above the master block rather than beside it" — at
     390px the two were simply landing on top of one another. */
  let stOx = 280, stOy = 40;

  /* The phone is not the desktop world shrunk. It is the same world at 0.62
     with the fg tier gone — punctuation that covers the copy on a 390px screen
     is just an obstruction — and the stops pulled closer so the gaps stay
     under half a viewport. One breakpoint, agreed with outside.css. */
  function measure() {
    vw = innerWidth; vh = innerHeight;
    const phone = vw <= 720;
    worldScale = phone ? 0.62 : 1;
    spacing    = phone ? 900 / 1450 : 1;
    dropFg     = phone;
    thinAmbient = phone;
    stOx = phone ? 0   : 280;
    stOy = phone ? 380 : 40;
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
    const win = node.win || 520;
    const raw = 1 - clamp(((node.t * spacing - camT) - 160) / win, 0, 1);
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

  const FACE_DELAY = { top: 0, left: .05, right: .10 };
  const FACE_FROM  = { top: [0, -40], left: [-26, 0], right: [26, 0] };

  /* ==========================================================================
     10 · RENDER
     ====================================================================== */
  let rafId = 0, running = false, reveal = 0, ledgeSeen = false;

  /* One write, for the whole stage. Ground, glow, world and copy come up
     together — a world whose blocks are already solid over a film that is
     still playing does not read as rising out of it.

     Cleared entirely at full strength rather than set to 1: opacity below 1 on
     a sticky element this size forces an offscreen composite every frame, and
     the traversal proper spends all of its time at 1. */
  function setReveal(r) {
    reveal = r;
    stage.style.opacity = r >= .999 ? '' : r.toFixed(3);

    /* Through the overlap the stage's top edge is still descending the screen,
       and the glow is clipped along it — measured at 3.5 to 9 luma against the
       black the film ends on, which reads as a panel sliding up over the video
       rather than the video becoming the page. So the edge is dissolved rather
       than cut, over a band that shrinks as the world arrives.

       The two cancel exactly, and not by luck: the scroll overlap is 40% of
       the film's travel and the reveal ramp spans pExit 0.60 to 1.00, which is
       the same 40%. The band is therefore 0 at precisely the moment the edge
       reaches the top of the window and stops being an edge. Cleared at full
       strength so the traversal proper carries no mask layer. */
    const band = Math.round((1 - r) * 180);
    const mask = r >= .999 ? '' : `linear-gradient(to bottom, transparent 0, #000 ${band}px)`;
    stage.style.maskImage = mask;
    stage.style.webkitMaskImage = mask;
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

    const camT = camAt(p);
    const cx = vw * .5, cy = vh * .5;
    const dissolve = 1 - clamp01((camT - DISSOLVE_FROM) / (DISSOLVE_TO - DISSOLVE_FROM));

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

      const e = entrance(n, camT) * (n.last ? 1 : dissolve);
      let sc = tier.scale * worldScale;

      const b = BLOCKS[n.variant];

      if (n.kind === 'mascot' || n.kind === 'shadow') {
        /* Both hang off the master block's ridge, not its centre — feet on the
           front ridge line is the difference between standing on the block and
           floating over it. The mascot's own anchor is its soles. */
        const m = n.master;
        const bw = m.nw * TIER.stage.scale * worldScale;
        const bh = m.nh * TIER.stage.scale * worldScale;
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
          n.shadow.style.width  = side + 'px';
          n.shadow.style.height = side + 'px';
          n.shadow.style.transform = `rotate(45deg) scaleY(${ISO_RATIO.toFixed(4)})`;
          n.el.style.transform =
            `translate3d(${(x - side / 2).toFixed(1)}px,${(y - side / 2).toFixed(1)}px,0)`;
          n.el.style.opacity = (e * .30).toFixed(3);
          continue;
        }

        /* Anchored on the soles at (0.5, 0.96), not the centre — the whole
           point of the ridge maths above is to put a named point of the
           artwork onto a named point of the world. The aspect comes from the
           file the moment it loads; 1.32 is only what holds until then. */
        const mw = bw * .55;                         // a share of the block, not a magic number
        const mh = mw * (n.aspect || 1.32);
        n.el.style.width = mw + 'px';
        n.el.style.transform =
          `translate3d(${(x - mw * .5).toFixed(1)}px,${(y - mh * .96).toFixed(1)}px,0)` +
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

      n.el.style.width = w + 'px';
      n.el.style.transform =
        `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)` +
        (n.flip ? ' scaleX(-1)' : '') +
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
      const op = 1 - clamp((dist - 380) / 420, 0, 1);
      c.el.style.opacity = op.toFixed(3);
      c.el.style.visibility = op < .005 ? 'hidden' : '';
      const dd = d * COPY_PARALLAX;
      c.el.style.transform =
        `translate3d(${(dd * ISO.AX * worldScale).toFixed(1)}px,${(dd * ISO.AY * worldScale).toFixed(1)}px,0)` +
        (vw <= 720 ? ' translateX(-50%)' : '');
    }

    /* The title travels at full rate — unlike the station copy, its exit is
       the section's opening move and it should leave properly. */
    if (titleEl) {
      const d = (-900 - camT);
      const op = 1 - clamp((Math.abs(d) - 420) / 460, 0, 1);
      titleEl.style.opacity = op.toFixed(3);
      titleEl.style.visibility = op < .005 ? 'hidden' : '';
      titleEl.style.transform =
        `translate(-50%,-50%) translate3d(${(d * ISO.AX).toFixed(1)}px,${(d * ISO.AY).toFixed(1)}px,0)`;
    }

    if (exitEl) {
      const d = (4300 - camT);
      const op = 1 - clamp((Math.abs(d) - 300) / 380, 0, 1);
      exitEl.style.opacity = op.toFixed(3);
      exitEl.style.visibility = op < .005 ? 'hidden' : '';
      exitEl.style.transform =
        `translate(-50%,-50%) translate3d(${(d * .5 * ISO.AX).toFixed(1)}px,${(d * .5 * ISO.AY).toFixed(1)}px,0)`;
    }

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
  addEventListener('resize', () => { measure(); applyOverlap(); request(); });
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
        (n.flip ? ', flip: 1' : '') + ' },');
      console.log('  const AMBIENT = [\n' + rows.join('\n') + '\n  ];');
    });
    console.info('[outside-work] edit mode — drag blocks, press E to print the array');
  }
})();
