-- W-16 part 5: the owner's round-8 decisions (Oct 3).
--   1. Managers and the admin (not detailers) enter bookings for people who call.
--   2. The quote recommends a cheaper bundle; it never switches on its own.
-- Runs after the other parts.

-- ---------------------------------------------------------------- 2. bundle recommendation
reset role;
select tst.logout();
set role anon;
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,bundle}', 'signature_combo', 'recommend: Exterior + Interior Basic suggests the Signature Combo');
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,saves_cents}', '999', 'recommend: saves $9.99 at the driveway');
select tst.eq(public.quote_booking('{"location_type":"mobile","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,saves_cents}', '574', 'recommend: saves $5.74 on a mobile job (percentages included)');
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') ->> 'total_cents', '10998', 'recommend: the chosen services keep their own price');
select tst.eq(public.quote_booking('{"location_type":"mobile","exterior":"ext_deluxe","interior":"int_deluxe"}') #>> '{suggestion,bundle}', 'full_detail', 'recommend: both Deluxe services suggest the Full Detail Bundle');
select tst.ok(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_deluxe"}') -> 'suggestion' = 'null'::jsonb, 'recommend: nothing when no bundle matches');
select tst.ok(public.quote_booking('{"location_type":"shop","bundle":"signature_combo"}') -> 'suggestion' = 'null'::jsonb, 'recommend: nothing when a bundle is already chosen');
select tst.ok(public.quote_booking('{"location_type":"shop","exterior":"ext_basic"}') -> 'suggestion' = 'null'::jsonb, 'recommend: nothing for a single service');
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic","vehicle_size":"xl"}') #>> '{suggestion,saves_cents}', '999', 'recommend: still shown while the price waits for the extra cost');

-- ---------------------------------------------------------------- 1. phone-in bookings: who may enter them
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Paula","contact_phone":"2145553001"}')$q$, 'not_allowed', 'phone-in: customers can''t enter bookings');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c1');
set role authenticated;
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Paula","contact_phone":"2145553001"}')$q$, 'not_allowed', 'phone-in: detailers can''t enter bookings');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
set role authenticated;
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Paula","contact_phone":"2145553001"}')$q$, 'mfa_required', 'phone-in: a manager needs the authenticator code');

-- ---------------------------------------------------------------- a manager enters a booking for a caller
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.setv('p1', to_jsonb(public.staff_create_booking(tst.booking('shop', tst.d(36), 600,
  '{"request_id":"22222222-2222-4222-8222-222222222222","contact_first":"Paula","contact_last":"Grant","contact_phone":"(214) 555-3001","contact_email":"paula.grant@gmail.com"}')))::text);
select tst.eq(tst.getv('p1')::jsonb ->> 'status', 'confirmed', 'phone-in: saved as confirmed');
select tst.eq(tst.getv('p1')::jsonb ->> 'contact_phone', '12145553001', 'phone-in: phone stored the standard way');
select tst.eq(tst.getv('p1')::jsonb ->> 'contact_email', 'paula.grant@gmail.com', 'phone-in: email kept');
select tst.ok(tst.getv('p1')::jsonb -> 'customer_id' = 'null'::jsonb, 'phone-in: not linked to any account');
select tst.eq(tst.getv('p1')::jsonb ->> 'total_cents', '9999', 'phone-in: priced like an online booking');
select tst.ok(tst.getv('p1')::jsonb -> 'hold_expires_at' = 'null'::jsonb, 'phone-in: holds its time for good');
select tst.eq(tst.getv('p1')::jsonb ->> 'created_by', '00000000-0000-4000-8000-0000000000b1', 'phone-in: records who entered it');
select tst.eq((public.staff_create_booking(tst.booking('shop', tst.d(36), 600,
  '{"request_id":"22222222-2222-4222-8222-222222222222","contact_first":"Paula","contact_phone":"2145553001"}'))).id::text,
  tst.getv('p1')::jsonb ->> 'id', 'phone-in: a double click saves one booking');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Paula","contact_phone":"555-1234"}')$q$, 'invalid_input', 'phone-in: a real US phone number is required');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Asdf","contact_phone":"2145553002"}')$q$, 'invalid_input', 'phone-in: junk names refused');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 600) || '{"contact_first":"Rosa","contact_phone":"2145553002","contact_email":"rosa@mailinator.com"}')$q$, 'invalid_input', 'phone-in: throwaway email refused');
select tst.err($q$select public.staff_create_booking(tst.booking('mobile', tst.d(36), 900, '{"address_zip":"75001"}') || '{"contact_first":"Rosa","contact_phone":"2145553002"}')$q$, 'outside_service_area', 'phone-in: the 10-mile area still applies');
select tst.ok((public.staff_create_booking(tst.booking('shop', tst.d(36), 630) || '{"contact_first":"Rosa","contact_phone":"2145553002"}')).status = 'confirmed', 'phone-in: a second driveway car fits');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(36), 660) || '{"contact_first":"Omar","contact_phone":"2145553003"}')$q$, 'slot_unavailable', 'phone-in: a third car at once is refused');
select tst.err($q$select public.staff_create_booking(tst.booking('mobile', tst.d(36), 630) || '{"contact_first":"Omar","contact_phone":"2145553003"}')$q$, 'slot_unavailable', 'phone-in: never driveway and mobile at once');
select tst.ok((public.staff_create_booking(tst.booking('shop', tst.d(70), 600) || '{"contact_first":"Omar","contact_phone":"2145553003"}')).status = 'confirmed', 'phone-in: staff can book beyond 60 days');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(42), 600) || '{"contact_first":"Omar","contact_phone":"2145553003"}')$q$, 'slot_unavailable', 'phone-in: closed days stay closed');
reset role;
select tst.ok(exists (select 1 from public.notifications where appointment_id = (tst.getv('p1')::jsonb ->> 'id')::uuid
                      and recipient_id = '00000000-0000-4000-8000-0000000000a1' and title = 'New booking entered'), 'phone-in: the admin is told');
select tst.ok(not exists (select 1 from public.notifications where appointment_id = (tst.getv('p1')::jsonb ->> 'id')::uuid
                          and recipient_id = '00000000-0000-4000-8000-0000000000b1'), 'phone-in: the manager who entered it isn''t told about their own entry');

-- ---------------------------------------------------------------- for an existing customer account
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.err(format($q$select public.staff_create_booking(tst.booking('mobile', tst.d(37), 600, jsonb_build_object('customer_id', '00000000-0000-4000-8000-0000000000d1', 'contact_phone', '2145559999')))$q$), 'invalid_input', 'phone-in: a typed phone that doesn''t match the account is refused');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(37), 900, '{"customer_id":"00000000-0000-4000-8000-0000000000c1"}'))$q$, 'not_found', 'phone-in: only customer accounts can be picked');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(37), 900, '{"contact_first":"Rosa","contact_phone":"2145553002"}') - 'request_id')$q$, 'invalid_input', 'phone-in: a request ID is required, so double clicks save once');
select tst.setv('p2', to_jsonb(public.staff_create_booking(tst.booking('mobile', tst.d(37), 600,
  jsonb_build_object('customer_id', '00000000-0000-4000-8000-0000000000d1', 'vehicle_id', tst.getv('veh_a'),
                     'contact_first', 'Somebody', 'contact_phone', '(972) 555-2011'))))::text);
select tst.eq(tst.getv('p2')::jsonb ->> 'contact_phone', '19725552011', 'phone-in: an account''s confirmed phone is used');
select tst.eq(tst.getv('p2')::jsonb ->> 'contact_first', 'Carla', 'phone-in: the account''s name is used');
select tst.eq(tst.getv('p2')::jsonb ->> 'vehicle_model', '3', 'phone-in: the customer''s saved vehicle can be used');
select tst.err(format($q$select public.staff_create_booking(tst.booking('shop', tst.d(37), 900, jsonb_build_object('customer_id', '00000000-0000-4000-8000-0000000000d4', 'vehicle_id', %L)))$q$, tst.getv('veh_a')), 'not_found', 'phone-in: another customer''s saved vehicle can''t be used');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(37), 900, '{"customer_id":"00000000-0000-4000-8000-000000000999"}'))$q$, 'not_found', 'phone-in: unknown account refused');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.ok(exists (select 1 from public.my_bookings() b where b ->> 'id' = tst.getv('p2')::jsonb ->> 'id' and b ->> 'status' = 'confirmed'), 'phone-in: shows under the customer''s My bookings');
select tst.ok(exists (select 1 from public.notifications where appointment_id = (tst.getv('p2')::jsonb ->> 'id')::uuid and kind = 'status_confirmed' and body like '%Total: $106.99.%'), 'phone-in: the customer is told it''s confirmed, with the total');
select tst.ok(not exists (select 1 from public.notifications where appointment_id = (tst.getv('p2')::jsonb ->> 'id')::uuid and kind = 'request_received'), 'phone-in: no "request received" for a confirmed booking');

-- ---------------------------------------------------------------- prices that wait for the extra cost
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.setv('p3', to_jsonb(public.staff_create_booking(tst.booking('shop', tst.d(38), 600,
  '{"vehicle_size":"xl","contact_first":"Omar","contact_phone":"2145553003"}')))::text);
select tst.ok(tst.getv('p3')::jsonb ->> 'status' = 'requested' and (tst.getv('p3')::jsonb ->> 'price_pending')::boolean, 'phone-in: XL by a manager waits for the admin''s extra cost');
select tst.ok((tst.getv('p3')::jsonb ->> 'hold_expires_at')::timestamptz > now(), 'phone-in: and holds its time meanwhile');
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(38), 900, '{"vehicle_size":"xl","contact_first":"Omar","contact_phone":"2145553003","extra_cost_cents":1500}'))$q$, 'not_allowed', 'phone-in: only the admin sets the extra cost');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.setv('p4', to_jsonb(public.staff_create_booking(tst.booking('shop', tst.d(38), 900,
  '{"vehicle_size":"xl","contact_first":"Omar","contact_phone":"2145553003","extra_cost_cents":1500,"extra_cost_note":"XL truck"}')))::text);
select tst.ok(tst.getv('p4')::jsonb ->> 'status' = 'confirmed' and tst.getv('p4')::jsonb ->> 'total_cents' = '11499', 'phone-in: the admin can include the extra cost and confirm at once');
reset role;
select tst.ok(exists (select 1 from public.notifications where appointment_id = (tst.getv('p4')::jsonb ->> 'id')::uuid
                      and recipient_id = '00000000-0000-4000-8000-0000000000b1' and title = 'New booking entered'), 'phone-in: managers are told about the admin''s entry');

-- ---------------------------------------------------------------- removing details from one booking
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.err(format('select public.anonymize_booking(%L)', tst.getv('p1')::jsonb ->> 'id'), 'not_allowed', 'remove details: admin only');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.err(format('select public.anonymize_booking(%L)', tst.getv('p1')::jsonb ->> 'id'), 'wrong_state', 'remove details: only from a closed booking');
select public.cancel_booking((tst.getv('p1')::jsonb ->> 'id')::uuid, 'Customer called to cancel.');
select tst.ok((select contact_phone is null and contact_first is null and anonymized_at is not null and total_cents = 9999
               from public.anonymize_booking((tst.getv('p1')::jsonb ->> 'id')::uuid)), 'remove details: contact details cleared, the record kept');
reset role;
select tst.ok(not exists (select 1 from public.appointment_events where appointment_id = (tst.getv('p1')::jsonb ->> 'id')::uuid and note is not null), 'remove details: staff notes cleared');

-- ---------------------------------------------------------------- second review (Oct 3): request IDs, caps, removal, bundles
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.ok((public.staff_create_booking(tst.booking('shop', tst.d(39), 600,
  '{"request_id":"33333333-3333-4333-8333-333333333333","customer_id":"00000000-0000-4000-8000-0000000000d1"}'))).status = 'confirmed', 'request IDs: a manager''s entry');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.err($q$select public.staff_create_booking(tst.booking('shop', tst.d(39), 900, '{"request_id":"33333333-3333-4333-8333-333333333333","customer_id":"00000000-0000-4000-8000-0000000000d1"}'))$q$, 'wrong_state', 'request IDs: a reused ID gives a clear error, not a database error');

-- Bookings that staff enter for a customer don't count toward the customer's own limits.
reset role;
update public.business_settings set max_open_requests_per_customer = 2, max_requests_per_customer_per_day = 3 where id = 1;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.staff_create_booking(tst.booking('shop', tst.d(43), 600, '{"customer_id":"00000000-0000-4000-8000-0000000000e4","vehicle_size":"xl"}'));
select public.staff_create_booking(tst.booking('shop', tst.d(44), 600, '{"customer_id":"00000000-0000-4000-8000-0000000000e4","vehicle_size":"xl"}'));
select public.staff_create_booking(tst.booking('shop', tst.d(46), 600, '{"customer_id":"00000000-0000-4000-8000-0000000000e4"}'));
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e4');
set role authenticated;
select tst.ok(public.submit_booking(tst.booking('shop', tst.d(47), 600)) ->> 'id' is not null, 'caps: staff entries don''t use up the customer''s own limits');
reset role;
update public.business_settings set max_open_requests_per_customer = 30, max_requests_per_customer_per_day = 60 where id = 1;

-- Removing a customer clears notes on every one of their bookings, including
-- ones whose details were already removed.
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select public.cancel_booking(a.id) from public.appointments a
 where a.customer_id = '00000000-0000-4000-8000-0000000000e4' and a.status in ('requested', 'needs_information', 'confirmed', 'in_progress');
select tst.setv('e4b', (select a.id::text from public.appointments a where a.customer_id = '00000000-0000-4000-8000-0000000000e4' order by a.created_at limit 1));
select public.anonymize_booking(tst.getv('e4b')::uuid);
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select public.request_review(tst.getv('e4b')::uuid, 'Eve said her neighbor at 12 Oak St will hand over the keys.', true);
reset role;
select tst.ok(exists (select 1 from public.notifications where appointment_id = tst.getv('e4b')::uuid and body like '%12 Oak St%'), 'remove customer: (setup) a notice quotes the review text');
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select public.anonymize_customer('00000000-0000-4000-8000-0000000000e4');
reset role;
select tst.ok(not exists (select 1 from public.review_requests where appointment_id = tst.getv('e4b')::uuid and message <> '(removed)'), 'remove customer: notes on already-cleared bookings are cleared too');
select tst.ok(not exists (select 1 from public.notifications where appointment_id = tst.getv('e4b')::uuid and body is not null), 'remove customer: notices quoting them are cleared too');

-- When several bundles are made of the same services, the cheapest is recommended.
insert into public.services (code, kind, name, base_price_cents, duration_min, mobile_pct, sort)
values ('tier_test', 'bundle', 'Test Tier', 9499, 120, 7, 55);
insert into public.bundle_parts (bundle_id, part_id)
select b.id, x.id from public.services b, public.services x where b.code = 'tier_test' and x.code in ('ext_basic', 'int_basic');
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,bundle}', 'tier_test', 'recommend: the bundle that saves the most');
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,saves_cents}', '1499', 'recommend: with the larger saving');
update public.services set active = false where code = 'tier_test';
select tst.eq(public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"int_basic"}') #>> '{suggestion,bundle}', 'signature_combo', 'recommend: retired bundles are never recommended');

-- Nothing internal is open to the website.
select tst.ok(not has_function_privilege('authenticated', 'public.save_booking(public.appointments, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.save_booking(public.appointments, jsonb)', 'execute')
          and not has_function_privilege('authenticated', 'public.scrub_booking(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.read_booking_details(jsonb, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.notify_managers(text, text, text, uuid, boolean)', 'execute')
          and not has_function_privilege('authenticated', 'public.booking_for_update(uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.bootstrap_admin(text)', 'execute'), 'privileges: internal helpers can''t be called from the website');
select tst.eq((select string_agg(routine_name, ',' order by routine_name) from information_schema.routine_privileges
               where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')),
              'email_allowed,get_availability,get_calendar,get_public_settings,quote_booking', 'privileges: signed-out visitors reach only the five public functions');
