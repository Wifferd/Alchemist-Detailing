/* Alchemist Detailing: gold running out of The Alchemist Standard's gold words (the owner, Nov 28: "a glow on the words and
   gold dripping for the texts"; then: "it should stay flush with the text and not be a whole animation on top of the text,
   and only the gold texts").

   Only the gold words drip: the gold phrase once its light has settled, the promise line and the label. A drip is not laid
   over the text: it starts at the real bottom edge of one of the gold letters (the letter is drawn off screen in the same
   font, and the lowest points of its ink found), in the colour of that very text, as wide as the letter's stroke, and it
   stays in the room under its own line (it never crosses the next line). The life of a drip: the gold swells under the
   letter, stretches into a thread with a bulb at its end, the neck thins, and then either the bulb lets go and falls a
   short way and is gone while what stayed behind draws back into the letter, or the thread simply draws back into it.
   A few at a time, only while the section is on the screen and its own entrance has played. Nothing runs under reduced
   motion (the glow is the stylesheet's and is simply there), with the tab hidden or off the screen. */
(function () {
  'use strict';
  const sec = document.getElementById('standard');
  if (!sec) return;
  const wrap = sec.querySelector('.wrap');
  if (!wrap) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cv = document.createElement('canvas');
  cv.className = 'gilt-drips';
  cv.setAttribute('aria-hidden', 'true');
  wrap.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, on = false, seen = false, shown = !document.hidden, ready = false, wait = 1.0;
  const drips = [];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = (t) => t * t * (3 - 2 * t);

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  // ---- the gold words, and where each gold letter ends -------------------------------------------------------------
  // [selector, how likely it is to drip, needs its light to have settled]
  const SRC = [['.statement em', 3, true], ['.script', 2, false], ['h2.eyebrow', 1.2, false]];

  const rgbOf = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : [245, 186, 76]; };

  // The lowest points of a letter's ink, measured from a drawing of it in the same font (cached): its pen position and
  // baseline are the origin, so a point is { dx, dy, sw } (the stroke's width there). Scale 2 for a finer edge.
  const cache = new Map();
  function bottoms(ch, font, fs) {
    const key = font + '|' + ch;
    if (cache.has(key)) return cache.get(key);
    const S = 2, pad = Math.ceil(fs * 0.6) * S, w = Math.ceil(fs * 2.6) * S, h = Math.ceil(fs * 2.4) * S, base = Math.ceil(fs * 1.5) * S;
    probe.canvas.width = w; probe.canvas.height = h;
    probe.clearRect(0, 0, w, h);
    probe.font = font.replace(/[\d.]+px/, (fs * S) + 'px');
    probe.textBaseline = 'alphabetic';
    probe.fillStyle = '#000';
    probe.fillText(ch, pad, base);
    const d = probe.getImageData(0, 0, w, h).data;
    const low = new Array(w).fill(-1);
    let maxB = -1;
    for (let x = 0; x < w; x++) {
      for (let y = h - 1; y >= 0; y--) if (d[(y * w + x) * 4 + 3] > 120) { low[x] = y; break; }
      if (low[x] > maxB) maxB = low[x];
    }
    const out = [];
    if (maxB >= 0) {
      for (let x = 0; x < w; x++) {
        if (low[x] < maxB - 2) continue;
        // how wide this foot of the letter is: the run of columns whose lowest ink is about as low
        let a = x, b = x;
        while (a > 0 && low[a - 1] >= maxB - 5) a--;
        while (b < w - 1 && low[b + 1] >= maxB - 5) b++;
        if (x === Math.round((a + b) / 2) || (b - a) < 3) out.push({ dx: (x - pad) / S, dy: (maxB - base) / S, sw: Math.max(1.4, (b - a + 1) / S) });
      }
    }
    cache.set(key, out);
    return out;
  }

  // every gold letter with a foot to drip from, as it stands on the screen now
  function anchors() {
    const out = [], cr = cv.getBoundingClientRect();
    SRC.forEach(([sel, wgt, needsLit]) => sec.querySelectorAll(sel).forEach((el) => {
      if (needsLit && (!el.classList.contains('au-lit') || el.classList.contains('au-run'))) return;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize) || 16;
      const font = (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || 400) + ' ' + fs + 'px ' + cs.fontFamily;
      probe.font = font;
      const m = probe.measureText('Mx');
      const asc = m.fontBoundingBoxAscent || fs * 0.8;
      const color = rgbOf(cs.color);
      // the room under this line: down to the top of the next block of text (never into it)
      const block = el.closest('.statement, .script, h2.eyebrow') || el, next = block.nextElementSibling;
      const nextTop = next ? next.getBoundingClientRect().top - cr.top : cr.height;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.textContent;
        for (let i = 0; i < txt.length; i++) {
          const ch = txt[i];
          if (!/\S/.test(ch) || ch.charCodeAt(0) > 0x2000) continue;   // a space, or a sign from another font (the star)
          const rg = document.createRange();
          rg.setStart(n, i); rg.setEnd(n, i + 1);
          const r = rg.getClientRects()[0];
          if (!r || r.width < 1) continue;
          const pts = bottoms(ch, font, fs);
          if (!pts.length) continue;
          const baseY = r.top - cr.top + asc;
          out.push({ x: r.left - cr.left, baseY, pts, color, fs, w: wgt, nextTop, lineBottom: r.bottom - cr.top });
        }
      }
    }));
    return out;
  }

  function spawn() {
    if (drips.filter((d) => !d.wave).length >= 6) return;
    const A = anchors();
    if (!A.length) return;
    let total = 0; A.forEach((a) => { total += a.w; });
    let k = Math.random() * total, a = A[0];
    for (const c of A) { k -= c.w; if (k <= 0) { a = c; break; } }
    const pt = a.pts[(Math.random() * a.pts.length) | 0];
    const x = a.x + pt.dx, y0 = a.baseY + pt.dy - 1.2;            // a hair inside the letter, so the gold is one piece
    for (const d of drips) if (Math.abs(d.x - x) < a.fs * 0.5 && Math.abs(d.y0 - y0) < 4) return;   // not two from one spot
    const room = Math.max(10, a.nextTop - y0 - 4);
    const sw = clamp(pt.sw, 2.0, a.fs * 0.16);
    const fall = Math.random() < 0.6;
    const Lmax = Math.min(room * (fall ? 0.5 : 0.62), a.fs * (0.55 + Math.random() * 0.8));
    drips.push({ x, y0, color: a.color, sw, room, fall, Lmax, rb: Math.min(a.fs * 0.17, sw * (1.0 + Math.random() * 0.45) + 0.9),
      tSwell: 0.8 + Math.random() * 0.7, tStretch: 1.5 + Math.random() * 1.6, t: 0, ph: 0, vy: 0, by: 0, fell: 0, stub: 0, hold: 0.5 + Math.random() * 0.5 });
  }

  // The entrance: once, each gold letter in reading order lets a short drip swell from its own foot and draws it back in,
  // one letter after another (the owner, Nov 28: "animate each letter individually and then place the text"), and then
  // the text simply stands there and the slow drips begin.
  let waved = false;
  function waveSpawn() {
    const A = anchors();
    if (!A.length) return false;
    waved = true;
    const line = (a) => Math.round(a.baseY / 8);
    A.sort((p, q) => line(p) - line(q) || p.x - q.x);
    A.forEach((a, i) => {
      const pt = a.pts[Math.floor(a.pts.length / 2)];
      const x = a.x + pt.dx, y0 = a.baseY + pt.dy - 1.2;
      const room = Math.max(10, a.nextTop - y0 - 4), sw = clamp(pt.sw, 2.0, a.fs * 0.16);
      drips.push({ wave: true, x, y0, color: a.color, sw, room, fall: false, Lmax: Math.min(room * 0.5, a.fs * (0.18 + Math.random() * 0.42)),
        rb: Math.min(a.fs * 0.1, sw * (0.8 + Math.random() * 0.3) + 0.3), tSwell: 0.3, tStretch: 0.4 + Math.random() * 0.3, back: 0.7, hold: 0.05,
        t: -i * 0.045, ph: 0, vy: 0, by: 0, fell: 0, stub: 0 });
    });
    return true;
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------
  // A drip is ONE piece of gold (the owner, Nov 28: "it shouldn't have two different parts"): the thread and its bulb are
  // a single outline filled with the text's own colour, no separate bead, highlight or rim. Only a faint darkening toward
  // the edges (the same hue) so it reads as round.
  const rgba = (c, a) => 'rgba(' + c.map((v) => Math.round(clamp(v, 0, 255))).join(',') + ',' + a + ')';
  const darker = (c, f) => c.map((v) => v * f);

  // yTop: where it leaves the letter (wTop wide: the flare), by: the centre of the bulb (rb its radius, stretch its height
  // over its width), wNeck: the neck between. A short bulb with no thread is a swelling.
  function drop(d, yTop, wTop, wNeck, by, rb, stretch, a) {
    const x = d.x, yN = Math.max(yTop + 0.5, by - rb * stretch * 1.05), n = 8;
    ctx.fillStyle = rgba(d.color, a);                  // the letter's own colour, flat: no shading, so it reads as the letter
    const wAt = (t) => wNeck + (wTop - wNeck) * Math.pow(1 - t, 2.2);
    ctx.beginPath();
    ctx.moveTo(x - wTop * 0.5, yTop);
    for (let i = 1; i <= n; i++) { const t = i / n; ctx.lineTo(x - wAt(t) * 0.5, yTop + (yN - yTop) * t); }
    ctx.bezierCurveTo(x - wNeck * 0.5, yN + rb * 0.4, x - rb, by - rb * stretch * 0.85, x - rb, by);
    ctx.ellipse(x, by, rb, rb * stretch, 0, Math.PI, 0, true);            // left, round the bottom, right
    ctx.bezierCurveTo(x + rb, by - rb * stretch * 0.85, x + wNeck * 0.5, yN + rb * 0.4, x + wNeck * 0.5, yN);
    for (let i = n - 1; i >= 0; i--) { const t = i / n; ctx.lineTo(x + wAt(t) * 0.5, yTop + (yN - yTop) * t); }
    ctx.closePath();
    ctx.fill();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    wait -= dt;
    if (wait <= 0) { if (!waved) { if (!waveSpawn()) wait = 0.4; else wait = 3.2; } else { spawn(); wait = 0.7 + Math.random() * 1.3; } }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (drips.length) { ctx.shadowColor = rgba(drips[0].color, 0.45); ctx.shadowBlur = 6; }   // lit as the letters are
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      d.t += dt;
      if (d.t < 0) continue;                     // its turn in the wave has not come
      const Ts = d.tSwell, Tst = d.tStretch;
      if (d.ph === 0) {
        if (d.t < Ts) {
          // the gold swells under the letter: a bulge a little wider than the stroke
          const e = ease(d.t / Ts), h = d.sw * 1.1 * e;
          drop(d, d.y0 - 1, d.sw * 1.5, d.sw, d.y0 + h * 0.55, d.sw * (0.6 + 0.34 * e), 0.6 + 0.4 * e, 1);
        } else {
          // it stretches: the thread lengthens (slowly, then more and more), the neck thins, the bulb at the end grows
          const u = clamp((d.t - Ts) / Tst, 0, 1);
          let L = d.Lmax * Math.pow(u, 1.7), neck = d.sw * (1 - 0.5 * u), rb = d.sw * 0.8 + (d.rb - d.sw * 0.8) * u;
          if (!d.fall && u >= 1) {          // a drip that does not let go: it holds, then draws back into the letter
            const back = clamp((d.t - Ts - Tst - d.hold) / (d.back || 1.1), 0, 1);
            if (back >= 1) { drips.splice(i, 1); continue; }
            const k = 1 - ease(back);
            L = d.Lmax * k; neck = d.sw * (0.5 + 0.5 * (1 - k)); rb = d.sw * 0.8 + (d.rb - d.sw * 0.8) * k;
          }
          const by = d.y0 + L + rb * 0.9;
          drop(d, d.y0 - 1, d.sw * 1.8, neck, by, rb, 1.2, 1);
          if (d.fall && u >= 1) { d.ph = 1; d.pinch = 0; d.by = by; d.L = L; d.rbNow = rb; d.neck = neck; }
        }
      } else if (d.ph === 1) {
        // the neck pinches thin (a moment) and the bulb goes
        d.pinch += dt;
        const k = clamp(d.pinch / 0.2, 0, 1), by = d.by + k * 2;
        drop(d, d.y0 - 1, d.sw * 1.8, Math.max(0.5, d.neck * (1 - 0.85 * k)), by, d.rbNow * (1 - 0.08 * k), 1.2 + 0.3 * k, 1);
        if (k >= 1) { d.ph = 2; d.vy = 50; d.fell = 0; d.stubT = 0; d.stubL = d.L * 0.45; }
      } else {
        // the bulb falls (stretching, with a short tail as it speeds up) a short way and is gone before the next line;
        // what stayed behind draws back into the letter
        d.vy += 900 * dt; d.by += d.vy * dt; d.fell += d.vy * dt; d.stubT += dt;
        const lim = Math.max(14, Math.min(d.room * 0.55, 52)), a = clamp(1 - (d.fell - lim * 0.6) / (lim * 0.5), 0, 1);
        if (d.stubT < 0.4) {
          const k = 1 - ease(d.stubT / 0.4), sl = d.stubL * k;
          if (sl > 0.6) drop(d, d.y0 - 1, d.sw * 1.8, d.sw * 0.8, d.y0 + sl, d.sw * (0.55 + 0.25 * k), 0.9, 1);
        }
        if (a <= 0) { drips.splice(i, 1); continue; }
        const rb = d.rbNow * (1 - Math.min(0.3, d.fell / 160)), tail = Math.min(rb * 2.4, d.vy / 170);
        drop(d, d.by - rb - tail, rb * 0.5, rb * 0.4, d.by, rb, 1.15, a);
      }
    }
    ctx.shadowBlur = 0;
  }

  function run(v) {
    if (v === on) return;
    on = v;
    if (on) { size(); last = performance.now(); raf = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); ctx.clearRect(0, 0, cv.width, cv.height); drips.length = 0; }
  }
  const update = () => run(ready && seen && shown);

  // wait for the section's own entrance (its lines rise and the gold phrase takes its light), then start
  const arrive = () => { if (ready || !sec.classList.contains('in')) return; setTimeout(() => { ready = true; update(); }, 3200); };
  new MutationObserver(arrive).observe(sec, { attributes: true, attributeFilter: ['class'] });
  arrive();
  new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; update(); }, { rootMargin: '5% 0px' }).observe(sec);
  document.addEventListener('visibilitychange', () => { shown = !document.hidden; update(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (on) { size(); cache.clear(); } }).observe(wrap);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cache.clear());
})();
