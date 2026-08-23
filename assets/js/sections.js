/* ============================================================================
   Work · Archive · Experience — behaviour.

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

  /* ========================================================================
     4 · EXPERIENCE — the character
     ========================================================================
     Four stops scroll vertically past a pinned figure. Each one that crosses
     the trigger line levels him up and fills a loadout slot. Airtel carries a
     mid-stop beat: the motion tool arrives in 2024, partway through the stop
     rather than at its start, because that is when it actually happened.

     Level state is cumulative and idempotent — recomputed from scroll position
     every frame rather than incremented on an event, so scrolling back up
     downgrades correctly and a mid-page reload lands in the right state.
     ====================================================================== */

  const exp = document.getElementById('sx-exp');
  const stops = exp ? [...exp.querySelectorAll('.sx-stop')] : [];
  const rig = document.getElementById('sx-rig');
  const lvNum = document.getElementById('sx-lv-num');
  const lvName = document.getElementById('sx-lv-name');
  const slots = rig ? [...rig.querySelectorAll('.sx-slot')] : [];
  const figure = document.getElementById('sx-figure');

  /* Kit that belongs to each level, cumulative. Index 0 is the base state
     before any stop has been reached. */
  const KIT = [
    [],
    ['mouse'],
    ['mouse', 'tablet'],
    ['mouse', 'tablet', 'keyboard', 'cans', 'crown'],
    ['mouse', 'tablet', 'keyboard', 'cans', 'crown', 'monitor2']
  ];

  let lastLevel = -1, lastTool = null;

  function applyLevel(level, tool) {
    if (level === lastLevel && tool === lastTool) return;
    lastLevel = level; lastTool = tool;

    const kit = new Set(KIT[level] || []);
    if (tool) kit.add('tool');

    if (figure) {
      figure.querySelectorAll('[data-kit]').forEach(el => {
        el.setAttribute('data-on', kit.has(el.getAttribute('data-kit')) ? '1' : '0');
      });
      /* Posture: the figure sits a little taller each level. The content file
         encodes this as figure heights 34/38/44/52 — the same idea, as a scale
         about the seat rather than a height change, so the desk stays put. */
      figure.setAttribute('data-level', String(level));
    }

    slots.forEach((s, i) => s.setAttribute('data-on', i < level ? '1' : '0'));

    if (lvNum) lvNum.textContent = String(level).padStart(2, '0');
    if (lvName) {
      lvName.textContent = level === 0
        ? 'before'
        : (stops[level - 1] ? stops[level - 1].getAttribute('data-co') : '');
    }
  }

  function updateExperience() {
    if (!stops.length) return;

    /* The trigger is the stop's CENTRE crossing a line at 55% of the viewport,
       not its top edge. Measuring the top edge levels the character up the
       moment a card peeks in from below — which put the HUD on Airtel while
       Gamezop was still the card sitting in front of the reader. A stop counts
       when it has actually arrived. */
    const line = innerHeight * 0.55;
    let level = 0, tool = false;

    for (let i = 0; i < stops.length; i++) {
      const r = stops[i].getBoundingClientRect();
      const passed = (r.top + r.height / 2) <= line;
      if (passed) level = i + 1;

      /* The 2024 beat, inside the last stop: the motion tool arrives partway
         through Airtel rather than at its start, because that is when it
         happened. Measured from the stop's own centre, same as the trigger. */
      if (i === stops.length - 1 && passed && stops[i].hasAttribute('data-midbeat')) {
        tool = (line - (r.top + r.height / 2)) / Math.max(r.height, 1) > 0.35;
      }
    }

    /* Active = the deepest stop reached. Marked after the loop so exactly one
       card is ever live, whatever the spacing does at a given viewport. */
    stops.forEach((s, i) => s.setAttribute('data-active', i === level - 1 ? '1' : '0'));

    applyLevel(level, tool);

    const beat = exp.querySelector('[data-warm]');
    if (beat) beat.style.opacity = tool ? '1' : '.35';
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

  let stackTop = 0, stackGap = 40, stackP = 1600;

  /* Everything the stack's geometry needs, measured rather than declared.

     The nav is read off the element itself, and off its computed `top` rather
     than its rect: the pill has an arrival transform, and at page load its rect
     sits 14px high of where it will settle. The gap is then whatever room is
     left between the nav and the front card, split between the cards behind —
     which is what guarantees the one at the back clears the pill on any screen. */
  function measureStack() {
    if (!featCards.length) return;
    const cs = getComputedStyle(featCards[0]);
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
    if (reduced || getComputedStyle(featCards[0]).position !== 'sticky') {
      for (const el of featInner) {
        if (!el) continue;
        el.style.removeProperty('--sx-cy');
        el.style.removeProperty('--sx-cz');
        el.style.removeProperty('--sx-dim');
        el.removeAttribute('data-back');
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

    const step = featCards.map(c => clamp01(
      (1 - (c.getBoundingClientRect().top - stackTop) / travel) / RECEDE));

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
      /* Anything meaningfully behind stops taking the pointer, so the front
         card's own controls are not sitting under two dead hit areas. */
      if (d > 0.14) el.setAttribute('data-back', '');
      else el.removeAttribute('data-back');
    }
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

    updateExperience();
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
     halfway down the page doesn't start from level zero and animate up. */
  updateExperience();
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
     THE REEL — cards on a cylinder
     ========================================================================
     Each cell rotates about Y by how far its centre sits from the middle of the
     viewport, so the strip bends away at both edges. Written per frame, but
     only for cells actually on screen, and only while the reel is in view —
     off-screen it costs nothing.
     ====================================================================== */

  const reel = document.getElementById('sx-reel');
  if (reel && !reduced) {
    const cels = [...reel.querySelectorAll('.sx-cel')];
    let reelRaf = 0, reelOn = false;

    const curve = () => {
      const mid = innerWidth / 2;
      for (const c of cels) {
        const r = c.getBoundingClientRect();
        if (r.right < -240 || r.left > innerWidth + 240) continue;
        /* -1 at the left edge, 0 dead centre, +1 at the right. */
        const d = Math.max(-1, Math.min(1, ((r.left + r.width / 2) - mid) / mid));
        /* Shallow on purpose. A card rotated by θ projects to cos(θ) of its
           width, so the gap either side of it appears to grow — at the 36° the
           first pass reached, cards lost a fifth of their width and the spacing
           visibly pumped as the strip moved. At 14° the loss is 3%, which reads
           as an even run on a gentle curve. */
        c.style.setProperty('--sx-ry', (-d * 14).toFixed(2) + 'deg');
        c.style.setProperty('--sx-tz', (-(d * d) * 70).toFixed(1) + 'px');
      }
      reelRaf = reelOn ? requestAnimationFrame(curve) : 0;
    };

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        reelOn = e.isIntersecting;
        if (reelOn && !reelRaf) reelRaf = requestAnimationFrame(curve);
      }, { rootMargin: '150px 0px' }).observe(reel);
    } else {
      reelOn = true; curve();
    }
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
        ['sx-archive', 'work'],
        ['sx-exp',     'exp'],
        ['sx-hand',    'outside'],
        ['s-exit',     'outside']
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
