-- Migration 005: guest booking. Needs the m001 framework and fixtures, and the migration applied.
-- One DO block, so it runs as a single query through the Supabase MCP (top-level "set role" hangs there).
-- It can run again: it first cancels the bookings an earlier run made (marked "m005 test"; nothing is removed),
-- and it puts the settings it changes back. Read the results with:
--   select * from tst.results where label like 'm005%' order by 1;
do $$
declare
  v_sat date;
  p jsonb;
  r jsonb;
  r2 jsonb;
  ap public.appointments;
  v_open int;
  v_flag boolean;
  i int;
begin
  delete from tst.results where label like 'm005%';
  update public.appointments x set status = 'cancelled'
   where x.special_request like 'm005 test%' and x.status in ('requested', 'needs_information', 'confirmed');
  select max_open_requests_per_customer, guest_booking into v_open, v_flag from public.business_settings where id = 1;
  update public.business_settings set guest_booking = true where id = 1;
  -- A Saturday 25 to 52 days ahead with 10 AM and 1 PM free at the shop.
  for i in 0..3 loop
    v_sat := current_date + 25 + ((6 - extract(isodow from current_date + 25)::int + 7) % 7) + 7 * i;
    exit when 600 = any (public.get_availability(v_sat, 120, 'shop')) and 780 = any (public.get_availability(v_sat, 120, 'shop'));
  end loop;

  -- A visitor with no account (the anon role).
  perform tst.logout();
  execute 'set local role anon';
  perform tst.ok((public.get_public_settings() ->> 'guest_booking')::boolean, 'm005: the public settings say guest booking is on');

  p := tst.booking('shop', v_sat, 600, '{"special_request":"m005 test","first_name":"Lena","last_name":"Ortiz","phone":"(972) 555-3201"}');
  r := public.submit_guest_booking(p);
  perform tst.ok(r ->> 'ref' ~ '^AD-' and r ->> 'status' = 'requested', 'm005: a guest books with a name and a typed phone', r::text);
  perform tst.ok(r ? 'address' and not (r ? 'contact_phone') and not (r ? 'shop_address'), 'm005: the receipt is the usual one (no contact or shop address)');

  r2 := public.submit_guest_booking(p);
  perform tst.ok((r2 ->> 'repeat')::boolean and r2 ->> 'ref' = r ->> 'ref', 'm005: the same request again returns the first booking');
  r2 := public.submit_guest_booking(p || jsonb_build_object('request_id', gen_random_uuid()));
  perform tst.ok((r2 ->> 'repeat')::boolean and r2 ->> 'ref' = r ->> 'ref', 'm005: the same booking sent again within minutes returns the first one');
  r2 := public.submit_guest_booking(p || jsonb_build_object('phone', '(972) 555-3299', 'start_min', 780));
  perform tst.ok(r2 ->> 'ref' is distinct from r ->> 'ref', 'm005: a request id with another phone is a new booking, not the first one''s receipt');

  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena","phone":"555-1234"}'))$q$,
    'invalid_input', 'm005: a phone that is not a 10-digit US number is refused');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena"}'))$q$,
    'invalid_input', 'm005: a missing phone is refused');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena","phone":"(972) 555-3202"}') - 'request_id')$q$,
    'invalid_input', 'm005: a missing request id is refused');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"L3na","phone":"(972) 555-3202"}'))$q$,
    'invalid_input', 'm005: a first name with digits is refused');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena","phone":"(972) 555-3202","vehicle_id":"00000000-0000-4000-8000-000000000001"}'))$q$,
    'invalid_input', 'm005: a guest can''t use a saved vehicle');
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena","phone":"(972) 555-3202","photos":["x/y.jpg"]}'))$q$,
    'invalid_input', 'm005: a guest can''t attach photos');
  perform tst.err($q$select public.submit_guest_booking('[]'::jsonb)$q$, 'invalid_input', 'm005: a payload that isn''t an object is refused');

  r2 := public.submit_guest_booking(tst.booking('shop', v_sat, 780, '{"special_request":"m005 test spam","first_name":"Lena","phone":"(972) 555-3203","website":"http://x"}'));
  -- (read back as the owner below: a visitor can't read appointments)

  -- A plain visitor still can't use the account path or read the owner's list.
  perform tst.err($q$select public.submit_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{}'))$q$, '42501', 'm005: anon still can''t call submit_booking');
  perform tst.err($q$select count(*) from office.requests$q$, '42501', 'm005: anon can''t read the owner''s list');
  execute 'reset role';

  -- What was saved, read as the owner.
  select * into ap from public.appointments where ref = r ->> 'ref';
  perform tst.ok(ap.customer_id is null and ap.created_by is null, 'm005: a guest booking has no account behind it');
  perform tst.eq(ap.contact_phone, '19725553201', 'm005: the typed phone is saved in the standard form');
  perform tst.ok(ap.contact_first = 'Lena' and ap.contact_last = 'Ortiz' and ap.contact_email is null, 'm005: the typed name is saved, no email');
  perform tst.ok(cardinality(ap.photo_paths) = 0 and ap.queue = 'requests' and ap.hold_expires_at > now(), 'm005: no photos, in Requests, the time held');
  perform tst.ok(exists (select 1 from public.appointment_items i where i.appointment_id = ap.id), 'm005: the services are saved with it');
  perform tst.ok(exists (select 1 from public.appointment_events e where e.appointment_id = ap.id and e.actor_id is null), 'm005: the history starts with no actor');
  perform tst.eq((select queue::text from public.appointments where ref = r2 ->> 'ref'), 'spam', 'm005: the hidden spam field sends it to Spam');
  perform tst.ok((select "Who" = 'Guest: phone not confirmed' and "Phone" = '(972) 555-3201' and "Name" = 'Lena Ortiz' and "Where" = 'At the shop'
                  from office.requests where "Reference" = r ->> 'ref'), 'm005: the owner''s list shows it in plain words');

  -- Per-phone limit: with one open request allowed, a second one from the same phone is refused.
  update public.business_settings set max_open_requests_per_customer = 1 where id = 1;
  perform tst.logout();
  execute 'set local role anon';
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test 2","first_name":"Lena","phone":"(972) 555-3201"}'))$q$,
    'too_many_requests', 'm005: the per-phone open-request limit applies');
  execute 'reset role';
  update public.business_settings set max_open_requests_per_customer = v_open where id = 1;

  -- Turned off (once Twilio works): the guest path asks for the text code.
  update public.business_settings set guest_booking = false where id = 1;
  perform tst.logout();
  execute 'set local role anon';
  perform tst.err($q$select public.submit_guest_booking(tst.booking('shop', '$q$ || v_sat || $q$', 780, '{"special_request":"m005 test","first_name":"Lena","phone":"(972) 555-3204"}'))$q$,
    'sign_in_required', 'm005: with guest booking off, a guest is asked to confirm the phone');
  perform tst.ok(not (public.get_public_settings() ->> 'guest_booking')::boolean, 'm005: the public settings say it is off');
  execute 'reset role';
  update public.business_settings set guest_booking = v_flag where id = 1;
  -- Free the times this run held, so the next block (and the next run) finds them open.
  update public.appointments x set status = 'cancelled'
   where x.special_request like 'm005 test%' and x.status in ('requested', 'needs_information', 'confirmed');
end $$;

-- Part 4: the owner's actions from the SQL Editor (office.confirm, decline, cancel, set_extra_cost).
do $$
declare
  v_sat date;
  r jsonb;
  rx jsonb;
  rd jsonb;
  ap public.appointments;
  i int;
begin
  delete from tst.results where label like 'm005 office%';
  update public.appointments x set status = 'cancelled'
   where x.special_request like 'm005%' and x.status in ('requested', 'needs_information', 'confirmed');
  -- A Saturday with 10 AM, 1 PM and 4 PM free at the shop (the same day for all three).
  for i in 0..3 loop
    v_sat := current_date + 25 + ((6 - extract(isodow from current_date + 25)::int + 7) % 7) + 7 * i;
    exit when array[600, 780, 960] <@ public.get_availability(v_sat, 120, 'shop');
  end loop;
  perform tst.logout();
  execute 'set local role anon';
  r := public.submit_guest_booking(tst.booking('shop', v_sat, 600, '{"special_request":"m005 office","first_name":"Omar","phone":"(972) 555-3211"}'));
  rx := public.submit_guest_booking(tst.booking('shop', v_sat, 780, '{"special_request":"m005 office xl","first_name":"Omar","phone":"(972) 555-3212","vehicle_size":"xl"}'));
  rd := public.submit_guest_booking(tst.booking('shop', v_sat, 960, '{"special_request":"m005 office decline","first_name":"Omar","phone":"(972) 555-3213"}'));
  perform tst.err($q$select office.confirm('$q$ || (r ->> 'ref') || $q$')$q$, '42501', 'm005 office: a visitor can''t use the owner''s actions');
  execute 'reset role';

  perform tst.ok(office.confirm(r ->> 'ref') like 'Confirmed %The time is kept.', 'm005 office: confirm by reference');
  select * into ap from public.appointments where ref = r ->> 'ref';
  perform tst.ok(ap.status = 'confirmed' and ap.hold_expires_at is null, 'm005 office: confirmed, and the time is kept for good');
  perform tst.ok(office.confirm(lower(r ->> 'ref')) like '% is confirmed, so there is nothing to confirm.', 'm005 office: a second confirm says so (lower case works)');
  perform tst.ok(office.confirm('AD-NOPE2345') = 'No booking has the reference AD-NOPE2345.', 'm005 office: an unknown reference is said in words');
  perform tst.ok(office.confirm(rx ->> 'ref') like '% needs its extra cost first%', 'm005 office: an XL request needs its extra cost before confirming');
  perform tst.ok(office.set_extra_cost(rx ->> 'ref', 25, 'Large SUV') like '%extra cost set to $25.00. Total now $%', 'm005 office: set the extra cost in dollars');
  perform tst.ok(office.confirm(rx ->> 'ref') like 'Confirmed %', 'm005 office: then it confirms');
  perform tst.ok(office.decline(r ->> 'ref') like '% is confirmed. Only a request waiting%', 'm005 office: a confirmed booking can''t be declined');
  perform tst.ok(office.decline(rd ->> 'ref') = 'Declined ' || (rd ->> 'ref') || '. Its time is free again.', 'm005 office: decline a request');
  perform tst.eq((select status::text from public.appointments where ref = rd ->> 'ref'), 'declined', 'm005 office: it is declined');
  perform tst.ok(office.cancel(r ->> 'ref') = 'Cancelled ' || (r ->> 'ref') || '. Its time is free again.', 'm005 office: cancel a confirmed booking');
  perform tst.ok(office.cancel(r ->> 'ref') like '% is already cancelled.', 'm005 office: cancelling twice says so');
  perform tst.ok(exists (select 1 from public.appointment_events e join public.appointments a on a.id = e.appointment_id
                         where a.ref = r ->> 'ref' and e.to_status = 'confirmed'), 'm005 office: the history records the confirmation');
  perform office.cancel(rx ->> 'ref');
end $$;

-- The caps on all guest bookings together (12 an hour, the Spam lane its own 12). Everything here is undone at
-- the end (the inner block ends with an error on purpose), so it leaves no bookings behind; only the results stay.
do $$
declare
  i int;
  k int;
  d date;
  s int;
  r jsonb;
  refs text[] := '{}';
  v_13 text;
  v_spam_lane text;
  v_after text;
begin
  delete from tst.results where label like 'm005 caps%';
  begin
    -- Start from a quiet hour: the guest bookings of the last hour are set aside (undone below).
    update public.appointments x set created_at = now() - interval '2 hours'
     where x.customer_id is null and x.created_by is null and x.created_at > now() - interval '1 hour';
    perform tst.logout();
    execute 'set local role anon';
    for i in 1..13 loop
      d := null;
      for k in 25..60 loop
        s := (public.get_availability(current_date + k, 120, 'shop'))[1];
        if s is not null then d := current_date + k; exit; end if;
      end loop;
      begin
        r := public.submit_guest_booking(tst.booking('shop', d, s, jsonb_build_object(
               'special_request', 'm005 caps', 'first_name', 'Cap', 'phone', '(469) 555-08' || lpad(i::text, 2, '0'))));
        refs := refs || (r ->> 'ref');
        if i = 13 then v_13 := 'saved'; end if;
      exception when others then
        if i = 13 then v_13 := sqlerrm; else v_13 := 'request ' || i || ' refused: ' || sqlerrm; exit; end if;
      end;
    end loop;
    -- The spam trap still catches (its own 12), so a bot can't use it to close booking for real visitors.
    r := public.submit_guest_booking(tst.booking('shop', d, s, '{"special_request":"m005 caps","first_name":"Bot","phone":"(469) 555-0890","website":"http://x"}'));
    execute 'reset role';
    v_spam_lane := (select queue::text from public.appointments where ref = r ->> 'ref');
    -- The owner declines one: its place in the hour is free again.
    perform office.decline(refs[1]);
    perform tst.logout();
    execute 'set local role anon';
    begin
      r := public.submit_guest_booking(tst.booking('shop', d, s, '{"special_request":"m005 caps","first_name":"Cap","phone":"(469) 555-0891"}'));
      v_after := 'saved';
    exception when others then v_after := sqlerrm;
    end;
    execute 'reset role';
    raise exception 'm005 caps: undo';
  exception when others then
    if sqlerrm <> 'm005 caps: undo' then raise; end if;
  end;
  execute 'reset role';
  perform tst.eq(cardinality(refs)::text, '12', 'm005 caps: 12 guest requests in an hour are saved');
  perform tst.eq(v_13, 'too_many_requests', 'm005 caps: the 13th in the hour is refused');
  perform tst.eq(v_spam_lane, 'spam', 'm005 caps: the spam trap still saves to Spam when the hour is full');
  perform tst.eq(v_after, 'saved', 'm005 caps: a declined request frees its place in the hour');
  perform tst.eq((select count(*)::text from public.appointments where special_request = 'm005 caps'), '0', 'm005 caps: nothing is left behind');
end $$;
