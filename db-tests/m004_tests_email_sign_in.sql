-- Migration 004: sign-in by email code. Needs the m001 framework and fixtures, and the migration applied.
-- One DO block, so it runs as a single query through the Supabase MCP (top-level "set role" hangs
-- there). It can run again: it adds its own logins once, and first cancels the bookings an earlier
-- run made (marked "m004 test"; nothing is deleted). Ran on the test project on Oct 11 2026:
-- 31 of 31 passed, and 31 of 31 again on a second run. Read the results with:
--   select * from tst.results where label like 'm004%' order by 1;
do $$
declare
  f1 constant uuid := '00000000-0000-4000-8000-0000000000f1';   -- email confirmed, no phone (Gina)
  f2 constant uuid := '00000000-0000-4000-8000-0000000000f2';   -- email not confirmed yet
  f3 constant uuid := '00000000-0000-4000-8000-0000000000f3';   -- a throwaway email, confirmed
  d1 constant uuid := '00000000-0000-4000-8000-0000000000d1';   -- phone and email confirmed (Carla)
  d2 constant uuid := '00000000-0000-4000-8000-0000000000d2';
  a1 constant uuid := '00000000-0000-4000-8000-0000000000a1';   -- the admin
  e2 constant uuid := '00000000-0000-4000-8000-0000000000e2';   -- anonymous
  v_gone uuid := gen_random_uuid();                              -- removed at the end of this run
  v_sat date;
  p jsonb;
  r jsonb;
  ap public.appointments;
  v_msg text;
  v_hint text;
  i int;
begin
  delete from tst.results where label like 'm004%';
  -- Logins as Supabase Auth makes them.
  insert into auth.users (id, aud, role, phone, phone_confirmed_at, email, email_confirmed_at, raw_user_meta_data, is_anonymous)
  values (f1, 'authenticated', 'authenticated', null, null, 'gina.park@gmail.com', now(), '{"first_name":"Gina","last_name":"Park"}', false),
         (f2, 'authenticated', 'authenticated', null, null, 'hal.reyes@gmail.com', null, '{"first_name":"Hal"}', false),
         (f3, 'authenticated', 'authenticated', null, null, 'zed@mailinator.com', now(), '{"first_name":"Zed"}', false)
  on conflict (id) do nothing;
  insert into auth.users (id, aud, role, phone, phone_confirmed_at, email, email_confirmed_at, raw_user_meta_data, is_anonymous)
  values (v_gone, 'authenticated', 'authenticated', null, null, 'm004.' || left(v_gone::text, 8) || '@gmail.com', now(), '{"first_name":"Rae"}', false);
  update public.appointments x set status = 'cancelled'
   where x.special_request = 'm004 test' and x.status in ('requested', 'needs_information', 'confirmed');
  update public.profiles x set contact_phone = null where x.id = f1;
  -- A Saturday 25 to 52 days ahead with 10 AM and 1 PM free at the shop, two weeks running.
  for i in 0..3 loop
    v_sat := current_date + 25 + ((6 - extract(isodow from current_date + 25)::int + 7) % 7) + 7 * i;
    exit when 600 = any (public.get_availability(v_sat, 120, 'shop')) and 780 = any (public.get_availability(v_sat, 120, 'shop'))
          and 600 = any (public.get_availability(v_sat + 7, 120, 'shop')) and 780 = any (public.get_availability(v_sat + 7, 120, 'shop'))
          and 600 = any (public.get_availability(v_sat + 1, 120, 'shop'));
  end loop;

  -- The auth sync: a confirmed email reaches the profile, an unconfirmed or throwaway one doesn't.
  perform tst.eq((select email from public.profiles where id = f1), 'gina.park@gmail.com', 'm004: a confirmed email is copied to the profile');
  perform tst.ok((select phone is null and contact_phone is null from public.profiles where id = f1), 'm004: an email-only login has no phone yet');
  perform tst.ok((select email is null from public.profiles where id = f2), 'm004: an unconfirmed email is not copied');
  perform tst.ok((select email is null from public.profiles where id = f3), 'm004: a throwaway email is not copied');

  -- Gina books with her confirmed email and a typed phone.
  perform tst.login(f1);
  execute 'set local role authenticated';
  begin
    perform public.submit_booking(tst.booking('shop', v_sat, 600, '{"special_request":"m004 test"}'));
    perform tst.ok(false, 'm004: an email-only customer must give a phone', 'no error raised');
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    perform tst.eq(v_msg || ' / ' || coalesce(v_hint, ''), 'invalid_input / phone', 'm004: an email-only customer must give a phone');
  end;
  begin
    perform public.submit_booking(tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"555-1234"}'));
    perform tst.ok(false, 'm004: a phone that is not a US number is refused', 'no error raised');
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    perform tst.eq(v_msg || ' / ' || coalesce(v_hint, ''), 'invalid_input / phone', 'm004: a phone that is not a US number is refused');
  end;
  r := public.submit_booking(tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"(972) 555-3101"}'));
  perform tst.eq(r ->> 'status', 'requested', 'm004: an email-confirmed customer can send a booking request');
  perform tst.ok(not (r ? 'contact_phone') and not (r ? 'contact_email'), 'm004: the receipt still hides the contact fields');
  perform tst.ok(public.can_upload_vehicle_photo(f1::text || '/' || gen_random_uuid()::text || '.jpg'), 'm004: an email-confirmed customer may upload photos');
  perform tst.eq((select count(*)::text from public.profiles where id = d1), '0', 'm004: a customer still sees only their own profile');
  execute 'reset role';
  select * into ap from public.appointments where id = (r ->> 'id')::uuid;
  perform tst.eq(ap.contact_phone || ' / ' || ap.contact_email, '19725553101 / gina.park@gmail.com', 'm004: the booking carries the typed phone and the confirmed email');
  perform tst.eq((select contact_phone from public.profiles where id = f1), '19725553101', 'm004: the typed phone is kept on the profile');
  perform tst.ok((select phone is null from public.profiles where id = f1), 'm004: a typed phone is never stored as a confirmed one');

  perform tst.login(f1);
  execute 'set local role authenticated';
  r := public.submit_booking(tst.booking('shop', v_sat, 780, '{"special_request":"m004 test","contact_phone":"214 555 3102"}'));
  execute 'reset role';
  perform tst.eq((select contact_phone from public.profiles where id = f1), '12145553102', 'm004: a new number on the next booking replaces it');

  -- Who still can't book.
  perform tst.login(f2);
  execute 'set local role authenticated';
  perform tst.err(format('select public.submit_booking(%L::jsonb)', tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"9725553103"}')::text), 'email_not_verified', 'm004: an unconfirmed email can''t book');
  perform tst.ok(not public.can_upload_vehicle_photo(f2::text || '/' || gen_random_uuid()::text || '.jpg'), 'm004: an unconfirmed email can''t upload photos');
  execute 'reset role';
  perform tst.login(f3);
  execute 'set local role authenticated';
  perform tst.err(format('select public.submit_booking(%L::jsonb)', tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"9725553104"}')::text), 'email_not_allowed', 'm004: a throwaway email can''t book');
  execute 'reset role';
  perform tst.login(e2);
  execute 'set local role authenticated';
  perform tst.err(format('select public.submit_booking(%L::jsonb)', tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"9725553105"}')::text), 'email_not_verified', 'm004: an anonymous login still can''t book');
  execute 'reset role';
  perform tst.login(gen_random_uuid());
  execute 'set local role authenticated';
  perform tst.err(format('select public.submit_booking(%L::jsonb)', tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"9725553106"}')::text), 'email_not_verified', 'm004: an unknown login can''t book');
  execute 'reset role';
  p := tst.booking('shop', v_sat, 600, '{"special_request":"m004 test","contact_phone":"9725553107"}');
  perform tst.logout();
  execute 'set local role anon';
  perform tst.err(format('select public.submit_booking(%L::jsonb)', p::text), '42501', 'm004: a signed-out visitor can''t book');
  execute 'reset role';

  -- A confirmed phone still wins over a typed one.
  perform tst.login(d1);
  execute 'set local role authenticated';
  r := public.submit_booking(tst.booking('shop', v_sat + 1, 600, '{"special_request":"m004 test","contact_phone":"4695559900"}'));
  execute 'reset role';
  perform tst.eq((select contact_phone from public.appointments where id = (r ->> 'id')::uuid), '19725552011', 'm004: a phone-confirmed customer books with the confirmed phone');
  perform tst.ok((select contact_phone is null from public.profiles where id = d1), 'm004: the typed phone doesn''t touch a phone-confirmed profile');

  -- Staff entering a booking for an account.
  perform tst.login(a1, 'aal2');
  execute 'set local role authenticated';
  ap := public.staff_create_booking(tst.booking('shop', v_sat + 7, 600, jsonb_build_object('customer_id', f1, 'special_request', 'm004 test')));
  perform tst.eq(ap.contact_phone, '12145553102', 'm004: staff book for an email-only account with its saved phone');
  ap := public.staff_create_booking(tst.booking('shop', v_sat + 7, 780, jsonb_build_object('customer_id', f1, 'special_request', 'm004 test', 'contact_phone', '(972) 555-3109')));
  perform tst.eq(ap.contact_phone, '19725553109', 'm004: staff can enter a phone for an email-only account');
  perform tst.err(format('select public.staff_create_booking(%L::jsonb)', tst.booking('shop', v_sat + 7, 960, jsonb_build_object('customer_id', d1, 'special_request', 'm004 test', 'contact_phone', '4695559901'))::text), 'invalid_input', 'm004: a phone that doesn''t match a confirmed one is still refused');
  perform tst.err(format('select public.staff_create_booking(%L::jsonb)', tst.booking('shop', v_sat + 7, 960, jsonb_build_object('customer_id', f1, 'special_request', 'm004 test', 'contact_phone', '12345'))::text), 'invalid_input', 'm004: staff can''t enter a bad phone for an account');
  execute 'reset role';
  perform tst.ok((select contact_phone = '12145553102' from public.profiles where id = f1), 'm004: a phone staff enter doesn''t change the customer''s saved one');

  -- Removing a customer clears the contact phone too.
  update public.profiles x set contact_phone = '19725553110' where x.id = v_gone;
  perform tst.login(a1, 'aal2');
  execute 'set local role authenticated';
  perform public.anonymize_customer(v_gone);
  execute 'reset role';
  perform tst.ok((select contact_phone is null and email is null and deleted_at is not null from public.profiles where id = v_gone), 'm004: removing a customer clears the contact phone');

  -- The column only takes US numbers, and the owner setup stays server-side.
  perform tst.err(format('update public.profiles set contact_phone = %L where id = %L', '12345', f1), '23514', 'm004: the contact phone column only takes US numbers');
  perform tst.err('select public.bootstrap_admin(''gina.park@gmail.com'')', 'wrong_state', 'm004: bootstrap_admin takes an email (and still refuses a second admin)');
  perform tst.login(d2);
  execute 'set local role authenticated';
  perform tst.err('select public.bootstrap_admin(''gina.park@gmail.com'')', '42501', 'm004: the website can''t call bootstrap_admin');
  execute 'reset role';
end $$;
select * from tst.results where label like 'm004%' order by 1;
