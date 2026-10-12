/* Alchemist Detailing — the detailer view (#team), phase 4 (doc 28).
   A team member signs in with a phone code and sees the jobs assigned to them:
   what the car is, what to do, where, and the customer's notes and photos.
   No prices and no customer contact details (doc 28). Open jobs can be asked
   for; questions go to the owner through "Ask the owner". */
(function () {
  'use strict';
  const U = window.AlchemistUI, D = window.AlchemistData;
  const { el, minutesText, clock, longDate, shortDate, phonePretty, field, miniBtn, showError, toast } = U;
  const H = () => D.helpers;

  let root = null, staff = null, settings = null, menu = null, ready = null;
  const st = { jobs: null, open: null, openJobs: null, ask: null, signin: { phone: '', sent: false }, photos: {} };
  const labelOf = (list, code) => ((menu.options[list] || []).find((o) => o.code === code) || {}).label || code;
  const ROLE = { admin: 'Admin', manager: 'Manager', detailer: 'Detailer' };

  const PREVIEW = [];
  function seed() {
    if (PREVIEW.length) return;
    const iso = (n) => H().isoDate(H().addDays(H().todayLocal(), n));
    PREVIEW.push(
      { id: 'tx-1', ref: 'AD-EXAMPL1', service_date: iso(0), start_min: 630, duration_min: 120, location_type: 'mobile', address: '100 Example Ln', address_zip: '75002', status: 'confirmed', vehicle_year: 2021, vehicle_make: 'Toyota', vehicle_model: '4Runner', vehicle_color: 'Black', vehicle_type: 'suv', vehicle_size: 'standard', conditions: ['pet_hair'], damage: ['none'], special_request: 'Dog hair in the back seat. Gate code 1234.', photo_paths: [], modifications: [], items: [{ code: 'signature_combo', name: 'Signature Combo', included: false }, { code: 'cond_pet_hair', name: 'Pet hair', included: false }] },
      { id: 'tx-2', ref: 'AD-EXAMPL2', service_date: iso(1), start_min: 600, duration_min: 210, location_type: 'shop', address: null, address_zip: null, status: 'confirmed', vehicle_year: 2019, vehicle_make: 'Ford', vehicle_model: 'F-150', vehicle_color: 'White', vehicle_type: 'truck', vehicle_size: 'xl', conditions: ['none'], damage: ['scratches'], damage_note: 'Light scratches on the tailgate.', special_request: null, photo_paths: [], modifications: ['aftermarket_wheels'], items: [{ code: 'full_detail', name: 'Full Detail Bundle', included: false }, { code: 'steam_cleaning', name: 'Steam Cleaning', included: true }] });
  }

  function mount(container) {
    root = container;
    if (!ready) ready = (async () => { await D.init(); [settings, menu] = await Promise.all([D.settings(), D.menu()]); })();
    render();
  }
  async function render() {
    if (!root) return;
    root.replaceChildren(U.loading('Loading…'));
    await ready;
    staff = await D.staffSession();
    if (!staff) return root.replaceChildren(shell('Team sign-in', signIn()));
    if (!['detailer', 'manager', 'admin'].includes(staff.role)) return root.replaceChildren(shell('Team', el('div.bk-grid', el('p.bk-note', 'This account isn\'t on the team.'), el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: async () => { await D.signOut(); render(); } }, 'Sign out')))));
    if (st.jobs == null) await loadJobs();
    const today = H().isoDate(H().todayLocal());
    const mine = st.jobs.filter((j) => ['confirmed', 'in_progress'].includes(j.status));
    const todays = mine.filter((j) => j.service_date === today), later = mine.filter((j) => j.service_date > today), past = st.jobs.filter((j) => j.status === 'completed').slice(0, 10);
    root.replaceChildren(shell('My jobs',
      el('div.bk-grid',
        section('Today', todays, 'No jobs today.'),
        section('Coming up', later, 'Nothing assigned yet.'),
        openJobsSection(),
        past.length ? section('Done recently', past, '') : null,
        el('div.acct-actions', el('button.btn.btn-glass', { type: 'button', onclick: () => { st.jobs = null; st.openJobs = null; render(); } }, 'Refresh')))));
  }
  function shell(title, body) {
    return el('div.bk.admin',
      !D.isLive ? el('div.bk-preview', el('b', 'Preview'), ' — example jobs, nothing is saved.') : null,
      el('header.bk-head.adm-head', el('div', el('p.eyebrow', 'Team'), el('h1.display.bk-title', title)),
        staff ? el('div.adm-who', el('span', (staff.firstName || 'Signed in') + ' · ' + (ROLE[staff.role] || staff.role)), el('button.link', { type: 'button', onclick: async () => { await D.signOut(); st.jobs = null; render(); } }, 'Sign out')) : null),
      body);
  }
  const section = (title, list, empty) => el('section.acct-sec', el('h2.bk-h2', title), list.length ? list.map(card) : el('p.bk-empty', empty));

  function signIn() {
    const s = st.signin;
    if (!D.isLive) return el('div.bk-grid', el('p.bk-note', 'Preview: look around as a detailer.'), el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => { D.previewStaffSignIn('detailer'); render(); } }, 'Look around')));
    const box = el('div.bk-grid', el('p.bk-note', 'Sign in with the phone number on your team account.'),
      field({ id: 'phone', label: 'Mobile phone', required: true, type: 'tel', inputmode: 'tel', value: s.phone, oninput: (e) => { s.phone = e.target.value; },
        trailing: miniBtn(s.sent ? 'Resend' : 'Send code', async () => { try { await D.sendPhoneCode(s.phone); s.sent = true; render(); } catch (e) { showError(box, 'phone', e.message); } }) }),
      s.sent ? field({ id: 'phone_code', label: 'Code from the text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, oninput: (e) => { if (e.target.value.replace(/\D/g, '').length === 6) confirm(e.target.value); }, trailing: miniBtn('Confirm', () => confirm(box.querySelector('#phone_code').value)) }) : null);
    async function confirm(code) { try { await D.verifyPhoneCode(s.phone, code); s.sent = false; render(); } catch (e) { showError(box, 'phone_code', e.message); } }
    return box;
  }

  async function loadJobs() {
    if (!D.isLive) { seed(); st.jobs = PREVIEW.slice(); return; }
    // Only the columns a detailer needs: no price, no contact details (doc 28). The database limits rows to assigned jobs.
    const { data, error } = await D.client().from('appointments')
      .select('id,ref,service_date,start_min,duration_min,location_type,address,address_zip,status,vehicle_year,vehicle_make,vehicle_model,vehicle_color,vehicle_type,vehicle_size,vehicle_not_sure,vehicle_description,modifications,conditions,damage,damage_note,special_request,photo_paths, items:appointment_items(code,name,included,sort)')
      .gte('service_date', H().isoDate(H().addDays(H().todayLocal(), -14))).order('service_date').order('start_min');
    if (error) { toast(error.message); st.jobs = []; return; }
    st.jobs = (data || []).map((j) => Object.assign(j, { items: (j.items || []).sort((a, b) => a.sort - b.sort) }));
  }
  async function loadOpenJobs() {
    if (!D.isLive) { st.openJobs = [{ id: 'open-1', ref: 'AD-EXAMPL7', service_date: H().isoDate(H().addDays(H().todayLocal(), 3)), start_min: 720, duration_min: 60, area: 'Plano 75074', vehicle: '2020 Honda Civic (Blue)', services: ['Exterior Basic'], requested_by_me: false }]; return; }
    try { st.openJobs = await D.rpc('open_jobs', { p_days: 14 }); } catch (e) { st.openJobs = []; }
  }
  function openJobsSection() {
    if (st.openJobs == null) { loadOpenJobs().then(render); return el('section.acct-sec', el('h2.bk-h2', 'Open jobs'), el('p.bk-muted', 'Checking…')); }
    return el('section.acct-sec', el('h2.bk-h2', 'Open jobs', el('small', 'confirmed, nobody assigned yet')),
      st.openJobs.length ? st.openJobs.map((j) => el('div.veh', el('div.veh-main', el('b', shortDate(j.service_date) + ' · ' + clock(j.start_min) + ' · ' + minutesText(j.duration_min)), el('span.bk-muted', (j.services || []).join(' + ') + ' · ' + j.vehicle + ' · ' + j.area)),
        el('div.veh-actions', j.requested_by_me ? el('span.bk-muted', 'Asked ✓') : el('button.link', { type: 'button', onclick: () => askForJob(j) }, 'Ask for this job')))) : el('p.bk-empty', 'None right now.'));
  }
  async function askForJob(j) {
    try { if (D.isLive) await D.rpc('request_job', { p_appointment: j.id, p_message: null }); else j.requested_by_me = true; toast('Asked. The owner decides.'); st.openJobs = null; render(); }
    catch (e) { toast(e.message); }
  }

  const vehicle = (j) => j.vehicle_not_sure ? (j.vehicle_description || 'Not sure') : [j.vehicle_year, j.vehicle_make, j.vehicle_model, j.vehicle_color && '· ' + j.vehicle_color].filter(Boolean).join(' ');
  const services = (j) => (j.items || []).filter((i) => !/^cond_/.test(i.code)).map((i) => i.name + (i.included ? ' (included)' : '')).join(' + ');
  function card(j) {
    const open = st.open === j.id;
    const place = j.location_type === 'mobile' ? (j.address ? j.address + ', ' + (j.address_zip || '') : 'Address comes with the confirmation') : 'Come to us';
    // Navigate: the first action on a mobile job (the address stays in the list above it)
    const navigate = j.location_type === 'mobile' && j.address ? el('a.btn.btn-glass', { href: 'https://maps.apple.com/?q=' + encodeURIComponent(j.address + ' ' + (j.address_zip || '')), target: '_blank', rel: 'noopener' }, 'Navigate') : null;
    return el('article.appt.adm', { class: 'st-' + j.status + (open ? ' open' : '') },
      el('button.appt-head', { type: 'button', 'aria-expanded': open ? 'true' : 'false', onclick: () => { st.open = open ? null : j.id; st.ask = null; render(); } },
        el('span.appt-when', el('b', shortDate(j.service_date) + ' · ' + clock(j.start_min)), el('span', minutesText(j.duration_min) + ' · ' + (j.location_type === 'mobile' ? 'Mobile' : 'Driveway'))),
        el('span.appt-what', el('b', vehicle(j)), el('br'), services(j)),
        el('span.appt-status', j.status === 'in_progress' ? 'In progress' : j.status === 'completed' ? 'Done' : 'Confirmed'),
        el('span.appt-ref.tnum', j.ref)),
      open ? el('div.appt-body',
        el('dl.sum-body',
          el('dt', 'Where'), el('dd', place),
          el('dt', 'Vehicle'), el('dd', vehicle(j) + (j.vehicle_size === 'xl' ? ' · XL' : '')),
          el('dt', 'Do'), el('dd', services(j)),
          el('dt', 'Inside'), el('dd', (j.conditions || []).map((c) => labelOf('condition', c)).join(', ') || '—'),
          el('dt', 'Damage'), el('dd', (j.damage || []).map((c) => labelOf('damage', c)).join(', ') + (j.damage_note ? ' — ' + j.damage_note : '')),
          (j.modifications || []).length ? [el('dt', 'Mods'), el('dd', j.modifications.map((m) => labelOf('modification', m)).join(', '))] : null,
          j.special_request ? [el('dt', 'Notes'), el('dd.adm-quote', j.special_request)] : null),
        (j.photo_paths || []).length ? photos(j) : null,
        el('p.bk-muted', 'Before and after photos are free; ask the customer first. Payment is handled by the owner.'),
        el('div.adm-actions', navigate,
          el('button.btn.btn-glass', { type: 'button', onclick: () => { st.ask = { id: j.id, text: '' }; render(); } }, 'Ask the owner'),
          el('button.btn.btn-glass', { type: 'button', disabled: true, title: 'Needs the texting service (not set up yet)' }, 'Running late (soon)')),
        st.ask && st.ask.id === j.id ? el('div.adm-panel', el('h3.bk-h2', 'Message to the owner'),
          field({ id: 'ask_text', label: 'What\'s up?', multiline: true, rows: 2, maxlength: 1000, value: st.ask.text, hint: 'Extra work, a problem with the car, anything. The owner sets any extra cost.', oninput: (e) => { st.ask.text = e.target.value; } }),
          el('div.acct-actions', el('button.btn.btn-gold', { type: 'button', onclick: () => sendAsk(j) }, 'Send'), el('button.btn.btn-glass', { type: 'button', onclick: () => { st.ask = null; render(); } }, 'Back'))) : null) : null);
  }
  function photos(j) {
    const grid = el('div.bk-photo-grid');
    j.photo_paths.forEach(async (p) => {
      const fig = el('figure.bk-photo'); grid.appendChild(fig);
      if (!D.isLive) return;
      if (!st.photos[p]) { const { data } = await D.client().storage.from('vehicle-photos').createSignedUrl(p, 600); st.photos[p] = data ? data.signedUrl : null; }
      if (st.photos[p]) fig.appendChild(el('a', { href: st.photos[p], target: '_blank', rel: 'noopener' }, el('img', { src: st.photos[p], alt: 'Customer photo' })));
    });
    return el('div.bk-photos', el('p.choice-label', 'Customer photos'), grid);
  }
  async function sendAsk(j) {
    const text = (st.ask.text || '').trim();
    if (!text) return toast('Write a short message.');
    try { if (D.isLive) await D.rpc('request_review', { p_appointment: j.id, p_message: text, p_for_admin: true }); toast('Sent to the owner'); st.ask = null; render(); }
    catch (e) { toast(e.message); }
  }

  window.AlchemistTeam = { mount };
})();
