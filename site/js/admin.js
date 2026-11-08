/* Alchemist Detailing — the admin console (#admin), phase 3 (docs 19 and 27).
   For the owner (admin) and managers, after the authenticator step. Every
   action calls a database function; the console never writes to a table
   directly, except the settings and closed days the policies allow the admin
   to edit. Screens: Morning, Requests, Calendar, Customers, Team, Settings, Log. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, shortDate, phonePretty, tel, field, choices, miniBtn, showError, clearError, toast } = U;
  const H = () => D.helpers;
  // Today in Parker (business_settings.timezone), not the device's own date: a phone or laptop on another clock
  // must not show tomorrow's jobs as Today.
  const bizToday = () => H().todayIn(settings && settings.timezone);
  // a job's day as the database names it in start_booking and complete_booking ("Fri, Nov 13", with the year when it
  // isn't this year's)
  const jobDay = (iso) => shortDate(iso) + (iso.slice(0, 4) !== H().isoDate(bizToday()).slice(0, 4) ? ', ' + iso.slice(0, 4) : '');

  const SCREENS = [['morning', 'Morning'], ['requests', 'Requests'], ['calendar', 'Calendar'], ['reviews', 'Reviews'], ['customers', 'Customers'], ['team', 'Team'], ['settings', 'Settings'], ['log', 'Log']];
  const LANES = [['requests', 'Requests'], ['review', 'Review'], ['spam', 'Spam']];
  const STATUS = { requested: 'Requested', needs_information: 'Needs info', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
  // the database's codes, in words: roles, what holds a price (quote_booking's pending_reasons) and the log's actions
  const ROLE = { admin: 'Admin', manager: 'Manager', detailer: 'Detailer' };
  const PENDING = { xl: 'XL vehicle', vehicle_price: 'WetGloss on this vehicle type', stains: 'Stains' };
  // why a request sits in the Review lane (the database's review_reasons)
  const REASON = { unclear_vehicle: 'Vehicle not clear', damage: 'Damage reported', condition: 'Condition: Other', staff: 'Moved by the team', hidden_field: 'Looks like spam (hidden field filled)' };
  const roleOf = (r) => ROLE[r] || r;
  // a team member's name; the owner's own login has none on file (email only), so the email stands in
  const personName = (p) => (p && ([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email)) || 'Team member';
  const laneOf = (q) => (LANES.find(([k]) => k === q) || [null, q])[1];
  // what still holds time or needs doing
  const OPEN = ['requested', 'needs_information', 'confirmed', 'in_progress'];
  // the screens only the admin has (the nav doesn't list them for a manager)
  const ADMIN_ONLY = ['team', 'log'];
  const pendingWords = (b) => (b.pending_reasons || []).map((c) => PENDING[c] || c).join(', ');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let root = null, staff = null, settings = null, menu = null, screen = 'morning', ready = null;
  const st = { lane: 'requests', bookings: null, loadedAt: 0, open: null, panel: null, calDay: null, calMode: 'week', staffList: null, customers: null, search: '', log: null, blocked: null, mfa: null, signin: { phone: '', sent: false } };

  // ---------------------------------------------------------------- preview data (clearly marked examples)
  const PREVIEW = { bookings: [], staff: [], blocked: [], log: [], customers: [] };
  function seedPreview() {
    if (PREVIEW.bookings.length) return;
    const today = bizToday(), iso = (n) => H().isoDate(H().addDays(today, n));
    const mk = (n, o) => Object.assign({ id: 'ex-' + n, ref: 'AD-EXAMPL' + n, customer_id: 'c' + n, contact_first: 'Example', contact_last: 'Customer ' + n, contact_phone: '1972555010' + n,
      vehicle_make: ['Toyota', 'Ford', 'Honda', 'Tesla', 'BMW', 'Jeep'][n % 6], vehicle_model: ['4Runner', 'F-150', 'Civic', 'Model 3', 'X5', 'Wrangler'][n % 6], vehicle_year: 2018 + (n % 6), vehicle_color: 'Black',
      vehicle_type: ['suv', 'truck', 'sedan', 'sedan', 'suv', 'suv'][n % 6], vehicle_size: 'standard', conditions: ['none'], damage: ['none'], special_request: null, photo_paths: [],
      location_type: n % 2 ? 'mobile' : 'shop', address: n % 2 ? '100 Example Ln' : null, address_zip: n % 2 ? '75002' : null,
      service_date: iso(n % 3), start_min: 600 + (n % 4) * 90, duration_min: 120, status: 'confirmed', queue: 'requests', review_reasons: [], hold_expires_at: null,
      value_cents: 10998, bundle_savings_cents: 999, mobile_cents: n % 2 ? 700 : 0, price_pending: false, pending_reasons: [], extra_cost_cents: null, extra_cost_note: null,
      total_cents: n % 2 ? 10699 : 9999, created_at: new Date(Date.now() - n * 3600e3).toISOString(),
      items: [{ code: 'signature_combo', name: 'Signature Combo', kind: 'bundle', price_cents: 9999, mobile_cents: n % 2 ? 700 : 0, duration_min: 120, included: false }],
      assignments: [], events: [] }, o);
    PREVIEW.bookings.push(
      mk(1, { status: 'requested', hold_expires_at: new Date(Date.now() + 5 * 3600e3).toISOString(), conditions: ['pet_hair'], special_request: 'Dog hair in the back seat.', items: [{ code: 'int_basic', name: 'Interior Basic', kind: 'interior', price_cents: 5999, mobile_cents: 150, duration_min: 60, included: false }, { code: 'cond_pet_hair', name: 'Pet hair', kind: 'addon', price_cents: 1500, mobile_cents: 38, duration_min: 0, included: false }], value_cents: 7499, bundle_savings_cents: 0, mobile_cents: 188, total_cents: 7687, duration_min: 60 }),
      mk(2, { status: 'requested', hold_expires_at: new Date(Date.now() + 20 * 3600e3).toISOString(), vehicle_size: 'xl', price_pending: true, pending_reasons: ['xl'], total_cents: null }),
      mk(3, { status: 'confirmed', assignments: [{ employee_id: 'staff-1', name: 'Owner' }] }),
      mk(4, { status: 'confirmed' }),
      mk(5, { status: 'requested', queue: 'review', review_reasons: ['damage'], damage: ['unknown'], damage_note: 'Scratch on the door, not sure how deep.', hold_expires_at: new Date(Date.now() + 10 * 3600e3).toISOString() }),
      mk(6, { status: 'completed', service_date: iso(-3) }),
      // a Full Detail Bundle, mobile ($209.99 + 7%): over $200, so the console shows it gold (doc 22)
      mk(7, { status: 'confirmed', service_date: iso(1), start_min: 600, duration_min: 210, assignments: [{ employee_id: 'staff-2', name: 'Example' }],
        items: [{ code: 'full_detail', name: 'Full Detail Bundle', kind: 'bundle', price_cents: 20999, mobile_cents: 1470, duration_min: 210, included: false }, { code: 'steam_cleaning', name: 'Steam Cleaning', kind: 'addon', price_cents: 4999, mobile_cents: 0, duration_min: 0, included: true }],
        value_cents: 22998, bundle_savings_cents: 1999, mobile_cents: 1470, total_cents: 22469 }));
    PREVIEW.staff.push({ id: 'staff-1', first_name: 'Owner', last_name: null, role: 'admin', phone: '19453617551', is_active: true }, { id: 'staff-2', first_name: 'Example', last_name: 'Detailer', role: 'detailer', phone: '19725550199', is_active: true });
    PREVIEW.blocked.push({ day: iso(12), reason: 'Example: closed' });
    PREVIEW.log.push({ id: 3, action: 'insert', target_type: 'appointment_assignments', target_id: 'ex-7', old_value: null, new_value: { appointment_id: 'ex-7' }, created_at: new Date().toISOString(), actor_id: 'staff-1' },
      { id: 2, action: 'update', target_type: 'appointments', target_id: 'ex-3', old_value: { ref: 'AD-EXAMPL3', status: 'requested' }, new_value: { ref: 'AD-EXAMPL3', status: 'confirmed' }, created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), actor_id: 'staff-1' },
      { id: 1, action: 'update', target_type: 'appointments', target_id: 'ex-6', old_value: { ref: 'AD-EXAMPL6', status: 'completed', extra_cost_cents: null }, new_value: { ref: 'AD-EXAMPL6', status: 'completed', extra_cost_cents: 1500 }, created_at: new Date(Date.now() - 26 * 3600e3).toISOString(), actor_id: 'staff-1' });
  }

  // ---------------------------------------------------------------- data (live reads through RLS; actions through functions)
  const sb = () => D.client();
  async function loadBookings() {
    // the preview's examples in the live query's order (by day, then start time), so every list reads as it will live
    if (!D.isLive) { seedPreview(); st.bookings = PREVIEW.bookings.slice().sort((a, b) => (a.service_date < b.service_date ? -1 : a.service_date > b.service_date ? 1 : a.start_min - b.start_min)); return st.bookings; }
    const from = H().isoDate(H().addDays(bizToday(), -30));
    const { data, error } = await sb().from('appointments')
      .select('*, items:appointment_items(code,name,kind,price_cents,mobile_cents,duration_min,included,sort), assignments:appointment_assignments(employee_id, profile:profiles!appointment_assignments_employee_id_fkey(first_name,last_name,email)), events:appointment_events(from_status,to_status,from_queue,to_queue,note,created_at)')
      .gte('service_date', from).is('anonymized_at', null).order('service_date').order('start_min');
    if (error) throw D.fail('load_failed', error.message);
    st.loadedAt = Date.now();
    st.bookings = (data || []).map((b) => Object.assign(b, {
      items: (b.items || []).sort((x, y) => x.sort - y.sort),
      assignments: (b.assignments || []).map((a) => ({ employee_id: a.employee_id, name: personName(a.profile) })),
      events: (b.events || []).sort((x, y) => x.created_at < y.created_at ? -1 : 1),
    }));
    return st.bookings;
  }
  async function loadStaff() {
    if (!D.isLive) { seedPreview(); st.staffList = PREVIEW.staff.slice(); return st.staffList; }
    const { data, error } = await sb().from('profiles').select('id,first_name,last_name,email,role,phone,is_active').in('role', ['detailer', 'manager', 'admin']).is('deleted_at', null).order('first_name');
    if (error) throw D.fail('load_failed', error.message);
    st.staffList = data || []; return st.staffList;
  }
  async function loadBlocked() {
    if (!D.isLive) { seedPreview(); st.blocked = PREVIEW.blocked.slice(); return st.blocked; }
    const { data, error } = await sb().from('blocked_days').select('day,reason').gte('day', H().isoDate(bizToday())).order('day');
    if (error) throw D.fail('load_failed', error.message);
    st.blocked = data || []; return st.blocked;
  }
  // onFail (optional) hears the database's refusal of the action itself, not a list that fails to reload after it
  async function act(name, args, okText, onFail) {
    try {
      if (!D.isLive) { previewAct(name, args); }
      else await D.rpc(name, args);
      onFail = null;
      toast(okText || 'Done'); st.panel = null; await loadBookings(); render();
    } catch (e) { toast(e.message || 'That didn’t work.'); if (onFail) onFail(e); }
  }
  function previewAct(name, args) {
    const b = PREVIEW.bookings.find((x) => x.id === (args.p_id || args.p_appointment));
    if (!b) return;
    const ev = (to, note) => b.events.push({ from_status: b.status, to_status: to, note: note || null, created_at: new Date().toISOString() });
    if (name === 'confirm_booking') { if (b.price_pending) throw D.fail('wrong_state', 'The admin needs to set the extra cost first, so the customer sees the full price.'); ev('confirmed', args.p_note); b.status = 'confirmed'; b.hold_expires_at = null; }
    if (name === 'decline_booking') { ev('declined', args.p_note); b.status = 'declined'; }
    if (name === 'ask_for_information') { ev('needs_information', args.p_note); b.status = 'needs_information'; }
    if (name === 'cancel_booking') { ev('cancelled', args.p_note); b.status = 'cancelled'; }
    // the database's day rule (doc 46, Migration 008): Start on the job's own day only, Complete on that day or later
    // (Parker's date), refused in the database's own words
    const today = H().isoDate(bizToday());
    if (name === 'start_booking') {
      if (b.status !== 'confirmed') throw D.fail('wrong_state', 'Only confirmed bookings can be started.');
      if (b.service_date > today) throw D.fail('wrong_state', 'This job is on ' + jobDay(b.service_date) + '. Start it on that day.');
      if (b.service_date < today) throw D.fail('wrong_state', 'This job was on ' + jobDay(b.service_date) + '. A job is started only on its own day: complete it, or change its time.');
      ev('in_progress'); b.status = 'in_progress';
    }
    if (name === 'complete_booking') {
      if (!['confirmed', 'in_progress'].includes(b.status)) throw D.fail('wrong_state', 'Only confirmed or started bookings can be completed.');
      if (b.service_date > today) throw D.fail('wrong_state', 'This job is on ' + jobDay(b.service_date) + '. It can be completed on that day or later.');
      ev('completed', args.p_note); b.status = 'completed';
    }
    if (name === 'set_booking_lane') { b.queue = args.p_lane; }
    if (name === 'set_booking_time') { b.service_date = args.p_date; b.start_min = args.p_start_min; if (args.p_duration_min) b.duration_min = args.p_duration_min; }
    if (name === 'set_extra_cost') { b.extra_cost_cents = args.p_cents; b.extra_cost_note = args.p_note || null; b.price_pending = false; b.pending_reasons = []; b.total_cents = b.value_cents - b.bundle_savings_cents + b.mobile_cents + args.p_cents; }
    if (name === 'assign_employee') { const s = PREVIEW.staff.find((x) => x.id === args.p_employee); if (s && !b.assignments.some((a) => a.employee_id === s.id)) b.assignments.push({ employee_id: s.id, name: s.first_name }); }
    if (name === 'unassign_employee') { b.assignments = b.assignments.filter((a) => a.employee_id !== args.p_employee); }
  }

  // ---------------------------------------------------------------- shell and gate
  // Every visit to #admin reads the lists again (nothing alerts the owner to a new request, so a list kept from an
  // earlier visit would hide it). Coming back to a tab left open does the same after a minute away.
  function forget() { st.bookings = null; st.reviews = null; st.blocked = null; st.log = null; st.staffList = null; st.asks = null; }
  function mount(container) {
    root = container;
    const sub = (location.hash.split('-')[1] || '').trim();
    if (SCREENS.some(([k]) => k === sub)) screen = sub;
    if (!ready) ready = (async () => { await D.init(); [settings, menu] = await Promise.all([D.settings(), D.menu()]); })();
    // a note or link typed and not saved is let go on a new visit (a redraw, Refresh or the auto-refresh keep it,
    // and its box shows it, so Save never stores text the box doesn't show)
    st.noticeDraft = null; st.googleDraft = null;
    forget();
    render();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !root || !root.isConnected || root.closest('[hidden]')) return;
    if (st.bookings == null || Date.now() - st.loadedAt < 60000 || st.panel) return;   // not loaded yet, fresh, or a panel being filled in
    if (st.sure && st.sure.wrap && st.sure.wrap.isConnected) return;   // or an "Are you sure?" open (its call link leaves the tab)
    forget(); render();
  });
  async function render() {
    if (!root) return;
    root.replaceChildren(U.loading('Loading…'));
    await ready;
    // the database can't be reached on the real site (doc 42): no example data here
    if (D.isDown) return root.replaceChildren(U.outage(['The database can’t be reached right now. Reload the page in a few minutes.']));
    staff = await D.staffSession();
    if (!staff) return root.replaceChildren(shell('Sign in', signIn()));
    // a detailer (the footer's Team sign-in, or /admin typed): the Admin page isn't theirs, their jobs are on Team
    if (staff.role === 'detailer') return root.replaceChildren(shell('Admin', el('div.bk-grid', el('p.bk-note', 'The Admin page is for the owner and managers. Your jobs are on the Team page.'), el('div.acct-actions', el('a.btn.btn-gold.shine', { href: '#team' }, 'Open my jobs ', el('span.arrow', { 'aria-hidden': 'true' }, '→')), el('button.btn.btn-glass', { type: 'button', onclick: async () => { await D.signOut(); st.mfa = null; st.mfaError = null; render(); } }, 'Sign out')))));
    if (!['manager', 'admin'].includes(staff.role)) return root.replaceChildren(shell('Admin', el('div.bk-grid', el('p.bk-note', 'This account is not a manager or the admin. Signed in as ' + (staff.firstName || (staff.phone ? phonePretty(staff.phone) : staff.email) || 'this login') + '.'), el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: async () => { await D.signOut(); st.mfa = null; st.mfaError = null; render(); } }, 'Sign out')))));
    if (staff.mfaRequired && staff.aal !== 'aal2') return root.replaceChildren(shell('Authenticator', mfaStep()));
    // a manager who types #admin-team or #admin-log: those screens are the admin's (the nav doesn't offer them)
    if (ADMIN_ONLY.includes(screen) && staff.role !== 'admin') return root.replaceChildren(shell(SCREENS.find(([k]) => k === screen)[1], el('div.bk-grid', el('p.bk-note', 'Only the admin sees this.'), el('div.acct-actions', el('a.btn.btn-glass', { href: '#admin-morning', onclick: (e) => { e.preventDefault(); screen = 'morning'; history.replaceState(history.state, '', '#admin-morning'); render(); } }, 'Back to Morning'))), true));
    if (st.bookings == null) { try { await loadBookings(); } catch (e) { st.bookings = []; toast(e.message); } }
    // an Assign panel left open through a Refresh or a new visit (forget() lets the team list go): read it again
    if (st.panel && st.panel.kind === 'assign' && st.staffList == null) { try { await loadStaff(); } catch (e) { st.staffList = []; toast(e.message); } }
    const body = { morning: morning, requests: requests, calendar: calendar, reviews: reviewsScreen, customers: customers, team: team, settings: settingsScreen, log: logScreen }[screen];
    root.replaceChildren(shell(SCREENS.find(([k]) => k === screen)[1], await body(), true));
  }
  function shell(title, body, nav) {
    return el('div.bk.admin',
      U.modeBanner('example data, nothing is saved. Names and bookings here are made up for the preview.', D.isLive),
      nav ? el('nav.adm-nav', { 'aria-label': 'Admin screens' }, SCREENS.filter(([k]) => k !== 'team' && k !== 'log' && k !== 'settings' || staff.role === 'admin' || k === 'settings').map(([k, label]) => el('a', { href: '#admin-' + k, class: k === screen ? 'on' : '', 'aria-current': k === screen ? 'page' : null, onclick: (e) => { e.preventDefault(); screen = k; st.bookings = null; st.asks = null; history.replaceState(history.state, '', '#admin-' + k); render(); } }, label))) : null,
      el('header.bk-head.adm-head', el('div', el('p.eyebrow', 'Admin'), el('h1.display.bk-title', title)),
        staff ? el('div.adm-who', el('span', (staff.firstName || 'Signed in') + ' · ' + roleOf(staff.role || '')),
          nav ? el('button.link', { type: 'button', onclick: () => { forget(); render(); } }, 'Refresh') : null,
          el('button.link', { type: 'button', onclick: async () => { await D.signOut(); st.mfa = null; st.mfaError = null; st.bookings = null; st.asks = null; render(); } }, 'Sign out')) : null),
      body);
  }
  function signIn() {
    const s = st.signin;
    if (!D.isLive) return el('div.bk-grid', el('p.bk-note', 'Preview: pick a role to look around.'), el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => { D.previewStaffSignIn('admin'); render(); } }, 'Look around as the admin'), el('button.btn.btn-glass', { type: 'button', onclick: () => { D.previewStaffSignIn('manager'); render(); } }, 'As a manager')));
    if (s.by !== 'phone') return passwordSignIn(s);
    const box = el('div.bk-grid', el('p.bk-note', 'Team sign-in: your phone code, then your authenticator app.'),
      el('p.bk-muted', el('button.link', { type: 'button', onclick: () => { s.by = 'password'; render(); } }, 'Sign in with your email and password instead')),
      field({ id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', value: s.phone, oninput: (e) => { s.phone = e.target.value; },
        trailing: miniBtn(s.sent ? 'Resend' : 'Send code', async () => { try { await D.sendPhoneCode(s.phone, null, { staff: true }); s.sent = true; render(); } catch (e) { showError(box, 'phone', e.message); } }) }),
      s.sent ? field({ id: 'phone_code', label: 'Code from the text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6,
        oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) confirm(e.target.value); }, trailing: miniBtn('Confirm', () => confirm(box.querySelector('#phone_code').value)) }) : null);
    async function confirm(code) { try { await D.verifyPhoneCode(s.phone, code); s.sent = false; render(); } catch (e) { showError(box, 'phone_code', e.message); } }
    return box;
  }
  // Email and password, then the authenticator app (doc 43). A real form, so a password manager can fill it and
  // Enter signs in. The login itself is made in Supabase; there is no sign-up here.
  function passwordSignIn(s) {
    let busy = false;
    const form = el('form.bk-grid', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (busy) return; busy = true;
      clearError(form, 'staff_email'); clearError(form, 'staff_password');
      const email = form.querySelector('#staff_email').value, password = form.querySelector('#staff_password').value;
      s.email = email;
      try { await D.staffPasswordSignIn(email, password); render(); }
      catch (err) { busy = false; showError(form, err.hint === 'staff_email' ? 'staff_email' : 'staff_password', err.message); }
    } },
      el('p.bk-note', 'Team sign-in: your email and password, then your authenticator app.'),
      field({ id: 'staff_email', label: 'Email', type: 'email', inputmode: 'email', autocomplete: 'username', required: true, value: s.email }),
      field({ id: 'staff_password', label: 'Password', type: 'password', autocomplete: 'current-password', required: true }),
      el('div.acct-actions', el('button.btn.btn-gold', { type: 'submit' }, 'Sign in')),
      el('p.bk-muted', el('button.link', { type: 'button', onclick: () => { s.by = 'phone'; render(); } }, 'Use a text code instead')));
    return form;
  }
  function mfaStep() {
    const box = el('div.bk-grid');
    if (!staff.hasAuthenticator) {
      // a failed start shows its message and a way to try again, never a spinner that stays (doc 43)
      if (st.mfaError) return el('div.bk-grid', el('p.bk-note', st.mfaError), el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => { st.mfaError = null; render(); } }, 'Try again')));
      if (!st.mfa) { D.mfaEnroll().then((m) => { st.mfa = m; render(); }).catch((e) => { st.mfaError = e.message; render(); }); return U.loading('Preparing your authenticator…'); }
      box.append(el('p.bk-note', 'One-time setup. Open an authenticator app (Google Authenticator, Authy, 1Password…), scan this code, then enter the 6-digit number it shows.'),
        el('img.adm-qr', { src: st.mfa.qr, alt: 'Authenticator QR code' }),
        // on the phone that holds the app, the code can't be scanned from its own screen: the link opens the app
        st.mfa.uri ? el('p.bk-muted', 'On this phone: ', el('a', { href: st.mfa.uri }, 'add it to your authenticator app')) : null,
        el('p.bk-muted', 'Or type the key: ', el('code', st.mfa.secret)));
    } else box.append(el('p.bk-note', 'Enter the 6-digit code from your authenticator app.'));
    box.append(field({ id: 'mfa_code', label: 'Authenticator code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6,
      oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) go(e.target.value); }, trailing: miniBtn('Continue', () => go(box.querySelector('#mfa_code').value)) }));
    async function go(code) {
      try { const id = st.mfa ? st.mfa.factorId : await D.mfaFactorId(); await D.mfaVerify(id, code); st.mfa = null; toast('Welcome'); render(); }
      catch (e) { showError(box, 'mfa_code', e.message); }
    }
    return box;
  }

  // ---------------------------------------------------------------- pieces
  const name = (b) => [b.contact_first, b.contact_last].filter(Boolean).join(' ') || 'Customer';
  const vehicle = (b) => b.vehicle_not_sure ? (b.vehicle_description || 'Not sure') : [b.vehicle_year, b.vehicle_make, b.vehicle_model, b.vehicle_color && '· ' + b.vehicle_color].filter(Boolean).join(' ');
  const services = (b) => (b.items || []).filter((i) => !i.included && !/^cond_/.test(i.code)).map((i) => i.name).join(' + ');
  const where = (b) => b.location_type === 'mobile' ? (b.address || '') + ', ' + (b.address_zip || '') : 'Come to us';
  const hoursLeft = (iso) => { const m = (new Date(iso) - Date.now()) / 60000; return m <= 0 ? 'hold expired' : m < 90 ? Math.round(m) + ' min left' : Math.round(m / 60) + ' h left'; };
  const labelOf = (list, code) => ((menu.options[list] || []).find((o) => o.code === code) || {}).label || code;
  const isGold = (b) => b.total_cents != null && b.total_cents >= 20000;   // the 200+ gold rule (doc 22): shown gold in admin

  const car = (b) => b.vehicle_not_sure ? (b.vehicle_description || 'Not sure') : [b.vehicle_year, b.vehicle_make, b.vehicle_model].filter(Boolean).join(' ');   // the row's car: the colour is in the details
  const holdShort = (iso) => { const m = (new Date(iso) - Date.now()) / 60000; return m <= 0 ? 'expired' : m < 90 ? Math.round(m) + ' min' : Math.round(m / 60) + ' h'; };
  // the status by its form, not only its shade (owner §28): confirmed is a filled pill with ✓ (in progress filled too),
  // a request a hollow muted pill with the time its hold has left (late in the danger ink), a request in the Review
  // lane ⚠ Review in amber
  function statusPill(b, hold) {
    const review = b.queue === 'review' && ['requested', 'needs_information'].includes(b.status);
    const late = !!hold && new Date(hold) <= Date.now();
    return el('span.appt-status', { class: (review ? 'review' : '') + (late ? ' late' : '') },
      review ? el('i', { 'aria-hidden': 'true' }, '⚠') : b.status === 'confirmed' ? el('i', { 'aria-hidden': 'true' }, '✓') : null,
      review ? 'Review' : STATUS[b.status] || b.status,
      hold ? el('small.tnum', '· ' + holdShort(hold), el('span.sr-only', ' left on the hold')) : null);
  }

  // One booking as a row (owner §26, §27): the time, length and place with the status, then the customer and the
  // services and the car with the price, and who is on it. A phone keeps it to three short lines (a fourth for who, on
  // a job that has or needs someone; a request shows the time its hold has left where the price goes); a wide screen
  // spreads it over four columns. In a list of one day (opts.day: Today, Tomorrow) the date is the list's own. The head
  // opens the details. A compact row (opts.compact) is a copy shown in a second list (a request under Today or
  // Tomorrow): one line, the time, the name and the status, no body, so every booking opens in one place only.
  function card(b, opts) {
    const compact = !!(opts && opts.compact), day = !!(opts && opts.day);
    const open = !compact && st.open === b.id;
    const hold = b.hold_expires_at && ['requested', 'needs_information'].includes(b.status) ? b.hold_expires_at : null;
    const who = (b.assignments || []).map((a) => a.name).join(', ');
    const showWho = !!who || ['confirmed', 'in_progress'].includes(b.status);   // a confirmed job says when nobody is on it yet
    const date = new Date(b.service_date + 'T12:00:00');
    const head = [
      el('span.appt-when', el('b', day ? null : el('span.appt-date', el('span.appt-wd', date.toLocaleDateString('en-US', { weekday: 'short' }) + ', '), date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · '), clock(b.start_min)),
        el('span.appt-meta', minutesText(b.duration_min) + ' · ' + (b.location_type === 'mobile' ? 'Mobile' : 'Driveway'))),
      showWho ? el('span.appt-who', { class: who ? 'on' : '' }, who ? '✓ ' + who : 'Unassigned') : null,
      el('span.appt-what', el('b', name(b)), el('span.appt-sub', el('span', services(b)), el('span.appt-car', ' · ' + car(b)))),
      el('span.appt-tags', statusPill(b, hold), isGold(b) ? el('span.rv-gold', 'Gold detail') : null),
      el('span.appt-ref.tnum', { class: b.total_cents == null ? 'pending' : '' }, b.total_cents == null ? 'Price pending' : money(b.total_cents)),
      hold && b.total_cents != null ? el('span.appt-left.tnum', { class: new Date(hold) <= Date.now() ? 'late' : '' }, hoursLeft(hold)) : null];
    return el('article.appt.adm.adm-row', { class: 'st-' + b.status + (open ? ' open' : '') + (isGold(b) ? ' gold' : '') + (compact ? ' compact' : '') },
      compact ? el('div.appt-head', head)
        : el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { st.open = open ? null : b.id; st.panel = null; render(); } }, head),
      open ? detail(b) : null);
  }
  function detail(b) {
    const canDecide = ['requested', 'needs_information'].includes(b.status);
    const admin = staff.role === 'admin';
    // the price is the owner's to set (doc 28): the admin has Set price; a manager waits for the owner
    const priceFirst = admin ? 'Set the price first' : 'The owner sets the price first';
    // Start on the job's own day only, Complete on that day or later, Parker's date (doc 46; start_booking and
    // complete_booking check the same). A confirmed job whose day has passed can't be started any more, but
    // complete_booking still takes it, so it gets Complete (or it would stay under "Earlier, not finished").
    const todayIso = H().isoDate(bizToday());
    const onDay = b.service_date === todayIso, dayCome = b.service_date <= todayIso;
    const canStart = b.status === 'confirmed' && onDay;
    const canComplete = (b.status === 'in_progress' && dayCome) || (b.status === 'confirmed' && b.service_date < todayIso);
    const dayLine = b.status === 'confirmed' && !dayCome ? 'Start opens on ' + jobDay(b.service_date) + '.'
      : b.status === 'in_progress' && !dayCome ? 'Complete opens on ' + jobDay(b.service_date) + '.'
      : b.status === 'confirmed' && !onDay ? 'Not started on its day (' + jobDay(b.service_date) + '): complete it if it was done, or change its time.'
      : null;
    const notes = [b.special_request && ['Notes', b.special_request], b.damage_note && ['Damage note', b.damage_note]].filter(Boolean);
    // a button that opens a panel: marked (.on, aria-expanded) while its panel is open, a press while marked closes it
    // (the mark is read at the press: "Are you sure?" unmarks it without a redraw); o.state builds the panel's
    // starting values, o.before loads what it needs
    function trig(kind, label, o) {
      o = o || {};
      const on = !!(st.panel && st.panel.id === b.id && st.panel.kind === kind);
      return el('button.btn.btn-glass', { type: 'button', class: (o.cls || '') + (on ? ' on' : ''), 'aria-expanded': on ? 'true' : 'false',
        onclick: async (e) => { const was = e.currentTarget.classList.contains('on'); st.panel = was ? null : Object.assign({ kind, id: b.id }, o.state ? o.state() : null); if (!was && o.before) await o.before(); render(); } }, label);
    }
    const body = el('div.appt-body',
      el('div.adm-cols',
        el('dl.sum-body',
          el('dt', 'Phone'), el('dd', el('a', { href: 'tel:+' + (b.contact_phone || '') }, phonePretty(b.contact_phone || '')), b.contact_email ? ' · ' + b.contact_email : ''),
          el('dt', 'Where'), el('dd', where(b)),
          el('dt', 'Vehicle'), el('dd', vehicle(b) + (b.vehicle_size === 'xl' ? ' · XL' : '')),
          el('dt', 'Inside'), el('dd', (b.conditions || []).map((c) => labelOf('condition', c)).join(', ') || '—'),
          el('dt', 'Damage'), el('dd', (b.damage || []).map((c) => labelOf('damage', c)).join(', ') || '—'),
          notes.map(([k, v]) => [el('dt', k), el('dd.adm-quote', v)]),
          b.review_reasons && b.review_reasons.length ? [el('dt', 'In review for'), el('dd', b.review_reasons.map((r) => REASON[r] || r).join(', '))] : null,
          b.assignments.length ? [el('dt', 'Assigned'), el('dd', b.assignments.map((a) => a.name).join(', '))] : null,
          el('dt', 'Ref'), el('dd.tnum', b.ref)),
        el('div.bk-summary-card', priceLines(b))),
      el('div.adm-actions',
        canDecide ? el('button.btn.btn-gold', { type: 'button', disabled: b.price_pending, title: b.price_pending ? priceFirst : '', onclick: (e) => askSure(b, e.currentTarget) }, 'Confirm') : null,
        canDecide ? trig('decline', 'Decline') : null,
        b.status === 'requested' ? trig('info', 'Ask for info') : null,
        canStart ? el('button.btn.btn-glass', { type: 'button', onclick: () => act('start_booking', { p_id: b.id }, 'Started') }, 'Start') : null,
        canComplete ? el('button.btn.btn-gold', { type: 'button', onclick: () => act('complete_booking', { p_id: b.id }, 'Completed') }, 'Complete') : null,
        !['completed', 'declined', 'cancelled'].includes(b.status) ? trig('time', b.status === 'in_progress' ? 'Change length' : 'Change time', { state: () => ({ date: b.service_date, start: b.start_min, times: null }) }) : null,
        admin && !['completed', 'declined', 'cancelled'].includes(b.status) ? trig('price', b.price_pending ? 'Set price' : 'Extra cost', { cls: b.price_pending ? 'attention' : '', state: () => ({ cents: b.extra_cost_cents != null ? (b.extra_cost_cents / 100).toFixed(2) : '', note: b.extra_cost_note || '' }) }) : null,
        // the database assigns only confirmed or started jobs (assign_employee), and moves only requests between lanes (set_booking_lane)
        ['confirmed', 'in_progress'].includes(b.status) ? trig('assign', 'Assign', { before: () => (st.staffList ? null : loadStaff()) }) : null,
        ['requested', 'needs_information'].includes(b.status) ? trig('lane', 'Move lane') : null,
        admin && ['confirmed', 'in_progress', 'needs_information', 'requested'].includes(b.status) ? trig('cancel', 'Cancel booking', { cls: 'danger' }) : null),
      canDecide && b.price_pending ? el('p.bk-muted', priceFirst) : null,
      dayLine ? el('p.bk-muted', dayLine) : null,
      st.panel && st.panel.id === b.id ? panel(b) : null,
      b.events && b.events.length ? el('details.adm-history', el('summary', 'History'), el('ul', b.events.map((e) => el('li', el('span.tnum', new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), ' · ', historyWords(e), e.note ? el('i', ' — ' + e.note) : null)))) : null);
    return body;
  }
  // one line of a booking's history: received, a status change, or a move to another lane
  function historyWords(e) {
    if (!e.from_status) return 'Request received';
    if (e.to_status && e.from_status !== e.to_status) return (STATUS[e.from_status] || e.from_status) + ' → ' + (STATUS[e.to_status] || e.to_status);
    return e.to_queue && e.to_queue !== e.from_queue ? 'Moved to ' + laneOf(e.to_queue) : 'Updated';
  }
  function priceLines(b) {
    const out = el('div.pr', (b.items || []).map((l) => el('div.pr-line', { class: l.included ? 'inc' : '' }, el('span', l.name, l.included ? el('small', ' · Included') : null), el('span.tnum', l.included ? '$0.00' : l.price_cents == null ? 'Pending' : money(l.price_cents)))));
    if (b.bundle_savings_cents) out.appendChild(el('p.pr-note', 'Bundle price: saves ' + money(b.bundle_savings_cents) + ' against the services booked separately (already in the line above).'));
    if (b.location_type === 'mobile') out.appendChild(el('div.pr-line', el('span', 'Mobile'), el('span.tnum', money(b.mobile_cents))));
    if (b.extra_cost_cents != null) out.appendChild(el('div.pr-line', el('span', 'Extra' + (b.extra_cost_note ? ' · ' + b.extra_cost_note : '')), el('span.tnum', money(b.extra_cost_cents))));
    out.appendChild(el('div.pr-total', el('span', 'Total'), el('span.tnum', b.total_cents == null ? 'Pending: ' + pendingWords(b) : money(b.total_cents))));
    return out;
  }
  function panel(b) {
    const p = st.panel;
    const close = () => { st.panel = null; render(); };
    const noteField = (label) => field({ id: 'p_note', label, multiline: true, rows: 2, maxlength: 1000, value: p.note || '', oninput: (e) => { p.note = e.target.value; } });
    // No text goes out from here (texts aren't set up): the owner calls or texts. A note on Decline, Cancel or Ask for
    // info is not private, though: the database puts it in an account customer's notices and booking history
    // (on_appointment_change, my_bookings); a guest booking has no account, so a guest never sees it.
    const callNote = () => el('p.bk-note', 'No text is sent from here. Call or text ', b.contact_phone ? tel(phonePretty(b.contact_phone)) : 'the customer', '. The note is kept in the booking history.');
    const seenNote = ' (the customer can read it if they booked with an account)';
    const box = el('div.adm-panel');
    if (p.kind === 'decline') box.append(el('h3.bk-h2', 'Decline this request'), callNote(), noteField('Note' + seenNote), actions(() => act('decline_booking', { p_id: b.id, p_note: p.note || null }, 'Declined. Call or text the customer.'), 'Decline'));
    if (p.kind === 'cancel') box.append(el('h3.bk-h2', 'Cancel this booking'), callNote(), noteField('Note' + seenNote), actions(() => act('cancel_booking', { p_id: b.id, p_note: p.note || null }, 'Cancelled. Call or text the customer.'), 'Cancel booking'));
    if (p.kind === 'info') box.append(el('h3.bk-h2', 'Ask the customer for more information'), callNote(), noteField('What you need to know' + seenNote), actions(() => { if (!(p.note || '').trim()) return toast('Write what you need to know.'); act('ask_for_information', { p_id: b.id, p_note: p.note }, 'Marked as waiting for the customer. Call or text them.'); }, 'Mark as waiting'));
    if (p.kind === 'price') box.append(el('h3.bk-h2', b.price_pending ? 'Set the extra cost' : 'Extra cost'),
      el('p.bk-muted', b.price_pending ? 'Pending for: ' + pendingWords(b) + '. Enter the extra amount on top of the menu price (0 if none).' : 'Added on top of the menu price.'),
      el('div.bk-row.two', field({ id: 'p_cents', label: 'Extra amount ($)', inputmode: 'decimal', value: p.cents, oninput: (e) => { p.cents = e.target.value; } }), field({ id: 'p_note2', label: 'What for', optional: true, value: p.note, maxlength: 200, oninput: (e) => { p.note = e.target.value; } })),
      actions(() => {
        // read as typed: "$1,200.50" is 1200.50; a comma only as a thousands mark ("12,50" is refused, never $1,250);
        // anything else is refused, never guessed ("1,200" was once $1.00)
        const raw = String(p.cents || '0').replace(/\s/g, '');
        if (!/^\$?(\d{1,3}(,\d{3})+|\d{1,5})(\.\d{1,2})?$/.test(raw)) return toast('Enter an amount like 25 or 25.50.');
        const v = raw.replace(/[$,]/g, '');
        act('set_extra_cost', { p_id: b.id, p_cents: Math.round(parseFloat(v) * 100), p_note: p.note || null }, 'Price set');
      }, 'Save price'));
    if (p.kind === 'lane') box.append(el('h3.bk-h2', 'Move to a lane'), choices({ id: 'p_lane', value: b.queue, size: 'chip', items: LANES.map(([c, l]) => ({ code: c, label: l })), onchange: (c) => { p.lane = c; } }), noteField('Note (optional)'), actions(() => act('set_booking_lane', { p_id: b.id, p_lane: p.lane || b.queue, p_note: p.note || null }, 'Moved'), 'Move'));
    if (p.kind === 'assign') box.append(el('h3.bk-h2', 'Who does this job?'),
      el('div.chips', (st.staffList || []).filter((s) => s.is_active).map((s) => { const on = b.assignments.some((a) => a.employee_id === s.id); return el('button.choice-item', { type: 'button', class: on ? 'on' : '', onclick: () => act(on ? 'unassign_employee' : 'assign_employee', { p_appointment: b.id, p_employee: s.id }, on ? 'Unassigned' : 'Assigned') }, el('span.choice-name', personName(s) + ' · ' + roleOf(s.role))); })),
      actions(null, null));
    if (p.kind === 'time') {
      // set_booking_time checks the new time with the team's rules (the booking itself left out, any day from today);
      // the chips are the free times under those same rules (staff_availability, Migration 007 part 3; where it isn't
      // applied yet, the customers' times), and the current start and any typed start are offered too
      const typed = (v) => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
      const unmark = () => box.querySelectorAll('.choice-item.time').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      const chip = (m, label) => el('button.choice-item.time', { type: 'button', class: p.start === m ? 'on' : '', 'aria-pressed': p.start === m ? 'true' : 'false',
        onclick: (e) => { p.start = m; p.other = ''; const o = box.querySelector('#p_other'); if (o) o.value = ''; unmark(); e.currentTarget.classList.add('on'); e.currentTarget.setAttribute('aria-pressed', 'true'); } }, label || clock(m));
      // the free times for the day and length now in the fields, drawn in place (a new length is asked again when
      // its field is left for anything but Save or Back, or on Enter, and the old chips stay, dimmed, until the
      // answer comes, so nothing moves under a press on Save; Save waits for it)
      const timesBox = el('div.adm-times');
      // the database takes starts on its own grid only (open_starts, every slot_step_min): the label and the hint
      // under Other start say the same grid, and Save says so too, not "isn't free"
      const step = (settings && settings.slot_step_min) || 30;
      const stepText = 'on the ' + (step === 30 ? 'hour or half hour' : step + '-minute mark');
      // where staff_availability isn't on the database yet, the list is the customers' times (forCustomers): said so,
      // since the team's rule takes more (today, and the times next to this booking)
      const custLabel = 'Times open to customers (the team can also type another start ' + stepText + ')';
      const timesLabel = el('p.choice-label', p.forCustomers ? custLabel : 'Free times');
      const fillTimes = () => {
        const same = p.date === b.service_date;
        const listed = (p.times || []).filter((m) => !(same && m === b.start_min));
        timesLabel.textContent = p.forCustomers ? custLabel : 'Free times';
        timesBox.removeAttribute('aria-busy'); timesBox.style.opacity = '';
        timesBox.replaceChildren(p.times == null ? el('p.bk-muted', 'Checking free times…')
          : listed.length ? el('div.chips', listed.map((m) => chip(m)))
          : p.forCustomers ? el('p.bk-muted', 'No customer times that day for this length. ' + (same ? 'Keep the time, or type' : 'You can still type') + ' a start time below; the database checks it.')
          : el('p.bk-muted', same ? 'None that day for this length. Keep the time, or type a start time below.' : 'None that day for this length. Type a start time below, or pick another day.'));
      };
      const askTimes = () => {
        const len = p.duration || b.duration_min, ask = p.date + ':' + len;
        if (p.timesFor === ask && p.times != null) return fillTimes();
        const shown = timesBox.childNodes.length > 0;
        p.timesFor = ask; p.times = null;
        if (shown) { timesBox.setAttribute('aria-busy', 'true'); timesBox.style.opacity = '.45'; } else fillTimes();
        // kept, so a Save pressed while it is on its way waits for it (Safari doesn't focus a pressed button, so the
        // Length field's blur can't tell that Save was pressed, and the request starts under the press)
        p.asking = D.staffTimes(b, p.date, len).then((t) => {
          if (st.panel !== p || p.timesFor !== ask) return;
          p.times = t || [];
          p.forCustomers = !!(t && t.forCustomers);
          // a chip picked for the old length that the new list doesn't have is let go (the Keep chip and a typed start stay)
          if (p.start != null && !p.other && !(p.date === b.service_date && p.start === b.start_min) && !p.times.includes(p.start)) p.start = null;
          fillTimes();
        }).catch((e) => { if (st.panel === p && p.timesFor === ask) { p.times = []; fillTimes(); toast(e.message); } });
      };
      const lenField = field({ id: 'p_dur', label: 'Length (minutes)', inputmode: 'numeric', value: String(p.duration || b.duration_min),
        oninput: (e) => { p.duration = parseInt(e.target.value, 10) || b.duration_min; },
        onblur: (e) => { if (b.status !== 'in_progress' && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.acct-actions'))) askTimes(); },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); if (b.status !== 'in_progress') askTimes(); } } });
      const commit = (ok) => { if (p.start == null) return toast('Pick a start time, or type one.'); if (p.start % step && p.start !== b.start_min) return toast('Start times go every ' + step + ' minutes, like 1 PM or 1:30 PM.'); act('set_booking_time', { p_id: b.id, p_date: p.date, p_start_min: p.start, p_duration_min: p.duration || null, p_note: null }, ok); };
      // the free times for a new length still on their way: Save waits for them (once), then checks the start against
      // the new list; a day or length changed meanwhile drops the press
      const save = (ok) => actions(() => {
        if (b.status === 'in_progress' || p.times != null) return commit(ok);
        if (!p.asking) return toast('Wait for the free times.');
        if (p.saveWaiting) return;
        const ask = p.timesFor;
        p.saveWaiting = true;
        p.asking.then(() => { p.saveWaiting = false; if (st.panel === p && p.timesFor === ask && p.times != null) commit(ok); });
      }, 'Save');
      if (b.status === 'in_progress') {
        // a started job keeps its day and start; it can only get shorter
        box.append(el('h3.bk-h2', 'Change the length'), el('p.bk-muted', 'The job has started: it keeps its day and start (' + clock(b.start_min) + ') and can only get shorter.'), lenField, save('Length changed'));
        return box;
      }
      box.append(el('h3.bk-h2', 'Change the time'),
        el('div.bk-row.two', field({ id: 'p_date', label: 'Day', type: 'date', value: p.date, oninput: (e) => { p.date = e.target.value; p.start = null; p.other = ''; p.times = null; render(); } }), lenField),
        // (box.append is the DOM's own: a null there would be written out as the word "null")
        p.date === b.service_date ? el('div.chips', chip(b.start_min, 'Keep ' + clock(b.start_min))) : '',
        timesLabel,
        timesBox,
        field({ id: 'p_other', label: 'Other start time', optional: true, type: 'time', value: p.other || '', hint: 'Any start ' + stepText + '; the database checks it against the other jobs and the hours.', step: step * 60,
          // a cleared (or unfinished) entry picks nothing: Save then asks for a start, never the one that was cleared
          oninput: (e) => { p.other = e.target.value; const m = typed(p.other); p.start = m; unmark(); } }),
        save('Time changed'));
      askTimes();
    }
    function actions(go, label) { return el('div.acct-actions', go ? el('button.btn.btn-gold', { type: 'button', onclick: go }, label) : null, el('button.btn.btn-glass', { type: 'button', onclick: close }, go ? 'Back' : 'Close')); }
    return box;
  }

  // "Are you sure?" before Confirm (the owner, Nov 7). Confirm only opens this check; 'Yes, I’m sure' confirms. It is
  // drawn in place, with no redraw and no scrolling: the actions row steps aside and Go back stands exactly where
  // Confirm was (a quick second tap lands on it, and only closes the check), the question beside it; the booking in a
  // few lines below, and 'Yes, I’m sure' at the far end of the box, a summary's height below the finger, never under
  // it. Yes takes no tap for SURE_WAIT ms (a gold line fills it; with reduced motion it simply lights when ready), and
  // one tap only: a second one while the database answers does nothing. Escape and Go back close it, back to Confirm.
  const SURE_WAIT = 700;
  function askSure(b, btn) {
    if (!btn || btn.disabled || b.price_pending || !['requested', 'needs_information'].includes(b.status)) return;
    const row = btn.closest('.adm-actions'), body = row && row.parentNode;
    if (!body) return;
    closeSure(false);
    // a panel open under this booking (Decline, Change time…) gives way, and its button is no longer marked
    if (st.panel) {
      st.panel = null;
      body.querySelectorAll(':scope > .adm-panel').forEach((x) => x.remove());
      row.querySelectorAll('.btn.on').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-expanded', 'false'); });
    }
    const at = btn.getBoundingClientRect();
    const s = { id: b.id, btn, row, ready: false, busy: false, timer: 0 };
    const initial = (t) => (t ? t.trim().charAt(0).toUpperCase() + '.' : '');
    const who = [b.contact_first, initial(b.contact_last)].filter(Boolean).join(' ') || 'Customer';
    const hid = 'sure-h-' + b.id;
    const h = el('h3.bk-h2.adm-sure-h', { id: hid, tabindex: '-1' }, 'Are you sure?');
    const back = el('button.btn.btn-glass.adm-sure-back', { type: 'button', style: { minWidth: Math.ceil(at.width) + 'px' }, onclick: () => { if (!s.busy) closeSure(true); } }, 'Go back');
    const yes = el('button.btn.btn-gold.adm-sure-yes.arming', { type: 'button', 'aria-disabled': 'true', style: { '--wait': SURE_WAIT + 'ms' }, onclick: go }, 'Yes, I’m sure');
    const err = el('p.adm-sure-err', { role: 'alert', hidden: true });
    const line = (k, v, cls) => [el('dt', k), el('dd', cls ? { class: cls } : null, v)];
    s.wrap = el('div.adm-sure', { role: 'group', 'aria-labelledby': hid },
      el('div.adm-actions.adm-sure-top', back, h),
      el('div.adm-panel.adm-sure-box',
        el('dl.adm-sure-sum',
          line('Customer', who),
          // the day and start as booked: the database keeps them in Parker's time, whatever this device's clock says
          line('When', [longDate(b.service_date), el('br'), clock(b.start_min) + ' (Parker time)\u00a0· ' + minutesText(b.duration_min).replace(/ /g, '\u00a0')]),
          line('Services', services(b) || '—'),
          line('Vehicle', (vehicle(b) || '—').replace(/ · /g, '\u00a0· ') + (b.vehicle_size === 'xl' ? '\u00a0· XL' : '')),
          line('Where', b.location_type === 'mobile' ? 'Mobile\u00a0· ' + where(b) : where(b)),
          line('Total', b.total_cents == null ? 'Pending: ' + pendingWords(b) : money(b.total_cents), 'tnum adm-sure-total')),
        el('p.bk-muted', 'Confirming holds this time for the customer. No text is sent from here: after confirming, call or text ', b.contact_phone ? tel(phonePretty(b.contact_phone)) : 'the customer', ' to let them know.'),
        err,
        el('div.acct-actions', yes)));
    function go() {
      if (st.sure !== s || !s.ready || s.busy) return;
      s.busy = true; err.hidden = true;
      yes.setAttribute('aria-disabled', 'true'); yes.setAttribute('aria-busy', 'true'); yes.textContent = 'Confirming…';
      back.setAttribute('aria-disabled', 'true');
      act('confirm_booking', { p_id: b.id }, 'Confirmed', (e) => {
        if (st.sure !== s || !s.wrap.isConnected) return;
        // the database said no (the time was taken, the price is pending…): its words stay in the check
        s.busy = false; err.textContent = e.message || 'That didn’t work.'; err.hidden = false;
        yes.removeAttribute('aria-disabled'); yes.removeAttribute('aria-busy'); yes.textContent = 'Yes, I’m sure';
        back.removeAttribute('aria-disabled');
      }).then(() => {
        // a refusal has cleared busy, and a list read again has drawn the screen afresh (the check went with it); still
        // busy and on the page means the database confirmed it but the list couldn't be read again: say so, and let
        // Go back and Escape close the check (Yes stays off: no second confirm)
        if (st.sure !== s || !s.busy || !s.wrap.isConnected) return;
        s.busy = false; s.ready = false;
        yes.removeAttribute('aria-busy'); yes.textContent = 'Confirmed';
        back.removeAttribute('aria-disabled');
        err.classList.add('ok'); err.textContent = 'Confirmed. The list could not be read again: tap Refresh to see it.'; err.hidden = false;
      });
    }
    st.sure = s;
    row.hidden = true;
    body.insertBefore(s.wrap, row.nextSibling);
    // Go back exactly where Confirm was (should anything above have moved, the page follows by that much)
    const dy = back.getBoundingClientRect().top - at.top;
    if (Math.abs(dy) > 1) window.scrollBy(0, dy);
    h.focus({ preventScroll: true });
    s.timer = setTimeout(() => { if (st.sure !== s) return; s.ready = true; yes.classList.remove('arming'); if (!s.busy) yes.removeAttribute('aria-disabled'); }, SURE_WAIT);
  }
  function closeSure(focusBack) {
    const s = st.sure;
    st.sure = null;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.wrap && s.wrap.isConnected) s.wrap.remove();
    if (s.row.isConnected) s.row.hidden = false;
    if (focusBack && s.btn.isConnected) s.btn.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', (e) => {
    const s = st.sure;
    if (e.key !== 'Escape' || !s || e.defaultPrevented) return;
    if (!s.wrap.isConnected) { st.sure = null; return; }   // the screen was drawn again: the check went with it
    const a = document.activeElement;
    if (s.busy || (a && a !== document.body && !root.contains(a))) return;   // the menu (or anything outside the console) has the key
    e.preventDefault(); closeSure(true);
  });

  // A booking opened from another list (the calendar, Customers, a team message): a request in its lane under
  // Requests, anything else on the calendar's week, with its card (details and actions) under the days.
  function openBooking(b) {
    st.open = b.id; st.panel = null;
    if (['requested', 'needs_information'].includes(b.status)) { screen = 'requests'; st.lane = b.queue; }
    else { screen = 'calendar'; st.calDay = b.service_date; }
    history.replaceState(history.state, '', '#admin-' + screen);
    render().then(() => { const c = root.querySelector('.appt.open'); if (c) c.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
  }

  // ---------------------------------------------------------------- screens
  async function morning() {
    const today = H().isoDate(bizToday()), tomorrow = H().isoDate(H().addDays(bizToday(), 1));
    const all = st.bookings || [];
    const live = (b) => OPEN.includes(b.status);
    // what holds time that day, the Calendar's rule: a request in the Spam lane holds none and stays in its lane
    const holds = (b) => live(b) && !(['requested', 'needs_information'].includes(b.status) && b.queue === 'spam');
    const byHold = (a, b) => ((a.hold_expires_at || '') < (b.hold_expires_at || '') ? -1 : 1);
    const todays = all.filter((b) => b.service_date === today && holds(b));
    const needs = all.filter((b) => (b.status === 'requested' && b.queue !== 'spam') || (b.price_pending && holds(b))).sort(byHold);
    const tmr = all.filter((b) => b.service_date === tomorrow && holds(b));
    const minutes = todays.reduce((a, b) => a + b.duration_min + (b.location_type === 'mobile' ? 10 : 0), 0);   // the 10-minute travel gap counts (doc 27, V-4)
    const needIds = new Set(needs.map((b) => b.id));
    // asked for information: the owner calls or texts, and the request stays in view (with its hold) until answered
    const waiting = all.filter((b) => b.status === 'needs_information' && b.queue !== 'spam' && !needIds.has(b.id)).sort(byHold);
    // a job left confirmed or started after its day stays here until it is completed or cancelled (Start is only on
    // the job's own day)
    const earlier = all.filter((b) => b.service_date < today && ['confirmed', 'in_progress'].includes(b.status));
    // a booking that needs a decision opens under Needs you (or Waiting on the customer) only; its copy under Today
    // or Tomorrow is compact
    const inNeeds = new Set([...needs, ...waiting].map((b) => b.id));
    const tiles = el('div.adm-tiles',
      tile('today', todays.length, 'jobs today', minutesText(minutes) + ' booked', () => jump('today')),
      tile('needs', needs.length, 'need you', needs.length ? 'oldest hold: ' + (needs[0].hold_expires_at ? hoursLeft(needs[0].hold_expires_at) : '—') : 'all clear', () => jump('needs')),
      tile('tomorrow', tmr.length, 'tomorrow', '', () => jump('tomorrow')),
      // the Review lane's own count: requests waiting for a decision there (a confirmed booking keeps its lane)
      tile('admin-requests', all.filter((b) => b.queue === 'review' && ['requested', 'needs_information'].includes(b.status)).length, 'in review', '', () => { st.lane = 'review'; screen = 'requests'; history.replaceState(history.state, '', '#admin-requests'); render(); }));
    if (st.asks == null) { try { await loadTeamAsks(); } catch (e) { st.asks = { reviews: [], jobs: [], error: e.message }; } }
    // the team today (doc 20: the morning view shows the team): each active member with the times of the jobs assigned
    // to them today. Time off isn't recorded yet, so it never says who is off or available
    if (st.staffList == null) { try { await loadStaff(); } catch (e) { st.staffList = []; } }
    const crew = (st.staffList || []).filter((s) => s.is_active).map((s) => {
      const mine = todays.filter((b) => (b.assignments || []).some((a) => a.employee_id === s.id)).sort((a, b) => a.start_min - b.start_min);
      return el('li', el('b', [s.first_name, s.last_name].filter(Boolean).join(' ') || roleOf(s.role)), el('span.bk-muted', mine.length ? mine.map((b) => clock(b.start_min)).join(', ') : 'No jobs today'));
    });
    return el('div.bk-grid', tiles,
      crew.length ? el('div.adm-crew', el('h2', 'Team today'), el('ul', crew)) : null,
      earlier.length ? section('Earlier, not finished', earlier, '', { id: 'earlier' }) : null,
      section('Today', todays, 'Nothing on today.', { id: 'today', compact: inNeeds, day: true }),
      section('Needs you', needs, 'No requests waiting.', { id: 'needs' }),
      waiting.length ? section('Waiting on the customer', waiting, '', { id: 'waiting' }) : null,
      teamAsks(),
      section('Tomorrow', tmr, 'Nothing booked for tomorrow yet.', { id: 'tomorrow', compact: inNeeds, day: true }));
  }

  // What the team sent from the Team page: "Ask the owner" (review_requests) and "Ask for this job" (job_requests).
  // Both tables point at profiles twice (who asked, who answered), so the links are named.
  async function loadTeamAsks() {
    if (!D.isLive) { st.asks = { reviews: [], jobs: [] }; return st.asks; }
    const [r, j] = await Promise.all([
      sb().from('review_requests').select('id,appointment_id,message,for_admin,created_at,who:profiles!review_requests_requested_by_fkey(first_name,last_name,email),booking:appointments!review_requests_appointment_id_fkey(ref,service_date,start_min)').eq('status', 'open').order('created_at'),
      sb().from('job_requests').select('id,appointment_id,message,created_at,who:profiles!job_requests_employee_id_fkey(first_name,last_name,email),booking:appointments!job_requests_appointment_id_fkey(ref,service_date,start_min)').eq('status', 'open').order('created_at')]);
    const err = r.error || j.error;
    if (err) throw D.fail('load_failed', 'The team’s messages couldn’t load: ' + err.message);
    st.asks = { reviews: r.data || [], jobs: j.data || [] };
    return st.asks;
  }
  function teamAsks() {
    const a = st.asks || { reviews: [], jobs: [] };
    if (!a.reviews.length && !a.jobs.length && !a.error) return null;
    const when = (x) => x.booking ? shortDate(x.booking.service_date) + ' · ' + clock(x.booking.start_min) + ' · ' + x.booking.ref : '';
    const open = (x) => { const b = (st.bookings || []).find((y) => y.id === x.appointment_id); return b ? el('button.link', { type: 'button', onclick: () => openBooking(b) }, 'Open booking') : null; };
    const go = async (fn, args, ok) => { try { if (D.isLive) await D.rpc(fn, args); toast(ok); st.asks = null; await loadBookings(); render(); } catch (e) { toast(e.message); } };
    return el('section.acct-sec', { id: 'team-asks' }, el('h2.bk-h2', 'From the team'),
      a.error ? el('p.bk-note', a.error) : null,
      a.reviews.map((x) => el('div.veh', el('div.veh-main', el('b', personName(x.who) + ' asks'), el('span.bk-muted', when(x)), x.message ? el('p.adm-quote', x.message) : null),
        el('div.veh-actions', open(x), el('button.link', { type: 'button', onclick: () => go('resolve_review', { p_review: x.id, p_resolution: null }, 'Marked as answered') }, 'Mark answered')))),
      a.jobs.map((x) => el('div.veh', el('div.veh-main', el('b', personName(x.who) + ' asks for this job'), el('span.bk-muted', when(x)), x.message ? el('p.adm-quote', x.message) : null),
        el('div.veh-actions', open(x),
          el('button.link', { type: 'button', onclick: () => go('decide_job_request', { p_request: x.id, p_approve: true }, 'Assigned') }, 'Give them the job'),
          el('button.link', { type: 'button', onclick: () => go('decide_job_request', { p_request: x.id, p_approve: false }, 'Declined') }, 'Decline')))));
  }
  // a count is a link to its list: the three sections of this screen, or the Review lane
  const tile = (href, n, label, sub, go) => el('a.adm-tile', { href: '#' + href, onclick: (e) => { e.preventDefault(); go(); } }, el('b.tnum', String(n)), el('span', label), sub ? el('small', sub) : null);
  const jump = (id) => { const s = root.querySelector('#' + id); if (s) s.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
  const section = (title, list, empty, o) => el('section.acct-sec', { id: o && o.id }, el('h2.bk-h2', title), list.length ? list.map((b) => card(b, { compact: !!(o && o.compact && o.compact.has(b.id)), day: !!(o && o.day) })) : el('p.bk-empty', empty));

  async function requests() {
    const all = (st.bookings || []).filter((b) => ['requested', 'needs_information'].includes(b.status));
    const counts = Object.fromEntries(LANES.map(([k]) => [k, all.filter((b) => b.queue === k).length]));
    const list = all.filter((b) => b.queue === st.lane);
    return el('div.bk-grid',
      el('div.chips', LANES.map(([k, l]) => el('button.choice-item', { type: 'button', class: st.lane === k ? 'on' : '', 'aria-pressed': st.lane === k ? 'true' : 'false', onclick: () => { st.lane = k; render(); } }, el('span.choice-name', l + ' · ' + counts[k])))),
      list.length ? list.map((b) => card(b)) : el('p.bk-empty', 'Nothing in this lane.'));
  }

  // The calendar: a week (Monday first, the owner's choice of Oct 11) or one day. Today's column is lit, the days gone are dimmed and keep
  // no Close day link; the head shows the range on screen. A booking opens where it is decided: a request
  // under Requests (its lane), anything else right here, its card under the days (any day ahead, not only
  // today and tomorrow, which are all Morning lists).
  async function calendar() {
    if (st.blocked == null) { try { await loadBlocked(); } catch (e) { st.blocked = []; } }
    const todayIso = H().isoDate(bizToday());
    const base = st.calDay ? new Date(st.calDay + 'T00:00:00') : bizToday();
    const days = st.calMode === 'day' ? 1 : 7;
    const start = st.calMode === 'day' ? base : H().addDays(base, -((base.getDay() + 6) % 7));   // back to Monday
    const first = H().isoDate(start), last = H().isoDate(H().addDays(start, days - 1));
    // a request whose hold ran out no longer keeps the time from customers: it is dimmed and says so
    const lapsed = (b) => ['requested', 'needs_information'].includes(b.status) && b.hold_expires_at && new Date(b.hold_expires_at) <= Date.now();
    const item = (b) => el('button.cal-item', { type: 'button', class: 'st-' + b.status + (isGold(b) ? ' gold' : '') + (lapsed(b) ? ' lapsed' : '') + (st.open === b.id ? ' on' : ''), 'aria-expanded': st.open === b.id ? 'true' : 'false', title: name(b) + ' · ' + services(b) + ' · ' + vehicle(b) + (lapsed(b) ? ' · hold expired' : ''), onclick: () => (st.open === b.id ? (st.open = null, st.panel = null, render()) : openBooking(b)) },
      el('b', clock(b.start_min)), ' ', name(b), el('small', services(b) + ' · ' + (b.location_type === 'mobile' ? 'Mobile' : 'Driveway') + (lapsed(b) ? ' · hold expired' : '')), isGold(b) ? el('span.rv-gold', 'Gold') : null);   // the short label: the week's columns are narrow, the card's gold border says the rest
    const cols = [];
    for (let i = 0; i < days; i++) {
      const iso = H().isoDate(H().addDays(start, i)), past = iso < todayIso, today = iso === todayIso;
      // what holds time (and finished jobs); Spam requests hold none and stay in their lane
      const items = (st.bookings || []).filter((b) => b.service_date === iso && !['declined', 'cancelled'].includes(b.status) && !(['requested', 'needs_information'].includes(b.status) && b.queue === 'spam')).sort((a, b) => a.start_min - b.start_min);
      const blocked = (st.blocked || []).find((x) => x.day === iso);
      cols.push(el('div.cal-col', { class: (blocked ? 'blocked' : '') + (past ? ' past' : today ? ' today' : ''), 'aria-current': today ? 'date' : null },
        el('h3.bk-h2', shortDate(iso), blocked ? el('small', ' closed') : null),
        items.length ? items.map(item) : el('p.bk-empty', '—'),
        staff.role === 'admin' && !past ? el('button.link', { type: 'button', onclick: () => toggleBlocked(iso, blocked) }, blocked ? 'Reopen day' : 'Close day') : null));
    }
    const mode = (k, label) => el('button.choice-item', { type: 'button', class: st.calMode === k ? 'on' : '', 'aria-pressed': st.calMode === k ? 'true' : 'false', onclick: () => { st.calMode = k; render(); } }, el('span.choice-name', label));
    const nav = el('div.cal-head',
      el('button.icon-btn.small', { type: 'button', 'aria-label': 'Earlier', onclick: () => { st.calDay = H().isoDate(H().addDays(start, -days)); render(); } }, '‹'),
      el('h2.bk-h2', days === 1 ? longDate(first) : shortDate(first) + ' – ' + shortDate(last)),
      el('button.icon-btn.small', { type: 'button', 'aria-label': 'Later', onclick: () => { st.calDay = H().isoDate(H().addDays(start, days)); render(); } }, '›'),
      el('div.chips', mode('week', 'Week'), mode('day', 'Day'), el('button.link', { type: 'button', onclick: () => { st.calDay = null; render(); } }, 'Today')));
    const notice = el('section.acct-sec', el('h2.bk-h2', 'Note to customers', el('small', 'shown on the booking calendar')),
      field({ id: 'customer_notice', label: 'Your note', optional: true, multiline: true, rows: 2, maxlength: 300, value: st.noticeDraft != null ? st.noticeDraft : (settings.customer_notice || ''), hint: 'Display only. Empty hides it. Closed days are set above.', oninput: (e) => { st.noticeDraft = e.target.value; } }),
      staff.role === 'admin' ? el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveNotice }, 'Save note')) : el('p.bk-muted', 'Only the admin can change it.'));
    const opened = (st.bookings || []).find((b) => b.id === st.open && b.service_date >= first && b.service_date <= last && !['requested', 'needs_information'].includes(b.status));
    return el('div.bk-grid', nav, el('div.cal-cols', { class: st.calMode }, cols), opened ? el('section.acct-sec', { id: 'cal-open' }, card(opened)) : null, notice);
  }
  async function toggleBlocked(iso, blocked) {
    if (!blocked) {
      const n = (st.bookings || []).filter((b) => b.service_date === iso && OPEN.includes(b.status) && b.queue !== 'spam').length;
      if (n && !window.confirm(n + (n === 1 ? ' booking that day stays' : ' bookings that day stay') + ' booked: closing the day doesn’t cancel or move them, and a request that day can’t be confirmed until it is moved. Close the day anyway?')) return;
    }
    try {
      if (!D.isLive) { if (blocked) PREVIEW.blocked = PREVIEW.blocked.filter((x) => x.day !== iso); else PREVIEW.blocked.push({ day: iso, reason: null }); }
      else { const q = blocked ? sb().from('blocked_days').delete().eq('day', iso) : sb().from('blocked_days').insert({ day: iso }); const { error } = await q; if (error) throw error; }
      st.blocked = null; toast(blocked ? 'Day reopened' : 'Day closed'); render();
    } catch (e) { toast(e.message || 'Not allowed'); }
  }
  async function saveNotice() {
    const text = (st.noticeDraft != null ? st.noticeDraft : settings.customer_notice || '').trim() || null;
    try {
      if (D.isLive) { const { error } = await sb().from('business_settings').update({ customer_notice: text, updated_at: new Date().toISOString() }).eq('id', 1); if (error) throw error; }
      settings.customer_notice = text; st.noticeDraft = null; toast('Note saved');
    } catch (e) { toast(e.message || 'Not allowed'); }
  }

  async function reviewsScreen() {
    if (st.reviews == null) { try { st.reviews = await D.allReviews(); } catch (e) { st.reviews = []; toast(e.message); } }
    const groups = [['pending', 'Waiting for you'], ['approved', 'Published'], ['hidden', 'Hidden']];
    const stars = (n) => '\u2726'.repeat(n) + '\u2727'.repeat(5 - n);
    const card = (r) => el('article.appt.adm', { class: (r.is_gold ? 'gold ' : '') + 'open' },
      el('div.appt-body',
        el('div.rv-head', el('span.stars', stars(r.rating)), el('b', r.display_name), r.is_gold ? el('span.rv-gold', 'Gold detail') : null, el('span.bk-muted', new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))),
        el('p.adm-quote', r.body),
        r.owner_reply ? el('p.bk-muted', 'Your reply: ' + r.owner_reply) : null,
        el('div.adm-actions',
          r.status !== 'approved' ? el('button.btn.btn-gold', { type: 'button', onclick: () => rv('reviewSetStatus', r.id, 'approved', 'Published') }, 'Approve') : null,
          r.status !== 'hidden' ? el('button.btn.btn-glass', { type: 'button', onclick: () => rv('reviewSetStatus', r.id, 'hidden', 'Hidden') }, 'Hide') : null,
          el('button.btn.btn-glass', { type: 'button', onclick: () => { st.panel = { kind: 'reply', id: r.id, note: r.owner_reply || '' }; render(); } }, r.owner_reply ? 'Edit reply' : 'Reply')),
        st.panel && st.panel.kind === 'reply' && st.panel.id === r.id ? el('div.adm-panel', field({ id: 'p_reply', label: 'Your public reply', multiline: true, rows: 2, maxlength: 1000, value: st.panel.note, oninput: (e) => { st.panel.note = e.target.value; } }),
          el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => rv('reviewReply', r.id, st.panel.note, 'Reply saved') }, 'Save reply'), el('button.btn.btn-glass', { type: 'button', onclick: () => { st.panel = null; render(); } }, 'Back'))) : null));
    async function rv(fn, id, arg, ok) { try { await D[fn](id, arg); st.reviews = null; st.panel = null; toast(ok); render(); } catch (e) { toast(e.message); } }
    const link = el('section.acct-sec', el('h2.bk-h2', 'Google reviews link', el('small', 'shown on the Reviews page when set')),
      field({ id: 'google_url', label: 'Link', optional: true, type: 'url', value: st.googleDraft != null ? st.googleDraft : (settings.google_reviews_url || ''), hint: 'Starts with https://', oninput: (e) => { st.googleDraft = e.target.value; } }),
      staff.role === 'admin' ? el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveGoogle }, 'Save link')) : null);
    return el('div.bk-grid', groups.map(([k, title]) => { const list = st.reviews.filter((r) => r.status === k); return el('section.acct-sec', el('h2.bk-h2', title + ' \u00b7 ' + list.length), list.length ? list.map(card) : el('p.bk-empty', k === 'pending' ? 'No reviews waiting.' : '\u2014')); }), link);
  }
  async function saveGoogle() {
    const text = (st.googleDraft != null ? st.googleDraft : settings.google_reviews_url || '').trim() || null;
    if (text && !/^https:\/\//.test(text)) return toast('The link must start with https://');
    try {
      if (D.isLive) { const { error } = await sb().from('business_settings').update({ google_reviews_url: text, updated_at: new Date().toISOString() }).eq('id', 1); if (error) throw error; }
      settings.google_reviews_url = text; st.googleDraft = null; toast('Link saved');
    } catch (e) { toast(e.message || 'Not allowed'); }
  }

  // a customer's next booking from today, else their most recent one (the list runs oldest first)
  function pickBooking(list) {
    const today = H().isoDate(bizToday());
    const when = (b) => b.service_date + ':' + String(b.start_min).padStart(4, '0');
    const next = list.filter((b) => b.service_date >= today && !['declined', 'cancelled'].includes(b.status)).sort((x, y) => (when(x) < when(y) ? -1 : 1))[0];
    return next || list.slice().sort((x, y) => (when(x) < when(y) ? 1 : -1))[0];
  }
  async function customers() {
    const q = st.search.trim().toLowerCase();
    const all = st.bookings || [];
    const byCust = {};
    all.forEach((b) => { const k = b.customer_id || b.contact_phone || b.id; (byCust[k] = byCust[k] || { name: name(b), phone: b.contact_phone, email: b.contact_email, bookings: [] }).bookings.push(b); });
    const rows = Object.entries(byCust).filter(([, c]) => !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, '') || '§')).sort((a, b) => a[1].name.localeCompare(b[1].name));
    return el('div.bk-grid',
      field({ id: 'search', label: 'Search by name or phone', value: st.search, oninput: U.debounce((e) => { st.search = e.target.value; render(); }, 250) }),
      el('p.bk-muted', 'Customers with a booking in the last 30 days or ahead. Gold clients (a paid detail of $200 or more) are marked once payments are recorded (Migration 002, later).'),
      rows.length ? rows.map(([k, c]) => el('div.veh', el('div.veh-main', el('b', c.name), el('span.bk-muted', phonePretty(c.phone || '') + (c.email ? ' · ' + c.email : '') + ' · ' + c.bookings.length + ' booking' + (c.bookings.length === 1 ? '' : 's'))),
        el('div.veh-actions', el('button.link', { type: 'button', onclick: () => openBooking(pickBooking(c.bookings)) }, 'Open booking')))) : el('p.bk-empty', 'No one matches.'));
  }

  async function team() {
    if (st.staffList == null) { try { await loadStaff(); } catch (e) { st.staffList = []; } }
    const admin = staff.role === 'admin';
    return el('div.bk-grid',
      el('p.bk-muted', 'The team: detailers, managers and the admin. Managers and the admin sign in with an authenticator code.'),
      (st.staffList || []).map((s) => el('div.veh', el('div.veh-main', el('b', [s.first_name, s.last_name].filter(Boolean).join(' ') || (s.phone ? phonePretty(s.phone) : s.email) || 'No name'), el('span.bk-muted', [roleOf(s.role), s.phone ? phonePretty(s.phone) : null, s.is_active ? null : 'inactive'].filter(Boolean).join(' · '))),
        admin && s.id !== staff.userId ? el('div.veh-actions',
          // the admin role isn't changed from here (set_user_role keeps one admin)
          s.role !== 'admin' ? el('button.link', { type: 'button', onclick: () => setRole(s) }, 'Change role') : null,
          el('button.link', { type: 'button', onclick: () => setActive(s) }, s.is_active ? 'Deactivate' : 'Activate')) : null)),
      admin ? el('section.acct-sec', el('h2.bk-h2', 'Add a team member'),
        textCodes() ? el('p.bk-note', 'Enter their mobile number and first name. They sign in with a text code like everyone else; managers add an authenticator the first time.')
          : el('p.bk-note', 'Enter their mobile number and first name. Team members can’t sign in until text codes are set up (Twilio): the account is ready for then, so don’t assign them jobs yet. Managers add an authenticator the first time.'),
        el('div.bk-row.two', field({ id: 't_phone', label: 'Mobile phone', type: 'tel', value: st.tPhone || '', oninput: (e) => { st.tPhone = e.target.value; } }), field({ id: 't_first', label: 'First name', value: st.tFirst || '', oninput: (e) => { st.tFirst = e.target.value; } })),
        choices({ id: 't_role', label: 'Role', size: 'chip', value: st.tRole || 'detailer', items: [{ code: 'detailer', label: 'Detailer' }, { code: 'manager', label: 'Manager' }], onchange: (c) => { st.tRole = c; } }),
        el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: addMember }, 'Create account'))) : null);
  }
  async function setRole(s) {
    const next = { detailer: 'manager', manager: 'detailer' }[s.role];
    if (!next) return;
    if (!window.confirm('Make ' + personName(s) + ' a ' + roleOf(next).toLowerCase() + '?' + (next === 'manager' ? ' Managers see every booking and customer once they add an authenticator.' : ''))) return;
    try { if (D.isLive) await D.rpc('set_user_role', { p_user: s.id, p_role: next }); else s.role = next; st.staffList = null; toast('Role: ' + roleOf(next)); render(); } catch (e) { toast(e.message); }
  }
  async function setActive(s) {
    try { if (D.isLive) await D.rpc('set_user_active', { p_user: s.id, p_active: !s.is_active }); else s.is_active = !s.is_active; st.staffList = null; toast(s.is_active ? 'Deactivated' : 'Activated'); render(); } catch (e) { toast(e.message); }
  }
  async function addMember() {
    if (!D.isLive) { PREVIEW.staff.push({ id: 'staff-' + Date.now(), first_name: st.tFirst || 'New', role: st.tRole || 'detailer', phone: H().normalizePhone(st.tPhone || '') || '', is_active: true }); st.staffList = null; toast('Account created (preview)'); render(); return; }
    try {
      const { data: sess } = await sb().auth.getSession();
      const r = await fetch(window.ALCHEMIST_CONFIG.supabaseUrl + '/functions/v1/admin-create-team-account', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.ALCHEMIST_CONFIG.supabaseKey, Authorization: 'Bearer ' + sess.session.access_token }, body: JSON.stringify({ phone: st.tPhone, first_name: st.tFirst, role: st.tRole || 'detailer' }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail || j.error || 'Could not create the account.');
      st.staffList = null; st.tPhone = ''; st.tFirst = ''; toast('Account created'); render();
    } catch (e) { toast(e.message); }
  }

  // Text codes work once Twilio Verify is connected (config.js textCodes); until then a phone-only team login can't sign in.
  const textCodes = () => !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.textCodes);

  // Hours closed every week (Migration 003), e.g. "Mon–Thu 4:00 PM – 8:00 PM · Fri 12:00 PM – 5:00 PM".
  function closuresText(list) {
    if (!list || !list.length) return 'None';
    const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const groups = [];
    list.slice().sort((a, b) => a.weekday - b.weekday || a.start_min - b.start_min).forEach((w) => {
      const span = clock(w.start_min) + ' – ' + clock(w.end_min);
      const g = groups[groups.length - 1];
      if (g && g.span === span && g.last === w.weekday - 1) { g.last = w.weekday; } else groups.push({ first: w.weekday, last: w.weekday, span });
    });
    return groups.map((g) => (g.first === g.last ? DAY[g.first] : DAY[g.first] + '–' + DAY[g.last]) + ' ' + g.span).join(' · ');
  }
  // Whether the owner's address is on file: true, false, or null when it couldn't be checked. The admin-only
  // database function answers yes or no (the address column is the admin's alone, doc 46); a database without it
  // yet is asked the old way, where the row comes back only when the address is set (the address itself never).
  async function addressOnFile() {
    const { data, error } = await sb().rpc('shop_address_on_file');
    if (!error) return data === true;
    if (error.code === 'PGRST202' || /could not find|not found|does not exist/i.test(error.message || '')) {
      const { data: on, error: e2 } = await sb().from('business_settings').select('id').eq('id', 1).not('shop_address', 'is', null).maybeSingle();
      return e2 ? null : !!on;
    }
    return null;
  }
  const SETTINGS_COLS = 'first_start_min,last_start_min,slot_step_min,latest_end_min,min_days_ahead,max_days_ahead,hold_hours,max_shop_jobs,max_mobile_jobs,shop_buffer_min,mobile_buffer_min,public_phone,public_area,mobile_radius_miles,require_mfa_for_managers';
  async function settingsScreen() {
    let s = Object.assign({}, settings);
    if (D.isLive) {
      // the working rules this screen shows (get_public_settings has none of them), never select('*'): the owner's
      // home address stays in the database, for the admin too
      const { data } = await sb().from('business_settings').select(SETTINGS_COLS).eq('id', 1).maybeSingle();
      if (data) Object.assign(s, data);
      // whether an address is on file, asked without reading it; the admin only (a manager never asks)
      if (staff.role === 'admin') s.addressOnFile = await addressOnFile();
    } else s.addressOnFile = false;
    const rows = [['Start times', clock(s.first_start_min) + ' – ' + clock(s.last_start_min) + ', every ' + s.slot_step_min + ' min'], ['Jobs end by', clock(s.latest_end_min)], ['Closed every week', closuresText((settings && settings.weekly_closures) || s.weekly_closures)], ['Book ahead', s.min_days_ahead + ' to ' + s.max_days_ahead + ' days'], ['Hold', s.hold_hours + ' hours'],
      ['At once', (s.max_shop_jobs != null ? s.max_shop_jobs + ' driveway or ' + s.max_mobile_jobs + ' mobile' : '—')], ['Gaps', (s.shop_buffer_min != null ? s.shop_buffer_min + ' min driveway, ' + s.mobile_buffer_min + ' min mobile travel' : '—')],
      ['Phone', s.public_phone], ['Area', s.public_area + ', ' + s.mobile_radius_miles + ' miles'], ['Authenticator required', s.require_mfa_for_managers === false ? 'No' : 'Yes'], staff.role === 'admin' ? ['Your address', s.addressOnFile ? 'On file (sent only with confirmed “Come to us” bookings)' : s.addressOnFile === false ? 'Not set' : 'Couldn’t check right now'] : ['Shop address', 'Private: not shown here']];
    return el('div.bk-grid', el('p.bk-muted', 'Read-only for now. Ask Claude Code to change a value; the calendar note and closed days are under Calendar.'), el('dl.sum-body', rows.map(([k, v]) => [el('dt', k), el('dd', v)])));
  }

  // The log rows are written by the database's audit trigger: action = insert, update or delete, target = the
  // table, with the row before and after (private fields left out). Said in words here.
  const LOG_STATUS = { requested: 'Back to requested', needs_information: 'Asked for info', confirmed: 'Confirmed', in_progress: 'Started', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
  const LOG_TABLE = { appointment_assignments: ['Assigned', 'Assignment changed', 'Unassigned'], blocked_days: ['Day closed', 'Closed day changed', 'Day reopened'], business_settings: ['Settings added', 'Settings changed', 'Settings removed'],
    profiles: ['Account added', 'Account changed', 'Account removed'], reviews: ['Review sent', 'Review changed', 'Review removed'], weekly_closures: ['Weekly hours added', 'Weekly hours changed', 'Weekly hours removed'],
    review_requests: ['Team question', 'Team question answered', 'Team question removed'], job_requests: ['Job asked for', 'Job request answered', 'Job request removed'] };
  const LOG_REVIEW = { review_approved: 'Review published', review_hidden: 'Review hidden', review_pending: 'Review back to waiting' };
  function logText(e) {
    const o = e.old_value || {}, n = e.new_value || {}, i = { insert: 0, update: 1, delete: 2 }[e.action];
    const ch = (k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]);
    // the booking's ref and the team member's name, when the console has them loaded
    const refOf = (id) => { const b = id && (st.bookings || []).find((x) => x.id === id); return b ? ' · ' + b.ref : ''; };
    const who = (id) => { const p = id && (st.staffList || []).find((x) => x.id === id); return p ? ' ' + personName(p) : ''; };
    if (LOG_REVIEW[e.action]) return LOG_REVIEW[e.action];
    if (e.target_type === 'appointments') {
      const ref = (n.ref || o.ref) ? ' · ' + (n.ref || o.ref) : '';
      if (e.action === 'insert') return 'New request' + ref;
      if (e.action === 'delete') return 'Booking removed' + ref;
      if (ch('status')) return (LOG_STATUS[n.status] || n.status) + ref;
      if (ch('queue')) return 'Moved to ' + laneOf(n.queue) + ref;
      if (ch('service_date') || ch('start_min') || ch('duration_min')) return 'Time changed' + ref;
      if (ch('extra_cost_cents')) return 'Price set' + ref + (n.extra_cost_cents != null ? ' (' + money(n.extra_cost_cents) + ' extra)' : '');
      if (n.anonymized_at && !o.anonymized_at) return 'Personal details removed' + ref;
      return 'Booking updated' + ref;
    }
    if (e.target_type === 'appointment_assignments' && i != null) return LOG_TABLE.appointment_assignments[i] + who(n.employee_id || o.employee_id) + refOf(n.appointment_id || o.appointment_id);
    if (e.target_type === 'blocked_days' && i != null) { const day = n.day || o.day; return LOG_TABLE.blocked_days[i] + (day ? ' · ' + shortDate(day) : ''); }
    if (e.target_type === 'profiles' && e.action === 'update') {
      if (ch('role')) return 'Role changed:' + (who(e.target_id) || ' a login') + ' is now ' + roleOf(n.role);
      if (ch('is_active')) return (n.is_active ? 'Activated' : 'Deactivated') + (who(e.target_id) || ' a login');
    }
    if ((e.target_type === 'review_requests' || e.target_type === 'job_requests') && i != null) return LOG_TABLE[e.target_type][i] + refOf(n.appointment_id || o.appointment_id);
    if (e.target_type === 'vehicles' && i != null) return ['Customer added a vehicle', 'Customer changed a vehicle', 'Customer removed a vehicle'][i];
    if (LOG_TABLE[e.target_type] && i != null) return LOG_TABLE[e.target_type][i];
    // the menu and the other settings tables
    return (['Added', 'Changed', 'Removed'][i] || e.action) + ' · ' + String(e.target_type || '').replace(/_/g, ' ');
  }
  async function logScreen() {
    if (st.log == null) {
      if (!D.isLive) { seedPreview(); st.log = PREVIEW.log; }
      else { const { data } = await sb().from('audit_log').select('id,action,target_type,target_id,created_at,actor_id,old_value,new_value').order('created_at', { ascending: false }).limit(100); st.log = data || []; }
    }
    // who did it: a team member by name (a customer's own change, or the system's, has no team name)
    if (st.staffList == null) { try { await loadStaff(); } catch (e) { st.staffList = []; } }
    const by = (id) => { const p = id && (st.staffList || []).find((x) => x.id === id); return p ? ' · ' + personName(p) : ''; };
    // two columns (the time, what happened); the items are display: contents, so the roles say what they are
    return el('div.bk-grid', el('p.bk-muted', 'The last 100 changes, newest first.'), st.log.length ? el('ul.adm-log', { role: 'list' }, st.log.map((e) => el('li', { role: 'listitem' }, el('span.tnum', new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), el('span', logText(e), el('small.bk-muted', by(e.actor_id)))))) : el('p.bk-empty', 'Nothing yet.'));
  }

  window.AlchemistAdmin = { mount, refresh: forget };
})();
