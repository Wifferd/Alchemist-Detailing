/* Alchemist Detailing — the booking app (doc 18): 01 Contact, 02 Vehicle,
   03 Location, 04 Service, 05 Date and time, 06 Summary, then Request sent.
   Everything the browser works out is shown only; the database re-checks it
   all when the request is sent. Data comes from AlchemistData (live or preview). */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, phonePretty, tel, loading, star, field, choices, flash, priceLines, miniBtn, showError, clearError, toast } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STEPS = [
    { n: '01', name: 'Contact', title: 'How do we reach you?' },
    { n: '02', name: 'Vehicle', title: 'Tell us about the car' },
    { n: '03', name: 'Location', title: 'Where should we detail it?' },
    { n: '04', name: 'Service', title: 'Choose your finish' },
    { n: '05', name: 'Date and time', title: 'When works for you?' },
    { n: '06', name: 'Summary', title: 'Check everything' },
  ];
  // Which step owns a database error, by its hint (doc 18).
  const HINT_STEP = {
    first_name: 1, last_name: 1, phone: 1, phone_code: 1, email: 1, email_code: 1,
    vehicle_id: 2, vehicle_make: 2, vehicle_model: 2, vehicle_year: 2, vehicle_color: 2, vehicle_type: 2, vehicle_size: 2, vehicle_description: 2,
    modifications: 2, conditions: 2, stains: 2, damage: 2, damage_note: 2, photos: 2,
    location_type: 3, address: 3, address_zip: 3,
    services: 4, bundle: 4, exterior: 4, interior: 4, addons: 4, special_request: 4,
    service_date: 5, start_min: 5,
  };
  const ICONS = {
    exterior: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3c3.2 3.6 5.4 6.6 5.4 9.6a5.4 5.4 0 1 1-10.8 0C6.6 9.6 8.8 6.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    interior: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M7 4h7l2 7H9z"/><path d="M5 11h12v4H7a2 2 0 0 1-2-2z"/><path d="M7 15v5M15 15v5"/></g></svg>',
    bundle: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 12l8 4.5 8-4.5"/><path d="M4 16.5L12 21l8-4.5"/></g></svg>',
    addon: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3.3l7 2.6v5.4c0 4.6-3 8.1-7 9.5-4-1.4-7-4.9-7-9.5V5.9z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  };

  // ---------------------------------------------------------------- state
  let root = null, settings = null, menu = null, session = null, phone = null;
  let step = 1, farthest = 1, renderedStep = 0, busy = false, mounted = false;
  const blank = {
    contact: () => ({ first: '', last: '', phone: '', email: '', phoneSent: false, phoneConfirmed: false, emailState: 'none' }),
    vehicle: (saved) => ({ vehicleId: null, addingNew: false, moreOpen: false, saved: saved || [], year: '', make: '', model: '', color: '', type: null, notSure: false, description: '', size: 'standard', modifications: [], conditions: [], damage: ['none'], damageNote: '', photos: [] }),
    location: () => ({ type: null, address: '', zip: '' }),
    service: () => ({ bundle: null, exterior: null, interior: null, addons: [], notes: '' }),
    when: () => ({ date: null, start: null, month: null, calendar: {}, times: [], loaded: null }),
  };
  const st = { contact: blank.contact(), vehicle: blank.vehicle(), location: blank.location(), service: blank.service(), when: blank.when(), quote: null, receipt: null, requestId: null, direction: 1, prices: {} };
  const quoteCache = new Map();

  // A fresh request: everything but who is booking (names, phone and email stay typed in; the phone is confirmed
  // again unless the session still holds it) and the saved vehicles.
  function reset(keepContact) {
    const c = st.contact;
    Object.assign(st, { vehicle: blank.vehicle(st.vehicle.saved), location: blank.location(), service: blank.service(), when: blank.when(), quote: null, receipt: null, requestId: D.helpers.uuid(), direction: 1, prices: {} });
    if (keepContact) {
      c.phoneSent = false; c.phoneConfirmed = !!(session && session.phoneConfirmed);
      if (c.emailState !== 'skipped' && !(session && session.email)) c.emailState = 'none';
    } else st.contact = blank.contact();
    quoteCache.clear();
    step = farthest = 1; renderedStep = 0; busy = false;
  }

  // ---------------------------------------------------------------- helpers
  const svc = (code) => menu.services.find((s) => s.code === code);
  const hasInterior = () => !!(st.service.bundle || st.service.interior);
  const hasExterior = () => !!(st.service.bundle || st.service.exterior);
  const mainsChosen = () => !!(st.service.bundle || st.service.exterior || st.service.interior);
  const condsForQuote = () => hasInterior() ? st.vehicle.conditions : [];
  const canHaveAddon = (code) => {
    const needs = menu.addonRules[code] || 'any_main';
    if (needs === 'exterior') return hasExterior();
    if (needs === 'interior') return hasInterior();
    return mainsChosen();
  };
  const includedCodes = () => {
    const set = new Set();
    [st.service.bundle, st.service.exterior, st.service.interior].filter(Boolean).forEach((c) => {
      (menu.includes[c] || []).forEach((i) => set.add(i));
      (menu.bundleParts[c] || []).forEach((p) => (menu.includes[p] || []).forEach((i) => set.add(i)));
    });
    return set;
  };
  const savedVehicle = () => (st.vehicle.vehicleId ? st.vehicle.saved.find((x) => x.id === st.vehicle.vehicleId) || null : null);
  // The vehicle every price is for: the saved one chosen, or the one typed in.
  function vehicleFacts() {
    const sv = savedVehicle(), v = st.vehicle;
    return sv ? { type: sv.vehicle_type || null, size: sv.size || 'standard', notSure: false } : { type: v.notSure ? null : v.type, size: v.size, notSure: v.notSure };
  }
  function quoteInput(over) {
    const vf = vehicleFacts();
    return Object.assign({
      location_type: st.location.type || 'shop',
      bundle: st.service.bundle, exterior: st.service.exterior, interior: st.service.interior,
      addons: st.service.addons.filter(canHaveAddon), conditions: condsForQuote(),
      vehicle_type: vf.type, vehicle_size: vf.size, not_sure: vf.notSure,
    }, over || {});
  }
  async function getQuote(input) {
    const key = JSON.stringify(input);
    if (!quoteCache.has(key)) quoteCache.set(key, D.quote(input).catch((e) => ({ error: e })));
    return quoteCache.get(key);
  }
  async function refreshQuote() {
    if (!mainsChosen()) { st.quote = null; return null; }
    const q = await getQuote(quoteInput());
    st.quote = q && !q.error ? q : null;
    return q;
  }
  function invalidateQuotes() { quoteCache.clear(); st.quote = null; st.prices = {}; }
  const payloadPhotos = () => st.vehicle.photos.map((p) => p.name);
  function payload() {
    const v = st.vehicle, c = st.contact, l = st.location, s = st.service, w = st.when;
    const p = {
      request_id: st.requestId, first_name: c.first.trim(), last_name: c.last.trim() || null,
      location_type: l.type, address: l.type === 'mobile' ? l.address.trim() : null, address_zip: l.type === 'mobile' ? l.zip.trim() : null,
      conditions: condsForQuote(), stains: [], damage: v.damage, damage_note: v.damageNote.trim() || null,
      special_request: s.notes.trim() || null, photos: payloadPhotos(),
      bundle: s.bundle, exterior: s.exterior, interior: s.interior, addons: s.addons.filter(canHaveAddon),
      service_date: w.date, start_min: w.start, website: root.querySelector('#bk-website') ? root.querySelector('#bk-website').value : '',
    };
    if (v.vehicleId) p.vehicle_id = v.vehicleId;
    else Object.assign(p, {
      vehicle_make: v.make.trim(), vehicle_model: v.model.trim(), vehicle_year: v.year.trim() || null, vehicle_color: v.color.trim() || null,
      vehicle_type: v.notSure ? null : v.type, vehicle_size: v.size, not_sure: v.notSure, vehicle_description: v.notSure ? v.description.trim() : null,
      modifications: v.modifications,
    });
    return p;
  }

  // ---------------------------------------------------------------- shell
  function mount(container) {
    root = container;
    if (mounted) {
      if (st.receipt) reset(true);   // a receipt from an earlier visit: the next visit starts a fresh request
      render();
      // signed in (the account page) or out since the last visit: the contact and the saved vehicles follow
      D.session().then((s) => { if ((s && s.userId) !== (session && session.userId)) adopt(s).then(render); }).catch(() => {});
      return;
    }
    mounted = true;
    root.replaceChildren(loading('Loading the booking…'));
    (async () => {
      try {
        await D.init();
        const s = (await Promise.all([D.settings(), D.menu(), D.session()]).then((r) => { [settings, menu] = r; return r[2]; }));
        phone = settings.public_phone;
        await adopt(s);
        st.requestId = st.requestId || D.helpers.uuid();
        render();
      } catch (e) {
        root.replaceChildren(el('div.bk-loading', "The booking couldn't load. Call ", tel(phone || '(945) 361-7551'), ' to book.'));
      }
    })();
  }
  // The data layer's session, taken into the request: a signed-in customer's names (unless typed already), the
  // confirmed phone, the email and the saved vehicles; signed out, the phone is confirmed again.
  async function adopt(s) {
    session = s;
    const c = st.contact, v = st.vehicle;
    if (s) {
      if (!c.first) c.first = s.firstName || '';
      if (!c.last) c.last = s.lastName || '';
      if (s.phone) c.phone = phonePretty(s.phone);
      c.phoneConfirmed = !!s.phoneConfirmed; c.phoneSent = false;
      if (s.email) { c.email = s.email; c.emailState = 'confirmed'; }
      try { v.saved = await D.myVehicles(); } catch (e) { v.saved = []; }
    } else {
      c.phoneConfirmed = false; c.phoneSent = false; v.saved = [];
      if (c.emailState === 'confirmed') c.emailState = 'none';
    }
    if (v.vehicleId && !v.saved.some((x) => x.id === v.vehicleId)) v.vehicleId = null;
  }

  // The step slides in, and its number breathes, only when the step changed: a rebuild of the same step
  // (a code sent, a photo added) lands in place.
  function render() {
    root.innerHTML = '';
    if (st.receipt) { root.appendChild(renderSent()); renderedStep = 0; focusTitle(); return; }
    const moved = step !== renderedStep;
    const shell = el('div.bk',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing is sent. Any 6-digit code works.')
        : (window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.project === 'test' ? el('div.bk-preview', el('b', 'Test project'), ' — this is a practice booking on the test database.') : null),
      renderProgress(moved),
      el('div.bk-body', { id: 'bk-body' }, el('div.bk-step', { class: moved ? (st.direction > 0 ? 'in-right' : 'in-left') : null }, renderStep())),
      renderNav());
    root.appendChild(shell);
    renderedStep = step;
    const h = root.querySelector('.bk-title');
    if (h) h.setAttribute('tabindex', '-1');
  }
  function focusTitle() { const h = root.querySelector('.bk-title'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } }
  const cardTop = () => root.getBoundingClientRect().top + window.scrollY - 80;

  function renderProgress(fresh) {
    return el('ol.bk-progress', { 'aria-label': 'Booking steps' }, STEPS.map((s, i) => {
      const n = i + 1;
      const state = n === step ? 'current' : n < step || n <= farthest ? 'done' : 'todo';
      return el('li', { class: state + (n === step && fresh ? ' fresh' : ''), 'aria-current': n === step ? 'step' : null },
        el('button', { type: 'button', disabled: state === 'todo', onclick: () => go(n), 'aria-label': 'Step ' + s.n + ', ' + s.name },
          el('span.num', s.n), el('span.lbl', s.name)));
    }));
  }

  function renderNav() {
    const last = step === 6;
    return el('div.bk-nav',
      step > 1 ? el('button.btn.btn-glass', { type: 'button', onclick: () => go(step - 1) }, '← Back') : el('a.btn.btn-glass', { href: '#home' }, 'Cancel'),
      el('div.bk-nav-mid', st.quote && step >= 4 && step < 6 ? el('span.bk-nav-total.tnum', st.quote.total_cents == null ? 'Price confirmed before your appointment' : 'Total ' + money(st.quote.total_cents)) : null),
      el('button.btn.btn-gold.shine', { type: 'button', id: 'bk-next', disabled: busy, onclick: () => (last ? send() : next()) },
        last ? 'Send Request' : 'Continue', el('span.arrow', { 'aria-hidden': 'true' }, '→')));
  }

  function heading(i) {
    const s = STEPS[i - 1];
    return el('header.bk-head', el('p.eyebrow', 'Step ' + s.n + ' of 06 · ' + s.name), el('h1.display.bk-title', s.title));
  }

  function renderStep() {
    switch (step) {
      case 1: return [heading(1), stepContact()];
      case 2: return [heading(2), stepVehicle()];
      case 3: return [heading(3), stepLocation()];
      case 4: return [heading(4), stepService()];
      case 5: return [heading(5), stepWhen()];
      default: return [heading(6), stepSummary()];
    }
  }

  // A step change: the page is brought to the top of the card first, plainly, so the page never shrinks under a
  // smooth scroll (the footer used to flash on Back); then the new step slides in and its title takes focus.
  function show(n) {
    st.direction = n > step ? 1 : -1;
    step = n;
    window.scrollTo({ top: cardTop(), behavior: 'auto' });
    render();
    focusTitle();
  }
  function go(n) { if (!busy) show(n); }

  async function next() {
    const ok = await validate(step);
    if (!ok) return;
    farthest = Math.max(farthest, step + 1);
    if (step === 3 || step === 4) await refreshQuote();
    go(step + 1);
  }

  // ---------------------------------------------------------------- validation per step (the database checks again)
  // Every problem a step has, so they can all be marked at once.
  function problems(n) {
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when, H = D.helpers;
    const out = [];
    const bad = (hint, text) => out.push({ hint, text });
    if (n === 1) {
      if (!H.isValidName(c.first)) bad('first_name', 'Enter your first name using letters only.');
      if (c.last.trim() && !H.isValidName(c.last)) bad('last_name', 'Enter your last name using letters only, or leave it empty.');
      if (!H.normalizePhone(c.phone)) bad('phone', 'Enter a 10-digit US phone number.');
      else if (!c.phoneConfirmed) bad('phone', c.phoneSent ? 'Enter the code we texted you, then press Confirm.' : 'Press "Send code" and confirm your phone to continue.');
      if (c.email.trim() && !H.isValidEmail(c.email)) bad('email', 'Enter a valid email, or leave it empty.');
      else if (c.email.trim() && c.emailState === 'sent') bad('email', 'Enter the email code, or press Skip.');
    }
    if (n === 2) {
      if (!v.vehicleId) {
        if (v.notSure) { if (!v.description.trim()) bad('vehicle_description', 'Describe the vehicle in a few words (no links).'); }
        else {
          if (!v.make.trim()) bad('vehicle_make', 'Enter the vehicle make.');
          if (!v.model.trim()) bad('vehicle_model', 'Enter the vehicle model.');
          if (v.year.trim() && !/^\d{4}$/.test(v.year.trim())) bad('vehicle_year', 'Enter a 4-digit year.');
          if (!v.type) bad('vehicle_type', 'Choose a vehicle type.');
        }
      }
      if (!v.conditions.length) bad('conditions', 'Tell us what the inside of the car is like, or choose None.');
      if (v.conditions.includes('other') && !s.notes.trim()) bad('special_request', 'Describe it in a few words.');
      if (!v.damage.length) bad('damage', 'Choose "No known damage" or the damage you know of.');
      const needsNote = menu.options.damage.some((o) => o.requires_note && v.damage.includes(o.code));
      if (needsNote && !v.damageNote.trim()) bad('damage_note', 'Describe the damage in a few words.');
    }
    if (n === 3) {
      if (!l.type) bad('location_type', 'Choose "We come to you" or "Come to us".');
      if (l.type === 'mobile') {
        if (!l.address.trim()) bad('address', 'Enter the street address where the vehicle will be.');
        if (!/^\d{5}$/.test(l.zip.trim())) bad('address_zip', 'Enter a 5-digit ZIP code.');
        else if (!menu.zips.has(l.zip.trim())) bad('address_zip', zipHint());
      }
    }
    if (n === 4 && !mainsChosen()) bad('services', 'Choose a bundle, or an exterior and/or an interior service.');
    if (n === 5) {
      if (!w.date) bad('service_date', 'Choose a day.');
      else if (w.start == null) bad('start_min', 'Choose one of the start times shown.');
    }
    return out;
  }
  async function validate(n) {
    const found = problems(n);
    if (found.length) return flag(n, found);
    if (n === 4) { const q = await refreshQuote(); if (q && q.error) return showDbError(q.error); }
    return true;
  }

  // Problems found while checking a step: go to that step if we're not on it (the fields only exist once the
  // step is on screen) and mark every field. One problem brings its field into view and focuses it; with more
  // than one, the list of them sits under the step's title (so it can never hide under the sticky bar), is
  // brought into view and takes focus, each entry a link to its field. "Send Request" re-checks every step
  // the same way.
  function flag(n, found) {
    const moved = step !== n;
    if (moved) show(n);
    const paint = () => {
      const many = found.length > 1;
      found.forEach((p, i) => { if (!showError(root, p.hint, p.text, { quiet: many || i > 0 })) toast(typeof p.text === 'string' ? p.text : 'Please check this step.'); });
      if (many) errorSummary(found);
    };
    if (moved) setTimeout(paint, 40); else paint();
    return false;
  }
  function errorSummary(found) {
    const labelOf = (hint) => { const l = root.querySelector('[data-field="' + hint + '"] :is(.fld-label, .choice-label)'); return l && l.firstChild ? l.firstChild.textContent.trim() : hint; };
    root.querySelectorAll('.bk-errors').forEach((x) => x.remove());
    const head = root.querySelector('.bk-head'), nav = root.querySelector('.bk-nav');
    if (!head && !nav) return;
    const box = el('div.bk-errors', { role: 'alert', tabindex: -1 },
      el('p', 'Please check:'),
      el('ul', found.map((p) => el('li', el('button.link', { type: 'button', dataset: { hint: p.hint }, onclick: () => showError(root, p.hint, p.text) }, labelOf(p.hint))))));
    if (head) head.after(box); else nav.before(box);
    box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    setTimeout(() => box.focus({ preventScroll: true }), 300);
  }

  function showDbError(e) {
    const hint = e && e.hint || '';
    const target = HINT_STEP[hint];
    const text = e && e.message || 'Something went wrong. Please try again.';
    if (target && target !== step) {
      show(target);
      setTimeout(() => { if (!showError(root, hint, text)) toast(text); }, 50);
      return false;
    }
    if (!showError(root, hint, text)) toast(text);
    return false;
  }

  // ---------------------------------------------------------------- 01 Contact
  const emailHint = () => (st.contact.emailState === 'confirmed' ? 'Confirmed ✓' : st.contact.emailState === 'skipped' ? 'We\'ll contact you by phone.' : 'For your confirmation. Phone is enough if you prefer.');
  function stepContact() {
    const c = st.contact;
    const box = el('div.bk-grid');
    const signed = session && session.phoneConfirmed && c.phoneConfirmed;
    if (signed) box.appendChild(el('p.bk-note.ok', 'Signed in as ', el('b', [c.first, c.last].filter(Boolean).join(' ') || phonePretty(c.phone)), '. ', el('button.link', { type: 'button', onclick: async () => { await D.signOut(); session = null; if (window.AlchemistAccount) window.AlchemistAccount.refresh(); Object.assign(c, blank.contact()); st.vehicle.saved = []; render(); } }, 'Not you?')));

    box.appendChild(el('div.bk-row.two',
      field({ id: 'first_name', label: 'First name', required: true, value: c.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { c.first = e.target.value; clearError(root, 'first_name'); } }),
      field({ id: 'last_name', label: 'Last name', optional: true, value: c.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { c.last = e.target.value; clearError(root, 'last_name'); } })));

    // Phone and its code
    const phoneField = field({
      id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel', value: c.phone,
      hint: c.phoneConfirmed ? 'Confirmed ✓' : 'We text a 6-digit code to confirm it.',
      oninput: (e) => {
        c.phone = e.target.value; clearError(root, 'phone');
        // a number edited after a code went out: that code no longer applies, in place
        if (c.phoneSent) { c.phoneSent = false; const code = root.querySelector('[data-field="phone_code"]'); if (code) code.remove(); const b = root.querySelector('#bk-send-code'); if (b) b.textContent = 'Send code'; }
      },
      trailing: c.phoneConfirmed ? el('span.fld-ok', '✓') : miniBtn(c.phoneSent ? 'Resend' : 'Send code', sendPhone, { id: 'bk-send-code' }),
    });
    if (c.phoneConfirmed) phoneField.input.readOnly = true;
    box.appendChild(phoneField);
    if (c.phoneSent && !c.phoneConfirmed) {
      box.appendChild(field({
        id: 'phone_code', label: 'Code from the text', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, hint: D.isLive ? 'Didn\'t get it? Check the number and press Resend.' : 'Preview: any 6 digits work.',
        oninput: (e) => { clearError(root, 'phone_code'); if (e.target.value.replace(/\D/g, '').length === 6) confirmPhone(e.target.value); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmPhone(e.target.value); } },
        trailing: miniBtn('Confirm', () => confirmPhone(root.querySelector('#phone_code').value)),
      }));
    }

    // Email (optional): the Send code button follows the address as it is typed, in place
    const emailField = field({
      id: 'email', label: 'Email', optional: true, type: 'email', inputmode: 'email', autocomplete: 'email', value: c.email,
      hint: emailHint(),
      oninput: (e) => { c.email = e.target.value; clearError(root, 'email'); emailChanged(emailField); },
      trailing: c.emailState === 'confirmed' ? el('span.fld-ok', '✓') : (c.email.trim() && c.emailState === 'none' ? miniBtn('Send code', sendEmail) : null),
    });
    box.appendChild(emailField);
    if (c.emailState === 'sent') {
      box.appendChild(el('div.bk-row.two.bk-email-code',
        field({ id: 'email_code', label: 'Code from the email', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, trailing: miniBtn('Confirm', () => confirmEmail(root.querySelector('#email_code').value)) }),
        el('div.bk-skip', miniBtn('Skip, contact me by phone', () => { c.emailState = 'skipped'; render(); }))));
    }
    // Spam field: off-screen, bots fill it
    box.appendChild(el('div.bk-hp', { 'aria-hidden': 'true' }, el('label', { for: 'bk-website' }, 'Website'), el('input', { id: 'bk-website', name: 'website', type: 'text', tabIndex: -1, autocomplete: 'off' })));
    return box;
  }
  // Typing in the email: an earlier confirmation or code no longer applies, and the trailing control follows
  // the address (a Send code button while there is one to send to, nothing once it is empty).
  function emailChanged(f) {
    const c = st.contact, box = f.querySelector('.fld-box'), msg = f.querySelector('.fld-msg');
    if (c.emailState !== 'none') {
      c.emailState = 'none';
      const code = root.querySelector('.bk-email-code'); if (code) code.remove();
      box.querySelectorAll('.fld-ok').forEach((x) => x.remove());
      msg.dataset.hint = emailHint(); msg.textContent = msg.dataset.hint;
    }
    const btn = box.querySelector('.mini-btn');
    if (c.email.trim() && !btn) box.appendChild(miniBtn('Send code', sendEmail));
    else if (!c.email.trim() && btn) btn.remove();
  }

  async function sendPhone() {
    const c = st.contact;
    if (!D.helpers.normalizePhone(c.phone)) return showError(root, 'phone', 'Enter a 10-digit US phone number.');
    if (!D.helpers.isValidName(c.first)) return showError(root, 'first_name', 'Enter your first name first, so we know who to text.');
    const b = root.querySelector('#bk-send-code'); if (b) { b.disabled = true; b.textContent = 'Sending…'; }
    try {
      await D.sendPhoneCode(c.phone, { first: c.first.trim(), last: c.last.trim() });
      c.phoneSent = true; render();
      setTimeout(() => { const i = root.querySelector('#phone_code'); if (i) i.focus(); }, 60);
    } catch (e) { render(); showError(root, e.hint || 'phone', e.message); }
  }
  async function confirmPhone(code) {
    const c = st.contact;
    try {
      session = await D.verifyPhoneCode(c.phone, code, { first: c.first.trim(), last: c.last.trim() });
      c.phoneConfirmed = true;
      if (session && session.firstName && !c.first) c.first = session.firstName;
      try { st.vehicle.saved = await D.myVehicles(); } catch (e) { /* none */ }
      render(); toast('Phone confirmed');
    } catch (e) { showError(root, e.hint || 'phone_code', e.message); }
  }
  async function sendEmail() {
    const c = st.contact;
    if (!D.helpers.isValidEmail(c.email)) return showError(root, 'email', 'Enter a valid email, or leave it empty.');
    if (!(await D.emailAllowed(c.email))) return showError(root, 'email', 'Use a regular email address, not a throwaway one, or leave it empty.');
    if (!c.phoneConfirmed) return showError(root, 'phone', 'Confirm your phone first.');
    try { await D.sendEmailCode(c.email); c.emailState = 'sent'; render(); }
    catch (e) { c.emailState = 'skipped'; render(); toast(e.message); }
  }
  async function confirmEmail(code) {
    try { await D.verifyEmailCode(st.contact.email, code); st.contact.emailState = 'confirmed'; render(); toast('Email confirmed'); }
    catch (e) { showError(root, e.hint || 'email_code', e.message); }
  }

  // ---------------------------------------------------------------- 02 Vehicle
  // What we must know first (the vehicle, its type and size, the inside, the notes, known damage); the
  // modifications and photos fold away under "Modifications and photos", optional.
  function stepVehicle() {
    const v = st.vehicle;
    const box = el('div.bk-grid');
    if (v.saved.length) {
      if (!v.vehicleId && !v.addingNew) v.vehicleId = v.saved[0].id;   // a saved vehicle is the usual answer: the first is chosen, the form stays folded
      box.appendChild(choices({
        id: 'vehicle_id', label: 'Your vehicles', value: v.vehicleId || 'new',
        items: v.saved.map((x) => ({ code: x.id, label: [x.year, x.make, x.model].filter(Boolean).join(' '), sub: [x.color, (menu.vehicleTypes.find((t) => t.code === x.vehicle_type) || {}).name, x.size === 'xl' ? 'XL' : null].filter(Boolean).join(' · ') }))
          .concat([{ code: 'new', label: '+ Add vehicle', cls: 'add' }]),
        onchange: (code) => { v.vehicleId = code === 'new' ? null : code; v.addingNew = code === 'new'; invalidateQuotes(); render(); },
      }));
    }
    if (!v.vehicleId) {
      box.appendChild(el('div.bk-row.four',
        field({ id: 'vehicle_year', label: 'Year', optional: true, inputmode: 'numeric', maxlength: 4, value: v.year, oninput: (e) => { v.year = e.target.value; clearError(root, 'vehicle_year'); } }),
        field({ id: 'vehicle_make', label: 'Make', required: !v.notSure, value: v.make, maxlength: 40, oninput: (e) => { v.make = e.target.value; clearError(root, 'vehicle_make'); } }),
        field({ id: 'vehicle_model', label: 'Model', required: !v.notSure, value: v.model, maxlength: 40, oninput: (e) => { v.model = e.target.value; clearError(root, 'vehicle_model'); } }),
        field({ id: 'vehicle_color', label: 'Color', optional: true, value: v.color, maxlength: 30, oninput: (e) => { v.color = e.target.value; clearError(root, 'vehicle_color'); } })));
      const typeItems = menu.vehicleTypes.map((t) => ({ code: t.code, label: t.name }));
      box.appendChild(choices({ id: 'vehicle_type', label: 'Type', required: !v.notSure, size: 'chip', value: v.type, items: typeItems, onchange: (code) => { v.type = code; invalidateQuotes(); } }));
      box.appendChild(el('div.bk-inline',
        el('label.bk-toggle', el('input', { type: 'checkbox', checked: v.notSure, onchange: (e) => { v.notSure = e.target.checked; render(); } }), el('span', 'Not sure? Type here')),
        v.notSure ? field({ id: 'vehicle_description', label: 'Describe the vehicle', required: true, value: v.description, maxlength: 1000, oninput: (e) => { v.description = e.target.value; clearError(root, 'vehicle_description'); } }) : null));
      box.appendChild(choices({
        id: 'vehicle_size', label: 'Size', value: v.size, items: [
          { code: 'standard', label: 'Standard', sub: 'Most cars, crossovers, SUVs and trucks' },
          { code: 'xl', label: 'XL', sub: 'Minivans and some modified trucks, such as a Raptor. We confirm the price before your appointment.' }],
        onchange: (code) => { v.size = code; invalidateQuotes(); },
      }));
    }

    // Conditions: mandatory, with the fees that apply to interior services
    const feeOf = (o) => o.fee_code ? svc(o.fee_code) : null;
    box.appendChild(choices({
      id: 'conditions', label: "What's the inside of the car like?", required: true, multi: true, value: v.conditions,
      hint: 'Choose everything that applies, or None. Fees apply with an interior service; Interior Deluxe and the Full Detail Bundle include the lighter ones.',
      items: menu.options.condition.map((o) => {
        const f = feeOf(o);
        return {
          code: o.code, label: o.label, exclusive: !!o.is_none,
          priceText: f ? '+' + money(f.base_price_cents) : (o.is_none ? 'No fee' : (o.sends_to_review ? 'We price it' : null)),
          sub: o.code === 'heavy_stains' ? 'If your car\'s condition is similar to the one listed, you may select it. If the selection turns out to be inaccurate, you will be charged ' + money(f.base_price_cents) + '.'
             : o.code === 'other' ? 'Toothpaste, coffee, anything unusual: tell us in the notes below and we\'ll price it.'
             : (f && (menu.includes.int_deluxe || []).includes(f.code) ? 'Included in Interior Deluxe and the Full Detail Bundle' : null),
        };
      }),
      onchange: (vals) => { v.conditions = vals; invalidateQuotes(); notesRequired(vals.includes('other')); if (vals.includes('other')) { const n = root.querySelector('#special_request'); if (n) n.focus(); } },
    }));
    box.appendChild(field({ id: 'special_request', label: 'Anything we should know?', optional: !v.conditions.includes('other'), required: v.conditions.includes('other'), multiline: true, rows: 3, maxlength: 1000, value: st.service.notes,
      hint: 'Bugs, tar, odors, anything unusual. We price special requests ourselves. No links, please.',
      oninput: (e) => { st.service.notes = e.target.value; clearError(root, 'special_request'); } }));

    // Damage
    box.appendChild(choices({
      id: 'damage', label: 'Known damage', required: true, size: 'chip', multi: true, value: v.damage,
      hint: 'So we know what was there before we start.',
      items: menu.options.damage.map((o) => ({ code: o.code, label: o.label, exclusive: !!o.is_none })),
      onchange: (vals) => { v.damage = vals; render(); },
    }));
    if (menu.options.damage.some((o) => o.requires_note && v.damage.includes(o.code))) {
      box.appendChild(field({ id: 'damage_note', label: 'Describe the damage', required: true, value: v.damageNote, maxlength: 1000, hint: 'Requests with unknown or other damage are reviewed by us before we confirm.', oninput: (e) => { v.damageNote = e.target.value; clearError(root, 'damage_note'); } }));
    }

    // Modifications (of a vehicle typed in; a saved one carries its own) and photos, folded
    const more = el('div.bk-more-body',
      v.vehicleId ? null : choices({ id: 'modifications', label: 'Modifications', hint: 'For preparation only. Never a fee.', size: 'chip', multi: true, value: v.modifications, items: menu.options.modification.map((o) => ({ code: o.code, label: o.label })), onchange: (vals) => { v.modifications = vals; } }),
      el('div.bk-photos', { dataset: { field: 'photos' } },
        el('p.choice-label', 'Photos', el('small', ' optional · up to 6')),
        el('div.bk-photo-grid', { id: 'bk-photo-grid' },
          v.photos.map((p) => el('figure.bk-photo', el('img', { src: p.url, alt: '', width: 96, height: 96 }), el('button.bk-photo-x', { type: 'button', 'aria-label': 'Remove photo', onclick: async () => { await D.removePhoto(p.name).catch(() => {}); v.photos = v.photos.filter((x) => x !== p); render(); } }, '×'))),
          v.photos.length < 6 ? el('label.bk-photo-add', el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, onchange: addPhotos }), el('span', '+'), el('span.small', 'Add')) : null),
        el('p.choice-msg', { role: 'status', dataset: { hint: 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.' } }, 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.')));
    box.appendChild(el('details.bk-more', { open: v.moreOpen || v.photos.length > 0 || v.modifications.length > 0, ontoggle: (e) => { v.moreOpen = e.target.open; } },
      el('summary', el('span', v.vehicleId ? 'Photos' : 'Modifications and photos', el('small', ' optional'))), more));
    return box;
  }
  // "Other" makes the notes required: the label's "optional" becomes the star, in place
  function notesRequired(on) {
    const f = root.querySelector('[data-field="special_request"]'); if (!f) return;
    const label = f.querySelector('.fld-label'), input = f.querySelector('.fld-input');
    label.replaceChildren('Anything we should know?', ...(on ? star() : [el('small', ' optional')]));
    input.required = on;
    if (on) input.setAttribute('aria-required', 'true'); else input.removeAttribute('aria-required');
  }
  async function addPhotos(e) {
    const files = Array.from(e.target.files || []).slice(0, 6 - st.vehicle.photos.length);
    if (!st.contact.phoneConfirmed && D.isLive) return showError(root, 'photos', 'Confirm your phone in step 01 first, then add photos.');
    for (const f of files) {
      try { st.vehicle.photos.push(await D.uploadPhoto(f)); }
      catch (err) { showError(root, 'photos', err.message); break; }
    }
    render();
  }

  // ---------------------------------------------------------------- 03 Location
  function stepLocation() {
    const l = st.location;
    const box = el('div.bk-grid');
    box.appendChild(choices({
      id: 'location_type', label: 'Where', required: true, value: l.type,
      items: [
        { code: 'mobile', label: 'We come to you', sub: 'Within about ' + settings.mobile_radius_miles + ' miles of ' + settings.public_area + '. Mobile adds 2.5% to basic services and add-ons, and 7% to deluxe services and bundles.' },
        { code: 'shop', label: 'Come to us', sub: settings.public_area + '. We send the address with your confirmation.' },
      ],
      onchange: (code) => { l.type = code; invalidateQuotes(); render(); },
    }));
    if (l.type === 'mobile') {
      box.appendChild(el('p.bk-note', settings.mobile_note));
      // the ZIP's message runs the width of the row (its own column is too narrow for a sentence)
      const zip = field({ id: 'address_zip', label: 'ZIP', required: true, inputmode: 'numeric', autocomplete: 'postal-code', maxlength: 5, value: l.zip,
        oninput: (e) => { l.zip = e.target.value.replace(/\D/g, '').slice(0, 5); e.target.value = l.zip; clearError(root, 'address_zip'); paintZip(root.querySelector('#address_zip-msg')); } });
      const zipMsg = zip.querySelector('.fld-msg');
      zipMsg.classList.add('addr-msg');
      box.appendChild(el('div.bk-row.addr',
        field({ id: 'address', label: 'Street address', required: true, autocomplete: 'street-address', value: l.address, maxlength: 300, oninput: (e) => { l.address = e.target.value; clearError(root, 'address'); } }),
        zip, zipMsg));
      paintZip(zipMsg);
    }
    return box;
  }
  function paintZip(m) {
    if (!m) return;
    m.replaceChildren(); U.append(m, [zipHint()]);
    m.classList.toggle('is-ok', menu.zips.has(st.location.zip));
  }
  function zipHint() {
    const z = st.location.zip;
    if (z.length < 5) return 'We check it against our service area as you type.';
    return menu.zips.has(z) ? 'In our mobile area ✓' : ['We come to you within about ' + settings.mobile_radius_miles + ' miles of ' + settings.public_area + '. For other areas, call ', tel(phone), '.'];
  }

  // ---------------------------------------------------------------- 04 Service
  function stepService() {
    const s = st.service;
    const box = el('div.bk-grid');
    const mains = menu.services.filter((x) => ['bundle', 'exterior', 'interior'].includes(x.kind));
    const groups = [['bundle', 'Bundles', 'Exterior and interior together, for less.'], ['exterior', 'Exterior', 'Choose one.'], ['interior', 'Interior', 'Choose one.']];
    const wrap = el('div.bk-services', { dataset: { field: 'services' }, 'aria-busy': Object.keys(st.prices).length ? null : 'true' },
      el('p.choice-msg', { role: 'status' }));   // the step's own message sits under the heading, where it is seen
    groups.forEach(([kind, title, sub]) => {
      const list = el('div.svc-pick');
      mains.filter((x) => x.kind === kind).forEach((x) => {
        const on = s.bundle === x.code || s.exterior === x.code || s.interior === x.code;
        const card = el('button.svc-opt', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', dataset: { code: x.code }, onclick: () => pickMain(x) },
          el('span.svc-opt-icon', { innerHTML: ICONS[kind], 'aria-hidden': 'true' }),
          el('span.svc-opt-name', x.name),
          el('span.svc-opt-price.tnum', { id: 'price-' + x.code }, priceNodes(x.code)),
          el('span.svc-opt-desc', x.description),
          el('span.svc-opt-meta', 'About ' + minutesText(x.duration_min)),
          el('span.svc-opt-check', { 'aria-hidden': 'true' }, '✓ Selected'));
        list.appendChild(card);
      });
      wrap.appendChild(el('section.svc-group-pick', el('h2.bk-h2', title, el('small', sub)), list));
    });
    box.appendChild(wrap);

    // Suggestion slot, add-ons and the breakdown
    box.appendChild(el('div', { id: 'bk-suggest' }));
    box.appendChild(addonsBlock());
    box.appendChild(el('div.bk-summary-card', { id: 'bk-price' }));
    setTimeout(updatePrices, 0);
    return box;
  }
  // The add-ons: what each needs, what the chosen services already include, the price for this vehicle.
  function addonsBlock() {
    const s = st.service;
    const addons = menu.services.filter((x) => x.kind === 'addon' && !x.code.startsWith('cond_'));
    const inc = includedCodes();
    const vf = vehicleFacts();
    return choices({
      id: 'addons', label: 'Add-ons', multi: true, value: s.addons.filter((a) => !inc.has(a)),
      hint: 'WetGloss goes with an exterior service; steam with an interior one.',
      items: addons.map((x) => {
        const included = inc.has(x.code);
        const allowed = canHaveAddon(x.code);
        const typed = x.priced_by_vehicle_type;
        const tp = typed ? (menu.typePrices[x.code] || {})[vf.type] : null;
        return {
          code: x.code, label: x.name, disabled: included || !allowed,
          priceText: included ? 'Included' : typed ? (tp != null ? money(tp) : 'Price confirmed by us') : money(x.base_price_cents),
          sub: included ? 'Already part of your service' : !allowed ? (menu.addonRules[x.code] === 'exterior' ? 'Needs an exterior service' : 'Needs an interior service') : x.description + ' About ' + minutesText(x.duration_min) + ' more.',
        };
      }),
      onchange: (vals) => { s.addons = vals; updatePrices(); },
    });
  }
  // The price on a card: the service alone, for this vehicle and these conditions, as the breakdown shows it
  // (the base price, then the conditions and the mobile fee as their own small lines). Empty until it is known.
  function priceNodes(code) {
    const p = st.prices[code];
    if (!p) return null;
    if (p.base == null) return '—';   // that service could not be quoted (the database said why in the breakdown)
    return [money(p.base),
      p.conds ? el('small', '+ ' + money(p.conds) + ' conditions') : (p.condsIncluded ? el('small.inc', 'conditions included') : null),
      p.mobile ? el('small', '+ ' + money(p.mobile) + ' mobile') : null];
  }
  function pickMain(x) {
    const s = st.service;
    if (x.kind === 'bundle') { s.bundle = s.bundle === x.code ? null : x.code; if (s.bundle) { s.exterior = null; s.interior = null; } }
    else { s.bundle = null; if (x.kind === 'exterior') s.exterior = s.exterior === x.code ? null : x.code; else s.interior = s.interior === x.code ? null : x.code; }
    paintMains();
  }
  // The cards follow the chosen services in place (the one just chosen lifts once and a rim of light runs
  // around it once, then stays lit; focus and scroll stay where they are); add-on availability changes with
  // the mains, so that block is rebuilt, then the prices and the breakdown follow.
  function paintMains() {
    const s = st.service;
    clearError(root, 'services');
    root.querySelectorAll('.svc-opt').forEach((b) => {
      const on = [s.bundle, s.exterior, s.interior].includes(b.dataset.code);
      const was = b.classList.contains('on');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && !was) { flash(b, 'just', 700); flash(b, 'glow', 1400, '::after'); }
    });
    const old = root.querySelector('[data-field="addons"]'); if (old) old.replaceWith(addonsBlock());
    updatePrices();
  }
  async function updatePrices() {
    const s = st.service;
    const mains = menu.services.filter((x) => ['bundle', 'exterior', 'interior'].includes(x.kind));
    await Promise.all(mains.map(async (x) => {
      const over = { bundle: null, exterior: null, interior: null, addons: [] };
      over[x.kind] = x.code;
      over.conditions = x.kind === 'exterior' ? [] : st.vehicle.conditions;
      const q = await getQuote(quoteInput(over));
      if (q.error) st.prices[x.code] = { base: null };
      else {
        const base = q.lines.find((l) => l.code === x.code);
        st.prices[x.code] = {
          base: base.price_cents, mobile: q.mobile_cents,
          conds: q.lines.filter((l) => l.condition && !l.included).reduce((a, l) => a + l.price_cents, 0),
          condsIncluded: q.lines.some((l) => l.condition && l.included),
        };
      }
      const elp = root.querySelector('#price-' + x.code);
      if (elp) { elp.replaceChildren(); U.append(elp, [priceNodes(x.code)]); }
    }));
    const wrap = root.querySelector('.bk-services'); if (wrap) wrap.removeAttribute('aria-busy');
    const q = await refreshQuote();
    const box = root.querySelector('#bk-price'); const sug = root.querySelector('#bk-suggest');
    const nav = root.querySelector('.bk-nav'); if (nav) nav.replaceWith(renderNav());
    if (!box) return;
    if (!q) { box.replaceChildren(el('p.bk-muted', 'Choose a service to see the price.')); if (sug) sug.replaceChildren(); return; }
    if (q.error) { box.replaceChildren(el('p.bk-muted', q.error.message)); if (sug) sug.replaceChildren(); return; }
    box.replaceChildren(priceLines(q, { withTime: true }));
    if (sug) {
      sug.replaceChildren();
      if (q.suggestion) {
        const b = svc(q.suggestion.bundle);
        sug.appendChild(el('div.bk-suggest', el('div', el('b', q.suggestion.name), ' saves you ', el('b.tnum', money(q.suggestion.saves_cents)), ' for the same two services.'),
          el('button.btn.btn-glass', { type: 'button', onclick: () => { s.bundle = b.code; s.exterior = null; s.interior = null; paintMains(); } }, 'Switch to ' + b.name)));
      }
    }
  }

  // ---------------------------------------------------------------- 05 Date and time
  function stepWhen() {
    const w = st.when, q = st.quote;
    const box = el('div.bk-grid');
    const names = q ? q.lines.filter((l) => !l.included && !l.condition).map((l) => l.name).join(' + ') : '';
    box.appendChild(el('div.bk-chosen', el('div', el('span.eyebrow', 'Your service'), el('b', names), el('span.bk-muted', 'About ' + minutesText(q ? q.duration_min : 0) + (q && q.total_cents != null ? ' · ' + money(q.total_cents) : ' · price confirmed by us'))), el('button.link', { type: 'button', onclick: () => go(4) }, 'Change')));
    const today = D.helpers.todayLocal();
    const first = D.helpers.addDays(today, settings.min_days_ahead), last = D.helpers.addDays(today, settings.max_days_ahead);
    if (!w.month) w.month = new Date(first.getFullYear(), first.getMonth(), 1);
    if (settings.customer_notice) box.appendChild(el('div.bk-notice', el('span.eyebrow', 'A note from Alchemist'), el('p', settings.customer_notice)));
    const cal = el('div.cal', { dataset: { field: 'service_date' } });
    const monthName = w.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const prevOk = new Date(w.month.getFullYear(), w.month.getMonth(), 0) >= new Date(first.getFullYear(), first.getMonth(), 1);
    const nextOk = new Date(w.month.getFullYear(), w.month.getMonth() + 1, 1) <= last;
    cal.appendChild(el('div.cal-head',
      el('button.icon-btn.small', { type: 'button', 'aria-label': 'Previous month', disabled: !prevOk, onclick: () => { w.month = new Date(w.month.getFullYear(), w.month.getMonth() - 1, 1); render(); } }, '‹'),
      el('h2.bk-h2', monthName),
      el('button.icon-btn.small', { type: 'button', 'aria-label': 'Next month', disabled: !nextOk, onclick: () => { w.month = new Date(w.month.getFullYear(), w.month.getMonth() + 1, 1); render(); } }, '›')));
    const grid = el('div.cal-grid', { role: 'group', 'aria-label': 'Choose a day in ' + monthName });
    // the gold fills a chosen day outward from where the finger (or pointer) landed
    grid.addEventListener('pointerdown', (e) => {
      const d = e.target.closest('.cal-day'); if (!d) return;
      const r = d.getBoundingClientRect();
      d.style.setProperty('--px', Math.round((e.clientX - r.left) / r.width * 100) + '%');
      d.style.setProperty('--py', Math.round((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d) => grid.appendChild(el('span.cal-dow', { 'aria-hidden': 'true' }, d)));
    const firstDow = w.month.getDay();
    for (let i = 0; i < firstDow; i++) grid.appendChild(el('span'));
    const daysIn = new Date(w.month.getFullYear(), w.month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(w.month.getFullYear(), w.month.getMonth(), d);
      const iso = D.helpers.isoDate(date);
      const inWindow = date >= first && date <= last;
      const avail = w.calendar[iso];
      const cls = !inWindow ? 'out' : avail === false ? 'full' : avail === true ? 'open' : 'unknown';
      grid.appendChild(el('button.cal-day', { type: 'button', class: cls + (w.date === iso ? ' on' : ''), disabled: !inWindow || avail === false, dataset: { iso }, 'aria-pressed': w.date === iso ? 'true' : 'false', 'aria-label': longDate(iso) + (avail === false ? ', full' : ''), onclick: () => pickDay(iso) }, el('span', d)));
    }
    cal.appendChild(grid);
    cal.appendChild(el('div.cal-keys', el('span.cal-key.open', 'Available'), el('span.cal-key.full', 'Full')));
    cal.appendChild(el('p.choice-msg', { role: 'status' }));
    box.appendChild(cal);
    box.appendChild(el('div.times', { id: 'bk-times', dataset: { field: 'start_min' } }, w.date ? timesBlock() : el('p.bk-muted', 'Pick a day to see start times.')));
    loadCalendar();
    return box;
  }
  async function loadCalendar() {
    const w = st.when, q = st.quote;
    if (!q) return;
    const from = D.helpers.isoDate(w.month > D.helpers.addDays(D.helpers.todayLocal(), settings.min_days_ahead) ? w.month : D.helpers.addDays(D.helpers.todayLocal(), settings.min_days_ahead));
    const days = Math.min(62, new Date(w.month.getFullYear(), w.month.getMonth() + 1, 0).getDate() + 7);
    const key = from + ':' + days;
    if (w.loaded === key) return;
    try {
      const rows = await D.calendar(from, days, q.duration_min, st.location.type);
      rows.forEach((r) => { w.calendar[r.day] = r.available; });
      w.loaded = key;
      root.querySelectorAll('.cal-day').forEach((b) => {
        const iso = b.dataset.iso;
        if (!(iso in w.calendar) || b.classList.contains('out')) return;
        b.classList.remove('unknown'); b.classList.toggle('full', w.calendar[iso] === false); b.classList.toggle('open', w.calendar[iso] === true);
        b.disabled = w.calendar[iso] === false;
        if (w.calendar[iso] === false) b.setAttribute('aria-label', longDate(iso) + ', full');
      });
    } catch (e) { toast(e.message); }
  }
  async function pickDay(iso) {
    const w = st.when;
    w.date = iso; w.start = null; w.times = null;
    root.querySelectorAll('.cal-day').forEach((b) => { const on = b.dataset.iso === iso; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    clearError(root, 'service_date');
    const t = root.querySelector('#bk-times'); if (t) t.replaceChildren(...timesBlock());
    try { w.times = await D.times(iso, st.quote.duration_min, st.location.type); }
    catch (e) { w.times = []; toast(e.message); }
    if (st.when.date !== iso) return;   // another day was picked meanwhile
    const t2 = root.querySelector('#bk-times'); if (t2) t2.replaceChildren(...timesBlock());
  }
  function timesBlock() {
    const w = st.when;
    const head = el('h2.bk-h2', longDate(w.date));
    if (w.times == null) return [head, el('p.bk-muted', 'Checking times…')];
    if (!w.times.length) return [head, el('p.bk-muted', 'No start times left that day. Pick another day, or call ', tel(phone), '.')];
    return [head, el('div.chips', w.times.map((m, i) => el('button.choice-item.time', {
      type: 'button', class: w.start === m ? 'on' : '', 'aria-pressed': w.start === m ? 'true' : 'false', dataset: { m }, style: { '--t': i },
      onclick: (e) => {
        w.start = m; clearError(root, 'start_min');
        root.querySelectorAll('.time').forEach((b) => { const on = +b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        flash(e.currentTarget, 'just', 600);
      },
    }, clock(m)))),
      el('p.choice-msg', { role: 'status' }, "Can't find a time? Call ", tel(phone), '.')];
  }

  // ---------------------------------------------------------------- 06 Summary
  function stepSummary() {
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when, q = st.quote;
    const box = el('div.bk-grid');
    const sec = (title, n, lines) => el('section.sum', el('div.sum-head', el('h2.bk-h2', title), el('button.link', { type: 'button', onclick: () => go(n) }, 'Edit')), el('dl.sum-body', lines.filter(Boolean).map(([k, val]) => [el('dt', k), el('dd', val)])));
    const vf = vehicleFacts();
    const vt = (menu.vehicleTypes.find((t) => t.code === vf.type) || {}).name;
    const savedV = savedVehicle();
    const condLabels = hasInterior() ? v.conditions.map((cc) => (menu.options.condition.find((o) => o.code === cc) || {}).label).join(', ') : 'Not needed for an exterior-only service';
    box.appendChild(sec('Contact', 1, [['Name', [c.first, c.last].filter(Boolean).join(' ')], ['Phone', phonePretty(c.phone) + ' ✓'], c.email.trim() ? ['Email', c.email + (c.emailState === 'confirmed' ? ' ✓' : ' (not confirmed; we\'ll use your phone)')] : null]));
    box.appendChild(sec('Vehicle', 2, [
      ['Vehicle', savedV ? [savedV.year, savedV.make, savedV.model, savedV.color && '· ' + savedV.color].filter(Boolean).join(' ') : v.notSure ? v.description : [v.year, v.make, v.model, v.color && '· ' + v.color].filter(Boolean).join(' ')],
      !vf.notSure ? ['Type and size', [vt, vf.size === 'xl' ? 'XL' : 'Standard'].filter(Boolean).join(' · ')] : null,
      ['Inside the car', condLabels],
      ['Known damage', v.damage.map((d) => (menu.options.damage.find((o) => o.code === d) || {}).label).join(', ') + (v.damageNote.trim() ? ' — ' + v.damageNote.trim() : '')],
      !savedV && v.modifications.length ? ['Modifications', v.modifications.map((m) => (menu.options.modification.find((o) => o.code === m) || {}).label).join(', ')] : null,
      v.photos.length ? ['Photos', v.photos.length + ' added'] : null]));
    box.appendChild(sec('Location', 3, [['Where', l.type === 'mobile' ? 'We come to you · ' + l.address + ', ' + l.zip : 'Come to us · ' + settings.public_area + ' (address comes with your confirmation)']]));
    box.appendChild(sec('Service', 4, [['Service', q ? q.lines.filter((x) => !x.included && !x.condition).map((x) => x.name).join(' + ') : ''], s.notes.trim() ? ['Notes', s.notes.trim()] : null]));
    box.appendChild(sec('Date and time', 5, [['When', w.date ? longDate(w.date) + ' at ' + clock(w.start) + ' · about ' + minutesText(q ? q.duration_min : 0) : '']]));
    box.appendChild(el('div.bk-summary-card', q ? priceLines(q) : null));
    box.appendChild(el('p.bk-note', 'You pay in person after your detail: card, Apple Pay or tap to pay, cash, or Zelle.'));
    box.appendChild(el('p.bk-note', 'Sending holds this time for ' + settings.hold_hours + ' hours while we review your request. We\'ll contact you to confirm.'));
    box.appendChild(el('p.choice-msg', { dataset: { field: 'submit' } }));
    return box;
  }

  async function send() {
    if (busy) return;
    for (const n of [1, 2, 3, 4, 5]) { if (!(await validate(n))) return; }
    busy = true;
    const btn = root.querySelector('#bk-next'); if (btn) { btn.disabled = true; btn.firstChild.textContent = 'Sending… '; }
    const veil = document.getElementById('veil');
    if (veil && !reduce) { veil.classList.remove('run'); void veil.offsetWidth; veil.classList.add('run'); }
    try {
      const r = await D.submit(payload());
      st.receipt = r;
      busy = false;
      if (window.AlchemistAccount) window.AlchemistAccount.refresh();
      window.scrollTo({ top: cardTop(), behavior: 'auto' });
      render();
      // the guest is signed out once the request is in (audit, flow step 7)
      try { await D.signOut(); } catch (e) { /* nothing to do */ }
      session = null;
    } catch (e) {
      busy = false;
      if (e.code === 'slot_unavailable') { st.when.start = null; st.when.times = null; st.when.loaded = null; st.when.calendar = {}; }
      render();
      showDbError(e);
    }
  }

  // ---------------------------------------------------------------- Request sent
  function renderSent() {
    const r = st.receipt;
    const holdEnds = r.hold_expires_at ? new Date(r.hold_expires_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    // the monogram, from the symbol in the page (an SVG element proper, so it draws)
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    mark.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#ad-mark');
    mark.appendChild(use);
    return el('div.bk.bk-sent',
      el('div.sent-mark', mark),
      el('p.eyebrow', 'Request received'),
      el('h1.display.bk-title', 'Thank you'),
      el('p.sent-ref', 'Reference ', el('b.tnum', r.ref)),
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing was sent. The reference is made up.') : null,
      el('dl.sum-body.sent-body',
        el('dt', 'When'), el('dd', longDate(r.service_date) + ' at ' + clock(r.start_min)),
        el('dt', 'Where'), el('dd', r.location_type === 'mobile' ? r.address + ', ' + r.address_zip : settings.public_area + ' — we send the address with your confirmation'),
        el('dt', 'Price'), el('dd', r.total_cents == null ? 'We confirm the price before your appointment' : money(r.total_cents)),
        holdEnds ? [el('dt', 'Held until'), el('dd', holdEnds)] : null),
      el('p.bk-note', 'What happens next: we review your request and contact you at ', el('span.tnum', phonePretty(st.contact.phone)), ' to confirm. You pay in person after your detail.'),
      el('div.bk-actions',
        el('a.btn.btn-gold.shine', { href: '#home' }, 'Back to home'),
        el('button.btn.btn-glass', { type: 'button', onclick: () => { reset(true); window.scrollTo({ top: cardTop(), behavior: 'auto' }); render(); focusTitle(); } }, 'Book another detail'),
        el('a.btn.btn-glass', { href: 'tel:+1' + phone.replace(/\D/g, '') }, 'Call ', el('span.tnum', phone))));
  }

  window.AlchemistBooking = { mount, get state() { return st; } };
})();
