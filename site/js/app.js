/* Alchemist Detailing — page behaviour: the menu, one-page routing with the
   bar's page name, the hero scene, still pictures for the service cards, the
   wash, the motion system (reveals, rims, press, shine) and the gold
   transition into booking. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glOk = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } })();
  if (!glOk) root.classList.add('no-webgl');

  const NAMES = { home: 'Home', services: 'Services', book: 'Book', appointments: 'Appointments', reviews: 'Reviews', tips: 'Tips', faq: 'FAQ', about: 'About', contact: 'Contact', account: 'Account', admin: 'Admin', team: 'Team', gallery: 'Gallery' };
  const PHONE = '(945) 361-7551', TEL = 'tel:+19453617551';
  const HOME_TITLE = 'Alchemist Detailing · Hand car detailing in Parker, Texas';
  // Pages that come later in the build. Nothing here is a feature that exists yet.
  const PAGES = {
    contact: { eyebrow: 'Get in touch', title: 'Contact', text: 'Call to book or to ask a question.', contact: true, primary: { href: TEL, label: 'Call ' + PHONE } },
  };

  // ---------------------------------------------------------------- hero
  // The headline is split into letters first (so the intro has them from its first frame).
  const unsplit = splitHeadline();
  let hero = null;
  if (glOk && window.AlchemistHero) {
    const scenes = ['beads', 'gloss'];
    let last = null;
    try { last = localStorage.getItem('ad.hero'); } catch (e) { /* storage unavailable */ }
    let scene = scenes[Math.random() < 0.5 ? 0 : 1];
    if (scene === last) scene = scenes.find((s) => s !== last);
    try { localStorage.setItem('ad.hero', scene); } catch (e) { /* storage unavailable */ }
    try { hero = window.AlchemistHero.start($('#heroGl'), { scene, still: reduce }); } catch (e) { root.classList.add('no-hero-gl'); }
  }
  // The intro waits for the shader: two frames after the hero starts, the compile is behind us,
  // so the first letters are never swallowed by it. (CSS pauses the hero animations until html.ready.)
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('ready');
    if (unsplit) setTimeout(unsplit, 2000);   // fallback, in case the last letter's animationend never comes
  }));
  function splitHeadline() {
    const l1 = $('.hero h1 .l1');
    if (!l1 || reduce) return null;
    const text = l1.textContent;
    const sr = document.createElement('span');
    sr.className = 'sr-only'; sr.textContent = text;   // the word stays readable while the letters rise
    l1.textContent = '';
    l1.appendChild(sr);
    let lastCh = null;
    Array.from(text).forEach((ch, i) => {
      const sp = document.createElement('span');
      sp.className = 'ch'; sp.textContent = ch; sp.style.setProperty('--i', i); sp.setAttribute('aria-hidden', 'true');
      l1.appendChild(sp);
      lastCh = sp;
    });
    l1.classList.add('split');
    const done = () => { if (!l1.classList.contains('split')) return; l1.textContent = text; l1.classList.remove('split'); };
    l1.addEventListener('animationend', (e) => { if (e.target === lastCh) done(); });
    return done;
  }

  // ---------------------------------------------------------------- the bar's page name
  const pageName = $('#pageName');
  function setName(text) {
    const old = pageName.lastElementChild;
    if (old && old.textContent === text) return;
    const n = document.createElement('span');
    n.textContent = text;
    n.className = 'in-start';
    pageName.appendChild(n);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      n.className = '';
      if (old) old.className = 'out';
    }));
    setTimeout(() => { if (old && old.parentNode) old.remove(); }, 520);
  }

  // ---------------------------------------------------------------- menu
  const menu = $('#menu'), scrim = $('#scrim'), menuBtn = $('#menuBtn'), main = $('#main');
  const footer = $('.footer'), topbar = $('#topbar');
  let menuOpen = false;
  function press(btn) {
    btn.classList.add('pressed', 'ringing');
    setTimeout(() => btn.classList.remove('pressed'), 170);
    setTimeout(() => btn.classList.remove('ringing'), 650);
  }
  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    press(menuBtn);
    setTimeout(() => {
      menu.classList.add('on');
      scrim.classList.add('on');
    }, reduce ? 0 : 110);
    menu.setAttribute('aria-hidden', 'false');
    menuBtn.setAttribute('aria-expanded', 'true');
    main.inert = true;
    topbar.inert = true;
    if (footer) footer.inert = true;
    root.style.overflow = 'hidden';
    if (hero && hero.pause) hero.pause();
    setTimeout(() => { const a = $('nav a', menu); if (a) a.focus({ preventScroll: true }); }, reduce ? 0 : 380);
  }
  function closeMenu(returnFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('on');
    scrim.classList.remove('on');
    menu.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    main.inert = false;
    topbar.inert = false;
    if (footer) footer.inert = false;
    root.style.overflow = '';
    if (hero && hero.resume) hero.resume();
    if (returnFocus) menuBtn.focus({ preventScroll: true });
  }
  menuBtn.addEventListener('click', () => (menuOpen ? closeMenu(true) : openMenu()));
  $('#menuClose').addEventListener('click', () => { press($('#menuClose')); closeMenu(true); });
  scrim.addEventListener('click', () => closeMenu(true));
  document.addEventListener('keydown', (e) => {
    if (!menuOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'Tab') {   // keep focus inside the open menu
      const f = $$('a, button', menu).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---------------------------------------------------------------- top bar
  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------------------------------------------------------------- still pictures (cards, backgrounds)
  // Painted once the first page is on screen (see the idle callback at the end), never before.
  let artQueue = [];
  let artBusy = false;
  let artReady = false;
  function paintArt() {
    if (!artReady || !glOk || !window.AlchemistHero) return;
    artQueue = $$('canvas[data-art]').filter((c) => c.offsetParent !== null || c.closest('.wash-stage'));
    if (!artBusy) nextArt();
  }
  function nextArt() {
    const c = artQueue.shift();
    if (!c) { artBusy = false; return; }
    artBusy = true;
    const w = c.clientWidth, h = c.clientHeight;
    if (w && h) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const k = +(c.dataset.k || 0.85);
      const W = Math.round(w * dpr * k), H = Math.round(h * dpr * k);
      if (c.width !== W || c.height !== H || !c.dataset.done) {
        try {
          // data-studio="0" keeps black paint in light mode too (the dark photo pieces); otherwise the theme decides
          const opts = c.dataset.studio != null ? { studio: c.dataset.studio === '1' } : undefined;
          const src = window.AlchemistHero.art(c.dataset.art, W, H, +(c.dataset.t || 10), opts);
          if (src) {
            c.width = W; c.height = H;
            c.getContext('2d').drawImage(src, 0, 0);
            c.dataset.done = '1';
          }
        } catch (e) { /* keep the CSS background */ }
      }
    }
    requestAnimationFrame(nextArt);
  }

  // ---------------------------------------------------------------- the wash
  let wash = null;
  function startWash() {
    if (!glOk || reduce || !window.AlchemistWash) return;
    try {
      wash = window.AlchemistWash.start({
        section: $('#wash'), stage: $('#washStage'), canvas: $('#foamGl'), cannon: $('#cannon'),
        tip: $('#nozTip'), back: $('#nozBack'), adaptive: !/[?&]noadapt/.test(location.search), reveal: [$('.svc-head'), ...$$('.svc-card'), $('.svc-note')],
      });
    } catch (e) { wash = null; }
    if (!wash) root.classList.add('no-webgl'); else { fitServices(); overWashNow(); }
  }
  // While the live wash is under the bar, the bar drops its backdrop blur (CSS .over-wash: nearly solid instead).
  // The observer follows the section; the wash's own start and finish are checked by hand, since neither moves it.
  const washSection = $('#wash'), stageEl = $('#washStage');
  const overWash = (on) => topbar.classList.toggle('over-wash', !!(on && wash && !wash.done()));
  function overWashNow() {
    const r = washSection.getBoundingClientRect(), m = window.innerHeight * 0.1;
    overWash(r.bottom > m && r.top < window.innerHeight - m);
  }
  new IntersectionObserver((es) => overWash(es[es.length - 1].isIntersecting), { rootMargin: '-10% 0px -10% 0px' }).observe(washSection);
  window.addEventListener('scroll', () => { if (wash && wash.done() && topbar.classList.contains('over-wash')) topbar.classList.remove('over-wash'); }, { passive: true });
  // Under a finger there is no hover: once the cards are revealed, the row scrolled to the middle of the screen is lit.
  let litArmed = false;
  function armLit() {
    if (litArmed || !window.matchMedia('(hover: none)').matches) return;
    litArmed = true;
    const cards = $$('.svc-card'), seen = new Map();
    const lio = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) seen.set(e.target, e.intersectionRatio); else seen.delete(e.target); });
      let best = null;
      seen.forEach((ratio, el) => { if (!best || ratio > seen.get(best)) best = el; });
      cards.forEach((c) => c.classList.toggle('lit', !!best && (c === best || (seen.has(c) && c.offsetTop === best.offsetTop))));
    }, { rootMargin: '-38% 0px -38% 0px', threshold: [0, .25, .5, .75, 1] });
    cards.forEach((c) => lio.observe(c));
  }
  new MutationObserver(() => { if (stageEl.classList.contains('revealed')) armLit(); }).observe(stageEl, { attributes: true, attributeFilter: ['class'] });
  // the services must fit the pinned screen; scale them down on short screens
  function fitServices() {
    const wrap = $('#svcWrap'), box = $('#washServices'), stage = $('#washStage');
    if (!wrap || !box || !stage) return;
    wrap.style.transform = '';
    if (!wash) return;
    const cs = getComputedStyle(box);
    const avail = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const need = wrap.offsetHeight;
    if (avail > 0 && need > avail) wrap.style.transform = 'scale(' + Math.max(0.6, avail / need).toFixed(3) + ')';
  }
  // keyboard users who tab into the services before they're revealed jump to the reveal
  $('#washServices').addEventListener('focusin', () => {
    if (wash && !$('#washStage').classList.contains('revealed')) wash.finish();
  });

  // ---------------------------------------------------------------- the motion system
  // Sections rise in as they enter the screen, children staggered 60ms (capped at 3) within
  // their parent; hairlines draw. Once an element is in, data-rise is dropped so its own hover
  // transitions take over.
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  function reveal(el) {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
    if (el.hasAttribute('data-rise')) setTimeout(() => { el.removeAttribute('data-rise'); el.style.removeProperty('--k'); }, 1000);
  }
  const RISE = ['.why-item', '.step', '.price-card', '.section-head', '.cta-band', '.svc-notes > div', '.group-head', '.standard .emblem', '.standard .statement', '.standard .facts', '.rv', '.appt', '.faq-item', '.about p', '.about-photo', '.tip', '.acct-sec', '.svc-top', '.el-main', '.el-panel', '.show-head', '.rit-scroll', '.bead-cmp', '.bead-foot'];
  function armReveals(scope) {
    $$('[data-reveal]', scope).forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    desyncShine(scope);
    $$('.shine, .scroll-cue', scope).forEach((el) => ioAway.observe(el));
    if (reduce) return;
    const counts = new Map();   // stagger index per parent, so a page is not one long queue
    RISE.forEach((sel) => {
      $$(sel, scope).forEach((el) => {
        if (el.classList.contains('in') || el.hasAttribute('data-rise')) return;
        const k = counts.get(el.parentElement) || 0;
        counts.set(el.parentElement, k + 1);
        el.setAttribute('data-rise', '');
        el.style.setProperty('--k', Math.min(k, 3));
        io.observe(el);
      });
    });
  }
  // What is already on screen when a page opens shows at once, in its stagger, without waiting for the observer.
  function revealAbove(scope) {
    const vh = window.innerHeight;
    $$('[data-rise], [data-reveal]', scope).forEach((el) => {
      if (el.classList.contains('in')) return;
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) { reveal(el); io.unobserve(el); }
    });
  }
  // The gold shines never sweep in lockstep: each gets its own delay, and they rest while offscreen.
  function desyncShine(scope) {
    $$('.shine', scope).forEach((el) => {
      if (el.style.getPropertyValue('--shine-delay')) return;
      const i = shineCount++;
      el.style.setProperty('--shine-delay', (1.2 + (i % 5) * 0.9 + Math.floor(i / 5) * 0.3).toFixed(1) + 's');
    });
  }
  let shineCount = 0;
  const ioAway = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('offscreen', !e.isIntersecting)), { rootMargin: '10% 0px' });

  // Press: one feel for every pressable, from a delegated pointerdown (released 80ms after the pointer lets go).
  const PRESS = '.btn, .icon-btn, .choice-item, .svc-opt, .cal-day, .mini-btn, .link, .gal-tile, .work-item, .el-tile, .rit, .tm-thumb, .adm-tile, .adm-nav a, .appt-head:not(.static), .svc-jump a, .faq-item summary, .menu nav a, .theme-btn, .cal-item';
  let pressedEl = null;
  function release() {
    const el = pressedEl;
    if (!el) return;
    pressedEl = null;
    setTimeout(() => el.classList.remove('pressed'), 80);
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(PRESS);
    if (!el || el.disabled) return;
    release();
    pressedEl = el;
    el.classList.add('pressed');
    el.addEventListener('pointerleave', function leave() { if (pressedEl === el) release(); }, { once: true });
  }, { passive: true });
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });

  // A rim of gold light follows the pointer over cards (--mx/--my), and the hero wordmark's
  // reflection (--hx) follows it across the screen, like light on polished paint.
  const heroEl = $('.hero');
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    let px = 0, py = 0, hxTick = false;
    document.addEventListener('pointermove', (e) => {
      px = e.clientX; py = e.clientY;
      const t = e.target.closest('.price-card, .svc-opt, .why-item, .btn-gold, .appt, .rv, .work-item, .el-tile, .tip');
      if (t) {
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', ((px - r.left) / r.width * 100).toFixed(1) + '%');
        t.style.setProperty('--my', ((py - r.top) / r.height * 100).toFixed(1) + '%');
        t.classList.add('glint');
      }
      if (cur === 'home' && heroEl && !hxTick) {
        hxTick = true;
        requestAnimationFrame(() => {
          hxTick = false;
          const r = heroEl.getBoundingClientRect();
          if (py < r.top || py > r.bottom) return;
          heroEl.style.setProperty('--hx', Math.min(85, Math.max(15, (px - r.left) / r.width * 100)).toFixed(1) + '%');
        });
      }
    }, { passive: true });
    document.addEventListener('pointerout', (e) => { const t = e.target.closest && e.target.closest('.glint'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('glint'); }, { passive: true });
  }
  // The hero text drifts up slower than the page (a light parallax).
  const heroInner = $('.hero-inner');
  if (heroInner && !reduce) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || cur !== 'home') return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 900);
        heroInner.style.transform = 'translateY(' + (y * 0.18).toFixed(1) + 'px)';
        heroInner.style.opacity = String(Math.max(0, 1 - y / 700));
        if (heroEl) heroEl.style.setProperty('--key', (y / 900).toFixed(3));   // the studio's hairline of light slides with the page
        ticking = false;
      });
    }, { passive: true });
  }
  // Light mode (the white studio, doc 29): a toggle in the menu, remembered on this device (the head script
  // applies the saved theme before the first paint). The switch is one 420ms cross-fade of the page: a view
  // transition where the browser has one, otherwise every colour transitions under html.theming (CSS).
  (function theme() {
    let saved = null;
    try { saved = localStorage.getItem('ad.theme'); } catch (e) { /* storage unavailable */ }
    if (saved === 'light') root.setAttribute('data-theme', 'light');
    const btn = $('#themeBtn'), meta = $('meta[name="theme-color"]');
    const isLight = () => root.getAttribute('data-theme') === 'light';
    const paint = () => {
      const light = isLight();
      if (btn) btn.querySelector('span').textContent = light ? 'Dark mode' : 'Light mode';
      if (meta) meta.setAttribute('content', light ? '#faf8f4' : '#000000');
    };
    paint();
    if (!btn) return;
    btn.addEventListener('click', () => {
      const light = !isLight();
      const apply = () => {
        if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
        if (hero && hero.setStudio) hero.setStudio(light);
        paint();
      };
      try { localStorage.setItem('ad.theme', light ? 'light' : 'dark'); } catch (e) { /* storage unavailable */ }
      if (document.startViewTransition && !reduce) {
        const t = document.startViewTransition(apply);
        if (t && t.ready) t.ready.catch(() => { /* a second press skips the first fade: the theme is applied all the same */ });
      } else { root.classList.add('theming'); apply(); setTimeout(() => root.classList.remove('theming'), 500); }
    });
  })();

  // ---------------------------------------------------------------- our work: the home strip opens the gallery's lightbox
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.work-btn');
    if (!btn || !window.AlchemistGallery) return;
    const fig = btn.closest('.work-item');
    if (fig) window.AlchemistGallery.openKey(fig.dataset.key);
  });
  // The strip itself: arrows that step one tile (quiet at the ends), a gold progress line, drag-to-scroll
  // under a mouse (a real drag swallows the click that would open the lightbox), and a slight drift of the
  // pictures against the page scroll.
  (function workStrip() {
    const strip = $('#workStrip'), prev = $('#workPrev'), next = $('#workNext'), bar = $('#workProgress');
    if (!strip) return;
    $$('img', strip).forEach((i) => { i.draggable = false; });
    const step = () => (strip.firstElementChild ? strip.firstElementChild.offsetWidth + 14 : strip.clientWidth);
    function ends() {
      const max = strip.scrollWidth - strip.clientWidth;
      if (prev) prev.disabled = strip.scrollLeft <= 1;
      if (next) next.disabled = strip.scrollLeft >= max - 1;
      if (bar) bar.style.setProperty('--wp', max > 0 ? Math.min(1, (strip.scrollLeft + strip.clientWidth) / strip.scrollWidth).toFixed(3) : '1');
    }
    [prev, next].forEach((b, i) => { if (b) b.addEventListener('click', () => strip.scrollBy({ left: (i ? 1 : -1) * step(), behavior: reduce ? 'auto' : 'smooth' })); });
    let st = false;
    strip.addEventListener('scroll', () => { if (st) return; st = true; requestAnimationFrame(() => { st = false; ends(); }); }, { passive: true });
    window.addEventListener('resize', ends);
    ends();
    if (window.matchMedia('(pointer: fine)').matches) {
      let x0 = 0, s0 = 0, id = null, dragged = false;
      strip.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; x0 = e.clientX; s0 = strip.scrollLeft; id = e.pointerId; dragged = false; });
      strip.addEventListener('pointermove', (e) => {
        if (id !== e.pointerId) return;
        const dx = e.clientX - x0;
        if (!dragged) {
          if (Math.abs(dx) < 6) return;
          dragged = true;
          strip.classList.add('dragging');
          try { strip.setPointerCapture(id); } catch (err) { /* capture unavailable */ }
        }
        strip.scrollLeft = s0 - dx;
      });
      // on release the strip settles on a tile edge: a real pull moves on to the next tile in its direction, a nudge goes
      // back; snapping stays off (.settling) until that scroll has ended, or the browser would re-snap the strip itself
      let settleT = 0;
      const end = (e) => {
        if (id !== e.pointerId) return;
        id = null;
        if (!dragged) return;
        strip.classList.replace('dragging', 'settling');
        const dx = e.clientX - x0, w = step(), at = strip.scrollLeft;
        const target = (Math.abs(dx) < 40 ? Math.round(at / w) : dx < 0 ? Math.ceil(at / w) : Math.floor(at / w)) * w;
        strip.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' });
        clearTimeout(settleT);
        settleT = setTimeout(() => strip.classList.remove('settling'), reduce ? 50 : 700);
      };
      strip.addEventListener('pointerup', end);
      strip.addEventListener('pointercancel', end);
      strip.addEventListener('click', (e) => { if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); } }, true);
    }
    if (!reduce) {
      let tick = false;
      window.addEventListener('scroll', () => {
        if (tick || cur !== 'home') return;
        tick = true;
        requestAnimationFrame(() => {
          tick = false;
          const r = strip.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
          strip.style.setProperty('--py', (p * -14).toFixed(1) + 'px');
        });
      }, { passive: true });
    }
  })();
  // The services page's photo plates drift the same way (-14..14px) while they are on screen.
  (function plates() {
    const plates = $$('.group-plate');
    if (!plates.length || reduce) return;
    let tick = false;
    window.addEventListener('scroll', () => {
      if (tick || cur !== 'services') return;
      tick = true;
      requestAnimationFrame(() => {
        tick = false;
        plates.forEach((pl) => {
          const r = pl.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) return;
          const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
          pl.style.setProperty('--py', (p * -14).toFixed(1) + 'px');
        });
      });
    }, { passive: true });
  })();

  // ---------------------------------------------------------------- the services showroom (built once, the first time the page opens)
  let servicesMounted = false;
  function mountServices() {
    const S = window.AlchemistServices;
    if (servicesMounted || !S) return;
    servicesMounted = true;
    try {
      S.mountTable($('#svc-table'));
      S.mountRitual($('#svc-ritual'));
      S.mountBead($('#svc-bead'));
    } catch (e) { /* the price cards below still carry the menu */ }
  }

  // ---------------------------------------------------------------- focus on the page
  // A new page puts keyboard and screen-reader users on its heading: the page's h1, or main while an app page
  // is still loading (the observer at the end moves them on once the heading lands). A visitor who has moved
  // on meanwhile (into the page, the bar or the menu) is left where they are. The skip link does the same by hand.
  let wantHeading = false, fromEl = null;
  function focusEl(el, scroll) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: !scroll }); }
  function placeFocus(scope) {
    wantHeading = true;
    fromEl = document.activeElement;   // the link or button that brought them here
    requestAnimationFrame(() => { if (!focusHeading(scope) && wantHeading) focusEl(main); });
  }
  function focusHeading(scope) {
    if (!wantHeading) return false;
    const a = document.activeElement;
    if (a && a !== document.body && a !== main && a !== fromEl) { wantHeading = false; return false; }
    const h = scope.querySelector('h1');
    if (!h) return false;
    wantHeading = false;
    focusEl(h);
    return true;
  }

  // ---------------------------------------------------------------- routing
  const memo = {};
  let cur = null;
  function parse() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    const [r, sub] = h.split('-');
    return NAMES[r] ? { r, sub: sub || null } : { r: 'home', sub: null };
  }
  function fillPage(r) {
    const d = PAGES[r];
    $('#pgEyebrow').textContent = d.eyebrow;
    $('#pgTitle').textContent = d.title;
    $('#pgText').textContent = d.text;
    const extra = $('#pgExtra');
    extra.replaceChildren();
    if (d.contact) {
      const box = document.createElement('div');
      box.className = 'contact-lines';
      [['Phone', PHONE], ['Area', 'Parker, Texas'], ['Mobile', 'Within about 10 miles'], ['Hours', ['Mon–Thu 10 AM – 4 PM', 'Fri 10 AM – 12 PM, 5 – 8 PM', 'Sat–Sun 10 AM – 8 PM']]].forEach(([k, v]) => {
        const row = document.createElement('div');
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b');
        [].concat(v).forEach((line, i) => { if (i) b.appendChild(document.createElement('br')); b.appendChild(document.createTextNode(line)); });   // one line per day group
        row.append(a, b);
        box.appendChild(row);
      });
      extra.appendChild(box);
    }
    const prim = $('#pgPrimary');
    const label = d.primary ? d.primary.label : 'Book Now';
    prim.setAttribute('href', d.primary ? d.primary.href : '#book');
    prim.firstChild.textContent = label + ' ';
  }
  function render(first) {
    const { r, sub } = parse();
    const view = ['home', 'services', 'book', 'account', 'appointments', 'admin', 'team', 'reviews', 'gallery'].includes(r) ? r : ['tips', 'faq', 'about'].includes(r) ? 'content' : 'page';
    if (cur) memo[cur] = window.scrollY;
    const changed = r !== cur;
    if (changed) {
      closeMenu(false);
      $$('.view').forEach((v) => {
        const on = v.dataset.view === view;
        v.hidden = !on;
        v.classList.remove('enter');
        if (on && !first && !reduce) {
          void v.offsetWidth;
          v.classList.add('enter');
          v.addEventListener('animationend', function done(e) { if (e.target !== v) return; v.classList.remove('enter'); v.removeEventListener('animationend', done); });
        }
      });
      if (view === 'page') fillPage(r);
      if (view === 'book' && window.AlchemistBooking) window.AlchemistBooking.mount($('#bookApp'));
      if (view === 'account' && window.AlchemistAccount) window.AlchemistAccount.mountAccount($('#accountApp'));
      if (view === 'appointments' && window.AlchemistAccount) window.AlchemistAccount.mountAppointments($('#appointmentsApp'));
      if (view === 'admin' && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
      if (view === 'team' && window.AlchemistTeam) window.AlchemistTeam.mount($('#teamApp'));
      if (view === 'reviews' && window.AlchemistReviews) window.AlchemistReviews.mount($('#reviewsApp'));
      if (view === 'content' && window.AlchemistContent) window.AlchemistContent.mount($('#contentApp'), r);
      if (view === 'gallery' && window.AlchemistGallery) window.AlchemistGallery.mount($('#galleryApp'));
      if (view === 'services') mountServices();
      setName(NAMES[r]);
      $$('nav a', menu).forEach((a) => {
        if (a.getAttribute('href') === '#' + r) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      document.title = r === 'home' ? HOME_TITLE : NAMES[r] + ' · Alchemist Detailing';
    }
    cur = r;
    if (r === 'admin' && !changed && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
    if (r === 'services' && sub) {
      const el = document.getElementById('svc-' + sub);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: changed || reduce ? 'auto' : 'smooth', block: 'start' }));
    } else if (changed && !first) {
      window.scrollTo(0, r === 'home' && memo.home != null ? memo.home : 0);
    }
    if (changed) {
      const scope = $$('.view').find((v) => !v.hidden) || document;
      armReveals(scope);
      revealAbove(scope);
      if (!first) placeFocus(scope);
      requestAnimationFrame(() => {
        if (view === 'home') { fitServices(); if (wash) wash.refresh(); }
        paintArt();
      });
    }
  }
  window.addEventListener('hashchange', () => render(false));

  const veil = $('#veil');
  veil.addEventListener('animationend', () => veil.classList.remove('run'));   // one pass, then the light rests hidden
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    if (a.classList.contains('skip')) {   // skip to content: the open page's heading (its own h1, or main while it loads)
      e.preventDefault();
      const v = $$('.view').find((x) => !x.hidden);
      focusEl((v && v.querySelector('h1')) || main, true);
      return;
    }
    // in-page scrolling on the home page
    if (a.dataset.scroll) {
      e.preventDefault();
      const go = () => {
        let y = 0;
        if (a.dataset.scroll === 'services') y = wash ? wash.progressTo(1) : $('#wash').getBoundingClientRect().top + window.scrollY;
        else y = $('#' + a.dataset.scroll).getBoundingClientRect().top + window.scrollY - 40;
        window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
      };
      if (cur !== 'home') { location.hash = 'home'; setTimeout(go, 60); } else go();
      return;
    }
    const token = a.getAttribute('href').slice(1);
    const r = token.split('-')[0];
    if (!NAMES[r]) return;
    e.preventDefault();
    const wasOpen = menuOpen;
    closeMenu(false);
    const navigate = () => {
      if (location.hash.slice(1) === token) {   // same page: back to its top
        if (!token.includes('-')) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        else render(false);
      } else location.hash = token;
    };
    // Book Now: the button lifts, gold light crosses the screen, booking fades in under the light
    if (r === 'book' && cur !== 'book' && !reduce) {
      if (!wasOpen) a.classList.add('launch');
      veil.classList.remove('run');
      void veil.offsetWidth;
      veil.classList.add('run');
      setTimeout(navigate, 300);
      setTimeout(() => a.classList.remove('launch'), 420);
      return;
    }
    navigate();
  });

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { fitServices(); paintArt(); }, 160);
  });

  render(true);
  desyncShine(document);   // every shine on the site, the hidden pages' too, so none sweep together
  $$('.shine, .scroll-cue').forEach((el) => ioAway.observe(el));
  // The app pages build their content later (once the data layer has answered) and rebuild it as the visitor
  // acts. Their gold buttons are desynced as they appear. The first content with something to reveal that lands
  // in a view is armed like a page open (rises, reveals, rims); a rebuild (a card expanded, a list refreshed)
  // shows whatever it added in its final state at once, so a page's entrance never replays.
  const ARM = '[data-reveal], ' + RISE.join(', ');
  let armT = 0, landed = [];
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) landed.push(n); }));
    if (!landed.length) return;
    cancelAnimationFrame(armT);
    armT = requestAnimationFrame(() => {
      const nodes = landed.filter((n) => n.isConnected);
      landed = [];
      const view = $$('.view').find((v) => !v.hidden) || main;
      focusHeading(view);
      desyncShine(view);
      $$('.shine', view).forEach((el) => ioAway.observe(el));
      if (!nodes.some((n) => n.matches(ARM) || n.querySelector(ARM))) return;
      if (view.dataset.armed) {
        nodes.forEach((n) => (n.matches('[data-reveal]') ? [n] : []).concat($$('[data-reveal]', n)).forEach((el) => { el.classList.add('in', 'settled'); io.unobserve(el); }));
        return;
      }
      view.dataset.armed = '1';
      armReveals(view);
      revealAbove(view);
    });
  }).observe(main, { childList: true, subtree: true });
  // The wash and the still pictures compile their own shaders, a stall that would swallow the hero
  // intro: they start once the intro has played (3.2s), or sooner the moment the visitor moves.
  let heavy = false;
  function startHeavy() {
    if (heavy) return;
    heavy = true;
    startWash();
    if (!wash) armLit();   // nothing to wait for (reduced motion, no WebGL): the cards are already there
    artReady = true;
    paintArt();
  }
  const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 }) : (fn) => setTimeout(fn, 600);
  ['wheel', 'touchstart', 'keydown', 'scroll'].forEach((t) => window.addEventListener(t, () => idle(startHeavy), { once: true, passive: true }));
  setTimeout(() => idle(startHeavy), reduce ? 0 : 3200);
  // after fonts load, sizes settle: fit and paint again
  const settle = () => { fitServices(); if (wash) wash.refresh(); paintArt(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle); else setTimeout(settle, 300);

  // used by the screenshot checks
  window.__alchemist = { get wash() { return wash; }, goTo: (p) => { startHeavy(); if (wash) window.scrollTo(0, wash.progressTo(p)); } };
})();
