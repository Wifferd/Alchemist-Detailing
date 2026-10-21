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
  const stacked = window.matchMedia('(max-width: 980px)');   // the Table's panel sits under the grid
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- the elements (the menu, Oct 10, 2026)
  // WetGloss is priced by vehicle type: three prices for the types the database prices (the Bead Test's chips)
  const WG = [
    { label: 'Car, coupe or sedan', lower: 'car, coupe or sedan', types: ['sedan', 'coupe'], price: '$44.99' },
    { label: 'Crossover, SUV or minivan', lower: 'crossover, SUV or minivan', types: ['crossover', 'suv', 'minivan'], price: '$54.99' },
    { label: 'Truck or large SUV', lower: 'truck or large SUV', types: ['truck', 'large_suv'], price: '$64.99' },
  ];
  function wgDesc() {
    return 'Spray-on sealant for gloss and water beading, added after a wash with an exterior service. Lasts several weeks. ' +
      WG.map((g) => g.price + ' ' + g.lower).join('; ') + '. Van, convertible or other: priced by us before your appointment.';
  }
  // code: the service in the database; the key is also the booking's route token (#book-ed opens it chosen).
  // A bundle's lead is the start of its description; the saving after it comes from the prices (fromMenu).
  const ELEMENTS = [
    { key: 'eb', code: 'ext_basic', sym: 'Eb', num: '1', name: 'Exterior Basic', short: 'Exterior Basic', price: '$49.99', time: '60 min', mobile: '+2.5%', eq: '',
      desc: 'Snow-foam pre-wash, Brake Buster on wheels and tires, exterior glass, then a thorough hand wash and hand dry.' },
    { key: 'ib', code: 'int_basic', sym: 'Ib', num: '3', name: 'Interior Basic', short: 'Interior Basic', price: '$59.99', time: '60 min', mobile: '+2.5%', eq: '',
      desc: 'Full vacuum, dash and plastics with Top Star, Gummifix on rubber and mats, interior glass and a general wipe-down.' },
    { key: 'sc', code: 'signature_combo', sym: 'Sc', num: '5', name: 'Signature Combo', short: 'Signature Combo', price: '$99.99', time: '2 h', mobile: '+7%', eq: 'Eb + Ib → Sc',
      lead: 'Exterior Basic and Interior Basic together',
      desc: 'Exterior Basic and Interior Basic together: $109.98 booked separately, so you save $9.99 before any mobile charge.' },
    { key: 'wg', code: 'perfect_finish_sealant', sym: 'Wg', num: '7', name: 'WetGloss', short: 'WetGloss', price: 'from $44.99', time: '+30 min', mobile: '+2.5%', eq: '', addon: true,
      desc: wgDesc() },
    { key: 'ed', code: 'ext_deluxe', sym: 'Ed', num: '2', name: 'Exterior Deluxe', short: 'Exterior Deluxe', price: '$94.99', time: '90 min', mobile: '+7%', eq: '',
      desc: 'Everything in Exterior Basic, plus Green Star pre-treatment where appropriate and Koch-Chemie Hydro Foam Sealant for gloss and water beading.' },
    { key: 'id', code: 'int_deluxe', sym: 'Id', num: '4', name: 'Interior Deluxe', short: 'Interior Deluxe', price: '$134.99', time: '2 h', mobile: '+7%', eq: '',
      desc: 'Everything in Interior Basic, plus deep steam or shampoo, drill-brush agitation, deeper stain removal and Leather Star conditioning. Steam cleaning included.' },
    { key: 'au', code: 'full_detail', sym: 'Au', num: '79', name: 'Full Detail Bundle', short: 'Full Detail', price: '$209.99', time: '3½ h', mobile: '+7%', eq: 'Ed + Id → Au',
      lead: 'Exterior Deluxe and Interior Deluxe together, steam cleaning included',
      desc: 'Exterior Deluxe and Interior Deluxe together, steam cleaning included: $229.98 booked separately, so you save $19.99 before any mobile charge.' },
    { key: 'st', code: 'steam_cleaning', sym: 'St', num: '8', name: 'Steam Cleaning', short: 'Steam Cleaning', price: '$49.99', time: '+30 min', mobile: '+2.5%', eq: '', addon: true,
      desc: 'Deep steam for carpets, upholstery and interior surfaces. Already included in Interior Deluxe and the Full Detail Bundle.' },
  ];
  const BY = Object.fromEntries(ELEMENTS.map((e) => [e.key, e]));
  // what the booking takes from the Table: the symbol, the number and the token of each service, never its prices
  const SIGNS = ELEMENTS.map((e) => ({ key: e.key, code: e.code, sym: e.sym, num: e.num }));
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
  let table = null;   // the mounted Table: refresh() writes the elements' figures again (fromMenu)
  const same = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  function mountTable(container) {
    let picked = 'au';
    const tiles = new Map();
    const list = [];
    ELEMENTS.forEach((e) => {
      const au = e.key === 'au';
      const t = el('button.el-tile', {
        type: 'button', class: (e.addon ? 'addon' : '') + (au ? ' au' : ''), 'aria-pressed': 'false', tabindex: -1,
        dataset: { key: e.key }, style: { gridArea: e.key }, onclick: (ev) => pick(e.key, false, ev.detail > 0),
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
    const pBook = el('a.btn.btn-gold.shine', { href: '#book' }, pLabel, arrow());   // opens the booking with the picked element chosen
    // under the grid (phones, tablets), a text action takes the visitor back up to the tile they tapped
    const back = el('button.el-back', { type: 'button', onclick: () => {
      const t = tiles.get(picked);
      t.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      t.focus({ preventScroll: true });
    } }, 'Back to the table ', el('span.arrow', { 'aria-hidden': 'true' }, '↑'));
    const panel = el('aside.el-panel', { 'aria-label': 'The picked element' },
      el('div.top', el('span.eyebrow', 'Element'), pNo), pSym, pName, pEq, pDesc,
      el('div.el-facts', el('div', el('span', 'Price'), pPrice), el('div', el('span', 'Time'), pTime), el('div', el('span', 'Mobile'), pMobile)),
      el('div.el-actions', pBook, back));
    function pick(key, focus, tapped) {
      const e = BY[key];
      if (!e) return;
      const changed = key !== picked;
      picked = key;
      tiles.forEach((t, k) => { const on = k === key; t.setAttribute('aria-pressed', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      same(pNo, 'No. ' + e.num); same(pSym, e.sym); same(pName, e.name);
      same(pEq, e.eq); pEq.hidden = !e.eq; same(pDesc, e.desc);
      same(pPrice, e.price); same(pTime, e.time); same(pMobile, e.mobile);
      pLabel.data = 'Book ' + e.short + ' ';
      pBook.setAttribute('href', '#book-' + e.key);
      if (changed && !reduce) { panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap'); }
      if (focus) tiles.get(key).focus({ preventScroll: true });
      // a tap with the panel under the grid: the panel comes up from below, so the change is seen (keyboard picks
      // keep their place; their focus is on the tile)
      if (tapped && stacked.matches && panel.getBoundingClientRect().bottom > window.innerHeight) panel.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    pick(picked, false);

    // the legend reads the first element (the design's mini tile), and the mobile note is the menu's own sentence
    const eb = ELEMENTS[0];
    const miniTime = el('span', eb.time.replace(' min', '')), miniPrice = el('span.pr.tnum', eb.price);
    const legend = el('div.el-legend',
      el('div.el-mini', { 'aria-hidden': 'true' }, el('span.meta.tnum', el('span', eb.num), miniTime), el('span.sym', eb.sym), miniPrice),
      el('div.el-key',
        el('span', el('b', 'Top left'), ' · its place on the menu'), el('span', el('b', 'Top right'), ' · time on the job'),
        el('span', el('b', 'Centre'), ' · the element'), el('span', el('b', 'Bottom'), ' · price, standard-size vehicle')));
    container.replaceChildren(
      el('div.section-head', el('p.eyebrow', 'At a glance'), el('h2.display', { id: 'tableTitle' }, 'The Alchemist’s Table'),
        el('p', 'Every service is an element. Pick one to see what goes into it.'), el('span.rule', { 'data-reveal': '' })),
      el('div.el-table', el('div.el-main', el('div.el-scroll', grid), legend), panel),
      el('p.el-note', 'Prices are for standard-size vehicles. Mobile service adds 2.5% to basic services and add-ons, and 7% to deluxe services and bundles.'));
    table = {
      refresh() {
        ELEMENTS.forEach((e) => { const t = tiles.get(e.key); put(t.querySelector('.meta span:last-child'), e.time); put(t.querySelector('.nm .tnum'), e.price); });
        put(miniTime, eb.time.replace(' min', '')); put(miniPrice, eb.price);
        pick(picked, false);   // the panel as it stands, with the new figures
      },
    };
  }

  // ---------------------------------------------------------------- the Ritual
  const STEPS = [
    { n: '01', title: 'Snow foam', text: 'A snow-foam pre-wash covers the car first. Deluxe adds Green Star pre-treatment where appropriate.', chips: ['Snow foam', 'Green Star · Deluxe'], media: () => texture('foam', 1200, 900), pos: '30% 50%' },
    { n: '02', title: 'Wheels', text: 'Brake Buster on the wheels and tires, then the tires are cleaned.', chips: ['Brake Buster'], media: () => photo('wheel', 'Rear wheel and arch after cleaning'), pos: '45% 62%' },
    { n: '03', title: 'Hand wash', text: 'A thorough hand wash with professional-grade chemicals.', chips: ['By hand'], media: () => photo('badge', 'M2 badge on wet white paint'), pos: '50% 50%' },
    { n: '04', title: 'Hand dry', text: 'Dried by hand, panel by panel, exterior glass included.', chips: ['Exterior glass'], media: () => photo('front', 'Front of a white BMW M2 after an exterior detail'), pos: '40% 40%' },
    { n: '05', title: 'Seal', text: 'Koch-Chemie Hydro Foam Sealant for gloss and water beading. Or add WetGloss to any exterior.', chips: ['Hydro Foam Sealant · Deluxe', 'WetGloss · add-on'], media: () => photo('mirror', 'Water beading on a side mirror'), pos: '58% 38%' },
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
  let bead = null;   // the mounted Bead Test: refresh() writes WetGloss's prices again (fromMenu)
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
    const prices = WG.map((g) => el('b.tnum', g.price));
    bead = { refresh() { WG.forEach((g, i) => put(prices[i], g.price)); } };
    container.replaceChildren(
      el('div.show-head', el('div', el('p.eyebrow', 'Protection'), el('h2.display', { id: 'beadTitle' }, 'The Bead Test')),
        el('p', (spray ? 'Press and drag across the panel. ' : '') + 'On bare paint the water lies flat. WetGloss pulls it into beads that roll off.')),
      el('div.bead-cmp', bare, gloss, el('span.bead-seam', { 'aria-hidden': 'true' }), el('span.bead-badge', { 'aria-hidden': 'true' }, '✦')),
      el('div.bead-foot',
        el('div.wg', el('b', 'WetGloss'), el('p', 'Spray-on sealant, added after a wash with any exterior service. Lasts several weeks, depending on weather and washing.')),
        // the database has no WetGloss price for these types: the quote holds the price (the FAQ's words)
        el('div.bead-prices', el('div.bead-chips', WG.map((g, i) => el('span.bead-price', g.label + ' ', prices[i]))),
          el('p.bead-ask', 'Van, convertible or other: priced by us before your appointment')),
        el('a.btn.btn-gold.shine', { href: '#book-wg' }, 'Add WetGloss ', arrow())));
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

  // ---------------------------------------------------------------- the menu's figures, from the database
  // The prices, times and mobile charges on the services page and the home cards name their service (data-price,
  // data-time, data-mobile, data-saving); the Table and the Bead Test keep theirs in ELEMENTS and WG. Once the menu has
  // loaded, all of them are written from it, so a price the owner changes in the database shows everywhere at once;
  // until then, and should it never load, the page shows the menu as seeded (the same figures). Every figure already
  // has its place, so nothing moves; one that does change fades in.
  // Still typed by hand (change them too when a price, a fee or a mobile charge changes in the database): the LD+JSON
  // priceRange in index.html; the mobile sentence under the home cards, in the Mobile note and in the Table's note
  // (below); the condition fees in the Interior condition note and the FAQ (content.js, with its mobile answer); and
  // the Steam add-on's "Already included in Interior Deluxe and the Full Detail Bundle".
  const money = window.AlchemistUI.money;
  function timeText(min, addon) {
    if (min == null) return null;
    const h = Math.floor(min / 60), r = min % 60;
    return (addon ? '+' : '') + (min < 120 ? min + ' min' : h + (r === 30 ? '½' : '') + ' h' + (r && r !== 30 ? ' ' + r + ' min' : ''));
  }
  // '90 min', '2 h', '3½ h' back to minutes (the step-up's time, from the cards as they stand)
  function minutesOf(text) {
    const m = /^\+?(\d+)(½)?\s*(h|min)(?:\s*(\d+)\s*min)?$/.exec(String(text || '').trim());
    return !m ? null : m[3] === 'min' ? +m[1] : +m[1] * 60 + (m[2] ? 30 : 0) + (+m[4] || 0);
  }
  const svcOf = (m, code) => m.services.find((s) => s.code === code) || null;
  // a service's price: its own, or (priced by vehicle type, as WetGloss is) the lowest of its type prices
  function priceOf(m, code) {
    const s = svcOf(m, code);
    if (!s) return null;
    if (s.base_price_cents != null) return s.base_price_cents;
    const t = Object.values(m.typePrices[code] || {});
    return t.length ? Math.min(...t) : null;
  }
  // what a service includes (service_includes); a bundle also includes what its parts include, as quote_booking
  // works it out (the database keeps steam with Interior Deluxe, not with the Full Detail Bundle itself)
  function includedBy(m, code) {
    const out = new Set();
    [code].concat(m.bundleParts[code] || []).forEach((c) => (m.includes[c] || []).forEach((i) => out.add(i)));
    return out;
  }
  // a bundle against its parts booked one by one: { sum, save }, or null when it saves nothing
  function savingOf(m, code) {
    const parts = m.bundleParts[code], s = svcOf(m, code);
    if (!parts || !parts.length || !s || s.base_price_cents == null) return null;
    const sum = parts.reduce((t, c) => t + (priceOf(m, c) || 0), 0);
    return sum > s.base_price_cents ? { sum, save: sum - s.base_price_cents } : null;
  }
  function fade(node) { if (!reduce && node.animate) node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' }); }
  function put(node, text) {
    if (!node || text == null || node.textContent === text) return;
    node.textContent = text;
    fade(node);
  }
  function putSaving(p, sv) {
    p.hidden = !sv;
    if (!sv || p.textContent === money(sv.sum) + ' booked separately. You save ' + money(sv.save) + ', before any mobile charge.') return;
    p.replaceChildren(money(sv.sum) + ' booked separately. You save ', el('b.tnum', money(sv.save)), ', before any mobile charge.');
    fade(p);
  }
  // the Table's elements and WetGloss's chips, from the menu
  function fromMenu(m) {
    ELEMENTS.forEach((e) => {
      const s = svcOf(m, e.code), p = priceOf(m, e.code);
      if (!s) return;
      if (p != null) e.price = (s.base_price_cents == null ? 'from ' : '') + money(p);
      if (s.duration_min != null) e.time = timeText(s.duration_min, e.addon);
      if (s.mobile_pct != null) e.mobile = '+' + Number(s.mobile_pct) + '%';
      if (e.lead) { const sv = savingOf(m, e.code); e.desc = e.lead + (sv ? ': ' + money(sv.sum) + ' booked separately, so you save ' + money(sv.save) + ' before any mobile charge.' : '.'); }
    });
    const tp = m.typePrices.perfect_finish_sealant || {};
    WG.forEach((g) => {
      const v = g.types.map((t) => tp[t]).filter((x) => x != null);
      if (v.length) g.price = (v.length === g.types.length && v.every((x) => x === v[0]) ? '' : 'from ') + money(Math.min(...v));
    });
    BY.wg.desc = wgDesc();
    if (table) table.refresh();
    if (bead) bead.refresh();
  }
  let menuP = null;
  function loadMenu() {
    const D = window.AlchemistData;
    if (!D) return Promise.reject(new Error('no data layer'));
    if (!menuP) menuP = D.init().then(() => D.menu()).catch((e) => { menuP = null; throw e; });
    return menuP;
  }
  function syncMenu() {
    return loadMenu().then((m) => {
      const all = (sel) => document.querySelectorAll(sel);
      all('[data-price]').forEach((n) => {
        const v = n.dataset.price.split(' ').map((c) => priceOf(m, c)).filter((x) => x != null);
        if (v.length) put(n, money(Math.min(...v)));
      });
      all('[data-time]').forEach((n) => { const s = svcOf(m, n.dataset.time); if (s) put(n, timeText(s.duration_min, s.kind === 'addon')); });
      all('[data-mobile]').forEach((n) => { const s = svcOf(m, n.dataset.mobile); if (s && s.mobile_pct != null) put(n, '+' + Number(s.mobile_pct) + '%'); });
      all('[data-saving]').forEach((p) => putSaving(p, savingOf(m, p.dataset.saving)));
      // a line naming what a service includes shows while the menu still includes every one of them
      all('[data-includes]').forEach((li) => {
        const has = includedBy(m, li.dataset.service);
        li.hidden = !li.dataset.includes.split(' ').every((c) => has.has(c));
      });
      fromMenu(m);
      if (lineup) syncLineup(m);
    }).catch(() => { /* the menu couldn't load: the page keeps the menu as seeded */ });
  }

  // ---------------------------------------------------------------- the bundle lineup: what stepping up adds
  // Built when the page first opens, from the two bundle cards as they stand (their parts' links and the part cards'
  // own lines), so it is there before the menu answers; the menu then confirms the parts and what each includes.
  let lineup = null, stepKey = '';
  const folds = window.matchMedia('(max-width: 720px)');   // a phone: each part's lines fold away under its name
  const opened = new Set();   // the parts opened there (kept when the step-up is built again)
  const cardOf = (code) => document.querySelector('.price-card[data-code="' + code + '"]');
  const nameOf = (card) => { const h = card && card.querySelector('h3'); return h ? h.textContent.trim() : ''; };
  const partsOf = (card) => Array.from(card.querySelectorAll('[data-part]'), (a) => a.dataset.part);
  const codesShown = (card) => new Set(Array.from(card.querySelectorAll('[data-includes]:not([hidden])')).flatMap((li) => li.dataset.includes.split(' ')));
  function mountLineup(box) {
    const panel = box && box.querySelector('.step-up'), cards = box ? box.querySelectorAll('.price-card[data-code]') : [];
    if (!panel || cards.length !== 2) return;
    lineup = { box, panel, lo: cards[0], hi: cards[1], m: null };
    buildStep(null);
    const refold = () => buildStep(lineup.m);
    if (folds.addEventListener) folds.addEventListener('change', refold); else if (folds.addListener) folds.addListener(refold);
  }
  // A part: its name ("in place of" the smaller bundle's), then its lines. On a phone the name is a button that opens
  // and folds them (the lineup stays short there); wider, the lines are always shown.
  function stepPart(p) {
    const list = el('ul.su-list', { id: 'su-' + p.code }, p.lines.map((t) => el('li', t)));
    const name = [p.name, el('small', 'in place of ' + p.instead)];
    if (!folds.matches) return el('div.su-part', el('h4', name), list);
    const open = opened.has(p.code);
    const btn = el('button.su-fold', { type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': list.id }, el('span', name));
    const part = el('div.su-part.folds', el('h4', btn), list);
    const show = (on) => { btn.setAttribute('aria-expanded', on ? 'true' : 'false'); list.hidden = !on; part.classList.toggle('open', on); };
    show(open);
    btn.addEventListener('click', () => { const on = !opened.has(p.code); if (on) opened.add(p.code); else opened.delete(p.code); show(on); });
    return part;
  }
  // For each part of the bigger bundle that is the Deluxe of the smaller one's part (its card opens "Everything in"
  // that part), the Deluxe card's own lines after that one; then what the bigger bundle includes that the smaller
  // doesn't (its lines naming them, as shown); then the extra time. Bundles that can't be compared that way: no step-up.
  function buildStep(m) {
    const { box, panel, lo, hi } = lineup;
    const loParts = partsOf(lo), parts = [];
    let ok = true;
    partsOf(hi).forEach((code) => {
      if (loParts.includes(code)) return;   // the same part in both
      const card = cardOf(code), base = card && card.querySelector('.checks [data-base]');
      if (!base || !loParts.includes(base.dataset.base)) { ok = false; return; }
      const lines = Array.from(card.querySelectorAll('.checks li'), (li) => (li.hasAttribute('data-base') || li.hasAttribute('data-includes') ? '' : li.textContent.trim())).filter(Boolean);
      parts.push({ code, name: nameOf(card), instead: nameOf(cardOf(base.dataset.base)), lines });
    });
    const loHas = m ? includedBy(m, lo.dataset.code) : codesShown(lo);
    const adds = Array.from(hi.querySelectorAll('[data-includes]:not([hidden])'))
      .filter((li) => !li.dataset.includes.split(' ').every((c) => loHas.has(c)))
      .map((li) => li.textContent.trim().replace(/\s+included$/i, ''));
    const tLo = lo.querySelector('[data-time]'), tHi = hi.querySelector('[data-time]');
    const mLo = tLo && minutesOf(tLo.textContent), mHi = tHi && minutesOf(tHi.textContent);
    const time = mLo && mHi && mHi > mLo ? { plus: timeText(mHi - mLo, true), from: tLo.textContent, to: tHi.textContent } : null;
    const key = JSON.stringify([ok, parts, adds, time, folds.matches]);
    if (key === stepKey) return;
    stepKey = key;
    if (!ok || (!parts.length && !adds.length)) { panel.hidden = true; box.classList.remove('has-step'); return; }
    const short = (ELEMENTS.find((e) => e.code === hi.dataset.code) || {}).short || nameOf(hi);
    panel.setAttribute('aria-labelledby', 'stepTitle');
    panel.replaceChildren(...[
      el('h3.eyebrow', { id: 'stepTitle' }, 'What you add with ' + short),
      ...parts.map(stepPart),
      adds.length ? el('div.su-part', el('h4', 'Included'), el('ul.su-list', adds.map((t) => el('li', t)))) : null,
      time ? el('p.su-time', el('span', 'Time'), el('b.tnum', time.plus), el('small.tnum', time.from + ' → ' + time.to)) : null,
    ].filter(Boolean));
    panel.hidden = false;
    box.classList.add('has-step');
  }
  // the database's bundle parts: a card naming other parts follows the database, then the step-up is worked out again
  function syncLineup(m) {
    lineup.m = m;
    [lineup.lo, lineup.hi].forEach((card) => {
      const want = m.bundleParts[card.dataset.code], have = partsOf(card), list = card.querySelector('.checks.parts');
      if (!want || !want.length || !list || (want.length === have.length && want.every((c) => have.includes(c)))) return;
      list.querySelectorAll('li:not([data-includes])').forEach((li) => li.remove());
      const first = list.firstChild;
      want.forEach((code) => { const s = svcOf(m, code); if (s) list.insertBefore(el('li', el('a', { href: '#services-' + s.kind, dataset: { part: code } }, s.name)), first); });
    });
    buildStep(m);
  }

  window.AlchemistServices = { mountTable, mountRitual, mountBead, mountLineup, syncMenu, signs: SIGNS };
})();
