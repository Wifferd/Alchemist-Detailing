/* Alchemist Detailing — small shared UI pieces for the app screens: element
   building, fields, choice cards and chips, money and time formatting, the
   price breakdown, and the one place that shows a database error next to its
   field. */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // el('div.card#id', { attrs }, ...children)
  function el(spec, attrs, ...children) {
    if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    const node = document.createElement(m[1] || 'div');
    (m[2] || '').match(/[.#][\w-]+/g)?.forEach((t) => (t[0] === '.' ? node.classList.add(t.slice(1)) : (node.id = t.slice(1))));
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
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

  const money = (cents) => cents == null ? '—' : '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // The loading line: a reader hears it, and hears the screen arrive in its place.
  const loading = (text) => el('div.bk-loading', { role: 'status', 'aria-live': 'polite' }, el('span.bk-spin', { 'aria-hidden': 'true' }), text);
  // The required star is drawn; the reader hears "required" (and the input carries aria-required).
  const star = () => [el('i', { 'aria-hidden': 'true' }, ' *'), el('span.sr-only', ' required')];

  // A labeled text field. opts: { id, label, type, value, placeholder, hint, required, optional, inputmode, autocomplete, maxlength, multiline, rows, trailing, oninput, onblur, onkeydown }
  function field(opts) {
    const input = el(opts.multiline ? 'textarea' : 'input', {
      id: opts.id, name: opts.id, class: 'fld-input', type: opts.multiline ? null : (opts.type || 'text'),
      value: opts.multiline ? null : (opts.value || ''), placeholder: opts.placeholder || ' ', inputMode: opts.inputmode,
      autocomplete: opts.autocomplete, maxLength: opts.maxlength, rows: opts.rows, 'aria-describedby': opts.id + '-msg',
      required: !!opts.required, 'aria-required': opts.required ? 'true' : null,
      oninput: opts.oninput, onblur: opts.onblur, onkeydown: opts.onkeydown,
    });
    if (opts.multiline && opts.value) input.value = opts.value;
    const wrap = el('div.fld', { dataset: { field: opts.id } },
      el('label.fld-label', { for: opts.id }, opts.label, opts.required ? star() : (opts.optional ? el('small', ' optional') : null)),
      el('div.fld-box', input, opts.trailing || null),
      el('p.fld-msg', { id: opts.id + '-msg', role: 'status', dataset: { hint: opts.hint || '' } }, opts.hint || ''));
    wrap.input = input;
    return wrap;
  }

  // Where a field's message lives: inside its wrapper or, moved out to span a row (the ZIP), anywhere in root by its id.
  const msgOf = (root, w, hint) => w.querySelector('.fld-msg, .choice-msg') || root.querySelector('#' + CSS.escape(hint) + '-msg');

  // Shows an error (text or nodes) under the field named by `hint`, marks the input, and brings it into view
  // with focus unless opts.quiet (the rest of a list of problems). A wrapper taller than the screen (the
  // conditions on a phone) would centre on nothing, so the message itself is brought in instead.
  function showError(root, hint, text, opts) {
    const w = root.querySelector('[data-field="' + hint + '"]');
    if (!w) return false;
    w.classList.add('has-error');
    const msg = msgOf(root, w, hint);
    if (msg) { msg.classList.add('has-error'); msg.replaceChildren(); append(msg, [text]); }
    w.querySelectorAll('.fld-input').forEach((i) => i.setAttribute('aria-invalid', 'true'));
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

  // Choice cards or chips. opts: { id, label, hint, required, items: [{code, label, sub, price, priceText, note, icon, disabled, exclusive, featured, cls}], value: [] or string, multi, onchange, size }
  function choices(opts) {
    const multi = !!opts.multi;
    const selected = new Set(multi ? (opts.value || []) : (opts.value ? [opts.value] : []));
    const list = el('div.choice-list', { role: multi ? 'group' : 'radiogroup', 'aria-labelledby': opts.id + '-label', class: opts.size === 'chip' ? 'chips' : 'cards' });
    const wrap = el('div.choice', { dataset: { field: opts.id } },
      opts.label ? el('p.choice-label', { id: opts.id + '-label' }, opts.label, opts.required ? star() : null) : null,
      list,
      el('p.choice-msg', { role: 'status', dataset: { hint: opts.hint || '' } }, opts.hint || ''));
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
        type: 'button', dataset: { code: it.code }, role: multi ? null : 'radio', disabled: !!it.disabled,
        class: (it.disabled ? 'disabled' : '') + (it.featured ? ' featured' : '') + (it.cls ? ' ' + it.cls : ''),
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
          if (selected.has(it.code)) flash(btn, 'just', 600);   // the pop plays once, on the item just chosen
          wrap.classList.remove('has-error');
          const msg = wrap.querySelector('.choice-msg'); if (msg) { msg.classList.remove('has-error'); msg.textContent = msg.dataset.hint || ''; }
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
  // booking row): the lines, bundle savings, the mobile fee, an extra the owner added, and the total or the
  // "we confirm" note with its reason. opts.withTime adds the length and the payment line.
  function priceLines(q, opts) {
    opts = opts || {};
    const rows = (q.lines || []).map((l) => el('div.pr-line', { class: l.included ? 'inc' : '' },
      el('span', l.name, l.included ? el('small', ' · Included') : null),
      el('span.tnum', l.included ? '$0.00' : l.price_cents == null ? 'Confirmed by us' : money(l.price_cents))));
    const out = el('div.pr', rows);
    // the bundle line already carries the bundle price, so the saving is said once, as a note with no amount in
    // the price column (shown as a minus line, the column would add up to less than the total)
    if (q.bundle_savings_cents) out.appendChild(el('p.pr-note', 'The bundle price saves you ' + money(q.bundle_savings_cents) + ' against booking its services separately.'));
    if (q.location_type === 'mobile') out.appendChild(el('div.pr-line', el('span', 'Mobile service'), el('span.tnum', money(q.mobile_cents))));
    if (q.extra_cost_cents) out.appendChild(el('div.pr-line', el('span', 'Extra' + (q.extra_cost_note ? ' · ' + q.extra_cost_note : '')), el('span.tnum', money(q.extra_cost_cents))));
    const pending = q.total_cents == null;
    out.appendChild(el('div.pr-total', el('span', pending ? 'Price' : 'Total'), el('span.tnum', pending ? 'We confirm the price before your appointment' : money(q.total_cents))));
    const why = Array.isArray(q.pending_reasons) ? q.pending_reasons : [];
    if (pending && why.length) out.appendChild(el('p.bk-muted', why.includes('xl') ? 'XL vehicles are priced by us before the appointment.' : 'WetGloss on this vehicle type is priced by us before the appointment.'));
    if (opts.withTime) out.appendChild(el('p.bk-muted', 'About ' + minutesText(q.duration_min) + '. Payment in person after your detail.'));
    return out;
  }

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

  window.AlchemistUI = { el, append, money, minutesText, clock, longDate, shortDate, phonePretty, tel, loading, star, field, choices, roving, flash, priceLines, miniBtn, showError, clearError, toast, debounce };
})();
