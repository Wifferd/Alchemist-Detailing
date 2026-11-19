/* Alchemist Detailing — small shared UI pieces for the app screens: element
   building, fields, choice cards and chips, money and time formatting, the
   price breakdown, and the one place that shows a database error next to its
   field. */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // el('div.card#id', { attrs }, ...children)
  const IMG_ORDER = { sizes: 0.5, loading: 0.5, decoding: 0.5, srcset: 2, src: 3 };
  function el(spec, attrs, ...children) {
    if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    const node = document.createElement(m[1] || 'div');
    (m[2] || '').match(/[.#][\w-]+/g)?.forEach((t) => (t[0] === '.' ? node.classList.add(t.slice(1)) : (node.id = t.slice(1))));
    // an image takes its sizes and loading before its sources, so the browser picks one file, for the right width
    // (src first made a phone fetch the 1200w file and then the 600w one)
    const pairs = attrs ? Object.entries(attrs) : [];
    if (node.tagName === 'IMG') pairs.sort(([a], [b]) => (IMG_ORDER[a] || 1) - (IMG_ORDER[b] || 1));
    for (const [k, v] of pairs) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) node.style.setProperty(p, val); else node.style[p] = val; }
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k in node && k !== 'list' && typeof v !== 'object') { try { node[k] = v; } catch (e) { node.setAttribute(k, v); } }
      else node.setAttribute(k, v === true ? '' : v);
    }
    append(node, children);
    return node;
  }
  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  // By hand, not toLocaleString: its first use costs 40-100 ms on a slow phone.
  const money = (cents) => {
    if (cents == null) return '—';
    const n = Math.round(Math.abs(cents)), d = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // cents only when there are any: $59.99 and $79.99 (Migration 012's prices, Nov 18), but $75, never $75.00
    return '$' + (cents < 0 ? '-' : '') + d + (n % 100 ? '.' + String(n % 100).padStart(2, '0') : '');
  };
  const minutesText = (m) => {
    if (!m) return '';
    const h = Math.floor(m / 60), r = m % 60;
    return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r ? r + ' min' : '');
  };
  const clock = (min) => {
    const h24 = Math.floor(min / 60), mm = min % 60;
    const h = ((h24 + 11) % 12) + 1;
    return h + (mm ? ':' + String(mm).padStart(2, '0') : '') + (h24 < 12 ? ' AM' : ' PM');
  };
  const longDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const digits = (raw) => String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const phonePretty = (raw) => {
    const d = digits(raw);
    return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : raw;
  };
  // A phone number in running text is always a tel: link, on one line.
  const tel = (raw) => el('a.tnum', { href: 'tel:+1' + digits(raw) }, raw);
  // The menu's phone mark, for every call button (a call never gets an arrow). An SVG needs its own namespace,
  // which el() does not make.
  function telMark() {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('class', 'tel-mark'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    p.setAttribute('d', 'M6.6 3.8l2.3-.4 1.6 3.9-1.8 1.3a11 11 0 0 0 4.7 4.7l1.3-1.8 3.9 1.6-.4 2.3a2 2 0 0 1-2 1.7A15.6 15.6 0 0 1 4.9 5.8a2 2 0 0 1 1.7-2z');
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.7'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  }
  // The monogram's pass of light (the sent screen as it lands, the footer as it signs off): one band at the light's
  // angle, clipped to the mark's own shape (the page's #ad-mark), so the light stays inside its strokes. The mark's
  // <svg><use> takes the symbol's own units, so the clip and the band line up with it; key names the band's ids (two
  // marks can be on the page). The CSS moves the band (.mark-pass); at rest it waits outside the mark, unseen. None
  // under reduced motion.
  function lightMark(svg, key) {
    const NS = 'http://www.w3.org/2000/svg', shape = document.querySelector('#ad-mark path');
    if (!svg || !shape || svg.querySelector('.mark-pass')) return svg;
    const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
    svg.setAttribute('viewBox', '0 20 570 590');
    const use = svg.querySelector('use');
    if (use) [['x', 0], ['y', 20], ['width', 570], ['height', 590]].forEach(([k, v]) => use.setAttribute(k, v));
    if (reduce) return svg;
    const defs = mk('defs', {}), grad = mk('linearGradient', { id: key + 'Light', class: 'mark-light', x1: 0, y1: 0, x2: 1, y2: 0 }), clip = mk('clipPath', { id: key + 'Clip' });
    ['edge', 'core', 'edge'].forEach((c, i) => grad.appendChild(mk('stop', { offset: i / 2, class: c })));
    clip.appendChild(mk('path', { d: shape.getAttribute('d') }));
    defs.append(grad, clip);
    const band = mk('g', { 'clip-path': 'url(#' + key + 'Clip)' });
    band.appendChild(mk('rect', { class: 'mark-pass', x: -260, y: 0, width: 200, height: 640, fill: 'url(#' + key + 'Light)' }));
    svg.append(defs, band);
    return svg;
  }

  // A small SVG part (an SVG needs its own namespace, which el() does not make)
  function svgEl(tag, attrs) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }
  // A tick drawn as one fine stroke (the CSS draws it where .draw is set, or as its card is chosen): only where the
  // database has said yes (a code it verified, a ZIP in its service area) or the customer chose (a service card)
  function tick() {
    const s = svgEl('svg', { class: 'tick', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { d: 'M3.2 8.7l3.1 3 6.5-7.2', pathLength: 1 }));
    return s;
  }

  // The database can't be reached on the real site (data.js isDown, doc 42): a calm, centred note, with a Call button
  // when a phone number is given. `parts` is the sentence: strings and elements (a tel() link). Over it the monogram in
  // its thin gold ring, still, as on the Account's coming-soon panel (a picture only: hidden from readers).
  const outage = (parts, phone) => el('div.bk-down', { role: 'status' },
    el('span.soon-mark', { 'aria-hidden': 'true', innerHTML: '<svg class="soon-ring" viewBox="0 0 116 116"><circle cx="58" cy="58" r="57"/></svg><svg><use href="#ad-mark"/></svg>' }),
    el('p', ...parts),
    phone ? el('a.btn.btn-gold.shine', { href: 'tel:+1' + digits(phone) }, telMark(), el('span', 'Call ', el('span.tnum', phone))) : null);   // the phone mark, as on every call button

  // The wait (every app page's "Loading…"): nothing for the first 300ms, where most waits end; then the small AD mark,
  // the Standard's fine gold ring drawing itself round it once and a head of light lapping it, twelve times at most (the
  // CSS). A reader hears the words, and hears the screen arrive in their place.
  function loading(text) {
    const ring = svgEl('svg', { class: 'ld-ring', viewBox: '0 0 64 64' }), mark = svgEl('svg', { class: 'ld-ad', viewBox: '0 20 570 590' });
    ring.appendChild(svgEl('circle', { cx: 32, cy: 32, r: 31, pathLength: 1 }));
    mark.appendChild(svgEl('use', { href: '#ad-mark' }));
    return el('div.bk-loading', { role: 'status', 'aria-live': 'polite' }, el('span.ld-mark', { 'aria-hidden': 'true' }, ring, el('span.ld-lap'), mark), el('span.ld-text', text));
  }

  // A figure that changes (the booking's running total) turns like a watch's date wheel: only the characters that
  // differ move, one step, the right-most first and the others 30ms after each other, a lower figure the other way, a
  // new character fading in where the figure grows. It never passes through a value in between. A reader hears the
  // figure once, at once (the hidden copy); the turning copy is hidden from readers and is plain text again after.
  function rollFigure(text, prev, up) {
    const shown = el('span.roll', { 'aria-hidden': 'true' });
    const out = el('span.fig', el('span.sr-only', text), shown);
    if (reduce || prev == null || prev === text) { shown.textContent = text; return out; }
    // the sign ahead of the figures ($) keeps its place: the figures after it are lined up from the right
    const lead = (/^\D*/.exec(text) || [''])[0];
    const keep = String(prev).startsWith(lead) ? lead : '';
    const a = String(prev).slice(keep.length), b = String(text).slice(keep.length), cells = [];
    let k = 0;
    for (let i = 1; i <= b.length; i++) {
      const o = a[a.length - i], c = b[b.length - i];
      if (o === c) cells.unshift(document.createTextNode(c));
      else if (o != null && /\d/.test(o) && /\d/.test(c)) cells.unshift(el('span.rd', { style: { '--k': k++ } }, el('span.rd-o', o), el('span.rd-n', c)));
      else cells.unshift(el('span.rd-f', c));   // a new place fades in at once, so the figure never shows a gap for long
    }
    shown.classList.add(up ? 'up' : 'down');
    append(shown, [keep, cells]);
    setTimeout(() => { shown.classList.remove('up', 'down'); shown.textContent = text; }, 360 + k * 30 + 80);
    return out;
  }

  // Where a finger (or the pointer) landed on a control that answers from that point: a chosen day's or time's gold
  // pours out from it (--px, --py, and --cr, its reach to the farthest corner), a chip's or a field's rim draws round
  // from it (--a, its angle from the centre, clockwise from the top). A key press (a click with no detail) starts them
  // from the centre and the top. html.kbd while the keyboard moves the focus (Tab): only then is a field ringed.
  const TOUCHED = '.choice-item, .cal-day, .fld-box';
  document.addEventListener('pointerdown', (e) => {
    document.documentElement.classList.remove('kbd');
    const t = e.target.closest && e.target.closest(TOUCHED);
    if (!t) return;
    const r = t.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, s = t.style;
    s.setProperty('--px', (x / r.width * 100).toFixed(1) + '%');
    s.setProperty('--py', (y / r.height * 100).toFixed(1) + '%');
    s.setProperty('--cr', Math.ceil(Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y)) + 1) + 'px');
    s.setProperty('--a', Math.round(Math.atan2(x - r.width / 2, r.height / 2 - y) * 180 / Math.PI) + 'deg');
  }, { passive: true, capture: true });
  document.addEventListener('click', (e) => {
    const t = !e.detail && e.target.closest && e.target.closest(TOUCHED);
    if (t) ['--px', '--py', '--cr', '--a'].forEach((p) => t.style.removeProperty(p));
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') document.documentElement.classList.add('kbd'); }, true);
  // The required star is drawn; the reader hears "required" (and the input carries aria-required).
  const star = () => [el('i', { 'aria-hidden': 'true' }, ' *'), el('span.sr-only', ' required')];

  // A labeled text field. opts: { id, label, type, value, placeholder, hint, required, optional, inputmode, autocomplete, maxlength, multiline, rows, trailing, oninput, onblur, onkeydown }
  function field(opts) {
    const input = el(opts.multiline ? 'textarea' : 'input', {
      id: opts.id, name: opts.id, class: 'fld-input', type: opts.multiline ? null : (opts.type || 'text'),
      value: opts.multiline ? null : (opts.value || ''), placeholder: opts.placeholder || ' ', inputMode: opts.inputmode,
      autocomplete: opts.autocomplete, maxLength: opts.maxlength, rows: opts.rows, step: opts.step, 'aria-describedby': opts.id + '-msg',
      required: !!opts.required, 'aria-required': opts.required ? 'true' : null,
      oninput: opts.oninput, onblur: opts.onblur, onkeydown: opts.onkeydown,
    });
    if (opts.multiline && opts.value) input.value = opts.value;
    const wrap = el('div.fld', { dataset: { field: opts.id } },
      el('label.fld-label', { for: opts.id }, opts.label, opts.required ? star() : (opts.optional ? el('small', ' optional') : null)),
      el('div.fld-box', { class: opts.multiline ? 'multi' : null }, input, opts.trailing || null),
      el('p.fld-msg', { id: opts.id + '-msg', role: 'status', dataset: { hint: opts.hint || '' } }, opts.hint || ''));
    wrap.input = input;
    return wrap;
  }

  // Where a field's message lives: inside its wrapper or, moved out to span a row (the ZIP), anywhere in root by its id.
  const msgOf = (root, w, hint) => w.querySelector('.fld-msg, .choice-msg') || root.querySelector('#' + CSS.escape(hint) + '-msg');

  // Shows an error (text or nodes) under the field named by `hint`, marks the input, and brings it into view
  // with focus unless opts.quiet (the rest of a list of problems). A wrapper taller than the screen (the
  // conditions on a phone) would centre on nothing, so the message itself is brought in instead.
  // Returns false when the text could not be shown (no such field, or no message line in it), so the caller
  // falls back to a toast and the text is never lost.
  function showError(root, hint, text, opts) {
    const w = root.querySelector('[data-field="' + hint + '"]');
    if (!w) return false;
    w.classList.add('has-error');
    const msg = msgOf(root, w, hint);
    if (msg) { msg.classList.add('has-error'); msg.replaceChildren(); append(msg, [text]); }
    w.querySelectorAll('.fld-input').forEach((i) => i.setAttribute('aria-invalid', 'true'));
    if (!msg) return false;
    if (opts && opts.quiet) return true;
    const tall = w.getBoundingClientRect().height > window.innerHeight;
    (tall && msg ? msg : w).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: tall ? 'nearest' : 'center' });
    const focusable = w.querySelector('input, textarea, button:not(:disabled), select');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    return true;
  }
  function clearError(root, hint) {
    const w = root.querySelector('[data-field="' + hint + '"]');
    if (!w) return;
    w.classList.remove('has-error');
    const msg = msgOf(root, w, hint);
    if (msg) { msg.classList.remove('has-error'); msg.textContent = msg.dataset.hint || ''; }
    w.querySelectorAll('.fld-input[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    // the list of several problems drops this one, and goes once it would name fewer than two
    root.querySelectorAll('.bk-errors [data-hint="' + hint + '"]').forEach((b) => b.closest('li').remove());
    root.querySelectorAll('.bk-errors').forEach((s) => { if (s.querySelectorAll('li').length < 2) s.remove(); });
  }

  // A class for one run of an animation: dropped when it ends (on the element, or on the pseudo-element named),
  // or after ms if it never ran (reduced motion, or no keyframes), so a rebuild never replays it.
  function flash(node, cls, ms, pseudo) {
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    const off = () => { node.classList.remove(cls); node.removeEventListener('animationend', onEnd); };
    function onEnd(e) { if (e.target === node && (e.pseudoElement || '') === (pseudo || '')) off(); }
    node.addEventListener('animationend', onEnd);
    setTimeout(off, ms || 1200);
  }

  // Roving tabindex for a radio-like row: one stop in the Tab order (the chosen item, else the first), and the
  // arrow keys move along the row and choose. Returns the function that re-marks the stop after a change.
  function roving(list, itemSel) {
    const items = () => Array.from(list.querySelectorAll(itemSel)).filter((b) => !b.disabled);
    const mark = () => {
      const all = items();
      const cur = all.find((b) => b.getAttribute('aria-checked') === 'true') || all.find((b) => b.classList.contains('on')) || all[0];
      all.forEach((b) => { b.tabIndex = b === cur ? 0 : -1; });
    };
    const KEYS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 0, End: 0 };
    list.addEventListener('keydown', (e) => {
      if (!(e.key in KEYS)) return;
      const all = items(), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + KEYS[e.key] + all.length) % all.length;
      all[j].focus(); all[j].click();
    });
    mark();
    return mark;
  }

  // Choice cards, tiles (compact cards in a grid) or chips. opts: { id, label, hint, required, disabled, items: [{code, label, sub, price, priceText, note, icon, disabled, exclusive, featured, cls}], value: [] or string, multi, onchange, size: 'tile' | 'chip' }
  // opts.disabled greys the whole list out and takes it out of reach (no tap, no Tab stop): every item is disabled, the
  // group says so to a screen reader, and the hint (why) describes it. The vehicle Type while "Not sure?" is ticked.
  function choices(opts) {
    const multi = !!opts.multi, off = !!opts.disabled;
    const selected = new Set(multi ? (opts.value || []) : (opts.value ? [opts.value] : []));
    const list = el('div.choice-list', {
      role: multi ? 'group' : 'radiogroup', 'aria-labelledby': opts.id + '-label', 'aria-disabled': off ? 'true' : null,
      'aria-describedby': off && opts.hint ? opts.id + '-msg' : null, class: opts.size === 'chip' ? 'chips' : opts.size === 'tile' ? 'tiles' : 'cards',
    });
    const wrap = el('div.choice', { class: off ? 'off' : null, dataset: { field: opts.id } },
      opts.label ? el('p.choice-label', { id: opts.id + '-label' }, opts.label, opts.required ? star() : null) : null,
      list,
      el('p.choice-msg', { id: off && opts.hint ? opts.id + '-msg' : null, role: 'status', dataset: { hint: opts.hint || '' } }, opts.hint || ''));
    let mark = null;
    function paint() {
      list.querySelectorAll('.choice-item').forEach((b) => {
        const on = selected.has(b.dataset.code);
        b.classList.toggle('on', on);
        b.setAttribute(multi ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
      });
      if (mark) mark();
    }
    opts.items.forEach((it) => {
      const btn = el('button.choice-item', {
        type: 'button', dataset: { code: it.code }, role: multi ? null : 'radio', disabled: off || !!it.disabled,
        class: (off || it.disabled ? 'disabled' : '') + (it.featured ? ' featured' : '') + (it.cls ? ' ' + it.cls : ''),
        onclick: () => {
          if (multi) {
            if (selected.has(it.code)) selected.delete(it.code);
            else {
              // "None"-style items can't be combined with others
              if (it.exclusive) selected.clear();
              else opts.items.filter((x) => x.exclusive).forEach((x) => selected.delete(x.code));
              selected.add(it.code);
            }
          } else { selected.clear(); selected.add(it.code); }
          paint();
          if (selected.has(it.code)) flash(btn, 'just', 600);   // its rim draws round once, from the touch, on the item just chosen
          wrap.classList.remove('has-error');
          const msg = wrap.querySelector('.choice-msg'); if (msg) { msg.classList.remove('has-error'); msg.textContent = msg.dataset.hint || ''; }
          // and the list of several problems drops it, as for a typed field (display only)
          if (opts.id) clearError(wrap.closest('.view') || document, opts.id);
          opts.onchange && opts.onchange(multi ? Array.from(selected) : it.code, it);
        },
      },
        it.icon ? el('span.choice-icon', { innerHTML: it.icon, 'aria-hidden': 'true' }) : null,
        el('span.choice-main', el('span.choice-name', it.label), it.sub ? el('span.choice-sub', it.sub) : null),
        it.price != null || it.priceText ? el('span.choice-price.tnum', { class: it.priceText && it.priceText.length > 10 ? 'long' : null }, it.priceText || money(it.price)) : null,
        el('span.choice-check', { 'aria-hidden': 'true' }, '✓ Selected'));
      list.appendChild(btn);
    });
    if (!multi) mark = roving(list, '.choice-item');
    paint();
    wrap.getValue = () => (multi ? Array.from(selected) : (Array.from(selected)[0] || null));
    wrap.setValue = (v) => { selected.clear(); (multi ? v || [] : (v ? [v] : [])).forEach((x) => selected.add(x)); paint(); };
    return wrap;
  }

  // The price breakdown shared by the booking (a quote), the summary, the account and the appointments (a
  // booking row): the lines, bundle savings, an extra the owner added, and the total or the "we confirm" note with its
  // reason. opts.withTime adds the length and the payment line; opts.mark(code) puts a service's mark before its name
  // (the booking's build sheet and receipt). opts.otherCondition (the caller knows the booking's conditions; a quote
  // doesn't say) marks a booking with the "Other" condition: the lines stay, the total row says we confirm the price,
  // and a note gives the menu price so far (doc 46). opts.offerMissed: a request that was quoted "if this is your first
  // visit" and that the database saved at the regular price (the saved request decides); opts.missedCodes: the
  // services that deal was for (kept with the receipt), so the note sits under them.
  // The First Timer Deals (Migration 012): the lines that carry a regular price (regular_cents) are the deal. One line
  // reads "Basic Wash, First Timer Deal"; two read as one row, "First Timer Deal: Basic Wash + Interior Clean", with
  // their two prices added up (so the column still adds up to the total). Under it, the regular price: on a quote
  // "After your first visit ..." (what it costs next time); on a saved booking (opts.saved, or any booking row) "Regular
  // price when booked", since the menu may have changed since (an older booking kept $50). Never a "was" price.
  const longDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const PENDING_WORDS = {
    size_price: 'Vans, unusual vehicles and “Not sure” are priced by us before the appointment.',
    xl: 'XL vehicles are priced by us before the appointment.',
    vehicle_price: 'WetGloss on this vehicle type is priced by us before the appointment.',
    stains: 'Stains are priced by us before the appointment.',
  };
  // a service line with no menu price (a van, other or "Not sure" since Migration 011): the owner's amount prices it
  const heldLine = (q) => (q.lines || []).some((l) => !l.included && l.price_cents == null && !/^cond_/.test(l.code || ''));
  const DEAL_FINE = 'First visit only: one per phone number and one per address.';
  function priceLines(q, opts) {
    opts = opts || {};
    const lines = q.lines || [];
    const saved = opts.saved != null ? !!opts.saved : (q.ref != null || q.first_visit_offer !== undefined);
    const deal = lines.filter((l) => l.regular_cents != null && !l.included);
    const fv = q.first_visit || null;
    const rows = [];
    let dealRow = null;
    lines.forEach((l) => {
      if (deal.length > 1 && deal.includes(l)) {
        if (dealRow) { rows.push(null); return; }   // (the deal's second line is in the first one's row; one mark, the first's: the gutter holds one)
        const sum = deal.reduce((t, x) => t + (x.price_cents || 0), 0);
        dealRow = el('div.pr-line.offer.deal',
          el('span', opts.mark ? opts.mark(deal[0].code) : null, 'First Timer Deal: ', deal.map((x) => x.name).join(' + ')),
          el('span.tnum', money(sum)));
        rows.push(dealRow);
        return;
      }
      const offer = deal.includes(l);
      const row = el('div.pr-line', { class: (l.included ? 'inc' : '') + (offer ? ' offer' : '') },
        el('span', opts.mark && !l.included ? opts.mark(l.code) : null, l.name, offer ? ', First Timer Deal' : null, l.included ? el('small', ' · Included') : null),
        el('span.tnum', l.included ? '$0' : l.price_cents == null ? 'Confirmed by us' : money(l.price_cents)));
      if (offer) dealRow = row;
      rows.push(row);
    });
    const out = el('div.pr', rows.filter(Boolean));
    const after = (i, node) => { const r = i >= 0 ? rows[i] : null; if (r) r.after(node); else out.appendChild(node); };
    // the bundle line already carries the bundle price, so the saving is said once, as a note with no amount in
    // the price column (shown as a minus line, the column would add up to less than the total). The note sits
    // straight under the bundle's own line, so it never reads as part of the line above it.
    if (q.bundle_savings_cents) {
      const at = lines.findIndex((l) => l.kind === 'bundle' && !l.included);
      after(at, el('p.pr-note', 'Saves ' + money(q.bundle_savings_cents) + ' against booking its services apart' + (q.mobile_cents ? ', before the mobile charge.' : '.')));
    }
    if (dealRow) {
      const regular = deal.length === 1
        ? (saved ? 'Regular price when booked: ' + money(deal[0].regular_cents) + '.' : 'After your first visit, the ' + deal[0].name + ' is ' + money(deal[0].regular_cents) + '.')
        : (saved ? 'Regular prices when booked: ' : 'After your first visit: ') + deal.map((x) => x.name + ' ' + money(x.regular_cents)).join(' + ') + '.';
      const notes = [el('p.pr-note.gold-note', regular)];
      if (!saved && fv && fv.status === 'if_first_visit') notes.push(el('p.pr-note', DEAL_FINE + ' We check when you send.' + (fv.ends_on ? ' Offer ends ' + longDay(fv.ends_on) + '.' : '')));
      notes.reverse().forEach((n) => dealRow.after(n));
    }
    // quoted "if first visit", saved at the regular price (or a signed-in customer with history): said under the
    // deal's services (the quote's codes, or the ones kept with the receipt; failing both, the first Basic Wash or
    // Interior Clean line)
    const missed = !!opts.offerMissed || !!(fv && fv.status === 'not_eligible');
    if (missed && !deal.length) {
      const codes = (fv && fv.codes) || opts.missedCodes || null;
      let at = -1;
      lines.forEach((l, i) => { if (!l.included && (codes ? codes.includes(l.code) : at < 0 && (l.code === 'basic_wash' || l.code === 'interior_clean'))) at = i; });
      if (at >= 0) after(at, el('p.pr-note', 'First Timer Deals are for a first visit only (one per phone number and one per address), so this request is at the regular price.'));
    }
    // no mobile fee since Migration 011: the line shows only on an older booking that had one
    if (q.location_type === 'mobile' && q.mobile_cents) out.appendChild(el('div.pr-line', el('span', 'Mobile service'), el('span.tnum', money(q.mobile_cents))));
    const why = Array.isArray(q.pending_reasons) ? q.pending_reasons : [];
    // the owner's amount on a booking whose vehicle had no menu price is that vehicle's price (S5), not an extra
    if (q.extra_cost_cents) out.appendChild(el('div.pr-line', el('span', (why.includes('size_price') || heldLine(q) ? 'Price for this vehicle' : 'Extra') + (q.extra_cost_note ? ' · ' + q.extra_cost_note : '')), el('span.tnum', money(q.extra_cost_cents))));
    const pending = q.total_cents == null;
    const other = !!opts.otherCondition;
    out.appendChild(el('div.pr-total', el('span', pending || other ? 'Price' : 'Total'), el('span.tnum', pending || other ? 'We confirm the price before your appointment' : money(q.total_cents))));
    if (pending && why.length) out.appendChild(el('p.bk-muted', why.map((c) => PENDING_WORDS[c]).filter(Boolean)[0] || 'We confirm the price before the appointment.'));
    if (other) out.appendChild(el('p.bk-muted', otherConditionNote(q.total_cents)));
    if (opts.withTime) out.appendChild(el('p.bk-muted', 'About ' + minutesText(q.duration_min) + '. Payment in person after your detail.'));
    return out;
  }

  // The "Other" condition's note, with the menu price so far when there is one (none while a held vehicle price, or XL,
  // holds the price too).
  const otherConditionNote = (cents) => (cents != null ? 'Menu price so far: ' + money(cents) + '. ' : '') + 'You chose “Other” for the inside, so we confirm the final price before your appointment.';

  // Which days a job of this many minutes fits on, from the hours (business_settings: first_start_min, last_start_min,
  // slot_step_min, latest_end_min and the weekly closures, Migration 003), as open_starts tests a start: on the grid,
  // finished by the latest end, clear of the day's closed hours. null when it fits every day; otherwise the words, such
  // as "Weekends only" or "Mon–Thu, Sat–Sun" (an empty calendar then has its reason before the customer meets it).
  // { none: true } words when no day is long enough: the phone books it. Only the week's shape: the calendar decides.
  const DAY3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  function dayFit(st, minutes) {
    if (!st || !minutes) return null;
    const fits = [];
    for (let wd = 1; wd <= 7; wd++) {
      const shut = (st.weekly_closures || []).filter((w) => w.weekday === wd);
      let ok = false;
      for (let m = st.first_start_min; m <= st.last_start_min && !ok; m += st.slot_step_min) {
        if (m + minutes > st.latest_end_min) break;
        if (!shut.some((w) => m < w.end_min && m + minutes > w.start_min)) ok = true;
      }
      if (ok) fits.push(wd);
    }
    if (fits.length === 7) return null;
    if (!fits.length) return { none: true, text: 'Too long for one day online' };
    if (fits.length === 2 && fits[0] === 6 && fits[1] === 7) return { text: 'Weekends only' };
    const runs = [];
    fits.forEach((d) => { const r = runs[runs.length - 1]; if (r && r[1] === d - 1) r[1] = d; else runs.push([d, d]); });
    return { text: 'Fits ' + runs.map(([a, b]) => DAY3[a - 1] + (b > a ? '–' + DAY3[b - 1] : '')).join(', ') };
  }

  // The First Timer Deals (Migration 012, from get_first_visit_offer): each deal's route token (#book-dealout opens
  // the booking with its services chosen), and the deals for one size as the pages list them:
  // { code, name, token, exterior, interior, codes, what, price, regular } (what: its services' names; nameOf(code)
  // gives a service's name). A deal with no price for that size (the database left it out) is not listed.
  const DEAL_TOKENS = { outside: 'dealout', inside: 'dealin', both: 'dealboth' };
  const dealToken = (code) => DEAL_TOKENS[code] || 'deal' + code;
  const dealOfToken = (o, tok) => ((o && o.deals) || []).find((d) => dealToken(d.code) === tok) || null;
  function dealLines(o, size, nameOf) {
    if (!o || !o.active) return [];
    return (o.deals || []).map((d) => {
      const p = d.prices && d.prices[size];
      if (!p) return null;
      const codes = [d.exterior, d.interior].filter(Boolean);
      return { code: d.code, name: d.name, token: dealToken(d.code), exterior: d.exterior || null, interior: d.interior || null, codes,
        what: codes.map((c) => (nameOf && nameOf(c)) || c).join(' + '), price: p.first_visit_cents, regular: p.regular_cents, lines: p.lines || {} };
    }).filter(Boolean);
  }
  // The deals' small print (the owner's words, Nov 17-18): "First visit only: one per phone number and one per address.
  // Outside: cars with normal road dirt. After your first visit: Basic Wash $59.99, Interior Clean $75 (car). Offer
  // ends February 17, 2027." The regular prices are for one size (size, named by label; the car by default).
  // ("Cars with normal road dirt." is the approved Nov 17 small print of the Basic Wash price: kept on the Outside deal,
  // which is that Basic Wash; whether it also applies to Inside and Outside + inside is asked in doc 54.)
  // (noRegular: the small print without the regular prices, for a page that gives them elsewhere: the FAQ)
  function dealsFine(o, size, label, nameOf, noRegular) {
    if (!o || !o.active) return '';
    size = size || 'car';
    const regular = {};
    (o.deals || []).forEach((d) => { const p = d.prices && d.prices[size]; if (p && p.lines) Object.keys(p.lines).forEach((c) => { if (!(c in regular)) regular[c] = p.lines[c].regular_cents; }); });
    const names = Object.keys(regular).map((c) => ((nameOf && nameOf(c)) || NAMES[c] || c) + ' ' + money(regular[c]));
    const outside = (o.deals || []).find((d) => d.code === 'outside');
    return DEAL_FINE + (outside ? ' ' + outside.name + ': cars with normal road dirt.' : '') +
      (names.length && !noRegular ? ' After your first visit: ' + names.join(', ') + (label === null ? '' : ' (' + String(label || 'car').toLowerCase() + ')') + '.' : '') +
      (o.ends_on ? ' Offer ends ' + longDay(o.ends_on) + '.' : '');
  }
  // (a service's name when the caller has no menu at hand: the two the deals are made of)
  const NAMES = { basic_wash: 'Basic Wash', interior_clean: 'Interior Clean' };

  // A small inline button inside a field box (Send code, Confirm, Change).
  const miniBtn = (label, onclick, attrs) => el('button.mini-btn', Object.assign({ type: 'button', onclick }, attrs || {}), label);

  // Toast for short confirmations; a longer line stays a little longer.
  let toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) { toastEl = el('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('on'), text.length > 40 ? 3200 : 2600);
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // A booking reference grouped for reading aloud (AD- then fours); the grouping is only visual
  const refGroups = (ref) => {
    const r = String(ref || ''), cut = r.indexOf('-') + 1, fours = r.slice(cut).match(/.{1,4}/g) || [''];
    return [r.slice(0, cut) + fours[0]].concat(fours.slice(1)).filter(Boolean);
  };
  // The reference, copied exactly as the database wrote it (the clipboard, or a selected copy where it is blocked)
  async function copyRef(ref) {
    let ok = false;
    try { await navigator.clipboard.writeText(ref); ok = true; } catch (e) {
      try {
        const t = el('textarea', { value: ref, readOnly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
        document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove();
      } catch (e2) { ok = false; }
    }
    toast(ok ? 'Reference copied' : 'Copying is blocked here. Your reference is ' + ref);
  }

  // The page held still under the menu or the lightbox (overflow: hidden on <body>, which the browser passes on to the
  // page's own scrolling; on <html> it would make the body a scroll box of its own, so the wash's pinned stage and the
  // sticky bars would let go and leave a black page behind the menu's glass). On a computer with a classic
  // scroll bar its width is given back as padding, and the fixed top bar keeps its right edge, so neither the page nor
  // the bar moves sideways as the scroll bar goes and comes back. Overlay scroll bars (phones) measure 0: no change.
  // w: the scroll bar's width, when the caller has read it already (the menu reads before it writes anything, so
  // holding the page never lays it out)
  function holdPage(on, w) {
    const r = document.documentElement, b = document.body, bar = document.getElementById('topbar');
    if (on) {
      const sb = w == null ? window.innerWidth - r.clientWidth : w;
      b.style.overflow = 'hidden';
      if (sb > 0) { r.style.paddingRight = sb + 'px'; if (bar) bar.style.right = sb + 'px'; }
    } else {
      b.style.overflow = ''; r.style.paddingRight = '';
      if (bar) bar.style.right = '';
    }
  }

  // A one-time moment's first paint and its clock (About's pen, content.js; the Reviews raking light, reviews.js).
  // warmed: resolves once three frames in a row have come on time (under 34ms) after the moment's layers were first
  // painted, faintly (or after ms at most), so the browser's first drawing of them, the programs it compiles for the
  // GPU, lands before the moment's clock starts and not on its first line.
  function warmed(ms) {
    return new Promise((res) => {
      const t0 = performance.now();
      let last = -1, ok = 0;
      const f = (t) => {
        if (last >= 0) ok = t - last < 34 ? ok + 1 : 0;
        last = t;
        if (ok >= 3 || performance.now() - t0 >= ms) res(); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
  }
  // steady: from then on a late frame (over 50ms: a stall) never jumps the moment ahead. Its runs (o.anims(), CSS
  // animations and transitions) are put back to one frame past where the last frame had them, up to o.cap ms in all,
  // and the moment goes on from there; o.held(ms) hears of each hold (to keep the light's turn as long). o.tick(t)
  // runs each frame with the moment's own time (from its first frame, less what was held back); false stops it.
  function steady(o) {
    let last = -1, t0 = 0, held = 0;
    const at = new Map();
    const f = (t) => {
      if (last < 0) t0 = t;
      let list = [];
      try { list = o.anims() || []; } catch (e) { list = []; }
      const late = t - last;
      if (last >= 0 && late > 50 && late < 1000 && held < o.cap) {
        const back = Math.min(late - 17, o.cap - held);
        held += back;
        list.forEach((a) => {
          const was = at.get(a), now = a.currentTime;
          if (was != null && now != null) a.currentTime = Math.min(now, Math.max(was + 17, now - back));   // (never behind the last frame)
        });
        if (o.held) o.held(back);
      }
      list.forEach((a) => at.set(a, a.currentTime));
      last = t;
      if (o.tick(t - t0 - held) !== false) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    return { held: () => held };
  }

  // The strip at the top of the staff and account pages: "Preview" with example data, and "Test project" when the
  // page talks to the test database (every address but the public ones, config.js), so practice requests and
  // logins there are never taken for real ones. Nothing on the live project's public addresses.
  const modeBanner = (previewText, isLive) => !isLive ? el('div.bk-preview', el('b', 'Preview'), ' — ' + previewText)
    : (window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.project === 'test' ? el('div.bk-preview', el('b', 'Test project'), ' — practice data on the test database, not real bookings.') : null);

  window.AlchemistUI = { el, append, svgEl, tick, rollFigure, money, minutesText, clock, longDate, shortDate, phonePretty, tel, telMark, lightMark, outage, loading, star, field, choices, roving, flash, priceLines, heldLine, dayFit, dealsFine, dealLines, dealToken, dealOfToken, otherConditionNote, miniBtn, showError, clearError, toast, debounce, refGroups, copyRef, holdPage, warmed, steady, modeBanner };
})();
