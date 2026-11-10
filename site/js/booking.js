/* Alchemist Detailing — the booking app (doc 18): 01 Contact, 02 Vehicle,
   03 Location, 04 Service, 05 Date and time, 06 Summary, then Request sent.
   Everything the browser works out is shown only; the database re-checks it
   all when the request is sent. Data comes from AlchemistData (live or preview). */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, phonePretty, tel, loading, field, choices, flash, priceLines, miniBtn, showError, clearError, toast, refGroups, copyRef, tick } = U;
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
    modifications: 2, damage: 2, damage_note: 2, photos: 2,
    location_type: 3, address: 3, address_zip: 3,
    // the inside of the car is asked on step 04, with an interior service or a bundle
    services: 4, bundle: 4, exterior: 4, interior: 4, addons: 4, conditions: 4, stains: 4,
    special_request: 2,   // the notes field is on step 02 (step 04 has it too, for "Other")
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
  // editFrom: the step an Edit on the Summary opened; its gold button goes straight back to the Summary (backToSummary).
  // Any other way off that step (Previous, the step bar, a refusal's jump, the Summary itself) lets it go (show).
  let editFrom = null;
  // summing: backToSummary is checking and waiting (the quote, the kept day's times). Its button is busy meanwhile, so a
  // second or third tap on it does nothing (a quick triple tap can't land on Send Request); Previous and the step bar
  // still work. holding: that button is the one on the screen
  let summing = false;
  const holding = () => summing && step === editFrom;
  // offered: a route token (#book-ed) waiting for the menu; asking: a service chosen on Services that differs from the
  // one this request already has, asked about at the top of the card (a choice already made is never replaced unasked)
  let offered = null, asking = null;
  // a phone confirmed with a code on this page: only that session is signed out once the request is in (a
  // session that was here before, such as the owner's console sign-in, is left alone)
  let signedInHere = false;
  // When the Summary was put on the screen for the visitor (show(6), or the booking met again on it), not when the
  // Summary being read is drawn again in place. Send sits where Continue was on 05, so a tap on it in the first
  // half-second is the second tap of a quick double tap on Continue: send() ignores it, and nothing shows.
  const SEND_HOLD = 500;
  let summaryShownAt = -Infinity;
  const markSummary = () => { summaryShownAt = performance.now(); };
  const blank = {
    contact: () => ({ first: '', last: '', phone: '', email: '', phoneSent: false, phoneConfirmed: false, emailState: 'none', website: '' }),
    vehicle: (saved) => ({ vehicleId: null, addingNew: false, moreOpen: false, saved: saved || [], year: '', make: '', model: '', color: '', type: null, notSure: false, description: '', size: 'standard', modifications: [], conditions: [], damage: ['none'], damageNote: '', photos: [] }),
    location: () => ({ type: null, address: '', zip: '' }),
    // carried: the service chosen on the Services page, while it is still the choice; glow: step 04 lights it once
    service: () => ({ bundle: null, exterior: null, interior: null, addons: [], notes: '', carried: null, glow: false }),
    // sig: the job's length and place the days and times were checked for (timeSig); note: the line under the times
    // once a refusal or a changed service let the start go; keep: a start held aside until its day's times are back;
    // fetching: the day and length whose times are on their way; switching: the strip that changes the service on
    // the date step is open
    when: () => ({ date: null, start: null, month: null, calendar: {}, times: [], loaded: null, sig: null, note: null, keep: null, fetching: null, switching: false }),
  };
  const st = { contact: blank.contact(), vehicle: blank.vehicle(), location: blank.location(), service: blank.service(), when: blank.when(), quote: null, receipt: null, sentAsGuest: false, receiptOther: false, requestId: null, direction: 1, prices: {} };
  const quoteCache = new Map();

  // The receipt, kept in this tab (sessionStorage) so a reload brings it back (a phone may reload a tab it put away,
  // such as after Call): only what the receipt shows (its calendar file too: the request's time is that file's stamp)
  // and who booked (for Book another detail), never the booking's id,
  // its history, the team or the shop's address. It is forgotten when the tab closes or a new request starts (reset);
  // with storage blocked nothing is kept.
  const SENT_KEY = 'ad.receipt';
  const sentProject = () => (window.ALCHEMIST_CONFIG || {}).project || null;
  function saveSent() {
    try {
      const r = st.receipt, q = st.quote, v = r.vehicle;
      const src = r.lines && r.lines.length ? r : q || r;   // the price lines renderSent shows: the database's, else the quote's
      sessionStorage.setItem(SENT_KEY, JSON.stringify({
        v: 1, live: D.isLive, project: sentProject(), savedAt: Date.now(),
        receipt: {
          ref: r.ref, service_date: r.service_date, start_min: r.start_min, duration_min: r.duration_min || (q && q.duration_min) || null,
          location_type: r.location_type, address: r.address || null, address_zip: r.address_zip || null,
          vehicle: v ? { year: v.year, make: v.make, model: v.model, color: v.color, not_sure: v.not_sure, description: v.description } : null,
          hold_expires_at: r.hold_expires_at || null, created_at: r.created_at || null, total_cents: src.total_cents,
          lines: (src.lines || []).map((l) => ({ code: l.code, name: l.name, kind: l.kind, price_cents: l.price_cents, included: l.included })),
          bundle_savings_cents: src.bundle_savings_cents, mobile_cents: src.mobile_cents, extra_cost_cents: src.extra_cost_cents,
          extra_cost_note: src.extra_cost_note, pending_reasons: src.pending_reasons,
        },
        // who booked, as Book another detail carries them into the next request (reset): the names and the phone, as
        // the answers kept for a reload hold them (never the email, a code's state or the spam field)
        sentAsGuest: st.sentAsGuest, receiptOther: st.receiptOther, phone: st.contact.phone, first: st.contact.first, last: st.contact.last,
      }));
    } catch (e) { /* storage blocked or full: the receipt lasts as long as the page, as before */ }
  }
  // The kept receipt, if it belongs here: the same mode (live or preview) and project, and its time still held (until
  // its hold ends, or for settings.hold_hours from when it was kept when it has no hold)
  function loadSent() {
    try {
      const k = JSON.parse(sessionStorage.getItem(SENT_KEY) || 'null'), r = k && k.receipt;
      if (!k || k.v !== 1 || k.live !== D.isLive || k.project !== sentProject() || !r) return null;
      if (typeof r.ref !== 'string' || typeof r.service_date !== 'string' || !Number.isFinite(r.start_min) || !Array.isArray(r.lines)) return null;
      const ends = r.hold_expires_at ? new Date(r.hold_expires_at).getTime() : k.savedAt + settings.hold_hours * 3600000;
      if (ends <= Date.now()) return null;
      // (a receipt kept by an older page has no request time: the moment it was kept, a moment later, stands in for
      // it, as the calendar file's stamp)
      if (r.created_at == null && Number.isFinite(k.savedAt)) r.created_at = new Date(k.savedAt).toISOString();
      return k;
    } catch (e) { return null; }
  }
  function dropSent() { try { sessionStorage.removeItem(SENT_KEY); } catch (e) { /* storage blocked: nothing was kept */ } }

  // ---------------------------------------------------------------- kept across a reload (this tab only)
  // An iPhone often reloads a tab left to read a text (doc 39, question 25): the answers so far are kept in this tab's
  // sessionStorage, so a reload brings the booking back. Only what the customer chose or typed: never the spam field,
  // a code's state, the email, a saved vehicle, photos or the request's id (a reload gets a new one, as before). It is
  // written a moment after each change, as a step changes, as the page goes and as the tab is put away (another app: a
  // phone may then discard the tab with no pagehide), never while the receipt shows. Send, Cancel and a fresh request
  // (reset) forget it, and nothing is written again until the booking is changed again (drafting). Where storage
  // can't be used, the booking works as before. A service from a Services link (#book-wg) is kept as taken in, with a
  // question about it not yet answered (asking); a reload with the kept answers takes nothing from the address again
  // (mount), so a WetGloss let go or a service kept stays as the customer left it.
  const DRAFT_KEY = 'ad.book';
  let drafting = false, draftWired = false, draftSaved = null;   // (draftSaved: the copy this page last wrote)
  // draftReady: the kept copy has been read back (mount). Until then nothing is written, so a tap, the tab put away or
  // the page going while the booking still loads (a signed-in customer's saved vehicles on their way) can't overwrite
  // the kept answers with the empty request
  let draftReady = false;
  function saveDraft() {
    if (!draftReady || !menu || st.receipt || !drafting) return;
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when;
    const d = {
      v: 1, step, farthest,
      contact: { first: c.first, last: c.last, phone: c.phone },
      vehicle: { year: v.year, make: v.make, model: v.model, color: v.color, type: v.type, size: v.size, notSure: v.notSure, description: v.description, conditions: v.conditions, damage: v.damage, damageNote: v.damageNote, modifications: v.modifications, moreOpen: v.moreOpen },
      location: { type: l.type, address: l.address, zip: l.zip },
      service: { bundle: s.bundle, exterior: s.exterior, interior: s.interior, addons: s.addons, notes: s.notes, carried: s.carried },
      ask: asking,   // (a service chosen on Services, its question not yet answered: askLine)
      // (a start held aside while its day's times load again is still the one picked)
      when: { date: w.date, start: w.start != null ? w.start : w.keep },
    };
    const json = JSON.stringify(d);
    if (json === draftSaved) return;   // (unchanged since this page last wrote it)
    try { sessionStorage.setItem(DRAFT_KEY, json); draftSaved = json; } catch (e) { /* storage unavailable: a reload starts afresh, as before */ }
  }
  const saveDraftSoon = U.debounce(saveDraft, 300);
  function clearDraft() {
    drafting = false; draftSaved = null;
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage unavailable: nothing was kept */ }
  }
  function loadDraft() {
    try { const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); return d && typeof d === 'object' && d.v === 1 ? d : null; } catch (e) { return null; }
  }
  // The kept answers, taken back as the booking is first drawn in this tab (mount). Names and phone fill only empty
  // fields, so a signed-in account's own win; a code the menu no longer has is dropped, and so is a day that isn't a
  // real calendar day or is outside the booking window. The day and the start are checked again on the date step
  // (w.sig null: syncWhen). True when a kept copy came back.
  function restoreDraft() {
    const d = loadDraft();
    if (!d) return false;
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when, H = D.helpers;
    const dc = d.contact || {}, dv = d.vehicle || {}, dl = d.location || {}, ds = d.service || {}, dw = d.when || {};
    const txt = (x) => (typeof x === 'string' ? x : '');
    const known = (x, list) => list.some((o) => o.code === x);
    const codes = (x, list, none) => (Array.isArray(x) ? x.filter((k, i) => known(k, list) && x.indexOf(k) === i) : none);
    const ofKind = (x, kind) => (menu.services.some((o) => o.code === x && o.kind === kind) ? x : null);
    if (!c.first) c.first = txt(dc.first);
    if (!c.last) c.last = txt(dc.last);
    if (!c.phone) c.phone = txt(dc.phone);
    Object.assign(v, {
      year: txt(dv.year), make: txt(dv.make), model: txt(dv.model), color: txt(dv.color),
      type: known(dv.type, menu.vehicleTypes) ? dv.type : null, size: dv.size === 'xl' ? 'xl' : 'standard',
      notSure: dv.notSure === true, description: txt(dv.description),
      conditions: codes(dv.conditions, menu.options.condition, []), damage: codes(dv.damage, menu.options.damage, ['none']),
      damageNote: txt(dv.damageNote), modifications: codes(dv.modifications, menu.options.modification, []), moreOpen: dv.moreOpen === true,
    });
    Object.assign(l, { type: dl.type === 'mobile' || dl.type === 'shop' ? dl.type : null, address: txt(dl.address), zip: txt(dl.zip) });
    s.bundle = ofKind(ds.bundle, 'bundle');
    s.exterior = s.bundle ? null : ofKind(ds.exterior, 'exterior');
    s.interior = s.bundle ? null : ofKind(ds.interior, 'interior');
    s.addons = codes(ds.addons, menu.services.filter((o) => o.kind === 'addon' && !o.code.startsWith('cond_')), []);
    s.notes = txt(ds.notes);
    s.carried = mainCodes().includes(ds.carried) ? ds.carried : null;
    // a question not yet answered is asked again: a service the menu has, beside another, never one the request has
    const main = (x) => ['bundle', 'exterior', 'interior'].some((k) => ofKind(x, k));
    asking = main(d.ask) && mainsChosen() && !mainCodes().includes(d.ask) ? d.ask : null;
    const today = H.todayIn(settings.timezone);   // (the booking window counts from Parker's today, as the calendar's)
    const first = H.isoDate(H.addDays(today, settings.min_days_ahead)), last = H.isoDate(H.addDays(today, settings.max_days_ahead));
    // a real calendar day: built from its parts, the same year, month and day come back ('2026-13-45' does not)
    const real = (x) => {
      if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
      const y = +x.slice(0, 4), m = +x.slice(5, 7), dd = +x.slice(8, 10), t = new Date(y, m - 1, dd);
      return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === dd;
    };
    const date = real(dw.date) && dw.date >= first && dw.date <= last ? dw.date : null;
    Object.assign(w, blank.when(), { date, start: date && Number.isInteger(dw.start) ? dw.start : null });
    if (date) w.month = new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, 1);   // (the calendar opens on the kept day's month)
    const n = (x) => (Number.isInteger(x) && x >= 1 && x <= 6 ? x : 1);
    step = n(d.step); farthest = Math.max(step, n(d.farthest));
    if (step >= 5 && !mainsChosen()) step = 4;
    return true;
  }

  // A fresh request: everything but who is booking (names, phone and email stay typed in; the phone is confirmed
  // again unless the session still holds it) and the saved vehicles. The copies kept for a reload (the receipt, the
  // answers) are forgotten.
  function reset(keepContact) {
    dropSent();
    clearDraft();
    const c = st.contact;
    Object.assign(st, { vehicle: blank.vehicle(st.vehicle.saved), location: blank.location(), service: blank.service(), when: blank.when(), quote: null, receipt: null, receiptOther: false, requestId: D.helpers.uuid(), direction: 1, prices: {} });
    if (keepContact) {
      c.phoneSent = false; c.phoneConfirmed = !!(session && session.phoneConfirmed);
      if (c.emailState !== 'skipped' && !(session && session.email)) c.emailState = 'none';
    } else st.contact = blank.contact();
    quoteCache.clear();
    // (an Edit's way back to the Summary goes too: a fresh request has no Summary yet, so its steps read Continue)
    step = farthest = 1; renderedStep = 0; busy = false; asking = null; editFrom = null;
  }

  // ---------------------------------------------------------------- helpers
  const svc = (code) => menu.services.find((s) => s.code === code);
  const hasInterior = () => !!(st.service.bundle || st.service.interior);
  const hasExterior = () => !!(st.service.bundle || st.service.exterior);
  const mainsChosen = () => !!(st.service.bundle || st.service.exterior || st.service.interior);
  const condsForQuote = () => hasInterior() ? st.vehicle.conditions : [];
  // the "Other" condition (with an interior service): the owner prices it, so every total on the page says the price
  // is confirmed before the appointment (doc 46). The quote can't tell: "Other" adds no line.
  const otherCond = () => condsForQuote().includes('other');
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
  // what the calendar and the start times were checked for: the job's length and where it is
  const timeSig = () => (st.quote ? st.quote.duration_min + ':' + st.location.type : null);
  function invalidateQuotes() { quoteCache.clear(); st.quote = null; st.prices = {}; }
  const payloadPhotos = () => st.vehicle.photos.map((p) => p.name);
  function payload() {
    const v = st.vehicle, c = st.contact, l = st.location, s = st.service, w = st.when;
    const p = {
      request_id: st.requestId, first_name: D.helpers.cleanName(c.first), last_name: D.helpers.cleanName(c.last) || null,
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
  // opts.pick: a route token from the Services page (#book-ed), taken in once the menu is here; opts.returning: the
  // booking met again by Back, Forward or a reload (the router), not a new arrival. A token met again was taken in when
  // its link was followed, so where that request is still here (on the page, or kept for a reload) it is not taken
  // again: a WetGloss let go would come back, a service kept would be asked about again
  function mount(container, opts) {
    root = container;
    if (!draftWired) {
      draftWired = true;
      // any change on the booking (a key, a choice, a tap) is kept a moment later. The capture comes before the
      // control's own handler, so a Cancel or a fresh request that forgets the kept copy is not written back by its own tap
      ['input', 'change', 'click'].forEach((t) => root.addEventListener(t, () => { drafting = true; saveDraftSoon(); }, true));
      window.addEventListener('pagehide', saveDraft);
      document.addEventListener('visibilitychange', () => { if (document.hidden) saveDraft(); });   // (as app.js keeps its place)
    }
    if (opts && opts.pick) offered = opts.pick;
    if (mounted) {
      // the first visit's load is still on its way: it draws the booking when it lands
      if (!menu) { root.replaceChildren(loading('Loading the booking…')); return; }
      // a receipt from an earlier visit: a new arrival (Book Now, the menu) starts a fresh request; Back or Forward to
      // it shows the receipt again, as it was left (doc 40), and takes no service in. Nor does Back or Forward to a
      // booking opened from Services: the request stays as the customer left it
      if (st.receipt && !(opts && opts.returning)) reset(true);
      if (st.receipt || (opts && opts.returning)) offered = null;
      takeOffer();
      redraw();
      if (step === 6 && !st.receipt) markSummary();   // the Summary met again on arrival is as new as after Continue
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
        // a reload on the receipt (it mounts as a return) brings back the receipt kept in this tab, as Back and Forward
        // show it (doc 40), without its moment and taking no service in; any other first visit starts afresh. While
        // the database can't be reached (the outage note shows) it stays kept, for a reload once it is back.
        // Otherwise the answers kept for a reload come back (a request that was sent keeps none: Send forgot them).
        const kept = opts && opts.returning ? loadSent() : null;
        if (kept) {
          st.receipt = kept.receipt; st.sentAsGuest = !!kept.sentAsGuest; st.receiptOther = !!kept.receiptOther;
          // who booked fills only empty fields, as the kept answers do (a signed-in account's own win)
          const c = st.contact, txt = (x) => (typeof x === 'string' ? x : '');
          if (!c.phone) c.phone = String(kept.phone || '');
          if (!c.first) c.first = txt(kept.first);
          if (!c.last) c.last = txt(kept.last);
          offered = null;
          sentDrawn = st.receipt;
          clearDraft();   // (the receipt shows, not a draft)
          draftReady = true;   // (a new request from here, Book another detail, is kept as usual)
        } else {
          if (!D.isDown) dropSent();
          let restored = false;
          try { restored = restoreDraft(); } catch (e) { clearDraft(); }   // (a copy that can't be read is dropped)
          draftReady = true;   // (from here on the request on the page is the one to keep)
          // a reload of a booking opened from Services (#book-wg): the kept answers hold that service as taken in and
          // changed since, so the address's token is not taken again. A new arrival from Services still takes it.
          if (restored && opts && opts.returning) offered = null;
        }
        takeOffer();
        // a request brought back on the date step or the summary: its price first (none: the service step), then the kept
        // day and start checked again for it, as after a service change (syncWhen). Drawn in place (render, not show),
        // so the page lands where it was left (app.js)
        if (!st.receipt && step >= 5) { await refreshQuote(); if (st.quote) syncWhen(); else step = 4; }
        render();
      } catch (e) {
        mounted = false;   // the next visit tries again
        const p = phone || '(945) 361-7551';
        root.replaceChildren(U.outage(['The booking couldn’t load. Call ', tel(p), ' to book.'], p));
      }
    })();
  }
  // A token arriving while the booking is open (#book-ed typed or followed on the booking page): the same rules. Back
  // or Forward onto it (opts.returning) takes nothing: it was taken in when the link was followed
  function offer(tok, opts) {
    if (opts && opts.returning) return;
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
  // What it takes in or asks is kept for a reload as a choice is (drafting), since a reload doesn't take it again.
  function takeOffer() {
    const tok = offered; offered = null;
    if (!tok || !menu) return;
    const g = signs().find((x) => x.key === tok), x = g && svc(g.code);
    if (!x) return;
    const s = st.service;
    drafting = true; saveDraftSoon();
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
    // Only a session with a text-confirmed phone (a customer's account) fills anything in. Any other login (the
    // owner's email-and-password console sign-in) books like a guest: its name and email are not the customer's,
    // so nothing of it is copied into the request, whether or not guest booking is on.
    if (s && s.phoneConfirmed) {
      if (!c.first) c.first = s.firstName || '';
      if (!c.last) c.last = s.lastName || '';
      if (s.phone) c.phone = phonePretty(s.phone);
      c.phoneConfirmed = true; c.phoneSent = false;
      if (s.email) { c.email = s.email; c.emailState = 'confirmed'; }
      try { v.saved = await D.myVehicles(); } catch (e) { v.saved = []; }
    } else {
      c.phoneConfirmed = false; c.phoneSent = false; v.saved = [];
      // an email that came from a login is not one the customer typed
      if (c.emailState === 'confirmed') { if (s) c.email = ''; c.emailState = 'none'; }
    }
    // A guest has no saved vehicles and can't send photos (both belong to an account): none are kept hidden
    if (guest()) { v.saved = []; v.photos = []; }
    if (v.vehicleId && !v.saved.some((x) => x.id === v.vehicleId)) v.vehicleId = null;
  }

  // The step slides in, and its number breathes, only when the step changed: a rebuild of the same step
  // (a code sent, a photo added) lands in place.
  function render() {
    root.innerHTML = '';
    // the database can't be reached on the real site: the phone number, never the preview (doc 42)
    if (D.isDown) { const p = phone || '(945) 361-7551'; root.appendChild(U.outage(['Online booking isn’t available right now. Call ', tel(p), ' to book.'], p)); return; }
    if (st.receipt) {
      // the receipt is a lot to draw at once on a slow phone: its styles are worked out now and its layout with the
      // next frame, so neither task is long; the title takes the focus once it is drawn, and the moment, if it plays,
      // starts then (playSent)
      const sent = renderSent();
      root.appendChild(sent); renderedStep = 0;
      void getComputedStyle(sent).opacity;
      afterFrame(() => { if (!sent.isConnected) return; focusTitle(); if (sent.classList.contains('wait-draw')) playSent(sent); });
      return;
    }
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
    const last = step === 6, back = step === editFrom && step < 6;
    return el('div.bk-nav',
      // one step back, named for what it does (the bar's Back leaves the booking): "Previous", the step it returns to
      // in its label (the steps' names don't all fit beside Send Request on a 360px phone)
      // Cancel: a fresh request (who is booking stays, as with Book another detail), and the copy kept for a reload is
      // forgotten; the link still goes home. Step 01 opened by Edit on the Summary has no Cancel (it would throw the
      // whole request away): "Summary" is its one button, and the step bar and the top bar's Back the other ways out
      step > 1 ? el('button.btn.btn-glass.bk-prev', { type: 'button', 'aria-label': 'Previous step: ' + STEPS[step - 2].n + ', ' + STEPS[step - 2].name, onclick: () => go(step - 1) }, el('span.arrow.back', { 'aria-hidden': 'true' }, '←'), 'Previous') : back ? null : el('a.btn.btn-glass', { href: '#home', onclick: () => reset(true) }, 'Cancel'),
      el('div.bk-nav-mid', { 'aria-live': 'polite', 'aria-atomic': 'true' }, navTotal(null)),
      // after an Edit on the Summary: "Summary", straight back in one tap (one word: the buttons keep one row at 360px)
      el('button.btn.btn-gold.shine', { type: 'button', id: 'bk-next', disabled: busy || holding(), 'aria-busy': holding() ? 'true' : null, 'aria-label': back ? 'Back to the summary' : null, onclick: () => (last ? send() : back ? backToSummary() : next()) },
        last ? 'Send Request' : back ? 'Summary' : 'Continue', el('span.arrow', { 'aria-hidden': 'true' }, '→')));
  }
  // The running total (steps 04 and 05): the database's quote. A changed total turns from the figure it was to the new
  // one in one step (ui.js rollFigure); "Price confirmed before your appointment" simply appears.
  function navTotal(mid) {
    const q = st.quote;
    if (!q || step < 4 || step >= 6) return [];
    if (q.total_cents == null || otherCond()) return [el('span.bk-nav-total.tnum', 'Price confirmed before your appointment')];
    const was = mid && mid.querySelector('.bk-nav-total[data-cents]'), from = was ? Number(was.dataset.cents) : null;
    return [el('span.bk-nav-total.tnum', { dataset: { cents: q.total_cents } }, 'Total ', U.rollFigure(money(q.total_cents), from == null ? null : money(from), q.total_cents > from))];
  }
  // The bar after a change on the same step: the total in place (its line is a live region, so a reader hears the new
  // total once) and Continue following busy (and "Summary" following backToSummary's wait); a new step draws the bar
  // afresh (render)
  function updateNav() {
    const nav = root.querySelector('.bk-nav');
    if (!nav) return;
    const mid = nav.querySelector('.bk-nav-mid'), btn = nav.querySelector('#bk-next');
    const next = navTotal(mid), was = mid && mid.textContent, now = el('div', next).textContent;
    if (mid && now !== was) mid.replaceChildren(...next);   // the same total is not announced again
    if (btn) {
      btn.disabled = busy || holding();
      if (holding()) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    }
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

  // Step 05 waits for its open days to show the first one (revealDays), and watches the page meanwhile (watchTap): a
  // finger, a wheel or a scroll since Continue, or days that come late, and the page stays where it is
  let daysWait = false, daysTap = null;
  // after a refused start time: the page since step 05 came back, so its reason comes into view with the new times
  // only if no finger, wheel or scroll came in between (refusedTap, loadTimes)
  let refusedTap = null;
  function stopDaysWait() { daysWait = false; if (daysTap) { daysTap.end(); daysTap = null; } if (refusedTap) { refusedTap.end(); refusedTap = null; } }
  // A step change: the page is brought to the top of the card first, plainly, so the page never shrinks under a
  // smooth scroll (the footer used to flash on Back); then the new step slides in and its title takes focus.
  // quiet: no reveal of the days (a refused start time brings its reason and the times into view instead)
  function show(n, quiet) {
    if (n !== editFrom) editFrom = null;
    st.direction = n > step ? 1 : -1;
    step = n;
    if (n !== 5) st.when.switching = false;
    window.scrollTo({ top: cardTop(), behavior: 'auto' });
    render();
    if (n === 6) markSummary();
    focusTitle();
    stopDaysWait();
    if (n === 5 && !quiet) { daysTap = watchTap(); revealDays(true); if (!daysWait) stopDaysWait(); }
    drafting = true; saveDraft();   // (a reload now comes back on this step)
  }
  // The step bar can jump past an edit that dropped the quote (a new vehicle type, place or condition): the quote
  // is worked out again first, so the times and the Summary are for what is chosen now.
  async function go(n) {
    if (busy) return;
    if (n >= 5 && mainsChosen() && !st.quote) {
      const q = await refreshQuote();
      if (!st.quote) { show(4); if (q && q.error) showDbError(q.error); return; }
    }
    if (n >= 5) syncWhen();
    show(n);
  }

  async function next() {
    const ok = await validate(step);
    if (!ok) return;
    farthest = Math.max(farthest, step + 1);
    if (step === 3 || step === 4) await refreshQuote();
    await go(step + 1);
  }
  // The step an Edit opened, checked as Continue checks it, then the Summary at once. The quote is worked out again
  // whatever the step (go(6) asks only when there is none, and a change can keep an old one): no service chosen
  // returns at once, an unchanged request comes from the cache. A new length or place asks the kept day for its times
  // before the Summary is drawn (syncWhen), so it shows the start that still fits (or asks for one) from the first
  // frame (a new length chosen while it waits is checked on the Summary, whose title keeps the focus: loadTimes). A tap
  // elsewhere meanwhile (Previous, the step bar) wins: the visitor stays where they went. This button is busy while it
  // works (summing): another tap on it does nothing. The step is checked again after the wait, so a change made
  // meanwhile (both services let go, a field emptied) is refused on its own step, as Continue refuses it, and never
  // reaches the Summary.
  async function backToSummary() {
    const from = step;
    if (busy || summing) return;
    summing = true; updateNav();
    try {
      if (!(await validate(from))) return;
      await refreshQuote();
      if (st.quote) await syncWhen();
      if (step !== from || editFrom !== from) return;
      if (problems(from).length) return validate(from);
      editFrom = null;
      await go(6);
    } finally {
      summing = false; updateNav();
    }
  }

  // ---------------------------------------------------------------- validation per step (the database checks again)
  // The database turns away emoji, web addresses and < > in every text field (public.is_clean_text) with a
  // message about links; the page says what it really is first (D.helpers.textProblem: what to change, or null).
  // Every problem a step has, so they can all be marked at once.
  function problems(n) {
    const c = st.contact, v = st.vehicle, l = st.location, s = st.service, w = st.when, H = D.helpers;
    const out = [];
    const bad = (hint, text) => out.push({ hint, text });
    const plain = (hint, text) => { const why = H.textProblem(text); if (why) bad(hint, why); };
    if (n === 1) {
      if (!H.isValidName(c.first)) bad('first_name', 'Enter your first name using letters only.');
      if (c.last.trim() && !H.isValidName(c.last)) bad('last_name', 'Enter your last name using letters only, or leave it empty.');
      // a guest's ten digits (or 1 and ten) that no number can have: said so, not asked for ten digits again
      const d = String(c.phone || '').replace(/\D/g, '');
      if (!H.normalizePhone(c.phone)) bad('phone', guest() ? (d.length === 10 || (d.length === 11 && d[0] === '1') ? 'That doesn’t look like a number we can reach. Please check the digits.' : 'Enter a 10-digit US mobile number, so we can reach you about the booking.') : 'Enter a 10-digit US phone number.');
      else if (!guest() && !c.phoneConfirmed) bad('phone', c.phoneSent ? 'Enter the code we texted you, then press Confirm.' : 'Press “Send code” and confirm your phone to continue.');
      if (emailCodes() && c.email.trim() && !H.isValidEmail(c.email)) bad('email', 'Enter a valid email, or leave it empty.');
      else if (emailCodes() && c.email.trim() && c.emailState === 'sent') bad('email', 'Enter the email code, or press Skip.');
    }
    if (n === 2) {
      if (!v.vehicleId) {
        if (v.notSure) { if (!v.description.trim()) bad('vehicle_description', 'Describe the vehicle in a few words (no links).'); else plain('vehicle_description', v.description); }
        else {
          if (!v.make.trim()) bad('vehicle_make', 'Enter the vehicle make.');
          else plain('vehicle_make', v.make);
          if (!v.model.trim()) bad('vehicle_model', 'Enter the vehicle model.');
          else plain('vehicle_model', v.model);
          plain('vehicle_color', v.color);
          if (v.year.trim() && !/^\d{4}$/.test(v.year.trim())) bad('vehicle_year', 'Enter a 4-digit year.');
          if (!v.type) bad('vehicle_type', 'Choose a vehicle type.');
        }
      }
      // the notes: required only with "Other" inside the car (asked on step 04, with an interior service)
      if (otherCond() && !s.notes.trim()) bad('special_request', 'Describe it in a few words.');
      else plain('special_request', s.notes);
      if (!v.damage.length) bad('damage', 'Choose “No known damage” or the damage you know of.');
      const needsNote = menu.options.damage.some((o) => o.requires_note && v.damage.includes(o.code));
      if (needsNote && !v.damageNote.trim()) bad('damage_note', 'Describe the damage in a few words.');
      else plain('damage_note', v.damageNote);
    }
    if (n === 3) {
      if (!l.type) bad('location_type', 'Choose “We come to you” or “Come to us”.');
      if (l.type === 'mobile') {
        if (!l.address.trim()) bad('address', 'Enter the street address where the vehicle will be.');
        else plain('address', l.address);
        if (!/^\d{5}$/.test(l.zip.trim())) bad('address_zip', 'Enter a 5-digit ZIP code.');
        else if (!menu.zips.has(l.zip.trim())) bad('address_zip', zipHint());
      }
    }
    if (n === 4) {
      if (!mainsChosen()) bad('services', 'Choose a bundle, or an exterior and/or an interior service.');
      // the inside of the car: required with an interior service or a bundle (doc 24); "Other" needs its note
      if (hasInterior()) {
        if (!v.conditions.length) bad('conditions', 'Tell us what the inside of the car is like, or choose None.');
        else if (v.conditions.includes('other')) {
          if (!s.notes.trim()) bad('special_request', 'Describe it in a few words.');
          else plain('special_request', s.notes);
        }
      }
    }
    if (n === 5) {
      // no service chosen (the step bar can come here after one was cleared): the date step has no days to offer
      if (!st.quote) bad('start_min', 'Choose a service first.');
      else if (!w.date) bad('service_date', 'Choose a day.');
      else if (w.start == null) bad('start_min', 'Choose one of the start times shown.');
      else if (w.sig !== timeSig()) bad('start_min', 'Your service changed, so check the start time again.');
      else if (!(w.times || []).includes(w.start)) bad('start_min', 'Choose one of the start times shown.');
    }
    return out;
  }
  async function validate(n) {
    // an interior service or a bundle chosen on step 05 (the switch strip) after step 04: its question is on step 04
    if (n === 5 && hasInterior() && !st.vehicle.conditions.length) return flag(4, [{ hint: 'conditions', text: 'Tell us what the inside of the car is like, or choose None.' }]);
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
      found.forEach((p, i) => { if (!showErr(p.hint, p.text, { quiet: many || i > 0 })) toast(typeof p.text === 'string' ? p.text : 'Please check this step.'); });
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
      el('ul', found.map((p) => el('li', el('button.link', { type: 'button', dataset: { hint: p.hint }, onclick: () => showErr(p.hint, p.text) }, labelOf(p.hint))))));
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
      setTimeout(() => { if (!showErr(hint, text)) toast(text); }, 50);
      return false;
    }
    // a refusal that belongs to no step's field (a limit with the number to call, or a request already sent with
    // another phone: hint request_id) stays on the summary; elsewhere, a toast
    if (!showErr(target ? hint : 'submit', text)) toast(text);
    return false;
  }
  // A refusal shown on its field (showError), except the inside of the car: centred in the window as the others are,
  // its six cards come out taller than the band the two bars leave clear on a small phone, and step 04's sticky bar
  // (with the total) is taller than step 02's, so its message fell under the bar. It is placed in that band instead:
  // the question centred where it fits, else its message at the foot of the band with as much of the question above
  // it as fits. (Continue on 04, Continue from 05, Send, and a refusal from the database with that hint.)
  function showErr(hint, text, opts) {
    if (hint !== 'conditions' || (opts && opts.quiet)) return showError(root, hint, text, opts);
    if (!showError(root, hint, text, { quiet: true })) return false;
    const w = root.querySelector('[data-field="conditions"]'), m = w.querySelector('.choice-msg');
    const s = sight(), f = w.getBoundingClientRect(), r = m.getBoundingClientRect();
    const by = r.bottom - f.top <= s.bottom - s.top ? (f.top + r.bottom - s.top - s.bottom) / 2 : r.bottom - s.bottom;
    if (Math.abs(by) >= 1) window.scrollBy({ top: Math.round(by), behavior: reduce ? 'auto' : 'smooth' });
    const first = w.querySelector('button:not(:disabled)');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 300);
    return true;
  }

  // ---------------------------------------------------------------- 01 Contact
  const emailHint = () => (st.contact.emailState === 'confirmed' ? 'Confirmed ✓' : st.contact.emailState === 'skipped' ? 'We’ll contact you by phone.' : 'For your confirmation. Phone is enough if you prefer.');
  function stepContact() {
    const c = st.contact;
    const box = el('div.bk-grid');
    const signed = session && session.phoneConfirmed && c.phoneConfirmed;
    if (signed) box.appendChild(el('p.bk-note.ok', 'Signed in as ', el('b', [c.first, c.last].filter(Boolean).join(' ') || phonePretty(c.phone)), '. ', el('button.link', { type: 'button', onclick: notYou }, 'Not you?')));

    box.appendChild(el('div.bk-row.two',
      field({ id: 'first_name', label: 'First name', required: true, value: c.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { c.first = e.target.value; clearError(root, 'first_name'); } }),
      field({ id: 'last_name', label: 'Last name', optional: true, value: c.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { c.last = e.target.value; clearError(root, 'last_name'); } })));

    // A guest: the phone as typed, for the owner to call or text to confirm (no code until text codes work). A number
    // that can exist is read back under the field, so a wrong digit shows before the request goes (no tick: nothing is
    // confirmed). The line is a status, so it is written only when what it says changes, never on every key: clearError
    // rewrites it, so it runs only while an error shows. The hint follows the line, for clearError to put back.
    if (guest()) {
      const phoneHint = () => {
        const n = D.helpers.normalizePhone(c.phone);
        return n ? 'We’ll call or text ' + phonePretty(n) + ' to confirm your booking.' : 'We’ll call or text this number to confirm your booking.';
      };
      const phoneField = field({
        id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel', value: c.phone,
        hint: phoneHint(),
        oninput: (e) => {
          c.phone = e.target.value;
          if (phoneField.classList.contains('has-error')) clearError(root, 'phone');
          const msg = phoneField.querySelector('.fld-msg'), hint = phoneHint();
          if (msg.dataset.hint !== hint) { msg.dataset.hint = hint; msg.textContent = hint; }
        },
      });
      box.appendChild(phoneField);
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
      trailing: c.phoneConfirmed ? el('span.fld-ok', tick()) : miniBtn(c.phoneSent ? 'Resend' : 'Send code', sendPhone, { id: 'bk-send-code' }),
    });
    if (c.phoneConfirmed) phoneField.input.readOnly = true;
    box.appendChild(phoneField);
    if (c.phoneSent && !c.phoneConfirmed) {
      box.appendChild(field({
        id: 'phone_code', label: 'Code from the text', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, hint: D.isLive ? 'Didn’t get it? Check the number and press Resend.' : 'Preview: any 6 digits work.',
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
        trailing: c.emailState === 'confirmed' ? el('span.fld-ok', tick()) : (c.email.trim() && c.emailState === 'none' ? miniBtn('Send code', sendEmail) : null),
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
    editFrom = null; // someone else now: Continue walks through the vehicle again rather than straight back to the Summary
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
      c.phoneConfirmed = true; signedInHere = true;
      if (session && session.firstName && !c.first) c.first = session.firstName;
      try { st.vehicle.saved = await D.myVehicles(); } catch (e) { /* none */ }
      render(); drawTick('phone'); toast('Phone confirmed');
    } catch (e) { showError(root, e.hint || 'phone_code', e.message); }
  }
  // The tick of a field the database just confirmed draws itself once (a later drawing of the step shows it set)
  function drawTick(hint) { const t = root.querySelector('[data-field="' + hint + '"] .fld-ok'); if (t) flash(t, 'draw', 700); }
  async function sendEmail() {
    const c = st.contact;
    if (!D.helpers.isValidEmail(c.email)) return showError(root, 'email', 'Enter a valid email, or leave it empty.');
    if (!(await D.emailAllowed(c.email))) return showError(root, 'email', 'Use a regular email address, not a throwaway one, or leave it empty.');
    if (!c.phoneConfirmed) return showError(root, 'phone', 'Confirm your phone first.');
    try { await D.sendEmailCode(c.email); c.emailState = 'sent'; render(); }
    catch (e) { c.emailState = 'skipped'; render(); toast(e.message); }
  }
  async function confirmEmail(code) {
    try { await D.verifyEmailCode(st.contact.email, code); st.contact.emailState = 'confirmed'; render(); drawTick('email'); toast('Email confirmed'); }
    catch (e) { showError(root, e.hint || 'email_code', e.message); }
  }

  // ---------------------------------------------------------------- 02 Vehicle
  // the notes' hint, on step 02 and under "Other" on step 04
  const NOTES_HINT = 'Bugs, tar, odors, anything unusual. We price special requests ourselves. No links, please.';
  // What we must know first (the vehicle, its type and size, known damage, the notes); the modifications and photos
  // fold away under "Modifications and photos", optional. In two titled parts: A the car, B before we start. The inside
  // of the car is asked on step 04, only with an interior service or a bundle (condsBlock).
  const part = (no, title, kids) => el('section.bk-part', { 'aria-labelledby': 'bk-part-' + no },
    el('h2.bk-part-h', { id: 'bk-part-' + no }, el('span.bk-part-no', { 'aria-hidden': 'true' }, no), title), el('div.bk-grid', kids));
  function stepVehicle() {
    const v = st.vehicle;
    const box = el('div.bk-grid.bk-parts');
    const carBox = [], before = [];
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
        el('label.bk-toggle', el('input', { type: 'checkbox', checked: v.notSure, onchange: (e) => { v.notSure = e.target.checked; invalidateQuotes(); render(); } }), el('span', 'Not sure? Type here')),
        v.notSure ? field({ id: 'vehicle_description', label: 'Describe the vehicle', required: true, value: v.description, maxlength: 1000, oninput: (e) => { v.description = e.target.value; clearError(root, 'vehicle_description'); } }) : null));
      carBox.push(choices({
        id: 'vehicle_size', label: 'Size', value: v.size, items: [
          { code: 'standard', label: 'Standard', sub: 'Most cars, crossovers, SUVs and trucks' },
          { code: 'xl', label: 'XL', sub: 'Minivans and some modified trucks, such as a Raptor. We confirm the price before your appointment.' }],
        onchange: (code) => { v.size = code; invalidateQuotes(); },
      }));
    }

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
    // The notes: optional, unless "Other" was chosen for the inside of the car (step 04, with an interior service)
    before.push(field({ id: 'special_request', label: 'Anything we should know?', optional: !otherCond(), required: otherCond(), multiline: true, rows: 3, maxlength: 1000, value: st.service.notes,
      hint: NOTES_HINT,
      oninput: (e) => { st.service.notes = e.target.value; clearError(root, 'special_request'); } }));

    // Modifications (of a vehicle typed in; a saved one carries its own) and photos, folded
    const more = el('div.bk-more-body',
      v.vehicleId ? null : choices({ id: 'modifications', label: 'Modifications', hint: 'For preparation only. Never a fee.', size: 'tile', multi: true, value: v.modifications, items: menu.options.modification.map((o) => ({ code: o.code, label: o.label })), onchange: (vals) => { v.modifications = vals; } }),
      guest() ? el('p.bk-note', 'Photos are optional and not needed to book.') : el('div.bk-photos', { dataset: { field: 'photos' } },
        el('p.choice-label', 'Photos', el('small', ' optional · up to 6')),
        el('div.bk-photo-grid', { id: 'bk-photo-grid' },
          v.photos.map((p) => el('figure.bk-photo', el('img', { src: p.url, alt: '', width: 96, height: 96 }), el('button.bk-photo-x', { type: 'button', 'aria-label': 'Remove photo', onclick: async () => { await D.removePhoto(p.name).catch(() => {}); v.photos = v.photos.filter((x) => x !== p); render(); } }, '×'))),
          v.photos.length < 6 ? el('label.bk-photo-add', el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, onchange: addPhotos }), el('span', '+'), el('span.small', 'Add')) : null),
        el('p.choice-msg', { role: 'status', dataset: { hint: 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.' } }, 'JPEG, PNG or WebP, 8 MB each. Location data is removed before upload.')));
    before.push(el('details.bk-more', { open: v.moreOpen || v.photos.length > 0 || v.modifications.length > 0, ontoggle: (e) => { v.moreOpen = e.target.open; } },
      el('summary', el('span', v.vehicleId ? 'Photos' : guest() ? 'Modifications' : 'Modifications and photos', el('small', ' optional'))), more));
    box.append(part('A', 'The car', carBox), part('B', 'Before we start', before));
    return box;
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
      // a ZIP in the service area (the database's own list) takes the tick at the end of its field
      const zip = field({ id: 'address_zip', label: 'ZIP', required: true, inputmode: 'numeric', autocomplete: 'postal-code', maxlength: 5, value: l.zip,
        trailing: el('span.fld-ok.zip-ok', tick()),
        oninput: (e) => { l.zip = e.target.value.replace(/\D/g, '').slice(0, 5); e.target.value = l.zip; clearError(root, 'address_zip'); paintZip(root.querySelector('#address_zip-msg'), true); } });
      const zipMsg = zip.querySelector('.fld-msg');
      zipMsg.classList.add('addr-msg');
      box.appendChild(el('div.bk-row.addr',
        field({ id: 'address', label: 'Street address', required: true, autocomplete: 'street-address', value: l.address, maxlength: 300, oninput: (e) => { l.address = e.target.value; clearError(root, 'address'); } }),
        zip, zipMsg));
      paintZip(zipMsg, false, zip);
    }
    return box;
  }
  function paintZip(m, typed, f) {
    if (!m) return;
    const ok = menu.zips.has(st.location.zip);
    f = f || root.querySelector('[data-field="address_zip"]');
    m.replaceChildren(); U.append(m, [zipHint()]);
    m.classList.toggle('is-ok', ok);
    if (!f) return;
    const was = f.classList.contains('is-ok');
    f.classList.toggle('is-ok', ok);
    if (ok && !was && typed) drawTick('address_zip');
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
          el('span.svc-opt-check', { 'aria-hidden': 'true' }, tick(), 'Selected'));
        list.appendChild(card);
      });
      wrap.appendChild(el('section.svc-group-pick', el('h2.bk-h2', title, el('small', sub)), list));
    });
    box.appendChild(wrap);
    // the inside of the car, under the Interior group: shown while an interior service or a bundle is chosen (drawn
    // already shown, as the step lands, it is not brought into view: condsAsk)
    condsAsk = false;
    box.appendChild(condsBlock());

    // Suggestion slot, add-ons and the breakdown
    box.appendChild(el('div', { id: 'bk-suggest' }));
    box.appendChild(addonsBlock());
    box.appendChild(el('div.bk-summary-card', { id: 'bk-price' }));
    setTimeout(updatePrices, 0);
    wave();
    // the service brought from the Services page lights up once, as the step lands, where it can be seen; below the
    // fold (a phone) its note offers "See it", and the light plays once the card is in sight
    if (s.glow) { s.glow = false; setTimeout(litOnce, 380); }
    return box;
  }
  // The inside of the car (doc 24): mandatory with an interior service or a bundle, with the fees that apply to them.
  // Hidden while the request has no interior (paintMains shows and hides it in place); the answer is kept meanwhile,
  // so choosing an interior again brings it back. "Other" adds its note under the cards (otherField).
  function condsBlock() {
    const v = st.vehicle;
    const feeOf = (o) => o.fee_code ? svc(o.fee_code) : null;
    return el('div.bk-grid', { id: 'bk-conds', hidden: !hasInterior() },
      choices({
        id: 'conditions', label: 'What’s the inside of the car like?', required: true, multi: true, value: v.conditions,
        hint: 'Choose everything that applies, or None. Fees apply with an interior service; Interior Deluxe and the Full Detail Bundle include the lighter ones.',
        items: menu.options.condition.map((o) => {
          const f = feeOf(o);
          const sub = o.code === 'heavy_stains' ? 'If your car’s condition is similar to the one listed, you may select it. If the selection turns out to be inaccurate, you will be charged ' + money(f.base_price_cents) + '.'
            : o.code === 'other' ? 'Toothpaste, coffee, anything unusual: tell us in the notes below and we’ll price it.' : null;
          return {
            code: o.code, label: o.label, exclusive: !!o.is_none, sub,
            priceText: f ? '+' + money(f.base_price_cents) : (o.is_none ? 'No fee' : (o.sends_to_review ? 'We price it' : null)),
            cls: sub ? null : 'short',   // a card with no note is short: the short ones sit side by side
          };
        }),
        onchange: (vals) => { v.conditions = vals; invalidateQuotes(); updatePrices(); paintOther(); },
      }),
      v.conditions.includes('other') ? otherField() : null);
  }
  // "Other": its note, required, under the cards (the same notes as step 02's field; only one of the two is ever on
  // the page)
  const otherField = () => field({ id: 'special_request', label: 'Tell us about it', required: true, multiline: true, rows: 3, maxlength: 1000, value: st.service.notes,
    hint: NOTES_HINT,
    oninput: (e) => { st.service.notes = e.target.value; clearError(root, 'special_request'); } });
  // "Other" chosen or let go of: its note comes or goes, in place; just chosen, the note takes the focus
  function paintOther() {
    const box = root.querySelector('#bk-conds');
    if (!box) return;
    const want = st.vehicle.conditions.includes('other'), had = box.querySelector('[data-field="special_request"]');
    if (want && !had) { const f = otherField(); box.appendChild(f); f.input.focus(); }
    else if (!want && had) { clearError(root, 'special_request'); had.remove(); }
  }
  const carriedCard = () => st.service.carried && root.querySelector('.svc-opt.on[data-code="' + st.service.carried + '"]');
  // A chosen card's moment, one line of light: the head of light runs its rim once (.glow), and as it comes round the
  // same light crosses once inside the price's figures (app.js's queue; the customer's own pick, now, waits for no
  // shine). One card at a time: a second pick cuts the first card's light short. A card let go of before its turn, or
  // a price still loading, takes no light.
  let lit = null;   // the card whose moment is playing: { card, fig, off }
  function glowOnce(b, now) {
    cancelGlow();
    flash(b, 'glow', 1400, '::after');
    const L = window.AlchemistLight;
    if (!L || L.off) return;
    const it = { card: b, fig: null };
    const onEnd = (e) => { if (e.target === b && e.pseudoElement === '::after') go(); };
    const t = setTimeout(go, 1150);
    it.off = () => { clearTimeout(t); b.removeEventListener('animationend', onEnd); };
    function go() {
      if (lit !== it) return;
      it.off();
      const fig = b.isConnected && b.classList.contains('on') && b.querySelector('.svc-fig');
      if (!fig) { lit = null; return; }
      it.fig = fig;
      L.pass(fig, { now: !!now, when: () => b.classList.contains('on') && fig.isConnected, miss: () => { if (lit === it) lit = null; } });
    }
    b.addEventListener('animationend', onEnd);
    lit = it;
  }
  function cancelGlow(only) {
    const it = lit;
    if (!it || (only && it.card !== only)) return;
    lit = null;
    it.off();
    it.card.classList.remove('glow');
    if (it.fig && window.AlchemistLight) window.AlchemistLight.stop(it.fig);
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
    // (the verb for the pointer, as the CSS's .tap-only and .click-only)
    if (s.carried && mainCodes().includes(s.carried)) out.push(el('p.bk-quiet', { dataset: { carried: s.carried } }, el('span', svc(s.carried).name + ' was chosen on the Services page.', el('span.tap-only', ' Tap another card to change it.'), el('span.click-only', ' Click another card to change it.'))));
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
    return [el('span.svc-fig', money(p.base)),
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
  let lastOn = null;   // the card a pick just lit (paintMains): the bundle note never moves it out of sight (revealNote)
  // the inside-of-the-car question just shown by a pick (paintMains) and not yet brought into view: the pick's quote,
  // landing, may bring it in (revealConds)
  let condsAsk = false;
  // The cards follow the chosen services in place (the one just chosen lifts once and a rim of light runs
  // around it once, then stays lit; focus and scroll stay where they are); add-on availability changes with
  // the mains, so that block is rebuilt, then the prices and the breakdown follow.
  function paintMains() {
    const s = st.service;
    clearError(root, 'services');
    if (s.carried && !mainCodes().includes(s.carried)) s.carried = null;   // changed here: the customer's own pick now
    const notes = root.querySelector('#bk-carried'); if (notes) notes.replaceChildren(...carriedNotes());
    lastOn = null;
    root.querySelectorAll('.svc-opt').forEach((b) => {
      const on = [s.bundle, s.exterior, s.interior].includes(b.dataset.code);
      const was = b.classList.contains('on');
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (on && !was) { lastOn = b; flash(b, 'just', 700); glowOnce(b, true); }
      else if (was && !on) cancelGlow(b);   // its light goes with it
    });
    // the inside of the car follows the interior, in place (its answer is kept while it is hidden); hidden, what it
    // asked for no longer applies; just shown, it may be brought into view (condsAsk)
    const conds = root.querySelector('#bk-conds');
    if (conds) {
      const was = conds.hidden;
      conds.hidden = !hasInterior();
      if (conds.hidden) { condsAsk = false; clearError(root, 'conditions'); clearError(root, 'special_request'); }
      else if (was) condsAsk = true;
    }
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
    // from the pick (or the add-on) until the quote lands: may the page move for the question or the bundle note (below)?
    const tap = watchTap();
    let q;
    try {
      // a card's price is drawn again only when it changed, so a figure taking the light is never swapped under it
      await mainPrices((code) => {
        const elp = root.querySelector('#price-' + code), next = el('span', priceNodes(code));
        if (elp && !(elp.firstChild && elp.textContent === next.textContent)) elp.replaceChildren(...next.childNodes);
      });
      const wrap = root.querySelector('.bk-services'); if (wrap) wrap.removeAttribute('aria-busy');
      q = await refreshQuote();
    } finally { tap.end(); }
    if (q === STALE) return;   // a newer pick paints when its quote lands
    const ask = condsAsk; condsAsk = false;
    const box = root.querySelector('#bk-price'); const sug = root.querySelector('#bk-suggest');
    updateNav();
    if (!box) return;
    // the bundle note appearing after a pick (not as the step lands with it) is brought into view, once: on a phone
    // it would open under the sticky bar, below the cards (revealNote). Only if the page stayed still and the quote
    // came soon (watchTap): never under a finger put down meanwhile (doc 35); then the note simply waits under the cards
    const fresh = !!(sug && sug.dataset.painted && !sug.firstChild);
    if (sug) sug.dataset.painted = '1';
    // the inside-of-the-car question just shown by the pick comes first, under the same guard (revealConds); one move
    // per pick: when it moved the page, the bundle note waits under it
    const moved = ask && tap.still() && revealConds();
    if (!q) { box.replaceChildren(el('p.bk-muted', 'Choose a service to see the price.')); if (sug) sug.replaceChildren(); return; }
    if (q.error) { box.replaceChildren(el('p.bk-muted', q.error.message)); if (sug) sug.replaceChildren(); return; }
    box.replaceChildren(priceLines(q, { withTime: true, otherCondition: otherCond() }));
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
        if (fresh && !moved && tap.still()) revealNote(sug.firstChild);
      }
    }
  }
  // The inside-of-the-car question, just shown by a pick, opens under the cards: on a phone under the sticky bar, where
  // nothing shows that it came. Its title is brought into view, about 12px over the sticky bar, by the smallest move,
  // never so far that the card just tapped goes under the floating top bar; where that leaves the title still hidden,
  // the page stays where it is (Continue then brings the question). Nothing moves when the title is in sight already.
  // Says whether the page moved.
  function revealConds() {
    const label = root.querySelector('#bk-conds:not([hidden]) .choice-label');
    if (!label) return false;
    const s = sight(), r = label.getBoundingClientRect();
    if (r.bottom <= s.bottom) return false;
    const cap = lastOn && lastOn.isConnected ? lastOn.getBoundingClientRect().top - s.top : Infinity;
    let by = r.bottom - (s.bottom - 12);
    if (by > cap) { if (r.bottom - cap > s.bottom) return false; by = cap; }
    if (by < 1) return false;
    window.scrollBy({ top: Math.round(by), behavior: reduce ? 'auto' : 'smooth' });
    return true;
  }
  // The bundle note comes into view just over the sticky bar. The inside-of-the-car question sits between the cards and
  // the note (a bundle note always comes with an interior service, so it shows): the page never moves so far that the
  // question's title, or the card just tapped, goes under the floating top bar. Where the note can't come in with both
  // still in sight (a phone: the question is taller than the screen leaves), the page stays where it is and the note
  // waits under the question.
  function revealNote(note) {
    const label = root.querySelector('#bk-conds:not([hidden]) .choice-label');
    if (!label) return note.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    const s = sight(), by = note.getBoundingClientRect().bottom - s.bottom;
    const room = Math.min(label.getBoundingClientRect().top, lastOn && lastOn.isConnected ? lastOn.getBoundingClientRect().top : Infinity) - s.top;
    if (by > 0 && by <= room) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
  }

  // ---------------------------------------------------------------- 05 Date and time
  // The service, the strip that changes it (open: beside the calendar on a wide screen, a row of tiles over it on a
  // phone), the owner's note and the calendar, then the times
  function stepWhen() {
    syncWhen();
    const w = st.when, q = st.quote;
    switchBack = null;
    const box = el('div.bk-grid.bk-when', { class: w.switching ? 'switching' : null });
    // no quote (no service chosen, or it couldn't be priced): nothing to look up times for
    if (!q) {
      box.appendChild(el('div.bk-chosen', { dataset: { field: 'start_min' } }, el('div', el('span.eyebrow', 'Your service'), el('b', 'Choose a service first'), el('p.choice-msg', { role: 'status' })), el('button.link', { type: 'button', onclick: () => go(4) }, 'Choose')));
      return box;
    }
    box.append(chosenBlock(), switchStrip());
    const today = D.helpers.todayIn(settings.timezone);   // the booking window counts from Parker's today, not the browser's
    const first = D.helpers.addDays(today, settings.min_days_ahead), last = D.helpers.addDays(today, settings.max_days_ahead);
    if (!w.month) w.month = new Date(first.getFullYear(), first.getMonth(), 1);
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
      stopDaysWait();   // the visitor is choosing a month: the page stays where it is
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
    cal.appendChild(el('div.cal-head', prevBtn, title, nextBtn));
    cal.appendChild(grid);
    cal.appendChild(el('div.cal-keys', el('span.cal-key.open', 'Available'), el('span.cal-key.full', 'Full')));
    cal.appendChild(el('p.choice-msg', { role: 'status' }));
    main.appendChild(cal);
    box.appendChild(el('div.times', { id: 'bk-times', dataset: { field: 'start_min' } }, timesBlock(false)));
    paintMonth();
    // a day chosen whose times aren't here (a refusal cleared them): fetched again, never 'Checking times…' for good
    if (w.date && w.times == null) loadTimes();
    wave();
    return box;
  }
  // The service on the date step (the owner's §23: "I want this service, but actually Thursday doesn't work"): its
  // name, length and total, and Change, which opens the six services as small Table tiles beside the calendar
  const chosenNames = () => (st.quote ? st.quote.lines.filter((l) => !l.included && !l.condition).map((l) => l.name).join(' + ') : '');
  const chosenMeta = () => { const q = st.quote; return !q ? '' : 'About ' + minutesText(q.duration_min) + (q.total_cents != null && !otherCond() ? ' · ' + money(q.total_cents) : ' · price confirmed by us'); };
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
  // (loadCalendar), so it waits for them once (wait, daysWait), and moves only if the page stayed still and they came
  // soon (daysTap); a month change never moves the page.
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
  // (the verb for the pointer: Click with a mouse, Tap otherwise, as the CSS's .tap-only and .click-only)
  const swHint = () => 'An exterior and an interior can go together; a bundle stands alone.' + (mainCodes().length > 1 ? ' ' + (matchMedia('(hover: hover) and (pointer: fine)').matches ? 'Click' : 'Tap') + ' a lit tile to take it off.' : '');
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
    else { mainPrices(price); wave(); }
    const notes = root.querySelector('#bk-sw-notes');
    if (notes) notes.replaceChildren(...st.service.addons.filter((a) => !canHaveAddon(a))
      .map((a) => el('p.bk-quiet', svc(a).name + ' goes with ' + waitsFor(a) + ', so it is left off for now.')),
      // an interior service or a bundle chosen here, with the inside of the car not answered yet: its question is on 04
      ...(hasInterior() && !st.vehicle.conditions.length ? [condsLink()] : []));
  }
  // To step 04's question on the inside of the car: the step, then the question brought into view and focused
  const condsLink = () => el('button.link', { type: 'button', onclick: async () => {
    await go(4);
    const c = step === 4 && root.querySelector('#bk-conds:not([hidden])');
    if (!c) return;
    c.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    const first = c.querySelector('.choice-item');
    if (first) first.focus({ preventScroll: true });
  } }, 'Tell us what the inside of the car is like ', el('span.arrow', { 'aria-hidden': 'true' }, '→'));
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
      toast(q && q.error ? q.error.message : 'Couldn’t load that service’s price. Try again.');
      return;
    }
    updateNav();
    const n = root.querySelector('#bk-chosen-name'), m = root.querySelector('#bk-chosen-meta');
    if (n) n.textContent = chosenNames();
    if (m) m.textContent = chosenMeta();
    syncWhen();   // (the chosen day's times asked again for this length: a start kept only if it still fits)
    loadCalendar();
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
      out.push(el('button.cal-day', { type: 'button', class: cls + (w.date === iso ? ' on' : ''), disabled: !inWindow || avail === false, dataset: { iso, l: d }, 'aria-pressed': w.date === iso ? 'true' : 'false', 'aria-label': longDate(iso) + (avail === false ? ', full' : ''), onclick: () => pickDay(iso) }, el('span', d)));
    }
    // the rest of the last week from the next month (the owner, Oct 11), then empty places: the grid is always six
    // weeks tall, so it never changes height between months, with no extra week of days that can't be picked
    const tail = (7 - (firstDow + daysIn) % 7) % 7;
    for (let i = 1; i <= tail; i++) out.push(other(new Date(yr, mo + 1, i)));
    for (let i = firstDow + daysIn + tail; i < 42; i++) out.push(el('span.cal-pad', { 'aria-hidden': 'true' }));
    return out;
  }
  // The free days depend on the length and the place: another service, add-on or place starts the date step
  // afresh (the days and the times checked for the old ones). A day already picked is asked again, and the
  // start picked on it stays only if it still fits (held aside meanwhile, so it is never shown, or sent on, before
  // it is known to fit). Returns that re-check, for a caller that waits for it (backToSummary). A start still held
  // aside by a re-check that a newer change overtook (w.keep) is the one kept.
  function syncWhen() {
    const w = st.when;
    const sig = timeSig();
    if (!sig || w.sig === sig) return;
    const had = w.date, keep = w.start != null ? w.start : w.keep;
    Object.assign(w, { sig, calendar: {}, loaded: null, times: null, start: null });
    if (had) return pickDay(had, keep, true);
  }
  // The open and full days for the month on screen, for this booking's length and place (w.sig is part of the key,
  // and syncWhen empties the days when it changes). Days that arrive for an older booking are dropped.
  async function loadCalendar() {
    const w = st.when, q = st.quote;
    if (!q) return;
    syncWhen();
    const sig = w.sig;
    const today = D.helpers.todayIn(settings.timezone);
    const from = D.helpers.isoDate(w.month > D.helpers.addDays(today, settings.min_days_ahead) ? w.month : D.helpers.addDays(today, settings.min_days_ahead));
    const days = Math.min(62, new Date(w.month.getFullYear(), w.month.getMonth() + 1, 0).getDate() + 7);
    const key = sig + ':' + from + ':' + days;
    if (w.loaded === key) return;
    try {
      const rows = await D.calendar(from, days, q.duration_min, st.location.type);
      if (w.sig !== sig) return;   // the service or place changed while this was on its way
      rows.forEach((r) => { w.calendar[r.day] = r.available; });
      w.loaded = key;
      root.querySelectorAll('.cal-day').forEach((b) => {
        const iso = b.dataset.iso;
        if (!(iso in w.calendar) || b.classList.contains('out')) return;
        b.classList.remove('unknown'); b.classList.toggle('full', w.calendar[iso] === false); b.classList.toggle('open', w.calendar[iso] === true);
        b.disabled = w.calendar[iso] === false;
        b.setAttribute('aria-label', longDate(iso) + (w.calendar[iso] === false ? ', full' : ''));
      });
      if (daysWait) {
        if (step === 5 && daysTap && daysTap.still()) revealDays(false);
        stopDaysWait();
      }
    } catch (e) { toast(e.message); }
  }
  // The chosen day is marked (the gold circle), or none is; the customer's own pick pours (poured)
  function markDay(iso, poured) {
    root.querySelectorAll('.cal-day').forEach((b) => setChosen(b, b.dataset.iso === iso, poured));
  }
  // A chosen day or start time changing hands: the new one's gold pours from the touch (.pour), the one let go of
  // drains (.drain; the CSS). Only the cells that change are touched
  function setChosen(b, on, poured) {
    if (b.classList.contains('on') === on) return;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.remove(on ? 'drain' : 'pour');
    if (reduce) return;
    if (on && poured) holdClass(b, 'pour', 450);
    else if (!on) holdClass(b, 'drain', 220);
  }
  // A class held for a moment, set without a forced reflow (it is new on the node, so its animation starts); holding
  // it again restarts its clock
  const moments = new WeakMap();
  function holdClass(n, cls, ms) {
    const t = moments.get(n) || {};
    clearTimeout(t[cls]);
    n.classList.add(cls);
    t[cls] = setTimeout(() => n.classList.remove(cls), ms);
    moments.set(n, t);
  }
  function paintTimes(fresh) { const t = root.querySelector('#bk-times'); if (t) { t.replaceChildren(...timesBlock(fresh).filter(Boolean)); if (st.when.date && st.when.times == null) wave(); } }
  // The slots still waiting for their figures (the cards' prices, the tiles' prices, the start times' places) share one
  // light: each is told where it sits across the card (--x) and how wide the card is (--w), and their runs keep one
  // beat, so a single band crosses them all (the CSS)
  const WAITING = '.svc-opt-price:empty, .sw-price:empty, .time-ph';
  function wave() {
    if (reduce || !root || !root.querySelector(WAITING)) return;
    requestAnimationFrame(() => {
      const card = root.querySelector('.bk'), slots = Array.from(root.querySelectorAll(WAITING));
      if (!card || !slots.length) return;   // the answers landed first
      const r = card.getBoundingClientRect();
      slots.forEach((n) => { n.style.setProperty('--x', Math.round(n.getBoundingClientRect().left - r.left) + 'px'); n.style.setProperty('--w', Math.round(r.width) + 'px'); });
      let runs = [];
      try { runs = slots.flatMap((n) => n.getAnimations().filter((a) => a.animationName === 'auWave' && a.startTime != null)); } catch (e) { return; }
      if (!runs.length) return;
      const t0 = Math.min(...runs.map((a) => a.startTime));
      runs.forEach((a) => { a.startTime = t0 + Math.floor((a.startTime - t0) / 1800) * 1800; });
    });
  }
  // A day chosen (keep: a start picked before the service or place changed, kept if the day still has it). The
  // customer's own tap pours its gold and, once its times land soon on a page that stayed still, brings them into
  // view (watchTap, revealTimes); a re-check after a change (recheck: syncWhen) only marks it, and never moves the page.
  async function pickDay(iso, keep, recheck) {
    const w = st.when;
    const tap = recheck ? null : watchTap();
    w.date = iso; w.start = null; w.times = null; w.note = null; w.keep = keep == null ? null : keep;
    markDay(iso, !recheck);
    clearError(root, 'service_date'); clearError(root, 'start_min');
    paintTimes(false);
    const landed = await loadTimes(tap);
    if (tap) { tap.end(); if (landed && step === 5 && tap.still()) revealTimes(); }
  }
  // The start times of the chosen day, for the quote's length and the place, painted when they land (unless
  // another day, length or place was chosen meanwhile). One fetch per day and length at a time. True once this
  // call's times are on the date step.
  // tap: the day's tap (pickDay), so a move back to the service never comes under a finger (doc 35)
  async function loadTimes(tap) {
    const w = st.when, iso = w.date;
    if (!iso) return false;
    if (!st.quote) {
      const q = await refreshQuote();
      if (q === STALE || step !== 5) return false;   // a newer service is on its way: its quote asks for the times again (syncWhen)
    }
    if (!st.quote) {   // nothing to measure the times by: back to the service, never under a finger (then the date step says to choose one)
      w.times = [];
      if (!tap || tap.still()) go(4); else render();
      return false;
    }
    const sig = timeSig(), want = iso + ':' + sig;
    if (w.fetching === want) return false;   // already on its way
    w.fetching = want;
    let times;
    try { times = await D.times(iso, st.quote.duration_min, st.location.type); }
    catch (e) { times = []; toast(e.message); }
    if (w.fetching === want) w.fetching = null;
    if (w.date !== iso || timeSig() !== sig) return false;   // another day, length or place was picked meanwhile
    w.times = times;
    if (w.keep != null && w.start == null) {
      if (times.includes(w.keep)) w.start = w.keep;
      else w.note = 'The service length or place changed: please pick a start time again.';
    }
    w.keep = null;
    if (root.querySelector('#bk-times')) {
      paintTimes(true);
      if (refusedTap) { const t = refusedTap, ok = t.still(); refusedTap = null; t.end(); if (ok && step === 5) revealLost(); }
      return true;
    }
    // a step-bar jump to the Summary doesn't wait for this re-check: the Summary is drawn again, so it shows the
    // start that was kept (or asks for one) and never says one thing while Send sends another. Its title keeps the
    // focus it had (or takes it when nothing had it); focus the visitor moved to a control is never sent to the title
    if (step === 6 && !busy && !st.receipt) {
      const a = document.activeElement, had = !a || a === document.body || (root.contains(a) && a.classList.contains('bk-title'));
      render();
      if (had) focusTitle();
    }
    return false;
  }
  // From a tap until its answer lands: whether the page stayed as it was (no finger back on the glass, no wheel, no
  // scroll) and the answer came soon. Only then may the page move for it (a scroll under a finger fights iOS, doc 35).
  // (long: no time limit, for a refused Send, whose reason must come into view however late the answer is)
  function watchTap(long) {
    const y = window.scrollY, at = performance.now();
    let moved = false;
    const on = () => { moved = true; };
    window.addEventListener('touchstart', on, { passive: true });
    window.addEventListener('wheel', on, { passive: true });
    return {
      end: () => { window.removeEventListener('touchstart', on); window.removeEventListener('wheel', on); },
      still: () => !moved && Math.abs(window.scrollY - y) < 2 && (long || performance.now() - at < 600),
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
  // A refused start time (main's showError for start_min, under the design's finger guard): the times' heading down
  // to the reason comes into view under the sticky bar, never so far that the heading goes under the floating bar,
  // and the first start time takes the focus
  function revealLost() {
    const t = root.querySelector('#bk-times');
    const head = t && t.querySelector('.bk-h2'), note = t && t.querySelector('.bk-lost');
    if (!head || !note) return;
    const s = sight();
    const by = Math.min(note.getBoundingClientRect().bottom - s.bottom, head.getBoundingClientRect().top - s.top);
    if (by > 0) window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
    const first = t.querySelector('.time, a[href]');
    if (first) first.focus({ preventScroll: true });
  }
  // The times' place: the chosen day's start times, or what to do first. Every state has its message line, so an
  // error for the start time always has somewhere to show; a note (a refusal, or a start that no longer fits) stays
  // in it until a time or another day is chosen. The times fade in once, as they arrive (fresh): .enter goes when the
  // last one has landed, so a chosen time's pour never restarts the fade.
  function timesBlock(fresh) {
    const w = st.when;
    if (!w.date) return [el('p.bk-muted', 'Pick a day to see start times.')];
    const head = el('h2.bk-h2', longDate(w.date));
    // while they load: the places of the first few start times, the size of real ones, under the gold light's slow
    // pass (the CSS), and the line that says so where "Can't find a time?" will be. A note is the design's quiet
    // gold-dot line just above the message line, which keeps its own words (and so its place for an error)
    const msg = (...fallback) => el('p.choice-msg', { role: 'status' }, fallback);
    const note = w.note ? el('p.bk-lost.has-error', { role: 'status' }, w.note) : null;   // marked as an error, as main's message line
    if (w.times == null) return [head, el('div.times-wait', { 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(() => el('span.time-ph'))), note, msg('Checking times…')];
    if (!w.times.length) return [head, el('p.bk-muted', 'No start times left that day. Pick another day, or call ', tel(phone), '.'), note, msg()];
    const row = el('div.chips', { class: fresh ? 'enter' : null }, w.times.map((m, i) => el('button.choice-item.time', {
      type: 'button', class: w.start === m ? 'on' : '', 'aria-pressed': w.start === m ? 'true' : 'false', 'aria-label': clock(m), dataset: { m, l: clock(m) }, style: { '--t': i },
      onclick: (e) => {
        w.start = m; clearError(root, 'start_min');
        if (w.note) { w.note = null; root.querySelectorAll('.bk-lost').forEach((x) => x.remove()); }
        root.querySelectorAll('.time').forEach((b) => setChosen(b, +b.dataset.m === m, true));
        holdClass(e.currentTarget, 'just', 600);
      },
    }, clock(m))));
    if (fresh) {
      const off = () => row.classList.remove('enter');
      row.lastChild.addEventListener('animationend', off, { once: true });
      setTimeout(off, 450 + Math.min(w.times.length, 6) * 25);
    }
    return [head, row, note, msg('Can’t find a time? Call ', tel(phone), '.')];
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
    // (nothing while a request is on its way: go does nothing then, and the step must not be kept for the next request)
    const edit = (n, what) => el('button.link', { type: 'button', 'aria-label': 'Edit ' + what, onclick: () => { if (busy) return; editFrom = n; go(n); } }, 'Edit');
    const list = (rows) => el('dl.sum-list', rows.filter(Boolean).map(([k, val]) => el('div', el('dt', k), el('dd', val))));
    const sec = (title, n, rows, cls) => el('section.sum', { class: cls || null }, el('div.sum-head', el('h2.bk-h2', title), edit(n, title.toLowerCase())), list(rows));
    const vf = vehicleFacts();
    const vt = (menu.vehicleTypes.find((t) => t.code === vf.type) || {}).name;
    const savedV = savedVehicle();
    // the inside of the car, with an interior service or a bundle (asked on step 04, so it sits under the service lines)
    const condLabels = v.conditions.map((cc) => (menu.options.condition.find((o) => o.code === cc) || {}).label).join(', ');
    const priced = !!q && q.total_cents != null && !otherCond();   // ("Other" inside the car: the owner prices it, doc 46)
    box.appendChild(el('section.sheet', { 'aria-label': 'Your booking' },
      el('div.sheet-top',
        el('div.sheet-when',
          el('div.sheet-k', el('span', 'When')),
          el('p.sheet-date', w.date ? longDate(w.date) : 'Choose a day and a start time'),
          el('p.sheet-time.tnum', el('span', [w.start != null ? clock(w.start) : w.date ? 'Pick a start time' : null, q ? 'about ' + minutesText(q.duration_min) : null].filter(Boolean).join(' · ')), edit(5, 'date and time'))),
        el('div.sheet-total',
          el('div.sheet-k', el('span', priced ? 'Total' : 'Price')),
          el('p.sheet-sum.tnum', { class: priced ? null : 'pending' }, priced ? money(q.total_cents) : 'We confirm the price before your appointment'))),
      el('div.sheet-lines',
        el('div.sheet-k', el('span', 'Service'), edit(4, 'service')),
        q ? priceLines(q, { mark: sigMark, otherCondition: otherCond() }) : el('p.bk-muted', 'Choose a service first'),
        // (not answered yet, after a jump on the step bar: the way to its question)
        hasInterior() ? el('p.sheet-notes', el('span', 'Inside the car'), condLabels || condsLink()) : null,
        s.notes.trim() ? el('p.sheet-notes', el('span', 'Notes'), s.notes.trim()) : null)));
    box.appendChild(el('div.sum-grid',
      sec('Contact', 1, [['Name', [c.first, c.last].filter(Boolean).join(' ')], ['Phone', phonePretty(c.phone) + (c.phoneConfirmed ? ' ✓' : '')], c.email.trim() && !guest() ? ['Email', c.email + (c.emailState === 'confirmed' ? ' ✓' : ' (not confirmed; we’ll use your phone)')] : null]),
      sec('Location', 3, [['Where', l.type === 'mobile' ? 'We come to you · ' + l.address + ', ' + l.zip : 'Come to us · ' + settings.public_area + ' (address comes with your confirmation)']]),
      sec('Vehicle', 2, [
        ['Vehicle', vehicleText()],
        !vf.notSure ? ['Type and size', [vt, vf.size === 'xl' ? 'XL' : 'Standard'].filter(Boolean).join(' · ')] : null,
        ['Known damage', v.damage.map((d) => (menu.options.damage.find((o) => o.code === d) || {}).label).join(', ') + (v.damageNote.trim() ? ' — ' + v.damageNote.trim() : '')],
        !savedV && v.modifications.length ? ['Modifications', v.modifications.map((m) => (menu.options.modification.find((o) => o.code === m) || {}).label).join(', ')] : null,
        v.photos.length ? ['Photos', v.photos.length + ' added'] : null], 'wide')));
    // what pressing Send means, in the booking's own terms (no reply time is promised: nothing alerts the owner yet)
    box.appendChild(el('section.bk-before', { 'aria-labelledby': 'bk-before-h' },
      el('h2.bk-h2', { id: 'bk-before-h' }, 'Before you send'),
      el('ul.bk-terms',
        el('li', heldPastStart(Date.now() + settings.hold_hours * 3600000, w.date, w.start) ? 'Sending holds this time while we review your request.' : 'Sending holds this time for ' + settings.hold_hours + ' hours while we review your request.'),
        el('li', guest() ? 'We’ll call or text you at ' : 'We’ll contact you at ', el('span.tnum', phonePretty(c.phone)), ' to confirm.'),
        el('li', 'You pay in person after your detail: card, Apple Pay or tap to pay, cash, or Zelle.')),
      el('p.bk-muted', 'Questions? Call ', tel(phone), '.')));
    box.appendChild(el('div', { dataset: { field: 'submit' } }, el('p.choice-msg', { role: 'alert' })));
    return box;
  }

  async function send() {
    if (busy) return;
    if (performance.now() - summaryShownAt < SEND_HOLD) return;   // a double tap's second half (summaryShownAt)
    for (const n of [1, 2, 3, 4, 5]) { if (!(await validate(n))) return; }
    busy = true;
    // while the request is on its way: "Sending…" and, after 300ms, a fine light along the button's lower edge (the CSS;
    // twelve runs at most, no percentage: the progress isn't known)
    const btn = root.querySelector('#bk-next');
    if (btn) {
      btn.disabled = true; btn.firstChild.textContent = 'Sending… '; btn.classList.add('sending');
      setTimeout(() => { if (btn.isConnected && busy) btn.appendChild(el('span.au-line.send-line', { 'aria-hidden': 'true' })); }, 300);
    }
    const tap = watchTap(true);   // whether the page stays as it is until the answer (a refusal may then bring its reason into view)
    const veil = document.getElementById('veil');
    if (veil && !reduce) { veil.classList.remove('run'); void veil.offsetWidth; veil.classList.add('run'); }
    try {
      const asGuest = guest();
      const r = await D.submit(payload(), { guest: asGuest });
      tap.end();
      clearDraft();   // (the request is in: a reload no longer brings it back)
      st.receipt = r; st.sentAsGuest = asGuest; st.receiptOther = otherCond();
      saveSent();
      busy = false;
      if (window.AlchemistAccount) window.AlchemistAccount.refresh();
      window.scrollTo({ top: cardTop(), behavior: 'auto' });
      render();
      // a phone confirmed here is signed out once the request is in (audit, flow step 7); a session that was
      // here before (an account, or the owner's console) stays
      if (signedInHere) { try { await D.signOut(); } catch (e) { /* nothing to do */ } session = null; signedInHere = false; }
    } catch (e) {
      busy = false;
      const calm = tap.still();
      tap.end();
      // the time is no longer free: the day stays chosen, its times load again (stepWhen), and the reason stays with them,
      // once, in the note marked as an error (show: step 05 with the design's finger guard; no second copy in the message
      // line). Once the times are back, the reason comes into view and a start time takes the focus, unless a finger,
      // a wheel or a scroll came in since Send (then it is only marked, and nothing moves)
      if (e.code === 'slot_unavailable') {
        const w = st.when; w.start = null; w.times = null; w.loaded = null; w.calendar = {}; w.note = e.message;
        show(5, true);
        if (calm && st.when.times == null) refusedTap = watchTap(true);
        return;
      }
      render();
      showDbError(e);
    }
  }

  // A hold that runs to the request's own start or past it (a next-day request under a 24-hour hold) is not shown as an
  // end time, which would read as held until after the detail has begun: the words say it is held while we review it.
  // The start is the business's own day and minute (Parker's clock, settings.timezone), not the browser's. For the
  // display, and for the calendar file's times (calendarFile).
  function startsAt(date, min) {
    const [y, m, d] = String(date || '').split('-').map(Number);
    if (!y || !m || !d || min == null) return NaN;
    const guess = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone || 'America/Chicago', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      const wall = (t) => { const p = {}; f.formatToParts(new Date(t)).forEach((x) => { p[x.type] = +x.value; }); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); };
      const first = guess - (wall(guess) - guess);   // the zone's wall clock at the guess, against the guess
      return guess - (wall(first) - first);   // and again at that moment itself: right on a day the clocks change too
    } catch (e) { return NaN; }
  }
  function heldPastStart(ends, date, min) { const at = startsAt(date, min); return isFinite(ends) && isFinite(at) && ends >= at; }

  // ---------------------------------------------------------------- Add to calendar (the receipt)
  // The request as one calendar entry (RFC 5545), written from the receipt alone, so a receipt brought back by a
  // reload writes the same file: its times in UTC (the requested start on Parker's clock, startsAt, and its length;
  // iPhone and Google show them in the phone's own zone), the words that it is requested and not confirmed, the
  // reference, the services and how to change it, and where: the customer's own address as typed for a mobile detail,
  // only the public area for "come to us" (our address goes out only with a confirmed booking). Its stamp is the
  // request's own time. No reminder. Null when the receipt lacks any of it (then there is no Add to calendar).
  function calendarFile(r) {
    const start = startsAt(r.service_date, r.start_min), stamp = Date.parse(r.created_at || ''), dur = r.duration_min;
    const ref = String(r.ref || ''), mobile = r.location_type === 'mobile';
    if (!/^[A-Za-z0-9-]+$/.test(ref) || !Number.isInteger(dur) || dur <= 0 || !isFinite(start) || !isFinite(stamp)) return null;
    if (mobile ? !(r.address && r.address_zip) : !settings.public_area) return null;
    const utc = (t) => new Date(t).toISOString().replace(/\.\d+/, '').replace(/[-:]/g, '');   // 20261116T180000Z
    // a text value: no control characters or half characters, a line break as \n, and \ ; , escaped
    const text = (s) => String(s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[\ud800-\udfff]/gu, '\ufffd').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    // a line folded at 75 octets (a continuation line starts with a space), never inside a character or an escape
    const fold = (line) => {
      const out = [];
      let cur = '', n = 0;
      for (const ch of line.match(/\\[\\;,n]|[\s\S]/gu) || []) {
        const c = ch.codePointAt(0), b = ch.length === 2 && ch[0] === '\\' ? 2 : c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
        if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; n = 0; }
        cur += ch; n += b;
      }
      out.push(cur);
      return out.join('\r\n ');
    };
    const services = (r.lines || []).filter((l) => l && l.name && !l.included && !String(l.code || '').startsWith('cond_')).map((l) => l.name);
    const about = ['Reference: ' + ref, services.join(', '), 'Requested, not confirmed yet. We’ll call to confirm. To change or cancel, call ' + phone + '.'].filter(Boolean);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alchemist Detailing//Booking request//EN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + ref + '@thealchemistdetailing.com',
      'DTSTAMP:' + utc(stamp),
      'DTSTART:' + utc(start),
      'DTEND:' + utc(start + dur * 60000),
      'SUMMARY:' + text('Alchemist Detailing (requested, not confirmed)'),
      'DESCRIPTION:' + text(about.join('\n')),
      'LOCATION:' + text(mobile ? r.address + ', ' + r.address_zip : settings.public_area),
      'STATUS:TENTATIVE',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return { text: lines.map(fold).join('\r\n') + '\r\n', name: 'alchemist-' + ref + '.ics' };
  }
  // The file behind Add to calendar, a real link the customer taps (the browser saves it, or an iPhone opens it in
  // Calendar). An iPhone's or iPad's Safari before 26.5 opens a data: link in Calendar; from 26.5 Safari refuses to
  // open data: links, and a calendar-typed Blob opens it instead, which every other browser saves as a file too. The
  // same file keeps its link; a link replaced is let go a minute later (an iPhone may still be reading it).
  let calLink = null;
  function oldIosSafari() {
    const ua = navigator.userAgent;
    const ios = /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);   // (an iPad asks as a Mac)
    const v = /Version\/(\d+)(?:\.(\d+))?.* Safari\//.exec(ua);
    if (!ios || !v || /CriOS|FxiOS|EdgiOS/.test(ua)) return false;
    return +v[1] < 26 || (+v[1] === 26 && +(v[2] || 0) < 5);
  }
  function calendarHref(text) {
    if (calLink && calLink.text === text) return calLink.href;
    if (calLink && calLink.blob) { const old = calLink.href; setTimeout(() => URL.revokeObjectURL(old), 60000); }
    const data = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(text);
    let href = data, blob = false;
    if (!oldIosSafari()) {
      try { href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' })); blob = true; } catch (e) { /* no Blob links here: the data: link */ }
    }
    calLink = { text, href, blob };
    return href;
  }
  // the calendar mark, drawn as the phone mark is (a call button's): a page with its rings and a plus
  function calMark() {
    const s = U.svgEl('svg', { class: 'cal-mark', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(U.svgEl('path', { d: 'M5.5 5.5h13a1.5 1.5 0 0 1 1.5 1.5v11.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5zM4 10h16M8.5 3.5v4M15.5 3.5v4M12 12.5v5M9.5 15h5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  // ---------------------------------------------------------------- Request sent
  // The guest's only record of the booking (no confirmation text yet, no account to look again): what was booked, for
  // which car, when and where, the price lines as the database stored them, the reference set large with Copy, and
  // what happens next, and what is good to know (changes by phone with the reference, our number for their contacts,
  // what mobile needs), and the request for their calendar. It prints or saves to one page through the print
  // stylesheet (neither the calendar nor the contact link prints).
  function renderSent() {
    const r = st.receipt, q = st.quote;
    const holdEnds = r.hold_expires_at && !heldPastStart(new Date(r.hold_expires_at).getTime(), r.service_date, r.start_min) ? new Date(r.hold_expires_at).toLocaleString('en-US', { timeZone: (settings && settings.timezone) || 'America/Chicago', timeZoneName: 'short', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/[ \u202f]([AP]M)(?:[ \u202f](\S+))?$/, (m, ap, tz) => '\u00a0' + ap + (tz ? '\u00a0' + tz : '')).replace(/([A-Z][a-z]{2}) (\d{1,2}),/, '$1\u00a0$2,') : null;   // (Parker's clock, as the appointment's; "10:00 PM CST" never breaks inside)
    const rec = r.lines && r.lines.length ? r : q;   // the database's own lines; the quote as it was sent, failing that
    const rv = r.vehicle;
    const vehicle = (rv && (rv.not_sure ? rv.description : [rv.year, rv.make, rv.model, rv.color && '· ' + rv.color].filter(Boolean).join(' '))) || vehicleText();
    const minutes = r.duration_min || (q && q.duration_min);
    const ref = String(r.ref || '');
    // grouped for reading aloud (AD- then fours); Copy takes the reference exactly as written
    const groups = refGroups(ref);
    // the screen sets itself once (the CSS): the seal pressed and foiled, the title and the reference from behind their
    // lines, the sheet's rows in reading order. Drawn again for the same request, or under reduced motion, it is simply
    // there
    const play = sentDrawn !== r && !reduce;
    sentDrawn = r;
    // (the receipt is the guest's only record: a calendar file that can't be written costs only its button)
    let cal = null;
    try { const f = calendarFile(r); if (f) cal = { href: calendarHref(f.text), name: f.name }; } catch (e) { cal = null; }
    const sheet = el('section.sheet.sent-sheet', { 'aria-label': 'Your booking' },
      el('dl.sum-list',
        // (a phone breaks it after the date: "at 10:30 AM · about 1 h" stays together, so no line starts with the dot or "AM")
        el('div', el('dt', 'When'), el('dd', longDate(r.service_date) + ' at\u00a0' + clock(r.start_min).replace(' ', '\u00a0'), minutes ? ['\u00a0· ', el('span.sent-len', 'about ' + minutesText(minutes))] : null)),
        el('div', el('dt', 'Where'), el('dd', r.location_type === 'mobile' ? 'We come to you · ' + r.address + ', ' + r.address_zip : 'Come to us · ' + settings.public_area + ' — we send the address with your confirmation')),   // in the summary's words
        vehicle ? el('div', el('dt', 'Vehicle'), el('dd', vehicle)) : null),
      rec ? priceLines(rec, { mark: sigMark, otherCondition: st.receiptOther }) : el('p.bk-muted', r.total_cents == null || st.receiptOther ? 'We confirm the price before your appointment' : money(r.total_cents)));
    const sent = el('div.bk.bk-sent', { class: play ? SENT_PARTS.map((x) => 'wait-' + x).join(' ') : null },
      el('div.sent-mark', sentMark()),
      el('p.eyebrow', 'Request received'),
      el('h1.display.bk-title', el('span.sent-line', el('span.sent-line-in', 'Thank you'))),
      el('div.sent-ref',
        el('span.sent-ref-k', 'Reference'),
        el('p.sent-code.tnum', el('span.sent-code-in', groups.map((g) => el('span', g)))),
        miniBtn('Copy', () => copyRef(ref), { 'aria-label': 'Copy the reference ' + ref })),
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing was sent. The reference is made up.') : null,
      sheet,
      el('section.sent-next', { 'aria-labelledby': 'sent-next-h' },
        el('h2.bk-h2', { id: 'sent-next-h' }, 'What happens next'),
        el('ol.sent-steps',
          el('li', el('b', 'Request sent'), el('span.tnum.sent-ref-sm', groups.map((g) => el('span', g)))),   // grouped as the reference above
          el('li', el('b', 'We review it'), el('span', holdEnds ? 'Your time is held until ' + holdEnds : 'Your time is held while we review it')),
          el('li', el('b', st.sentAsGuest ? 'We call or text ' : 'We contact you at ', el('span.tnum', phonePretty(st.contact.phone)), ' to confirm'), el('span', 'You pay in person after your detail: card, Apple Pay or tap to pay, cash, or Zelle.')))),   // step 06's sentence
      // what is good to know: changes by phone (no cancel button, doc 26) with the reference; a guest's number was never
      // confirmed, so a wrong one is named too; our number for their contacts (our card: the name, the number, the
      // website and Instagram, a link on the screen only); a mobile booking keeps step 03's note. On the screen and on
      // paper (the Call button doesn't print: there our number is here only)
      el('section.sent-know', { 'aria-labelledby': 'sent-know-h' },
        el('h2.bk-h2', { id: 'sent-know-h' }, 'Good to know'),
        el('ul.sent-know-list',
          el('li', st.sentAsGuest ? 'Wrong number, or need to change or cancel? Call ' : 'To change or cancel, call ', tel(phone), ' and give your reference ', el('span.tnum.sent-ref-sm', groups.map((g) => el('span', g))), '.'),
          el('li.sent-card', el('a', { href: 'alchemist-detailing.vcf' }, 'Save our number'), ', so you know it’s us when we call.'),
          r.location_type === 'mobile' && settings.mobile_note ? el('li', settings.mobile_note) : null)),
      el('div.bk-actions', { class: cal ? 'with-cal' : null },
        el('a.btn.btn-gold.shine', { href: '#home' }, 'Back to home'),
        // the request in the customer's calendar, as requested (glass: gold is the way to book)
        cal ? el('a.btn.btn-glass.sent-cal', { href: cal.href, download: cal.name }, calMark(), el('span', 'Add to calendar')) : null,
        el('button.btn.btn-glass', { type: 'button', onclick: () => { reset(true); window.scrollTo({ top: cardTop(), behavior: 'auto' }); render(); focusTitle(); } }, 'Book another detail'),
        el('a.btn.btn-glass', { href: 'tel:+1' + phone.replace(/\D/g, '') }, U.telMark(), el('span', 'Call ', el('span.tnum', phone)))),   // the phone mark, as on every call button
      el('button.link.sent-print', { type: 'button', onclick: () => { settle(); window.print(); } }, 'Print or save'));
    return sent;
  }
  // The moment in parts, each started in a task of its own so no one frame carries it all (the CSS): the receipt is
  // built with every part waiting; once it is drawn the seal's marks are drawn unseen, and a frame later the seal
  // starts, and the shines wait for its light; the sheet's rows and drawn hairlines are put in order while it is still
  // hidden; then the head, the sheet's summary, its price lines and what happens next (with what is good to know),
  // each at its time in the moment.
  // Nothing changes when it is over (each part's animation lets go of it as it ends)
  const SENT_PARTS = ['draw', 'seal', 'head', 'sheet', 'lines', 'next'];
  const SENT_AT = { head: 300, sheet: 600, lines: 800, next: 1100 };
  const afterFrame = (f) => requestAnimationFrame(() => setTimeout(f, 0));
  function playSent(n) {
    const waiting = (part) => n.isConnected && n.classList.contains('wait-' + part);   // not printed or left since
    const start = (part) => { if (waiting(part)) n.classList.replace('wait-' + part, 'play-' + part); };
    n.classList.remove('wait-draw');
    afterFrame(() => {
      if (!waiting('seal')) return;
      if (window.AlchemistLight) window.AlchemistLight.hold(2900);
      start('seal');
      setTimeout(() => { if (waiting('sheet')) orderSheet(n); }, 150);
      Object.entries(SENT_AT).forEach(([part, ms]) => setTimeout(() => start(part), ms));
    });
  }
  // The sheet's rows (.sr) set in reading order, 60ms apart (from the sixth on together), the total last; its
  // hairlines become drawn lines (.sr-h) and draw in order
  function orderSheet(n) {
    let k = 0, h = 0, last = 0;
    n.querySelectorAll('.sent-sheet .sum-list > div, .sent-sheet .pr > *').forEach((x) => {
      if (x.matches('.pr-total')) last = Math.min(k, 5) + 1;
      x.classList.add('sr');
      x.style.setProperty('--k', last || Math.min(k++, 5));
    });
    n.querySelectorAll('.sent-sheet > .sum-list, .sent-sheet .pr > .pr-line:not(:first-child), .sent-sheet .pr > .pr-total').forEach((x) => { x.classList.add('sr-h'); x.style.setProperty('--h', h++); });
  }
  // A print (the browser's own, Print or save, or a page printed by a tool) shows the receipt set: the moment stops
  // where it is, and back on the screen it never plays again
  function settle() { const n = root && root.querySelector('.bk-sent'); if (n) n.classList.remove(...SENT_PARTS.flatMap((x) => ['wait-' + x, 'play-' + x])); }
  window.addEventListener('beforeprint', settle);
  const printing = window.matchMedia && window.matchMedia('print');
  if (printing) { const onPrint = (e) => { if (e.matches) settle(); }; if (printing.addEventListener) printing.addEventListener('change', onPrint); else if (printing.addListener) printing.addListener(onPrint); }
  // The seal: the monogram's shape blind-embossed in the panel's own black (lit only along its edges), and over it the
  // gold mark from the symbol in the page, laid in like foil, then one pass of gold light across it (ui.js lightMark:
  // clipped to the mark's own shape; none under reduced motion). The CSS presses and foils it.
  let sentDrawn = null;   // the receipt whose screen has played
  function sentMark() {
    const shape = document.querySelector('#ad-mark path');
    const blind = U.svgEl('svg', { class: 'seal-blind', viewBox: '0 20 570 590', 'aria-hidden': 'true' });
    if (shape) blind.appendChild(U.svgEl('path', { d: shape.getAttribute('d') }));
    const foil = U.svgEl('svg', { class: 'seal-foil', 'aria-hidden': 'true' });
    foil.appendChild(U.svgEl('use', { href: '#ad-mark' }));
    return [blind, U.lightMark(foil, 'sent')];
  }

  window.AlchemistBooking = { mount, offer, get state() { return st; } };
})();
