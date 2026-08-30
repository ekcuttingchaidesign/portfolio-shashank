/* ============================================================================
   The reels, and the overlay they open.

   Two galleries — I click's photographs and I meme's memes — and one dialog
   shared between them, because only one is ever open.

   Independent of outside.js in the same way outside.js is independent of
   sections.js: the reels sit inside the Ledge World's copy columns but they
   are not part of its traversal, they never read the camera, and outside.js
   never reaches in here. The one thing they share is the section, and the
   overlay does not live in it — see the note on the markup.

   Loop discipline matches the rest of the site: the marquee is a CSS
   animation on the compositor rather than a rAF writing transforms, so there
   is no third loop on this page. All this file does is measure it, clone the
   track so it can wrap, and get out of the way.
   ========================================================================== */

(() => {
  'use strict';

  const lb    = document.getElementById('lw-lb');
  const reels = [...document.querySelectorAll('.lw-reel')];
  if (!lb || !reels.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* How fast the strip travels, in CSS px per second. It is a SPEED and not a
     duration on purpose: I click holds eleven cards and I meme seven, so a
     shared duration would run the shorter strip at two thirds the pace of the
     longer one and the two would visibly disagree. Duration is derived from
     the measured width below.

     40 reads as a drift rather than a scroll — a 150px card takes about four
     seconds to cross its own width, which is slow enough to look at and fast
     enough that it is obviously moving. */
  const SPEED = 40;

  /* ==========================================================================
     1 · THE SETS
     --------------------------------------------------------------------------
     Each reel's original cards, captured BEFORE anything is cloned into the
     track. This array is what the overlay pages through, so it has to be the
     eleven photographs — not the twenty-two the marquee ends up holding, which
     would page through the whole set twice and report "1 of 22".
     ====================================================================== */
  const SETS = new Map();          // name -> [{ href, alt }]

  reels.forEach(reel => {
    const name  = reel.dataset.gallery;
    const track = reel.querySelector('.lw-reel-track');
    if (!name || !track) return;

    const originals = [...track.children];

    SETS.set(name, originals.map(li => {
      const a = li.querySelector('a');
      const img = li.querySelector('img');
      return { href: a.getAttribute('href'), alt: img ? img.getAttribute('alt') || '' : '' };
    }));

    /* The index travels on the card rather than being looked up by href.
       Two galleries could one day hold the same file, and an index is also
       what survives cloning — the marquee copy and the mirror copy of card 4
       both open card 4. */
    originals.forEach((li, i) => { li.querySelector('a').dataset.lbIndex = i; });

    buildMirror(name, originals);
    arm(reel, track, originals);
  });

  /* ==========================================================================
     2 · THE MIRROR
     --------------------------------------------------------------------------
     The reduced-motion stack is a different subtree from the stage, and the
     stage is display:none there — so the cards have to exist in both places.
     They are cloned rather than written twice in the markup: eighteen
     photographs maintained in two lists is eighteen chances for the two to
     drift apart.

     Nothing in here animates. A reader who has asked for reduced motion is
     asking for exactly that, and the CSS wraps this into a grid instead.
     ====================================================================== */
  function buildMirror(name, originals) {
    const host = document.querySelector(`[data-gallery-mirror="${name}"]`);
    if (!host) return;
    const ul = document.createElement('ul');
    originals.forEach(li => ul.appendChild(li.cloneNode(true)));
    host.appendChild(ul);
  }

  /* ==========================================================================
     3 · THE MARQUEE
     --------------------------------------------------------------------------
     One clone of the list, and a slide of exactly -50%. At the end of the
     animation the clone is standing precisely where the original started, so
     the reset to 0 cannot be seen. Both halves of that are load-bearing: the
     translate has to be a percentage of the track (a px distance drifts out of
     agreement with it at every window width) and the clone has to be exact.

     The clone is inert to everything except the pointer. It is aria-hidden, so
     a screen reader is not read eleven photographs twice, and every link in it
     is taken out of the tab order for the same reason — but it is still
     clickable, because the card under your cursor should open whichever copy
     of itself it happens to be.
     ====================================================================== */
  function arm(reel, track, originals) {
    if (reduced) return;

    const copy = document.createDocumentFragment();
    originals.forEach(li => {
      const c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      const a = c.querySelector('a');
      if (a) a.tabIndex = -1;
      copy.appendChild(c);
    });

    /* Measure the single copy BEFORE the clone goes in — after it, the width
       is the pair and would have to be halved, which is the same number
       arrived at with one more chance to be wrong.

       It can be measured this early because every card's width is stated in
       CSS and every <img> carries width/height attributes, so layout knows the
       strip's size without a single image byte having arrived. */
    const measure = () => {
      const w = track.scrollWidth;
      if (!w) return;
      reel.style.setProperty('--lw-reel-dur', (w / SPEED).toFixed(2) + 's');
    };
    measure();
    track.appendChild(copy);

    /* The card width is a clamp() on vw, so the strip is a different length at
       every window size and the duration has to follow it or the speed changes
       with the viewport. Re-measured off the original half only. */
    if (typeof ResizeObserver === 'function') {
      let last = 0;
      new ResizeObserver(() => {
        const w = track.scrollWidth / 2;
        if (!w || Math.abs(w - last) < 1) return;
        last = w;
        reel.style.setProperty('--lw-reel-dur', (w / SPEED).toFixed(2) + 's');
      }).observe(reel);
    }

    warm(reel, track);
    wheelable(reel, track);
    reel.dataset.playing = '';
  }

  /* ==========================================================================
     3c · THE WHEEL
     --------------------------------------------------------------------------
     Hover already stops the strip. Stopping it is only half of what a reader
     wants at that moment — the other half is being able to move it, and the
     obvious gesture for a horizontal row is the wheel or a two-finger swipe.

     It scrubs the ANIMATION rather than adding a transform of its own, and
     that is the whole trick. A second translate on a wrapper would have to be
     kept inside the slack the marquee has already spent: the track is two
     copies wide and the animation walks the full copy, so any extra offset
     can drag the strip's own end into frame. The animation's currentTime has
     no such problem — the loop is infinite and linear, so every time is a
     legal position, and wrapping the time into one period is invisible for
     the same reason the -50% reset is. Handing it back to CSS on pointer-out
     resumes from wherever the reader left it.

     currentTime is in ms and the strip travels at SPEED px/s, so a wheel
     delta in px converts straight across.

     preventDefault is deliberate and it is the cost: while the pointer is on
     the strip the page does not scroll, which on a scroll-driven section
     means the camera holds too. The strip is a few hundred px of a full
     viewport and moving off it returns the page immediately — a row that
     ignored the wheel while visibly inviting it would be the worse trade. */
  const WHEEL_GAIN = 1;

  /* deltaMode 1 is lines and 2 is pages; Firefox reports lines for a mouse
     wheel. Normalised to px so the gain means one thing everywhere. */
  function wheelPx(ev, host) {
    const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if (ev.deltaMode === 1) return d * 16;
    if (ev.deltaMode === 2) return d * (host.clientHeight || 400);
    return d;
  }

  function wheelable(reel, track) {
    if (reduced || typeof track.getAnimations !== 'function') return;

    reel.addEventListener('wheel', ev => {
      /* Read on every event rather than cached: the ResizeObserver above
         rewrites --lw-reel-dur at every window width, which replaces the
         timing this is scrubbing against. */
      const a = track.getAnimations().find(x => x.animationName === 'lw-reel-run');
      if (!a) return;

      const dur = Number(a.effect && a.effect.getTiming().duration);
      if (!dur || !isFinite(dur)) return;

      const px = wheelPx(ev, reel);
      if (!px) return;

      const now  = Number(a.currentTime) || 0;
      const next = now + px * WHEEL_GAIN / SPEED * 1000;
      a.currentTime = ((next % dur) + dur) % dur;   // one period, both ways
      ev.preventDefault();
    }, { passive: false });
  }

  /* ==========================================================================
     3b · WARMING
     --------------------------------------------------------------------------
     Every thumbnail in the strip, fetched when the section comes within a
     screen of the viewport. Same policy as the mascots and block variants next
     door in outside.js, and here it is not a nicety — it is what stops the
     strip having HOLES in it.

     `loading="lazy"` decides what to fetch from where a thing is in the
     viewport, and a marquee card is moved by a transform on its track. Only
     the two or three cards that happen to be inside the 520px window at first
     paint are ever considered near enough to load, and the rest slide into
     view as empty boxes — the frame is transparent PNG-white, so a card that
     has not arrived is not a placeholder, it is a gap in the row.

     The attribute stays on the markup rather than being dropped: it is still
     what keeps 360KB of thumbnails off the initial page load for a visitor who
     never scrolls this far. This just brings the fetch forward to the moment
     that stops being true. One screen of margin, so the strip is complete
     before it can be looked at.
     ====================================================================== */
  function warm(reel, track) {
    if (typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      track.querySelectorAll('img[loading="lazy"]').forEach(im => { im.loading = 'eager'; });
    }, { rootMargin: '100% 0px' });
    /* Observed on the SECTION, not on the reel. The reel lives inside a
       position:fixed stage that is pinned to the viewport for the whole
       traversal, so it is technically "on screen" from the moment the section
       is — which would fire this at the top of the page and warm everything
       for everyone. The section's own rect is the honest measure of how close
       the reader is. */
    io.observe(reel.closest('.lw') || reel);
  }

  /* ==========================================================================
     4 · THE OVERLAY
     ====================================================================== */
  const img      = lb.querySelector('.lw-lb-img');
  const live     = lb.querySelector('.lw-lb-live');
  const closeBtn = lb.querySelector('.lw-lb-close');
  const prevBtn  = lb.querySelector('[data-lb-prev]');
  const nextBtn  = lb.querySelector('[data-lb-next]');

  let openName = null;      // which set is open, null when the dialog is shut
  let openIdx  = 0;
  let lastFocus = null;     // where focus came from, to put it back

  function show(i) {
    const set = SETS.get(openName);
    if (!set || !set.length) return;

    /* Wraps in both directions, so Previous on the first card goes to the last
       one. The strip it came from is a loop; the overlay should not be the
       place that suddenly has an end. */
    openIdx = ((i % set.length) + set.length) % set.length;

    const it = set[openIdx];
    img.src = it.href;
    img.alt = it.alt;
    live.textContent = `Image ${openIdx + 1} of ${set.length}`;

    /* Both neighbours, because paging can go either way. The browser dedupes
       against its own cache, so this costs one request per image per visit
       however many times you page past it. */
    hint(set, openIdx + 1);
    hint(set, openIdx - 1);
  }

  function hint(set, i) {
    const it = set[((i % set.length) + set.length) % set.length];
    if (it) new Image().src = it.href;
  }

  function open(name, i, from) {
    if (!SETS.has(name)) return;
    openName  = name;
    lastFocus = from || null;
    lb.hidden = false;
    /* On both, because which one is the scrolling element depends on the
       browser and this page cannot afford to have the scrub advance a few
       hundred pixels behind a blur while someone reads a photograph. */
    document.documentElement.classList.add('lw-lb-open');
    document.body.classList.add('lw-lb-open');
    show(i);
    closeBtn.focus();
  }

  function close() {
    if (openName === null) return;
    openName = null;
    lb.hidden = true;
    document.documentElement.classList.remove('lw-lb-open');
    document.body.classList.remove('lw-lb-open');
    /* Back to the card that opened it. Without this, focus falls to the top of
       the document and a keyboard reader who opened photograph nine has to tab
       back through the entire page to reach photograph ten. */
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  /* --- getting in ---------------------------------------------------------
     Delegated, so it covers the originals, the marquee clones and the mirror
     without three registrations, and keeps working if a reel is ever rebuilt.

     Modified clicks are left alone. These are real links to real files, and
     cmd-click meaning "open in a new tab" is a promise the anchor already
     made — intercepting it would be taking that away to show a dialog the
     reader deliberately did not ask for. */
  document.addEventListener('click', ev => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target.closest('.lw-reel-i');
    if (!a) return;

    const host = a.closest('[data-gallery], [data-gallery-mirror]');
    if (!host) return;
    const name = host.dataset.gallery || host.dataset.galleryMirror;
    if (!SETS.has(name)) return;

    ev.preventDefault();
    open(name, Number(a.dataset.lbIndex) || 0, a);
  });

  /* --- getting out, and around ------------------------------------------- */
  lb.addEventListener('click', ev => {
    if (ev.target.closest('[data-lb-close]')) close();
  });
  prevBtn.addEventListener('click', () => show(openIdx - 1));
  nextBtn.addEventListener('click', () => show(openIdx + 1));

  addEventListener('keydown', ev => {
    if (openName === null) return;

    if (ev.key === 'Escape')     { ev.preventDefault(); close();          return; }
    if (ev.key === 'ArrowLeft')  { ev.preventDefault(); show(openIdx - 1); return; }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); show(openIdx + 1); return; }

    /* The trap. aria-modal tells a screen reader the rest of the page is not
       there; it does nothing whatsoever about Tab, so without this a sighted
       keyboard reader tabs straight out of the dialog and into a page they
       cannot see behind the blur. Only three controls, so cycling the list is
       the whole implementation. */
    if (ev.key !== 'Tab') return;
    const stops = [closeBtn, prevBtn, nextBtn];
    const at = stops.indexOf(document.activeElement);
    ev.preventDefault();
    const step = ev.shiftKey ? -1 : 1;
    stops[((at < 0 ? 0 : at + step) % stops.length + stops.length) % stops.length].focus();
  });
})();
