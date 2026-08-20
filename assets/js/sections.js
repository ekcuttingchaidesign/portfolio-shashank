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
     1 · THE BOOT
     ========================================================================
     Each line is revealed by clipping a span that is already in the DOM, so the
     text is present for screen readers and crawlers from first paint and there
     is zero per-frame layout.
     ====================================================================== */

  /* The terminal lives inside the landing's hero. The landing's scrub loop arms
     it when the film hits its last ten frames; from there it runs on a clock. */
  const termLayer = document.getElementById('sx-term-layer');
  const bootLines = termLayer ? [...termLayer.querySelectorAll('.sx-line')] : [];
  const bootCaret = document.getElementById('sx-caret');
  const bootProg = termLayer ? termLayer.querySelector('.sx-boot-prog') : null;

  /* Typing completes at 82% of the run, leaving the last fifth as a held frame
     — a beat of stillness before the hero, the same pause the camera takes at
     the end of the dive. */
  const BOOT_TYPED_BY = 0.82;

  /* Full rendered width of each line, measured once.

     The reveal clips the span rather than truncating its text, and clip-path
     does not affect layout — so the span always occupies its FULL width and a
     caret appended after it lands at the end of text that hasn't been typed
     yet. The caret has to be positioned at the clip edge instead, which means
     knowing how wide the finished line is. Measured on load, after webfonts
     settle, and on resize; never per frame. */
  let bootMetrics = [];
  function measureBoot() {
    bootMetrics = bootLines.map(l => {
      const inner = l.firstElementChild;
      if (!inner) return null;
      const r = inner.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(l).lineHeight) || 0;
      return {
        w: r.width,
        /* A wrapped line has no single caret position. Rather than draw the
           caret in the wrong place, don't draw it — the text still types. */
        wrapped: lh > 0 && r.height > lh * 1.4
      };
    });
  }

  function paintBoot(p) {
    if (!bootLines.length) return;

    if (termLayer) {
      const vis = reduced ? 1 : Math.min(p / (FILM_TAIL * 0.8), 1);
      termLayer.style.opacity = vis.toFixed(3);
      termLayer.style.pointerEvents = vis > 0.6 ? 'auto' : 'none';
    }

    const n = bootLines.length;
    const span = BOOT_TYPED_BY / n;
    let active = 0, activeT = 1;

    for (let i = 0; i < n; i++) {
      const t = reduced ? 1 : seg(p, i * span, (i + 1) * span);
      const inner = bootLines[i].firstElementChild;
      if (inner) inner.style.setProperty('--sx-clip', ((1 - t) * 100).toFixed(2) + '%');
      if (t > 0) { active = i; activeT = t; }
    }

    if (bootCaret) {
      const host = bootLines[active];
      if (bootCaret.parentNode !== host) host.appendChild(bootCaret);
      const m = bootMetrics[active];
      if (m && !m.wrapped) {
        bootCaret.style.setProperty('--sx-caret-x', (m.w * activeT).toFixed(1) + 'px');
        bootCaret.style.visibility = '';
      } else {
        bootCaret.style.visibility = 'hidden';
      }
    }
    if (bootProg) bootProg.style.setProperty('--sx-boot-p', (clamp01(p / BOOT_TYPED_BY) * 100).toFixed(1) + '%');
  }

  /* ------------------------------------------------------------------------
     Running the loader.

     This is a LOADER, so it runs itself. The previous version drove the typing
     from scroll position, which meant it only finished if you kept scrolling —
     the reader had to operate the loading screen. Wrong on its face: a loader's
     whole promise is that it is doing something for you.

     So: the landing's scrub loop calls arm() once the film reaches its last ten
     frames, and from there this owns the moment. Scroll is held for the ~2.4s
     the sequence takes, then released into the hero. Held, not hijacked — the
     skip is on screen the entire time and any key or click takes it.
     ---------------------------------------------------------------------- */
  const BOOT_MS = 2600;
  /* The film's last ten frames are scrubbed across the first slice of the run,
     so the camera arrives at black while the terminal is already waking. */
  const FILM_TAIL = 0.26;
  let bootState = 'idle';        // idle -> running -> done
  let bootAnim = null;
  let bootHooks = null;
  let termRetired = false;

  function lockScroll(on) {
    document.documentElement.style.overflow = on ? 'hidden' : '';
    document.body.style.overflow = on ? 'hidden' : '';
  }

  function finishBoot() {
    if (bootState === 'done') return;
    bootState = 'done';
    if (bootAnim) { try { bootAnim.stop(); } catch (e) {} bootAnim = null; }
    paintBoot(1);
    lockScroll(false);
    removeEventListener('keydown', skipKey);

    /* Park the film on its final frame and hand the page back. No
       scrollIntoView: the hero starts on the same black the film ends on, so
       the reader simply keeps scrolling and it rises out of the frame. */
    if (bootHooks) {
      if (bootHooks.setFilm) bootHooks.setFilm(1);
      if (bootHooks.finish) bootHooks.finish();
    }
    /* Fade the terminal out only after the hero is on its way, so the two
       overlap rather than leaving a beat of empty black between them. */
    if (termLayer && !reduced) {
      setTimeout(() => {
        if (M) M.animate(termLayer, { opacity: 0 }, { duration: .5, ease: [.22, 1, .36, 1] });
        else termLayer.style.opacity = '0';
      }, 260);
    } else if (termLayer) {
      termLayer.style.opacity = '0';
    }
    /* Once the loader is done it stays gone, including on the way back up —
       a terminal reappearing behind a receding hero would be a ghost. */
    if (termLayer) termLayer.style.pointerEvents = 'none';
  }

  function skipKey(e) {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') finishBoot();
  }

  function armBoot(hooks) {
    if (bootState !== 'idle') return;
    bootState = 'running';
    bootHooks = hooks || null;

    if (reduced) { finishBoot(); return; }

    lockScroll(true);
    addEventListener('keydown', skipKey);

    /* motion's animate() on a plain object gives a real timeline — pausable,
       stoppable, and driven by the same frame loop as everything else here,
       instead of a hand-rolled rAF counter racing the compositor. */
    if (M) {
      const box = { p: 0 };
      bootAnim = M.animate(box, { p: 1 }, {
        duration: BOOT_MS / 1000,
        /* Slightly eased-out: the first lines rattle off, the last one lands.
           Linear typing reads as a progress bar wearing a costume. */
        ease: [.32, .12, .2, 1],
        onUpdate: () => {
          /* First quarter of the run belongs to the camera: the film finishes
             its push into the glass while the terminal fades up over it. */
          if (bootHooks && bootHooks.setFilm) {
            bootHooks.setFilm(Math.min(box.p / FILM_TAIL, 1));
          }
          paintBoot(box.p);
        },
        onComplete: () => finishBoot()
      });
    } else {
      const t0 = performance.now();
      (function step(now) {
        if (bootState !== 'running') return;
        const p = Math.min((now - t0) / BOOT_MS, 1);
        if (bootHooks && bootHooks.setFilm) bootHooks.setFilm(Math.min(p / FILM_TAIL, 1));
        paintBoot(p);
        if (p < 1) requestAnimationFrame(step); else finishBoot();
      })(performance.now());
    }
  }

  measureBoot();
  addEventListener('resize', measureBoot, { passive: true });
  /* Webfonts land after first paint and change every one of these widths. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { measureBoot(); kick(); });
  }

  /* Skip = scroll to the end of the entry section, which is where the film and
     the boot both finish. Not a class that hides it: the boot is part of the
     scroll spine, so leaving it means moving down the page, and anything else
     would desync the scrollbar from what is on screen. */
  const skipBtn = document.getElementById('sx-skip');
  if (skipBtn) skipBtn.addEventListener('click', () => finishBoot());

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

    root.querySelectorAll('.sx-slab').forEach(slab => {
      slab.addEventListener('pointermove', (e) => {
        const r = slab.getBoundingClientRect();
        slab.style.setProperty('--sx-mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        slab.style.setProperty('--sx-my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      }, { passive: true });
    });
  }

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

    idle = moved ? 0 : idle + 1;
    rafId = idle > IDLE_FRAMES ? 0 : requestAnimationFrame(frame);
  }
  function kick() { if (!rafId) { idle = 0; rafId = requestAnimationFrame(frame); } }

  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', kick, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  /* Paint the correct state now rather than on the first scroll, so a reload
     halfway down the page doesn't start from level zero and animate up. */
  updateExperience();
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

  function paintHero(p) {
    if (!heroLayer || !heroDepth) return;
    const k = reduced ? 1 : clamp01(p);
    /* Eased so the last stretch settles rather than arriving at constant speed
       — the camera does the same at the end of the dive. */
    const e = k < .5 ? 4*k*k*k : 1 - Math.pow(-2*k + 2, 3) / 2;

    heroDepth.style.transform = `translateZ(${(-620 * (1 - e)).toFixed(1)}px)`;
    heroDepth.style.opacity = Math.min(e * 1.5, 1).toFixed(3);
    heroDepth.style.filter = e > .985 ? '' : `blur(${((1 - e) * 13).toFixed(2)}px)`;

    /* The ground arrives with it, so the film is visible through the hero for
       the whole approach and only sealed off once it has landed. */
    heroLayer.style.background = `rgba(0,0,0,${(e * e).toFixed(3)})`;
    heroLayer.style.pointerEvents = e > .9 ? 'auto' : 'none';

    /* The terminal's visibility is a pure function of state, evaluated every
       frame — not a timer that can be interrupted, and not something the boot
       leaves behind. Before the loader has armed it is simply absent; while it
       runs, paintBoot owns it; once the hero starts arriving it clears, and
       once the hero has properly landed it is retired for good so it can never
       reappear behind a receding hero on the way back up. */
    if (termLayer && bootState !== 'running') {
      if (k > 0.5) termRetired = true;
      const v = (bootState === 'idle' || termRetired) ? 0 : (1 - clamp01(k / 0.34));
      termLayer.style.opacity = v.toFixed(3);
      termLayer.style.pointerEvents = 'none';
    }
  }
  window.SX = window.SX || {};
  window.SX.hero = paintHero;
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
        const d = Math.max(-1.4, Math.min(1.4, ((r.left + r.width / 2) - mid) / mid));
        c.style.setProperty('--sx-ry', (-d * 26).toFixed(2) + 'deg');
        /* Pushed back as it turns, so the bend reads as a cylinder rather than
           as cards shearing in place. */
        c.style.setProperty('--sx-tz', (-Math.abs(d) * 120).toFixed(1) + 'px');
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

  /* The one seam between this module and the landing's scrub engine: the
     landing owns the scroll spine and the film, so it owns the number; this
     module owns what the terminal does with it. */
  window.SX = window.SX || {};
  window.SX.armBoot = armBoot;
  paintBoot(0);

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
})();
