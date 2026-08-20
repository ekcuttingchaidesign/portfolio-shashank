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
     Typed by scroll, not by a clock. The rest of the page is scrubbed; a timed
     loader would be the single element racing ahead of the scrollbar, and that
     is precisely what makes a loader feel like a gate.

     Each line is revealed by clipping a span that is already in the DOM, so the
     text is present for screen readers and crawlers from first paint and there
     is zero per-frame layout.
     ====================================================================== */

  /* The terminal now lives inside the landing's hero, and its progress is
     handed down by the landing's scrub loop through window.SX.boot(). It is no
     longer a section with a scroll position of its own — that was the version
     that made you scroll a second time to watch a loader. */
  const termLayer = document.getElementById('sx-term-layer');
  const bootLines = termLayer ? [...termLayer.querySelectorAll('.sx-line')] : [];
  const bootCaret = document.getElementById('sx-caret');
  const bootProg = termLayer ? termLayer.querySelector('.sx-boot-prog') : null;

  /* The sequence finishes typing at 82% of the section, leaving the last fifth
     as a held frame — a beat of stillness before Work arrives. The camera does
     the same thing at the end of the dive. */
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

  function updateBoot(p) {
    if (!bootLines.length) return;

    /* The layer fades up fast — it is a machine waking, not a slow dissolve —
       and goes inert entirely at rest so it can't eat clicks on the hero CTA
       sitting underneath it. */
    if (termLayer) {
      const vis = reduced ? 1 : Math.min(p * 9, 1);
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

    /* The caret sits at the write head of the line currently being typed, which
       is what makes the sequence read as one process writing rather than as
       lines fading in one after another. */
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
  const sEnter = document.getElementById('s-enter');
  if (skipBtn && sEnter) {
    skipBtn.addEventListener('click', () => {
      const to = scrollY + sEnter.getBoundingClientRect().bottom - innerHeight;
      scrollTo({ top: to, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

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

  /* The one seam between this module and the landing's scrub engine: the
     landing owns the scroll spine and the film, so it owns the number; this
     module owns what the terminal does with it. */
  window.SX = window.SX || {};
  window.SX.boot = updateBoot;
  updateBoot(0);

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
