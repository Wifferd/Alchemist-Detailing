-- Migration 012 tests: the new prices and the three First Timer Deals (Outside, Inside, Outside + inside).
-- Needs the m001 framework and fixtures, the Migration 011 helpers (tst.m011_slot, m011_guest, m011_user, m011_account,
-- created by m011_tests_menu.sql) and Migration 012 applied (all six parts).
--
-- How it runs: one query through the Supabase MCP (execute_sql): one helper function in schema tst, then ONE DO block
-- (role switches with "set local role", never a top-level "set role"). The block ends by raising its own results as an
-- error, so everything it did rolls back: no test booking stays on the test project, nothing counts toward the guest
-- limits, and no booking alert (Migration 010) is sent, because the alert runs only at commit. The error message is the
-- result: "M012 TESTS (rolled back): <passed> of <total> passed (query md5 <md5>)", then one line per check. The md5 is
-- that of the block as the server received it (without the trailer the Supabase MCP adds), so a run can be matched to
-- this file: md5 of the text from "do $$" to the final "$$;" with no newline after it. Fixed test phones
-- 1 (469) 821-xxxx and made-up streets, so it can run again at once.
--
-- Before Migration 012 part 1 was applied, the old bookings' fingerprint was stored with
--   select tst.setv('m012_appt_fp', <the fingerprint query in check A1>);
-- check A1 compares it (the migration changed no saved booking: prices, lines, regular prices, offer flags).
--
-- This file holds no word that the Supabase MCP stops on: "no removal privilege" is proved by listing the privileges.

-- Runs one change to the deal tables, fires their end-of-transaction catalog check at once, and undoes the change
-- whatever happens. Returns "<sqlstate>:<message>": "P0001:invalid_input" when the check refuses the change,
-- "P0001:m012: accepted" when it lets it through.
create or replace function tst.m012_refused(p_sql text) returns text
language plpgsql as $f$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
    set constraints public.first_visit_deals_check, public.first_visit_deal_rates_check immediate;
    raise exception 'm012: accepted';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  set constraints public.first_visit_deals_check, public.first_visit_deal_rates_check deferred;
  return v_state || ':' || v_msg;
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
  v_loc text;
  q jsonb;
  r jsonb;
  ap public.appointments;
  ap2 public.appointments;
  u27 uuid;
  u28 uuid;
  u3 uuid;
  u4 uuid;
  admin_id constant uuid := '00000000-0000-4000-8000-0000000000a1';
  manager_id constant uuid := '00000000-0000-4000-8000-0000000000b1';
  detailer_id constant uuid := '00000000-0000-4000-8000-0000000000c1';
  both_fv constant jsonb := '{"status":"if_first_visit","deal":"both","name":"Outside + inside","codes":["basic_wash","interior_clean"],"ends_on":"2027-02-17","price_cents":7999,"regular_cents":13499}';
begin
  select coalesce(max(id), 0) into v_start from tst.results;
  perform tst.logout();
  update public.business_settings set guest_booking = true, first_visit_offer_ends_on = date '2027-02-17' where id = 1;

  -- ===================== A. The catalog and who can read or change it =====================
  perform tst.eq((select count(*) || ':' || md5(string_agg(a.id::text || a.value_cents || '/' || coalesce(a.total_cents::text, '-')
                   || '/' || a.duration_min || '/' || a.status || '/' || a.first_visit_offer || '/'
                   || (select coalesce(string_agg(i.code || i.price_cents || '/' || coalesce(i.regular_cents::text, '-'), ',' order by i.sort), '')
                       from public.appointment_items i where i.appointment_id = a.id), '|' order by a.id))
                  from public.appointments a),
                 tst.getv('m012_appt_fp'), 'm012 A1: old bookings unchanged by the migration (prices, lines, regular prices, offer)');
  perform tst.eq((select count(*)::text from public.appointments where first_visit_deal is not null), '0',
                 'm012 A2: no old booking was given a deal code (no backfill)');
  perform tst.eq((select count(*)::text from public.services s where s.active), '15', 'm012 A3: still 15 services on sale');
  perform tst.eq((select string_agg(s.code || ':' || r.size_group || '=' || r.price_cents, ',' order by s.code, g.sort)
                  from public.services s join public.service_size_rates r on r.service_id = s.id
                  join public.size_groups g on g.code = r.size_group
                  where s.code in ('basic_wash', 'hand_wash', 'inside_out', 'full_detail_v2', 'interior_clean', 'interior_detail')),
                 'basic_wash:car=5999,basic_wash:two_rows=6499,basic_wash:three_rows=6499,basic_wash:minivan=6499,'
                 || 'full_detail_v2:car=17999,full_detail_v2:two_rows=20499,full_detail_v2:three_rows=22999,full_detail_v2:minivan=24999,'
                 || 'hand_wash:car=8999,hand_wash:two_rows=9499,hand_wash:three_rows=9499,hand_wash:minivan=9499,'
                 || 'inside_out:car=11499,inside_out:two_rows=12999,inside_out:three_rows=13999,inside_out:minivan=14999,'
                 || 'interior_clean:car=7500,interior_clean:two_rows=8500,interior_clean:three_rows=9000,interior_clean:minivan=10000,'
                 || 'interior_detail:car=12500,interior_detail:two_rows=14500,interior_detail:three_rows=16500,interior_detail:minivan=18500',
                 'm012 A4: the owner''s new prices (Basic $59.99, Hand $89.99, Inside & Out and Full Detail up; Interior unchanged)');
  perform tst.eq((select count(*)::text from public.services s
                  join public.service_size_rates r on r.service_id = s.id and r.size_group = 'car'
                  where s.active and (s.base_price_cents <> r.price_cents or s.duration_min <> ceil(r.minutes))),
                 '0', 'm012 A5: base_price_cents and duration_min still hold the car figures');
  perform tst.eq((select count(*)::text from public.service_size_rates where first_visit_price_cents is not null), '0',
                 'm012 A6: the retired first_visit_price_cents is empty everywhere');
  perform tst.eq((select string_agg(d.code || '(' || d.name || ',' || coalesce(e.code, '-') || ',' || coalesce(i.code, '-') || ',' || d.active || ')', ' '
                                    order by d.sort) from public.first_visit_deals d
                  left join public.services e on e.id = d.exterior_id left join public.services i on i.id = d.interior_id),
                 'outside(Outside,basic_wash,-,true) inside(Inside,-,interior_clean,true) both(Outside + inside,basic_wash,interior_clean,true)',
                 'm012 A7: three deals on: Outside (Basic Wash), Inside (Interior Clean), Outside + inside (both)');
  perform tst.eq((select string_agg(r.deal || ':' || r.size_group || '=' || coalesce(r.exterior_cents::text, '-') || '+' || coalesce(r.interior_cents::text, '-'),
                                    ',' order by d.sort, g.sort)
                  from public.first_visit_deal_rates r join public.first_visit_deals d on d.code = r.deal
                  join public.size_groups g on g.code = r.size_group),
                 'outside:car=3500+-,outside:two_rows=4000+-,outside:three_rows=4000+-,outside:minivan=4000+-,'
                 || 'inside:car=-+4999,inside:two_rows=-+5999,inside:three_rows=-+5999,inside:minivan=-+5999,'
                 || 'both:car=3500+4499,both:two_rows=4000+5499,both:three_rows=4000+5499,both:minivan=4000+5499',
                 'm012 A8: the deal prices: $35 / $40, $49.99 / $59.99, $79.99 / $94.99 (split $35 + $44.99, $40 + $54.99)');

  -- The catalog check (end of transaction; fired at once here, every change undone).
  perform tst.eq(tst.m012_refused($q$update public.first_visit_deals set exterior_id = (select id from public.services where code = 'interior_clean')
                                     where code = 'outside'$q$), 'P0001:invalid_input', 'm012 A9: an interior service can''t be a deal''s exterior');
  perform tst.eq(tst.m012_refused($q$update public.first_visit_deal_rates set exterior_cents = 100 where deal = 'inside' and size_group = 'car'$q$),
                 'P0001:invalid_input', 'm012 A10: no exterior price on the Inside deal');
  perform tst.eq(tst.m012_refused($q$update public.first_visit_deal_rates set interior_cents = null where deal = 'both' and size_group = 'car'$q$),
                 'P0001:invalid_input', 'm012 A11: the Both deal needs its inside price');
  perform tst.eq(tst.m012_refused($q$update public.first_visit_deals set exterior_id = (select id from public.services where code = 'hand_wash')
                                     where code = 'inside'$q$), 'P0001:invalid_input',
                 'm012 A12: giving a deal a new side without prices for it is refused (review S8)');
  perform tst.eq(tst.m012_refused($q$with u as (update public.first_visit_deals set exterior_id = (select id from public.services where code = 'hand_wash')
                                                 where code = 'inside' returning 1)
                                     update public.first_visit_deal_rates set exterior_cents = 1000 where deal = 'inside'$q$),
                 'P0001:m012: accepted', 'm012 A13: a deal and its prices changed together are accepted');
  perform tst.err($q$insert into public.first_visit_deals (code, name, exterior_id, active)
                     select 'twice', 'Twice', id, false from public.services where code = 'basic_wash'$q$, '23505',
                  'm012 A14: one deal per service pair');
  perform tst.err($q$update public.appointments set first_visit_deal = 'both'
                     where id = (select id from public.appointments where not first_visit_offer limit 1)$q$, '23514',
                  'm012 A15: a booking can''t name a deal without the first-time price');

  -- Visitors.
  perform tst.eq((select array_agg(x.privilege_type order by 1)::text from aclexplode((select relacl from pg_class where oid = 'public.first_visit_deals'::regclass)) x
                  where x.grantee = 'anon'::regrole), '{SELECT}', 'm012 A16: visitors may only read the deals');
  perform tst.eq((select array_agg(x.privilege_type order by 1)::text from aclexplode((select relacl from pg_class where oid = 'public.first_visit_deal_rates'::regclass)) x
                  where x.grantee = 'anon'::regrole), '{SELECT}', 'm012 A17: visitors may only read the deal prices');
  perform tst.eq((select array_agg(x.privilege_type order by 1)::text from aclexplode((select relacl from pg_class where oid = 'public.first_visit_deal_rates'::regclass)) x
                  where x.grantee = 'authenticated'::regrole), '{INSERT,SELECT,UPDATE}',
                 'm012 A18: signed-in users get read, add and edit (the policies leave add and edit to the admin), nothing else');
  perform tst.eq((select count(*)::text from aclexplode((select relacl from pg_class where oid = 'public.first_visit_deals'::regclass)) x
                  where x.grantee = 0), '0', 'm012 A19: nothing for PUBLIC');
  update public.first_visit_deals set active = false where code = 'inside';
  perform tst.logout();
  execute 'set local role anon';
  perform tst.eq((select count(*) || '/' || (select count(*) from public.first_visit_deal_rates) from public.first_visit_deals), '2/8',
                 'm012 A20: a deal that is off, and its prices, are hidden from visitors (review S8)');
  execute 'reset role';
  update public.first_visit_deals set active = true where code = 'inside';
  execute 'set local role anon';
  perform tst.eq((select count(*) || '/' || (select count(*) from public.first_visit_deal_rates) from public.first_visit_deals), '3/12',
                 'm012 A21: a visitor reads the three deals and their 12 prices');
  perform tst.err($q$insert into public.first_visit_deals (code, name, interior_id) select 'xx', 'X', id from public.services where code = 'interior_detail'$q$,
                  '42501', 'm012 A22: a visitor can''t add a deal');
  perform tst.err($q$select public.first_visit_deal_for('{}'::jsonb)$q$, '42501', 'm012 A23: a visitor can''t call first_visit_deal_for');
  perform tst.err($q$select public.apply_first_visit('{}'::jsonb, 'applied')$q$, '42501', 'm012 A24: a visitor can''t call apply_first_visit');
  perform tst.err($q$select public.first_visit_deals_json()$q$, '42501', 'm012 A25: a visitor can''t call first_visit_deals_json');
  q := public.get_first_visit_offer();
  perform tst.ok((q ->> 'active')::boolean and q ->> 'ends_on' = '2027-02-17'
                 and (select string_agg(x ->> 'code', ',' order by (x ->> 'sort')::int) from jsonb_array_elements(q -> 'deals') x) = 'outside,inside,both'
                 and q #> '{deals,2,prices,car}' = '{"first_visit_cents":7999,"regular_cents":13499,"lines":{"basic_wash":{"first_visit_cents":3500,"regular_cents":5999},"interior_clean":{"first_visit_cents":4499,"regular_cents":7500}}}'::jsonb
                 and (q #>> '{deals,1,prices,minivan,first_visit_cents}')::int = 5999 and (q #>> '{deals,1,prices,minivan,regular_cents}')::int = 10000
                 and q -> 'prices' = '{"car":{"first_visit_cents":3500,"regular_cents":5999},"two_rows":{"first_visit_cents":4000,"regular_cents":6499},"three_rows":{"first_visit_cents":4000,"regular_cents":6499},"minivan":{"first_visit_cents":4000,"regular_cents":6499}}'::jsonb,
                 'm012 A26: get_first_visit_offer: the end date, the three deals with prices per size, and the Outside prices in the old shape', q::text);
  execute 'reset role';

  -- Staff.
  perform tst.login(manager_id, 'aal2');
  execute 'set local role authenticated';
  perform tst.err($q$insert into public.first_visit_deal_rates (deal, size_group, exterior_cents) values ('outside', 'car', 1)$q$, '42501',
                  'm012 A27: a manager can''t add deal prices');
  perform tst.eq(tst.q($q$with u as (update public.first_visit_deal_rates set interior_cents = 1 where deal = 'inside' returning 1) select count(*)::text from u$q$),
                 '0', 'm012 A28: a manager''s change to a deal price touches nothing');
  perform tst.eq(tst.q($q$select count(first_visit_deal)::text from public.appointments where false$q$), '0',
                 'm012 A29: the Admin page can read the new booking column (no new grant needed)');
  perform tst.err($q$select public.first_visit_deal_for('{}'::jsonb)$q$, '42501', 'm012 A30: signed-in users can''t call first_visit_deal_for');
  execute 'reset role';
  perform tst.login(admin_id, 'aal2');
  execute 'set local role authenticated';
  perform tst.eq(tst.q($q$with u as (update public.first_visit_deal_rates set interior_cents = interior_cents where deal = 'inside' returning 1)
                         select count(*)::text from u$q$), '4', 'm012 A31: the admin can edit deal prices');
  execute 'reset role';
  perform tst.logout();

  -- ===================== B. The new prices (regular, before any deal) =====================
  for v_code, v_key in
    select * from (values ('basic_wash', 'exterior'), ('hand_wash', 'exterior'), ('inside_out', 'bundle'),
                          ('full_detail_v2', 'bundle'), ('interior_clean', 'interior'), ('interior_detail', 'interior')) v(c, k)
  loop
    foreach v_loc in array array['shop', 'mobile'] loop
      select string_agg(t.typ || ':' || coalesce(t.qq ->> 'total_cents', 'null') || '/' || (t.qq ->> 'duration_min') || '/'
                        || coalesce(t.qq ->> 'size_group', '-') || '/' || (t.qq ->> 'mobile_cents'), ',' order by t.typ)
        into v_got
        from (select x.typ, public.quote_core(jsonb_build_object('location_type', v_loc, v_key, v_code, 'vehicle_type', x.typ,
                       'conditions', case when v_key = 'exterior' then '[]'::jsonb else '["none"]'::jsonb end)) as qq
              from unnest(array['sedan', 'coupe', 'convertible', 'crossover', 'suv', 'truck', 'large_suv', 'minivan']) as x(typ)) t;
      select string_agg(t.typ || ':' || e.price || '/' || e.mins || '/' || t.g || '/0', ',' order by t.typ)
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
      perform tst.eq(v_got, v_want, 'm012 B: ' || v_code || ' (' || v_loc || ') price/minutes/size/mobile charge at every vehicle type');
    end loop;
  end loop;

  perform tst.eq((select string_agg(x.qq ->> 'value_cents' || '-' || (x.qq ->> 'bundle_savings_cents') || '=' || (x.qq ->> 'subtotal_cents'), '/' order by x.o)
                  from (select o, public.quote_core(jsonb_build_object('location_type', 'shop', 'bundle', 'inside_out', 'vehicle_type', t, 'conditions', '["none"]'::jsonb)) as qq
                        from unnest(array['sedan', 'suv', 'large_suv', 'minivan']) with ordinality as u(t, o)) x),
                 '16499-5000=11499/17999-5000=12999/18499-4500=13999/19499-4500=14999',
                 'm012 B1: Inside & Out = Hand Wash + Interior Clean less $50 / $50 / $45 / $45 (the same savings)');
  perform tst.eq((select string_agg(x.qq ->> 'value_cents' || '-' || (x.qq ->> 'bundle_savings_cents') || '=' || (x.qq ->> 'subtotal_cents'), '/' order by x.o)
                  from (select o, public.quote_core(jsonb_build_object('location_type', 'shop', 'bundle', 'full_detail_v2', 'vehicle_type', t, 'conditions', '["none"]'::jsonb)) as qq
                        from unnest(array['sedan', 'suv', 'large_suv', 'minivan']) with ordinality as u(t, o)) x),
                 '21499-3500=17999/23999-3500=20499/25999-3000=22999/27999-3000=24999',
                 'm012 B2: Full Detail = Hand Wash + Interior Detail less $35 / $35 / $30 / $30 (the same savings)');
  q := public.quote_core('{"location_type":"shop","exterior":"hand_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 16499 and q #>> '{suggestion,bundle}' = 'inside_out' and (q #>> '{suggestion,saves_cents}')::int = 5000,
                 'm012 B3: Hand Wash + Interior Clean ($164.99) suggests Inside & Out, $50 less', q::text);
  q := public.quote_core('{"location_type":"shop","exterior":"hand_wash","interior":"interior_detail","vehicle_type":"suv","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 23999 and q #>> '{suggestion,bundle}' = 'full_detail_v2' and (q #>> '{suggestion,saves_cents}')::int = 3500,
                 'm012 B4: Hand Wash + Interior Detail on 2 rows ($239.99) suggests the Full Detail, $35 less', q::text);
  q := public.quote_core('{"location_type":"shop","exterior":"basic_wash","interior":"interior_detail","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 18499 and q #>> '{suggestion,bundle}' = 'full_detail_v2' and (q #>> '{suggestion,saves_cents}')::int = 500,
                 'm012 B5: Basic Wash + Interior Detail ($184.99) suggests the Full Detail, $5 less', q::text);
  q := public.quote_core('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 13499 and (q ->> 'duration_min')::int = 163 and (q #>> '{suggestion,saves_cents}')::int = 2000,
                 'm012 B6: Basic Wash + Interior Clean at regular prices: $134.99, 163 min, Inside & Out $20 less', q::text);
  perform tst.ok((public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"suv","conditions":["none"]}') ->> 'total_cents')::int >= 20000
                 and (public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"sedan","conditions":["none"]}') ->> 'total_cents')::int < 20000,
                 'm012 B7: gold ($200+): the 2-row Full Detail ($204.99) is gold on its own, the car one ($179.99) is not');
  q := public.quote_core('{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"large_suv","conditions":["pet_hair_some"],"addons":["stain_removal"]}');
  perform tst.ok((q ->> 'total_cents')::int = 22999 + 3000 + 4000 and (q ->> 'duration_min')::int = 511,
                 'm012 B8: 3-row Full Detail + some pet hair + stain removal: $299.99, 511 min', q::text);
  q := public.quote_core('{"location_type":"shop","bundle":"inside_out","vehicle_type":"large_suv","conditions":["pet_hair_lots","heavy_dirt"]}');
  perform tst.ok((q ->> 'total_cents')::int = 13999 + 6000 + 4000 and (q ->> 'duration_min')::int = 314,
                 'm012 B9: 3-row Inside & Out + a lot of pet hair + heavy dirt: $239.99, 314 min', q::text);

  -- ===================== C. Deals on the quote (a visitor: "if this is your first visit") =====================
  perform tst.logout();
  execute 'set local role anon';
  for v_code, v_key, v_want in
    select * from (values
      ('outside', '{"exterior":"basic_wash"}',
       'sedan:outside:3500:3500:3500:3500:5999:basic_wash=3500/5999,suv:outside:4000:4000:4000:4000:6499:basic_wash=4000/6499,'
       || 'large_suv:outside:4000:4000:4000:4000:6499:basic_wash=4000/6499,minivan:outside:4000:4000:4000:4000:6499:basic_wash=4000/6499'),
      ('inside', '{"interior":"interior_clean","conditions":["none"]}',
       'sedan:inside:4999:4999:4999:4999:7500:interior_clean=4999/7500,suv:inside:5999:5999:5999:5999:8500:interior_clean=5999/8500,'
       || 'large_suv:inside:5999:5999:5999:5999:9000:interior_clean=5999/9000,minivan:inside:5999:5999:5999:5999:10000:interior_clean=5999/10000'),
      ('both', '{"exterior":"basic_wash","interior":"interior_clean","conditions":["none"]}',
       'sedan:both:7999:7999:7999:7999:13499:basic_wash=3500/5999+interior_clean=4499/7500,'
       || 'suv:both:9499:9499:9499:9499:14999:basic_wash=4000/6499+interior_clean=5499/8500,'
       || 'large_suv:both:9499:9499:9499:9499:15499:basic_wash=4000/6499+interior_clean=5499/9000,'
       || 'minivan:both:9499:9499:9499:9499:16499:basic_wash=4000/6499+interior_clean=5499/10000')) v(c, p, w)
  loop
    select string_agg(t.typ || ':' || coalesce(t.qq #>> '{first_visit,deal}', '-') || ':' || (t.qq ->> 'total_cents') || ':' || (t.qq ->> 'value_cents')
                      || ':' || (t.qq ->> 'subtotal_cents') || ':' || (t.qq #>> '{first_visit,price_cents}') || ':' || (t.qq #>> '{first_visit,regular_cents}')
                      || ':' || (select string_agg((l ->> 'code') || '=' || (l ->> 'price_cents') || '/' || (l ->> 'regular_cents'), '+' order by n)
                                 from jsonb_array_elements(t.qq -> 'lines') with ordinality as z(l, n) where (l ->> 'first_visit')::boolean),
                      ',' order by t.o)
      into v_got
      from (select x.typ, x.o, public.quote_booking(jsonb_build_object('location_type', 'shop', 'vehicle_type', x.typ) || v_key::jsonb) as qq
            from unnest(array['sedan', 'suv', 'large_suv', 'minivan']) with ordinality as x(typ, o)) t;
    perform tst.eq(v_got, v_want, 'm012 C: the ' || v_code || ' deal at each size (deal, total = value = subtotal, deal and regular price, deal lines)');
  end loop;

  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q -> 'first_visit' = both_fv and q -> 'suggestion' = 'null'::jsonb and (q ->> 'duration_min')::int = 163 and (q ->> 'mobile_cents')::int = 0,
                 'm012 C1: car Both: the deal block names it, no Inside & Out suggestion ($114.99 > $79.99), 163 min as without the deal', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan"}');
  perform tst.ok(q -> 'first_visit' = '{"status":"if_first_visit","deal":"outside","name":"Outside","codes":["basic_wash"],"ends_on":"2027-02-17","price_cents":3500,"regular_cents":5999}'::jsonb
                 and (q ->> 'duration_min')::int = 92, 'm012 C2: car Outside: the block keeps Migration 011''s keys (price_cents, regular_cents)', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["pet_hair_some"],"addons":["wheels_tire_shine","stain_removal"]}');
  perform tst.ok((q ->> 'total_cents')::int = 7999 + 2000 + 3000 + 4000 and q #>> '{first_visit,deal}' = 'both'
                 and (select count(*) from jsonb_array_elements(q -> 'lines') l where (l ->> 'first_visit')::boolean) = 2,
                 'm012 C3: car Both + Wheels & Tire Shine + some pet hair + stain removal: $169.99 (add-ons and answers at usual prices)', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"],"addons":["wheels_tire_shine","gloss_wax"]}');
  perform tst.ok((q ->> 'total_cents')::int = 11999 and (q ->> 'duration_min')::int = 192, 'm012 C4: car Both + wheels + gloss wax: $119.99, 192 min', q::text);
  q := public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"suv","conditions":["pet_hair_lots"],"addons":["leather_care"]}');
  perform tst.ok((q ->> 'total_cents')::int = 5999 + 3500 + 6000 and (q ->> 'duration_min')::int = 204 and q #>> '{first_visit,deal}' = 'inside',
                 'm012 C5: 2-row Inside + leather care + a lot of pet hair: $154.99, 204 min', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"suv","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 9499 and (q ->> 'duration_min')::int = 192, 'm012 C6: 2-row Both: $94.99, 192 min', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"large_suv","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 9499 and (q ->> 'duration_min')::int = 221 and q -> 'suggestion' = 'null'::jsonb,
                 'm012 C7: 3-row Both: $94.99, 221 min, no suggestion', q::text);
  q := public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"minivan","conditions":["none"]}');
  perform tst.ok((q ->> 'total_cents')::int = 5999 and (q ->> 'duration_min')::int = 157 and (q #>> '{lines,0,regular_cents}')::int = 10000,
                 'm012 C8: minivan Inside: $59.99 (regular $100), 157 min', q::text);
  -- No deal.
  select string_agg(x.k || '=' || coalesce(x.qq #>> '{first_visit,deal}', 'none') || '/' || coalesce(x.qq ->> 'total_cents', 'held'), ',' order by x.k)
    into v_got
    from (select v.k, public.quote_booking(v.p::jsonb) as qq from (values
      ('a_basic_id', '{"location_type":"shop","exterior":"basic_wash","interior":"interior_detail","vehicle_type":"sedan","conditions":["none"]}'),
      ('b_hand_ic', '{"location_type":"shop","exterior":"hand_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}'),
      ('c_hand', '{"location_type":"shop","exterior":"hand_wash","vehicle_type":"sedan"}'),
      ('d_io', '{"location_type":"shop","bundle":"inside_out","vehicle_type":"sedan","conditions":["none"]}'),
      ('e_fd', '{"location_type":"shop","bundle":"full_detail_v2","vehicle_type":"sedan","conditions":["none"]}'),
      ('f_id', '{"location_type":"shop","interior":"interior_detail","vehicle_type":"sedan","conditions":["none"]}'),
      ('g_van', '{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"van","conditions":["none"]}'),
      ('h_other', '{"location_type":"shop","interior":"interior_clean","vehicle_type":"other","conditions":["none"]}'),
      ('i_not_sure', '{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","not_sure":true}'),
      ('j_xl', '{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","vehicle_size":"xl"}')) v(k, p)) x;
  perform tst.eq(v_got, 'a_basic_id=none/18499,b_hand_ic=none/16499,c_hand=none/8999,d_io=none/11499,e_fd=none/17999,f_id=none/12500,'
                        || 'g_van=none/held,h_other=none/held,i_not_sure=none/held,j_xl=none/held',
                 'm012 C9: no deal on Basic + Interior Detail, Hand + Interior Clean, Hand alone, the bundles, Interior Detail, held prices (van, other, not sure, XL)');
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"van","conditions":["none"]}');
  perform tst.ok((q ->> 'duration_min')::int = 239 and q -> 'first_visit' = 'null'::jsonb, 'm012 C10: a van Basic + Interior Clean holds the longest time (239 min), no deal', q::text);
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","vehicle_type":"sedan","phone":"(469) 821-1101","first_visit_deal":"both","deal":"both","first_visit":{"status":"applied"}}');
  perform tst.ok(q #>> '{first_visit,deal}' = 'outside' and (q ->> 'total_cents')::int = 3500, 'm012 C11: deal keys sent by the browser change nothing on the quote', q::text);
  execute 'reset role';
  q := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(public.first_visit_deal_for(q) is null and public.first_visit_deal_for(public.strip_first_visit(q)) ->> 'deal' = 'both',
                 'm012 C12: a quote that already carries the deal never matches twice; taken off again, it matches');

  -- ===================== D. Saved bookings get the deal (guest, account, staff) =====================
  ap := tst.m011_guest('{"phone":"(469) 821-1101","address":"8821 Wrenmoor Lane","address_zip":"75002","special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_offer and ap.first_visit_deal = 'outside' and ap.total_cents = 3500 and ap.duration_min = 92
                 and exists (select 1 from public.appointment_items i where i.appointment_id = ap.id and i.code = 'basic_wash' and i.price_cents = 3500 and i.regular_cents = 5999),
                 'm012 D1: a first guest Basic Wash (car): Outside deal, $35, the line keeps $59.99 beside it', row_to_json(ap)::text);
  perform tst.eq((select "Total" from office.requests where "Reference" = ap.ref), '$35.00 (First Timer Deal, Outside: phone and address checked)',
                 'm012 D2: the owner''s list names the deal and what was checked');
  ap := tst.m011_guest('{"phone":"(469) 821-1102","location_type":"shop","exterior":null,"interior":"interior_clean","conditions":["none"],"vehicle_type":"suv","special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'inside' and ap.total_cents = 5999 and ap.value_cents = 5999
                 and exists (select 1 from public.appointment_items i where i.appointment_id = ap.id and i.code = 'interior_clean' and i.price_cents = 5999 and i.regular_cents = 8500),
                 'm012 D3: a first guest Interior Clean (2 rows, Come to us): Inside deal, $59.99 (regular $85)', row_to_json(ap)::text);
  perform tst.eq((select "Total" from office.requests where "Reference" = ap.ref), '$59.99 (First Timer Deal, Inside: phone checked; no address for Come to us)',
                 'm012 D4: a Come to us deal says only the phone was checked, with cents');
  ap := tst.m011_guest('{"phone":"(469) 821-1103","address":"8823 Wrenmoor Lane","address_zip":"75002","interior":"interior_clean","conditions":["none"],"vehicle_type":"minivan","special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'both' and ap.total_cents = 9499 and ap.value_cents = 9499 and ap.bundle_savings_cents = 0
                 and (select string_agg(i.code || '=' || i.price_cents || '/' || i.regular_cents, ',' order by i.sort) from public.appointment_items i where i.appointment_id = ap.id)
                     = 'basic_wash=4000/6499,interior_clean=5499/10000',
                 'm012 D5: a first guest Basic Wash + Interior Clean (minivan): Both deal, $94.99 = $40 + $54.99 (regular $64.99 + $100)', row_to_json(ap)::text);
  r := public.booking_receipt(ap);
  perform tst.ok((r ->> 'first_visit_offer')::boolean and r ->> 'first_visit_deal' = 'both' and r ->> 'first_visit_deal_name' = 'Outside + inside'
                 and (r ->> 'total_cents')::int = 9499 and (r #>> '{lines,1,regular_cents}')::int = 10000,
                 'm012 D6: the receipt names the deal and keeps each line''s regular price', r::text);
  perform tst.eq((select "Total" from office.requests where "Reference" = ap.ref), '$94.99 (First Timer Deal, Outside + inside: phone and address checked)',
                 'm012 D7: the owner''s list tags the Both deal');
  ap2 := tst.m011_guest('{"phone":"(469) 821-1104","address":"Wrenmoor Ranch","address_zip":"75002","special_request":"m012 test"}');
  perform tst.eq((select "Total" from office.requests where "Reference" = ap2.ref), '$35.00 (First Timer Deal, Outside: phone checked; address not recognised)',
                 'm012 D8: no house number: the list says only the phone was checked');
  update public.appointments set first_visit_deal = null where id = ap2.id;
  perform tst.ok((select "Total" from office.requests where "Reference" = ap2.ref) = '$35.00 (First Timer Deal, Outside: phone checked; address not recognised)'
                 and public.booking_receipt((select x from public.appointments x where x.id = ap2.id)) ->> 'first_visit_deal_name' = 'Outside',
                 'm012 D9: a booking from before Migration 012 (offer, no deal code) reads as the Outside deal');
  perform tst.ok(public.booking_receipt((select x from public.appointments x where x.ref is not null and not x.first_visit_offer limit 1)) -> 'first_visit_deal_name' = 'null'::jsonb,
                 'm012 D10: a booking without a deal has no deal name');
  update public.appointments set status = 'cancelled' where special_request = 'm012 test' and status in ('requested', 'needs_information', 'confirmed');

  -- Staff-entered (staff_create_booking).
  q := tst.m011_slot(tst.booking('shop', null, null,
         '{"bundle":null,"exterior":"basic_wash","interior":"interior_clean","conditions":["none"],"contact_first":"Ivo","contact_phone":"(469) 821-1301","special_request":"m012 test"}'));
  perform tst.login(admin_id, 'aal2');
  execute 'set local role authenticated';
  r := to_jsonb(public.staff_create_booking(q));
  execute 'reset role';
  perform tst.logout();
  perform tst.ok((r ->> 'first_visit_offer')::boolean and r ->> 'first_visit_deal' = 'both' and (r ->> 'value_cents')::int = 7999,
                 'm012 D11: a staff-entered first Basic Wash + Interior Clean gets the Both deal ($79.99)', r::text);

  -- ===================== E. Abuse and the one-deal rule =====================
  ap := tst.m011_guest(('{"phone":"(469) 821-1110","address":"10 Ashgrove Court","address_zip":"75002","exterior":"hand_wash","special_request":"m012 test",'
                       || '"first_visit_deal":"both","deal":"both","first_visit":{"status":"applied","deal":"both"},"price_cents":1,"regular_cents":1,"value_cents":1,"first_visit_offer":true}')::jsonb);
  perform tst.ok(not ap.first_visit_offer and ap.first_visit_deal is null and ap.total_cents = 8999,
                 'm012 E1: deal, price and offer keys from the browser give a Hand Wash no deal ($89.99)', row_to_json(ap)::text);
  ap := tst.m011_guest(('{"phone":"(469) 821-1111","address":"11 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test",'
                       || '"first_visit_deal":"outside","price_cents":1,"duration_min":5}')::jsonb);
  perform tst.ok(ap.first_visit_deal = 'both' and ap.value_cents = 7999 and ap.duration_min = 163,
                 'm012 E2: and on a Both booking the database picks the deal and the time', row_to_json(ap)::text);
  -- Outside first, then Inside with the same phone typed three ways.
  ap := tst.m011_guest('{"phone":"(469) 821-1120","address":"20 Ashgrove Court","address_zip":"75002","special_request":"m012 test"}');
  ap2 := tst.m011_guest('{"phone":"469.821.1120","address":"21 Ashgrove Court","address_zip":"75002","exterior":null,"interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'outside' and not ap2.first_visit_offer and ap2.total_cents = 7500,
                 'm012 E3: Outside first, then Inside with the phone typed another way: regular price ($75)', row_to_json(ap2)::text);
  ap2 := tst.m011_guest('{"phone":"+1 469 821 1120","address":"22 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.total_cents = 13499, 'm012 E4: and Both with a third spelling: regular ($134.99)', row_to_json(ap2)::text);
  -- Both first, then Outside at the same street spelled another way, another phone.
  ap := tst.m011_guest('{"phone":"(469) 821-1121","address":"8821 Larkspur Lane","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  ap2 := tst.m011_guest('{"phone":"(469) 821-1122","address":"Home 8821 Larkspur Ln, Parker TX","address_zip":"75002","special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'both' and not ap2.first_visit_offer and ap2.total_cents = 5999,
                 'm012 E5: Both first, then Outside at "Home 8821 Larkspur Ln, Parker TX" with another phone: regular ($59.99)', row_to_json(ap2)::text);
  update public.appointments set status = 'cancelled' where special_request = 'm012 test' and status in ('requested', 'needs_information', 'confirmed');
  -- The spam trap neither gets nor uses up a deal.
  ap := tst.m011_guest('{"phone":"(469) 821-1130","address":"30 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test","website":"http://spam.example"}');
  ap2 := tst.m011_guest('{"phone":"(469) 821-1130","address":"30 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(ap.queue = 'spam' and not ap.first_visit_offer and ap.first_visit_deal is null and ap2.first_visit_deal = 'both',
                 'm012 E6: a deal request caught by the spam trap gets no deal and doesn''t cost the real person theirs');
  -- A cancelled earlier request leaves the deal; a waiting, confirmed or completed one (any service) ends it.
  update public.appointments set status = 'cancelled' where id = ap2.id;
  ap := tst.m011_guest('{"phone":"(469) 821-1130","address":"31 Ashgrove Court","address_zip":"75002","exterior":null,"interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'inside', 'm012 E7: after a cancelled request the phone still gets a deal (Inside)');
  update public.appointments set status = 'completed' where id = ap.id;
  ap2 := tst.m011_guest('{"phone":"(469) 821-1130","address":"32 Ashgrove Court","address_zip":"75002","special_request":"m012 test"}');
  perform tst.ok(not ap2.first_visit_offer, 'm012 E8: after a completed Inside deal, an Outside request pays the regular price (one deal per customer)');
  ap := tst.m011_guest('{"phone":"(469) 821-1131","address":"33 Ashgrove Court","address_zip":"75002","exterior":"hand_wash","special_request":"m012 test"}');
  ap2 := tst.m011_guest('{"phone":"(469) 821-1131","address":"34 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(not ap.first_visit_offer and not ap2.first_visit_offer and ap2.total_cents = 13499,
                 'm012 E9: an earlier Hand Wash (no deal) ends the first visit too');
  update public.appointments set status = 'cancelled' where special_request = 'm012 test' and status in ('requested', 'needs_information', 'confirmed');

  -- ===================== F. Accounts and the pop-up =====================
  u28 := tst.m011_user('14698211201', 28);
  u27 := tst.m011_user('14698211202', 27);
  perform tst.login(u27, 'aal1');
  execute 'set local role authenticated';
  q := public.my_first_visit_offer();
  perform tst.ok(not (q ->> 'show')::boolean and q -> 'deals' = '[]'::jsonb, 'm012 F1: no pop-up (and no deals) for an account 27 days old', q::text);
  execute 'reset role';
  perform tst.login(u28, 'aal1');
  execute 'set local role authenticated';
  q := public.my_first_visit_offer();
  perform tst.ok((q ->> 'show')::boolean and (select string_agg(x ->> 'code', ',' order by (x ->> 'sort')::int) from jsonb_array_elements(q -> 'deals') x) = 'outside,inside,both'
                 and (q #>> '{prices,car,first_visit_cents}')::int = 3500,
                 'm012 F2: the pop-up at 28 days lists the three deals', q::text);
  q := public.quote_booking('{"location_type":"mobile","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q #>> '{first_visit,status}' = 'if_first_visit' and (q ->> 'total_cents')::int = 4999, 'm012 F3: a new customer''s quote shows the Inside deal', q::text);
  execute 'reset role';
  ap := tst.m011_account(u28, '{"address":"51 Ashgrove Court","address_zip":"75002","exterior":null,"interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'inside' and ap.total_cents = 4999 and ap.customer_id = u28, 'm012 F4: the customer''s first Interior Clean gets the Inside deal ($49.99)');
  perform tst.login(u28, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm012 F5: no pop-up once the customer has a booking');
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q #>> '{first_visit,status}' = 'not_eligible' and q #>> '{first_visit,deal}' = 'both' and (q ->> 'total_cents')::int = 13499
                 and q #>> '{suggestion,bundle}' = 'inside_out' and (q #>> '{suggestion,saves_cents}')::int = 2000
                 and not exists (select 1 from jsonb_array_elements(q -> 'lines') l where l ? 'regular_cents'),
                 'm012 F6: the customer''s next Basic + Interior Clean is $134.99, says why, and suggests Inside & Out ($20 less)', q::text);
  perform tst.ok(exists (select 1 from public.my_bookings() b where b ->> 'ref' = ap.ref and b ->> 'first_visit_deal' = 'inside'
                         and b ->> 'first_visit_deal_name' = 'Inside' and (b #>> '{lines,0,regular_cents}')::int = 7500),
                 'm012 F7: Appointments (my_bookings) name the deal');
  execute 'reset role';
  ap2 := tst.m011_guest('{"phone":"(469) 821-1201","address":"52 Ashgrove Court","address_zip":"75002","special_request":"m012 test"}');
  perform tst.ok(not ap2.first_visit_offer, 'm012 F8: account first, then a guest with that phone: regular price');
  ap := tst.m011_guest('{"phone":"(469) 821-1203","address":"53 Ashgrove Court","address_zip":"75002","special_request":"m012 test"}');
  u3 := tst.m011_user('14698211203', 60);
  ap2 := tst.m011_account(u3, '{"address":"54 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(ap.first_visit_deal = 'outside' and not ap2.first_visit_offer and ap2.total_cents = 13499,
                 'm012 F9: guest Outside first, then an account with that phone books Both: regular price');
  perform tst.login(detailer_id, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm012 F10: no pop-up for staff');
  execute 'reset role';
  update public.appointments set status = 'cancelled' where special_request = 'm012 test' and status in ('requested', 'needs_information', 'confirmed');

  -- ===================== G. The end date, and "never dearer by accident" =====================
  u4 := tst.m011_user('14698211204', 40);
  update public.business_settings set first_visit_offer_ends_on = public.local_today() - 1 where id = 1;
  q := public.quote_booking('{"location_type":"mobile","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q -> 'first_visit' = 'null'::jsonb and (q ->> 'total_cents')::int = 13499 and (q #>> '{suggestion,saves_cents}')::int = 2000,
                 'm012 G1: after the end date Basic + Interior Clean is $134.99 and Inside & Out is suggested', q::text);
  ap2 := tst.m011_guest('{"phone":"(469) 821-1140","address":"61 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test"}');
  perform tst.ok(not ap2.first_visit_offer and ap2.first_visit_deal is null and ap2.total_cents = 13499, 'm012 G2: after the end date a first request pays the regular price');
  q := public.get_first_visit_offer();
  perform tst.ok(q = '{"active":false,"ends_on":null,"prices":{},"deals":[]}'::jsonb, 'm012 G3: get_first_visit_offer says the deals have ended', q::text);
  perform tst.login(u4, 'aal1');
  execute 'set local role authenticated';
  perform tst.ok(not (public.my_first_visit_offer() ->> 'show')::boolean, 'm012 G4: no pop-up after the end date');
  execute 'reset role';
  perform tst.logout();
  update public.business_settings set first_visit_offer_ends_on = public.local_today() where id = 1;
  ap2 := tst.m011_guest('{"phone":"(469) 821-1141","address":"62 Ashgrove Court","address_zip":"75002","interior":"interior_clean","conditions":["none"],"special_request":"m012 test","from_day":30}');
  perform tst.ok(ap2.first_visit_deal = 'both' and ap2.service_date > public.local_today() + 25, 'm012 G5: a request sent on the last day gets its deal, whatever the service date');
  update public.business_settings set first_visit_offer_ends_on = public.local_today() - 1 where id = 1;
  perform tst.ok(exists (select 1 from public.appointments where ref = ap2.ref and first_visit_deal = 'both' and total_cents = 7999),
                 'm012 G6: a saved booking keeps its deal after the offer ends');
  update public.business_settings set first_visit_offer_ends_on = date '2027-02-17' where id = 1;

  update public.service_size_rates r set price_cents = 4000 from public.services s
   where s.id = r.service_id and s.code = 'interior_clean' and r.size_group = 'car';
  q := public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  r := public.quote_booking('{"location_type":"shop","exterior":"basic_wash","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q -> 'first_visit' = 'null'::jsonb and (q ->> 'total_cents')::int = 4000 and r -> 'first_visit' = 'null'::jsonb and (r ->> 'total_cents')::int = 9999
                 and (public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"suv","conditions":["none"]}') ->> 'total_cents')::int = 5999,
                 'm012 G7: a regular price cut below a deal price ends that deal for that size only (never dearer by accident)', q::text || ' ' || r::text);
  q := public.get_first_visit_offer();
  perform tst.ok(not (q #> '{deals,1,prices}' ? 'car') and not (q #> '{deals,2,prices}' ? 'car') and (q #> '{deals,1,prices}' ? 'two_rows')
                 and (q #> '{deals,0,prices}' ? 'car'), 'm012 G8: and the deals list leaves that size out', q::text);
  update public.service_size_rates r set price_cents = 4999 from public.services s
   where s.id = r.service_id and s.code = 'interior_clean' and r.size_group = 'car';
  q := public.quote_booking('{"location_type":"shop","interior":"interior_clean","vehicle_type":"sedan","conditions":["none"]}');
  perform tst.ok(q -> 'first_visit' = 'null'::jsonb and (q ->> 'total_cents')::int = 4999, 'm012 G9: a deal price equal to the regular price never applies', q::text);
  update public.service_size_rates r set price_cents = 7500 from public.services s
   where s.id = r.service_id and s.code = 'interior_clean' and r.size_group = 'car';
  update public.appointments set status = 'cancelled' where special_request = 'm012 test' and status in ('requested', 'needs_information', 'confirmed');

  -- ===================== Results (then everything is rolled back) =====================
  select count(*) filter (where passed), count(*),
         string_agg(case when passed then 'ok   ' else 'FAIL ' end || label
                    || case when passed then '' else ' :: ' || coalesce(left(detail, 400), '') end, E'\n' order by id)
    into v_pass, v_total, v_text
    from tst.results where id > v_start;
  raise exception 'M012 TESTS (rolled back): % of % passed (query md5 %)%', v_pass, v_total, md5(split_part(current_query(), E'\n\n-- source: ', 1)), E'\n' || v_text;
end
$$;
