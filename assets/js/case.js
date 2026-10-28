/* Case-study pages under /work/: reveal, films, the section navigator, and
   the Dressing Room's shelf. Everything here is an extra: without it every
   block is visible, every film has its poster and every link still jumps. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasIO = 'IntersectionObserver' in window;

  /* Each block rises once as it enters. */
  const els = document.querySelectorAll('[data-r]');
  if (!hasIO) els.forEach(e => e.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(e => io.observe(e));
  }

  /* Films play while they are on screen and rest when they are not; with
     reduced motion they wait for the viewer to press play. */
  const vids = document.querySelectorAll('video');
  if (reduce) vids.forEach(v => { v.removeAttribute('autoplay'); v.pause(); v.controls = true; });
  else if (hasIO) {
    const vo = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting && !v.hidden) { const p = v.play(); if (p) p.catch(() => {}); } else v.pause();
    }), { threshold: .25 });
    vids.forEach(v => vo.observe(v));
  }

  /* The section navigator. One list in the markup (.side); the phone's pill
     (.jump) is built from it. Both light the section in the middle of the
     screen, and both hide over the hero and the footer. */
  const side = document.querySelector('.side');
  if (side) {
    const links = [...side.querySelectorAll('a[href^="#"]')];
    const secs = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const jump = document.createElement('details');
    jump.className = 'jump';
    jump.innerHTML = '<summary><span class="k">Section</span><b></b>' +
      '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>';
    const ol = side.querySelector('ol').cloneNode(true);
    jump.appendChild(ol);
    document.body.appendChild(jump);
    const jlinks = [...ol.querySelectorAll('a')];
    const now = jump.querySelector('summary b');
    ol.addEventListener('click', e => { if (e.target.closest('a')) jump.open = false; });
    document.addEventListener('click', e => { if (jump.open && !jump.contains(e.target)) jump.open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && jump.open) { jump.open = false; jump.querySelector('summary').focus(); } });

    const hero = document.querySelector('header');
    const foot = document.querySelector('footer');
    let ticking = false;
    const update = () => {
      ticking = false;
      const mid = innerHeight * .45;
      let cur = -1;
      secs.forEach((s, i) => { if (s.getBoundingClientRect().top <= mid) cur = i; });
      links.forEach((a, i) => { a.classList.toggle('on', i === cur); a.classList.toggle('done', i < cur); a.toggleAttribute('aria-current', i === cur); });
      jlinks.forEach((a, i) => a.classList.toggle('on', i === cur));
      now.textContent = cur >= 0 ? links[cur].textContent.trim() : links[0].textContent.trim();
      const past = hero ? hero.getBoundingClientRect().bottom < innerHeight * .5 : true;
      const before = foot ? foot.getBoundingClientRect().top > innerHeight * .8 : true;
      const show = past && before;
      side.classList.toggle('show', show);
      jump.classList.toggle('show', show);
      if (!show) jump.open = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      jump.style.setProperty('--p', (max > 0 ? Math.min(100, scrollY / max * 100) : 0).toFixed(1) + '%');
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    update();
  }

  /* The Dressing Room's shelf: pick an item and it stands on the pedestal,
     named the way the game names it. */
  const rail = document.querySelector('.dr-rail');
  if (rail) {
    const ph = document.querySelector('.dr-ph');
    const vid = ph.querySelector('video');
    const img = ph.querySelector('img');
    const name = document.querySelector('.dr-name');
    const btns = [...rail.querySelectorAll('button')];
    let t;
    rail.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.getAttribute('aria-pressed') === 'true') return;
      btns.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      name.style.setProperty('--c', b.dataset.c);
      name.querySelector('em').textContent = b.dataset.kind;
      name.querySelector('b').textContent = b.dataset.name;
      name.querySelector('span').textContent = b.dataset.goal;
      ph.classList.add('swap');
      clearTimeout(t);
      t = setTimeout(() => {
        if (b.dataset.video) {
          img.hidden = true; vid.hidden = false;
          if (!reduce) { vid.currentTime = 0; const p = vid.play(); if (p) p.catch(() => {}); }
        } else {
          vid.pause(); vid.hidden = true;
          img.src = b.dataset.src; img.alt = b.dataset.alt; img.hidden = false;
        }
        const done = () => ph.classList.remove('swap');
        if (img.hidden || img.complete) done(); else img.addEventListener('load', done, { once: true });
      }, reduce ? 0 : 180);
    });
    /* warm the cache so a tap swaps without a blank frame */
    const warm = () => btns.forEach(b => { if (b.dataset.src) { const i = new Image(); i.src = b.dataset.src; } });
    if ('requestIdleCallback' in window) requestIdleCallback(warm); else setTimeout(warm, 1500);
  }
})();
