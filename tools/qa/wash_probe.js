/* QA kit: the in-page half of wash.py, installed before any of the site's scripts (window.__QA_CFG set first).
   1. The page's own scrolls are counted: window.scrollTo / scroll / scrollBy, element scrollTo / scroll / scrollBy /
      scrollIntoView(IfNeeded), scrollTop writes and focus() (which scrolls too), each measured as the page's scrollY
      before and after. The harness's own scrolls run inside __qa.own() and are never counted.
   2. Mode ios imitates an iPhone (iOS 26.1 and earlier): navigator.platform is iPhone, no scrollend, no scroll
      anchoring, CSS.supports('overflow-anchor') false; and WebKit bug 310358: a script's scroll made while a finger
      is down is undone at that finger's next move (counted in __qa.undos). Fingers are tracked from the touch events;
      a "hidden" finger (the thumb that catches a fling, which iOS never reports) is one the shim knows of but the
      page never hears: its touch and pointer events are stopped here, and __qa.coast() moves the page as the
      engine's own momentum would, with that thumb on the glass.
   3. Every frame, the element nearest the middle of the screen is followed: a move of it that neither the
      visitor's input nor a scroll explains, over 400 px in one frame, is a jump (__qa.jumps). Frames hidden by a
      page change (the cut through black, a view transition, a view swap) are not judged. */
(function () {
  'use strict';
  const CFG = window.__QA_CFG || { mode: 'chromium' };
  const IOS = CFG.mode === 'ios';
  const W = window, now = () => performance.now();
  const qa = W.__qa = {
    mode: CFG.mode, undos: 0, undoPx: 0, landedUnder: 0, prog: 0, undo: 0, calls: [], jumps: [], worst: 0, frames: 0, judged: 0,
    trace: [], traceLeft: 0, fingers: 0, hidden: 0, pending: 0, depth: 0, lastInput: -1e9, lastMove: -1e9, inputUntil: 0, vt: 0, log: [],
  };
  const raw = {
    scrollTo: W.scrollTo, scrollBy: W.scrollBy, scroll: W.scroll,
    eTo: Element.prototype.scrollTo, eBy: Element.prototype.scrollBy, eScroll: Element.prototype.scroll,
    into: Element.prototype.scrollIntoView, ifNeeded: Element.prototype.scrollIntoViewIfNeeded,
    hFocus: HTMLElement.prototype.focus, sFocus: SVGElement.prototype.focus,
    top: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
  };
  qa.raw = raw;
  // the harness's own scroll (setup, the emulated momentum): never counted as the page's
  qa.own = (fn) => { qa.depth++; try { return fn(); } finally { qa.depth--; qa.lastInput = now(); } };
  const smoothArg = (a) => a && a[0] && typeof a[0] === 'object' && a[0].behavior === 'smooth';

  // ---------------------------------------------------------------- the page's own scrolls
  function track(kind, fn, self, args) {
    if (qa.depth > 0) return fn.apply(self, args);
    const y0 = W.scrollY;
    const r = fn.apply(self, args);
    const d = W.scrollY - y0;
    if (Math.abs(d) > 0.01) {
      qa.prog += d;
      const under = qa.fingers > 0;
      const c = { t: Math.round(now()), kind, d: Math.round(d), y: Math.round(W.scrollY), under };
      if (under) {   // what the page itself knew then (foam.js rest, where the site has it) and the last touches
        const rs = W.AlchemistWash && W.AlchemistWash.rest && W.AlchemistWash.rest.state;
        if (rs) c.page = { touches: rs.touches, tStart: Math.round(rs.tStart), tLift: Math.round(rs.tLift), tScroll: Math.round(rs.tScroll) };
        c.touches = qa.touchLog.slice(-4);
      }
      if (qa.calls.length < 400) qa.calls.push(c);
      if (IOS && under) qa.pending += d;   // undone at the finger's next move (WebKit bug 310358)
    }
    if (smoothArg(args)) {
      qa.lastMove = now();   // a smooth scroll animates: the motion it makes is seen, not a jump
      if (IOS && qa.fingers > 0) qa.smoothUnder = (qa.smoothUnder || 0) + 1;
    }
    return r;
  }
  const wrap = (kind, fn) => function () { return track(kind, fn, this, arguments); };
  W.scrollTo = wrap('scrollTo', raw.scrollTo);
  W.scroll = wrap('scroll', raw.scroll);
  W.scrollBy = wrap('scrollBy', raw.scrollBy);
  Element.prototype.scrollTo = wrap('el.scrollTo', raw.eTo);
  Element.prototype.scroll = wrap('el.scroll', raw.eScroll);
  Element.prototype.scrollBy = wrap('el.scrollBy', raw.eBy);
  Element.prototype.scrollIntoView = wrap('scrollIntoView', raw.into);
  if (raw.ifNeeded) Element.prototype.scrollIntoViewIfNeeded = wrap('scrollIntoViewIfNeeded', raw.ifNeeded);
  HTMLElement.prototype.focus = wrap('focus', raw.hFocus);
  SVGElement.prototype.focus = wrap('focus', raw.sFocus);
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true, enumerable: raw.top.enumerable,
    get() { return raw.top.get.call(this); },
    set(v) { const el = this; track('scrollTop', (x) => raw.top.set.call(el, x), el, [v]); },
  });
  // the harness's own scroll by dy (whole pixels, as an engine scrolls)
  qa.scrollBy = (dy) => qa.own(() => raw.scrollBy.call(W, 0, dy));
  qa.scrollTo = (y) => qa.own(() => raw.scrollTo.call(W, 0, y));

  // ---------------------------------------------------------------- an iPhone
  if (IOS) {
    try { Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'iPhone', configurable: true }); } catch (e) { /* kept */ }
    try { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5, configurable: true }); } catch (e) { /* kept */ }
    for (const o of [W, Window.prototype, Document.prototype, HTMLElement.prototype, Element.prototype]) {
      try { delete o.onscrollend; } catch (e) { /* kept */ }
    }
    W.addEventListener('scrollend', (e) => e.stopImmediatePropagation(), true);
    document.addEventListener('scrollend', (e) => e.stopImmediatePropagation(), true);
    const sup = CSS.supports.bind(CSS);
    CSS.supports = function (a, b) { if (/overflow-anchor/.test(String(a))) return false; return arguments.length > 1 ? sup(a, b) : sup(a); };
    const css = () => { const s = document.createElement('style'); s.textContent = '*, html, body { overflow-anchor: none !important; }'; (document.head || document.documentElement).appendChild(s); };
    if (document.documentElement) css(); else new MutationObserver((m, o) => { if (document.documentElement) { o.disconnect(); css(); } }).observe(document, { childList: true });
  }
  // the finger's next move: the engine puts back what a script scrolled under it
  function moved() {
    if (!qa.pending) return;
    const d = qa.pending;
    qa.pending = 0;
    qa.depth++;
    try { raw.scrollBy.call(W, 0, -d); } finally { qa.depth--; }
    qa.undo += -d;
    qa.undos++;
    qa.traceLeft = 4;   // the frames that follow an undo are kept (qa.trace)
    qa.undoPx += Math.abs(d);
    if (qa.log.length < 200) qa.log.push({ t: Math.round(now()), undo: Math.round(-d), y: Math.round(W.scrollY) });
  }
  qa.moved = moved;
  const touchOpt = { capture: true, passive: true };
  qa.touchLog = [];
  const onTouch = (e) => {
    qa.lastInput = now();
    const hidden = qa.hidden;
    qa.touchLog.push(e.type.slice(5) + (hidden ? '(h)' : '') + ':' + e.touches.length + '@' + Math.round(now()));
    if (qa.touchLog.length > 12) qa.touchLog.shift();
    if (!hidden) qa.fingers = e.touches.length;
    if (e.type === 'touchmove') moved();
    if (!qa.fingers && qa.pending) { qa.landedUnder++; qa.pending = 0; }   // lifted with no move after it: the scroll stays
    if (hidden) { e.stopImmediatePropagation(); return; }
    // a flick armed by the harness: its momentum starts as the finger lifts, once the page has heard the lift
    if (e.type === 'touchend' && !qa.fingers && qa.armed) { const a = qa.armed; qa.armed = null; setTimeout(() => { qa.coasting = qa.coast(a.v, a.k, a.vmin); }); }
  };
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach((t) => W.addEventListener(t, onTouch, touchOpt));
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture'].forEach((t) =>
    W.addEventListener(t, (e) => { if (qa.hidden && e.pointerType === 'touch') e.stopImmediatePropagation(); }, true));
  ['wheel', 'keydown', 'mousedown'].forEach((t) => W.addEventListener(t, () => { qa.lastInput = now(); }, { capture: true, passive: true }));
  W.addEventListener('scroll', () => { const t = now(); if (t - Math.max(qa.lastInput, qa.lastMove) < 250) qa.lastMove = t; }, { capture: true, passive: true });

  // the harness's gestures: input is on its way from busy() until 800ms after idle() (a busy page scrolls by the
  // input on its compositor before its own events for it come in)
  qa.busy = () => { qa.inputUntil = Infinity; };
  qa.idle = () => { qa.inputUntil = now() + 800; };
  // a hidden thumb: on the glass for the shim, never heard by the page
  qa.hide = (n) => { qa.hidden = n ? 1 : 0; qa.fingers = n ? 1 : 0; if (!n && qa.pending) { qa.landedUnder++; qa.pending = 0; } };
  // The engine's momentum after a lift, with a hidden thumb on the glass from the lift on (strictest: the thumb that
  // may catch a fling is never heard): v px a frame, times k each frame, until under vmin. The thumb stays down
  // (hidden) until the harness lifts it (hide(0)); its moves (the harness's hidden touches) undo as any finger's.
  qa.arm = (v, k, vmin) => { qa.armed = { v, k, vmin }; qa.coasting = null; };
  qa.coast = (v, k, vmin) => new Promise((res) => {
    qa.hide(1);
    const step = () => {
      if (Math.abs(v) < vmin) { res(); return; }
      moved();
      qa.scrollBy(Math.round(v));
      v *= k;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  // ---------------------------------------------------------------- what is on the screen
  if (document.startViewTransition) {
    const svt = document.startViewTransition.bind(document);
    document.startViewTransition = function () {
      const t = svt.apply(document, arguments);
      qa.vt++;
      const end = () => { qa.vt = Math.max(0, qa.vt - 1); qa.vtEnd = now(); };
      t.finished.then(end, end);
      return t;
    };
  }
  const view = () => document.querySelector('.view:not([hidden])') || document.body;
  // the screen is hidden from the visitor: a cut through black, a view transition, just after one
  function covered() {
    if (qa.vt || now() - (qa.vtEnd || -1e9) < 50) return true;
    const s = document.getElementById('scrim');
    if (s && s.classList.contains('cut') && s.classList.contains('on')) return true;
    return false;
  }
  // candidates: blocks of the shown view, three levels down, outside the wash's stage; the stage itself
  let curView = null, cands = [];
  function candidates(v) {
    const out = [];
    const walk = (el, depth) => {
      for (const c of el.children) {
        if (out.length > 220) return;
        if (c.id === 'washStage') { out.push(c); continue; }
        if (/^(SCRIPT|STYLE|TEMPLATE|svg|canvas|CANVAS)$/.test(c.tagName)) continue;
        out.push(c);
        if (depth < 3) walk(c, depth + 1);
      }
    };
    walk(v, 1);
    const f = document.querySelector('footer');
    if (f) { out.push(f); walk(f, 2); }
    return out;
  }
  let prev = null;
  function pick(rs) {   // the smallest block across the middle of the screen, else the nearest one
    const mid = innerHeight / 2;
    let best = -1, bh = Infinity, bd = Infinity;
    rs.forEach((r, i) => {
      if (!r || r.height < 2 || r.width < 2) return;
      if (r.top <= mid && r.bottom >= mid) { if (r.height < bh) { bh = r.height; best = i; bd = 0; } }
      else if (bh === Infinity) { const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid)); if (d < bd) { bd = d; best = i; } }
    });
    return best;
  }
  function frame() {
    requestAnimationFrame(frame);   // first, so this runs before the page's own frame work
    qa.frames++;
    const t = now(), v = view(), y = W.scrollY;
    if (v !== curView) { curView = v; cands = candidates(v); prev = null; }
    const rs = cands.map((el) => (el.isConnected && el.getClientRects().length ? el.getBoundingClientRect() : null));
    const cov = covered();
    if (prev && !cov && !prev.cov) {
      const a = prev.anchor, el = a >= 0 ? cands[a] : null, r = el ? rs[a] : null;
      if (el && r && prev.rect) {
        const dV = r.top - prev.rect.top;
        const dS = (y - prev.y) - qa.prog - qa.undo;          // the scroll the input made (the visitor's, the momentum's)
        const input = t < qa.inputUntil || t - Math.max(qa.lastInput, qa.lastMove) < 700;
        const s = input ? dS : 0;
        let u = dV + s;
        if (el.id === 'washStage' && getComputedStyle(el).position === 'sticky' && Math.abs(dV) < Math.abs(u)) u = dV;   // pinned: it holds still under the input
        qa.judged++;
        if (Math.abs(u) > 400) {
          qa.jumps.push({ t: Math.round(t), u: Math.round(u), y: Math.round(y), dV: Math.round(dV), dS: Math.round(dS), prog: Math.round(qa.prog), undo: Math.round(qa.undo), el: (el.id || el.className || el.tagName).toString().slice(0, 40) });
          qa.worst = Math.max(qa.worst, Math.round(Math.abs(u)));
        }
      }
    }
    const anchor = cov ? -1 : pick(rs);
    if (qa.traceLeft > 0 && qa.trace.length < 40) {
      qa.traceLeft--;
      const el = prev && prev.anchor >= 0 ? cands[prev.anchor] : null;
      qa.trace.push({ t: Math.round(t), y: Math.round(y), prog: Math.round(qa.prog), undo: Math.round(qa.undo), cov, prevCov: prev && prev.cov,
        el: el ? (el.id || String(el.className)).slice(0, 30) : null, top: el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top) : null, was: prev && prev.rect ? Math.round(prev.rect.top) : null });
    }
    prev = { y, anchor, rect: anchor >= 0 ? rs[anchor] : null, cov };
    qa.prog = 0;
    qa.undo = 0;
  }
  requestAnimationFrame(frame);
})();
