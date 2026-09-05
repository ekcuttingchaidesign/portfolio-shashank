/* ============================================================================
   The reels, and the overlay they open.

   Three sets now — I click's photographs, I meme's memes, and the thirteen
   films on the strip up in Things That Move — and one dialog shared between
   them, because only one is ever open.

   The films are the reason this file grew a media TYPE. They are not this
   file's strip: the motion reel is built, measured and thrown by sections.js
   and nothing here touches it. What is shared is the thing a reader sees when
   they click a card, and there is no argument for that being two different
   dialogs with two different blurs, two close buttons in two places and two
   sets of arrow keys. So the overlay takes a set of items, each of which
   knows whether it is a picture or a film, and the strips stay strangers.

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
  /* The dialog is the only hard requirement now. The ledge reels were, back
     when they were the only thing that opened it. */
  if (!lb) return;

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
  const SETS = new Map();          // name -> [{ kind, src, ... }]

  reels.forEach(reel => {
    const name  = reel.dataset.gallery;
    const track = reel.querySelector('.lw-reel-track');
    if (!name || !track) return;

    const originals = [...track.children];

    SETS.set(name, originals.map(li => {
      const a = li.querySelector('a');
      const img = li.querySelector('img');
      return {
        kind: 'image',
        src: a.getAttribute('href'),
        alt: img ? img.getAttribute('alt') || '' : '',
      };
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
     1b · THE FILMS
     --------------------------------------------------------------------------
     Read off the strip in Things That Move, and read off its FIRST RUN only.
     The strip carries two identical runs so the marquee can wrap — the same
     shape as the marquee clone above, and the same trap: paging a set built
     from both runs would report "1 of 26" and walk through the reel twice.

     Nothing else about that strip is touched from here. sections.js owns its
     travel, its drag, its wheel and its heat; this reads thirteen srcs out of
     the markup and never speaks to it again.
     ====================================================================== */
  const mvRuns = [...document.querySelectorAll('#sx-reel .sx-reel-run')];
  if (mvRuns.length) {
    /* Same reasoning as the photographs: the index rides on the card. Written
       per RUN, so card four in the wrapping copy is still card four. */
    mvRuns.forEach(run => {
      [...run.querySelectorAll('.sx-cel-plate[data-video]')]
        .forEach((plate, i) => { plate.dataset.lbIndex = i; });
    });

    const films = [...mvRuns[0].querySelectorAll('.sx-cel-plate[data-video]')]
      .map(plate => {
        const poster = plate.querySelector('img');
        /* The cell already states its film's shape, because the strip needs it
           to size the card — "1920 / 1080", as a custom property in the
           markup. Reading it back here rather than repeating the number in a
           second attribute keeps one source for it; the overlay wants it as a
           single ratio, which is the one line of arithmetic below. */
        const cell = plate.closest('.sx-cel');
        const ar = (cell ? cell.style.getPropertyValue('--sx-cel-ar') : '').split('/');
        const ratio = ar.length === 2 ? parseFloat(ar[0]) / parseFloat(ar[1]) : 0;
        return {
          kind: 'video',
          src: plate.dataset.video,
          ratio: ratio > 0 ? ratio : 0,
          /* The card's own still, handed to the <video> as its poster. It is
             already in cache — it is the thing that was on screen when the
             card was clicked — so the dialog paints the right frame instantly
             and the film fades up over it rather than over black. */
          poster: poster ? poster.getAttribute('src') : '',
          alt: plate.dataset.title || '',
        };
      });
    if (films.length) SETS.set('motion', films);
  }

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
  const vid      = lb.querySelector('.lw-lb-video');
  const live     = lb.querySelector('.lw-lb-live');
  const closeBtn = lb.querySelector('.lw-lb-close');
  const prevBtn  = lb.querySelector('[data-lb-prev]');
  const nextBtn  = lb.querySelector('[data-lb-next]');

  let openName = null;      // which set is open, null when the dialog is shut
  let openIdx  = 0;
  let lastFocus = null;     // where focus came from, to put it back

  /* --- putting a film down ---------------------------------------------------
     Pausing is not enough and never was. A <video> that still holds a src goes
     on buffering after the dialog shuts — on a 7MB film that is the rest of the
     file pulled down for a viewer who has closed it — and paging from film four
     to film five while four is still downloading leaves two fetches racing.

     removeAttribute then load() is the pair that actually stops it: the first
     takes the source away, the second is what makes the element notice and
     abort the fetch in flight. Either one alone leaves the request running. */
  /* Which play() the element is currently supposed to be answering. Bumped by
     every drop(), and read by the fallback below — see the note there. */
  let playGen = 0;

  /* --- whose silence is it? ---
     The overlay reuses one <video>, so `muted` outlives the film that set it,
     and there are two entirely different reasons it can be on.

     One is the reader's: they hit mute on the controls, and that has to stick
     across every film they open afterwards. The other is ours: the unmuted
     play() was refused and the fallback muted the element to get a picture up
     at all. That must NOT stick, because the refusal is usually about the page
     not having been interacted with yet — a state that stops being true the
     moment somebody clicks anything, including the card that opened this.

     Without the distinction the two were the same flag, and one early refusal
     left every film for the rest of the visit silent.

     `volumechange` is what tells them apart: our own mute fires it with muted
     already true and changes nothing, while a reader turning the sound back on
     fires it with muted false and hands ownership back to them. */
  let autoMuted = false;
  if (vid) vid.addEventListener('volumechange', () => {
    if (!vid.muted) autoMuted = false;
  });

  function drop() {
    if (!vid) return;
    playGen++;
    vid.pause();
    vid.removeAttribute('src');
    vid.load();
  }

  function show(i) {
    const set = SETS.get(openName);
    if (!set || !set.length) return;

    /* Wraps in both directions, so Previous on the first card goes to the last
       one. The strip it came from is a loop; the overlay should not be the
       place that suddenly has an end. */
    openIdx = ((i % set.length) + set.length) % set.length;

    const it = set[openIdx];

    /* The kind rides on the ITEM, not on the set, so a set could one day hold
       both without anything here changing. It is also written to the dialog,
       because the frame the film needs is wider than the one a polaroid needs
       and that is a CSS decision — see .lw-lb[data-kind] in outside.css. */
    lb.dataset.kind = it.kind;

    if (it.kind === 'video' && vid) {
      img.hidden = true;
      img.removeAttribute('src');
      vid.hidden = false;
      /* Poster before src, so the frame the card was showing is what fills the
         box while the first bytes are still on their way. */
      if (it.poster) vid.poster = it.poster; else vid.removeAttribute('poster');
      /* Before the src, so the box is the right shape for the very first
         paint — see the note on .lw-lb-video in outside.css. */
      if (it.ratio) vid.style.setProperty('--lw-ar', String(it.ratio));
      else vid.style.removeProperty('--lw-ar');
      drop();
      vid.src = it.src;

      /* --- on the sound ---
         play() is called from inside the click that opened this, so the
         gesture is still live and the browser will allow it WITH audio — which
         is the right default for a reel of motion design, where half the work
         is cut to music.

         It is allowed rather than guaranteed. Autoplay policies differ, a
         reader may have muted the site, and a rejected promise here is not an
         error to report — it is the browser saying "not with sound, then". So
         the fallback is the same film playing silently rather than a film that
         does not play, and the controls are right there to unmute it. */
      /* Ours to undo, so undo it and let this film ask for sound on its own
         merits. A mute the reader chose is left exactly where they put it. */
      if (autoMuted) { autoMuted = false; vid.muted = false; }

      const gen = ++playGen;
      const started = vid.play();
      if (started && started.catch) started.catch(() => {
        /* A play() promise does not only reject because autoplay was refused.
           It ALSO rejects when the play it belonged to was interrupted — by the
           pause() inside drop(), which is to say by the reader closing the
           dialog or paging to the next film before the first one got going.

           Both arrive at this catch looking identical, and treating an
           interruption as a refusal is how "close a film quickly" turned into
           "every film after it is silent": the fallback muted the element and
           called play() again on whatever was in it by then.

           So the fallback only fires for the film it was started for. Anything
           that has since dropped or replaced the source has moved the counter
           on, and this rejection is old news. */
        if (gen !== playGen) return;
        autoMuted = true;
        vid.muted = true;
        const retry = vid.play();
        if (retry && retry.catch) retry.catch(() => {});
      });

      live.textContent = `${it.alt || 'Video'} — ${openIdx + 1} of ${set.length}`;
      /* No neighbour prefetch for film. Two hints on a gallery is 300KB of
         photographs the reader is about to want; two hints here is a dozen
         megabytes for a reader who may well stop at the first one. The poster
         is already cached from the card, so paging still lands on a picture
         rather than on black. */
      return;
    }

    drop();
    vid && (vid.hidden = true);
    img.hidden = false;
    img.src = it.src;
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
    if (it && it.kind === 'image') new Image().src = it.src;
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
    /* Announced rather than reached for. The ledge reels stop from CSS because
       they are CSS animations; the motion strip in Things That Move is a rAF
       writing transforms and has to be TOLD. An event keeps that one-way — this
       file still knows nothing about that strip, and sections.js still knows
       nothing about this dialog beyond the fact that it opens and shuts. */
    document.dispatchEvent(new CustomEvent('lb:open'));
  }

  function close() {
    if (openName === null) return;
    openName = null;
    /* Before the dialog goes, not after: hiding it does not stop a video, and
       a film left running behind a display:none dialog is audible. */
    drop();
    lb.hidden = true;
    delete lb.dataset.kind;
    document.documentElement.classList.remove('lw-lb-open');
    document.body.classList.remove('lw-lb-open');
    document.dispatchEvent(new CustomEvent('lb:close'));
    /* Back to the card that opened it. Without this, focus falls to the top of
       the document and a keyboard reader who opened photograph nine has to tab
       back through the entire page to reach photograph ten. */
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  /* --- which card is under the pointer ------------------------------------
     A hit test rather than a look at ev.target, and it exists because of the
     drag next door.

     sections.js takes a POINTER CAPTURE on #sx-reel at pointerdown, so that
     throwing the strip survives the pointer leaving it. A capture retargets the
     pointerup onto the capturing element — and with it the compatibility
     mouseup — so mousedown lands on the card and mouseup lands on the reel. The
     click that follows is dispatched at the COMMON ANCESTOR of those two, which
     is the reel, or the section above it once the strip has stepped a card
     along under a stationary pointer. Either way it is never the card. Every
     plain click on a film therefore arrived at the handler below matching no
     plate and did nothing: the entire strip was unclickable while looking
     perfectly clickable.

     Hit-testing the click point sidesteps the retarget entirely, and it is also
     the more honest question — the card under the cursor is the card the reader
     is looking at, whether or not the event agrees. It runs on every unmatched
     click rather than only inside the reel, which is safe because it can only
     ever answer with a card that is genuinely the TOPMOST thing under the
     point: with the overlay open it returns the overlay, not the strip behind
     the blur.

     Guarded on the coordinates, because a click synthesised by the keyboard
     reports 0,0 and would otherwise open whatever sits in the top-left corner
     of the page. Enter on a card never needs this path anyway: a button is the
     target of its own synthetic click, so the plain check catches it first. */
  function plateAt(ev) {
    if (!ev.clientX && !ev.clientY) return null;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return el && el.closest ? el.closest('.sx-cel-plate[data-video]') : null;
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
    /* The strip's cards. Checked first and returned from, because a plate is a
       <button> and nothing further down this handler would match it anyway —
       putting it first just saves the rest of the page a closest() per click.

       A drag across the strip ends in a click on whichever card the pointer let
       go over, which would open a film every time somebody threw the reel.
       sections.js swallows that click in the capture phase before it reaches
       here, so this handler only ever sees a click that was meant. */
    const plate = ev.target.closest('.sx-cel-plate[data-video]') || plateAt(ev);
    if (plate) {
      ev.preventDefault();
      open('motion', Number(plate.dataset.lbIndex) || 0, plate);
      return;
    }

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

    /* Arrows page the set — unless focus is in the player, where left and
       right are the browser's own five-second scrub and taking them would
       leave a keyboard reader with no way to seek a two-minute film. */
    const inPlayer = vid && !vid.hidden && document.activeElement === vid;
    if (!inPlayer) {
      if (ev.key === 'ArrowLeft')  { ev.preventDefault(); show(openIdx - 1); return; }
      if (ev.key === 'ArrowRight') { ev.preventDefault(); show(openIdx + 1); return; }
    }

    /* The trap. aria-modal tells a screen reader the rest of the page is not
       there; it does nothing whatsoever about Tab, so without this a sighted
       keyboard reader tabs straight out of the dialog and into a page they
       cannot see behind the blur. Only three controls, so cycling the list is
       the whole implementation. */
    if (ev.key !== 'Tab') return;
    /* The player joins the cycle when it is the thing on screen. Without it
       there is no way to reach play, scrub or volume from the keyboard — the
       controls are real focusable UI inside an element the trap was skipping. */
    const stops = [closeBtn, prevBtn, nextBtn];
    if (vid && !vid.hidden) stops.splice(1, 0, vid);
    const at = stops.indexOf(document.activeElement);
    ev.preventDefault();
    const step = ev.shiftKey ? -1 : 1;
    stops[((at < 0 ? 0 : at + step) % stops.length + stops.length) % stops.length].focus();
  });
})();
