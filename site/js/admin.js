/* Alchemist Detailing — the admin console (#admin), phase 3 (docs 19 and 27).
   For the owner (admin) and managers, after the authenticator step. Every
   action calls a database function; the console never writes to a table
   directly, except the settings and closed days the policies allow the admin
   to edit. Screens: Morning, Requests, Calendar, Customers, Team, Settings, Log. */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, money, minutesText, clock, longDate, shortDate, phonePretty, field, choices, miniBtn, showError, clearError, toast } = U;
  const H = () => D.helpers;

  const SCREENS = [['morning', 'Morning'], ['requests', 'Requests'], ['calendar', 'Calendar'], ['reviews', 'Reviews'], ['customers', 'Customers'], ['team', 'Team'], ['settings', 'Settings'], ['log', 'Log']];
  const LANES = [['requests', 'Requests'], ['review', 'Review'], ['spam', 'Spam']];
  const STATUS = { requested: 'Requested', needs_information: 'Needs info', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled' };
  // the database's codes, in words: roles, what holds a price (quote_booking's pending_reasons) and the log's actions
  const ROLE = { admin: 'Admin', manager: 'Manager', detailer: 'Detailer' };
  const PENDING = { xl: 'XL vehicle', vehicle_price: 'WetGloss on this vehicle type', stains: 'Stains' };
  const ACTION = { confirm_booking: 'Confirmed', decline_booking: 'Declined', ask_for_information: 'Asked for info', cancel_booking: 'Cancelled', start_booking: 'Started', complete_booking: 'Completed', set_booking_lane: 'Moved lane', set_booking_time: 'Changed time', set_extra_cost: 'Set price', assign_employee: 'Assigned', unassign_employee: 'Unassigned' };
  const roleOf = (r) => ROLE[r] || r;
  const pendingWords = (b) => (b.pending_reasons || []).map((c) => PENDING[c] || c).join(', ');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let root = null, staff = null, settings = null, menu = null, screen = 'morning', ready = null;
  const st = { lane: 'requests', bookings: null, open: null, panel: null, calDay: null, calMode: 'week', staffList: null, customers: null, search: '', log: null, blocked: null, mfa: null, signin: { phone: '', sent: false } };

  // ---------------------------------------------------------------- preview data (clearly marked examples)
  const PREVIEW = { bookings: [], staff: [], blocked: [], log: [], customers: [] };
  function seedPreview() {
    if (PREVIEW.bookings.length) return;
    const today = H().todayLocal(), iso = (n) => H().isoDate(H().addDays(today, n));
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
    PREVIEW.log.push({ id: 3, action: 'assign_employee', target_type: 'appointment', target_id: 'ex-7', created_at: new Date().toISOString(), actor_id: 'staff-1' },
      { id: 2, action: 'confirm_booking', target_type: 'appointment', target_id: 'ex-3', created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), actor_id: 'staff-1' },
      { id: 1, action: 'set_extra_cost', target_type: 'appointment', target_id: 'ex-6', created_at: new Date(Date.now() - 26 * 3600e3).toISOString(), actor_id: 'staff-1' });
  }

  // ---------------------------------------------------------------- data (live reads through RLS; actions through functions)
  const sb = () => D.client();
  async function loadBookings() {
    if (!D.isLive) { seedPreview(); st.bookings = PREVIEW.bookings.slice(); return st.bookings; }
    const from = H().isoDate(H().addDays(H().todayLocal(), -30));
    const { data, error } = await sb().from('appointments')
      .select('*, items:appointment_items(code,name,kind,price_cents,mobile_cents,duration_min,included,sort), assignments:appointment_assignments(employee_id, profile:profiles(first_name,last_name)), events:appointment_events(from_status,to_status,from_queue,to_queue,note,created_at)')
      .gte('service_date', from).is('anonymized_at', null).order('service_date').order('start_min');
    if (error) throw D.fail('load_failed', error.message);
    st.bookings = (data || []).map((b) => Object.assign(b, {
      items: (b.items || []).sort((x, y) => x.sort - y.sort),
      assignments: (b.assignments || []).map((a) => ({ employee_id: a.employee_id, name: a.profile ? [a.profile.first_name, a.profile.last_name].filter(Boolean).join(' ') : 'Team member' })),
      events: (b.events || []).sort((x, y) => x.created_at < y.created_at ? -1 : 1),
    }));
    return st.bookings;
  }
  async function loadStaff() {
    if (!D.isLive) { seedPreview(); st.staffList = PREVIEW.staff.slice(); return st.staffList; }
    const { data, error } = await sb().from('profiles').select('id,first_name,last_name,role,phone,is_active').in('role', ['detailer', 'manager', 'admin']).is('deleted_at', null).order('first_name');
    if (error) throw D.fail('load_failed', error.message);
    st.staffList = data || []; return st.staffList;
  }
  async function loadBlocked() {
    if (!D.isLive) { seedPreview(); st.blocked = PREVIEW.blocked.slice(); return st.blocked; }
    const { data, error } = await sb().from('blocked_days').select('day,reason').gte('day', H().isoDate(H().todayLocal())).order('day');
    if (error) throw D.fail('load_failed', error.message);
    st.blocked = data || []; return st.blocked;
  }
  async function act(name, args, okText) {
    try {
      if (!D.isLive) { previewAct(name, args); }
      else await D.rpc(name, args);
      toast(okText || 'Done'); st.panel = null; await loadBookings(); render();
    } catch (e) { toast(e.message || 'That didn\'t work.'); }
  }
  function previewAct(name, args) {
    const b = PREVIEW.bookings.find((x) => x.id === (args.p_id || args.p_appointment));
    if (!b) return;
    const ev = (to, note) => b.events.push({ from_status: b.status, to_status: to, note: note || null, created_at: new Date().toISOString() });
    if (name === 'confirm_booking') { if (b.price_pending) throw D.fail('wrong_state', 'The admin needs to set the extra cost first, so the customer sees the full price.'); ev('confirmed', args.p_note); b.status = 'confirmed'; b.hold_expires_at = null; }
    if (name === 'decline_booking') { ev('declined', args.p_note); b.status = 'declined'; }
    if (name === 'ask_for_information') { ev('needs_information', args.p_note); b.status = 'needs_information'; }
    if (name === 'cancel_booking') { ev('cancelled', args.p_note); b.status = 'cancelled'; }
    if (name === 'start_booking') { ev('in_progress'); b.status = 'in_progress'; }
    if (name === 'complete_booking') { ev('completed', args.p_note); b.status = 'completed'; }
    if (name === 'set_booking_lane') { b.queue = args.p_lane; }
    if (name === 'set_booking_time') { b.service_date = args.p_date; b.start_min = args.p_start_min; if (args.p_duration_min) b.duration_min = args.p_duration_min; }
    if (name === 'set_extra_cost') { b.extra_cost_cents = args.p_cents; b.extra_cost_note = args.p_note || null; b.price_pending = false; b.pending_reasons = []; b.total_cents = b.value_cents - b.bundle_savings_cents + b.mobile_cents + args.p_cents; }
    if (name === 'assign_employee') { const s = PREVIEW.staff.find((x) => x.id === args.p_employee); if (s && !b.assignments.some((a) => a.employee_id === s.id)) b.assignments.push({ employee_id: s.id, name: s.first_name }); }
    if (name === 'unassign_employee') { b.assignments = b.assignments.filter((a) => a.employee_id !== args.p_employee); }
  }

  // ---------------------------------------------------------------- shell and gate
  function mount(container) {
    root = container;
    const sub = (location.hash.split('-')[1] || '').trim();
    if (SCREENS.some(([k]) => k === sub)) screen = sub;
    if (!ready) ready = (async () => { await D.init(); [settings, menu] = await Promise.all([D.settings(), D.menu()]); })();
    render();
  }
  async function render() {
    if (!root) return;
    root.replaceChildren(U.loading('Loading…'));
    await ready;
    staff = await D.staffSession();
    if (!staff) return root.replaceChildren(shell('Sign in', signIn()));
    if (!['manager', 'admin'].includes(staff.role)) return root.replaceChildren(shell('Admin', el('div.bk-grid', el('p.bk-note', 'This account is not a manager or the admin. Signed in as ' + (staff.firstName || phonePretty(staff.phone || '')) + '.'), el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: async () => { await D.signOut(); render(); } }, 'Sign out')))));
    if (staff.mfaRequired && staff.aal !== 'aal2') return root.replaceChildren(shell('Authenticator', mfaStep()));
    if (st.bookings == null) { try { await loadBookings(); } catch (e) { st.bookings = []; toast(e.message); } }
    const body = { morning: morning, requests: requests, calendar: calendar, reviews: reviewsScreen, customers: customers, team: team, settings: settingsScreen, log: logScreen }[screen];
    root.replaceChildren(shell(SCREENS.find(([k]) => k === screen)[1], await body(), true));
  }
  function shell(title, body, nav) {
    return el('div.bk.admin',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — example data, nothing is saved. Names and bookings here are made up for the preview.') : null,
      nav ? el('nav.adm-nav', { 'aria-label': 'Admin screens' }, SCREENS.filter(([k]) => k !== 'team' && k !== 'log' && k !== 'settings' || staff.role === 'admin' || k === 'settings').map(([k, label]) => el('a', { href: '#admin-' + k, class: k === screen ? 'on' : '', 'aria-current': k === screen ? 'page' : null, onclick: (e) => { e.preventDefault(); screen = k; history.replaceState(null, '', '#admin-' + k); render(); } }, label))) : null,
      el('header.bk-head.adm-head', el('div', el('p.eyebrow', 'Admin'), el('h1.display.bk-title', title)),
        staff ? el('div.adm-who', el('span', (staff.firstName || 'Signed in') + ' · ' + roleOf(staff.role || '')), el('button.link', { type: 'button', onclick: async () => { await D.signOut(); st.bookings = null; render(); } }, 'Sign out')) : null),
      body);
  }
  function signIn() {
    const s = st.signin;
    if (!D.isLive) return el('div.bk-grid', el('p.bk-note', 'Preview: pick a role to look around.'), el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => { D.previewStaffSignIn('admin'); render(); } }, 'Look around as the admin'), el('button.btn.btn-glass', { type: 'button', onclick: () => { D.previewStaffSignIn('manager'); render(); } }, 'As a manager')));
    const box = el('div.bk-grid', el('p.bk-note', 'Team sign-in: your phone code, then your authenticator app.'),
      field({ id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', value: s.phone, oninput: (e) => { s.phone = e.target.value; },
        trailing: miniBtn(s.sent ? 'Resend' : 'Send code', async () => { try { await D.sendPhoneCode(s.phone); s.sent = true; render(); } catch (e) { showError(box, 'phone', e.message); } }) }),
      s.sent ? field({ id: 'phone_code', label: 'Code from the text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6,
        oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) confirm(e.target.value); }, trailing: miniBtn('Confirm', () => confirm(box.querySelector('#phone_code').value)) }) : null);
    async function confirm(code) { try { await D.verifyPhoneCode(s.phone, code); s.sent = false; render(); } catch (e) { showError(box, 'phone_code', e.message); } }
    return box;
  }
  function mfaStep() {
    const box = el('div.bk-grid');
    if (!staff.hasAuthenticator) {
      if (!st.mfa) { D.mfaEnroll().then((m) => { st.mfa = m; render(); }).catch((e) => toast(e.message)); return U.loading('Preparing your authenticator…'); }
      box.append(el('p.bk-note', 'One-time setup. Open an authenticator app (Google Authenticator, Authy, 1Password…), scan this code, then enter the 6-digit number it shows.'),
        el('img.adm-qr', { src: st.mfa.qr, alt: 'Authenticator QR code' }), el('p.bk-muted', 'Or type the key: ', el('code', st.mfa.secret)));
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

  // One booking as a card: the head opens the details. A compact card (opts.compact) is a copy shown in a second
  // list (a request under Today or Tomorrow): a plain head, no body, so every booking opens in one place only.
  function card(b, opts) {
    const compact = !!(opts && opts.compact);
    const open = !compact && st.open === b.id;
    const hold = b.hold_expires_at && ['requested', 'needs_information'].includes(b.status) ? b.hold_expires_at : null;
    const head = [
      el('span.appt-when', el('b', shortDate(b.service_date) + ' · ' + clock(b.start_min)), el('span', minutesText(b.duration_min) + ' · ' + (b.location_type === 'mobile' ? 'Mobile' : 'Driveway')),
        hold ? el('span.appt-hold.tnum', { class: new Date(hold) <= Date.now() ? 'late' : '' }, hoursLeft(hold)) : null),
      el('span.appt-what', el('b', name(b)), el('br'), services(b) + ' · ' + vehicle(b)),
      el('span.appt-tags', el('span.appt-status', STATUS[b.status] || b.status), isGold(b) ? el('span.rv-gold', 'Gold detail') : null),
      el('span.appt-ref.tnum', { class: b.total_cents == null ? 'pending' : '' }, b.total_cents == null ? 'Price pending' : money(b.total_cents))];
    return el('article.appt.adm', { class: 'st-' + b.status + (open ? ' open' : '') + (isGold(b) ? ' gold' : '') + (compact ? ' compact' : '') },
      compact ? el('div.appt-head', head)
        : el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { st.open = open ? null : b.id; st.panel = null; render(); } }, head),
      open ? detail(b) : null);
  }
  function detail(b) {
    const canDecide = ['requested', 'needs_information'].includes(b.status);
    const admin = staff.role === 'admin';
    const notes = [b.special_request && ['Notes', b.special_request], b.damage_note && ['Damage note', b.damage_note]].filter(Boolean);
    // a button that opens a panel: marked (.on, aria-expanded) while its panel is open, a second press closes it;
    // o.state builds the panel's starting values, o.before loads what it needs
    function trig(kind, label, o) {
      o = o || {};
      const on = !!(st.panel && st.panel.id === b.id && st.panel.kind === kind);
      return el('button.btn.btn-glass', { type: 'button', class: (o.cls || '') + (on ? ' on' : ''), 'aria-expanded': on ? 'true' : 'false',
        onclick: async () => { st.panel = on ? null : Object.assign({ kind, id: b.id }, o.state ? o.state() : null); if (!on && o.before) await o.before(); render(); } }, label);
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
          b.review_reasons && b.review_reasons.length ? [el('dt', 'In review for'), el('dd', b.review_reasons.join(', '))] : null,
          b.assignments.length ? [el('dt', 'Assigned'), el('dd', b.assignments.map((a) => a.name).join(', '))] : null,
          el('dt', 'Ref'), el('dd.tnum', b.ref)),
        el('div.bk-summary-card', priceLines(b))),
      el('div.adm-actions',
        canDecide ? el('button.btn.btn-gold', { type: 'button', disabled: b.price_pending, title: b.price_pending ? 'Set the price first' : '', onclick: () => act('confirm_booking', { p_id: b.id }, 'Confirmed') }, 'Confirm') : null,
        canDecide ? trig('decline', 'Decline') : null,
        b.status === 'requested' ? trig('info', 'Ask for info') : null,
        ['confirmed'].includes(b.status) ? el('button.btn.btn-glass', { type: 'button', onclick: () => act('start_booking', { p_id: b.id }, 'Started') }, 'Start') : null,
        ['in_progress'].includes(b.status) ? el('button.btn.btn-gold', { type: 'button', onclick: () => act('complete_booking', { p_id: b.id }, 'Completed') }, 'Complete') : null,
        !['completed', 'declined', 'cancelled'].includes(b.status) ? trig('time', 'Change time', { state: () => ({ date: b.service_date, start: b.start_min, times: null }) }) : null,
        admin && !['completed', 'declined', 'cancelled'].includes(b.status) ? trig('price', b.price_pending ? 'Set price' : 'Extra cost', { cls: b.price_pending ? 'attention' : '', state: () => ({ cents: b.extra_cost_cents != null ? (b.extra_cost_cents / 100).toFixed(2) : '', note: b.extra_cost_note || '' }) }) : null,
        !['completed', 'declined', 'cancelled'].includes(b.status) ? trig('assign', 'Assign', { before: () => (st.staffList ? null : loadStaff()) }) : null,
        trig('lane', 'Move lane'),
        admin && ['confirmed', 'in_progress', 'needs_information', 'requested'].includes(b.status) ? trig('cancel', 'Cancel booking', { cls: 'danger' }) : null),
      canDecide && b.price_pending ? el('p.bk-muted', 'Set the price first') : null,
      st.panel && st.panel.id === b.id ? panel(b) : null,
      b.events && b.events.length ? el('details.adm-history', el('summary', 'History'), el('ul', b.events.map((e) => el('li', el('span.tnum', new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), ' · ', (e.from_status && e.to_status && e.from_status !== e.to_status) ? (STATUS[e.from_status] || e.from_status) + ' → ' + (STATUS[e.to_status] || e.to_status) : (e.to_queue ? 'Lane: ' + e.to_queue : 'Updated'), e.note ? el('i', ' — ' + e.note) : null)))) : null);
    return body;
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
    const box = el('div.adm-panel');
    if (p.kind === 'decline') box.append(el('h3.bk-h2', 'Decline this request'), noteField('Reason (the customer may see it)'), actions(() => act('decline_booking', { p_id: b.id, p_note: p.note || null }, 'Declined'), 'Decline'));
    if (p.kind === 'cancel') box.append(el('h3.bk-h2', 'Cancel this booking'), noteField('Reason'), actions(() => act('cancel_booking', { p_id: b.id, p_note: p.note || null }, 'Cancelled'), 'Cancel booking'));
    if (p.kind === 'info') box.append(el('h3.bk-h2', 'Ask the customer for more information'), noteField('What do you need to know?'), actions(() => { if (!(p.note || '').trim()) return toast('Write what you need to know.'); act('ask_for_information', { p_id: b.id, p_note: p.note }, 'Sent back for information'); }, 'Send'));
    if (p.kind === 'price') box.append(el('h3.bk-h2', b.price_pending ? 'Set the extra cost' : 'Extra cost'),
      el('p.bk-muted', b.price_pending ? 'Pending for: ' + pendingWords(b) + '. Enter the extra amount on top of the menu price (0 if none).' : 'Added on top of the menu price.'),
      el('div.bk-row.two', field({ id: 'p_cents', label: 'Extra amount ($)', inputmode: 'decimal', value: p.cents, oninput: (e) => { p.cents = e.target.value; } }), field({ id: 'p_note2', label: 'What for', optional: true, value: p.note, maxlength: 200, oninput: (e) => { p.note = e.target.value; } })),
      actions(() => { const cents = Math.round(parseFloat(p.cents || '0') * 100); if (!(cents >= 0)) return toast('Enter an amount.'); act('set_extra_cost', { p_id: b.id, p_cents: cents, p_note: p.note || null }, 'Price set'); }, 'Save price'));
    if (p.kind === 'lane') box.append(el('h3.bk-h2', 'Move to a lane'), choices({ id: 'p_lane', value: b.queue, size: 'chip', items: LANES.map(([c, l]) => ({ code: c, label: l })), onchange: (c) => { p.lane = c; } }), noteField('Note (optional)'), actions(() => act('set_booking_lane', { p_id: b.id, p_lane: p.lane || b.queue, p_note: p.note || null }, 'Moved'), 'Move'));
    if (p.kind === 'assign') box.append(el('h3.bk-h2', 'Who does this job?'),
      el('div.chips', (st.staffList || []).filter((s) => s.is_active).map((s) => { const on = b.assignments.some((a) => a.employee_id === s.id); return el('button.choice-item', { type: 'button', class: on ? 'on' : '', onclick: () => act(on ? 'unassign_employee' : 'assign_employee', { p_appointment: b.id, p_employee: s.id }, on ? 'Unassigned' : 'Assigned') }, el('span.choice-name', [s.first_name, s.last_name].filter(Boolean).join(' ') + ' · ' + roleOf(s.role))); })),
      actions(null, null));
    if (p.kind === 'time') {
      if (p.times == null) { D.times(p.date, b.duration_min, b.location_type).then((t) => { p.times = t; render(); }).catch(() => { p.times = []; render(); }); }
      box.append(el('h3.bk-h2', 'Change the time'),
        el('div.bk-row.two', field({ id: 'p_date', label: 'Day', type: 'date', value: p.date, oninput: (e) => { p.date = e.target.value; p.start = null; p.times = null; render(); } }),
          field({ id: 'p_dur', label: 'Length (minutes)', inputmode: 'numeric', value: String(p.duration || b.duration_min), oninput: (e) => { p.duration = parseInt(e.target.value, 10) || b.duration_min; } })),
        p.times == null ? el('p.bk-muted', 'Checking free times…') : el('div.chips', (p.times.length ? p.times : []).map((m) => el('button.choice-item.time', { type: 'button', class: p.start === m ? 'on' : '', onclick: () => { p.start = m; render(); } }, clock(m))), p.times.length ? null : el('p.bk-muted', 'No free start times that day for this length.')),
        actions(() => { if (p.start == null) return toast('Pick a start time.'); act('set_booking_time', { p_id: b.id, p_date: p.date, p_start_min: p.start, p_duration_min: p.duration || null, p_note: null }, 'Time changed'); }, 'Save time'));
    }
    function actions(go, label) { return el('div.acct-actions', go ? el('button.btn.btn-gold', { type: 'button', onclick: go }, label) : null, el('button.btn.btn-glass', { type: 'button', onclick: close }, go ? 'Back' : 'Close')); }
    return box;
  }

  // ---------------------------------------------------------------- screens
  async function morning() {
    const today = H().isoDate(H().todayLocal()), tomorrow = H().isoDate(H().addDays(H().todayLocal(), 1));
    const all = st.bookings || [];
    const live = (b) => ['requested', 'needs_information', 'confirmed', 'in_progress'].includes(b.status);
    const todays = all.filter((b) => b.service_date === today && live(b));
    const needs = all.filter((b) => (b.status === 'requested' && b.queue !== 'spam') || b.price_pending && live(b)).sort((a, b) => (a.hold_expires_at || '') < (b.hold_expires_at || '') ? -1 : 1);
    const tmr = all.filter((b) => b.service_date === tomorrow && live(b));
    const minutes = todays.reduce((a, b) => a + b.duration_min + (b.location_type === 'mobile' ? 10 : 0), 0);   // the 10-minute travel gap counts (doc 27, V-4)
    // a booking that needs a decision opens under Needs you only; its copy under Today or Tomorrow is compact
    const inNeeds = new Set(needs.map((b) => b.id));
    const tiles = el('div.adm-tiles',
      tile('today', todays.length, 'jobs today', minutesText(minutes) + ' booked', () => jump('today')),
      tile('needs', needs.length, 'need you', needs.length ? 'oldest hold: ' + (needs[0].hold_expires_at ? hoursLeft(needs[0].hold_expires_at) : '—') : 'all clear', () => jump('needs')),
      tile('tomorrow', tmr.length, 'tomorrow', '', () => jump('tomorrow')),
      tile('admin-requests', all.filter((b) => b.queue === 'review' && live(b)).length, 'in review', '', () => { st.lane = 'review'; screen = 'requests'; history.replaceState(null, '', '#admin-requests'); render(); }));
    return el('div.bk-grid', tiles,
      section('Today', todays, 'Nothing on today.', { id: 'today', compact: inNeeds }),
      section('Needs you', needs, 'No requests waiting.', { id: 'needs' }),
      section('Tomorrow', tmr, 'Nothing booked for tomorrow yet.', { id: 'tomorrow', compact: inNeeds }));
  }
  // a count is a link to its list: the three sections of this screen, or the Review lane
  const tile = (href, n, label, sub, go) => el('a.adm-tile', { href: '#' + href, onclick: (e) => { e.preventDefault(); go(); } }, el('b.tnum', String(n)), el('span', label), sub ? el('small', sub) : null);
  const jump = (id) => { const s = root.querySelector('#' + id); if (s) s.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
  const section = (title, list, empty, o) => el('section.acct-sec', { id: o && o.id }, el('h2.bk-h2', title), list.length ? list.map((b) => card(b, { compact: !!(o && o.compact && o.compact.has(b.id)) })) : el('p.bk-empty', empty));

  async function requests() {
    const all = (st.bookings || []).filter((b) => ['requested', 'needs_information'].includes(b.status));
    const counts = Object.fromEntries(LANES.map(([k]) => [k, all.filter((b) => b.queue === k).length]));
    const list = all.filter((b) => b.queue === st.lane);
    return el('div.bk-grid',
      el('div.chips', LANES.map(([k, l]) => el('button.choice-item', { type: 'button', class: st.lane === k ? 'on' : '', 'aria-pressed': st.lane === k ? 'true' : 'false', onclick: () => { st.lane = k; render(); } }, el('span.choice-name', l + ' · ' + counts[k])))),
      list.length ? list.map((b) => card(b)) : el('p.bk-empty', 'Nothing in this lane.'));
  }

  // The calendar: a week (Sunday first) or one day. Today's column is lit, the days gone are dimmed and keep
  // no Close day link; the head shows the range on screen. A booking opens where it is decided: a request
  // under Requests (its lane), anything else under Morning.
  async function calendar() {
    if (st.blocked == null) { try { await loadBlocked(); } catch (e) { st.blocked = []; } }
    const todayIso = H().isoDate(H().todayLocal());
    const base = st.calDay ? new Date(st.calDay + 'T00:00:00') : H().todayLocal();
    const days = st.calMode === 'day' ? 1 : 7;
    const start = st.calMode === 'day' ? base : H().addDays(base, -base.getDay());
    const first = H().isoDate(start), last = H().isoDate(H().addDays(start, days - 1));
    const open = (b) => {
      st.open = b.id; st.panel = null;
      if (['requested', 'needs_information'].includes(b.status)) { screen = 'requests'; st.lane = b.queue; } else screen = 'morning';
      history.replaceState(null, '', '#admin-' + screen); render();
    };
    const item = (b) => el('button.cal-item', { type: 'button', class: 'st-' + b.status + (isGold(b) ? ' gold' : ''), title: name(b) + ' · ' + services(b) + ' · ' + vehicle(b), onclick: () => open(b) },
      el('b', clock(b.start_min)), ' ', name(b), el('small', services(b) + ' · ' + (b.location_type === 'mobile' ? 'Mobile' : 'Driveway')), isGold(b) ? el('span.rv-gold', 'Gold detail') : null);
    const cols = [];
    for (let i = 0; i < days; i++) {
      const iso = H().isoDate(H().addDays(start, i)), past = iso < todayIso, today = iso === todayIso;
      const items = (st.bookings || []).filter((b) => b.service_date === iso && !['declined', 'cancelled'].includes(b.status)).sort((a, b) => a.start_min - b.start_min);
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
      field({ id: 'customer_notice', label: 'Your note', optional: true, multiline: true, rows: 2, maxlength: 300, value: settings.customer_notice || '', hint: 'Display only. Empty hides it. Closed days are set above.', oninput: (e) => { st.noticeDraft = e.target.value; } }),
      staff.role === 'admin' ? el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveNotice }, 'Save note')) : el('p.bk-muted', 'Only the admin can change it.'));
    return el('div.bk-grid', nav, el('div.cal-cols', { class: st.calMode }, cols), notice);
  }
  async function toggleBlocked(iso, blocked) {
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
      settings.customer_notice = text; toast('Note saved');
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
      field({ id: 'google_url', label: 'Link', optional: true, type: 'url', value: settings.google_reviews_url || '', hint: 'Starts with https://', oninput: (e) => { st.googleDraft = e.target.value; } }),
      staff.role === 'admin' ? el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: saveGoogle }, 'Save link')) : null);
    return el('div.bk-grid', groups.map(([k, title]) => { const list = st.reviews.filter((r) => r.status === k); return el('section.acct-sec', el('h2.bk-h2', title + ' \u00b7 ' + list.length), list.length ? list.map(card) : el('p.bk-empty', k === 'pending' ? 'No reviews waiting.' : '\u2014')); }), link);
  }
  async function saveGoogle() {
    const text = (st.googleDraft != null ? st.googleDraft : settings.google_reviews_url || '').trim() || null;
    if (text && !/^https:\/\//.test(text)) return toast('The link must start with https://');
    try {
      if (D.isLive) { const { error } = await sb().from('business_settings').update({ google_reviews_url: text, updated_at: new Date().toISOString() }).eq('id', 1); if (error) throw error; }
      settings.google_reviews_url = text; toast('Link saved');
    } catch (e) { toast(e.message || 'Not allowed'); }
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
        el('div.veh-actions', el('button.link', { type: 'button', onclick: () => { st.open = c.bookings[0].id; screen = 'morning'; render(); } }, 'Latest')))) : el('p.bk-empty', 'No one matches.'));
  }

  async function team() {
    if (st.staffList == null) { try { await loadStaff(); } catch (e) { st.staffList = []; } }
    const admin = staff.role === 'admin';
    return el('div.bk-grid',
      el('p.bk-muted', 'The team: detailers, managers and the admin. Managers and the admin sign in with an authenticator code.'),
      (st.staffList || []).map((s) => el('div.veh', el('div.veh-main', el('b', [s.first_name, s.last_name].filter(Boolean).join(' ') || phonePretty(s.phone || '')), el('span.bk-muted', roleOf(s.role) + ' · ' + phonePretty(s.phone || '') + (s.is_active ? '' : ' · inactive'))),
        admin && s.id !== staff.userId ? el('div.veh-actions',
          el('button.link', { type: 'button', onclick: () => setRole(s) }, 'Change role'),
          el('button.link', { type: 'button', onclick: () => setActive(s) }, s.is_active ? 'Deactivate' : 'Activate')) : null)),
      admin ? el('section.acct-sec', el('h2.bk-h2', 'Add a team member'), el('p.bk-note', 'Enter their mobile number and first name. They sign in with a text code like everyone else; managers add an authenticator the first time.'),
        el('div.bk-row.two', field({ id: 't_phone', label: 'Mobile phone', type: 'tel', value: st.tPhone || '', oninput: (e) => { st.tPhone = e.target.value; } }), field({ id: 't_first', label: 'First name', value: st.tFirst || '', oninput: (e) => { st.tFirst = e.target.value; } })),
        choices({ id: 't_role', label: 'Role', size: 'chip', value: st.tRole || 'detailer', items: [{ code: 'detailer', label: 'Detailer' }, { code: 'manager', label: 'Manager' }], onchange: (c) => { st.tRole = c; } }),
        el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: addMember }, 'Create account'))) : null);
  }
  async function setRole(s) {
    const next = { detailer: 'manager', manager: 'detailer', admin: 'admin' }[s.role];
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
  async function settingsScreen() {
    let s = settings;
    if (D.isLive && staff.role === 'admin') { const { data } = await sb().from('business_settings').select('*').eq('id', 1).maybeSingle(); if (data) s = data; }
    const rows = [['Start times', clock(s.first_start_min) + ' – ' + clock(s.last_start_min) + ', every ' + s.slot_step_min + ' min'], ['Jobs end by', clock(s.latest_end_min)], ['Closed every week', closuresText((settings && settings.weekly_closures) || s.weekly_closures)], ['Book ahead', s.min_days_ahead + ' to ' + s.max_days_ahead + ' days'], ['Hold', s.hold_hours + ' hours'],
      ['At once', (s.max_shop_jobs != null ? s.max_shop_jobs + ' driveway or ' + s.max_mobile_jobs + ' mobile' : '—')], ['Gaps', (s.shop_buffer_min != null ? s.shop_buffer_min + ' min driveway, ' + s.mobile_buffer_min + ' min mobile travel' : '—')],
      ['Phone', s.public_phone], ['Area', s.public_area + ', ' + s.mobile_radius_miles + ' miles'], ['Authenticator required', s.require_mfa_for_managers === false ? 'No' : 'Yes'], ['Your address', s.shop_address ? 'On file (sent only with confirmed "Come to us" bookings)' : 'Not set']];
    return el('div.bk-grid', el('p.bk-muted', 'Read-only for now. Ask Claude Code to change a value; the calendar note and closed days are under Calendar.'), el('dl.sum-body', rows.map(([k, v]) => [el('dt', k), el('dd', v)])));
  }

  async function logScreen() {
    if (st.log == null) {
      if (!D.isLive) { seedPreview(); st.log = PREVIEW.log; }
      else { const { data } = await sb().from('audit_log').select('id,action,target_type,target_id,created_at,actor_id').order('created_at', { ascending: false }).limit(100); st.log = data || []; }
    }
    // two columns (the time, what happened); the items are display: contents, so the roles say what they are
    return el('div.bk-grid', el('p.bk-muted', 'The last 100 actions.'), st.log.length ? el('ul.adm-log', { role: 'list' }, st.log.map((e) => el('li', { role: 'listitem' }, el('span.tnum', new Date(e.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })), el('span', ACTION[e.action] || e.action, e.target_type ? ' · ' + e.target_type : '')))) : el('p.bk-empty', 'Nothing yet.'));
  }

  window.AlchemistAdmin = { mount, refresh: () => { st.bookings = null; } };
})();
