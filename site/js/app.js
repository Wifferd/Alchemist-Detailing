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
      busyUntil = it.until = performance.now() + it.ms + 60;
      if (it.now) yieldShines();
      holdShines(it.ms + 240);
      // a band that slides (sweep) starts and ends just outside its frame however tall the frame is (a phone's
      // closing band, a tall card): the 118deg tilt needs more reach the taller the frame is for its width
      const r = el.getBoundingClientRect();
      el.style.setProperty('--au-reach', reach(r));
      el.classList.remove('au-run');
      void el.offsetWidth;
      el.classList.add('au-run', 'au-lit');
      it.end = setTimeout(() => ended(it), it.ms + 60);
    }
    function ended(it) {
      it.el.classList.remove('au-run');
      cur = null;
      setTimeout(next, 120);
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
      // the pass playing on el takes in more (the Table's turn, joined by Au's gold): it holds the light until ms from
      // now at least, and the shines on the screen wait for that too; false if el's pass is not the one playing
      extend(el, ms) {
        if (off || !cur || cur.el !== el) return false;
        const it = cur, until = Math.max(it.until, performance.now() + ms + 60);
        clearTimeout(it.end);
        busyUntil = it.until = until;
        holdShines(until - performance.now() + 180);
        it.end = setTimeout(() => ended(it), until - performance.now());
        return true;
      },
      // a shine back on the screen (its pause lifted): one caught part way across waits its turn
      settle(el) { if (!off) settle(el, true); },
      // no light here at all (reduced motion, forced colours): what would wait for one is simply there
      get off() { return off; },
    };
  })();
  window.AlchemistLight = light;
  // Arrivals: the Services header, a brand page's title, the Gold client card and the Bundles photo plate get their
  // pass once a third of them is on the screen, after their own entrance has landed. One that scrolled away before its
  // turn gets it when it comes back. (An appointment takes its pass when it is first opened: account.js; home's
  // closing band and the other Services plates have moments of their own: closing(), rinse(), cabin(), protection().)
  // A brand page's title sets from behind its line first (the heads): its pass, inside the letters, waits until the
  // heading is whole again.
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
    finishDark();   // (a page chosen in it a moment ago, still in its cut: done at once)
    menuOpen = true;
    menu.classList.remove('chose');   // the last choice's gold line goes with it
    scrim.classList.remove('cut', 'bare');
    $$('nav a.chosen', menu).forEach((a) => a.classList.remove('chosen'));
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
    // the page you are on takes the gold light once its word has risen (110ms press, 140ms + 28ms a step, .45s): the
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
  const held = new WeakSet();   // what comes after the wash on home, waiting for washend (or for its page's opening: data-hold)
  // An arrival is only noted where it is found (the observer, a page opening, washend). In the next frame the rooms
  // and the blocks go in (their light comes up first; a block under a head still to set waits for it). The heads are
  // read in a frame of their own (the lines as laid out, whether the head before is still on the screen), and their
  // lines are swapped in after the reading, while the heading is still unseen; each head then sets in the frame after
  // that by its classes alone, and the blocks under it follow a frame later again. So no frame lays the page out
  // twice, and no frame carries the room's light, the new lines and the head's setting together.
  const due = new Set();
  let dueFrame = 0;
  // A page coming out of the cut through black (the router): its reveals and its own moments (afterCut) wait until it
  // shows (cutHeld), so its heading sets from its line as the page rises; cutGo lets them go (CUT_IN into a view
  // transition: its 200ms and the beat, less the frames a head takes to set; the shade's cut: as it lifts).
  const CUT_IN = 240;
  let cutHeld = null;   // { els: what to reveal (and whether late), fns: moments to start, scope: the page }
  let cutShown = -1e9;   // when the last cut's page showed (the shaders' compile waits for its rise: startHeavy)
  function cutGo(c) {
    if (!c || cutHeld !== c) return;
    cutHeld = null;
    cutShown = performance.now();
    if (c.scope) revealAbove(c.scope);
    c.els.forEach((late, el) => reveal(el, late));
    c.fns.forEach((fn) => fn());
  }
  const afterCut = (fn) => { if (cutHeld) cutHeld.fns.push(fn); else fn(); };
  // (the Gallery's covers and seam, gallery.js; About's photo, content.js, after its heading has led: afterLead)
  window.AlchemistCut = { after: afterCut, afterHead: (el, fn) => afterCut(() => afterLead(el, fn)) };
  function reveal(el, late) {
    if (el.classList.contains('in') || held.has(el) || ownMoment(el)) return;
    if (cutHeld) { cutHeld.els.set(el, late || cutHeld.els.get(el) || false); return; }
    // after the wash, everything waits for its end together (the heads, the rooms and the blocks under them), so a
    // card never rises ahead of its heading while the drops are still drying
    if (!late && afterWash(el)) {
      held.add(el);
      const go = () => { if (held.delete(el)) reveal(el, true); };
      washSection.addEventListener('washend', go, { once: true });
      setTimeout(go, 2500);   // should it not come: never an empty head on the screen
      return;
    }
    // a page that opens on a moment of its own first (About's mark, content.js trace): what is on it waits for the
    // moment's release, then arrives in its usual order
    const hold = !late && el.closest('[data-hold]');
    if (hold) {
      held.add(el);
      const go = () => { if (held.delete(el) && el.isConnected) reveal(el, true); };
      hold.addEventListener('release', go, { once: true });
      setTimeout(go, 4500);   // should it not come: never an empty page
      return;
    }
    if (priceGate(el)) return;   // a price card: once its figure is confirmed (or 600ms)
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
    const pc = !now && pcLive.has(el) && el.hasAttribute('data-rise');   // a price card whose figure is the database's
    if (pc) priceSet(el);
    el.classList.add('in');
    if (el.hasAttribute('data-rise')) setTimeout(() => { el.removeAttribute('data-rise'); el.style.removeProperty('--k'); el.style.removeProperty('--after'); if (pc) el.classList.remove('pc-set'); }, (pc ? PC.end : 1000) + after);
  }
  // a plate's title whose moment sets it (Exterior's rinse, Interior's cabin, Protection's beading: headGo, as the
  // sheet clears, the cabin comes up or the photo is back), never an arrival, a page opening or a jump to the group
  const ownMoment = (el) => el.hasAttribute('data-head') && !!el.closest('.wet, .cabin, .beading');
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
      // (a line its plate's moment shows itself, data-own: Interior's, word by word with the cabin's lights, is not one)
      $$(':scope > p:not(.eyebrow, [data-own]), :scope > .actions, :scope > .work-nav', c).forEach((f, i) => { f.setAttribute('data-hd', 'f'); f.style.setProperty('--f', i); });
      $$('.rule', c).forEach((r) => io.observe(r));
      if (!c.closest('.wet, .cabin, .beading')) io.observe(c);   // a plate with a moment of its own sets its title itself
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
    const fw = leadWaits.get(c);
    if (fw) { leadWaits.delete(c); fw.forEach((fn) => setTimeout(fn, now ? 0 : followHead(c))); }
    const w = waits.get(c);
    if (!w) return;
    waits.delete(c);
    const go = () => { const list = [...w]; w.clear(); list.forEach((el) => rise(el)); };
    if (now) go(); else requestAnimationFrame(go);
  }
  // A page's own moment that follows its heading (About's photo): it starts as the head's lead does, as the blocks
  // under the head rise; at once where that head has set already or there is none (2s at most, whatever happens)
  const leadWaits = new Map();
  function afterLead(el, fn) {
    const c = headAbove(el);
    if (!c) { fn(); return; }
    if (c.classList.contains('in')) { setTimeout(fn, followHead(c)); return; }
    let done = false;
    const go = () => { if (!done) { done = true; fn(); } };
    if (!leadWaits.has(c)) leadWaits.set(c, []);
    leadWaits.get(c).push(go);
    setTimeout(go, 2000);
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
  // The figures arrive set (the owner, Oct 23: no number counts up). A price card waits for the database to confirm
  // its figure (services.js priced(), 600ms at most from its arrival), then arrives with it (CSS .pc-set): its name
  // fades in, its figure rises from behind its own baseline 120ms later (its digits in a span, .pc-fig, that moves
  // inside the figure's still box, .pc-slot, until they have landed), the time, mobile and where cells follow 80ms apart and the
  // short line under them draws. A Deluxe's or the Full Detail Bundle's figure lands in a softer ink (.pc-ink) and,
  // once it has landed, its turn in the light's queue turns it gold behind the light's edge, where it stays; the
  // Basic figures land gold. A figure the database has not
  // confirmed by then (a preview, a slow answer) arrives with its card, gold, as it always has, and one the menu
  // writes again later is simply shown (services.js put). Not under reduced motion (armReveals stops first), without
  // JavaScript or in print: the cards are set.
  const PC = { cap: 600, end: 1800, late: 2400 };   // the wait for the database; the arrival's end; the light's latest start
  const pcAsked = new WeakSet(), pcLive = new WeakSet();
  function priceGate(el) {
    if (pcAsked.has(el) || !el.matches('.price-card') || !$('.amount', el)) return false;
    pcAsked.add(el);
    const S = window.AlchemistServices, asked = S && S.priced ? S.priced() : Promise.resolve(false);
    Promise.race([asked, new Promise((res) => setTimeout(res, PC.cap, false))]).then((ok) => {
      if (ok === true) pcLive.add(el);
      reveal(el, true);
    });
    return true;
  }
  function priceSet(el) {
    el.classList.add('pc-set');
    const a = $('.amount', el), lead = el.classList.contains('featured') && !light.off;
    if (!a.children.length) {
      const fig = document.createElement('span');
      fig.className = 'pc-fig';
      fig.textContent = a.textContent;
      a.replaceChildren(fig);
      a.classList.add('pc-slot');
    }
    if (lead) a.classList.add('pc-ink');
    let landed = false, t = 0;
    const land = (e) => {
      if (landed || (e && e.animationName !== 'pcUp')) return;
      landed = true;
      clearTimeout(t);
      a.removeEventListener('animationend', land);
      // the slot goes (a change of style only: the digits stay in their span, still and in place), and the light is
      // asked for from a task of its own, outside the frame that reported the landing; scrolled away before its
      // turn, the figure simply turns gold
      a.classList.remove('pc-slot');
      if (lead) setTimeout(() => { if (!a.classList.contains('au-lit')) light.pass(a, { when: () => !a.classList.contains('au-lit'), miss: () => a.classList.add('au-lit') }); }, 0);
    };
    a.addEventListener('animationend', land);
    t = setTimeout(land, PC.late);   // should the landing never be reported
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
  // reflection (--hx) follows it across the screen, like light on polished paint. Over a strip photo the inspection
  // light comes with it (CSS .insp-lamp): it lands under the pointer, then trails it from the next frame on (.lamp).
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
        if (!t.classList.contains('glint') && t.matches('.work-item')) requestAnimationFrame(() => requestAnimationFrame(() => { if (t.classList.contains('glint')) t.classList.add('lamp'); }));
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
    document.addEventListener('pointerout', (e) => { const t = e.target.closest && e.target.closest('.glint'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('glint', 'lamp'); }, { passive: true });
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
  // The browser's view transitions: a page change (the router) and the light switch (below), one at a time, each
  // keyed to its own classes on html (vt-route, vt-theme). Each is timed to its first frame (the screen holds still
  // while the browser takes its pictures): a device that took over 300ms, ran out of time (4s), or twice took over
  // 150ms (or a swap over 50ms) takes no more for the visit (still: ad.cut). Then the light switch is instant and pages
  // change through the shade's cut, which takes no picture.
  let vtNow = null, still = false, slow = 0;
  try { still = sessionStorage.getItem('ad.cut') === 'still'; } catch (e) { /* storage unavailable */ }
  function gauge(ms, upd) {
    if (still || (ms <= 150 && upd <= 50)) return;
    if (ms <= 300 && ++slow < 2) return;
    still = true;
    try { sessionStorage.setItem('ad.cut', 'still'); } catch (e) { /* storage unavailable */ }
  }
  const VT = ['vt-route', 'vt-back', 'vt-theme', 'vt-lights', 'vt-dim'];
  function transition(cls, update, hold) {
    if (vtNow) vtNow.skipTransition();
    root.classList.remove(...VT);
    root.classList.add(...cls);
    glassBar.classList.toggle('vt-hold', !!hold);   // the bar on a layer of its own (a page change): its class, so nothing else restyles
    const t0 = performance.now();
    let upd = 0, ran = false;
    const t = document.startViewTransition(() => { ran = true; const s = performance.now(); update(); upd = performance.now() - s; });
    t.route = !!hold;   // (a page change: its update is the swap)
    t.ran = () => ran;
    vtNow = t;
    const end = () => { if (vtNow !== t) return; vtNow = null; root.classList.remove(...VT); glassBar.classList.remove('vt-hold'); };
    t.finished.then(end, end);
    // skipped before its first frame, its update runs all the same; a timeout counts as the longest wait, a skip after
    // 300ms as that wait (in a hidden tab nothing counts)
    t.ready.then(() => gauge(performance.now() - t0, upd), (e) => {
      const ms = performance.now() - t0;
      if (document.hidden) return;
      if (e && e.name === 'TimeoutError') gauge(Infinity, upd); else if (ms > 300) gauge(ms, upd);
    });
    return t;
  }
  // Light mode (the white studio, doc 29): a toggle in the menu, remembered on this device (the head script
  // applies the saved theme before the first paint). Where the browser has view transitions the studio lights come
  // on: a soft white softbox band crosses the page at the site's 118deg and leaves the ivory showroom behind it
  // (.9s); back to Dark, the light dims from the edges in (.6s; CSS vt-lights, vt-dim). Otherwise every colour
  // cross-fades under html.theming (CSS). Under reduced motion, and on a device slow to take the browser's pictures
  // (still, above), the switch is instant: its still frame.
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
    let lit = isLight();   // the theme asked for (a second press may come before the first one's switch has run)
    // (a switch's update applies the theme last asked for, so one still to run never undoes a later press)
    const apply = () => {
      if (lit) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
      paint();
    };
    btn.addEventListener('click', () => {
      const light = (lit = !lit);
      try { localStorage.setItem('ad.theme', light ? 'light' : 'dark'); } catch (e) { /* storage unavailable */ }
      if (!document.startViewTransition || reduce) { root.classList.add('theming'); apply(); setTimeout(() => root.classList.remove('theming'), 500); }   // (under reduced motion html.theming has no transitions: at once)
      else if (still) { if (vtNow) vtNow.skipTransition(); apply(); }   // the still frame, at once (the cross-fade's transitions on every element would cost a slow device more)
      else transition(['vt-theme', light ? 'vt-lights' : 'vt-dim'], apply);   // a second press ends the first at once
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
  // ---------------------------------------------------------------- the inspection light (the owner's photos)
  // The detailer's hand light, held close to the panel (CSS .insp): when their turn in the light's queue comes, one
  // light crosses the photos left to right on a shallow arc (cross), lifting each one's exposure as it passes, and
  // they stay lit. The Gallery's first covers (gallery.js) rise in a little under their exposure and wait for it
  // (wait); the home strip's photos take the shade as their light comes on (fade). Laid out as it starts, from the
  // photos' places on the screen: one path, so each photo's light and shade (all transforms, one curve and one clock)
  // read as one light crossing them, a row or a few rows at once. Everything is measured when the pass's turn comes
  // and written in the next frame, on each photo's own .insp layer, so nothing else is restyled. Nothing under reduced
  // motion or in forced colours: the photos are simply there.
  const inspect = (() => {
    const on = !light.off;
    const VARS = ['--ir', '--ie', '--iw', '--pvx', '--pvy', '--arm', '--ia', '--idur', '--ie0', '--ie1'];
    const boxOf = (tile) => (tile ? tile.querySelector(':scope > .insp') : null);
    // the light's parts in a photo (once): its shade, the light's glow and hot core, the pointer's light
    function prep(tile) {
      if (!on || !tile || boxOf(tile)) return;
      const box = document.createElement('span');
      box.className = 'insp';
      box.setAttribute('aria-hidden', 'true');
      box.innerHTML = '<i class="insp-shade"></i><i class="insp-glow"></i><i class="insp-hot"></i><i class="insp-lamp"></i>';
      tile.insertBefore(box, tile.querySelector(':scope > figcaption'));
    }
    const wait = (tiles) => { if (on) tiles.forEach((t) => { prep(t); boxOf(t).classList.add('wait'); }); };
    // photos whose light will not come (they left the screen before their turn): their shade lifts quietly
    function lift(tiles) {
      const boxes = tiles.map(boxOf).filter((b) => b && b.classList.contains('wait') && !b.classList.contains('lift'));
      if (!boxes.length) return;
      requestAnimationFrame(() => boxes.forEach((b) => {
        b.classList.add('lift');
        setTimeout(() => b.classList.remove('wait', 'lift'), 640);   // the lift's --dur-rise (600ms), and a frame
      }));
    }
    // the light crosses these photos (o.pick: those whose box it passes), from just outside the first one on the
    // screen to just past the last, on an arc through the part of them on the screen; returns how long it runs.
    // o.fade: their shade comes on with the light; o.max: the longest it may run; o.done: called once it has crossed
    // them all.
    function cross(tiles, o) {
      o = o || {};
      if (!on) return 0;
      // every read first, on the page as it is
      const vw = window.innerWidth, vh = window.innerHeight;
      const box = tiles.filter((t) => t.isConnected).map((t) => ({ t, b: boxOf(t), r: t.getBoundingClientRect(), w: t.offsetWidth, h: t.offsetHeight }))
        .filter((x) => x.b && x.w && (!o.pick || o.pick(x.r)));
      if (!box.length) return 0;
      const w = Math.min(...box.map((x) => x.w));
      const top = Math.min(...box.map((x) => x.r.top)), bottom = Math.max(...box.map((x) => x.r.top + x.h));
      // the arc's band: the part of the first row's photos on the screen (all of it, or a strip's upper part just come
      // on); in at 54% of it, up to 38% halfway across, out at 54%, on an arm turning about a point far below (its
      // length from the span and the arc's rise). Over a few rows (a screen of covers) the light keeps to the first
      // row, clear of the captions and the gaps, and its glow widens to reach into the row under it, whose shade
      // lifts with the same edge.
      const h = Math.min(...box.filter((x) => x.r.top - top < 8).map((x) => x.h));
      const seen = Math.max(0, -top), band = Math.max(h * 0.3, Math.min(h, vh - top) - seen), rows = Math.min(bottom, vh) - Math.max(top, 0);
      // the light's reach (its glow fades out at R); the shade starts just past its core and is whole where its glow ends
      const R = Math.round(Math.min(260, Math.max(w * 0.42, rows > band + 8 ? rows * 0.36 : 0))), lead = Math.round(R * 0.9), soft = Math.round(R * 0.8);
      const xs = Math.max(0, Math.min(...box.map((x) => x.r.left))) - R, xe = Math.min(vw, Math.max(...box.map((x) => x.r.left + x.w))) + R;
      const peak = seen + band * 0.38, rise = band * 0.16, half = (xe - xs) / 2;
      const arm = (half * half + rise * rise) / (2 * rise), ang = Math.asin(Math.min(1, half / arm)) * 180 / Math.PI;
      // about a hand's pace, on the light's own times: 1.2s across a phone, 1.4s, 1.8s across a wide screen
      const pace = (xe - xs) * 1.15, times = [AU_MS.el, AU_MS.card, AU_MS.wide].filter((t, i) => !i || !o.max || t <= o.max);
      const ms = times.reduce((a, b) => (Math.abs(b - pace) < Math.abs(a - pace) ? b : a));
      // then every write, in the next frame, on each photo's own light layer
      requestAnimationFrame(() => {
        let left = box.length;
        box.forEach((x) => {
          const x0 = xs - x.r.left, x1 = xe - x.r.left, s = x.b.style, px = (n) => n.toFixed(1) + 'px';
          s.setProperty('--ir', R + 'px');
          s.setProperty('--ie', soft + 'px');
          s.setProperty('--iw', px(Math.max(x.w, x.w - (x0 + lead - soft)) + 2));   // solid to the photo's right edge from its first place on
          s.setProperty('--pvx', px((xs + xe) / 2 - x.r.left));
          s.setProperty('--pvy', px(top - x.r.top + peak + arm));
          s.setProperty('--arm', px(arm));
          s.setProperty('--ia', ang.toFixed(3) + 'deg');
          s.setProperty('--idur', ms + 'ms');
          s.setProperty('--ie0', px(x0 + lead - soft));
          s.setProperty('--ie1', px(x1 + lead - soft));
          x.b.classList.add('go');
          if (o.fade && !x.b.classList.contains('wait')) x.b.classList.add('fade');
          x.b.classList.remove('wait', 'lift');
          // the pass ends with its layers, on the shade's own last frame (or, should that never come, a little later):
          // the photo at rest, at its exposure
          const shade = x.b.firstElementChild;
          let t = 0;
          const end = (e) => {
            if (e && (e.target !== shade || e.animationName !== 'inspShade')) return;
            shade.removeEventListener('animationend', end);
            clearTimeout(t);
            x.b.classList.remove('go', 'fade');
            VARS.forEach((k) => s.removeProperty(k));
            if (--left === 0 && o.done) o.done();
          };
          shade.addEventListener('animationend', end);
          t = setTimeout(end, ms + 600);
        });
      });
      return ms;
    }
    // the photos' pictures decoded (or a second and a half gone), so the light never crosses an empty frame
    const decoded = (tiles) => Promise.race([
      Promise.all(tiles.map((t) => { const i = t.querySelector('img'); return i && i.decode ? i.decode().catch(() => {}) : null; })),
      new Promise((res) => setTimeout(res, 1500)),
    ]);
    // (a page's photos wait for its title to set first: their light comes after the title's own, in reading order)
    return { on, prep, box: boxOf, wait, lift, cross, decoded, afterHead: (c, fn) => afterHead(c, fn) };
  })();
  window.AlchemistInspect = inspect;
  // Home's strip: after the wash (washend), once 40% of it is on the screen (or a visitor has stopped short of that
  // for 2.5s), its head has set and its pictures are decoded, the photos in view take the shade and the light crosses
  // them, once per visit. Until then they are simply at their exposure, so they never sit waiting in the shade. A strip
  // that has left the screen before the light's turn gets it when it comes back; one whose turn has not come 6s on
  // simply stays as it is.
  const workStrip = $('#workStrip');
  let stripArmed = false, stripLit = false, stripEarly = false;
  if (workStrip) $$('.work-item', workStrip).forEach(inspect.prep);   // the pointer's light, from the start
  function stripArm() {
    if (stripArmed) return;
    stripArmed = true;
    if (!workStrip || !inspect.on) return;
    if (wash && wash.live()) washSection.addEventListener('washend', stripWatch, { once: true });
    else stripWatch();
  }
  // the strip's photos on the screen (a sliver at its edge counts once it is 24px wide)
  const stripShows = (r) => Math.min(r.right, innerWidth) - Math.max(r.left, 0) >= 24;
  const stripInView = () => $$('.work-item', workStrip).filter((t) => stripShows(t.getBoundingClientRect()));
  const stripSeen = (f) => { const r = workStrip.getBoundingClientRect(), v = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0); return r.height > 0 && v >= Math.min(r.height, innerHeight) * f; };
  let stripStall = 0;
  const stripOn = () => { stripIo.disconnect(); clearTimeout(stripStall); stripStall = 0; stripGo(); };
  const stripIo = new IntersectionObserver(() => {
    if (!stripSeen(0.001)) return;
    if (!stripEarly) { stripEarly = true; inspect.decoded(stripInView()); }   // the pictures start decoding as the strip comes on
    if (stripSeen(0.4)) stripOn();
    else if (!stripStall) stripStall = setTimeout(() => { stripStall = 0; if (stripSeen(0.15)) stripOn(); }, 2500);
  }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5] });
  function stripWatch() { if (!stripLit) stripIo.observe(workStrip); }
  function stripGo() {
    let started = false, el = null;
    const safe = setTimeout(() => { if (!started) { stripLit = true; light.stop(el); } }, 6000);
    // (each step from the next frame on, where the page is laid out anyway: no read forces a restyle of its own)
    afterHead($('#work [data-head]') || $('#work .section-head'), () => requestAnimationFrame(() => {
      const tiles = stripInView();
      inspect.decoded(tiles).then(() => requestAnimationFrame(() => {
        if (stripLit) return;
        // its turn in the queue is held by the first photo's light layer (a small box: its marks restyle nothing else)
        el = inspect.box(tiles[0]) || workStrip;
        light.pass(el, {
          size: 'wide', when: () => stripSeen(0.12),
          miss: () => { clearTimeout(safe); stripWatch(); },
          start: () => {
            started = true;
            clearTimeout(safe);
            stripLit = true;
            return inspect.cross($$('.work-item', workStrip), { pick: stripShows, fade: true });
          },
        });
      }));
    }));
  }
  // ---------------------------------------------------------------- home, after Our work: the featured review and two doorways
  // The doorways quote the approved Tips and About words (content.js); the review slot stays empty until the owner
  // has approved a real review (reviews.js asks once, as the visitor nears Why Alchemist).
  if (window.AlchemistContent && window.AlchemistContent.mountDoors) window.AlchemistContent.mountDoors($('#doors'));
  if (window.AlchemistReviews && window.AlchemistReviews.mountFeatured) window.AlchemistReviews.mountFeatured($('#featured'), $('#why'));
  // (The services page's photo plates drift the same way, on the browser's own scroll timeline: CSS plateDrift.)

  // ---------------------------------------------------------------- the services plates' moments (one each, played once)
  // Each room has its own: Exterior's sheet of water runs off, Interior's door closes and its cabin lights up,
  // Protection beads up live and the light hands over to the real photo, each the first time its plate comes on the
  // screen, and each as one turn in the light's queue, so only one room plays at a time and no gold light crosses with
  // it. Under reduced motion and in forced colours none plays: the plates show their still pictures and titles.
  const calm = reduce || window.matchMedia('(forced-colors: active)').matches;
  const onceSeen = (el, o, fn) => {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); afterCut(fn); } }, o);   // (a page out of the cut: once it shows)
    io.observe(el);
  };
  // A room's turn in the light's queue. When the queue reaches it, it plays only if its plate is still a quarter on
  // the screen (of the plate, or of the screen for a plate taller than it: roomWhen); one passed by meanwhile waits to
  // be seen again (its miss). It holds the queue for its run (ms) only while its plate is on the screen: a room left
  // before its run is over (a fast scroll past, a jump with the chapter bar) gives the queue back at once, so the room
  // the visitor lands on never waits behind it. Its own layers and timers carry on to its end state off the screen, or
  // away() takes it there at once.
  const roomWhen = (plate) => () => {
    const r = plate.getBoundingClientRect(), seen = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return r.height > 0 && seen / Math.min(r.height, window.innerHeight) >= 0.25;
  };
  function roomTurn(plate, ms, away) {
    let t = 0;
    const io = new IntersectionObserver((es) => {
      if (es[es.length - 1].isIntersecting) return;
      io.disconnect();
      clearTimeout(t);
      light.stop(plate);
      if (away) away();
    });
    t = setTimeout(() => io.disconnect(), ms);
    io.observe(plate);
    return ms;
  }
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
  // unmoved), travel(secs) (how far along that way the light is, 0 to 1; left out, BEAD.sweep's pass), before (the
  // node the canvas goes in front of), frame(secs, off) (after each picture; off: the light's offset then), lost()
  // (the context was lost: it has stopped) }
  const BEAD = { light: [0.3, 1.9], form: [0.2, 2.4], sweep: [1.2, 2.8], roll: [1.6, 3.6], end: 4 };   // seconds
  const inOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const span = (secs, [a, b]) => Math.min(1, Math.max(0, (secs - a) / (b - a)));
  // the light's travel as the shader takes it: from and to as offsets on its way, from v0 to v1 of sweepRange
  const sweepOf = (from, to) => { const range = 2 * Math.max(Math.abs(from), Math.abs(to), 0.05); return { range, v0: 0.5 + from / range, v1: 0.5 + to / range }; };
  function beadMoment(host, o) {
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    let cv = null, raf = 0, t0 = 0, last = 0, seen = true, W = 2, H = 2, way = sweepOf(0, 0);
    const watch = new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; });
    const sweep = (secs) => way.v0 + (way.v1 - way.v0) * (o.travel ? o.travel(secs) : inOut(span(secs, BEAD.sweep)));
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
  // Exterior (the owner's §4, §9 and §21: water on paint): the caliper and the wheel wait dim under a thin, cool sheet
  // of water. Once a third of the plate is on the screen the sheet runs off at the light's angle (1.4s), its trailing
  // edge one bright cool line, the crest that rinsed the foam off on home; behind it the paint is wet-black and lit.
  // As the sheet clears, the index and EXTERIOR rise. Clear water only, never a dirty "before". CSS draws it and only
  // its transform moves; its layer goes once the sheet is off the plate. Not a gold light, so Bundles keeps the plates'
  // gold pass to itself.
  (function rinse() {
    const plate = $('#svc-exterior .group-plate.rinse');
    if (!plate || calm) return;
    const cap = $('figcaption', plate), film = document.createElement('span');
    film.className = 'rinse-film';
    film.setAttribute('aria-hidden', 'true');
    plate.insertBefore(film, $('.plate-no', plate));
    plate.classList.add('wet');
    // The sheet's frame is turned to the light's angle (--au-angle, 118deg: 28deg off upright), so its own x runs
    // across the crest (n) and its y along it (t). It is placed from the plate's size before each picture of a new
    // size (a ResizeObserver: the services page opening, a new width): its crest just left of the plate's top left
    // corner, the sheet ahead of it covering the plate, and --run its way until the glaze behind it has left the
    // plate's far corner too.
    const a = 28 * Math.PI / 180, n = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
    function place() {
      const W = plate.clientWidth, H = plate.clientHeight;
      if (!W || !H || !film.isConnected) return;
      const across = W * n[0] + H * n[1], along = -W * t[0] + H * t[1];   // the plate's extent in the frame's two directions
      const tail = Math.round(0.14 * across), bloom = 40, m = 24;
      const s0 = -bloom - tail, y0 = W * t[0] - m;   // the frame's top left corner, in n and t
      film.style.left = (s0 * n[0] + y0 * t[0]).toFixed(1) + 'px';
      film.style.top = (s0 * n[1] + y0 * t[1]).toFixed(1) + 'px';
      film.style.width = Math.ceil(tail + bloom + across + m) + 'px';
      film.style.height = Math.ceil(along + 2 * m) + 'px';
      film.style.setProperty('--tail', tail + 'px');
      film.style.setProperty('--run', Math.ceil(across + tail + 2 * bloom) + 'px');
    }
    const sized = window.ResizeObserver ? new ResizeObserver(place) : null;
    if (sized) sized.observe(plate); else window.addEventListener('resize', place);
    let done = false;
    function clear() {
      if (!film.isConnected) return;
      film.remove();
      if (sized) sized.disconnect(); else window.removeEventListener('resize', place);
    }
    // its turn has come: the sheet runs off; the index and the title rise as it clears the plate (it has long passed
    // them, at the top left and the foot's left)
    function run() {
      if (done) return 1;
      done = true;
      place();
      plate.classList.add('rinsing');
      setTimeout(() => { plate.classList.add('risen'); headGo(cap); }, 1150);
      film.addEventListener('animationend', clear, { once: true });
      setTimeout(clear, 1700);   // should the end never come (a hidden page)
      setTimeout(() => plate.classList.remove('wet', 'rinsing', 'risen'), 2600);
      return roomTurn(plate, 1400);
    }
    const arrive = () => light.pass(plate, { delay: 150, start: run, when: roomWhen(plate), miss: () => onceSeen(plate, { threshold: 0.33 }, arrive) });
    // the photo first: it loads lazily, and on a page opened right here (#services-exterior) or on a slow phone it can
    // still be on its way, so the sheet waits until it is decoded (1.5s at most), never running off an empty plate
    const img = $('img', plate);
    function photo(fn) {
      let go = false;
      const once = () => { if (!go) { go = true; fn(); } };
      const load = () => img.addEventListener('load', once, { once: true });
      if (!img || !img.decode) { if (img && !(img.complete && img.naturalWidth)) load(); else once(); }
      else img.decode().then(once, load);
      setTimeout(once, 1500);
    }
    onceSeen(plate, { threshold: 0.33 }, () => photo(arrive));
  })();
  // Protection (the owner's §11): at 40% on the screen the paint beads up live (the bead moment): the light comes up in
  // the left third of the paint while the drops form, then passes through them, and keeps going: it crosses the whole
  // paint and leaves it at the right (2.1-3.7s), and in its wake the owner's real photo of beading is uncovered by a
  // soft edge at the light's own angle riding just behind it (the canvas is masked, frame by frame, from where the bar
  // is: the same numbers as the shader, artBar), the photo coming up from dark. So the gold-lit paint and the daylight
  // photo read as one light reaching the real car. The title rises as the edge reaches the far side, and the canvas
  // stops as soon as the edge has cleared the plate (4s at most). Its scene's time runs on with the moment. On a page
  // that has only just opened here (#services-protection), before the stills' context is up, it waits at most 300ms,
  // then the photo fades in and the title rises. A context lost on the way ends it at once: the photo and the title.
  const HAND = { sweep: [2.1, 3.7], close: [2.1, 2.8], soft: 0.14, lag: 0.035 };   // seconds; the edge's softness and its lag behind the bar's line (parts of the plate across the light)
  (function protection() {
    const plate = $('#svc-protection .group-plate');
    if (!plate || calm || !glOk || !window.AlchemistHero || !window.AlchemistHero.artBar) return;
    plate.classList.add('beading');
    const shade = document.createElement('span');   // the photo's exposure: under the paint, over the photo
    shade.className = 'hand-shade';
    shade.setAttribute('aria-hidden', 'true');
    plate.insertBefore(shade, $('img', plate).nextSibling);
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    let done = false, hand = null;
    const cap = $('figcaption', plate);   // its title sets as the photo is back (headGo)
    const TIME = 13.7;   // the scene's time as the moment starts
    // where the light comes up (in the left third: at this time of the scene the bar's own drift holds it near -0.3;
    // ext: the paint's half-width along the light's axis in the shader's units) and where it leaves the paint: its line
    // past the plate's far corner by the edge's softness and lag, so the photo is whole when it has gone
    function path(W, H) {
      const ext = 0.675 * (W / H * 0.82 + 0.57), bar = window.AlchemistHero.artBar('beads', W, H, TIME + HAND.sweep[1]);
      const g = geometry(W, H, bar), k = (g.len * (HAND.soft + HAND.lag) + 24) / g.len;   // (the edge's far side, its lag and a margin)
      return [-0.55 * ext + 0.3, bar.level(1 + k * g.d[0] * g.len / g.pw, 1 + k * g.d[1] * g.len / g.ph) - bar.rest];
    }
    // the plate across the light: the bar's direction there (d: across its line, toward where it goes, in the plate's
    // pixels), the mask's CSS angle and the plate's length along d
    function geometry(W, H, bar) {
      const pw = plate.clientWidth, ph = plate.clientHeight, L = bar.rest;
      const dx = ph, dy = (bar.line(L, 0) - bar.line(L, 1)) * pw, r = Math.hypot(dx, dy) || 1;
      const d = [dx / r, dy / r];
      return { pw, ph, d, deg: Math.atan2(d[0], -d[1]) * 180 / Math.PI, len: pw * Math.abs(d[0]) + ph * Math.abs(d[1]) };
    }
    // the light's way: up in its place until 2.1s, then across the paint and off it (one pass, --ease-in-out's curve)
    const travel = (secs) => inOut(span(secs, HAND.sweep));
    const m = beadMoment(plate, { time: TIME, run: true, studio: false, path, travel, before: cap, frame: follow, lost: end });
    // the edge each picture, just behind the bar's line on the plate's middle row; it comes in from beyond the plate's
    // near corner and closes up on the bar as the bar sets off (HAND.close), so it never shows ahead of the light
    function follow(secs, off) {
      if (!hand || secs < HAND.close[0]) return;
      const cv = m.canvas, [W, H] = m.size;
      if (!cv) return;
      const bar = window.AlchemistHero.artBar('beads', W, H, TIME + secs), x = bar.line(bar.rest + off, 0.5) * hand.pw;
      const at = (px, py) => (px - hand.cx) * hand.d[0] + (py - hand.cy) * hand.d[1] + hand.lg / 2;   // a point's place along the mask's gradient
      const lag = hand.len * (HAND.soft / 2 + HAND.lag), start = at(x, hand.ph / 2) - at(0, 0) + hand.soft / 2;
      const e = at(x, hand.ph / 2) - (start + (lag - start) * inOut(span(secs, HAND.close)));
      const mask = 'linear-gradient(' + hand.deg.toFixed(2) + 'deg, transparent ' + (e - hand.soft / 2).toFixed(1) + 'px, #000 ' + (e + hand.soft / 2).toFixed(1) + 'px)';
      cv.style.webkitMaskImage = mask;
      cv.style.maskImage = mask;
      if (e - hand.soft / 2 > at(hand.pw, hand.ph)) m.stop();   // the photo is whole: the canvas has done its work
    }
    function end() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      m.stop();
      plate.classList.remove('beading', 'crossing', 'handover', 'risen', 'quick');
      shade.remove();
      headGo(cap);
    }
    // no moment: the photo fades in from the black paint and the title rises
    function reveal() {
      if (done) return;
      done = true;
      plate.classList.add('quick', 'crossing', 'risen');
      headGo(cap);
      later(1000, () => { plate.classList.remove('beading', 'crossing', 'risen', 'quick'); shade.remove(); });
    }
    // its turn has come (it returns how long the light runs: until the bar has left the paint, and, should it have to
    // wait for the stills, the 300ms it may wait). The stills can be busy just then (the leather painting, the closing
    // band's beads holding them): it waits for them up to 300ms, counted from its turn and holding it, and only then
    // does the photo simply fade in. Left on the way (off the screen), it goes to its end at once (end).
    function start() {
      if (done) return 1;
      const room = m.room();
      if (room) return play(room) ? roomTurn(plate, HAND.sweep[1] * 1000, end) : 1;
      const t = performance.now();
      later(50, function wait() {
        if (done) return;
        const r = m.room();
        if (r) { if (!play(r)) light.stop(plate); }
        else if (performance.now() - t < 300) later(50, wait);
        else { reveal(); light.stop(plate); }
      });
      return roomTurn(plate, HAND.sweep[1] * 1000 + 350, end);
    }
    // the moment itself, in the room the stills have given it (false: it could not start, and it has ended)
    function play(room) {
      if (!m.play(room)) { end(); return false; }
      later(HAND.close[0] * 1000, () => {
        const cv = m.canvas;
        if (!cv) return;
        const [W, H] = m.size, g = geometry(W, H, window.AlchemistHero.artBar('beads', W, H, TIME + HAND.close[0]));
        // the canvas's own box (its lower left corner fills the plate): the mask's gradient is laid along it
        const cw = g.pw * cv.width / W, ch = g.ph * cv.height / H;
        hand = Object.assign(g, { cx: cw / 2, cy: g.ph - ch / 2, lg: cw * Math.abs(g.d[0]) + ch * Math.abs(g.d[1]), soft: HAND.soft * g.len });
        plate.classList.add('handover');
      });
      later(3300, () => { plate.classList.add('risen'); headGo(cap); });
      later(BEAD.end * 1000, m.stop);
      later(4800, () => { done = true; plate.classList.remove('beading', 'handover', 'risen'); shade.remove(); });
      return true;
    }
    // each sighting (the first, and one after a turn it missed): on a page that has only just opened here, before the
    // stills' context is up, it waits for it 300ms at most, counted from this sighting
    function sighted() {
      const t = performance.now();
      (function go() {
        if (done) return;
        if (m.room()) light.pass(plate, { start, when: roomWhen(plate), miss: () => onceSeen(plate, { threshold: 0.4 }, sighted) });
        else if (performance.now() - t > 300) reveal();
        else later(50, go);
      })();
    }
    onceSeen(plate, { threshold: 0.4 }, sighted);
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
  // Interior (the owner's §12: a vehicle door closes, the screen goes dark, the camera goes into the leather, then
  // individual areas illuminate; the dashboard, carpet and seats wait for a real interior photo): the plate waits black
  // but for a seam of daylight near its right edge, a door left open. At 35% on the screen, once its leather is
  // painted, the seam pinches out (350ms: the door closes) and the plate holds black for a beat; then, as the black
  // lifts, the view moves into the quilting (the leather from 1.14x to its rest, 2.5s from .75s), INTERIOR sets from
  // behind its line with the owner's line dim under it, and three soft pools of warm light come on over three
  // cushions, one after another (1.0, 1.6 and 2.2s), each lighting one word of that line: RESTORE, REFRESH, RESET. By
  // 3.45s the cabin is at its lit state (the plate's still) and the sentence follows; at 4.2s the extra layers go. CSS
  // draws it. The leather is generated art, never a real car or a result: it stays uncaptioned.
  // Without WebGL it plays over the leather's still picture (img/art/leather.webp).
  (function cabin() {
    const plate = $('#svc-interior .group-plate');
    if (!plate || calm) return;
    const leather = $('canvas[data-art]', plate), cap = $('figcaption', plate), motto = $('.motto', plate);
    const layer = (k) => {
      const el = document.createElement('span');
      el.className = k;
      el.setAttribute('aria-hidden', 'true');
      plate.insertBefore(el, cap);
      return el;
    };
    layer('cabin-dark');
    // the three pools share one layer that lights the leather under it (one blend for the three, not three)
    const room = layer('cabin-pools');
    const pools = [0, 1, 2].map((k) => {
      const el = document.createElement('i');
      el.style.setProperty('--d', (1 + 0.6 * k) + 's');
      room.appendChild(el);
      return el;
    });
    layer('door-seam');
    if (motto) motto.setAttribute('data-own', '');   // its words come with the lights, not with the head
    plate.classList.add('cabin');
    // the pools over three cushions in a row above the title, from the quilting's own lattice (hero-gl.js leather():
    // a cushion's middle is where both families of stitches are half way, and the still rests at 1.08): the row a
    // cushion above the middle, the middle cushion and the ones about 29% of the plate to either side
    function aim() {
      const W = plate.clientWidth, H = plate.clientHeight;
      if (!W || !H) return;
      const step = 1.08 / (6.4 * (W / H) * 1.2), i = 2 * Math.max(1, Math.round(0.29 / step / 2));
      const y = (50 - 100 * 1.08 / (4.2 * 1.2)).toFixed(2) + '%';
      pools.forEach((el, k) => { el.style.setProperty('--px', (50 + (k - 1) * i * step * 100).toFixed(2) + '%'); el.style.setProperty('--py', y); });
    }
    let played = false;
    // its turn has come (it returns how long its light runs: until the cabin is lit)
    function play() {
      if (played) return 1;
      played = true;
      aim();
      plate.classList.add('on');
      setTimeout(() => headGo(cap), 700);   // INTERIOR sets from behind its line as the view settles
      // each layer goes as soon as it has done its part (the seam once the door is shut, the black and the pools at
      // the lit state), so fewer are drawn over the leather; the classes go once the sentence has risen
      const drop = (sel) => $$(sel, plate).forEach((el) => el.remove());
      setTimeout(() => drop('.door-seam'), 600);
      setTimeout(() => drop('.cabin-dark, .cabin-pools'), 3500);
      setTimeout(() => {
        drop('.cabin-dark, .cabin-pools, .door-seam');
        plate.classList.remove('cabin', 'on');
      }, 4200);
      return roomTurn(plate, 3450);
    }
    const turn = () => { if (!played) light.pass(plate, { delay: 120, start: play, when: roomWhen(plate), miss: () => onceSeen(plate, { threshold: 0.35 }, turn) }); };
    onceSeen(plate, { threshold: 0.35 }, () => {
      if (!glOk || !leather || leather.dataset.done) { turn(); return; }
      let go = false;
      const once = () => { if (!go) { go = true; turn(); } };
      leather.addEventListener('painted', once, { once: true });
      setTimeout(once, 2500);   // the stills never came: light it all the same
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
  // A page opens in two parts. The swap (render itself) is what has to change at once: the wash folded while home is
  // still laid out (doc 35), the page shown, its name, the menu's mark, its scroll. Landing (land) builds and arms it:
  // the app pages' content, the reveals, the focus, the pictures. Normally both run together, as always; in a cut
  // (cut: what the new page holds, cutHeld) the landing is a task of its own just after, while the page is still
  // unseen in the black, so neither part is one long task on a slow phone. A page change that comes before a cut's
  // landing has run lets it land first.
  let landing = null;   // a cut's landing still to come
  function render(first, cut) {
    if (landing) landing();
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
      risen();   // (a page still rising out of the last cut)
      $$('.view').forEach((v) => {
        const on = v.dataset.view === view;
        v.hidden = !on;
        v.classList.remove('enter');
        if (on && !first && !reduce && !cut) {   // (in a cut the page rises as a whole: the cut's CSS)
          void v.offsetWidth;
          v.classList.add('enter');
          v.addEventListener('animationend', function done(e) { if (e.target !== v) return; v.classList.remove('enter'); v.removeEventListener('animationend', done); });
        }
      });
      if (view === 'home' && heroRests && !menuOpen) { heroRests = false; hero.resume(); }   // (held still by the cut that left home: its light again)
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
    // the new page's place (a group's, #services-exterior, once its page is built): in a cut it goes with the swap, so
    // nothing that follows the scroll (the wash above all) sees the page between the two; never under a finger (the
    // shade's swap has waited for the lift already; a view transition's update may come with one down)
    const place = () => { if (changed && !first && !(r === 'services' && sub)) window.scrollTo(0, r === 'home' && memo.home != null ? memo.home : 0); };
    if (cut) whenLifted(place);
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      if (landing === land) landing = null;
      try { landOn(); } finally {
        // in a cut, the built page is laid out in a task of its own too, before the next frame, so no frame of the cut
        // carries its layout together with the frame's own work; and the cut goes on whatever a mount did
        if (cut) setTimeout(() => { void main.offsetHeight; if (cut.landed) cut.landed(); });
      }
    };
    const landOn = () => {
      if (changed) {
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
      }
      if (r === 'admin' && !changed && window.AlchemistAdmin) window.AlchemistAdmin.mount($('#adminApp'));
      if (r === 'book' && !changed && sub && window.AlchemistBooking) window.AlchemistBooking.offer(sub);   // already booking: offered, never forced
      if (!cut) place();
      if (r === 'services' && sub) {
        const el = document.getElementById('svc-' + sub);
        const go = () => { chapterHold(); el.scrollIntoView({ behavior: changed || reduce ? 'auto' : 'smooth', block: 'start' }); };
        if (el) requestAnimationFrame(() => (cut ? whenLifted(go) : go()));
      }
      if (changed) {
        const scope = $$('.view').find((v) => !v.hidden) || document;
        armReveals(scope);
        if (cut && cutHeld === cut) cut.scope = scope; else revealAbove(scope);   // (in a cut: as the page shows, cutGo)
        if (!first) placeFocus(scope);
        requestAnimationFrame(() => {
          if (view === 'home') { fitServices(); if (wash) wash.refresh(); }
          paintArt();
        });
        footRoute();   // (after the page's own scroll, in the next frame)
      }
    };
    if (cut) { landing = land; setTimeout(land); } else land();
  }
  // A page change is a cut through black (the door closing): the page you leave dims and draws back a little into
  // black in 200ms, a beat of black, and the new one rises 14px into place (from above on Back or Forward), its
  // heading setting from its line (CUT_IN). The bar holds through it, its name rolling to the new page (CSS vt-route,
  // vt-back, .bar.vt-hold). Not into booking (its gold veil), the staff consoles or under reduced motion; without view
  // transitions the page fades in as before (.view.enter). The update is the swap, run at once (one that waited for a
  // frame would be dropped); the landing follows as a task of its own.
  let linked = false;   // the click handler below: a link was followed (no mark: Back, Forward or a typed address)
  const quiet = (p) => p === 'admin' || p === 'team';
  // (nor onto home before its hero is built: that build stalls the screen, so the page fades in as before)
  const cuts = (from, to) => !reduce && !!document.startViewTransition && !!from && to !== from && to !== 'book' && !quiet(to) && !quiet(from) && !(to === 'home' && !heroStarted);
  // The browser's pictures are taken only where they are quick: not of home (its live WebGL), not under the open menu
  // (its glass), not on a device slow to take them (still). There the shade makes the same cut with no picture (below).
  const pictured = (to) => !still && cur !== 'home' && to !== 'home' && !menuOpen;
  const holdCut = () => { cutGo(cutHeld); return (cutHeld = { els: new Map(), fns: [] }); };   // the page left lets its last cut's holds go
  // A finger on the glass. iOS undoes a script's scroll made under a finger at its next move (doc 35), so no cut swaps
  // the page (or scrolls it) while one is down. A touch counts from its pointerdown to its lift (touchend with no
  // touches left; a pointercancel only means the browser took it for a pan). After a touch, or with the page moving (a
  // finger that catches a fling is never sent to the page), the swap also waits for the wash's own proof that the glass
  // is free (foam.js rest.proven: a lift on a still page, or a scrollend), or 600ms after the lift on a still page.
  // The shade itself can't be panned (CSS .scrim.cut.on), so a drag in the black leaves nothing moving behind it.
  const restGate = window.AlchemistWash && window.AlchemistWash.rest;
  const fingers = new Set();
  let touchesOn = 0, touchAt = -1e9;
  const onGlass = () => touchesOn > 0 || fingers.size > 0;
  const fopt = { capture: true, passive: true };
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { fingers.add(e.pointerId); touchAt = performance.now(); } }, fopt);
  window.addEventListener('pointerup', (e) => fingers.delete(e.pointerId), fopt);
  window.addEventListener('touchstart', (e) => { touchesOn = e.touches.length; touchAt = performance.now(); }, fopt);
  const lifted = (e) => { touchesOn = e.touches.length; if (!touchesOn) fingers.clear(); };
  window.addEventListener('touchend', lifted, fopt);
  window.addEventListener('touchcancel', lifted, fopt);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { touchesOn = 0; fingers.clear(); } });   // (a lift never heard)
  function glassFree(s) {
    if (onGlass()) { s.off = 0; return false; }
    const R = restGate, t = performance.now();
    if (!R) return true;
    const moving = t - R.state.tScroll < 150 || Math.abs(window.scrollY - R.state.y) > 0.5;
    if (!moving && !(s.touched || t - touchAt < 1000)) return true;
    if (R.proven()) return true;
    s.off = s.off || t;
    return !moving && t - s.off >= 600;
  }
  const whenLifted = (fn) => { if (!onGlass()) fn(); else setTimeout(() => whenLifted(fn), 50); };   // (after the swap: the scrolls that follow it)
  // The shade's cut (a page chosen in the open menu, home left or reached, and every change on a device slow to take
  // pictures): the menu's shade, under the bar, deepens to the ground in 200ms (.scrim.cut; .bare with no menu open)
  // as a chosen page's gold line crosses its row and the panel slides shut; the page is swapped and built in the black
  // (the beat), then the shade lifts (520ms) as the page rises (.view.cut-in). Leaving home, the hero's light holds still.
  const CUT_OUT = 200, CUT_DARK = 280;   // --cut-out, and --cut-out + --cut-beat
  let dark = null;   // the shade's cut under way: { at: when it began, m: what the new page holds, ... }
  let heroRests = false;   // the hero held still by a cut that left home, until home shows again (render)
  let rising = null;   // [the page rising out of the shade, its animationend listener]
  function risen() {
    if (!rising) return;
    const [v, fn] = rising;
    rising = null;
    v.classList.remove('cut-in', 'from-above');
    v.removeEventListener('animationend', fn);
  }
  function blackOut(back, bare) {   // (the click handler, as the page is chosen; the router, for Back and the like)
    if (dark) return;
    scrim.classList.toggle('bare', !!bare);
    scrim.classList.add('on', 'cut');
    const rests = cur === 'home' && !!hero && !!hero.pause;
    if (rests) hero.pause();
    const d = dark = { at: performance.now(), back: !!back, m: null, swapped: false, landed: false, fast: false, touched: onGlass(), t: 0, safe: 0, hero: rests };
    // should no page change come (the address still names this page after 300ms, or still none has come by 1.5s)
    const safe = (n) => { if (dark !== d || d.m) return; if (parse().r !== cur && n < 4) { setTimeout(() => safe(n + 1), 300); return; } dark = null; unshade(d); };
    setTimeout(() => safe(0), 300);
  }
  // the swap, at the end of the 200ms or at a press; with a finger on the glass it waits for the lift, then the page is
  // there at once (force: a click, its finger already up)
  function swapDark(d, force) {
    clearTimeout(d.t);
    if (d.swapped || dark !== d) return;
    if (force ? onGlass() : !glassFree(d)) { d.fast = true; d.t = setTimeout(() => swapDark(d), 50); return; }
    d.swapped = true;
    d.m.landed = () => { d.landed = true; d.t = setTimeout(() => lift(d), d.fast ? 0 : Math.max(0, d.at + CUT_DARK - performance.now())); };   // (once the beat is over)
    d.safe = setTimeout(() => lift(d), 600);   // (should the landing never report)
    render(false, d.m);
    setName(NAMES[cur]);   // (Back in the black, to the page it began on: its own name again)
  }
  // the shade goes; the hero's light comes back if home is still the page (Back in the black), and otherwise holds
  // still until home shows again (render)
  function unshade(d) {
    if (!menuOpen) scrim.classList.remove('on');
    setTimeout(() => { if (!dark && !menuOpen) scrim.classList.remove('cut', 'bare'); }, 600);   // (once the shade has lifted)
    if (d.hero && !menuOpen) { if (cur === 'home') hero.resume(); else heroRests = true; }
  }
  function lift(d) {
    if (dark !== d) return;
    dark = null;
    clearTimeout(d.t);
    clearTimeout(d.safe);
    const v = $$('.view').find((x) => !x.hidden);
    risen();
    // (home met at or past the wash: the shade lifts on it in place, so the pinned stage never moves but with the scroll)
    const inPlace = cur === 'home' && washSection.getBoundingClientRect().top < window.innerHeight;
    if (v && !d.fast && !inPlace) {
      v.classList.add('cut-in');
      v.classList.toggle('from-above', d.back);
      const fn = (e) => { if (e.target === v) risen(); };
      v.addEventListener('animationend', fn);
      rising = [v, fn];
    }
    unshade(d);
    cutGo(d.m);
  }
  // a click in the cut (the menu opened again, the next page): the page is there at once
  function finishDark() {
    const d = dark;
    if (!d) return;
    d.fast = true;
    if (!d.m) { dark = null; unshade(d); return; }   // (its page change has not come)
    if (!d.swapped) swapDark(d, true);
    else if (d.landed) lift(d);
  }
  window.addEventListener('hashchange', () => {
    const to = parse().r, back = !linked;
    linked = false;
    if (dark && dark.m) {
      if (!dark.swapped) return;   // the shade's cut, still in the black: its swap shows the newest page
      finishDark(); render(false); return;   // (its page already swapped in: this one simply follows)
    }
    if (!cuts(cur, to)) { finishDark(); render(false); return; }
    if (!dark && !pictured(to)) { const open = menuOpen; if (open) closeMenu(false); blackOut(back, !open); }   // Back or Forward with the menu open, to or from home, or with no pictures
    const d = dark;
    if (d) {
      d.m = holdCut();
      setName(NAMES[to]);   // the bar's name leads the cut
      d.t = setTimeout(() => swapDark(d), Math.max(0, d.at + CUT_OUT - performance.now()));
      return;
    }
    let m = null;
    const t = transition(back ? ['vt-route', 'vt-back'] : ['vt-route'], () => { m = holdCut(); render(false, m); }, true);
    const go = () => setTimeout(() => cutGo(m || cutHeld), CUT_IN);   // (skipped: the same, once its update has run)
    t.ready.then(go, go);
  });
  // A press in a cut ends it: a mouse's or a pen's at once. A finger only marks it quick (its page comes on the lift,
  // swapDark), and ends a page's view transition only once its update (the swap) has run; the light switch's at once.
  document.addEventListener('pointerdown', (e) => {
    const touch = e.pointerType === 'touch';
    if (vtNow && (!touch || !vtNow.route || vtNow.ran())) vtNow.skipTransition();
    if (!touch) { finishDark(); return; }
    const d = dark;
    if (!d) return;
    d.fast = d.touched = true;
    if (d.landed) lift(d);
  }, true);

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
      if (cur !== 'home') { linked = true; location.hash = 'home'; setTimeout(go, 60); } else go();
      return;
    }
    const token = a.getAttribute('href').slice(1);
    const r = token.split('-')[0];
    if (!NAMES[r]) return;
    e.preventDefault();
    const wasOpen = menuOpen;
    // a page chosen in the menu: its gold line shoots across the row under the finger (220ms), and the panel holds a
    // breath (160ms, CSS .chose) so it is seen, while the page changes at once
    if (wasOpen && !reduce && a.closest('nav') === menuNav) { a.classList.add('chosen'); menu.classList.add('chose'); }
    closeMenu(false);
    const navigate = () => {
      if (location.hash.slice(1) === token) {   // same page: back to its top
        if (!token.includes('-')) {
          if (cur === 'home') { if (wash) wash.foldNow(); else if (washPin) washPin.now(); }   // a click: the pinned length goes first
          window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
        } else render(false);
      } else {
        linked = true;
        if (cuts(cur, r) && (wasOpen || !pictured(r))) blackOut(false, !wasOpen);   // from the open menu, or to or from home: the shade's cut
        location.hash = token;
      }
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
  // intro: they start once the intro has played (3.2s), or sooner the moment the visitor moves. Never in a page
  // change's cut or under its new page's rise (the stall would hold the black, or the page mid-rise; a tap that leaves
  // home is a touch too): then once the page has settled (1.2s after it shows; 4s at most).
  let heavy = false;
  function startHeavy() {
    if (heavy) return;
    heavy = true;
    startWash();
    rowArm();   // the row's light after the wash (no wash: the first time the row is half on the screen; no light: none)
    stripArm();   // the strip's inspection light, after the wash too
    artReady = true;
    paintArt();
  }
  const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 1200 }) : (fn) => setTimeout(fn, 600);
  // (in a cut, or under its page's rise, it waits: 300ms at a time, 4s at most; on home, where the wash waits for it,
  // it starts as the page shows, so a visitor who goes straight for the wash meets it from its start; elsewhere
  // once the page has settled, 1.2s after it shows)
  const heavySoon = (by) => idle(() => {
    if (heavy) return;
    by = by || performance.now() + 4000;
    const wait = dark || vtNow || cutHeld ? 300 : cur === 'home' ? 0 : cutShown + 1200 - performance.now();
    if (wait > 0 && performance.now() < by) setTimeout(() => heavySoon(by), wait); else startHeavy();
  });
  ['wheel', 'keydown', 'scroll'].forEach((t) => window.addEventListener(t, () => heavySoon(), { once: true, passive: true }));
  window.addEventListener('touchstart', () => setTimeout(heavySoon, 350), { once: true, passive: true });   // (a tap on a link has left by then; a swipe scrolls first)
  // (while the studio light is still gliding in, they wait for it to slow: plan(); while a page's moment is still to come
  // or playing, About's mark, the Reviews certificate's raking light, until it has played: its release, and a moment)
  const afterMoment = () => {
    const h = $$('[data-hold], [data-moment]').find((x) => !x.closest('[hidden]'));   // (on the page shown: one left behind on a page since left holds nothing)
    if (!h) { heavySoon(); return; }
    let t = 0;
    const go = () => { clearTimeout(t); h.removeEventListener('release', go); setTimeout(() => heavySoon(), 1600); };
    h.addEventListener('release', go, { once: true });
    t = setTimeout(go, 4000);
  };
  setTimeout(() => setTimeout(afterMoment, Math.max(0, glideEnd - performance.now())), reduce ? 0 : 3200);
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
