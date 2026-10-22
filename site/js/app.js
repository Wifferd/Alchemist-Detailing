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
  const HOME_TITLE = 'Alchemist Detailing · Hand car detailing in Parker, Texas';

  // ---------------------------------------------------------------- hero
  // The headline is split into letters first (so the intro has them from its first frame).
  const unsplit = splitHeadline();
  let hero = null, heroStarted = false;
  // The hero's shader is built the first time home opens (render), not for a visitor who lands on another page.
  function startHero() {
    if (heroStarted) return;
    heroStarted = true;
    root.classList.remove('ready');   // home opened later: its intro waits for this compile too (the head script's 1.5s let it go)
    if (glOk && window.AlchemistHero) {
      const scenes = ['beads', 'gloss'];
      let last = null;
      try { last = localStorage.getItem('ad.hero'); } catch (e) { /* storage unavailable */ }
      let scene = scenes[Math.random() < 0.5 ? 0 : 1];
      if (scene === last) scene = scenes.find((s) => s !== last);
      try { localStorage.setItem('ad.hero', scene); } catch (e) { /* storage unavailable */ }
      // black paint in both themes: the hero is the black showroom in the white studio too (CSS)
      try { hero = window.AlchemistHero.start($('#heroGl'), { scene, still: reduce, studio: false }); } catch (e) { root.classList.add('no-hero-gl'); }
    }
    // The intro waits for the shader: two frames after the hero starts, the compile is behind us,
    // so the first letters are never swallowed by it. (CSS pauses the hero animations until html.ready.)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.add('ready');
      if (unsplit) setTimeout(unsplit, 2000);   // fallback, in case the last letter's animationend never comes
    }));
  }
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

  // ---------------------------------------------------------------- the gold light (one pass at a time)
  // The owner's gold shimmer system: one pass of light across a thing as it arrives or changes, never looping, and
  // never two on the screen together. A pass waits for the one before it, then plays only if its element is still
  // on the screen (and, for one that had to wait, still wanted: when). .au-run while it plays, .au-lit from its
  // start on (what stays lit after the light has gone). The CSS draws it (the gold light); under reduced motion and
  // in forced colours nothing passes. Book Now's .shine is the one light that repeats.
  const AU_MS = { el: 1200, card: 1400, wide: 1800 };   // --au-dur, --au-dur-card, --au-dur-wide
  const light = (() => {
    const off = reduce || window.matchMedia('(forced-colors: active)').matches;
    const q = [];
    let busy = false, timer = 0;
    const onScreen = (el) => {
      if (!el.isConnected) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
    };
    function play(it) {
      busy = true;
      const el = it.el;
      el.classList.remove('au-run');
      void el.offsetWidth;
      el.classList.add('au-run', 'au-lit');
      setTimeout(() => { el.classList.remove('au-run'); busy = false; setTimeout(next, 120); }, it.ms + 60);
    }
    function next() {
      clearTimeout(timer);
      while (!busy && q.length) {
        const it = q[0], wait = it.at - performance.now();
        if (wait > 0) { timer = setTimeout(next, wait); return; }
        q.shift();
        if (onScreen(it.el) && (!it.when || it.when())) play(it);
        else if (it.miss) it.miss();
      }
    }
    return {
      // o: { delay (ms), size ('el', 'card', 'wide'), when (still wanted, if it had to wait), miss (it could not play) }
      pass(el, o) {
        o = o || {};
        if (off || !el || el.classList.contains('au-run') || q.some((it) => it.el === el)) return;
        const it = { el, at: performance.now() + (o.delay || 0), ms: AU_MS[o.size] || AU_MS.el, when: o.when, miss: o.miss };
        if (!busy && !q.length && !o.delay && onScreen(el)) { play(it); return; }   // nothing ahead of it: at once
        q.push(it);
        next();
      },
    };
  })();
  window.AlchemistLight = light;
  // Arrivals: the Services header, a brand page's title, the Gold client card and the Exterior and Bundles photo
  // plates get their pass once a third of them is on the screen, after their own entrance has landed. One that
  // scrolled away before its turn gets it when it comes back. (An appointment takes its pass when it is first
  // opened: account.js.)
  const ARRIVE = '.svc-top, .book-page .page-head h1, .gold-card, .group-plate.polish';
  const arriveIo = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    arriveIo.unobserve(el);
    light.pass(el, { delay: el.matches('.svc-top') ? 650 : 450, size: el.matches('.group-plate, .svc-top') ? 'wide' : 'el', miss: () => arriveIo.observe(el) });
  }), { threshold: 0.35 });

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
  const holdPage = (on) => { if (window.AlchemistUI) window.AlchemistUI.holdPage(on); else document.body.style.overflow = on ? 'hidden' : ''; };   // ui.js: no sideways jolt from the scroll bar
  // On a short screen the list scrolls between the menu's head and foot (alchemist.css): it fades out at the foot
  // while more of it is below, and under the head while some of it is above; it opens with the current page's item in view.
  const menuNav = $('nav', menu);
  const fadeNav = () => {
    menuNav.classList.toggle('more', menuNav.scrollHeight - menuNav.scrollTop - menuNav.clientHeight > 2);
    menuNav.classList.toggle('above', menuNav.scrollTop > 2);
  };
  function fitNav() {
    menuNav.scrollTop = 0;
    const here = $('a[aria-current="page"]', menuNav);
    if (here && here.offsetParent && menuNav.scrollHeight > menuNav.clientHeight) {
      const below = here.getBoundingClientRect().bottom - menuNav.getBoundingClientRect().bottom;
      if (below > -44) menuNav.scrollTop = below + 44;   // clear of the fade
    }
    fadeNav();
  }
  menuNav.addEventListener('scroll', fadeNav, { passive: true });
  window.addEventListener('resize', () => { if (menuOpen) fadeNav(); });
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
    holdPage(true);
    fitNav();
    if (hero && hero.pause) hero.pause();
    setTimeout(() => { const a = (menuNav.scrollTop > 0 && $('a[aria-current="page"]', menuNav)) || $('a', menuNav); if (a) a.focus({ preventScroll: true }); }, reduce ? 0 : 380);   // the first item, or the current one when the list opened scrolled to it
    // the page you are on takes the gold light once its item has slid in (110ms press, 140ms + 28ms a step, .45s)
    const here = $('nav a[aria-current="page"]', menu);
    if (here) light.pass(here, { delay: 250 + 28 * (parseInt(here.style.getPropertyValue('--i'), 10) || 0) + 450, when: () => menuOpen });
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
    holdPage(false);
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
  let artHold = false;   // the Bead moment on Services is drawing through the stills' context: they wait for it
  function paintArt() {
    if (!artReady || artHold || !glOk || !window.AlchemistHero) return;
    artQueue = $$('canvas[data-art]').filter((c) => c.offsetParent !== null || c.closest('.wash-stage'));
    if (!artBusy) nextArt();
  }
  function nextArt() {
    if (artHold) { artBusy = false; return; }
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
            c.getContext('2d').drawImage(src, 0, src.height - H, W, H, 0, 0, W, H);   // the picture is the canvas's lower left corner
            if (!c.dataset.done) { c.dataset.done = '1'; c.dispatchEvent(new Event('painted')); }   // the Interior moment waits for its leather
          }
        } catch (e) { /* keep the CSS background */ }
      }
    }
    requestAnimationFrame(nextArt);
  }

  // ---------------------------------------------------------------- the wash
  let wash = null, washPin = null;   // washPin: the pinned section's fold when the wash itself could not start
  function startWash() {
    if (!glOk || reduce || !window.AlchemistWash) return;
    try {
      wash = window.AlchemistWash.start({
        section: $('#wash'), stage: $('#washStage'), canvas: $('#foamGl'), cannon: $('#cannon'),
        tip: $('#nozTip'), back: $('#nozBack'), adaptive: !/[?&]noadapt/.test(location.search), reveal: [$('.svc-head'), ...$$('.svc-card'), $('.svc-note')],
      });
    } catch (e) { wash = null; }
    if (!wash) noWash(); else { fitServices(); overWashNow(); }
  }
  // The wash could not start (a shader that won't build): before the visitor reaches it, the plain no-WebGL section;
  // once they are in it or past it (the wash starts after the first touch), html.no-webgl would collapse the section
  // under them, so the services show in the stage instead and the pinned length goes like a finished wash's.
  function noWash() {
    const s = $('#wash'), st = $('#washStage'), A = window.AlchemistWash;
    if (s.getBoundingClientRect().top >= 0 || !A || !A.pinFold) { root.classList.add('no-webgl'); return; }
    s.classList.add('static');
    st.classList.add('revealed');
    washPin = A.pinFold(s, st);
    washPin.arm();
    washPin.ready();
    fitServices();
  }
  // While the live wash is under the bar, the bar drops its backdrop blur (CSS .over-wash: nearly solid instead).
  // The observer follows the section; the wash's start is checked by hand (it does not move the section), and its end
  // comes as the washend event.
  const washSection = $('#wash'), stageEl = $('#washStage');
  const overWash = (on) => topbar.classList.toggle('over-wash', !!(on && wash && wash.live()));
  function overWashNow() {
    const r = washSection.getBoundingClientRect(), m = window.innerHeight * 0.1;
    overWash(r.bottom > m && r.top < window.innerHeight - m);
  }
  new IntersectionObserver((es) => overWash(es[es.length - 1].isIntersecting), { rootMargin: '-10% 0px -10% 0px' }).observe(washSection);
  washSection.addEventListener('washend', () => topbar.classList.remove('over-wash'));   // the canvas has stopped for good
  // While a dark piece is under the bar (the black hero, the Services header's photo), .over-dark: in the white studio
  // the bar goes nearly solid ivory there (CSS), so it never reads as a grey band. The observed strip is the top tenth
  // of the screen, the bar's; the two are on different pages, so whichever is in it counts.
  const darkTops = [$('.hero'), $('.svc-top')].filter(Boolean), underBar = new Set();
  const darkIo = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) underBar.add(e.target); else underBar.delete(e.target); });
    topbar.classList.toggle('over-dark', underBar.size > 0);
  }, { rootMargin: '0px 0px -90% 0px' });
  darkTops.forEach((el) => darkIo.observe(el));
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
      cards.forEach((c) => {
        const on = !!best && (c === best || (seen.has(c) && c.offsetTop === best.offsetTop));
        c.classList.toggle('lit', on);
        if (on) sweepCard(c);
      });
    }, { rootMargin: '-38% 0px -38% 0px', threshold: [0, .25, .5, .75, 1] });
    cards.forEach((c) => lio.observe(c));
  }
  // The first time a card is lit (a pointer, the keyboard, or the row under a finger) one line of light crosses its
  // photo, and never again on this visit; a card that had to wait plays only if it is still lit by then.
  function sweepCard(c) {
    if (!c.classList.contains('au-lit')) light.pass(c, { size: 'card', when: () => c.matches(':hover, :focus-visible, .lit') });
  }
  $$('.svc-card').forEach((c) => {
    c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') sweepCard(c); });
    c.addEventListener('focus', () => { if (c.matches(':focus-visible')) sweepCard(c); });
  });
  new MutationObserver(() => { if (stageEl.classList.contains('revealed')) armLit(); }).observe(stageEl, { attributes: true, attributeFilter: ['class'] });
  // the services must fit the pinned screen; scale them down on short screens
  function fitServices() {
    const wrap = $('#svcWrap'), box = $('#washServices'), stage = $('#washStage');
    if (!wrap || !box || !stage) return;
    wrap.style.transform = '';
    if (!wash && !washPin) return;
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
  // transitions take over. A block rises when 15% of it is in, or 24px of it for a tall one (a price card on a short
  // phone, landed on by a jump, shows only its top and would otherwise wait for a scroll that never comes).
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting && (e.intersectionRatio >= 0.15 || e.intersectionRect.height >= 24)) { reveal(e.target); io.unobserve(e.target); } });
  }, { threshold: [0, 0.02, 0.05, 0.1, 0.15], rootMargin: '0px 0px -8% 0px' });
  function reveal(el) {
    if (el.classList.contains('in')) return;
    el.classList.add('in');
    if (el.hasAttribute('data-rise')) setTimeout(() => { el.removeAttribute('data-rise'); el.style.removeProperty('--k'); }, 1000);
  }
  // a block that the keyboard reaches before it has risen is shown at once, with no fade, so a focus ring is never
  // unseen (a click's or a page change's focus is not :focus-visible: those blocks still rise as they enter)
  document.addEventListener('focusin', (e) => {
    let kb = false;
    try { kb = e.target.matches(':focus-visible'); } catch (err) { /* older browsers: they rise as before */ }
    if (!kb) return;
    for (let r = e.target.closest('[data-rise]:not(.in)'); r; r = r.parentElement && r.parentElement.closest('[data-rise]:not(.in)')) {
      r.style.transition = 'none';
      reveal(r); io.unobserve(r);
      getComputedStyle(r).opacity;   // the shown state lands now, so the transition can come back without playing
      r.style.removeProperty('transition');
    }
  });
  const RISE = ['.why-item', '.door', '.feat-foot', '.step', '.price-card', '.section-head', '.cta-band', '.svc-notes > div', '.group-head', '.standard .emblem', '.standard .statement', '.standard .facts', '.rv', '.appt', '.faq-item', '.about p', '.about-use', '.ct-block', '.tip', '.acct-sec', '.svc-top', '.el-main', '.el-panel', '.show-head', '.rit-scroll', '.bead-cmp', '.bead-foot', '.addons', '.step-up'];
  function armReveals(scope) {
    $$('[data-reveal]', scope).forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    desyncShine(scope);
    $$('.shine, .scroll-cue', scope).forEach((el) => ioAway.observe(el));
    if (reduce) return;
    $$(ARRIVE, scope).forEach((el) => { if (!el.classList.contains('au-lit')) arriveIo.observe(el); });
    $$(COUNT, scope).forEach((el) => { if (!el.dataset.counted) countIo.observe(el); });
    const counts = new Map();   // stagger index per parent, so a page is not one long queue
    RISE.forEach((sel) => {
      $$(sel, scope).forEach((el) => {
        if (el.classList.contains('in') || el.hasAttribute('data-rise')) return;
        if (el.closest('#adminApp, #teamApp')) return;   // the staff consoles are tools: their rows are simply there (owner §26, §29)
        const k = counts.get(el.parentElement) || 0;
        counts.set(el.parentElement, k + 1);
        el.setAttribute('data-rise', '');
        el.style.setProperty('--k', Math.min(k, 3));
        io.observe(el);
      });
    });
  }
  // Numbers count upward (animation §19): a time, a mobile charge or the History count runs up from 0 once, over
  // 600ms, when it is fully on screen. The real figure is in the page from the start (the layout and a screen reader
  // read it; it is only unseen meanwhile) and an aria-hidden copy counts over it, from the figure as it stands then
  // (the database's once the menu has answered); should the figure change meanwhile, the copy goes at once. Prices
  // never count. Not under reduced motion (armReveals stops before this).
  const COUNT = '.figs dd[data-time], .figs dd[data-mobile], .el-facts b:not(.price), .hist-fig b';
  const countIo = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { countIo.unobserve(e.target); countUp(e.target); } }), { threshold: 1, rootMargin: '0px 0px -8% 0px' });
  // the figure at p (0 to 1) of the way up: minutes, hours in halves (½ h, 1 h, 1½ h), a percentage with its own
  // decimals, a count; anything else (2 h 15 min, a dash) doesn't count
  function counter(t) {
    let m;
    if ((m = /^(\+?)(\d+)(½)? h$/.exec(t))) {
      const n = +m[2] * 2 + (m[3] ? 1 : 0);
      return (p) => { const k = Math.round(n * p), h = Math.floor(k / 2); return m[1] + (h || k % 2 ? (h || '') + (k % 2 ? '½' : '') : '0') + ' h'; };
    }
    if ((m = /^(\+?)(\d+) min$/.exec(t))) return (p) => m[1] + Math.round(+m[2] * p) + ' min';
    if ((m = /^(\+?)(\d+)(?:\.(\d+))?%$/.exec(t))) { const v = parseFloat(m[2] + '.' + (m[3] || '0')), d = (m[3] || '').length; return (p) => m[1] + (v * p).toFixed(d) + '%'; }
    if ((m = /^(\d+)$/.exec(t))) return (p) => String(Math.round(+m[1] * p));
    return null;
  }
  function countUp(n) {
    if (n.dataset.counted) return;
    n.dataset.counted = '1';
    const f = counter(n.textContent.trim());
    if (!f) return;
    const copy = document.createElement('span');
    copy.className = 'count-fig';
    copy.setAttribute('aria-hidden', 'true');
    copy.style.color = getComputedStyle(n).color;
    n.classList.add('counting');
    n.style.color = 'transparent';
    n.appendChild(copy);
    const t0 = performance.now(), ease = (x) => 1 - Math.pow(1 - x, 3);   // a calm ease-out, like --ease
    const done = () => { copy.remove(); n.classList.remove('counting'); n.style.removeProperty('color'); };
    (function frame(now) {
      if (!copy.isConnected) return done();   // the figure was written again (the menu answered): it shows as it is
      const p = Math.min(1, Math.max(0, (now - t0) / 600));
      copy.textContent = f(ease(p));
      if (p < 1) requestAnimationFrame(frame); else done();
    })(t0);
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
  const PRESS = '.btn, .icon-btn, .choice-item, .svc-opt, .cal-day, .mini-btn, .link, .gal-tile, .work-item, .door, .el-tile, .rit, .tm-thumb, .adm-tile, .adm-nav a, .appt-head:not(.static), .svc-jump a, .faq-item summary, .menu nav a, .theme-btn, .cal-item';
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
      const t = e.target.closest('.price-card, .svc-opt, .why-item, .btn-gold, .appt, .rv, .work-item, .el-tile, .door');
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
    // a photo reached by Tab comes fully into view, on its own snap start (the browser leaves a half-shown one where it is);
    // a click's focus is not :focus-visible, so a mouse drag is never fought
    strip.addEventListener('focusin', (e) => {
      const it = e.target.closest('.work-item');
      let kb = true;
      try { kb = e.target.matches(':focus-visible'); } catch (err) { /* older browsers: treat it as the keyboard */ }
      if (!it || !kb) return;
      const pad = parseFloat(getComputedStyle(strip).scrollPaddingLeft) || 0, r = it.getBoundingClientRect(), s = strip.getBoundingClientRect();
      if (r.left < s.left + pad - 1 || r.right > s.right - pad + 1) strip.scrollTo({ left: strip.scrollLeft + r.left - s.left - pad, behavior: reduce ? 'auto' : 'smooth' });
    });
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
  // ---------------------------------------------------------------- home, after Our work: the featured review and two doorways
  // The doorways quote the approved Tips and About words (content.js); the review slot stays empty until the owner
  // has approved a real review (reviews.js asks once, as the visitor nears Why Alchemist).
  if (window.AlchemistContent && window.AlchemistContent.mountDoors) window.AlchemistContent.mountDoors($('#doors'));
  if (window.AlchemistReviews && window.AlchemistReviews.mountFeatured) window.AlchemistReviews.mountFeatured($('#featured'), $('#why'));
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

  // ---------------------------------------------------------------- the services plates' moments (one each, played once)
  // Protection beads up live and Interior's cabin lights up, each the first time its plate comes on the screen. Under
  // reduced motion and in forced colours neither plays: the plates show their still pictures and titles, as before.
  const calm = reduce || window.matchMedia('(forced-colors: active)').matches;
  const onceSeen = (el, o, fn) => {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, o);
    io.observe(el);
  };
  // Protection (the owner's §11): at 40% on the screen the paint beads up live. Drops appear and bead up (2.2s), the
  // gold light passes through them (1.6s) while a few roll down, then the canvas gives way to the real photo of
  // beading (.8s) and the title rises. It is drawn through the stills' context by their own program (the stills wait
  // while it is on the screen), at the Interior leather's size, which that canvas already has: nothing to compile,
  // no resize, nothing in it waits for the GPU process, and nothing to let go afterwards. It draws only while the
  // plate is on the screen and stops for good once the photo is back. On a page that has only just opened here
  // (#services-protection), before the stills' context is up, it waits at most 300ms, then the photo fades in and
  // the title rises. A context lost on the way ends it at once: the photo and the title.
  (function beading() {
    const plate = $('#svc-protection .group-plate');
    if (!plate || calm || !glOk || !window.AlchemistHero) return;
    plate.classList.add('beading');
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const span = (secs, a, b) => Math.min(1, Math.max(0, (secs - a) / (b - a)));
    let cv = null, raf = 0, t0 = 0, last = 0, seen = true, done = false, W = 2, H = 2, range = 0.5, v0 = 0.5, v1 = 0.5;
    const watch = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; });
    function stopFrames() {
      cancelAnimationFrame(raf);
      watch.disconnect();
      if (cv) { cv.remove(); cv.classList.remove('live'); cv.removeAttribute('style'); cv = null; }
      if (artHold) { artHold = false; paintArt(); }
    }
    function end() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      stopFrames();
      plate.classList.remove('beading', 'crossing', 'risen', 'quick');
    }
    // no moment: the photo fades in from the black paint and the title rises
    function reveal() {
      if (done) return;
      done = true;
      plate.classList.add('quick', 'crossing', 'risen');
      later(1000, () => plate.classList.remove('beading', 'crossing', 'risen', 'quick'));
    }
    const at = (secs) => ({ live: true, studio: false, intro: (secs - 0.3) / 1.6, form: 1 - Math.pow(1 - span(secs, 0.2, 2.4), 3), sweep: v0 + (v1 - v0) * ease(span(secs, 1.2, 2.8)), sweepRange: range, roll: span(secs, 1.6, 3.6) });
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!seen || document.hidden || now - last < (small ? 31 : 15)) return;   // 30 fps on a phone, 60 elsewhere
      last = now;
      const secs = (now - t0) / 1000;
      if (window.AlchemistHero.art('beads', W, H, 13.7 + secs, at(secs)) !== cv) end();   // the context was lost
    }
    function play(room) {
      // the paint below the screen's resolution, soft and fast: at the Interior leather's scale (its data-k .6; the
      // plates are the same size), kept within the stills' canvas as it is (should the plate have grown since)
      const dpr = Math.min(window.devicePixelRatio || 1, 2), k = Math.min(0.6, room[0] / (plate.clientWidth * dpr), room[1] / (plate.clientHeight * dpr));
      W = Math.max(2, Math.floor(plate.clientWidth * dpr * k));
      H = Math.max(2, Math.floor(plate.clientHeight * dpr * k));
      // the light comes up in the left third of the paint, then passes through the drops to rest right of the middle:
      // its travel follows the plate's shape (ext: the paint's half-width along the light's axis in the shader's units;
      // at this time of the scene the bar's own drift holds it near -0.3)
      const ext = 0.675 * (W / H * 0.82 + 0.57), from = -0.55 * ext + 0.3, to = 0.5 * ext + 0.3;
      range = 2 * Math.max(-from, to);
      v0 = 0.5 + from / range;
      v1 = 0.5 + to / range;
      artHold = true;   // the stills wait while the canvas is on the screen
      try { cv = window.AlchemistHero.art('beads', W, H, 13.7, at(0)); } catch (e) { cv = null; }
      if (!cv) { end(); return; }
      cv.classList.add('live');
      cv.setAttribute('aria-hidden', 'true');
      // the paint is the canvas's lower left W x H corner: sized so that corner fills the plate (which clips the rest)
      cv.style.width = (100 * cv.width / W) + '%';
      cv.style.height = (100 * cv.height / H) + '%';
      plate.insertBefore(cv, plate.querySelector('figcaption'));
      watch.observe(plate);
      t0 = last = performance.now();
      raf = requestAnimationFrame(frame);
      later(3100, () => plate.classList.add('crossing'));
      later(3600, () => plate.classList.add('risen'));
      later(4000, stopFrames);
      later(4800, () => { done = true; plate.classList.remove('beading', 'crossing', 'risen'); });
    }
    onceSeen(plate, { threshold: 0.4 }, () => {
      const t = performance.now();
      (function go() {
        if (done) return;
        const room = artReady && !artBusy && plate.clientWidth && window.AlchemistHero.artRoom();
        if (room) play(room);
        else if (performance.now() - t > 300) reveal();
        else later(50, go);
      })();
    });
  })();
  // Interior (the owner's §12): the plate starts nearly black; at 35% on the screen, once its leather is painted, a
  // soft warm light crosses the quilting diagonally (1.4s), the cabin comes up to its lit state, then INTERIOR rises
  // and, 200ms later, the owner's line. CSS draws it with transforms and opacity.
  (function cabin() {
    const plate = $('#svc-interior .group-plate');
    if (!plate || calm) return;
    const leather = $('canvas[data-art]', plate);
    ['cabin-dark', 'cabin-glow'].forEach((k) => {
      const s = document.createElement('span');
      s.className = k;
      s.setAttribute('aria-hidden', 'true');
      plate.insertBefore(s, plate.querySelector('figcaption'));
    });
    plate.classList.add('cabin');
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      plate.classList.add('on');
      setTimeout(() => { $$('.cabin-dark, .cabin-glow', plate).forEach((s) => s.remove()); plate.classList.remove('cabin', 'on'); }, 3000);
    };
    onceSeen(plate, { threshold: 0.35 }, () => {
      if (!glOk || !leather || leather.dataset.done) { play(); return; }
      leather.addEventListener('painted', play, { once: true });
      setTimeout(play, 2500);   // the stills never came: light it all the same
    });
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
      S.mountLineup($('#svc-bundles .lineup'));
      S.syncMenu();   // every price, time and mobile charge on the page (and on the home cards) from the database
    } catch (e) { /* the price cards below still carry the menu */ }
  }
  // Home's service cards take their "From" prices from the database too, when the visitor nears Why Alchemist (when
  // the featured review asks it, after the wash: never while its shaders are being built)
  if (window.AlchemistServices && window.AlchemistServices.syncMenu && $('#why')) onceSeen($('#why'), { rootMargin: '0px 0px 100% 0px' }, () => window.AlchemistServices.syncMenu());

  // ---------------------------------------------------------------- the services chapter bar
  // The four groups' links, docked across the header's foot; once the header has gone the bar is held under the top
  // bar (CSS sticky). One gold line marks the group crossing the middle of the screen (aria-current) and slides from
  // link to link; on a phone the row scrolls sideways to keep it in view. Scrolling down slides the bar away under the
  // top bar and the first move up brings it back; it stays while it has the focus and while a jump it started is
  // under way, and goes while the menu is open. Only the visitor's own scrolling sends it away (a wheel, a finger, a
  // key or a press in the last moment): the router's jumps, a late layout and scroll anchoring never do. Work is done
  // only on scroll, and only on the services page.
  let chapterHold = () => {};   // the router calls it just before it scrolls to a group
  (function chapters() {
    const bar = $('#svcJump'), top = $('.svc-top');
    if (!bar || !top) return;
    const row = $('.svc-jump-row', bar), ink = $('.svc-jump-ink', bar), links = $$('a[data-group]', bar);
    const groups = links.map((a) => document.getElementById(a.dataset.group));
    let at = -1, lastY = window.scrollY, held = performance.now() + 1200, tick = false, stickAt = 0, felt = -1e9;
    const measure = () => { stickAt = parseFloat(getComputedStyle(bar).top) || 0; };
    function place(a) {
      if (!a) { bar.classList.remove('marked'); return; }
      // under the link's words (on a phone the links share out the row's spare width, their words centred)
      const words = document.createRange();
      words.selectNodeContents(a);
      const t = words.getBoundingClientRect(), box = row.getBoundingClientRect();
      const first = !bar.classList.contains('marked');
      if (first) ink.style.transition = 'none';   // the first mark appears in place; later ones slide
      ink.style.setProperty('--x', (t.left - box.left + row.scrollLeft).toFixed(1) + 'px');
      ink.style.setProperty('--w', Math.max(1, t.width).toFixed(1));
      if (first) { void ink.offsetWidth; ink.style.transition = ''; }
      bar.classList.add('marked');
    }
    function edges() {
      const max = row.scrollWidth - row.clientWidth;
      row.style.setProperty('--fl', row.scrollLeft > 2 ? '28px' : '0px');
      row.style.setProperty('--fr', max - row.scrollLeft > 2 ? '28px' : '0px');
    }
    function mark() {
      // the last group whose top has passed 42% of the screen; none above the first (the Table), the last below the end
      const line = window.innerHeight * 0.42;
      let i = -1;
      groups.forEach((g, k) => { if (g && g.getBoundingClientRect().top <= line) i = k; });
      if (i === at) return;
      at = i;
      links.forEach((a, k) => { if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      const a = links[i];
      place(a);
      if (row.scrollWidth > row.clientWidth + 1) row.scrollTo({ left: a ? a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2 : 0, behavior: reduce ? 'auto' : 'smooth' });
    }
    function frame() {
      tick = false;
      if (cur !== 'services') return;
      const y = window.scrollY, dy = y - lastY;
      lastY = y;
      const stuck = top.getBoundingClientRect().bottom - bar.offsetHeight / 2 < stickAt + 1;
      // past Protection (the notes and the footer) there is no group to mark, and the page's end would push the bar
      // half out from under the top bar: it slides away, and comes back on the way up as usual
      const lastGroup = groups[groups.length - 1];
      const past = !!lastGroup && lastGroup.getBoundingClientRect().bottom < stickAt + bar.offsetHeight;
      let away = bar.classList.contains('away');
      if (!stuck || performance.now() < held || bar.contains(document.activeElement)) away = false;
      else if (past) away = true;
      else if (dy > 4 && performance.now() - felt < 700) away = true;
      else if (dy < -4) away = false;
      bar.classList.toggle('away', away);
      bar.classList.toggle('stuck', stuck);   // held under the top bar: the two bars cover the page between them (CSS)
      mark();
    }
    const soon = () => { if (!tick) { tick = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', soon, { passive: true });
    const touched = () => { felt = performance.now(); };
    ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((t) => window.addEventListener(t, touched, { passive: true, capture: true }));
    // a page or a group opened (a link here, a card on home): the bar stays while the page gets there
    const hold = () => { held = performance.now() + 1200; };
    chapterHold = hold;
    window.addEventListener('hashchange', () => { hold(); requestAnimationFrame(() => { lastY = window.scrollY; edges(); soon(); }); });
    bar.addEventListener('click', hold);   // the same group again: no hashchange, the page still scrolls there
    bar.addEventListener('focusin', () => bar.classList.remove('away'));
    row.addEventListener('scroll', edges, { passive: true });
    new MutationObserver(() => bar.classList.toggle('menu-away', menu.classList.contains('on'))).observe(menu, { attributes: true, attributeFilter: ['class'] });
    const again = () => { measure(); edges(); if (at >= 0) place(links[at]); soon(); };
    window.addEventListener('resize', again);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(again);
    measure();
    requestAnimationFrame(again);
  })();

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
    const h = scope.querySelector('[data-land]') || scope.querySelector('h1');   // data-land: a question the page asks first (the booking's)
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
  function render(first) {
    const { r, sub } = parse();
    // Leaving home with the wash finished: its pinned length goes now, while home is still laid out (every rect is
    // zero once it is hidden), with no scroll; home's position is stored in the shorter layout.
    const shift = cur === 'home' && r !== 'home' ? (wash ? wash.foldNow({ scroll: false }) : washPin ? washPin.now({ scroll: false }) : 0) : 0;
    const view = ['tips', 'faq', 'about', 'contact'].includes(r) ? 'content' : r;   // every other route has its own view
    if (cur) memo[cur] = window.scrollY + shift;
    const changed = r !== cur;
    if (changed) {
      closeMenu(false);
      if (cur === 'gallery' && window.AlchemistGallery && window.AlchemistGallery.unmount) window.AlchemistGallery.unmount();   // its scroll drift stops with the page
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
      // #book-ed and the like: a service chosen on Services (the Table's symbols), taken into the booking
      if (view === 'book' && window.AlchemistBooking) window.AlchemistBooking.mount($('#bookApp'), { pick: sub });
      if (view === 'account' && window.AlchemistAccount) window.AlchemistAccount.mountAccount($('#accountApp'));
      if (view === 'appointments' && window.AlchemistAccount) window.AlchemistAccount.mountAppointments($('#appointmentsApp'));
      if (view === 'admin' && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
      if (view === 'team' && window.AlchemistTeam) window.AlchemistTeam.mount($('#teamApp'));
      if (view === 'reviews' && window.AlchemistReviews) window.AlchemistReviews.mount($('#reviewsApp'));
      if (view === 'content' && window.AlchemistContent) window.AlchemistContent.mount($('#contentApp'), r);
      if (view === 'gallery' && window.AlchemistGallery) window.AlchemistGallery.mount($('#galleryApp'));
      if (view === 'services') mountServices();
      if (view === 'home') startHero();
      setName(NAMES[r]);
      if (footer) footer.classList.toggle('lean', r === 'contact');   // Contact carries the place, hours and phone itself: the footer keeps the brand and the pages
      if (footer) footer.classList.toggle('staff', r === 'admin' || r === 'team');   // the staff consoles are tools: one quiet line, no marketing footer (owner §26, §36)
      $$('nav a', menu).forEach((a) => {
        if (a.getAttribute('href') === '#' + r) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      document.title = r === 'home' ? HOME_TITLE : NAMES[r] + ' · Alchemist Detailing';
    }
    cur = r;
    if (r === 'admin' && !changed && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
    if (r === 'book' && !changed && sub && window.AlchemistBooking) window.AlchemistBooking.offer(sub);   // already booking: offered, never forced
    if (r === 'services' && sub) {
      const el = document.getElementById('svc-' + sub);
      if (el) requestAnimationFrame(() => { chapterHold(); el.scrollIntoView({ behavior: changed || reduce ? 'auto' : 'smooth', block: 'start' }); });
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
        if (a.dataset.scroll === 'services') {
          if (!heavy) startHeavy();                  // tapped in the first seconds: the wash plays on the way down
          if (washPin) washPin.now();
          y = wash ? wash.progressTo(1) : $('#wash').getBoundingClientRect().top + window.scrollY;
        }
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
        if (!token.includes('-')) {
          if (cur === 'home') { if (wash) wash.foldNow(); else if (washPin) washPin.now(); }   // a click: the pinned length goes first
          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        } else render(false);
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
  if (heroEl) ioAway.observe(heroEl);   // the wordmark's drift (a finger's screen) rests below the hero (CSS)
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
      // the booking step just reached (.fresh, booking.js) takes the gold light: along the line into it, then its number
      nodes.forEach((n) => (n.matches('.bk-progress') ? [n] : $$('.bk-progress', n)).forEach((ol) => { const li = $('li.current.fresh', ol); if (li) light.pass(li, { delay: 200 }); }));
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
  // The Services header's photo waits (loading="lazy") while its page is hidden, so the first page doesn't pay for it;
  // once that page has settled it is fetched in the background, and Services opens on it at once.
  const topPhoto = $('.top-photo');
  if (topPhoto) setTimeout(() => idle(() => { topPhoto.loading = 'eager'; }), 6000);
  // after fonts load, sizes settle: fit and paint again
  const settle = () => { fitServices(); if (wash) wash.refresh(); paintArt(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle); else setTimeout(settle, 300);

  // used by the screenshot checks
  window.__alchemist = { get wash() { return wash; }, goTo: (p) => { startHeavy(); if (!wash) return; if (p >= wash.state().rel) wash.finish(); else window.scrollTo(0, wash.progressTo(p)); } };
})();
