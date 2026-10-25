/* Alchemist Detailing — the public Reviews page (#reviews), phase 5 (doc 29).
   Only approved reviews from real customers, first name and last initial,
   the owner's replies, gold for $200+ details. Nothing is ever made up here:
   until real reviews exist the page says so.
   A gold review is drawn as an assay certificate (the owner's design, Oct 10):
   gold border, inner hairline frame, faint alchemy circles, a still sheen, the
   round Au seal, the words in the brand's italic serif. Ordinary reviews are
   simpler dark cards. The featured review (the best one, on top of the page
   and on home) plays the owner's sequence once a visit, when it is first well
   in view (ceremony): on a certificate a low raking light crosses it and foils
   the seal, then a line of light runs round the edge, the stars are gilded one
   by one and the name fades in. On a certificate the edge's light is gold, on
   any other review off-white (gold stays the $200+ sign).
   Before the first review the page is an unissued certificate: the frame and
   the seal at rest, and the rules every review follows; once a visit the
   raking light crosses its blind seal and its circles, and leaves them at rest. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el } = U;
  const SVG = 'http://www.w3.org/2000/svg', XLINK = 'http://www.w3.org/1999/xlink';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let root = null, seals = 0;
  const when = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const svg = (tag, attrs, text) => {
    const n = document.createElementNS(SVG, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (text != null) n.textContent = text;
    return n;
  };

  // five ✦, lit up to the rating; --s is each star's place, so a certificate can light them one after another. gild:
  // the featured review's stars, each lit one a dim star under a gold one that its ceremony wipes in (issue, below)
  function stars(n, label, gild) {
    return el('span.stars', label === false ? { 'aria-hidden': 'true' } : { 'aria-label': n + ' out of 5 stars' },
      [1, 2, 3, 4, 5].map((i) => {
        const on = i <= n;
        const s = el('i', { class: on ? 'on' : '' }, on && gild ? [el('span.st-dim', '✦'), el('span.st-au', { 'aria-hidden': 'true' }, '✦')] : '✦');
        s.style.setProperty('--s', i);
        return s;
      }));
  }
  // the assay seal: GOLD DETAIL ✦ ALCHEMIST ✦ round a ring, Au in the middle, on a face of its own (an SVG in the seal's
  // box). kind: 'rest', blind-embossed, nothing issued yet (the unissued certificate); 'gold', a certificate's; 'issue',
  // the featured certificate's: blind until its ceremony's light foils it (a gold face over the blind one, issue
  // below). lamp: it will take the raking light (rake, below), so it carries the lamp's layer, drawn only as it passes
  function seal(kind, lamp) {
    const n = ++seals, id = 'seal-ring-' + n;
    const relief = () => {
      const g = svg('g');
      const ring = svg('text');
      const path = svg('textPath', { href: '#' + id }, 'GOLD DETAIL ✦ ALCHEMIST ✦ ');
      path.setAttributeNS(XLINK, 'xlink:href', '#' + id);
      ring.appendChild(path);
      g.append(svg('circle', { class: 'ring', cx: 50, cy: 50, r: 46 }), svg('circle', { class: 'inner', cx: 50, cy: 50, r: 27 }), ring,
        svg('text', { class: 'au', x: 50, y: 57, 'text-anchor': 'middle' }, 'Au'));
      return g;
    };
    const face = (cls, first) => {
      const f = svg('svg', { class: cls, viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
      if (first) {   // the ring's words run on this path, for every face of the seal
        const defs = svg('defs');
        defs.appendChild(svg('path', { id, d: 'M50 50 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0' }));
        f.appendChild(defs);
      }
      f.appendChild(relief());
      return f;
    };
    const s = el('span.rv-seal', { class: kind === 'rest' ? 'rest' : kind === 'issue' ? 'issue' : null, 'aria-hidden': 'true' });
    s.appendChild(face(kind === 'issue' ? 'sl-face sl-blind' : 'sl-face', true));
    if (kind === 'issue') s.appendChild(face('sl-face sl-foil'));
    if (lamp) s.appendChild(lampOf(relief, n));
    return s;
  }
  // the lamp's layer: a copy of the seal's relief lit by an SVG lighting filter (a specular highlight on the side of
  // each stroke facing the light, a fine shade cast on the other), and, for a page that can't keep up with the filter,
  // two copies painted with gradients that turn with the lamp (as the circles' lit copy is: rake), a lit one bright on
  // the side of each stroke facing the lamp and set a touch toward it, and a shaded one dark on the far side
  function lampOf(relief, n) {
    const s = svg('svg', { class: 'sl-rake', viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
    const f = svg('filter', { id: 'rake-' + n, x: '-15%', y: '-15%', width: '130%', height: '130%', 'color-interpolation-filters': 'sRGB' });
    const spec = svg('feSpecularLighting', { in: 'b', surfaceScale: 4, specularConstant: 1.1, specularExponent: 20, result: 's', class: 'rk-lit' });
    spec.appendChild(svg('feDistantLight', { azimuth: RAKE.from, elevation: RAKE.elev }));
    const merge = svg('feMerge');
    merge.append(svg('feMergeNode', { in: 'sh' }), svg('feMergeNode', { in: 'hi' }));
    f.append(svg('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 1, result: 'b' }), spec,
      svg('feComposite', { in: 's', in2: 'b', operator: 'in', result: 'hi' }),
      svg('feOffset', { in: 'SourceAlpha', dx: RAKE.shade, dy: 0, result: 'o' }),
      svg('feComposite', { in: 'o', in2: 'SourceAlpha', operator: 'out', result: 'cast' }),
      svg('feFlood', { class: 'rk-shade', result: 'c' }),
      svg('feComposite', { in: 'c', in2: 'cast', operator: 'in', result: 'sh' }), merge);
    const defs = svg('defs');
    defs.appendChild(f);
    // the copies' paint: [its id, its stops (offset, class)], each along the lamp's way (rk-arc: turned by rake)
    [['rake-hi-' + n, [[0, 'rk-g0'], [0.45, 'rk-g0'], [1, 'rk-g1']]], ['rake-lo-' + n, [[0, 'rk-s1'], [0.55, 'rk-s0'], [1, 'rk-s0']]]].forEach(([id, stops]) => {
      const g = svg('linearGradient', { id, class: 'rk-arc', x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
      stops.forEach(([o, c]) => g.appendChild(svg('stop', { offset: o, class: c })));
      defs.appendChild(g);
    });
    const fx = svg('g', { class: 'rk-fx', filter: 'url(#rake-' + n + ')' });
    fx.appendChild(relief());
    const lite = svg('g', { class: 'rk-lite' }), lo = svg('g', { class: 'rk-lo', style: '--rk-paint: url(#rake-lo-' + n + ')' }), hi = svg('g', { class: 'rk-hi', style: '--rk-paint: url(#rake-hi-' + n + ')' });
    aside(hi, lo, RAKE.from);
    lo.appendChild(relief());
    hi.appendChild(relief());
    lite.append(lo, hi);
    s.append(defs, fx, lite);
    return s;
  }
  // the faint alchemy circles in the certificate's corner; lamp: with a lit copy whose strokes catch the raking light
  // along the arc of each circle that faces it (a gradient on each circle's own box, turned with the light: rake)
  function circles(lamp) {
    const s = svg('svg', { class: 'rv-circles', viewBox: '0 0 320 320', width: 320, height: 320, 'aria-hidden': 'true' });
    const draw = (attrs) => {
      const rings = svg('g', Object.assign({ fill: 'none', 'stroke-width': 1 }, attrs));
      for (let r = 40; r <= 152; r += 16) rings.appendChild(svg('circle', { cx: 160, cy: 160, r }));
      const petals = svg('g', Object.assign({ fill: 'none', 'stroke-width': 1, opacity: 0.6 }, attrs));
      [[176, 160], [144, 160], [160, 176], [160, 144]].forEach(([cx, cy]) => petals.appendChild(svg('circle', { cx, cy, r: 64 })));
      return [rings, petals];
    };
    s.append(...draw({ stroke: 'currentColor' }));
    if (lamp) {
      const id = 'rake-arc-' + (++seals), defs = svg('defs'), grad = svg('linearGradient', { id, class: 'rk-arc', x1: 0, y1: 0.5, x2: 1, y2: 0.5 });
      [0, 0.55, 1].forEach((o, i) => grad.appendChild(svg('stop', { offset: o, class: i === 2 ? 'on' : 'off' })));
      defs.appendChild(grad);
      const lit = svg('g', { class: 'rk-c' });
      lit.append(...draw({ stroke: 'url(#' + id + ')', 'stroke-width': 1.3 }));
      s.append(defs, lit);
    }
    return s;
  }
  const extMark = () => svg('svg', { class: 'ext', viewBox: '0 0 24 24', 'aria-hidden': 'true' }).appendChild(svg('path', { d: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })).parentNode;

  // the signature under the words: the name, then the service and the month on a quieter line. featured: the featured
  // review, built for its ceremony (issue: it will play; otherwise it is issued already)
  function review(r, featured, issue) {
    const who = el('p.rv-who', el('b', r.name), el('span.rv-meta', [r.services, when(r.created_at)].filter(Boolean).map((t) => el('span', t))));
    const body = el('p.rv-body', '“' + r.body + '”');
    const reply = r.reply ? el('div.rv-reply', el('span.eyebrow', 'Alchemist replied'), el('p', r.reply)) : null;
    const cls = featured ? 'is-featured' + (issue ? '' : ' issued') : null, moment = featured && issue ? '' : null, lamp = featured && issue;
    if (!r.is_gold) return el('article.rv', { class: cls, 'data-reveal': '', 'data-moment': moment }, el('div.rv-head', stars(r.rating, true, featured)), body, who, reply);
    return el('article.rv.gold.cert', { class: cls, 'data-reveal': '', 'data-moment': moment },
      el('span.rv-frame', { 'aria-hidden': 'true' }), lamp ? el('span.rv-lamp', { 'aria-hidden': 'true' }) : null, circles(lamp), el('span.rv-sheen', { 'aria-hidden': 'true' }), seal(featured ? 'issue' : 'gold', lamp),
      el('div.rv-main', el('div.rv-head', stars(r.rating, true, featured), el('span.rv-gold', 'Gold detail')), body, who),
      reply);
  }

  // ---------------------------------------------------------------- the raking light
  // A desk lamp passing low over the paper (the inspection light's white, never gold): once, its turn in the site's
  // light queue. It comes in low from the left and leaves to the right over 2.2s (CSS: the lamp layers' strength, on
  // the light's curve); the seal's relief catches it on the side facing it, its other side falls into a fine shade,
  // and the faint circles catch it along the arcs that face it. Its direction follows the lamp in about 30 steps (the
  // filter's azimuth, the shade's offset, the circles' gradient), read from the CSS run itself, so the two never part;
  // then the relief settles back into its quiet emboss and the lamp's layers go. A faint pool of the same light crosses
  // the paper under the words with it (.rv-lamp, on transform alone). As its turn comes the lamp's layers are painted
  // faintly first (.rk-warm: lampOn), so the browser's first drawing of the filter lands on the still page, and a frame
  // that comes late holds the whole moment where it was rather than jumping it ahead (U.steady). A page that
  // can't keep up (steps coming late two in a row, past the first three) or a small device memory takes two copies of
  // the relief instead of the lighting filter, lit and shaded by gradients that turn with the lamp. The filter is the
  // seal's alone (96px at most). While the moment is still to come or playing the page's heavy pictures wait for it
  // (data-moment: app.js, then its release).
  const RAKE = { ms: 2200, step: 73, from: 190, to: 350, elev: 14, shade: 1.1, lite: 0.9, hold: 400, warm: 600 };   // its run, a step, its way round (azimuth), its height, the shade's reach, the copies' offset, the most a late frame may hold it in all, the longest its faint first paint may take
  const MOMENT = /^(rake|lamp|foil|starGild|rimTravel)/;   // the moment's own runs (a ceremony's too), held together
  const small = () => !!navigator.deviceMemory && navigator.deviceMemory <= 2;   // a small device memory: the copies from the start
  // the two copies, the lit one set a touch toward the lamp at azimuth az and the shaded one away from it
  function aside(hi, lo, az) {
    const r = az * Math.PI / 180, x = (Math.cos(r) * RAKE.lite).toFixed(2), y = (Math.sin(r) * RAKE.lite).toFixed(2);
    hi.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    lo.setAttribute('transform', 'translate(' + -x + ' ' + -y + ')');
  }
  // A moment's turn has come (the title's light has gone and the light's queue holds the shines: nothing moves): its
  // layers are painted at 1% (.rk-warm, unseen) until the frames come on time, then it plays (fn), its turn of the
  // light (by) kept for ms from then
  function lampOn(box, by, ms, fn) {
    if (small() && box.querySelector('.sl-rake')) box.classList.add('rake-lite');   // (the copies are painted first, not the filter it won't take)
    box.classList.add('rk-warm');
    U.warmed(RAKE.warm).then(() => {
      const L = window.AlchemistLight;
      if (L && L.extend) L.extend(by, ms);
      fn();
    });
  }
  // a late frame holds the moment playing in box: its runs (and the name's fade on a certificate) and its turn of the
  // light (the element with .au-run), for ms in all; tick(t) as U.steady's
  function steadied(box, ms, tick) {
    const L = window.AlchemistLight;
    let runs = null, at = 0;
    return U.steady({
      cap: RAKE.hold,
      anims: () => runs || (runs = box.getAnimations({ subtree: true }).filter((a) => MOMENT.test(a.animationName || '') || (!!a.transitionProperty && a.effect && a.effect.target && a.effect.target.matches('.rv-who')))),
      held: () => { const by = box.matches('.au-run') ? box : box.querySelector('.au-run'); if (by && L && L.extend) L.extend(by, Math.max(0, ms - at)); },
      tick: (t) => { at = t; return tick(t); },
    });
  }
  // the raking light on box (done: once it has passed; span: the light's turn it plays in, if longer than its own run)
  function rake(box, done, span) {
    const lamp = box.querySelector('.sl-rake');
    box.classList.remove('rk-warm');
    if (!lamp) { if (done) done(); return null; }
    const dl = lamp.querySelector('feDistantLight'), off = lamp.querySelector('feOffset'), arcs = [...box.querySelectorAll('.rk-arc')];
    const hi = lamp.querySelector('.rk-hi'), lo = lamp.querySelector('.rk-lo');
    if (small()) box.classList.add('rake-lite');
    box.classList.add('raking');
    let anim = null, ended = false, n = 0, late = 0, at = -1, wall = 0;
    const run = () => {
      if (!anim) { try { anim = lamp.getAnimations().find((a) => /^rake/.test(a.animationName)) || null; } catch (e) { anim = null; } }
      return anim;
    };
    // each frame: a step whenever the lamp has moved on a step's worth (its own time, held by a late frame)
    const clock = steadied(box, span || RAKE.ms, () => {
      const a = run();
      if (!a || !box.isConnected || a.playState === 'idle') { end(); return false; }
      const t = a.currentTime || 0, p = Math.min(1, t / RAKE.ms), now = performance.now();
      if (at < 0 || t - at >= RAKE.step || p >= 1) {
        // (a step that comes over two steps late, twice in a row, past the first three, which may still carry the
        // browser's first drawing of the layers: the page can't keep up with the filter, and the copies take over)
        if (at >= 0 && ++n > 3) { late = now - wall > RAKE.step * 2 ? late + 1 : 0; if (late >= 2) box.classList.add('rake-lite'); }
        at = t;
        wall = now;
        aim(p);
      }
      if (p < 1 && a.playState !== 'finished') return true;
      end();
      return false;
    });
    function aim(p) {
      const az = RAKE.from + (RAKE.to - RAKE.from) * p, r = az * Math.PI / 180, cx = Math.cos(r), cy = Math.sin(r);
      if (box.classList.contains('rake-lite')) aside(hi, lo, az);
      else {
        dl.setAttribute('azimuth', az.toFixed(1));
        off.setAttribute('dx', (-cx * RAKE.shade).toFixed(2));
        off.setAttribute('dy', (-cy * RAKE.shade).toFixed(2));
      }
      arcs.forEach((g) => { g.setAttribute('x1', (0.5 - cx / 2).toFixed(3)); g.setAttribute('y1', (0.5 - cy / 2).toFixed(3)); g.setAttribute('x2', (0.5 + cx / 2).toFixed(3)); g.setAttribute('y2', (0.5 + cy / 2).toFixed(3)); });
    }
    function end() {
      if (ended) return;
      ended = true;
      box.classList.remove('raking', 'rake-lite');
      lamp.remove();
      box.querySelectorAll('.rk-c, .rk-arc, .rv-lamp').forEach((x) => x.remove());
      if (done) done();
    }
    return clock;
  }
  // a thing that waits for the light, well on the screen: its turn in the queue, once its page's title has set and had
  // its own light (which asks for its turn as the title sets, so this asks a moment after)
  function turnFor(el, head, enough, go) {
    const L = window.AlchemistLight, A = window.AlchemistInspect;
    const seen = new IntersectionObserver((es) => {
      const e = es[es.length - 1];
      if (!enough(e)) return;
      seen.disconnect();
      const ask = () => setTimeout(() => { if (el.isConnected) L.pass(el, { start: go, miss: () => seen.observe(el) }); }, 300);
      if (A && A.afterHead && head) A.afterHead(head, ask); else ask();
    }, { threshold: [0, 0.6, 0.99], rootMargin: '-90px 0px 0px 0px' });   // (below the floating bar)
    seen.observe(el);
  }
  const once = (key) => { try { return sessionStorage.getItem(key) === '1'; } catch (e) { return false; } };   // storage unavailable: it plays
  const played = (key) => { try { sessionStorage.setItem(key, '1'); } catch (e) { /* storage unavailable: it may play again, which is harmless */ } };
  const lit = () => !reduce && !!window.AlchemistLight && !window.AlchemistLight.off && 'IntersectionObserver' in window;
  const over = (el) => { el.removeAttribute('data-moment'); el.dispatchEvent(new Event('release')); };   // the moment has played

  // ---------------------------------------------------------------- the first review's ceremony
  // The owner's §16 (a line of light round the edge, the stars lighting quickly, the name fading in; once), for a real
  // review only (public_reviews: approved). When the featured review is first well on the screen it takes its turn in
  // the light's queue. On a certificate the raking light crosses it and, where it passes the seal, the seal turns from
  // blind emboss to gold foil, as in hot-foil stamping; the rim's head of light runs once; the stars up to the review's
  // own rating are gilded one after another; then the name and the month fade in (CSS: .issuing, then .issued). On any
  // other review: the rim, the stars, the name. Once a visit (the tab's own storage); after that, under reduced motion
  // and in forced colours it is simply issued, as in print.
  const ISSUE_KEY = 'ad.issued', ISSUE = { gold: 3500, plain: 1800 };   // how long each ceremony holds the light (CSS)
  const issuing = () => lit() && !once(ISSUE_KEY);
  function ceremony(card, head) {
    if (!card || card.classList.contains('issued')) return;
    turnFor(card, head, (e) => e.isIntersecting && (e.intersectionRatio >= 0.6 || e.intersectionRect.height >= window.innerHeight * 0.6), () => {
      played(ISSUE_KEY);
      const gold = card.classList.contains('cert'), ms = gold ? ISSUE.gold : ISSUE.plain;
      lampOn(card, card, ms, () => {
        card.classList.remove('rk-warm');
        card.classList.add('issuing');
        // a late frame holds all of it together (the rake's own clock on a certificate), and its end comes as much later
        const clock = gold ? rake(card, null, ms) : steadied(card, ms, (t) => t < ms && card.isConnected);
        const fin = (was) => {
          const h = clock ? clock.held() : 0;
          if (h > was) { setTimeout(() => fin(h), h - was); return; }
          card.classList.replace('issuing', 'issued');   // its end, as its still frame
          over(card);
        };
        setTimeout(() => fin(0), ms + 100);
      });
      return ms;   // (its turn is kept as long again from when it plays: lampOn)
    });
  }

  // The featured review (the owner's §13), the same on home and on the page: the best approved review (the highest
  // rating, a gold detail first among equals, then the newest; the list comes newest first and the sort is stable).
  const pick = (list) => list.slice().sort((a, b) => (b.rating - a.rating) || (+!!b.is_gold - +!!a.is_gold))[0];
  // On home it comes with a link to the rest. Until the owner approves a real review the slot stays empty and hidden:
  // no heading, no placeholder. The database is asked once, when the visitor is a screen away from Why Alchemist, so
  // the hero and the wash have the first seconds to themselves. The slot opens only while home is shown and the slot
  // is below the screen, so nothing the visitor is reading moves (Safari has no scroll anchoring) and home's
  // remembered position stays true.
  function mountFeatured(slot, near) {
    if (!slot || !near || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      load();
    }, { rootMargin: '0px 0px 100% 0px' });
    io.observe(near);
    async function load() {
      let list = [];
      try { list = await D.publicReviews(); } catch (e) { return; }
      if (!Array.isArray(list) || !list.length) return;
      const head = el('div.section-head', el('p.eyebrow', 'Reviews'), el('h2.display#featuredTitle', 'In their words'), el('div.rule', { 'data-reveal': '' }));
      const card = review(pick(list), true, issuing());
      const body = el('div.wrap', head, el('div.feat-card', card),
        el('div.feat-foot', el('a.note-link', { href: '#reviews' }, 'All reviews', el('span.arrow', { 'aria-hidden': 'true' }, '→'))));
      const next = slot.nextElementSibling;
      const clear = () => !!next && next.getClientRects().length > 0 && next.getBoundingClientRect().top >= window.innerHeight;
      let tick = false;
      const open = () => {
        tick = false;
        if (!clear()) return;
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('hashchange', onScroll);
        slot.replaceChildren(body);
        slot.hidden = false;
        ceremony(card, head);
      };
      function onScroll() { if (!tick) { tick = true; requestAnimationFrame(open); } }
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('hashchange', onScroll);
      open();
    }
  }

  function mount(container) { root = container; render(); }
  async function render() {
    root.replaceChildren(U.loading('Loading…'));
    await D.init();
    const [settings, list] = await Promise.all([D.settings(), D.publicReviews().catch(() => [])]);
    const bookNow = () => el('a.btn.btn-gold.shine', { href: '#book' }, 'Book Now ', el('span.arrow', { 'aria-hidden': 'true' }, '→'));
    const google = () => settings.google_reviews_url ? el('a.btn.btn-glass', { href: settings.google_reviews_url, target: '_blank', rel: 'noopener', 'aria-label': 'Read our Google reviews (opens in a new tab)' }, 'Read our Google reviews ', extMark()) : null;
    // reviews are left from an account; while bookings are guest-only (doc 37) there is no account to sign in to
    const signIn = () => D.guestBooking ? null : el('p.bk-muted', 'Had a detail with us? ', el('a', { href: '#account' }, 'Sign in to your account'), ' and leave a review under ', el('a', { href: '#appointments' }, 'Appointments'), '.');
    // the featured review alone at the top, the rest under it in a grid, newest first
    const top = list.length ? pick(list) : null, rest = list.filter((r) => r !== top);
    const head = el('header.page-head', el('p.eyebrow', 'Customers'), el('h1.display.gold-text', 'Reviews'), el('span.rule', { 'data-reveal': '' }),
      el('p', 'Every review is from a real customer, after their detail.'));
    const card = top ? review(top, true, issuing()) : null;
    const raking = !top && lit() && !once(RAKE_KEY);
    const blank = top ? null : unissued(el('div.bk-actions', bookNow(), google()), signIn(), raking);
    const page = el('div.wrap.rv-page', head,
      top
        ? [el('div.rv-feature', card), rest.length ? el('div.rv-grid', rest.map((r) => review(r))) : null,
          el('div.rv-foot', el('div.bk-actions', bookNow(), google()), signIn())]
        : blank);
    root.replaceChildren(page);
    if (card) {
      // the ceremony on the first screen is the head's one gold light: the title takes none of its own this time
      if (!card.classList.contains('issued') && card.getBoundingClientRect().top < window.innerHeight) head.querySelector('h1').classList.add('au-lit');
      ceremony(card, head);
    }
    // the unissued certificate's raking light: once its seal is wholly on the screen
    if (raking) {
      const seal = blank.querySelector('.rv-seal');
      turnFor(seal, head, (e) => e.isIntersecting && e.intersectionRatio >= 0.99, () => {
        played(RAKE_KEY);
        lampOn(blank, seal, RAKE.ms, () => rake(blank, () => over(blank)));
        return RAKE.ms;
      });
    }
  }

  // Before the first review: an unissued certificate. The frame, the circles and the seal at rest; no stars, no quote,
  // no name, nothing that reads as a review; only the rules the owner set (doc 29 Q-R1, Q-R2, Q-R4; doc 22's gold).
  // lamp: the raking light will cross it this visit (render).
  const RAKE_KEY = 'ad.raked';
  const RULES = [
    'From a customer account, after a completed detail.',
    'Read by the owner before it is shown.',
    'Signed with a first name and last initial.',
    'Reviews of $200+ details are certified gold.',
  ];
  function unissued(actions, note, lamp) {
    return el('section.rv-empty.rv-unissued', { 'aria-labelledby': 'rvRules', 'data-moment': lamp ? '' : null },
      el('span.rv-frame', { 'aria-hidden': 'true' }), lamp ? el('span.rv-lamp', { 'aria-hidden': 'true' }) : null, circles(lamp), seal('rest', lamp),
      el('div.rv-un-main',
        el('h2.rv-un-title#rvRules', 'How reviews work here'),
        el('p.rv-un-lead', 'Reviews from Alchemist customers will appear here as they come in.'),
        el('ol.rv-rules', RULES.map((t, i) => el('li', el('span.n.tnum', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')), el('span', t)))),
        actions, note));
  }
  window.AlchemistReviews = { mount, mountFeatured };
})();
