/* Alchemist Detailing — the customer's account (#account) and appointments
   (#appointments), phase 2 (docs 19 and 26). Sign in with a phone code, edit
   the name, keep saved vehicles, see your own bookings. Cancellations and
   changes go through the owner: there is no cancel button, only the phone. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, minutesText, clock, longDate, phonePretty, tel, loading, field, choices, roving, priceLines, miniBtn, showError, clearError, toast } = U;

  let session = null, settings = null, menu = null, phone = '(945) 361-7551';
  let ready = null, confirmT = 0;
  const roots = { account: null, appointments: null };
  const signin = { phone: '', first: '', sent: false, busy: false };
  const acct = { first: '', last: '', vehicles: [], bookings: [], editing: null, form: null, loading: true, confirm: null };
  const appts = { list: null, open: null, reviews: null, form: null };
  // the 200+ gold rule (doc 22): a completed detail of $200 or more makes the booking, and the customer, Gold
  const isGold = (b) => b.status === 'completed' && b.total_cents != null && b.total_cents >= 20000;
  const isLive = (b) => ['requested', 'needs_information', 'confirmed', 'in_progress'].includes(b.status) && b.service_date >= D.helpers.isoDate(D.helpers.todayLocal());
  const byWhen = (a, b) => (a.service_date === b.service_date ? a.start_min - b.start_min : a.service_date < b.service_date ? -1 : 1);
  const monthOf = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  function shell(title, eyebrow, body) {
    return el('div.bk.acct',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — nothing is saved anywhere. Any 6-digit code works.') : null,
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
  async function renderAccount() {
    const root = roots.account; if (!root) return;
    if (acct.loading) root.replaceChildren(loading('Loading…'));
    await load();
    await refreshSession();
    if (!session) { root.replaceChildren(shell('Your account', 'Account', signInBox(renderAccount))); return; }
    if (acct.loading) {
      [acct.vehicles, acct.bookings] = await Promise.all([D.myVehicles().catch(() => []), D.myBookings().catch(() => [])]);
      acct.loading = false;
      if (!session) return renderAccount();   // signed out while loading
    }
    const body = el('div.bk-grid');

    // The Gold client card (the owner's design): live, only for a customer with a completed detail of $200 or more,
    // dated from the first of them; the preview shows it to its example customer (the banner says nothing here is real)
    const gold = acct.bookings.filter(isGold).sort(byWhen);
    if (gold.length || !D.isLive) body.appendChild(goldSection(monthOf(gold.length ? gold[0].service_date : D.helpers.isoDate(D.helpers.todayLocal()))));

    // Upcoming: the next booking, as on Appointments (owner direction 25)
    const next = acct.bookings.filter(isLive).sort(byWhen)[0];
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Upcoming'),
      next ? card(next, { link: true }) : el('p.bk-muted', 'Nothing booked yet. ', el('a', { href: '#book' }, 'Book a detail'), '.')));

    // Profile
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Profile'),
      el('div.bk-row.two',
        field({ id: 'first_name', label: 'First name', required: true, value: acct.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { acct.first = e.target.value; clearError(root, 'first_name'); } }),
        field({ id: 'last_name', label: 'Last name', optional: true, value: acct.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { acct.last = e.target.value; clearError(root, 'last_name'); } })),
      el('div.bk-row.two',
        el('div.fld', el('span.fld-label', 'Mobile phone'), el('p.acct-static', el('span.tnum', phonePretty(session.phone || '') || '—'), el('small', ' confirmed ✓'))),
        el('div.fld', el('span.fld-label', 'Email'), el('p.acct-static', session.email || el('span.bk-muted', 'None on file')))),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveProfile }, 'Save name'), el('button.btn.btn-glass', { type: 'button', onclick: signOut }, 'Sign out'))));

    // Vehicles: Remove asks first, inline, and thinks better of it on its own after five seconds
    const vt = (code) => (menu.vehicleTypes.find((t) => t.code === code) || {}).name || code;
    const list = el('div.veh-list', acct.vehicles.map((v) => el('div.veh', { class: (acct.editing === v.id ? 'editing' : '') + (acct.confirm === v.id ? ' asking' : '') },
      el('div.veh-main', el('b', [v.year, v.make, v.model].filter(Boolean).join(' ')), el('span.bk-muted', [v.color, vt(v.vehicle_type), v.size === 'xl' ? 'XL' : null].filter(Boolean).join(' · '))),
      acct.confirm === v.id
        ? el('div.veh-actions', { role: 'alert' }, el('span.veh-ask', 'Remove this vehicle?'),
          el('button.link.danger', { type: 'button', onclick: () => removeVehicle(v) }, 'Yes, remove'),
          el('button.link', { type: 'button', onclick: () => { clearTimeout(confirmT); acct.confirm = null; renderAccount(); } }, 'Keep'))
        : el('div.veh-actions', el('button.link', { type: 'button', onclick: () => { acct.editing = v.id; acct.form = Object.assign({}, v, { year: v.year ? String(v.year) : '' }); renderAccount(); } }, 'Edit'),
          el('button.link', { type: 'button', onclick: () => askRemove(v) }, 'Remove')))));
    if (!acct.vehicles.length) list.appendChild(el('p.bk-muted', 'No saved vehicles yet. Save one and booking gets faster.'));
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'My vehicles'), list,
      acct.editing ? vehicleForm() : el('div', el('button.btn.btn-glass', { type: 'button', onclick: () => { acct.editing = 'new'; acct.form = { make: '', model: '', year: '', color: '', vehicle_type: null, size: 'standard', modifications: [] }; renderAccount(); } }, '+ Add vehicle'))));

    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Your details'), el('p.bk-note', 'Upcoming and past bookings are under ', el('a', { href: '#appointments' }, 'Appointments'), '. To cancel or change one, call ', el('b', tel(phone)), '.')));
    root.replaceChildren(shell('Your account', 'Account', body));
  }

  // The Gold client card: the beads texture under a dark gradient, a gold rim, an inner hairline frame, the
  // monogram, the first name in gold, "Gold since" and the Au badge; beside it the owner's two sentences and
  // the two buttons. The card tilts under a mouse (tilt), never under a finger or with reduced motion.
  function goldSection(since) {
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
      el('div.gold-copy', el('h2.display', 'You’re a Gold client'),   // no eyebrow: the page title above already says Your account
        el('p', 'A detail of $200 or more made you Gold. Leave a review and it will shine gold on our Reviews page.'),
        el('div.acct-actions',
          el('a.btn.btn-gold.shine', { href: '#appointments' }, 'Leave a review ', el('span.arrow', { 'aria-hidden': 'true' }, '→')),
          el('a.btn.btn-glass', { href: '#book' }, 'Book your next detail'))));
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
      choices({ id: 'vehicle_type', label: 'Type', required: true, size: 'chip', value: f.vehicle_type, items: menu.vehicleTypes.map((t) => ({ code: t.code, label: t.name })), onchange: (c) => { f.vehicle_type = c; } }),
      choices({ id: 'vehicle_size', label: 'Size', value: f.size, items: [{ code: 'standard', label: 'Standard' }, { code: 'xl', label: 'XL', sub: 'Minivans and some modified trucks. We confirm the price before the appointment.' }], onchange: (c) => { f.size = c; } }),
      choices({ id: 'modifications', label: 'Modifications', size: 'chip', multi: true, value: f.modifications || [], items: menu.options.modification.map((o) => ({ code: o.code, label: o.label })), onchange: (v) => { f.modifications = v; } }),
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
    await D.signOut(); session = null; acct.loading = true; acct.vehicles = []; acct.bookings = []; acct.confirm = null; appts.list = null; signin.sent = false;
    toast('Signed out'); renderAccount(); if (roots.appointments) renderAppointments();
  }

  // ---------------------------------------------------------------- appointments
  async function renderAppointments() {
    const root = roots.appointments; if (!root) return;
    if (appts.list == null) root.replaceChildren(loading('Loading…'));
    await load();
    await refreshSession();
    if (!session) { root.replaceChildren(shell('Appointments', 'Your details', el('div.bk-grid', el('p.bk-muted', 'Sign in to see your upcoming and past details.'), signInBox(renderAppointments)))); return; }
    if (appts.list == null) {
      try { [appts.list, appts.reviews] = await Promise.all([D.myBookings(), D.myReviews().catch(() => [])]); } catch (e) { appts.list = []; appts.reviews = []; toast(e.message); }
      if (!session) return renderAppointments();   // signed out while loading
    }
    const upcoming = appts.list.filter(isLive), past = appts.list.filter((b) => !isLive(b));
    const body = el('div.bk-grid',
      el('section.acct-sec', el('h2.bk-h2', 'Upcoming'), upcoming.length ? upcoming.map(card) : el('p.bk-muted', 'Nothing booked yet. ', el('a', { href: '#book' }, 'Book a detail'), '.')),
      el('section.acct-sec', el('h2.bk-h2', 'Past'), past.length ? past.map(card) : el('p.bk-muted', 'No past details yet.')),
      el('p.bk-note', 'To cancel or change a booking, call ', el('b', tel(phone)), '. We don\'t take cancellations online.'),
      el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.list = null; renderAppointments(); } }, 'Refresh')));
    root.replaceChildren(shell('Appointments', 'Your details', body));
  }
  // One booking as a card. On Appointments the head is a button that opens the details (a chevron says so);
  // on the account page (opts.link) it is plain, with a link to Appointments under it. A completed detail is
  // "done", and "gold" at $200 or more (doc 22); both light up from a dark card as they come into view
  // (data-reveal, app.js).
  function card(b, opts) {
    const [label, note] = STATUS[b.status] || [b.status, ''];
    const linked = !!(opts && opts.link);
    const open = !linked && appts.open === b.id;
    const names = (b.lines || []).filter((l) => !l.included && !/^cond_/.test(l.code)).map((l) => l.name).join(' + ');
    const head = [
      el('span.appt-when', el('b', longDate(b.service_date)), el('span', clock(b.start_min) + ' · ' + (b.location_type === 'mobile' ? 'We come to you' : 'Come to us'))),
      el('span.appt-what', names),
      el('span.appt-status', label),
      el('span.appt-ref.tnum', b.ref)];
    const c = el('article.appt', { class: 'st-' + b.status + (open ? ' open' : '') + (isGold(b) ? ' gold' : b.status === 'completed' ? ' done' : ''), 'data-reveal': '' },
      el('span.appt-glow', { 'aria-hidden': 'true' }),
      linked ? el('div.appt-head.static', head)
        : el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { appts.open = open ? null : b.id; renderAppointments(); } }, head, el('span.appt-chev', { innerHTML: CHEV, 'aria-hidden': 'true' })),
      linked ? el('div.appt-body.appt-go', el('a.btn.btn-glass', { href: '#appointments' }, 'View appointment')) : null,
      open ? el('div.appt-body',
        note ? el('p.bk-muted', note) : null,
        el('dl.sum-body',
          el('dt', 'Where'), el('dd', b.location_type === 'mobile' ? (b.address || '') + (b.address_zip ? ', ' + b.address_zip : '') : (b.shop_address ? b.shop_address : settings.public_area + ' — we send the address with your confirmation')),
          el('dt', 'Vehicle'), el('dd', b.vehicle ? (b.vehicle.not_sure ? b.vehicle.description : [b.vehicle.year, b.vehicle.make, b.vehicle.model, b.vehicle.color && '· ' + b.vehicle.color].filter(Boolean).join(' ')) : ''),
          el('dt', 'Length'), el('dd', 'About ' + minutesText(b.duration_min)),
          b.team && b.team.length ? [el('dt', 'Your detailer'), el('dd', b.team.join(', '))] : null,
          b.hold_expires_at && ['requested', 'needs_information'].includes(b.status) ? [el('dt', 'Held until'), el('dd', new Date(b.hold_expires_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))] : null),
        el('div.bk-summary-card', priceLines(b)),
        b.status === 'completed' ? reviewBlock(b) : null,
        el('p.bk-muted', 'Payment in person after your detail. To cancel or change, call ', tel(phone), '.')) : null);
    return c;
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
        try { await D.submitReview(b.id, f.rating, f.body); appts.form = null; appts.list = null; toast('Thank you! Your review is waiting for approval.'); renderAppointments(); }
        catch (e) { if (!showError(roots.appointments, e.hint === 'body' ? 'review_body' : e.hint, e.message)) toast(e.message); }
      } }, 'Send review'), el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.form = null; renderAppointments(); } }, 'Cancel')));
    return box;
  }

  // A booking sent, or a sign-out elsewhere: the next visit starts from the data layer's session again.
  window.AlchemistAccount = { mountAccount, mountAppointments, refresh: () => { appts.list = null; acct.loading = true; acct.confirm = null; session = null; ready = null; } };
})();
