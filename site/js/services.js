/* Alchemist Detailing — the Services page showroom (the owner's own designs,
   doc 32): the Alchemist's Table (the menu as a periodic table of elements),
   the Ritual (how an exterior is done, five opening panels) and the Bead Test
   (bare paint beside WetGloss). app.js mounts the three once, when the
   services page first opens. Every price, time and description below is the
   menu as it stands on the page; nothing here invents a fact. */
(function () {
  'use strict';
  const { el } = window.AlchemistUI;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hoverable = window.matchMedia('(hover: hover)').matches;
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- the elements (the menu, Oct 10, 2026)
  const ELEMENTS = [
    { key: 'eb', sym: 'Eb', num: '1', name: 'Exterior Basic', short: 'Exterior Basic', price: '$49.99', time: '60 min', mobile: '+2.5%', eq: '',
      desc: 'Snow-foam pre-wash, Brake Buster on wheels and tires, exterior glass, then a thorough hand wash and hand dry.' },
    { key: 'ib', sym: 'Ib', num: '3', name: 'Interior Basic', short: 'Interior Basic', price: '$59.99', time: '60 min', mobile: '+2.5%', eq: '',
      desc: 'Full vacuum, dash and plastics with Top Star, Gummifix on rubber and mats, interior glass and a general wipe-down.' },
    { key: 'sc', sym: 'Sc', num: '5', name: 'Signature Combo', short: 'Signature Combo', price: '$99.99', time: '2 h', mobile: '+7%', eq: 'Eb + Ib → Sc',
      desc: 'Exterior Basic and Interior Basic together: $109.98 booked separately, so you save $9.99.' },
    { key: 'wg', sym: 'Wg', num: '7', name: 'WetGloss', short: 'WetGloss', price: 'from $44.99', time: '+30 min', mobile: '+2.5%', eq: '', addon: true,
      desc: 'Spray-on sealant for gloss and water beading, added after a wash with an exterior service. Lasts several weeks. $44.99 car, coupe or sedan; $54.99 crossover, SUV or minivan; $64.99 truck or large SUV.' },
    { key: 'ed', sym: 'Ed', num: '2', name: 'Exterior Deluxe', short: 'Exterior Deluxe', price: '$94.99', time: '90 min', mobile: '+7%', eq: '',
      desc: 'Everything in Exterior Basic, plus Green Star pre-treatment where appropriate and Koch-Chemie Hydro Foam Sealant for gloss and water beading.' },
    { key: 'id', sym: 'Id', num: '4', name: 'Interior Deluxe', short: 'Interior Deluxe', price: '$134.99', time: '2 h', mobile: '+7%', eq: '',
      desc: 'Everything in Interior Basic, plus deep steam or shampoo, drill-brush agitation, deeper stain removal and Leather Star conditioning. Steam cleaning included.' },
    { key: 'au', sym: 'Au', num: '79', name: 'Full Detail Bundle', short: 'Full Detail', price: '$209.99', time: '3½ h', mobile: '+7%', eq: 'Ed + Id → Au',
      desc: 'Exterior Deluxe and Interior Deluxe together, steam cleaning included: $229.98 booked separately, so you save $19.99.' },
    { key: 'st', sym: 'St', num: '8', name: 'Steam Cleaning', short: 'Steam Cleaning', price: '$49.99', time: '+30 min', mobile: '+2.5%', eq: '', addon: true,
      desc: 'Deep steam for carpets, upholstery and interior surfaces. Already included in Interior Deluxe and the Full Detail Bundle.' },
  ];
  const BY = Object.fromEntries(ELEMENTS.map((e) => [e.key, e]));
  // column heads: the group, its element, and a small mark
  const COLS = [
    { area: 'c1', name: 'Exterior', elem: 'Water', icon: ['M4 6h16L12 20z'] },
    { area: 'c2', name: 'Interior', elem: 'Air', icon: ['M12 4l8 14H4z', 'M7.4 13h9.2'] },
    { area: 'c3', name: 'Bundles', elem: 'Gold', icon: ['circle', 'M11 12h2'] },
    { area: 'c4', name: 'Add-ons', elem: 'Salt', icon: ['circle', 'M4 12h16'] },
  ];
  // row heads: the tier; the second pair repeats them on a phone, where the grid is two columns wide
  const ROWS = [['r1', 'I', 'Basic'], ['r2', 'II', 'Deluxe'], ['r1b', 'I', 'Basic', true], ['r2b', 'II', 'Deluxe', true]];

  function mark(paths) {
    const s = document.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    paths.forEach((d) => {
      const p = document.createElementNS(SVG, d === 'circle' ? 'circle' : 'path');
      if (d === 'circle') { p.setAttribute('cx', '12'); p.setAttribute('cy', '12'); p.setAttribute('r', '8'); } else p.setAttribute('d', d);
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.4'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round');
      s.appendChild(p);
    });
    return s;
  }
  const arrow = () => el('span.arrow', { 'aria-hidden': 'true' }, '→');
  const photo = (key, alt, extra) => el('img', Object.assign({
    src: 'img/work/' + key + '-1200.webp', srcset: 'img/work/' + key + '-600.webp 600w, img/work/' + key + '-1200.webp 1200w',
    alt, width: 1200, height: 1600, loading: 'lazy', decoding: 'async', draggable: false,
  }, extra || {}));
  // the owner's renders are textures, never captioned as our work
  const texture = (name, w, h) => el('img', { src: 'img/art/' + name + '.webp', alt: '', width: w, height: h, loading: 'lazy', decoding: 'async', draggable: false });

  // The nearest tile in a direction, by geometry, so the arrows work on the phone grid too.
  function neighbour(list, from, dx, dy) {
    const a = from.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = Infinity;
    list.forEach((t) => {
      if (t === from) return;
      const r = t.getBoundingClientRect();
      const cx = r.left + r.width / 2 - ax, cy = r.top + r.height / 2 - ay;
      const along = cx * dx + cy * dy, across = Math.abs(dx ? cy : cx);
      if (along <= 1 || across > (dx ? a.height : a.width) * 0.6) return;
      if (along < bd) { bd = along; best = t; }
    });
    return best;
  }
  const ARROWS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };

  // ---------------------------------------------------------------- the Alchemist's Table
  function mountTable(container) {
    let picked = 'au';
    const tiles = new Map();
    const list = [];
    ELEMENTS.forEach((e) => {
      const au = e.key === 'au';
      const t = el('button.el-tile', {
        type: 'button', class: (e.addon ? 'addon' : '') + (au ? ' au' : ''), 'aria-pressed': 'false', tabindex: -1,
        dataset: { key: e.key }, style: { gridArea: e.key }, onclick: () => pick(e.key, false),
      },
        el('span.meta.tnum', el('span', e.num), el('span', e.time)),
        el('span.sym', { class: au ? null : 'gold-text' }, e.sym),
        el('span.nm', el('b', e.name), el('span.tnum', e.price)));
      tiles.set(e.key, t);
      list.push(t);
    });
    const grid = el('div.el-grid', { role: 'group', 'aria-label': 'The menu as elements' },
      COLS.map((c) => el('div.el-col', { style: { gridArea: c.area } }, mark(c.icon), el('b', c.name), el('i', c.elem))),
      ROWS.map(([area, num, tier, dup]) => el('div.el-row', { class: dup ? 'dup' : null, style: { gridArea: area } }, el('i', num), el('span', tier))),
      list);
    grid.addEventListener('keydown', (e) => {
      const t = e.target.closest('.el-tile');
      if (!t) return;
      let next = null;
      if (ARROWS[e.key]) next = neighbour(list, t, ...ARROWS[e.key]);
      else if (e.key === 'Home') next = list[0];
      else if (e.key === 'End') next = list[list.length - 1];
      else return;
      e.preventDefault();
      if (next) pick(next.dataset.key, true);
    });

    // the side panel
    const pNo = el('span.no.tnum'), pSym = el('div.sym.gold-text', { 'aria-hidden': 'true' }), pName = el('h3', { 'aria-live': 'polite' });
    const pEq = el('div.el-eq'), pDesc = el('p'), pPrice = el('b.price.tnum'), pTime = el('b.tnum'), pMobile = el('b.tnum');
    const pLabel = document.createTextNode('');
    const panel = el('aside.el-panel', { 'aria-label': 'The picked element' },
      el('div.top', el('span.eyebrow', 'Element'), pNo), pSym, pName, pEq, pDesc,
      el('div.el-facts', el('div', el('span', 'Price'), pPrice), el('div', el('span', 'Time'), pTime), el('div', el('span', 'Mobile'), pMobile)),
      el('a.btn.btn-gold.shine', { href: '#book' }, pLabel, arrow()));
    function pick(key, focus) {
      const e = BY[key];
      if (!e) return;
      const changed = key !== picked;
      picked = key;
      tiles.forEach((t, k) => { const on = k === key; t.setAttribute('aria-pressed', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      pNo.textContent = 'No. ' + e.num; pSym.textContent = e.sym; pName.textContent = e.name;
      pEq.textContent = e.eq; pEq.hidden = !e.eq; pDesc.textContent = e.desc;
      pPrice.textContent = e.price; pTime.textContent = e.time; pMobile.textContent = e.mobile;
      pLabel.data = 'Book ' + e.short + ' ';
      if (changed && !reduce) { panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap'); }
      if (focus) tiles.get(key).focus({ preventScroll: true });
    }
    pick(picked, false);

    // the legend reads the first element (the design's mini tile), and the mobile note is the menu's own sentence
    const eb = ELEMENTS[0];
    const legend = el('div.el-legend',
      el('div.el-mini', { 'aria-hidden': 'true' }, el('span.meta.tnum', el('span', eb.num), el('span', eb.time.replace(' min', ''))), el('span.sym', eb.sym), el('span.pr.tnum', eb.price)),
      el('div.el-key',
        el('span', el('b', 'Top left'), ' · its place on the menu'), el('span', el('b', 'Top right'), ' · time on the job'),
        el('span', el('b', 'Centre'), ' · the element'), el('span', el('b', 'Bottom'), ' · price, standard-size vehicle')));
    container.replaceChildren(
      el('div.section-head', el('p.eyebrow', 'The menu'), el('h2.display', { id: 'tableTitle' }, 'The Alchemist’s Table'),
        el('p', 'Every service is an element. Pick one to see what goes into it.'), el('span.rule', { 'data-reveal': '' })),
      el('div.el-table', el('div.el-main', el('div.el-scroll', grid), legend), panel),
      el('p.el-note', 'Prices are for standard-size vehicles. Mobile service adds 2.5% to basic services and add-ons, and 7% to deluxe services and bundles.'));
  }

  // ---------------------------------------------------------------- the Ritual
  const STEPS = [
    { n: '01', title: 'Snow foam', text: 'A snow-foam pre-wash covers the car first. Deluxe adds Green Star pre-treatment where appropriate.', chips: ['Snow foam', 'Green Star · Deluxe'], media: () => texture('foam', 1200, 900), pos: '30% 50%' },
    { n: '02', title: 'Wheels', text: 'Brake Buster on the wheels and tires, then the tires are cleaned.', chips: ['Brake Buster'], media: () => photo('brake', 'Cleaned black wheel with a red brake caliper'), pos: '50% 45%' },
    { n: '03', title: 'Hand wash', text: 'A thorough hand wash with professional-grade chemicals.', chips: ['By hand'], media: () => photo('side', 'Side skirt and carbon trim after a wash'), pos: '50% 40%' },
    { n: '04', title: 'Hand dry', text: 'Dried by hand, panel by panel, exterior glass included.', chips: ['Exterior glass'], media: () => photo('front', 'Front of a white BMW M2 after an exterior detail'), pos: '40% 40%' },
    { n: '05', title: 'Seal', text: 'Koch-Chemie Hydro Foam Sealant for gloss and water beading. Or add WetGloss to any exterior.', chips: ['Hydro Foam Sealant · Deluxe', 'WetGloss · add-on'], media: () => photo('vent', 'Water beading on a carbon-fibre hood vent after a wash'), pos: '50% 40%' },
  ];
  function mountRitual(container) {
    let open = 4;
    const btns = STEPS.map((s, i) => {
      const img = s.media();
      img.style.objectPosition = s.pos;
      return el('button.rit', { type: 'button', 'aria-expanded': 'false', onclick: () => show(i, false) },
        img, el('span.shade', { 'aria-hidden': 'true' }), el('span.n', { 'aria-hidden': 'true' }, s.n), el('span.tag', { 'aria-hidden': 'true' }, s.title),
        el('span.body', el('b', s.title), el('span.txt', s.text), el('span.chips-row', s.chips.map((c) => el('span.chip', c)))));
    });
    function show(i, focus) {
      open = i;
      btns.forEach((b, k) => b.setAttribute('aria-expanded', k === i ? 'true' : 'false'));
      if (focus) btns[i].focus({ preventScroll: true });
    }
    show(open, false);
    const row = el('div.rit-row', { role: 'group', 'aria-label': 'The five steps' }, btns);
    row.addEventListener('keydown', (e) => {
      if (!e.target.closest('.rit')) return;
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      let next;
      if (d) next = Math.min(btns.length - 1, Math.max(0, open + d));
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = btns.length - 1;
      else return;
      e.preventDefault();
      show(next, true);
    });
    container.replaceChildren(
      el('div.show-head', el('div', el('p.eyebrow', 'How an exterior is done'), el('h2.display', { id: 'ritualTitle' }, 'The Ritual')),
        el('p', 'The order every exterior detail follows. Deluxe adds the seal. Tap a step to open it.')),
      el('div.rit-scroll', row));
  }

  // ---------------------------------------------------------------- the Bead Test
  const WG_PRICES = [['Car, coupe or sedan', '$44.99'], ['Crossover, SUV or minivan', '$54.99'], ['Truck or large SUV', '$64.99']];
  function mountBead(container) {
    const root = document.documentElement;
    const gl = !root.classList.contains('no-webgl') && window.AlchemistHero && typeof window.AlchemistHero.art === 'function';
    const spray = hoverable && !reduce && window.CSS && (CSS.supports('mask-image', 'radial-gradient(#000, #000)') || CSS.supports('-webkit-mask-image', 'radial-gradient(#000, #000)'));
    // data-studio="0": the stills are black paint in both themes, so the renderer draws black paint over them
    const art = (scene) => (gl ? el('canvas.bead-art', { 'data-art': scene, 'data-t': '10.25', 'data-k': '.5', 'data-studio': '0', width: 700, height: 500, 'aria-hidden': 'true' }) : null);
    const bare = el('div.bead-pane.bare', texture('water-film', 1400, 900), art('film'), el('span.scrim', { 'aria-hidden': 'true' }),
      el('span.bead-pill', 'Bare paint'), el('span.bead-cap', 'Water lies flat in a film'));
    const gloss = el('div.bead-pane.gloss', texture('water-beads', 1400, 900), art('beads'), el('span.scrim', { 'aria-hidden': 'true' }),
      el('span.bead-pill', 'WetGloss'), el('span.bead-cap', 'Water beads up and rolls off'));
    if (spray) armSpray(gloss);
    container.replaceChildren(
      el('div.show-head', el('div', el('p.eyebrow', 'Protection'), el('h2.display', { id: 'beadTitle' }, 'The Bead Test')),
        el('p', (spray ? 'Press and drag across the panel. ' : '') + 'On bare paint the water lies flat. WetGloss pulls it into beads that roll off.')),
      el('div.bead-cmp', bare, gloss, el('span.bead-seam', { 'aria-hidden': 'true' }), el('span.bead-badge', { 'aria-hidden': 'true' }, '✦')),
      el('div.bead-foot',
        el('div.wg', el('b', 'WetGloss'), el('p', 'Spray-on sealant, added after a wash with any exterior service. Lasts several weeks.')),
        el('div.bead-prices', WG_PRICES.map(([v, p]) => el('span.bead-price', v + ' ', el('b.tnum', p)))),
        el('a.btn.btn-gold.shine', { href: '#book' }, 'Add WetGloss ', arrow())));
  }
  // Press and drag to spray (desktop only): a film of water comes back under the pointer and the
  // beads show through a growing hole in it; on release the whole panel clears to beads again.
  function armSpray(pane) {
    const film = el('img.bead-film', { src: 'img/art/water-film.webp', alt: '', width: 1400, height: 900, loading: 'lazy', decoding: 'async', draggable: false, 'aria-hidden': 'true' });
    const hint = el('span.bead-hint', { 'aria-hidden': 'true' }, el('i'), el('span', 'Press and drag to spray'));
    pane.insertBefore(film, pane.querySelector('.scrim'));   // under the scrim, the pill and the caption
    pane.appendChild(hint);
    pane.classList.add('can-spray');
    let down = false, len = 0, lx = 0, ly = 0, timer = 0;
    const at = (e) => { const r = pane.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const put = (x, y, r) => { film.style.setProperty('--mx', x.toFixed(0) + 'px'); film.style.setProperty('--my', y.toFixed(0) + 'px'); film.style.setProperty('--mr', r.toFixed(0) + 'px'); };
    pane.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      e.preventDefault();
      down = true; len = 0; [lx, ly] = at(e);
      clearTimeout(timer);
      film.classList.remove('clearing');
      film.classList.add('on');
      put(lx, ly, 70);
      pane.classList.add('sprayed');
      try { pane.setPointerCapture(e.pointerId); } catch (err) { /* capture unavailable */ }
    });
    pane.addEventListener('pointermove', (e) => {
      if (!down) return;
      const [x, y] = at(e);
      len += Math.hypot(x - lx, y - ly); lx = x; ly = y;
      put(x, y, Math.min(900, 70 + len * 0.9));
    });
    const up = () => {
      if (!down) return;
      down = false;
      film.classList.add('clearing');
      film.style.setProperty('--mr', '1600px');
      timer = setTimeout(() => film.classList.remove('on', 'clearing'), 1400);
    };
    pane.addEventListener('pointerup', up);
    pane.addEventListener('pointercancel', up);
  }

  window.AlchemistServices = { mountTable, mountRitual, mountBead };
})();
