/* Alchemist Detailing — the booking app's data layer (doc 18, "one interface,
   two modes").
   Live mode talks to Supabase through the publishable key; the database decides
   prices, times and who may book. Preview mode (claude.ai previews, offline, or
   when Supabase can't be reached) works the same rules out in the browser from
   a copy of the menu and sends nothing anywhere. Errors have the database's
   shape in both modes: { code, message, hint } where hint names the field. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- the menu, as Migrations 011 and 012 set it (Nov 17-18, 2026)
  const SEED = {
    settings: {
      timezone: 'America/Chicago', first_start_min: 600, last_start_min: 1140, latest_end_min: 1200, slot_step_min: 30,
      min_days_ahead: 1, max_days_ahead: 60, hold_hours: 24, public_phone: '(945) 361-7551', public_area: 'Parker, Texas',
      mobile_radius_miles: 10, mobile_note: 'For mobile service, we use your outdoor water faucet and a power outlet.',
      // Migration 003: hours closed every week (ISO weekday, 1 = Monday), as get_public_settings returns them
      weekly_closures: [1, 2, 3, 4].map((w) => ({ weekday: w, start_min: 960, end_min: 1200 })).concat([{ weekday: 5, start_min: 720, end_min: 1020 }]),
      // Migration 005: bookings without an account until text codes work (?guest=0 previews the text-code flow)
      guest_booking: true,
    },
    // Migration 011 (Nov 17): the First Timer Deals (Migration 012) end at the end of this day, Parker's time
    // (business_settings.first_visit_offer_ends_on; get_first_visit_offer gives it to the site); one shared visit
    // (setup, pack-up, handover) when an exterior and an interior are booked apart (visit_overhead_min)
    offer_ends_on: '2027-02-17',
    visit_overhead_min: 32,
    // the four priced sizes (size_groups); van, other and "Not sure" have none: the price is held
    sizes: [
      { code: 'car', name: 'Car', short_name: 'Car', sort: 1 },
      { code: 'two_rows', name: 'SUV or crossover, 2 rows', short_name: '2 rows', sort: 2 },
      { code: 'three_rows', name: '3 rows or pickup', short_name: '3 rows or pickup', sort: 3 },
      { code: 'minivan', name: 'Minivan', short_name: 'Minivan', sort: 4 },
    ],
    // rates: [price, real on-site minutes] for car, two_rows, three_rows, minivan (service_size_rates; Migration 012's
    // prices, Nov 18: the Basic Wash and Hand Wash raised, the two bundles keeping their savings)
    services: [
      { code: 'basic_wash', kind: 'exterior', name: 'Basic Wash', sort: 10, description: 'Thick foam to loosen the dirt, then a careful two-bucket hand wash. Rinsed and hand-dried. Wheels and tires are rinsed with the car. For cars with normal road dirt. Not included: wheel and tire scrubbing, tire shine, bug and tar removal, window cleaning. Add Wheels & Tire Shine for $20.',
        rates: [[5999, 92], [6499, 103.25], [6499, 114.5], [6499, 114.5]] },
      { code: 'hand_wash', kind: 'exterior', name: 'Hand Wash', sort: 20, description: 'Thick foam to loosen the dirt, then a careful two-bucket hand wash. Wheels and tires cleaned; tire shine. Rinsed, hand-dried and blown out. Outside glass.',
        rates: [[8999, 91], [9499, 101], [9499, 111], [9499, 111]] },
      { code: 'inside_out', kind: 'bundle', name: 'Inside & Out', sort: 30, description: 'Everything in the Hand Wash, plus: seats, carpets and trunk vacuumed. Dash, doors, console and cup holders wiped. Mats scrubbed and left dry; inside windows. A protectant on the dash and trim.',
        rates: [[11499, 163], [12999, 190.75], [13999, 218.5], [14999, 236.25]] },
      { code: 'full_detail_v2', kind: 'bundle', name: 'Full Detail', sort: 40, description: 'Everything in Inside & Out, plus: outside, a bug and road-grime pre-soak, wheel wells scrubbed and a water-repellent sealant foam. Cloth seats and carpets shampooed and the dirty water pulled back out with an extractor (seats stay damp a few hours); leather cleaned and conditioned instead where the car has it. Console, vents, seams and cup holders steamed and brushed. Door seals dressed.',
        rates: [[17999, 315], [20499, 375.75], [22999, 436.5], [24999, 483.25]] },
      { code: 'interior_clean', kind: 'interior', name: 'Interior Clean', sort: 50, description: 'The inside of Inside & Out, no wash: seats, carpets and trunk vacuumed. Dash, doors, console and cup holders wiped. Mats scrubbed and left dry; inside windows. A protectant on the dash and trim.',
        rates: [[7500, 103], [8500, 120.75], [9000, 138.5], [10000, 156.25]] },
      { code: 'interior_detail', kind: 'interior', name: 'Interior Detail', sort: 60, description: 'The inside of the Full Detail, no wash: everything in the Interior Clean, plus cloth seats and carpets shampooed and the dirty water pulled back out with an extractor (seats stay damp a few hours); leather cleaned and conditioned instead where the car has it. Console, vents, seams and cup holders steamed and brushed. Door seals dressed.',
        rates: [[12500, 229], [14500, 275.75], [16500, 322.5], [18500, 369.25]] },
      { code: 'wheels_tire_shine', kind: 'addon', name: 'Wheels & Tire Shine', sort: 110, description: 'Wheels and tires scrubbed, then tire shine. Goes with the Basic Wash (the Hand Wash already has it).',
        rates: [[2000, 19], [2000, 21.5], [2000, 24], [2000, 24]] },
      { code: 'gloss_wax', kind: 'addon', name: 'Gloss wax foam', sort: 120, description: 'A gloss wax foam after the wash, for shine and water beading.',
        rates: [[2000, 10], [2000, 11.5], [2000, 13], [2000, 13]] },
      { code: 'engine_bay', kind: 'addon', name: 'Engine bay clean', sort: 130, description: 'The engine bay cleaned.',
        rates: [[5000, 25], [5000, 27.5], [5000, 30], [5000, 30]] },
      { code: 'film_care', kind: 'addon', name: 'Clear film (PPF) care', sort: 140, description: 'Every wash is already safe for clear film. This adds a hand clean of the film\'s edges and any spots on it, with a cleaner made for film.',
        rates: [[1500, 12], [1500, 13.5], [1500, 15], [1500, 15]] },
      { code: 'leather_care', kind: 'addon', name: 'Leather care', sort: 150, description: 'Leather seats cleaned and conditioned. Already in the Full Detail and the Interior Detail.',
        rates: [[3500, 25], [3500, 30], [3500, 35], [3500, 35]] },
      { code: 'stain_removal', kind: 'addon', name: 'Stain and spill removal (up to 5 spots)', sort: 160, description: 'Set-in stains and spills treated one by one, up to 5 spots. More than 5? We tell you the price first.',
        rates: [[4000, 33], [4000, 41.25], [4000, 49.5], [4000, 57.75]] },
      { code: 'cond_pet_some', kind: 'addon', name: 'Some pet hair', sort: 210, description: 'Hair on the seats and carpet that comes up with a vacuum and a rubber brush.',
        rates: [[3000, 20], [3000, 22.5], [3000, 25], [3000, 25]] },
      { code: 'cond_pet_lots', kind: 'addon', name: 'A lot of pet hair', sort: 220, description: 'Hair woven into the fabric, on most seats and in the cargo area.',
        rates: [[6000, 45], [6000, 52.5], [6000, 60], [6000, 60]] },
      { code: 'cond_heavy_dirt', kind: 'addon', name: 'Heavy dirt, mud or sand', sort: 230, description: 'Heavy dirt, mud or sand inside the vehicle.',
        rates: [[4000, 25], [4000, 30], [4000, 35], [4000, 35]] },
    ].map((s) => Object.assign({ priced_by_size: true, priced_by_vehicle_type: false, mobile_pct: 0, base_price_cents: s.rates[0][0], duration_min: Math.ceil(s.rates[0][1]) }, s)),
    // The First Timer Deals (Migration 012, first_visit_deals and first_visit_deal_rates): exactly these services, no
    // bundle, a first visit only; rates [exterior line, interior line] per size (car, two_rows, three_rows, minivan).
    // "Outside + inside" keeps the wash at its Outside price and the inside line takes the rest ($79.99 / $94.99).
    deals: [
      { code: 'outside', name: 'Outside', sort: 1, exterior: 'basic_wash', interior: null, rates: [[3500, null], [4000, null], [4000, null], [4000, null]] },
      { code: 'inside', name: 'Inside', sort: 2, exterior: null, interior: 'interior_clean', rates: [[null, 4999], [null, 5999], [null, 5999], [null, 5999]] },
      { code: 'both', name: 'Outside + inside', sort: 3, exterior: 'basic_wash', interior: 'interior_clean', rates: [[3500, 4499], [4000, 5499], [4000, 5499], [4000, 5499]] },
    ],
    bundle_parts: { inside_out: ['hand_wash', 'interior_clean'], full_detail_v2: ['hand_wash', 'interior_detail'] },
    includes: { full_detail_v2: ['leather_care'], interior_detail: ['leather_care'] },
    addon_rules: { wheels_tire_shine: 'exterior', gloss_wax: 'exterior', engine_bay: 'any_main', film_care: 'exterior', leather_care: 'interior', stain_removal: 'interior', cond_pet_some: 'interior', cond_pet_lots: 'interior', cond_heavy_dirt: 'interior' },
    // an add-on that goes only with the services named here (addon_allowed_with)
    allowed_with: { wheels_tire_shine: ['basic_wash'], gloss_wax: ['basic_wash', 'hand_wash', 'inside_out'], leather_care: ['inside_out', 'interior_clean'] },
    type_prices: {},
    vehicle_types: [
      { code: 'sedan', name: 'Sedan, hatchback or wagon', size_group: 'car' }, { code: 'coupe', name: 'Coupe', size_group: 'car' }, { code: 'convertible', name: 'Convertible', size_group: 'car' },
      { code: 'crossover', name: 'Crossover, 2 rows', size_group: 'two_rows' }, { code: 'suv', name: 'SUV, 2 rows', size_group: 'two_rows' }, { code: 'minivan', name: 'Minivan', size_group: 'minivan' },
      { code: 'truck', name: 'Pickup', size_group: 'three_rows' }, { code: 'large_suv', name: 'SUV, 3 rows', size_group: 'three_rows' }, { code: 'van', name: 'Van', size_group: null }, { code: 'other', name: 'Other', size_group: null },
    ],
    options: {
      condition: [
        { code: 'none', label: 'None', is_none: true, sends_to_review: false, requires_note: false, fee_code: null, choice_group: null, description: null },
        { code: 'pet_hair_some', label: 'Some pet hair', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_pet_some', choice_group: 'pet', description: 'Hair on the seats and carpet that comes up with a vacuum and a rubber brush.' },
        { code: 'pet_hair_lots', label: 'A lot of pet hair', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_pet_lots', choice_group: 'pet', description: 'Hair woven into the fabric, on most seats and in the cargo area.' },
        { code: 'heavy_dirt', label: 'Heavy dirt, mud or sand', is_none: false, sends_to_review: false, requires_note: false, fee_code: 'cond_heavy_dirt', choice_group: null, description: null },
        { code: 'other', label: 'Other (describe it in the notes)', is_none: false, sends_to_review: true, requires_note: true, fee_code: null, choice_group: null, description: 'Tell us in the notes. We confirm the price before we start.' },
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
    // the retired inside answers of Migration 002, kept for the labels of older bookings (the console, the Team page)
    retired_options: {
      condition: [
        { code: 'pet_hair', label: 'Pet hair' }, { code: 'dirt_sand', label: 'Excessive dirt, mud or sand' },
        { code: 'spills', label: 'Spills, food or drink, light stains' }, { code: 'heavy_stains', label: 'Heavy or set-in stains' },
      ],
    },
    zips: ['75002', '75094', '75074', '75082', '75013', '75098', '75023', '75025', '75048', '75075', '75044', '75040', '75070', '75080', '75069', '75081', '75089', '75252', '75072', '75407', '75042'],
  };
  const SIZE_CODES = SEED.sizes.map((g) => g.code);
  // { code: { size: { price, minutes } } }, as the live menu() builds it from service_size_rates
  const SEED_RATES = {};
  SEED.services.forEach((s) => { SEED_RATES[s.code] = {}; s.rates.forEach((r, i) => { SEED_RATES[s.code][SIZE_CODES[i]] = { price: r[0], minutes: r[1] }; }); });
  const THROWAWAY = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com', 'dispostable.com'];

  // ---------------------------------------------------------------- shared helpers
  function fail(code, message, hint) {
    const e = new Error(message);
    e.code = code; e.hint = hint || ''; e.isBooking = true;
    return e;
  }
  // The database's own errors arrive as { code: 'P0001', message: code, details: text, hint: field }. Anything
  // else never shows its raw text: a dropped connection carries a JavaScript stack in its details, and a table
  // check its failing row. A vehicle field the table refused is named (its check, by name); the rest get the
  // friendly line with the phone number.
  const generic = () => 'Something went wrong. Please try again, or call ' + ((settingsCache && settingsCache.public_phone) || SEED.settings.public_phone) + '.';
  const CHECKS = {
    vehicles_make_ok: ['vehicle_make', 'Use letters, numbers and simple punctuation for the make (no links, emoji or < >).'],
    vehicles_model_ok: ['vehicle_model', 'Use letters, numbers and simple punctuation for the model (no links, emoji or < >).'],
    vehicles_color_ok: ['vehicle_color', 'Use plain words for the colour, up to 30 characters (no links, emoji or < >).'],
    vehicles_year_ok: ['vehicle_year', 'Enter a year between 1900 and 2100.'],
  };
  function fromDb(err) {
    if (!err) return fail('unknown', generic(), '');
    if (err.isBooking) return err;
    if (err.code === 'P0001') return fail(err.message || 'unknown', err.details || err.message || generic(), err.hint || '');
    if (err.code === '23514') {
      const m = /"([a-z_]+)"\s*$/.exec(err.message || '') || /"(vehicles_[a-z]+_ok)"/.exec(err.message || '');
      const c = m && CHECKS[m[1]];
      if (c) return fail('invalid_input', c[1], c[0]);
    }
    if (err.code === '23505') return fail('wrong_state', 'That was already saved. Thank you!', '');
    try { console.error(err); } catch (e) { /* nothing to do */ }
    return fail('unknown', generic(), '');
  }
  const roundHalfUp = (x) => Math.floor(x + 0.5);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));
  // The database's rule (public.normalize_phone): a US number that can exist, not an N11 exchange or a 555-01xx one
  function normalizePhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    const n = d.length === 10 ? '1' + d : d.length === 11 && d[0] === '1' ? d : null;
    return n && /^1[2-9][0-8]\d[2-9]\d{6}$/.test(n) && !/^[2-9]11$/.test(n.slice(4, 7)) && !(n.slice(4, 7) === '555' && n.slice(7, 9) === '01') ? n : null;
  }
  // A name as it is sent: composed (NFC), so a name pasted or filled in with separate accent marks is the one the
  // database checks, and trimmed.
  const cleanName = (s) => String(s || '').normalize('NFC').trim();
  // The database's rule, public.is_valid_name (with public.has_profanity), part for part, on the name as it is sent
  // (cleanName). 1 to 40 characters, counted as the database counts them; letters in any alphabet, with ' or the
  // curly ’ (an iPhone types it), spaces, dots and hyphens between (its [[:alpha:]] is \p{L} here: the same 136,726
  // letters, compared on Nov 12; a browser newer than its Unicode 15.1 also takes the few scripts added since, which
  // the database then refuses). Then, in lower case: no character three times in a row, no run of keys (asdf, qwer,
  // zxcv...), not a placeholder word (Test, None, Name...), no swear word (whole words, split on anything that isn't
  // a letter) and never the two strings that are no part of a real name. Until Nov 12 the page checked only the
  // first part, so "Test" went all the way to Send and the database's answer said "letters only" (live, Nov 12).
  // nameProblem says why a name fails: 'letters' (its characters or its length, three dots or spaces in a row too),
  // 'real' (a placeholder, a letter three times, a run of keys, a swear word), or null when the database takes it.
  const NAME_CHARS = /^\p{L}([\p{L}'\u2019 .-]*[\p{L}.])?$/u;
  const NAME_KEYS = /asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|zxcv|xcvb|cvbn|vbnm|uiop|wsx/;   // (no "qaz" since Nov 12: Qazi, Qazim; Migration 010 part 2)
  const NAME_PLACEHOLDERS = ['test', 'testing', 'tester', 'fake', 'fakename', 'none', 'null', 'unknown', 'anonymous', 'idk',
    'xxx', 'asdf', 'qwerty', 'name', 'firstname', 'lastname', 'first', 'last', 'abc', 'blah', 'nobody', 'customer', 'user'];
  const NAME_SWEARS = ['fuck', 'fucker', 'fuckers', 'fucking', 'fuk', 'fck', 'motherfucker', 'shit', 'shitty', 'bullshit',
    'bitch', 'bitches', 'cunt', 'pussy', 'asshole', 'ass', 'arse', 'bastard', 'slut', 'whore', 'fag',
    'fags', 'faggot', 'faggots', 'retard', 'penis', 'vagina', 'cock', 'tits', 'titty', 'boobs', 'porn',
    'nazi', 'hitler', 'rape', 'rapist', 'nigger', 'niggers', 'nigga', 'niggas', 'chink', 'spic', 'kike',
    'wetback', 'twat', 'wank', 'wanker', 'prick', 'dildo', 'cum', 'jizz', 'horny', 'sexy', 'poop', 'crap',
    'douche', 'douchebag'];
  function nameProblem(s) {
    const t = cleanName(s), n = Array.from(t).length;   // characters, not UTF-16 units (char_length)
    if (n < 1 || n > 40 || !NAME_CHARS.test(t)) return 'letters';
    const l = t.toLowerCase();
    if (/([^\p{L}])\1\1/u.test(l)) return 'letters';
    if (/(\p{L})\1\1/u.test(l) || NAME_KEYS.test(l) || NAME_PLACEHOLDERS.includes(l) || /fuck|cunt/.test(l)
      || l.split(/[^\p{L}]+/u).some((w) => NAME_SWEARS.includes(w))) return 'real';
    return null;
  }
  const isValidName = (s) => !nameProblem(s);
  const NAME_SAYS = {
    first: { letters: 'Enter your first name using letters only.', real: 'Please enter your real first name.' },
    last: { letters: 'Enter your last name using letters only, or leave it empty.', real: 'Please enter your real last name, or leave it empty.' },
  };
  // what to tell the customer about a first or last name (which: 'first' or 'last'), or null when it is fine
  const nameMessage = (which, s) => { const why = nameProblem(s); return why ? NAME_SAYS[which][why] : null; };
  // The words for a refusal from the database. A name it turns away (hint first_name or last_name) although the name
  // is letters only (a rule it has that this page doesn't have yet) is not called "letters only": the page asks for
  // the real name instead. names: { first, last } as typed.
  function refusalText(e, names) {
    const which = e && e.code === 'invalid_input' ? (e.hint === 'first_name' ? 'first' : e.hint === 'last_name' ? 'last' : null) : null;
    if (!which || nameProblem(names && names[which]) === 'letters') return e && e.message;
    return NAME_SAYS[which].real;
  }
  // public.is_clean_text, the database's rule for notes, the vehicle, the address and reviews: no links or web
  // addresses, no emoji, no < or >, no control characters. textProblem returns what to change, or null when the text
  // is fine (checked to give the database's verdict on 102 of 102 test strings).
  // The database's \m (start of a word) is written as "the start, or a character that isn't a letter, digit or _",
  // never as a lookbehind: Safari before 16.4 (all of iOS 15) can't compile one, and this file would then not load.
  // Like the database's ~*, only A to Z count as the same letter in either case (the "i" flag would also let the
  // Kelvin sign and the long s stand for k and s), so the text is lowercased in ASCII only and tested without it.
  const WORD = '[\\p{L}\\p{N}_]';
  const LINKISH = new RegExp('(https?:|www\\.|(^|[^\\p{L}\\p{N}_])(?=' + WORD + ')[a-z0-9_-]+\\.(com|net|org|io|co|app|me|ly|info|xyz|ru|cn|site|shop|link)(?!' + WORD + '))', 'u');
  function textProblem(t) {
    const v = String(t == null ? '' : t);
    if (!v) return null;
    if (LINKISH.test(v.replace(/[A-Z]/g, (c) => c.toLowerCase()))) return 'Please take out the link or web address.';
    if (/[<>]/.test(v) || /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u.test(v) || /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v)) return 'Emoji and the < > signs can\'t be used here. Words only, please.';
    return null;
  }
  const isCleanText = (t) => !textProblem(t);
  const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  const todayLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  // Today where the business is (business_settings.timezone, America/Chicago): the booking window counts from it,
  // whatever time zone the browser is in.
  const todayIn = (tz) => {
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    } catch (e) { return todayLocal(); }
  };
  const isoDate = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  // ---------------------------------------------------------------- preview mode: the quote, line for line from quote_core
  // (Migration 011) and quote_booking's new-customer price (apply_first_visit). status: 'if_first_visit' (a visitor's
  // quote), 'applied' (a preview request that got it), 'not_eligible' or 'none' (it didn't).
  const PREVIEW_TODAY = () => isoDate(todayIn('America/Chicago'));
  function previewRate(code, group) {
    const all = SEED_RATES[code] || {}, r = group ? all[group] : null;
    const minutes = r ? r.minutes : Math.max(...Object.values(all).map((x) => x.minutes));
    const price = r ? r.price : null;
    return { price, minutes, pending: price == null ? 'size_price' : null };
  }
  function previewCore(p) {
    const m = SEED;
    const loc = p.location_type;
    const bundle = (p.bundle || '').trim() || null;
    const ext = (p.exterior || '').trim() || null;
    const intr = (p.interior || '').trim() || null;
    // json_text_array: each add-on once, trimmed, in the database's order (array_agg distinct: sorted)
    const addons = Array.isArray(p.addons) ? Array.from(new Set(p.addons.map((x) => String(x).trim()).filter(Boolean))).sort() : [];
    const vtype = (p.vehicle_type || '').trim() || null;
    const size = (p.vehicle_size || '').trim() || 'standard';
    const notSure = p.not_sure === true || p.not_sure === 'true';
    const conds = Array.isArray(p.conditions) ? p.conditions : [];
    const byCode = (c) => m.services.find((s) => s.code === c);
    if (!loc || !['mobile', 'shop'].includes(loc)) throw fail('invalid_input', 'Choose "We come to you" or "Come to us".', 'location_type');
    if (!['standard', 'xl'].includes(size)) throw fail('invalid_input', 'Choose Standard or XL for the vehicle size.', 'vehicle_size');
    if (vtype && !m.vehicle_types.some((t) => t.code === vtype)) throw fail('invalid_input', 'Choose a vehicle type from the list.', 'vehicle_type');
    const condOpts = m.options.condition;
    if (conds.some((c) => !condOpts.some((o) => o.code === c))) throw fail('invalid_input', 'Choose what the inside is like from the list.', 'conditions');
    if (conds.length > 1 && conds.some((c) => condOpts.find((o) => o.code === c).is_none)) throw fail('invalid_input', '"None" can\'t be combined with other answers.', 'conditions');
    const groups = {};
    conds.forEach((c) => { const g = condOpts.find((o) => o.code === c).choice_group; if (g) groups[g] = (groups[g] || 0) + 1; });
    const dup = Object.keys(groups).find((g) => groups[g] > 1);
    if (dup) throw fail('invalid_input', dup === 'pet' ? 'Choose one pet-hair answer.' : 'Choose only one of those answers.', 'conditions');
    const group = !notSure && vtype ? (m.vehicle_types.find((t) => t.code === vtype) || {}).size_group || null : null;

    const lines = [];
    let mains = [], kinds = [], chosen = [], value = 0, savings = 0, minutes = 0;
    const pending = new Set();
    const line = (s, r, extra) => Object.assign({ code: s.code, name: s.name, kind: s.kind, price_cents: r.price, mobile_cents: 0, duration_min: Math.ceil(r.minutes), minutes_exact: r.minutes, included: false }, extra || {});
    if (bundle) {
      if (ext || intr) throw fail('invalid_input', 'Choose a bundle, or exterior and interior services, not both.', 'services');
      const s = byCode(bundle);
      if (!s || s.kind !== 'bundle') throw fail('invalid_input', "That bundle isn't available.", 'bundle');
      const r = previewRate(bundle, group);
      const parts = (m.bundle_parts[bundle] || []).map(byCode);
      let partsValue = 0, known = true;
      parts.forEach((x) => { const pr = previewRate(x.code, group); if (pr.price == null) known = false; else partsValue += pr.price; });
      mains = parts.map((x) => x.code).concat(bundle);
      kinds = parts.map((x) => x.kind).concat('bundle');
      chosen = [bundle];
      if (r.pending) pending.add(r.pending);
      lines.push(line(s, r));
      if (r.price != null) {
        if (known) { value += Math.max(partsValue, r.price); savings += Math.max(partsValue - r.price, 0); } else value += r.price;
      }
      minutes += r.minutes;
    } else {
      [[ext, 'exterior'], [intr, 'interior']].forEach(([code, kind]) => {
        if (!code) return;
        const s = byCode(code);
        if (!s || s.kind !== kind) throw fail('invalid_input', 'That ' + kind + " service isn't available.", kind);
        const r = previewRate(code, group);
        if (r.pending) pending.add(r.pending);
        lines.push(line(s, r));
        mains.push(s.code); kinds.push(s.kind); chosen.push(s.code);
        value += r.price || 0; minutes += r.minutes;
      });
    }
    if (!mains.length) throw fail('invalid_input', "Choose at least one service. Add-ons can't be booked on their own.", 'services');
    if (chosen.length > 1) minutes -= m.visit_overhead_min * (chosen.length - 1);   // one shared visit

    const includedCodes = [];
    const includedSet = new Set();
    mains.forEach((c) => (m.includes[c] || []).forEach((i) => includedSet.add(i)));
    m.services.filter((s) => includedSet.has(s.code) && !s.code.startsWith('cond_')).sort((a, b) => a.sort - b.sort).forEach((s) => {
      includedCodes.push(s.code);
      lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: 0, mobile_cents: 0, duration_min: 0, minutes_exact: 0, included: true });
    });

    addons.forEach((code) => {
      if (includedCodes.includes(code)) return;
      if (code.startsWith('cond_')) throw fail('invalid_input', "That add-on isn't available.", 'addons');
      const s = byCode(code);
      if (!s || s.kind !== 'addon') throw fail('invalid_input', "That add-on isn't available.", 'addons');
      const allow = m.allowed_with[code];
      if (allow && !allow.some((c) => chosen.includes(c))) {
        const names = allow.map((c) => byCode(c).name);
        throw fail('invalid_input', s.name + ' goes with the ' + (names.length <= 1 ? names[0] : names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1]) + '.', 'addons');
      }
      const needs = m.addon_rules[code] || 'any_main';
      if ((needs === 'exterior' || needs === 'interior') && !kinds.includes(needs)) throw fail('invalid_input', s.name + ' needs an ' + needs + ' service in the same booking.', 'addons');
      const r = previewRate(code, group);
      if (r.pending) pending.add(r.pending);
      lines.push(line(s, r));
      value += r.price || 0; minutes += r.minutes;
    });

    const feeCodes = condOpts.filter((o) => o.fee_code && conds.includes(o.code)).map((o) => o.fee_code);
    if (!kinds.includes('interior') && condOpts.some((o) => !o.is_none && conds.includes(o.code))) throw fail('invalid_input', 'Those answers apply to services with an inside part. Choose one, or choose None.', 'conditions');
    feeCodes.forEach((code) => {
      const s = byCode(code);
      if (!s) return;
      if (includedSet.has(code)) { lines.push({ code: s.code, name: s.name, kind: s.kind, price_cents: 0, mobile_cents: 0, duration_min: 0, minutes_exact: 0, included: true, condition: true }); return; }
      const r = previewRate(code, group);
      if (r.pending) pending.add(r.pending);
      lines.push(line(s, r, { condition: true }));
      value += r.price || 0; minutes += r.minutes || 0;
    });

    if (size === 'xl') pending.add('xl');
    const pend = Array.from(pending).sort();

    let suggestion = null;
    if (!bundle && ext && intr && !pend.length) {
      const here = value - savings;
      const extSort = byCode(ext).sort;
      m.services.filter((b) => b.kind === 'bundle').sort((a, b) => a.sort - b.sort).forEach((b) => {
        const parts = m.bundle_parts[b.code] || [];
        if (parts.length !== 2 || !parts.includes(intr) || !parts.some((c) => byCode(c).kind === 'exterior' && (c === ext || byCode(c).sort > extSort))) return;
        try {
          const q2 = previewCore(Object.assign({}, p, { exterior: null, interior: null, bundle: b.code }));
          const there = q2.value_cents - q2.bundle_savings_cents;
          if (!q2.price_pending && there < here && (!suggestion || here - there > suggestion.saves_cents)) {
            suggestion = { bundle: b.code, name: b.name, saves_cents: here - there, total_cents: q2.total_cents, duration_min: q2.duration_min };
          }
        } catch (e) { /* that bundle can't be quoted; no suggestion */ }
      });
    }
    return {
      location_type: loc, size_group: group, lines, value_cents: value, bundle_savings_cents: savings, subtotal_cents: value - savings,
      mobile_cents: 0, price_pending: pend.length > 0, pending_reasons: pend,
      total_cents: pend.length ? null : value - savings, duration_min: Math.ceil(minutes), suggestion,
    };
  }
  // The offer runs until its end date (Parker's day). ?nooffer shows a preview with the offer over (screenshots only).
  const previewOfferOn = () => PREVIEW_TODAY() <= SEED.offer_ends_on && !/[?&]nooffer\b/.test(location.search);
  // first_visit_deal_for (Migration 012): the deal whose services are exactly the quote's (no bundle), each line at its
  // regular rate and each deal price below it, for the quote's size, while the offer runs and nothing is held; null if none
  function previewDealFor(q) {
    const gi = SIZE_CODES.indexOf(q.size_group);
    if (!previewOfferOn() || q.price_pending || gi < 0) return null;
    const ql = q.lines.filter((l) => ['exterior', 'interior', 'bundle'].includes(l.kind) && !l.included);
    const have = ql.map((l) => l.code).sort().join();
    const reg = (code) => (SEED_RATES[code] && SEED_RATES[code][q.size_group] ? SEED_RATES[code][q.size_group].price : null);
    const deals = SEED.deals.slice().sort((a, b) => a.sort - b.sort || (a.code < b.code ? -1 : 1));
    for (const d of deals) {
      const r = d.rates[gi];
      if (!r || [d.exterior, d.interior].filter(Boolean).sort().join() !== have) continue;
      const below = (code, cents) => cents != null && reg(code) != null && cents < reg(code);
      if ((d.exterior && !below(d.exterior, r[0])) || (d.interior && !below(d.interior, r[1]))) continue;
      if (ql.some((l) => l.price_cents !== reg(l.code))) continue;
      const lines = {};
      if (d.exterior) lines[d.exterior] = { price_cents: r[0], regular_cents: reg(d.exterior) };
      if (d.interior) lines[d.interior] = { price_cents: r[1], regular_cents: reg(d.interior) };
      return {
        deal: d.code, name: d.name, codes: [d.exterior, d.interior].filter(Boolean), ends_on: SEED.offer_ends_on,
        price_cents: (r[0] || 0) + (r[1] || 0), regular_cents: (d.exterior ? reg(d.exterior) : 0) + (d.interior ? reg(d.interior) : 0), lines,
      };
    }
    return null;
  }
  // apply_first_visit: the deal's lines at their first-visit prices (each keeps its regular price beside it), and the
  // first_visit block naming the deal (null: no deal here)
  function previewFirstVisit(q, status) {
    const o = status == null ? null : previewDealFor(q);
    if (!o) return Object.assign(q, { first_visit: null });
    if (status === 'if_first_visit' || status === 'applied') {
      const diff = o.regular_cents - o.price_cents;
      q.lines = q.lines.map((l) => (!l.included && (l.kind === 'exterior' || l.kind === 'interior') && o.lines[l.code]
        ? Object.assign({}, l, { price_cents: o.lines[l.code].price_cents, regular_cents: o.lines[l.code].regular_cents, first_visit: true }) : l));
      q.value_cents -= diff; q.subtotal_cents -= diff; if (q.total_cents != null) q.total_cents -= diff;
    }
    q.first_visit = { status, deal: o.deal, name: o.name, codes: o.codes, ends_on: o.ends_on, price_cents: o.price_cents, regular_cents: o.regular_cents };
    return q;
  }
  // get_first_visit_offer's deals: each active deal with its prices per size ({ first_visit_cents, regular_cents,
  // lines }), only the sizes where every deal price is below the regular one
  function previewDeals() {
    return SEED.deals.slice().sort((a, b) => a.sort - b.sort).map((d) => {
      const prices = {};
      SIZE_CODES.forEach((g, i) => {
        const r = d.rates[i], lines = {};
        let first = 0, regular = 0, ok = !!r;
        [[d.exterior, 0], [d.interior, 1]].forEach(([code, k]) => {
          if (!code || !ok) return;
          const reg = SEED_RATES[code][g].price;
          if (r[k] == null || !(r[k] < reg)) { ok = false; return; }
          lines[code] = { first_visit_cents: r[k], regular_cents: reg };
          first += r[k]; regular += reg;
        });
        if (ok) prices[g] = { first_visit_cents: first, regular_cents: regular, lines };
      });
      return { code: d.code, name: d.name, sort: d.sort, exterior: d.exterior, interior: d.interior, prices };
    });
  }
  const previewPhonesBooked = new Set();   // the phones a preview request used: their next one is at the regular price
  function previewQuote(p, status) {
    const q = previewFirstVisit(previewCore(p), status === undefined ? (previewSession && previewBookings.some((b) => !b.example) ? 'not_eligible' : 'if_first_visit') : status);
    if (q.suggestion && q.first_visit && q.first_visit.status === 'if_first_visit') {
      const saves = q.total_cents - q.suggestion.total_cents;
      if (saves > 0) q.suggestion = Object.assign({}, q.suggestion, { saves_cents: saves }); else q.suggestion = null;
    }
    return q;
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
    const iso = d.getDay() || 7;                      // ISO weekday, as the database counts it
    const shut = (st.weekly_closures || []).filter((w) => w.weekday === iso);
    const out = [];
    for (let s = st.first_start_min; s <= st.last_start_min; s += st.slot_step_min) {
      if (s + duration > st.latest_end_min) break;
      if (s < busyEnd && s + duration > busyStart) continue;
      if (shut.some((w) => s < w.end_min && s + duration > w.start_min)) continue;   // same rule as open_starts
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
  const previewRef = () => { const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = 'AD-'; for (let i = 0; i < 8; i++) r += abc[Math.floor(Math.random() * abc.length)]; return r; };

  // Preview only: the example customer's past details, so the owner can see the account's history (gold by value,
  // the progress line, the folded cancelled list) before any real customer has one. Each is priced by the preview
  // quote above, so its lines and mobile charge are the menu's own; each says example: true and the account labels
  // it. Live mode never has these: myBookings there is the database's my_bookings.
  function previewExamples() {
    const weekend = (weeks, sunday) => { let d = addDays(todayLocal(), -7 * weeks); while (d.getDay() !== 6) d = addDays(d, -1); return sunday ? addDays(d, 1) : d; };
    const at = (day, daysBefore, min) => { const d = addDays(day, -daysBefore); d.setHours(0, min, 0, 0); return d.toISOString(); };
    const make = (day, start, p, status, extra) => {
      const q = previewQuote(p, p.fv || 'none'), kind = SEED.vehicle_types.find((t) => t.code === p.vehicle_type);
      const steps = status === 'cancelled'
        ? [['requested', at(day, 6, 1210)], ['confirmed', at(day, 5, 570)], ['cancelled', at(day, 1, 1085)]]
        : [['requested', at(day, 5, 1182)], ['confirmed', at(day, 4, 555)], ['in_progress', at(day, 0, start)], ['completed', at(day, 0, start + q.duration_min)]];
      return Object.assign({
        id: uuid(), ref: previewRef(), status, service_date: isoDate(day), start_min: start, duration_min: q.duration_min, end_min: start + q.duration_min,
        location_type: p.location_type, address: null, address_zip: null,
        vehicle: { make: null, model: null, year: null, color: null, type: p.vehicle_type, size: 'standard', not_sure: true, description: kind ? kind.name : null },   // the type it is priced for, in the menu's word: no make or model is made up
        hold_expires_at: null, value_cents: q.value_cents, bundle_savings_cents: q.bundle_savings_cents, mobile_cents: q.mobile_cents,
        extra_cost_cents: null, extra_cost_note: null, price_pending: q.price_pending, pending_reasons: q.pending_reasons, total_cents: q.total_cents, lines: q.lines,
        first_visit_offer: !!(q.first_visit && q.first_visit.status === 'applied'),
        first_visit_deal: q.first_visit && q.first_visit.status === 'applied' ? q.first_visit.deal : null,
        first_visit_deal_name: q.first_visit && q.first_visit.status === 'applied' ? q.first_visit.name : null,
        created_at: steps[0][1], preview: true, example: true, shop_address: null, team: [], history: steps.map(([s, t]) => ({ status: s, at: t, note: null })),
      }, extra || {});
    };
    return [
      // a 3-row Full Detail ($229.99): over $200, so the account shows the gold (doc 22)
      make(weekend(1), 600, { location_type: 'mobile', bundle: 'full_detail_v2', vehicle_type: 'large_suv', conditions: ['none'] }, 'completed'),
      make(weekend(3, true), 600, { location_type: 'shop', bundle: 'inside_out', vehicle_type: 'large_suv', conditions: ['none'] }, 'cancelled'),
      make(weekend(5, true), 660, { location_type: 'shop', interior: 'interior_detail', vehicle_type: 'large_suv', conditions: ['pet_hair_some'] }, 'completed'),
      // the first visit: a Basic Wash at the Outside First Timer Deal's price (Migrations 011 and 012)
      make(weekend(8), 840, { location_type: 'shop', exterior: 'basic_wash', vehicle_type: 'large_suv', fv: 'applied' }, 'completed'),
    ];
  }
  // the deals as the site reads them: an array (jsonb keeps no key order, so the order is the deals' sort)
  function dealsSorted(o) {
    if (!o || typeof o !== 'object') return o;
    o.deals = Array.isArray(o.deals) ? o.deals.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)) : [];
    return o;
  }
  const authListeners = [];
  const authEvent = (event, signedIn) => authListeners.forEach((fn) => { try { fn(event, signedIn); } catch (e) { /* one listener never stops the others */ } });

  // A busy page (shaders compiling on a slow phone) can run the timer before an answer that has already
  // arrived, so the timer gives up only after a further moment with the call still open.
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      let t = setTimeout(() => { t = setTimeout(() => reject(new Error('timeout')), 1500); }, ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  // Live when the config and supabase-js are present and the project answers (a second try after a slow
  // or failed first one, so a bad moment on the network doesn't drop a customer into the preview); preview otherwise.
  function init() {
    if (ready) return ready;
    ready = (async () => {
      const cfg = window.ALCHEMIST_CONFIG;
      if (cfg && cfg.supabaseUrl && cfg.supabaseKey && window.supabase && window.supabase.createClient) {
        try {
          sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
        } catch (e) { sb = null; }
        for (let i = 0; sb && i < 2 && mode !== 'live'; i++) {
          try {
            const { data, error } = await withTimeout(sb.rpc('get_public_settings'), i ? 10000 : 8000);
            if (error) throw error;
            settingsCache = data;
            mode = 'live';
          } catch (e) { /* one more try, then the preview */ }
        }
        if (mode !== 'live') { sb = null; mode = 'preview'; }
        // sign-in, sign-out (in this tab or another) and token refreshes, passed on to onAuth's listeners outside
        // supabase-js's own lock (a listener may read the session again)
        if (sb) sb.auth.onAuthStateChange((event, s) => { setTimeout(() => authEvent(event, !!s), 0); });
      }
      if (mode === 'preview') settingsCache = Object.assign({}, SEED.settings, /[?&]guest=0\b/.test(location.search) ? { guest_booking: false } : {});
      return mode;
    })();
    return ready;
  }

  // A new account can't be made right now (sign-ups off at Supabase): what to do instead. "Book without one" only while
  // a guest can actually book online (guest booking on, and online booking not switched off: config.js bookingClosed)
  const guestsCanBook = () => !!(settingsCache && settingsCache.guest_booking) && !(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.bookingClosed);
  const SIGNUPS_CLOSED = () => {
    const ph = (settingsCache && settingsCache.public_phone) || '(945) 361-7551';
    return 'New accounts can’t be made online yet. ' + (guestsCanBook() ? 'You can book without one, or call ' + ph + '.' : 'Please call ' + ph + '.');
  };

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
    // On the site's own addresses, no answer from the database is an outage (a paused project, a network fault):
    // the pages show the phone number instead of the preview, which would take requests that go nowhere. Read after init().
    get isDown() { return mode !== 'live' && !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.deployed); },
    // Visitors may book without an account (Migration 005, business_settings.guest_booking). Since Nov 26 (doc 57,
    // the owner's "Both, build it") that sits beside accounts: a visitor books as a guest by default, or signs in or
    // makes an account with a text code. (Also on while online booking is switched off, config.js bookingClosed; the
    // booking itself shows its note then.)
    get guestBooking() { return !!(settingsCache && settingsCache.guest_booking) || !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.bookingClosed); },
    // Customer accounts are open on the site (sign-in and sign-up by text code on Account, Appointments and the
    // booking): once text codes work (config.js textCodes, Twilio Verify, doc 57). Off, the Account and Appointments
    // pages show the "coming soon" panel, as before.
    get accountsOpen() { return !!(window.ALCHEMIST_CONFIG && window.ALCHEMIST_CONFIG.textCodes); },
    // A guest can book online right now: guest booking on and the booking not switched off (guestBooking above is
    // also on while booking is closed, for other reasons). For the Account pages' "book as a guest" lines.
    get guestsCanBook() { return guestsCanBook(); },
    helpers: { normalizePhone, isValidName, nameProblem, nameMessage, refusalText, cleanName, textProblem, isValidEmail, isCleanText, isoDate, addDays, todayLocal, todayIn, uuid },

    async settings() { await init(); return settingsCache; },

    // The menu (Migration 011): services and their price and minutes per size (rates[code][size] = { price, minutes };
    // the first-visit prices are the First Timer Deals', Migration 012: firstVisitOffer), the sizes, which size each vehicle type is
    // (typeSize; none for van and other: the price is held), what an add-on goes with (allowedWith), the inside answers
    // with their pet-hair pair (choice_group) and one-line descriptions. allOptions keeps every answer the database lets
    // this reader see, retired ones too, so an older booking's answers keep their words (the console, the Team page).
    async menu() {
      await init();
      if (menuCache) return menuCache;
      if (mode === 'preview') {
        const allOptions = {};
        Object.keys(SEED.options).forEach((k) => { allOptions[k] = SEED.options[k].concat((SEED.retired_options[k] || [])); });
        menuCache = {
          services: SEED.services.slice(), vehicleTypes: SEED.vehicle_types.slice(), options: SEED.options, allOptions,
          bundleParts: SEED.bundle_parts, includes: SEED.includes, addonRules: SEED.addon_rules, typePrices: SEED.type_prices, zips: new Set(SEED.zips),
          sizes: SEED.sizes.slice(), rates: SEED_RATES, allowedWith: SEED.allowed_with,
          typeSize: Object.fromEntries(SEED.vehicle_types.map((t) => [t.code, t.size_group])),
        };
        return menuCache;
      }
      const q = (t, cols, order) => sb.from(t).select(cols).order(order || 'sort');
      const [svc, vt, fo, bp, si, ar, tp, zz, sg, sr, aw] = await Promise.all([
        q('services', 'id,code,kind,name,description,base_price_cents,priced_by_vehicle_type,priced_by_size,duration_min,mobile_pct,sort,active'),
        q('vehicle_types', 'code,name,sort,active,size_group'),
        q('form_options', 'list,code,label,is_none,sends_to_review,holds_price,requires_note,sort,active,fee_code,choice_group,description'),
        sb.from('bundle_parts').select('bundle_id,part_id'),
        sb.from('service_includes').select('service_id,included_id'),
        sb.from('addon_rules').select('addon_id,needs'),
        sb.from('service_type_prices').select('service_id,vehicle_type,price_cents'),
        sb.from('service_zip_codes').select('zip'),
        q('size_groups', 'code,name,short_name,sort'),
        sb.from('service_size_rates').select('service_id,size_group,price_cents,minutes'),
        sb.from('addon_allowed_with').select('addon_id,service_id'),
      ]);
      for (const r of [svc, vt, fo, bp, si, ar, tp, zz, sg, sr, aw]) if (r.error) throw fromDb(r.error);
      const byId = {}; svc.data.forEach((s) => { byId[s.id] = s.code; });
      const activeId = new Set(svc.data.filter((s) => s.active).map((s) => s.id));
      const bundleParts = {}; bp.data.forEach((r) => { (bundleParts[byId[r.bundle_id]] = bundleParts[byId[r.bundle_id]] || []).push(byId[r.part_id]); });
      const includes = {}; si.data.forEach((r) => { (includes[byId[r.service_id]] = includes[byId[r.service_id]] || []).push(byId[r.included_id]); });
      const addonRules = {}; ar.data.forEach((r) => { addonRules[byId[r.addon_id]] = r.needs; });
      const typePrices = {}; tp.data.forEach((r) => { (typePrices[byId[r.service_id]] = typePrices[byId[r.service_id]] || {})[r.vehicle_type] = r.price_cents; });
      const rates = {}; sr.data.filter((r) => activeId.has(r.service_id)).forEach((r) => {
        (rates[byId[r.service_id]] = rates[byId[r.service_id]] || {})[r.size_group] = { price: r.price_cents, minutes: Number(r.minutes) };
      });
      // (an add-on limited to services the menu retired: only the active ones count)
      const allowedWith = {}; aw.data.filter((r) => activeId.has(r.service_id)).forEach((r) => { (allowedWith[byId[r.addon_id]] = allowedWith[byId[r.addon_id]] || []).push(byId[r.service_id]); });
      const sortOf = (c) => (svc.data.find((s) => s.code === c) || {}).sort || 0;
      Object.values(allowedWith).forEach((l) => l.sort((x, y) => sortOf(x) - sortOf(y)));
      const options = {}, allOptions = {};
      fo.data.forEach((o) => { (allOptions[o.list] = allOptions[o.list] || []).push(o); if (o.active) (options[o.list] = options[o.list] || []).push(o); });
      const types = vt.data.filter((t) => t.active);
      menuCache = {
        services: svc.data.filter((s) => s.active).map((s) => Object.assign({}, s, { mobile_pct: Number(s.mobile_pct) })),
        vehicleTypes: types, options, allOptions, bundleParts, includes, addonRules, typePrices, zips: new Set(zz.data.map((z) => z.zip)),
        sizes: sg.data, rates, allowedWith, typeSize: Object.fromEntries(types.map((t) => [t.code, t.size_group || null])),
      };
      return menuCache;
    },

    // The First Timer Deals (Migration 012), for the banner, the Services page, the cards and the booking: { active,
    // ends_on, prices (the Outside deal per size, as Migration 011 gave it), deals: [{ code, name, sort, exterior,
    // interior, prices: { size: { first_visit_cents, regular_cents, lines } } }] } (get_first_visit_offer; the end date
    // is the owner's, in business_settings). deals is always an array, in the database's order (sort).
    async firstVisitOffer() {
      await init();
      if (mode === 'preview') {
        if (!previewOfferOn()) return { active: false, ends_on: null, prices: {}, deals: [] };
        const deals = previewDeals(), out = deals.find((d) => d.code === 'outside'), prices = {};
        if (out) Object.keys(out.prices).forEach((g) => { prices[g] = { first_visit_cents: out.prices[g].first_visit_cents, regular_cents: out.prices[g].regular_cents }; });
        return { active: true, ends_on: SEED.offer_ends_on, prices, deals };
      }
      return dealsSorted(await rpc('get_first_visit_offer'));
    },
    // The 4-week pop-up (my_first_visit_offer): { show, ends_on, prices, deals } for the signed-in customer; the database
    // decides (an account at least 28 days old with no booking yet, while the offer runs). Preview: ?offerpopup shows it.
    async myFirstVisitOffer() {
      await init();
      if (mode === 'preview') {
        const o = await api.firstVisitOffer();
        return Object.assign({ show: /[?&]offerpopup\b/.test(location.search) && o.active }, o);
      }
      const { data } = await sb.auth.getSession();
      if (!(data && data.session)) return { show: false, deals: [] };
      return dealsSorted(await rpc('my_first_visit_offer'));
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
      const firstSays = nameMessage('first', first), lastSays = last && nameMessage('last', last);
      if (firstSays) throw fail('invalid_input', firstSays, 'first_name');
      if (lastSays) throw fail('invalid_input', lastSays, 'last_name');
      if (mode === 'preview') { if (previewSession) { previewSession.firstName = cleanName(first); previewSession.lastName = cleanName(last) || null; } return previewSession; }
      try { await rpc('update_my_profile', { p_first_name: cleanName(first), p_last_name: cleanName(last) }); } catch (e) {
        if (e.hint === 'first_name' || e.hint === 'last_name') e.message = refusalText(e, { first, last });
        throw e;
      }
      return api.session();
    },

    async saveVehicle(v) {
      await init();
      const row = {
        make: String(v.make || '').trim(), model: String(v.model || '').trim(), year: v.year ? Number(v.year) : null,
        color: String(v.color || '').trim() || null, vehicle_type: v.vehicle_type, size: v.size || 'standard', modifications: v.modifications || [],
      };
      // what to change, field by field, before the table's own checks (whose refusals fromDb names by check)
      if (!row.make || row.make.length > 40) throw fail('invalid_input', 'Enter the vehicle make.', 'vehicle_make');
      if (textProblem(row.make)) throw fail('invalid_input', textProblem(row.make), 'vehicle_make');
      if (!row.model || row.model.length > 40) throw fail('invalid_input', 'Enter the vehicle model.', 'vehicle_model');
      if (textProblem(row.model)) throw fail('invalid_input', textProblem(row.model), 'vehicle_model');
      if (v.year && !(/^\d{4}$/.test(String(v.year)) && +v.year >= 1900 && +v.year <= 2100)) throw fail('invalid_input', 'Enter a year between 1900 and 2100.', 'vehicle_year');
      if (row.color && row.color.length > 30) throw fail('invalid_input', 'Keep the colour to 30 characters or fewer.', 'vehicle_color');
      if (textProblem(row.color)) throw fail('invalid_input', textProblem(row.color), 'vehicle_color');
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

    // opts.staff: the team's sign-in (#admin, #team), which never makes a new account for a number typed there
    // (shouldCreateUser false), so a stranger's number can't become a login once texting works.
    async sendPhoneCode(phone, names, opts) {
      await init();
      const n = normalizePhone(phone);
      if (!n) throw fail('invalid_input', 'Enter a 10-digit US phone number.', 'phone');
      const staff = !!(opts && opts.staff);
      if (mode === 'preview') {
        await new Promise((r) => setTimeout(r, 600));
        // ?signups=0: the answer while Supabase's "Allow new users to sign up" is off (screenshots of that message)
        if (!staff && /[?&]signups=0\b/.test(location.search)) throw fail('signups_closed', SIGNUPS_CLOSED(), 'phone');
        return { sent: true, preview: true };
      }
      const data = { first_name: names && cleanName(names.first) || undefined, last_name: names && cleanName(names.last) || undefined };
      const { error } = await sb.auth.signInWithOtp({ phone: '+' + n, options: staff ? { shouldCreateUser: false } : { data } });
      if (error) {
        // never GoTrue's own words ("Unsupported phone provider", "Signups not allowed for otp"): what to do instead
        if (error.status === 429 || /rate_limit/.test(error.code || '')) throw fail('too_many_requests', 'Please wait a minute before asking for another code.', 'phone');
        // a staff sign-in with a number no team account has: Supabase refuses to make one (shouldCreateUser false)
        if (staff && error.code === 'otp_disabled') throw fail('code_not_sent', 'No team account uses that number.', 'phone');
        // a customer's number with no account while Supabase's "Allow new users to sign up" is off (doc 57): the owner
        // switches it on at go-live; until then only numbers that already have an account get a code. Supabase answers
        // a new number with 422 signup_disabled ("Signups not allowed for this instance"); otp_disabled is kept in case
        if (!staff && (/^(signup_disabled|otp_disabled)$/.test(error.code || '') || /signups? not allowed/i.test(error.message || ''))) throw fail('signups_closed', SIGNUPS_CLOSED(), 'phone');
        // texting not connected at Supabase yet (doc 36)
        if (/^(phone_provider_disabled|otp_disabled|sms_send_failed)$/.test(error.code || '')) throw fail('code_not_sent', "Text codes aren't working yet. Please call " + settingsCache.public_phone + '.', 'phone');
        throw fail('code_not_sent', "We can't text a code to this number right now. Call " + settingsCache.public_phone + '.', 'phone');
      }
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
        // older than anything booked here (?noexamples: a brand-new account's empty pages, for the owner's screenshots)
        if (!previewBookings.some((b) => b.example) && !/[?&]noexamples\b/.test(location.search)) previewBookings.push(...previewExamples());
        return previewSession;
      }
      const { error } = await sb.auth.verifyOtp({ phone: '+' + n, token: c, type: 'sms' });
      if (error) {
        // Supabase answers a wrong code and an old one the same way (otp_expired), so the message names both
        if (error.status === 429 || /rate_limit/.test(error.code || '')) throw fail('too_many_requests', 'Too many tries. Wait a minute, then try again.', 'phone_code');
        throw fail('bad_code', "That code didn't match, or it has expired. Check the text, or press Resend for a new one.", 'phone_code');
      }
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
      return (await rpc('get_availability', { p_date: dateIso, p_duration: duration, p_location: loc })) || [];
    },

    // Free start times for moving a booking (the console's Change time): the staff rule (today and any day ahead,
    // the booking itself not in the way), plus its own start when the day stays and the length doesn't grow.
    // b: the booking ({ id, service_date, start_min, duration_min, location_type }).
    async staffTimes(b, dateIso, duration) {
      await init();
      const own = (list) => {
        const t = (list || []).slice();
        if (dateIso === b.service_date && duration <= b.duration_min && !t.includes(b.start_min)) { t.push(b.start_min); t.sort((x, y) => x - y); }
        return t;
      };
      if (mode === 'preview') return own(previewTimes(dateIso, duration, b.location_type));
      const { data, error } = await sb.rpc('staff_availability', { p_id: b.id, p_date: dateIso, p_duration: duration });
      if (!error) return data || [];
      // a database without Migration 007 part 3 (no staff_availability yet): the customers' times, plus the booking's own
      // start, marked forCustomers so the console doesn't call them the free times (the booking still blocks its own
      // neighbourhood there, and today is never in it)
      if (error.code !== 'PGRST202') throw fromDb(error);
      const t = own(await rpc('get_availability', { p_date: dateIso, p_duration: duration, p_location: b.location_type }));
      t.forCustomers = true;
      return t;
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

    // opts.guest: a booking without an account (submit_guest_booking: the name and phone as typed)
    async submit(p, opts) {
      await init();
      if (mode === 'preview') {
        await new Promise((r) => setTimeout(r, 900));
        // the new-customer price is decided as save_booking decides it: once per phone (this preview's own requests)
        const ph = normalizePhone(p.phone || (previewSession && previewSession.phone)) || 'preview';
        const q = previewQuote(p, previewPhonesBooked.has(ph) ? 'none' : 'applied');
        if (nameMessage('first', p.first_name)) throw fail('invalid_input', nameMessage('first', p.first_name), 'first_name');
        if (!p.service_date) throw fail('invalid_input', 'Choose a day.', 'service_date');
        if (p.start_min == null) throw fail('invalid_input', 'Choose one of the start times shown.', 'start_min');
        const hasInterior = q.lines.some((l) => !l.included && (l.kind === 'interior' || l.kind === 'bundle'));
        if (hasInterior && !(p.conditions || []).length) throw fail('invalid_input', 'Tell us what the car is like, or choose None.', 'conditions');
        const created = new Date();
        const r = {
          id: uuid(), ref: previewRef(), status: 'requested', service_date: p.service_date, start_min: p.start_min,
          duration_min: q.duration_min, end_min: p.start_min + q.duration_min, location_type: p.location_type,
          address: p.address || null, address_zip: p.address_zip || null,
          vehicle: { make: p.vehicle_make || null, model: p.vehicle_model || null, year: p.vehicle_year || null, color: p.vehicle_color || null,
                     type: p.vehicle_type || null, size: p.vehicle_size || 'standard', not_sure: !!p.not_sure, description: p.vehicle_description || null },
          hold_expires_at: new Date(created.getTime() + SEED.settings.hold_hours * 3600000).toISOString(),
          value_cents: q.value_cents, bundle_savings_cents: q.bundle_savings_cents, mobile_cents: q.mobile_cents,
          price_pending: q.price_pending, pending_reasons: q.pending_reasons, total_cents: q.total_cents, lines: q.lines,
          created_at: created.toISOString(), preview: true, shop_address: null, team: [],
          history: [{ status: 'requested', at: created.toISOString(), note: null }],   // as my_bookings logs a new request
          conditions: (p.conditions || []).slice(),   // as my_bookings returns them (Migration 008 part 3)
          first_visit_offer: !!(q.first_visit && q.first_visit.status === 'applied'),
          // which deal it got, and its name (booking_receipt, Migration 012)
          first_visit_deal: q.first_visit && q.first_visit.status === 'applied' ? q.first_visit.deal : null,
          first_visit_deal_name: q.first_visit && q.first_visit.status === 'applied' ? q.first_visit.name : null,
        };
        previewPhonesBooked.add(ph);
        // a guest's request belongs to no account (submit_guest_booking saves no customer), so it never shows under
        // Appointments, as on the real site (doc 57: linking them by phone is only PROPOSED)
        if (!(opts && opts.guest)) previewBookings.unshift(r);
        return r;
      }
      if (!(opts && opts.guest)) return rpc('submit_booking', { p });
      try { return await rpc('submit_guest_booking', { p }); } catch (e) {
        // the owner turned guest booking off since this page loaded: from now on the site asks for the text code
        if (e.code === 'sign_in_required' && settingsCache) settingsCache.guest_booking = false;
        throw e;
      }
    },

    async signOut(opts) {
      await init();
      if (mode === 'preview') { previewSession = null; previewStaff = null; authEvent('SIGNED_OUT', false); return; }
      // this browser only: signing out here never ends the same login on another device (opts may add to it)
      await sb.auth.signOut(Object.assign({ scope: 'local' }, opts));
    },

    // ---- reviews (Migration 002 part 5) ----
    async publicReviews() {
      await init();
      if (mode === 'preview') return previewReviews.filter((r) => r.status === 'approved').map((r) => ({ id: r.id, name: r.display_name, rating: r.rating, body: r.body, is_gold: r.is_gold, reply: r.owner_reply, created_at: r.created_at, services: r.services }));
      return (await rpc('public_reviews', { p_limit: 50 })) || [];
    },
    async myReviews() {
      await init();
      if (mode === 'preview') return previewSession ? previewReviews.filter((r) => r.user_id === previewSession.userId) : [];
      const { data, error } = await sb.from('reviews').select('id,appointment_id,rating,body,status,is_gold,owner_reply,created_at');
      if (error) throw fromDb(error);
      return data || [];
    },
    async submitReview(appointmentId, rating, body) {
      await init();
      const v = String(body || '').trim();
      if (!(rating >= 1 && rating <= 5)) throw fail('invalid_input', 'Choose 1 to 5 stars.', 'rating');
      if (!v || v.length > 1000) throw fail('invalid_input', 'Write a few words (under 1,000 characters).', 'body');
      if (textProblem(v)) throw fail('invalid_input', textProblem(v), 'body');
      if (mode === 'preview') {
        const b = previewBookings.find((x) => x.id === appointmentId);
        if (previewReviews.some((r) => r.appointment_id === appointmentId)) throw fail('wrong_state', "You've already reviewed this detail. Thank you!", 'appointment');
        const s = previewSession || {};
        const r = { id: uuid(), appointment_id: appointmentId, user_id: s.userId, rating, body: v, status: 'pending', is_gold: !!(b && b.total_cents >= 20000),
          display_name: (s.firstName || 'A customer') + (s.lastName ? ' ' + s.lastName[0] + '.' : ''), owner_reply: null, created_at: new Date().toISOString(),
          services: b ? b.lines.filter((l) => !l.included && !/^cond_/.test(l.code)).map((l) => l.name).join(' + ') : '' };
        previewReviews.unshift(r); return r;
      }
      return rpc('submit_review', { p_appointment: appointmentId, p_rating: rating, p_body: v });
    },
    async allReviews() {
      await init();
      if (mode === 'preview') return previewReviews.slice();
      const { data, error } = await sb.from('reviews').select('id,appointment_id,rating,body,status,is_gold,display_name,owner_reply,created_at').order('created_at', { ascending: false });
      if (error) throw fromDb(error);
      return data || [];
    },
    async reviewSetStatus(id, status) {
      await init();
      if (mode === 'preview') { const r = previewReviews.find((x) => x.id === id); if (r) r.status = status; return r; }
      return rpc('review_set_status', { p_id: id, p_status: status });
    },
    async reviewReply(id, text) {
      await init();
      if (mode === 'preview') { const r = previewReviews.find((x) => x.id === id); if (r) r.owner_reply = (text || '').trim() || null; return r; }
      return rpc('review_reply', { p_id: id, p_reply: text });
    },

    // ---- staff side (the admin console and the team view) ----
    client() { return sb; },
    rpc(name, args) { return rpc(name, args); },
    fail,

    // fn(event, signedIn) on each sign-in and sign-out: Supabase's own events in live mode (SIGNED_IN, SIGNED_OUT,
    // TOKEN_REFRESHED, MFA_CHALLENGE_VERIFIED, ...), the preview's staff sign-in and sign-out in preview mode
    onAuth(fn) { authListeners.push(fn); },
    // Whether this browser keeps a login at all (supabase-js stores it under sb-<project>-auth-token), read without
    // starting the data layer: a visitor's page makes no request to find out.
    hasStoredLogin() {
      const cfg = window.ALCHEMIST_CONFIG;
      try { return !!(cfg && cfg.supabaseUrl && localStorage.getItem('sb-' + new URL(cfg.supabaseUrl).hostname.split('.')[0] + '-auth-token')); } catch (e) { return false; }
    },
    // Who is signed in, with their role and whether the authenticator step is done.
    async staffSession() {
      await init();
      if (mode === 'preview') return previewStaff;
      const s = await api.session();
      if (!s) return null;
      const { data: prof, error: profErr } = await sb.from('profiles').select('id,role,first_name,last_name,is_active').eq('id', s.userId).maybeSingle();
      let aal = 'aal1', nextLevel = 'aal1';
      try { const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); aal = data.currentLevel; nextLevel = data.nextLevel; } catch (e) { /* no MFA support */ }
      const { data: factors } = await sb.auth.mfa.listFactors().catch(() => ({ data: null }));
      // roleUnknown: the profile read failed (a weak connection), so 'customer' is a guess; the menu's team item
      // (Switch sides or My jobs) keeps what it showed rather than take it for a customer
      return Object.assign({}, s, { roleUnknown: !!profErr, role: prof ? prof.role : 'customer', active: prof ? prof.is_active : true, aal, nextLevel,
        hasAuthenticator: !!(factors && factors.totp && factors.totp.length), mfaRequired: settingsCache.require_mfa_for_managers !== false });
    },
    // Team sign-in with an email and a password (doc 43), for the owner and managers. The login is made in the
    // Supabase dashboard (Authentication, Users, Add user): the site never creates one. Once "Allow new users to sign
    // up" is on (doc 57, for customers' text codes), Supabase's email sign-up stays shut only through "Confirm email"
    // (no email sender, so no confirmation arrives): doc 57's go-live steps. The authenticator step follows exactly as
    // after a text code.
    async staffPasswordSignIn(email, password) {
      await init();
      const e = String(email || '').trim().toLowerCase();
      if (!isValidEmail(e)) throw fail('invalid_input', 'Enter your email address.', 'staff_email');
      if (!password) throw fail('invalid_input', 'Enter your password.', 'staff_password');
      if (mode !== 'live') throw fail('unavailable', "The database can't be reached right now. Reload the page in a few minutes.", 'staff_password');
      const { error } = await sb.auth.signInWithPassword({ email: e, password: String(password) });
      if (error) {
        const code = error.code || '';
        if (code === 'email_not_confirmed') throw fail('not_confirmed', 'This login isn\'t confirmed yet. In Supabase, open Authentication, then Users, and confirm it.', 'staff_password');
        if (error.status === 429 || /rate_limit/.test(code)) throw fail('too_many_requests', 'Too many tries. Wait a few minutes, then try again.', 'staff_password');
        if (code === 'invalid_credentials' || error.status === 400) throw fail('bad_login', "That email and password don't match.", 'staff_password');
        throw fail('unavailable', "We couldn't sign you in right now. Try again in a minute.", 'staff_password');
      }
      return api.session();
    },
    previewStaffSignIn(role) { previewStaff = { userId: 'preview-staff', role, firstName: 'Owner', aal: 'aal2', hasAuthenticator: true, phoneConfirmed: true, preview: true }; authEvent('SIGNED_IN', true); return previewStaff; },

    // Authenticator app (TOTP): enrol, then verify a code; later, challenge and verify.
    async mfaEnroll() {
      // A setup left half-way (a reload, a closed tab) leaves an unverified factor with the same name, and Supabase
      // refuses a second one by that name: those are cleared first (allowed before the second step, doc 43).
      const { data: had } = await sb.auth.mfa.listFactors().catch(() => ({ data: null }));
      for (const f of ((had && had.all) || []).filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) {
        await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
      }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Alchemist admin', issuer: 'Alchemist Detailing' });
      if (error) throw fail('mfa_error', "The authenticator setup couldn't start. Try again in a moment.", 'mfa_code');
      return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
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
  const previewReviews = [];

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
