-- W-16 part 2: sending bookings. Limits, holds, lanes, caps, checks.
-- Customers: A d1, B d2, guest d3, C d4, D d5, E d6.

-- ---------------------------------------------------------------- who may book
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e1');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 600))$q$, 'phone_not_verified', 'booking: unconfirmed phone refused');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e2');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 600))$q$, 'phone_not_verified', 'booking: anonymous login refused');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e3');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 600))$q$, 'not_allowed', 'booking: turned-off account refused');
reset role;
select tst.login(gen_random_uuid());
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 600))$q$, 'phone_not_verified', 'booking: unknown login refused');

-- ---------------------------------------------------------------- customer A: a normal request, repeats
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.setv('a1', public.submit_booking(tst.booking('shop', tst.d(3), 600,
  '{"request_id":"11111111-1111-4111-8111-111111111111","special_request":"Please call when you arrive."}'))::text);
select tst.eq(tst.getv('a1')::jsonb ->> 'status', 'requested', 'booking: saved as a request');
select tst.eq(tst.getv('a1')::jsonb ->> 'total_cents', '9999', 'booking: driveway Signature Combo is $99.99');
select tst.eq(tst.getv('a1')::jsonb ->> 'duration_min', '120', 'booking: Signature Combo takes 120 minutes');
select tst.ok(tst.getv('a1')::jsonb ->> 'ref' ~ '^AD-[A-HJ-NP-Z2-9]{8}$', 'booking: reference format', tst.getv('a1')::jsonb ->> 'ref');
select tst.ok(not (tst.getv('a1')::jsonb ?| array['queue', 'review_reasons', 'contact_phone']), 'booking: receipt hides the lane and contact fields');
select tst.ok((tst.getv('a1')::jsonb ->> 'hold_expires_at')::timestamptz between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute', 'booking: holds its time for 24 hours');
select tst.eq(public.submit_booking(tst.booking('shop', tst.d(3), 600, '{"request_id":"11111111-1111-4111-8111-111111111111"}')) ->> 'id',
              tst.getv('a1')::jsonb ->> 'id', 'booking: the same request id returns the same booking');
select tst.eq(public.submit_booking(tst.booking('shop', tst.d(3), 600)) ->> 'id',
              tst.getv('a1')::jsonb ->> 'id', 'booking: the same booking again within 10 minutes returns the first');
select tst.eq(tst.q('select count(*) from public.my_bookings()'), '1', 'booking: my_bookings shows one booking');
select tst.ok(not exists (select 1 from public.my_bookings() b where b ?| array['queue', 'review_reasons', 'contact_phone', 'created_by']), 'my_bookings: no lane or internal fields');
select tst.ok((select (b ->> 'shop_address') is null from public.my_bookings() b limit 1), 'my_bookings: no owner address before confirmation');

-- ---------------------------------------------------------------- driveway: 2 at once; never with mobile
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d2');
set role authenticated;
select tst.setv('b1', public.submit_booking(tst.booking('shop', tst.d(3), 600, '{"vehicle_make":"Ford","vehicle_model":"F-150","vehicle_type":"truck"}')) ->> 'id');
select tst.ok(tst.getv('b1') is not null, 'driveway: a second car at the same time fits');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d3');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 660, '{"first_name":"Gina"}'))$q$, 'slot_unavailable', 'driveway: a third car at the same time is refused');
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(3), 690, '{"first_name":"Gina"}'))$q$, 'slot_unavailable', 'never both: mobile refused while driveway cars are booked');
select tst.ok(not (720 - 30 = any (public.get_availability(tst.d(3), 120, 'mobile'))), 'never both: open times agree');
select tst.ok(720 = any (public.get_availability(tst.d(3), 120, 'mobile')), 'never both: mobile opens when the driveway jobs end');
select tst.setv('g1', public.submit_booking(tst.booking('mobile', tst.d(3), 720, '{"first_name":"Gina","last_name":"Ray"}'))::text);
select tst.eq(tst.getv('g1')::jsonb ->> 'status', 'requested', 'guest: books with a confirmed phone');
select tst.eq(tst.getv('g1')::jsonb ->> 'mobile_cents', '700', 'mobile: Signature Combo +7% is $7.00');
select tst.eq(tst.getv('g1')::jsonb ->> 'total_cents', '10699', 'mobile: Signature Combo total $106.99');
select tst.eq(tst.q($q$select first_name || ' ' || last_name from public.profiles$q$), 'Gina Ray', 'guest: name saved to the profile');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(3), 720, '{"first_name":"Gina"}'))$q$, 'slot_unavailable', 'never both: driveway refused while a mobile job runs');

-- ---------------------------------------------------------------- mobile: 1 at once
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.setv('a2', public.submit_booking(tst.booking('mobile', tst.d(4), 600))::text);
select tst.ok(tst.getv('a2')::jsonb ->> 'id' is not null, 'mobile: first job booked');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d2');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(4), 630))$q$, 'slot_unavailable', 'mobile: a second job at the same time is refused');
select tst.setv('b2', public.submit_booking(tst.booking('mobile', tst.d(4), 720)) ->> 'id');
select tst.ok(tst.getv('b2') is not null, 'mobile: the next job can start when the first ends');

-- ---------------------------------------------------------------- spam field
select tst.setv('b3', public.submit_booking(tst.booking('mobile', tst.d(8), 600, '{"website":"http://cheap-pills.example"}'))::text);
select tst.eq(tst.getv('b3')::jsonb ->> 'status', 'requested', 'spam: looks like a normal request to the sender');
select tst.ok(tst.getv('b3')::jsonb ->> 'hold_expires_at' is not null, 'spam: receipt still shows a hold time');
reset role;
select tst.ok((select queue = 'spam' and hold_expires_at is null and 'hidden_field' = any (review_reasons)
               from public.appointments where id = (tst.getv('b3')::jsonb ->> 'id')::uuid), 'spam: saved to the Spam lane, holding no time');
select tst.ok(not exists (select 1 from public.notifications n join public.profiles p on p.id = n.recipient_id
                          where n.appointment_id = (tst.getv('b3')::jsonb ->> 'id')::uuid and p.role <> 'customer'), 'spam: the team isn''t notified');
select tst.login('00000000-0000-4000-8000-0000000000d4');
set role authenticated;
select tst.ok(public.submit_booking(tst.booking('mobile', tst.d(8), 600)) ->> 'id' is not null, 'spam: its time stays open for others');

-- ---------------------------------------------------------------- prices that wait for the owner
select tst.setv('c_xl', public.submit_booking(tst.booking('shop', tst.d(9), 600, '{"vehicle_size":"xl","vehicle_type":"truck","vehicle_make":"Ford","vehicle_model":"Raptor"}'))::text);
select tst.eq(tst.getv('c_xl')::jsonb ->> 'price_pending', 'true', 'XL: no price until the owner sets the extra cost');
select tst.ok(tst.getv('c_xl')::jsonb -> 'total_cents' = 'null'::jsonb, 'XL: total is empty');
select tst.eq(tst.getv('c_xl')::jsonb ->> 'pending_reasons', '["xl"]', 'XL: reason recorded');
select tst.setv('c_st', public.submit_booking(tst.booking('mobile', tst.d(9), 840, '{"stains":["heavy","pet"],"bundle":null,"interior":"int_deluxe"}'))::text);
select tst.eq(tst.getv('c_st')::jsonb ->> 'pending_reasons', '["stains"]', 'stains: heavy stains hold the price');
select tst.eq(tst.getv('c_st')::jsonb ->> 'value_cents', '13499', 'stains: menu value still recorded');
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(10), 600))$q$, 'too_many_requests', 'caps: a 4th open request is refused');

-- ---------------------------------------------------------------- service area and input checks (customer D)
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d5');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(5), 600, '{"address_zip":"75001"}'))$q$, 'outside_service_area', 'area: ZIP outside 10 miles refused');
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(5), 600, '{"address_zip":"7500"}'))$q$, 'invalid_input', 'area: malformed ZIP refused');
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(5), 600, '{"address":null}'))$q$, 'invalid_input', 'area: mobile needs an address');
select tst.err($q$select public.submit_booking('[]'::jsonb)$q$, 'invalid_input', 'checks: payload must be an object');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"request_id":"abc"}'))$q$, 'invalid_input', 'checks: bad request id');
select tst.err($q$select public.submit_booking(tst.booking('moon', tst.d(5), 600))$q$, 'invalid_input', 'checks: location must be mobile or shop');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600) || '{"service_date":"tomorrow"}')$q$, 'invalid_input', 'checks: bad date');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 615))$q$, 'invalid_input', 'checks: start off the 30-minute grid');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 1170))$q$, 'invalid_input', 'checks: start after 7 PM');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 540))$q$, 'invalid_input', 'checks: start before 10 AM');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"exterior":"ext_basic"}'))$q$, 'invalid_input', 'checks: bundle and single services together refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"bundle":null}'))$q$, 'invalid_input', 'checks: a main service is required');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"bundle":null,"addons":["steam_cleaning"]}'))$q$, 'invalid_input', 'checks: add-ons can''t be booked alone');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"bundle":null,"interior":"int_basic","addons":["steam_cleaning"]}'))$q$, 'not_bookable_yet', 'checks: steam not bookable until it has minutes');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"bundle":"deep_detail"}'))$q$, 'invalid_input', 'checks: retired or unknown services refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_type":null}'))$q$, 'invalid_input', 'checks: vehicle type required');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_type":"spaceship"}'))$q$, 'invalid_input', 'checks: vehicle type from the list');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_size":"huge"}'))$q$, 'invalid_input', 'checks: size Standard or XL');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_make":"visit www.spam.com"}'))$q$, 'invalid_input', 'checks: links refused in vehicle make');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_year":"19"}'))$q$, 'invalid_input', 'checks: year must be real');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"damage":["none","dents"]}'))$q$, 'invalid_input', 'checks: "no damage" is exclusive');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"damage":["other"]}'))$q$, 'invalid_input', 'checks: Other damage needs a description');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"conditions":["haunted"]}'))$q$, 'invalid_input', 'checks: conditions from the list');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"stains":["blood"]}'))$q$, 'invalid_input', 'checks: stains from the list');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"special_request":"see https://x.co"}'))$q$, 'invalid_input', 'checks: links refused in notes');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"vehicle_id":"00000000-0000-4000-8000-000000000999"}'))$q$, 'not_found', 'checks: someone else''s or unknown saved vehicle refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"photos":["00000000-0000-4000-8000-0000000000d1/0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b.jpg"]}'))$q$, 'invalid_input', 'photos: another person''s folder refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"photos":["00000000-0000-4000-8000-0000000000d5/../d1/x.jpg"]}'))$q$, 'invalid_input', 'photos: path tricks refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, '{"photos":["00000000-0000-4000-8000-0000000000d5/0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b.jpg"]}'))$q$, 'invalid_input', 'photos: a file that was never uploaded refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(5), 600, jsonb_build_object('photos', (select jsonb_agg('00000000-0000-4000-8000-0000000000d5/' || gen_random_uuid() || '.jpg') from generate_series(1, 7)))))$q$, 'invalid_input', 'photos: at most 6');
select tst.eq(tst.q('select count(*) from public.my_bookings()'), '0', 'checks: refused requests save nothing');

-- Lanes: "Not sure" alone stays in Requests (D-07); Unknown damage and junk go to Review.
select tst.setv('d1', public.submit_booking(tst.booking('mobile', tst.d(5), 600,
  '{"not_sure":true,"vehicle_description":"White work van, not sure of the model","vehicle_type":null,"vehicle_make":null,"vehicle_model":null,"address_zip":"75002-1234"}'))::text);
select tst.eq(tst.getv('d1')::jsonb #>> '{vehicle,not_sure}', 'true', 'not sure: accepted with a description');
select tst.eq(tst.getv('d1')::jsonb ->> 'address_zip', '75002', 'area: ZIP+4 accepted');
select tst.setv('d2', public.submit_booking(tst.booking('shop', tst.d(6), 600, '{"damage":["unknown"],"damage_note":"Something under the rear bumper"}'))::text);
select tst.setv('d3', public.submit_booking(tst.booking('shop', tst.d(7), 600, '{"vehicle_make":"asdf","vehicle_model":"qwer"}'))::text);
reset role;
select tst.eq((select queue::text from public.appointments where id = (tst.getv('d1')::jsonb ->> 'id')::uuid), 'requests', 'lanes: not sure stays in Requests');
select tst.eq((select queue::text || ':' || array_to_string(review_reasons, ',') from public.appointments where id = (tst.getv('d2')::jsonb ->> 'id')::uuid), 'review:damage', 'lanes: Unknown damage goes to Review');
select tst.eq((select queue::text || ':' || array_to_string(review_reasons, ',') from public.appointments where id = (tst.getv('d3')::jsonb ->> 'id')::uuid), 'review:unclear_vehicle', 'lanes: junk vehicle details go to Review');
select tst.ok((select count(*) = 2 from public.notifications n join public.profiles p on p.id = n.recipient_id
               where n.appointment_id = (tst.getv('d2')::jsonb ->> 'id')::uuid and p.role in ('manager', 'admin') and n.title = 'New request to review'), 'notices: managers and admin told about a Review request');
select tst.ok(exists (select 1 from public.notifications n where n.appointment_id = (tst.getv('d1')::jsonb ->> 'id')::uuid
                      and n.recipient_id = '00000000-0000-4000-8000-0000000000d5' and n.kind = 'request_received'), 'notices: customer told the request arrived');
select tst.ok((select contact_phone = '12145552022' and contact_first = 'Eli' and contact_email is null
               from public.appointments where id = (tst.getv('d1')::jsonb ->> 'id')::uuid), 'booking: contact details come from the confirmed login');

-- ---------------------------------------------------------------- names for logins without one (e4)
select tst.login('00000000-0000-4000-8000-0000000000e4');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(11), 600, '{"first_name":"Asdf"}'))$q$, 'invalid_input', 'names: junk first name refused at booking');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(11), 600))$q$, 'invalid_input', 'names: first name required when the profile has none');
select tst.ok(public.submit_booking(tst.booking('shop', tst.d(11), 600, '{"first_name":"Eve"}')) ->> 'id' is not null, 'names: a real first name is accepted');

-- ---------------------------------------------------------------- hours, window, closed days, short models (customer E)
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.eq((select max(x)::text from unnest(public.get_availability(tst.d(12), 210, 'shop')) x), '990', '8 PM: a 3.5-hour job starts by 4:30 PM at the latest');
select tst.eq((select max(x)::text from unnest(public.get_availability(tst.d(12), 60, 'shop')) x), '1140', '8 PM: a 1-hour job can start at 7 PM');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(12), 1020, '{"bundle":"full_detail"}'))$q$, 'slot_unavailable', '8 PM: a job that would end after 8 PM is refused');
select tst.eq(public.get_availability(tst.d(0), 60, 'shop')::text, '{}', 'window: no same-day times');
select tst.eq(public.get_availability(tst.d(61), 60, 'shop')::text, '{}', 'window: nothing beyond 60 days');
select tst.ok(cardinality(public.get_availability(tst.d(60), 60, 'shop')) = 19, 'window: day 60 is open, 19 start times');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(0), 600))$q$, 'slot_unavailable', 'window: same-day request refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(61), 600))$q$, 'slot_unavailable', 'window: request beyond 60 days refused');
reset role;
insert into public.blocked_days (day, reason) values (tst.d(42), 'Closed for a family event');
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.eq(public.get_availability(tst.d(42), 60, 'shop')::text, '{}', 'closed day: no times');
select tst.ok((select not available from public.get_calendar(tst.d(42), 1, 60, 'shop')), 'closed day: calendar shows it closed');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(42), 600))$q$, 'slot_unavailable', 'closed day: request refused');
select tst.setv('e1', public.submit_booking(tst.booking('shop', tst.d(13), 600, '{"vehicle_make":"Tesla","vehicle_model":"3"}'))::text);
reset role;
select tst.eq((select queue::text from public.appointments where id = (tst.getv('e1')::jsonb ->> 'id')::uuid), 'requests', 'short models: Tesla 3 stays in Requests');

-- ---------------------------------------------------------------- holds lapse; caps (customer A)
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.setv('a3', public.submit_booking(tst.booking('shop', tst.d(14), 600))::text);
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(15), 600))$q$, 'too_many_requests', 'caps: 3 open requests per customer');
reset role;
update public.appointments set hold_expires_at = now() - interval '1 minute' where id = (tst.getv('a2')::jsonb ->> 'id')::uuid;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.ok(630 = any (public.get_availability(tst.d(4), 60, 'mobile')), 'holds: a lapsed hold frees its time');
select tst.setv('a4', public.submit_booking(tst.booking('mobile', tst.d(4), 630, '{"bundle":null,"exterior":"ext_basic"}'))::text);
select tst.ok(tst.getv('a4')::jsonb ->> 'id' is not null, 'holds: a lapsed request no longer counts toward the cap');
reset role;
update public.appointments set hold_expires_at = now() - interval '1 minute' where id = (tst.getv('a1')::jsonb ->> 'id')::uuid;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.setv('a5', public.submit_booking(tst.booking('shop', tst.d(16), 600))::text);
reset role;
update public.appointments set hold_expires_at = now() - interval '1 minute' where id = (tst.getv('a5')::jsonb ->> 'id')::uuid;
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(17), 600))$q$, 'too_many_requests', 'caps: 5 new requests a day per customer');
select tst.ok((select (b ->> 'hold_expires_at') is not null from public.my_bookings() b where b ->> 'id' = tst.getv('a1')::jsonb ->> 'id'), 'holds: a lapsed request still shows its hold time');
reset role;

-- ---------------------------------------------------------------- photos (customer E)
-- Supabase refuses direct deletes from its storage tables unless the Storage
-- API's flag is set. The photo deletions below stand in for Storage API calls.
select set_config('storage.allow_delete_query', 'true', false);
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.ok(tst.q($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d6/1a2b3c4d-1111-4222-8333-444455556666.jpg') returning name$q$) not like 'ERROR%', 'photos: upload to own folder');
select tst.ok(tst.q($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d6/1a2b3c4d-1111-4222-8333-444455557777.png') returning name$q$) not like 'ERROR%', 'photos: second upload');
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d1/1a2b3c4d-1111-4222-8333-444455556666.jpg')$q$, '42501', 'photos: no uploads to another folder');
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d6/my-car.jpg')$q$, '42501', 'photos: random names only');
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000d6/1a2b3c4d-1111-4222-8333-444455558888.heic')$q$, '42501', 'photos: JPEG, PNG or WebP only');
select tst.setv('e2', public.submit_booking(tst.booking('shop', tst.d(18), 600, '{"photos":["00000000-0000-4000-8000-0000000000d6/1a2b3c4d-1111-4222-8333-444455556666.jpg"]}'))::text);
select tst.ok(tst.getv('e2')::jsonb ->> 'id' is not null, 'photos: booking with an uploaded photo');
select tst.eq(tst.q($q$with u as (update storage.objects set name = name || '.x' returning 1) select count(*) from u$q$), '0', 'photos: nobody can overwrite or rename');
select tst.eq(tst.q($q$with d as (delete from storage.objects where name like '%444455556666.jpg' returning 1) select count(*) from d$q$), '0', 'photos: attached photos can''t be deleted by the customer');
select tst.eq(tst.q($q$with d as (delete from storage.objects where name like '%444455557777.png' returning 1) select count(*) from d$q$), '1', 'photos: unattached photos can be deleted by the customer');
reset role;
select tst.ok((select photo_paths = array['00000000-0000-4000-8000-0000000000d6/1a2b3c4d-1111-4222-8333-444455556666.jpg']
               from public.appointments where id = (tst.getv('e2')::jsonb ->> 'id')::uuid), 'photos: path stored on the booking');
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '0', 'photos: other customers can''t see them');
reset role;
