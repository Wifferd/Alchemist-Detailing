/* Alchemist Detailing — the booking app's data layer (doc 18, "one interface,
   two modes").
   Live mode talks to Supabase through the publishable key; the database decides
   prices, times and who may book. Preview mode (claude.ai previews, offline, or
   when Supabase can't be reached) works the same rules out in the browser from
   a copy of the menu and sends nothing anywhere. Errors have the database's
   shape in both modes: { code, message, hint } where hint names the field. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- the menu, as seeded in Migrations 001 and 002
  const SEED = {
    settings: {
      timezone: 'America/Chicago', first_start_min: 600, last_start_min: 1140, latest_end_min: 1200, slot_step_min: 30,
      min_days_ahead: 1, max_days_ahead: 60, hold_hours: 24, public_phone: '(945) 361-7551', public_area: 'Parker, Texas',
      mobile_radius_miles: 10, mobile_note: 'For mobile service, we use your outdoor water faucet and a power outlet.',
    },
    services: [
      { code: 'ext_basic', kind: 'exterior', name: 'Exterior Basic', description: 'Snow-foam pre-wash, Brake Buster wheel and tire cleaning, tire cleaning, exterior glass, and a thorough hand wash and hand dry with professional-grade chemicals.', base_price_cents: 4999, priced_by_vehicle_type: false, duration_min: 60, mobile_pct: 2.5, sort: 10 },
      { code: 'ext_deluxe', kind: 'exterior', name: 'Exterior Deluxe', description: 'Everything in Exterior Basic, plus Green Star pre-treatment where appropriate, Koch-Chemie Hydro Foam Sealant S0.03, enhanced gloss and water-beading protection.', base_price_cents: 9499, priced_by_vehicle_type: false, duration_min: 90, mobile_pct: 7, sort: 20 },
      { code: 'int_basic', kind: 'interior', name: 'Interior Basic', description: 'Full interior vacuum, dash and plastics cleaned, Top Star on plastics, Gummifix on rubber and mats, interior glass and a general wipe-down.', base_price_cents: 5999, priced_by_vehicle_type: false, duration_min: 60, mobile_pct: 2.5, sort: 30 },
      { code: 'int_deluxe', kind: 'interior', name: 'Interior Deluxe', description: 'Everything in Interior Basic, plus deep steam or shampoo, carpet and upholstery cleaning, drill-brush agitation, Pol Star and Green Star, deeper stain and dirt removal, and Leather Star conditioning. Steam cleaning included.', base_price_cents: 13499, priced_by_vehicle_type: false, duration_min: 120, mobile_pct: 7, sort: 40 },
      { code: 'signature_combo', kind: 'bundle', name: 'Signature Combo', description: 'Exterior Basic and Interior Basic together.', base_price_cents: 9999, priced_by_vehicle_type: false, duration_min: 120, mobile_pct: 7, sort: 50 },
      { code: 'full_detail', kind: 'bundle', name: 'Full Detail Bundle', description: 'Exterior Deluxe and Interior Deluxe together. Steam cleaning included.', base_price_cents: 20999, priced_by_vehicle_type: false, duration_min: 210, mobile_pct: 7, sort: 60 },
      { code: 'perfect_finish_sealant', kind: 'addon', name: 'WetGloss', description: 'Spray-on sealant for gloss and water beading, added after a wash with an exterior service. Lasts several weeks, depending on weather and washing.', base_price_cents: null, priced_by_vehicle_type: true, duration_min: 30, mobile_pct: 2.5, sort: 70 },
      { code: 'steam_cleaning', kind: 'addon', name: 'Steam Cleaning', description: 'Deep steam treatment for carpets, upholstery and interior surfaces. Already included in Interior Deluxe.', base_price_cents: 4999, priced_by_vehicle_type: false, duration_min: 30, mobile_pct: 2.5, sort: 80 },
      { code: 'cond_pet_hair', kind: 'addon', name: 'Pet hair', description: 'Pet hair removal from seats, carpets and crevices.', base_price_cents: 1500, priced_by_vehicle_type: false, duration_min: 0, mobile_pct: 2.5, sort: 110 },
      { code: 'cond_dirt_sand', kind: 'addon', name: 'Excessive dirt, mud or sand', description: 'Extra time for heavy dirt, mud or sand inside the car.', base_price_cents: 1000, priced_by_vehicle_type: false, duration_min: 0, mobile_pct: 2.5, sort: 120 },
      { code: 'cond_spills', kind: 'addon', name: 'Spills or light stains', description: 'Spills, food or drink, and light stains.', base_price_cents: 1000, priced_by_vehicle_type: false, duration_min: 0, mobile_pct: 2.5, sort: 130 },
      { code: 'cond_heavy_stains', kind: 'addon', name: 'Heavy or set-in stains', description: 'Grease, oil, ink, mold or mildew, and set-in stains.', base_price_cents: 3000, priced_by_vehicle_type: false, duration_min: 0, mobile_pct: 2.5, sort: 140 },
    ],
    bundle_parts: { signature_combo: ['ext_basic', 'int_basic'], full_detail: ['ext_deluxe', 'int_deluxe'] },
    includes: { int_deluxe: ['steam_cleaning', 'cond_pet_hair', 'cond_dirt_sand', 'cond_spills'], full_detail: ['steam_cleaning', 'cond_pet_hair', 'cond_dirt_sand', 'cond_spills'] },
    addon_rules: { perfect_finish_sealant: 'exterior', steam_cleaning: 'interior', cond_pet_hair: 'interior', cond_dirt_sand: 'interior', cond_spills: 'interior', cond_heavy_stains: 'interior' },
    type_prices: { perfect_finish_sealant: { sedan: 4499, coupe: 4499, crossover: 5499, suv: 5499, minivan: 5499, truck: 6499, large_suv: 6499 } },
    vehicle_types: [
      { code: 'sedan', name: 'Sedan' }, { code: 'coupe', name: 'Coupe' }, { code: 'convertible', name: 'Convertible' },
      { code: 'crossover', name: 'Crossover' }, { code: 'suv', name: 'SUV' }, { code: 'minivan', name: 'Minivan' },
      { code: 'truck', name: 'Truck' }, { code: 'large_suv', name: 'Large SUV' }, { code: 'van', name: 'Van' }, { code: 'other', name: 'Other' },
    ],
    options: {
      condition: [
        { code: 'none', label: 'None', is_none: true, sends_to_review: false, requires_note: false, fee_code: null },
        { code: 'pet_hair', label: 'Pet hair', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_pet_hair' },
        { code: 'dirt_sand', label: 'Excessive dirt, mud or sand', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_dirt_sand' },
        { code: 'spills', label: 'Spills, food or drink, light stains', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_spills' },
        { code: 'heavy_stains', label: 'Heavy or set-in stains', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_heavy_stains' },
        { code: 'other', label: 'Other (describe it in the notes)', is_none: false, sends_to_review: true, requires_note: true, fee_code: null },
      ],
      modification: [
        { code: 'lowered', label: 'Lowered / coilovers' }, { code: 'aftermarket_wheels', label: 'Aftermarket wheels' }, { code: 'wide_body', label: 'Wide-body kit' },
        { code: 'wrap_ppf', label: 'Vinyl wrap / PPF' }, { code: 'aftermarket_exhaust', label: 'Aftermarket exhaust' }, { code: 'carbon_fiber', label: 'Carbon-fiber parts' },
        { code: 'window_tint', label: 'Window tint' }, { code: 'other', label: 'Other' },
      ],
      damage: [
        { code: 'none', label: 'No known damage', is_none: true }, { code: 'exterior', label: 'Exterior damage' }, { code: 'interior', label: 'Interior damage' },
        { code: 'paint', label: 'Paint damage' }, { code: 'scratches', label: 'Scratches' }, { code: 'dents', label: 'Dents' },
        { code: 'unknown', label: 'Unknown', sends_to_review: true, requires_note: true }, { code: 'other', label: 'Other', sends_to_review: true, requires_note: true },
      ],
    },
    zips: ['75002', '75094', '75074', '75082', '75013', '75098', '75023', '75025', '75048', '75075', '75044', '75040', '75070', '75080', '75069', '75081', '75089', '75252', '75072', '75407', '75042'],
  };
  const THROWAWAY = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'dispostable.com'];

  // ---------------------------------------------------------------- shared helpers
  function fail(code, message, hint) {
    const e = new Error(message);
    e.code = code; e.hint = hint || ''; e.isBooking = true;
    return e;
  }
  // The database's errors arrive as { message: code, details: text, hint: field }.
  function fromDb(err) {
    if (!err) return fail('unknown', 'Something went wrong. Please try again.', '');
    if (err.isBooking) return err;
    const code = err.code === 'P0001' || /^[a-z_]+$/.test(err.message || '') ? err.message : 'unknown';
    const text = err.details || (code === 'unknown' ? 'Something went wrong. Please try again, or call ' + SEED.settings.public_phone + '.' : err.message);
    return fail(code, text, err.hint || '');
  }
  const roundHalfUp = (x) => Math.floor(x + 0.5);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
  function normalizePhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return '1' + d;
    if (d.length === 11 && d[0] === '1') return d;
    return null;
  }
  const isValidName = (s) => /^[A-Za-zÀ-ÖØ-öø-ÿ' .-]{1,40}$/.test(String(s || '').trim()) && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(s);
  const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  const todayLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // ---------------------------------------------------------------- preview mode: the quote, line for line from quote_booking
  function previewQuote(p) {
    const m = SEED;
    const loc = p.location_type;
    const bundle = (p.bundle || '').trim() || null;
    const ext = (p.exterior || '').trim() || null;
    const intr = (p.interior || '').trim() || null;
    const addons = Array.isArray(p.addons) ? p.addons : [];
    const vtype = (p.vehicle_type || '').trim() || null;
    const size = (p.vehicle_size || '').trim() || 'standard';
    const notSure = p.not_sure === true || p.not_sure === 'true';
    const conds = Array.isArray(p.conditions) ? p.conditions : [];
    const byCode = (c) => m.services.find((s) => s.code === c);
    if (!loc || !['mobile', 'shop'].includes(loc)) throw fail('invalid_input', 'Choose "We come to you" or "Come to us".', 'location_type');
    const mobile = loc === 'mobile';
    if (!['standard', 'xl'].includes(size)) throw fail('invalid_input', 'Choose Standard or XL for the vehicle size.', 'vehicle_size');
    if (vtype && !m.vehicle_types.some((t) => t.code === vtype)) throw fail('invalid_input', 'Choose a vehicle type from the list.', 'vehicle_type');
    const condOpts = m.options.condition;
    if (conds.some((c) => !condOpts.some((o) => o.code === c))) throw fail('invalid_input', "Choose the vehicle's condition from the list.", 'conditions');
    if (conds.length > 1 && conds.some((c) => condOpts.find((o) => o.code === c).is_none)) throw fail('invalid_input', '"None" can\'t be combined with other conditions.', 'conditions');

    const lines = [];
    let mains = [], kinds = [], value = 0, savings = 0, mob = 0, minutes = 0;
    const pending = new Set();
    const mobOf = (price, pct) => mobile && price != null ? roundHalfUp(price * pct / 100) : 0;
    if (bundle) {
      if (ext || intr) throw fail('invalid_input', 'Choose a bundle, or exterior and interior services, not both.', 'services');
      const s = byCode(bundle);
      if (!s || s.kind !== 'bundle') throw fail('invalid_input', "That bundle isn't available.", 'bundle');
      if (s.duration_min == null) throw fail('not_bookable_yet', s.name + " can't be booked yet.", 'bundle');
      const parts = (m.bundle_parts[bundle] || []).map(byCode);
      if (!parts.length) throw fail('not_bookable_yet', s.name + " can't be booked yet.", 'bundle');
      const partsValue = parts.reduce((a, x) => a + x.base_price_cents, 0);
      mains = parts.map((x) => x.code).concat(bundle);
      kinds = parts.map((x) => x.kind).concat('bundle');
      const lm = mobOf(s.base_price_cents, s.mobile_pct);
      lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: s.base_price_cents, mobile_cents: lm, duration_min: s.duration_min, included: false });
      value += Math.max(partsValue, s.base_price_cents);
      savings += Math.max(partsValue - s.base_price_cents, 0);
      mob += lm; minutes += s.duration_min;
    } else {
      [[ext, 'exterior'], [intr, 'interior']].forEach(([code, kind]) => {
        if (!code) return;
        const s = byCode(code);
        if (!s || s.kind !== kind) throw fail('invalid_input', 'That ' + kind + " service isn't available.", kind);
        if (s.duration_min == null) throw fail('not_bookable_yet', s.name + " can't be booked yet.", kind);
        const lm = mobOf(s.base_price_cents, s.mobile_pct);
        lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: s.base_price_cents, mobile_cents: lm, duration_min: s.duration_min, included: false });
        mains.push(s.code); kinds.push(s.kind);
        value += s.base_price_cents; mob += lm; minutes += s.duration_min;
      });
    }
    if (!mains.length) throw fail('invalid_input', "Choose at least one service. Add-ons can't be booked on their own.", 'services');

    const includedCodes = [];
    const includedSet = new Set();
    mains.forEach((c) => (m.includes[c] || []).forEach((i) => includedSet.add(i)));
    m.services.filter((s) => includedSet.has(s.code) && !s.code.startsWith('cond_')).sort((a, b) => a.sort - b.sort).forEach((s) => {
      includedCodes.push(s.code);
      lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: 0, mobile_cents: 0, duration_min: 0, included: true });
    });

    addons.forEach((code) => {
      if (includedCodes.includes(code)) return;
      if (code.startsWith('cond_')) throw fail('invalid_input', "That add-on isn't available.", 'addons');
      const s = byCode(code);
      if (!s || s.kind !== 'addon') throw fail('invalid_input', "That add-on isn't available.", 'addons');
      if (s.duration_min == null) throw fail('not_bookable_yet', s.name + " can't be booked yet.", 'addons');
      const needs = m.addon_rules[code] || 'any_main';
      if ((needs === 'exterior' || needs === 'interior') && !kinds.includes(needs)) throw fail('invalid_input', s.name + ' needs an ' + needs + ' service in the same booking.', 'addons');
      let price;
      if (s.priced_by_vehicle_type) {
        price = (!notSure && vtype) ? (m.type_prices[code] || {})[vtype] : undefined;
        if (price == null) { price = null; pending.add('vehicle_price'); }
      } else price = s.base_price_cents;
      const lm = mobOf(price, s.mobile_pct);
      lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: price, mobile_cents: lm, duration_min: s.duration_min, included: false });
      value += price || 0; mob += lm; minutes += s.duration_min;
    });

    const feeCodes = condOpts.filter((o) => o.fee_code && conds.includes(o.code)).map((o) => o.fee_code);
    if (feeCodes.length && !kinds.includes('interior')) throw fail('invalid_input', 'Those options apply to interior services. Choose an interior service, or choose None.', 'conditions');
    feeCodes.forEach((code) => {
      const s = byCode(code);
      if (!s) return;
      if (includedSet.has(code)) {
        lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: 0, mobile_cents: 0, duration_min: 0, included: true, condition: true });
        return;
      }
      const lm = mobOf(s.base_price_cents, s.mobile_pct);
      lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: s.base_price_cents, mobile_cents: lm, duration_min: s.duration_min || 0, included: false, condition: true });
      value += s.base_price_cents; mob += lm; minutes += s.duration_min || 0;
    });

    if (size === 'xl') pending.add('xl');
    const pend = Array.from(pending).sort();

    let suggestion = null;
    if (!bundle && ext && intr) {
      const here = value - savings + mob;
      m.services.filter((b) => b.kind === 'bundle' && b.duration_min != null).sort((a, b) => a.sort - b.sort).forEach((b) => {
        const parts = (m.bundle_parts[b.code] || []).slice().sort();
        if (parts.join() !== [ext, intr].slice().sort().join()) return;
        try {
          const q2 = previewQuote(Object.assign({}, p, { exterior: null, interior: null, bundle: b.code }));
          const there = q2.value_cents - q2.bundle_savings_cents + q2.mobile_cents;
          if (there < here && (!suggestion || here - there > suggestion.saves_cents)) {
            suggestion = { bundle: b.code, name: b.name, saves_cents: here - there, total_cents: q2.total_cents, duration_min: q2.duration_min };
          }
        } catch (e) { /* that bundle can't be quoted; no suggestion */ }
      });
    }
    return {
      location_type: loc, lines, value_cents: value, bundle_savings_cents: savings, subtotal_cents: value - savings,
      mobile_cents: mob, price_pending: pend.length > 0, pending_reasons: pend,
      total_cents: pend.length ? null : value - savings + mob, duration_min: minutes, suggestion,
    };
  }

  // Preview availability: every day open, start times on the grid, with a few
  // made-up jobs so the calendar looks real. Deterministic per day.
  function previewHash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function previewTimes(dateIso, duration, loc) {
    const st = SEED.settings;
    const today = todayLocal();
    const d = new Date(dateIso + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    if (diff < st.min_days_ahead || diff > st.max_days_ahead) return [];
    const h = previewHash(dateIso + loc);
    if (h % 9 === 0) return [];                       // a full day now and then
    const busyStart = st.first_start_min + ((h >> 3) % 12) * st.slot_step_min;   // one pretend job
    const busyEnd = busyStart + 90 + ((h >> 7) % 3) * 30;
    const out = [];
    for (let s = st.first_start_min; s <= st.last_start_min; s += st.slot_step_min) {
      if (s + duration > st.latest_end_min) break;
      if (s < busyEnd && s + duration > busyStart) continue;
      out.push(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- state
  let mode = 'preview';
  let sb = null;
  let ready = null;
  let menuCache = null;
  let settingsCache = null;
  const previewPhotos = {};
  let previewSession = null;
  const previewBookings = [];   // receipts made in this preview, newest first
  const previewVehicles = [];

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  // Live when the config and supabase-js are present and the project answers; preview otherwise.
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = window.ALCHEMIST_CONFIG;
      if (cfg && cfg.supabaseUrl && cfg.supabaseKey && window.supabase && window.supabase.createClient) {
        try {
          sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
          const { data, error } = await withTimeout(sb.rpc('get_public_settings'), 6000);
          if (error) throw error;
          settingsCache = data;
          mode = 'live';
        } catch (e) {
          sb = null; mode = 'preview';
        }
      }
      if (mode === 'preview') settingsCache = Object.assign({}, SEED.settings);
      return mode;
    })();
    return ready;
  }

  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw fromDb(error);
    return data;
  }

  // ---------------------------------------------------------------- the interface
  const api = {
    init,
    get mode() { return mode; },
    get isLive() { return mode === 'live'; },
    helpers: { normalizePhone, isValidName, isValidEmail, isoDate, addDays, todayLocal, uuid },

    async settings() { await init(); return settingsCache; },

    async menu() {
      await init();
      if (menuCache) return menuCache;
      if (mode === 'preview') {
        menuCache = {
          services: SEED.services.slice(), vehicleTypes: SEED.vehicle_types.slice(), options: SEED.options,
          bundleParts: SEED.bundle_parts, includes: SEED.includes, addonRules: SEED.addon_rules, typePrices: SEED.type_prices, zips: new Set(SEED.zips),
        };
        return menuCache;
      }
      const q = (t, cols, order) => sb.from(t).select(cols).order(order || 'sort');
      const [svc, vt, fo, bp, si, ar, tp, zz] = await Promise.all([
        q('services', 'id,code,kind,name,description,base_price_cents,priced_by_vehicle_type,duration_min,mobile_pct,sort,active'),
        q('vehicle_types', 'code,name,sort,active'),
        q('form_options', 'list,code,label,is_none,sends_to_review,holds_price,requires_note,sort,active,fee_code'),
        sb.from('bundle_parts').select('bundle_id,part_id'),
        sb.from('service_includes').select('service_id,included_id'),
        sb.from('addon_rules').select('addon_id,needs'),
        sb.from('service_type_prices').select('service_id,vehicle_type,price_cents'),
        sb.from('service_zip_codes').select('zip'),
      ]);
      for (const r of [svc, vt, fo, bp, si, ar, tp, zz]) if (r.error) throw fromDb(r.error);
      const byId = {}; svc.data.forEach((s) => { byId[s.id] = s.code; });
      const bundleParts = {}; bp.data.forEach((r) => { (bundleParts[byId[r.bundle_id]] = bundleParts[byId[r.bundle_id]] || []).push(byId[r.part_id]); });
      const includes = {}; si.data.forEach((r) => { (includes[byId[r.service_id]] = includes[byId[r.service_id]] || []).push(byId[r.included_id]); });
      const addonRules = {}; ar.data.forEach((r) => { addonRules[byId[r.addon_id]] = r.needs; });
      const typePrices = {}; tp.data.forEach((r) => { (typePrices[byId[r.service_id]] = typePrices[byId[r.service_id]] || {})[r.vehicle_type] = r.price_cents; });
      const options = {}; fo.data.filter((o) => o.active).forEach((o) => { (options[o.list] = options[o.list] || []).push(o); });
      menuCache = {
        services: svc.data.filter((s) => s.active).map((s) => Object.assign({}, s, { mobile_pct: Number(s.mobile_pct) })),
        vehicleTypes: vt.data.filter((t) => t.active), options, bundleParts, includes, addonRules, typePrices, zips: new Set(zz.data.map((z) => z.zip)),
      };
      return menuCache;
    },

    async session() {
      await init();
      if (mode === 'preview') return previewSession;
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (!u) return null;
      const meta = u.user_metadata || {};
      let first = meta.first_name || null, last = meta.last_name || null;
      try {
        const { data: prof } = await sb.from('profiles').select('first_name,last_name').eq('id', u.id).maybeSingle();
        if (prof) { first = prof.first_name || first; last = prof.last_name || last; }
      } catch (e) { /* the profile row is optional here */ }
      return { userId: u.id, phone: u.phone || null, email: u.email || null, firstName: first, lastName: last, phoneConfirmed: !!u.phone_confirmed_at };
    },

    async myVehicles() {
      await init();
      if (mode === 'preview') return previewSession ? previewVehicles.slice() : [];
      const { data, error } = await sb.from('vehicles').select('id,make,model,year,color,vehicle_type,size,modifications').is('deleted_at', null).order('created_at');
      if (error) throw fromDb(error);
      return data || [];
    },

    // Account: profile, saved vehicles and the customer's own bookings.
    async updateProfile(first, last) {
      await init();
      if (!isValidName(first)) throw fail('invalid_input', 'Enter your first name using letters only.', 'first_name');
      if (last && !isValidName(last)) throw fail('invalid_input', 'Enter your last name using letters only, or leave it empty.', 'last_name');
      if (mode === 'preview') { if (previewSession) { previewSession.firstName = first.trim(); previewSession.lastName = (last || '').trim() || null; } return previewSession; }
      await rpc('update_my_profile', { p_first_name: first.trim(), p_last_name: (last || '').trim() });
      return api.session();
    },

    async saveVehicle(v) {
      await init();
      const row = {
        make: String(v.make || '').trim(), model: String(v.model || '').trim(), year: v.year ? Number(v.year) : null,
        color: String(v.color || '').trim() || null, vehicle_type: v.vehicle_type, size: v.size || 'standard', modifications: v.modifications || [],
      };
      if (!row.make || row.make.length > 40) throw fail('invalid_input', 'Enter the vehicle make.', 'vehicle_make');
      if (!row.model || row.model.length > 40) throw fail('invalid_input', 'Enter the vehicle model.', 'vehicle_model');
      if (v.year && !/^\d{4}$/.test(String(v.year))) throw fail('invalid_input', 'Enter a 4-digit year.', 'vehicle_year');
      if (!row.vehicle_type) throw fail('invalid_input', 'Choose a vehicle type.', 'vehicle_type');
      if (mode === 'preview') {
        if (v.id) { const i = previewVehicles.findIndex((x) => x.id === v.id); if (i >= 0) previewVehicles[i] = Object.assign({}, previewVehicles[i], row); return previewVehicles[i]; }
        const made = Object.assign({ id: uuid() }, row); previewVehicles.push(made); return made;
      }
      const q = v.id ? sb.from('vehicles').update(row).eq('id', v.id) : sb.from('vehicles').insert(row);
      const { data, error } = await q.select('id,make,model,year,color,vehicle_type,size,modifications').single();
      if (error) throw fromDb(error);
      return data;
    },

    async deleteVehicle(id) {
      await init();
      if (mode === 'preview') { const i = previewVehicles.findIndex((x) => x.id === id); if (i >= 0) previewVehicles.splice(i, 1); return; }
      await rpc('delete_my_vehicle', { p_id: id });
    },

    async myBookings() {
      await init();
      if (mode === 'preview') return previewSession ? previewBookings.slice() : [];
      return (await rpc('my_bookings')) || [];
    },

    async sendPhoneCode(phone, names) {
      await init();
      const n = normalizePhone(phone);
      if (!n) throw fail('invalid_input', 'Enter a 10-digit US phone number.', 'phone');
      if (mode === 'preview') { await new Promise((r) => setTimeout(r, 600)); return { sent: true, preview: true }; }
      const { error } = await sb.auth.signInWithOtp({ phone: '+' + n, options: { data: { first_name: names && names.first || undefined, last_name: names && names.last || undefined } } });
      if (error) throw fail('code_not_sent', error.message || "We couldn't send the code. Check the number, or call " + settingsCache.public_phone + '.', 'phone');
      return { sent: true };
    },

    async verifyPhoneCode(phone, code, names) {
      await init();
      const n = normalizePhone(phone);
      const c = String(code || '').replace(/\D/g, '');
      if (c.length !== 6) throw fail('invalid_input', 'Enter the 6-digit code from the text.', 'phone_code');
      if (mode === 'preview') {
        await new Promise((r) => setTimeout(r, 500));
        previewSession = { userId: 'preview', phone: n, firstName: names && names.first || null, lastName: names && names.last || null, phoneConfirmed: true, preview: true };
        return previewSession;
      }
      const { error } = await sb.auth.verifyOtp({ phone: '+' + n, token: c, type: 'sms' });
      if (error) throw fail('bad_code', "That code didn't match. Check the text and try again.", 'phone_code');
      return api.session();
    },

    async emailAllowed(email) {
      await init();
      const e = String(email || '').trim().toLowerCase();
      if (!isValidEmail(e)) return false;
      if (mode === 'preview') return !THROWAWAY.includes(e.split('@')[1]);
      try { return !!(await rpc('email_allowed', { p: e })); } catch (err) { return false; }
    },

    async sendEmailCode(email) {
      await init();
      if (mode === 'preview') { await new Promise((r) => setTimeout(r, 500)); return { sent: true, preview: true }; }
      const { error } = await sb.auth.updateUser({ email: String(email).trim() });
      if (error) throw fail('code_not_sent', "We couldn't send the email code yet. Skip it and we'll contact you by phone.", 'email');
      return { sent: true };
    },

    async verifyEmailCode(email, code) {
      await init();
      const c = String(code || '').replace(/\D/g, '');
      if (c.length !== 6) throw fail('invalid_input', 'Enter the 6-digit code from the email.', 'email_code');
      if (mode === 'preview') { await new Promise((r) => setTimeout(r, 400)); return { verified: true }; }
      const { error } = await sb.auth.verifyOtp({ email: String(email).trim(), token: c, type: 'email_change' });
      if (error) throw fail('bad_code', "That code didn't match. Check the email and try again.", 'email_code');
      return { verified: true };
    },

    async quote(p) {
      await init();
      if (mode === 'preview') return previewQuote(p);
      return rpc('quote_booking', { p });
    },

    // [{ day: 'YYYY-MM-DD', available: bool }] for p_days from p_from
    async calendar(fromIso, days, duration, loc) {
      await init();
      if (mode === 'preview') {
        const out = [];
        const start = new Date(fromIso + 'T00:00:00');
        for (let i = 0; i < days; i++) {
          const d = isoDate(addDays(start, i));
          out.push({ day: d, available: previewTimes(d, duration, loc).length > 0 });
        }
        return out;
      }
      return rpc('get_calendar', { p_from: fromIso, p_days: days, p_duration: duration, p_location: loc });
    },

    async times(dateIso, duration, loc) {
      await init();
      if (mode === 'preview') return previewTimes(dateIso, duration, loc);
      return rpc('get_availability', { p_date: dateIso, p_duration: duration, p_location: loc }) || [];
    },

    // Photos: re-encoded through a canvas first (strips location data, audit F-52).
    async uploadPhoto(file) {
      await init();
      const blob = await api.helpers.cleanImage(file);
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
      if (mode === 'preview') {
        const name = uuid() + '.' + ext;
        previewPhotos[name] = URL.createObjectURL(blob);
        return { name, url: previewPhotos[name] };
      }
      const s = await api.session();
      if (!s) throw fail('not_signed_in', 'Confirm your phone first, then add photos.', 'phone');
      const name = uuid() + '.' + ext;
      const path = s.userId + '/' + name;
      const { error } = await sb.storage.from('vehicle-photos').upload(path, blob, { contentType: blob.type, upsert: false });
      if (error) throw fail('upload_failed', "That photo couldn't be uploaded. Try a smaller one.", 'photos');
      // submit_booking wants the full object name, <user id>/<uuid>.<ext>
      return { name: path, url: URL.createObjectURL(blob) };
    },

    async removePhoto(name) {
      await init();
      if (mode === 'preview') { if (previewPhotos[name]) { URL.revokeObjectURL(previewPhotos[name]); delete previewPhotos[name]; } return; }
      await sb.storage.from('vehicle-photos').remove([name]);
    },

    async submit(p) {
      await init();
      if (mode === 'preview') {
        await new Promise((r) => setTimeout(r, 900));
        const q = previewQuote(p);
        if (!p.first_name || !isValidName(p.first_name)) throw fail('invalid_input', 'Enter your first name.', 'first_name');
        if (!p.service_date) throw fail('invalid_input', 'Choose a day.', 'service_date');
        if (p.start_min == null) throw fail('invalid_input', 'Choose one of the start times shown.', 'start_min');
        const hasInterior = q.lines.some((l) => !l.included && (l.kind === 'interior' || l.kind === 'bundle'));
        if (hasInterior && !(p.conditions || []).length) throw fail('invalid_input', 'Tell us what the car is like, or choose None.', 'conditions');
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let ref = 'AD-'; for (let i = 0; i < 8; i++) ref += alphabet[Math.floor(Math.random() * alphabet.length)];
        const created = new Date();
        const r = {
          id: uuid(), ref, status: 'requested', service_date: p.service_date, start_min: p.start_min,
          duration_min: q.duration_min, end_min: p.start_min + q.duration_min, location_type: p.location_type,
          address: p.address || null, address_zip: p.address_zip || null,
          vehicle: { make: p.vehicle_make || null, model: p.vehicle_model || null, year: p.vehicle_year || null, color: p.vehicle_color || null,
                     type: p.vehicle_type || null, size: p.vehicle_size || 'standard', not_sure: !!p.not_sure, description: p.vehicle_description || null },
          hold_expires_at: new Date(created.getTime() + SEED.settings.hold_hours * 3600000).toISOString(),
          value_cents: q.value_cents, bundle_savings_cents: q.bundle_savings_cents, mobile_cents: q.mobile_cents,
          price_pending: q.price_pending, pending_reasons: q.pending_reasons, total_cents: q.total_cents, lines: q.lines,
          created_at: created.toISOString(), preview: true, shop_address: null, team: [], history: [],
        };
        previewBookings.unshift(r);
        return r;
      }
      return rpc('submit_booking', { p });
    },

    async signOut() {
      await init();
      if (mode === 'preview') { previewSession = null; previewStaff = null; return; }
      await sb.auth.signOut();
    },

    // ---- staff side (the admin console and the team view) ----
    client() { return sb; },
    rpc(name, args) { return rpc(name, args); },
    fail,

    // Who is signed in, with their role and whether the authenticator step is done.
    async staffSession() {
      await init();
      if (mode === 'preview') return previewStaff;
      const s = await api.session();
      if (!s) return null;
      const { data: prof } = await sb.from('profiles').select('id,role,first_name,last_name,is_active').eq('id', s.userId).maybeSingle();
      let aal = 'aal1', nextLevel = 'aal1';
      try { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); aal = data.currentLevel; nextLevel = data.nextLevel; } catch (e) { /* no MFA support */ }
      const { data: factors } = await sb.auth.mfa.listFactors().catch(() => ({ data: null }));
      return Object.assign({}, s, { role: prof ? prof.role : 'customer', active: prof ? prof.is_active : true, aal, nextLevel,
        hasAuthenticator: !!(factors && factors.totp && factors.totp.length), mfaRequired: settingsCache.require_mfa_for_managers !== false });
    },
    previewStaffSignIn(role) { previewStaff = { userId: 'preview-staff', role, firstName: 'Owner', aal: 'aal2', hasAuthenticator: true, phoneConfirmed: true, preview: true }; return previewStaff; },

    // Authenticator app (TOTP): enrol, then verify a code; later, challenge and verify.
    async mfaEnroll() {
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Alchemist admin' });
      if (error) throw fail('mfa_error', error.message, 'mfa_code');
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    async mfaVerify(factorId, code) {
      const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId });
      if (e1) throw fail('mfa_error', e1.message, 'mfa_code');
      const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: String(code).replace(/\D/g, '') });
      if (error) throw fail('bad_code', "That code didn't match. Try the next one from the app.", 'mfa_code');
      return true;
    },
    async mfaFactorId() {
      const { data } = await sb.auth.mfa.listFactors();
      const f = data && data.totp && data.totp.find((x) => x.status === 'verified');
      return f ? f.id : null;
    },
  };
  let previewStaff = null;

  // Re-encode a picture through a canvas: location data and other metadata are
  // dropped, and very large pictures are brought down to a sensible size.
  api.helpers.cleanImage = function (file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(fail('invalid_input', 'Use a JPEG, PNG or WebP picture.', 'photos'));
      if (file.size > 8 * 1024 * 1024) return reject(fail('invalid_input', 'Each photo must be under 8 MB.', 'photos'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const max = 2000;
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob((b) => b ? resolve(b) : reject(fail('invalid_input', "That picture couldn't be read.", 'photos')), type, 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(fail('invalid_input', "That picture couldn't be read.", 'photos')); };
      img.src = url;
    });
  };

  window.AlchemistData = api;
})();
