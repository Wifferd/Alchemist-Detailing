/* Alchemist Detailing — the Services page showroom (the owner's own designs,
   doc 32): the Alchemist's Table (the menu as a periodic table of elements),
   the Ritual (how an exterior is done, five opening panels) and the Bead Test
   (bare paint beside the Full Detail's sealant foam since Nov 17; WetGloss is retired). app.js mounts the three once, when the
   services page first opens. Every price, time and description below is the
   menu as it stands on the page; nothing here invents a fact. */
(function () {
  'use strict';
  const { el } = window.AlchemistUI;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hoverable = window.matchMedia('(hover: hover)').matches;
  const stacked = window.matchMedia('(max-width: 980px)');   // the Table's panel sits under the grid
  const SVG = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- the elements (the menu of Migration 011, Nov 17, 2026;
  // the prices of Migration 012, Nov 18)
  // code: the service in the database; the key is also the booking's route token (#book-bw opens it chosen). Price and
  // time are the database's for the size picked on the page (the size switch); what is written here is the menu as
  // seeded, for a car, shown until the database answers. A bundle's lead is the start of its description; the saving
  // after it comes from the prices (fromMenu).
  const ELEMENTS = [
    { key: 'bw', code: 'basic_wash', sym: 'Bw', num: '1', name: 'Basic Wash', tile: 'Basic Wash', short: 'Basic Wash', price: '$59.99', time: '1 h 32 min', eq: '',
      desc: 'Thick foam to loosen the dirt, then a careful two-bucket hand wash. Rinsed and hand-dried; wheels and tires rinsed with the car. For cars with normal road dirt.' },
    { key: 'hw', code: 'hand_wash', sym: 'Hw', num: '2', name: 'Hand Wash', tile: 'Hand Wash', short: 'Hand Wash', price: '$89.99', time: '1 h 31 min', eq: '',
      desc: 'Thick foam, a careful two-bucket hand wash, wheels and tires cleaned, tire shine. Rinsed, hand-dried and blown out. Outside glass.' },
    { key: 'io', code: 'inside_out', sym: 'Io', num: '3', name: 'Inside & Out', tile: 'Inside & Out', short: 'Inside & Out', price: '$114.99', time: '2 h 43 min', eq: 'Hw + Ic → Io',
      lead: 'Everything in the Hand Wash, plus the inside of the Interior Clean' },
    { key: 'au', code: 'full_detail_v2', sym: 'Au', num: '79', name: 'Full Detail', tile: 'Full Detail', short: 'Full Detail', price: '$179.99', time: '5 h 15 min', eq: 'Hw + Id → Au',
      lead: 'Everything in Inside & Out, plus a pre-soak, wheel wells, a water-repellent sealant foam, seats and carpets shampooed and extracted, and steam' },
    { key: 'ic', code: 'interior_clean', sym: 'Ic', num: '4', name: 'Interior Clean', tile: 'Interior Clean', short: 'Interior Clean', price: '$75', time: '1 h 43 min', eq: '',
      desc: 'The inside of Inside & Out, no wash: vacuumed, wiped, mats scrubbed and left dry, inside windows, a protectant on the dash and trim.' },
    { key: 'idt', code: 'interior_detail', sym: 'Id', num: '5', name: 'Interior Detail', tile: 'Interior Detail', short: 'Interior Detail', price: '$125', time: '3 h 49 min', eq: '',
      desc: 'The inside of the Full Detail, no wash: seats and carpets shampooed and extracted, leather cleaned and conditioned, steam, door seals dressed.' },
    { key: 'wt', code: 'wheels_tire_shine', sym: 'Wt', num: '6', name: 'Wheels & Tire Shine', tile: 'Wheels & Tires', short: 'Wheels & Tire Shine', price: '$20', time: '+19 min', eq: '', addon: true,
      desc: 'Wheels and tires scrubbed, then tire shine. Goes with the Basic Wash (the Hand Wash already has it).' },
    { key: 'gw', code: 'gloss_wax', sym: 'Gw', num: '7', name: 'Gloss wax foam', tile: 'Gloss wax', short: 'Gloss wax foam', price: '$20', time: '+10 min', eq: '', addon: true,
      desc: 'A gloss wax foam after the wash, for shine and water beading. With the Basic Wash, Hand Wash or Inside & Out.' },
    { key: 'en', code: 'engine_bay', sym: 'En', num: '8', name: 'Engine bay clean', tile: 'Engine bay', short: 'Engine bay clean', price: '$50', time: '+25 min', eq: '', addon: true,
      desc: 'The engine bay cleaned. With any service.' },
    { key: 'pf', code: 'film_care', sym: 'Pf', num: '9', name: 'Clear film (PPF) care', tile: 'Film care', short: 'Clear film care', price: '$15', time: '+12 min', eq: '', addon: true,
      desc: 'Every wash is already safe for clear film. This adds a hand clean of the film’s edges and any spots on it, with a cleaner made for film.' },
    { key: 'lc', code: 'leather_care', sym: 'Lc', num: '10', name: 'Leather care', tile: 'Leather care', short: 'Leather care', price: '$35', time: '+25 min', eq: '', addon: true,
      desc: 'Leather seats cleaned and conditioned. With Inside & Out or the Interior Clean; already in the Full Detail and the Interior Detail.' },
    { key: 'sr', code: 'stain_removal', sym: 'Sr', num: '11', name: 'Stain and spill removal', tile: 'Stains', short: 'Stain removal', price: '$40', time: '+33 min', eq: '', addon: true,
      desc: 'Set-in stains and spills treated one by one, up to 5 spots. More than 5? We tell you the price first.' },
  ];
  const BY = Object.fromEntries(ELEMENTS.map((e) => [e.key, e]));
  // what the booking takes from the Table: the symbol, the number and the token of each service, never its prices.
  // The retired menu's marks stay for older bookings (the account's Appointments), with no token: an old link (#book-ed)
  // opens the Services page instead (app.js)
  const LEGACY = [['eb', 'ext_basic', 'Eb', '1'], ['ed', 'ext_deluxe', 'Ed', '2'], ['ib', 'int_basic', 'Ib', '3'], ['id', 'int_deluxe', 'Id', '4'],
    ['sc', 'signature_combo', 'Sc', '5'], ['wg', 'perfect_finish_sealant', 'Wg', '7'], ['st', 'steam_cleaning', 'St', '8'], ['au', 'full_detail', 'Au', '79']];
  const SIGNS = ELEMENTS.map((e) => ({ key: e.key, code: e.code, sym: e.sym, num: e.num }))
    .concat(LEGACY.map(([key, code, sym, num]) => ({ key: null, legacy: key, code, sym, num })));
  const OLD_TOKENS = LEGACY.map((l) => l[0]).filter((k) => !BY[k]);
  // column heads: the group, its element, and a small mark (the add-ons take two columns)
  const COLS = [
    { area: 'c1', name: 'Washes', elem: 'Water', icon: ['M4 6h16L12 20z'] },
    { area: 'c2', name: 'Inside & out', elem: 'Gold', icon: ['circle', 'M11 12h2'] },
    { area: 'c3', name: 'Inside only', elem: 'Air', icon: ['M12 4l8 14H4z', 'M7.4 13h9.2'] },
    { area: 'c4', name: 'Add-ons', elem: 'Salt', icon: ['circle', 'M4 12h16'] },
  ];
  // row heads: the step up within each group; the second pair repeats them on a phone (hidden there since Nov 17)
  const ROWS = [['r1', 'I', 'Start'], ['r2', 'II', 'Step up'], ['r1b', 'I', 'Start', true], ['r2b', 'II', 'Step up', true]];

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
  // what a tile is called aloud: the service first, then its price and time (its number and symbol are its look)
  const tileName = (e) => e.name + ', ' + e.price + ', ' + e.time;
  function mountTable(container) {
    let picked = 'au';
    const tiles = new Map();
    const list = [];
    ELEMENTS.forEach((e) => {
      const au = e.key === 'au';
      const t = el('button.el-tile', {
        type: 'button', class: (e.addon ? 'addon' : '') + (au ? ' au' : ''), 'aria-pressed': 'false', 'aria-label': tileName(e), tabindex: -1,
        dataset: { key: e.key }, style: { gridArea: e.key }, onclick: (ev) => pick(e.key, false, ev.detail > 0),
      },
        el('span.meta.tnum', { 'aria-hidden': 'true' }, el('span', e.num), el('span', tileTime(e))),
        el('span.sym', { class: au ? null : 'gold-text', 'aria-hidden': 'true' }, e.sym),
        el('span.nm', el('b', e.tile || e.name), el('span.tnum', e.price)));
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
    const pEq = el('div.el-eq'), pDesc = el('p'), pPrice = el('b.price.tnum'), pTime = el('b.tnum'), pMobile = el('b');
    const pLabel = document.createTextNode('');
    const pBook = el('a.btn.btn-gold.shine', { href: '#book' }, pLabel, arrow());   // opens the booking with the picked element chosen
    // under the grid (phones, tablets), a text action takes the visitor back up to the tile they tapped
    const back = el('button.el-back', { type: 'button', onclick: () => {
      const t = tiles.get(picked);
      t.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      t.focus({ preventScroll: true });
    } }, 'Back to the table ', el('span.arrow.up', { 'aria-hidden': 'true' }, '↑'));   // (Archivo draws ↑: .up keeps the glyph)
    const panel = el('section.el-panel', { 'aria-label': 'The picked element' },   // (a region in the page: an aside inside main would be a stray landmark)
      el('div.top', el('span.eyebrow', 'Element'), pNo), pSym, pName, pEq, pDesc,
      el('div.el-facts', el('div', el('span', 'Price'), pPrice), el('div', el('span', 'Time'), pTime), el('div', el('span', 'Size'), pMobile)),
      el('div.el-actions', pBook, back));
    function pick(key, focus, tapped) {
      const e = BY[key];
      if (!e) return;
      const changed = key !== picked;
      picked = key;
      tiles.forEach((t, k) => { const on = k === key; t.setAttribute('aria-pressed', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      same(pNo, 'No. ' + e.num); same(pSym, e.sym); same(pName, e.name);
      same(pEq, e.eq); pEq.hidden = !e.eq; same(pDesc, e.desc);
      same(pPrice, e.price); same(pTime, e.time); same(pMobile, e.addon ? 'Every size' : sizeName());
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
    const miniTime = el('span', tileTime(eb)), miniPrice = el('span.pr.tnum', eb.price);
    const legend = el('div.el-legend',
      el('div.el-mini', { 'aria-hidden': 'true' }, el('span.meta.tnum', el('span', eb.num), miniTime), el('span.sym', eb.sym), miniPrice),
      el('div.el-key',
        el('span', el('b', 'Top left'), ' · its place on the menu'), el('span', el('b', 'Top right'), ' · time on the job'),
        el('span', el('b', 'Centre'), ' · the element'), el('span', el('b', 'Bottom'), ' · price for the size you picked')));
    const main = el('div.el-main', el('div.el-scroll', grid), legend), box = el('div.el-table', main, panel);
    container.replaceChildren(
      el('div.section-head', el('p.eyebrow', 'At a glance'), el('h2.display', { id: 'tableTitle' }, 'The Alchemist’s Table'),
        el('p', el('span.lead-s', 'Every service is an element.'), ' ', el('span.lead-s', 'Pick one to see what goes into it.')), el('span.rule', { 'data-reveal': '' })),   // (a line breaks between its sentences: CSS .lead-s)
      box,
      el('p.el-note', 'Prices and times are for the size you picked above. Add-ons cost the same for every size. We come to you or you come to us: the same price.'));
    transmute(box, main, grid, tiles, panel);
    table = {
      refresh() {
        ELEMENTS.forEach((e) => { const t = tiles.get(e.key); put(t.querySelector('.meta span:last-child'), tileTime(e)); put(t.querySelector('.nm .tnum'), e.price); if (t.getAttribute('aria-label') !== tileName(e)) t.setAttribute('aria-label', tileName(e)); });
        put(miniTime, tileTime(eb)); put(miniPrice, eb.price);
        pick(picked, false);   // the panel as it stands, with the new figures
      },
    };
  }

  // ---------------------------------------------------------------- the transmutation: Ed + Id → Au
  // The Table's one moment (the owner's §18, given to the menu's top service: the Full Detail is the Hand Wash and the
  // Interior Detail together, Hw + Id → Au, since Nov 17; it was Ed + Id → Au). The case arrives unlit (data-tm): the tiles dimmed; Au charcoal, its letters unlit
  // but legible; the panel's Au faint and a little low, its equation undrawn. The first time the grid is 35% on the
  // screen its tiles come up to full light in .5s, all but Ed and Id (.tm-lit). Then a turn of the gold light
  // (window.AlchemistLight: one at a time, the shines on the screen waiting): Ed's letters take it, then Id's 300ms
  // later, each tile coming up to full light under it (.tm-go); 1s in, a point of warm gold appears in Au, gathers, then
  // floods the tile, its letters going dark as the gold reaches them (.tm-au). On a desk, where the three share a row,
  // that is one turn of 2.6s; on a phone, where Au's row comes later, Au joins the pair's turn while it is still
  // playing, or has a turn of its own. A tile's turn comes when it is half on the screen, or a third on it after a rest
  // of 1.2s; at that rest Ed and Id, if they are only partly on the screen, are simply lit (.tm-rest). The panel's Au
  // rises into the light with the turn and its equation draws as Au floods (beside the grid), or as soon as the panel is
  // on the screen (under it, on a phone); its own Book Now shine waits meanwhile (CSS). Au's figure is the database's:
  // its gold waits for the menu's answer (600ms at most), and without one Au is simply gold, once Ed and Id have taken
  // their light (so it still reads Ed + Id → Au). Au is never left unlit:
  // 2.5s after a fifth of it first comes on the screen, a turn that has not begun gives way to its gold fading in
  // (.tm-fade). A click or a key ends it all at once (clicks always pick), and so does the grid leaving the screen. Once
  // a visit (the tab's storage). Not under reduced motion, in forced colours or without JavaScript: the Table is at
  // rest, lit, Au gold.
  // ms: the pair's turn (until Id's light has gone), Au's point after the turn's start, Au's spread and its fade, a
  // rest, Au's longest wait once a fifth of it is on the screen, the wait for the menu, the specks' start after Au's
  // point, their fall
  const TM = { pair: 1600, gap: 1000, spread: 1600, fade: 600, rest: 1200, cap: 2500, menu: 600, specks: 800, fall: 1600 };
  // the specks (the owner's "gold particles settle like dust/light"): off until the owner approves a recorded take;
  // ?specks previews them
  const SPECKS = /[?&]specks\b/.test(location.search);
  const seenTm = () => { try { return sessionStorage.getItem('ad.tm') === '1'; } catch (e) { return false; } };
  const markTm = () => { try { sessionStorage.setItem('ad.tm', '1'); } catch (e) { /* storage unavailable: it plays again */ } };
  // fn once a block has started its rise (app.js .in), or now if it has none
  function whenIn(node, fn) {
    if (node.classList.contains('in') || !node.hasAttribute('data-rise')) { fn(); return null; }
    const mo = new MutationObserver(() => { if (node.classList.contains('in')) { mo.disconnect(); fn(); } });
    mo.observe(node, { attributes: true, attributeFilter: ['class'] });
    return mo;
  }
  // how much of a node is on the screen, as a share of it (or of the screen, when it is taller)
  function seen(node) {
    const r = node.getBoundingClientRect(), vh = window.innerHeight, s = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    return r.height > 0 ? Math.max(0, s) / Math.min(r.height, vh) : 0;
  }
  const STEPS_IO = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
  function transmute(box, main, grid, tiles, panel) {
    const L = window.AlchemistLight, au = tiles.get('au'), ed = tiles.get('hw'), id = tiles.get('idt');
    if (reduce || !L || L.off || !au || !ed || !id || !window.IntersectionObserver || !window.MutationObserver || seenTm()) return;
    const gold = el('span.tm-gold', { 'aria-hidden': 'true' }, el('span.tm-fill'), el('span.tm-edge'), el('span.tm-bloom'));
    au.prepend(gold);
    au.setAttribute('data-tm', '');
    grid.setAttribute('data-tm', '');
    panel.setAttribute('data-tm', '');
    // pairWait, auWait: Ed and Id, and Au, still to take their light; auGoing: Au's spread is set to play; asked: a
    // turn is in the light's queue or playing; menu: the database's answer (null until it comes)
    let lit = false, playing = false, ended = false, pairWait = true, auWait = true, pairOver = false, auOver = false;
    let auGoing = false, auSeen = false, asked = false, menu = null, panelSet = false, panelOver = false;
    let restT = 0, panelT = 0, turnAt = 0, turnEnd = 0, auAt = 0, cv = null;
    const timers = [], obs = [];
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const pairSeen = () => Math.min(seen(ed), seen(id));
    // the tiles at rest (their part over, or cut short): Au gold, the case lit
    function tilesDone() {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      obs.forEach((o) => o.disconnect());
      document.removeEventListener('keydown', all, true);
      L.stop(grid);
      auDone();
      grid.removeAttribute('data-tm');
      grid.classList.remove('tm-lit', 'tm-go', 'tm-rest');
      if (!panelSet && seen(panel) >= 0.3) setPanel(0, 400);   // with the panel in view: it sets now
    }
    function settle() {
      if (menu === false && pairOver) gild();   // (the preview's Au: gold once Ed and Id have taken their light)
      if (pairOver && auOver) tilesDone();
    }
    // Au at rest: its own gold, the layer gone
    function auDone() {
      if (auOver) return;
      auWait = false;
      auOver = true;
      au.removeAttribute('data-tm');
      au.classList.remove('tm-au', 'tm-fade');
      au.style.removeProperty('--tm-at');
      gold.remove();
      if (cv) { cv.stop(); cv = null; }
      settle();
    }
    // Au simply gold, without the spread: fading in where it is on the screen, at once where it is not. Without the
    // menu's figure (the preview) never ahead of the pair, so it reads Ed + Id → Au: once their light is over (settle),
    // or at the cap if their light has not even begun by then (Au is never left unlit)
    function gild(cap) {
      if (!auWait || auGoing) return;
      if (menu === false && !pairOver && !(cap && !turnAt)) return;
      auWait = false;
      if (seen(au) > 0) { au.classList.add('tm-fade'); later(auDone, TM.fade + 100); } else auDone();
    }
    // the menu's answer (services.js priced): Au's gold needs the database's figure
    function menuIs(ok) {
      if (menu !== null) return;
      menu = ok === true;
      if (!menu) gild();
    }
    function panelDone() {
      panelSet = panelOver = true;
      clearTimeout(panelT);
      panelIo.disconnect();
      panel.removeAttribute('data-tm');
      panel.classList.remove('tm-panel');
      panel.style.removeProperty('--tm-panel');
      panel.style.removeProperty('--tm-eq');
    }
    // a click or a key: everything at rest at once
    function all() {
      markTm();
      tilesDone();
      panelDone();
      box.removeEventListener('click', all, true);
      box.removeEventListener('focusin', all);
    }
    box.addEventListener('click', all, true);
    box.addEventListener('focusin', all);
    // the panel's Au rises into the light from sym (ms) and its equation rises in, whole, from eq (on its own clock:
    // the tiles' end does not cut it short)
    function setPanel(sym, eq) {
      if (panelSet) return;
      panelSet = true;
      whenIn(panel, () => {
        if (panelOver) return;
        panel.style.setProperty('--tm-panel', sym + 'ms');
        panel.style.setProperty('--tm-eq', eq + 'ms');
        panel.classList.add('tm-panel');
        setTimeout(panelDone, Math.max(sym, eq) + 900);
      });
    }
    // under way: a key ends it, and so does the grid leaving the screen
    function play() {
      if (playing) return;
      playing = true;
      markTm();
      document.addEventListener('keydown', all, true);
      const away = new IntersectionObserver((es) => { if (!es[es.length - 1].isIntersecting) tilesDone(); });
      obs.push(away);
      away.observe(grid);
    }
    // Au's spread, from at (ms): its circle's last radius is past the farthest corner from its light point (the
    // middle, 55% down), and the ring on its edge is scaled in step with it (CSS)
    function spread(at) {
      auGoing = true;
      auAt = performance.now() + at;
      const end = Math.ceil(Math.hypot(0.5 * (au.offsetWidth + 2), 0.55 * (au.offsetHeight + 2))) + 2;
      gold.style.setProperty('--tm-end', end + 'px');
      gold.style.setProperty('--tm-s0', (18 / end).toFixed(3));
      gold.style.setProperty('--tm-s1', (52 / end).toFixed(3));
      au.style.setProperty('--tm-at', at + 'ms');
      au.classList.add('tm-au');
      if (SPECKS) later(() => { cv = specks(au, main); }, at + TM.specks);
      later(auDone, at + Math.max(TM.spread, SPECKS ? TM.specks + TM.fall : 0) + 100);
    }
    // the turn has come (it plays now): what still waits and is on the screen takes it, the pair first; it says how
    // long it holds the light (the whole of it, so nothing else crosses in between)
    function turn() {
      const p = pairWait && pairSeen() >= 0.2, a = auWait && menu === true && seen(au) >= 0.2;
      let ms = 1;
      if (p || a) play();
      if (p) {
        pairWait = false;
        turnAt = performance.now();
        grid.classList.add('tm-go');
        later(() => { pairOver = true; settle(); }, TM.pair + 50);
        ms = TM.pair;
      }
      if (a) {
        spread(p ? TM.gap : 0);
        ms = (p ? TM.gap : 0) + TM.spread;
      }
      // beside the grid, the panel rises into the light with the turn and its equation draws as Au floods
      if ((p || a) && !panelSet && !stacked.matches && seen(panel) >= 0.3) setPanel(p ? 150 : 0, a ? (p ? TM.gap : 0) + 480 : 600);
      turnEnd = performance.now() + ms;
      later(() => { asked = false; check(); }, ms + 200);   // then whatever is still to come asks again
      return ms;
    }
    const wanted = () => !ended && ((pairWait && pairSeen() >= 0.2) || (auWait && menu === true && seen(au) >= 0.2));
    // Au due while the pair's turn is still playing (a phone, scrolling on to Au's row): its spread joins that turn,
    // 1s after the turn's start at the soonest, and the turn holds the light until it has gone
    function join() {
      if (!turnAt || pairOver || !auWait || auGoing || menu !== true || seen(au) < 0.35) return false;
      const at = Math.max(0, Math.round(turnAt + TM.gap - performance.now()));
      if (!L.extend(grid, at + TM.spread)) return false;
      spread(at);
      turnEnd = Math.max(turnEnd, auAt + TM.spread);
      return true;
    }
    // a turn in the light's queue (what it lights is decided as it starts); one that would light Au first waits for
    // the menu's answer, 600ms at most
    function ask() {
      if (asked || ended) return;
      if (auWait && menu === null && seen(au) >= 0.35) {
        asked = true;
        let once = false;
        const go = (ok) => { if (once) return; once = true; menuIs(ok); asked = false; ask(); };
        priced().then(go, () => go(false));
        later(() => go(false), TM.menu);
        return;
      }
      if (!wanted()) return;
      asked = true;
      L.pass(grid, { size: 'card', start: turn, when: wanted, miss: () => { asked = false; } });
    }
    function light() {
      lit = true;
      grid.classList.add('tm-lit');
      play();
    }
    // a rest: the case lights if any of its tiles is on the screen, a tile a third on the screen takes its turn, and
    // Ed and Id, if they are only partly on it, are simply lit (off it, they wait for their turn)
    function rested() {
      if (ended) return;
      if (!lit && [...tiles.values()].some((t) => seen(t) > 0)) light();
      if (!lit) return;
      const p = pairWait && pairSeen() >= 0.35;
      if (p || (auWait && seen(au) >= 0.35 && !join())) ask();
      if (pairWait && !p && Math.max(seen(ed), seen(id)) > 0) {
        pairWait = false;
        grid.classList.add('tm-rest');
        pairOver = true;
        settle();
      }
    }
    // whatever is on the screen has changed
    function check() {
      if (ended) return;
      if (auWait && !auSeen && seen(au) >= 0.2) { auSeen = true; later(() => gild(true), TM.cap); }
      clearTimeout(restT);
      restT = later(rested, TM.rest);
      if (!lit && seen(grid) >= 0.35) light();
      if (lit && ((pairWait && pairSeen() >= 0.5) || (auWait && seen(au) >= 0.5 && !join()))) ask();
    }
    const io = new IntersectionObserver(check, { threshold: STEPS_IO });
    obs.push(io);
    // the panel: under the grid (a phone) as soon as it is on the screen; beside it, with the tiles' turn (coming on
    // the screen while a turn plays, at once, its equation drawing as Au floods), or after a rest; with the tiles at
    // rest, at once
    const panelIo = new IntersectionObserver(() => {
      if (panelSet) return;
      clearTimeout(panelT);
      if (seen(panel) < 0.3) return;
      if (stacked.matches || ended) setPanel(0, 400);
      else if (performance.now() < turnEnd) setPanel(0, Math.max(400, Math.round(auAt + 480 - performance.now())));
      else panelT = setTimeout(() => { if (!panelSet && seen(panel) >= 0.3) setPanel(0, 400); }, TM.rest);
    }, { threshold: STEPS_IO });
    // all of them once the grid's rise has begun (from the next task: app.js arms it just after the page is built, and
    // asks the database for the menu)
    setTimeout(() => whenIn(main, () => {
      if (ended) return;
      priced().then(menuIs, () => menuIs(false));
      [grid, ed, id, au].forEach((n) => io.observe(n));
      panelIo.observe(panel);
    }), 0);
  }
  // A few soft, out-of-focus discs of gold (wide, flat and faint, like light out of focus) drift down round the Au
  // tile and settle, then fade: never a burst, a spin or a twinkle. One canvas 2D over the tile and a margin (the device's pixels, two at most), 1.6s, then removed.
  function specks(tile, host) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), n = stacked.matches ? 14 : 24, m = 70;
    const r = tile.getBoundingClientRect(), h = host.getBoundingClientRect(), W = Math.round(r.width + 2 * m), H = Math.round(r.height + 2 * m);
    const cv = el('canvas.tm-specks', { 'aria-hidden': 'true', width: W * dpr, height: H * dpr,
      style: { left: Math.round(r.left - h.left - m) + 'px', top: Math.round(r.top - h.top - m) + 'px', width: W + 'px', height: H + 'px' } });
    const c = cv.getContext('2d');
    if (!c) return { stop() {} };
    const cs = getComputedStyle(document.documentElement), rgb = (k) => cs.getPropertyValue(k).trim();
    // one soft disc, drawn once: a warm pale core falling off into the gold
    const disc = document.createElement('canvas');
    disc.width = disc.height = 64;
    const d = disc.getContext('2d'), g = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + rgb('--gold-pale-rgb') + ', .55)');
    g.addColorStop(0.55, 'rgba(' + rgb('--gold-hi-rgb') + ', .32)');
    g.addColorStop(0.85, 'rgba(' + rgb('--gold-rgb') + ', .1)');
    g.addColorStop(1, 'rgba(' + rgb('--gold-rgb') + ', 0)');
    d.fillStyle = g;
    d.fillRect(0, 0, 64, 64);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const ps = Array.from({ length: n }, () => ({
      x: rnd(m * 0.4, W - m * 0.4), y: rnd(0, H * 0.55), fall: rnd(18, 46), sway: rnd(2, 6), ph: rnd(0, 6.28),
      s: rnd(6, 16), a: rnd(0.18, 0.42), at: rnd(0, 0.35),
    }));
    host.appendChild(cv);
    c.scale(dpr, dpr);
    const t0 = performance.now();
    let raf = 0, gone = false;
    const stop = () => { if (gone) return; gone = true; cancelAnimationFrame(raf); cv.remove(); };
    (function frame(now) {
      if (gone) return;
      const t = Math.min(1, (now - t0) / TM.fall);
      c.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        const u = Math.min(1, Math.max(0, (t - p.at) / (1 - p.at)));   // its own life
        if (u <= 0) return;
        const settle = 1 - Math.pow(1 - u, 2);   // it slows as it settles
        const env = Math.min(1, u / 0.3) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
        c.globalAlpha = p.a * env;
        const x = p.x + Math.sin(p.ph + u * 2.2) * p.sway, y = p.y + p.fall * settle, s = p.s * 2.4;
        c.drawImage(disc, x - s / 2, y - s / 2, s, s);
      });
      if (t < 1) raf = requestAnimationFrame(frame); else stop();
    })(t0);
    return { stop };
  }

  // ---------------------------------------------------------------- the Ritual
  // (the page's plates have the front and the mirror, so the last two steps take the side skirt and the lip)
  // The order is the Products guide's: wheels first, then the pre-wash (guide question Q1 asks the owner to confirm it)
  // Migration 011's menu (Nov 17): the products named are the owner's own (the Products guide); the seal is the Full
  // Detail's, or Gloss wax foam added to a wash
  const STEPS = [
    { n: '01', title: 'Wheels', text: 'Hand Wash and up: wheels and tires go first, so their grime never splashes a clean car; tire shine comes at the end. On a Basic Wash they are rinsed with the car, or add Wheels & Tire Shine.', chips: ['Hand Wash and up', 'Wheels & Tire Shine · add-on'], media: () => photo('wheel', 'Rear wheel and arch after cleaning'), pos: '45% 62%' },
    { n: '02', title: 'Pre-wash', text: 'A Green Star pre-wash loosens the dirt before anything touches the paint.', chips: ['Green Star'], media: () => texture('foam', 1200, 900), pos: '30% 50%' },
    { n: '03', title: 'Hand wash', text: 'A careful two-bucket hand wash with Gentle Snow Foam.', chips: ['Two buckets', 'By hand'], media: () => photo('badge', 'M2 badge on wet white paint'), pos: '50% 50%' },
    { n: '04', title: 'Hand dry', text: 'Rinsed and dried by hand. Hand Wash and up: blown out, and the outside glass.', chips: ['Outside glass · Hand Wash and up'], media: () => photo('side', 'Side skirt and carbon trim after a wash'), pos: '40% 100%' },
    { n: '05', title: 'Seal', text: 'The Full Detail’s wash finishes with a water-repellent sealant foam. Or add Gloss wax foam to a Basic Wash, Hand Wash or Inside & Out.', chips: ['Sealant foam · Full Detail', 'Gloss wax foam · add-on'], media: () => photo('lip', 'Carbon-fibre front lip with water beading'), pos: '50% 100%' },
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
      el('div.show-head', el('div', el('p.eyebrow', 'How a wash is done'), el('h2.display', { id: 'ritualTitle' }, 'The Ritual')),
        el('p', 'The order every wash follows. The Full Detail adds the seal.', el('span.tap-only', ' Tap a step to open it.'), el('span.click-only', ' Click a step to open it.'))),   // (the verb for the pointer; paper has every step open: the CSS leaves it off)
      el('div.rit-scroll', row));
  }

  // ---------------------------------------------------------------- the Bead Test
  // WetGloss, its first subject, is retired (Migration 011). PROPOSED until the owner says (design C10): the Full Detail's
  // water-repellent sealant foam beside bare paint, with no price of its own here (it is part of the Full Detail).
  let bead = null;
  function mountBead(container) {
    const root = document.documentElement;
    const gl = !root.classList.contains('no-webgl') && window.AlchemistHero && typeof window.AlchemistHero.art === 'function';
    const spray = hoverable && !reduce && window.CSS && (CSS.supports('mask-image', 'radial-gradient(#000, #000)') || CSS.supports('-webkit-mask-image', 'radial-gradient(#000, #000)'));
    // data-studio="0": the stills are black paint in both themes, so the renderer draws black paint over them
    const art = (scene) => (gl ? el('canvas.bead-art', { 'data-art': scene, 'data-t': '10.25', 'data-k': '.5', 'data-studio': '0', width: 700, height: 500, 'aria-hidden': 'true' }) : null);
    const bare = el('div.bead-pane.bare', texture('water-film', 1400, 900), art('film'), el('span.scrim', { 'aria-hidden': 'true' }),
      el('span.bead-pill', 'Bare paint'), el('span.bead-cap', 'Water lies flat in a film'));
    const gloss = el('div.bead-pane.gloss', texture('water-beads', 1400, 900), art('beads'), el('span.scrim', { 'aria-hidden': 'true' }),
      el('span.bead-pill', 'Sealant foam'), el('span.bead-cap', 'Water beads up and rolls off'));
    if (spray) armSpray(gloss);
    const price = el('b.tnum', BY.au.price), size = el('span', sizeName());
    bead = { refresh() { put(price, BY.au.price); put(size, sizeName()); } };
    container.replaceChildren(
      el('div.show-head', el('div', el('p.eyebrow', 'Protection'), el('h2.display', { id: 'beadTitle' }, 'The Bead Test')),
        el('p', spray ? el('span.bead-how', 'Press and drag across the panel. ') : null, 'On bare paint the water lies flat. A water-repellent sealant foam pulls it into beads that roll off.')),   // (the panel's own words: not in print)
      el('div.bead-cmp', bare, gloss, el('span.bead-seam', { 'aria-hidden': 'true' }), el('span.bead-badge', { 'aria-hidden': 'true' }, '✦')),
      el('div.bead-foot',
        el('div.wg', el('b', 'Sealant foam'), el('p', 'The finish on every Full Detail’s wash. Or add Gloss wax foam to a Basic Wash, Hand Wash or Inside & Out.')),
        el('div.bead-prices', el('div.bead-chips', el('span.bead-price', 'Full Detail, ', size, ' ', price))),
        el('a.btn.btn-gold.shine', { href: '#book-au' }, 'Book a Full Detail ', arrow())));
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
  // Migration 011: every price and time goes by size. The page has one size switch (Car / 2 rows / 3 rows or pickup /
  // Minivan, remembered on this device as ad-size; the booking sets it too when a vehicle type is chosen), and every
  // [data-price], [data-time], [data-saving], [data-every] and the Table show that size's figures from the database's
  // service_size_rates. [data-size-name] says which size is shown. The First Timer Deals (Migration 012: the banner
  // [data-deals-banner], the section #svc-deals, the cards' lines [data-deal-line], the small print [data-deals-fine])
  // and their end date come from get_first_visit_offer, so what the owner sets shows everywhere, and all of it hides
  // when the offer is over. Until the database answers, and should it never, the page shows the menu as seeded (a car)
  // and no deal. Never a "from" price.
  // Still typed by hand (change them too when the menu changes in the database): the LD+JSON priceRange in index.html,
  // the FAQ's prices and times (content.js), the Full Detail's "not included" line and the home cards' lines.
  const money = window.AlchemistUI.money;
  const SIZES_SEED = [{ code: 'car', name: 'Car', short_name: 'Car' }, { code: 'two_rows', name: 'SUV or crossover, 2 rows', short_name: '2 rows' },
    { code: 'three_rows', name: '3 rows or pickup', short_name: '3 rows or pickup' }, { code: 'minivan', name: 'Minivan', short_name: 'Minivan' }];
  let sizes = SIZES_SEED;
  let size = (() => { try { const v = localStorage.getItem('ad-size'); return SIZES_SEED.some((z) => z.code === v) ? v : 'car'; } catch (e) { return 'car'; } })();
  const sizeName = () => (sizes.find((z) => z.code === size) || SIZES_SEED[0]).name;
  const sizeShort = (code) => (sizes.find((z) => z.code === code) || {}).short_name || code;
  function timeText(min, addon) {
    if (min == null) return null;
    min = Math.ceil(min);
    const h = Math.floor(min / 60), r = min % 60;
    return (addon ? '+' : '') + (min < 60 ? min + ' min' : h + ' h' + (r ? ' ' + r + ' min' : ''));
  }
  // a tile's short time: minutes under two hours, else hours to the quarter
  function tileTime(e) {
    const m = minutesOf(e.time);
    if (m == null) return e.time;
    if (e.addon || m < 120) return e.time.replace(/ h /, ':').replace(/ min$/, e.addon ? ' min' : '');
    const q = Math.round(m / 15) / 4, w = Math.floor(q), f = q - w;
    return w + (f === 0.25 ? '¼' : f === 0.5 ? '½' : f === 0.75 ? '¾' : '') + ' h';
  }
  // '1 h 32 min', '92 min', '+19 min' back to minutes (the step-up's time, from the cards as they stand)
  function minutesOf(text) {
    const m = /^\+?(?:(\d+)\s*h)?\s*(?:(\d+)\s*min)?$/.exec(String(text || '').trim());
    return !m || (!m[1] && !m[2]) ? null : (+m[1] || 0) * 60 + (+m[2] || 0);
  }
  const svcOf = (m, code) => m.services.find((s) => s.code === code) || null;
  // a service's rate for the size shown: { price, minutes }; an add-on has one price for every size
  function rateOf(m, code) {
    const r = m.rates && m.rates[code];
    if (r && r[size]) return r[size];
    const s = svcOf(m, code);
    return s ? { price: s.base_price_cents, minutes: s.duration_min } : null;
  }
  const priceOf = (m, code) => { const r = rateOf(m, code); return r ? r.price : null; };
  // what a service includes (service_includes); a bundle also includes what its parts include, as quote_core works it out
  function includedBy(m, code) {
    const out = new Set();
    [code].concat(m.bundleParts[code] || []).forEach((c) => (m.includes[c] || []).forEach((i) => out.add(i)));
    return out;
  }
  // a bundle against its parts booked one by one, for the size shown: { sum, save }, or null when it saves nothing
  function savingOf(m, code) {
    const parts = m.bundleParts[code], p = priceOf(m, code);
    if (!parts || !parts.length || p == null) return null;
    const v = parts.map((c) => priceOf(m, c));
    if (v.some((x) => x == null)) return null;
    const sum = v.reduce((t, x) => t + x, 0);
    return sum > p ? { sum, save: sum - p } : null;
  }
  // a figure swapped in place fades in over a panel's time, on the feedback curve (both read from the stylesheet's tokens)
  function fade(node) {
    if (reduce || !node.animate) return;
    const cs = getComputedStyle(document.documentElement);
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: parseFloat(cs.getPropertyValue('--dur-panel')) || 450, easing: cs.getPropertyValue('--ease').trim() || 'cubic-bezier(.2, .8, .2, 1)' });
  }
  function put(node, text) {
    if (!node || text == null || node.textContent === text) return;
    node.textContent = text;
    fade(node);
  }
  function putSaving(p, sv) {
    p.hidden = !sv;
    if (!sv) return;
    const text = money(sv.sum) + ' booked separately. You save ' + money(sv.save) + '.';
    if (p.textContent === text) return;
    p.replaceChildren(money(sv.sum) + ' booked separately. You save ', el('b.tnum', money(sv.save)), '.');
    fade(p);
  }
  // the Table's elements, from the menu, for the size shown
  function fromMenu(m) {
    ELEMENTS.forEach((e) => {
      const s = svcOf(m, e.code), r = rateOf(m, e.code);
      if (!s || !r) return;
      if (r.price != null) e.price = money(r.price);
      if (r.minutes != null) e.time = timeText(r.minutes, e.addon);
      if (e.lead) { const sv = savingOf(m, e.code); e.desc = e.lead + (sv ? ': ' + money(sv.sum) + ' booked separately, so you save ' + money(sv.save) + '.' : '.'); }
    });
    if (table) table.refresh();
    if (bead) bead.refresh();
  }
  let menuP = null, offerP = null, pubSettings = null;
  function loadMenu() {
    const D = window.AlchemistData;
    if (!D) return Promise.reject(new Error('no data layer'));
    // the public settings come with the menu: the cards' "Weekends only" is worked out from the opening hours
    if (!menuP) menuP = D.init().then(() => Promise.all([D.menu(), D.settings ? D.settings().catch(() => null) : null]))
      .then(([m, st]) => { pubSettings = st; return m; }).catch((e) => { menuP = null; throw e; });
    return menuP;
  }
  function loadOffer() {
    const D = window.AlchemistData;
    if (!D || !D.firstVisitOffer) return Promise.resolve(null);
    if (!offerP) offerP = D.init().then(() => D.firstVisitOffer()).catch(() => { offerP = null; return null; });
    return offerP;
  }
  // The First Timer Deals (Migration 012), from get_first_visit_offer for the size shown: the gold banner at the top of
  // Home and Services (owner: "on the top"), the section's three cards (name, what, the first-visit price, every size,
  // the price after the first visit, "Book this deal"), the line on the Basic Wash and Interior Clean cards, and the
  // small print. Hidden, every one, when the offer is over or can't be read: the database says.
  const U = window.AlchemistUI;
  const GROUP_OF = { exterior: 'services-exterior', interior: 'services-interior' };
  function paintBanner(o) {
    const on = !!(o && o.active && o.deals && o.deals.length);
    document.querySelectorAll('[data-deals-banner]').forEach((n) => {
      if (n.hidden === !on) return;
      n.hidden = !on;
      if (on && !reduce) n.classList.add('arrive');
    });
    return on;
  }
  function paintOffer(o) {
    const on = paintBanner(o);
    const nameOf = (code) => (ELEMENTS.find((e) => e.code === code) || {}).name || code;
    const list = on ? U.dealLines(o, size, nameOf) : [];
    document.querySelectorAll('[data-deals]').forEach((n) => { n.hidden = !list.length; });
    document.querySelectorAll('[data-deals-fine]').forEach((n) => { n.hidden = !list.length; if (list.length) put(n, U.dealsFine(o, size, sizeShort(size), nameOf)); });
    // the cards: built once for the deals the database has, then their figures follow the size switch
    document.querySelectorAll('[data-deal-grid]').forEach((grid) => {
      const key = list.map((d) => d.code).join();
      if (grid.dataset.key !== key) { grid.dataset.key = key; grid.replaceChildren(...list.map(dealCard)); }
      list.forEach((d) => {
        const card = grid.querySelector('[data-deal="' + d.code + '"]');
        if (!card) return;
        put(card.querySelector('[data-deal-price]'), money(d.price));
        put(card.querySelector('[data-deal-after]'), 'After your first visit: ' + money(d.regular) + (d.codes.length > 1 ? ' for the two' : '') + '.');
        const deal = o.deals.find((x) => x.code === d.code), every = card.querySelector('[data-deal-every]');
        const ekey = JSON.stringify([size, deal.prices]);
        if (every && every.dataset.key !== ekey) {
          every.dataset.key = ekey;
          every.replaceChildren(...sizes.filter((z) => deal.prices[z.code]).map((z) => el('span', { class: z.code === size ? 'on' : null, 'aria-current': z.code === size ? 'true' : null }, z.short_name + ' ', el('b.tnum', money(deal.prices[z.code].first_visit_cents)))));
        }
      });
    });
    // the line on a card a deal is for alone: "First Timer Deal: your first one is $35"
    document.querySelectorAll('[data-deal-line]').forEach((n) => {
      const d = list.find((x) => x.codes.length === 1 && x.codes[0] === n.dataset.dealLine);
      const wrap = n.closest('[data-deal-wrap]') || n;
      wrap.hidden = !d;
      if (d) put(n, 'First Timer Deal: your first one is ' + money(d.price));
    });
  }
  function dealCard(d) {
    const link = (code) => {
      const e = ELEMENTS.find((x) => x.code === code), kind = d.exterior === code ? 'exterior' : 'interior';
      return el('a', { href: '#' + GROUP_OF[kind] }, e ? e.name : code);
    };
    const what = [];
    d.codes.forEach((c, i) => { if (i) what.push(' + '); what.push(link(c)); });
    return el('article.deal-card', { dataset: { deal: d.code } },
      el('h3', d.name),
      el('p.deal-what', what),
      el('p.amount.tnum', { dataset: { dealPrice: '' } }, money(d.price)),
      el('p.every', { 'aria-label': 'Every size', dataset: { dealEvery: '' } }),
      el('p.deal-after.tnum', { dataset: { dealAfter: '' } }),
      el('a.btn.btn-glass', { href: '#book-' + d.token, 'aria-label': 'Book the ' + d.name + ' deal' }, 'Book this deal ', el('span.arrow', { 'aria-hidden': 'true' }, '→')));
  }
  // every figure on the page for the size shown (the menu already loaded)
  function paint(m) {
    const all = (sel) => document.querySelectorAll(sel);
    if (m.sizes && m.sizes.length) sizes = m.sizes;
    all('[data-size-name]').forEach((n) => put(n, n.dataset.sizeName === 'short' ? sizeShort(size) : sizeName()));
    all('[data-price]').forEach((n) => { const p = priceOf(m, n.dataset.price); put(n, p == null ? 'We confirm' : money(p)); });
    // a service that fits only some days says so (plan d: "2-row and larger: weekends only"), as booking step 04 does
    all('[data-time]').forEach((n) => {
      const s = svcOf(m, n.dataset.time), r = rateOf(m, n.dataset.time);
      if (!s || !r) return;
      put(n, timeText(r.minutes, s.kind === 'addon'));
      const fit = s.kind === 'addon' ? null : window.AlchemistUI.dayFit(pubSettings, Math.ceil(r.minutes));
      let f = n.parentElement.querySelector('dd.day-fit');   // (a second dd under Time)
      if (fit && !f) n.after(f = el('dd.day-fit'));
      if (f) { f.hidden = !fit; if (fit) put(f, fit.text); }
    });
    all('[data-saving]').forEach((p) => putSaving(p, savingOf(m, p.dataset.saving)));
    // "every size": the four prices of a card, the size shown in gold (aria-current)
    all('[data-every]').forEach((n) => {
      const r = m.rates && m.rates[n.dataset.every];
      if (!r) return;
      const key = JSON.stringify([sizes.map((z) => z.code), r, size]);
      if (n.dataset.key === key) return;
      n.dataset.key = key;
      n.replaceChildren(...sizes.filter((z) => r[z.code]).map((z) => el('span', { class: z.code === size ? 'on' : null, 'aria-current': z.code === size ? 'true' : null }, z.short_name + ' ', el('b.tnum', r[z.code].price == null ? '—' : money(r[z.code].price)))));
    });
    // a line naming what a service includes shows while the menu still includes every one of them
    all('[data-includes]').forEach((li) => {
      const has = includedBy(m, li.dataset.service);
      li.hidden = !li.dataset.includes.split(' ').every((c) => has.has(c));
    });
    fromMenu(m);
    if (lineup) syncLineup(m);
    paintSwitches();
  }
  let synced = null;   // the latest answer: true once the page's figures are the database's
  function syncMenu() {
    loadOffer().then(paintOffer);
    synced = loadMenu().then((m) => { paint(m); return window.AlchemistData.isLive; }).catch(() => false);   // the menu couldn't load: the page keeps the menu as seeded
    return synced;
  }
  // whether the figures on the page are the database's (a price card arrives with its figure once they are: app.js)
  const priced = () => synced || Promise.resolve(false);

  // ---------------------------------------------------------------- the size switch
  // A radio group (arrow keys move and choose, as the booking's choices do); the choice is kept on this device.
  const switches = [];
  function paintSwitches() {
    switches.forEach((box) => {
      if (box.dataset.sizes !== sizes.map((z) => z.code).join()) buildSwitch(box);
      box.querySelectorAll('[role="radio"]').forEach((b) => { const on = b.dataset.size === size; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    });
  }
  function setSize(code, focus) {
    if (code === size || !sizes.some((z) => z.code === code)) return;
    size = code;
    try { localStorage.setItem('ad-size', code); } catch (e) { /* storage blocked: the switch keeps it for this page */ }
    paintSwitches();
    if (focus) { const b = document.querySelector('.size-switch [data-size="' + code + '"]'); if (b) b.focus({ preventScroll: true }); }
    loadMenu().then(paint).catch(() => {});
    loadOffer().then(paintOffer);
  }
  function buildSwitch(box) {
    box.dataset.sizes = sizes.map((z) => z.code).join();
    const row = el('div.size-row', { role: 'radiogroup', 'aria-labelledby': 'sizeLabel' }, sizes.map((z) => el('button.size-opt', {
      type: 'button', role: 'radio', dataset: { size: z.code }, 'aria-checked': z.code === size ? 'true' : 'false', tabindex: z.code === size ? 0 : -1,
      onclick: () => setSize(z.code, false) }, z.short_name)));
    row.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const i = sizes.findIndex((z) => z.code === size);
      setSize(sizes[(i + d + sizes.length) % sizes.length].code, true);
    });
    box.replaceChildren(el('p.size-label', { id: 'sizeLabel' }, 'Your vehicle'), row,
      el('p.size-note', 'Van, unusual vehicle or not sure? Book it and we confirm the price before your appointment.'));
  }
  function mountSize(box) {
    if (!box || switches.includes(box)) return;
    switches.push(box);
    buildSwitch(box);
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
    // what the bigger one adds beyond its parts (the Full Detail's pre-soak, wheel wells and sealant foam: [data-extra])
    const extras = Array.from(hi.querySelectorAll('[data-extra]'), (li) => li.textContent.trim());
    const tLo = lo.querySelector('[data-time]'), tHi = hi.querySelector('[data-time]');
    const mLo = tLo && minutesOf(tLo.textContent), mHi = tHi && minutesOf(tHi.textContent);
    const time = mLo && mHi && mHi > mLo ? { plus: timeText(mHi - mLo, true), from: tLo.textContent, to: tHi.textContent } : null;
    const key = JSON.stringify([ok, parts, adds, extras, time, folds.matches]);
    if (key === stepKey) return;
    stepKey = key;
    if (!ok || (!parts.length && !adds.length && !extras.length)) { panel.hidden = true; box.classList.remove('has-step'); return; }
    const short = (ELEMENTS.find((e) => e.code === hi.dataset.code) || {}).short || nameOf(hi);
    panel.setAttribute('aria-labelledby', 'stepTitle');
    panel.replaceChildren(...[
      el('h3.eyebrow', { id: 'stepTitle' }, 'What you add with ' + short),
      extras.length ? el('div.su-part', el('h4', 'Outside'), el('ul.su-list', extras.map((t) => el('li', t)))) : null,
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

  // The banner alone, as Home arrives (app.js, after the hero's first frame): the offer read, the gold line shown only
  // while the database says the deals run, hidden on any failure
  function showBanner() { return loadOffer().then((o) => paintBanner(o)).catch(() => false); }
  window.AlchemistServices = { mountTable, mountRitual, mountBead, mountLineup, mountSize, syncMenu, priced, loadOffer, paintBanner, showBanner, signs: SIGNS, oldTokens: OLD_TOKENS, size: () => size };
})();
