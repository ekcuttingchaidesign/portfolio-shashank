/* ============================================================================
   Work · Archive · the hand-off — behaviour.

   Deliberately independent of the landing page's scrub engine. That engine owns
   the film and the hero, it is tuned, and it works; this module owns everything
   below the black frame and never reaches into it. The only thing they share is
   the scrollbar.

   Same loop discipline as the landing: one rAF that parks itself once nothing
   is moving, woken by scroll and resize. A still page costs nothing.
   ========================================================================== */

(() => {
  'use strict';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.getElementById('sx');
  if (!root) return;

  /* Applied from JS so the un-revealed state exists only when something is
     around to reveal it. Without scripting every section is simply visible. */
  root.classList.add('sx-js');

  /* The vendored library. Everything that uses it falls back to plain CSS or a
     rAF loop if it somehow didn't load, so the page never depends on it. */
  const M = window.Motion || null;

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const seg = (p, a, b) => clamp01((p - a) / (b - a));

  /* ------------------------------------------------------------------------
     Film grain
     ------------------------------------------------------------------------
     One grain over the renders and the HTML both — it is the glue between the
     3D and the DOM (spec rule 6). Generated into a data URI rather than
     shipped as a file: it is 180x180 of noise, and a network request for that
     on the critical path would be silly.
     ---------------------------------------------------------------------- */
  function makeGrain() {
    const S = 180;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const cx = c.getContext('2d');
    const img = cx.createImageData(S, S);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 26;                     // the grain is almost all transparency
    }
    cx.putImageData(img, 0, 0);
    try {
      document.documentElement.style.setProperty(
        '--sx-grain-src', `url("${c.toDataURL('image/png')}")`);
    } catch (e) { /* tainted canvas can't happen here, but never break the page for grain */ }
  }
  makeGrain();

  /* ========================================================================
     1 · THE APPROACH
     ========================================================================
     The film's camera travels along Z and then stops dead at the glass. This
     carries that motion past the end of the film: specks keep coming at you
     while the hero assembles behind them, so the seam between a video and a DOM
     section has something moving across it instead of a cut.

     Canvas rather than elements. A few hundred of these redrawn every frame is
     nothing for a canvas and a great deal of compositor work for the DOM.

     Nothing here integrates. A speck's depth is a pure function of the scroll
     number, so there is no velocity to reverse and no state to get out of step:
     scroll back and the field simply IS what it was there, flying away from you
     again. That is the same discipline as the rest of the page, and it is why
     this can sit on a scrub without fighting it.
     ====================================================================== */

  const dustCv = document.getElementById('sx-dust');

  /* Fractions of the APPROACH, which the landing normalises for us: 0 is a
     little before the film's last frames, 1 is the hero all but arrived. Not
     entry progress — that moved the moment the section grew a hold at the end,
     and these are tuned against the two beats, not against the scrollbar. */
  const DUST_IN  = [0.00, 0.34];
  const DUST_OUT = [0.68, 1.00];
  const DUST_COUNT = 240;
  /* Depth range. NEAR is where a speck passes the camera and is recycled. */
  const DUST_NEAR = 0.07, DUST_FAR = 1;
  /* How many times the field cycles across the entry. This is the speed dial. */
  const DUST_LOOPS = 6.2;
  /* How far back a speck's streak reaches, in depth. Constant in depth means the
     streak projects LONGER the closer it gets, which is what speed looks like. */
  const DUST_TRAIL = 0.055;
  /* The bloom around each streak: how much wider than the core, and at what
     fraction of its alpha. Keep the alpha low — this is light spilling off a
     speck, and the moment it reads as a second stroke it stops being glow. */
  const GLOW_SPREAD = 5.5, GLOW_ALPHA = 0.16;

  function makeDust() {
    /* Deterministic, so the field is the same field on every load. A portfolio
       that reshuffles its own starfield each visit is a portfolio that cannot
       be art-directed. */
    let seed = 20260820;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    const out = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      const a = rnd() * Math.PI * 2;
      /* Biased outward: a field with as many specks in the middle as at the
         edges reads as noise over the type rather than as travel past it. */
      const r = 0.10 + Math.pow(rnd(), 0.55) * 1.25;
      out.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.7,      // the frame is wide, so the field is too
        z: rnd(),
        s: 0.35 + rnd() * 0.95,
        warm: rnd() < 0.34             // a third in the portrait's vermilion
      });
    }
    return out;
  }

  const dust = dustCv ? makeDust() : null;
  const dctx = dustCv ? dustCv.getContext('2d') : null;
  let dustW = 0, dustH = 0;

  function sizeDust() {
    if (!dustCv) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = dustCv.clientWidth, h = dustCv.clientHeight;
    if (!w || !h) return;
    dustW = w; dustH = h;
    dustCv.width = Math.round(w * dpr);
    dustCv.height = Math.round(h * dpr);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paintDust(p) {
    if (!dctx) return;
    if (!dustW || !dustH) sizeDust();
    if (!dustW || !dustH) return;

    dctx.clearRect(0, 0, dustW, dustH);
    if (reduced) return;

    const amp = seg(p, DUST_IN[0], DUST_IN[1]) * (1 - seg(p, DUST_OUT[0], DUST_OUT[1]));
    if (amp <= 0.002) return;

    /* 46% rather than 50%: the vanishing point sits where the film's own does,
       so the specks come out of the same place the camera has been heading. */
    const cx = dustW / 2, cy = dustH * 0.46;
    const focal = Math.min(dustW, dustH) * 0.92;

    /* The field DECELERATES. The film's camera has just come to rest against
       the glass, so specks still tearing past at full speed behind a stopped
       camera would contradict the shot. Travel eases out across the approach:
       quick while the last frames are still running, and by the time the hero
       has assembled the specks are barely drifting — dust hanging in the room
       rather than stars going by. */
    const u = seg(p, DUST_IN[0], DUST_OUT[1]);
    const travel = (1 - Math.pow(1 - u, 2.2)) * DUST_LOOPS;

    /* A streak is a speck's own speed drawn out, so it has to shorten as the
       field slows or the deceleration would only be half-said. */
    const trail = DUST_TRAIL * (0.1 + 0.9 * Math.pow(1 - u, 1.2));

    dctx.globalCompositeOperation = 'lighter';   // specks add on black
    dctx.lineCap = 'round';

    for (const d of dust) {
      /* Wrapped into [0,1): 1 is the far plane, 0 is the camera. Subtracting
         travel walks each speck toward you; the wrap puts it back at the far
         plane when it passes. */
      let z = d.z - travel;
      z -= Math.floor(z);

      const near = DUST_NEAR + z * (DUST_FAR - DUST_NEAR);
      const far  = near + trail;
      const kn = focal / near, kf = focal / far;

      const x1 = cx + d.x * kn, y1 = cy + d.y * kn;
      const x2 = cx + d.x * kf, y2 = cy + d.y * kf;

      /* Up out of the far plane, and out again as it reaches the camera —
         otherwise specks pop into and out of existence at both ends. */
      const a = amp * clamp01((1 - z) * 4.5) * clamp01(z * 7);
      if (a <= 0.004) continue;

      const rgb = d.warm ? '224,84,42' : '253,248,207';
      const wCore = Math.max(0.55, Math.min(d.s * focal / near * 0.0016, 3.4));

      dctx.beginPath();
      dctx.moveTo(x2, y2);
      dctx.lineTo(x1, y1);

      /* The glow is a second, much wider stroke at a fraction of the alpha,
         under the sharp one. Two passes rather than ctx.shadowBlur: the shadow
         is a real blur, and asking for one of those a few hundred times a frame
         is the difference between free and dropping frames. Under 'lighter' the
         two add, so the wide pass reads as bloom around the core. */
      dctx.strokeStyle = 'rgba(' + rgb + ',' + (a * GLOW_ALPHA).toFixed(3) + ')';
      dctx.lineWidth = wCore * GLOW_SPREAD;
      dctx.stroke();

      dctx.strokeStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
      dctx.lineWidth = wCore;
      dctx.stroke();
    }

    dctx.globalCompositeOperation = 'source-over';
  }

  if (dustCv) {
    sizeDust();
    addEventListener('resize', () => { sizeDust(); }, { passive: true });
  }

  /* The one seam between this module and the landing's scrub engine: the
     landing owns the scroll spine, so it owns the number; this owns what the
     approach does with it. */
  window.SX = window.SX || {};
  window.SX.dust = paintDust;

  /* ========================================================================
     2 · REVEALS
     ========================================================================
     Depth, not slide: entries scale up from 0.96 with a blur clearing, which is
     the dive's own move continued into the DOM. IntersectionObserver rather
     than scroll maths — it is cheaper and it is what the API is for.
     ====================================================================== */

  const revealables = [...root.querySelectorAll('[data-reveal]')];
  if (revealables.length) {
    if (reduced || !('IntersectionObserver' in window)) {
      revealables.forEach(el => el.setAttribute('data-in', ''));
    } else {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-in', '');
          io.unobserve(e.target);          // arriving is a one-way trip
        }
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
      revealables.forEach(el => io.observe(el));
    }
  }

  /* Stagger siblings inside a group without hand-writing a delay per element. */
  root.querySelectorAll('[data-stagger]').forEach(group => {
    const step = parseInt(group.getAttribute('data-stagger'), 10) || 60;
    [...group.children].forEach((child, i) => {
      /* Capped: past ~8 items the total reveal time starts to feel sluggish,
         and the archive rows run to sixteen. */
      child.style.setProperty('--sx-delay', Math.min(i, 8) * step + 'ms');
    });
  });

  /* ========================================================================
     3 · THE POINTER
     ========================================================================
     A specular sweep that follows the cursor across a lifted surface. This is
     the same idea as the room's lighting — a light source moving over a plane —
     rather than a generic card glow, which is why it earns its place.

     Coordinates are written as CSS custom properties on the element and read by
     a radial-gradient. No layout, no per-frame JS work beyond two setProperty
     calls, and it costs nothing when the pointer is elsewhere.
     ---------------------------------------------------------------------- */

  if (!reduced && matchMedia('(pointer: fine)').matches) {
    /* The portrait leans toward the pointer. Small — 4-5 degrees — because it
       is a photograph on a screen, not a card being picked up. */
    const portrait = document.getElementById('sx-portrait');
    if (portrait) {
      const plate = portrait.querySelector('.sx-portrait-plate');
      portrait.addEventListener('pointermove', (e) => {
        const r = portrait.getBoundingClientRect();
        plate.style.setProperty('--sx-tx', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
        plate.style.setProperty('--sx-ty', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
      }, { passive: true });
      portrait.addEventListener('pointerleave', () => {
        plate.style.setProperty('--sx-tx', '0');
        plate.style.setProperty('--sx-ty', '0');
      }, { passive: true });
    }

    root.querySelectorAll('.sx-slab, .sx-feat-side').forEach(slab => {
      slab.addEventListener('pointermove', (e) => {
        const r = slab.getBoundingClientRect();
        slab.style.setProperty('--sx-mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        slab.style.setProperty('--sx-my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }, { passive: true });
    });
  }

  /* ------------------------------------------------------------------------
     Art slots
     ------------------------------------------------------------------------
     Anything marked [data-art] holds an <img> that may not be on disk yet. The
     slot starts "pending" — which is what the stylesheet draws the reserved
     plate and the type fallback off — and only becomes "ready" once the file
     actually decodes. A missing render therefore shows the placeholder it was
     designed with rather than a broken-image frame, and dropping the file in is
     the entire change needed to swap one for the other.

     Same contract the mascot's corner already runs on, generalised so the
     featured card's cover and lockup can share it.
     ---------------------------------------------------------------------- */
  root.querySelectorAll('[data-art]').forEach(slot => {
    const img = slot.querySelector('img');
    if (!img) { slot.setAttribute('data-art', 'missing'); return; }
    const settle = () => slot.setAttribute(
      'data-art', img.naturalWidth ? 'ready' : 'missing');
    if (img.complete) settle();
    else {
      img.addEventListener('load',  settle,  { once: true });
      img.addEventListener('error', () => slot.setAttribute('data-art', 'missing'),
        { once: true });
    }
  });

  let runExperience = null;

  /* ========================================================================
     4 · EXPERIENCE — the character is the timeline
     ========================================================================
     Four stops scroll past a sticky stage. Each one that crosses the trigger
     line makes its company the live one, and the character on the stage
     becomes a different person — a student, a commuter, a flying thing, and
     finally someone who just walks.

     Two rules shape everything below.

     ONE: state is recomputed from scroll position every frame, never
     incremented on an event. Scrolling back up therefore walks the career
     backwards correctly, and a reload halfway down the page lands on the right
     stop instead of replaying from 2016.

     TWO: a sprite is never asked for at the moment it is needed. Each stop owns
     a sheet, the sheet is handed to a layer well before that layer is
     revealed, and the swap is a wipe between two layers that are BOTH already
     painted. This is the lesson the mascot in Things That Move cost us: a CSS
     background is a resource of its own, so a state change that swaps
     background-image sends the browser back to the network at exactly the
     wrong moment and paints nothing until the file lands.
     ====================================================================== */

  const xp = document.getElementById('sx-exp');
  const xpStops = xp ? [...xp.querySelectorAll('.sx-xp-stop')] : [];

  if (xp && xpStops.length) {
    const reel   = document.getElementById('sx-xp-reel');
    const celA   = reel && reel.querySelector('[data-cel="a"]');
    const celB   = reel && reel.querySelector('[data-cel="b"]');
    const sweep  = reel && reel.querySelector('.sx-xp-sweep');
    const card   = xp.querySelector('.sx-xp-card');
    const elCo   = document.getElementById('sx-xp-co');
    const elYr   = document.getElementById('sx-xp-yr');
    const elSay  = document.getElementById('sx-xp-say');
    const pips   = [...document.querySelectorAll('#sx-xp-pips li')];
    const rail   = xp.querySelector('.sx-xp-rail');

    /* One reel per stop.

       `frames` is not always the sheet's cell count. Three of the four sheets
       close their loop by repeating frame 0 in the fifth cell — measured, not
       assumed: aligned and compared, cell 4 differs from cell 0 by 2.7, 3.6 and
       5.2 mean levels against 17-plus for every genuinely different pair. Play
       all five and the character freezes for one beat every cycle. The walk is
       the exception: its five cells are five distinct positions, so it plays
       all five.

       `cols` stays 5 for every sheet because the NORMALISER wrote them all onto
       one 5-cell grid — the step is a fifth of the sheet whatever we choose to
       play. */
    const REELS = [
      { file: 'fresher.webp',     cols: 5, frames: 4, cycle: 1150 },
      { file: 'appinventiv.webp', cols: 5, frames: 4, cycle: 1000 },
      { file: 'gamezop.webp',     cols: 5, frames: 4, cycle:  900 },
      { file: 'airtel_walk.webp', cols: 5, frames: 5, cycle:  820 },
    ];
    /* The cycles shorten as the career runs. Not a gimmick — it is the one
       thing the four sheets have in common that can carry the story: he is
       standing still in 2016 and moving by 2021, and the tempo says so before
       any of the copy does. */

    /* Sheet URLs resolve against the DOCUMENT (this file is loaded from the
       page, not from the stylesheet), so they are written here rather than
       lifted out of a custom property the way the mascot's is. */
    const sheetURL = file => new URL('../public/img/' + file, location.href).href;

    /* --- keeping the sheets warm ---------------------------------------
       An <img> per reel, retained for the life of the page. Retained matters:
       an unreferenced Image can have its decode collected, and then the layer
       has to decode again at the worst possible moment. The layer's own
       background-image is set from the same URL at the same time, so by the
       time a wipe reveals it there is nothing left to fetch.

       Warming is progressive. Four sheets is about 1.2MB and nobody should pay
       for Airtel while they are reading MediaAgility, so stop N's sheet is
       warmed when stop N-1 becomes live, and the first is warmed as the
       section comes up the screen. */
    const warmed = [];       /* retained images, indexed by stop */
    const warming = [];      /* in-flight promises, indexed by stop */

    const warm = i => {
      if (i < 0 || i >= REELS.length) return Promise.resolve(false);
      if (warming[i]) return warming[i];
      warming[i] = new Promise(resolve => {
        const img = new Image();
        img.decoding = 'async';
        const done = () => resolve(img.complete && img.naturalWidth > 0);
        img.onload = done;
        img.onerror = done;
        img.src = sheetURL(REELS[i].file);
        warmed[i] = img;                       /* retained */
        /* Raced against load, never trusted alone: Chrome rejects decode()
           intermittently for reasons that have nothing to do with the bytes,
           so its rejection is ignored and load is what answers. */
        img.decode().then(done, () => {});
      }).then(ok => {
        if (!ok) { warming[i] = null; warmed[i] = null; }   /* let it retry */
        return ok;
      });
      return warming[i];
    };
    const sheetReady = i => !!(warmed[i] && warmed[i].complete && warmed[i].naturalWidth);

    /* --- the sprite loop ---
       Held cells, never interpolated. A sprite that tweens between two cells
       slides the sheet across its window and shows halves of both. */
    const reelKeys = ({ cols, frames }) => {
      const keys = [];
      for (let i = 0; i < frames; i++) {
        keys.push({
          backgroundPosition: `${(i % cols) * (100 / (cols - 1))}% 50%`,
          easing: 'steps(1, end)',
        });
      }
      keys.push({ backgroundPosition: '0% 50%' });
      return keys;
    };

    let liveCel = celA, idleCel = celB;   /* which layer is on screen */
    let spin = null;                      /* the running sprite loop */

    const dress = (cel, i) => {
      cel.style.backgroundImage = `url("${sheetURL(REELS[i].file)}")`;
      cel.style.backgroundSize = `${REELS[i].cols * 100}% 100%`;
    };

    const play = (cel, i) => {
      if (spin) { spin.cancel(); spin = null; }
      if (reduced || !cel.animate) { cel.style.backgroundPosition = '0% 50%'; return; }
      spin = cel.animate(reelKeys(REELS[i]),
        { duration: REELS[i].cycle, iterations: Infinity });
    };

    /* --- the re-render -------------------------------------------------
       One progress number from 0 to 1 drives all of it: the bar's travel, how
       much of the outgoing character has been clipped away behind it, and how
       much of the incoming one has been revealed in front of it. Deriving
       everything from one value is what makes a fast scroll safe — there is a
       single animation to cancel, and cancelling it can never leave two half-
       wiped characters on the stage.

       The alternative, three animations timed to agree with each other, is the
       thing the UX guidance calls out by name: never depend on a transition
       finishing for the state to be correct. */
    let wipe = null, shown = -1, wanted = -1;

    const paintWipe = p => {
      /* The bar leads; the wipe edge follows it down the frame. */
      const edge = clamp01((p - 0.06) / 0.82) * 100;
      sweep.style.setProperty('--sx-xp-sweep-y', (-40 + p * 180).toFixed(1) + '%');
      sweep.style.opacity = (Math.sin(Math.PI * clamp01(p)) * 0.95).toFixed(3);
      /* Outgoing is eaten from the top down; incoming is uncovered behind it. */
      idleCel.style.clipPath = `inset(0 0 ${(100 - edge).toFixed(2)}% 0)`;
      liveCel.style.clipPath = `inset(${edge.toFixed(2)}% 0 0 0)`;
    };

    const clearWipe = () => {
      sweep.style.opacity = '0';
      celA.style.clipPath = 'none';
      celB.style.clipPath = 'none';
    };

    /* Swap to stop `i`. Idempotent: asking for the stop already on screen is a
       no-op, and asking for a different one mid-wipe replaces the wipe rather
       than queueing behind it. */
    const showStop = async i => {
      wanted = i;
      if (i === shown) return;

      if (!sheetReady(i)) {
        const ok = await warm(i);
        /* The reader may have scrolled on while that was in flight. */
        if (!ok || wanted !== i) return;
        if (i === shown) return;
      }

      /* Dress the layer that is NOT on screen, then reveal it. Nothing is
         fetched at this point — warm() has already been and gone. */
      dress(idleCel, i);
      idleCel.style.backgroundPosition = '0% 50%';
      idleCel.setAttribute('data-live', '');

      const from = shown;
      shown = i;
      readout(i);

      if (reduced || !M || !M.animate) {
        /* No performance: the new character is simply there. */
        if (wipe) { try { wipe.stop(); } catch (e) {} wipe = null; }
        clearWipe();
        liveCel.removeAttribute('data-live');
        [liveCel, idleCel] = [idleCel, liveCel];
        play(liveCel, i);
        return;
      }

      if (wipe) { try { wipe.stop(); } catch (e) {} wipe = null; }
      /* The incoming character starts its own loop immediately, so he is
         already alive as the bar uncovers him rather than snapping to life
         once it has passed. */
      play(idleCel, i);

      const first = from < 0;
      const box = { v: 0 };
      wipe = M.animate(box, { v: 1 }, {
        duration: first ? 0.34 : 0.62,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: () => paintWipe(box.v),
        /* The layers trade places only once the bar is off the bottom. */
        onComplete: () => {
          liveCel.removeAttribute('data-live');
          [liveCel, idleCel] = [idleCel, liveCel];
          clearWipe();
          wipe = null;
        },
      });
    };

    const readout = i => {
      const s = xpStops[i];
      if (!s) return;
      /* The dot belongs to the stop, not to the card, so it lights only on the
         one that has not ended. The numeric counter that used to sit beside it
         is gone — the pips say the same thing without a second reading. */
      if (card) s.hasAttribute('data-current')
        ? card.setAttribute('data-current', '')
        : card.removeAttribute('data-current');
      if (elCo)    elCo.textContent    = s.getAttribute('data-co') || '';
      if (elYr)    elYr.textContent    = s.getAttribute('data-yr') || '';
      /* His line, swapped with him. Written every time the stop changes rather
         than on hover, so the bubble is already correct when it opens — the
         hero fills its bubble on pointerenter because its lines are a rotating
         list with no state behind them; this one has state, and the state is
         which stop you are on. */
      if (elSay)   elSay.textContent   = s.getAttribute('data-say') || '';
      pips.forEach((p, n) => n <= i ? p.setAttribute('data-on', '')
                                    : p.removeAttribute('data-on'));
      /* The room warms as the career does. */
      if (xp) xp.style.setProperty('--sx-xp-heat',
        (i / Math.max(xpStops.length - 1, 1)).toFixed(3));
    };

    /* --- which stop is being read -------------------------------------- */
    function updateExperience() {
      /* The trigger is a stop's own TOP crossing 62% of the viewport, not its
         centre. These stops are wildly different heights — Airtel carries five
         stints and is several times the height of MediaAgility — so a centre
         test would hold Gamezop live for most of Airtel's copy. The top edge
         arriving is what "I am reading this one now" actually means when the
         blocks are not the same size. */
      const line = innerHeight * 0.62;
      let live = 0;
      for (let i = 0; i < xpStops.length; i++) {
        if (xpStops[i].getBoundingClientRect().top <= line) live = i;
      }

      xpStops.forEach((s, i) =>
        s.setAttribute('data-active', i === live ? '1' : '0'));

      /* How far down the rail the reading position is, as a fraction of the
         whole list. Drawn as the rail's filled length. */
      if (rail) {
        const r = rail.getBoundingClientRect();
        const run = clamp01((line - r.top) / Math.max(r.height, 1));
        xp.style.setProperty('--sx-xp-run', run.toFixed(4));
      }

      showStop(live);
      warm(live + 1);            /* the next sheet, well before it is wanted */
    }

    /* First paint, and the warm-up that pays for it.

       Handing updateExperience to the frame loop is ALSO what starts this
       section, and that ordering is the whole point. Assigned up front it ran
       from the first frame of the page — which called showStop(0), which
       warmed two sheets before the reader had left the hero. Measured: fresher
       and appinventiv both arrived during page load, four screens early. The
       observer decides when this section starts costing anything, so nothing
       reaches the loop until it has fired. */
    const start = () => {
      runExperience = updateExperience;
      warm(0).then(() => updateExperience());
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (!es.some(e => e.isIntersecting)) return;
        io.disconnect();
        start();
      }, { rootMargin: '60% 0px' });
      io.observe(xp);
    } else {
      start();
    }
  }

  /* ------------------------------------------------------------------------
     The Experience ledge, on the page's own depth.
     ------------------------------------------------------------------------
     The same pass the ledge in Things That Move makes, mirrored to the other
     corner because this one is anchored to the right edge rather than the left.
     Two sections now put the hero's right_side_ledge at the frame edge and fly
     it in Z as you go by, which is what makes it read as one object turning up
     twice rather than as two green ornaments.

     WHAT IS DIFFERENT HERE, and it is the whole reason this is not a copy of the
     block downstairs: this section is 2664px tall against a 900px window, and
     the ledge is one 207px shape pinned a fixed distance down it. Driven off the
     SECTION's progress the way the other one is, the flight would run start to
     finish across 3564px of scroll while the shape is only on screen for 1107 of
     them — 31% of the pass, and the 31% centred on the middle, which is exactly
     where a signed driver is doing nothing. Every number would measure correct
     on the element and you would see about a sixth of each one. That is the same
     trap the other ledge fell into, arrived at from the opposite direction: there
     the budget was spent on axes the clipping hid, here it would be spent on
     scroll the shape is not on screen for.

     So the driver is the LEDGE's own passage through the window rather than the
     section's: -1 as it comes up past the bottom edge, 0 crossing the middle, +1
     as it leaves past the top. Same signed shape, same symmetry about the centre,
     but now the full budget is spent entirely while you can see the thing.

     It writes CUSTOM PROPERTIES rather than a transform, because the stylesheet
     is already composing the base -46% and the 17s idle float onto this element.
     Handing it a transform would erase both.

     No opacity term, unlike downstairs. That one fades at the ends of its pass to
     keep a half-strength wedge from reading as a stray shape; this ledge is at
     full strength on purpose, and depth is what keeps it in its place instead.

     Raw off the rect with no smoothing: a decoration that lags the scrollbar
     reads as the page tearing, and the idle float already supplies the looseness.
     ---------------------------------------------------------------------- */
  const xpLedge = xp && xp.querySelector('.sx-xp-ledge');
  if (xpLedge && M && M.scroll && !reduced) {
    /* X is one-sided here, which is the other half of the fix the stylesheet's
       transform-origin starts. The ledge downstairs swings both ways across its
       corner because it has an empty margin to swing into; this one has the rail's
       copy beside it, so the far end of its travel is its OWN RESTING POSITION and
       everything else is tucked further into the corner. It never occupies a pixel
       the static design did not already give it.

       That makes the pass: enters deep in the corner and small, arrives at its
       resting spot at full size as the section goes. TUCK is what you see moving,
       DEPTH is what you feel. */
    const TUCK  = 70;     /* px further into the corner at the far end */
    const DRIFT = 0.12;   /* of the viewport, each way, against the page */
    const DEPTH = 300;    /* px toward a camera 1100 out: 0.79x to 1.38x */
    const TIP   = 7;      /* degrees, each way */

    /* Where the ledge sits down the section, measured as LAYOUT rather than read
       as geometry every frame. offsetTop is a layout position and is immune to
       the transform this driver writes — which is the property that lets the
       flight be driven from the shape's own position without feeding back into
       itself. A rect read here would move because the driver moved it, and the
       ledge would chase its own tail.

       Re-measured off the section's own box rather than off window resize. This
       section's height moves for reasons the window never hears about — Satoshi
       landing and reflowing four stops of copy is the one that matters, and it
       happens after this line runs — and every one of them slides the ledge down
       the section. A ResizeObserver hears all of them, and fires once on
       observe(), so it is also the first measurement rather than an extra one.

       `live` is the same read doing a second job: offsetParent goes null exactly
       when the stylesheet hides the ledge at 720px, so the phone stops paying for
       a flight it cannot see, and picks it back up if the window grows. */
    let anchor = 0, live = false;
    const measure = () => { live = !!xpLedge.offsetParent; anchor = xpLedge.offsetTop; };
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(xp);
    else { measure(); addEventListener('resize', measure, { passive: true }); }

    /* Motion's own progress is unused: what this wants from M.scroll is the
       per-frame hook and the fact that it only runs while the section is
       anywhere near the window. The section's rect is the cheap read that turns
       that into the ledge's position, since the two move together. */
    M.scroll(() => {
      if (!live) return;
      const vh = innerHeight || 800;
      const s = 1 - 2 * clamp01((xp.getBoundingClientRect().top + anchor) / vh);
      xpLedge.style.setProperty('--sx-xpl-x', ((1 - s) * 0.5 * TUCK).toFixed(1) + 'px');
      xpLedge.style.setProperty('--sx-xpl-y', (-s * vh * DRIFT).toFixed(1) + 'px');
      xpLedge.style.setProperty('--sx-xpl-z', (s * DEPTH).toFixed(1) + 'px');
      xpLedge.style.setProperty('--sx-xpl-r', (-s * TIP).toFixed(2) + 'deg');
    }, { target: xp, offset: ['start end', 'end start'] });
  }

  /* ========================================================================
     5 · THE HANDOFF
     ========================================================================
     The block recedes before the video takes over, so there is no cut to
     notice — just something moving away that keeps moving away. Scale and
     opacity only; the out-video's own first frame does the rest.
     ====================================================================== */

  const hand = document.getElementById('sx-hand');
  const handStage = hand ? hand.querySelector('.sx-hand-stage') : null;

  function updateHandoff() {
    if (!handStage || reduced) return;

    /* Measured from the STAGE's own centre against the viewport's centre, and
       measured as "how far past centre has it gone" — not from the section's
       top edge. Reading the top edge made p ≈ 0.9 at the moment the block first
       filled the screen, so it arrived already faded out.

       p = 0 while the block sits centred; 1 once it has receded away. */
    const r = handStage.getBoundingClientRect();
    const centre = r.top + r.height / 2;
    const p = clamp01((innerHeight / 2 - centre) / Math.max(innerHeight * 0.6, 1));

    handStage.style.setProperty('--sx-hand-s', (1 - p * 0.22).toFixed(4));
    handStage.style.setProperty('--sx-hand-y', (-p * 40).toFixed(1) + 'px');
    handStage.style.setProperty('--sx-hand-o', (1 - seg(p, 0.45, 1)).toFixed(3));
  }

  /* ------------------------------------------------------------------------
     The marquee's marks.
     ------------------------------------------------------------------------
     They fly in from outside and above as the work section climbs — the same
     direction the hero's own green left the frame by, so the two greens read as
     one object continuing rather than two unrelated ornaments.

     Scrubbed, not triggered. The rest of this page is scrubbed and a marquee
     that snapped into place on a threshold would be the one element on it
     racing the scrollbar. It also means scrolling back takes the marks apart
     again, which a one-shot reveal cannot do.

     Window: the head's top from 90% down the screen to 42% up it. It starts
     BELOW the fold on purpose — the reveal fades the header in at roughly 88%
     and takes about a second over it, so a window opening at the fold itself
     spends most of its travel behind opacity 0 and you see the marks appear
     already landed. Starting after the wordmark has the floor makes it a
     sequence: the type arrives, then the marks fly in and settle on it.

     It also closes early, well above the head's resting height. A scrub can be
     parked anywhere, and a marquee frozen half-assembled reads as broken rather
     than as mid-flight — so by the time the wordmark is at a comfortable
     reading position the pair is already in place.
     ---------------------------------------------------------------------- */
  const featHead = root.querySelector('.sx-feat-head');
  const MARQUEE = { start: 0.90, end: 0.42 };

  function updateMarquee() {
    if (!featHead || reduced) return;
    const top = featHead.getBoundingClientRect().top;
    const span = Math.max(innerHeight * (MARQUEE.start - MARQUEE.end), 1);
    const p = clamp01((innerHeight * MARQUEE.start - top) / span);
    /* Cubic ease-out so the marks decelerate into place instead of sliding to a
       stop at scroll speed — the settle is the whole read. */
    featHead.style.setProperty('--sx-pix-p', (1 - Math.pow(1 - p, 3)).toFixed(4));
  }

  /* ------------------------------------------------------------------------
     The featured stack.
     ------------------------------------------------------------------------
     Every card parks on the same sticky line and the next one climbs over it.
     What this computes is one number per card: how many cards have come over
     it, as a continuous depth rather than a count, so the recession is scrubbed
     with the scroll instead of switching at a threshold.

     Coverage of card j is how far its top has closed the gap to the line, over
     a fixed run of travel. Depth of card i is the sum of the coverages below
     it, which means a card keeps rising as each further card arrives while it
     only recedes once — the design has every stacked card at the same size, on
     one shelf, separated by height alone.

     It reads .sx-feat's own rect and writes to .sx-feat-3d for a reason: the
     article is never transformed, so its rect is the true sticky position. Put
     the transform on the measured element and the next frame measures the
     result of the last one.
     ---------------------------------------------------------------------- */
  const featStack = document.getElementById('sx-feat-stack');
  const featCards = featStack ? [...featStack.querySelectorAll('.sx-feat')] : [];
  const featInner = featCards.map(c => c.querySelector('.sx-feat-3d'));
  /* The transform goes on .sx-feat-3d and the blur on the shell inside it, so
     the depth filter never has the bloom in its surface — see the stylesheet. */
  const featShell = featCards.map(c => c.querySelector('.sx-feat-shell'));
  const navPill   = document.getElementById('sx-nav');

  /* How far back one card goes. 1600 / (1600 + 519) = .755, the design's ratio
     between a stacked card and the front one — and because the Z COMPOUNDS,
     two back is 1038 and .607. That difference is the whole point: the card at
     the back of the queue has to be smaller than the one in front of it, or
     there is no queue, just two cards at the same distance. */
  const Z_STEP = 519;
  /* How dark one step of depth makes a card's face. Compounds the same way, so
     two back is 1 - .52^2 = .73 — dark enough that the deepest card recedes,
     light enough that you can still count it. */
  const DIM_STEP = 0.48;
  /* The granularity the blur radius is rounded to before it is written. See the
     note at the write itself for why the blur is stepped and the dim is not.
     GLOW_STEP does the same job for the bloom's fade: the bloom is the largest
     surface on the card and it is not promoted, so every distinct opacity is a
     repaint of the whole gradient. Neither step is visible — one is a fifth of
     a pixel of blur, the other a twentieth of the alpha on a 9%-opacity glow. */
  const BLUR_STEP = 0.2;
  const GLOW_STEP = 0.05;

  let stackTop = 0, stackGap = 40, stackP = 1600;
  /* Whether the stack is stacking at all. It is a media-query answer and a
     motion-preference answer, and neither changes while you scroll — so it is
     read in measureStack, not per frame. Asking getComputedStyle inside the
     loop forced a style recalc on every frame to learn something that had not
     changed since the last resize. */
  let stacked = false;
  /* Last radius written per card, so a frame that would rewrite the same value
     touches nothing. Most frames of a scroll are that frame. */
  const lastBlur = featCards.map(() => '');
  const lastGlow = featCards.map(() => '');

  /* Everything the stack's geometry needs, measured rather than declared.

     The nav is read off the element itself, and off its computed `top` rather
     than its rect: the pill has an arrival transform, and at page load its rect
     sits 14px high of where it will settle. The gap is then whatever room is
     left between the nav and the front card, split between the cards behind —
     which is what guarantees the one at the back clears the pill on any screen. */
  function measureStack() {
    if (!featCards.length) return;
    const cs = getComputedStyle(featCards[0]);
    stacked  = !reduced && cs.position === 'sticky';
    stackTop = parseFloat(cs.top) || 0;
    stackP   = parseFloat(cs.perspective) || 1600;

    let navLine = 96;
    if (navPill) {
      const navTop = parseFloat(getComputedStyle(navPill).top);
      if (!Number.isNaN(navTop)) navLine = navTop + navPill.offsetHeight + 10;
    }
    stackGap = Math.max(20, (stackTop - navLine) / Math.max(1, featCards.length - 1));
    fitStack();
  }
  measureStack();
  /* The cover is lazy, so the card's height is not final until it decodes —
     measure again once it has, or the fit is computed against a placeholder. */
  addEventListener('load', measureStack);

  /* How much the card has to give up to fit the viewport it is pinned in. The
     article is never transformed, so its rect is always the card's LAYOUT
     height — the scale below cannot feed back into the number that produced it.

     Recomputed on resize rather than every frame: it is a function of the
     viewport and the card's own content, and neither moves while you scroll. */
  function fitStack() {
    if (!featStack || !featCards.length) return;
    const natural = featCards[0].getBoundingClientRect().height;
    if (!natural) return;
    const fit = Math.min(1, (innerHeight - stackTop - 32) / natural);
    featStack.style.setProperty('--sx-fit', Math.max(0.62, fit).toFixed(4));
  }

  function updateStack() {
    if (!featCards.length) return;
    /* Below the stack's breakpoint the cards are a plain column. Read that off
       the CSS rather than repeating the media query here, and clear anything a
       wider layout left behind. */
    if (!stacked) {
      for (let i = 0; i < featInner.length; i++) {
        const el = featInner[i];
        if (el) {
          el.style.removeProperty('--sx-cy');
          el.style.removeProperty('--sx-cz');
          el.style.removeProperty('--sx-dim');
          el.style.removeProperty('--sx-glow');
          el.removeAttribute('data-back');
        }
        if (featShell[i]) featShell[i].style.removeProperty('--sx-blur');
        lastBlur[i] = ''; lastGlow[i] = '';
      }
      return;
    }

    /* Long enough that the recession is something you watch, short enough that
       it has finished by the time the next card is actually in front of you. */
    const travel = Math.min(460, innerHeight * 0.52);
    /* Each covering card contributes its step over the FIRST HALF of its own
       arrival, not the whole of it. Tied to the full arrival, an outgoing card
       is still near full brightness while a 250px band of it is already exposed
       above the incoming one — the crossover reading as clutter rather than as
       depth. Front-loaded per card, so the steps still sum cleanly. */
    const RECEDE = 0.5;

    /* Smoothstep, not the bare ramp. The ramp is linear between two clamps, so
       a card's recession STARTS at full speed and STOPS dead — two breaks in
       velocity per card, and the reader feels both as a catch. It is worst on
       the third card, where the front card's stop and the back card's start
       land within a few pixels of each other: card one is snapping to rest at
       d = 1 in the same frames card two is snapping into motion. Smoothstep is
       flat at both ends, so the arrivals ease into and out of one another. It
       still spans exactly 0 to 1, so the depths below still sum to whole cards. */
    const step = featCards.map(c => {
      const t = clamp01((1 - (c.getBoundingClientRect().top - stackTop) / travel) / RECEDE);
      return t * t * (3 - 2 * t);
    });

    for (let i = 0; i < featCards.length; i++) {
      const el = featInner[i];
      if (!el) continue;

      /* Depth in steps, continuous, and uncapped — two cards over this one is
         genuinely twice as far back as one. */
      let d = 0;
      for (let j = i + 1; j < featCards.length; j++) d += step[j];

      const z = Z_STEP * d;
      /* What the perspective will do to this card at that depth. Everything
         below has to be divided by it, because the projection scales the
         card's translation as well as the card. */
      const proj = stackP / (stackP + z);
      /* Even apparent steps between the stacked tops. Without the divide the
         deeper card, being more foreshortened, would drift toward the one in
         front of it and the queue would bunch up at the back. */
      const y = -(d * stackGap) / proj;
      const dim = 1 - Math.pow(1 - DIM_STEP, d);

      el.style.setProperty('--sx-cy', y.toFixed(1) + 'px');
      el.style.setProperty('--sx-cz', (-z).toFixed(1) + 'px');
      el.style.setProperty('--sx-dim', dim.toFixed(4));

      /* The blur is quantised where the dim is not, and the split is the whole
         point. Opacity is a compositor property: the scrim can hold a new value
         every frame for free, so the dimming — which is what the eye actually
         reads — stays continuous. A filter is not: every distinct radius is a
         fresh rasterisation of the card, and a continuous one re-rasterises two
         cards on every frame of the third card's arrival. Stepping it to a
         fifth of a pixel turns those hundreds of rasters into nine, over a
         range of 1.8px where nobody can see the step.

         Written to the shell, which is what carries the filter. */
      const blur = (Math.round(dim * 2.5 / BLUR_STEP) * BLUR_STEP).toFixed(2) + 'px';
      if (blur !== lastBlur[i]) {
        lastBlur[i] = blur;
        if (featShell[i]) featShell[i].style.setProperty('--sx-blur', blur);
      }

      /* Same trade for the bloom, which fades out as the card recedes. It is a
         1.3 x 2.2 card-sized gradient and it is deliberately not promoted — a
         layer that big costs more to hold than it saves — so a continuous fade
         repaints it on every frame. Stepped, it repaints about fifteen times
         across an arrival instead of every one. */
      const glow = (Math.round(dim / GLOW_STEP) * GLOW_STEP).toFixed(3);
      if (glow !== lastGlow[i]) {
        lastGlow[i] = glow;
        el.style.setProperty('--sx-glow', glow);
      }

      /* Anything meaningfully behind stops taking the pointer, so the front
         card's own controls are not sitting under two dead hit areas. */
      if (d > 0.14) el.setAttribute('data-back', '');
      else el.removeAttribute('data-back');
    }
  }

  /* ========================================================================
     MORE STORIES — the bento's arrival
     ========================================================================
     Four cards assemble into the shelf as it comes up the screen. Each one
     enters from the edge it belongs to — the tall card from the left, the wide
     bar from the right, the two small ones up from below — so the block reads
     as being SET rather than as four things fading in together.

     Scrubbed, not triggered, like everything else below the film. A shelf that
     snapped together on a threshold would be the one element on the page
     racing the scrollbar, and scrolling back would leave it assembled.

     Driven by Motion's own scroll(), with an animate() handed to it rather
     than a callback: given an animation, scroll() attaches it to a native
     ScrollTimeline where the browser has one, and the whole assembly then runs
     off the main thread. A callback would put four transform writes back on it
     every frame for no gain — the transforms are the only thing moving, and
     the compositor can hold all of them.

     Stagger is each card's own `delay` inside the shared range, which is what
     puts them in reading order without four separate scroll ranges to keep in
     step.
     ====================================================================== */
  const stGrid = document.getElementById('sx-st-grid');

  if (stGrid && M && M.scroll && !reduced) {
    /* Where each card comes from, in its own proportion rather than in pixels:
       a card that enters from 13% of its own width travels the same visual
       distance whatever the viewport did to it. The rotation is small on
       purpose — one degree past about two and a card stops reading as a plate
       being placed and starts reading as a card that is broken. */
    const ENTER = [
      ['.sx-st--coins',    { x: ['-13%', '0%'], rotate: [-1.4, 0] }],
      ['.sx-st--iptv',     { x: ['11%',  '0%'], rotate: [ 0.9, 0] }],
      ['.sx-st--wynk',     { y: ['26%',  '0%'], rotate: [-1.1, 0] }],
      ['.sx-st--parental', { y: ['30%',  '0%'], rotate: [ 1.3, 0] }],
    ];

    /* The stagger is FOUR SCROLL WINDOWS, not four delays inside one, and that
       is not a stylistic choice — scroll() normalises an animation's whole
       timeline onto the range it is given, so `delay` does not buy time, it
       just shrinks the share of the range the movement gets. Four animations
       with the same duration and different delays therefore all finish
       together, stretched, with the first card crawling across the entire
       range. Measured: the first card's travel was still resolving at 100% of
       the window when it should have been done by 55%.

       Given one window each, every animation is delay 0 and duration 1 — the
       normalisation is a no-op — and the stagger comes from where each window
       sits on the page. Each card takes 42% of the viewport's height to arrive
       and the next starts 8% behind it, so one is always landing while the
       next is already moving. */
    const SPAN = 0.42, STEP = 0.08;

    ENTER.forEach(([sel, from], i) => {
      const el = stGrid.querySelector(sel);
      if (!el) return;
      const start = 0.94 - i * STEP;
      M.scroll(
        M.animate(el,
          /* Three stops on the fade, one on everything else: opacity is up by
             the halfway point and holds, so a card is solid while it is still
             travelling rather than arriving and then appearing. */
          { ...from, opacity: [0, 1, 1], scale: [.95, 1] },
          {
            duration: 1,
            /* Ease-out, not linear. A scrubbed transform that is linear in
               scroll starts and stops at full speed; the card has to
               decelerate onto its slot or the landing is the one frame you
               notice. */
            ease: [.22, 1, .36, 1],
          }),
        { target: stGrid,
          offset: [`start ${start.toFixed(2)}`, `start ${(start - SPAN).toFixed(2)}`] }
      );
    });

    /* The cone drifts against the scroll and unwinds the last of its lean as
       it goes — a solid object passing the shelf, not a sticker on it.

       The travel used to be ±8px and read as nothing at all, for a reason that
       was real: the cone is wedged between the last case study above it and the
       top of the grid below, with about 20px of daylight at each end, and an
       earlier ±40 put its head through the bottom of the card.

       What was missing is that the constraint is on the HEAD and the parallax
       does not have to be. transform-origin is 50% 100% — the foot — so a scale
       grows the shape upward from a fixed bottom edge, which means a scale DOWN
       lowers the head and a scale UP raises it. Pair the scale with the drift so
       the two cancel at the head and the numbers come out like this:

           entering   y -30 (up)    scale 0.88 → head +32 down    net  +2
           leaving    y +46 (down)  scale 1.16 → head -43 up      net  +3

       The head effectively stands still inside its 20px of daylight while the
       foot swings 76px and the whole shape breathes between 0.88x and 1.16x.
       That is a depth cue rather than a slide, it is far more visible than what
       it replaces, and it costs no vertical room at all — which is the thing
       the old note had concluded was impossible.

       The horizontal drift is where most of the visible movement now lives, and
       the DIRECTION of it is the correction. The cone bleeds 35% of its width off
       the right edge, so it has the same problem the section ledge had: drifting
       it further right spends the motion outside the frame where nobody can see
       it, and growing it does the same. The first pass moved it right, which is
       why it read as nothing.

       So it travels LEFT as you scroll, out of the bleed and into the page, and
       back again. Crossing the frame edge is what makes it legible — the shape
       is revealed and re-hidden against a boundary the eye is already using. */
    const cone = document.getElementById('sx-st-cone');
    if (cone) {
      M.scroll(
        M.animate(cone,
          { y: [-44, 76], x: [46, -98], rotate: [-12, 8], scale: [0.74, 1.34] },
          { duration: 1, ease: 'linear' }),
        { target: stGrid, offset: ['start 1', 'end 0'] }
      );
    }
  }

  /* ------------------------------------------------------------------------
     Picking a card up.
     ------------------------------------------------------------------------
     The card lifts toward you, leans after the pointer, and its own colour
     spills onto the wall behind it while the art inside drifts the other way.
     That last pair is the whole idea: a plate with a thickness, lit from
     inside, rather than a rectangle that got 3% bigger.

     Everything moves on SPRINGS fed by motion values, not on an animate() per
     pointermove. Retargeting a duration curve sixty times a second is what
     makes a follow effect feel like it is catching up with the pointer; a
     spring is already a model of catching up, so it is handed the target and
     left alone. It also means the pointer handler does no animation work at
     all — it sets two numbers.

     Every value rests at zero and every value is written as a CSS custom
     property, so the stylesheet composes them into one transform. Nothing here
     touches .sx-st, which the scroll assembly owns.
     ---------------------------------------------------------------------- */
  if (stGrid && M && M.motionValue && M.springValue && !reduced
      && matchMedia('(hover: hover)').matches) {

    /* Two tunings. The plate is heavier than the art it carries, so it arrives
       a little later and settles without wobbling; the art is light and can
       chase. Same idea as giving them different masses, which is what they
       would have. */
    const PLATE = { stiffness: 260, damping: 26, mass: 1.1 };
    const ART   = { stiffness: 180, damping: 24, mass: 1 };

    const TILT = 4.5;   /* degrees at the corner. Past about six a card stops
                           reading as tipped and starts reading as skewed. */
    const DRIFT = 14;   /* px the art travels against the tilt */
    const LIFT = -10;   /* px toward the reader */

    stGrid.querySelectorAll('[data-st]').forEach(card => {
      const plate = card.querySelector('.sx-st-lift');
      const art   = card.querySelector('.sx-st-art img');
      if (!plate) return;

      /* One spring per axis, per thing. bind() writes the settled value
         straight to a custom property — the spring is the only thing on a
         frame loop, and it stops itself once it has arrived. */
      const spring = (unit, prop, target, cfg) => {
        const raw = M.motionValue(0);
        M.springValue(raw, cfg).on('change', v => {
          target.style.setProperty(prop, v.toFixed(3) + unit);
        });
        return raw;
      };

      const rx   = spring('deg', '--sx-rx',    plate, PLATE);
      const ry   = spring('deg', '--sx-ry',    plate, PLATE);
      const lift = spring('px',  '--sx-lift',  plate, PLATE);
      const ax   = art ? spring('px', '--sx-art-x', art, ART) : null;
      const ay   = art ? spring('px', '--sx-art-y', art, ART) : null;

      /* Scale rests at 1, not 0, so it gets its own pair. */
      const popRaw = M.motionValue(1);
      M.springValue(popRaw, PLATE).on('change',
        v => plate.style.setProperty('--sx-pop', v.toFixed(4)));
      const artSRaw = M.motionValue(1);
      if (art) M.springValue(artSRaw, ART).on('change',
        v => art.style.setProperty('--sx-art-s', v.toFixed(4)));

      /* The pointer's position in the card, -0.5 to 0.5 on each axis. Read off
         the CARD and not the plate: the plate is the thing being tilted, so
         measuring it would feed the tilt back into its own input. */
      let px = 0, py = 0, queued = 0;
      const write = () => {
        queued = 0;
        rx.set(-py * 2 * TILT);
        ry.set( px * 2 * TILT);
        if (ax) { ax.set(-px * DRIFT); ay.set(-py * DRIFT); }
      };

      card.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        const r = card.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width  - .5;
        py = (e.clientY - r.top)  / r.height - .5;
        /* Coalesced to one write per frame. A pointer can fire well above
           display rate and the springs only read their target once a frame. */
        if (!queued) queued = requestAnimationFrame(write);
      }, { passive: true });

      /* Promote for the hover and only for the hover. The plate is a rounded,
         clipped box with two large shadows, and a rotateX/rotateY on it makes
         the browser re-rasterise all of that every frame — measured at half
         again the frame cost. Hinted, the transform is the compositor's and
         the raster happens once.

         The hint is added on enter and dropped when the springs have settled,
         which is the opposite of what the shelf's blur wanted earlier in this
         file: there, three permanent layers cost more than they saved. One
         layer, for as long as a pointer is actually on the card, is the case
         will-change is for. */
      let release = 0;
      const promote = on => {
        clearTimeout(release);
        if (on) {
          plate.style.willChange = 'transform';
          if (art) art.style.willChange = 'transform';
        } else {
          /* After the springs stop, not with the pointer: dropping the hint
             mid-flight re-rasterises on the busiest frames of the return. */
          release = setTimeout(() => {
            plate.style.willChange = '';
            if (art) art.style.willChange = '';
          }, 700);
        }
      };

      card.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        promote(true);
        card.setAttribute('data-lit', '');
        lift.set(LIFT);
        popRaw.set(1.018);
        artSRaw.set(1.06);
      });

      const drop = () => {
        card.removeAttribute('data-lit');
        promote(false);
        if (queued) { cancelAnimationFrame(queued); queued = 0; }
        px = py = 0;
        rx.set(0); ry.set(0); lift.set(0); popRaw.set(1);
        if (ax) { ax.set(0); ay.set(0); artSRaw.set(1); }
      };
      card.addEventListener('pointerleave', drop);
      /* A card can lose the pointer without a leave — the pointer is captured
         elsewhere, or the window goes away mid-hover. Both would strand the
         card lifted. */
      card.addEventListener('pointercancel', drop);
      addEventListener('blur', drop);

      /* Keyboard gets the light and the lift, but not the tilt: there is no
         pointer to lean toward, and leaning toward nothing is just a card that
         will not sit straight. */
      card.addEventListener('focusin', () => {
        promote(true);
        card.setAttribute('data-lit', '');
        lift.set(LIFT); popRaw.set(1.018);
      });
      card.addEventListener('focusout', drop);
    });
  }

  /* The press is the only thing here that is not sprung from the pointer's
     position, because a press is not a position — it is an answer to a
     finger. It pushes the plate, so it composes with the lift rather than
     fighting the assembly's transform on the card. */
  if (stGrid && M && M.press && !reduced) {
    stGrid.querySelectorAll('[data-st]').forEach(card => {
      const plate = card.querySelector('.sx-st-lift');
      if (!plate) return;
      M.press(card, () => {
        plate.style.setProperty('--sx-press', '0.985');
        return () => plate.style.setProperty('--sx-press', '1');
      });
    });
  }

  /* ========================================================================
     Loop
     ======================================================================== */

  let rafId = 0, idle = 0;
  const IDLE_FRAMES = 12;
  let lastY = -1;

  function frame() {
    const y = scrollY;
    const moved = y !== lastY;
    lastY = y;

    if (runExperience) runExperience();
    updateHandoff();
    updateMarquee();
    updateStack();

    idle = moved ? 0 : idle + 1;
    rafId = idle > IDLE_FRAMES ? 0 : requestAnimationFrame(frame);
  }
  function kick() { if (!rafId) { idle = 0; rafId = requestAnimationFrame(frame); } }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => { measureStack(); kick(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  /* Paint the correct state now rather than on the first scroll, so a reload
     halfway down the page doesn't start from a cold state and animate up.
     Experience is not called here — it paints itself once its first sheet is
     warm, which is the only moment it has anything to paint. */
  updateMarquee();
  updateStack();
  updateHandoff();
  kick();


  /* ========================================================================
     THE HERO
     ========================================================================
     Two things only. The portrait nudges toward the pointer at a fraction of
     its travel — enough to feel alive in the line of type, not enough to read
     as a widget. And the stamp takes you to the work.
     ====================================================================== */

  /* --- the arrival ---
     The film's camera travels along Z, so the hero arrives along Z: it starts
     small and far with the frame blurred behind it, and comes forward. Driven
     by the landing's scroll number every frame, so scrolling back sends it away
     again and the film comes back underneath. */
  const heroLayer = document.getElementById('sx-hero-layer');
  const heroDepth = document.getElementById('sx-hero-depth');

  /* Per-element choreography.

     The group still travels along Z — that is the camera continuing — but the
     pieces inside it no longer arrive as one block. Each has its own window
     into the same progress value, so the composition assembles: labels first,
     then the line word by word, the portrait dropping in on its own beat, and
     "move." last, because it is the word the sentence is for.

     Windows are [start, end] fractions of the arrival. Everything is derived
     from one number, so it is exact in both directions — scrolling back takes
     the whole thing apart in reverse rather than fading it out. */
  /* Periphery first, then the sentence, then the things that hang off it. The
     furniture of the frame — corners, rules, marks — is in before a word of the
     headline starts, so the composition has edges to assemble inside rather
     than type appearing in a void.

     The windows overlap heavily on purpose: at any point in the arrival three
     or four pieces are in motion, which is what makes it read as one move
     rather than as a queue. */
  const HERO_STEPS = [
    /* The ground, alone, and finished before anything stands on it. The field
       is one element on one window, so the wash, the bloom and the grid arrive
       as a single surface — the page acquires a ground, and only then does the
       furniture appear on it. Overlapping this with the copy made the two read
       as one event and the ground never registered as its own.

       It is also the one step outside .sx-hero-depth, so it does not travel
       along Z with everything below. */
    ['.sx-hero-field',           .00, .24],

    /* The frame's furniture, on the ground the field just laid down. The
       portrait is no longer among it — it lives in the nav now. */
    ['.sx-mark',                 .22, .44],
    ['.sx-nav',                  .24, .46],
    /* Last of the periphery: it is the only coloured thing on the frame, so it
       lands after the greys have settled rather than leading them in. */
    ['.sx-mascot',               .28, .52],
    ['.sx-ushape',               .32, .58],
    /* The chip follows the shape it came off, not alongside it. A shard that
       lands with its parent is a second slab; one that lands just after reads
       as a piece of the first. */
    ['.sx-side-block',           .38, .62],
    /* Scoped to the first copy. The other two are stacked in the same cell and
       must stay at nothing until the rotator has the floor — an unscoped
       selector here would arrive all three sentences on top of each other. */
    ['.sx-copy[data-copy="0"] .sx-w1',  .30, .52],
    ['.sx-face',                        .40, .66],
    ['.sx-copy[data-copy="0"] .sx-w2',  .46, .70],
    ['.sx-copy[data-copy="0"] .sx-w3',  .52, .76],
    ['.sx-copy[data-copy="0"] .sx-em',  .60, .94],
    ['.sx-hero-sub',             .72, .96],
    ['.sx-stamp',                .84, 1.0]
  ];
  /* The nav floats, so it is fixed to the viewport and therefore lives at body
     level — a transformed or perspective'd ancestor would turn position:fixed
     back into position:absolute, and .sx-hero-layer is both. It still arrives
     on the hero's clock, so it is looked up on its own and joins the same list.

     `gate` marks it as needing its pointer-events driven too: out here it is no
     longer covered by the layer's own none/auto switch, and a pill at zero
     opacity would still swallow clicks over the film. */
  const navFloat = document.getElementById('sx-nav');
  const heroNodes = HERO_STEPS.map(([sel, a, b]) => ({
    els: sel === '.sx-nav'
      ? (navFloat ? [navFloat] : [])
      : (heroLayer ? [...heroLayer.querySelectorAll(sel)] : []),
    a, b,
    gate: sel === '.sx-nav',
    /* Whose value is this once the hero has landed? Anything inside a copy is
       handed to the rotator; everything else stays the arrival's for good. */
    copyOwned: sel.indexOf('.sx-copy') === 0
  }));

  const easeOut = t => 1 - Math.pow(1 - t, 3);
  /* A little overshoot on the pieces that should feel like they land rather
     than glide — the portrait and the last word. */
  const backOut = t => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

  /* --- springs, sampled by PROGRESS ---
     Motion's spring is a time integrator, and none of this runs on time: every
     number here is a function of where the scrollbar is, or the reveal could
     not be run backwards. So the spring is written closed-form instead — a
     damped oscillator settling on 1 — which gives the same overshoot-and-settle
     read while staying a pure function of t.

     `decay` is damping (higher = calmer) and `freq` is stiffness (higher =
     more bounces before it rests). */
  function springAt(t, decay, freq) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return 1 - Math.exp(-decay * t) * Math.cos(freq * t);
  }
  /* Words: one soft overshoot, ~8%. Enough to read as landing, not as bouncing. */
  const wordSpring = t => springAt(t, 7.5, 9.5);
  /* "move." gets a looser, louder one — ~20% over, and it rings twice. */
  const moveSpring = t => springAt(t, 5.2, 11.2);

  /* "move." travels to get where it is going, letter by letter. Each letter is
     a step behind the one before it, so the word arrives as a run rather than
     as a block — which is the only reason to have split it. */
  const emLetters = heroLayer ? [...heroLayer.querySelectorAll('.sx-copy[data-copy="0"] .sx-em > i')] : [];
  /* The cascade has to fit its window whatever the word is. "move." was five
     letters; "experiences" is eleven, and a fixed per-letter stagger ran the
     last of them off the end of the window so the word never finished arriving.
     Budget a fixed share of the window to the whole run and divide it up. */
  const EM_SPAN   = 0.58;     // how much of the window one letter takes
  const EM_SPREAD = 0.42;     // how much of it the stagger as a whole may use
  const emStep = HERO_STEPS.find(s => s[0] === '.sx-copy[data-copy="0"] .sx-em');

  /* One ramp, sliced across the letters, written once. Each letter paints a
     gradient sized to the whole word and offset to its own position in it, so
     the five of them still read as one sweep however far apart they fly. */
  if (heroLayer) {
    heroLayer.querySelectorAll('.sx-em').forEach(em => {
      const L = [...em.children], n = L.length;
      L.forEach((el, i) => {
        el.style.setProperty('--gs', (n * 100) + '%');
        el.style.setProperty('--gp', (n > 1 ? (i / (n - 1)) * 100 : 0).toFixed(2) + '%');
      });
    });
  }

  /* --- the portrait's place in each sentence ---
     One portrait, three layouts. Each copy carries an invisible slot where the
     portrait belongs in that line; this measures all three against the stack and
     parks the real one on the active copy's. Measured, never guessed: the slots
     are laid out by the same text engine that lays out the words, so they are
     right at any viewport and in any font.

     Re-measured on resize and after webfonts land, because both move the slot. */
  const copies    = heroLayer ? [...heroLayer.querySelectorAll('.sx-copy')] : [];
  const copiesBox = document.getElementById('sx-copies');
  const faceEl    = document.getElementById('sx-face');
  const faceImgs  = faceEl ? [...faceEl.querySelectorAll('img[data-face]')] : [];
  let facePos = [];
  let activeCopy = 0;

  /* Offsets accumulate up the offsetParent chain to a given ancestor.

     offsetLeft alone is relative to the nearest POSITIONED ancestor, and
     .sx-line-1 is position:relative — so a slot's offsetLeft is measured from
     its own copy, not from the stack. The three copies are different widths and
     each is centred in the column, so their origins differ by up to 130px:
     reading offsetLeft directly put the portrait on top of the last two letters
     of "capture". Only the widest copy, whose left edge is 0, came out right —
     which is exactly the one copy that got checked. */
  function offsetIn(el, ancestor) {
    let x = 0, y = 0, n = el;
    while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y };
  }

  function measureFace() {
    if (!copiesBox || !copies.length) return;
    /* Layout offsets, NOT getBoundingClientRect. The stack lives inside
       .sx-hero-depth, which spends the whole arrival at translateZ(-560px) —
       rect coordinates there are perspective-scaled, so measuring at init put
       the portrait 190px adrift. Offsets are layout, and layout does not care
       what the camera is doing. */
    facePos = copies.map(c => {
      const slot = c.querySelector('.sx-face-slot');
      return slot ? offsetIn(slot, copiesBox) : { x: 0, y: 0 };
    });
    placeFace(activeCopy);
  }

  function placeFace(i) {
    const at = facePos[i];
    if (!faceEl || !at) return;
    faceEl.style.setProperty('--fx', at.x.toFixed(1) + 'px');
    faceEl.style.setProperty('--fy', at.y.toFixed(1) + 'px');
  }

  if (copiesBox) {
    measureFace();
    addEventListener('resize', measureFace, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureFace, () => {});
  }

  /* ========================================================================
     THE THREE SENTENCES
     ========================================================================
     Once the hero has landed, the headline cycles. The rules that make it
     smooth rather than merely animated:

     1. Nothing relayouts. The three copies are stacked in one grid cell, so a
        change is only ever opacity and transform on boxes that were already
        laid out. No text is retyped and no width is animated.
     2. Everything goes through the SAME custom-property pipeline the arrival
        uses. Motion drives a plain object and this writes --t/--s/--dir; it
        never sets element.style.opacity. An inline opacity outranks the
        stylesheet rule, and one Motion animation touching it directly would
        permanently sever `opacity: var(--t)` and freeze the arrival.
     3. One owner at a time. While the rotator has the floor the arrival skips
        every copy-owned value, and the moment the reader scrolls back the
        rotator stands down and hands them back.
     ====================================================================== */

  const SWAP_HOLD = 2600;   // ms a sentence holds, fully arrived and readable
  const SWAP_MS   = 950;    // ms the change itself takes
  /* The two halves overlap: the incoming words are already rising while the
     outgoing ones are still leaving, so the line is never empty and the eye is
     never given a gap to notice. */
  const OUT_END   = 0.54;
  const IN_START  = 0.30;
  const OUT_STAGGER = 0.10;
  const IN_STAGGER  = 0.14;

  /* Leaving accelerates away; arriving lands on the spring. A word that sprang
     on the way out would wobble as it left, which reads as indecision. */
  const outEase   = t => t * t;
  /* The portrait travels WITH the sentence, so it wants a slow start and a slow
     stop — not a spring. A spring is 86% of the way there a sixth of the way
     in, which had it sitting in its new place waiting for the words to catch
     up. Ease-in-out is what an object moving between two points looks like. */
  const glideEase = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

  /* The three objects live stacked in the one gliding box, so the change of
     object is pure opacity — nothing moves that was not already moving.

     It runs INSIDE the glide rather than across all of it, and on a smoothstep
     rather than linearly: an object that starts dissolving on the first frame
     of the travel has already gone by the time the box is halfway, which reads
     as a picture failing to load. Beginning a quarter of the way in and
     finishing before the box lands means the swap happens at the height of the
     move, where the eye is following the travel and not auditing the art. */
  const FACE_MIX_IN  = 0.25;
  const FACE_MIX_OUT = 0.72;
  const mixEase = t => t * t * (3 - 2 * t);

  /* Cross-fading two things on plain opacity dips in the middle: at the halfway
     point both sit at .5 and the pair together reads lighter than either alone.
     Square-rooting each side holds the sum up through the crossing. */
  function paintFaceMix(from, to, m) {
    if (!faceImgs.length) return;
    const e = mixEase(m);
    for (let i = 0; i < faceImgs.length; i++) {
      let o = 0;
      if (i === to)        o = Math.sqrt(e);
      else if (i === from) o = Math.sqrt(1 - e);
      faceImgs[i].style.setProperty('--o', o.toFixed(3));
    }
  }

  function setFace(i) {
    for (let k = 0; k < faceImgs.length; k++) {
      faceImgs[k].style.setProperty('--o', k === i ? '1' : '0');
    }
  }
  setFace(0);

  const copyParts = copies.map(c => {
    const em = c.querySelector('.sx-em');
    return {
      el: c,
      words: [...c.querySelectorAll('.sx-w1, .sx-w2, .sx-w3, .sx-em')],
      em: em,
      letters: em ? [...em.children] : []
    };
  });

  let swapAnim = null, holdTimer = 0, rotating = false;

  /* v is presence: 1 is fully here, 0 is fully gone. Words run front-first in
     both directions, so the sentence leaves the way it arrived. */
  function paintCopy(i, v, leaving) {
    const P = copyParts[i];
    if (!P) return;
    const n = P.words.length;
    const stag = leaving ? OUT_STAGGER : IN_STAGGER;
    const span = Math.max(0.2, 1 - stag * (n - 1));

    for (let w = 0; w < n; w++) {
      const off = (leaving ? (n - 1 - w) : w) * stag;
      const t = clamp01((v - off) / span);
      const el = P.words[w];

      if (el === P.em) {
        /* The emphasis keeps its letter cascade on every entrance, not just the
           first — it is the payoff word in all three sentences. */
        const L = P.letters, ln = L.length;
        const lstep = ln > 1 ? EM_SPREAD / (ln - 1) : 0;
        for (let j = 0; j < ln; j++) {
          const lt = clamp01((t - j * lstep) / EM_SPAN);
          L[j].style.setProperty('--t', lt.toFixed(3));
          L[j].style.setProperty('--s', (leaving ? outEase(lt) : moveSpring(lt)).toFixed(3));
        }
      } else {
        el.style.setProperty('--t', t.toFixed(3));
        el.style.setProperty('--s', (leaving ? outEase(t) : wordSpring(t)).toFixed(3));
      }
    }
  }

  function paintSwap(from, to, v) {
    copyParts[from].el.style.setProperty('--dir', '-1');   // out goes up and left
    copyParts[to].el.style.setProperty('--dir', '1');
    paintCopy(from, 1 - seg(v, 0, OUT_END), true);
    paintCopy(to, seg(v, IN_START, 1), false);

    /* The box travels to its place in the new sentence — the whole reason it
       was lifted out of the flow — and the object inside it changes on the way.
       Two separate things on one clock: the move is the sentence's, the fade is
       the object's, and keeping the fade inside the move is what makes the pair
       read as one gesture instead of a slide plus a blink. */
    const a = facePos[from], b = facePos[to];
    if (faceEl && a && b) {
      const g = glideEase(seg(v, 0.06, 0.94));
      faceEl.style.setProperty('--fx', (a.x + (b.x - a.x) * g).toFixed(1) + 'px');
      faceEl.style.setProperty('--fy', (a.y + (b.y - a.y) * g).toFixed(1) + 'px');
    }
    paintFaceMix(from, to, seg(v, FACE_MIX_IN, FACE_MIX_OUT));
  }

  /* The exact end state, set outright rather than left wherever the animation
     stopped — a swap that ends on 0.998 leaves a copy fractionally blurred. */
  function settleCopies() {
    for (let i = 0; i < copyParts.length; i++) {
      copyParts[i].el.style.setProperty('--dir', '1');
      paintCopy(i, i === activeCopy ? 1 : 0, false);
    }
    placeFace(activeCopy);
    setFace(activeCopy);
  }

  function heroOnScreen() {
    if (!heroLayer) return false;
    const r = heroLayer.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  }

  function queueSwap() {
    clearTimeout(holdTimer);
    if (!rotating) return;
    holdTimer = setTimeout(function () {
      if (!rotating) return;
      /* Off screen or in a background tab: hold the current sentence and check
         again. Cycling a headline nobody is looking at is work for nothing, and
         it would also mean coming back to a page mid-transition. */
      if (document.hidden || !heroOnScreen()) { queueSwap(); return; }
      runSwap(activeCopy, (activeCopy + 1) % copyParts.length);
    }, SWAP_HOLD);
  }

  function runSwap(from, to) {
    const box = { v: 0 };
    const finish = () => {
      swapAnim = null;
      activeCopy = to;
      settleCopies();
      queueSwap();
    };
    if (M) {
      swapAnim = M.animate(box, { v: 1 }, {
        /* Linear, because every curve in the change is applied per word inside
           paintSwap. Easing the clock as well would ease them twice. */
        duration: SWAP_MS / 1000,
        ease: 'linear',
        onUpdate: () => paintSwap(from, to, box.v),
        onComplete: finish
      });
    } else {
      const t0 = performance.now();
      (function step(now) {
        if (!rotating) return;
        const v = Math.min((now - t0) / SWAP_MS, 1);
        paintSwap(from, to, v);
        if (v < 1) requestAnimationFrame(step); else finish();
      })(performance.now());
    }
  }

  function setRotating(on) {
    if (on === rotating) return;
    rotating = on;
    if (on) { queueSwap(); return; }

    /* Standing down. Stop where we are, put the first sentence back, and give
       the copy-owned values to the arrival — which will paint them from the
       scroll position on the very next frame. */
    clearTimeout(holdTimer);
    if (swapAnim) { try { swapAnim.stop(); } catch (e) {} swapAnim = null; }
    activeCopy = 0;
    for (let i = 0; i < copyParts.length; i++) {
      copyParts[i].el.style.setProperty('--dir', '1');
      if (i) paintCopy(i, 0, false);
    }
    placeFace(0);
    setFace(0);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && rotating) queueSwap();
  });

  function paintHero(p) {
    if (!heroLayer || !heroDepth) return;
    const k = reduced ? 1 : clamp01(p);
    const e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;

    /* The group's own travel along Z. Shorter now than the pieces' windows, so
       the camera settles first and the composition assembles into a frame that
       has already stopped moving. */
    heroDepth.style.transform = `translateZ(${(-560 * (1 - easeOut(clamp01(k / .72)))).toFixed(1)}px)`;
    heroDepth.style.opacity = '1';
    heroDepth.style.filter = k > .55 ? '' : `blur(${((1 - clamp01(k / .55)) * 10).toFixed(2)}px)`;

    heroLayer.style.background = `rgba(0,0,0,${(e * e).toFixed(3)})`;
    heroLayer.style.pointerEvents = e > .9 ? 'auto' : 'none';

    if (!reduced) {
      for (const n of heroNodes) {
        if (rotating && n.copyOwned) continue;
        const t = clamp01((k - n.a) / (n.b - n.a));
        for (const el of n.els) {
          el.style.setProperty('--t', t.toFixed(3));
          el.style.setProperty('--e', easeOut(t).toFixed(3));
          el.style.setProperty('--b', (t <= 0 ? 0 : t >= 1 ? 1 : backOut(t)).toFixed(3));
          /* --s is the spring: the same progress, arriving instead of easing. */
          el.style.setProperty('--s', wordSpring(t).toFixed(3));
          if (n.gate) el.style.pointerEvents = t > .9 ? 'auto' : 'none';
        }
      }

      /* The word the sentence is for, one letter at a time. */
      if (emLetters.length && emStep && !rotating) {
        const T = clamp01((k - emStep[1]) / (emStep[2] - emStep[1]));
        const step = emLetters.length > 1 ? EM_SPREAD / (emLetters.length - 1) : 0;
        for (let i = 0; i < emLetters.length; i++) {
          const lt = clamp01((T - i * step) / EM_SPAN);
          emLetters[i].style.setProperty('--t', lt.toFixed(3));
          emLetters[i].style.setProperty('--s', moveSpring(lt).toFixed(3));
        }
      }
    }

    /* The handover. The rotator may only have the headline once the arrival has
       finished with it, and loses it the instant the reader scrolls back. */
    setRotating(!reduced && k >= 0.999);
  }

  /* ------------------------------------------------------------------------
     The corner's departure.
     ------------------------------------------------------------------------
     The corner leaves WITH the hero, and the choice of what drives it is the
     whole point.

     #s-enter is 783vh with a 100vh sticky .hero inside it. For the first 683vh
     of that the hero is pinned: the scrollbar moves and the picture does not.
     Driving the flight off progress through that stretch — which is what the
     hold is — meant the mascot was the only thing on screen that moved, so it
     read as the corner scrolling INSTEAD of the page. It had finished leaving
     while the headline was still dead centre, mid-sentence-rotation.

     So it is driven off the section's own rect instead. The hero unpins when
     #s-enter's bottom edge reaches the fold, and travels out over the last
     100vh — that window is the only scroll on this page that actually moves
     the hero, and it is exactly the window this reads:

         0  bottom at or below the fold — pinned, corner sits still
         1  bottom at the top of the screen — section gone, corner gone

     Read raw off the rect, with no smoothing of its own. The rest of the page
     lerps toward its targets, but a lag between the hand and the corner is the
     precise complaint this is fixing.

     Real Z, not a scale that imitates it — .sx-hero-depth carries a 1000px
     perspective off-centre, so the flight also drifts toward the corner it
     leaves by, the way a thing passing you actually does.
     ---------------------------------------------------------------------- */
  const mascotEl = document.getElementById('sx-mascot');
  const ushapeEl = document.querySelector('.sx-ushape');
  const shardEl  = document.querySelector('.sx-side-block');

  /* Two slabs, each a rigid body. The robot is SITTING ON its ledge, so that
     pair shares one transform and nothing inside either group moves on its own.

     The parallax is BETWEEN the two, and it is large enough to be unmissable:
     the near slab (bigger, lower, foreground) travels further than the page
     while the far perch (smaller, higher) hangs back at half its rate. Two
     objects covering 1.15x and 0.55x of the same scroll is what depth looks
     like; matching rates is what a printed backdrop looks like.

     Both come TOWARD the camera as you go, which is the read asked for. Note
     what makes that legal: they float. A slab pinned to the page cannot lag the
     page and approach the viewer at the same time without the eye objecting —
     but one hanging free in the frame owes the page nothing, and the idle drift
     in the stylesheet is what establishes that in the first second you look.
     Depth cues that disagree are worse than none; these agree because the
     premise underneath them changed. */
  /* ONE near layer, holding both shapes, with the hero behind it. That is the
     model the reference works on and it is not what was here before: the last
     pass gave the two shapes different rates and read the parallax BETWEEN
     them. Wrong axis. The parallax that matters is between this layer and the
     page — the two shapes belong to the same plane, so they share a depth, a
     rate and an advance, and everything that separates them comes from where
     they sit relative to the camera.

     What sells it is that the camera pushes FORWARD. Under a perspective whose
     origin is between them, a shape left of that axis coming toward you slides
     further left and grows; one to the right slides right. They part, and you
     go through the gap. That divergence is not animated anywhere below — it
     falls out of the projection, which is why both entries are identical.

     Vertical travel is deliberately low. At the page's own rate the pair would
     be dragged off the TOP before the advance had done anything, and being
     carried up is exactly the "not towards the screen" this is fixing. Held
     back, they leave by the sides instead, which is the whole picture. */
  const LAYER = {
    travel:  .50,   /* of the page's own — the layer lags, the dolly does the rest */
    advance: 620,   /* px toward a camera 1000 out: the pair grows to 2.6x */
    fade:  [.86, 1]
  };
  const SLABS = [
    { el: mascotEl, v: 'm', tip: -2.5 },   /* tips are character, not depth: */
    { el: ushapeEl, v: 'l', tip:  2   },   /* the set never looks stamped */
    /* The shard belongs to the counterweight's plane, so it takes the same
       travel, advance and fade — identical numbers are the whole point. Its
       tip is steeper only because a loose chip has less to hold it level. */
    { el: shardEl,  v: 'b', tip:  3.4 }
  ];

  function paintDepth(p) {
    const a = reduced ? 0 : clamp01(p);
    const vh = innerHeight || 0;

    /* One set of numbers, applied to both — they are the same layer. */
    const y = ((1 - LAYER.travel) * a * vh).toFixed(1) + 'px';
    const z = (a * LAYER.advance).toFixed(1) + 'px';
    const o = (1 - clamp01((a - LAYER.fade[0]) / (LAYER.fade[1] - LAYER.fade[0]))).toFixed(3);

    for (const s of SLABS) {
      if (!s.el) continue;
      /* Each shape is a child of the hero, so the page has already moved it -S.
         Travelling only its share means giving the difference back. */
      s.el.style.setProperty('--sx-' + s.v + 'y', y);
      s.el.style.setProperty('--sx-' + s.v + 'z', z);
      s.el.style.setProperty('--sx-' + s.v + 'o', o);
      s.el.style.setProperty('--sx-' + s.v + 'r', (a * s.tip).toFixed(2) + 'deg');
    }
  }

  /* How far the hero has travelled out of the viewport, 0-1. Rect-based rather
     than scroll-arithmetic so it needs no knowledge of the section's height,
     the film's duration, or where the engine thinks the hold ended. */
  const sEnterEl = document.getElementById('s-enter');
  function departure() {
    if (!sEnterEl) return 0;
    const r = sEnterEl.getBoundingClientRect();
    return innerHeight > 0 ? clamp01(1 - r.bottom / innerHeight) : 0;
  }

  /* ONE follower, because there is one object. It trails the scroll slightly so
     the perch has weight rather than being nailed to the scrollbar — but both
     pieces trail by the same amount, which is the only way they can trail at
     all without coming apart. */
  const FOLLOW = .14;
  const SNAP   = .0005;        /* close enough to land on and stop */
  let bodyP = 0, depthRaf = 0;

  /* Its own listener, not the film engine's loop. That loop parks once its two
     progress values stop changing, and both have saturated by the time the hero
     starts leaving — so it is asleep for exactly the window this needs. */
  function depthTick() {
    depthRaf = 0;
    const target = departure();
    if (reduced) bodyP = target;
    else {
      bodyP += (target - bodyP) * FOLLOW;
      if (Math.abs(target - bodyP) < SNAP) bodyP = target;
    }
    paintDepth(bodyP);
    /* Keep going while it is still travelling, however long ago the scrolling
       stopped — otherwise the trail freezes mid-catch-up. */
    if (bodyP !== target) depthRaf = requestAnimationFrame(depthTick);
  }
  const wakeDepth = () => { if (!depthRaf) depthRaf = requestAnimationFrame(depthTick); };
  addEventListener('scroll', wakeDepth, { passive: true });
  addEventListener('resize', wakeDepth, { passive: true });

  window.SX = window.SX || {};
  window.SX.hero = paintHero;
  window.SX.depth = paintDepth;
  bodyP = departure();
  paintDepth(bodyP);
  paintHero(0);

  const heroEl = document.getElementById('sx-hero-layer');
  if (heroEl && !reduced && matchMedia('(pointer: fine)').matches) {
    let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
    const ease = () => {
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      heroEl.style.setProperty('--sx-px', px.toFixed(2));
      heroEl.style.setProperty('--sx-py', py.toFixed(2));
      raf = (Math.abs(tx - px) > 0.01 || Math.abs(ty - py) > 0.01)
        ? requestAnimationFrame(ease) : 0;
    };
    heroEl.addEventListener('pointermove', (e) => {
      const r = heroEl.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2 * 18;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2 * 18;
      if (!raf) raf = requestAnimationFrame(ease);
    }, { passive: true });
  }

  const stamp = document.getElementById('sx-to-work');
  const workSec = document.getElementById('sx-work');
  if (stamp && workSec) {
    stamp.addEventListener('click', () => {
      workSec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
    if (M && M.press) M.press(stamp, () => {
      M.animate(stamp, { scale: .94 }, { duration: .12 });
      return () => M.animate(stamp, { scale: 1 }, { type: 'spring', stiffness: 420, damping: 16 });
    });
  }

  /* ========================================================================
     THE BENTO
     ========================================================================
     Three behaviours, all of them cheap: plates arrive on a spring, their
     contents drift at their own depth under the pointer, and two numbers count
     themselves up the first time they are seen.
     ====================================================================== */

  const bento = document.getElementById('sx-bento');

  if (bento) {
    const tiles = [...bento.querySelectorAll('[data-tile], .sx-t-cta')];

    /* --- entrance ---
       Spring, not a duration curve: plates should land with a little weight
       rather than glide to a stop. stagger() walks them in reading order.

       Individual transform properties (y, scale), never a raw `transform`
       string: passing ['translateY(26px) scale(.97)', 'none'] made Motion read
       the 'none' keyword as scale 0, and every tile animated to zero size.
       Fired on first sight rather than at load, so the stagger is something the
       reader actually watches happen. */
    if (M && !reduced) {
      const enter = () => M.animate(tiles,
        { opacity: [0, 1], y: [26, 0], scale: [.97, 1] },
        { delay: M.stagger(0.055), type: 'spring', stiffness: 190, damping: 22, mass: .9 });
      if (M.inView) M.inView(bento, () => { enter(); }, { amount: 0.15 });
      else enter();
    }

    /* --- parallax ---
       One pointer read for the whole grid, written as two custom properties on
       the container. Each .sx-layer multiplies them by its own --sx-depth, so
       the whole effect costs two setProperty calls per frame no matter how many
       layers there are. Negative depths move against the pointer, which is what
       puts the portrait behind its own frame. */
    if (!reduced && matchMedia('(pointer: fine)').matches) {
      let px = 0, py = 0, tx = 0, ty = 0, raf = 0;

      const ease = () => {
        px += (tx - px) * 0.09;
        py += (ty - py) * 0.09;
        bento.style.setProperty('--sx-px', px.toFixed(2));
        bento.style.setProperty('--sx-py', py.toFixed(2));
        raf = (Math.abs(tx - px) > 0.01 || Math.abs(ty - py) > 0.01)
          ? requestAnimationFrame(ease) : 0;
      };
      const wake = () => { if (!raf) raf = requestAnimationFrame(ease); };

      addEventListener('pointermove', (e) => {
        const r = bento.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;   // off screen, don't bother
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2 * 14;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2 * 14;
        wake();
      }, { passive: true });

      /* Per-tile sheen. Same two properties the work slabs use. */
      tiles.forEach(tile => {
        tile.addEventListener('pointermove', (e) => {
          const r = tile.getBoundingClientRect();
          tile.style.setProperty('--sx-mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
          tile.style.setProperty('--sx-my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        }, { passive: true });
      });

      /* Press feedback on the one tile that is a control. */
      const cta = document.getElementById('sx-to-work');
      if (M && cta) M.press(cta, () => {
        M.animate(cta, { scale: 0.985 }, { duration: .12 });
        return () => M.animate(cta, { scale: 1 }, { type: 'spring', stiffness: 420, damping: 18 });
      });
    }

    /* --- counters ---
       Counted from zero the first time the tile is seen. A static number is a
       fact; a number that arrives is a small event, and the bento is built out
       of small events. */
    const counters = [...bento.querySelectorAll('[data-count]')];
    const runCount = (el) => {
      const to = parseFloat(el.getAttribute('data-count')) || 0;
      const suffix = el.getAttribute('data-suffix') || '';
      if (reduced || !M) { el.textContent = to + suffix; return; }
      const box = { v: 0 };
      M.animate(box, { v: to }, {
        duration: 1.15, ease: [.22, 1, .36, 1],
        onUpdate: () => { el.textContent = Math.round(box.v) + suffix; }
      });
    };
    if (M && M.inView && !reduced) {
      counters.forEach(el => M.inView(el, () => { runCount(el); }, { amount: 0.6 }));
    } else {
      counters.forEach(runCount);
    }

    /* --- the clock ---
       Real IST, ticking. Computed from UTC rather than the visitor's clock, so
       it says what time it is where he is — which is the only reason to put a
       clock on a portfolio at all. */
    const clock = document.getElementById('sx-clock');
    if (clock) {
      const tick = () => {
        const n = new Date();
        const ist = new Date(n.getTime() + (n.getTimezoneOffset() + 330) * 60000);
        clock.textContent = [ist.getHours(), ist.getMinutes(), ist.getSeconds()]
          .map(v => String(v).padStart(2, '0')).join(':');
      };
      tick();
      setInterval(tick, 1000);
    }

    /* --- the way down --- */
    const cta = document.getElementById('sx-to-work');
    const work = document.getElementById('sx-work');
    if (cta && work) {
      cta.addEventListener('click', () => {
        work.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      });
    }
  }

  /* ========================================================================
     THINGS THAT MOVE — the strip that arrives at speed
     ========================================================================
     Every other section on this page assembles out of stillness. This one is
     already running when you meet it and slows down as you arrive, which is
     both the inversion the page needed and what a reel actually does. So the
     entrance is not an entrance animation: it is the marquee's own PLAYBACK
     RATE, driven by how far into the section you have scrolled.

     That is why the travel is one Motion animation rather than the CSS
     keyframe it used to be. A keyframe can be paused and it can be re-timed,
     but re-timing it jumps — the strip teleports to wherever the new duration
     says it should be by now. An animation object has a speed you can turn
     continuously, from eight down to one, with no seam anywhere in it.

     The CSS keyframe is still in the stylesheet as the no-script state. The
     data-rolling attribute here is what switches it off, so the two never
     drive the same transform at once.
     ====================================================================== */
  const mvReel  = document.getElementById('sx-reel');
  const mvStrip = mvReel && mvReel.querySelector('.sx-reel-strip');

  /* Counted, not typed. The strip is duplicated for the loop so the first run
     is the real inventory — and a number in the markup is a number that goes
     stale the first time a piece is added. */
  const mvN = document.getElementById('sx-mv-n');
  if (mvN && mvStrip) {
    const first = mvStrip.querySelector('.sx-reel-run');
    if (first) mvN.textContent = String(first.querySelectorAll('.sx-cel').length);
  }

  if (mvStrip && M && M.animate && !reduced) {
    /* --- the strip, and why it is no longer an animation ---
       This used to be one Motion animation from 0% to -50% with its `speed`
       turned by the scroll. That was the right shape for a strip that only had
       to arrive: an animation object has a playback rate you can turn
       continuously, which a CSS keyframe does not.

       It is the wrong shape for a strip you can take hold of. An animation owns
       its own transform and its own clock, so a drag has to fight it for both —
       you can seek it, but seeking a -50% keyframe means converting pixels of
       hand movement into a fraction of a duration and back, twice a frame, and
       every hand-off between "the animation is driving" and "the pointer is
       driving" is a seam you can feel.

       So the position is now just a NUMBER, and one loop writes it. Cruise,
       scroll heat, drag, flick and wheel are five things that all add into the
       same number, which means none of them has to know about the others and
       none of them can contradict another. The strip is where `offset` says it
       is, always.
       ------------------------------------------------------------------ */
    const firstRun = mvStrip.querySelector('.sx-reel-run');

    /* One lap is a run PLUS one gap, and it is measured rather than assumed.
       The old -50% was very slightly wrong for exactly this reason: half of
       (run + gap + run) is a run plus half a gap, so the loop jumped back by
       half a gap on every pass. At 8px in 92 seconds nobody was ever going to
       see it, but the modulo below has to be exact or the seam walks. */
    let lap = 0;
    /* Declared up here with lap, because measure() -> place() touches it and
       the first measure() runs before the block below. */
    let offset = 0;              /* px the strip is shifted left; the whole state */

    const lapNow = () => {
      if (!firstRun) return 0;
      const gap = parseFloat(getComputedStyle(mvStrip).columnGap) || 0;
      return firstRun.getBoundingClientRect().width + gap;
    };
    const measure = () => {
      const next = lapNow();
      if (!next || Math.abs(next - lap) < 0.5) return;
      lap = next;
      place();
    };

    /* --- why the lap is re-measured at the wrap and not just at startup ---
       A cell is `flex: none`, so its width is its max-content width — and a
       caption wider than its plate is what sets it. Captions are text, text is
       webfont, and the webfont arrives after this script does. The run measured
       at startup is the run in the FALLBACK face, and it is not the run you end
       up looking at: measured here, the difference was 225px on a 5.6kpx lap.

       A stale lap does not drift, it JUMPS. The modulo hands the strip back 225px
       short exactly once per lap, which is a teleport in the middle of the one
       section on the page that cannot afford one — and it is invisible in
       testing until you happen to watch the seam.

       The obvious fix is a ResizeObserver on the run, and it is here, along with
       the font and resize signals. But none of them is TRUSTED, because none of
       them proved reliable for this particular reflow — the observer sat silent
       through a swap that moved the run 225px. So the guarantee comes from
       place() instead: the lap is re-read at the instant the strip is about to
       wrap, which is the only instant its value can be observed. That costs one
       layout read per lap — about one every ninety seconds at cruise — and it
       is right by construction rather than by a notification arriving. */
    if ('ResizeObserver' in window && firstRun) new ResizeObserver(measure).observe(firstRun);
    addEventListener('resize', measure, { passive: true });
    addEventListener('load', measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});
    measure();

    /* The cruise, in pixels per second rather than as a duration, because the
       loop now thinks in speed. 63px/s is what the old 92-second cruise worked
       out to at 1600 and it is the same judgement it always was: a landscape
       tile takes nine seconds to cross, the reel comes round in about a minute
       and a half. Faster reads as a ticker, slower reads as stalled.

       Stating it as a speed rather than a duration also fixes something the
       duration quietly got wrong — a fixed 92s meant a longer strip travelled
       FASTER. Pixels per second is the same reel at any inventory. */
    const CRUISE_PX = 63;
    const ENTRY_SPEED = 9;
    const MAX_FLICK = 4500;      /* px/s — past this it is a blur, not a browse */
    const FRICTION = 0.94;       /* per 60th — a thrown strip glides about a second */

    let heat = 1;                /* 1 arriving hot, 0 settled */
    let vel = 0;                 /* px/s the hand has added on top of the cruise */
    let hovering = false;
    let dragging = false;
    let onScreen = true;
    let raf = 0, last = 0;

    mvStrip.setAttribute('data-rolling', '');

    /* Hover holds the cruise — but only the cruise. Drag and wheel still move
       the strip while the pointer is on it, which is the whole model: hover to
       hold it still, then move it yourself. */
    const cruise = () =>
      (hovering || dragging) ? 0 : CRUISE_PX * (1 + (ENTRY_SPEED - 1) * heat * heat);

    /* A declaration rather than a const arrow: measure() calls it, and the
       first measure() runs above this line. */
    function place() {
      /* About to wrap — so this is the moment the lap has to be right. See the
         note above measure(): a stale lap is a visible teleport at the seam,
         and this is the one place that can catch it without polling. */
      if (lap <= 0 || offset >= lap || offset < 0) {
        const fresh = lapNow();
        if (fresh) lap = fresh;
      }
      if (lap > 0) offset = ((offset % lap) + lap) % lap;
      mvStrip.style.transform = 'translate3d(' + (-offset).toFixed(2) + 'px, 0, 0)';
    }

    /* Parked whenever there is nothing to do — off screen, in a hidden tab, or
       held still with no throw left in it. A marquee painting behind a tab
       nobody is looking at is the cheapest frame on the page to not draw. */
    const busy = () => onScreen && !document.hidden && (dragging || vel !== 0 || cruise() > 0);
    const wake = () => {
      if (raf || !busy()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    function tick(now) {
      raf = 0;
      /* Clamped, so a tab that was backgrounded for a minute does not come
         back and teleport the strip a minute's worth of travel. */
      const dt = Math.min(0.05, (now - last) / 1000) || 0;
      last = now;
      if (!dragging) {
        offset += (cruise() + vel) * dt;
        vel *= Math.pow(FRICTION, dt * 60);
        if (Math.abs(vel) < 2) vel = 0;
      }
      place();
      if (busy()) raf = requestAnimationFrame(tick);
    }

    /* --- taking hold of it ---
       Pointer events rather than mouse or touch, so a mouse, a trackpad press,
       a pen and a finger are one code path. The capture is what makes a drag
       survive leaving the strip: let go somewhere over the footer and the
       throw still lands. */
    let dragId = null, lastX = 0, lastT = 0, moved = 0;
    if (mvReel) {
      mvReel.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragId = e.pointerId;
        dragging = true;
        vel = 0;
        moved = 0;
        lastX = e.clientX;
        lastT = e.timeStamp;
        mvReel.dataset.grab = '';
        try { mvReel.setPointerCapture(e.pointerId); } catch (_) {}
        wake();
      });

      mvReel.addEventListener('pointermove', e => {
        if (!dragging || e.pointerId !== dragId) return;
        const dx = e.clientX - lastX;
        const dt = Math.max(1, e.timeStamp - lastT);
        lastX = e.clientX;
        lastT = e.timeStamp;
        moved += Math.abs(dx);
        /* Drag right, strip goes right. offset counts leftward travel, so it
           takes the opposite sign — the content follows the hand, which is the
           only mapping anybody ever expects. */
        offset -= dx;
        place();
        /* A rolling average rather than the last sample. One jittery frame at
           the moment of release should not decide how hard the strip is thrown,
           and on a trackpad the last sample before lift-off is very often a
           stray pixel in the wrong direction. */
        vel = vel * 0.72 + (-dx / dt * 1000) * 0.28;
      });

      const release = e => {
        if (!dragging || (dragId !== null && e.pointerId !== dragId)) return;
        dragging = false;
        dragId = null;
        delete mvReel.dataset.grab;
        vel = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, vel));
        wake();
      };
      mvReel.addEventListener('pointerup', release);
      mvReel.addEventListener('pointercancel', release);
      /* A pointer that vanishes without an up — the window going away
         mid-drag — otherwise leaves the strip frozen mid-grab forever. */
      addEventListener('blur', () => { if (dragging) release({ pointerId: dragId }); });

      /* --- the wheel ---
         Two gestures arrive here and they are NOT the same gesture, so they are
         not treated the same.

         A sideways swipe on a trackpad is unambiguous: nothing else on this page
         reads deltaX, the user is pushing horizontally at a horizontal thing, so
         it is taken outright and mapped one-to-one. The trackpad's own inertia
         keeps arriving as decaying deltas after the fingers lift, which is why
         this needs no momentum of its own — the OS already sent it.

         A vertical wheel is the page's, and swallowing it would trap the reader
         at this section with no way past a full-bleed strip. So it is BORROWED
         rather than taken: the page scrolls exactly as it always would, and the
         same spin also shoves the strip along. Spin the wheel over the reel and
         it whips; spin it anywhere else and the page just scrolls. Nothing is
         taken away from anybody. */
      mvReel.addEventListener('wheel', e => {
        const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const raw = horiz ? e.deltaX : e.deltaY;
        /* Firefox reports lines, and some setups report pages. */
        const px = e.deltaMode === 1 ? raw * 16
                 : e.deltaMode === 2 ? raw * (innerHeight || 800)
                 : raw;
        if (horiz) {
          e.preventDefault();
          offset += px;
          place();
        } else {
          vel = Math.max(-MAX_FLICK, Math.min(MAX_FLICK, vel + px * 6));
        }
        wake();
      }, { passive: false });
    }

    /* --- the mascot ---
       Two poses. Vibing to the music is what it does; the moonwalk is a
       one-shot you ask for, and it goes back to vibing after.

       The vibe's rate is the STRIP'S rate, which is the reason for driving it
       from here rather than as a fixed loop: the character dances faster while
       the reel is coming in fast and settles as the reel settles. Not
       one-for-one — nine times normal through twelve frames is a flicker, not
       a dance — so it takes a fifth of the excess and caps at 1.8.

       It follows the strip's HEAT and no longer its hover. Those used to be one
       state, and holding the strip froze the character too; now that the strip
       stops under any pointer that crosses it, that would mean the music
       stopping every time somebody reached for a tile. The reel settling is
       something the character is dancing to. The reel being touched is not.

       The moonwalk does NOT follow the strip at all. It is danced at somebody,
       so it keeps its own tempo whatever the scroll is doing: a direct answer
       to a pointer outranks the ambient state of the page. */
    const POSES = {
      vibe: { cols: 6, rows: 2, frames: 12, cycle: 1900 },
      walk: { cols: 6, rows: 4, frames: 24, cycle: 2100 },
    };
    const mascot = document.getElementById('sx-mv-mascot');
    /* One layer per sheet. The sprite animates whichever layer the pose has
       made visible; the pose itself never touches a background-image, which is
       what used to send the browser back to the network mid-hover. */
    const sheets = mascot ? {
      vibe: mascot.querySelector('.sx-mv-sheet[data-sheet="vibe"]'),
      walk: mascot.querySelector('.sx-mv-sheet[data-sheet="walk"]'),
    } : {};
    let sprite = null, posing = false;

    /* A pose's keyframes: one held cell per frame. Held and never
       interpolated — a sprite that tweens between two cells slides the sheet
       across the window and shows halves of both. */
    const poseKeys = ({ cols, rows, frames }) => {
      const keys = [];
      for (let i = 0; i < frames; i++) {
        keys.push({
          backgroundPosition:
            `${(i % cols) * (100 / (cols - 1))}% ` +
            `${Math.floor(i / cols) * (rows > 1 ? 100 / (rows - 1) : 0)}%`,
          easing: 'steps(1, end)',
        });
      }
      keys.push({ backgroundPosition: '0% 0%' });
      return keys;
    };

    const playPose = name => {
      const layer = sheets[name];
      if (!layer || !layer.animate) return null;
      if (sprite) sprite.cancel();
      const pose = POSES[name];
      mascot.dataset.pose = name;
      sprite = layer.animate(poseKeys(pose),
        { duration: pose.cycle, iterations: Infinity });
      return sprite;
    };

    const spriteRate = rate => Math.min(1.8, 1 + (rate - 1) * 0.2);
    const applySpeed = () => {
      const rate = 1 + (ENTRY_SPEED - 1) * heat * heat;
      /* `posing` means the moonwalk has the sprite. Leave it alone — the
         strip's state must not reach in and re-rate a performance that is
         halfway through. */
      if (sprite && !posing) {
        if (document.hidden) sprite.pause();
        else { sprite.play(); sprite.playbackRate = spriteRate(rate); }
      }
      syncNotes();
      wake();
    };

    if (M.scroll) {
      M.scroll(p => {
        /* Only ever falls. Scrolling back up does not wind the strip up
           again — a reel that re-accelerated when you looked away would read
           as a gimmick rather than as a machine that has settled. */
        const next = 1 - clamp01(p);
        if (next < heat) {
          heat = next;
          mvStrip.style.setProperty('--sx-mv-heat', heat.toFixed(3));
          applySpeed();
        }
      }, { target: mvReel, offset: ['start 0.95', 'start 0.32'] });
    }

    /* Hover holds it, which is the convenience — and now that the button is
       gone it is also the control, together with the drag and the wheel. */
    if (mvReel) {
      mvReel.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        hovering = true; wake();
      });
      mvReel.addEventListener('pointerleave', () => { hovering = false; wake(); });
      mvReel.addEventListener('focusin',  () => { hovering = true;  wake(); });
      mvReel.addEventListener('focusout', () => { hovering = false; wake(); });
    }

    /* A strip travelling behind a hidden tab, or a hundred viewport-heights up
       the page, is work nobody is watching. */
    if ('IntersectionObserver' in window && mvReel) {
      new IntersectionObserver(es => {
        onScreen = es.some(e => e.isIntersecting);
        wake();
      }, { rootMargin: '20% 0px' }).observe(mvReel);
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (sprite) sprite.pause(); }
      else if (posing && sprite) sprite.play();
      applySpeed();
    });

    /* ====================================================================
       THE MUSIC NOTES
       ====================================================================
       The vibe sheet has the character listening to something the page never
       showed. These are that something.

       Tied to the POSE, not to hover: they come with the vibe and stop the
       instant it moonwalks, because the moonwalk is danced at you and the music
       is ambient. They also stop when the stand is off screen or the tab is
       hidden, for the same reason the strip does.

       Each note is spawned, flown once and thrown away. Nothing is pooled and
       nothing is reused, which is deliberate: there are two or three of these
       alive at a time and a pool would be more state than the thing is worth.
       ==================================================================== */
    const noteHost = document.getElementById('sx-mv-notes');
    let notesOn = false, noteTimer = 0, standSeen = true;

    /* A note's whole flight, sampled rather than keyframed.

       The first version had four keyframes with three different easings between
       them, and that is exactly why it read as jerky: every boundary between two
       different easing curves is a step change in VELOCITY. The eye does not see
       the positions, it sees the sudden changes in speed, and there were three of
       them in under two seconds.

       So the path is now a continuous function sampled at thirty points with
       `linear` between each — piecewise-linear through a smooth curve is smooth,
       and there is no boundary anywhere for a velocity to jump at.

       The function is a balloon, which is a specific thing and not just "slow":
         · it rises at CONSTANT speed. Buoyancy does not ease out, and an
           ease-out rise is the single thing that most makes a floating object
           read as an animation instead of as an object.
         · it sways side to side, and the sway WIDENS as it climbs — higher air
           is looser air.
         · it rocks in step with the sway, a beat behind it, the way a balloon
           hangs off its own string.
         · it never shrinks. Things that recede shrink; things that drift toward
           you swell slightly, and a balloon does the latter.
         · it thins out rather than switching off, over the top third.

       --- on the tempo ---
       The smooth version of this was also a SLOW version of it, and those two
       things were never the same requirement. The first pass was jerky and
       lively; the second was smooth and sleepy, and the sleepiness was the part
       that stopped matching the character — the mascot is vibing at up to 1.8x
       through a twelve-frame loop, and notes taking five seconds to clear its
       head belong to a different animal.

       So the smoothness stays, because that came from the sampling and costs
       nothing, and the TIMING goes back to roughly where it was: a flight of two
       to three seconds against the old 1.7-2.6, and a pop-in rather than a swell.
       What does not go back is the count — three or four in the air, not six.
       Lively is a rate of change; a swarm is just a lot of objects.

       The sway period is set against the vibe's own 1.9s cycle rather than
       against the note's duration, so the notes and the dance share a beat
       instead of drifting through each other. That is the one thing here that is
       new rather than recovered. */
    const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

    const spawnNote = () => {
      if (!noteHost || !mascot) return;
      /* Three or four in the air, never a swarm. The cadence below mostly keeps
         it there; this is the ceiling that holds even if a tab wakes up with
         several beats owed. */
      if (noteHost.childElementCount >= 4) return;

      const w = mascot.getBoundingClientRect().width || 140;
      const el = document.createElement('span');
      el.className = 'sx-mv-note';
      el.dataset.n = Math.random() < 0.5 ? '1' : '2';

      /* Which shoulder it comes off, and how far out. Notes that all rise from
         one point read as a fountain; off both sides at different distances and
         heights they read as coming off a character. Every number is a share of
         the mascot's own width, so the scatter scales with it. */
      const side  = Math.random() < 0.5 ? -1 : 1;
      const x0    = side * w * (0.13 + Math.random() * 0.26);
      const y0    = w * (Math.random() * 0.14 - 0.04);
      const rise  = w * (0.72 + Math.random() * 0.50);
      const dx    = side * w * (0.05 + Math.random() * 0.16);
      const amp   = w * (0.05 + Math.random() * 0.055);    /* sway */
      const phase = Math.random() * Math.PI * 2;
      const tilt  = 8 + Math.random() * 10;
      const r0    = Math.random() * 16 - 8;
      const size  = w * (0.085 + Math.random() * 0.038);
      el.style.setProperty('--n-size', size.toFixed(1) + 'px');

      /* Two to three seconds, near where the first version was. */
      const dur = 2000 + Math.random() * 900;
      /* Sway cycles measured against the VIBE's cycle, not against the note's
         own duration — so a short flight gets fewer sways rather than faster
         ones, and every note is swinging on the same beat the character is
         dancing to. */
      const turns = (dur / POSES.vibe.cycle) * (0.62 + Math.random() * 0.34);

      const STEPS = 30, PEAK = 0.88;
      const keys = [];
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const wob = Math.sin(phase + t * Math.PI * 2 * turns);
        const y   = y0 - rise * t;
        const x   = x0 + dx * t + amp * wob * (0.4 + t);
        const rot = r0 + tilt * Math.sin(phase + t * Math.PI * 2 * turns - 0.55);
        /* Pops in over the first eighth rather than swelling over the first
           fifth — the snap the original had, kept smooth by the smoothstep. */
        const sc  = (0.48 + 0.52 * smooth(t / 0.13)) * (1 + t * 0.07);
        const op  = smooth(t / 0.09) * (1 - smooth((t - 0.66) / 0.34));
        keys.push({
          offset: t,
          transform: 'translate3d(' + x.toFixed(2) + 'px, ' + y.toFixed(2) + 'px, 0) '
                   + 'rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')',
          opacity: (op * PEAK).toFixed(3),
          easing: 'linear',
        });
      }

      noteHost.appendChild(el);
      const a = el.animate(keys, { duration: dur, fill: 'forwards' });
      const drop = () => el.remove();
      a.onfinish = drop;
      a.oncancel = drop;
    };

    const noteBeat = () => {
      noteTimer = 0;
      if (!notesOn) return;
      spawnNote();
      /* Uneven on purpose. A fixed interval is a metronome, and a metronome is
         the one thing music notes must not look like.

         Against a two-and-a-half-second flight this keeps three or so in the
         air. The first version's 250-680ms put five or six up and turned a
         character humming along into a character being swarmed; 1500-2600 then
         over-corrected into one note at a time drifting through a long silence.
         This sits between them, which is where it should have been. */
      noteTimer = setTimeout(noteBeat, 620 + Math.random() * 560);
    };

    function syncNotes() {
      const want = !!noteHost && !posing && standSeen && !document.hidden
                   && mascot && mascot.dataset.pose === 'vibe';
      if (want === notesOn) return;
      notesOn = want;
      if (want) noteBeat();
      else if (noteTimer) { clearTimeout(noteTimer); noteTimer = 0; }
      /* Notes already in the air are left to finish. Cutting them at the same
         moment the pose changes reads as a glitch; letting the last two rise
         and fade reads as the music trailing off. */
    }

    const stand = mascot && (mascot.closest('.sx-mv-stand') || mascot.parentElement);
    if (stand && 'IntersectionObserver' in window) {
      standSeen = false;
      new IntersectionObserver(es => {
        standSeen = es.some(e => e.isIntersecting);
        syncNotes();
      }, { rootMargin: '10% 0px' }).observe(stand);
    }

    /* --- asking for the moonwalk ---
       Hover, not click, and that changes what this control IS. A click is a
       request that something happen; hover is only attention. So the moonwalk
       loops for exactly as long as the pointer is on the character and drops
       back to vibing the moment it leaves — nothing to finish, nothing to sit
       through. That also lets both poses loop, where the dab sheet had to play
       once: a dab has a beginning and an end, a moonwalk is a cycle.

       Focus does the same thing, because hover is not available to everybody
       and a keyboard should not be shut out of the one toy on the page. It is
       also why this stays a <button>: the only element that is reliably
       focusable and announced, and tabbing to it does what its label says. */
    if (mascot && mascot.animate) {
      playPose('vibe');
      applySpeed();

      /* --- warming the walk sheet ---
         This is where the character used to vanish, and the previous fix
         warmed the wrong thing.

         It preloaded the sheet into an `Image()` and waited for that, which is
         a perfectly good way to know the BYTES have arrived — and then the pose
         switched `background-image`, and a CSS background is a resource of its
         own. The browser went back out for the file at the moment of the hover,
         and the character painted nothing until it landed. Two requests for the
         same sheet, the second one on the interaction path. With the file still
         fresh in the HTTP cache that is invisible; once it has gone stale, or
         on a slow link, it is a second of empty plinth. Exactly "sometimes".

         So the pose no longer asks for a file at all — the stylesheet gives
         each sheet its own layer and the pose only flips which is visible. What
         is left here is the warm-up that puts the walk layer on screen (at zero
         opacity) BEFORE anybody hovers, and the readiness gate that keeps the
         pose from switching to a layer that is not painted yet:

           1. `data-warm` is what hands the layer its background-image, so the
              fetch happens on approach rather than on contact;
           2. the Image() beside it is the SIGNAL — same URL, so it costs
              nothing extra — and it is RETAINED, because an unreferenced image
              can have its decode collected and then the layer has to decode
              again at the worst possible moment;
           3. readiness is re-tested from that image every time rather than
              cached in a boolean that can outlive the thing it describes;
           4. a rejected decode() is still never mistaken for an answer, and a
              failure is never cached — the next hover gets to try again;
           5. and if the sheet is genuinely not there, the character keeps
              vibing. Vibing is a pose it HAS. A worse moonwalk is a much better
              mascot than an empty plinth. */
      let warmImg = null, warming = null, wants = false, inflight = false;

      const walkURL = () => {
        const raw = getComputedStyle(mascot).getPropertyValue('--sx-mv-walk')
          .trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        /* Declared in the stylesheet, so it is relative to the STYLESHEET —
           which is two directories from this document, not from the page. It
           happens to survive being resolved against the document today because
           the extra `..` is clamped at the root, but that is luck and not a
           contract. Resolved against the sheet it came from instead. */
        const link = document.querySelector('link[rel="stylesheet"][href*="sections.css"]');
        try { return new URL(raw, link ? link.href : location.href).href; }
        catch (_) { return raw; }
      };

      /* The one true test, asked fresh each time. */
      const sheetReady = () => !!(warmImg && warmImg.complete && warmImg.naturalWidth);

      const warm = () => {
        if (warming) return warming;
        /* This is the line that starts the layer's own fetch. */
        mascot.dataset.warm = '1';
        warming = new Promise(resolve => {
          const img = new Image();
          img.decoding = 'async';
          const done = () => resolve(img.complete && img.naturalWidth > 0);
          img.onload = done;
          img.onerror = done;
          img.src = walkURL();
          warmImg = img;                 /* retained for the life of the page */
          /* Raced against load, never trusted alone, and its rejection is
             ignored rather than treated as an answer — load will answer. */
          img.decode().then(done, () => {});
        }).then(ok => {
          if (!ok) {                     /* let the next hover try again */
            warming = null;
            warmImg = null;
            delete mascot.dataset.warm;
          }
          return ok;
        });
        return warming;
      };

      /* Warmed on approach rather than on contact. The section coming into
         view is seconds of warning; hovering the stand — a target several times
         the size of the character — is the backstop. */
      if ('IntersectionObserver' in window && stand) {
        const warmer = new IntersectionObserver(es => {
          if (!es.some(e => e.isIntersecting)) return;
          warmer.disconnect();
          warm();
        }, { rootMargin: '40% 0px' });
        warmer.observe(stand);
      } else {
        warm();
      }
      if (stand) stand.addEventListener('pointerenter', warm, { once: true });

      const dance = async () => {
        /* Recorded BEFORE any early return. Bailing out first meant that
           re-entering the character while a warm-up was still in flight left
           `wants` false, the in-flight call then found nothing was wanted, and
           the mascot sat there vibing under a pointer that was asking it to
           dance until you moved away and came back. */
        wants = true;
        if (posing || inflight) return;

        if (!sheetReady()) {
          inflight = true;
          let ok = false;
          try { ok = await warm(); } finally { inflight = false; }
          if (!ok) return;             /* keep vibing rather than go blank */
        }
        /* The pointer may well have left while that was in flight. */
        if (!wants || posing) return;
        posing = true;
        syncNotes();                   /* the music stops for the moonwalk */
        playPose('walk');
        sprite.playbackRate = 1;
      };

      const settle = () => {
        wants = false;
        if (!posing) return;
        posing = false;
        playPose('vibe');
        applySpeed();                  /* which re-starts the notes */
      };

      mascot.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        dance();
      });
      mascot.addEventListener('pointerleave', settle);
      /* A pointer can vanish without leaving — captured elsewhere, or the
         window goes away mid-hover — and the character is left dancing to
         nobody. */
      mascot.addEventListener('pointercancel', settle);
      addEventListener('blur', settle);
      mascot.addEventListener('focus', dance);
      mascot.addEventListener('blur', settle);
    }

    /* The strip used to bend away at both ends — each cell turned about Y by
       how far it sat from the middle of the window. It is gone, and mixed
       aspect ratios are why.

       A card rotated by θ projects to cos(θ) of its width, and translateZ
       under perspective scales it again. Both scale with the card's OWN width,
       so a 587px landscape tile and a 186px portrait tile lose wildly
       different numbers of pixels at the same angle. The layout gap was a
       constant 16px; the gap you could SEE swung between -19.5 and +21.5 —
       negative meaning the tiles overlapped. The run pumped as it travelled,
       which on a strip whose whole job is even continuous motion is the one
       thing it cannot do.

       That rule is why the hover in the stylesheet lifts the PLATE and never
       the cell: the plate is inside the cell and out of the layout, so it can
       be transformed for nothing. Anything that touches a cell's own geometry
       breaks the spacing of the whole run. */

    place();
    applySpeed();
    wake();
  }

  /* ------------------------------------------------------------------------
     The ledge, on the page's own depth.
     ------------------------------------------------------------------------
     The hero's right_side_ledge, reused here and now given the hero's read as
     well as its shape. Up there the corner pieces hang free in the frame and
     come toward the camera as the section leaves; this is the same idea
     stretched across a whole pass rather than an exit, because this ledge is
     something you scroll BY rather than something you scroll away from.

     So the driver is signed: -1 as the section's bottom edge comes up into the
     window, 0 with the section centred, +1 as its top edge leaves. That makes
     the flight symmetrical about the middle — it approaches on the way in and
     recedes on the way out, which is what "incoming and outgoing" has to mean
     for an object you pass rather than one you leave behind.

     It writes CUSTOM PROPERTIES rather than a transform, because the stylesheet
     is already composing three things onto this element — the base -46%, the
     idle float and now this. Handing it a transform would erase the other two.

     Raw off the rect with no smoothing. A decoration that lags the scrollbar
     reads as the page tearing, and the idle float is already supplying all the
     looseness this needs.
     ---------------------------------------------------------------------- */
  const mvLedge = document.querySelector('.sx-mv-ledge');
  const mvSection = document.getElementById('sx-move');
  if (mvLedge && mvSection && M && M.scroll && !reduced) {
    /* --- why the first pass at this was invisible ---
       It moved the ledge 160px vertically and grew it from 0.87x to 1.18x, and
       measured on its own element every one of those numbers was doing what it
       said. On the page you could not see any of it, and the reason is the one
       thing the numbers do not describe: WHERE THE SHAPE IS.

       The ledge is anchored off the left edge of the window and about a third of
       it is already outside. So it is clipped, and a clipped shape hides exactly
       the two cues this was spending its whole budget on. Growth pushes the new
       pixels off the edge — measured across a full pass, the ledge's width went
       148px to 180px while the part you can SEE went 120px to 127px. Seven
       pixels. And vertical drift against a page that is itself scrolling is a
       differential, so 160px spread over 1850px of scroll is a 9% difference
       nobody reads as movement.

       The fix is not bigger numbers on the same axes, it is the RIGHT AXIS. For
       a shape pinned to an edge, the legible move is across that edge: the ledge
       now slides out of the corner and back into it, which is unmissable because
       the boundary it crosses is the frame itself. The depth and the tip stay,
       and they are bigger, but they are now the seasoning rather than the meal.

       The X sign looks backwards and is not. `scale: -1 1` mirrors the element,
       and individual transform properties apply OUTSIDE `transform` — so the
       translate happens first in local space and is then flipped. Negative x
       here moves the ledge RIGHT on screen, out of the corner.
       ---------------------------------------------------------------------- */
    const REVEAL = 128;    /* px across the frame edge — the move you actually see */
    const DRIFT  = 0.16;   /* of the viewport, each way, against the page */
    const DEPTH  = 300;    /* px toward a camera 1100 out: 0.79x to 1.38x */
    const TIP    = 10;     /* degrees, each way */
    M.scroll(p => {
      const s = clamp01(p) * 2 - 1;
      const vh = innerHeight || 800;
      mvLedge.style.setProperty('--sx-mvl-x', (-s * REVEAL).toFixed(1) + 'px');
      mvLedge.style.setProperty('--sx-mvl-y', (-s * vh * DRIFT).toFixed(1) + 'px');
      mvLedge.style.setProperty('--sx-mvl-z', (s * DEPTH).toFixed(1) + 'px');
      mvLedge.style.setProperty('--sx-mvl-r', (s * TIP).toFixed(2) + 'deg');
      /* Cubed, so the fade is nothing at all through the middle of the pass and
         only bites at the two ends — where the shape is furthest from home and
         closest to reading as a stray green wedge rather than as the hero's
         corner answering itself. */
      mvLedge.style.setProperty('--sx-mvl-o',
        (1 - Math.pow(Math.abs(s), 3) * 0.45).toFixed(3));
    }, { target: mvSection, offset: ['start end', 'end start'] });
  }

  /* With motion off — or with no Motion at all — there is no sprite, so the
     mascot has nothing to play and stops being a control. Leaving a labelled
     button in the tab order that answers Enter with nothing is worse than not
     offering it: the promise is the problem, not the missing animation. */
  if (!(M && M.animate) || reduced) {
    const still = document.getElementById('sx-mv-mascot');
    if (still) {
      still.setAttribute('tabindex', '-1');
      still.setAttribute('aria-hidden', 'true');
      still.removeAttribute('aria-label');
      still.disabled = true;
    }
  }

  /* ========================================================================
     BUILT WITH CLAUDE CODE — the level scrolls
     ========================================================================
     Two scroll-driven things, and both are side-scroller grammar rather than
     web-page grammar.

     THE SKY has three depths. One number is written for the whole sky and each
     cloud multiplies it by its own --cd, so a far cloud on .12 barely shifts
     while a near one on .72 crosses a long way. That is the entire trick behind
     depth in a 2D platformer and it costs one multiply per cloud, in CSS, on
     the compositor. Writing one property on the container rather than five on
     the clouds also means adding a cloud is adding a <span>.

     THE CREW walks in. They enter from beyond the right edge and arrive at
     their spot on the platform as the section does, which is the one entrance
     that belongs to this section specifically: everything else on this page
     assembles or lands, and a crew of pixel characters neither assembles nor
     lands — it WALKS ON. Their stepped bob is in the stylesheet and runs the
     whole time, so they are walking before they arrive and still walking after,
     and the scroll only decides where along the platform they have got to.

     Both are written as custom properties for the same reason as everything
     else here: the stylesheet is already composing a bob onto the crew and a
     drift onto the clouds, and handing either of them a transform would erase
     the other.
     ====================================================================== */
  const ccSection = document.getElementById('sx-cc');

  if (ccSection && M && M.scroll && !reduced) {
    const ccSky = ccSection.querySelector('.cc-sky');
    const ccCrew = ccSection.querySelector('.cc-crew');

    if (ccSky) {
      /* Negative, so the sky travels the OTHER way to the page — clouds slide
         left as you go down, which is what reads as walking right past them.
         The span is a share of the viewport rather than a fixed distance, so
         the parallax is the same gesture on a laptop and on a monitor. */
      /* Small on purpose. The sweep is +/- half of this times the depth, and at
         .42 the near clouds crossed 235px — far enough to wander in behind the
         wordmark, which is the one place they must not be. At .20 the deepest
         cloud moves about 70px: plainly parallax, and it stays in its lane. */
      const SKY = 0.20;
      M.scroll(p => {
        const vw = innerWidth || 1200;
        ccSky.style.setProperty('--cc-sky',
          ((0.5 - clamp01(p)) * vw * SKY).toFixed(1) + 'px');
      }, { target: ccSection, offset: ['start end', 'end start'] });
    }

    /* --- the ledge arrives first ---
       The ground was static while the crew walked onto it, which reads as a
       set that was always there and a character who wasn't. Now both slide in
       and the LEDGE leads: a shorter travel over a window that closes sooner,
       so it is settled by the time the crew catches up to it. Minor on purpose
       — enough that the ground feels placed rather than painted on, not enough
       to become a second entrance competing with the walk. */
    const ccLedge = ccSection.querySelector('.cc-ledge');
    if (ccLedge) {
      M.scroll(p => {
        const left = 1 - clamp01(p);
        ccLedge.style.setProperty('--cc-ledge-x',
          (left * left * (innerWidth || 1200) * 0.16).toFixed(1) + 'px');
      }, { target: ccSection, offset: ['start 1', 'start 0.56'] });
    }

    if (ccCrew) {
      /* Arrives by the time the section is properly on screen and then stays
         put — the walk is an entrance, not a ride. Squared falloff so they are
         already slowing as they reach their mark rather than stopping dead on
         it, which is what a character does and a slider does not. */
      M.scroll(p => {
        const left = 1 - clamp01(p);
        ccCrew.style.setProperty('--cc-walk',
          (left * left * (innerWidth || 1200) * 0.55).toFixed(1) + 'px');
      }, { target: ccSection, offset: ['start 0.98', 'start 0.42'] });
    }
  }

  /* --- picking a card up ---
     The same machinery the More Stories cards use, and deliberately so: this
     page already has a way cards answer a pointer, and a second one would be a
     second thing to learn. The plate tips after the pointer, lifts, and the art
     inside drifts AGAINST the tilt — that last part is what gives the plate a
     thickness rather than just making the picture bigger.

     Springs rather than a transition, because a transition retargeted sixty
     times a second is a thing perpetually catching up with the pointer, where a
     spring is already a model of catching up. The handler does no animation
     work at all: it sets four numbers. */
  if (ccSection && M && M.motionValue && M.springValue && !reduced
      && matchMedia('(hover: hover)').matches) {
    /* The plate is heavier than the art it carries, so it arrives a little
       later and settles without wobbling; the art is light and can chase. */
    const PLATE = { stiffness: 260, damping: 26, mass: 1.1 };
    const ART   = { stiffness: 180, damping: 24, mass: 1 };
    const TILT = 5;      /* degrees at the corner */
    const DRIFT = 12;    /* px the cover travels against the tilt */
    const LIFT = -12;    /* px toward the reader */

    ccSection.querySelectorAll('.cc-card-in').forEach(plate => {
      const art = plate.querySelector('.cc-shot img');

      const spring = (unit, prop, target, cfg, rest) => {
        const raw = M.motionValue(rest);
        M.springValue(raw, cfg).on('change', v => {
          target.style.setProperty(prop, v.toFixed(3) + unit);
        });
        return raw;
      };
      const rx   = spring('deg', '--cc-rx',   plate, PLATE, 0);
      const ry   = spring('deg', '--cc-ry',   plate, PLATE, 0);
      const lift = spring('px',  '--cc-lift', plate, PLATE, 0);
      const pop  = spring('',    '--cc-pop',  plate, PLATE, 1);
      const ax   = art ? spring('px', '--cc-art-x', art, ART, 0) : null;
      const ay   = art ? spring('px', '--cc-art-y', art, ART, 0) : null;
      const as   = art ? spring('',   '--cc-art-s', art, ART, 1) : null;

      /* Read off the CARD, not the plate. The plate is the thing being tilted,
         so measuring it would feed the tilt back into its own input. */
      const card = plate.closest('.cc-card') || plate;
      let px = 0, py = 0, queued = 0;
      const write = () => {
        queued = 0;
        rx.set(-py * 2 * TILT);
        ry.set( px * 2 * TILT);
        if (ax) { ax.set(-px * DRIFT); ay.set(-py * DRIFT); }
      };

      plate.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        const r = card.getBoundingClientRect();
        px = (e.clientX - r.left) / r.width  - .5;
        py = (e.clientY - r.top)  / r.height - .5;
        /* Coalesced to one write per frame — a pointer fires well above display
           rate and the springs only read their target once a frame. */
        if (!queued) queued = requestAnimationFrame(write);
      });
      plate.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        lift.set(LIFT); pop.set(1.02); if (as) as.set(1.06);
      });
      const settle = () => {
        if (queued) { cancelAnimationFrame(queued); queued = 0; }
        rx.set(0); ry.set(0); lift.set(0); pop.set(1);
        if (ax) { ax.set(0); ay.set(0); as.set(1); }
      };
      plate.addEventListener('pointerleave', settle);
      plate.addEventListener('pointercancel', settle);
      addEventListener('blur', settle);
    });
  }

  /* ------------------------------------------------------------------------
     The tiles, once they hold video.
     ------------------------------------------------------------------------
     There are no files yet, so this does nothing today and needs no change
     when they arrive: drop a <video muted loop playsinline> into a plate and
     it is picked up.

     Playing only what is on screen is not a nicety. Fourteen decoders running
     at once costs frames on a laptop and battery on a phone, and eleven of
     them are painting outside the viewport. IntersectionObserver is the whole
     mechanism — no scroll handler, no per-frame work.
     ---------------------------------------------------------------------- */
  if (mvReel && 'IntersectionObserver' in window) {
    const filmObserver = new IntersectionObserver(entries => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting && !reduced) { const q = v.play(); if (q) q.catch(() => {}); }
        else v.pause();
      }
    }, { rootMargin: '10% 0px', threshold: 0.1 });

    const watchFilm = () => mvReel.querySelectorAll('.sx-cel-plate > video')
      .forEach(v => { v.muted = true; v.loop = true; v.playsInline = true;
                      filmObserver.observe(v); });
    watchFilm();
    /* If the tiles are ever filled in after load, pick those up too. */
    new MutationObserver(watchFilm).observe(mvReel, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------------
     Case study buttons.
     The sheets aren't built yet. Rather than a dead button or a fake modal,
     say so in the machine's own voice and leave the slug visible — the routes
     are decided, only the pages are missing.
     ---------------------------------------------------------------------- */
  root.querySelectorAll('[data-cs]').forEach(btn => {
    btn.addEventListener('click', () => {
      const label = btn.querySelector('.sx-cta-l');
      if (!label || btn.dataset.busy) return;
      const original = label.textContent;
      btn.dataset.busy = '1';
      label.textContent = '/work/' + btn.getAttribute('data-cs') + ' — not built yet';
      setTimeout(() => { label.textContent = original; delete btn.dataset.busy; }, 2200);
    });
  });

  /* ------------------------------------------------------------------------
     Hero — the things that answer the pointer.
     ------------------------------------------------------------------------
     Three effects, one loop. They share it because they share an input: the
     cursor. Three separate rAFs reading the same two numbers would schedule
     three layout flushes a frame to draw one composited picture.

     Everything here writes custom properties and nothing writes a style the
     stylesheet also owns — same discipline as the arrival, and for the same
     reason: an inline `transform` on the mascot would outrank the rule that
     positions it and the corner would quietly move.
     ---------------------------------------------------------------------- */
  (() => {
    const rules  = document.querySelector('.sx-rules');
    const lit    = document.querySelector('.sx-rules-lit');
    const glow   = document.querySelector('.sx-hero-glow');
    const mascot = document.getElementById('sx-mascot');

    /* --- the robot's art -------------------------------------------------
       Both pieces are exports under public/img. The ledge is the cheap half —
       an SVG, and inert if it 404s — so the render is what the corner is
       tested on: without it there is a ledge with nobody on it, which is worse
       than no corner at all.

       Checked rather than assumed, because `error` does not fire for an image
       the browser has already finished failing to load by the time this runs. */
    if (mascot) {
      const bot = mascot.querySelector('.sx-mascot-bot');
      const missing = () => mascot.setAttribute('data-art', 'missing');
      if (bot) {
        if (bot.complete) {
          mascot.setAttribute('data-art', bot.naturalWidth ? 'ready' : 'missing');
        }
        bot.addEventListener('error', missing);
        bot.addEventListener('load', () => mascot.setAttribute('data-art', 'ready'));
      } else { missing(); }
    }

    /* --- what it says ----------------------------------------------------
       One line per hover, in order rather than at random: random repeats, and
       a repeat reads as the thing being broken rather than as it being quiet. */
    const say = document.getElementById('sx-mascot-say');
    const LINES = [
      'Still shipping.',
      'Ten years of this.',
      'Scroll — the good bit is below.',
      'Yes, the grid lights up.',
      'Currently open to remote.'
    ];
    let saidAt = -1;
    if (mascot && say) {
      mascot.addEventListener('pointerenter', () => {
        saidAt = (saidAt + 1) % LINES.length;
        say.textContent = LINES[saidAt];
      });
      /* Keyboard reaches it too — the group is not focusable itself, but the
         nav beside it is, and :focus-within needs something to say. */
      say.textContent = LINES[0];
    }

    /* Everything from here to the pointer loop is NAVIGATION, not decoration,
       so it is wired before the reduced-motion bail below. Someone who has
       asked for less movement still needs the nav to work; what they lose is
       the parallax and the lit grid, not the links. */

    /* --- driving the pull-out --------------------------------------------
       #s-exit is not a place, it is a film. Its height IS the timeline: the
       scrub engine maps scroll position through the section onto the video's
       currentTime. So "play it" here means moving the scrollbar through the
       section at a steady rate and letting the film follow — this never
       reaches into the scrub engine, it just supplies the number the engine
       was already reading.

       It runs to the END of the section, because that is where the desk
       finishes rotating: the rotation occupies the last 55% of the film
       (ROTATION_START = 0.45 in the page's own engine). Stopping at the
       section's top would arrive at the film and then not play it.

       Two legs on one clock — a short eased approach to get there, then a
       LINEAR run through the film, because the section's height is the
       timeline and an eased scroll here would be an eased playback speed.
       ---------------------------------------------------------------------- */
    let filmRaf = 0, filmOff = null;

    function stopFilm() {
      if (filmRaf) cancelAnimationFrame(filmRaf);
      filmRaf = 0;
      if (filmOff) { filmOff(); filmOff = null; }
    }

    function playFilm(sec) {
      const travel = sec.offsetHeight - innerHeight;
      /* Below the breakpoint the scrub sections unpin to 100vh and there is no
         timeline left to run. Just go there. */
      if (travel <= 0 || reduced) {
        sec.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        return;
      }

      const from  = pageYOffset;
      const start = sec.offsetTop;            /* pExit = 0, the film's first frame */
      const vid   = document.getElementById('v-exit');
      /* 1.35x. The film reads as sluggish at 1x — the page's own click-to-dive
         made the same call at 1.6x — but past about 1.5 the rotation is over
         before you have registered it. */
      const secs  = (vid && isFinite(vid.duration) && vid.duration ? vid.duration : 3.7) / 1.35;
      const approachMs = Math.min(900, Math.max(320, Math.abs(start - from) * 0.22));
      const filmMs = secs * 1000;
      const t0 = performance.now();
      const easeInOut = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

      /* Any real input hands the scrollbar straight back. Taking it from
         someone who wants it is the one thing this must not do — so these
         listen for intent (wheel, touch, a key, a press), never for the
         scroll events this animation is itself producing. */
      const bail = () => stopFilm();
      const opts = { passive: true };
      addEventListener('wheel', bail, opts);
      addEventListener('touchstart', bail, opts);
      addEventListener('pointerdown', bail, opts);
      addEventListener('keydown', bail, opts);
      filmOff = () => {
        removeEventListener('wheel', bail, opts);
        removeEventListener('touchstart', bail, opts);
        removeEventListener('pointerdown', bail, opts);
        removeEventListener('keydown', bail, opts);
      };

      const step = now => {
        const ms = now - t0;
        if (ms < approachMs) {
          scrollTo(0, from + (start - from) * easeInOut(ms / approachMs));
        } else {
          const ft = clamp01((ms - approachMs) / filmMs);
          scrollTo(0, start + travel * ft);
          if (ft >= 1) { stopFilm(); return; }
        }
        filmRaf = requestAnimationFrame(step);
      };
      filmRaf = requestAnimationFrame(step);
    }

    /* --- the nav's glide -------------------------------------------------
       One capsule for three items. Measured every time rather than cached: the
       gaps and the padding are clamps, so they change with the viewport, and
       the labels are webfont text, so they change again when Satoshi lands. */
    const nav = document.getElementById('sx-nav');
    if (nav) {
      const glide = nav.querySelector('.sx-nav-glide');
      const mark  = nav.querySelector('.sx-nav-mark');
      const items = [...nav.querySelectorAll('.sx-nav-i')];
      /* Read rather than repeated: the pill sizes its own padding off this same
         property, so a literal here would let the two drift apart.

         A custom property comes back UNRESOLVED — the string '1.15em', not the
         pixels it stands for — so parseFloat alone read it as 1.15px and the
         capsule ended up traced around the word with a pixel to spare. The em
         has to be multiplied out against the element that will use it, and the
         rem against the root, which is what this does. Read on every call: the
         pill's font-size is a clamp and its pad changes again under the phone
         breakpoint, so a value cached at startup is wrong after a resize. */
      const pad = () => {
        const cs  = getComputedStyle(nav);
        const raw = cs.getPropertyValue('--sx-nav-pad').trim();
        const n   = parseFloat(raw);
        if (!isFinite(n)) return 18;
        if (raw.endsWith('rem')) return n * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
        if (raw.endsWith('em'))  return n * (parseFloat(cs.fontSize) || 16);
        return n;                       /* px, or a bare number */
      };

      /* Rects, not offsetLeft/offsetWidth. Those two round to whole pixels, and
         the rounding does not cancel — the capsule came out about a pixel wider
         on one side than the other, which is visible on a 200px radius against
         the pill's edge. The glide is positioned from the nav's PADDING box
         (that is what left:0 means for an absolute child), so the border has to
         come off the measurement. */
      const put = el => {
        if (!glide || !el) return;
        const nb = nav.getBoundingClientRect();
        const eb = el.getBoundingClientRect();
        const bl = parseFloat(getComputedStyle(nav).borderLeftWidth) || 0;
        const P  = pad();
        glide.style.setProperty('--gx', (eb.left - nb.left - bl - P).toFixed(2) + 'px');
        glide.style.setProperty('--gw', (eb.width + P * 2).toFixed(2) + 'px');
        glide.style.setProperty('--go', '1');
      };
      const clear = () => { if (glide) glide.style.setProperty('--go', '0'); };

      /* --- the way home ----------------------------------------------
         The portrait goes to the HERO — the assembled headline — not to the
         top of the document. Those are different places on this page: #s-enter
         holds the whole entry as one timeline, and 0 is the film's first frame,
         a screen of black with the dive still ahead of it. The hero arrives
         later along that same timeline, so the target is a position on it, and
         the page's own engine is the only thing that knows where: SX.heroY()
         computes it from the film's real duration. Falling back on the
         section's top rather than on 0, because if that engine has not started
         yet the section top is still nearer the hero than the film's first
         frame is.

         stopFilm() first, for the same reason the labels call it — if the
         pull-out is mid-playback it owns the scrollbar, and a smooth scroll
         started underneath it would be overwritten frame by frame. */
      const home = nav.querySelector('.sx-nav-home');
      if (home) {
        home.addEventListener('click', ev => {
          ev.preventDefault();
          stopFilm();
          const enterEl = document.getElementById('s-enter');
          const y = window.SX && typeof window.SX.heroY === 'function'
            ? window.SX.heroY()
            : (enterEl ? enterEl.offsetTop : 0);
          scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
        });
      }

      items.forEach(el => {
        el.addEventListener('pointerenter', () => put(el));
        el.addEventListener('focus', () => put(el));
        el.addEventListener('blur', clear);

        /* Most of the sections are a long way down a scrubbed page, so hand
           them to the browser's own smooth scroll rather than animating
           scrollTop against an engine already driving off the same number.

           #s-exit is the exception, and playFilm() below says why. */
        el.addEventListener('click', ev => {
          const id = (el.getAttribute('href') || '').slice(1);
          const target = id && document.getElementById(id);
          if (!target) return;                 /* let the anchor do whatever it does */
          ev.preventDefault();
          stopFilm();
          if (id === 's-exit') playFilm(target);
          else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      nav.addEventListener('pointerleave', clear);

      /* --- the scroll spy ----------------------------------------------
         Which section you are in, and everything the pill shows about it.
         Zones in document order; the active one is the LAST whose top has
         passed the middle of the screen, which is the reading that matches
         where your eye is rather than where a section technically begins.

         The archive belongs to Work — it is the rest of the same body of it —
         and the hand-off and the pull-out belong to Outside work. The film at
         the top is its own state: the pill has no item for it, which is why
         the portrait carries that one. */
      const ZONES = [
        ['s-enter',    'hero'],
        ['sx-work',    'work'],
        ['sx-cc',      'work'],
        ['sx-exp',     'exp'],
        ['sx-hand',    'outside'],
        ['s-exit',     'outside'],
        ['outside-work', 'outside']
      ].map(([id, key]) => ({ el: document.getElementById(id), key }))
       .filter(z => z.el);

      /* Where the marker sits, and which glyph it wears. Measured on the same
         rects the capsule uses, so the two can never disagree about where a
         label is; centred under it rather than boxed around it. */
      function placeMark(el) {
        if (!mark) return;
        if (!el) { mark.style.setProperty('--mo', '0'); return; }
        const nb = nav.getBoundingClientRect();
        const eb = el.getBoundingClientRect();
        const bl = parseFloat(getComputedStyle(nav).borderLeftWidth) || 0;
        const x = (eb.left - nb.left - bl) + eb.width / 2 - mark.offsetWidth / 2;
        mark.style.setProperty('--mx', x.toFixed(2) + 'px');
        mark.style.setProperty('--mo', '1');
      }

      let activeKey = '';
      function spy() {
        const mid = innerHeight * 0.5;
        let key = ZONES.length ? ZONES[0].key : 'hero';
        for (const z of ZONES) {
          if (z.el.getBoundingClientRect().top <= mid) key = z.key;
        }
        if (key === activeKey) return;
        activeKey = key;
        nav.dataset.active = key;
        placeMark(key === 'hero' ? null
          : items.find(a => a.getAttribute('data-sec') === key));
      }

      let spyRaf = 0;
      const wakeSpy = () => { if (!spyRaf) spyRaf = requestAnimationFrame(() => { spyRaf = 0; spy(); }); };
      addEventListener('scroll', wakeSpy, { passive: true });
      /* Re-place on resize: the pill is sized in em off a clamped font-size, so
         its geometry moves with the viewport even though the state does not. */
      addEventListener('resize', () => {
        wakeSpy();
        if (activeKey && activeKey !== 'hero') {
          placeMark(items.find(a => a.getAttribute('data-sec') === activeKey));
        }
      }, { passive: true });
      /* Webfonts change every width in here; measure again once they land. */
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          if (activeKey && activeKey !== 'hero') {
            placeMark(items.find(a => a.getAttribute('data-sec') === activeKey));
          }
        }, () => {});
      }
      spy();
    }

    if (reduced) return;

    /* --- the shared pointer loop ----------------------------------------- */
    let px = 0, py = 0;          /* pointer, viewport px */
    let lx = 0, ly = 0;          /* the lit disc, trailing */
    let seeded = false;          /* has the pointer ever been over the hero? */
    let raf = 0, idle = 0;

    const onMove = e => { px = e.clientX; py = e.clientY; wake(); };
    addEventListener('pointermove', onMove, { passive: true });

    function wake() { idle = 0; if (!raf) raf = requestAnimationFrame(frame); }

    function frame() {
      raf = 0;

      const box = rules ? rules.getBoundingClientRect() : null;
      /* The hero is a sticky layer inside the dive; once it has scrolled past,
         none of this is on screen and none of it should cost a frame. */
      const onScreen = !!box && box.bottom > 0 && box.top < innerHeight;
      let trailing = false;

      if (onScreen) {
        const x = px - box.left, y = py - box.top;
        const inside = x >= 0 && y >= 0 && x <= box.width && y <= box.height;

        if (lit) {
          /* Snap on the first frame the pointer is over the hero. Lerping from
             the top-left origin would drag a visible light across the page the
             first time the cursor arrived. */
          if (inside && !seeded) { lx = x; ly = y; seeded = true; }
          else { lx += (x - lx) * 0.16; ly += (y - ly) * 0.16; }

          lit.style.setProperty('--sx-mx', lx.toFixed(1) + 'px');
          lit.style.setProperty('--sx-my', ly.toFixed(1) + 'px');
          lit.style.setProperty('--sx-lit', inside ? '1' : '0');

          /* Keep the loop alive while the light is still catching up, however
             long ago the pointer stopped. */
          trailing = Math.abs(x - lx) > 0.4 || Math.abs(y - ly) > 0.4;
        }

        /* Parallax. Signed -1..1 from the middle of the frame, and everything
           moves WITH the pointer at its own rate — the bloom least because it
           is furthest away, the robot most because it is nearest. */
        const nx = box.width  ? (px - box.left - box.width  / 2) / (box.width  / 2) : 0;
        const ny = box.height ? (py - box.top  - box.height / 2) / (box.height / 2) : 0;
        const cx = nx < -1 ? -1 : nx > 1 ? 1 : nx;
        const cy = ny < -1 ? -1 : ny > 1 ? 1 : ny;

        if (glow) glow.style.setProperty('--sx-gpx', (cx * 26).toFixed(1) + 'px');
        if (mascot) {
          mascot.style.setProperty('--sx-mpx', (cx * -13).toFixed(1) + 'px');
          mascot.style.setProperty('--sx-mpy', (cy * -8).toFixed(1) + 'px');
          /* The ledge used to take its own pointer offset so the two would
             separate under the cursor. Gone with the rest of it: the group is
             one object and the pointer moves the whole of it, above. */
        }
      }

      /* Park once the trail has caught up and the pointer has been still for a
         few frames. A still page costs nothing — the rest of this file works
         the same way, and the loop is woken again by the next pointermove. */
      if (trailing) idle = 0;
      if (trailing || ++idle < 10) raf = requestAnimationFrame(frame);
    }

  })();
})();
