/* Alchemist Detailing: gold dripping off The Alchemist Standard's words (the owner, Nov 28: "a glow on the words and gold
   dripping for the texts"). The glow is the stylesheet's (.standard ... giltGlow). This draws the drips on a canvas laid
   over the section's text: now and then a bead of molten gold swells under a word, stretches a short thread, lets go, falls a
   little and is gone. A few at a time, only while the section is on the screen and its own entrance has played.
   Nothing runs under reduced motion (the glow is simply there), with the tab hidden or off the screen. */
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

  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, on = false, seen = false, shown = !document.hidden, ready = false, wait = 0.8;
  const drips = [];
  let gold = [245, 186, 76], hi = [253, 221, 151], light = false;

  const num = (v) => { const m = (v || '').match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null; };
  const hex = (v) => { const m = (v || '').trim().match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    light = document.documentElement.dataset.theme === 'light';
    if (light) { const g = hex(cs.getPropertyValue('--studio-gold-ink')) || [128, 87, 7]; gold = g; hi = [g[0] + 40, g[1] + 34, g[2] + 14]; }
    else { gold = num(cs.getPropertyValue('--gold-rgb')) || gold; hi = num(cs.getPropertyValue('--gold-hi-rgb')) || hi; }
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  // where the words are: every line of the words that may drip, with how likely each is to (the gold phrase most)
  function lines() {
    const out = [], cr = cv.getBoundingClientRect();
    const targets = [['.statement', 1], ['.statement em', 3], ['.script', 2], ['h2.eyebrow', 1.2], ['.facts span', 0.8]];
    targets.forEach(([sel, w]) => sec.querySelectorAll(sel).forEach((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        // an em's words count once, as the em (not again as part of the statement)
        if (sel === '.statement' && n.parentElement && n.parentElement.closest('em')) continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 8 && r.height > 4) out.push({ x0: r.left - cr.left, x1: r.right - cr.left, y: r.bottom - cr.top - fs * 0.3, w: w * r.width, sc: Math.max(0.8, Math.min(1.9, fs / 18)) });
      }
    }));
    return out;
  }

  function spawn() {
    if (drips.length >= 9) return;
    const L = lines();
    if (!L.length) return;
    let total = 0; L.forEach((l) => { total += l.w; });
    let k = Math.random() * total, pick = L[0];
    for (const l of L) { k -= l.w; if (k <= 0) { pick = l; break; } }
    const x = pick.x0 + 6 + Math.random() * Math.max(1, pick.x1 - pick.x0 - 12);
    const sc = pick.sc;   // bigger words drip bigger drops
    drips.push({ x, y0: pick.y, t: 0, hang: 1.3 + Math.random() * 1.4, maxLen: (18 + Math.random() * 32) * sc, r1: (2.3 + Math.random() * 1.9) * sc,
      sc, state: 0, fy: 0, vy: 0, fall: 0, snap: 0 });
  }

  const rgba = (c, a) => 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')';

  function bead(x, y, r, stretch, a) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4 * stretch, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, rgba(light ? hi : [255, 244, 214], a));
    g.addColorStop(0.35, rgba(hi, a));
    g.addColorStop(0.75, rgba(gold, a));
    g.addColorStop(1, rgba(gold.map((v) => v * 0.55), a));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * stretch, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    wait -= dt;
    if (wait <= 0) { spawn(); wait = 0.35 + Math.random() * 0.8; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!light) { ctx.shadowColor = rgba(gold, 0.55); ctx.shadowBlur = 7; }
    for (let i = drips.length - 1; i >= 0; i--) {
      const d = drips[i];
      d.t += dt;
      if (d.state === 0) {
        // hanging: the bead swells and the thread under the word lengthens (slowly at first, then more and more)
        const p = Math.min(1, d.t / d.hang), e = p * p * (3 - 2 * p), len = d.maxLen * (0.15 * p + 0.85 * e * e);
        const r = 0.8 * d.sc + (d.r1 - 0.8 * d.sc) * e, by = d.y0 + len + r * 0.5;
        const w0 = 0.8 * d.sc, w1 = Math.max(1.0 * d.sc, r * 0.5);
        ctx.fillStyle = rgba(gold, 0.95);
        ctx.beginPath();
        ctx.moveTo(d.x - w0, d.y0); ctx.lineTo(d.x + w0, d.y0);
        ctx.quadraticCurveTo(d.x + w1, d.y0 + len * 0.55, d.x + w1, by);
        ctx.lineTo(d.x - w1, by);
        ctx.quadraticCurveTo(d.x - w1, d.y0 + len * 0.55, d.x - w0, d.y0);
        ctx.fill();
        bead(d.x, by, r, 1.15, 1);
        if (p >= 1) { d.state = 1; d.fy = by; d.vy = 25; d.r = r; d.len = len; }
      } else {
        // let go: the bead falls (stretching as it speeds up) and fades; what stayed under the word shrinks back
        d.vy += 640 * dt; d.fy += d.vy * dt; d.snap += dt;
        const fell = d.fy - (d.y0 + d.len), a = Math.max(0, 1 - Math.max(0, fell - 60 * d.sc) / (80 * d.sc));
        if (d.snap < 0.45) {
          const s = 1 - d.snap / 0.45;
          bead(d.x, d.y0 + 0.5 + (1 - s) * 2, (1.1 * s + 0.1) * d.sc, 1, s);
        }
        if (a <= 0) { drips.splice(i, 1); continue; }
        bead(d.x, d.fy, d.r * (1 - Math.min(0.35, fell / 260)), 1 + Math.min(0.9, d.vy / 520), a);
      }
    }
    ctx.shadowBlur = 0;
  }

  function run(v) {
    if (v === on) return;
    on = v;
    if (on) { readTheme(); size(); last = performance.now(); raf = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); ctx.clearRect(0, 0, cv.width, cv.height); drips.length = 0; }
  }
  const update = () => run(ready && seen && shown);

  // wait for the section's own entrance (its lines rise and the gold phrase takes its light), then start
  const arrive = () => { if (ready || !sec.classList.contains('in')) return; setTimeout(() => { ready = true; update(); }, 3200); };
  new MutationObserver(arrive).observe(sec, { attributes: true, attributeFilter: ['class'] });
  arrive();
  new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; update(); }, { rootMargin: '5% 0px' }).observe(sec);
  document.addEventListener('visibilitychange', () => { shown = !document.hidden; update(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (on) size(); }).observe(wrap);
  new MutationObserver(() => { if (on) readTheme(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
