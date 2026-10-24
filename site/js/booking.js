/* Alchemist Detailing — the booking app (doc 18): 01 Contact, 02 Vehicle,
   03 Location, 04 Service, 05 Date and time, 06 Summary, then Request sent.
   Everything the browser works out is shown only; the database re-checks it
   all when the request is sent. Data comes from AlchemistData (live or preview). */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, phonePretty, tel, loading, star, field, choices, flash, priceLines, miniBtn, showError, clearError, toast, refGroups, copyRef } = U;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the optional email and its code show only once the site can email codes (config.js)
  const emailCodes = () => !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.emailCodes);
  // A guest booking (no text codes yet, Migration 005): the name and phone as typed, no code, no photos. Someone
  // already signed in with a confirmed phone books as before.
  const guest = () => D.guestBooking && !(session && session.phoneConfirmed);

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
  // The owner's Alchemist's Table (services.js): each service's symbol, number and route token (#book-ed). Only
  // these come from there; every price is the database's.
  const signs = () => (window.AlchemistServices && window.AlchemistServices.signs) || [];
  const signOf = (code) => signs().find((g) => g.code === code) || null;
  // A service's mark: its symbol, the number at the top left, in a hairline square (gold for Au, the Full Detail Bundle)
  function sigMark(code) {
    const g = signOf(code);
    return g ? el('span.sig', { class: g.key === 'au' ? 'au' : null, 'aria-hidden': 'true' }, el('small.tnum', g.num), g.sym) : null;
  }

  // ---------------------------------------------------------------- state
  let root = null, settings = null, menu = null, session = null, phone = null;
  let step = 1, farthest = 1, renderedStep = 0, busy = false, mounted = false;
  // offered: a route token (#book-ed) waiting for the menu; asking: a service chosen on Services that differs from the
  // one this request already has, asked about at the top of the card (a choice already made is never replaced unasked)
  let offered = null, asking = null;
  const blank = {
    contact: () => ({ first: '', last: '', phone: '', email: '', phoneSent: false, phoneConfirmed: false, emailState: 'none', website: '' }),
    vehicle: (saved) => ({ vehicleId: null, addingNew: false, moreOpen: false, saved: saved || [], year: '', make: '', model: '', color: '', type: null, notSure: false, description: '', size: 'standard', modifications: [], conditions: [], damage: ['none'], damageNote: '', photos: [] }),
    location: () => ({ type: null, address: '', zip: '' }),
    // carried: the service chosen on the Services page, while it is still the choice; glow: step 04 lights it once
    service: () => ({ bundle: null, exterior: null, interior: null, addons: [], notes: '', carried: null, glow: false }),
    // fit: the job's length and place the days and times were loaded for; lost: the quiet line once a chosen day or time
    // no longer fits; switching: the strip that changes the service on the date step is open
    when: () => ({ date: null, start: null, month: null, calendar: {}, times: [], loaded: null, fit: null, lost: null, switching: false }),
  };
  const st = { contact: blank.contact(), vehicle: blank.vehicle(), location: blank.location(), service: blank.service(), when: blank.when(), quote: null, receipt: null, sentAsGuest: false, requestId: null, direction: 1, prices: {} };
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
    step = farthest = 1; renderedStep = 0; busy = false; asking = null;
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
    // a quote that failed is not kept, so asking again (another tap, Continue) tries again
    if (!quoteCache.has(key)) quoteCache.set(key, D.quote(input).catch((e) => { quoteCache.delete(key); return { error: e }; }));
    return quoteCache.get(key);
  }
  // An answer for a request that changed again while it was on its way (two quick taps) is dropped: only the quote for
  // the request as it stands now becomes st.quote. STALE tells the caller a newer answer is coming.
  const STALE = { stale: true };
  async function refreshQuote() {
    if (!mainsChosen()) { st.quote = null; return null; }
    const key = JSON.stringify(quoteInput());
    const q = await getQuote(quoteInput());
    if (JSON.stringify(quoteInput()) !== key) return STALE;
    st.quote = q && !q.error ? q : null;
    return q;
  }
  function invalidateQuotes() { quoteCache.clear(); st.quote = null; st.prices = {}; }
  // What the open days and start times depend on: the job's length (the services and add-ons) and where it happens
  const fitKey = () => (st.quote ? st.quote.duration_min : 0) + ':' + (st.location.type || 'shop');
  const payloadPhotos = () => st.vehicle.photos.map((p) => p.name);
  function payload() {
    const v = st.vehicle, c = st.contact, l = st.location, s = st.service, w = st.when;
    const p = {
      request_id: st.requestId, first_name: c.first.trim(), last_name: c.last.trim() || null,
      location_type: l.type, address: l.type === 'mobile' ? l.address.trim() : null, address_zip: l.type === 'mobile' ? l.zip.trim() : null,
      conditions: condsForQuote(), stains: [], damage: v.damage, damage_note: v.damageNote.trim() || null,
      special_request: s.notes.trim() || null, photos: payloadPhotos(),
      bundle: s.bundle, exterior: s.exterior, interior: s.interior, addons: s.addons.filter(canHaveAddon),
      service_date: w.date, start_min: w.start, website: c.website || '',
    };
    if (guest()) p.phone = c.phone.trim();
    if (v.vehicleId) p.vehicle_id = v.vehicleId;
    else Object.assign(p, {
      vehicle_make: v.make.trim(), vehicle_model: v.model.trim(), vehicle_year: v.year.trim() || null, vehicle_color: v.color.trim() || null,
      vehicle_type: v.notSure ? null : v.type, vehicle_size: v.size, not_sure: v.notSure, vehicle_description: v.notSure ? v.description.trim() : null,
      modifications: v.modifications,
    });
    return p;
  }

  // ---------------------------------------------------------------- shell
  // opts.pick: a route token from the Services page (#book-ed), taken in once the menu is here
  function mount(container, opts) {
    root = container;
    if (opts && opts.pick) offered = opts.pick;
    if (mounted) {
      // the first visit's load is still on its way: it draws the booking when it lands
      if (!menu) { root.replaceChildren(loading('Loading the booking…')); return; }
      if (st.receipt) reset(true);   // a receipt from an earlier visit: the next visit starts a fresh request
      takeOffer();
      redraw();
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
        takeOffer();
        render();
      } catch (e) {
        mounted = false;   // the next visit tries again
        root.replaceChildren(el('div.bk-loading', "The booking couldn't load. Call ", tel(phone || '(945) 361-7551'), ' to book.'));
      }
    })();
  }
  // A token arriving while the booking is open (#book-ed typed or followed on the booking page): the same rules
  function offer(tok) {
    offered = tok;
    if (!menu || !root) return;
    if (st.receipt) reset(true);
    takeOffer();
    Promise.resolve(redraw()).then(() => { if (asking) focusAsk(); });
  }
  // Drawn again after a change from outside the steps: the date step and the summary need this booking's quote
  // first (go fetches it, and sends a summary whose length changed back to the date step)
  function redraw() { if (step >= 5 && !st.quote && mainsChosen()) return go(step); render(); }
  // The service chosen on the Services page, taken into the request. A request with no service yet takes it as
  // chosen (step 04 opens with it lit once); one that already has another keeps its own, and the top of the card
  // asks. An add-on joins the add-ons and counts once a service it goes with is chosen. An unknown token is ignored.
  function takeOffer() {
    const tok = offered; offered = null;
    if (!tok || !menu) return;
    const g = signs().find((x) => x.key === tok), x = g && svc(g.code);
    if (!x) return;
    const s = st.service;
    if (x.kind === 'addon') {   // one the request's service already includes needs nothing
      if (!s.addons.includes(x.code) && !includedCodes().has(x.code)) { s.addons = s.addons.concat(x.code); invalidatePrice(); }
      return;
    }
    if ([s.bundle, s.exterior, s.interior].includes(x.code)) { asking = null; return; }
    if (mainsChosen()) { asking = x.code; return; }
    choose(x); s.carried = x.code; s.glow = true; invalidatePrice();
  }
  // The request's service changed outside step 04: the quote it had no longer applies
  function invalidatePrice() { st.quote = null; }
  // The customer's answer to the service offered from Services: 'switch' (a bundle replaces everything, a service
  // replaces its own kind), 'add' (beside the other kind), 'only' (it alone), or 'keep' the request's own
  async function answerOffer(mode) {
    const code = asking; asking = null;
    if (mode !== 'keep' && code) {
      if (mode === 'only') { st.service.exterior = null; st.service.interior = null; }
      choose(svc(code), false); st.service.carried = code; st.service.glow = step <= 4;
      invalidatePrice();
      if (step >= 4) await refreshQuote();
      if (step >= 5) { go(step); return; }   // the date step checks the day and time again for the new length
    }
    render();
    focusTitle();
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
    // A guest has no saved vehicles and can't send photos (both belong to an account): none are kept hidden
    if (guest()) { v.saved = []; v.photos = []; }
    if (v.vehicleId && !v.saved.some((x) => x.id === v.vehicleId)) v.vehicleId = null;
  }

  // The step slides in, and its number breathes, only when the step changed: a rebuild of the same step
  // (a code sent, a photo added) lands in place.
  function render() {
    root.innerHTML = '';
    if (st.receipt) { root.appendChild(renderSent()); renderedStep = 0; focusTitle(); return; }
    const moved = step !== renderedStep;
    const shell = el('div.bk',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing is sent.' + (guest() ? '' : ' Any 6-digit code works.'))
        : (window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.project === 'test' ? el('div.bk-preview', el('b', 'Test project'), ' — this is a practice booking on the test database.') : null),
      renderProgress(moved),
      askLine() || carryLine(),
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

  // The request's service at the top of steps 01 to 03, once one is chosen (on the Services page, or at step 04 before
  // coming back): kept, with where to change it
  const mainCodes = () => [st.service.bundle, st.service.exterior, st.service.interior].filter(Boolean);
  // An add-on that can't go with the chosen service yet (WetGloss with an interior only) is not part of it: it waits
  // on a line of its own, in step 04's words.
  function carryLine() {
    const s = st.service, mains = mainCodes(), extra = s.addons.filter((a) => !includedCodes().has(a));
    const codes = mains.concat(mains.length ? extra.filter(canHaveAddon) : extra);
    if (step > 3 || !codes.length) return null;
    const waiting = mains.length ? extra.filter((a) => !canHaveAddon(a)) : [];
    return el('div.bk-carry', { style: { '--marks': codes.filter(signOf).length } },
      el('span.bk-carry-marks', codes.map(sigMark)),
      el('p.bk-carry-main', el('span.eyebrow', mains.length ? 'Your service' : 'Your add-on'), el('b', codes.map((c) => svc(c).name).join(' + ')),
        waiting.map((a) => el('span.bk-carry-wait', svc(a).name + ' is added once you choose ' + waitsFor(a) + '.'))),
      farthest >= 4 ? el('button.link', { type: 'button', onclick: () => go(4) }, 'Change')
        : el('span.bk-carry-aside', mains.length ? 'You can change it at step 04' : 'Choose a service for it at step 04'));
  }
  // A service chosen on Services while this request already has another. Each answer says what it does: a bundle, or
  // a service of a kind the request has, switches (a kept other kind is named in the result); an exterior offered to a
  // request with only an interior (or the reverse) can be added, or taken alone; or the request keeps its own. The
  // question is where a page change lands (data-land, app.js), so a screen reader hears it first.
  function askLine() {
    const x = asking && svc(asking);
    if (!x) return null;
    const s = st.service, own = mainCodes().map((c) => svc(c).name).join(' + ');
    const other = x.kind === 'exterior' ? 'interior' : x.kind === 'interior' ? 'exterior' : null;
    const pair = !!other && !s.bundle && !s[x.kind] && !!s[other];   // only the other kind: the two go together
    const both = !!other && !s.bundle && !!s[x.kind] && !!s[other];   // the same kind is switched, the other stays
    const result = both ? [s.exterior, s.interior].map((c) => (svc(c).kind === x.kind ? x.name : svc(c).name)).join(' + ') : x.name;
    const answers = pair
      ? [miniBtn('Add ' + x.name, () => answerOffer('add')), miniBtn('Switch to ' + x.name + ' only', () => answerOffer('only'))]
      : [miniBtn('Switch to ' + result, () => answerOffer('switch'))];
    return el('div.bk-carry.ask', { role: 'group', tabindex: -1, 'aria-label': 'A service chosen on the Services page', 'aria-describedby': 'bk-ask-q', dataset: { land: '' }, style: { '--marks': signOf(x.code) ? 1 : 0 } },
      el('span.bk-carry-marks', sigMark(x.code)),
      el('p.bk-carry-main', { id: 'bk-ask-q' }, el('span.eyebrow', 'Chosen on Services'), el('span', el('b', x.name), '. This request has ', el('b', own), '.')),
      el('div.bk-carry-act', answers, el('button.link', { type: 'button', onclick: () => answerOffer('keep') }, 'Keep ' + own)));
  }
  // The question takes the focus when it comes up on an open booking (a page change lands on it through app.js)
  function focusAsk() {
    const a = root.querySelector('.bk-carry.ask');
    if (!a) return;
    a.focus({ preventScroll: true });
    const r = a.getBoundingClientRect(), s = sight();
    if (r.top < s.top || r.bottom > s.bottom) window.scrollTo({ top: cardTop(), behavior: 'auto' });
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

  let daysWait = false;   // step 05 waits for its open days to show the first one (revealDays)
  // A step change: the page is brought to the top of the card first, plainly, so the page never shrinks under a
  // smooth scroll (the footer used to flash on Back); then the new step slides in and its title takes focus.
  function show(n) {
    st.direction = n > step ? 1 : -1;
    step = n;
    if (n !== 5) st.when.switching = false;
    window.scrollTo({ top: cardTop(), behavior: 'auto' });
    render();
    focusTitle();
    daysWait = false;
    if (n === 5) revealDays(true);
  }
  async function go(n) {
    if (busy) return;
    // the date step and the summary need this booking's quote (a change to the vehicle or the place drops it)
    if (n >= 5 && !st.quote && mainsChosen()) await refreshQuote();
    // a different length or place since the day and time were chosen: the date step checks them again first
    if (n === 6 && st.when.date && st.when.fit !== fitKey()) n = 5;
    show(n);
  }

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
      if (!H.normalizePhone(c.phone)) bad('phone', guest() ? 'Enter a 10-digit US mobile number, so we can reach you about the booking.' : 'Enter a 10-digit US phone number.');
      else if (!guest() && !c.phoneConfirmed) bad('phone', c.phoneSent ? 'Enter the code we texted you, then press Confirm.' : 'Press "Send code" and confirm your phone to continue.');
      if (emailCodes() && c.email.trim() && !H.isValidEmail(c.email)) bad('email', 'Enter a valid email, or leave it empty.');
      else if (emailCodes() && c.email.trim() && c.emailState === 'sent') bad('email', 'Enter the email code, or press Skip.');
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
    // a refusal that belongs to no field (a limit, with the number to call) stays on the summary; elsewhere, a toast
    if (!showError(root, hint || 'submit', text)) toast(text);
    return false;
  }

  // ---------------------------------------------------------------- 01 Contact
  const emailHint = () => (st.contact.emailState === 'confirmed' ? 'Confirmed ✓' : st.contact.emailState === 'skipped' ? 'We\'ll contact you by phone.' : 'For your confirmation. Phone is enough if you prefer.');
  function stepContact() {
    const c = st.contact;
    const box = el('div.bk-grid');
    const signed = session && session.phoneConfirmed && c.phoneConfirmed;
    if (signed) box.appendChild(el('p.bk-note.ok', 'Signed in as ', el('b', [c.first, c.last].filter(Boolean).join(' ') || phonePretty(c.phone)), '. ', el('button.link', { type: 'button', onclick: notYou }, 'Not you?')));

    box.appendChild(el('div.bk-row.two',
      field({ id: 'first_name', label: 'First name', required: true, value: c.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { c.first = e.target.value; clearError(root, 'first_name'); } }),
      field({ id: 'last_name', label: 'Last name', optional: true, value: c.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { c.last = e.target.value; clearError(root, 'last_name'); } })));

    // A guest: the phone as typed, for the owner to call or text to confirm (no code until text codes work)
    if (guest()) {
      box.appendChild(field({
        id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel', value: c.phone,
        hint: 'We\'ll call or text this number to confirm your booking.',
        oninput: (e) => { c.phone = e.target.value; clearError(root, 'phone'); },
      }));
      box.appendChild(el('div.bk-hp', { 'aria-hidden': 'true' }, el('label', { for: 'bk-website' }, 'Website'), el('input', { id: 'bk-website', name: 'website', type: 'text', tabIndex: -1, autocomplete: 'off', value: c.website, oninput: (e) => { c.website = e.target.value; } })));
      return box;
    }

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

    // Email (optional): the Send code button follows the address as it is typed, in place. Shown only once the site
    // can email a code (config.js emailCodes; the owner chose text codes only for now), or when one is confirmed already.
    if (emailCodes() || c.emailState === 'confirmed') {
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
    }
    // Spam field: off-screen, bots fill it
    box.appendChild(el('div.bk-hp', { 'aria-hidden': 'true' }, el('label', { for: 'bk-website' }, 'Website'), el('input', { id: 'bk-website', name: 'website', type: 'text', tabIndex: -1, autocomplete: 'off', value: c.website, oninput: (e) => { c.website = e.target.value; } })));
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

  // "Not you?": signed out, and the contact starts over. The saved vehicle and the photos chosen under that
  // account go too (they belong to it); a vehicle typed in stays.
  async function notYou() {
    try { await D.signOut(); } catch (e) { /* signed out anyway */ }
    session = null;
    if (window.AlchemistAccount) window.AlchemistAccount.refresh();
    Object.assign(st.contact, blank.contact());
    Object.assign(st.vehicle, { saved: [], vehicleId: null, photos: [] });
    invalidateQuotes();
    render();
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
  // modifications and photos fold away under "Modifications and photos", optional. The same questions in the same
  // order, in three titled parts: A the car, B inside the car, C before we start.
  const part = (no, title, kids) => el('section.bk-part', { 'aria-labelledby': 'bk-part-' + no },
    el('h2.bk-part-h', { id: 'bk-part-' + no }, el('span.bk-part-no', { 'aria-hidden': 'true' }, no), title), el('div.bk-grid', kids));
  function stepVehicle() {
    const v = st.vehicle;
    const box = el('div.bk-grid.bk-parts');
    const carBox = [], inside = [], before = [];
    if (v.saved.length) {
      if (!v.vehicleId && !v.addingNew) v.vehicleId = v.saved[0].id;   // a saved vehicle is the usual answer: the first is chosen, the form stays folded
      carBox.push(choices({
        id: 'vehicle_id', label: 'Your vehicles', value: v.vehicleId || 'new',
        items: v.saved.map((x) => ({ code: x.id, label: [x.year, x.make, x.model].filter(Boolean).join(' '), sub: [x.color, (menu.vehicleTypes.find((t) => t.code === x.vehicle_type) || {}).name, x.size === 'xl' ? 'XL' : null].filter(Boolean).join(' · ') }))
          .concat([{ code: 'new', label: '+ Add vehicle', cls: 'add' }]),
        onchange: (code) => { v.vehicleId = code === 'new' ? null : code; v.addingNew = code === 'new'; invalidateQuotes(); render(); },
      }));
    }
    if (!v.vehicleId) {
      carBox.push(el('div.bk-row.four',
        field({ id: 'vehicle_year', label: 'Year', optional: true, inputmode: 'numeric', maxlength: 4, value: v.year, oninput: (e) => { v.year = e.target.value; clearError(root, 'vehicle_year'); } }),
        field({ id: 'vehicle_make', label: 'Make', required: !v.notSure, value: v.make, maxlength: 40, oninput: (e) => { v.make = e.target.value; clearError(root, 'vehicle_make'); } }),
        field({ id: 'vehicle_model', label: 'Model', required: !v.notSure, value: v.model, maxlength: 40, oninput: (e) => { v.model = e.target.value; clearError(root, 'vehicle_model'); } }),
        field({ id: 'vehicle_color', label: 'Color', optional: true, value: v.color, maxlength: 30, oninput: (e) => { v.color = e.target.value; clearError(root, 'vehicle_color'); } })));
      const typeItems = menu.vehicleTypes.map((t) => ({ code: t.code, label: t.name }));
      carBox.push(choices({ id: 'vehicle_type', label: 'Type', required: !v.notSure, size: 'tile', value: v.type, items: typeItems, onchange: (code) => { v.type = code; invalidateQuotes(); } }));
      carBox.push(el('div.bk-inline',
        el('label.bk-toggle', el('input', { type: 'checkbox', checked: v.notSure, onchange: (e) => { v.notSure = e.target.checked; render(); } }), el('span', 'Not sure? Type here')),
        v.notSure ? field({ id: 'vehicle_description', label: 'Describe the vehicle', required: true, value: v.description, maxlength: 1000, oninput: (e) => { v.description = e.target.value; clearError(root, 'vehicle_description'); } }) : null));
      carBox.push(choices({
        id: 'vehicle_size', label: 'Size', value: v.size, items: [
          { code: 'standard', label: 'Standard', sub: 'Most cars, crossovers, SUVs and trucks' },
          { code: 'xl', label: 'XL', sub: 'Minivans and some modified trucks, such as a Raptor. We confirm the price before your appointment.' }],
        onchange: (code) => { v.size = code; invalidateQuotes(); },
      }));
    }

    // Conditions: mandatory, with the fees that apply to interior services
    const feeOf = (o) => o.fee_code ? svc(o.fee_code) : null;
    inside.push(choices({
      id: 'conditions', label: "What's the inside of the car like?", required: true, multi: true, value: v.conditions,
      hint: 'Choose everything that applies, or None. Fees apply with an interior service; Interior Deluxe and the Full Detail Bundle include the lighter ones.',
      items: menu.options.condition.map((o) => {
        const f = feeOf(o);
        const sub = o.code === 'heavy_stains' ? 'If your car\'s condition is similar to the one listed, you may select it. If the selection turns out to be inaccurate, you will be charged ' + money(f.base_price_cents) + '.'
          : o.code === 'other' ? 'Toothpaste, coffee, anything unusual: tell us in the notes below and we\'ll price it.' : null;
        return {
          code: o.code, label: o.label, exclusive: !!o.is_none, sub,
          priceText: f ? '+' + money(f.base_price_cents) : (o.is_none ? 'No fee' : (o.sends_to_review ? 'We price it' : null)),
          cls: sub ? null : 'short',   // a card with no note is short: the short ones sit side by side
        };
      }),
      onchange: (vals) => { v.conditions = vals; invalidateQuotes(); notesRequired(vals.includes('other')); if (vals.includes('other')) { const n = root.querySelector('#special_request'); if (n) n.focus(); } },
    }));
    inside.push(field({ id: 'special_request', label: 'Anything we should know?', optional: !v.conditions.includes('other'), required: v.conditions.includes('other'), multiline: true, rows: 3, maxlength: 1000, value: st.service.notes,
      hint: 'Bugs, tar, odors, anything unusual. We price special requests ourselves. No links, please.',
      oninput: (e) => { st.service.notes = e.target.value; clearError(root, 'special_request'); } }));

    // Damage
    before.push(choices({
      id: 'damage', label: 'Known damage', required: true, size: 'tile', multi: true, value: v.damage,
      hint: 'So we know what was there before we start.',
      items: menu.options.damage.map((o) => ({ code: o.code, label: o.label, exclusive: !!o.is_none })),
      onchange: (vals) => { v.damage = vals; render(); },
    }));
    if (menu.options.damage.some((o) => o.requires_note && v.damage.includes(o.code))) {
      before.push(field({ id: 'damage_note', label: 'Describe the damage', required: true, value: v.damageNote, maxlength: 1000, hint: 'Requests with unknown or other damage are reviewed by us before we confirm.', oninput: (e) => { v.damageNote = e.target.value; clearError(root, 'damage_note'); } }));
    }

    // Modifications (of a vehicle typed in; a saved one carries its own) and photos, folded
    const more = el('div.bk-more-body',
      v.vehicleId ? null : choices({ id: 'modifications', label: 'Modifications', hint: 'For preparation only. Never a fee.', size: 'tile', multi: true, value: v.modifications, items: menu.options.modification.map((o) => ({ code: o.code, label: o.label })), onchange: (vals) => { v.modifications = vals; } }),
      guest() ? el('p.bk-note', 'Photos: you can text them to us after you book.') : el('div.bk-photos', { dataset: { field: 'photos' } },
        el('p.choice-label', 'Photos', el('small', ' optional · up to 6')),
        el('div.bk-photo-grid', { id: 'bk-photo-grid' },
          v.photos.map((p) => el('figure.bk-photo', el('img', { src: p.url, alt: '', width: 96, height: 96 }), el('button.bk-photo-x', { type: 'button', 'aria-label': 'Remove photo', onclick: async () => { await D.removePhoto(p.name).catch(() => {}); v.photos = v.photos.filter((x) => x !== p); render(); } }, '×'))),
          v.photos.length < 6 ? el('label.bk-photo-add', el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, onchange: addPhotos }), el('span', '+'), el('span.small', 'Add')) : null),
        el('p.choice-msg', { role: 'status', dataset: { hint: 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.' } }, 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.')));
    before.push(el('details.bk-more', { open: v.moreOpen || v.photos.length > 0 || v.modifications.length > 0, ontoggle: (e) => { v.moreOpen = e.target.open; } },
      el('summary', el('span', v.vehicleId ? 'Photos' : guest() ? 'Modifications' : 'Modifications and photos', el('small', ' optional'))), more));
    box.append(part('A', 'The car', carBox), part('B', 'Inside the car', inside), part('C', 'Before we start', before));
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
      el('p.choice-msg', { role: 'status' }),   // the step's own message sits under the heading, where it is seen
      el('div.bk-carried', { id: 'bk-carried' }, carriedNotes()));
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
    // the service brought from the Services page lights up once, as the step lands, where it can be seen; below the
    // fold (a phone) its note offers "See it", and the light plays once the card is in sight
    if (s.glow) { s.glow = false; setTimeout(litOnce, 380); }
    return box;
  }
  const carriedCard = () => st.service.carried && root.querySelector('.svc-opt.on[data-code="' + st.service.carried + '"]');
  // A chosen card's moment: the head of light runs its rim once (.glow) and the gold light crosses it once (app.js);
  // the customer's own pick (now) is lit at once, and a card let go of before its turn is never lit
  function glowOnce(b, now) {
    flash(b, 'glow', 1400, '::after');
    if (window.AlchemistLight) window.AlchemistLight.pass(b, { now, when: () => b.classList.contains('on') });
  }
  // Most of it (two thirds) between the floating top bar and the sticky bar
  function inSight(n) { const r = n.getBoundingClientRect(), s = sight(); return Math.min(r.bottom, s.bottom + 16) - Math.max(r.top, s.top - 16) >= r.height * 2 / 3; }
  function litOnce() {
    const b = carriedCard(), note = root.querySelector('#bk-carried [data-carried] > span');
    if (!b) return;
    if (inSight(b)) { glowOnce(b); return; }
    if (note && !note.querySelector('.link')) note.append(' ', el('button.link', { type: 'button', onclick: seeCarried }, 'See it'));
  }
  // "See it": the card is brought to the middle of the clear band (a tap, so no finger is on the glass), takes the
  // focus, and its rim of light runs once
  function seeCarried() {
    const b = carriedCard();
    if (!b) return;
    const r = b.getBoundingClientRect(), s = sight();
    const by = r.top - (s.top + Math.max(0, (s.bottom - s.top - r.height) / 2));
    if (Math.abs(by) > 1) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
    b.focus({ preventScroll: true });
    let lit = false;
    const light = () => { if (lit) return; lit = true; window.removeEventListener('scrollend', light); glowOnce(b, true); };
    if (reduce || Math.abs(by) <= 1) light();
    else { window.addEventListener('scrollend', light); setTimeout(light, 800); }
  }
  // Quiet lines over the cards: the service still as chosen on the Services page, and an add-on that waits for the
  // service it goes with (WetGloss for an exterior, steam for an interior)
  const waitsFor = (a) => (menu.addonRules[a] === 'interior' ? 'an interior service' : menu.addonRules[a] === 'exterior' ? 'an exterior service' : 'a service') + (menu.addonRules[a] === 'any_main' ? '' : ' or a bundle');
  function carriedNotes() {
    const s = st.service, out = [];
    if (s.carried && mainCodes().includes(s.carried)) out.push(el('p.bk-quiet', { dataset: { carried: s.carried } }, el('span', svc(s.carried).name + ' was chosen on the Services page. Tap another card to change it.')));
    s.addons.filter((a) => !canHaveAddon(a)).forEach((a) => out.push(el('p.bk-quiet', svc(a).name + ' is added once you choose ' + waitsFor(a) + '.')));
    return out;
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
          sub: included ? 'Already part of your service' : !allowed ? (s.addons.includes(x.code) ? 'Added once you choose ' + waitsFor(x.code) : menu.addonRules[x.code] === 'exterior' ? 'Needs an exterior service' : 'Needs an interior service') : x.description + ' About ' + minutesText(x.duration_min) + ' more.',
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
  // A main service chosen (a bundle stands alone; an exterior and an interior go together); toggle: choosing the
  // chosen one again lets it go, as on the cards
  function choose(x, toggle) {
    const s = st.service, again = (c) => toggle !== false && c === x.code;
    if (x.kind === 'bundle') { s.bundle = again(s.bundle) ? null : x.code; if (s.bundle) { s.exterior = null; s.interior = null; } }
    else { s.bundle = null; if (x.kind === 'exterior') s.exterior = again(s.exterior) ? null : x.code; else s.interior = again(s.interior) ? null : x.code; }
  }
  function pickMain(x) { choose(x); paintMains(); }
  // The cards follow the chosen services in place (the one just chosen lifts once and a rim of light runs
  // around it once, then stays lit; focus and scroll stay where they are); add-on availability changes with
  // the mains, so that block is rebuilt, then the prices and the breakdown follow.
  function paintMains() {
    const s = st.service;
    clearError(root, 'services');
    if (s.carried && !mainCodes().includes(s.carried)) s.carried = null;   // changed here: the customer's own pick now
    const notes = root.querySelector('#bk-carried'); if (notes) notes.replaceChildren(...carriedNotes());
    root.querySelectorAll('.svc-opt').forEach((b) => {
      const on = [s.bundle, s.exterior, s.interior].includes(b.dataset.code);
      const was = b.classList.contains('on');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && !was) { flash(b, 'just', 700); glowOnce(b, true); }
      else if (was && !on && window.AlchemistLight) window.AlchemistLight.stop(b);   // its light goes with it
    });
    const old = root.querySelector('[data-field="addons"]'); if (old) old.replaceWith(addonsBlock());
    updatePrices();
  }
  // Each main service alone, for this vehicle, these conditions and this place (the cards' prices, and the date
  // step's tiles), each one painted by each(code) as it arrives
  async function mainPrices(each) {
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
      if (each) each(x.code);
    }));
  }
  async function updatePrices() {
    const s = st.service;
    await mainPrices((code) => { const elp = root.querySelector('#price-' + code); if (elp) { elp.replaceChildren(); U.append(elp, [priceNodes(code)]); } });
    const wrap = root.querySelector('.bk-services'); if (wrap) wrap.removeAttribute('aria-busy');
    const q = await refreshQuote();
    if (q === STALE) return;   // a newer pick paints when its quote lands
    const box = root.querySelector('#bk-price'); const sug = root.querySelector('#bk-suggest');
    const nav = root.querySelector('.bk-nav'); if (nav) nav.replaceWith(renderNav());
    if (!box) return;
    // the bundle note appearing after a pick (not as the step lands with it) is brought into view, once: on a phone
    // it would open under the sticky bar, below the cards
    const fresh = !!(sug && sug.dataset.painted && !sug.firstChild);
    if (sug) sug.dataset.painted = '1';
    if (!q) { box.replaceChildren(el('p.bk-muted', 'Choose a service to see the price.')); if (sug) sug.replaceChildren(); return; }
    if (q.error) { box.replaceChildren(el('p.bk-muted', q.error.message)); if (sug) sug.replaceChildren(); return; }
    box.replaceChildren(priceLines(q, { withTime: true }));
    if (sug) {
      sug.replaceChildren();
      if (q.suggestion) {
        const b = svc(q.suggestion.bundle);
        sug.appendChild(el('div.bk-suggest', el('div', el('b', q.suggestion.name), ' saves you ', el('b.tnum', money(q.suggestion.saves_cents)), ' for the same two services.'),
          el('button.btn.btn-glass', { type: 'button', onclick: (e) => {
            s.bundle = b.code; s.exterior = null; s.interior = null; paintMains();
            // this button goes with the suggestion: the focus moves to the bundle's own card, now chosen (brought into
            // view from the keyboard, whose click has no detail; a tap or a click leaves the page where it is)
            const card = root.querySelector('.svc-opt[data-code="' + b.code + '"]');
            if (card) card.focus({ preventScroll: e.detail > 0 });
          } }, 'Switch to ' + b.name)));
        if (fresh) sug.firstChild.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      }
    }
  }

  // ---------------------------------------------------------------- 05 Date and time
  // The service, the strip that changes it (open: beside the calendar on a wide screen, a row of tiles over it on a
  // phone), the owner's note and the calendar, then the times
  function stepWhen() {
    const w = st.when;
    switchBack = null;
    const box = el('div.bk-grid.bk-when', { class: w.switching ? 'switching' : null });
    box.append(chosenBlock(), switchStrip());
    const today = D.helpers.todayLocal();
    const first = D.helpers.addDays(today, settings.min_days_ahead), last = D.helpers.addDays(today, settings.max_days_ahead);
    if (!w.month) w.month = new Date(first.getFullYear(), first.getMonth(), 1);
    const held = checkFit();
    const main = el('div.bk-when-main');
    box.appendChild(main);
    if (settings.customer_notice) main.appendChild(el('div.bk-notice', el('span.eyebrow', 'A note from Alchemist'), el('p', settings.customer_notice)));
    const cal = el('div.cal', { dataset: { field: 'service_date' } });
    // The month changes under the arrows (only the title and the days are rebuilt), so the arrow pressed keeps
    // the focus; at the edge of the booking window it can't go further and hands the focus to the other one.
    // The title is a live region: a screen reader hears the new month.
    const title = el('h2.bk-h2', { 'aria-live': 'polite' });
    const grid = el('div.cal-grid', { role: 'group' });
    const arrow = (d, label, sign) => el('button.icon-btn.small', { type: 'button', 'aria-label': label, onclick: (e) => {
      const btn = e.currentTarget, had = document.activeElement === btn;
      daysWait = false;   // the visitor is choosing a month: the page stays where it is
      w.month = new Date(w.month.getFullYear(), w.month.getMonth() + d, 1);
      paintMonth(d);
      if (had && btn.disabled) (d < 0 ? nextBtn : prevBtn).focus({ preventScroll: true });
    } }, sign);
    const prevBtn = arrow(-1, 'Previous month', '‹'), nextBtn = arrow(1, 'Next month', '›');
    // dir: the month's days glide in from the side it was asked for (24px and a fade) under a weekday row that stays
    // put, and its name follows; still under reduced motion. A quick second press starts the glide afresh (turned
    // round if it was the other arrow) and puts off taking the class away, so the first press can't cut it short.
    let glideOff = 0;
    function paintMonth(dir) {
      const monthName = w.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      title.textContent = monthName;
      grid.setAttribute('aria-label', 'Choose a day in ' + monthName);
      prevBtn.disabled = new Date(w.month.getFullYear(), w.month.getMonth(), 0) < new Date(first.getFullYear(), first.getMonth(), 1);
      nextBtn.disabled = new Date(w.month.getFullYear(), w.month.getMonth() + 1, 1) > last;
      grid.replaceChildren(...monthDays(first, last));
      if (dir && !reduce) {
        const glides = (on) => [grid, title].forEach((n) => { n.classList.remove('glide-next', 'glide-prev'); if (on) { void n.offsetWidth; n.classList.add(on); } });
        clearTimeout(glideOff);
        glides(dir > 0 ? 'glide-next' : 'glide-prev');
        glideOff = setTimeout(() => glides(), 600);
      }
      loadCalendar();
    }
    // the gold fills a chosen day outward from where the finger (or pointer) landed
    grid.addEventListener('pointerdown', (e) => {
      const d = e.target.closest('.cal-day'); if (!d) return;
      const r = d.getBoundingClientRect();
      d.style.setProperty('--px', Math.round((e.clientX - r.left) / r.width * 100) + '%');
      d.style.setProperty('--py', Math.round((e.clientY - r.top) / r.height * 100) + '%');
    }, { passive: true });
    cal.appendChild(el('div.cal-head', prevBtn, title, nextBtn));
    cal.appendChild(grid);
    cal.appendChild(el('div.cal-keys', el('span.cal-key.open', 'Available'), el('span.cal-key.full', 'Full')));
    cal.appendChild(el('p.choice-msg', { role: 'status' }));
    main.appendChild(cal);
    box.appendChild(el('div.times', { id: 'bk-times', dataset: { field: 'start_min' } }, timesBlock(false)));
    paintMonth();
    if (w.date && w.times == null) refit(w.date, held);
    return box;
  }
  // The job's length or its place changed since the days and times were loaded (a service, an add-on or the location):
  // both load again for this booking. The chosen start is held aside (returned) until its day's times are back (refit),
  // so it is never shown, or sent on, before it is known to fit.
  function checkFit() {
    const w = st.when;
    let held = null;
    if (w.fit !== fitKey()) {
      if (w.fit && w.date) { held = w.start; w.start = null; w.times = null; }
      w.fit = fitKey(); w.calendar = {}; w.loaded = null;
    }
    return held;
  }

  // The service on the date step (the owner's §23: "I want this service, but actually Thursday doesn't work"): its
  // name, length and total, and Change, which opens the six services as small Table tiles beside the calendar
  const chosenNames = () => (st.quote ? st.quote.lines.filter((l) => !l.included && !l.condition).map((l) => l.name).join(' + ') : '');
  const chosenMeta = () => { const q = st.quote; return !q ? '' : 'About ' + minutesText(q.duration_min) + (q.total_cents != null ? ' · ' + money(q.total_cents) : ' · price confirmed by us'); };
  function chosenBlock() {
    const w = st.when;
    const toggle = el('button.link', { type: 'button', id: 'bk-change', 'aria-expanded': w.switching ? 'true' : 'false', 'aria-controls': 'bk-switch', onclick: () => {
      w.switching = !w.switching;
      toggle.setAttribute('aria-expanded', w.switching ? 'true' : 'false');
      toggle.textContent = w.switching ? 'Done' : 'Change';
      const strip = root.querySelector('#bk-switch'), box = root.querySelector('.bk-when');
      strip.hidden = !w.switching;
      if (box) box.classList.toggle('switching', w.switching);
      if (w.switching) { paintSwitch(); showChosenTile(); if (!reduce) flash(strip, 'opening', 600); revealSwitch(); }
    } }, w.switching ? 'Done' : 'Change');
    return el('div.bk-chosen',
      el('div', el('span.eyebrow', 'Your service'), el('b', { id: 'bk-chosen-name' }, chosenNames()), el('span.bk-muted', { id: 'bk-chosen-meta' }, chosenMeta())),
      toggle);
  }
  // The tiles by the Table's numbers (Eb Ed Ib Id Sc Au), each with this car's price for that service alone (the
  // database's quote); the chosen ones carry the gold rim. Add-ons and notes stay on step 04, one tap away.
  function switchStrip() {
    const num = (code) => { const g = signOf(code); return g ? Number(g.num) : 999; };
    const mains = menu.services.filter((x) => ['bundle', 'exterior', 'interior'].includes(x.kind)).sort((a, b) => num(a.code) - num(b.code));
    const strip = el('div.bk-switch', { id: 'bk-switch', hidden: !st.when.switching },
      el('div.sw-grid', { role: 'group', 'aria-label': 'Change the service', 'aria-describedby': 'bk-sw-hint' }, mains.map((x) => el('button.sw-tile', {
        type: 'button', dataset: { code: x.code }, 'aria-pressed': 'false', onclick: () => switchMain(x) },
        sigMark(x.code),
        el('span.sw-name', x.name),
        el('span.sw-meta', el('span.sw-price.tnum', { id: 'sw-price-' + x.code }), el('span', minutesText(x.duration_min)))))),
      el('p.sw-hint', { id: 'bk-sw-hint' }, swHint()),
      el('div.sw-foot', el('div', { id: 'bk-sw-notes', role: 'status' }), el('button.link', { type: 'button', onclick: () => go(4) }, 'Add-ons and notes')));
    if (st.when.switching) setTimeout(() => { paintSwitch(); showChosenTile(); }, 0);
    return strip;
  }
  // On a phone the tiles are one row that scrolls sideways. A tile out of sight, or showing only its edge, comes to the
  // middle of the row, so the tiles either side of it show too: the chosen one when the strip opens (at once), and
  // one tapped at the edge (gliding, still under reduced motion). A tile already in view stays where it is.
  function showTile(t, glide) {
    const row = t && t.parentElement;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect(), b = t.getBoundingClientRect();
    if (b.left >= r.left + 15 && b.right <= r.right - 15) return;
    row.scrollTo({ left: row.scrollLeft + (b.left + b.right) / 2 - (r.left + r.right) / 2, behavior: glide && !reduce ? 'smooth' : 'auto' });
  }
  const showChosenTile = () => showTile(root.querySelector('.sw-grid .sw-tile.on'), false);
  // Step 05 just opened (a click, so no finger is on the glass): on a phone the month's open days can sit under the
  // sticky bar, so the page moves just enough to show the whole month, never so far that "Your service" goes under
  // the floating top bar; nothing moves when it is already in sight. The open days can land after the step is drawn
  // (loadCalendar), so it waits for them once (wait, daysWait); a month change never moves the page.
  function revealDays(wait) {
    const day = root.querySelector('.cal-day.on') || root.querySelector('.cal-day.open'), chosen = root.querySelector('.bk-chosen'), grid = root.querySelector('.cal-grid');
    if (!day) { daysWait = !!wait; return; }
    daysWait = false;
    if (!chosen) return;
    const s = sight();
    const by = Math.min((grid || day).getBoundingClientRect().bottom - s.bottom, chosen.getBoundingClientRect().top - s.top + 4);
    if (by > 0) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }
  // The strip just opened (a click, so no finger is on the glass): the page moves just enough for the open days to sit
  // over the sticky bar, never so far that "Your service" goes under the floating top bar. On a short phone that
  // still hides them, it may go as far as the tiles' row (the lit tile says which service is chosen); nothing moves
  // when the days are already in sight
  function revealSwitch() {
    const chosen = root.querySelector('.bk-chosen'), grid = root.querySelector('.cal-grid');
    if (!chosen || !grid) return;
    const open = root.querySelectorAll('.cal-day.open'), tiles = root.querySelector('.sw-grid');
    const s = sight();
    const aim = (open.length ? open[open.length - 1] : grid).getBoundingClientRect().bottom - s.bottom;
    let cap = chosen.getBoundingClientRect().top - s.top + 4;
    if (aim > cap && tiles) cap = Math.max(cap, tiles.getBoundingClientRect().top - s.top);
    const by = Math.min(aim, cap);
    if (by > 0) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }
  // The tiles work as the cards on step 04 do, so the line under them says how: a tile adds to the other kind and
  // takes the place of its own (an exterior and an interior together; a bundle alone), and with two lit either can go
  const swHint = () => 'An exterior and an interior can go together; a bundle stands alone.' + (mainCodes().length > 1 ? ' Tap a lit tile to take it off.' : '');
  // The tiles follow the request: which are chosen, their prices (looked up once, if step 04 has not already), the
  // line under them, and a quiet line for an add-on the new service leaves off
  function paintSwitch() {
    const mains = mainCodes();
    root.querySelectorAll('.sw-tile').forEach((b) => {
      const on = mains.includes(b.dataset.code);
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const hint = root.querySelector('#bk-sw-hint'); if (hint) hint.textContent = swHint();
    const price = (code) => { const n = root.querySelector('#sw-price-' + code), p = st.prices[code]; if (n) n.textContent = !p ? '' : p.base == null ? '—' : money(p.base); };
    if (Object.keys(st.prices).length) Object.keys(st.prices).forEach(price);
    else mainPrices(price);
    const notes = root.querySelector('#bk-sw-notes');
    if (notes) notes.replaceChildren(...st.service.addons.filter((a) => !canHaveAddon(a))
      .map((a) => el('p.bk-quiet', svc(a).name + ' goes with ' + waitsFor(a) + ', so it is left off for now.')));
  }
  // A tile tapped: the service changes in place (as a card would on step 04; the last one chosen stays, the date step
  // always has one), then the bar, the length and the total follow, and the open days cross-fade to this length
  // The service and its quote to go back to when a tapped tile's price can't load (after two quick taps, the one
  // before the first). stepWhen starts it afresh.
  let switchBack = null;
  async function switchMain(x) {
    const mains = mainCodes();
    if (mains.length === 1 && mains[0] === x.code) return;
    const s = st.service;
    if (st.quote) switchBack = { bundle: s.bundle, exterior: s.exterior, interior: s.interior, carried: s.carried, quote: st.quote };
    choose(x);
    if (s.carried && !mainCodes().includes(s.carried)) s.carried = null;
    invalidatePrice();   // the old quote no longer applies (Continue meanwhile fetches this one)
    paintSwitch();
    const tile = root.querySelector('.sw-tile.on[data-code="' + x.code + '"]'); if (tile) showTile(tile, true);
    const q = await refreshQuote();
    if (q === STALE) return;   // another tile was tapped meanwhile: its answer paints
    if (step !== 5) return;
    // no price for the new service (the network, most often): the request goes back to the service it had, with
    // its price, and the days and the chosen day and time stay as they were
    if (!q || q.error) {
      const b = switchBack;
      if (b) { Object.assign(s, { bundle: b.bundle, exterior: b.exterior, interior: b.interior, carried: b.carried }); st.quote = b.quote; }
      paintSwitch();
      toast(q && q.error ? q.error.message : "Couldn't load that service's price. Try again.");
      return;
    }
    const nav = root.querySelector('.bk-nav'); if (nav) nav.replaceWith(renderNav());
    const n = root.querySelector('#bk-chosen-name'), m = root.querySelector('#bk-chosen-meta');
    if (n) n.textContent = chosenNames();
    if (m) m.textContent = chosenMeta();
    const held = checkFit();
    loadCalendar();
    if (st.when.date && st.when.times == null) { paintTimes(false); refit(st.when.date, held); }
  }

  // The month's days, weeks starting on Monday (the owner, Oct 11). The days of the months either side that share
  // a week with this one are grey, with their month under the number, and not for picking (the arrows go to that
  // month); the owner asked for this on Oct 11.
  function monthDays(first, last) {
    const w = st.when, out = [];
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => out.push(el('span.cal-dow', { 'aria-hidden': 'true' }, d)));
    const yr = w.month.getFullYear(), mo = w.month.getMonth();
    const other = (date) => el('span.cal-other', { 'aria-hidden': 'true' }, el('span', date.getDate()), el('small', date.toLocaleDateString('en-US', { month: 'short' })));
    const firstDow = (w.month.getDay() + 6) % 7;   // days of the week before the 1st: Monday 0 ... Sunday 6
    for (let i = firstDow; i > 0; i--) out.push(other(new Date(yr, mo, 1 - i)));
    const daysIn = new Date(yr, mo + 1, 0).getDate();
    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(yr, mo, d);
      const iso = D.helpers.isoDate(date);
      const inWindow = date >= first && date <= last;
      const avail = w.calendar[iso];
      const cls = !inWindow ? 'out' : avail === false ? 'full' : avail === true ? 'open' : 'unknown';
      out.push(el('button.cal-day', { type: 'button', class: cls + (w.date === iso ? ' on' : ''), disabled: !inWindow || avail === false, dataset: { iso }, 'aria-pressed': w.date === iso ? 'true' : 'false', 'aria-label': longDate(iso) + (avail === false ? ', full' : ''), onclick: () => pickDay(iso) }, el('span', d)));
    }
    // the rest of the last week from the next month, and a sixth week of it when the month fills only five: the grid
    // is always six weeks tall, so it never changes height between months
    const tail = 42 - firstDow - daysIn;
    for (let i = 1; i <= tail; i++) out.push(other(new Date(yr, mo + 1, i)));
    return out;
  }
  // The open and full days for the month on screen, for this booking's length and place (w.fit is part of the key,
  // and stepWhen empties the days when it changes). Days that arrive for an older booking are dropped.
  async function loadCalendar() {
    const w = st.when, q = st.quote;
    if (!q) return;
    const from = D.helpers.isoDate(w.month > D.helpers.addDays(D.helpers.todayLocal(), settings.min_days_ahead) ? w.month : D.helpers.addDays(D.helpers.todayLocal(), settings.min_days_ahead));
    const days = Math.min(62, new Date(w.month.getFullYear(), w.month.getMonth() + 1, 0).getDate() + 7);
    const fit = w.fit, key = from + ':' + days + ':' + fit;
    if (w.loaded === key) return;
    try {
      const rows = await D.calendar(from, days, q.duration_min, st.location.type);
      if (w.fit !== fit) return;
      rows.forEach((r) => { w.calendar[r.day] = r.available; });
      w.loaded = key;
      root.querySelectorAll('.cal-day').forEach((b) => {
        const iso = b.dataset.iso;
        if (!(iso in w.calendar) || b.classList.contains('out')) return;
        b.classList.remove('unknown'); b.classList.toggle('full', w.calendar[iso] === false); b.classList.toggle('open', w.calendar[iso] === true);
        b.disabled = w.calendar[iso] === false;
        b.setAttribute('aria-label', longDate(iso) + (w.calendar[iso] === false ? ', full' : ''));
      });
      if (w.date && w.calendar[w.date] === false) dropDay('That day no longer fits this booking. Pick another.');
      if (daysWait && step === 5) revealDays(false);
    } catch (e) { toast(e.message); }
  }
  // The chosen day is marked (the gold circle), or none is
  function markDay(iso) {
    root.querySelectorAll('.cal-day').forEach((b) => { const on = b.dataset.iso === iso; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function paintTimes(fresh) { const t = root.querySelector('#bk-times'); if (t) t.replaceChildren(...timesBlock(fresh).filter(Boolean)); }
  // A chosen day that no longer fits the booking is let go, with one quiet line in the times' place saying so
  function dropDay(text) {
    Object.assign(st.when, { date: null, start: null, times: [], lost: text });
    markDay(null);
    paintTimes(false);
  }
  async function pickDay(iso) {
    const w = st.when, fit = w.fit;
    if (!st.quote) return;
    const tap = watchTap();
    w.date = iso; w.start = null; w.times = null; w.lost = null;
    markDay(iso);
    clearError(root, 'service_date');
    paintTimes(false);
    let times;
    try { times = await D.times(iso, st.quote.duration_min, st.location.type); }
    catch (e) { times = []; toast(e.message); }
    tap.end();
    if (w.date !== iso || w.fit !== fit) return;   // another day was picked meanwhile, or the booking changed
    w.times = times;
    paintTimes(true);
    if (tap.still()) revealTimes();
  }
  // From a tap until its answer lands: whether the page stayed as it was (no finger back on the glass, no wheel, no
  // scroll) and the answer came soon. Only then may the page move for it (a scroll under a finger fights iOS, doc 35).
  function watchTap() {
    const y = window.scrollY, at = performance.now();
    let moved = false;
    const on = () => { moved = true; };
    window.addEventListener('touchstart', on, { passive: true });
    window.addEventListener('wheel', on, { passive: true });
    return {
      end: () => { window.removeEventListener('touchstart', on); window.removeEventListener('wheel', on); },
      still: () => !moved && Math.abs(window.scrollY - y) < 2 && performance.now() - at < 600,
    };
  }
  // The band of the screen nothing covers: under the floating top bar, over the booking's sticky bar
  function sight() {
    const nav = root.querySelector('.bk-nav'), bar = document.querySelector('.topbar .bar');
    return { top: (bar ? bar.getBoundingClientRect().bottom : 0) + 16, bottom: Math.min(nav ? nav.getBoundingClientRect().top : window.innerHeight, window.innerHeight) - 16 };
  }
  // The chosen day's times come into view when their heading and first row sit under the sticky bar (from the tap's
  // click, never a pointerdown, so a finger is off the glass): enough to show the whole list where it fits, never so
  // far that the heading goes under the floating bar. Nothing moves when they are already in sight.
  function revealTimes() {
    const t = root.querySelector('#bk-times');
    const head = t && t.querySelector('.bk-h2'), chip = t && t.querySelector('.time');
    if (!head || !chip) return;
    const s = sight();
    if (chip.getBoundingClientRect().bottom <= s.bottom) return;
    const by = Math.min(t.getBoundingClientRect().bottom - s.bottom, head.getBoundingClientRect().top - s.top);
    if (by > 0) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }
  // The chosen day's start times again, for this booking's length and place: a day with none left is let go, and
  // so is a start (held aside by stepWhen) that is no longer among them, each with one quiet line saying so.
  async function refit(iso, held) {
    const w = st.when, fit = w.fit;
    if (!st.quote) return;
    let times = null;
    try { times = await D.times(iso, st.quote.duration_min, st.location.type); }
    catch (e) { toast(e.message); }
    if (w.date !== iso || w.fit !== fit) return;
    if (times && !times.length) return dropDay('That day no longer fits this booking. Pick another.');
    w.times = times || [];
    if (held != null) {
      if (w.times.includes(held)) w.start = held;
      else if (times) w.lost = 'That time no longer fits this booking. Pick another.';
    }
    paintTimes(true);
  }
  // The times' place: the chosen day's start times, or what to do first. The quiet line (w.lost) sits under the
  // times when a chosen time was let go, and in their place when the day was. The times fade in once, as they
  // arrive (fresh): .enter goes when the last one has landed, so a chosen time's pop never restarts the fade.
  function timesBlock(fresh) {
    const w = st.when;
    const lost = w.lost ? el('p.bk-lost', { role: 'status' }, w.lost) : null;
    if (!w.date) return [lost || el('p.bk-muted', 'Pick a day to see start times.')];
    const head = el('h2.bk-h2', longDate(w.date));
    // while they load: the places of the first few start times, the size of real ones, under the gold light's slow
    // pass (the CSS), and the line that says so where "Can't find a time?" will be
    if (w.times == null) return [head, el('div.times-wait', { 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map((i) => el('span.time-ph', { style: { '--t': i } }))), el('p.choice-msg', { role: 'status' }, 'Checking times…')];
    if (!w.times.length) return [head, el('p.bk-muted', 'No start times left that day. Pick another day, or call ', tel(phone), '.')];
    const row = el('div.chips', { class: fresh ? 'enter' : null }, w.times.map((m, i) => el('button.choice-item.time', {
      type: 'button', class: w.start === m ? 'on' : '', 'aria-pressed': w.start === m ? 'true' : 'false', dataset: { m }, style: { '--t': i },
      onclick: (e) => {
        w.start = m; clearError(root, 'start_min');
        if (w.lost) { w.lost = null; root.querySelectorAll('.bk-lost').forEach((x) => x.remove()); }
        root.querySelectorAll('.time').forEach((b) => { const on = +b.dataset.m === m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        flash(e.currentTarget, 'just', 600);
      },
    }, clock(m))));
    if (fresh) {
      const off = () => row.classList.remove('enter');
      row.lastChild.addEventListener('animationend', off, { once: true });
      setTimeout(off, 450 + w.times.length * 25);
    }
    return [head, row, lost, el('p.choice-msg', { role: 'status' }, "Can't find a time? Call ", tel(phone), '.')];
  }

  // ---------------------------------------------------------------- 06 Summary
  // The vehicle in words: the saved one, the description of one the customer isn't sure of, or year, make, model, colour
  function vehicleText() {
    const v = st.vehicle, sv = savedVehicle();
    if (sv) return [sv.year, sv.make, sv.model, sv.color && '· ' + sv.color].filter(Boolean).join(' ');
    return v.notSure ? v.description : [v.year, v.make, v.model, v.color && '· ' + v.color].filter(Boolean).join(' ');
  }
  // A build sheet: when and how much first, then the services line by line (each with its Table mark), then the
  // details in three small parts, and one calm panel of what sending means. Every Edit goes back to its step.
  function stepSummary() {
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when, q = st.quote;
    const box = el('div.bk-grid');
    const edit = (n, what) => el('button.link', { type: 'button', 'aria-label': 'Edit ' + what, onclick: () => go(n) }, 'Edit');
    const list = (rows) => el('dl.sum-list', rows.filter(Boolean).map(([k, val]) => el('div', el('dt', k), el('dd', val))));
    const sec = (title, n, rows, cls) => el('section.sum', { class: cls || null }, el('div.sum-head', el('h2.bk-h2', title), edit(n, title.toLowerCase())), list(rows));
    const vf = vehicleFacts();
    const vt = (menu.vehicleTypes.find((t) => t.code === vf.type) || {}).name;
    const savedV = savedVehicle();
    const condLabels = hasInterior() ? v.conditions.map((cc) => (menu.options.condition.find((o) => o.code === cc) || {}).label).join(', ') : 'Not needed for an exterior-only service';
    const priced = !!q && q.total_cents != null;
    box.appendChild(el('section.sheet', { 'aria-label': 'Your booking' },
      el('div.sheet-top',
        el('div.sheet-when',
          el('div.sheet-k', el('span', 'When')),
          el('p.sheet-date', w.date ? longDate(w.date) : ''),
          el('p.sheet-time.tnum', el('span', [w.start != null ? clock(w.start) : null, q ? 'about ' + minutesText(q.duration_min) : null].filter(Boolean).join(' · ')), edit(5, 'date and time'))),
        el('div.sheet-total',
          el('div.sheet-k', el('span', priced ? 'Total' : 'Price')),
          el('p.sheet-sum.tnum', { class: priced ? null : 'pending' }, priced ? money(q.total_cents) : 'We confirm the price before your appointment'))),
      el('div.sheet-lines',
        el('div.sheet-k', el('span', 'Service'), edit(4, 'service')),
        q ? priceLines(q, { mark: sigMark }) : null,
        s.notes.trim() ? el('p.sheet-notes', el('span', 'Notes'), s.notes.trim()) : null)));
    box.appendChild(el('div.sum-grid',
      sec('Contact', 1, [['Name', [c.first, c.last].filter(Boolean).join(' ')], ['Phone', phonePretty(c.phone) + (c.phoneConfirmed ? ' ✓' : '')], c.email.trim() ? ['Email', c.email + (c.emailState === 'confirmed' ? ' ✓' : ' (not confirmed; we\'ll use your phone)')] : null]),
      sec('Location', 3, [['Where', l.type === 'mobile' ? 'We come to you · ' + l.address + ', ' + l.zip : 'Come to us · ' + settings.public_area + ' (address comes with your confirmation)']]),
      sec('Vehicle', 2, [
        ['Vehicle', vehicleText()],
        !vf.notSure ? ['Type and size', [vt, vf.size === 'xl' ? 'XL' : 'Standard'].filter(Boolean).join(' · ')] : null,
        ['Inside the car', condLabels],
        ['Known damage', v.damage.map((d) => (menu.options.damage.find((o) => o.code === d) || {}).label).join(', ') + (v.damageNote.trim() ? ' — ' + v.damageNote.trim() : '')],
        !savedV && v.modifications.length ? ['Modifications', v.modifications.map((m) => (menu.options.modification.find((o) => o.code === m) || {}).label).join(', ')] : null,
        v.photos.length ? ['Photos', v.photos.length + ' added'] : null], 'wide')));
    // what pressing Send means, in the booking's own terms (no reply time is promised: nothing alerts the owner yet)
    box.appendChild(el('section.bk-before', { 'aria-labelledby': 'bk-before-h' },
      el('h2.bk-h2', { id: 'bk-before-h' }, 'Before you send'),
      el('ul.bk-terms',
        el('li', 'Sending holds this time for ' + settings.hold_hours + ' hours while we review your request.'),
        el('li', guest() ? 'We\'ll call or text you at ' : 'We\'ll contact you at ', el('span.tnum', phonePretty(c.phone)), ' to confirm.'),
        el('li', 'You pay in person after your detail: card, Apple Pay or tap to pay, cash, or Zelle.')),
      el('p.bk-muted', 'Questions? Call ', tel(phone), '.')));
    box.appendChild(el('div', { dataset: { field: 'submit' } }, el('p.choice-msg', { role: 'alert' })));
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
      const asGuest = guest();
      const r = await D.submit(payload(), { guest: asGuest });
      st.receipt = r; st.sentAsGuest = asGuest;
      busy = false;
      if (window.AlchemistAccount) window.AlchemistAccount.refresh();
      window.scrollTo({ top: cardTop(), behavior: 'auto' });
      render();
      // the guest is signed out once the request is in (audit, flow step 7)
      try { await D.signOut(); } catch (e) { /* nothing to do */ }
      session = null;
    } catch (e) {
      busy = false;
      // the time went while the request was on its way: the date step loads the days and times again, and the
      // database's reason is the quiet line where the time was
      if (e.code === 'slot_unavailable') { Object.assign(st.when, { start: null, times: null, loaded: null, calendar: {}, lost: e.message || null }); show(5); return; }
      render();
      showDbError(e);
    }
  }

  // ---------------------------------------------------------------- Request sent
  // The guest's only record of the booking (no confirmation text yet, no account to look again): what was booked, for
  // which car, when and where, the price lines as the database stored them, the reference set large with Copy, and
  // what happens next. It prints or saves to one page through the print stylesheet.
  function renderSent() {
    const r = st.receipt, q = st.quote;
    const holdEnds = r.hold_expires_at ? new Date(r.hold_expires_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
    const rec = r.lines && r.lines.length ? r : q;   // the database's own lines; the quote as it was sent, failing that
    const rv = r.vehicle;
    const vehicle = (rv && (rv.not_sure ? rv.description : [rv.year, rv.make, rv.model, rv.color && '· ' + rv.color].filter(Boolean).join(' '))) || vehicleText();
    const minutes = r.duration_min || (q && q.duration_min);
    const ref = String(r.ref || '');
    // grouped for reading aloud (AD- then fours); Copy takes the reference exactly as written
    const groups = refGroups(ref);
    return el('div.bk.bk-sent',
      el('div.sent-mark', sentMark()),
      el('p.eyebrow', 'Request received'),
      el('h1.display.bk-title', 'Thank you'),
      el('div.sent-ref',
        el('span.sent-ref-k', 'Reference'),
        el('p.sent-code.tnum', groups.map((g) => el('span', g))),
        miniBtn('Copy', () => copyRef(ref), { 'aria-label': 'Copy the reference ' + ref })),
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing was sent. The reference is made up.') : null,
      el('section.sheet.sent-sheet', { 'aria-label': 'Your booking' },
        el('dl.sum-list',
          el('div', el('dt', 'When'), el('dd', longDate(r.service_date) + ' at ' + clock(r.start_min), minutes ? [' · ', el('span.sent-len', 'about ' + minutesText(minutes))] : null)),
          el('div', el('dt', 'Where'), el('dd', r.location_type === 'mobile' ? 'We come to you · ' + r.address + ', ' + r.address_zip : 'Come to us · ' + settings.public_area + ' — we send the address with your confirmation')),   // in the summary's words
          vehicle ? el('div', el('dt', 'Vehicle'), el('dd', vehicle)) : null),
        rec ? priceLines(rec, { mark: sigMark }) : el('p.bk-muted', r.total_cents == null ? 'We confirm the price before your appointment' : money(r.total_cents))),
      el('section.sent-next', { 'aria-labelledby': 'sent-next-h' },
        el('h2.bk-h2', { id: 'sent-next-h' }, 'What happens next'),
        el('ol.sent-steps',
          el('li', el('b', 'Request sent'), el('span.tnum.sent-ref-sm', groups.map((g) => el('span', g)))),   // grouped as the reference above
          el('li', el('b', 'We review it'), el('span', holdEnds ? 'Your time is held until ' + holdEnds : 'Your time is held while we review it')),
          el('li', el('b', st.sentAsGuest ? 'We call or text ' : 'We contact you at ', el('span.tnum', phonePretty(st.contact.phone)), ' to confirm'), el('span', 'You pay in person after your detail'))),
        el('p.bk-muted.sent-help', 'Questions? Call ', tel(phone), '.')),   // on paper, where the Call button isn't
      el('div.bk-actions',
        el('a.btn.btn-gold.shine', { href: '#home' }, 'Back to home'),
        el('button.btn.btn-glass', { type: 'button', onclick: () => { reset(true); window.scrollTo({ top: cardTop(), behavior: 'auto' }); render(); focusTitle(); } }, 'Book another detail'),
        el('a.btn.btn-glass', { href: 'tel:+1' + phone.replace(/\D/g, '') }, U.telMark(), el('span', 'Call ', el('span.tnum', phone)))),   // the phone mark, as on every call button
      el('button.link.sent-print', { type: 'button', onclick: () => window.print() }, 'Print or save'));
  }
  // The monogram from the symbol in the page, and one pass of gold light across it as the screen lands (ui.js
  // lightMark: clipped to the mark's own shape; none under reduced motion)
  function sentMark() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'), use = document.createElementNS(NS, 'use');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#ad-mark');
    svg.appendChild(use);
    return U.lightMark(svg, 'sent');
  }

  window.AlchemistBooking = { mount, offer, get state() { return st; } };
})();
