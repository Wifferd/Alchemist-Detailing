/* Alchemist Detailing — the Gallery (#gallery). The owner's photos in a
   staggered grid with filters, a tilt that follows the pointer, a gold glint,
   scroll drift on alternating tiles, the Transmutation (his before / after
   slider, fed by PAIRS), and the one lightbox on the site (the home page's
   "Our work" strip opens it too, through openKey) with previous / next,
   keyboard arrows and swipe, a two-line caption (the part, then what the
   photo shows) and a link to the services that do that work. Only real
   photos of real work; add new ones to PHOTOS below (web versions in
   site/img/work/). */
(function () {
  'use strict';
  const U = window.AlchemistUI;
  const { el } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const narrow = window.matchMedia('(max-width: 980px)');   // where the grid drops to two columns (alchemist.css)

  // key -> caption, alt text, tags, and a size hint for the grid (tall tiles span two rows). The pattern
  // normal, tall, normal, tall, normal, tall, tall, normal fills three and two columns without a hole.
  const PHOTOS = [
    { key: 'front', cap: 'Exterior detail', alt: 'Front of a white BMW M2 after an exterior detail', tags: ['exterior'] },
    { key: 'vent', cap: 'Beading on carbon', alt: 'Water beading on a carbon-fibre hood vent', tags: ['exterior', 'details'], tall: true },
    { key: 'brake', cap: 'Wheels and calipers', alt: 'Cleaned black wheel with a red brake caliper', tags: ['wheels'] },
    { key: 'mirror', cap: 'Water beading', alt: 'Water beading on a side mirror', tags: ['exterior', 'details'], tall: true },
    { key: 'badge', cap: 'Badges and trim', alt: 'M2 badge on wet white paint', tags: ['details'] },
    { key: 'wheel', cap: 'Wheels and tires', alt: 'Rear wheel and arch after cleaning', tags: ['wheels'], tall: true },
    { key: 'lip', cap: 'Carbon care', alt: 'Carbon-fibre front lip with water beading', tags: ['exterior', 'details'], tall: true },
    { key: 'side', cap: 'Every panel', alt: 'Side skirt and carbon trim after a wash', tags: ['exterior'] },
  ];
  const FILTERS = [['all', 'All'], ['exterior', 'Exterior'], ['wheels', 'Wheels'], ['details', 'Details'], ['interior', 'Interior']];
  // Before / after pairs for the Transmutation: the same car from the same spot, before the wash and
  // after it (`before` and `after` are photo keys, img/work/<key>-<w>.webp). There are no before photos
  // yet, so `before` stays null: the live site then leaves the section out, and the preview shows the
  // owner's placeholder in its place so he can see the design.
  const PAIRS = [{ key: 'front', title: 'Exterior detail', before: null, after: 'front' }];
  const NEXT = ['Wheels', 'Interior'];   // the pairs still to shoot, shown as dashed "Next pair" tiles
  // the service group behind a photo, by its tags: the group, never a package (which one the car got is the owner's to say)
  const groupOf = (p) => (p.tags.includes('interior') ? ['#services-interior', 'Interior services']
    : p.tags.some((t) => ['exterior', 'details', 'wheels'].includes(t)) ? ['#services-exterior', 'Exterior services'] : null);
  const two = (n) => String(n).padStart(2, '0');
  const src = (k, w) => 'img/work/' + k + '-' + w + '.webp';
  const srcset = (k) => src(k, 600) + ' 600w, ' + src(k, 1200) + ' 1200w';
  const byKey = (k) => PHOTOS.find((p) => p.key === k) || {};
  const arrow = () => el('span.arrow', { 'aria-hidden': 'true' }, '→');
  const SVG = 'http://www.w3.org/2000/svg';
  function icon(d) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  let root = null, filter = 'all', list = PHOTOS, current = -1, io = null, chips = null, body = null;

  // The page: the shared head, the Transmutation, the filter chips, the grid, then Book Now and Instagram.
  // Only the chips and the grid are rebuilt when the filter changes.
  function mount(container) {
    root = container;
    chips = el('div.chips.gal-filters', { role: 'group', 'aria-label': 'Filter' });
    body = el('div.gal-body');
    const page = el('div.gal',
      el('header.page-head', el('p.eyebrow', 'Our work'), el('h1.display.gold-text', 'The Gallery'), el('span.rule', { 'data-reveal': '' }),
        el('p', 'Every picture is a car we detailed. Tap one to see it full size.')),
      chips, body,
      el('div.work-foot',
        el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', arrow()),
        el('a.btn.btn-glass', { href: 'https://www.instagram.com/alchemy_details', target: '_blank', rel: 'noopener', 'aria-label': 'More on Instagram (opens in a new tab)' }, 'More on Instagram ', extMark())));
    root.replaceChildren(page);
    placeCompare(page, chips);
    renderGrid();
  }

  // The Transmutation sits between the head and the filters. With no before photo it is for the preview
  // only, and the data layer knows which mode it is in once it has reached the database, so this waits.
  function placeCompare(page, next) {
    const D = window.AlchemistData;
    const put = () => { const sec = compare(PAIRS); if (sec && page.isConnected) page.insertBefore(sec, next); };
    if (!D || PAIRS.some((p) => p.before)) put();
    else D.init().then(put);
  }

  function renderGrid() {
    list = PHOTOS.filter((p) => filter === 'all' || p.tags.includes(filter));
    chips.replaceChildren(...FILTERS.map(([k, label]) => {
      const n = k === 'all' ? PHOTOS.length : PHOTOS.filter((p) => p.tags.includes(k)).length;
      if (n === 0 && k !== 'all') return null;   // no photos of that kind yet (no interior photo): no chip
      return el('button.choice-item', { type: 'button', class: filter === k ? 'on' : '', 'aria-pressed': filter === k ? 'true' : 'false', onclick: () => { filter = k; renderGrid(); } }, el('span.choice-name', label + ' · ' + n));
    }).filter(Boolean));
    const tall = fit(list, narrow.matches ? 2 : 3);
    body.replaceChildren(el('div.gal-grid', { id: 'galGrid' }, list.map((p, i) => el('figure.gal-tile', { class: tall[i] ? 'tall' : '', style: { '--i': i }, dataset: { key: p.key } },
      el('button.gal-btn', { type: 'button', 'aria-label': 'Open photo: ' + p.cap, onclick: () => open(i) },
        el('div.gal-media', el('img', { sizes: '(max-width: 720px) 50vw, 33vw', loading: 'lazy', decoding: 'async', srcset: srcset(p.key), src: src(p.key, 600), alt: p.alt, width: 600, height: 800 }))),
      el('figcaption', el('span', p.cap), el('i', 'View'))))));
    arm();
  }
  narrow.addEventListener('change', () => { if (body) renderGrid(); });

  // The grid packs its tiles densely (grid-auto-flow: dense), so a tall tile can leave an empty cell behind
  // it. This places the tiles the way the browser will and drops tall flags from the end until nothing is
  // skipped; then, when a few fewer tall tiles would complete the last row (five exteriors in three
  // columns, say), it takes that, so a filtered set ends square too.
  function fit(items, cols) {
    const cells = (t) => t.reduce((n, x) => n + (x ? 2 : 1), 0);
    const tall = items.map((p) => !!p.tall);
    for (let i = tall.length - 1; i >= 0 && skips(tall, cols); i--) tall[i] = false;
    const square = tall.slice();
    for (let i = square.length - 1; i >= 0 && cells(square) % cols; i--) square[i] = false;
    return cells(square) % cols === 0 && !skips(square, cols) ? square : tall;
  }
  function skips(tall, cols) {
    const used = [];
    const free = (r, c) => !(used[r] && used[r][c]);
    const take = (r, c) => { (used[r] = used[r] || [])[c] = true; };
    tall.forEach((t) => {
      for (let r = 0; ; r++) for (let c = 0; c < cols; c++) {
        if (free(r, c) && (!t || free(r + 1, c))) { take(r, c); if (t) take(r + 1, c); return; }
      }
    });
    let gap = false;
    for (let r = 0; r < used.length; r++) for (let c = 0; c < cols; c++) {
      if (free(r, c)) gap = true; else if (gap) return true;
    }
    return false;
  }

  // the "opens elsewhere" mark on the Instagram link (an SVG needs its own namespace, which el() does not make)
  function extMark() {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'ext'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }

  // ---------------------------------------------------------------- the Transmutation (the owner's design)
  // A before / after slider: the after photo under a before layer clipped from the right, a gold seam with
  // a ‹ ✦ › handle on the cut, Before / After pills, and a range input over the whole frame that drives it
  // through --pos and --cr (no transition: the seam tracks the finger; arrows work as on any slider).
  // Thumbnails switch pairs; pairs still to shoot are dashed "Next pair" tiles. Returns null when the live
  // site has nothing real to compare yet.
  function compare(pairs) {
    const D = window.AlchemistData;
    if (D && D.isLive && !pairs.some((p) => p.before)) return null;
    const after = el('img.tm-after', { width: 1200, height: 1600, decoding: 'async', sizes: '(max-width: 1180px) 100vw, 1180px' });
    const before = el('div.tm-before');
    const range = el('input.tm-range', { type: 'range', min: 4, max: 96, step: 1, value: 46, 'aria-label': 'Compare before and after', oninput: () => slide(range.value) });
    const frame = el('div.tm-frame', after, before,
      el('span.tm-scrim', { 'aria-hidden': 'true' }),
      el('span.tm-ticks', { 'aria-hidden': 'true' }),   // the inspection's viewfinder: four thin corner ticks, nothing measured
      el('span.tm-seam', { 'aria-hidden': 'true' }),
      el('span.tm-handle', { 'aria-hidden': 'true' }, el('span', '‹'), el('i', '✦'), el('span', '›')),
      el('span.tm-pill.before', 'Before'), el('span.tm-pill.after', 'After'),
      range);
    const paint = (v) => {
      frame.style.setProperty('--pos', v + '%');
      frame.style.setProperty('--cr', (100 - v) + '%');
    };
    const slide = (v) => { paint(v); range.setAttribute('aria-valuetext', v + '% before'); };
    const thumbs = el('div.tm-thumbs',
      pairs.map((p, i) => el('div.tm-pair',
        el('button.tm-thumb', { type: 'button', 'aria-label': 'Show ' + p.title, 'aria-pressed': 'false', onclick: () => pick(i) },
          el('img', { src: src(p.after, 600), alt: '', width: 600, height: 800, loading: 'lazy', decoding: 'async' })),
        el('span', p.title))),
      NEXT.map((t) => el('div.tm-pair.next', el('div.tm-next', 'Next pair'), el('span', t))));
    const pick = (i) => {
      const p = pairs[i];
      after.srcset = srcset(p.after); after.src = src(p.after, 1200); after.alt = byKey(p.after).alt || '';   // the sources after sizes (set when it was made)
      before.replaceChildren(p.before
        ? el('img', { sizes: after.sizes, decoding: 'async', srcset: srcset(p.before), src: src(p.before, 1200), alt: byKey(p.before).alt || '', width: 1200, height: 1600 })
        : el('div.tm-ph', el('div', el('b', 'Before photo'), el('span', 'Same angle, same light, shot before the wash'))));
      thumbs.querySelectorAll('.tm-thumb').forEach((t, j) => t.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
    };
    pick(0);
    slide(range.value);
    nudge(frame, range, paint, () => slide(range.value));
    return el('section.transmute', { 'aria-labelledby': 'tmTitle' },
      el('div.section-head', el('p.eyebrow', 'Before and after'), el('h2.display', { id: 'tmTitle' }, 'The Transmutation'), el('p.script', 'Drag the seam. Same car, same spot. ✦')),
      frame, thumbs);
  }

  // The seam shows it can be dragged: the first time the frame is 40% on screen it glides out to 58% and back
  // (about 1.4s, the long unveil ease), then rests. Skipped under reduced motion; a touch of the frame, a key or a drag
  // on the slider stops it at once and the seam is where the slider says. The rAF loop runs only for the glide.
  const glide = bezier(.16, 1, .3, 1);   // --ease-unveil in the stylesheet
  function nudge(frame, range, paint, rest) {
    if (reduce || !('IntersectionObserver' in window)) return;
    let raf = 0, over = false;
    const from = +range.value, to = 58, OUT = 650, HOLD = 150, BACK = 650;
    const stop = () => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      seen.disconnect();
      rest();
    };
    const seen = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      const t0 = performance.now();
      const frameStep = (now) => {
        if (over) return;
        const t = now - t0;
        const v = t < OUT ? from + (to - from) * glide(t / OUT) : t < OUT + HOLD ? to : to + (from - to) * glide(Math.min(1, (t - OUT - HOLD) / BACK));
        paint(v.toFixed(2));
        if (t < OUT + HOLD + BACK) raf = requestAnimationFrame(frameStep); else stop();
      };
      raf = requestAnimationFrame(frameStep);
    }, { threshold: 0.4 });
    seen.observe(frame);
    ['pointerdown', 'keydown', 'input'].forEach((t) => frame.addEventListener(t, stop, { once: true, passive: true }));
  }
  // cubic-bezier(x1, y1, x2, y2) as a function of progress, solved by bisection (the CSS easing, for the rAF glide)
  function bezier(x1, y1, x2, y2) {
    const at = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    return (x) => {
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (at(t, x1, x2) < x) lo = t; else hi = t; }
      return at(t, y1, y2);
    };
  }

  // Tiles rise in as they enter and are marked settled once they land (so the tilt is quick after
  // that); on a fine pointer they tilt toward the cursor; alternating tiles drift on scroll.
  function arm() {
    if (io) io.disconnect();
    const tiles = Array.from(root.querySelectorAll('.gal-tile'));
    if (reduce) { tiles.forEach((t) => t.classList.add('in', 'settled')); return; }
    const settle = (t) => {
      let done = false;
      const fin = () => { if (done) return; done = true; t.classList.add('settled'); };
      t.addEventListener('transitionend', (e) => { if (e.target === t && e.propertyName === 'transform') fin(); });
      setTimeout(fin, 1400);
    };
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); settle(e.target); io.unobserve(e.target); } }), { threshold: 0.15 });
    tiles.forEach((t) => io.observe(t));
    if (fine) tiles.forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        t.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg'); t.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
        t.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%'); t.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
        t.classList.add('tilt');
      });
      t.addEventListener('pointerleave', () => { t.classList.remove('tilt'); t.style.removeProperty('--rx'); t.style.removeProperty('--ry'); });
    });
    let ticking = false;
    const drift = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const vh = window.innerHeight;
        tiles.forEach((t, i) => {
          const r = t.getBoundingClientRect();
          const p = (r.top + r.height / 2 - vh / 2) / vh;   // -1 above centre … +1 below
          t.style.setProperty('--drift', ((i % 3 === 1 ? -1 : 0.5) * p * 18).toFixed(1) + 'px');
        });
        ticking = false;
      });
    };
    window.removeEventListener('scroll', window.__galDrift || (() => {}));
    window.__galDrift = drift; window.addEventListener('scroll', drift, { passive: true }); drift();
  }
  // Leaving the Gallery (app.js): the scroll drift and the rise observer stop, and a resize no longer rebuilds the
  // grid, so no other page (the home wash least of all) pays for them. mount() starts them again.
  function unmount() {
    if (window.__galDrift) window.removeEventListener('scroll', window.__galDrift);
    window.__galDrift = null;
    if (io) { io.disconnect(); io = null; }
    body = null;
  }

  // ---------------------------------------------------------------- lightbox with previous / next
  let box = null, img = null, cap = null, desc = null, count = null, link = null, lastFocus = null, startX = null, showToken = 0;
  function ensureBox() {
    if (box) return;
    box = el('div.lightbox.gal-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo', tabIndex: -1, hidden: true, onclick: (e) => { if (e.target === box) close(); } },
      el('button.icon-btn.lightbox-x', { type: 'button', 'aria-label': 'Close', onclick: close }, icon('M6 6l12 12M18 6L6 18')),
      el('button.icon-btn.gal-prev', { type: 'button', 'aria-label': 'Previous photo', onclick: () => step(-1) }, icon('M15 6l-6 6 6 6')),
      el('button.icon-btn.gal-next', { type: 'button', 'aria-label': 'Next photo', onclick: () => step(1) }, icon('M9 6l6 6-6 6')),
      img = el('img', { alt: '' }),
      // the part, the counter, what the photo shows (the alt text, so the reader hears it once, from the photo), and
      // the services behind it: the link closes the box first (overflow, inert, focus), then the router follows it
      el('div.lightbox-foot',
        cap = el('p.lightbox-cap'), count = el('span.gal-count.tnum'),
        desc = el('p.lightbox-desc', { 'aria-hidden': 'true' }),
        link = el('a.note-link.lightbox-go', { href: '#services', hidden: true, onclick: () => close() })));
    box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => { if (startX == null) return; const dx = e.changedTouches[0].clientX - startX; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); startX = null; }, { passive: true });
    document.addEventListener('keydown', (e) => {
      if (box.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'Tab') {   // focus stays inside the open lightbox
        const f = Array.from(box.querySelectorAll('button, a')).filter((n) => !n.hidden);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.body.appendChild(box);
  }
  // The next picture is decoded before it replaces the one on screen, so the swap never shows a blank.
  function show(i) {
    current = (i + list.length) % list.length;
    const p = list[current];
    const token = ++showToken;
    const next = new Image();
    next.src = src(p.key, 1200);
    const go = () => {
      if (token !== showToken) return;
      img.classList.remove('swap'); void img.offsetWidth; img.classList.add('swap');
      img.src = next.src; img.alt = p.alt; cap.textContent = p.cap; desc.textContent = p.alt;
      count.textContent = two(current + 1) + ' / ' + two(list.length);
      const g = groupOf(p);
      link.hidden = !g;
      if (g) { link.href = g[0]; link.replaceChildren(g[1], el('span.arrow', { 'aria-hidden': 'true' }, '→')); }
    };
    next.decode().then(go, go);
    [1, -1].forEach((d) => { const q = list[(current + d + list.length) % list.length]; if (q !== p) new Image().src = src(q.key, 1200); });
  }
  const outside = () => ['#main', '#topbar', '.footer'].map((s) => document.querySelector(s)).filter(Boolean);
  function open(i) {
    ensureBox();
    lastFocus = document.activeElement;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('on'));
    show(i);
    U.holdPage(true);
    outside().forEach((n) => { n.inert = true; });
    box.focus({ preventScroll: true });
  }
  function openKey(key) {   // from the home page's strip: the full set, in its order
    list = PHOTOS;
    const i = PHOTOS.findIndex((p) => p.key === key);
    if (i >= 0) open(i);
  }
  function step(d) { show(current + d); }
  function close() {
    box.classList.remove('on');
    setTimeout(() => { box.hidden = true; img.src = ''; }, 300);
    U.holdPage(false);
    outside().forEach((n) => { n.inert = false; });
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  window.AlchemistGallery = { mount, unmount, open, openKey, compare, PHOTOS, PAIRS };
})();
