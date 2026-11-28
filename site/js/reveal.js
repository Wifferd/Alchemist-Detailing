/* Alchemist Detailing: Home's "Reveal".
   The word sits under the gold Services, thin and ghostly, and its light never stops withering off the letters: small
   specks leave the glyphs in every direction, drift, shrink and fade, a few a moment, on a constant. A press plays the
   wash (app.js asks foam.js); at the press the specks rush outward once as the word goes.
   Also sets the title's arrival: the gold Services rises in as the stage comes up the screen (CSS .pre / .in).
   Nothing runs while the word is off the screen, the tab is hidden, or under less motion (the word is not shown then). */
(function () {
  'use strict';
  const btn = document.getElementById('revealBtn'), cv = document.getElementById('revealDust'), title = document.getElementById('washTitle');
  if (!btn || !cv || !title) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  // ---- the title's arrival: hidden until the stage is a third on the screen, then once
  title.classList.add('pre');
  const big = title.querySelector('.big');
  const arrive = () => { title.classList.remove('pre'); title.classList.add('in'); if (big) big.classList.add('glint'); };
  new IntersectionObserver((es, io) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); arrive(); }
  }, { threshold: 0.3 }).observe(document.getElementById('washStage') || title);

  // ---- the specks
  const ctx = cv.getContext('2d');
  const word = btn.querySelector('.reveal-word');
  let W = 0, H = 0, dpr = 1, spots = [], on = false, raf = 0, last = 0, burst = 0, heat = 0, carry = 0, hover = false;
  const specks = [];
  const MAX = 150;
  let rgb = [253, 221, 151], light = false;

  // one soft dot, drawn once and scaled for every speck
  const dot = document.createElement('canvas'); dot.width = dot.height = 32;
  (() => { const c = dot.getContext('2d'), g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); })();
  const tint = document.createElement('canvas'); tint.width = tint.height = 32;
  function tinted() {   // the dot in the theme's gold (a deep gold on the studio's cream)
    const c = tint.getContext('2d');
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, 32, 32);
    c.drawImage(dot, 0, 0);
    c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(' + rgb.join(',') + ')'; c.fillRect(0, 0, 32, 32);
  }
  function readTheme() {
    light = document.documentElement.dataset.theme === 'light';
    const m = (getComputedStyle(document.documentElement).getPropertyValue(light ? '--gold-ink' : '--gold-hi-rgb') || '').match(/\d+(\.\d+)?/g);
    if (m && m.length >= 3) rgb = m.slice(0, 3).map(Number);
    tinted();
  }

  // where the letters are: each letter's box from the page, then the glyph itself drawn into a mask at that box
  function glyphs() {
    spots = [];
    const node = word.firstChild;
    if (!node || node.nodeType !== 3) return;
    const cs = getComputedStyle(word), size = parseFloat(cs.fontSize), ls = parseFloat(cs.letterSpacing) || 0;
    const wr = cv.getBoundingClientRect();
    const m = document.createElement('canvas'), mc = m.getContext('2d', { willReadFrequently: true });
    m.width = 96; m.height = 96;
    const text = node.textContent.toUpperCase();
    const rg = document.createRange();
    for (let i = 0; i < text.length; i++) {
      rg.setStart(node, i); rg.setEnd(node, i + 1);
      const r = rg.getBoundingClientRect();
      if (!r.width) continue;
      const w = Math.max(2, r.width - ls);
      mc.clearRect(0, 0, 96, 96);
      mc.font = '300 ' + 64 + 'px ' + cs.fontFamily;
      mc.textBaseline = 'alphabetic';
      const tw = mc.measureText(text[i]).width || 40;
      mc.save(); mc.translate(0, 72); mc.scale((96 * 0.94) / Math.max(tw, 1) > 1.8 ? 1.8 : 1, 1); mc.fillText(text[i], 0, 0); mc.restore();
      const d = mc.getImageData(0, 0, 96, 96).data;
      const sx = w / Math.min(96, Math.max(tw, 1) * ((96 * 0.94) / Math.max(tw, 1) > 1.8 ? 1.8 : 1)), sy = size * 0.72 / 46;
      for (let y = 0; y < 96; y += 3) for (let x = 0; x < 96; x += 3) {
        if (d[(y * 96 + x) * 4 + 3] > 120) spots.push([r.left - wr.left + x * sx, r.top - wr.top + size * 0.86 + (y - 72) * sy]);
      }
    }
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    glyphs();
  }

  function emit(n, fast) {
    if (!spots.length) return;
    for (let i = 0; i < n && specks.length < MAX * (fast ? 2 : 1); i++) {
      const s = spots[(Math.random() * spots.length) | 0];
      const a = Math.random() * Math.PI * 2;                 // any direction at all
      const v = (fast ? 90 : 5) + Math.random() * (fast ? 160 : 20);
      specks.push({ x: s[0], y: s[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - (fast ? 0 : 2), age: 0, life: (fast ? 0.5 : 1.7) + Math.random() * (fast ? 0.5 : 1.8),
        r: 0.9 + Math.random() * 1.7, k: Math.random() < 0.3 ? 1 : 0, ph: Math.random() * 6.28 });
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    heat += ((hover || document.activeElement === btn ? 1 : 0) - heat) * Math.min(1, dt * 5);
    carry += (46 + heat * 30) * dt;
    const n = Math.floor(carry); carry -= n;
    if (n) emit(n, false);
    if (burst > 0) { emit(Math.ceil(120 * dt / 0.016 * 0.3), true); burst -= dt; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    for (let i = specks.length - 1; i >= 0; i--) {
      const q = specks[i];
      q.age += dt;
      if (q.age >= q.life) { specks.splice(i, 1); continue; }
      const t = q.age / q.life;
      const drag = Math.exp(-dt * 1.6);                      // they slow as they wither
      q.vx = q.vx * drag + Math.cos(q.ph + q.age * 1.7) * 3 * dt;
      q.vy = q.vy * drag + Math.sin(q.ph + q.age * 1.3) * 3 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      const a = Math.min(1, t * 8) * Math.pow(1 - t, 1.6) * (light ? 0.7 : 1);   // in quickly, a long fade out
      const sz = q.r * (1 - t * 0.55) * 7;                     // the sprite is 32px with a soft edge
      ctx.globalAlpha = a;
      ctx.drawImage(q.k && !light ? dot : tint, q.x - sz / 2, q.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  function run(v) {
    if (v === on) return;
    on = v;
    if (on) { last = performance.now(); readTheme(); if (!W) size(); raf = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); ctx.clearRect(0, 0, W * dpr, H * dpr); }
  }
  let seen = false, shown = !document.hidden;
  const update = () => run(seen && shown && !title.closest('.washed') && !document.querySelector('.wash.washed') && !document.querySelector('.wash.wash-playing'));
  new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; update(); }, { rootMargin: '10% 0px' }).observe(btn);
  document.addEventListener('visibilitychange', () => { shown = !document.hidden; update(); });
  new MutationObserver(() => update()).observe(document.getElementById('wash') || document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(() => { if (on) readTheme(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.ResizeObserver) new ResizeObserver(() => { if (on) size(); }).observe(btn);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (on) size(); });
  btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  btn.addEventListener('pointerleave', () => { hover = false; });
  btn.addEventListener('click', () => { burst = 0.35; });   // the press: one rush outward as the word goes
})();
