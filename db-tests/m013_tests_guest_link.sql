-- Migration 013 tests: a customer account sees that phone's earlier guest bookings (the owner's "yes for guest past
-- bookings", Nov 27, doc 57 open point 1). my_bookings adds them, read only, marked "booked_as_guest": true.
-- Needs the m001 framework and fixtures, the Migration 011 helpers (tst.m011_slot, m011_guest, m011_user,
-- m011_account, created by m011_tests_menu.sql) and Migration 013 applied.
--
-- How it runs: ONE DO block, one query through the Supabase MCP (role switches with "set local role", never a
-- top-level "set role"). It ends by raising its own results as an error, so everything it did rolls back: no test
-- booking or login stays, nothing counts toward the guest limits and no booking alert is sent (the alert runs only at
-- commit). The error message is the result: "M013 TESTS (rolled back): <passed> of <total> passed (query md5 <md5>)",
-- then one line per check. Fixed test phones 1 (469) 823-xxxx, so it can run again at once.
-- This file holds no word that the Supabase MCP stops on.
do $$
declare
  v_start bigint;
  v_pass int;
  v_total int;
  v_text text;
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  cus uuid; oth uuid; unc uuid; ano uuid; chg uuid;
  g1 public.appointments; own public.appointments; a public.appointments;
  r_in_prog text; r_done text; r_edge_in text; r_edge_out text; r_req text; r_info text; r_decl text; r_canc text;
  r_spam text; r_anon text; r_staff text; r_other text; r_det text; r_adm text; r_unc text; r_ano text;
  v_rows jsonb; one jsonb; want jsonb; refs text[];
  v_state text; v_msg text;

  -- a copy of g1 (a real guest booking) with the given changes; returns its reference
  -- (plpgsql has no local functions, so the copy is a statement repeated below through this format string)
  copy_sql text := 'insert into public.appointments (ref, customer_id, request_id, contact_first, contact_last, contact_phone,'
    || ' vehicle_make, vehicle_model, vehicle_year, vehicle_color, vehicle_type, vehicle_size, vehicle_not_sure,'
    || ' modifications, conditions, stains, damage, photo_paths, location_type, address, address_zip,'
    || ' service_date, start_min, duration_min, status, queue, value_cents, bundle_savings_cents, mobile_cents,'
    || ' price_pending, pending_reasons, created_by, created_at)'
    || ' select public.new_booking_ref(), null, gen_random_uuid(), x.contact_first, x.contact_last, %L,'
    || ' x.vehicle_make, x.vehicle_model, x.vehicle_year, x.vehicle_color, x.vehicle_type, x.vehicle_size, x.vehicle_not_sure,'
    || ' x.modifications, x.conditions, x.stains, x.damage, x.photo_paths, x.location_type, x.address, x.address_zip,'
    || ' x.service_date - %s, x.start_min, x.duration_min, %L, %L, %s, x.bundle_savings_cents, x.mobile_cents,'
    || ' x.price_pending, x.pending_reasons, %L, %L::timestamptz'
    || ' from public.appointments x where x.id = %L returning ref';
  p_cus text := '14698231101';
  p_oth text := '14698231102';
  p_unc text := '14698231103';
  p_ano text := '14698231104';
  p_new text := '14698231105';
begin
  select coalesce(max(id), 0) into v_start from tst.results;

  -- ------------------------------------------------------------ fixtures
  cus := tst.m011_user(p_cus, 40);
  oth := tst.m011_user(p_oth, 40);
  unc := tst.m011_user(p_unc, 40);
  update auth.users set phone_confirmed_at = null where id = unc;          -- typed at sign-up, never confirmed
  ano := tst.m011_user(p_ano, 40);
  update auth.users set is_anonymous = true where id = ano;                -- an anonymous login (should never hold a phone)

  -- a real guest request, the phone typed with spaces and brackets, for a driveway job
  g1 := tst.m011_guest('{"location_type":"shop","phone":"(469) 823-1101","special_request":"m013 test","from_day":5}');
  perform tst.ok(g1.customer_id is null and g1.created_by is null and g1.contact_phone = p_cus and g1.status = 'requested',
                 'm013 A1: fixture: the guest path saves customer_id and created_by empty and the phone normalized',
                 coalesce(g1.contact_phone, 'null') || ' ' || g1.status);

  -- the account's own request, for the "own rows unchanged" checks
  own := tst.m011_account(cus, '{"location_type":"shop","from_day":20}');

  -- ------------------------------------------------------------ B: status and lanes
  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(not exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 'ref' = g1.ref),
                 'm013 B1: a guest request the owner hasn''t confirmed stays out', v_rows::text);

  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  a := public.confirm_booking(g1.id, 'm013 team note');
  execute 'reset role';
  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  perform public.confirm_booking(own.id, 'm013 team note');
  execute 'reset role';

  execute format(copy_sql, p_cus, 1, 'in_progress', 'requests', 'x.value_cents', null, now(), g1.id) into r_in_prog;
  execute format(copy_sql, p_cus, 40, 'completed', 'requests', '25000', null, now() - interval '2 months', g1.id) into r_done;
  execute format(copy_sql, p_cus, 60, 'completed', 'requests', 'x.value_cents', null, now() - interval '12 months' + interval '1 minute', g1.id) into r_edge_in;
  execute format(copy_sql, p_cus, 61, 'completed', 'requests', 'x.value_cents', null, now() - interval '12 months' - interval '1 minute', g1.id) into r_edge_out;
  execute format(copy_sql, p_cus, 2, 'requested', 'requests', 'x.value_cents', null, now(), g1.id) into r_req;
  execute format(copy_sql, p_cus, 3, 'needs_information', 'requests', 'x.value_cents', null, now(), g1.id) into r_info;
  execute format(copy_sql, p_cus, 4, 'declined', 'requests', 'x.value_cents', null, now(), g1.id) into r_decl;
  execute format(copy_sql, p_cus, 6, 'cancelled', 'requests', 'x.value_cents', null, now(), g1.id) into r_canc;
  execute format(copy_sql, p_cus, 7, 'confirmed', 'spam', 'x.value_cents', null, now(), g1.id) into r_spam;
  execute format(copy_sql, p_cus, 8, 'completed', 'requests', 'x.value_cents', null, now() - interval '1 month', g1.id) into r_anon;
  update public.appointments set anonymized_at = now() where ref = r_anon;
  execute format(copy_sql, p_cus, 9, 'confirmed', 'requests', 'x.value_cents', adm, now(), g1.id) into r_staff;   -- entered by the team
  execute format(copy_sql, p_oth, 10, 'confirmed', 'requests', 'x.value_cents', null, now(), g1.id) into r_other;
  execute format(copy_sql, '19455552003', 11, 'confirmed', 'requests', 'x.value_cents', null, now(), g1.id) into r_det;   -- the detailer's phone
  execute format(copy_sql, '19455552001', 12, 'completed', 'requests', 'x.value_cents', null, now() - interval '1 month', g1.id) into r_adm;   -- the admin's phone
  execute format(copy_sql, p_unc, 13, 'confirmed', 'requests', 'x.value_cents', null, now(), g1.id) into r_unc;
  execute format(copy_sql, p_ano, 14, 'confirmed', 'requests', 'x.value_cents', null, now(), g1.id) into r_ano;

  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  select coalesce(array_agg(e ->> 'ref' order by e ->> 'ref'), '{}') into refs from jsonb_array_elements(v_rows) e where e ? 'booked_as_guest';
  perform tst.ok(refs = (select array_agg(x order by x) from unnest(array[g1.ref, r_in_prog, r_done, r_edge_in]) x),
                 'm013 B2: the customer sees exactly the confirmed, in progress and completed guest bookings of the last 12 months on their phone',
                 refs::text);
  perform tst.ok(g1.ref = any (refs), 'm013 B3: a guest request shows once the owner confirms it');
  perform tst.ok(r_in_prog = any (refs) and r_done = any (refs), 'm013 B4: in progress and completed show');
  perform tst.ok(not (r_req = any (refs)) and not (r_info = any (refs)), 'm013 B5: requested and needs information stay out');
  perform tst.ok(not (r_decl = any (refs)) and not (r_canc = any (refs)), 'm013 B6: declined and cancelled stay out');
  perform tst.ok(not (r_spam = any (refs)), 'm013 B7: anything in the Spam lane stays out, even confirmed');
  perform tst.ok(r_edge_in = any (refs), 'm013 B8: made 12 months less a minute ago: shown');
  perform tst.ok(not (r_edge_out = any (refs)), 'm013 B9: made 12 months and a minute ago: not shown');
  perform tst.ok(not (r_anon = any (refs)), 'm013 B10: an anonymized guest booking stays out');
  perform tst.ok(not (r_staff = any (refs)) and not exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 'ref' = r_staff),
                 'm013 B11: a booking the team entered for that phone (no account) is not a guest booking and stays out');
  perform tst.ok(not (r_other = any (refs)) and not (r_det = any (refs)) and not (r_unc = any (refs)) and not (r_ano = any (refs)),
                 'm013 B12: no other phone''s guest booking shows');
  perform tst.ok(jsonb_array_length(v_rows) = 5 and exists (select 1 from jsonb_array_elements(v_rows) e where e ->> 'ref' = own.ref and not e ? 'booked_as_guest'),
                 'm013 B13: the account''s own booking is there too, without the guest mark (5 rows in all)', jsonb_array_length(v_rows)::text);
  perform tst.ok((select array_agg(e ->> 'service_date' order by n) from jsonb_array_elements(v_rows) with ordinality t(e, n))
                 = (select array_agg(e ->> 'service_date' order by e ->> 'service_date' desc) from jsonb_array_elements(v_rows) e),
                 'm013 B14: own and guest rows together, latest date first');

  -- ------------------------------------------------------------ C: the shape of a guest row
  select e into one from jsonb_array_elements(v_rows) e where e ->> 'ref' = g1.ref;
  select e into want from jsonb_array_elements(v_rows) e where e ->> 'ref' = own.ref;
  perform tst.ok((one -> 'booked_as_guest') = 'true'::jsonb, 'm013 C1: a guest row carries "booked_as_guest": true');
  perform tst.ok((select array_agg(k order by k) from jsonb_object_keys(one) k)
                 = (select array_agg(k order by k) from (select jsonb_object_keys(want) k union all select 'booked_as_guest') z),
                 'm013 C2: a guest row has the same keys as an own row, plus booked_as_guest',
                 (select string_agg(k, ',' order by k) from jsonb_object_keys(one) k));
  perform tst.ok(one ? 'shop_address' and one -> 'shop_address' = 'null'::jsonb and one ->> 'status' = 'confirmed' and one ->> 'location_type' = 'shop',
                 'm013 C3: a confirmed "Come to us" guest booking never carries the owner''s address');
  perform tst.ok(want ->> 'status' = 'confirmed' and want ->> 'location_type' = 'shop' and want ? 'shop_address',
                 'm013 C4: the account''s own confirmed "Come to us" booking still has the shop_address key (its value is not read here)');
  perform tst.ok(jsonb_array_length(one -> 'history') = 2
                 and not exists (select 1 from jsonb_array_elements(one -> 'history') h where h -> 'note' <> 'null'::jsonb)
                 and (one #>> '{history,1,status}') = 'confirmed',
                 'm013 C5: a guest row''s history keeps status and time, never the team''s note', (one -> 'history')::text);
  perform tst.ok((want #>> '{history,1,note}') = 'm013 team note',
                 'm013 C6: an own row''s history is as before (the note comes back)', (want -> 'history')::text);
  perform tst.ok(one ->> 'id' = g1.id::text and one ->> 'total_cents' = g1.total_cents::text and one -> 'conditions' = '[]'::jsonb
                 and one -> 'team' = '[]'::jsonb and one #>> '{vehicle,make}' = g1.vehicle_make,
                 'm013 C7: the receipt fields are the booking''s own (id, total, conditions, team, vehicle)');

  -- an own row is exactly what Migration 008 part 3 returned (the old formula, rebuilt here)
  select public.booking_receipt(x) || jsonb_build_object(
           'conditions', to_jsonb(coalesce(x.conditions, '{}'::text[])),
           'team', case when x.status in ('confirmed', 'in_progress', 'completed') then coalesce((
                      select jsonb_agg(pr.first_name order by y.created_at) from public.appointment_assignments y
                      join public.profiles pr on pr.id = y.employee_id where y.appointment_id = x.id and pr.first_name is not null), '[]'::jsonb)
                    else '[]'::jsonb end,
           'history', coalesce((select jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at, 'note', e.note) order by e.created_at, e.id)
                      from public.appointment_events e where e.appointment_id = x.id and e.from_status is distinct from e.to_status), '[]'::jsonb))
    into one
    from public.appointments x where x.id = own.id;
  perform tst.ok(one = want - 'shop_address', 'm013 C8: the account''s own row is unchanged, value for value (Migration 008 part 3; the address is left out of the comparison, never read)');

  -- ------------------------------------------------------------ D: who sees nothing
  perform tst.login(oth, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(v_rows = jsonb_build_array(r_other), 'm013 D1: another customer sees only their own phone''s guest booking', v_rows::text);

  perform tst.login(unc, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(v_rows = '[]'::jsonb, 'm013 D2: a login whose phone isn''t confirmed sees no guest booking', v_rows::text);

  perform tst.login(ano, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(v_rows = '[]'::jsonb, 'm013 D3: an anonymous login sees no guest booking, even with a confirmed phone', v_rows::text);

  perform tst.login(det, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(not v_rows ? r_det, 'm013 D4: a detailer sees no guest booking made with their phone', v_rows::text);

  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(not v_rows ? r_adm, 'm013 D5: the owner''s own test guest bookings stay out of his account', v_rows::text);

  update public.profiles set phone = '14698231106' where id = oth;   -- out of step with the login's confirmed phone
  perform tst.login(oth, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(v_rows = '[]'::jsonb, 'm013 D6: a profile that doesn''t hold the login''s confirmed phone sees no guest booking', v_rows::text);

  -- the account moves to a new confirmed number: the old number's guest bookings leave with it
  update auth.users set phone = p_new, phone_confirmed_at = now() where id = cus;
  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  select coalesce(jsonb_agg(j ->> 'ref'), '[]') into v_rows from public.my_bookings() j;
  execute 'reset role';
  perform tst.ok(v_rows = jsonb_build_array(own.ref), 'm013 D7: after a change to a new confirmed number, the old number''s guest bookings no longer show', v_rows::text);
  update auth.users set phone = p_cus, phone_confirmed_at = now() where id = cus;

  -- signed out
  perform tst.logout();
  begin
    execute 'set local role anon';
    perform public.my_bookings();
    v_state := 'no error';
  exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  execute 'reset role';
  perform tst.ok(v_state = '42501', 'm013 D8: a signed-out visitor (anon) can''t call my_bookings', v_state);
  begin
    execute 'set local role authenticated';
    perform public.my_bookings();
    v_state := 'no error';
  exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  execute 'reset role';
  perform tst.ok(v_state = 'P0001' and v_msg = 'sign_in_required', 'm013 D9: no login at all: "Please sign in first."', v_state || ' ' || coalesce(v_msg, ''));

  -- ------------------------------------------------------------ E: read only
  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  begin
    perform public.submit_review((select id from public.appointments where ref = r_done), 5, 'Great work on the car.');
    v_state := 'no error'; v_msg := null;
  exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  execute 'reset role';
  perform tst.ok(v_state = 'P0001' and v_msg = 'not_found', 'm013 E1: a completed guest booking can''t be reviewed from the account (submit_review stays account-only)', v_state || ' ' || coalesce(v_msg, ''));
  perform tst.ok((select bool_and(customer_id is null) from public.appointments where ref in (g1.ref, r_in_prog, r_done, r_edge_in)),
                 'm013 E2: showing them changes nothing: the guest bookings keep customer_id empty');
  perform tst.ok(not has_function_privilege('anon', 'public.my_bookings()', 'execute')
                 and has_function_privilege('authenticated', 'public.my_bookings()', 'execute')
                 and (select prosecdef and proconfig = array['search_path=""'] and provolatile = 's' from pg_proc where oid = 'public.my_bookings()'::regprocedure),
                 'm013 E3: grants and settings unchanged: authenticated only, security definer, empty search_path, stable',
                 (select proconfig::text from pg_proc where oid = 'public.my_bookings()'::regprocedure));
  perform tst.ok(pg_get_function_result('public.my_bookings()'::regprocedure) = 'SETOF jsonb', 'm013 E4: still returns setof jsonb');

  -- ===================== Results (then everything is rolled back) =====================
  select count(*) filter (where passed), count(*),
         string_agg(case when passed then 'ok   ' else 'FAIL ' end || label
                    || case when passed then '' else ' :: ' || coalesce(left(detail, 400), '') end, E'\n' order by id)
    into v_pass, v_total, v_text
    from tst.results where id > v_start;
  raise exception 'M013 TESTS (rolled back): % of % passed (query md5 %)%', v_pass, v_total, md5(split_part(current_query(), E'\n\n-- source: ', 1)), E'\n' || v_text;
end
$$;
