-- Migration 007 (Nov 6, 2026, the request sweep), parts 3 to 6, on top of Migration 007s:
--   007s (20261106090001_m007s_detailer_jobs.sql, on both projects): my_jobs and the booking tables for managers
--        only. Its own suite is m007s_tests.sql; the first section here checks the same function and policies
--        again, as the base the Team and Admin pages now rely on.
--   part 3 (20261106204729): staff_availability, the staff's free times for moving a booking;
--   part 4 (20261106204758): one request, one booking in submit_guest_booking;
--   part 5 (20261106204817): the owner's list (office.requests) in plain words;
--   part 6 (20261106204823): a review leaves the Reviews page with its booking's personal details.
-- Needs the m001 framework and fixtures (test project only) and the migrations applied. One DO block, so it runs as
-- a single query through the Supabase MCP (top-level "set role" hangs there). Every check that writes runs inside
-- a block that is rolled back at its end, so nothing it makes is kept and it can run again; the answers are kept in
-- a variable and recorded at the end. Read the results with:
--   select label, passed, detail from tst.results where label like 'm007:%' order by id;
do $$
declare
  p text := 'm007';
  adm uuid := '00000000-0000-4000-8000-0000000000a1';
  mgr uuid := '00000000-0000-4000-8000-0000000000b1';
  det uuid := '00000000-0000-4000-8000-0000000000c1';
  cus uuid := '00000000-0000-4000-8000-0000000000d1';
  res jsonb := '[]';
  rec record;
  v_day date; v_day2 date; v_today date; i int;
  pl jsonb; r jsonb; r2 jsonb;
  v_id uuid; v_ref text; v_rev uuid; v_path text;
  t int[]; t2 int[];
  n int; n2 int; v_now int;
  v_state text; v_msg text; v_hint text; v_err text;
  v_row record;
begin
  update tst.results set label = 'old ' || label where label like 'm007:%';
  v_today := public.local_today();   -- read as the owner: the signed-in roles can't call local_today

  -- ------------------------------------------------------------ Migration 007s: my_jobs, and no direct reads for a detailer
  select count(*) into n
  from public.appointments a
  where exists (select 1 from public.appointment_assignments x where x.appointment_id = a.id and x.employee_id = det)
    and a.status in ('confirmed', 'in_progress', 'completed') and a.anonymized_at is null;
  res := res || jsonb_build_array(jsonb_build_array(p || ': fixture: the detailer has assigned jobs', n > 0, n::text));

  perform tst.login(det, 'aal1');
  execute 'set local role authenticated';
  select count(*) into n2 from public.my_jobs('2000-01-01');
  res := res || jsonb_build_array(jsonb_build_array(p || ': a detailer''s my_jobs lists their assigned jobs', n2 = n, n2 || ' of ' || n));
  res := res || jsonb_build_array(jsonb_build_array(p || ': my_jobs has no contact details and no prices',
    (select coalesce(bool_and(not (to_jsonb(j) ?| array['contact_first', 'contact_last', 'contact_phone', 'contact_email', 'customer_id',
                                                       'total_cents', 'value_cents', 'mobile_cents', 'extra_cost_cents', 'extra_cost_note'])), true)
     from public.my_jobs('2000-01-01') j), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': my_jobs'' service lines have no prices',
    (select coalesce(bool_and(not (it ?| array['price_cents', 'mobile_cents'])), true) from public.my_jobs('2000-01-01') j, jsonb_array_elements(j.items) it), null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': a detailer reads no bookings directly', (select count(*) from public.appointments) = 0, null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': a detailer reads no booking lines directly', (select count(*) from public.appointment_items) = 0, null));
  res := res || jsonb_build_array(jsonb_build_array(p || ': a detailer reads no booking history directly', (select count(*) from public.appointment_events) = 0, null));
  execute 'reset role';

  perform tst.login(adm, 'aal1');
  execute 'set local role authenticated';
  begin perform count(*) from public.my_jobs(null); v_err := 'no error';
  exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
  res := res || jsonb_build_array(jsonb_build_array(p || ': the admin without the authenticator gets mfa_required from my_jobs', v_err = 'mfa_required', v_err));
  execute 'reset role';
  perform tst.login(adm, 'aal2');
  execute 'set local role authenticated';
  select count(*) into n2 from public.my_jobs('2000-01-01');
  res := res || jsonb_build_array(jsonb_build_array(p || ': the admin''s my_jobs lists only jobs assigned to the admin (none here)', n2 = 0, n2::text));
  res := res || jsonb_build_array(jsonb_build_array(p || ': the admin still reads every booking directly', (select count(*) from public.appointments) > 0, null));
  execute 'reset role';
  perform tst.login(cus, 'aal1');
  execute 'set local role authenticated';
  begin perform count(*) from public.my_jobs(null); v_err := 'no error';
  exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
  res := res || jsonb_build_array(jsonb_build_array(p || ': a customer can''t call my_jobs', v_err = 'not_allowed', v_err));
  execute 'reset role';

  -- the assigned detailer still opens the customer's photos (the storage rule checks the assignment itself)
  begin
    select a.id, a.customer_id into v_row from public.appointments a
     join public.appointment_assignments x on x.appointment_id = a.id and x.employee_id = det
     where a.customer_id is not null and a.anonymized_at is null limit 1;
    v_path := v_row.customer_id || '/' || gen_random_uuid() || '.jpg';
    update public.appointments set photo_paths = array[v_path] where id = v_row.id;
    perform tst.login(det, 'aal1');
    execute 'set local role authenticated';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the assigned detailer may still open the booking''s photo', public.can_view_vehicle_photo(v_path), v_path));
    execute 'reset role';
    raise exception 'm007 rollback';
  exception when others then
    if sqlerrm <> 'm007 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': photo check ran', false, sqlerrm)); end if;
  end;

  -- ------------------------------------------------------------ part 3: staff_availability
  for i in 0..10 loop
    v_day := public.local_today() + 30 + i;
    exit when extract(isodow from v_day) between 1 and 4
          and 600 = any (public.get_availability(v_day, 60, 'mobile')) and 630 = any (public.get_availability(v_day, 60, 'mobile'))
          and 690 = any (public.get_availability(v_day, 60, 'mobile'));
  end loop;
  begin
    perform tst.logout();
    execute 'set local role anon';
    r := public.submit_guest_booking(tst.booking('mobile', v_day, 600, '{"phone":"(972) 555-3701","first_name":"Sweep","last_name":"Seven","special_request":"m007 test","bundle":null,"exterior":"ext_basic","conditions":[]}'));
    execute 'reset role';
    v_id := (r ->> 'id')::uuid;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.confirm_booking(v_id);
    execute 'reset role';

    perform tst.login(mgr, 'aal2');
    execute 'set local role authenticated';
    t := public.staff_availability(v_id, v_day, 60);
    t2 := public.get_availability(v_day, 60, 'mobile');
    res := res || jsonb_build_array(jsonb_build_array(p || ': staff times include the booking''s own start', 600 = any (t), t::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': staff times include the start next to it (one mobile job at a time)', 630 = any (t), t::text));
    res := res || jsonb_build_array(jsonb_build_array(p || ': (the customers'' times leave both out)', not (600 = any (t2)) and not (630 = any (t2)), t2::text));
    t := public.staff_availability(v_id, v_day, 90);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a longer length keeps the own start when it is free', 600 = any (t), t::text));
    v_now := (extract(hour from now() at time zone 'America/Chicago') * 60 + extract(minute from now() at time zone 'America/Chicago'))::int;
    t := public.staff_availability(v_id, v_today, 60);
    res := res || jsonb_build_array(jsonb_build_array(p || ': staff times for today are only later today',
      not exists (select 1 from unnest(t) u where u <= v_now), coalesce(t::text, 'null') || ' now ' || v_now));
    res := res || jsonb_build_array(jsonb_build_array(p || ': (the customers'' times have nothing today)', cardinality(public.get_availability(v_today, 60, 'mobile')) = 0, null));
    begin perform public.staff_availability(v_id, v_day, 4); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a length under 5 minutes is refused', v_err = 'invalid_input', v_err));
    begin perform public.staff_availability(gen_random_uuid(), v_day, 60); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': an unknown booking is not_found', v_err = 'not_found', v_err));
    perform public.set_booking_time(v_id, v_day, 630, null, null);
    res := res || jsonb_build_array(jsonb_build_array(p || ': a staff time the customers'' list left out is accepted by set_booking_time',
      (select start_min = 630 from public.appointments where id = v_id), null));
    execute 'reset role';

    perform tst.login(det, 'aal1');
    execute 'set local role authenticated';
    begin perform public.staff_availability(v_id, v_day, 60); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a detailer can''t ask for staff times', v_err = 'not_allowed', v_err));
    execute 'reset role';
    perform tst.login(mgr, 'aal1');
    execute 'set local role authenticated';
    begin perform public.staff_availability(v_id, v_day, 60); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a manager without the authenticator gets mfa_required', v_err = 'mfa_required', v_err));
    execute 'reset role';
    perform tst.logout();
    execute 'set local role anon';
    begin perform public.staff_availability(v_id, v_day, 60); v_err := 'no error';
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': a visitor can''t call staff_availability', v_err = '42501', v_err));
    execute 'reset role';
    raise exception 'm007 rollback';
  exception when others then
    if sqlerrm <> 'm007 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': staff times section ran', false, sqlerrm)); end if;
  end;

  -- ------------------------------------------------------------ part 4: one request, one booking
  for i in 0..10 loop
    v_day2 := public.local_today() + 30 + i;
    exit when extract(isodow from v_day2) in (6, 7)
          and 600 = any (public.get_availability(v_day2, 60, 'shop')) and 660 = any (public.get_availability(v_day2, 60, 'shop'))
          and 780 = any (public.get_availability(v_day2, 120, 'shop'));
  end loop;
  begin
    perform tst.logout();
    execute 'set local role anon';
    pl := tst.booking('shop', v_day2, 600, '{"phone":"(972) 555-3711","first_name":"Sweep","last_name":"Seven","special_request":"m007 test","bundle":null,"exterior":"ext_basic","conditions":[]}');
    r := public.submit_guest_booking(pl);
    r2 := public.submit_guest_booking(pl);
    res := res || jsonb_build_array(jsonb_build_array(p || ': the same request again returns the first booking', (r2 ->> 'repeat')::boolean and r2 ->> 'ref' = r ->> 'ref', r2 ->> 'ref'));
    begin r2 := public.submit_guest_booking(pl || '{"phone":"(972) 555-3712"}'); v_err := 'no error: ' || (r2 ->> 'ref'); v_hint := null;
    exception when others then get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint; v_err := case when v_state = 'P0001' then v_msg else v_state end; end;
    res := res || jsonb_build_array(jsonb_build_array(p || ': the same request with a corrected phone is refused, not booked twice', v_err = 'wrong_state' and v_hint = 'request_id', v_err || ' / ' || coalesce(v_hint, '')));
    r2 := public.submit_guest_booking(pl || jsonb_build_object('request_id', gen_random_uuid(), 'phone', '(972) 555-3712', 'start_min', 660));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a new request from that phone books as usual', r2 ->> 'ref' is distinct from r ->> 'ref' and r2 ->> 'status' = 'requested', r2 ->> 'ref'));
    execute 'reset role';
    select count(*) into n from public.appointments where request_id = (pl ->> 'request_id')::uuid;
    res := res || jsonb_build_array(jsonb_build_array(p || ': one booking for the request', n = 1, n::text));
    raise exception 'm007 rollback';
  exception when others then
    if sqlerrm <> 'm007 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': request section ran', false, sqlerrm)); end if;
  end;

  -- ------------------------------------------------------------ part 5: office.requests in plain words
  begin
    perform tst.logout();
    execute 'set local role anon';
    r := public.submit_guest_booking(tst.booking('shop', v_day2, 600, '{"phone":"(972) 555-3721","first_name":"Sweep","special_request":"m007 test","bundle":null,"exterior":"ext_basic","addons":["perfect_finish_sealant"],"conditions":[],"not_sure":true,"vehicle_description":"Sweep m007 van","vehicle_size":"xl","vehicle_make":null,"vehicle_model":null,"vehicle_year":null,"vehicle_color":null,"vehicle_type":null}'));
    r2 := public.submit_guest_booking(tst.booking('shop', v_day2, 780, '{"phone":"(972) 555-3722","first_name":"Sweep","special_request":"m007 test","conditions":["pet_hair"]}'));
    execute 'reset role';
    select * into v_row from office.requests where "Reference" = r ->> 'ref';
    res := res || jsonb_build_array(jsonb_build_array(p || ': a vehicle described in words keeps its XL', v_row."Vehicle" = 'Sweep m007 van (XL)', v_row."Vehicle"));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a price to set says what holds it', v_row."Total" like 'Price to set: %WetGloss for this vehicle type%' and v_row."Total" like '%XL vehicle%', v_row."Total"));
    select * into v_row from office.requests where "Reference" = r2 ->> 'ref';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the condition shows the form''s label', v_row."Condition" = 'Pet hair', v_row."Condition"));
    res := res || jsonb_build_array(jsonb_build_array(p || ': a known price is still the amount', v_row."Total" ~ '^\$[0-9]+\.[0-9]{2}$', v_row."Total"));
    raise exception 'm007 rollback';
  exception when others then
    if sqlerrm <> 'm007 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': office section ran', false, sqlerrm)); end if;
  end;

  -- ------------------------------------------------------------ part 6: a review leaves the page with the booking's details
  begin
    select a.id, a.customer_id into v_row from public.appointments a
     where a.status = 'completed' and a.customer_id is not null and a.anonymized_at is null
       and not exists (select 1 from public.reviews x where x.appointment_id = a.id)
     limit 1;
    res := res || jsonb_build_array(jsonb_build_array(p || ': fixture: a completed account booking with no review', v_row.id is not null, null));
    perform tst.login(v_row.customer_id, 'aal1');
    execute 'set local role authenticated';
    perform public.submit_review(v_row.id, 5, 'm007 test review');
    execute 'reset role';
    select id into v_rev from public.reviews where appointment_id = v_row.id;
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.review_set_status(v_rev, 'approved');
    execute 'reset role';
    perform tst.logout();
    execute 'set local role anon';
    res := res || jsonb_build_array(jsonb_build_array(p || ': (the approved review is on the public page)', exists (select 1 from public.public_reviews(50) as z(j) where (z.j ->> 'id')::uuid = v_rev), null));
    execute 'reset role';
    perform tst.login(adm, 'aal2');
    execute 'set local role authenticated';
    perform public.anonymize_booking(v_row.id);
    execute 'reset role';
    res := res || jsonb_build_array(jsonb_build_array(p || ': anonymizing the booking hides its review and takes the name off',
      (select status = 'hidden' and display_name = 'A customer' from public.reviews where id = v_rev), (select status || ' / ' || display_name from public.reviews where id = v_rev)));
    perform tst.logout();
    execute 'set local role anon';
    res := res || jsonb_build_array(jsonb_build_array(p || ': the review is gone from the public page', not exists (select 1 from public.public_reviews(50) as z(j) where (z.j ->> 'id')::uuid = v_rev), null));
    execute 'reset role';
    raise exception 'm007 rollback';
  exception when others then
    if sqlerrm <> 'm007 rollback' then res := res || jsonb_build_array(jsonb_build_array(p || ': review section ran', false, sqlerrm)); end if;
  end;
  res := res || jsonb_build_array(jsonb_build_array(p || ': no review of an anonymized booking is public',
    not exists (select 1 from public.reviews x join public.appointments a on a.id = x.appointment_id where a.anonymized_at is not null and (x.status <> 'hidden' or x.display_name <> 'A customer')), null));

  perform tst.logout();
  for rec in select value as e from jsonb_array_elements(res) loop
    perform tst.ok((rec.e ->> 1)::boolean, rec.e ->> 0, rec.e ->> 2);
  end loop;
end $$;
select label, passed, detail from tst.results where label like 'm007:%' order by id;
