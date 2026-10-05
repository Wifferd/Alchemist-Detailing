/* Alchemist Detailing — small shared UI pieces for the app screens: element
   building, fields, choice cards and chips, money and time formatting, and the
   one place that shows a database error next to its field. */
(function () {
  'use strict';

  // el('div.card#id', { attrs }, ...children)
  function el(spec, attrs, ...children) {
    if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    const node = document.createElement(m[1] || 'div');
    (m[2] || '').match(/[.#][\w-]+/g)?.forEach((t) => (t[0] === '.' ? node.classList.add(t.slice(1)) : (node.id = t.slice(1))));
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
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
  const phonePretty = (raw) => {
    const d = String(raw || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : raw;
  };

  // A labeled text field. opts: { id, label, type, value, placeholder, hint, required, inputmode, autocomplete, maxlength, oninput, onblur }
  function field(opts) {
    const input = el(opts.multiline ? 'textarea' : 'input', {
      id: opts.id, name: opts.id, class: 'fld-input', type: opts.multiline ? null : (opts.type || 'text'),
      value: opts.multiline ? null : (opts.value || ''), placeholder: opts.placeholder || ' ', inputMode: opts.inputmode,
      autocomplete: opts.autocomplete, maxLength: opts.maxlength, rows: opts.rows, 'aria-describedby': opts.id + '-msg',
      oninput: opts.oninput, onblur: opts.onblur, onkeydown: opts.onkeydown,
    });
    if (opts.multiline && opts.value) input.value = opts.value;
    const wrap = el('div.fld', { dataset: { field: opts.id } },
      el('label.fld-label', { for: opts.id }, opts.label, opts.required ? el('i', ' *') : (opts.optional ? el('small', ' optional') : null)),
      el('div.fld-box', input, opts.trailing || null),
      el('p.fld-msg', { id: opts.id + '-msg', role: 'status' }, opts.hint || ''));
    wrap.input = input;
    return wrap;
  }

  // Shows an error (or clears it) under the field named by `hint`; scrolls it into view.
  function showError(root, hint, text) {
    const w = root.querySelector('[data-field="' + hint + '"]');
    if (!w) return false;
    w.classList.add('has-error');
    const msg = w.querySelector('.fld-msg, .choice-msg');
    if (msg) { msg.textContent = text; msg.dataset.wasHint = msg.dataset.wasHint || ''; }
    w.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    const focusable = w.querySelector('input, textarea, button, select');
    if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    return true;
  }
  function clearError(root, hint) {
    const w = root.querySelector('[data-field="' + hint + '"]');
    if (!w) return;
    w.classList.remove('has-error');
    const msg = w.querySelector('.fld-msg, .choice-msg');
    if (msg) msg.textContent = msg.dataset.hint || '';
  }

  // Choice cards or chips. opts: { id, label, items: [{code, label, sub, price, note, disabled}], value: [] or string, multi, exclusiveCodes, onchange, size }
  function choices(opts) {
    const multi = !!opts.multi;
    const selected = new Set(multi ? (opts.value || []) : (opts.value ? [opts.value] : []));
    const list = el('div.choice-list', { role: multi ? 'group' : 'radiogroup', 'aria-labelledby': opts.id + '-label', class: opts.size === 'chip' ? 'chips' : 'cards' });
    const wrap = el('div.choice', { dataset: { field: opts.id } },
      opts.label ? el('p.choice-label', { id: opts.id + '-label' }, opts.label, opts.required ? el('i', ' *') : null) : null,
      list,
      el('p.choice-msg', { role: 'status', dataset: { hint: opts.hint || '' } }, opts.hint || ''));
    function paint() {
      list.querySelectorAll('.choice-item').forEach((b) => {
        const on = selected.has(b.dataset.code);
        b.classList.toggle('on', on);
        b.setAttribute(multi ? 'aria-pressed' : 'aria-checked', on ? 'true' : 'false');
      });
    }
    opts.items.forEach((it) => {
      const btn = el('button.choice-item', {
        type: 'button', dataset: { code: it.code }, role: multi ? null : 'radio', disabled: !!it.disabled,
        class: (it.disabled ? 'disabled' : '') + (it.featured ? ' featured' : ''),
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
          wrap.classList.remove('has-error');
          const msg = wrap.querySelector('.choice-msg'); if (msg) msg.textContent = msg.dataset.hint || '';
          opts.onchange && opts.onchange(multi ? Array.from(selected) : it.code, it);
        },
      },
        it.icon ? el('span.choice-icon', { innerHTML: it.icon }) : null,
        el('span.choice-main', el('span.choice-name', it.label), it.sub ? el('span.choice-sub', it.sub) : null),
        it.price != null || it.priceText ? el('span.choice-price.tnum', it.priceText || money(it.price)) : null,
        el('span.choice-check', { 'aria-hidden': 'true' }, '✓ Selected'));
      list.appendChild(btn);
    });
    paint();
    wrap.getValue = () => (multi ? Array.from(selected) : (Array.from(selected)[0] || null));
    wrap.setValue = (v) => { selected.clear(); (multi ? v || [] : (v ? [v] : [])).forEach((x) => selected.add(x)); paint(); };
    return wrap;
  }

  // A small inline button inside a field box (Send code, Confirm, Change).
  const miniBtn = (label, onclick, attrs) => el('button.mini-btn', Object.assign({ type: 'button', onclick }, attrs || {}), label);

  // Toast for short confirmations.
  let toastEl = null, toastT = 0;
  function toast(text) {
    if (!toastEl) { toastEl = el('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('on'), 2600);
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  window.AlchemistUI = { el, append, money, minutesText, clock, longDate, shortDate, phonePretty, field, choices, miniBtn, showError, clearError, toast, debounce };
})();
