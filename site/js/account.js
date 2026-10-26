/* Alchemist Detailing — the customer's account (#account) and appointments
   (#appointments), phase 2 (docs 19 and 26). Sign in with a phone code, edit
   the name, keep saved vehicles, see your own bookings. Cancellations and
   changes go through the owner: there is no cancel button, only the phone.
   While guest booking is on (no text codes yet, doc 37) both pages are one
   calm "accounts are coming soon" screen. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, minutesText, clock, longDate, phonePretty, tel, loading, field, choices, roving, priceLines, miniBtn, showError, clearError, toast, refGroups, copyRef } = U;

  let session = null, settings = null, menu = null, phone = '(945) 361-7551';
  let ready = null, confirmT = 0;
  const roots = { account: null, appointments: null };
  const signin = { phone: '', first: '', sent: false, busy: false };
  const acct = { first: '', last: '', vehicles: [], bookings: [], reviews: [], editing: null, form: null, loading: true, confirm: null };
  // light: a booking opened for the first time, whose card takes the gold light once it lands; fold: the cancelled
  // and declined list is open; anchor: the card just pressed and where it was on the screen, so it stays there
  // when another one closes above it
  const appts = { list: null, open: null, reviews: null, form: null, focus: null, light: null, fold: false, anchor: null };
  const lit = new Set();   // the bookings already opened on this visit: the light crosses a card once
  // the 200+ gold rule (doc 22): a completed detail of $200 or more makes the booking, and the customer, Gold
  const isGold = (b) => b.status === 'completed' && b.total_cents != null && b.total_cents >= 20000;
  const isLive = (b) => ['requested', 'needs_information', 'confirmed', 'in_progress'].includes(b.status) && b.service_date >= D.helpers.isoDate(D.helpers.todayLocal());
  const byWhen = (a, b) => (a.service_date === b.service_date ? a.start_min - b.start_min : a.service_date < b.service_date ? -1 : 1);
  const monthOf = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const emailCodes = () => !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.emailCodes);
  const telHref = () => 'tel:+1' + phone.replace(/\D/g, '');
  const arrow = () => el('span.arrow', { 'aria-hidden': 'true' }, '→');
  const whereText = (b) => (b.location_type === 'mobile' ? 'We come to you' : 'Come to us');
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // The owner's Alchemist's Table (services.js): each service's symbol and number, the same map the booking uses.
  // Only these come from there; every price is the database's. Condition fees have no mark.
  const signs = () => (window.AlchemistServices && window.AlchemistServices.signs) || [];
  function sigMark(code, seal) {
    const g = signs().find((x) => x.code === code);
    return g ? el('span.sig', { class: (g.key === 'au' ? 'au' : '') + (seal ? ' seal' : '') || null, 'aria-hidden': 'true' }, el('small.tnum', g.num), g.sym) : null;
  }
  const mains = (b) => (b.lines || []).filter((l) => !l.included && !/^cond_/.test(l.code));
  const names = (b) => mains(b).map((l) => l.name).join(' + ');

  function load() {
    if (ready) return ready;
    ready = (async () => {
      await D.init();
      [settings, menu, session] = await Promise.all([D.settings(), D.menu(), D.session()]);
      phone = settings.public_phone;
    })();
    return ready;
  }
  // The session as the data layer has it now (a booking just sent signs the guest out). The name fields take
  // the session's names on the first load and after a save, never over what is being typed.
  async function refreshSession(names) {
    session = await D.session();
    if (session && (names || acct.loading)) { acct.first = session.firstName || ''; acct.last = session.lastName || ''; }
  }

  // ---------------------------------------------------------------- shells
  function mountAccount(container) { roots.account = container; renderAccount(); }
  function mountAppointments(container) { roots.appointments = container; renderAppointments(); }

  function shell(title, eyebrow, body, examples) {
    return el('div.bk.acct',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing is saved anywhere.' + (D.guestBooking ? '' : ' Any 6-digit code works.') + (examples ? ' The past details are examples.' : '')) : null,
      el('header.bk-head', el('p.eyebrow', eyebrow), el('h1.display.bk-title', title)),
      body);
  }
  const STATUS = {
    requested: ['Requested', 'We\'re reviewing it and will contact you to confirm.'],
    needs_information: ['Needs information', 'We have a question for you. Please call or wait for our text.'],
    confirmed: ['Confirmed', 'See you then.'], in_progress: ['In progress', 'Your detail is under way.'],
    completed: ['Completed', 'Thank you.'], declined: ['Declined', 'We couldn\'t take this one. Call us if you\'d like to try another time.'],
    cancelled: ['Cancelled', ''],
  };

  // ---------------------------------------------------------------- accounts are coming soon (guest booking)
  // What every visitor sees on Account and Appointments until text codes work (Migration 005): the monogram, one
  // line, the two things the site already says (book without an account; call to check, change or cancel), and
  // the two ways on: Book, and Call as a text action. Centred in the page (.book-page:has(.acct-soon)).
  function comingSoon() {
    return el('div.acct-soon',
      !D.isLive ? el('p.bk-preview.draft', el('b', 'Preview'), ' — nothing is saved anywhere.') : null,
      el('span.soon-mark', { 'aria-hidden': 'true', innerHTML: '<svg><use href="#ad-mark"/></svg>' }),
      el('h1.display.soon-title', 'Online accounts are coming soon'),
      el('p.soon-text', 'Until then you can book without one: we call or text you to confirm. To check, change or cancel a booking, call us.'),
      el('div.soon-actions',
        el('a.btn.btn-gold.shine', { href: '#book' }, 'Book a detail', arrow()),
        el('a.acct-go', { href: telHref() }, U.telMark(), el('span', 'Call ', el('span.tnum', phone)))));   // a call carries the phone mark, never an arrow
  }

  // ---------------------------------------------------------------- sign in (shared)
  function signInBox(after) {
    const box = el('div.bk-grid',
      el('p.bk-note', 'Sign in with your mobile number. We text you a 6-digit code; no password.'),
      field({ id: 'si_first', label: 'First name', optional: true, value: signin.first, autocomplete: 'given-name', maxlength: 40, hint: 'Only needed the first time.', oninput: (e) => { signin.first = e.target.value; } }),
      field({ id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', autocomplete: 'tel', value: signin.phone,
        oninput: (e) => { signin.phone = e.target.value; clearError(box, 'phone'); },
        trailing: miniBtn(signin.sent ? 'Resend' : 'Send code', async () => {
          if (!D.helpers.normalizePhone(signin.phone)) return showError(box, 'phone', 'Enter a 10-digit US phone number.');
          try {
            await D.sendPhoneCode(signin.phone, { first: signin.first.trim() }); signin.sent = true; await after();
            setTimeout(() => { const i = document.getElementById('phone_code'); if (i) i.focus(); }, 60);
          } catch (e) { showError(box, e.hint || 'phone', e.message); }
        }) }),
      signin.sent ? field({ id: 'phone_code', label: 'Code from the text', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6,
        hint: D.isLive ? '' : 'Preview: any 6 digits work.',
        oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) confirm(e.target.value); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(e.target.value); } },
        trailing: miniBtn('Confirm', () => confirm(box.querySelector('#phone_code').value)) }) : null);
    async function confirm(code) {
      try { session = await D.verifyPhoneCode(signin.phone, code, { first: signin.first.trim() }); signin.sent = false; await refreshSession(true); toast('Signed in'); after(); }
      catch (e) { showError(box, e.hint || 'phone_code', e.message); }
    }
    return box;
  }

  // ---------------------------------------------------------------- account
  // The owner's dashboard (direction §25): Welcome back and the first name, the Gold client card when it is
  // earned, the next appointment, the garage, the history, and the profile as a quiet section at the end.
  async function renderAccount() {
    const root = roots.account; if (!root) return;
    if (acct.loading) root.replaceChildren(loading('Loading…'));
    await load();
    await refreshSession();
    if (!session) { root.replaceChildren(D.guestBooking ? comingSoon() : shell('Your account', 'Account', signInBox(renderAccount))); return; }
    if (acct.loading) {
      [acct.vehicles, acct.bookings, acct.reviews] = await Promise.all([D.myVehicles().catch(() => []), D.myBookings().catch(() => []), D.myReviews().catch(() => [])]);
      acct.loading = false;
      if (!session) return renderAccount();   // signed out while loading
    }
    const body = el('div.bk-grid');

    // The Gold client card (the owner's design): only for a customer with a completed detail of $200 or more,
    // dated from the first of them (in the preview, its example Full Detail)
    const gold = acct.bookings.filter(isGold).sort(byWhen);
    if (gold.length) body.appendChild(goldSection(monthOf(gold[0].service_date), gold));

    const next = acct.bookings.filter(isLive).sort(byWhen)[0];
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Upcoming appointment'),
      next ? nextCard(next) : el('p.bk-muted', 'Nothing booked yet. ', el('a', { href: '#book' }, 'Book a detail'), '.')));
    body.appendChild(garage());
    body.appendChild(historyBlock());
    body.appendChild(profile());
    const first = (session.firstName || '').trim();   // the saved name: the title doesn't change while it is typed
    root.replaceChildren(shell(first || 'Your account', first ? 'Welcome back' : 'Account', body, acct.bookings.some((b) => b.example)));
  }

  // The next booking as the owner drew it: the day, the date large, the time and where, the services with their
  // marks; the status; the reference with Copy; the way to the whole appointment
  function nextCard(b) {
    const d = new Date(b.service_date + 'T12:00:00');
    return el('article.appt-next', { class: 'st-' + b.status },
      el('div.nx-when',
        el('span.nx-day', d.toLocaleDateString('en-US', { weekday: 'long' })),
        el('b.nx-date', d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })),
        el('span.nx-time', el('span.tnum', clock(b.start_min)), ' · ' + whereText(b)),
        what(b)),
      el('span.appt-status', (STATUS[b.status] || [b.status])[0]),
      el('div.nx-foot',
        el('div.appt-refline', el('span.ref-k', 'Reference'), refValue(b)),
        el('a.btn.btn-glass', { href: '#appointments', onclick: () => { openCard(b.id); appts.focus = b.id; } }, 'View appointment')));
  }
  // the services with their marks; on a gold card a Full Detail's own Au mark is the seal (sealed)
  function what(b, sealed) {
    return el('span.appt-what', el('span.appt-sigs', mains(b).map((l) => sigMark(l.code, sealed && l.code === 'full_detail'))), el('span.appt-names', names(b)));
  }
  // the reference as the database wrote it, grouped for reading aloud, with Copy (which takes it exactly)
  function refValue(b) {
    return [el('span.ref-v.tnum', refGroups(b.ref).map((g) => el('span', g))), miniBtn('Copy', () => copyRef(b.ref), { 'aria-label': 'Copy the reference ' + b.ref })];
  }

  // Saved vehicles as garage cards (direction §21): a generic line drawing for the size of car (never the customer's
  // own car, never another brand's shape; the SUV stands taller, with upright glass and tailgate, ground clearance
  // and roof rails), the name as typed, colour and type, Edit and Remove; Add is a card of its own. Remove asks
  // first, inline, and thinks better of it on its own after five seconds.
  const CAR_ART = (() => {
    const draw = (body, wheels) => '<svg viewBox="0 0 240 84" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke">' + body +
      wheels.map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/><circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.38).toFixed(1) + '" opacity=".6"/>').join('') +
      '<path class="floor" d="M6 72.5H234"/></svg>';
    return {
      car: draw('<path d="M18 58C14 58 13 52 14 49C15 45 20 43 30 42L74 38C90 30 104 22 124 21C150 20 168 25 190 35C204 37 218 38 224 41C227 43 228 48 227 52L226 58H196A18 18 0 0 0 160 58H78A18 18 0 0 0 42 58Z"/>' +
        '<path d="M86 37C98 30 108 25.5 124 25C146 24.5 160 28 176 35.5Z" opacity=".7"/><path d="M134 25L132.5 36.4" opacity=".7"/><path d="M30 47C90 45 170 44 222 45" opacity=".4"/>', [[60, 57, 15], [178, 57, 15]]),
      suv: draw('<path d="M37 51C33.5 51 31 49 31 46V37C31 32.5 32.5 29.6 36 29.2L82 26.5L97.6 10.2C98.6 9.1 100.2 8.4 102 8.4H199C202.6 8.4 204.8 9.8 205.6 12.4L208.6 27.6V46C208.6 49 207 51 204 51H196.6A21 21 0 0 0 155.4 51H84.6A21 21 0 0 0 43.4 51Z"/>' +
        '<path d="M87.5 26L100.4 12.6C101.1 11.9 102 11.5 103 11.5H195.5C197.4 11.5 198.6 12.4 199.1 14.2L202.2 26Z" opacity=".7"/><path d="M141 11.5V26M177 11.5V26" opacity=".7"/><path d="M112 5.2H190M118 5.2V8.4M184 5.2V8.4" opacity=".55"/>' +
        '<path d="M31.5 33C90 32 170 31.5 208 32" opacity=".4"/><path d="M89 46.5H151" opacity=".3"/><path d="M31 42.5H38M208.6 42.5H202" opacity=".35"/>', [[64, 55, 17], [176, 55, 17]]),
      truck: draw('<path d="M12 50C10 50 9 44 10 38C11 32 14 29 22 28L76 25C84 20 90 13 98 10L134 9.5C139 9.5 141 12 141 17L142 29H226C228 29 229 31 229 34V48C229 49.5 228 50 226 50H208.4A21 21 0 0 0 167.6 50H80.4A21 21 0 0 0 39.6 50Z"/>' +
        '<path d="M86 25C91 19 95 15 102 14L132 13.5C135 13.5 136 15 136.3 17L137 25Z" opacity=".7"/><path d="M145 29V48" opacity=".5"/><path d="M149 33.5H225" opacity=".35"/><path d="M20 37C60 35.5 110 35 140 35" opacity=".4"/>', [[60, 55, 17], [188, 55, 17]]),
    };
  })();
  const carClass = (type) => (type === 'truck' ? 'truck' : ['crossover', 'suv', 'minivan', 'large_suv', 'van'].includes(type) ? 'suv' : 'car');
  function garage() {
    const vt = (code) => (menu.vehicleTypes.find((t) => t.code === code) || {}).name || code;
    const startEdit = (v) => { acct.editing = v.id; acct.form = Object.assign({}, v, { year: v.year ? String(v.year) : '' }); renderAccount(); };
    const cards = acct.vehicles.map((v) => el('article.car-card', { class: (acct.editing === v.id ? 'editing' : '') + (acct.confirm === v.id ? ' asking' : '') || null },
      el('span.car-art', { 'aria-hidden': 'true', innerHTML: CAR_ART[carClass(v.vehicle_type)] }),
      el('div.car-main',
        el('h3.car-name', [v.year, v.make, v.model].filter(Boolean).join(' ')),
        el('p.car-meta', [v.color, vt(v.vehicle_type), v.size === 'xl' ? 'XL' : null].filter(Boolean).join(' · '))),
      acct.confirm === v.id
        ? el('div.car-actions', { role: 'alert' }, el('span.veh-ask', 'Remove this vehicle?'),
          el('button.link.danger', { type: 'button', onclick: () => removeVehicle(v) }, 'Yes, remove'),
          el('button.link', { type: 'button', onclick: () => { clearTimeout(confirmT); acct.confirm = null; renderAccount(); } }, 'Keep'))
        : el('div.car-actions',
          el('button.link', { type: 'button', onclick: () => startEdit(v), 'aria-label': 'Edit ' + [v.make, v.model].filter(Boolean).join(' ') }, 'Edit'),
          el('button.link', { type: 'button', onclick: () => askRemove(v), 'aria-label': 'Remove ' + [v.make, v.model].filter(Boolean).join(' ') }, 'Remove'))));
    const add = acct.editing ? null : el('button.car-card.car-add', { type: 'button', onclick: () => { acct.editing = 'new'; acct.form = { make: '', model: '', year: '', color: '', vehicle_type: null, size: 'standard', modifications: [] }; renderAccount(); } },
      el('span.car-plus', { 'aria-hidden': 'true' }, '+'), el('span', 'Add vehicle'));
    return el('section.acct-sec', el('h2.bk-h2', 'Your vehicles'),
      acct.vehicles.length ? null : el('p.bk-muted', 'No saved vehicles yet. Save one and booking gets faster.'),
      cards.length || add ? el('div.garage', cards, add) : null,
      acct.editing ? vehicleForm() : null);
  }

  // History (direction §25): how many details are done, counted from the database's own rows, and the latest one.
  // The total spend in the owner's sketch waits for his word on whether customers see it.
  function historyBlock() {
    const done = acct.bookings.filter((b) => b.status === 'completed').sort(byWhen);
    const last = done[done.length - 1];
    return el('section.acct-sec', el('h2.bk-h2', 'History'),
      done.length
        ? el('div.hist',
          el('p.hist-fig', el('b.tnum', String(done.length)), el('span', done.length === 1 ? 'Completed detail' : 'Completed details')),
          el('p.hist-last', el('span', 'Latest'), longDate(last.service_date) + ' · ' + names(last)),
          el('a.acct-go', { href: '#appointments' }, el('span', 'See your history'), arrow()))
        : el('p.bk-muted', 'No completed details yet. Your appointments are under ', el('a', { href: '#appointments' }, 'Appointments'), '.'),
      el('p.bk-muted', 'To cancel or change a booking, call ', tel(phone), '.'));
  }

  // Profile: the name, the confirmed phone, the email only once the site can email codes or one is on file
  function profile() {
    const root = roots.account;
    const showEmail = emailCodes() || !!session.email;
    return el('section.acct-sec.acct-profile', el('h2.bk-h2', 'Profile'),
      el('div.bk-row.two',
        field({ id: 'first_name', label: 'First name', required: true, value: acct.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { acct.first = e.target.value; clearError(root, 'first_name'); } }),
        field({ id: 'last_name', label: 'Last name', optional: true, value: acct.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { acct.last = e.target.value; clearError(root, 'last_name'); } })),
      el('div.bk-row.two',
        el('div.fld', el('span.fld-label', 'Mobile phone'), el('p.acct-static', el('span.tnum', phonePretty(session.phone || '') || '—'), el('small', ' confirmed ✓'))),
        showEmail ? el('div.fld', el('span.fld-label', 'Email'), el('p.acct-static', session.email || el('span.bk-muted', 'None on file'))) : null),
      el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: saveProfile }, 'Save name'), el('button.link', { type: 'button', onclick: signOut }, 'Sign out')));
  }

  // The Gold client card: the beads texture under a dark gradient, a gold rim, an inner hairline frame, the
  // monogram, the first name in gold, "Gold since" and the Au badge; beside it the owner's two sentences and
  // the two buttons. The card tilts under a mouse (tilt), never under a finger or with reduced motion.
  // Its action follows the reviews: the latest gold detail without one opens on Appointments with the review form;
  // a published one links to Reviews; one waiting says so; with nothing to review there is no action.
  function goldAction(gold) {
    const mine = (id) => acct.reviews.find((r) => r.appointment_id === id);
    const todo = gold.slice().reverse().find((b) => !mine(b.id));
    if (todo) {
      return el('a.btn.btn-gold.shine', { href: '#appointments', onclick: () => { openCard(todo.id); appts.form = { id: todo.id, rating: 5, body: '' }; appts.focus = todo.id; } },
        'Leave a review ', el('span.arrow', { 'aria-hidden': 'true' }, '→'));
    }
    const done = gold.map((b) => mine(b.id));
    if (done.some((r) => r.status === 'approved')) return el('a.btn.btn-gold.shine', { href: '#reviews' }, 'See it on Reviews ', el('span.arrow', { 'aria-hidden': 'true' }, '→'));
    if (done.some((r) => r.status === 'pending')) return el('p.gold-wait', 'Your review is waiting for approval');
    return null;
  }
  function goldSection(since, gold) {
    const action = goldAction(gold);
    const toWrite = action && action.getAttribute('href') === '#appointments';
    const card = el('div.gold-card',
      el('img.tex', { src: 'img/art/water-beads.webp', alt: '', width: 1400, height: 900, loading: 'lazy', decoding: 'async' }),
      el('span.shade'), el('span.sheen'), el('span.frame'),
      el('div.face',
        el('div.top', el('img.mono', { src: 'img/mono-metallic.webp', alt: 'Alchemist Detailing monogram', width: 547, height: 601, decoding: 'async' }), el('span.tag', 'Gold client')),
        el('div.name', acct.first.trim() || 'Gold client'),
        el('div.bottom', el('div.since', el('span', 'Gold since'), el('b', since)), el('div.au', { 'aria-hidden': 'true' }, el('span', '79'), el('b', 'Au')))));
    const stage = el('div.gold-stage', card, el('div.gold-floor', { 'aria-hidden': 'true' }));
    tilt(stage, card);
    return el('section.acct-sec.gold-sec', stage,
      el('div.gold-copy', el('h2.display', 'You’re a Gold client'),   // no eyebrow: the page title above already welcomes them
        el('p', 'A detail of $200 or more made you Gold.' + (toWrite ? ' Leave a review and it will shine gold on our Reviews page.' : '')),
        el('div.acct-actions', action, el('a.btn.btn-glass', { href: '#book' }, 'Book your next detail'))));
  }
  // --rx / --ry tilt the card toward the pointer and --sheen slides the light across it; the stylesheet holds the
  // resting values (7deg, -14deg, -12%), so the card simply rests on touch screens and under reduced motion
  function tilt(stage, card) {
    if (!window.matchMedia('(hover: hover)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--rx', (-y * 16).toFixed(1) + 'deg');
      card.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg');
      card.style.setProperty('--sheen', (x * 70).toFixed(1) + '%');
    });
    stage.addEventListener('pointerleave', () => ['--rx', '--ry', '--sheen'].forEach((p) => card.style.removeProperty(p)));
  }

  function vehicleForm() {
    const f = acct.form;
    const box = el('div.veh-form', { dataset: { field: 'vehicle' } },
      el('h3.bk-h2', acct.editing === 'new' ? 'Add a vehicle' : 'Edit vehicle'),
      el('div.bk-row.four',
        field({ id: 'vehicle_year', label: 'Year', optional: true, inputmode: 'numeric', maxlength: 4, value: f.year, oninput: (e) => { f.year = e.target.value; } }),
        field({ id: 'vehicle_make', label: 'Make', required: true, value: f.make, maxlength: 40, oninput: (e) => { f.make = e.target.value; } }),
        field({ id: 'vehicle_model', label: 'Model', required: true, value: f.model, maxlength: 40, oninput: (e) => { f.model = e.target.value; } }),
        field({ id: 'vehicle_color', label: 'Color', optional: true, value: f.color || '', maxlength: 30, oninput: (e) => { f.color = e.target.value; } })),
      choices({ id: 'vehicle_type', label: 'Type', required: true, size: 'tile', value: f.vehicle_type, items: menu.vehicleTypes.map((t) => ({ code: t.code, label: t.name })), onchange: (c) => { f.vehicle_type = c; } }),
      choices({ id: 'vehicle_size', label: 'Size', value: f.size, items: [{ code: 'standard', label: 'Standard' }, { code: 'xl', label: 'XL', sub: 'Minivans and some modified trucks. We confirm the price before the appointment.' }], onchange: (c) => { f.size = c; } }),
      choices({ id: 'modifications', label: 'Modifications', size: 'tile', multi: true, value: f.modifications || [], items: menu.options.modification.map((o) => ({ code: o.code, label: o.label })), onchange: (v) => { f.modifications = v; } }),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveVehicle }, 'Save vehicle'), el('button.btn.btn-glass', { type: 'button', onclick: () => { acct.editing = null; acct.form = null; renderAccount(); } }, 'Cancel')));
    return box;
  }
  async function saveProfile() {
    const root = roots.account;
    try { await D.updateProfile(acct.first, acct.last); await refreshSession(true); toast('Name saved'); renderAccount(); }
    catch (e) { if (!showError(root, e.hint, e.message)) toast(e.message); }
  }
  async function saveVehicle() {
    const root = roots.account, f = acct.form;
    try {
      await D.saveVehicle(Object.assign({}, f, { id: acct.editing === 'new' ? null : acct.editing }));
      acct.vehicles = await D.myVehicles(); acct.editing = null; acct.form = null; toast('Vehicle saved'); renderAccount();
    } catch (e) { if (!showError(root, e.hint, e.message)) toast(e.message); }
  }
  function askRemove(v) {
    acct.confirm = v.id; renderAccount();
    clearTimeout(confirmT);
    confirmT = setTimeout(() => { if (acct.confirm === v.id) { acct.confirm = null; renderAccount(); } }, 5000);
  }
  async function removeVehicle(v) {
    clearTimeout(confirmT); acct.confirm = null;
    try { await D.deleteVehicle(v.id); acct.vehicles = await D.myVehicles(); toast('Vehicle removed'); renderAccount(); }
    catch (e) { toast(e.message); renderAccount(); }
  }
  async function signOut() {
    await D.signOut(); session = null; acct.loading = true; acct.vehicles = []; acct.bookings = []; acct.reviews = []; acct.confirm = null; appts.list = null; signin.sent = false;
    toast('Signed out'); renderAccount(); if (roots.appointments) renderAppointments();
  }

  // ---------------------------------------------------------------- appointments
  // Upcoming; then the history: the completed details (warming from black toward gold by value), with the
  // cancelled and declined ones folded under them; a past date the owner hasn't closed yet stays in Past.
  function openCard(id) {
    appts.open = id;
    if (id && !lit.has(id)) { lit.add(id); appts.light = id; }
  }
  async function renderAppointments() {
    const root = roots.appointments; if (!root) return;
    if (appts.list == null) root.replaceChildren(loading('Loading…'));
    await load();
    await refreshSession();
    if (!session) { root.replaceChildren(D.guestBooking ? comingSoon() : shell('Appointments', 'Your details', el('div.bk-grid', el('p.bk-muted', 'Sign in to see your upcoming and past details.'), signInBox(renderAppointments)))); return; }
    if (appts.list == null) {
      try { [appts.list, appts.reviews] = await Promise.all([D.myBookings(), D.myReviews().catch(() => [])]); } catch (e) { appts.list = []; appts.reviews = []; toast(e.message); }
      if (!session) return renderAppointments();   // signed out while loading
    }
    const all = appts.list;
    const upcoming = all.filter(isLive), past = all.filter((b) => !isLive(b));
    const done = past.filter((b) => b.status === 'completed');
    const off = past.filter((b) => b.status === 'declined' || b.status === 'cancelled');
    const open = past.filter((b) => !done.includes(b) && !off.includes(b));
    const body = el('div.bk-grid',
      el('section.acct-sec', el('h2.bk-h2', 'Upcoming'), upcoming.length ? upcoming.map((b) => card(b)) : el('p.bk-muted', 'Nothing booked yet. ', el('a', { href: '#book' }, 'Book a detail'), '.')),
      el('section.acct-sec', el('h2.bk-h2', 'Completed', done.length ? el('small.tnum', done.length + (done.length === 1 ? ' detail' : ' details')) : null),
        done.length ? done.map((b) => card(b)) : el('p.bk-muted', 'No completed details yet.'),
        off.length ? el('details.acct-fold', { open: appts.fold, ontoggle: (e) => { appts.fold = e.target.open; } },
          el('summary', el('span', 'Cancelled and declined ', el('span.tnum', '(' + off.length + ')')), el('span.appt-chev', { innerHTML: CHEV, 'aria-hidden': 'true' })),
          el('div.acct-fold-list', off.map((b) => card(b)))) : null),
      open.length ? el('section.acct-sec', el('h2.bk-h2', 'Past'), open.map((b) => card(b))) : null,
      el('p.bk-note', 'To cancel or change a booking, call ', el('b', tel(phone)), '. We don\'t take cancellations online.'),
      el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.list = null; renderAppointments(); } }, 'Refresh')));
    root.replaceChildren(shell('Appointments', 'Your details', body, all.some((b) => b.example)));
    // the card just pressed keeps its place on the screen (another one may have closed above it) and its head
    // keeps the focus, so a keyboard carries on from it
    const want = appts.focus, anchor = appts.anchor;
    appts.focus = null; appts.anchor = null;
    const pressed = !want && anchor && root.querySelector('.appt[data-id="' + anchor.id + '"]');
    if (pressed) {
      window.scrollBy(0, pressed.getBoundingClientRect().top - anchor.top);
      if (!root.contains(document.activeElement)) pressed.querySelector('.appt-head').focus({ preventScroll: true });
    }
    // arrived from the account page for one booking: it is open; bring it into view and put focus on its head
    // (focus moved here first, so the page's heading focus in app.js leaves it where it is). Come to write its review
    // (the Gold card's button), the whole form is shown and its stars take the focus. The place comes from the
    // layout, not the screen: the page is still rising into place, which would leave the card under the top bar.
    const head = want && appts.open === want ? root.querySelector('.appt.open .appt-head') : null;
    if (head) {
      const card = head.closest('.appt'), form = appts.form && appts.form.id === want ? card.querySelector('[data-field="review"]') : null;
      const star = form && form.querySelector('.star-pick [tabindex="0"]');
      (star || head).focus({ preventScroll: true });
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const top = (n) => { let y = 0; for (; n; n = n.offsetParent) y += n.offsetTop; return y; };
      requestAnimationFrame(() => {
        const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        let y = top(card) - pad;
        if (form) y = Math.max(y, Math.min(top(form) + form.offsetHeight + 24 - window.innerHeight, top(form) - pad));   // its top never under the bar
        window.scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      });
    }
    // A booking opened for the first time takes the gold light once (the owner's "when a customer opens a completed
    // appointment"): across a completed card's gold, or along the progress line to where an open one stands now.
    // The light itself is app.js's (one at a time, none under reduced motion; the customer's own input, now).
    const glow = appts.light;
    appts.light = null;
    const c = glow && appts.open === glow ? root.querySelector('.appt.open') : null;
    const target = c && (c.classList.contains('st-completed') ? c : c.querySelector('.trk li.now') ? c.querySelector('.trk') : null);   // a cancelled one ends muted: no light
    if (target && window.AlchemistLight) window.AlchemistLight.pass(target, { delay: want ? 700 : 260, size: c === target ? 'card' : 'el', now: true });
  }
  // One booking as a card: its head is a button that opens the details (a chevron says so). The head carries the
  // date, time and where, the services with the Table's marks, the status and the reference. A completed detail
  // warms from black toward gold by what it cost (--au, from the same total as the gold rule): under $200 the gold
  // rises from the bottom edge ("done"); at $200 or more the head is matte gold with dark writing and the Au seal
  // ("gold", doc 22). Both light up as they come into view (data-reveal, app.js); the opened body stays dark.
  function card(b) {
    const [label, note] = STATUS[b.status] || [b.status, ''];
    const open = appts.open === b.id;
    const done = b.status === 'completed', gold = isGold(b);
    const au = done && b.total_cents != null ? Math.min(b.total_cents / 20000, 1) : 0;
    const hasAu = mains(b).some((l) => l.code === 'full_detail');   // its own Au mark is the seal: never two Au tiles in one row
    const head = [
      done ? el('span.appt-au', { 'aria-hidden': 'true' }) : null,
      el('span.appt-when', el('b', longDate(b.service_date)), el('span', clock(b.start_min) + ' · ' + whereText(b)), b.example ? el('small.appt-ex', 'Example') : null),
      what(b, gold),
      el('span.appt-state', el('span.appt-status', label), gold && !hasAu ? el('span.sig.au.seal', { 'aria-hidden': 'true' }, el('small', '79'), 'Au') : null),
      el('span.appt-ref.tnum', b.ref),
      el('span.appt-chev', { innerHTML: CHEV, 'aria-hidden': 'true' })];
    return el('article.appt', { class: 'st-' + b.status + (open ? ' open' : '') + (gold ? ' gold' : done ? ' done' : ''), style: done ? { '--au': au.toFixed(3) } : null, dataset: { id: b.id }, 'data-reveal': '' },
      el('span.appt-glow', { 'aria-hidden': 'true' }),
      el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: (e) => {
        appts.anchor = { id: b.id, top: e.currentTarget.closest('.appt').getBoundingClientRect().top };
        if (open) appts.open = null; else openCard(b.id);
        renderAppointments();
      } }, head),
      open ? el('div.appt-body',
        track(b),
        note ? el('p.bk-muted', note) : null,
        el('dl.sum-body',
          el('dt', 'Reference'), el('dd.appt-refline', refValue(b)),
          el('dt', 'Where'), el('dd', b.location_type === 'mobile' ? ([b.address, b.address_zip].filter(Boolean).join(', ') || whereText(b)) : (b.shop_address ? b.shop_address : isLive(b) ? settings.public_area + ' — we send the address with your confirmation' : settings.public_area)),
          el('dt', 'Vehicle'), el('dd', b.vehicle ? (b.vehicle.not_sure ? b.vehicle.description : [b.vehicle.year, b.vehicle.make, b.vehicle.model, b.vehicle.color && '· ' + b.vehicle.color].filter(Boolean).join(' ')) : ''),
          el('dt', 'Length'), el('dd', 'About ' + minutesText(b.duration_min)),
          b.team && b.team.length ? [el('dt', 'Your detailer'), el('dd', b.team.join(', '))] : null,
          b.hold_expires_at && ['requested', 'needs_information'].includes(b.status) ? [el('dt', 'Held until'), el('dd', new Date(b.hold_expires_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))] : null),
        el('div.bk-summary-card', priceLines(b, { mark: (code) => sigMark(code) })),
        done ? reviewBlock(b) : null,
        isLive(b) ? el('p.bk-muted', 'Payment in person after your detail. To cancel or change, call ', tel(phone), '.') : el('p.bk-muted', 'Questions? Call ', tel(phone), '.')) : null);
  }
  // The progress line, like a service tracker: Requested, Confirmed, In progress, Completed. Each stop it has
  // reached shows the time the database logged (my_bookings history), never an estimate; a declined or cancelled
  // booking ends in one muted stop. Status names and times only: the events' notes are the team's.
  const TRACK = ['requested', 'confirmed', 'in_progress', 'completed'];
  const stamp = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function track(b) {
    const when = (s) => { const h = (b.history || []).find((x) => x.status === s); return h ? new Date(h.at) : null; };
    const ended = b.status === 'declined' || b.status === 'cancelled';
    const now = TRACK.indexOf(b.status === 'needs_information' ? 'requested' : b.status);
    const stops = ended
      ? TRACK.filter((s) => when(s)).map((s) => ({ s, on: true })).concat({ s: b.status, on: true, end: true })
      : TRACK.map((s, i) => ({ s, on: i <= now, now: i === now }));
    return el('ol.trk', { 'aria-label': 'Progress', style: { '--n': stops.length, '--to': ended || now < 0 ? 0 : (now / stops.length).toFixed(3) } },
      stops.map((x, i) => {
        const at = x.on ? when(x.s) : null, nextOn = stops[i + 1] && stops[i + 1].on;
        return el('li', { class: [x.on ? 'on' : '', x.now ? 'now' : '', x.end ? 'end' : '', nextOn ? 'run' : ''].filter(Boolean).join(' ') || null, 'aria-current': x.now ? 'step' : null },
          el('span.trk-dot', { 'aria-hidden': 'true' }),
          el('b', STATUS[x.s][0]),
          at ? el('time.tnum', { dateTime: at.toISOString() }, stamp(at)) : x.on ? null : el('span.sr-only', 'Not yet'));
      }));
  }
  function reviewBlock(b) {
    const mine = (appts.reviews || []).find((r) => r.appointment_id === b.id);
    if (mine) return el('div.rv-mine', el('span.eyebrow', mine.status === 'approved' ? 'Your review is published' : mine.status === 'hidden' ? 'Your review' : 'Your review is waiting for approval'),
      el('p', '✦'.repeat(mine.rating) + ' ' + mine.body), mine.owner_reply ? el('p.bk-muted', 'Alchemist replied: ' + mine.owner_reply) : null);
    const f = appts.form && appts.form.id === b.id ? appts.form : null;
    if (!f) return el('div', el('button.btn.btn-gold', { type: 'button', onclick: () => { appts.form = { id: b.id, rating: 5, body: '' }; renderAppointments(); } }, 'Leave a review'));
    // the stars: a radio row, painted in place (one Tab stop, arrows move along it)
    const stars = el('div.star-pick', { role: 'radiogroup', 'aria-label': 'Rating' }, [1, 2, 3, 4, 5].map((i) => el('button', { type: 'button', role: 'radio', dataset: { n: i }, 'aria-label': i + ' stars', onclick: () => { f.rating = i; paintStars(); } }, '✦')));
    const mark = roving(stars, 'button');
    function paintStars() {
      stars.querySelectorAll('button').forEach((s) => { const n = +s.dataset.n; s.classList.toggle('on', n <= f.rating); s.setAttribute('aria-checked', n === f.rating ? 'true' : 'false'); });
      mark();
    }
    paintStars();
    const box = el('div.adm-panel', { dataset: { field: 'review' } }, el('h3.bk-h2', 'How was your detail?'), stars,
      field({ id: 'review_body', label: 'A few words', required: true, multiline: true, rows: 3, maxlength: 1000, value: f.body, hint: 'Shown with your first name and last initial once the owner approves it. No links.', oninput: (e) => { f.body = e.target.value; } }),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: async () => {
        try { await D.submitReview(b.id, f.rating, f.body); appts.form = null; appts.list = null; acct.loading = true; toast('Thank you! Your review is waiting for approval.'); renderAppointments(); }
        catch (e) { if (!showError(roots.appointments, e.hint === 'body' ? 'review_body' : e.hint, e.message)) toast(e.message); }
      } }, 'Send review'), el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.form = null; renderAppointments(); } }, 'Cancel')));
    return box;
  }

  // A booking sent, or a sign-out elsewhere: the next visit starts from the data layer's session again.
  window.AlchemistAccount = { mountAccount, mountAppointments, refresh: () => { appts.list = null; acct.loading = true; acct.confirm = null; session = null; ready = null; } };
})();
