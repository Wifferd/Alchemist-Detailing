/* Alchemist Detailing — the Gallery (#gallery). The owner's photos in a
   staggered grid with filters, a tilt that follows the pointer, a gold glint,
   scroll drift on alternating tiles, and a lightbox with previous / next,
   keyboard arrows and swipe. Only real photos of real work; add new ones to
   PHOTOS below (web versions in site/img/work/). */
(function () {
  'use strict';
  const U = window.AlchemistUI;
  const { el } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // key -> caption, alt text, tags, and a size hint for the grid (tall tiles span two rows)
  const PHOTOS = [
    { key: 'front', cap: 'Exterior detail', alt: 'Front of a white BMW M2 after an exterior detail', tags: ['exterior'], tall: true },
    { key: 'vent', cap: 'Beading on carbon', alt: 'Water beading on a carbon-fibre hood vent', tags: ['exterior', 'details'] },
    { key: 'brake', cap: 'Wheels and calipers', alt: 'Cleaned black wheel with a red brake caliper', tags: ['wheels'] },
    { key: 'mirror', cap: 'Protection at work', alt: 'Water beading on a side mirror', tags: ['exterior', 'details'], tall: true },
    { key: 'badge', cap: 'Badges and trim', alt: 'M2 badge on wet white paint', tags: ['details'] },
    { key: 'wheel', cap: 'Tires dressed', alt: 'Rear wheel and arch after cleaning', tags: ['wheels'] },
    { key: 'lip', cap: 'Carbon care', alt: 'Carbon-fibre front lip with water beading', tags: ['exterior', 'details'], tall: true },
    { key: 'side', cap: 'Every panel', alt: 'Side skirt and carbon trim after a wash', tags: ['exterior'] },
  ];
  const FILTERS = [['all', 'All'], ['exterior', 'Exterior'], ['wheels', 'Wheels'], ['details', 'Details'], ['interior', 'Interior']];
  const src = (k, w) => 'img/work/' + k + '-' + w + '.webp';

  let root = null, filter = 'all', list = PHOTOS, current = -1, io = null;

  function mount(container) { root = container; render(); }

  function render() {
    list = PHOTOS.filter((p) => filter === 'all' || p.tags.includes(filter));
    const chips = el('div.chips.gal-filters', { role: 'group', 'aria-label': 'Filter' }, FILTERS.map(([k, label]) => {
      const n = k === 'all' ? PHOTOS.length : PHOTOS.filter((p) => p.tags.includes(k)).length;
      return el('button.choice-item', { type: 'button', class: filter === k ? 'on' : '', 'aria-pressed': filter === k ? 'true' : 'false', disabled: n === 0, onclick: () => { filter = k; render(); } }, el('span.choice-name', label + (n ? ' · ' + n : '')));
    }));
    const grid = el('div.gal-grid', { id: 'galGrid' }, list.map((p, i) => el('figure.gal-tile', { class: p.tall ? 'tall' : '', tabIndex: 0, role: 'button', 'aria-label': p.cap + ', open', style: { '--i': i }, dataset: { key: p.key },
      onclick: () => open(i), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } } },
      el('div.gal-media', el('img', { src: src(p.key, 600), srcset: src(p.key, 600) + ' 600w, ' + src(p.key, 1200) + ' 1200w', sizes: '(max-width: 720px) 50vw, 33vw', alt: p.alt, loading: 'lazy', decoding: 'async', width: 600, height: 800 })),
      el('figcaption', el('span', p.cap), el('i', 'View')))));
    const empty = list.length ? null : el('p.bk-note', 'No ' + filter + ' photos yet. They\'ll be here as the owner adds them.');
    root.replaceChildren(el('div.gal',
      el('header.bk-head.gal-head', el('p.eyebrow', 'Our work'), el('h1.display.bk-title', 'The Gallery'), el('p.gal-intro', 'Every picture is a car we detailed. Tap one to see it full size.')),
      chips, grid, empty,
      el('div.work-foot', el('a.btn.btn-glass', { href: 'https://www.instagram.com/alchemy_details', target: '_blank', rel: 'noopener' }, 'More on Instagram ', el('span.arrow', { 'aria-hidden': 'true' }, '→')))));
    arm();
  }

  // Tiles rise in as they enter; on a fine pointer they tilt toward the cursor; alternating tiles drift on scroll.
  function arm() {
    if (io) io.disconnect();
    const tiles = Array.from(root.querySelectorAll('.gal-tile'));
    if (reduce) { tiles.forEach((t) => t.classList.add('in')); return; }
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
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

  // ---------------------------------------------------------------- lightbox with previous / next
  let box = null, img = null, cap = null, count = null, lastFocus = null, startX = null;
  function ensureBox() {
    if (box) return;
    box = el('div.lightbox.gal-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo', hidden: true, onclick: (e) => { if (e.target === box) close(); } },
      el('button.icon-btn.lightbox-x', { type: 'button', 'aria-label': 'Close', onclick: close }, el('svg', { viewBox: '0 0 24 24', width: 18, height: 18, innerHTML: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' })),
      el('button.icon-btn.gal-prev', { type: 'button', 'aria-label': 'Previous photo', onclick: () => step(-1) }, '‹'),
      el('button.icon-btn.gal-next', { type: 'button', 'aria-label': 'Next photo', onclick: () => step(1) }, '›'),
      img = el('img', { alt: '' }),
      el('div.lightbox-foot', cap = el('p.lightbox-cap'), count = el('span.gal-count.tnum')));
    box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener('touchend', (e) => { if (startX == null) return; const dx = e.changedTouches[0].clientX - startX; if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1); startX = null; }, { passive: true });
    document.addEventListener('keydown', (e) => { if (box.hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });
    document.body.appendChild(box);
  }
  function show(i) {
    current = (i + list.length) % list.length;
    const p = list[current];
    img.classList.remove('swap'); void img.offsetWidth; img.classList.add('swap');
    img.src = src(p.key, 1200); img.alt = p.alt; cap.textContent = p.cap; count.textContent = (current + 1) + ' / ' + list.length;
    const next = list[(current + 1) % list.length]; const pre = new Image(); pre.src = src(next.key, 1200);
  }
  function open(i) { ensureBox(); lastFocus = document.activeElement; box.hidden = false; requestAnimationFrame(() => box.classList.add('on')); show(i); document.documentElement.style.overflow = 'hidden'; box.querySelector('.gal-next').focus(); }
  function step(d) { show(current + d); }
  function close() { box.classList.remove('on'); setTimeout(() => { box.hidden = true; img.src = ''; }, 300); document.documentElement.style.overflow = ''; if (lastFocus) lastFocus.focus(); }

  window.AlchemistGallery = { mount, PHOTOS };
})();
