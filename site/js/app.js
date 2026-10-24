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
  function startHero(first) {
    if (heroStarted) return;
    heroStarted = true;
    // the page opened on home and the head script has let the intro go (a slow script): the letters are already
    // rising, so the studio light is simply at rest
    const late = first && root.classList.contains('ready');
    root.classList.remove('ready');   // home opened later: its intro waits for this compile too (the head script's 1.5s let it go)
    if (glOk && window.AlchemistHero) {
      const scenes = ['beads', 'gloss'];
      let last = null;
      try { last = localStorage.getItem('ad.hero'); } catch (e) { /* storage unavailable */ }
      let scene = scenes[Math.random() < 0.5 ? 0 : 1];
      if (scene === last) scene = scenes.find((s) => s !== last);
      try { localStorage.setItem('ad.hero', scene); } catch (e) { /* storage unavailable */ }
      // The studio light's entrance needs to know where the words are. They are read now, in page pixels, while the
      // page is being laid out for its first picture anyway (revealAbove reads it next), so no frame of the intro
      // has to lay it out again; the hero reads its canvas with them (hero-gl.js), and the glass bar its own box.
      const plays = !late && !light.off;
      if (plays && heroWord && heroMono) spots = { w: pageBox(heroWord), m: pageBox(heroMono) };
      if (glassLight && glassBar) glassBox = glassBar.getBoundingClientRect();
      // black paint in both themes: the hero is the black showroom in the white studio too (CSS)
      try { hero = window.AlchemistHero.start($('#heroGl'), { scene, still: reduce, studio: false, entrance: plays, onFrame: glass, onSkip: unplan }); } catch (e) { root.classList.add('no-hero-gl'); }
    }
    // The studio light's path is worked out now too, with the page laid out (arithmetic only: no frame carries it).
    const p = hero && hero.enter && spots ? plan() : null;
    // The intro waits for the shader: two frames after the hero starts, the compile is behind us,
    // so the first letters are never swallowed by it. (CSS pauses the hero animations until html.ready.)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const held = p ? lightOn(p) : 0;
      root.classList.add('ready');
      light.hold(held || 1450 + 1600 + 240);   // Book Now's shine crosses after the wordmark's light has (letterSweep: 1.45s, then 1.6s)
      if (unsplit) setTimeout(unsplit, 2000);   // fallback, in case the last letter's animationend never comes
    }));
  }
  // The studio light comes on (hero-gl.js enter()): the bar glides in across the paint, behind the monogram and the
  // wordmark, and each takes the light as the bar's centre reaches it, as one light: the monogram one glint (the
  // shared 1.2s pass, its middle on the mark's centre: --glint-at), the wordmark the line of light inside its letters
  // (letterSweep, its middle on the word's centre and its pace the bar's across the word: --sweep-at, --sweep-dur),
  // and a soft shade under each while the bar's core is near them (--shade-in, --shade-out): from just before it
  // reaches them until it is past, or, where it comes back over them within the entrance (a phone's narrow paint),
  // until it is past them on its way back. plan() works out those times (ms after enter()); lightOn() sets them as the
  // intro starts, counted from then, and returns how long Book Now's shine waits: until the bar has slowed past the
  // word and the letters' light has gone.
  const heroWord = $('.hero h1 .l1'), heroMono = $('.hero-mono'), heroH1 = $('.hero h1');
  let glideEnd = 0, skipped = false, spots = null, lightT = 0;
  // an element's box in page pixels where it is laid out (its place at rest: not the rise its intro starts from)
  const pageBox = (el) => {
    let left = 0, top = 0;
    for (let e = el; e; e = e.offsetParent) { left += e.offsetLeft; top += e.offsetTop; }
    return { left, top, width: el.offsetWidth, height: el.offsetHeight };
  };
  function plan() {
    const sx = window.scrollX, sy = window.scrollY, w = spots.w, m = spots.m;
    const wl = w.left - sx, wr = wl + w.width, y = w.top - sy + w.height / 2, mx = m.left - sx + m.width / 2, my = m.top - sy + m.height / 2;
    const at = performance.now(), p = hero.enter(y, wr);   // the bar slows once its body has cleared the word's end
    if (!p) return null;
    glideEnd = at + p.turn + 200;
    const a = p.when(wl, y), b = p.when(wr, y), c = p.when(wl + w.width / 2, y), g = p.when(mx, my);
    if (a == null || b == null || c == null || g == null) return { at, held: p.turn + 240 };   // beyond the bar's turn: the letters' light keeps its own time
    // the sweep's band crosses the letters in the middle 39% of its run (letterSweep: --sx -15% to 115%, --ease-in-out)
    const dur = Math.round(Math.min(2400, Math.max(1600, (b - a) / 0.39)));
    // where the bar comes back over the word within the entrance (a phone), the shade stays until it has cleared them
    // on its way back, its centre a tenth of the screen past their left edges (its bright core is about that wide), or,
    // where its drift turns before that, until the entrance's reckoning ends (until)
    const k = window.innerWidth * 0.1, r = p.back(wr, y), clear = (x, yy) => { const t = p.back(x, yy, r); return t == null ? p.until : t; };
    const out = r == null ? Math.max(b, g) : Math.max(clear(wl - k, y), clear(m.left - sx - k, my));
    return { at, end: p.end, dur, sweep: c - dur / 2, glint: g - AU_MS.el / 2, shadeIn: Math.min(a, g) - 650, shadeOut: out + 150, held: Math.max(p.turn, c + dur / 2) + 240 };
  }
  // Each time is set on the element whose light it times (set on .hero, it would restyle all of the hero). The
  // letters' light starts with the intro; the glint and the shade, which come later, are put in place on their own
  // about halfway there, so the intro's frame carries only the letters' times.
  const since = (p) => performance.now() - p.at, ms = (t) => Math.round(t) + 'ms';
  function lightOn(p) {
    if (skipped) return 0;
    const lag = since(p);
    if (p.dur) {
      heroWord.style.setProperty('--sweep-at', ms(p.sweep - lag));
      heroWord.style.setProperty('--sweep-dur', p.dur + 'ms');
      lightT = setTimeout(() => lightIn(p), Math.max(0, (Math.min(p.shadeIn, p.glint) - lag) / 2));
    }
    return Math.round(p.held - lag);
  }
  function lightIn(p) {
    if (skipped) return;
    const lag = since(p);
    // a page that stalled until the bar had nearly passed them: no glint and no shade (they would only flash)
    if (p.shadeOut - lag < 500) { lightT = setTimeout(lightDone, Math.max(0, p.end - lag)); return; }
    // a glint already under way is not joined part way (it would appear in the middle of the mark): it is left at its
    // end, unseen; the shade always fades in, from now if its time has passed
    const g = p.glint - lag;
    heroMono.style.setProperty('--glint-at', ms(g < -150 ? -AU_MS.el : g));
    [heroH1, heroMono].forEach((el) => { el.style.setProperty('--shade-in', ms(Math.max(0, p.shadeIn - lag))); el.style.setProperty('--shade-out', ms(p.shadeOut - lag)); });
    heroEl.classList.add('enter');
    // once the shade has gone (its second run, the fade out), the glint and the shade leave with their layers
    heroEl.addEventListener('animationend', lightGone);
    heroEl.addEventListener('animationcancel', lightGone);
    lightT = setTimeout(lightDone, p.end + 30000);   // should that event never come
  }
  function lightGone(e) { if (e.animationName === 'heroShade' && (e.type === 'animationcancel' || e.elapsedTime > 1)) lightDone(); }
  // the entrance's lights leave (also when home is left part way through: a hidden page cancels its animations, and
  // coming back, the words' light keeps its own time, as it always has)
  function lightDone() {
    clearTimeout(lightT);
    heroEl.removeEventListener('animationend', lightGone);
    heroEl.removeEventListener('animationcancel', lightGone);
    heroEl.classList.remove('enter');
    heroWord.style.removeProperty('--sweep-at');
    heroWord.style.removeProperty('--sweep-dur');
  }
  // a stalled first picture cancelled the entrance (or home was left): the letters' light keeps its own time and the
  // monogram none
  function unplan() {
    glideEnd = 0;
    skipped = true;
    lightDone();   // the shade and the glint go with it, begun or not
  }
  // The glass catches the studio light: the floating bar's top edge is brightest right above where the light bar is
  // on the paint under it (.bar-light, placed after each of the hero's pictures, so it holds still when the hero
  // does). It fades out toward the bar's ends, and wherever the hero is not under the bar (.over-hero, CSS). The bar's
  // box is read with the hero's start and after a new size, from the next layout (never inside a picture).
  const glassBar = $('.bar'), glassLight = $('.bar-light i');
  let glassBox = null, glassAt = null, glassA = null;
  function glass(h) {
    if (!glassBox || root.dataset.theme === 'light') return;   // the white studio's bar is solid over the hero: no light in it
    const b = glassBox, lx = h.lineX(b.top + b.height / 2);
    if (lx == null) return;
    const x = lx - b.left;
    const a = Math.max(0, Math.min(1, (Math.min(x, b.width - x) - 30) / 90)).toFixed(2);
    const at = (Math.round(Math.max(-b.width, Math.min(b.width, x - b.width / 2)) * 2) / 2) + 'px';
    if (at !== glassAt) { glassAt = at; glassLight.style.transform = 'translate3d(' + at + ', 0, 0)'; }
    if (a !== glassA) { glassA = a; glassLight.style.opacity = a; }
  }
  window.addEventListener('resize', () => {
    if (!glassBox) return;
    const io = new IntersectionObserver((es) => { io.disconnect(); glassBox = es[0].boundingClientRect; if (hero) glass(hero); });
    io.observe(glassBar);
  });
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
  // in forced colours nothing passes. Book Now's .shine is the one light that repeats, and it keeps the same rule: a
  // pass waits while a shine on the screen is crossing its button (or the hero wordmark's light, or the gold veil into
  // booking), a shine on the screen that would start crossing during a pass or another shine's crossing starts just
  // after it instead, a crossing apart from the next, and one that starts anyway (a late frame) steps back into its
  // rest, unseen, until the light ahead of it has gone. Its rest is longer that once; its rhythm is otherwise unchanged.
  // The customer's own input (now: a service chosen, a booking step reached, the menu opened, a booking opened) waits
  // for no shine: a shine crossing then fades out where it is and goes on from its rest, and a pass still playing
  // stops for it. Only the arrivals wait for the shines.
  const AU_MS = { el: 1200, card: 1400, wide: 1800 };   // --au-dur, --au-dur-card, --au-dur-wide
  const reach = (r) => (38 + 19 * Math.min(4, r.height / Math.max(1, r.width))).toFixed(1) + '%';   // a sweep's --au-reach
  const CROSSING = { shine: 0.22, letterSweep: 1, veil: 1 };   // the part of each CSS light's run spent crossing (@keyframes)
  const light = (() => {
    const off = reduce || window.matchMedia('(forced-colors: active)').matches;
    const q = [];
    let cur = null, busyUntil = 0, timer = 0;
    const onScreen = (el) => {
      if (!el || !el.isConnected) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
    };
    // the CSS lights now running on the screen ([animation, its timing]); none where the browser can't list them
    function others(names) {
      let all = [];
      try { all = document.getAnimations ? document.getAnimations() : []; } catch (e) { /* older browsers: passes only */ }
      return all.filter((a) => names[a.animationName] && a.playState === 'running' && a.currentTime != null && a.effect && onScreen(a.effect.target))
        .map((a) => [a, a.effect.getComputedTiming()]);
    }
    // ms until no other light is crossing anything (for a shine just starting: no other that started before it; for
    // one just back on the screen, none at all; for the customer's own input, firm: only the lights that can't give
    // way, the hero wordmark's and the veil)
    function crossing(self, seen, firm) {
      const mine = !self || seen ? -1 : self.effect.getComputedTiming().progress || 0;
      return others(CROSSING).reduce((ms, [a, t]) => {
        const part = CROSSING[a.animationName];
        if (a === self || t.progress == null || t.progress >= part || (self && a.animationName === 'shine' && t.progress <= mine)) return ms;
        if (firm && a.animationName === 'shine') return ms;
        return Math.max(ms, (part - t.progress) * t.duration);
      }, 0);
    }
    // the shines crossing on the screen give way to the customer's own input: each goes on at once from the start of
    // its rest (so its next crossing comes at its usual time), while its band stays where it was and fades (.yield)
    function yieldShines() {
      others({ shine: 1 }).forEach(([a, t]) => {
        if (t.progress == null || t.progress >= CROSSING.shine) return;
        const el = a.effect.target;
        el.style.setProperty('--yield-at', getComputedStyle(el, '::after').transform);
        el.classList.add('yield');
        a.currentTime += (CROSSING.shine - t.progress) * t.duration + 20;
        setTimeout(() => { el.classList.remove('yield'); el.style.removeProperty('--yield-at'); }, 220);
      });
    }
    // the shines on the screen that would start crossing in the next ms start just after, a crossing apart
    function holdShines(ms, self) {
      const part = CROSSING.shine;
      others({ shine: 1 }).filter(([a]) => a !== self).map(([a, t]) => {
        const until = t.progress == null ? (a.effect.getTiming().delay || 0) - a.currentTime   // before its first crossing
          : t.progress >= part ? (1 - t.progress) * t.duration : Infinity;
        return [until, a, t];
      }).filter(([until]) => until < ms).sort((x, y) => x[0] - y[0]).forEach(([until, a, t], k) => {
        const at = ms + k * (t.duration * part + 240);   // when it starts crossing now
        // a shine at rest moves back within its rest (never into its crossing: then it keeps its time)
        if (t.progress == null || at <= t.duration * (1 - part)) a.currentTime -= at - until;
      });
    }
    // a shine starting its run (the crossing is its first 22%), or coming back on the screen part way across: it
    // waits if another light is crossing (stepping back into its rest while its band is still beyond the button's
    // edge, or while it was off the screen), and otherwise the other shines wait for it
    function settle(el, seen) {
      if (!onScreen(el)) return;
      let a = null;
      try { a = el.getAnimations({ subtree: true }).find((x) => x.animationName === 'shine'); } catch (err) { return; }
      if (!a || a.playState !== 'running' || a.currentTime == null) return;
      const t = a.effect.getComputedTiming(), p = t.progress;
      if (p == null || p >= CROSSING.shine) return;   // at rest: the start of its next run sees to it
      const wait = Math.max(busyUntil - performance.now(), crossing(a, seen));
      if (wait > 0) { if (seen || p < 0.05) a.currentTime -= wait + 120 + p * t.duration; }
      else holdShines(t.duration * (CROSSING.shine - p) + 240, a);
    }
    const onShine = (e) => { if (e.animationName === 'shine') settle(e.target, false); };
    if (!off) ['animationstart', 'animationiteration'].forEach((type) => document.addEventListener(type, onShine, true));
    // the pass playing stops where it is (the customer's own input has come, or its service was let go of)
    function cut() {
      clearTimeout(cur.end);
      cur.el.classList.remove('au-run');
      cur = null;
      busyUntil = performance.now();
    }
    function play(it) {
      if (cur) cut();
      cur = it;
      const el = it.el;
      // its turn has come: a pass made of several lights (the service cards' row) lays them out now and says how long
      // they run in all
      if (it.start) it.ms = it.start() || it.ms;
      busyUntil = performance.now() + it.ms + 60;
      if (it.now) yieldShines();
      holdShines(it.ms + 240);
      // a band that slides (sweep) starts and ends just outside its frame however tall the frame is (a phone's
      // closing band, a tall card): the 118deg tilt needs more reach the taller the frame is for its width
      const r = el.getBoundingClientRect();
      el.style.setProperty('--au-reach', reach(r));
      el.classList.remove('au-run');
      void el.offsetWidth;
      el.classList.add('au-run', 'au-lit');
      it.end = setTimeout(() => { el.classList.remove('au-run'); cur = null; setTimeout(next, 120); }, it.ms + 60);
    }
    function next() {
      clearTimeout(timer);
      while (q.length) {
        const it = q[0], now = performance.now();
        if (cur && !it.now) return;   // after the pass playing (its end calls next)
        // its time has come, and nothing else is crossing (after 4s of waiting on other lights it goes anyway)
        const wait = Math.max(it.at - now, now - it.at < 4000 ? crossing(null, false, it.now) : 0);
        if (wait > 0) { timer = setTimeout(next, wait + 40); return; }
        q.shift();
        if (onScreen(it.el) && (!it.when || it.when())) play(it);
        else if (it.miss) it.miss();
      }
    }
    return {
      // o: { delay (ms), size ('el', 'card', 'wide'), when (still wanted, if it had to wait), miss (it could not play),
      // now (the customer's own input: ahead of the arrivals, and at once once its delay is over), start (it plays now;
      // it may return how long it runs) }
      pass(el, o) {
        o = o || {};
        if (off || !el || el.classList.contains('au-run')) return;
        const k = q.findIndex((it) => it.el === el);
        if (k >= 0) { if (!o.now) return; q.splice(k, 1); }   // already waiting: the customer's own input takes it ahead
        const it = { el, now: !!o.now, at: performance.now() + (o.delay || 0), ms: AU_MS[o.size] || AU_MS.el, when: o.when, miss: o.miss, start: o.start };
        if (!o.delay && onScreen(el) && (it.now ? !crossing(null, false, true) : !cur && !q.length && !crossing())) { play(it); return; }   // nothing ahead of it: at once
        q.splice(it.now ? q.filter((x) => x.now).length : q.length, 0, it);   // the customer's own input, in order, ahead of the arrivals
        next();
      },
      // a light no longer wanted (a chosen service let go of): it stops, or leaves the queue
      stop(el) {
        if (off || !el) return;
        const k = q.findIndex((it) => it.el === el);
        if (k >= 0) q.splice(k, 1);
        if (cur && cur.el === el) { cut(); setTimeout(next, 120); }
      },
      // a CSS light of its own is about to cross for ms (the hero's wordmark): the shines on the screen wait for it
      hold(ms) { if (!off) holdShines(ms); },
      // a shine back on the screen (its pause lifted): one caught part way across waits its turn
      settle(el) { if (!off) settle(el, true); },
      // no light here at all (reduced motion, forced colours): what would wait for one is simply there
      get off() { return off; },
    };
  })();
  window.AlchemistLight = light;
  // Arrivals: the Services header, a brand page's title, the Gold client card and the Exterior and Bundles photo
  // plates get their pass once a third of them is on the screen, after their own entrance has landed. One that
  // scrolled away before its turn gets it when it comes back. (An appointment takes its pass when it is first opened:
  // account.js; home's closing band has a moment of its own: closing().) A brand page's title sets from behind its
  // line first (the heads): its pass, inside the letters, waits until the heading is whole again.
  const ARRIVE = '.svc-top, .book-page .page-head h1, .gold-card, .group-plate.polish';
  const arriveIo = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target;
    arriveIo.unobserve(el);
    const title = el.matches('h1');
    const pass = () => light.pass(el, { delay: title ? 200 : el.matches('.svc-top') ? 650 : 450, size: el.matches('.group-plate, .svc-top') ? 'wide' : 'el', miss: () => arriveIo.observe(el) });
    if (title) afterHead(el.closest('[data-head]'), pass); else pass();
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
    // the page you are on takes the gold light once its item has slid in (110ms press, 140ms + 28ms a step, .45s): the
    // customer's own input, so no shine holds it back
    const here = $('nav a[aria-current="page"]', menu);
    if (here) light.pass(here, { delay: 250 + 28 * (parseInt(here.style.getPropertyValue('--i'), 10) || 0) + 450, when: () => menuOpen, now: true });
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
  let artHold = false;   // a bead moment (Services' Protection, home's closing band) is drawing through the stills' context: they wait for it
  const artRest = new Map();   // a still that is a moment's last picture: its numbers for a W x H picture (the closing band's)
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
          const rest = artRest.get(c);
          const opts = rest ? rest(W, H) : c.dataset.studio != null ? { studio: c.dataset.studio === '1' } : undefined;
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
  const washSection = $('#wash');
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
    topbar.classList.toggle('over-hero', [...underBar].some((el) => el.matches('.hero')));   // the studio light is under the glass
  }, { rootMargin: '0px 0px -90% 0px' });
  darkTops.forEach((el) => darkIo.observe(el));
  // Under a finger there is no hover: once the row's light has crossed (at once where no light plays), the row
  // scrolled to the middle of the screen is lit.
  let litArmed = false;
  function armLit() {
    if (litArmed || !window.matchMedia('(hover: none)').matches) return;
    litArmed = true;
    const cards = $$('.svc-card'), seen = new Map();
    const lio = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) seen.set(e.target, e.intersectionRatio); else seen.delete(e.target); });
      let best = null;
      seen.forEach((ratio, el) => { if (!best || ratio > seen.get(best)) best = el; });
      // the rows are read before any card is lit, so the page is laid out once, not once per card
      const tops = cards.map((c) => (best && seen.has(c) ? c.offsetTop : null)), row = best ? best.offsetTop : null;
      cards.forEach((c, i) => c.classList.toggle('lit', !!best && (c === best || tops[i] === row)));
    }, { rootMargin: '-38% 0px -38% 0px', threshold: [0, .25, .5, .75, 1] });
    cards.forEach((c) => lio.observe(c));
  }
  // Reveal the paint (the owner's §9, and "wash it, then reveal the paint"): after the rinse, once the row is half on
  // the screen, the four cards sit a beat in their satin dimness, then one light at the 118deg angle crosses the row:
  // each card on the screen takes it on its own band (.au-band, under its scrim) in turn, its start set by where the
  // card's centre lies along the light's way (straight along the desktop row, diagonally through a phone's 2x2 grid).
  // Each picture brightens to its lit state just behind the light and settles back, and each "From" price takes a
  // glint inside its figures as the light reaches it, only once the database's menu has answered (a price never moves
  // before the database confirms it). It waits for washend (the canvas has stopped for good, the pin has let go), so
  // it never plays over the foam or the drops; without WebGL, or with a wash that could not start, it plays the first
  // time the row is half on the screen. Once per visit, as one pass in the light's queue. None under reduced motion
  // or in forced colours: the cards are simply there.
  const grid = $('.svc-grid');
  const AU_X = Math.sin(118 * Math.PI / 180), AU_Y = -Math.cos(118 * Math.PI / 180);   // the light's way: across, a little down
  const ROW_MS = 1600;   // the light's time along the row's whole length on its way (corner to corner)
  let rowArmed = false;
  function rowArm() {
    if (rowArmed) return;
    rowArmed = true;
    if (!grid || light.off) { armLit(); return; }
    if (wash && wash.live()) washSection.addEventListener('washend', rowWatch, { once: true });
    else rowWatch();
  }
  // half of the row on the screen
  function rowHalf() {
    const r = grid.getBoundingClientRect(), seen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return r.height > 0 && seen >= Math.min(r.height, innerHeight) * 0.5;
  }
  const rowIo = new IntersectionObserver(() => { if (rowHalf()) { rowIo.disconnect(); rowGo(); } }, { threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
  function rowWatch() { rowIo.observe(grid); }
  function rowGo() {
    const t0 = performance.now(), S = window.AlchemistServices;
    const asked = S && S.syncMenu ? S.syncMenu() : Promise.resolve(false);   // after the wash: no shader is being built
    // the beat (600ms from the row's arrival), and the database's answer for the prices' glint (at most 1.5s; in a
    // preview, or with no answer by then, the light crosses without it)
    Promise.race([asked, new Promise((res) => setTimeout(res, 1500, false))]).then((priced) => {
      light.pass(grid, { size: 'wide', delay: Math.max(1, 600 - (performance.now() - t0)), when: rowHalf, miss: rowWatch, start: () => rowPlay(priced === true) });
    });
  }
  // when (0 to 1 of a sweep's time) the light, on its ease (--ease-in-out), has gone f of its way
  const EASE = (getComputedStyle(root).getPropertyValue('--ease-in-out').match(/-?[\d.]+/g) || []).map(Number);
  function timeAt(f) {
    const [x1, y1, x2, y2] = EASE.length === 4 ? EASE : [0.65, 0, 0.35, 1];
    const bz = (a, b, u) => 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u;
    let lo = 0, hi = 1;
    f = Math.min(1, Math.max(0, f));
    for (let i = 0; i < 24; i++) { const u = (lo + hi) / 2; if (bz(y1, y2, u) < f) lo = u; else hi = u; }
    return bz(x1, x2, (lo + hi) / 2);
  }
  // The row's light, laid out as its turn comes, in layout pixels (the services may be scaled to fit a short screen;
  // offsets ignore that). Returns how long it runs in all.
  function rowPlay(priced) {
    const cards = $$('.svc-card', grid);
    const within = (el, card) => { let x = 0, y = 0; for (let n = el; n && n !== card; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
    const box = cards.map((c) => [c.offsetLeft, c.offsetTop, c.offsetWidth, c.offsetHeight]);
    const x0 = Math.min(...box.map((b) => b[0])), y0 = Math.min(...box.map((b) => b[1]));
    const span = AU_X * (Math.max(...box.map((b) => b[0] + b[2])) - x0) + AU_Y * (Math.max(...box.map((b) => b[1] + b[3])) - y0);
    let shown = cards.map((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
    if (!shown.some(Boolean)) shown = cards.map(() => true);
    const centre = (b) => AU_X * (b[0] + b[2] / 2) + AU_Y * (b[1] + b[3] / 2);   // along the light's way
    const first = Math.min(...box.filter((b, i) => shown[i]).map(centre));
    const CARD = AU_MS.card, GLINT = AU_MS.el;   // --au-dur-card across a card, --au-dur through a price's figures
    let end = 0;
    cards.forEach((c, i) => {
      if (!shown[i]) return;
      const b = box[i], w = b[2], h = b[3];
      const d = ROW_MS * (centre(b) - first) / span;
      // its band slides from -R to R (sweep: --au-reach of its 1.8 widths) and its light reaches a point dx, dy from the
      // card's centre when the band has moved dx plus the tilt's lean over dy
      const r = reach({ width: w, height: h }), R = parseFloat(r) / 100 * 1.8 * w;
      const at = (dx, dy) => d + timeAt((dx + AU_Y / AU_X * dy + R) / (2 * R)) * CARD;
      c.style.setProperty('--au-reach', r);
      c.style.setProperty('--au-delay', Math.round(d) + 'ms');
      // the picture's light: from just before the light reaches the card's centre, peaking just behind it
      const lit = Math.max(0, at(0, 0) - 150);
      c.style.setProperty('--au-lit-at', Math.round(lit) + 'ms');
      end = Math.max(end, d + CARD, lit + 1200);
      // the price's glint: in the middle of its figures (half its own run) as the light passes them
      const p = $('.price', c);
      if (p && priced) {
        const [px, py] = within(p, c), g = Math.max(0, at(px + p.offsetWidth / 2 - w / 2, py + p.offsetHeight / 2 - h / 2) - GLINT / 2);
        c.style.setProperty('--au-gdelay', Math.round(g) + 'ms');
        end = Math.max(end, g + GLINT);
      }
      c.classList.add('au-glow');
    });
    grid.classList.toggle('au-priced', priced);
    end = Math.round(end);
    setTimeout(() => {
      grid.classList.remove('au-priced');
      cards.forEach((c) => {
        c.classList.remove('au-glow');
        ['--au-reach', '--au-delay', '--au-lit-at', '--au-gdelay'].forEach((k) => c.style.removeProperty(k));
      });
      armLit();
    }, end + 160);   // after the pass has ended (.au-run goes at end + 60)
    return end;
  }
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
  // Sections rise in as they enter the screen, children staggered (capped at the fourth) within their parent;
  // hairlines draw. Once an element is in, data-rise is dropped so its own hover transitions take over. A block rises
  // when 15% of it is in, or 24px of it for a tall one (a price card on a short phone, landed on by a jump, shows only
  // its top and would otherwise wait for a scroll that never comes). A head (below) sets in its own way; a block that
  // arrives with the head above it waits for the head's lead (--after), so a section reads in order.
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => { if (e.isIntersecting && (e.intersectionRatio >= 0.15 || e.intersectionRect.height >= 24)) { reveal(e.target); io.unobserve(e.target); } });
  }, { threshold: [0, 0.02, 0.05, 0.1, 0.15], rootMargin: '0px 0px -8% 0px' });
  const held = new WeakSet();   // what comes after the wash on home, waiting for washend
  // An arrival is only noted where it is found (the observer, a page opening, washend). In the next frame the rooms
  // and the blocks go in (their light comes up first; a block under a head still to set waits for it). The heads are
  // read in a frame of their own (the lines as laid out, whether the head before is still on the screen), and their
  // lines are swapped in after the reading, while the heading is still unseen; each head then sets in the frame after
  // that by its classes alone, and the blocks under it follow a frame later again. So no frame lays the page out
  // twice, and no frame carries the room's light, the new lines and the head's setting together.
  const due = new Set();
  let dueFrame = 0;
  function reveal(el, late) {
    if (el.classList.contains('in') || held.has(el) || ownMoment(el)) return;
    // after the wash, everything waits for its end together (the heads, the rooms and the blocks under them), so a
    // card never rises ahead of its heading while the drops are still drying
    if (!late && afterWash(el)) {
      held.add(el);
      const go = () => { if (held.delete(el)) reveal(el, true); };
      washSection.addEventListener('washend', go, { once: true });
      setTimeout(go, 2500);   // should it not come: never an empty head on the screen
      return;
    }
    due.add(el);
    if (!dueFrame) dueFrame = requestAnimationFrame(arrive);
  }
  function arrive() {
    const els = [...due].filter((el) => !el.classList.contains('in'));
    due.clear();
    els.forEach((el) => { if (el.hasAttribute('data-head')) headGo(el); });   // a head whose fonts are in joins this frame
    dueFrame = 0;
    let wrote = false;
    els.forEach((el) => { if (!el.hasAttribute('data-head')) { rise(el); wrote = true; } });
    if (turn.size) { if (wrote) requestAnimationFrame(readHeads); else readHeads(); }
  }
  // read: which heads set now (one at a time on the screen) and their lines; they set in the next frame
  function readHeads() {
    const t = performance.now(), go = [];
    let last = headLast, on = turn.size > 0 && !!last && seenOn(last), free = headFree;
    [...turn].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).forEach((c) => {
      turn.delete(c);
      if (c.classList.contains('in')) return;
      if (last && last !== c && on && free - t > 16) {
        heads.set(c, { at: free, lead: LINE.at + LINE.lead });   // what follows it waits for its later start too
        setTimeout(() => headTurn(c), free - t);
        return;
      }
      const h = $('[data-hd="h"]', c);
      let cut = null;
      try { cut = h && lineCut(h); } catch (e) { cut = null; }   // whatever happens, the head shows
      go.push([c, h, cut, headKey(h)]);
      last = c; on = true; free = t + LINE.at + ((cut ? cut.length : 1) - 1) * LINE.gap + 520;
    });
    if (!go.length) return;
    // write: the lines go in now, after all the reading, while the heading is still unseen (its head not .in), so
    // the frame the head sets in only changes its classes; they rise from their slots as it does (CSS lineUp)
    const n = go.map(([c, h, cut]) => { try { return cut ? splitLines(h, cut, () => headDone(c)) : 0; } catch (e) { return 0; } });
    requestAnimationFrame(() => go.forEach(([c, , , key], i) => setHead(c, false, n[i], key)));
  }
  // a block or a room goes in, after the head above it has led. While that head is still to set (held for the wash's
  // end, waiting for the fonts or for the head before it on the screen) the block waits for it, and setHead lets it go
  // (3s at most); now: the keyboard has reached it, so it is there at once
  const waits = new Map();   // a head still to set: the blocks under it waiting for it
  function rise(el, now) {
    if (el.classList.contains('in')) return;
    const c = headAbove(el);
    if (!now && c && !c.classList.contains('in') && (heads.has(c) || held.has(c) || due.has(c))) {
      let w = waits.get(c);
      if (!w) waits.set(c, (w = new Set()));
      if (!w.has(el)) { w.add(el); setTimeout(() => { if (w.delete(el)) rise(el, true); }, 3000); }
      return;
    }
    const after = followHead(c);
    if (after) el.style.setProperty('--after', after + 'ms');
    el.classList.add('in');
    if (el.hasAttribute('data-rise')) setTimeout(() => { el.removeAttribute('data-rise'); el.style.removeProperty('--k'); el.style.removeProperty('--after'); }, 1000 + after);
  }
  // a plate's title whose moment sets it (Interior's cabin, Protection's beading: headGo, as the light comes up or the
  // photo is back), never an arrival, a page opening or a jump to the group
  const ownMoment = (el) => el.hasAttribute('data-head') && !!el.closest('.cabin, .beading');
  // the live wash still on its way out: what comes after it on home waits for its end (washend)
  const afterWash = (el) => !!(wash && wash.live() && el.closest('[data-view="home"]') && !washSection.contains(el) && (washSection.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
  // a block that the keyboard reaches before it has risen is shown at once, with no fade, so a focus ring is never
  // unseen (a click's or a page change's focus is not :focus-visible: those blocks still rise as they enter)
  document.addEventListener('focusin', (e) => {
    let kb = false;
    try { kb = e.target.matches(':focus-visible'); } catch (err) { /* older browsers: they rise as before */ }
    if (!kb) return;
    for (let r = e.target.closest('[data-rise]:not(.in)'); r; r = r.parentElement && r.parentElement.closest('[data-rise]:not(.in)')) {
      r.style.transition = 'none';
      due.delete(r); rise(r, true); io.unobserve(r);
      getComputedStyle(r).opacity;   // the shown state lands now, so the transition can come back without playing
      r.style.removeProperty('transition');
    }
    // a head, waiting or still setting, with a control in it reached by the keyboard: there at once. Not the heading
    // itself, which a new page or the skip link puts the focus on, with no ring (it keeps its arrival)
    const hd = e.target.closest('[data-head]');
    if (!hd || e.target.matches('[data-hd="h"]')) return;
    if (!hd.classList.contains('in')) { io.unobserve(hd); setHead(hd, true); } else hd.classList.add('hd-now');
  });
  const RISE = ['.why-item', '.door', '.feat-foot', '.step', '.price-card', '.svc-notes > div', '.rv', '.appt', '.faq-item', '.about p', '.about-use', '.ct-block', '.tip', '.acct-sec', '.el-main', '.el-panel', '.rit-scroll', '.bead-cmp', '.bead-foot', '.addons', '.step-up'];
  // The rooms: each section after the wash, the closing band and each Services group lights up as it arrives (CSS: its
  // studio glow comes up, then drifts with the scroll). The Services header settles its photo (.in) the same way.
  const ROOMS = '.why, .work, .how, .cta-band, .svc-group';
  function armReveals(scope) {
    $$('[data-reveal]', scope).forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    desyncShine(scope);
    $$('.shine, .scroll-cue', scope).forEach((el) => ioAway.observe(el));
    if (reduce) return;
    $$(ARRIVE, scope).forEach((el) => { if (!el.classList.contains('au-lit')) arriveIo.observe(el); });
    $$(COUNT, scope).forEach((el) => { if (!el.dataset.counted) countIo.observe(el); });
    $$(ROOMS, scope).forEach((el) => { if (!el.classList.contains('in') && !el.hasAttribute('data-room')) { el.setAttribute('data-room', ''); io.observe(el); } });
    $$('.svc-top', scope).forEach((el) => { if (!el.classList.contains('in')) io.observe(el); });
    armHeads(scope);
    armStandard(scope);
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

  // ---------------------------------------------------------------- the heads: each headline sets from behind its line
  // Every display heading outside the hero, the wash and booking (the section heads on home and Services, the brand
  // pages' heads, the Ritual's and the Bead Test's, the Services plates' titles, the closing band) arrives in reading
  // order once 15% of its head is on the screen: the kicker fades where it sits; from 80ms the heading rises line by
  // line out of a slot just below its own baseline (CSS lineUp: 800ms, 90ms apart); the lead and what follows it rise
  // 12px after the last line has started; the rule draws last. The lines are the ones the browser has laid out,
  // measured once the fonts are in, at the moment the head arrives, so a later font or a new size still splits right.
  // The heading keeps one readable copy for screen readers and gets its own text back as soon as its last line has
  // landed, at once on a new width, and at once if a translator rewrites it. One head sets at a time on the screen;
  // after the wash, only once it has ended. A page already seen this session shows its heads set. Not under reduced
  // motion (armReveals stops first): the heads are simply there, as without JavaScript and in print.
  const HEADS = '.section-head, .page-head, .show-head, .group-plate figcaption, .cta-band';
  const LINE = { at: 80, gap: 90, dur: 800, lead: 360 };   // the first line's start, --line-gap, --dur-line; the lead's wait after the last line starts
  const heads = new Map();   // a head that has started setting: { at, lead } (when, and when its lead follows)
  let headLast = null, headFree = 0;   // the last head set, and when the next one on the screen may start
  function armHeads(scope) {
    if (reduce) return;
    const all = $$(HEADS, scope);
    if (scope.matches && scope.matches(HEADS)) all.unshift(scope);
    const seen = seenHeads(scope);
    all.forEach((c) => {
      if (c.hasAttribute('data-head') || c.classList.contains('in') || c.closest('#adminApp, #teamApp')) return;
      const h = $(':scope > h1, :scope > h2, :scope > div > h2', c);
      if (!h) return;
      if (seen.has(headKey(h))) { $$('.rule', c).forEach((r) => { r.classList.add('in', 'settled'); io.unobserve(r); }); return; }   // already set
      c.setAttribute('data-head', '');
      h.setAttribute('data-hd', 'h');
      $$(':scope > .eyebrow, :scope > div > .eyebrow', c).forEach((k) => k.setAttribute('data-hd', 'k'));
      $$(':scope > p:not(.eyebrow), :scope > .actions, :scope > .work-nav', c).forEach((f, i) => { f.setAttribute('data-hd', 'f'); f.style.setProperty('--f', i); });
      $$('.rule', c).forEach((r) => io.observe(r));
      if (!c.closest('.cabin, .beading')) io.observe(c);   // a plate with a moment of its own sets its title itself
    });
  }
  // a head arrives: it waits for the fonts (1s at most), then sets in the next frame (arrive), or once the head
  // setting on the screen before it has all but landed
  function headGo(c) {
    if (!c || !c.hasAttribute('data-head') || heads.has(c) || c.classList.contains('in')) return;
    heads.set(c, { at: performance.now(), lead: LINE.at + LINE.lead });
    const f = document.fonts;
    if (f && f.status !== 'loaded') Promise.race([f.ready, new Promise((res) => setTimeout(res, 1000))]).then(() => headTurn(c));
    else headTurn(c);
  }
  const turn = new Set();   // the heads to set in the next frame
  function headTurn(c) {
    turn.add(c);
    if (!dueFrame) dueFrame = requestAnimationFrame(arrive);
  }
  const seenOn = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.height > 0; };
  // the head sets now, in its n lines (swapped in already by readHeads), or faded in with none, or at once (now:
  // reached by the keyboard first, its lines whole again). Its frame only writes: the session note (key: its words)
  // and the blocks under it come after it
  function setHead(c, now, n, key) {
    if (c.classList.contains('in')) return;
    const h = $('[data-hd="h"]', c), whole = h && splits.get(h);
    if (now && whole) whole();
    if (now || !whole) n = 0;   // (lines that went whole meanwhile, at a new width: it fades in)
    if (!key) key = headKey(h);
    if (!n) setTimeout(() => headDone(c), now ? 0 : LINE.at + LINE.dur);   // faded in (or there at once): whole as it lands
    const lines = Math.max(1, n), t = performance.now(), lead = LINE.at + (lines - 1) * LINE.gap + LINE.lead;
    c.style.setProperty('--hd-lead', lead + 'ms');
    c.style.setProperty('--hd-rule', (500 + (lines - 1) * LINE.gap) + 'ms');
    if (now) c.classList.add('hd-now');
    c.classList.add('in');
    heads.set(c, { at: t, lead });
    headLast = c;
    headFree = t + LINE.at + (lines - 1) * LINE.gap + 520;   // its last line has all but landed
    setTimeout(() => markSeen(c, key), 0);
    // the blocks under it that waited for it follow it, from the next frame (their wait for its lead is counted from
    // its start, so they keep their time)
    const w = waits.get(c);
    if (!w) return;
    waits.delete(c);
    const go = () => { const list = [...w]; w.clear(); list.forEach((el) => rise(el)); };
    if (now) go(); else requestAnimationFrame(go);
  }
  // a head's heading whole again, its lines landed (or faded in): what waits for that runs then (a brand page title's
  // gold pass, which crosses inside the letters, so never while they are split)
  const headsDone = new WeakSet(), headWaits = new Map();
  function afterHead(c, fn) {
    if (!c || !c.hasAttribute('data-head') || headsDone.has(c)) { fn(); return; }
    if (!headWaits.has(c)) headWaits.set(c, []);
    headWaits.get(c).push(fn);
  }
  function headDone(c) {
    if (headsDone.has(c)) return;
    headsDone.add(c);
    const fns = headWaits.get(c) || [];
    headWaits.delete(c);
    fns.forEach((fn) => fn());
  }
  // The heading's lines as the browser has laid them out (balanced, in whatever face and size it has now), read
  // before anything is written in the frame: the words on each line, as [from, to] in its text. Only a heading of
  // plain text, or of text and plain-text <em>s (the Standard's statement), on a page no translator has rewritten;
  // null otherwise (it then fades in). Its runs (lines.parts) say which words were in an <em>, so each line keeps it.
  function lineCut(h) {
    if (!h.firstChild || /\btranslated-/.test(root.className)) return null;
    const parts = [];
    let text = '';
    for (const n of h.childNodes) {
      const em = n.nodeType === 1 && n.matches('em') && n.childNodes.length === 1 && n.firstChild.nodeType === 3 ? n : null;
      const t = n.nodeType === 3 ? n : em ? n.firstChild : null;
      if (!t) return null;
      parts.push({ t, em, at: text.length });
      text += t.data;
    }
    // a place in the text as a place in its runs (a word's end on a run's end stays in that run)
    const pos = (i, end) => { let p = parts[0]; parts.forEach((q) => { if (end ? q.at < i : q.at <= i) p = q; }); return [p.t, i - p.at]; };
    const range = document.createRange(), lines = [], re = /\S+/g;
    let m, top = null;
    while ((m = re.exec(text))) {
      range.setStart(...pos(m.index, false));
      range.setEnd(...pos(m.index + m[0].length, true));
      const rs = range.getClientRects();
      if (!rs.length || Math.abs(rs[rs.length - 1].top - rs[0].top) > 2) return null;   // unseen, or a word broken across two lines
      if (top == null || Math.abs(rs[0].top - top) > rs[0].height / 2) { lines.push([m.index, m.index + m[0].length]); top = rs[0].top; }
      else lines[lines.length - 1][1] = m.index + m[0].length;
    }
    if (!lines.length) return null;
    lines.text = text;
    lines.parts = parts;
    return lines;
  }
  // Each line becomes a slot of its own (.ln) around the words on it (an <em>'s words in a copy of it); a copy of the
  // whole stays for screen readers. splitLines swaps them in and returns how many lines (splits: each split heading's
  // way back to whole, its own nodes again). at: when its first line rises (--std-lines for the Standard's statement)
  function makeLines(lines) {
    const text = lines.text, sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    return [sr].concat(lines.map(([a, b], i) => {
      const ln = document.createElement('span'), inner = document.createElement('span');
      ln.className = 'ln';
      ln.setAttribute('aria-hidden', 'true');
      ln.style.setProperty('--i', i);
      inner.className = 'ln-w';   // its words (a class of their own: a rule keyed to a tag would restyle every one)
      lines.parts.forEach((p) => {
        const from = Math.max(a, p.at), to = Math.min(b, p.at + p.t.data.length);
        if (from >= to) return;
        const words = text.slice(from, to);
        if (!p.em) { inner.append(words); return; }
        const em = p.em.cloneNode(false);
        em.textContent = words;
        inner.appendChild(em);
      });
      ln.appendChild(inner);
      return ln;
    }));
  }
  const splits = new Map();
  function splitLines(h, lines, onWhole, at) {
    const own = [...h.childNodes], made = makeLines(lines), ls = made.slice(1);
    h.classList.add('hd-lines');
    h.replaceChildren(...made);
    let done = false, mo = null, timer = 0, tries = 0;
    const last = ls[ls.length - 1].firstChild;
    const whole = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (mo) mo.disconnect();
      splits.delete(h);
      h.replaceChildren(...own);
      h.classList.remove('hd-lines');
      if (onWhole) onWhole();
    };
    // should animationend never come: whole once the last line's rise is over (on a busy page its clock starts with the
    // first frame drawn after the head sets, so it may still be rising when the time is up: then it is looked at again)
    const late = () => {
      let a = null;
      try { a = last.getAnimations()[0]; } catch (e) { /* no animations API: whole now */ }
      if (a && a.playState === 'running' && ++tries < 10) timer = setTimeout(late, 300);
      else whole();
    };
    timer = setTimeout(late, (at == null ? LINE.at : at) + (ls.length - 1) * LINE.gap + LINE.dur + 400);
    last.addEventListener('animationend', whole, { once: true });
    try { mo = new MutationObserver(whole); mo.observe(h, { childList: true, characterData: true, subtree: true }); } catch (e) { /* no translator watch */ }
    splits.set(h, whole);
    return ls.length;
  }
  // a new width (not a phone's bar coming and going) would leave the lines where they were: they are whole at once
  let splitW = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth === splitW) return; splitW = window.innerWidth; splits.forEach((f) => f()); });
  // the head above a block in its section (null: none), and how long a block arriving with it (or just after it)
  // waits for its lead
  const SCOPE = '.section, .svc-group, .table-sec, .content-page, .rv-page, .gal';
  function headAbove(el) {
    const s = el.closest(SCOPE);
    if (!s) return null;
    let c = null;
    $$('[data-head]', s).forEach((x) => { if (x !== el && !x.contains(el) && (x.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) c = x; });
    return c;
  }
  function followHead(c) {
    const at = c && heads.get(c);
    return at ? Math.round(Math.min(900, Math.max(0, at.at + at.lead + LINE.gap - performance.now()))) : 0;
  }
  // A head that has set once this session shows set the next time its page opens (in the tab's own storage: the
  // headings' words that have set, per route); the heads on it that never played still set as they arrive. A new tab
  // plays them all again.
  const routeOf = (el) => { const v = el.closest && el.closest('.view'), n = v ? v.dataset.view : cur; return n === 'content' ? cur : n; };
  const headKey = (h) => (h ? h.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 120);
  function seenHeads(el) {
    try { const v = JSON.parse(sessionStorage.getItem('ad.set.' + routeOf(el)) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch (e) { return new Set(); }
  }
  function markSeen(c, key) {
    if (!key) return;
    try {
      const s = seenHeads(c);
      if (!s.has(key)) { s.add(key); sessionStorage.setItem('ad.set.' + routeOf(c), JSON.stringify([...s])); }
    } catch (e) { /* storage unavailable: the heads set again */ }
  }
  // ---------------------------------------------------------------- the Alchemist Standard: the opening title card
  // The first words after the hero arrive once, like a film's opening title, as they come on the screen: the ring
  // draws round the monogram (its own 2s) as the mark fades up; the label fades in from 250ms; from 450ms the
  // statement sets line by line from behind its baseline (the heads' lines, its <em> kept), all of it in white. Once
  // it is whole and wholly on the screen, the gold light crosses "attention to every surface." (its turn in the
  // light's queue; .au-run on the <em>) and the words turn gold behind it, and stay gold. The script fades up at
  // 2.3s, the facts at 2.5s, a line's gap apart (CSS); by about 3s nothing moves. The light needs a calm page: the
  // pictures' compile (startHeavy) behind us and a few frames in a row with no stall (the wash below waking up, a slow
  // phone); a page that is not calm within a moment and a half, or a phrase scrolled past, is simply gold, with no
  // light. Not under reduced motion, for a second visit this session (the heads' note), without JavaScript or in
  // print: the card is set.
  const STD = { lines: 450, settle: 1500, calm: 3, stall: 100 };   // the first line's start (--std-lines); how long the light waits for a calm page; how many frames, each under stall ms, make one
  let stdArmed = false;
  function armStandard(scope) {
    const s = !stdArmed && scope.querySelector ? scope.querySelector('#standard') : null;
    if (!s) return;
    stdArmed = true;
    const mark = $('.emblem', s), st = $('.statement', s), key = headKey(st);
    if (seenHeads(s).has(key)) { mark.classList.add('in', 'settled'); io.unobserve(mark); return; }   // the ring drawn, as it was left
    io.unobserve(mark);
    mark.removeAttribute('data-reveal');   // its ring draws with the card
    st.setAttribute('data-hd', 'h');   // its lines, swapped in and out, are not new content (the observer at the end)
    s.setAttribute('data-std', '');
    const near = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting && e.intersectionRatio >= 0.3)) return;
      near.disconnect();
      stdGo(s, key);
    }, { threshold: [0, 0.3], rootMargin: '0px 0px -8% 0px' });
    near.observe($('.wrap', s));
  }
  // the card sets: the statement's lines read and swapped in (once the fonts are in), still unseen; in the next frame
  // the classes alone start it
  function stdGo(s, key) {
    const st = $('.statement', s), f = document.fonts;
    const go = () => requestAnimationFrame(() => {
      let n = 0;
      // (lines whole before the card has set, at a new width: it fades in, and its light comes after)
      const whole = () => { if (s.classList.contains('in')) stdLight(s); else setTimeout(() => stdLight(s), STD.lines + LINE.dur); };
      try { const cut = lineCut(st); n = cut ? splitLines(st, cut, whole, STD.lines) : 0; } catch (e) { n = 0; }   // whatever happens, it shows
      requestAnimationFrame(() => {
        s.classList.add('in');
        $('.emblem', s).classList.add('in');
        if (!n) setTimeout(() => stdLight(s), STD.lines + LINE.dur);   // faded in whole: its light once it has
        setTimeout(() => markSeen(s, key), 0);
      });
    });
    if (f && f.status !== 'loaded') Promise.race([f.ready, new Promise((res) => setTimeout(res, 1000))]).then(go); else go();
  }
  // the gold light through the promise, once the phrase is wholly on the screen and the page is calm
  function stdLight(s) {
    const em = $('.statement em', s);
    if (!em || em.classList.contains('au-lit')) return;
    const gold = () => em.classList.add('std-fade', 'au-lit');   // no light: the words simply turn gold
    if (light.off) { gold(); return; }
    const ready = (t0) => {
      if (!heavy || artBusy) { if (performance.now() - t0 < STD.settle) setTimeout(() => ready(t0), 100); else gold(); return; }
      let last = performance.now(), calm = 0;
      requestAnimationFrame(function frame(now) {
        calm = now - last < STD.stall ? calm + 1 : 0;
        last = now;
        // (on a screen so narrow that the phrase wraps, the band round the words stays off: the letters take the light)
        if (calm >= STD.calm) {
          light.pass(em, { size: 'card', when: () => !em.classList.contains('au-lit'), miss: () => view.observe(em),
            start: () => { em.classList.toggle('std-wrap', em.getClientRects().length > 1); } });
        } else if (now - t0 > STD.settle) gold();
        else requestAnimationFrame(frame);
      });
    };
    // (scrolled past, or home left: gold; still below: it waits)
    const view = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (e.intersectionRatio > 0.99) { view.disconnect(); ready(performance.now()); }
      else if (!e.isIntersecting && e.boundingClientRect.bottom <= 0) { view.disconnect(); gold(); }
    }, { threshold: [0, 1], rootMargin: '0px 0px -8% 0px' });
    view.observe(em);
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
    $$('[data-rise], [data-reveal], [data-room], [data-head]', scope).forEach((el) => {
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
  const ioAway = new IntersectionObserver((es) => es.forEach((e) => {
    e.target.classList.toggle('offscreen', !e.isIntersecting);
    if (e.isIntersecting && e.target.classList.contains('shine')) light.settle(e.target);
  }), { rootMargin: '10% 0px' });

  // Press: each pressable answers by its material (the press section of the CSS), from a delegated pointerdown. It is
  // held 80ms after the pointer lets go, then springs back on the release clock (.released, 180ms). With the browser's
  // tap flash off, everything a finger can press is in this list (the quiet links and the brand marks too).
  const PRESS = '.btn, .icon-btn, .choice-item, .svc-opt, .cal-day, .mini-btn, .link, .gal-tile, .work-item, .door, .el-tile, .rit, .tm-thumb, .adm-tile, .adm-nav a, .appt-head:not(.static), .svc-jump a, .faq-item summary, .menu nav a, .theme-btn, .cal-item, ' +
    '.svc-card, .star-pick button, .bk-progress button, .note-link, .addon-go, .acct-go, .el-back, .ct-link, .menu-sub .call, .su-fold, .scroll-cue, .footer a, .brand-link, .menu-brand, ' +
    '.sw-tile, .checks.parts a, .faq-item a, .bk-lead a, .bk-muted a';
  let pressedEl = null;
  function release() {
    const el = pressedEl;
    if (!el) return;
    pressedEl = null;
    setTimeout(() => {
      if (pressedEl === el) return;   // pressed again meanwhile
      el.classList.replace('pressed', 'released');
      setTimeout(() => { if (pressedEl !== el) el.classList.remove('released'); }, 180);
    }, 80);
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest(PRESS);
    if (!el || el.disabled || el.matches('.disabled, [aria-disabled="true"]')) return;   // disabled never presses
    release();
    pressedEl = el;
    el.classList.remove('released');
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
  // The scroll is read in the scroll event (the bar's listener has laid the page out for it already), so the frame
  // only writes and never meets a layout read after another frame's writes (a head's lines); past 900px it rests.
  if (heroInner && !reduce) {
    let ticking = false, y = 0, shown = -1;
    window.addEventListener('scroll', () => {
      if (cur !== 'home') return;
      y = Math.min(window.scrollY, 900);
      if (ticking || y === shown) return;
      ticking = true;
      requestAnimationFrame(() => {
        shown = y;
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
      if (meta) meta.setAttribute('content', light ? '#f8f5ee' : '#000000');
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
  // pictures against the page scroll (CSS).
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
    // (the pictures' drift against the page rides the browser's own scroll timeline: CSS plateDrift, as the plates')
  })();
  // ---------------------------------------------------------------- home, after Our work: the featured review and two doorways
  // The doorways quote the approved Tips and About words (content.js); the review slot stays empty until the owner
  // has approved a real review (reviews.js asks once, as the visitor nears Why Alchemist).
  if (window.AlchemistContent && window.AlchemistContent.mountDoors) window.AlchemistContent.mountDoors($('#doors'));
  if (window.AlchemistReviews && window.AlchemistReviews.mountFeatured) window.AlchemistReviews.mountFeatured($('#featured'), $('#why'));
  // (The services page's photo plates drift the same way, on the browser's own scroll timeline: CSS plateDrift.)

  // ---------------------------------------------------------------- the services plates' moments (one each, played once)
  // Protection beads up live and Interior's cabin lights up, each the first time its plate comes on the screen. Under
  // reduced motion and in forced colours neither plays: the plates show their still pictures and titles, as before.
  const calm = reduce || window.matchMedia('(forced-colors: active)').matches;
  const onceSeen = (el, o, fn) => {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); fn(); } }, o);
    io.observe(el);
  };
  // The bead moment (the owner's §11), for Services' Protection plate and home's closing band: on black paint the
  // drops appear one by one, small at first, and bead up (0.2-2.4s), the gold light comes up (from 0.3s) and passes
  // through them (1.2-2.8s) while a few of the largest roll down (1.6-3.6s). It is drawn through the stills' context
  // by their own program (its drops forming and rolling are compiled in; the stills wait while it draws: artHold), at
  // most at 0.6 of the screen's resolution and within that canvas as it is: nothing to compile, no resize, nothing in
  // it waits for the GPU process, and nothing to let go afterwards. It draws only while its frame is on the screen (30
  // fps on a phone, 60 elsewhere) and stops for good when its owner says (stop). host: the frame it lies in (which
  // clips the canvas); o: { time (the scene's), run (the scene's time runs on with the moment; else it holds, so the
  // last picture is a still), k (its scale, 0.6 at most), studio (black paint; left out, the theme's), path(W, H) ->
  // [from, to] (where the light comes up and where it comes to rest: offsets on its way from where it rests
  // unmoved), before (the node the canvas goes in front of), frame(secs, off) (after each picture; off: the light's
  // offset then), lost() (the context was lost: it has stopped) }
  const BEAD = { light: [0.3, 1.9], form: [0.2, 2.4], sweep: [1.2, 2.8], roll: [1.6, 3.6], end: 4 };   // seconds
  const inOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span = (secs, [a, b]) => Math.min(1, Math.max(0, (secs - a) / (b - a)));
  // the light's travel as the shader takes it: from and to as offsets on its way, from v0 to v1 of sweepRange
  const sweepOf = (from, to) => { const range = 2 * Math.max(Math.abs(from), Math.abs(to), 0.05); return { range, v0: 0.5 + from / range, v1: 0.5 + to / range }; };
  function beadMoment(host, o) {
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    let cv = null, raf = 0, t0 = 0, last = 0, seen = true, W = 2, H = 2, way = sweepOf(0, 0);
    const watch = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; });
    const sweep = (secs) => way.v0 + (way.v1 - way.v0) * inOut(span(secs, BEAD.sweep));
    const at = (secs) => ({ live: true, studio: o.studio, intro: span(secs, BEAD.light), form: 1 - Math.pow(1 - span(secs, BEAD.form), 3), sweep: sweep(secs), sweepRange: way.range, roll: span(secs, BEAD.roll) });
    const draw = (secs) => window.AlchemistHero.art('beads', W, H, o.time + (o.run ? secs : 0), at(secs)) === cv;
    function stop() {
      cancelAnimationFrame(raf);
      watch.disconnect();
      if (cv) { cv.remove(); cv.classList.remove('live', 'on', 'settle'); cv.removeAttribute('style'); cv = null; }
      if (artHold) { artHold = false; paintArt(); }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!seen || document.hidden || now - last < (small ? 31 : 15)) return;   // 30 fps on a phone, 60 elsewhere
      last = now;
      const secs = (now - t0) / 1000;
      if (!draw(secs)) { stop(); if (o.lost) o.lost(); return; }   // the context was lost
      if (o.frame) o.frame(secs, (sweep(secs) - 0.5) * way.range);
    }
    return {
      // the stills' context is up and free: its canvas's size (else null)
      room: () => (artReady && !artBusy && !artHold && host.clientWidth ? window.AlchemistHero.artRoom() : null),
      // the paint below the screen's resolution, soft and fast (0.6 at most), kept within the stills' canvas as it is
      // (should the frame have grown since its largest still); false: it could not start
      play(room) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2), k = Math.min(o.k || 0.6, room[0] / (host.clientWidth * dpr), room[1] / (host.clientHeight * dpr));
        W = Math.max(2, Math.floor(host.clientWidth * dpr * k));
        H = Math.max(2, Math.floor(host.clientHeight * dpr * k));
        way = sweepOf(...o.path(W, H));
        artHold = true;   // the stills wait while the canvas is on the screen
        try { cv = window.AlchemistHero.art('beads', W, H, o.time, at(0)); } catch (e) { cv = null; }
        if (!cv) { stop(); return false; }
        cv.classList.add('live');
        cv.setAttribute('aria-hidden', 'true');
        // the paint is the canvas's lower left W x H corner: sized so that corner fills the frame (which clips the rest)
        cv.style.width = (100 * cv.width / W) + '%';
        cv.style.height = (100 * cv.height / H) + '%';
        host.insertBefore(cv, o.before || null);
        watch.observe(host);
        t0 = last = performance.now();
        raf = requestAnimationFrame(frame);
        return true;
      },
      // its last picture, drawn now whatever was drawn last (a frame that was off the screen at the end draws none)
      rest: () => !!cv && draw(BEAD.end),
      stop,
      get canvas() { return cv; },
      get size() { return [W, H]; },
    };
  }
  // Protection (the owner's §11): at 40% on the screen the paint beads up live (the bead moment), then the canvas
  // gives way to the real photo of beading (.8s) and the title rises. Its time runs on with the moment, and the light
  // comes up in the left third of the paint and passes through the drops to rest right of the middle. On a page that
  // has only just opened here (#services-protection), before the stills' context is up, it waits at most 300ms, then
  // the photo fades in and the title rises. A context lost on the way ends it at once: the photo and the title.
  (function protection() {
    const plate = $('#svc-protection .group-plate');
    if (!plate || calm || !glOk || !window.AlchemistHero) return;
    plate.classList.add('beading');
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    let done = false;
    const cap = $('figcaption', plate);   // its title sets as the photo is back (headGo)
    // its travel follows the plate's shape (ext: the paint's half-width along the light's axis in the shader's units;
    // at this time of the scene the bar's own drift holds it near -0.3)
    const path = (W, H) => { const ext = 0.675 * (W / H * 0.82 + 0.57); return [-0.55 * ext + 0.3, 0.5 * ext + 0.3]; };
    const m = beadMoment(plate, { time: 13.7, run: true, studio: false, path, before: cap, lost: end });
    function end() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      m.stop();
      plate.classList.remove('beading', 'crossing', 'risen', 'quick');
      headGo(cap);
    }
    // no moment: the photo fades in from the black paint and the title rises
    function reveal() {
      if (done) return;
      done = true;
      plate.classList.add('quick', 'crossing', 'risen');
      headGo(cap);
      later(1000, () => plate.classList.remove('beading', 'crossing', 'risen', 'quick'));
    }
    function play(room) {
      if (!m.play(room)) { end(); return; }
      later(3100, () => plate.classList.add('crossing'));
      later(3600, () => { plate.classList.add('risen'); headGo(cap); });
      later(4000, m.stop);
      later(4800, () => { done = true; plate.classList.remove('beading', 'crossing', 'risen'); });
    }
    onceSeen(plate, { threshold: 0.4 }, () => {
      const t = performance.now();
      (function go() {
        if (done) return;
        const room = m.room();
        if (room) play(room);
        else if (performance.now() - t > 300) reveal();
        else later(50, go);
      })();
    });
  })();
  // ---------------------------------------------------------------- home's closing band: protect it, then book
  // The owner's journey ends "protect it", then "book the service" (his §11 and §20). At 40% on the screen, after the
  // wash's end, the band's paint is black and empty; the drops appear and bead up, the gold light comes up in its left
  // part and passes through them while a few of the largest roll down (the bead moment), and as the bar reaches SHINE
  // LIKE GOLD its line of light goes into the gold letters where the bar is, frame by frame, as the hero's light went
  // into ALCHEMIST: the page opens and closes on one light. From 2.8s the paint settles to its faint texture, and at 4s
  // it is the band's still, which is the moment's last picture (the still is painted from the same numbers: artRest),
  // so nothing changes as the canvas goes. Its scene's time is its own and held, and the light takes its own way, so
  // it is not Services' Protection again. All of it is one turn in the light's queue: Book Now's shine waits until the
  // light has gone, and the footer's sign-off comes after it (closing.after). Book Now and Call are there and work all
  // the while. Without WebGL, or with the stills' context not up within 300ms, the letters alone take the light (CSS),
  // once their heading is whole. None under reduced motion or in forced colours: the still, the heading set.
  const BAND = { from: 0.16, to: 0.7, at: 0.4 };   // where the bar comes up and rests across the headline's row (at least); how much of the band on the screen
  const closing = (function closing() {
    const band = $('.cta-band'), bg = band && $('.bead-bg', band), h2 = band && $('h2', band);
    let stage = band && h2 && !calm ? 'wait' : 'done', busy = false, gx = null;
    const enough = () => { const r = band.getBoundingClientRect(), seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0); return r.height > 0 && seen >= Math.min(r.height, window.innerHeight) * BAND.at; };
    // what waits for the band's light (the footer's sign-off): from the band's arrival (or its being due: on the
    // screen and still to play, as the footer may be seen in the same frame) until its light has gone (6s at most)
    const waiting = [];
    const settle = () => { busy = false; waiting.splice(0).forEach((fn) => fn()); };
    const api = {
      after(fn) {
        if (cur !== 'home' || !(busy || (stage === 'wait' && enough()))) { fn(); return; }
        waiting.push(fn);
        setTimeout(() => { const k = waiting.indexOf(fn); if (k >= 0) { waiting.splice(k, 1); fn(); } }, 6000);
      },
    };
    if (!band || !h2) return api;
    // the boxes of a heading's words as laid out (its lines, split or whole; not the copy kept for screen readers)
    const textRects = (el) => {
      const out = [], r = document.createRange();
      (function walk(n) {
        if (n.nodeType === 3) { r.selectNodeContents(n); out.push(...r.getClientRects()); }
        else if (n.nodeType === 1 && !n.classList.contains('sr-only')) n.childNodes.forEach(walk);
      })(el);
      return out.filter((q) => q.width > 0);
    };
    // the headline's letters, in its own pixels: their extent and the width of the light in them (a third of the
    // longest line, as the wordmark's), and the heading's place in the band
    function words() {
      const hb = h2.getBoundingClientRect(), ls = textRects(h2);
      if (!ls.length) return null;
      return { left: h2.offsetLeft, from: Math.min(...ls.map((q) => q.left)) - hb.left, to: Math.max(...ls.map((q) => q.right)) - hb.left, w: Math.round(Math.max(96, 0.32 * Math.max(...ls.map((q) => q.width)))) };
    }
    // where the light comes up and comes to rest, on the headline's row, for a W x H picture of the band's paint: before
    // the words, and past them with its light clear of them (as the hero's bar glides on until it has cleared the
    // word), across a wide band at least from its left part to right of the middle
    const seed = bg ? +(bg.dataset.t || 10) : 10;
    const row = () => (h2.offsetTop + h2.offsetHeight / 2) / Math.max(1, band.clientHeight);
    function path(W, H) {
      const bar = window.AlchemistHero.artBar('beads', W, H, seed), y = row(), bw = Math.max(1, band.clientWidth), t = words();
      const a = t ? Math.min(BAND.from, (t.left + t.from - t.w) / bw) : BAND.from, b = t ? Math.max(BAND.to, (t.left + t.to + t.w) / bw) : BAND.to;
      return [bar.level(a, y) - bar.rest, bar.level(b, y) - bar.rest];
    }
    const drawn = bg && glOk && window.AlchemistHero && window.AlchemistHero.artBar;
    if (drawn) artRest.set(bg, (W, H) => { const way = sweepOf(...path(W, H)); return { live: true, intro: 1, form: 1, roll: 1, sweep: way.v1, sweepRange: way.range }; });
    if (calm) return api;
    // (at the still's own scale, so its last picture is the still pixel for pixel, and no larger than the stills drew)
    const m = drawn ? beadMoment(band, { time: seed, k: +(bg.dataset.k || 0.5), path, before: $('.eyebrow', band), frame: follow, lost: still }) : null;
    if (m) band.classList.add('bead-arm');   // the paint waits black and empty for its moment
    const near = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || !enough()) return;
      near.unobserve(band);
      arrive();
    }, { threshold: [0, 0.1, 0.2, 0.3, BAND.at, 0.5, 0.6, 0.8, 1] });
    near.observe(band);
    function arrive() {
      if (wash && wash.live()) { washSection.addEventListener('washend', () => near.observe(band), { once: true }); return; }   // after the wash, never over it
      if (stage === 'done') return;
      busy = true;
      if (stage === 'letters') { letters(); return; }
      if (stage !== 'wait') return;
      if (!m) { stage = 'letters'; letters(); return; }
      const t = performance.now();
      (function ready() {
        if (m.room()) light.pass(band, { size: 'wide', when: enough, miss: () => near.observe(band), start });
        else if (performance.now() - t > 300) { still(); stage = 'letters'; letters(); }
        else setTimeout(ready, 50);
      })();
    }
    // its turn has come: the moment plays (it returns how long the light runs: until the bar has passed the letters)
    function start() {
      const room = m.room();
      if (stage !== 'wait' || !room || !m.play(room)) { still(); stage = 'letters'; setTimeout(letters, 0); return 1; }
      stage = 'moment';
      const [W, H] = m.size, cv = m.canvas, t = words();
      cv.style.setProperty('--band-w', band.clientWidth + 'px');   // the paint's calm round the words is the band's (CSS)
      cv.style.setProperty('--band-h', band.clientHeight + 'px');
      requestAnimationFrame(() => requestAnimationFrame(() => { if (cv.isConnected) cv.classList.add('on'); }));   // it comes up from nothing (its first picture is black)
      if (t) gx = Object.assign(t, { bar: window.AlchemistHero.artBar('beads', W, H, seed), y: row(), bw: band.clientWidth, on: false, gone: false });   // the letters as the bar meets them
      setTimeout(() => { if (m.canvas) m.canvas.classList.add('settle'); }, BEAD.sweep[1] * 1000);
      setTimeout(finish, BEAD.end * 1000);
      return BEAD.sweep[1] * 1000 + 200;
    }
    // the bar on the headline's row each picture: its line of light in the letters there (one pass, never joined part
    // way: a heading still setting as the bar reaches it lets it pass)
    function follow(secs, off) {
      if (!gx || gx.gone) return;
      const x = gx.bar.line(gx.bar.rest + off, gx.y) * gx.bw - gx.left, half = gx.w / 2;
      if (!gx.on) {
        if (x + half < gx.from) return;
        if (h2.classList.contains('hd-lines')) { gx.gone = true; return; }
        gx.on = true;
        h2.style.setProperty('--bar-w', gx.w + 'px');
        h2.classList.add('au-bar');
      }
      if (x - half > gx.to) { unbar(); return; }
      h2.style.setProperty('--bar-x', (x - half).toFixed(1) + 'px');
    }
    function unbar() {
      if (gx) gx.gone = true;
      h2.classList.remove('au-bar');
      h2.style.removeProperty('--bar-x');
      h2.style.removeProperty('--bar-w');
    }
    // 4s: the paint rests. The still becomes the last picture itself (drawn into it at its own size, as the stills
    // are), so it takes the canvas's place in the same frame, unseen
    function finish() {
      unbar();
      if (m.rest() && bg) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2), k = +(bg.dataset.k || 0.85);
        const w = Math.round(bg.clientWidth * dpr * k), h = Math.round(bg.clientHeight * dpr * k);
        if (w && h) {
          try {
            const [W, H] = m.size, src = m.canvas;
            if (bg.width !== w || bg.height !== h) { bg.width = w; bg.height = h; }
            bg.getContext('2d').drawImage(src, 0, src.height - H, W, H, 0, 0, w, h);
            bg.dataset.done = '1';
          } catch (e) { /* the still the stills painted stays */ }
        }
      }
      band.classList.remove('bead-arm');
      m.stop();
      stage = 'done';
      settle();
    }
    // no moment (the stills' context not up in time, or lost): the still fades in where it is painted
    function still() {
      unbar();
      if (m) m.stop();
      if (band.classList.contains('bead-arm')) { band.classList.add('bead-fade'); band.classList.remove('bead-arm'); }
      if (stage === 'moment') { stage = 'done'; settle(); }
    }
    // the letters alone take the light, once their heading is whole (none without the gold light: forced colours)
    function letters() {
      if (light.off) { stage = 'done'; settle(); return; }
      afterHead(band, () => light.pass(h2, { when: enough, miss: () => near.observe(band), start: () => { stage = 'done'; setTimeout(settle, AU_MS.el + 200); } }));
    }
    return api;
  })();
  // ---------------------------------------------------------------- the footer signs off
  // The page's last gesture (the owner's §6: the logo among the gold light's places). The first time this visit that
  // the footer comes up the screen, its centre hairline draws out from the middle (1.2s), and once the monogram is
  // wholly on the screen it takes one pass of gold light inside its own strokes (ui.js lightMark); on home both wait
  // for the closing band's light to have gone, so they are the page's last movement. Once per visit (the tab's own
  // storage; should it be blocked, it may come again on a later visit, which is harmless). On the booking, account
  // and staff pages the hairline is simply drawn and the mark takes no light (the closer to booking, the calmer), and
  // a footer already on the screen as a page opens takes it only once it has been scrolled away and back. None under
  // reduced motion, without JavaScript or in print: the hairline drawn, the mark still; in forced colours the
  // hairline draws and no light passes.
  let footRoute = () => {};   // the router calls it as a page opens
  (function signOff() {
    const mark = footer && $('.foot-brand svg', footer);
    if (!mark || reduce) return;
    let signed = false;
    try { signed = sessionStorage.getItem('ad.signed') === '1'; } catch (e) { /* storage unavailable: it signs off this time */ }
    if (signed) return;
    footer.setAttribute('data-sign', '');
    if (!light.off && window.AlchemistUI && window.AlchemistUI.lightMark) window.AlchemistUI.lightMark(mark, 'foot');
    const quiet = () => ['book', 'account', 'appointments', 'admin', 'team'].includes(cur);
    // the mark in the open: below the floating top bar (the page's scroll padding), above the screen's foot
    const BAR = 90;
    const shown = () => { const r = mark.getBoundingClientRect(); return r.top >= BAR && r.bottom <= window.innerHeight; };
    let away = false, lit = false;
    new IntersectionObserver((es, o) => {
      if (!es[es.length - 1].isIntersecting) return;
      o.disconnect();
      if (quiet()) { footer.classList.add('now', 'in'); return; }
      closing.after(() => footer.classList.add('in'));
    }, { rootMargin: '0px 0px -24px 0px' }).observe(footer);
    const markIo = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (!e.isIntersecting) { away = true; return; }
      if (e.intersectionRatio < 0.99 || !away || lit || quiet()) return;
      lit = true;
      markIo.disconnect();
      // as the hairline draws out; the visit is signed off once the light has played (one that lost its turn, the
      // mark gone from the open meanwhile, waits for the mark's next arrival)
      const sign = () => { try { sessionStorage.setItem('ad.signed', '1'); } catch (err) { /* storage unavailable */ } };
      const again = () => { lit = false; away = true; markIo.observe(mark); };
      closing.after(() => light.pass(mark, { delay: 400, when: shown, start: sign, miss: again }));
    }, { threshold: [0, 1], rootMargin: -BAR + 'px 0px 0px 0px' });
    markIo.observe(mark);
    // a page opening: the mark counts as reached only once it has been out of the open on this page
    footRoute = () => requestAnimationFrame(() => { away = !shown(); });
  })();
  // Interior (the owner's §12): the plate starts nearly black; at 35% on the screen, once its leather is painted, a
  // soft warm light crosses the quilting diagonally (1.4s), the cabin comes up to its lit state, then INTERIOR sets
  // from behind its line and the owner's line follows it. CSS draws it with transforms and opacity.
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
      setTimeout(() => headGo($('figcaption', plate)), 1500);   // INTERIOR sets from behind its line once the cabin has come up
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
    let at = -1, lastY = window.scrollY, held = performance.now() + 1200, tick = false, stickAt = 0, felt = -1e9, seen = null, jumpT = 0;
    const measure = () => { stickAt = parseFloat(getComputedStyle(bar).top) || 0; };
    // where the mark goes under a link's words (on a phone the links share out the row's spare width, their words
    // centred); only read
    function spot(a) {
      if (!a) return null;
      const words = document.createRange();
      words.selectNodeContents(a);
      const t = words.getBoundingClientRect(), box = row.getBoundingClientRect();
      return { x: (t.left - box.left + row.scrollLeft).toFixed(1) + 'px', w: Math.max(1, t.width).toFixed(1) };
    }
    // the mark put there (only written): the first appears in place, its line fading in a frame later; later ones slide
    function place(p) {
      cancelAnimationFrame(jumpT);
      ink.style.transition = '';
      if (!p) { bar.classList.remove('marked'); return; }
      ink.style.setProperty('--x', p.x);
      ink.style.setProperty('--w', p.w);
      if (bar.classList.contains('marked')) return;
      ink.style.transition = 'none';
      jumpT = requestAnimationFrame(() => { ink.style.transition = ''; bar.classList.add('marked'); });
    }
    function edges() {
      const max = row.scrollWidth - row.clientWidth;
      row.style.setProperty('--fl', row.scrollLeft > 2 ? '28px' : '0px');
      row.style.setProperty('--fr', max - row.scrollLeft > 2 ? '28px' : '0px');
    }
    // What the frame needs is read in the scroll event, where the browser has just laid the page out for it, so the
    // frame itself only writes and never lays the page out again (after a heading's new lines, say)
    function look() {
      const h = bar.offsetHeight, line = window.innerHeight * 0.42, lastGroup = groups[groups.length - 1];
      // the last group whose top has passed 42% of the screen; none above the first (the Table), the last below the end
      let i = -1;
      groups.forEach((g, k) => { if (g && g.getBoundingClientRect().top <= line) i = k; });
      const a = links[i], wide = i !== at && row.scrollWidth > row.clientWidth + 1;
      seen = {
        y: window.scrollY, i, to: i !== at ? spot(a) : null,
        // on a phone the row scrolls sideways to keep the mark in view
        left: wide ? (a ? a.offsetLeft - (row.clientWidth - a.offsetWidth) / 2 : 0) : null,
        stuck: top.getBoundingClientRect().bottom - h / 2 < stickAt + 1,
        // past Protection (the notes and the footer) there is no group to mark, and the page's end would push the bar
        // half out from under the top bar: it slides away, and comes back on the way up as usual
        past: !!lastGroup && lastGroup.getBoundingClientRect().bottom < stickAt + h,
      };
    }
    function mark(s) {
      if (s.i === at) return;
      at = s.i;
      links.forEach((a, k) => { if (k === at) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
      place(s.to);
      if (s.left != null) row.scrollTo({ left: s.left, behavior: reduce ? 'auto' : 'smooth' });
    }
    function frame() {
      tick = false;
      const s = seen;
      seen = null;
      if (cur !== 'services' || !s) return;
      const dy = s.y - lastY;
      lastY = s.y;
      let away = bar.classList.contains('away');
      if (!s.stuck || performance.now() < held || bar.contains(document.activeElement)) away = false;
      else if (s.past) away = true;
      else if (dy > 4 && performance.now() - felt < 700) away = true;
      else if (dy < -4) away = false;
      bar.classList.toggle('away', away);
      bar.classList.toggle('stuck', s.stuck);   // held under the top bar: the two bars cover the page between them (CSS)
      mark(s);
    }
    const soon = () => { if (cur !== 'services') return; look(); if (!tick) { tick = true; requestAnimationFrame(frame); } };
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
    const again = () => { measure(); edges(); if (at >= 0) place(spot(links[at])); soon(); };
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
      if (cur === 'home') unplan();   // the studio light's entrance, if it is still to come or playing, ends with the page
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
      if (view === 'home') startHero(first);
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
      footRoute();   // (after the page's own scroll, in the next frame)
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
  // A new head in it (the featured review's on home) still sets as it arrives; a page seen before shows it set.
  const ARM = '[data-reveal], ' + HEADS + ', ' + RISE.join(', ');
  let armT = 0, landed = [];
  new MutationObserver((muts) => {
    // (a heading's own lines, swapped in and out as it sets, are not new content)
    muts.forEach((m) => { if (m.target.classList && (m.target.classList.contains('hd-lines') || m.target.matches('[data-hd="h"]'))) return; m.addedNodes.forEach((n) => { if (n.nodeType === 1) landed.push(n); }); });
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
      // (the customer's own input: Continue's shine gives way to it)
      nodes.forEach((n) => (n.matches('.bk-progress') ? [n] : $$('.bk-progress', n)).forEach((ol) => { const li = $('li.current.fresh', ol); if (li) light.pass(li, { delay: 200, now: true }); }));
      if (!nodes.some((n) => n.matches(ARM) || n.querySelector(ARM))) return;
      if (view.dataset.armed) {
        nodes.forEach((n) => armHeads(n));
        nodes.forEach((n) => (n.matches('[data-reveal]') ? [n] : []).concat($$('[data-reveal]', n)).forEach((el) => { if (el.closest('[data-head]')) return; el.classList.add('in', 'settled'); io.unobserve(el); }));
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
    rowArm();   // the row's light after the wash (no wash: the first time the row is half on the screen; no light: none)
    artReady = true;
    paintArt();
  }
  const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 }) : (fn) => setTimeout(fn, 600);
  ['wheel', 'touchstart', 'keydown', 'scroll'].forEach((t) => window.addEventListener(t, () => idle(startHeavy), { once: true, passive: true }));
  // (while the studio light is still gliding in, they wait for it to slow: plan())
  setTimeout(() => setTimeout(() => idle(startHeavy), Math.max(0, glideEnd - performance.now())), reduce ? 0 : 3200);
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
