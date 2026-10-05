/* Alchemist Detailing — page behaviour: the menu, one-page routing with the
   bar's page name, the hero scene, still pictures for the service cards, the
   wash, and the gold transition into booking. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glOk = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch (e) { return false; } })();
  if (!glOk) root.classList.add('no-webgl');

  const NAMES = { home: 'Home', services: 'Services', book: 'Book', appointments: 'Appointments', reviews: 'Reviews', tips: 'Tips', faq: 'FAQ', about: 'About', contact: 'Contact', account: 'Account', admin: 'Admin', team: 'Team' };
  const PHONE = '(945) 361-7551', TEL = 'tel:+19453617551';
  // Pages that come later in the build. Nothing here is a feature that exists yet.
  const PAGES = {
    tips: { eyebrow: 'Car care', title: 'Tips', text: 'Advice on keeping your car clean and protected between details is coming soon.' },
    faq: { eyebrow: 'Questions', title: 'FAQ', text: 'Answers to common questions are coming soon. Until then, call ' + PHONE + '.' },
    about: { eyebrow: 'Our story', title: 'About', text: 'The Alchemist story is coming soon.' },
    contact: { eyebrow: 'Get in touch', title: 'Contact', text: 'Call to book or to ask a question.', contact: true, primary: { href: TEL, label: 'Call ' + PHONE } },
  };

  // ---------------------------------------------------------------- hero
  if (glOk && window.AlchemistHero) {
    const scenes = ['beads', 'gloss'];
    let last = null;
    try { last = localStorage.getItem('ad.hero'); } catch (e) { /* storage unavailable */ }
    let scene = scenes[Math.random() < 0.5 ? 0 : 1];
    if (scene === last) scene = scenes.find((s) => s !== last);
    try { localStorage.setItem('ad.hero', scene); } catch (e) { /* storage unavailable */ }
    try { window.AlchemistHero.start($('#heroGl'), { scene, still: reduce }); } catch (e) { root.classList.add('no-hero-gl'); }
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
  const footer = $('.footer');
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
    if (footer) footer.inert = true;
    root.style.overflow = 'hidden';
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
    if (footer) footer.inert = false;
    root.style.overflow = '';
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
  const topbar = $('#topbar');
  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------------------------------------------------------------- still pictures (cards, backgrounds)
  let artQueue = [];
  let artBusy = false;
  function paintArt() {
    if (!glOk || !window.AlchemistHero) return;
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
          const src = window.AlchemistHero.art(c.dataset.art, W, H, +(c.dataset.t || 10));
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
  if (glOk && !reduce && window.AlchemistWash) {
    try {
      wash = window.AlchemistWash.start({
        section: $('#wash'), stage: $('#washStage'), canvas: $('#foamGl'), cannon: $('#cannon'),
        tip: $('#nozTip'), back: $('#nozBack'), adaptive: !/[?&]noadapt/.test(location.search), reveal: [$('.svc-head'), ...$$('.svc-card'), $('.svc-note')],
      });
    } catch (e) { wash = null; }
    if (!wash) root.classList.add('no-webgl');
  }
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
    if (wash && !$('#washStage').classList.contains('revealed')) window.scrollTo({ top: wash.progressTo(1), behavior: 'auto' });
  });

  // ---------------------------------------------------------------- motion (doc 18 design upgrade, first pass)
  // The hero headline rises in letter by letter while a line of gold light passes.
  (function splitHeadline() {
    const l1 = $('.hero h1 .l1');
    if (!l1 || reduce) return;
    const text = l1.textContent;
    l1.setAttribute('aria-label', text);
    l1.textContent = '';
    Array.from(text).forEach((ch, i) => {
      const sp = document.createElement('span');
      sp.className = 'ch'; sp.textContent = ch; sp.style.setProperty('--i', i); sp.setAttribute('aria-hidden', 'true');
      l1.appendChild(sp);
    });
    l1.classList.add('split');
  })();
  // Sections rise in as they enter the screen, children staggered; lines draw.
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.2 });
  function armReveals(scope) {
    $$('[data-reveal]', scope).forEach((el) => io.observe(el));
    if (reduce) return;
    ['.why-item', '.step', '.price-card', '.section-head', '.cta-band', '.svc-notes > div', '.group-head', '.standard .emblem', '.standard .statement', '.standard .facts'].forEach((sel) => {
      $$(sel, scope).forEach((el, i) => { if (el.dataset.rise) return; el.dataset.rise = ''; el.style.setProperty('--k', i % 8); io.observe(el); });
    });
  }
  armReveals(document);
  // A gold glint follows the pointer over cards and gold buttons, like light on polished paint.
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', (e) => {
      const t = e.target.closest('.svc-card, .price-card, .svc-opt, .why-item, .btn-gold, .choice-item.on, .appt, .rv');
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      t.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      t.classList.add('glint');
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
      requestAnimationFrame(() => { const y = Math.min(window.scrollY, 900); heroInner.style.transform = 'translateY(' + (y * 0.18).toFixed(1) + 'px)'; heroInner.style.opacity = String(Math.max(0, 1 - y / 700)); ticking = false; });
    }, { passive: true });
  }
  // Light mode ("showroom", doc 29): a toggle in the menu, remembered on this device.
  (function theme() {
    let saved = null;
    try { saved = localStorage.getItem('ad.theme'); } catch (e) { /* storage unavailable */ }
    if (saved === 'light') root.setAttribute('data-theme', 'light');
    const btn = $('#themeBtn');
    if (!btn) return;
    const paint = () => { const light = root.getAttribute('data-theme') === 'light'; btn.querySelector('span').textContent = light ? 'Dark mode' : 'Light mode'; btn.setAttribute('aria-pressed', light ? 'true' : 'false'); };
    paint();
    btn.addEventListener('click', () => {
      const light = root.getAttribute('data-theme') !== 'light';
      if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
      try { localStorage.setItem('ad.theme', light ? 'light' : 'dark'); } catch (e) { /* storage unavailable */ }
      paint();
    });
  })();

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
      [['Phone', PHONE], ['Area', 'Parker, Texas'], ['Mobile', 'Within about 10 miles'], ['Hours', 'Every day, start times 10 AM – 7 PM']].forEach(([k, v]) => {
        const row = document.createElement('div');
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b'); b.textContent = v;
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
    const view = ['home', 'services', 'book', 'account', 'appointments', 'admin', 'team', 'reviews'].includes(r) ? r : 'page';
    if (cur) memo[cur] = window.scrollY;
    const changed = r !== cur;
    if (changed) {
      closeMenu(false);
      $$('.view').forEach((v) => {
        const on = v.dataset.view === view;
        v.hidden = !on;
        v.classList.remove('enter');
        if (on && !first && !reduce) { void v.offsetWidth; v.classList.add('enter'); }
      });
      if (view === 'page') fillPage(r);
      if (view === 'book' && window.AlchemistBooking) window.AlchemistBooking.mount($('#bookApp'));
      if (view === 'account' && window.AlchemistAccount) window.AlchemistAccount.mountAccount($('#accountApp'));
      if (view === 'appointments' && window.AlchemistAccount) window.AlchemistAccount.mountAppointments($('#appointmentsApp'));
      if (view === 'admin' && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
      if (view === 'team' && window.AlchemistTeam) window.AlchemistTeam.mount($('#teamApp'));
      if (view === 'reviews' && window.AlchemistReviews) window.AlchemistReviews.mount($('#reviewsApp'));
      setName(NAMES[r]);
      $$('nav a', menu).forEach((a) => {
        if (a.getAttribute('href') === '#' + r) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      document.title = r === 'home' ? 'Alchemist Detailing' : NAMES[r] + ' · Alchemist Detailing';
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
      requestAnimationFrame(() => {
        if (view === 'home') { fitServices(); if (wash) wash.refresh(); }
        paintArt();
        armReveals($$('.view').find((v) => !v.hidden) || document);
      });
    }
  }
  window.addEventListener('hashchange', () => render(false));

  const veil = $('#veil');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
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
    // Book Now: the button lifts, gold light crosses the screen, booking fades in
    if (r === 'book' && cur !== 'book' && !reduce) {
      if (!wasOpen) a.classList.add('launch');
      veil.classList.remove('run');
      void veil.offsetWidth;
      veil.classList.add('run');
      setTimeout(() => { navigate(); a.classList.remove('launch'); }, 360);
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
  // after fonts load, sizes settle: fit and paint again
  const settle = () => { fitServices(); if (wash) wash.refresh(); paintArt(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle); else setTimeout(settle, 300);

  // used by the screenshot checks
  window.__alchemist = { wash, goTo: (p) => wash && window.scrollTo(0, wash.progressTo(p)) };
})();
