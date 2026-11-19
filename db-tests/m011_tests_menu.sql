-- Updated for Migration 012 (Nov 19, 2026): the owner's new prices (Basic Wash $59.99 / $64.99, Hand Wash $89.99 / $94.99,
-- Inside & Out and Full Detail up by the same amounts) and the First Timer Deals. Changed expectations, everything else as
-- run for Migration 011: A21 (regular prices beside the Outside deal), the B price loop and B11, B14, B17, B19, B22, B23,
-- B33, B35 (new prices); C2, C3, C5, C9, C18, C33, C37, C38, C39, C43, C44, D6, D7, D11 (new prices); C4, C11, D8 (the
-- owner's list now says "First Timer Deal, Outside"); C34 (Basic Wash + Interior Clean is now the Both deal, $79.99, with
-- no Inside & Out suggestion; under Migration 011 it was $110 with the $35 wash and a $10 suggestion). The deals
-- themselves are tested in m012_tests_deals.sql.
--
-- Migration 011 tests: the new menu (sizes, prices, minutes, add-on rules, inside answers), the first-time Basic Wash
-- price, the pop-up check, and the owner's list. Needs the m001 framework and fixtures, and Migration 011 applied.
--
-- How it runs: one query through the Supabase MCP (execute_sql): four small helper functions in schema tst, then ONE
-- DO block (role switches with "set local role", never a top-level "set role"). The block ends by raising its own
-- results as an error, so everything it did rolls back: no test booking is left on the test project, nothing counts
-- toward the guest limits, and no booking alert (Migration 010, ntfy) is sent, because the alert runs only at commit.
-- The error message is the result: "M011 TESTS (rolled back): <passed> of <total> passed", then one line per check.
-- It can run again at once (fixed phone numbers 1 (469) 820-xxxx and made-up streets that exist nowhere else).
--
-- Before Migration 011 part 10 was applied, the old bookings' fingerprint was stored with
--   select tst.setv('m011_appt_fp', <the fingerprint query in check A1>);
-- check A1 compares it (the migration changed no saved booking).

create or replace function tst.m011_slot(p jsonb, p_from int default 3) returns jsonb
language plpgsql as $f$
declare
  q jsonb;
  d date;
  s int[];
begin
  q := public.quote_core(p);
  for i in p_from .. 58 loop
    d := public.local_today() + i;
    s := public.get_availability(d, (q ->> 'duration_min')::int, p ->> 'location_type');
    if cardinality(s) > 0 then
      return p || jsonb_build_object('service_date', d, 'start_min', s[1]);
    end if;
  end loop;
  raise exception 'm011: no free slot for %', p;
end
$f$;

-- A guest request (submit_guest_booking, signed out); defaults: mobile Basic Wash on a sedan.
create or replace function tst.m011_guest(p_extra jsonb) returns public.appointments
language plpgsql as $f$
declare
  p jsonb;
  r jsonb;
  a public.appointments;
begin
  perform tst.logout();
  p := tst.booking(coalesce(p_extra ->> 'location_type', 'mobile'), null, null,
         jsonb_build_object('bundle', null, 'exterior', 'basic_wash', 'first_name', 'Mara', 'last_name', 'Quill',
                            'special_request', 'm011 test', 'conditions', '[]'::jsonb) || p_extra);
  p := tst.m011_slot(p, coalesce((p_extra ->> 'from_day')::int, 3));
  r := public.submit_guest_booking(p);
  select * into a from public.appointments x where x.ref = r ->> 'ref';
  return a;
end
$f$;

-- A customer login with a text-confirmed phone, its account p_age_days old.
create or replace function tst.m011_user(p_phone text, p_age_days int) returns uuid
language plpgsql as $f$
declare
  u uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, phone, phone_confirmed_at, raw_user_meta_data, is_anonymous)
  values (u, 'authenticated', 'authenticated', p_phone, now(), '{"first_name":"Nell","last_name":"Quill"}', false);
  update public.profiles set created_at = now() - make_interval(days => p_age_days) where id = u;
  return u;
end
$f$;

-- A request from a signed-in customer (submit_booking, role authenticated).
create or replace function tst.m011_account(p_user uuid, p_extra jsonb) returns public.appointments
language plpgsql as $f$
declare
  p jsonb;
  r jsonb;
  a public.appointments;
begin
  p := tst.booking(coalesce(p_extra ->> 'location_type', 'mobile'), null, null,
         jsonb_build_object('bundle', null, 'exterior', 'basic_wash', 'special_request', 'm011 test',
                            'conditions', '[]'::jsonb) || p_extra);
  p := tst.m011_slot(p, coalesce((p_extra ->> 'from_day')::int, 3));
  perform tst.login(p_user, 'aal1');
  execute 'set local role authenticated';
  r := public.submit_booking(p);
  execute 'reset role';
  perform tst.logout();
  select * into a from public.appointments x where x.ref = r ->> 'ref';
  return a;
end
$f$;

do $$
declare
  v_start bigint;
  v_pass int;
  v_total int;
  v_text text;
  v_got text;
  v_want text;
  v_code text;
  v_key text;
  v_mon date;
  q jsonb;
  r jsonb;
  ap public.appointments;
  ap2 public.appointments;
  u27 uuid;
  u28 uuid;
  u3 uuid;
  u4 uuid;
  i int;
  admin_id constant uuid := '00000000-0000-4000-8000-0000000000a1';
  manager_id constant uuid := '00000000-0000-4000-8000-0000000000b1';
  detailer_id constant uuid := '00000000-0000-4000-8000-0000000000c1';
  customer_id constant uuid := '00000000-0000-4000-8000-0000000000d1';
begin
  select coalesce(max(id), 0) into v_start from tst.results;
  perform tst.logout();
  update public.business_settings set guest_booking = true, first_visit_offer_ends_on = date '2027-02-17' where id = 1;

  -- ===================== A. The catalog and who can read or change it =====================
  perform tst.eq((select count(*) || ':' || md5(string_agg(a.id::text || a.value_cents || '/' || coalesce(a.total_cents::text, '-')
                   || '/' || a.duration_min || '/' || a.status || '/'
                   || (select coalesce(string_agg(i.code || i.price_cents, ',' order by i.sort), '')
                       from public.appointment_items i where i.appointment_id = a.id), '|' order by a.id))
                  from public.appointments a),
                 tst.getv('m011_appt_fp'), 'm011 A1: old bookings unchanged by the migration (prices, minutes, lines)');
  perform tst.eq((select count(*)::text from public.services s where s.active), '15', 'm011 A2: 15 services on sale (6 services, 6 add-ons, 3 inside-answer fees)');
  perform tst.eq((select count(*)::text from public.services s where s.active
                  and (not s.priced_by_size or (select count(*) from public.service_size_rates r where r.service_id = s.id) <> 4)),
                 '0', 'm011 A3: every service on sale is priced by size, with exactly 4 rates');
  perform tst.eq((select count(*)::text from public.services s
                  join public.service_size_rates r on r.service_id = s.id and r.size_group = 'car'
                  where s.active and (s.base_price_cents <> r.price_cents or s.duration_min <> ceil(r.minutes))),
                 '0', 'm011 A4: base_price_cents and duration_min hold the car figures');
  perform tst.eq((select count(*)::text from public.services where mobile_pct <> 0), '0', 'm011 A5: no mobile fee on any service, old ones included');
  perform tst.eq((select count(*)::text from public.services where not active and code in ('ext_basic', 'ext_deluxe', 'int_basic',
                  'int_deluxe', 'signature_combo', 'full_detail', 'perfect_finish_sealant', 'steam_cleaning', 'cond_pet_hair',
                  'cond_dirt_sand', 'cond_spills', 'cond_heavy_stains')), '12', 'm011 A6: the 12 old services are retired, not removed');
  perform tst.eq((select string_agg(code || '=' || coalesce(size_group, '-'), ',' order by code) from public.vehicle_types),
                 'convertible=car,coupe=car,crossover=two_rows,large_suv=three_rows,minivan=minivan,other=-,sedan=car,suv=two_rows,truck=three_rows,van=-',
                 'm011 A7: vehicle types map to the four sizes; van and other have none');
  perform tst.eq((select name from public.vehicle_types where code = 'sedan'), 'Sedan, hatchback or wagon', 'm011 A8: sedan relabelled, code unchanged');
  perform tst.eq(public.address_key('123 N. Main Street, Apt 4', '75002'), '75002|123|main', 'm011 A9: address key ignores direction, suffix and unit');
  perform tst.eq(public.address_key('12 oak st., apt 3', '75072-1234'), public.address_key('12 Oak Street', '75072'), 'm011 A10: two spellings of one address give one key');
  perform tst.ok(public.address_key('Main St', '75002') is null and public.address_key('12 Oak St', null) is null, 'm011 A11: no house number or no ZIP: no key');

  -- Visitors.
  perform tst.logout();
  execute 'set local role anon';
  perform tst.eq((select count(*)::text from public.size_groups), '4', 'm011 A12: a visitor reads the 4 sizes');
  perform tst.eq((select count(*)::text from public.service_size_rates), '60', 'm011 A13: a visitor reads the 60 rates of services on sale');
  perform tst.eq((select count(*)::text from public.addon_allowed_with), '6', 'm011 A14: a visitor reads the add-on limits');
  perform tst.eq((select count(*)::text from public.services where code in ('signature_combo', 'ext_basic', 'full_detail')), '0', 'm011 A15: retired services are off the public menu');
  perform tst.eq((select string_agg(code, ',' order by sort, code) from public.form_options where list = 'condition'),
                 'none,pet_hair_some,pet_hair_lots,heavy_dirt,other', 'm011 A16: the five inside answers, in order');
  perform tst.err($q$insert into public.size_groups (code, name, short_name) values ('xx', 'X', 'X')$q$, '42501', 'm011 A17: a visitor can''t add a size');
  perform tst.err($q$select public.quote_core('{}'::jsonb)$q$, '42501', 'm011 A18: a visitor can''t call quote_core');
  perform tst.err($q$select public.first_visit_eligible('19455550000', null, null, null)$q$, '42501', 'm011 A19: a visitor can''t ask who has booked');
  perform tst.err($q$select public.my_first_visit_offer()$q$, '42501', 'm011 A20: the pop-up check is for signed-in users only');
  q := public.get_first_visit_offer();
  perform tst.ok((q ->> 'active')::boolean and q ->> 'ends_on' = '2027-02-17'
                 and (q #>> '{prices,car,first_visit_cents}')::int = 3500 and (q #>> '{prices,car,regular_cents}')::int = 5999
                 and (q #>> '{prices,two_rows,first_visit_cents}')::int = 4000 and (q #>> '{prices,minivan,regular_cents}')::int = 6499,
                 'm011 A21: get_first_visit_offer gives the end date and $35/$59.99 car, $40/$64.99 bigger (prices of Migration 012)', q::text);
  execute 'reset role';

  -- Staff and customers.
  perform tst.login(manager_id, 'aal2');
  execute 'set local role authenticated';
  perform tst.err($q$insert into public.service_size_rates (service_id, size_group, price_cents, minutes)
                     select id, 'car', 1, 1 from public.services where code = 'hand_wash'$q$, '42501', 'm011 A22: a manager can''t add or change prices');
  execute 'reset role';
  perform tst.login(admin_id, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq(tst.q($q$with u as (update public.service_size_rates r set minutes = r.minutes from public.services s
                         where s.id = r.service_id and s.code = 'hand_wash' and r.size_group = 'car' returning 1)
                         select count(*)::text from u$q$), '1', 'm011 A23: the admin can change a rate');
  execute 'reset role';
  perform tst.login(detailer_id, 'aal1');
  execute 'set local role authenticated';
  perform tst.eq(tst.q($q$select label from public.form_options where list = 'condition' and code = 'pet_hair'$q$), 'Pet hair',
                 'm011 A24: a detailer still reads a retired inside answer''s label (old bookings)');
  execute 'reset role';
  perform tst.login(customer_id, 'aal1');
  execute 'set local role authenticated';
  perform tst.eq(tst.q($q$select count(*)::text from public.form_options where list = 'condition' and code = 'pet_hair'$q$), '0',
                 'm011 A25: a customer sees only the answers on offer');
  perform tst.eq(tst.q($q$select count(*)::text from public.business_settings$q$), '0', 'm011 A26: a customer reads no settings row (managers only)');
  execute 'reset role';
  perform tst.login(manager_id, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq(tst.q($q$select first_visit_offer_ends_on::text || '/' || first_visit_popup_days || '/' || visit_overhead_min
                         from public.business_settings where id = 1$q$), '2027-02-17/28/32', 'm011 A26b: a manager reads the new settings');
  execute 'reset role';

  -- Retired codes can't be quoted.
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","bundle":"signature_combo","vehicle_type":"sedan","conditions":["none"]}')$q$, 'invalid_input', 'm011 A27: Signature Combo can''t be quoted');
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","exterior":"ext_basic","vehicle_type":"sedan"}')$q$, 'invalid_input', 'm011 A28: Exterior Basic can''t be quoted');
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","interior":"int_deluxe","vehicle_type":"sedan","conditions":["none"]}')$q$, 'invalid_input', 'm011 A29: Interior Deluxe can''t be quoted');
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","addons":["perfect_finish_sealant"]}')$q$, 'invalid_input', 'm011 A30: WetGloss can''t be added');
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","addons":["steam_cleaning"],"conditions":["none"]}')$q$, 'invalid_input', 'm011 A31: Steam Cleaning can''t be added');
  perform tst.err($q$select public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","conditions":["pet_hair"]}')$q$, 'invalid_input', 'm011 A32: an old inside answer (pet_hair) is refused');

  -- ===================== B. Prices and minutes =====================
  for v_code, v_key in
    select * from (values ('basic_wash', 'exterior'), ('hand_wash', 'exterior'), ('inside_out', 'bundle'),
                          ('full_detail_v2', 'bundle'), ('interior_clean', 'interior'), ('interior_detail', 'interior')) v(c, k)
  loop
    select string_agg(t.typ || ':' || coalesce(t.qq ->> 'total_cents', 'null') || '/' || (t.qq ->> 'duration_min') || '/'
                      || coalesce(t.qq ->> 'size_group', '-'), ',' order by t.typ)
      into v_got
      from (select x.typ, public.quote_core(jsonb_build_object('location_type', 'mobile', v_key, v_code, 'vehicle_type', x.typ,
                     'conditions', case when v_key = 'exterior' then '[]'::jsonb else '["none"]'::jsonb end)) as qq
            from unnest(array['sedan', 'coupe', 'convertible', 'crossover', 'suv', 'truck', 'large_suv', 'minivan']) as x(typ)) t;
    select string_agg(t.typ || ':' || e.price || '/' || e.mins || '/' || t.g, ',' order by t.typ)
      into v_want
      from (values ('sedan', 'car'), ('coupe', 'car'), ('convertible', 'car'), ('crossover', 'two_rows'), ('suv', 'two_rows'),
                   ('truck', 'three_rows'), ('large_suv', 'three_rows'), ('minivan', 'minivan')) as t(typ, g)
      join (values
        ('basic_wash', 'car', 5999, 92), ('basic_wash', 'two_rows', 6499, 104), ('basic_wash', 'three_rows', 6499, 115), ('basic_wash', 'minivan', 6499, 115),
        ('hand_wash', 'car', 8999, 91), ('hand_wash', 'two_rows', 9499, 101), ('hand_wash', 'three_rows', 9499, 111), ('hand_wash', 'minivan', 9499, 111),
        ('inside_out', 'car', 11499, 163), ('inside_out', 'two_rows', 12999, 191), ('inside_out', 'three_rows', 13999, 219), ('inside_out', 'minivan', 14999, 237),
        ('full_detail_v2', 'car', 17999, 315), ('full_detail_v2', 'two_rows', 20499, 376), ('full_detail_v2', 'three_rows', 22999, 437), ('full_detail_v2', 'minivan', 24999, 484),
        ('interior_clean', 'car', 7500, 103), ('interior_clean', 'two_rows', 8500, 121), ('interior_clean', 'three_rows', 9000, 139), ('interior_clean', 'minivan', 10000, 157),
        ('interior_detail', 'car', 12500, 229), ('interior_detail', 'two_rows', 14500, 276), ('interior_detail', 'three_rows', 16500, 323), ('interior_detail', 'minivan', 18500, 370)
      ) as e(c, g, price, mins) on e.g = t.g and e.c = v_code;
    perform tst.eq(v_got, v_want, 'm011 B: ' || v_code || ' price/minutes/size at every vehicle type');
  end loop;

  q := public.quote_core('{"location_type":"mobile","bundle":"full_detail_v2","vehicle_type":"van","conditions":["none"]}');
  perform tst.ok(q ->> 'total_cents' is null and q -> 'pending_reasons' = '["size_price"]' and (q ->> 'duration_min')::int = 484
                 and (q ->> 'value_cents')::int = 0 and (q ->> 'bundle_savings_cents')::int = 0,
                 'm011 B7: a van holds the price (size_price), adds nothing to the value, and holds the longest time', q::text);
  q := public.quote_core('{"location_type":"mobile","exterior":"hand_wash","vehicle_type":"other"}');
  perform tst.ok(q ->> 'total_cents' is null and q -> 'pending_reasons' = '["size_price"]' and (q ->> 'duration_min')::int = 111,
                 'm011 B8: "Other" holds the price', q::text);
  q := public.quote_core('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan","not_sure":true}');
  perform tst.ok(q ->> 'total_cents' is null and q ->> 'size_group' is null and (q ->> 'duration_min')::int = 115,
                 'm011 B9: "Not sure" holds the price even with a type', q::text);
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"van"}');
  perform tst.ok(q -> 'first_visit' = 'null'::jsonb and q ->> 'total_cents' is null, 'm011 B10: no new-customer price on a held price', q::text);

  q := public.quote_core('{"location_type":"mobile","exterior":"hand_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 16499 and (q ->> 'duration_min')::int = 162,
                 'm011 B11: Hand Wash + Interior Clean booked apart: $164.99, one visit (91 + 103 - 32 = 162 min)', q::text);
  perform tst.ok(q #>> '{suggestion,bundle}' = 'inside_out' and (q #>> '{suggestion,saves_cents}')::int = 5000,
                 'm011 B12: the suggestion offers Inside & Out, $50 less', q::text);
  q := public.quote_core('{"location_type":"mobile","exterior":"hand_wash","interior":"interior_detail","vehicle_type":"suv","conditions":["none"]}');
  perform tst.ok(q #>> '{suggestion,bundle}' = 'full_detail_v2' and (q #>> '{suggestion,saves_cents}')::int = 3500,
                 'm011 B13: Hand Wash + Interior Detail suggests the Full Detail, $35 less on 2 rows', q::text);
  q := public.quote_core('{"location_type":"mobile","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q #>> '{suggestion,bundle}' = 'inside_out' and (q #>> '{suggestion,saves_cents}')::int = 2000,
                 'm011 B14: Basic Wash + Interior Clean ($134.99) suggests Inside & Out ($114.99), a fuller wash for less', q::text);
  perform tst.eq((select string_agg(public.quote_core(jsonb_build_object('location_type', 'shop', 'bundle', 'inside_out', 'vehicle_type', t, 'conditions', '["none"]'::jsonb)) ->> 'bundle_savings_cents', '/' order by o)
                  from unnest(array['sedan', 'suv', 'large_suv', 'minivan']) with ordinality as x(t, o)), '5000/5000/4500/4500',
                 'm011 B15: Inside & Out saves $50 / $50 / $45 / $45 against its parts');
  perform tst.eq((select string_agg(public.quote_core(jsonb_build_object('location_type', 'shop', 'bundle', 'full_detail_v2', 'vehicle_type', t, 'conditions', '["none"]'::jsonb)) ->> 'bundle_savings_cents', '/' order by o)
                  from unnest(array['sedan', 'suv', 'large_suv', 'minivan']) with ordinality as x(t, o)), '3500/3500/3000/3000',
                 'm011 B16: Full Detail saves $35 / $35 / $30 / $30 against its parts');
  q := public.quote_core('{"location_type":"mobile","bundle":"inside_out","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'mobile_cents')::int = 0 and (q ->> 'total_cents')::int = 11499, 'm011 B17: no mobile charge', q::text);

  -- Add-on rules.
  perform tst.err($q$select public.quote_core('{"location_type":"shop","exterior":"hand_wash","vehicle_type":"sedan","addons":["wheels_tire_shine"]}')$q$, 'invalid_input', 'm011 B18: Wheels & Tire Shine is refused with the Hand Wash');
  q := public.quote_core('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"suv","addons":["wheels_tire_shine"]}');
  perform tst.ok((q ->> 'total_cents')::int = 8499 and (q ->> 'duration_min')::int = 125, 'm011 B19: Basic Wash + Wheels & Tire Shine on 2 rows: $84.99, 103.25 + 21.5 min', q::text);
  perform tst.err($q$select public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"sedan","addons":["gloss_wax"],"conditions":["none"]}')$q$, 'invalid_input', 'm011 B20: Gloss wax foam is refused with the Full Detail');
  perform tst.err($q$select public.quote_core('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","addons":["gloss_wax"],"conditions":["none"]}')$q$, 'invalid_input', 'm011 B21: Gloss wax foam is refused with an inside-only service');
  q := public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"sedan","addons":["gloss_wax","engine_bay","film_care","leather_care","stain_removal"],"conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 11499 + 2000 + 5000 + 1500 + 3500 + 4000 and (q ->> 'duration_min')::int = 163 + 10 + 25 + 12 + 25 + 33,
                 'm011 B22: Inside & Out takes every add-on it allows, at one price for every size', q::text);
  q := public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"sedan","addons":["leather_care"],"conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 17999 and exists (select 1 from jsonb_array_elements(q -> 'lines') l
                 where l ->> 'code' = 'leather_care' and (l ->> 'included')::boolean and (l ->> 'price_cents')::int = 0),
                 'm011 B23: Leather care is Included in the Full Detail (never charged twice)', q::text);
  q := public.quote_core('{"location_type":"shop","interior":"interior_detail","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(exists (select 1 from jsonb_array_elements(q -> 'lines') l where l ->> 'code' = 'leather_care' and (l ->> 'included')::boolean),
                 'm011 B24: Leather care is Included in the Interior Detail', q::text);
  perform tst.err($q$select public.quote_core('{"location_type":"shop","exterior":"hand_wash","vehicle_type":"sedan","addons":["leather_care"]}')$q$, 'invalid_input', 'm011 B25: Leather care is refused with the Hand Wash');
  perform tst.err($q$select public.quote_core('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","addons":["film_care"],"conditions":["none"]}')$q$, 'invalid_input', 'm011 B26: Clear film care needs an outside wash');
  perform tst.err($q$select public.quote_core('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","addons":["stain_removal"]}')$q$, 'invalid_input', 'm011 B27: Stain removal needs an inside part');
  q := public.quote_core('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","addons":["engine_bay"],"conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 12500, 'm011 B28: the engine bay goes with any service', q::text);
  begin
    perform public.quote_core('{"location_type":"shop","exterior":"hand_wash","vehicle_type":"sedan","addons":["gloss_wax","wheels_tire_shine"]}');
    perform tst.ok(false, 'm011 B29: the refusal names the allowed service');
  exception when others then
    get stacked diagnostics v_text = pg_exception_detail;
    perform tst.eq(v_text, 'Wheels & Tire Shine goes with the Basic Wash.', 'm011 B29: the refusal names the allowed service');
  end;

  -- Inside answers.
  perform tst.err($q$select public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"sedan","conditions":["pet_hair_some","pet_hair_lots"]}')$q$, 'invalid_input', 'm011 B30: only one of the two pet-hair answers');
  perform tst.err($q$select public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"sedan","conditions":["none","heavy_dirt"]}')$q$, 'invalid_input', 'm011 B31: None can''t be combined');
  perform tst.err($q$select public.quote_core('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","conditions":["pet_hair_some"]}')$q$, 'invalid_input', 'm011 B32: no inside answer fees on an outside-only wash');
  q := public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"large_suv","conditions":["pet_hair_lots","heavy_dirt"]}');
  perform tst.ok((q ->> 'total_cents')::int = 13999 + 6000 + 4000 and (q ->> 'duration_min')::int = 314
                 and (select count(*) from jsonb_array_elements(q -> 'lines') l where (l ->> 'condition')::boolean) = 2,
                 'm011 B33: 3 rows, a lot of pet hair + heavy dirt: $60 + $40, 60 + 35 min (218.5 + 95 = 314)', q::text);
  q := public.quote_core('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","conditions":["pet_hair_some"]}');
  perform tst.ok((q ->> 'total_cents')::int = 10500 and (q ->> 'duration_min')::int = 123, 'm011 B34: car, some pet hair: +$30, +20 min', q::text);
  q := public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"minivan","conditions":["pet_hair_some"],"addons":["stain_removal"]}');
  perform tst.ok((q ->> 'total_cents')::int = 14999 + 3000 + 4000 and (q ->> 'duration_min')::int = 319,
                 'm011 B35: minivan: 236.25 + 25 + 57.75 = 319 min', q::text);

  -- The calendar: an empty Monday holds a car Full Detail at 10:00 and 10:30 only; a 2-row one not at all.
  for i in 7 .. 56 loop
    v_mon := public.local_today() + i;
    continue when extract(isodow from v_mon) <> 1;
    exit when cardinality(public.get_availability(v_mon, 30, 'shop')) = 12;
  end loop;
  perform tst.eq(public.get_availability(v_mon, (public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"sedan","conditions":["none"]}') ->> 'duration_min')::int, 'shop')::text,
                 '{600,630}', 'm011 B36: Monday, car Full Detail (315 min): 10:00 and 10:30 only');
  perform tst.eq(public.get_availability(v_mon, (public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"suv","conditions":["none"]}') ->> 'duration_min')::int, 'shop')::text,
                 '{}', 'm011 B37: Monday, 2-row Full Detail (376 min): no start');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_mon || $q$', 660,
                    '{"bundle":"full_detail_v2","first_name":"Mara","phone":"(469) 820-1191","special_request":"m011 test"}'))$q$,
                  'slot_unavailable', 'm011 B38: a start that fits only a shorter job is refused (11:00 + 315 min runs into the 4 PM closure)');

  -- ===================== C. Saved bookings and the first-time price =====================
  ap := tst.m011_guest('{"phone":"(469) 820-1101","address":"4711 Quillfeather Lane","address_zip":"75002"}');
  perform tst.ok(ap.first_visit_offer and ap.value_cents = 3500 and ap.total_cents = 3500 and ap.duration_min = 92,
                 'm011 C1: a first guest Basic Wash (car) gets $35 and still holds 92 minutes', row_to_json(ap)::text);
  perform tst.ok(exists (select 1 from public.appointment_items i where i.appointment_id = ap.id and i.code = 'basic_wash'
                         and i.price_cents = 3500 and i.regular_cents = 5999), 'm011 C2: the line keeps the regular price beside it');
  r := public.booking_receipt(ap);
  perform tst.ok((r ->> 'first_visit_offer')::boolean and (r #>> '{lines,0,regular_cents}')::int = 5999, 'm011 C3: the receipt carries the offer and the regular price', r::text);
  perform tst.ok((select "Total" from office.requests where "Reference" = ap.ref) = '$35.00 (First Timer Deal, Outside: phone and address checked)',
                 'm011 C4: the owner''s list tags the new-customer price');
  ap2 := tst.m011_guest('{"phone":"469.820.1101","address":"9 Marigold Court","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 5999
                 and exists (select 1 from public.appointment_items i where i.appointment_id = ap2.id and i.code = 'basic_wash'
                             and i.price_cents = 5999 and i.regular_cents is null),
                 'm011 C5: the same phone typed another way pays the regular price', row_to_json(ap2)::text);
  ap2 := tst.m011_guest('{"phone":"+1 469 820 1101","address":"10 Marigold Court","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer, 'm011 C6: and a third way (+1 ...)');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1102","address":"4711 quillfeather ln., apt 3","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer, 'm011 C7: the same street address spelled differently, another phone: regular price');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1103","address":"4711 Quillfeather Lane","address_zip":"75072"}');
  perform tst.ok(ap2.first_visit_offer, 'm011 C8: the same street in another ZIP is another address');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1104","address":"22 Juniper Way","address_zip":"75002","vehicle_type":"suv"}');
  perform tst.ok(ap2.first_visit_offer and ap2.total_cents = 4000
                 and exists (select 1 from public.appointment_items i where i.appointment_id = ap2.id and i.regular_cents = 6499),
                 'm011 C9: 2 rows: $40 instead of $64.99');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1105","location_type":"shop","vehicle_type":"minivan"}');
  perform tst.ok(ap2.first_visit_offer and ap2.total_cents = 4000, 'm011 C10: minivan at the shop: $40');
  perform tst.ok((select "Total" from office.requests where "Reference" = ap2.ref) = '$40.00 (First Timer Deal, Outside: phone checked; no address for Come to us)',
                 'm011 C11: a Come to us booking says only the phone was checked');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1106","address":"23 Juniper Way","address_zip":"75002","vehicle_type":"van"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.price_pending and ap2.pending_reasons = '{size_price}'
                 and ap2.queue = 'review' and 'size_price' = any (ap2.review_reasons),
                 'm011 C12: a van: no offer, the price held, and the request goes to Review', row_to_json(ap2)::text);
  perform tst.ok((select "Total" from office.requests where "Reference" = ap2.ref) = 'Price to set: price for this vehicle (van, other or not sure)',
                 'm011 C13: the owner''s list says why the price is held');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1107","address":"24 Juniper Way","address_zip":"75002","exterior":null,"bundle":"inside_out","vehicle_type":"van","conditions":["none"]}');
  perform tst.ok(ap2.value_cents = 0 and ap2.bundle_savings_cents = 0 and ap2.total_cents is null and ap2.duration_min = 237,
                 'm011 C14: a van Inside & Out saves with value 0, saving 0, no total, 237 minutes (review S4)');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1108","address":"25 Juniper Way","address_zip":"75002","addons":["wheels_tire_shine","gloss_wax","engine_bay"]}');
  perform tst.ok(ap2.first_visit_offer and ap2.total_cents = 3500 + 2000 + 2000 + 5000, 'm011 C15: add-ons at their usual prices on an offer booking');
  update public.appointments set status = 'cancelled' where special_request = 'm011 test' and status in ('requested', 'needs_information', 'confirmed');

  -- Tampering: the browser's figures are ignored.
  ap2 := tst.m011_guest('{"phone":"(469) 820-1109","address":"26 Juniper Way","address_zip":"75002","price_cents":1,"total_cents":1,"value_cents":1,"duration_min":5,"first_visit":true,"first_visit_offer":true,"regular_cents":1}');
  perform tst.ok(ap2.first_visit_offer and ap2.value_cents = 3500 and ap2.duration_min = 92, 'm011 C16: extra price, time and offer keys from the browser change nothing');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1101","address":"27 Juniper Way","address_zip":"75002","first_visit_offer":true}');
  perform tst.ok(ap2.first_visit_offer, 'm011 C17: a cancelled earlier request doesn''t use up the offer');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1110","location_type":"shop","exterior":null,"bundle":"full_detail_v2","vehicle_type":"sedan","conditions":["none"]}');
  ap := tst.m011_guest('{"phone":"(469) 820-1111","location_type":"shop","exterior":null,"bundle":"full_detail_v2","vehicle_type":"large_suv","conditions":["none"]}');
  perform tst.ok(ap2.duration_min = 315 and ap.duration_min = 437 and ap.total_cents = 22999,
                 'm011 C18: the time held follows the declared type (Sedan 315 min, SUV 3 rows 437 min; review S8)');
  perform tst.err($q$select tst.m011_guest('{"phone":"(469) 820-1112","location_type":"shop","exterior":null,"interior":"interior_clean","conditions":[]}')$q$,
                  'invalid_input', 'm011 C19: "What''s the inside like?" is required with an inside service');
  perform tst.err($q$select tst.m011_guest('{"phone":"(469) 820-1112","location_type":"shop","exterior":null,"interior":"interior_clean","conditions":["other"],"special_request":null}')$q$,
                  'invalid_input', 'm011 C20: "Other" needs a note');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1112","location_type":"shop","exterior":null,"interior":"interior_clean","conditions":["other"],"special_request":"m011 test"}');
  perform tst.ok(ap2.queue = 'review' and 'condition' = any (ap2.review_reasons), 'm011 C21: "Other" goes to Review');
  update public.appointments set status = 'cancelled' where special_request = 'm011 test' and status in ('requested', 'needs_information', 'confirmed');

  -- Which earlier bookings use up the offer (one booking, its status changed by the owner).
  ap := tst.m011_guest('{"phone":"(469) 820-1120","address":"31 Juniper Way","address_zip":"75002"}');
  v_key := public.address_key('31 Juniper Way', '75002');
  perform tst.ok(not public.first_visit_eligible('14698201120', null, null, null) and not public.first_visit_eligible(null, v_key, null, null),
                 'm011 C22: a waiting request counts, by phone and by address');
  update public.appointments set hold_expires_at = now() - interval '1 hour' where id = ap.id;
  perform tst.ok(not public.first_visit_eligible('14698201120', null, null, null), 'm011 C23: a request whose 24-hour hold ran out still counts (review B3)');
  update public.appointments set status = 'confirmed' where id = ap.id;
  perform tst.ok(not public.first_visit_eligible('14698201120', null, null, null), 'm011 C24: confirmed counts');
  update public.appointments set status = 'completed' where id = ap.id;
  perform tst.ok(not public.first_visit_eligible('14698201120', null, null, null), 'm011 C25: completed counts');
  update public.appointments set status = 'declined' where id = ap.id;
  perform tst.ok(public.first_visit_eligible('14698201120', v_key, null, null), 'm011 C26: declined doesn''t count');
  update public.appointments set status = 'cancelled' where id = ap.id;
  perform tst.ok(public.first_visit_eligible('14698201120', v_key, null, null), 'm011 C27: cancelled doesn''t count');
  update public.appointments set status = 'requested', queue = 'spam' where id = ap.id;
  perform tst.ok(public.first_visit_eligible('14698201120', v_key, null, null), 'm011 C28: the Spam lane doesn''t count');
  update public.appointments set queue = 'requests', anonymized_at = now() where id = ap.id;
  perform tst.ok(public.first_visit_eligible('14698201120', v_key, null, null), 'm011 C29: an anonymized booking doesn''t count');
  update public.appointments set status = 'cancelled' where id = ap.id;
  ap := tst.m011_guest('{"phone":"(469) 820-1121","address":"32 Juniper Way","address_zip":"75002","website":"http://spam.example"}');
  perform tst.ok(ap.queue = 'spam' and not ap.first_visit_offer, 'm011 C30: a request caught by the spam trap gets no offer');
  ap := tst.m011_guest('{"phone":"(469) 820-1121","address":"32 Juniper Way","address_zip":"75002"}');
  perform tst.ok(ap.first_visit_offer, 'm011 C31: and doesn''t cost the real person the offer');
  ap := tst.m011_guest('{"phone":"(469) 820-1122","address":"33 Juniper Way","address_zip":"75002","exterior":"hand_wash"}');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1122","address":"34 Juniper Way","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer, 'm011 C32: an earlier Hand Wash counts (any service)');
  update public.appointments set status = 'cancelled' where special_request = 'm011 test' and status in ('requested', 'needs_information', 'confirmed');

  -- The public quote never tests a typed phone or address; a signed-in customer's own history does count.
  ap := tst.m011_guest('{"phone":"(469) 820-1130","address":"41 Juniper Way","address_zip":"75002"}');
  perform tst.logout();
  execute 'set local role anon';
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan","phone":"(469) 820-1130","address":"41 Juniper Way","address_zip":"75002"}');
  perform tst.ok(q #>> '{first_visit,status}' = 'if_first_visit' and (q ->> 'total_cents')::int = 3500
                 and (q #>> '{lines,0,regular_cents}')::int = 5999 and q #>> '{first_visit,ends_on}' = '2027-02-17',
                 'm011 C33: a visitor''s quote shows $35 "if first visit", even for a phone and address that booked (no oracle)', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 7999 and q -> 'suggestion' = 'null'::jsonb and q #>> '{first_visit,deal}' = 'both',
                 'm011 C34 (Migration 012): Basic Wash + Interior Clean is the Both deal ($79.99), so no Inside & Out suggestion ($114.99)', q::text);
  execute 'reset role';

  -- Accounts.
  u28 := tst.m011_user('14698201201', 28);
  u27 := tst.m011_user('14698201202', 27);
  perform tst.login(u27, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P1: no pop-up for an account 27 days old');
  execute 'reset role';
  perform tst.login(u28, 'aal1');
  execute 'set local role authenticated';
  q := public.my_first_visit_offer();
  perform tst.ok((q ->> 'show')::boolean and q ->> 'ends_on' = '2027-02-17' and (q #>> '{prices,car,first_visit_cents}')::int = 3500,
                 'm011 P2: the pop-up shows to a customer whose account is 28 days old and has no booking', q::text);
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan"}');
  perform tst.ok(q #>> '{first_visit,status}' = 'if_first_visit' and (q ->> 'total_cents')::int = 3500, 'm011 C35: a new customer''s quote shows $35', q::text);
  execute 'reset role';
  ap := tst.m011_account(u28, '{"address":"51 Juniper Way","address_zip":"75002"}');
  perform tst.ok(ap.first_visit_offer and ap.total_cents = 3500 and ap.customer_id = u28, 'm011 C36: a customer''s first Basic Wash gets $35');
  perform tst.login(u28, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P3: no pop-up once the customer has a booking');
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan"}');
  perform tst.ok(q #>> '{first_visit,status}' = 'not_eligible' and (q ->> 'total_cents')::int = 5999,
                 'm011 C37: the customer''s next quote is at the regular price, and says why', q::text);
  perform tst.ok(exists (select 1 from public.my_bookings() b where b ->> 'ref' = ap.ref and (b ->> 'first_visit_offer')::boolean
                         and (b #>> '{lines,0,regular_cents}')::int = 5999), 'm011 C38: Appointments (my_bookings) carry the offer');
  execute 'reset role';
  ap2 := tst.m011_account(u28, '{"address":"52 Juniper Way","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 5999, 'm011 C39: the account''s second Basic Wash is $59.99');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1201","address":"53 Juniper Way","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer, 'm011 C40: account first, then a guest with that phone: regular price');
  ap := tst.m011_guest('{"phone":"(469) 820-1203","address":"54 Juniper Way","address_zip":"75002"}');
  u3 := tst.m011_user('14698201203', 60);
  perform tst.login(u3, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P4: no pop-up when the account''s phone already booked as a guest');
  execute 'reset role';
  ap2 := tst.m011_account(u3, '{"address":"55 Juniper Way","address_zip":"75002"}');
  perform tst.ok(ap.first_visit_offer and not ap2.first_visit_offer, 'm011 C41: guest first, then an account with that phone: regular price');
  perform tst.login(detailer_id, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P5: no pop-up for staff');
  execute 'reset role';

  -- A booking the owner enters (staff_create_booking) follows the same rule (design C9, pending the owner's answer).
  q := tst.m011_slot(tst.booking('shop', null, null,
         '{"bundle":null,"exterior":"basic_wash","contact_first":"Ivo","contact_phone":"(469) 820-1301","special_request":"m011 test","conditions":[]}'));
  perform tst.login(admin_id, 'aal2');
  execute 'set local role authenticated';
  r := to_jsonb(public.staff_create_booking(q));
  execute 'reset role';
  perform tst.logout();
  perform tst.ok((r ->> 'first_visit_offer')::boolean and (r ->> 'value_cents')::int = 3500, 'm011 C42: a staff-entered first Basic Wash gets $35 too', r::text);

  -- The end date (Parker's date).
  u4 := tst.m011_user('14698201204', 40);
  update public.business_settings set first_visit_offer_ends_on = public.local_today() - 1 where id = 1;
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan"}');
  perform tst.ok(q -> 'first_visit' = 'null'::jsonb and (q ->> 'total_cents')::int = 5999, 'm011 C43: after the end date the quote is $59.99', q::text);
  ap2 := tst.m011_guest('{"phone":"(469) 820-1140","address":"61 Juniper Way","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 5999, 'm011 C44: after the end date a first request pays $59.99');
  perform tst.ok(not (public.get_first_visit_offer() ->> 'active')::boolean, 'm011 C45: get_first_visit_offer says the offer has ended');
  perform tst.login(u4, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P6: no pop-up after the end date');
  execute 'reset role';
  update public.business_settings set first_visit_offer_ends_on = public.local_today() where id = 1;
  ap2 := tst.m011_guest('{"phone":"(469) 820-1141","address":"62 Juniper Way","address_zip":"75002","from_day":30}');
  perform tst.ok(ap2.first_visit_offer and ap2.service_date > public.local_today() + 25,
                 'm011 C46: a request sent on the last day gets it, whatever the service date');
  update public.business_settings set first_visit_offer_ends_on = public.local_today() - 1 where id = 1;
  perform tst.ok(exists (select 1 from public.appointments where ref = ap2.ref and first_visit_offer and total_cents = 3500),
                 'm011 C47: a saved booking keeps its price after the offer ends');
  update public.business_settings set first_visit_offer_ends_on = date '2027-02-17' where id = 1;
  perform tst.login(u4, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok((public.my_first_visit_offer() ->> 'show')::boolean, 'm011 P7: the pop-up comes back while the offer runs');
  execute 'reset role';
  perform tst.logout();

  -- ===================== D. Verifier fixes (Nov 17): address key v2 (part 11), the list's tag, outside-only answers =====================
  update public.appointments set status = 'cancelled' where special_request = 'm011 test' and status in ('requested', 'needs_information', 'confirmed');
  v_key := public.address_key('8820 Wrenmoor Lane', '75002');
  perform tst.eq(v_key, '75002|8820|wrenmoor', 'm011 D1: address key v2 is zip|number|first street word');
  perform tst.eq((select string_agg(coalesce(public.address_key(x, '75002'), 'NULL'), ',') from unnest(array[
                    '8820 Wrenmoor Lane Parker TX', 'Home 8820 Wrenmoor Ln', 'Home, 8820 Wrenmoor Lane',
                    'Unit 3, 8820 Wrenmoor Ln', '8820-A Wrenmoor Lane', '8820A Wrenmoor Lane', '8820 W. Wrenmoor Ln #2']) as x),
                 '75002|8820|wrenmoor,75002|8820|wrenmoor,75002|8820|wrenmoor,75002|8820|wrenmoor,75002|8820|wrenmoor,75002|8820|wrenmoor,75002|8820|wrenmoor',
                 'm011 D2: city words after the street, a word before the number, a unit before a comma, 8820-A and 8820A all give one key (verifier S-1)');
  perform tst.ok(public.address_key('Apt 4B 8820 Wrenmoor Lane', '75002') is null and public.address_key('8820 Wrenmoor Lane', null) is null
                 and public.address_key('Wrenmoor Ranch', '75002') is null,
                 'm011 D3: no key (phone check only) without a readable house number or a ZIP');
  ap := tst.m011_guest('{"phone":"(469) 820-1150","address":"8820 Wrenmoor Lane","address_zip":"75002"}');
  perform tst.ok(ap.first_visit_offer, 'm011 D4: a first request at 8820 Wrenmoor Lane gets the new-customer price');
  set local enable_seqscan = off;
  perform tst.ok(exists (select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
                         where c.relname = 'appointments_address_key_idx' and i.indisvalid and i.indisready)
                 and (select count(*) from public.appointments a where public.address_key(a.address, a.address_zip) = v_key) = 1
                 and (select count(*) from public.appointments a where public.address_key(a.address, a.address_zip) = '75002|4711|quillfeather')
                     = (select count(*) from public.appointments a where public.address_key(a.address, a.address_zip) || '' = '75002|4711|quillfeather'),
                 'm011 D5: the address-key index is valid after the rebuild and finds the same rows as a full read');
  reset enable_seqscan;
  ap2 := tst.m011_guest('{"phone":"(469) 820-1151","address":"Home 8820 Wrenmoor Ln","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 5999, 'm011 D6: "Home 8820 Wrenmoor Ln", another phone: regular price');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1152","address":"8820 Wrenmoor Lane Parker TX","address_zip":"75002"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 5999, 'm011 D7: "8820 Wrenmoor Lane Parker TX", another phone: regular price');
  ap2 := tst.m011_guest('{"phone":"(469) 820-1153","address":"Wrenmoor Ranch","address_zip":"75002"}');
  perform tst.ok(ap2.first_visit_offer
                 and (select "Total" from office.requests where "Reference" = ap2.ref) = '$35.00 (First Timer Deal, Outside: phone checked; address not recognised)',
                 'm011 D8: an address with no house number: the owner''s list says only the phone was checked (verifier S-2)');
  perform tst.err($q$select public.quote_core('{"location_type":"mobile","exterior":"basic_wash","vehicle_type":"sedan","conditions":["other"]}')$q$,
                  'invalid_input', 'm011 D9: "Other" is refused on an outside-only booking (verifier S-5)');
  perform tst.err($q$select tst.m011_guest('{"phone":"(469) 820-1154","address":"9 Wrenmoor Lane","address_zip":"75002","conditions":["other"],"special_request":"m011 test"}')$q$,
                  'invalid_input', 'm011 D10: and on a saved outside-only request');
  q := public.quote_core('{"location_type":"mobile","exterior":"hand_wash","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 8999, 'm011 D11: "None" is still accepted on an outside-only booking', q::text);
  update public.appointments set status = 'cancelled' where special_request = 'm011 test' and status in ('requested', 'needs_information', 'confirmed');

  -- ===================== Results (then everything is rolled back) =====================
  select count(*) filter (where passed), count(*),
         string_agg(case when passed then 'ok   ' else 'FAIL ' end || label
                    || case when passed then '' else ' :: ' || coalesce(left(detail, 400), '') end, E'\n' order by id)
    into v_pass, v_total, v_text
    from tst.results where id > v_start;
  raise exception 'M011 TESTS (rolled back): % of % passed (query md5 %)%', v_pass, v_total,
    md5(split_part(current_query(), E'\n\n-- source: ', 1)), E'\n' || v_text;
end
$$;
