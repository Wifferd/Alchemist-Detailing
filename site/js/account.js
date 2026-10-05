/* Alchemist Detailing — the customer's account (#account) and appointments
   (#appointments), phase 2 (docs 19 and 26). Sign in with a phone code, edit
   the name, keep saved vehicles, see your own bookings. Cancellations and
   changes go through the owner: there is no cancel button, only the phone. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, phonePretty, field, choices, miniBtn, showError, clearError, toast } = U;

  let session = null, settings = null, menu = null, phone = '(945) 361-7551';
  let ready = null;
  const roots = { account: null, appointments: null };
  const signin = { phone: '', first: '', sent: false, busy: false };
  const acct = { first: '', last: '', vehicles: [], editing: null, form: null, loading: true, saved: false };
  const appts = { list: null, open: null, reviews: null, form: null };

  function load() {
    if (ready) return ready;
    ready = (async () => {
      await D.init();
      [settings, menu, session] = await Promise.all([D.settings(), D.menu(), D.session()]);
      phone = settings.public_phone;
    })();
    return ready;
  }
  async function refreshSession() { session = await D.session(); if (session) { acct.first = session.firstName || ''; acct.last = session.lastName || ''; } }

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
          try { await D.sendPhoneCode(signin.phone, { first: signin.first.trim() }); signin.sent = true; after(); }
          catch (e) { showError(box, e.hint || 'phone', e.message); }
        }) }),
      signin.sent ? field({ id: 'phone_code', label: 'Code from the text', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6,
        hint: D.isLive ? '' : 'Preview: any 6 digits work.',
        oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) confirm(e.target.value); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(e.target.value); } },
        trailing: miniBtn('Confirm', () => confirm(box.querySelector('#phone_code').value)) }) : null);
    async function confirm(code) {
      try { session = await D.verifyPhoneCode(signin.phone, code, { first: signin.first.trim() }); signin.sent = false; await refreshSession(); toast('Signed in'); after(); }
      catch (e) { showError(box, e.hint || 'phone_code', e.message); }
    }
    return box;
  }

  // ---------------------------------------------------------------- account
  async function renderAccount() {
    const root = roots.account; if (!root) return;
    root.replaceChildren(el('div.bk-loading', el('span.bk-spin'), 'Loading…'));
    await load();
    if (!session) { root.replaceChildren(shell('Your account', 'Account', signInBox(renderAccount))); return; }
    if (acct.loading) { await refreshSession(); try { acct.vehicles = await D.myVehicles(); } catch (e) { acct.vehicles = []; } acct.loading = false; }
    const body = el('div.bk-grid');

    // Profile
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Profile'),
      el('div.bk-row.two',
        field({ id: 'first_name', label: 'First name', required: true, value: acct.first, autocomplete: 'given-name', maxlength: 40, oninput: (e) => { acct.first = e.target.value; clearError(root, 'first_name'); } }),
        field({ id: 'last_name', label: 'Last name', optional: true, value: acct.last, autocomplete: 'family-name', maxlength: 40, oninput: (e) => { acct.last = e.target.value; clearError(root, 'last_name'); } })),
      el('div.bk-row.two',
        el('div.fld', el('span.fld-label', 'Mobile phone'), el('p.acct-static.tnum', phonePretty(session.phone || '') || '—', el('small', ' confirmed ✓'))),
        el('div.fld', el('span.fld-label', 'Email'), el('p.acct-static', session.email || el('span.bk-muted', 'None on file')))),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveProfile }, 'Save name'), el('button.btn.btn-glass', { type: 'button', onclick: signOut }, 'Sign out'))));

    // Vehicles
    const vt = (code) => (menu.vehicleTypes.find((t) => t.code === code) || {}).name || code;
    const list = el('div.veh-list', acct.vehicles.map((v) => el('div.veh', { class: acct.editing === v.id ? 'editing' : '' },
      el('div.veh-main', el('b', [v.year, v.make, v.model].filter(Boolean).join(' ')), el('span.bk-muted', [v.color, vt(v.vehicle_type), v.size === 'xl' ? 'XL' : null].filter(Boolean).join(' · '))),
      el('div.veh-actions', el('button.link', { type: 'button', onclick: () => { acct.editing = v.id; acct.form = Object.assign({}, v, { year: v.year ? String(v.year) : '' }); renderAccount(); } }, 'Edit'),
        el('button.link', { type: 'button', onclick: () => removeVehicle(v) }, 'Remove')))));
    if (!acct.vehicles.length) list.appendChild(el('p.bk-muted', 'No saved vehicles yet. Save one and booking gets faster.'));
    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'My vehicles'), list,
      acct.editing ? vehicleForm() : el('div', el('button.btn.btn-glass', { type: 'button', onclick: () => { acct.editing = 'new'; acct.form = { make: '', model: '', year: '', color: '', vehicle_type: null, size: 'standard', modifications: [] }; renderAccount(); } }, '+ Add vehicle'))));

    body.appendChild(el('section.acct-sec', el('h2.bk-h2', 'Your details'), el('p.bk-note', 'Upcoming and past bookings are under ', el('a', { href: '#appointments' }, 'Appointments'), '. To cancel or change one, call ', el('b.tnum', phone), '.')));
    root.replaceChildren(shell('Your account', 'Account', body));
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
    try { await D.updateProfile(acct.first, acct.last); await refreshSession(); toast('Name saved'); renderAccount(); }
    catch (e) { if (!showError(root, e.hint, e.message)) toast(e.message); }
  }
  async function saveVehicle() {
    const root = roots.account, f = acct.form;
    try {
      await D.saveVehicle(Object.assign({}, f, { id: acct.editing === 'new' ? null : acct.editing }));
      acct.vehicles = await D.myVehicles(); acct.editing = null; acct.form = null; toast('Vehicle saved'); renderAccount();
    } catch (e) { if (!showError(root, e.hint, e.message)) toast(e.message); }
  }
  async function removeVehicle(v) {
    try { await D.deleteVehicle(v.id); acct.vehicles = await D.myVehicles(); toast('Vehicle removed'); renderAccount(); }
    catch (e) { toast(e.message); }
  }
  async function signOut() {
    await D.signOut(); session = null; acct.loading = true; acct.vehicles = []; appts.list = null; signin.sent = false;
    toast('Signed out'); renderAccount(); if (roots.appointments) renderAppointments();
  }

  // ---------------------------------------------------------------- appointments
  async function renderAppointments() {
    const root = roots.appointments; if (!root) return;
    root.replaceChildren(el('div.bk-loading', el('span.bk-spin'), 'Loading…'));
    await load();
    if (!session) { root.replaceChildren(shell('Appointments', 'Your details', el('div.bk-grid', el('p.bk-muted', 'Sign in to see your upcoming and past details.'), signInBox(renderAppointments)))); return; }
    if (appts.list == null) { try { [appts.list, appts.reviews] = await Promise.all([D.myBookings(), D.myReviews().catch(() => [])]); } catch (e) { appts.list = []; appts.reviews = []; toast(e.message); } }
    const today = D.helpers.isoDate(D.helpers.todayLocal());
    const live = (b) => ['requested', 'needs_information', 'confirmed', 'in_progress'].includes(b.status) && b.service_date >= today;
    const upcoming = appts.list.filter(live), past = appts.list.filter((b) => !live(b));
    const body = el('div.bk-grid',
      el('section.acct-sec', el('h2.bk-h2', 'Upcoming'), upcoming.length ? upcoming.map(card) : el('p.bk-muted', 'Nothing booked yet. ', el('a', { href: '#book' }, 'Book a detail'), '.')),
      el('section.acct-sec', el('h2.bk-h2', 'Past'), past.length ? past.map(card) : el('p.bk-muted', 'No past details yet.')),
      el('p.bk-note', 'To cancel or change a booking, call ', el('b.tnum', phone), '. We don\'t take cancellations online.'),
      el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.list = null; renderAppointments(); } }, 'Refresh')));
    root.replaceChildren(shell('Appointments', 'Your details', body));
  }
  function card(b) {
    const [label, note] = STATUS[b.status] || [b.status, ''];
    const open = appts.open === b.id;
    const names = (b.lines || []).filter((l) => !l.included && !/^cond_/.test(l.code)).map((l) => l.name).join(' + ');
    const c = el('article.appt', { class: 'st-' + b.status + (open ? ' open' : '') },
      el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { appts.open = open ? null : b.id; renderAppointments(); } },
        el('span.appt-when', el('b', longDate(b.service_date)), el('span', clock(b.start_min) + ' · ' + (b.location_type === 'mobile' ? 'We come to you' : 'Come to us'))),
        el('span.appt-what', names),
        el('span.appt-status', label),
        el('span.appt-ref.tnum', b.ref)),
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
        el('p.bk-muted', 'Payment in person after your detail. To cancel or change, call ' + phone + '.')) : null);
    return c;
  }
  function reviewBlock(b) {
    const mine = (appts.reviews || []).find((r) => r.appointment_id === b.id);
    if (mine) return el('div.rv-mine', el('span.eyebrow', mine.status === 'approved' ? 'Your review is published' : mine.status === 'hidden' ? 'Your review' : 'Your review is waiting for approval'),
      el('p', '\u2726'.repeat(mine.rating) + ' ' + mine.body), mine.owner_reply ? el('p.bk-muted', 'Alchemist replied: ' + mine.owner_reply) : null);
    const f = appts.form && appts.form.id === b.id ? appts.form : null;
    if (!f) return el('div', el('button.btn.btn-gold', { type: 'button', onclick: () => { appts.form = { id: b.id, rating: 5, body: '' }; renderAppointments(); } }, 'Leave a review'));
    const box = el('div.adm-panel', { dataset: { field: 'review' } }, el('h3.bk-h2', 'How was your detail?'),
      el('div.star-pick', { role: 'radiogroup', 'aria-label': 'Rating' }, [1, 2, 3, 4, 5].map((i) => el('button', { type: 'button', role: 'radio', 'aria-checked': f.rating === i ? 'true' : 'false', class: i <= f.rating ? 'on' : '', 'aria-label': i + ' stars', onclick: () => { f.rating = i; renderAppointments(); } }, '\u2726'))),
      field({ id: 'review_body', label: 'A few words', required: true, multiline: true, rows: 3, maxlength: 1000, value: f.body, hint: 'Shown with your first name and last initial once the owner approves it. No links.', oninput: (e) => { f.body = e.target.value; } }),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: async () => {
        try { await D.submitReview(b.id, f.rating, f.body); appts.form = null; appts.list = null; toast('Thank you! Your review is waiting for approval.'); renderAppointments(); }
        catch (e) { if (!showError(roots.appointments, e.hint === 'body' ? 'review_body' : e.hint, e.message)) toast(e.message); }
      } }, 'Send review'), el('button.btn.btn-glass', { type: 'button', onclick: () => { appts.form = null; renderAppointments(); } }, 'Cancel')));
    return box;
  }
  function priceLines(b) {
    const rows = (b.lines || []).map((l) => el('div.pr-line', { class: l.included ? 'inc' : '' }, el('span', l.name, l.included ? el('small', ' · Included') : null), el('span.tnum', l.included ? '$0.00' : l.price_cents == null ? 'Confirmed by us' : money(l.price_cents))));
    const out = el('div.pr', rows);
    if (b.bundle_savings_cents) out.appendChild(el('div.pr-line.save', el('span', 'Bundle savings'), el('span.tnum', '−' + money(b.bundle_savings_cents))));
    if (b.location_type === 'mobile') out.appendChild(el('div.pr-line', el('span', 'Mobile service'), el('span.tnum', money(b.mobile_cents))));
    if (b.extra_cost_cents) out.appendChild(el('div.pr-line', el('span', 'Extra' + (b.extra_cost_note ? ' · ' + b.extra_cost_note : '')), el('span.tnum', money(b.extra_cost_cents))));
    out.appendChild(el('div.pr-total', el('span', 'Total'), el('span.tnum', b.total_cents == null ? 'We confirm the price before your appointment' : money(b.total_cents))));
    return out;
  }

  window.AlchemistAccount = { mountAccount, mountAppointments, refresh: () => { appts.list = null; acct.loading = true; } };
})();
