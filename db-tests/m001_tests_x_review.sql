-- W-16 part 4: checks added after the independent review (Oct 3), plus the
-- review's test gaps: buffers, staff beyond 60 days, MFA on photos.
-- Runs last (uses data from the earlier parts).

-- ---------------------------------------------------------------- repeats compare the whole request
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d4');
set role authenticated;
select tst.setv('r1', public.submit_booking(tst.booking('shop', tst.d(30), 600)) ->> 'id');
select tst.ok(public.submit_booking(tst.booking('shop', tst.d(30), 600, '{"vehicle_make":"Ford","vehicle_model":"F-150","vehicle_type":"truck"}')) ->> 'id' <> tst.getv('r1'),
              'repeats: a different vehicle in the same slot is a new booking');
select tst.setv('r2', public.submit_booking(tst.booking('mobile', tst.d(31), 600, '{"address":"1 Oak St"}')) ->> 'id');
select tst.err($q$select public.submit_booking(tst.booking('mobile', tst.d(31), 600, '{"address":"2 Elm St"}'))$q$, 'slot_unavailable', 'repeats: a different address isn''t treated as a repeat');
select tst.setv('r3', public.submit_booking(tst.booking('mobile', tst.d(32), 600, '{"website":"x"}')) ->> 'id');
select tst.setv('r4', public.submit_booking(tst.booking('mobile', tst.d(32), 600)) ->> 'id');
select tst.ok(tst.getv('r4') <> tst.getv('r3'), 'repeats: a retry after a Spam hit is a new, normal booking');
reset role;
select tst.eq((select queue::text from public.appointments where id = tst.getv('r4')::uuid), 'requests', 'repeats: the retry is in Requests');
select tst.ok(exists (select 1 from public.notifications where appointment_id = tst.getv('r3')::uuid and kind = 'request_received'), 'spam: the sender still gets "Request received"');

-- ---------------------------------------------------------------- quote: one service per slot
select tst.err($q$select public.quote_booking('{"location_type":"shop","exterior":"ext_basic","interior":"ext_basic"}')$q$, 'invalid_input', 'quote: an exterior service can''t fill the interior slot');

-- ---------------------------------------------------------------- retiring a modification never blocks a vehicle
select tst.login('00000000-0000-4000-8000-0000000000d4');
set role authenticated;
select tst.setv('veh_c', tst.q($q$insert into public.vehicles (make, model, vehicle_type, modifications) values ('Subaru', 'WRX', 'sedan', '{wrap_ppf}') returning id$q$));
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq(tst.q($q$update public.form_options set active = false where list = 'modification' and code = 'wrap_ppf' returning code$q$), 'wrap_ppf', 'admin: retires a form choice');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d4');
set role authenticated;
select tst.eq(tst.q(format($q$update public.vehicles set color = 'Gray' where id = %L returning color$q$, tst.getv('veh_c'))), 'Gray', 'retired choice: the vehicle can still be edited');
select tst.eq(tst.q(format($q$update public.vehicles set modifications = '{wrap_ppf,carbon_fiber}' where id = %L returning array_length(modifications, 1)$q$, tst.getv('veh_c'))), '2', 'retired choice: kept, and a current choice added');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type, modifications) values ('Mini', 'Cooper', 'coupe', '{wrap_ppf}')$q$, 'invalid_input', 'retired choice: can''t be newly chosen');
select tst.ok(tst.q(format('select public.delete_my_vehicle(%L)', tst.getv('veh_c'))) not like 'ERROR%', 'retired choice: the vehicle can still be removed');
reset role;
update public.form_options set active = true where list = 'modification' and code = 'wrap_ppf';

-- ---------------------------------------------------------------- names: leaving out the last name keeps it
select tst.login('00000000-0000-4000-8000-0000000000d1');
set role authenticated;
select tst.eq((public.update_my_profile('Carla')).last_name, 'Diaz', 'profile: leaving out the last name keeps it');
select tst.ok((public.update_my_profile('Carla', '')).last_name is null, 'profile: an empty last name removes it');
select tst.eq((public.update_my_profile('Carla', 'Diaz')).last_name, 'Diaz', 'profile: last name restored');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type) values ('<b>Ford</b>', 'F-150', 'truck')$q$, '23514', 'text: angle brackets (HTML) refused');
select tst.err($q$select public.submit_booking(tst.booking('shop', tst.d(33), 600, '{"special_request":"<script>alert(1)</script>"}'))$q$, 'invalid_input', 'text: HTML refused in booking notes');

-- ---------------------------------------------------------------- uploads: customers with a confirmed phone only
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e1');
set role authenticated;
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000e1/3a2b3c4d-1111-4222-8333-444455550001.jpg')$q$, '42501', 'uploads: refused before the phone is confirmed');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000c1');
set role authenticated;
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000c1/3a2b3c4d-1111-4222-8333-444455550002.jpg')$q$, '42501', 'uploads: staff can''t upload in Migration 001');
select tst.eq(tst.q('select count(*) from public.business_settings'), '0', 'detailer: can''t read settings');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000e3');
set role authenticated;
select tst.err($q$insert into storage.objects (bucket_id, name) values ('vehicle-photos', '00000000-0000-4000-8000-0000000000e3/3a2b3c4d-1111-4222-8333-444455550003.jpg')$q$, '42501', 'uploads: refused for a turned-off account');
select tst.err($q$insert into public.vehicles (make, model, vehicle_type) values ('Ford', 'Focus', 'sedan')$q$, '42501', 'turned off: can''t save vehicles');

-- ---------------------------------------------------------------- photos need the authenticator step for staff powers
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal1');
set role authenticated;
select tst.eq(tst.q($q$select count(*) from storage.objects where bucket_id = 'vehicle-photos'$q$), '0', 'photos: a manager without the code sees none');
reset role;
select set_config('storage.allow_delete_query', 'true', false);   -- stands in for a Storage API delete
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal1');
set role authenticated;
select tst.eq(tst.q($q$with d as (delete from storage.objects where bucket_id = 'vehicle-photos' returning 1) select count(*) from d$q$), '0', 'photos: the admin without the code deletes nothing');

-- ---------------------------------------------------------------- staff beyond the customer window; shortening jobs
reset role;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq((public.set_booking_time(tst.getv('r1')::uuid, tst.d(75), 600)).service_date::text, tst.d(75)::text, 'staff: can move a booking beyond 60 days');
select tst.eq((public.confirm_booking(tst.getv('r1')::uuid)).status::text, 'confirmed', 'staff: can confirm beyond 60 days');
select tst.eq((public.start_booking(tst.getv('r1')::uuid)).status::text, 'in_progress', 'shorten: job started');
select tst.eq((public.set_booking_time(tst.getv('r1')::uuid, tst.d(75), 600, 90)).duration_min::text, '90', 'shorten: a started job can be made shorter');
select tst.err(format('select public.set_booking_time(%L, %L, 600, 150)', tst.getv('r1'), tst.d(75)), 'wrong_state', 'shorten: a started job can''t be made longer');
select tst.err(format('select public.set_booking_time(%L, %L, 660)', tst.getv('r1'), tst.d(75)), 'wrong_state', 'shorten: a started job can''t be moved');
reset role;
update public.appointments set service_date = tst.d(-1), status = 'confirmed' where id = tst.getv('r1')::uuid;
select tst.login('00000000-0000-4000-8000-0000000000b1', 'aal2');
set role authenticated;
select tst.eq((public.set_booking_time(tst.getv('r1')::uuid, tst.d(-1), 600, 60)).duration_min::text, '60', 'shorten: a past job can still be made shorter');
select tst.err(format('select public.set_booking_time(%L, %L, 600, 60)', tst.getv('r1'), tst.d(-2)), 'slot_unavailable', 'staff: can''t move a job into the past');

-- ---------------------------------------------------------------- buffers between jobs
reset role;
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.eq(tst.q($q$update public.business_settings set mobile_buffer_min = 30, shop_buffer_min = 15 returning mobile_buffer_min$q$), '30', 'buffers: admin sets travel and gap times');
reset role;
select tst.login('00000000-0000-4000-8000-0000000000d6');
set role authenticated;
select tst.setv('bf1', public.submit_booking(tst.booking('mobile', tst.d(34), 600)) ->> 'id');
select tst.eq((select min(x)::text from unnest(public.get_availability(tst.d(34), 60, 'mobile')) x where x > 600), '750', 'buffers: the next mobile job waits for the 30-minute travel time');
select tst.eq((select min(x)::text from unnest(public.get_availability(tst.d(34), 60, 'shop')) x where x > 600), '750', 'buffers: a driveway job waits for the travel time too');
select tst.eq((select max(x)::text from unnest(public.get_availability(tst.d(34), 60, 'shop')) x where x < 600), null, 'buffers: nothing before a 10 AM job');
select tst.setv('bf2', public.submit_booking(tst.booking('shop', tst.d(35), 600)) ->> 'id');
select tst.eq((select min(x)::text from unnest(public.get_availability(tst.d(35), 60, 'mobile')) x where x > 600), '750', 'buffers: a mobile job waits for the 15-minute driveway gap (next start on the grid)');
reset role;
update public.business_settings set mobile_buffer_min = 0, shop_buffer_min = 0 where id = 1;

-- ---------------------------------------------------------------- audit: private fields changed, values never stored
select tst.login('00000000-0000-4000-8000-0000000000a1', 'aal2');
set role authenticated;
select tst.ok(tst.q($q$update public.business_settings set shop_address = '99 New Address Rd, Parker, TX' returning 1$q$) = '1', 'audit: admin changes the private address');
select tst.ok(tst.q($q$select (new_value -> 'private_fields_changed')::text from public.audit_log where target_type = 'business_settings' order by id desc limit 1$q$) = '["shop_address"]', 'audit: the change is logged by field name');
select tst.ok(tst.q($q$select count(*) from public.audit_log where (coalesce(old_value::text, '') || coalesce(new_value::text, '')) like '%New Address%'$q$) = '0', 'audit: the address itself is never logged');

-- ---------------------------------------------------------------- removing a customer clears every note about them
select tst.ok(tst.q($q$select count(*) from (select public.cancel_booking(a.id) from public.appointments a
                    where a.customer_id = '00000000-0000-4000-8000-0000000000d3'
                      and a.status in ('requested', 'needs_information', 'confirmed', 'in_progress')) x$q$)::int > 0, 'remove customer: open bookings cancelled first');
select tst.ok(tst.q($q$select public.anonymize_customer('00000000-0000-4000-8000-0000000000d3')$q$) not like 'ERROR%', 'remove customer: guest removed');
reset role;
select tst.ok(not exists (select 1 from public.job_requests jr join public.appointments a on a.id = jr.appointment_id
                          where a.customer_id = '00000000-0000-4000-8000-0000000000d3' and jr.message is not null), 'remove customer: job request messages cleared');
select tst.ok((select bool_and(rr.message = '(removed)' and rr.resolution is null) from public.review_requests rr join public.appointments a on a.id = rr.appointment_id
               where a.customer_id = '00000000-0000-4000-8000-0000000000d3'), 'remove customer: review request text cleared');
select tst.ok(not exists (select 1 from public.notifications n join public.appointments a on a.id = n.appointment_id
                          where a.customer_id = '00000000-0000-4000-8000-0000000000d3' and n.body is not null), 'remove customer: staff notices about them cleared');

-- ---------------------------------------------------------------- logins can't be deleted before their details are removed
select tst.err($q$delete from auth.users where id = '00000000-0000-4000-8000-0000000000d2'$q$, 'wrong_state', 'delete login: refused before the details are removed');
select tst.ok(tst.q($q$with d as (delete from auth.users where id = '00000000-0000-4000-8000-0000000000d3' returning 1) select count(*) from d$q$) = '1', 'delete login: allowed after the details are removed');
select tst.ok((select count(*) > 0 and bool_and(customer_id is null and anonymized_at is not null) from public.appointments
               where id in (tst.getv('s1')::uuid, tst.getv('s4')::uuid, tst.getv('s7')::uuid)), 'delete login: the business records stay, anonymized');

-- ---------------------------------------------------------------- text checks with special characters
reset role;
select tst.ok(not public.is_clean_text('Great car ' || chr(128663)), 'text: emoji refused');
select tst.ok(not public.is_clean_text('sun ' || chr(9728)), 'text: symbol emoji refused');
select tst.ok(not public.is_clean_text('a' || chr(8205) || 'b'), 'text: zero-width joiner refused');
select tst.ok(public.is_clean_text('Rear bumper, 2" scratch; 50% faded'), 'text: ordinary punctuation accepted');
select tst.ok(public.is_valid_name('O' || chr(8217) || 'Brien'), 'names: curly apostrophe accepted');
select tst.ok(public.is_valid_name('José') and public.is_valid_name('Nguyễn') and public.is_valid_name('Zoë'), 'names: accented letters accepted');
select tst.ok(not public.is_valid_name('Bob1') and not public.is_valid_name('-Bob') and not public.is_valid_name('Bo@b'), 'names: digits and symbols refused');
